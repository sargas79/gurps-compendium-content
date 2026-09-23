/**
 * High-Tech's security screening, surveillance and jamming as the system meets
 * them: the row buttons and sheet lines under their switches, the spike mike's
 * hearing, the metal detector's search against undercover clothing, the bug
 * sweep, and jammers found on the map -- with only High-Tech's switches on
 * (decision D1). The shared bug sweep is also rolled as Ultra-Tech's sweeper
 * calls it, so its contest is unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import type * as Shared from "../../../shared/surveillance/index.js";
import type * as Book from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let successes: any[];
let contests: any[];
let chat: any[];
let on: Set<string>;
let dialogAnswer: any;
let targets: any[];
let tokens: any[];
let successResult: any;
let contestOutcome: string;

const key = (k: string) => `${MODULE_ID}.${k}`;

function fakeApi() {
  return {
    registry: { isRuleOn: (k: string) => on.has(k) },
    combat: { hooks: { successRollModifiers: "gworld.successRollModifiers" } },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, k: string) => actor?.attributes?.[k] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: contestOutcome, marginOfVictory: 2 }; },
    },
  };
}

let n = 0;
function gear(name: string, more: Record<string, any> = {}, flags: Record<string, any> = {}): any {
  n += 1;
  return {
    id: `item${n}`,
    name,
    type: "equipment",
    system: { tl: "7", carried: true, equipped: false, equipmentQuality: "basic", forSkills: [], ...more },
    flags: { [MODULE_ID]: { book: "high-tech", ...flags } },
    setFlag: vi.fn(async function (this: any, _m: string, k: string, v: unknown) { this.flags[MODULE_ID][k] = v; }),
  };
}

/** A character at a spot on the map, in yards. */
function character(name: string, items: any[], more: Record<string, any> = {}, at = 0): any {
  const actor: any = { name, uuid: `Actor.${name}`, items, attributes: { IQ: 12, DX: 11, Per: 12 }, skills: {}, ...more };
  (actor.items as any).get = (id: string) => items.find((i) => i.id === id);
  actor.getActiveTokens = () => [{ center: { x: at, y: 0 }, actor }];
  for (const item of items) item.parent = actor;
  tokens.push({ actor });
  return actor;
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

let book: typeof Book;
let shared: typeof Shared;

async function load(): Promise<void> {
  vi.resetModules();
  const tables = await import("../../../shared/book-tables.js");
  tables.setRuleReader((k) => on.has(k));
  shared = await import("../../../shared/surveillance/index.js");
  book = await import("./index.js");
  book.initSurveillance(key("jamming"));
  const api = fakeApi();
  book.readySurveillance(api as never, { screening: () => on.has(key("securityScreening")), surveillance: () => on.has(key("surveillanceGear")), jamming: () => on.has(key("jamming")) });
}

beforeEach(async () => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  tools = new Map();
  successes = [];
  contests = [];
  chat = [];
  on = new Set();
  dialogAnswer = null;
  targets = [];
  tokens = [];
  successResult = { success: true, criticalFailure: false };
  contestOutcome = "first";
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` }, user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); }, isGM: true } });
  vi.stubGlobal("Hooks", { on: (hook: string, fn: Listener) => hooks.set(hook, [...(hooks.get(hook) ?? []), fn]) });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } },
  });
  vi.stubGlobal("ChatMessage", { implementation: { create: async (m: any) => chat.push(m), getSpeaker: () => ({}), getWhisperRecipients: () => ["gm"] } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("canvas", {
    tokens: { get placeables() { return tokens; }, controlled: [] },
    grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(a.x - b.x) }) },
  });
  await load();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the switches (D1: High-Tech's alone)", () => {
  it("shows each button only under its own switch", () => {
    const detector = gear("Handheld Metal Detector (TL7)");
    const sweeper = gear("Bug Detector");
    const jammer = gear("Area Jammer (TL7)");
    const radio = gear("Small Radio (TL7)");
    expect(actions.get("ht-screen").visible(detector)).toBe(false);
    expect(actions.get("ht-bug-sweep").visible(sweeper)).toBe(false);
    expect(actions.get("jammer-switch").visible(jammer)).toBe(false);
    expect(actions.get("jammer-use-near").visible(radio)).toBe(false);
    on.add(key("securityScreening"));
    expect(actions.get("ht-screen").visible(detector)).toBe(true);
    expect(actions.get("ht-bug-sweep").visible(sweeper)).toBe(false);
    on.add(key("surveillanceGear"));
    expect(actions.get("ht-bug-sweep").visible(sweeper)).toBe(true);
    on.add(key("jamming"));
    expect(actions.get("jammer-switch").visible(jammer)).toBe(true);
    expect(actions.get("jammer-use-near").visible(radio)).toBe(true);
    expect(tools.get("ht-security-system").visible()).toBe(true);
  });

  it("puts the gear's figures on its sheet", () => {
    const section = sections.get("ht-surveillance-item");
    const mike = gear("Spike Mike");
    expect(section.visible(mike)).toBe(false);
    on.add(key("surveillanceGear"));
    expect(section.context(mike).lines[0]).toContain('"levels":3');
    on.add(key("jamming"));
    expect(section.context(gear("Expendable Radio Jammer")).lines[0]).toContain('"skill":18');
  });
});

describe("a spike mike (p. 208)", () => {
  const effects = (actor: any) => fire("gworld.traitEffects", { actor, effects: { parabolicHearing: 0 }, sources: [] });

  it("is Parabolic Hearing at (TL-4) levels while in use", () => {
    on.add(key("surveillanceGear"));
    const spike = gear("Spike Mike", { equipped: true });
    const laser = gear("Laser Spike Mike", { tl: "8", equipped: true });
    expect(effects(character("Ann", [spike])).effects.parabolicHearing).toBe(3);
    const context = effects(character("Bo", [spike, laser]));
    expect(context.effects.parabolicHearing).toBe(4);
    expect(context.sources.at(-1)).toEqual({ effect: "parabolicHearing", label: "Laser Spike Mike", value: 4 });
  });

  it("does nothing carried but not in use, or with the switch off", () => {
    expect(effects(character("Cy", [gear("Spike Mike", { equipped: true })])).effects.parabolicHearing).toBe(0);
    on.add(key("surveillanceGear"));
    expect(effects(character("Di", [gear("Spike Mike")])).effects.parabolicHearing).toBe(0);
  });
});

describe("a metal detector's search (p. 206)", () => {
  function smuggler(): any {
    const clothes = gear("Undercover Clothing (Ordinary Clothes, +1)", { equipmentQuality: "good", forSkills: ["Holdout"] });
    const holdout = { id: "skill1", name: "Holdout", type: "skill", system: { derived: { level: 13, toolItemId: clothes.id, toolBonus: 1 } } };
    return character("Smuggler", [clothes, holdout], { skills: { Holdout: 13 } });
  }

  it("claims its bonus on the operator's roll, and takes the undercover clothing's bonus away", async () => {
    on.add(key("securityScreening"));
    const detector = gear("Handheld Metal Detector (TL7)");
    const guard = character("Guard", [detector], { skills: { Search: 12, "Electronics Operation (Security)": 11 } });
    targets = [smuggler()];
    dialogAnswer = { skill: "Search", metallic: true, explosive: false, patDown: true, sensitivity: 1 };
    await actions.get("ht-screen").run(detector, guard);
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Security)", base: 11 });
    expect(contests[0].first).toMatchObject({ base: 12, modifiers: [{ label: "Handheld Metal Detector (TL7)", value: 2 }], note: "Search" });
    expect(contests[0].second).toMatchObject({ base: 13, note: "Holdout" });
    expect(contests[0].second.modifiers).toEqual([{ label: expect.stringContaining("UndercoverLine"), value: -1 }]);
    expect(contests[0].tags).toContain("metalDetector");
  });

  it("gives +1 without the pat-down, and nothing -- the clothing working -- when the operator fails", async () => {
    on.add(key("securityScreening"));
    const detector = gear("Handheld Metal Detector (TL7)");
    const guard = character("Guard", [detector], { skills: { Search: 12 } });
    targets = [smuggler()];
    dialogAnswer = { skill: "Search", metallic: true, explosive: false, patDown: false, sensitivity: 1 };
    await actions.get("ht-screen").run(detector, guard);
    expect(contests[0].first.modifiers).toEqual([{ label: "Handheld Metal Detector (TL7)", value: 1 }]);
    successResult = { success: false, criticalFailure: false };
    await actions.get("ht-screen").run(detector, guard);
    expect(contests[1].first.modifiers).toEqual([]);
    expect(contests[1].second.modifiers).toEqual([]);
  });

  it("rolls Traps or Explosives (EOD) with the +1, without a contest", async () => {
    on.add(key("securityScreening"));
    const detector = gear("Handheld Metal Detector (TL8)", { tl: "8" });
    const guard = character("Guard", [detector], { skills: { Traps: 14 } });
    dialogAnswer = { skill: "Traps", metallic: true, explosive: false, patDown: true, sensitivity: 1 };
    await actions.get("ht-screen").run(detector, guard);
    expect(successes[1]).toMatchObject({ skill: "Traps", base: 14, modifiers: [{ value: 1 }] });
    expect(contests).toEqual([]);
  });
});

describe("the security system GM tool (pp. 205-206)", () => {
  const task = (more: Record<string, unknown>) => ({ task: "spot", way: "vision", camouflage: 0, sophisticated: true, tamper: false, ...more }) as any;

  it("spots a system on Vision-5, or in a Quick Contest against the installer's Camouflage", async () => {
    const intruder = character("Intruder", [], { skills: { Traps: 13 } });
    await book.runSecurityTask(fakeApi() as never, intruder, task({}));
    expect(successes[0]).toMatchObject({ base: 12, modifiers: [{ value: -5 }], tags: expect.arrayContaining(["vision", "detection"]) });
    await book.runSecurityTask(fakeApi() as never, intruder, task({ way: "traps", camouflage: 14 }));
    // Per-based Traps: 13 - IQ 12 + Per 12.
    expect(contests[0].first).toMatchObject({ base: 13, note: "Traps" });
    expect(contests[0].second).toMatchObject({ actor: null, base: 14, note: "Camouflage" });
  });

  it("defeats a device in secret, the housing first, and tells the GM alone of the alarm", async () => {
    const intruder = character("Intruder", [], { skills: { "Electronics Operation (Security)": 14 } });
    successResult = { success: false, criticalFailure: false };
    await book.runSecurityTask(fakeApi() as never, intruder, task({ task: "defeat", tamper: true }));
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ base: 14, skill: "Electronics Operation (Security)", secret: true });
    expect(chat.at(-1).whisper).toEqual(["gm"]);
    expect(chat.at(-1).content).toContain("Security.Alarm");
    successResult = { success: true, criticalFailure: false };
    await book.runSecurityTask(fakeApi() as never, intruder, task({ task: "defeat", sophisticated: false }));
    expect(successes.at(-1)).toMatchObject({ skill: "Traps", secret: true });
    expect(chat.at(-1).content).toContain("Security.Defeated");
  });

  it("neutralizes a smart fence section at -4 and crosses a seismic detector at Stealth-4, in secret", async () => {
    const intruder = character("Intruder", [], { skills: { "Electronics Operation (Security)": 12, Stealth: 13 } });
    await book.runSecurityTask(fakeApi() as never, intruder, task({ task: "smartFence" }));
    expect(successes[0]).toMatchObject({ base: 12, modifiers: [{ value: -4 }], secret: true });
    await book.runSecurityTask(fakeApi() as never, intruder, task({ task: "seismic" }));
    expect(successes[1]).toMatchObject({ skill: "Stealth", base: 13, modifiers: [{ value: -4 }], secret: true });
    expect(chat.at(-1).content).toContain("Security.SeismicCrossed");
  });
});

describe("a bug detector (p. 212)", () => {
  it("is a Quick Contest with whoever hid the bug, at its quality and +4 for a radio beacon", async () => {
    on.add(key("surveillanceGear"));
    const detector = gear("Bug Detector", { equipmentQuality: "fine" });
    const sweeper = character("Sweeper", [detector], { skills: { "Electronics Operation (Surveillance)": 13 } });
    dialogAnswer = { hider: 14, kind: "noisy", area: 250 };
    await actions.get("ht-bug-sweep").run(detector, sweeper);
    expect(contests[0].first).toMatchObject({ base: 13, note: "Electronics Operation (Surveillance)" });
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([2, 4]);
    expect(contests[0].second).toMatchObject({ actor: null, base: 14 });
    expect(contests[0].tags).toEqual(["bugSweep"]);
    expect(chat.at(-1).content).toContain("Sweep.Found");
    expect(chat.at(-1).content).toContain('"minutes":3');
  });

  it("can't sense a phone tap or laser mike", async () => {
    on.add(key("surveillanceGear"));
    const detector = gear("Bug Detector");
    dialogAnswer = { hider: 14, kind: "undetectable", area: 100 };
    await actions.get("ht-bug-sweep").run(detector, character("Sweeper", [detector]));
    expect(contests).toEqual([]);
    expect(chat.at(-1).content).toContain("Sweep.CantSense");
  });

  it("rolls the same contest Ultra-Tech's sweeper always has", async () => {
    await shared.bugSweepContest(fakeApi() as never, { label: "Sweep", sweeper: { actor: "a", base: 14, note: "Multispectral Bug Sweeper" }, hider: { actor: null, base: 12, note: "Hider" } });
    expect(contests[0]).toEqual({
      label: "Sweep",
      first: { actor: "a", base: 14, modifiers: [], note: "Multispectral Bug Sweeper" },
      second: { actor: null, base: 12, modifiers: [], note: "Hider" },
      tags: ["bugSweep"],
    });
  });
});

describe("jamming (pp. 212-213)", () => {
  function scene(jammerName: string, at: number, operator: Record<string, number> = { "Electronics Operation (EW)": 15 }) {
    const jammer = gear(jammerName, {}, { jammerOn: true });
    const holder = character("Jammer", [jammer], { skills: operator }, 0);
    const radio = gear("Small Radio (TL7)");
    const user = character("Radioman", [radio], { skills: { "Electronics Operation (Communications)": 12 } }, at);
    return { jammer, holder, radio, user };
  }

  it("is a Quick Contest against the operator's EW within range", async () => {
    on.add(key("jamming"));
    const { radio, user, holder } = scene("Area Jammer (TL6)", 800);
    contestOutcome = "second";
    await actions.get("jammer-use-near").run(radio, user);
    expect(contests[0].first).toMatchObject({ actor: user, base: 12, note: "Electronics Operation (Communications)" });
    expect(contests[0].second).toMatchObject({ actor: holder, base: 15, note: "Electronics Operation (EW)" });
    expect(chat.at(-1).content).toContain("Jamming.Jammed");
  });

  it("defaults the operator's EW to Communications-4, and an expendable jammer is EW 18", async () => {
    on.add(key("jamming"));
    const first = scene("Area Jammer (TL7)", 10, { "Electronics Operation (Communications)": 14 });
    await actions.get("jammer-use-near").run(first.radio, first.user);
    expect(contests[0].second.base).toBe(10);
    tokens = [];
    const second = scene("Expendable Radio Jammer", 40);
    await actions.get("jammer-use-near").run(second.radio, second.user);
    expect(contests[1].second).toMatchObject({ actor: null, base: 18 });
  });

  it("is an unopposed roll within 10 times its range, and nothing beyond", async () => {
    on.add(key("jamming"));
    const near = scene("Expendable Radio Jammer", 300);
    await actions.get("jammer-use-near").run(near.radio, near.user);
    expect(contests).toEqual([]);
    expect(successes[0]).toMatchObject({ actor: near.user, base: 12, skill: "Electronics Operation (Communications)", tags: ["jamming"] });
    tokens = [];
    const far = scene("Expendable Radio Jammer", 501);
    await actions.get("jammer-use-near").run(far.radio, far.user);
    expect(successes.length).toBe(1);
    expect(chat.at(-1).content).toContain("Jamming.NoneInReach");
  });

  it("ignores a jammer that isn't switched on, and switches one on from its row", async () => {
    on.add(key("jamming"));
    const { jammer, holder, radio, user } = scene("Area Jammer (TL8)", 100);
    jammer.flags[MODULE_ID].jammerOn = false;
    await actions.get("jammer-use-near").run(radio, user);
    expect(chat.at(-1).content).toContain("Jamming.NoneInReach");
    await actions.get("jammer-switch").run(jammer, holder);
    expect(jammer.setFlag).toHaveBeenCalledWith(MODULE_ID, "jammerOn", true);
    await actions.get("jammer-use-near").run(radio, user);
    expect(contests.length).toBe(1);
  });

  it("lets a cell-phone jammer block cell phones outright, and nothing else", async () => {
    on.add(key("jamming"));
    const { radio, user } = scene("Cell-Phone Jammer", 10);
    await actions.get("jammer-use-near").run(radio, user);
    expect(chat.at(-1).content).toContain("Jamming.NoneInReach");
    const phone = gear("Cellular Phone", { tl: "8" });
    const caller = character("Caller", [phone], {}, 12);
    await actions.get("jammer-use-near").run(phone, caller);
    expect(chat.at(-1).content).toContain("Jamming.Blocked");
    expect(contests).toEqual([]);
    expect(successes).toEqual([]);
  });
});
