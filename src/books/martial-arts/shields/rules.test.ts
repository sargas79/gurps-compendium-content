import { describe, expect, it } from "vitest";

import { breakFreeModifiers, canCrossCheck, canKnockAway, canShoveWith, grabShieldPenalty, longestReach, shieldStrikePenalty } from "./rules.js";

/** Shoves and slams with weapons, striking at and grabbing shields (GURPS Martial Arts pp. 112-113). */
describe("shoves and slams with weapons", () => {
  it("shoves with a rigid weapon of reach 1+, not a whip or kusari", () => {
    expect(longestReach("1,2*")).toBe(2);
    expect(longestReach("C")).toBe(0);
    expect(canShoveWith("Broadsword", "1")).toBe(true);
    expect(canShoveWith("Knife", "C")).toBe(false);
    expect(canShoveWith("Kusari", "1-4*")).toBe(false);
  });

  it("cross-checks with a reach 2+ long weapon in two hands, or a two-handed sword in a Defensive Grip", () => {
    expect(canCrossCheck({ skill: "Spear", reach: "1,2*", twoHanded: true, defensiveGrip: false })).toBe(true);
    expect(canCrossCheck({ skill: "Spear", reach: "1*", twoHanded: false, defensiveGrip: false })).toBe(false);
    expect(canCrossCheck({ skill: "Two-Handed Sword", reach: "1,2", twoHanded: true, defensiveGrip: false })).toBe(false);
    expect(canCrossCheck({ skill: "Two-Handed Sword", reach: "1,2", twoHanded: true, defensiveGrip: true })).toBe(true);
  });
});

describe("shields", () => {
  it("strikes at a medium shield at -2 and a large one at -1, knocking away only cloaks and bucklers", () => {
    expect(shieldStrikePenalty(2)).toBe(-2);
    expect(shieldStrikePenalty(3)).toBe(-1);
    expect(grabShieldPenalty(1)).toBe(-3);
    expect(canKnockAway("Cloak")).toBe(true);
    expect(canKnockAway("Shield (Buckler)")).toBe(true);
    expect(canKnockAway("Shield (Shield)")).toBe(false);
  });

  it("gives a two-handed grab +5 and a strapped shield +4 to break free", () => {
    expect(breakFreeModifiers(true, true)).toEqual({ grabber: 5, victim: 4 });
    expect(breakFreeModifiers(false, false)).toEqual({ grabber: 0, victim: 0 });
  });
});
