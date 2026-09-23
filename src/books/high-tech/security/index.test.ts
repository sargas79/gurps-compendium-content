/**
 * Locks, safes, traps and barriers as the system meets them: the lock
 * quality's price and the item sheet, picking a lock, and the GM tool's
 * traps and barriers -- with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { SECURITY_TABLES } from "../../../shared/security/index.js";
import { SECURITY_TABLE, lockRecord, pickModifiers, readyHighTechSecurity, runTrapOn } from "./index.js";

let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let prices: any[];
let successes: any[];
let damages: any[];
let conditions: any[];
let shocks: any[];
let postures: any[];
let chat: string[];
let on: Record<string, boolean>;
let successResults: any[];
let damageRoll: number;
let dialogAnswer: any;
let targets: any[];
let equipmentUse: any;
let hooks: Map<string, Array<(...args: any[]) => void>>;

function fakeApi() {
  return {
    rules,
    data: { hooks: { objectStats: "gworld.objectStats" }, registerPriceModifier: (m: any) => prices.push(m) },
    sheets: {
      registerGmTool: (t: any) => tools.set(t.key, t),
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: (actor: any) => actor?.derived ?? {},
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor: actor.name, ...c }); return "c1"; },
      setPosture: async (actor: any, posture: string) => { postures.push({ actor: actor.name, posture }); },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResults.shift() ?? { success: true, margin: 0 }; },
      damage: async (o: any) => { damages.push(o); return damageRoll; },
      equipmentUse: () => equipmentUse,
    },
    hazards: { shock: async (o: any) => { shocks.push(o); } },
  };
}

function gear(name: string, quality = "basic", more: Record<string, any> = {}): any {
  return {
    id: name.replace(/\W/g, ""),
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "5", carried: true, extensions: { [MODULE_ID]: { lock: { quality } } }, ...more },
    update: vi.fn(),
  };
}

const person = (name: string, more: Record<string, any> = {}) => ({
  name,
  items: [] as any[],
  system: { tl: 8 },
  attributes: { ST: 10, DX: 12, IQ: 11, HT: 11, Will: 11, Per: 12 },
  skills: {} as Record<string, number>,
  derived: { thrust: "1d-2", move: 5, senses: [{ sense: "vision", score: 12 }], drByLocation: { foot: 2, torso: 0 } },
  ...more,
});

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyHighTechSecurity(fakeApi() as never, { locks: rule("locksAndSafes"), traps: rule("trapsAndBarriers") });
}

const lines = (item: any): string[] => sections.get("ht-security-item").context(item).lines;

beforeEach(() => {
  actions = new Map();
  sections = new Map();
  tools = new Map();
  prices = [];
  successes = [];
  damages = [];
  conditions = [];
  shocks = [];
  postures = [];
  chat = [];
  on = {};
  successResults = [];
  damageRoll = 3;
  dialogAnswer = null;
  targets = [];
  equipmentUse = { lines: [], tags: [], impossible: null };
  hooks = new Map();
  vi.stubGlobal("Hooks", { on: (name: string, fn: (...args: any[]) => void) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
  });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } },
  });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  SECURITY_TABLES.clear();
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const lock = gear("Lock, Tough", "fine");
    expect(prices[0].apply(lock, { cost: 100, weight: 0.5 })).toBeNull();
    expect(sections.get("ht-security-item").visible(lock)).toBe(false);
    expect(actions.get("ht-pick-lock").visible(gear("Lockpick Gun"))).toBe(false);
    expect(tools.get("ht-traps").visible()).toBe(false);
  });
});

describe("locks and safes, with only High-Tech's switch on", () => {
  beforeEach(() => {
    on = { locksAndSafes: true };
    ready();
  });

  it("reprices a lock by its quality: x5 good, x20 fine (p. 203)", () => {
    expect(prices[0].apply(gear("Lock, Tough", "basic"), { cost: 100, weight: 0.5 })).toBeNull();
    expect(prices[0].apply(gear("Lock, Tough", "good"), { cost: 100, weight: 0.5 })).toMatchObject({ cost: 500, weight: 0.5 });
    expect(prices[0].apply(gear("Bank Safe", "fine"), { cost: 5000, weight: 750 })).toMatchObject({ cost: 100000 });
    expect(prices[0].apply(gear("Crowbar", "fine"), { cost: 20, weight: 3 })).toBeNull();
  });

  it("leaves another book's record alone", () => {
    const other = { ...gear("Lock, Tough", "fine"), flags: { [MODULE_ID]: { book: "ultra-tech" } } };
    expect(lockRecord(other)).toBeNull();
  });

  it("shows a lock's toughness and grade, and a safe's DR and HP from the shared table", () => {
    expect(lines(gear("Lock, Tough", "fine"))).toEqual([
      'GCC.HT.Security.Item.Toughness {"dr":12,"hp":3,"toughness":"GCC.HT.Security.Toughness.tough"}',
      'GCC.HT.Security.Item.Pick.lock {"modifier":"-5"}',
    ]);
    expect(lines(gear("Bank Vault"))[0]).toBe('GCC.HT.Security.Item.Safe {"dr":400,"hp":127,"tl":5}');
    expect(lines(gear("Signature Pad"))).toContain('GCC.HT.Security.Item.Forgery {"modifier":-3}');
    expect(sections.get("ht-security-item").context(gear("Lock, Weak")).quality.options.map((o: any) => o.value)).toEqual(["basic", "good", "fine"]);
  });

  it("makes a lock's toughness, or a safe's own figures, the object the system breaks (p. 203)", () => {
    const stats = (item: any) => {
      const context = { item, dr: 4, hp: 7, notes: [] as string[] };
      for (const listener of hooks.get("gworld.objectStats") ?? []) listener(context);
      return [context.dr, context.hp, context.notes.length];
    };
    expect(stats(gear("Lock, Standard"))).toEqual([6, 3, 1]);
    expect(stats(gear("Fire Safe"))).toEqual([20, 19, 1]);
    expect(stats(gear("Electronic Lock"))).toEqual([4, 7, 0]);
  });

  it("writes the quality the sheet picks to the module's own field", () => {
    const lock = gear("Electronic Lock");
    const select: any = { value: "fine", addEventListener: (_: string, fn: () => void) => fn() };
    sections.get("ht-security-item").listeners({ querySelectorAll: () => [select] }, lock);
    expect(lock.update).toHaveBeenCalledWith({ [`system.extensions.${MODULE_ID}.lock.quality`]: "fine" });
  });

  it("picks a fine lock with a lockpick gun at -5 and -5 more (p. 213)", () => {
    const burglar = person("Burglar");
    const { modifiers } = pickModifiers(fakeApi() as never, burglar, "gun", { name: "Lock", kind: "lock", quality: "fine", tl: 8 }, { stethoscope: false, endoscope: false, timeFactor: 1 });
    expect(modifiers.map((m) => m.value)).toEqual([-5, -5]);
  });

  it("gives a TL8 burglar +5 against a TL5 lock (p. 203)", () => {
    const burglar = person("Burglar");
    const { modifiers } = pickModifiers(fakeApi() as never, burglar, "picks", { name: "Lock", kind: "lock", quality: "good", tl: 5 }, { stethoscope: true, endoscope: true, timeFactor: 2 });
    expect(modifiers).toEqual([
      { label: 'GCC.HT.Security.Pick.Older {"lock":5,"skill":8}', value: 5 },
      { label: "GCC.HT.Security.Pick.Stethoscope", value: 2 },
      { label: "GCC.HT.Security.Pick.Endoscope", value: 2 },
      { label: "GCC.HT.Security.Pick.TimeSpent", value: 1 },
    ]);
  });

  it("takes the system's TL line against a lock newer than the skill, and refuses what it refuses", () => {
    equipmentUse = { lines: [{ key: "techLevel", label: "TL9 equipment, TL7 skill", value: -2 }, { key: "unfamiliar", label: "x", value: -2 }], tags: [], impossible: null };
    const burglar = person("Burglar", { system: { tl: 7 } });
    const { modifiers } = pickModifiers(fakeApi() as never, burglar, "picks", { name: "Lock", kind: "lock", quality: "good", tl: 9 }, { stethoscope: false, endoscope: false, timeFactor: 1 });
    expect(modifiers).toEqual([{ label: "TL9 equipment, TL7 skill", value: -2 }]);
  });

  it("picks a targeted character's lock from the tool's row action", async () => {
    const door = person("Door");
    const lock = gear("Lock, Standard", "fine", { tl: "8" });
    door.items.push(lock);
    targets = [door];
    const burglar = person("Burglar");
    burglar.skills.Lockpicking = 14;
    dialogAnswer = { lock: "0", kind: "lock", quality: "good", tl: 8, time: 1, stethoscope: false, endoscope: false };
    successResults = [{ success: true, margin: 1 }];
    const gun = gear("Lockpick Gun");
    await actions.get("ht-pick-lock").run(gun, burglar);
    await new Promise((r) => setTimeout(r, 0));
    expect(successes[0]).toMatchObject({ base: 14, skill: "Lockpicking", item: gun });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-5, -5]);
    expect(chat[0]).toContain("GCC.HT.Security.Pick.Opened");
    expect(chat[0]).toContain('GCC.HT.Security.Seconds {\\"seconds\\":5}');
  });
});

describe("traps and barriers, with only High-Tech's switch on", () => {
  beforeEach(() => {
    on = { trapsAndBarriers: true };
    ready();
  });

  const answer = (kind: string, more: Record<string, unknown> = {}) => ({ kind, yards: 1, seconds: 1, metal: false, watching: false, hidden: true, fishingLine: false, dirty: false, ...more }) as never;

  it("offers the GM tool and the records' figures", () => {
    expect(tools.get("ht-traps").visible()).toBe(true);
    expect(lines(gear("Caltrops (one hex)"))[0]).toContain("GCC.HT.Security.Item.Caltrops");
    expect(lines(gear("Spike Strip (per yard)"))[0]).toBe('GCC.HT.Security.Item.SpikeStrip {"driving":-4,"topSpeed":0.5,"seconds":5}');
    expect(lines(gear("Lock, Tough"))).toEqual([]);
  });

  it("rolls caltrops' Vision at Move 5 and not watching, then thrust-3 to the foot per caltrop (p. 203)", async () => {
    const runner = person("Runner");
    successResults = [{ success: false, margin: 2 }];
    damageRoll = 2;
    await runTrapOn(fakeApi() as never, [runner], answer("caltrops"));
    expect(successes[0]).toMatchObject({ base: 12 });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2, -2]);
    expect(damages).toHaveLength(2);
    expect(damages[0]).toMatchObject({ formula: "1d-5", damageType: "imp", calledShot: { hitLocation: "foot", addonLocation: null } });
    expect(chat[0]).toContain('"count":2');
    expect(chat[0]).toContain("GCC.HT.Security.Trap.Lodged");
  });

  it("stuns on a cattle fence and holds the recovery while the contact lasts (p. 204)", async () => {
    const victim = person("Victim");
    successResults = [{ success: true, margin: 1 }, { success: false, margin: 1 }];
    await runTrapOn(fakeApi() as never, [victim], answer("cattleFence", { seconds: 5 }));
    expect(successes).toHaveLength(2);
    expect(conditions).toEqual([{ actor: "Victim", key: "stunned", holdRecovery: { seconds: 3 } }]);
  });

  it("runs a lethal fence as a lethal shock a second", async () => {
    await runTrapOn(fakeApi() as never, [person("Victim")], answer("lethalFence", { seconds: 2, metal: true }));
    expect(shocks.map((s) => [s.kind, s.formula, s.metalArmor, s.contactSeconds])).toEqual([["lethal", "3d", true, 1], ["lethal", "3d", true, 0]]);
  });

  it("tears, cuts and snags in razor wire, with the Will roll at minus the injury (p. 204)", async () => {
    const victim = person("Victim");
    successResults = [{ success: true, margin: 1 }, { success: false, margin: 2 }, { success: true, margin: 0 }];
    damageRoll = 2;
    await runTrapOn(fakeApi() as never, [victim], answer("razorWire", { yards: 3 }));
    expect(successes[0].modifiers[0].value).toBe(-5);
    expect(damages[0]).toMatchObject({ formula: "1d-3", damageType: "cut" });
    expect(successes[2].modifiers[0].value).toBe(-3);
    expect(chat[0]).toContain("GCC.HT.Security.Barrier.Snagged");
  });

  it("trips someone who misses a hidden tripwire and fails DX-2", async () => {
    successResults = [{ success: false, margin: 1 }, { success: false, margin: 1 }];
    await runTrapOn(fakeApi() as never, [person("Walker")], answer("tripwire", { fishingLine: true }));
    expect(successes[0].modifiers[0].value).toBe(-2);
    expect(successes[1].modifiers[0].value).toBe(-2);
    expect(postures).toEqual([{ actor: "Walker", posture: "prone" }]);
  });

  it("leaves a car stopper to vehicles and the Electrical", async () => {
    await runTrapOn(fakeApi() as never, [person("Walker")], answer("carStopper"));
    expect(successes).toHaveLength(0);
    expect(chat[0]).toContain("GCC.HT.Security.Barrier.Unaffected");
  });

  it("registers this book's table with the shared engine at init", () => {
    SECURITY_TABLES.register(SECURITY_TABLE);
    expect(SECURITY_TABLES.forBook("high-tech")?.safes["Depository"]).toEqual({ dr: 800, hp: 345 });
  });
});
