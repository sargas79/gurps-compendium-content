/**
 * The tools as the system meets them: a kit for another specialty through
 * `data.registerToolGrade`, prices, a tool's work as a derived row, the Ready
 * maneuvers a rescue tool takes, the chainsaw's rows and mishaps, the nail
 * gun's -4, the glass cutter and duct tape, and the household hazards -- with
 * only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyTools, toolData, wrongKitGrade } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  afterDamage: "gworld.afterDamage",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  armorDr: "gworld.armorDr",
  poisonCycle: "gworld.poisonCycle",
  detectionModifiers: "gworld.detectionModifiers",
};

let hooks: Map<string, Listener[]>;
let derived: Map<string, any>;
let actions: Map<string, any>;
let cards: Map<string, any>;
let prices: any[];
let poisons: any[];
let damage: any[];
let successes: any[];
let posted: any[];
let chat: string[];
let weaponState: Map<any, any>;
let on: Record<string, boolean>;
let dieRoll: number;
let successResult: any;
let dialogAnswer: any;
let targets: any[];
let needsEquipment: any[];
let graders: any[];
let applied: any[];
let appliedResult: any;
let falls: any[];

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (key: string) => key === "equipmentModifiers" },
    data: {
      hooks: { skillBonuses: "gworld.skillBonuses", objectStats: "gworld.objectStats" },
      registerPriceModifier: (m: any) => prices.push(m),
      registerPoison: (p: any) => poisons.push(p),
      registerNeedsEquipment: (r: any) => { needsEquipment.push(r); return `${r.module}.${r.key}`; },
      registerToolGrade: (r: any) => { graders.push(r); return `${r.module}.${r.key}`; },
    },
    combat: {
      hooks: HOOKS,
      registerDerivedAttackMode: (m: any) => derived.set(m.key, m),
      getWeaponState: (item: any) => weaponState.get(item),
      setWeaponState: async (item: any, _m: string, patch: any) => { weaponState.set(item, { ...weaponState.get(item), ...patch }); },
    },
    sheets: {
      registerSheetSection: () => undefined,
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, options: any) => { posted.push({ key, data, options }); },
      update: async () => true,
    },
    actors: {
      conditions: (actor: any) => actor?.conditionList ?? [],
      removeCondition: async (actor: any, id: string) => { actor.conditionList = (actor.conditionList ?? []).filter((c: any) => c.id !== id); },
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    },
    items: { applyDamage: async (o: any) => { applied.push(o); return appliedResult; } },
    hazards: { fall: async (actor: any, o: any) => { falls.push({ actor, ...o }); return 0; } },
    roll: {
      damage: async (o: any) => { damage.push(o); return 0; },
      success: async (o: any) => { successes.push(o); return successResult; },
    },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function equipment(name: string, tool: Record<string, unknown> = {}, more: Record<string, any> = {}): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    system: { tl: "7", carried: true, forSkills: [], meleeModes: [], rangedModes: [], extensions: { [MODULE_ID]: { tool } }, ...more },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

const worker = (items: any[] = [], more: Record<string, any> = {}) => ({ name: "Worker", uuid: "Actor.worker", isOwner: true, items, attributes: { ST: 12, DX: 11 }, skills: {}, ...more });

const helpers = { skillLevel: (name: string) => (name === "Forced Entry" ? 13 : null), attribute: (key: string) => (key === "DX" ? 11 : 12), damage: (base: string, modifier: number) => `${base === "sw" ? "1d+2" : "1d-1"}${modifier ? `[${modifier}]` : ""}`, rows: (item: any) => ({ melee: item.rows ?? [], ranged: [] }) };

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyTools(fakeApi() as never, { kits: rule("toolKits"), forcedEntry: rule("forcedEntryTools"), chainsaws: rule("chainsaws"), hazards: rule("householdHazards") });
}

function attack(item: any, actor: any, mode: Record<string, unknown> = { index: 0, ranged: false }): any {
  return fire(HOOKS.attackModifiers, { actor, item, mode, modifiers: [], refusal: null });
}

beforeEach(() => {
  hooks = new Map();
  derived = new Map();
  actions = new Map();
  cards = new Map();
  prices = [];
  poisons = [];
  damage = [];
  successes = [];
  posted = [];
  chat = [];
  weaponState = new Map();
  on = {};
  dieRoll = 1;
  successResult = { success: true, criticalFailure: false };
  dialogAnswer = null;
  targets = [];
  needsEquipment = [];
  graders = [];
  applied = [];
  appliedResult = null;
  falls = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets); } },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class { total = 0; async evaluate() { this.total = dieRoll; return this; } });
  vi.stubGlobal("fromUuid", async (uuid: string) => (uuid === "Actor.captive" ? { name: "Captive", uuid, attributes: { ST: 13 }, skills: { Escape: 12 } } : null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Flags on a test item, as Foundry keeps them. */
function flagged(item: any): any {
  const flags: Record<string, unknown> = {};
  item.getFlag = (_scope: string, key: string) => flags[key];
  item.setFlag = async (_scope: string, key: string, value: unknown) => { flags[key] = value; };
  return item;
}

describe("rescue tools (High-Tech pp. 29-30)", () => {
  beforeEach(() => { on = { forcedEntryTools: true }; ready(); });

  it("puts a flamethrower's fuel out on TL+2 or less, a burst each, and leaves thermite and the system's burning be", async () => {
    const small = flagged(equipment("Fire Extinguisher, Small", {}, { tl: "6" }));
    const firefighter = worker([small]);
    const fuel = { id: `${MODULE_ID}.ht-flame-burning` };
    const soaked: any = { name: "Soaked", isOwner: true, conditionList: [fuel], statuses: new Set() };
    const alight: any = { name: "Alight", isOwner: true, conditionList: [{ id: `${MODULE_ID}.ht-thermite-burning` }], statuses: new Set(["burning"]) };
    targets = [{ actor: soaked }, { actor: alight }];
    expect(actions.get("ht-extinguisher").visible(small)).toBe(true);
    dieRoll = 8;
    actions.get("ht-extinguisher").run(small, firefighter);
    await flush();
    expect(soaked.conditionList).toEqual([]);
    expect(chat.at(-1)).toContain("Extinguisher.PutOut {");
    expect(chat.at(-1)).toContain("Extinguisher.PutOutGm");
    expect(chat.at(-1)).toContain("Extinguisher.BurnsOn");
    expect(small.getFlag(MODULE_ID, "htBurstsUsed")).toBe(2);
    // A 9 misses at TL6; and the eight bursts run out.
    soaked.conditionList = [fuel];
    targets = [{ actor: soaked }];
    dieRoll = 9;
    actions.get("ht-extinguisher").run(small, firefighter);
    await flush();
    expect(soaked.conditionList).toEqual([fuel]);
    expect(chat.at(-1)).toContain("Extinguisher.Missed");
    await small.setFlag(MODULE_ID, "htBurstsUsed", 8);
    actions.get("ht-extinguisher").run(small, firefighter);
    await flush();
    expect(chat.at(-1)).toContain("Extinguisher.Empty");
    expect(actions.get("ht-extinguisher").visible(equipment("Spanner Wrench"))).toBe(false);
  });

  it("gives whoever is inside a fire shelter DR 10 against burning, and nothing else", async () => {
    const shelter = flagged(equipment("Fire Shelter"));
    const ranger = worker([shelter]);
    const armor = (damageType: string) => fire(HOOKS.armorDr, { actor: ranger, damageType, lines: [] }).lines;
    expect(armor("burn")).toEqual([]);
    actions.get("ht-fire-shelter").run(shelter, ranger);
    await flush();
    expect(armor("burn")).toEqual([expect.objectContaining({ dr: 10, applies: true, source: "armor", label: "Fire Shelter" })]);
    expect(armor("cut")).toEqual([]);
    actions.get("ht-fire-shelter").run(shelter, ranger);
    await flush();
    expect(armor("burn")).toEqual([]);
  });
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const hacksaw = equipment("Hacksaw", { work: { damage: "sw-3", type: "cut", divisor: 2 } });
    const kit = equipment("Portable Tool Kit", { kit: "portable" }, { forSkills: ["Mechanic (Automobile)"] });
    expect(derived.get("ht-tool-work").applies(hacksaw)).toBe(false);
    expect(graders[0].grade(kit, { name: "Mechanic/TL7 (Motorcycle)" }, worker([kit]))).toBeNull();
    expect(prices[0].apply(equipment("Easel Kit", { kit: "portable", lightCraft: true }), { cost: 600, weight: 20 })).toBeNull();
    expect(actions.get("ht-hazard").visible(equipment("Toaster", { hazard: { kind: "burn", damage: "1d-3" } }))).toBe(false);
    expect(poisons[0].available()).toBe(false);
  });
});

describe("tool kits (High-Tech p. 24)", () => {
  beforeEach(() => { on = { toolKits: true }; ready(); });

  it("grades another specialty's portable kit at -2 for the system to weigh (API 1.145.0)", () => {
    const [grader] = graders;
    expect(grader).toMatchObject({ module: MODULE_ID, key: "ht-wrong-kit" });
    const auto = equipment("Portable Tool Kit", { kit: "portable" }, { forSkills: ["Mechanic (Automobile)"] });
    expect(grader.grade(auto, { name: "Mechanic/TL7 (Motorcycle)" }, worker([auto]))).toEqual({ modifier: -2 });
    // Its own specialty, an unrelated skill, a mini-tool kit and gear that isn't a kit are left to the system.
    expect(grader.grade(auto, { name: "Mechanic/TL7 (Automobile)" }, worker([auto]))).toBeNull();
    expect(grader.grade(auto, { name: "Electrician/TL7" }, worker([auto]))).toBeNull();
    const moto = equipment("Mini-Tool Kit", { kit: "mini" }, { forSkills: ["Mechanic (Motorcycle)"] });
    expect(grader.grade(moto, { name: "Mechanic/TL7 (Automobile)" }, worker([moto]))).toBeNull();
    expect(grader.grade(equipment("Hacksaw", {}, { forSkills: ["Mechanic (Automobile)"] }), { name: "Mechanic (Motorcycle)" }, worker())).toBeNull();
    on = {};
    expect(grader.grade(auto, { name: "Mechanic/TL7 (Motorcycle)" }, worker([auto]))).toBeNull();
    expect(wrongKitGrade(fakeApi() as never, auto, "Mechanic (Motorcycle)")).toEqual({ modifier: -2 });
  });

  it("marks the repair skills as needing a kit, for the system's no-equipment line (API 1.135.0)", () => {
    const [needs] = needsEquipment;
    expect(needs).toMatchObject({ module: MODULE_ID, key: "ht-repair-kits" });
    expect(needs.test({ name: "Mechanic/TL7 (Automobile)" }, worker())).toBe(true);
    expect(needs.test({ name: "Electronics Repair/TL8 (Computers)" }, worker())).toBe(true);
    expect(needs.test({ name: "Armoury/TL6 (Small Arms)" }, worker())).toBe(true);
    expect(needs.test({ name: "Carpentry" }, worker())).toBe(false);
    on = {};
    expect(needs.test({ name: "Machinist/TL7" }, worker())).toBe(false);
  });

  it("gives a workshop its close and distant crafts", () => {
    const [grader] = graders;
    const smithy = equipment("Workshop", { kit: "workshop", closeCrafts: "Machinist", distantCrafts: "Carpentry" }, { forSkills: ["Smith (Iron)"] });
    expect(grader.grade(smithy, { name: "Machinist/TL5" }, worker([smithy]))).toEqual({ modifier: -2 });
    expect(grader.grade(smithy, { name: "Carpentry" }, worker([smithy]))).toEqual({ modifier: -5 });
    expect(grader.grade(smithy, { name: "Cooking" }, worker([smithy]))).toBeNull();
  });

  it("reprices a light craft's kit and a large vehicle's", () => {
    const [price] = prices;
    expect(price.apply(equipment("Easel Kit", { kit: "portable", lightCraft: true }), { cost: 600, weight: 20 })).toMatchObject({ cost: 150, weight: 2 });
    expect(price.apply(equipment("Workshop", { kit: "workshop", vehicleTons: 2000 }), { cost: 15000, weight: 2000 })).toMatchObject({ cost: 3000000, weight: 400000 });
    expect(price.apply(equipment("Workshop", { kit: "workshop" }), { cost: 15000, weight: 2000 })).toBeNull();
  });
});

describe("forced-entry tools (High-Tech pp. 25-30)", () => {
  beforeEach(() => { on = { forcedEntryTools: true }; ready(); });

  it("gives a working tool a Forced Entry row with its damage per second and what it works on", () => {
    const hacksaw = equipment("Hacksaw", { work: { damage: "sw-3", type: "cut", divisor: 2, every: 1, against: "metalBars", carbideBonus: 1 } });
    const mode = derived.get("ht-tool-work");
    expect(mode.applies(hacksaw)).toBe(true);
    expect(mode.applies(equipment("Hammer"))).toBe(false);
    const row = mode.mode(hacksaw, null, helpers);
    expect(row).toMatchObject({ skillName: "Forced Entry", skillLevel: 13, damage: "1d+2[-3]", damageType: "cut", armorDivisor: 2, reach: "C" });
    expect(row.notes[0].label).toContain("GCC.HT.Tools.WorkAgainst");
    hacksaw.system.extensions[MODULE_ID].tool.carbide = true;
    expect(mode.mode(hacksaw, null, helpers).damage).toBe("1d+2[-2]");
  });

  it("notes the bolt cutters' ST roll, and doubles the lock buster's blow", () => {
    const mode = derived.get("ht-tool-work");
    const cutters = equipment("Bolt Cutters, Heavy", { work: { damage: "12d", type: "cut", divisor: 2, every: 0, stRoll: 4 } });
    const row = mode.mode(cutters, null, { ...helpers, skillLevel: () => null });
    expect(row).toMatchObject({ damage: "12d", skillLevel: 6, damageRollable: true });
    expect(row.notes.map((n: any) => n.label)).toContain('GCC.HT.Tools.StRollNote {"modifier":"+4"}');
    const buster = equipment("Lock Buster", { work: { damage: "sw+4", type: "cr", every: 0, multiplier: 2, against: "padlock" } });
    expect(mode.mode(buster, null, { ...helpers, damage: () => "2d+5" }).damage).toBe("2d+5x2");
  });

  it("refuses a door opener's use until it is pumped three times, then starts again", async () => {
    const opener = equipment("Hydraulic Door Opener", { readies: 3 });
    const actor = worker([opener]);
    expect(attack(opener, actor).refusal).toContain("ReadiesRefusal");
    for (let i = 0; i < 3; i += 1) {
      actions.get("ht-tool-ready").run(opener, actor);
      await flush();
    }
    expect(chat.at(-1)).toContain("ReadyDone");
    expect(attack(opener, actor).refusal).toBeNull();
    fire(HOOKS.afterSuccessRoll, { actor, item: opener, tags: ["attack"], outcome: { success: true } });
    await flush();
    expect(attack(opener, actor).refusal).toContain("ReadiesRefusal");
  });

  it("keeps the Ready count when the attack is refused after the tool allowed it", async () => {
    const opener = equipment("Hydraulic Door Opener", { readies: 3 });
    const actor = worker([opener]);
    for (let i = 0; i < 3; i += 1) {
      actions.get("ht-tool-ready").run(opener, actor);
      await flush();
    }
    // Refused below skill 3: no gworld.afterSuccessRoll follows.
    expect(attack(opener, actor).refusal).toBeNull();
    await flush();
    expect(attack(opener, actor).refusal).toBeNull();
    // Another roll the actor makes isn't the attack.
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["skill"], outcome: { success: true } });
    await flush();
    expect(attack(opener, actor).refusal).toBeNull();
    fire(HOOKS.afterSuccessRoll, { actor, item: opener, tags: ["attack"], outcome: { success: false } });
    await flush();
    expect(attack(opener, actor).refusal).toContain("ReadiesRefusal");
  });

  it("lets a ST 20 wielder swing the hand ram without the Ready maneuvers, and only on its ram mode", () => {
    const ram = equipment("Hand Ram", { readies: 2, readiesWaivedAtSt: 20 });
    expect(attack(ram, worker([ram])).refusal).toContain("ReadiesRefusal");
    expect(attack(ram, worker([ram], { attributes: { ST: 20 } })).refusal).toBeNull();
    expect(attack(ram, worker([ram]), { index: 1, ranged: false }).refusal).toBeNull();
  });

  it("rolls the glass cutter at -6 unless cinematic, and cuts the hand on a critical failure", async () => {
    const cutter = equipment("Glass Cutter", { use: "glassCutter" });
    const actor = worker([cutter], { skills: { "Forced Entry": 13 } });
    dialogAnswer = { cinematic: false };
    successResult = { success: false, criticalFailure: true };
    actions.get("ht-glass-cutter").run(cutter, actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 13, skill: "Forced Entry", modifiers: [{ value: -6 }] });
    expect(damage[0]).toMatchObject({ formula: "1d-2", damageType: "cut", calledShot: { hitLocation: "hand" } });
  });

  it("tapes up the targeted prisoner, who breaks free with the better of ST-3 and Escape", async () => {
    const tape = equipment("Duct Tape (60-yard roll)", { use: "ductTape" });
    const actor = worker([tape]);
    targets = [{ actor: { name: "Captive", uuid: "Actor.captive" } }];
    actions.get("ht-duct-tape").run(tape, actor);
    await flush();
    expect(posted[0]).toMatchObject({ key: `${MODULE_ID}.ht-duct-tape`, data: { captiveUuid: "Actor.captive" } });
    await cards.get("ht-duct-tape").actions.breakFree({ message: {}, data: posted[0].data });
    expect(successes[0]).toMatchObject({ base: 12, skill: "Escape" });
  });
});

describe("chainsaws and nail guns (High-Tech pp. 27-28)", () => {
  const saw = (tool: Record<string, unknown> = {}, tl = "7") => {
    const item = equipment(`Chainsaw (TL${tl})`, { use: "chainsaw", ...tool }, { tl, meleeModes: [{ skill: "Two-Handed Axe/Mace" }] });
    item.rows = [{ damage: "2d+1", damageType: "cut", reach: "1" }];
    item.actor = worker([item]);
    return item;
  };

  beforeEach(() => { on = { chainsaws: true }; ready(); });

  it("gives a rescue row and a hard-material row at (0.5), and only the rescue row with a carbide chain", () => {
    const ordinary = saw();
    expect(derived.get("ht-chainsaw-rescue").mode(ordinary, null, helpers)).toMatchObject({ skillName: "Forced Entry", damage: "2d+1", armorDivisor: 1 });
    expect(derived.get("ht-chainsaw-hard").mode(ordinary, null, helpers)).toMatchObject({ skillName: "Forced Entry", damage: "2d+1", armorDivisor: 0.5 });
    const carbide = saw({ carbide: true });
    expect(derived.get("ht-chainsaw-hard").applies(carbide)).toBe(false);
    expect(derived.get("ht-chainsaw-rescue").applies(carbide)).toBe(true);
    expect(prices[0].apply(carbide, { cost: 150, weight: 13 })).toMatchObject({ cost: 300, weight: 13 });
  });

  it("stalls on a blow from the hard row that got nowhere, refuses to cut, and restarts", async () => {
    const item = saw();
    dieRoll = 4;
    fire(HOOKS.afterDamage, { item, mode: { index: 0, ranged: false, derived: `${MODULE_ID}.ht-chainsaw-hard` }, result: { penetrating: 0 } });
    await flush();
    expect(chat.at(-1)).toContain("MishapStall");
    expect(attack(item, item.actor).refusal).toContain("StalledRefusal");
    expect(actions.get("ht-chainsaw-fix").visible(item)).toBe(true);
    actions.get("ht-chainsaw-fix").run(item, item.actor);
    await flush();
    expect(attack(item, item.actor).refusal).toBeNull();
  });

  it("leaves a blow that penetrated, or one from another row, alone", async () => {
    const item = saw();
    dieRoll = 6;
    fire(HOOKS.afterDamage, { item, mode: { index: 0, ranged: false, derived: `${MODULE_ID}.ht-chainsaw-hard` }, result: { penetrating: 3 } });
    fire(HOOKS.afterDamage, { item, mode: { index: 0, ranged: false }, result: { penetrating: 0 } });
    await flush();
    expect(chat).toEqual([]);
  });

  it("snaps the chain on a 6: at TL7 it lashes the wielder, at TL8 it only breaks the saw", async () => {
    dieRoll = 6;
    const tl7 = saw();
    actions.get("ht-chainsaw-bind").run(tl7, tl7.actor);
    await flush();
    expect(damage[0]).toMatchObject({ formula: "1d", damageType: "cut" });
    expect(attack(tl7, tl7.actor).refusal).toContain("SnappedRefusal");
    const tl8 = saw({}, "8");
    actions.get("ht-chainsaw-bind").run(tl8, tl8.actor);
    await flush();
    expect(damage).toHaveLength(1);
    expect(chat.at(-1)).toContain("MishapSnapBreaks");
  });

  it("notes the divisor on the combat row, and takes -4 off a nail gun unless fired at default", () => {
    const item = saw();
    const combat = { kind: "melee", row: { notes: [] as any[] } };
    fire(HOOKS.weaponAttacks, { item, rows: [combat] });
    expect(combat.row.notes[0].label).toContain("HardCombatNote");
    const nailer = equipment("Pneumatic Nail Gun", { use: "nailGun" });
    const trained = { kind: "ranged", row: { skillLevel: 14, atDefault: false, notes: [] } };
    const untrained = { kind: "ranged", row: { skillLevel: 7, atDefault: true, notes: [] } };
    fire(HOOKS.weaponAttacks, { item: nailer, rows: [trained, untrained] });
    expect(trained.row.skillLevel).toBe(10);
    expect(untrained.row.skillLevel).toBe(7);
  });
});

describe("household hazards (High-Tech pp. 31-33)", () => {
  beforeEach(() => { on = { householdHazards: true }; ready(); });

  it("bursts a propane cylinder into a burning explosion with 1d fragments", async () => {
    const tank = equipment("Propane Cylinder, Large", { hazard: { kind: "explosion", damage: "6dx5" } });
    actions.get("ht-hazard").run(tank, worker([tank]));
    await flush();
    expect(damage[0]).toMatchObject({ formula: "6dx5", damageType: "burn", explosive: true, fragmentation: "1d" });
  });

  it("asks how hot a stove is, and lets a microwave's point through any DR", async () => {
    const stove = equipment("Cast-Iron Cook Stove", { hazard: { kind: "burn", damage: "1d-1", upTo: "2d", perSecond: true } });
    dialogAnswer = { dice: "1d+2" };
    actions.get("ht-hazard").run(stove, worker([stove]));
    await flush();
    expect(damage[0]).toMatchObject({ formula: "1d+2", damageType: "burn" });
    const microwave = equipment("Microwave", { hazard: { kind: "injury", damage: "1", perSecond: true } });
    actions.get("ht-hazard").run(microwave, worker([microwave]));
    await flush();
    expect(damage[1]).toMatchObject({ formula: "1", ignoresDr: true, noKnockback: true });
  });

  it("registers lead, and names the worse symptoms past half the victim's HP", async () => {
    expect(poisons[0]).toMatchObject({ key: "leadPoisoning", label: "GCC.HT.Tools.LeadPoison", poison: { resistanceModifier: -4, damage: "toxic" } });
    expect(poisons[0].available()).toBe(true);
    const victim = { name: "Explorer", isOwner: true };
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.leadPoisoning`, symptomsNow: ["1/3"] });
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.tearGas`, symptomsNow: ["1/2"] });
    await flush();
    expect(chat).toEqual([]);
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.leadPoisoning`, symptomsNow: ["1/2"] });
    await flush();
    expect(chat).toHaveLength(1);
  });

  it("counts lead's failed rolls: the second, and each after, intensifies the symptoms", async () => {
    const victim = flagged({ name: "Explorer", isOwner: true });
    victim.unsetFlag = async () => { await victim.setFlag(MODULE_ID, "htLeadCourse", undefined); };
    const cycle = (resisted: boolean | null, symptomsNow: string[] = [], finished = false) =>
      fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.leadPoisoning`, resisted, symptomsNow, finished });
    cycle(false);
    await flush();
    expect(chat).toEqual([]);
    cycle(true, ["1/2"]);
    await flush();
    expect(chat.at(-1)).toContain("LeadWorse");
    cycle(false);
    await flush();
    expect(chat.at(-1)).toContain('LeadIntensifies {"name":"Explorer","failed":2}');
    cycle(false, [], true);
    await flush();
    expect(chat.at(-1)).toContain('"failed":3');
    expect(victim.getFlag(MODULE_ID, "htLeadCourse")).toBeUndefined();
  });

  it("ruptures a struck cylinder through its DR 6 with anything but crushing, a fireball only near a flame", async () => {
    const tank = flagged(equipment("Propane Cylinder, Small", { hazard: { kind: "explosion", damage: "4dx2" } }));
    const actor = worker([tank]);
    expect(actions.get("ht-propane-strike").visible(tank)).toBe(true);
    expect(fire("gworld.objectStats", { item: tank, dr: 0, notes: [] }).dr).toBe(6);
    // A crushing blow that gets through doesn't rupture it.
    dialogAnswer = { damage: 10, type: "cr", divisor: 1, flame: true };
    appliedResult = { penetrating: 4 };
    actions.get("ht-propane-strike").run(tank, actor);
    await flush();
    expect(applied[0]).toMatchObject({ item: tank, damage: 10, type: "cr" });
    expect(chat.at(-1)).toContain("Propane.Holds");
    expect(damage).toEqual([]);
    // A bullet through it, with no flame near: the gas escapes.
    dialogAnswer = { damage: 10, type: "pi", divisor: 1, flame: false };
    actions.get("ht-propane-strike").run(tank, actor);
    await flush();
    expect(chat.at(-1)).toContain("Propane.Vents");
    // Near a flame: the fireball.
    dialogAnswer = { damage: 10, type: "pi", divisor: 1, flame: true };
    actions.get("ht-propane-strike").run(tank, actor);
    await flush();
    expect(damage[0]).toMatchObject({ formula: "4dx2", damageType: "burn", explosive: true, fragmentation: "1d" });
    // Stopped by the DR.
    appliedResult = { penetrating: 0 };
    actions.get("ht-propane-strike").run(tank, actor);
    await flush();
    expect(chat.at(-1)).toContain("Propane.Holds");
    expect(damage).toHaveLength(1);
  });
});

describe("torches, the doorbuster and lifting gear (High-Tech pp. 25-30)", () => {
  beforeEach(() => { on = { forcedEntryTools: true }; ready(); });

  it("burns a cutting torch's 30 seconds a second at a time, refuses once out, and refills", async () => {
    const torch = flagged(equipment("Cutting Torch", { work: { damage: "1d+3", type: "burn", divisor: 2 }, supply: { kind: "seconds", amount: 30, refill: "bottle" } }));
    const actor = worker([torch]);
    await torch.setFlag(MODULE_ID, "htSupplyUsed", 29);
    expect(attack(torch, actor).refusal).toBeNull();
    fire(HOOKS.afterSuccessRoll, { actor, item: torch, tags: ["attack"], outcome: { success: true } });
    await flush();
    expect(torch.getFlag(MODULE_ID, "htSupplyUsed")).toBe(30);
    expect(attack(torch, actor).refusal).toContain("Supply.secondsRefusal");
    actions.get("ht-tool-refill").run(torch, actor);
    await flush();
    expect(torch.getFlag(MODULE_ID, "htSupplyUsed")).toBe(0);
    expect(chat.at(-1)).toContain("Supply.Refilled");
    expect(attack(torch, actor).refusal).toBeNull();
  });

  it("fires the doorbuster's strip a shot a blow, and spends nothing on another roll", async () => {
    const buster = flagged(equipment("Doorbuster", { supply: { kind: "shots", amount: 10, refill: "strip" } }));
    const actor = worker([buster]);
    attack(buster, actor);
    fire(HOOKS.afterSuccessRoll, { actor, tags: ["skill"], outcome: { success: true } });
    await flush();
    expect(buster.getFlag(MODULE_ID, "htSupplyUsed")).toBeUndefined();
    fire(HOOKS.afterSuccessRoll, { actor, item: buster, tags: ["attack"], outcome: { success: false } });
    await flush();
    expect(buster.getFlag(MODULE_ID, "htSupplyUsed")).toBe(1);
    expect(actions.get("ht-tool-refill").visible(equipment("Hacksaw"))).toBe(false);
  });

  it("says whether a jack lifts a load, and how a spreader's Arm ST lifts or shifts one", async () => {
    const jack = equipment("Jack", { lift: { lbs: 8000 } });
    dialogAnswer = 6000;
    actions.get("ht-tool-lift").run(jack, worker([jack]));
    await flush();
    expect(chat.at(-1)).toContain("Lift.lifts");
    dialogAnswer = 9000;
    actions.get("ht-tool-lift").run(jack, worker([jack]));
    await flush();
    expect(chat.at(-1)).toContain("Lift.tooHeavy");
    // Arm ST 36: BL 259, lifts 2,074 lbs., shifts 12,960.
    const spreader = equipment("Rescue Spreader/Cutter (TL7)", { lift: { st: 36 } });
    dialogAnswer = 10000;
    actions.get("ht-tool-lift").run(spreader, worker([spreader]));
    await flush();
    expect(chat.at(-1)).toContain("Lift.shifts");
  });

  it("sounds a worn firefighter alert, set off or its wearer out cold: +4 to Hearing to find him", async () => {
    const alert = flagged(equipment("Firefighter Alert System", {}, { equipped: true }));
    const wearer: any = { name: "Firefighter", items: [alert], statuses: new Set() };
    const listen = (subject: any) => fire(HOOKS.detectionModifiers, { subject, sense: "hearing", modifiers: [] }).modifiers;
    expect(listen(wearer)).toEqual([]);
    wearer.statuses.add("unconscious");
    expect(listen(wearer).map((m: any) => m.value)).toEqual([4]);
    expect(fire(HOOKS.detectionModifiers, { subject: wearer, sense: "vision", modifiers: [] }).modifiers).toEqual([]);
    wearer.statuses.clear();
    actions.get("ht-firefighter-alert").run(alert, wearer);
    await flush();
    expect(listen(wearer).map((m: any) => m.value)).toEqual([4]);
    alert.system.equipped = false;
    expect(listen(wearer)).toEqual([]);
  });

  it("drops a Stokes litter's occupant with DR 5 off the fall", async () => {
    const litter = equipment("Stokes Litter");
    const casualty = { name: "Casualty", isOwner: true };
    targets = [{ actor: casualty }];
    dialogAnswer = { yards: 3, soft: false };
    actions.get("ht-stokes-litter").run(litter, worker([litter]));
    await flush();
    expect(falls[0]).toMatchObject({ actor: casualty, yards: 3, onto: "hard", modifiers: [{ value: -5 }] });
  });
});

describe("the records' data", () => {
  it("reads a tool's data with nothing missing", () => {
    expect(toolData(equipment("Saw", { work: { damage: "sw-2", type: "cut", divisor: 2 } })).work).toMatchObject({ every: 1, multiplier: 1, stRoll: null });
    expect(toolData({})).toMatchObject({ kit: "", use: "", work: null, hazard: null });
  });
});
