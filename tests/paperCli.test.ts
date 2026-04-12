import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Bar, PersistedPaperState, TradeRecord } from "../src/types.js";

const mockBar: Bar = {
  symbol: "MNQ",
  contract: "H26",
  tsUtc: "2026-04-10T00:00:00.000Z",
  open: 100,
  high: 101,
  low: 99,
  close: 100.5,
  volume: 1,
  sessionLabel: "CLOSED"
};

const mockTrades: TradeRecord[] = [
  {
    id: "trade-1",
    strategyId: "SessionFilteredTrendPullback_v1",
    symbol: "MNQ",
    contract: "H26",
    side: "BUY",
    qty: 1,
    entryTs: "2026-04-10T08:00:00.000Z",
    exitTs: "2026-04-10T09:00:00.000Z",
    entryPx: 100,
    exitPx: 104,
    stopPx: 98,
    targetPx: 104,
    feesUsd: 1,
    slippageUsd: 0.5,
    pnlUsd: 6.5,
    exitReason: "TARGET",
    version: "0.1.0"
  }
];

const mockState: PersistedPaperState = {
  strategyId: "SessionFilteredTrendPullback_v1",
  symbol: "MNQ",
  paperStartUtc: "2026-04-10T00:00:00.000Z",
  processedThroughUtc: "2026-04-10T00:00:00.000Z",
  lastProcessedSignalTs: "2026-04-10T00:00:00.000Z",
  currentTradingDate: "2026-04-10",
  accountState: {
    equityUsd: 25006.5,
    startOfDayEquityUsd: 25000,
    dailyPnlUsd: 6.5,
    consecutiveLosses: 0,
    cooldownUntilUtc: null
  },
  activePosition: null,
  updatedAtUtc: "2026-04-10T00:00:00.000Z"
};

vi.mock("../src/storage/sqliteStore.js", () => {
  return {
    SqliteStore: class MockSqliteStore {
      constructor(_dbPath: string) {}
      getBars() {
        return [mockBar];
      }
      getEventWindows() {
        return [];
      }
      getPaperState() {
        return null;
      }
      insertTrades() {}
      upsertPaperState() {}
      getTrades() {
        return mockTrades;
      }
      close() {}
    }
  };
});

vi.mock("../src/paper/paperEngine.js", () => {
  return {
    PaperEngine: class MockPaperEngine {
      constructor(..._args: unknown[]) {}
      run() {
        return {
          trades: mockTrades,
          rejectedSignals: [],
          finalState: mockState
        };
      }
    }
  };
});

describe("paper CLI", () => {
  it("prints a summary and writes paper json and markdown artifacts", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "paper-cli-"));
    const output: string[] = [];

    await runCli(["paper", "--db", "mock.sqlite", "--artifacts-dir", artifactsDir], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Paper run complete"))).toBe(true);
    expect(output.some((line) => line.includes("Artifact JSON:"))).toBe(true);
    expect(output.some((line) => line.includes("Artifact Markdown:"))).toBe(true);

    const paperDirEntries = await readdir(join(artifactsDir, "paper"));
    expect(paperDirEntries.length).toBe(2);
    const jsonName = paperDirEntries.find((entry) => entry.endsWith(".json"));
    const markdownName = paperDirEntries.find((entry) => entry.endsWith(".md"));
    expect(jsonName).toBeTruthy();
    expect(markdownName).toBeTruthy();
    const artifactRaw = await readFile(join(artifactsDir, "paper", jsonName!), "utf8");
    const artifact = JSON.parse(artifactRaw) as {
      config?: { path: string; sha256: string };
      runProvenance?: { dbPath: string | null; nodeVersion: string };
      run: { newTradeCount: number };
      dailyPerformance: Array<{ tradeCount: number }>;
      sessionPerformance: Array<{ sessionLabel: string }>;
    };
    expect(artifact.config?.path).toContain("config\\strategies\\session-filtered-trend-pullback-v1.json");
    expect(artifact.config?.sha256).toHaveLength(64);
    expect(artifact.runProvenance?.dbPath).toBe("mock.sqlite");
    expect(artifact.runProvenance?.nodeVersion).toMatch(/^v/);
    expect(artifact.run.newTradeCount).toBe(1);
    expect(artifact.dailyPerformance[0]?.tradeCount).toBe(1);
    expect(artifact.sessionPerformance.some((row) => row.sessionLabel === "EUROPE")).toBe(true);
    const markdownRaw = await readFile(join(artifactsDir, "paper", markdownName!), "utf8");
    expect(markdownRaw).toContain("# Paper Report");
    expect(markdownRaw).toContain("Config SHA256:");
    expect(markdownRaw).toContain("Git commit:");
    expect(markdownRaw).toContain("## Daily Performance");
  });
});
