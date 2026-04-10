import { DEFAULT_STRATEGY_CONFIG } from "../config/defaults.js";
import type { ParameterCandidate, StrategyConfig } from "../types.js";

const MA_FAST_VALUES = [10, 20, 30] as const;
const MA_SLOW_VALUES = [80, 120, 160] as const;
const CONFLUENCE_VALUES = [2, 3, 4] as const;
const EVENT_BLACKOUT_AFTER_VALUES = [60, 120] as const;

export function buildFixedCandidate(baseConfig: StrategyConfig = DEFAULT_STRATEGY_CONFIG): ParameterCandidate[] {
  return [
    {
      id: buildCandidateId(baseConfig),
      config: { ...baseConfig }
    }
  ];
}

export function buildSmallParameterGrid(baseConfig: StrategyConfig = DEFAULT_STRATEGY_CONFIG): ParameterCandidate[] {
  const candidates: ParameterCandidate[] = [];
  for (const maFast of MA_FAST_VALUES) {
    for (const maSlow of MA_SLOW_VALUES) {
      if (maFast >= maSlow) {
        continue;
      }
      for (const confluenceThreshold of CONFLUENCE_VALUES) {
        for (const eventBlackoutMinutesAfter of EVENT_BLACKOUT_AFTER_VALUES) {
          const config: StrategyConfig = {
            ...baseConfig,
            maFast,
            maSlow,
            confluenceThreshold,
            eventBlackoutMinutesAfter
          };
          candidates.push({
            id: buildCandidateId(config),
            config
          });
        }
      }
    }
  }
  return candidates;
}

export function buildCandidateId(config: Pick<StrategyConfig, "maFast" | "maSlow" | "confluenceThreshold" | "eventBlackoutMinutesAfter">): string {
  return `fast${config.maFast}_slow${config.maSlow}_score${config.confluenceThreshold}_post${config.eventBlackoutMinutesAfter}`;
}
