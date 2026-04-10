import type { Bar, PivotCluster } from "../types.js";
import { averageRange } from "./indicators.js";

export function buildPivotCluster(bars: Bar[], index: number, lookbackBars = 40): PivotCluster {
  const start = Math.max(0, index - lookbackBars);
  const window = bars.slice(start, index);
  if (window.length < 10) {
    return { support: null, resistance: null, lookbackBars };
  }

  const range = averageRange(window, Math.min(20, window.length)) ?? 0;
  const tolerance = Math.max(range * 0.25, 0.5);

  const pivotLows = window.filter((bar, barIndex) => {
    if (barIndex < 3) {
      return false;
    }
    const trailing = window.slice(Math.max(0, barIndex - 3), barIndex + 1);
    return bar.low === Math.min(...trailing.map((candidate) => candidate.low));
  });
  const pivotHighs = window.filter((bar, barIndex) => {
    if (barIndex < 3) {
      return false;
    }
    const trailing = window.slice(Math.max(0, barIndex - 3), barIndex + 1);
    return bar.high === Math.max(...trailing.map((candidate) => candidate.high));
  });

  const currentClose = bars[index]?.close ?? window[window.length - 1].close;
  const supportCandidates = pivotLows
    .map((bar) => bar.low)
    .filter((value) => value <= currentClose + tolerance)
    .sort((left, right) => right - left);
  const resistanceCandidates = pivotHighs
    .map((bar) => bar.high)
    .filter((value) => value >= currentClose - tolerance)
    .sort((left, right) => left - right);

  return {
    support: supportCandidates[0] ?? null,
    resistance: resistanceCandidates[0] ?? null,
    lookbackBars
  };
}
