import { describe, expect, it } from "vitest";

import {
  NO_BEAM_OPTIONS,
  afterFiring,
  beamOptionFactor,
  diceIn,
  gravFocused,
  halveDamage,
  heatLimit,
  heatMalfunction,
  hotshotResistPenalty,
  ignoresEnvironment,
  isGatling,
  isOverheated,
  maxGravFocus,
} from "./options.js";

const options = (patch = {}) => ({ ...NO_BEAM_OPTIONS, ...patch });

describe("beam options (Ultra-Tech p. 133)", () => {
  it("lets a field-jacketed or FTL beam ignore the environment", () => {
    expect(ignoresEnvironment(options())).toBe(false);
    expect(ignoresEnvironment(options({ fieldJacket: "free" }))).toBe(true);
    expect(ignoresEnvironment(options({ ftl: true }))).toBe(true);
  });

  it("doubles the price for field-jacketing where the GM charges for it, and for each level of focus", () => {
    expect(beamOptionFactor(options({ fieldJacket: "free" }))).toBe(1);
    expect(beamOptionFactor(options({ fieldJacket: "doubled", gravFocus: 2 }))).toBe(8);
  });

  it("allows TL-9 levels of gravitic focus", () => {
    expect(maxGravFocus(12)).toBe(3);
    expect(maxGravFocus(9)).toBe(0);
    expect(maxGravFocus(null)).toBe(0);
  });

  it("halves damage the way the book halves a beam's dice", () => {
    expect(halveDamage("6d")).toBe("3d");
    expect(halveDamage("5d")).toBe("2d+2");
    expect(halveDamage("3d+2")).toBe("1d+3");
    expect(halveDamage("6d×10")).toBe("6d×5");
    expect(halveDamage("6d×5")).toBe("15d");
    expect(halveDamage("1d")).toBe("1d-2");
  });

  it("trades damage for ten times the range at each level of focus", () => {
    // 6d×10 → 6d×5 → 15d over two levels, at a hundred times the range.
    expect(gravFocused({ damage: "6d×10", halfDamageRange: 72000, maxRange: 220000 }, 2)).toEqual({ damage: "15d", halfDamageRange: 7200000, maxRange: 22000000 });
    expect(gravFocused({ damage: "6d×10", halfDamageRange: 1, maxRange: 1 }, 1).damage).toBe("6d×5");
  });
});

describe("heat (Ultra-Tech p. 133)", () => {
  it("overheats past ten times the RoF", () => {
    expect(heatLimit(10)).toBe(100);
    const hot = afterFiring({ shots: 95, lastShot: 0 }, 10, 100, 1);
    expect(hot.shots).toBe(105);
    expect(isOverheated(hot, 100, 2)).toBe(true);
  });

  it("builds no heat across a 10-second pause, and cools an overheated weapon in a minute", () => {
    expect(afterFiring({ shots: 80, lastShot: 0 }, 10, 100, 10).shots).toBe(10);
    // Overheated: a 10-second pause isn't enough.
    expect(afterFiring({ shots: 105, lastShot: 0 }, 10, 100, 30).shots).toBe(115);
    expect(isOverheated({ shots: 115, lastShot: 30 }, 100, 90)).toBe(false);
    expect(afterFiring({ shots: 115, lastShot: 30 }, 10, 100, 90).shots).toBe(10);
  });

  it("gives a malfunction number while hot, for a hotshot, and worse for both", () => {
    expect(heatMalfunction(false, false)).toBeNull();
    expect(heatMalfunction(true, false)).toBe(14);
    expect(heatMalfunction(false, true)).toBe(14);
    expect(heatMalfunction(true, true)).toBe(12);
  });

  it("leaves Gatlings out", () => {
    expect(isGatling("Gatling Laser")).toBe(true);
    expect(isGatling("Laser Rifle")).toBe(false);
  });

  it("adds a point per die to a hotshot, and deepens an affliction's penalty by 30%", () => {
    expect(diceIn("3d")).toBe(3);
    expect(diceIn("6dx5")).toBe(30);
    expect(hotshotResistPenalty(-4)).toBe(-1);
    expect(hotshotResistPenalty(-10)).toBe(-3);
    expect(hotshotResistPenalty(0)).toBe(0);
  });
});

describe("an FTL beam's speed/range penalty (#329)", () => {
  it("is half the usual, rounded toward none", async () => {
    const { ftlSpeedRange } = await import("./options.js");
    expect(ftlSpeedRange(-7)).toBe(-3);
    expect(ftlSpeedRange(-6)).toBe(-3);
    expect(ftlSpeedRange(0)).toBe(0);
  });
});
