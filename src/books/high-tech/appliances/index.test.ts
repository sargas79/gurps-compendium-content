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
let damages: any[];
let chat: string[];
let crippled: any[];
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
      hooks: { successRollModifiers: "gworld.successRollModifiers", afterDamage: "gworld.afterDamage" },
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
      cripple: async (actor: any, location: string, options: any) => { crippled.push([actor.name, location, options]); return { id: "c1", location }; },
    },
    items: { equipmentFailure: async (o: any) => { failures.push(o); return { outcome: "success" }; } },
    roll: { success: async (o: any) => { successes.push(o); return { success: true }; }, damage: async (o: any) => { damages.push(o); return {}; } },
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
  damages = [];
  chat = [];
  crippled = [];
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
    expect(context(record("Power Drill")).early).toEqual({ checked: false, hint: "GCC.HT.Appliances.EarlyHint" });
    expect(context(record("Circular Saw")).diamond).toEqual({ checked: false });
    expect(context(record("Arc Welder")).diamond).toBeNull();
  });

  it("cuts with wire cutters, 2d(2) each use (HT:EE p. 14)", () => {
    expect(mode(record("Wire Cutters", { weight: 0 }))).toMatchObject({ damage: "2d", damageType: "cut", armorDivisor: 2, notes: [{ label: "GCC.HT.Tools.PerUse" }] });
  });
});

describe("a circular saw's amputation (HT:EE p. 51, note [5])", () => {
  const blow = (item: any, location: string, crippledPart = true, mode: any = { index: 0, ranged: false }) =>
    fire("gworld.afterDamage", { actor: Object.assign(person([]), { name: "Victim", isOwner: true }), item, mode, result: { crippled: crippledPart, hitLocation: location } });

  it("takes off an arm or leg a saw's blow cripples, for good", async () => {
    on.powerTools = true;
    const saw = record("Circular Saw", { reference: "High-Tech: Electricity and Electronics p. 24" });
    blow(saw, "arm");
    await flush();
    expect(crippled).toEqual([["Victim", "arm", { duration: "permanent", label: expect.stringContaining("AmputatedLabel") }]]);
    expect(chat.at(-1)).toContain("Amputated");
    blow(record("Compact Circular Saw"), "leg");
    await flush();
    expect(crippled[1]).toMatchObject(["Victim", "leg", { duration: "permanent" }]);
  });

  it("leaves a hand or foot, an uncrippled limb, other tools and the switch off alone", async () => {
    on.powerTools = true;
    const saw = record("Circular Saw");
    blow(saw, "hand");
    blow(saw, "arm", false);
    blow(record("Power Drill"), "arm");
    on.powerTools = false;
    blow(saw, "arm");
    await flush();
    expect(crippled).toEqual([]);
  });
});

describe("appliance hazards (HT:EE p. 21)", () => {
  beforeEach(() => { on.appliances = true; });

  it("burns 3d at a touch of the induction furnace's molten metal", async () => {
    const furnace = record("Handheld Induction Furnace");
    const smith = person([furnace]);
    expect(actions.get("ee-appliance-hazard").visible(furnace)).toBe(true);
    expect(sections.get("ee-appliances-item").context(furnace).lines).toContain('GCC.HT.Appliances.HazardLine {"damage":"3d"}');
    actions.get("ee-appliance-hazard").run(furnace, smith);
    await flush();
    expect(damages[0]).toMatchObject({ actor: smith, item: furnace, formula: "3d", damageType: "burn", label: 'GCC.HT.Appliances.HazardLabel {"name":"Handheld Induction Furnace"}' });
  });

  it("burns 1d-3 a second only from an early resistance wire heater", async () => {
    const heater = record("Resistance Wire Heater");
    expect(actions.get("ee-appliance-hazard").visible(heater)).toBe(false);
    expect(sections.get("ee-appliances-item").context(heater).early).toEqual({ checked: false, hint: "GCC.HT.Appliances.EarlyHeaterHint" });
    const early = record("Resistance Wire Heater", {}, { device: { earlyModel: true } });
    expect(actions.get("ee-appliance-hazard").visible(early)).toBe(true);
    actions.get("ee-appliance-hazard").run(early, person([early]));
    await flush();
    expect(damages[0]).toMatchObject({ formula: "1d-3", label: 'GCC.HT.Appliances.HazardPerSecond {"name":"Resistance Wire Heater"}' });
    on.appliances = false;
    expect(actions.get("ee-appliance-hazard").visible(early)).toBe(false);
  });
});

describe("printing and scanning (HT:EE pp. 23-24, 33)", () => {
  it("makes a part on the better of Machinist and Artist (Sculpting), -2 until familiar", async () => {
    const printer = record("3D Printer", { tl: "8" });
    const maker = person([printer], { skills: { Machinist: 11, "Artist (Sculpting)": 13 } });
    expect(actions.get("ee-3d-print").visible(printer)).toBe(false);
    on.appliances = true;
    expect(actions.get("ee-3d-print").visible(printer)).toBe(true);
    await actions.get("ee-3d-print").run(printer, maker);
    await flush();
    expect(successes[0]).toMatchObject({ base: 13, skill: "Artist (Sculpting)", modifiers: [] });
    familiar = false;
    await actions.get("ee-3d-print").run(printer, person([printer]));
    await flush();
    // Machinist's IQ-5 beats Artist's IQ-6.
    expect(successes[1]).toMatchObject({ base: 7, skill: "Machinist", modifiers: [{ value: -2 }] });
  });

  it("prints a picture on Artist with the printer's resolution, and scans art at -2", async () => {
    on.appliances = true;
    const dot = record("Dot Matrix Printer", { tl: "7" });
    const laser = record("Laser Printer", { tl: "8" });
    const artist = person([dot, laser], { items: [dot, laser, { type: "skill", name: "Artist (Illustration)" }], skills: { "Artist (Illustration)": 14 } });
    await actions.get("ee-print-picture").run(dot, artist);
    await actions.get("ee-print-picture").run(laser, artist);
    await flush();
    expect(successes.map((s) => [s.base, s.skill, s.modifiers.map((m: any) => m.value)])).toEqual([[14, "Artist (Illustration)", [-5]], [14, "Artist (Illustration)", [1]]]);
    expect(actions.get("ee-print-picture").visible(record("Printer"))).toBe(false);
    const scanner = record("Flatbed Scanner", { tl: "8" });
    await actions.get("ee-scan-picture").run(scanner, person([scanner]));
    await flush();
    expect(successes[2]).toMatchObject({ base: 7, skill: "Electronics Operation (Media)", modifiers: [{ value: -2 }] });
  });
});
