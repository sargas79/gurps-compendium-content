import { describe, expect, it } from "vitest";

import {
  ARC_FLASH_LUX,
  FLASHBULB,
  GLARE_LUX,
  LAMPS,
  actualWatts,
  batteryMultiplier,
  beamDrift,
  brightTaskPenalty,
  darknessLux,
  falloffSteps,
  flashbulbStepAt,
  glareOutcome,
  glareRoll,
  lampDarknessAt,
  lampFrom,
  lampLux,
  lampNamed,
  luxStep,
  stepDarkness,
  stepLux,
} from "./rules.js";

describe("the Illumination Levels table (HT:EE p. 20)", () => {
  it("reads the table's rows as steps, and extends them by their own pattern", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stepLux)).toEqual([0.05, 0.2, 1, 5, 20, 100, 500, 2000, 10000, 50000]);
    // The glare threshold and the arc flash sit on the pattern (HT:EE pp. 9, 20).
    expect(stepLux(10)).toBe(GLARE_LUX);
    expect(stepLux(11)).toBe(ARC_FLASH_LUX);
    expect(stepLux(-1)).toBeCloseTo(0.01);
  });

  it("finds the row a light comes up to", () => {
    expect(luxStep(0.05)).toBe(0);
    expect(luxStep(0.19)).toBe(0);
    expect(luxStep(9)).toBe(3);
    expect(luxStep(100)).toBe(5);
    expect(luxStep(150)).toBe(5);
    expect(luxStep(499.99)).toBe(5);
    expect(luxStep(900_000)).toBe(10);
    expect(luxStep(1_000_000)).toBe(11);
    expect(luxStep(0)).toBe(-Infinity);
  });

  it("gives -5 to 0 by the table, a point more per step below it, never total darkness", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(stepDarkness)).toEqual([5, 4, 3, 2, 1, 0, 0]);
    expect(stepDarkness(-2)).toBe(7);
    expect(stepDarkness(-10)).toBe(9);
    expect(stepDarkness(-Infinity)).toBe(9);
  });

  it("falls off a step at 2 yards, two at 3-5, three at 6-10, three more per tenfold", () => {
    expect([0, 1, 1.5, 2, 3, 5, 6, 10, 11, 100, 101, 1000].map(falloffSteps)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 6, 6, 9, 9]);
  });

  it("gives the lux a darkness leaves at least", () => {
    expect(darknessLux(0)).toBe(100);
    expect(darknessLux(3)).toBe(1);
    expect(darknessLux(5)).toBe(0.05);
  });
});

describe("lamps (HT:EE pp. 20-22)", () => {
  it("multiplies the rated wattage by the geometry", () => {
    // A 100-watt exposed bulb: 150 lux.
    expect(lampLux({ ...lampNamed("Floor Lamp")!, watts: 100 })).toBe(150);
    // A flashlight's 1.5-watt bulb in a conical beam: 9 lux, the table's flashlight beam (-2).
    const flashlight = lampNamed("Flashlight")!;
    expect(lampLux(flashlight)).toBe(9);
    expect(lampDarknessAt(flashlight, 5)).toBe(2);
    expect(lampLux(lampNamed("Ceiling Lamp")!)).toBe(180);
    expect(lampLux(lampNamed("Desk Lamp")!)).toBe(1800);
  });

  it("uses the efficiency for power and battery life, or for more light with a brighter element", () => {
    const led = lampNamed("Light-Emitting Diode Bulb")!;
    // An LED bulb rated at 100 watts actually uses about 17 (HT:EE p. 20).
    expect(Math.round(actualWatts({ ...led, watts: 100 }))).toBe(17);
    expect(batteryMultiplier({ ...lampNamed("Flashlight")!, element: "led" })).toBe(6);
    const bright = { ...lampNamed("Flashlight")!, element: "led" as const, brighter: true };
    expect(lampLux(bright)).toBe(54);
    expect(batteryMultiplier(bright)).toBe(1);
    expect(actualWatts(lampNamed("Carbon Filament Bulb")!)).toBe(60);
  });

  it("falls off from a yard for a lamp lighting all round", () => {
    const lamp = { ...lampNamed("Table Lamp")!, watts: 100 };
    expect([1, 2, 4, 8, 50, 500].map((d) => lampDarknessAt(lamp, d))).toEqual([0, 1, 2, 3, 6, 9]);
  });

  it("gives a beam's lux out to its range, falling off past it, never worse than -9", () => {
    const spot = lampNamed("Spotlight")!;
    expect(lampLux(spot)).toBe(600);
    expect(lampDarknessAt(spot, 100)).toBe(0);
    expect(lampDarknessAt(spot, 200)).toBe(0);
    expect(lampDarknessAt(spot, 500)).toBe(1);
    expect(lampDarknessAt(spot, 1000)).toBe(2);
    expect(lampDarknessAt(lampNamed("Penlight")!, 100_000)).toBe(9);
  });

  it("reads a lamp's stored settings over the record's", () => {
    const base = lampNamed("Floor Lamp")!;
    expect(lampFrom({ watts: 100, element: "led", brighter: true }, base)).toEqual({ ...base, watts: 100, element: "led", brighter: true });
    expect(lampFrom({ watts: -3, element: "candle", geometry: "sphere", range: "" }, base)).toEqual(base);
    expect(lampNamed("Kerosene Lantern")).toBeNull();
    expect(Object.keys(LAMPS)).toContain("Rugged Flashlight");
  });
});

describe("tasks that need bright light (HT:EE p. 20)", () => {
  it("is -2 without the light the task needs", () => {
    expect(brightTaskPenalty(150, 500)).toBe(-2);
    expect(brightTaskPenalty(1800, 500)).toBe(0);
    expect(brightTaskPenalty(10_000, 50_000)).toBe(-2);
  });
});

describe("aiming a beam (HT:EE p. 20)", () => {
  it("lands yards equal to the margin to the left on odd, right on even", () => {
    expect(beamDrift(-3, 5)).toEqual({ yards: 3, side: "left" });
    expect(beamDrift(-1, 2)).toEqual({ yards: 1, side: "right" });
  });
});

describe("glare (HT:EE pp. 9, 20-21)", () => {
  it("calls for the roll five steps above the adaptation, at -1 a step past it", () => {
    // Eyes used to 1 lux (step 2): 500 lux (step 6) is four steps up, 2,000 five.
    expect(glareRoll(6, 2)).toEqual({ required: false, modifier: 0 });
    expect(glareRoll(7, 2)).toEqual({ required: true, modifier: 0 });
    expect(glareRoll(9, 2)).toEqual({ required: true, modifier: -2 });
  });

  it("calls for it from 200,000 lux whatever the eyes are used to", () => {
    expect(glareRoll(luxStep(200_000), 8)).toEqual({ required: true, modifier: 0 });
    // The arc flash's 1,000,000 lux is -1 (p. 9).
    expect(glareRoll(luxStep(ARC_FLASH_LUX), 5).modifier).toBe(-1);
    expect(glareRoll(luxStep(ARC_FLASH_LUX), 8).modifier).toBe(-1);
  });

  it("gives a flashbulb 900,000 lux at a yard, falling off", () => {
    expect(FLASHBULB.lookingAt).toBe(-5);
    expect(flashbulbStepAt(1)).toBe(10);
    expect(flashbulbStepAt(4)).toBe(8);
  });

  it("reads the roll: fine by 3+, re-adapt by 0-2, dazzled for minutes, blinded for seconds on a critical failure", () => {
    expect(glareOutcome({ success: true, margin: 3 })).toEqual({ kind: "unaffected" });
    expect(glareOutcome({ success: true, margin: 0 })).toEqual({ kind: "readapt" });
    expect(glareOutcome({ success: false, margin: -4 })).toEqual({ kind: "dazzled", minutes: 4 });
    expect(glareOutcome({ success: false, margin: -6, criticalFailure: true })).toEqual({ kind: "blinded", seconds: 6, minutes: 6 });
  });
});
