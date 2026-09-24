/**
 * Signals intelligence and the cipher machines' row buttons (HT:EE pp.
 * 47-48), with only the supplement's own switches on (D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";

const key = (k: string) => `${MODULE_ID}.${k}`;
const SWITCHES = {
  radios: key("radios"), activeSensors: key("activeSensors"), visualSensors: key("visualSensors"), passiveSensors: key("passiveSensors"),
  radioTuning: key("radioTuning"), spreadSpectrum: key("spreadSpectrum"), signalsIntelligence: key("signalsIntelligence"), cipherMachines: key("cipherMachines"),
};

let on: Set<string>;
let actions: Map<string, any>;
let successes: any[];
let contests: any[];
let chat: string[];
let answers: any[];
let targets: any[];
let successResult: any;

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: (k: string) => on.has(k) },
    data: { registerPriceModifier: () => {} },
    combat: { hooks: { successRollModifiers: "gworld.successRollModifiers", afterQuickContest: "gworld.afterQuickContest" }, setCombatState: async () => {}, getCombatState: () => undefined },
    sheets: { registerSheetSection: () => {}, registerRowAction: (a: any) => actions.set(a.key, a), registerGmTool: () => {} },
    actors: {
      attribute: (actor: any, k: string) => actor?.attributes?.[k] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: () => null,
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: "first", marginOfVictory: 2 }; },
    },
  };
}

let n = 0;
function gear(name: string, sensor: Record<string, unknown> = {}, more: Record<string, any> = {}): any {
  n += 1;
  return { id: `item${n}`, name, type: "equipment", system: { tl: "8", carried: true, extensions: { [MODULE_ID]: { sensor } }, ...more }, flags: { [MODULE_ID]: { book: "high-tech" } } };
}
function character(name: string, items: any[], skills: Record<string, number> = {}): any {
  const actor: any = { name, uuid: `Actor.${name}`, items, attributes: { IQ: 12 }, skills, getActiveTokens: () => [] };
  for (const item of items) item.actor = actor;
  return actor;
}
const values = (roll: any) => roll.modifiers.map((m: any) => m.value);

beforeEach(async () => {
  on = new Set();
  actions = new Map();
  successes = [];
  contests = [];
  chat = [];
  answers = [];
  targets = [];
  successResult = { success: true, margin: 2 };
  vi.stubGlobal("Hooks", { on: () => {} });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
  });
  vi.stubGlobal("canvas", { tokens: { controlled: [] } });
  // Each dialog takes the next answer given.
  vi.stubGlobal("foundry", { data: { fields: {} }, utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => answers.shift() ?? null } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class { total = 1; async evaluate() { return this; } });
  vi.resetModules();
  const tables = await import("../../../shared/book-tables.js");
  tables.setRuleReader((k) => on.has(k));
  const sensors = await import("../sensors/index.js");
  sensors.initHighTechSensors(SWITCHES);
  const sigint = await import("./index.js");
  sigint.readySigint(fakeApi() as never, { sigint: () => on.has(SWITCHES.signalsIntelligence), cipher: () => on.has(SWITCHES.cipherMachines) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("offers nothing", () => {
    expect(actions.get("ht-sigint").visible(gear("Small Radio (TL8)"))).toBe(false);
    expect(actions.get("ht-cipher-send").visible(gear("Cipher Machine", {}, { tl: "6" }))).toBe(false);
  });
});

describe("signalsIntelligence alone (HT:EE pp. 47-48)", () => {
  beforeEach(() => { on = new Set([SWITCHES.signalsIntelligence]); });

  it("shows on radios, the radio peripheral and spectrum analyzers", () => {
    const visible = (item: any) => actions.get("ht-sigint").visible(item);
    expect(visible(gear("Small Radio (TL8)"))).toBe(true);
    expect(visible(gear("Radio Peripheral"))).toBe(true);
    expect(visible(gear("Spectrum Analyzer", {}, { tl: "7" }))).toBe(true);
    expect(visible(gear("Spectrum Analyzer (Digital)"))).toBe(true);
    expect(visible(gear("Oscilloscope"))).toBe(false);
  });

  it("monitors routine traffic at the better of Communications and EW, +4 with an intercept unit", async () => {
    const unit = gear("Large Radio (TL7)", { intercept: true, commMode: "receiver" }, { tl: "7" });
    const operator = character("Op", [unit], { "Electronics Operation (Communications)": 12, "Electronics Operation (EW)": 13 });
    answers = [{ task: "routine" }];
    await actions.get("ht-sigint").run(unit, operator);
    expect(successes[0]).toMatchObject({ base: 13, skill: "Electronics Operation (EW)" });
    expect(values(successes[0])).toEqual([4]);
  });

  it("listens for a hopping sender with a plain receiver: improvised, -4, and the haste of four channels on a rare watch", async () => {
    const radio = gear("Small Radio (TL8)");
    const listener = character("Ear", [radio], { "Electronics Operation (EW)": 14 });
    targets = [character("Talker", [gear("Small Radio (TL8)", { eccm: true })])];
    on.add(SWITCHES.radios);
    on.add(SWITCHES.spreadSpectrum);
    answers = [{ task: "detect" }, { transmission: "rare", frequency: "channels", channels: 2, antenna: "dipole", yards: 100, range: 0, conditions: 0, avoiding: false }];
    await actions.get("ht-sigint").run(radio, listener);
    // -5 improvised, -4 hopping, and two channels searched twice each with a dipole: four shares, -8.
    expect(successes[0]).toMatchObject({ base: 14, skill: "Electronics Operation (EW)" });
    expect(values(successes[0])).toEqual([-5, -4, -8]);
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.RareWatch");
  });

  it("picks up a continuous signal with no roll where nothing penalizes it, and makes it a Quick Contest against an operator avoiding interception", async () => {
    const unit = gear("Large Radio (TL8)", { intercept: true });
    const listener = character("Ear", [unit], { "Electronics Operation (EW)": 14 });
    answers = [{ task: "detect" }, { transmission: "continuous", frequency: "known", channels: 1, antenna: "whip", yards: 100, range: 0, conditions: 0, avoiding: false }];
    await actions.get("ht-sigint").run(unit, listener);
    expect(successes).toEqual([]);
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.FoundAutomatically");
    targets = [character("Talker", [], { "Electronics Operation (EW)": 12 })];
    answers = [{ task: "detect" }, { transmission: "continuous", frequency: "scan", channels: 1, antenna: "whip", yards: 100, range: 0, conditions: 0, avoiding: true }];
    await actions.get("ht-sigint").run(unit, listener);
    expect(contests[0]).toMatchObject({ first: { base: 14 }, second: { base: 12 } });
    // A TL8 intercept unit scans in 5 seconds.
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.ScanSeconds");
  });

  it("finds transmitters with the handheld spectrum analyzer at -2, and identifies a frequency at +4", async () => {
    const analyzer = gear("Spectrum Analyzer (Digital)");
    const operator = character("Op", [analyzer], { "Electronics Operation (EW)": 12 });
    answers = [{ task: "detect" }, { transmission: "ongoing", frequency: "known", channels: 1, antenna: "whip", yards: 10, range: 0, conditions: 0, avoiding: false }];
    await actions.get("ht-sigint").run(analyzer, operator);
    expect(values(successes[0])).toEqual([-2]);
    answers = [{ task: "identify" }];
    await actions.get("ht-sigint").run(analyzer, operator);
    expect(values(successes[1])).toEqual([4]);
  });

  it("aims a dipole as an area at +4, improvised with haste against a brief signal, and scatters a miss", async () => {
    const radio = gear("Small Radio (TL8)", { dipoleAntenna: true });
    const operator = character("Op", [radio], { "Electronics Operation (EW)": 12 });
    successResult = { success: false, margin: -3 };
    answers = [{ task: "aim" }, { antenna: "dipole", found: false, yards: 500, seconds: 30, avoiding: false }];
    await actions.get("ht-sigint").run(radio, operator);
    expect(values(successes[0])).toEqual([4, -5, -5]);
    expect(successes[0].tags).toEqual(expect.arrayContaining(["sigint", "antennaAim", "area"]));
    expect(chat.at(-1)).toContain('"yards":3');
    // Found with a directional antenna, the aim is automatic.
    answers = [{ task: "aim" }, { antenna: "directional", found: true, yards: 500, seconds: 0, avoiding: false }];
    await actions.get("ht-sigint").run(radio, operator);
    expect(successes).toHaveLength(1);
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.AimAutomatic");
  });

  it("takes a bearing on a beacon, then Navigation at +1", async () => {
    const rdf = gear("Medium Radio (TL7)", { rdf: true }, { tl: "7" });
    const navigator = character("Nav", [rdf], { "Electronics Operation (Communications)": 12, "Navigation (Air)": 13 });
    answers = [{ task: "beacon" }, { navigation: "Navigation (Air)" }];
    await actions.get("ht-sigint").run(rdf, navigator);
    expect(successes[1]).toMatchObject({ base: 13, skill: "Navigation (Air)", modifiers: [{ value: 1 }] });
  });

  it("still posts its card when the system refuses a task below an effective 3 (#549)", async () => {
    // The system's refusal, as `returnRefusal` has it.
    successResult = { refused: true, reason: "below 3", base: 4, effective: 2, modifiers: [] };
    const radio = gear("Small Radio (TL8)", { dipoleAntenna: true });
    const listener = character("Ear", [radio], { "Electronics Operation (EW)": 7 });
    answers = [{ task: "detect" }, { transmission: "rare", frequency: "channels", channels: 2, antenna: "dipole", yards: 100, range: 0, conditions: 0, avoiding: false }];
    await actions.get("ht-sigint").run(radio, listener);
    expect(successes[0].returnRefusal).toBe(true);
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.RareWatch");
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.Refused");
    answers = [{ task: "aim" }, { antenna: "dipole", found: false, yards: 500, seconds: 30, avoiding: false }];
    await actions.get("ht-sigint").run(radio, listener);
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.Refused");
    const rdf = gear("Medium Radio (TL7)", { rdf: true }, { tl: "7" });
    const navigator = character("Nav", [rdf], { "Electronics Operation (Communications)": 2 });
    answers = [{ task: "beacon" }, { navigation: "Navigation (Air)" }];
    const before = successes.length;
    await actions.get("ht-sigint").run(rdf, navigator);
    // No bearing, so no Navigation roll after it.
    expect(successes).toHaveLength(before + 1);
    expect(chat.at(-1)).toContain("GCC.HT.Sigint.Refused");
  });
});

describe("cipherMachines alone (HT:EE p. 48)", () => {
  beforeEach(() => { on = new Set([SWITCHES.cipherMachines]); });

  it("sends enciphered text on a cipher machine at -4, offset by extra time", async () => {
    const machine = gear("Cipher Machine", {}, { tl: "6" });
    expect(actions.get("ht-cipher-send").visible(machine)).toBe(true);
    answers = [{ times: 8 }];
    await actions.get("ht-cipher-send").run(machine, character("Clerk", [machine], { "Electronics Operation (Communications)": 12 }));
    expect(successes[0]).toMatchObject({ base: 12, skill: "Electronics Operation (Communications)" });
    expect(values(successes[0])).toEqual([-4, 3]);
  });
});
