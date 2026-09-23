/**
 * The expedition gear as the system meets it: lights on the attack's darkness
 * line, a tactical light in the eyes, the navigation lines on a skill, LBE on
 * Fast-Draw and packs on Hiking and their price, and the climbing gear --
 * with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { lightOver, navigationLines, readyExpedition } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = { attackModifiers: "gworld.attackModifiers", successRollModifiers: "gworld.successRollModifiers" };

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let cards: Map<string, any>;
let options: Map<string, any>;
let prices: any[];
let successes: any[];
let conditions: any[];
let posted: any[];
let updated: any[];
let areas: any[];
let chat: string[];
let on: Record<string, boolean>;
let successResult: any;
let dieRoll: number;
let dialogAnswer: any;
let targets: any[];
let tokens: any[];

function fakeApi() {
  return {
    registry: { isRuleOn: () => false },
    areas: {
      list: () => areas,
      add: (_scene: any, area: any) => { areas.push(area); return area.id; },
      remove: async (_scene: any, id: string) => { areas = areas.filter((a) => a.id !== id); },
      standsIn: (_scene: any, area: any) => area.inside ?? [],
    },
    data: {
      hooks: { skillBonuses: "gworld.skillBonuses", moveModifiers: "gworld.moveModifiers" },
      registerPriceModifier: (m: any) => prices.push(m),
    },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (o: any) => options.set(o.key, o),
    },
    sheets: {
      registerSheetSection: () => undefined,
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, opts: any) => { posted.push({ key, data, opts }); },
      update: async (_message: any, data: any) => { updated.push(data); return true; },
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: (actor: any) => actor?.derived ?? {},
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor, ...c }); return "c1"; },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
    },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function gear(name: string, expedition: Record<string, unknown>, more: Record<string, any> = {}, state: Record<string, unknown> = {}): any {
  const item: any = {
    id: name.replace(/\W/g, ""),
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { expedition: state } },
    system: { tl: "7", carried: true, equipmentQuality: "basic", extensions: { [MODULE_ID]: { expedition } }, ...more },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

const person = (name: string, items: any[] = [], more: Record<string, any> = {}) => {
  const actor: any = { name, uuid: `Actor.${name}`, isOwner: true, items, attributes: { ST: 11, DX: 12, IQ: 11, HT: 10 }, skills: {}, ...more };
  return actor;
};

/** A token at x yards along a line (a yard a pixel), for the map's distances. */
const tokenAt = (id: string, x: number, actor: any) => {
  const token: any = { id, document: { id }, center: { x, y: 0 }, actor };
  actor.getActiveTokens = () => [token];
  return token;
};

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyExpedition(fakeApi() as never, { lights: rule("lightSources"), navigation: rule("navigationGear"), loadBearing: rule("loadBearingEquipment"), climbing: rule("climbingGear") });
}

function darknessAttack(actor: any, target: any, darkness = 7, value = -7): any {
  return fire(HOOKS.attackModifiers, { actor, targetTokens: [target], modifiers: [{ key: "darkness", label: "Darkness", darkness, value }] });
}

function skillLines(actor: any, name: string): any[] {
  const context = { actor, name, lines: [] as any[] };
  fire("gworld.skillBonuses", context);
  return context.lines;
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  cards = new Map();
  options = new Map();
  prices = [];
  successes = [];
  conditions = [];
  posted = [];
  updated = [];
  areas = [];
  chat = [];
  on = {};
  successResult = { success: true, margin: 2 };
  dieRoll = 10;
  dialogAnswer = null;
  targets = [];
  tokens = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { id: "u1", get targets() { return new Set(targets); } },
    time: { worldTime: 0 },
  });
  vi.stubGlobal("canvas", {
    scene: { id: "s1" },
    templates: { placeables: [] },
    get tokens() { return { placeables: tokens }; },
    grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(a.x - b.x) }) },
  });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s, randomID: () => "r1" },
    applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } },
  });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class { total = 0; async evaluate() { this.total = dieRoll; return this; } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const lantern = gear("Kerosene Lantern", { light: { kind: "kerosene", radius: 5, beam: 0 } }, {}, { lit: true });
    const bearer = person("Bearer", [lantern]);
    const target = tokenAt("t", 3, person("Target"));
    tokens = [tokenAt("b", 0, bearer), target];
    expect(darknessAttack(bearer, target).modifiers[0].value).toBe(-7);
    expect(actions.get("ht-light-switch").visible(lantern)).toBe(false);
    expect(skillLines(person("Scout", [gear("Compass", { navigation: "compass" })]), "Navigation (Land)")).toEqual([]);
    expect(prices[0].apply(gear("Backpack, Large", { carry: "backpack" }, { tl: "8" }), { cost: 100, weight: 10 })).toBeNull();
    expect(options.get("ht-rappelling").available({ actor: person("Climber", [gear("Harness", { climbing: "harness" })]) })).toBe(false);
  });
});

describe("light sources (High-Tech pp. 51-52)", () => {
  beforeEach(() => { on = { lightSources: true }; ready(); });

  it("lights a target within a carried lantern's radius to -3", () => {
    const lantern = gear("Kerosene Lantern", { light: { kind: "kerosene", radius: 5, beam: 0 } }, {}, { lit: true });
    const shooter = person("Shooter");
    const target = tokenAt("t", 14, person("Target"));
    tokens = [tokenAt("s", 0, shooter), tokenAt("b", 10, person("Bearer", [lantern])), target];
    const line = darknessAttack(shooter, target).modifiers[0];
    expect(line.value).toBe(-3);
    expect(line.label).toContain("Kerosene Lantern");
    // Out of the radius, or the lantern out: nothing.
    tokens[1] = tokenAt("b", 5, person("Bearer", [lantern]));
    expect(darknessAttack(shooter, target).modifiers[0].value).toBe(-7);
  });

  it("lights the target of the attacker's own beam out to its length", () => {
    const flashlight = gear("Flashlight", { light: { kind: "electric", radius: 0, beam: 10 } }, {}, { lit: true });
    const shooter = person("Shooter", [flashlight]);
    tokens = [tokenAt("s", 0, shooter)];
    expect(darknessAttack(shooter, tokenAt("t", 9, person("Near"))).modifiers[0].value).toBe(-3);
    expect(darknessAttack(shooter, tokenAt("u", 12, person("Far"))).modifiers[0].value).toBe(-7);
    // Unlit, it does nothing.
    flashlight.flags[MODULE_ID].expedition.lit = false;
    expect(darknessAttack(shooter, tokenAt("t", 9, person("Near"))).modifiers[0].value).toBe(-7);
  });

  it("lights a target standing in a light set down on the map", () => {
    const target = tokenAt("t", 50, person("Target"));
    areas = [{ id: `${MODULE_ID}-ht-light-Lantern-r1`, label: "Glass Lantern", inside: [{ id: "t" }] }];
    const shooter = person("Shooter");
    tokens = [tokenAt("s", 0, shooter), target];
    expect(lightOver(fakeApi() as never, shooter, target)).toBe("Glass Lantern");
    expect(darknessAttack(shooter, target).modifiers[0].value).toBe(-3);
    // A lantern set down lights where it lies, not round whoever it belongs to.
    areas = [];
    const placed = gear("Kerosene Lantern", { light: { kind: "kerosene", radius: 5, beam: 0 } }, {}, { lit: true, placed: true });
    tokens = [tokenAt("s", 0, shooter), tokenAt("b", 48, person("Owner", [placed])), target];
    expect(lightOver(fakeApi() as never, shooter, target)).toBeNull();
  });

  it("switches a light on and off, and sets a lit one down as an area", async () => {
    const lantern = gear("Kerosene Lantern", { light: { kind: "kerosene", radius: 5, beam: 0 } });
    const bearer = person("Bearer", [lantern]);
    tokenAt("b", 0, bearer);
    actions.get("ht-light-switch").run(lantern, bearer);
    await flush();
    expect(lantern.flags[MODULE_ID].expedition.lit).toBe(true);
    expect(chat.at(-1)).toContain("LitLantern");
    dialogAnswer = { dropped: false };
    actions.get("ht-light-set-down").run(lantern, bearer);
    await flush();
    expect(areas[0]).toMatchObject({ label: "Kerosene Lantern", radius: 5, lines: [] });
    expect(lantern.flags[MODULE_ID].expedition.placed).toBe(true);
    actions.get("ht-light-pick-up").run(lantern, bearer);
    await flush();
    expect(areas).toEqual([]);
    expect(lantern.flags[MODULE_ID].expedition.placed).toBe(false);
  });

  it("breaks a dropped lantern on a roll over 6, the glass one starting a fire", async () => {
    const lantern = gear("Glass Lantern", { light: { kind: "glassLantern", radius: 5, beam: 0 } }, {}, { lit: true });
    const bearer = person("Bearer", [lantern]);
    tokenAt("b", 0, bearer);
    dialogAnswer = { dropped: true };
    dieRoll = 9;
    actions.get("ht-light-set-down").run(lantern, bearer);
    await flush();
    expect(lantern.flags[MODULE_ID].expedition).toMatchObject({ lit: false, broken: true });
    expect(chat.at(-1)).toContain("GlassFire");
    expect(areas).toEqual([]);
  });

  it("shines a tactical light in the eyes of targets within its beam: HT-4, or blinded 10 s per point", async () => {
    const light = gear("Small Tactical Light (TL8)", { light: { kind: "tactical", radius: 0, beam: 25 } });
    const cop = person("Cop", [light]);
    tokenAt("c", 0, cop);
    const near = person("Near", [], { attributes: { HT: 11 } });
    targets = [tokenAt("n", 20, near), tokenAt("f", 30, person("Far"))];
    actions.get("ht-light-eyes").run(light, cop);
    await flush();
    expect(posted).toHaveLength(1);
    expect(posted[0].data).toMatchObject({ victim: "Near", light: "Small Tactical Light (TL8)" });
    vi.stubGlobal("fromUuid", async () => near);
    successResult = { success: false, margin: -3 };
    await cards.get("ht-light-eyes").actions.resist({ message: {}, data: posted[0].data });
    expect(successes.at(-1)).toMatchObject({ base: 11, modifiers: [{ value: -4 }] });
    expect(conditions.at(-1)).toMatchObject({ key: "htLightBlinded", duration: { seconds: 30 } });
    expect(conditions.at(-1).effects.modifiers[0]).toMatchObject({ value: -10, rolls: ["vision", "attack"] });
  });
});

describe("navigation gear (High-Tech pp. 52-53)", () => {
  beforeEach(() => { on = { navigationGear: true }; ready(); });

  it("puts the best instrument and the map on Navigation", () => {
    const scout = person("Scout", [gear("Compass", { navigation: "compass" }), gear("Global Positioning System Receiver", { navigation: "gps" }, { tl: "8" })]);
    expect(skillLines(scout, "Navigation/TL8 (Land)")).toEqual([
      { label: expect.stringContaining("Global Positioning System Receiver"), value: 3, source: MODULE_ID },
      { label: "GCC.HT.Expedition.NoMap", value: -10, source: MODULE_ID },
    ]);
    const mapped = person("Mapped", [gear("Road Atlas", { navigation: "map", mapPenalty: -2 })]);
    expect(navigationLines(mapped, "Forward Observer/TL8")).toEqual([{ label: "GCC.HT.Expedition.InaccurateMap", value: -2 }]);
    expect(navigationLines(mapped, "Stealth")).toEqual([]);
  });

  it("drops a GPS receiver out of sight of its satellites", () => {
    const gps = gear("Global Positioning System Receiver", { navigation: "gps" }, { tl: "8" }, { noSignal: true });
    const scout = person("Scout", [gps, gear("Compass", { navigation: "compass" }), gear("Topographic Map", { navigation: "map" })]);
    expect(navigationLines(scout, "Navigation (Air)")).toEqual([{ label: expect.stringContaining("Compass"), value: 1 }]);
  });
});

describe("load-bearing gear (High-Tech pp. 53-55)", () => {
  beforeEach(() => { on = { loadBearingEquipment: true }; ready(); });

  it("sets up LBE with the better of Soldier and IQ-based Hiking, then adds its quality to Fast-Draw from it", async () => {
    const vest = gear("Load-Bearing Vest", { carry: "lbe" }, { equipmentQuality: "fine" });
    const soldier = person("Soldier", [vest], { skills: { Soldier: 12, Hiking: 12 } });
    actions.get("ht-lbe-fit").run(vest, soldier);
    await flush();
    // Hiking 12 on HT 10, based on IQ 11: 13.
    expect(successes.at(-1)).toMatchObject({ base: 13, skill: "Hiking" });
    expect(vest.flags[MODULE_ID].expedition.fit).toBe("ok");
    const ammo = fire(HOOKS.successRollModifiers, { actor: soldier, skill: "Fast-Draw (Ammo)", modifiers: [] });
    expect(ammo.modifiers).toEqual([{ label: expect.stringContaining("Load-Bearing Vest"), value: 2 }]);
    const pistol = fire(HOOKS.successRollModifiers, { actor: soldier, skill: "Fast-Draw (Pistol)", modifiers: [] });
    expect(pistol.modifiers).toEqual([]);
    actions.get("ht-lbe-reach").run(vest, soldier);
    await flush();
    expect(successes.at(-1)).toMatchObject({ base: 12, skill: "DX", modifiers: [{ value: 2 }] });
  });

  it("counts LBE set up badly as -2", async () => {
    const web = gear("Web Gear", { carry: "lbe" }, { equipmentQuality: "good" });
    const soldier = person("Soldier", [web]);
    successResult = { success: false, margin: -1 };
    actions.get("ht-lbe-fit").run(web, soldier);
    await flush();
    expect(fire(HOOKS.successRollModifiers, { actor: soldier, skill: "Fast-Draw (Grenade)", modifiers: [] }).modifiers[0].value).toBe(-2);
  });

  it("gives a fitted pack of quality to Hiking, and a badly fitted one moderate pain after a day", async () => {
    const pack = gear("Backpack, Large", { carry: "backpack" }, { equipmentQuality: "good" }, { fit: "ok" });
    expect(skillLines(person("Hiker", [pack]), "Hiking")).toEqual([{ label: expect.stringContaining("Backpack, Large"), value: 1, source: MODULE_ID }]);
    const bad = gear("Travel Bag", { carry: "bag" }, {}, { fit: "failed" });
    const hiker = person("Hiker", [bad]);
    expect(actions.get("ht-pack-pain").visible(bad)).toBe(true);
    actions.get("ht-pack-pain").run(bad, hiker);
    await flush();
    expect(conditions.at(-1)).toMatchObject({ key: "moderatePain" });
  });

  it("halves a TL8 pack's weight and doubles a backpack's cost", () => {
    const [price] = prices;
    expect(price.apply(gear("Backpack, Large", { carry: "backpack" }, { tl: "8" }), { cost: 100, weight: 10 })).toMatchObject({ cost: 200, weight: 5 });
    expect(price.apply(gear("Waist Pack", { carry: "bag" }, { tl: "8" }), { cost: 10, weight: 1 })).toMatchObject({ cost: 10, weight: 0.5 });
    expect(price.apply(gear("Backpack, Large", { carry: "backpack" }, { tl: "6" }), { cost: 100, weight: 10 })).toBeNull();
  });
});

describe("climbing gear (High-Tech pp. 55-56)", () => {
  beforeEach(() => { on = { climbingGear: true }; ready(); });

  it("offers shooting while rappelling to a character on a rope: -4, -2 with Sure-Footed", () => {
    const option = options.get("ht-rappelling");
    const climber = person("Climber", [gear("Mini-Rappel Kit", { climbing: "rappelKit" })]);
    expect(option.available({ actor: climber })).toBe(true);
    expect(option.available({ actor: person("Walker") })).toBe(false);
    expect(option.apply({ actor: climber }, true).modifiers[0].value).toBe(-4);
    const sure = person("Sure", [gear("Harness", { climbing: "harness" }), { type: "trait", name: "Sure-Footed (Uneven)" }]);
    expect(option.apply({ actor: sure }, true).modifiers[0].value).toBe(-2);
    expect(option.apply({ actor: climber }, false)).toBeNull();
  });

  it("works out a roped fall, and throws a grapnel at DX-3 or Throwing", async () => {
    const harness = gear("Harness", { climbing: "harness" });
    const climber = person("Climber", [harness], { skills: { Throwing: 13 } });
    dialogAnswer = { yards: 4 };
    actions.get("ht-climb-fall").run(harness, climber);
    await flush();
    expect(chat.at(-1)).toContain('"yards":8');
    const hook = gear("Grappling Hook", { climbing: "grapnel" }, { tl: "5" });
    actions.get("ht-grapnel").run(hook, climber);
    await flush();
    expect(successes.at(-1)).toMatchObject({ base: 13, skill: "Throwing" });
    expect(chat.at(-1)).toContain('"yards":22');
  });

  it("takes a Move off for worn snowshoes, but not TL8 ones", () => {
    const shoes = gear("Snowshoes", { climbing: "snowshoes" }, { tl: "5", equipped: true });
    const context = fire("gworld.moveModifiers", { actor: person("Walker", [shoes]), lines: [] });
    expect(context.lines).toEqual([{ label: "Snowshoes", value: -1 }]);
    const fast = gear("Snowshoes", { climbing: "snowshoes" }, { tl: "8", equipped: true });
    expect(fire("gworld.moveModifiers", { actor: person("Walker", [fast]), lines: [] }).lines).toEqual([]);
  });
});
