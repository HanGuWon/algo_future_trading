import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { WalkForwardArtifact } from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function renderWindowsTable(artifact: WalkForwardArtifact): string {
  if (artifact.windows.length === 0) {
    return "_No walk-forward windows generated._";
  }

  const lines = [
    "| Window | Status | Candidate | Test Expectancy | Test Net PnL |",
    "| --- | --- | --- | ---: | ---: |"
  ];

  for (const window of artifact.windows) {
    lines.push(
      `| ${window.window.id} | ${window.status} | ${window.selectedCandidate?.id ?? "n/a"} | ${formatNumber(window.selectedTestMetrics?.expectancyUsd ?? 0)} | ${formatNumber(window.selectedTestMetrics?.netPnlUsd ?? 0)} |`
    );
  }

  return lines.join("\n");
}

export function renderWalkForwardArtifactMarkdown(artifact: WalkForwardArtifact): string {
  return [
    `# Walk-Forward Report`,
    ``,
    `- Generated: ${artifact.generatedAtUtc}`,
    `- Symbol: ${artifact.symbol}`,
    `- Mode: ${artifact.mode}`,
    `- Selected windows: ${artifact.windows.filter((window) => window.status === "selected").length}/${artifact.windows.length}`,
    ``,
    `## OOS Summary`,
    ``,
    `- Trades: ${artifact.rolledUpMetrics.tradeCount}`,
    `- Win rate: ${formatNumber(artifact.rolledUpMetrics.winRate)}%`,
    `- Net PnL: ${formatNumber(artifact.rolledUpMetrics.netPnlUsd)} USD`,
    `- Expectancy: ${formatNumber(artifact.rolledUpMetrics.expectancyUsd)} USD`,
    `- Max drawdown: ${formatNumber(artifact.rolledUpMetrics.maxDrawdownUsd)} USD`,
    ``,
    `## Windows`,
    ``,
    renderWindowsTable(artifact)
  ].join("\n");
}

export async function writeWalkForwardArtifacts(
  artifact: WalkForwardArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<WrittenArtifactPaths> {
  await mkdir(artifactsDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(artifactsDir, `walkforward-${timestamp}.json`);
  const markdownPath = join(artifactsDir, `walkforward-${timestamp}.md`);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(markdownPath, renderWalkForwardArtifactMarkdown(artifact), "utf8");
  return { jsonPath, markdownPath };
}
