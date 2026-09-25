/**
 * High-Tech's explosive and cargo rounds as the system meets them, with only
 * High-Tech's switches on (decision D1): the rows `gworld.weaponAttacks`
 * hands the sheet, the cloud a fired round leaves, the gas's rolls, a
 * thermobaric blast's falloff, and the darkness under a flare.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyAmmunition, type AmmunitionSwitches } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  damageModifiers: "gworld.damageModifiers",
  afterShots: "gworld.afterShots",
  landed: "gworld.landed",
  shotsEntry: "gworld.shotsEntry",
  poisonCycle: "gworld.poisonCycle",
  explosionFalloff: "gworld.explosionFalloff",
  afterDamage: "gworld.afterDamage",
  reactionModifiers: "gworld.reactionModifiers",
  detectionModifiers: "gworld.detectionModifiers",
  injury: "gworld.injury",
  turnEnd: "gworld.turnEnd",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let areas: any[];
let placed: any[];
let advanced: any[];
let inArea: any[];
let asked: any[];
let litFor: Map<string, (observer: any) => boolean>;
let doses: any[];
let conditions: any[];
let chat: string[];
let poisons: any[];
let items: Map<string, any>;
let attackOptions: Map<string, any>;
let pending: any[];
let dice: number[];

function fakeApi() {
  return {
    rules: { ...rules, weaponClassOf: () => "firearm" },
    registry: { isRuleOn: () => false },
    combat: { hooks: HOOKS, registerAttackOption: (o: any) => { attackOptions.set(o.key, o); return `${o.module}.${o.key}`; } },
    sheets: { registerSheetSection: () => undefined },
    data: { registerPriceModifier: () => undefined, registerPoison: (p: any) => poisons.push(p) },
    items: { setMalfunction: async () => undefined },
    areas: {
      add: async (scene: any, area: any, options?: any) => { areas.push(area); placed.push({ scene, source: options?.source }); return area.id; },
      list: () => areas,
      standsIn: (_scene: any, area: any) => { asked.push(area); return inArea; },
      registerLitFor: (r: any) => { litFor.set(`${r.module}.${r.key}`, r.test); return `${r.module}.${r.key}`; },
    },
    actors: {
      skillLevel: () => null,
      attribute: () => 10,
      derived: (actor: any) => actor.derived ?? {},
      dosePoison: async (actor: any, poison: any, options?: any) => { doses.push({ actor: actor.name, ...poison, by: options?.source?.name }); return { id: `d${doses.length}`, delaySeconds: poison.delaySeconds ?? 0 }; },
      advancePoison: async (actor: any, id: string, options?: any) => { advanced.push({ actor: actor.name, id, by: options?.source?.name }); },
      applyCondition: async (actor: any, application: any) => { conditions.push({ actor: actor.name, ...application }); return "c1"; },
      pendingModifiers: () => pending,
      addPendingModifier: async (_actor: any, bonus: any) => { pending.push({ id: `p${pending.length + 1}`, ...bonus }); return `p${pending.length}`; },
      removePendingModifier: async (_actor: any, id: string) => { pending = pending.filter((p) => p.id !== id); return true; },
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
  projectiles: () => on.projectileOptions === true,
  exotic: () => false,
  multiple: () => on.multipleProjectileLoads === true,
  projectileUpgrades: () => on.projectileUpgrades === true,
  explosive: () => on.explosiveProjectiles === true,
  cargo: () => on.cargoProjectiles === true,
  expansion: () => on.hollowPointExpansion === true,
  poisons: () => on.highTechPoisons === true,
};

const load = (patch: Record<string, unknown>) => ({ mode: 0, calibre: "", upgrades: [], source: "", matched: false, batchMalfunction: 0, discount: 0, projectile: "", material: "", shotMm: 0, shotCount: 0, projectileUpgrades: [], poisonCost: 0, ...patch });

/** A gun whose one mode is `mode`, with its loads. */
function gun(name: string, mode: Record<string, unknown>, loads: any[] = [], tl = "7"): any {
  const actor = { name: "Shooter", id: "a0", items: Object.assign([], { get: () => undefined }), getActiveTokens: () => [] };
  const item: any = {
    id: "g1", uuid: `Item.${name}`, name, type: "equipment", isOwner: true, actor, flags: {},
    system: { tl, cost: 500, quality: "good", weaponClass: "firearm", meleeModes: [], rangedModes: [{ accuracy: 1, malfunction: 17, rateOfFire: 1, shots: "1(3)", loaded: 1, loadedFrom: "", minSt: 8, ammunition: "", projectiles: 1, ...mode }], extensions: { [MODULE_ID]: { htLoads: loads, firearm: {} } } },
  };
  item.update = async (changes: Record<string, unknown>) => { for (const [path, value] of Object.entries(changes)) setPath(item, path, value); };
  items.set(item.uuid, item);
  return item;
}

const m79 = (loads: any[]) => gun("Colt M79, 40x46mmSR", { skill: "Guns (Grenade Launcher)", damageFormula: "4d-1", explosive: true, fragmentation: "2d" }, loads);
const hotchkiss = (loads: any[]) => gun("Hotchkiss 1-pdr, 37x94mmR", {
  skill: "Artillery (Cannon)", damageFormula: "5dx2", explosive: false,
  linked: { damage: "2d", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "2d", followUp: true, label: "Follow-up" },
}, loads, "6");

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** The row the sheet shows for the gun's first mode. */
function row(item: any): any {
  const mode = item.system.rangedModes[0];
  const figures = {
    damage: mode.damageFormula, damageType: mode.explosive ? "cr" : "pi++", armorDivisor: mode.explosive ? 1 : 0.5, halfDamageRange: 0, maxRange: 440, accuracy: 1, malfunction: 17, minSt: 8,
    projectiles: 1, recoil: 2, explosive: mode.explosive === true, fragmentation: mode.fragmentation ?? "", followUp: mode.linked ? { ...mode.linked } : null,
    firstHit: null, noOverpenetration: false, scatterSquared: false,
  };
  return fire(HOOKS.weaponAttacks, { actor: item.actor, item, rows: [{ kind: "ranged", mode, basis: { ...figures }, row: { ...figures, notes: [] } }] }).rows[0].row;
}
const labels = (r: any): string[] => r.notes.map((n: any) => n.label);

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  on = {};
  areas = [];
  placed = [];
  advanced = [];
  inArea = [];
  asked = [];
  litFor = new Map();
  doses = [];
  conditions = [];
  chat = [];
  poisons = [];
  items = new Map();
  attackOptions = new Map();
  pending = [];
  dice = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { user: { id: "u1", isGM: true, targets: new Set() }, time: { worldTime: 1000 }, i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s, randomID: () => "r1" }, applications: { api: { DialogV2: { prompt: async () => ({ radius: 8, seconds: 25 }) } } } });
  vi.stubGlobal("canvas", { scene: { id: "s1", grid: { size: 100, distance: 1 } }, templates: { placeables: [{ document: { author: { id: "u1" }, x: 500, y: 500 } }] } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  vi.stubGlobal("fromUuidSync", (uuid: string) => items.get(uuid) ?? null);
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => ((dice.shift() ?? 1) - 0.5) / 6 }, time: { roundTime: 1 } });
  vi.stubGlobal("Roll", class { total = 5; async evaluate() { return this; } });
  readyAmmunition(fakeApi() as never, switches);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("explosive rounds on the sheet (pp. 169-170, 175)", () => {
  it("fires the M79's HE round as its record prints it, incendiary, only with the switch on", () => {
    const he = m79([load({ projectile: "he" })]);
    expect(row(he).incendiary).not.toBe(true);
    on.explosiveProjectiles = true;
    const shown = row(he);
    expect(shown).toMatchObject({ damage: "4d-1", damageType: "cr", explosive: true, fragmentation: "2d", incendiary: true });
    expect(labels(shown)).toContain("GCC.HT.Ammunition.Projectile.he");
  });

  it("does only an airburst HE round's fragments", () => {
    on.explosiveProjectiles = true;
    on.projectileUpgrades = true;
    const shown = row(m79([load({ projectile: "he", projectileUpgrades: ["airburst"] })]));
    expect(shown).toMatchObject({ damage: "2d", damageType: "cut", explosive: false, fragmentation: "", scatterSquared: true });
    expect(labels(shown)).toContain('GCC.HT.Ammunition.Note.airburstFragments {}');
  });

  it("opens an airburst round's cone of fragments from where it came down, along the line of fire (p. 175; API 1.154.0)", async () => {
    on.explosiveProjectiles = true;
    on.projectileUpgrades = true;
    const ab = m79([load({ projectile: "he", projectileUpgrades: ["airburst"] })]);
    ab.actor.isOwner = true;
    ab.actor.getActiveTokens = () => [{ center: { x: 100, y: 500 } }];
    inArea = [{ name: "Goon" }, { name: "Other goon" }];
    // A hit on the one target at (500, 500): the cone opens east from there, 2d of fragments reaching 10 yards.
    fire(HOOKS.landed, { actor: ab.actor, item: ab, mode: { index: 0, ranged: true }, thrown: false, hit: true, target: {}, point: { x: 500, y: 500 }, scatter: null });
    await flush();
    expect(asked[0].cone).toMatchObject({ direction: 0, length: 1000, width: 1000, base: 100, origin: { x: 500, y: 500 } });
    expect(asked[0].center).toEqual({ x: 500, y: 500 });
    expect(chat.at(-1)).toContain('AirburstCone {"fragments":"2d","reach":10}');
    expect(chat.at(-1)).toContain("Goon, Other goon");
    // A miss waits for its Scatter roll; a plain HE round has no cone.
    fire(HOOKS.landed, { actor: ab.actor, item: ab, mode: { index: 0, ranged: true }, thrown: false, hit: false, target: {}, point: null, scatter: null });
    const he = m79([load({ projectile: "he" })]);
    he.actor.isOwner = true;
    fire(HOOKS.landed, { actor: he.actor, item: he, mode: { index: 0, ranged: true }, thrown: false, hit: true, target: {}, point: { x: 500, y: 500 }, scatter: null });
    await flush();
    expect(asked).toHaveLength(1);
    expect(chat).toHaveLength(1);
  });

  it("has an early SAPLE shell's blast follow the hit and burst inside, and rolls for a dud as it is fired", async () => {
    on.explosiveProjectiles = true;
    const cannon = hotchkiss([load({ projectile: "saple" })]);
    const shown = row(cannon);
    expect(shown).toMatchObject({ damage: "5dx2", armorDivisor: 1 });
    expect(shown.followUp).toMatchObject({ followUp: true, blastPlacement: "internal", damage: "2d" });
    // 1d comes up 5, above TL6-2: the follow-up blast is left unrolled for this attack.
    dice = [5];
    const attack = fire(HOOKS.attackModifiers, { actor: cannon.actor, item: cannon, ranged: true, rollType: "attack", mode: { index: 0, ranged: true }, modifiers: [], refusal: null, dropLines: { followUp: false, linked: false } });
    expect(attack.dropLines).toEqual({ followUp: true, linked: false });
    fire(HOOKS.afterShots, { actor: cannon.actor, item: cannon, modeIndex: 0, kind: "single" });
    await flush();
    expect(chat.join(" ")).toContain('GCC.HT.Ammunition.SapleDud {"roll":5,"need":4}');
  });

  it("keeps an early SAPLE shell's follow-up when 1d comes up TL-2 or less", async () => {
    on.explosiveProjectiles = true;
    const cannon = hotchkiss([load({ projectile: "saple" })]);
    dice = [4];
    const attack = fire(HOOKS.attackModifiers, { actor: cannon.actor, item: cannon, ranged: true, rollType: "attack", mode: { index: 0, ranged: true }, modifiers: [], refusal: null, dropLines: { followUp: false, linked: false } });
    expect(attack.dropLines.followUp).toBe(false);
    fire(HOOKS.afterShots, { actor: cannon.actor, item: cannon, modeIndex: 0, kind: "single" });
    await flush();
    expect(chat.join(" ")).toContain("GCC.HT.Ammunition.SapleBursts");
  });

  it("leaves rounds a module spent alone: no SAPLE card, no cloud", async () => {
    on.explosiveProjectiles = true;
    on.cargoProjectiles = true;
    const cannon = hotchkiss([load({ projectile: "saple" })]);
    dice = [5];
    fire(HOOKS.attackModifiers, { actor: cannon.actor, item: cannon, ranged: true, rollType: "attack", mode: { index: 0, ranged: true }, modifiers: [], refusal: null, dropLines: { followUp: false, linked: false } });
    fire(HOOKS.afterShots, { actor: cannon.actor, item: cannon, modeIndex: 0, kind: "module", reason: "Fire mission" });
    const smoke = m79([load({ projectile: "smoke" })]);
    fire(HOOKS.afterShots, { actor: smoke.actor, item: smoke, modeIndex: 0, kind: "module", reason: "Fire mission" });
    await flush();
    expect(chat).toEqual([]);
    expect(areas).toEqual([]);
  });

  it("divides a thermobaric blast by twice the distance", () => {
    on.explosiveProjectiles = true;
    const rpo = gun("KBP RPO-A, 93mm", { skill: "Guns (LAW)", damageFormula: "6dx9", explosive: true }, [load({ projectile: "thermobaric" })], "8");
    const context = fire(HOOKS.explosionFalloff, { itemUuid: rpo.uuid, flag: { mode: { index: 0 } }, divisorPerYard: 3 });
    expect(context.divisorPerYard).toBe(2);
    on.explosiveProjectiles = false;
    expect(fire(HOOKS.explosionFalloff, { itemUuid: rpo.uuid, flag: { mode: { index: 0 } }, divisorPerYard: 3 }).divisorPerYard).toBe(3);
  });
});

describe("cargo rounds (pp. 143, 171-172)", () => {
  it("fires the M79's smoke round as 1d+1(0.5) cr dkb, with no blast", () => {
    on.cargoProjectiles = true;
    const shown = row(m79([load({ projectile: "smoke", hitDamage: "1d+1" })]));
    expect(shown).toMatchObject({ damage: "1d+1", damageType: "cr", armorDivisor: 0.5, doubleKnockback: true, explosive: false, fragmentation: "" });
  });

  it("leaves a smoke round's cloud where it lands: -10 to sight in and through it", async () => {
    on.cargoProjectiles = true;
    const smoke = m79([load({ projectile: "smoke", radius: 8, seconds: 25 })]);
    fire(HOOKS.afterShots, { actor: smoke.actor, item: smoke, modeIndex: 0 });
    await flush();
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ radius: 8, expires: 1025, center: { x: 500, y: 500 } });
    expect(areas[0].id).toContain(`${MODULE_ID}-ht-cloud-smoke-`);
    expect(areas[0].lines[0]).toMatchObject({ value: -10, rolls: ["vision", "attack"], applies: "both" });
    // Hot smoke also hides from infrared.
    areas = [];
    const hot = gun("Colt M79, 40x46mmSR", { skill: "Guns (Grenade Launcher)", damageFormula: "4d-1", explosive: true }, [load({ projectile: "smoke", smoke: "hot", radius: 8, seconds: 25 })], "8");
    fire(HOOKS.afterShots, { actor: hot.actor, item: hot, modeIndex: 0 });
    await flush();
    expect(areas[0].lines.map((l: any) => l.rolls)).toContainEqual(["infrared", "hyperspectral"]);
  });

  it("rolls tear gas's two HT-2 rolls for those standing in it, and makes a failure cough for the cloud's time and the margin's minutes", async () => {
    on.cargoProjectiles = true;
    const victim = { id: "v1", name: "Rioter", isOwner: true, derived: {} };
    const masked = { id: "v2", name: "Masked", isOwner: true, derived: { traitEffects: { filterLungs: true } } };
    inArea = [{ actor: victim }, { actor: masked }];
    const gas = m79([load({ projectile: "tearGas" })]);
    fire(HOOKS.afterShots, { actor: gas.actor, item: gas, modeIndex: 0 });
    await flush();
    // The dialog asked: 8 yards for 25 seconds.
    expect(areas[0]).toMatchObject({ radius: 8, lines: [{ value: -10 }] });
    // The cloud's 25 seconds ride in the dose's source, which the system hands to the cycle.
    expect(doses.map((d) => `${d.actor}:${d.source}`)).toEqual([
      `Rioter:${MODULE_ID}.tearGasCoughing@25`, `Rioter:${MODULE_ID}.tearGasBlinding@25`, `Masked:${MODULE_ID}.tearGasBlinding@25`,
    ]);
    expect(doses[0]).toMatchObject({ resistanceModifier: -2, delivery: ["respiratory"] });
    fire(HOOKS.poisonCycle, { actor: victim, source: doses[0].source, resisted: false, margin: 3 });
    fire(HOOKS.poisonCycle, { actor: victim, source: doses[1].source, resisted: false, margin: 1 });
    expect(conditions[0]).toMatchObject({ actor: "Rioter", key: "coughing", duration: { seconds: 25 + 180 } });
    expect(conditions[1]).toMatchObject({ key: "htTearGasBlinded", module: MODULE_ID, duration: { seconds: 85 } });
    expect(conditions[1].effects.modifiers[0]).toMatchObject({ value: -10 });
    // A resisted roll does nothing.
    fire(HOOKS.poisonCycle, { actor: victim, source: doses[0].source, resisted: true, margin: 0 });
    expect(conditions).toHaveLength(2);
    // A failure's margin handed over signed reads by its size (#539).
    fire(HOOKS.poisonCycle, { actor: victim, source: doses[0].source, resisted: false, margin: -3 });
    expect(conditions[2]).toMatchObject({ key: "coughing", duration: { seconds: 25 + 180 } });
  });

  it("doses a poison-gas round's Basic Set filler over its burst", async () => {
    on.cargoProjectiles = true;
    inArea = [{ actor: { id: "v1", name: "Soldier", isOwner: true } }];
    const shell = hotchkiss([load({ projectile: "poisonGas", poisonFiller: "Mustard Gas", radius: 5, seconds: 60 })]);
    expect(row(shell).followUp).toMatchObject({ followUp: true, damageType: "cr" });
    fire(HOOKS.afterShots, { actor: shell.actor, item: shell, modeIndex: 0 });
    await flush();
    expect(doses[0]).toMatchObject({ actor: "Soldier", name: "Mustard Gas", source: `${MODULE_ID}.poisonGas` });
  });

  it("places a round's cloud on the viewed scene by its id and doses those in it from the shooter, for a player (API 1.149.0, 1.150.0)", async () => {
    on.cargoProjectiles = true;
    inArea = [{ actor: { id: "v1", name: "Rioter", isOwner: false, derived: {} } }];
    const gas = m79([load({ projectile: "tearGas" })]);
    fire(HOOKS.afterShots, { actor: gas.actor, item: gas, modeIndex: 0 });
    await flush();
    expect(placed).toEqual([{ scene: "s1", source: gas.actor }]);
    expect(doses.map((d) => d.by)).toEqual(["Shooter", "Shooter"]);
    expect(advanced.map((a) => a.by)).toEqual(["Shooter", "Shooter"]);
    doses = [];
    inArea = [{ actor: { id: "v2", name: "Soldier", isOwner: false } }];
    const shell = hotchkiss([load({ projectile: "poisonGas", poisonFiller: "Mustard Gas", radius: 5, seconds: 60 })]);
    fire(HOOKS.afterShots, { actor: shell.actor, item: shell, modeIndex: 0 });
    await flush();
    expect(doses[0]).toMatchObject({ actor: "Soldier", by: "Shooter" });
  });

  it("times a cloud's effect by the seconds its dose carries, on whichever client the cycle runs (API 1.149.0)", () => {
    on.cargoProjectiles = true;
    // Nothing kept on this client, no map read: only the dose's source.
    const victim = { id: "v9", name: "Bystander", isOwner: true, derived: {} };
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.tearGasCoughing@40`, resisted: false, margin: 1 });
    expect(conditions[0]).toMatchObject({ actor: "Bystander", key: "coughing", duration: { seconds: 40 + 60 } });
    // A dose from the sheet's Poison button carries no cloud: the margin's minutes alone.
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.vomitingAgent`, resisted: false, margin: 1 });
    expect(conditions[1]).toMatchObject({ key: "retching", duration: { seconds: 300 } });
    // Another module's source, or an unknown gas, is left alone.
    fire(HOOKS.poisonCycle, { actor: victim, source: "other.tearGasCoughing@40", resisted: false, margin: 1 });
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.mustard@40`, resisted: false, margin: 1 });
    expect(conditions).toHaveLength(2);
  });

  it("bursts white phosphorus into burning fragments that linger, and leaves its minute of smoke", async () => {
    on.cargoProjectiles = true;
    const wp = gun("Watervliet M2, 60mm", { skill: "Artillery (Mortar)", damageFormula: "2d", explosive: true, fragmentation: "1d" }, [load({ projectile: "whitePhosphorus", radius: 15 })]);
    expect(row(wp)).toMatchObject({ damageType: "burn", fragmentation: "1d", fragmentationType: "burn", fragmentationDivisor: 0.2, fragmentationLingerEvery: 10, fragmentationLingerFor: 60, incendiary: true });
    fire(HOOKS.afterShots, { actor: wp.actor, item: wp, modeIndex: 0 });
    await flush();
    expect(areas[0]).toMatchObject({ radius: 15, expires: 1060 });
  });

  it("lifts the darkness penalty on a shot at somebody under a flare to -3", async () => {
    on.cargoProjectiles = true;
    const flare = m79([load({ projectile: "illumination", radius: 185, seconds: 40 })]);
    fire(HOOKS.afterShots, { actor: flare.actor, item: flare, modeIndex: 0 });
    await flush();
    expect(areas[0]).toMatchObject({ radius: 185, lines: [], light: { radius: 185, darknessCap: 3 } });
    expect(areas[0].light.litFor).toBeUndefined();
    expect(areas[0].id).toContain(`${MODULE_ID}-ht-illumination-parachute-`);
    const target = { id: "t1" };
    inArea = [target];
    const attack = fire(HOOKS.attackModifiers, { actor: { items: [] }, targetTokens: [target], modifiers: [{ key: "darkness", label: "Darkness", value: -7 }] });
    expect(attack.modifiers[0].value).toBe(-3);
    // Out of its light, the dark stays.
    inArea = [];
    expect(fire(HOOKS.attackModifiers, { actor: { items: [] }, targetTokens: [target], modifiers: [{ key: "darkness", label: "Darkness", value: -7 }] }).modifiers[0].value).toBe(-7);
  });

  it("lights an infrared flare's radius only for eyes that see infrared, and a signal flare's to -5", async () => {
    on.cargoProjectiles = true;
    const ir = m79([load({ projectile: "illumination", illumination: "infrared", radius: 100, seconds: 30 })]);
    fire(HOOKS.afterShots, { actor: ir.actor, item: ir, modeIndex: 0 });
    await flush();
    expect(areas[0].light).toEqual({ radius: 100, darknessCap: 3, litFor: `${MODULE_ID}.ht-infrared` });
    const test = litFor.get(`${MODULE_ID}.ht-infrared`)!;
    expect(test({ items: [{ type: "trait", name: "Night Vision 5" }] })).toBe(true);
    expect(test({ items: [] })).toBe(false);
    const signal = m79([load({ projectile: "illumination", illumination: "signal", radius: 50, seconds: 30 })]);
    fire(HOOKS.afterShots, { actor: signal.actor, item: signal, modeIndex: 0 });
    await flush();
    expect(areas[1].light).toEqual({ radius: 50, darknessCap: 5 });
  });

  it("registers tear gas's, the vomiting agent's and smoke's rolls as poisons, offered while the switch is on", () => {
    expect(poisons.map((p) => p.key)).toEqual(["tearGasCoughing", "tearGasBlinding", "vomitingAgent", "smokeIrritant"]);
    expect(poisons[0].available()).toBe(false);
    on.cargoProjectiles = true;
    expect(poisons[0].available()).toBe(true);
  });
});

describe("the projectile options and upgrades in play (pp. 167, 174-175)", () => {
  const glock = (loads: any[]) => gun("Glock 17, 9x19mm", { skill: "Guns (Pistol)", damageFormula: "2d+2", damageType: "pi" }, loads);

  it("rolls a handgun hollow-point's expansion under its own switch, a failure hitting as the solid bullet", () => {
    on.projectileOptions = true;
    const hp = glock([load({ projectile: "hollowPoint" })]);
    const blow = () => fire(HOOKS.injury, { actor: { name: "Target" }, item: hp, mode: { index: 0, ranged: true }, damage: { type: "pi+", armorDivisor: 0.5 } }).damage;
    // Off, it always expands.
    expect(blow()).toMatchObject({ type: "pi+", armorDivisor: 0.5 });
    on.hollowPointExpansion = true;
    // TL7: it expands on 4 or less.
    dice = [4];
    expect(blow()).toMatchObject({ type: "pi+", armorDivisor: 0.5 });
    dice = [5];
    expect(blow()).toMatchObject({ type: "pi", armorDivisor: 1 });
  });

  it("doses a poison bullet's poison when the hit gets through DR", async () => {
    on.projectileOptions = true;
    const bullet = glock([load({ projectile: "poison", poisonFiller: "Cyanide" })]);
    const victim = { id: "v1", name: "Target", isOwner: true };
    fire(HOOKS.afterDamage, { actor: victim, item: bullet, mode: { index: 0, ranged: true }, result: { penetrating: 0 } });
    await flush();
    expect(doses).toHaveLength(0);
    fire(HOOKS.afterDamage, { actor: victim, item: bullet, mode: { index: 0, ranged: true }, result: { penetrating: 3, touchEffectsReach: true } });
    await flush();
    expect(doses[0]).toMatchObject({ actor: "Target", name: "Cyanide", source: `${MODULE_ID}.poisonBullet` });
    // High-Tech's own ricin, by its key: only while High-Tech's poisons are in play.
    const ricin = glock([load({ projectile: "poison", poisonFiller: "ht:ricin" })]);
    fire(HOOKS.afterDamage, { actor: victim, item: ricin, mode: { index: 0, ranged: true }, result: { penetrating: 3 } });
    await flush();
    expect(doses).toHaveLength(1);
    expect(chat.join(" ")).toContain("NoBulletPoison");
    on.highTechPoisons = true;
    fire(HOOKS.afterDamage, { actor: victim, item: ricin, mode: { index: 0, ranged: true }, result: { penetrating: 3 } });
    await flush();
    expect(doses[1]).toMatchObject({ source: `${MODULE_ID}.ricin`, dice: 3 });
  });

  it("offers an airburst round's fuse as an attack option: +4 at TL7, +3 or +1 on a TL6 time fuse", () => {
    on.explosiveProjectiles = true;
    on.projectileUpgrades = true;
    const option = attackOptions.get("ht-airburst");
    const he = m79([load({ projectile: "he", projectileUpgrades: ["airburst"] })]);
    const context = { item: he, ranged: true, mode: { index: 0, ranged: true } };
    expect(option.available(context)).toBe(true);
    expect(option.apply(context, "area").modifiers[0].value).toBe(4);
    expect(option.apply(context, "")).toBeNull();
    const old = gun("Colt M79, 40x46mmSR", { skill: "Guns (Grenade Launcher)", damageFormula: "4d-1", explosive: true }, [load({ projectile: "he", projectileUpgrades: ["airburst"] })], "6");
    expect(option.apply({ ...context, item: old }, "area").modifiers[0].value).toBe(3);
    expect(option.apply({ ...context, item: old }, "flier").modifiers[0].value).toBe(1);
    expect(option.available({ ...context, item: m79([load({ projectile: "he" })]) })).toBe(false);
  });

  it("refuses a self-destructing round's shot past its 1/2D", () => {
    on.explosiveProjectiles = true;
    on.projectileUpgrades = true;
    const sd = m79([load({ projectile: "he", projectileUpgrades: ["selfDestruct"] })]);
    const shot = (rangeYards: number) => fire(HOOKS.attackModifiers, { actor: sd.actor, item: sd, ranged: true, mode: { index: 0, ranged: true }, rangeYards, dataset: { halfDamageRange: "0", maxRange: "440" }, modifiers: [], refusal: null }).refusal;
    expect(shot(300)).toBeNull();
    expect(shot(500)).toContain("SelfDestructRefusal");
  });

  it("gives tracers +1 to the next attack after a burst of the gun's full RoF, not cumulative", async () => {
    on.projectileUpgrades = true;
    const mg = gun("M60, 7.62x51mm", { skill: "Guns (Light Machine Gun)", damageFormula: "7d", rateOfFire: 10 }, [load({ projectileUpgrades: ["tracer"] })]);
    mg.actor.isOwner = true;
    fire(HOOKS.afterShots, { actor: mg.actor, item: mg, modeIndex: 0, kind: "rapidFire", fired: 3 });
    await flush();
    expect(pending).toHaveLength(0);
    expect(chat.join(" ")).toContain("TracerSeen");
    fire(HOOKS.afterShots, { actor: mg.actor, item: mg, modeIndex: 0, kind: "rapidFire", fired: 10 });
    await flush();
    fire(HOOKS.afterShots, { actor: mg.actor, item: mg, modeIndex: 0, kind: "rapidFire", fired: 10 });
    await flush();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ value: 1, tags: ["attack"], skill: "Guns (Light Machine Gun)", expires: 1002 });
  });

  it("gives no tracer bonus and no card for rounds a module spent", async () => {
    on.projectileUpgrades = true;
    const mg = gun("M60, 7.62x51mm", { skill: "Guns (Light Machine Gun)", damageFormula: "7d", rateOfFire: 10 }, [load({ projectileUpgrades: ["tracer"] })]);
    mg.actor.isOwner = true;
    fire(HOOKS.afterShots, { actor: mg.actor, item: mg, modeIndex: 0, kind: "module", fired: 10, reason: "Fire mission" });
    await flush();
    expect(pending).toHaveLength(0);
    expect(chat).toEqual([]);
  });

  it("burns a tracer out at 1/2D: past it the blow isn't incendiary (p. 175)", () => {
    on.projectileUpgrades = true;
    const m16 = gun("M16A2, 5.56x45mm", { skill: "Guns (Rifle)", damageFormula: "5d" }, [load({ projectileUpgrades: ["tracer"] })]);
    fire(HOOKS.attackModifiers, { actor: m16.actor, item: m16, ranged: true, mode: { index: 0, ranged: true }, rangeYards: 600, dataset: { halfDamageRange: "500", maxRange: "3500" }, modifiers: [], refusal: null });
    const blow = (distanceYards: number | null, extra: Record<string, unknown> = {}) =>
      fire(HOOKS.damageModifiers, { actor: m16.actor, item: m16, mode: { index: 0, ranged: true }, formula: "5d", modifiers: [], distanceYards, incendiary: true, line: null, ...extra }).incendiary;
    expect(blow(499)).toBe(true);
    expect(blow(500)).toBe(false);
    expect(blow(null)).toBe(true);
    // A follow-up line is its own.
    expect(blow(600, { line: "followUp" })).toBe(true);
    // An incendiary tracer round burns all the way.
    const api = gun("M16A2 API-T", { skill: "Guns (Rifle)", damageFormula: "5d" }, [load({ projectileUpgrades: ["tracer", "incendiary"] })]);
    fire(HOOKS.attackModifiers, { actor: api.actor, item: api, ranged: true, mode: { index: 0, ranged: true }, dataset: { halfDamageRange: "500" }, modifiers: [], refusal: null });
    expect(fire(HOOKS.damageModifiers, { actor: api.actor, item: api, mode: { index: 0, ranged: true }, formula: "5d", modifiers: [], distanceYards: 900, incendiary: true, line: null }).incendiary).toBe(true);
  });

  it("takes an unused tracer bonus off at the end of the shooter's next turn, or with the combat", async () => {
    on.projectileUpgrades = true;
    const mg = gun("M60, 7.62x51mm", { skill: "Guns (Light Machine Gun)", damageFormula: "7d", rateOfFire: 10 }, [load({ projectileUpgrades: ["tracer"] })]);
    mg.actor.isOwner = true;
    const combat: any = { id: "c1", round: 1, turn: 0 };
    (game as any).combat = combat;
    fire(HOOKS.afterShots, { actor: mg.actor, item: mg, modeIndex: 0, kind: "rapidFire", fired: 10 });
    await flush();
    expect(pending).toHaveLength(1);
    // The turn it was fired in ends: the combat has moved to the next turn. It stays.
    combat.turn = 1;
    for (const listener of hooks.get(HOOKS.turnEnd) ?? []) listener(combat, { actor: mg.actor });
    await flush();
    expect(pending).toHaveLength(1);
    // The shooter's next turn ends unused: it goes.
    combat.round = 2;
    combat.turn = 1;
    for (const listener of hooks.get(HOOKS.turnEnd) ?? []) listener(combat, { actor: mg.actor });
    await flush();
    expect(pending).toHaveLength(0);
    // Or it goes with the combat.
    combat.round = 3;
    combat.turn = 0;
    fire(HOOKS.afterShots, { actor: mg.actor, item: mg, modeIndex: 0, kind: "rapidFire", fired: 10 });
    await flush();
    expect(pending).toHaveLength(1);
    for (const listener of hooks.get("deleteCombat") ?? []) listener(combat);
    await flush();
    expect(pending).toHaveLength(0);
  });

  it("drops a beehive shell's 1/2D", () => {
    on.multipleProjectileLoads = true;
    const cannon = gun("M102, 105mm", { skill: "Artillery (Cannon)", damageFormula: "6dx5", explosive: true }, [load({ projectile: "beehive" })]);
    const mode = cannon.system.rangedModes[0];
    const figures = { damage: "6dx5", damageType: "cr", armorDivisor: 1, halfDamageRange: 500, maxRange: 12000, accuracy: 2, malfunction: 17, minSt: 8, projectiles: 1, recoil: 2, explosive: true, fragmentation: "", followUp: null, firstHit: null, noOverpenetration: false, scatterSquared: false };
    const shown = fire(HOOKS.weaponAttacks, { actor: cannon.actor, item: cannon, rows: [{ kind: "ranged", mode, basis: { ...figures }, row: { ...figures, notes: [] } }] }).rows[0].row;
    expect(shown.halfDamageRange).toBe(0);
  });
});
