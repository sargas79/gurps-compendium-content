/**
 * The supplement Electricity and Electronics' fuzes and homing weapons
 * (HT:EE pp. 48-49): the figures, and the records they name.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLOCKS,
  FUZE_RECORDS,
  MISSILE_SEEKERS,
  PROXIMITY_DETECTION_YARDS,
  TIME_FUZE_MAX_SECONDS,
  fuzeKind,
  homes,
  isClock,
  proximitySetting,
  proximityTriggers,
  seekerChoice,
  seekerModifier,
  seekerOf,
  seekerTags,
  seekersOf,
  timeFuzeFires,
  timeSetting,
} from "./rules.js";

const EQUIPMENT = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
const PACKS: any[] = readdirSync(EQUIPMENT).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(EQUIPMENT, f), "utf8")));
const byName = (name: string) => PACKS.find((d) => d.name === name);

describe("the records the rules name", () => {
  it.each([...Object.keys(FUZE_RECORDS), ...CLOCKS, ...Object.keys(MISSILE_SEEKERS), "Laser Designator"])("%s is in High-Tech's packs", (name) => {
    expect(byName(name)).toBeTruthy();
  });

  it("the fuzes cite the supplement, and the TL8 ones weigh half (HT:EE p. 48)", () => {
    for (const name of Object.keys(FUZE_RECORDS)) expect(byName(name).system.reference).toBe("High-Tech: Electricity and Electronics p. 48");
    expect(byName("Proximity Fuze (TL8)").system.weight).toBe(byName("Proximity Fuze (TL7)").system.weight / 2);
  });

  it("the missiles with a seeker are the homing ones", () => {
    for (const name of Object.keys(MISSILE_SEEKERS)) expect(byName(name).system.rangedModes.every(homes)).toBe(true);
  });
});

describe("fuzes (HT:EE p. 48)", () => {
  it("reads a fuze's kind from its name", () => {
    expect(fuzeKind("Impact Fuze (TL8)")).toBe("impact");
    expect(fuzeKind("Proximity Fuze (TL7)")).toBe("proximity");
    expect(fuzeKind("Time Fuze")).toBe("time");
    expect(fuzeKind("Time Clock")).toBeNull();
  });

  it("knows the clocks a time fuze is improvised from", () => {
    expect(isClock("Electronic Clock")).toBe(true);
    expect(isClock("Digital Watch")).toBe(true);
    expect(isClock("TV Watch")).toBe(false);
  });

  it("sets a proximity fuze no farther than the 25 yards it detects", () => {
    expect(PROXIMITY_DETECTION_YARDS).toBe(25);
    expect(proximitySetting(10)).toBe(10);
    expect(proximitySetting(40)).toBe(25);
    expect(proximitySetting(0)).toBe(1);
  });

  it("goes off with something within the set distance", () => {
    expect(proximityTriggers(8, 10)).toBe(true);
    expect(proximityTriggers(10, 10)).toBe(true);
    expect(proximityTriggers(12, 10)).toBe(false);
    expect(proximityTriggers(30, 40)).toBe(false);
    expect(proximityTriggers(null, 25)).toBe(false);
  });

  it("sets a time fuze up to three minutes, and fires when they have passed", () => {
    expect(TIME_FUZE_MAX_SECONDS).toBe(180);
    expect(timeSetting(600)).toBe(180);
    expect(timeSetting(-3)).toBe(1);
    expect(timeFuzeFires(9, 10)).toBe(false);
    expect(timeFuzeFires(10, 10)).toBe(true);
  });
});

describe("homing seekers (HT:EE p. 49)", () => {
  it("gives High-Tech's missiles their seekers", () => {
    expect(seekersOf("GD FIM-92A Stinger, 70mm")).toEqual(["infrared"]);
    expect(seekersOf("Hughes BGM-71A TOW, 127mm")).toEqual([]);
  });

  it("takes -2 for an infrared seeker on a warm hull, and -3 for a torpedo's vital area", () => {
    expect(seekerModifier("infraredHull")).toEqual({ key: "warmHull", value: -2 });
    expect(seekerModifier("acousticVitals")).toEqual({ key: "vitalArea", value: -3 });
    expect(seekerModifier("infrared")).toBeNull();
    expect(seekerOf("infraredHull")).toBe("infrared");
    expect(seekerOf("acousticVitals")).toBe("acoustic");
  });

  it("tags the attack with the seeker's sense", () => {
    expect(seekerTags("infrared")).toEqual(["infrared"]);
    expect(seekerTags("radar")).toEqual(["radar"]);
    expect(seekerTags("laser")).toContain("laser");
  });

  it("reads only the choices it knows", () => {
    expect(seekerChoice("laser")).toBe("laser");
    expect(seekerChoice("")).toBeNull();
    expect(seekerChoice("sonar")).toBeNull();
  });
});
