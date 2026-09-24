/**
 * The supplement's appliances and power tools as the system meets them
 * (HT:EE pp. 14, 20-25): the climate engine's roll lines, the skill lines,
 * the Forensics lines, the price modifier, the item sheet, the row actions,
 * the GM tool and the derived work rows -- with only High-Tech's switches on
 * (decisions D1, E1).
 *
 * The records are shaped as the catalogue writes the supplement's (#478):
 * named as printed, "(TLn)" where a name repeats at several TLs, the book
 * flag "high-tech", their power under `power` and the GM's figures under
 * `device`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { CLIMATE_TABLES, readyClimate, resetClimate } from "../../../shared/climate/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { VACUUMED_FLAG, applianceClimateGear, readyAppliances } from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let prices: Map<string, any>;
let derived: Map<string, any>;
let tools: Map<string, any>;
let successes: any[];
let failures: any[];
let chat: string[];
let on: { appliances: boolean; powerTools: boolean };
let familiar: boolean | null;
let dialogAnswer: any;
let selected: any;
let scene: any;
let isGM: boolean;

function fakeApi() {
  return {
    rules,
    data: {
      hooks: { skillBonuses: "gworld.skillBonuses" },
      registerPriceModifier: (m: any) => prices.set(m.key, m),
    },
    combat: {
      hooks: { successRollModifiers: "gworld.successRollModifiers" },
      registerDerivedAttackMode: (m: any) => derived.set(m.key, m),
    },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      isFamiliar: () => familiar,
    },
    items: { equipmentFailure: async (o: any) => { failures.push(o); return { outcome: "success" }; } },
    roll: { success: async (o: any) => { successes.push(o); return { success: true }; } },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** A record as the catalogue writes it. */
function record(name: string, system: Record<string, any> = {}, extensions: Record<string, any> = {}, book: string | null = "high-tech"): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: book ? { [MODULE_ID]: { book } } : {},
    system: { tl: "6", equipmentQuality: "basic", cost: 100, weight: 5, carried: true, equipped: true, ...system, extensions: { [MODULE_ID]: { power: { raw: "Household power" }, ...extensions } } },
  };
  return item;
}

function person(items: any[] = [], more: Record<string, any> = {}): any {
  const actor: any = { name: "Worker", items, attributes: { DX: 11, IQ: 12, HT: 10 }, skills: {}, ...more };
  for (const item of items) item.actor = actor;
  return actor;
}

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const price = (key: string, item: any) => prices.get(key)!.apply(item, { cost: Number(item.system.cost), weight: Number(item.system.weight) });
const helpers = { damage: (base: string, modifier: number) => `${base === "sw" ? "1d+2" : "1d-1"}${modifier ? `+${modifier}` : ""}`, attribute: () => 11, skillLevel: (name: string) => (name === "Forced Entry" ? 13 : null) };

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  prices = new Map();
  derived = new Map();
  tools = new Map();
  successes = [];
  failures = [];
  chat = [];
  on = { appliances: false, powerTools: false };
  familiar = true;
  dialogAnswer = null;
  selected = null;
  isGM = true;
  const flags: Record<string, unknown> = {};
  scene = {
    name: "Warehouse",
    getFlag: (_s: string, key: string) => flags[key],
    setFlag: async (_s: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_s: string, key: string) => { delete flags[key]; },
  };
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    get user() { return { isGM, targets: new Set() }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("canvas", { get scene() { return scene; }, get tokens() { return { controlled: selected ? [{ actor: selected }] : [] }; } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  readyAppliances(fakeApi() as never, { appliances: () => on.appliances, powerTools: () => on.powerTools });
});

afterEach(() => {
  vi.unstubAllGlobals();
  CLIMATE_TABLES.clear();
  resetClimate();
  setRuleReader(() => false);
});

describe("with both switches off", () => {
  it("changes nothing", () => {
    const microwave = record("Microwave Oven");
    const cook = person([microwave]);
    const lines = fire("gworld.skillBonuses", { actor: cook, name: "Cooking", lines: [] }).lines;
    expect(lines).toEqual([]);
    expect(sections.get("ee-appliances-item").visible(microwave)).toBe(false);
    expect(derived.get("ee-power-tool-work").applies(record("Power Drill"))).toBe(false);
    expect(price("ee-remote-control", record("Robovac", {}, { device: { remoteControl: true } }))).toBeNull();
    expect(actions.get("ee-emergency-stop").visible(record("Circular Saw", {}, { device: { emergencyStop: true } }))).toBe(false);
    expect(tools.get("ee-shredded").visible()).toBe(false);
  });
});

describe("heaters and fans (HT:EE pp. 21, 23)", () => {
  beforeEach(() => {
    CLIMATE_TABLES.register({ book: "high-tech", tls: { min: 5, max: 8 }, rule: "gcc.climateControl", gear: applianceClimateGear("gcc.electricAppliances") });
    readyClimate();
  });

  it("add to HT against the weather while in use, under the appliances switch alone", () => {
    const roll = (actor: any, side: string) => fire("gworld.successRollModifiers", { actor, tags: ["exposure", side, "HT"], modifiers: [] }).modifiers;
    const actor = person([record("Resistance Wire Heater"), record("Incandescent Bulb Heater"), record("Small Fan (TL6)")]);
    setRuleReader(() => false);
    expect(roll(actor, "cold")).toEqual([]);
    setRuleReader((key) => key === "gcc.electricAppliances");
    expect(roll(actor, "cold")).toEqual([{ label: "Resistance Wire Heater", value: 2 }]);
    expect(roll(actor, "heat")).toEqual([{ label: "Small Fan (TL6)", value: 1 }]);
    // Switched off, it helps no one.
    expect(roll(person([record("Large Fan", { equipped: false })]), "heat")).toEqual([]);
    // High-Tech's climate switch alone doesn't reach them.
    setRuleReader((key) => key === "gcc.climateControl");
    expect(roll(actor, "cold")).toEqual([]);
  });
});

describe("kitchen gear (HT:EE p. 21)", () => {
  beforeEach(() => { on.appliances = true; });
  const cooking = (actor: any, name = "Cooking", lines: any[] = []) => fire("gworld.skillBonuses", { actor, name, lines }).lines;

  it("puts the appliance in use on Cooking and Housekeeping", () => {
    expect(cooking(person([record("Microwave Oven", { tl: "7" })]))).toEqual([expect.objectContaining({ key: "tools", value: -2 })]);
    expect(cooking(person([record("Microwave Oven", { tl: "7" })]), "Housekeeping")).toEqual([expect.objectContaining({ key: "tools", value: -1 })]);
    // The system's own equipment line is replaced, and says why.
    const line = cooking(person([record("Hot Plate")]), "Cooking", [{ key: "tools", label: "Kit", value: 1, source: "system" }])[0];
    expect(line).toMatchObject({ key: "tools", value: -2, reason: expect.stringContaining("Hot Plate") });
    // Not in use, or not kitchen gear: nothing.
    expect(cooking(person([record("Microwave Oven", { equipped: false })]))).toEqual([]);
    expect(cooking(person([record("Microwave Oven")]), "Carousing")).toEqual([]);
  });

  it("takes the unfamiliar penalty off the induction cooker once the cook knows it, and the best appliance counts", () => {
    familiar = false;
    expect(cooking(person([record("Induction Cooker", { tl: "8" })]))[0].value).toBe(-1);
    familiar = true;
    expect(cooking(person([record("Induction Cooker", { tl: "8" })]))[0].value).toBe(1);
    expect(cooking(person([record("Microwave Oven"), record("Induction Cooker")]))[0].value).toBe(1);
  });
});

describe("shredders and vacuums against Forensics (HT:EE p. 23)", () => {
  beforeEach(() => { on.appliances = true; });

  it("rolls Forensics to reconstruct shredded documents, -5 after a cross-cut shredder", async () => {
    selected = person([], { skills: { Forensics: 13 } });
    dialogAnswer = { shredding: "crosscut" };
    tools.get("ee-shredded").open();
    await flush();
    expect(successes[0]).toMatchObject({ actor: selected, base: 13, skill: "Forensics", modifiers: [{ value: -5 }] });
    dialogAnswer = { shredding: "strips" };
    selected = person();
    tools.get("ee-shredded").open();
    await flush();
    // Forensics at IQ-6 unlearned; strips are no harder.
    expect(successes[1]).toMatchObject({ base: 6, modifiers: [] });
  });

  it("marks the scene a shopvac cleaned, -2 to Forensics there after, and clears it again", async () => {
    const shopvac = record("Shopvac");
    const janitor = person([shopvac]);
    const forensics = () => fire("gworld.successRollModifiers", { actor: person(), skill: "Forensics", tags: ["IQ"], modifiers: [] }).modifiers;
    expect(actions.get("ee-clean-scene").visible(shopvac)).toBe(true);
    expect(actions.get("ee-clean-scene").visible(record("Vacuum Cleaner"))).toBe(false);
    expect(forensics()).toEqual([]);
    actions.get("ee-clean-scene").run(shopvac, janitor);
    await flush();
    expect(scene.getFlag(MODULE_ID, VACUUMED_FLAG)).toEqual({ by: "Shopvac" });
    expect(forensics()).toEqual([{ label: expect.stringContaining("Shopvac"), value: -2 }]);
    actions.get("ee-clean-scene").run(shopvac, janitor);
    await flush();
    expect(forensics()).toEqual([]);
    // A player can't mark the scene: the card asks the GM.
    isGM = false;
    actions.get("ee-clean-scene").run(shopvac, janitor);
    await flush();
    expect(scene.getFlag(MODULE_ID, VACUUMED_FLAG)).toBeUndefined();
    expect(chat.at(-1)).toContain("CleanAsk");
  });
});

describe("electromagnets, remote control and the emergency stop (HT:EE pp. 22-25)", () => {
  beforeEach(() => { on.appliances = true; });
  const context = (item: any) => sections.get("ee-appliances-item").context(item);

  it("shows the portable electromagnet's ST 8 and what it holds, and a magnet the GM builds", () => {
    const magnet = record("Portable Electromagnet", { tl: "5" }, { power: { draw: { cell: "M", cells: 1 } } });
    expect(sections.get("ee-appliances-item").visible(magnet)).toBe(true);
    expect(context(magnet).lines).toContainEqual(expect.stringContaining('"st":8'));
    expect(context(magnet).magnet).toMatchObject({ diameter: 1, length: 1 });
    const big = record("Electromagnet", {}, { device: { magnet: { core: "iron", diameter: 5, length: 6 } } });
    expect(context(big).lines).toContainEqual(expect.stringContaining('"st":40,"bl":320,"load":"3,200","reach":6'));
  });

  it("prices remote control at 10% more, and offers the checkboxes on electrical gear alone", () => {
    expect(price("ee-remote-control", record("Robovac", { cost: 280 }, { device: { remoteControl: true } }))).toMatchObject({ cost: 308 });
    expect(price("ee-remote-control", record("Robovac", { cost: 280 }))).toBeNull();
    expect(context(record("Shredder")).remote).toEqual({ checked: false });
    expect(context(record("Screwdrivers", {}, { power: {} })).remote).toBeNull();
  });

  it("shuts a machine with an emergency stop down with an equipment failure roll", async () => {
    const saw = record("Circular Saw", {}, { device: { emergencyStop: true } });
    const worker = person([saw]);
    expect(actions.get("ee-emergency-stop").visible(record("Circular Saw"))).toBe(false);
    expect(actions.get("ee-emergency-stop").visible(saw)).toBe(true);
    actions.get("ee-emergency-stop").run(saw, worker);
    await flush();
    expect(failures).toEqual([{ actor: worker, item: saw, label: expect.stringContaining("Circular Saw") }]);
    expect(context(saw).lines).toContainEqual(expect.stringContaining('"per":"+10"'));
  });
});

describe("power tools (HT:EE pp. 14, 21, 24)", () => {
  beforeEach(() => { on.powerTools = true; });
  const mode = (item: any) => derived.get("ee-power-tool-work").mode(item, person([item]), helpers);

  it("gives the supplement's power drill a work row with Forced Entry, -2 for an early model", () => {
    const drill = record("Power Drill");
    expect(derived.get("ee-power-tool-work").applies(drill)).toBe(true);
    expect(mode(drill)).toMatchObject({ skillName: "Forced Entry", skillLevel: 13, damage: "1d+2", damageType: "pi++", armorDivisor: 2, reach: "C", damageRollable: true });
    expect(mode(record("Power Drill", {}, { device: { earlyModel: true } })).skillLevel).toBe(11);
  });

  it("swings a circular saw, (5) with a diamond blade, and burns with the welder, hot plate and soldering iron", () => {
    expect(mode(record("Circular Saw"))).toMatchObject({ damage: "1d+2+3", damageType: "cut", armorDivisor: 2 });
    expect(mode(record("Compact Circular Saw", { tl: "7" }, { device: { diamondBlade: true } }))).toMatchObject({ armorDivisor: 5 });
    expect(mode(record("Arc Welder"))).toMatchObject({ damage: "3d", damageType: "burn", armorDivisor: 2 });
    expect(mode(record("Hot Plate"))).toMatchObject({ damage: "1d-3", damageType: "burn", armorDivisor: 1 });
    expect(mode(record("Soldering Iron (TL7)", { tl: "7" }))).toMatchObject({ damage: "1", damageType: "burn" });
  });

  it("leaves a record with forced-entry work of its own, and gear of another book, alone", () => {
    const highTechDrill = record("Power Drill", {}, { tool: { work: { damage: "1d+2", type: "pi++", divisor: 2 } } });
    expect(derived.get("ee-power-tool-work").applies(highTechDrill)).toBe(false);
    expect(derived.get("ee-power-tool-work").applies(record("Power Drill", {}, {}, "ultra-tech"))).toBe(false);
    // Made by hand, it's a power drill.
    expect(derived.get("ee-power-tool-work").applies(record("Power Drill", {}, {}, null))).toBe(true);
  });

  it("offers the early model and the diamond blade on the item sheet", () => {
    const context = (item: any) => sections.get("ee-appliances-item").context(item);
    expect(context(record("Power Drill")).early).toEqual({ checked: false });
    expect(context(record("Circular Saw")).diamond).toEqual({ checked: false });
    expect(context(record("Arc Welder")).diamond).toBeNull();
  });
});
