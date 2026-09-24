import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHEMISTRY,
  COMBINED,
  DEDICATED_BONUS,
  PHYSICS,
  SCIENTIFIC,
  coilMishap,
  complexityPenalty,
  copyCost,
  darknessPenalty,
  instrumentOf,
  isDisplay,
  isGalvanometer,
  isScience,
  magneticPenalty,
  measurementError,
  noisePenalty,
  reading,
  tracingModifier,
  transducerFate,
  vanDeGraaffModifier,
} from "./rules.js";

/**
 * The names the catalogue (#478) gives the supplement's records on pp. 10-13,
 * and the kind each is read as. The medical tools on p. 13 are #491's.
 */
const CATALOGUE: Array<[string, string]> = [
  ["Gold Leaf Electroscope", "electrometer"],
  ["Quadrant Electrometer", "electrometer"],
  ["Vacuum-Tube Electrometer", "electrometer"],
  ["Solid-State Electrometer", "electrometer"],
  ["Moving Magnet Galvanometer", "galvanometer"],
  ["Mirror Galvanometer", "galvanometer"],
  ["D'Arsonval Moving Coil Galvanometer", "galvanometer"],
  ["Strip Chart Recorder", "recorder"],
  ["Multimeter", "meter"],
  ["Vacuum-Tube Voltmeter (VTVM)", "meter"],
  ["Field Effect Transistor Voltmeter (FET-VM)", "meter"],
  ["Audio Signal Generator", "signalGenerator"],
  ["Radio Signal Generator", "signalGenerator"],
  ["Signal Tracer", "signalTracer"],
  ["Lock-In Amplifier (TL7)", "lockIn"],
  ["Lock-In Amplifier (TL8)", "lockIn"],
  ["Oscillograph", "oscillograph"],
  ["High-Frequency Oscillograph", "oscillograph"],
  ["Oscilloscope", "oscilloscope"],
  ["Digital Oscilloscope", "oscilloscope"],
  ["Compact Digital Oscilloscope", "oscilloscope"],
  ["Spectrum Analyzer", "spectrumAnalyzer"],
  // The TL8 handheld model, from p. 48 (#480's record).
  ["Spectrum Analyzer (Digital)", "spectrumAnalyzer"],
  ["Wimshurst Generator", "staticMachine"],
  ["Van de Graaff Generator", "staticMachine"],
  ["Large Tesla Coil", "teslaCoil"],
  ["Small Tesla Coil", "teslaCoil"],
  ["Geiger-Müller Tube", "transducer"],
  ["Glass Electrode", "transducer"],
  ["Thermistor", "transducer"],
  ["Accelerometer (TL7)", "transducer"],
  ["Accelerometer (TL8)", "transducer"],
  ["Geiger Counter (TL6)", "dedicated"],
  ["Geiger Counter (TL8)", "dedicated"],
  ["pH Meter (TL6)", "dedicated"],
  ["pH Meter (TL7)", "dedicated"],
  ["pH Meter (TL8)", "dedicated"],
  ["Metal Detector (TL6)", "dedicated"],
  ["Metal Detector (TL8)", "dedicated"],
  ["Photodetector", "dedicated"],
  ["Light Meter", "dedicated"],
  ["Heart Monitor", "heartMonitor"],
  ["General-Purpose Analog Computer", "analogComputer"],
  ["Large General-Purpose Analog Computer", "analogComputer"],
];

/** The names of High-Tech's equipment records, the supplement's among them. */
function packNames(): Set<string> {
  const dir = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8")) as Array<{ name: string }>) names.add(doc.name);
  }
  return names;
}

describe("the instruments by name (HT:EE pp. 10-13)", () => {
  it("finds every name it expects in the catalogue's records", () => {
    const names = packNames();
    expect(CATALOGUE.map(([name]) => name).filter((name) => !names.has(name))).toEqual([]);
    // And High-Tech's own metal detector.
    expect(names.has("Metal Detector")).toBe(true);
  });

  it.each(CATALOGUE)("reads %s as a %s", (name, kind) => {
    expect(instrumentOf(name)?.kind).toBe(kind);
  });

  it("reads High-Tech's own metal detector and Geiger counters too, and nothing else", () => {
    expect(instrumentOf("Metal Detector")?.kind).toBe("dedicated");
    expect(instrumentOf("Geiger Counter (TL6)")?.skills[0]).toEqual({ skill: SCIENTIFIC, modifier: DEDICATED_BONUS });
    expect(instrumentOf("Handheld Metal Detector (TL8)")).toBeNull();
    expect(instrumentOf("Digital Heart Monitor")).toBeNull();
    expect(instrumentOf("Portable Diathermy Apparatus")).toBeNull();
  });

  it("finds any galvanometer, reckoned a moving-magnet one unless it says moving coil", () => {
    for (const name of ["Moving Magnet Galvanometer", "Mirror Galvanometer", "D'Arsonval Moving Coil Galvanometer", "Galvanometer", "Tangent galvanometer"]) expect(isGalvanometer(name)).toBe(true);
    expect(isGalvanometer("Oscilloscope")).toBe(false);
    expect(instrumentOf("Tangent Galvanometer")?.magnetic).toBe(true);
    expect(instrumentOf("D'Arsonval Moving Coil Galvanometer")?.magnetic).toBeUndefined();
    expect(instrumentOf("Mirror Galvanometer")).toMatchObject({ magnetic: true, telegraph: true });
    expect(instrumentOf("d’arsonval moving coil galvanometer")?.kind).toBe("galvanometer");
  });

  it("gives each its skills: the apparatus Physics or Electronics Operation (Scientific), the multimeter Electrician and Electronics Repair too", () => {
    expect(instrumentOf("Quadrant Electrometer")?.skills.map((s) => s.skill)).toEqual([PHYSICS, SCIENTIFIC]);
    expect(instrumentOf("Multimeter")?.skills.map((s) => s.skill)).toEqual([PHYSICS, SCIENTIFIC, "Electrician", "Electronics Repair"]);
    expect(instrumentOf("Signal Tracer")?.skills).toEqual([{ skill: "Electronics Repair", modifier: 0, any: true }]);
    expect(instrumentOf("Van de Graaff Generator")?.skills.map((s) => s.skill)).toEqual(["Hobby Skill (Feats of Science)", PHYSICS]);
    expect(instrumentOf("Large Tesla Coil")?.skills.map((s) => s.skill)).toEqual(["Electrician", "Hobby Skill (Feats of Science)", PHYSICS]);
    expect(instrumentOf("Glass Electrode")).toMatchObject({ science: CHEMISTRY, skills: [{ skill: SCIENTIFIC, modifier: 0 }, { skill: CHEMISTRY, modifier: 0 }] });
    expect(instrumentOf("pH Meter (TL7)")?.skills).toEqual([{ skill: SCIENTIFIC, modifier: 2 }, { skill: CHEMISTRY, modifier: 0 }]);
    // The photodetector's entry gives its own roll, with no dedicated +2.
    expect(instrumentOf("Photodetector")).toMatchObject({ darkness: true, skills: [{ skill: SCIENTIFIC, modifier: 0 }, { skill: PHYSICS, modifier: 0 }] });
    expect(instrumentOf("Light Meter")?.darkness).toBeUndefined();
  });

  it("knows the displays a transducer is read through", () => {
    for (const name of ["Mirror Galvanometer", "Multimeter", "Strip Chart Recorder", "Oscilloscope", "Oscillograph"]) expect(isDisplay(name)).toBe(true);
    for (const name of ["Thermistor", "Signal Tracer", "Geiger Counter (TL8)"]) expect(isDisplay(name)).toBe(false);
  });

  it("reads other analog computers as prototypes, a differential analyzer as Complex", () => {
    expect(instrumentOf("General-Purpose Analog Computer")).toMatchObject({ generalPurpose: true, grade: "average" });
    expect(instrumentOf("Bush Differential Analyzer")).toMatchObject({ kind: "analogComputer", grade: "complex" });
    expect(instrumentOf("Tide-Predicting Analog Computer")?.generalPurpose).toBeUndefined();
  });
});

describe("detection and measurement (HT:EE p. 10)", () => {
  it("puts a failed measurement off by 5% a point, 1% with good gear, 0.25% with fine", () => {
    expect(measurementError(3, "basic")).toBe(15);
    expect(measurementError(3, "good")).toBe(3);
    expect(measurementError(3, "fine")).toBe(0.75);
    expect(measurementError(2, "improvised")).toBe(10);
    expect(measurementError(2, undefined)).toBe(10);
  });

  it("reads a roll as found or not, exact or off, and a critical failure as a broken reading", () => {
    expect(reading("detect", { success: true, margin: 1 }, "basic")).toEqual({ kind: "detected" });
    expect(reading("detect", { success: false, margin: 1 }, "basic")).toEqual({ kind: "missed" });
    expect(reading("measure", { success: true, margin: 0 }, "basic")).toEqual({ kind: "exact" });
    expect(reading("measure", { success: false, margin: 4 }, "good")).toEqual({ kind: "off", percent: 4 });
    expect(reading("measure", { success: false, criticalFailure: true, margin: 8 }, "good")).toEqual({ kind: "broken" });
    expect(reading("operate", { success: false, margin: 4 }, "good")).toBeNull();
  });
});

describe("each instrument's modifiers (HT:EE pp. 10-13)", () => {
  it("takes a galvanometer's magnetic disturbance at -1 to -10", () => {
    expect(magneticPenalty(3)).toBe(-3);
    expect(magneticPenalty(14)).toBe(-10);
    expect(magneticPenalty(-2)).toBe(-0);
  });

  it("lets a lock-in amplifier disregard -6 of noise at TL7 and -9 at TL8", () => {
    expect(noisePenalty(4)).toBe(-4);
    expect(noisePenalty(8, 6)).toBe(-2);
    expect(noisePenalty(8, 9)).toBe(-0);
    expect(noisePenalty(12, 9)).toBe(-1);
  });

  it("traces FM at -5 with a tracer, AM and FM at +2 with a spectrum analyzer", () => {
    expect(tracingModifier("signalTracer", "am")).toBe(0);
    expect(tracingModifier("signalTracer", "fm")).toBe(-5);
    expect(tracingModifier("spectrumAnalyzer", "fm")).toBe(2);
    expect(tracingModifier("spectrumAnalyzer", "am")).toBe(2);
  });

  it("doubles a complex device's penalty against a science", () => {
    expect(isScience(PHYSICS)).toBe(true);
    expect(isScience(SCIENTIFIC)).toBe(false);
    expect(isScience("Electronics Repair (Scientific)")).toBe(false);
    expect(complexityPenalty(3, SCIENTIFIC)).toBe(-3);
    expect(complexityPenalty(3, CHEMISTRY)).toBe(-6);
    expect(complexityPenalty(9, PHYSICS)).toBe(-10);
  });

  it("takes the partial-darkness penalty on the photodetector's reading", () => {
    expect(darknessPenalty(4)).toBe(-4);
    expect(darknessPenalty(12)).toBe(-9);
  });

  it("risks the transducer on a critical failure: destroyed on a failed HT roll", () => {
    expect(transducerFate({ success: false })).toBe("destroyed");
    expect(transducerFate({ success: true })).toBe("damaged");
  });

  it("puts a combined device at -2 (HT:EE p. 9)", () => {
    expect(COMBINED).toBe(-2);
  });
});

describe("static machines and the Tesla coil (HT:EE pp. 11-12)", () => {
  it("gives +2 to resist the classroom Van de Graaff, -6 for each doubling and -3 for half as big again", () => {
    expect(vanDeGraaffModifier(9)).toBe(2);
    expect(vanDeGraaffModifier(13.5)).toBe(-1);
    expect(vanDeGraaffModifier(18)).toBe(-4);
    expect(vanDeGraaffModifier(27)).toBe(-7);
    expect(vanDeGraaffModifier(36)).toBe(-10);
    expect(vanDeGraaffModifier(6)).toBe(2);
  });

  it("burns on a critical failure, and sparks to an unshielded line on an 18", () => {
    expect(coilMishap({ roll: 17, criticalFailure: true }, false)).toEqual({ burn: true, line: false });
    expect(coilMishap({ roll: 18, criticalFailure: true }, false)).toEqual({ burn: true, line: true });
    expect(coilMishap({ roll: 18, criticalFailure: true }, true)).toEqual({ burn: true, line: false });
    expect(coilMishap({ roll: 10, criticalFailure: false }, false)).toEqual({ burn: false, line: false });
  });
});

describe("analog computers (HT:EE p. 13; Campaigns p. 474)", () => {
  it("costs a fifth of retail in parts for a copy, or all of it with labour", () => {
    expect(copyCost(30000, false)).toBe(6000);
    expect(copyCost(30000, true)).toBe(30000);
  });
});
