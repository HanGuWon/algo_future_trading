import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type { PaperReportArtifact, ResearchReportArtifact, WalkForwardArtifact } from "../types.js";
import type { WrittenArtifactPaths } from "./paperArtifacts.js";

type ArtifactKind = "paper" | "research" | "walkforward";

interface ArtifactLatestSummary {
  kind: ArtifactKind;
  generatedAtUtc: string;
  jsonPath: string;
  markdownPath: string | null;
  headline: string;
  details: string[];
}

interface ArtifactIndexFile {
  generatedAtUtc: string;
  artifactsDir: string;
  counts: Record<ArtifactKind, number>;
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

function paperSummary(artifact: PaperReportArtifact, jsonPath: string, markdownPath: string | null): ArtifactLatestSummary {
  return {
    kind: "paper",
    generatedAtUtc: artifact.generatedAtUtc,
    jsonPath,
    markdownPath,
    headline: `Paper: ${artifact.cumulativeMetrics.netPnlUsd.toFixed(2)} USD net, ${artifact.cumulativeMetrics.tradeCount} trades`,
    details: [
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
    details: [
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
    details: [
      `OOS net PnL ${artifact.rolledUpMetrics.netPnlUsd.toFixed(2)} USD`,
      `OOS expectancy ${artifact.rolledUpMetrics.expectancyUsd.toFixed(2)} USD`
    ]
  };
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

  const latest: Partial<Record<ArtifactKind, ArtifactLatestSummary>> = {};

  if (latestPaperJson) {
    const jsonPath = join(paperDir, latestPaperJson);
    const artifact = await readJson<PaperReportArtifact>(jsonPath);
    latest.paper = paperSummary(artifact, jsonPath, latestPaperMd ? join(paperDir, latestPaperMd) : null);
  }

  if (latestResearchJson) {
    const jsonPath = join(researchDir, latestResearchJson);
    const artifact = await readJson<ResearchReportArtifact>(jsonPath);
    latest.research = researchSummary(artifact, jsonPath, latestResearchMd ? join(researchDir, latestResearchMd) : null);
  }

  if (latestWalkForwardJson) {
    const jsonPath = join(artifactsDir, latestWalkForwardJson);
    const artifact = await readJson<WalkForwardArtifact>(jsonPath);
    latest.walkforward = walkforwardSummary(artifact, jsonPath, latestWalkForwardMd ? join(artifactsDir, latestWalkForwardMd) : null);
  }

  return {
    generatedAtUtc: new Date().toISOString(),
    artifactsDir,
    counts: {
      paper: paperFiles.filter((entry) => entry.endsWith(".json")).length,
      research: researchFiles.filter((entry) => entry.endsWith(".json")).length,
      walkforward: rootFiles.filter((entry) => /^walkforward-.*\.json$/.test(entry)).length
    },
    latest
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
    `- Walk-forward reports: ${index.counts.walkforward}`
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
