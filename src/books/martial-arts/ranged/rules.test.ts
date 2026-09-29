import { describe, expect, it } from "vitest";

import {
  handfulCount,
  handfulProfile,
  heroicArcherAim,
  isSharp,
  quickDrawPenalty,
  quickShootDraw,
  quickShootManeuver,
  quickShootPenalty,
  readyInHand,
  scaledRange,
  throwingHandPenalty,
} from "./rules.js";
import { rapidStrikePenalty } from "../multiple-attacks/rules.js";

/** Ranged attack options (GURPS Martial Arts pp. 97, 119-121). */
describe("quick-shooting bows", () => {
  const shooter = { weaponMaster: false, determined: false, realisticUnderFire: false };

  it("is -6, -3 with Weapon Master, +1 on All-Out Attack (Determined)", () => {
    expect(quickShootPenalty(shooter)).toBe(-6);
    expect(quickShootPenalty({ ...shooter, weaponMaster: true })).toBe(-3);
    expect(quickShootPenalty({ ...shooter, determined: true })).toBe(-5);
    expect(quickShootPenalty({ ...shooter, realisticUnderFire: true })).toBe(-10);
    expect(quickDrawPenalty(true)).toBe(-4);
  });

  it("works with bows, blowpipes and slings of RoF 1 and Shots 1(2), each with its Fast-Draw", () => {
    expect(quickShootDraw({ skill: "Bow", shots: "1(2)", rateOfFire: 1 })).toBe("Fast-Draw (Arrow)");
    expect(quickShootDraw({ skill: "Sling", shots: "1(2)", rateOfFire: 1 })).toBe("Fast-Draw (Stone)");
    expect(quickShootDraw({ skill: "Crossbow", shots: "1(4)", rateOfFire: 1 })).toBeNull();
    expect(quickShootDraw({ skill: "Bow", shots: "1(4)", rateOfFire: 1 })).toBeNull();
  });

  it("needs Attack or All-Out Attack (Determined)", () => {
    expect(quickShootManeuver("attack", "")).toBe(true);
    expect(quickShootManeuver("allOutAttack", "determined")).toBe(true);
    expect(quickShootManeuver("allOutAttack", "double")).toBe(false);
    expect(quickShootManeuver("moveAndAttack", "")).toBe(false);
  });
});

describe("thrown weapons", () => {
  it("throws a Rapid Strike from both hands at -22 and -14 (the four-and-two shuriken example)", () => {
    expect(rapidStrikePenalty(4, false) + throwingHandPenalty("master")).toBe(-22);
    expect(rapidStrikePenalty(2, false) + throwingHandPenalty("off")).toBe(-14);
    expect(readyInHand(0.1)).toBe(4);
    expect(readyInHand(1)).toBe(1);
  });

  it("makes the comic-book ninja's handful 17 shuriken at 1d-3 and range 2/4 (p. 120)", () => {
    expect(handfulCount({ basicLift: 34, weight: 0.1, sharp: true, cinematic: true, quantity: 20 })).toBe(17);
    expect(handfulCount({ basicLift: 34, weight: 0.1, sharp: true, cinematic: false, quantity: 20 })).toBe(6);
    expect(handfulCount({ basicLift: 34, weight: 0.1, sharp: true, cinematic: true, quantity: 12 })).toBe(12);
    expect(isSharp("cut")).toBe(true);
    expect(isSharp("cr")).toBe(false);
    const profile = handfulProfile(17);
    expect(profile).toMatchObject({ perDie: -2, accuracy: 0, recoil: 2, bulk: -2 });
    expect([scaledRange(6, profile.rangeFactor), scaledRange(13, profile.rangeFactor)]).toEqual([2, 4]);
    expect(handfulProfile(4).perDie).toBe(-1);
  });
});

describe("aim", () => {
  it("gives a Heroic Archer +1 for a second of Aim and +2 for more", () => {
    expect([heroicArcherAim(0), heroicArcherAim(1), heroicArcherAim(3)]).toEqual([0, 1, 2]);
  });
});
