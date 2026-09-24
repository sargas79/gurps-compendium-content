/**
 * The supplement's skills as the system meets them (HT:EE pp. 6-8, 15): the
 * records in High-Tech's skills pack, and the `skillSubstitutes` switch's
 * `gworld.skillLevels` listener -- with only High-Tech's switches on
 * (decision D1). The listener gets the skills as the system hands them over:
 * each with its item, its level and whether that is a default.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { hotStickPenalty } from "../electricity/index.js";
import { readySkills } from "./index.js";

type Listener = (...args: any[]) => void;

const PACK = join(import.meta.dirname, "../../../../books/high-tech/packs-src/skills/high-tech-ee-skills.json");
const records = JSON.parse(readFileSync(PACK, "utf8")) as any[];
const byName = (name: string) => {
  const found = records.find((r) => r.name === name);
  if (!found) throw new Error(`no record ${name}`);
  return found;
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let successes: any[];
let dialogAnswer: any;
let on: boolean;

function fakeApi() {
  return {
    rules,
    data: { hooks: { skillLevels: "gworld.skillLevels" } },
    sheets: { registerRowAction: (a: any) => actions.set(a.key, a) },
    actors: { skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null },
    roll: { success: async (o: any) => { successes.push(o); return { success: true }; } },
  };
}

/** A skill as `gworld.skillLevels` hands it over. */
function entry(name: string, level: number | null, derived: Record<string, unknown> = {}, system: Record<string, unknown> = {}) {
  return {
    name,
    level,
    fromDefault: derived.fromDefault ?? (Number(system.points) || 0) === 0,
    item: { name, system: { attribute: "IQ", difficulty: "A", points: 0, ...system, derived: { level, relativeLevel: null, defaultCredit: 0, ...derived } } },
  };
}

function fire(skills: any[], attributes: Record<string, number> = { IQ: 12 }) {
  const context = { actor: {}, skills, levelOf: () => null, attributes };
  for (const fn of hooks.get("gworld.skillLevels") ?? []) fn(context);
  return skills;
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  successes = [];
  dialogAnswer = null;
  on = true;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (t: string) => t }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  readySkills(fakeApi() as never, { substitutes: () => on });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the supplement's skill records (HT:EE pp. 6-8, 13, 15, 17, 21)", () => {
  it("are the new skills, specialties and technique, each citing the supplement", () => {
    expect(records.map((r) => r.name).sort()).toEqual([
      "Artist (Neon)",
      "Engineer/TL (Analog Computers)",
      "Hobby Skill (Feats of Science)",
      "Hot Stick",
      "Machine Operation/TL (Analog Computers)",
      "Machine Operation/TL (Printing Presses)",
      "Machine Operation/TL (Water Pumps)",
      "Machine Operation/TL (Wind Generator)",
      "Mechanic/TL (Analog Computers)",
      "Mechanic/TL (Electric Motor)",
      "Mechanic/TL (Robotics)",
      "Musical Instrument (Stylophone)",
      "Musical Instrument (Theremin)",
      "Musical Instrument (Trautonium)",
      "Physics/TL (Electromagnetism)",
    ]);
    for (const r of records) expect(r.system.reference).toMatch(/^High-Tech: Electricity and Electronics p\. \d+$/);
    expect(new Set(records.map((r) => r._id)).size).toBe(records.length);
  });

  it("carry the printed difficulties and defaults, signs and all", () => {
    const defaults = (name: string) => byName(name).system.defaults.map((d: any) => `${d.skill || d.attribute}${d.modifier}`);
    expect(byName("Machine Operation/TL (Water Pumps)").system).toMatchObject({ attribute: "IQ", difficulty: "A" });
    expect(defaults("Machine Operation/TL (Water Pumps)")).toEqual(["IQ-5", "Electrician-5", "Engineer (Electrical)-5"]);
    expect(defaults("Machine Operation/TL (Analog Computers)")).toEqual(["IQ-5", "Mechanic (Analog Computers)-5", "Engineer (Analog Computers)-5"]);
    expect(defaults("Musical Instrument (Stylophone)")).toEqual(["Musical Instrument (Dulcimer)-4", "Musical Instrument (Mbira)-4", "Musical Instrument (Tuned Percussion)-4", "Musical Instrument (Keyboard)-5"]);
    expect(defaults("Musical Instrument (Theremin)")).toEqual(["Musical Instrument (Trautonium)-4"]);
    expect(defaults("Musical Instrument (Trautonium)")).toEqual(["Musical Instrument (Fiddle)-3", "Musical Instrument (Rebab)-3", "Musical Instrument (Theremin)-4"]);
    expect(byName("Hobby Skill (Feats of Science)").system).toMatchObject({ attribute: "IQ", difficulty: "E" });
    // An optional specialty is learned a level easier than Physics, IQ/Very Hard (Characters p. 169).
    expect(byName("Physics/TL (Electromagnetism)").system).toMatchObject({ attribute: "IQ", difficulty: "H" });
  });

  it("names the hard technique Hot Stick, off Electrician at -2, as #486's power work reads it", () => {
    const technique = byName("Hot Stick");
    expect(technique).toMatchObject({ type: "technique", system: { difficulty: "H", prerequisite: "Electrician", defaultModifier: -2, maxRelativeToPrerequisite: 0 } });
    const actor = { skills: { Electrician: 13 }, items: [{ type: "technique", name: technique.name, system: { ...technique.system, derived: { level: 12, levels: 1 } } }] };
    // Bought one level up from Electrician-2: the power-line work is at -1.
    expect(hotStickPenalty(fakeApi() as never, actor)).toBe(-1);
  });
});

describe("the new defaults, with the switch on (HT:EE pp. 6-7)", () => {
  it("does nothing with the switch off", () => {
    on = false;
    const skills = fire([entry("Diagnosis/TL", 14, {}, { points: 8 }), entry("Electronics Operation/TL (Medical)", 7)]);
    expect(skills[1]).toMatchObject({ level: 7 });
    expect(skills[1].note).toBeUndefined();
  });

  it("gives an unlearned Electronics Operation (Medical) Diagnosis-2, with a note naming it", () => {
    const skills = fire([entry("Diagnosis/TL", 14, {}, { points: 8 }), entry("Electronics Operation/TL (Medical)", 7)]);
    expect(skills[1]).toMatchObject({ level: 12, fromDefault: true, source: MODULE_ID });
    expect(skills[1].note).toBe('GCC.HT.Skills.Default {"skill":"Diagnosis/TL-2","page":6}');
  });

  it("buys points up from the new default", () => {
    // IQ 12, 1 point in Electronics Operation (Security): 11. Traps 15 gives 13
    // at default, worth 4 points (IQ+1); 1 + 4 = 5 points buys IQ+1 = 13.
    const trained = entry("Electronics Operation/TL (Security)", 11, { fromDefault: false, relativeLevel: -1 }, { points: 1 });
    const skills = fire([entry("Traps/TL", 15, {}, { points: 12 }), trained]);
    expect(skills[1]).toMatchObject({ level: 13, fromDefault: false });
    // 4 points bought (IQ+1 = 13) and a default at 13 worth 4: 8 points, IQ+2 = 14.
    const four = entry("Electronics Operation/TL (Security)", 13, { fromDefault: false, relativeLevel: 1 }, { points: 4 });
    expect(fire([entry("Traps/TL", 15, {}, { points: 12 }), four])[1]).toMatchObject({ level: 14, fromDefault: false });
  });

  it("gives the scientific instruments the best science at -2, Sensors and Sonar for scientific work", () => {
    const skills = fire([entry("Geology/TL", 15, {}, { points: 8 }), entry("Electronics Operation/TL (Sonar)", 7), entry("Electronics Operation/TL (Scientific)", 7)]);
    expect(skills[1]).toMatchObject({ level: 13 });
    expect(skills[1].note).toBe('GCC.HT.Skills.Default {"skill":"Geology/TL-2","page":6} GCC.HT.Skills.Scope.scientific');
    expect(skills[2]).toMatchObject({ level: 13 });
  });

  it("reads each skill as the system worked it out, so one new default doesn't feed another", () => {
    const skills = fire([entry("Photography/TL", 16, {}, { points: 12 }), entry("Electronics Operation/TL (Media)", 7), entry("Electronics Repair/TL (Media)", 6)]);
    expect(skills[1]).toMatchObject({ level: 11 });
    expect(skills[0]).toMatchObject({ level: 16 });
    expect(skills[2]).toMatchObject({ level: 6 });
  });
});

describe("the skills that stand in, with the switch on (HT:EE pp. 7-8)", () => {
  const flush = async () => { for (let n = 0; n < 20; n += 1) await Promise.resolve(); };

  it("leaves the levels alone: a hobbyist's Electrician isn't raised for a power line", () => {
    const skills = fire([entry("Hobby Skill (Feats of Science)", 14, {}, { points: 4, difficulty: "E" }), entry("Electrician/TL", 7), entry("Physics/TL (Electromagnetism)", 14, {}, { points: 8, difficulty: "H" }), entry("Physics/TL", 6)]);
    expect(skills.map((s) => s.level)).toEqual([14, 7, 14, 6]);
    expect(skills.every((s) => s.note === undefined)).toBe(true);
  });

  it("offers the roll on a skill that stands in, only with the switch on", () => {
    const action = actions.get("ht-skill-stand-in")!;
    expect(action.itemTypes).toEqual(["skill"]);
    expect(action.visible({ name: byName("Physics/TL (Electromagnetism)").name })).toBe(true);
    expect(action.visible({ name: byName("Hobby Skill (Feats of Science)").name })).toBe(true);
    expect(action.visible({ name: "Hobby Skill (Stamps)" })).toBe(false);
    on = false;
    expect(action.visible({ name: "Physics/TL (Electromagnetism)" })).toBe(false);
  });

  it("rolls Physics (Electromagnetism) at its own level in the place the player picks", async () => {
    const item = { name: "Physics/TL (Electromagnetism)" };
    const actor = { skills: { [item.name]: 14 } };
    dialogAnswer = 1;
    actions.get("ht-skill-stand-in")!.run(item, actor);
    await flush();
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ actor, base: 14, kind: "skill", skill: item.name, item, tags: ["skillSubstitute"] });
    expect(successes[0].label).toBe('GCC.HT.Skills.StandInLabel {"skill":"Physics/TL (Electromagnetism)","target":"Engineer (Electrical)","scope":"GCC.HT.Skills.Scope.proofOfConcept","page":8}');
  });

  it("rolls nothing when the dialog is closed", async () => {
    actions.get("ht-skill-stand-in")!.run({ name: "Hobby Skill (Amateur Radio)" }, { skills: { "Hobby Skill (Amateur Radio)": 13 } });
    await flush();
    expect(successes).toHaveLength(0);
  });
});
