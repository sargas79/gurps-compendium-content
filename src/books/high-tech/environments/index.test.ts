/**
 * The special shooting situations as the system meets them (High-Tech
 * p. 85): a scene underwater or in space changing a gun's rows, and shots
 * into water or steeply up refused out of range.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ENVIRONMENT_FLAG } from "../../../shared/environment/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyEnvironments } from "./index.js";
import { intoWaterDistance, reach, underwaterRange } from "./rules.js";

type Listener = (context: any) => void;

const HOOKS = { weaponAttacks: "gworld.weaponAttacks", attackModifiers: "gworld.attackModifiers" };

let hooks: Map<string, Listener[]>;
let options: any[];
let tools: any[];
let flag: any;
let on: boolean;

function fakeApi() {
  return {
    rules: { weaponClassOf: () => "firearm" },
    combat: { hooks: HOOKS, registerAttackOption: (o: any) => options.push(o) },
    sheets: { registerGmTool: (t: any) => tools.push(t) },
  };
}

function gun(patch: { tl?: string; rof?: number; skill?: string; shots?: string; build?: Record<string, unknown> } = {}): any {
  return {
    id: "g1",
    name: "gun",
    type: "equipment",
    system: {
      tl: patch.tl ?? "7",
      weaponClass: "firearm",
      meleeModes: [],
      rangedModes: [{ skill: patch.skill ?? "Guns (Pistol)", rateOfFire: patch.rof ?? 3, shots: patch.shots ?? "17+1(3)", malfunction: 17 }],
      extensions: { [MODULE_ID]: { firearm: {}, firearmBuild: patch.build ?? {} } },
    },
  };
}

function rowFor(item: any, row: Record<string, unknown> = {}): any {
  const mode = item.system.rangedModes[0];
  const context = { item, rows: [{ kind: "ranged", mode, basis: {}, row: { halfDamageRange: 160, maxRange: 1800, malfunction: 17, notes: [], ...row } }] };
  for (const listener of hooks.get(HOOKS.weaponAttacks) ?? []) listener(context);
  return context.rows[0]!.row;
}

beforeEach(() => {
  hooks = new Map();
  options = [];
  tools = [];
  flag = {};
  on = true;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    scenes: { viewed: { getFlag: (module: string, key: string) => (module === MODULE_ID && key === ENVIRONMENT_FLAG ? flag : undefined) } },
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  readyEnvironments(fakeApi() as never, () => on);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rules (High-Tech p. 85)", () => {
  it("divides a gun's ranges by 1,000 underwater, or by 25 for an underwater gun", () => {
    expect(underwaterRange({ halfDamageRange: 160, maxRange: 1800 }, 0)).toEqual({ halfDamageRange: 0.2, maxRange: 1.8 });
    expect(underwaterRange({ halfDamageRange: 50, maxRange: 500 }, 25)).toEqual({ halfDamageRange: 2, maxRange: 20 });
  });

  it("counts water a thousand times over, as Lafayette's shot at the monstrosity does", () => {
    // 4 feet of water is 4,000 feet, 1,333 yards: past the MP5/10's 1/2D, within its Max of 3,100.
    expect(Math.round(intoWaterDistance(0, 4))).toBe(1333);
    expect(reach(intoWaterDistance(0, 4), { halfDamageRange: 160, maxRange: 3100 })).toBe("half");
    expect(reach(intoWaterDistance(0, 10), { halfDamageRange: 160, maxRange: 3100 })).toBe("out");
  });

  it("cuts the range to 80% firing steeply up, as the Glock at the gargoyle", () => {
    // 5,000 feet is 1,667 yards, past 1,800 × 0.8 = 1,440.
    expect(reach(5000 / 3, { halfDamageRange: 160, maxRange: 1800 }, 0.8)).toBe("out");
  });
});

describe("the scene's rows", () => {
  it("leaves rows alone in air", () => {
    expect(rowFor(gun())).toMatchObject({ halfDamageRange: 160, maxRange: 1800, malfunction: 17 });
  });

  it("underwater: ranges /1,000, Malf. -2 for an automatic, -1 for a revolver", () => {
    flag = { underwater: true };
    expect(rowFor(gun())).toMatchObject({ halfDamageRange: 0.2, maxRange: 1.8, malfunction: 15 });
    expect(rowFor(gun({ shots: "6(3i)" }))).toMatchObject({ malfunction: 16 });
    // An underwater gun: ranges /25, no Malf. lost.
    expect(rowFor(gun({ build: { underwaterFactor: 25 } }), { halfDamageRange: 50, maxRange: 500 })).toMatchObject({ halfDamageRange: 2, maxRange: 20, malfunction: 17 });
    // A TL5 gun isn't an ordinary TL6-8 firearm.
    expect(rowFor(gun({ tl: "5" }))).toMatchObject({ maxRange: 1800 });
  });

  it("in space: an automatic TL6-8 gun malfunctions on 14, a bolt action doesn't", () => {
    flag = { atmospheres: 0 };
    expect(rowFor(gun())).toMatchObject({ malfunction: 14 });
    expect(rowFor(gun({ rof: 1, skill: "Guns (Rifle)", shots: "5(3)" }))).toMatchObject({ malfunction: 17 });
  });

  it("does nothing with the switch off", () => {
    flag = { underwater: true };
    on = false;
    expect(rowFor(gun())).toMatchObject({ maxRange: 1800, malfunction: 17 });
  });
});

describe("shots into water and steeply up", () => {
  function attack(item: any, chosen: Record<string, unknown>, rangeYards: number): any {
    const actor = { system: { derived: { ranged: [{ itemId: item.id, modeIndex: 0, halfDamageRange: 160, maxRange: 3100 }] } } };
    const context = { actor, item, ranged: true, mode: { index: 0, ranged: true }, rangeYards, options: chosen, modifiers: [] as any[], refusal: null as string | null };
    for (const listener of hooks.get(HOOKS.attackModifiers) ?? []) listener(context);
    return context;
  }

  it("takes -4 into water, and refuses a shot the water puts out of range", () => {
    const into = options.find((o) => o.key === "ht-into-water");
    expect(into.apply({}, 4).modifiers).toEqual([{ label: "GCC.HT.Environment.IntoWaterLine", value: -4 }]);
    expect(into.apply({}, 0)).toBeNull();
    expect(attack(gun(), { [`${MODULE_ID}.ht-into-water`]: 4 }, 3).refusal).toBeNull();
    expect(attack(gun(), { [`${MODULE_ID}.ht-into-water`]: 4 }, 3).modifiers[0].label).toContain("PastHalfDamage");
    expect(attack(gun(), { [`${MODULE_ID}.ht-into-water`]: 10 }, 3).refusal).toContain("OutOfRange");
  });

  it("refuses a steep shot past 80% of Max", () => {
    expect(attack(gun(), { [`${MODULE_ID}.ht-steep-angle`]: true }, 2400).refusal).toBeNull();
    expect(attack(gun(), { [`${MODULE_ID}.ht-steep-angle`]: true }, 2500).refusal).toContain("OutOfRange");
  });

  it("gives the GM a tool for the scene while the switch is on", () => {
    expect(tools.map((t) => t.key)).toEqual(["ht-shooting-environment"]);
    expect(tools[0].visible()).toBe(true);
  });
});
