import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDashboardPublishBundle, writeDashboardPublishBundle } from "../src/reporting/dashboardPublish.js";

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

function buildMockMetrics(tradeCount: number, expectancyUsd: number) {
  return {
    tradeCount,
    winRate: tradeCount > 0 ? 55 : 0,
    netPnlUsd: tradeCount * expectancyUsd,
    expectancyUsd,
    profitFactor: tradeCount > 0 ? 1.4 : null,
    maxDrawdownUsd: 100,
    avgWinUsd: expectancyUsd * 2,
    avgLossUsd: -expectancyUsd,
    rejectedSignalCount: 0,
    sessionBreakdown: {
      ASIA: { tradeCount: 0, netPnlUsd: 0 },
      EUROPE: { tradeCount, netPnlUsd: tradeCount * expectancyUsd },
      US: { tradeCount: 0, netPnlUsd: 0 },
      CLOSED: { tradeCount: 0, netPnlUsd: 0 }
    },
    sideBreakdown: {
      BUY: { tradeCount, netPnlUsd: tradeCount * expectancyUsd },
      SELL: { tradeCount: 0, netPnlUsd: 0 }
    }
  };
}

function buildMockResearchArtifact() {
  return {
    generatedAtUtc: "2026-04-13T00:10:00.000Z",
    symbol: "MNQ",
    strategyId: "SessionFilteredTrendPullback_v1" as const,
    config: {
      path: "config/strategies/session-filtered-trend-pullback-v1.json",
      sha256: "a".repeat(64),
      summary: "default-profile"
    },
    runProvenance: {
      gitCommitSha: "abc123",
      nodeVersion: "v22.0.0",
      dbPath: "data/mnq-research.sqlite",
      eventWindowCount: 0,
      inputMode: "dir" as const,
      inputPath: "data/mnq_drop",
      sourceRange: {
        startUtc: "2018-01-01T00:00:00.000Z",
        endUtc: "2025-12-31T23:59:59.999Z"
      }
    },
    baseline: {
      train: { slice: "train" as const, range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: buildMockMetrics(30, 10) },
      validation: { slice: "validation" as const, range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: buildMockMetrics(25, 8) },
      test: { slice: "test" as const, range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: buildMockMetrics(22, 9) }
    },
    walkforward: {
      mode: "grid" as const,
      windowCount: 4,
      selectedWindowCount: 3,
      rolledUpMetrics: buildMockMetrics(20, 7),
      windows: []
    },
    sensitivity: {
      baselineCandidateId: "baseline",
      baselineRank: 1,
      totalCandidates: 3,
      stableCandidateCount: 2,
      topCandidates: []
    },
    eventComparison: {
      range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
      baselineScenario: "default" as const,
      scenarios: []
    },
    gateConfig: {
      minTrades: 20,
      minSelectedWalkforwardWindows: 2,
      minExpectancyUsd: 0,
      maxDrawdownUsd: 3750
    },
    gateResults: {
      baselineTestTrades: { passed: true, actual: 22, threshold: 20 },
      walkforwardTrades: { passed: true, actual: 20, threshold: 20 },
      selectedWalkforwardWindows: { passed: true, actual: 3, threshold: 2 },
      baselineTestExpectancy: { passed: true, actual: 9, threshold: 0 },
      walkforwardExpectancy: { passed: true, actual: 7, threshold: 0 },
      baselineTestMaxDrawdown: { passed: true, actual: 100, threshold: 3750 },
      walkforwardMaxDrawdown: { passed: true, actual: 90, threshold: 3750 },
      sensitivityTopCandidatesTrades: { passed: true, threshold: 20, passingCandidates: 2, totalCandidates: 3 }
    },
    finalAssessment: {
      baseline_test_positive_expectancy: true,
      walkforward_oos_positive_expectancy: true,
      parameter_stability_pass: true,
      event_filter_dependence: "low" as const,
      gatePass: true,
      gateFailureReasons: [],
      recommendation: "continue_paper" as const
    }
  };
}

vi.mock("../src/research/report.js", () => {
  return {
    ResearchReportRunner: class MockResearchReportRunner {
      constructor(..._args: unknown[]) {}
      run() {
        return buildMockResearchArtifact();
      }
    }
  };
});

async function seedPublishArtifacts(artifactsDir: string): Promise<void> {
  const batchDir = join(artifactsDir, "batch");
  const paperDir = join(artifactsDir, "paper");
  const researchDir = join(artifactsDir, "research");
  const dailyDir = join(artifactsDir, "daily");
  const opsDir = join(artifactsDir, "ops");
  await Promise.all([mkdir(batchDir, { recursive: true }), mkdir(paperDir, { recursive: true }), mkdir(researchDir, { recursive: true }), mkdir(dailyDir, { recursive: true }), mkdir(opsDir, { recursive: true })]);

  const batchJsonPath = join(batchDir, "batch-run-2026-04-13T00-00-00-000Z.json");
  const paperJsonPath = join(paperDir, "paper-report-2026-04-13T00-05-00-000Z.json");
  const researchJsonPath = join(researchDir, "research-report-2026-04-13T00-10-00-000Z.json");
  const dailyJsonPath = join(dailyDir, "daily-run-2026-04-13T00-15-00-000Z.json");
  const opsCompareJsonPath = join(opsDir, "ops-compare-2026-04-13T00-20-00-000Z.json");
  const opsReportJsonPath = join(opsDir, "ops-report-2026-04-13T00-18-00-000Z.json");

  await writeFile(
    batchJsonPath,
    JSON.stringify({
      generatedAtUtc: "2026-04-13T00:00:00.000Z",
      completedAtUtc: "2026-04-13T00:05:00.000Z",
      status: "completed",
      failedStep: null,
      strategyId: "SessionFilteredTrendPullback_v1",
      config: {
        path: "config/strategies/session-filtered-trend-pullback-v1.json",
        sha256: "a".repeat(64),
        summary: "default-profile"
      },
      runProvenance: {
        gitCommitSha: "abc123",
        nodeVersion: "v22.0.0",
        dbPath: "data/mnq-research.sqlite",
        eventWindowCount: 0,
        inputMode: "dir",
        inputPath: "data/mnq_drop",
        sourceRange: {
          startUtc: "2026-04-10T00:00:00.000Z",
          endUtc: "2026-04-10T01:59:00.000Z"
        }
      },
      ingestionSummary: {
        inputMode: "dir",
        inputPath: "data/mnq_drop",
        scannedFileCount: 2,
        newFileCount: 1,
        skippedFileCount: 1,
        failedFileCount: 0,
        insertedBarCount: 120,
        sourceRange: {
          startUtc: "2026-04-10T00:00:00.000Z",
          endUtc: "2026-04-10T01:59:00.000Z"
        },
        contracts: ["H26"]
      },
      steps: []
    }),
    "utf8"
  );

  await writeFile(
    paperJsonPath,
    JSON.stringify({
      generatedAtUtc: "2026-04-13T00:05:00.000Z",
      symbol: "MNQ",
      strategyId: "SessionFilteredTrendPullback_v1",
      config: {
        path: "config/strategies/session-filtered-trend-pullback-v1.json",
        sha256: "a".repeat(64),
        summary: "default-profile"
      },
      runProvenance: {
        gitCommitSha: "abc123",
        nodeVersion: "v22.0.0",
        dbPath: "data/mnq-research.sqlite",
        eventWindowCount: 0,
        inputMode: "dir",
        inputPath: "data/mnq_drop",
        sourceRange: {
          startUtc: "2026-04-10T00:00:00.000Z",
          endUtc: "2026-04-10T01:59:00.000Z"
        }
      },
      source: "PAPER",
      run: {
        startUtc: "2026-04-13T00:00:00.000Z",
        endUtc: null,
        processedThroughUtc: "2026-04-13T00:05:00.000Z",
        newTradeCount: 2,
        rejectedSignalCount: 0,
        artifactVersion: "0.1.0"
      },
      activePosition: null,
      runMetrics: {
        tradeCount: 2,
        winRate: 50,
        netPnlUsd: 10,
        expectancyUsd: 5,
        profitFactor: 1.2,
        maxDrawdownUsd: 20,
        avgWinUsd: 15,
        avgLossUsd: -5,
        rejectedSignalCount: 0,
        sessionBreakdown: {
          ASIA: { tradeCount: 0, netPnlUsd: 0 },
          EUROPE: { tradeCount: 1, netPnlUsd: 5 },
          US: { tradeCount: 1, netPnlUsd: 5 },
          CLOSED: { tradeCount: 0, netPnlUsd: 0 }
        },
        sideBreakdown: {
          BUY: { tradeCount: 2, netPnlUsd: 10 },
          SELL: { tradeCount: 0, netPnlUsd: 0 }
        }
      },
      cumulativeMetrics: {
        tradeCount: 2,
        winRate: 50,
        netPnlUsd: 10,
        expectancyUsd: 5,
        profitFactor: 1.2,
        maxDrawdownUsd: 20,
        avgWinUsd: 15,
        avgLossUsd: -5,
        rejectedSignalCount: 0,
        sessionBreakdown: {
          ASIA: { tradeCount: 0, netPnlUsd: 0 },
          EUROPE: { tradeCount: 1, netPnlUsd: 5 },
          US: { tradeCount: 1, netPnlUsd: 5 },
          CLOSED: { tradeCount: 0, netPnlUsd: 0 }
        },
        sideBreakdown: {
          BUY: { tradeCount: 2, netPnlUsd: 10 },
          SELL: { tradeCount: 0, netPnlUsd: 0 }
        }
      },
      dailyPerformance: [],
      sessionPerformance: []
    }),
    "utf8"
  );

  await writeFile(
    researchJsonPath,
    JSON.stringify({
      generatedAtUtc: "2026-04-13T00:10:00.000Z",
      symbol: "MNQ",
      strategyId: "SessionFilteredTrendPullback_v1",
      config: {
        path: "config/strategies/session-filtered-trend-pullback-v1.json",
        sha256: "a".repeat(64),
        summary: "default-profile"
      },
      runProvenance: {
        gitCommitSha: "abc123",
        nodeVersion: "v22.0.0",
        dbPath: "data/mnq-research.sqlite",
        eventWindowCount: 0,
        inputMode: "dir",
        inputPath: "data/mnq_drop",
        sourceRange: {
          startUtc: "2018-01-01T00:00:00.000Z",
          endUtc: "2025-12-31T23:59:59.999Z"
        }
      },
      baseline: {
        train: { slice: "train", range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: emptyMetrics(30, 10) },
        validation: { slice: "validation", range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: emptyMetrics(25, 8) },
        test: { slice: "test", range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: emptyMetrics(22, 9) }
      },
      walkforward: {
        mode: "grid",
        windowCount: 4,
        selectedWindowCount: 3,
        rolledUpMetrics: emptyMetrics(20, 7),
        windows: []
      },
      sensitivity: {
        baselineCandidateId: "baseline",
        baselineRank: 1,
        totalCandidates: 3,
        stableCandidateCount: 2,
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
        baselineTestTrades: { passed: true, actual: 22, threshold: 20 },
        walkforwardTrades: { passed: true, actual: 20, threshold: 20 },
        selectedWalkforwardWindows: { passed: true, actual: 3, threshold: 2 },
        baselineTestExpectancy: { passed: true, actual: 9, threshold: 0 },
        walkforwardExpectancy: { passed: true, actual: 7, threshold: 0 },
        baselineTestMaxDrawdown: { passed: true, actual: 100, threshold: 3750 },
        walkforwardMaxDrawdown: { passed: true, actual: 90, threshold: 3750 },
        sensitivityTopCandidatesTrades: { passed: true, threshold: 20, passingCandidates: 2, totalCandidates: 3 }
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
    }),
    "utf8"
  );

  await writeFile(
    dailyJsonPath,
    JSON.stringify({
      generatedAtUtc: "2026-04-13T00:15:00.000Z",
      batchStatus: "completed",
      failedStep: null,
      overallStatus: "WARN",
      warningCodes: ["NO_NEW_FILES", "NO_NEW_PAPER_TRADES"],
      warningMessages: [],
      healthChecks: [],
      ingestionSummary: {
        inputMode: "dir",
        inputPath: "data/mnq_drop",
        scannedFileCount: 2,
        newFileCount: 0,
        skippedFileCount: 2,
        failedFileCount: 0,
        insertedBarCount: 0,
        sourceRange: {
          startUtc: "2026-04-10T00:00:00.000Z",
          endUtc: "2026-04-10T01:59:00.000Z"
        },
        contracts: ["H26"]
      },
      paperNewTrades: 0,
      researchRecommendation: "research_more",
      researchGatePass: true,
      artifactPaths: {
        batchJsonPath,
        paperJsonPath,
        researchJsonPath,
        dailyJsonPath,
        dailyMarkdownPath: null
      },
      operationsSummary: null,
      config: {
        path: "config/strategies/session-filtered-trend-pullback-v1.json",
        sha256: "a".repeat(64),
        summary: "default-profile"
      },
      runProvenance: {
        gitCommitSha: "abc123",
        nodeVersion: "v22.0.0",
        dbPath: "data/mnq-research.sqlite",
        eventWindowCount: 0,
        inputMode: "dir",
        inputPath: "data/mnq_drop",
        sourceRange: {
          startUtc: "2026-04-10T00:00:00.000Z",
          endUtc: "2026-04-10T01:59:00.000Z"
        }
      },
      batchGeneratedAtUtc: "2026-04-13T00:00:00.000Z",
      paperGeneratedAtUtc: "2026-04-13T00:05:00.000Z",
      researchGeneratedAtUtc: "2026-04-13T00:10:00.000Z",
      historySnapshot: {
        windowSize: 3,
        okCount: 1,
        warnCount: 2,
        failCount: 0,
        consecutiveFailCount: 0,
        consecutiveNonOkCount: 2,
        latestOkGeneratedAtUtc: "2026-04-12T00:15:00.000Z",
        latestFailGeneratedAtUtc: null,
        warningCodeCounts: [
          { code: "NO_NEW_FILES", count: 2 },
          { code: "NO_NEW_PAPER_TRADES", count: 1 }
        ],
        escalationLevel: "ATTENTION",
        escalationCodes: ["REPEATED_NO_NEW_FILES"]
      }
    }),
    "utf8"
  );

  await writeFile(
    opsReportJsonPath,
    JSON.stringify({
      generatedAtUtc: "2026-04-13T00:18:00.000Z",
      artifactsDir,
      windowSize: 14,
      minEscalation: "ATTENTION",
      summary: {
        latestStatus: "WARN",
        latestWarningCodes: ["NO_NEW_FILES"],
        recentRunCount: 3,
        windowSize: 3,
        okCount: 1,
        warnCount: 2,
        failCount: 0,
        consecutiveFailCount: 0,
        consecutiveNonOkCount: 2,
        latestOkGeneratedAtUtc: "2026-04-12T00:15:00.000Z",
        latestFailGeneratedAtUtc: null,
        warningCodeCounts: [{ code: "NO_NEW_FILES", count: 2 }],
        escalationLevel: "ATTENTION",
        escalationCodes: ["REPEATED_NO_NEW_FILES"]
      },
      candidateCount: 1,
      candidates: []
    }),
    "utf8"
  );

  await writeFile(
    opsCompareJsonPath,
    JSON.stringify({
      generatedAtUtc: "2026-04-13T00:20:00.000Z",
      artifactsDir,
      windowSize: 30,
      minEscalation: "ATTENTION",
      configHashFilter: null,
      scannedRunCount: 3,
      candidateCount: 2,
      statusCounts: { OK: 0, WARN: 2, FAIL: 0 },
      escalationCounts: { ATTENTION: 2, CRITICAL: 0 },
      byConfig: [
        {
          sha256: "a".repeat(64),
          summary: "default-profile",
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          candidateCount: 2,
          lastSeenGeneratedAtUtc: "2026-04-13T00:15:00.000Z",
          statusCounts: { OK: 0, WARN: 2, FAIL: 0 },
          escalationCounts: { ATTENTION: 2, CRITICAL: 0 },
          topWarningCodes: [
            { code: "NO_NEW_FILES", count: 2 },
            { code: "NO_NEW_PAPER_TRADES", count: 1 }
          ],
          latestRecommendation: "research_more",
          latestFailedStep: "none"
        }
      ],
      byWarningCode: [
        {
          code: "NO_NEW_FILES",
          candidateCount: 2,
          latestSeenGeneratedAtUtc: "2026-04-13T00:15:00.000Z",
          uniqueConfigCount: 1,
          configs: [
            {
              path: "config/strategies/session-filtered-trend-pullback-v1.json",
              sha256: "a".repeat(64),
              summary: "default-profile"
            }
          ]
        }
      ],
      byFailedStep: [
        {
          failedStep: "none",
          candidateCount: 2,
          latestSeenGeneratedAtUtc: "2026-04-13T00:15:00.000Z"
        }
      ],
      byRecommendation: [
        {
          recommendation: "research_more",
          candidateCount: 2,
          latestSeenGeneratedAtUtc: "2026-04-13T00:15:00.000Z"
        }
      ],
      topHotspots: [
        {
          sha256: "a".repeat(64),
          summary: "default-profile",
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          candidateCount: 2,
          lastSeenGeneratedAtUtc: "2026-04-13T00:15:00.000Z",
          statusCounts: { OK: 0, WARN: 2, FAIL: 0 },
          escalationCounts: { ATTENTION: 2, CRITICAL: 0 },
          topWarningCodes: [
            { code: "NO_NEW_FILES", count: 2 },
            { code: "NO_NEW_PAPER_TRADES", count: 1 }
          ],
          latestRecommendation: "research_more",
          latestFailedStep: "none"
        }
      ]
    }),
    "utf8"
  );
}

const emptyMetrics = buildMockMetrics;

describe("dashboard publish", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("builds a normalized dashboard snapshot from latest artifacts", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "dashboard-publish-"));
    const outDir = join(artifactsDir, "publish");
    tempDirs.push(artifactsDir);
    await seedPublishArtifacts(artifactsDir);

    const bundle = await buildDashboardPublishBundle(artifactsDir, outDir);

    expect(bundle.manifest.configSummaries).toHaveLength(1);
    expect(bundle.manifest.latestArtifacts.opsCompareJsonPath).toContain("ops-compare");
    expect(bundle.manifest.artifactsDir).toContain("dashboard-publish-");
    expect(bundle.manifest.outDir).toContain("publish");
    expect(bundle.manifest.configSummaries[0]?.path).toBe("config/strategies/session-filtered-trend-pullback-v1.json");
    expect(bundle.overview.latestDailyStatus).toBe("WARN");
    expect(bundle.overview.latestEscalationLevel).toBe("ATTENTION");
    expect(bundle.overview.topHotspot?.summary).toBe("default-profile");
    expect(bundle.overview.topHotspot?.path).toBe("config/strategies/session-filtered-trend-pullback-v1.json");
    expect(bundle.dailyRuns).toHaveLength(1);
    expect(bundle.dailyRuns[0]?.warningCodes).toContain("NO_NEW_FILES");
    expect(bundle.dailyRuns[0]?.dailyJsonPath).toContain("daily/daily-run-");
    expect(bundle.hotspots.topHotspots[0]?.candidateCount).toBe(2);
    expect(bundle.research.recommendation).toBe("continue_paper");
    expect(bundle.research.walkforwardOosExpectancyUsd).toBe(7);

    const paths = await writeDashboardPublishBundle(bundle, outDir);
    expect((await readdir(outDir)).sort()).toEqual([
      "daily-runs.json",
      "hotspots.json",
      "manifest.json",
      "overview.json",
      "research.json"
    ]);
    const overview = JSON.parse(await readFile(paths.overviewPath, "utf8")) as { latestDailyStatus: string; topHotspot: { summary: string } | null };
    expect(overview.latestDailyStatus).toBe("WARN");
    expect(overview.topHotspot?.summary).toBe("default-profile");
  });

  it("returns stable empty fallbacks when no artifacts have been published", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "dashboard-publish-empty-"));
    tempDirs.push(artifactsDir);
    const bundle = await buildDashboardPublishBundle(artifactsDir, join(artifactsDir, "publish"));

    expect(bundle.manifest.configSummaries).toEqual([]);
    expect(bundle.overview.latestDailyStatus).toBeNull();
    expect(bundle.dailyRuns).toEqual([]);
    expect(bundle.hotspots.candidateCount).toBe(0);
    expect(bundle.research.recommendation).toBeNull();
  });

  it("runs cloud-daily and publishes dashboard data", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const { SqliteStore } = await import("../src/storage/sqliteStore.js");
    const tempDir = await mkdtemp(join(tmpdir(), "cloud-daily-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "cloud.sqlite");
    const artifactsDir = join(tempDir, "artifacts");
    const dashboardOut = join(tempDir, "dashboard-data");
    const inputDir = join(tempDir, "input");
    await mkdir(inputDir, { recursive: true });

    const store = new SqliteStore(dbPath);
    try {
      store.insertBars("1m", [
        {
          symbol: "MNQ",
          contract: "H26",
          tsUtc: "2018-01-01T00:00:00.000Z",
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1,
          sessionLabel: "CLOSED"
        },
        {
          symbol: "MNQ",
          contract: "H26",
          tsUtc: "2026-04-10T00:00:00.000Z",
          open: 101,
          high: 102,
          low: 100,
          close: 101.5,
          volume: 1,
          sessionLabel: "CLOSED"
        }
      ]);
    } finally {
      store.close();
    }

    const output: string[] = [];
    await runCli(
      ["cloud-daily", "--db", dbPath, "--artifacts-dir", artifactsDir, "--input-dir", inputDir, "--dashboard-out", dashboardOut],
      {
        log: (message: string) => output.push(message)
      }
    );

    expect(output.some((line) => line.includes("Daily run summary"))).toBe(true);
    expect(output.some((line) => line.includes("Operations report"))).toBe(true);
    expect(output.some((line) => line.includes("Operations compare"))).toBe(true);
    expect(output.some((line) => line.includes("Dashboard publish"))).toBe(true);
    expect(output.some((line) => line.includes("Dashboard manifest JSON:"))).toBe(true);
    expect((await readdir(dashboardOut)).sort()).toEqual([
      "daily-runs.json",
      "hotspots.json",
      "manifest.json",
      "overview.json",
      "research.json"
    ]);
  });
});
