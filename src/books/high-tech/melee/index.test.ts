/**
 * High-Tech's melee and muscle-powered weapons as the system meets them:
 * prices, derived rows, row changes, the bayonet's Ready maneuvers, a stun
 * weapon's hold and the armour against it -- with only High-Tech's switches
 * on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { resetStunners } from "../../../shared/stunners/index.js";
import { bowSound, readyHighTechMelee } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  shotsEntry: "gworld.shotsEntry",
  breakageOdds: "gworld.breakageOdds",
  afflictionEffect: "gworld.afflictionEffect",
  afterSuccessRoll: "gworld.afterSuccessRoll",
  successRollModifiers: "gworld.successRollModifiers",
  armorDr: "gworld.armorDr",
};

let hooks: Map<string, Listener[]>;
let derived: Map<string, any>;
let actions: Map<string, any>;
let options: Map<string, any>;
let prices: any[];
let chat: string[];
let weaponState: Map<any, any>;
let removed: string[];
let on: Record<string, boolean>;
let fastDrawSuccess: boolean;

function fakeApi() {
  return {
    rules,
    registry: { isRuleOn: () => false },
    data: { registerPriceModifier: (m: any) => prices.push(m) },
    combat: {
      hooks: HOOKS,
      registerDerivedAttackMode: (m: any) => derived.set(m.key, m),
      registerAttackOption: (o: any) => options.set(o.key, o),
      getWeaponState: (item: any) => weaponState.get(item),
      setWeaponState: async (item: any, _m: string, patch: any) => { weaponState.set(item, { ...weaponState.get(item), ...patch }); },
    },
    sheets: { registerSheetSection: () => undefined, registerRowAction: (a: any) => actions.set(a.key, a) },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      conditions: () => [{ id: `${MODULE_ID}.ht-contact-shock` }, { id: "stunned" }],
      removeCondition: async (_a: any, id: string) => { removed.push(id); },
    },
    roll: { success: async () => ({ success: fastDrawSuccess }) },
  };
}

function weapon(name: string, system: Record<string, any> = {}, extensions: Record<string, unknown> = {}): any {
  return { id: name, name, type: "equipment", isOwner: true, system: { tl: "7", quality: "good", meleeModes: [], rangedModes: [], extensions: { [MODULE_ID]: extensions }, ...system } };
}

const rifle = (tl = "7", firearm: Record<string, unknown> = { bayonet: true, bayonetWeight: 0.9, bayonetCost: 20 }, shots = "30+1(3)") =>
  weapon("Rifle", { tl, weaponClass: "firearm", rangedModes: [{ skill: "Guns (Rifle)", shots, malfunction: 17 }] }, { firearm });
const knife = (name: string, weight: number, htWeapon: Record<string, unknown> = {}, more: Record<string, any> = {}) =>
  weapon(name, { weight, cost: 550, listCost: 550, meleeModes: [{ skill: "Broadsword", damageType: "cut" }, { skill: "Broadsword", damageType: "imp" }], ...more }, { htWeapon });

const soldier = { name: "Soldier", attributes: { HT: 12, DX: 12 }, skills: {} as Record<string, number> };
const helpers = { skillLevel: (name: string) => (name === "Staff" ? 13 : null), attribute: (key: string) => (key === "DX" ? 12 : 10), damage: (base: string, modifier: number) => `1d${modifier >= 0 ? "+" : ""}${modifier}${base === "sw" ? "[sw]" : ""}` };

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyHighTechMelee(fakeApi() as never, { bayonets: rule("bayonets"), sheaths: rule("sheaths"), blades: rule("bladeComposition"), stun: rule("stunWeapons"), bows: rule("highTechBows") });
}

function rows(item: any, entries: any[]): any[] {
  fire(HOOKS.weaponAttacks, { actor: soldier, item, rows: entries });
  return entries.map((e) => e.row);
}

beforeEach(() => {
  hooks = new Map();
  derived = new Map();
  actions = new Map();
  options = new Map();
  prices = [];
  chat = [];
  weaponState = new Map();
  removed = [];
  on = {};
  fastDrawSuccess = false;
  resetStunners();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetStunners();
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    expect(prices[0].apply(rifle(), { cost: 700, weight: 9 })).toBeNull();
    expect(prices[0].apply(knife("Katana", 3.75, { sheath: "none", blade: "ceramic" }), { cost: 550, weight: 3.75 })).toBeNull();
    expect(derived.get("ht-rifle-butt").applies(rifle())).toBe(false);
    expect(derived.get("ht-sheath-swing").applies(knife("Katana", 3.75))).toBe(false);
    expect(actions.get("ht-fix-bayonet").visible(rifle())).toBe(false);
    const row = { skillLevel: 12, notes: [] };
    rows(rifle(), [{ kind: "ranged", mode: {}, row }]);
    expect(row.skillLevel).toBe(12);
  });
});

describe("bayonets (pp. 196-199)", () => {
  beforeEach(() => { on = { bayonets: true }; ready(); });

  it("puts the bayonet's weight and price on the gun", () => {
    expect(prices[0].apply(rifle(), { cost: 700, weight: 9 })).toMatchObject({ cost: 720, weight: 9.9 });
  });

  it("fixes it in four Ready maneuvers, or three after Fast-Draw (Knife)", async () => {
    const gun = rifle();
    const fix = actions.get("ht-fix-bayonet");
    for (let i = 0; i < 3; i += 1) { fix.run(gun, soldier); await flush(); }
    expect(derived.get("ht-bayonet").applies(gun)).toBe(false);
    fix.run(gun, soldier);
    await flush();
    expect(derived.get("ht-bayonet").applies(gun)).toBe(true);
    expect(chat.at(-1)).toContain("BayonetFixed");

    const quick = rifle();
    fastDrawSuccess = true;
    const drawer = { ...soldier, skills: { "Fast-Draw (Knife)": 14 } };
    for (let i = 0; i < 3; i += 1) { fix.run(quick, drawer); await flush(); }
    expect(weaponState.get(quick).bayonetFixed).toBe(true);
    fix.run(quick, drawer);
    await flush();
    expect(weaponState.get(quick).bayonetFixed).toBe(false);
  });

  it("gives a fixed long arm a Spear thrust+3 row and -1 on its Guns rows", () => {
    const gun = rifle("5");
    weaponState.set(gun, { bayonetFixed: true });
    const row = derived.get("ht-bayonet").mode(gun, soldier, helpers);
    // Spear at default from Staff-2 beats DX-5.
    expect(row).toMatchObject({ skillName: "Spear", skillLevel: 11, damage: "1d+3", damageType: "imp", reach: "1,2*", twoHanded: true });
    expect(derived.get("ht-bayonet-swing").applies(gun)).toBe(false);
    const [ranged] = rows(gun, [{ kind: "ranged", mode: {}, row: { skillLevel: 12, notes: [] } }]);
    expect(ranged.skillLevel).toBe(11);
    expect(options.get("ht-bayonet-unfamiliar").available({ mode: { derived: `${MODULE_ID}.ht-bayonet` } })).toBe(true);
  });

  it("slows a fixed muzzleloader's reload by a tenth", () => {
    const musket = weapon("Brown Bess", { tl: "5", weaponClass: "firearm", rangedModes: [{ skill: "Guns (Musket)", shots: "1(15)", rateOfFire: 1 }] }, { firearm: { bayonet: true, loadingType: "muzzleloader" } });
    weaponState.set(musket, { bayonetFixed: true });
    const context = fire(HOOKS.shotsEntry, { item: musket, modeIndex: 0, entry: { reloadSeconds: 15, capacity: 1 } });
    expect(context.entry.reloadSeconds).toBe(17);
    const loose = rifle();
    expect(fire(HOOKS.shotsEntry, { item: loose, modeIndex: 0, entry: { reloadSeconds: 3, capacity: 30 } }).entry.reloadSeconds).toBe(3);
  });

  it("gives every shoulder arm its butt and a swing by the barrel", () => {
    const gun = rifle("7", {});
    expect(derived.get("ht-rifle-butt").applies(gun)).toBe(true);
    expect(derived.get("ht-rifle-butt").mode(gun, soldier, helpers)).toMatchObject({ skillName: "Staff", skillLevel: 13, damage: "1d+2", reach: "1" });
    expect(derived.get("ht-rifle-club").mode(gun, soldier, helpers).notes[0].label).toBe("GCC.HT.Melee.ClubNote");
    const musket = weapon("Musket", { tl: "5", weaponClass: "firearm", rangedModes: [{ skill: "Guns (Musket)", shots: "1(15)" }] });
    expect(derived.get("ht-rifle-club").mode(musket, soldier, helpers).notes).toBeUndefined();
    const pistol = weapon("Pistol", { weaponClass: "firearm", rangedModes: [{ skill: "Guns (Pistol)", shots: "7+1(3)" }] });
    expect(derived.get("ht-rifle-butt").applies(pistol)).toBe(false);
  });

  it("turns the NRS-2 round to shoot", async () => {
    const nrs = weapon("TsNIITochMash NRS-2, 7.62x42mm", { meleeModes: [{ skill: "Knife" }], rangedModes: [{ skill: "Guns (Pistol)" }] });
    expect(fire(HOOKS.attackModifiers, { item: nrs, mode: { index: 0, ranged: true }, refusal: null }).refusal).toContain("NotReversed");
    actions.get("ht-reverse-knife").run(nrs, soldier);
    await flush();
    expect(fire(HOOKS.attackModifiers, { item: nrs, mode: { index: 0, ranged: true }, refusal: null }).refusal).toBeNull();
    expect(fire(HOOKS.attackModifiers, { item: nrs, mode: { index: 0, ranged: false }, refusal: null }).refusal).toContain("IsReversed");
  });

  it("notes the tomahawk's spike as a pick", () => {
    const [spike] = rows(weapon("Spiked Tomahawk"), [{ kind: "melee", mode: {}, row: { damageType: "imp", notes: [] } }]);
    expect(spike.notes[0].label).toBe("GCC.HT.Melee.PickNote");
  });
});

describe("sheaths (p. 198)", () => {
  beforeEach(() => { on = { sheaths: true }; ready(); });

  it("weighs the blade alone without a rigid sheath", () => {
    expect(prices[0].apply(knife("Katana", 3.75, { sheath: "flexible" }), { cost: 550, weight: 3.75 })).toMatchObject({ weight: 2.5 });
    expect(prices[0].apply(knife("Sword Cane", 1.5, { sheath: "none", sheathWeight: 1 }), { cost: 600, weight: 1.5 })).toMatchObject({ weight: 0.5 });
    expect(prices[0].apply(knife("Katana", 3.75), { cost: 550, weight: 3.75 })).toBeNull();
  });

  it("makes a rigid sheath of a pound or more a baton that breaks as cheap", () => {
    const katana = knife("Katana", 3.75);
    expect(derived.get("ht-sheath-swing").applies(katana)).toBe(true);
    expect(derived.get("ht-sheath-thrust").mode(katana, soldier, helpers)).toMatchObject({ skillName: "Shortsword", damageType: "cr", reach: "1", quality: "cheap", weight: 1.25 });
    expect(derived.get("ht-sheath-swing").applies(knife("Survival Knife", 1))).toBe(false);
    expect(derived.get("ht-sheath-swing").applies(knife("Katana", 3.75, { sheath: "flexible" }))).toBe(false);
  });
});

describe("blade composition (pp. 196-198)", () => {
  beforeEach(() => { on = { bladeComposition: true }; ready(); });

  it("reprices ceramic and titanium blades", () => {
    expect(prices[0].apply(knife("Knife", 1, { blade: "ceramic" }), { cost: 40, weight: 1 })).toMatchObject({ cost: 120, weight: 0.5 });
    expect(prices[0].apply(knife("Knife", 1, { blade: "titanium" }), { cost: 40, weight: 1 })).toMatchObject({ cost: 80, weight: 0.75 });
  });

  it("prices a stainless sword's grade from list", () => {
    const fine = knife("Katana", 3.75, { blade: "stainless" }, { tl: "7", quality: "fine", cost: 550 });
    expect(prices[0].apply(fine, { cost: 550, weight: 3.75 })).toMatchObject({ cost: 4400 });
    expect(prices[0].apply(knife("Katana", 3.75, { blade: "stainless" }, { tl: "7", quality: "good" }), { cost: 220, weight: 3.75 })).toMatchObject({ cost: 550 });
  });

  it("breaks ceramic as cheap and titanium as very fine, while the grade is the blade's own", () => {
    const ceramic = knife("Knife", 1, { blade: "ceramic" });
    expect(fire(HOOKS.breakageOdds, { item: ceramic, quality: "good" }).breakage).toBe(2);
    expect(fire(HOOKS.breakageOdds, { item: knife("Knife", 1, { blade: "titanium" }), quality: "good" }).breakage).toBe(-2);
    expect(fire(HOOKS.breakageOdds, { item: ceramic, quality: "cheap", breakage: undefined }).breakage).toBeUndefined();
  });

  it("fights a sword cane a grade lower than paid for", () => {
    const cane = weapon("Sword Cane", { quality: "fine", meleeModes: [{ skill: "Smallsword", damageType: "imp" }] });
    const [row] = rows(cane, [{ kind: "melee", mode: {}, row: { damage: "1d+1", damageType: "imp", notes: [] } }]);
    expect(row.damage).toBe("1d");
    expect(fire(HOOKS.breakageOdds, { item: cane, quality: "fine" }).breakage).toBe(0);
  });
});

describe("stun weapons (p. 199)", () => {
  beforeEach(() => { on = { stunWeapons: true }; ready(); });

  it("burns with the cattle prod only where no worn armour covers the spot (p. 199)", () => {
    const prod = weapon("Cattle Prod", { meleeModes: [{ skill: "Shortsword", damageType: "burn" }] });
    const blow = (lines: any[], more: Record<string, unknown> = {}) => fire(HOOKS.armorDr, { actor: soldier, item: prod, mode: { index: 0, ranged: false }, hitLocation: "torso", damageType: "burn", basicDamage: 3, lines, ...more }).lines;
    // A jacket with DR stops it all; the line says why.
    const covered = blow([{ label: "Leather Jacket", dr: 1, applies: true, source: "armor" }]);
    expect(covered.at(-1)).toMatchObject({ label: expect.stringContaining("ProdProtected"), dr: 3, applies: true });
    // Bare skin, clothing of DR 0, natural DR, or a refused piece: the burn stands.
    for (const lines of [[], [{ label: "Shirt", dr: 0, applies: true, source: "armor" }], [{ label: "Tough Skin", dr: 2, applies: true, source: "natural" }], [{ label: "Vest", dr: 5, applies: false, source: "armor" }]]) {
      expect(blow(lines)).toHaveLength(lines.length);
    }
    // Not the prod's burn: nothing.
    expect(blow([{ label: "Jacket", dr: 1, applies: true, source: "armor" }], { damageType: "cr" })).toHaveLength(1);
    expect(fire(HOOKS.armorDr, { actor: soldier, item: weapon("Stun Baton"), damageType: "burn", basicDamage: 3, lines: [{ label: "Jacket", dr: 1, applies: true }] }).lines).toHaveLength(1);
  });

  it("holds the stun while in contact and (20 - HT) seconds after, then HT-3", async () => {
    const baton = weapon("Stun Baton", { meleeModes: [{ skill: "Shortsword", damageType: "cr", linked: { affliction: true } }] });
    fire(HOOKS.attackModifiers, { item: baton, mode: { index: 0, ranged: false }, options: { [`${MODULE_ID}.ht-contact-hold`]: 3 }, refusal: null });
    await flush();
    const context = fire(HOOKS.afflictionEffect, { actor: soldier, item: baton, effects: [] });
    expect(context.effects[0]).toEqual({ key: "stunned", holdRecovery: { seconds: 11 } });
    expect(context.effects[1].effects.modifiers[0]).toMatchObject({ value: -3, rolls: ["stunRecovery"] });
    fire(HOOKS.afterSuccessRoll, { actor: soldier, tags: ["stunRecovery"], outcome: { success: true } });
    expect(removed).toEqual([`${MODULE_ID}.ht-contact-shock`]);
  });

  // The system's own line on the roll to resist (Characters p. 35; API 1.105.0): DR over the row's divisor.
  const drLine = (value: number) => ({ key: "afflictionDr", label: "DR", value });
  const resist = (actor: any, item: any, dr: number, lines: any[]) =>
    fire(HOOKS.successRollModifiers, { actor, tags: ["resist", "affliction"], attack: { item, mode: { index: 0, ranged: false }, dr, drBonus: lines[0]?.value ?? 0, drCounted: lines.length > 0 }, modifiers: lines }).modifiers;

  it("counts the victim's armour once, on the system's DR line, metallic armour as DR 1", () => {
    const gun = weapon("Stun Gun", { meleeModes: [{ skill: "Shortsword", affliction: true, armorDivisor: 0.5 }] });
    // DR 3 at (0.5): the system's +6 is the book's +6, and stays the only line.
    expect(resist({ items: [] }, gun, 3, [drLine(6)])).toEqual([drLine(6)]);
    // Mail's DR 4 is DR 1 against the shock: +2, not the system's +8 and not a second line.
    const mail = { items: [{ type: "armor", name: "Mail Shirt", system: { equipped: true } }] };
    const held = resist(mail, gun, 4, [drLine(8)]);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ key: "afflictionDr", value: 2 });
    // The victim's own DR 1 still counts in full beside the mail's DR 1: +4.
    expect(resist(mail, gun, 4, [drLine(10)])[0]).toMatchObject({ key: "afflictionDr", value: 4 });
  });

  it("adds no DR where the system gave none, and leaves another book's stunner alone", () => {
    const gun = weapon("Stun Gun", { meleeModes: [{ skill: "Shortsword", affliction: true, armorDivisor: 0.5 }] });
    expect(resist({ items: [] }, gun, 3, [])).toEqual([]);
    const mail = { items: [{ type: "armor", name: "Mail Shirt", system: { equipped: true } }] };
    expect(resist(mail, weapon("Stun Wand"), 4, [drLine(8)])).toEqual([drLine(8)]);
  });

  it("gives the shock's (0.5) where a record's row carries no divisor", () => {
    const prod = weapon("Cattle Prod", { meleeModes: [{ skill: "Spear", linked: { affliction: true } }] });
    expect(resist({ items: [] }, prod, 3, [drLine(3)])[0]).toMatchObject({ key: "afflictionDr", value: 6 });
  });
});

describe("high-tech bows (p. 201)", () => {
  beforeEach(() => { on = { highTechBows: true }; ready(); });

  const longbow = (htWeapon: Record<string, unknown>) => weapon("Longbow", { weaponClass: "bow", rangedModes: [{ skill: "Bow", damageBase: "thr", rangeIsStMultiple: true, minSt: 11 }] }, { htWeapon });

  it("builds a bow compound: double cost, two ST more", () => {
    expect(prices[0].apply(longbow({ compound: true, sights: true, silencers: true }), { cost: 200, weight: 3 })).toMatchObject({ cost: 501 });
    const bow = longbow({ compound: true });
    const [row] = rows(bow, [{ kind: "ranged", mode: bow.system.rangedModes[0], basis: { st: 11 }, row: { damage: "1d+2", halfDamageRange: 165, maxRange: 220, accuracy: 3, notes: [] } }]);
    // Thrust at ST 11 is 1d-1, at 13 1d.
    expect(row).toMatchObject({ damage: "1d+3", halfDamageRange: 195, maxRange: 260 });
    expect(prices[0].apply(weapon("Compound Longbow", { rangedModes: [{ skill: "Bow" }] }, { htWeapon: { compound: true } }), { cost: 400, weight: 3 })).toBeNull();
  });

  it("gives sights +1 Acc only to an archer who knows the skill", () => {
    const bow = longbow({ sights: true });
    const [skilled, unskilled] = rows(bow, [
      { kind: "ranged", mode: bow.system.rangedModes[0], basis: { st: 11 }, row: { accuracy: 3, notes: [] } },
      { kind: "ranged", mode: bow.system.rangedModes[0], basis: { st: 11 }, row: { accuracy: 3, atDefault: true, notes: [] } },
    ]);
    expect(skilled.accuracy).toBe(4);
    expect(unskilled.accuracy).toBe(3);
  });

  it("offers a Hearing roll for a bow's or crossbow's shot: 4 or 8 yards, a bow's silencers -2 (pp. 158, 201)", () => {
    const action = actions.get("ht-bow-heard");
    const crossbow = weapon("Crossbow", { rangedModes: [{ skill: "Crossbow" }] }, { htWeapon: { silencers: true } });
    expect(action.visible(longbow({}))).toBe(true);
    expect(action.visible(crossbow)).toBe(true);
    expect(action.visible(rifle())).toBe(false);
    expect(bowSound(longbow({ silencers: true }))).toMatchObject({ heardAt: 4, lines: [{ value: -2 }] });
    expect(bowSound(longbow({}))).toMatchObject({ heardAt: 4, lines: [] });
    expect(bowSound(crossbow)).toMatchObject({ heardAt: 8, lines: [] });
  });

  it("gives a slingshot's metal shot +1 damage and double range", () => {
    const sling = weapon("Slingshot", { rangedModes: [{ skill: "Bow (Slingshot)" }] }, { htWeapon: { shot: "metal" } });
    const [row] = rows(sling, [{ kind: "ranged", mode: sling.system.rangedModes[0], basis: { st: 6 }, row: { damage: "1d-1", halfDamageRange: 60, maxRange: 100, notes: [] } }]);
    expect(row).toMatchObject({ damage: "1d", halfDamageRange: 120, maxRange: 200 });
  });
});
