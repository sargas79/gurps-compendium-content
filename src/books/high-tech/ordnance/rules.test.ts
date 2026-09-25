/**
 * High-Tech's grenades, mines, rifle grenades, bombs and nuclear weapons as
 * pure rules (pp. 189-196), checked against the book's figures and against
 * the records the packs carry.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import {
  FUEL_AIR_BOMBS,
  GRENADES,
  MINES,
  RIFLE_GRENADES,
  RIFLE_GRENADE_DUD,
  afterThrow,
  directionalVolley,
  empRepairPenalty,
  empResistance,
  engineChecks,
  engineFire,
  falloutFootprint,
  falloutRads,
  falloutRate,
  fuseStartsOnArming,
  goesOffInHand,
  grenadeFacts,
  isNuclearMode,
  avoidsBoundingFragments,
  primingSeconds,
  readyRifleGrenadeSeconds,
  rifleGrenadeBulk,
  yieldKilotons,
  bearingToward,
  coneWidth,
} from "./rules.js";

const records = (file: string): any[] => JSON.parse(readFileSync(new URL(`../../../../books/high-tech/packs-src/equipment/${file}`, import.meta.url), "utf8"));
const g = (name: string) => GRENADES[name]!;
const m = (name: string) => MINES[name]!;
const r = (name: string) => RIFLE_GRENADES[name]!;
const NAMES = new Set([...records("high-tech-gear.json"), ...records("high-tech-by-hand.json")].map((r) => String(r.name)));

describe("the tables name records the packs carry", () => {
  it("every grenade, mine, rifle grenade and fuel-air bomb is a record", () => {
    for (const name of [...Object.keys(GRENADES), ...Object.keys(MINES), ...Object.keys(RIFLE_GRENADES), ...FUEL_AIR_BOMBS]) expect(NAMES.has(name), name).toBe(true);
  });
});

describe("hand grenades (pp. 190-192)", () => {
  it("reads the fuses and igniters of the Hand Grenades Table", () => {
    expect(g("M67")).toMatchObject({ fuse: [4, 5], igniter: "pin", readies: 1 });
    expect(g("Stielhandgranate")).toMatchObject({ fuse: [4, 5], igniter: "string", readies: 2 });
    expect(g("Grenade à Main")).toMatchObject({ fuse: [3, 5], igniter: "lit" });
    expect(g("Mills Number 36M Mk I").fuse).toEqual([7, 7]);
    expect(g("RPG-43")).toMatchObject({ impact: true, unfamiliarPenalty: -5 });
    expect(g("AN-M14").thermiteSeconds).toBe(40);
    expect(g("Schermuly Stun").flashbang).toBe(true);
  });

  it("gives any other thrown grenade a pin and a fuse left to the GM", () => {
    expect(grenadeFacts("Frag Grenade", true)).toMatchObject({ igniter: "pin", fuse: null });
    expect(grenadeFacts("Frag Grenade", false)).toBeNull();
    expect(grenadeFacts("Rock", true)).toBeNull();
  });

  it("primes TL6-8 grenades at 10 seconds each, and fits a TL5 fuse in five Readies", () => {
    expect(primingSeconds(7, g("M67"), 3)).toBe(30);
    expect(primingSeconds(5, g("Grenade à Main"))).toBe(5);
    expect(primingSeconds(6, g("Jam-Tin Grenade"))).toBe(0);
  });

  it("starts the fuse on the cord or the match, and on the handle for a pin", () => {
    expect(fuseStartsOnArming(g("M67"))).toBe(false);
    expect(fuseStartsOnArming(g("Stielhandgranate"))).toBe(true);
    expect(fuseStartsOnArming(g("Grenade à Main"))).toBe(true);
  });

  it("leaves no time to throw back a four-second grenade cooked off with two Waits", () => {
    expect(afterThrow(g("M67"), 0)).toEqual({ left: [4, 5], throwBack: true });
    expect(afterThrow(g("M67"), 2)).toEqual({ left: [2, 3], throwBack: true });
    expect(afterThrow(g("M67"), 3)).toEqual({ left: [1, 2], throwBack: false });
    expect(afterThrow(g("RPG-43"), 3)).toEqual({ left: null, throwBack: false });
  });

  it("goes off in the hand once the least fuse time has run", () => {
    expect(goesOffInHand(g("M67"), 3)).toBe(false);
    expect(goesOffInHand(g("M67"), 4)).toBe(true);
    expect(goesOffInHand(g("RPG-43"), 10)).toBe(false);
  });
});

describe("a Molotov through an engine grating (p. 191)", () => {
  it("checks HT at once and every three seconds while the fire burns", () => {
    expect(engineChecks(10)).toBe(4);
    expect(engineChecks(60)).toBe(20);
  });

  it("breaks the engine down on one failure and destroys it on a second", () => {
    expect(engineFire(10, 10, [9, 10, 8, 7]).fate).toBe("runs");
    expect(engineFire(10, 10, [9, 12, 8, 7]).fate).toBe("brokenDown");
    const burnt = engineFire(10, 30, [12, 9, 13, 5, 5]);
    expect(burnt.fate).toBe("destroyed");
    expect(burnt.checks.map((c) => c.second)).toEqual([0, 3, 6]);
  });
});

describe("land mines (p. 189)", () => {
  it("knows its mines' kinds", () => {
    expect(m("OZM-3").kind).toBe("bounding");
    expect(m("TMi35").antiLifting).toBe(-2);
    expect(m("M18A1 Claymore").pellets).toMatchObject({ count: 700, skill: 9, halfDamage: 55, max: 270 });
  });

  it("spares those flat on the ground a bounding mine's fragments", () => {
    expect(avoidsBoundingFragments("lying")).toBe(true);
    expect(avoidsBoundingFragments("crawling")).toBe(true);
    expect(avoidsBoundingFragments("standing")).toBe(false);
    expect(avoidsBoundingFragments("kneeling")).toBe(false);
  });

  it("attacks a Claymore's targets at 9 + 9 less range, nearest first", () => {
    const pellets = m("M18A1 Claymore").pellets!;
    const helpers = { rofBonus: rules.rapidFireBonus(700), rangePenalty: rules.speedRangeModifier };
    expect(helpers.rofBonus).toBe(9);
    const out = directionalVolley([{ id: "far", distance: 100, roll: 10 }, { id: "near", distance: 5, roll: 8 }, { id: "past", distance: 300, roll: 3 }], pellets, helpers);
    expect(out.map((t) => t.id)).toEqual(["near", "far", "past"]);
    // 5 yards: -2, so 16; rolled 8 by 8: nine hits.
    expect(out[0]!).toMatchObject({ skill: 16, margin: 8, hits: 9, halfDamage: false });
    // 100 yards: -10, so 8; rolled 10: missed. Past 1/2D.
    expect(out[1]!).toMatchObject({ skill: 8, hits: 0, halfDamage: true });
    expect(out[2]!).toMatchObject({ hits: 0, missed: "range" });
  });

  it("hits nothing more distant once the pellets are spent", () => {
    const few = { count: 3, skill: 9, halfDamage: 55, max: 270, recoil: 1 };
    const out = directionalVolley([{ id: "a", distance: 2, roll: 5 }, { id: "b", distance: 3, roll: 5 }], few, { rofBonus: 0, rangePenalty: () => 0 });
    expect(out[0]!.hits).toBe(3);
    expect(out[1]!).toMatchObject({ hits: 0, missed: "spent" });
  });
});

describe("rifle grenades (pp. 193-194)", () => {
  it("takes 5 seconds for the launcher, 3 for the blank, 2 for the grenade", () => {
    expect(readyRifleGrenadeSeconds(r("AMC M17, 56mm"), false)).toBe(10);
    expect(readyRifleGrenadeSeconds(r("AMC M17, 56mm"), true)).toBe(5);
    expect(readyRifleGrenadeSeconds(r("Rafael Simon 150, 100mm"), false)).toBe(2);
  });

  it("adds the grenade's Bulk to the rifle's", () => {
    expect(rifleGrenadeBulk(-5, -1)).toBe(-6);
    expect(rifleGrenadeBulk(-4, -3)).toBe(-7);
  });

  it("does 1d+1 crushing as a dud", () => {
    expect(RIFLE_GRENADE_DUD).toEqual({ damage: "1d+1", type: "cr" });
  });

  it("reads the Rifle Grenades Table's minimum ranges from the records", () => {
    for (const name of ["AMC M17, 56mm", "Bergmann GSprgr30, 30mm", "MECAR Energa-75, 75mm"]) {
      const record = records("high-tech-by-hand.json").find((r) => r.name === name);
      expect(record.system.rangedModes[0].minRange, name).toBe(10);
    }
  });
});

describe("nuclear weapons (pp. 195-196)", () => {
  it("knows a nuclear mode by its radioactive burning", () => {
    const warhead = records("high-tech-by-hand.json").find((r) => r.name === "Miniaturized Nuclear Warhead (0.1 kt)");
    expect(isNuclearMode(warhead.system.rangedModes[0])).toBe(true);
    const m67 = records("high-tech-gear.json").find((r) => r.name === "M67");
    expect(isNuclearMode(m67.system.rangedModes[0])).toBe(false);
  });

  it("resists EMP at HT-8 with DR at (2), and repairs solid-state gear at -10", () => {
    expect(empResistance(10, 0)).toBe(2);
    expect(empResistance(10, 5)).toBe(4);
    expect(empRepairPenalty(8)).toBe(-10);
    expect(empRepairPenalty(6)).toBe(-4);
  });

  it("reads a yield from the record's name", () => {
    expect(yieldKilotons("Miniaturized Nuclear Warhead (0.1 kt)")).toBe(0.1);
    expect(yieldKilotons("Little Boy (12.5 kt)")).toBe(12.5);
    expect(yieldKilotons("Tsar (50 Mt)")).toBe(50000);
    expect(yieldKilotons("MK 82")).toBeNull();
  });

  it("doubles the fallout footprint each way for each tenfold yield", () => {
    expect(falloutFootprint(0.1)).toEqual({ length: 800, width: 200 });
    expect(falloutFootprint(1)).toEqual({ length: 1600, width: 400 });
    expect(falloutFootprint(100)).toEqual({ length: 6400, width: 1600 });
  });

  it("doses 100 rads an hour at first, 10 from two days, 1 from two weeks", () => {
    expect(falloutRate(0)).toBe(100);
    expect(falloutRate(48)).toBe(10);
    expect(falloutRate(400)).toBe(1);
    expect(falloutRads(0, 2)).toBe(200);
    expect(falloutRads(47, 2)).toBe(110);
    expect(falloutRads(335, 2)).toBe(11);
  });
});

describe("a directional mine's cone (p. 189)", () => {
  it("is 60 degrees: about 312 yards wide at the Claymore's 270", () => {
    expect(coneWidth(270)).toBeCloseTo(311.77, 1);
    expect(coneWidth(0)).toBe(0);
  });

  it("faces the middle of the targets, clockwise from east", () => {
    expect(bearingToward({ x: 0, y: 0 }, [{ x: 10, y: 0 }])).toBe(0);
    expect(bearingToward({ x: 0, y: 0 }, [{ x: 0, y: 10 }])).toBe(90);
    expect(bearingToward({ x: 0, y: 0 }, [{ x: 0, y: -10 }])).toBe(270);
    expect(bearingToward({ x: 0, y: 0 }, [{ x: 10, y: 10 }, { x: 10, y: -10 }])).toBe(0);
    expect(bearingToward({ x: 0, y: 0 }, [])).toBeNull();
  });
});
