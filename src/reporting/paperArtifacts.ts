import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { PaperReportArtifact, SessionPerformanceRow } from "../types.js";

export interface WrittenArtifactPaths {
  jsonPath: string;
  markdownPath: string;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function renderSessionTable(rows: SessionPerformanceRow[]): string {
  const activeRows = rows.filter((row) => row.tradeCount > 0);
  if (activeRows.length === 0) {
    return "_No realized session trades yet._";
  }

  const lines = [
    "| Session | Trades | Win Rate | Net PnL (USD) | Avg PnL | Avg Win | Avg Loss |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const row of activeRows) {
    lines.push(
      `| ${row.sessionLabel} | ${row.tradeCount} | ${formatNumber(row.winRate)}% | ${formatNumber(row.netPnlUsd)} | ${formatNumber(row.avgPnlUsd)} | ${formatNumber(row.avgWinUsd)} | ${formatNumber(row.avgLossUsd)} |`
    );
  }

  return lines.join("\n");
}

function renderDailyTable(artifact: PaperReportArtifact): string {
  if (artifact.dailyPerformance.length === 0) {
    return "_No realized daily performance rows yet._";
  }

  const lines = [
    "| Trading Date | Trades | Win Rate | Net PnL (USD) | Avg PnL |",
    "| --- | ---: | ---: | ---: | ---: |"
  ];

  for (const row of artifact.dailyPerformance) {
    lines.push(
      `| ${row.tradingDate} | ${row.tradeCount} | ${formatNumber(row.winRate)}% | ${formatNumber(row.netPnlUsd)} | ${formatNumber(row.avgPnlUsd)} |`
    );
  }

  return lines.join("\n");
}

export function renderPaperArtifactMarkdown(artifact: PaperReportArtifact): string {
  return [
    `# Paper Report`,
    ``,
    `- Generated: ${artifact.generatedAtUtc}`,
    `- Symbol: ${artifact.symbol}`,
    `- Strategy: ${artifact.strategyId}`,
    `- Config: ${artifact.config?.path ?? "n/a"}`,
    `- Config SHA256: ${artifact.config?.sha256 ?? "n/a"}`,
    `- Git commit: ${artifact.runProvenance.gitCommitSha ?? "n/a"}`,
    `- Node: ${artifact.runProvenance.nodeVersion}`,
    `- DB path: ${artifact.runProvenance.dbPath ?? "n/a"}`,
    `- Event windows used: ${artifact.runProvenance.eventWindowCount}`,
    `- Source range: ${artifact.runProvenance.sourceRange ? `${artifact.runProvenance.sourceRange.startUtc} -> ${artifact.runProvenance.sourceRange.endUtc}` : "n/a"}`,
    `- Processed Through: ${artifact.run.processedThroughUtc ?? "n/a"}`,
    `- Recommendation Context: paper execution summary`,
    ``,
    `## Run`,
    ``,
    `- New trades: ${artifact.run.newTradeCount}`,
    `- Rejected signals: ${artifact.run.rejectedSignalCount}`,
    `- Run net PnL: ${formatNumber(artifact.runMetrics.netPnlUsd)} USD`,
    `- Run expectancy: ${formatNumber(artifact.runMetrics.expectancyUsd)} USD`,
    ``,
    `## Cumulative`,
    ``,
    `- Trades: ${artifact.cumulativeMetrics.tradeCount}`,
    `- Win rate: ${formatNumber(artifact.cumulativeMetrics.winRate)}%`,
    `- Net PnL: ${formatNumber(artifact.cumulativeMetrics.netPnlUsd)} USD`,
    `- Expectancy: ${formatNumber(artifact.cumulativeMetrics.expectancyUsd)} USD`,
    `- Max drawdown: ${formatNumber(artifact.cumulativeMetrics.maxDrawdownUsd)} USD`,
    ``,
    `## Active Position`,
    ``,
    artifact.activePosition
      ? `- ${artifact.activePosition.status} ${artifact.activePosition.side} ${artifact.activePosition.remainingQty}/${artifact.activePosition.qty} @ ${formatNumber(artifact.activePosition.entryPx)}`
      : `- none`,
    ``,
    `## Daily Performance`,
    ``,
    renderDailyTable(artifact),
    ``,
    `## Session Performance`,
    ``,
    renderSessionTable(artifact.sessionPerformance)
  ].join("\n");
}

export async function writePaperArtifact(
  artifact: PaperReportArtifact,
  artifactsDir = DEFAULT_ARTIFACTS_DIR
): Promise<WrittenArtifactPaths> {
  const targetDir = join(artifactsDir, "paper");
  await mkdir(targetDir, { recursive: true });
  const timestamp = artifact.generatedAtUtc.replace(/[:.]/g, "-");
  const jsonPath = join(targetDir, `paper-report-${timestamp}.json`);
  const markdownPath = join(targetDir, `paper-report-${timestamp}.md`);
  await writeFile(jsonPath, JSON.stringify(artifact, null, 2), "utf8");
  await writeFile(markdownPath, renderPaperArtifactMarkdown(artifact), "utf8");
  return { jsonPath, markdownPath };
}
