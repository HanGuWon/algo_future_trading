import "./styles.css";

type DailyHealthStatus = "OK" | "WARN" | "FAIL";
type DailyEscalationLevel = "NONE" | "ATTENTION" | "CRITICAL";

interface WarningCodeCount {
  code: string;
  count: number;
}

interface StrategyConfigReference {
  path: string;
  sha256: string;
  summary: string;
}

interface DashboardManifest {
  generatedAtUtc: string;
  publishVersion: string;
  configSummaries: StrategyConfigReference[];
  latestArtifacts: Record<string, string | null>;
  sourceRange: { startUtc: string; endUtc: string } | null;
}

interface DashboardOverviewHotspot {
  summary: string;
  path: string;
  sha256: string;
  candidateCount: number;
  lastSeenGeneratedAtUtc: string;
  latestRecommendation: string;
  latestFailedStep: string;
  topWarningCodes: WarningCodeCount[];
}

interface DashboardOverview {
  generatedAtUtc: string;
  latestDailyStatus: DailyHealthStatus | null;
  latestEscalationLevel: DailyEscalationLevel;
  latestWarningCodes: string[];
  failStreak: number;
  nonOkStreak: number;
  latestPaperNewTrades: number | null;
  researchRecommendation: string | null;
  researchGatePass: boolean | null;
  topHotspot: DashboardOverviewHotspot | null;
  sourceRange: { startUtc: string; endUtc: string } | null;
}

interface DashboardDailyRunRow {
  generatedAtUtc: string;
  overallStatus: DailyHealthStatus;
  escalationLevel: DailyEscalationLevel;
  warningCodes: string[];
  failedStep: string | null;
  paperNewTrades: number | null;
  researchRecommendation: string | null;
  researchGatePass: boolean | null;
  config: StrategyConfigReference | null;
  sourceRange: { startUtc: string; endUtc: string } | null;
  dailyJsonPath: string | null;
}

interface HotspotConfigSummary {
  sha256: string;
  summary: string;
  path: string;
  candidateCount: number;
  lastSeenGeneratedAtUtc: string;
  latestRecommendation: string;
  latestFailedStep: string;
  topWarningCodes: WarningCodeCount[];
}

interface DashboardHotspotSummary {
  generatedAtUtc: string;
  scannedRunCount: number;
  candidateCount: number;
  minEscalation: DailyEscalationLevel;
  byConfig: HotspotConfigSummary[];
  byWarningCode: Array<{
    code: string;
    candidateCount: number;
    latestSeenGeneratedAtUtc: string;
    uniqueConfigCount: number;
  }>;
  byFailedStep: Array<{
    failedStep: string;
    candidateCount: number;
    latestSeenGeneratedAtUtc: string;
  }>;
  byRecommendation: Array<{
    recommendation: string;
    candidateCount: number;
    latestSeenGeneratedAtUtc: string;
  }>;
  topHotspots: HotspotConfigSummary[];
}

interface DashboardResearchSnapshot {
  generatedAtUtc: string | null;
  config: StrategyConfigReference | null;
  baselineTestExpectancyUsd: number | null;
  walkforwardOosExpectancyUsd: number | null;
  gatePass: boolean | null;
  recommendation: string | null;
  selectedWindowCount: number | null;
  windowCount: number | null;
}

const appRoot = document.querySelector("#app");

if (!(appRoot instanceof HTMLDivElement)) {
  throw new Error("Missing #app root");
}

const app = appRoot;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "n/a";
  }
  return new Date(value).toLocaleString("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSourceRange(range: { startUtc: string; endUtc: string } | null): string {
  if (!range) {
    return "n/a";
  }
  return `${range.startUtc} -> ${range.endUtc}`;
}

function statusBadge(status: DailyHealthStatus | null, escalation?: DailyEscalationLevel): string {
  if (!status) {
    return `<span class="meta-badge">No daily status</span>`;
  }
  const cssClass = escalation === "CRITICAL" ? "critical" : status.toLowerCase();
  const label = escalation && escalation !== "NONE" ? `${status} / ${escalation}` : status;
  return `<span class="status-badge ${cssClass}">${escapeHtml(label)}</span>`;
}

function warningChip(code: string): string {
  return `<span class="warning-chip">${escapeHtml(code)}</span>`;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function renderShell(manifest: DashboardManifest | null, overview: DashboardOverview | null): void {
  app.innerHTML = `
    <main class="app-shell">
      <section class="hero">
        <div class="badge-row">
          ${statusBadge(overview?.latestDailyStatus ?? null, overview?.latestEscalationLevel)}
          <span class="meta-badge">Publish ${escapeHtml(manifest?.publishVersion ?? "n/a")}</span>
          <span class="meta-badge">Configs ${manifest?.configSummaries.length ?? 0}</span>
        </div>
        <h1>MNQ Ops Dashboard</h1>
        <p>
          Cloudflare Pages snapshot of local MNQ research and daily operations artifacts. The dashboard is artifact-driven:
          local <code>cloud-daily</code> publishes normalized JSON, and the cloud UI reads only those snapshots.
        </p>
      </section>

      <section class="layout">
        <section class="section-card" id="overview-section"></section>
        <section class="section-card" id="runs-section"></section>
        <section class="section-card" id="hotspots-section"></section>
        <section class="section-card" id="research-section"></section>
      </section>

      <p class="footnote">
        Latest publish: ${formatDate(manifest?.generatedAtUtc ?? null)}.
        Source range: ${escapeHtml(formatSourceRange(overview?.sourceRange ?? manifest?.sourceRange ?? null))}.
      </p>
    </main>
  `;

  const overviewSection = document.querySelector<HTMLElement>("#overview-section");
  if (!overviewSection) {
    return;
  }

  if (!overview) {
    overviewSection.innerHTML = `
      <h2>Overview</h2>
      <div class="empty-state">No published overview snapshot is available yet. Run <code>npm run publish-dashboard</code> or <code>npm run cloud-daily</code>.</div>
    `;
    return;
  }

  const topWarnings = overview.latestWarningCodes.length > 0
    ? overview.latestWarningCodes.map(warningChip).join("")
    : `<span class="meta-badge">none</span>`;
  const topHotspotWarnings =
    overview.topHotspot && overview.topHotspot.topWarningCodes.length > 0
      ? overview.topHotspot.topWarningCodes.map((item) => `${item.code}:${item.count}`).join(", ")
      : "none";

  overviewSection.innerHTML = `
    <h2>Overview</h2>
    <div class="summary-grid">
      <article class="stat-tile">
        <div class="label">Daily status</div>
        <div class="value">${escapeHtml(overview.latestDailyStatus ?? "n/a")}</div>
        <div class="detail">Escalation ${escapeHtml(overview.latestEscalationLevel)}</div>
      </article>
      <article class="stat-tile">
        <div class="label">Fail streak</div>
        <div class="value">${overview.failStreak}</div>
        <div class="detail">Non-OK streak ${overview.nonOkStreak}</div>
      </article>
      <article class="stat-tile">
        <div class="label">Paper new trades</div>
        <div class="value">${overview.latestPaperNewTrades ?? "n/a"}</div>
        <div class="detail">Latest run only</div>
      </article>
      <article class="stat-tile">
        <div class="label">Research</div>
        <div class="value">${escapeHtml(overview.researchRecommendation ?? "n/a")}</div>
        <div class="detail">Gate ${overview.researchGatePass === null ? "n/a" : overview.researchGatePass ? "pass" : "fail"}</div>
      </article>
    </div>
    <div class="split-grid" style="margin-top: 18px;">
      <div class="panel-stack">
        <article class="stat-tile">
          <div class="label">Warning codes</div>
          <div class="detail warning-list">${topWarnings}</div>
        </article>
        <article class="stat-tile">
          <div class="label">Latest source range</div>
          <div class="detail"><code>${escapeHtml(formatSourceRange(overview.sourceRange))}</code></div>
        </article>
      </div>
      <article class="stat-tile">
        <div class="label">Top hotspot</div>
        <div class="value">${escapeHtml(overview.topHotspot?.summary ?? "none")}</div>
        <div class="detail">
          ${
            overview.topHotspot
              ? `Candidates ${overview.topHotspot.candidateCount}<br />Warnings ${escapeHtml(topHotspotWarnings)}<br />Failed step ${escapeHtml(overview.topHotspot.latestFailedStep)}`
              : "No recurrent hotspot in the latest publish."
          }
        </div>
      </article>
    </div>
  `;
}

function renderDailyRuns(runs: DashboardDailyRunRow[] | null): void {
  const section = document.querySelector<HTMLElement>("#runs-section");
  if (!section) {
    return;
  }
  if (!runs || runs.length === 0) {
    section.innerHTML = `<h2>Recent Runs</h2><div class="empty-state">No daily runs published yet.</div>`;
    return;
  }

  section.innerHTML = `
    <h2>Recent Runs</h2>
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>Generated</th>
            <th>Status</th>
            <th>Warnings</th>
            <th>Failed step</th>
            <th>Paper trades</th>
            <th>Research</th>
            <th>Config</th>
          </tr>
        </thead>
        <tbody>
          ${runs
            .map(
              (run) => `
                <tr>
                  <td>${escapeHtml(formatDate(run.generatedAtUtc))}</td>
                  <td>${statusBadge(run.overallStatus, run.escalationLevel)}</td>
                  <td>${run.warningCodes.length > 0 ? run.warningCodes.map(warningChip).join("") : '<span class="meta-badge">none</span>'}</td>
                  <td>${escapeHtml(run.failedStep ?? "none")}</td>
                  <td>${run.paperNewTrades ?? "n/a"}</td>
                  <td>${escapeHtml(run.researchRecommendation ?? "n/a")} / ${run.researchGatePass === null ? "n/a" : run.researchGatePass ? "pass" : "fail"}</td>
                  <td>
                    <div>${escapeHtml(run.config?.summary ?? "n/a")}</div>
                    <div class="detail"><code>${escapeHtml(run.config?.sha256.slice(0, 12) ?? "n/a")}</code></div>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHotspots(hotspots: DashboardHotspotSummary | null): void {
  const section = document.querySelector<HTMLElement>("#hotspots-section");
  if (!section) {
    return;
  }
  if (!hotspots) {
    section.innerHTML = `<h2>Hotspots</h2><div class="empty-state">No hotspot comparison snapshot is available yet.</div>`;
    return;
  }

  const topConfig = hotspots.byConfig[0];
  const topWarning = hotspots.byWarningCode[0];
  const topFailedStep = hotspots.byFailedStep[0];

  section.innerHTML = `
    <h2>Hotspots</h2>
    <div class="summary-grid">
      <article class="stat-tile">
        <div class="label">Candidates</div>
        <div class="value">${hotspots.candidateCount}</div>
        <div class="detail">Scanned runs ${hotspots.scannedRunCount}</div>
      </article>
      <article class="stat-tile">
        <div class="label">Top config</div>
        <div class="value">${escapeHtml(topConfig?.summary ?? "none")}</div>
        <div class="detail">${topConfig ? `${topConfig.candidateCount} candidates` : "No config hotspot"}</div>
      </article>
      <article class="stat-tile">
        <div class="label">Top warning</div>
        <div class="value">${escapeHtml(topWarning?.code ?? "none")}</div>
        <div class="detail">${topWarning ? `${topWarning.candidateCount} candidates` : "No warning hotspot"}</div>
      </article>
      <article class="stat-tile">
        <div class="label">Failed step</div>
        <div class="value">${escapeHtml(topFailedStep?.failedStep ?? "none")}</div>
        <div class="detail">${topFailedStep ? `${topFailedStep.candidateCount} candidates` : "No failed step hotspot"}</div>
      </article>
    </div>
    <div class="split-grid" style="margin-top: 18px;">
      <div class="table-shell">
        <table>
          <thead>
            <tr>
              <th>Config</th>
              <th>Candidates</th>
              <th>Latest recommendation</th>
              <th>Latest failed step</th>
              <th>Top warnings</th>
            </tr>
          </thead>
          <tbody>
            ${hotspots.byConfig.length > 0
              ? hotspots.byConfig
                  .slice(0, 5)
                  .map(
                    (item) => `
                      <tr>
                        <td>
                          <div>${escapeHtml(item.summary)}</div>
                          <div class="detail"><code>${escapeHtml(item.sha256.slice(0, 12))}</code></div>
                        </td>
                        <td>${item.candidateCount}</td>
                        <td>${escapeHtml(item.latestRecommendation)}</td>
                        <td>${escapeHtml(item.latestFailedStep)}</td>
                        <td>${escapeHtml(item.topWarningCodes.map((warning) => `${warning.code}:${warning.count}`).join(", ") || "none")}</td>
                      </tr>
                    `
                  )
                  .join("")
              : '<tr><td colspan="5">No config hotspots.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="panel-stack">
        <article class="stat-tile">
          <div class="label">Top warning codes</div>
          <div class="detail meta-list">
            ${
              hotspots.byWarningCode.length > 0
                ? hotspots.byWarningCode
                    .slice(0, 5)
                    .map((item) => `<div>${escapeHtml(item.code)}: ${item.candidateCount} / ${item.uniqueConfigCount} configs</div>`)
                    .join("")
                : "none"
            }
          </div>
        </article>
        <article class="stat-tile">
          <div class="label">Recommendations</div>
          <div class="detail meta-list">
            ${
              hotspots.byRecommendation.length > 0
                ? hotspots.byRecommendation
                    .map((item) => `<div>${escapeHtml(item.recommendation)}: ${item.candidateCount}</div>`)
                    .join("")
                : "none"
            }
          </div>
        </article>
      </div>
    </div>
  `;
}

function renderResearch(snapshot: DashboardResearchSnapshot | null, manifest: DashboardManifest | null): void {
  const section = document.querySelector<HTMLElement>("#research-section");
  if (!section) {
    return;
  }
  if (!snapshot) {
    section.innerHTML = `<h2>Research Snapshot</h2><div class="empty-state">No research snapshot has been published.</div>`;
    return;
  }

  section.innerHTML = `
    <h2>Research Snapshot</h2>
    <div class="summary-grid">
      <article class="stat-tile">
        <div class="label">Recommendation</div>
        <div class="value">${escapeHtml(snapshot.recommendation ?? "n/a")}</div>
        <div class="detail">Gate ${snapshot.gatePass === null ? "n/a" : snapshot.gatePass ? "pass" : "fail"}</div>
      </article>
      <article class="stat-tile">
        <div class="label">Baseline test expectancy</div>
        <div class="value">${snapshot.baselineTestExpectancyUsd ?? "n/a"}</div>
        <div class="detail">USD per trade</div>
      </article>
      <article class="stat-tile">
        <div class="label">Walk-forward OOS expectancy</div>
        <div class="value">${snapshot.walkforwardOosExpectancyUsd ?? "n/a"}</div>
        <div class="detail">USD per trade</div>
      </article>
      <article class="stat-tile">
        <div class="label">Selected windows</div>
        <div class="value">${
          snapshot.selectedWindowCount === null || snapshot.windowCount === null
            ? "n/a"
            : `${snapshot.selectedWindowCount}/${snapshot.windowCount}`
        }</div>
        <div class="detail">Latest walk-forward summary</div>
      </article>
    </div>
    <div class="split-grid" style="margin-top: 18px;">
      <article class="stat-tile">
        <div class="label">Config</div>
        <div class="value">${escapeHtml(snapshot.config?.summary ?? "n/a")}</div>
        <div class="detail"><code>${escapeHtml(snapshot.config?.path ?? "n/a")}</code></div>
      </article>
      <article class="stat-tile">
        <div class="label">Published artifacts</div>
        <div class="detail meta-list">
          <div>Daily: <code>${escapeHtml(manifest?.latestArtifacts.dailyJsonPath ?? "n/a")}</code></div>
          <div>Ops report: <code>${escapeHtml(manifest?.latestArtifacts.opsReportJsonPath ?? "n/a")}</code></div>
          <div>Ops compare: <code>${escapeHtml(manifest?.latestArtifacts.opsCompareJsonPath ?? "n/a")}</code></div>
          <div>Research: <code>${escapeHtml(manifest?.latestArtifacts.researchJsonPath ?? "n/a")}</code></div>
        </div>
      </article>
    </div>
  `;
}

async function init(): Promise<void> {
  const [manifest, overview] = await Promise.all([
    fetchJson<DashboardManifest>("/data/manifest.json"),
    fetchJson<DashboardOverview>("/data/overview.json")
  ]);

  renderShell(manifest, overview);

  const [dailyRuns, hotspots, research] = await Promise.all([
    fetchJson<DashboardDailyRunRow[]>("/data/daily-runs.json"),
    fetchJson<DashboardHotspotSummary>("/data/hotspots.json"),
    fetchJson<DashboardResearchSnapshot>("/data/research.json")
  ]);

  renderDailyRuns(dailyRuns);
  renderHotspots(hotspots);
  renderResearch(research, manifest);
}

void init();
