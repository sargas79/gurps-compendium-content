import { describe, expect, it } from "vitest";

import { attacksLeft, baseAttacks, grappleMoveKey, rapidStrikeLimit, rapidStrikePenalty, skippedAttacks, specialRefusal } from "./rules.js";

/** Multiple attacks (GURPS Martial Arts pp. 126-128). */
describe("how many attacks", () => {
  it("gives Extra Attack 2 on All-Out Attack (Double) four attacks, not six", () => {
    expect(baseAttacks({ attacks: true, extraAttacks: 2, allOutDouble: true })).toBe(4);
    expect(baseAttacks({ attacks: true, extraAttacks: 0, allOutDouble: false })).toBe(1);
    expect(baseAttacks({ attacks: false, extraAttacks: 2, allOutDouble: false })).toBe(0);
  });

  it("adds a Rapid Strike's extra attacks and takes off feints and skipped yards", () => {
    expect(attacksLeft({ base: 2, rapidStrikeExtra: 2, feints: 1, skipped: 1 })).toBe(2);
    expect(attacksLeft({ base: 1, rapidStrikeExtra: 0, feints: 2, skipped: 0 })).toBe(0);
  });
});

describe("Rapid Strike", () => {
  it("rolls a three-attack Rapid Strike at -12 each, or -6 with Trained by a Master", () => {
    expect(rapidStrikePenalty(3, false)).toBe(-12);
    expect(rapidStrikePenalty(3, true)).toBe(-6);
    expect(rapidStrikePenalty(2, false)).toBe(-6);
    expect(rapidStrikePenalty(4, true)).toBe(-9);
  });

  it("allows more than two attacks only under the cinematic rule", () => {
    expect(rapidStrikeLimit(false)).toBe(2);
    expect(rapidStrikeLimit(true)).toBeGreaterThan(2);
  });

  it("allows one special option a maneuver, and no Rapid Strike on Move and Attack", () => {
    expect(specialRefusal("rapidStrike", null, "attack")).toBeNull();
    expect(specialRefusal("rapidStrike", null, "moveAndAttack")).toBe("noRapidOnMove");
    expect(specialRefusal("dualWeapon", "rapidStrike", "attack")).toBe("oneSpecial");
    expect(specialRefusal("rapidStrike", "rapidStrike", "attack")).toBeNull();
  });
});

describe("targets and grappling", () => {
  it("uses up an attack for a yard between two foes, and none for foes side by side", () => {
    expect(skippedAttacks(1)).toBe(0);
    expect(skippedAttacks(2)).toBe(1);
    expect(skippedAttacks(4)).toBe(3);
  });

  it("keys a grappling move by the move and the foe", () => {
    expect(grappleMoveKey("takedown", "Actor.a")).not.toBe(grappleMoveKey("takedown", "Actor.b"));
  });
});
