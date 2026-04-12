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
npm run sync-calendars -- --out data/calendars/official-events.json --config config/strategies/session-filtered-trend-pullback-v1.json
npm run ingest -- --file path/to/mnq_1m.csv --db data/mnq-research.sqlite
npm run backtest -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json
npm run walkforward -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts
npm run artifacts -- --artifacts-dir artifacts
npm run artifacts -- --artifacts-dir artifacts --config-hash aaaaaaaa
npm run research -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts
npm run paper -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --start 2026-04-10T00:00:00.000Z
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
- strategy settings now live in `config/strategies/*.json`; every runtime command except `ingest` and `artifacts` accepts `--config <path>`.
- `config/strategies/session-filtered-trend-pullback-v1.json` is the default profile, and `config/strategies/session-filtered-trend-pullback-v1.research-tight.json` is an example override profile for stricter research runs.
- The engine uses a back-adjusted research series for 1h features and raw execution bars for fills.
- `backtest` runs one config once; `walkforward` runs rolling train/validation/test windows and writes JSON artifacts.
- `artifacts` scans the current artifact directory, builds `artifacts/index.json` and `artifacts/index.md`, and prints the latest paper/research/walk-forward summaries.
- `artifacts` also groups the latest `paper`, `research`, and `walkforward` outputs by strategy config hash so different parameter profiles can be compared safely.
- `artifacts --config-hash <prefix>` narrows the index to one config family and writes `artifacts/index-<prefix>.json|md`.
- `research` runs one bundled decision report over acceptance split, walk-forward OOS, sensitivity, and event-filter comparison.
- `paper` now keeps persistent account and order state in SQLite `paper_state` and resumes from the prior run.
- `paper` processes newly available bars only logically; it does not open duplicate signals once `lastProcessedSignalTs` has advanced.
- `paper` writes JSON report artifacts under `artifacts/paper/` by default, including:
  - matching Markdown summaries for quick human review
  - current run metrics
  - cumulative paper metrics
  - daily realized performance rows
  - session-level performance rows
- `research` writes JSON artifacts under `artifacts/research/` by default, including:
  - matching Markdown summaries for quick human review
  - fixed acceptance-split metrics
  - walk-forward OOS summary
  - parameter sensitivity ranking
  - event-filter scenario comparison
  - final recommendation
- `walkforward` now also writes a matching Markdown summary next to its JSON artifact.
- `trades` are now tagged with a source so cumulative paper reports only use `PAPER` trades, not backtest inserts.
- Walk-forward artifacts are written under `artifacts/` by default and are ignored by git.
