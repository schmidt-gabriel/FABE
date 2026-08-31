# FABE

**Financial app for Brazilian Dev exporters.** Financial control for a Brazilian
company under Lucro Presumido that exports software services: USD remittances
received, conversion/import to BRL, expenses, quarterly IRPJ/CSLL assessment, and
profit distribution.

Single-user app (owner only). The UI still calls itself "Finance · CNPJ" /
"Finance · PF", which is the product name on screen.

## Stack

- **Backend:** Go + [PocketBase](https://pocketbase.io) (used as a framework) —
  embedded SQLite, auth, REST/realtime, and business endpoints (tax computation,
  FX rate, data export).
- **Frontend:** React + TypeScript + Vite + Tailwind v4 + TanStack Query.

## Monorepo

```
.
├── backend/         # PocketBase + Go (collections, migrations, tax engine)
│   ├── main.go
│   ├── migrations/  # schema + seed (Go migrations)
│   └── internal/
│       ├── tax/     # Lucro Presumido engine + tests
│       ├── fx/      # USD/BRL exchange rate client (AwesomeAPI)
│       └── api/     # custom endpoints (/api/tax, /api/fx, /api/export)
├── frontend/        # SPA (Vite)
├── docker-compose.yml
└── Makefile
```

## Login (all setups)

Single account: the app authenticates directly against PocketBase's superuser.
There is no separate `users` collection. Create the login in any of these ways:

- **Env vars (recommended for a fresh deploy):** set `FABE_MASTER_EMAIL` and
  `FABE_MASTER_PASSWORD`. On every startup the backend upserts a superuser with those
  credentials (password kept in sync), so you can log in right away.
- **CLI:** `cd backend && go run . superuser upsert EMAIL PASS` (local), or
  `docker compose exec backend /app/fin superuser upsert EMAIL PASS` (Docker).
- **Install link:** on a fresh DB the backend prints a one-time `pbinstall` link
  on startup; open it (replace `0.0.0.0` with `localhost`) to create the superuser
  at http://localhost:8090/_/.

The same email/password logs into both the PocketBase admin (`:8090/_/`) and the
app UI.

## Deploy

### Docker Compose (local stack)

```bash
# optional: auto-create the login on startup
export FABE_MASTER_EMAIL=you@example.com FABE_MASTER_PASSWORD=change-me

make up           # docker compose up --build -d  (backend :8090, frontend :5173)
make logs         # follow logs
make down         # stop the stack
```

Then open the app at http://localhost:5173 and log in (see **Login** above).

### Local (without Docker)

```bash
make backend      # :8090  (creates pb_data/ on first run)
make frontend     # :5173  (installs deps, then Vite dev)
make test         # tax engine tests
```

Create the login with `make admin EMAIL=.. PASS=..`, or export
`FABE_MASTER_EMAIL`/`FABE_MASTER_PASSWORD` before `make backend`.

## Tax parameters

Rates live in the `settings` collection (editable, no code changes):

| Field | Default | Notes |
|---|---|---|
| `irpj_presumption_reduced` | 0.16 | presumption up to the annual revenue limit |
| `irpj_presumption_standard` | 0.32 | presumption above the limit |
| `irpj_reduced_annual_limit` | 120000 | revenue/year under the reduced presumption |
| `irpj_rate` | 0.15 | IRPJ rate |
| `irpj_adicional_rate` | 0.10 | surtax over base > quarterly threshold |
| `irpj_adicional_threshold` | 60000 | quarterly base exempt from the surtax |
| `csll_presumption` | 0.32 | CSLL presumption (always full) |
| `csll_rate` | 0.09 | CSLL rate |

> Validated against the real DARFs (period 31/12/2025: IRPJ R$5,760.66 / CSLL
> R$3,456.39). PIS/COFINS are exempt because this is a service export.

## Data export

Exports are available for backup and for migrating to another database:

- **CSV per collection** — `GET /api/export/{collection}.csv`
- **Full JSON dump** — `GET /api/export/all.json` (all collections, portable)

Both are reachable from the app's **Exportar** page.
