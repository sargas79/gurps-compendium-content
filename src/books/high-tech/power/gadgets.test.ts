/**
 * High-Tech's batteries with its gadget options (pp. 10, 13): the battery
 * count sized for the carrier, the batteries' weight cheap and expensive
 * leave out, and batteries swapped in counted once, as a difference.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { GADGET_TABLES, readyGadgets, sizedCells } from "../../../shared/gadgets/index.js";
import { CELL_TABLES, enduranceLeft, powerPriceChange } from "../../../shared/power/index.js";
import { cellOf, listedCellWeight, loadedCellWeight, powerData } from "../../../shared/power/data.js";
import { swappedEndurance } from "../../../shared/power/rules.js";
import { MODULE_ID } from "../../../shared/module.js";
import { combinationSource, highTechGadgets } from "../equipment/index.js";
import { sharedBatteryEndurance } from "../equipment/rules.js";
import { BATTERIES_RULE, HIGH_TECH_BATTERIES, highTechBatteries } from "./index.js";

const key = (k: string) => `${MODULE_ID}.${k}`;

let gadgetPrice: (item: any) => { cost?: number; weight?: number } | null;

/** Switches on exactly these keys. */
function only(...keys: string[]) {
  const on = new Set(keys);
  setRuleReader((k) => on.has(k));
}

/** A 6-lb. radio running on 2 M batteries (4 lbs.) for 10 hours. */
function radio(power: Record<string, unknown> = {}, gadget: Record<string, unknown> = {}, sm = 0): any {
  return {
    id: "radio",
    name: "Radio",
    type: "equipment",
    actor: { system: { sm } },
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: {
      tl: "8", cost: 100, weight: 6, meleeModes: [], rangedModes: [],
      extensions: { [MODULE_ID]: { power: { draw: { cell: "M", cells: 2, endurance: "10 hrs." }, ...power }, ultraTech: gadget } },
    },
  };
}

/** The weight once both modifiers have had their say, in the order they register (gadgets, then batteries). */
function weighed(item: any): number {
  const gadget = gadgetPrice(item);
  const weight = gadget?.weight ?? item.system.weight;
  return Math.round((weight + (powerPriceChange(item)?.weight ?? 0)) * 100) / 100;
}

beforeEach(() => {
  GADGET_TABLES.register(highTechGadgets({ options: key("equipmentOptions"), sm: key("gearForSm"), legality: key("antiqueLegality") }));
  CELL_TABLES.register(highTechBatteries());
  vi.stubGlobal("Hooks", { on: () => undefined });
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string) => k } });
  const api: any = {
    combat: { hooks: { equipmentFailure: "f", reactionModifiers: "r" } },
    data: { registerPriceModifier: (m: any) => { gadgetPrice = (item) => m.apply(item, { cost: item.system.cost, weight: item.system.weight }); } },
    sheets: { registerSheetSection: () => undefined },
  };
  // Registers the sizing adjuster on the cell engine, once for the file.
  readyGadgets(api);
});

afterEach(() => {
  GADGET_TABLES.clear();
  CELL_TABLES.clear();
  setRuleReader(() => false);
  vi.unstubAllGlobals();
});

describe("batteries sized for the carrier (p. 10)", () => {
  it("multiplies the battery count by the SM factor once the batteries switch is on", () => {
    only(key("gearForSm"), BATTERIES_RULE);
    const big = radio({}, { adjustForSm: true }, 2);
    expect(sizedCells(big)).toBe(5);
    expect(cellOf(powerData(big))).toEqual({ size: "M", cells: 10 });
    // More batteries for a bigger gadget: the same endurance.
    expect(enduranceLeft(powerData(big))).toMatchObject({ total: 10 });
    // The price and weight go with the size: five times the 6 lbs., batteries and all.
    expect(weighed(big)).toBe(30);
  });

  it("leaves the count alone without the sizing switch or the option", () => {
    only(BATTERIES_RULE);
    expect(cellOf(powerData(radio({}, { adjustForSm: true }, 2)))).toEqual({ size: "M", cells: 2 });
    only(key("gearForSm"), BATTERIES_RULE);
    expect(cellOf(powerData(radio({}, {}, 2)))).toEqual({ size: "M", cells: 2 });
  });

  it("scales a swap against the sized count: 1 L for 10 M is half the endurance, 10 lbs. lighter", () => {
    only(key("gearForSm"), BATTERIES_RULE);
    const big = radio({ swapCell: "L", swapCells: 1 }, { adjustForSm: true }, 2);
    expect(enduranceLeft(powerData(big))).toMatchObject({ total: 5 });
    expect(weighed(big)).toBe(20);
  });
});

describe("the batteries' weight, counted once (p. 10)", () => {
  it("takes the listed batteries' weight from the battery engine for cheap and expensive", () => {
    only(key("equipmentOptions"), BATTERIES_RULE);
    const light = radio({}, { grade: "expensive" });
    expect(listedCellWeight(light)).toBe(4);
    // (6 - 4) x 2/3 + 4.
    expect(weighed(light)).toBe(5.33);
    // The gadget's own field doesn't count the batteries a second time.
    expect(weighed(radio({}, { grade: "expensive", cellWeight: 4 }))).toBe(5.33);
    expect(weighed(radio({}, { grade: "expensive", cellWeight: 1 }))).toBe(5.33);
  });

  it("falls back to the gadget's own field with the batteries switch off", () => {
    only(key("equipmentOptions"));
    expect(listedCellWeight(radio())).toBeNull();
    expect(weighed(radio({}, { grade: "expensive" }))).toBe(4);
    expect(weighed(radio({}, { grade: "expensive", cellWeight: 4 }))).toBe(5.33);
  });

  it("adds batteries swapped in as the difference, after the grade, never graded", () => {
    only(key("equipmentOptions"), BATTERIES_RULE);
    // 2 M (4 lbs.) for 1 L (10 lbs.): +6 lbs. on the expensive radio's 5.33.
    expect(weighed(radio({ swapCell: "L", swapCells: 1 }, { grade: "expensive" }))).toBe(11.33);
  });

  it("gives a combination the batteries each part holds as it is", () => {
    only(BATTERIES_RULE);
    const swapped = { ...radio({ swapCell: "L", swapCells: 1 }), effectivePrice: { cost: 100, weight: 12 } };
    expect(loadedCellWeight(swapped)).toBe(10);
    const made: any = combinationSource([swapped], "Kit", true);
    expect(made.system.extensions[MODULE_ID].ultraTech.cellWeight).toBe(10);
    expect(made.system.weight).toBe(12);
  });
});

describe("one sum for endurance by battery weight (pp. 10, 13)", () => {
  it("gives a combined gadget's part the swap's figure", () => {
    const ratio = swappedEndurance(HIGH_TECH_BATTERIES, { size: "XS", cells: 1 }, { size: "S", cells: 1 })!;
    expect(sharedBatteryEndurance(10, 0.1, 0.33)).toBe(Math.round(10 * ratio * 100) / 100);
    expect(sharedBatteryEndurance(10, 0, 0.33)).toBe(10);
    expect(sharedBatteryEndurance(10, 0.1, 0)).toBe(0);
  });
});
