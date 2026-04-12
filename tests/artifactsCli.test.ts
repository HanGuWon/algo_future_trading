import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("artifacts CLI", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("builds index json and markdown for latest paper/research/walkforward/batch/daily artifacts", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-"));
    tempDirs.push(artifactsDir);
    await writeFile(
      join(artifactsDir, "walkforward-2026-04-11T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        symbol: "MNQ",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.research-tight.json",
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          summary: "fast=30 slow=120 score=4 postEvent=120"
        },
        mode: "grid",
        sourceRange: {
          startUtc: "2026-01-01T00:00:00.000Z",
          endUtc: "2026-02-01T00:00:00.000Z"
        },
        windowSpec: {
          trainDays: 10,
          validationDays: 5,
          testDays: 5,
          stepDays: 5
        },
        windows: [],
        rolledUpMetrics: {
          tradeCount: 2,
          winRate: 50,
          netPnlUsd: 25,
          expectancyUsd: 12.5,
          profitFactor: 1.2,
          maxDrawdownUsd: 10,
          avgWinUsd: 20,
          avgLossUsd: -5,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 1, netPnlUsd: 10 },
            US: { tradeCount: 1, netPnlUsd: 15 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 1, netPnlUsd: 25 },
            SELL: { tradeCount: 1, netPnlUsd: 0 }
          }
        }
      }),
      "utf8"
    );
    await writeFile(join(artifactsDir, "walkforward-2026-04-11T00-00-00-000Z.md"), "# Walk-Forward Report", "utf8");

    const paperDir = join(artifactsDir, "paper");
    const researchDir = join(artifactsDir, "research");
    const batchDir = join(artifactsDir, "batch");
    const dailyDir = join(artifactsDir, "daily");
    await mkdir(paperDir, { recursive: true });
    await mkdir(researchDir, { recursive: true });
    await mkdir(batchDir, { recursive: true });
    await mkdir(dailyDir, { recursive: true });
    await writeFile(
      join(paperDir, "paper-report-2026-04-11T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "fast=20 slow=120 score=3 postEvent=60"
        },
        source: "PAPER",
        run: {
          startUtc: "2026-04-10T00:00:00.000Z",
          endUtc: null,
          processedThroughUtc: "2026-04-11T00:00:00.000Z",
          newTradeCount: 1,
          rejectedSignalCount: 0,
          artifactVersion: "0.1.0"
        },
        activePosition: null,
        runMetrics: {
          tradeCount: 1,
          winRate: 100,
          netPnlUsd: 10,
          expectancyUsd: 10,
          profitFactor: 1.5,
          maxDrawdownUsd: 0,
          avgWinUsd: 10,
          avgLossUsd: 0,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 1, netPnlUsd: 10 },
            US: { tradeCount: 0, netPnlUsd: 0 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 1, netPnlUsd: 10 },
            SELL: { tradeCount: 0, netPnlUsd: 0 }
          }
        },
        cumulativeMetrics: {
          tradeCount: 2,
          winRate: 50,
          netPnlUsd: 5,
          expectancyUsd: 2.5,
          profitFactor: 1.1,
          maxDrawdownUsd: 3,
          avgWinUsd: 7,
          avgLossUsd: -2,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 2, netPnlUsd: 5 },
            US: { tradeCount: 0, netPnlUsd: 0 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 2, netPnlUsd: 5 },
            SELL: { tradeCount: 0, netPnlUsd: 0 }
          }
        },
        dailyPerformance: [],
        sessionPerformance: []
      }),
      "utf8"
    );
    await writeFile(join(paperDir, "paper-report-2026-04-11T00-00-00-000Z.md"), "# Paper Report", "utf8");

    await writeFile(
      join(researchDir, "research-report-2026-04-11T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          summary: "fast=20 slow=120 score=3 postEvent=60"
        },
        baseline: {
          train: {
            slice: "train",
            range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" },
            metrics: {
              tradeCount: 1,
              winRate: 100,
              netPnlUsd: 10,
              expectancyUsd: 10,
              profitFactor: 1.5,
              maxDrawdownUsd: 0,
              avgWinUsd: 10,
              avgLossUsd: 0,
              rejectedSignalCount: 0,
              sessionBreakdown: {
                ASIA: { tradeCount: 0, netPnlUsd: 0 },
                EUROPE: { tradeCount: 1, netPnlUsd: 10 },
                US: { tradeCount: 0, netPnlUsd: 0 },
                CLOSED: { tradeCount: 0, netPnlUsd: 0 }
              },
              sideBreakdown: {
                BUY: { tradeCount: 1, netPnlUsd: 10 },
                SELL: { tradeCount: 0, netPnlUsd: 0 }
              }
            }
          },
          validation: {
            slice: "validation",
            range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" },
            metrics: {
              tradeCount: 1,
              winRate: 100,
              netPnlUsd: 10,
              expectancyUsd: 10,
              profitFactor: 1.5,
              maxDrawdownUsd: 0,
              avgWinUsd: 10,
              avgLossUsd: 0,
              rejectedSignalCount: 0,
              sessionBreakdown: {
                ASIA: { tradeCount: 0, netPnlUsd: 0 },
                EUROPE: { tradeCount: 1, netPnlUsd: 10 },
                US: { tradeCount: 0, netPnlUsd: 0 },
                CLOSED: { tradeCount: 0, netPnlUsd: 0 }
              },
              sideBreakdown: {
                BUY: { tradeCount: 1, netPnlUsd: 10 },
                SELL: { tradeCount: 0, netPnlUsd: 0 }
              }
            }
          },
          test: {
            slice: "test",
            range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
            metrics: {
              tradeCount: 1,
              winRate: 100,
              netPnlUsd: 10,
              expectancyUsd: 10,
              profitFactor: 1.5,
              maxDrawdownUsd: 0,
              avgWinUsd: 10,
              avgLossUsd: 0,
              rejectedSignalCount: 0,
              sessionBreakdown: {
                ASIA: { tradeCount: 0, netPnlUsd: 0 },
                EUROPE: { tradeCount: 1, netPnlUsd: 10 },
                US: { tradeCount: 0, netPnlUsd: 0 },
                CLOSED: { tradeCount: 0, netPnlUsd: 0 }
              },
              sideBreakdown: {
                BUY: { tradeCount: 1, netPnlUsd: 10 },
                SELL: { tradeCount: 0, netPnlUsd: 0 }
              }
            }
          }
        },
        walkforward: {
          mode: "grid",
          windowCount: 1,
          selectedWindowCount: 1,
          rolledUpMetrics: {
            tradeCount: 1,
            winRate: 100,
            netPnlUsd: 10,
            expectancyUsd: 10,
            profitFactor: 1.5,
            maxDrawdownUsd: 0,
            avgWinUsd: 10,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 1, netPnlUsd: 10 },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 1, netPnlUsd: 10 },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          windows: []
        },
        sensitivity: {
          baselineCandidateId: "fast20_slow120_score3_post60",
          baselineRank: 1,
          totalCandidates: 1,
          stableCandidateCount: 1,
          topCandidates: []
        },
        eventComparison: {
          range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
          baselineScenario: "default",
          scenarios: []
        },
        finalAssessment: {
          baseline_test_positive_expectancy: true,
          walkforward_oos_positive_expectancy: true,
          parameter_stability_pass: true,
          event_filter_dependence: "low",
          recommendation: "continue_paper"
        }
      }),
      "utf8"
    );
    await writeFile(join(researchDir, "research-report-2026-04-11T00-00-00-000Z.md"), "# Research Report", "utf8");
    await writeFile(
      join(batchDir, "batch-run-2026-04-11T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-11T00:00:00.000Z",
        completedAtUtc: "2026-04-11T00:05:00.000Z",
        status: "completed",
        failedStep: null,
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          summary: "batch-profile"
        },
        runProvenance: {
          gitCommitSha: "abc123",
          nodeVersion: "v22.0.0",
          dbPath: "data/test.sqlite",
          eventWindowCount: 0,
          inputMode: "dir",
          inputPath: "C:\\\\data\\\\mnq",
          sourceRange: null
        },
        ingestionSummary: {
          inputMode: "dir",
          inputPath: "C:\\\\data\\\\mnq",
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
      join(dailyDir, "daily-run-2026-04-11T00-10-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-11T00:10:00.000Z",
        overallStatus: "WARN",
        batchStatus: "completed",
        failedStep: null,
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          summary: "daily-profile"
        },
        runProvenance: {
          gitCommitSha: "abc123",
          nodeVersion: "v22.0.0",
          dbPath: "data/test.sqlite",
          eventWindowCount: 0,
          inputMode: "dir",
          inputPath: "C:\\\\data\\\\mnq",
          sourceRange: null
        },
        warningCodes: ["NO_NEW_FILES"],
        warningMessages: ["No new CSV files were ingested in this run."],
        healthChecks: [
          {
            code: "NO_NEW_FILES",
            severity: "WARN",
            passed: false,
            message: "No new CSV files were ingested in this run."
          }
        ],
        ingestionSummary: null,
        paperNewTrades: 0,
        researchRecommendation: "research_more",
        researchGatePass: true,
        artifactPaths: {
          batchJsonPath: join(batchDir, "batch-run-2026-04-11T00-00-00-000Z.json"),
          paperJsonPath: join(paperDir, "paper-report-2026-04-11T00-00-00-000Z.json"),
          researchJsonPath: join(researchDir, "research-report-2026-04-11T00-00-00-000Z.json"),
          dailyJsonPath: join(dailyDir, "daily-run-2026-04-11T00-10-00-000Z.json"),
          dailyMarkdownPath: join(dailyDir, "daily-run-2026-04-11T00-10-00-000Z.md")
        },
        batchGeneratedAtUtc: "2026-04-11T00:00:00.000Z",
        paperGeneratedAtUtc: "2026-04-11T00:00:00.000Z",
        researchGeneratedAtUtc: "2026-04-11T00:00:00.000Z",
        historySnapshot: {
          windowSize: 4,
          okCount: 1,
          warnCount: 2,
          failCount: 1,
          consecutiveFailCount: 0,
          consecutiveNonOkCount: 2,
          latestOkGeneratedAtUtc: "2026-04-10T00:10:00.000Z",
          latestFailGeneratedAtUtc: "2026-04-09T00:10:00.000Z",
          warningCodeCounts: [
            { code: "NO_NEW_FILES", count: 2 },
            { code: "RESEARCH_MORE", count: 1 }
          ]
        }
      }),
      "utf8"
    );
    await writeFile(join(dailyDir, "daily-run-2026-04-11T00-10-00-000Z.md"), "# Daily Run", "utf8");

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Artifact index complete"))).toBe(true);
    expect(output.some((line) => line.includes("Latest paper:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest research:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest walk-forward:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest batch:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest daily:"))).toBe(true);
    expect(output.some((line) => line.includes("Daily reports: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles shown: 5"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles total: 5"))).toBe(true);
    expect(output.some((line) => line.includes("Top config group:"))).toBe(true);

    const topFiles = await readdir(artifactsDir);
    expect(topFiles).toContain("index.json");
    expect(topFiles).toContain("index.md");
    const indexMarkdown = await readFile(join(artifactsDir, "index.md"), "utf8");
    expect(indexMarkdown).toContain("## By Config Hash");
    expect(indexMarkdown).toContain("fast=20 slow=120 score=3 postEvent=60");
    expect(indexMarkdown).toContain("aaaaaaaaaaaa");
    expect(indexMarkdown).toContain("cccccccccccc");
    expect(indexMarkdown).toContain("Latest batch");
    expect(indexMarkdown).toContain("Latest daily");
    expect(indexMarkdown).toContain("daily-profile");
    expect(indexMarkdown).toContain("Fail streak: 0");
    expect(indexMarkdown).toContain("Top warnings: NO_NEW_FILES:2, RESEARCH_MORE:1");
  });

  it("filters the artifact index by config hash prefix", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-filter-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "paper"), { recursive: true });
    await writeFile(
      join(artifactsDir, "paper", "paper-report-2026-04-12T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "fast=20 slow=120 score=3 postEvent=60"
        },
        source: "PAPER",
        run: {
          startUtc: "2026-04-12T00:00:00.000Z",
          endUtc: null,
          processedThroughUtc: "2026-04-12T00:00:00.000Z",
          newTradeCount: 1,
          rejectedSignalCount: 0,
          artifactVersion: "0.1.0"
        },
        activePosition: null,
        runMetrics: {
          tradeCount: 1,
          winRate: 100,
          netPnlUsd: 10,
          expectancyUsd: 10,
          profitFactor: 1.5,
          maxDrawdownUsd: 0,
          avgWinUsd: 10,
          avgLossUsd: 0,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 1, netPnlUsd: 10 },
            US: { tradeCount: 0, netPnlUsd: 0 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 1, netPnlUsd: 10 },
            SELL: { tradeCount: 0, netPnlUsd: 0 }
          }
        },
        cumulativeMetrics: {
          tradeCount: 1,
          winRate: 100,
          netPnlUsd: 10,
          expectancyUsd: 10,
          profitFactor: 1.5,
          maxDrawdownUsd: 0,
          avgWinUsd: 10,
          avgLossUsd: 0,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 1, netPnlUsd: 10 },
            US: { tradeCount: 0, netPnlUsd: 0 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 1, netPnlUsd: 10 },
            SELL: { tradeCount: 0, netPnlUsd: 0 }
          }
        },
        dailyPerformance: [],
        sessionPerformance: []
      }),
      "utf8"
    );
    await writeFile(join(artifactsDir, "paper", "paper-report-2026-04-12T00-00-00-000Z.md"), "# Paper Report", "utf8");
    await mkdir(join(artifactsDir, "research"), { recursive: true });
    await writeFile(
      join(artifactsDir, "research", "research-report-2026-04-12T00-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-12T00:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.research-tight.json",
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          summary: "fast=30 slow=120 score=4 postEvent=120"
        },
        baseline: {
          train: { slice: "train", range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } },
          validation: { slice: "validation", range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } },
          test: { slice: "test", range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } }
        },
        walkforward: {
          mode: "grid",
          windowCount: 0,
          selectedWindowCount: 0,
          rolledUpMetrics: {
            tradeCount: 0,
            winRate: 0,
            netPnlUsd: 0,
            expectancyUsd: 0,
            profitFactor: null,
            maxDrawdownUsd: 0,
            avgWinUsd: 0,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 0, netPnlUsd: 0 },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 0, netPnlUsd: 0 },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          windows: []
        },
        sensitivity: {
          baselineCandidateId: "fast30_slow120_score4_post120",
          baselineRank: 1,
          totalCandidates: 1,
          stableCandidateCount: 0,
          topCandidates: []
        },
        eventComparison: {
          range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
          baselineScenario: "default",
          scenarios: []
        },
        finalAssessment: {
          baseline_test_positive_expectancy: false,
          walkforward_oos_positive_expectancy: false,
          parameter_stability_pass: false,
          event_filter_dependence: "low",
          recommendation: "research_more"
        }
      }),
      "utf8"
    );
    await writeFile(join(artifactsDir, "research", "research-report-2026-04-12T00-00-00-000Z.md"), "# Research Report", "utf8");

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--config-hash", "aaaaaaaa"], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Config hash filter: aaaaaaaa"))).toBe(true);
    expect(output.some((line) => line.includes("Paper reports: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Research reports: 0"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles shown: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles total: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Latest paper:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest research:"))).toBe(false);
    expect((await readdir(artifactsDir)).includes("index-aaaaaaaa.json")).toBe(true);
    const filteredMarkdown = await readFile(join(artifactsDir, "index-aaaaaaaa.md"), "utf8");
    expect(filteredMarkdown).toContain("Config hash filter: aaaaaaaa");
    expect(filteredMarkdown).toContain("paper: Paper:");
    expect(filteredMarkdown).toContain("research: none");
  });

  it("filters the artifact index by artifact kind", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-kind-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "paper"), { recursive: true });
    await mkdir(join(artifactsDir, "research"), { recursive: true });
    await writeFile(
      join(artifactsDir, "paper", "paper-report-2026-04-12T01-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-12T01:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "fast=20 slow=120 score=3 postEvent=60"
        },
        source: "PAPER",
        run: {
          startUtc: "2026-04-12T01:00:00.000Z",
          endUtc: null,
          processedThroughUtc: "2026-04-12T01:00:00.000Z",
          newTradeCount: 1,
          rejectedSignalCount: 0,
          artifactVersion: "0.1.0"
        },
        activePosition: null,
        runMetrics: {
          tradeCount: 1,
          winRate: 100,
          netPnlUsd: 5,
          expectancyUsd: 5,
          profitFactor: 1.1,
          maxDrawdownUsd: 0,
          avgWinUsd: 5,
          avgLossUsd: 0,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 1, netPnlUsd: 5 },
            US: { tradeCount: 0, netPnlUsd: 0 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 1, netPnlUsd: 5 },
            SELL: { tradeCount: 0, netPnlUsd: 0 }
          }
        },
        cumulativeMetrics: {
          tradeCount: 1,
          winRate: 100,
          netPnlUsd: 5,
          expectancyUsd: 5,
          profitFactor: 1.1,
          maxDrawdownUsd: 0,
          avgWinUsd: 5,
          avgLossUsd: 0,
          rejectedSignalCount: 0,
          sessionBreakdown: {
            ASIA: { tradeCount: 0, netPnlUsd: 0 },
            EUROPE: { tradeCount: 1, netPnlUsd: 5 },
            US: { tradeCount: 0, netPnlUsd: 0 },
            CLOSED: { tradeCount: 0, netPnlUsd: 0 }
          },
          sideBreakdown: {
            BUY: { tradeCount: 1, netPnlUsd: 5 },
            SELL: { tradeCount: 0, netPnlUsd: 0 }
          }
        },
        dailyPerformance: [],
        sessionPerformance: []
      }),
      "utf8"
    );
    await writeFile(join(artifactsDir, "paper", "paper-report-2026-04-12T01-00-00-000Z.md"), "# Paper Report", "utf8");
    await writeFile(
      join(artifactsDir, "research", "research-report-2026-04-12T01-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-12T01:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/session-filtered-trend-pullback-v1.research-tight.json",
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          summary: "fast=30 slow=120 score=4 postEvent=120"
        },
        baseline: {
          train: { slice: "train", range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } },
          validation: { slice: "validation", range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } },
          test: { slice: "test", range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } }
        },
        walkforward: {
          mode: "grid",
          windowCount: 0,
          selectedWindowCount: 0,
          rolledUpMetrics: {
            tradeCount: 0,
            winRate: 0,
            netPnlUsd: 0,
            expectancyUsd: 0,
            profitFactor: null,
            maxDrawdownUsd: 0,
            avgWinUsd: 0,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 0, netPnlUsd: 0 },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 0, netPnlUsd: 0 },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          windows: []
        },
        sensitivity: {
          baselineCandidateId: "fast30_slow120_score4_post120",
          baselineRank: 1,
          totalCandidates: 1,
          stableCandidateCount: 0,
          topCandidates: []
        },
        eventComparison: {
          range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" },
          baselineScenario: "default",
          scenarios: []
        },
        finalAssessment: {
          baseline_test_positive_expectancy: false,
          walkforward_oos_positive_expectancy: false,
          parameter_stability_pass: false,
          event_filter_dependence: "low",
          recommendation: "research_more"
        }
      }),
      "utf8"
    );
    await writeFile(join(artifactsDir, "research", "research-report-2026-04-12T01-00-00-000Z.md"), "# Research Report", "utf8");

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--kind", "paper"], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Kind filter: paper"))).toBe(true);
    expect(output.some((line) => line.includes("Paper reports: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Research reports: 0"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles shown: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles total: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Latest paper:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest research:"))).toBe(false);
    expect((await readdir(artifactsDir)).includes("index-paper.json")).toBe(true);
    const filteredMarkdown = await readFile(join(artifactsDir, "index-paper.md"), "utf8");
    expect(filteredMarkdown).toContain("Kind filter: paper");
    expect(filteredMarkdown).toContain("Paper reports: 1");
    expect(filteredMarkdown).toContain("Research reports: 0");
    expect(filteredMarkdown).toContain("Config profiles total: 1");
  });

  it("filters config groups to gate-passing research profiles only", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-gate-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "research"), { recursive: true });

    for (const [sha, summary, gatePass] of [
      ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "passing-profile", true],
      ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "failing-profile", false]
    ] as const) {
      await writeFile(
        join(artifactsDir, "research", `research-report-${summary}.json`),
        JSON.stringify({
          generatedAtUtc: "2026-04-12T03:00:00.000Z",
          symbol: "MNQ",
          strategyId: "SessionFilteredTrendPullback_v1",
          config: {
            path: `config/strategies/${summary}.json`,
            sha256: sha,
            summary
          },
          runProvenance: {
            gitCommitSha: "abc123",
            nodeVersion: "v22.0.0",
            dbPath: "data/test.sqlite",
            eventWindowCount: 0,
            sourceRange: null
          },
          baseline: {
            train: { slice: "train", range: { startUtc: "2018-01-01T00:00:00.000Z", endUtc: "2021-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } },
            validation: { slice: "validation", range: { startUtc: "2022-01-01T00:00:00.000Z", endUtc: "2022-12-31T23:59:59.999Z" }, metrics: { tradeCount: 0, winRate: 0, netPnlUsd: 0, expectancyUsd: 0, profitFactor: null, maxDrawdownUsd: 0, avgWinUsd: 0, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 0, netPnlUsd: 0 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 0, netPnlUsd: 0 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } },
            test: { slice: "test", range: { startUtc: "2023-01-01T00:00:00.000Z", endUtc: "2025-12-31T23:59:59.999Z" }, metrics: { tradeCount: 25, winRate: 100, netPnlUsd: 250, expectancyUsd: 10, profitFactor: 1.5, maxDrawdownUsd: 2, avgWinUsd: 10, avgLossUsd: 0, rejectedSignalCount: 0, sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 25, netPnlUsd: 250 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } }, sideBreakdown: { BUY: { tradeCount: 25, netPnlUsd: 250 }, SELL: { tradeCount: 0, netPnlUsd: 0 } } } }
          },
          walkforward: {
            mode: "grid",
            windowCount: 2,
            selectedWindowCount: 2,
            rolledUpMetrics: {
              tradeCount: 25,
              winRate: 100,
              netPnlUsd: 250,
              expectancyUsd: gatePass ? 10 : -10,
              profitFactor: 1.5,
              maxDrawdownUsd: 2,
              avgWinUsd: 10,
              avgLossUsd: 0,
              rejectedSignalCount: 0,
              sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 25, netPnlUsd: 250 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } },
              sideBreakdown: { BUY: { tradeCount: 25, netPnlUsd: 250 }, SELL: { tradeCount: 0, netPnlUsd: 0 } }
            },
            windows: []
          },
          sensitivity: {
            baselineCandidateId: "baseline",
            baselineRank: 1,
            totalCandidates: 1,
            stableCandidateCount: 1,
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
            walkforwardTrades: { passed: gatePass, actual: 25, threshold: 20 },
            selectedWalkforwardWindows: { passed: true, actual: 2, threshold: 2 },
            baselineTestExpectancy: { passed: true, actual: 10, threshold: 0 },
            walkforwardExpectancy: { passed: gatePass, actual: gatePass ? 10 : -10, threshold: 0 },
            baselineTestMaxDrawdown: { passed: true, actual: 2, threshold: 3750 },
            walkforwardMaxDrawdown: { passed: true, actual: 2, threshold: 3750 },
            sensitivityTopCandidatesTrades: { passed: true, threshold: 20, passingCandidates: 1, totalCandidates: 1 }
          },
          finalAssessment: {
            baseline_test_positive_expectancy: true,
            walkforward_oos_positive_expectancy: gatePass,
            parameter_stability_pass: true,
            event_filter_dependence: "low",
            gatePass,
            gateFailureReasons: gatePass ? [] : ["walkforward_expectancy_below_min:-10<0"],
            recommendation: gatePass ? "continue_paper" : "research_more"
          }
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--gate-pass-only"], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Gate pass only: yes"))).toBe(true);
    expect(output.some((line) => line.includes("Research reports: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles total: 1"))).toBe(true);
    expect((await readdir(artifactsDir)).includes("index-gate-pass.json")).toBe(true);
    const markdown = await readFile(join(artifactsDir, "index-gate-pass.md"), "utf8");
    expect(markdown).toContain("Gate pass only: yes");
    expect(markdown).toContain("passing-profile");
    expect(markdown).not.toContain("failing-profile");
  });

  it("limits config groups in the artifact index", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-limit-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "paper"), { recursive: true });

    for (const [index, sha, summary] of [
      [1, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "fast=20 slow=120 score=3 postEvent=60"],
      [2, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "fast=30 slow=120 score=4 postEvent=120"]
    ] as const) {
      await writeFile(
        join(artifactsDir, "paper", `paper-report-2026-04-12T0${index}-00-00-000Z.json`),
        JSON.stringify({
          generatedAtUtc: `2026-04-12T0${index}:00:00.000Z`,
          symbol: "MNQ",
          strategyId: "SessionFilteredTrendPullback_v1",
          config: {
            path: `config/strategies/profile-${index}.json`,
            sha256: sha,
            summary
          },
          source: "PAPER",
          run: {
            startUtc: `2026-04-12T0${index}:00:00.000Z`,
            endUtc: null,
            processedThroughUtc: `2026-04-12T0${index}:00:00.000Z`,
            newTradeCount: 1,
            rejectedSignalCount: 0,
            artifactVersion: "0.1.0"
          },
          activePosition: null,
          runMetrics: {
            tradeCount: 1,
            winRate: 100,
            netPnlUsd: index,
            expectancyUsd: index,
            profitFactor: 1.1,
            maxDrawdownUsd: 0,
            avgWinUsd: index,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 1, netPnlUsd: index },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 1, netPnlUsd: index },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          cumulativeMetrics: {
            tradeCount: 1,
            winRate: 100,
            netPnlUsd: index,
            expectancyUsd: index,
            profitFactor: 1.1,
            maxDrawdownUsd: 0,
            avgWinUsd: index,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 1, netPnlUsd: index },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 1, netPnlUsd: index },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          dailyPerformance: [],
          sessionPerformance: []
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--limit", "1"], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Limit: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles shown: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles total: 2"))).toBe(true);
    expect((await readdir(artifactsDir)).includes("index-limit-1.json")).toBe(true);
    const markdown = await readFile(join(artifactsDir, "index-limit-1.md"), "utf8");
    expect(markdown).toContain("Limit: 1");
    expect(markdown).toContain("Config profiles shown: 1");
    expect(markdown).toContain("Config profiles total: 2");
    expect(markdown).toContain("bbbbbbbbbbbb");
    expect(markdown).not.toContain("aaaaaaaaaaaa");
  });

  it("shows only the latest config group when latest-only is enabled", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-latest-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "paper"), { recursive: true });

    for (const [index, sha] of [
      [1, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      [2, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]
    ] as const) {
      await writeFile(
        join(artifactsDir, "paper", `paper-report-2026-04-12T0${index}-30-00-000Z.json`),
        JSON.stringify({
          generatedAtUtc: `2026-04-12T0${index}:30:00.000Z`,
          symbol: "MNQ",
          strategyId: "SessionFilteredTrendPullback_v1",
          config: {
            path: `config/strategies/profile-${index}.json`,
            sha256: sha,
            summary: `profile-${index}`
          },
          source: "PAPER",
          run: {
            startUtc: `2026-04-12T0${index}:30:00.000Z`,
            endUtc: null,
            processedThroughUtc: `2026-04-12T0${index}:30:00.000Z`,
            newTradeCount: 1,
            rejectedSignalCount: 0,
            artifactVersion: "0.1.0"
          },
          activePosition: null,
          runMetrics: {
            tradeCount: 1,
            winRate: 100,
            netPnlUsd: index,
            expectancyUsd: index,
            profitFactor: 1.0,
            maxDrawdownUsd: 0,
            avgWinUsd: index,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 1, netPnlUsd: index },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 1, netPnlUsd: index },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          cumulativeMetrics: {
            tradeCount: 1,
            winRate: 100,
            netPnlUsd: index,
            expectancyUsd: index,
            profitFactor: 1.0,
            maxDrawdownUsd: 0,
            avgWinUsd: index,
            avgLossUsd: 0,
            rejectedSignalCount: 0,
            sessionBreakdown: {
              ASIA: { tradeCount: 0, netPnlUsd: 0 },
              EUROPE: { tradeCount: 1, netPnlUsd: index },
              US: { tradeCount: 0, netPnlUsd: 0 },
              CLOSED: { tradeCount: 0, netPnlUsd: 0 }
            },
            sideBreakdown: {
              BUY: { tradeCount: 1, netPnlUsd: index },
              SELL: { tradeCount: 0, netPnlUsd: 0 }
            }
          },
          dailyPerformance: [],
          sessionPerformance: []
        }),
        "utf8"
      );
    }

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--latest-only"], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Latest only: yes"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles shown: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Config profiles total: 2"))).toBe(true);
    expect((await readdir(artifactsDir)).includes("index-latest.json")).toBe(true);
    const markdown = await readFile(join(artifactsDir, "index-latest.md"), "utf8");
    expect(markdown).toContain("Latest only: yes");
    expect(markdown).toContain("Config profiles shown: 1");
    expect(markdown).toContain("profile-2");
    expect(markdown).not.toContain("profile-1");
  });

  it("sorts config groups by net pnl when requested", async () => {
    const { runCli } = await import("../src/cli/index.js");
    const artifactsDir = await mkdtemp(join(tmpdir(), "artifact-index-sort-"));
    tempDirs.push(artifactsDir);
    await mkdir(join(artifactsDir, "paper"), { recursive: true });

    await writeFile(
      join(artifactsDir, "paper", "paper-report-2026-04-12T01-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-12T01:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/profile-1.json",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          summary: "older-high-pnl"
        },
        source: "PAPER",
        run: {
          startUtc: "2026-04-12T01:00:00.000Z",
          endUtc: null,
          processedThroughUtc: "2026-04-12T01:00:00.000Z",
          newTradeCount: 1,
          rejectedSignalCount: 0,
          artifactVersion: "0.1.0"
        },
        activePosition: null,
        runMetrics: {
          tradeCount: 1, winRate: 100, netPnlUsd: 100, expectancyUsd: 100, profitFactor: 1.5, maxDrawdownUsd: 0,
          avgWinUsd: 100, avgLossUsd: 0, rejectedSignalCount: 0,
          sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 1, netPnlUsd: 100 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } },
          sideBreakdown: { BUY: { tradeCount: 1, netPnlUsd: 100 }, SELL: { tradeCount: 0, netPnlUsd: 0 } }
        },
        cumulativeMetrics: {
          tradeCount: 1, winRate: 100, netPnlUsd: 100, expectancyUsd: 100, profitFactor: 1.5, maxDrawdownUsd: 0,
          avgWinUsd: 100, avgLossUsd: 0, rejectedSignalCount: 0,
          sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 1, netPnlUsd: 100 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } },
          sideBreakdown: { BUY: { tradeCount: 1, netPnlUsd: 100 }, SELL: { tradeCount: 0, netPnlUsd: 0 } }
        },
        dailyPerformance: [],
        sessionPerformance: []
      }),
      "utf8"
    );

    await writeFile(
      join(artifactsDir, "paper", "paper-report-2026-04-12T02-00-00-000Z.json"),
      JSON.stringify({
        generatedAtUtc: "2026-04-12T02:00:00.000Z",
        symbol: "MNQ",
        strategyId: "SessionFilteredTrendPullback_v1",
        config: {
          path: "config/strategies/profile-2.json",
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          summary: "newer-low-pnl"
        },
        source: "PAPER",
        run: {
          startUtc: "2026-04-12T02:00:00.000Z",
          endUtc: null,
          processedThroughUtc: "2026-04-12T02:00:00.000Z",
          newTradeCount: 1,
          rejectedSignalCount: 0,
          artifactVersion: "0.1.0"
        },
        activePosition: null,
        runMetrics: {
          tradeCount: 1, winRate: 100, netPnlUsd: 10, expectancyUsd: 10, profitFactor: 1.1, maxDrawdownUsd: 0,
          avgWinUsd: 10, avgLossUsd: 0, rejectedSignalCount: 0,
          sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 1, netPnlUsd: 10 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } },
          sideBreakdown: { BUY: { tradeCount: 1, netPnlUsd: 10 }, SELL: { tradeCount: 0, netPnlUsd: 0 } }
        },
        cumulativeMetrics: {
          tradeCount: 1, winRate: 100, netPnlUsd: 10, expectancyUsd: 10, profitFactor: 1.1, maxDrawdownUsd: 0,
          avgWinUsd: 10, avgLossUsd: 0, rejectedSignalCount: 0,
          sessionBreakdown: { ASIA: { tradeCount: 0, netPnlUsd: 0 }, EUROPE: { tradeCount: 1, netPnlUsd: 10 }, US: { tradeCount: 0, netPnlUsd: 0 }, CLOSED: { tradeCount: 0, netPnlUsd: 0 } },
          sideBreakdown: { BUY: { tradeCount: 1, netPnlUsd: 10 }, SELL: { tradeCount: 0, netPnlUsd: 0 } }
        },
        dailyPerformance: [],
        sessionPerformance: []
      }),
      "utf8"
    );

    const output: string[] = [];
    await runCli(["artifacts", "--artifacts-dir", artifactsDir, "--sort-by", "net_pnl"], {
      log: (message: string) => {
        output.push(message);
      }
    });

    expect(output.some((line) => line.includes("Sort by: net_pnl"))).toBe(true);
    expect(output.some((line) => line.includes("Top config group: older-high-pnl"))).toBe(true);
    expect((await readdir(artifactsDir)).includes("index-sort-net-pnl.json")).toBe(true);
    const markdown = await readFile(join(artifactsDir, "index-sort-net-pnl.md"), "utf8");
    expect(markdown).toContain("Sort by: net_pnl");
    const byConfigHashSection = markdown.slice(markdown.indexOf("## By Config Hash"));
    expect(byConfigHashSection.indexOf("older-high-pnl")).toBeLessThan(byConfigHashSection.indexOf("newer-low-pnl"));
  });
});
