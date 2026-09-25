/**
 * The supplement's device conventions as the system meets them: the price
 * modifiers, `gworld.objectStats`, the item sheet section and the drop and
 * kit row actions -- with only High-Tech's switches on (decisions D1, E1).
 *
 * The records are shaped as the catalogue will write the supplement's
 * (#478-#480): the `device` data under this module's extension, the book
 * flag "high-tech", "neg." weight as 0.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { deviceData, dropDice, isDevice, readyDevices, takesDeviceStatistics } from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let prices: Map<string, any>;
let successes: any[];
let chat: string[];
let on: { cuttingEdge: boolean; breakable: boolean; kits: boolean };
let successResult: any;
let dialogAnswer: any;
let dice: number[];
let damaged: any[];

function fakeApi() {
  return {
    rules,
    data: {
      hooks: { objectStats: "gworld.objectStats" },
      registerPriceModifier: (m: any) => prices.set(m.key, m),
    },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    items: {
      // What the system gives, once the listeners have had their say.
      objectStats: (item: any) => fire("gworld.objectStats", { item, kind: "homogenous", dr: 4, hp: 16, ht: 12, notes: [] }),
      applyDamage: async (o: any) => { damaged.push(o); return {}; },
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? null,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    },
    roll: { success: async (o: any) => { successes.push(o); return successResult; } },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** A record as the catalogue writes it, carried by `actor`. */
function record(name: string, system: Record<string, any>, device: Record<string, any> = {}, book: string | null = "high-tech"): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: book ? { [MODULE_ID]: { book } } : {},
    system: { tl: "6", equipmentQuality: "basic", ...system, extensions: { [MODULE_ID]: { device } } },
    updates: [] as any[],
    update: async (patch: Record<string, unknown>) => {
      item.updates.push(patch);
      for (const [path, value] of Object.entries(patch)) {
        const keys = path.split(".");
        let at = item;
        for (const key of keys.slice(0, -1)) at = at[key] ??= {};
        at[keys.at(-1)!] = value;
      }
    },
  };
  return item;
}

function owner(items: any[] = [], more: Record<string, any> = {}): any {
  const actor = { name: "Hobbyist", items, attributes: { IQ: 11 }, skills: {}, system: { tl: 8 }, ...more };
  for (const item of items) item.actor = actor;
  return actor;
}

/** Big Louie's radio: 8 lbs., five tubes of 1 HP (HT:EE p. 8). */
const radio = () => record("Tube Radio", { cost: 200, weight: 8, tl: "6" }, { parts: { count: 5, label: "vacuum tubes", hp: 1, ht: 10, broken: 0 } });
/** A prototype with both years and a price (HT:EE pp. 8, 31). */
const telharmonium = () => record("Telharmonium", { cost: 2700, weight: 425, tl: "6" }, { complexity: "complex", prototypeYear: 1896, marketYear: 1935 });
/** A prototype with no market price. */
const photophone = () => record("Photophone", { cost: 0, weight: 0, tl: "6" }, { complexity: "average", prototypeYear: 1880 });
/** A fragile, negligible-weight device. */
const bulb = () => record("Tungsten Filament Bulb", { cost: 1, weight: 0, tl: "6" }, { fragile: true, prototypeYear: 1906, marketYear: 1911 });

const price = (key: string, item: any, cost = Number(item.system.cost)) => prices.get(key)!.apply(item, { cost, weight: Number(item.system.weight) });
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  prices = new Map();
  successes = [];
  chat = [];
  on = { cuttingEdge: false, breakable: false, kits: false };
  successResult = { success: true };
  dialogAnswer = null;
  dice = [];
  damaged = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  // Each roll takes the next of `dice` as its total.
  vi.stubGlobal("Roll", class {
    formula: string;
    total = 0;
    constructor(formula: string) { this.formula = formula; }
    async evaluate() { this.total = dice.shift() ?? 10; return this; }
  });
  readyDevices(fakeApi() as never, { cuttingEdge: () => on.cuttingEdge, breakable: () => on.breakable, kits: () => on.kits });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which gear the conventions reach", () => {
  it("is High-Tech's equipment and gear of no book, never another book's", () => {
    expect(isDevice(radio())).toBe(true);
    expect(isDevice(record("Home-made", {}, {}, null))).toBe(true);
    expect(isDevice(record("Ultra-Tech Gadget", {}, {}, "ultra-tech"))).toBe(false);
    expect(isDevice({ ...radio(), type: "armor" })).toBe(false);
  });

  it("gives the default figures to High-Tech's records that aren't weapons", () => {
    expect(takesDeviceStatistics(radio())).toBe(true);
    expect(takesDeviceStatistics(record("Stun Baton", { meleeModes: [{}] }))).toBe(false);
    expect(takesDeviceStatistics(record("Home-made", {}, {}, null))).toBe(false);
  });

  it("reads a record's device data with nothing missing", () => {
    expect(deviceData(record("Bare", {}))).toEqual({
      complexity: null, prototypeYear: null, marketYear: null, cuttingEdge: false, kit: false, fragile: false, combined: false,
      hp: null, ht: null, dr: null, parts: { count: 0, label: "", hp: 1, ht: 10, broken: 0 },
      soundQuality: null, carbonMicrophone: false, inexpensive: false, extraSpeakers: 0,
      earlyModel: false, diamondBlade: false, remoteControl: false, emergencyStop: false, magnet: { core: "", diameter: 0, length: 0 },
      military: false, panTiltZoom: false, doubleRadius: false,
    });
  });
});

describe("with every switch off", () => {
  it("changes nothing", async () => {
    const item = record("Cutting Radio", { cost: 100, weight: 2 }, { cuttingEdge: true, kit: true, parts: { count: 2 } });
    owner([item]);
    expect(price("ht-cutting-edge", item)).toBeNull();
    expect(price("ht-kit", item)).toBeNull();
    expect(fire("gworld.objectStats", { item, dr: 4, hp: 16, ht: 12, notes: [] })).toMatchObject({ dr: 4, hp: 16, ht: 12 });
    expect(sections.get("ht-device-item")!.visible(item)).toBe(false);
    expect(actions.get("ht-device-drop")!.visible(item)).toBe(false);
    expect(actions.get("ht-kit-build")!.visible(item)).toBe(false);
  });
});

describe("cutting-edge gear (HT:EE p. 8)", () => {
  beforeEach(() => { on.cuttingEdge = true; });

  it("prices a cutting-edge device x5 at basic and x20 at good, and leaves fine alone", () => {
    const basic = record("New Radio", { cost: 100 }, { cuttingEdge: true });
    expect(price("ht-cutting-edge", basic)).toMatchObject({ cost: 500, label: "GCC.HT.Devices.CuttingEdge" });
    // The system stores good at x5 of the list price; cutting edge makes it x20.
    const good = record("New Radio", { cost: 500, listCost: 100, equipmentQuality: "good" }, { cuttingEdge: true });
    expect(price("ht-cutting-edge", good)!.cost).toBe(2000);
    expect(price("ht-cutting-edge", record("New Radio", { cost: 2000, equipmentQuality: "fine" }, { cuttingEdge: true }))).toBeNull();
    expect(price("ht-cutting-edge", record("Old Radio", { cost: 100 }))).toBeNull();
    expect(price("ht-cutting-edge", record("UT", { cost: 100 }, { cuttingEdge: true }, "ultra-tech"))).toBeNull();
  });

  it("shows a prototype's years and what inventing it takes, easier at the carrier's later TL", () => {
    const item = telharmonium();
    owner([item]);
    const context = sections.get("ht-device-item")!.context(item);
    expect(context.cutting).toBe(true);
    expect(context.prototype[0]).toBe('GCC.HT.Devices.Dated {"prototype":1896,"market":1935}');
    // TL6 Complex, reinvented by a TL8 character: Simple.
    expect(context.prototype[1]).toContain("GCC.HT.Devices.Reinvented");
    expect(context.prototype[2]).toContain('"grade":"GCC.HT.Devices.Complexity.simple","skill":14,"concept":-6');
  });

  it("shows a priceless prototype's grade as the record gives it, with no carrier", () => {
    const context = sections.get("ht-device-item")!.context(photophone());
    expect(context.prototype).toEqual([
      'GCC.HT.Devices.PrototypeOnly {"prototype":1880}',
      'GCC.HT.Devices.Invention {"grade":"GCC.HT.Devices.Complexity.average","skill":15,"concept":-10,"time":"2d","unit":"GCC.HT.Devices.Unit.days","facilities":"100,000"}',
    ]);
  });

  it("says fine quality isn't sold new", () => {
    const context = sections.get("ht-device-item")!.context(record("New", { cost: 1, equipmentQuality: "fine" }, { cuttingEdge: true }));
    expect(context.cuttingEdgeLine).toBe("GCC.HT.Devices.FineUnavailable");
  });
});

describe("breakable parts and device statistics (HT:EE pp. 8-9)", () => {
  beforeEach(() => { on.breakable = true; });

  it("gives a device HP from its weight, HT 10 and DR 2, and a fragile one of negligible weight 1 HP and DR 0", () => {
    const stats = fire("gworld.objectStats", { item: radio(), dr: 4, hp: 16, ht: 12, notes: [] });
    expect(stats).toMatchObject({ kind: "unliving", hp: 8, ht: 10, dr: 2, notes: ["GCC.HT.Devices.StatisticsNote"] });
    expect(fire("gworld.objectStats", { item: bulb(), dr: 4, hp: 16, ht: 12, notes: [] })).toMatchObject({ hp: 1, ht: 10, dr: 0 });
    // A record's stated figure wins.
    expect(fire("gworld.objectStats", { item: record("Stated", { weight: 8 }, { dr: 5 }), dr: 4, hp: 16, ht: 12, notes: [] })).toMatchObject({ dr: 5 });
  });

  it("offers the drop only for a device with whole fragile parts", () => {
    expect(actions.get("ht-device-drop")!.visible(radio())).toBe(true);
    expect(actions.get("ht-device-drop")!.visible(bulb())).toBe(false);
    expect(actions.get("ht-device-drop")!.visible(record("All Broken", {}, { parts: { count: 2, broken: 2 } }))).toBe(false);
  });

  it("works out the collision from a fall, or from a throw's speed", () => {
    const api = fakeApi() as never;
    expect(dropDice(api, 8, { yards: 1, speed: 0, surface: "hard" })).toEqual({ dice: 1, modifier: -1 });
    expect(dropDice(api, 8, { yards: 0, speed: 20, surface: "hard" })).toEqual({ dice: 3, modifier: 0 });
  });

  it("plays the book's example: three of five tubes break, and DR 2 spares the radio", async () => {
    const item = radio();
    const actor = owner([item]);
    dialogAnswer = { yards: 1, speed: 0, surface: "hard" };
    // Damage 2; the tubes' HT rolls.
    dice = [2, 11, 9, 12, 13, 10];
    actions.get("ht-device-drop")!.run(item, actor);
    await flush();
    expect(deviceData(item).parts.broken).toBe(3);
    expect(chat[0]).toContain('"dice":"1d6-1","damage":2');
    expect(chat[0]).toContain("GCC.HT.Devices.Drop.Parts.breaking");
    expect(chat[0]).toContain("GCC.HT.Devices.Drop.Unhurt");
    // The item sheet says so until the tubes are replaced.
    expect(sections.get("ht-device-item")!.context(item).broken).toContain('"broken":3');
  });

  it("marks the device's own injury past its DR", async () => {
    const item = radio();
    const actor = owner([item]);
    dialogAnswer = { yards: 0, speed: 30, surface: "hard" };
    dice = [7];
    actions.get("ht-device-drop")!.run(item, actor);
    await flush();
    // 7 points: every 1-HP tube past -5xHP, and 5 through the radio's DR 2.
    expect(deviceData(item).parts.broken).toBe(5);
    expect(chat[0]).toContain('GCC.HT.Devices.Drop.Injured {"injury":5,"dr":2');
    expect(damaged).toEqual([]);
  });

  it("puts the device's injury on an item that keeps hit points, through the system (#549)", async () => {
    const item = radio();
    item.system.hpLost = 0;
    const actor = owner([item]);
    dialogAnswer = { yards: 0, speed: 30, surface: "hard" };
    dice = [7];
    actions.get("ht-device-drop")!.run(item, actor);
    await flush();
    expect(chat[0]).toContain('GCC.HT.Devices.Drop.Recorded {"injury":5,"dr":2}');
    // The whole blow as crushing: the system takes its DR off and rolls its HT.
    expect(damaged).toEqual([{ item, damage: 7, type: "cr", label: 'GCC.HT.Devices.Drop.DamageLabel {"name":"Tube Radio"}' }]);
  });

  it("puts nothing on the item when its DR stops the blow", async () => {
    const item = radio();
    item.system.hpLost = 0;
    const actor = owner([item]);
    dialogAnswer = { yards: 1, speed: 0, surface: "hard" };
    dice = [2, 11, 9, 12, 13, 10];
    actions.get("ht-device-drop")!.run(item, actor);
    await flush();
    expect(chat[0]).toContain("GCC.HT.Devices.Drop.Unhurt");
    expect(damaged).toEqual([]);
  });
});

describe("kits (HT:EE p. 15)", () => {
  beforeEach(() => { on.kits = true; });

  it("prices a kit at a quarter of the price, after cutting edge", () => {
    on.cuttingEdge = true;
    const item = record("Kit Oscilloscope", { cost: 400 }, { kit: true, cuttingEdge: true });
    const edge = price("ht-cutting-edge", item)!;
    expect(price("ht-kit", item, edge.cost)).toMatchObject({ cost: 500, label: "GCC.HT.Devices.KitPrice" });
    expect(price("ht-kit", record("Oscilloscope", { cost: 400 }))).toBeNull();
  });

  it("builds with the better Hobby Skill, with Time Spent, and the device is no longer a kit", async () => {
    const item = record("Kit Oscilloscope", { cost: 400 }, { kit: true });
    const actor = owner([item, { type: "skill", name: "Hobby Skill (Amateur Radio)" }], { skills: { "Hobby Skill (Amateur Radio)": 13 } });
    expect(sections.get("ht-device-item")!.context(item).kitLine).toBe('GCC.HT.Devices.KitLine {"price":100,"time":"GCC.HT.Devices.CopyTime {\\"dice\\":\\"2d\\",\\"unit\\":\\"GCC.HT.Devices.Unit.days\\"}"}');
    dialogAnswer = { with: "Hobby Skill (Amateur Radio)", time: 2 };
    expect(actions.get("ht-kit-build")!.visible(item)).toBe(true);
    actions.get("ht-kit-build")!.run(item, actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 13, kind: "skill", skill: "Hobby Skill (Amateur Radio)", modifiers: [{ value: 1 }] });
    expect(deviceData(item).kit).toBe(false);
    expect(chat[0]).toContain("GCC.HT.Devices.Kit.Built");
  });

  it("offers the supplement's own Hobby Skill record, Feats of Science (#481)", async () => {
    const pack = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../books/high-tech/packs-src/skills/high-tech-ee-skills.json"), "utf8")) as any[];
    const feats = pack.find((r) => r.name === "Hobby Skill (Feats of Science)");
    expect(feats).toBeDefined();
    const item = record("Kit Oscilloscope", { cost: 400 }, { kit: true });
    const actor = owner([item, { type: "skill", name: feats.name, system: feats.system }], { skills: { [feats.name]: 14 } });
    dialogAnswer = { with: feats.name, time: 1 };
    actions.get("ht-kit-build")!.run(item, actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 14, kind: "skill", skill: "Hobby Skill (Feats of Science)" });
  });

  it("builds with IQ as a One-Task Wonder, and a failure leaves the kit", async () => {
    const item = record("Kit Radio", { cost: 60 }, { kit: true });
    const actor = owner([item]);
    dialogAnswer = { with: "", time: 1 };
    successResult = { success: false };
    actions.get("ht-kit-build")!.run(item, actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 11, kind: "attribute", skill: "IQ", modifiers: [], tags: ["kitBuilding", "IQ"] });
    expect(deviceData(item).kit).toBe(true);
    expect(chat[0]).toContain("GCC.HT.Devices.Kit.NotBuilt");
  });
});
