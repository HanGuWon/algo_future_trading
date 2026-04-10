import { describe, expect, it } from "vitest";
import { buildMnqContractWindows, resolveActiveMnqContract } from "../src/data/rolls.js";

describe("MNQ quarterly roll handling", () => {
  it("switches active contracts on the configured roll start", () => {
    const windows = buildMnqContractWindows(2026, 2026);
    const march = windows.find((window) => window.contract === "H26");
    const june = windows.find((window) => window.contract === "M26");
    expect(march).toBeDefined();
    expect(june).toBeDefined();
    expect(resolveActiveMnqContract("2026-03-13T20:59:00.000Z", windows).contract).toBe("H26");
    expect(resolveActiveMnqContract(march!.rollStartUtc, windows).contract).toBe("M26");
  });
});
