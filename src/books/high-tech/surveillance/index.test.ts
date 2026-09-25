/**
 * High-Tech's security screening, surveillance and jamming as the system meets
 * them: the row buttons and sheet lines under their switches, the spike mike's
 * hearing, the metal detector's search against undercover clothing, the bug
 * sweep, and jammers found on the map -- with only High-Tech's switches on
 * (decision D1). The shared bug sweep is also rolled as Ultra-Tech's sweeper
 * calls it, so its contest is unchanged. The supplement's jammers (HT:EE
 * pp. 49-50) are fixture records named and stamped as its catalogue will
 * write them: "Large Jammer (TL7)", "Portable Jammer (TL8)", "Radar Jammer
 * (TL7)", "Radar Spoofer" and "Spectrum Analyzer", equipment with a `tl` and
 * High-Tech's book flag, and nothing else.
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
let prices: any[];

const key = (k: string) => `${MODULE_ID}.${k}`;

function fakeApi() {
  return {
    registry: { isRuleOn: (k: string) => on.has(k) },
    combat: { hooks: { successRollModifiers: "gworld.successRollModifiers" } },
    data: { registerPriceModifier: (m: any) => prices.push(m) },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, k: string) => actor?.attributes?.[k] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: (actor: any) => actor?.derived ?? {},
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
  // High-Tech's radio options, which the spread-spectrum bonus reads (HT:EE p. 46).
  const sensors = await import("../sensors/index.js");
  const sensorEngine = await import("../../../shared/sensors/index.js");
  sensorEngine.SENSOR_TABLES.register(sensors.highTechSensors({ radios: key("radios"), activeSensors: key("activeSensors"), visualSensors: key("visualSensors"), passiveSensors: key("passiveSensors"), spreadSpectrum: key("spreadSpectrum"), radioDesign: key("radioDesign") }));
  book.initSurveillance({ jamming: key("jamming"), jammerKinds: key("jammerKinds"), radarJamming: key("radarJamming"), spreadSpectrum: key("spreadSpectrum") });
  const api = fakeApi();
  book.readySurveillance(api as never, {
    screening: () => on.has(key("securityScreening")),
    surveillance: () => on.has(key("surveillanceGear")),
    jamming: () => on.has(key("jamming")),
    jammerKinds: () => on.has(key("jammerKinds")),
    radarJamming: () => on.has(key("radarJamming")),
  });
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
  prices = [];
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

  it("lets a cell-phone jammer block cellular beacons, and nothing but the cell band", async () => {
    on.add(key("jamming"));
    const { radio, user } = scene("Cell-Phone Jammer", 10);
    await actions.get("jammer-use-near").run(radio, user);
    expect(chat.at(-1).content).toContain("Jamming.NoneInReach");
    const beacon = gear("Cellular Beacon", { tl: "8" });
    const tracker = character("Tracker", [beacon], {}, 12);
    await actions.get("jammer-use-near").run(beacon, tracker);
    expect(chat.at(-1).content).toContain("Jamming.Blocked");
    tokens = [];
    scene("Cell-Phone Jammer", 0);
    const distant = character("Distant", [gear("Cellular Beacon", { tl: "8" })], {}, 16);
    await actions.get("jammer-use-near").run(distant.items[0], distant);
    expect(chat.at(-1).content).toContain("Jamming.NoneInReach");
    expect(contests).toEqual([]);
    expect(successes).toEqual([]);
  });

  it("builds a cell-phone jammer with double the radius, at 4 times the cost and weight (HT:EE p. 50)", async () => {
    const doubled = () => {
      const jammer = gear("Cell-Phone Jammer", { tl: "8", extensions: { [MODULE_ID]: { device: { doubleRadius: true } } } }, { jammerOn: true });
      return jammer;
    };
    const price = prices.find((m) => m.key === "ht-cell-jammer-radius");
    const section = sections.get("ht-surveillance-item");
    expect(price.apply(doubled(), { cost: 500, weight: 5 })).toBeNull();
    on.add(key("jamming"));
    expect(price.apply(doubled(), { cost: 500, weight: 5 })).toMatchObject({ cost: 2000, weight: 20 });
    expect(price.apply(gear("Cell-Phone Jammer", { tl: "8" }), { cost: 500, weight: 5 })).toBeNull();
    expect(shared.jammerOf(doubled())!.jammer.range).toBe(30);
    expect(shared.jammerOf(gear("Cell-Phone Jammer", { tl: "8" }))!.jammer.range).toBe(15);
    const context = section.context(doubled());
    expect(context.cellJammer).toBe(true);
    expect(context.doubleRadius).toBe(true);
    expect(context.lines.join(" ")).toContain('"range":30');
    // The jammer that blocks is never read as an operated one, doubled or not.
    expect(context.lines.join(" ")).not.toContain("Jammer.Operated");
    expect(section.context(gear("Cell-Phone Jammer", { tl: "8" })).lines.join(" ")).not.toContain("Jammer.Operated");
    expect(section.context(gear("Area Jammer (TL8)")).cellJammer).toBe(false);
    // A beacon 20 yards off is blocked by the doubled jammer.
    const holder = character("Holder", [doubled()], {}, 0);
    const beacon = gear("Cellular Beacon", { tl: "8" });
    const tracker = character("Tracker", [beacon], {}, 20);
    await actions.get("jammer-use-near").run(beacon, tracker);
    expect(chat.at(-1).content).toContain("Jamming.Blocked");
    expect(holder.items.length).toBe(1);
  });

  it("lets a caller follow a call through a cell-phone jammer by ear: Hearing-2 within 15 yards, unmodified to 150 (HT:EE p. 50)", async () => {
    on.add(key("jamming"));
    scene("Cell-Phone Jammer", 0);
    const phone = gear("Cellular Phone", { tl: "8" });
    const caller = character("Caller", [phone], { derived: { senses: [{ sense: "hearing", score: 13 }] } }, 12);
    successResult = { success: false };
    expect(await shared.useNearJammers(fakeApi() as never, phone, caller)).toBe("jammed");
    expect(successes[0]).toMatchObject({ actor: caller, base: 13, skill: "Hearing", modifiers: [{ value: -2 }], tags: ["jamming", "hearing"] });
    expect(chat.at(-1).content).toContain("Jamming.Jammed");
    tokens = [];
    scene("Cell-Phone Jammer", 0);
    const other = gear("Cellular Phone", { tl: "8" });
    const across = character("Across", [other], { derived: { senses: [{ sense: "hearing", score: 13 }] } }, 100);
    successResult = { success: true };
    expect(await shared.useNearJammers(fakeApi() as never, other, across)).toBe("through");
    expect(successes[1]).toMatchObject({ skill: "Hearing", modifiers: [] });
    tokens = [];
    scene("Cell-Phone Jammer", 0);
    const beyond = gear("Cellular Phone", { tl: "8" });
    const away = character("Away", [beyond], {}, 151);
    expect(await shared.useNearJammers(fakeApi() as never, beyond, away)).toBe("clear");
    expect(successes.length).toBe(2);
  });
});

describe("broad-spectrum and selective jammers (HT:EE p. 49)", () => {
  const EW = "Electronics Operation (EW)";
  const COMM = "Electronics Operation (Communications)";

  function scene(jammerName: string, at: number, flags: Record<string, unknown> = {}, carry: any[] = []) {
    const jammer = gear(jammerName, { tl: /TL8|spoofer/i.test(jammerName) ? "8" : "7" }, { jammerOn: true, ...flags });
    const holder = character("Jammer", [jammer, ...carry], { skills: { [EW]: 15 } }, 0);
    const radio = gear("Small Radio (TL7)");
    const user = character("Radioman", [radio], { skills: { [COMM]: 12 } }, at);
    return { jammer, holder, radio, user };
  }

  it("runs the supplement's jammers under jammerKinds alone, and High-Tech's area jammer either way", () => {
    const large = gear("Large Jammer (TL7)");
    const area = gear("Area Jammer (TL7)");
    const expendable = gear("Expendable Radio Jammer");
    const radio = gear("Small Radio (TL7)");
    expect(actions.get("jammer-switch").visible(large)).toBe(false);
    on.add(key("jamming"));
    expect(actions.get("jammer-switch").visible(large)).toBe(false);
    expect(shared.jammerOf(area)!.jammer.variety).toBeUndefined();
    on.clear();
    on.add(key("jammerKinds"));
    expect(actions.get("jammer-switch").visible(large)).toBe(true);
    expect(actions.get("jammer-switch").visible(area)).toBe(true);
    expect(actions.get("jammer-switch").visible(expendable)).toBe(false);
    expect(actions.get("jammer-use-near").visible(radio)).toBe(true);
    expect(shared.jammerOf(area)!.jammer.variety).toBe("choose");
    // A large jammer ranges as a large radio: 100 miles at TL7; a portable one as a medium radio, 35 at TL8.
    expect(shared.jammerOf(large)!.jammer.range).toBe(100 * 1760);
    expect(shared.jammerOf(gear("Portable Jammer (TL8)", { tl: "8" }))!.jammer.range).toBe(35 * 1760);
    expect(shared.jammerOf(gear("Portable Jammer", { tl: "6" }))!.jammer.range).toBe(5 * 1760);
  });

  it("switches a broad-spectrum jammer on with the operator's EW roll, +4 for a spectrum analyzer, and leaves it off where it fails", async () => {
    on.add(key("jammerKinds"));
    const analyzer = gear("Spectrum Analyzer", { tl: "8" });
    const { jammer, holder } = scene("Large Jammer (TL7)", 10, { jammerOn: false }, [analyzer]);
    dialogAnswer = { variety: "broad", known: false };
    successResult = { success: false };
    await actions.get("jammer-switch").run(jammer, holder);
    expect(successes[0]).toMatchObject({ actor: holder, base: 15, skill: EW, modifiers: [{ label: "Spectrum Analyzer", value: 4 }] });
    expect(jammer.flags[MODULE_ID].jammerOn).toBe(false);
    expect(chat.at(-1).content).toContain("Jamming.FailsToJam");
    successResult = { success: true };
    await actions.get("jammer-switch").run(jammer, holder);
    expect(jammer.flags[MODULE_ID]).toMatchObject({ jammerOn: true, jammerVariety: "broad", jammerFrequencyKnown: false });
  });

  it("switches a selective jammer on with no roll, and closing the dialog leaves it off", async () => {
    on.add(key("jammerKinds"));
    const { jammer, holder } = scene("Area Jammer (TL7)", 10, { jammerOn: false });
    dialogAnswer = null;
    await actions.get("jammer-switch").run(jammer, holder);
    expect(jammer.flags[MODULE_ID].jammerOn).toBe(false);
    dialogAnswer = { variety: "selective", known: true };
    await actions.get("jammer-switch").run(jammer, holder);
    expect(successes).toEqual([]);
    expect(jammer.flags[MODULE_ID]).toMatchObject({ jammerOn: true, jammerVariety: "selective", jammerFrequencyKnown: true });
  });

  it("makes a broad-spectrum jammer -2 to users within its range and a plain roll out to 10 times it", async () => {
    on.add(key("jammerKinds"));
    const near = scene("Portable Jammer (TL6)", 5 * 1760, { jammerVariety: "broad" });
    successResult = { success: false };
    expect(await shared.useNearJammers(fakeApi() as never, near.radio, near.user)).toBe("jammed");
    expect(successes[0]).toMatchObject({ actor: near.user, base: 12, skill: COMM, modifiers: [{ value: -2 }], tags: ["jamming"] });
    expect(contests).toEqual([]);
    tokens = [];
    const far = scene("Portable Jammer (TL6)", 50 * 1760, { jammerVariety: "broad" });
    successResult = { success: true };
    expect(await shared.useNearJammers(fakeApi() as never, far.radio, far.user)).toBe("through");
    expect(successes[1]).toMatchObject({ modifiers: [] });
    tokens = [];
    const beyond = scene("Portable Jammer (TL6)", 50 * 1760 + 1, { jammerVariety: "broad" });
    expect(await shared.useNearJammers(fakeApi() as never, beyond.radio, beyond.user)).toBe("clear");
  });

  it("catches an unknown frequency in a Quick Contest of EW, then -4 within range", async () => {
    on.add(key("jammerKinds"));
    const analyzer = gear("Spectrum Analyzer", { tl: "8" });
    const { radio, user, holder } = scene("Area Jammer (TL7)", 100, { jammerVariety: "selective" }, [analyzer]);
    successResult = { success: false };
    expect(await shared.useNearJammers(fakeApi() as never, radio, user)).toBe("jammed");
    // The user's own EW defaults to Communications-4 (High-Tech p. 209).
    expect(contests[0].first).toMatchObject({ actor: holder, base: 15, modifiers: [{ value: 4 }], note: EW });
    expect(contests[0].second).toMatchObject({ actor: user, base: 8, note: EW });
    expect(successes[0]).toMatchObject({ actor: user, skill: COMM, modifiers: [{ value: -4 }] });
    contests = [];
    successes = [];
    contestOutcome = "second";
    expect(await shared.useNearJammers(fakeApi() as never, radio, user)).toBe("through");
    expect(successes).toEqual([]);
  });

  it("rolls a known frequency unopposed, at -1 per 10% past its range and no further than double; caught there, -2", async () => {
    on.add(key("jammerKinds"));
    // The TL7 area jammer's mile; 1.25 miles is 25% past it: -3.
    const { radio, user, holder } = scene("Area Jammer (TL7)", 1.25 * 1760, { jammerVariety: "selective", jammerFrequencyKnown: true });
    await shared.useNearJammers(fakeApi() as never, radio, user);
    expect(contests).toEqual([]);
    expect(successes[0]).toMatchObject({ actor: holder, base: 15, skill: EW, modifiers: [{ label: "GCC.HT.Jamming.StretchLine", value: -3 }] });
    expect(successes[1]).toMatchObject({ actor: user, modifiers: [{ value: -2 }] });
    tokens = [];
    successes = [];
    const past = scene("Area Jammer (TL7)", 2 * 1760 + 1, { jammerVariety: "selective", jammerFrequencyKnown: true });
    expect(await shared.useNearJammers(fakeApi() as never, past.radio, past.user)).toBe("through");
    expect(successes).toEqual([]);
  });

  it("gives a frequency-hopping radio +4 through a selective jammer under spreadSpectrum (HT:EE p. 46)", async () => {
    on.add(key("jammerKinds"));
    const { radio, user } = scene("Area Jammer (TL7)", 100, { jammerVariety: "selective", jammerFrequencyKnown: true });
    radio.system.extensions = { [MODULE_ID]: { sensor: { eccm: true } } };
    await shared.useNearJammers(fakeApi() as never, radio, user);
    expect(successes.at(-1).modifiers.map((m: any) => m.value)).toEqual([-4]);
    on.add(key("spreadSpectrum"));
    successes = [];
    await shared.useNearJammers(fakeApi() as never, radio, user);
    expect(successes.at(-1).modifiers.map((m: any) => m.value)).toEqual([-4, 4]);
    // Frequency hopping does nothing against a broad-spectrum jammer.
    tokens = [];
    const broad = scene("Area Jammer (TL7)", 100, { jammerVariety: "broad" });
    broad.radio.system.extensions = { [MODULE_ID]: { sensor: { eccm: true } } };
    successes = [];
    await shared.useNearJammers(fakeApi() as never, broad.radio, broad.user);
    expect(successes.at(-1).modifiers.map((m: any) => m.value)).toEqual([-2]);
  });

  it("gives the spectrum analyzer's +4 only under jammerKinds, not to High-Tech's own contest", async () => {
    on.add(key("jamming"));
    const analyzer = gear("Spectrum Analyzer", { tl: "8" });
    const { radio, user } = scene("Area Jammer (TL7)", 100, {}, [analyzer]);
    await shared.useNearJammers(fakeApi() as never, radio, user);
    expect(contests[0].second).toMatchObject({ base: 15, modifiers: [] });
  });

  it("knows only the frequencies of the characters targeted when it went on, and never a hopping radio's (HT:EE p. 49)", async () => {
    on.add(key("jammerKinds"));
    const { jammer, holder, radio, user } = scene("Area Jammer (TL7)", 100, { jammerOn: false });
    const other = character("Bystander", [gear("Small Radio (TL7)")], { skills: { [COMM]: 12 } }, 100);
    targets = [user];
    dialogAnswer = { variety: "selective", known: true };
    await actions.get("jammer-switch").run(jammer, holder);
    expect(jammer.flags[MODULE_ID].jammerFrequencyKnown).toEqual(["Actor.Radioman"]);
    await shared.useNearJammers(fakeApi() as never, radio, user);
    expect(contests).toEqual([]);
    expect(successes[0]).toMatchObject({ actor: holder, skill: EW });
    successes = [];
    await shared.useNearJammers(fakeApi() as never, other.items[0], other);
    expect(contests).toHaveLength(1);
    // A frequency-hopping radio's frequency isn't fixed: the contest even where it is known.
    contests = [];
    radio.system.extensions = { [MODULE_ID]: { sensor: { eccm: true } } };
    await shared.useNearJammers(fakeApi() as never, radio, user);
    expect(contests).toHaveLength(1);
  });

  it("adapts a spark-gap transmitter or a Tesla coil to jam broad-spectrum at -2 (HT:EE p. 49)", async () => {
    on.add(key("jammerKinds"));
    on.add(key("radioDesign"));
    const spark = gear("Trench Radio Transmitter", { tl: "6", extensions: { [MODULE_ID]: { sensor: { commMode: "transmitter", sparkGap: true, wideband: true } } } });
    const coil = gear("Small Tesla Coil", { tl: "8" });
    const holder = character("Sparks", [spark, coil], { skills: { [EW]: 14, Scrounging: 12 } });
    expect(actions.get("ht-adapt-jammer").visible(spark)).toBe(true);
    expect(actions.get("ht-adapt-jammer").visible(gear("Small Radio (TL7)"))).toBe(false);
    expect(shared.jammerOf(spark)).toBeNull();
    // With a tool kit: a Scrounging roll, which can fail.
    dialogAnswer = { where: "kit", range: 0 };
    successResult = { success: false };
    await actions.get("ht-adapt-jammer").run(spark, holder);
    expect(successes[0]).toMatchObject({ actor: holder, base: 12, skill: "Scrounging" });
    expect(spark.flags[MODULE_ID].eeAdaptedJammer).toBeUndefined();
    successResult = { success: true };
    await actions.get("ht-adapt-jammer").run(spark, holder);
    const adapted = shared.jammerOf(spark)!.jammer;
    expect(adapted).toMatchObject({ range: 50 * 1760, skill: null, variety: "broad" });
    expect(adapted.operatorLines).toEqual([{ label: "GCC.HT.Surveillance.Jammer.AdaptedLine", value: -2 }]);
    expect(actions.get("ht-adapt-jammer").visible(spark)).toBe(false);
    // In a workshop no roll; a Tesla coil takes the reach it is given.
    successes = [];
    dialogAnswer = { where: "workshop", range: 200 };
    await actions.get("ht-adapt-jammer").run(coil, holder);
    expect(successes).toEqual([]);
    expect(shared.jammerOf(coil)!.jammer.range).toBe(200);
    // Switched on, the operator's roll takes the -2.
    await actions.get("jammer-switch").run(coil, holder);
    expect(successes[0]).toMatchObject({ base: 14, skill: EW, modifiers: [{ value: -2 }] });
    on.delete(key("jammerKinds"));
    expect(shared.jammerOf(coil)).toBeNull();
  });

  it("puts the varieties and the analyzer on the sheet", () => {
    const section = sections.get("ht-surveillance-item");
    expect(section.visible(gear("Spectrum Analyzer", { tl: "8" }))).toBe(false);
    on.add(key("jammerKinds"));
    expect(section.context(gear("Spectrum Analyzer", { tl: "8" })).lines).toEqual(['Jammer.Analyzer {"bonus":"+4"}'.replace("Jammer", "GCC.HT.Surveillance.Jammer")]);
    expect(section.context(gear("Area Jammer (TL7)")).lines[0]).toContain("Jammer.Varieties");
    expect(section.context(gear("Large Jammer (TL8)", { tl: "8" })).lines[0]).toContain("Jammer.Varieties");
    expect(section.context(gear("Small Radio (TL7)")).lines).toEqual(["GCC.HT.Surveillance.Jammer.HinderedVarieties"]);
  });
});

describe("radar jammers and spoofers (HT:EE pp. 49-50)", () => {
  const EW = "Electronics Operation (EW)";
  const SENSORS = "Electronics Operation (Sensors)";

  function scene(jammerName: string, at: number) {
    const jammer = gear(jammerName, { tl: /TL8|spoofer/i.test(jammerName) ? "8" : "7" }, { jammerOn: true });
    const holder = character("Jammer", [jammer], { skills: { [EW]: 14 } }, 0);
    const radar = gear("Medium Radar");
    const user = character("Radarman", [radar], { skills: { [SENSORS]: 13 } }, at);
    return { jammer, holder, radar, user };
  }

  it("runs under radarJamming alone, and hinders radar but not radios", async () => {
    const jammer = gear("Radar Jammer (TL7)");
    const radar = gear("Medium Radar");
    expect(actions.get("jammer-switch").visible(jammer)).toBe(false);
    expect(actions.get("jammer-use-near").visible(radar)).toBe(false);
    on.add(key("jammerKinds"));
    on.add(key("jamming"));
    expect(actions.get("jammer-switch").visible(jammer)).toBe(false);
    expect(actions.get("jammer-use-near").visible(radar)).toBe(false);
    on.clear();
    on.add(key("radarJamming"));
    expect(actions.get("jammer-switch").visible(jammer)).toBe(true);
    expect(actions.get("jammer-use-near").visible(radar)).toBe(true);
    expect(actions.get("jammer-use-near").visible(gear("Small Radio (TL7)"))).toBe(false);
    // 15 miles, doubled at TL8; the spoofer is a TL8 radar jammer.
    expect(shared.jammerOf(jammer)!.jammer.range).toBe(15 * 1760);
    expect(shared.jammerOf(gear("Radar Jammer (TL8)", { tl: "8" }))!.jammer.range).toBe(30 * 1760);
    expect(shared.jammerOf(gear("Radar Spoofer", { tl: "8" }))!.jammer).toMatchObject({ range: 30 * 1760, spoofs: true });
    // A radio jammer doesn't reach radar, even with every switch on.
    on.add(key("jamming"));
    on.add(key("jammerKinds"));
    tokens = [];
    const area = gear("Area Jammer (TL8)", { tl: "8" }, { jammerOn: true, jammerVariety: "broad" });
    character("Jammer", [area], { skills: { [EW]: 14 } }, 0);
    const radarman = character("Radarman", [radar], {}, 10);
    expect(await shared.useNearJammers(fakeApi() as never, radar, radarman)).toBe("clear");
  });

  it("switches a radar jammer on with the operator's EW roll, asking nothing", async () => {
    on.add(key("radarJamming"));
    const { jammer, holder } = scene("Radar Jammer (TL7)", 10);
    jammer.flags[MODULE_ID].jammerOn = false;
    dialogAnswer = { variety: "selective", known: true };
    await actions.get("jammer-switch").run(jammer, holder);
    expect(successes[0]).toMatchObject({ actor: holder, base: 14, skill: EW, modifiers: [] });
    expect(jammer.flags[MODULE_ID].jammerOn).toBe(true);
    expect(jammer.flags[MODULE_ID].jammerVariety).toBeUndefined();
  });

  it("makes a radar's Sensors -2 within the jammer's radius, a plain roll out to 10 times it", async () => {
    on.add(key("radarJamming"));
    const near = scene("Radar Jammer (TL7)", 10 * 1760);
    successResult = { success: false };
    expect(await shared.useNearJammers(fakeApi() as never, near.radar, near.user)).toBe("jammed");
    expect(successes[0]).toMatchObject({ actor: near.user, base: 13, skill: SENSORS, modifiers: [{ value: -2 }] });
    tokens = [];
    const far = scene("Radar Jammer (TL7)", 100 * 1760);
    successResult = { success: true };
    expect(await shared.useNearJammers(fakeApi() as never, far.radar, far.user)).toBe("through");
    expect(successes[1]).toMatchObject({ skill: SENSORS, modifiers: [] });
  });

  it("feeds a radar a false picture where the spoofer wins a Quick Contest of EW against Sensors, within its radius only", async () => {
    on.add(key("radarJamming"));
    const { radar, user, holder } = scene("Radar Spoofer", 20 * 1760);
    contestOutcome = "second";
    expect(await shared.useNearJammers(fakeApi() as never, radar, user)).toBe("spoofed");
    expect(contests[0].first).toMatchObject({ actor: user, base: 13, note: SENSORS });
    expect(contests[0].second).toMatchObject({ actor: holder, base: 14, note: EW });
    // Rolled in secret; the user is shown the signal getting through, and the GMs alone are told it is false.
    expect(contests[0].secret).toBe(true);
    expect(chat.at(-2).content).toContain("Jamming.GetsThrough");
    expect(chat.at(-2).whisper).toBeUndefined();
    expect(chat.at(-1).content).toContain("Jamming.Spoofed");
    expect(chat.at(-1).whisper).toEqual(["gm"]);
    contestOutcome = "first";
    expect(await shared.useNearJammers(fakeApi() as never, radar, user)).toBe("through");
    tokens = [];
    const beyond = scene("Radar Spoofer", 31 * 1760);
    expect(await shared.useNearJammers(fakeApi() as never, beyond.radar, beyond.user)).toBe("clear");
    expect(contests.length).toBe(2);
  });

  it("carries on past a lost spoof as past a won one, and tells the GMs only at the end", async () => {
    on.add(key("radarJamming"));
    const { radar, user } = scene("Radar Spoofer", 20 * 1760);
    // A radar jammer further off, reached after the spoofer.
    character("Blinder", [gear("Radar Jammer (TL7)", {}, { jammerOn: true })], { skills: { [EW]: 14 } }, -5 * 1760);
    contestOutcome = "second";
    successResult = { success: true };
    expect(await shared.useNearJammers(fakeApi() as never, radar, user)).toBe("spoofed");
    // The jammer's roll was made all the same, and the user's card reads as an unspoofed one would.
    expect(successes).toHaveLength(1);
    expect(chat.filter((m) => !m.whisper).map((m) => m.content).join(" ")).not.toContain("Spoofed");
    expect(chat.at(-2).content).toContain("Jamming.GetsThrough");
    expect(chat.at(-1)).toMatchObject({ whisper: ["gm"] });
    expect(chat.at(-1).content).toContain("Jamming.Spoofed");
    // Jammed by the next one: the user sees the jamming, the GMs still hear of the spoof.
    chat = [];
    successResult = { success: false };
    expect(await shared.useNearJammers(fakeApi() as never, radar, user)).toBe("jammed");
    expect(chat.at(-2).content).toContain("Jamming.Jammed");
    expect(chat.at(-1)).toMatchObject({ whisper: ["gm"] });
  });

  it("puts the radar jammer, the spoofer and the radar's hindrance on the sheet", () => {
    const section = sections.get("ht-surveillance-item");
    on.add(key("radarJamming"));
    expect(section.context(gear("Radar Jammer (TL7)")).lines[0]).toContain("Jammer.Radar");
    expect(section.context(gear("Radar Spoofer", { tl: "8" })).lines[0]).toContain("Jammer.Spoofer");
    expect(section.context(gear("Large Radar")).lines).toEqual(["GCC.HT.Surveillance.Jammer.RadarHindered"]);
  });
});
