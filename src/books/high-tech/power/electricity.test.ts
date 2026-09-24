/**
 * The Electricity and Electronics supplement's power (HT:EE pp. 9, 16-18):
 * battery chemistries on High-Tech's table, energy storage, the supplement's
 * generators, and the grades of external power.
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { CELL_TABLES, cellPrice, enduranceLeft, powerPriceChange } from "../../../shared/power/index.js";
import { isPluggable, isPowered, loadedCellWeight, powerData } from "../../../shared/power/data.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ultraTechCells } from "../../ultra-tech/power/index.js";
import { BATTERIES_RULE, CHEMISTRY_RULE, EXTERNAL_POWER_RULE, HIGH_TECH_BATTERIES, generatorShown, highTechBatteries, hoursToRecharge } from "./index.js";
import { CHEMISTRIES, batteryInChemistry, chargerExplosion, chemistryFactors, runawayDamage, runsAway } from "./chemistry.js";
import { batteryRecordPrice, batterySizeOf, flywheelRecordPrice, registerChemistryVariant } from "./electricity.js";
import { GENERATORS, rechargeHours, rechargedShare } from "./generators.js";
import { gradesOf } from "./grades.js";
import { capacitorBankModifier, flywheelFigures, flywheelPrice, supercapacitorStandsFor } from "./storage.js";

const UT_RULE = `${MODULE_ID}.powerCells`;

const gear = (book: string | null, power: Record<string, unknown>, name = "Gadget", tl = "8") => ({
  type: "equipment",
  name,
  system: { tl, cost: 100, weight: 5, extensions: { [MODULE_ID]: { power } } },
  flags: book ? { [MODULE_ID]: { book } } : {},
});

/** Switches on exactly these keys. */
function only(...keys: string[]) {
  const on = new Set(keys);
  setRuleReader((k) => on.has(k));
}

const switches = (...keys: string[]) => {
  const on = new Set(keys);
  return { chemistry: () => on.has("chemistry"), storage: () => on.has("storage"), external: () => on.has("external"), batteries: () => on.has("batteries") };
};

// The chemistry variant, as High-Tech's init registers it.
registerChemistryVariant(HIGH_TECH_BATTERIES, CHEMISTRY_RULE);

beforeEach(() => {
  CELL_TABLES.register(ultraTechCells(UT_RULE));
  CELL_TABLES.register(highTechBatteries());
});

afterEach(() => {
  CELL_TABLES.clear();
  setRuleReader(() => false);
});

describe("battery chemistries against High-Tech's table (HT:EE pp. 16-18)", () => {
  it("takes the printed size back to alkaline first: High-Tech's L and VL are lead-acid", () => {
    // An alkaline L is the supplement's $15, 15 lbs., lasting three times as long as a lead-acid one.
    expect(chemistryFactors("L", "alkaline")).toMatchObject({ cost: 1.5, weight: 1.5, endurance: 3, rechargeable: false });
    expect(batteryInChemistry("L", "alkaline", { cost: 10, weight: 10 })).toEqual({ cost: 15, weight: 15 });
    expect(batteryInChemistry("VL", "alkaline", { cost: 20, weight: 50 })).toEqual({ cost: 30, weight: 75 });
    // Lead-acid is what the L already is: nothing changes.
    expect(batteryInChemistry("L", "leadAcid", { cost: 10, weight: 10 })).toBeNull();
  });

  it("scales T to M as alkaline, M included (High-Tech's 2 lbs. stays)", () => {
    expect(chemistryFactors("S", "carbonZinc")).toMatchObject({ endurance: 0.25, cost: 0.9, weight: 0.9 });
    expect(batteryInChemistry("M", "leadAcid", { cost: 5, weight: 2 })).toEqual({ cost: 3.33, weight: 1.333 });
    expect(chemistryFactors("M", "lithiumIon")).toMatchObject({ endurance: 1.1, cost: 1.2, weight: 1, rechargeable: true });
    expect(chemistryFactors("XS", "nicad")).toMatchObject({ endurance: 1 / 3, cost: 2, weight: 1, rechargeable: true });
    expect(chemistryFactors("XS", "nimh")).toMatchObject({ endurance: 1, cost: 2 });
    expect(chemistryFactors("XS", "wetCell")).toMatchObject({ endurance: 0.25, cost: 1, weight: 1, rechargeable: false });
    expect(chemistryFactors("XS", "")).toBeNull();
    expect(chemistryFactors("B", "alkaline")).toBeNull();
  });

  it("prints the TL each came on the market", () => {
    expect(CHEMISTRIES.leadAcid.tl).toBe(6);
    expect(CHEMISTRIES.lithiumIon.tl).toBe(8);
  });

  it("reprices one of High-Tech's battery records, under its own switch", () => {
    const battery = gear("high-tech", { chemistry: "alkaline" }, "L Battery");
    expect(batterySizeOf(battery, HIGH_TECH_BATTERIES)).toBe("L");
    expect(batteryRecordPrice(battery, HIGH_TECH_BATTERIES, { cost: 10, weight: 10 }, switches())).toBeNull();
    expect(batteryRecordPrice(battery, HIGH_TECH_BATTERIES, { cost: 10, weight: 10 }, switches("chemistry"))).toEqual({ cost: 15, weight: 15, label: "Chemistry" });
    // Another book's record of the same name is left alone.
    expect(batterySizeOf(gear("ultra-tech", {}, "L Battery"), HIGH_TECH_BATTERIES)).toBeNull();
  });

  it("gives a gadget's batteries the chemistry's endurance, weight, price and recharging", () => {
    const radio = gear("high-tech", { draw: { cell: "S", cells: 2, endurance: "10 hrs." }, chemistry: "nicad" });
    only(BATTERIES_RULE);
    expect(powerData(radio).variant).toBeNull();
    only(BATTERIES_RULE, CHEMISTRY_RULE);
    const data = powerData(radio);
    expect(data.enduranceFactor).toBeCloseTo(1 / 3);
    expect(enduranceLeft(data)).toMatchObject({ total: expect.closeTo(10 / 3, 5) });
    expect(data.rechargeable).toBe(true);
    // A NiCad costs twice an alkaline, in place of High-Tech's five times for rechargeables.
    expect(cellPrice(HIGH_TECH_BATTERIES, "S", data)).toBe(2);
    expect(powerPriceChange(radio)).toBeNull();
    // An L gadget made alkaline carries half as much again in battery weight.
    const lamp = gear("high-tech", { draw: { cell: "L", cells: 1, endurance: "8 hrs." }, chemistry: "alkaline" });
    expect(powerData(lamp).enduranceFactor).toBeCloseTo(3);
    expect(powerPriceChange(lamp)).toEqual({ cost: 0, weight: 5 });
    // The batteries it holds, as the gadget options and combinations count them, weigh the same half again (#549).
    expect(loadedCellWeight(lamp)).toBe(15);
    only(BATTERIES_RULE);
    expect(loadedCellWeight(lamp)).toBe(10);
  });

  it("leaves Ultra-Tech's cells alone, whatever the field says", () => {
    only(UT_RULE, CHEMISTRY_RULE);
    const medic = gear("ultra-tech", { draw: { cell: "B", cells: 1, endurance: "10 hr." }, chemistry: "nicad" }, "Gadget", "9");
    expect(powerData(medic).variant).toBeNull();
    expect(powerData(medic).enduranceFactor).toBe(1);
  });

  it("runs a lithium-ion battery away from a short, or on a failed HT roll; 3d, a large area from M up", () => {
    expect(runsAway("short", null)).toBe(true);
    expect(runsAway("crushed", true)).toBe(false);
    expect(runsAway("overcharged", false)).toBe(true);
    expect(runawayDamage("S", HIGH_TECH_BATTERIES.sizes)).toEqual({ formula: "3d", largeArea: false });
    expect(runawayDamage("M", HIGH_TECH_BATTERIES.sizes)).toEqual({ formula: "3d", largeArea: true });
  });

  it("blows up a car battery on the high setting's critical failure: 6d, or 6dx3 for the larger one", () => {
    expect(chargerExplosion("L")).toEqual({ formula: "6d", acidYards: 1 });
    expect(chargerExplosion("VL")).toEqual({ formula: "6dx3", acidYards: 3 });
  });
});

describe("energy storage (HT:EE pp. 17-18)", () => {
  const ssr = (yards: number) => rules.speedRangeModifier(yards);

  it("makes a bank of capacitors' shock worse: -2 for two, then the Speed/Range penalty for the count", () => {
    expect(capacitorBankModifier(-4, 1, ssr)).toBe(-4);
    expect(capacitorBankModifier(-4, 2, ssr)).toBe(-6);
    expect(capacitorBankModifier(-4, 3, ssr)).toBe(-4 - 2 + ssr(3));
    expect(capacitorBankModifier(0, 10, ssr)).toBe(-2 + ssr(10));
    expect(ssr(10)).toBeLessThan(ssr(3));
  });

  it("prices a supercapacitor at twenty times an alkaline battery of its size, with the next size's output", () => {
    const s = gear("high-tech", { chemistry: "supercapacitor" }, "S Battery");
    expect(batteryRecordPrice(s, HIGH_TECH_BATTERIES, { cost: 1, weight: 0.33 }, switches("chemistry"))).toBeNull();
    expect(batteryRecordPrice(s, HIGH_TECH_BATTERIES, { cost: 1, weight: 0.33 }, switches("storage"))).toEqual({ cost: 20, weight: 0.33, label: "Supercapacitor" });
    expect(batteryRecordPrice(gear("high-tech", { chemistry: "supercapacitor" }, "L Battery"), HIGH_TECH_BATTERIES, { cost: 10, weight: 10 }, switches("storage"))).toEqual({ cost: 300, weight: 15, label: "Supercapacitor" });
    expect(supercapacitorStandsFor("M", HIGH_TECH_BATTERIES.sizes)).toBe("L");
    expect(supercapacitorStandsFor("VL", HIGH_TECH_BATTERIES.sizes)).toBeNull();
  });

  it("reprices a flywheel by its material, L and VL only for steel and titanium", () => {
    expect(flywheelPrice("L", "steel", { cost: 7500, weight: 15 })).toEqual({ cost: 2500, weight: 67.5 });
    expect(flywheelPrice("VL", "titanium", { cost: 37500, weight: 75 })).toEqual({ cost: 25000, weight: 225 });
    expect(flywheelPrice("M", "steel", { cost: 500, weight: 1.5 })).toBeNull();
    expect(flywheelPrice("L", "", { cost: 7500, weight: 15 })).toBeNull();
    expect(flywheelFigures("M", "")).toMatchObject({ energy: 2 / 3, peak: 60, grade: "household", minutes: 2 });
    expect(flywheelFigures("L", "titanium")).toMatchObject({ energy: 4 / 3, peak: 100, grade: "industrial" });
    const wheel = gear("high-tech", { storage: { kind: "flywheel", size: "L", material: "steel" } }, "Large Flywheel");
    expect(flywheelRecordPrice(wheel, { cost: 7500, weight: 15 }, switches())).toBeNull();
    expect(flywheelRecordPrice(wheel, { cost: 7500, weight: 15 }, switches("storage"))).toEqual({ cost: 2500, weight: 67.5 });
  });

  it("recharges at the supplement's rates: the printed size, or the nearest by weight", () => {
    const weight = (size: string) => HIGH_TECH_BATTERIES.cells[size]!.weight;
    const crank = GENERATORS["Hand Crank Generator"]!.ee!.recharges;
    expect(rechargeHours(crank, { size: "XS", cells: 1 }, HIGH_TECH_BATTERIES.sizes, weight)).toBe(1);
    expect(rechargeHours(crank, { size: "S", cells: 2 }, HIGH_TECH_BATTERIES.sizes, weight)).toBe(6);
    expect(rechargeHours(crank, { size: "M", cells: 1 }, HIGH_TECH_BATTERIES.sizes, weight)).toBeCloseTo(3 * 2 / 0.33);
    expect(hoursToRecharge(GENERATORS["Portable Solar Panel"]!.ee!.recharges, { size: "L", cells: 1 })).toBe(24);
    expect(rechargeHours(undefined, { size: "L", cells: 1 }, HIGH_TECH_BATTERIES.sizes, weight)).toBeNull();
    expect(rechargedShare(3, 1.5)).toBe(0.5);
    expect(rechargedShare(3, 6)).toBe(1);
    expect(rechargedShare(null, 6)).toBe(0);
  });

  it("gives the TL8 wind generator twice the TL6 one's output, with no roll", () => {
    const tl6 = GENERATORS["Wind Generator (TL6)"]!.ee!;
    const tl8 = GENERATORS["Wind Generator (TL8)"]!.ee!;
    expect(tl6.wind!.high.recharges.VL).toBe(2);
    expect(tl8.wind!.high.recharges.VL).toBe(1);
    expect(tl6.skill).toBe("Machine Operation (Wind Generator)");
    expect(tl8.skill).toBeUndefined();
  });

  it("shows the supplement's generators under its own switch, High-Tech's under batteries", () => {
    expect(generatorShown(GENERATORS["Hand Crank Generator"]!, switches("batteries"))).toBe(false);
    expect(generatorShown(GENERATORS["Hand Crank Generator"]!, switches("storage"))).toBe(true);
    expect(generatorShown(GENERATORS.Windmill!, switches("storage"))).toBe(false);
    expect(generatorShown(GENERATORS["Semi-Portable Muscle-Powered Generator"]!, switches("batteries"))).toBe(true);
  });

  it("names only records the book's packs carry", () => {
    const files = ["high-tech-captured-core-general.json", "high-tech-by-hand.json", "high-tech-ee-laboratory-power.json", "high-tech-ee-laboratory-power-by-hand.json"];
    const records = files
      .flatMap((file) => JSON.parse(readFileSync(new URL(`../../../../books/high-tech/packs-src/equipment/${file}`, import.meta.url), "utf-8")) as Array<{ name: string }>)
      .map((r) => r.name);
    for (const name of Object.keys(GENERATORS)) expect(records).toContain(name);
    for (const name of ["Leyden Jar", "Medium Flywheel", "Large Flywheel", "Very Large Flywheel", "Voltaic Pile", "Car-Battery Recharger", "Compressed Hydrogen (8 hours)"]) expect(records).toContain(name);
  });
});

describe("the grades of external power (HT:EE p. 9)", () => {
  it("keeps the grades a record names, in the book's order", () => {
    expect(gradesOf(["industrial", "household", "nonsense"])).toEqual(["household", "industrial"]);
  });

  it("tracks built-in rechargeable batteries only under the switch", () => {
    const scope = gear("high-tech", { draw: { cell: "", cells: 0, endurance: "9 hours", raw: "rechargeable/9 hours" }, rechargeable: true });
    only(BATTERIES_RULE);
    expect(isPowered(powerData(scope))).toBe(false);
    only(BATTERIES_RULE, EXTERNAL_POWER_RULE);
    const data = powerData(scope);
    expect(data.builtIn).toBe(true);
    expect(isPowered(data)).toBe(true);
    expect(enduranceLeft(data)).toMatchObject({ total: 9, left: 9 });
  });

  it("lets a device printed with a grade be plugged in without an adapter", () => {
    const bell = gear("high-tech", { draw: { cell: "S", cells: 1, endurance: "200 hours" }, raw: "S/200 hours or household power", grades: ["household"], external: true });
    only(BATTERIES_RULE);
    expect(isPluggable(bell)).toBe(false);
    expect(powerData(bell).external).toBe(false);
    only(BATTERIES_RULE, EXTERNAL_POWER_RULE);
    expect(isPluggable(bell)).toBe(true);
    expect(enduranceLeft(powerData(bell))).toBe("unlimited");
    // Ultra-Tech's table prints no grades.
    only(UT_RULE, EXTERNAL_POWER_RULE);
    expect(isPluggable(gear("ultra-tech", { draw: { cell: "B", cells: 1, endurance: "1 hr." }, grades: ["household"] }, "Gadget", "9"))).toBe(false);
  });

  it("reads the grades the records carry", () => {
    const records = ["high-tech-ee-laboratory-power.json", "high-tech-ee-signals.json", "high-tech-captured-core-general.json"]
      .flatMap((file) => JSON.parse(readFileSync(new URL(`../../../../books/high-tech/packs-src/equipment/${file}`, import.meta.url), "utf-8")) as Array<{ name: string; system: any }>);
    const grades = (name: string) => records.find((r) => r.name === name)?.system.extensions?.[MODULE_ID]?.power?.grades;
    expect(grades("Microwave Oven")).toEqual(["household"]);
    expect(grades("Arc Welder")).toEqual(["industrial"]);
    expect(grades("DVD Player")).toEqual(["household"]);
  });
});
