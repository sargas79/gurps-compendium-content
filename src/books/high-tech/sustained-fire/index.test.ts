/**
 * Sustained fire as the system meets it: the rounds `gworld.afterShots`
 * reports heating a gun, the rows a hot gun gives, a water jacket, a barrel
 * fired past three times its safe number, and a barrel change -- with only
 * High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { readyFirearms } from "../firearms/index.js";
import { gunHeatOf, readySustainedFire } from "./index.js";

type Listener = (context: any) => void;

const HOOKS = {
  weaponAttacks: "gworld.weaponAttacks",
  malfunction: "gworld.malfunction",
  clearMalfunction: "gworld.clearMalfunction",
  equipmentFailure: "gworld.equipmentFailure",
  afterShots: "gworld.afterShots",
};

let hooks: Map<string, Listener[]>;
let sections: any[];
let chat: string[];
let worldTime: number;
let on: Record<string, boolean>;
let conditions: any[];
let rollOutcome: any;
let skill: number | null;
let rolled: any[];

function fakeApi() {
  return {
    rules: { qualityAccuracyBonus: () => 0, qualityMalfunction: (m: number | null) => m, weaponClassOf: () => "firearm" },
    registry: { isRuleOn: () => false },
    combat: { hooks: HOOKS },
    data: { hooks: { objectStats: "gworld.objectStats" }, registerPriceModifier: vi.fn() },
    sheets: { registerSheetSection: (s: any) => sections.push(s) },
    actors: { skillLevel: () => skill, applyCondition: async (_a: any, c: any) => { conditions.push(c); return "c1"; } },
    roll: { success: async (options: any) => { rolled.push(options); return rollOutcome; } },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

/** A Saco M60 as the pack has it (TL7, RoF 9, Malf. 17), or another gun. */
function gun(patch: { name?: string; skill?: string; rof?: number; tl?: string; build?: Record<string, unknown>; firearm?: Record<string, unknown> } = {}): any {
  const item: any = {
    id: "g1",
    name: patch.name ?? "Saco M60, 7.62x51mm",
    type: "equipment",
    isOwner: true,
    actor: { name: "Gunner" },
    flags: {},
    system: {
      tl: patch.tl ?? "7",
      weaponClass: "firearm",
      meleeModes: [],
      rangedModes: [{ skill: patch.skill ?? "Guns (Light Machine Gun)", accuracy: 5, malfunction: 17, rateOfFire: patch.rof ?? 9, shots: "100(5)" }],
      extensions: { [MODULE_ID]: { firearm: { accuracyLost: 0, ...patch.firearm }, firearmBuild: patch.build ?? {} } },
    },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const flush = async () => { for (let i = 0; i < 3; i += 1) await Promise.resolve(); };

/** Fires `bursts` attacks of `shots` rounds, `every` seconds apart. */
async function burst(item: any, shots: number, bursts = 1, every = 1): Promise<void> {
  for (let i = 0; i < bursts; i += 1) {
    fire(HOOKS.afterShots, { actor: item.actor, item, modeIndex: 0, shots, fired: shots, extra: 0, wasted: 0, kind: "rapidFire" });
    await flush();
    worldTime += every;
  }
}

function row(item: any): any {
  const mode = item.system.rangedModes[0];
  const context = fire(HOOKS.weaponAttacks, { item, rows: [{ kind: "ranged", mode, basis: { accuracy: 5, malfunction: 17 }, row: { accuracy: 5, malfunction: 17, notes: [] } }] });
  return context.rows[0].row;
}

function ready(): void {
  const api = fakeApi();
  const rule = (key: string) => () => on[key] === true;
  readyFirearms(api as never, { quality: rule("firearmQuality"), care: rule("gunCare"), immediateAction: rule("immediateAction"), sustainedFire: rule("sustainedFire") });
  readySustainedFire(api as never, { sustained: rule("sustainedFire") }, rule("gunCare"));
}

beforeEach(() => {
  hooks = new Map();
  sections = [];
  chat = [];
  conditions = [];
  worldTime = 1000;
  on = { sustainedFire: true };
  rollOutcome = { success: true, criticalFailure: false };
  skill = 14;
  rolled = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    get time() { return { worldTime }; },
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => 0.5 } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a machine gun in sustained fire (High-Tech pp. 85-86)", () => {
  it("loses 1 Acc and Malf. past its safe number, fired in long bursts with no pauses", async () => {
    ready();
    const m60 = gun();
    // TL7, not maintained: 800 rounds of sustained fire, 200 of assault fire. Full-RoF bursts every second are assault fire.
    await burst(m60, 9, 22);
    expect(row(m60)).toMatchObject({ accuracy: 5, malfunction: 17 });
    await burst(m60, 9, 1);
    expect(gunHeatOf(m60).shots).toBe(23 * 9 * 4);
    expect(row(m60)).toMatchObject({ accuracy: 4, malfunction: 16 });
    expect(chat.some((c) => c.includes("GCC.HT.Sustained.Overheated"))).toBe(true);
  });

  it("counts short bursts with pauses as sustained fire, which takes far longer to heat", async () => {
    ready();
    const m60 = gun();
    await burst(m60, 5, 100, 5);
    expect(gunHeatOf(m60).shots).toBe(500);
    expect(row(m60).accuracy).toBe(5);
  });

  it("warps the barrel at three times the safe number: -2 while hot, and the Acc lost stays in the gun's Acc lost", async () => {
    ready();
    const m60 = gun({ firearm: { discipline: "assault" } });
    await burst(m60, 150, 4);
    expect(m60.system.extensions[MODULE_ID].firearm.accuracyLost).toBe(2);
    // Hot: -2 more from the heat, and the -2 for good through #364's field.
    expect(row(m60)).toMatchObject({ accuracy: 1, malfunction: 15 });
    // Firing on doesn't warp it again in the same spell of heat.
    await burst(m60, 50, 1);
    expect(m60.system.extensions[MODULE_ID].firearm.accuracyLost).toBe(2);
    // A quarter of an hour cools it; the Acc lost stays.
    worldTime += 900;
    expect(row(m60)).toMatchObject({ accuracy: 3, malfunction: 17 });
  });

  it("lets the water jacket take the heat until the water is gone (p. 129)", async () => {
    ready();
    const vickers = gun({ name: "Vickers Mk I, .303", skill: "Gunner (Machine Gun)", rof: 10, tl: "6", build: { waterPints: 1 }, firearm: { discipline: "assault" } });
    await burst(vickers, 250, 2);
    expect(gunHeatOf(vickers)).toMatchObject({ shots: 0, water: 500 });
    expect(chat.some((c) => c.includes("GCC.HT.Sustained.WaterGone"))).toBe(true);
    await burst(vickers, 50, 1);
    expect(gunHeatOf(vickers).shots).toBe(200);
  });

  it("gives a pistol one safe number: 100 rounds in under a minute", async () => {
    ready();
    const pistol = gun({ name: "Glock 17", skill: "Guns (Pistol)", rof: 3 });
    await burst(pistol, 3, 34);
    expect(row(pistol).accuracy).toBe(4);
  });

  it("does nothing with the switch off", async () => {
    ready();
    on.sustainedFire = false;
    const m60 = gun();
    await burst(m60, 100, 5);
    expect(gunHeatOf(m60).shots).toBe(0);
  });
});

describe("changing the barrel (High-Tech p. 129)", () => {
  function section(): any {
    return sections.find((s) => s.key === "ht-sustained-fire-item");
  }

  async function clickBarrel(item: any): Promise<void> {
    const handlers: Record<string, () => void> = {};
    const element: any = {
      querySelectorAll: () => [],
      querySelector: (selector: string) => ({ addEventListener: (_e: string, fn: () => void) => { handlers[selector] = fn; } }),
    };
    section().listeners(element, item);
    handlers["[data-gcc-ht-barrel]"]!();
    await settle();
    await settle();
  }

  it("cools the gun on a successful Gunner roll", async () => {
    ready();
    const mg42 = gun({ name: "Rheinmetall MG42, 7.92x57mm", build: { barrelChangeSeconds: 3 }, firearm: { discipline: "assault" } });
    await burst(mg42, 100, 3);
    expect(row(mg42).accuracy).toBe(4);
    await clickBarrel(mg42);
    expect(gunHeatOf(mg42).shots).toBe(0);
    expect(chat.at(-1)).toContain("BarrelChanged");
    expect(chat.at(-1)).toContain('"seconds":3');
  });

  it("burns the hand on a critical failure: 1d minutes of moderate pain", async () => {
    ready();
    rollOutcome = { success: false, criticalFailure: true };
    const m60 = gun({ firearm: { discipline: "assault" } });
    await burst(m60, 100, 3);
    await clickBarrel(m60);
    expect(gunHeatOf(m60).shots).toBe(1200);
    expect(conditions).toEqual([{ key: "moderatePain", duration: { seconds: 4 * 60 } }]);
  });

  it("rolls the skill at default, as the gun's row has it, for a gunner who never learned it", async () => {
    ready();
    skill = null;
    const m60 = gun();
    m60.actor.system = { derived: { ranged: [{ itemId: "g1", modeIndex: 0, skillLevel: 9 }] } };
    await clickBarrel(m60);
    expect(rolled[0]).toMatchObject({ base: 9, skill: "Guns (Light Machine Gun)" });
  });

  it("shows the safe number and the heat on the gun's sheet", async () => {
    ready();
    const m60 = gun({ firearm: { maintained: true } });
    const context = section().context(m60);
    expect(context.safe).toContain('"sustained":1000');
    expect(context.safe).toContain('"assault":250');
    expect(context.canChangeBarrel).toBe(true);
  });
});
