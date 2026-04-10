import { describe, expect, it } from "vitest";
import { expandEventWindow, isBlockedByEvents } from "../src/calendars/eventWindows.js";

describe("official event blackout windows", () => {
  it("blocks timestamps inside the configured window", () => {
    const window = expandEventWindow("EMPLOYMENT", "2026-04-03T13:30:00.000Z", 30, 60, "bls");
    expect(isBlockedByEvents("2026-04-03T13:15:00.000Z", [window])?.eventType).toBe("EMPLOYMENT");
    expect(isBlockedByEvents("2026-04-03T14:31:00.000Z", [window])).toBeNull();
  });
});
