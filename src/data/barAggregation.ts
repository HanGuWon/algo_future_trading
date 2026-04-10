import type { Bar, ParsedCsvBarsResult, Timeframe } from "../types.js";
import { getSessionLabelChicago } from "../utils/time.js";

const FRAME_MINUTES: Record<Exclude<Timeframe, "1m">, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60
};

export function aggregateBars(sourceBars: Bar[], timeframe: Exclude<Timeframe, "1m">): Bar[] {
  const bucketSizeMinutes = FRAME_MINUTES[timeframe];
  const sorted = [...sourceBars].sort((left, right) => left.tsUtc.localeCompare(right.tsUtc));
  const buckets = new Map<number, Bar[]>();

  for (const bar of sorted) {
    const ts = new Date(bar.tsUtc).getTime();
    const bucketStart = Math.floor(ts / (bucketSizeMinutes * 60_000)) * bucketSizeMinutes * 60_000;
    const group = buckets.get(bucketStart) ?? [];
    group.push(bar);
    buckets.set(bucketStart, group);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([bucketStart, group]) => {
      const first = group[0];
      const last = group[group.length - 1];
      const tsUtc = new Date(bucketStart).toISOString();
      return {
        symbol: first.symbol,
        contract: last.contract,
        tsUtc,
        open: first.open,
        high: Math.max(...group.map((bar) => bar.high)),
        low: Math.min(...group.map((bar) => bar.low)),
        close: last.close,
        volume: group.reduce((sum, bar) => sum + bar.volume, 0),
        sessionLabel: getSessionLabelChicago(tsUtc)
      };
    });
}

export function parseCsvBarsDetailed(csv: string, symbol: string, contractFallback = "UNKNOWN"): ParsedCsvBarsResult {
  const trimmed = csv.trim();
  if (trimmed.length === 0) {
    throw new Error("CSV is empty.");
  }

  const [headerLine, ...rawLines] = trimmed.split(/\r?\n/);
  const headers = headerLine.split(",").map((item) => item.trim());
  const indexByName = new Map(headers.map((name, index) => [name.toLowerCase(), index]));
  const timestampIndex = indexByName.get("tsutc") ?? indexByName.get("timestamp");
  const contractIndex = indexByName.get("contract");
  const openIndex = indexByName.get("open");
  const highIndex = indexByName.get("high");
  const lowIndex = indexByName.get("low");
  const closeIndex = indexByName.get("close");
  const volumeIndex = indexByName.get("volume");

  if (timestampIndex === undefined || openIndex === undefined || highIndex === undefined || lowIndex === undefined || closeIndex === undefined) {
    throw new Error(
      "CSV must include timestamp (tsUtc or timestamp), open, high, low, and close columns."
    );
  }

  const warnings = new Set<string>();
  const bars: Bar[] = [];
  const dataLines = rawLines.filter((line) => line.trim().length > 0);

  for (let lineOffset = 0; lineOffset < dataLines.length; lineOffset += 1) {
    const line = dataLines[lineOffset];
    const lineNumber = lineOffset + 2;
    const cells = line.split(",").map((item) => item.trim());
    const rawTs = cells[timestampIndex];
    const tsDate = new Date(rawTs);
    if (!rawTs || Number.isNaN(tsDate.getTime())) {
      throw new Error(`Invalid timestamp at CSV line ${lineNumber}: "${rawTs ?? ""}"`);
    }
    if (tsDate.getUTCSeconds() !== 0 || tsDate.getUTCMilliseconds() !== 0) {
      throw new Error(`Timestamp must be minute-aligned at CSV line ${lineNumber}: "${rawTs}"`);
    }

    const open = parseFiniteNumber(cells[openIndex], "open", lineNumber);
    const high = parseFiniteNumber(cells[highIndex], "high", lineNumber);
    const low = parseFiniteNumber(cells[lowIndex], "low", lineNumber);
    const close = parseFiniteNumber(cells[closeIndex], "close", lineNumber);
    const volume = volumeIndex === undefined ? 0 : parseFiniteNumber(cells[volumeIndex] ?? "0", "volume", lineNumber);
    if (volume < 0) {
      throw new Error(`Volume must be non-negative at CSV line ${lineNumber}.`);
    }
    if (high < Math.max(open, close) || high < low) {
      throw new Error(`High price is inconsistent with OHLC values at CSV line ${lineNumber}.`);
    }
    if (low > Math.min(open, close) || low > high) {
      throw new Error(`Low price is inconsistent with OHLC values at CSV line ${lineNumber}.`);
    }

    const rawContract = contractIndex === undefined ? "" : cells[contractIndex] ?? "";
    const normalizedContract = normalizeContract(rawContract, symbol, contractFallback, warnings, lineNumber);
    const tsUtc = tsDate.toISOString();

    if (bars.length > 0) {
      const previous = bars[bars.length - 1];
      if (tsUtc <= previous.tsUtc) {
        throw new Error(
          `Timestamps must be strictly increasing with no duplicates. Problem at CSV line ${lineNumber}: ${tsUtc}`
        );
      }
    }

    bars.push({
      symbol,
      contract: normalizedContract,
      tsUtc,
      open,
      high,
      low,
      close,
      volume,
      sessionLabel: getSessionLabelChicago(tsUtc)
    });
  }

  if (bars.length === 0) {
    throw new Error("CSV has no data rows.");
  }

  return {
    bars,
    summary: {
      symbol,
      rowCount: bars.length,
      firstTsUtc: bars[0].tsUtc,
      lastTsUtc: bars[bars.length - 1].tsUtc,
      contracts: [...new Set(bars.map((bar) => bar.contract))].sort(),
      usedFallbackContract: bars.some((bar) => bar.contract === contractFallback)
    },
    warnings: [...warnings]
  };
}

export function parseCsvBars(csv: string, symbol: string, contractFallback = "UNKNOWN"): Bar[] {
  return parseCsvBarsDetailed(csv, symbol, contractFallback).bars;
}

function parseFiniteNumber(raw: string | undefined, fieldName: string, lineNumber: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${fieldName} value at CSV line ${lineNumber}: "${raw ?? ""}"`);
  }
  return value;
}

function normalizeContract(
  rawContract: string,
  symbol: string,
  contractFallback: string,
  warnings: Set<string>,
  lineNumber: number
): string {
  const trimmed = rawContract.trim().toUpperCase();
  if (trimmed.length === 0) {
    warnings.add(`Contract column missing or blank; using fallback contract "${contractFallback}".`);
    return contractFallback;
  }

  if (symbol.toUpperCase() !== "MNQ") {
    return trimmed;
  }

  const match =
    trimmed.match(/^MNQ([HMUZ])(\d{2})$/) ??
    trimmed.match(/^MNQ([HMUZ])(\d{4})$/) ??
    trimmed.match(/^([HMUZ])(\d{2})$/) ??
    trimmed.match(/^([HMUZ])(\d{4})$/);

  if (!match) {
    throw new Error(`Unsupported MNQ contract code at CSV line ${lineNumber}: "${rawContract}"`);
  }

  const monthCode = match[1];
  const year = match[2].slice(-2);
  const normalized = `${monthCode}${year}`;
  if (normalized !== trimmed) {
    warnings.add(`Normalized MNQ contract codes to short quarter format (example: "MNQH2026" -> "H26").`);
  }
  return normalized;
}
