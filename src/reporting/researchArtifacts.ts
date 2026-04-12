import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { ResearchReportArtifact, SensitivityCandidateResult } from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function renderTopCandidates(candidates: SensitivityCandidateResult[]): string {
  if (candidates.length === 0) {
    return "_No candidates ranked._";
  }

  const lines = [
    "| Rank | Candidate | Validation Expectancy | Test Expectancy | Stable |",
    "| --- | --- | ---: | ---: | --- |"
  ];

  for (const candidate of candidates) {
    lines.push(
      `| ${candidate.rank} | ${candidate.candidate.id} | ${formatNumber(candidate.validationMetrics.expectancyUsd)} | ${formatNumber(candidate.testMetrics.expectancyUsd)} | ${candidate.isStable ? "yes" : "no"} |`
    );
  }

  return lines.join("\n");
}

function renderEventScenarios(artifact: ResearchReportArtifact): string {
  const lines = [
    "| Scenario | Trades | Expectancy | Net PnL | Max Drawdown |",
    "| --- | ---: | ---: | ---: | ---: |"
  ];

  for (const scenario of artifact.eventComparison.scenarios) {
    lines.push(
      `| ${scenario.scenario} | ${scenario.metrics.tradeCount} | ${formatNumber(scenario.metrics.expectancyUsd)} | ${formatNumber(scenario.metrics.netPnlUsd)} | ${formatNumber(scenario.metrics.maxDrawdownUsd)} |`
    );
  }

  return lines.join("\n");
}

export function renderResearchArtifactMarkdown(artifact: ResearchReportArtifact): string {
  return [
    `# Research Report`,
    ``,
    `- Generated: ${artifact.generatedAtUtc}`,
    `- Symbol: ${artifact.symbol}`,
    `- Strategy: ${artifact.strategyId}`,
    `- Config: ${artifact.config?.path ?? "n/a"}`,
    `- Config SHA256: ${artifact.config?.sha256 ?? "n/a"}`,
    `- Recommendation: ${artifact.finalAssessment.recommendation}`,
    ``,
    `## Baseline Acceptance`,
    ``,
    `- Train expectancy: ${formatNumber(artifact.baseline.train.metrics.expectancyUsd)} USD`,
    `- Validation expectancy: ${formatNumber(artifact.baseline.validation.metrics.expectancyUsd)} USD`,
    `- Test expectancy: ${formatNumber(artifact.baseline.test.metrics.expectancyUsd)} USD`,
    `- Test net PnL: ${formatNumber(artifact.baseline.test.metrics.netPnlUsd)} USD`,
    ``,
    `## Walk-Forward`,
    ``,
    `- Windows: ${artifact.walkforward.selectedWindowCount}/${artifact.walkforward.windowCount} selected`,
    `- OOS expectancy: ${formatNumber(artifact.walkforward.rolledUpMetrics.expectancyUsd)} USD`,
    `- OOS net PnL: ${formatNumber(artifact.walkforward.rolledUpMetrics.netPnlUsd)} USD`,
    ``,
    `## Sensitivity`,
    ``,
    `- Baseline candidate: ${artifact.sensitivity.baselineCandidateId}`,
    `- Baseline rank: ${artifact.sensitivity.baselineRank ?? "n/a"}`,
    `- Stable candidates: ${artifact.sensitivity.stableCandidateCount}/${artifact.sensitivity.totalCandidates}`,
    ``,
    renderTopCandidates(artifact.sensitivity.topCandidates),
    ``,
    `## Event Comparison`,
    ``,
    renderEventScenarios(artifact),
    ``,
    `## Final Assessment`,
    ``,
    `- Baseline test positive expectancy: ${artifact.finalAssessment.baseline_test_positive_expectancy ? "yes" : "no"}`,
    `- Walk-forward OOS positive expectancy: ${artifact.finalAssessment.walkforward_oos_positive_expectancy ? "yes" : "no"}`,
    `- Parameter stability pass: ${artifact.finalAssessment.parameter_stability_pass ? "yes" : "no"}`,
    `- Event filter dependence: ${artifact.finalAssessment.event_filter_dependence}`
  ].join("\n");
}

export async function writeResearchArtifact(
  artifact: ResearchReportArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<WrittenArtifactPaths> {
  const targetDir = join(artifactsDir, "research");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(targetDir, `research-report-${timestamp}.json`);
  const markdownPath = join(targetDir, `research-report-${timestamp}.md`);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(markdownPath, renderResearchArtifactMarkdown(artifact), "utf8");
  return { jsonPath, markdownPath };
}
