/**
 * Maintenance checks on High-Tech's gadgets (p. 9; Campaigns pp. 484-485),
 * through the shared gadget engine: a check missed or failed costs a point of
 * HT on the gadget's equipment failure rolls, and a major repair puts it back.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { GADGET_TABLES, maintenanceDue, missedChecks, readyGadgets, systemCountsMaintenance, technicalLevel } from "../../../shared/gadgets/index.js";
import { MAINTENANCE_SKILLS, maintenanceOutcome, maintenanceSkillFor } from "../../../shared/gadgets/rules.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyDevices } from "../devices/index.js";
import { highTechGadgets } from "./index.js";

type Listener = (context: any) => void;

const key = (k: string) => `${MODULE_ID}.${k}`;
const SWITCHES = { options: key("equipmentOptions"), sm: key("gearForSm"), legality: key("antiqueLegality") };

// The engine registers once, whichever books ask: its hooks and row buttons are kept for the file.
const hooks = new Map<string, Listener[]>();
const actions = new Map<string, any>();
let successes: any[];
let successResult: any;
let dialogAnswer: any;
let chat: string[];

const SRM = "gworld.successRollModifiers";

const api: any = {
  rules,
  combat: { hooks: { equipmentFailure: "gworld.equipmentFailure", reactionModifiers: "gworld.reactionModifiers", successRollModifiers: SRM, afterSuccessRoll: "gworld.afterSuccessRoll" } },
  data: { hooks: { objectStats: "gworld.objectStats" }, registerPriceModifier: () => undefined, registerToolGrade: () => "x" },
  sheets: { registerSheetSection: () => undefined, registerRowAction: (a: any) => actions.set(a.key, a) },
  items: { objectStats: () => ({ kind: "unliving", dr: 2, hp: 5, ht: 10, notes: [] }), applyDamage: async () => null },
  actors: {
    skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    attribute: (actor: any, attribute: string) => actor?.attributes?.[attribute] ?? 10,
  },
  // As the system does: the roll passes through the modifiers hook, and a listener's refusal stops it.
  roll: {
    success: async (o: any) => {
      const context = { ...o, modifiers: [...(o.modifiers ?? [])], refusal: null };
      for (const fn of hooks.get(SRM) ?? []) fn(context);
      successes.push({ ...o, refusal: context.refusal });
      return context.refusal ? null : successResult;
    },
  },
};

function gadget(name: string, cost: number, more: Record<string, unknown> = {}): any {
  const flags: Record<string, unknown> = { book: "high-tech" };
  const item: any = {
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: flags },
    system: { tl: "8", cost, weight: 1, carried: true, meleeModes: [], rangedModes: [], equipmentQuality: "basic", extensions: {}, ...more },
    getFlag: (_scope: string, k: string) => flags[k],
    setFlag: async (_scope: string, k: string, value: unknown) => { flags[k] = value; },
  };
  item.actor = { name: "Tech", system: { tl: 8 }, skills: { "Electronics Repair": 13 }, attributes: { IQ: 12 }, items: [item] };
  return item;
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeAll(() => {
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class { total = 3; async evaluate() { return this; } });
  GADGET_TABLES.register(highTechGadgets(SWITCHES));
  readyGadgets(api);
  // The supplement's broken parts, whose listener refuses a roll made with a broken device.
  readyDevices(api, { cuttingEdge: () => false, breakable: () => true, kits: () => false });
});

beforeEach(() => {
  successes = [];
  successResult = { success: false };
  dialogAnswer = null;
  chat = [];
  setRuleReader((k) => k === SWITCHES.options);
});

afterEach(() => {
  setRuleReader(() => false);
});

afterAll(() => {
  GADGET_TABLES.clear();
  vi.unstubAllGlobals();
});

describe("maintenance checks (High-Tech p. 9; Campaigns pp. 484-485)", () => {
  it("picks the likely repair skill, and loses HT on a check missed or failed", () => {
    expect(MAINTENANCE_SKILLS).toContain("Electronics Repair");
    expect(maintenanceSkillFor({ weapon: true, armor: false, vehicle: false, powered: false })).toBe("Armoury");
    expect(maintenanceSkillFor({ weapon: false, armor: false, vehicle: true, powered: true })).toBe("Mechanic");
    expect(maintenanceSkillFor({ weapon: false, armor: false, vehicle: false, powered: true })).toBe("Electronics Repair");
    expect(maintenanceSkillFor({ weapon: false, armor: false, vehicle: false, powered: false })).toBe("Machinist");
    expect(maintenanceOutcome({ missed: false, success: true })).toBe("kept");
    expect(maintenanceOutcome({ missed: false, success: false })).toBe("lost");
    expect(maintenanceOutcome({ missed: true, success: true })).toBe("lost");
  });

  it("offers a check on gear worth maintaining at the campaign's TL, not on the simplest", () => {
    // TL8: 0.1% of $20,000 is $20.
    expect(maintenanceDue(api, gadget("Radio", 100))).not.toBeNull();
    expect(maintenanceDue(api, gadget("Pencil", 5))).toBeNull();
    setRuleReader(() => false);
    expect(maintenanceDue(api, gadget("Radio", 100))).toBeNull();
  });

  it("costs a point of HT on the equipment failure roll for a failed check, and a major repair puts it back", async () => {
    const radio = gadget("Radio", 100);
    dialogAnswer = { skill: "Electronics Repair", missed: false };
    actions.get("gadget-maintenance").run(radio, radio.actor);
    await flush();
    expect(successes[0]).toMatchObject({ base: 13, skill: "Electronics Repair", tags: ["maintenance"] });
    expect(missedChecks(radio)).toBe(1);
    const failure = { item: radio, modifiers: [] as any[] };
    for (const fn of hooks.get("gworld.equipmentFailure") ?? []) fn(failure);
    expect(failure.modifiers.map((m) => m.value)).toEqual([-1]);
    // A missed check is lost without a roll.
    dialogAnswer = { skill: "Electronics Repair", missed: true };
    actions.get("gadget-maintenance").run(radio, radio.actor);
    await flush();
    expect(successes).toHaveLength(1);
    expect(missedChecks(radio)).toBe(2);
    // The major repair: -2, parts at 1d x 10% of the price.
    expect(actions.get("gadget-restore").visible(radio)).toBe(true);
    successResult = { success: true };
    dialogAnswer = { skill: "Electronics Repair", missed: false };
    actions.get("gadget-restore").run(radio, radio.actor);
    await flush();
    expect(successes[1].modifiers).toEqual([{ label: "GCC.HT.Gadget.MajorRepair", value: -2 }]);
    expect(missedChecks(radio)).toBe(1);
    expect(chat.at(-1)).toContain('"parts":30');
  });

  it("keeps the HT on a check made", async () => {
    const radio = gadget("Radio", 100);
    successResult = { success: true };
    dialogAnswer = { skill: "Electronics Repair", missed: false };
    actions.get("gadget-maintenance").run(radio, radio.actor);
    await flush();
    expect(missedChecks(radio)).toBe(0);
    expect(actions.get("gadget-restore").visible(radio)).toBe(false);
  });
});

describe("the review's cases (#571)", () => {
  it("takes the actor's best skill of that name, whatever its specialty", () => {
    const actor = {
      items: [{ type: "skill", name: "Armoury/TL8 (Small Arms)" }, { type: "skill", name: "Armoury/TL8 (Heavy Weapons)" }, { type: "skill", name: "Mechanic (Automobile)" }],
      skills: { "Armoury/TL8 (Small Arms)": 14, "Armoury/TL8 (Heavy Weapons)": 11, "Mechanic (Automobile)": 12 },
      attributes: { IQ: 10 },
    };
    expect(technicalLevel(api, actor, "Armoury")).toEqual({ skill: "Armoury/TL8 (Small Arms)", level: 14 });
    expect(technicalLevel(api, actor, "Mechanic")).toEqual({ skill: "Mechanic (Automobile)", level: 12 });
    // Nobody with it: IQ-5, IQ-4 for Computer Operation.
    expect(technicalLevel(api, actor, "Machinist")).toEqual({ skill: "Machinist", level: 5 });
    expect(technicalLevel(api, actor, "Computer Operation").level).toBe(6);
  });

  it("maintains a broken device without its broken parts refusing the roll: the gadget isn't the roll's item", async () => {
    const radio = gadget("Tube Radio", 200, { extensions: { [MODULE_ID]: { device: { parts: { count: 5, label: "vacuum tubes", hp: 1, ht: 10, broken: 2 } } } } });
    successResult = { success: true };
    dialogAnswer = { skill: "Electronics Repair", missed: false };
    actions.get("gadget-maintenance").run(radio, radio.actor);
    await flush();
    expect(successes[0]).toMatchObject({ tags: ["maintenance"], refusal: null });
    expect(successes[0].item).toBeUndefined();
    expect(chat.at(-1)).toContain("MaintenanceKept");
    // A roll made with the broken radio as its tool is still refused.
    await api.roll.success({ actor: radio.actor, base: 12, item: radio });
    expect(successes.at(-1).refusal).toContain("BrokenRefusal");
  });

  it("sends a firearm's missed checks to the system's own field, and keeps its count off the add-on's", async () => {
    const pistol = gadget("Pistol", 500, { weaponClass: "firearm", missedMaintenance: 1 });
    expect(systemCountsMaintenance(pistol)).toBe(true);
    expect(systemCountsMaintenance(gadget("Radio", 100))).toBe(false);
    dialogAnswer = { skill: "Armoury", missed: true };
    actions.get("gadget-maintenance").run(pistol, pistol.actor);
    await flush();
    expect(missedChecks(pistol)).toBe(0);
    expect(chat.at(-1)).toContain('MaintenanceSkippedSheet {"missed":2}');
    // Even a stale add-on count is left to the system on a firearm.
    await pistol.setFlag(MODULE_ID, "gadgetMissedChecks", 3);
    const failure = { item: pistol, modifiers: [] as any[] };
    for (const fn of hooks.get("gworld.equipmentFailure") ?? []) fn(failure);
    expect(failure.modifiers).toEqual([]);
    expect(actions.get("gadget-restore").visible(pistol)).toBe(false);
  });
});
