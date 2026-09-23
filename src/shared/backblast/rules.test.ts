import { describe, expect, it } from "vitest";

import { inCone } from "../../../system/src/rules/modifier-areas.js";
import { backblastCone, backblastDice, backblastFromDice, reflectsAtFirer } from "./rules.js";

describe("backblast (High-Tech p. 147)", () => {
  it("counts the dice as the reach counts them", () => {
    expect(backblastDice("1d+2")).toBe(1);
    expect(backblastDice("4d")).toBe(4);
    expect(backblastDice("5dx2")).toBe(10);
    expect(backblastDice("7d×2")).toBe(14);
    expect(backblastDice("burn")).toBe(0);
  });

  it("reaches 2 yards a die at full and 6 at half for a burning blast, 2 for countermass", () => {
    expect(backblastFromDice("1d+2", "burn")).toEqual({ damage: "1d+2", kind: "burn", fullYards: 2, halfYards: 6 });
    expect(backblastFromDice("4d", "burn")).toEqual({ damage: "4d", kind: "burn", fullYards: 8, halfYards: 24 });
    expect(backblastFromDice("2d", "cr")).toEqual({ damage: "2d", kind: "cr", fullYards: 4, halfYards: 4 });
    expect(backblastFromDice("", "burn")).toBeNull();
  });

  it("fills a 60-degree cone behind the firer, the other way from the target", () => {
    const blast = backblastFromDice("1d+2", "burn")!;
    // A yard is 100 pixels; the firer at the origin aims east, so the cone points west.
    const firer = { x: 0, y: 0 };
    const aim = { x: 2000, y: 0 };
    const full = backblastCone(firer, aim, blast.fullYards, 100)!;
    const half = backblastCone(firer, aim, blast.halfYards, 100)!;
    expect(full.direction).toBe(180);
    expect([full.length, full.base]).toEqual([200, 100]);
    expect(half.width).toBeCloseTo(2 * 600 * Math.tan(Math.PI / 6));
    const yards = (x: number, y: number) => ({ x: x * 100, y: y * 100 });
    // As the system tests a point against it.
    expect(inCone(yards(-1, 0), firer, full)).toBe(true);
    expect(inCone(yards(-3, 1), firer, full)).toBe(false);
    expect(inCone(yards(-3, 1), firer, half)).toBe(true);
    expect(inCone(yards(-5, 2), firer, half)).toBe(true);
    // Past 30 degrees off the line behind, or in front, or too far.
    expect(inCone(yards(-3, 3), firer, half)).toBe(false);
    expect(inCone(yards(1, 0), firer, half)).toBe(false);
    expect(inCone(yards(-7, 0), firer, half)).toBe(false);
    expect(backblastCone(firer, firer, 6, 100)).toBeNull();
  });

  it("reflects a burning blast at the firer indoors, not countermass", () => {
    expect(reflectsAtFirer(backblastFromDice("1d+2", "burn")!)).toBe(true);
    expect(reflectsAtFirer(backblastFromDice("2d", "cr")!)).toBe(false);
  });
});
