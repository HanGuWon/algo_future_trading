import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Bar,
  DateRange,
  EventWindow,
  IngestionFileRecord,
  PersistedPaperState,
  Timeframe,
  TradeRecord,
  TradeSource
} from "../types.js";

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
        version TEXT NOT NULL,
        trade_source TEXT NOT NULL DEFAULT 'BACKTEST'
      );
      CREATE TABLE IF NOT EXISTS paper_state (
        strategy_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        state_json TEXT NOT NULL,
        processed_through_utc TEXT,
        updated_at_utc TEXT NOT NULL,
        PRIMARY KEY (strategy_id, symbol)
      );
      CREATE TABLE IF NOT EXISTS ingestion_files (
        file_path TEXT PRIMARY KEY,
        file_size_bytes INTEGER NOT NULL,
        file_modified_time_utc TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        detected_contract TEXT,
        first_ts_utc TEXT,
        last_ts_utc TEXT,
        rows_inserted INTEGER NOT NULL,
        processed_at_utc TEXT NOT NULL,
        status TEXT NOT NULL,
        failure_reason TEXT
      );
    `);
    this.ensureTradeSourceColumn();
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

  insertTrades(trades: TradeRecord[], source: TradeSource = "BACKTEST"): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO trades (
        id, strategy_id, symbol, contract, side, qty, entry_ts, exit_ts, entry_px, exit_px,
        stop_px, target_px, fees_usd, slippage_usd, pnl_usd, exit_reason, version, trade_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        trade.version,
        source
      );
    }
  }

  getTrades(filters?: {
    strategyId?: string;
    symbol?: string;
    source?: TradeSource;
    startUtc?: string;
    endUtc?: string;
  }): TradeRecord[] {
    const clauses = ["1 = 1"];
    const params: Array<string | number> = [];
    if (filters?.strategyId) {
      clauses.push("strategy_id = ?");
      params.push(filters.strategyId);
    }
    if (filters?.symbol) {
      clauses.push("symbol = ?");
      params.push(filters.symbol);
    }
    if (filters?.source) {
      clauses.push("trade_source = ?");
      params.push(filters.source);
    }
    if (filters?.startUtc) {
      clauses.push("exit_ts >= ?");
      params.push(filters.startUtc);
    }
    if (filters?.endUtc) {
      clauses.push("exit_ts <= ?");
      params.push(filters.endUtc);
    }
    const statement = this.db.prepare(`
      SELECT id, strategy_id, symbol, contract, side, qty, entry_ts, exit_ts, entry_px, exit_px,
             stop_px, target_px, fees_usd, slippage_usd, pnl_usd, exit_reason, version
      FROM trades
      WHERE ${clauses.join(" AND ")}
      ORDER BY exit_ts ASC, id ASC
    `);
    return statement.all(...params).map((row) => ({
      id: String(row.id),
      strategyId: row.strategy_id as TradeRecord["strategyId"],
      symbol: String(row.symbol),
      contract: String(row.contract),
      side: row.side as TradeRecord["side"],
      qty: Number(row.qty),
      entryTs: String(row.entry_ts),
      exitTs: String(row.exit_ts),
      entryPx: Number(row.entry_px),
      exitPx: Number(row.exit_px),
      stopPx: Number(row.stop_px),
      targetPx: Number(row.target_px),
      feesUsd: Number(row.fees_usd),
      slippageUsd: Number(row.slippage_usd),
      pnlUsd: Number(row.pnl_usd),
      exitReason: row.exit_reason as TradeRecord["exitReason"],
      version: String(row.version)
    }));
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

  getIngestionFile(filePath: string): IngestionFileRecord | null {
    const statement = this.db.prepare(`
      SELECT file_path, file_size_bytes, file_modified_time_utc, content_hash, detected_contract,
             first_ts_utc, last_ts_utc, rows_inserted, processed_at_utc, status, failure_reason
      FROM ingestion_files
      WHERE file_path = ?
    `);
    const row = statement.get(filePath) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      filePath: String(row.file_path),
      fileSizeBytes: Number(row.file_size_bytes),
      fileModifiedTimeUtc: String(row.file_modified_time_utc),
      contentHash: String(row.content_hash),
      detectedContract: row.detected_contract ? String(row.detected_contract) : null,
      firstTsUtc: row.first_ts_utc ? String(row.first_ts_utc) : null,
      lastTsUtc: row.last_ts_utc ? String(row.last_ts_utc) : null,
      rowsInserted: Number(row.rows_inserted),
      processedAtUtc: String(row.processed_at_utc),
      status: row.status as IngestionFileRecord["status"],
      failureReason: row.failure_reason ? String(row.failure_reason) : undefined
    };
  }

  upsertIngestionFile(record: IngestionFileRecord): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO ingestion_files (
        file_path, file_size_bytes, file_modified_time_utc, content_hash, detected_contract,
        first_ts_utc, last_ts_utc, rows_inserted, processed_at_utc, status, failure_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    statement.run(
      record.filePath,
      record.fileSizeBytes,
      record.fileModifiedTimeUtc,
      record.contentHash,
      record.detectedContract,
      record.firstTsUtc,
      record.lastTsUtc,
      record.rowsInserted,
      record.processedAtUtc,
      record.status,
      record.failureReason ?? null
    );
  }

  listIngestionFiles(): IngestionFileRecord[] {
    const statement = this.db.prepare(`
      SELECT file_path, file_size_bytes, file_modified_time_utc, content_hash, detected_contract,
             first_ts_utc, last_ts_utc, rows_inserted, processed_at_utc, status, failure_reason
      FROM ingestion_files
      ORDER BY file_path ASC
    `);
    return statement.all().map((row) => ({
      filePath: String(row.file_path),
      fileSizeBytes: Number(row.file_size_bytes),
      fileModifiedTimeUtc: String(row.file_modified_time_utc),
      contentHash: String(row.content_hash),
      detectedContract: row.detected_contract ? String(row.detected_contract) : null,
      firstTsUtc: row.first_ts_utc ? String(row.first_ts_utc) : null,
      lastTsUtc: row.last_ts_utc ? String(row.last_ts_utc) : null,
      rowsInserted: Number(row.rows_inserted),
      processedAtUtc: String(row.processed_at_utc),
      status: row.status as IngestionFileRecord["status"],
      failureReason: row.failure_reason ? String(row.failure_reason) : undefined
    }));
  }

  getBarRange(symbol: string, timeframe: Timeframe): DateRange | null {
    const statement = this.db.prepare(`
      SELECT MIN(ts_utc) AS start_utc, MAX(ts_utc) AS end_utc
      FROM bars
      WHERE symbol = ? AND timeframe = ?
    `);
    const row = statement.get(symbol, timeframe) as { start_utc?: string | null; end_utc?: string | null } | undefined;
    if (!row?.start_utc || !row?.end_utc) {
      return null;
    }
    return {
      startUtc: String(row.start_utc),
      endUtc: String(row.end_utc)
    };
  }

  countRows(table: "trades" | "paper_state" | "ingestion_files" | "bars"): number {
    const statement = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`);
    const row = statement.get() as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  close(): void {
    this.db.close();
  }

  private ensureTradeSourceColumn(): void {
    const statement = this.db.prepare(`PRAGMA table_info(trades)`);
    const columns = statement.all() as Array<{ name?: string }>;
    if (columns.some((column) => column.name === "trade_source")) {
      return;
    }
    this.db.exec(`ALTER TABLE trades ADD COLUMN trade_source TEXT NOT NULL DEFAULT 'BACKTEST'`);
  }
}
