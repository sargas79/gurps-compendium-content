import { describe, expect, it } from "vitest";

import { speedRangeModifier } from "../../../../system/src/rules/ranged.js";
import { STUNTS, acrobaticDodge, standModifiers, standOutcome, stuntAttackPenalty, stuntRoll } from "./rules.js";

const stunt = (key: string) => STUNTS.find((s) => s.key === key)!;
const total = (roll: { base: number; modifiers: Array<{ value: number }> } | null) => roll ? roll.base + roll.modifiers.reduce((s, m) => s + m.value, 0) : null;

/** Acrobatic Stand, acrobatic movement, and Acrobatic and Flying Attacks (GURPS Martial Arts pp. 98, 105-107). */
describe("Acrobatic Stand", () => {
  it("rolls Acrobatics-6 less encumbrance, +4 all-out: Acrobatics 14 unencumbered is 8", () => {
    expect(14 + standModifiers(0, false).reduce((s, l) => s + l.value, 0)).toBe(8);
    expect(14 + standModifiers(2, true).reduce((s, l) => s + l.value, 0)).toBe(10);
  });

  it("from lying: up on a success, sitting on a failure, still lying on a critical failure", () => {
    const roll = (success: boolean, criticalSuccess = false, criticalFailure = false) => ({ success, criticalSuccess, criticalFailure });
    expect(standOutcome("lying", roll(true), false)).toEqual({ posture: "standing", note: "none" });
    expect(standOutcome("lying", roll(true, true), true)).toEqual({ posture: "crouching", note: "asStep" });
    expect(standOutcome("lying", roll(false), false).posture).toBe("sitting");
    expect(standOutcome("lying", roll(false, false, true), false).posture).toBe("lying");
  });

  it("from sitting: up as a step, up with the turn over, or down", () => {
    expect(standOutcome("sitting", { success: true, criticalSuccess: false, criticalFailure: false }, false)).toEqual({ posture: "standing", note: "asStep" });
    expect(standOutcome("sitting", { success: false, criticalSuccess: false, criticalFailure: false }, false)).toEqual({ posture: "standing", note: "turnOver" });
    expect(standOutcome("crawling", { success: false, criticalSuccess: false, criticalFailure: true }, false).posture).toBe("lying");
  });
});

describe("movement stunts", () => {
  const levels: Record<string, number> = { DX: 12, Acrobatics: 14, Jumping: 13 };
  const levelOf = (name: string) => levels[name] ?? null;

  it("rolls the best of its skills: a tumble is plain Acrobatics, a tic-tac the better of Acrobatics-4 and Jumping-4 at -2 a further bounce", () => {
    expect(total(stuntRoll({ stunt: stunt("tumbling"), levelOf, input: 0, speedRange: speedRangeModifier }))).toBe(14);
    expect(total(stuntRoll({ stunt: stunt("ticTac"), levelOf, input: 1, speedRange: speedRangeModifier }))).toBe(8);
    expect(stuntRoll({ stunt: stunt("skidding"), levelOf: () => null, input: 0, speedRange: speedRangeModifier })).toBeNull();
  });

  it("swings 10 yards as an Acrobatic Attack at Acrobatics-6, as the book's example does", () => {
    const roll = stuntRoll({ stunt: stunt("swinging"), levelOf, input: 10, acrobaticAttack: true, speedRange: speedRangeModifier });
    expect(roll?.modifiers.map((m) => m.value)).toEqual([-4, -2]);
    // And the attack: Move and Attack's -4, the Acrobatic Attack's -2, held to 9.
    expect(-4 + stuntAttackPenalty("acrobatic")).toBe(-6);
  });

  it("vaults at -4 through a window and -2 a repeat", () => {
    expect(total(stuntRoll({ stunt: stunt("vaulting"), levelOf, input: 1, window: true, speedRange: speedRangeModifier }))).toBe(8);
  });

  it("makes the next dodge +2 after a stunt that worked and -2 after one that didn't", () => {
    expect(acrobaticDodge(true)).toBe(2);
    expect(acrobaticDodge(false)).toBe(-2);
  });

  it("puts a Flying Attack at -5 in all", () => {
    expect(-4 + stuntAttackPenalty("flying")).toBe(-5);
    expect(stuntAttackPenalty(null)).toBe(0);
  });
});
