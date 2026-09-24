/**
 * Ultra-Tech's lasers at the eyes, at the table (pp. 113-114): a dazzler, or a
 * laser on its dazzle setting, blinds for minutes equal to the margin of
 * failure, read by its size (#535); one on its blinding setting inflicts
 * crippling Blindness, which heals as a crippling injury does (#539).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DAZZLE_TABLES, blindnessFrom } from "../../../shared/dazzle/rules.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyLaserOptions } from "./laser-options.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  shotsEntry: "gworld.shotsEntry",
  weaponAttacks: "gworld.weaponAttacks",
  attackModifiers: "gworld.attackModifiers",
  armorDr: "gworld.armorDr",
  injury: "gworld.injury",
  successRollModifiers: "gworld.successRollModifiers",
  afflictionEffect: "gworld.afflictionEffect",
  afterDamage: "gworld.afterDamage",
};

let hooks: Map<string, Listener[]>;
let on: boolean;

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));

function fakeApi() {
  return {
    combat: {
      hooks: HOOKS,
      registerAttackOption: vi.fn(),
      setWeaponState: async () => undefined,
      getWeaponState: () => null,
    },
    data: { registerPriceModifier: vi.fn() },
    sheets: { registerSheetSection: vi.fn() },
  };
}

const victim = { name: "Guard", items: [] };

function dazzler(): any {
  return { name: "Dazzler Carbine", type: "equipment", system: {} };
}

function laserOn(setting: "dazzle" | "blinding"): any {
  return {
    name: "Laser Rifle",
    type: "equipment",
    system: { extensions: { [MODULE_ID]: { laser: { dazzle: true, blinding: true, pulse: "", setting } } } },
  };
}

function effectOf(item: any, margin: number): any {
  const context = { actor: victim, item, label: "", margin, effects: [] as any[] };
  fire(HOOKS.afflictionEffect, context);
  return context.effects;
}

beforeEach(() => {
  hooks = new Map();
  on = true;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    user: { id: "gm", isGM: true },
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("CONST", { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async () => undefined } });
  readyLaserOptions(fakeApi() as never, () => on);
});

describe("a laser at the eyes (Ultra-Tech pp. 113-114)", () => {
  it("dazzles for 1, 5 and 12 minutes on failures by 1, 5 and 12", () => {
    for (const item of [dazzler(), laserOn("dazzle")]) {
      expect(effectOf(item, -1)).toEqual([{ module: MODULE_ID, key: "ut-dazzled", label: "GCC.UT.Lasers.Dazzled", duration: { seconds: 60 } }]);
      expect(effectOf(item, -5)[0].duration).toEqual({ seconds: 300 });
      expect(effectOf(item, -12)[0].duration).toEqual({ seconds: 720 });
    }
  });

  it("cripples the eyes on the blinding setting, whatever the margin", () => {
    for (const margin of [-1, -5, -12]) {
      expect(effectOf(laserOn("blinding"), margin)).toEqual([{ module: MODULE_ID, key: "ut-blinded", label: "GCC.UT.Lasers.Blinded" }]);
    }
  });

  it("reads crippling Blindness, never for good, from the book's table (p. 113)", () => {
    const table = DAZZLE_TABLES.forBook("ultra-tech")!;
    expect(table.blinding).toBe("crippling");
    for (const margin of [-1, -10, -15]) expect(blindnessFrom(table, "blinding", margin)).toEqual({ kind: "blinded", permanent: false });
  });

  it("does nothing with the switch off", () => {
    on = false;
    expect(effectOf(dazzler(), -5)).toEqual([]);
  });
});
