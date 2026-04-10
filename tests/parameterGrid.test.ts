import { describe, expect, it } from "vitest";
import { buildFixedCandidate, buildSmallParameterGrid } from "../src/research/parameterGrid.js";

describe("parameter grid", () => {
  it("filters invalid ma combinations from the small sweep", () => {
    const grid = buildSmallParameterGrid();
    expect(grid.length).toBeGreaterThan(0);
    expect(grid.every((candidate) => candidate.config.maFast < candidate.config.maSlow)).toBe(true);
  });

  it("builds a single fixed candidate", () => {
    const candidates = buildFixedCandidate();
    expect(candidates).toHaveLength(1);
  });
});
