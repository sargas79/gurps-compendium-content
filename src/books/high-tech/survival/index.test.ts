/**
 * The survival, maritime and parachuting gear and the snacks as the system
 * meets them: the cold roll, the contagion roll and Swimming through
 * `gworld.successRollModifiers`, a kit for another environment through
 * `gworld.skillBonuses`, signals through `gworld.detectionModifiers`, swim
 * fins through `gworld.moveModifiers`, Death from Above as an attack option,
 * and the row actions -- with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { campingLine, parachutingLevel, readySurvival, survivalData, survivalKitEquipment } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  detectionModifiers: "gworld.detectionModifiers",
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let options: Map<string, any>;
let cards: Map<string, any>;
let prices: any[];
let damage: any[];
let successes: any[];
let contests: any[];
let injuries: any[];
let conditions: any[];
let posted: any[];
let updated: any[];
let chat: string[];
let on: Record<string, boolean>;
let successResult: any;
let contestResult: any;
let dialogAnswer: any;
let targets: any[];
let worldTime: number;

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (key: string) => key === "equipmentModifiers" },
    data: {
      hooks: { skillBonuses: "gworld.skillBonuses", moveModifiers: "gworld.moveModifiers" },
      registerPriceModifier: (m: any) => prices.push(m),
    },
    combat: {
      hooks: HOOKS,
      registerAttackOption: (o: any) => options.set(o.key, o),
    },
    sheets: {
      registerSheetSection: () => undefined,
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, opts: any) => { posted.push({ key, data, options: opts }); },
      update: async (message: any, data: any) => { updated.push({ message, data }); return true; },
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      encumbrance: (actor: any) => ({ carriedWeight: actor?.carried ?? 0 }),
      applyInjury: async (actor: any, o: any) => { injuries.push({ actor, ...o }); return { pool: "fp" }; },
      spendFatigue: async (actor: any, fp: number, o: any = {}) => { injuries.push({ actor, amount: fp, spent: true, ...o }); return { fpLost: fp }; },
      restoreFatigue: async (actor: any, fp: number, o: any = {}) => { injuries.push({ actor, restored: fp, ...o }); return { from: 5, to: 5 + fp, max: 10 }; },
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor, ...c }); return "id"; },
      derived: (actor: any) => actor?.derived ?? null,
    },
    roll: {
      damage: async (o: any) => { damage.push(o); return 0; },
      success: async (o: any) => { successes.push(o); return successResult; },
      quickContest: async (o: any) => { contests.push(o); return contestResult; },
    },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function gear(name: string, survival: Record<string, unknown>, more: Record<string, any> = {}): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    system: { tl: "7", carried: true, equipped: false, quantity: 1, equipmentQuality: "basic", forSkills: [], extensions: { [MODULE_ID]: { survival } }, ...more },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

function person(items: any[] = [], more: Record<string, any> = {}): any {
  const flags: Record<string, unknown> = { ...(more.flags ?? {}) };
  return {
    name: "Camper",
    uuid: "Actor.camper",
    isOwner: true,
    items,
    attributes: { ST: 11, DX: 12, IQ: 10, HT: 11, Per: 10 },
    skills: {},
    system: { hp: { max: 10 }, details: { weight: "150 lbs." } },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    ...more,
  };
}

const skill = (name: string) => ({ type: "skill", name });

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readySurvival(fakeApi() as never, { survival: rule("survivalGear"), maritime: rule("maritimeGear"), parachuting: rule("parachuting"), rations: rule("rations") });
}

function roll(actor: any, tags: string[], more: Record<string, unknown> = {}): any[] {
  return fire(HOOKS.successRollModifiers, { actor, tags, modifiers: [], kind: "attribute", skill: "", ...more }).modifiers;
}

function skillLines(actor: any, name: string): any[] {
  const context = { actor, name, lines: [{ key: "tools", label: "Equipment", value: 0, source: "system" }] };
  fire("gworld.skillBonuses", context);
  return context.lines;
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  options = new Map();
  cards = new Map();
  prices = [];
  damage = [];
  successes = [];
  contests = [];
  injuries = [];
  conditions = [];
  posted = [];
  updated = [];
  chat = [];
  on = {};
  successResult = { success: true };
  contestResult = { outcome: "first" };
  dialogAnswer = null;
  targets = [];
  worldTime = 1000;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets); } },
    get time() { return { worldTime }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("fromUuid", async (uuid: string) => (uuid === "Actor.bear" ? { name: "Bear", uuid, attributes: { ST: 14 } } : null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const camper = person([gear("Tent, Dome", { kind: "shelter", value: 2 }), gear("Life Jacket", { kind: "lifeJacket" }, { equipped: true }), gear("Swim Fins", { kind: "swimFins" }, { equipped: true })], { flags: { htCamping: true } });
    expect(roll(camper, ["exposure", "cold", "HT"])).toEqual([]);
    expect(roll(camper, ["skill"], { kind: "skill", skill: "Swimming" })).toEqual([]);
    const move = fire("gworld.moveModifiers", { actor: camper, move: 5, lines: [] });
    expect(move.lines).toEqual([]);
    expect(options.get("ht-death-from-above").available({ actor: person([gear("Parachute (TL6)", { kind: "parachute" })]) })).toBe(false);
    for (const [key, item] of [["ht-fire", gear("Matches", { kind: "fireStarter" })], ["ht-jump", gear("Parachute (TL6)", { kind: "parachute" })], ["ht-eat", gear("Snack", { kind: "snack" })], ["ht-dye-marker", gear("Dye Marker", { kind: "dyeMarker" })]] as const) {
      expect(actions.get(key).visible(item), key).toBe(false);
    }
  });
});

describe("survival and camping gear (High-Tech pp. 56-59)", () => {
  beforeEach(() => { on = { survivalGear: true }; ready(); });

  it("puts the best shelter carried on a camper's cold roll, or -5 with none", () => {
    const bag = gear("Sleeping Bag", { kind: "shelter", value: 0, valueAtTl8: 1 }, { tl: "8" });
    const tent = gear("Tent, Shelter Half", { kind: "shelter", value: 1 }, { equipmentQuality: "good" });
    const camper = person([bag, tent], { flags: { htCamping: true } });
    expect(roll(camper, ["exposure", "cold", "HT"])).toEqual([{ label: expect.stringContaining("Tent, Shelter Half"), value: 2 }]);
    expect(roll(person([], { flags: { htCamping: true } }), ["exposure", "cold", "survival"])).toEqual([{ label: "GCC.HT.Survival.NoShelterLine", value: -5 }]);
    // Not camping out, or in the heat: nothing.
    expect(roll(person([bag, tent]), ["exposure", "cold", "HT"])).toEqual([]);
    expect(roll(camper, ["exposure", "heat", "HT"])).toEqual([]);
    expect(campingLine(fakeApi() as never, person([bag], { flags: { htCamping: true } }))?.value).toBe(1);
  });

  it("gives a water filter in use TL-2 against a disease caught by drinking", () => {
    const filter = gear("Water Filter", { kind: "waterFilter" }, { tl: "6", equipped: true });
    const drinker = person([filter]);
    expect(roll(drinker, ["disease", "contagion", "HT"], { disease: { vector: "digestive" } })).toEqual([{ label: expect.any(String), value: 4 }]);
    expect(roll(drinker, ["disease", "contagion", "HT"], { disease: { vector: "respiratory" } })).toEqual([]);
    filter.system.equipped = false;
    expect(roll(drinker, ["disease", "contagion", "HT"], { disease: { vector: "digestive" } })).toEqual([]);
  });

  it("reaches the Illness dialog's own disease caught by drinking, and counts a charcoal-filtered canteen's +2 (pp. 53, 59)", () => {
    // Since API 1.104.0 the dialog's "Custom" disease carries the vector the GM picks.
    const custom = { disease: { name: "Custom", vector: "digestive", resistanceModifier: 0 } };
    const canteen = gear("Charcoal-Filtered Canteen", {}, { tl: "5" });
    const drinker = person([canteen]);
    expect(roll(drinker, ["disease", "contagion", "HT"], custom)).toEqual([{ label: expect.stringContaining("Charcoal-Filtered Canteen"), value: 2 }]);
    // A better filter in use wins; they don't add.
    drinker.items.push(gear("Water Filter", { kind: "waterFilter" }, { tl: "7", equipped: true }));
    expect(roll(drinker, ["disease", "contagion", "HT"], custom)).toEqual([{ label: expect.stringContaining("Water Filter"), value: 5 }]);
  });

  it("forages with fishing gear on Fishing, and with a trap on the best land Survival with its quality (pp. 55, 58)", async () => {
    const outfit = gear("Fishing Outfit", { kind: "fishing" }, { forSkills: ["Fishing"], equipmentQuality: "fine" });
    const trap = gear("Trap, Beaver", { kind: "trap", value: 8 }, { forSkills: ["Survival"], equipmentQuality: "good" });
    const woodsman = person([outfit, trap, skill("Survival (Open Ocean)"), skill("Survival (Woodlands)")], { skills: { Fishing: 14, "Survival (Open Ocean)": 15, "Survival (Woodlands)": 12 } });
    expect(actions.get("ht-forage").visible(outfit)).toBe(true);
    expect(actions.get("ht-forage").visible(gear("Matches", { kind: "fireStarter" }))).toBe(false);
    actions.get("ht-forage").run(outfit, woodsman);
    await flush();
    // The outfit's +2 is the system's own tools line on Fishing.
    expect(successes[0]).toMatchObject({ base: 14, skill: "Fishing", modifiers: [], tags: ["foraging", "Per"] });
    actions.get("ht-forage").run(trap, woodsman);
    await flush();
    expect(successes[1]).toMatchObject({ base: 12, skill: "Survival (Woodlands)", modifiers: [{ label: expect.stringContaining("Trap, Beaver"), value: 1 }] });
    expect(chat.at(-1)).toContain("ForageFound");
    expect(woodsman.getFlag(MODULE_ID, "htForaging")).toEqual({ day: 0, rolls: 2 });
  });

  it("forages five times a day at most, and afresh the next day", async () => {
    const kit = gear("Fishing Kit", { kind: "fishing" }, { forSkills: ["Fishing"] });
    const angler = person([kit]);
    for (let i = 0; i < 6; i += 1) {
      actions.get("ht-forage").run(kit, angler);
      await flush();
    }
    expect(successes).toHaveLength(5);
    expect(successes[0]).toMatchObject({ base: 6, skill: "Fishing" });
    expect((globalThis as any).ui.notifications.warn).toHaveBeenCalledTimes(1);
    worldTime += 86400;
    actions.get("ht-forage").run(kit, angler);
    await flush();
    expect(successes).toHaveLength(6);
  });

  it("makes a kit for another environment the Survival roll's equipment line", () => {
    const vest = gear("Pilot's Survival Vest", { kind: "survivalKit" }, { forSkills: ["Survival (Jungle)"], equipmentQuality: "good" });
    const lost = person([vest]);
    expect(skillLines(lost, "Survival (Swampland)")[0]).toMatchObject({ key: "tools", value: -1, reason: "GCC.HT.Survival.WrongKitReason" });
    expect(skillLines(lost, "Survival (Open Ocean)")[0].value).toBe(-2);
    // Its own specialty is the system's; a skill that isn't Survival is nobody's.
    expect(survivalKitEquipment(fakeApi() as never, lost, "Survival (Jungle)")).toBeNull();
    expect(skillLines(lost, "Naturalist")[0].value).toBe(0);
    const covert = gear("Covert Survival Kit", { kind: "survivalKit", similar: "Mountain" }, { forSkills: ["Survival (Woodlands)"] });
    expect(skillLines(person([covert]), "Survival (Mountain)")[0].value).toBe(-1);
  });

  it("gives a rescuer +2 to see somebody with a signal in use", () => {
    const flare = gear("Hand Flare", { kind: "signal" }, { equipped: true });
    const context = fire(HOOKS.detectionModifiers, { observer: person(), subject: person([flare]), sense: "vision", modifiers: [] });
    expect(context.modifiers).toEqual([{ label: expect.stringContaining("Hand Flare"), value: 2 }]);
    const heard = fire(HOOKS.detectionModifiers, { observer: person(), subject: person([flare]), sense: "hearing", modifiers: [] });
    expect(heard.modifiers).toEqual([]);
  });

  it("counts a signal only out to the range it is seen at, where the map gives the distance (p. 58)", () => {
    const at = (x: number) => ({ getActiveTokens: () => [{ center: { x, y: 0 } }] });
    vi.stubGlobal("canvas", { grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(b.x - a.x) }) } });
    const strobe = gear("Strobe Marker", { kind: "signal", value: 3520 }, { equipped: true });
    const look = (yards: number) => fire(HOOKS.detectionModifiers, { observer: person([], at(0)), subject: person([strobe], at(yards)), sense: "vision", modifiers: [] }).modifiers;
    expect(look(3000)).toEqual([{ label: expect.stringContaining("Strobe Marker"), value: 2 }]);
    expect(look(4000)).toEqual([]);
    const flare = gear("Hand Flare", { kind: "signal" }, { equipped: true });
    expect(fire(HOOKS.detectionModifiers, { observer: person([], at(0)), subject: person([flare], at(9000)), sense: "vision", modifiers: [] }).modifiers).toHaveLength(1);
  });

  it("rolls a targeted listener's Hearing for a whistle heard at 128 yards (p. 58; API 1.117.0)", async () => {
    const whistle = gear("Whistle", { kind: "whistle" });
    const listener = person([], { name: "Rescuer", derived: { senses: [{ sense: "hearing", score: 12 }] } });
    targets = [{ actor: listener }];
    dialogAnswer = { yards: 300, other: -1 };
    expect(actions.get("ht-whistle").visible(whistle)).toBe(true);
    expect(actions.get("ht-whistle").visible(gear("Hand Flare", { kind: "signal" }))).toBe(false);
    actions.get("ht-whistle").run(whistle, person());
    await flush();
    expect(successes[0]).toMatchObject({ actor: listener, base: 12, skill: "Hearing", distance: { yards: 300, baseYards: 128 }, modifiers: [{ value: -1 }] });
  });

  it("builds a fire on DX-based Survival with the starter's bonus", async () => {
    const matches = gear("Matches (box of 50)", { kind: "fireStarter" });
    const camper = person([skill("Survival (Woodlands)"), matches], { skills: { "Survival (Woodlands)": 13 } });
    dialogAnswer = { bonus: 7, modifier: -2 };
    actions.get("ht-fire").run(matches, camper);
    await flush();
    // Survival 13 rebased from Per 10 to DX 12: 15.
    expect(successes[0]).toMatchObject({ base: 15, skill: "Survival (Woodlands)", kind: "skill", modifiers: [{ value: 7 }, { value: -2 }] });
    successes = [];
    actions.get("ht-fire").run(matches, person([matches]));
    await flush();
    expect(successes[0]).toMatchObject({ base: 7, kind: "attribute" });
  });

  it("springs a trap on the target for thrust+2 at its ST, and breaks free on a Quick Contest of ST", async () => {
    const trap = gear("Trap, Large Predator", { kind: "trap", value: 15 });
    const hunter = person([trap]);
    actions.get("ht-trap").run(trap, hunter);
    await flush();
    expect(damage).toEqual([]);
    targets = [{ actor: { name: "Bear", uuid: "Actor.bear" } }];
    actions.get("ht-trap").run(trap, hunter);
    await flush();
    // ST 15 thrusts 1d+1: +2 is 1d+3.
    expect(damage[0]).toMatchObject({ formula: "1d+3", damageType: "cr", source: "springTrap" });
    expect(posted[0].data.trap).toMatchObject({ victimUuid: "Actor.bear", st: 15 });
    await cards.get("ht-survival-card").actions.breakFree({ message: "m", data: posted[0].data });
    expect(contests[0]).toMatchObject({ first: { base: 14 }, second: { base: 15 } });
    expect(updated[0].data.trap.freed).toContain("TrapFreed");
  });

  it("pumps a desalinator for 1 FP, and prices the large model at three times", async () => {
    const pump = gear("Hand-Pumped Desalinator", { kind: "desalinator" });
    const castaway = person([pump]);
    actions.get("ht-desalinate").run(pump, castaway);
    await flush();
    expect(injuries[0]).toMatchObject({ amount: 1, spent: true });
    expect(chat[0]).toContain("PumpedCup");
    expect(prices[0].apply(pump, { cost: 500, weight: 2.5 })).toBeNull();
    pump.system.extensions[MODULE_ID].survival.large = true;
    expect(prices[0].apply(pump, { cost: 500, weight: 2.5 })).toMatchObject({ cost: 1500, weight: 7.5 });
  });
});

describe("maritime gear (High-Tech pp. 59-60)", () => {
  beforeEach(() => { on = { maritimeGear: true }; ready(); });

  it("gives a life jacket worn +6 on Swimming and -3 in a Swimming contest", () => {
    const jacket = gear("Life Jacket", { kind: "lifeJacket" }, { equipped: true });
    const swimmer = person([jacket]);
    expect(roll(swimmer, ["skill"], { kind: "skill", skill: "Swimming" })).toEqual([{ label: expect.any(String), value: 6 }]);
    expect(roll(swimmer, ["contest", "quickContest"], { kind: "contest", skill: "Swimming" })).toEqual([{ label: expect.any(String), value: -3 }]);
    expect(roll(swimmer, ["skill"], { kind: "skill", skill: "Climbing" })).toEqual([]);
    jacket.system.equipped = false;
    expect(roll(swimmer, ["skill"], { kind: "skill", skill: "Swimming" })).toEqual([]);
  });

  it("takes Move on land to 2 in swim fins", () => {
    const fins = gear("Swim Fins", { kind: "swimFins" }, { equipped: true });
    expect(fire("gworld.moveModifiers", { actor: person([fins]), move: 6, lines: [] }).lines).toEqual([{ label: expect.any(String), value: -4 }]);
    expect(fire("gworld.moveModifiers", { actor: person([fins]), move: 2, lines: [] }).lines).toEqual([]);
    expect(fire("gworld.moveModifiers", { actor: person([fins]), move: 6, medium: "ground", lines: [] }).lines).toHaveLength(1);
  });

  it("gives swim fins Enhanced Move 0.5 (Water) on water Move, and nothing from the land line there", () => {
    const fins = gear("Swim Fins", { kind: "swimFins" }, { equipped: true });
    // Water Move 1 x1.5 rounds down to 1; 2 x1.5 is 3 (Campaigns p. 354; Characters p. 52).
    expect(fire("gworld.moveModifiers", { actor: person([fins]), move: 2, medium: "water", lines: [] }).lines).toEqual([{ label: expect.any(String), multiplier: 1.5, medium: "water" }]);
    const loose = gear("Swim Fins", { kind: "swimFins" }, { equipped: false });
    expect(fire("gworld.moveModifiers", { actor: person([loose]), move: 2, medium: "water", lines: [] }).lines).toEqual([]);
  });

  it("releases a dye marker: +2 to spot its user for half an hour", async () => {
    const dye = gear("Dye Marker", { kind: "dyeMarker" });
    const survivor = person([dye]);
    actions.get("ht-dye-marker").run(dye, survivor);
    await flush();
    expect(dye.system.quantity).toBe(0);
    const look = () => fire(HOOKS.detectionModifiers, { observer: person(), subject: survivor, sense: "vision", modifiers: [] }).modifiers;
    expect(look()).toEqual([{ label: "GCC.HT.Survival.DyeLine", value: 2 }]);
    worldTime += 1801;
    expect(look()).toEqual([]);
  });
});

describe("parachuting (High-Tech p. 61)", () => {
  beforeEach(() => { on = { parachuting: true }; ready(); });

  const chute = (tl = "7") => gear("Parachute (TL6)", { kind: "parachute", maxLbs: 150, maxLbsTl7: 200, maxLbsTl8: 250, openingYards: 80, descent: 5 }, { tl });

  it("rolls Parachuting and says where the canopy opens and how fast it comes down", async () => {
    const jumper = person([chute()], { skills: { Parachuting: 13 }, carried: 40 });
    dialogAnswer = { height: 300, load: 190 };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    expect(successes[0]).toMatchObject({ base: 13, skill: "Parachuting" });
    expect(posted[0].data.lines.join(" ")).toContain("Opens");
    expect(posted[0].data.landing).toMatchObject({ rolled: false });
    expect(posted[0].data.landing.label).toContain("\"velocity\":5");
  });

  it("lands a jumper who pulls too low at half velocity, and fails an overloaded chute", async () => {
    const jumper = person([chute("6")]);
    dialogAnswer = { height: 17, load: 160 };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    expect(posted[0].data.lines[0]).toContain("HitFirst");
    expect(posted[0].data.landing.label).toContain("\"velocity\":10");
    dialogAnswer = { height: 300, load: 180 };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    expect(posted[1].data.lines[0]).toContain("ChuteFails");
  });

  it("rolls the landing from the card once", async () => {
    const jumper = person([chute()]);
    dialogAnswer = { height: 300, load: 150 };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    const card = cards.get("ht-survival-card");
    await card.actions.landing({ message: "m", data: posted[0].data, actor: jumper });
    expect(damage[0]).toMatchObject({ damageType: "cr", source: "parachuteLanding" });
    await card.actions.landing({ message: "m", data: updated[0].data, actor: jumper });
    expect(damage).toHaveLength(1);
  });

  it("makes the earliest chutes roll HT-4 against nausea", async () => {
    const early = gear("Parachute (TL5)", { kind: "parachute", maxLbs: 150, openingYards: 80, descent: 5, nausea: -4 }, { tl: "5" });
    const jumper = person([early]);
    dialogAnswer = { height: 300, load: 150 };
    successResult = { success: false };
    actions.get("ht-jump").run(early, jumper);
    await flush();
    expect(successes[1]).toMatchObject({ skill: "HT", modifiers: [{ value: -4 }] });
    expect(conditions[0]).toMatchObject({ key: "nauseated" });
  });

  it("offers Death from Above on Move and Attack at the lower of Parachuting and the weapon's skill", () => {
    const option = options.get("ht-death-from-above");
    const jumper = person([chute()], { skills: { Parachuting: 11 } });
    expect(option.available({ actor: jumper })).toBe(true);
    expect(option.available({ actor: person() })).toBe(false);
    expect(option.refuse({ actor: jumper, maneuver: "attack" })).toBe("GCC.HT.Survival.DeathFromAboveRefusal");
    // Only coming down under an open canopy.
    expect(option.refuse({ actor: jumper, maneuver: "moveAndAttack" })).toBe("GCC.HT.Survival.DeathFromAboveRefusal");
    jumper.getFlag = (_scope: string, key: string) => key === "htUnderCanopy";
    expect(option.refuse({ actor: jumper, maneuver: "moveAndAttack" })).toBeNull();
    expect(option.apply({ actor: jumper, effectiveSkill: 14 }).modifiers).toEqual([{ label: expect.any(String), value: -3 }]);
    expect(option.apply({ actor: jumper, effectiveSkill: 10 }).modifiers).toEqual([]);
  });

  it("keeps the jumper under the canopy until the landing, for Death from Above", async () => {
    const jumper = person([chute()]);
    dialogAnswer = { height: 300, load: 150, wind: 0 };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    expect(jumper.getFlag(MODULE_ID, "htUnderCanopy")).toBe(true);
    expect(posted[0].data.canopy).toEqual({ landed: false });
    expect(options.get("ht-death-from-above").refuse({ actor: jumper, maneuver: "moveAndAttack" })).toBeNull();
    await cards.get("ht-survival-card").actions.landing({ message: "m", data: posted[0].data, actor: jumper });
    expect(jumper.getFlag(MODULE_ID, "htUnderCanopy")).toBeUndefined();
    expect(updated[0].data.canopy).toEqual({ landed: true });
    // A ram-air chute has no hard landing to roll: "Landed" ends it.
    const ramAir = gear("Ram-Air Parachute", { kind: "parachute", maxLbs: 400, openingYards: 80 }, { tl: "8" });
    const flyer = person([ramAir]);
    actions.get("ht-jump").run(ramAir, flyer);
    await flush();
    expect(posted[1].data.lines.join(" ")).toContain('"move":15');
    expect(posted[1].data.landing).toBeNull();
    await cards.get("ht-survival-card").actions.landed({ message: "m", data: posted[1].data, actor: flyer });
    expect(flyer.getFlag(MODULE_ID, "htUnderCanopy")).toBeUndefined();
    // The ground before the canopy: no canopy at all.
    const low = person([chute()]);
    dialogAnswer = { height: 20, load: 150, wind: 0 };
    actions.get("ht-jump").run(low.items[0], low);
    await flush();
    expect(low.getFlag(MODULE_ID, "htUnderCanopy")).toBeUndefined();
    expect(posted[2].data.canopy).toBeNull();
  });

  it("drifts with the wind on the way down", async () => {
    const jumper = person([chute()]);
    dialogAnswer = { height: 580, load: 150, wind: 10 };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    // 500 yards at 5 a second: 100 seconds, at 10 mph about 489 yards.
    expect(posted[0].data.lines.join(" ")).toContain('Drift {"yards":489,"seconds":100,"wind":10}');
  });

  it("opens a TL8 chute by itself for a jumper who never pulls, and lets an older one fall", async () => {
    const jumper = person([chute("8")]);
    dialogAnswer = { height: 1000, load: 150, wind: 0, noPull: true };
    actions.get("ht-jump").run(jumper.items[0], jumper);
    await flush();
    expect(successes).toEqual([]);
    expect(posted[0].data.lines[0]).toContain('AutoDeploys {"yards":333}');
    expect(posted[0].data.canopy).toEqual({ landed: false });
    const old = person([chute("7")]);
    actions.get("ht-jump").run(old.items[0], old);
    await flush();
    expect(posted[1].data.lines[0]).toContain("NeverOpens");
    expect(posted[1].data.canopy).toBeNull();
    expect(posted[1].data.landing.label).toContain("FallLanding");
  });

  it("prices a reserve chute and names the guided gear", () => {
    const withReserve = gear("Parachute (TL6)", { kind: "parachute", reserve: true });
    const price = prices.find((p) => p.key === "ht-reserve-chute").apply;
    expect(price(withReserve, { cost: 750, weight: 30 })).toMatchObject({ cost: 1000, weight: 45 });
    expect(price(chute(), { cost: 750, weight: 30 })).toBeNull();
  });

  it("defaults Parachuting to the better of DX-4 and IQ-6", () => {
    expect(parachutingLevel(fakeApi() as never, person())).toBe(8);
    expect(parachutingLevel(fakeApi() as never, person([], { attributes: { DX: 9, IQ: 14 } }))).toBe(8);
  });
});

describe("rations (High-Tech p. 35)", () => {
  beforeEach(() => { on = { rations: true }; ready(); });

  it("eats a snack or sports drink off the count and says what it counts as", async () => {
    const drink = gear("Sports Drink", { kind: "sportsDrink" }, { quantity: 2 });
    const hiker = person([drink]);
    expect(actions.get("ht-eat").visible(drink)).toBe(true);
    dialogAnswer = { moving: false };
    actions.get("ht-eat").run(drink, hiker);
    await flush();
    expect(drink.system.quantity).toBe(1);
    expect(chat[0]).toContain("SnackEaten");
    expect(chat[0]).toContain("DrinkWater");
    expect(injuries).toEqual([]);
  });

  it("gives 1 FP back for a snack on the move, and takes 2 two hours later (p. 35)", async () => {
    const bar = gear("Snack", { kind: "snack" }, { quantity: 3 });
    const hiker = person([bar]);
    dialogAnswer = { moving: true };
    actions.get("ht-eat").run(bar, hiker);
    await flush();
    expect(bar.system.quantity).toBe(2);
    expect(injuries).toEqual([expect.objectContaining({ restored: 1 })]);
    expect(chat[0]).toContain("SnackOnTheMove");
    expect(hiker.getFlag(MODULE_ID, "htSnackCrash")).toEqual([{ at: 1000 + 7200, fp: 2, item: "Snack" }]);
    // The active GM's client charges it once the two hours are up.
    const world = (game as any);
    vi.stubGlobal("game", { ...world, actors: [hiker], scenes: [], user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, get time() { return { worldTime }; } });
    worldTime += 3600;
    fire("updateWorldTime");
    await flush();
    expect(injuries).toHaveLength(1);
    worldTime += 3600;
    fire("updateWorldTime");
    await flush();
    expect(injuries[1]).toMatchObject({ amount: 2, spent: true, exertion: false, details: { rule: "snackCrash", item: "Snack" } });
    expect(hiker.getFlag(MODULE_ID, "htSnackCrash")).toBeUndefined();
    expect(chat.at(-1)).toContain("SnackCrash");
  });

  it("eats nothing when the dialog is closed", async () => {
    const bar = gear("Snack", { kind: "snack" }, { quantity: 3 });
    actions.get("ht-eat").run(bar, person([bar]));
    await flush();
    expect(bar.system.quantity).toBe(3);
  });

  it("reads missing data as nothing", () => {
    expect(survivalData({ system: {} })).toMatchObject({ kind: "", value: 0, valueAtTl8: null, nausea: null, similar: [] });
  });
});
