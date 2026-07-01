# Finance · CNPJ

Financial control for the company (Lucro Presumido, exported software services):
USD remittances received, conversion/import to BRL, expenses, quarterly IRPJ/CSLL
assessment, and profit distribution.

Single-user app (owner only).

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

## Running with Docker

```bash
make up          # backend on :8090, frontend on :5173
```

1. Open the PocketBase **admin** at http://localhost:8090/_/ and create the superuser.
2. Under `Collections → users`, create the owner record (email + password).
3. Open the app at http://localhost:5173 and log in.

## Running locally (without Docker)

```bash
make backend     # :8090  (creates pb_data/ on first run)
make frontend    # :5173
make test        # tax engine tests
```

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
