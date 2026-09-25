/**
 * High-Tech's armour as the system meets it: the partial pieces, the toe box,
 * the tops and the front figures through `gworld.armorDr`, striking around
 * through `gworld.attackModifiers`, the plates through `gworld.afterDamage`,
 * the clothes as a Holdout roll's clothing line through
 * `gworld.successRollModifiers` (API 1.152.0), the concealing contest through
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
  damageModifiers: "gworld.damageModifiers",
  afterDamage: "gworld.afterDamage",
  attackModifiers: "gworld.attackModifiers",
  skillBonuses: "gworld.skillBonuses",
  successRollModifiers: "gworld.successRollModifiers",
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
    registry: { isRuleOn: (k: string) => on[k] === true },
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
    const pads = piece("Shoulder Pads", { dr: 1, locations: ["torso"] }, { coverage: 1, slamPads: true });
    expect(fire(HOOKS.damageModifiers, { actor: person("Player", [pads]), source: "slam", modifiers: [] }).modifiers).toEqual([]);
    expect(prices[0].apply(piece("Plate", {}, { material: "titanium" }), { cost: 100, weight: 30 })).toBeNull();
    const roll = fire(HOOKS.successRollModifiers, { actor: person("Spy", [piece("Long Coat", { equipped: true }, {}, "equipment")]), skill: "Holdout", tags: ["holdout"], modifiers: [] });
    expect(roll.modifiers).toEqual([]);
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

  it("rolls nothing for the sheet's figures: partial pieces and the toe box keep their DR, with a note (API 1.140.0)", () => {
    const guard = piece("Shin Guards", { dr: 4, locations: ["leg"] }, { coverage: 2 });
    const boots = piece("Boots, Steel-Toed", { dr: 2, locations: ["foot"] }, { toeDr: 6 });
    const soldier = person("Soldier", [guard, boots]);
    dice = [6, 6];
    const legs = [line(guard)];
    fire(HOOKS.armorDr, { actor: soldier, hitLocation: "leg", damageType: "cr", preview: true, options: {}, lines: legs });
    expect(legs[0]).toMatchObject({ applies: true, dr: 4, reason: expect.stringContaining("PartialPreview") });
    const feet = [line(boots)];
    fire(HOOKS.armorDr, { actor: soldier, hitLocation: "foot", damageType: "cr", preview: true, options: {}, lines: feet });
    expect(feet[0]).toMatchObject({ dr: 2, reason: expect.stringContaining("ToePreview") });
    expect(dice).toEqual([6, 6]);
  });

  it("gives shoulder pads +1 to a slam's damage and DR 3, whole, against what the slammer takes back (p. 66 note 4; API 1.139.0)", () => {
    const pads = piece("Shoulder Pads", { dr: 1, locations: ["torso", "vitals", "arm"] }, { coverage: 1, slamPads: true });
    const player = person("Player", [pads]);
    const blow = (source: string | null) => fire(HOOKS.damageModifiers, { actor: player, source, modifiers: [] }).modifiers;
    expect(blow("slam")).toEqual([{ label: expect.stringContaining("Shoulder Pads"), value: 1 }]);
    expect(blow("slammed")).toEqual([]);
    expect(blow(null)).toEqual([]);
    dice = [6];
    const back = [line(pads)];
    fire(HOOKS.armorDr, { actor: player, hitLocation: "torso", damageType: "cr", source: "slammed", lines: back });
    expect(back[0]).toMatchObject({ applies: true, dr: 3 });
    expect(dice).toEqual([6]);
    // Where the pads don't reach, they still guard against the slam.
    const skull: any[] = [];
    fire(HOOKS.armorDr, { actor: player, hitLocation: "skull", damageType: "cr", source: "slammed", lines: skull });
    expect(skull).toEqual([expect.objectContaining({ itemId: "Shoulder Pads", dr: 3, applies: true })]);
    // Any other blow: the 1 in 6 is rolled as ever.
    dice = [6];
    const other = [line(pads)];
    fire(HOOKS.armorDr, { actor: player, hitLocation: "torso", damageType: "cr", source: null, lines: other });
    expect(other[0]!.applies).toBe(false);
    // Not worn: nothing.
    const off = person("Off", [piece("Shoulder Pads", { equipped: false }, { slamPads: true })]);
    expect(fire(HOOKS.damageModifiers, { actor: off, source: "slam", modifiers: [] }).modifiers).toEqual([]);
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

  it("turns a one-sided piece worn at the back to meet blows from behind (p. 67)", () => {
    on = { partialCoverage: true, frontArmor: true };
    const front = piece("Trauma Plate", { dr: 25, locations: ["torso", "vitals"], frontOnly: true });
    const back = piece("Trauma Plate (back)", { dr: 25, locations: ["torso", "vitals"], frontOnly: true }, { back: true });
    const cop = person("Cop", [front, back]);
    // From behind the system has turned both away; the back plate comes back.
    const behind: any[] = [];
    fire(HOOKS.armorDr, { actor: cop, hitLocation: "torso", damageType: "pi", arc: "back", lines: behind });
    expect(behind).toEqual([expect.objectContaining({ itemId: "Trauma Plate (back)", dr: 25, applies: true, reason: expect.stringContaining("BackReason") })]);
    // From the front, or from nowhere in particular, the system hands it over and it is refused.
    for (const arc of ["front", null]) {
      const lines = [line(front), line(back)];
      fire(HOOKS.armorDr, { actor: cop, hitLocation: "torso", damageType: "pi", arc, lines });
      expect(lines.map((l) => l.applies)).toEqual([true, false]);
    }
    // Where it doesn't reach, nothing is added.
    const arm: any[] = [];
    fire(HOOKS.armorDr, { actor: cop, hitLocation: "arm", damageType: "pi", arc: "back", lines: arm });
    expect(arm).toEqual([]);
    // Not a one-sided piece: the mark means nothing.
    const vest = piece("Vest", { dr: 12, locations: ["torso"] }, { back: true });
    const lines = [line(vest)];
    fire(HOOKS.armorDr, { actor: person("Guard", [vest]), hitLocation: "torso", damageType: "pi", arc: "front", lines });
    expect(lines[0]!.applies).toBe(true);
  });
});

describe("a plate worn at the back, without front-only armour (the system's frontArmor off)", () => {
  it("leaves the lines as the system sent them, and wears the plate from any side", async () => {
    on = { partialCoverage: true, armorMaterials: true };
    ready();
    const back = piece("Trauma Plate", { dr: 25, locations: ["torso"], frontOnly: true }, { back: true, semiAblative: true });
    const cop = person("Cop", [back]);
    for (const arc of ["front", "back", null]) {
      const lines = [line(back)];
      fire(HOOKS.armorDr, { actor: cop, hitLocation: "torso", damageType: "pi", arc, lines });
      expect(lines).toEqual([expect.objectContaining({ applies: true, dr: 25 })]);
    }
    fire(HOOKS.afterDamage, { actor: cop, damage: { arc: "front" }, result: { hitLocation: "torso", basicDamage: 20, refusedPieces: [] } });
    await flush();
    expect(back.getFlag(MODULE_ID, "htPlateLost")).toBe(2);
  });
});

describe("a plate worn at the back, with the switch off", () => {
  it("is left to the system's front-only reading", () => {
    on = { armorMaterials: true };
    ready();
    const back = piece("Trauma Plate", { dr: 25, locations: ["torso"], frontOnly: true }, { back: true });
    const lines = [line(back)];
    fire(HOOKS.armorDr, { actor: person("Cop", [back]), hitLocation: "torso", damageType: "pi", arc: "front", lines });
    expect(lines[0]!.applies).toBe(true);
    const behind: any[] = [];
    fire(HOOKS.armorDr, { actor: person("Cop", [back]), hitLocation: "torso", damageType: "pi", arc: "back", lines: behind });
    expect(behind).toEqual([]);
  });
});

describe("concealing armour (High-Tech pp. 64, 66)", () => {
  beforeEach(() => { on = { concealedArmor: true }; ready(); });

  it("puts worn clothes' Holdout bonus on a Holdout roll as its clothing line (API 1.152.0)", () => {
    const spy = person("Spy", [piece("Long Coat", { equipped: true }, {}, "equipment"), piece("Undercover Clothing (Ordinary Clothes, +1)", {}, {}, "equipment")]);
    const roll = (actor: any, skill: string, modifiers: any[] = []) => fire(HOOKS.successRollModifiers, { actor, skill, tags: ["holdout"], item: null, modifiers }).modifiers;
    expect(roll(spy, "Holdout")).toEqual([{ key: "clothing", label: expect.stringContaining("Long Coat"), value: 4 }]);
    // The searcher's side of the contest, and other skills, get nothing.
    expect(roll(spy, "Search")).toEqual([]);
    expect(roll(spy, "Stealth")).toEqual([]);
    // What the caller said the character wears: the better of the two, never both.
    expect(roll(spy, "Holdout", [{ key: "clothing", label: "Clothing", value: 2 }])).toEqual([{ key: "clothing", label: expect.stringContaining("Long Coat"), value: 4 }]);
    expect(roll(spy, "Holdout", [{ key: "clothing", label: "Clothing", value: 5 }])).toEqual([{ key: "clothing", label: "Clothing", value: 5 }]);
    // No longer on the skill itself.
    expect(fire(HOOKS.skillBonuses, { actor: spy, name: "Holdout", lines: [] }).lines).toEqual([]);
    const carried = person("Spy", [piece("Long Coat", { equipped: false }, {}, "equipment")]);
    expect(roll(carried, "Holdout")).toEqual([]);
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
    // The coat comes in on the roll's own hook, at default as with the skill.
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([-5]);
    expect(contests[0].second.base).toBe(7);
  });

  it("rolls a contest against each of several searchers, each named on the card", async () => {
    const vest = piece("Concealable Vest", { dr: 12, flexible: true, locations: ["torso"] });
    const spy = person("Spy", [vest], { skills: { Holdout: 14 } });
    const first = person("First", [], { skills: { Search: 12 } });
    const second = person("Second", [], { skills: { Search: 15 } });
    (globalThis as any).game.user.targets = new Set([{ actor: first }, { actor: second }, { actor: spy }, { actor: first }]);
    await concealFromSearch(fakeApi() as never, vest, spy, { partial: () => false, conceal: () => true, materials: () => false });
    expect(contests.map((c) => c.second.actor)).toEqual([first, second]);
    const card = (ChatMessage as any).implementation.create.mock.calls[0][0].content;
    expect(card).toContain("First");
    expect(card).toContain("Second");
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
    on = { armorMaterials: true, frontArmor: true };
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

  it("wears a plate worn at the back only from behind, with partial coverage on", async () => {
    on = { armorMaterials: true, partialCoverage: true, frontArmor: true };
    const plate = piece("Trauma Plate", { dr: 25, locations: ["torso", "vitals"], frontOnly: true }, { semiAblative: true, back: true });
    const cop = person("Cop", [plate]);
    fire(HOOKS.afterDamage, { actor: cop, damage: { arc: "front" }, result: { hitLocation: "torso", basicDamage: 30, refusedPieces: [] } });
    await flush();
    expect(plate.getFlag(MODULE_ID, "htPlateLost")).toBeUndefined();
    fire(HOOKS.afterDamage, { actor: cop, damage: { arc: "back" }, result: { hitLocation: "torso", basicDamage: 30, refusedPieces: [] } });
    await flush();
    expect(plate.getFlag(MODULE_ID, "htPlateLost")).toBe(3);
  });
});
