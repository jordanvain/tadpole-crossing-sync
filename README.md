# Tadpole Crossing — Accounting Sync

Automated data sync from Ricochet Consignment to Wave Accounting.

## What it does
- Extracts sales, consigner payouts, and inventory data from Ricochet
- Transforms and maps the data to Wave Accounting format
- Creates transactions, invoices, and expenses in Wave automatically
- Runs on schedule or on-demand

## Setup
1. Clone this repo
2. Copy `.env.example` to `.env` and fill in credentials
3. `npm install`
4. `npm run sync` — run a one-time sync
5. `npm run sync:watch` — run on schedule

## Architecture
Ricochet (browser/export) → Transform → Wave (API/import)

## Project Structure
```
src/
├── index.ts          # Main entry point
├── ricochet/         # Ricochet data extraction
│   ├── client.ts     # Browser automation client (Playwright)
│   └── types.ts      # Ricochet data types
├── wave/             # Wave Accounting integration
│   ├── client.ts     # Wave GraphQL API client
│   └── types.ts      # Wave data types
├── transform/        # Data transformation layer
│   └── mapper.ts     # Map Ricochet → Wave format
├── sync/             # Sync orchestration
│   └── engine.ts     # Sync logic, dedup, scheduling
└── utils/
    ├── logger.ts     # Logging (Winston)
    └── config.ts     # Configuration (dotenv)
```

## Environment Variables
See `.env.example` for all required configuration.

## Scripts
| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm run sync` | Run a one-time sync |
| `npm run sync:watch` | Run on schedule (cron) |
| `npm run dev` | Run in dev mode with ts-node |
| `npm test` | Run test suite |

## Docs
- [Data Mapping](docs/DATA_MAPPING.md) — how Ricochet fields map to Wave
