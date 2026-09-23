import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CAMOUFLAGE_TABLES, camouflageEquipment, readyCamouflage } from "../../../shared/stealth/index.js";
import { highTechCamouflage } from "./index.js";

type Listener = (...args: any[]) => unknown;

const SWITCH = `${MODULE_ID}.camouflageGear`;
const hooks = new Map<string, Listener[]>();
const fire = (name: string, context: any) => (hooks.get(name) ?? []).forEach((fn) => fn(context));

const api: any = {
  rules: { toolSkillKey: (name: string) => name.trim().toLowerCase(), toolModifier: (quality: string) => ({ good: 1, fine: 2 })[quality] ?? 0 },
  registry: { isRuleOn: () => true },
  data: { hooks: { skillBonuses: "sb" }, registerPriceModifier: () => undefined },
  combat: { hooks: { successRollModifiers: "srm", detectionModifiers: "dm" } },
  sheets: { registerSheetSection: () => undefined, registerRowAction: () => undefined },
};

/** A High-Tech record with its camouflage fields. */
function piece(name: string, camouflage: Record<string, unknown>, extra: Record<string, unknown> = {}): any {
  return {
    name,
    type: "armor",
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "8", carried: true, equipped: true, forSkills: ["Camouflage"], equipmentQuality: "fine", extensions: { [MODULE_ID]: { camouflage } }, ...extra },
  };
}

function hider(items: any[], hiding: Record<string, unknown> = {}): any {
  return { items, getFlag: (_scope: string, key: string) => (key === "camouflage" ? hiding : undefined) };
}

/** The Camouflage skill's lines, with the system's equipment line for the record's own quality. */
function camouflageLine(actor: any, system = 2): number {
  const lines = [{ key: "tools", label: "Equipment", value: system }];
  fire("sb", { actor, name: "Camouflage", lines });
  return lines[0]!.value;
}

beforeAll(() => {
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: any) => `${key} ${data?.name ?? ""}` } });
  CAMOUFLAGE_TABLES.clear();
  CAMOUFLAGE_TABLES.register(highTechCamouflage(SWITCH));
  readyCamouflage(api);
});

beforeEach(() => setRuleReader((key) => key === SWITCH));

afterAll(() => {
  setRuleReader(() => false);
  CAMOUFLAGE_TABLES.clear();
  vi.unstubAllGlobals();
});

describe("High-Tech's camouflage on the Camouflage roll (pp. 76-77)", () => {
  it("makes a worn ghillie suit's grade by terrain the equipment line", () => {
    const suit = piece("Ghillie Suit", { pattern: "ghillie" }, { tl: "6" });
    expect(camouflageLine(hider([suit], { terrain: "matching" }))).toBe(3);
    expect(camouflageLine(hider([suit], { terrain: "nonMatching" }))).toBe(-1);
    expect(camouflageLine(hider([suit], { terrain: "contrasting" }))).toBe(-2);
    // Customised by 4, and against a thermograph a TL6 suit has no dyes.
    const customised = piece("Ghillie Suit", { pattern: "ghillie", custom: 4 }, { tl: "6" });
    expect(camouflageLine(hider([customised]))).toBe(7);
    expect(camouflageLine(hider([customised], { observer: "infravision" }))).toBe(7);
  });

  it("gives the infrared-suppressing poncho its bonus against infravision", () => {
    const poncho = piece("Infrared-Suppressing Poncho", { pattern: "simple", infrared: true });
    const actor = (observer: string) => hider([poncho], { observer });
    expect(camouflageEquipment(api, actor("vision"), { terrain: "matching", observer: "vision" })?.value).toBe(1);
    expect(camouflageEquipment(api, actor("nightVision"), { terrain: "matching", observer: "nightVision" })?.value).toBe(2);
    expect(camouflageEquipment(api, actor("infravision"), { terrain: "matching", observer: "infravision" })?.value).toBe(3);
  });

  it("counts the best piece worn, and none that is only carried", () => {
    const basic = piece("Basic Camouflage", { pattern: "basic" });
    const advanced = piece("Advanced Camouflage", { pattern: "advanced" }, { equipped: false });
    expect(camouflageLine(hider([basic, advanced]))).toBe(2);
    // Only carried: the record's own quality no longer counts.
    expect(camouflageLine(hider([advanced]))).toBe(0);
    // A net is laid over gear, never worn.
    expect(camouflageLine(hider([piece("Camouflage Net", { pattern: "simple", net: true })]), 0)).toBe(0);
  });

  it("does nothing while the switch is off", () => {
    setRuleReader(() => false);
    expect(camouflageLine(hider([piece("Ghillie Suit", { pattern: "ghillie" })]), 2)).toBe(2);
  });
});

describe("High-Tech's scent masking (p. 77)", () => {
  it("is -4 to a tracker following its wearer by scent", () => {
    const wearer = hider([piece("Scent Masking (Ordinary Clothes)", { scent: true, builtIn: true }, { forSkills: [] })]);
    const context = { subject: wearer, skill: "Tracking", modifiers: [] as any[] };
    fire("dm", context);
    expect(context.modifiers.map((m) => m.value)).toEqual([-4]);
    // Carried, not worn: nothing.
    const off = hider([piece("Scent Masking (Ordinary Clothes)", { scent: true }, { equipped: false })]);
    const none = { subject: off, skill: "Tracking", modifiers: [] as any[] };
    fire("dm", none);
    expect(none.modifiers).toEqual([]);
  });
});
