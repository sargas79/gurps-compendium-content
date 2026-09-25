/**
 * The hygiene supplies, drugs and poisons as the system meets them: the
 * rolls through `gworld.successRollModifiers`, morphine through
 * `gworld.traitEffects`, the poisons through the dose machinery and
 * `gworld.poisonCycle`, and the row actions -- with only High-Tech's
 * switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import * as rules from "../../../../system/src/rules/index.js";
import { checkBotulinHealed, checkPsychiatricExpired, drugData, readyDrugs } from "./index.js";

type Listener = (...args: any[]) => void;

const HOOKS = {
  successRollModifiers: "gworld.successRollModifiers",
  poisonCycle: "gworld.poisonCycle",
  physicianRounds: "gworld.physicianRounds",
};

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: any[];
let poisons: any[];
let successes: any[];
let injuries: any[];
let applied: any[];
let dosed: any[];
let cleared: any[];
let treated: any[];
let woken: any[];
let chat: string[];
let on: Record<string, boolean>;
let successResult: any;
let dialogAnswers: any[];
let targets: any[];
let worldTime: number;
let locations: any[];
let crippledParts: any[];
let removedConditions: string[];

function fakeApi() {
  return {
    rules,
    items: { changeQuantity: async (i: any, delta: number) => { const from = Number(i.system.quantity) || 0; i.system.quantity = Math.max(0, from + delta); return { from, to: i.system.quantity }; } },
    registry: { isRuleOn: () => false },
    data: { registerPoison: (p: any) => poisons.push(p) },
    combat: { hooks: HOOKS, registerHitLocation: (l: any) => { locations.push(l); return `${l.module}.${l.key}`; } },
    sheets: {
      registerSheetSection: (s: any) => sections.push(s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      derived: (actor: any) => ({ traitEffects: actor?.traitEffects ?? {} }),
      conditions: (actor: any) => actor?.conditionList ?? [],
      applyCondition: async (actor: any, c: any) => {
        applied.push({ actor, ...c });
        if (c.module) actor.conditionList = [...(actor.conditionList ?? []), { id: `${c.module}.${c.key}`, label: c.label }];
        return "id";
      },
      applyInjury: async (actor: any, o: any) => { injuries.push({ actor, ...o }); return { pool: o.fatigue ? "fp" : "hp" }; },
      spendFatigue: async (actor: any, fp: number, o: any = {}) => { injuries.push({ actor, amount: fp, spent: true, ...o }); return { fpLost: fp }; },
      activePoisons: (actor: any) => actor?.doses ?? [],
      dosePoison: async (actor: any, p: any) => { dosed.push({ actor, poison: p }); return { id: "d1", ...p }; },
      clearPoison: async (actor: any, id: string) => { cleared.push({ actor, id }); },
      treatPoison: async (actor: any, id: string, o: any) => { treated.push({ actor, id, poison: true, ...o }); return o.bonus; },
      treatIllness: async (actor: any, id: string, o: any) => { treated.push({ actor, id, illness: true, ...o }); return o.bonus; },
      undoKnockdown: async (actor: any, o: any) => { woken.push({ actor, ...o }); return true; },
      cripple: async (actor: any, location: string, o: any) => { crippledParts.push({ id: "part1", location, ...o, months: 3 }); return crippledParts.at(-1); },
      crippled: () => crippledParts,
      treatCrippled: async (actor: any, which: string, o: any) => {
        const part = crippledParts.find((p) => p.id === which);
        if (!actor?.isOwner || !part) return null;
        Object.assign(part, { treatedAtTl: o.treatedAtTl, months: Math.max(1, 5 - (o.treatedAtTl >= 7 ? 3 : 0)) });
        return part;
      },
      removeCondition: async (actor: any, id: string) => { removedConditions.push(id); return true; },
    },
    roll: { success: async (o: any) => { successes.push(o); return successResult; } },
  };
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)!] = value;
}

function gear(name: string, more: Record<string, any> = {}, drug: Record<string, unknown> = {}): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl: "6", carried: true, equipped: false, quantity: 1, extensions: { [MODULE_ID]: { htDrug: drug } }, ...more },
  };
  item.update = async (changes: Record<string, unknown>) => {
    for (const [path, value] of Object.entries(changes)) setPath(item, path, value);
  };
  return item;
}

function person(items: any[] = [], more: Record<string, any> = {}): any {
  const flags: Record<string, unknown> = {};
  return {
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    name: "Patient",
    isOwner: true,
    items,
    attributes: { HT: 10 },
    statuses: new Set<string>(),
    system: { posture: "lying" },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    ...more,
  };
}

function fire(hook: string, ...args: any[]): any {
  for (const listener of hooks.get(hook) ?? []) listener(...args);
  return args[0];
}

const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  readyDrugs(fakeApi() as never, { hygiene: rule("hygieneAndDrugs"), poisons: rule("highTechPoisons") });
}

function roll(actor: any, tags: string[], more: Record<string, unknown> = {}): any[] {
  return fire(HOOKS.successRollModifiers, { actor, tags, modifiers: [], kind: "attribute", skill: "", ...more }).modifiers;
}

function traitEffects(actor: any): any {
  return fire("gworld.traitEffects", { actor, effects: { noShock: false, unfazeable: false, knockdown: 0, shockMultiplier: 1, attributes: { ST: 0, DX: 0, IQ: 0, HT: 0 } }, sources: [] });
}

async function run(key: string, item: any, actor: any): Promise<void> {
  actions.get(key).run(item, actor);
  await flush();
}

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  sections = [];
  poisons = [];
  successes = [];
  injuries = [];
  applied = [];
  locations = [];
  crippledParts = [];
  removedConditions = [];
  dosed = [];
  cleared = [];
  treated = [];
  woken = [];
  chat = [];
  on = {};
  successResult = { success: true, margin: 2, criticalFailure: false };
  dialogAnswers = [];
  targets = [];
  worldTime = 1000;
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); } },
    get time() { return { worldTime }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswers.shift() ?? null } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class {
    total = 4;
    constructor(public formula: string) {}
    async evaluate() { return this; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with every switch off", () => {
  it("changes nothing, and offers no poison", () => {
    ready();
    const camper = person([gear("Insect Repellant (10-use bottle)", { equipped: true })]);
    expect(roll(camper, ["disease", "contagion", "HT"], { disease: { name: "Malaria" } })).toEqual([]);
    expect(poisons.map((p) => p.key)).toEqual(["curare", "ricin", "strychnine", "botulin", "thallium"]);
    expect(poisons.every((p) => p.available() === false)).toBe(true);
    expect(actions.get("ht-drug-give").visible(gear("Morphine"))).toBe(false);
    expect(actions.get("ht-poison-dose").visible(gear("Curare"))).toBe(false);
    expect(sections[0].visible(gear("Morphine"))).toBe(false);
  });
});

describe("hygiene and drugs (High-Tech pp. 221, 226-227)", () => {
  beforeEach(() => { on = { hygieneAndDrugs: true }; ready(); });

  it("reads each record by name, and leaves another book's alone", () => {
    expect(drugData(gear("Truth Serum")).kind).toBe("truthSerum");
    const other = gear("Morphine");
    other.flags[MODULE_ID].book = "ultra-tech";
    expect(drugData(other).kind).toBe("");
  });

  it("gives insect repellent in use +3 against an insect-borne disease", () => {
    const worn = person([gear("Insect Repellant (10-use bottle)", { equipped: true })]);
    expect(roll(worn, ["disease", "contagion", "HT"], { disease: { name: "Malaria" } })).toEqual([{ label: "Insect Repellant (10-use bottle)", value: 3 }]);
    // Carried but not in use: nothing.
    expect(roll(person([gear("Insect Repellant (10-use bottle)")]), ["contagion"], { disease: { name: "Malaria" } })).toEqual([]);
  });

  it("gives soap +1 on the wound's Infection roll and quinine +3 against a malaria cycle", () => {
    const actor = person([gear("Soap (month's supply)", { equipped: true }), gear("Quinine", { equipped: true, tl: "5" })]);
    expect(roll(actor, ["disease", "infection", "HT"], { disease: { name: "Infection" } })).toEqual([{ label: "Soap (month's supply)", value: 1 }]);
    expect(roll(actor, ["disease", "illness", "HT"], { poison: { name: "Malaria" } })).toEqual([{ label: "Quinine", value: 3 }]);
  });

  it("lets morphine bring High Pain Threshold and Unfazeable for the margin's hours, and euphoria", async () => {
    const patient = person();
    successResult = { success: false, margin: 3, criticalFailure: false };
    const morphine = gear("Morphine");
    await run("ht-drug-give", morphine, patient);
    expect(successes[0]).toMatchObject({ actor: patient, base: 10, modifiers: [{ value: -4 }] });
    expect(applied).toEqual([
      expect.objectContaining({ module: MODULE_ID, key: "htMorphine", duration: { seconds: 10800 } }),
      expect.objectContaining({ key: "euphoria", duration: { seconds: 10800 } }),
    ]);
    expect(morphine.system.quantity).toBe(0);
    const context = traitEffects(patient);
    expect(context.effects).toMatchObject({ noShock: true, unfazeable: true, knockdown: 3 });
    expect(context.sources.map((s: any) => s.effect)).toEqual(["noShock", "unfazeable"]);
  });

  it("does nothing for a patient who resists the morphine", async () => {
    const patient = person();
    await run("ht-drug-give", gear("Morphine"), patient);
    expect(applied).toEqual([]);
    expect(traitEffects(patient).effects.noShock).toBe(false);
  });

  it("takes 1 or 2 off pain's penalty with aspirin, counting the bottle's doses", async () => {
    const patient = person();
    patient.statuses.add("moderatePain");
    const bottle = gear("Analgesics (100 doses)");
    await run("ht-drug-give", bottle, patient);
    expect(bottle.system.quantity).toBe(1);
    expect(bottle.system.extensions[MODULE_ID].htDrug.dosesUsed).toBe(1);
    const relief = [{ label: "GCC.HT.Drugs.AnalgesicLine", value: 2 }];
    expect(roll(patient, ["selfControl"], { skill: "Bad Temper" })).toEqual(relief);
    expect(roll(patient, ["skill", "DX"], { kind: "skill", skill: "Climbing" })).toEqual(relief);
    expect(roll(patient, ["attribute", "Will"])).toEqual(relief);
    // Pain doesn't reach defenses or resistance rolls, so neither does the relief.
    expect(roll(patient, ["defense", "dodge", "DX"], { kind: "defense" })).toEqual([]);
    expect(roll(patient, ["resist", "HT"])).toEqual([]);
    // With High Pain Threshold the pain is only -1.
    patient.traitEffects = { noShock: true };
    expect(roll(patient, ["skill", "IQ"], { kind: "skill" })).toEqual([{ label: "GCC.HT.Drugs.AnalgesicLine", value: 1 }]);
    // Out of pain, nothing.
    patient.statuses.clear();
    expect(roll(patient, ["skill", "IQ"], { kind: "skill" })).toEqual([]);
  });

  it("treats an illness with antibiotics at +TL/2", async () => {
    const patient = person([], { doses: [{ id: "flu", name: "Pneumonia", illness: true }, { id: "p", name: "Arsenic" }] });
    dialogAnswers = [{ id: "flu" }];
    await run("ht-drug-give", gear("Antibiotics (Two-Week Course)", { tl: "7" }), patient);
    expect(treated).toEqual([expect.objectContaining({ id: "flu", illness: true, bonus: 3, techLevel: 7 })]);
  });

  it("treats a wound's infection with antibiotics for a day", async () => {
    const patient = person();
    dialogAnswers = [{ id: "wound" }];
    await run("ht-drug-give", gear("Antibiotic Ointment (10-dose tube)", { tl: "8" }), patient);
    expect(applied[0]).toMatchObject({ key: "htWoundAntibiotics", effects: { modifiers: [{ value: 4, rolls: ["infection"] }] }, duration: { seconds: 86400 } });
  });

  it("gives an antitoxin's chosen bonus, and stops botulin outright", async () => {
    const patient = person([], { doses: [{ id: "c", name: "Curare", source: `${MODULE_ID}.curare` }, { id: "b", name: "Botulin", source: `${MODULE_ID}.botulin` }] });
    dialogAnswers = [{ id: "c" }, { bonus: "2" }];
    await run("ht-drug-give", gear("Antitoxin Kit"), patient);
    expect(treated).toEqual([expect.objectContaining({ id: "c", poison: true, bonus: 2 })]);
    dialogAnswers = [{ id: "b" }, { bonus: "3" }];
    await run("ht-drug-give", gear("Antitoxin Kit"), patient);
    expect(cleared).toEqual([expect.objectContaining({ id: "b" })]);
  });

  it("gives activated charcoal +3 against a poison", async () => {
    const patient = person([], { doses: [{ id: "s", name: "Strychnine" }] });
    dialogAnswers = [{ id: "s" }];
    await run("ht-drug-give", gear("Activated Charcoal"), patient);
    expect(treated[0]).toMatchObject({ id: "s", bonus: 3 });
  });

  it("gives castor oil and charcoal only to a dose that could be a digestive poison", async () => {
    const patient = person([], { doses: [
      { id: "cobra", name: "Cobra Venom" },
      { id: "arsenic", name: "Arsenic" },
      { id: "curare", name: "Curare", source: `${MODULE_ID}.curare` },
      { id: "gm", name: "The GM's Own" },
    ] });
    let offered: string[] = [];
    vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async (o: any) => {
      offered = [...String(o.content).matchAll(/value="([^"]+)"/g)].map((m) => m[1]!);
      return { id: "arsenic" };
    } } } } });
    await run("ht-drug-give", gear("Castor Oil"), patient);
    // Cobra venom and curare are follow-up poisons; the GM's own can't be known, so it stays.
    expect(offered).toEqual(["arsenic", "gm"]);
    expect(treated[0]).toMatchObject({ id: "arsenic", bonus: 1 });
    // With nothing digestive, nothing to give.
    treated = [];
    await run("ht-drug-give", gear("Activated Charcoal"), person([], { doses: [{ id: "cobra", name: "Cobra Venom" }] }));
    expect(treated).toEqual([]);
    expect((globalThis as any).ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("NoDigestivePoison"));
  });

  it("counts a second depressant as a doubled dose at -2, and overdoses on its critical failure", async () => {
    const patient = person([], { conditionList: [{ id: `${MODULE_ID}.htTruthSerum`, label: "Truth Serum" }] });
    successResult = { success: false, margin: 11, criticalFailure: true };
    await run("ht-drug-give", gear("Morphine"), patient);
    expect(successes[0].modifiers).toEqual([
      { label: "GCC.HT.Drugs.PainkillerLine", value: -4 },
      { label: expect.stringContaining("DoubledDoseLine"), value: -2 },
    ]);
    expect(applied).toContainEqual(expect.objectContaining({ key: "unconscious", duration: { seconds: 11 * 3600 } }));
    // The drug as a poison at the harder roll, morphine's HT-4: 1 point every 15 minutes, 24 times.
    expect(dosed[0].poison).toMatchObject({ resistanceModifier: -4, damage: "toxic", adds: 1, intervalSeconds: 900, cycles: 24 });
    expect(chat.at(-1)).toContain("Overdose");
  });

  it("gives a single dose no doubling and no overdose, even on a critical failure", async () => {
    successResult = { success: false, margin: 11, criticalFailure: true };
    await run("ht-drug-give", gear("Morphine"), person());
    expect(successes[0].modifiers).toHaveLength(1);
    expect(dosed).toEqual([]);
    expect(applied.some((a) => a.key === "unconscious")).toBe(false);
  });

  it("costs truth serum's 1d FP and puts -2 on Will and self-control for (20 - HT)/2 minutes on a failed HT-1", async () => {
    const subject = person();
    targets = [subject];
    successResult = { success: false, margin: 1, criticalFailure: false };
    await run("ht-drug-give", gear("Truth Serum"), person());
    expect(injuries).toEqual([expect.objectContaining({ actor: subject, amount: 4, spent: true, exertion: false })]);
    expect(successes[0]).toMatchObject({ actor: subject, modifiers: [{ value: -1 }] });
    expect(applied[0]).toMatchObject({ actor: subject, key: "htTruthSerum", effects: { modifiers: [{ value: -2, rolls: ["Will", "selfControl"] }] }, duration: { seconds: 300 } });
  });

  it("wakes a stunned or unconscious character with smelling salts on a HT roll", async () => {
    const out = person();
    await run("ht-drug-give", gear("Ammonia Inhalants (vial)"), out);
    expect(woken).toEqual([expect.objectContaining({ actor: out, posture: "lying" })]);
  });

  it("mixes DMSO into a digestive poison, making it a contact agent", async () => {
    const strychnine = gear("Strychnine");
    const holder = person([strychnine, gear("Curare")]);
    dialogAnswers = [{ id: "Strychnine" }];
    await run("ht-drug-give", gear("DMSO"), holder);
    expect(strychnine.system.extensions[MODULE_ID].htDrug.dmso).toBe(true);
  });

  it("takes the disadvantages a day's psychiatric drug treats out of play while it works", async () => {
    const patient = person();
    await run("ht-drug-give", gear("Psychiatric Drugs", {}, { mitigates: "Paranoia" }), patient);
    const gather = () => fire("gworld.traitsInPlay", { actor: patient, traits: [{ name: "Paranoia", inPlay: true }, { name: "Bad Temper (12)", inPlay: true }] }).traits;
    expect(gather()).toEqual([
      { name: "Paranoia", inPlay: false, reason: expect.stringContaining("PsychiatricMitigates") },
      { name: "Bad Temper (12)", inPlay: true },
    ]);
    worldTime += 86401;
    expect(gather().every((t: any) => t.inPlay)).toBe(true);
    // Once the day is up, the flag goes with world time and the card says so.
    expect(await checkPsychiatricExpired(patient)).toBe(true);
    expect(patient.getFlag(MODULE_ID, "htPsychiatric")).toBeUndefined();
    expect(chat.at(-1)).toContain("PsychiatricWornOff");
    expect(await checkPsychiatricExpired(patient)).toBe(false);
  });
});

describe("High-Tech poisons (p. 227)", () => {
  beforeEach(() => { on = { highTechPoisons: true }; ready(); });

  it("offers the five poisons, and doses the targets from a record", async () => {
    expect(poisons.every((p) => p.available())).toBe(true);
    const victim = person();
    targets = [victim];
    const curare = gear("Curare");
    await run("ht-poison-dose", curare, person());
    expect(dosed).toEqual([expect.objectContaining({ actor: victim, poison: expect.objectContaining({ name: "Curare", source: `${MODULE_ID}.curare`, dice: 2, cycles: 4, delivery: ["followUp"] }) })]);
    expect(curare.system.quantity).toBe(0);
  });

  it("gives a DMSO-mixed poison as a contact agent, which a sealed suit keeps out", async () => {
    const sealed = person([], { traitEffects: { sealed: true } });
    const open = person();
    targets = [sealed, open];
    const ricin = gear("Ricin", { quantity: 2 }, { dmso: true });
    await run("ht-poison-dose", ricin, person());
    expect(dosed).toEqual([expect.objectContaining({ actor: open, poison: expect.objectContaining({ delivery: ["contact"] }) })]);
    expect(ricin.system.extensions[MODULE_ID].htDrug.dmso).toBe(false);
  });

  it("rolls curare's HT-6 each cycle with the treatment's bonus, paralysing on a failure", async () => {
    const victim = person();
    successResult = { success: false, margin: 2, criticalFailure: false };
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.curare`, poison: { id: "d1", name: "Curare", cyclesSuffered: 1, treatment: 2 }, resisted: null, finished: false });
    await flush();
    expect(successes[0]).toMatchObject({ actor: victim, base: 10, modifiers: [{ value: -6 }, { value: 2 }], tags: expect.arrayContaining(["poison", "HT"]) });
    expect(applied).toEqual([expect.objectContaining({ key: "paralysis", duration: { seconds: 1800 } })]);
  });

  it("ignores another book's doses and the switch being off", async () => {
    fire(HOOKS.poisonCycle, { actor: person(), source: `${MODULE_ID}.nerveGas`, poison: { id: "x", cyclesSuffered: 1 }, resisted: false });
    await flush();
    expect(successes).toEqual([]);
  });

  it("gives botulin's 4d first, then a paralysis roll one worse each cycle that ends it on a failure", async () => {
    const victim = person();
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.botulin`, poison: { id: "b", name: "Botulin", cyclesSuffered: 1 }, resisted: null, finished: false });
    await flush();
    expect(successes).toEqual([]);
    expect(injuries).toEqual([expect.objectContaining({ amount: 4 })]);
    expect(applied.map((a) => a.key)).toEqual(["nauseated", "retching"]);
    successResult = { success: false, margin: 1, criticalFailure: false };
    applied = [];
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.botulin`, poison: { id: "b", name: "Botulin", cyclesSuffered: 4 }, resisted: null, finished: false });
    await flush();
    expect(successes[0].modifiers[0].value).toBe(-3);
    expect(applied).toEqual([expect.objectContaining({ key: "paralysis" })]);
    expect(applied[0].duration).toBeUndefined();
    expect(cleared).toEqual([expect.objectContaining({ id: "b" })]);
    // A lasting crippling injury of the lungs and spine, kept by the system (API 1.114.0).
    expect(locations[0]).toMatchObject({ module: MODULE_ID, key: "ht-lungs-spine", parent: "torso" });
    expect(locations[0].available()).toBe(false);
    expect(crippledParts).toEqual([expect.objectContaining({ location: `${MODULE_ID}.ht-lungs-spine`, duration: "lasting" })]);
    expect(victim.getFlag(MODULE_ID, "htBotulinParalysis")).toEqual({ part: "part1", condition: "id" });
    // While the part is crippled the paralysis stays; once it has healed it goes.
    expect(await checkBotulinHealed(fakeApi() as never, victim)).toBe(false);
    crippledParts = [];
    expect(await checkBotulinHealed(fakeApi() as never, victim)).toBe(true);
    expect(removedConditions).toEqual(["id"]);
    expect(victim.getFlag(MODULE_ID, "htBotulinParalysis")).toBeUndefined();
  });

  it("puts the paralysis in a physician's care on their rounds, at the rounds' TL (API 1.155.0)", async () => {
    const victim = person();
    await victim.setFlag(MODULE_ID, "htBotulinParalysis", { part: "part1", condition: "id" });
    crippledParts = [{ id: "part1", location: `${MODULE_ID}.ht-lungs-spine`, duration: "lasting", months: 5 }];
    on.highTechPoisons = true;
    const context = fire(HOOKS.physicianRounds, { healer: { name: "Doc" }, patient: victim, refusal: null, techLevel: 8, lines: [] });
    // Another listener moves the rounds to TL7, after this one.
    context.techLevel = 7;
    await flush();
    expect(crippledParts[0]).toMatchObject({ treatedAtTl: 7, months: 2 });
    expect(chat.at(-1)).toContain("BotulinCare");
    // Refused rounds give no care.
    crippledParts[0].treatedAtTl = null;
    const refused = fire(HOOKS.physicianRounds, { healer: { name: "Doc" }, patient: victim, refusal: null, techLevel: 8, lines: [] });
    refused.refusal = "No";
    await flush();
    expect(crippledParts[0].treatedAtTl).toBeNull();
    // A patient this user doesn't own: a line for the GM on the rounds' card.
    const other = person([], { isOwner: false });
    await other.setFlag(MODULE_ID, "htBotulinParalysis", { part: "part1", condition: "id" });
    const gm = fire(HOOKS.physicianRounds, { healer: { name: "Doc" }, patient: other, refusal: null, techLevel: 8, lines: [] });
    await flush();
    expect(gm.lines.join()).toContain("BotulinCareGm");
    expect(crippledParts[0].treatedAtTl).toBeNull();
    // No paralysis, nothing.
    const well = fire(HOOKS.physicianRounds, { healer: { name: "Doc" }, patient: person(), refusal: null, techLevel: 8, lines: [] });
    expect(well.lines).toEqual([]);
  });

  it("rolls strychnine's hours when it strikes and ends it when they're up", async () => {
    const victim = person();
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.strychnine`, poison: { id: "s", name: "Strychnine", cyclesSuffered: 1 }, resisted: null, finished: false });
    await flush();
    expect(victim.getFlag(MODULE_ID, "htPoisonDoses")).toEqual({ s: { cycles: 48 } });
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.strychnine`, poison: { id: "s", name: "Strychnine", cyclesSuffered: 48 }, resisted: null, finished: false });
    await flush();
    expect(cleared).toEqual([expect.objectContaining({ id: "s" })]);
    expect(victim.getFlag(MODULE_ID, "htPoisonDoses")).toEqual({});
  });

  it("chokes ricin's victim who failed the first roll and fails again", async () => {
    const victim = person();
    successResult = { success: false, margin: 1, criticalFailure: false };
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.ricin`, poison: { id: "r", name: "Ricin", cyclesSuffered: 1 }, resisted: null, finished: false });
    await flush();
    expect(applied.map((a) => a.key)).toEqual(["nauseated", "coughing"]);
    applied = [];
    fire(HOOKS.poisonCycle, { actor: victim, source: `${MODULE_ID}.ricin`, poison: { id: "r", name: "Ricin", cyclesSuffered: 2 }, resisted: null, finished: false });
    await flush();
    expect(applied.map((a) => a.key)).toEqual(["nauseated", "coughing", "choking"]);
  });
});
