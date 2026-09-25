/**
 * Monster Hunters 1's gear at the table: a worn article's Holdout (p. 59) as
 * a Holdout roll's clothing line (Characters p. 200; API 1.152.0).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyGear } from "./index.js";

type Listener = (context: any) => void;

const coat = (holdout: number, equipped = true) => ({ type: "armor", name: "Long coat", system: { equipped, extensions: { [MODULE_ID]: { holdout } } } });

describe("a worn article's Holdout (p. 59)", () => {
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

  const roll = (items: any[], skill: string, modifiers: any[] = []) => {
    const context = { actor: { items }, skill, tags: ["holdout"], item: null, modifiers };
    for (const fn of hooks.get("gworld.successRollModifiers") ?? []) fn(context);
    return context.modifiers;
  };

  it("puts the best worn article's bonus on the Holdout roll, keyed clothing", () => {
    expect(roll([coat(4)], "Holdout")).toEqual([{ key: "clothing", label: "GCC.MH1.Gadget.Holdout (Long coat)", value: 4 }]);
    expect(roll([coat(4, false)], "Holdout")).toEqual([]);
    expect(roll([coat(4)], "Search")).toEqual([]);
  });

  it("keeps the better of it and a clothing line already there, never both", () => {
    expect(roll([coat(4)], "Holdout", [{ key: "clothing", label: "Clothing", value: 1 }])).toEqual([{ key: "clothing", label: "GCC.MH1.Gadget.Holdout (Long coat)", value: 4 }]);
    expect(roll([coat(4)], "Holdout", [{ key: "clothing", label: "Clothing", value: 5 }])).toEqual([{ key: "clothing", label: "Clothing", value: 5 }]);
  });

  it("is no longer a bonus to the skill itself, and does nothing switched off", () => {
    const skill = { actor: { items: [coat(4)] }, name: "Holdout", lines: [] as any[] };
    for (const fn of hooks.get("gworld.skillBonuses") ?? []) fn(skill);
    expect(skill.lines).toEqual([]);
    on = false;
    expect(roll([coat(4)], "Holdout")).toEqual([]);
  });
});
