import type { Bar, SessionLabel, SessionState } from "../types.js";
import { buildSessionKey, getSessionLabelChicago, getTradingDateChicago, minutesSinceSessionStart } from "../utils/time.js";

interface SessionSummary {
  sessionKey: string;
  tradingDate: string;
  sessionName: SessionLabel;
  open: number;
  high: number;
  low: number;
  close: number;
}

function sessionOrder(session: SessionLabel): number {
  switch (session) {
    case "ASIA":
      return 0;
    case "EUROPE":
      return 1;
    case "US":
      return 2;
    default:
      return 3;
  }
}

function compareSessionKeys(left: SessionSummary, right: SessionSummary): number {
  if (left.tradingDate !== right.tradingDate) {
    return left.tradingDate.localeCompare(right.tradingDate);
  }
  return sessionOrder(left.sessionName) - sessionOrder(right.sessionName);
}

export function buildSessionSummaries(bars: Bar[], uptoIndex: number): SessionSummary[] {
  const sessions = new Map<string, SessionSummary>();
  for (let index = 0; index <= uptoIndex; index += 1) {
    const bar = bars[index];
    const sessionName = getSessionLabelChicago(bar.tsUtc);
    if (sessionName === "CLOSED") {
      continue;
    }
    const sessionKey = buildSessionKey(bar.tsUtc);
    const tradingDate = getTradingDateChicago(bar.tsUtc);
    const existing = sessions.get(sessionKey);
    if (!existing) {
      sessions.set(sessionKey, {
        sessionKey,
        tradingDate,
        sessionName,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
  }
  return [...sessions.values()].sort(compareSessionKeys);
}

export function getSessionStateAt(bars: Bar[], index: number): SessionState {
  const bar = bars[index];
  const sessionName = getSessionLabelChicago(bar.tsUtc);
  const sessionKey = buildSessionKey(bar.tsUtc);
  const tradingDate = getTradingDateChicago(bar.tsUtc);
  const summaries = buildSessionSummaries(bars, index);
  const current = summaries.find((summary) => summary.sessionKey === sessionKey);
  const currentPosition = summaries.findIndex((summary) => summary.sessionKey === sessionKey);
  const previous = currentPosition > 0 ? summaries[currentPosition - 1] : undefined;

  let breakState: SessionState["breakState"] = "UNKNOWN";
  if (previous) {
    if (bar.close > previous.high) {
      breakState = "ABOVE_PREV_HIGH";
    } else if (bar.close < previous.low) {
      breakState = "BELOW_PREV_LOW";
    } else {
      breakState = "INSIDE";
    }
  }

  return {
    sessionName,
    sessionOpen: current?.open ?? null,
    prevSessionHigh: previous?.high ?? null,
    prevSessionLow: previous?.low ?? null,
    breakState,
    tradingDate,
    sessionKey,
    minutesSinceSessionStart: minutesSinceSessionStart(bar.tsUtc)
  };
}

export function isTradableSessionWindow(
  sessionState: SessionState,
  europeMinutes: number,
  usMinutes: number,
  signalDurationMinutes = 60
): boolean {
  if (sessionState.sessionName === "EUROPE") {
    return (sessionState.minutesSinceSessionStart ?? Number.POSITIVE_INFINITY) + signalDurationMinutes <= europeMinutes;
  }
  if (sessionState.sessionName === "US") {
    return (sessionState.minutesSinceSessionStart ?? Number.POSITIVE_INFINITY) + signalDurationMinutes <= usMinutes;
  }
  return false;
}
