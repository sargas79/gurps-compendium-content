import { describe, expect, it } from "vitest";

import { camouflageValue, observerOf, terrainModifier } from "./rules.js";

const BASIC = { matching: 2, nonMatching: -1, contrasting: -2 };

describe("camouflage by terrain (Ultra-Tech p. 99; High-Tech pp. 76-77)", () => {
  it("reads a pattern's modifier in each kind of terrain", () => {
    expect(terrainModifier(BASIC, "matching")).toBe(2);
    expect(terrainModifier(BASIC, "nonMatching")).toBe(-1);
    expect(terrainModifier(BASIC, "contrasting")).toBe(-2);
  });

  it("adds what a piece gives against technological night vision or infravision, never against the eye", () => {
    const bonuses = { nightVision: 1, infravision: 2 };
    expect(camouflageValue(BASIC, "matching", "vision", bonuses)).toBe(2);
    expect(camouflageValue(BASIC, "matching", "nightVision", bonuses)).toBe(3);
    expect(camouflageValue(BASIC, "contrasting", "infravision", bonuses)).toBe(0);
    expect(camouflageValue(BASIC, "nonMatching", "infravision")).toBe(-1);
  });

  it("makes an observer of whatever their gear gives, the worse for the hider where it gives both", () => {
    const worth = (o: string) => ({ vision: 2, nightVision: 3, infravision: 5 })[o] ?? 0;
    expect(observerOf({}, worth)).toBe("vision");
    expect(observerOf({ nightVision: true }, worth)).toBe("nightVision");
    expect(observerOf({ infravision: true }, worth)).toBe("infravision");
    expect(observerOf({ nightVision: true, infravision: true }, worth)).toBe("nightVision");
  });
});
