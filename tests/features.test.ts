import { describe, expect, it } from "vitest";
import { buildPivotCluster } from "../src/features/pivotClusters.js";
import type { Bar } from "../src/types.js";

function makeBar(index: number, low: number, high: number, close: number): Bar {
  const tsUtc = new Date(Date.UTC(2026, 0, 5, index, 0, 0)).toISOString();
  return {
    symbol: "MNQ",
    contract: "H26",
    tsUtc,
    open: close - 0.5,
    high,
    low,
    close,
    volume: 1,
    sessionLabel: "US"
  };
}

describe("feature generation", () => {
  it("does not leak future pivots into the current support cluster", () => {
    const bars = [
      makeBar(0, 100, 105, 104),
      makeBar(1, 99, 106, 105),
      makeBar(2, 98, 107, 106),
      makeBar(3, 97, 108, 107),
      makeBar(4, 101, 109, 108),
      makeBar(5, 96, 110, 109),
      makeBar(6, 94, 111, 110)
    ];
    const cluster = buildPivotCluster(bars, 5, 5);
    expect(cluster.support).not.toBe(94);
  });
});
