/**
 * High-Tech's grenades, mines, rifle grenades and nuclear weapons at the
 * table (pp. 189-196): priming, arming and cooking off a grenade; a bounding
 * mine's fragments missing a man flat on the ground; a Claymore's pellets
 * resolved by distance; a rifle grenade inside its minimum range; a nuclear
 * blast's falloff, flash, EMP and fallout -- each under its own High-Tech
 * switch, with no other book's.
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyExplosives } from "../explosives/index.js";
import { ordnanceExtras, readyOrdnance } from "./index.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  attackModifiers: "gworld.attackModifiers",
  damageModifiers: "gworld.damageModifiers",
  afterDamage: "gworld.afterDamage",
  afterShots: "gworld.afterShots",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  successRollModifiers: "gworld.successRollModifiers",
  afflictionEffect: "gworld.afflictionEffect",
  weaponAttacks: "gworld.weaponAttacks",
  injury: "gworld.injury",
  turnStart: "gworld.turnStart",
  explosionFalloff: "gworld.explosionFalloff",
  clearMalfunction: "gworld.clearMalfunction",
};

const records = (file: string): any[] => JSON.parse(readFileSync(new URL(`../../../../books/high-tech/packs-src/equipment/${file}`, import.meta.url), "utf8"));
const ALL = [...records("high-tech-gear.json"), ...records("high-tech-by-hand.json")];

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let chat: string[];
let dice: number[];
let options: any[];
let actions: Map<string, any>;
let cards: Map<string, any>;
let derivedModes: any[];
let posted: any[];
let damage: any[];
let successes: any[];
let outcomes: any[];
let conditions: Map<string, any[]>;
let weaponState: Map<any, any>;
let dialog: Record<string, string> | null;
let targets: any[];
let irradiated: any[];
let malfunctions: Map<any, any>;
let postures: Array<[string, string]>;
let worldTime: number;
let combat: any;

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

function actorWith(name: string, items: any[] = [], more: Record<string, unknown> = {}): any {
  const flags: Record<string, unknown> = {};
  const actor: any = {
    id: name, name, uuid: `Actor.${name}`, isOwner: true, system: { posture: "standing" }, flags,
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    ...more,
  };
  actor.items = Object.assign(items, { get: (id: string) => items.find((i) => i.id === id) ?? null });
  for (const item of items) item.parent = actor;
  return actor;
}

/** A copy of a pack record, as an owned item. */
function item(name: string): any {
  const found = ALL.find((r) => r.name === name);
  if (!found) throw new Error(`no record ${name}`);
  const copy: any = JSON.parse(JSON.stringify(found));
  const flags: Record<string, unknown> = {};
  return Object.assign(copy, {
    id: name, uuid: `Item.${name}`, isOwner: true, flags,
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
  });
}

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (key: string) => key === "explosions" || on[key] === true },
    data: { registerExplosive: (r: any) => `${r.module}.${r.key}`, registerPoison: () => null },
    hazards: { detonate: async () => null, irradiate: async (o: any) => { irradiated.push(o); } },
    areas: { add: () => "area", list: () => [] },
    items: {
      objectStats: () => ({ ht: 10, dr: 0 }),
      malfunction: (i: any) => malfunctions.get(i) ?? null,
      setMalfunction: async (i: any, m: any) => { if (m) malfunctions.set(i, m); else malfunctions.delete(i); },
    },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (option: any) => { options.push(option); },
      registerDerivedAttackMode: (m: any) => { derivedModes.push(m); },
      setWeaponState: async (i: any, _module: string, patch: any) => { weaponState.set(i, { ...(weaponState.get(i) ?? {}), ...patch }); },
      getWeaponState: (i: any) => weaponState.get(i) ?? null,
    },
    sheets: { registerRowAction: (a: any) => actions.set(a.key, a), registerSheetSection: () => null },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, opts: any) => { posted.push({ key, data, options: opts }); },
      update: async (message: any, data: any) => { message.data = data; return true; },
    },
    actors: {
      derived: (actor: any) => actor?.derived ?? { drByLocation: { torso: 0 }, traitEffects: { protectedSense: {} } },
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      conditions: (actor: any) => conditions.get(actor.name) ?? [],
      applyCondition: async (actor: any, c: any) => {
        const id = c.module ? `${c.module}.${c.key}` : c.key;
        conditions.set(actor.name, [...(conditions.get(actor.name) ?? []), { id, ...c }]);
        return id;
      },
      removeCondition: async () => undefined,
      applyInjury: async () => null,
      setPosture: async (actor: any, posture: string) => { postures.push([actor.name, posture]); actor.system.posture = posture; },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return outcomes.shift() ?? { success: true, criticalFailure: false, margin: 0 }; },
      damage: async (o: any) => { damage.push(o); return 0; },
    },
  };
}

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  hooks = new Map();
  on = {};
  chat = [];
  dice = [];
  options = [];
  actions = new Map();
  cards = new Map();
  derivedModes = [];
  posted = [];
  damage = [];
  successes = [];
  outcomes = [];
  conditions = new Map();
  weaponState = new Map();
  dialog = null;
  targets = [];
  irradiated = [];
  malfunctions = new Map();
  postures = [];
  worldTime = 0;
  combat = null;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { id: "gm", isGM: true, get targets() { return new Set(targets); } },
    users: { activeGM: { isSelf: true } },
    time: { get worldTime() { return worldTime; } },
    get combat() { return combat; },
  });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => ((dice.shift() ?? 1) - 0.5) / 6 } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s, randomID: () => "x" }, applications: { api: { DialogV2: { prompt: async () => dialog } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("fromUuidSync", (uuid: string) => byUuid.get(uuid) ?? null);
  byUuid = new Map();
  api = fakeApi();
  const rule = (key: string) => () => on[key] === true;
  const ordnance = { grenades: rule("grenadeHandling"), mines: rule("landMines"), rifleGrenades: rule("rifleGrenades"), nuclear: rule("nuclearEffects") };
  readyExplosives(api as never, { sideEffects: rule("explosionSideEffects"), demolition: rule("demolitionCharges"), unstable: rule("unstableExplosives"), incendiaries: rule("incendiaryAgents") }, ordnanceExtras(ordnance));
  readyOrdnance(api as never, ordnance);
});

let byUuid: Map<string, any>;

afterEach(() => {
  vi.unstubAllGlobals();
});

const attack = (actor: any, weapon: any, more: Record<string, unknown> = {}) => {
  const context: any = { actor, item: weapon, mode: { index: 0, ranged: true }, modifiers: [], options: {}, refusal: null, ...more };
  fire(HOOKS.attackModifiers, context);
  return context;
};

describe("with every switch off", () => {
  it("offers nothing and refuses nothing", () => {
    const m67 = item("M67");
    const soldier = actorWith("Soldier", [m67]);
    for (const action of actions.values()) {
      for (const each of ["M67", "OZM-3", "AMC M17, 56mm", "Miniaturized Nuclear Warhead (0.1 kt)"]) expect(action.visible(item(each)), `${action.key} ${each}`).toBe(false);
    }
    expect(attack(soldier, m67).refusal).toBeNull();
    const falloff = { flag: { damageType: "burn" }, itemUuid: "Item.nuke", divisorPerYard: 3 };
    byUuid.set("Item.nuke", item("Miniaturized Nuclear Warhead (0.1 kt)"));
    fire(HOOKS.explosionFalloff, falloff);
    expect(falloff.divisorPerYard).toBe(3);
  });
});

describe("hand grenades (pp. 190-192)", () => {
  beforeEach(() => { on.grenadeHandling = true; });

  it("primes, arms and throws an M67, with time to throw it back", async () => {
    const m67 = item("M67");
    const soldier = actorWith("Soldier", [m67]);
    expect(actions.get("ht-grenade-prime").visible(m67)).toBe(true);
    expect(actions.get("ht-grenade-arm").visible(m67)).toBe(false);
    expect(attack(soldier, m67).refusal).toContain("NotPrimed");
    actions.get("ht-grenade-prime").run(m67, soldier);
    await flush();
    expect(chat.at(-1)).toContain('"seconds":10');
    expect(attack(soldier, m67).refusal).toContain("NotArmed");
    actions.get("ht-grenade-arm").run(m67, soldier);
    await flush();
    // A pin: the fuse waits for the handle.
    expect(weaponState.get(m67)).toMatchObject({ htArmed: true, htLit: null });
    expect(attack(soldier, m67).refusal).toBeNull();
    fire(HOOKS.afterSuccessRoll, { actor: soldier, tags: ["attack"], outcome: { success: true } });
    await flush();
    expect(chat.at(-1)).toContain('"least":4');
    expect(chat.at(-1)).toContain("GCC.HT.Ordnance.ThrowBack");
    expect(weaponState.get(m67).htArmed).toBe(false);
  });

  it("cooks one off: after two Waits nobody can throw it back", async () => {
    const m67 = item("M67");
    const soldier = actorWith("Soldier", [m67]);
    combat = { id: "c1", started: true, round: 1, combatants: [{ actor: soldier }] };
    await api.combat.setWeaponState(m67, MODULE_ID, { htPrimed: true, htArmed: true, htLit: null });
    expect(actions.get("ht-grenade-cook").visible(m67)).toBe(true);
    actions.get("ht-grenade-cook").run(m67, soldier);
    await flush();
    combat.round = 4;
    attack(soldier, m67);
    fire(HOOKS.afterSuccessRoll, { actor: soldier, tags: ["attack"], outcome: { success: true } });
    await flush();
    expect(chat.at(-1)).toContain('"burned":3');
    expect(chat.at(-1)).toContain("GCC.HT.Ordnance.NoThrowBack");
  });

  it("drops a cooked grenade on a critical failure, with no time to pick it up", async () => {
    const m67 = item("M67");
    const soldier = actorWith("Soldier", [m67]);
    combat = { id: "c1", started: true, round: 4, combatants: [{ actor: soldier }] };
    await api.combat.setWeaponState(m67, MODULE_ID, { htPrimed: true, htArmed: true, htLit: { combat: "c1", round: 1, time: 0 } });
    attack(soldier, m67);
    fire(HOOKS.afterSuccessRoll, { actor: soldier, tags: ["attack"], outcome: { success: false, criticalFailure: true } });
    await flush();
    expect(chat.at(-1)).toContain("GCC.HT.Ordnance.Dropped");
    expect(chat.at(-1)).toContain("GCC.HT.Ordnance.DroppedNoTime");
  });

  it("sets a stick grenade's fuse burning as the cord is pulled, and sets it off in the hand", async () => {
    const stick = item("Stielhandgranate");
    const soldier = actorWith("Soldier", [stick]);
    combat = { id: "c1", started: true, round: 1, combatants: [{ actor: soldier }] };
    await api.combat.setWeaponState(stick, MODULE_ID, { htPrimed: true });
    actions.get("ht-grenade-arm").run(stick, soldier);
    await flush();
    expect(chat.at(-1)).toContain('"readies":2');
    expect(weaponState.get(stick).htLit).toMatchObject({ combat: "c1", round: 1 });
    combat.round = 5;
    await Promise.all(fire(HOOKS.turnStart, combat, { actor: soldier }));
    expect(damage[0]).toMatchObject({ item: stick, formula: "5d", explosive: true, blastPlacement: "contact" });
  });

  it("puts a -5 on the RPG-43 without its throw", async () => {
    const rpg = item("RPG-43");
    const soldier = actorWith("Soldier", [rpg]);
    await api.combat.setWeaponState(rpg, MODULE_ID, { htPrimed: true, htArmed: true });
    expect(attack(soldier, rpg).modifiers).toEqual([{ label: "GCC.HT.Ordnance.Rpg43Unfamiliar", value: -5 }]);
    expect(attack(soldier, rpg, { options: { [`${MODULE_ID}.ht-rpg43-technique`]: true } }).modifiers).toEqual([]);
  });

  it("gives WP's fragments burning that goes on for a minute", () => {
    const wp = item("M34 WP");
    const context = { item: wp, rows: [{ kind: "ranged", mode: wp.system.rangedModes[0], row: { fragmentation: "1d" } }] };
    fire(HOOKS.weaponAttacks, context);
    expect(context.rows[0]!.row).toMatchObject({ fragmentationType: "burn", fragmentationLingerEvery: 10, fragmentationLingerFor: 60 });
  });

  it("resists a flashbang at +5 for each protected sense, and recovers from its stun at HT-5", () => {
    const stun = item("Schermuly Stun");
    const earmuffs = { name: "Electronic Earmuffs", system: { equipped: true } };
    const operator = actorWith("Operator", [earmuffs], { derived: { traitEffects: { protectedSense: { vision: true } } } });
    // The system's DR line goes: a flash and a bang are sense-based (Characters p. 35).
    const resist = { actor: operator, tags: ["resist", "affliction"], attack: { item: stun }, modifiers: [{ key: "afflictionDr", label: "DR", value: 4 }] as any[] };
    fire(HOOKS.successRollModifiers, resist);
    expect(resist.modifiers.map((m) => m.value)).toEqual([5, 5]);
    const effect = { actor: operator, item: stun, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, effect);
    expect(effect.effects).toEqual([{ key: "stunned" }]);
    const recovery = { actor: operator, tags: ["stunRecovery", "HT"], modifiers: [] as any[] };
    fire(HOOKS.successRollModifiers, recovery);
    expect(recovery.modifiers).toEqual([{ label: "GCC.HT.Ordnance.FlashbangRecovery", value: -5 }]);
  });

  it("burns the AN-M14 as thermite for 40 seconds, without the incendiaries' switch", async () => {
    const thermite = item("AN-M14");
    const victim = actorWith("Victim");
    targets = [{ actor: victim }];
    expect(actions.get("ht-thermite").visible(thermite)).toBe(true);
    dialog = { on: "actor", location: "torso" };
    actions.get("ht-thermite").run(thermite, actorWith("Saboteur", [thermite]));
    await flush();
    expect(victim.flags.htThermite).toMatchObject({ seconds: 40 });
  });

  it("runs a Molotov's fire in an engine: broken down, then destroyed", async () => {
    const molotov = { id: "m", name: "Molotov Cocktail", type: "equipment", system: { rangedModes: [] } };
    targets = [{ actor: { name: "Truck", system: { vehicle: { ht: 10 } } } }];
    dialog = { ht: "10" };
    // 2d = 2: ten seconds, four checks; 11 and 12 fail.
    dice = [1, 1, 4, 4, 3, 5, 5, 1, 6, 5, 6, 6];
    actions.get("ht-molotov-engine").run(molotov, actorWith("Rioter", [molotov]));
    await flush();
    expect(chat.at(-1)).toContain('"seconds":10');
    expect(chat.at(-1)).toContain("GCC.HT.Ordnance.Engine.destroyed");
  });
});

describe("land mines (p. 189)", () => {
  beforeEach(() => { on.landMines = true; });

  it("rolls the best of the skills to place one, and sets the TMi35 off on a failed disarm", async () => {
    const mine = item("TMi35");
    const sapper = actorWith("Sapper", [mine], { skills: { Soldier: 12, "Explosives (Explosive Ordnance Disposal)": 12 } });
    dialog = { task: "place", antiLifting: "", tamper: "0" };
    actions.get("ht-mine-task").run(mine, sapper);
    await flush();
    expect(successes[0]).toMatchObject({ skill: "Soldier", base: 12 });
    dialog = { task: "disarm", antiLifting: "on", tamper: "-1" };
    outcomes = [{ success: false, criticalFailure: false, margin: -1 }];
    actions.get("ht-mine-task").run(mine, sapper);
    await flush();
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([-2, -1]);
    expect(damage[0]).toMatchObject({ item: mine, formula: "5dx8", explosive: true });
  });

  it("rolls a bounding mine's fragments on their own, and a man flat on the ground takes none", async () => {
    const mine = item("OZM-3");
    const placer = actorWith("Placer", [mine]);
    actions.get("ht-mine-set-off").run(mine, placer);
    await flush();
    expect(damage[0]).toMatchObject({ formula: "5d", explosive: true, fragmentation: "" });
    expect(damage[1]).toMatchObject({ formula: "4d", source: `${MODULE_ID}.bounding` });
    expect(posted[0].key).toBe(`${MODULE_ID}.ht-bounding-mine`);
    // The GM drops the targeted flat, then the fragments are applied.
    const prone = actorWith("Prone");
    const standing = actorWith("Standing");
    targets = [{ actor: prone }];
    const message: any = {};
    await cards.get("ht-bounding-mine").actions.drop.run({ message, data: posted[0].data });
    expect(postures).toEqual([["Prone", "lying"]]);
    const flat = { actor: prone, damage: { basicDamage: 9, source: `${MODULE_ID}.bounding` } };
    const upright = { actor: standing, damage: { basicDamage: 9, source: `${MODULE_ID}.bounding` } };
    fire(HOOKS.injury, flat);
    fire(HOOKS.injury, upright);
    expect(flat.damage.basicDamage).toBe(0);
    expect(upright.damage.basicDamage).toBe(9);
  });

  it("leaves a bounding mine's fragments off the system's row, and puts a Claymore's pellets at skill 9", () => {
    const ozm = item("OZM-3");
    const rows = [{ kind: "ranged", mode: ozm.system.rangedModes[0], row: { fragmentation: "4d", notes: [] } }];
    fire(HOOKS.weaponAttacks, { item: ozm, rows });
    expect(rows[0]!.row.fragmentation).toBe("");
    const claymore = item("M18A1 Claymore");
    const pellets = [{ kind: "ranged", mode: claymore.system.rangedModes[1], row: { skillLevel: 14, notes: [] } }];
    fire(HOOKS.weaponAttacks, { item: claymore, rows: pellets });
    expect(pellets[0]!.row.skillLevel).toBe(9);
  });

  it("fires a Claymore's pellets nearest first, and rolls a target's hits", async () => {
    const claymore = item("M18A1 Claymore");
    const placer = actorWith("Placer", [claymore]);
    byUuid.set(claymore.uuid, claymore);
    targets = [{ name: "Far", actor: actorWith("Far") }, { name: "Near", actor: actorWith("Near") }];
    dialog = { d0: "100", d1: "5" };
    // The blast's own roll takes no dice here; the volley's: 10 on the far, 8 on the near.
    dice = [3, 3, 4, 2, 3, 3];
    actions.get("ht-mine-set-off").run(claymore, placer);
    await flush();
    const card = posted.find((p) => p.key === `${MODULE_ID}.ht-directional-mine`);
    expect(card.data.rows.map((r: any) => r.name)).toEqual(["Near", "Far"]);
    expect(card.data.rows[0]).toMatchObject({ hits: 9 });
    expect(card.data.rows[1]).toMatchObject({ hits: 0, halfDamage: true });
    const before = damage.length;
    dialog = { hits: "3" };
    const message: any = {};
    await cards.get("ht-directional-mine").actions.damage({ message, data: card.data, actor: placer, button: { dataset: { index: "0" } } });
    expect(damage.slice(before)).toHaveLength(3);
    expect(damage.at(-1)).toMatchObject({ formula: "2d", damageType: "pi-", armorDivisor: 0.5, halfDamage: false });
    expect(message.data.rows[0].rolled).toBe(true);
  });
});

describe("rifle grenades (pp. 193-194)", () => {
  beforeEach(() => { on.rifleGrenades = true; });

  const rifle = () => ({ id: "garand", name: "M1 Garand", type: "equipment", system: { rangedModes: [{ skill: "Guns (Rifle)", bulk: -5 }] } });

  it("fires only from a rifle: fitting the launcher, the blank and the grenade take 10 seconds", async () => {
    const grenade = item("AMC M17, 56mm");
    const garand = rifle();
    const soldier = actorWith("Soldier", [grenade, garand]);
    expect(attack(soldier, grenade).refusal).toContain("NotReadied");
    dialog = { rifle: "garand", fitted: "" };
    actions.get("ht-rifle-grenade-ready").run(grenade, soldier);
    await flush();
    expect(chat.at(-1)).toContain('"seconds":10');
    expect(weaponState.get(garand)).toMatchObject({ htLauncher: "spigot" });
    expect(attack(soldier, grenade).refusal).toBeNull();
    // With the launcher on, the rifle can't fire normally.
    expect(attack(soldier, garand).refusal).toBe("GCC.HT.Ordnance.Rifle.LauncherFitted");
    // The grenade's Bulk goes on the rifle's.
    const rows = [{ kind: "ranged", row: { bulk: -1 } }];
    fire(HOOKS.weaponAttacks, { item: grenade, rows });
    expect(rows[0]!.row.bulk).toBe(-6);
    // Fired: gone.
    fire(HOOKS.afterShots, { item: grenade });
    await flush();
    expect(weaponState.get(grenade).htOnRifle).toBeNull();
    actions.get("ht-rifle-launcher-off").run(garand, soldier);
    await flush();
    expect(weaponState.get(garand).htLauncher).toBeNull();
  });

  it("is a dud inside the minimum range: 1d+1 crushing, no blast", async () => {
    const grenade = item("AMC M17, 56mm");
    const soldier = actorWith("Soldier", [grenade, rifle()]);
    await api.combat.setWeaponState(grenade, MODULE_ID, { htOnRifle: "garand" });
    const close = attack(soldier, grenade, { refusal: "Inside minimum range", rangeYards: 6, minRange: 10 });
    expect(close.refusal).toContain("GCC.HT.Ordnance.Rifle.InsideMinimum");
    const dud = derivedModes.find((m) => m.key === "ht-rifle-grenade-dud");
    expect(dud.applies(grenade)).toBe(true);
    const row = dud.mode(grenade, soldier, { rows: () => ({ ranged: [{ name: "x", mode: "attack", modeIndex: 0, damage: "4d+1", damageType: "cr", explosive: true, fragmentation: "2d", minRange: 10, bulk: -6 }] }) });
    // The dud spends the grenade's own round (API 1.101.0).
    expect(row).toMatchObject({ damage: "1d+1", damageType: "cr", explosive: false, fragmentation: "", minRange: 0, bulk: -6, spendsFrom: 0 });
    expect(row.mode).toBeUndefined();
    const fromDud = attack(soldier, grenade, { mode: { index: -1, ranged: true, derived: `${MODULE_ID}.ht-rifle-grenade-dud` } });
    expect(fromDud.refusal).toBeNull();
    // Its shot is spent through the system, which calls afterShots for the grenade.
    fire(HOOKS.afterShots, { actor: soldier, item: grenade, modeIndex: 0, derivedMode: `${MODULE_ID}.ht-rifle-grenade-dud` });
    await flush();
    expect(weaponState.get(grenade).htOnRifle).toBeNull();
  });
});

describe("nuclear weapons (pp. 195-196)", () => {
  beforeEach(() => { on.nuclearEffects = true; });

  it("divides the burning by twice the distance, and the crushing as usual", () => {
    byUuid.set("Item.nuke", item("Miniaturized Nuclear Warhead (0.1 kt)"));
    const burn = { flag: { damageType: "burn" }, itemUuid: "Item.nuke", divisorPerYard: 3 };
    const crush = { flag: { damageType: "cr" }, itemUuid: "Item.nuke", divisorPerYard: 3 };
    fire(HOOKS.explosionFalloff, burn);
    fire(HOOKS.explosionFalloff, crush);
    expect(burn.divisorPerYard).toBe(2);
    expect(crush.divisorPerYard).toBe(3);
  });

  it("always calls for the flash roll, side effects or no, and no concussion roll", async () => {
    const nuke = item("Miniaturized Nuclear Warhead (0.1 kt)");
    fire(HOOKS.afterDamage, { actor: actorWith("Witness"), item: nuke, damage: { type: "burn", basicDamage: 40, blastDistance: 300 }, result: { penetrating: 30 } });
    await flush();
    expect(posted[0]).toMatchObject({ key: `${MODULE_ID}.ht-blast-effects`, data: { concussion: null, flash: { modifier: -4 }, always: true } });
    const m67 = item("M67");
    fire(HOOKS.afterDamage, { actor: actorWith("Other"), item: m67, damage: { type: "cr", basicDamage: 20, blastDistance: 2 }, result: { penetrating: 10 } });
    await flush();
    expect(posted).toHaveLength(1);
  });

  it("knocks out the Electrical and the gear ticked, to be repaired at -10", async () => {
    const nuke = item("Miniaturized Nuclear Warhead (0.1 kt)");
    const radio = { id: "radio", name: "Radio", type: "equipment", isOwner: true, system: { carried: true, tl: "8" }, flags: {} as any, setFlag: async (_s: string, k: string, v: unknown) => { radio.flags[k] = v; }, unsetFlag: async (_s: string, k: string) => { delete radio.flags[k]; }, getFlag: (_s: string, k: string) => radio.flags[k] };
    const robot = actorWith("Robot", [{ id: "e", name: "Electrical", type: "trait" }, { id: "s", name: "Electronics Repair/TL8 (Communications)", type: "skill" }, radio], { skills: { "Electronics Repair (Communications)": 13 } });
    targets = [{ actor: robot }];
    dialog = { "g0-radio": "on" };
    // The robot's roll and the radio's: 15 and 15 against HT 10-8 = 2.
    dice = [5, 5, 5, 5, 5, 5];
    actions.get("ht-nuclear-emp").run(nuke, actorWith("Bomber", [nuke]));
    await flush();
    expect(chat.at(-1)).toContain('GCC.HT.Ordnance.Nuclear.EmpDown {"name":"Robot","roll":15,"target":2}');
    expect(conditions.get("Robot")?.[0]).toMatchObject({ key: "unconscious" });
    expect(radio.flags.htEmp).toEqual({ penalty: -10 });
    expect(actions.get("ht-emp-repair").visible(radio)).toBe(true);
    actions.get("ht-emp-repair").run(radio, robot);
    await flush();
    expect(successes[0]).toMatchObject({ skill: "Electronics Repair (Communications)", base: 13 });
    expect(successes[0].modifiers).toContainEqual({ label: "GCC.HT.Ordnance.Nuclear.RepairLine", value: -10 });
    expect(radio.flags.htEmp).toBeUndefined();
  });

  it("doses the targeted with the fallout for their hours in the footprint", async () => {
    const nuke = item("Miniaturized Nuclear Warhead (0.1 kt)");
    const walker = actorWith("Walker");
    targets = [{ actor: walker }];
    dialog = { kt: "0.1", after: "0", hours: "0.5", pf: "1" };
    actions.get("ht-nuclear-fallout").run(nuke, actorWith("Bomber", [nuke]));
    await flush();
    expect(irradiated).toEqual([{ actor: walker, rads: 50, protectionFactor: 1 }]);
    expect(chat.at(-1)).toContain('"length":800');
  });
});

describe("the fuel-air bomb (p. 194)", () => {
  it("falls off at twice the distance with the fuel-air rule on", () => {
    on.unstableExplosives = true;
    byUuid.set("Item.cbu", item("500-lb. CBU-55/B, 256mm"));
    const context = { flag: { damageType: "cr" }, itemUuid: "Item.cbu", divisorPerYard: 3 };
    fire(HOOKS.explosionFalloff, context);
    expect(context.divisorPerYard).toBe(2);
  });
});
