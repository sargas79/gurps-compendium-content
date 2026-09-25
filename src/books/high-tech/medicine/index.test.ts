/**
 * Emergency medicine and medical facilities as the system meets them: the
 * resuscitation, First Aid, surgery and infection rolls through
 * `gworld.successRollModifiers`, the treating skills' equipment lines through
 * `gworld.skillBonuses`, and the row actions -- with only High-Tech's
 * switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MEDICAL_TABLES, deviceFor } from "../../../shared/medical/rules.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyMedicine } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = { successRollModifiers: "gworld.successRollModifiers", firstAid: "gworld.firstAid", physicianRounds: "gworld.physicianRounds" };

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let tools: Map<string, any>;
let sections: any[];
let successes: any[];
let resuscitations: any[];
let injuries: any[];
let rads: any[];
let chat: string[];
let on: Record<string, boolean>;
let successResults: any[];
let dialogAnswer: any;
let targets: any[];
let controlled: any[];
let worldTime: number;
let systemRules: Set<string>;
let graders: any[] = [];

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

function fakeApi() {
  return {
    rules,
    items: { changeQuantity: async (i: any, delta: number, o: any = {}) => { const from = Number(i.system.quantity) || 0; i.system.quantity = Math.max(0, from + delta); return { from, to: i.system.quantity, reason: o.reason ?? "" }; } },
    registry: { isRuleOn: (key: string) => systemRules.has(key) },
    data: { hooks: { skillBonuses: "gworld.skillBonuses" }, registerToolGrade: (g: any) => { graders.push(g); return `${g.module}.${g.key}`; } },
    combat: { hooks: HOOKS },
    sheets: {
      registerSheetSection: (x: any) => sections.push(x),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      applyInjury: async (actor: any, o: any) => { injuries.push({ actor, ...o }); return { pool: "fp" }; },
      spendFatigue: async (actor: any, fp: number, o: any = {}) => { injuries.push({ actor, amount: fp, spent: true, ...o }); return { fpLost: fp }; },
      // As the system does: the healer's roll passes through the modifiers hook.
      resuscitate: async (o: any) => {
        const context = fire(HOOKS.successRollModifiers, { actor: o.healer, tags: ["resuscitation", o.cause ?? "heartAttack"], modifiers: [], opponent: o.patient });
        resuscitations.push({ ...o, lines: context.modifiers });
      },
    },
    hazards: { irradiate: async (o: any) => { rads.push(o); } },
    roll: { success: async (o: any) => { successes.push(o); return successResults.shift() ?? { success: true }; } },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function gear(name: string, medical: Record<string, unknown> | null, more: Record<string, any> = {}, book: string | null = "high-tech"): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: book ? { [MODULE_ID]: { book } } : {},
    system: { tl: "8", carried: true, quantity: 1, equipmentQuality: "basic", equipmentModifier: null, forSkills: [], extensions: medical ? { [MODULE_ID]: { medical } } : {}, ...more },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  item.getFlag = (_scope: string, key: string) => item.flags[MODULE_ID]?.[key];
  item.setFlag = async (_scope: string, key: string, value: unknown) => { (item.flags[MODULE_ID] ??= {})[key] = value; };
  return item;
}

function person(name: string, items: any[] = [], more: Record<string, any> = {}): any {
  const flags: Record<string, unknown> = { ...(more.flags ?? {}) };
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    items,
    attributes: { IQ: 11, HT: 10 },
    skills: {},
    statuses: new Set<string>(more.statuses ?? []),
    system: { tl: 8, ...(more.system ?? {}) },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    ...Object.fromEntries(Object.entries(more).filter(([k]) => !["flags", "statuses", "system"].includes(k))),
  };
}

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

function ready(): void {
  readyMedicine(fakeApi() as never, { emergency: () => on.emergencyMedicine === true, facilities: () => on.medicalFacilities === true });
}

function skillLines(actor: any, name: string, lines: Array<{ key: string; value: number }>, skill: Record<string, any> = { attribute: "IQ" }): any[] {
  const context = { actor, name, item: { system: skill }, lines: lines.map((l) => ({ ...l, label: l.key, source: "system" })) };
  fire("gworld.skillBonuses", context);
  return context.lines;
}

const toolLine = (lines: any[]) => lines.find((l) => l.key === "tools");

function roll(actor: any, tags: string[], more: Record<string, unknown> = {}): any[] {
  return fire(HOOKS.successRollModifiers, { actor, tags, modifiers: [], ...more }).modifiers;
}

async function run(key: string, item: any, actor: any): Promise<void> {
  actions.get(key).run(item, actor);
  await flush();
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  tools = new Map();
  sections = [];
  successes = [];
  resuscitations = [];
  injuries = [];
  rads = [];
  graders = [];
  chat = [];
  on = {};
  successResults = [];
  dialogAnswer = null;
  targets = [];
  controlled = [];
  worldTime = 1000;
  systemRules = new Set(["equipmentModifiers"]);
  MEDICAL_TABLES.clear();
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
    get time() { return { worldTime }; },
  });
  vi.stubGlobal("canvas", { get tokens() { return { controlled: controlled.map((actor) => ({ actor })) }; } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class { total = 4; async evaluate() { return this; } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with both switches off", () => {
  it("changes nothing", () => {
    ready();
    const medic = person("Medic", [gear("First Aid Kit", { kind: "firstAidKit", depleted: true }, { equipmentQuality: "fine", forSkills: ["First Aid/TL"] })]);
    expect(toolLine(skillLines(medic, "First Aid/TL8", [{ key: "tools", value: 2 }])).value).toBe(2);
    const patient = person("Patient", [], { statuses: ["bleeding"], flags: { htAntiseptic: 1000, htAnesthesia: { ok: false, at: 1000 } } });
    expect(roll(medic, ["firstAid"], { opponent: patient })).toEqual([]);
    expect(roll(patient, ["disease", "infection", "HT"])).toEqual([]);
    for (const [key, item] of [["ht-defibrillate", gear("Manual Defibrillator (TL8)", { kind: "defibrillator" })], ["ht-aed", gear("Automatic External Defibrillator (AED)", { kind: "aed" })], ["ht-scan", gear("X-Ray Machine", { kind: "imaging", value: 1 })], ["ht-antiseptic", gear("Antiseptic (10 uses)", { kind: "antiseptic" })]] as const) {
      expect(actions.get(key).visible(item), key).toBe(false);
    }
    expect(tools.get("ht-cpr").visible()).toBe(false);
  });
});

describe("resuscitation (High-Tech p. 220; HT:EE p. 14)", () => {
  beforeEach(() => { on = { emergencyMedicine: true }; ready(); });

  it("restarts a fibrillating heart on the patient's HT+1 once Electronics Operation (Medical) succeeds (E3 in #471)", async () => {
    const medic = person("Medic", [], { skills: { "Electronics Operation (Medical)": 12 } });
    const patient = person("Patient", [], { attributes: { IQ: 10, HT: 11 } });
    targets = [patient];
    dialogAnswer = { cause: "heartAttack", cpr: false, modifier: 0, minutes: 0, shocks: 0 };
    const defibrillator = gear("Manual Defibrillator (TL8)", { kind: "defibrillator" });
    await run("ht-defibrillate", defibrillator, medic);
    expect(successes[0]).toMatchObject({ actor: medic, base: 12, skill: "Electronics Operation (Medical)", item: defibrillator });
    expect(resuscitations).toHaveLength(1);
    // The patient's HT+1 stands in for the healer's skill; High-Tech's +3 is gone.
    expect(resuscitations[0]).toMatchObject({ healer: medic, patient, cause: "heartAttack", cpr: false, skill: 12, skillKind: "physician", techLevel: 8, modifier: 0, lines: [] });
    expect(defibrillator.getFlag(MODULE_ID, "eeShocks")).toEqual({ patient: "Actor.Patient", shocks: 1, since: 1000 });
  });

  it("raises it a point a shock up to HT+5, at -1 per 2 full minutes of fibrillation", async () => {
    const medic = person("Medic");
    const patient = person("Patient");
    targets = [patient];
    const defibrillator = gear("Defibrillator", { kind: "defibrillator" }, { tl: "7" });
    dialogAnswer = { cause: "heartAttack", cpr: false, modifier: 1, minutes: 5, shocks: 2 };
    await run("ht-defibrillate", defibrillator, medic);
    expect(resuscitations[0]).toMatchObject({ skill: 13, modifier: -1, techLevel: 7 });
    dialogAnswer = { cause: "heartAttack", cpr: false, modifier: 0, minutes: 1, shocks: 9 };
    await run("ht-defibrillate", defibrillator, medic);
    expect(resuscitations[1]).toMatchObject({ skill: 15, modifier: 0 });
  });

  it("does nothing for a stopped heart, and gives no revival without the shock unless CPR goes on", async () => {
    const medic = person("Medic");
    targets = [person("Patient")];
    dialogAnswer = { cause: "heartAttack", cpr: false, modifier: 0, minutes: 0, shocks: 0 };
    // Electronics Operation at IQ-5 unlearned.
    successResults = [{ success: false }];
    await run("ht-defibrillate", gear("Manual Defibrillator (TL7)", { kind: "defibrillator" }, { tl: "7" }), medic);
    expect(successes[0].base).toBe(6);
    expect(resuscitations).toHaveLength(0);
    successResults = [{ success: false }];
    dialogAnswer = { cause: "drowning", cpr: true, modifier: 0, minutes: 0, shocks: 0 };
    await run("ht-defibrillate", gear("Manual Defibrillator (TL7)", { kind: "defibrillator" }, { tl: "7" }), medic);
    expect(resuscitations[0]).toMatchObject({ cause: "drowning", cpr: true, lines: [] });
    expect(resuscitations[0].skill).toBeUndefined();
    // The shock gets through, but a drowned heart has stopped: the CPR alone.
    await run("ht-defibrillate", gear("Manual Defibrillator (TL7)", { kind: "defibrillator" }, { tl: "7" }), medic);
    expect(resuscitations[1]).toMatchObject({ cause: "drowning", cpr: true });
    expect(resuscitations[1].skill).toBeUndefined();
    expect(chat.at(-1)).toContain("NoFibrillation");
  });

  it("hooks an AED up at IQ+4, shocks at its own 12, then revives on HT+1", async () => {
    const operator = person("Bystander");
    const patient = person("Patient");
    targets = [patient];
    dialogAnswer = { cause: "heartAttack", cpr: false, modifier: 0, minutes: 0, shocks: 0 };
    const aed = gear("Automatic External Defibrillator (AED)", { kind: "aed" });
    await run("ht-aed", aed, operator);
    expect(successes[0]).toMatchObject({ base: 11, kind: "attribute", modifiers: [{ label: "GCC.HT.Medicine.AedInstructions", value: 4 }], item: aed });
    expect(successes[1]).toMatchObject({ base: 12, skill: "Electronics Operation (Medical)", item: aed });
    expect(resuscitations[0]).toMatchObject({ healer: operator, patient, skill: 11, skillKind: "physician", techLevel: 8, lines: [] });
    // Not hooked up: nothing.
    successResults = [{ success: false }];
    await run("ht-aed", aed, operator);
    expect(resuscitations).toHaveLength(1);
    // Hooked up, but the shock fails: nothing either.
    successResults = [{ success: true }, { success: false }];
    await run("ht-aed", aed, operator);
    expect(resuscitations).toHaveLength(1);
  });

  it("takes the supplement's automated external defibrillator as the AED", () => {
    expect(deviceFor(gear("Automated External Defibrillator", { kind: "aed" }))).toMatchObject({ skills: { resuscitation: 12 } });
  });

  it("needs only High-Tech's switch for the AED, whatever Ultra-Tech's table says (D1)", () => {
    MEDICAL_TABLES.register({ book: "ultra-tech", tls: { min: 9, max: 12 }, on: () => false, devices: [[/^automed$/i, { tl: 9, skills: { firstAid: 13 }, perTl: 2 }]] });
    expect(deviceFor(gear("Automatic External Defibrillator (AED)", { kind: "aed" }))).toMatchObject({ skills: { resuscitation: 12 } });
    // Ultra-Tech's automed is Ultra-Tech's, and off with its switch.
    expect(deviceFor(gear("Automed", null, { tl: "9" }, "ultra-tech"))).toBeNull();
    on = {};
    expect(deviceFor(gear("Automatic External Defibrillator (AED)", { kind: "aed" }))).toBeNull();
  });

  it("charges the rescuer 1 FP for each five minutes of CPR on one patient", async () => {
    const medic = person("Medic");
    const patient = person("Patient");
    targets = [patient];
    controlled = [medic];
    dialogAnswer = { cause: "drowning", cpr: false, modifier: 0 };
    for (let minute = 1; minute <= 4; minute += 1) { tools.get("ht-cpr").open(); await flush(); }
    expect(resuscitations.every((r) => r.cpr === true)).toBe(true);
    expect(injuries).toEqual([]);
    tools.get("ht-cpr").open();
    await flush();
    expect(injuries).toEqual([expect.objectContaining({ actor: medic, amount: 1, spent: true })]);
    // Another patient starts the count again.
    targets = [person("Other")];
    tools.get("ht-cpr").open();
    await flush();
    expect(medic.getFlag(MODULE_ID, "htCpr")).toEqual({ patient: "Actor.Other", minutes: 1 });
  });
});

describe("first aid gear (High-Tech pp. 220-221)", () => {
  beforeEach(() => { on = { emergencyMedicine: true }; ready(); });

  const kit = (quality: string, more: Record<string, unknown> = {}, name = "First Aid Kit") => gear(name, { kind: "firstAidKit", ...more }, { equipmentQuality: quality, forSkills: ["First Aid/TL"] });

  it("holds fine first aid gear to +1 without blood or IV fluids", () => {
    const medic = person("Medic", [kit("fine")]);
    const line = toolLine(skillLines(medic, "First Aid/TL8", [{ key: "tools", value: 2 }]));
    expect(line).toMatchObject({ value: 1, reason: "GCC.HT.Medicine.NoFluidsReason" });
    // Fluids and an IV kit to give them with: the +2 stands.
    const supplied = person("Medic", [kit("fine"), gear("IV Kit", { kind: "ivKit" }), gear("Saline", { kind: "ivFluid" })]);
    expect(toolLine(skillLines(supplied, "First Aid/TL8", [{ key: "tools", value: 2 }])).value).toBe(2);
    // A bag gone is no fluid.
    const empty = person("Medic", [kit("fine"), gear("IV Kit", { kind: "ivKit" }), gear("Saline", { kind: "ivFluid" }, { quantity: 0 })]);
    expect(toolLine(skillLines(empty, "First Aid/TL8", [{ key: "tools", value: 2 }])).value).toBe(1);
    // Not First Aid: nothing.
    expect(toolLine(skillLines(medic, "Physician/TL8", [{ key: "tools", value: 2 }])).value).toBe(2);
  });

  it("lets a crash kit give +2 from its own fluids until it is depleted, and a depleted kit work a grade lower", () => {
    const crash = kit("fine", { fluids: true }, "Crash Kit");
    expect(toolLine(skillLines(person("Medic", [crash]), "First Aid/TL8", [{ key: "tools", value: 2 }])).value).toBe(2);
    const depleted = kit("fine", { fluids: true, depleted: true }, "Crash Kit");
    const line = toolLine(skillLines(person("Medic", [depleted]), "First Aid/TL8", [{ key: "tools", value: 2 }]));
    expect(line.value).toBe(1);
    expect(line.reason).toContain("DepletedReason");
    // A good kit depleted is basic; a second, whole kit wins.
    expect(toolLine(skillLines(person("Medic", [kit("good", { depleted: true })]), "First Aid/TL8", [{ key: "tools", value: 1 }])).value).toBe(0);
    expect(toolLine(skillLines(person("Medic", [kit("good", { depleted: true }), kit("good", {}, "Doctor's Bag")]), "First Aid/TL8", [{ key: "tools", value: 1 }])).value).toBe(1);
  });

  it("keeps hemostatic bandages for bleeding wounds: +1 where they beat the kit, a bandage used", async () => {
    const bandages = gear("Hemostatic Bandages", { kind: "hemostatic" }, { equipmentQuality: "good", forSkills: ["First Aid/TL"], quantity: 3 });
    const medic = person("Medic", [bandages, { type: "skill", name: "First Aid/TL8", system: { derived: { toolBonus: 0 } } }]);
    // Not the skill's tools: the system took them as +1 for every First Aid roll.
    expect(toolLine(skillLines(medic, "First Aid/TL8", [{ key: "tools", value: 1 }])).value).toBe(0);
    const bleeding = person("Patient", [], { statuses: ["bleeding"] });
    expect(roll(medic, ["firstAid"], { opponent: bleeding })).toEqual([{ label: expect.stringContaining("Hemostatic Bandages"), value: 1 }]);
    await flush();
    expect(bandages.system.quantity).toBe(2);
    expect(roll(medic, ["firstAid"], { opponent: person("Patient") })).toEqual([]);
    // A good kit already gives +1: they add nothing, and none is used.
    const kitted = person("Medic", [bandages, { type: "skill", name: "First Aid/TL8", system: { derived: { toolBonus: 1 } } }]);
    expect(roll(kitted, ["firstAid"], { opponent: bleeding })).toEqual([]);
    expect(bandages.system.quantity).toBe(2);
  });

  it("starts an IV from a bag, an IV kit needed: a quart of water, dextrose a meal", async () => {
    const dextrose = gear("Dextrose", { kind: "ivFluid", meal: true }, { quantity: 2 });
    await run("ht-start-iv", dextrose, person("Medic", [dextrose]));
    expect(dextrose.system.quantity).toBe(2);
    await run("ht-start-iv", dextrose, person("Medic", [dextrose, gear("IV Kit", { kind: "ivKit" })]));
    expect(dextrose.system.quantity).toBe(1);
    expect(chat.at(-1)).toContain("IvWater");
    expect(chat.at(-1)).toContain("IvMeal");
  });
});

describe("medical facilities (High-Tech pp. 222-225)", () => {
  beforeEach(() => { on = { medicalFacilities: true }; ready(); });

  const skill = (name: string, derived: Record<string, unknown>) => ({ type: "skill", name, system: { derived } });

  it("gives portable surgery's +2 to First Aid", () => {
    const setup = gear("Portable Surgery", { kind: "portableSurgery" }, { equipmentQuality: "good", forSkills: ["Surgery/TL"], tl: "7" });
    const lines = skillLines(person("Medic", [setup]), "First Aid/TL8", [{ key: "tools", value: 0 }, { key: "techLevel", value: 0 }]);
    expect(toolLine(lines).value).toBe(2);
    // With the tech-level rule, its TL7 against the skill's TL8.
    systemRules.add("techLevelModifiers");
    const weighed = skillLines(person("Medic", [setup]), "First Aid/TL8", [{ key: "tools", value: 0 }, { key: "techLevel", value: 0 }]);
    expect(weighed.find((l) => l.key === "techLevel").value).toBe(-1);
  });

  it("puts a surgical kit's own TL modifier in place of the table's by the surgeon's TL", () => {
    const tl5 = gear("Surgical Kit (TL5)", { kind: "surgicalKit" }, { tl: "5", forSkills: ["Surgery/TL"], equipmentModifier: -2 });
    const surgeon = person("Surgeon", [tl5, skill("Surgery/TL8", { toolItemId: "Surgical Kit (TL5)" })], { skills: { Surgery: 13 } });
    // The skill's 13 already has the kit's -2; the system adds the TL8 table's +2, which comes off.
    expect(roll(surgeon, ["surgery"], { base: 13, opponent: person("Patient") })).toEqual([{ label: expect.stringContaining("Surgical Kit (TL5)"), value: -2 }]);
    const tl6 = gear("Surgical Kit (TL6)", { kind: "surgicalKit" }, { tl: "6", forSkills: ["Surgery/TL"] });
    const tl6Surgeon = person("Surgeon", [tl6, skill("Surgery/TL8", { toolItemId: "Surgical Kit (TL6)" })], { skills: { Surgery: 13 } });
    expect(roll(tl6Surgeon, ["surgery"], { base: 13 })).toEqual([{ label: expect.stringContaining("Surgical Kit (TL6)"), value: -2 }]);
    // A TL6 surgeon's table is 0: nothing to take off.
    const early = person("Surgeon", [tl6, skill("Surgery/TL6", { toolItemId: "Surgical Kit (TL6)" })], { skills: { Surgery: 13 }, system: { tl: 6 } });
    expect(roll(early, ["surgery"], { base: 13 })).toEqual([]);
    // A device's own skill standing in: not the surgeon's kit.
    expect(roll(surgeon, ["surgery"], { base: 15 })).toEqual([]);
  });

  it("makes a suturing kit improvised for an operation", () => {
    const suturing = gear("Suturing Kit", { kind: "suturingKit" }, { forSkills: ["Surgery/TL"] });
    const surgeon = person("Surgeon", [suturing, skill("Surgery/TL8", { toolItemId: "Suturing Kit" })], { skills: { Surgery: 12 } });
    expect(roll(surgeon, ["surgery"], { base: 12 })).toEqual([{ label: expect.stringContaining("Suturing Kit"), value: -5 }]);
  });

  it("puts the targeted patient under with a Physician roll, and a failure costs the operation -2", async () => {
    const doctor = person("Doctor", [], { skills: { Physician: 12 } });
    const patient = person("Patient");
    targets = [patient];
    const machine = gear("Portable Anesthesia Machine", { kind: "anesthesia", value: 2 });
    successResults = [{ success: false }];
    await run("ht-anesthetize", machine, doctor);
    expect(successes[0]).toMatchObject({ base: 12, skill: "Physician", modifiers: [{ label: "Portable Anesthesia Machine", value: 2 }] });
    const surgeon = person("Surgeon");
    expect(roll(surgeon, ["surgery"], { opponent: patient })).toEqual([{ label: "GCC.HT.Medicine.AnesthesiaFailed", value: -2 }]);
    // Four hours on, it no longer counts.
    worldTime += 4 * 3600 + 1;
    expect(roll(surgeon, ["surgery"], { opponent: patient })).toEqual([]);
    // Under properly: nothing.
    await run("ht-anesthetize", gear("Chloroform or Ether Mask", { kind: "anesthesia" }), doctor);
    expect(successes[1].modifiers).toEqual([]);
    expect(roll(surgeon, ["surgery"], { opponent: patient })).toEqual([]);
  });

  it("takes up to -2 of the dirt off the infection roll for a wound cleaned with antiseptic, once", async () => {
    const patient = person("Patient");
    targets = [patient];
    // The system's dirt line (Campaigns p. 444; API 1.109.0): antiseptic offsets it, and no more.
    const dirt = (value: number) => ({ key: "woundDirt", label: "Dirt", value });
    await run("ht-antiseptic", gear("Antiseptic (10 uses)", { kind: "antiseptic" }), person("Medic"));
    expect(roll(patient, ["disease", "infection", "HT"], { modifiers: [dirt(-3)] })).toEqual([dirt(-3), { label: "GCC.HT.Medicine.AntisepticLine", value: 2 }]);
    await flush();
    expect(roll(patient, ["disease", "infection", "HT"], { modifiers: [dirt(-3)] })).toEqual([dirt(-3)]);
    await run("ht-antiseptic", gear("Antiseptic (10 uses)", { kind: "antiseptic" }), person("Medic"));
    expect(roll(patient, ["disease", "infection", "HT"], { modifiers: [dirt(-1)] })).toEqual([dirt(-1), { label: "GCC.HT.Medicine.AntisepticLine", value: 1 }]);
    await flush();
    await run("ht-antiseptic", gear("Antiseptic (10 uses)", { kind: "antiseptic" }), person("Medic"));
    expect(roll(patient, ["disease", "infection", "HT"], { modifiers: [dirt(0)] })).toEqual([dirt(0)]);
    await flush();
    expect(roll(patient, ["disease", "infection", "HT"])).toEqual([]);
    // Contagion is another roll.
    await run("ht-antiseptic", gear("Antiseptic (10 uses)", { kind: "antiseptic" }), person("Medic"));
    expect(roll(patient, ["disease", "contagion", "HT"])).toEqual([]);
  });

  it("gives First Aid as at TL5 for a TL6-8 healer with no medical supplies or first aid kit (p. 223)", () => {
    const firstAid = (healer: any, techLevel: number) => fire(HOOKS.firstAid, { healer, patient: person("Patient"), refusal: null, stopsBleeding: true, techLevel }).techLevel;
    expect(firstAid(person("Doctor"), 8)).toBe(5);
    expect(firstAid(person("Doctor", [gear("Medical Supplies (20 patient-days)", {})]), 8)).toBe(8);
    expect(firstAid(person("Medic", [gear("First Aid Kit", { kind: "firstAidKit" })]), 7)).toBe(7);
    expect(firstAid(person("Medic", [gear("First Aid Kit", { kind: "firstAidKit", depleted: true })]), 7)).toBe(5);
    // TL5 and below already work at their own TL; TL9+ isn't this book's.
    expect(firstAid(person("Doctor"), 5)).toBe(5);
    expect(firstAid(person("Doctor"), 9)).toBe(9);
  });

  it("makes a TL6-8 doctor's rounds as at TL5 without medical supplies (p. 223; API 1.142.0)", () => {
    const rounds = (healer: any, techLevel: number) => fire(HOOKS.physicianRounds, { healer, patient: person("Patient"), refusal: null, techLevel, lines: [] as string[] });
    const bare = rounds(person("Doctor"), 8);
    expect(bare).toMatchObject({ techLevel: 5, lines: ["GCC.HT.Medicine.RoundsWithoutSupplies"] });
    expect(rounds(person("Doctor", [gear("Medical Supplies (20 patient-days)", {})]), 8)).toMatchObject({ techLevel: 8, lines: [] });
    expect(rounds(person("Doctor"), 5)).toMatchObject({ techLevel: 5, lines: [] });
  });

  it("scans with Electronics Operation (Medical), then Diagnosis; the early X-ray irradiates both", async () => {
    const operator = person("Operator", [], { skills: { Diagnosis: 13 } });
    const patient = person("Patient");
    targets = [patient];
    const xray = gear("X-Ray Machine", { kind: "imaging", value: 1 }, { tl: "6" });
    await run("ht-scan", xray, operator);
    expect(rads.map((r) => [r.actor.name, r.rads])).toEqual([["Patient", 4], ["Operator", 4]]);
    expect(successes.map((s) => s.skill)).toEqual(["Electronics Operation (Medical)", "Diagnosis"]);
    expect(successes[1]).toMatchObject({ base: 13, item: xray });
    // An ultrasound irradiates nobody; a failed operation, no diagnosis.
    rads = [];
    successResults = [{ success: false }];
    await run("ht-scan", gear("Portable Ultrasound", { kind: "imaging" }), operator);
    expect(rads).toEqual([]);
    expect(successes).toHaveLength(3);
  });

  it("turns the portable X-ray on a victim at maximum intensity: 1,000 rads an hour (p. 223)", async () => {
    const operator = person("Operator");
    const victim = person("Victim");
    targets = [victim];
    const portable = gear("Portable X-Ray Machine (TL7)", { kind: "imaging" }, { tl: "7" });
    expect(actions.get("ht-xray-maximum").visible(portable)).toBe(true);
    expect(actions.get("ht-xray-maximum").visible(gear("Compact X-Ray Machine", { kind: "imaging" }))).toBe(false);
    dialogAnswer = 6;
    await run("ht-xray-maximum", portable, operator);
    expect(rads).toEqual([{ actor: victim, rads: 100, protectionFactor: 1, modifier: 0 }]);
    // A victim this user can't change is the GM's to dose.
    const other = person("Other", [], { isOwner: false });
    targets = [other];
    await run("ht-xray-maximum", portable, operator);
    expect(rads).toHaveLength(1);
    expect(chat.at(-1)).toContain("XrayMaximumGm");
  });

  it("grades a specialized theater +TL/2 for Surgery in its specialty, basic otherwise (p. 224)", async () => {
    const theater = gear("Specialized Operating Theater", { kind: "specialtyTheater" }, { equipmentQuality: "best", forSkills: ["Surgery/TL"] });
    const grader = graders.find((g) => g.key === "ht-specialty-theater");
    const surgery = { name: "Surgery/TL8" };
    expect(grader.grade(theater, surgery)).toBe("basic");
    await run("ht-theater-specialty", theater, person("Surgeon", [theater]));
    expect(grader.grade(theater, surgery)).toBe("best");
    expect(chat.at(-1)).toContain("TheaterInSpecialty");
    expect(grader.grade(theater, { name: "Physician/TL8" })).toBeNull();
    expect(grader.grade(gear("Operating Theater", null, { forSkills: ["Surgery/TL"] }), surgery)).toBeNull();
    on.medicalFacilities = false;
    expect(grader.grade(theater, surgery)).toBeNull();
  });

  it("gives an imaging instrument's +TL/2 only on the Diagnosis roll its scan allows, over the skill's own gear (p. 222)", async () => {
    const ultrasound = gear("Portable Ultrasound", { kind: "imaging" }, { equipmentQuality: "best", forSkills: ["Diagnosis/TL"] });
    const analyzer = gear("Portable Clinical Analyzer", null, { equipmentQuality: "fine", forSkills: ["Diagnosis/TL"] });
    // Carried, it is no Diagnosis tool: the analyzer's +2 stands, or nothing at all.
    const withBoth = person("Doctor", [ultrasound, analyzer]);
    const line = toolLine(skillLines(withBoth, "Diagnosis/TL8", [{ key: "tools", value: 4 }]));
    expect(line).toMatchObject({ value: 2, reason: expect.stringContaining("ImagingReason") });
    expect(toolLine(skillLines(person("Doctor", [ultrasound]), "Diagnosis/TL8", [{ key: "tools", value: 4 }])).value).toBe(0);
    // Its scan: +4 at TL8, less the +2 the skill already has.
    const operator = person("Operator", [ultrasound, { type: "skill", name: "Diagnosis/TL8", system: { derived: { toolBonus: 2 } } }], { skills: { Diagnosis: 13 } });
    targets = [person("Patient")];
    await run("ht-scan", ultrasound, operator);
    expect(successes[1].modifiers).toEqual([{ label: expect.stringContaining("ImagingLine"), value: 2 }]);
    // Other skills keep the system's line.
    expect(toolLine(skillLines(withBoth, "Physician/TL8", [{ key: "tools", value: 4 }])).value).toBe(4);
  });

  it("counts antiseptic's ten uses, the last taking the container off the count (p. 225)", async () => {
    targets = [person("Patient")];
    const bottle = gear("Antiseptic (10 uses)", { kind: "antiseptic" }, { quantity: 2 });
    for (let i = 0; i < 9; i += 1) await run("ht-antiseptic", bottle, person("Medic"));
    expect(bottle.system.extensions[MODULE_ID].medical.usesSpent).toBe(9);
    expect(bottle.system.quantity).toBe(2);
    expect(chat.at(-1)).toContain('"left":1');
    await run("ht-antiseptic", bottle, person("Medic"));
    expect(bottle.system.extensions[MODULE_ID].medical.usesSpent).toBe(0);
    expect(bottle.system.quantity).toBe(1);
  });

  it("prices a surgical kit's resupply after each operation: 10% at TL5, 20% at TL6-8 (p. 223)", () => {
    const section = sections.find((x) => x.key === "ht-medicine-item");
    const lines = (item: any) => section.context(item).lines as string[];
    expect(lines(gear("Surgical Kit (TL5)", { kind: "surgicalKit" }, { tl: "5", cost: 300 }))).toContainEqual(expect.stringMatching(/ResupplyItem.*"cost":30,"percent":10/));
    expect(lines(gear("Surgical Kit (TL8)", { kind: "surgicalKit" }, { tl: "8", cost: 300 }))).toContainEqual(expect.stringMatching(/ResupplyItem.*"cost":60,"percent":20/));
  });
});
