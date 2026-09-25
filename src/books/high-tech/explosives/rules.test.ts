/**
 * High-Tech's explosives and incendiaries as pure rules (pp. 181-188).
 */

import { describe, expect, it } from "vitest";

import { explosive } from "./ref.js";
import {
  chargeFor,
  concussionModifier,
  enclosureFactor,
  eyeBonus,
  failedBatch,
  flashModifier,
  formatDamage,
  hearingBonus,
  jobCharge,
  parseDamage,
  recipeFor,
  scaleDamage,
  senseLoss,
  shapedChargeRolls,
  shapedDr,
  shockDetonates,
  shockNumber,
  skimOutcome,
  thermiteDr,
  thermiteDrDestroyed,
  thermiteDrOnVictim,
  thermiteOnObject,
  thermiteSeconds,
} from "./rules.js";

describe("damage formulas", () => {
  it("reads and writes the system's grammar", () => {
    expect(parseDamage("6dx2")).toEqual({ dice: 6, adds: 0, multiplier: 2 });
    expect(parseDamage("8d+2")).toEqual({ dice: 8, adds: 2 });
    expect(parseDamage("6d×14")).toEqual({ dice: 6, adds: 0, multiplier: 14 });
    expect(parseDamage("burn")).toBeNull();
    expect(formatDamage({ dice: 6, adds: 0, multiplier: 4 })).toBe("6dx4");
    expect(formatDamage({ dice: 8, adds: -1 })).toBe("8d-1");
  });

  it("scales the multiplier where it stays whole, else lays the dice out", () => {
    expect(scaleDamage({ dice: 6, adds: 0, multiplier: 2 }, 2)).toEqual({ dice: 6, adds: 0, multiplier: 4 });
    expect(scaleDamage({ dice: 6, adds: 0, multiplier: 2 }, 1.5)).toEqual({ dice: 6, adds: 0, multiplier: 3 });
    expect(scaleDamage({ dice: 8, adds: 2 }, 2)).toEqual({ dice: 8, adds: 2, multiplier: 2 });
    // 8d+2 x 1.5: 12 dice and 3 adds.
    expect(scaleDamage({ dice: 8, adds: 2 }, 1.5)).toEqual({ dice: 12, adds: 3 });
    // 7d x 0.5 (a weak batch): 3 dice and half a die, 2 points.
    expect(scaleDamage({ dice: 7, adds: 0 }, 0.5)).toEqual({ dice: 3, adds: 2 });
  });
});

describe("side effects of explosions (pp. 181-182)", () => {
  it("doubles a sealed space and adds half for a vented one", () => {
    expect(enclosureFactor("sealed")).toBe(2);
    expect(enclosureFactor("vented")).toBe(1.5);
    expect(enclosureFactor("")).toBe(1);
  });

  it("takes -1 a 5 points through DR against concussion, -1 a 10 received against the flash", () => {
    expect(concussionModifier(14)).toBe(-2);
    expect(concussionModifier(0)).toBe(-0);
    expect(flashModifier(25)).toBe(-2);
  });

  it("counts the best ear or eye protection worn", () => {
    expect(hearingBonus(["Earplugs"], false)).toBe(1);
    expect(hearingBonus(["Earplugs", "Earmuffs"], false)).toBe(5);
    expect(hearingBonus([], true)).toBe(5);
    expect(eyeBonus(["Sunglasses (TL6)"], false)).toBe(1);
    expect(eyeBonus(["Welding Goggles"], false)).toBe(3);
    expect(eyeBonus(["Anti-Laser Goggles"], false)).toBe(5);
  });

  it("costs the margin, the whole sense by 10, for (20 - HT) minutes or two seconds protected", () => {
    expect(senseLoss({ margin: 3, criticalFailure: false, ht: 12, protectedSense: false })).toEqual({ total: false, penalty: 3, seconds: 480 });
    expect(senseLoss({ margin: 10, criticalFailure: false, ht: 12, protectedSense: false }).total).toBe(true);
    expect(senseLoss({ margin: 1, criticalFailure: true, ht: 12, protectedSense: false }).total).toBe(true);
    expect(senseLoss({ margin: 2, criticalFailure: false, ht: 25, protectedSense: false }).seconds).toBe(60);
    expect(senseLoss({ margin: 2, criticalFailure: false, ht: 10, protectedSense: true }).seconds).toBe(2);
  });
});

describe("demolition (pp. 182-183)", () => {
  it("works the book's formulas", () => {
    expect(jobCharge("crater", { depthFeet: 10 })).toEqual({ pounds: 3000, ref: 0.5 });
    expect(jobCharge("timberBored", { thicknessInches: 10 }).pounds).toBeCloseTo(0.4);
    expect(jobCharge("timberWrapped", { thicknessInches: 10 }).pounds).toBeCloseTo(2.5);
    expect(jobCharge("girder", { areaSquareInches: 12 }).pounds).toBe(6);
    expect(jobCharge("brickWall", { holeFeet: 2, thicknessFeet: 1 }).pounds).toBe(1);
    expect(jobCharge("concreteWall", { holeFeet: 2, thicknessFeet: 1 }).pounds).toBe(2);
    expect(jobCharge("steelPlate", { holeFeet: 1, thicknessInches: 2 }).pounds).toBe(10);
  });

  it("converts by REF, and halves for tamping or a shaped charge, not both", () => {
    // A crater's 3,000 lb. of black powder (REF 0.5) is 1,500 lb. of TNT.
    expect(chargeFor({ job: "crater", size: { depthFeet: 10 }, ref: 1 })).toBe(1500);
    expect(chargeFor({ job: "brickWall", size: { holeFeet: 2, thicknessFeet: 1 }, ref: 1.4 })).toBeCloseTo(0.714, 3);
    expect(chargeFor({ job: "brickWall", size: { holeFeet: 2, thicknessFeet: 1 }, ref: 1, tamped: true })).toBe(0.5);
    expect(chargeFor({ job: "brickWall", size: { holeFeet: 2, thicknessFeet: 1 }, ref: 1, tamped: true, shaped: true })).toBe(0.5);
    // A crater is packed already, and a shaped charge is only for walls.
    expect(chargeFor({ job: "crater", size: { depthFeet: 1 }, ref: 0.5, tamped: true })).toBe(300);
    expect(chargeFor({ job: "girder", size: { areaSquareInches: 2 }, ref: 1, shaped: true })).toBe(1);
  });

  it("gives a TL6 shaped charge two rolls, a TL7 one; its liner divides DR by 10", () => {
    expect(shapedChargeRolls(6)).toEqual([-4, -5]);
    expect(shapedChargeRolls(7)).toEqual([0]);
    expect(shapedDr(28)).toBe(2);
  });
});

describe("unstable and home-made explosives (pp. 184-187)", () => {
  const nitro = explosive("Nitroglycerin (NG)");
  const dynamite = explosive("Dynamite (80%)");

  it("sets nitro off on 12+, anything else on the number set", () => {
    expect(shockNumber(nitro, 0)).toBe(12);
    expect(shockNumber(nitro, 10)).toBe(10);
    expect(shockNumber(dynamite, 0)).toBeNull();
    expect(shockNumber(dynamite, 9)).toBe(9);
    expect(shockDetonates(12, 12)).toBe(true);
    expect(shockDetonates(11, 12)).toBe(false);
    expect(shockDetonates(18, null)).toBe(false);
  });

  it("skims nitro, ruining, halving or blowing it all by the margin", () => {
    expect(skimOutcome(true, 0)).toBe("skimmed");
    expect(skimOutcome(false, 1)).toBe("ruined");
    expect(skimOutcome(false, 2)).toBe("half");
    expect(skimOutcome(false, 5)).toBe("all");
  });

  it("knows the recipes, and what a failed batch is", () => {
    expect(recipeFor(explosive("Improved Black Powder"))).toBe("blackPowder");
    expect(recipeFor(explosive("Smokeless Powder"))).toBeNull();
    expect(recipeFor(explosive("Composition C4"))).toBe("plastic");
    expect(recipeFor(explosive("ANFO"))).toBe("anfo");
    expect(recipeFor(explosive("Fuel-Air Explosive"))).toBe("fuelAir");
    expect(recipeFor(explosive("TNT"))).toBeNull();
    expect([1, 3, 5, 6].map((d) => failedBatch("plastic", d))).toEqual(["unstable", "weak", "smelly", "inert"]);
    expect(failedBatch("anfo", 1)).toBe("inert");
  });
});

describe("incendiaries (p. 188)", () => {
  it("burns thermite 25 seconds a pound, wearing DR down a point per 10", () => {
    expect(thermiteSeconds(2)).toBe(50);
    expect(thermiteDr(10, 9)).toBe(10);
    expect(thermiteDr(10, 25)).toBe(8);
    expect(thermiteDr(1, 40)).toBe(0);
  });

  it("counts the DR a second destroys, and what's left on a victim whose armour took some of it", () => {
    expect(thermiteDrDestroyed(8, 12)).toBe(1);
    expect(thermiteDrDestroyed(12, 18)).toBe(0);
    expect(thermiteDrDestroyed(9, 31)).toBe(3);
    // 25 damage destroyed 2; the armour already lost 1 of them, so 1 more comes off the DR now.
    expect(thermiteDrOnVictim(5, 25, 1)).toBe(4);
    expect(thermiteDrOnVictim(5, 25, 2)).toBe(5);
    expect(thermiteDrOnVictim(1, 60, 0)).toBe(0);
  });

  it("works thermite on an object second by second", () => {
    // DR 12, HP 10, 12 a second: DR 12 stops the first; then 11, 10, 9 and 8 let 1, 2, 3 and 4 through.
    const burned = thermiteOnObject([12, 12, 12, 12, 12, 12], 12, 10);
    expect(burned).toMatchObject({ through: true, seconds: 5, injury: 10, drLeft: 6 });
    expect(thermiteOnObject([3, 3], 12, 10)).toMatchObject({ through: false, seconds: 2, injury: 0, drLeft: 12 });
  });
});
