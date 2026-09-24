/**
 * The system's DR line on an affliction's resistance roll (Characters p. 35;
 * API 1.105.0): a book changes it or takes it out, and never adds a second.
 */

import { describe, expect, it } from "vitest";

import { afflictionDrLine, afflictionDrMet, afflictionRowDivisor, dropAfflictionDr, setAfflictionDr } from "./affliction-dr.js";

const line = (value: number) => ({ key: "afflictionDr", label: "DR", value });
const other = { label: "Past 1/2D", value: 3 };

describe("the system's DR line on a roll to resist", () => {
  it("is found by its key", () => {
    expect(afflictionDrLine({ modifiers: [other, line(4)] })).toEqual(line(4));
    expect(afflictionDrLine({ modifiers: [other] })).toBeNull();
  });

  it("is taken out, leaving the other lines", () => {
    const context = { modifiers: [other, line(4)] };
    expect(dropAfflictionDr(context)).toBe(true);
    expect(context.modifiers).toEqual([other]);
    expect(dropAfflictionDr(context)).toBe(false);
  });

  it("is set to a book's count, taken out at 0, and never added where the system gave none", () => {
    const context = { modifiers: [line(8)] };
    setAfflictionDr(context, 2, "Armour against the shock");
    expect(context.modifiers).toEqual([{ key: "afflictionDr", label: "Armour against the shock", value: 2 }]);
    setAfflictionDr(context, 0);
    expect(context.modifiers).toEqual([]);
    const none = { modifiers: [other] };
    setAfflictionDr(none, 5);
    expect(none.modifiers).toEqual([other]);
  });

  it("reads the row's divisor from the affliction, its own or linked", () => {
    const item = { system: { meleeModes: [{ armorDivisor: 1, linked: { affliction: true, armorDivisor: 0.5 } }], rangedModes: [{ affliction: true, armorDivisor: 3 }] } };
    expect(afflictionRowDivisor(item, { index: 0, ranged: false })).toBe(0.5);
    expect(afflictionRowDivisor(item, { index: 0, ranged: true })).toBe(3);
    expect(afflictionRowDivisor(null, null)).toBe(1);
  });

  it("gives back the DR the line was worked from", () => {
    expect(afflictionDrMet({ modifiers: [line(8)] }, 0.5)).toBe(4);
    expect(afflictionDrMet({ modifiers: [line(2)] }, 2)).toBe(4);
    expect(afflictionDrMet({ modifiers: [] }, 1)).toBe(0);
  });
});
