/**
 * High-Tech's battery table (p. 13), registered for its records' data before
 * any battery rule is (#348; the rules are #358's).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { CELL_TABLES, cellTableOf } from "../../../shared/power/index.js";
import { powerData } from "../../../shared/power/data.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ultraTechCells } from "../../ultra-tech/power/index.js";
import { BATTERIES_RULE, BATTERY_SIZES, highTechBatteries } from "./index.js";

const gear = (book: string, power: Record<string, unknown>, tl = "8") => ({
  type: "equipment",
  system: { tl, extensions: { [MODULE_ID]: { power } } },
  flags: { [MODULE_ID]: { book } },
});

beforeEach(() => {
  CELL_TABLES.register(ultraTechCells(`${MODULE_ID}.powerCells`));
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
    // No rule applies: the switch is #358's to register.
    expect(cellTableOf(radio)).toBeNull();
  });

  it("switches nothing on even when a switch reader says every key is on but its own", () => {
    setRuleReader((key) => key !== BATTERIES_RULE);
    expect(cellTableOf(gear("high-tech", { draw: { cell: "S", cells: 2, endurance: "5 hrs." } }))).toBeNull();
  });

  it("leaves an Ultra-Tech record's cells as they were", () => {
    const medic = gear("ultra-tech", { draw: { cell: "B", cells: 1, endurance: "10 hr." } }, "9");
    expect(powerData(medic).draw).toMatchObject({ cell: "B" });
    // A High-Tech size on an Ultra-Tech record is no cell of its book's.
    expect(powerData(gear("ultra-tech", { draw: { cell: "XS", cells: 1, endurance: "1 hr." } }, "9")).draw?.cell).toBeNull();
  });
});
