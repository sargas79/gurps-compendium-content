/**
 * The supplement's electromedicine as the system meets it (HT:EE pp. 13-14,
 * 21): the pain steps, electroconvulsive therapy's Seizure, Mitigator and
 * memory roll, and the laser scalpel on an operation -- with only
 * High-Tech's switch on (decisions D1, E1). The records are the supplement's
 * as the catalogue writes them (#478).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import { ECT_FLAG, easePain, readyElectromedicine } from "./index.js";
import { easedPain, electromedicineOf, worstPain } from "./rules.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let successes: any[];
let successResults: any[];
let injuries: any[];
let conditions: any[];
let chat: string[];
let on: boolean;
let targets: any[];
let worldTime: number;

function fakeApi() {
  return {
    combat: { hooks: { successRollModifiers: "gworld.successRollModifiers" } },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      applyInjury: async (actor: any, o: any) => { injuries.push({ actor, ...o }); return {}; },
      conditions: (actor: any) => actor.entries,
      // As the system does: a system condition's entry, and its token status.
      applyCondition: async (actor: any, o: any) => {
        conditions.push({ actor, apply: o.key, duration: o.duration });
        actor.entries = [...actor.entries.filter((c: any) => c.id !== o.key), { id: o.key, untilTime: o.duration?.seconds ? worldTime + o.duration.seconds : null }];
        actor.statuses.add(o.key);
        return o.key;
      },
      removeCondition: async (actor: any, id: string) => {
        conditions.push({ actor, remove: id });
        if (!actor.entries.some((c: any) => c.id === id)) return;
        actor.entries = actor.entries.filter((c: any) => c.id !== id);
        actor.statuses.delete(id);
      },
    },
    roll: { success: async (o: any) => { successes.push(o); return successResults.shift() ?? { success: true }; } },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

function record(name: string, device: Record<string, any> = {}, book: string | null = "high-tech"): any {
  return {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: book ? { [MODULE_ID]: { book } } : {},
    system: { tl: "7", carried: true, equipped: false, extensions: { [MODULE_ID]: { device } } },
  };
}

function person(name: string, items: any[] = [], more: Record<string, any> = {}): any {
  const flags: Record<string, unknown> = {};
  return {
    name,
    uuid: `Actor.${name}`,
    items,
    attributes: { IQ: 12, HT: 11 },
    skills: {},
    statuses: new Set<string>(more.statuses ?? []),
    entries: more.entries ?? [],
    getFlag: (_s: string, key: string) => flags[key],
    setFlag: async (_s: string, key: string, value: unknown) => { flags[key] = value; },
    ...Object.fromEntries(Object.entries(more).filter(([k]) => !["statuses", "entries"].includes(k))),
  };
}

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
async function run(key: string, item: any, actor: any): Promise<void> {
  actions.get(key).run(item, actor);
  await flush();
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  successes = [];
  successResults = [];
  injuries = [];
  conditions = [];
  chat = [];
  on = false;
  targets = [];
  worldTime = 1000;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    get user() { return { targets: new Set(targets.map((actor) => ({ actor }))) }; },
    get time() { return { worldTime }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class { total = 3; async evaluate() { return this; } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  readyElectromedicine(fakeApi() as never, () => on);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the records (HT:EE pp. 13-14, 21)", () => {
  it("knows the supplement's electromedicine by name", () => {
    expect(electromedicineOf("Portable Diathermy Apparatus")).toBe("diathermy");
    expect(electromedicineOf("Heating Pad")).toBe("heatingPad");
    expect(electromedicineOf("Electroconvulsive Therapy Device")).toBe("ect");
    expect(electromedicineOf("Laser Scalpel")).toBe("laserScalpel");
    expect(electromedicineOf("Electrocautery")).toBeNull();
  });

  it("offers nothing with the switch off", () => {
    for (const [key, name] of [["ee-diathermy", "Portable Diathermy Apparatus"], ["ee-heating-pad", "Heating Pad"], ["ee-electroconvulsive", "Electroconvulsive Therapy Device"]]) {
      expect(actions.get(key!).visible(record(name!)), key).toBe(false);
    }
    expect(sections.get("ee-electromedicine-item").visible(record("Laser Scalpel"))).toBe(false);
    on = true;
    expect(actions.get("ee-diathermy").visible(record("Portable Diathermy Apparatus"))).toBe(true);
    expect(actions.get("ee-diathermy").visible(record("Heating Pad"))).toBe(false);
    expect(sections.get("ee-electromedicine-item").context(record("Portable Diathermy Apparatus")).early).toEqual({ checked: false });
  });
});

describe("easing pain (HT:EE pp. 13, 21; Campaigns p. 428)", () => {
  beforeEach(() => { on = true; });

  it("steps pain down a grade, and none below Moderate", () => {
    expect(worstPain(new Set(["moderatePain", "severePain"]))).toBe("severePain");
    expect(easedPain("agony")).toBe("terriblePain");
    expect(easedPain("severePain")).toBe("moderatePain");
    expect(easedPain("moderatePain")).toBeNull();
  });

  it("takes off pain set from the token, and keeps what was left of a timed one", async () => {
    const fromToken = person("Patient", [], { statuses: ["severePain"] });
    await easePain(fakeApi() as never, fromToken);
    expect([...fromToken.statuses]).toEqual(["moderatePain"]);
    const timed = person("Patient", [], { statuses: ["terriblePain"], entries: [{ id: "terriblePain", untilTime: 1600 }] });
    expect(await easePain(fakeApi() as never, timed)).toEqual({ from: "terriblePain", to: "severePain" });
    expect(conditions.at(-1)).toMatchObject({ apply: "severePain", duration: { seconds: 600 } });
  });

  it("eases pain with diathermy on the healer's Physician, -2 on an early machine, whose critical failure burns", async () => {
    const doctor = person("Doctor", [], { skills: { Physician: 14 } });
    const patient = person("Patient", [], { statuses: ["severePain"] });
    targets = [patient];
    await run("ee-diathermy", record("Portable Diathermy Apparatus"), doctor);
    expect(successes[0]).toMatchObject({ actor: doctor, base: 14, skill: "Physician", modifiers: [] });
    expect([...patient.statuses]).toEqual(["moderatePain"]);
    successResults = [{ success: false, criticalFailure: true }];
    await run("ee-diathermy", record("Portable Diathermy Apparatus", { earlyModel: true }), doctor);
    expect(successes[1].modifiers).toEqual([{ label: "GCC.HT.Electromedicine.EarlyMachine", value: -2 }]);
    expect(injuries).toEqual([expect.objectContaining({ actor: patient, amount: 3 })]);
    expect([...patient.statuses]).toEqual(["moderatePain"]);
  });

  it("eases lasting pain on a heating pad with the patient's own HT", async () => {
    const patient = person("Patient", [], { statuses: ["moderatePain"] });
    await run("ee-heating-pad", record("Heating Pad"), patient);
    expect(successes[0]).toMatchObject({ actor: patient, base: 11, kind: "attribute", skill: "HT" });
    expect([...patient.statuses]).toEqual([]);
  });
});

describe("electroconvulsive therapy (HT:EE p. 14)", () => {
  beforeEach(() => { on = true; });
  const traits = (actor: any) => fire("gworld.traitsInPlay", { actor, traits: [{ name: "Chronic Depression (12)", inPlay: true }, { name: "Bad Temper (12)", inPlay: true }] }).traits;

  it("gives a Seizure, mitigates Chronic Depression for a year on the course's Physician roll, and rolls HT-2 against memory loss", async () => {
    const doctor = person("Doctor", [], { skills: { Physician: 13 } });
    const patient = person("Patient");
    targets = [patient];
    successResults = [{ success: true }, { success: false }];
    await run("ee-electroconvulsive", record("Electroconvulsive Therapy Device"), doctor);
    expect(successes[0]).toMatchObject({ actor: doctor, base: 13, skill: "Physician" });
    expect(successes[1]).toMatchObject({ actor: patient, base: 11, skill: "HT", modifiers: [{ value: -2 }] });
    expect(conditions).toContainEqual(expect.objectContaining({ apply: "seizure", duration: { seconds: 180 } }));
    expect(injuries).toEqual([expect.objectContaining({ actor: patient, amount: 3, fatigue: true })]);
    expect(chat.at(-1)).toContain("Amnesia");
    expect(traits(patient).map((t: any) => t.inPlay)).toEqual([false, true]);
    // A year on, it's back.
    worldTime += 366 * 24 * 3600;
    expect(traits(patient).map((t: any) => t.inPlay)).toEqual([true, true]);
  });

  it("does no lasting good on a failed course, and wants a targeted patient", async () => {
    const doctor = person("Doctor");
    await run("ee-electroconvulsive", record("Electroconvulsive Therapy Device"), doctor);
    expect(successes).toEqual([]);
    const patient = person("Patient");
    targets = [patient];
    successResults = [{ success: false }, { success: true }];
    await run("ee-electroconvulsive", record("Electroconvulsive Therapy Device"), doctor);
    // Physician at IQ-7 unlearned.
    expect(successes[0].base).toBe(5);
    expect(patient.getFlag(MODULE_ID, ECT_FLAG)).toBeUndefined();
    expect(traits(patient).map((t: any) => t.inPlay)).toEqual([true, true]);
  });
});

describe("the laser scalpel (HT:EE p. 14)", () => {
  it("gives +2 to Surgery on an operation, the scalpel carried", () => {
    const surgeon = person("Surgeon", [record("Laser Scalpel")]);
    const roll = (actor: any, skill: string, tags: string[]) => fire("gworld.successRollModifiers", { actor, skill, tags, modifiers: [] }).modifiers;
    expect(roll(surgeon, "Surgery", ["surgery"])).toEqual([]);
    on = true;
    expect(roll(surgeon, "Surgery", ["surgery"])).toEqual([{ label: "Laser Scalpel", value: 2 }]);
    expect(roll(surgeon, "First Aid", ["firstAid"])).toEqual([]);
    expect(roll(person("Surgeon"), "Surgery", ["surgery"])).toEqual([]);
  });
});
