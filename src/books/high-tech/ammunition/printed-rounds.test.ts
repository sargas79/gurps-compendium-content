/**
 * High-Tech's printed rounds (pp. 103, 143) as the system meets them, with
 * only High-Tech's switches on: the row a shotgun or a grenade launcher fires
 * with one, its cloud, its price, the flame jet's pace, and what rock salt and
 * the net leave on a failed roll.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ammunitionHearing, readyAmmunition, type AmmunitionSwitches } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterShots: "gworld.afterShots",
  afflictionEffect: "gworld.afflictionEffect",
  poisonCycle: "gworld.poisonCycle",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let areas: any[];
let prices: any[];
let chat: string[];

function fakeApi() {
  return {
    rules: { ...rules, weaponClassOf: () => "firearm" },
    registry: { isRuleOn: () => false },
    combat: { hooks: HOOKS, registerAttackOption: (o: any) => `${o.module}.${o.key}` },
    sheets: { registerSheetSection: () => undefined },
    data: { registerPriceModifier: (m: any) => prices.push(m), registerPoison: () => undefined },
    items: { setMalfunction: async () => undefined },
    areas: {
      add: async (_scene: any, area: any) => { areas.push(area); return area.id; },
      list: () => areas,
      standsIn: () => [],
      registerLitFor: (r: any) => `${r.module}.${r.key}`,
    },
    actors: { skillLevel: () => null, attribute: () => 10, derived: () => ({}), dosePoison: async () => null, advancePoison: async () => undefined, applyCondition: async () => "c1" },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

const switches: AmmunitionSwitches = {
  upgrades: () => on.ammunitionUpgrades === true,
  handloading: () => false,
  misloading: () => false,
  projectiles: () => on.projectileOptions === true,
  exotic: () => false,
  multiple: () => on.multipleProjectileLoads === true,
  projectileUpgrades: () => false,
  explosive: () => on.explosiveProjectiles === true,
  cargo: () => on.cargoProjectiles === true,
};

const load = (patch: Record<string, unknown>) => ({ mode: 0, calibre: "", upgrades: [], source: "", matched: false, batchMalfunction: 0, discount: 0, projectile: "", material: "", shotMm: 0, shotCount: 0, projectileUpgrades: [], poisonCost: 0, ...patch });

/** A gun with its modes (the first is the one fired) and its loads. */
function gun(name: string, modes: Array<Record<string, unknown>>, loads: any[] = [], tl = "7"): any {
  const actor = { name: "Shooter", id: "a0", items: Object.assign([], { get: () => undefined }), getActiveTokens: () => [] };
  const item: any = {
    id: "g1", uuid: `Item.${name}`, name, type: "equipment", isOwner: true, actor, flags: {},
    system: { tl, cost: 500, quality: "good", weaponClass: "firearm", meleeModes: [], rangedModes: modes.map((m) => ({ accuracy: 3, malfunction: 17, rateOfFire: 2, shots: "5+1(2i)", loaded: 5, loadedFrom: "", minSt: 10, ammunition: "", projectiles: 1, ...m })), extensions: { [MODULE_ID]: { htLoads: loads, firearm: {} } } },
  };
  item.update = async (changes: Record<string, unknown>) => { for (const [path, value] of Object.entries(changes)) setPath(item, path, value); };
  item.setFlag = async (_scope: string, key: string, value: unknown) => { item.flags[key] = value; };
  item.getFlag = (_scope: string, key: string) => item.flags[key];
  return item;
}

/** The Remington 870: its shot and slug modes, as the pack has them. */
const remington = (loads: any[]) => gun("Remington Model 870, 12G 2.75''", [
  { name: "Shot", skill: "Guns (Shotgun)", damageFormula: "1d+1", damageType: "pi", halfDamageRange: 40, maxRange: 800, projectiles: 9, recoil: 1 },
  { name: "Slug", skill: "Guns (Shotgun)", damageFormula: "5d", damageType: "pi++", accuracy: 4, halfDamageRange: 100, maxRange: 1200, recoil: 5 },
], loads);
const m79 = (loads: any[]) => gun("Colt M79, 40x46mmSR", [{ skill: "Guns (Grenade Launcher)", damageFormula: "4d-1", damageType: "cr", explosive: true, fragmentation: "2d", accuracy: 1, rateOfFire: 1, shots: "1(3)", loaded: 1, minSt: 8, recoil: 2, minRange: 30, halfDamageRange: 0, maxRange: 440 }], loads);

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** The row the sheet shows for the gun's first mode. */
function row(item: any): any {
  const mode = item.system.rangedModes[0];
  const figures = {
    damage: mode.damageFormula, damageType: mode.damageType, armorDivisor: 1, halfDamageRange: mode.halfDamageRange, maxRange: mode.maxRange, minRange: mode.minRange ?? 0,
    accuracy: mode.accuracy, malfunction: 17, minSt: mode.minSt, projectiles: mode.projectiles, recoil: mode.recoil, explosive: mode.explosive === true, fragmentation: mode.fragmentation ?? "",
    followUp: null, firstHit: null, noOverpenetration: false, scatterSquared: false, areaAttack: false, coneMaxWidth: 0,
  };
  return fire(HOOKS.weaponAttacks, { actor: item.actor, item, rows: [{ kind: "ranged", mode, basis: { ...figures }, row: { ...figures, notes: [] } }] }).rows[0].row;
}
const labels = (r: any): string[] => r.notes.map((n: any) => n.label);

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  on = {};
  areas = [];
  prices = [];
  chat = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { user: { id: "u1", isGM: true, targets: new Set() }, time: { worldTime: 1000 }, i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s, randomID: () => "r1" }, applications: { api: { DialogV2: { prompt: async () => { throw new Error("no dialog expected"); } } } } });
  vi.stubGlobal("canvas", { scene: { id: "s1", grid: { size: 100, distance: 1 } }, templates: { placeables: [{ document: { author: { id: "u1" }, x: 500, y: 500 } }] } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0.5 } });
  readyAmmunition(fakeApi() as never, switches);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a shotgun's printed rounds (p. 103)", () => {
  it("fires a beanbag from the shot mode as the book prints it, only with the projectile options on", () => {
    const gunWithBeanbag = remington([load({ printed: "sgBeanbag" })]);
    expect(row(gunWithBeanbag)).toMatchObject({ damage: "1d+1", projectiles: 9 });
    on.projectileOptions = true;
    const shown = row(gunWithBeanbag);
    expect(shown).toMatchObject({ damage: "1d", damageType: "cr", armorDivisor: 0.2, doubleKnockback: true, accuracy: 0, halfDamageRange: 10, maxRange: 150, projectiles: 1, recoil: 4 });
    expect(labels(shown)).toContain('GCC.HT.Ammunition.Printed.sgBeanbag {"tl":7}');
    expect(labels(shown)).toContain("GCC.HT.Ammunition.Note.noCycle {}");
  });

  it("gives the HE shell its follow-up blast and minimum range, incendiary, under the explosive rounds' switch", () => {
    on.explosiveProjectiles = true;
    const shown = row(remington([load({ printed: "sgHe" })]));
    expect(shown).toMatchObject({ damage: "4d", damageType: "pi++", armorDivisor: 0.5, minRange: 3, incendiary: true, recoil: 5 });
    expect(shown.followUp).toMatchObject({ damage: "1d-1", damageType: "cr", explosive: true, fragmentation: "1d", followUp: true });
  });

  it("sprays Dragon's Breath as a 10-yard cone, and won't fire it again inside four seconds", async () => {
    on.projectileOptions = true;
    const breath = remington([load({ printed: "sgFlameJet" })]);
    expect(row(breath)).toMatchObject({ damage: "1d-2", damageType: "burn", maxRange: 75, areaAttack: true, coneMaxWidth: 10 });
    const combat = { id: "c1", started: true, round: 3 };
    (game as any).combat = combat;
    const attack = () => fire(HOOKS.attackModifiers, { actor: breath.actor, item: breath, mode: { index: 0, ranged: true }, modifiers: [], refusal: null }).refusal;
    expect(attack()).toBeNull();
    fire(HOOKS.afterShots, { actor: breath.actor, item: breath, modeIndex: 0 });
    await flush();
    combat.round = 6;
    expect(attack()).toContain("PacedRefusal");
    combat.round = 7;
    expect(attack()).toBeNull();
    // A new combat starts afresh.
    (game as any).combat = { id: "c2", started: true, round: 1 };
    expect(attack()).toBeNull();
  });

  it("makes rock salt a HT roll whose failure is moderate pain for the margin's minutes", () => {
    on.projectileOptions = true;
    const salt = remington([load({ printed: "sgRockSalt" })]);
    expect(row(salt)).toMatchObject({ affliction: true, afflictionAttribute: "HT", afflictionModifier: 0, maxRange: 10 });
    const context = fire(HOOKS.afflictionEffect, { actor: { name: "Rioter" }, item: salt, mode: { index: 0, ranged: true }, margin: -3, effects: [] });
    expect(context.effects).toEqual([{ key: "moderatePain", duration: { seconds: 180 } }]);
  });

  it("hears the silent shot on the 16-yard line", () => {
    on.multipleProjectileLoads = true;
    expect(ammunitionHearing(remington([load({ printed: "sgSilent" })]), switches)).toEqual({ silent: true, penalty: 0 });
    expect(ammunitionHearing(remington([load({})]), switches)).toBeNull();
  });
});

describe("a grenade launcher's printed rounds (p. 143)", () => {
  it("fires TL7 HEDP: the jet with its blast linked, keeping the launcher's minimum range", () => {
    on.explosiveProjectiles = true;
    const shown = row(m79([load({ printed: "glHedp7" })]));
    expect(shown).toMatchObject({ damage: "4d", armorDivisor: 10, explosive: true, fragmentation: "", minRange: 30, incendiary: true });
    expect(shown.followUp).toMatchObject({ damage: "4d+2", fragmentation: "2d", followUp: false });
  });

  it("leaves a tear-gas round's 8-yard cloud for 20 seconds without asking", async () => {
    on.cargoProjectiles = true;
    const gas = m79([load({ printed: "glTearGas" })]);
    expect(row(gas)).toMatchObject({ damage: "1d+1", damageType: "cr", armorDivisor: 0.5, doubleKnockback: true, explosive: false, minRange: 0 });
    fire(HOOKS.afterShots, { actor: gas.actor, item: gas, modeIndex: 0 });
    await flush();
    expect(areas[0]).toMatchObject({ radius: 8, expires: 1020 });
  });

  it("stuns whoever fails to resist the net round's charge", () => {
    on.projectileOptions = true;
    const net = m79([load({ printed: "glNet" })]);
    expect(row(net)).toMatchObject({ affliction: true, afflictionModifier: -5, maxRange: 10, explosive: false });
    const context = fire(HOOKS.afflictionEffect, { actor: { name: "Suspect" }, item: net, mode: { index: 0, ranged: true }, margin: -1, effects: [] });
    expect(context.effects).toEqual([{ key: "stunned" }]);
  });
});

describe("the price of a box of printed or limited-production rounds (pp. 103, 166)", () => {
  const box = (loads: any[], fits = "12G 2.75in") => ({ id: "b1", name: "Shells", type: "equipment", system: { category: "ammunition", quantity: 25, tl: "8", ammunition: { kind: "", fits }, extensions: { [MODULE_ID]: { htLoads: loads } } } });

  it("prices a box of beanbags at the book's $1.50 a round, and experimental APDS at $7.50", () => {
    on.projectileOptions = true;
    const apply = prices[0].apply;
    expect(apply(box([load({ printed: "sgBeanbag" })], "12G 2.5in"))).toMatchObject({ cost: 1.5 });
    expect(apply(box([load({ printed: "sgApds", limited: 5 })]))).toMatchObject({ cost: 7.5 });
  });

  it("multiplies any other round's cost in limited production", () => {
    on.projectileOptions = true;
    const apply = prices[0].apply;
    // The 12-gauge 2.75" shell's $0.5, times five.
    expect(apply(box([load({ limited: 5 })]))).toMatchObject({ cost: 2.5 });
    expect(apply(box([load({ limited: 3 })]))).toBeNull();
  });
});
