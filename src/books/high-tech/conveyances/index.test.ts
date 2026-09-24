/**
 * The personal conveyances as the system meets them: Move through
 * `gworld.moveModifiers`, the penny-farthing's -1 through
 * `gworld.skillBonuses`, the ridden conveyance's weight through
 * `gworld.carriedWeight`, the safety bicycle's weight by TL, and the spill
 * and long-ride row actions -- with only High-Tech's switch on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyConveyances, relativeSkill } from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let cards: Map<string, any>;
let sections: Map<string, any>;
let prices: any[];
let damage: any[];
let successes: any[];
let injuries: any[];
let towed: any[];
let posted: any[];
let updated: any[];
let chat: string[];
let on: boolean;
let successResult: any;
let dialogAnswer: any;

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: () => false },
    data: {
      hooks: { skillBonuses: "gworld.skillBonuses", moveModifiers: "gworld.moveModifiers", carriedWeight: "gworld.carriedWeight" },
      registerPriceModifier: (m: any) => prices.push(m),
    },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    chat: {
      registerChatCard: (c: any) => cards.set(c.key, c),
      post: async (key: string, data: any, opts: any) => { posted.push({ key, data, options: opts }); },
      update: async (message: any, data: any) => { updated.push({ message, data }); return true; },
    },
    actors: {
      derived: (actor: any) => actor?.derived ?? null,
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? null,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      applyInjury: async (actor: any, o: any) => { injuries.push({ actor, ...o }); return { pool: "fp" }; },
      spendFatigue: async (actor: any, fp: number, o: any = {}) => { injuries.push({ actor, amount: fp, spent: true, ...o }); return { fpLost: fp }; },
      tow: async (actor: any, o: any) => { towed.push({ actor, ...o }); actor.flags = { ...(actor.flags ?? {}), gworld: { towing: o } }; return { effective: o.weight / (o.smooth ? 20 : 10), limit: 300, movable: true }; },
      stopTowing: async (actor: any) => { towed.push({ actor, stopped: true }); return true; },
    },
    hazards: {
      fall: async (actor: any, o: any) => { damage.push({ actor, fall: true, ...o }); return 3; },
    },
    roll: {
      damage: async (o: any) => { damage.push(o); return 0; },
      success: async (o: any) => { successes.push(o); return successResult; },
    },
  };
}

function gear(name: string, conveyance: Record<string, unknown>, more: Record<string, any> = {}): any {
  return { id: name, name, type: "equipment", system: { tl: "7", carried: true, equipped: true, quantity: 1, extensions: { [MODULE_ID]: { conveyance } }, ...more } };
}

/** A learned skill as the system prepares it: its relative level for the points and its bonus lines. */
function learned(name: string, relativeLevel: number, lines: Array<{ value: number }> = []): any {
  return { type: "skill", name, system: { derived: { level: 10 + relativeLevel, fromDefault: false, relativeLevel, bonusLines: lines } } };
}

function rider(items: any[] = [], flags: Record<string, unknown> = {}, more: Record<string, any> = {}): any {
  return {
    name: "Rider",
    items,
    attributes: { DX: 10, HT: 11 },
    skills: {},
    system: { hp: { max: 10 } },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    ...more,
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const move = (actor: any, value = 5) => fire("gworld.moveModifiers", { actor, move: value, lines: [] }).lines;
/** Move once the lines are applied, as the system applies them. */
const moveAfter = (actor: any, value = 5) => {
  const lines = move(actor, value);
  const factor = lines.reduce((p: number, l: any) => p * (l.multiplier ?? 1), 1);
  return Math.floor(value * factor) + lines.reduce((s: number, l: any) => s + (l.value ?? 0), 0);
};
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

const offRoadBike = () => gear("Off-Road Bike", { kind: "bicycle", enhancedMove: 0.5 });
const pennyFarthing = () => gear("Penny-Farthing", { kind: "bicycle", enhancedMove: 0.5, roadBound: true, skillModifier: -1, spillYards: 2 }, { tl: "5" });

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  cards = new Map();
  sections = new Map();
  prices = [];
  damage = [];
  successes = [];
  injuries = [];
  towed = [];
  posted = [];
  updated = [];
  chat = [];
  on = false;
  successResult = { success: true };
  dialogAnswer = null;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  readyConveyances(fakeApi() as never, () => on);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with the switch off", () => {
  it("changes nothing", () => {
    const actor = rider([offRoadBike(), learned("Bicycling", 8)]);
    expect(move(actor)).toEqual([]);
    const context = fire("gworld.skillBonuses", { actor: rider([pennyFarthing()]), name: "Bicycling", lines: [] });
    expect(context.lines).toEqual([]);
    const weight = fire("gworld.carriedWeight", { actor, lines: [{ item: actor.items[0], weight: 30, counts: true }] });
    expect(weight.lines[0].counts).toBe(true);
    expect(prices[0].apply(gear("Bicycle", { kind: "bicycle", weightTl7: 0.8, weightTl8: 0.5 }, { tl: "8" }), { cost: 50, weight: 60 })).toBeNull();
    expect(actions.get("ht-conveyance-spill").visible(pennyFarthing())).toBe(false);
    expect(actions.get("ht-conveyance-long-ride").visible(offRoadBike())).toBe(false);
    expect(sections.get("ht-conveyance-item").visible(offRoadBike())).toBe(false);
  });
});

describe("personal conveyances (High-Tech pp. 226, 230-231)", () => {
  beforeEach(() => { on = true; });

  it("moves a bicycle's rider at the better of relative skill and Move, times Enhanced Move", () => {
    // The book's example: Move 5, Bicycling DX+5 -- Move 5 x1.5 = 7.
    expect(moveAfter(rider([offRoadBike(), learned("Bicycling", 5)]))).toBe(7);
    // Bicycling DX+8: 8 x1.5 = 12, as one line naming the skill.
    const lines = move(rider([offRoadBike(), learned("Bicycling", 6, [{ value: 2 }])]));
    expect(lines).toEqual([{ label: expect.stringContaining("RideLineSkill"), value: 7 }]);
    // Unlearned, at DX-4: Move 5 x1.5.
    expect(moveAfter(rider([offRoadBike()]))).toBe(7);
    // Not ridden (not in use), no change.
    expect(move(rider([gear("Off-Road Bike", { kind: "bicycle", enhancedMove: 0.5 }, { equipped: false })]))).toEqual([]);
  });

  it("multiplies downhill Move by the slope and drops Road-Bound Enhanced Move off the road", () => {
    const racing = gear("Racing Bike", { kind: "bicycle", enhancedMove: 1, roadBound: true });
    expect(moveAfter(rider([offRoadBike(), learned("Bicycling", 5)], { htSlope: 7.5 }))).toBe(14);
    expect(move(rider([offRoadBike()], { htSlope: 15 }))[1]).toEqual({ label: expect.stringContaining("DownhillLine"), value: 14 });
    expect(moveAfter(rider([racing]))).toBe(10);
    expect(moveAfter(rider([racing], { htOffRoad: true }))).toBe(5);
    expect(moveAfter(rider([offRoadBike()], { htOffRoad: true }))).toBe(7);
  });

  it("moves a skateboarder at Move times the board's, and the powered wheelchairs at Move 3", () => {
    const board = gear("Skateboard", { kind: "skateboard", enhancedMove: 0.5, roadBound: true });
    expect(moveAfter(rider([board, learned("Sports (Skateboard)", 8)]))).toBe(7);
    expect(moveAfter(rider([board], { htSlope: 30 }))).toBe(28);
    expect(moveAfter(rider([gear("Electric Wheelchair", { kind: "wheelchair", move: 3 })]), 0)).toBe(3);
    // The muscle-powered chair and the surfboard leave Move alone.
    expect(move(rider([gear("Wheelchair (TL8)", { kind: "wheelchair" })]))).toEqual([]);
    expect(move(rider([gear("Foam-Core Surfboard", { kind: "surfboard" })]))).toEqual([]);
  });

  it("puts a penny-farthing's -1 on Bicycling while it is ridden", () => {
    const lines = fire("gworld.skillBonuses", { actor: rider([pennyFarthing()]), name: "Bicycling", lines: [] }).lines;
    expect(lines).toEqual([{ key: "conveyance", label: "Penny-Farthing", value: -1, source: MODULE_ID }]);
    expect(fire("gworld.skillBonuses", { actor: rider([pennyFarthing()]), name: "Driving (Motorcycle)", lines: [] }).lines).toEqual([]);
    // Unlearned, the -1 comes on top of the default.
    expect(relativeSkill(fakeApi() as never, rider([]), "Bicycling", -1)).toBe(-5);
  });

  it("leaves the conveyance ridden out of the carried weight", () => {
    const bike = offRoadBike();
    const pack = { id: "pack" };
    const context = fire("gworld.carriedWeight", { actor: rider([bike]), lines: [{ item: bike, weight: 30, counts: true }, { item: pack, weight: 20, counts: true }] });
    expect(context.lines[0]).toMatchObject({ counts: false, reason: "GCC.HT.Conveyance.Ridden" });
    expect(context.lines[1].counts).toBe(true);
  });

  it("lightens the safety bicycle at TL7 and TL8", () => {
    const at = (tl: string) => prices[0].apply(gear("Bicycle", { kind: "bicycle", weightTl7: 0.8, weightTl8: 0.5 }, { tl }), { cost: 50, weight: 60 });
    expect(at("6")).toBeNull();
    expect(at("7")).toMatchObject({ cost: 50, weight: 48 });
    expect(at("8")).toMatchObject({ cost: 50, weight: 30 });
  });

  it("gives a surfer water Move 1 paddling, or the wave's Move, and leaves ground Move alone", () => {
    const board = gear("Foam-Core Surfboard", { kind: "surfboard" });
    const paddler = rider([board]);
    const water = fire("gworld.moveModifiers", { actor: paddler, move: 2, medium: "water", lines: [] });
    expect(water.lines).toEqual([{ label: expect.stringContaining("PaddleLine"), value: -1, medium: "water" }]);
    const surfer = rider([board], { htSurfMove: 14 });
    expect(fire("gworld.moveModifiers", { actor: surfer, move: 2, medium: "water", lines: [] }).lines).toEqual([{ label: expect.stringContaining("WaveLine"), value: 12, medium: "water" }]);
    expect(fire("gworld.moveModifiers", { actor: surfer, move: 5, medium: "ground", lines: [] }).lines).toEqual([]);
    // A bicycle has no water Move to give.
    expect(fire("gworld.moveModifiers", { actor: rider([offRoadBike()]), move: 1, medium: "water", lines: [] }).lines).toEqual([]);
  });

  it("moves cargo on a bicycle as a two-wheeled cart through the system's towing, and stops", async () => {
    const bike = gear("Bicycle", { kind: "bicycle", enhancedMove: 0.5 }, { weight: 30, equipped: false });
    const flags: Record<string, unknown> = {};
    const actor = rider([bike], flags, { unsetFlag: async (_scope: string, key: string) => { delete flags[key]; } });
    dialogAnswer = { cargo: 170, smooth: true };
    expect(actions.get("ht-conveyance-cargo").visible(bike, actor)).toBe(true);
    actions.get("ht-conveyance-cargo").run(bike, actor);
    await flush();
    expect(towed[0]).toMatchObject({ weight: 200, conveyance: "cart", smooth: true, label: "Bicycle" });
    expect(actions.get("ht-conveyance-cargo").visible(bike, actor)).toBe(false);
    expect(actions.get("ht-conveyance-cargo-stop").visible(bike, actor)).toBe(true);
    // The bike is in the towed load, not carried as well.
    const line = { item: bike, counts: true };
    actor.items.get = (id: string) => (id === bike.id ? bike : undefined);
    fire("gworld.carriedWeight", { actor, lines: [line] });
    expect(line.counts).toBe(false);
    actions.get("ht-conveyance-cargo-stop").run(bike, actor);
    await flush();
    expect(towed[1]).toMatchObject({ stopped: true });
    expect(actions.get("ht-conveyance-cargo").visible(bike, actor)).toBe(true);
  });

  it("rolls a penny-farthing's spill as a two-yard fall, its damage from the card", async () => {
    const actor = rider([pennyFarthing()]);
    expect(actions.get("ht-conveyance-spill").visible(pennyFarthing())).toBe(true);
    expect(actions.get("ht-conveyance-spill").visible(offRoadBike())).toBe(false);
    actions.get("ht-conveyance-spill").run(actor.items[0], actor);
    await flush();
    const card = posted[0];
    const fall = rules.fallingDamage({ hitPoints: 10, yardsFallen: 2 });
    expect(card.key).toBe(`${MODULE_ID}.ht-conveyance-card`);
    expect(card.data.landing.formula).toBe(rules.formatDiceAdds({ dice: fall.damage.dice, adds: fall.damage.modifier }));
    await cards.get("ht-conveyance-card").actions.landing({ message: {}, data: card.data, actor });
    // The system's falling procedure takes it from there (API 1.104.0).
    expect(damage[0]).toMatchObject({ actor, fall: true, yards: 2 });
    expect(updated[0].data.landing.rolled).toBe(true);
  });

  it("rolls a long ride against the better of HT and HT-based Bicycling, 1 FP on a failure", async () => {
    const actor = rider([offRoadBike(), learned("Bicycling", 3)]);
    dialogAnswer = { pace: "paced" };
    successResult = { success: false };
    actions.get("ht-conveyance-long-ride").run(actor.items[0], actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 14, skill: "Bicycling", kind: "skill", tags: ["longRide", "HT"] });
    expect(injuries[0]).toMatchObject({ amount: 1, spent: true });
    expect(chat[0]).toContain("RideTired");
    // Unskilled, HT beats DX-4 based on HT.
    successResult = { success: true };
    const novice = rider([offRoadBike()]);
    actions.get("ht-conveyance-long-ride").run(novice.items[0], novice);
    await flush();
    expect(successes[1]).toMatchObject({ base: 11, skill: "HT", kind: "attribute" });
    expect(injuries).toHaveLength(1);
  });

  it("describes each conveyance on its item sheet", () => {
    const lines = (item: any) => sections.get("ht-conveyance-item").context(item).lines as string[];
    expect(lines(pennyFarthing()).join(" ")).toContain("SpillItem");
    expect(lines(gear("Foam-Core Surfboard", { kind: "surfboard" }))[0]).toContain('"least":12,"most":15');
    expect(lines(gear("Advanced Wheelchair", { kind: "wheelchair", move: 3, stairs: true }))).toHaveLength(2);
    expect(sections.get("ht-conveyance-item").visible(gear("Rope", {}))).toBe(false);
  });
});
