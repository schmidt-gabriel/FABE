# CLAUDE.md

Guidance for working in this repository.

## What this is

Single-user financial control app for a Brazilian PJ that exports
software/programming services to US clients, receives in USD, brings the money
into BRL, and pays taxes under **Lucro Presumido**. Used only by the owner.

## Stack

- **Backend:** Go + [PocketBase](https://pocketbase.io) used as a framework (embedded
  SQLite, auth, REST/realtime). One binary. Custom business logic lives in Go.
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 + TanStack Query +
  react-router. PocketBase JS SDK for data.
- **Deploy:** Docker Compose (backend `:8090`, frontend `:5173`).

## Monorepo layout

```
backend/
  main.go                       # PocketBase entry; serves the SPA from ./pb_public
  migrations/                   # Go migrations (schema + seed), applied on startup
  internal/
    tax/                        # Lucro Presumido engine (pure) + tests
    fx/                         # USD/BRL rate client (AwesomeAPI) + tests
    api/                        # custom endpoints + record hooks
      tax.go                    # /api/tax/compute, /api/tax/lock|unlock, /api/fx, Register()
      tax_periods.go            # quarterly assessment + auto-lock state machine
      export.go                 # /api/export/* and /api/import/backup
      autoregister.go           # auto-debited recurring services post their expense
frontend/
  src/pages/                    # Overview, Remittances, Imports, Expenses,
                                # ProfitDistributions, Taxes, Config, Export, Login
  src/lib/                      # pb (client + formatters), useCollection, types, theme
  src/components/               # ui primitives, Layout
docker-compose.yml, Makefile      # data backup lives OUTSIDE the repo (see below)
```

## Running

```bash
make up          # docker: backend :8090 + frontend :5173
make backend     # local: go run . serve --http=127.0.0.1:8090
make frontend    # local: vite dev :5173
make test        # backend tests (tax, fx)
```

Login (single account): on a fresh DB, PocketBase prints a `pbinstall` link on
startup (replace `0.0.0.0` with `localhost`) to create the first **superuser**.
That same email/password logs into both the admin (`:8090/_/`) and the app UI
(`:5173`): the frontend authenticates against `_superusers` directly (see
`Login.tsx`). There is no separate `users` account. CLI alternative:
`docker compose exec backend /app/fin superuser upsert EMAIL PASS`.

To skip that step entirely, set **`MASTER_EMAIL`** and **`MASTER_PASSWORD`** env
vars: on every startup `main.go` upserts a superuser with those credentials
(password kept in sync). Handy for a fresh deploy; leave unset to disable.

### Working with data / resetting

Real data (2023-2026) lives outside the repo in
`/Users/gabriel/Code/Personal/backup.json` (gitignored patterns cover it). After
tests that mutate data, reload it: Config → Dados → Importar backup →
Sobrescrever tudo (upload `backup.json`), or:

```bash
curl -s -X POST "http://localhost:8090/api/import/backup?mode=overwrite" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/Users/gabriel/Code/Personal/backup.json
```

Regenerate it from the running DB: `GET /api/export/backup` piped to the file.

## Collections

`clients` (name, default_platform, monthly_amount, billing_type monthly|hourly,
pay_frequency monthly|weekly, active), `platforms` (name, active),
`remittances` (client→, platform, amount_usd, pay_day), `imports` (platform, amount_usd,
convert_day, rate, amount_brl), `expenses` (date, category free text, amount, notes, scheduled,
paid, payment_type auto|manual),
`recurring_services` (name, exp_day, default_amount, payment_type auto|manual),
`profit_distributions` (month, amount, cota_irrf),
`tax_periods` (year, quarter, snapshot fields, locked), `settings` (singleton, tax params).

Platform is free text sourced from the `platforms` collection (not a fixed enum), so
new platforms can be added in Config.

## Domain rules (important)

- **Exported service → PIS/COFINS exempt.** Only IRPJ, CSLL, INSS (pró-labore) and IRRF
  on distributed profits are paid, all via DARF.
- **IRPJ:** tiered presumption. 16% on the first R$120k of yearly revenue, 32% above;
  then IRPJ = base × 15% + 10% surtax on quarterly base over R$60k.
- **CSLL:** always 32% presumption × 9%.
- Revenue base = sum of `imports.amount_brl` per quarter (by `convert_day`).
- Rates live in `settings` (editable). The engine is covered by unit tests in
  `backend/internal/tax`.
- **Quarterly DARF due date:** last business day of the month after the quarter end
  (T1→30/04, T2→31/07, T3→31/10, T4→31/01). Quarters auto-lock on their due date
  (snapshot frozen); "Destravar" reopens for correction. No manual pre-locking.
- **IRRF alta renda (Lei 15.270/2025, from 2026 on):** profit distribution above
  R$50k/month to the same PF is taxed 10% on the **full month's amount** (DARF cód. 1841).
  Refundable in the annual IRPF if total yearly income stays below R$600k. Profits
  accrued through 2025 are exempt. Only applies to years >= 2026.
- **Imports / cotação efetiva:** enter USD sent and BRL received; effective rate =
  BRL ÷ USD (embeds platform fees like Deel's). "Estimar pelo câmbio" pre-fills BRL
  from the market rate (AwesomeAPI).
- **Notas fiscais R$50k:** it is the accounting fee tier threshold, not a legal cap.
  Contador's table: ≤R$50k → R$295/mês; R$50k–100k → R$444; R$100k–1M → R$622; >R$1M → R$918.
- **Recurring services** (`recurring_services`) have a due day; on the Overview a
  service shows red "atrasado" if past its day with no matching expense that month.
  Matching is by category: an expense whose `category` equals the service name marks it
  paid, which is why `expenses.category` is free text (the frontend suggests the known
  categories plus the service names). Services carry `payment_type` (auto|manual); a
  **manual** one is registered by clicking "Registrar" (Despesas) or "+ Despesa". An
  **auto** one posts its expense automatically on the due date: `autoRegisterAutoServices`
  in `api/autoregister.go` runs on startup and daily (cron 06:00), creating a paid expense
  (category = service name, amount = default_amount) for the current month once `exp_day`
  is reached, skipping any already recorded. Only the current month is handled.
- **Future expenses:** an expense created as "a pagar" gets `scheduled=true` and its
  `date` is the due date; it shows in the Overview "Próximos pagamentos" card and is
  excluded from expense totals until `paid=true`. `scheduled` stays true after payment
  so the card keeps showing it as "pago". Regular expenses (`scheduled=false`) are
  always treated as paid.
- **One-off taxes** (TFE, IPTU, DARF avulso, ...) are plain expenses, not a separate
  collection: create them in Despesas, as "a pagar" when still due. The old
  `other_taxes` collection was dropped (its records were converted to expenses by
  `migrations/1751890000_drop_other_taxes.go`). The Impostos page only covers the
  quarterly IRPJ/CSLL assessment.

## Conventions

- **Code in English** (identifiers, comments, technical strings). UI text and docs in PT.
- Regime terms stay as-is (Lucro Presumido, IRPJ, CSLL, DARF, pró-labore).
- Tax parameters and limits are configurable/constants, never guessed from memory; the
  real DARFs are the source of truth.
- After changing collections, add a Go migration under `backend/migrations/` (applied on
  startup). To change a field type, remove + re-add (data in that column is dropped;
  reimport `backup.json`).
- Dates are stored as PocketBase datetimes; the UI works with calendar dates and uses
  **local** time for "current month" logic (not UTC).
- No em dashes in written output.
