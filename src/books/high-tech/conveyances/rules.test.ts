/** High-Tech's personal conveyances as pure rules (pp. 226, 230-231). */

import { describe, expect, it } from "vitest";

import { bicycleWeightFactor, defaultRelativeLevel, downhillMultiplier, longRideTarget, ridingMove } from "./rules.js";

describe("a rider's Move (p. 230)", () => {
  const ride = (more: Partial<Parameters<typeof ridingMove>[0]>) => ridingMove({ move: 5, relative: null, enhancedMove: 0.5, roadBound: false, offRoad: false, slope: 0, ...more });

  it("works the book's example: DX 10, Move 5, Bicycling-15 is Move 7, and 14 down a gentle slope", () => {
    expect(ride({ relative: 5 })).toMatchObject({ base: 5, fromSkill: false, level: 7, move: 7 });
    expect(ride({ relative: 5, slope: 7.5 })).toMatchObject({ level: 7, downhill: 2, move: 14 });
  });

  it("starts from relative skill where it beats Move", () => {
    expect(ride({ relative: 8 })).toMatchObject({ base: 8, fromSkill: true, level: 12 });
    expect(ride({ relative: -4 })).toMatchObject({ base: 5, fromSkill: false });
  });

  it("doubles Move on the racing bike and loses Road-Bound Enhanced Move off the road", () => {
    expect(ride({ enhancedMove: 1 }).level).toBe(10);
    expect(ride({ roadBound: true, offRoad: true })).toMatchObject({ enhanced: 1, level: 5 });
    expect(ride({ roadBound: false, offRoad: true }).level).toBe(7);
  });

  it("multiplies downhill Move by 2, 3 or 4 by the slope", () => {
    expect([0, 5, 7.5, 10, 15, 29, 30, 45].map(downhillMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(ride({ slope: 30 }).move).toBe(28);
  });
});

describe("skill defaults (pp. 230-231; Characters pp. 180, 222)", () => {
  it("takes the best default, relative to DX", () => {
    expect(defaultRelativeLevel("Bicycling", 10, () => null)).toBe(-4);
    // Driving (Motorcycle)-16 at DX 10: Bicycling-12 is DX+2.
    expect(defaultRelativeLevel("Bicycling", 10, (name) => (name === "Driving (Motorcycle)" ? 16 : null))).toBe(2);
    expect(defaultRelativeLevel("Sports (Skateboard)", 12, (name) => (name === "Sports (Surfing)" ? 14 : null))).toBe(0);
    expect(defaultRelativeLevel("Sports (Skateboard)", 12, () => null)).toBe(-5);
    expect(defaultRelativeLevel("Unknown", 12, () => null)).toBeNull();
  });
});

describe("the rest", () => {
  it("lightens the safety bicycle at TL7 and TL8 (p. 230)", () => {
    const factors = { tl7: 0.8, tl8: 0.5 };
    expect([6, 7, 8, 9].map((tl) => bicycleWeightFactor(tl, factors))).toEqual([1, 0.8, 0.5, 0.5]);
    expect(bicycleWeightFactor(8, {})).toBe(1);
  });

  it("rolls a long ride against the better of HT and HT-based skill (Campaigns p. 354)", () => {
    expect(longRideTarget(11, 2)).toBe(13);
    expect(longRideTarget(11, -4)).toBe(11);
    expect(longRideTarget(11, null)).toBe(11);
  });
});
