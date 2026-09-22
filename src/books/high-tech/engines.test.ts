/**
 * Decision D1 (#335): a GM may use High-Tech without Ultra-Tech. A rule both
 * books print is one shared engine with a table per book; a High-Tech item
 * takes High-Tech's figures and needs only High-Tech's switch.
 *
 * High-Tech's own tables arrive with its rule issues, so the tables here are
 * stand-ins with figures unlike Ultra-Tech's, to tell the two apart.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setRuleReader } from "../../shared/book-tables.js";
import { GADGET_TABLES, gadgetPriceOf, gadgetTables, type GadgetTable } from "../../shared/gadgets/index.js";
import { gadgetItem } from "../../shared/gadgets/data.js";
import type { GadgetFigures } from "../../shared/gadgets/rules.js";
import { CELL_TABLES, cellTableOf, enduranceLeft, type CellTable } from "../../shared/power/index.js";
import { powerData } from "../../shared/power/data.js";
import type { CellFigures } from "../../shared/power/rules.js";
import { MODULE_ID } from "../../shared/module.js";
import { ultraTechGadgets } from "../ultra-tech/gadgets/index.js";
import { GADGETS } from "../ultra-tech/gadgets/rules.js";
import { ultraTechCells } from "../ultra-tech/power/index.js";
import { POWER_CELLS } from "../ultra-tech/power/rules.js";

const key = (k: string) => `${MODULE_ID}.${k}`;

/** A stand-in for High-Tech's gadget figures: rugged triples the price. */
const HT_GADGETS: GadgetFigures = { ...GADGETS, rugged: { ...GADGETS.rugged, cost: 3 } };
const HT_GADGET_TABLE: GadgetTable = {
  book: "high-tech",
  tls: { min: 0, max: 8 },
  figures: HT_GADGETS,
  switches: { options: key("equipmentOptions"), sm: key("gearForSm"), legality: key("antiqueLegality") },
  i18n: "GCC.HT",
};

/** A stand-in for High-Tech's batteries: its own sizes, non-rechargeables last three times as long. */
const HT_CELLS: CellFigures = {
  ...POWER_CELLS,
  sizes: ["T", "XS", "S"],
  cells: { T: { cost: 0.25, weight: 0.02, lc: 4 }, XS: { cost: 0.5, weight: 0.1, lc: 4 }, S: { cost: 1, weight: 0.33, lc: 4 } },
  replacementSeconds: { T: 5, XS: 3, S: 3 },
  nonRechargeable: 3,
};
const HT_CELL_TABLE: CellTable = { book: "high-tech", tls: { min: 0, max: 8 }, figures: HT_CELLS, rule: key("batteries"), i18n: "GCC.HT" };

/** Switches on exactly these keys. */
function only(...keys: string[]) {
  const on = new Set(keys);
  setRuleReader((k) => on.has(k));
}

const gear = (book: string | null, extensions: Record<string, unknown>, tl = "8") => ({
  type: "equipment",
  system: { tl, cost: 100, weight: 10, extensions: { [MODULE_ID]: extensions } },
  flags: book ? { [MODULE_ID]: { book } } : {},
});

const ultraTechOff = {
  options: key("gadgetOptions"),
  sm: key("adjustingForSm"),
  legality: key("legalityAndAntiques"),
};

beforeEach(() => {
  // Both books' tables registered, as in a build with every book.
  GADGET_TABLES.register(ultraTechGadgets(ultraTechOff));
  GADGET_TABLES.register(HT_GADGET_TABLE);
  CELL_TABLES.register(ultraTechCells(key("powerCells")));
  CELL_TABLES.register(HT_CELL_TABLE);
});

afterEach(() => {
  GADGET_TABLES.clear();
  CELL_TABLES.clear();
  setRuleReader(() => false);
});

describe("a High-Tech item with only High-Tech's switches on (D1)", () => {
  it("takes High-Tech's gadget figures, and Ultra-Tech's switches stay off", () => {
    only(key("equipmentOptions"));
    const item = gear("high-tech", { ultraTech: { rugged: true } });
    expect(gadgetTables(item).options).toBe(HT_GADGET_TABLE);
    expect(gadgetPriceOf(item, gadgetItem(item))).toMatchObject({ cost: 300, factor: 3 });
  });

  it("isn't priced by Ultra-Tech's switch alone", () => {
    only(key("gadgetOptions"), key("adjustingForSm"), key("legalityAndAntiques"));
    const item = gear("high-tech", { ultraTech: { rugged: true } });
    expect(gadgetTables(item)).toEqual({ options: null, sm: null, legality: null });
    expect(gadgetPriceOf(item, gadgetItem(item))).toBeNull();
  });

  it("runs on High-Tech's batteries with only High-Tech's switch on", () => {
    only(key("batteries"));
    const item = gear("high-tech", { power: { cell: "XS", cells: 2, nonRechargeable: true, draw: { cell: "XS", cells: 2, endurance: "10 hr." } } });
    expect(cellTableOf(item)).toBe(HT_CELL_TABLE);
    const data = powerData(item);
    // An Ultra-Tech engine would have refused the size and doubled the endurance.
    expect(data.cell).toBe("XS");
    expect(enduranceLeft(data)).toEqual({ total: 30, left: 30 });
  });

  it("gives an item that names no book High-Tech's table when only High-Tech is on", () => {
    only(key("equipmentOptions"), key("batteries"));
    const item = gear(null, { ultraTech: { rugged: true } }, "7");
    expect(gadgetTables(item).options).toBe(HT_GADGET_TABLE);
    expect(cellTableOf(item)).toBe(HT_CELL_TABLE);
  });
});

describe("with only Ultra-Tech's switches on", () => {
  it("prices an Ultra-Tech item as before", () => {
    only(key("gadgetOptions"));
    const item = gear("ultra-tech", { ultraTech: { rugged: true } }, "10");
    expect(gadgetPriceOf(item, gadgetItem(item))).toMatchObject({ cost: 200, factor: 2 });
  });

  it("gives an item that names no book Ultra-Tech's table, whatever its TL", () => {
    only(key("gadgetOptions"), key("powerCells"));
    const item = gear(null, {}, "7");
    expect(gadgetTables(item).options?.book).toBe("ultra-tech");
    expect(cellTableOf(item)?.book).toBe("ultra-tech");
  });
});

describe("with both books on", () => {
  it("gives an item that names no book the table whose TLs cover it", () => {
    only(key("gadgetOptions"), key("equipmentOptions"));
    expect(gadgetTables(gear(null, {}, "7")).options?.book).toBe("high-tech");
    expect(gadgetTables(gear(null, {}, "10")).options?.book).toBe("ultra-tech");
  });
});
