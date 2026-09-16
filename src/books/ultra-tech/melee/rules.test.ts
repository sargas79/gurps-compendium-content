import { describe, expect, it } from "vitest";

import {
  bladeBlow,
  bladeMinSt,
  bladePrice,
  bladeProblems,
  chargedByName,
  chargesPerStrike,
  clampReach,
  damageDelta,
  forceBladeHarms,
  forceWeaponByName,
  limpetRemovalPenalty,
  longestReach,
  neurolashFactor,
  neurolashSettingAllowed,
  reachText,
  rocketStrikerFits,
  rocketStrikerUses,
  shortestReach,
  stunnerDrBonus,
  vibroSeconds,
} from "./rules.js";

const sword = { blade: "" as const, vibro: false, damageTypes: ["cut", "imp"], monowireWeapon: false };

describe("blades (Ultra-Tech pp. 163-164)", () => {
  it("refuses what the book forbids", () => {
    expect(bladeProblems({ ...sword, blade: "superfine" })).toEqual([]);
    expect(bladeProblems({ ...sword, damageTypes: ["cr"], blade: "superfine" })).toEqual(["notEdged"]);
    expect(bladeProblems({ ...sword, damageTypes: ["imp"], blade: "monowire" })).toEqual(["notCutting"]);
    expect(bladeProblems({ ...sword, blade: "monowire", vibro: true })).toEqual(["vibroMonowire"]);
    expect(bladeProblems({ ...sword, blade: "nanothorn", vibro: true })).toEqual(["vibroNanothorn"]);
    expect(bladeProblems({ ...sword, damageTypes: ["cr"], vibro: true })).toEqual(["notEdged"]);
  });

  it("prices each blade", () => {
    expect(bladePrice({ ...sword, blade: "superfine" }, { cost: 500, weight: 3 })).toEqual({ cost: 3000, weight: 3 });
    expect(bladePrice({ ...sword, vibro: true }, { cost: 500, weight: 3 })).toEqual({ cost: 5000, weight: 3 });
    expect(bladePrice({ ...sword, blade: "superfine", vibro: true }, { cost: 500, weight: 3 })).toEqual({ cost: 15000, weight: 3 });
    expect(bladePrice({ ...sword, blade: "monowire" }, { cost: 500, weight: 3 })).toEqual({ cost: 5000, weight: 3 });
    expect(bladePrice({ ...sword, blade: "nanothorn" }, { cost: 500, weight: 3 })).toEqual({ cost: 10000, weight: 3 });
    expect(bladePrice({ ...sword, blade: "nanothorn", monowireWeapon: true }, { cost: 900, weight: 0.5 })).toEqual({ cost: 3600, weight: 0.5 });
  });

  it("prices a hyperdense blade by weight or tenfold, and makes it heavier and harder to wield", () => {
    expect(bladePrice({ ...sword, blade: "hyperdense" }, { cost: 500, weight: 3 })).toEqual({ cost: 5000, weight: 4.5 });
    expect(bladePrice({ ...sword, blade: "hyperdense" }, { cost: 40, weight: 1 })).toEqual({ cost: 500, weight: 1.5 });
    expect(bladeMinSt(10, "hyperdense")).toBe(15);
    expect(bladeMinSt(7, "hyperdense")).toBe(11);
    expect(bladeMinSt(7, "superfine")).toBe(7);
  });

  it("changes a blow", () => {
    expect(bladeBlow({ damageType: "cut", armorDivisor: 1 }, "superfine", false, 9)).toEqual({ damageType: "cut", armorDivisor: 2, dice: 0, adds: 2 });
    expect(bladeBlow({ damageType: "imp", armorDivisor: 1 }, "monowire", false, 9)).toEqual({ damageType: "imp", armorDivisor: 1, dice: 0, adds: 0 });
    expect(bladeBlow({ damageType: "cut", armorDivisor: 1 }, "nanothorn", false, 11)).toEqual({ damageType: "cor", armorDivisor: 10, dice: 0, adds: 0 });
    expect(bladeBlow({ damageType: "cr", armorDivisor: 1 }, "superfine", true, 12)).toEqual({ damageType: "cr", armorDivisor: 1, dice: 0, adds: 0 });
  });

  it("adds a vibro edge's die and divisor", () => {
    expect(bladeBlow({ damageType: "cut", armorDivisor: 1 }, "", true, 10)).toEqual({ damageType: "cut", armorDivisor: 3, dice: 1, adds: 0 });
    expect(bladeBlow({ damageType: "cut", armorDivisor: 1 }, "superfine", true, 11)).toEqual({ damageType: "cut", armorDivisor: 5, dice: 1, adds: 3 });
    expect(bladeBlow({ damageType: "imp", armorDivisor: 1 }, "hyperdense", true, 12)).toEqual({ damageType: "imp", armorDivisor: 10, dice: 0, adds: 2 });
    expect(bladeBlow({ damageType: "cut", armorDivisor: 1 }, "", false, 12)).toEqual({ damageType: "cut", armorDivisor: 1, dice: 0, adds: 0 });
    expect(vibroSeconds(0.5)).toBe(600);
  });
});

describe("rocket strikers (Ultra-Tech p. 163)", () => {
  it("has six boosts at TL9, doubling", () => {
    expect(rocketStrikerUses(9)).toBe(6);
    expect(rocketStrikerUses(11)).toBe(24);
  });

  it("fits axes, picks, spears and polearms", () => {
    expect(rocketStrikerFits(["Two-Handed Axe/Mace"])).toBe(true);
    expect(rocketStrikerFits(["Spear"])).toBe(true);
    expect(rocketStrikerFits(["Broadsword"])).toBe(false);
  });

  it("works out the dice six more ST adds", () => {
    expect(damageDelta({ dice: 1, adds: 2 }, { dice: 2, adds: 1 })).toEqual({ dice: 1, adds: -1 });
  });
});

describe("reach (Ultra-Tech pp. 163-166)", () => {
  it("reads a reach column", () => {
    expect(longestReach("C-5")).toBe(5);
    expect(shortestReach("C-5")).toBe(0);
    expect(longestReach("1-7*")).toBe(7);
    expect(shortestReach("1-7*")).toBe(1);
    expect(clampReach(9, "1-7*")).toBe(7);
    expect(clampReach(0, "1-7*")).toBe(1);
    expect(reachText(0, false)).toBe("C");
    expect(reachText(4, true)).toBe("4*");
  });
});

describe("contact weapons (Ultra-Tech p. 165)", () => {
  it("knows the charged weapons and what a strike spends", () => {
    expect(chargedByName("Electric Stun Wand")).toBe("stunWand");
    expect(chargedByName("Zap Glove")).toBe("zapGlove");
    expect(chargedByName("Neurolash Baton")).toBe("neurolash");
    expect(chargedByName("Neuroglove")).toBe("neuroglove");
    expect(chargedByName("Broadsword")).toBe(null);
    expect(chargesPerStrike("zapGlove", true)).toBe(2);
    expect(chargesPerStrike("stunWand", true)).toBe(1);
  });

  it("gives nonmetallic armour +2 a point against a stunner", () => {
    expect(stunnerDrBonus(3)).toBe(6);
    expect(stunnerDrBonus(0)).toBe(0);
  });

  it("prices tunable settings and keeps death to high power", () => {
    expect(neurolashFactor(1)).toBe(1);
    expect(neurolashFactor(3)).toBe(2);
    expect(neurolashSettingAllowed("deathBeam", false)).toBe(false);
    expect(neurolashSettingAllowed("deathBeam", true)).toBe(true);
    expect(neurolashSettingAllowed("agony", false)).toBe(true);
  });
});

describe("limpet mines and force swords (Ultra-Tech pp. 163, 166)", () => {
  it("takes a tenth of DR, at most 20, off pulling a mine loose", () => {
    expect(limpetRemovalPenalty(35)).toBe(-3);
    expect(limpetRemovalPenalty(500)).toBe(-20);
    expect(limpetRemovalPenalty(0)).toBe(0);
  });

  it("knows the force weapons", () => {
    expect(forceWeaponByName("Force Sword")).toBe("forceSword");
    expect(forceWeaponByName("Stasis Switchblade")).toBe("stasisSwitchblade");
    expect(forceWeaponByName("Force Sword Hilt")).toBe(null);
  });

  it("harms what it parries, and what parries it short of a critical", () => {
    expect(forceBladeHarms({ otherIsForceOrSonic: false, criticalDefense: false, parriedByTheForceBlade: false })).toBe(true);
    expect(forceBladeHarms({ otherIsForceOrSonic: false, criticalDefense: true, parriedByTheForceBlade: false })).toBe(false);
    expect(forceBladeHarms({ otherIsForceOrSonic: false, criticalDefense: true, parriedByTheForceBlade: true })).toBe(true);
    expect(forceBladeHarms({ otherIsForceOrSonic: true, criticalDefense: false, parriedByTheForceBlade: true })).toBe(false);
  });
});
