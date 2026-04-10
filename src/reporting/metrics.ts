import type {
  BacktestResult,
  DailyPerformanceRow,
  RunMetrics,
  SessionLabel,
  SessionPerformanceRow,
  Side,
  TradeRecord
} from "../types.js";
import { getSessionLabelChicago, getTradingDateChicago } from "../utils/time.js";

function emptySessionBreakdown(): RunMetrics["sessionBreakdown"] {
  return {
    ASIA: { tradeCount: 0, netPnlUsd: 0 },
    EUROPE: { tradeCount: 0, netPnlUsd: 0 },
    US: { tradeCount: 0, netPnlUsd: 0 },
    CLOSED: { tradeCount: 0, netPnlUsd: 0 }
  };
}

function emptySideBreakdown(): RunMetrics["sideBreakdown"] {
  return {
    BUY: { tradeCount: 0, netPnlUsd: 0 },
    SELL: { tradeCount: 0, netPnlUsd: 0 }
  };
}

export function createEmptyMetrics(rejectedSignalCount = 0): RunMetrics {
  return {
    tradeCount: 0,
    winRate: 0,
    netPnlUsd: 0,
    expectancyUsd: 0,
    profitFactor: null,
    maxDrawdownUsd: 0,
    avgWinUsd: 0,
    avgLossUsd: 0,
    rejectedSignalCount,
    sessionBreakdown: emptySessionBreakdown(),
    sideBreakdown: emptySideBreakdown()
  };
}

export function computeRunMetrics(result: Pick<BacktestResult, "trades" | "rejectedSignals">): RunMetrics {
  const { trades, rejectedSignals } = result;
  if (trades.length === 0) {
    return createEmptyMetrics(rejectedSignals.length);
  }

  const wins = trades.filter((trade) => trade.pnlUsd > 0);
  const losses = trades.filter((trade) => trade.pnlUsd < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, trade) => sum + trade.pnlUsd, 0));
  const netPnlUsd = trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const expectancyUsd = netPnlUsd / trades.length;
  const avgWinUsd = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLossUsd = losses.length > 0 ? losses.reduce((sum, trade) => sum + trade.pnlUsd, 0) / losses.length : 0;
  const winRate = (wins.length / trades.length) * 100;
  const profitFactor = grossLossAbs === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : null) : grossProfit / grossLossAbs;

  let equityCurve = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  const orderedTrades = [...trades].sort((left, right) => left.exitTs.localeCompare(right.exitTs));
  for (const trade of orderedTrades) {
    equityCurve += trade.pnlUsd;
    peak = Math.max(peak, equityCurve);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equityCurve);
  }

  const sessionBreakdown = emptySessionBreakdown();
  const sideBreakdown = emptySideBreakdown();
  for (const trade of trades) {
    const sessionLabel = getSessionLabelChicago(trade.entryTs) as SessionLabel;
    sessionBreakdown[sessionLabel].tradeCount += 1;
    sessionBreakdown[sessionLabel].netPnlUsd += trade.pnlUsd;
    sideBreakdown[trade.side].tradeCount += 1;
    sideBreakdown[trade.side].netPnlUsd += trade.pnlUsd;
  }

  return {
    tradeCount: trades.length,
    winRate,
    netPnlUsd,
    expectancyUsd,
    profitFactor,
    maxDrawdownUsd,
    avgWinUsd,
    avgLossUsd,
    rejectedSignalCount: rejectedSignals.length,
    sessionBreakdown,
    sideBreakdown
  };
}

export function combineMetrics(parts: RunMetrics[]): RunMetrics {
  if (parts.length === 0) {
    return createEmptyMetrics();
  }

  const aggregateTrades = parts.reduce((sum, item) => sum + item.tradeCount, 0);
  if (aggregateTrades === 0) {
    return createEmptyMetrics(parts.reduce((sum, item) => sum + item.rejectedSignalCount, 0));
  }

  const netPnlUsd = parts.reduce((sum, item) => sum + item.netPnlUsd, 0);
  const grossProfit = parts.reduce((sum, item) => sum + Math.max(item.avgWinUsd, 0) * approximateWins(item), 0);
  const grossLossAbs = parts.reduce((sum, item) => sum + Math.abs(Math.min(item.avgLossUsd, 0) * approximateLosses(item)), 0);
  const sessionBreakdown = emptySessionBreakdown();
  const sideBreakdown = emptySideBreakdown();

  for (const part of parts) {
    for (const session of Object.keys(sessionBreakdown) as SessionLabel[]) {
      sessionBreakdown[session].tradeCount += part.sessionBreakdown[session].tradeCount;
      sessionBreakdown[session].netPnlUsd += part.sessionBreakdown[session].netPnlUsd;
    }
    for (const side of Object.keys(sideBreakdown) as Side[]) {
      sideBreakdown[side].tradeCount += part.sideBreakdown[side].tradeCount;
      sideBreakdown[side].netPnlUsd += part.sideBreakdown[side].netPnlUsd;
    }
  }

  return {
    tradeCount: aggregateTrades,
    winRate: (parts.reduce((sum, item) => sum + approximateWins(item), 0) / aggregateTrades) * 100,
    netPnlUsd,
    expectancyUsd: netPnlUsd / aggregateTrades,
    profitFactor: grossLossAbs === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : null) : grossProfit / grossLossAbs,
    maxDrawdownUsd: parts.reduce((max, item) => Math.max(max, item.maxDrawdownUsd), 0),
    avgWinUsd: grossProfit > 0 ? grossProfit / Math.max(parts.reduce((sum, item) => sum + approximateWins(item), 0), 1) : 0,
    avgLossUsd:
      grossLossAbs > 0
        ? -grossLossAbs / Math.max(parts.reduce((sum, item) => sum + approximateLosses(item), 0), 1)
        : 0,
    rejectedSignalCount: parts.reduce((sum, item) => sum + item.rejectedSignalCount, 0),
    sessionBreakdown,
    sideBreakdown
  };
}

function approximateWins(metrics: RunMetrics): number {
  return Math.round((metrics.winRate / 100) * metrics.tradeCount);
}

function approximateLosses(metrics: RunMetrics): number {
  return Math.max(metrics.tradeCount - approximateWins(metrics), 0);
}

export function summarizeMetrics(metrics: RunMetrics): string[] {
  return [
    `Trades: ${metrics.tradeCount}`,
    `Win rate: ${metrics.winRate.toFixed(2)}%`,
    `Net PnL: ${metrics.netPnlUsd.toFixed(2)} USD`,
    `Expectancy: ${metrics.expectancyUsd.toFixed(2)} USD`,
    `Profit factor: ${metrics.profitFactor === null ? "n/a" : metrics.profitFactor.toFixed(2)}`,
    `Max drawdown: ${metrics.maxDrawdownUsd.toFixed(2)} USD`,
    `Rejected signals: ${metrics.rejectedSignalCount}`
  ];
}

export function buildDailyPerformanceRows(trades: TradeRecord[]): DailyPerformanceRow[] {
  const rows = new Map<string, { tradeCount: number; wins: number; netPnlUsd: number }>();
  for (const trade of trades) {
    const tradingDate = getTradingDateChicago(trade.exitTs);
    const current = rows.get(tradingDate) ?? { tradeCount: 0, wins: 0, netPnlUsd: 0 };
    current.tradeCount += 1;
    current.wins += trade.pnlUsd > 0 ? 1 : 0;
    current.netPnlUsd += trade.pnlUsd;
    rows.set(tradingDate, current);
  }

  return [...rows.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([tradingDate, item]) => ({
      tradingDate,
      tradeCount: item.tradeCount,
      winRate: item.tradeCount > 0 ? (item.wins / item.tradeCount) * 100 : 0,
      netPnlUsd: item.netPnlUsd,
      avgPnlUsd: item.tradeCount > 0 ? item.netPnlUsd / item.tradeCount : 0
    }));
}

export function buildSessionPerformanceRows(trades: TradeRecord[]): SessionPerformanceRow[] {
  const rows = new Map<
    SessionLabel,
    { tradeCount: number; wins: number; netPnlUsd: number; grossWinUsd: number; grossLossUsd: number; lossCount: number; winCount: number }
  >();

  for (const sessionLabel of ["ASIA", "EUROPE", "US", "CLOSED"] as SessionLabel[]) {
    rows.set(sessionLabel, {
      tradeCount: 0,
      wins: 0,
      netPnlUsd: 0,
      grossWinUsd: 0,
      grossLossUsd: 0,
      lossCount: 0,
      winCount: 0
    });
  }

  for (const trade of trades) {
    const sessionLabel = getSessionLabelChicago(trade.entryTs) as SessionLabel;
    const current = rows.get(sessionLabel)!;
    current.tradeCount += 1;
    current.netPnlUsd += trade.pnlUsd;
    if (trade.pnlUsd > 0) {
      current.wins += 1;
      current.winCount += 1;
      current.grossWinUsd += trade.pnlUsd;
    } else if (trade.pnlUsd < 0) {
      current.lossCount += 1;
      current.grossLossUsd += trade.pnlUsd;
    }
  }

  return (["ASIA", "EUROPE", "US", "CLOSED"] as SessionLabel[]).map((sessionLabel) => {
    const item = rows.get(sessionLabel)!;
    return {
      sessionLabel,
      tradeCount: item.tradeCount,
      winRate: item.tradeCount > 0 ? (item.wins / item.tradeCount) * 100 : 0,
      netPnlUsd: item.netPnlUsd,
      avgPnlUsd: item.tradeCount > 0 ? item.netPnlUsd / item.tradeCount : 0,
      avgWinUsd: item.winCount > 0 ? item.grossWinUsd / item.winCount : 0,
      avgLossUsd: item.lossCount > 0 ? item.grossLossUsd / item.lossCount : 0
    };
  });
}

export function summarizePerformanceRows(dailyRows: DailyPerformanceRow[], sessionRows: SessionPerformanceRow[]): string[] {
  const latestDay = dailyRows[dailyRows.length - 1];
  const bestSession = [...sessionRows]
    .filter((row) => row.tradeCount > 0)
    .sort((left, right) => right.netPnlUsd - left.netPnlUsd)[0];

  const lines: string[] = [];
  if (latestDay) {
    lines.push(
      `Latest day: ${latestDay.tradingDate} | trades ${latestDay.tradeCount} | net ${latestDay.netPnlUsd.toFixed(2)} USD | win rate ${latestDay.winRate.toFixed(2)}%`
    );
  }
  if (bestSession) {
    lines.push(
      `Best session: ${bestSession.sessionLabel} | trades ${bestSession.tradeCount} | net ${bestSession.netPnlUsd.toFixed(2)} USD | avg ${bestSession.avgPnlUsd.toFixed(2)} USD`
    );
  }
  return lines;
}

export function mergeBacktestResults(parts: Pick<BacktestResult, "trades" | "rejectedSignals">[]): Pick<BacktestResult, "trades" | "rejectedSignals"> {
  return {
    trades: parts.flatMap((part) => part.trades).sort((left, right) => left.exitTs.localeCompare(right.exitTs)),
    rejectedSignals: parts.flatMap((part) => part.rejectedSignals).sort((left, right) => left.tsUtc.localeCompare(right.tsUtc))
  };
}
