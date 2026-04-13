# MNQ Research / Paper Bot

[![CI](https://github.com/HanGuWon/algo_future_trading/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HanGuWon/algo_future_trading/actions/workflows/ci.yml)

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
npm run ingest -- --dir data/mnq_drop --db data/mnq-research.sqlite
npm run backtest -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json
npm run walkforward -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts
npm run artifacts -- --artifacts-dir artifacts
npm run artifacts -- --artifacts-dir artifacts --config-hash aaaaaaaa
npm run artifacts -- --artifacts-dir artifacts --kind paper
npm run artifacts -- --artifacts-dir artifacts --kind daily
npm run artifacts -- --artifacts-dir artifacts --kind daily --min-escalation attention
npm run artifacts -- --artifacts-dir artifacts --kind ops
npm run artifacts -- --artifacts-dir artifacts --gate-pass-only
npm run artifacts -- --artifacts-dir artifacts --sort-by net_pnl
npm run artifacts -- --artifacts-dir artifacts --latest-only
npm run artifacts -- --artifacts-dir artifacts --limit 5
npm run research -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts
npm run paper -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --start 2026-04-10T00:00:00.000Z
npm run batch -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts
npm run batch -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts --input-dir data/mnq_drop
npm run daily -- --db data/mnq-research.sqlite --config config/strategies/session-filtered-trend-pullback-v1.json --artifacts-dir artifacts --input-dir data/mnq_drop
npm run ops -- --artifacts-dir artifacts
npm run ops -- --artifacts-dir artifacts --min-escalation attention
npm run ops-report -- --artifacts-dir artifacts --min-escalation attention
npm run ops-compare -- --artifacts-dir artifacts --min-escalation attention
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

Directory ingest notes:

- `ingest --dir <folder>` scans only `.csv` files and processes them in filename order.
- already processed files with the same path, size, modified time, and content hash are skipped.
- if a previously processed file changes in place, ingest fails and records the file as `failed` in SQLite `ingestion_files`.
- the intended operating model is append-only drops: corrections should arrive as new files, not in-place edits.

## Notes

- `bars` are stored in SQLite with UTC timestamps and Chicago-session labels.
- strategy settings now live in `config/strategies/*.json`; every runtime command except `ingest` and `artifacts` accepts `--config <path>`.
- `config/strategies/session-filtered-trend-pullback-v1.json` is the default profile, and `config/strategies/session-filtered-trend-pullback-v1.research-tight.json` is an example override profile for stricter research runs.
- The engine uses a back-adjusted research series for 1h features and raw execution bars for fills.
- `backtest` runs one config once; `walkforward` runs rolling train/validation/test windows and writes JSON artifacts.
- `artifacts` scans the current artifact directory, builds `artifacts/index.json` and `artifacts/index.md`, and prints the latest paper/research/walk-forward/batch summaries.
- `artifacts` also groups the latest `paper`, `research`, `walkforward`, `batch`, `daily`, `ops`, and `ops-compare` outputs by strategy config hash so different parameter profiles can be compared safely.
- `artifacts --config-hash <prefix>` narrows the index to one config family and writes `artifacts/index-<prefix>.json|md`.
- `artifacts --kind paper|research|walkforward|batch|daily|ops|ops-compare` narrows the index to one artifact class and can be combined with `--config-hash`.
- `artifacts --kind daily --min-escalation attention|critical` keeps only daily artifacts whose escalation level meets that threshold.
- `artifacts --gate-pass-only` keeps only config groups whose latest research artifact passes the built-in research gates.
- `artifacts --sort-by generated_at|net_pnl|expectancy` changes how config groups are ranked in the grouped summary.
- `artifacts --latest-only` shows only the newest config group in the grouped summary while keeping overall counts intact.
- `artifacts --limit N` truncates the grouped config-hash section to the first `N` profiles after sorting by newest artifact activity.
- `research` runs one bundled decision report over acceptance split, walk-forward OOS, sensitivity, and event-filter comparison.
- `research` now records conservative quality gates and only promotes a rule set to `continue_paper` when those gates pass.
- `paper` now keeps persistent account and order state in SQLite `paper_state` and resumes from the prior run.
- `paper` processes newly available bars only logically; it does not open duplicate signals once `lastProcessedSignalTs` has advanced.
- `paper` writes JSON report artifacts under `artifacts/paper/` by default, including matching Markdown summaries, current run metrics, cumulative paper metrics, daily realized performance rows, and session-level performance rows.
- `research` writes JSON artifacts under `artifacts/research/` by default, including matching Markdown summaries, fixed acceptance-split metrics, walk-forward OOS summary, parameter sensitivity ranking, event-filter scenario comparison, and final recommendation.
- `walkforward` now also writes a matching Markdown summary next to its JSON artifact.
- `paper`, `research`, and `walkforward` artifacts all record run provenance: git commit, Node version, DB path, event window count, input mode/path, and source range.
- `batch` chains `sync-calendars`, optional `ingest`, `paper`, `research`, and `artifacts`, then writes a JSON summary under `artifacts/batch/`.
- `batch --input-dir <folder>` uses incremental directory ingest and records a daily intake summary: scanned files, new files, skipped files, failed files, inserted bars, and source range.
- `daily` wraps `batch`, evaluates the latest `batch`, `paper`, and `research` artifacts, and writes `artifacts/daily/daily-run-*.json|md`.
- `daily` classifies each run as `OK`, `WARN`, or `FAIL` using stable warning codes such as `NO_NEW_FILES`, `NO_NEW_PAPER_TRADES`, `RESEARCH_GATE_FAILED`, `STALE_SOURCE_RANGE`, and `BATCH_FAILED`.
- `daily` also records a rolling operations-history snapshot over the latest 14 daily artifacts: status counts, fail streak, non-OK streak, latest OK/FAIL timestamps, and warning-code frequency.
- `daily` and `ops` now also compute an escalation level:
  - `CRITICAL` for repeated fail streaks or any research-gate regression in recent history
  - `ATTENTION` for persistent non-OK runs or repeated no-data / stale-data conditions
  - `NONE` when recent history does not require intervention
- `daily` exits `0` for `OK` and `WARN`, and exits non-zero only for `FAIL`.
- `ops` is a read-only command that prints the same recent operations-history block without running `batch`.
- `ops --min-escalation attention|critical` appends only the recent runs that meet the requested escalation threshold.
- `ops-report` writes `artifacts/ops/ops-report-*.json|md` so intervention candidates can be reviewed later without rerunning `daily`.
- `ops-compare` writes `artifacts/ops/ops-compare-*.json|md` and groups repeated intervention candidates by config, warning code, failed step, and recommendation.
- `FAIL` streak counts only trailing `FAIL` runs; non-OK streak counts trailing `WARN` or `FAIL` runs.
- ingest file history is stored in SQLite `ingestion_files` so daily reruns remain idempotent.
- `trades` are now tagged with a source so cumulative paper reports only use `PAPER` trades, not backtest inserts.
- Walk-forward artifacts are written under `artifacts/` by default and are ignored by git.

## Codex Automation

Recommended local automation target:

```text
Name: MNQ Daily Run
Schedule: Every day at 06:00 Asia/Seoul
CWD: C:\Users\한구원\Desktop\algo_future_trading
Command: npm run daily -- --db "data/mnq-research.sqlite" --config "config/strategies/session-filtered-trend-pullback-v1.json" --artifacts-dir "artifacts" --input-dir "data/mnq_drop"
```

The `daily` summary is the intended automation output. It includes overall status, batch status, failed step, warning codes, ingestion counts, inserted bars, source range, paper new trades, research recommendation, research gate pass, latest artifact paths, and a short operations-history block. Use `ops --min-escalation attention` for immediate triage, `ops-report --min-escalation attention` for a saved candidate snapshot, and `ops-compare --min-escalation attention` for recurrence analysis.
