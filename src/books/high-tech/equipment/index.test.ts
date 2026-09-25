/**
 * High-Tech's gear rules as the system meets them: the book's table in the
 * shared gadget engine, the combination row action, the skill lines for
 * intrinsic bonuses and Equipment Bond, and the TL-familiarity line on an
 * attack, with Foundry's globals stubbed and the pinned system's rules
 * standing in for `api.rules`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { GADGET_TABLES, failureLines, gadgetPriceOf, gadgetTables, sizedCells, stylingLine } from "../../../shared/gadgets/index.js";
import { gadgetItem } from "../../../shared/gadgets/data.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CELL_TABLES } from "../../../shared/power/index.js";
import { highTechBatteries } from "../power/index.js";
import { ultraTechGadgets } from "../../ultra-tech/gadgets/index.js";
import { combinationSource, familiarityLine, highTechGadgets, isMerchantInfluence, readyHighTechEquipment, successRollFamiliarity, type EquipmentSwitches } from "./index.js";

type Listener = (context: any) => void;

const key = (k: string) => `${MODULE_ID}.${k}`;
const HT_SWITCHES = { options: key("equipmentOptions"), sm: key("gearForSm"), legality: key("antiqueLegality") };

let hooks: Map<string, Listener[]>;
let rowActions: any[];
let on: Record<string, boolean>;

const HOOKS = {
  equipmentFailure: "gworld.equipmentFailure",
  reactionModifiers: "gworld.reactionModifiers",
  attackModifiers: "gworld.attackModifiers",
  successRollModifiers: "gworld.successRollModifiers",
};

function fakeApi() {
  return {
    rules,
    combat: { hooks: HOOKS },
    data: { hooks: { skillBonuses: "gworld.skillBonuses", legalityClass: "gworld.legalityClass" }, registerPriceModifier: vi.fn() },
    sheets: { registerSheetSection: vi.fn(), registerRowAction: (r: any) => rowActions.push(r) },
  };
}

const switches: EquipmentSwitches = { combination: () => on.combination === true, bonuses: () => on.bonuses === true, familiarity: () => on.familiarity === true };

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** Switches on exactly these keys. */
function only(...keys: string[]) {
  const set = new Set(keys);
  setRuleReader((k) => set.has(k));
}

function gear(patch: { name?: string; type?: string; system?: Record<string, unknown>; gadget?: Record<string, unknown>; intrinsic?: number; book?: string | null; actor?: any } = {}): any {
  return {
    id: patch.name ?? "gear",
    name: patch.name ?? "Radio",
    type: patch.type ?? "equipment",
    actor: patch.actor,
    flags: patch.book === null ? {} : { [MODULE_ID]: { book: patch.book ?? "high-tech" } },
    system: {
      tl: "8",
      cost: 100,
      weight: 2,
      carried: true,
      forSkills: [],
      meleeModes: [],
      rangedModes: [],
      equipmentQuality: "basic",
      ...patch.system,
      extensions: { [MODULE_ID]: { ultraTech: patch.gadget ?? {}, intrinsicBonus: patch.intrinsic ?? 0 } },
    },
  };
}

beforeEach(() => {
  hooks = new Map();
  rowActions = [];
  on = {};
  GADGET_TABLES.register(ultraTechGadgets({ options: key("gadgetOptions"), sm: key("adjustingForSm"), legality: key("legalityAndAntiques") }));
  GADGET_TABLES.register(highTechGadgets(HT_SWITCHES));
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: {
      localize: (k: string) => k,
      format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}`,
    },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
});

afterEach(() => {
  GADGET_TABLES.clear();
  setRuleReader(() => false);
  vi.unstubAllGlobals();
});

describe("High-Tech's table in the gadget engine", () => {
  it("prices High-Tech gear with High-Tech's switch alone (D1)", () => {
    only(key("equipmentOptions"));
    const radio = gear({ gadget: { styling: 5, grade: "fragile" } });
    expect(gadgetTables(radio).options?.book).toBe("high-tech");
    // Styling +2 (x5) and cheap (x1/2).
    expect(gadgetPriceOf(radio, gadgetItem(radio))).toMatchObject({ cost: 250, weight: 2 });
    only(key("gadgetOptions"));
    expect(gadgetPriceOf(radio, gadgetItem(radio))).toBeNull();
  });

  it("prices a weapon's disguise but not a rugged or expensive build", () => {
    only(key("equipmentOptions"));
    const knife = gear({ name: "Knife", system: { meleeModes: [{ skill: "Knife" }] }, gadget: { rugged: true, grade: "expensive", disguise: "massProduced" } });
    expect(gadgetPriceOf(knife, gadgetItem(knife))).toMatchObject({ cost: 200, weight: 2 });
    const vest = gear({ name: "Vest", type: "armor", gadget: { rugged: true } });
    expect(gadgetPriceOf(vest, gadgetItem(vest))).toBeNull();
  });

  it("counts a tactical light as rugged and expensive already, and never charges them again (p. 52)", () => {
    only(key("equipmentOptions"));
    const light = gear({ name: "Small Tactical Light (TL8)", gadget: { rugged: true, grade: "expensive" } });
    light.system.extensions[MODULE_ID].expedition = { light: { kind: "tactical", radius: 0, beam: 25 } };
    // Rugged and expensive ticked: the list price already pays for them.
    expect(gadgetPriceOf(light, gadgetItem(light))).toBeNull();
    light.system.extensions[MODULE_ID].ultraTech = { styling: 2 };
    expect(gadgetPriceOf(light, gadgetItem(light))).toMatchObject({ cost: 200, weight: 2 });
    // Its failure roll takes rugged's +2 whatever was ticked.
    light.system.extensions[MODULE_ID].ultraTech = {};
    expect(failureLines(gadgetTables(light).options!, light)).toEqual([{ label: expect.stringContaining("Rugged"), value: 2 }]);
  });

  it("leaves Ultra-Tech's gear priced as before", () => {
    only(key("gadgetOptions"));
    const armour = gear({ book: "ultra-tech", type: "armor", gadget: { rugged: true }, system: { tl: "10" } });
    // Ultra-Tech keeps no gear off its options.
    expect(gadgetPriceOf(armour, gadgetItem(armour))).toMatchObject({ cost: 200, factor: 2 });
  });

  it("puts rugged's, fragile's and quality's HT on equipment failure", () => {
    only(key("equipmentOptions"));
    const table = gadgetTables(gear()).options!;
    expect(failureLines(table, gear({ gadget: { rugged: true }, system: { equipmentQuality: "fine" } })).map((l) => l.value)).toEqual([2, 2]);
    expect(failureLines(table, gear({ gadget: { grade: "fragile" } })).map((l) => l.value)).toEqual([-2]);
    // Ultra-Tech's table has neither.
    const ut = GADGET_TABLES.forBook("ultra-tech")!;
    expect(failureLines(ut, gear({ gadget: { rugged: true }, system: { equipmentQuality: "fine" } })).map((l) => l.value)).toEqual([2]);
  });

  it("gives the styling bonus on reactions while the piece is shown", () => {
    only(key("equipmentOptions"));
    const shown = gear({ name: "Pistol", gadget: { styling: 10, shown: true } });
    const pocket = gear({ name: "Watch", gadget: { styling: 5 } });
    expect(stylingLine({ items: [shown, pocket] })).toMatchObject({ value: 3 });
    expect(stylingLine({ items: [pocket] })).toBeNull();
    // Ultra-Tech prints no tiers, so no bonus.
    expect(stylingLine({ items: [gear({ book: "ultra-tech", gadget: { styling: 10, shown: true } })] })).toBeNull();
  });

  it("scales the battery count with the carrier's size, under gearForSm", () => {
    only(key("gearForSm"));
    const actor = { system: { sm: 2 } };
    expect(sizedCells(gear({ actor, gadget: { adjustForSm: true } }))).toBe(5);
    expect(sizedCells(gear({ actor, gadget: { adjustForSm: false } }))).toBeNull();
    // Ultra-Tech's sizing leaves its cells as they were.
    only(key("adjustingForSm"));
    expect(sizedCells(gear({ book: "ultra-tech", actor, gadget: { adjustForSm: true } }))).toBeNull();
  });
});

describe("combination gadgets (p. 10)", () => {
  it("makes one piece of equipment from the parts, the lowest LC and the parts' skills", () => {
    const gps = gear({ name: "GPS", system: { cost: 200, weight: 1, lc: 4, forSkills: ["Navigation"], category: "tool" }, gadget: { cellWeight: 0.1 } });
    const pda = gear({ name: "PDA", system: { cost: 100, weight: 0.5, lc: 3, forSkills: ["Computer Operation"] }, gadget: { cellWeight: 0.1 } });
    const source: any = combinationSource([gps, pda], "Navigator", true);
    expect(source).toMatchObject({
      name: "Navigator",
      type: "equipment",
      system: { cost: 280, weight: 1.32, tl: "8", lc: 3, forSkills: ["Navigation", "Computer Operation"], category: "tool" },
      flags: { [MODULE_ID]: { book: "high-tech", combination: { parts: ["GPS", "PDA"], allAtOnce: true } } },
    });
    expect(source.system.extensions[MODULE_ID].ultraTech.cellWeight).toBe(0.1);
  });

  it("runs each part off the shared batteries for as long as their weight says, and shows it (p. 10)", () => {
    CELL_TABLES.register(highTechBatteries());
    only(key("batteries"));
    try {
      const power = (cell: string, endurance: string) => ({ power: { cell, cells: 1, draw: { cell, cells: 1, endurance } } });
      const gps = gear({ name: "GPS", system: { cost: 200, weight: 1, lc: 4 } });
      gps.system.extensions[MODULE_ID] = { ...gps.system.extensions[MODULE_ID], ...power("XS", "10 hr.") };
      const thermograph = gear({ name: "Thermograph", system: { cost: 500, weight: 2, lc: 4 } });
      thermograph.system.extensions[MODULE_ID] = { ...thermograph.system.extensions[MODULE_ID], ...power("S", "5 hr.") };
      const source: any = combinationSource([gps, thermograph], "Scout", true);
      // One S battery for both: the GPS's XS battery weighed 0.1 lb., the S 0.33, so it runs 3.3 times as long.
      expect(source.system.extensions[MODULE_ID].ultraTech.cellWeight).toBe(0.33);
      expect(source.flags[MODULE_ID].combination.endurance).toEqual([{ name: "GPS", hours: 33 }, { name: "Thermograph", hours: 5 }]);

      on.combination = true;
      const sections: any[] = [];
      readyHighTechEquipment({ ...fakeApi(), sheets: { registerSheetSection: (s: any) => sections.push(s), registerRowAction: vi.fn() } } as never, switches);
      const section = sections.find((s) => s.key === "ht-equipment-item");
      expect(section.visible(source)).toBe(true);
      expect(section.context(source).endurance).toEqual([
        'GCC.HT.Equipment.SharedEndurance {"name":"GPS","hours":33}',
        'GCC.HT.Equipment.SharedEndurance {"name":"Thermograph","hours":5}',
      ]);
    } finally {
      CELL_TABLES.clear();
    }
  });

  it("offers the row action under its switch", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    const action = rowActions.find((a) => a.key === "ht-combine");
    expect(action.visible(gear())).toBe(false);
    on.combination = true;
    expect(action.visible(gear())).toBe(true);
  });
});

describe("equipment bonuses (pp. 7, 11)", () => {
  function actorWith(items: any[]) {
    return { items, system: { familiarities: [] } };
  }

  it("adds a tool's intrinsic bonus and Equipment Bond's +1 beside quality's", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    on.bonuses = true;
    const kit = gear({ name: "Medical Kit", system: { forSkills: ["First Aid/TL8"] }, intrinsic: 1 });
    const actor = actorWith([kit, { type: "trait", name: "Equipment Bond (Medical Kit)", system: {} }]);
    const context = fire("gworld.skillBonuses", { actor, item: { system: { attribute: "IQ" } }, name: "First Aid/TL8", lines: [] });
    expect(context.lines.map((l: any) => l.value)).toEqual([1, 1]);
    expect(context.lines.every((l: any) => l.source === MODULE_ID)).toBe(true);
  });

  it("adds nothing with the switch off, or for a tool left behind", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    const kit = gear({ name: "Medical Kit", system: { forSkills: ["First Aid"] }, intrinsic: 1 });
    expect(fire("gworld.skillBonuses", { actor: actorWith([kit]), item: {}, name: "First Aid", lines: [] }).lines).toEqual([]);
    on.bonuses = true;
    const left = gear({ name: "Medical Kit", system: { forSkills: ["First Aid"], carried: false }, intrinsic: 1 });
    expect(fire("gworld.skillBonuses", { actor: actorWith([left]), item: {}, name: "First Aid", lines: [] }).lines).toEqual([]);
  });
});

describe("TL penalties as unfamiliarity (p. 11)", () => {
  const skill = (attribute: string) => ({ type: "skill", name: "Guns/TL8 (Rifle)", system: { attribute } });
  const musket = { name: "Brown Bess", system: { tl: "4" } };

  it("lifts a DX-based skill's TL penalty on an attack once the shooter is familiar with the weapon", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    on.familiarity = true;
    const actor = { items: [skill("DX")], system: { familiarities: ["Brown Bess"] } };
    const context = fire(HOOKS.attackModifiers, {
      actor, item: musket, dataset: { rollSkill: "Guns/TL8 (Rifle)" }, tags: ["techLevel"],
      modifiers: [{ key: "techLevel", label: "TL4 equipment, TL8 skill", value: -4 }],
    });
    expect(context.modifiers.at(-1)).toMatchObject({ value: 4 });
  });

  it("folds the familiarity rule's -2 into the TL penalty while unfamiliar", () => {
    const api = fakeApi();
    const actor = { items: [skill("DX")], system: { familiarities: [] } };
    expect(familiarityLine(api as never, actor, "Guns (Rifle)", musket, [{ key: "techLevel", value: -4 }, { key: "unfamiliar", value: -2 }])).toMatchObject({ value: 2 });
    expect(familiarityLine(api as never, actor, "Guns (Rifle)", musket, [{ key: "techLevel", value: -4 }])).toBeNull();
  });

  it("leaves an IQ-based skill, an NPC and the switch off alone", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    const lines = [{ key: "techLevel", value: -4 }];
    const api = fakeApi();
    expect(familiarityLine(api as never, { items: [skill("IQ")], system: { familiarities: ["Brown Bess"] } }, "Guns (Rifle)", musket, lines)).toBeNull();
    expect(familiarityLine(api as never, { items: [skill("DX")], system: {} }, "Guns (Rifle)", musket, lines)).toBeNull();
    const context = fire(HOOKS.attackModifiers, {
      actor: { items: [skill("DX")], system: { familiarities: ["Brown Bess"] } }, item: musket, dataset: { rollSkill: "Guns (Rifle)" }, tags: ["techLevel"],
      modifiers: [{ key: "techLevel", value: -4 }],
    });
    expect(context.modifiers).toHaveLength(1);
  });

  it("lifts a tool's TL line on a DX-based skill once the character knows the tool picked for it (API 1.135.0)", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    on.familiarity = true;
    const canoe = gear({ name: "Dugout Canoe", system: { tl: "0", forSkills: ["Boating (Unpowered)"] } });
    const actor = { items: [canoe], system: { familiarities: ["Dugout Canoe"] } };
    const context = fire("gworld.skillBonuses", { actor, item: { system: { attribute: "DX" } }, name: "Boating/TL6 (Unpowered)", tool: canoe, lines: [{ key: "techLevel", value: -6 }] });
    expect(context.lines.at(-1)).toMatchObject({ value: 6, source: MODULE_ID });
  });

  it("keeps the TL line where the tool picked is not the one the character knows", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    on.familiarity = true;
    const canoe = gear({ name: "Dugout Canoe", system: { tl: "0", forSkills: ["Boating (Unpowered)"] } });
    const raft = gear({ name: "Log Raft", system: { tl: "0", forSkills: ["Boating (Unpowered)"] } });
    const actor = { items: [canoe, raft], system: { familiarities: ["Dugout Canoe"] } };
    const lines = () => [{ key: "techLevel", value: -6 }];
    expect(fire("gworld.skillBonuses", { actor, item: { system: { attribute: "DX" } }, name: "Boating/TL6 (Unpowered)", tool: raft, lines: lines() }).lines).toHaveLength(1);
    expect(fire("gworld.skillBonuses", { actor, item: { system: { attribute: "DX" } }, name: "Boating/TL6 (Unpowered)", tool: null, lines: lines() }).lines).toHaveLength(1);
  });
});

describe("styling on Merchant used as an Influence roll (p. 10; API 1.95.0)", () => {
  const influence = (patch: Record<string, unknown> = {}) => ({
    kind: "contest", skill: "Merchant", tags: ["contest", "quickContest", "influence"], modifiers: [] as any[], ...patch,
  });

  it("adds the shown piece's reaction bonus to the influencer's Merchant roll", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    only(key("equipmentOptions"));
    const actor = { items: [gear({ name: "Pistol", gadget: { styling: 10, shown: true } })] };
    expect(fire(HOOKS.successRollModifiers, influence({ actor })).modifiers.map((l: any) => l.value)).toEqual([3]);
  });

  it("leaves the subject's Will, another Influence skill, hidden gear and the switch off alone", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    only(key("equipmentOptions"));
    const actor = { items: [gear({ name: "Pistol", gadget: { styling: 10, shown: true } })] };
    expect(fire(HOOKS.successRollModifiers, influence({ actor, skill: "", tags: ["contest", "quickContest", "influence", "will"] })).modifiers).toEqual([]);
    expect(fire(HOOKS.successRollModifiers, influence({ actor, skill: "Diplomacy" })).modifiers).toEqual([]);
    expect(fire(HOOKS.successRollModifiers, influence({ actor: { items: [gear({ gadget: { styling: 10 } })] } })).modifiers).toEqual([]);
    only();
    expect(fire(HOOKS.successRollModifiers, influence({ actor })).modifiers).toEqual([]);
  });

  it("reads the influencer's side by its tags and skill", () => {
    expect(isMerchantInfluence(influence())).toBe(true);
    expect(isMerchantInfluence(influence({ skill: "Merchant (Weapons)" }))).toBe(true);
    expect(isMerchantInfluence(influence({ tags: ["contest", "quickContest"] }))).toBe(false);
  });
});

describe("TL penalties as unfamiliarity on rolls made with an item (p. 11; API 1.95.0)", () => {
  const boating = { type: "skill", name: "Boating/TL6 (Unpowered)", system: { attribute: "DX" } };
  const canoe = { name: "Dugout Canoe", system: { tl: "0" } };
  const control = (actor: any, modifiers: any[], patch: Record<string, unknown> = {}) => ({
    actor, item: canoe, kind: "skill", skill: "Boating (Unpowered)", tags: ["vehicleControl", "techLevel"], modifiers, ...patch,
  });

  it("lifts a vehicle control roll's TL penalty once the operator knows the canoe (the book's example)", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    on.familiarity = true;
    const actor = { items: [boating], system: { familiarities: ["Dugout Canoe"] } };
    const context = fire(HOOKS.successRollModifiers, control(actor, [{ key: "techLevel", label: "TL0 equipment, TL6 skill", value: -6 }]));
    expect(context.modifiers.reduce((sum: number, l: any) => sum + l.value, 0)).toBe(0);
  });

  it("keeps it as one unfamiliarity penalty, the larger, until then", () => {
    const actor = { items: [boating], system: { familiarities: [] } };
    const line = successRollFamiliarity(fakeApi() as never, control(actor, [{ key: "techLevel", value: -6 }, { key: "unfamiliar", value: -2 }]));
    expect(line).toMatchObject({ value: 2 });
  });

  it("leaves an attack, an IQ-based roll, a roll with no item or no TL line, and the switch off alone", () => {
    const api = fakeApi();
    const actor = { items: [boating], system: { familiarities: ["Dugout Canoe"] } };
    const lines = [{ key: "techLevel", value: -6 }];
    expect(successRollFamiliarity(api as never, control(actor, lines, { kind: "attack" }))).toBeNull();
    expect(successRollFamiliarity(api as never, control(actor, lines, { tags: ["IQ", "techLevel"] }))).toBeNull();
    expect(successRollFamiliarity(api as never, control(actor, lines, { item: null }))).toBeNull();
    expect(successRollFamiliarity(api as never, control(actor, []))).toBeNull();
    readyHighTechEquipment(api as never, switches);
    expect(fire(HOOKS.successRollModifiers, control(actor, [{ key: "techLevel", value: -6 }])).modifiers).toHaveLength(1);
  });
});

describe("an antique's Legality Class wherever the system reads it (p. 8; API 1.95.0)", () => {
  const gatling = (book: string, patch: Record<string, unknown> = {}) => gear({
    name: "Gatling Gun", book, actor: { system: { tl: 8 } }, system: { tl: "5", lc: 2, category: "weapon" }, ...patch,
  });

  it("raises a High-Tech antique's class for the Gear tab and the license cost", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    only(key("antiqueLegality"));
    const item = gatling("high-tech");
    expect(fire("gworld.legalityClass", { item, actor: item.actor, lc: 2 }).lc).toBe(3);
  });

  it("keeps an always-controlled weapon's class, and leaves the switch off and Ultra-Tech's gear alone", () => {
    readyHighTechEquipment(fakeApi() as never, switches);
    only(key("antiqueLegality"));
    const nbc = gatling("high-tech", { gadget: { controlled: true } });
    expect(fire("gworld.legalityClass", { item: nbc, actor: nbc.actor, lc: 2 }).lc).toBe(2);
    only(key("legalityAndAntiques"));
    const ut = gatling("ultra-tech", { system: { tl: "9", lc: 2 } });
    ut.actor = { system: { tl: 12 } };
    expect(fire("gworld.legalityClass", { item: ut, actor: ut.actor, lc: 2 }).lc).toBe(2);
    only();
    const item = gatling("high-tech");
    expect(fire("gworld.legalityClass", { item, actor: item.actor, lc: 2 }).lc).toBe(2);
  });
});
