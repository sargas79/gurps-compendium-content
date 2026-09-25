/**
 * The figures of the supplement's electronic weapons and NNEMP (HT:EE
 * pp. 49-51), and the records they are read from: every name the rules
 * match is a record of High-Tech's packs.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NNEMP,
  darkAdapted,
  fromSupplement,
  hearingLoss,
  isActiveDenial,
  isCattleProd,
  isElectricStunner,
  isEyeLaser,
  isHailingDevice,
  isLaserPointer,
  isNnemp,
  nnempModifier,
  nnempRepairPenalty,
  obscurementBonus,
  prodPain,
  stunnerSkillBonus,
  tinnitusMinutes,
  withinPulse,
} from "./rules.js";

const EQUIPMENT = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
const records = readdirSync(EQUIPMENT).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(EQUIPMENT, f), "utf8")) as any[]);
const named = (name: string) => records.filter((r) => r.name === name);

describe("the records the rules match (#480)", () => {
  it.each([
    ["Stun Gun", isElectricStunner],
    ["Stun Baton", isElectricStunner],
    ["Cattle Prod", isElectricStunner],
    ["Tasertron TE-76", isElectricStunner],
    ["TASER M26", isElectricStunner],
    ["Air Taser Model 34000", isElectricStunner],
    ["Cattle Prod", isCattleProd],
    ["Dazzler", isEyeLaser],
    ["Laser Pointer", isEyeLaser],
    ["Green Laser Pointer", isEyeLaser],
    ["Laser Pointer", isLaserPointer],
    ["Green Laser Pointer", isLaserPointer],
    ["Acoustic Hailing Device", isHailingDevice],
    ["Active Denial System", isActiveDenial],
    ["NNEMP", isNnemp],
  ] as const)("%s is in the packs, and matched", (name, matches) => {
    expect(named(name).length).toBeGreaterThan(0);
    expect(matches(name)).toBe(true);
  });

  it("tells the supplement's cattle prod from High-Tech's by the page it cites", () => {
    const refs = named("Cattle Prod").map((r) => fromSupplement(r.system.reference));
    expect(refs.sort()).toEqual([false, true]);
  });

  it("gives the supplement's Air Taser High-Tech's ranged-stunner field, and cites the supplement for the lasers", () => {
    expect(named("Air Taser Model 34000")[0].system.extensions["gurps-compendium-content"].firearm.stunSeconds).toBe(5);
    for (const name of ["Dazzler", "Laser Pointer", "Green Laser Pointer"]) expect(named(name).every((r) => fromSupplement(r.system.reference))).toBe(true);
  });

  it("gives the green laser pointer the Ranged Weapons Table's 10/100 (HT:EE p. 51, note [3])", () => {
    const [red] = named("Laser Pointer");
    const [green] = named("Green Laser Pointer");
    expect(red.system.rangedModes[0]).toMatchObject({ halfDamageRange: 2, maxRange: 20 });
    expect(green.system.rangedModes[0]).toMatchObject({ halfDamageRange: 10, maxRange: 100, afflictionModifier: -2, accuracy: 5 });
    expect(green.system.extensions["gurps-compendium-content"].device.marketYear).toBe(2000);
  });

  it("matches nothing else", () => {
    expect(isElectricStunner("Stun Grenade")).toBe(false);
    expect(isEyeLaser("Laser Sight")).toBe(false);
    expect(isLaserPointer("Dazzler")).toBe(false);
    expect(isNnemp("Nuclear Bomb")).toBe(false);
  });
});

describe("electric stunners (HT:EE pp. 49, 51)", () => {
  it("help Interrogation +6, Intimidation +2, and a prod Animal Handling +2", () => {
    expect(stunnerSkillBonus("Interrogation", false)).toEqual({ kind: "interrogation", value: 6 });
    expect(stunnerSkillBonus("Intimidation", false)).toEqual({ kind: "intimidation", value: 2 });
    expect(stunnerSkillBonus("Animal Handling (Equines)", true)).toEqual({ kind: "animalHandling", value: 2 });
    expect(stunnerSkillBonus("Animal Handling (Equines)", false)).toBeNull();
    expect(stunnerSkillBonus("Brawling", true)).toBeNull();
  });

  it("the prod pains a minute a point of failure, severely to the face or groin", () => {
    expect(prodPain(-4, false)).toEqual({ key: "moderatePain", minutes: 4 });
    expect(prodPain(3, true)).toEqual({ key: "severePain", minutes: 3 });
    expect(prodPain(0, false).minutes).toBe(1);
  });
});

describe("directed-energy weapons (HT:EE pp. 50-51)", () => {
  it("dazzle only eyes used to twilight (-2) or darker", () => {
    expect(darkAdapted(0)).toBe(false);
    expect(darkAdapted(1)).toBe(false);
    expect(darkAdapted(2)).toBe(true);
    expect(darkAdapted(10)).toBe(true);
  });

  it("give +1 to resist a point of the Vision penalty fog or smoke cause", () => {
    expect(obscurementBonus(-3)).toBe(3);
    expect(obscurementBonus(0)).toBe(0);
    expect(obscurementBonus(2)).toBe(0);
  });

  it("tinnitus a minute a point, then months, or for good on a critical failure unless the ears are protected", () => {
    expect(tinnitusMinutes(-5)).toBe(5);
    expect(hearingLoss({ success: true }, false)).toBe("passes");
    expect(hearingLoss({ success: false }, false)).toBe("months");
    expect(hearingLoss({ success: false, criticalFailure: true }, false)).toBe("permanent");
    expect(hearingLoss({ success: false, criticalFailure: true }, true)).toBe("months");
  });
});

describe("non-nuclear EMP (HT:EE p. 50)", () => {
  it("reaches 220 yards; +3 Hardened or electrical; -6 to repair plain electronics", () => {
    expect(withinPulse(220)).toBe(true);
    expect(withinPulse(221)).toBe(false);
    expect(withinPulse(null)).toBe(true);
    expect(nnempModifier("electronic")).toBe(0);
    expect(nnempModifier("hardened")).toBe(NNEMP.resistant);
    expect(nnempModifier("electrical")).toBe(3);
    expect(nnempRepairPenalty("electronic")).toBe(-6);
    expect(nnempRepairPenalty("hardened")).toBe(0);
  });
});
