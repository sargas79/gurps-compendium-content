/**
 * The mind disruptor and the neutralizer (p. 58): resisted with Mind Shield,
 * and no DR.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { readyNeuralSonic } from "../../ultra-tech/beams/neural-sonic.js";
import { readyGear } from "./index.js";
import { isMindWeapon, mindShieldLevels } from "./mind-weapons.js";

type Listener = (context: any) => void;

const REFERENCE = "Monster Hunters 1: Champions p. 58";
const weapon = (name: string, reference = REFERENCE) => ({ name, type: "equipment", system: { reference } });
const trait = (name: string, levels?: number) => ({ name, type: "trait", system: levels === undefined ? {} : { levels } });

describe("the book's Will-based afflictions (p. 58)", () => {
  it("knows its own two weapons, cited to the book", () => {
    expect(isMindWeapon(weapon("Mind Disruptor"))).toBe(true);
    expect(isMindWeapon(weapon("Neutralizer"))).toBe(true);
    expect(isMindWeapon(weapon("Mind Disruptor", "Ultra-Tech p. 121"))).toBe(false);
    expect(isMindWeapon(weapon("Ghost Blaster"))).toBe(false);
  });

  it("adds every Mind Shield, a power's too, and a worn mental shield's 4", () => {
    expect(mindShieldLevels([trait("Mind Shield", 3)])).toBe(3);
    expect(mindShieldLevels([trait("TEL: Mind Shield", 2)])).toBe(2);
    expect(mindShieldLevels([trait("Mind Shield 5")])).toBe(5);
    const shield = { name: "Mental Shield (+4)", type: "equipment", system: { equipped: true } };
    expect(mindShieldLevels([trait("Mind Shield", 2), shield])).toBe(6);
    expect(mindShieldLevels([{ ...shield, system: { equipped: false } }])).toBe(0);
    expect(mindShieldLevels([trait("Mind Probe", 2)])).toBe(0);
  });
});

describe("the resistance roll", () => {
  let hooks: Map<string, Listener[]>;
  let on: boolean;
  const globals = globalThis as Record<string, unknown>;

  beforeEach(() => {
    hooks = new Map();
    on = true;
    globals.Hooks = { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) };
    globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, gworld: { api: { rules } } };
    const api = {
      rules,
      data: { hooks: { skillBonuses: "gworld.skillBonuses" }, registerPriceModifier: () => undefined },
      combat: { hooks: { weaponAttacks: "a", breakageOdds: "b", equipmentFailure: "c", successRollModifiers: "gworld.successRollModifiers" } },
      sheets: { registerSheetSection: () => undefined },
    };
    readyGear(api as never, () => on);
  });
  afterEach(() => {
    delete globals.Hooks;
    delete globals.game;
  });

  const resist = (item: any, items: any[]) => {
    const context = { tags: ["resist", "affliction"], actor: { items }, attack: { item }, modifiers: [{ key: "afflictionDr", value: 4 }] };
    for (const fn of hooks.get("gworld.successRollModifiers") ?? []) fn(context);
    return context.modifiers;
  };

  it("takes the DR line out and puts the victim's Mind Shield in", () => {
    expect(resist(weapon("Mind Disruptor"), [trait("Mind Shield", 3)])).toEqual([{ label: "GCC.MH1.MindShield", value: 3 }]);
    expect(resist(weapon("Neutralizer"), [])).toEqual([]);
  });

  it("leaves other weapons, and the switch off, alone", () => {
    expect(resist(weapon("Ghost Blaster"), [trait("Mind Shield", 3)])).toEqual([{ key: "afflictionDr", value: 4 }]);
    on = false;
    expect(resist(weapon("Mind Disruptor"), [trait("Mind Shield", 3)])).toEqual([{ key: "afflictionDr", value: 4 }]);
  });
});

describe("with Ultra-Tech's neural beams switched on too", () => {
  let hooks: Map<string, Listener[]>;
  const globals = globalThis as Record<string, unknown>;
  const M = "gurps-compendium-content";

  beforeEach(() => {
    hooks = new Map();
    globals.Hooks = { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) };
    globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, gworld: { api: { rules } } };
    const api = {
      rules,
      data: { hooks: { skillBonuses: "gworld.skillBonuses" }, registerPriceModifier: () => undefined },
      combat: { hooks: { weaponAttacks: "a", breakageOdds: "b", equipmentFailure: "c", successRollModifiers: "gworld.successRollModifiers", afflictionEffect: "gworld.afflictionEffect", afterDamage: "d" } },
      sheets: { registerSheetSection: () => undefined },
      actors: { attribute: () => 10 },
    };
    readyGear(api as never, () => true);
    readyNeuralSonic(api as never, () => true);
  });
  afterEach(() => {
    delete globals.Hooks;
    delete globals.game;
  });

  const booked = (name: string, book: string, reference: string) => ({ name, type: "equipment", flags: { [M]: { book } }, system: { reference } });
  const resist = (item: any) => {
    const context = { tags: ["resist", "affliction"], actor: { items: [trait("Mind Shield", 3)], system: { derived: { traitEffects: {} } } }, attack: { item }, modifiers: [{ key: "afflictionDr", value: 4 }] };
    for (const fn of hooks.get("gworld.successRollModifiers") ?? []) fn(context);
    return context.modifiers;
  };

  it("counts Mind Shield once against each book's mind disruptor", () => {
    // Monster Hunters' record: its own listener alone.
    expect(resist(booked("Mind Disruptor", "monster-hunters-1", REFERENCE))).toEqual([{ label: "GCC.MH1.MindShield", value: 3 }]);
    // Ultra-Tech's: its own listener alone.
    const ut = resist(booked("Mind Disruptor", "ultra-tech", "Ultra-Tech p. 121"));
    expect(ut).toHaveLength(1);
    expect(ut[0].label).not.toBe("GCC.MH1.MindShield");
  });
});
