import { describe, expect, it } from "vitest";

import {
  VISUAL_SENSORS,
  activeByName,
  activeRangePenalty,
  chemsnifferBonuses,
  commByName,
  commModeFactors,
  commRange,
  emissionDetectionRange,
  gravscannerDetection,
  hydrophoneDetection,
  magnificationAt,
  mixedRange,
  radscannerDetection,
  rangeExtensionModifier,
  sensorGloveBonus,
  sizeStepFactor,
  slowedRangeFactor,
  telescopicLevels,
  visualSenses,
} from "./rules.js";

const MILE = 1760;

describe("communicators (Ultra-Tech pp. 43-46)", () => {
  it("reads the comm from the record's name", () => {
    expect(commByName("Radio Communicator (Very Large)")).toEqual({ family: "radio", size: "veryLarge" });
    expect(commByName('Neural Communicator ("Neurocomm") (Tiny)')).toEqual({ family: "neurocomm", size: "tiny" });
    expect(commByName("Cable Jack")).toBeNull();
  });

  it("scales range by TL", () => {
    expect(commRange("radio", "tiny", 9)).toBe(MILE);
    expect(commRange("radio", "tiny", 11)).toBe(5 * MILE);
    expect(commRange("sonar", "small", 10)).toBe(4.5 * MILE);
    expect(commRange("gravityRipple", "veryLarge", 10)).toBe(100000 * MILE);
    expect(commRange("gravityRipple", "veryLarge", 11)).toBe(1_000_000 * MILE);
    expect(commRange("neutrino", "micro", 11)).toBeNull();
  });

  it("works out the book's example: a medium radio reaches a tiny one at 10 miles", () => {
    expect(sizeStepFactor(1)).toBe(3);
    expect(sizeStepFactor(4)).toBe(100);
    expect(mixedRange("radio", "medium", "tiny", 9)).toBe(10 * MILE);
  });

  it("stretches range at -1 per 10%, to double", () => {
    expect(rangeExtensionModifier(1000, 1000)).toBe(0);
    expect(rangeExtensionModifier(1150, 1000)).toBe(-2);
    expect(rangeExtensionModifier(2000, 1000)).toBe(-10);
    expect(rangeExtensionModifier(2100, 1000)).toBeNull();
    expect(slowedRangeFactor(1 / 100)).toBe(10);
  });

  it("prices receive- and transmit-only comms", () => {
    expect(commModeFactors("radio", "receiver")).toEqual({ cost: 0.1, weight: 0.2 });
    expect(commModeFactors("laser", "transmitter")).toEqual({ cost: 0.9, weight: 0.8 });
    expect(commModeFactors("neutrino", "receiver")).toEqual({ cost: 0.5, weight: 0.5 });
  });
});

describe("passive sensors (Ultra-Tech pp. 60-63)", () => {
  it("grows magnification by TL", () => {
    const binoculars = VISUAL_SENSORS["Infrared Binoculars"]!;
    expect(magnificationAt(binoculars, 9, 11)).toBe(64);
    expect(magnificationAt(VISUAL_SENSORS["Hyperspectral Goggles or Visor"]!, 9, 12)).toBe(8);
    expect(magnificationAt(VISUAL_SENSORS["Night Vision Goggles or Visor"]!, 9, 10)).toBe(8);
  });

  it("gives worn optics their senses, but not cameras", () => {
    expect(telescopicLevels(64)).toBe(6);
    expect(visualSenses({ ...VISUAL_SENSORS["Night Vision Goggles or Visor"]!, tl: 9 })).toEqual({ nightVision: 9, infravision: false, hyperspectral: false, telescopic: 2 });
    expect(visualSenses({ ...VISUAL_SENSORS["PESA Sensor Array"]!, tl: 10 })).toBeNull();
  });

  it("sets indirect sensors' bonuses by TL", () => {
    expect(chemsnifferBonuses(11)).toMatchObject({ detect: 6, acute: 2 });
    expect(hydrophoneDetection("medium", 11)).toBe(14);
    expect(gravscannerDetection("small", 12)).toBe(6);
    expect(gravscannerDetection("veryLarge", 9)).toBe(6);
    expect(radscannerDetection("large", 12)).toBe(22);
    expect(sensorGloveBonus(11)).toBe(6);
  });
});

describe("active sensors (Ultra-Tech pp. 63-66)", () => {
  it("reads the sensor from the record's name", () => {
    expect(activeByName("Medium Terahertz Radar")).toEqual({ kind: "terahertz", size: "medium" });
    expect(activeByName("Tactical Sensor Turret")).toBeNull();
  });

  it("takes -2 per doubling past the range, and halves it for LPI", () => {
    expect(activeRangePenalty(1000, 1000)).toBe(0);
    expect(activeRangePenalty(1500, 1000)).toBe(-2);
    expect(activeRangePenalty(4000, 1000)).toBe(-4);
    expect(activeRangePenalty(1000, 1000, true)).toBe(-2);
  });

  it("is detected at twice its range, or 1.5 times the halved range with LPI", () => {
    expect(emissionDetectionRange(1000)).toBe(2000);
    expect(emissionDetectionRange(1000, true)).toBe(750);
  });
});
