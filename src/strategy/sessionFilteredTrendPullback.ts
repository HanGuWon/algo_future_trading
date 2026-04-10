import type { EventWindow, FeatureSnapshot, SignalCandidate, StrategyConfig } from "../types.js";
import { isTradableSessionWindow } from "../features/sessionState.js";

export class SessionFilteredTrendPullbackStrategy {
  constructor(private readonly config: StrategyConfig) {}

  generate(snapshot: FeatureSnapshot, blockedWindow: EventWindow | null): SignalCandidate | null {
    if (blockedWindow) {
      return null;
    }

    if (
      !isTradableSessionWindow(
        snapshot.sessionState,
        this.config.europeTradableMinutes,
        this.config.usTradableMinutes,
        60
      )
    ) {
      return null;
    }

    if (snapshot.directionBias === "BUY" && snapshot.confluenceScore >= this.config.confluenceThreshold) {
      return {
        side: "BUY",
        signalTs: snapshot.tsUtc,
        entryPx: snapshot.resistance !== null ? Math.max(snapshot.resistance, snapshot.support ?? Number.NEGATIVE_INFINITY) : 0,
        stopPx: Math.min(snapshot.support ?? Number.POSITIVE_INFINITY, snapshot.sessionState.sessionOpen ?? Number.POSITIVE_INFINITY),
        score: snapshot.confluenceScore,
        invalidationPx: snapshot.support ?? 0,
        targetPx: 0,
        reasons: snapshot.longReasons
      };
    }

    if (snapshot.directionBias === "SELL" && snapshot.confluenceScore >= this.config.confluenceThreshold) {
      return {
        side: "SELL",
        signalTs: snapshot.tsUtc,
        entryPx: snapshot.support !== null ? Math.min(snapshot.support, snapshot.resistance ?? Number.POSITIVE_INFINITY) : 0,
        stopPx: Math.max(snapshot.resistance ?? Number.NEGATIVE_INFINITY, snapshot.sessionState.sessionOpen ?? Number.NEGATIVE_INFINITY),
        score: snapshot.confluenceScore,
        invalidationPx: snapshot.resistance ?? 0,
        targetPx: 0,
        reasons: snapshot.shortReasons
      };
    }

    return null;
  }

  finalizeSignal(candidate: SignalCandidate, signalBarHigh: number, signalBarLow: number, tickSize: number): SignalCandidate {
    if (candidate.side === "BUY") {
      const entryPx = signalBarHigh;
      const stopAnchor = Math.min(signalBarLow, candidate.invalidationPx || signalBarLow);
      const stopPx = stopAnchor - tickSize;
      const risk = entryPx - stopPx;
      return {
        ...candidate,
        entryPx,
        stopPx,
        invalidationPx: signalBarLow,
        targetPx: entryPx + risk
      };
    }

    const entryPx = signalBarLow;
    const stopAnchor = Math.max(signalBarHigh, candidate.invalidationPx || signalBarHigh);
    const stopPx = stopAnchor + tickSize;
    const risk = stopPx - entryPx;
    return {
      ...candidate,
      entryPx,
      stopPx,
      invalidationPx: signalBarHigh,
      targetPx: entryPx - risk
    };
  }
}
