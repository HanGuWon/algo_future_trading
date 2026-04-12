import type {
  EventScenarioResult,
  FinalResearchAssessment,
  ResearchGateConfig,
  ResearchGateResult,
  RunMetrics,
  SensitivityCandidateResult
} from "../types.js";

interface EvaluateResearchGatesInput {
  gateConfig: ResearchGateConfig;
  baselineTestMetrics: RunMetrics;
  walkforwardMetrics: RunMetrics;
  selectedWalkforwardWindows: number;
  topCandidates: SensitivityCandidateResult[];
}

function buildThresholdResult(actual: number, threshold: number, mode: "min" | "max") {
  const passed = mode === "min" ? actual >= threshold : actual <= threshold;
  return {
    passed,
    actual,
    threshold
  };
}

export function evaluateResearchGates(input: EvaluateResearchGatesInput): {
  gateResults: ResearchGateResult;
  gatePass: boolean;
  gateFailureReasons: string[];
} {
  const { gateConfig, baselineTestMetrics, walkforwardMetrics, selectedWalkforwardWindows, topCandidates } = input;
  const passingSensitivityCandidates = topCandidates.filter(
    (candidate) =>
      candidate.validationMetrics.tradeCount >= gateConfig.minTrades &&
      candidate.testMetrics.tradeCount >= gateConfig.minTrades
  ).length;

  const gateResults: ResearchGateResult = {
    baselineTestTrades: buildThresholdResult(baselineTestMetrics.tradeCount, gateConfig.minTrades, "min"),
    walkforwardTrades: buildThresholdResult(walkforwardMetrics.tradeCount, gateConfig.minTrades, "min"),
    selectedWalkforwardWindows: buildThresholdResult(
      selectedWalkforwardWindows,
      gateConfig.minSelectedWalkforwardWindows,
      "min"
    ),
    baselineTestExpectancy: buildThresholdResult(
      baselineTestMetrics.expectancyUsd,
      gateConfig.minExpectancyUsd,
      "min"
    ),
    walkforwardExpectancy: buildThresholdResult(
      walkforwardMetrics.expectancyUsd,
      gateConfig.minExpectancyUsd,
      "min"
    ),
    baselineTestMaxDrawdown: buildThresholdResult(
      baselineTestMetrics.maxDrawdownUsd,
      gateConfig.maxDrawdownUsd,
      "max"
    ),
    walkforwardMaxDrawdown: buildThresholdResult(
      walkforwardMetrics.maxDrawdownUsd,
      gateConfig.maxDrawdownUsd,
      "max"
    ),
    sensitivityTopCandidatesTrades: {
      passed: topCandidates.length > 0 && passingSensitivityCandidates === topCandidates.length,
      threshold: gateConfig.minTrades,
      passingCandidates: passingSensitivityCandidates,
      totalCandidates: topCandidates.length
    }
  };

  const gateFailureReasons: string[] = [];
  if (!gateResults.baselineTestTrades.passed) {
    gateFailureReasons.push(
      `baseline_test_trades_below_min:${gateResults.baselineTestTrades.actual}<${gateResults.baselineTestTrades.threshold}`
    );
  }
  if (!gateResults.walkforwardTrades.passed) {
    gateFailureReasons.push(
      `walkforward_trades_below_min:${gateResults.walkforwardTrades.actual}<${gateResults.walkforwardTrades.threshold}`
    );
  }
  if (!gateResults.selectedWalkforwardWindows.passed) {
    gateFailureReasons.push(
      `selected_walkforward_windows_below_min:${gateResults.selectedWalkforwardWindows.actual}<${gateResults.selectedWalkforwardWindows.threshold}`
    );
  }
  if (!gateResults.baselineTestExpectancy.passed) {
    gateFailureReasons.push(
      `baseline_test_expectancy_below_min:${gateResults.baselineTestExpectancy.actual}<${gateResults.baselineTestExpectancy.threshold}`
    );
  }
  if (!gateResults.walkforwardExpectancy.passed) {
    gateFailureReasons.push(
      `walkforward_expectancy_below_min:${gateResults.walkforwardExpectancy.actual}<${gateResults.walkforwardExpectancy.threshold}`
    );
  }
  if (!gateResults.baselineTestMaxDrawdown.passed) {
    gateFailureReasons.push(
      `baseline_test_drawdown_above_max:${gateResults.baselineTestMaxDrawdown.actual}>${gateResults.baselineTestMaxDrawdown.threshold}`
    );
  }
  if (!gateResults.walkforwardMaxDrawdown.passed) {
    gateFailureReasons.push(
      `walkforward_drawdown_above_max:${gateResults.walkforwardMaxDrawdown.actual}>${gateResults.walkforwardMaxDrawdown.threshold}`
    );
  }
  if (!gateResults.sensitivityTopCandidatesTrades.passed) {
    gateFailureReasons.push(
      `sensitivity_top_candidates_trades_below_min:${gateResults.sensitivityTopCandidatesTrades.passingCandidates}/${gateResults.sensitivityTopCandidatesTrades.totalCandidates}`
    );
  }

  return {
    gateResults,
    gatePass: gateFailureReasons.length === 0,
    gateFailureReasons
  };
}

function hasPositiveExpectancy(metrics: RunMetrics): boolean {
  return metrics.tradeCount > 0 && metrics.expectancyUsd > 0;
}

export function assessFinalRecommendation(
  baselineTestMetrics: RunMetrics,
  walkforwardMetrics: RunMetrics,
  topCandidates: SensitivityCandidateResult[],
  eventComparison: EventScenarioResult[],
  gatePass: boolean,
  gateFailureReasons: string[]
): FinalResearchAssessment {
  const baselinePositive = hasPositiveExpectancy(baselineTestMetrics);
  const walkforwardPositive = hasPositiveExpectancy(walkforwardMetrics);
  const positiveTopCandidates = topCandidates.filter((candidate) => candidate.testMetrics.expectancyUsd > 0).length;
  const parameterStabilityPass = topCandidates.length >= 3 && positiveTopCandidates > topCandidates.length / 2;

  const defaultScenario = eventComparison.find((scenario) => scenario.scenario === "default");
  const maxExpectancyDiff = Math.max(
    0,
    ...eventComparison
      .filter((scenario) => scenario.scenario !== "default")
      .map((scenario) => Math.abs(scenario.metrics.expectancyUsd - (defaultScenario?.metrics.expectancyUsd ?? 0)))
  );

  const eventFilterDependence =
    maxExpectancyDiff > 15 ? "high" : maxExpectancyDiff > 5 ? "moderate" : "low";

  const baselineHardFail =
    baselineTestMetrics.expectancyUsd <= 0 || gateFailureReasons.some((reason) => reason.startsWith("baseline_test_drawdown_above_max"));
  const walkforwardHardFail =
    walkforwardMetrics.expectancyUsd <= 0 || gateFailureReasons.some((reason) => reason.startsWith("walkforward_drawdown_above_max"));

  let recommendation: FinalResearchAssessment["recommendation"] = "research_more";
  if (baselineHardFail && walkforwardHardFail) {
    recommendation = "reject_current_rule_set";
  } else if (gatePass && parameterStabilityPass) {
    recommendation = "continue_paper";
  }

  return {
    baseline_test_positive_expectancy: baselinePositive,
    walkforward_oos_positive_expectancy: walkforwardPositive,
    parameter_stability_pass: parameterStabilityPass,
    event_filter_dependence: eventFilterDependence,
    gatePass,
    gateFailureReasons,
    recommendation
  };
}
