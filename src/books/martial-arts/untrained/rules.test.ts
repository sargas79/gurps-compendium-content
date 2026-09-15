import { describe, expect, it } from "vitest";

import {
  artOrSportOf,
  bruisedKnuckles,
  coinToss,
  footworkParry,
  isUntrained,
  limbInTheWay,
  limbSpared,
  lowLineParry,
  mayUseAdvancedOptions,
  offHandPenalty,
} from "./rules.js";

/** Untrained fighters and Harsh Realism for Unarmed Fighters (GURPS Martial Arts pp. 113, 124). */
describe("untrained fighters", () => {
  it("counts someone untrained with no combat skills and no Combat Reflexes", () => {
    expect(isUntrained([{ name: "Cooking", relativeLevel: 0 }], false)).toBe(true);
    expect(isUntrained([{ name: "Cooking", relativeLevel: 0 }], true)).toBe(false);
    expect(isUntrained([{ name: "Guns/TL8 (Pistol)", relativeLevel: 0 }], false)).toBe(false);
  });

  it("opens the advanced options at DX level in a melee skill, or DX+3 in an Art or Sport skill", () => {
    expect(mayUseAdvancedOptions([{ name: "Broadsword", relativeLevel: -1 }])).toBe(false);
    expect(mayUseAdvancedOptions([{ name: "Broadsword", relativeLevel: 0 }])).toBe(true);
    expect(mayUseAdvancedOptions([{ name: "Karate Art", relativeLevel: 2 }])).toBe(false);
    expect(mayUseAdvancedOptions([{ name: "Karate Art", relativeLevel: 3 }])).toBe(true);
    expect(artOrSportOf("Fencing Sport")).toBeNull();
    expect(artOrSportOf("Judo Sport")).toBe("judo");
  });

  it("tosses the coin: 1-3 attacks all-out, 4-6 defends", () => {
    expect([coinToss(1), coinToss(3), coinToss(4), coinToss(6)]).toEqual(["attack", "attack", "defend", "defend"]);
  });
});

describe("harsh realism", () => {
  it("puts the limb in the way on a failure by 3 or less, sparing Judo and Karate against rigid crushing weapons in close combat", () => {
    expect([limbInTheWay(2), limbInTheWay(3), limbInTheWay(4)]).toEqual([true, true, false]);
    expect(limbSpared({ parrySkill: "Karate", closeCombat: true, damageType: "cr", flexible: false })).toBe(true);
    expect(limbSpared({ parrySkill: "Karate", closeCombat: false, damageType: "cr", flexible: false })).toBe(false);
    expect(limbSpared({ parrySkill: "Karate", closeCombat: true, damageType: "cut", flexible: false })).toBe(false);
  });

  it("parries a leg or foot by hand at -2 when standing", () => {
    expect(lowLineParry({ posture: "standing", hitLocation: "leg", handOrReachC: true })).toBe(-2);
    expect(lowLineParry({ posture: "kneeling", hitLocation: "leg", handOrReachC: true })).toBe(0);
    expect(lowLineParry({ posture: "standing", hitLocation: "torso", handOrReachC: true })).toBe(0);
  });

  it("keeps footwork to Boxing, Judo and Karate, and costs the off hand -4 and -2 ST", () => {
    expect([footworkParry("Judo"), footworkParry("Brawling")]).toEqual([true, false]);
    expect(offHandPenalty(false)).toEqual({ skill: -4, st: -2 });
    expect(offHandPenalty(true)).toEqual({ skill: 0, st: 0 });
  });

  it("takes a hurt part's shock, at most -4, unless High Pain Threshold", () => {
    expect([bruisedKnuckles(2, false), bruisedKnuckles(6, false), bruisedKnuckles(3, true)]).toEqual([-2, -4, 0]);
  });
});
