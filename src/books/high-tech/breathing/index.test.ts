/**
 * High-Tech's breathing gear and environment suits as the system meets them:
 * trait effects through `gworld.traitEffects`, the air spent through
 * `gworld.fatigueCost` and `gworld.afterSuccessRoll`, the suits' rolls
 * through `gworld.successRollModifiers`, and the row actions -- with only
 * High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { gasReaches } from "../ammunition/explosive.js";
import { airState, airSupply, breathingLines, minutesLeft, readyBreathing, wearsIrritantMask } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  fatigueCost: "gworld.fatigueCost",
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let chat: string[];
let on: Record<string, boolean>;
let dialogAnswer: any;
let targets: any[];

function fakeApi() {
  return {
    combat: { hooks: HOOKS },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
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
  const actor: any = { name: "Diver", isOwner: true, items, system: { tl: "8" } };
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
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  chat = [];
  on = {};
  dialogAnswer = null;
  targets = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets); } },
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
