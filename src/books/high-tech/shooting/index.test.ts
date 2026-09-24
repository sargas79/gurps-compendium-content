/**
 * The shooting options and gun techniques as the system meets them: the
 * rows, the attack options and hooks, the row actions and the technique kind,
 * with Foundry's globals stubbed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { gunslingerDefault, instantArsenalDisarm, precisionAim, readyShooting, type ShootingSwitches } from "./index.js";

type Listener = (context: any) => void;

let hooks: Map<string, Listener[]>;
let options: Map<string, any>;
let rowActions: Map<string, any>;
let kinds: Map<string, any>;
let chat: string[];
let weaponState: Map<string, Record<string, unknown>>;
let combatState: Map<string, unknown>;
let on: Record<string, boolean>;
let rolls: any[];
let rollOutcome: any;
let contestOutcome: any;
let malfunctions: any[];
let unreadied: any[];
let prompted: unknown;
let zenSkills: any[];
let aimsLost: any[];

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  attackSequence: "gworld.attackSequence",
  techniqueDefaults: "gworld.techniqueDefaults",
  afterQuickContest: "gworld.afterQuickContest",
};

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: () => false },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (r: any) => { options.set(r.key, r); return `${r.module}.${r.key}`; },
      getWeaponState: (item: any) => weaponState.get(item.id) ?? {},
      setWeaponState: async (item: any, _module: string, patch: Record<string, unknown>) => { weaponState.set(item.id, { ...(weaponState.get(item.id) ?? {}), ...patch }); },
      getCombatState: (actor: any, _module: string, key: string) => combatState.get(`${actor.uuid}:${key}`),
      setCombatState: async (actor: any, _module: string, key: string, value: unknown) => { combatState.set(`${actor.uuid}:${key}`, value); },
      registerZenSkill: (r: any) => { zenSkills.push(r); return `${r.module}.${r.key}`; },
    },
    sheets: { registerRowAction: (r: any) => { rowActions.set(r.key, r); } },
    data: { registerTechniqueKind: (r: any) => { kinds.set(r.key, r); } },
    actors: {
      derived: (actor: any) => actor?.system?.derived ?? null,
      attribute: (actor: any, key: string) => actor?.attrs?.[key] ?? null,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      loseAim: async (actor: any, reason: string) => {
        aimsLost.push({ actor: actor.id, reason });
        actor.system.aim = { turns: 0, braced: false, target: "", bonuses: [] };
        return true;
      },
    },
    items: {
      setMalfunction: async (item: any, m: any) => { malfunctions.push({ item: item.id, ...m }); return true; },
      setUnready: async (item: any, unready: boolean, o: any) => { unreadied.push({ item: item.id, unready, ...o }); return { itemId: item.id, unready, reason: o?.reason ?? "" }; },
    },
    roll: {
      success: async (r: any) => { rolls.push(r); return rollOutcome; },
      quickContest: async (r: any) => {
        rolls.push(r);
        fire(HOOKS.afterQuickContest, { tags: r.tags, first: { actor: r.first.actor, outcome: { criticalFailure: contestOutcome.critical === true } }, second: {} });
        return { outcome: contestOutcome.outcome, marginOfVictory: contestOutcome.margin ?? 0, messageId: "m1" };
      },
    },
  };
}

const switches: ShootingSwitches = {
  pistolero: () => on.pistolero === true,
  precisionAiming: () => on.precisionAiming === true,
  rangedRapidStrike: () => on.rangedRapidStrike === true,
  gunTechniques: () => on.gunTechniques === true,
  gunslinger: () => on.gunslinger === true,
  zenMarksmanship: () => on.zenMarksmanship === true,
};

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

function gun(name: string, mode: Record<string, unknown>): any {
  return {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    system: {
      tl: "7",
      weaponClass: "firearm",
      meleeModes: [],
      rangedModes: [{ skill: "Guns (Pistol)", accuracy: 2, rateOfFire: 3, recoil: 2, shots: "7+1(3)", damageType: "pi+", bulk: -2, minSt: 10, ...mode }],
    },
  };
}

const colt = () => gun("Colt Government", { minSt: 10, bulk: -2 });
const deagle = () => gun("Desert Eagle", { minSt: 11, bulk: -4 });
const tommy = () => gun("Thompson M1928A1", { skill: "Guns (Submachine Gun)", rateOfFire: 13, bulk: -5 });
const mosin = () => gun("Mosin-Nagant", { skill: "Guns (Rifle)", accuracy: 5, rateOfFire: 1, bulk: -6, minSt: 10 });
const peacemaker = () => gun("Colt SAA", { rateOfFire: 1, shots: "6(5i)" });

const technique = (name: string, level: number, extra: Record<string, unknown> = {}) => ({ id: name, type: "technique", name, system: { derived: { level }, prerequisite: "", points: 0, ...extra } });
const trait = (name: string) => ({ id: name, type: "trait", name, system: {} });

const shooter = (extra: Record<string, unknown> = {}) => ({
  id: "a1",
  uuid: "Actor.a1",
  name: "Svetlana",
  isOwner: true,
  attrs: { ST: 8, DX: 11, IQ: 12, Per: 12 },
  skills: { "Guns (Pistol)": 14, "Guns (Rifle)": 14, "Guns (Submachine Gun)": 12 } as Record<string, number>,
  items: [] as any[],
  system: { maneuver: "attack", aim: { turns: 0, braced: false, target: "", bonuses: [] as any[] }, derived: { ranged: [] as any[] } },
  update: vi.fn(async function (this: any, changes: Record<string, unknown>) {
    if ("system.aim.bonuses" in changes) this.system.aim.bonuses = changes["system.aim.bonuses"];
  }),
  ...extra,
});

function row(item: any, actor: any, extra: Record<string, unknown> = {}) {
  const mode = item.system.rangedModes[0];
  return fire(HOOKS.weaponAttacks, { actor, item, rows: [{ kind: "ranged", mode, basis: {}, row: { skillLevel: 12, minSt: mode.minSt, minStPenalty: -2, notes: [] as any[], ...extra } }] }).rows[0].row;
}

function attack(item: any, actor: any, extra: Record<string, unknown> = {}) {
  const { chosen = {}, ...rest } = extra as any;
  const optionsChosen = Object.fromEntries(Object.entries(chosen).map(([k, v]) => [`${MODULE_ID}.${k}`, v]));
  return fire(HOOKS.attackModifiers, { actor, item, mode: { index: 0, ranged: true }, rollType: "attack", ranged: true, modifiers: [], options: optionsChosen, refusal: null, dataset: { rollSkill: item.system.rangedModes[0].skill }, calledShot: null, rangeYards: 10, movement: { maneuver: actor.system.maneuver, yards: 0 }, spraying: null, ...rest });
}

const optionContext = (item: any, actor: any, chosen: Record<string, unknown> = {}) => ({ actor, item, ranged: true, damageType: "pi+", reach: "", effectiveSkill: 14, maneuver: actor.system.maneuver, targets: [], chosen });

beforeEach(() => {
  hooks = new Map();
  options = new Map();
  rowActions = new Map();
  kinds = new Map();
  chat = [];
  weaponState = new Map();
  combatState = new Map();
  on = {};
  rolls = [];
  rollOutcome = { success: true, criticalFailure: false };
  contestOutcome = { outcome: "first" };
  malfunctions = [];
  unreadied = [];
  prompted = 0;
  zenSkills = [];
  aimsLost = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { targets: new Set() },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => prompted } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  readyShooting(fakeApi() as never, switches);
});

describe("the two-handed pistol stance (p. 84)", () => {
  it("is toggled from a pistol's row, and only a pistol's", async () => {
    on.pistolero = true;
    const action = rowActions.get("ht-pistolero");
    expect(action.visible(colt())).toBe(true);
    expect(action.visible(mosin())).toBe(false);
    const pistol = colt();
    action.run(pistol, shooter());
    await vi.waitFor(() => expect(weaponState.get(pistol.id)).toEqual({ pistolero: true }));
  });

  it("lowers minimum ST by a fifth, and the skill shortfall with it", () => {
    on.pistolero = true;
    const pistol = deagle();
    weaponState.set(pistol.id, { pistolero: true });
    // ST 8 against ST 11 is -3; in the stance ST 9 is -1.
    const r = row(pistol, shooter(), { skillLevel: 11, minStPenalty: -3 });
    expect([r.minSt, r.skillLevel, r.minStPenalty]).toEqual([9, 13, -1]);
    expect(r.notes.map((n: any) => n.label)).toContain("GCC.HT.Shooting.StanceNote");
    // Held one-handed, nothing changes.
    weaponState.clear();
    expect(row(deagle(), shooter(), { skillLevel: 11, minStPenalty: -3 }).minSt).toBe(11);
  });

  it("takes Bulk a step better, braces every aimed shot, and forbids fanning", () => {
    on.pistolero = true;
    const pistol = deagle();
    weaponState.set(pistol.id, { pistolero: true });
    const actor = shooter();
    const moving = attack(pistol, actor, { modifiers: [{ label: "Bulk", value: -4, key: "bulk", situation: "moveAndAttack" }] });
    expect(moving.modifiers[0].value).toBe(-3);
    const aimed = attack(pistol, actor, { modifiers: [{ label: "Accuracy", value: 3, key: "accuracy" }] });
    expect(aimed.modifiers).toContainEqual({ label: "GCC.HT.Shooting.StanceBraced", value: 1, key: "braced" });
    const already = attack(pistol, actor, { modifiers: [{ label: "Accuracy", value: 3, key: "accuracy" }, { label: "Braced", value: 1, key: "braced" }] });
    expect(already.modifiers.filter((m: any) => m.key === "braced")).toHaveLength(1);
    expect(attack(pistol, actor, { chosen: { "ht-fanning": "3" } }).refusal).toBe("GCC.HT.Shooting.StanceNoFanning");
  });
});

describe("Precision Aiming (p. 84)", () => {
  const sniper = (turns: number, bonuses: any[] = [], items: any[] = []) => {
    const rifle = mosin();
    const actor = shooter({ items });
    actor.system.maneuver = "aim";
    actor.system.aim = { turns, braced: true, target: "", bonuses };
    actor.system.derived.ranged = [{ itemId: rifle.id, modeIndex: 0, accuracy: 5, scopeBonus: 2, skillName: "Guns (Rifle)" }];
    return { rifle, actor };
  };

  it("is offered on the gun's row once six seconds are aimed", () => {
    on.precisionAiming = true;
    const { rifle, actor } = sniper(6);
    expect(rowActions.get("ht-precision-aiming").visible(rifle, actor)).toBe(true);
    expect(rowActions.get("ht-precision-aiming").visible(rifle, sniper(5).actor)).toBe(false);
  });

  it("rolls IQ-based Guns at -6, or the technique, and adds +1 to the aim", async () => {
    on.precisionAiming = true;
    // The book's sniper: Guns (Rifle)-14 at DX 11, IQ 12, so IQ-based 15; the technique at +0 after buying off the -6.
    const { rifle, actor } = sniper(6, [], [technique("Precision Aiming (Rifle)", 14)]);
    expect(await precisionAim(fakeApi() as never, rifle, actor)).toBe("gained");
    expect(rolls[0].base).toBe(15);
    expect(rolls[0].modifiers).toEqual([]);
    expect(actor.system.aim.bonuses).toEqual([{ label: "GCC.HT.Shooting.PrecisionBonus", value: 1, key: "precisionAiming" }]);

    const untaught = sniper(6);
    await precisionAim(fakeApi() as never, untaught.rifle, untaught.actor);
    expect(rolls[1].modifiers).toEqual([{ label: "GCC.HT.Shooting.PrecisionLine", value: -6 }]);
  });

  it("waits for the next threshold, and stops at the scope's bonus", async () => {
    on.precisionAiming = true;
    const early = sniper(11, [{ label: "P", value: 1, key: "precisionAiming" }]);
    expect(await precisionAim(fakeApi() as never, early.rifle, early.actor)).toBeNull();
    const capped = sniper(24, [{ label: "P", value: 2, key: "precisionAiming" }]);
    expect(await precisionAim(fakeApi() as never, capped.rifle, capped.actor)).toBeNull();
    expect(rolls).toHaveLength(0);
    const second = sniper(12, [{ label: "P", value: 1, key: "precisionAiming" }]);
    expect(await precisionAim(fakeApi() as never, second.rifle, second.actor)).toBe("gained");
    expect(second.actor.system.aim.bonuses[0].value).toBe(2);
  });

  it("needs the gun braced", async () => {
    on.precisionAiming = true;
    const { rifle, actor } = sniper(6);
    actor.system.aim.braced = false;
    expect(await precisionAim(fakeApi() as never, rifle, actor)).toBeNull();
  });

  it("loses the aim on a failure, and gives the sniper away on a critical one", async () => {
    on.precisionAiming = true;
    rollOutcome = { success: false, criticalFailure: true };
    const { rifle, actor } = sniper(12, [{ label: "P", value: 1, key: "precisionAiming" }, { label: "Optics", value: 1 }]);
    expect(await precisionAim(fakeApi() as never, rifle, actor)).toBe("spotted");
    expect(aimsLost).toEqual([{ actor: actor.id, reason: "GCC.HT.Shooting.PrecisionLostReason" }]);
    expect(actor.system.aim).toMatchObject({ turns: 0, bonuses: [] });
    expect(chat[0]).toContain("PrecisionLost");
    expect(chat[0]).toContain("PrecisionSpotted");
  });

  it("holds the extra aim to the lower of the scope's bonus and the Acc on the shot", () => {
    on.precisionAiming = true;
    const shot = attack(mosin(), shooter(), { modifiers: [{ label: "Accuracy", value: 7, key: "accuracy", scope: 2 }, { label: "Precision", value: 3, key: "precisionAiming" }] });
    expect(shot.modifiers[1].value).toBe(2);
  });
});

describe("the Ranged Rapid Strike (p. 85)", () => {
  it("is refused below RoF 2 and off Attack", () => {
    on.rangedRapidStrike = true;
    const option = options.get("ht-ranged-rapid-strike");
    const actor = shooter();
    expect(option.refuse(optionContext(peacemaker(), actor))).toBe("GCC.HT.Shooting.RapidRefusal.rateOfFire");
    // A single-action revolver fast-fired two-handed at RoF 2 may.
    expect(option.refuse(optionContext(peacemaker(), actor, { [`${MODULE_ID}.ht-fast-firing`]: "2" }))).toBeNull();
    actor.system.maneuver = "moveAndAttack";
    expect(option.refuse(optionContext(colt(), actor))).toBe("GCC.HT.Shooting.RapidRefusal.maneuver");
  });

  it("is -6 at half the RoF, bought off by Quick-Shot, halved by the expanded Gunslinger", () => {
    on.rangedRapidStrike = true;
    const option = options.get("ht-ranged-rapid-strike");
    expect(option.apply(optionContext(colt(), shooter()))).toMatchObject({ modifiers: [{ value: -6 }], rateOfFireMultiplier: 0.5 });
    const quick = shooter({ items: [technique("Quick-Shot (Pistol)", 12)] });
    expect(option.apply(optionContext(colt(), quick)).modifiers).toEqual([{ label: "GCC.HT.Shooting.RapidStrikeLine", value: -2 }]);
    on.gunslinger = true;
    const gunslinger = shooter({ items: [trait("Gunslinger")] });
    expect(option.apply(optionContext(colt(), gunslinger)).modifiers[0].value).toBe(-3);
  });

  it("counts the second attack, which has to take the option too", async () => {
    on.rangedRapidStrike = true;
    const actor = shooter();
    expect(fire(HOOKS.attackSequence, { actor, count: 1 }).count).toBe(1);
    expect(attack(colt(), actor, { chosen: { "ht-ranged-rapid-strike": true } }).refusal).toBeNull();
    await vi.waitFor(() => expect(combatState.get("Actor.a1:ht-ranged-rapid-strike-state")).toBeTruthy());
    expect(fire(HOOKS.attackSequence, { actor, count: 1 }).count).toBe(2);
    expect(attack(colt(), actor).refusal).toBe("GCC.HT.Shooting.RapidSecond");
    expect(attack(colt(), actor, { chosen: { "ht-ranged-rapid-strike": true } }).refusal).toBeNull();
    await vi.waitFor(() => expect((combatState.get("Actor.a1:ht-ranged-rapid-strike-state") as any).remaining).toBe(0));
    expect(attack(colt(), actor).refusal).toBeNull();
    // Declared again once both are made, it starts afresh.
    expect(attack(colt(), actor, { chosen: { "ht-ranged-rapid-strike": true } }).refusal).toBeNull();
    await vi.waitFor(() => expect((combatState.get("Actor.a1:ht-ranged-rapid-strike-state") as any).remaining).toBe(1));
  });
});

describe("gun techniques (pp. 250-252)", () => {
  it("fires Close-Quarters Battle on a Move and Attack within Per yards", () => {
    on.gunTechniques = true;
    // Morton Locke: Per 12, Guns (SMG)-12, CQB (SMG)-15, a Tommy gun at Bulk -5.
    const actor = shooter({ items: [technique("Close-Quarters Battle (Submachine Gun)", 15)] });
    actor.system.maneuver = "moveAndAttack";
    const bulk = () => [{ label: "Bulk", value: -5, key: "bulk", situation: "moveAndAttack" }];
    expect(attack(tommy(), actor, { modifiers: bulk(), rangeYards: 12 }).modifiers).toContainEqual({ label: "GCC.HT.Shooting.CloseQuartersLine", value: 3 });
    expect(attack(tommy(), actor, { modifiers: bulk(), rangeYards: 13 }).modifiers).toHaveLength(1);
  });

  it("takes a gun TA's bought levels on a shot aimed where it aims", () => {
    on.gunTechniques = true;
    const ta = technique("TA (Rifle/Skull)", 9, { points: 3 });
    const actor = shooter({ items: [ta] });
    const shot = attack(mosin(), actor, { calledShot: { hitLocation: "skull", addonLocation: null, chink: false } });
    expect(shot.modifiers).toEqual([{ label: "TA (Rifle/Skull)", value: 2 }]);
    expect(attack(mosin(), actor, { calledShot: { hitLocation: "eye", addonLocation: null, chink: false } }).modifiers).toEqual([]);
    expect(attack(colt(), actor, { calledShot: { hitLocation: "skull", addonLocation: null, chink: false } }).modifiers).toEqual([]);
  });

  it("works a gun TA's level out as a technique kind", () => {
    on.gunTechniques = true;
    const kind = kinds.get("ht-targeted-attack");
    const helpers = { levelOf: (name: string) => (name === "Guns (Pistol)" ? 12 : null), standard: () => null };
    expect(kind.derive({ name: "TA (Pistol/Weapon)", system: { points: 99 } }, shooter(), helpers)).toMatchObject({ level: 10, levels: 2, cappedByPrerequisite: true });
    expect(kind.derive({ name: "TA (Rifle/Skull)", system: { points: 2 } }, shooter(), helpers)).toMatchObject({ level: null });
    expect(kind.derive({ name: "Targeted Attack", system: {} }, shooter(), helpers).notes).toEqual(["GCC.HT.Shooting.TaName"]);
    expect(kind.available()).toBe(true);
  });

  it("takes a targeted foe's gun apart with Instant Arsenal Disarm", async () => {
    on.gunTechniques = true;
    const pistol = colt();
    const foe = { id: "f1", uuid: "Actor.f1", name: "Hugo", attrs: { DX: 12 }, skills: {}, items: [pistol] };
    (globalThis as any).game.user.targets = new Set([{ actor: foe }]);
    const actor = shooter({ skills: { Judo: 13 } });
    const iad = technique("Instant Arsenal Disarm (Armoury (Small Arms))", 11);
    expect(rowActions.get("ht-instant-arsenal-disarm").visible(iad)).toBe(true);
    const contests = new Map<string, boolean>();
    expect(await instantArsenalDisarm(fakeApi() as never, iad, actor, contests)).toBe("disabled");
    expect(rolls[0]).toMatchObject({ base: 13, modifiers: [{ value: -4 }] });
    // The foe's side names the gun held onto (API 1.136.0).
    expect(rolls[1]).toMatchObject({ first: { base: 11 }, second: { base: 12, note: "DX", item: pistol }, tags: ["instantArsenalDisarm", "disarm"] });
    expect(malfunctions).toEqual([{ item: pistol.id, kind: `${MODULE_ID}.disassembled`, label: "GCC.HT.Shooting.Disassembled" }]);
    expect(unreadied).toEqual([]);

    contestOutcome = { outcome: "second", margin: 2 };
    expect(await instantArsenalDisarm(fakeApi() as never, iad, actor, contests)).toBe("unready");
    // Left unready in the foe's hands, through the GM where need be, with the contest as its proof.
    expect(unreadied).toEqual([{ item: pistol.id, unready: true, reason: "GCC.HT.Shooting.Iad", attacker: actor, contest: "m1" }]);
    contestOutcome = { outcome: "second", margin: 4 };
    expect(await instantArsenalDisarm(fakeApi() as never, iad, actor, contests)).toBe("intact");
    expect(unreadied).toHaveLength(1);
    rollOutcome = { success: false };
    expect(await instantArsenalDisarm(fakeApi() as never, iad, actor, contests)).toBe("missed");
  });
});

describe("the expanded Gunslinger (p. 249)", () => {
  it("ignores Bulk on Move and Attack and in close combat", () => {
    on.gunslinger = true;
    const actor = shooter({ items: [trait("Gunslinger")] });
    const moving = attack(tommy(), actor, { modifiers: [{ label: "Bulk", value: -5, key: "bulk", situation: "moveAndAttack" }] });
    expect(moving.modifiers[0].value).toBe(0);
    const close = attack(tommy(), actor, { modifiers: [{ label: "Bulk", value: -5, key: "bulk", situation: "closeCombat" }] });
    expect(close.modifiers[0].value).toBe(0);
    expect(attack(tommy(), shooter(), { modifiers: [{ label: "Bulk", value: -5, key: "bulk", situation: "closeCombat" }] }).modifiers[0].value).toBe(-5);
  });

  it("halves the default of the five techniques it names", () => {
    on.gunslinger = true;
    const actor = shooter({ items: [trait("Gunslinger")] });
    const context = fire(HOOKS.techniqueDefaults, { actor, item: { name: "Fast-Firing (Pistol)" }, defaults: [{ from: "skill", skill: "Guns (Pistol)", modifier: -4 }] });
    expect(context.defaults).toContainEqual({ from: "skill", skill: "Guns (Pistol)", modifier: -2 });
    const other = fire(HOOKS.techniqueDefaults, { actor, item: { name: "Precision Aiming (Rifle)" }, defaults: [{ from: "skill", skill: "Guns (Rifle)", modifier: -6 }] });
    expect(other.defaults).toHaveLength(1);
    expect(gunslingerDefault(switches, actor, "Fanning", -4)).toBe(-2);
    expect(gunslingerDefault(switches, shooter(), "Fanning", -4)).toBeNull();
    on.gunslinger = false;
    expect(gunslingerDefault(switches, actor, "Fanning", -4)).toBeNull();
  });
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    const pistol = deagle();
    weaponState.set(pistol.id, { pistolero: true });
    const actor = shooter({ items: [trait("Gunslinger"), technique("TA (Pistol/Skull)", 12, { points: 8 })] });
    const lines = [{ label: "Bulk", value: -4, key: "bulk", situation: "moveAndAttack" }, { label: "Accuracy", value: 3, key: "accuracy" }];
    const shot = attack(pistol, actor, { modifiers: lines.map((l) => ({ ...l })), calledShot: { hitLocation: "skull", addonLocation: null, chink: false } });
    expect(shot.modifiers).toEqual(lines);
    expect(row(pistol, actor).minSt).toBe(11);
    expect(options.get("ht-ranged-rapid-strike").available(optionContext(colt(), actor))).toBe(false);
  });
});

describe("Mounted Shooting (p. 251)", () => {
  const riding = (value: number, extra: Record<string, unknown> = {}) => [{ label: "Moving mount", value, key: "movingPlatform", platform: "mount", medium: "ground", ride: "rough", mounting: "handheld", ...extra }];

  it("keeps a rough ride from taking the skill below the technique's level", () => {
    on.gunTechniques = true;
    // Guns (Submachine Gun)-12 and Mounted Shooting (SMG/Motorcycle)-11: a -4 ride leaves -1.
    const actor = shooter({ items: [technique("Mounted Shooting (SMG/Motorcycle)", 11, { prerequisite: "Guns (Submachine Gun)" })] });
    const shot = attack(tommy(), actor, { modifiers: riding(-4) });
    expect(shot.modifiers[0]).toMatchObject({ value: -1, label: "GCC.HT.Shooting.MountedShootingLine {\"label\":\"Moving mount\"}" });
    // A penalty already above the floor is left alone.
    expect(attack(tommy(), actor, { modifiers: riding(-1) }).modifiers[0].value).toBe(-1);
  });

  it("counts only the technique for the vehicle the line names (API 1.141.0)", () => {
    on.gunTechniques = true;
    const actor = shooter({ items: [technique("Mounted Shooting (SMG/Motorcycle)", 11, { prerequisite: "Guns (Submachine Gun)" })] });
    const zundapp = { name: "Zündapp KS 750", system: { skill: "Driving (Motorcycle)" } };
    const jeep = { name: "Willys MB", system: { skill: "Driving (Automobile)" } };
    const aboard = (vehicle: any) => riding(-4, { platform: "vehicle", vehicle });
    const onBike = attack(tommy(), actor, { modifiers: aboard(zundapp) }).modifiers[0];
    expect(onBike).toMatchObject({ value: -1, label: expect.stringContaining("MountedShootingVehicleLine") });
    expect(onBike.label).toContain("Zündapp KS 750");
    expect(attack(tommy(), actor, { modifiers: aboard(jeep) }).modifiers[0].value).toBe(-4);
    // Two techniques: the one for this vehicle.
    const both = shooter({ items: [
      technique("Mounted Shooting (SMG/Automobile)", 9, { prerequisite: "Guns (Submachine Gun)" }),
      technique("Mounted Shooting (SMG/Motorcycle)", 11, { prerequisite: "Guns (Submachine Gun)" }),
    ] });
    expect(attack(tommy(), both, { modifiers: aboard(zundapp) }).modifiers[0].value).toBe(-1);
    expect(attack(tommy(), both, { modifiers: aboard(jeep) }).modifiers[0].value).toBe(-3);
  });

  it("does nothing at its default, for another weapon skill, or for a weapon on a mount", () => {
    on.gunTechniques = true;
    const atDefault = shooter({ items: [technique("Mounted Shooting (SMG/Motorcycle)", 8, { prerequisite: "Guns (Submachine Gun)" })] });
    expect(attack(tommy(), atDefault, { modifiers: riding(-6) }).modifiers[0].value).toBe(-6);
    const pistolOnly = shooter({ items: [technique("Mounted Shooting (Pistol/Horse)", 14, { prerequisite: "Guns (Pistol)" })] });
    expect(attack(tommy(), pistolOnly, { modifiers: riding(-6) }).modifiers[0].value).toBe(-6);
    const trained = shooter({ items: [technique("Mounted Shooting (SMG/Jeep)", 12, { prerequisite: "Guns (Submachine Gun)" })] });
    expect(attack(tommy(), trained, { modifiers: riding(-6, { platform: "vehicle", mounting: "openMount" }) }).modifiers[0].value).toBe(-6);
    on.gunTechniques = false;
    expect(attack(tommy(), trained, { modifiers: riding(-6) }).modifiers[0].value).toBe(-6);
  });
});

describe("Zen Marksmanship (p. 250)", () => {
  it("registers a zen skill for each specialty, offered only while its switch is on", () => {
    expect(zenSkills.map((z) => z.skill)).toEqual([
      "Zen Marksmanship (Gyroc)", "Zen Marksmanship (Musket)", "Zen Marksmanship (Pistol)", "Zen Marksmanship (Rifle)",
      "Zen Marksmanship (Shotgun)", "Zen Marksmanship (Submachine Gun)", "Zen Marksmanship (Beam Pistol)", "Zen Marksmanship (Beam Rifle)",
    ]);
    const pistol = zenSkills.find((z) => z.skill === "Zen Marksmanship (Pistol)");
    expect(pistol).toMatchObject({ module: MODULE_ID, key: "ht-zen-pistol", covers: ["Guns (Pistol)"] });
    expect(zenSkills.find((z) => z.key === "ht-zen-beam-rifle").covers).toEqual(["Beam Weapons (Rifle)"]);
    // The system's own matching: a specialty covers the skill with its TL.
    expect(rules.zenSkillCovers(pistol.covers, "Guns/TL8 (Pistol)")).toBe(true);
    expect(rules.zenSkillCovers(pistol.covers, "Guns/TL8 (Rifle)")).toBe(false);
    expect(pistol.available(shooter())).toBe(false);
    on.zenMarksmanship = true;
    expect(pistol.available(shooter())).toBe(true);
  });
});
