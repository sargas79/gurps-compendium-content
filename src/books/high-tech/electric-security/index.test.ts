/**
 * The supplement's electric fences, locks, screening and alarms (HT:EE
 * pp. 42-44) as the system meets them: on High-Tech's own records (its
 * fences, locks and alarms) and on the supplement's, which #480 has yet to
 * capture -- so they are fixtures by the names its capture gives. The fences
 * run through a fake `hazards.shock` that fires the shock hooks as the system
 * does. High-Tech's switches alone (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { SECURITY_TABLES } from "../../../shared/security/index.js";
import type * as Security from "../security/index.js";
import type * as Electric from "./index.js";

let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let prices: any[];
let successes: any[];
let contests: any[];
let conditions: any[];
let shocks: any[];
let outcomes: any[];
let chat: any[];
let on: Set<string>;
let dialogAnswer: any;
let targets: any[];
let selected: any[];
let successResults: any[];
let hooks: Map<string, Array<(context: any) => void>>;

const HOOKS = { shockModifiers: "gworld.shockModifiers", afterShock: "gworld.afterShock" };

function fire(name: string, context: any): any {
  for (const fn of hooks.get(name) ?? []) fn(context);
  return context;
}

function fakeApi() {
  return {
    rules,
    combat: { hooks: HOOKS },
    data: { hooks: { objectStats: "gworld.objectStats" }, registerPriceModifier: (m: any) => prices.push(m) },
    sheets: {
      registerGmTool: (t: any) => tools.set(t.key, t),
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    actors: {
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      derived: () => ({}),
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor: actor.name, ...c }); return "c1"; },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResults.shift() ?? { success: true, margin: 0 }; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: "first" }; },
      equipmentUse: () => ({ lines: [], tags: [], impossible: null }),
    },
    // As the system runs it (API 1.119.0): the modifiers hook, the outcome, the after hook, which may set `contact`.
    hazards: {
      shock: async (o: any) => {
        const asked = fire(HOOKS.shockModifiers, { actor: o.actor, kind: o.kind, formula: o.formula, continuous: o.continuous, contactSeconds: o.contactSeconds ?? 0, modifier: o.modifier, injuryStep: 2, heartAttackMargin: null, dr: null, rollOnZeroInjury: false, immune: false, lines: [] });
        const outcome = { kind: o.kind, injury: 0, stunned: false, contactSeconds: o.contactSeconds ?? 0, contact: null, ...(outcomes.shift() ?? {}) };
        const after = fire(HOOKS.afterShock, { actor: o.actor, ...outcome, lines: [...asked.lines] });
        shocks.push({ ...o, lines: after.lines, contact: after.contact ?? null });
        return { ...outcome, contact: after.contact ?? null, lines: after.lines };
      },
    },
  };
}

let n = 0;
/** A record as the catalogue writes it: equipment, the printed name, High-Tech's book flag. */
function gear(name: string, extensions: Record<string, any> = {}, tl = "8"): any {
  n += 1;
  return {
    id: `item${n}`,
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech" } },
    system: { tl, carried: true, extensions: { [MODULE_ID]: extensions } },
    update: vi.fn(),
  };
}

const person = (name: string, items: any[] = [], skills: Record<string, number> = {}) => ({
  name,
  uuid: `Actor.${name}`,
  items,
  system: { tl: 8 },
  attributes: { ST: 11, DX: 12, IQ: 12, HT: 11, Will: 11, Per: 12 },
  skills,
});

const key = (k: string) => `${MODULE_ID}.${k}`;
let security: typeof Security;
let electric: typeof Electric;
let switches: any;

async function load(): Promise<void> {
  vi.resetModules();
  const surveillance = await import("../surveillance/index.js");
  security = await import("../security/index.js");
  electric = await import("./index.js");
  const api = fakeApi();
  const rule = (k: string) => () => on.has(key(k));
  switches = { fences: rule("stunLethalFences"), electricLocks: rule("electricLocks"), alarms: rule("alarmSystems") };
  security.readyHighTechSecurity(api as never, { locks: rule("locksAndSafes"), traps: rule("trapsAndBarriers"), ...switches });
  surveillance.readySurveillance(api as never, { screening: rule("securityScreening"), surveillance: rule("surveillanceGear"), jamming: rule("jamming"), jammerKinds: rule("jammerKinds"), radarJamming: rule("radarJamming") });
  // #486's electrical hazards, registered first as the book registers them, so both sets of shock listeners are live.
  const electricity = await import("../electricity/index.js");
  electricity.readyElectricity(api as never, { hazards: rule("electricalHazards"), protection: rule("shockProtection"), powerLines: rule("powerLines"), glare: rule("lightDazzle") });
  electric.readyElectricSecurity(api as never, switches);
}

beforeEach(async () => {
  actions = new Map();
  sections = new Map();
  tools = new Map();
  prices = [];
  successes = [];
  contests = [];
  conditions = [];
  shocks = [];
  outcomes = [];
  chat = [];
  on = new Set();
  dialogAnswer = null;
  targets = [];
  selected = [];
  successResults = [];
  hooks = new Map();
  vi.stubGlobal("Hooks", { on: (name: string, fn: (context: any) => void) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); }, isGM: true },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { create: async (m: any) => chat.push(m), getSpeaker: () => ({}), getWhisperRecipients: () => ["gm"] } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("canvas", { tokens: { placeables: [], get controlled() { return selected.map((actor) => ({ actor })); } } });
  await load();
});

afterEach(() => {
  vi.unstubAllGlobals();
  SECURITY_TABLES.clear();
});

const eeLines = (item: any): string[] => sections.get("ht-electric-security-item").context(item).lines;
const htLines = (item: any): string[] => sections.get("ht-security-item").context(item).lines;
const price = (item: any, cost = 100, weight = 1) => prices.map((m) => m.apply(item, { cost, weight })).filter(Boolean);
const trapAnswer = (kind: string, more: Record<string, unknown> = {}) => ({ kind, yards: 1, seconds: 1, metal: false, watching: false, hidden: false, fishingLine: false, dirty: false, touch: "first", cutOff: 10, alarmed: false, ...more }) as never;
const taskAnswer = (task: string, more: Record<string, unknown> = {}) => ({ task, way: "vision", camouflage: 0, simple: false, ownBatteries: false, professional: false, hearing: true, grade: "basic", st: 24, ...more }) as never;

describe("with every switch off", () => {
  it("changes nothing", () => {
    const fence = gear("Low-Voltage Fence (per mile)");
    const magnet = gear("Magnetic Lock (Micro)");
    const biometric = gear("Biometric Identification (Fingerprints)", { lock: { quality: "fine" }, eeSecurity: { portable: true } });
    expect(sections.get("ht-electric-security-item").visible(fence)).toBe(false);
    expect(sections.get("ht-security-item").visible(magnet)).toBe(false);
    expect(price(biometric)).toEqual([]);
    expect(tools.get("ht-traps").visible()).toBe(false);
    expect(tools.get("ht-electric-security").visible()).toBe(false);
    expect(actions.get("ht-ee-screen").visible(gear("Metal Detector (TL8)"))).toBe(false);
  });

  it("leaves every other shock alone", async () => {
    on = new Set([key("stunLethalFences")]);
    const context = { actor: person("Linesman"), injury: 6, stunned: true, contactSeconds: 3, contact: null, lines: [] };
    fire(HOOKS.shockModifiers, context);
    fire(HOOKS.afterShock, context);
    expect(context.contact).toBeNull();
    expect(context.lines).toEqual([]);
  });
});

describe("stun-lethal fences, with only their switch on", () => {
  beforeEach(() => {
    on = new Set([key("stunLethalFences")]);
  });

  it("offers the traps tool with the two fences, and the fences' figures", () => {
    expect(tools.get("ht-traps").visible()).toBe(true);
    expect(eeLines(gear("Low-Voltage Fence (per mile)"))[0]).toContain("Fence.LowVoltage");
    expect(eeLines(gear("High-Voltage Fence (per 0.25 mile)"))).toEqual([expect.stringContaining('Fence.StunLethal {"formula":"3d"}'), "GCC.HT.ElectricSecurity.Fence.SecurityFree"]);
    // High-Tech's own lethal fence takes the security fence's alarm too.
    const lethal = gear("Lethal Fence (control box and 1/4 mile)", { eeSecurity: { alarmed: true } });
    expect(sections.get("ht-electric-security-item").context(lethal).option).toMatchObject({ key: "alarmed", checked: true });
    expect(price(lethal, 10000)).toEqual([{ cost: 10100, weight: 1, label: "GCC.HT.ElectricSecurity.Option.alarmed" }]);
    expect(price(gear("High-Voltage Fence (per 0.25 mile)", { eeSecurity: { alarmed: true } }))).toEqual([]);
  });

  it("runs a low-voltage fence: pain, an unmodified HT roll a second, the stun held for the rest of the contact", async () => {
    const victim = person("Climber");
    outcomes = [{ stunned: false }, { stunned: true }];
    await security.runTrapOn(fakeApi() as never, [victim], trapAnswer("lowVoltageFence", { seconds: 5 }));
    expect(conditions[0]).toEqual({ actor: "Climber", key: "moderatePain", duration: { seconds: 5 } });
    expect(shocks.map((s) => [s.kind, s.modifier, s.continuous, s.contactSeconds])).toEqual([["nonlethal", 0, false, 4], ["nonlethal", 0, false, 3]]);
    expect(shocks[0].lines[0]).toContain("ElectricSecurity.LowVoltage");
    expect(conditions[1]).toEqual({ actor: "Climber", key: "stunned", holdRecovery: { seconds: 3 } });
    // The afterShock listener says the stunned victim stays on the wire.
    expect(shocks[1].contact).toEqual({ held: true, label: expect.stringContaining("ElectricSecurity.StunnedOn") });
    expect(chat).toHaveLength(0);
  });

  it("arms a stun-lethal fence at the first touch, and sounds its alarm to the GM", async () => {
    await security.runTrapOn(fakeApi() as never, [person("Climber")], trapAnswer("stunLethalFence", { seconds: 2 }));
    expect(shocks.map((s) => s.kind)).toEqual(["nonlethal", "nonlethal"]);
    expect(chat[0].whisper).toEqual(["gm"]);
    expect(chat[0].content).toContain("FenceAlarm");
    expect(chat[1].content).toContain("ElectricSecurity.Armed");
  });

  it("holds whoever high voltage injures by more than 1 point, until the current is cut (HT:EE pp. 9, 42)", async () => {
    outcomes = [{ injury: 4 }, { injury: 3 }, { injury: 5 }];
    await security.runTrapOn(fakeApi() as never, [person("Climber")], trapAnswer("stunLethalFence", { touch: "second", seconds: 1, cutOff: 3, alarmed: false }));
    expect(shocks.map((s) => [s.kind, s.formula, s.continuous, s.contactSeconds])).toEqual([["lethal", "3d", true, 0], ["lethal", "3d", true, 0], ["lethal", "3d", true, 0]]);
    expect(shocks[0].lines[0]).toContain("ElectricSecurity.HighVoltage");
    expect(chat.at(-1).content).toContain('CutOff {"name":"Climber","seconds":3}');
  });

  it("lets go of high voltage that does 1 point or less", async () => {
    outcomes = [{ injury: 1 }];
    await security.runTrapOn(fakeApi() as never, [person("Climber")], trapAnswer("stunLethalFence", { touch: "second", seconds: 1, cutOff: 10 }));
    expect(shocks).toHaveLength(1);
  });

  it("says who is held, on the shock's own card", async () => {
    const victim = person("Climber");
    const held = fire(HOOKS.afterShock, { actor: victim, injury: 4, contact: null, lines: [] });
    expect(held.contact).toBeNull();
    outcomes = [{ injury: 4 }];
    let seen: any = null;
    hooks.set(HOOKS.afterShock, [...(hooks.get(HOOKS.afterShock) ?? []), (c: any) => { seen = c.contact; }]);
    await security.runTrapOn(fakeApi() as never, [victim], trapAnswer("stunLethalFence", { touch: "second", seconds: 1, cutOff: 1 }));
    expect(seen).toEqual({ held: true, label: expect.stringContaining("ElectricSecurity.Held") });
  });
});

describe("electric locks, with only their switch on", () => {
  beforeEach(() => {
    on = new Set([key("electricLocks")]);
  });

  it("reads the supplement's locks as High-Tech's lock records, with their grades", () => {
    const magnet = gear("Magnetic Lock (Shear)", { lock: { quality: "good" } });
    expect(security.lockRecord(magnet)).toEqual({ kind: "electronic", rule: "electricLocks" });
    expect(sections.get("ht-security-item").context(magnet).quality).not.toBeNull();
    expect(htLines(magnet)[0]).toContain("Item.Pick.electronic");
    expect(eeLines(magnet)[0]).toContain('"st":32');
    expect(price(magnet, 80)).toEqual([{ cost: 400, weight: 1, label: expect.stringContaining("QualityPrice") }]);
    // High-Tech's own locks stay under locksAndSafes.
    expect(sections.get("ht-security-item").visible(gear("Lock, Tough"))).toBe(false);
  });

  it("shows the digital stethoscope's bonuses, and gives +1 to crack a safe", () => {
    expect(eeLines(gear("Digital Stethoscope"))[0]).toContain('"safe":1,"hearing":3,"eod":1,"noise":1');
    const { modifiers } = security.pickModifiers(fakeApi() as never, person("Cracker"), "picks", { name: "Safe", kind: "safe", quality: "good", tl: 8 }, { stethoscope: false, endoscope: false, timeFactor: 1, digitalStethoscope: true });
    expect(modifiers).toContainEqual({ label: "GCC.HT.Security.Pick.DigitalStethoscope", value: 1 });
  });

  it("offers the GM tool with the lock jobs alone", () => {
    expect(tools.get("ht-electric-security").visible()).toBe(true);
    expect(electric.tasksFor(switches)).toEqual(["keySwitch", "magneticPower", "magneticForce"]);
  });

  it("bypasses a key switch with the best of its three skills", async () => {
    await electric.runElectricTask(fakeApi() as never, person("Thief", [], { Mechanic: 14, Lockpicking: 12 }), taskAnswer("keySwitch"), switches);
    expect(successes[0]).toMatchObject({ skill: "Mechanic", base: 14 });
  });

  it("cuts a magnetic lock's power with Electrician, and forces one as a contest of ST", async () => {
    await electric.runElectricTask(fakeApi() as never, person("Thief"), taskAnswer("magneticPower"), switches);
    expect(successes[0]).toMatchObject({ skill: "Electrician" });
    await electric.runElectricTask(fakeApi() as never, person("Thief"), taskAnswer("magneticForce", { st: 20 }), switches);
    expect(contests[0]).toMatchObject({ first: { base: 11, note: "ST" }, second: { actor: null, base: 20 } });
  });

  it("won't run an alarm job", async () => {
    await electric.runElectricTask(fakeApi() as never, person("Thief"), taskAnswer("disable"), switches);
    expect(successes).toHaveLength(0);
  });
});

describe("screening and alarms, with only their switch on", () => {
  beforeEach(() => {
    on = new Set([key("alarmSystems")]);
  });

  it("joins the biometric systems to the identity verifiers: Electronics Repair (Security) at the grade, priced by it", () => {
    const retina = gear("Biometric Identification (Fingerprints)", { lock: { quality: "fine" }, eeSecurity: { portable: true } });
    expect(security.lockRecord(retina)).toMatchObject({ kind: "verifier", skill: "Electronics Repair (Security)" });
    expect(htLines(retina)).toContain('GCC.HT.Security.Item.PickWith {"skill":"Electronics Repair (Security)","modifier":"-5"}');
    expect(price(retina, 500, 2)).toEqual([
      { cost: 10000, weight: 2, label: expect.stringContaining("QualityPrice") },
      { cost: 505, weight: 2.2, label: "GCC.HT.ElectricSecurity.Option.portable" },
    ]);
    expect(eeLines(retina)[1]).toContain("Screen.Kind.fingerprints");
    // High-Tech's own verifiers stay under locksAndSafes.
    expect(security.lockRecord(gear("Retinal Scanner"))).toEqual({ kind: "verifier" });
    expect(sections.get("ht-security-item").visible(gear("Retinal Scanner"))).toBe(false);
  });

  it("adds its notes and the portable unit to High-Tech's verifiers, which stand for three of its systems (E2)", () => {
    const scanner = gear("Retinal Scanner", { eeSecurity: { portable: true } });
    expect(eeLines(scanner)).toEqual([expect.stringContaining("Screen.Portable"), expect.stringContaining("Screen.Kind.retinalPatterns")]);
    expect(price(scanner, 500, 2)).toEqual([{ cost: 505, weight: 2.2, label: "GCC.HT.ElectricSecurity.Option.portable" }]);
  });

  it("doubles a keycard reader's price when it logs the cards", () => {
    const reader = gear("Keycard Reader (RFID)", { eeSecurity: { logged: true } });
    expect(price(reader, 70)).toEqual([{ cost: 140, weight: 1, label: "GCC.HT.ElectricSecurity.Option.logged" }]);
    expect(eeLines(reader)).toContain("GCC.HT.ElectricSecurity.Screen.Tech.rfid");
  });

  it("shows each alarm's figures, High-Tech's electric alarm among them", () => {
    expect(eeLines(gear("Electric Alarm (per portal)"))).toEqual([
      expect.stringContaining("Alarm.electric"),
      expect.stringContaining('"vision":-5,"disable":"Traps"'),
    ]);
    expect(eeLines(gear("IR Motion Detector"))[0]).toContain('"yards":25');
  });

  it("offers the GM tool with the alarm and screening jobs alone", () => {
    expect(tools.get("ht-electric-security").visible()).toBe(true);
    expect(electric.tasksFor(switches)).toEqual(["spot", "identify", "disable", "cutPower", "biometric", "signature"]);
  });

  it("spots an alarm by High-Tech's roll: Vision-5, or a contest with Camouflage", async () => {
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("spot"), switches);
    expect(successes[0]).toMatchObject({ base: 12, modifiers: [{ value: -5 }] });
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("spot", { way: "observation", camouflage: 14 }), switches);
    expect(contests[0]).toMatchObject({ second: { actor: null, base: 14, note: "Camouflage" } });
  });

  it("disables an alarm in secret: Electronics Repair (Security), or Traps for a simple one, and a failure sets it off", async () => {
    successResults = [{ success: false, margin: 2 }];
    await electric.runElectricTask(fakeApi() as never, person("Burglar", [gear("Digital Stethoscope")]), taskAnswer("disable"), switches);
    // The stethoscope's +3 is the electric locks rule's, which is off.
    expect(successes[0]).toMatchObject({ skill: "Electronics Repair (Security)", secret: true, modifiers: [] });
    expect(chat[0].content).toContain("ElectricSecurity.AlarmSounds");
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("disable", { simple: true }), switches);
    expect(successes[1]).toMatchObject({ skill: "Traps" });
  });

  it("adds the digital stethoscope's +3 by ear with the electric locks rule on too", async () => {
    on.add(key("electricLocks"));
    await electric.runElectricTask(fakeApi() as never, person("Burglar", [gear("Digital Stethoscope")]), taskAnswer("disable"), switches);
    expect(successes[0].modifiers).toEqual([{ label: "GCC.HT.ElectricSecurity.StethoscopeLine", value: 3 }]);
  });

  it("cuts an alarm's power only where it can", async () => {
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("cutPower", { ownBatteries: true }), switches);
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("cutPower", { professional: true }), switches);
    expect(successes).toHaveLength(0);
    expect(chat.map((m) => m.content)).toEqual([expect.stringContaining("OwnBatteriesLine"), expect.stringContaining("ProfessionalLine")]);
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("cutPower"), switches);
    expect(successes[0]).toMatchObject({ skill: "Electrician", secret: true });
  });

  it("bypasses a biometric system at its grade, and forges a signature only with the skill", async () => {
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("biometric", { grade: "fine" }), switches);
    expect(successes[0]).toMatchObject({ skill: "Electronics Repair (Security)", modifiers: [{ value: -5 }] });
    await electric.runElectricTask(fakeApi() as never, person("Burglar"), taskAnswer("signature"), switches);
    expect(successes).toHaveLength(1);
    expect(chat[0].content).toContain("NeedsSecurity");
    await electric.runElectricTask(fakeApi() as never, person("Forger", [], { "Electronics Operation (Security)": 12, Forgery: 13 }), taskAnswer("signature"), switches);
    expect(successes[1]).toMatchObject({ skill: "Forgery", base: 13, modifiers: [{ value: -3 }] });
  });

  it("screens with a general-purpose metal detector in improvised use, as High-Tech's handheld one", async () => {
    const detector = gear("Metal Detector (TL8)");
    expect(actions.get("ht-ee-screen").visible(detector)).toBe(true);
    expect(actions.get("ht-screen").visible(detector)).toBe(false);
    dialogAnswer = { skill: "Search", metallic: true, explosive: false, patDown: true, sensitivity: 1 };
    actions.get("ht-ee-screen").run(detector, person("Guard", [], { Search: 12 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The operator's roll to claim the bonus, then the search at +2 with a pat-down.
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Security)" });
    expect(successes[1]).toMatchObject({ skill: "Search", modifiers: [{ value: 2 }] });
  });
});

describe("with the electrical hazards switches on too (#486)", () => {
  const HAZARDS = ["electricalHazards", "shockProtection", "powerLines"];

  beforeEach(() => {
    on = new Set([key("stunLethalFences"), ...HAZARDS.map(key)]);
  });

  it("holds a fence's victim once, on the hazards rule's word, and adds the fence's own line", async () => {
    outcomes = [{ injury: 4 }, { injury: 1 }];
    await security.runTrapOn(fakeApi() as never, [person("Climber")], trapAnswer("stunLethalFence", { touch: "second", seconds: 1, cutOff: 5 }));
    // Held after the first second (4 points), let go after the second (1 point): the loop reads the one contact.
    expect(shocks).toHaveLength(2);
    expect(shocks[0].contact).toEqual({ held: true, label: "GCC.HT.Electricity.CantLetGo" });
    expect(shocks[1].contact).toBeNull();
    expect(shocks[0].lines.filter((l: string) => l.includes("ElectricSecurity.HighVoltage"))).toHaveLength(1);
    // The hazards rule's own source (its current's step) is its tool's alone: not on a fence.
    expect(shocks[0].lines.filter((l: string) => l.includes("Electricity.Step"))).toEqual([]);
  });

  it("leaves a shock that isn't a fence's to the hazards rule alone", async () => {
    outcomes = [{ injury: 4 }];
    const result: any = await (fakeApi().hazards.shock as any)({ actor: person("Linesman"), kind: "lethal", modifier: 0, continuous: true, formula: "3d", metalArmor: false, contactSeconds: 2 });
    expect(result.contact).toEqual({ held: true, label: "GCC.HT.Electricity.CantLetGo" });
    expect(result.lines.filter((l: string) => l.includes("ElectricSecurity"))).toEqual([]);
  });

  it("holds a fence's victim by its own rule with the hazards rule off", async () => {
    on = new Set([key("stunLethalFences")]);
    outcomes = [{ injury: 4 }];
    await security.runTrapOn(fakeApi() as never, [person("Climber")], trapAnswer("stunLethalFence", { touch: "second", seconds: 1, cutOff: 1 }));
    expect(shocks[0].contact).toEqual({ held: true, label: expect.stringContaining("ElectricSecurity.Held") });
  });

  it("leaves a fence's low-voltage stun to the fence, which the hazards rule doesn't hold", async () => {
    outcomes = [{ stunned: true }];
    await security.runTrapOn(fakeApi() as never, [person("Climber")], trapAnswer("lowVoltageFence", { seconds: 3 }));
    expect(shocks[0].contact).toEqual({ held: true, label: expect.stringContaining("ElectricSecurity.StunnedOn") });
  });
});
