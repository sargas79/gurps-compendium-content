/**
 * High-Tech's liquid projectors and laser dazzlers at the table (pp. 178-181):
 * the flamethrower's rows, DR at a fifth, the lingering burn, the sweep, its
 * Malfunction Table and its tank; the spray's two rolls and wide jet; and the
 * lasers' eye protection and blindness -- each under its own High-Tech switch,
 * with Ultra-Tech's off.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyProjectors } from "./index.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  damageModifiers: "gworld.damageModifiers",
  injury: "gworld.injury",
  armorDr: "gworld.armorDr",
  afterDamage: "gworld.afterDamage",
  turnStart: "gworld.turnStart",
  malfunction: "gworld.malfunction",
  clearMalfunction: "gworld.clearMalfunction",
  weaponTargets: "gworld.weaponTargets",
  successRollModifiers: "gworld.successRollModifiers",
  afflictionEffect: "gworld.afflictionEffect",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let chat: string[];
let dice: number[];
let options: any[];
let damageRolls: any[];
let injuries: any[];
let crippled: any[];
let conditions: Map<string, any[]>;
let malfunctions: any[];
let weaponState: Map<any, any>;
let derived: any;

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function actorWith(name: string, items: any[] = []): any {
  const flags: Record<string, unknown> = {};
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    items,
    system: { maneuver: "attack" },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    flags,
  };
}

function flamethrower(tl = 7, extra: Record<string, unknown> = {}): any {
  return {
    id: "flame", uuid: "Item.flame", name: "Beattie M2-2", type: "equipment", isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: {
      tl: String(tl), equipped: true, hpLost: 0,
      rangedModes: [{ name: "attack", skill: "Liquid Projector (Flamethrower)", damageFormula: "3d", damageType: "burn", halfDamageRange: 25, maxRange: 40, malfunction: 17 }],
      meleeModes: [],
      extensions: { [MODULE_ID]: { firearm: { ...extra } } },
    },
  };
}

function spray(name: string, modifier: number): any {
  return {
    id: "spray", uuid: "Item.spray", name, type: "equipment", isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "8", meleeModes: [{ name: "spray", skill: "Liquid Projector (Sprayer)", affliction: true, afflictionAttribute: "HT", afflictionModifier: modifier }], rangedModes: [] },
  };
}

function laser(name: string, modifier: number, book = "high-tech"): any {
  return {
    id: "laser", uuid: "Item.laser", name, type: "equipment", isOwner: true,
    flags: { [MODULE_ID]: { book } },
    system: { tl: "8", meleeModes: [], rangedModes: [{ name: "dazzle", skill: "Beam Weapons (Projector)", affliction: true, afflictionAttribute: "HT", afflictionModifier: modifier, halfDamageRange: 1500 }] },
  };
}

function fakeApi() {
  return {
    combat: {
      hooks: HOOKS,
      registerAttackOption: (option: any) => { options.push(option); },
      setWeaponState: async (item: any, _module: string, patch: any) => { weaponState.set(item, { ...(weaponState.get(item) ?? {}), ...patch }); },
      getWeaponState: (item: any) => weaponState.get(item) ?? null,
    },
    data: { hooks: { objectStats: "gworld.objectStats" } },
    registry: { isRuleOn: (key: string) => on[key] === true },
    rules,
    sheets: { registerSheetSection: vi.fn() },
    actors: {
      derived: () => derived,
      conditions: (actor: any) => conditions.get(actor.name) ?? [],
      applyCondition: async (actor: any, c: any) => {
        const id = c.module ? `${c.module}.${c.key}` : c.key;
        conditions.set(actor.name, [...(conditions.get(actor.name) ?? []).filter((x) => x.id !== id), { id, ...c }]);
        return id;
      },
      removeCondition: async (actor: any, id: string) => { conditions.set(actor.name, (conditions.get(actor.name) ?? []).filter((x) => x.id !== id)); },
      applyInjury: async (actor: any, injury: any) => { injuries.push({ actor: actor.name, ...injury }); return null; },
      cripple: async (actor: any, location: string, o: any) => { crippled.push({ actor: actor.name, location, ...o }); return {}; },
    },
    items: { setMalfunction: async (item: any, m: any) => { malfunctions.push({ item: item.name, ...m }); return true; } },
    roll: { damage: async (o: any) => { damageRolls.push(o); return 0; } },
  };
}

let api: ReturnType<typeof fakeApi>;

function ready(): void {
  api = fakeApi();
  const rule = (key: string) => () => on[key] === true;
  readyProjectors(api as never, { flamethrowers: rule("flamethrowers"), sprayGuns: rule("sprayGuns"), laserDazzlers: rule("laserDazzlers") });
}

function rowsOf(item: any): any[] {
  const rows = [
    ...item.system.rangedModes.map((mode: any) => ({ kind: "ranged", mode, row: { ...mode, notes: [], followUp: null } })),
    ...item.system.meleeModes.map((mode: any) => ({ kind: "melee", mode, row: { ...mode, notes: [], followUp: null } })),
  ];
  fire(HOOKS.weaponAttacks, { actor: null, item, rows });
  return rows.map((r) => r.row);
}

beforeEach(() => {
  hooks = new Map();
  on = {};
  chat = [];
  dice = [];
  options = [];
  damageRolls = [];
  injuries = [];
  crippled = [];
  conditions = new Map();
  malfunctions = [];
  weaponState = new Map();
  derived = { traitEffects: {}, drByLocation: {} };
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => ((dice.shift() ?? 1) - 1) / 6 + 0.01 } });
  vi.stubGlobal("game", {
    user: { id: "gm", isGM: true },
    users: { activeGM: { isSelf: true }, [Symbol.iterator]: function* () { yield { id: "gm", isGM: true }; } },
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  ready();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flamethrowers (flamethrowers)", () => {
  it("leaves the rows alone while the switch is off", () => {
    const [row] = rowsOf(flamethrower());
    expect(row.largeArea).toBeUndefined();
  });

  it("makes the jet a large-area, incendiary blow, and unthickened fuel halves a TL7 Range", () => {
    on.flamethrowers = true;
    const [row] = rowsOf(flamethrower(7, { unthickenedFuel: true }));
    expect(row).toMatchObject({ largeArea: true, incendiary: true, halfDamageRange: 12, maxRange: 20 });
    const [tl6] = rowsOf(flamethrower(6, { unthickenedFuel: true }));
    expect(tl6).toMatchObject({ halfDamageRange: 25, maxRange: 40 });
  });

  it("counts unsealed worn DR at a fifth, sealed in full", () => {
    on.flamethrowers = true;
    const item = flamethrower();
    const context = { actor: actorWith("Victim"), item, lines: [{ dr: 12 }, { dr: 3 }] };
    fire(HOOKS.armorDr, context);
    expect(context.lines.map((l) => l.dr)).toEqual([2, 0]);
    derived.traitEffects.sealed = true;
    const suited = { actor: actorWith("Suited"), item, lines: [{ dr: 12 }] };
    fire(HOOKS.armorDr, suited);
    expect(suited.lines[0]!.dr).toBe(12);
  });

  it("sweeps only as an All-Out Attack, dividing damage and burning time by the width", async () => {
    on.flamethrowers = true;
    const item = flamethrower();
    const shooter = actorWith("Shooter", [item]);
    const sweep = options.find((o) => o.key === "ht-flame-sweep");
    expect(sweep.refuse({ actor: shooter })).toBe("GCC.HT.Projectors.Sweep.NeedsAllOut");
    shooter.system.maneuver = "allOutAttack";
    expect(sweep.refuse({ actor: shooter })).toBeNull();

    fire(HOOKS.attackModifiers, { actor: shooter, item, mode: { index: 0, ranged: true }, options: { [`${MODULE_ID}.ht-flame-sweep`]: 3 }, modifiers: [] });
    fire(HOOKS.damageModifiers, { actor: shooter, item, mode: { index: 0, ranged: true }, distanceYards: 10, modifiers: [] });
    await flush();
    const damage = { basicDamage: 11, type: "burn" };
    fire(HOOKS.injury, { actor: actorWith("Victim"), item, damage });
    expect(damage.basicDamage).toBe(3);

    // 2d x 5 = 35 seconds, a third of it 11.
    const victim = actorWith("Victim");
    dice = [3, 4];
    fire(HOOKS.afterDamage, { actor: victim, item, damage, result: { injury: 3 } });
    await flush();
    expect(victim.flags.htFlameBurn).toEqual({ seconds: 11 });
  });

  it("burns on for 1d x 5 past 1/2D, 1d a second against a fifth of the large-area DR", async () => {
    on.flamethrowers = true;
    const item = flamethrower();
    fire(HOOKS.attackModifiers, { actor: actorWith("Shooter"), item, mode: { index: 0, ranged: true }, options: {}, modifiers: [] });
    fire(HOOKS.damageModifiers, { item, mode: { index: 0, ranged: true }, distanceYards: 30, modifiers: [] });
    await flush();
    const victim = actorWith("Victim");
    dice = [2];
    fire(HOOKS.afterDamage, { actor: victim, item, damage: { basicDamage: 10 }, result: { injury: 8 } });
    await flush();
    expect(victim.flags.htFlameBurn).toEqual({ seconds: 10 });
    expect(conditions.get("Victim")?.[0]?.id).toBe(`${MODULE_ID}.ht-flame-burning`);

    // Torso DR 12, the arms 4: large-area DR 8, a fifth of it 1. A 5 does 4.
    derived.drByLocation = { torso: 12, skull: 12, face: 12, eye: 12, neck: 12, groin: 12, arm: 4, hand: 12, leg: 12, foot: 12 };
    dice = [5];
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(injuries).toEqual([{ actor: "Victim", amount: 4, label: "GCC.HT.Projectors.Flame.Title" }]);
    expect(victim.flags.htFlameBurn).toEqual({ seconds: 9 });
  });

  it("stops burning when the GM takes the condition off", async () => {
    on.flamethrowers = true;
    const victim = actorWith("Victim");
    await victim.setFlag(MODULE_ID, "htFlameBurn", { seconds: 5 });
    fire(HOOKS.turnStart, null, { actor: victim });
    await flush();
    expect(injuries).toEqual([]);
    expect(victim.flags.htFlameBurn).toBeUndefined();
  });

  it("rolls its own Malfunction Table, and an 18 explodes on everything within two yards", () => {
    on.flamethrowers = true;
    const item = flamethrower();
    const shooter = actorWith("Shooter", [item]);
    const early = { actor: shooter, item, modeIndex: 0, roll: 4, kind: "stoppage" };
    fire(HOOKS.malfunction, early);
    expect(early).toMatchObject({ kind: "ht-flame-noIgnition", jams: true, fires: false, explodes: false });
    const late = { actor: shooter, item, modeIndex: 0, roll: 12, kind: "misfire" };
    fire(HOOKS.malfunction, late);
    expect(late.kind).toBe("ht-flame-noFuel");
    const boom = { actor: shooter, item, modeIndex: 0, roll: 18, kind: "mechanical" };
    fire(HOOKS.malfunction, boom);
    expect(boom).toMatchObject({ kind: "ht-flame-explosion", explodes: true });
    expect(damageRolls[0]).toMatchObject({ formula: "3d", damageType: "burn", largeArea: true, source: "ht-flame-explosion" });
    // A gun-quality reroll that saved the shot is left alone.
    const saved = { actor: shooter, item, modeIndex: 0, roll: 18, kind: null };
    fire(HOOKS.malfunction, saved);
    expect(saved.kind).toBeNull();
  });

  it("clears in 10 seconds with an unmodified roll, a critical failure being an explosion", async () => {
    on.flamethrowers = true;
    const item = flamethrower();
    const context = { actor: actorWith("Shooter", [item]), item, modeIndex: 0, malfunction: { kind: "ht-flame-noFuel" }, rolls: [{ key: "armoury", modifier: 0 }, { key: "weapon", modifier: -4 }], readyManeuvers: 0, hours: 1, criticalFailure: "mechanical", refusal: null };
    fire(HOOKS.clearMalfunction, context);
    expect(context).toMatchObject({ readyManeuvers: 10, hours: 0, criticalFailure: "destroyed" });
    expect(context.rolls.map((r) => r.modifier)).toEqual([0, 0]);
    fire("updateItem", item, { flags: { gworld: { malfunction: { kind: "destroyed" } } } }, {}, "gm");
    await flush();
    expect(malfunctions).toEqual([{ item: "Beattie M2-2", kind: "ht-flame-explosion", label: "GCC.HT.Projectors.Malfunction.explosion" }]);
    expect(damageRolls).toHaveLength(1);

    const exploded = { item, malfunction: { kind: "ht-flame-explosion" }, rolls: [], refusal: null };
    fire(HOOKS.clearMalfunction, exploded);
    expect(exploded.refusal).toBe("GCC.HT.Projectors.Malfunction.Exploded");
  });

  it("has DR 2 as a target, and blows up on a 1 when damage gets through", async () => {
    on.flamethrowers = true;
    const item = flamethrower();
    const stats = { item, dr: 4, notes: [] as string[] };
    fire("gworld.objectStats", stats);
    expect(stats.dr).toBe(2);

    const targets = { foe: actorWith("Carrier", [item]), targets: [{ id: "flame", penalty: -3 }] };
    fire(HOOKS.weaponTargets, targets);
    expect(targets.targets).toHaveLength(1);
    expect(targets.targets[0]).toMatchObject({ id: "flame", penalty: 0, name: expect.stringContaining("Tank.Target ") });
    // The backpack at -4 from the front, at no penalty from the side or behind (API 1.137.0).
    const from = (arc: string) => { const context: any = { foe: actorWith("Carrier", [item]), arc, side: null, targets: [] }; fire(HOOKS.weaponTargets, context); return context.targets[0]; };
    expect(from("front")).toMatchObject({ penalty: -4, name: expect.stringContaining("TargetFacing") });
    expect(from("back")).toMatchObject({ penalty: 0, name: expect.stringContaining("TargetBehind") });
    expect(from("side").penalty).toBe(0);

    const opts: Record<string, unknown> = {};
    fire("preUpdateItem", item, { system: { hpLost: 3 } }, opts);
    dice = [1];
    fire("updateItem", item, { system: { hpLost: 3 } }, opts, "gm");
    await flush();
    expect(malfunctions[0]).toMatchObject({ kind: "ht-flame-explosion" });
    expect(damageRolls).toHaveLength(1);

    const again: Record<string, unknown> = {};
    fire("preUpdateItem", item, { system: { hpLost: 5 } }, again);
    dice = [4];
    fire("updateItem", item, { system: { hpLost: 5 } }, again, "gm");
    await flush();
    expect(malfunctions[1]).toMatchObject({ kind: "ht-flame-disabled" });
  });
});

describe("spray guns (sprayGuns)", () => {
  it("adds the second roll, against blindness, and +2 to hit the face", () => {
    on.sprayGuns = true;
    const item = spray("Pepper Spray", -4);
    const [row] = rowsOf(item);
    expect(row.followUp).toMatchObject({ affliction: true, afflictionAttribute: "HT", afflictionModifier: -4, followUp: true, label: "GCC.HT.Projectors.Spray.Blindness" });

    const face = { item, mode: { index: 0, ranged: false }, calledShot: { hitLocation: "face" }, modifiers: [] as any[] };
    fire(HOOKS.attackModifiers, face);
    expect(face.modifiers).toEqual([{ label: "GCC.HT.Projectors.Spray.WideJet", value: 2 }]);
    const torso = { item, mode: { index: 0, ranged: false }, calledShot: null, modifiers: [] as any[] };
    fire(HOOKS.attackModifiers, torso);
    expect(torso.modifiers).toEqual([]);
  });

  it("takes the system's DR line off the roll to resist a gas spray", () => {
    on.sprayGuns = true;
    const resist = { actor: actorWith("Victim"), tags: ["attribute", "resist", "affliction"], attack: { item: spray("Pepper Spray", -4), dr: 2 }, modifiers: [{ key: "afflictionDr", label: "DR", value: 2 }] as any[] };
    fire(HOOKS.successRollModifiers, resist);
    expect(resist.modifiers).toEqual([]);
  });

  it("leaves pepper spray's coughing until washed off, and tear gas's blindness for the margin in minutes", () => {
    on.sprayGuns = true;
    const victim = actorWith("Victim");
    const pepper = { actor: victim, item: spray("Pepper Spray", -4), label: "Pepper Spray spray", margin: 3, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, pepper);
    expect(pepper.effects).toEqual([{ key: "coughing" }]);
    const tear = { actor: victim, item: spray("Tear Gas Spray", -2), label: "Tear Gas Spray GCC.HT.Projectors.Spray.Blindness", margin: 2, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, tear);
    expect(tear.effects).toEqual([{ module: MODULE_ID, key: "ht-spray-blinded", label: "GCC.HT.Projectors.Spray.Blinded", duration: { seconds: 120 } }]);
  });

  it("times tear gas's coughing and blindness by the margin's size, signed or not (#539)", () => {
    on.sprayGuns = true;
    const victim = actorWith("Victim");
    for (const [margin, seconds] of [[-1, 60], [-5, 300], [-12, 720]] as const) {
      const tear = { actor: victim, item: spray("Tear Gas Spray", -2), label: "Tear Gas Spray spray", margin, effects: [] as any[] };
      fire(HOOKS.afflictionEffect, tear);
      expect(tear.effects).toEqual([{ key: "coughing", duration: { seconds } }]);
    }
  });
});

describe("laser dazzlers (laserDazzlers)", () => {
  it("adds Protected Vision, a Nictitating Membrane or anti-laser goggles to the roll to resist", () => {
    on.laserDazzlers = true;
    const item = laser("NORINCO QXJ04", -5);
    derived.traitEffects = { protectedSense: { vision: true }, nictitatingMembrane: 2 };
    // "DR has no effect" (p. 181): the system's DR line goes.
    const eyes = { actor: actorWith("Guard"), tags: ["attribute", "resist", "affliction"], attack: { item }, modifiers: [{ key: "afflictionDr", label: "DR", value: 3 }] as any[] };
    fire(HOOKS.successRollModifiers, eyes);
    expect(eyes.modifiers).toEqual([{ label: "GCC.HT.Projectors.Laser.Protection", value: 7 }]);

    derived.traitEffects = {};
    const goggled = { actor: actorWith("Soldier", [{ name: "Anti-Laser Goggles", system: { equipped: true } }]), tags: ["resist"], attack: { item }, modifiers: [] as any[] };
    fire(HOOKS.successRollModifiers, goggled);
    expect(goggled.modifiers).toEqual([{ label: "GCC.HT.Projectors.Laser.Protection", value: 9 }]);
  });

  // The system hands a failure's margin over as a negative number (#535).
  it("dazzles for the margin in minutes, and a blinding laser cripples both eyes, for good at 10+", async () => {
    on.laserDazzlers = true;
    const victim = actorWith("Guard");
    const dazzled = { actor: victim, item: laser("NORINCO QXJ04", -5), label: "", margin: -3, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, dazzled);
    expect(dazzled.effects).toEqual([{ module: MODULE_ID, key: "ht-dazzled", label: "GCC.HT.Projectors.Laser.Dazzled", duration: { seconds: 180 } }]);
    // The eyes are recorded as crippled parts with no injury behind them, their duration left to the HT roll (#549).
    const blinded = { actor: victim, item: laser("NORINCO ZM87", -10), label: "", margin: -4, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, blinded);
    await flush();
    expect(blinded.effects).toEqual([]);
    const eye = { actor: "Guard", location: "eye", duration: "undecided", injury: false, label: "GCC.HT.Projectors.Laser.Blinded" };
    expect(crippled).toEqual([eye, eye]);
    expect(chat.at(-1)).toContain("GCC.HT.Projectors.Laser.BlindedRecordedLine");
    crippled = [];
    const lost = { actor: victim, item: laser("NORINCO ZM87", -10), label: "", margin: -11, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, lost);
    await flush();
    expect(crippled).toEqual([0, 1].map(() => ({ ...eye, duration: "permanent", label: "GCC.HT.Projectors.Laser.BlindedForGood" })));
  });

  it("marks a victim the user can't change with the condition instead", () => {
    on.laserDazzlers = true;
    const blinded = { actor: { ...actorWith("Guard"), isOwner: false }, item: laser("NORINCO ZM87", -10), label: "", margin: -4, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, blinded);
    expect(blinded.effects[0]).toMatchObject({ key: "ht-laser-blinded", label: "GCC.HT.Projectors.Laser.Blinded" });
    expect(crippled).toEqual([]);
  });

  it("dazzles for 1, 5 and 12 minutes on failures by 1, 5 and 12; a blinding laser cripples for good only from 10 (#535)", () => {
    on.laserDazzlers = true;
    const victim = { ...actorWith("Guard"), isOwner: false };
    const hit = (name: string, modifier: number, margin: number) => {
      const context = { actor: victim, item: laser(name, modifier), label: "", margin, effects: [] as any[] };
      fire(HOOKS.afflictionEffect, context);
      return context.effects[0];
    };
    expect(hit("NORINCO QXJ04", -5, -1)).toMatchObject({ key: "ht-dazzled", duration: { seconds: 60 } });
    expect(hit("NORINCO QXJ04", -5, -5)).toMatchObject({ key: "ht-dazzled", duration: { seconds: 300 } });
    expect(hit("NORINCO QXJ04", -5, -12)).toMatchObject({ key: "ht-dazzled", duration: { seconds: 720 } });
    expect(hit("NORINCO ZM87", -10, -1)).toMatchObject({ label: "GCC.HT.Projectors.Laser.Blinded" });
    expect(hit("NORINCO ZM87", -10, -5)).toMatchObject({ label: "GCC.HT.Projectors.Laser.Blinded" });
    expect(hit("NORINCO ZM87", -10, -9)).toMatchObject({ label: "GCC.HT.Projectors.Laser.Blinded" });
    expect(hit("NORINCO ZM87", -10, -10)).toMatchObject({ label: "GCC.HT.Projectors.Laser.BlindedForGood" });
  });

  it("leaves another book's laser to that book, and does nothing with the switch off", () => {
    const victim = actorWith("Guard");
    const off = { actor: victim, item: laser("NORINCO QXJ04", -5), label: "", margin: -3, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, off);
    expect(off.effects).toEqual([]);
    on.laserDazzlers = true;
    const theirs = { actor: victim, item: laser("Laser Dazzler", -5, "ultra-tech"), label: "", margin: -3, effects: [] as any[] };
    fire(HOOKS.afflictionEffect, theirs);
    expect(theirs.effects).toEqual([]);
  });
});
