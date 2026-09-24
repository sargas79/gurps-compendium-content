/**
 * The supplement Electricity and Electronics' fuzes and homing weapons at the
 * table (HT:EE pp. 48-49): fitting and setting fuzes, a proximity fuze going
 * off near a token, a time fuze running out, a clock made into one; homing
 * rows locking on at skill 10 plus Acc, the seeker's lines and tags, and a
 * laser-homing missile that needs a designator held on its target -- each
 * under its own High-Tech switch, with no other book's.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { carriedFuzes, fittedFuze, readyGuidance } from "./index.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  attackModifiers: "gworld.attackModifiers",
  homingAttack: "gworld.homingAttack",
  weaponAttacks: "gworld.weaponAttacks",
  turnStart: "gworld.turnStart",
};

const EQUIPMENT = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
const ALL: any[] = readdirSync(EQUIPMENT).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(EQUIPMENT, f), "utf8")));

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let chat: string[];
let options: any[];
let actions: Map<string, any>;
let damage: any[];
let successes: any[];
let outcomes: any[];
let weaponState: Map<any, any>;
let dialog: Record<string, string> | null;
let targets: any[];
let combat: any;
let placeables: any[];
let quantities: any[];

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

function actorWith(name: string, items: any[] = [], more: Record<string, unknown> = {}): any {
  const actor: any = { id: name, name, uuid: `Actor.${name}`, isOwner: true, system: { posture: "standing" }, ...more };
  actor.items = Object.assign(items, { get: (id: string) => items.find((i) => i.id === id) ?? null });
  for (const item of items) item.parent = actor;
  return actor;
}

/** A copy of a pack record, as an owned item. */
function item(name: string): any {
  const found = ALL.find((r) => r.name === name);
  if (!found) throw new Error(`no record ${name}`);
  return Object.assign(JSON.parse(JSON.stringify(found)), { id: name, uuid: `Item.${name}`, isOwner: true });
}

function fakeApi() {
  return {
    registry: { isRuleOn: (key: string) => on[key] === true },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (option: any) => { options.push(option); },
      setWeaponState: async (i: any, _module: string, patch: any) => { weaponState.set(i, { ...(weaponState.get(i) ?? {}), ...patch }); },
      getWeaponState: (i: any) => weaponState.get(i) ?? null,
    },
    sheets: { registerRowAction: (a: any) => actions.set(a.key, a) },
    items: { changeQuantity: async (i: any, delta: number, o: any) => { quantities.push({ item: i.name, delta, ...o }); i.system.quantity = Math.max(0, (Number(i.system.quantity) || 0) + delta); return {}; } },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    },
    roll: {
      success: async (o: any) => { successes.push(o); return outcomes.shift() ?? { success: true, margin: 0 }; },
      damage: async (o: any) => { damage.push(o); return 0; },
    },
  };
}

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  hooks = new Map();
  on = {};
  chat = [];
  options = [];
  actions = new Map();
  damage = [];
  successes = [];
  outcomes = [];
  weaponState = new Map();
  dialog = null;
  targets = [];
  combat = null;
  placeables = [];
  quantities = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => { hooks.set(name, [...(hooks.get(name) ?? []), fn]); return 1; } });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, d: unknown) => `${k} ${JSON.stringify(d)}` },
    user: { isGM: true, get targets() { return new Set(targets); } },
    users: { activeGM: { isSelf: true } },
    get combat() { return combat; },
    time: { worldTime: 0 },
  });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { prompt: async () => dialog } } },
  });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("ui", { notifications: { warn: (m: string) => chat.push(`warn ${m}`), info: () => {} } });
  vi.stubGlobal("canvas", { get tokens() { return { placeables }; }, scene: null });
  api = fakeApi();
  readyGuidance(api as any, { fuzes: () => on.electronicFuzes === true, seekers: () => on.homingSeekers === true });
});

afterEach(() => vi.unstubAllGlobals());

/** A token document on a scene with 1-yard squares of 100 pixels. */
function token(id: string, actor: any, x: number, scene: any): any {
  const t = { id, name: id, actor, x, y: 0, width: 1, height: 1, parent: scene, uuid: `Scene.s.Token.${id}` };
  scene.tokens.push(t);
  return t;
}

describe("electronicFuzes (HT:EE p. 48)", () => {
  it("offers its actions only with the switch on", () => {
    const grenade = item("M67");
    expect(actions.get("ee-fit-fuze").visible(grenade)).toBe(false);
    on.electronicFuzes = true;
    expect(actions.get("ee-fit-fuze").visible(grenade)).toBe(true);
    expect(actions.get("ee-fit-fuze").visible(item("TNT (per pound)"))).toBe(true);
    expect(actions.get("ee-fit-fuze").visible(item("Wristwatch"))).toBe(false);
    expect(actions.get("ee-improvise-fuze").visible(item("Electronic Clock"))).toBe(true);
  });

  it("fits a proximity fuze set within its 25 yards, and it goes off when a token comes that close", async () => {
    on.electronicFuzes = true;
    const grenade = item("M67");
    const fuze = item("Proximity Fuze (TL8)");
    const mine = actorWith("Mine", [grenade, fuze]);
    dialog = { fuze: "0", yards: "40", seconds: "10" };
    actions.get("ee-fit-fuze").run(grenade, mine);
    await flush();
    expect(fittedFuze(api as any, grenade)).toMatchObject({ kind: "proximity", setting: 25, fuze: "Proximity Fuze (TL8)" });
    // The fuze fitted comes off its stack (#549).
    expect(quantities).toEqual([{ item: "Proximity Fuze (TL8)", delta: -1, reason: "GCC.HT.Guidance.UsedUp" }]);

    const scene: any = { grid: { size: 100, distance: 1 }, tokens: [] };
    token("mine", mine, 0, scene);
    const walker = token("walker", actorWith("Walker"), 3000, scene);
    fire("updateToken", walker, { x: 3000 });
    await flush();
    expect(damage).toHaveLength(0);
    walker.x = 2000;
    fire("updateToken", walker, { x: 2000 });
    await flush();
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({ explosive: true, formula: expect.any(String) });
    expect(chat.some((c) => c.includes("ProximityTriggered"))).toBe(true);
    // Spent: it goes off once.
    expect(fittedFuze(api as any, grenade)).toBeNull();
  });

  it("runs a time fuze out in combat rounds, and a bare charge is left to the Detonate action", async () => {
    on.electronicFuzes = true;
    const tnt = item("TNT (per pound)");
    const actor = actorWith("Sapper", [tnt, item("Time Fuze (TL7)")]);
    combat = { id: "c", started: true, round: 1, combatants: [{ actor }] };
    dialog = { fuze: "0", yards: "25", seconds: "3" };
    actions.get("ee-fit-fuze").run(tnt, actor);
    await flush();
    expect(fittedFuze(api as any, tnt)).toMatchObject({ kind: "time", setting: 3 });
    combat.round = 3;
    await Promise.all(fire(HOOKS.turnStart, combat, combat.combatants[0]));
    expect(chat.some((c) => c.includes("TimeUp"))).toBe(false);
    combat.round = 4;
    await Promise.all(fire(HOOKS.turnStart, combat, combat.combatants[0]));
    expect(chat.some((c) => c.includes("TimeUp") && c.includes("SetOffCharge"))).toBe(true);
    expect(damage).toHaveLength(0);
  });

  it("uses a fuze up when fitted, gives it back when taken off unused, and offers none from an empty stack (#549)", async () => {
    on.electronicFuzes = true;
    const grenade = item("M67");
    const impact = Object.assign(item("Impact Fuze (TL7)"), {});
    impact.system.quantity = 1;
    const time = item("Time Fuze (TL8)");
    time.system.quantity = 2;
    const actor = actorWith("Sapper", [grenade, impact, time]);
    dialog = { fuze: "0", yards: "25", seconds: "10" };
    actions.get("ee-fit-fuze").run(grenade, actor);
    await flush();
    expect(impact.system.quantity).toBe(0);
    // The emptied stack is no longer a fuze to fit.
    expect(carriedFuzes(api as any, actor).map((f) => f.item.name)).toEqual(["Time Fuze (TL8)"]);
    // Swapping it for a time fuze: the impact fuze goes back, a time fuze comes off.
    dialog = { fuze: "0", yards: "25", seconds: "10" };
    actions.get("ee-fit-fuze").run(grenade, actor);
    await flush();
    expect(fittedFuze(api as any, grenade)).toMatchObject({ kind: "time", source: "Time Fuze (TL8)" });
    expect([impact.system.quantity, time.system.quantity]).toEqual([1, 1]);
    // Taken off: back on its stack.
    dialog = { fuze: "", yards: "25", seconds: "10" };
    actions.get("ee-fit-fuze").run(grenade, actor);
    await flush();
    expect(fittedFuze(api as any, grenade)).toBeNull();
    expect(time.system.quantity).toBe(2);
  });

  it("uses up a clock made into a time fuze, and it is a clock again", async () => {
    on.electronicFuzes = true;
    const tnt = item("TNT (per pound)");
    const clock = item("Electronic Clock");
    clock.system.quantity = 2;
    const actor = actorWith("Tinker", [tnt, clock]);
    weaponState.set(clock, { eeImprovisedFuze: true });
    dialog = { fuze: "0", yards: "25", seconds: "10" };
    actions.get("ee-fit-fuze").run(tnt, actor);
    await flush();
    expect(fittedFuze(api as any, tnt)).toMatchObject({ kind: "time", improvised: true });
    expect(clock.system.quantity).toBe(1);
    expect(carriedFuzes(api as any, actor)).toEqual([]);
  });

  it("warns where no fuze is carried", async () => {
    on.electronicFuzes = true;
    const grenade = item("M67");
    actions.get("ee-fit-fuze").run(grenade, actorWith("Nobody", [grenade]));
    await flush();
    expect(chat).toContain("warn GCC.HT.Guidance.NoFuze");
  });

  it("improvises a time fuze from a clock on an Explosives (Demolition) roll", async () => {
    on.electronicFuzes = true;
    const clock = item("Electronic Clock");
    const actor = actorWith("Tinker", [clock], { skills: { "Explosives (Demolition)": 13 } });
    outcomes = [{ success: true, margin: 2 }];
    actions.get("ee-improvise-fuze").run(clock, actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 13, skill: "Explosives (Demolition)" });
    expect(carriedFuzes(api as any, actor)).toEqual([{ item: clock, kind: "time", improvised: true }]);
    expect(actions.get("ee-improvise-fuze").visible(clock)).toBe(false);
  });

  it("rolls Explosives at its IQ-5 default for someone who doesn't know it", async () => {
    on.electronicFuzes = true;
    const clock = item("Wristwatch");
    const actor = actorWith("Amateur", [clock], { attributes: { IQ: 12 } });
    outcomes = [{ success: false, margin: -1 }];
    actions.get("ee-improvise-fuze").run(clock, actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 7, skill: "Explosives (Demolition)" });
    expect(carriedFuzes(api as any, actor)).toEqual([]);
    expect(chat.some((c) => c.includes("ImprovisedFailed"))).toBe(true);
  });
});

describe("homingSeekers (HT:EE p. 49)", () => {
  const rowsOf = (weapon: any) => ({ item: weapon, rows: weapon.system.rangedModes.map((mode: any, index: number) => ({ kind: "ranged", mode, modeIndex: index, row: { ...mode, notes: [] } })) });
  const attack = (weapon: any, actor: any, more: Record<string, unknown> = {}) => ({
    actor, item: weapon, mode: { index: 0, ranged: true }, ranged: true, modifiers: [] as any[], tags: [] as string[], options: {}, refusal: null as string | null, targetTokens: [] as any[], ...more,
  });

  it("gives a homing row the lock-on roll and skill 10 where it lacks them", () => {
    on.homingSeekers = true;
    const stinger = item("GD FIM-92A Stinger, 70mm");
    stinger.system.rangedModes[0].aimingSkill = "";
    stinger.system.rangedModes[0].guidedSkillLevel = 0;
    const context = rowsOf(stinger);
    fire(HOOKS.weaponAttacks, context);
    expect(context.rows[0].row).toMatchObject({ aimingSkill: "Artillery (Guided Missile)", guidedSkillLevel: 10 });
    expect(context.rows[0].row.notes).toHaveLength(1);
    // A guided (not homing) missile is left alone.
    const tow = rowsOf(item("Hughes BGM-71A TOW, 127mm"));
    fire(HOOKS.weaponAttacks, tow);
    expect(tow.rows[0].row.aimingSkill ?? "").toBe("");
  });

  /** `gworld.homingAttack`'s context as the system starts it. */
  const homing = (weapon: any, actor: any) => ({ actor, item: weapon, mode: { index: 0, ranged: true }, target: null, rangeYards: 500, seconds: 1, falls: false, lockedOn: false, semiActive: false, designator: actor, skill: "Forward Observer", level: null, rolls: 1 });

  it("tells the system it locked on, tags the seeker's sense, and leaves the attack alone with the switch off", () => {
    const stinger = item("GD FIM-92A Stinger, 70mm");
    const shooter = actorWith("Gunner", [stinger]);
    const off = homing(stinger, shooter);
    fire(HOOKS.homingAttack, off);
    expect(off.lockedOn).toBe(false);
    const offAttack = attack(stinger, shooter);
    fire(HOOKS.attackModifiers, offAttack);
    expect(offAttack.tags).toEqual([]);

    on.homingSeekers = true;
    // Rolled only once the lock-on roll succeeds: the system adds its Acc (API 1.128.0).
    const locked = homing(stinger, shooter);
    fire(HOOKS.homingAttack, locked);
    expect(locked).toMatchObject({ lockedOn: true, semiActive: false });
    const context = attack(stinger, shooter);
    fire(HOOKS.attackModifiers, context);
    expect(context.modifiers).toEqual([]);
    expect(context.tags).toEqual(["infrared"]);
  });

  it("offers the seeker as an option: -2 on a warm hull, -3 at a torpedo's vital area", () => {
    on.homingSeekers = true;
    const option = options.find((o) => o.key === "ee-seeker");
    const stinger = item("GD FIM-92A Stinger, 70mm");
    expect(option.available({ item: stinger })).toBe(true);
    expect(option.available({ item: item("Springfield M1873, .45-70") })).toBe(false);
    expect(option.apply({ item: stinger }, "")).toBeNull();
    expect(option.apply({ item: stinger }, "infraredHull").modifiers[0]).toMatchObject({ value: -2, key: "warmHull" });
    expect(option.apply({ item: stinger }, "acousticVitals").modifiers[0]).toMatchObject({ value: -3, key: "vitalArea" });
  });

  it("makes a laser-homing attack semi-active, held by whoever aims a designator at the target, and refuses it with nobody there (#549)", () => {
    on.homingSeekers = true;
    const stinger = item("GD FIM-92A Stinger, 70mm");
    const shooter = actorWith("Gunner", [stinger]);
    const target = { uuid: "Scene.s.Token.tank", name: "Tank", document: { uuid: "Scene.s.Token.tank" } };
    targets = [target];
    const option = options.find((o) => o.key === "ee-seeker");
    // The dialog's choice, as the system applies the option before `gworld.homingAttack`.
    const laserShot = () => {
      option.apply({ item: stinger }, "laser");
      const before = homing(stinger, shooter);
      fire(HOOKS.homingAttack, before);
      const after = attack(stinger, shooter, { options: { [`${MODULE_ID}.ee-seeker`]: "laser" }, targetTokens: [target.document] });
      fire(HOOKS.attackModifiers, after);
      return { before, after };
    };

    const bare = laserShot();
    expect(bare.before.semiActive).toBe(false);
    expect(bare.after.refusal).toBe("GCC.HT.Guidance.NotDesignated");
    expect(bare.after.tags).toContain("laser");

    // Carrying a designator but not aiming at the target is not holding the spot.
    const observer = actorWith("Observer", [item("Laser Designator")], { skills: { "Forward Observer": 12 } });
    placeables = [{ actor: observer }];
    expect(laserShot().after.refusal).toBe("GCC.HT.Guidance.NotDesignated");

    // Aiming at it: the system rolls the observer's Forward Observer each turn of flight.
    observer.system = { maneuver: "aim", aim: { turns: 1, target: target.uuid } };
    const held = laserShot();
    expect(held.before).toMatchObject({ semiActive: true, lockedOn: true, skill: "Forward Observer", level: null });
    expect(held.before.designator).toBe(observer);
    expect(held.after.refusal).toBeNull();

    // The choice is read once: a later plain click homes as the record says, infrared.
    const plain = homing(stinger, shooter);
    fire(HOOKS.homingAttack, plain);
    expect(plain.semiActive).toBe(false);
  });
});
