import { describe, expect, it } from "vitest";
import { buildSessionKey, getSessionLabelChicago, getTradingDateChicago, minutesSinceSessionStart } from "../src/utils/time.js";

describe("Chicago session handling", () => {
  it("labels Europe session correctly across DST transitions", () => {
    expect(getSessionLabelChicago("2026-03-06T08:30:00.000Z")).toBe("EUROPE");
    expect(getSessionLabelChicago("2026-03-09T07:30:00.000Z")).toBe("EUROPE");
  });

  it("maps the evening reopen into the next trading date", () => {
    expect(getTradingDateChicago("2026-03-10T22:15:00.000Z")).toBe("2026-03-11");
    expect(buildSessionKey("2026-03-10T22:15:00.000Z")).toBe("2026-03-11_ASIA");
    expect(minutesSinceSessionStart("2026-03-10T22:15:00.000Z")).toBe(15);
  });
});
