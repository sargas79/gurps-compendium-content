/**
 * The firearm accessories as the system meets them: a magazine through the
 * price modifiers and `gworld.shotsEntry`; sights, stocks and bipods through
 * `gworld.weaponAttacks` and `gworld.attackModifiers`; a night sight through
 * `gworld.traitEffects`; a suppressor's Hearing roll -- with only High-Tech's
 * switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { ACCESSORY_TABLES } from "../../../shared/accessories/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { accessoryBulk, fittedScopeBonus, fittedTo, hearingLines, readyAccessories, reportOfGun, type AccessorySwitches } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterShots: "gworld.afterShots",
  shotsEntry: "gworld.shotsEntry",
};

let hooks: Map<string, Listener[]>;
let prices: any[];
let actions: any[];
let successes: any[];
let chat: string[];
let weaponState: Map<any, any>;
let on: Record<string, boolean>;

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (key: string) => key === "minimumSt" },
    data: { registerPriceModifier: (m: any) => prices.push(m) },
    combat: {
      hooks: HOOKS,
      getWeaponState: (item: any) => weaponState.get(item),
      setWeaponState: async (item: any, _m: string, patch: any) => { weaponState.set(item, { ...weaponState.get(item), ...patch }); },
    },
    sheets: { registerSheetSection: () => undefined, registerRowAction: (a: any) => actions.push(a) },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      derived: (actor: any) => actor?.system?.derived ?? {},
    },
    roll: { success: async (o: any) => { successes.push(o); return { success: true }; } },
  };
}

const switches = (): AccessorySwitches => ({
  magazines: () => on.gunMagazines === true,
  sights: () => on.gunSights === true,
  suppressors: () => on.suppressors === true,
  cinematic: () => on.cinematicSilencers === true,
  stocks: () => on.stocksAndMounts === true,
});

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function character(extra: Record<string, unknown> = {}): any {
  const items: any[] = [];
  const actor: any = {
    name: "Shooter",
    attributes: { ST: 10 },
    system: { posture: "standing", aim: { turns: 0 }, derived: { senses: [{ sense: "hearing", score: 12 }] } },
    items: Object.assign(items, { get: (id: string) => items.find((i) => i.id === id) }),
    ...extra,
  };
  return actor;
}

let nextId = 0;

function add(actor: any, item: any): any {
  item.id ??= `i${(nextId += 1)}`;
  item.actor = actor;
  item.isOwner = true;
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  actor.items.push(item);
  return item;
}

function gun(actor: any, patch: { name?: string; skill?: string; shots?: string; bulk?: number; accuracy?: number; recoil?: number; minSt?: number; modes?: any[]; firearm?: Record<string, unknown> } = {}): any {
  const mode = { skill: patch.skill ?? "Guns (Pistol)", accuracy: patch.accuracy ?? 2, malfunction: 17, rateOfFire: 3, recoil: patch.recoil ?? 2, shots: patch.shots ?? "17+1(3)", bulk: patch.bulk ?? -2, minSt: patch.minSt ?? 9, damageFormula: "2d+2", mount: "" };
  return add(actor, {
    name: patch.name ?? "Glock 17, 9x19mm",
    type: "equipment",
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "8", weaponClass: "firearm", cost: 600, weight: 2, rangedModes: patch.modes ?? [mode], extensions: { [MODULE_ID]: { firearm: { ...patch.firearm } } } },
  });
}

function accessory(actor: any, name: string, fitted: any, data: Record<string, unknown> = {}): any {
  return add(actor, {
    name,
    type: "equipment",
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "8", cost: 100, weight: 1, rangedModes: [], extensions: { [MODULE_ID]: { gunAccessory: { gun: fitted?.id ?? "", ...data } } } },
  });
}

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

/** The gun's rows after the weaponAttacks listeners, from a row per stored mode. */
function rows(item: any, skillLevel: (name: string) => number | null = () => 12): any[] {
  const context = fire(HOOKS.weaponAttacks, {
    actor: item.actor,
    item,
    skillLevel,
    rows: item.system.rangedModes.map((mode: any) => ({ kind: "ranged", mode, basis: {}, row: { skillName: mode.skill, skillLevel: 12, accuracy: mode.accuracy, recoil: mode.recoil, minSt: mode.minSt, minStPenalty: 0, malfunction: 17, damage: "7d", halfDamageRange: 500, maxRange: 3000, notes: [] } })),
  });
  return context.rows.map((r: any) => r.row);
}

/** An attack from a gun's mode, with the system's lines as given. */
function attack(item: any, modifiers: any[] = [], extra: Record<string, unknown> = {}, modeIndex = 0): any {
  return fire(HOOKS.attackModifiers, { actor: item.actor, item, mode: { index: modeIndex, ranged: true }, modifiers, refusal: null, options: {}, rangeYards: 50, ...extra });
}

const aimedAt = (acc: number, scope = 0) => [{ key: "accuracy", label: "Aimed", value: acc + scope, ...(scope ? { scope } : {}) }];
const valueOf = (lines: any[], label: string) => lines.find((l) => String(l.label).includes(label))?.value;

function ready(): void {
  readyAccessories(fakeApi() as never, switches());
}

beforeEach(() => {
  hooks = new Map();
  prices = [];
  actions = [];
  successes = [];
  chat = [];
  weaponState = new Map();
  on = {};
  ACCESSORY_TABLES.clear();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { targets: new Set() },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with the switches off", () => {
  it("does nothing", () => {
    ready();
    const actor = character();
    const rifle = gun(actor, { name: "Remington 700, .30-06", skill: "Guns (Rifle)", accuracy: 4, bulk: -5 });
    accessory(actor, "Fixed-Power Scope (TL7, per +1 Acc)", rifle, { level: 3 });
    expect(fittedTo(rifle, switches())).toEqual([]);
    const context = attack(rifle, aimedAt(4));
    expect(context.modifiers).toHaveLength(1);
    expect(prices.map((p) => p.apply(rifle, { cost: 600, weight: 2 }))).toEqual([null, null]);
  });
});

describe("magazines (p. 155)", () => {
  it("reprices the gun, holds the rounds, and costs Bulk and Malf. as the book says", () => {
    on = { gunMagazines: true };
    ready();
    const actor = character();
    const m16 = gun(actor, { name: "Colt M16A1, .223 Remington", skill: "Guns (Rifle)", shots: "20+1(3)", bulk: -4 });
    const before = prices.map((p) => p.apply(m16, { cost: 600, weight: 7 })).find(Boolean);
    expect(before).toBeUndefined();
    m16.system.extensions[MODULE_ID].firearm = { magazine: "extended", magazineMaterial: "alloy", magazineRounds: 50 };
    // .223 Remington: WPS 0.026, as the book's example.
    const priced = prices.map((p) => p.apply(m16, { cost: 600, weight: 7 })).find(Boolean);
    expect(priced.cost).toBeCloseTo(636.5);
    expect(priced.weight).toBeCloseTo(8.04);
    const entry = fire(HOOKS.shotsEntry, { actor, item: m16, modeIndex: 0, mode: m16.system.rangedModes[0], entry: { capacity: 20 } }).entry;
    expect(entry.capacity).toBe(50);
    expect(accessoryBulk(fakeApi() as never, m16, m16.system.rangedModes[0], false, switches())).toBe(-5);
    expect(rows(m16)[0].malfunction).toBe(17);
    m16.system.extensions[MODULE_ID].firearm.magazine = "drum";
    expect(rows(m16)[0].malfunction).toBe(16);
  });

  it("keeps a high-density magazine out of a pistol's grip", () => {
    on = { gunMagazines: true };
    ready();
    const actor = character();
    const glock = gun(actor, { firearm: { magazine: "highDensity", magazineRounds: 33 } });
    const entry = fire(HOOKS.shotsEntry, { actor, item: glock, modeIndex: 0, mode: glock.system.rangedModes[0], entry: { capacity: 17 } }).entry;
    expect(entry.capacity).toBe(17);
    expect(prices.map((p) => p.apply(glock, { cost: 600, weight: 2 })).find(Boolean)).toBeUndefined();
  });
});

describe("sights (pp. 155-157)", () => {
  it("gives a fixed-power scope nothing until aimed its bonus in seconds, then holds it to base Acc", () => {
    on = { gunSights: true };
    ready();
    const actor = character();
    const pistol = gun(actor, { accuracy: 2 });
    const scope = accessory(actor, "Fixed-Power Scope (TL7, per +1 Acc)", pistol, { level: 4 });
    expect(prices.map((p) => p.apply(scope, { cost: 150, weight: 1 })).find(Boolean)).toMatchObject({ cost: 600 });
    actor.system.aim.turns = 2;
    expect(attack(pistol, aimedAt(2)).modifiers).toHaveLength(1);
    actor.system.aim.turns = 4;
    const lines = attack(pistol, aimedAt(2)).modifiers;
    expect(valueOf(lines, "Fixed-Power Scope")).toBe(4);
    // +4 on an Acc 2 pistol gives only +2 (p. 155).
    expect(valueOf(lines, "SightCap")).toBe(-2);
    expect(fittedScopeBonus(pistol, switches())).toBe(4);
  });

  it("counts a built-in scope towards the cap", () => {
    on = { gunSights: true };
    ready();
    const actor = character();
    const rifle = gun(actor, { skill: "Guns (Rifle)", accuracy: 3 });
    accessory(actor, "Reflex Sight, Battery", rifle);
    actor.system.aim.turns = 3;
    const lines = attack(rifle, aimedAt(3, 3)).modifiers;
    expect(valueOf(lines, "Reflex Sight")).toBe(1);
    expect(valueOf(lines, "SightCap")).toBe(-1);
  });

  it("gives a reflex sight +1 on an unaimed shot within 300 yards, and nothing beyond", () => {
    on = { gunSights: true };
    ready();
    const actor = character();
    const pistol = gun(actor, { accuracy: 2 });
    accessory(actor, "Reflex Sight, Tritium", pistol);
    expect(valueOf(attack(pistol, [], { rangeYards: 20 }).modifiers, "Reflex Sight")).toBe(1);
    expect(valueOf(attack(pistol, [], { rangeYards: 400 }).modifiers, "Reflex Sight")).toBeUndefined();
  });

  it("takes a Bulk point on an unaimed shot for a scope over 4x, and adds a night sight's Bulk", () => {
    on = { gunSights: true };
    ready();
    const actor = character();
    const rifle = gun(actor, { skill: "Guns (Rifle)", accuracy: 4, bulk: -5 });
    accessory(actor, "Variable-Power Scope (TL8, per +1 Acc)", rifle, { level: 3 });
    const bulk = () => [{ key: "bulk", label: "Bulk", value: -5, situation: "moveAndAttack" }];
    expect(attack(rifle, bulk()).modifiers[0].value).toBe(-6);
    accessory(actor, "Night Sight", rifle);
    expect(attack(rifle, bulk()).modifiers[0].value).toBe(-8);
  });

  it("gives Night Vision and imposes Colorblindness and Tunnel Vision while the shooter looks through it", async () => {
    on = { gunSights: true };
    ready();
    const actor = character();
    const rifle = gun(actor, { skill: "Guns (Rifle)", accuracy: 4 });
    accessory(actor, "Advanced Night Sight", rifle);
    const effects = () => fire("gworld.traitEffects", { actor, effects: { nightVision: 0, infravision: false, restrictedVision: null, colorblindness: false }, sources: [] });
    expect(effects().effects).toMatchObject({ nightVision: 0, colorblindness: false });
    await actions.find((a) => a.key === "ht-sight").run(rifle, actor);
    const context = effects();
    expect(context.effects).toMatchObject({ nightVision: 7, restrictedVision: "tunnel", colorblindness: true });
    expect(context.sources.map((s: any) => s.effect)).toEqual(["nightVision", "restrictedVision.tunnel", "colorblindness"]);
  });

  it("prices a laser by its colour and a computer sight by its vision", () => {
    on = { gunSights: true };
    ready();
    const actor = character();
    const laser = accessory(actor, "Targeting Laser (Sidearm)", null, { colour: "green" });
    expect(prices.map((p) => p.apply(laser, { cost: 150, weight: 0.25 })).find(Boolean)).toMatchObject({ cost: 600 });
    const sight = accessory(actor, "Computer Sight (Infravision)", null, { nightVision: true });
    expect(prices.map((p) => p.apply(sight, { cost: 30000, weight: 10 })).find(Boolean)).toMatchObject({ cost: 22500 });
  });
});

describe("suppressors (pp. 158-159)", () => {
  it("puts the suppressor's penalty on the Hearing roll, and a sealed breech's point", () => {
    expect(hearingLines({ report: "light", yards: 300, suppressor: -2, sealedBreech: false, outsideCone: false, unfamiliar: false, cinematic: 1, other: 0 }).map((l) => l.value)).toEqual([-1, -2]);
    expect(hearingLines({ report: "light", yards: 300, suppressor: -2, sealedBreech: true, outsideCone: true, unfamiliar: true, cinematic: 2, other: -5 }).map((l) => l.value)).toEqual([-1, -6, -1, -4, -5]);
  });

  it("rolls the targeted listener's Hearing against a suppressed pistol's shot", async () => {
    on = { suppressors: true };
    ready();
    const actor = character();
    const pistol = gun(actor, { name: "Walther PPK, .32 ACP", accuracy: 2, shots: "7+1(3)", firearm: {} });
    pistol.system.rangedModes[0].damageFormula = "2d-1";
    expect(reportOfGun(pistol)).toBe("light");
    const suppressor = accessory(actor, "Detachable Baffle Suppressor, Pistol or SMG (per -1 Hearing)", pistol, { level: 2 });
    expect(prices.map((p) => p.apply(suppressor, { cost: 250, weight: 1 })).find(Boolean)).toMatchObject({ cost: 500 });
    const listener = character({ name: "Guard", items: Object.assign([{ type: "skill", name: "Guns (Pistol)" }], { get: () => null }) });
    const token = { actor: listener };
    (globalThis as any).game.user.targets = new Set([token]);
    (globalThis as any).foundry.applications = { api: { DialogV2: { prompt: async () => ({ yards: 300, cone: false, unfamiliar: false, cinematic: 1, other: 0 }) } } };
    await actions.find((a) => a.key === "ht-hear-shot").run(pistol, actor);
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ actor: listener, base: 12, tags: ["hearing", "detection"] });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-1, -2]);
  });

  it("doubles or triples the penalty for a cinematic silencer", async () => {
    on = { suppressors: true, cinematicSilencers: true };
    ready();
    const actor = character();
    const pistol = gun(actor, { name: "Walther PPK, .32 ACP", shots: "7+1(3)", firearm: { report: "light" } });
    accessory(actor, "Detachable Baffle Suppressor, Pistol or SMG (per -1 Hearing)", pistol, { level: 2 });
    (globalThis as any).game.user.targets = new Set([{ actor: character({ name: "Guard" }) }]);
    (globalThis as any).foundry.applications = { api: { DialogV2: { prompt: async () => ({ yards: 256, cone: false, unfamiliar: false, cinematic: 3, other: 0 }) } } };
    await actions.find((a) => a.key === "ht-hear-shot").run(pistol, actor);
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-6]);
  });

  it("does nothing on an ordinary revolver", () => {
    on = { suppressors: true };
    ready();
    const actor = character();
    const revolver = gun(actor, { name: "S&W Model 10, .38 Special", shots: "6(3i)", bulk: -2 });
    accessory(actor, "Detachable Baffle Suppressor, Pistol or SMG (per -1 Hearing)", revolver, { level: 2 });
    expect(fittedTo(revolver, switches())).toEqual([]);
    expect(accessoryBulk(fakeApi() as never, revolver, revolver.system.rangedModes[0], true, switches())).toBe(-2);
    expect(rows(revolver)[0].notes).toEqual([]);
  });

  it("slows a wiper suppressor's bullet for its 40 shots", async () => {
    on = { suppressors: true };
    ready();
    const actor = character();
    const rifle = gun(actor, { name: "AKM, 7.62x39mm", skill: "Guns (Rifle)", shots: "30+1(3)", bulk: -4 });
    const wiper = accessory(actor, "Detachable Wiper Suppressor, Rifle (per -1 Hearing)", rifle, { level: 4 });
    expect(rows(rifle)[0]).toMatchObject({ damage: "3d+2", halfDamageRange: 250, maxRange: 1500 });
    expect(accessoryBulk(fakeApi() as never, rifle, rifle.system.rangedModes[0], true, switches())).toBe(-5);
    fire(HOOKS.afterShots, { actor, item: rifle, fired: 40, shots: 40 });
    await Promise.resolve();
    expect(wiper.system.extensions[MODULE_ID].gunAccessory.fired).toBe(40);
    expect(rows(rifle)[0].damage).toBe("7d");
    expect(chat.some((c) => c.includes("SuppressorWornOut"))).toBe(true);
  });
});

describe("stocks and bipods (p. 160)", () => {
  it("folds a fitted stock: -1 Acc, +1 Recoil, ST x1.2 and Bulk a step better", async () => {
    on = { stocksAndMounts: true };
    ready();
    const actor = character();
    const rifle = gun(actor, { skill: "Guns (Rifle)", accuracy: 4, recoil: 2, minSt: 9, bulk: -5 });
    accessory(actor, "Folding Stock", rifle);
    expect(rows(rifle)[0]).toMatchObject({ accuracy: 4, recoil: 2, minSt: 9 });
    await actions.find((a) => a.key === "ht-fold-stock").run(rifle, actor);
    expect(rows(rifle)[0]).toMatchObject({ accuracy: 3, recoil: 3, minSt: 11, minStPenalty: -1, skillLevel: 11 });
    const bulk = attack(rifle, [{ key: "bulk", label: "Bulk", value: -5, situation: "moveAndAttack" }]).modifiers[0];
    expect(bulk.value).toBe(-4);
  });

  it("picks the GCA record's stored mode by the stock's state, refusing the other", async () => {
    on = { stocksAndMounts: true };
    ready();
    const actor = character();
    const galil = gun(actor, {
      name: "IMI Galil ARM, .223 Remington",
      modes: [
        { name: "Standard", skill: "Guns (Rifle)", accuracy: 4, bulk: -5, recoil: 2, minSt: 9, shots: "35+1(3)", mount: "" },
        { name: "Folded Stock", skill: "Guns (Rifle)", accuracy: 3, bulk: -4, recoil: 3, minSt: 11, shots: "35+1(3)", mount: "" },
      ],
    });
    expect(attack(galil, [], {}, 0).refusal).toBeNull();
    expect(attack(galil, [], {}, 1).refusal).toBe("GCC.HT.Accessories.RefuseFolded");
    expect(rows(galil)[1].notes.map((n: any) => n.label)).toEqual(["GCC.HT.Accessories.OtherSetupNote"]);
    await actions.find((a) => a.key === "ht-fold-stock").run(galil, actor);
    expect(attack(galil, [], {}, 0).refusal).toBe("GCC.HT.Accessories.RefuseUnfolded");
    expect(attack(galil, [], {}, 1).refusal).toBeNull();
  });

  it("needs the bipod open and the shooter prone for a 'w/ Bipod' mode, whose ST is already the book's", async () => {
    on = { stocksAndMounts: true };
    ready();
    const actor = character();
    const fg42 = gun(actor, {
      name: "Rheinmetall FG42, 7.92x57mm",
      modes: [
        { name: "w/o Bipod", skill: "Guns (Rifle)", accuracy: 5, bulk: -5, recoil: 3, minSt: 11, shots: "20+1(3)", mount: "bipod" },
        { name: "w/ Bipod", skill: "Guns (Rifle)", accuracy: 6, bulk: -5, recoil: 3, minSt: 8, shots: "20+1(3)", mount: "bipod" },
      ],
    });
    expect(attack(fg42, [], {}, 1).refusal).toBe("GCC.HT.Accessories.RefuseBipod");
    await actions.find((a) => a.key === "ht-bipod").run(fg42, actor);
    expect(attack(fg42, [], {}, 0).refusal).toBe("GCC.HT.Accessories.RefuseNoBipod");
    expect(attack(fg42, [], {}, 1).refusal).toBe("GCC.HT.Accessories.RefuseNotProne");
    actor.system.posture = "lying";
    expect(attack(fg42, [], {}, 1).refusal).toBeNull();
    // The system took two-thirds of the stored 8 (to 6) for a prone shooter; the row goes back to the stored 8.
    actor.attributes.ST = 7;
    const context = fire(HOOKS.weaponAttacks, { actor, item: fg42, skillLevel: () => 12, rows: [{ kind: "ranged", mode: fg42.system.rangedModes[1], basis: {}, row: { skillLevel: 12, minSt: 8, minStPenalty: 0, notes: [] } }] });
    expect(context.rows[0].row).toMatchObject({ minStPenalty: -1, skillLevel: 11 });
  });

  it("braces a prone shooter on a fitted bipod, at two-thirds the ST, and a sitting one on shooting sticks", async () => {
    on = { stocksAndMounts: true };
    ready();
    const actor = character();
    const rifle = gun(actor, { skill: "Guns (Rifle)", accuracy: 4, minSt: 12 });
    accessory(actor, "Bipod (TL8)", rifle);
    await actions.find((a) => a.key === "ht-bipod").run(rifle, actor);
    actor.system.posture = "lying";
    expect(rows(rifle)[0]).toMatchObject({ minSt: 8 });
    expect(valueOf(attack(rifle, aimedAt(4)).modifiers, "BipodBraced")).toBe(1);
    const sitter = character();
    const other = gun(sitter, { skill: "Guns (Rifle)", accuracy: 4 });
    accessory(sitter, "Shooting Sticks", other);
    sitter.system.posture = "sitting";
    expect(valueOf(attack(other, aimedAt(4)).modifiers, "SticksBraced")).toBe(1);
    expect(valueOf(attack(other, [...aimedAt(4), { key: "braced", label: "Braced", value: 1 }]).modifiers, "SticksBraced")).toBeUndefined();
  });

  it("shoots a pistol with a stock as a carbine: Guns (Rifle), +1 Acc, ST x0.8", () => {
    on = { stocksAndMounts: true };
    ready();
    const actor = character();
    const mauser = gun(actor, { name: "Mauser C96, 7.63x25mm", accuracy: 3, minSt: 11, bulk: -3 });
    accessory(actor, "Pistol Stock (TL5)", mauser);
    const row = rows(mauser, (name) => (name === "Guns (Rifle)" ? 13 : 12))[0];
    expect(row).toMatchObject({ skillName: "Guns (Rifle)", accuracy: 4, minSt: 9, skillLevel: 13 });
    expect(accessoryBulk(fakeApi() as never, mauser, mauser.system.rangedModes[0], true, switches())).toBe(-4);
  });
});
