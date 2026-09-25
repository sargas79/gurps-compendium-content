/**
 * High-Tech's explosive and cargo rounds as the system meets them, with only
 * High-Tech's switches on (decision D1): the rows `gworld.weaponAttacks`
 * hands the sheet, the cloud a fired round leaves, the gas's rolls, a
 * thermobaric blast's falloff, and the darkness under a flare.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { receive } from "../../../shared/relay.js";
import { readyAmmunition, type AmmunitionSwitches } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterShots: "gworld.afterShots",
  shotsEntry: "gworld.shotsEntry",
  poisonCycle: "gworld.poisonCycle",
  explosionFalloff: "gworld.explosionFalloff",
  afterDamage: "gworld.afterDamage",
  reactionModifiers: "gworld.reactionModifiers",
  detectionModifiers: "gworld.detectionModifiers",
  injury: "gworld.injury",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let areas: any[];
let inArea: any[];
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
      add: async (_scene: any, area: any) => { areas.push(area); return area.id; },
      list: () => areas,
      standsIn: () => inArea,
    },
    actors: {
      skillLevel: () => null,
      attribute: () => 10,
      derived: (actor: any) => actor.derived ?? {},
      dosePoison: async (actor: any, poison: any) => { doses.push({ actor: actor.name, ...poison }); return { id: `d${doses.length}`, delaySeconds: poison.delaySeconds ?? 0 }; },
      advancePoison: async () => undefined,
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
  inArea = [];
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

  it("has an early SAPLE shell's blast follow the hit and burst inside, and rolls for a dud as it is fired", async () => {
    on.explosiveProjectiles = true;
    const cannon = hotchkiss([load({ projectile: "saple" })]);
    const shown = row(cannon);
    expect(shown).toMatchObject({ damage: "5dx2", armorDivisor: 1 });
    expect(shown.followUp).toMatchObject({ followUp: true, blastPlacement: "internal", damage: "2d" });
    fire(HOOKS.afterShots, { actor: cannon.actor, item: cannon, modeIndex: 0 });
    await flush();
    // 1d came up 5, above TL6-2.
    expect(chat.join(" ")).toContain("GCC.HT.Ammunition.SapleDud");
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
    expect(doses.map((d) => `${d.actor}:${d.source}`)).toEqual([
      `Rioter:${MODULE_ID}.tearGasCoughing`, `Rioter:${MODULE_ID}.tearGasBlinding`, `Masked:${MODULE_ID}.tearGasBlinding`,
    ]);
    expect(doses[0]).toMatchObject({ resistanceModifier: -2, delivery: ["respiratory"] });
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.tearGasCoughing`, resisted: false, margin: 3 });
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.tearGasBlinding`, resisted: false, margin: 1 });
    expect(conditions[0]).toMatchObject({ actor: "Rioter", key: "coughing", duration: { seconds: 25 + 180 } });
    expect(conditions[1]).toMatchObject({ key: "htTearGasBlinded", module: MODULE_ID, duration: { seconds: 85 } });
    expect(conditions[1].effects.modifiers[0]).toMatchObject({ value: -10 });
    // A resisted roll does nothing.
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.tearGasCoughing`, resisted: true, margin: 0 });
    expect(conditions).toHaveLength(2);
    // A failure's margin handed over signed reads by its size (#539).
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.tearGasCoughing`, resisted: false, margin: -3 });
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
    expect(areas[0]).toMatchObject({ radius: 185, lines: [] });
    expect(areas[0].id).toContain(`${MODULE_ID}-ht-illumination-parachute-`);
    const target = { id: "t1" };
    inArea = [target];
    const attack = fire(HOOKS.attackModifiers, { actor: { items: [] }, targetTokens: [target], modifiers: [{ key: "darkness", label: "Darkness", value: -7 }] });
    expect(attack.modifiers[0].value).toBe(-3);
    // Out of its light, the dark stays.
    inArea = [];
    expect(fire(HOOKS.attackModifiers, { actor: { items: [] }, targetTokens: [target], modifiers: [{ key: "darkness", label: "Darkness", value: -7 }] }).modifiers[0].value).toBe(-7);
  });

  it("registers tear gas's and the vomiting agent's rolls as poisons, offered while the switch is on", () => {
    expect(poisons.map((p) => p.key)).toEqual(["tearGasCoughing", "tearGasBlinding", "vomitingAgent"]);
    expect(poisons[0].available()).toBe(false);
    on.cargoProjectiles = true;
    expect(poisons[0].available()).toBe(true);
  });
});

describe("a player's round through the GM's client (the module's relay)", () => {
  it("has the GM's client place a player's cloud and dose those in it, at the point the player's client found", async () => {
    on.cargoProjectiles = true;
    const gm = { id: "gm", isGM: true };
    const player = { id: "u1", isGM: false };
    const sent: any[] = [];
    const usersSeenBy = (self: "gm" | "u1") => Object.assign([gm, player], { activeGM: { ...gm, isSelf: self === "gm" }, get: (id: string) => (id === "u1" ? player : id === "gm" ? gm : undefined) });
    (game as any).user = { ...player, targets: new Set() };
    (game as any).users = usersSeenBy("u1");
    (game as any).socket = { emit: (channel: string, message: any) => sent.push({ channel, message }) };
    inArea = [{ actor: { id: "v1", name: "Rioter", isOwner: false, derived: {} } }];
    const gas = m79([load({ projectile: "tearGas", radius: 4, seconds: 30 })]);
    gas.actor.uuid = "Actor.a0";
    gas.actor.testUserPermission = (user: any) => user.id === "u1";
    items.set("Actor.a0", gas.actor);
    fire(HOOKS.afterShots, { actor: gas.actor, item: gas, modeIndex: 0 });
    await flush();
    // The player's client asks; it writes nothing itself.
    expect(areas).toHaveLength(0);
    expect(sent[0]).toMatchObject({ channel: `module.${MODULE_ID}`, message: { key: "ht-cargo", payload: { radius: 4, seconds: 30, center: { x: 500, y: 500 } } } });
    // The GM's client takes the request up.
    (game as any).user = { ...gm, targets: new Set() };
    (game as any).users = usersSeenBy("gm");
    expect(await receive(sent[0].message, "u1")).toBe(true);
    await flush();
    expect(areas[0]).toMatchObject({ radius: 4, center: { x: 500, y: 500 } });
    expect(doses.map((d) => d.actor)).toEqual(["Rioter", "Rioter"]);
    // Nothing for a user who can't fire for that character.
    areas = [];
    await receive(sent[0].message, "someone-else");
    await flush();
    expect(areas).toHaveLength(0);
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
    // High-Tech's own ricin, by its key.
    const ricin = glock([load({ projectile: "poison", poisonFiller: "ht:ricin" })]);
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

  it("drops a beehive shell's 1/2D", () => {
    on.multipleProjectileLoads = true;
    const cannon = gun("M102, 105mm", { skill: "Artillery (Cannon)", damageFormula: "6dx5", explosive: true }, [load({ projectile: "beehive" })]);
    const mode = cannon.system.rangedModes[0];
    const figures = { damage: "6dx5", damageType: "cr", armorDivisor: 1, halfDamageRange: 500, maxRange: 12000, accuracy: 2, malfunction: 17, minSt: 8, projectiles: 1, recoil: 2, explosive: true, fragmentation: "", followUp: null, firstHit: null, noOverpenetration: false, scatterSquared: false };
    const shown = fire(HOOKS.weaponAttacks, { actor: cannon.actor, item: cannon, rows: [{ kind: "ranged", mode, basis: { ...figures }, row: { ...figures, notes: [] } }] }).rows[0].row;
    expect(shown.halfDamageRange).toBe(0);
  });
});
