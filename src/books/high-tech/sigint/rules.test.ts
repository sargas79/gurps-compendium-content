import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { instrumentOf } from "../instruments/rules.js";
import { radioByName } from "../sensors/rules.js";
import {
  aimHaste,
  aimShape,
  channelHaste,
  channelMinutes,
  detectionRolled,
  directSequenceTuning,
  encipheredTimeBonus,
  isCipherMachine,
  machineBonus,
  rareScanPenalty,
  scanSeconds,
  spectrumAnalyzerOf,
  spreadDetectModifier,
  spreadDetectionRange,
  spreadJammingBonus,
} from "./rules.js";

describe("spread spectrum (HT:EE pp. 46-47)", () => {
  it("is -4 to detect when hopping, and caps detection at 1.5 times the range with direct sequence", () => {
    expect(spreadDetectModifier({ hopping: true })).toBe(-4);
    expect(spreadDetectModifier({ direct: true })).toBe(0);
    expect(spreadDetectionRange(1000, {})).toBe(2000);
    expect(spreadDetectionRange(1000, { hopping: true })).toBe(2000);
    expect(spreadDetectionRange(1000, { direct: true })).toBe(1500);
  });

  it("helps through a selective jammer by hopping, a broad-spectrum one by direct sequence", () => {
    expect(spreadJammingBonus({ hopping: true }, "selective")).toBe(4);
    expect(spreadJammingBonus({ hopping: true }, "broad")).toBe(0);
    expect(spreadJammingBonus({ direct: true }, "broad")).toBe(4);
    expect(spreadJammingBonus({ direct: true }, "selective")).toBe(0);
  });

  it("offsets interference on the tuning roll with direct sequence, never beyond it", () => {
    expect(directSequenceTuning(-6)).toBe(4);
    expect(directSequenceTuning(-2)).toBe(2);
    expect(directSequenceTuning(0)).toBe(0);
    expect(directSequenceTuning(3)).toBe(0);
  });
});

describe("signals intelligence (HT:EE pp. 47-48)", () => {
  it("rolls for a continuous signal only when something penalizes it", () => {
    expect(detectionRolled("continuous", [{ value: 2 }])).toBe(false);
    expect(detectionRolled("continuous", [{ value: -1 }])).toBe(true);
    expect(detectionRolled("ongoing", [])).toBe(true);
    expect(detectionRolled("rare", [])).toBe(true);
  });

  it("takes the haste of a shared watch, rounded down: -5 for two, -8 for four", () => {
    expect(channelHaste(1)).toBe(0);
    expect(channelHaste(2)).toBe(-5);
    expect(channelHaste(3)).toBe(-7);
    expect(channelHaste(4)).toBe(-8);
    expect(channelHaste(20)).toBe(-9);
    expect(channelMinutes(3)).toBe(3);
  });

  it("scans in 15 minutes at TL6, 5 at TL7, 5 seconds with TL8 computer scanning", () => {
    expect(scanSeconds(5, false)).toBeNull();
    expect(scanSeconds(6, false)).toBe(900);
    expect(scanSeconds(7, true)).toBe(300);
    expect(scanSeconds(8, false)).toBe(300);
    expect(scanSeconds(8, true)).toBe(5);
  });

  it("scans for rare signals at -10 or -8, and -4 more with a dipole, -9 with a directional antenna", () => {
    expect(rareScanPenalty(6, "whip")).toBe(-10);
    expect(rareScanPenalty(7, "dipole")).toBe(-12);
    expect(rareScanPenalty(8, "directional")).toBe(-17);
  });

  it("aims a dipole as an area, a directional antenna as a cone, with haste only at TL6 or improvised", () => {
    expect(aimShape("dipole")).toBe("area");
    expect(aimShape("directional")).toBe("cone");
    expect(aimHaste(6, false, 18)).toBe(-7);
    expect(aimHaste(8, true, 30)).toBe(-5);
    expect(aimHaste(8, false, 10)).toBe(0);
    expect(aimHaste(6, false, 0)).toBe(0);
  });
});

describe("cipher machines (HT:EE p. 48)", () => {
  it("offsets the -4 for enciphered text with time, never beyond it", () => {
    expect(encipheredTimeBonus(1)).toBe(0);
    expect(encipheredTimeBonus(2)).toBe(1);
    expect(encipheredTimeBonus(8)).toBe(3);
    expect(encipheredTimeBonus(30)).toBe(4);
  });

  it("gives the bombe +1 only against a cipher machine's code, Colossus +2, and neither to an ad-libbed code", () => {
    expect(machineBonus("bombe", "basic6")).toBe(1);
    expect(machineBonus("bombe", "manual")).toBe(0);
    expect(machineBonus("colossus", "basic7")).toBe(2);
    expect(machineBonus("colossus", "improvised")).toBe(0);
    expect(machineBonus("", "basic6")).toBe(0);
  });
});

/** The names of High-Tech's equipment records, the supplement's among them. */
function packNames(): Set<string> {
  const dir = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const doc of JSON.parse(readFileSync(join(dir, file), "utf8")) as Array<{ name: string }>) names.add(doc.name);
  }
  return names;
}

describe("the records the rules match by name", () => {
  const names = packNames();
  it.each([
    ["Spectrum Analyzer", () => spectrumAnalyzerOf("Spectrum Analyzer") === "lab"],
    ["Spectrum Analyzer (Digital)", () => spectrumAnalyzerOf("Spectrum Analyzer (Digital)") === "digital"],
    ["Cipher Machine", () => isCipherMachine("Cipher Machine")],
    ["Oscilloscope", () => instrumentOf("Oscilloscope")?.kind === "oscilloscope"],
    ["Digital Oscilloscope", () => instrumentOf("Digital Oscilloscope")?.kind === "oscilloscope"],
    ["Compact Digital Oscilloscope", () => instrumentOf("Compact Digital Oscilloscope")?.kind === "oscilloscope"],
    ["Large Radio (TL6)", () => radioByName("Large Radio (TL6)", 6) !== null],
    ["Medium Radio (TL8)", () => radioByName("Medium Radio (TL8)", 8) !== null],
  ])("finds %s in the packs, and reads it", (name, reads) => {
    expect(names.has(name)).toBe(true);
    expect(reads()).toBe(true);
  });
});
