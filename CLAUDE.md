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
  `frontend/Dockerfile` is multi-stage: the default target is the production
  image (nginx serving the built SPA, ~78MB) and `--target dev` is the Vite dev
  server used by docker-compose. Both listen on 5173 and proxy `/api` and `/_`
  to `$BACKEND_URL`, so the two are interchangeable. CI pushes the default
  (nginx) target; the nginx proxy config lives in `frontend/nginx.conf.template`.

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
  src/pages/                    # Dashboard, Remittances, Imports, Expenses,
                                # ProfitDistributions, Taxes, Config, Export, Login
  src/lib/                      # pb (client + formatters), useCollection, types, theme
  src/components/               # ui primitives, Layout,
                                # OverviewSections (year strip + month cards of
                                # the landing page), charts (SVG chart kit)
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
`/Users/gabriel/Documents/Work/CNPJ/backup.json` (gitignored patterns cover it).
After tests that mutate data, reload it: Config → Dados → Importar backup →
Sobrescrever tudo (upload `backup.json`), or:

```bash
curl -s -X POST "http://localhost:8090/api/import/backup?mode=overwrite" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  --data-binary @/Users/gabriel/Documents/Work/CNPJ/backup.json
```

Regenerate it from the running DB: `GET /api/export/backup` piped to the file.

**`sample_data.json`** (in the repo root) is a small synthetic dataset in the same
format, for testing without touching real numbers. It covers both sides of the
R$50k thresholds: Feb/2026 invoices R$48.5k (below) and Mar/2026 R$63.5k (above),
Jan+Feb distributions below R$50k and Mar above (IRRF 10%). Import it the same way:

```bash
curl -s -X POST "http://localhost:8090/api/import/backup?mode=overwrite" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  --data-binary @sample_data.json
```

## Collections

`clients` (name, default_platform, monthly_amount, billing_type monthly|hourly,
pay_frequency monthly|weekly, active), `platforms` (name, active),
`remittances` (client→, platform, amount_usd, pay_day), `imports` (platform, amount_usd,
convert_day, rate, amount_brl), `expenses` (date, payee, category free text, amount, notes,
scheduled, paid, payment_type auto|manual),
`recurring_services` (name, category, exp_day, default_amount, payment_type auto|manual),
`profit_distributions` (month, amount, irrf),
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
  `profit_distributions.irrf` stores the IRRF **actually withheld** on that record
  (BRL) and is the **source of truth** for every "IRRF retido" total in the UI, so the
  real DARF can be recorded when it differs from the rule (rounding, correction,
  pre-2026 profits that stay exempt). The form pre-fills it with the computed 10% and
  the user may override; where the stored value diverges from the rule, the UI shows
  the expected one beside it instead of silently recomputing. The threshold and the
  10% apply to the **month as a whole**, so a month split across records is judged by
  its sum and each record carries its share. The old `cota_irrf` field (remaining
  tax-free quota, never read) was dropped by
  `migrations/1751900000_profit_distribution_irrf.go`, which backfills `irrf`; the
  remaining quota is now derived for display only. Reimporting a **pre-migration**
  backup leaves `irrf` at 0 (the old key no longer matches, by design, so a quota is
  never read back as a withholding) - re-enter the values or export a fresh backup.
- **Imports / cotação efetiva:** enter USD sent and BRL received; effective rate =
  BRL ÷ USD (embeds platform fees like Deel's). "Estimar pelo câmbio" pre-fills BRL
  from the market rate (AwesomeAPI).
- **FX quotes are third-party, so `/api/fx/usd-brl` tolerates failure.** AwesomeAPI has
  no quote on weekends/holidays, so a dated lookup asks for a window ending on that date
  and gets the previous business day back (the response `date` is the day the quote
  really belongs to, not the one requested). Transient failures (network, 5xx, 429) are
  retried. The undated "latest" lookup falls back to the last quote the process saw,
  flagged `"stale": true`, so the Dashboard card never blanks out; a **dated** lookup has
  no safe fallback (it feeds a stored `amount_brl`) and still returns 502.
- **Notas fiscais R$50k:** it is the accounting fee tier threshold, not a legal cap.
  Contador's table: ≤R$50k → R$295/mês; R$50k–100k → R$444; R$100k–1M → R$622; >R$1M → R$918.
- **Recurring services** (`recurring_services`) have a due day; on the Dashboard a
  service shows red "atrasado" if past its day with no matching expense that month.
  Matching is by payee: an expense whose `payee` equals the service name marks it paid
  (`expenseMatchesService`); the `category` is still accepted for the same match because
  that is how they matched before expenses had a payee. A service may carry its own
  `category`, which is the one given to the expense it posts; empty falls back to the
  service name. Services carry `payment_type` (auto|manual); a
  **manual** one is registered by clicking "Registrar" (Despesas) or "+ Despesa". An
  **auto** one posts its expense automatically on the due date: `autoRegisterAutoServices`
  in `api/autoregister.go` runs on startup and daily (cron 06:00), creating a paid expense
  (payee = service name, category = service category, amount = default_amount) for the
  current month once `exp_day` is reached, skipping any already recorded. Only the current month is handled. The same
  routine also marks any **scheduled expense** with `payment_type=auto` (a "despesa a pagar"
  the user set to automatic) as paid once its date is reached (`autoPayScheduledAutoExpenses`).
  Both can be triggered manually via `POST /api/maintenance/auto-register` (Config → Rotinas →
  "Rodar agora"), which returns `{created, paid}`.
- **Despesa: recebedor x categoria.** `expenses.payee` ("Recebedor") is who was paid
  ("Unimed"); `category` is what groups it ("Health insurance") and is what the Dashboard
  breakdown and the recurring-service matching aggregate on. Both are free text and the
  form suggests what is already in the data. `payee` is optional: records saved before it
  existed show the category as their label (`expenseLabel` in `lib/types.ts`).
- **Future expenses:** an expense created as "a pagar" gets `scheduled=true` and its
  `date` is the due date; it shows in the Dashboard "Próximos pagamentos" card and is
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
- **Dashboard (`/`)** is the single landing page (the old "Visão geral" was merged into
  it): a KPI strip for the year (the only full-width block), then one cell per subject
  pairing the month's card with the chart that tells the same story (what is due above
  the quarterly DARF, the R$50k invoice meter above monthly revenue, ...), most urgent
  first. Every card shares one height and every chart another, and the chart is pinned
  to the bottom of its cell, so the rows line up and no list has to scroll. No section
  headers or collapse: the subtitle names the period and every month card repeats it.
  The cards live in `components/OverviewSections.tsx`, one component each so the page
  can interleave them. Creating records is not a button row on the page: each sidebar
  entry that owns a collection carries a "+" that only shows while the pointer is on
  that row (or the button has keyboard focus) and opens the page with `?new=1`.
  It is kept dense on purpose: a number that needs a paragraph of context (the R$600k
  IRRF quota, the quarterly assessment) is a hint here and gets the full explanation on
  its own page.
- **Config → Dados** holds everything about the data itself: backup JSON, CSV per
  collection and the link to the PocketBase Admin (`/_/`).
- **Charts** are hand-rolled SVG in `components/charts.tsx` (columns grouped/stacked,
  horizontal bars, line), no chart library. Each one ships a hover/focus tooltip and a
  "Tabela" view, so no value is reachable only by hovering. Series colors come from the
  `--viz-*` custom properties in `index.css`; the current USD/BRL quote rides the
  effective-rate line as a reference rule instead of a card of its own. Hues are stepped per theme (not flipped)
  and were validated for colorblind separation and contrast against the card surfaces,
  so add a series by taking the next slot, never by inventing a hue.
- No em dashes in written output.
