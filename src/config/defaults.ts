import type { InstrumentSpec, StrategyConfig } from "../types.js";

export const MNQ_SPEC: InstrumentSpec = {
  symbol: "MNQ",
  venue: "CME",
  tickSize: 0.25,
  tickValue: 0.5,
  contractMultiplier: 2,
  currency: "USD",
  tradingTimezone: "America/Chicago"
};

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  strategyId: "SessionFilteredTrendPullback_v1",
  signalTimeframe: "1h",
  executionTimeframe: "5m",
  trailingTimeframe: "15m",
  maFast: 20,
  maSlow: 120,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  confluenceThreshold: 3,
  riskPctPerTrade: 0.0025,
  maxDailyLossPct: 0.01,
  maxConsecutiveLosses: 3,
  cooldownMinutes: 30,
  commissionPerContractUsd: 1.14,
  defaultSlippageTicks: 1,
  usOpenSlippageTicks: 2,
  europeTradableMinutes: 90,
  usTradableMinutes: 120,
  eventBlackoutMinutesBefore: 30,
  eventBlackoutMinutesAfter: 60
};

export const DEFAULT_ACCOUNT_EQUITY_USD = 25_000;
export const DEFAULT_DB_PATH = "data/mnq-research.sqlite";
export const CALENDAR_SEED_PATH = "data/calendars/official-events.json";
export const DEFAULT_ARTIFACTS_DIR = "artifacts";
export const ACCEPTANCE_SPLIT = {
  trainStart: "2018-01-01T00:00:00.000Z",
  trainEnd: "2021-12-31T23:59:59.999Z",
  validationStart: "2022-01-01T00:00:00.000Z",
  validationEnd: "2022-12-31T23:59:59.999Z",
  testStart: "2023-01-01T00:00:00.000Z",
  testEnd: "2025-12-31T23:59:59.999Z",
  paperStart: "2026-04-10T00:00:00.000Z"
} as const;
export const DEFAULT_WALKFORWARD_DAYS = {
  trainDays: 730,
  validationDays: 180,
  testDays: 180,
  stepDays: 180
} as const;
