import { describe, expect, it } from "vitest";

import {
  cellCost,
  cellLegality,
  cellRef,
  enduranceHours,
  enduranceMultiplier,
  explodingCell,
  explosionMultiple,
  hoursText,
  replacementSeconds,
  shotsMultiplier,
  substituteCells,
  enduranceUses,
} from "./rules.js";
import { enduranceUnit } from "../../../shared/power/rules.js";

describe("power cells (Ultra-Tech pp. 18-19)", () => {
  it("prices each size", () => {
    expect(cellCost("AA")).toBe(1);
    expect(cellCost("C")).toBe(10);
    expect(cellCost("F")).toBe(20000);
  });

  it("charges four times for flexible cells from B up", () => {
    expect(cellCost("A", { flexible: true })).toBe(2);
    expect(cellCost("B", { flexible: true })).toBe(12);
  });

  it("makes a cosmic C cell $1,000, LC2, and a cosmic E cell LC1", () => {
    expect(cellCost("C", { cosmic: true })).toBe(1000);
    expect(cellLegality("C", { cosmic: true })).toBe(2);
    expect(cellLegality("E", { cosmic: true })).toBe(1);
    expect(cellLegality("D")).toBe(4);
    expect(cellLegality("C")).toBeNull();
  });

  it("takes three seconds for A to C, five for AA, D and E, and twenty for F", () => {
    expect(["AA", "A", "B", "C", "D", "E", "F"].map((s) => replacementSeconds(s as never))).toEqual([5, 3, 3, 3, 5, 5, 20]);
  });
});

describe("kinds of cell (Ultra-Tech pp. 19, 133)", () => {
  it("doubles a non-rechargeable cell's endurance and shots", () => {
    expect(enduranceMultiplier({ nonRechargeable: true })).toBe(2);
    expect(shotsMultiplier({ nonRechargeable: true })).toBe(2);
  });

  it("gives a superscience cell five times the shots, and ten if non-rechargeable too", () => {
    expect(shotsMultiplier({ superscience: true })).toBe(5);
    expect(shotsMultiplier({ superscience: true, nonRechargeable: true })).toBe(10);
    expect(enduranceMultiplier({ superscience: true })).toBe(1);
  });

  it("never runs a cosmic cell down", () => {
    expect(enduranceMultiplier({ cosmic: true })).toBeNull();
    expect(shotsMultiplier({ cosmic: true })).toBeNull();
  });
});

describe("endurance", () => {
  it("reads the tables' figures in hours", () => {
    expect(enduranceHours("8 hr.")).toBe(8);
    expect(enduranceHours("24 hr.")).toBe(24);
    expect(enduranceHours("1 wk")).toBe(168);
    expect(enduranceHours("1 wk.")).toBe(168);
    expect(enduranceHours("1 mon")).toBe(720);
    expect(enduranceHours("2 days")).toBe(48);
  });

  it("reads nothing it doesn't recognize", () => {
    expect(enduranceHours("special")).toBeNull();
    expect(enduranceHours("")).toBeNull();
  });

  it("says a long time in days or weeks", () => {
    expect(hoursText(8)).toEqual({ value: 8, unit: "hr" });
    expect(hoursText(72)).toEqual({ value: 3, unit: "day" });
    expect(hoursText(720)).toEqual({ value: 4.3, unit: "wk" });
    // Under an hour, in minutes: a supercapacitor's minute (HT:EE p. 18).
    expect(hoursText(1 / 60)).toEqual({ value: 1, unit: "min" });
    expect(hoursText(0)).toEqual({ value: 0, unit: "hr" });
  });
});

describe("jury-rigging (Ultra-Tech p. 19)", () => {
  it("takes ten cells one size smaller, a hundred two sizes smaller", () => {
    expect(substituteCells("D", "C")).toBe(10);
    expect(substituteCells("D", "B")).toBe(100);
    expect(substituteCells("C", "D")).toBeNull();
  });
});

describe("exploding cells (Ultra-Tech pp. 19-20)", () => {
  it("sets the REF by TL, and a cosmic cell's at 5,000", () => {
    expect(cellRef(9)).toBe(1 / 8);
    expect(cellRef(10)).toBe(1 / 2);
    expect(cellRef(11)).toBe(2);
    expect(cellRef(12)).toBe(4);
    expect(cellRef(10, { cosmic: true })).toBe(5000);
  });

  it("follows the Basic Set's blast formula", () => {
    // 1 lb. of REF 1 explosive: 6d x sqrt(4) = 12d (Campaigns p. 415).
    expect(explosionMultiple(1, 1)).toBe(2);
  });

  it("makes a TL12 D cell a 5-lb. REF 4 charge", () => {
    // sqrt(5 x 4 x 4) = 8.9, so 53.4 dice.
    expect(explodingCell({ size: "D", tl: 12 })).toEqual({ dice: 53.4, ref: 4, weight: 5 });
  });
});

describe("endurance in uses (#299)", () => {
  it("reads uses where the table counts them (p. 194)", () => {
    expect(enduranceUses("10 uses.")).toBe(10);
    expect(enduranceUses("1 use")).toBe(1);
    expect(enduranceUses("10 hr.")).toBeNull();
    // High-Tech's gadgets that count what they do (pp. 59, 222-223).
    expect(enduranceUses("300 tests")).toBe(300);
    expect(enduranceUses("1,000 readings")).toBe(1000);
    expect(enduranceUses("200 quarts")).toBe(200);
    expect([enduranceUnit("300 tests"), enduranceUnit("1 reading"), enduranceUnit("20 quarts"), enduranceUnit("10 uses."), enduranceUnit("5 hrs.")]).toEqual(["tests", "readings", "quarts", "uses", null]);
  });
});
