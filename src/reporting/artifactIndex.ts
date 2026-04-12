import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  PaperReportArtifact,
  ResearchReportArtifact,
  StrategyConfigReference,
  WalkForwardArtifact
} from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

type ArtifactKind = "paper" | "research" | "walkforward";

interface ArtifactLatestSummary {
  kind: ArtifactKind;
  generatedAtUtc: string;
  jsonPath: string;
  markdownPath: string | null;
  headline: string;
  details: string[];
  config: StrategyConfigReference | null;
}

interface ArtifactIndexFile {
  generatedAtUtc: string;
  artifactsDir: string;
  counts: Record<ArtifactKind, number>;
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
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `Baseline test expectancy ${artifact.baseline.test.metrics.expectancyUsd.toFixed(2)} USD`,
      `Walk-forward OOS expectancy ${artifact.walkforward.rolledUpMetrics.expectancyUsd.toFixed(2)} USD`
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
    details: [
      `Config: ${artifact.config?.summary ?? "n/a"} (${artifact.config?.sha256.slice(0, 12) ?? "n/a"})`,
      `OOS net PnL ${artifact.rolledUpMetrics.netPnlUsd.toFixed(2)} USD`,
      `OOS expectancy ${artifact.rolledUpMetrics.expectancyUsd.toFixed(2)} USD`
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

function buildConfigGroups(
  summaries: ArtifactLatestSummary[]
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
    const leftLatest = Math.max(
      ...Object.values(left.latest).map((item) => new Date(item!.generatedAtUtc).getTime()),
      0
    );
    const rightLatest = Math.max(
      ...Object.values(right.latest).map((item) => new Date(item!.generatedAtUtc).getTime()),
      0
    );
    if (leftLatest !== rightLatest) {
      return rightLatest - leftLatest;
    }
    return left.sha256.localeCompare(right.sha256);
  });
}

export async function buildArtifactIndex(artifactsDir = DEFAULT_ARTIFACTS_DIR): Promise<ArtifactIndexFile> {
  const paperDir = join(artifactsDir, "paper");
  const researchDir = join(artifactsDir, "research");

  const paperFiles = await safeList(paperDir);
  const researchFiles = await safeList(researchDir);
  const rootFiles = await safeList(artifactsDir);

  const latestPaperJson = latestByName(paperFiles.filter((entry) => entry.endsWith(".json")));
  const latestPaperMd = latestByName(paperFiles.filter((entry) => entry.endsWith(".md")));
  const latestResearchJson = latestByName(researchFiles.filter((entry) => entry.endsWith(".json")));
  const latestResearchMd = latestByName(researchFiles.filter((entry) => entry.endsWith(".md")));
  const latestWalkForwardJson = latestByName(rootFiles.filter((entry) => /^walkforward-.*\.json$/.test(entry)));
  const latestWalkForwardMd = latestByName(rootFiles.filter((entry) => /^walkforward-.*\.md$/.test(entry)));
  const paperSummaries = await loadPaperSummaries(paperDir, paperFiles);
  const researchSummaries = await loadResearchSummaries(researchDir, researchFiles);
  const walkforwardSummaries = await loadWalkForwardSummaries(artifactsDir, rootFiles);
  const allSummaries = [...paperSummaries, ...researchSummaries, ...walkforwardSummaries];

  const latest: Partial<Record<ArtifactKind, ArtifactLatestSummary>> = {};

  if (latestPaperJson) {
    latest.paper =
      paperSummaries.find((summary) => summary.jsonPath === join(paperDir, latestPaperJson)) ??
      (await loadPaperSummaries(paperDir, [latestPaperJson, ...(latestPaperMd ? [latestPaperMd] : [])]))[0];
  }

  if (latestResearchJson) {
    latest.research =
      researchSummaries.find((summary) => summary.jsonPath === join(researchDir, latestResearchJson)) ??
      (await loadResearchSummaries(researchDir, [latestResearchJson, ...(latestResearchMd ? [latestResearchMd] : [])]))[0];
  }

  if (latestWalkForwardJson) {
    latest.walkforward =
      walkforwardSummaries.find((summary) => summary.jsonPath === join(artifactsDir, latestWalkForwardJson)) ??
      (await loadWalkForwardSummaries(artifactsDir, [latestWalkForwardJson, ...(latestWalkForwardMd ? [latestWalkForwardMd] : [])]))[0];
  }

  return {
    generatedAtUtc: new Date().toISOString(),
    artifactsDir,
    counts: {
      paper: paperFiles.filter((entry) => entry.endsWith(".json")).length,
      research: researchFiles.filter((entry) => entry.endsWith(".json")).length,
      walkforward: rootFiles.filter((entry) => /^walkforward-.*\.json$/.test(entry)).length
    },
    latest,
    byConfigHash: buildConfigGroups(allSummaries)
  };
}

export function renderArtifactIndexMarkdown(index: ArtifactIndexFile): string {
  const sections: string[] = [
    `# Artifact Index`,
    ``,
    `- Generated: ${index.generatedAtUtc}`,
    `- Artifacts dir: ${index.artifactsDir}`,
    ``,
    `## Counts`,
    ``,
    `- Paper reports: ${index.counts.paper}`,
    `- Research reports: ${index.counts.research}`,
    `- Walk-forward reports: ${index.counts.walkforward}`,
    `- Config profiles: ${index.byConfigHash.length}`
  ];

  for (const kind of ["paper", "research", "walkforward"] as ArtifactKind[]) {
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

    for (const kind of ["paper", "research", "walkforward"] as ArtifactKind[]) {
      const item = group.latest[kind];
      sections.push(item ? `- ${kind}: ${item.headline}` : `- ${kind}: none`);
    }
  }

  return sections.join("\n");
}

export async function writeArtifactIndex(artifactsDir = DEFAULT_ARTIFACTS_DIR): Promise<WrittenArtifactPaths & { index: ArtifactIndexFile }> {
  const index = await buildArtifactIndex(artifactsDir);
  await mkdir(artifactsDir, { recursive: true });
  const jsonPath = join(artifactsDir, "index.json");
  const markdownPath = join(artifactsDir, "index.md");
  await writeFile(jsonPath, JSON.stringify(index, null, 2), "utf8");
  await writeFile(markdownPath, renderArtifactIndexMarkdown(index), "utf8");
  return {
    index,
    jsonPath,
    markdownPath
  };
}
