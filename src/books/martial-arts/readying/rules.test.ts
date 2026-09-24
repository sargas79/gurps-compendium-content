import { describe, expect, it } from "vitest";

import { afterDraw, carryModifier, multipleDrawPenalty, rapidGripPenalty, situationModifiers, specialtyOf } from "./rules.js";

const sum = (lines: Array<{ value: number }>) => lines.reduce((s, l) => s + l.value, 0);

/** Readying weapons (GURPS Martial Arts pp. 101-104). */
describe("multiple Fast-Draw", () => {
  it("draws a rapier free, a dagger off-hand at -4, and after throwing it another off-hand at -6", () => {
    let counts = { master: 0, off: 0 };
    expect(multipleDrawPenalty(counts, "master", 1, 0)).toBe(0);
    counts = afterDraw(counts, "master", 1);
    const offHand = (c: typeof counts) => multipleDrawPenalty(c, "off", 1, 0) + sum(situationModifiers({ posture: "standing", grappled: false, upsideDown: false, moving: false, hand: "off", carry: null }));
    expect(offHand(counts)).toBe(-4);
    counts = afterDraw(counts, "off", 1);
    expect(offHand(counts)).toBe(-6);
  });

  it("draws four daggers at once at -8, and the next draw with that hand is at -8 too", () => {
    let counts = { master: 0, off: 0 };
    expect(multipleDrawPenalty(counts, "master", 4, 0)).toBe(-8);
    counts = afterDraw(counts, "master", 4);
    expect(multipleDrawPenalty(counts, "master", 1, 0)).toBe(-8);
  });

  it("takes the worse hand for a two-handed draw, and halves or quarters for Heroic Archer and Weapon Master", () => {
    expect(multipleDrawPenalty({ master: 1, off: 0 }, "both", 1, 0)).toBe(-2);
    expect(multipleDrawPenalty({ master: 3, off: 0 }, "master", 1, 1)).toBe(-3);
    expect(multipleDrawPenalty({ master: 3, off: 0 }, "master", 1, 2)).toBe(-1);
  });
});

describe("Fast-Draw from odd positions", () => {
  it("reads the specialty and the carry location", () => {
    expect(specialtyOf("Fast-Draw (Two-Handed Sword)")).toBe("twohandedsword");
    expect(carryModifier("knife", "teeth")).toBe(-5);
    expect(carryModifier("sword", "sameHip")).toBe(-1);
    expect(carryModifier("sword", "sameHip", { reversedGrip: true })).toBe(0);
    expect(carryModifier("sword", "oppositeHip", { noScabbard: true })).toBe(-2);
    expect(carryModifier("sword", "teeth")).toBeNull();
  });

  it("ignores a boot's reach penalty and the posture's from a low posture", () => {
    expect(sum(situationModifiers({ posture: "kneeling", grappled: false, upsideDown: false, moving: false, hand: "master", carry: "boot" }))).toBe(0);
    expect(sum(situationModifiers({ posture: "lying", grappled: true, upsideDown: false, moving: true, hand: "master", carry: null }))).toBe(-10);
  });

  const bootDraw = (specialty: string, posture: string) =>
    sum(situationModifiers({ posture, grappled: false, upsideDown: false, moving: false, hand: "master", carry: "boot" })) + (carryModifier(specialty, "boot", { posture }) ?? 0);

  it.each(["crouching", "kneeling", "sitting"])("draws a knife or force sword from a boot at +0 when %s (p. 104)", (posture) => {
    expect(carryModifier("knife", "boot", { posture })).toBe(0);
    expect(carryModifier("forcesword", "boot", { posture })).toBe(0);
    expect(bootDraw("knife", posture)).toBe(0);
  });

  it("keeps a boot's -2 standing, lying or with no posture given, and a low posture's -2 elsewhere", () => {
    expect(carryModifier("knife", "boot")).toBe(-2);
    expect(bootDraw("knife", "standing")).toBe(-2);
    expect(bootDraw("knife", "lying")).toBe(-6);
    expect(carryModifier("knife", "belt", { posture: "kneeling" })).toBe(-2);
    expect(sum(situationModifiers({ posture: "kneeling", grappled: false, upsideDown: false, moving: false, hand: "master", carry: "belt" }))).toBe(-2);
  });
});

describe("grip changes", () => {
  it("rolls a rapid grip change at -4 two-handed, -6 one-handed, unpenalized with a tonfa", () => {
    expect(rapidGripPenalty({ twoHanded: true, tonfa: false })).toBe(-4);
    expect(rapidGripPenalty({ twoHanded: false, tonfa: false })).toBe(-6);
    expect(rapidGripPenalty({ twoHanded: false, tonfa: true })).toBe(0);
  });
});
