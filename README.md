# MNQ Research / Paper Bot

TypeScript/Node scaffold for a CME-only `MNQ` research and paper-trading bot derived from a discretionary futures-trading framework.

## Scope

- Historical research and walk-forward backtesting
- Official-event blackout handling for FOMC, CPI, and Employment
- Session-filtered trend/pullback strategy on `MNQ`
- Paper-order simulation with hard stops, partial exits, and session flattening

## Quick Start

```bash
npm install
npm run sync-calendars -- --out data/calendars/official-events.json
npm run ingest -- --file path/to/mnq_1m.csv --db data/mnq-research.sqlite
npm run backtest -- --db data/mnq-research.sqlite
```

Expected CSV columns:

```text
tsUtc,contract,open,high,low,close,volume
```

## Notes

- `bars` are stored in SQLite with UTC timestamps and Chicago-session labels.
- The engine uses a back-adjusted research series for 1h features and raw execution bars for fills.
- The first production path is paper trading only. Live execution is intentionally excluded.
