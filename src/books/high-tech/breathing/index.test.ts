/**
 * High-Tech's breathing gear and environment suits as the system meets them:
 * trait effects through `gworld.traitEffects`, the air spent through
 * `gworld.fatigueCost` and `gworld.afterSuccessRoll`, the suits' rolls
 * through `gworld.successRollModifiers`, and the row actions -- with only
 * High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { BIOMEDICAL_TABLES, readyBiomedical, resetBiomedical } from "../../../shared/protective-gear/index.js";
import { gasReaches } from "../ammunition/explosive.js";
import { airState, airSupply, breathingLines, minutesLeft, readyBreathing, wearsIrritantMask } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  fatigueCost: "gworld.fatigueCost",
  armorDr: "gworld.armorDr",
  injury: "gworld.injury",
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let chat: string[];
let on: Record<string, boolean>;
let dialogAnswer: any;
let targets: any[];

let cards: Map<string, any>;
let posted: any[];
let rolls: any[];
let rollOutcome: any;
let injuries: any[];
let conditions: any[];
let worldTime: number;

function fakeApi() {
  return {
    combat: { hooks: HOOKS },
    data: { hooks: { skillLevels: "gworld.skillLevels" } },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, options: any) => { posted.push({ key, data, options }); },
      update: async (message: any, data: any) => { message.data = data; return true; },
    },
    roll: { success: async (o: any) => { rolls.push(o); return rollOutcome; } },
    actors: {
      attribute: () => 11,
      applyInjury: async (actor: any, o: any) => { injuries.push(o); },
      applyCondition: async (actor: any, o: any) => { conditions.push(o); return "id"; },
    },
    rules: {
      accelerationNeedsRoll: ({ gForce }: any) => gForce >= 2.5,
      accelerationTarget: ({ health, gForce }: any) => health - 2 * Math.floor(Math.log2(gForce / 2.5)),
      accelerationHarm: ({ margin, criticalFailure }: any) => ({ fatigue: Math.abs(margin), blackoutSeconds: criticalFailure ? Math.abs(margin) * 10 : 0 }),
      bendsOutcome: ({ success, criticalSuccess, criticalFailure }: any) => (criticalSuccess ? "clear" : criticalFailure ? "death" : success ? "agony" : "collapse"),
      defaultCreditPoints: () => 0,
      relativeLevelForPoints: () => null,
    },
  };
}

function piece(name: string, more: Record<string, any> = {}, type = "armor"): any {
  const flags: Record<string, any> = { ...(more.flags ?? {}) };
  const item: any = {
    id: name,
    name,
    type,
    isOwner: true,
    flags: { [MODULE_ID]: flags },
    system: { tl: "7", carried: true, equipped: true, ...(more.system ?? {}) },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
  };
  if (more.book) flags.book = more.book;
  return item;
}

const tank = (name = "Air Tank, Small", tl = "8", more: Record<string, any> = {}) => piece(name, { system: { tl, equipped: false }, ...more }, "equipment");

function person(items: any[] = []): any {
  const flags: Record<string, any> = {};
  const actor: any = {
    name: "Diver", isOwner: true, items, system: { tl: "8" }, flags: { [MODULE_ID]: flags },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
  };
  for (const item of items) item.actor = actor;
  return actor;
}

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function ready(): void {
  readyBreathing(fakeApi() as never, { breathing: () => on.breathingGear === true, suits: () => on.environmentSuits === true });
}

function effectsOf(actor: any): { effects: any; sources: any[] } {
  const context = { actor, effects: { protectedSense: {}, temperatureTolerance: { coldF: 0, heatF: 0 }, restrictedVision: null }, sources: [] as any[] };
  fire("gworld.traitEffects", context);
  return context;
}

const switches = () => ({ breathing: () => on.breathingGear === true, suits: () => on.environmentSuits === true });

beforeEach(() => {
  resetBiomedical();
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  chat = [];
  on = {};
  dialogAnswer = null;
  targets = [];
  cards = new Map();
  posted = [];
  rolls = [];
  rollOutcome = null;
  injuries = [];
  conditions = [];
  worldTime = 1000;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { id: "me", get targets() { return new Set(targets); } },
    get time() { return { worldTime }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with both switches off", () => {
  it("changes nothing", () => {
    ready();
    const diver = person([piece("Gas Mask (TL 8)", { system: { tl: "8" } }), piece("Biohazard Suit"), tank()]);
    const { effects, sources } = effectsOf(diver);
    expect(sources).toEqual([]);
    expect(effects.filterLungs).toBeUndefined();
    expect(fire(HOOKS.fatigueCost, { actor: diver, fp: 2, reason: "battle", sources: [] }).fp).toBe(2);
    expect(actions.get("ht-breathe").visible(tank())).toBe(false);
    expect(breathingLines(piece("Gas Mask (TL 8)"), switches())).toEqual([]);
    expect(wearsIrritantMask(diver)).toBe(false);
  });
});

describe("breathing gear (High-Tech pp. 72-74, 76)", () => {
  beforeEach(() => { on = { breathingGear: true }; ready(); });

  it("makes a gas mask Filter Lungs with No Peripheral Vision and no smell", () => {
    const { effects, sources } = effectsOf(person([piece("Gas Mask (TL 8)", { system: { tl: "8" } })]));
    expect(effects.filterLungs).toBe(true);
    expect(effects.restrictedVision).toBe("noPeripheral");
    expect(effects.noSmellTaste).toBe(true);
    expect(effects.doesntBreathe).toBeUndefined();
    expect(sources).toContainEqual({ effect: "restrictedVision.noPeripheral", label: "Gas Mask (TL 8)" });
    expect(sources).toContainEqual({ effect: "filterLungs", label: "Gas Mask (TL 8)" });
  });

  it("gives the TL5 gas mask Tunnel Vision, and never loosens a worse limit", () => {
    const { effects } = effectsOf(person([piece("Gas Mask (TL 5)", { system: { tl: "5" } })]));
    expect(effects.restrictedVision).toBe("tunnel");
    const context = { actor: person([piece("Gas Mask (TL 8)", { system: { tl: "8" } })]), effects: { restrictedVision: "tunnel", protectedSense: {} }, sources: [] as any[] };
    fire("gworld.traitEffects", context);
    expect(context.effects.restrictedVision).toBe("tunnel");
  });

  it("keeps tear gas out of a masked wearer's eyes and nose", () => {
    const masked = person([piece("Gas Mask (TL 7)")]);
    expect(wearsIrritantMask(masked)).toBe(true);
    expect(gasReaches("tearGasBlinding", { sealed: false, doesntBreathe: false, filterLungs: true, irritantImmune: wearsIrritantMask(masked) })).toBe(false);
    expect(gasReaches("vomitingAgent", { sealed: false, doesntBreathe: false, filterLungs: false, irritantImmune: true })).toBe(true);
  });

  it("gives a scuba mask Doesn't Breathe only while a tank feeds it", () => {
    const mask = piece("Scuba Mask (TL 8)", { system: { tl: "8" } });
    expect(effectsOf(person([mask])).effects.doesntBreathe).toBeUndefined();
    const full = tank("Air Tank, Small", "8");
    const diver = person([mask, full]);
    const { effects, sources } = effectsOf(diver);
    expect(effects.doesntBreathe).toBe(true);
    expect(sources).toContainEqual({ effect: "doesntBreathe", label: "Air Tank, Small" });
    // An empty tank feeds nothing.
    full.flags[MODULE_ID].htAir = { used: 45, depthFeet: 0 };
    expect(effectsOf(diver).effects.doesntBreathe).toBeUndefined();
  });

  it("reads a tank's air by the owner's TL and the depth", () => {
    const small = tank("Air Tank, Small", "6");
    expect(minutesLeft(small)).toBe(12);
    person([small]);
    // A TL8 diver's small tank holds 45 minutes; at 66' a third of it.
    expect(minutesLeft(small)).toBe(45);
    small.flags[MODULE_ID].htAir = { used: 0, depthFeet: 66 };
    expect(minutesLeft(small)).toBe(15);
    expect(breathingLines(small, switches())).toContain('GCC.HT.Breathing.LeftAtDepth {"left":15,"feet":66,"pressure":3}');
  });

  it("takes a minute of air for every FP spent and every failed Fright Check", async () => {
    const small = tank();
    const diver = person([piece("SCBA Mask (TL 8)", { system: { tl: "8" } }), small]);
    fire(HOOKS.fatigueCost, { actor: diver, fp: 3, reason: "battle", exertion: true, sources: [] });
    await flush();
    expect(airState(small).used).toBe(3);
    fire(HOOKS.afterSuccessRoll, { actor: diver, tags: ["fright"], outcome: { success: false } });
    fire(HOOKS.afterSuccessRoll, { actor: diver, tags: ["fright"], outcome: { success: true } });
    await flush();
    expect(airState(small).used).toBe(4);
    expect(minutesLeft(small)).toBe(41);
  });

  it("breathes a rebreather's own gas, and none from a tank it doesn't need", () => {
    const rebreather = piece("Early Rebreather");
    const small = tank();
    const diver = person([rebreather, small]);
    expect(airSupply(diver, switches())).toBe(rebreather);
    expect(effectsOf(diver).sources).toContainEqual({ effect: "doesntBreathe", label: "Early Rebreather" });
    expect(breathingLines(rebreather, switches())).toContain('GCC.HT.Breathing.Oxygen {"feet":30}');
  });

  it("breathes from a tank for minutes at a depth, and refills it", async () => {
    const small = tank();
    const diver = person([small]);
    dialogAnswer = { minutes: 10, depth: 33 };
    await actions.get("ht-breathe").run(small, diver);
    expect(airState(small)).toEqual({ used: 20, depthFeet: 33 });
    expect(minutesLeft(small)).toBe(12.5);
    expect(chat.at(-1)).toContain("Breathed");
    expect(actions.get("ht-refill").visible(small)).toBe(true);
    await actions.get("ht-refill").run(small, diver);
    expect(airState(small).used).toBe(0);
  });

  it("leaves another book's gear to its own table", () => {
    const { sources } = effectsOf(person([piece("Gas Mask (TL 8)", { book: "ultra-tech" })]));
    expect(sources).toEqual([]);
  });

  it("gives hard-hat dress its air while worn, and the notes on the sheet", () => {
    const { effects } = effectsOf(person([piece("Hard-Hat Suit", { system: { tl: "8" } })]));
    expect(effects.doesntBreathe).toBe(true);
    expect(effects.restrictedVision).toBe("tunnel");
    const lines = breathingLines(piece("Gas Mask (TL 6)", { system: { tl: "6" } }), switches());
    expect(lines).toContain('GCC.HT.Breathing.Don {"on":3,"off":1}');
    expect(lines).toContain("GCC.HT.Breathing.Muffled");
    expect(lines).toContain('GCC.HT.Breathing.Hose {"toHit":-2}');
  });

  it("leaves the suits to their own switch", () => {
    const diver = person([piece("Biohazard Suit"), piece("Gas Mask (TL 7)")]);
    expect(effectsOf(diver).effects.sealed).toBeUndefined();
    expect(fire(HOOKS.fatigueCost, { actor: diver, fp: 2, reason: "battle", sources: [] }).fp).toBe(2);
  });
});

describe("environment suits (High-Tech pp. 74-76)", () => {
  beforeEach(() => { on = { environmentSuits: true }; ready(); });

  it("seals a biohazard suit with an air mask under it, and triples the FP of effort", () => {
    const suit = piece("Biohazard Suit");
    expect(effectsOf(person([suit])).effects.sealed).toBeUndefined();
    const wearer = person([suit, piece("Gas Mask (TL 7)")]);
    const { effects, sources } = effectsOf(wearer);
    expect(effects.sealed).toBe(true);
    expect(sources).toContainEqual({ effect: "sealed", label: "Biohazard Suit" });
    // The mask's own effects are the breathing gear switch's.
    expect(effects.filterLungs).toBeUndefined();
    const cost = fire(HOOKS.fatigueCost, { actor: wearer, fp: 2, reason: "battle", exertion: true, sources: [] });
    expect(cost.fp).toBe(6);
    expect(cost.sources).toEqual(['GCC.HT.Breathing.HotSuitSource {"name":"Biohazard Suit"}']);
    // A spell costs what it costs.
    expect(fire(HOOKS.fatigueCost, { actor: wearer, fp: 2, reason: "spell", exertion: false, sources: [] }).fp).toBe(2);
  });

  it("gives the TL8 biohazard suit PF 2.5", () => {
    const { effects } = effectsOf(person([piece("Biohazard Suit (TL8)", { system: { tl: "8" } })]));
    expect(effects.radiationTolerance).toBe(2.5);
  });

  it("gives a clean suit +4 HT against contagion", () => {
    const wearer = person([piece("Clean Suit")]);
    const context = fire(HOOKS.successRollModifiers, { actor: wearer, tags: ["disease", "contagion", "HT"], modifiers: [] });
    expect(context.modifiers).toEqual([{ label: "Clean Suit", value: 4 }]);
  });

  it("gives +1 to Diagnosis on a patient wearing biomedical sensors", () => {
    const patient = person([piece("Biomedical Sensors", {}, "equipment")]);
    const medic = person([]);
    const context = fire(HOOKS.successRollModifiers, { actor: medic, skill: "Diagnosis", tags: ["skill"], modifiers: [], opponent: patient });
    expect(context.modifiers).toEqual([{ label: 'GCC.HT.Breathing.BiomedicalModifier {"item":"Biomedical Sensors"}', value: 1 }]);
    targets = [{ actor: person([piece("Space Suit")]) }];
    expect(fire(HOOKS.successRollModifiers, { actor: medic, skill: "Diagnosis", tags: ["skill"], modifiers: [] }).modifiers).toHaveLength(1);
    expect(fire(HOOKS.successRollModifiers, { actor: medic, skill: "First Aid", tags: ["skill"], modifiers: [], opponent: patient }).modifiers).toEqual([]);
  });

  it("gives +1 once, not twice, with Ultra-Tech's sensors switched on too (#452)", () => {
    // Ultra-Tech's armour systems claim a piece of the same name.
    BIOMEDICAL_TABLES.register({ book: "ultra-tech", tls: { min: 9, max: 12 }, on: () => true, applies: (item) => /^biomedical sensors$/i.test(item.name), label: (item) => `UT ${item.name}` });
    readyBiomedical(fakeApi() as never);
    const medic = person([]);
    const ours = person([piece("Biomedical Sensors", { book: "high-tech" }, "equipment")]);
    expect(fire(HOOKS.successRollModifiers, { actor: medic, skill: "Diagnosis", tags: ["skill"], modifiers: [], opponent: ours }).modifiers)
      .toEqual([{ label: 'GCC.HT.Breathing.BiomedicalModifier {"item":"Biomedical Sensors"}', value: 1 }]);
    // With High-Tech's switch off, High-Tech's record gives nothing, whatever Ultra-Tech's says.
    on = {};
    expect(fire(HOOKS.successRollModifiers, { actor: medic, skill: "Diagnosis", tags: ["skill"], modifiers: [], opponent: ours }).modifiers).toEqual([]);
  });

  it("seals the Apollo suit with its helmet, breathing from a tank", () => {
    const astronaut = person([piece("Space Suit"), piece("Space Suit Space Helmet")]);
    const { effects } = effectsOf(astronaut);
    expect(effects).toMatchObject({ sealed: true, vacuumSupport: true, filterLungs: true, restrictedVision: "noPeripheral" });
    expect(effects.protectedSense).toMatchObject({ vision: true, hearing: true, tasteSmell: true });
    expect(effects.doesntBreathe).toBeUndefined();
    astronaut.items.push(tank("Air Tank, Large"));
    for (const item of astronaut.items) item.actor = astronaut;
    expect(effectsOf(astronaut).effects.doesntBreathe).toBe(true);
  });

  it("gives the EVA suit seven hours of its own air under its helmet, and its climate control", () => {
    const suit = piece("Space Suit, EVA");
    const { effects } = effectsOf(person([suit, piece("Space Suit, EVA Space Helmet")]));
    expect(effects.doesntBreathe).toBe(true);
    expect(effects.temperatureTolerance).toEqual({ coldF: 60, heatF: 60 });
    expect(minutesLeft(suit)).toBe(420);
    expect(effectsOf(person([piece("Space Suit, EVA")])).effects.doesntBreathe).toBeUndefined();
  });
});

describe("wet turnout gear (High-Tech p. 75)", () => {
  beforeEach(() => { on = { environmentSuits: true }; ready(); });

  it("gives +5 DR against burning and doubles the burning that gets through, only while soaked", async () => {
    const coat = piece("Turnout Gear");
    const firefighter = person([coat]);
    const dry = [{ itemId: coat.id, dr: 5 }];
    fire(HOOKS.armorDr, { actor: firefighter, damageType: "burn", lines: dry });
    expect(dry[0]!.dr).toBe(5);
    await sections.get("ht-breathing-item").listeners({ querySelector: () => ({ addEventListener: (_e: string, fn: any) => fn({ currentTarget: { checked: true } }) }) }, coat);
    await flush();
    const lines = [{ itemId: coat.id, dr: 5 }];
    fire(HOOKS.armorDr, { actor: firefighter, damageType: "burn", lines });
    expect(lines[0]).toMatchObject({ dr: 10, reason: expect.stringContaining("TurnoutWetDr") });
    const cut = [{ itemId: coat.id, dr: 2 }];
    fire(HOOKS.armorDr, { actor: firefighter, damageType: "cut", lines: cut });
    expect(cut[0]!.dr).toBe(2);
    // The system weighs the vulnerability on what penetrates (Characters p. 161; API 1.106.0).
    const burn = fire(HOOKS.injury, { actor: firefighter, damage: { type: "burn", basicDamage: 12 } });
    expect(burn.damage.vulnerabilities).toEqual([{ form: "burn", multiplier: 2, label: expect.stringContaining("TurnoutSteam") }]);
    expect(fire(HOOKS.injury, { actor: firefighter, damage: { type: "cr", basicDamage: 12 } }).damage.vulnerabilities).toBeUndefined();
  });
});

describe("the diver's depth, and the bends on pure oxygen (High-Tech pp. 74, 76)", () => {
  beforeEach(() => { on = { breathingGear: true }; ready(); });

  it("keeps the depth on the diver, so every supply they carry reads it", async () => {
    const small = tank();
    const large = tank("Air Tank, Large");
    const diver = person([small, large]);
    dialogAnswer = { minutes: 10, depth: 66 };
    await actions.get("ht-breathe").run(small, diver);
    expect(airState(large).depthFeet).toBe(66);
    // A loose tank keeps its own.
    const loose = tank();
    dialogAnswer = { minutes: 0, depth: 33 };
    await actions.get("ht-breathe").run(loose, null);
    expect(airState(loose).depthFeet).toBe(33);
  });

  it("warns a diver on a pure-oxygen rebreather below 30', and rolls against the bends at the surface", async () => {
    const rig = piece("Rebreather");
    const diver = person([rig]);
    const depth = (feet: number) => sections.get("ht-breathing-item").listeners({
      querySelector: (selector: string) => (selector === "[data-gcc-ht-dive-depth]" ? { addEventListener: (_e: string, fn: any) => fn({ currentTarget: { value: String(feet) } }) } : null),
    }, rig);
    depth(20);
    await flush();
    expect(chat).toEqual([]);
    depth(45);
    await flush();
    expect(chat.at(-1)).toContain("OxygenDeep");
    depth(10);
    await flush();
    expect(posted).toEqual([]);
    depth(0);
    await flush();
    expect(posted).toEqual([expect.objectContaining({ key: `${MODULE_ID}.ht-bends` })]);
    // The roll: a plain success is agony.
    rollOutcome = { success: true, margin: 2 };
    const message: any = {};
    await cards.get("ht-bends").actions.roll({ message, data: posted[0].data, actor: diver });
    expect(rolls.at(-1)).toMatchObject({ base: 11, tags: ["bends", "HT"] });
    expect(conditions).toEqual([{ key: "agony" }]);
    expect(message.data.result).toContain("Bends.agony");
    // Once up, the risk is spent.
    depth(0);
    await flush();
    expect(posted).toHaveLength(1);
  });

  it("never warns on a mixed-gas rebreather", async () => {
    const rig = piece("Advanced Rebreather");
    person([rig]);
    await sections.get("ht-breathing-item").listeners({ querySelector: (s: string) => (s === "[data-gcc-ht-dive-depth]" ? { addEventListener: (_e: string, fn: any) => fn({ currentTarget: { value: "100" } }) } : null) }, rig);
    await flush();
    expect(chat).toEqual([]);
  });

  it("defaults Scuba (Closed-Circuit) from Scuba at -4, and Scuba from it at -2", () => {
    const skills = [{ name: "Scuba/TL8 (Closed-Circuit)", level: 9, fromDefault: true, item: { system: { points: 0, attribute: "DX" } } }, { name: "Scuba/TL8", level: 14, fromDefault: false, item: { system: { points: 4 } } }];
    fire("gworld.skillLevels", { skills, attributes: { DX: 12 } });
    expect(skills[0]).toMatchObject({ level: 10, fromDefault: true, note: expect.stringContaining("ClosedFromScuba") });
    expect(skills[1]!.level).toBe(14);
    const other = [{ name: "Scuba (Closed-Circuit)", level: 15, fromDefault: false, item: { system: { points: 8 } } }, { name: "Scuba", level: 10, fromDefault: true, item: { system: {} } }];
    fire("gworld.skillLevels", { skills: other, attributes: {} });
    expect(other[1]).toMatchObject({ level: 13, fromDefault: true });
    on = {};
    const off = [{ name: "Scuba (Closed-Circuit)", level: 9, fromDefault: true, item: { system: {} } }, { name: "Scuba", level: 14, item: { system: {} } }];
    fire("gworld.skillLevels", { skills: off, attributes: {} });
    expect(off[0]!.level).toBe(9);
  });
});

describe("environment suits' details (High-Tech pp. 74-76)", () => {
  beforeEach(() => { on = { environmentSuits: true }; ready(); });

  it("lets an NBC suit's seal go when it gets wet, or 72 hours after it was first put on", async () => {
    const suit = piece("NBC Suit");
    const mask = piece("Gas Mask", { system: { tl: "8" } });
    const wearer = person([suit, mask]);
    fire("updateItem", suit, { system: { equipped: true } }, {}, "me");
    await flush();
    expect(suit.flags[MODULE_ID].htNbcSince).toBe(1000);
    on = { environmentSuits: true, breathingGear: true };
    expect(effectsOf(wearer).effects.sealed).toBe(true);
    worldTime += 72 * 3600;
    expect(effectsOf(wearer).effects.sealed).toBeUndefined();
    expect(breathingLines(suit, switches())).toContainEqual("GCC.HT.Breathing.NbcSealLost");
    worldTime = 1000;
    suit.flags[MODULE_ID].htWet = true;
    expect(effectsOf(wearer).effects.sealed).toBeUndefined();
    expect(sections.get("ht-breathing-item").context(suit)).toMatchObject({ nbc: true, wet: true });
  });

  it("rolls HT against high acceleration from the anti-G suit's row, with its +3", async () => {
    const suit = piece("Anti-G Suit");
    const pilot = person([suit]);
    expect(actions.get("ht-acceleration").visible(suit)).toBe(true);
    expect(actions.get("ht-acceleration").visible(piece("Dry Suit"))).toBe(false);
    dialogAnswer = { g: 10, home: 1, braced: true, inverted: false };
    rollOutcome = { success: false, margin: -3, criticalFailure: true };
    await actions.get("ht-acceleration").run(suit, pilot);
    await flush();
    expect(rolls.at(-1)).toMatchObject({ base: 11, tags: ["acceleration", "HT"], modifiers: [{ label: expect.stringContaining("GForceLine"), value: -4 }, { label: "GCC.HT.Breathing.Braced", value: 2 }] });
    expect(injuries).toEqual([expect.objectContaining({ amount: 3, fatigue: true })]);
    expect(conditions).toEqual([{ key: "unconscious", holdRecovery: { seconds: 30 } }]);
    // The suit's +3 goes on any roll tagged for acceleration.
    expect(fire(HOOKS.successRollModifiers, { actor: pilot, tags: ["acceleration", "HT"], modifiers: [] }).modifiers).toEqual([{ label: "Anti-G Suit", value: 3 }]);
    // Under 2.5 G: no roll.
    dialogAnswer = { g: 2, home: 1, braced: false, inverted: false };
    const count = rolls.length;
    await actions.get("ht-acceleration").run(suit, pilot);
    expect(rolls).toHaveLength(count);
    expect(chat.at(-1)).toContain("NoAccelerationRoll");
  });

  it("offers a bomb suit's climate-control tick", () => {
    expect(sections.get("ht-breathing-item").context(piece("Bomb Disposal Suit", { system: { tl: "8" } })).fitted).toEqual({ checked: false });
    expect(breathingLines(piece("Bomb Disposal Suit", { flags: { htClimateFitted: true } }), switches())).toContainEqual("GCC.HT.Breathing.SuitClimate");
  });
});
