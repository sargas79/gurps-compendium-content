/**
 * High-Tech's comms and sensors as the system meets them, through the shared
 * engine: prices, the item sheet section, worn optics as senses and what they
 * impose, the comm tool, the lock, the thermograph's and IR source's lines,
 * and the hydrophone's fix -- with only High-Tech's switches on (decision D1),
 * beside Ultra-Tech's table, whose gear keeps its own figures.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import type * as SharedSensors from "../../../shared/sensors/index.js";
import type * as BookTables from "../../../shared/book-tables.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  attackModifiers: "gworld.attackModifiers",
  successRollModifiers: "gworld.successRollModifiers",
  defenseModifiers: "gworld.defenseModifiers",
  afterQuickContest: "gworld.afterQuickContest",
  armorDr: "gworld.armorDr",
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let prices: any[];
let grades: any[];
let successes: any[];
let contests: any[];
let chat: string[];
let combatState: Map<string, any>;
let on: Set<string>;
let dialogAnswer: any;
let dialogs: string[];
let targets: any[];
let controlled: any[];
let successResult: any;
let held: any[];

const key = (k: string) => `${MODULE_ID}.${k}`;
const HT = { radios: key("radios"), activeSensors: key("activeSensors"), visualSensors: key("visualSensors"), passiveSensors: key("passiveSensors"), rangefindingEmissions: key("rangefindingEmissions") };
/** The supplement Electricity and Electronics' radio switches, which join High-Tech's (E1 in #471). */
const EE = { radioTuning: key("radioTuning"), radioAntennas: key("radioAntennas"), shortwaveSkip: key("shortwaveSkip"), radioDesign: key("radioDesign"),
  spreadSpectrum: key("spreadSpectrum"), signalsIntelligence: key("signalsIntelligence"), cipherMachines: key("cipherMachines") };
const UT = { communicators: key("communicators"), sensors: key("sensors") };

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (k: string) => on.has(k) },
    data: { registerPriceModifier: (m: any) => prices.push(m), registerToolGrade: (g: any) => grades.push(g) },
    combat: {
      hooks: HOOKS,
      setCombatState: async (actor: any, _m: string, k: string, value: any) => { combatState.set(`${actor.uuid}:${k}`, value); },
      getCombatState: (actor: any, _m: string, k: string) => combatState.get(`${actor?.uuid}:${k}`),
    },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, k: string) => actor?.attributes?.[k] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: (actor: any) => actor?.derived ?? null,
      addPendingModifier: async (actor: any, request: any) => { held.push({ actor: actor.name, ...request }); return "p1"; },
      vehicleAboard: (actor: any) => actor?.aboard ?? null,
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: "first", marginOfVictory: 6 }; },
    },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

let n = 0;
function gear(name: string, sensor: Record<string, unknown> = {}, more: Record<string, any> = {}, book: string | null = "high-tech"): any {
  n += 1;
  return {
    id: `item${n}`,
    name,
    type: "equipment",
    system: { tl: "8", carried: true, equipped: false, extensions: { [MODULE_ID]: { sensor } }, ...more },
    flags: book ? { [MODULE_ID]: { book } } : {},
  };
}
const wornGear = (name: string, sensor: Record<string, unknown> = {}, more: Record<string, any> = {}, book: string | null = "high-tech") => gear(name, sensor, { equipped: true, ...more }, book);

function character(name: string, items: any[], more: Record<string, any> = {}): any {
  const actor: any = { name, uuid: `Actor.${name}`, items, attributes: { IQ: 12, DX: 11 }, skills: {}, system: { tl: "8" }, ...more };
  (actor.items as any).get = (id: string) => items.find((i) => i.id === id);
  actor.getActiveTokens = () => [];
  for (const item of items) item.actor = actor;
  return actor;
}

function traitEffects(actor: any): { effects: any; sources: any[] } {
  const context = { actor, effects: { nightVision: 0, infravision: false, telescopicVision: 0, restrictedVision: null, noDepthPerception: false, colorblindness: false, parabolicHearing: 0, protectedSense: { vision: false, hearing: false, tasteSmell: false, touch: false }, acute: { vision: 0, hearing: 0, tasteSmell: 0, touch: 0 } }, sources: [] as any[] };
  fire("gworld.traitEffects", context);
  return context;
}

let shared: typeof SharedSensors;
let tables: typeof BookTables;

/** Loads again with the API changed, from a clean slate of registrations. */
async function reload(change: (api: any) => void): Promise<void> {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  tools = new Map();
  prices = [];
  grades = [];
  await load(change);
}

/** Loads fresh modules, registers both books' tables, and readies both, as a build with every book does. */
async function load(change: (api: any) => void = () => {}): Promise<void> {
  vi.resetModules();
  tables = await import("../../../shared/book-tables.js");
  shared = await import("../../../shared/sensors/index.js");
  const ut = await import("../../ultra-tech/sensors/index.js");
  const ht = await import("./index.js");
  tables.setRuleReader((k) => on.has(k));
  ut.initUltraTechSensors(UT);
  ht.initHighTechSensors({ ...HT, ...EE });
  const api: any = fakeApi();
  change(api);
  ut.readyUltraTechSensors(api as never, { communicators: () => on.has(UT.communicators), sensors: () => on.has(UT.sensors) });
  ht.readyHighTechSensors(api as never, { radios: () => on.has(HT.radios), active: () => on.has(HT.activeSensors), visual: () => on.has(HT.visualSensors), passive: () => on.has(HT.passiveSensors), tuning: () => on.has(EE.radioTuning), design: () => on.has(EE.radioDesign) });
}

beforeEach(async () => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  tools = new Map();
  prices = [];
  grades = [];
  successes = [];
  contests = [];
  chat = [];
  combatState = new Map();
  on = new Set();
  dialogAnswer = null;
  dialogs = [];
  targets = [];
  controlled = [];
  successResult = { success: true, margin: 3 };
  held = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
  });
  vi.stubGlobal("canvas", { get tokens() { return { controlled: controlled.map((actor) => ({ actor })) }; } });
  vi.stubGlobal("foundry", { data: { fields: {} }, utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async (o: any) => { dialogs.push(o.content); return dialogAnswer; } } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("Roll", class { total = 1; async evaluate() { return this; } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  await load();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const price = (item: any, cost = 100, weight = 10) => prices[0].apply(item, { cost, weight });
const section = () => sections.get("sensor-item");

describe("with every switch off", () => {
  it("changes nothing", () => {
    const radio = gear("Small Radio (TL8)", { commMode: "receiver", eccm: true });
    expect(price(radio)).toBeNull();
    expect(section().visible(radio)).toBe(false);
    expect(traitEffects(character("Scout", [wornGear("Night Vision Goggles")])).sources).toEqual([]);
    expect(actions.get("sensor-lock").visible(gear("Small Radar", { tactical: true }))).toBe(false);
    expect(actions.get("ht-telegraphy").visible(gear("Telegraph Key"))).toBe(false);
  });
});

describe("radios (pp. 36-40), with only High-Tech's switch on (D1)", () => {
  beforeEach(() => { on = new Set([HT.radios]); });

  it("shows a radio's range, the options its TL offers, and prices them", () => {
    const radio = gear("Small Radio (TL8)", { commMode: "receiver", eccm: true, gps: true });
    expect(section().visible(radio)).toBe(true);
    const context = section().context(radio);
    expect(context.lines[0]).toContain("GCC.HT.Sensor.RadioRange");
    expect(context.lines[0]).toContain('Miles {\\"value\\":5}');
    expect(context.options.map((o: any) => o.key)).toEqual(["codeOnly", "directionFinder", "intercept", "radiotelephone", "eccm", "gps", "longAntenna"]);
    expect(context.modes.map((m: any) => m.value)).toEqual(["", "receiver"]);
    // Receive-only (x0.1, x0.2 weight), ECCM x2, GPS x2.
    expect(price(radio)).toMatchObject({ cost: 40, weight: 2, label: "GCC.HT.Sensor.Title" });
    // A TL6 radio has no ECCM to offer, whatever its field holds.
    expect(price(gear("Small Radio (TL6)", { eccm: true }, { tl: "6" }))).toBeNull();
    expect(price(gear("Large Radio (TL8)", { longAntenna: true }))).toMatchObject({ cost: 125, weight: 12.5 });
  });

  it("reaches another character's different radio at the square root of the product, and stretches it with a roll", async () => {
    // The supplement's example (HT:EE p. 28): a 50-mile set and a half-mile one reach 5 miles.
    const mine = gear("Large Radio (TL6)", {}, { tl: "6" });
    const theirs = gear("Tiny Radio (TL7)", {}, { tl: "7" });
    controlled = [character("Nat", [mine])];
    targets = [character("Airk", [theirs])];
    // At 5.5 miles, -1.
    dialogAnswer = { yards: 5.5 * 1760, urban: false, audioVisual: false, rate: 1, own: {} };
    await tools.get("comm-range").open();
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Communications)", modifiers: [{ value: -1 }] });
    expect(chat[0]).toContain('Miles {\\"value\\":5}');
    // Slowed to a quarter speed, the same distance is in range.
    successes = [];
    dialogAnswer = { yards: 5.5 * 1760, urban: false, audioVisual: false, rate: 1 / 4, own: {} };
    await tools.get("comm-range").open();
    expect(successes).toEqual([]);
    expect(chat[1]).toContain("GCC.HT.Sensor.InRange");
  });

  it("rolls telegraphy, faking a fist at -6 in a Quick Contest, all at -4 enciphered", async () => {
    const key = gear("Telegraph Key", {}, { tl: "5" });
    const operator = character("Operator", [key], { skills: { "Electronics Operation (Communications)": 13 } });
    targets = [character("Recipient", [])];
    dialogAnswer = { task: "fake", cipher: true };
    await actions.get("ht-telegraphy").run(key, operator);
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([-4, -6]);
    expect(contests[0].second.modifiers.map((m: any) => m.value)).toEqual([-4]);
    // A TL5 tap is an uncontested roll.
    dialogAnswer = { task: "tap", cipher: false };
    await actions.get("ht-telegraphy").run(key, operator);
    expect(successes[0]).toMatchObject({ base: 13, modifiers: [] });
  });

  it("fixes a transmitter by the supplement's triangulation (HT:EE p. 47): a Quick Contest where it is concealed, exact on a margin of 6", async () => {
    const rdf = gear("Medium Radio (TL8)", { directionFinder: true });
    expect(actions.get("ht-direction-finder").visible(rdf)).toBe(true);
    expect(actions.get("ht-direction-finder").visible(gear("Medium Radio (TL8)"))).toBe(false);
    targets = [character("Spy", [])];
    const hunter = character("Hunter", [rdf], { skills: { "Electronics Operation (EW)": 14, "Mathematics (Surveying)": 13 } });
    dialogAnswer = { system: "basic", antennas: "two", baseline: 100, yards: 2000, seconds: 30, concealed: true };
    await actions.get("ht-direction-finder").run(rdf, hunter);
    // The lesser of Mathematics and EW-2; +6, the baseline and distance from the table, -2 for two antennas, haste for 30 seconds.
    expect(contests[0].first.base).toBe(12);
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([6, -rules.speedRangeModifier(100), rules.speedRangeModifier(2000), -2, -5]);
    expect(contests[0].tags).toContain("triangulation");
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.Fix.exact");
  });

  it("finds the general area with scatter on an unopposed roll, and gives only a direction with one antenna", async () => {
    const rdf = gear("Medium Radio (TL8)", { directionFinder: true });
    const hunter = character("Hunter", [rdf], { skills: { "Electronics Operation (EW)": 14 } });
    successResult = { success: true, margin: 2 };
    dialogAnswer = { system: "hfdf", antennas: "three", baseline: 0, yards: 1000, seconds: 10, concealed: false };
    await actions.get("ht-direction-finder").run(rdf, hunter);
    expect(successes[0]).toMatchObject({ base: 14, skill: "Electronics Operation (EW)", modifiers: [{ value: 6 }, { value: rules.speedRangeModifier(1000) }] });
    // 10% of 1,000 yards.
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.Fix.area");
    expect(chat.at(-1)).toContain('"yards":100');
    dialogAnswer = { ...dialogAnswer, antennas: "one" };
    await actions.get("ht-direction-finder").run(rdf, hunter);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.Fix.directionOnly");
  });

  it("identifies a wrong location on the plotter's critical failure in the contest", async () => {
    const rdf = gear("Medium Radio (TL8)", { directionFinder: true });
    targets = [character("Spy", [])];
    // The contest's hook reports the plotter's critical failure, as the system's does.
    const contest = async (o: any) => { contests.push(o); fire(HOOKS.afterQuickContest, { tags: o.tags, first: { outcome: { criticalFailure: true } } }); return { outcome: "second", marginOfVictory: 4 }; };
    await reload((api) => { api.roll.quickContest = contest; });
    dialogAnswer = { system: "basic", antennas: "three", baseline: 1000, yards: 1000, seconds: 0, concealed: true };
    await actions.get("ht-direction-finder").run(rdf, character("Hunter", [rdf]));
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.Fix.wrong");
  });
});

describe("the supplement's radio reception, antennas and shortwave (HT:EE pp. 27-30)", () => {
  const MILE = 1760;
  /** The comm tool between the selected Nat's radio and the targeted Airk's, at a distance, with the book's own rows answered. */
  async function link(mine: any, theirs: any, miles: number, own: Record<string, unknown> = {}, listener: Record<string, any> = {}): Promise<void> {
    controlled = [character("Nat", [mine], listener)];
    targets = [character("Airk", [theirs])];
    dialogAnswer = { yards: miles * MILE, urban: false, audioVisual: false, rate: 1, own };
    await tools.get("comm-range").open();
  }
  const values = (roll: any) => roll.modifiers.map((m: any) => m.value);

  it("adds nothing with only High-Tech's radios on", async () => {
    on = new Set([HT.radios]);
    const radio = gear("Small Radio (TL8)", { dipoleAntenna: true, directionalAntenna: true, shortwave: true });
    expect(section().context(radio).options.map((o: any) => o.key)).not.toContain("dipoleAntenna");
    expect(price(radio)).toBeNull();
    expect(actions.get("ht-radio-tuning").visible(radio)).toBe(false);
  });

  describe("radioAntennas (HT:EE p. 28)", () => {
    beforeEach(() => { on = new Set([HT.radios, EE.radioAntennas]); });

    it("offers the dipole from TL6 and the directional antenna from TL7, and prices them", () => {
      const keys = (item: any) => section().context(item).options.map((o: any) => o.key);
      expect(keys(gear("Small Radio (TL6)", {}, { tl: "6" }))).toEqual(expect.arrayContaining(["longAntenna", "dipoleAntenna"]));
      expect(keys(gear("Small Radio (TL6)", {}, { tl: "6" }))).not.toContain("directionalAntenna");
      expect(keys(gear("Small Radio (TL8)"))).toEqual(expect.arrayContaining(["dipoleAntenna", "directionalAntenna"]));
      // +10% and +50% cost and weight, each.
      expect(price(gear("Small Radio (TL8)", { dipoleAntenna: true, directionalAntenna: true }))).toMatchObject({ cost: 165, weight: 16.5 });
      expect(price(gear("Small Radio (TL6)", { directionalAntenna: true }, { tl: "6" }))).toBeNull();
      expect(section().context(gear("Small Radio (TL8)", { directionalAntenna: true })).lines.join(" ")).toContain("GCC.HT.Sensor.DirectionalLineAuto");
    });

    it("multiplies the link by a dipole broadside, and cuts it off its ends", async () => {
      await link(gear("Small Radio (TL8)", { dipoleAntenna: true }), gear("Small Radio (TL8)"), 7, { "dipole-a": "broadside" });
      expect(chat[0]).toContain('Miles {\\"value\\":7.5}');
      expect(chat[0]).toContain("GCC.HT.Sensor.InRange");
      await link(gear("Small Radio (TL8)", { dipoleAntenna: true }), gear("Small Radio (TL8)"), 1, { "dipole-a": "endOn" });
      expect(chat[1]).toContain("GCC.HT.Sensor.DipoleEndOn");
      expect(chat[1]).toContain("GCC.HT.Sensor.OutOfRange");
    });

    it("rolls to aim a TL7 directional antenna, and lets TL8 software aim one", async () => {
      const dish = gear("Medium Radio (TL7)", { directionalAntenna: true }, { tl: "7" });
      await link(dish, gear("Medium Radio (TL7)", {}, { tl: "7" }), 90, { "aim-a": true });
      // The aiming roll, then in range at x10: 100 miles.
      expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Communications)", tags: ["antennaAim"] });
      expect(chat[0]).toContain('Miles {\\"value\\":100}');
      successResult = { success: false, margin: -2 };
      await link(gear("Medium Radio (TL7)", { directionalAntenna: true }, { tl: "7" }), gear("Medium Radio (TL7)", {}, { tl: "7" }), 90, { "aim-a": true });
      expect(chat[1]).toContain("GCC.HT.Sensor.AimMissed");
      expect(chat[1]).toContain("GCC.HT.Sensor.OutOfRange");
      successes = [];
      await link(gear("Medium Radio (TL8)", { directionalAntenna: true }), gear("Medium Radio (TL8)"), 300);
      expect(successes).toEqual([]);
      expect(chat[2]).toContain("GCC.HT.Sensor.AutoAimed");
      expect(chat[2]).toContain('Miles {\\"value\\":350}');
    });
  });

  describe("radioTuning (HT:EE pp. 27, 29-30)", () => {
    beforeEach(() => { on = new Set([HT.radios, EE.radioTuning]); });

    it("needs no roll for a clear signal in range, and rolls through interference with the listener's Hearing", async () => {
      await link(gear("Small Radio (TL8)"), gear("Small Radio (TL8)"), 4, { conditions: 0 });
      expect(successes).toEqual([]);
      expect(chat[0]).toContain("GCC.HT.Sensor.ClearSignal");
      // Acute Hearing 2: a Hearing score of 14 on Perception 12.
      await link(gear("Small Radio (TL8)"), gear("Small Radio (TL8)"), 5.5, { conditions: -3 }, { derived: { per: 12, senses: [{ sense: "hearing", score: 14 }] } });
      expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Communications)", tags: ["radioTuning"] });
      expect(values(successes[0])).toEqual([-1, -3, 2]);
      // A galvanometer's +1 in place of the Hearing modifiers.
      successes = [];
      await link(gear("Small Radio (TL8)"), gear("Small Radio (TL8)"), 4, { conditions: -3, galvanometer: true }, { derived: { per: 12, senses: [{ sense: "hearing", score: 8 }] } });
      expect(values(successes[0])).toEqual([-3, 1]);
    });

    it("is blocked at -10, and says a coil-tuned set drifts", async () => {
      await link(gear("Small Radio (TL6)", {}, { tl: "6" }), gear("Small Radio (TL6)", {}, { tl: "6" }), 0.5, { conditions: -10, drift: true });
      expect(chat[0]).toContain("GCC.HT.Sensor.Blocked");
      await link(gear("Small Radio (TL6)", {}, { tl: "6" }), gear("Small Radio (TL6)", {}, { tl: "6" }), 0.5, { conditions: -1, drift: true });
      expect(chat[1]).toContain("GCC.HT.Sensor.DriftLine");
    });

    it("gives a radio peripheral +4 and its 35-mile range (a fixture shaped as #479 will write it)", async () => {
      const peripheral = gear("Radio Peripheral");
      expect(section().visible(peripheral)).toBe(true);
      expect(section().context(peripheral).lines.join(" ")).toContain("GCC.HT.Sensor.EnhancedTuningLine");
      // To a medium TL8 set (35 miles): the same range.
      await link(peripheral, gear("Medium Radio (TL8)"), 40, { conditions: 0 });
      expect(values(successes[0])).toEqual([-2, 4]);
    });

    it("adapts a digital TV tuner into a radio peripheral on a Computer Operation roll: it receives, with no +4 (HT:EE p. 30)", async () => {
      const tuner: any = gear("Digital TV Tuner");
      Object.assign(tuner, {
        isOwner: true,
        getFlag: (scope: string, k: string): unknown => tuner.flags[scope]?.[k],
        setFlag: async (scope: string, k: string, v: unknown) => { (tuner.flags[scope] ??= {})[k] = v; },
      });
      // Not a radio until adapted.
      expect(section().visible(tuner)).toBe(false);
      const action = actions.get("ht-adapt-tuner");
      expect(action.visible(tuner)).toBe(true);
      const owner = character("Geek", [tuner], { skills: { "Computer Operation": 13 } });
      successResult = { success: false, margin: -1 };
      await action.run(tuner, owner);
      expect(successes[0]).toMatchObject({ base: 13, skill: "Computer Operation", tags: ["adaptTuner"] });
      expect(chat.at(-1)).toContain("GCC.HT.Sensor.TunerNotAdapted");
      expect(action.visible(tuner)).toBe(true);
      successResult = { success: true, margin: 2 };
      await action.run(tuner, owner);
      expect(action.visible(tuner)).toBe(false);
      const lines = section().context(tuner).lines.join(" ");
      expect(lines).toContain("GCC.HT.Sensor.AdaptedTunerLine");
      expect(lines).not.toContain("GCC.HT.Sensor.EnhancedTuningLine");
      // To a medium TL8 set at 40 miles: -2 for the range, and no +4.
      successes = [];
      await link(tuner, gear("Medium Radio (TL8)"), 40, { conditions: 0 });
      expect(values(successes[0])).toEqual([-2]);
      expect(chat.at(-1)).toContain('GCC.HT.Sensor.ReceiveOnly {"name":"Digital TV Tuner"}');
      // With the tuning rules off, the tuner is no radio.
      on = new Set([HT.radios]);
      expect(section().visible(tuner)).toBe(false);
    });

    it("tunes in from a radio's row with only the tuning switch on", async () => {
      on = new Set([EE.radioTuning]);
      const radio = gear("Small Radio (TL8)");
      expect(actions.get("ht-radio-tuning").visible(radio)).toBe(true);
      expect(actions.get("ht-radio-tuning").visible(gear("Radio Peripheral"))).toBe(true);
      expect(actions.get("ht-radio-tuning").visible(gear("Small Sonar"))).toBe(false);
      const listener = character("Listener", [radio, gear("Galvanometer")], { skills: { "Electronics Operation (Communications)": 13 } });
      dialogAnswer = { yards: 6 * MILE, range: 5 * MILE, conditions: -2, galvanometer: true, drift: false, skip: {} };
      await actions.get("ht-radio-tuning").run(radio, listener);
      expect(successes[0]).toMatchObject({ base: 13, skill: "Electronics Operation (Communications)" });
      expect(values(successes[0])).toEqual([-2, -2, 1]);
    });
  });

  describe("shortwaveSkip (HT:EE p. 30)", () => {
    beforeEach(() => { on = new Set([HT.radios, EE.shortwaveSkip]); });

    it("offers shortwave from TL6 at no cost", () => {
      expect(section().context(gear("Large Radio (TL6)", {}, { tl: "6" })).options.map((o: any) => o.key)).toContain("shortwave");
      expect(price(gear("Large Radio (TL6)", { shortwave: true }, { tl: "6" }))).toBeNull();
    });

    it("skips between shortwave sets, the transmitter with a large antenna", async () => {
      const set = () => gear("Large Radio (TL7)", { shortwave: true, longAntenna: true }, { tl: "7" });
      // 5,000 miles: three skips, -2; summer, -2.
      await link(set(), set(), 5000, { skip: { summer: true } });
      expect(chat[0]).toContain('GCC.HT.Sensor.SkipLine {"skips":3}');
      expect(successes[0]).toMatchObject({ tags: ["radioTuning"] });
      expect(values(successes[0])).toEqual([-2, -2]);
      // One skip in fair conditions: no roll.
      successes = [];
      await link(set(), set(), 1500, { skip: {} });
      expect(successes).toEqual([]);
      expect(chat[1]).toContain("GCC.HT.Sensor.ClearSignal");
    });

    it("can't skip to a transmitter with no large antenna", async () => {
      await link(gear("Large Radio (TL7)", { shortwave: true }, { tl: "7" }), gear("Large Radio (TL7)", { shortwave: true }, { tl: "7" }), 5000, { skip: {} });
      expect(chat[0]).toContain("GCC.HT.Sensor.NoLargeAntenna");
      expect(chat[0]).toContain("GCC.HT.Sensor.OutOfRange");
    });
  });
});

describe("radioDesign: how a radio is built (HT:EE pp. 28-30, 32, 34)", () => {
  const MILE = 1760;
  const EE_PAGE = "High-Tech: Electricity and Electronics p. 27";
  /** One of the supplement's radios, printed for code at half price (HT:EE p. 27). */
  const eeRadio = (name: string, tl: string, sensor: Record<string, unknown> = {}) => gear(name, sensor, { tl, reference: EE_PAGE });
  /** The trench radio kit's parts as the records hold them (HT:EE p. 29). */
  const transmitter = (sensor: Record<string, unknown> = { commMode: "transmitter", sparkGap: true, wideband: true }) => gear("Trench Radio Transmitter", sensor, { tl: "6", reference: "High-Tech: Electricity and Electronics p. 29" });
  const receiver = (sensor: Record<string, unknown> = { commMode: "receiver", sparkGap: true, crystalDetector: true }) => gear("Trench Radio Receiver", sensor, { tl: "6", reference: "High-Tech: Electricity and Electronics p. 29" });
  const wire = (sensor: Record<string, unknown> = { dipoleAntenna: true }) => gear("Trench Radio Antenna Wire (1,000 feet)", sensor, { tl: "6", reference: "High-Tech: Electricity and Electronics p. 29" });
  const keys = (item: any) => section().context(item).options.map((o: any) => o.key);
  async function link(mine: any[], theirs: any[], miles: number, own: Record<string, unknown> = {}, listener: Record<string, any> = {}): Promise<void> {
    controlled = [character("Nat", mine, listener)];
    targets = [character("Airk", theirs)];
    dialogAnswer = { yards: miles * MILE, urban: false, audioVisual: false, rate: 1, own };
    await tools.get("comm-range").open();
  }

  it("adds nothing with only High-Tech's radios on: the trench sets aren't radios, and no design options", () => {
    on = new Set([HT.radios]);
    expect(section().visible(transmitter())).toBe(false);
    expect(price(transmitter())).toBeNull();
    expect(keys(eeRadio("Large Radio (TL6)", "6"))).not.toContain("sparkGap");
    expect(price(eeRadio("Large Radio (TL6)", "6", { audio: true }))).toBeNull();
    // The supplement's radios are printed for code already: no code-only option to halve them again.
    expect(keys(eeRadio("Large Radio (TL6)", "6"))).not.toContain("codeOnly");
    expect(price(eeRadio("Large Radio (TL6)", "6", { codeOnly: true }))).toBeNull();
    expect(keys(gear("Large Radio (TL6)", {}, { tl: "6" }))).toContain("codeOnly");
  });

  describe("with radios and radioDesign on", () => {
    beforeEach(() => { on = new Set([HT.radios, EE.radioDesign]); });

    it("offers audio on the supplement's code sets at x2, and send-only at x0.9", () => {
      const radio = eeRadio("Large Radio (TL6)", "6");
      expect(keys(radio)).toEqual(expect.arrayContaining(["sparkGap", "audio", "quartzTuning"]));
      expect(section().context(radio).lines.join(" ")).toContain("GCC.HT.Sensor.CodePrinted");
      expect(section().context(radio).modes.map((m: any) => m.value)).toEqual(["", "receiver", "transmitter"]);
      expect(price(eeRadio("Large Radio (TL6)", "6", { audio: true }))).toMatchObject({ cost: 200, weight: 10 });
      expect(price(eeRadio("Large Radio (TL6)", "6", { commMode: "transmitter" }))).toMatchObject({ cost: 90, weight: 9 });
      // High-Tech's own radios carry audio already: no audio option, and send-only only where the design rules are on.
      expect(keys(gear("Large Radio (TL6)", {}, { tl: "6" }))).not.toContain("audio");
    });

    it("prices video against what the set is printed for (HT:EE p. 34)", () => {
      expect(price(eeRadio("Medium Radio (TL7)", "7", { video: true }))).toMatchObject({ cost: 400, weight: 20 });
      expect(price(gear("Medium Radio (TL7)", { video: true }, { tl: "7" }))).toMatchObject({ cost: 200, weight: 20 });
      // Video on a High-Tech set replaces its code-only option.
      expect(price(gear("Medium Radio (TL7)", { video: true, codeOnly: true }, { tl: "7" }))).toMatchObject({ cost: 200, weight: 20 });
      expect(price(gear("Tiny Radio (TL8)", { digitalVideo: true }))).toMatchObject({ cost: 200, weight: 20 });
    });

    it("prices quartz tuning at TL6 as cutting edge, unless the device is marked so", () => {
      expect(price(gear("Medium Radio (TL6)", { quartzTuning: true }, { tl: "6", equipmentQuality: "basic" }))).toMatchObject({ cost: 500 });
      const marked = gear("Medium Radio (TL6)", { quartzTuning: true }, { tl: "6", equipmentQuality: "basic" });
      marked.system.extensions[MODULE_ID].device = { cuttingEdge: true };
      expect(price(marked)).toBeNull();
      expect(section().context(marked).lines.join(" ")).toContain("GCC.HT.Sensor.DesignCuttingEdgeMarked");
    });

    it("reads the trench radio's sets as radios, priced as printed, and reprices a changed option (HT:EE p. 29)", () => {
      const tx = transmitter();
      expect(section().visible(tx)).toBe(true);
      const context = section().context(tx);
      expect(context.lines.join(" ")).toContain("GCC.HT.Sensor.PrintedBuild");
      expect(context.lines[0]).toContain('Miles {\\"value\\":50}');
      expect(context.options.map((o: any) => o.key)).toEqual(expect.arrayContaining(["sparkGap", "wideband", "rotarySparkGap"]));
      // As printed: no change to its $1,575 and 112.5 lbs.
      expect(price(tx, 1575, 112.5)).toBeNull();
      expect(price(receiver(), 250, 4.5)).toBeNull();
      // A rotary spark gap added: x5.
      expect(price(transmitter({ commMode: "transmitter", sparkGap: true, wideband: true, rotarySparkGap: true }), 1575, 112.5)).toMatchObject({ cost: 7875, weight: 112.5 });
      // Built without the wideband it must have: 90 lbs.
      expect(price(transmitter({ commMode: "transmitter", sparkGap: true }), 1575, 112.5)).toMatchObject({ weight: 90 });
      expect(section().context(transmitter({ commMode: "transmitter", sparkGap: true })).lines.join(" ")).toContain("GCC.HT.Sensor.WidebandRequired");
      // The receiver reads 0.5 mile (880 yards): a 5-mile set with a crystal.
      expect(section().context(receiver()).lines[0]).toContain('Yards {\\"value\\":880}');
    });

    it("links the trench sets at 5 miles, after the crystal's roll for a sensitive spot (HT:EE p. 28)", async () => {
      await link([receiver()], [transmitter()], 4.5);
      expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Communications)", tags: ["crystalSpot"] });
      expect(chat[0]).toContain('Miles {\\"value\\":5}');
      expect(chat[0]).toContain("GCC.HT.Sensor.CrystalFound");
      expect(chat[0]).toContain('GCC.HT.Sensor.SendOnly {"name":"Trench Radio Transmitter"}');
      // A failure: -2 to receive, so the signal in range takes a roll with it.
      successes = [];
      successResult = { success: false, margin: -1 };
      await link([receiver()], [transmitter()], 4.5);
      expect(successes[1]).toMatchObject({ skill: "Electronics Operation (Communications)", modifiers: [{ value: -2 }] });
      // A critical failure: nothing is received.
      successResult = { success: false, criticalFailure: true, margin: -6 };
      await link([receiver()], [transmitter()], 1);
      expect(chat[2]).toContain("GCC.HT.Sensor.CrystalLost");
      expect(chat[2]).toContain("GCC.HT.Sensor.OutOfRange");
    });

    it("strings the kit's wire as a dipole for its owner's sets, priced apart (HT:EE pp. 28-29)", async () => {
      const rx = receiver();
      await link([rx, wire()], [transmitter()], 7, { "dipole-a": "broadside" });
      // 5 miles x1.5.
      expect(chat[0]).toContain('Miles {\\"value\\":7.5}');
      expect(chat[0]).toContain("GCC.HT.Sensor.DipoleBroadside");
      expect(price(rx, 250, 4.5)).toBeNull();
      // The wire's own sheet, and the ground aerial's -2.
      const laid = wire({ dipoleAntenna: true, groundAerial: true });
      expect(section().visible(laid)).toBe(true);
      expect(keys(laid)).toEqual(["groundAerial"]);
      expect(price(laid)).toBeNull();
      successes = [];
      await link([receiver(), laid], [transmitter()], 7.4, { "dipole-a": "broadside" });
      expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([2, -2]);
    });

    it("adjusts a regenerative receiver: a fifth the range on a failure, oscillating on a critical failure (HT:EE p. 29)", async () => {
      const regen = () => gear("Medium Radio (TL6)", { regenerative: true }, { tl: "6" });
      successResult = { success: false, margin: -2 };
      await link([regen()], [gear("Medium Radio (TL6)", {}, { tl: "6" })], 1);
      expect(successes[0]).toMatchObject({ tags: ["regenerative"] });
      // 5 miles each end, the listener's cut to 1: the root of 5 is 2.2 miles.
      expect(chat[0]).toContain('Miles {\\"value\\":2.2}');
      expect(chat[0]).toContain("GCC.HT.Sensor.RegenerativeMissed");
      successResult = { success: false, criticalFailure: true, margin: -8 };
      await link([regen()], [gear("Medium Radio (TL6)", {}, { tl: "6" })], 1);
      expect(chat[1]).toContain("GCC.HT.Sensor.RegenerativeOscillates");
      expect(chat[1]).toContain("GCC.HT.Sensor.OutOfRange");
    });

    it("tunes a superheterodyne with a simple Hearing roll, where the tuning roll is on (HT:EE p. 29)", async () => {
      on = new Set([HT.radios, EE.radioDesign, EE.radioTuning]);
      const superhet = gear("Small Radio (TL6)", { superheterodyne: true }, { tl: "6" });
      expect(section().context(superhet).lines.join(" ")).toContain("GCC.HT.Sensor.TuningLine");
      await link([superhet], [gear("Small Radio (TL6)", {}, { tl: "6" })], 0.5, { conditions: -3 }, { derived: { per: 12, senses: [{ sense: "hearing", score: 14 }] } });
      expect(successes[0]).toMatchObject({ skill: "Hearing", base: 14, tags: ["radioTuning", "hearing"] });
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-3]);
    });

    it("tunes any audio set from TL7 as a superheterodyne, standard by then (HT:EE p. 29)", async () => {
      on = new Set([HT.radios, EE.radioDesign, EE.radioTuning]);
      const tl7 = gear("Small Radio (TL7)", {}, { tl: "7" });
      expect(section().context(tl7).lines.join(" ")).toContain("GCC.HT.Sensor.SuperhetStandard");
      await link([tl7], [gear("Small Radio (TL7)", {}, { tl: "7" })], 1, { conditions: -3 }, { derived: { per: 12, senses: [{ sense: "hearing", score: 14 }] } });
      expect(successes[0]).toMatchObject({ skill: "Hearing", base: 14, tags: ["radioTuning", "hearing"] });
      // The supplement's code set, with no audio, keeps the Electronics Operation roll.
      successes = [];
      const code = eeRadio("Small Radio (TL7)", "7");
      expect(section().context(code).lines.join(" ")).not.toContain("GCC.HT.Sensor.SuperhetStandard");
      await link([code], [gear("Small Radio (TL7)", {}, { tl: "7" })], 1, { conditions: -3 });
      expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Communications)", tags: ["radioTuning"] });
      // With the design rules off, the TL7 set is tuned as before.
      on = new Set([HT.radios, EE.radioTuning]);
      successes = [];
      await link([gear("Small Radio (TL7)", {}, { tl: "7" })], [gear("Small Radio (TL7)", {}, { tl: "7" })], 1, { conditions: -3 });
      expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Communications)" });
    });

    it("keeps an oscillating regenerative set jamming the receivers near it until it is adjusted again (HT:EE p. 29)", async () => {
      const flagged = (item: any) => Object.assign(item, {
        isOwner: true,
        flags: { ...item.flags },
        getFlag(scope: string, k: string) { return this.flags[scope]?.[k]; },
        async setFlag(scope: string, k: string, v: unknown) { (this.flags[scope] ??= {})[k] = v; },
        async unsetFlag(scope: string, k: string) { delete this.flags[scope]?.[k]; },
      });
      const regen = flagged(gear("Medium Radio (TL6)", { regenerative: true }, { tl: "6" }));
      successResult = { success: false, criticalFailure: true, margin: -8 };
      await link([regen], [gear("Medium Radio (TL6)", {}, { tl: "6" })], 1);
      expect(regen.flags[MODULE_ID].eeOscillating).toBe(true);
      expect(section().context(regen).lines.join(" ")).toContain("GCC.HT.Sensor.OscillatingNow");
      // Another set the same character carries hears through its interference: -4 at no distance.
      successResult = { success: true, margin: 3 };
      successes = [];
      const other = gear("Medium Radio (TL6)", {}, { tl: "6" });
      await link([other, regen], [gear("Medium Radio (TL6)", {}, { tl: "6" })], 1);
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-4]);
      expect(chat.at(-1)).toContain("GCC.HT.Sensor.OscillationLine");
      // Adjusted again, it stops.
      successes = [];
      await link([regen], [gear("Medium Radio (TL6)", {}, { tl: "6" })], 1);
      expect(regen.flags[MODULE_ID].eeOscillating).toBeUndefined();
      successes = [];
      await link([gear("Medium Radio (TL6)", {}, { tl: "6" }), regen], [gear("Medium Radio (TL6)", {}, { tl: "6" })], 1);
      expect(successes).toEqual([]);
    });

    it("gives a rotary spark gap's quality to sending on it, and says its ultra-high-speed audio is distorted", async () => {
      const rotary = transmitter({ commMode: "transmitter", sparkGap: true, wideband: true, rotarySparkGap: true });
      dialogAnswer = { task: "send", cipher: false };
      await actions.get("ht-telegraphy").run(rotary, character("Sparks", [rotary]));
      expect(successes[0].modifiers).toEqual([{ label: expect.stringContaining("GCC.HT.Sensor.QualityLine"), value: 1 }]);
      // The set is a tool for Electronics Operation (Communications) at its quality (HT:EE p. 28), over its own grade.
      const grade = grades.find((g) => g.key === "ht-rotary-spark-gap").grade;
      expect(grade(rotary, "Electronics Operation (Communications)")).toEqual({ modifier: 1 });
      const ultra = transmitter({ commMode: "transmitter", sparkGap: true, wideband: true, ultraRotarySparkGap: true });
      ultra.system.equipmentQuality = "good";
      expect(grade(ultra, "Electronics Operation (Communications)")).toEqual({ modifier: 3 });
      expect(grade(rotary, "Electronics Operation (EW)")).toBeNull();
      expect(grade(transmitter(), "Electronics Operation (Communications)")).toBeNull();
      // Where the preparation picked the set as the skill's tool, the skill carries it already: no second line.
      successes = [];
      const skill = { type: "skill", name: "Electronics Operation (Communications)", system: { derived: { toolItemId: rotary.id } } };
      await actions.get("ht-telegraphy").run(rotary, character("Sparks", [rotary, skill]));
      expect(successes[0].modifiers).toEqual([]);
      successResult = { success: true, margin: 3 };
      await link([gear("Large Radio (TL6)", {}, { tl: "6" })], [transmitter({ commMode: "transmitter", sparkGap: true, wideband: true, ultraRotarySparkGap: true })], 10);
      expect(chat.join(" ")).toContain("GCC.HT.Sensor.DistortedAudio");
    });

    it("cuts a wideband set's endurance to a fifth, against what a printed set counts already", async () => {
      const power = await import("../../../shared/power/data.js");
      expect(power.powerData(gear("Large Radio (TL6)", { commMode: "transmitter", sparkGap: true, wideband: true }, { tl: "6" })).enduranceFactor).toBeCloseTo(0.2);
      expect(power.powerData(transmitter()).enduranceFactor).toBe(1);
    });

    it("runs a crystal set on no power, and a diode set on one M cell for 14 hours (HT:EE p. 28)", async () => {
      const power = await import("../../../shared/power/data.js");
      const printed = (name: string, cells: number, hours: number, sensor: Record<string, unknown>) =>
        gear(name, {}, { tl: "6", extensions: { [MODULE_ID]: { sensor, power: { draw: { cell: "M", cells, endurance: `${hours} hours`, raw: `${cells}xM/${hours} hours` } } } } });
      const crystal = power.powerData(printed("Medium Radio (TL6)", 4, 14, { commMode: "receiver", sparkGap: true, crystalDetector: true }));
      expect(crystal.draw).toBeNull();
      expect(crystal.cell).toBeNull();
      // A large set's 3xM/3 hours: one M cell, 14 hours.
      const diode = power.powerData(printed("Large Radio (TL6)", 3, 3, { commMode: "receiver", sparkGap: true, diodeDetector: true }));
      expect(diode.draw?.cells).toBe(1);
      expect(diode.enduranceFactor).toBeCloseTo(14 / 3);
      // Nothing changes with the design rules off.
      on = new Set([HT.radios]);
      expect(power.powerData(printed("Medium Radio (TL6)", 4, 14, { commMode: "receiver", sparkGap: true, crystalDetector: true })).draw?.cells).toBe(4);
    });

    it("sends no speech to a coherer set, which detects code alone (HT:EE p. 28)", async () => {
      const coherer = () => gear("Medium Radio (TL6)", { commMode: "receiver", sparkGap: true, coherer: true }, { tl: "6" });
      await link([coherer()], [transmitter()], 1, { speech: true });
      expect(chat[0]).toContain("GCC.HT.Sensor.CohererCodeOnly");
      expect(chat[0]).toContain("GCC.HT.Sensor.OutOfRange");
      await link([coherer()], [transmitter()], 1, { speech: false });
      expect(chat[1]).not.toContain("GCC.HT.Sensor.CohererCodeOnly");
      expect(dialogs.at(-1)).toContain("GCC.HT.Sensor.SendsSpeech");
    });

    it("lets FM shrug off static, and blocks it under an equal or stronger signal (HT:EE p. 32)", async () => {
      on = new Set([HT.radios, EE.radioDesign, EE.radioTuning]);
      const fm = () => gear("Small Radio (TL7)", { fm: true }, { tl: "7" });
      await link([fm()], [gear("Small Radio (TL7)", {}, { tl: "7" })], 0.5, { conditions: -3, fm: "static" });
      expect(successes).toEqual([]);
      expect(chat[0]).toContain("GCC.HT.Sensor.ClearSignal");
      expect(dialogs.at(-1)).toContain("GCC.HT.Sensor.FmInterference");
      await link([fm()], [gear("Small Radio (TL7)", {}, { tl: "7" })], 0.5, { conditions: -3, fm: "weaker" });
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-3]);
      await link([fm()], [gear("Small Radio (TL7)", {}, { tl: "7" })], 0.5, { conditions: 0, fm: "stronger" });
      expect(chat[2]).toContain("GCC.HT.Sensor.FmBlocked");
      // An AM set takes the static.
      successes = [];
      await link([gear("Small Radio (TL7)", {}, { tl: "7" })], [gear("Small Radio (TL7)", {}, { tl: "7" })], 0.5, { conditions: -3, fm: "static" });
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-3]);
    });

    it("sends live video only from a set that sends it to one that receives it (HT:EE p. 34)", async () => {
      const set = (sensor: Record<string, unknown>) => gear("Medium Radio (TL7)", sensor, { tl: "7" });
      await link([set({ video: true, commMode: "receiver" })], [set({})], 1, { video: true });
      expect(chat[0]).toContain("GCC.HT.Sensor.NoVideoSent");
      await link([set({ video: true, commMode: "transmitter" })], [set({ video: true, commMode: "transmitter" })], 1, { video: true });
      expect(chat[1]).toContain("GCC.HT.Sensor.NoVideoReceived");
      await link([set({ video: true, commMode: "receiver" })], [set({ video: true, commMode: "transmitter" })], 1, { video: true });
      expect(chat[2]).not.toContain("NoVideo");
      expect(chat[2]).not.toContain("GCC.HT.Sensor.OutOfRange");
      // Sound alone goes through.
      await link([set({ video: true, commMode: "receiver" })], [set({})], 1, { video: false });
      expect(chat[3]).not.toContain("NoVideo");
    });
  });
});

describe("active sensors (pp. 45-47)", () => {
  beforeEach(() => { on = new Set([HT.activeSensors]); });

  it("prices the modes, and halves a TL8 radar's weight", () => {
    expect(price(gear("Small Radar", { tactical: true, lpi: true }))).toMatchObject({ cost: 2500, weight: 5 });
    expect(price(gear("Small Radar", { tactical: true }, { tl: "7" }))).toBeNull();
    expect(price(gear("Medium Sonar", { tactical: true, imaging: true }))).toMatchObject({ cost: 2500, weight: 20 });
  });

  it("locks on only with a tactical sensor, for +3 on top of any software", async () => {
    const radar = gear("Small Radar", { tactical: true });
    expect(actions.get("sensor-lock").visible(radar)).toBe(true);
    expect(actions.get("sensor-lock").visible(gear("Small Radar"))).toBe(false);
    const gunner = character("Gunner", [radar]);
    const plane = character("Plane", []);
    targets = [plane];
    await actions.get("sensor-lock").run(radar, gunner);
    const context = fire(HOOKS.attackModifiers, { actor: gunner, mode: { ranged: true }, targets: [plane], modifiers: [] });
    expect(context.modifiers).toEqual([{ label: expect.stringContaining("GCC.HT.Sensor.LockLine"), value: 3 }]);
  });

  it("sweeps at -2 per doubling past range, with sonar's noise, and nothing outside the arc", async () => {
    const sonar = gear("Small Sonar");
    const diver = character("Diver", [sonar], { skills: { "Electronics Operation (Sonar)": 12 } });
    controlled = [diver];
    targets = [character("Wreck", [])];
    dialogAnswer = { index: 0, yards: 400, arc: false, noise: -3, imaging: false, medium: "soil", counter: "" };
    await tools.get("sensor-sweep").open();
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Sonar)", base: 12, tags: ["detection", "sonar"] });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-4, -3]);
    dialogAnswer = { ...dialogAnswer, arc: true };
    await tools.get("sensor-sweep").open();
    expect(successes).toHaveLength(1);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.ArcMiss");
  });

  it("contests a jammer's operator with the radar operator", async () => {
    const radar = gear("Medium Radar");
    controlled = [character("Operator", [radar], { skills: { "Electronics Operation (Sensors)": 13 } })];
    targets = [character("Intruder", [], { skills: { "Electronics Operation (EW)": 14 } })];
    dialogAnswer = { index: 0, yards: 100, arc: false, noise: 0, imaging: false, medium: "soil", counter: "jammer" };
    await tools.get("sensor-sweep").open();
    expect(contests[0]).toMatchObject({ first: { base: 13 }, second: { base: 14, note: "Electronics Operation (EW)" } });
  });

  it("labels every row of a GPR's sweep with a translation, not a key (#549)", async () => {
    const translations = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../lang/en.json"), "utf8"));
    const text = (k: string) => k.split(".").reduce((node: any, part) => node?.[part], translations);
    controlled = [character("Surveyor", [gear("Portable GPR")])];
    await tools.get("sensor-sweep").open();
    const keys = [...dialogs[0]!.matchAll(/GCC\.[\w.]+/g)].map((m) => m[0]);
    expect(keys).toContain("GCC.HT.Sensor.MediumLabel");
    expect(keys.filter((k) => typeof text(k) !== "string")).toEqual([]);
  });

  it("sweeps with the supplement's GPR's high-frequency antenna at 10 yards, its low one at 50 (HT:EE p. 35)", async () => {
    controlled = [character("Surveyor", [gear("Ground-Penetrating Radar", {}, { tl: "7" })], { skills: { "Electronics Operation (Scientific)": 13 } })];
    dialogAnswer = { index: 0, yards: 30, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", highFrequency: false };
    await tools.get("sensor-sweep").open();
    expect(dialogs[0]).toContain("GCC.HT.Sensor.GprAntenna");
    expect(successes[0].modifiers).toEqual([]);
    dialogAnswer = { ...dialogAnswer, highFrequency: true };
    await tools.get("sensor-sweep").open();
    // 30 yards on 10: past two doublings' worth, -4.
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([-4]);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.GprHighLine");
    // High-Tech's own GPRs have one antenna.
    dialogs = [];
    controlled = [character("Surveyor", [gear("Portable GPR")])];
    await tools.get("sensor-sweep").open();
    expect(dialogs[0]).not.toContain("GCC.HT.Sensor.GprAntenna");
  });

  it("ignores the size and dwelling asked of the sweep while the supplement's switch is off", async () => {
    controlled = [character("Diver", [gear("Small Sonar")], { skills: { "Electronics Operation (Sonar)": 12 } })];
    targets = [character("Whale", [], { system: { sm: 5 } })];
    dialogAnswer = { index: 0, yards: 150, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", sm: 5, dwell: "x4" };
    await tools.get("sensor-sweep").open();
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2]);
    expect(tools.get("ht-emissions").visible()).toBe(false);
  });
});

describe("active rangefinding (HT:EE p. 35)", () => {
  beforeEach(() => { on = new Set([HT.activeSensors, HT.rangefindingEmissions]); });

  it("sweeps in half steps past range, with the target's size at half its SM", async () => {
    controlled = [character("Diver", [gear("Small Sonar")], { skills: { "Electronics Operation (Sonar)": 12 } })];
    targets = [character("Whale", [], { system: { sm: 5 } })];
    // 150 yards on a 100-yard sonar: -1 at 1.5 times; SM +5 counts +2.
    dialogAnswer = { index: 0, yards: 150, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", sm: 5, dwell: "" };
    await tools.get("sensor-sweep").open();
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-1, 2]);
    expect(successes[0].modifiers[1].label).toContain("GCC.HT.Sensor.SizeLine");
  });

  it("dwells 4 times as long to reach twice as far, and warns the target is helped to detect it", async () => {
    controlled = [character("Diver", [gear("Small Sonar")], { skills: { "Electronics Operation (Sonar)": 12 } })];
    targets = [character("Sub", [])];
    // 300 yards: twice the range is 200, so 1.5 times that: -1.
    dialogAnswer = { index: 0, yards: 300, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", sm: 0, dwell: "x4" };
    await tools.get("sensor-sweep").open();
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-1]);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.DwellLine");
    expect(chat.at(-1)).toContain('"bonus":"+2"');
  });

  it("shows the refinements and how far the emissions carry on a sensor's sheet", () => {
    const lines: string[] = section().context(gear("Medium Radar")).lines;
    expect(lines.some((l) => l.includes("GCC.HT.Sensor.Rangefinding"))).toBe(true);
    // 30 miles at TL8, read to four times that: 120 miles.
    expect(lines.find((l) => l.includes("GCC.HT.Sensor.EmissionReach"))).toContain('Miles {\\"value\\":120}');
    // A GPR's radio waves carry too (HT:EE p. 35): its 10 yards, read to 40.
    expect(section().context(gear("Portable GPR")).lines.find((l: string) => l.includes("EmissionReach"))).toContain('Yards {\\"value\\":40}');
  });

  // A fixture shaped as the supplement's catalogue will write the record (#479): named as printed, High-Tech's book flag, its TL.
  it("gives +2 to a skill from the supplement's ground-penetrating radar's successful sweep", async () => {
    const gpr = gear("Ground-Penetrating Radar", {}, { tl: "7" });
    expect(section().context(gpr).lines.some((l: string) => l.includes("GCC.HT.Sensor.SurveyLine"))).toBe(true);
    controlled = [character("Surveyor", [gpr], { skills: { "Electronics Operation (Scientific)": 13 } })];
    dialogAnswer = { index: 0, yards: 30, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", sm: 0, dwell: "" };
    await tools.get("sensor-sweep").open();
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Scientific)", base: 13, modifiers: [] });
    // With no skill named, the bonus is the GM's to give.
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.SurveyResult");
    expect(held).toEqual([]);
    // Naming one holds it for the operator's next roll of it (#549).
    dialogAnswer = { ...dialogAnswer, survey: "Archaeology" };
    await tools.get("sensor-sweep").open();
    expect(held).toEqual([{ actor: "Surveyor", label: 'GCC.HT.Sensor.SurveyHeldLabel {"sensor":"Ground-Penetrating Radar"}', value: 2, skill: "Archaeology" }]);
    expect(chat.at(-1)).toContain('GCC.HT.Sensor.SurveyHeld {"bonus":"+2","name":"Surveyor","skill":"Archaeology"}');
    // Not on a failure, and not from High-Tech's own GPRs.
    successResult = { success: false, margin: -1 };
    chat = [];
    await tools.get("sensor-sweep").open();
    expect(chat).toEqual([]);
    expect(held).toHaveLength(1);
    expect(section().context(gear("Portable GPR")).lines.some((l: string) => l.includes("SurveyLine"))).toBe(false);
  });

  it("sweeps with the supplement's handheld sonar at its 10 yards", async () => {
    controlled = [character("Diver", [gear("Handheld Sonar")], { skills: { "Electronics Operation (Sonar)": 12 } })];
    dialogAnswer = { index: 0, yards: 20, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", sm: 0, dwell: "" };
    await tools.get("sensor-sweep").open();
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2]);
  });
});

describe("detecting a sensor's emissions (HT:EE p. 35), with only the supplement's switch on (D1)", () => {
  beforeEach(() => { on = new Set([HT.rangefindingEmissions]); });

  // A TL8 medium radar: 30 miles, so 60 free and 120 at the most.
  const MILE = 1760;
  const setUp = () => {
    controlled = [character("Listener", [], { skills: { "Electronics Operation (EW)": 13 } })];
    targets = [character("Ship", [gear("Medium Radar")])];
  };

  it("gives the laser measuring tool's +1 to Cartography and Engineer rolls (HT:EE p. 35)", () => {
    const surveyor = character("Surveyor", [gear("Laser Measuring Tool")]);
    const roll = (skill: string) => fire("gworld.successRollModifiers", { actor: surveyor, skill, tags: [], modifiers: [] }).modifiers.map((m: any) => m.value);
    expect(roll("Cartography")).toEqual([1]);
    expect(roll("Engineer (Civil)")).toEqual([1]);
    expect(roll("Architecture")).toEqual([]);
    on = new Set();
    expect(roll("Cartography")).toEqual([]);
  });

  it("offers the tool with the switch on, not the sweep", () => {
    expect(tools.get("ht-emissions").visible()).toBe(true);
    expect(tools.get("sensor-sweep").visible()).toBe(false);
  });

  it("detects without a roll within twice the range, and nothing outside the arc", async () => {
    setUp();
    dialogAnswer = { index: 0, yards: 60 * MILE, arc: false, dwell: "", skill: "Electronics Operation (EW)" };
    await tools.get("ht-emissions").open();
    expect(successes).toEqual([]);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.EmissionsDetected");
    dialogAnswer = { ...dialogAnswer, arc: true };
    await tools.get("ht-emissions").open();
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.EmitterArcMiss");
  });

  it("rolls at -1 per further 20% of the range, +4 while its operator dwells 15 times as long", async () => {
    setUp();
    // 72 miles: 12 past 60, two-fifths of the range: -2.
    dialogAnswer = { index: 0, yards: 72 * MILE, arc: false, dwell: "x15", skill: "Electronics Operation (EW)" };
    await tools.get("ht-emissions").open();
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (EW)", base: 13, tags: ["detection", "emissions", "radar"] });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2, 4]);
  });

  it("can't detect past four times the range", async () => {
    setUp();
    dialogAnswer = { index: 0, yards: 121 * MILE, arc: false, dwell: "", skill: "Electronics Operation (EW)" };
    await tools.get("ht-emissions").open();
    expect(successes).toEqual([]);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.EmissionsOut");
  });

  it("wants a target carrying an active rangefinder", async () => {
    controlled = [character("Listener", [])];
    targets = [character("Watcher", [gear("Binoculars")])];
    await tools.get("ht-emissions").open();
    expect(ui.notifications!.warn).toHaveBeenCalledWith("GCC.HT.Sensor.NoEmitter");
  });

  it("detects a GPR's radio waves and a laser measuring tool's lidar as well (HT:EE p. 35)", async () => {
    controlled = [character("Listener", [], { skills: { "Electronics Operation (EW)": 13, "Electronics Operation (Sensors)": 12 } })];
    targets = [character("Digger", [gear("Portable GPR")])];
    // The portable GPR reaches 10 yards: 20 free, and 12 yards past it is -6.
    dialogAnswer = { index: 0, yards: 32, arc: false, dwell: "", skill: "Electronics Operation (EW)" };
    await tools.get("ht-emissions").open();
    expect(successes[0]).toMatchObject({ tags: ["detection", "emissions", "gpr"] });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-6]);
    // The laser measuring tool's 100 yards: 250 yards is 50 past 200, -3.
    targets = [character("Surveyor", [gear("Laser Measuring Tool")])];
    dialogAnswer = { index: 0, yards: 250, arc: false, dwell: "", skill: "Electronics Operation (Sensors)" };
    await tools.get("ht-emissions").open();
    expect(successes[1]).toMatchObject({ skill: "Electronics Operation (Sensors)", tags: ["detection", "emissions", "lidar"] });
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([-3]);
  });
});

describe("optics, night vision and thermographs (pp. 47-48)", () => {
  beforeEach(() => { on = new Set([HT.visualSensors]); });

  it("gives worn binoculars Telescopic Vision, and nothing while carried", () => {
    expect(traitEffects(character("Scout", [wornGear("Binoculars (TL6)")])).effects.telescopicVision).toBe(2);
    expect(traitEffects(character("Scout", [gear("Binoculars (TL6)")])).effects.telescopicVision).toBe(0);
  });

  it("gives night-vision goggles Night Vision and imposes the three disadvantages while in use", () => {
    const { effects, sources } = traitEffects(character("Scout", [wornGear("Night Vision Goggles")]));
    expect(effects).toMatchObject({ nightVision: 9, colorblindness: true, noDepthPerception: true, restrictedVision: "noPeripheral" });
    expect(sources.map((s) => s.effect)).toEqual(["nightVision", "colorblindness", "noDepthPerception", "restrictedVision.noPeripheral"]);
    // Never loosens a worse restriction.
    const context = traitEffects(character("Scout", [wornGear("Night Vision Goggles")]));
    expect(context.effects.restrictedVision).toBe("noPeripheral");
  });

  it("adds two levels under IR light, and gives a thermograph Infravision", () => {
    expect(traitEffects(character("Scout", [wornGear("Night-Vision Binoculars (TL7)", { irIlluminated: true })])).effects.nightVision).toBe(6);
    const thermal = traitEffects(character("Scout", [wornGear("Thermal-Imaging Binoculars")])).effects;
    expect(thermal).toMatchObject({ infravision: true, telescopicVision: 3, colorblindness: true });
    expect(traitEffects(character("Guard", [wornGear("Thermal-Imaging Surveillance Camera")])).sources).toEqual([]);
  });

  it("gives a thermograph +3 to Tracking and +2 to spot a warm target; an IR source is +4 to spot", () => {
    const scout = character("Scout", [wornGear("Mini-Thermal Imager")]);
    const tracking = fire(HOOKS.successRollModifiers, { actor: scout, skill: "Tracking", tags: ["skill", "detection"], modifiers: [] });
    expect(tracking.modifiers.map((m: any) => m.value)).toEqual([3]);
    const lurker = character("Lurker", [wornGear("Military Surplus Night-Vision Binoculars", { irIlluminated: true })]);
    const vision = fire(HOOKS.successRollModifiers, { actor: scout, skill: "", tags: ["attribute", "vision", "detection"], subject: lurker, modifiers: [] });
    expect(vision.modifiers.map((m: any) => m.value)).toEqual([2, 4]);
  });

  it("protects the eyes behind a worn optic with DR 1 (p. 47)", () => {
    const dr = (actor: any, hitLocation: string) => fire(HOOKS.armorDr, { actor, hitLocation, lines: [] }).lines;
    const scout = character("Scout", [wornGear("Binoculars (TL6)")]);
    expect(dr(scout, "eye")).toEqual([expect.objectContaining({ dr: 1, source: "armor", applies: true })]);
    expect(dr(scout, "face")).toEqual([]);
    expect(dr(character("Scout", [gear("Binoculars (TL6)")]), "eye")).toEqual([]);
    expect(dr(character("Guard", [wornGear("Thermal-Imaging Surveillance Camera")]), "eye")).toEqual([]);
  });

  it("puts a moving vehicle's jolting on a Vision roll through binoculars, and stabilized ones cancel up to -3 (p. 47)", () => {
    const vision = (actor: any) => fire(HOOKS.successRollModifiers, { actor, skill: "", tags: ["attribute", "vision"], modifiers: [] }).modifiers;
    const aboard = { vehicle: {}, operator: false, moving: true, medium: "ground" };
    // A handheld optic on a bad road: -3 (Campaigns p. 548).
    expect(vision(character("Scout", [wornGear("Binoculars (TL6)")], { aboard }))).toEqual([{ key: `${MODULE_ID}.observingMoving`, label: expect.stringContaining("ObservingMoving"), value: -3 }]);
    expect(vision(character("Scout", [wornGear("Stabilized Binoculars")], { aboard }))).toEqual([expect.objectContaining({ value: 0, label: expect.stringContaining("ObservingStabilized") })]);
    // In the air a handheld piece takes -1.
    expect(vision(character("Scout", [wornGear("Binoculars (TL6)")], { aboard: { ...aboard, medium: "air" } }))[0].value).toBe(-1);
    // Standing still, no optic up, or an optic with no magnification: nothing.
    expect(vision(character("Scout", [wornGear("Binoculars (TL6)")], { aboard: { ...aboard, moving: false } }))).toEqual([]);
    expect(vision(character("Scout", [gear("Binoculars (TL6)")], { aboard }))).toEqual([]);
    expect(vision(character("Scout", [wornGear("Night Vision Goggles")], { aboard }))).toEqual([]);
  });

  it("rolls Stealth against lens shine, +4 with a hood", async () => {
    const spotter = character("Spotter", [], { skills: { Stealth: 12 } });
    await actions.get("ht-lens-shine").run(gear("Binoculars (TL6)", { lensHood: true }), spotter);
    expect(successes[0]).toMatchObject({ skill: "Stealth", base: 12, modifiers: [{ value: 4 }] });
  });
});

describe("hydrophones and sound detectors (pp. 48-50)", () => {
  beforeEach(() => { on = new Set([HT.passiveSensors]); });

  it("rolls a hydrophone's detection with its bonus and the table's lines, and a fix gives +3 to hit and +4 to shadow", async () => {
    const hydrophone = gear("Medium Hydrophone");
    const listener = character("Sonarman", [hydrophone], { skills: { "Electronics Operation (Sonar)": 12 } });
    const sub = character("Sub", [], { system: { sm: 7 } });
    targets = [sub];
    dialogAnswer = { sm: 7, speed: 10, range: 700, current: 0 };
    await actions.get("ht-hydrophone").run(hydrophone, listener);
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([6, 7, 4, -15]);
    // The fix's +3, and the detection's own lines (7 + 4 - 15) carried to the attack (p. 49).
    const attack = fire(HOOKS.attackModifiers, { actor: listener, mode: { ranged: true }, targets: [sub], modifiers: [] });
    expect(attack.modifiers.map((m: any) => m.value)).toEqual([3, -4]);
    expect(attack.modifiers[1].label).toContain("FixPenalty");
    const shadow = fire(HOOKS.successRollModifiers, { actor: listener, skill: "Shadowing", tags: ["skill"], subject: sub, modifiers: [] });
    expect(shadow.modifiers.map((m: any) => m.value)).toEqual([4]);
  });

  it("never carries a bonus from the detection to the attack", async () => {
    const hydrophone = gear("Medium Hydrophone");
    const listener = character("Sonarman", [hydrophone]);
    const tanker = character("Tanker", [], { system: { sm: 12 } });
    targets = [tanker];
    // Size +12, range 100 yards -10: a net bonus, which the attack doesn't get.
    dialogAnswer = { sm: 12, speed: 0, range: 100, current: 0 };
    await actions.get("ht-hydrophone").run(hydrophone, listener);
    const attack = fire(HOOKS.attackModifiers, { actor: listener, mode: { ranged: true }, targets: [tanker], modifiers: [] });
    expect(attack.modifiers.map((m: any) => m.value)).toEqual([3]);
  });

  it("works a sound detector only in air, and triangulates with the other sites' results", async () => {
    const horns = gear("Sound-Detection Gear");
    const listener = character("Listener", [horns]);
    dialogAnswer = { task: "locate", miles: 10, db: 100, ambient: 0, medium: "water", sites: "none" };
    await actions.get("ht-sound-detection").run(horns, listener);
    expect(successes).toEqual([]);
    expect(chat.at(-1)).toContain("AirOnly.water");
    dialogAnswer = { task: "locate", miles: 10, db: 100, ambient: 0, medium: "air", sites: "success" };
    successResult = { success: true, criticalSuccess: true, margin: 8 };
    await actions.get("ht-sound-detection").run(horns, listener);
    expect(chat.at(-1)).toContain("Triangulated");
    successResult = { success: true, margin: 2 };
    await actions.get("ht-sound-detection").run(horns, listener);
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.Triangulate");
  });

  it("lists what each detector finds, weighs the metal detector half at TL8, and reads a Geiger counter", async () => {
    expect(section().context(gear("Handheld Detector")).lines[0]).toContain("Detector.handheld");
    expect(price(gear("Metal Detector", {}, { tl: "8" }), 100, 12)).toMatchObject({ weight: 6 });
    expect(price(gear("Metal Detector", {}, { tl: "7" }), 100, 12)).toBeNull();
    const counter = gear("Geiger Counter (TL8)");
    expect(actions.get("ht-geiger").visible(counter)).toBe(true);
    await actions.get("ht-geiger").run(counter, character("Tech", [counter], { skills: { "Electronics Operation (Scientific)": 13 } }));
    expect(successes.at(-1)).toMatchObject({ base: 13, skill: "Electronics Operation (Scientific)" });
    expect(chat.at(-1)).toContain("GeigerClue");
    // With the supplement's instruments on, its own "Use" reads it instead.
    on = new Set([HT.passiveSensors, key("electricalMeasurement")]);
    expect(actions.get("ht-geiger").visible(counter)).toBe(false);
  });

  it("gives a search hydrophone no fix to hit, at a tenth of the price", async () => {
    const hydrophone = gear("Small Hydrophone", { search: true });
    expect(price(hydrophone, 5000, 15)).toMatchObject({ cost: 500, weight: 15 });
    const listener = character("Trawler", [hydrophone]);
    targets = [character("Whale", [])];
    dialogAnswer = { sm: 5, speed: 0, range: 100, current: 0 };
    await actions.get("ht-hydrophone").run(hydrophone, listener);
    expect(combatState.size).toBe(0);
  });

  it("gives a worn directional microphone Parabolic Hearing", () => {
    expect(traitEffects(character("Snoop", [wornGear("Directional Microphone")])).effects.parabolicHearing).toBe(3);
    expect(traitEffects(character("Snoop", [wornGear("Directional Microphone", {}, { tl: "7" })])).effects.parabolicHearing).toBe(2);
  });
});

describe("the shared engine with both books' tables (D1)", () => {
  it("gives Ultra-Tech's gear Ultra-Tech's figures under Ultra-Tech's switches alone", () => {
    on = new Set([UT.communicators, UT.sensors]);
    // An Ultra-Tech receive-only radio: 10% of the cost, 20% of the weight.
    expect(price(gear("Radio Communicator (Small)", { commMode: "receiver" }, { tl: "9" }, "ultra-tech"))).toMatchObject({ cost: 10, weight: 2, label: "GCC.UT.Sensor.Title" });
    expect(traitEffects(character("Trooper", [wornGear("Night Vision Goggles or Visor", {}, { tl: "9" }, "ultra-tech")])).effects).toMatchObject({ nightVision: 9, telescopicVision: 2, colorblindness: false });
    // High-Tech's gear stays off.
    expect(price(gear("Small Radio (TL8)", { commMode: "receiver" }))).toBeNull();
    expect(traitEffects(character("Scout", [wornGear("Night Vision Goggles")])).sources).toEqual([]);
  });

  it("keeps Ultra-Tech's lock needing targeting software, and High-Tech's not", async () => {
    on = new Set([UT.sensors, HT.activeSensors]);
    const utRadar = gear("Medium Radar", {}, { tl: "9" }, "ultra-tech");
    const gunner = character("Gunner", [utRadar]);
    const drone = character("Drone", []);
    targets = [drone];
    await actions.get("sensor-lock").run(utRadar, gunner);
    expect(chat.at(-1)).toContain("GCC.UT.Sensor.LockedNoSoftware");
    expect(fire(HOOKS.attackModifiers, { actor: gunner, mode: { ranged: true }, targets: [drone], modifiers: [] }).modifiers).toEqual([]);
  });

  it("holds every book's options in the one field", () => {
    const data = shared.sensorData(gear("Small Radio (TL8)", { quantum: true, eccm: true }));
    expect(data.options).toMatchObject({ quantum: true, eccm: true, tactical: false, lensHood: false });
  });
});

describe("the supplement's electronic warfare on High-Tech's radios (HT:EE pp. 46-48)", () => {
  const MILE = 1760;

  it("adds nothing with only the radios switch on", () => {
    on = new Set([HT.radios]);
    const radio = gear("Medium Radio (TL8)", { eccm: true, directSequence: true, rdf: true, hfdf: true });
    const context = section().context(radio);
    expect(context.options.map((o: any) => o.key)).not.toEqual(expect.arrayContaining(["directSequence"]));
    expect(context.options.map((o: any) => o.key)).not.toContain("rdf");
    // ECCM alone: twice the cost, and High-Tech's line.
    expect(price(radio)).toMatchObject({ cost: 200 });
    expect(context.lines.join(" ")).toContain("GCC.HT.Sensor.EccmLine");
    expect(actions.get("ht-direction-finder").visible(gear("Medium Radio (TL8)", { rdf: true }))).toBe(false);
  });

  describe("spreadSpectrum", () => {
    beforeEach(() => { on = new Set([HT.radios, EE.spreadSpectrum]); });

    it("reads ECCM as frequency hopping, offers and prices direct sequence from TL8 as cutting edge", () => {
      const hopper = gear("Medium Radio (TL7)", { eccm: true }, { tl: "7" });
      const lines = section().context(hopper).lines.join(" ");
      expect(lines).toContain("GCC.HT.Sensor.HoppingLine");
      // Detected at twice its range, 10 miles at TL7: 20 miles.
      expect(lines).toContain('Miles {\\"value\\":20}');
      expect(section().context(hopper).options.map((o: any) => o.key)).not.toContain("directSequence");
      const direct = gear("Medium Radio (TL8)", { directSequence: true });
      expect(section().context(direct).options.map((o: any) => o.key)).toContain("directSequence");
      expect(section().context(direct).lines.join(" ")).toContain("GCC.HT.Sensor.DirectSequenceLine");
      // Twice the cost, and five times as a basic cutting-edge device.
      expect(price(direct)).toMatchObject({ cost: 1000, weight: 10 });
      expect(price(gear("Medium Radio (TL7)", { directSequence: true }, { tl: "7" }))).toBeNull();
    });

    it("is -4 to intercept a hopping radio", async () => {
      const intercept = gear("Large Radio (TL8)", { intercept: true });
      targets = [character("Talker", [gear("Small Radio (TL8)", { eccm: true })])];
      dialogAnswer = { avoiding: false };
      await actions.get("ht-intercept").run(intercept, character("Listener", [intercept], { skills: { "Electronics Operation (EW)": 12 } }));
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-4]);
    });

    it("gives direct sequence +4 against interference on the tuning roll, never more than it", async () => {
      on = new Set([EE.radioTuning, EE.spreadSpectrum]);
      const radio = gear("Small Radio (TL8)", { directSequence: true });
      const listener = character("Listener", [radio], { skills: { "Electronics Operation (Communications)": 13 } });
      dialogAnswer = { yards: 1 * MILE, range: 5 * MILE, conditions: -2, galvanometer: false, drift: false, skip: {} };
      await actions.get("ht-radio-tuning").run(radio, listener);
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2, 2]);
    });
  });

  describe("signalsIntelligence", () => {
    beforeEach(() => { on = new Set([HT.radios, EE.signalsIntelligence]); });

    it("offers the RDF (x2) and HF/DF (TL7, x5), each of which takes fixes", () => {
      const keys = (item: any) => section().context(item).options.map((o: any) => o.key);
      expect(keys(gear("Large Radio (TL6)", {}, { tl: "6" }))).toContain("rdf");
      expect(keys(gear("Large Radio (TL6)", {}, { tl: "6" }))).not.toContain("hfdf");
      expect(keys(gear("Large Radio (TL7)", {}, { tl: "7" }))).toEqual(expect.arrayContaining(["rdf", "hfdf"]));
      expect(price(gear("Large Radio (TL7)", { rdf: true }, { tl: "7" }))).toMatchObject({ cost: 200 });
      expect(price(gear("Large Radio (TL7)", { hfdf: true }, { tl: "7" }))).toMatchObject({ cost: 500 });
      expect(actions.get("ht-direction-finder").visible(gear("Large Radio (TL7)", { hfdf: true }, { tl: "7" }))).toBe(true);
      expect(section().context(gear("Large Radio (TL8)", { intercept: true })).lines.join(" ")).toContain("GCC.HT.Sensor.InterceptUnitLine");
    });

    it("adds a carried oscilloscope's +1 to a fix, and takes HF/DF's fix at EW with no haste", async () => {
      const hfdf = gear("Large Radio (TL7)", { hfdf: true }, { tl: "7" });
      const hunter = character("Hunter", [hfdf, gear("Oscilloscope", {}, { tl: "6" })], { skills: { "Electronics Operation (EW)": 13 } });
      dialogAnswer = { system: "hfdf", antennas: "three", baseline: 0, yards: 0, seconds: 5, concealed: false };
      await actions.get("ht-direction-finder").run(hfdf, hunter);
      expect(successes[0]).toMatchObject({ base: 13, modifiers: [{ value: 6 }, { value: 1 }] });
    });
  });

  describe("cipherMachines", () => {
    it("lets extra time offset the -4 for sending enciphered text", async () => {
      on = new Set([HT.radios, EE.cipherMachines]);
      const key = gear("Telegraph Key", {}, { tl: "6" });
      const operator = character("Operator", [key], { skills: { "Electronics Operation (Communications)": 13 } });
      dialogAnswer = { task: "send", cipher: true, times: 4 };
      await actions.get("ht-telegraphy").run(key, operator);
      expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-4, 2]);
    });
  });
});
