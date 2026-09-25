import { describe, expect, it } from "vitest";

import { averageStartingWealth } from "../../../../system/src/rules/index.js";
import * as engine from "../../../shared/gadgets/rules.js";
import { NO_OPTIONS, type GadgetOptions } from "../../../shared/gadgets/rules.js";
import {
  HIGH_TECH_GADGETS as HT,
  bondedName,
  combineGadgets,
  combinedEndurance,
  equipmentBonusLines,
  loadedAmmoWeight,
  familiarityOffset,
  sharedBatteryEndurance,
} from "./rules.js";

const options = (patch: Partial<GadgetOptions> = {}): GadgetOptions => ({ ...NO_OPTIONS, ...patch });

describe("equipment options (High-Tech pp. 9-10)", () => {
  it("doubles a mass-produced disguise and quintuples a custom one", () => {
    expect(engine.costFactor(HT, options({ disguise: "massProduced" }))).toBe(2);
    expect(engine.costFactor(HT, options({ disguise: "custom" }))).toBe(5);
  });

  it("prices styling in three tiers, each with its reaction bonus", () => {
    expect(engine.stylingCost(HT, 0)).toBe(1);
    expect([2, 5, 10].map((s) => engine.stylingCost(HT, s))).toEqual([2, 5, 10]);
    expect([2, 5, 10].map((s) => engine.stylingReaction(HT, s))).toEqual([1, 2, 3]);
    // A multiplier between tiers is the tier it reaches.
    expect(engine.stylingCost(HT, 4)).toBe(2);
    expect(engine.stylingReaction(HT, 4)).toBe(1);
    expect(engine.stylingReaction(HT, 1)).toBe(0);
  });

  it("builds rugged at twice the price and a fifth more weight", () => {
    expect(engine.gadgetPrice(HT, { listCost: 100, listWeight: 5, options: options({ rugged: true }) })).toMatchObject({ cost: 200, weight: 6 });
  });

  it("builds cheap either clunky or fragile, both at half the price", () => {
    // Clunky: half again the weight, the batteries left out of it.
    expect(engine.gadgetPrice(HT, { listCost: 200, listWeight: 4, cellWeight: 2, options: options({ grade: "cheap" }) })).toMatchObject({ cost: 100, weight: 5 });
    // Fragile: the same weight, -2 HT and half the DR.
    expect(engine.gadgetPrice(HT, { listCost: 200, listWeight: 4, options: options({ grade: "fragile" }) })).toMatchObject({ cost: 100, weight: 4 });
    expect(engine.gadgetHealth(HT, { grade: "fragile" })).toBe(8);
    expect(engine.gadgetDr(HT, { build: "plastic", grade: "fragile" })).toBe(1);
    expect(engine.gadgetDr(HT, { build: "weapon", grade: "fragile" })).toBe(2);
  });

  it("builds expensive at twice the price and two thirds the weight", () => {
    expect(engine.gadgetPrice(HT, { listCost: 300, listWeight: 3, options: options({ grade: "expensive" }) })).toMatchObject({ cost: 600, weight: 2 });
  });

  it("multiplies the options together: expensive and styled", () => {
    expect(engine.costFactor(HT, options({ grade: "expensive", styling: 5 }))).toBe(10);
  });

  it("keeps rugged, cheap and expensive off clothing, weapons and armour, but not disguise or styling", () => {
    const built = options({ rugged: true, grade: "expensive", disguise: "custom", styling: 2 });
    expect(engine.takesBuildOptions(HT, [])).toBe(true);
    for (const kind of ["clothing", "weapon", "armor"] as const) {
      expect(engine.takesBuildOptions(HT, [kind])).toBe(false);
      expect(engine.allowedOptions(HT, built, [kind])).toEqual({ ...built, rugged: false, grade: "" });
    }
    expect(engine.allowedOptions(HT, built, [])).toEqual(built);
  });

  it("offers the fragile grade in High-Tech's table", () => {
    expect(engine.gradesOf(HT)).toEqual(["", "cheap", "fragile", "expensive"]);
  });
});

describe("HP, HT and DR (High-Tech p. 11)", () => {
  it("assumes HT 10, 12 rugged, and adds good and fine quality on top: a rugged, fine radio is HT 14", () => {
    expect(engine.gadgetHealth(HT, {})).toBe(10);
    expect(engine.gadgetHealth(HT, { rugged: true })).toBe(12);
    expect(engine.gadgetHealth(HT, { quality: "good" })).toBe(11);
    expect(engine.gadgetHealth(HT, { rugged: true, quality: "fine" })).toBe(14);
    expect(engine.gadgetHealth(HT, { quality: "basic" })).toBe(10);
  });

  it("assumes DR 2, 4 for a weapon and 6 for solid-metal melee, doubled rugged", () => {
    expect(engine.gadgetDr(HT, { build: "plastic" })).toBe(2);
    expect(engine.gadgetDr(HT, { build: "weapon" })).toBe(4);
    expect(engine.gadgetDr(HT, { build: "solidMelee", rugged: true })).toBe(12);
  });
});

describe("maintenance (High-Tech p. 9)", () => {
  it("is a thousandth of the TL's average starting wealth: $5 at TL5 to $20 at TL8", () => {
    expect([5, 6, 7, 8].map((tl) => engine.maintenanceThreshold(HT, tl, averageStartingWealth))).toEqual([5, 10, 15, 20]);
    expect(engine.needsMaintenanceChecks(HT, { cost: 20, tl: 8 }, averageStartingWealth)).toBe(true);
    expect(engine.needsMaintenanceChecks(HT, { cost: 19, tl: 8 }, averageStartingWealth)).toBe(false);
  });

  it("has no threshold without the starting wealth to take it from", () => {
    expect(engine.maintenanceThreshold(HT, 8)).toBeNull();
  });
});

describe("adjusting for SM (High-Tech p. 10)", () => {
  it("follows the table and scales the power too", () => {
    expect([-4, -3, -2, -1, 0, 1, 2, 3, 10].map((sm) => engine.smFactor(HT, sm))).toEqual([1 / 20, 1 / 10, 1 / 5, 1 / 2, 1, 2, 5, 10, 2000]);
    expect(HT.smScalesCells).toBe(true);
  });
});

describe("legality and antiques (High-Tech p. 8)", () => {
  it("raises the Gatling gun, LC2 at TL5, to LC3 at TL8", () => {
    expect(engine.antiqueLegality(HT, { lc: 2, tl: 5, campaignTl: 8 })).toEqual({ lc: 3, steps: 1 });
  });

  it("rises two at most, never past LC4, and not for gear two TLs short of obsolete", () => {
    expect(engine.antiqueLegality(HT, { lc: 1, tl: 2, campaignTl: 8 })).toEqual({ lc: 3, steps: 2 });
    expect(engine.antiqueLegality(HT, { lc: 3, tl: 2, campaignTl: 8 })).toEqual({ lc: 4, steps: 1 });
    expect(engine.antiqueLegality(HT, { lc: 1, tl: 7, campaignTl: 8 })).toEqual({ lc: 1, steps: 0 });
  });

  it("keeps chemical, biological and nuclear weapons controlled", () => {
    expect(engine.antiqueLegality(HT, { lc: 0, tl: 5, campaignTl: 8, controlled: true })).toEqual({ lc: 0, steps: 0 });
  });
});

describe("combination gadgets (High-Tech p. 10)", () => {
  const gps = { name: "GPS", cost: 200, weight: 1, cellWeight: 0.1, lc: 4, tl: 8 };
  const pda = { name: "PDA", cost: 100, weight: 0.5, cellWeight: 0.1, lc: null, tl: 8 };
  const thermograph = { name: "Thermograph", cost: 1000, weight: 3, cellWeight: 0.33, lc: 3, tl: 7 };

  it("keeps the heaviest and costliest in full and 80% of the rest where all work at once", () => {
    const made = combineGadgets([gps, pda, thermograph], true);
    // Empty weights 0.9, 0.4 and 2.67: 2.67 + 0.8 x 1.3.
    expect(made.emptyWeight).toBe(3.71);
    expect(made.cost).toBe(1000 + 0.8 * 300);
    // One set of batteries, the heaviest carried.
    expect(made.cellWeight).toBe(0.33);
    expect(made.weight).toBe(4.04);
    expect(made.lc).toBe(3);
    expect(made.tl).toBe(8);
  });

  it("keeps 50% of the rest where one works at a time", () => {
    const made = combineGadgets([gps, thermograph], false);
    expect(made.cost).toBe(1100);
    expect(made.emptyWeight).toBe(3.12);
  });

  it("has no LC where no part has one", () => {
    expect(combineGadgets([pda, pda], true).lc).toBeNull();
  });

  it("leaves out each part's loaded ammunition, and puts it back: every weapon keeps its own (p. 10)", () => {
    const pistol = { name: "Pistol", cost: 500, weight: 2.5, cellWeight: 0, ammoWeight: 0.5, lc: 3, tl: 7 };
    const light = { name: "Tactical Light", cost: 100, weight: 1, cellWeight: 0.33, lc: 4, tl: 8 };
    const made = combineGadgets([pistol, light], true);
    // Empty weights 2 and 0.67: 2 + 0.8 x 0.67, then the battery and the magazine.
    expect(made.emptyWeight).toBe(2.54);
    expect(made.ammoWeight).toBe(0.5);
    expect(made.weight).toBe(3.37);
  });

  it("reads a weapon's loaded ammunition from its reload weight, else its magazine at the calibre's weight per shot", () => {
    expect(loadedAmmoWeight([{ reloadWeight: 0.4, shots: "15+1(3)" }], 0.03)).toBe(0.4);
    expect(loadedAmmoWeight([{ reloadWeight: 0, shots: "30+1(3)" }, { reloadWeight: 0, shots: "30(3)" }], 0.026)).toBe(0.78);
    expect(loadedAmmoWeight([{ shots: "T(1)" }], null)).toBe(0);
  });

  it("counts the shared batteries down for the hungriest part", () => {
    expect(combinedEndurance([{ hours: 33 }, { hours: 5 }])).toBe(5);
    expect(combinedEndurance([])).toBeNull();
  });

  it("runs a part off another battery in proportion to the batteries' weights", () => {
    // An S battery is 3.3 times an XS battery's weight, so 3.3 times as long.
    expect(sharedBatteryEndurance(10, 0.1, 0.33)).toBe(33);
    expect(sharedBatteryEndurance(10, 0, 0.33)).toBe(10);
  });
});

describe("equipment bonuses (High-Tech pp. 7, 11)", () => {
  it("reads the bonded gear off the perk's specialty or its name", () => {
    expect(bondedName({ name: "Equipment Bond", system: { specialty: "Lockpicks" } })).toBe("Lockpicks");
    expect(bondedName({ name: "Equipment Bond (Medical Kit)" })).toBe("Medical Kit");
    expect(bondedName({ name: "Equipment Bond" })).toBeNull();
    expect(bondedName({ name: "Weapon Bond (Colt)" })).toBeNull();
  });

  it("adds the best intrinsic bonus and +1 for the bonded tool", () => {
    const tools = [{ name: "Scope", intrinsic: 1 }, { name: "Medical Kit", intrinsic: 2 }];
    expect(equipmentBonusLines(tools, ["medical kit"])).toEqual({ intrinsic: { name: "Medical Kit", value: 2 }, bond: { name: "Medical Kit", value: 1 } });
    expect(equipmentBonusLines([{ name: "Scope", intrinsic: 0 }], [])).toEqual({ intrinsic: null, bond: null });
  });
});

describe("TL penalties as unfamiliarity (High-Tech p. 11)", () => {
  it("keeps the TL penalty while unfamiliar, and lifts it once familiar: the canoe", () => {
    // Boating/TL6 on a TL0 canoe: -6, and nothing once Locke knows it.
    expect(familiarityOffset({ techLevel: -6, unfamiliar: 0, familiar: false })).toBe(0);
    expect(familiarityOffset({ techLevel: -6, unfamiliar: 0, familiar: true })).toBe(6);
  });

  it("folds the familiarity rule's -2 into the TL penalty, the larger of the two", () => {
    expect(familiarityOffset({ techLevel: -6, unfamiliar: -2, familiar: false })).toBe(2);
    expect(familiarityOffset({ techLevel: -1, unfamiliar: -2, familiar: false })).toBe(1);
  });

  it("changes nothing without a TL penalty", () => {
    expect(familiarityOffset({ techLevel: 0, unfamiliar: -2, familiar: false })).toBe(0);
  });
});
