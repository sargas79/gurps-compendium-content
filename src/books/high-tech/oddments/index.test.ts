/**
 * Protective oddments and portable cover as the system meets them: Stealth and
 * the voice through `gworld.skillBonuses`, the gear's senses and handling
 * through `gworld.traitEffects`, the knockdown roll's `blow`, eyeglasses
 * through `gworld.armorDr` and `gworld.afterDamage`, a smothered charge
 * through `gworld.damageModifiers` and a radiation blanket through
 * `gworld.radiationDose` -- with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CELL_TABLES } from "../../../shared/power/data.js";
import { highTechBatteries } from "../power/index.js";
import { BROKEN_FLAG, BROKEN_IN_FLAG, readyOddments } from "./index.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  armorDr: "gworld.armorDr",
  afterDamage: "gworld.afterDamage",
  damageModifiers: "gworld.damageModifiers",
};

let hooks: Map<string, Listener[]>;
let rows: any[];
let sections: any[];
let detonated: any[];
let conditions: any[];
let rolled: any[];
let chat: string[];
let dieFaces: number[];
let prompt: unknown;
let on: Record<string, boolean>;

function fakeApi() {
  return {
    combat: { hooks: HOOKS },
    data: { hooks: { skillBonuses: "gworld.skillBonuses" }, explosives: () => [{ id: "tnt", label: "TNT", ref: 1 }] },
    registry: { isRuleOn: (k: string) => k === "explosions" },
    sheets: { registerSheetSection: (s: any) => sections.push(s), registerRowAction: (r: any) => rows.push(r) },
    actors: {
      attribute: (_a: any, key: string) => ({ HT: 11, IQ: 10 } as Record<string, number>)[key],
      skillLevel: (_a: any, name: string) => (name === "Hiking" ? 12 : null),
      applyCondition: async (_a: any, c: any) => { conditions.push(c); return "id"; },
    },
    roll: { success: async (o: any) => { rolled.push(o); return rollOutcome; } },
    hazards: {
      detonate: (o: any) => {
        // The system rolls the damage straight away, through the damage hook.
        const context = fire(HOOKS.damageModifiers, { actor: o.actor, item: null, label: o.label, formula: o.formula ?? "6dx2", modifiers: [] });
        detonated.push({ options: o, context });
        return Promise.resolve({ basicDamage: 10 });
      },
    },
  };
}

let rollOutcome: any = { success: true };

const dice = {
  roll: async (formula: string) => ({ total: formula === "2d6" ? 7 : (dieFaces.shift() ?? 6), roll: null }),
};

function gear(name: string, more: Record<string, any> = {}, flags: Record<string, unknown> = {}): any {
  const item: any = {
    id: name,
    name,
    type: more.type ?? "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech", ...flags } },
    system: { tl: "7", carried: true, equipped: true, locations: [], ...(more.system ?? {}) },
  };
  item.update = async (patch: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(patch)) {
      if (path === "system.equipped") item.system.equipped = value;
      else if (path.startsWith(`flags.${MODULE_ID}.`)) item.flags[MODULE_ID][path.split(".").pop()!] = value;
    }
  };
  item.setFlag = async (_scope: string, key: string, value: unknown) => { item.flags[MODULE_ID][key] = value; };
  item.unsetFlag = async (_scope: string, key: string) => { delete item.flags[MODULE_ID][key]; };
  return item;
}
const boots = (name: string, flags: Record<string, unknown> = {}) => gear(name, { type: "armor", system: { locations: ["foot"] } }, flags);

const person = (items: any[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return { name: "Wearer", uuid: "Actor.wearer", isOwner: true, items: Object.assign([...items], { get: (id: string) => byId.get(id) }) };
};

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) void listener(context);
  return context;
}
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

const skill = (actor: any, name: string) => fire("gworld.skillBonuses", { actor, name, lines: [] }).lines;
const effectsOf = (actor: any, effects: Record<string, unknown> = {}) =>
  fire("gworld.traitEffects", { actor, effects: { protectedSense: { vision: false, hearing: false, tasteSmell: false, touch: false }, hamFisted: 0, nictitatingMembrane: 0, hardOfHearing: false, badSight: null, ...effects }, sources: [] });
const knockdown = (actor: any, hitLocation: string) =>
  fire(HOOKS.successRollModifiers, { actor, tags: ["knockdown", "HT"], modifiers: [], blow: { hitLocation, addonLocation: null, majorWound: true } }).modifiers;
const row = (key: string) => rows.find((r) => r.key === key);

function ready(): void {
  const rule = (k: string) => () => on[k] === true;
  readyOddments(fakeApi() as never, { oddments: rule("protectiveOddments"), cover: rule("portableCover") }, dice);
}

beforeEach(() => {
  hooks = new Map();
  rows = [];
  sections = [];
  detonated = [];
  conditions = [];
  rolled = [];
  chat = [];
  dieFaces = [];
  prompt = "";
  rollOutcome = { success: true };
  on = {};
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { prompt: async () => prompt } } },
  });
  vi.stubGlobal("ChatMessage", { implementation: { create: async (m: any) => { chat.push(m.content); }, getSpeaker: () => ({}) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("changes nothing", async () => {
    ready();
    const wearer = person([boots("Moccasins"), gear("Hockey Glove"), gear("Earplugs"), gear("Cup"), gear("Mouthguard"), gear("Eyeglasses"), gear("Radiation Blanket")]);
    expect(skill(wearer, "Stealth")).toEqual([]);
    expect(skill(wearer, "Fast-Talk")).toEqual([]);
    expect(effectsOf(wearer, { badSight: "nearsighted" }).effects).toMatchObject({ hamFisted: 0, hardOfHearing: false, badSight: "nearsighted" });
    expect(knockdown(wearer, "groin")).toEqual([]);
    expect(fire(HOOKS.armorDr, { actor: wearer, hitLocation: "eye", lines: [] }).lines).toEqual([]);
    fire(HOOKS.afterDamage, { actor: wearer, damage: { hitLocation: "skull" }, result: {} });
    await flush();
    expect(chat).toEqual([]);
    expect(fire("gworld.radiationDose", { actor: wearer, rads: 300, protectionFactor: 1, sources: [] }).rads).toBe(300);
    expect(rows.every((r) => !r.visible(boots("Boots")) && !r.visible(gear("Explosives Blanket")) && !r.visible(gear("Homemade Armor, Paper and Tape", { type: "armor" })))).toBe(true);
  });
});

describe("protective oddments (High-Tech pp. 68-71, 225)", () => {
  beforeEach(() => { on = { protectiveOddments: true }; ready(); });

  it("puts worn footwear on Stealth", () => {
    expect(skill(person([boots("Moccasins")]), "Stealth")).toEqual([{ label: expect.stringContaining("Moccasins"), value: 1, source: MODULE_ID }]);
    expect(skill(person([boots("Boots, Blast")]), "Stealth")).toEqual([expect.objectContaining({ value: -1 })]);
    // Carried, not worn.
    expect(skill(person([gear("Moccasins", { type: "armor", system: { locations: ["foot"], equipped: false } })]), "Stealth")).toEqual([]);
    expect(skill(person([boots("Moccasins")]), "Climbing")).toEqual([]);
  });

  it("gives a hockey glove Ham-Fisted 1, to the trait's cap", () => {
    const player = person([gear("Hockey Glove")]);
    expect(effectsOf(player).effects.hamFisted).toBe(1);
    expect(effectsOf(player).sources).toEqual([{ effect: "hamFisted", label: "Hockey Glove", value: 1 }]);
    expect(effectsOf(player, { hamFisted: 2 }).effects.hamFisted).toBe(2);
    expect(effectsOf(person([gear("Hockey Glove", { system: { equipped: false } })])).effects.hamFisted).toBe(0);
  });

  it("gives ear protection Protected Hearing, and the plain ones Hard of Hearing", () => {
    expect(effectsOf(person([gear("Earmuffs")])).effects).toMatchObject({ protectedSense: { hearing: true }, hardOfHearing: true });
    expect(effectsOf(person([gear("Electronic Earplugs", { system: { tl: "8" } })])).effects).toMatchObject({ protectedSense: { hearing: true }, hardOfHearing: false });
  });

  it("gives goggles Nictitating Membrane and tinted lenses Protected Vision", () => {
    expect(effectsOf(person([gear("Tactical Goggles", { system: { tl: "8" } })])).effects).toMatchObject({ nictitatingMembrane: 5, protectedSense: { vision: false } });
    expect(effectsOf(person([gear("Anti-Laser Goggles", { system: { tl: "8" } })])).effects).toMatchObject({ nictitatingMembrane: 4, protectedSense: { vision: true } });
    expect(effectsOf(person([gear("Sunglasses (TL6)", { type: "armor", system: { tl: "6", locations: ["eye"] } })])).effects.protectedSense.vision).toBe(true);
    expect(effectsOf(person([gear("Sunglasses (TL5)", { type: "armor", system: { tl: "5", locations: ["eye"] } })])).effects.protectedSense.vision).toBe(false);
    // A higher membrane of the wearer's own stands.
    expect(effectsOf(person([gear("Dive Mask")]), { nictitatingMembrane: 3 }).effects.nictitatingMembrane).toBe(3);
  });

  it("refuses plain goggles' own eye DR, which is the membrane they give", () => {
    const goggles = gear("Goggles", { type: "armor", system: { tl: "6", locations: ["eye"] } });
    const lines = fire(HOOKS.armorDr, { actor: person([goggles]), hitLocation: "eye", lines: [{ label: "Goggles", dr: 1, applies: true, itemId: "Goggles", source: "armor" }, { label: "Nictitating Membrane", dr: 1, applies: true, source: "natural" }] }).lines;
    expect(lines).toEqual([expect.objectContaining({ label: "Goggles", applies: false }), expect.objectContaining({ source: "natural", applies: true })]);
    expect(effectsOf(person([goggles])).effects.nictitatingMembrane).toBe(1);
  });

  it("adds a cup's +2 and a mouthguard's +1 to knockdown for the location hit", () => {
    const boxer = person([gear("Cup"), gear("Mouthguard")]);
    expect(knockdown(boxer, "groin")).toEqual([{ label: expect.stringContaining("Cup"), value: 2 }]);
    expect(knockdown(boxer, "face")).toEqual([{ label: expect.stringContaining("Mouthguard"), value: 1 }]);
    expect(knockdown(boxer, "skull")).toEqual([]);
    // A knockdown roll with no blow behind it.
    expect(fire(HOOKS.successRollModifiers, { actor: boxer, tags: ["knockdown"], modifiers: [], blow: null }).modifiers).toEqual([]);
    // Another roll.
    expect(fire(HOOKS.successRollModifiers, { actor: boxer, tags: ["skill"], modifiers: [], blow: { hitLocation: "groin" } }).modifiers).toEqual([]);
  });

  it("makes a mouthguard's wearer speak with a disturbing voice", () => {
    const boxer = person([gear("Mouthguard")]);
    expect(skill(boxer, "Fast-Talk")).toEqual([{ label: expect.stringContaining("Mouthguard"), value: -2, source: MODULE_ID }]);
    expect(skill(boxer, "Stealth")).toEqual([]);
  });

  it("corrects Bad Sight with eyeglasses or contact lenses, not broken ones", () => {
    expect(effectsOf(person([gear("Eyeglasses", { system: { tl: "5" } })]), { badSight: "nearsighted" }).effects.badSight).toBeNull();
    expect(effectsOf(person([gear("Contact Lenses")]), { badSight: "farsighted" }).effects.badSight).toBeNull();
    expect(effectsOf(person([gear("Eyeglasses", {}, { [BROKEN_FLAG]: true })]), { badSight: "nearsighted" }).effects.badSight).toBe("nearsighted");
    expect(effectsOf(person([gear("Eyeglasses", { system: { equipped: false } })]), { badSight: "nearsighted" }).effects.badSight).toBe("nearsighted");
  });

  it("gives the eyes DR 1 behind eyeglasses", () => {
    expect(fire(HOOKS.armorDr, { actor: person([gear("Eyeglasses")]), hitLocation: "eye", lines: [] }).lines).toEqual([expect.objectContaining({ label: "Eyeglasses", dr: 1, source: "armor" })]);
    expect(fire(HOOKS.armorDr, { actor: person([gear("Eyeglasses")]), hitLocation: "face", lines: [] }).lines).toEqual([]);
    expect(fire(HOOKS.armorDr, { actor: person([gear("Contact Lenses")]), hitLocation: "eye", lines: [] }).lines).toEqual([]);
  });

  it("breaks eyeglasses on a 1 and knocks them off on 2-3 when the head is hit", async () => {
    const glasses = gear("Eyeglasses");
    const wearer = person([glasses]);
    dieFaces = [3];
    fire(HOOKS.afterDamage, { actor: wearer, damage: { hitLocation: "skull" }, result: {} });
    await flush();
    expect(glasses.system.equipped).toBe(false);
    expect(glasses.flags[MODULE_ID][BROKEN_FLAG]).toBeUndefined();
    expect(chat).toEqual([expect.stringContaining("GlassesKnockedOff")]);

    glasses.system.equipped = true;
    dieFaces = [1];
    fire(HOOKS.afterDamage, { actor: wearer, damage: { hitLocation: "face" }, result: {} });
    await flush();
    expect(glasses.flags[MODULE_ID][BROKEN_FLAG]).toBe(true);
    expect(chat[1]).toContain("GlassesBroken");

    // Broken ones aren't rolled for again; nor a hit elsewhere.
    fire(HOOKS.afterDamage, { actor: wearer, damage: { hitLocation: "eye" }, result: {} });
    const whole = gear("Eyeglasses");
    fire(HOOKS.afterDamage, { actor: person([whole]), damage: { hitLocation: "torso" }, result: {} });
    await flush();
    expect(chat).toHaveLength(2);
    expect(whole.system.equipped).toBe(true);
  });

  it("breaks footwear in, with 2d days of pain on a failure", async () => {
    const pair = boots("Boots");
    const action = row("ht-break-in");
    expect(action.visible(pair)).toBe(true);
    expect(action.visible(gear("Cup"))).toBe(false);
    rollOutcome = { success: false, criticalFailure: false };
    prompt = "good";
    action.run(pair, person([pair]));
    await flush();
    // Hiking-12 beats HT 11 and HT-based Soldier at default; +1 for a good custom-made pair.
    expect(rolled[0]).toMatchObject({ base: 12, skill: "Hiking", modifiers: [expect.objectContaining({ value: 1 })] });
    expect(conditions).toEqual([{ key: "moderatePain", duration: { seconds: 7 * 86_400 } }]);
    expect(pair.flags[MODULE_ID][BROKEN_IN_FLAG]).toBe(true);
    expect(action.visible(pair)).toBe(false);

    const other = boots("Sneakers");
    rollOutcome = { success: false, criticalFailure: true };
    prompt = "";
    row("ht-break-in").run(other, person([other]));
    await flush();
    expect(conditions[1]).toEqual({ key: "terriblePain", duration: { seconds: 7 * 86_400 } });
  });

  it("makes homemade armour with Armoury (Body Armor)", async () => {
    const vest = gear("Homemade Armor, Paper and Tape", { type: "armor", system: { locations: ["torso", "vitals"] } });
    row("ht-homemade-armor").run(vest, person([vest]));
    await flush();
    // At default: IQ-5, +5 for paper.
    expect(rolled[0]).toMatchObject({ base: 5, skill: "Armoury (Body Armor)", modifiers: [expect.objectContaining({ value: 5 })] });
    expect(chat[0]).toContain("PaperSoaks");
  });
});

describe("portable cover (High-Tech p. 72)", () => {
  beforeEach(() => { on = { portableCover: true }; ready(); });

  it("takes a blanket's DR 25 off the damage roll of a charge beneath it", async () => {
    const blanket = gear("Explosives Blanket");
    const action = row("ht-blanket");
    expect(action.visible(blanket)).toBe(true);
    expect(action.visible(gear("Blanket"))).toBe(false);
    prompt = { explosive: "tnt", pounds: 2 };
    action.run(blanket, person([blanket]));
    await flush();
    expect(detonated).toHaveLength(1);
    expect(detonated[0].options).toMatchObject({ explosive: "tnt", weightLbs: 2, placement: "nearby" });
    // 6dx2 laid out as 12d, less the blanket's 25.
    expect(detonated[0].context.formula).toBe("12d");
    expect(detonated[0].context.modifiers).toEqual([{ label: expect.stringContaining("Explosives Blanket"), value: -25 }]);
    // Another damage roll afterwards is untouched.
    expect(fire(HOOKS.damageModifiers, { item: null, label: detonated[0].options.label, formula: "6dx2", modifiers: [] }).modifiers).toEqual([]);
  });

  it("gives a radiation blanket in use PF 3", () => {
    const dose = fire("gworld.radiationDose", { actor: person([gear("Radiation Blanket", { system: { tl: "8" } })]), rads: 300, protectionFactor: 1, sources: [] });
    expect(dose.rads).toBe(100);
    expect(dose.sources).toEqual([expect.stringContaining("Radiation Blanket")]);
    expect(fire("gworld.radiationDose", { actor: person([gear("Explosives Blanket")]), rads: 300, protectionFactor: 1, sources: [] }).rads).toBe(300);
    expect(fire("gworld.radiationDose", { actor: person([gear("Radiation Blanket", { system: { equipped: false } })]), rads: 300, protectionFactor: 1, sources: [] }).rads).toBe(300);
  });

  it("holds a blanket up as cover for its bearer and the targeted characters, from the front", async () => {
    const blanket = gear("Explosives Blanket", { system: { equipped: false } });
    const bearer = { ...person([blanket]), name: "Bearer", uuid: "Actor.bearer" };
    const officer = { ...person([]), name: "Officer", uuid: "Actor.officer" };
    const bystander = { ...person([]), name: "Bystander", uuid: "Actor.bystander" };
    (globalThis as any).game.actors = [bearer, officer, bystander];
    (globalThis as any).game.user = { targets: new Set([{ actor: officer }, { actor: bearer }]) };
    expect(row("ht-blanket-lower").visible(blanket)).toBe(false);
    row("ht-blanket-cover").run(blanket, bearer);
    await flush();
    expect(blanket.flags[MODULE_ID].htCover).toEqual(["Actor.bearer", "Actor.officer"]);
    expect(chat[0]).toContain("Officer");
    expect(row("ht-blanket-cover").visible(blanket)).toBe(false);

    const blow = (actor: any, arc: string | null, preview = false) => fire(HOOKS.armorDr, { actor, hitLocation: "torso", arc, preview, lines: [] }).lines;
    expect(blow(officer, "front")).toEqual([expect.objectContaining({ dr: 25, applies: true, flexible: true, reason: expect.stringContaining("Bearer") })]);
    expect(blow(bearer, null)).toEqual([expect.objectContaining({ dr: 25, applies: true })]);
    expect(blow(officer, "back")).toEqual([expect.objectContaining({ applies: false })]);
    expect(blow(bystander, "front")).toEqual([]);
    // Cover isn't armour worn: the sheet's figures leave it out.
    expect(blow(officer, null, true)).toEqual([]);

    row("ht-blanket-lower").run(blanket, bearer);
    await flush();
    expect(blow(officer, "front")).toEqual([]);
  });

  it("gives PF 3 to everyone exposed while a radiation blanket is laid over the source, once", async () => {
    const blanket = gear("Radiation Blanket", { system: { tl: "8", equipped: false } });
    const tech = { ...person([blanket]), uuid: "Actor.tech" };
    const bystander = { ...person([]), uuid: "Actor.bystander" };
    (globalThis as any).game.actors = [tech, bystander];
    const dose = (actor: any) => fire("gworld.radiationDose", { actor, rads: 300, protectionFactor: 1, sources: [] });
    expect(dose(bystander).rads).toBe(300);
    expect(row("ht-blanket-lay").visible(gear("Explosives Blanket"))).toBe(false);
    row("ht-blanket-lay").run(blanket, tech);
    await flush();
    expect(dose(bystander)).toMatchObject({ rads: 100, sources: [expect.stringContaining("RadiationLaidLine")] });
    // Worn by one of them as well, it counts once.
    expect(dose(person([gear("Radiation Blanket", { system: { tl: "8" } })])).rads).toBe(100);
    row("ht-blanket-lift").run(blanket, tech);
    await flush();
    expect(dose(bystander).rads).toBe(300);
  });
});

describe("protective oddments' own states (High-Tech pp. 70-71)", () => {
  beforeEach(() => { on = { protectiveOddments: true }; ready(); });

  it("gives tinted plain goggles Protected Vision", () => {
    expect(effectsOf(person([gear("Goggles", { type: "armor", system: { tl: "6" } })])).effects.protectedSense.vision).toBe(false);
    expect(effectsOf(person([gear("Goggles", { type: "armor", system: { tl: "6" } }, { htTinted: true })])).effects).toMatchObject({ nictitatingMembrane: 1, protectedSense: { vision: true } });
    // Only plain goggles take the tint.
    expect(effectsOf(person([gear("Tactical Goggles", { system: { tl: "8" } }, { htTinted: true })])).effects.protectedSense.vision).toBe(false);
    expect(sections[0].context(gear("Goggles", { type: "armor" })).tinted).toEqual({ checked: false });
    expect(sections[0].context(gear("Dive Mask")).tinted).toBeNull();
  });

  it("muffles like plain ear protection once electronic ear protection's cells are spent", () => {
    CELL_TABLES.clear();
    CELL_TABLES.register(highTechBatteries());
    setRuleReader((k) => k === `${MODULE_ID}.batteries`);
    try {
      const muffs = (hoursUsed: number) => gear("Electronic Earmuffs", { system: { tl: "8", extensions: { [MODULE_ID]: { power: { draw: { cell: "XS", cells: 1, endurance: "100 hrs.", raw: "XS/100 hrs." }, hoursUsed } } } } });
      expect(effectsOf(person([muffs(40)])).effects).toMatchObject({ protectedSense: { hearing: true }, hardOfHearing: false });
      expect(effectsOf(person([muffs(100)])).effects).toMatchObject({ protectedSense: { hearing: true }, hardOfHearing: true });
      expect(sections[0].context(muffs(100)).lines).toContain("GCC.HT.Oddments.EarsFlatItem");
    } finally {
      setRuleReader(() => false);
      CELL_TABLES.clear();
    }
  });

  it("puts goggles on or takes them off, on a Ready maneuver in combat", async () => {
    const warn = vi.fn();
    vi.stubGlobal("ui", { notifications: { warn } });
    const goggles = gear("Tactical Goggles", { system: { equipped: false } });
    const soldier: any = { ...person([goggles]), id: "soldier", system: { maneuver: "move" } };
    const action = row("ht-eye-protection");
    expect(action.visible(goggles)).toBe(true);
    expect(action.visible(gear("Cup"))).toBe(false);
    // Out of combat: at once.
    action.run(goggles, soldier);
    await flush();
    expect(goggles.system.equipped).toBe(true);
    expect(chat[0]).toContain("Donned");
    // In combat, not on a Ready maneuver: refused.
    (globalThis as any).game.combat = { started: true, combatants: [{ actor: soldier }] };
    action.run(goggles, soldier);
    await flush();
    expect(goggles.system.equipped).toBe(true);
    expect(warn).toHaveBeenCalled();
    soldier.system.maneuver = "ready";
    action.run(goggles, soldier);
    await flush();
    expect(goggles.system.equipped).toBe(false);
    expect(chat[1]).toContain("Doffed");
  });
});
