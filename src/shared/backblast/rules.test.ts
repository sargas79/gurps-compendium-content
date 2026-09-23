import { describe, expect, it } from "vitest";

import { backblastDice, backblastFromDice, backblastZone, reflectsAtFirer } from "./rules.js";

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
    const firer = { x: 0, y: 0 };
    const aim = { x: 20, y: 0 };
    expect(backblastZone(firer, aim, { x: -1, y: 0 }, blast)).toBe("full");
    expect(backblastZone(firer, aim, { x: -2, y: 1 }, blast)).toBe("half");
    expect(backblastZone(firer, aim, { x: -5, y: 2 }, blast)).toBe("half");
    // Past 30 degrees off the line behind, or in front, or too far.
    expect(backblastZone(firer, aim, { x: -1, y: 1 }, blast)).toBeNull();
    expect(backblastZone(firer, aim, { x: 1, y: 0 }, blast)).toBeNull();
    expect(backblastZone(firer, aim, { x: -7, y: 0 }, blast)).toBeNull();
  });

  it("reflects a burning blast at the firer indoors, not countermass", () => {
    expect(reflectsAtFirer(backblastFromDice("1d+2", "burn")!)).toBe(true);
    expect(reflectsAtFirer(backblastFromDice("2d", "cr")!)).toBe(false);
  });
});
