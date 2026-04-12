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

  it("builds index json and markdown for latest paper/research/walkforward artifacts", async () => {
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
    await mkdir(paperDir, { recursive: true });
    await mkdir(researchDir, { recursive: true });
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
    expect(output.some((line) => line.includes("Config profiles: 3"))).toBe(true);
    expect(output.some((line) => line.includes("Latest config group:"))).toBe(true);

    const topFiles = await readdir(artifactsDir);
    expect(topFiles).toContain("index.json");
    expect(topFiles).toContain("index.md");
    const indexMarkdown = await readFile(join(artifactsDir, "index.md"), "utf8");
    expect(indexMarkdown).toContain("## By Config Hash");
    expect(indexMarkdown).toContain("fast=20 slow=120 score=3 postEvent=60");
    expect(indexMarkdown).toContain("aaaaaaaaaaaa");
    expect(indexMarkdown).toContain("cccccccccccc");
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
    expect(output.some((line) => line.includes("Config profiles: 1"))).toBe(true);
    expect(output.some((line) => line.includes("Latest paper:"))).toBe(true);
    expect(output.some((line) => line.includes("Latest research:"))).toBe(false);
    expect((await readdir(artifactsDir)).includes("index-aaaaaaaa.json")).toBe(true);
    const filteredMarkdown = await readFile(join(artifactsDir, "index-aaaaaaaa.md"), "utf8");
    expect(filteredMarkdown).toContain("Config hash filter: aaaaaaaa");
    expect(filteredMarkdown).toContain("paper: Paper:");
    expect(filteredMarkdown).toContain("research: none");
  });
});
