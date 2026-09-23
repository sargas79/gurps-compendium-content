/**
 * The weapon families as the system meets them: an air gun's charge through
 * `gworld.weaponAttacks`, `gworld.attackModifiers` and `gworld.afterShots`; a
 * stunner's hold through `gworld.afflictionEffect`; an unsafe revolver's
 * Shots entry; pistol whipping as a derived mode; a mechanical machine gun's
 * penalties; and backblast from the shared engine -- with only High-Tech's
 * switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { BACKBLAST_TABLES } from "../../../shared/backblast/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { BACKBLASTS } from "../../ultra-tech/guns/rules.js";
import { airUsed, gunTakesSuppressor, readyWeaponFamilies } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterShots: "gworld.afterShots",
  afflictionEffect: "gworld.afflictionEffect",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  shotsEntry: "gworld.shotsEntry",
  clearMalfunction: "gworld.clearMalfunction",
};

let hooks: Map<string, Listener[]>;
let options: any[];
let derived: any[];
let damage: any[];
let successes: any[];
let conditions: any[];
let chat: string[];
let weaponState: Map<any, any>;
let on: Record<string, boolean>;

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: () => false },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (o: any) => options.push(o),
      registerDerivedAttackMode: (m: any) => derived.push(m),
      getWeaponState: (item: any) => weaponState.get(item),
      setWeaponState: async (item: any, _m: string, patch: any) => { weaponState.set(item, { ...weaponState.get(item), ...patch }); },
    },
    sheets: { registerSheetSection: () => undefined },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      conditions: () => conditions.map((c) => ({ id: c.module ? `${c.module}.${c.key}` : c.key })),
      removeCondition: async (_a: any, id: string) => { conditions = conditions.filter((c) => `${c.module}.${c.key}` !== id); },
      applyCondition: async (_a: any, c: any) => { conditions.push(c); },
    },
    roll: {
      damage: async (o: any) => { damage.push(o); return 0; },
      success: async (o: any) => { successes.push(o); return { success: false }; },
      equipmentUse: () => ({ lines: [{ key: "unfamiliar", label: "Unfamiliar", value: -2 }], tags: ["unfamiliar"], impossible: null }),
    },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

const shooter = { name: "Shooter", attributes: { HT: 10, DX: 12 }, getActiveTokens: () => [TOKENS.firer] };

function gun(patch: { name?: string; skill?: string; shots?: string; rof?: number; tl?: string; bulk?: number; firearm?: Record<string, unknown>; melee?: any[]; linked?: any; flags?: any } = {}): any {
  const item: any = {
    id: "g1",
    uuid: `Item.${patch.name ?? "gun"}`,
    name: patch.name ?? "Steyr-Girandoni M.1780, 11.75mm",
    type: "equipment",
    isOwner: true,
    actor: shooter,
    flags: { [MODULE_ID]: { book: "high-tech", ...patch.flags } },
    system: {
      tl: patch.tl ?? "5",
      meleeModes: patch.melee ?? [],
      rangedModes: [{ skill: patch.skill ?? "Guns (Rifle)", accuracy: 1, malfunction: 17, rateOfFire: patch.rof ?? 1, shots: patch.shots ?? "21+1(2i)", bulk: patch.bulk ?? -6, linked: patch.linked }],
      extensions: { [MODULE_ID]: { firearm: { ...patch.firearm } } },
    },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

const GIRANDONI = { airShots: 30, airBands: [{ from: 11, damage: "1d+2", halfDamageRange: 50, maxRange: 400 }, { from: 21, damage: "1d+1", halfDamageRange: 40, maxRange: 340 }] };

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

function row(item: any): any {
  const context = fire(HOOKS.weaponAttacks, { item, rows: [{ kind: "ranged", mode: item.system.rangedModes[0], basis: {}, row: { damage: "2d", halfDamageRange: 60, maxRange: 480, notes: [] } }] });
  return context.rows[0].row;
}

function attack(item: any, extra: Record<string, unknown> = {}): any {
  return fire(HOOKS.attackModifiers, { actor: shooter, item, mode: { index: 0, ranged: true }, modifiers: [], refusal: null, options: {}, ...extra });
}

const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

async function shoot(item: any, fired = 1): Promise<void> {
  fire(HOOKS.afterShots, { actor: shooter, item, modeIndex: 0, shots: fired, fired, extra: 0, wasted: 0, kind: "single" });
  await flush();
}

/** Tokens on a one-yard grid of 100 pixels: the firer at (10, 10) yards, aiming east. */
const at = (name: string, x: number, y: number) => ({ name, center: { x: x * 100, y: y * 100 } });
const TOKENS = {
  firer: at("Shooter", 10, 10),
  target: at("Tank", 40, 10),
  close: at("Loader", 9, 10),
  farther: at("Officer", 6, 11),
  aside: at("Bystander", 9, 12),
};

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyWeaponFamilies(fakeApi() as never, { airGuns: rule("airGunsAndStunners"), revolvers: rule("revolverHandling"), mechanical: rule("mechanicalMachineGuns"), backblast: rule("backblast") });
}

beforeEach(() => {
  hooks = new Map();
  options = [];
  derived = [];
  damage = [];
  successes = [];
  conditions = [];
  chat = [];
  weaponState = new Map();
  on = {};
  BACKBLAST_TABLES.clear();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { targets: new Set([TOKENS.target]) },
  });
  vi.stubGlobal("canvas", { dimensions: { size: 100, distance: 1 }, tokens: { placeables: Object.values(TOKENS) } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("air guns (High-Tech p. 88)", () => {
  it("does nothing with the switch off", async () => {
    ready();
    const girandoni = gun({ firearm: GIRANDONI });
    await shoot(girandoni, 15);
    expect(airUsed(girandoni)).toBe(0);
    expect(row(girandoni).damage).toBe("2d");
  });

  it("counts the charge down, weakens the Girandoni after ten and twenty shots, and refuses an empty one", async () => {
    on = { airGunsAndStunners: true };
    ready();
    const girandoni = gun({ firearm: GIRANDONI });
    expect(row(girandoni)).toMatchObject({ damage: "2d", halfDamageRange: 60, maxRange: 480 });
    await shoot(girandoni, 10);
    expect(row(girandoni)).toMatchObject({ damage: "1d+2", halfDamageRange: 50, maxRange: 400 });
    await shoot(girandoni, 10);
    expect(row(girandoni)).toMatchObject({ damage: "1d+1", halfDamageRange: 40, maxRange: 340 });
    expect(attack(girandoni).refusal).toBeNull();
    await shoot(girandoni, 10);
    expect(airUsed(girandoni)).toBe(30);
    expect(chat.some((c) => c.includes("AirSpent"))).toBe(true);
    expect(attack(girandoni).refusal).toBe("GCC.HT.Families.AirEmpty");
  });

  it("leaves a gun that isn't an air gun alone", async () => {
    on = { airGunsAndStunners: true };
    ready();
    const rifle = gun({ name: "Brown Bess" });
    await shoot(rifle, 5);
    expect(airUsed(rifle)).toBe(0);
    expect(attack(rifle).refusal).toBeNull();
  });
});

describe("ranged electric stunners (High-Tech p. 89)", () => {
  const taser = (firearm: Record<string, unknown> = {}) => gun({ name: "TASER M26", tl: "8", skill: "Guns (Pistol)", bulk: -2, shots: "2(3i)", linked: { damage: "HT-5", affliction: true, afflictionAttribute: "HT", afflictionModifier: -5, followUp: true }, firearm: { stunSeconds: 5, emd: true, ...firearm } });

  it("stuns the victim for the hold and (20 - HT) seconds, then recovery is at the shock's penalty", () => {
    on = { airGunsAndStunners: true };
    ready();
    const m26 = taser();
    const victim = { name: "Suspect", attributes: { HT: 12 } };
    attack(m26, { options: { [`${MODULE_ID}.ht-stunner-hold`]: 3 } });
    const context = fire(HOOKS.afflictionEffect, { actor: victim, attacker: shooter, item: m26, mode: { index: 0, ranged: true }, label: "", margin: 2, effects: [] });
    const keys = context.effects.map((e: any) => e.key);
    expect(keys).toEqual(["stunned", "prone", "ht-stunner-held", "ht-stunner-shock"]);
    expect(context.effects[2].duration).toEqual({ seconds: 3 + 8 });
    expect(context.effects[3].effects.modifiers[0]).toMatchObject({ value: -5, rolls: ["stunRecovery"] });
  });

  it("takes the gun's own hold when the shooter doesn't say, and lifts the penalty on recovery", async () => {
    on = { airGunsAndStunners: true };
    ready();
    const te76 = taser({ emd: false });
    attack(te76);
    const context = fire(HOOKS.afflictionEffect, { actor: { attributes: { HT: 10 } }, item: te76, mode: { index: 0 }, effects: [] });
    expect(context.effects.map((e: any) => e.key)).toEqual(["stunned", "ht-stunner-held", "ht-stunner-shock"]);
    expect(context.effects[1].duration).toEqual({ seconds: 5 + 10 });
    conditions = context.effects.filter((e: any) => e.module);
    fire(HOOKS.afterSuccessRoll, { actor: {}, tags: ["stunRecovery", "HT"], outcome: { success: true } });
    await flush();
    expect(conditions).toEqual([]);
  });

  it("offers the hold only on a stunner", () => {
    on = { airGunsAndStunners: true };
    ready();
    const hold = options.find((o) => o.key === "ht-stunner-hold");
    expect(hold.available({ item: taser() })).toBe(true);
    expect(hold.available({ item: gun() })).toBe(false);
  });
});

describe("revolvers and pistols (High-Tech pp. 90, 93, 159)", () => {
  const navy = (firearm: Record<string, unknown> = {}) => gun({ name: "Colt M1851 Navy, .36 Caplock", skill: "Guns (Pistol)", shots: "6(10i)", bulk: -2, firearm });
  const entry = (item: any) => fire(HOOKS.shotsEntry, { actor: shooter, item, modeIndex: 0, mode: item.system.rangedModes[0], entry: { ...rules.parseShots(item.system.rangedModes[0].shots) } }).entry;

  it("loads an unsafe revolver a round short, unless carried full or it has a safety", () => {
    on = { revolverHandling: true };
    ready();
    expect(entry(navy()).capacity).toBe(5);
    expect(entry(navy({ carriedFull: true })).capacity).toBe(6);
    expect(entry(navy({ safety: "safe" })).capacity).toBe(6);
    expect(entry({ ...navy(), system: { ...navy().system, tl: "6" } }).capacity).toBe(6);
  });

  it("pistol whips with Brawling or DX at thrust-1 plus |Bulk|, or brains with Axe/Mace", () => {
    on = { revolverHandling: true };
    ready();
    const whip = derived.find((m) => m.key === "ht-pistol-whip");
    const helpers = { attribute: (k: string) => (k === "DX" ? 12 : 10), skillLevel: (s: string) => (s === "Brawling" ? 13 : null), damage: (base: string, mod: number) => `${base}${mod >= 0 ? "+" : ""}${mod}` };
    expect(whip.applies(navy())).toBe(true);
    expect(whip.applies(gun())).toBe(false);
    expect(whip.mode(navy(), shooter, helpers)).toMatchObject({ skillName: "Brawling", skillLevel: 13, damage: "thr+1", damageType: "cr", reach: "C" });
    const seaService = gun({ name: "Tower Sea Service P/1796, .56 Flintlock", skill: "Guns (Pistol)", bulk: -3, firearm: { brainer: true } });
    expect(whip.mode(seaService, shooter, helpers)).toMatchObject({ skillName: "Axe/Mace", skillLevel: 7, damage: "sw+1" });
  });

  it("refuses suppressors on revolvers but a Nagant", () => {
    expect(gunTakesSuppressor(navy())).toBe(false);
    expect(gunTakesSuppressor(navy({ suppressible: true }))).toBe(true);
  });
});

describe("mechanical machine guns (High-Tech p. 127)", () => {
  const gatling = () => gun({ name: "Gatling M1874, .45-70", skill: "Gunner (Machine Gun)", rof: 15, shots: "40(5)", firearm: { mechanicalMg: true } });

  it("makes unfamiliarity -5, fixing a malfunction -1 more, and off the mount -8", () => {
    on = { mechanicalMachineGuns: true };
    ready();
    const context = attack(gatling(), { modifiers: [{ key: "unfamiliar", label: "Unfamiliar", value: -2 }] });
    expect(context.modifiers[0].value).toBe(-5);
    const clearing = fire(HOOKS.clearMalfunction, { actor: shooter, item: gatling(), modeIndex: 0, modifiers: [] });
    expect(clearing.modifiers).toEqual([{ label: "GCC.HT.Families.MechanicalClearing", value: -1 }]);
    const offMount = options.find((o) => o.key === "ht-off-mount");
    expect(offMount.available({ item: gatling() })).toBe(true);
    expect(offMount.apply({}, true).modifiers[0].value).toBe(-8);
  });

  it("leaves other machine guns alone", () => {
    on = { mechanicalMachineGuns: true };
    ready();
    const context = attack(gun({ skill: "Gunner (Machine Gun)" }), { modifiers: [{ key: "unfamiliar", label: "Unfamiliar", value: -2 }] });
    expect(context.modifiers[0].value).toBe(-2);
  });
});

describe("backblast (High-Tech p. 147)", () => {
  const m72 = (firearm: Record<string, unknown> = { backblast: "1d+2", backblastType: "burn" }) => gun({ name: "HEC M72A2, 66mm", tl: "7", skill: "Guns (Light Anti-Armor Weapon)", shots: "1", firearm });

  it("rolls nothing with High-Tech's switch off", async () => {
    ready();
    attack(m72());
    await shoot(m72());
    expect(damage).toEqual([]);
  });

  it("names who stands in the cone behind the firer, and rolls full and half damage", async () => {
    on = { backblast: true };
    ready();
    const law = m72();
    attack(law);
    await shoot(law);
    expect(chat[0]).toContain("CaughtFull");
    expect(chat[0]).toContain("Loader");
    expect(chat[0]).toContain("CaughtHalf");
    expect(chat[0]).toContain("Officer");
    expect(chat[0]).not.toContain("Bystander");
    expect(damage).toEqual([
      expect.objectContaining({ formula: "1d+2", damageType: "burn" }),
      expect.objectContaining({ formula: "1d+2", damageType: "burn", halfDamage: true }),
    ]);
  });

  it("indoors, throws a burning blast back at the firer and calls for HT-4 without hearing protection", async () => {
    on = { backblast: true };
    ready();
    const law = m72();
    attack(law, { options: { [`${MODULE_ID}.backblast-indoors`]: "enclosed" } });
    await shoot(law);
    expect(chat[0]).toContain("Reflected");
    expect(successes[0]).toMatchObject({ base: 10, modifiers: [{ value: -4 }] });
    expect(conditions).toEqual([{ key: "stunned" }]);
  });

  it("counts a countermass weapon's crushing blast safe indoors", async () => {
    on = { backblast: true };
    ready();
    const pzf3 = m72({ backblast: "2d", backblastType: "cr" });
    attack(pzf3, { options: { [`${MODULE_ID}.backblast-indoors`]: "protected" } });
    await shoot(pzf3);
    expect(chat[0]).not.toContain("Reflected");
    expect(successes).toEqual([]);
    expect(damage).toEqual([expect.objectContaining({ formula: "2d", damageType: "cr" })]);
  });

  it("keeps Ultra-Tech's figures unchanged in the shared engine", () => {
    expect(BACKBLASTS.iml).toEqual({ damage: "2d", kind: "burn", fullYards: 2, halfYards: 2 });
    expect(BACKBLASTS.tml).toEqual({ damage: "4d", kind: "burn", fullYards: 3, halfYards: 3 });
  });

  it("rolls a book's backblast without the cone where its table has none, and each item takes its own book's table", async () => {
    on = { backblast: true };
    ready();
    let ultraTech = false;
    BACKBLAST_TABLES.register({ book: "ultra-tech", tls: { min: 9, max: 12 }, on: () => ultraTech, of: () => BACKBLASTS.iml, label: () => "Backblast (2 yards behind)", cone: false });
    const iml = gun({ name: "IML", tl: "10", flags: { book: "ultra-tech" } });
    // Ultra-Tech's launcher needs Ultra-Tech's switch, not High-Tech's.
    attack(iml);
    await shoot(iml);
    expect(damage).toEqual([]);
    ultraTech = true;
    attack(iml);
    await shoot(iml);
    expect(damage).toEqual([expect.objectContaining({ label: "Backblast (2 yards behind)", formula: "2d", damageType: "burn" })]);
    expect(chat).toEqual([]);
  });
});
