import { describe, expect, it } from "vitest";

import {
  aimedWhereTaAims,
  closeQuartersLine,
  gunSkillOf,
  gunTargetPenalty,
  gunTargetedAttackLevel,
  halvedDefault,
  instantArsenalResult,
  isPistolSkill,
  mountedShootingFits,
  nextPrecisionSecond,
  pistoleroBulk,
  pistoleroMinSt,
  precisionCap,
  precisionOutcome,
  precisionRollsDue,
  rangedRapidStrikeRefusal,
  readGunTargetedAttack,
  withinCloseQuarters,
} from "./rules.js";

/** High-Tech's shooting options and gun techniques (pp. 84-85, 249-252). */
describe("the two-handed pistol stance (p. 84)", () => {
  it("multiplies minimum ST by 0.8, rounding up", () => {
    expect(pistoleroMinSt(10)).toBe(8);
    expect(pistoleroMinSt(11)).toBe(9);
    expect(pistoleroMinSt(9)).toBe(8);
    expect(pistoleroMinSt(null)).toBeNull();
  });

  it("makes Bulk a step better", () => {
    expect(pistoleroBulk(-2)).toBe(-1);
    expect(pistoleroBulk(-1)).toBe(0);
    expect(pistoleroBulk(0)).toBe(0);
    expect(isPistolSkill("Guns (Pistol)")).toBe(true);
    expect(isPistolSkill("Guns (Rifle)")).toBe(false);
  });
});

describe("Precision Aiming (p. 84)", () => {
  it("claims a +1 at 6, 12, 24, 45 and 90 seconds", () => {
    expect(precisionRollsDue(5)).toBe(0);
    expect(precisionRollsDue(6)).toBe(1);
    expect(precisionRollsDue(44)).toBe(3);
    expect(precisionRollsDue(90)).toBe(5);
    expect(nextPrecisionSecond(0)).toBe(6);
    expect(nextPrecisionSecond(4)).toBe(90);
    expect(nextPrecisionSecond(5)).toBeNull();
  });

  it("caps the extra aim at the lower of the scope's bonus and the Acc", () => {
    // The book's sniper: Acc 5, a +2 scope; she can't go past +2.
    expect(precisionCap(5, 2)).toBe(2);
    expect(precisionCap(3, 6)).toBe(3);
    expect(precisionCap(8, 8)).toBe(5);
    expect(precisionCap(5, 0)).toBe(0);
  });

  it("loses the aim on a failure and gives the sniper away on a critical one", () => {
    expect(precisionOutcome(true, false)).toBe("gained");
    expect(precisionOutcome(false, false)).toBe("lost");
    expect(precisionOutcome(false, true)).toBe("spotted");
  });
});

describe("the Ranged Rapid Strike (p. 85)", () => {
  it("needs RoF 2+ on Attack or All-Out Attack, and isn't Spraying Fire", () => {
    expect(rangedRapidStrikeRefusal({ rateOfFire: 1, maneuver: "attack", spraying: false })).toBe("rateOfFire");
    expect(rangedRapidStrikeRefusal({ rateOfFire: 3, maneuver: "moveAndAttack", spraying: false })).toBe("maneuver");
    expect(rangedRapidStrikeRefusal({ rateOfFire: 3, maneuver: "allOutAttack", spraying: true })).toBe("spraying");
    expect(rangedRapidStrikeRefusal({ rateOfFire: 2, maneuver: "attack", spraying: false })).toBeNull();
  });
});

describe("the expanded Gunslinger (p. 249)", () => {
  it("halves a default penalty in the shooter's favor", () => {
    expect(halvedDefault(-6)).toBe(-3);
    expect(halvedDefault(-4)).toBe(-2);
    expect(halvedDefault(-2)).toBe(-1);
    expect(halvedDefault(-3)).toBe(-1);
  });
});

describe("Close-Quarters Battle (pp. 250-251)", () => {
  it("stands in for the skill within Per yards, never above it", () => {
    // Guns 12, CQB 15: a Tommy gun's -5 leaves 10; a pistol's -2 would be 13, held to 12.
    expect(12 - 5 + closeQuartersLine(3, -5)).toBe(10);
    expect(12 - 2 + closeQuartersLine(3, -2)).toBe(12);
    expect(closeQuartersLine(0, -2)).toBe(0);
    expect(withinCloseQuarters(12, 12)).toBe(true);
    expect(withinCloseQuarters(13, 12)).toBe(false);
    expect(withinCloseQuarters(null, 12)).toBe(false);
  });
});

describe("Targeted Attacks with guns (p. 252)", () => {
  it("reads the specialty and the target from the name", () => {
    expect(readGunTargetedAttack("TA (Pistol/Weapon)")).toEqual({ skill: "Guns (Pistol)", target: "weapon", chinks: false });
    expect(readGunTargetedAttack("TA (SMG/Head)")).toEqual({ skill: "Guns (Submachine Gun)", target: "head", chinks: false });
    expect(readGunTargetedAttack("Targeted Attack (Rifle/Vitals Chinks)")).toEqual({ skill: "Guns (Rifle)", target: "vitals", chinks: true });
    expect(readGunTargetedAttack("TA (Guns (Pistol)/Skull)")?.skill).toBe("Guns (Pistol)");
    expect(readGunTargetedAttack("TA (Karate Punch/Face)")).toBeNull();
    expect(readGunTargetedAttack("Fast-Firing")).toBeNull();
    expect(gunSkillOf("LMG")).toBe("Guns (Light Machine Gun)");
  });

  it("defaults and caps as the book's examples do", () => {
    // TA (Pistol/Weapon) defaults to Guns-4 and can't exceed Guns-2; TA (SMG/Head) Guns-5, at most Guns-2.
    const weapon = gunTargetedAttackLevel(readGunTargetedAttack("TA (Pistol/Weapon)")!, 12, 99);
    expect([weapon.default, weapon.ceiling]).toEqual([8, 10]);
    const head = gunTargetedAttackLevel(readGunTargetedAttack("TA (SMG/Head)")!, 12, 99);
    expect([head.default, head.ceiling]).toEqual([7, 10]);
    expect(gunTargetPenalty(readGunTargetedAttack("TA (Rifle/Skull)")!)).toBe(-7);
    expect(gunTargetPenalty(readGunTargetedAttack("TA (Rifle/Eye)")!)).toBe(-9);
    expect(gunTargetPenalty(readGunTargetedAttack("TA (Rifle/Torso Chinks)")!)).toBe(-8);
    expect(gunTargetPenalty(readGunTargetedAttack("TA (Rifle/Neck Chinks)")!)).toBe(-10);
    // Bought as a Hard technique: 3 points, two levels.
    expect(gunTargetedAttackLevel(readGunTargetedAttack("TA (Rifle/Skull)")!, 14, 3).level).toBe(9);
  });

  it("takes the levels on a shot aimed where the TA aims", () => {
    const ta = readGunTargetedAttack("TA (SMG/Head)")!;
    expect(aimedWhereTaAims(ta, "Guns (Submachine Gun)", "face", false)).toBe(true);
    expect(aimedWhereTaAims(ta, "Guns (Pistol)", "face", false)).toBe(false);
    expect(aimedWhereTaAims(readGunTargetedAttack("TA (Pistol/Vitals Chinks)")!, "Guns (Pistol)", "vitals", false)).toBe(false);
  });
});

describe("Instant Arsenal Disarm (p. 251)", () => {
  it("takes the gun apart on a win, leaves it unready on a narrow loss", () => {
    expect(instantArsenalResult({ outcome: "first", marginOfVictory: 1, criticalFailure: false })).toBe("disabled");
    expect(instantArsenalResult({ outcome: "second", marginOfVictory: 2, criticalFailure: false })).toBe("unready");
    expect(instantArsenalResult({ outcome: "second", marginOfVictory: 3, criticalFailure: false })).toBe("intact");
    expect(instantArsenalResult({ outcome: "tie", marginOfVictory: 0, criticalFailure: false })).toBe("intact");
    expect(instantArsenalResult({ outcome: "second", marginOfVictory: 5, criticalFailure: true })).toBe("shotAtHand");
  });
});

describe("Mounted Shooting's vehicle (p. 251)", () => {
  it("matches the technique's second specialty to the vehicle's control skill or its name", () => {
    const bike = { name: "Zündapp KS 750", skill: "Driving (Motorcycle)" };
    expect(mountedShootingFits("Mounted Shooting (SMG/Motorcycle)", bike)).toBe(true);
    expect(mountedShootingFits("Mounted Shooting (SMG/Automobile)", bike)).toBe(false);
    expect(mountedShootingFits("Mounted Shooting (Pistol/Bicycling)", { name: "Safety Bicycle", skill: "Bicycling" })).toBe(true);
    expect(mountedShootingFits("Mounted Shooting (Rifle/Stagecoach)", { name: "Concord Stagecoach", skill: "Teamster (Equines)" })).toBe(true);
    // No vehicle named, or none known: as it is.
    expect(mountedShootingFits("Mounted Shooting (SMG)", bike)).toBe(true);
    expect(mountedShootingFits("Mounted Shooting (SMG/Motorcycle)", null)).toBe(true);
  });
});
