/**
 * High-Tech's armour as the system meets it: the partial pieces, the toe box,
 * the tops and the front figures through `gworld.armorDr`, striking around
 * through `gworld.attackModifiers`, the plates through `gworld.afterDamage`,
 * the clothes through `gworld.skillBonuses`, the concealing contest through
 * `roll.quickContest`, and the materials as a price modifier and on a
 * shield's object figures -- with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { STRIKE_AROUND_OPTION, concealFromSearch, readyHighTechArmor, sixthsAt } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  armorDr: "gworld.armorDr",
  afterDamage: "gworld.afterDamage",
  attackModifiers: "gworld.attackModifiers",
  skillBonuses: "gworld.skillBonuses",
  objectStats: "gworld.objectStats",
};

let hooks: Map<string, Listener[]>;
let prices: any[];
let options: any[];
let actions: any[];
let contests: any[];
let dice: number[];
let on: Record<string, boolean>;

function fakeApi() {
  return {
    data: { registerPriceModifier: (m: any) => prices.push(m), hooks: { skillBonuses: HOOKS.skillBonuses, objectStats: HOOKS.objectStats } },
    combat: { hooks: HOOKS, registerAttackOption: (o: any) => options.push(o) },
    sheets: { registerSheetSection: () => undefined, registerRowAction: (a: any) => actions.push(a) },
    actors: {
      skillLevel: (actor: any, name: string) => actor.skills?.[name] ?? null,
      attribute: (actor: any, name: string) => actor.attributes?.[name] ?? 10,
    },
    rules: { speedRangeModifier: (yards: number) => (yards <= 2 ? 0 : -2) },
    roll: { quickContest: async (o: any) => { contests.push(o); return { outcome: "first" }; } },
  };
}

/** A flagged document: getFlag, setFlag and unsetFlag on its own flags. */
function flagged<T extends Record<string, any>>(doc: T): T {
  const d: any = doc;
  d.flags ??= {};
  d.getFlag = (scope: string, k: string) => d.flags[scope]?.[k];
  d.setFlag = async (scope: string, k: string, v: unknown) => { d.flags[scope] = { ...(d.flags[scope] ?? {}), [k]: v }; };
  d.unsetFlag = async (scope: string, k: string) => { if (d.flags[scope]) delete d.flags[scope][k]; };
  return d;
}

function piece(id: string, system: Record<string, any>, htArmor: Record<string, unknown> = {}, type = "armor"): any {
  return flagged({
    id,
    name: id,
    type,
    isOwner: true,
    system: { equipped: true, carried: true, dr: 2, flexible: false, locations: [], ...system, extensions: { [MODULE_ID]: type === "shield" ? htArmor : { htArmor } } },
  });
}

function person(name: string, items: any[], more: Record<string, any> = {}): any {
  const map = new Map(items.map((i) => [i.id, i]));
  const actor: any = flagged({ name, uuid: `Actor.${name}`, isOwner: true, items: Object.assign([...items], { get: (id: string) => map.get(id) }), ...more });
  for (const item of items) item.actor = actor;
  return actor;
}

const line = (item: any, dr = Number(item.system.dr)) => ({ label: item.name, dr, applies: true, forceField: false, flexible: item.system.flexible, hardened: 0, itemId: item.id, source: "armor" });

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (k: string) => () => on[k] === true;
  readyHighTechArmor(fakeApi() as never, { partial: rule("partialCoverage"), conceal: rule("concealedArmor"), materials: rule("armorMaterials") });
}

beforeEach(() => {
  hooks = new Map();
  prices = [];
  options = [];
  actions = [];
  contests = [];
  dice = [];
  on = {};
  // Only High-Tech's switches: nothing of Ultra-Tech's or Monster Hunters 1's is registered.
  setRuleReader((k) => on[k.replace(`${MODULE_ID}.`, "")] === true);
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => ((dice.shift() ?? 1) - 1) / 6 + 0.01 } });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, unknown>) => `${k} ${JSON.stringify(data)}` },
    user: { isGM: true, targets: new Set() },
    users: { activeGM: null },
  });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { create: vi.fn(), getSpeaker: () => ({}) } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setRuleReader(() => false);
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const guard = piece("Shin Guards", { dr: 4, locations: ["leg"] }, { coverage: 2, material: "steel" });
    const soldier = person("Soldier", [guard]);
    const lines = [line(guard)];
    fire(HOOKS.armorDr, { actor: soldier, hitLocation: "leg", damageType: "cr", lines });
    expect(lines).toEqual([line(guard)]);
    expect(prices[0].apply(piece("Plate", {}, { material: "titanium" }), { cost: 100, weight: 30 })).toBeNull();
    const skill = fire(HOOKS.skillBonuses, { actor: person("Spy", [piece("Long Coat", {}, {}, "equipment")]), name: "Holdout", lines: [] });
    expect(skill.lines).toEqual([]);
    expect(actions.every((a) => !a.visible(guard))).toBe(true);
    expect(options[0].available()).toBe(false);
  });
});

describe("partial coverage (High-Tech p. 69)", () => {
  beforeEach(() => { on = { partialCoverage: true }; ready(); });

  it("rolls 1d against the sixths the partial pieces there add up to", () => {
    const guard = piece("Shin Guards", { dr: 4, locations: ["leg"] }, { coverage: 2 });
    const legs = piece("Aircrew Leg Armor", { dr: 15, locations: ["leg"] }, { coverage: 3 });
    const soldier = person("Soldier", [guard, legs]);
    expect(sixthsAt(soldier, "leg")).toBe(5);

    dice = [5];
    let lines = [line(guard), line(legs)];
    fire(HOOKS.armorDr, { actor: soldier, hitLocation: "leg", damageType: "pi", lines });
    expect(lines.map((l) => l.applies)).toEqual([true, true]);
    expect(lines[0]!).toMatchObject({ reason: expect.stringContaining("PartialStood") });

    dice = [6];
    lines = [line(guard), line(legs)];
    fire(HOOKS.armorDr, { actor: soldier, hitLocation: "leg", damageType: "pi", lines });
    expect(lines.map((l) => l.applies)).toEqual([false, false]);
  });

  it("lets a whole piece stand beside the partial ones", () => {
    const guard = piece("Shin Guards", { dr: 4, locations: ["leg"] }, { coverage: 2 });
    const trousers = piece("Ballistic Leggings", { dr: 12, locations: ["leg"] });
    const soldier = person("Soldier", [guard, trousers]);
    dice = [4];
    const lines = [line(guard), line(trousers)];
    fire(HOOKS.armorDr, { actor: soldier, hitLocation: "leg", damageType: "pi", lines });
    expect(lines.map((l) => l.applies)).toEqual([false, true]);
  });

  it("strikes around the partial armour at -(n-1), and the blow passes it", async () => {
    const legs = piece("Aircrew Leg Armor", { dr: 15, locations: ["leg"] }, { coverage: 3 });
    const pilot = person("Pilot", [legs]);
    const gun = flagged({ id: "gun", name: "Pistol" }) as any;
    const shooter = person("Shooter", [gun]);
    const chosen = { [`${MODULE_ID}.${STRIKE_AROUND_OPTION}`]: true };
    const attack = fire(HOOKS.attackModifiers, { actor: shooter, item: gun, options: chosen, calledShot: { hitLocation: "leg" }, targets: [pilot], modifiers: [] });
    expect(attack.modifiers).toEqual([{ label: expect.stringContaining("StrikeAroundLine"), value: -2 }]);
    await flush();
    // Nothing is kept on the attacker: the blow carries its options and called shot (API 1.108.0).
    expect(shooter.getFlag(MODULE_ID, "htStrikeAround")).toBeUndefined();

    dice = [1];
    const lines = [line(legs)];
    fire(HOOKS.armorDr, { actor: pilot, item: gun, hitLocation: "leg", damageType: "pi", calledShot: { hitLocation: "leg", addonLocation: null, chink: false }, options: chosen, lines });
    expect(lines[0]).toMatchObject({ applies: false, reason: expect.stringContaining("StruckAround") });
    // A blow that landed elsewhere (a miss by 1): the armour there is rolled for as usual.
    const arm = [line(legs)];
    fire(HOOKS.armorDr, { actor: pilot, item: gun, hitLocation: "arm", damageType: "pi", calledShot: { hitLocation: "leg", addonLocation: null, chink: false }, options: chosen, lines: arm });
    expect(arm[0]!.applies).toBe(true);
    // A blow without the option rolls for the partial armour.
    dice = [6];
    const plain = [line(legs)];
    fire(HOOKS.armorDr, { actor: pilot, item: gun, hitLocation: "leg", damageType: "pi", calledShot: { hitLocation: "leg", addonLocation: null, chink: false }, options: {}, lines: plain });
    expect(plain[0]).toMatchObject({ applies: false, reason: expect.stringContaining("PartialMissed") });
  });

  it("finds nothing to strike around on a wholly armoured location", () => {
    const vest = piece("Vest", { dr: 12, locations: ["torso"] });
    const shooter = person("Shooter", []);
    const attack = fire(HOOKS.attackModifiers, { actor: shooter, item: null, options: { [`${MODULE_ID}.${STRIKE_AROUND_OPTION}`]: true }, calledShot: null, targets: [person("Cop", [vest])], modifiers: [] });
    expect(attack.modifiers).toEqual([{ label: expect.stringContaining("StrikeAroundNothing"), value: 0 }]);
  });

  it("gives a steel toe box's DR on 2 in 6 foot hits, not from below", () => {
    const boots = piece("Boots, Steel-Toed", { dr: 2, locations: ["foot"] }, { toeDr: 6 });
    const worker = person("Worker", [boots]);
    dice = [2];
    let lines = [line(boots)];
    fire(HOOKS.armorDr, { actor: worker, hitLocation: "foot", damageType: "cr", lines });
    expect(lines[0]!.dr).toBe(6);
    dice = [3];
    lines = [line(boots)];
    fire(HOOKS.armorDr, { actor: worker, hitLocation: "foot", damageType: "cr", lines });
    expect(lines[0]!.dr).toBe(2);
    dice = [1];
    lines = [line(boots)];
    fire(HOOKS.armorDr, { actor: worker, hitLocation: "foot", damageType: "cr", fromBelow: true, lines });
    expect(lines[0]!.dr).toBe(2);
  });

  it("covers 3 in 6 of the legs with high boots' tops turned up", () => {
    const boots = piece("Boots, High", { dr: 2, flexible: true, locations: ["foot"] }, { topsUp: true });
    const pirate = person("Pirate", [boots]);
    dice = [3];
    const lines: any[] = [];
    fire(HOOKS.armorDr, { actor: pirate, hitLocation: "leg", damageType: "cut", lines });
    expect(lines).toEqual([expect.objectContaining({ dr: 2, applies: true, itemId: "Boots, High", flexible: true })]);
    dice = [4];
    const missed: any[] = [];
    fire(HOOKS.armorDr, { actor: pirate, hitLocation: "leg", damageType: "cut", lines: missed });
    expect(missed[0].applies).toBe(false);
  });

  it("raises the DR a piece gives from the front", () => {
    const suit = piece("Bomb Disposal Suit", { dr: 5, flexible: true }, { frontDr: 20, frontLocations: ["torso", "vitals", "groin", "neck"] });
    const tech = person("Tech", [suit]);
    const at = (hitLocation: string, arc: string | null) => {
      const lines = [line(suit)];
      fire(HOOKS.armorDr, { actor: tech, hitLocation, damageType: "cr", arc, lines });
      return lines[0]!.dr;
    };
    expect(at("torso", "front")).toBe(20);
    expect(at("torso", null)).toBe(20);
    expect(at("torso", "back")).toBe(5);
    expect(at("arm", "front")).toBe(5);
  });
});

describe("concealing armour (High-Tech pp. 64, 66)", () => {
  beforeEach(() => { on = { concealedArmor: true }; ready(); });

  it("adds worn clothes' Holdout bonus to the skill", () => {
    const spy = person("Spy", [piece("Long Coat", { equipped: true }, {}, "equipment"), piece("Undercover Clothing (Ordinary Clothes, +1)", {}, {}, "equipment")]);
    expect(fire(HOOKS.skillBonuses, { actor: spy, name: "Holdout", lines: [] }).lines).toEqual([{ label: expect.stringContaining("Long Coat"), value: 4, source: MODULE_ID }]);
    expect(fire(HOOKS.skillBonuses, { actor: spy, name: "Stealth", lines: [] }).lines).toEqual([]);
    const carried = person("Spy", [piece("Long Coat", { equipped: false }, {}, "equipment")]);
    expect(fire(HOOKS.skillBonuses, { actor: carried, name: "Holdout", lines: [] }).lines).toEqual([]);
  });

  it("rolls Holdout at -DR/3 for a flexible vest, less its design, against Search at range", async () => {
    const vest = piece("Advanced Body Armor", { dr: 35, flexible: true, locations: ["torso", "vitals"] }, { concealment: 4 });
    const spy = person("Spy", [vest], { skills: { Holdout: 14 } });
    const guard = person("Guard", [], { skills: { Search: 12 } });
    (globalThis as any).game.user.targets = new Set([{ actor: guard }]);
    await concealFromSearch(fakeApi() as never, vest, spy, { partial: () => false, conceal: () => true, materials: () => false });
    expect(contests).toHaveLength(1);
    expect(contests[0].first).toMatchObject({ actor: spy, base: 14, note: "Holdout" });
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([-12, 4]);
    expect(contests[0].second).toMatchObject({ actor: guard, base: 12, note: "Search" });
  });

  it("needs a searcher, and a rigid piece's whole DR at default", async () => {
    const plate = piece("Steel Vest", { dr: 5, flexible: false, locations: ["torso"] });
    const coat = piece("Long Coat", { equipped: true }, {}, "equipment");
    const man = person("Man", [plate, coat], { attributes: { IQ: 11 } });
    await concealFromSearch(fakeApi() as never, plate, man, { partial: () => false, conceal: () => true, materials: () => false });
    expect(contests).toEqual([]);
    const searcher = person("Searcher", [], { attributes: { Per: 12 } });
    (globalThis as any).game.user.targets = new Set([{ actor: searcher }]);
    await concealFromSearch(fakeApi() as never, plate, man, { partial: () => false, conceal: () => true, materials: () => false });
    expect(contests[0].first.base).toBe(6);
    // The coat counts at default, since the skill's lines don't reach it.
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([-5, 4]);
    expect(contests[0].second.base).toBe(7);
  });
});

describe("materials (High-Tech pp. 65, 67)", () => {
  beforeEach(() => { on = { armorMaterials: true }; ready(); });

  it("reprices a titanium plate and a steel shield's DR", () => {
    const plate = piece("Plate Armor", { dr: 6 }, { material: "titanium" });
    expect(prices[0].apply(plate, { cost: 4000, weight: 90 })).toMatchObject({ cost: 20000, weight: 30 });
    const shield = piece("Medium Shield", {}, { htMaterial: "steel" }, "shield");
    const stats = fire(HOOKS.objectStats, { item: shield, dr: 4, hp: 30, ht: 12, notes: [] });
    expect(stats.dr).toBe(8);
  });

  it("doubles steel's DR and gives smart foam its own", () => {
    const mail = piece("Mail Shirt", { dr: 4, flexible: true }, { material: "steel" });
    const foam = piece("Cloth Armor", { dr: 1, flexible: true }, { material: "smartFoam" });
    const knight = person("Knight", [mail, foam]);
    const lines = [line(mail), line(foam)];
    fire(HOOKS.armorDr, { actor: knight, hitLocation: "torso", damageType: "cr", lines });
    expect(lines.map((l) => l.dr)).toEqual([8, 4]);
  });

  it("wears a semi-ablative plate down a point per 10 basic damage, until it is replaced", async () => {
    const plate = piece("Trauma Plate", { dr: 25, locations: ["torso", "vitals"], frontOnly: true }, { semiAblative: true });
    const cop = person("Cop", [plate]);
    fire(HOOKS.afterDamage, { actor: cop, damage: { arc: "front" }, result: { hitLocation: "torso", basicDamage: 23, refusedPieces: [] } });
    await flush();
    expect(plate.getFlag(MODULE_ID, "htPlateLost")).toBe(2);
    // From behind, a front plate isn't struck.
    fire(HOOKS.afterDamage, { actor: cop, damage: { arc: "back" }, result: { hitLocation: "torso", basicDamage: 40, refusedPieces: [] } });
    await flush();
    expect(plate.getFlag(MODULE_ID, "htPlateLost")).toBe(2);
    const lines = [line(plate)];
    fire(HOOKS.armorDr, { actor: cop, hitLocation: "torso", damageType: "pi", lines });
    expect(lines[0]!.dr).toBe(23);
    const replace = actions.find((a) => a.key === "ht-replace-plate");
    expect(replace.visible(plate)).toBe(true);
    await replace.run(plate, cop);
    expect(plate.getFlag(MODULE_ID, "htPlateLost")).toBeUndefined();
  });
});
