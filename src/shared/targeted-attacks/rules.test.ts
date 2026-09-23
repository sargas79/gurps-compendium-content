import { describe, expect, it } from "vitest";

import { buyOff, hardLevels, targetDefaultPenalty, targetedAttackBounds, type TargetTable } from "./rules.js";

/** The Targeted Attack engine two books share (Martial Arts p. 68, High-Tech p. 252), with a stand-in table. */
const TABLE: TargetTable = { locations: { torso: 0, arm: -2, skull: -7 }, chinks: { torso: -8, other: -10 }, weapon: -4 };

describe("the shared Targeted Attack engine", () => {
  it("reads a target's penalty from the book's table", () => {
    expect(targetDefaultPenalty(TABLE, "skull", false)).toBe(-7);
    expect(targetDefaultPenalty(TABLE, "arm", true)).toBe(-10);
    expect(targetDefaultPenalty(TABLE, "torso", true)).toBe(-8);
    expect(targetDefaultPenalty(TABLE, "weapon", false)).toBe(-4);
    expect(targetDefaultPenalty(TABLE, "tail", false)).toBe(0);
  });

  it("buys off half the penalty, rounded up, or all of it where the book says so", () => {
    expect(buyOff(-7)).toBe(4);
    expect(buyOff(-4)).toBe(2);
    expect(buyOff(-3, true)).toBe(3);
    expect(hardLevels(1)).toBe(0);
    expect(hardLevels(4)).toBe(3);
  });

  it("takes the best default, and levels up to its ceiling", () => {
    expect(targetedAttackBounds([5, null, 7], 4, 0)).toEqual({ level: 7, default: 7, ceiling: 11 });
    expect(targetedAttackBounds([7], 4, 99)).toEqual({ level: 11, default: 7, ceiling: 11 });
    expect(targetedAttackBounds([null], 4, 3)).toEqual({ level: null, default: null, ceiling: null });
  });
});
