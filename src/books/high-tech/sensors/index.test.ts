/**
 * High-Tech's comms and sensors as the system meets them, through the shared
 * engine: prices, the item sheet section, worn optics as senses and what they
 * impose, the comm tool, the lock, the thermograph's and IR source's lines,
 * and the hydrophone's fix -- with only High-Tech's switches on (decision D1),
 * beside Ultra-Tech's table, whose gear keeps its own figures.
 */

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
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let prices: any[];
let successes: any[];
let contests: any[];
let chat: string[];
let combatState: Map<string, any>;
let on: Set<string>;
let dialogAnswer: any;
let targets: any[];
let controlled: any[];
let successResult: any;

const key = (k: string) => `${MODULE_ID}.${k}`;
const HT = { radios: key("radios"), activeSensors: key("activeSensors"), visualSensors: key("visualSensors"), passiveSensors: key("passiveSensors"), rangefindingEmissions: key("rangefindingEmissions") };
/** The supplement Electricity and Electronics' radio switches, which join High-Tech's (E1 in #471). */
const EE = { radioTuning: key("radioTuning"), radioAntennas: key("radioAntennas"), shortwaveSkip: key("shortwaveSkip") };
const UT = { communicators: key("communicators"), sensors: key("sensors") };

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (k: string) => on.has(k) },
    data: { registerPriceModifier: (m: any) => prices.push(m) },
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

/** Loads fresh modules, registers both books' tables, and readies both, as a build with every book does. */
async function load(): Promise<void> {
  vi.resetModules();
  tables = await import("../../../shared/book-tables.js");
  shared = await import("../../../shared/sensors/index.js");
  const ut = await import("../../ultra-tech/sensors/index.js");
  const ht = await import("./index.js");
  tables.setRuleReader((k) => on.has(k));
  ut.initUltraTechSensors(UT);
  ht.initHighTechSensors({ ...HT, ...EE });
  const api = fakeApi();
  ut.readyUltraTechSensors(api as never, { communicators: () => on.has(UT.communicators), sensors: () => on.has(UT.sensors) });
  ht.readyHighTechSensors(api as never, { radios: () => on.has(HT.radios), active: () => on.has(HT.activeSensors), visual: () => on.has(HT.visualSensors), passive: () => on.has(HT.passiveSensors), tuning: () => on.has(EE.radioTuning) });
}

beforeEach(async () => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  tools = new Map();
  prices = [];
  successes = [];
  contests = [];
  chat = [];
  combatState = new Map();
  on = new Set();
  dialogAnswer = null;
  targets = [];
  controlled = [];
  successResult = { success: true, margin: 3 };
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
  });
  vi.stubGlobal("canvas", { get tokens() { return { controlled: controlled.map((actor) => ({ actor })) }; } });
  vi.stubGlobal("foundry", { data: { fields: {} }, utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
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

  it("fixes a transmitter with a direction finder, exactly on a margin of 5", async () => {
    const rdf = gear("Medium Radio (TL8)", { directionFinder: true });
    expect(actions.get("ht-direction-finder").visible(rdf)).toBe(true);
    expect(actions.get("ht-direction-finder").visible(gear("Medium Radio (TL8)"))).toBe(false);
    targets = [character("Spy", [])];
    await actions.get("ht-direction-finder").run(rdf, character("Hunter", [rdf]));
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.Fix.exact");
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
    // No emissions to reach on a GPR.
    expect(section().context(gear("Portable GPR")).lines.some((l: string) => l.includes("EmissionReach"))).toBe(false);
  });

  // A fixture shaped as the supplement's catalogue will write the record (#479): named as printed, High-Tech's book flag, its TL.
  it("gives +2 to a skill from the supplement's ground-penetrating radar's successful sweep", async () => {
    const gpr = gear("Ground-Penetrating Radar", {}, { tl: "7" });
    expect(section().context(gpr).lines.some((l: string) => l.includes("GCC.HT.Sensor.SurveyLine"))).toBe(true);
    controlled = [character("Surveyor", [gpr], { skills: { "Electronics Operation (Scientific)": 13 } })];
    dialogAnswer = { index: 0, yards: 30, arc: false, noise: 0, imaging: false, medium: "soil", counter: "", sm: 0, dwell: "" };
    await tools.get("sensor-sweep").open();
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Scientific)", base: 13, modifiers: [] });
    expect(chat.at(-1)).toContain("GCC.HT.Sensor.SurveyResult");
    // Not on a failure, and not from High-Tech's own GPRs.
    successResult = { success: false, margin: -1 };
    chat = [];
    await tools.get("sensor-sweep").open();
    expect(chat).toEqual([]);
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

  it("wants a target carrying a sonar or radar", async () => {
    controlled = [character("Listener", [])];
    targets = [character("Digger", [gear("Portable GPR")])];
    await tools.get("ht-emissions").open();
    expect(ui.notifications!.warn).toHaveBeenCalledWith("GCC.HT.Sensor.NoEmitter");
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
    const attack = fire(HOOKS.attackModifiers, { actor: listener, mode: { ranged: true }, targets: [sub], modifiers: [] });
    expect(attack.modifiers.map((m: any) => m.value)).toEqual([3]);
    const shadow = fire(HOOKS.successRollModifiers, { actor: listener, skill: "Shadowing", tags: ["skill"], subject: sub, modifiers: [] });
    expect(shadow.modifiers.map((m: any) => m.value)).toEqual([4]);
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
