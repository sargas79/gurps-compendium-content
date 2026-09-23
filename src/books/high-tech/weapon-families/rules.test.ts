import { describe, expect, it } from "vitest";

import { airBand, airShotsLeft, heldSeconds, pistolWhip, stunAfterSeconds, suppressorWorks, unsafeRevolver } from "./rules.js";

const GIRANDONI = [
  { from: 11, damage: "1d+2", halfDamageRange: 50, maxRange: 400 },
  { from: 21, damage: "1d+1", halfDamageRange: 40, maxRange: 340 },
];

describe("air guns (High-Tech p. 88)", () => {
  it("counts the shots left in the charge", () => {
    expect(airShotsLeft(30, 0)).toBe(30);
    expect(airShotsLeft(30, 29)).toBe(1);
    expect(airShotsLeft(30, 40)).toBe(0);
  });

  it("fires the first ten at the table's figures, then the Girandoni's weaker stages", () => {
    expect(airBand(GIRANDONI, 0)).toBeNull();
    expect(airBand(GIRANDONI, 9)).toBeNull();
    expect(airBand(GIRANDONI, 10)?.damage).toBe("1d+2");
    expect(airBand(GIRANDONI, 19)?.damage).toBe("1d+2");
    expect(airBand(GIRANDONI, 20)).toMatchObject({ damage: "1d+1", halfDamageRange: 40, maxRange: 340 });
  });
});

describe("ranged electric stunners (High-Tech p. 89)", () => {
  it("stuns for (20 - HT) seconds after the current, at least one", () => {
    expect(stunAfterSeconds(10)).toBe(10);
    expect(stunAfterSeconds(12)).toBe(8);
    expect(stunAfterSeconds(20)).toBe(1);
    expect(stunAfterSeconds(25)).toBe(1);
  });

  it("holds the trigger as the shooter says, or for the gun's own time", () => {
    expect(heldSeconds(undefined, 5)).toBe(5);
    expect(heldSeconds(0, 5)).toBe(5);
    expect(heldSeconds(8, 5)).toBe(8);
  });
});

describe("revolvers and pistols (High-Tech pp. 93, 159)", () => {
  it("treats TL5 revolvers as unsafe unless they have a safety", () => {
    expect(unsafeRevolver(true, 5, "")).toBe(true);
    expect(unsafeRevolver(true, 6, "")).toBe(false);
    expect(unsafeRevolver(false, 5, "")).toBe(false);
    expect(unsafeRevolver(true, 5, "safe")).toBe(false);
    expect(unsafeRevolver(true, 6, "unsafe")).toBe(true);
  });

  it("pistol whips at thrust-1 plus the absolute value of Bulk, or brains at swing+1 with Axe/Mace", () => {
    // The book's example: a Bulk -2 pistol does thr+1.
    expect(pistolWhip(-2, false)).toEqual({ skill: "Brawling", attack: "thr", modifier: 1, reach: "C" });
    expect(pistolWhip(-1, false).modifier).toBe(0);
    expect(pistolWhip(-3, true)).toEqual({ skill: "Axe/Mace", attack: "sw", modifier: 1, reach: "1" });
  });

  it("won't suppress an ordinary revolver", () => {
    expect(suppressorWorks(true, false)).toBe(false);
    expect(suppressorWorks(true, true)).toBe(true);
    expect(suppressorWorks(false, false)).toBe(true);
  });
});
