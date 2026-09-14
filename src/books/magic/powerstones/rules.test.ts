import { describe, expect, it } from "vitest";

import {
  POWERSTONE_PRICE_TABLE,
  pointsPerEnergy,
  powerstoneFormulaPrice,
  powerstonePrice,
  rechargeSeconds,
  rechargeStones,
  stoneCanPay,
} from "./rules.js";

/** Powerstones (GURPS Magic pp. 20, 69-70). */
describe("what a Powerstone costs", () => {
  it("prices a capacity the table prints at its row: capacity 10 is $1,900", () => {
    expect(powerstonePrice(10)).toBe(1900);
    expect(powerstonePrice(1)).toBe(70);
    expect(powerstonePrice(100)).toBe(675000);
  });

  it("follows the table's own formula, within the book's rounding, for every printed row", () => {
    for (const [capacity, printed] of POWERSTONE_PRICE_TABLE) {
      expect(Math.abs(powerstoneFormulaPrice(capacity) - printed) / printed).toBeLessThan(0.025);
    }
  });

  it("prices a capacity between rows by the formula, rounded as the rows are", () => {
    expect(powerstonePrice(11)).toBe(2250);
    expect(powerstonePrice(11)).toBeGreaterThan(powerstonePrice(10));
    expect(powerstonePrice(11)).toBeLessThan(powerstonePrice(12));
    expect(powerstonePrice(0)).toBe(0);
  });
});

describe("recharging", () => {
  it("regains a point a day in normal mana, a week in low, and none with no mana", () => {
    expect(rechargeSeconds("normal")).toBe(86400);
    expect(rechargeSeconds("low")).toBe(604800);
    expect(rechargeSeconds("high")).toBe(43200);
    expect(rechargeSeconds("veryHigh")).toBe(21600);
    expect(rechargeSeconds("none")).toBeNull();
  });

  it("stops at capacity, and never takes charge away", () => {
    expect(rechargeStones([{ capacity: 5, charge: 3, kind: "normal", together: false }], "high", 10 * 86400)).toEqual([5]);
    expect(rechargeStones([{ capacity: 5, charge: 7, kind: "normal", together: false }], "high", 10 * 86400)).toEqual([7]);
  });

  it("never recharges a Manastone", () => {
    expect(rechargeStones([{ capacity: 5, charge: 0, kind: "manastone", together: false }], "veryHigh", 30 * 86400)).toEqual([0]);
  });

  it("recharges only the largest of stones kept together, and splits it between equals", () => {
    const three = [
      { capacity: 10, charge: 0, kind: "normal" as const, together: true },
      { capacity: 4, charge: 0, kind: "normal" as const, together: true },
      { capacity: 10, charge: 0, kind: "oneCollege" as const, together: true },
    ];
    expect(rechargeStones(three, "normal", 4 * 86400)).toEqual([2, 0, 2]);
  });

  it("does not let a Manastone kept with others hold them back", () => {
    const kept = [
      { capacity: 4, charge: 0, kind: "normal" as const, together: true },
      { capacity: 20, charge: 5, kind: "manastone" as const, together: true },
    ];
    expect(rechargeStones(kept, "normal", 2 * 86400)).toEqual([2, 5]);
  });
});

describe("drawing on a stone", () => {
  it("spends a point of charge per energy from an ordinary stone, half a point from a dedicated one and a third from an exclusive one", () => {
    expect(pointsPerEnergy("normal")).toBe(1);
    expect(pointsPerEnergy("oneCollege")).toBe(1);
    expect(pointsPerEnergy("dedicated")).toBe(0.5);
    // Five energy from a dedicated stone takes 3 points, and a point of an exclusive one is worth 3 energy.
    expect(Math.ceil(5 * pointsPerEnergy("dedicated"))).toBe(3);
    expect(Math.floor(1 / pointsPerEnergy("exclusive"))).toBe(3);
    expect(Math.ceil(7 * pointsPerEnergy("exclusive"))).toBe(3);
  });

  it("offers a One-College stone only for its college's spells", () => {
    const fire = { kind: "oneCollege" as const, college: "Fire", setInto: "", castThrough: null };
    expect(stoneCanPay({ ...fire, spellColleges: ["Fire"] })).toBe(true);
    expect(stoneCanPay({ ...fire, spellColleges: ["Water"] })).toBe(false);
  });

  it("offers a dedicated stone only for spells cast through its item, by name or id", () => {
    const set = { kind: "dedicated" as const, college: "", spellColleges: ["Fire"] };
    const wand = { itemId: "w1", itemName: "Wand of Fire" };
    expect(stoneCanPay({ ...set, setInto: "wand of fire", castThrough: wand })).toBe(true);
    expect(stoneCanPay({ ...set, setInto: "w1", castThrough: wand })).toBe(true);
    expect(stoneCanPay({ ...set, setInto: "Staff", castThrough: wand })).toBe(false);
    expect(stoneCanPay({ ...set, setInto: "Wand of Fire", castThrough: null })).toBe(false);
    expect(stoneCanPay({ kind: "normal", college: "", setInto: "", spellColleges: ["Water"], castThrough: null })).toBe(true);
  });
});
