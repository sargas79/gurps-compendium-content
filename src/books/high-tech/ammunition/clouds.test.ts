/**
 * What a cargo round's cloud does after it is released (High-Tech p. 171):
 * smoke's mild irritant, somebody walking into the cloud later, and the gas
 * mask a vomiting agent forces off.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyAmmunition, type AmmunitionSwitches } from "./index.js";

// A gas mask is worn where the test's actor says so.
vi.mock("../breathing/index.js", () => ({ wearsIrritantMask: (actor: any) => actor?.masked === true }));

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterShots: "gworld.afterShots",
  poisonCycle: "gworld.poisonCycle",
  afterDamage: "gworld.afterDamage",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let areas: any[];
let inArea: any[];
let doses: any[];
let advanced: any[];
let chat: string[];
let conditions: any[];

function fakeApi() {
  return {
    rules: { ...rules, weaponClassOf: () => "firearm" },
    registry: { isRuleOn: () => false },
    combat: { hooks: HOOKS, registerAttackOption: (o: any) => `${o.module}.${o.key}` },
    sheets: { registerSheetSection: () => undefined },
    data: { registerPriceModifier: () => undefined, registerPoison: () => undefined },
    items: { setMalfunction: async () => undefined },
    areas: {
      add: async (_scene: any, area: any) => { areas.push({ ...area, radius: area.radius * 100 }); return area.id; },
      list: () => areas,
      standsIn: () => inArea,
      registerLitFor: (r: any) => `${r.module}.${r.key}`,
    },
    actors: {
      skillLevel: () => null,
      attribute: () => 10,
      derived: (actor: any) => actor.derived ?? {},
      dosePoison: async (actor: any, poison: any) => { doses.push({ actor: actor.name, ...poison }); return { id: `d${doses.length}`, delaySeconds: poison.delaySeconds ?? 0 }; },
      advancePoison: async (actor: any, id: string) => { advanced.push({ actor: actor.name, id }); },
      applyCondition: async (actor: any, application: any) => { conditions.push({ actor: actor.name, ...application }); return "c1"; },
    },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

const switches: AmmunitionSwitches = {
  upgrades: () => false,
  handloading: () => false,
  misloading: () => false,
  cargo: () => on.cargoProjectiles === true,
};

const load = (patch: Record<string, unknown>) => ({ mode: 0, calibre: "", upgrades: [], source: "", matched: false, batchMalfunction: 0, discount: 0, projectile: "", material: "", shotMm: 0, shotCount: 0, projectileUpgrades: [], poisonCost: 0, ...patch });

function m79(loads: any[]): any {
  const actor = { name: "Shooter", id: "a0", items: Object.assign([], { get: () => undefined }), getActiveTokens: () => [] };
  const item: any = {
    id: "g1", name: "Colt M79, 40x46mmSR", type: "equipment", isOwner: true, actor, flags: {},
    system: { tl: "7", cost: 500, quality: "good", weaponClass: "firearm", meleeModes: [], rangedModes: [{ skill: "Guns (Grenade Launcher)", damageFormula: "4d-1", explosive: true, accuracy: 1, malfunction: 17, rateOfFire: 1, shots: "1(3)", loaded: 1, loadedFrom: "", minSt: 8, ammunition: "", projectiles: 1 }], extensions: { [MODULE_ID]: { htLoads: loads, firearm: {} } } },
  };
  item.update = async (changes: Record<string, unknown>) => { for (const [path, value] of Object.entries(changes)) setPath(item, path, value); };
  return item;
}

/** A character whose flags can be written, masked or not. */
function person(name: string, masked = false): any {
  const actor: any = { id: name, name, isOwner: true, masked, derived: {}, flags: {} };
  actor.setFlag = async (_scope: string, key: string, value: unknown) => { actor.flags[key] = value; };
  actor.getFlag = (_scope: string, key: string) => actor.flags[key];
  return actor;
}

/** A token of `actor` that moved from `from` (its top-left corner) to where it now stands. */
const moved = (actor: any, from: { x: number; y: number }) => {
  const token = { id: `t-${actor.name}`, actor, parent: { id: "s1", grid: { size: 100 } }, width: 1, height: 1, getCenterPoint: (o: any) => ({ x: o.x + 50, y: o.y + 50 }) };
  return { token, movement: { origin: { x: from.x, y: from.y } } };
};

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  on = { cargoProjectiles: true };
  areas = [];
  inArea = [];
  doses = [];
  advanced = [];
  chat = [];
  conditions = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { user: { id: "u1", isGM: true, targets: new Set() }, time: { worldTime: 1000 }, i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s, randomID: () => "r1" }, applications: { api: { DialogV2: { prompt: async () => ({ radius: 8, seconds: 60 }) } } } });
  vi.stubGlobal("canvas", { scene: { id: "s1", grid: { size: 100, distance: 1 } }, templates: { placeables: [{ document: { author: { id: "u1" }, x: 500, y: 500 } }] } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0.5 } });
  readyAmmunition(fakeApi() as never, switches);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a cloud after it is released (p. 171)", () => {
  it("doses those in a smoke round's cloud with smoke's irritant, after its 10 seconds", async () => {
    inArea = [{ actor: person("Sentry") }];
    const smoke = m79([load({ projectile: "smoke", radius: 8, seconds: 60 })]);
    fire(HOOKS.afterShots, { actor: smoke.actor, item: smoke, modeIndex: 0 });
    await flush();
    expect(doses).toEqual([expect.objectContaining({ actor: "Sentry", source: `${MODULE_ID}.smokeIrritant@60`, delaySeconds: 10, resistanceModifier: 0 })]);
    // The system counts the delay: nothing is rolled now.
    expect(advanced).toEqual([]);
    expect(chat.join(" ")).toContain("PoisonDelayed");
    // A gas mask keeps it out.
    doses = [];
    inArea = [{ actor: person("Masked", true) }];
    fire(HOOKS.afterShots, { actor: smoke.actor, item: smoke, modeIndex: 0 });
    await flush();
    expect(doses).toEqual([]);
  });

  it("rolls tear gas for somebody who walks into the cloud later, for the seconds it has left", async () => {
    areas = [{ id: `${MODULE_ID}-ht-cloud-tearGasVomiting-abc`, label: "Tear gas", center: { x: 500, y: 500 }, radius: 800, expires: 1040, lines: [] }];
    const runner = person("Runner");
    const { token, movement } = moved(runner, { x: 1500, y: 450 });
    inArea = [token];
    for (const listener of hooks.get("moveToken") ?? []) listener(token, movement);
    await flush();
    expect(doses.map((d) => d.source)).toEqual([
      `${MODULE_ID}.tearGasCoughing@40`, `${MODULE_ID}.tearGasBlinding@40`, `${MODULE_ID}.vomitingAgent@40`,
    ]);
    expect(chat.join(" ")).toContain("WalkedIn");
  });

  it("doesn't roll again for a step inside the cloud, one that stays outside it, or a cloud gone", async () => {
    areas = [{ id: `${MODULE_ID}-ht-cloud-smoke-abc`, label: "Smoke", center: { x: 500, y: 500 }, radius: 800, expires: 1040, lines: [] }];
    const walker = person("Walker");
    const inside = moved(walker, { x: 450, y: 450 });
    inArea = [inside.token];
    for (const listener of hooks.get("moveToken") ?? []) listener(inside.token, inside.movement);
    await flush();
    expect(doses).toEqual([]);
    const outside = moved(walker, { x: 2000, y: 450 });
    inArea = [];
    for (const listener of hooks.get("moveToken") ?? []) listener(outside.token, outside.movement);
    await flush();
    expect(doses).toEqual([]);
    areas[0].expires = 900;
    inArea = [outside.token];
    for (const listener of hooks.get("moveToken") ?? []) listener(outside.token, outside.movement);
    await flush();
    expect(doses).toEqual([]);
  });

  it("makes a retching victim take off the gas mask, which then keeps out nothing until the retching stops", async () => {
    const victim = person("Rioter", true);
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.vomitingAgent@20`, resisted: false, margin: 1 });
    // 20 seconds in the cloud and five minutes for the margin.
    expect(victim.flags.htMaskOff).toBe(1000 + 20 + 300);
    expect(chat.join(" ")).toContain("MaskOff");
    areas = [{ id: `${MODULE_ID}-ht-cloud-tearGas-abc`, label: "Tear gas", center: { x: 500, y: 500 }, radius: 800, expires: 1040, lines: [] }];
    const { token, movement } = moved(victim, { x: 1500, y: 450 });
    inArea = [token];
    for (const listener of hooks.get("moveToken") ?? []) listener(token, movement);
    await flush();
    expect(doses.map((d) => d.source)).toEqual([`${MODULE_ID}.tearGasCoughing@40`, `${MODULE_ID}.tearGasBlinding@40`]);
  });
});

describe("a paint round (p. 172)", () => {
  it("blinds whoever wears goggles when it hits the eyes, or a visor when it hits the eyes or face", () => {
    const paint = m79([load({ projectile: "liquid", liquid: "paint" })]);
    const hit = (items: any[], hitLocation: string) => {
      const victim = { ...person("Player"), items };
      fire(HOOKS.afterDamage, { actor: victim, item: paint, mode: { index: 0, ranged: true }, damage: { hitLocation }, result: {} });
    };
    const goggles = { name: "Goggles", system: { equipped: true } };
    const visor = { name: "Riot Helmet Visor", system: { equipped: true } };
    hit([goggles], "torso");
    hit([goggles], "face");
    hit([{ ...goggles, system: { equipped: false } }], "eye");
    expect(conditions).toEqual([]);
    hit([goggles], "eye");
    hit([visor], "face");
    expect(conditions.map((c) => c.key)).toEqual(["htPaintBlinded", "htPaintBlinded"]);
    expect(conditions[0].effects.modifiers[0]).toMatchObject({ value: -10, rolls: ["vision", "attack"] });
    expect(chat.join(" ")).toContain("PaintBlindedLine");
  });
});

describe("cargo from a box of rounds (pp. 171-172)", () => {
  it("fires the white phosphorus and tear gas a launcher was loaded with from a box", async () => {
    const sections: any[] = [];
    const api: any = { ...fakeApi(), sheets: { registerSheetSection: (s: any) => sections.push(s) } };
    hooks = new Map();
    readyAmmunition(api as never, switches);
    const box = (loads: any[]) => ({ id: "b1", name: "Grenades", type: "equipment", isOwner: true, system: { category: "ammunition", quantity: 6, tl: "7", ammunition: { kind: "", fits: "40x46mmSR" }, extensions: { [MODULE_ID]: { htLoads: loads } } } });
    const fromBox = (rounds: any) => {
      const launcher = m79([]);
      launcher.system.rangedModes[0].loadedFrom = "b1";
      launcher.actor.items = Object.assign([rounds], { get: (id: string) => (id === "b1" ? rounds : undefined) });
      return launcher;
    };
    const wp = box([load({ projectile: "whitePhosphorus", radius: 10 })]);
    // The box's sheet offers the bursting round.
    const context = sections[0].context(wp);
    expect(context.modes[0].projectiles.map((o: any) => o.value)).toContain("whitePhosphorus");
    const launcher = fromBox(wp);
    fire(HOOKS.afterShots, { actor: launcher.actor, item: launcher, modeIndex: 0 });
    await flush();
    expect(areas[0]).toMatchObject({ radius: 1000, expires: 1060 });
    expect(areas[0].id).toContain(`${MODULE_ID}-ht-cloud-whitePhosphorus-`);
    const gas = fromBox(box([load({ projectile: "tearGas", vomiting: true, radius: 8, seconds: 20 })]));
    fire(HOOKS.afterShots, { actor: gas.actor, item: gas, modeIndex: 0 });
    await flush();
    expect(areas[1].id).toContain(`${MODULE_ID}-ht-cloud-tearGasVomiting-`);
  });
});

describe("prism smoke (p. 171)", () => {
  it("stops a laser sight's dot across the cloud, and names its own cloud", async () => {
    const smoke = m79([load({ projectile: "smoke", smoke: "prism", radius: 2, seconds: 60 })]);
    smoke.system.tl = "8";
    fire(HOOKS.afterShots, { actor: smoke.actor, item: smoke, modeIndex: 0 });
    await flush();
    expect(areas[0].id).toContain(`${MODULE_ID}-ht-cloud-prismSmoke-`);
    const shooter = { getActiveTokens: () => [{ center: { x: 0, y: 500 } }] };
    const shot = (to: { x: number; y: number }) => fire(HOOKS.attackModifiers, {
      actor: shooter, targetTokens: [{ object: { center: to } }], laser: { on: true, targetSees: true, dodgeBonus: 1 },
      modifiers: [{ key: "laser", label: "Laser sight", value: 1 }],
    });
    const across = shot({ x: 1000, y: 500 });
    expect(across.modifiers).toEqual([]);
    expect(across.laser.dodgeBonus).toBe(0);
    // Off to one side, the dot shows.
    expect(shot({ x: 0, y: 1500 }).modifiers).toHaveLength(1);
  });
});
