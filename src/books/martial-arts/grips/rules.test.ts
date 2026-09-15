import { describe, expect, it } from "vitest";

import {
  buttStrikeModifier,
  canPummel,
  canReverse,
  defensiveGripParry,
  forearmParry,
  gripRowChange,
  isSwordSkill,
  longestReachText,
  pummelSkill,
  reversedReach,
  swingDamagePenalty,
} from "./rules.js";

/** Melee attack options (GURPS Martial Arts pp. 109-113). */
describe("Defensive Grip", () => {
  it("puts a broadsword at -2 to hit for +1 damage, and counts it as two-handed", () => {
    expect(gripRowChange("defensive", { twoHanded: false, swung: true, reach: "1", dice: 2, sword: true })).toEqual({
      skill: -2, damage: 1, reach: null, parry: 0, twoHanded: true, refused: null,
    });
  });

  it("swings a two-handed weapon at -2 damage, or -1 per die when that is worse", () => {
    expect(gripRowChange("defensive", { twoHanded: true, swung: true, reach: "1, 2*", dice: 2, sword: false }).damage).toBe(-2);
    expect(gripRowChange("defensive", { twoHanded: true, swung: true, reach: "1, 2*", dice: 3, sword: false }).damage).toBe(-3);
    expect(gripRowChange("defensive", { twoHanded: true, swung: false, reach: "1, 2*", dice: 3, sword: false }).damage).toBe(0);
  });

  it("parries at +1 from the front and -1 more from the side", () => {
    expect(defensiveGripParry("front")).toBe(1);
    expect(defensiveGripParry(null)).toBe(1);
    expect(defensiveGripParry("side")).toBe(-1);
  });

  it("half-swords a sword at reach C, with no swings", () => {
    expect(gripRowChange("halfSword", { twoHanded: false, swung: false, reach: "1", dice: 1, sword: true })).toMatchObject({ reach: "C", refused: null });
    expect(gripRowChange("halfSword", { twoHanded: false, swung: true, reach: "1", dice: 2, sword: true }).refused).toBe("noSwing");
    expect(isSwordSkill("Broadsword")).toBe(true);
    expect(isSwordSkill("Axe/Mace")).toBe(false);
  });
});

describe("Reversed Grip", () => {
  it("brings reach 1 to C and reach 2 to 1", () => {
    expect(reversedReach("1")).toBe("C");
    expect(reversedReach("1, 2*")).toBe("C, 1*");
    expect(reversedReach("C, 1")).toBe("C");
  });

  it("is for a thrusting weapon of reach C, 1 or 2", () => {
    expect(canReverse("C, 1", true)).toBe(true);
    expect(canReverse("1, 2*", true)).toBe(true);
    expect(canReverse("1", false)).toBe(false);
    expect(canReverse("2, 3*", true)).toBe(false);
  });

  it("gives thrusts +1, swings -2 or -1 per die, and parries -2", () => {
    expect(gripRowChange("reversed", { twoHanded: false, swung: false, reach: "C, 1", dice: 1, sword: false })).toMatchObject({ damage: 1, parry: -2, reach: "C" });
    expect(gripRowChange("reversed", { twoHanded: false, swung: true, reach: "C, 1", dice: 2, sword: false }).damage).toBe(-2);
  });

  it("strikes with the butt for thrust damage, or thrust-1 for a weapon that doesn't crush", () => {
    expect(buttStrikeModifier(true)).toBe(0);
    expect(buttStrikeModifier(false)).toBe(-1);
  });

  it("parries along the forearm at -1, or no penalty with a tonfa", () => {
    expect(forearmParry(12, false)).toBe(8);
    expect(forearmParry(12, true)).toBe(9);
  });
});

describe("Pummeling and Tip Slash", () => {
  it("pummels at the best of DX-1, Brawling-1 or Karate-1, or a better Hammer Fist", () => {
    expect(pummelSkill({ dx: 12, brawling: 14, karate: null, hammerFist: null, twoHandedPunch: null, fullSkill: null })).toEqual({ level: 13, skill: "Brawling" });
    expect(pummelSkill({ dx: 12, brawling: null, karate: null, hammerFist: 15, twoHandedPunch: null, fullSkill: null })).toEqual({ level: 15, skill: "Hammer Fist" });
    expect(pummelSkill({ dx: 12, brawling: null, karate: null, hammerFist: null, twoHandedPunch: null, fullSkill: 14 })).toEqual({ level: 14, skill: "" });
  });

  it("pummels only with a weapon that reaches C or 1", () => {
    expect(canPummel("C, 1")).toBe(true);
    expect(canPummel("1")).toBe(true);
    expect(canPummel("2, 3*")).toBe(false);
  });

  it("slashes with the tip at the weapon's longest reach: 2 for a rapier, C for a dagger", () => {
    expect(longestReachText("1, 2")).toBe("2");
    expect(longestReachText("C")).toBe("C");
  });

  it("works out a swing penalty from the dice", () => {
    expect(swingDamagePenalty(1)).toBe(-2);
    expect(swingDamagePenalty(4)).toBe(-4);
  });
});
