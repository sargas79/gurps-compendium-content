/**
 * The gun rules as the system meets them: the price modifier, the row, the
 * malfunction and clearing hooks, with Foundry's globals stubbed and the
 * pinned system's own quality rules standing in for `api.rules`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyFirearms, type FirearmSwitches } from "./index.js";

type Listener = (context: any) => void;

let hooks: Map<string, Listener[]>;
let priceModifier: ((item: any, price: { cost: number; weight: number }) => any) | null;
let chat: string[];
let on: Record<string, boolean>;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  malfunction: "gworld.malfunction",
  clearMalfunction: "gworld.clearMalfunction",
  equipmentFailure: "gworld.equipmentFailure",
  objectStats: "gworld.objectStats",
};

function fakeApi(systemRules: Record<string, boolean> = { weaponQuality: true }) {
  return {
    rules,
    registry: { isRuleOn: (key: string) => systemRules[key] === true },
    combat: { hooks: HOOKS },
    data: { hooks: { objectStats: HOOKS.objectStats }, registerPriceModifier: (r: any) => { priceModifier = r.apply; } },
    sheets: { registerSheetSection: vi.fn() },
    actors: { skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null },
    roll: { equipmentUse: () => ({ lines: [{ key: "unfamiliar", label: "Unfamiliar", value: -2 }], tags: ["unfamiliar"], impossible: null }) },
  };
}

const switches: FirearmSwitches = { quality: () => on.quality === true, care: () => on.care === true, immediateAction: () => on.immediateAction === true };

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

function gun(options: { firearm?: Record<string, unknown>; quality?: string; listCost?: number; cost?: number; mode?: Record<string, unknown> } = {}): any {
  return {
    id: "gun1",
    name: "Colt M1911A1",
    type: "equipment",
    isOwner: true,
    system: {
      tl: "7",
      quality: options.quality ?? "good",
      listCost: options.listCost ?? 0,
      cost: options.cost ?? 800,
      weight: 3,
      weaponClass: "",
      meleeModes: [],
      rangedModes: [{ skill: "Guns (Pistol)", accuracy: 2, malfunction: 17, rateOfFire: 3, shots: "7+1(3)", damageType: "pi+", ...options.mode }],
      extensions: { [MODULE_ID]: { firearm: options.firearm ?? {} } },
    },
  };
}

/** A row as the system hands it over: its figures after the Basic Set grade, and the basis before. */
function rowsFor(item: any, grade = "good", row: Record<string, unknown> = {}) {
  const mode = item.system.rangedModes[0];
  return [{
    kind: "ranged",
    mode,
    basis: { accuracy: mode.accuracy, malfunction: mode.malfunction },
    row: {
      accuracy: mode.accuracy + rules.qualityAccuracyBonus("firearm", grade as never, false),
      malfunction: rules.qualityMalfunction(mode.malfunction, grade as never),
      notes: [] as any[],
      atDefault: false,
      minStPenalty: 0,
      ...row,
    },
  }];
}

beforeEach(() => {
  hooks = new Map();
  priceModifier = null;
  chat = [];
  on = {};
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: {
      localize: (key: string) => key,
      format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}`,
    },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0 } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("firearm quality on the system's gun", () => {
  it("reprices an accurate gun from its cost, and takes the Basic Set grade's multiple back out", () => {
    readyFirearms(fakeApi() as never, switches);
    on.quality = true;
    expect(priceModifier!(gun({ firearm: { accurate: 1 } }), { cost: 800, weight: 3 })).toMatchObject({ cost: 1400 });
    // A gun the Basic Set priced fine from its $800 list: fine accurate and reliable come to the same.
    expect(priceModifier!(gun({ quality: "fine", listCost: 800, cost: 1600, firearm: { accurate: 1, reliable: 1 } }), { cost: 1600, weight: 3 })).toBeNull();
    // A fine gun with no work of this book's is priced as a standard one while the switch is on.
    expect(priceModifier!(gun({ quality: "fine", listCost: 800, cost: 1600 }), { cost: 1600, weight: 3 })).toMatchObject({ cost: 800 });
    on.quality = false;
    expect(priceModifier!(gun({ firearm: { accurate: 1 } }), { cost: 800, weight: 3 })).toBeNull();
  });

  it("gives an accurate gun +1 Acc in place of the Basic Set grade's, never both", () => {
    readyFirearms(fakeApi() as never, switches);
    on.quality = true;
    const item = gun({ quality: "fine", firearm: { accurate: 1 } });
    const rows = rowsFor(item, "fine");
    fire(HOOKS.weaponAttacks, { item, rows });
    expect(rows[0]!.row.accuracy).toBe(3);
    // The Basic Set's fine grade gave +1 Malf.; without reliable work it goes.
    expect(rows[0]!.row.malfunction).toBe(17);
  });

  it("leaves a reliable gun at Malf. 17 and rolls a malfunction again", () => {
    readyFirearms(fakeApi() as never, switches);
    on.quality = true;
    const item = gun({ firearm: { reliable: 1 } });
    const rows = rowsFor(item);
    fire(HOOKS.weaponAttacks, { item, rows });
    expect(rows[0]!.row.malfunction).toBe(17);
    expect(rows[0]!.row.notes.map((n: any) => n.label)).toContain("GCC.HT.Firearm.RerollNote");

    // The second roll (3 on the stubbed dice) is under 17: no malfunction after all.
    const actor = { system: { derived: { ranged: [{ itemId: "gun1", modeIndex: 0, atDefault: false, minStPenalty: 0 }] } } };
    const context = fire(HOOKS.malfunction, { actor, item, modeIndex: 0, kind: "stoppage", techLevel: 7, revolver: false });
    expect(context.kind).toBeNull();
    expect(chat.join()).toContain("RerollSaved");
  });

  it("changes nothing while its switch is off", () => {
    readyFirearms(fakeApi() as never, switches);
    const item = gun({ quality: "fine", firearm: { accurate: 2, reliable: 2 } });
    const rows = rowsFor(item, "fine");
    fire(HOOKS.weaponAttacks, { item, rows });
    expect(rows[0]!.row).toMatchObject({ accuracy: 3, malfunction: 18 });
  });
});

describe("gun care", () => {
  it("takes a Malf. off a shooter at default, and the Acc and Malf. the gun has lost", () => {
    readyFirearms(fakeApi() as never, switches);
    on.care = true;
    const item = gun({ firearm: { malfunctionLost: 1, accuracyLost: 1 } });
    const rows = rowsFor(item, "good", { atDefault: true });
    fire(HOOKS.weaponAttacks, { item, rows });
    expect(rows[0]!.row).toMatchObject({ accuracy: 1, malfunction: 15 });
  });

  it("makes a precision gun roll HT against abuse", () => {
    readyFirearms(fakeApi() as never, switches);
    on.care = true;
    const context = fire(HOOKS.equipmentFailure, { item: gun({ firearm: { precision: true, rugged: "military" } }), modifiers: [] });
    expect(context.modifiers.map((m: any) => m.value)).toEqual([-4]);
  });

  it("gives a rugged gun its DR and HT as an object, which everything the system does with the gun reads", () => {
    readyFirearms(fakeApi() as never, switches);
    const stats = (firearm: Record<string, unknown>) => fire(HOOKS.objectStats, { item: gun({ firearm }), actor: null, kind: "unliving", dr: 4, hp: 6, ht: 10, notes: [] });
    expect(stats({ rugged: "rugged" })).toMatchObject({ dr: 4, ht: 10, notes: [] });
    on.care = true;
    expect(stats({ rugged: "rugged" })).toMatchObject({ dr: 8, hp: 6, ht: 12, notes: ["GCC.HT.Firearm.Rugged.rugged"] });
    expect(stats({ rugged: "military" })).toMatchObject({ dr: 6, ht: 11 });
    expect(stats({})).toMatchObject({ dr: 4, ht: 10, notes: [] });
  });

  it("swaps a TL7 pistol's misfire for a stoppage", () => {
    readyFirearms(fakeApi() as never, switches);
    on.care = true;
    const context = fire(HOOKS.malfunction, { actor: null, item: gun(), modeIndex: 0, kind: "misfire", techLevel: 7, revolver: false });
    expect(context.kind).toBe("stoppage");
  });
});

describe("Immediate Action", () => {
  function clearing(actor: any, item = gun()) {
    return fire(HOOKS.clearMalfunction, {
      actor,
      item,
      modeIndex: 0,
      malfunction: { kind: "stoppage", label: "Stoppage", modeIndex: 0 },
      rolls: [
        { key: "armoury", label: "Armoury", level: 12, modifier: 0 },
        { key: "weapon", label: "Guns (Pistol)", level: 13, modifier: -4 },
      ],
      readyManeuvers: 3,
      hours: 0,
      modifiers: [],
      aids: [],
      refusal: null,
    });
  }

  it("clears a pistol's stoppage at -4 in two Ready maneuvers, with its familiarity line", () => {
    readyFirearms(fakeApi() as never, switches);
    on.immediateAction = true;
    const context = clearing({ items: [], skills: {} });
    expect(context.rolls.map((r: any) => r.modifier)).toEqual([-4, -4]);
    expect(context.readyManeuvers).toBe(2);
    expect(context.modifiers).toEqual([{ label: "Unfamiliar", value: -2 }]);
  });

  it("buys the -4 off with the technique, and offers Armorer's Gift and Weapon Bond", () => {
    readyFirearms(fakeApi() as never, switches);
    on.immediateAction = true;
    const actor = {
      skills: { "Guns (Pistol)": 14 },
      items: [
        { type: "technique", name: "Immediate Action", system: { prerequisite: "Guns (Pistol)", derived: { level: 13, levels: 3 } } },
        { type: "trait", name: "Armorer's Gift", system: { specialty: "Pistol" } },
        { type: "trait", name: "Weapon Bond (Colt M1911A1)", system: { specialty: "" } },
      ],
    };
    const context = clearing(actor);
    expect(context.rolls.find((r: any) => r.key === "weapon").modifier).toBe(-1);
    expect(context.aids.map((a: any) => [a.modifier, a.checked])).toEqual([[2, true], [1, true]]);
  });

  it("takes four Ready maneuvers for a belt, three with an assistant gunner", () => {
    readyFirearms(fakeApi() as never, switches);
    on.immediateAction = true;
    const context = clearing({ items: [] }, gun({ mode: { skill: "Gunner (Machine Gun)", shots: "250(5)", rateOfFire: 10 } }));
    expect(context.readyManeuvers).toBe(4);
    expect(context.aids[0]).toMatchObject({ readyManeuvers: 3 });
  });

  it("leaves a misfire, and everything while the switch is off, to the Basic Set", () => {
    readyFirearms(fakeApi() as never, switches);
    const context = clearing({ items: [] });
    expect(context.rolls.map((r: any) => r.modifier)).toEqual([0, -4]);
    expect(context.readyManeuvers).toBe(3);
  });
});
