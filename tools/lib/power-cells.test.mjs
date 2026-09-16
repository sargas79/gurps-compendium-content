import { describe, expect, it } from "vitest";

import { CELL_SIZES, powerOf, readBattery, readPower } from "./power-cells.mjs";

/**
 * What a gadget is powered by, as the GCA file writes it. Power cells are
 * Ultra-Tech's own (pp. 18-20): sizes AA to F, with "p" for a supply worn as a
 * pack.
 */
describe("readBattery", () => {
  it("knows the sizes the book lists, smallest first", () => {
    expect(CELL_SIZES).toEqual(["AA", "A", "B", "C", "D", "E", "F"]);
  });

  it("reads a single cell", () => {
    expect(readBattery("C")).toEqual({ cell: "C", cells: 1, raw: "C" });
    expect(readBattery("AA")).toEqual({ cell: "AA", cells: 1, raw: "AA" });
  });

  it("reads a count of them", () => {
    expect(readBattery("2C")).toEqual({ cell: "C", cells: 2, raw: "2C" });
    expect(readBattery("10Fp")).toEqual({ cell: "F", cells: 10, backpack: true, raw: "10Fp" });
  });

  it("reads the p that means a supply worn as a pack", () => {
    // A D cell is "often worn as a separate power pack" (p. 19).
    expect(readBattery("Dp")).toEqual({ cell: "D", cells: 1, backpack: true, raw: "Dp" });
  });

  it("reads a figure with no cell size as the pack's weight in pounds", () => {
    // The Assault Laser's "10/4p" is a 10-lb. weapon with a 4-lb. chemical
    // power pack (p. 118), not four cells.
    expect(readBattery("4p")).toEqual({ packWeight: 4, backpack: true, raw: "4p" });
    expect(readBattery("12p")).toEqual({ packWeight: 12, backpack: true, raw: "12p" });
  });

  it("keeps anything it cannot read, rather than guessing at it", () => {
    expect(readBattery("7")).toEqual({ raw: "7" });
    expect(readBattery("something else")).toEqual({ raw: "something else" });
  });

  it("says nothing at all for a blank column", () => {
    expect(readBattery("")).toBeNull();
    expect(readBattery(undefined)).toBeNull();
  });
});

describe("readPower", () => {
  it("reads a draw and how long it lasts", () => {
    expect(readPower("2D/8 hr.")).toEqual({ cell: "D", cells: 2, endurance: "8 hr.", raw: "2D/8 hr." });
    expect(readPower("D/1 mon.")).toEqual({ cell: "D", cells: 1, endurance: "1 mon.", raw: "D/1 mon." });
  });

  it("drops a parenthetical the file left unclosed", () => {
    const read = readPower("A/10 hr. (Uses flexible cells");
    expect(read.endurance).toBe("10 hr.");
    expect(read.cell).toBe("A");
  });

  it("says nothing for a blank column", () => {
    expect(readPower("")).toBeNull();
  });
});

describe("powerOf", () => {
  const fields = (entries) => new Map(Object.entries(entries));

  it("puts the three columns together", () => {
    expect(powerOf(fields({ battery: "2C", power: "2C/20 hr.", emptyweight: "0.4" }))).toEqual({
      cell: "C",
      cells: 2,
      raw: "2C",
      draw: { cell: "C", cells: 2, endurance: "20 hr.", raw: "2C/20 hr." },
      emptyWeight: 0.4,
    });
  });

  it("gives nothing at all for a gadget with no power columns", () => {
    expect(powerOf(fields({}))).toBeNull();
    expect(powerOf(fields({ battery: "", power: "", emptyweight: "" }))).toBeNull();
  });

  it("leaves out an empty weight that is not a weight", () => {
    expect(powerOf(fields({ battery: "C", emptyweight: "neg." }))).toEqual({ cell: "C", cells: 1, raw: "C" });
  });
});
