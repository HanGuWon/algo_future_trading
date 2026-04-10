import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { DEFAULT_STRATEGY_CONFIG, DEFAULT_STRATEGY_CONFIG_PATH } from "./defaults.js";
import type { StrategyConfig } from "../types.js";

const NON_NEGATIVE_INTEGER_KEYS: Array<keyof StrategyConfig> = [
  "maFast",
  "maSlow",
  "bollingerPeriod",
  "confluenceThreshold",
  "maxConsecutiveLosses",
  "cooldownMinutes",
  "defaultSlippageTicks",
  "usOpenSlippageTicks",
  "europeTradableMinutes",
  "usTradableMinutes",
  "eventBlackoutMinutesBefore",
  "eventBlackoutMinutesAfter"
];

const POSITIVE_NUMBER_KEYS: Array<keyof StrategyConfig> = [
  "bollingerStdDev",
  "riskPctPerTrade",
  "maxDailyLossPct"
];

const NON_NEGATIVE_NUMBER_KEYS: Array<keyof StrategyConfig> = ["commissionPerContractUsd"];

type StrategyConfigOverride = Partial<StrategyConfig>;

function validateFiniteNumber(
  config: StrategyConfig,
  key: keyof StrategyConfig,
  sourcePath: string,
  options: { integer?: boolean; min?: number; exclusiveMin?: number } = {}
): void {
  const value = config[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid strategy config at ${sourcePath}: ${String(key)} must be a finite number.`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`Invalid strategy config at ${sourcePath}: ${String(key)} must be an integer.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`Invalid strategy config at ${sourcePath}: ${String(key)} must be >= ${options.min}.`);
  }
  if (options.exclusiveMin !== undefined && value <= options.exclusiveMin) {
    throw new Error(`Invalid strategy config at ${sourcePath}: ${String(key)} must be > ${options.exclusiveMin}.`);
  }
}

export function resolveStrategyConfigPath(
  configPath = DEFAULT_STRATEGY_CONFIG_PATH,
  cwd = process.cwd()
): string {
  return isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
}

export function validateStrategyConfig(config: StrategyConfig, sourcePath: string): StrategyConfig {
  if (config.strategyId !== DEFAULT_STRATEGY_CONFIG.strategyId) {
    throw new Error(
      `Invalid strategy config at ${sourcePath}: strategyId must be ${DEFAULT_STRATEGY_CONFIG.strategyId}.`
    );
  }
  if (config.signalTimeframe !== "1h") {
    throw new Error(`Invalid strategy config at ${sourcePath}: signalTimeframe must be 1h.`);
  }
  if (config.executionTimeframe !== "5m") {
    throw new Error(`Invalid strategy config at ${sourcePath}: executionTimeframe must be 5m.`);
  }
  if (config.trailingTimeframe !== "15m") {
    throw new Error(`Invalid strategy config at ${sourcePath}: trailingTimeframe must be 15m.`);
  }

  for (const key of NON_NEGATIVE_INTEGER_KEYS) {
    validateFiniteNumber(config, key, sourcePath, { integer: true, min: 0 });
  }
  for (const key of POSITIVE_NUMBER_KEYS) {
    validateFiniteNumber(config, key, sourcePath, { exclusiveMin: 0 });
  }
  for (const key of NON_NEGATIVE_NUMBER_KEYS) {
    validateFiniteNumber(config, key, sourcePath, { min: 0 });
  }

  if (config.maFast >= config.maSlow) {
    throw new Error(`Invalid strategy config at ${sourcePath}: maFast must be < maSlow.`);
  }
  if (config.maxDailyLossPct >= 1) {
    throw new Error(`Invalid strategy config at ${sourcePath}: maxDailyLossPct must be < 1.`);
  }
  if (config.riskPctPerTrade >= config.maxDailyLossPct) {
    throw new Error(
      `Invalid strategy config at ${sourcePath}: riskPctPerTrade must be < maxDailyLossPct.`
    );
  }
  if (config.maxConsecutiveLosses < 1) {
    throw new Error(`Invalid strategy config at ${sourcePath}: maxConsecutiveLosses must be >= 1.`);
  }
  if (config.confluenceThreshold < 1) {
    throw new Error(`Invalid strategy config at ${sourcePath}: confluenceThreshold must be >= 1.`);
  }

  return config;
}

export async function loadStrategyConfig(
  configPath = DEFAULT_STRATEGY_CONFIG_PATH
): Promise<{ config: StrategyConfig; resolvedPath: string }> {
  const resolvedPath = resolveStrategyConfigPath(configPath);
  const raw = await readFile(resolvedPath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse strategy config ${resolvedPath}: ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid strategy config at ${resolvedPath}: expected a JSON object.`);
  }

  const mergedConfig: StrategyConfig = {
    ...DEFAULT_STRATEGY_CONFIG,
    ...(parsed as StrategyConfigOverride)
  };

  return {
    config: validateStrategyConfig(mergedConfig, resolvedPath),
    resolvedPath
  };
}

export function describeStrategyConfig(config: StrategyConfig): string {
  return `fast=${config.maFast} slow=${config.maSlow} score=${config.confluenceThreshold} postEvent=${config.eventBlackoutMinutesAfter}`;
}
