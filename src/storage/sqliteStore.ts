import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Bar, EventWindow, PersistedPaperState, Timeframe, TradeRecord } from "../types.js";

export class SqliteStore {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bars (
        symbol TEXT NOT NULL,
        contract TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        ts_utc TEXT NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        session_label TEXT NOT NULL,
        PRIMARY KEY (symbol, contract, timeframe, ts_utc)
      );
      CREATE TABLE IF NOT EXISTS event_windows (
        event_type TEXT NOT NULL,
        start_utc TEXT NOT NULL,
        end_utc TEXT NOT NULL,
        severity TEXT NOT NULL,
        blocked INTEGER NOT NULL,
        source TEXT NOT NULL,
        notes TEXT,
        PRIMARY KEY (event_type, start_utc, end_utc)
      );
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        contract TEXT NOT NULL,
        side TEXT NOT NULL,
        qty INTEGER NOT NULL,
        entry_ts TEXT NOT NULL,
        exit_ts TEXT NOT NULL,
        entry_px REAL NOT NULL,
        exit_px REAL NOT NULL,
        stop_px REAL NOT NULL,
        target_px REAL NOT NULL,
        fees_usd REAL NOT NULL,
        slippage_usd REAL NOT NULL,
        pnl_usd REAL NOT NULL,
        exit_reason TEXT NOT NULL,
        version TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paper_state (
        strategy_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        state_json TEXT NOT NULL,
        processed_through_utc TEXT,
        updated_at_utc TEXT NOT NULL,
        PRIMARY KEY (strategy_id, symbol)
      );
    `);
  }

  insertBars(timeframe: Timeframe, bars: Bar[]): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO bars (
        symbol, contract, timeframe, ts_utc, open, high, low, close, volume, session_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const bar of bars) {
      statement.run(
        bar.symbol,
        bar.contract,
        timeframe,
        bar.tsUtc,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.sessionLabel
      );
    }
  }

  getBars(symbol: string, timeframe: Timeframe, startUtc?: string, endUtc?: string): Bar[] {
    const clauses = ["symbol = ?", "timeframe = ?"];
    const params: Array<string | number> = [symbol, timeframe];
    if (startUtc) {
      clauses.push("ts_utc >= ?");
      params.push(startUtc);
    }
    if (endUtc) {
      clauses.push("ts_utc <= ?");
      params.push(endUtc);
    }
    const statement = this.db.prepare(`
      SELECT symbol, contract, ts_utc, open, high, low, close, volume, session_label
      FROM bars
      WHERE ${clauses.join(" AND ")}
      ORDER BY ts_utc ASC
    `);
    return statement.all(...params).map((row) => ({
      symbol: String(row.symbol),
      contract: String(row.contract),
      tsUtc: String(row.ts_utc),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      sessionLabel: row.session_label as Bar["sessionLabel"]
    }));
  }

  insertEventWindows(windows: EventWindow[]): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO event_windows (
        event_type, start_utc, end_utc, severity, blocked, source, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const window of windows) {
      statement.run(window.eventType, window.startUtc, window.endUtc, window.severity, window.blocked ? 1 : 0, window.source, window.notes ?? null);
    }
  }

  getEventWindows(startUtc?: string, endUtc?: string): EventWindow[] {
    const clauses = ["1 = 1"];
    const params: Array<string | number> = [];
    if (startUtc) {
      clauses.push("end_utc >= ?");
      params.push(startUtc);
    }
    if (endUtc) {
      clauses.push("start_utc <= ?");
      params.push(endUtc);
    }
    const statement = this.db.prepare(`
      SELECT event_type, start_utc, end_utc, severity, blocked, source, notes
      FROM event_windows
      WHERE ${clauses.join(" AND ")}
      ORDER BY start_utc ASC
    `);
    return statement.all(...params).map((row) => ({
      eventType: row.event_type as EventWindow["eventType"],
      startUtc: String(row.start_utc),
      endUtc: String(row.end_utc),
      severity: row.severity as EventWindow["severity"],
      blocked: Boolean(row.blocked),
      source: String(row.source),
      notes: row.notes ? String(row.notes) : undefined
    }));
  }

  insertTrades(trades: TradeRecord[]): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO trades (
        id, strategy_id, symbol, contract, side, qty, entry_ts, exit_ts, entry_px, exit_px,
        stop_px, target_px, fees_usd, slippage_usd, pnl_usd, exit_reason, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const trade of trades) {
      statement.run(
        trade.id,
        trade.strategyId,
        trade.symbol,
        trade.contract,
        trade.side,
        trade.qty,
        trade.entryTs,
        trade.exitTs,
        trade.entryPx,
        trade.exitPx,
        trade.stopPx,
        trade.targetPx,
        trade.feesUsd,
        trade.slippageUsd,
        trade.pnlUsd,
        trade.exitReason,
        trade.version
      );
    }
  }

  getPaperState(strategyId: string, symbol: string): PersistedPaperState | null {
    const statement = this.db.prepare(`
      SELECT state_json
      FROM paper_state
      WHERE strategy_id = ? AND symbol = ?
    `);
    const row = statement.get(strategyId, symbol) as { state_json?: string } | undefined;
    if (!row?.state_json) {
      return null;
    }
    return JSON.parse(String(row.state_json)) as PersistedPaperState;
  }

  upsertPaperState(state: PersistedPaperState): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO paper_state (
        strategy_id, symbol, state_json, processed_through_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?)
    `);
    statement.run(
      state.strategyId,
      state.symbol,
      JSON.stringify(state),
      state.processedThroughUtc,
      state.updatedAtUtc
    );
  }

  close(): void {
    this.db.close();
  }
}
