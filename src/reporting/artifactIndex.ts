import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  BatchRunArtifact,
  DailyRunArtifact,
  PaperReportArtifact,
  ResearchReportArtifact,
  StrategyConfigReference,
  WalkForwardArtifact
} from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

export type ArtifactKind = "paper" | "research" | "walkforward" | "batch" | "daily";
export type ArtifactSortBy = "generated_at" | "net_pnl" | "expectancy";

interface ArtifactLatestSummary {
  kind: ArtifactKind;
  generatedAtUtc: string;
  jsonPath: string;
  markdownPath: string | null;
  headline: string;
  details: string[];
  config: StrategyConfigReference | null;
  netPnlUsd: number | null;
  expectancyUsd: number | null;
  gatePass: boolean | null;
}

interface ArtifactIndexFile {
  generatedAtUtc: string;
  artifactsDir: string;
  configHashFilter: string | null;
  kindFilter: ArtifactKind | null;
  gatePassOnly: boolean;
  sortBy: ArtifactSortBy;
  latestOnly: boolean;
  limit: number | null;
  counts: Record<ArtifactKind, number>;
  totalConfigProfiles: number;
  latest: Partial<Record<ArtifactKind, ArtifactLatestSummary>>;
  byConfigHash: ArtifactConfigGroupSummary[];
}

interface ArtifactConfigGroupSummary {
  sha256: string;
  summary: string;
  path: string;
  latest: Partial<Record<ArtifactKind, ArtifactLatestSummary>>;
}

function latestByName(files: string[]): string | null {
  const sorted = [...files].sort((left, right) => right.localeCompare(left));
  return sorted[0] ?? null;
}

async function safeList(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function sortLatest(left: ArtifactLatestSummary, right: ArtifactLatestSummary): number {
  return right.generatedAtUtc.localeCompare(left.generatedAtUtc);
}

function paperSummary(artifact: PaperReportArtifact, jsonPath: string, markdownPath: string | null): ArtifactLatestSummary {
  return {
    kind: "paper",
    generatedAtUtc: artifact.generatedAtUtc,
    jsonPath,
    markdownPath,
    headline: `Paper: ${artifact.cumulativeMetrics.netPnlUsd.toFixed(2)} USD net, ${artifact.cumulativeMetrics.tradeCount} trades`,
    config: artifact.config ?? null,
    netPnlUsd: artifact.cumulativeMetrics.netPnlUsd,
    expectancyUsd: artifact.cumulativeMetrics.expectancyUsd,
    gatePass: null,
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `Processed through ${artifact.run.processedThroughUtc ?? "n/a"}`,
      `Active position: ${artifact.activePosition ? `${artifact.activePosition.status} ${artifact.activePosition.side}` : "none"}`
    ]
  };
}

function researchSummary(
  artifact: ResearchReportArtifact,
  jsonPath: string,
  markdownPath: string | null
): ArtifactLatestSummary {
  return {
    kind: "research",
    generatedAtUtc: artifact.generatedAtUtc,
    jsonPath,
    markdownPath,
    headline: `Research: ${artifact.finalAssessment.recommendation}`,
    config: artifact.config ?? null,
    netPnlUsd: artifact.walkforward.rolledUpMetrics.netPnlUsd,
    expectancyUsd: artifact.walkforward.rolledUpMetrics.expectancyUsd,
    gatePass: artifact.finalAssessment.gatePass,
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `Baseline test expectancy ${artifact.baseline.test.metrics.expectancyUsd.toFixed(2)} USD`,
      `Walk-forward OOS expectancy ${artifact.walkforward.rolledUpMetrics.expectancyUsd.toFixed(2)} USD`,
      `Gate pass: ${artifact.finalAssessment.gatePass ? "yes" : "no"}`
    ]
  };
}

function walkforwardSummary(
  artifact: WalkForwardArtifact,
  jsonPath: string,
  markdownPath: string | null
): ArtifactLatestSummary {
  const selectedCount = artifact.windows.filter((window) => window.status === "selected").length;
  return {
    kind: "walkforward",
    generatedAtUtc: artifact.generatedAtUtc,
    jsonPath,
    markdownPath,
    headline: `Walk-forward: ${selectedCount}/${artifact.windows.length} windows selected`,
    config: artifact.config ?? null,
    netPnlUsd: artifact.rolledUpMetrics.netPnlUsd,
    expectancyUsd: artifact.rolledUpMetrics.expectancyUsd,
    gatePass: null,
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `OOS net PnL ${artifact.rolledUpMetrics.netPnlUsd.toFixed(2)} USD`,
      `OOS expectancy ${artifact.rolledUpMetrics.expectancyUsd.toFixed(2)} USD`
    ]
  };
}

function batchSummary(artifact: BatchRunArtifact, jsonPath: string): ArtifactLatestSummary {
  const completedSteps = artifact.steps.filter((step) => step.status === "completed").length;
  return {
    kind: "batch",
    generatedAtUtc: artifact.generatedAtUtc,
    jsonPath,
    markdownPath: null,
    headline: `Batch: ${artifact.status}, ${completedSteps}/${artifact.steps.length} steps completed`,
    config: artifact.config ?? null,
    netPnlUsd: null,
    expectancyUsd: null,
    gatePass: null,
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `Failed step: ${artifact.failedStep ?? "none"}`,
      `Ingestion: ${artifact.ingestionSummary ? `${artifact.ingestionSummary.newFileCount} new files, ${artifact.ingestionSummary.insertedBarCount} bars` : "not run"}`
    ]
  };
}

function dailySummary(artifact: DailyRunArtifact, jsonPath: string, markdownPath: string | null): ArtifactLatestSummary {
  return {
    kind: "daily",
    generatedAtUtc: artifact.generatedAtUtc,
    jsonPath,
    markdownPath,
    headline: `Daily: ${artifact.overallStatus}${artifact.warningCodes.length > 0 ? ` (${artifact.warningCodes.join(", ")})` : ""}`,
    config: artifact.config ?? null,
    netPnlUsd: null,
    expectancyUsd: null,
    gatePass: artifact.researchGatePass,
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `Failed step: ${artifact.failedStep ?? "none"}`,
      `Research recommendation: ${artifact.researchRecommendation ?? "n/a"}`,
      `Warnings: ${artifact.warningCodes.length > 0 ? artifact.warningCodes.join(", ") : "none"}`,
      `Fail streak: ${artifact.historySnapshot?.consecutiveFailCount ?? 0}`,
      `Non-OK streak: ${artifact.historySnapshot?.consecutiveNonOkCount ?? 0}`,
      `Top warnings: ${
        artifact.historySnapshot && artifact.historySnapshot.warningCodeCounts.length > 0
          ? artifact.historySnapshot.warningCodeCounts
              .slice(0, 3)
              .map((item) => `${item.code}:${item.count}`)
              .join(", ")
          : "none"
      }`
    ]
  };
}

async function loadPaperSummaries(dir: string, files: string[]): Promise<ArtifactLatestSummary[]> {
  const jsonFiles = files.filter((entry) => entry.endsWith(".json"));
  return Promise.all(
    jsonFiles.map(async (entry) => {
      const jsonPath = join(dir, entry);
      const artifact = await readJson<PaperReportArtifact>(jsonPath);
      const markdownName = entry.replace(/\.json$/, ".md");
      return paperSummary(
        artifact,
        jsonPath,
        files.includes(markdownName) ? join(dir, markdownName) : null
      );
    })
  );
}

async function loadResearchSummaries(dir: string, files: string[]): Promise<ArtifactLatestSummary[]> {
  const jsonFiles = files.filter((entry) => entry.endsWith(".json"));
  return Promise.all(
    jsonFiles.map(async (entry) => {
      const jsonPath = join(dir, entry);
      const artifact = await readJson<ResearchReportArtifact>(jsonPath);
      const markdownName = entry.replace(/\.json$/, ".md");
      return researchSummary(
        artifact,
        jsonPath,
        files.includes(markdownName) ? join(dir, markdownName) : null
      );
    })
  );
}

async function loadWalkForwardSummaries(dir: string, files: string[]): Promise<ArtifactLatestSummary[]> {
  const jsonFiles = files.filter((entry) => /^walkforward-.*\.json$/.test(entry));
  return Promise.all(
    jsonFiles.map(async (entry) => {
      const jsonPath = join(dir, entry);
      const artifact = await readJson<WalkForwardArtifact>(jsonPath);
      const markdownName = entry.replace(/\.json$/, ".md");
      return walkforwardSummary(
        artifact,
        jsonPath,
        files.includes(markdownName) ? join(dir, markdownName) : null
      );
    })
  );
}

async function loadBatchSummaries(dir: string, files: string[]): Promise<ArtifactLatestSummary[]> {
  const jsonFiles = files.filter((entry) => entry.endsWith(".json"));
  return Promise.all(
    jsonFiles.map(async (entry) => {
      const jsonPath = join(dir, entry);
      const artifact = await readJson<BatchRunArtifact>(jsonPath);
      return batchSummary(artifact, jsonPath);
    })
  );
}

async function loadDailySummaries(dir: string, files: string[]): Promise<ArtifactLatestSummary[]> {
  const jsonFiles = files.filter((entry) => entry.endsWith(".json"));
  return Promise.all(
    jsonFiles.map(async (entry) => {
      const jsonPath = join(dir, entry);
      const artifact = await readJson<DailyRunArtifact>(jsonPath);
      const markdownName = entry.replace(/\.json$/, ".md");
      return dailySummary(
        artifact,
        jsonPath,
        files.includes(markdownName) ? join(dir, markdownName) : null
      );
    })
  );
}

function sortValue(summary: ArtifactLatestSummary, sortBy: ArtifactSortBy): number {
  switch (sortBy) {
    case "net_pnl":
      return summary.netPnlUsd ?? Number.NEGATIVE_INFINITY;
    case "expectancy":
      return summary.expectancyUsd ?? Number.NEGATIVE_INFINITY;
    case "generated_at":
    default:
      return new Date(summary.generatedAtUtc).getTime();
  }
}

function buildConfigGroups(
  summaries: ArtifactLatestSummary[],
  sortBy: ArtifactSortBy
): ArtifactConfigGroupSummary[] {
  const grouped = new Map<string, ArtifactConfigGroupSummary>();

  for (const summary of summaries) {
    if (!summary.config) {
      continue;
    }

    const existing = grouped.get(summary.config.sha256) ?? {
      sha256: summary.config.sha256,
      summary: summary.config.summary,
      path: summary.config.path,
      latest: {}
    };

    if (!existing.latest[summary.kind] || sortLatest(summary, existing.latest[summary.kind]!) < 0) {
      existing.latest[summary.kind] = summary;
    }

    existing.summary = summary.config.summary;
    existing.path = summary.config.path;
    grouped.set(summary.config.sha256, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    const leftRank = Math.max(...Object.values(left.latest).map((item) => sortValue(item!, sortBy)), Number.NEGATIVE_INFINITY);
    const rightRank = Math.max(...Object.values(right.latest).map((item) => sortValue(item!, sortBy)), Number.NEGATIVE_INFINITY);
    if (leftRank !== rightRank) {
      return rightRank - leftRank;
    }
    const leftLatest = Math.max(...Object.values(left.latest).map((item) => new Date(item!.generatedAtUtc).getTime()), 0);
    const rightLatest = Math.max(...Object.values(right.latest).map((item) => new Date(item!.generatedAtUtc).getTime()), 0);
    if (leftLatest !== rightLatest) {
      return rightLatest - leftLatest;
    }
    return left.sha256.localeCompare(right.sha256);
  });
}

export async function buildArtifactIndex(artifactsDir = DEFAULT_ARTIFACTS_DIR): Promise<ArtifactIndexFile> {
  return buildArtifactIndexWithFilter(artifactsDir, null, null, false, "generated_at", false, null);
}

function matchesConfigHash(summary: ArtifactLatestSummary, configHashFilter: string | null): boolean {
  if (!configHashFilter) {
    return true;
  }
  return summary.config?.sha256.startsWith(configHashFilter) ?? false;
}

function matchesKind(summary: ArtifactLatestSummary, kindFilter: ArtifactKind | null): boolean {
  if (!kindFilter) {
    return true;
  }
  return summary.kind === kindFilter;
}

function latestResearchGatePassByConfig(summaries: ArtifactLatestSummary[]): Set<string> {
  const latestResearch = new Map<string, ArtifactLatestSummary>();
  for (const summary of summaries.filter((item) => item.kind === "research" && item.config)) {
    const sha = summary.config!.sha256;
    const existing = latestResearch.get(sha);
    if (!existing || sortLatest(summary, existing) < 0) {
      latestResearch.set(sha, summary);
    }
  }

  return new Set(
    [...latestResearch.entries()]
      .filter(([, summary]) => summary.gatePass === true)
      .map(([sha]) => sha)
  );
}

function latestForKind(
  kind: ArtifactKind,
  summaries: ArtifactLatestSummary[],
  configHashFilter: string | null,
  kindFilter: ArtifactKind | null
): ArtifactLatestSummary | undefined {
  return summaries
    .filter((summary) => summary.kind === kind)
    .filter((summary) => matchesConfigHash(summary, configHashFilter))
    .filter((summary) => matchesKind(summary, kindFilter))
    .sort(sortLatest)[0];
}

export async function buildArtifactIndexWithFilter(
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  configHashFilter: string | null = null,
  kindFilter: ArtifactKind | null = null,
  gatePassOnly = false,
  sortBy: ArtifactSortBy = "generated_at",
  latestOnly = false,
  limit: number | null = null
): Promise<ArtifactIndexFile> {
  const paperDir = join(artifactsDir, "paper");
  const researchDir = join(artifactsDir, "research");
  const batchDir = join(artifactsDir, "batch");
  const dailyDir = join(artifactsDir, "daily");

  const paperFiles = await safeList(paperDir);
  const researchFiles = await safeList(researchDir);
  const batchFiles = await safeList(batchDir);
  const dailyFiles = await safeList(dailyDir);
  const rootFiles = await safeList(artifactsDir);

  const paperSummaries = await loadPaperSummaries(paperDir, paperFiles);
  const researchSummaries = await loadResearchSummaries(researchDir, researchFiles);
  const walkforwardSummaries = await loadWalkForwardSummaries(artifactsDir, rootFiles);
  const batchSummaries = await loadBatchSummaries(batchDir, batchFiles);
  const dailySummaries = await loadDailySummaries(dailyDir, dailyFiles);
  const allSummaries = [...paperSummaries, ...researchSummaries, ...walkforwardSummaries, ...batchSummaries, ...dailySummaries];
  const gatePassingConfigs = latestResearchGatePassByConfig(allSummaries);

  const filteredSummaries = allSummaries
    .filter((summary) => matchesConfigHash(summary, configHashFilter))
    .filter((summary) => matchesKind(summary, kindFilter))
    .filter((summary) => !gatePassOnly || (summary.config ? gatePassingConfigs.has(summary.config.sha256) : false));

  const latest: Partial<Record<ArtifactKind, ArtifactLatestSummary>> = {};
  latest.paper = latestForKind("paper", filteredSummaries, null, null);
  latest.research = latestForKind("research", filteredSummaries, null, null);
  latest.walkforward = latestForKind("walkforward", filteredSummaries, null, null);
  latest.batch = latestForKind("batch", filteredSummaries, null, null);
  latest.daily = latestForKind("daily", filteredSummaries, null, null);

  const filteredConfigGroups = buildConfigGroups(filteredSummaries, sortBy);
  const totalConfigProfiles = filteredConfigGroups.length;
  const effectiveLimit = latestOnly ? 1 : limit;
  const byConfigHash =
    effectiveLimit === null ? filteredConfigGroups : filteredConfigGroups.slice(0, Math.max(0, effectiveLimit));

  return {
    generatedAtUtc: new Date().toISOString(),
    artifactsDir,
    configHashFilter,
    kindFilter,
    gatePassOnly,
    sortBy,
    latestOnly,
    limit,
    counts: {
      paper: filteredSummaries.filter((summary) => summary.kind === "paper").length,
      research: filteredSummaries.filter((summary) => summary.kind === "research").length,
      walkforward: filteredSummaries.filter((summary) => summary.kind === "walkforward").length,
      batch: filteredSummaries.filter((summary) => summary.kind === "batch").length,
      daily: filteredSummaries.filter((summary) => summary.kind === "daily").length
    },
    totalConfigProfiles,
    latest,
    byConfigHash
  };
}

export function renderArtifactIndexMarkdown(index: ArtifactIndexFile): string {
  const sections: string[] = [
    `# Artifact Index`,
    ``,
    `- Generated: ${index.generatedAtUtc}`,
    `- Artifacts dir: ${index.artifactsDir}`,
    `- Config hash filter: ${index.configHashFilter ?? "none"}`,
    `- Kind filter: ${index.kindFilter ?? "none"}`,
    `- Gate pass only: ${index.gatePassOnly ? "yes" : "no"}`,
    `- Sort by: ${index.sortBy}`,
    `- Latest only: ${index.latestOnly ? "yes" : "no"}`,
    `- Limit: ${index.limit ?? "none"}`,
    ``,
    `## Counts`,
    ``,
    `- Paper reports: ${index.counts.paper}`,
    `- Research reports: ${index.counts.research}`,
    `- Walk-forward reports: ${index.counts.walkforward}`,
    `- Batch reports: ${index.counts.batch}`,
    `- Daily reports: ${index.counts.daily}`,
    `- Config profiles shown: ${index.byConfigHash.length}`,
    `- Config profiles total: ${index.totalConfigProfiles}`
  ];

  for (const kind of ["paper", "research", "walkforward", "batch", "daily"] as ArtifactKind[]) {
    const item = index.latest[kind];
    sections.push("", `## Latest ${kind}`);
    if (!item) {
      sections.push("", `_No ${kind} artifacts found._`);
      continue;
    }
    sections.push(
      "",
      `- ${item.headline}`,
      `- Generated: ${item.generatedAtUtc}`,
      `- JSON: ${item.jsonPath}`,
      `- Markdown: ${item.markdownPath ?? "n/a"}`
    );
    for (const detail of item.details) {
      sections.push(`- ${detail}`);
    }
  }

  sections.push("", `## By Config Hash`);
  if (index.byConfigHash.length === 0) {
    sections.push("", `_No config-tagged artifacts found._`);
    return sections.join("\n");
  }

  for (const group of index.byConfigHash) {
    sections.push(
      "",
      `### ${group.sha256.slice(0, 12)}`,
      "",
      `- Summary: ${group.summary}`,
      `- Path: ${group.path}`
    );

    for (const kind of ["paper", "research", "walkforward", "batch", "daily"] as ArtifactKind[]) {
      const item = group.latest[kind];
      sections.push(item ? `- ${kind}: ${item.headline}` : `- ${kind}: none`);
    }
  }

  return sections.join("\n");
}

export async function writeArtifactIndex(
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  configHashFilter: string | null = null,
  kindFilter: ArtifactKind | null = null,
  gatePassOnly = false,
  sortBy: ArtifactSortBy = "generated_at",
  latestOnly = false,
  limit: number | null = null
): Promise<WrittenArtifactPaths & { index: ArtifactIndexFile }> {
  const index = await buildArtifactIndexWithFilter(
    artifactsDir,
    configHashFilter,
    kindFilter,
    gatePassOnly,
    sortBy,
    latestOnly,
    limit
  );
  await mkdir(artifactsDir, { recursive: true });
  const suffixParts = [
    configHashFilter,
    kindFilter,
    gatePassOnly ? "gate-pass" : null,
    sortBy === "generated_at" ? null : `sort-${sortBy.replace(/_/g, "-")}`,
    latestOnly ? "latest" : null,
    limit === null ? null : `limit-${limit}`
  ].filter((value): value is string => Boolean(value));
  const suffix = suffixParts.length > 0 ? `-${suffixParts.join("-")}` : "";
  const jsonPath = join(artifactsDir, `index${suffix}.json`);
  const markdownPath = join(artifactsDir, `index${suffix}.md`);
  await writeFile(jsonPath, JSON.stringify(index, null, 2), "utf8");
  await writeFile(markdownPath, renderArtifactIndexMarkdown(index), "utf8");
  return {
    index,
    jsonPath,
    markdownPath
  };
}
