import { describe, expect, it } from "vitest";

import { speedRangeModifier } from "../../../../system/src/rules/ranged.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import { activeRangePenalty, emissionDetectionRange, rangeExtensionModifier, slowedRangeFactor } from "../../../shared/sensors/rules.js";
import {
  ACTIVE_SENSORS,
  GPR_MEDIUM,
  OPTICS,
  activeModes,
  triangulationFix,
  triangulationLevel,
  triangulationLines,
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

  it("reaches a different radio at the square root of the product of the ranges (HT:EE p. 28, in place of p. 38)", () => {
    const large = { size: "large" as const, range: 200 * MILE };
    const small = { size: "small" as const, range: 5 * MILE };
    // High-Tech's size steps gave 50 miles here; the supplement's rule gives about 31.6.
    expect(radioPairRange(large, small) / MILE).toBeCloseTo(Math.sqrt(1000), 6);
    expect(radioPairRange(small, small)).toBe(5 * MILE);
    // The supplement's example: a 50-mile set and a half-mile receiver reach 5 miles.
    expect(radioPairRange({ size: "large", range: 50 * MILE }, { size: "medium", range: 0.5 * MILE })).toBeCloseTo(5 * MILE, 6);
    // Size no longer counts, only range.
    expect(radioPairRange({ size: "large", range: 50 * MILE }, { size: "medium", range: 50 * MILE })).toBe(50 * MILE);
  });

  it("multiplies the link by the antenna at each end, and reaches anywhere with an uplink", () => {
    // A long antenna at one end doubles the link, at both ends both count (p. 39; HT:EE p. 28).
    expect(radioPairRange({ size: "small", range: 5 * MILE, longAntenna: true }, { size: "small", range: 5 * MILE })).toBe(10 * MILE);
    expect(radioPairRange({ size: "small", range: 5 * MILE, longAntenna: true }, { size: "small", range: 5 * MILE, longAntenna: true })).toBe(20 * MILE);
    // An antenna factor as set replaces the long antenna's.
    expect(radioPairRange({ size: "small", range: 5 * MILE, longAntenna: true, antenna: 10 }, { size: "small", range: 5 * MILE, antenna: 1.5 })).toBe(75 * MILE);
    expect(radioPairRange({ size: "small", range: 5 * MILE, antenna: 0 }, { size: "small", range: 5 * MILE })).toBe(0);
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

  it("is detected at twice its range, 1.5 times with ECCM", () => {
    expect(radioDetectionRange(1000, false)).toBe(2000);
    expect(radioDetectionRange(1000, true)).toBe(1500);
  });
});

describe("triangulation (HT:EE p. 47, revising High-Tech pp. 38-39)", () => {
  it("plots by hand at the lesser of Mathematics and EW-2, with HF/DF at EW, and lets a moved antenna use Amateur Radio", () => {
    expect(triangulationLevel({ system: "basic", ew: 14, mathematics: 13, antennas: "three" })).toEqual({ level: 12, skill: "plotting" });
    expect(triangulationLevel({ system: "improvised", ew: 14, mathematics: 10, antennas: "three" })).toEqual({ level: 10, skill: "plotting" });
    expect(triangulationLevel({ system: "hfdf", ew: 14, mathematics: 10, antennas: "three" })).toEqual({ level: 14, skill: "ew" });
    expect(triangulationLevel({ system: "basic", ew: 12, mathematics: 12, amateurRadio: 15, antennas: "moved" })).toEqual({ level: 15, skill: "amateurRadio" });
    expect(triangulationLevel({ system: "basic", ew: 12, mathematics: 12, amateurRadio: 15, antennas: "two" })).toEqual({ level: 10, skill: "plotting" });
  });

  it("is at +6, the baseline's bonus, the distance's penalty, -2 for two antennas, -5 improvised, and haste only without HF/DF", () => {
    const lines = triangulationLines({ system: "improvised", antennas: "two", baselineYards: 100, distanceYards: 2000, signalSeconds: 30 }, speedRangeModifier, timeSpentModifier);
    expect(lines).toEqual([
      { key: "bonus", value: 6 },
      { key: "baseline", value: -speedRangeModifier(100) },
      { key: "distance", value: speedRangeModifier(2000) },
      { key: "antennas", value: -2 },
      { key: "improvised", value: -5 },
      { key: "haste", value: -5 },
    ]);
    const hfdf = triangulationLines({ system: "hfdf", antennas: "three", baselineYards: 0, distanceYards: 0, signalSeconds: 10 }, speedRangeModifier, timeSpentModifier);
    expect(hfdf).toEqual([{ key: "bonus", value: 6 }]);
  });

  it("scatters by 20%, 10% or 5% of the range, exact on a margin of 6 or a critical, wrong on a critical failure", () => {
    expect(triangulationFix({ success: true, margin: 0 })).toEqual({ kind: "area", share: 0.2 });
    expect(triangulationFix({ success: true, margin: 2 })).toEqual({ kind: "area", share: 0.1 });
    expect(triangulationFix({ success: true, margin: 5 })).toEqual({ kind: "area", share: 0.05 });
    expect(triangulationFix({ success: true, margin: 6 })).toEqual({ kind: "exact" });
    expect(triangulationFix({ success: true, margin: 1, criticalSuccess: true })).toEqual({ kind: "exact" });
    expect(triangulationFix({ success: false, margin: -3 })).toEqual({ kind: "none" });
    expect(triangulationFix({ success: false, margin: -3, criticalFailure: true })).toEqual({ kind: "wrong" });
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
