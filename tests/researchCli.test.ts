import { rmSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SqliteStore } from "../src/storage/sqliteStore.js";
import type { Bar, ResearchReportArtifact, TradeRecord } from "../src/types.js";

const mockArtifact: ResearchReportArtifact = {
  generatedAtUtc: "2026-04-10T00:00:00.000Z",
  symbol: "MNQ",
  strategyId: "SessionFilteredTrendPullback_v1",
  runProvenance: {
    gitCommitSha: "abc123",
    nodeVersion: "v22.0.0",
    dbPath: "mock.sqlite",
    eventWindowCount: 0,
    sourceRange: {
      startUtc: "2018-01-01T00:00:00.000Z",
      endUtc: "2025-12-31T23:59:59.999Z"
    }
  },
  baseline: {
    train: {
      slice: "train",
      range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" },
      metrics: emptyMetrics(10)
    },
    validation: {
      slice: "validation",
      range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" },
      metrics: emptyMetrics(4)
    },
    test: {
      slice: "test",
      range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
      metrics: emptyMetrics(3)
    }
  },
  walkforward: {
    mode: "grid",
    windowCount: 3,
    selectedWindowCount: 2,
    rolledUpMetrics: emptyMetrics(2),
    windows: [
      {
        id: "wf_001",
        status: "selected",
        selectedCandidateId: "fast20_slow120_score3_post60",
        selectedTestMetrics: emptyMetrics(1)
      }
    ]
  },
  sensitivity: {
    baselineCandidateId: "fast20_slow120_score3_post60",
    baselineRank: 2,
    totalCandidates: 54,
    stableCandidateCount: 6,
    topCandidates: []
  },
  eventComparison: {
    range: {
      startUtc: "2022-01-01T00:00:00.000Z",
      endUtc: "2025-12-31T23:59:59.999Z"
    },
    baselineScenario: "default",
    scenarios: [
      {
        scenario: "default",
        metrics: emptyMetrics(3),
        deltaFromBaseline: { tradeCount: 0, netPnlUsd: 0, expectancyUsd: 0, maxDrawdownUsd: 0 }
      }
    ]
  },
  gateConfig: {
    minTrades: 20,
    minSelectedWalkforwardWindows: 2,
    minExpectancyUsd: 0,
    maxDrawdownUsd: 3750
  },
  gateResults: {
    baselineTestTrades: { passed: true, actual: 25, threshold: 20 },
    walkforwardTrades: { passed: true, actual: 24, threshold: 20 },
    selectedWalkforwardWindows: { passed: true, actual: 2, threshold: 2 },
    baselineTestExpectancy: { passed: true, actual: 10, threshold: 0 },
    walkforwardExpectancy: { passed: true, actual: 10, threshold: 0 },
    baselineTestMaxDrawdown: { passed: true, actual: 2, threshold: 3750 },
    walkforwardMaxDrawdown: { passed: true, actual: 2, threshold: 3750 },
    sensitivityTopCandidatesTrades: { passed: true, threshold: 20, passingCandidates: 5, totalCandidates: 5 }
  },
  finalAssessment: {
    baseline_test_positive_expectancy: true,
    walkforward_oos_positive_expectancy: true,
    parameter_stability_pass: true,
    event_filter_dependence: "low",
    gatePass: true,
    gateFailureReasons: [],
    recommendation: "continue_paper"
  }
};

function emptyMetrics(tradeCount: number) {
  return {
    tradeCount,
    winRate: tradeCount > 0 ? 100 : 0,
    netPnlUsd: tradeCount * 10,
    expectancyUsd: tradeCount > 0 ? 10 : 0,
    profitFactor: tradeCount > 0 ? 1.5 : null,
    maxDrawdownUsd: 2,
    avgWinUsd: 10,
    avgLossUsd: 0,
    rejectedSignalCount: 0,
    sessionBreakdown: {
      ASIA: { tradeCount: 0, netPnlUsd: 0 },
      EUROPE: { tradeCount, netPnlUsd: tradeCount * 10 },
      US: { tradeCount: 0, netPnlUsd: 0 },
      CLOSED: { tradeCount: 0, netPnlUsd: 0 }
    },
    sideBreakdown: {
      BUY: { tradeCount, netPnlUsd: tradeCount * 10 },
      SELL: { tradeCount: 0, netPnlUsd: 0 }
    }
  };
}

vi.mock("../src/research/report.js", () => {
  return {
    ResearchReportRunner: class MockResearchReportRunner {
      constructor(..._args: unknown[]) {}
      run() {
        return mockArtifact;
      }
    }
  };
});

describe("research CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("prints a summary, writes json and markdown artifacts, and does not mutate trades or paper_state", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "research-cli-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "research.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const store = new SqliteStore(dbPath);
    const seedBar: Bar = {
      symbol: "MNQ",
      contract: "H18",
      tsUtc: "2018-01-01T00:00:00.000Z",
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1,
      sessionLabel: "CLOSED"
    };
    const existingTrade: TradeRecord = {
      id: "existing-trade",
      strategyId: "SessionFilteredTrendPullback_v1",
      symbol: "MNQ",
      contract: "H18",
      side: "BUY",
      qty: 1,
      entryTs: "2018-01-01T00:00:00.000Z",
      exitTs: "2018-01-01T01:00:00.000Z",
      entryPx: 100,
      exitPx: 101,
      stopPx: 99,
      targetPx: 101,
      feesUsd: 1,
      slippageUsd: 0.5,
      pnlUsd: 0.5,
      exitReason: "TARGET",
      version: "0.1.0"
    };
    try {
      store.insertBars("1m", [seedBar]);
      store.insertTrades([existingTrade], "PAPER");
      store.upsertPaperState({
        strategyId: "SessionFilteredTrendPullback_v1",
        symbol: "MNQ",
        paperStartUtc: "2026-04-10T00:00:00.000Z",
        processedThroughUtc: null,
        lastProcessedSignalTs: null,
        currentTradingDate: null,
        accountState: {
          equityUsd: 25_000,
          startOfDayEquityUsd: 25_000,
          dailyPnlUsd: 0,
          consecutiveLosses: 0,
          cooldownUntilUtc: null
        },
        activePosition: null,
        updatedAtUtc: "2026-04-10T00:00:00.000Z"
      });

      const tradeCountBefore = store.countRows("trades");
      const paperStateCountBefore = store.countRows("paper_state");
      const output: string[] = [];

      await runCli(["research", "--db", dbPath, "--artifacts-dir", artifactsDir], {
        log: (message: string) => {
          output.push(message);
        }
      });

      expect(store.countRows("trades")).toBe(tradeCountBefore);
      expect(store.countRows("paper_state")).toBe(paperStateCountBefore);
      expect(output.some((line) => line.includes("Artifact JSON:"))).toBe(true);
      expect(output.some((line) => line.includes("Artifact Markdown:"))).toBe(true);
      expect(output.some((line) => line.includes("Recommendation: continue_paper"))).toBe(true);

      const reportFiles = await readdir(join(artifactsDir, "research"));
      expect(reportFiles.length).toBe(2);
      const jsonName = reportFiles.find((entry) => entry.endsWith(".json"));
      const markdownName = reportFiles.find((entry) => entry.endsWith(".md"));
      expect(jsonName).toBeTruthy();
      expect(markdownName).toBeTruthy();
      const raw = await readFile(join(artifactsDir, "research", jsonName!), "utf8");
      const parsed = JSON.parse(raw) as ResearchReportArtifact;
      expect(parsed.config?.path).toContain("config\\strategies\\session-filtered-trend-pullback-v1.json");
      expect(parsed.config?.sha256).toHaveLength(64);
      expect(parsed.finalAssessment.gatePass).toBe(true);
      expect(parsed.finalAssessment.recommendation).toBe("continue_paper");
      const markdown = await readFile(join(artifactsDir, "research", markdownName!), "utf8");
      expect(markdown).toContain("# Research Report");
      expect(markdown).toContain("Config SHA256:");
      expect(markdown).toContain("Gate pass: yes");
      expect(markdown).toContain("## Final Assessment");
    } finally {
      store.close();
    }
  });
});
