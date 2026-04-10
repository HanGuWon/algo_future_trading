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
npm run paper -- --db data/mnq-research.sqlite --start 2026-04-10T00:00:00.000Z
```

Expected CSV columns:

```text
tsUtc,contract,open,high,low,close,volume
```

Notes for real data:

- `tsUtc` may also be named `timestamp`.
- timestamps must be valid UTC timestamps and strictly increasing with no duplicates.
- OHLC values are validated for consistency before anything is written.
- `contract` is recommended for roll-aware research. If your CSV does not include it, use a fallback such as:

```bash
npm run ingest -- --file path/to/mnq_1m.csv --db data/mnq-research.sqlite --contract H26
```

## Notes

- `bars` are stored in SQLite with UTC timestamps and Chicago-session labels.
- The engine uses a back-adjusted research series for 1h features and raw execution bars for fills.
- `backtest` runs one config once; `walkforward` runs rolling train/validation/test windows and writes JSON artifacts.
- `paper` now keeps persistent account and order state in SQLite `paper_state` and resumes from the prior run.
- `paper` processes newly available bars only logically; it does not open duplicate signals once `lastProcessedSignalTs` has advanced.
- `paper` writes JSON report artifacts under `artifacts/paper/` by default, including:
  - current run metrics
  - cumulative paper metrics
  - daily realized performance rows
  - session-level performance rows
- `trades` are now tagged with a source so cumulative paper reports only use `PAPER` trades, not backtest inserts.
- Walk-forward artifacts are written under `artifacts/` by default and are ignored by git.
