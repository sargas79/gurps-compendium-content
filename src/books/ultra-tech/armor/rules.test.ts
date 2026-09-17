import { describe, expect, it } from "vitest";

import {
  adaptTo,
  adaptivePrice,
  afterDivisor,
  airTankHours,
  airTankSize,
  baseName,
  bouncedDamage,
  bouncesBack,
  canBeTransparent,
  climateTolerance,
  coverageActivation,
  coverageMultiplier,
  coversArc,
  emaMultiplier,
  emaUseSpent,
  foamLeft,
  fullDrAgainst,
  hasBiomedicalSensors,
  laserArmorKind,
  mindShieldBonus,
  nasalPlugBonus,
  partAt,
  pasteCovers,
  pressureSupportLevel,
  protectionWorn,
  reactivePasteDr,
  reflecDetectionBonus,
  semiAblativeLoss,
  suitPatchPenalty,
  tailoredDr,
  tailoredLc,
  tailoredPrice,
  WARSUIT_HARDENED,
  breathesUnderwater,
  reactorSpoilsInfrared,
} from "./rules.js";

describe("threat protection (Ultra-Tech pp. 171, 176-181)", () => {
  it("reads a name without its TL", () => {
    expect(baseName("Combat Hardsuit (TL10)")).toBe("Combat Hardsuit");
    expect(baseName("Assault Boots (TL  9)")).toBe("Assault Boots");
  });

  it("seals a vacc suit only with a space helmet on", () => {
    expect(protectionWorn("Civilian Vacc Suit", [])).toBeNull();
    expect(protectionWorn("Reflex Vacc Suit", ["Visored Space Helmet (TL10)"])).toEqual({
      sealed: true, climate: [-459, 250], pressureAtm: 10, radiationPf: 2, vacuumSupport: true, air: true,
    });
  });

  it("gives a hardsuit PF 2 alone and PF 5 sealed with a combat helmet", () => {
    expect(protectionWorn("Combat Hardsuit (TL9)", [])).toEqual({ radiationPf: 2 });
    expect(protectionWorn("Combat Hardsuit (TL9)", ["Combat Infantry Helmet (TL 9)"])).toMatchObject({ sealed: true, radiationPf: 5, climate: [-140, 140] });
  });

  it("keeps the biosuit's hood on the suit, and an expedition suit's climate without its mask", () => {
    expect(protectionWorn("Space Biosuit", [])).toMatchObject({ sealed: true, vacuumSupport: true, air: true });
    expect(protectionWorn("Expedition Suit", [])).toEqual({ climate: [-120, 120] });
    expect(protectionWorn("Expedition Suit", ["Air Mask"])).toEqual({ sealed: true, climate: [-120, 120] });
  });

  it("gives masks Protected Vision and Smell, and visors glare resistance", () => {
    expect(protectionWorn("Respirator", [])).toEqual({ mask: true });
    expect(protectionWorn("Filter Mask", [])).toEqual({ mask: true, filter: true });
    expect(protectionWorn("Armored Shades (TL11)", [])).toEqual({ glare: true });
    expect(protectionWorn("Space Combat Helmet (TL12)", [])).toEqual({ hearing: true });
    expect(protectionWorn("Reflex Vest", [])).toBeNull();
  });

  it("turns atmospheres into Pressure Support and a climate into Temperature Tolerance", () => {
    expect(pressureSupportLevel(1)).toBe(0);
    expect(pressureSupportLevel(10)).toBe(1);
    expect(pressureSupportLevel(90)).toBe(2);
    expect(climateTolerance([-40, 120])).toEqual({ coldF: 75, heatF: 40 });
  });

  it("holds air by tank size and TL", () => {
    expect(airTankSize("Air Tank (Medium)")).toBe("medium");
    expect(airTankHours("medium", 10)).toBe(18);
    expect(airTankHours("mini", 12)).toBe(0.5);
    expect(airTankHours("large", 15)).toBe(72);
  });

  it("makes each failed patch harder", () => {
    expect(suitPatchPenalty(0)).toBe(-0);
    expect(suitPatchPenalty(2)).toBe(-2);
  });
});

describe("laser-resistant armour (pp. 173-174)", () => {
  it("knows the kinds by name", () => {
    expect(laserArmorKind("Ablative Nanoplas Suit")).toBe("ablative");
    expect(laserArmorKind("Reflec Helmet")).toBe("reflec");
    expect(laserArmorKind("Retro-Reflective Jacket")).toBe("retroReflective");
    expect(laserArmorKind("Reflex Vest")).toBeNull();
  });

  it("counts X-ray lasers for ablative armour but not for reflec, which takes microwaves", () => {
    expect(fullDrAgainst("ablative", "xray")).toBe(true);
    expect(fullDrAgainst("reflec", "xray")).toBe(false);
    expect(fullDrAgainst("reflec", "mad")).toBe(true);
    expect(fullDrAgainst("ablative", "mad")).toBe(false);
    expect(fullDrAgainst("reflec", null)).toBe(false);
  });

  it("wears ablative armour down a point per 10 basic damage", () => {
    expect(semiAblativeLoss(9, 24)).toBe(0);
    expect(semiAblativeLoss(27, 24)).toBe(2);
    expect(semiAblativeLoss(300, 4)).toBe(4);
  });

  it("bounces back half of what retro-reflective armour resisted, visible and near-infrared only", () => {
    expect(bouncedDamage(30, 20)).toBe(10);
    expect(bouncedDamage(9, 20)).toBe(4);
    expect(bouncesBack("blueGreen")).toBe(true);
    expect(bouncesBack("ultraviolet")).toBe(false);
    expect(afterDivisor(40, 2)).toBe(20);
    expect(afterDivisor(40, 0.5)).toBe(80);
  });

  it("makes reflec easier to find on radar", () => {
    expect(reflecDetectionBonus(["Reflex Vest"])).toBe(0);
    expect(reflecDetectionBonus(["Reflec Jacket"])).toBe(1);
    expect(reflecDetectionBonus(["Reflec Helmet", "Retro-Reflective Suit"])).toBe(2);
  });

  it("offers transparency on bioplas only", () => {
    expect(canBeTransparent("Bioplas Bodysuit")).toBe(true);
    expect(canBeTransparent("Space Biosuit")).toBe(true);
    expect(canBeTransparent("Energy Cloth Suit")).toBe(false);
  });
});

describe("tailored armour (pp. 174-175)", () => {
  // The worked example: half the front torso, the groin, and half the legs.
  const dress = { coverage: { torso: "frontHalf" as const, groin: "full" as const, legs: "half" as const }, style: "light" as const, cut: "original" as const };

  it("adds the coverage table up, halving a front-only or half-covered part", () => {
    expect(coverageMultiplier({ torso: "full", groin: "full", legs: "full", arms: "full", hands: "full", feet: "full", skull: "full", face: "full", neck: "full" })).toBe(1);
    expect(coverageMultiplier({ torso: "skimpy" })).toBe(0.0625);
  });

  it("prices the example's evening dress from a TL10 nanoweave suit", () => {
    expect(coverageMultiplier(dress.coverage)).toBe(0.2875);
    const priced = tailoredPrice({ cost: 1200, weight: 8 }, dress);
    // $1,200 x 0.2875 x 2/3 x 20, and 8 lbs. x 0.2875 x 2/3.
    expect(priced.cost).toBe(4600);
    expect(priced.weight).toBe(1.53);
    expect(tailoredDr(18, "light")).toBe(12);
    expect(tailoredDr(6, "light")).toBe(4);
    expect(tailoredLc(3, "light")).toBe(4);
    expect(tailoredLc(0, "heavy")).toBe(0);
  });

  it("puts the vitals with the torso and the eyes with the face", () => {
    expect(partAt("vitals")).toBe("torso");
    expect(partAt("eye")).toBe("face");
    expect(partAt("tail")).toBeNull();
  });

  it("rolls for half and skimpy coverage, and reads the arc for front and back", () => {
    expect(coverageActivation("half")).toBe(11);
    expect(coverageActivation("skimpy")).toBe(8);
    expect(coverageActivation("full")).toBeNull();
    expect(coversArc("front", "back")).toBe(false);
    expect(coversArc("front", null)).toBe(true);
    expect(coversArc("back", "back")).toBe(true);
    expect(coversArc("frontHalf", "side")).toBe(false);
    expect(coverageActivation("backHalf")).toBe(11);
  });
});

describe("armour systems (pp. 187-190)", () => {
  it("doubles or triples EMA, and spends a use only on a blow stopped thanks to it", () => {
    expect(emaMultiplier("standard")).toBe(2);
    expect(emaMultiplier("laminate")).toBe(3);
    // DR 100 doubled to 200: 150 stopped only thanks to the doubling.
    expect(emaUseSpent({ penetrating: 0, basicDamage: 150, effectiveDr: 200, pieceDr: 100, multiplier: 2, divisor: 1 })).toBe(true);
    expect(emaUseSpent({ penetrating: 0, basicDamage: 80, effectiveDr: 200, pieceDr: 100, multiplier: 2, divisor: 1 })).toBe(false);
    expect(emaUseSpent({ penetrating: 5, basicDamage: 205, effectiveDr: 200, pieceDr: 100, multiplier: 2, divisor: 1 })).toBe(false);
  });

  it("gives reactive paste its DR by TL and against shaped charges, and a chance to cover again", () => {
    expect(reactivePasteDr(10, false)).toBe(20);
    expect(reactivePasteDr(11, false)).toBe(30);
    expect(reactivePasteDr(12, true)).toBe(400);
    expect(pasteCovers(0, 1)).toBe(true);
    expect(pasteCovers(2, 3)).toBe(true);
    expect(pasteCovers(2, 2)).toBe(false);
  });

  it("prices adaptive armour by the square of its types, and adapts to what hurt it", () => {
    expect(adaptivePrice(1, 30)).toBe(30000);
    expect(adaptivePrice(3, 10)).toBe(90000);
    expect(adaptTo(["laser"], "graser", 1, { penetrating: 3, basicDamage: 40, effectiveDr: 37 })).toEqual(["graser"]);
    expect(adaptTo(["laser"], "graser", 2, { penetrating: 0, basicDamage: 20, effectiveDr: 37 })).toEqual(["graser", "laser"]);
    expect(adaptTo(["laser"], "graser", 2, { penetrating: 0, basicDamage: 10, effectiveDr: 37 })).toBeNull();
    expect(adaptTo(["laser"], "laser", 2, { penetrating: 9, basicDamage: 50, effectiveDr: 37 })).toBeNull();
  });

  it("wears ablative foam away a point a point", () => {
    expect(foamLeft(8, 3)).toBe(5);
    expect(foamLeft(2, 9)).toBe(0);
  });

  it("weakens nasal plugs after four hours and gives a mind shield its TL-6", () => {
    expect(nasalPlugBonus(3)).toBe(5);
    expect(nasalPlugBonus(6)).toBe(4);
    expect(nasalPlugBonus(9)).toBe(3);
    expect(nasalPlugBonus(10)).toBe(0);
    expect(mindShieldBonus(10)).toBe(4);
  });

  it("finds biomedical sensors built into suits", () => {
    expect(hasBiomedicalSensors("Nanoweave Tacsuit")).toBe(true);
    expect(hasBiomedicalSensors("Space Armor (TL11)")).toBe(true);
    expect(hasBiomedicalSensors("Skinsuit")).toBe(false);
  });
});

describe("suits' own details (#299)", () => {
  it("hardens a warsuit more against shaped charges and plasma (p. 186)", () => {
    expect(WARSUIT_HARDENED).toEqual({ all: 1, shapedOrPlasma: 3 });
  });

  it("knows the gills and the dreadnought's reactor (pp. 177-178, 185)", () => {
    expect(breathesUnderwater("Gill Suit")).toBe(true);
    expect(breathesUnderwater("Air Mask")).toBe(false);
    expect(reactorSpoilsInfrared("Dreadnought Battlesuit")).toBe(true);
    expect(reactorSpoilsInfrared("Heavy Battlesuit")).toBe(false);
  });
});

describe("self-repairing armour (#329)", () => {
  it("regains a point each period", async () => {
    const { SELF_REPAIR, selfRepairPoints } = await import("./rules.js");
    expect(selfRepairPoints(13, SELF_REPAIR.bioplasHoursPerHp)).toBe(2);
    expect(selfRepairPoints(3, SELF_REPAIR.livingMetalHoursPerPoint)).toBe(3);
    expect(selfRepairPoints(0, 1)).toBe(0);
  });
});
