/**
 * The records the Electricity and Electronics supplement's rules match by
 * name, in the folders whose own tests don't read the packs (#505): every
 * name a rule looks for is a record of High-Tech's packs, and the rule knows
 * it. A record renamed in the packs, or a name misspelled in a table, fails
 * here rather than leaving the rule silently idle in play.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isKeylogger, isIsolator, isJunctionDetector, isLaserMike, isLockInAmplifier, isResonantCavity, isShieldedWallet, isWhiteNoiseGenerator } from "./covert-listening/rules.js";
import { amplifierOf, audioKind, basicHydrophoneBonus, printedQuality } from "./audio/rules.js";
import { isShopvac, isShredder, kitchenGearOf, KITCHEN_GEAR, POWER_TOOLS, powerToolOf, printedMagnet, WEATHER_APPLIANCES, weatherApplianceOf } from "./appliances/rules.js";
import { isLightPen, isStylus } from "./computing/rules.js";
import { shockGear } from "./electricity/rules.js";
import { electromedicineOf } from "./electromedicine/rules.js";
import { HT_DEVICES } from "./medicine/rules.js";
import { PRINTED_RADIOS } from "./sensors/design.js";
import { RADIO_PERIPHERALS } from "./sensors/reception.js";
import { ACTIVE_SENSORS } from "./sensors/rules.js";
import { bugOf, isContactMike, isSpectrumAnalyzer, jammableByName, jammerByName, supplementJammerByName } from "./surveillance/rules.js";

const PACKS = join(import.meta.dirname, "../../../books/high-tech/packs-src");
const records = readdirSync(PACKS).flatMap((kind) =>
  readdirSync(join(PACKS, kind))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(PACKS, kind, f), "utf8")) as Array<{ name: string; type: string }>),
);
const names = new Set(records.map((r) => r.name));
const equipment = records.filter((r) => r.type === "equipment").map((r) => r.name);

/** Each name is a record, and the rule matches it. */
function matched(cases: ReadonlyArray<readonly [string, (name: string) => unknown]>): void {
  it.each(cases)("%s is a record, and matched", (name, rule) => {
    expect(names.has(name), `${name} is not in High-Tech's packs`).toBe(true);
    expect(rule(name)).toBeTruthy();
  });
}

describe("appliances (HT:EE pp. 14, 21-24)", () => {
  matched([
    ["Incandescent Bulb Heater", weatherApplianceOf],
    ["Resistance Wire Heater", weatherApplianceOf],
    ["Large Fan", weatherApplianceOf],
    ["Small Fan (TL6)", weatherApplianceOf],
    ["Small Fan (TL8)", weatherApplianceOf],
    ["Microwave Oven", kitchenGearOf],
    ["Induction Cooker", kitchenGearOf],
    ["Hot Plate", kitchenGearOf],
    ["Shredder", isShredder],
    ["Shopvac", isShopvac],
    ["Portable Electromagnet", printedMagnet],
    ["Power Drill", powerToolOf],
    ["Compact Power Drill", powerToolOf],
    ["Circular Saw", powerToolOf],
    ["Compact Circular Saw", powerToolOf],
    ["Arc Welder", powerToolOf],
    ["Soldering Iron (TL6)", powerToolOf],
    ["Soldering Iron (TL7)", powerToolOf],
  ]);

  it("has a record for every row of its tables", () => {
    for (const row of WEATHER_APPLIANCES) expect(equipment.some((n) => weatherApplianceOf(n) === row), String(row.pattern)).toBe(true);
    for (const row of KITCHEN_GEAR) expect(equipment.some((n) => kitchenGearOf(n) === row), String(row.pattern)).toBe(true);
    for (const row of POWER_TOOLS) expect(equipment.some((n) => powerToolOf(n) === row), String(row.pattern)).toBe(true);
  });
});

describe("audio (HT:EE pp. 30-32)", () => {
  matched([
    ["Microphone", audioKind],
    ["Microphone (TL8)", audioKind],
    ["Throat Microphone (TL6)", audioKind],
    ["Ear Microphone System", audioKind],
    ["Directional Microphone", audioKind],
    ["Parabolic Microphone (TL6)", audioKind],
    ["Shotgun Microphone (TL7)", audioKind],
    ["Headphones", audioKind],
    ["Stereo Headphones", audioKind],
    ["Wireless Headphones", audioKind],
    ["Headphones and Throat Mike", audioKind],
    ["Earbuds", audioKind],
    ["Loudspeaker", audioKind],
    ["Tactical Headset", audioKind],
    ["Hearing Aid (TL6)", audioKind],
    ["Public Address System", (n) => amplifierOf(n, 8)],
    ["Guitar Amplifier (TL6)", (n) => amplifierOf(n, 6) && printedQuality(n, 6) === -2],
    ["Bullhorn", (n) => amplifierOf(n, 8)],
    ["Acoustic Hailing Device", (n) => amplifierOf(n, 8)],
    ["Hydrophone", (n) => basicHydrophoneBonus(n, 8)],
  ]);

  it("reads every kind from some record", () => {
    const kinds = new Set(equipment.map(audioKind).filter(Boolean));
    expect([...kinds].sort()).toEqual(["amplifier", "earbuds", "headphones", "headset", "hearingAid", "microphone", "parabolic", "shotgun", "speaker"]);
  });
});

describe("computer interfaces (HT:EE p. 40)", () => {
  matched([
    ["Stylus", isStylus],
    ["Light Pen", isLightPen],
  ]);
});

describe("covert listening (HT:EE pp. 44-45)", () => {
  matched([
    ["Isolator", isIsolator],
    ["White Noise Generator (TL7)", isWhiteNoiseGenerator],
    ["Lock-In Amplifier (TL7)", isLockInAmplifier],
    ["Lock-In Amplifier (TL8)", isLockInAmplifier],
    ["Laser Mike", isLaserMike],
    ["Nonlinear Junction Detector", isJunctionDetector],
    ["Keylogger", isKeylogger],
    ["Shielded Wallet", isShieldedWallet],
    ["Resonant Cavity Microphone", isResonantCavity],
    ["Contact Microphone", (n) => isContactMike(n) && bugOf(n)],
    ["Audio Bug (TL7)", bugOf],
    ["Bug Detector", (n) => names.has(n)],
  ]);
});

describe("electrical hazards and protection (HT:EE pp. 14-15)", () => {
  matched([
    ["Electrical Gloves (Standard)", (n) => { const gear = shockGear(n); return gear?.kind === "gloves" && gear.dr === 25; }],
    ["Electrical Gloves (High-End)", (n) => { const gear = shockGear(n); return gear?.kind === "gloves" && gear.dr === 75; }],
    ["Faraday Suit", (n) => shockGear(n)?.kind === "faraday"],
    ["Hot Stick (Wood)", (n) => shockGear(n)?.kind === "hotStick"],
    ["Hot Stick (Fiberglass)", (n) => shockGear(n)?.kind === "hotStick"],
    ["Lineman's Pliers", (n) => shockGear(n)?.kind === "handTool"],
    ["Needle Nose Pliers", (n) => shockGear(n)?.kind === "handTool"],
    ["Screwdrivers", (n) => shockGear(n)?.kind === "handTool"],
    ["Wire Cutters", (n) => shockGear(n)?.kind === "handTool"],
    ["Wire Stripper", (n) => shockGear(n)?.kind === "handTool"],
  ]);

  it("has the Hot Stick technique the rules look for", () => {
    expect(records.find((r) => r.name === "Hot Stick" && r.type === "technique")).toBeTruthy();
  });
});

describe("electromedicine and the defibrillator (HT:EE pp. 13-14, 21)", () => {
  matched([
    ["Portable Diathermy Apparatus", electromedicineOf],
    ["Heating Pad", electromedicineOf],
    ["Electroconvulsive Therapy Device", electromedicineOf],
    ["Laser Scalpel", electromedicineOf],
    ["Automated External Defibrillator", (n) => HT_DEVICES.some(([pattern]) => pattern.test(n))],
    ["Automatic External Defibrillator (AED)", (n) => HT_DEVICES.some(([pattern]) => pattern.test(n))],
    ["Digital Stethoscope", (n) => names.has(n)],
  ]);
});

describe("radios and rangefinding (HT:EE pp. 28-29, 35)", () => {
  it("names a record for every printed radio, radio peripheral and active sensor", () => {
    for (const name of [...Object.keys(PRINTED_RADIOS), ...Object.keys(RADIO_PERIPHERALS), ...Object.keys(ACTIVE_SENSORS)]) {
      expect(names.has(name), `${name} is not in High-Tech's packs`).toBe(true);
    }
  });
});

describe("jammers and what they jam (HT:EE pp. 49-50)", () => {
  matched([
    ["Area Jammer (TL6)", jammerByName],
    ["Area Jammer (TL8)", jammerByName],
    ["Expendable Radio Jammer", jammerByName],
    ["Cell-Phone Jammer", jammerByName],
    ["Large Jammer (TL6)", (n) => supplementJammerByName(n, 6)],
    ["Portable Jammer (TL7)", (n) => supplementJammerByName(n, 7)],
    ["Radar Jammer (TL7)", (n) => supplementJammerByName(n, 7)],
    ["Radar Spoofer", (n) => supplementJammerByName(n, 8)],
    ["Cellular Phone", (n) => jammableByName(n, 8)?.kind === "cellPhone"],
    ["Early Cellular Phone", (n) => jammableByName(n, 7)?.kind === "cellPhone"],
    ["Spectrum Analyzer", isSpectrumAnalyzer],
    ["Spectrum Analyzer (Digital)", isSpectrumAnalyzer],
  ]);
});
