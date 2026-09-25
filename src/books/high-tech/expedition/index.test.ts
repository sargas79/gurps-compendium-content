/**
 * The expedition gear as the system meets it: lights on the attack's darkness
 * line, a tactical light in the eyes, the navigation lines on a skill, LBE on
 * Fast-Draw and packs on Hiking and their price, and the climbing gear --
 * with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { grapnelSound, lightOver, navigationLines, readyExpedition } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = { attackModifiers: "gworld.attackModifiers", successRollModifiers: "gworld.successRollModifiers", unarmedAttacks: "gworld.unarmedAttacks" };

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

let damages: any[];
let changed: any[];

function fakeApi() {
  return {
    registry: { isRuleOn: () => false },
    rules: { formatDiceAdds: ({ dice, adds }: any) => `${dice}d${adds > 0 ? `+${adds}` : adds < 0 ? adds : ""}` },
    items: { changeQuantity: async (item: any, delta: number) => { changed.push({ item: item.name, delta }); return { from: 1, to: 1 + delta }; } },
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
      surprise: async (actor: any, o: any) => { conditions.push({ actor, surprise: true, ...o }); return { kind: o.total ? "total" : "partial", freezeSeconds: o.total ? 4 : 0 }; },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
      damage: async (o: any) => { damages.push(o); return 0; },
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
  damages = [];
  changed = [];
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
    expect(chat.at(-1)).toContain("LanternBreaks");
    // Its burning oil: a 1-yard fire on the map for 10d seconds, and the card for each second's 1d-1 (p. 51; p. 191).
    expect(areas).toEqual([expect.objectContaining({ id: `${MODULE_ID}-ht-lantern-fire-GlassLantern-r1`, radius: 1, expires: 9 })]);
    expect(posted.at(-1)).toMatchObject({ key: `${MODULE_ID}.ht-lantern-fire`, data: { formula: "1d-1", divisor: 5, seconds: 9, until: 9 } });
    await cards.get("ht-lantern-fire").actions.burn.run({ data: posted.at(-1).data, actor: bearer });
    expect(damages.at(-1)).toMatchObject({ formula: "1d-1", damageType: "burn", armorDivisor: 5 });
    (game as any).time.worldTime = 9;
    await cards.get("ht-lantern-fire").actions.burn.run({ data: posted.at(-1).data, actor: bearer });
    expect(damages).toHaveLength(1);
    // An unlit one breaks with no fire.
    const cold = gear("Glass Lantern", { light: { kind: "glassLantern", radius: 5, beam: 0 } });
    actions.get("ht-light-set-down").run(cold, person("Other", [cold]));
    await flush();
    expect(areas).toHaveLength(1);
  });

  it("sets a lit beam down as a cone toward the one target, or the way its bearer faces", async () => {
    const torch = gear("Flashlight", { light: { kind: "electric", radius: 0, beam: 10 } }, {}, { lit: true });
    const bearer = person("Bearer", [torch]);
    const own = tokenAt("b", 0, bearer);
    targets = [tokenAt("t", 8, person("Target"))];
    expect(actions.get("ht-light-set-down").visible(torch)).toBe(true);
    actions.get("ht-light-set-down").run(torch, bearer);
    await flush();
    expect(areas[0]).toMatchObject({ center: { x: 0, y: 0 }, cone: { toward: { x: 8, y: 0 }, length: 10, width: 2 } });
    expect(torch.flags[MODULE_ID].expedition.placed).toBe(true);
    // A target standing in the placed cone is lit.
    areas[0].inside = [{ id: "t" }];
    expect(lightOver(fakeApi() as never, person("Shooter"), { id: "t" })).toBe("Flashlight");
    // No target: along the token's facing.
    await actions.get("ht-light-pick-up").run(torch, bearer);
    await flush();
    targets = [];
    own.document.rotation = 0;
    actions.get("ht-light-set-down").run(torch, bearer);
    await flush();
    expect(areas.at(-1).cone).toMatchObject({ direction: 90, length: 10 });
  });

  it("burns a lantern's pint down, puts it out at the end, and refills it", async () => {
    const lantern = gear("Kerosene Lantern", { light: { kind: "kerosene", radius: 5, beam: 0 } });
    const bearer = person("Bearer", [lantern]);
    const target = tokenAt("t", 3, person("Target"));
    tokens = [tokenAt("b", 0, bearer), target];
    actions.get("ht-light-switch").run(lantern, bearer);
    await flush();
    expect(lantern.flags[MODULE_ID].expedition).toMatchObject({ lit: true, litAt: 0, burned: 0 });
    expect(chat.at(-1)).toContain("BurnsFor");
    (game as any).time.worldTime = 4 * 3600;
    // Out: four hours burned are kept.
    actions.get("ht-light-switch").run(lantern, bearer);
    await flush();
    expect(lantern.flags[MODULE_ID].expedition).toMatchObject({ lit: false, litAt: null, burned: 4 * 3600 });
    actions.get("ht-light-switch").run(lantern, bearer);
    await flush();
    (game as any).time.worldTime = 12 * 3600 - 1;
    expect(darknessAttack(person("Shooter"), target).modifiers[0].value).toBe(-3);
    (game as any).time.worldTime = 12 * 3600;
    // Twelve hours a pint: it has gone out.
    expect(darknessAttack(person("Shooter"), target).modifiers[0].value).toBe(-7);
    expect(actions.get("ht-light-refuel").visible(lantern)).toBe(true);
    actions.get("ht-light-refuel").run(lantern, bearer);
    await flush();
    expect(lantern.flags[MODULE_ID].expedition).toMatchObject({ lit: false, burned: 0 });
    expect(chat.at(-1)).toContain("Refuelled.pint");
  });

  it("snaps a chemlight that can't be put out, winds a survival flashlight, and takes a new candle off the count", async () => {
    const stick = gear("Chemlight", { light: { kind: "chemical", radius: 2, beam: 0 } }, { quantity: 3 });
    const bearer = person("Bearer", [stick]);
    actions.get("ht-light-switch").run(stick, bearer);
    await flush();
    actions.get("ht-light-switch").run(stick, bearer);
    await flush();
    expect(stick.flags[MODULE_ID].expedition.lit).toBe(true);
    expect((globalThis as any).ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("CantPutOut"));
    (game as any).time.worldTime = 12 * 3600;
    actions.get("ht-light-refuel").run(stick, bearer);
    await flush();
    expect(changed).toEqual([{ item: "Chemlight", delta: -1 }]);
    const winder = gear("Survival Flashlight", { light: { kind: "electric", radius: 0, beam: 1 } }, { tl: "8" });
    actions.get("ht-light-switch").run(winder, person("Winder", [winder]));
    await flush();
    expect(chat.at(-1)).toContain('Wound {"name":"Survival Flashlight","seconds":30,"minutes":6}');
    expect(actions.get("ht-light-refuel").visible(winder)).toBe(false);
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

  it("stuns a victim the GM says was surprised by the light, through the system's surprise", async () => {
    const victim = person("Guard");
    vi.stubGlobal("fromUuid", async () => victim);
    const card = cards.get("ht-light-eyes");
    expect(card.actions.surpriseTotal.permission).toBe("gm");
    await card.actions.surpriseTotal.run({ message: {}, data: { victimUuid: "Actor.Guard", victim: "Guard", light: "Light", result: "" } });
    expect(conditions.at(-1)).toMatchObject({ actor: victim, surprise: true, total: true });
    expect(updated.at(-1).surprised).toContain("EyesSurprisedTotal");
    // Once said, not again.
    const count = conditions.length;
    await card.actions.surprisePartial.run({ message: {}, data: { victimUuid: "Actor.Guard", victim: "Guard", light: "Light", result: "", surprised: "done" } });
    expect(conditions).toHaveLength(count);
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

  it("pads a grapnel: a pound more, and -2 to hear it land at 1 yard (p. 55)", () => {
    const hook = gear("Grappling Hook", { climbing: "grapnel" }, { tl: "5" });
    const padded = gear("Grappling Hook", { climbing: "grapnel", padded: true }, { tl: "5" });
    expect(grapnelSound(hook)).toMatchObject({ heardAt: 1, lines: [] });
    expect(grapnelSound(padded)).toMatchObject({ heardAt: 1, lines: [{ value: -2 }] });
    const price = prices.find((p) => p.key === "ht-padded-grapnel");
    expect(price.apply(padded, { cost: 20, weight: 2 })).toMatchObject({ cost: 20, weight: 3 });
    expect(price.apply(hook, { cost: 20, weight: 2 })).toBeNull();
    expect(actions.get("ht-grapnel-heard").visible(hook)).toBe(true);
    expect(actions.get("ht-grapnel-heard").visible(gear("Harness", { climbing: "harness" }))).toBe(false);
  });

  it("rolls a targeted listener's Hearing for a grapnel landing, with the distance (API 1.117.0)", async () => {
    const padded = gear("Grappling Hook", { climbing: "grapnel", padded: true }, { tl: "5" });
    const listener = person("Guard", [], { derived: { senses: [{ sense: "hearing", score: 11 }] } });
    targets = [{ actor: listener }];
    dialogAnswer = { yards: 6, other: 0 };
    actions.get("ht-grapnel-heard").run(padded, person("Climber"));
    await flush();
    expect(successes.at(-1)).toMatchObject({ actor: listener, base: 11, skill: "Hearing", distance: { yards: 6, baseYards: 1 }, modifiers: [{ value: -2 }] });
  });

  it("takes a Move off for worn snowshoes, but not TL8 ones", () => {
    const shoes = gear("Snowshoes", { climbing: "snowshoes" }, { tl: "5", equipped: true });
    const context = fire("gworld.moveModifiers", { actor: person("Walker", [shoes]), lines: [] });
    expect(context.lines).toEqual([{ label: "Snowshoes", value: -1 }]);
    const fast = gear("Snowshoes", { climbing: "snowshoes" }, { tl: "8", equipped: true });
    expect(fire("gworld.moveModifiers", { actor: person("Walker", [fast]), lines: [] }).lines).toEqual([]);
  });

  it("adds crampons' +2 to the kick, on top of the system's boots, and nothing to the punch", () => {
    const crampons = gear("Crampons", { climbing: "crampons" }, { equipped: true });
    // The system has already put the boots' +1 in the kick (API 1.110.0).
    const rows = [
      { mode: { naturalKey: "punch" }, row: { damage: "1d-2", notes: [] } },
      { mode: { naturalKey: "kick" }, row: { damage: "1d", boots: true, notes: [] } },
    ];
    const addToDamage = (formula: string, bonus: number) => `${formula}+${bonus}`;
    fire(HOOKS.unarmedAttacks, { actor: person("Climber", [crampons]), rows, addToDamage });
    expect(rows[0]!.row.damage).toBe("1d-2");
    expect(rows[1]!.row.damage).toBe("1d+2");
    const loose = [{ mode: { naturalKey: "kick" }, row: { damage: "1d-1", notes: [] } }];
    fire(HOOKS.unarmedAttacks, { actor: person("Climber", [gear("Crampons", { climbing: "crampons" }, { equipped: false })]), rows: loose, addToDamage });
    expect(loose[0]!.row.damage).toBe("1d-1");
  });
});

describe("climbing gear on the Climb roll (High-Tech pp. 55-56)", () => {
  beforeEach(() => { on = { climbingGear: true }; ready(); });

  // The system's Climb roll: tagged with the climb, its own penalty keyed climbKind (API 1.103.0).
  const climb = (actor: any, kind: string, value: number) =>
    fire(HOOKS.successRollModifiers, { actor, skill: "Climbing", tags: ["climbing", `climb-${kind}`], modifiers: [{ key: "climbKind", label: "Climb", value }] }).modifiers;

  it("cancels the rope's and the building's penalties with the right gear", () => {
    expect(climb(person("A", [gear("Ascender", { climbing: "ascender" })]), "ropeUp", -2)[0]).toMatchObject({ key: "climbKind", value: 0 });
    expect(climb(person("D", [gear("Descender", { climbing: "descender" })]), "ropeDown", -1)[0]).toMatchObject({ value: 0 });
    expect(climb(person("K", [gear("Mini-Rappel Kit", { climbing: "rappelKit" })]), "ropeDown", -1)[0]).toMatchObject({ value: 0 });
    expect(climb(person("K", [gear("Climbing Kit", { climbing: "rappelKit" })]), "ropeUp", -2)[0]).toMatchObject({ value: 0 });
    expect(climb(person("S", [gear("Suction Cups", { climbing: "suctionCup" })]), "modernBuilding", -3)[0]).toMatchObject({ value: 0 });
  });

  it("leaves the penalty where the gear is for another climb", () => {
    expect(climb(person("K", [gear("Mini-Rappel Kit", { climbing: "rappelKit" })]), "ropeUp", -2)[0]).toMatchObject({ value: -2 });
    expect(climb(person("A", [gear("Ascender", { climbing: "ascender" })]), "modernBuilding", -3)[0]).toMatchObject({ value: -3 });
    expect(climb(person("N", []), "ropeUp", -2)[0]).toMatchObject({ value: -2 });
  });
});

describe("quality LBE and Stealth (High-Tech p. 54)", () => {
  beforeEach(() => { on = { loadBearingEquipment: true }; ready(); });

  const stealth = (actor: any, value: number) =>
    fire(HOOKS.successRollModifiers, { actor, skill: "Stealth", tags: ["DX"], modifiers: [{ key: "encumbrance", label: "Encumbrance", value }] }).modifiers[0];

  it("takes the LBE's quality off the encumbrance line, from TL6, never past 0", () => {
    const fine = gear("Tactical Vest", { carry: "lbe" }, { tl: "8", equipmentQuality: "fine" });
    expect(stealth(person("Soldier", [fine]), -3)).toMatchObject({ key: "encumbrance", value: -1 });
    expect(stealth(person("Soldier", [fine]), -1)).toMatchObject({ value: 0 });
    const old = gear("Haversack", { carry: "lbe" }, { tl: "5", equipmentQuality: "fine" });
    expect(stealth(person("Soldier", [old]), -3)).toMatchObject({ value: -3 });
    expect(stealth(person("Soldier", []), -2)).toMatchObject({ value: -2 });
  });

  it("loses the benefit to a canteen not full to the brim, but never to a water pack (p. 53)", () => {
    const fine = gear("Tactical Vest", { carry: "lbe" }, { tl: "8", equipmentQuality: "fine" });
    const canteen = gear("Canteen", {}, {}, { notFull: true });
    expect(stealth(person("Soldier", [fine, canteen]), -3)).toMatchObject({ value: -3 });
    expect(stealth(person("Soldier", [fine, gear("Canteen", {})]), -3)).toMatchObject({ value: -1 });
    expect(stealth(person("Soldier", [fine, gear("Water Pack", {}, {}, { notFull: true })]), -3)).toMatchObject({ value: -1 });
  });

  it("gets something out of a pack in 2d seconds, a bag 1d", async () => {
    const pack = gear("Backpack, Large", { carry: "backpack" });
    dieRoll = 7;
    expect(actions.get("ht-pack-retrieve").visible(pack)).toBe(true);
    expect(actions.get("ht-pack-retrieve").visible(gear("Web Gear", { carry: "lbe" }))).toBe(false);
    actions.get("ht-pack-retrieve").run(pack, person("Hiker", [pack]));
    await flush();
    expect(chat.at(-1)).toContain('"seconds":7');
  });
});

describe("crampons on ice and the lifting device (High-Tech pp. 55-56)", () => {
  beforeEach(() => { on = { climbingGear: true }; ready(); });

  it("rolls a climb on ice with the worn crampons' +1", async () => {
    const crampons = gear("Crampons", { climbing: "crampons" }, { equipped: true });
    const climber = person("Climber", [crampons], { skills: { Climbing: 12 } });
    actions.get("ht-crampons-ice").run(crampons, climber);
    await flush();
    expect(successes.at(-1)).toMatchObject({ base: 12, skill: "Climbing", tags: ["climbing", "climb-ice", "DX"], modifiers: [{ value: 1 }] });
    crampons.system.equipped = false;
    actions.get("ht-crampons-ice").run(crampons, person("Novice", [crampons]));
    await flush();
    expect(successes.at(-1)).toMatchObject({ base: 7, modifiers: [] });
  });

  it("rides a rope at 3 yards a second on a cartridge's 200 yards, up to 300 lbs.", async () => {
    const lifter = gear("Personal Lifting Device", {});
    const climber = person("Climber", [lifter]);
    dialogAnswer = { yards: 150, load: 250, down: false };
    actions.get("ht-lifting-device").run(lifter, climber);
    await flush();
    expect(chat.at(-1)).toContain('LiftedUp {"name":"Climber","yards":150,"seconds":50,"left":50}');
    dialogAnswer = { yards: 60, load: 250, down: false };
    actions.get("ht-lifting-device").run(lifter, climber);
    await flush();
    expect(chat.at(-1)).toContain("LiftNoFuel");
    dialogAnswer = { yards: 60, load: 350, down: true };
    actions.get("ht-lifting-device").run(lifter, climber);
    await flush();
    expect(chat.at(-1)).toContain("LiftTooHeavy");
    expect(actions.get("ht-lifting-cartridge").visible(lifter)).toBe(true);
    actions.get("ht-lifting-cartridge").run(lifter, climber);
    await flush();
    expect(lifter.flags[MODULE_ID].expedition.climbed).toBe(0);
  });
});
