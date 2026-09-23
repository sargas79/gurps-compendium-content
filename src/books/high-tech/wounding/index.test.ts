import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { resetSevereBleeding } from "../../../shared/bleeding/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyWounding } from "./index.js";

type Listener = (...args: any[]) => unknown;

const HOOKS = {
  injury: "gworld.injury",
  afterDamage: "gworld.afterDamage",
  bleedingSchedule: "gworld.bleedingSchedule",
  successRollModifiers: "gworld.successRollModifiers",
  firstAid: "gworld.firstAid",
  turnStart: "gworld.turnStart",
};

let hooks: Map<string, Listener[]>;
let on: Record<string, boolean>;
let chat: string[];
let posted: Array<{ key: string; data: any; actor: any }>;
let frightChecks: Array<{ actor: any; modifier: number }>;
let die: number;
let combat: any;

const fire = (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((fn) => fn(...args));
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

function victim(hp = 11, current = hp): any {
  const flags: Record<string, unknown> = {};
  return {
    name: "Bodyguard",
    uuid: "Actor.guard",
    isOwner: true,
    statuses: new Set<string>(),
    system: { hp: { max: hp, value: current } },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    flags,
  };
}

function fakeApi() {
  return {
    combat: { hooks: HOOKS },
    registry: { isRuleOn: (key: string) => on[key] === true },
    rules,
    actors: {
      derived: () => ({ traitEffects: {} }),
      stopBleeding: vi.fn(),
      skillLevel: () => 12,
    },
    roll: {
      success: vi.fn(async () => ({ success: true })),
      frightCheck: async (actor: any, modifier: number) => { frightChecks.push({ actor, modifier }); return null; },
    },
    chat: {
      registerChatCard: vi.fn(),
      post: async (key: string, data: any, options: any) => { posted.push({ key, data, actor: options?.actor }); },
      update: vi.fn(async () => true),
    },
    sheets: { registerGmTool: vi.fn() },
  };
}

let api: ReturnType<typeof fakeApi>;

function ready(): void {
  api = fakeApi();
  const rule = (key: string) => () => on[key] === true;
  readyWounding(api as never, { vitals: rule("vitalsOnTorsoHits"), limbs: rule("realisticLimbWounds"), bleeding: rule("vitalBleeding"), fright: rule("woundFrightChecks") });
}

/** Runs a blow through the injury hook, as the system does before working it out. */
function incoming(actor: any, damage: Record<string, unknown>): any {
  const context = { actor, item: null, mode: null, damage: { basicDamage: 23, armorDivisor: 1, ...damage } };
  fire(HOOKS.injury, context);
  return context.damage;
}

/** The system's result for a blow, capped as the hook asked. */
async function land(actor: any, damage: any, result: Record<string, unknown>): Promise<void> {
  fire(HOOKS.afterDamage, { actor, item: null, mode: null, damage, result: { hitLocation: damage.hitLocation, addonLocation: null, crippled: false, bleeds: true, injuryCap: null, excessLost: 0, ...result } });
  await flush();
}

beforeEach(() => {
  hooks = new Map();
  on = {};
  chat = [];
  posted = [];
  frightChecks = [];
  die = 3;
  combat = null;
  resetSevereBleeding();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("CONFIG", { Dice: { randomUniform: () => (die - 1) / 6 + 0.01 } });
  vi.stubGlobal("game", {
    get combat() { return combat; },
    users: { activeGM: { isSelf: true }, [Symbol.iterator]: function* () { yield { id: "gm", isGM: true }; } },
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("body hits (High-Tech p. 162)", () => {
  it("does nothing with the switch off", () => {
    ready();
    const damage = incoming(victim(), { type: "pi", hitLocation: "torso" });
    expect(damage.hitLocation).toBe("torso");
    expect(damage.injuryCap).toBeUndefined();
  });

  it("moves a torso bullet to the vitals on a 1", async () => {
    on = { vitalsOnTorsoHits: true };
    die = 1;
    ready();
    const guard = victim();
    const damage = incoming(guard, { type: "pi", hitLocation: "torso" });
    expect(damage.hitLocation).toBe("vitals");
    expect(damage.injuryCap).toBeUndefined();
    await land(guard, damage, { injury: 33, uncappedInjury: 33 });
    expect(chat.join()).toContain("GCC.HT.Wounding.VitalsHit");
  });

  it("caps a torso bullet at HP with Bleeding, and the excess makes the bleeding roll -4 in all", async () => {
    on = { vitalsOnTorsoHits: true, bleeding: true };
    ready();
    const guard = victim(11);
    const damage = incoming(guard, { type: "pi", hitLocation: "torso" });
    expect(damage).toMatchObject({ hitLocation: "torso", injuryCap: 11 });
    expect(damage.injuryCapReason).toContain("CapReason");
    // The system took 11 of the 23, and keeps the rest as what the cap took off.
    guard.system.hp.value = 0;
    await land(guard, damage, { injury: 11, uncappedInjury: 23, injuryCap: { cap: 11, lost: 12, reason: "" } });
    expect(chat.join()).toContain("GCC.HT.Wounding.VitalsMissed");
    expect(guard.flags.htCapExcess).toBe(12);
    guard.statuses.add("bleeding");
    const schedule = { actor: guard, intervalSeconds: 60, modifier: rules.bleedingModifier(11) };
    fire(HOOKS.bleedingSchedule, schedule);
    expect(schedule).toMatchObject({ intervalSeconds: 60, modifier: -4 });
  });

  it("caps at twice HP without Bleeding, keeps another module's lower cap, and caps the groin without a roll", () => {
    on = { vitalsOnTorsoHits: true };
    die = 1;
    ready();
    expect(incoming(victim(11), { type: "pi", hitLocation: "groin" }).injuryCap).toBe(22);
    die = 4;
    expect(incoming(victim(11), { type: "imp", hitLocation: "torso", injuryCap: 5 }).injuryCap).toBe(5);
    expect(incoming(victim(11), { type: "cr", hitLocation: "torso" }).injuryCap).toBeUndefined();
  });
});

describe("limb hits (High-Tech p. 162)", () => {
  it("tells the GM a limb is crippled for good at twice what cripples it", async () => {
    on = { realisticLimbWounds: true };
    ready();
    const guard = victim(10);
    await land(guard, { type: "pi", hitLocation: "arm" }, { injury: 6, uncappedInjury: 12, crippled: true });
    expect(chat.join()).toContain("GCC.HT.Wounding.LimbPermanent");
    expect(chat.join()).toContain("\"least\":6");
    chat = [];
    await land(guard, { type: "pi", hitLocation: "arm" }, { injury: 6, uncappedInjury: 11, crippled: true });
    expect(chat).toEqual([]);
    await land(guard, { type: "pi", hitLocation: "arm" }, { injury: 6, uncappedInjury: 24, crippled: true });
    expect(chat.join()).toContain("GCC.HT.Wounding.LimbSevered");
  });
});

describe("stopping the bleeding (High-Tech p. 162)", () => {
  it("bleeds a neck wound every 30 seconds at -2 more, and only Surgery stops it", async () => {
    on = { vitalBleeding: true, bleeding: true };
    ready();
    const guard = victim(12);
    await land(guard, { type: "pi", hitLocation: "neck" }, { injury: 6, uncappedInjury: 6 });
    expect(guard.flags.htSevereWounds).toEqual([{ intervalSeconds: 30, modifier: -2, surgery: true }]);
    guard.system.hp.value = 6;
    guard.statuses.add("bleeding");
    const schedule = { actor: guard, intervalSeconds: 60, modifier: rules.bleedingModifier(6) };
    fire(HOOKS.bleedingSchedule, schedule);
    expect(schedule).toEqual({ actor: guard, intervalSeconds: 30, modifier: -3 });
    // First Aid takes the whole penalty, and doesn't stop it.
    const roll = { tags: ["firstAid"], opponent: guard, modifiers: [] as any[] };
    fire(HOOKS.successRollModifiers, roll);
    expect(roll.modifiers.map((m) => m.value)).toEqual([-2, -1]);
    const aid = { healer: {}, patient: guard, refusal: null, stopsBleeding: true };
    fire(HOOKS.firstAid, aid);
    expect(aid.stopsBleeding).toBe(false);
  });

  it("forgets old wounds once the bleeding has stopped", async () => {
    on = { vitalBleeding: true, bleeding: true };
    ready();
    const guard = victim(12);
    await land(guard, { type: "pi", hitLocation: "vitals" }, { injury: 6, uncappedInjury: 6 });
    // Not bleeding when the next blow lands: the vitals wound is gone, the arm's ordinary.
    await land(guard, { type: "cut", hitLocation: "arm" }, { injury: 2, uncappedInjury: 2 });
    expect(guard.flags.htSevereWounds).toBeUndefined();
  });
});

describe("\"You shot me, Mister!\" (High-Tech p. 162)", () => {
  it("offers a Fright Check after a serious wound, at once outside combat", async () => {
    on = { woundFrightChecks: true };
    ready();
    const guard = victim(12);
    await land(guard, { type: "pi", hitLocation: "torso" }, { injury: 5, uncappedInjury: 5 });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ key: `${MODULE_ID}.ht-wound-fright`, data: { modifier: 0, rolled: false }, actor: guard });
    // Pressing the card's button rolls it.
    const card = (api.chat.registerChatCard as any).mock.calls[0][0];
    await card.actions.roll({ message: {}, data: posted[0]!.data, actor: guard });
    expect(frightChecks).toEqual([{ actor: guard, modifier: 0 }]);
  });

  it("in combat, waits for the victim's next turn, at -4 for a crippled limb", async () => {
    on = { woundFrightChecks: true };
    ready();
    const guard = victim(12);
    combat = { started: true, combatants: [{ actor: guard }] };
    await land(guard, { type: "pi", hitLocation: "leg" }, { injury: 7, uncappedInjury: 7, crippled: true });
    expect(posted).toEqual([]);
    expect(guard.flags.htWoundFright).toBe(-4);
    fire(HOOKS.turnStart, combat, { actor: guard });
    await flush();
    expect(posted[0]?.data.modifier).toBe(-4);
    expect(guard.flags.htWoundFright).toBeUndefined();
  });

  it("asks nothing for a scratch", async () => {
    on = { woundFrightChecks: true };
    ready();
    await land(victim(12), { type: "pi", hitLocation: "torso" }, { injury: 3, uncappedInjury: 3 });
    expect(posted).toEqual([]);
  });
});
