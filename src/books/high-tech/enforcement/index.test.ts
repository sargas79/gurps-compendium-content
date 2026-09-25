/**
 * High-Tech's lie detection and restraints as the system meets them: the
 * Interrogation and cuffed rolls through `gworld.successRollModifiers`, the
 * weapons refused through `gworld.attackModifiers`, leg irons through
 * `gworld.traitEffects`, and the row buttons -- with only High-Tech's
 * switches on (decision D1).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { LIE_DETECTOR_TABLES } from "../../../shared/interrogation/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { RESTRAINT_TABLES } from "../../../shared/restraints/index.js";
import { initEnforcement, readyEnforcement } from "./index.js";

type Listener = (...args: any[]) => unknown;

const LIES = `${MODULE_ID}.lieDetection`;
const RESTRAINTS = `${MODULE_ID}.restraintDevices`;
const HOOKS = { successRollModifiers: "srm", attackModifiers: "am" };

const hooks = new Map<string, Listener[]>();
const actions = new Map<string, any>();
const sections = new Map<string, any>();
const fire = (name: string, context: any) => {
  (hooks.get(name) ?? []).forEach((fn) => fn(context));
  return context;
};

let on: Set<string>;
let targets: any[];
let actors: any[];
let chat: string[];
let successResult: any;
let successCalls: any[];
let contestResult: any;
let contestCalls: any[];

const api: any = {
  combat: { hooks: HOOKS },
  sheets: {
    registerSheetSection: (s: any) => sections.set(s.key, s),
    registerRowAction: (a: any) => actions.set(a.key, a),
  },
  actors: {
    skillLevel: (actor: any, skill: string) => actor.skills?.[skill] ?? null,
    attribute: (actor: any, attribute: string) => actor.attributes?.[attribute] ?? 10,
  },
  roll: {
    success: async (options: any) => { successCalls.push(options); return successResult; },
    quickContest: async (options: any) => { contestCalls.push(options); return contestResult; },
  },
};

function gear(name: string, more: { tl?: string; flags?: Record<string, unknown>; system?: Record<string, unknown> } = {}): any {
  const flags: Record<string, any> = { book: "high-tech", ...(more.flags ?? {}) };
  return {
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: flags },
    system: { tl: more.tl ?? "6", carried: true, equipped: false, ...(more.system ?? {}) },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
  };
}

function person(name: string, items: any[] = [], more: Record<string, any> = {}): any {
  const actor: any = { name, uuid: `Actor.${name}`, items, ...more };
  for (const item of items) item.actor = actor;
  return actor;
}

const trait = (name: string) => ({ name, type: "trait" });

beforeAll(() => {
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
    get actors() { return actors; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), getWhisperRecipients: () => [{ id: "gm" }], create: async (m: any) => { chat.push(m.whisper ? `whisper:${m.whisper.join()} ${m.content}` : m.content); } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  LIE_DETECTOR_TABLES.clear();
  RESTRAINT_TABLES.clear();
  initEnforcement({ lieDetection: LIES, restraints: RESTRAINTS });
  readyEnforcement(api);
});

beforeEach(() => {
  on = new Set([LIES, RESTRAINTS]);
  setRuleReader((key) => on.has(key));
  targets = [];
  actors = [];
  chat = [];
  successResult = { success: true };
  successCalls = [];
  contestResult = null;
  contestCalls = [];
});

afterAll(() => {
  setRuleReader(() => false);
  LIE_DETECTOR_TABLES.clear();
  RESTRAINT_TABLES.clear();
  vi.unstubAllGlobals();
});

const roll = (actor: any, context: Record<string, unknown>) => fire(HOOKS.successRollModifiers, { actor, modifiers: [], tags: [], ...context }).modifiers;
const attack = (actor: any, item: any, mode: Record<string, unknown>) => fire(HOOKS.attackModifiers, { actor, item, mode, modifiers: [] }).refusal;
/** A bare-handed blow, as the system names it since API 1.111.0: no item or mode. */
const unarmed = (actor: any, blow: "punch" | "kick") => fire(HOOKS.attackModifiers, { actor, item: null, mode: null, unarmed: blow, modifiers: [] }).refusal;

describe("with the switches off", () => {
  it("changes nothing", () => {
    on = new Set();
    const cuffs = gear("Handcuffs", { flags: { restraint: "behind" } });
    const irons = gear("Leg Irons", { tl: "5", flags: { restraint: "on" } });
    const prisoner = person("Prisoner", [cuffs, irons]);
    expect(roll(prisoner, { kind: "attribute", tags: ["DX"] })).toEqual([]);
    expect(attack(prisoner, gear("Knife", { system: { meleeModes: [{ twoHanded: false }] } }), { index: 0, ranged: false })).toBeUndefined();
    const traits = fire("gworld.traitEffects", { actor: prisoner, effects: { lame: null }, sources: [] });
    expect(traits.effects.lame).toBeNull();
    expect(sections.get("restraint-item").visible(cuffs)).toBe(false);
    expect(actions.get("lie-detector-test").visible(gear("Polygraph (TL8)"))).toBe(false);
  });

  it("needs only its own switch", () => {
    on = new Set([RESTRAINTS]);
    expect(sections.get("restraint-item").visible(gear("Handcuffs"))).toBe(true);
    expect(sections.get("lie-detector-item").visible(gear("Polygraph (TL8)"))).toBe(false);
    on = new Set([LIES]);
    expect(sections.get("restraint-item").visible(gear("Handcuffs"))).toBe(false);
    expect(sections.get("lie-detector-item").visible(gear("Polygraph (TL8)"))).toBe(true);
  });
});

describe("cuffed behind the back (p. 217)", () => {
  const cuffed = () => person("Prisoner", [gear("Handcuffs", { flags: { restraint: "behind" } })]);

  it("is -1 on DX-based rolls and attacks, -4 on hands-only tasks", () => {
    const prisoner = cuffed();
    expect(roll(prisoner, { kind: "skill", skill: "Stealth", tags: ["DX"] }).map((l: any) => l.value)).toEqual([-1]);
    expect(roll(prisoner, { kind: "attack" }).map((l: any) => l.value)).toEqual([-1]);
    expect(roll(prisoner, { kind: "skill", skill: "Lockpicking", tags: ["IQ"] }).map((l: any) => l.value)).toEqual([-4]);
    expect(roll(prisoner, { kind: "skill", skill: "Sleight of Hand", tags: ["DX"] }).map((l: any) => l.value)).toEqual([-4]);
  });

  it("leaves defenses, IQ rolls and the Escape roll alone", () => {
    const prisoner = cuffed();
    expect(roll(prisoner, { kind: "defense", tags: ["dodge"] })).toEqual([]);
    expect(roll(prisoner, { kind: "skill", skill: "Diplomacy", tags: ["IQ"] })).toEqual([]);
    expect(roll(prisoner, { kind: "skill", skill: "Escape", tags: ["DX"] })).toEqual([]);
  });

  it("refuses every weapon", () => {
    const prisoner = cuffed();
    expect(attack(prisoner, gear("Broadsword", { system: { meleeModes: [{ twoHanded: true }] } }), { index: 0, ranged: false })).toContain("NoWeapons");
    expect(attack(prisoner, gear("Pistol"), { index: 0, ranged: true })).toContain("NoWeapons");
    expect(attack(prisoner, null, { index: 0, ranged: false })).toBeUndefined();
  });

  it("refuses a punch, and leaves the kick", () => {
    const prisoner = cuffed();
    expect(unarmed(prisoner, "punch")).toContain("NoPunch");
    expect(unarmed(prisoner, "kick")).toBeUndefined();
  });

  it("does nothing while the cuffs are only carried", () => {
    const prisoner = person("Guard", [gear("Handcuffs")]);
    expect(roll(prisoner, { kind: "attack" })).toEqual([]);
  });
});

describe("cuffed in front (p. 217)", () => {
  const cuffed = () => person("Prisoner", [gear("Flex Cuffs (pack of 10)", { tl: "7", flags: { restraint: "front" } })]);

  it("is -1 on hands-only tasks and nothing on DX", () => {
    const prisoner = cuffed();
    expect(roll(prisoner, { kind: "skill", skill: "Stealth", tags: ["DX"] })).toEqual([]);
    expect(roll(prisoner, { kind: "skill", skill: "Lockpicking", tags: ["IQ"] }).map((l: any) => l.value)).toEqual([-1]);
  });

  it("refuses one-handed blows only", () => {
    const prisoner = cuffed();
    expect(attack(prisoner, gear("Knife", { system: { meleeModes: [{ twoHanded: false }] } }), { index: 0, ranged: false })).toContain("NoOneHanded");
    expect(attack(prisoner, gear("Rifle Butt", { system: { meleeModes: [{ twoHanded: true }] } }), { index: 0, ranged: false })).toBeUndefined();
    expect(attack(prisoner, gear("Pistol"), { index: 0, ranged: true })).toBeUndefined();
    // Cuffed in front, the hands can still strike together.
    expect(unarmed(prisoner, "punch")).toBeUndefined();
  });
});

describe("a straitjacket and leg irons (p. 217)", () => {
  it("holds a straitjacket's wearer as cuffed behind, with no slipping", () => {
    const jacket = gear("Straitjacket", { tl: "5", flags: { restraint: "on" } });
    const patient = person("Patient", [jacket]);
    expect(roll(patient, { kind: "attack" }).map((l: any) => l.value)).toEqual([-1]);
    expect(attack(patient, gear("Knife", { system: { meleeModes: [{ twoHanded: false }] } }), { index: 0, ranged: false })).toContain("NoWeapons");
    expect(unarmed(patient, "punch")).toContain("NoPunch");
    expect(actions.get("restraint-slip").visible(jacket)).toBe(false);
    expect(actions.get("restraint-escape").visible(jacket)).toBe(true);
  });

  it("makes leg irons Crippled Legs", () => {
    const irons = gear("Leg Irons (Ball and Chain)", { tl: "5", flags: { restraint: "on" } });
    const prisoner = person("Prisoner", [irons]);
    const context = fire("gworld.traitEffects", { actor: prisoner, effects: { lame: null }, sources: [] });
    expect(context.effects.lame).toBe("crippled");
    expect(context.sources).toEqual([{ effect: "lame", label: "Leg Irons (Ball and Chain)" }]);
    // No kick in leg irons; the hands are free to punch.
    expect(unarmed(prisoner, "kick")).toContain("NoKick");
    expect(unarmed(prisoner, "punch")).toBeUndefined();
    // A worse lameness the character already has stays.
    expect(fire("gworld.traitEffects", { actor: prisoner, effects: { lame: "missing" }, sources: [] }).effects.lame).toBe("missing");
    const lines = sections.get("restraint-item").context(irons).lines as string[];
    expect(lines.some((l) => l.includes("Restraints.LegIrons"))).toBe(true);
    expect(lines.some((l) => l.includes("Restraints.Ball"))).toBe(true);
  });
});

describe("getting out (p. 217)", () => {
  it("rolls Escape at the handcuffs' -5, and takes them off on a success", async () => {
    const cuffs = gear("Handcuffs", { flags: { restraint: "behind" } });
    const prisoner = person("Prisoner", [cuffs], { skills: { Escape: 14 } });
    await actions.get("restraint-escape").run(cuffs, prisoner);
    expect(successCalls[0]).toMatchObject({ base: 14, skill: "Escape", modifiers: [{ label: "Handcuffs", value: -5 }] });
    expect(cuffs.flags[MODULE_ID].restraint).toBe("off");
    expect(actions.get("restraint-escape").visible(cuffs)).toBe(false);
  });

  it("leaves them on after a failure", async () => {
    successResult = { success: false };
    const cuffs = gear("Handcuffs", { flags: { restraint: "behind" } });
    await actions.get("restraint-escape").run(cuffs, person("Prisoner", [cuffs]));
    // Escape defaults to DX-6.
    expect(successCalls[0].base).toBe(4);
    expect(cuffs.flags[MODULE_ID].restraint).toBe("behind");
  });

  it("rolls ratcheting leg irons at -5", async () => {
    const irons = gear("Leg Irons", { tl: "7", flags: { restraint: "on" } });
    await actions.get("restraint-escape").run(irons, person("Prisoner", [irons]));
    expect(successCalls[0].modifiers).toEqual([{ label: "Leg Irons", value: -5 }]);
  });

  it("slips cuffed wrists round to the front on the better of Acrobatics and Escape", async () => {
    const cuffs = gear("Shackles", { tl: "5", flags: { restraint: "behind" } });
    const prisoner = person("Prisoner", [cuffs], { skills: { Acrobatics: 13, Escape: 11 } });
    expect(actions.get("restraint-slip").visible(cuffs)).toBe(true);
    await actions.get("restraint-slip").run(cuffs, prisoner);
    expect(successCalls[0]).toMatchObject({ base: 13, skill: "Acrobatics" });
    expect(cuffs.flags[MODULE_ID].restraint).toBe("front");
    expect(actions.get("restraint-slip").visible(cuffs)).toBe(false);
  });

  it("puts a restraint on from its sheet section", () => {
    const cuffs = gear("Handcuffs");
    const context = sections.get("restraint-item").context(cuffs);
    expect(context.states.map((s: any) => s.value)).toEqual(["off", "behind", "front"]);
    expect(context.states.find((s: any) => s.selected).value).toBe("off");
    expect(context.lines[0]).toContain('"modifier":"-5"');
    const irons = sections.get("restraint-item").context(gear("Leg Irons", { tl: "5" }));
    expect(irons.states.map((s: any) => s.value)).toEqual(["off", "on"]);
  });
});

describe("lie detection (pp. 215-216)", () => {
  async function test(machineName: string, outcome: any, subject: any) {
    const machine = gear(machineName, { tl: "8" });
    const operator = person("Technician", [machine], { skills: { "Electronics Operation (Medical)": 13 } });
    actors = [operator, subject];
    targets = [subject];
    contestResult = outcome;
    await actions.get("lie-detector-test").run(machine, operator);
    return { machine, operator };
  }

  it("runs a Quick Contest of Electronics Operation (Medical) against Will, and puts the margin on Interrogation", async () => {
    const suspect = person("Suspect", [], { attributes: { Will: 11 } });
    const { machine } = await test("Polygraph (TL8)", { outcome: "first", marginOfVictory: 3 }, suspect);
    expect(contestCalls[0]).toMatchObject({ first: { base: 13 }, second: { actor: suspect, base: 11 }, secret: true });
    expect(machine.flags[MODULE_ID].lieReading).toEqual({ subject: "Actor.Suspect", name: "Suspect", margin: 3 });
    // The GM makes these rolls in secret: the reading is told to the GMs alone.
    expect(chat.at(-1)).toMatch(/^whisper:gm .*LieDetection\.Kept/);
    // The questioner need not be the operator: the reading is on the machine, whoever carries it.
    const detective = person("Detective");
    targets = [];
    expect(roll(detective, { kind: "contest", skill: "Interrogation", opponent: suspect }).map((l: any) => l.value)).toEqual([3]);
    targets = [suspect];
    expect(roll(detective, { kind: "skill", skill: "Interrogation" }).map((l: any) => l.value)).toEqual([3]);
    // Not against anyone else, and not on other skills.
    expect(roll(detective, { kind: "skill", skill: "Interrogation", opponent: person("Other") })).toEqual([]);
    expect(roll(detective, { kind: "skill", skill: "Detect Lies", opponent: suspect })).toEqual([]);
  });

  it("gives the interrogators a penalty when the operator loses", async () => {
    const suspect = person("Suspect");
    await test("Polygraph (TL6)", { outcome: "second", marginOfVictory: 2 }, suspect);
    expect(roll(person("Detective"), { skill: "Interrogation", opponent: suspect }).map((l: any) => l.value)).toEqual([-2]);
  });

  it("gives half with a voice stress analyser", async () => {
    const suspect = person("Suspect");
    await test("VSA", { outcome: "first", marginOfVictory: 3 }, suspect);
    expect(roll(person("Detective"), { skill: "Interrogation", opponent: suspect }).map((l: any) => l.value)).toEqual([1]);
  });

  it("reads a compulsive liar as truthful: -5 whatever the margin", async () => {
    const liar = person("Liar", [trait("Compulsive Lying")]);
    await test("Polygraph (TL8)", { outcome: "first", marginOfVictory: 6 }, liar);
    expect(contestCalls).toHaveLength(1);
    expect(roll(person("Detective"), { skill: "Interrogation", opponent: liar }).map((l: any) => l.value)).toEqual([-5]);
  });

  it("finds a reading on a machine an unlinked token carries, which the world's actors don't hold", async () => {
    const suspect = person("Suspect");
    const { operator } = await test("Polygraph (TL8)", { outcome: "first", marginOfVictory: 2 }, suspect);
    // The technician is an unlinked token on the scene: not among the world's actors.
    actors = [suspect];
    expect(roll(person("Detective"), { skill: "Interrogation", opponent: suspect })).toEqual([]);
    vi.stubGlobal("canvas", { scene: { tokens: [{ actorLink: false, actor: operator }, { actorLink: true, actor: suspect }] } });
    try {
      expect(roll(person("Detective"), { skill: "Interrogation", opponent: suspect }).map((l: any) => l.value)).toEqual([2]);
    } finally {
      vi.stubGlobal("canvas", undefined);
    }
  });

  it("clears a reading", async () => {
    const suspect = person("Suspect");
    const { machine } = await test("Polygraph (TL8)", { outcome: "first", marginOfVictory: 3 }, suspect);
    expect(actions.get("lie-detector-clear").visible(machine)).toBe(true);
    await actions.get("lie-detector-clear").run(machine);
    expect(roll(person("Detective"), { skill: "Interrogation", opponent: suspect })).toEqual([]);
  });

  it("asks for one subject targeted", async () => {
    const machine = gear("Polygraph (TL8)");
    targets = [];
    await actions.get("lie-detector-test").run(machine, person("Technician", [machine]));
    expect(contestCalls).toEqual([]);
  });
});
