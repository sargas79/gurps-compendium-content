import { describe, expect, it } from "vitest";

import { speedRangeModifier } from "../../../../system/src/rules/ranged.js";
import { activeRangePenalty, emissionDetectionRange, rangeExtensionModifier, slowedRangeFactor } from "../../../shared/sensors/rules.js";
import {
  ACTIVE_SENSORS,
  GPR_MEDIUM,
  OPTICS,
  activeModes,
  directionFinderFix,
  directionalMicLevels,
  hydrophoneBonus,
  hydrophoneModifiers,
  isTelegraph,
  opticSenses,
  radioByName,
  radioDetectionRange,
  radioOptions,
  radioPairRange,
  soundLocationModifier,
  tapIsContested,
} from "./rules.js";

const MILE = 1760;

describe("telegraphy (p. 36)", () => {
  it("knows the telegraphs, and contests a tap from TL6", () => {
    expect(isTelegraph("Telegraph Key")).toBe(true);
    expect(isTelegraph("Register Telegraph")).toBe(true);
    expect(isTelegraph("Stock Ticker")).toBe(false);
    expect(tapIsContested(5)).toBe(false);
    expect(tapIsContested(6)).toBe(true);
  });
});

describe("radios (pp. 37-39)", () => {
  it("reads a radio's size and range from its record, by TL", () => {
    expect(radioByName("Large Radio (TL6)", 6)).toEqual({ size: "large", tl: 6, range: 50 * MILE });
    expect(radioByName("Medium Radio (TL8)", 8)).toEqual({ size: "medium", tl: 8, range: 35 * MILE });
    expect(radioByName("Tiny Radio (TL7)", 7)?.range).toBe(0.5 * MILE);
    // A hand-made radio takes its item's TL, the nearest printed where the table has none.
    expect(radioByName("Small Radio", 7)?.range).toBe(2 * MILE);
    expect(radioByName("Tiny Radio", 6)?.range).toBe(0.5 * MILE);
    expect(radioByName("Cabinet Radio", 6)).toBeNull();
  });

  it("reaches a radio of another size from the shorter range: the book's example is 50 miles", () => {
    const large = { size: "large" as const, range: 200 * MILE };
    const small = { size: "small" as const, range: 5 * MILE };
    expect(radioPairRange(large, small)).toBe(50 * MILE);
    expect(radioPairRange(small, small)).toBe(5 * MILE);
    expect(radioPairRange({ size: "medium", range: 35 * MILE }, small)).toBe(15 * MILE);
    expect(radioPairRange({ size: "large", range: 200 * MILE }, { size: "tiny", range: 2 * MILE })).toBe(60 * MILE);
    // A shorter-ranged radio that is the larger one takes no steps.
    expect(radioPairRange({ size: "large", range: 50 * MILE }, { size: "medium", range: 100 * MILE })).toBe(50 * MILE);
  });

  it("doubles a radio with a long antenna, and reaches anywhere with an uplink", () => {
    expect(radioPairRange({ size: "small", range: 5 * MILE, longAntenna: true }, { size: "small", range: 5 * MILE })).toBe(5 * MILE);
    expect(radioPairRange({ size: "small", range: 5 * MILE, longAntenna: true }, { size: "small", range: 5 * MILE, longAntenna: true })).toBe(10 * MILE);
    expect(radioPairRange({ size: "medium", range: 35 * MILE, satelliteUplink: true }, { size: "tiny", range: 2 * MILE })).toBe(Infinity);
  });

  it("stretches range at -1 per 10% to double, and slows data for more (shared with Ultra-Tech)", () => {
    expect(rangeExtensionModifier(55 * MILE, 50 * MILE)).toBe(-1);
    expect(rangeExtensionModifier(100 * MILE, 50 * MILE)).toBe(-10);
    expect(rangeExtensionModifier(101 * MILE, 50 * MILE)).toBeNull();
    expect(slowedRangeFactor(1 / 4)).toBe(2);
    expect(slowedRangeFactor(1 / 10000)).toBe(100);
  });

  it("offers each option from its TL, the uplink only on medium and large radios", () => {
    expect(radioOptions("small", 6)).toEqual(["codeOnly", "directionFinder", "intercept", "radiotelephone", "longAntenna"]);
    expect(radioOptions("small", 8)).toContain("gps");
    expect(radioOptions("small", 8)).not.toContain("satelliteUplink");
    expect(radioOptions("medium", 8)).toContain("satelliteUplink");
    expect(radioOptions("tiny", 7)).toContain("eccm");
  });

  it("is detected at twice its range, 1.5 times with ECCM; a margin of 5 fixes a transmitter exactly", () => {
    expect(radioDetectionRange(1000, false)).toBe(2000);
    expect(radioDetectionRange(1000, true)).toBe(1500);
    expect(directionFinderFix(0)).toBe("general");
    expect(directionFinderFix(5)).toBe("exact");
  });
});

describe("active sensors (pp. 45-47)", () => {
  it("gives each its range by TL: large sonar grows, radar doubles at TL8", () => {
    const sonar = ACTIVE_SENSORS["Large Sonar"]!;
    expect([6, 7, 8].map((tl) => sonar.range(tl))).toEqual([4000, 8000, 20000]);
    const radar = ACTIVE_SENSORS["Medium Radar"]!;
    expect(radar.range(7)).toBe(15 * MILE);
    expect(radar.range(8)).toBe(30 * MILE);
    expect(ACTIVE_SENSORS["Handheld GPR"]!.range(8)).toBeCloseTo(1 / 3);
    expect(GPR_MEDIUM.ice).toBe(20);
  });

  it("offers the modes from their TLs: tactical sonar at TL6, radar modes at TL8", () => {
    expect(activeModes(ACTIVE_SENSORS["Large Sonar"]!, 6)).toEqual(["tactical"]);
    expect(activeModes(ACTIVE_SENSORS["Large Sonar"]!, 8)).toEqual(["tactical", "imaging"]);
    expect(activeModes(ACTIVE_SENSORS["Small Sonar"]!, 8)).toEqual(["imaging"]);
    expect(activeModes(ACTIVE_SENSORS["Small Radar"]!, 7)).toEqual([]);
    expect(activeModes(ACTIVE_SENSORS["Small Radar"]!, 8)).toEqual(["tactical", "lpi"]);
    expect(activeModes(ACTIVE_SENSORS["Thru-Wall Radar"]!, 8)).toEqual([]);
  });

  it("takes -2 per doubling past range, and is detected at twice it (shared with Ultra-Tech)", () => {
    expect(activeRangePenalty(3 * 1760, 3 * 1760)).toBe(0);
    expect(activeRangePenalty(6 * 1760, 3 * 1760)).toBe(-2);
    expect(activeRangePenalty(6 * 1760, 3 * 1760, true)).toBe(-4);
    expect(emissionDetectionRange(1000)).toBe(2000);
    expect(emissionDetectionRange(1000, true)).toBe(750);
  });
});

describe("passive visual sensors (pp. 47-48)", () => {
  it("gives optics Telescopic Vision by doublings", () => {
    expect(opticSenses(OPTICS["Binoculars (TL5)"]!, false)).toMatchObject({ telescopic: 2, nightVision: 0, imposed: false });
    expect(opticSenses(OPTICS["Spotting Scope"]!, false)?.telescopic).toBe(4);
    expect(opticSenses(OPTICS["Military-Grade Binoculars (TL8)"]!, false)).toMatchObject({ telescopic: 3, protectedVision: true });
  });

  it("gives night-vision optics their level, two more under IR light to 9, and the disadvantages", () => {
    expect(opticSenses(OPTICS["Night-Vision Binoculars (TL7)"]!, false)).toMatchObject({ nightVision: 4, telescopic: 4, imposed: true });
    expect(opticSenses(OPTICS["Night-Vision Binoculars (TL7)"]!, true)?.nightVision).toBe(6);
    expect(opticSenses(OPTICS["Night Vision Goggles"]!, true)?.nightVision).toBe(9);
    // The earliest binoculars work only with an illuminator.
    expect(opticSenses(OPTICS["Early Night-Vision Binoculars"]!, false)?.nightVision).toBe(0);
    expect(opticSenses(OPTICS["Early Night-Vision Binoculars"]!, true)?.nightVision).toBe(2);
  });

  it("gives thermographs Infravision and the disadvantages; a camera is no sense", () => {
    expect(opticSenses(OPTICS["Thermal-Imaging Goggles"]!, false)).toMatchObject({ infravision: true, telescopic: 2, imposed: true });
    expect(opticSenses(OPTICS["Thermal-Imaging Surveillance Camera"]!, false)).toBeNull();
  });
});

describe("indirect passive sensors (pp. 48-50)", () => {
  it("gives a hydrophone +2 a TL after its introduction", () => {
    expect(hydrophoneBonus("Large Hydrophone", 6)).toBe(4);
    expect(hydrophoneBonus("Large Hydrophone", 8)).toBe(8);
    expect(hydrophoneBonus("Medium Hydrophone", 7)).toBe(4);
    expect(hydrophoneBonus("Small Hydrophone", 8)).toBe(2);
    expect(hydrophoneBonus("Geiger Counter", 8)).toBeNull();
  });

  it("takes the target's size and speed as bonuses, its range and the current as penalties", () => {
    const lines = hydrophoneModifiers({ sm: 7, speed: 10, range: 700, current: 0 }, speedRangeModifier);
    expect(lines).toEqual([
      { key: "size", value: 7 },
      { key: "speed", value: 4 },
      { key: "range", value: -15 },
    ]);
    expect(hydrophoneModifiers({ sm: 0, speed: 0, range: 0, current: 3 }, speedRangeModifier)).toEqual([{ key: "current", value: -1 }]);
  });

  it("locates a sound by miles and decibels, and gives a directional mike Parabolic Hearing", () => {
    expect(soundLocationModifier(10, 100)).toBe(0);
    expect(soundLocationModifier(7, 110)).toBe(4);
    expect(soundLocationModifier(12, 90)).toBe(-3);
    expect(directionalMicLevels("Directional Microphone", 7)).toBe(2);
    expect(directionalMicLevels("Directional Microphone", 8)).toBe(3);
    expect(directionalMicLevels("Microphone", 8)).toBeNull();
  });
});
