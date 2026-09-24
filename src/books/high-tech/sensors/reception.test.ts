/**
 * Radio reception from the supplement Electricity and Electronics (HT:EE pp.
 * 27-30): mismatched radios, antennas, the tuning roll and shortwave skip.
 */

import { describe, expect, it } from "vitest";

import { rangeExtensionModifier } from "../../../shared/sensors/rules.js";
import {
  ANTENNAS,
  CONDITIONS,
  MAX_SKIPS,
  SKIP,
  aimsItself,
  antennaFactor,
  driftsByDefault,
  hasLargeAntenna,
  mismatchedRange,
  skipApplies,
  skipLines,
  skipsFor,
  tuningRoll,
} from "./reception.js";

const MILE = 1760;
const quiet = { conditions: 0, hearing: 0, galvanometer: false, enhanced: false };

describe("mix and match (HT:EE p. 28)", () => {
  it("reaches the square root of the product of the two ranges", () => {
    // The book's example: 50 miles and half a mile reach 5.
    expect(mismatchedRange(50, 0.5)).toBeCloseTo(5, 9);
    expect(mismatchedRange(10, 10)).toBe(10);
    expect(mismatchedRange(Infinity, 2)).toBe(Infinity);
    expect(mismatchedRange(0, 2)).toBe(0);
  });
});

describe("antennas (HT:EE p. 28)", () => {
  it("prices each antenna and gives its factor from its TL", () => {
    expect(ANTENNAS.longAntenna).toEqual({ range: 2, cost: 1.25, weight: 1.25, tl: 6 });
    expect(ANTENNAS.dipoleAntenna).toEqual({ range: 1.5, cost: 1.1, weight: 1.1, tl: 6 });
    expect(ANTENNAS.directionalAntenna).toEqual({ range: 10, cost: 1.5, weight: 1.5, tl: 7 });
  });

  it("uses the best antenna pointing the right way", () => {
    expect(antennaFactor({})).toBe(1);
    expect(antennaFactor({ longAntenna: true })).toBe(2);
    expect(antennaFactor({ dipoleAntenna: true })).toBe(1.5);
    // Nothing off the ends of a dipole's wires.
    expect(antennaFactor({ dipoleAntenna: true }, { dipole: "endOn" })).toBe(0);
    expect(antennaFactor({ dipoleAntenna: true, longAntenna: true }, { dipole: "endOn" })).toBe(2);
    // A directional antenna only once aimed.
    expect(antennaFactor({ directionalAntenna: true })).toBe(1);
    expect(antennaFactor({ directionalAntenna: true, longAntenna: true }, { aimed: true })).toBe(10);
  });

  it("aims itself at TL8, and counts any of them as a large antenna", () => {
    expect(aimsItself(7)).toBe(false);
    expect(aimsItself(8)).toBe(true);
    expect(hasLargeAntenna({})).toBe(false);
    expect(hasLargeAntenna({ dipoleAntenna: true })).toBe(true);
  });
});

describe("the tuning roll (HT:EE pp. 27, 29-30)", () => {
  it("offers interference from -10 to good conditions of +4", () => {
    expect(CONDITIONS[0]).toBe(-10);
    expect(CONDITIONS.at(-1)).toBe(4);
    expect(CONDITIONS).toHaveLength(15);
  });

  it("needs no roll for a clear signal in range, and none out of reach", () => {
    expect(tuningRoll({ rangeModifier: 0, ...quiet })).toEqual({ needed: false, lines: [] });
    // Good conditions alone, or a bonus alone, call for no roll.
    expect(tuningRoll({ rangeModifier: 0, ...quiet, conditions: 3, enhanced: true, hearing: 2 })).toEqual({ needed: false, lines: [] });
    expect(tuningRoll({ rangeModifier: null, ...quiet })).toBeNull();
    // -10 blocks the signal outright.
    expect(tuningRoll({ rangeModifier: 0, ...quiet, conditions: -10 })).toBeNull();
  });

  it("takes the range, the interference, Hearing or a galvanometer, and a software radio's +4", () => {
    const faint = rangeExtensionModifier(1.25 * MILE, MILE);
    expect(faint).toBe(-3);
    expect(tuningRoll({ rangeModifier: faint, ...quiet, conditions: -2, hearing: 2, enhanced: true })).toEqual({
      needed: true,
      lines: [{ key: "range", value: -3 }, { key: "conditions", value: -2 }, { key: "hearing", value: 2 }, { key: "enhanced", value: 4 }],
    });
    // A galvanometer's +1 replaces the Hearing modifiers, good or bad.
    expect(tuningRoll({ rangeModifier: 0, ...quiet, conditions: -4, hearing: -4, galvanometer: true })!.lines).toEqual([{ key: "conditions", value: -4 }, { key: "galvanometer", value: 1 }]);
    // Good conditions offset a faint signal.
    expect(tuningRoll({ rangeModifier: -2, ...quiet, conditions: 4 })!.lines).toEqual([{ key: "range", value: -2 }, { key: "conditions", value: 4 }]);
  });

  it("takes a TL6 set to be coil-tuned", () => {
    expect(driftsByDefault(6)).toBe(true);
    expect(driftsByDefault(7)).toBe(false);
  });
});

describe("shortwave (HT:EE p. 30)", () => {
  it("skips 2,000 miles at a time, six reaching anywhere", () => {
    expect(SKIP).toBe(2000 * MILE);
    expect(skipsFor(10 * MILE)).toBe(1);
    expect(skipsFor(2000 * MILE)).toBe(1);
    expect(skipsFor(2001 * MILE)).toBe(2);
    expect(skipsFor(50000 * MILE)).toBe(MAX_SKIPS);
  });

  it("is -1 each further skip and -2 each bad condition", () => {
    expect(skipLines(5000 * MILE, { summer: true, solarFlare: true })).toEqual([{ key: "skips", value: -2 }, { key: "summer", value: -2 }, { key: "solarFlare", value: -2 }]);
    // Six skips: -5.
    expect(skipLines(12000 * MILE, {})).toEqual([{ key: "skips", value: -5 }]);
  });

  it("skips past the ground range where it beats stretching it", () => {
    const one = skipLines(300 * MILE, {});
    expect(skipApplies(40 * MILE, 50 * MILE, 0, one)).toBe(false);
    expect(skipApplies(300 * MILE, 50 * MILE, null, one)).toBe(true);
    // At 60 miles the stretch is -2; one clear skip is better.
    expect(skipApplies(60 * MILE, 50 * MILE, -2, one)).toBe(true);
    // A skip in a solar flare in summer (-4) is worse than a -2 stretch.
    expect(skipApplies(60 * MILE, 50 * MILE, -2, skipLines(60 * MILE, { summer: true, solarFlare: true }))).toBe(false);
  });

  it("rolls a skipping signal with the skip's penalties in place of the range", () => {
    const skip = skipLines(5000 * MILE, { timeOfDay: true });
    expect(tuningRoll({ rangeModifier: null, ...quiet, skip })!.lines).toEqual([{ key: "skips", value: -2 }, { key: "timeOfDay", value: -2 }]);
    // One skip in good conditions: no roll.
    expect(tuningRoll({ rangeModifier: null, ...quiet, skip: skipLines(1500 * MILE, {}) })).toEqual({ needed: false, lines: [] });
  });
});
