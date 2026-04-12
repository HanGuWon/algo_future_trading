import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDailyAutomationSpec } from "../src/automation/dailyAutomation.js";
import { buildDailyRunSummary, renderDailyRunSummary, resolveLatestDailyArtifacts } from "../src/reporting/dailyRun.js";
import { SqliteStore } from "../src/storage/sqliteStore.js";
import type { ResearchReportArtifact } from "../src/types.js";

const mockPassingResearchArtifact: ResearchReportArtifact = {
  generatedAtUtc: "2026-04-12T00:00:00.000Z",
  symbol: "MNQ",
  strategyId: "SessionFilteredTrendPullback_v1",
  runProvenance: {
    gitCommitSha: "abc123",
    nodeVersion: "v22.0.0",
    dbPath: "mock.sqlite",
    eventWindowCount: 0,
    inputMode: "dir",
    inputPath: "C:\\data\\mnq_drop",
    sourceRange: {
      startUtc: "2018-01-01T00:00:00.000Z",
      endUtc: "2025-12-31T23:59:59.999Z"
    }
  },
  baseline: {
    train: { slice: "train", range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25) },
    validation: { slice: "validation", range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25) },
    test: { slice: "test", range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25) }
  },
  walkforward: {
    mode: "grid",
    windowCount: 3,
    selectedWindowCount: 2,
    rolledUpMetrics: emptyMetrics(24),
    windows: []
  },
  sensitivity: {
    baselineCandidateId: "fast20_slow120_score3_post60",
    baselineRank: 1,
    totalCandidates: 3,
    stableCandidateCount: 3,
    topCandidates: []
  },
  eventComparison: {
    range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
    baselineScenario: "default",
    scenarios: []
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
    sensitivityTopCandidatesTrades: { passed: true, threshold: 20, passingCandidates: 3, totalCandidates: 3 }
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

vi.mock("../src/calendars/officialCalendarProvider.js", () => {
  return {
    OfficialCalendarProvider: class MockOfficialCalendarProvider {
      constructor(..._args: unknown[]) {}
      async syncToFile() {
        return [];
      }
    }
  };
});

vi.mock("../src/research/report.js", () => {
  return {
    ResearchReportRunner: class MockResearchReportRunner {
      constructor(..._args: unknown[]) {}
      run() {
        return mockPassingResearchArtifact;
      }
    }
  };
});

describe("daily CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("resolves latest batch, paper, and research artifacts", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "daily-latest-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "batch"), { recursive: true });
    await mkdir(join(artifactsDir, "paper"), { recursive: true });
    await mkdir(join(artifactsDir, "research"), { recursive: true });
    await writeFile(join(artifactsDir, "batch", "batch-run-2026-04-11T00-00-00-000Z.json"), JSON.stringify({
      generatedAtUtc: "2026-04-11T00:00:00.000Z",
      completedAtUtc: "2026-04-11T00:05:00.000Z",
      status: "completed",
      failedStep: null,
      strategyId: "SessionFilteredTrendPullback_v1",
      config: { path: "config/a.json", sha256: "a".repeat(64), summary: "a" },
      runProvenance: { gitCommitSha: null, nodeVersion: "v22", dbPath: null, eventWindowCount: 0, inputMode: "none", inputPath: null, sourceRange: null },
      ingestionSummary: null,
      steps: []
    }), "utf8");
    await writeFile(join(artifactsDir, "paper", "paper-report-2026-04-11T00-00-00-000Z.json"), JSON.stringify({
      generatedAtUtc: "2026-04-11T00:00:00.000Z",
      symbol: "MNQ",
      strategyId: "SessionFilteredTrendPullback_v1",
      runProvenance: { gitCommitSha: null, nodeVersion: "v22", dbPath: null, eventWindowCount: 0, inputMode: "none", inputPath: null, sourceRange: null },
      source: "PAPER",
      run: { startUtc: "2026-04-11T00:00:00.000Z", endUtc: null, processedThroughUtc: "2026-04-11T00:00:00.000Z", newTradeCount: 1, rejectedSignalCount: 0, artifactVersion: "0.1.0" },
      activePosition: null,
      runMetrics: emptyMetrics(1),
      cumulativeMetrics: emptyMetrics(1),
      dailyPerformance: [],
      sessionPerformance: []
    }), "utf8");
    await writeFile(join(artifactsDir, "research", "research-report-2026-04-11T00-00-00-000Z.json"), JSON.stringify(mockPassingResearchArtifact), "utf8");

    const latest = await resolveLatestDailyArtifacts(artifactsDir);
    expect(latest.pointers.batchJsonPath).toContain("batch-run-2026-04-11");
    expect(latest.pointers.paperJsonPath).toContain("paper-report-2026-04-11");
    expect(latest.pointers.researchJsonPath).toContain("research-report-2026-04-11");
  });

  it("formats a stable summary payload", () => {
    const summary = buildDailyRunSummary({
      pointers: {
        batchJsonPath: "batch.json",
        paperJsonPath: "paper.json",
        researchJsonPath: "research.json"
      },
      batchArtifact: {
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        completedAtUtc: "2026-04-12T00:05:00.000Z",
        status: "completed",
        failedStep: null,
        strategyId: "SessionFilteredTrendPullback_v1",
        config: { path: "config/a.json", sha256: "a".repeat(64), summary: "a" },
        runProvenance: { gitCommitSha: null, nodeVersion: "v22", dbPath: null, eventWindowCount: 0, inputMode: "dir", inputPath: "C:\\data", sourceRange: null },
        ingestionSummary: {
          inputMode: "dir",
          inputPath: "C:\\data",
          scannedFileCount: 2,
          newFileCount: 1,
          skippedFileCount: 1,
          failedFileCount: 0,
          insertedBarCount: 120,
          sourceRange: { startUtc: "2026-04-10T00:00:00.000Z", endUtc: "2026-04-10T01:59:00.000Z" },
          contracts: ["H26"]
        },
        steps: [
          { step: "paper", status: "completed", startedAtUtc: "", completedAtUtc: "", message: "" },
          { step: "research", status: "completed", startedAtUtc: "", completedAtUtc: "", message: "" }
        ]
      },
      paperArtifact: {
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        runProvenance: { gitCommitSha: null, nodeVersion: "v22", dbPath: null, eventWindowCount: 0, inputMode: "none", inputPath: null, sourceRange: null },
        source: "PAPER",
        run: { startUtc: "", endUtc: null, processedThroughUtc: null, newTradeCount: 2, rejectedSignalCount: 0, artifactVersion: "0.1.0" },
        activePosition: null,
        runMetrics: emptyMetrics(2),
        cumulativeMetrics: emptyMetrics(2),
        dailyPerformance: [],
        sessionPerformance: []
      },
      researchArtifact: mockPassingResearchArtifact
    });

    const lines = renderDailyRunSummary(summary);
    expect(lines).toContain("Batch status: completed");
    expect(lines).toContain("Scanned files: 2");
    expect(lines).toContain("Paper new trades: 2");
    expect(lines).toContain("Research recommendation: continue_paper");
    expect(lines).toContain("Research gate pass: yes");
  });

  it("runs daily, prints summary, and exits successfully when no new CSV files arrive", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "daily-cli-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "daily.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const calendarOut = join(tempDir, "official-events.json");
    const inputDir = join(tempDir, "input");
    await mkdir(inputDir, { recursive: true });
    const store = new SqliteStore(dbPath);
    try {
      store.insertBars("1m", [
        {
          symbol: "MNQ",
          contract: "H26",
          tsUtc: "2018-01-01T00:00:00.000Z",
          open: 99,
          high: 100,
          low: 98,
          close: 99.5,
          volume: 1,
          sessionLabel: "CLOSED"
        },
        {
          symbol: "MNQ",
          contract: "H26",
          tsUtc: "2026-04-10T00:00:00.000Z",
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1,
          sessionLabel: "CLOSED"
        }
      ]);
    } finally {
      store.close();
    }

    const output: string[] = [];
    await runCli(["daily", "--db", dbPath, "--artifacts-dir", artifactsDir, "--out", calendarOut, "--input-dir", inputDir], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Daily run summary"))).toBe(true);
    expect(output.some((line) => line.includes("Batch status: completed"))).toBe(true);
    expect(output.some((line) => line.includes("New files: 0"))).toBe(true);
    expect(output.some((line) => line.includes("Research recommendation: continue_paper"))).toBe(true);
    expect(output.some((line) => line.includes("Automation schedule: Every day at 06:00 Asia/Seoul"))).toBe(true);
  });

  it("surfaces ingest failure and still prints a summary", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const tempDir = await mkdtemp(join(tmpdir(), "daily-cli-fail-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "daily.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const calendarOut = join(tempDir, "official-events.json");
    const inputDir = join(tempDir, "input");
    await mkdir(inputDir, { recursive: true });
    await writeFile(
      join(inputDir, "bad.csv"),
      [
        "tsUtc,contract,open,high,low,close,volume",
        "2026-04-10T00:00:30.000Z,H26,100,101,99,100.5,1"
      ].join("\n"),
      "utf8"
    );

    const output: string[] = [];
    await expect(
      runCli(["daily", "--db", dbPath, "--artifacts-dir", artifactsDir, "--out", calendarOut, "--input-dir", inputDir], {
        log: (message: string) => {
          output.push(message);
        }
      })
    ).rejects.toThrow("batch failed at step ingest");

    expect(output.some((line) => line.includes("Daily run summary"))).toBe(true);
    expect(output.some((line) => line.includes("Batch status: failed"))).toBe(true);
    expect(output.some((line) => line.includes("Failed step: ingest"))).toBe(true);
  });

  it("builds an automation spec with the expected schedule and command", () => {
    const spec = buildDailyAutomationSpec({
      dbPath: "data/mnq-research.sqlite",
      configPath: "config/strategies/session-filtered-trend-pullback-v1.json",
      artifactsDir: "artifacts",
      inputDir: "data/mnq_drop",
      cwd: "C:\\Users\\한구원\\Desktop\\algo_future_trading"
    });

    expect(spec.name).toBe("MNQ Daily Run");
    expect(spec.scheduleLabel).toBe("Every day at 06:00 Asia/Seoul");
    expect(spec.cwd).toBe("C:\\Users\\한구원\\Desktop\\algo_future_trading");
    expect(spec.command).toContain('npm run daily --');
    expect(spec.command).toContain('--input-dir "data/mnq_drop"');
  });
});
