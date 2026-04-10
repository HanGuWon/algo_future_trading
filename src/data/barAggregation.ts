import type { Bar, Timeframe } from "../types.js";
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

export function parseCsvBars(csv: string, symbol: string, contractFallback = "UNKNOWN"): Bar[] {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map((item) => item.trim());
  const indexByName = Object.fromEntries(headers.map((name, index) => [name, index]));

  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(",").map((item) => item.trim());
      const tsUtc = new Date(cells[indexByName.tsUtc] ?? cells[indexByName.timestamp]).toISOString();
      return {
        symbol,
        contract: cells[indexByName.contract] ?? contractFallback,
        tsUtc,
        open: Number(cells[indexByName.open]),
        high: Number(cells[indexByName.high]),
        low: Number(cells[indexByName.low]),
        close: Number(cells[indexByName.close]),
        volume: Number(cells[indexByName.volume] ?? 0),
        sessionLabel: getSessionLabelChicago(tsUtc)
      };
    });
}
