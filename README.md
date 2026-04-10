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
npm run walkforward -- --db data/mnq-research.sqlite --artifacts-dir artifacts
```

Expected CSV columns:

```text
tsUtc,contract,open,high,low,close,volume
```

## Notes

- `bars` are stored in SQLite with UTC timestamps and Chicago-session labels.
- The engine uses a back-adjusted research series for 1h features and raw execution bars for fills.
- `backtest` runs one config once; `walkforward` runs rolling train/validation/test windows and writes JSON artifacts.
- `paper` still reuses the current backtest loop and is not yet a stateful live-session simulator.
- Walk-forward artifacts are written under `artifacts/` by default and are ignored by git.
