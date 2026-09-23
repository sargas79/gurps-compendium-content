import { describe, expect, it } from "vitest";

import { camouflagePrice, patternFigures, patternShowing } from "./rules.js";

describe("camouflage patterns (High-Tech pp. 76-77)", () => {
  it("grades each pattern by terrain", () => {
    expect(patternFigures("simple", { tl: 6, infrared: false, custom: 0 }).terrain).toEqual({ matching: 1, nonMatching: 1, contrasting: 1 });
    expect(patternFigures("basic", { tl: 7, infrared: false, custom: 0 }).terrain).toEqual({ matching: 2, nonMatching: -1, contrasting: -2 });
    expect(patternFigures("advanced", { tl: 8, infrared: false, custom: 0 }).terrain).toEqual({ matching: 3, nonMatching: -2, contrasting: -2 });
    expect(patternFigures("ghillie", { tl: 6, infrared: false, custom: 0 }).terrain).toEqual({ matching: 3, nonMatching: -1, contrasting: -2 });
  });

  it("gives +1 against night vision and infravision from TL7, +2 against infravision with infrared suppression", () => {
    expect(patternFigures("simple", { tl: 6, infrared: false, custom: 0 }).observers).toEqual({ nightVision: 0, infravision: 0 });
    expect(patternFigures("simple", { tl: 7, infrared: false, custom: 0 }).observers).toEqual({ nightVision: 1, infravision: 1 });
    // No TL on the clothing: the pattern's own.
    expect(patternFigures("basic", { tl: null, infrared: false, custom: 0 }).observers).toEqual({ nightVision: 1, infravision: 1 });
    expect(patternFigures("simple", { tl: 8, infrared: true, custom: 0 }).observers).toEqual({ nightVision: 1, infravision: 2 });
    expect(patternFigures("ghillie", { tl: 6, infrared: true, custom: 0 }).observers).toEqual({ nightVision: 0, infravision: 2 });
  });

  it("adds a customised ghillie suit's margin in matching terrain, to +8", () => {
    expect(patternFigures("ghillie", { tl: 6, infrared: false, custom: 3 }).terrain).toEqual({ matching: 6, nonMatching: -1, contrasting: -2 });
    expect(patternFigures("ghillie", { tl: 6, infrared: false, custom: 9 }).terrain.matching).toBe(8);
    // Only a ghillie suit is customised.
    expect(patternFigures("advanced", { tl: 8, infrared: false, custom: 3 }).terrain.matching).toBe(3);
  });

  it("shows the second pattern while a reversible piece is turned", () => {
    expect(patternShowing({ pattern: "basic", second: "advanced", reversed: false })).toBe("basic");
    expect(patternShowing({ pattern: "basic", second: "advanced", reversed: true })).toBe("advanced");
    expect(patternShowing({ pattern: "basic", second: "", reversed: true })).toBe("basic");
    expect(patternShowing({ pattern: "", second: "", reversed: false })).toBeNull();
  });
});

describe("what camouflage costs (High-Tech p. 77)", () => {
  const base = { pattern: "", second: "", scent: false, infrared: false, builtIn: false };
  it("adds each pattern's share of the clothing's cost, both of a reversible piece's, and scent masking's", () => {
    expect(camouflagePrice({ ...base, pattern: "simple" })).toEqual({ factor: 1, add: 0 });
    expect(camouflagePrice({ ...base, pattern: "basic" })).toEqual({ factor: 2, add: 0 });
    expect(camouflagePrice({ ...base, pattern: "advanced" })).toEqual({ factor: 3, add: 0 });
    // Two advanced patterns add 400%.
    expect(camouflagePrice({ ...base, pattern: "advanced", second: "advanced" })).toEqual({ factor: 5, add: 0 });
    expect(camouflagePrice({ ...base, scent: true })).toEqual({ factor: 3, add: 0 });
  });

  it("leaves a record whose price holds them alone, and prices infrared suppression in a ghillie suit at $500", () => {
    expect(camouflagePrice({ ...base, pattern: "basic", second: "basic", builtIn: true })).toEqual({ factor: 1, add: 0 });
    expect(camouflagePrice({ ...base, pattern: "ghillie", infrared: true })).toEqual({ factor: 1, add: 500 });
    expect(camouflagePrice({ ...base, pattern: "simple", infrared: true })).toEqual({ factor: 1, add: 0 });
  });
});
