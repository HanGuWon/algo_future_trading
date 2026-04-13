import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DEFAULT_ARTIFACTS_DIR } from "../config/defaults.js";
import type {
  DashboardDailyRunRow,
  DashboardHotspotSummary,
  DashboardLatestArtifactPointers,
  DashboardManifest,
  DashboardOverview,
  DashboardOverviewHotspot,
  DashboardResearchSnapshot,
  DailyRunArtifact,
  OperationsCompareArtifact,
  OperationsReportArtifact,
  ResearchReportArtifact,
  StrategyConfigReference
} from "../types.js";
import { resolveLatestDailyArtifacts, resolveRecentDailyRunArtifacts } from "./dailyRun.js";

export interface DashboardPublishBundle {
  manifest: DashboardManifest;
  overview: DashboardOverview;
  dailyRuns: DashboardDailyRunRow[];
  hotspots: DashboardHotspotSummary;
  research: DashboardResearchSnapshot;
}

export interface DashboardPublishPaths {
  manifestPath: string;
  overviewPath: string;
  dailyRunsPath: string;
  hotspotsPath: string;
  researchPath: string;
}

async function safeList(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readJsonIfExists<T>(path: string | null): Promise<T | null> {
  if (!path) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function toPublishedPath(path: string | null): string | null {
  if (!path) {
    return null;
  }
  const repoRelativeMatch = path.match(/[\\/]algo_future_trading[\\/](.+)$/);
  const normalized =
    repoRelativeMatch?.[1] ??
    (isAbsolute(path) ? relative(process.cwd(), path) : path);
  return normalized.replace(/\\/g, "/");
}

function toPublishedConfig(config: StrategyConfigReference | null): StrategyConfigReference | null {
  if (!config) {
    return null;
  }
  return {
    ...config,
    path: toPublishedPath(config.path) ?? config.path
  };
}

function latestByName(files: string[]): string | null {
  const sorted = [...files].sort((left, right) => right.localeCompare(left));
  return sorted[0] ?? null;
}

async function resolveLatestOpsArtifacts(artifactsDir: string): Promise<{
  opsReportArtifact: OperationsReportArtifact | null;
  opsReportJsonPath: string | null;
  opsCompareArtifact: OperationsCompareArtifact | null;
  opsCompareJsonPath: string | null;
}> {
  const opsDir = join(artifactsDir, "ops");
  const files = await safeList(opsDir);
  const opsReportName = latestByName(files.filter((entry) => /^ops-report-.*\.json$/.test(entry)));
  const opsCompareName = latestByName(files.filter((entry) => /^ops-compare-.*\.json$/.test(entry)));
  const opsReportJsonPath = opsReportName ? join(opsDir, opsReportName) : null;
  const opsCompareJsonPath = opsCompareName ? join(opsDir, opsCompareName) : null;

  const [opsReportArtifact, opsCompareArtifact] = await Promise.all([
    readJsonIfExists<OperationsReportArtifact>(opsReportJsonPath),
    readJsonIfExists<OperationsCompareArtifact>(opsCompareJsonPath)
  ]);

  return {
    opsReportArtifact,
    opsReportJsonPath,
    opsCompareArtifact,
    opsCompareJsonPath
  };
}

function collectConfigSummaries(
  dailyRuns: DailyRunArtifact[],
  researchArtifact: ResearchReportArtifact | null,
  hotspotsArtifact: OperationsCompareArtifact | null
): StrategyConfigReference[] {
  const configs = new Map<string, StrategyConfigReference>();
  for (const run of dailyRuns) {
    if (run.config) {
      configs.set(run.config.sha256, toPublishedConfig(run.config)!);
    }
  }
  if (researchArtifact?.config) {
    configs.set(researchArtifact.config.sha256, toPublishedConfig(researchArtifact.config)!);
  }
  for (const hotspot of hotspotsArtifact?.byConfig ?? []) {
    configs.set(hotspot.sha256, {
      path: toPublishedPath(hotspot.path) ?? hotspot.path,
      sha256: hotspot.sha256,
      summary: hotspot.summary
    });
  }
  return [...configs.values()].sort((left, right) => left.summary.localeCompare(right.summary));
}

function toOverviewHotspot(hotspot: OperationsCompareArtifact["topHotspots"][number] | undefined): DashboardOverviewHotspot | null {
  if (!hotspot) {
    return null;
  }
  return {
    sha256: hotspot.sha256,
    summary: hotspot.summary,
    path: toPublishedPath(hotspot.path) ?? hotspot.path,
    candidateCount: hotspot.candidateCount,
    lastSeenGeneratedAtUtc: hotspot.lastSeenGeneratedAtUtc,
    latestRecommendation: hotspot.latestRecommendation,
    latestFailedStep: hotspot.latestFailedStep,
    topWarningCodes: hotspot.topWarningCodes
  };
}

function toDailyRunRow(run: DailyRunArtifact): DashboardDailyRunRow {
  return {
    generatedAtUtc: run.generatedAtUtc,
    overallStatus: run.overallStatus,
    escalationLevel: run.historySnapshot?.escalationLevel ?? "NONE",
    warningCodes: run.warningCodes,
    failedStep: run.failedStep,
    paperNewTrades: run.paperNewTrades,
    researchRecommendation: run.researchRecommendation,
    researchGatePass: run.researchGatePass,
    config: toPublishedConfig(run.config),
    sourceRange: run.ingestionSummary?.sourceRange ?? run.runProvenance?.sourceRange ?? null,
    dailyJsonPath: toPublishedPath(run.artifactPaths.dailyJsonPath)
  };
}

function buildResearchSnapshot(artifact: ResearchReportArtifact | null): DashboardResearchSnapshot {
  if (!artifact) {
    return {
      generatedAtUtc: null,
      config: null,
      baselineTestExpectancyUsd: null,
      walkforwardOosExpectancyUsd: null,
      gatePass: null,
      recommendation: null,
      selectedWindowCount: null,
      windowCount: null
    };
  }

  return {
    generatedAtUtc: artifact.generatedAtUtc,
    config: toPublishedConfig(artifact.config ?? null),
    baselineTestExpectancyUsd: artifact.baseline.test.metrics.expectancyUsd,
    walkforwardOosExpectancyUsd: artifact.walkforward.rolledUpMetrics.expectancyUsd,
    gatePass: artifact.finalAssessment.gatePass,
    recommendation: artifact.finalAssessment.recommendation,
    selectedWindowCount: artifact.walkforward.selectedWindowCount,
    windowCount: artifact.walkforward.windowCount
  };
}

function buildHotspotSummary(artifact: OperationsCompareArtifact | null): DashboardHotspotSummary {
  return {
    generatedAtUtc: artifact?.generatedAtUtc ?? new Date().toISOString(),
    scannedRunCount: artifact?.scannedRunCount ?? 0,
    candidateCount: artifact?.candidateCount ?? 0,
    minEscalation: artifact?.minEscalation ?? "ATTENTION",
    byConfig:
      artifact?.byConfig.map((item) => ({
        ...item,
        path: toPublishedPath(item.path) ?? item.path
      })) ?? [],
    byWarningCode: artifact?.byWarningCode ?? [],
    byFailedStep: artifact?.byFailedStep ?? [],
    byRecommendation: artifact?.byRecommendation ?? [],
    topHotspots:
      artifact?.topHotspots.map((item) => ({
        ...item,
        path: toPublishedPath(item.path) ?? item.path
      })) ?? []
  };
}

export async function buildDashboardPublishBundle(
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  outDir = join("dashboard", "public", "data")
): Promise<DashboardPublishBundle> {
  const [dailyRuns, latestDailyArtifacts, latestOpsArtifacts] = await Promise.all([
    resolveRecentDailyRunArtifacts(artifactsDir, 14),
    resolveLatestDailyArtifacts(artifactsDir),
    resolveLatestOpsArtifacts(artifactsDir)
  ]);

  const latestDaily = dailyRuns[0] ?? null;
  const sourceRange =
    latestDaily?.ingestionSummary?.sourceRange ??
    latestDaily?.runProvenance?.sourceRange ??
    latestDailyArtifacts.batchArtifact?.ingestionSummary?.sourceRange ??
    latestDailyArtifacts.researchArtifact?.runProvenance.sourceRange ??
    latestDailyArtifacts.paperArtifact?.runProvenance.sourceRange ??
    null;

  const latestArtifacts: DashboardLatestArtifactPointers = {
    batchJsonPath: toPublishedPath(latestDailyArtifacts.pointers.batchJsonPath),
    paperJsonPath: toPublishedPath(latestDailyArtifacts.pointers.paperJsonPath),
    researchJsonPath: toPublishedPath(latestDailyArtifacts.pointers.researchJsonPath),
    dailyJsonPath: toPublishedPath(latestDaily?.artifactPaths.dailyJsonPath ?? null),
    dailyMarkdownPath: toPublishedPath(latestDaily?.artifactPaths.dailyMarkdownPath ?? null),
    opsReportJsonPath: toPublishedPath(latestOpsArtifacts.opsReportJsonPath),
    opsCompareJsonPath: toPublishedPath(latestOpsArtifacts.opsCompareJsonPath)
  };

  const hotspots = buildHotspotSummary(latestOpsArtifacts.opsCompareArtifact);
  const research = buildResearchSnapshot(latestDailyArtifacts.researchArtifact);
  const configSummaries = collectConfigSummaries(
    dailyRuns,
    latestDailyArtifacts.researchArtifact,
    latestOpsArtifacts.opsCompareArtifact
  );

  const manifest: DashboardManifest = {
    generatedAtUtc: new Date().toISOString(),
    publishVersion: "0.1.0",
    artifactsDir: toPublishedPath(resolve(artifactsDir)) ?? artifactsDir,
    outDir: toPublishedPath(resolve(outDir)) ?? outDir,
    configSummaries,
    latestArtifacts,
    sourceRange
  };

  const overview: DashboardOverview = {
    generatedAtUtc: manifest.generatedAtUtc,
    latestDailyStatus: latestDaily?.overallStatus ?? null,
    latestEscalationLevel: latestDaily?.historySnapshot?.escalationLevel ?? "NONE",
    latestWarningCodes: latestDaily?.warningCodes ?? [],
    failStreak: latestDaily?.historySnapshot?.consecutiveFailCount ?? 0,
    nonOkStreak: latestDaily?.historySnapshot?.consecutiveNonOkCount ?? 0,
    latestPaperNewTrades: latestDaily?.paperNewTrades ?? null,
    researchRecommendation: latestDaily?.researchRecommendation ?? research.recommendation,
    researchGatePass: latestDaily?.researchGatePass ?? research.gatePass,
    topHotspot: toOverviewHotspot(hotspots.topHotspots[0]),
    sourceRange
  };

  return {
    manifest,
    overview,
    dailyRuns: dailyRuns.map(toDailyRunRow),
    hotspots,
    research
  };
}

export async function writeDashboardPublishBundle(
  bundle: DashboardPublishBundle,
  outDir = join("dashboard", "public", "data")
): Promise<DashboardPublishPaths> {
  const resolvedOutDir = resolve(outDir);
  await mkdir(resolvedOutDir, { recursive: true });

  const manifestPath = join(resolvedOutDir, "manifest.json");
  const overviewPath = join(resolvedOutDir, "overview.json");
  const dailyRunsPath = join(resolvedOutDir, "daily-runs.json");
  const hotspotsPath = join(resolvedOutDir, "hotspots.json");
  const researchPath = join(resolvedOutDir, "research.json");

  await Promise.all([
    writeFile(manifestPath, JSON.stringify(bundle.manifest, null, 2), "utf8"),
    writeFile(overviewPath, JSON.stringify(bundle.overview, null, 2), "utf8"),
    writeFile(dailyRunsPath, JSON.stringify(bundle.dailyRuns, null, 2), "utf8"),
    writeFile(hotspotsPath, JSON.stringify(bundle.hotspots, null, 2), "utf8"),
    writeFile(researchPath, JSON.stringify(bundle.research, null, 2), "utf8")
  ]);

  return {
    manifestPath,
    overviewPath,
    dailyRunsPath,
    hotspotsPath,
    researchPath
  };
}
