import type { DateRange, EventWindow } from "../types.js";
import { addMinutesUtc } from "../utils/time.js";

export class StaticCalendarProvider {
  constructor(private readonly windows: EventWindow[]) {}

  getWindows(range: DateRange): EventWindow[] {
    return this.windows.filter(
      (window) => window.endUtc >= range.startUtc && window.startUtc <= range.endUtc
    );
  }
}

export function expandEventWindow(
  eventType: EventWindow["eventType"],
  scheduledUtc: string,
  minutesBefore: number,
  minutesAfter: number,
  source: string,
  notes?: string
): EventWindow {
  return {
    eventType,
    startUtc: addMinutesUtc(scheduledUtc, -minutesBefore),
    endUtc: addMinutesUtc(scheduledUtc, minutesAfter),
    severity: "HIGH",
    blocked: true,
    source,
    notes
  };
}

export function isBlockedByEvents(tsUtc: string, windows: EventWindow[]): EventWindow | null {
  return windows.find((window) => tsUtc >= window.startUtc && tsUtc <= window.endUtc) ?? null;
}
