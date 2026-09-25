/**
 * The Electricity and Electronics supplement's computers as the system meets
 * them (HT:EE pp. 36-41), with Foundry's globals stubbed.
 *
 * The supplement's records aren't captured yet (#480), so these run on
 * records shaped as the catalogue will write them: the name as printed, the
 * TL, the price and the weight, High-Tech's book flag (E1 in #471), and
 * nothing of this module's own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { COMPUTER_TABLES, computerOf, readyComputers, syncComplexity } from "../../../shared/computers/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ultraTechComputers } from "../../ultra-tech/computers/index.js";
import { highTechComputers, readyInformation } from "../information/index.js";
import { complexityOf, computerBehind, readyComputing } from "./index.js";

const key = (k: string) => `${MODULE_ID}.${k}`;
let on = new Set<string>();
let hooks: Map<string, Array<(context: any) => unknown>>;
let outcome: any;
let registered: Record<string, any[]>;
let calls: unknown[][];
/** The engine's price modifiers, which it registers once whatever the test. */
const prices: any[] = [];

const api = (): any => ({
  rules,
  registry: { isRuleOn: (k: string) => on.has(k) },
  combat: { hooks: { successRollModifiers: "gworld.successRollModifiers", afterSuccessRoll: "gworld.afterSuccessRoll" } },
  data: {
    hooks: { skillBonuses: "gworld.skillBonuses" },
    registerPriceModifier: (m: any) => prices.push(m),
  },
  sheets: {
    registerSheetSection: (s: any) => (registered.section ??= []).push(s),
    registerRowAction: (a: any) => (registered.action ??= []).push(a),
  },
  roll: { success: async (o: any) => { calls.push(["roll", o]); return outcome; } },
  actors: {
    skillLevel: (_a: any, skill: string) => (skill === "Computer Operation" ? 13 : skill === "Engineer (Electronics)" ? 12 : null),
    attribute: (_a: any, attr: string) => (attr === "IQ" ? 12 : 11),
    isFamiliar: (actor: any, name: string) => (Array.isArray(actor?.system?.familiarities) ? actor.system.familiarities.includes(name) : null),
    setFamiliar: async (...args: unknown[]) => calls.push(["setFamiliar", ...args]),
    spendFatigue: async (...args: unknown[]) => calls.push(["spendFatigue", ...args]),
    applyInjury: async (...args: unknown[]) => calls.push(["applyInjury", ...args]),
  },
});

/** A record as the catalogue will write it: the name as printed, TL, price and weight, and High-Tech's book flag. */
function record(name: string, system: Record<string, unknown>, computer: Record<string, unknown> = {}, setup: Record<string, unknown> = {}): any {
  const item: any = {
    id: name.replace(/\W/g, ""),
    name,
    type: "equipment",
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { carried: true, ...system, extensions: { [MODULE_ID]: { computer, htComputer: setup } } },
    update: vi.fn(async (patch: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(patch)) {
        const parts = path.split(".");
        let at: any = item;
        for (const part of parts.slice(0, -1)) at = at[part] ??= {};
        at[parts.at(-1)!] = value;
      }
    }),
  };
  return item;
}

/** The supplement's records, shaped as #480 will capture them (HT:EE pp. 37, 40). */
const WORKSTATION = () => record("Workstation", { tl: "7", cost: 10_000, weight: 40, reference: "HT:EE p. 37" });
const MINICOMPUTER = () => record("Minicomputer", { tl: "7", cost: 100_000, weight: 400, reference: "HT:EE p. 37" });
const LIGHT_PEN = () => record("Light Pen", { tl: "7", cost: 35, weight: 0, reference: "HT:EE p. 40" });
const STYLUS = () => record("Stylus", { tl: "8", cost: 6, weight: 0, reference: "HT:EE p. 40" });

class Items extends Array<any> {
  get(id: string) { return this.find((i) => i.id === id); }
}

function character(items: any[], familiarities: string[] | undefined = [], traits: string[] = []): any {
  const flags: Record<string, Record<string, unknown>> = {};
  const actor: any = {
    name: "Ada",
    system: familiarities ? { familiarities } : {},
    items: new Items(...items, ...traits.map((name) => ({ id: name, name, type: "trait", system: {} }))),
    getFlag: (scope: string, k: string) => flags[scope]?.[k],
    setFlag: vi.fn(async (scope: string, k: string, value: unknown) => { (flags[scope] ??= {})[k] = value; }),
    unsetFlag: vi.fn(async (scope: string, k: string) => { delete flags[scope]?.[k]; }),
  };
  for (const item of items) item.actor = actor;
  return actor;
}

function fire(name: string, context: any): any {
  for (const fn of hooks.get(name) ?? []) fn(context);
  return context;
}

const action = (k: string) => registered.action!.find((a) => a.key === k);

beforeEach(() => {
  on = new Set();
  hooks = new Map();
  registered = {};
  calls = [];
  outcome = { success: true };
  COMPUTER_TABLES.register(ultraTechComputers(key("computers")));
  COMPUTER_TABLES.register(highTechComputers(key("computerSystems"), key("computerEras")));
  setRuleReader((k) => on.has(k));
  vi.stubGlobal("Hooks", { on: (name: string, fn: (context: any) => unknown) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, d: Record<string, unknown>) => `${k} ${JSON.stringify(d)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => "design" } } } });
  vi.stubGlobal("ChatMessage", { implementation: { create: async (m: any) => calls.push(["chat", m.content]), getSpeaker: () => ({}) } });
  vi.stubGlobal("ui", { notifications: { warn: (m: string) => calls.push(["warn", m]), info: () => {} } });
  const a = api();
  readyInformation(a, { computers: () => on.has(key("computerSystems")), books: () => false });
  readyComputing(a, { eras: () => on.has(key("computerEras")), interfaces: () => on.has(key("computerInterfaces")), languages: () => on.has(key("programmingLanguages")) });
});

afterEach(() => {
  COMPUTER_TABLES.clear();
  setRuleReader(() => false);
  vi.unstubAllGlobals();
});

describe("computerEras (HT:EE pp. 36-37)", () => {
  it("reads the supplement's size categories only while its switch is on, and needs no other", () => {
    on = new Set([key("computerSystems")]);
    expect(computerOf(WORKSTATION())).toBeNull();
    on = new Set([key("computerEras")]);
    const found = computerOf(WORKSTATION());
    expect(found?.table.i18n).toBe("GCC.HT.Eras");
    expect(found?.computer).toMatchObject({ complexity: 4, problems: ["needsEarly"] });
  });

  it("reprices a record by its options, through the engine's price modifier", () => {
    on = new Set([key("computerEras")]);
    readyComputers(api());
    const price = prices.find((m) => m.key === "computer");
    // The book's IBM PC, from the Workstation record: $1,000 and 20 lbs.
    const pc = record("Workstation", { tl: "8", cost: 10_000, weight: 40 }, { options: { compact: true, slow: true, earlyVlsi: true } });
    expect(price.apply(pc, { cost: 10_000, weight: 40 })).toMatchObject({ cost: 1_000, weight: 20 });
    expect(complexityOf(pc)).toBe(2);
    const mini = record("Minicomputer", { tl: "7", cost: 100_000, weight: 400 }, { options: { transistor: true } });
    expect(price.apply(mini, { cost: 100_000, weight: 400 })).toMatchObject({ cost: 100_000, weight: 200 });
    expect(complexityOf(mini)).toBe(1);
  });

  it("writes a computer's Complexity to the system's own field, and leaves anything else alone", async () => {
    on = new Set([key("computerEras")]);
    const pc = record("Workstation", { tl: "8", cost: 10_000, weight: 40, complexity: 0 }, { options: { compact: true, slow: true, earlyVlsi: true } });
    pc.isOwner = true;
    expect(await syncComplexity(pc)).toBe(true);
    expect(pc.system.complexity).toBe(2);
    expect(await syncComplexity(pc)).toBe(false);
    // Not one of a switched-on book's computers: untouched.
    on = new Set();
    pc.system.extensions[MODULE_ID].computer.options = {};
    expect(await syncComplexity(pc)).toBe(false);
    expect(pc.system.complexity).toBe(2);
    const pen = LIGHT_PEN();
    pen.isOwner = true;
    on = new Set([key("computerEras")]);
    expect(await syncComplexity(pen)).toBe(false);
  });

  it("gives High-Tech's own records the supplement's figures, and leaves them High-Tech's with the switch off", () => {
    const mainframe = () => record("Mainframe Computer", { tl: "6", cost: 1_000_000 }, { options: { transistor: true } });
    on = new Set([key("computerSystems")]);
    expect(computerOf(mainframe())?.computer.complexity).toBe(2);
    on = new Set([key("computerSystems"), key("computerEras")]);
    expect(computerOf(mainframe())?.computer.complexity).toBe(1);
  });

  it("leaves Ultra-Tech's computers alone", () => {
    const ut = () => ({ ...record("Personal Computer", { tl: "10" }), flags: { [MODULE_ID]: { book: "ultra-tech" } } });
    on = new Set([key("computers")]);
    const before = computerOf(ut())?.computer;
    on = new Set([key("computers"), key("computerEras")]);
    expect(computerOf(ut())?.computer).toEqual(before);
    expect(computerOf(ut())?.table.i18n).toBe("GCC.UT");
  });

  it("rolls HT daily for a vacuum-tube computer, and a failure takes a minor repair", async () => {
    on = new Set([key("computerEras")]);
    const tube = record("Minicomputer", { tl: "7", cost: 100_000 }, { options: { vacuumTube: true } });
    const actor = character([tube]);
    expect(action("ht-tube-burnout").visible(tube)).toBe(true);
    expect(action("ht-tube-burnout").visible(WORKSTATION())).toBe(false);
    outcome = { success: false };
    await action("ht-tube-burnout").run(tube, actor);
    expect(calls[0]).toEqual(["roll", expect.objectContaining({ base: 10, tags: ["tubeBurnout"] })]);
    // The machine's roll: no user's familiarity with it.
    expect((calls[0]![1] as any).item).toBeUndefined();
    expect(tube.system.extensions[MODULE_ID].htComputer.burntOut).toBe(true);
    expect(action("ht-tube-burnout").visible(tube)).toBe(false);
    expect(action("ht-tube-repair").visible(tube)).toBe(true);
    // Electronics Repair (Computers) at IQ-5, -1 for a $100,000 machine (Campaigns p. 484).
    outcome = { success: true };
    await action("ht-tube-repair").run(tube, actor);
    const repair: any = calls.find((c) => c[0] === "roll" && (c[1] as any).skill === "Electronics Repair (Computers)")![1];
    expect(repair).toMatchObject({ base: 7, modifiers: [{ value: -1 }] });
    expect(tube.system.extensions[MODULE_ID].htComputer.burntOut).toBe(false);
  });

  it("refuses a roll with a computer whose tube has burned out, or a program on it, until it is repaired", () => {
    const tube = record("Minicomputer", { tl: "7", cost: 100_000 }, { options: { vacuumTube: true } }, { burntOut: true });
    const app = record("Payroll", { tl: "7" }, { complexity: 1, program: true, runsOn: "Minicomputer" });
    const actor = character([tube, app]);
    const roll = (item: any) => fire("gworld.successRollModifiers", { actor, item, skill: "Computer Operation/TL7", modifiers: [], refusal: null });
    // The eras' switch alone holds the rule.
    expect(roll(tube).refusal).toBeNull();
    on = new Set([key("computerEras")]);
    expect(roll(tube).refusal).toContain("BurntOutRefusal");
    expect(roll(app).refusal).toContain("BurntOutRefusal");
    // A Research program picked as the skill's tool isn't refused: its bonus is taken back, with a line that says why.
    const research = record("Research Database", { tl: "7" }, { complexity: 1, program: true, runsOn: "Minicomputer" });
    actor.items.push(research, { id: "skill", name: "Research/TL7", type: "skill", system: { derived: { toolItemId: research.id, toolBonus: 2 } } });
    research.actor = actor;
    const study = fire("gworld.successRollModifiers", { actor, item: research, skill: "Research/TL7", modifiers: [], refusal: null });
    expect(study.refusal).toBeNull();
    expect(study.modifiers).toEqual([{ key: "ht.burntOut", label: expect.stringContaining("BurntOutProgram"), value: -2 }]);
    // A transistor machine has no tubes to burn out, whatever its flag says.
    const transistor = record("Minicomputer", { tl: "7" }, { options: { transistor: true } }, { burntOut: true });
    character([transistor]);
    expect(roll(transistor).refusal).toBeNull();
    tube.system.extensions[MODULE_ID].htComputer.burntOut = false;
    expect(roll(tube).refusal).toBeNull();
  });
});

describe("computerInterfaces (HT:EE pp. 39-41)", () => {
  it("puts an interface's lines on a roll with a program on the computer", () => {
    on = new Set([key("computerInterfaces"), "familiarity"]);
    const phone = record("Small Computer", { tl: "8" }, {}, { interface: "touch", touch: "phone", multitouch: false });
    const app = record("Maps", { tl: "8" }, { complexity: 2, program: true, runsOn: "SmallComputer" });
    const actor = character([phone, app]);
    expect(computerBehind(app)).toBe(phone);
    const roll = fire("gworld.successRollModifiers", { actor, item: app, skill: "Computer Operation/TL8", modifiers: [] });
    expect(roll.modifiers.map((l: any) => [l.key, l.value])).toEqual([["ht.interface.unfamiliar", -2], ["ht.interface.touch", -2]]);
  });

  it("takes a carried stylus, and nothing where the computer can't drive the interface", () => {
    on = new Set([key("computerInterfaces")]);
    const phone = record("Small Computer", { tl: "8" }, {}, { interface: "touch", touch: "phone", multitouch: false });
    const actor = character([phone, STYLUS()]);
    const roll = fire("gworld.successRollModifiers", { actor, item: phone, skill: "Computer Operation", modifiers: [] });
    expect(roll.modifiers.map((l: any) => l.value)).toEqual([-2, 1]);
    const small = record("Small Computer", { tl: "8" }, {}, { interface: "voice" });
    character([small]);
    expect(fire("gworld.successRollModifiers", { actor: small.actor, item: small, skill: "Computer Operation", modifiers: [] }).modifiers).toEqual([]);
  });

  it("shows the interface section on a High-Tech computer with only its switch on", () => {
    on = new Set([key("computerInterfaces")]);
    const section = registered.section!.find((s) => s.key === "ht-computing");
    const pc = record("Medium Computer", { tl: "8" }, {}, { interface: "vr" });
    character([pc], ["Virtual reality"]);
    expect(section.visible(pc)).toBe(true);
    const context = section.context(pc);
    expect(context.interfaces).toMatchObject({ tooLow: "", familiarName: "Virtual reality", familiar: true });
    expect(section.visible(LIGHT_PEN())).toBe(false);
  });

  it("rolls HT for a light pen: 1 FP on a failure, 1 HP too on a critical failure", async () => {
    on = new Set([key("computerInterfaces")]);
    const pen = LIGHT_PEN();
    const actor = character([pen]);
    expect(action("ht-light-pen").visible(pen)).toBe(true);
    expect(action("ht-light-pen").visible(STYLUS())).toBe(false);
    outcome = { success: false, criticalFailure: true };
    await action("ht-light-pen").run(pen, actor);
    expect(calls.map((c) => c[0])).toEqual(["roll", "spendFatigue", "applyInjury"]);
    expect(calls[1]![2]).toBe(1);
    expect(calls[2]![2]).toMatchObject({ amount: 1 });
  });
});

describe("programmingLanguages (HT:EE p. 38)", () => {
  const programming = (actor: any, item: any, modifiers: any[] = []) => fire("gworld.successRollModifiers", { actor, item, skill: "Computer Programming/TL7", modifiers });

  it("puts machine code at -5, but not for Eidetic Memory", () => {
    on = new Set([key("programmingLanguages"), key("computerEras")]);
    const pc = MINICOMPUTER();
    pc.system.extensions[MODULE_ID].htComputer = { language: "machineCode" };
    expect(programming(character([pc]), pc).modifiers.map((l: any) => l.value)).toEqual([-5]);
    const other = MINICOMPUTER();
    other.system.extensions[MODULE_ID].htComputer = { language: "machineCode" };
    expect(programming(character([other], [], ["Eidetic Memory"]), other).modifiers).toEqual([]);
    // Not on Computer Operation.
    expect(fire("gworld.successRollModifiers", { actor: pc.actor, item: pc, skill: "Computer Operation", modifiers: [] }).modifiers).toEqual([]);
  });

  it("lifts High-Tech's unfamiliar computer type for a high-level language", () => {
    on = new Set([key("programmingLanguages"), key("computerSystems"), "familiarity"]);
    const pc = record("Medium Computer", { tl: "8" }, {}, { language: "highLevel" });
    const actor = character([pc], []);
    expect(programming(actor, pc).modifiers).toEqual([]);
    pc.system.extensions[MODULE_ID].htComputer.language = "assembly";
    expect(programming(actor, pc).modifiers.map((l: any) => l.key)).toEqual(["ht.computerType"]);
  });

  it("keeps a complementary Computer Operation roll for the next programming roll with the machine", async () => {
    on = new Set([key("programmingLanguages"), key("computerEras")]);
    const pc = WORKSTATION();
    const actor = character([pc]);
    outcome = { success: true, criticalSuccess: true };
    await action("ht-complementary").run(pc, actor);
    expect(calls[0]).toEqual(["roll", expect.objectContaining({ base: 13, skill: "Computer Operation", item: pc })]);
    expect(programming(actor, pc).modifiers.map((l: any) => [l.key, l.value])).toEqual([["ht.complementary", 2]]);
    fire("gworld.afterSuccessRoll", { actor, item: pc, skill: "Computer Programming/TL7" });
    expect(actor.unsetFlag).toHaveBeenCalled();
    expect(programming(actor, pc).modifiers).toEqual([]);
  });

  it("programs a dedicated machine by designing its circuits, at -2 without digital circuits", async () => {
    on = new Set([key("programmingLanguages")]);
    const calculator = record("Medium Computer", { tl: "8" }, { options: { dedicated: true } });
    const actor = character([calculator], []);
    expect(action("ht-wire-program").visible(calculator)).toBe(false);
    on.add(key("computerEras"));
    expect(action("ht-wire-program").visible(calculator)).toBe(true);
    expect(action("ht-complementary").visible(calculator)).toBe(false);
    await action("ht-wire-program").run(calculator, actor);
    expect(calls[0]).toEqual(["roll", expect.objectContaining({ base: 12, skill: "Engineer (Electronics)", modifiers: [{ label: "GCC.HT.Computing.UnfamiliarCircuits", value: -2 }] })]);
  });
});
