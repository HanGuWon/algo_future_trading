export type Side = "BUY" | "SELL";
export type SessionLabel = "ASIA" | "EUROPE" | "US" | "CLOSED";
export type BreakState = "ABOVE_PREV_HIGH" | "BELOW_PREV_LOW" | "INSIDE" | "UNKNOWN";
export type CandleType =
  | "HAMMER"
  | "SHOOTING_STAR"
  | "BULLISH_REJECTION"
  | "BEARISH_REJECTION"
  | "DOJI"
  | "NONE";
export type Timeframe = "1m" | "5m" | "15m" | "1h";
export type OrderStatus = "PENDING" | "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "CLOSED";
export type EventType = "FOMC" | "CPI" | "EMPLOYMENT";
export type StrategyId = "SessionFilteredTrendPullback_v1";
export type TradeSource = "BACKTEST" | "PAPER";
export type InputMode = "file" | "dir" | "none";
export type IngestionFileStatus = "processed" | "failed";
export type DailyHealthStatus = "OK" | "WARN" | "FAIL";
export type DailyWarningCode =
  | "NO_NEW_FILES"
  | "ZERO_INSERTED_BARS"
  | "INGEST_FAILED_FILES"
  | "NO_NEW_PAPER_TRADES"
  | "RESEARCH_GATE_FAILED"
  | "RESEARCH_MORE"
  | "STALE_SOURCE_RANGE"
  | "BATCH_FAILED";

export interface WarningCodeCount {
  code: DailyWarningCode;
  count: number;
}

export interface DailyHistorySnapshot {
  windowSize: number;
  okCount: number;
  warnCount: number;
  failCount: number;
  consecutiveFailCount: number;
  consecutiveNonOkCount: number;
  latestOkGeneratedAtUtc: string | null;
  latestFailGeneratedAtUtc: string | null;
  warningCodeCounts: WarningCodeCount[];
}

export interface DailyOperationsSummary extends DailyHistorySnapshot {
  latestStatus: DailyHealthStatus | null;
  latestWarningCodes: DailyWarningCode[];
  recentRunCount: number;
}

export interface Bar {
  symbol: string;
  contract: string;
  tsUtc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sessionLabel: SessionLabel;
}

export interface SessionState {
  sessionName: SessionLabel;
  sessionOpen: number | null;
  prevSessionHigh: number | null;
  prevSessionLow: number | null;
  breakState: BreakState;
  tradingDate: string;
  sessionKey: string;
  minutesSinceSessionStart: number | null;
}

export interface EventWindow {
  eventType: EventType;
  startUtc: string;
  endUtc: string;
  severity: "HIGH";
  blocked: boolean;
  source: string;
  notes?: string;
}

export interface PivotCluster {
  support: number | null;
  resistance: number | null;
  lookbackBars: number;
}

export interface FeatureSnapshot {
  symbol: string;
  tsUtc: string;
  ma20: number | null;
  ma120: number | null;
  maSlope: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  candleType: CandleType;
  confluenceScore: number;
  directionBias: Side | null;
  support: number | null;
  resistance: number | null;
  sessionState: SessionState;
  longReasons: string[];
  shortReasons: string[];
  pivotCluster: PivotCluster;
}

export interface SignalCandidate {
  side: Side;
  signalTs: string;
  entryPx: number;
  stopPx: number;
  score: number;
  invalidationPx: number;
  targetPx: number;
  reasons: string[];
}

export interface RiskDecision {
  approved: boolean;
  qty: number;
  riskUsd: number;
  rejectReason?: string;
}

export interface PaperOrder {
  id: string;
  strategyId: StrategyId;
  symbol: string;
  contract: string;
  side: Side;
  qty: number;
  entryPx: number;
  stopPx: number;
  targetPx: number;
  signalTs: string;
  submittedTs: string;
  status: OrderStatus;
  filledQty: number;
  avgFillPx?: number;
  breakEvenArmed: boolean;
  sessionExitTs: string;
}

export interface PaperPositionState {
  id: string;
  strategyId: StrategyId;
  symbol: string;
  contract: string;
  side: Side;
  qty: number;
  remainingQty: number;
  entryPx: number;
  stopPx: number;
  targetPx: number;
  signalTs: string;
  submittedTs: string;
  filledTs?: string;
  status: "PENDING" | "OPEN";
  avgFillPx?: number;
  breakEvenArmed: boolean;
  currentStopPx: number;
  sessionExitTs: string;
  entryWindowEndTs: string;
  lastProcessedBarTs: string | null;
}

export interface TradeRecord {
  id: string;
  strategyId: StrategyId;
  symbol: string;
  contract: string;
  side: Side;
  qty: number;
  entryTs: string;
  exitTs: string;
  entryPx: number;
  exitPx: number;
  stopPx: number;
  targetPx: number;
  feesUsd: number;
  slippageUsd: number;
  pnlUsd: number;
  exitReason: "STOP" | "TARGET" | "TRAIL" | "SESSION_FLAT";
  version: string;
}

export interface PersistedPaperState {
  strategyId: StrategyId;
  symbol: string;
  paperStartUtc: string;
  processedThroughUtc: string | null;
  lastProcessedSignalTs: string | null;
  currentTradingDate: string | null;
  accountState: AccountState;
  activePosition: PaperPositionState | null;
  updatedAtUtc: string;
}

export interface InstrumentSpec {
  symbol: string;
  venue: "CME";
  tickSize: number;
  tickValue: number;
  contractMultiplier: number;
  currency: "USD";
  tradingTimezone: "America/Chicago";
}

export interface StrategyConfig {
  strategyId: StrategyId;
  signalTimeframe: "1h";
  executionTimeframe: "5m";
  trailingTimeframe: "15m";
  maFast: number;
  maSlow: number;
  bollingerPeriod: number;
  bollingerStdDev: number;
  confluenceThreshold: number;
  riskPctPerTrade: number;
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  commissionPerContractUsd: number;
  defaultSlippageTicks: number;
  usOpenSlippageTicks: number;
  europeTradableMinutes: number;
  usTradableMinutes: number;
  eventBlackoutMinutesBefore: number;
  eventBlackoutMinutesAfter: number;
}

export interface StrategyConfigReference {
  path: string;
  sha256: string;
  summary: string;
}

export interface RunProvenance {
  gitCommitSha: string | null;
  nodeVersion: string;
  dbPath: string | null;
  eventWindowCount: number;
  sourceRange: DateRange | null;
  inputMode: InputMode;
  inputPath: string | null;
}

export interface IngestionFileRecord {
  filePath: string;
  fileSizeBytes: number;
  fileModifiedTimeUtc: string;
  contentHash: string;
  detectedContract: string | null;
  firstTsUtc: string | null;
  lastTsUtc: string | null;
  rowsInserted: number;
  processedAtUtc: string;
  status: IngestionFileStatus;
  failureReason?: string;
}

export interface IngestionRunSummary {
  inputMode: Exclude<InputMode, "none">;
  inputPath: string;
  scannedFileCount: number;
  newFileCount: number;
  skippedFileCount: number;
  failedFileCount: number;
  insertedBarCount: number;
  sourceRange: DateRange | null;
  contracts: string[];
}

export interface BatchIngestionSummary extends IngestionRunSummary {}

export interface AccountState {
  equityUsd: number;
  startOfDayEquityUsd: number;
  dailyPnlUsd: number;
  consecutiveLosses: number;
  cooldownUntilUtc: string | null;
}

export interface DateRange {
  startUtc: string;
  endUtc: string;
}

export interface ContractWindow {
  symbol: string;
  contract: string;
  expiryUtc: string;
  rollStartUtc: string;
}

export interface BacktestResult {
  trades: TradeRecord[];
  finalAccountState: AccountState;
  rejectedSignals: Array<{ tsUtc: string; reason: string }>;
}

export interface PaperRunResult {
  trades: TradeRecord[];
  finalState: PersistedPaperState;
  rejectedSignals: Array<{ tsUtc: string; reason: string }>;
}

export interface CsvIngestionSummary {
  symbol: string;
  rowCount: number;
  firstTsUtc: string;
  lastTsUtc: string;
  contracts: string[];
  usedFallbackContract: boolean;
}

export interface ParsedCsvBarsResult {
  bars: Bar[];
  summary: CsvIngestionSummary;
  warnings: string[];
}

export interface SessionMetricsBreakdown {
  tradeCount: number;
  netPnlUsd: number;
}

export interface SideMetricsBreakdown {
  tradeCount: number;
  netPnlUsd: number;
}

export interface RunMetrics {
  tradeCount: number;
  winRate: number;
  netPnlUsd: number;
  expectancyUsd: number;
  profitFactor: number | null;
  maxDrawdownUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  rejectedSignalCount: number;
  sessionBreakdown: Record<SessionLabel, SessionMetricsBreakdown>;
  sideBreakdown: Record<Side, SideMetricsBreakdown>;
}

export interface DailyPerformanceRow {
  tradingDate: string;
  tradeCount: number;
  winRate: number;
  netPnlUsd: number;
  avgPnlUsd: number;
}

export interface SessionPerformanceRow {
  sessionLabel: SessionLabel;
  tradeCount: number;
  winRate: number;
  netPnlUsd: number;
  avgPnlUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
}

export interface PaperReportArtifact {
  generatedAtUtc: string;
  symbol: string;
  strategyId: StrategyId;
  config?: StrategyConfigReference;
  runProvenance: RunProvenance;
  source: TradeSource;
  run: {
    startUtc: string;
    endUtc: string | null;
    processedThroughUtc: string | null;
    newTradeCount: number;
    rejectedSignalCount: number;
    artifactVersion: string;
  };
  activePosition: PersistedPaperState["activePosition"];
  runMetrics: RunMetrics;
  cumulativeMetrics: RunMetrics;
  dailyPerformance: DailyPerformanceRow[];
  sessionPerformance: SessionPerformanceRow[];
}

export interface AcceptanceSliceResult {
  slice: "train" | "validation" | "test";
  range: DateRange;
  metrics: RunMetrics;
}

export interface SensitivityCandidateResult {
  candidate: ParameterCandidate;
  validationMetrics: RunMetrics;
  testMetrics: RunMetrics;
  isStable: boolean;
  rank: number;
  baselineDelta: {
    validationNetPnlUsd: number;
    testNetPnlUsd: number;
    validationExpectancyUsd: number;
    testExpectancyUsd: number;
  };
  neighborDispersion: {
    validationNetPnlRangeUsd: number;
    testNetPnlRangeUsd: number;
    validationExpectancyRangeUsd: number;
    testExpectancyRangeUsd: number;
  };
}

export interface EventScenarioResult {
  scenario: "default" | "disabled" | "full_session";
  metrics: RunMetrics;
  deltaFromBaseline: {
    tradeCount: number;
    netPnlUsd: number;
    expectancyUsd: number;
    maxDrawdownUsd: number;
  };
}

export interface ResearchGateConfig {
  minTrades: number;
  minSelectedWalkforwardWindows: number;
  minExpectancyUsd: number;
  maxDrawdownUsd: number;
}

export interface GateThresholdResult {
  passed: boolean;
  actual: number;
  threshold: number;
}

export interface ResearchGateResult {
  baselineTestTrades: GateThresholdResult;
  walkforwardTrades: GateThresholdResult;
  selectedWalkforwardWindows: GateThresholdResult;
  baselineTestExpectancy: GateThresholdResult;
  walkforwardExpectancy: GateThresholdResult;
  baselineTestMaxDrawdown: GateThresholdResult;
  walkforwardMaxDrawdown: GateThresholdResult;
  sensitivityTopCandidatesTrades: {
    passed: boolean;
    threshold: number;
    passingCandidates: number;
    totalCandidates: number;
  };
}

export interface FinalResearchAssessment {
  baseline_test_positive_expectancy: boolean;
  walkforward_oos_positive_expectancy: boolean;
  parameter_stability_pass: boolean;
  event_filter_dependence: "low" | "moderate" | "high";
  gatePass: boolean;
  gateFailureReasons: string[];
  recommendation: "continue_paper" | "research_more" | "reject_current_rule_set";
}

export interface ResearchReportArtifact {
  generatedAtUtc: string;
  symbol: string;
  strategyId: StrategyId;
  config?: StrategyConfigReference;
  runProvenance: RunProvenance;
  baseline: {
    train: AcceptanceSliceResult;
    validation: AcceptanceSliceResult;
    test: AcceptanceSliceResult;
  };
  walkforward: {
    mode: "fixed" | "grid";
    windowCount: number;
    selectedWindowCount: number;
    rolledUpMetrics: RunMetrics;
    windows: Array<{
      id: string;
      status: WindowSelectionResult["status"];
      selectedCandidateId: string | null;
      selectedTestMetrics: RunMetrics | null;
    }>;
  };
  sensitivity: {
    baselineCandidateId: string;
    baselineRank: number | null;
    totalCandidates: number;
    stableCandidateCount: number;
    topCandidates: SensitivityCandidateResult[];
  };
  eventComparison: {
    range: DateRange;
    baselineScenario: "default";
    scenarios: EventScenarioResult[];
  };
  gateConfig: ResearchGateConfig;
  gateResults: ResearchGateResult;
  finalAssessment: FinalResearchAssessment;
}

export interface WalkForwardWindow {
  id: string;
  train: DateRange;
  validation: DateRange;
  test: DateRange;
}

export interface ParameterCandidate {
  id: string;
  config: StrategyConfig;
}

export interface CandidateEvaluation {
  candidate: ParameterCandidate;
  trainMetrics: RunMetrics;
  validationMetrics: RunMetrics;
  inSampleMetrics: RunMetrics;
  isEligible: boolean;
  score: string;
}

export interface WindowSelectionResult {
  window: WalkForwardWindow;
  testedCandidates: CandidateEvaluation[];
  selectedCandidate: ParameterCandidate | null;
  selectedTrainMetrics: RunMetrics | null;
  selectedValidationMetrics: RunMetrics | null;
  selectedInSampleMetrics: RunMetrics | null;
  selectedTestMetrics: RunMetrics | null;
  status: "selected" | "skipped";
  reason?: string;
}

export interface WalkForwardArtifact {
  generatedAtUtc: string;
  symbol: string;
  config?: StrategyConfigReference;
  runProvenance: RunProvenance;
  mode: "fixed" | "grid";
  sourceRange: DateRange;
  windowSpec: {
    trainDays: number;
    validationDays: number;
    testDays: number;
    stepDays: number;
  };
  windows: WindowSelectionResult[];
  rolledUpMetrics: RunMetrics;
}

export interface WalkForwardRunOptions {
  mode: "fixed" | "grid";
  startUtc?: string;
  endUtc?: string;
  trainDays: number;
  validationDays: number;
  testDays: number;
  stepDays: number;
}

export interface BatchStepResult {
  step: "sync-calendars" | "ingest" | "paper" | "research" | "artifacts";
  status: "completed" | "skipped" | "failed";
  startedAtUtc: string;
  completedAtUtc: string | null;
  message: string;
  artifactPaths?: string[];
}

export interface BatchRunArtifact {
  generatedAtUtc: string;
  completedAtUtc: string;
  status: "completed" | "failed";
  failedStep: BatchStepResult["step"] | null;
  strategyId: StrategyId;
  config: StrategyConfigReference;
  runProvenance: RunProvenance;
  ingestionSummary: BatchIngestionSummary | null;
  steps: BatchStepResult[];
}

export interface LatestArtifactPointers {
  batchJsonPath: string | null;
  paperJsonPath: string | null;
  researchJsonPath: string | null;
  dailyJsonPath: string | null;
  dailyMarkdownPath: string | null;
}

export interface DailyHealthCheckResult {
  code: DailyWarningCode;
  severity: "WARN" | "FAIL";
  passed: boolean;
  message: string;
}

export interface DailyRunSummary {
  generatedAtUtc: string;
  batchStatus: BatchRunArtifact["status"];
  failedStep: BatchRunArtifact["failedStep"];
  overallStatus: DailyHealthStatus;
  warningCodes: DailyWarningCode[];
  warningMessages: string[];
  healthChecks: DailyHealthCheckResult[];
  ingestionSummary: BatchIngestionSummary | null;
  paperNewTrades: number | null;
  researchRecommendation: ResearchReportArtifact["finalAssessment"]["recommendation"] | null;
  researchGatePass: boolean | null;
  artifactPaths: LatestArtifactPointers;
  operationsSummary: DailyOperationsSummary | null;
}

export interface DailyRunArtifact extends DailyRunSummary {
  config: StrategyConfigReference | null;
  runProvenance: RunProvenance | null;
  batchGeneratedAtUtc: string | null;
  paperGeneratedAtUtc: string | null;
  researchGeneratedAtUtc: string | null;
  historySnapshot?: DailyHistorySnapshot;
}
