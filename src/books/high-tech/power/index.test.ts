/**
 * High-Tech's batteries (pp. 10, 13-14) on the shared cell engine, behind the
 * book's own switch, and its generators, collectors and fuels (pp. 14-16).
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { CELL_TABLES, cellTableOf, enduranceLeft, powerPriceChange, recharge, tableForInverter } from "../../../shared/power/index.js";
import { cellOf, powerData } from "../../../shared/power/data.js";
import { cellCost, replacementSeconds, swappedEndurance } from "../../../shared/power/rules.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ultraTechCells } from "../../ultra-tech/power/index.js";
import { POWER_CELLS } from "../../ultra-tech/power/rules.js";
import { BATTERIES_RULE, BATTERY_SIZES, HIGH_TECH_BATTERIES, darknessAtCarrier, generatorFor, highTechBatteries, highTechPowerPrice } from "./index.js";
import { CRANKED, FUELS, GENERATORS, crankFatigue, crankedShare, fuelOf, palmCrankMinutes, solarPowered, tankLeft } from "./generators.js";

const UT_RULE = `${MODULE_ID}.powerCells`;

const gear = (book: string | null, power: Record<string, unknown>, tl = "8", extra: Record<string, unknown> = {}) => ({
  type: "equipment",
  name: "Gadget",
  system: { tl, cost: 100, weight: 5, extensions: { [MODULE_ID]: { power } }, ...extra },
  flags: book ? { [MODULE_ID]: { book } } : {},
});

/** Switches on exactly these keys. */
function only(...keys: string[]) {
  const on = new Set(keys);
  setRuleReader((k) => on.has(k));
}

beforeEach(() => {
  CELL_TABLES.register(ultraTechCells(UT_RULE));
  CELL_TABLES.register(highTechBatteries());
});

afterEach(() => {
  CELL_TABLES.clear();
  setRuleReader(() => false);
});

describe("High-Tech's battery table", () => {
  it("lists the book's six sizes with their prices and weights", () => {
    expect(BATTERY_SIZES).toEqual(["T", "XS", "S", "M", "L", "VL"]);
    expect(highTechBatteries().figures.cells).toMatchObject({ T: { cost: 0.25, weight: 0.02, lc: 4 }, VL: { cost: 20, weight: 50, lc: 4 } });
  });

  it("lets a High-Tech record keep its batteries, with every switch off", () => {
    const radio = gear("high-tech", { draw: { cell: "XS", cells: 3, endurance: "10 hrs.", raw: "3×XS/10 hrs." } });
    expect(powerData(radio).draw).toMatchObject({ cell: "XS", cells: 3, endurance: "10 hrs." });
    expect(cellTableOf(radio)).toBeNull();
  });

  it("needs only its own switch: Ultra-Tech's cells switch does nothing for it (D1)", () => {
    const radio = gear("high-tech", { draw: { cell: "S", cells: 2, endurance: "5 hrs." } });
    setRuleReader((key) => key !== BATTERIES_RULE);
    expect(cellTableOf(radio)).toBeNull();
    only(BATTERIES_RULE);
    expect(cellTableOf(radio)?.book).toBe("high-tech");
  });

  it("leaves an Ultra-Tech record's cells as they were", () => {
    const medic = gear("ultra-tech", { draw: { cell: "B", cells: 1, endurance: "10 hr." } }, "9");
    expect(powerData(medic).draw).toMatchObject({ cell: "B" });
    expect(powerData(gear("ultra-tech", { draw: { cell: "XS", cells: 1, endurance: "1 hr." } }, "9")).draw?.cell).toBeNull();
  });

  it("prices rechargeables at five times a throwaway battery, and gives no time to change one (p. 13)", () => {
    expect(cellCost(HIGH_TECH_BATTERIES, "M")).toBe(5);
    expect(cellCost(HIGH_TECH_BATTERIES, "M", { rechargeable: true })).toBe(25);
    expect(replacementSeconds(HIGH_TECH_BATTERIES, "S")).toBeNull();
  });

  it("leaves Ultra-Tech's cells as they were: no rechargeable price, its own times", () => {
    expect(cellCost(POWER_CELLS, "C", { rechargeable: true })).toBe(10);
    expect(replacementSeconds(POWER_CELLS, "F")).toBe(20);
    expect(POWER_CELLS.juryRig).not.toBeNull();
    expect(POWER_CELLS.kinds).toEqual(["flexible", "nonRechargeable", "cosmic", "superscience"]);
  });
});

describe("swapping batteries (pp. 10, 13)", () => {
  it("scales endurance by the batteries' weight: XS to S runs 3.3 times as long", () => {
    expect(swappedEndurance(HIGH_TECH_BATTERIES, { size: "XS", cells: 1 }, { size: "S", cells: 1 })).toBeCloseTo(3.3);
    expect(swappedEndurance(HIGH_TECH_BATTERIES, { size: "S", cells: 2 }, { size: "XS", cells: 3 })).toBeCloseTo(0.3 / 0.66);
  });

  it("runs the gadget on the swapped batteries, with the endurance and weight they give", () => {
    only(BATTERIES_RULE);
    const light = gear("high-tech", { draw: { cell: "XS", cells: 1, endurance: "10 hrs." }, swapCell: "S", swapCells: 1 });
    const data = powerData(light);
    expect(cellOf(data)).toEqual({ size: "S", cells: 1 });
    expect(data.enduranceFactor).toBeCloseTo(3.3);
    expect(enduranceLeft(data)).toMatchObject({ total: expect.closeTo(33, 5) });
    // The weight changes by the difference; the price, which leaves batteries out, doesn't.
    expect(powerPriceChange(light)).toEqual({ cost: 0, weight: 0.23 });
  });

  it("isn't offered by Ultra-Tech's table, whose cells are rigged instead", () => {
    only(UT_RULE);
    const medic = gear("ultra-tech", { draw: { cell: "B", cells: 1, endurance: "10 hr." }, swapCell: "C", swapCells: 1 }, "9");
    expect(powerData(medic).swap).toBeNull();
    expect(powerData(medic).enduranceFactor).toBe(1);
  });
});

describe("adapters and inverters (p. 14)", () => {
  it("prices a power adapter at the usual batteries' cost and weight", () => {
    only(BATTERIES_RULE);
    const radio = gear("high-tech", { draw: { cell: "S", cells: 2, endurance: "5 hrs." }, adapter: true });
    expect(powerPriceChange(radio)).toEqual({ cost: 2, weight: 0.66 });
  });

  it("runs a gadget on external power for as long as that lasts", () => {
    only(BATTERIES_RULE);
    const radio = gear("high-tech", { draw: { cell: "S", cells: 2, endurance: "5 hrs." }, adapter: true, external: true });
    expect(enduranceLeft(powerData(radio))).toBe("unlimited");
    // Without an adapter it can't be plugged in.
    expect(powerData(gear("high-tech", { draw: { cell: "S", cells: 2, endurance: "5 hrs." }, external: true })).external).toBe(false);
  });

  it("offers an inverter on gear with no batteries, and prices it with the batteries it carries", () => {
    only(BATTERIES_RULE);
    const fridge = gear("high-tech", {});
    expect(tableForInverter(fridge)?.book).toBe("high-tech");
    expect(tableForInverter({ ...fridge, system: { ...fridge.system, rangedModes: [{}] } })).toBeNull();
    const fitted = gear("high-tech", { cell: "M", cells: 1, inverter: true, draw: { endurance: "8 hrs." } });
    expect(tableForInverter(fitted)).toBeNull();
    expect(powerPriceChange(fitted)).toEqual({ cost: 5, weight: 4 });
    // An L battery lasts proportionately longer, and the inverter matches it.
    const bigger = gear("high-tech", { cell: "M", cells: 1, inverter: true, swapCell: "L", swapCells: 1, draw: { endurance: "8 hrs." } });
    expect(enduranceLeft(powerData(bigger))).toMatchObject({ total: 40 });
    expect(powerPriceChange(bigger)).toEqual({ cost: 10, weight: 20 });
  });

  it("offers no inverter on a program, which draws no power of its own", () => {
    only(BATTERIES_RULE);
    // One the computer engine marks as a program...
    const marked = { ...gear("high-tech", {}), system: { ...gear("high-tech", {}).system, extensions: { [MODULE_ID]: { power: {}, computer: { program: true } } } } };
    expect(tableForInverter(marked)).toBeNull();
    const complex = { ...gear("high-tech", {}), system: { ...gear("high-tech", {}).system, extensions: { [MODULE_ID]: { power: {}, computer: { complexity: 3 } } } } };
    expect(tableForInverter(complex)).toBeNull();
    // ... and the catalogue's weightless software, before anyone marks it.
    expect(tableForInverter({ ...gear("high-tech", {}, "8", { weight: 0 }), name: "Basic Code-Breaking Program (TL8)" })).toBeNull();
    expect(tableForInverter({ ...gear("high-tech", {}, "8", { weight: 0 }), name: "CVSA Software" })).toBeNull();
    // Gear that merely mentions programs still weighs something and is offered one.
    expect(tableForInverter({ ...gear("high-tech", {}), name: "Programming Console" })?.book).toBe("high-tech");
  });

  it("offers neither on Ultra-Tech gear", () => {
    only(UT_RULE);
    expect(tableForInverter(gear("ultra-tech", {}, "9"))).toBeNull();
    expect(powerData(gear("ultra-tech", { draw: { cell: "B", cells: 1, endurance: "1 hr." }, adapter: true }, "9")).adapter).toBe(false);
  });
});

describe("recharging", () => {
  it("gives a gadget back hours of its endurance, never past full", async () => {
    const item: any = gear("high-tech", { draw: { cell: "S", cells: 1, endurance: "10 hrs." }, hoursUsed: 6 });
    item.update = vi.fn(async () => undefined);
    expect(await recharge(item, 4)).toBe(4);
    expect(item.update).toHaveBeenCalledWith({ [`system.extensions.${MODULE_ID}.power.hoursUsed`]: 2 });
    expect(await recharge(item, 20)).toBe(6);
  });
});

describe("generators, collectors and fuel (pp. 14-16)", () => {
  const records = ["high-tech-captured-core-general.json", "high-tech-by-hand.json", "high-tech-ee-laboratory-power.json", "high-tech-ee-laboratory-power-by-hand.json"]
    .flatMap((file) => JSON.parse(readFileSync(new URL(`../../../../books/high-tech/packs-src/equipment/${file}`, import.meta.url), "utf-8")) as Array<{ name: string }>)
    .map((r) => r.name);

  it("names only records the book's packs carry", () => {
    for (const name of [...Object.keys(GENERATORS), ...Object.keys(FUELS)]) expect(records).toContain(name);
  });

  it("finds a generator only on a High-Tech record or one of no book", () => {
    expect(generatorFor({ type: "equipment", name: "Windmill", flags: { [MODULE_ID]: { book: "high-tech" } } })?.source).toBe("wind");
    expect(generatorFor({ type: "equipment", name: "Windmill", flags: {} })?.source).toBe("wind");
    expect(generatorFor({ type: "equipment", name: "Windmill", flags: { [MODULE_ID]: { book: "ultra-tech" } } })).toBeNull();
    expect(fuelOf("Gasoline (per gallon)")).toBe("gasoline");
  });

  it("runs a gasoline generator's tank for its hours", () => {
    expect(GENERATORS["Portable Gasoline Generator"]!.tank).toMatchObject({ fuel: "gasoline", amount: 1, hours: 10 });
    expect(tankLeft({ hours: 3 }, 1.5)).toBe(1.5);
    expect(tankLeft({ hours: 3 }, 5)).toBe(0);
  });

  it("costs 1 FP an hour of cranking, which recharges about 10 lbs. of batteries", () => {
    expect(crankFatigue(CRANKED, 3)).toBe(3);
    expect(crankedShare(CRANKED, 1, 50)).toBeCloseTo(0.2);
    expect(crankedShare(CRANKED, 1, 2)).toBe(1);
    expect(palmCrankMinutes({ crankMinutes: 2, runMinutes: 5 }, 4)).toBe(10);
  });

  it("gives no solar power at a -1 Vision penalty or worse", () => {
    expect(solarPowered(0)).toBe(true);
    expect(solarPowered(-1)).toBe(false);
  });

  it("makes the portable gasoline generator 2/3 the weight at TL8, with the switch on", () => {
    const item = { type: "equipment", name: "Portable Gasoline Generator", system: { tl: "8", cost: 600, weight: 50 }, flags: {} };
    expect(highTechPowerPrice(item, { cost: 600, weight: 50 }, () => true)).toEqual({ cost: 600, weight: 33.333 });
    expect(highTechPowerPrice(item, { cost: 600, weight: 50 }, () => false)).toBeNull();
    expect(highTechPowerPrice({ ...item, system: { ...item.system, tl: "7" } }, { cost: 600, weight: 50 }, () => true)).toBeNull();
  });
});

describe("the solar recharger's light (p. 15; API 1.96.0)", () => {
  const api = (reading: { penalty: number } | null) => ({ areas: { darknessAt: vi.fn(() => reading) } });

  it("reads the darkness penalty at the character's token, with nobody's eyes", () => {
    const token = { id: "t1" };
    const a = api({ penalty: -2 });
    expect(darknessAtCarrier(a as never, { getActiveTokens: () => [token] })).toBe(-2);
    expect(a.areas.darknessAt).toHaveBeenCalledWith(null, token);
    expect(solarPowered(darknessAtCarrier(a as never, { getActiveTokens: () => [token] })!)).toBe(false);
    expect(solarPowered(darknessAtCarrier(api({ penalty: 0 }) as never, { getActiveTokens: () => [token] })!)).toBe(true);
  });

  it("leaves it to the dialog where the character has no token, or the spot can't be read", () => {
    expect(darknessAtCarrier(api({ penalty: -3 }) as never, { getActiveTokens: () => [] })).toBeNull();
    expect(darknessAtCarrier(api(null) as never, { getActiveTokens: () => [{}] })).toBeNull();
  });
});
