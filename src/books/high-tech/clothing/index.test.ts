/**
 * Clothing, frostbite and climate-controlled clothing as the system meets
 * them: the worn clothing class through `gworld.weatherClothing`, the cold and
 * heat rolls through `gworld.successRollModifiers`, frostbite and a hot march
 * through `gworld.fatigueCost`, fur through `gworld.armorDr` and the comfort
 * zone through `gworld.traitEffects` -- with only High-Tech's switches on
 * (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { CLIMATE_TABLES, resetClimate } from "../../../shared/climate/index.js";
import { CELL_TABLES } from "../../../shared/power/data.js";
import { MODULE_ID } from "../../../shared/module.js";
import { highTechBatteries } from "../power/index.js";
import { HIGH_TECH_CLIMATE_GEAR } from "./rules.js";
import { readyClothing, wornClothing } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  weatherClothing: "gworld.weatherClothing",
  fatigueCost: "gworld.fatigueCost",
  armorDr: "gworld.armorDr",
};

let hooks: Map<string, Listener[]>;
let prices: any[];
let damage: any[];
let on: Record<string, boolean>;

const key = (k: string) => `${MODULE_ID}.${k}`;

function fakeApi() {
  return {
    data: { registerPriceModifier: (m: any) => prices.push(m) },
    combat: { hooks: HOOKS },
    sheets: { registerSheetSection: () => undefined },
    roll: { damage: async (o: any) => { damage.push(o); return 0; } },
  };
}

function wear(name: string, more: Record<string, any> = {}, clothing: Record<string, unknown> = {}, power: Record<string, unknown> | null = null): any {
  return {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: {
      tl: "7",
      carried: true,
      equipped: true,
      weight: 15,
      extensions: { [MODULE_ID]: { clothing, ...(power ? { power } : {}) } },
      ...more,
    },
  };
}

const person = (items: any[]) => ({ name: "Trekker", uuid: "Actor.trekker", items });

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const coldRoll = (actor: any, clothing: string, tags = ["exposure", "cold", "HT"]) =>
  fire(HOOKS.successRollModifiers, { actor, tags, modifiers: [], weather: { heat: false, temperatureF: -20, clothing } }).modifiers;
const clothingOf = (actor: any) => fire(HOOKS.weatherClothing, { actor, clothing: null, label: "" });
const tolerance = (actor: any) => fire("gworld.traitEffects", { actor, effects: { temperatureTolerance: { coldF: 0, heatF: 0 } }, sources: [] });
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (k: string) => () => on[k] === true;
  readyClothing(fakeApi() as never, { clothing: rule("clothingAndWeather"), frostbite: rule("frostbite"), climate: rule("climateControl") });
}

beforeEach(() => {
  hooks = new Map();
  prices = [];
  damage = [];
  on = {};
  resetClimate();
  CLIMATE_TABLES.clear();
  CLIMATE_TABLES.register({ book: "high-tech", tls: { min: 5, max: 8 }, rule: key("climateControl"), gear: HIGH_TECH_CLIMATE_GEAR });
  CELL_TABLES.clear();
  CELL_TABLES.register(highTechBatteries());
  // Only High-Tech's switches: no Ultra-Tech table is registered at all.
  setRuleReader((k) => on[k.replace(`${MODULE_ID}.`, "")] === true);
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setRuleReader(() => false);
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const trekker = person([wear("Arctic Clothes", {}, { missing: { gloves: true }, fur: true }), wear("Wicking Undergarment"), wear("Heated Clothing")]);
    expect(clothingOf(trekker).clothing).toBeNull();
    expect(coldRoll(trekker, "arctic")).toEqual([]);
    expect(fire(HOOKS.successRollModifiers, { actor: trekker, tags: ["exposure", "heat", "HT"], modifiers: [] }).modifiers).toEqual([]);
    expect(tolerance(trekker).effects.temperatureTolerance).toEqual({ coldF: 0, heatF: 0 });
    expect(fire(HOOKS.armorDr, { actor: trekker, hitLocation: "torso", lines: [] }).lines).toEqual([]);
    expect(prices[0].apply(wear("Arctic Clothes", { tl: "8" }), { cost: 100, weight: 15 })).toBeNull();
    fire(HOOKS.fatigueCost, { actor: trekker, fp: 1, reason: "exposure", exertion: true, details: { heat: false }, sources: [] });
    expect(damage).toEqual([]);
  });
});

describe("clothing against the weather (High-Tech pp. 63-65)", () => {
  beforeEach(() => { on = { clothingAndWeather: true }; ready(); });

  it("answers the Weather dialog with the best outfit worn", () => {
    expect(clothingOf(person([wear("Ordinary Clothes"), wear("Arctic Clothes")]))).toMatchObject({ clothing: "arctic", label: "Arctic Clothes" });
    expect(clothingOf(person([wear("Summer Clothes")]))).toMatchObject({ clothing: "light" });
    // Carried, not worn: nothing to say.
    expect(clothingOf(person([wear("Arctic Clothes", { equipped: false })])).clothing).toBeNull();
    // Layers off.
    expect(clothingOf(person([wear("Arctic Clothes", {}, { wornAs: "winter" })])).clothing).toBe("winter");
    // A better class another listener gave stands.
    expect(fire(HOOKS.weatherClothing, { actor: person([wear("Winter Clothes")]), clothing: "heatedSuit", label: "Suit" }).clothing).toBe("heatedSuit");
  });

  it("takes -1 on the cold roll for each piece left off a worn winter or arctic outfit", () => {
    const trekker = person([wear("Arctic Clothes", {}, { missing: { gloves: true, hat: true } })]);
    expect(coldRoll(trekker, "arctic")).toEqual([{ label: expect.stringContaining("MissingLine"), value: -2 }]);
    // The GM picked another class: the outfit's pieces don't come into it.
    expect(coldRoll(trekker, "light")).toEqual([]);
    expect(coldRoll(person([wear("Arctic Clothes")]), "arctic")).toEqual([]);
  });

  it("gives a worn wicking undergarment's +1 in the heat, not the cold", () => {
    const runner = person([wear("Wicking Undergarment")]);
    expect(fire(HOOKS.successRollModifiers, { actor: runner, tags: ["exposure", "heat", "survival"], modifiers: [] }).modifiers).toEqual([{ label: expect.stringContaining("Wicking Undergarment"), value: 1 }]);
    expect(coldRoll(runner, "winter")).toEqual([]);
  });

  it("gives fur DR 1 where the outfit covers", () => {
    const trapper = person([wear("Winter Clothes", {}, { fur: true, missing: { gloves: true } })]);
    expect(fire(HOOKS.armorDr, { actor: trapper, hitLocation: "torso", lines: [] }).lines).toEqual([expect.objectContaining({ dr: 1, flexible: true, source: "armor" })]);
    expect(fire(HOOKS.armorDr, { actor: trapper, hitLocation: "hand", lines: [] }).lines).toEqual([]);
    expect(fire(HOOKS.armorDr, { actor: person([wear("Winter Clothes")]), hitLocation: "torso", lines: [] }).lines).toEqual([]);
  });

  it("weighs an outfit by its TL", () => {
    const apply = prices[0].apply;
    expect(apply(wear("Arctic Clothes", { tl: "8" }), { cost: 100, weight: 15 })).toMatchObject({ cost: 100, weight: 7.5 });
    expect(apply(wear("Ordinary Clothes", { tl: "5" }), { cost: 20, weight: 2 })).toMatchObject({ weight: 4 });
    expect(apply(wear("Ordinary Clothes"), { cost: 20, weight: 2 })).toBeNull();
    expect(apply(wear("Undercover Clothing (Ordinary Clothes, +1)", { tl: "5" }), { cost: 20, weight: 2 })).toBeNull();
  });

  it("leaves heated clothing to its own switch", () => {
    expect(clothingOf(person([wear("Heated Clothing")])).clothing).toBeNull();
  });
});

describe("frostbite (High-Tech p. 63)", () => {
  beforeEach(() => { on = { clothingAndWeather: true, frostbite: true }; ready(); });

  const lose = (actor: any, fp: number) => fire(HOOKS.fatigueCost, { actor, fp, reason: "exposure", exertion: true, details: { heat: false, temperatureF: -20 }, sources: [] });

  it("injures each exposed location a point per FP lost to the cold, through no DR", async () => {
    const trekker = person([wear("Winter Clothes", {}, { missing: { gloves: true } })]);
    coldRoll(trekker, "winter");
    lose(trekker, 2);
    await flush();
    expect(damage).toEqual([expect.objectContaining({ formula: "2", damageType: "tox", ignoresDr: true, calledShot: { hitLocation: "hand", chink: false }, source: "frostbite" })]);
  });

  it("reaches the head, face, neck, hands and feet in light clothing, and nothing inside whole winter clothes", async () => {
    const hiker = person([wear("Ordinary Clothes")]);
    coldRoll(hiker, "light");
    lose(hiker, 1);
    await flush();
    expect(damage.map((d) => d.calledShot.hitLocation)).toEqual(["foot", "hand", "skull", "neck", "face"]);
    damage = [];
    const bundled = person([wear("Arctic Clothes")]);
    coldRoll(bundled, "arctic");
    lose(bundled, 1);
    await flush();
    expect(damage).toEqual([]);
  });

  it("is nothing in the heat, or with no FP lost", async () => {
    const hiker = person([wear("Ordinary Clothes")]);
    fire(HOOKS.fatigueCost, { actor: hiker, fp: 1, reason: "exposure", exertion: true, details: { heat: true }, sources: [] });
    coldRoll(hiker, "light");
    lose(hiker, 0);
    await flush();
    expect(damage).toEqual([]);
  });
});

describe("climate-controlled clothing (High-Tech p. 74)", () => {
  beforeEach(() => { on = { climateControl: true }; ready(); });

  const heated = (hoursUsed = 0) => wear("Heated Clothing", { tl: "8", weight: 6 }, {}, { draw: { cell: "M", cells: 1, endurance: "8 hrs.", raw: "M/8 hrs." }, hoursUsed });

  it("widens the comfort zone while the suit is worn and powered", () => {
    expect(tolerance(person([heated()])).effects.temperatureTolerance).toEqual({ coldF: 60, heatF: 0 });
    // Its cells spent: no more than winter clothes.
    expect(tolerance(person([heated(8)])).effects.temperatureTolerance).toEqual({ coldF: 0, heatF: 0 });
    expect(tolerance(person([wear("Climate-Control System")])).effects.temperatureTolerance).toEqual({ coldF: 60, heatF: 60 });
    // The best on each side, not the sum.
    expect(tolerance(person([heated(), wear("Cooling System"), wear("Climate-Control System")])).effects.temperatureTolerance).toEqual({ coldF: 60, heatF: 60 });
    expect(tolerance(person([wear("Cooling System", { equipped: false })])).effects.temperatureTolerance).toEqual({ coldF: 0, heatF: 0 });
  });

  it("counts heated clothing as winter clothes, powered or not", () => {
    expect(clothingOf(person([heated(8)]))).toMatchObject({ clothing: "winter", label: "Heated Clothing" });
    expect(wornClothing(person([heated()]), { clothing: () => false, frostbite: () => false, climate: () => true })?.clothing).toBe("winter");
  });

  it("spares a hot march its extra point an hour while a cooler runs", () => {
    const march = (actor: any) => fire(HOOKS.fatigueCost, { actor, fp: 12, reason: "hiking", exertion: true, details: { hours: 4, hot: true }, sources: [] });
    expect(march(person([wear("Cooling System")]))).toMatchObject({ fp: 8, sources: [expect.stringContaining("Cooling System")] });
    expect(march(person([heated()])).fp).toBe(12);
    expect(fire(HOOKS.fatigueCost, { actor: person([wear("Cooling System")]), fp: 8, reason: "hiking", exertion: true, details: { hours: 4, hot: false }, sources: [] }).fp).toBe(8);
  });
});
