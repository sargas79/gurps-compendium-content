import { describe, expect, it } from "vitest";

import {
  HEARD_AT,
  catalogueFigures,
  cinematicHearing,
  foldedBulk,
  foldedRecoil,
  hearingDistanceModifier,
  highDensityFits,
  laserReach,
  levelWithin,
  magazineCapacity,
  magazineFigures,
  magazinePriceChange,
  modeMatches,
  modeSetup,
  overSightCap,
  rangefinderBonus,
  reflexBonus,
  reportOf,
  scopeDarkness,
  seesLaserDot,
  darknessAfter,
  DARKNESS_OFFSET,
  suppressorHearing,
  suppressorSeconds,
  unaimedScopeBulk,
  accessoryFits,
  suppressorBuildRolls,
  bowSightKinds,
  restrictedMagazineClass,
} from "./rules.js";

describe("bows' sights and the law on magazines (High-Tech pp. 155, 201)", () => {
  it("gives a bow a gun's sights, a crossbow its scopes, collimating sights and lasers, and a slingshot or speargun none", () => {
    expect(bowSightKinds("Bow")).toContain("nightSight");
    expect(bowSightKinds("Crossbow")).toEqual(["scope", "reflexSight", "targetingLaser"]);
    expect(bowSightKinds("Bow (Slingshot)")).toEqual([]);
    expect(bowSightKinds("Crossbow (Speargun)")).toEqual([]);
    expect(bowSightKinds("Guns (Rifle)")).toBeNull();
  });

  it("makes an LC3-4 gun LC1-2 where high-capacity magazines are restricted", () => {
    expect([4, 3, 2, 1, 0].map((lc) => restrictedMagazineClass(lc))).toEqual([2, 1, 2, 1, 0]);
    expect(restrictedMagazineClass(null)).toBeNull();
  });
});

describe("what fits and what is built (High-Tech pp. 156-159)", () => {
  it("puts a sidearm's laser only on a pistol and a shoulder arm's on anything else, and a tactical light on any gun", () => {
    expect(accessoryFits("sidearm", "Guns (Pistol)")).toBe(true);
    expect(accessoryFits("sidearm", "Guns (Rifle)")).toBe(false);
    expect(accessoryFits("shoulder", "Guns (Pistol)")).toBe(false);
    expect(accessoryFits("shoulder", "Guns (Submachine Gun)")).toBe(true);
    expect(catalogueFigures("Large Tactical Light")?.fits).toBeUndefined();
    expect(accessoryFits(undefined, "Guns (Pistol)")).toBe(true);
  });

  it("designs a suppressor with Engineer, or Research at TL7+, and builds it at the grade's modifier", () => {
    expect(suppressorBuildRolls("poor", 7)).toEqual({ designSkills: [], buildModifier: null });
    expect(suppressorBuildRolls("average", 6)).toEqual({ designSkills: ["Engineer (Small Arms)"], buildModifier: 4 });
    expect(suppressorBuildRolls("fine", 8)).toEqual({ designSkills: ["Engineer (Small Arms)", "Research"], buildModifier: -2 });
  });
});

describe("the catalogue (pp. 155-160)", () => {
  it("knows the captured records by name", () => {
    expect(catalogueFigures("Fixed-Power Scope (TL7, per +1 Acc)")).toMatchObject({ kind: "scope", fixed: true });
    expect(catalogueFigures("Variable-Power Scope (TL8, per +1 Acc)")).toMatchObject({ kind: "scope", fixed: false });
    expect(catalogueFigures("Reflex Sight, Tritium")).toMatchObject({ kind: "reflexSight", yards: 300 });
    expect(catalogueFigures("Collimating Sight, Battery")?.kind).toBe("reflexSight");
    expect(catalogueFigures("Early Night Sight")).toMatchObject({ nightVision: 2, bulk: -2 });
    expect(catalogueFigures("Night Sight")).toMatchObject({ nightVision: 4, accuracy: 2, bulk: -2 });
    expect(catalogueFigures("Improved Night Sight, Add-On")).toMatchObject({ nightVision: 5, addOn: true });
    expect(catalogueFigures("Improved Night Sight")).toMatchObject({ nightVision: 5, bulk: -1 });
    expect(catalogueFigures("Advanced Thermal-Imaging Sight")).toMatchObject({ infravision: true, accuracy: 2 });
    expect(catalogueFigures("Mini-Computer Sight (Infravision)")).toMatchObject({ kind: "computerSight", yards: 2000, magnification: 2, bulk: -1 });
    expect(catalogueFigures("Integral Targeting Laser (Shoulder Arm)")).toMatchObject({ kind: "targetingLaser", yards: 750 });
    expect(catalogueFigures("Detachable Wiper Suppressor, Rifle (per -1 Hearing)")).toMatchObject({ levels: { min: 2, max: 6 }, suppressor: { design: "wiper", damage: 0.5 } });
    expect(catalogueFigures("Detachable Baffle Suppressor, Oversized (per -1 Hearing)")).toMatchObject({ bulk: -2 });
    expect(catalogueFigures("Pistol Stock (TL7)")?.kind).toBe("pistolStock");
    expect(catalogueFigures("Folding Stock")?.kind).toBe("foldingStock");
    expect(catalogueFigures("Bipod (TL8)")?.kind).toBe("bipod");
    expect(catalogueFigures("Shooting Sticks")?.kind).toBe("shootingSticks");
    expect(catalogueFigures("Belt Holster")).toBeNull();
  });

  it("keeps a level within what the record allows", () => {
    expect(levelWithin(0, { min: 2, max: 6 })).toBe(2);
    expect(levelWithin(9, { min: 2, max: 6 })).toBe(6);
    expect(levelWithin(3, undefined)).toBe(0);
  });
});

describe("magazines (p. 155)", () => {
  it("weighs and prices the book's example: a 50-round alloy M16 magazine", () => {
    const m = magazineFigures({ kind: "extended", material: "alloy", rounds: 50, normal: 20, wps: 0.026 });
    expect(m.weight).toBe(1.56);
    expect(m.cost).toBe(36.5);
    expect(m.bulk).toBe(-1);
  });

  it("is -1 Bulk past 1.5 times (extended) or 3 times (drum) the normal capacity", () => {
    expect(magazineFigures({ kind: "extended", material: "alloy", rounds: 30, normal: 20, wps: 0.026 }).bulk).toBe(0);
    expect(magazineFigures({ kind: "extended", material: "steel", rounds: 31, normal: 17, wps: 0.026 }).bulk).toBe(-1);
    expect(magazineFigures({ kind: "drum", material: "steel", rounds: 60, normal: 20, wps: 0.026 }).bulk).toBe(0);
    expect(magazineFigures({ kind: "drum", material: "steel", rounds: 75, normal: 20, wps: 0.026 }).bulk).toBe(-1);
    expect(magazineFigures({ kind: "highDensity", material: "alloy", rounds: 100, normal: 20, wps: 0.026 }).bulk).toBe(0);
  });

  it("is -1 Malf. for a drum, or where the GM says so", () => {
    expect(magazineFigures({ kind: "drum", material: "alloy", rounds: 50, normal: 20, wps: 0.026 }).malfunction).toBe(-1);
    expect(magazineFigures({ kind: "extended", material: "alloy", rounds: 30, normal: 20, wps: 0.026 }).malfunction).toBe(0);
    expect(magazineFigures({ kind: "extended", material: "alloy", rounds: 30, normal: 20, wps: 0.026, unreliable: true }).malfunction).toBe(-1);
  });

  it("uses the box's multiplier and cost factor", () => {
    expect(magazineFigures({ kind: "drum", material: "steel", rounds: 10, normal: 5, wps: 0.1 }).weight).toBe(2);
    expect(magazineFigures({ kind: "helicalDrum", material: "alloy", rounds: 10, normal: 5, wps: 0.1 })).toMatchObject({ weight: 1.3, cost: 305 });
  });

  it("keeps high-density magazines out of a pistol's grip", () => {
    expect(highDensityFits("Guns (Pistol)")).toBe(false);
    expect(highDensityFits("Guns (Rifle)")).toBe(true);
  });

  it("reads the normal capacity and reprices the gun", () => {
    expect(magazineCapacity("30+1(3)")).toBe(30);
    expect(magazineCapacity("")).toBe(0);
    const m = magazineFigures({ kind: "extended", material: "alloy", rounds: 50, normal: 20, wps: 0.026 });
    expect(magazinePriceChange(m, 20, 0.026)).toEqual({ cost: 36.5, weight: 1.04 });
  });
});

describe("sights (pp. 155-157)", () => {
  it("takes darkness off: a light to -3 within its beam, then the best sight's offset, never above 0", () => {
    expect(darknessAfter(-6, { light: false, sightOffset: 0 })).toBe(-6);
    expect(darknessAfter(-6, { light: true, sightOffset: 0 })).toBe(-3);
    expect(darknessAfter(-6, { light: true, sightOffset: 3 })).toBe(0);
    expect(darknessAfter(-2, { light: true, sightOffset: 0 })).toBe(-2);
    expect(darknessAfter(-5, { light: false, sightOffset: DARKNESS_OFFSET.visibilitySights })).toBe(-4);
    expect(darknessAfter(-1, { light: false, sightOffset: 2 })).toBe(0);
    // A TL7+ scope collects light; an illuminated reticle does more, at any TL.
    expect([scopeDarkness(6, false), scopeDarkness(7, false), scopeDarkness(5, true)]).toEqual([0, 1, 2]);
  });

  it("shows an infrared dot only to eyes that see it", () => {
    expect(seesLaserDot("red", {})).toBe(true);
    expect(seesLaserDot("infrared", {})).toBe(false);
    expect(seesLaserDot("infrared", { nightVision: 3 })).toBe(true);
    expect(seesLaserDot("infrared", { infravision: true })).toBe(true);
    expect(seesLaserDot("infrared", { hyperspectralVision: true })).toBe(true);
  });

  it("holds the gadgets to the gun's base Acc: a +4 scope on an Acc 2 pistol is +2", () => {
    expect(overSightCap(2, 4)).toBe(2);
    expect(overSightCap(4, 3)).toBe(0);
  });

  it("slows an unaimed shot with a scope over 4x", () => {
    expect(unaimedScopeBulk(2)).toBe(0);
    expect(unaimedScopeBulk(3)).toBe(-1);
  });

  it("gives a reflex sight +1 to 300 yards, never with a magnifying scope", () => {
    expect(reflexBonus(100, 300, false)).toBe(1);
    expect(reflexBonus(null, 300, false)).toBe(1);
    expect(reflexBonus(301, 300, false)).toBe(0);
    expect(reflexBonus(100, 300, true)).toBe(0);
  });

  it("gives a rangefinder its bonus within its range", () => {
    expect(rangefinderBonus(1000, 2000, 3)).toBe(3);
    expect(rangefinderBonus(2500, 2000, 3)).toBe(0);
  });

  it("works out a laser's reach by colour and light", () => {
    expect(laserReach(750, "red", true)).toBe(250);
    expect(laserReach(750, "orange", true)).toBe(375);
    expect(laserReach(750, "green", false)).toBe(1500);
    expect(laserReach(750, "infrared", true)).toBe(750);
  });
});

describe("suppressors and the Hearing Distance Table (pp. 158-159)", () => {
  it("puts the book's example at -1: a light pistol heard at 256 yards, from 300", () => {
    expect(reportOf({ airGun: false, calibreClass: "handgun", powderAndShot: false, skill: "Guns (Pistol)", average: 6.5 })).toBe("light");
    expect(HEARD_AT.light).toBe(256);
    expect(hearingDistanceModifier(256, 300)).toBe(-1);
    expect(hearingDistanceModifier(256, 256)).toBe(0);
    expect(hearingDistanceModifier(256, 200)).toBe(0);
    expect(hearingDistanceModifier(256, 128)).toBe(1);
    expect(hearingDistanceModifier(256, 1100)).toBe(-3);
  });

  it("classes a gun's report", () => {
    expect(reportOf({ airGun: true, calibreClass: null, powderAndShot: false, skill: "Guns (Rifle)", average: 5 })).toBe("airGun");
    expect(reportOf({ airGun: false, calibreClass: "handgun", powderAndShot: false, skill: "Guns (Pistol)", average: 9 })).toBe("heavy");
    expect(reportOf({ airGun: false, calibreClass: "rifle", powderAndShot: false, skill: "Guns (Rifle)", average: 5.5 })).toBe("veryLight");
    expect(reportOf({ airGun: false, calibreClass: "rifle", powderAndShot: true, skill: "Guns (Musket)", average: 16 })).toBe("veryLight");
    expect(reportOf({ airGun: false, calibreClass: "rifle", powderAndShot: false, skill: "Guns (Rifle)", average: 24.5 })).toBe("heavy");
    expect(reportOf({ airGun: false, calibreClass: "rifle", powderAndShot: false, skill: "Guns (Rifle)", average: 30 })).toBe("magnum");
    expect(reportOf({ airGun: false, calibreClass: "grenadeLauncher", powderAndShot: false, skill: "Guns (Grenade Launcher)", average: 0 })).toBe("light");
    expect(reportOf({ airGun: false, calibreClass: "mortar", powderAndShot: false, skill: "Artillery", average: 0 })).toBe("artillery");
  });

  it("gives a suppressor its level, a home-built one its grade, a worn-out one nothing", () => {
    const levels = { min: 1, max: 4 };
    expect(suppressorHearing({ level: 3, levels, grade: "", fired: 0, lifetime: 0 })).toBe(-3);
    expect(suppressorHearing({ level: 4, levels, grade: "good", fired: 0, lifetime: 0 })).toBe(-3);
    expect(suppressorHearing({ level: 4, levels, grade: "fine", fired: 0, lifetime: 0 })).toBe(-4);
    expect(suppressorHearing({ level: 4, levels, grade: "poor", fired: 0, lifetime: 3 })).toBe(-1);
    expect(suppressorHearing({ level: 4, levels, grade: "average", fired: 4, lifetime: 10 })).toBe(-2);
    expect(suppressorHearing({ level: 4, levels, grade: "average", fired: 5, lifetime: 10 })).toBe(-1);
    expect(suppressorHearing({ level: 4, levels: { min: 2, max: 4 }, grade: "", fired: 40, lifetime: 40 })).toBe(0);
  });

  it("doubles or triples a cinematic silencer's penalty", () => {
    expect(cinematicHearing(-3, 2)).toBe(-6);
    expect(cinematicHearing(-3, 3)).toBe(-9);
  });

  it("takes 5 seconds to fit, 3 for a TL8 quick-detach model", () => {
    expect(suppressorSeconds(6)).toBe(5);
    expect(suppressorSeconds(8)).toBe(3);
  });
});

describe("stocks and bipods (p. 160)", () => {
  it("folds a stock: Bulk a step better, Recoil +1 unless 1", () => {
    expect(foldedBulk(-5)).toBe(-4);
    expect(foldedBulk(-1)).toBe(0);
    expect(foldedRecoil(2)).toBe(3);
    expect(foldedRecoil(1)).toBe(1);
  });

  it("reads the GCA records' setups from their mode names", () => {
    expect(modeSetup("Folded Stock")).toEqual({ folded: true, bipod: null });
    expect(modeSetup("w/ Bipod; Folded Stock")).toEqual({ folded: true, bipod: true });
    expect(modeSetup("w/o Bipod")).toEqual({ folded: false, bipod: false });
    expect(modeSetup("Standard")).toEqual({ folded: false, bipod: null });
  });

  it("matches a mode to the gun's state", () => {
    const both = { foldPairs: true, bipodPairs: true };
    expect(modeMatches(modeSetup("w/o Bipod"), both, { folded: false, bipod: false })).toBe(true);
    expect(modeMatches(modeSetup("w/o Bipod"), both, { folded: true, bipod: false })).toBe(false);
    expect(modeMatches(modeSetup("w/ Bipod; Folded Stock"), both, { folded: true, bipod: true })).toBe(true);
    expect(modeMatches(modeSetup("Slug"), { foldPairs: true, bipodPairs: false }, { folded: false, bipod: true })).toBe(true);
    expect(modeMatches(modeSetup("Anything"), { foldPairs: false, bipodPairs: false }, { folded: true, bipod: true })).toBe(true);
  });
});
