import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { aggregateBars, parseCsvBarsDetailed } from "./barAggregation.js";
import type { DateRange, IngestionFileRecord, IngestionRunSummary } from "../types.js";
import { SqliteStore } from "../storage/sqliteStore.js";

export interface FileIngestionOptions {
  store: SqliteStore;
  symbol: string;
  contractFallback: string;
}

interface PreparedFile {
  filePath: string;
  fileSizeBytes: number;
  fileModifiedTimeUtc: string;
  contentHash: string;
  raw: string;
}

function mergeRanges(current: DateRange | null, next: DateRange | null): DateRange | null {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return {
    startUtc: current.startUtc < next.startUtc ? current.startUtc : next.startUtc,
    endUtc: current.endUtc > next.endUtc ? current.endUtc : next.endUtc
  };
}

async function prepareFile(filePath: string): Promise<PreparedFile> {
  const absolutePath = resolve(filePath);
  const [fileStats, raw] = await Promise.all([
    stat(absolutePath),
    readFile(absolutePath, "utf8")
  ]);
  const contentHash = createHash("sha256").update(raw).digest("hex");
  return {
    filePath: absolutePath,
    fileSizeBytes: fileStats.size,
    fileModifiedTimeUtc: fileStats.mtime.toISOString(),
    contentHash,
    raw
  };
}

function classifyExistingFile(existing: IngestionFileRecord | null, prepared: PreparedFile): "new" | "skip" | "updated" | "failed" {
  if (!existing) {
    return "new";
  }
  const sameFingerprint =
    existing.fileSizeBytes === prepared.fileSizeBytes &&
    existing.fileModifiedTimeUtc === prepared.fileModifiedTimeUtc &&
    existing.contentHash === prepared.contentHash;
  if (sameFingerprint && existing.status === "processed") {
    return "skip";
  }
  if (sameFingerprint && existing.status === "failed") {
    return "failed";
  }
  return "updated";
}

export async function ingestCsvFile(
  filePath: string,
  options: FileIngestionOptions
): Promise<{
  status: "processed" | "skipped";
  rowCount: number;
  range: DateRange | null;
  contracts: string[];
  warnings: string[];
  record: IngestionFileRecord;
}> {
  const prepared = await prepareFile(filePath);
  const existing = options.store.getIngestionFile(prepared.filePath);
  const classification = classifyExistingFile(existing, prepared);

  if (classification === "skip") {
    return {
      status: "skipped",
      rowCount: 0,
      range: existing?.firstTsUtc && existing?.lastTsUtc ? {
        startUtc: existing.firstTsUtc,
        endUtc: existing.lastTsUtc
      } : null,
      contracts: existing?.detectedContract ? [existing.detectedContract] : [],
      warnings: [],
      record: existing!
    };
  }

  if (classification === "failed") {
    throw new Error(`Previously failed file still present: ${prepared.filePath}`);
  }

  if (classification === "updated") {
    const failureReason = `Previously processed file changed and reprocessing is blocked: ${prepared.filePath}`;
    const failedRecord: IngestionFileRecord = {
      filePath: prepared.filePath,
      fileSizeBytes: prepared.fileSizeBytes,
      fileModifiedTimeUtc: prepared.fileModifiedTimeUtc,
      contentHash: prepared.contentHash,
      detectedContract: existing?.detectedContract ?? null,
      firstTsUtc: existing?.firstTsUtc ?? null,
      lastTsUtc: existing?.lastTsUtc ?? null,
      rowsInserted: existing?.rowsInserted ?? 0,
      processedAtUtc: new Date().toISOString(),
      status: "failed",
      failureReason
    };
    options.store.upsertIngestionFile(failedRecord);
    throw new Error(failureReason);
  }

  const parsed = parseCsvBarsDetailed(prepared.raw, options.symbol, options.contractFallback);
  const bars1m = parsed.bars;

  options.store.insertBars("1m", bars1m);
  options.store.insertBars("5m", aggregateBars(bars1m, "5m"));
  options.store.insertBars("15m", aggregateBars(bars1m, "15m"));
  options.store.insertBars("1h", aggregateBars(bars1m, "1h"));

  const record: IngestionFileRecord = {
    filePath: prepared.filePath,
    fileSizeBytes: prepared.fileSizeBytes,
    fileModifiedTimeUtc: prepared.fileModifiedTimeUtc,
    contentHash: prepared.contentHash,
    detectedContract: parsed.summary.contracts[0] ?? null,
    firstTsUtc: parsed.summary.firstTsUtc,
    lastTsUtc: parsed.summary.lastTsUtc,
    rowsInserted: parsed.summary.rowCount,
    processedAtUtc: new Date().toISOString(),
    status: "processed"
  };
  options.store.upsertIngestionFile(record);

  return {
    status: "processed",
    rowCount: parsed.summary.rowCount,
    range: {
      startUtc: parsed.summary.firstTsUtc,
      endUtc: parsed.summary.lastTsUtc
    },
    contracts: parsed.summary.contracts,
    warnings: parsed.warnings,
    record
  };
}

export async function ingestCsvDirectory(
  dirPath: string,
  options: FileIngestionOptions
): Promise<IngestionRunSummary> {
  const absoluteDir = resolve(dirPath);
  const dirEntries = await readdir(absoluteDir, { withFileTypes: true });
  const csvFiles = dirEntries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".csv")
    .map((entry) => resolve(absoluteDir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const summary: IngestionRunSummary = {
    inputMode: "dir",
    inputPath: absoluteDir,
    scannedFileCount: csvFiles.length,
    newFileCount: 0,
    skippedFileCount: 0,
    failedFileCount: 0,
    insertedBarCount: 0,
    sourceRange: null,
    contracts: []
  };

  for (const filePath of csvFiles) {
    const prepared = await prepareFile(filePath);
    const existing = options.store.getIngestionFile(prepared.filePath);
    const classification = classifyExistingFile(existing, prepared);

    if (classification === "skip") {
      summary.skippedFileCount += 1;
      continue;
    }

    if (classification === "failed") {
      summary.failedFileCount += 1;
      throw new Error(`Previously failed file still present: ${prepared.filePath}`);
    }

    if (classification === "updated") {
      const failureReason = `Previously processed file changed and reprocessing is blocked: ${prepared.filePath}`;
      options.store.upsertIngestionFile({
        filePath: prepared.filePath,
        fileSizeBytes: prepared.fileSizeBytes,
        fileModifiedTimeUtc: prepared.fileModifiedTimeUtc,
        contentHash: prepared.contentHash,
        detectedContract: existing?.detectedContract ?? null,
        firstTsUtc: existing?.firstTsUtc ?? null,
        lastTsUtc: existing?.lastTsUtc ?? null,
        rowsInserted: existing?.rowsInserted ?? 0,
        processedAtUtc: new Date().toISOString(),
        status: "failed",
        failureReason
      });
      summary.failedFileCount += 1;
      throw new Error(failureReason);
    }

    try {
      const parsed = parseCsvBarsDetailed(prepared.raw, options.symbol, options.contractFallback);
      options.store.insertBars("1m", parsed.bars);
      options.store.insertBars("5m", aggregateBars(parsed.bars, "5m"));
      options.store.insertBars("15m", aggregateBars(parsed.bars, "15m"));
      options.store.insertBars("1h", aggregateBars(parsed.bars, "1h"));

      const record: IngestionFileRecord = {
        filePath: prepared.filePath,
        fileSizeBytes: prepared.fileSizeBytes,
        fileModifiedTimeUtc: prepared.fileModifiedTimeUtc,
        contentHash: prepared.contentHash,
        detectedContract: parsed.summary.contracts[0] ?? null,
        firstTsUtc: parsed.summary.firstTsUtc,
        lastTsUtc: parsed.summary.lastTsUtc,
        rowsInserted: parsed.summary.rowCount,
        processedAtUtc: new Date().toISOString(),
        status: "processed"
      };
      options.store.upsertIngestionFile(record);

      summary.newFileCount += 1;
      summary.insertedBarCount += parsed.summary.rowCount;
      summary.sourceRange = mergeRanges(summary.sourceRange, {
        startUtc: parsed.summary.firstTsUtc,
        endUtc: parsed.summary.lastTsUtc
      });
      for (const contract of parsed.summary.contracts) {
        if (!summary.contracts.includes(contract)) {
          summary.contracts.push(contract);
        }
      }
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      options.store.upsertIngestionFile({
        filePath: prepared.filePath,
        fileSizeBytes: prepared.fileSizeBytes,
        fileModifiedTimeUtc: prepared.fileModifiedTimeUtc,
        contentHash: prepared.contentHash,
        detectedContract: null,
        firstTsUtc: null,
        lastTsUtc: null,
        rowsInserted: 0,
        processedAtUtc: new Date().toISOString(),
        status: "failed",
        failureReason
      });
      summary.failedFileCount += 1;
      throw error;
    }
  }

  summary.contracts.sort();
  return summary;
}
