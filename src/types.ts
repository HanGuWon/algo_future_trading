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
