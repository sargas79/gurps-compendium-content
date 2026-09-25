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
import { suitClimateGear } from "../breathing/index.js";
import { clothingClimateGear, readyClothing, wornClothing } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  weatherClothing: "gworld.weatherClothing",
  fatigueCost: "gworld.fatigueCost",
  afterFatigue: "gworld.afterFatigue",
  armorDr: "gworld.armorDr",
};

let hooks: Map<string, Listener[]>;
let prices: any[];
let damage: any[];
let on: Record<string, boolean>;

const key = (k: string) => `${MODULE_ID}.${k}`;

let actions: Map<string, any>;
let sections: Map<string, any>;
let worldTime: number;
let chat: string[];

function fakeApi() {
  return {
    data: { registerPriceModifier: (m: any) => prices.push(m) },
    combat: { hooks: HOOKS },
    sheets: { registerSheetSection: (s: any) => sections.set(s.key, s), registerRowAction: (a: any) => actions.set(a.key, a) },
    roll: { damage: async (o: any) => { damage.push(o); return 0; } },
  };
}

function wear(name: string, more: Record<string, any> = {}, clothing: Record<string, unknown> = {}, power: Record<string, unknown> | null = null): any {
  const flags: Record<string, any> = { book: "high-tech" };
  return {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: flags },
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
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

const person = (items: any[]) => {
  const actor = { name: "Trekker", uuid: "Actor.trekker", items };
  for (const item of items) item.actor = actor;
  return actor;
};

function fire(hook: string, context: any, ...more: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(context, ...more);
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
  actions = new Map();
  sections = new Map();
  chat = [];
  worldTime = 1000;
  on = {};
  resetClimate();
  CLIMATE_TABLES.clear();
  CLIMATE_TABLES.register({ book: "high-tech", tls: { min: 5, max: 8 }, rule: key("climateControl"), gear: clothingClimateGear(suitClimateGear(key("environmentSuits"))) });
  CELL_TABLES.clear();
  CELL_TABLES.register(highTechBatteries());
  // Only High-Tech's switches: no Ultra-Tech table is registered at all.
  setRuleReader((k) => on[k.replace(`${MODULE_ID}.`, "")] === true);
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
    user: { id: "me" },
    get time() { return { worldTime }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
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
    fire(HOOKS.afterFatigue, { actor: trekker, fpLost: 1, reason: "exposure", exertion: true, details: { heat: false }, sources: [] });
    expect(damage).toEqual([]);
    const soldier = person([{ type: "armor", name: "Flak Jacket", system: { equipped: true, locations: ["torso"] } }]);
    expect(fire(HOOKS.fatigueCost, { actor: soldier, fp: 1, reason: "battle", exertion: true, details: { seconds: 30, hot: true }, sources: [] }).fp).toBe(1);
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

  it("adds 2 FP to a hot day's battle for a fighter in body armour (p. 65; Campaigns p. 426)", () => {
    const flak = (more: Record<string, unknown> = {}) => ({ type: "armor", name: "Flak Jacket", system: { equipped: true, locations: ["torso", "vitals"], ...more } });
    const battle = (actor: any, hot = true) => fire(HOOKS.fatigueCost, { actor, fp: 1, reason: "battle", exertion: true, details: { seconds: 30, strained: false, temperatureF: 95, hot }, sources: [] });
    expect(battle(person([flak()]))).toMatchObject({ fp: 3, sources: [expect.stringContaining("Flak Jacket")] });
    expect(battle(person([flak()]), false).fp).toBe(1);
    expect(battle(person([flak({ equipped: false })])).fp).toBe(1);
    expect(battle(person([flak({ locations: ["skull"] })])).fp).toBe(1);
    expect(battle(person([flak({ locations: [] })])).fp).toBe(3);
    expect(battle(person([wear("Ordinary Clothes")])).fp).toBe(1);
  });

  it("leaves heated clothing to its own switch", () => {
    expect(clothingOf(person([wear("Heated Clothing")])).clothing).toBeNull();
  });
});

describe("frostbite (High-Tech p. 63)", () => {
  beforeEach(() => { on = { clothingAndWeather: true, frostbite: true }; ready(); });

  // What the cold came to once the fatigue was charged (API 1.138.0).
  const lose = (actor: any, fp: number) => fire(HOOKS.afterFatigue, { actor, fpLost: fp, hpLost: 0, reason: "exposure", exertion: true, details: { heat: false, temperatureF: -20 }, sources: [] });

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

  it("counts the FP the cold came to after Very Fit, not what it was asked", async () => {
    const trekker = person([wear("Winter Clothes", {}, { missing: { gloves: true } })]);
    coldRoll(trekker, "winter");
    fire(HOOKS.fatigueCost, { actor: trekker, fp: 2, reason: "exposure", exertion: true, details: { heat: false }, sources: [] });
    await flush();
    expect(damage).toEqual([]);
    lose(trekker, 1);
    await flush();
    expect(damage).toEqual([expect.objectContaining({ formula: "1", calledShot: { hitLocation: "hand", chink: false } })]);
  });

  it("is nothing in the heat, or with no FP lost", async () => {
    const hiker = person([wear("Ordinary Clothes")]);
    fire(HOOKS.afterFatigue, { actor: hiker, fpLost: 1, reason: "exposure", exertion: true, details: { heat: true }, sources: [] });
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

  it("spares body armour its hot battle's 2 FP while a cooler runs", () => {
    on = { climateControl: true, clothingAndWeather: true };
    const flak = { type: "armor", name: "Flak Jacket", system: { equipped: true, locations: ["torso"] } };
    const battle = (actor: any) => fire(HOOKS.fatigueCost, { actor, fp: 1, reason: "battle", exertion: true, details: { seconds: 30, hot: true }, sources: [] }).fp;
    expect(battle(person([flak, wear("Cooling System")]))).toBe(1);
    expect(battle(person([flak]))).toBe(3);
  });
});

describe("pieces worn apart from the outfit (High-Tech p. 63)", () => {
  beforeEach(() => { on = { clothingAndWeather: true, frostbite: true }; ready(); });

  const armour = (name: string, more: Record<string, unknown> = {}) => ({ id: name, name, type: "armor", system: { carried: true, equipped: true, ...more } });

  it("fills a gap in winter or arctic clothes with boots, gloves, a hat or a scarf worn on their own", async () => {
    const trekker = person([wear("Arctic Clothes", {}, { missing: { boots: true, gloves: true, hat: true } }), armour("Boots, Arctic (TL7)"), wear("Hat, Leather or Felt")]);
    expect(coldRoll(trekker, "arctic")).toEqual([{ label: expect.stringContaining("gloves"), value: -1 }]);
    // Frostbite finds only the bare hands.
    fire(HOOKS.afterFatigue, { actor: trekker, fpLost: 1, reason: "exposure", details: { heat: false }, sources: [] });
    await flush();
    expect(damage.map((d) => d.calledShot.hitLocation)).toEqual(["hand"]);
    // The outfit's sheet names what fills its gaps.
    const lines: string[] = sections.get("ht-clothing-item").context(trekker.items[0]).lines;
    expect(lines).toContainEqual(expect.stringContaining('"penalty":-1'));
    expect(lines).toContainEqual(expect.stringContaining("Boots, Arctic (TL7), Hat, Leather or Felt"));
  });

  it("counts only what is worn, and never a hard hat as a warm one", () => {
    const trekker = person([wear("Winter Clothes", {}, { missing: { boots: true, hat: true } }), armour("Boots", { equipped: false }), armour("Hard Hat")]);
    expect(coldRoll(trekker, "winter")).toEqual([{ label: expect.any(String), value: -2 }]);
    expect(coldRoll(person([wear("Winter Clothes", {}, { missing: { gloves: true, scarf: true } }), armour("Hockey Glove"), wear("Scarf")]), "winter")).toEqual([]);
  });
});

describe("the cooling vest's charge (High-Tech p. 74)", () => {
  beforeEach(() => { on = { climateControl: true }; ready(); });

  const heat = (actor: any) => tolerance(actor).effects.temperatureTolerance.heatF;

  it("cools for four hours from when it is first put on, then needs a soak", async () => {
    const vest = wear("Cooling System", { equipped: false });
    const wearer = person([vest]);
    expect(heat(wearer)).toBe(0);
    vest.system.equipped = true;
    // Put on: its four hours start.
    fire("updateItem", vest, { system: { equipped: true } }, {}, "me");
    await flush();
    expect(vest.flags[MODULE_ID].htCoolingUntil).toBe(1000 + 4 * 3600);
    expect(heat(wearer)).toBe(30);
    // Taken off and put on again: the charge runs on from where it was.
    fire("updateItem", vest, { system: { equipped: true } }, {}, "me");
    await flush();
    expect(vest.flags[MODULE_ID].htCoolingUntil).toBe(1000 + 4 * 3600);
    worldTime += 4 * 3600;
    expect(heat(wearer)).toBe(0);
    expect(sections.get("ht-clothing-item").context(vest).lines).toContainEqual(expect.stringContaining("Cooling.spent"));
  });

  it("is soaked from its row: a quarter hour in the water, then four hours more", async () => {
    const vest = wear("Cooling System");
    const wearer = person([vest]);
    vest.flags[MODULE_ID].htCoolingUntil = 0;
    expect(heat(wearer)).toBe(0);
    expect(actions.get("ht-cooling-soak").visible(vest)).toBe(true);
    actions.get("ht-cooling-soak").run(vest, wearer);
    await flush();
    expect(chat).toHaveLength(1);
    expect(heat(wearer)).toBe(0);
    worldTime += 15 * 60;
    expect(heat(wearer)).toBe(30);
    worldTime += 4 * 3600;
    expect(heat(wearer)).toBe(0);
  });

  it("leaves another's put-on alone, and a vest with no switch has no row", () => {
    const vest = wear("Cooling System");
    person([vest]);
    fire("updateItem", vest, { system: { equipped: true } }, {}, "someone else");
    expect(vest.flags[MODULE_ID].htCoolingUntil).toBeUndefined();
    on = {};
    expect(actions.get("ht-cooling-soak").visible(vest)).toBe(false);
  });
});

describe("environment suits' climate control (High-Tech pp. 74-76)", () => {
  beforeEach(() => { on = { environmentSuits: true }; ready(); });

  const march = (actor: any) => fire(HOOKS.fatigueCost, { actor, fp: 12, reason: "hiking", exertion: true, details: { hours: 4, hot: true }, sources: [] }).fp;
  const suit = (name: string, flags: Record<string, unknown> = {}) => {
    const item = wear(name);
    item.type = "armor";
    Object.assign(item.flags[MODULE_ID], flags);
    return item;
  };

  it("spares a hot march under the EVA suit, and under a bomb suit fitted with it, with the suits' switch alone", () => {
    expect(march(person([suit("Space Suit, EVA")]))).toBe(8);
    expect(march(person([suit("Bomb Disposal Suit")]))).toBe(12);
    expect(march(person([suit("Bomb Disposal Suit", { htClimateFitted: true })]))).toBe(8);
    expect(tolerance(person([suit("Bomb Disposal Suit", { htClimateFitted: true })])).effects.temperatureTolerance).toEqual({ coldF: 60, heatF: 60 });
    on = {};
    expect(march(person([suit("Space Suit, EVA")]))).toBe(12);
  });
});
