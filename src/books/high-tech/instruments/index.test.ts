import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as systemRules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { readyInstruments } from "./index.js";

/** What the dialog's form holds, by field name: a value, or a checkbox's state. */
let form: Record<string, string | boolean> = {};
let dialogs: string[] = [];
let switches = { measurement: true, instruments: true, combined: true };
const rowActions: any[] = [];
const rolls: any[] = [];
const damage: any[] = [];
const shocks: any[] = [];
const cards: string[] = [];
let nextRolls: any[] = [];
let targets: any[] = [];
const hooks = new Map<string, (context: any) => void>();

const api: any = {
  rules: {
    toolSkillKey: (name: string) => name.replace(/\/TL\d*/i, "").trim().toLowerCase(),
    equipmentQualityModifier: systemRules.equipmentQualityModifier,
    gradeRow: systemRules.gradeRow,
    formatDiceAdds: systemRules.formatDiceAdds,
  },
  actors: {
    attribute: (actor: any, name: string) => actor.attributes?.[name] ?? 10,
    skillLevel: (actor: any, skill: string) => actor.skills?.[api.rules.toolSkillKey(skill)] ?? null,
    derived: (actor: any) => actor.derived ?? null,
  },
  roll: {
    success: async (options: any) => { rolls.push(options); return nextRolls.shift() ?? { success: true, criticalFailure: false, margin: 2, roll: 9 }; },
    damage: async (options: any) => { damage.push(options); return { total: 1 }; },
  },
  hazards: { shock: async (options: any) => { shocks.push(options); return {}; } },
  sheets: { registerRowAction: (a: any) => rowActions.push(a) },
  combat: { hooks: { successRollModifiers: "gworld.successRollModifiers", studyModifiers: "gworld.studyModifiers" } },
};

const action = (key: string) => rowActions.find((a) => a.key === key);
const values = (roll: any) => roll.modifiers.map((m: any) => m.value);

function character(name: string, options: { skills?: Record<string, number>; attributes?: Record<string, number>; items?: any[]; derived?: any } = {}): any {
  const skills = Object.fromEntries(Object.entries(options.skills ?? {}).map(([k, v]) => [api.rules.toolSkillKey(k), v]));
  const skillItems = Object.keys(options.skills ?? {}).map((name) => ({ type: "skill", name }));
  return { id: name, name, isOwner: true, skills, attributes: options.attributes ?? {}, items: [...skillItems, ...(options.items ?? [])], derived: options.derived };
}
const gear = (name: string, extra: Record<string, unknown> = {}, book: string | null = "high-tech") => ({
  name,
  type: "equipment",
  system: { carried: true, tl: "6", quantity: 1, equipmentQuality: "basic", forSkills: [], ...extra },
  flags: book ? { [MODULE_ID]: { book } } : {},
});

/** A stand-in for the dialog's form: the field's value from `form`, or a checkbox's state. */
function fakeForm(): any {
  return {
    querySelector: (selector: string) => {
      const name = /name="?([\w-]+)"?/.exec(selector)?.[1] ?? "";
      if (!(name in form)) return null;
      const v = form[name];
      return typeof v === "boolean" ? { checked: v, value: "on" } : { value: String(v), checked: false };
    },
  };
}

beforeAll(() => {
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: any) => `${key} ${JSON.stringify(data)}` },
    get user() { return { targets: targets.map((actor) => ({ actor })) }; },
  });
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (s: string) => s },
    applications: { api: { DialogV2: { prompt: async (options: any) => {
      dialogs.push(String(options.content));
      return options.ok.callback(null, { closest: () => fakeForm() });
    } } } },
  });
  vi.stubGlobal("ChatMessage", { implementation: { create: vi.fn(async (m: any) => { cards.push(String(m.content)); return {}; }), getSpeaker: () => ({}) } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("Hooks", { on: (name: string, fn: (context: any) => void) => hooks.set(name, fn) });
  readyInstruments(api, { measurement: () => switches.measurement, instruments: () => switches.instruments, combined: () => switches.combined });
});

beforeEach(() => {
  switches = { measurement: true, instruments: true, combined: true };
  form = {};
  dialogs = [];
  rolls.length = 0;
  damage.length = 0;
  shocks.length = 0;
  cards.length = 0;
  nextRolls = [];
  targets = [];
  (ui.notifications!.warn as any).mockClear();
});

afterAll(() => vi.unstubAllGlobals());

describe("the rows, by switch", () => {
  it("offers Use on an instrument under any of the three switches, and only on High-Tech's gear or gear of no book", () => {
    const use = action("ht-instrument-use");
    expect(use.visible(gear("Moving Magnet Galvanometer"))).toBe(true);
    expect(use.visible(gear("Moving Magnet Galvanometer", {}, null))).toBe(true);
    expect(use.visible(gear("Moving Magnet Galvanometer", {}, "ultra-tech"))).toBe(false);
    expect(use.visible(gear("Crowbar"))).toBe(false);
    switches = { measurement: true, instruments: false, combined: false };
    expect(use.visible(gear("Quadrant Electrometer"))).toBe(true);
    // Measuring alone has nothing to do with a machine that only runs.
    expect(use.visible(gear("Wimshurst Generator"))).toBe(false);
    switches = { measurement: false, instruments: false, combined: true };
    expect(use.visible(gear("Wimshurst Generator"))).toBe(true);
    switches = { measurement: false, instruments: false, combined: false };
    expect(use.visible(gear("Quadrant Electrometer"))).toBe(false);
  });

  it("offers each instrument's own rows under the lab switch", () => {
    expect(action("ht-instrument-telegraph").visible(gear("Mirror Galvanometer"))).toBe(true);
    expect(action("ht-instrument-telegraph").visible(gear("D'Arsonval Moving Coil Galvanometer"))).toBe(false);
    expect(action("ht-instrument-analyze").visible(gear("Spectrum Analyzer"))).toBe(true);
    expect(action("ht-instrument-analyze").visible(gear("Spectrum Analyzer (Digital)", { tl: "8" }))).toBe(true);
    expect(action("ht-instrument-connect").visible(gear("Thermistor"))).toBe(true);
    expect(action("ht-instrument-connect").visible(gear("Geiger Counter (TL8)"))).toBe(false);
    expect(action("ht-instrument-discharge").visible(gear("Van de Graaff Generator"))).toBe(true);
    expect(action("ht-instrument-discharge").visible(gear("Wimshurst Generator"))).toBe(false);
    expect(action("ht-instrument-build").visible(gear("General-Purpose Analog Computer"))).toBe(true);
    expect(action("ht-plot-waveform").visible({ type: "skill", name: "Mathematics (Applied)" })).toBe(true);
    expect(action("ht-plot-waveform").visible({ type: "skill", name: "Physics/TL6" })).toBe(true);
    switches.instruments = false;
    for (const key of ["ht-instrument-telegraph", "ht-instrument-analyze", "ht-instrument-connect", "ht-instrument-discharge", "ht-instrument-build"]) {
      expect(action(key).visible(gear("Mirror Galvanometer"))).toBe(false);
    }
    expect(action("ht-plot-waveform").visible({ type: "skill", name: "Physics" })).toBe(false);
  });

  it("offers the spark-gap voltmeter on Physics under the measuring switch", () => {
    expect(action("ht-spark-gap").visible({ type: "skill", name: "Physics/TL6" })).toBe(true);
    expect(action("ht-spark-gap").visible({ type: "skill", name: "Chemistry" })).toBe(false);
    switches.measurement = false;
    expect(action("ht-spark-gap").visible({ type: "skill", name: "Physics" })).toBe(false);
  });
});

describe("detecting and measuring (HT:EE p. 10)", () => {
  it("detects a dangerous voltage at +4, a weak source at -4, with the instrument's quality", async () => {
    const meter = gear("Quadrant Electrometer", { equipmentQuality: "good" });
    const tech = character("Tech", { skills: { "Electronics Operation/TL6 (Scientific)": 12 }, items: [meter] });
    form = { skill: "0", task: "detect", source: "dangerous", time: "1" };
    await action("ht-instrument-use").run(meter, tech);
    expect(rolls[0]).toMatchObject({ base: 12, skill: "Electronics Operation (Scientific)", item: meter });
    expect(values(rolls[0])).toEqual([4, 1]);
    expect(cards[0]).toContain("Reading.detected");
    expect(cards[0]).toContain("Routine");

    rolls.length = 0;
    form = { skill: "0", task: "detect", source: "weak", time: "1" };
    await action("ht-instrument-use").run(meter, tech);
    expect(values(rolls[0])).toEqual([-4, 1]);

    // A professional's routine check, the month's job roll made: found, no roll.
    rolls.length = 0;
    form = { skill: "0", task: "detect", source: "weak", time: "1", routine: true };
    await action("ht-instrument-use").run(meter, tech);
    expect(rolls).toHaveLength(0);
    expect(cards.at(-1)).toContain("RoutineFound");
  });

  it("puts a failed measurement off by 5% a point, narrowed by quality; a critical failure breaks the reading", async () => {
    const meter = gear("Multimeter");
    const tech = character("Tech", { skills: { Physics: 11 }, items: [meter] });
    form = { skill: "0", task: "measure", time: "2" };
    nextRolls = [{ success: false, criticalFailure: false, margin: 3, roll: 14 }];
    await action("ht-instrument-use").run(meter, tech);
    // Twice the time is +1 (Campaigns p. 346).
    expect(values(rolls[0])).toEqual([1]);
    expect(cards[0]).toContain('Reading.off {"percent":15}');

    meter.system.equipmentQuality = "fine";
    nextRolls = [{ success: false, criticalFailure: false, margin: 3, roll: 14 }];
    await action("ht-instrument-use").run(meter, tech);
    expect(cards[1]).toContain('Reading.off {"percent":0.75}');

    nextRolls = [{ success: false, criticalFailure: true, margin: 7, roll: 18 }];
    await action("ht-instrument-use").run(meter, tech);
    expect(cards[2]).toContain("Reading.broken");
  });

  it("gives no quality line where the instrument is already the skill's tool", async () => {
    const meter = gear("Multimeter", { equipmentQuality: "good", forSkills: ["Physics"] });
    const tech = character("Tech", { skills: { Physics: 11 }, items: [meter] });
    form = { skill: "0", task: "measure", time: "1" };
    await action("ht-instrument-use").run(meter, tech);
    expect(values(rolls[0])).toEqual([]);
  });

  it("rolls at a skill's default where the character hasn't learned one", async () => {
    const meter = gear("Gold Leaf Electroscope");
    const lay = character("Lay", { attributes: { IQ: 12 }, items: [meter] });
    form = { skill: "0", task: "detect", source: "ordinary", time: "1" };
    await action("ht-instrument-use").run(meter, lay);
    // Electronics Operation at IQ-5 beats Physics at IQ-6.
    expect(rolls[0]).toMatchObject({ base: 7, skill: "Electronics Operation (Scientific)" });
  });

  it("improvises a spark-gap voltmeter with Physics at -5, reading as improvised gear", async () => {
    const physicist = character("Physicist", { skills: { "Physics/TL5": 14 } });
    nextRolls = [{ success: false, criticalFailure: false, margin: 2, roll: 12 }];
    await action("ht-spark-gap").run({ type: "skill", name: "Physics/TL5" }, physicist);
    expect(rolls[0]).toMatchObject({ base: 14, skill: "Physics" });
    expect(values(rolls[0])).toEqual([-5]);
    expect(cards[0]).toContain('Reading.off {"percent":10}');
  });

  it("with only the measuring switch, asks nothing of the lab switch", async () => {
    switches = { measurement: true, instruments: false, combined: false };
    const galvanometer = gear("Moving Magnet Galvanometer");
    const tech = character("Tech", { skills: { Physics: 12 }, items: [galvanometer] });
    form = { skill: "0", task: "measure", magnetic: "5", noise: "4", combined: true, time: "1" };
    await action("ht-instrument-use").run(galvanometer, tech);
    expect(dialogs[0]).not.toContain("Magnetic");
    expect(dialogs[0]).not.toContain("Combined");
    expect(values(rolls[0])).toEqual([]);
  });
});

describe("the laboratory instruments (HT:EE pp. 10-13)", () => {
  it("disturbs a moving-magnet galvanometer, and lets a carried lock-in amplifier disregard the noise", async () => {
    const galvanometer = gear("Moving Magnet Galvanometer");
    const lockIn = gear("Lock-In Amplifier (TL7)", { tl: "7" });
    const tech = character("Tech", { skills: { Physics: 12 }, items: [galvanometer, lockIn] });
    form = { skill: "0", task: "operate", magnetic: "3", noise: "8", time: "1" };
    await action("ht-instrument-use").run(galvanometer, tech);
    expect(dialogs[0]).toContain("NoiseLockIn");
    expect(values(rolls[0])).toEqual([-3, -2]);

    rolls.length = 0;
    const coil = gear("D'Arsonval Moving Coil Galvanometer");
    const alone = character("Alone", { skills: { Physics: 12 }, items: [coil] });
    await action("ht-instrument-use").run(coil, alone);
    // Unaffected by magnetic fields, and no lock-in to hand.
    expect(values(rolls[0])).toEqual([-8]);
  });

  it("gives an early vacuum-tube voltmeter -2, where the user says it is one", async () => {
    const vtvm = gear("Vacuum-Tube Voltmeter (VTVM)");
    const tech = character("Tech", { skills: { Physics: 12 }, items: [vtvm] });
    form = { skill: "0", task: "operate", early: true, time: "1" };
    await action("ht-instrument-use").run(vtvm, tech);
    expect(values(rolls[0])).toEqual([-2]);
  });

  it("traces FM at -5 with a signal tracer, with the listener's Hearing", async () => {
    const tracer = gear("Signal Tracer", { tl: "7" });
    const tech = character("Tech", {
      skills: { "Electronics Repair/TL7 (Communications)": 13 },
      items: [tracer],
      derived: { per: 10, senses: [{ sense: "hearing", score: 12 }] },
    });
    form = { skill: "0", task: "detect", source: "ordinary", signal: "fm", time: "1" };
    await action("ht-instrument-use").run(tracer, tech);
    expect(rolls[0]).toMatchObject({ base: 13, skill: "Electronics Repair (Communications)" });
    expect(values(rolls[0])).toEqual([-5, 2]);
  });

  it("reads a transducer only through a display, as a combined device at -2", async () => {
    const tube = gear("Geiger-Müller Tube");
    const tech = character("Tech", { skills: { "Electronics Operation (Scientific)": 12 }, items: [tube] });
    await action("ht-instrument-use").run(tube, tech);
    expect(ui.notifications!.warn).toHaveBeenCalledWith("GCC.HT.Instruments.NeedsDisplay");
    expect(rolls).toHaveLength(0);

    tech.items.push(gear("Mirror Galvanometer"));
    form = { skill: "0", task: "detect", source: "dangerous", complexity: "0", combined: true, time: "1" };
    await action("ht-instrument-use").run(tube, tech);
    expect(dialogs[0]).toMatch(/name="combined" checked/);
    expect(values(rolls[0])).toEqual([4, -2]);
  });

  it("uses a dedicated device at +2, a complex one at a penalty doubled against a science", async () => {
    const counter = gear("Geiger Counter (TL8)", { tl: "8" });
    const tech = character("Tech", { skills: { "Electronics Operation (Scientific)": 12, Physics: 13 }, items: [counter] });
    form = { skill: "0", task: "operate", complexity: "2", time: "1" };
    await action("ht-instrument-use").run(counter, tech);
    expect(rolls[0]).toMatchObject({ base: 12, skill: "Electronics Operation (Scientific)" });
    expect(values(rolls[0])).toEqual([2, -2]);

    rolls.length = 0;
    form = { skill: "1", task: "operate", complexity: "2", time: "1" };
    await action("ht-instrument-use").run(counter, tech);
    expect(rolls[0]).toMatchObject({ base: 13, skill: "Physics" });
    expect(values(rolls[0])).toEqual([-4]);
  });

  it("reads light at the darkness penalty with the photodetector, and the TL6 metal detector at -2 with a field's skill after", async () => {
    const cell = gear("Photodetector");
    const tech = character("Tech", { skills: { "Electronics Operation (Scientific)": 12, Prospecting: 11 }, items: [cell] });
    form = { skill: "0", task: "measure", darkness: "3", complexity: "0", time: "1" };
    await action("ht-instrument-use").run(cell, tech);
    expect(values(rolls[0])).toEqual([-3]);

    rolls.length = 0;
    const detector = gear("Metal Detector (TL6)");
    tech.items.push(detector);
    form = { skill: "0", task: "detect", source: "ordinary", complexity: "0", time: "1" };
    await action("ht-instrument-use").run(detector, tech);
    expect(values(rolls[0])).toEqual([2, -2]);
    expect(rolls[1]).toMatchObject({ base: 11, skill: "Prospecting" });
  });

  it("gives Diagnosis -2 or -4 on a heart monitor worn briefly", async () => {
    const monitor = gear("Heart Monitor", { tl: "7" });
    const doctor = character("Doctor", { skills: { Diagnosis: 14 }, items: [monitor] });
    form = { skill: "0", wear: "halfHour", time: "1" };
    await action("ht-instrument-use").run(monitor, doctor);
    expect(rolls[0]).toMatchObject({ base: 14, skill: "Diagnosis" });
    expect(values(rolls[0])).toEqual([-4]);
  });

  it("burns the Tesla coil's operator on a critical failure, and conducts the line's current on an 18", async () => {
    const coil = gear("Large Tesla Coil");
    const showman = character("Showman", { skills: { Electrician: 11 }, items: [coil] });
    form = { skill: "0", line: "major", shielded: false, time: "1" };
    nextRolls = [{ success: false, criticalFailure: true, margin: 7, roll: 18 }];
    await action("ht-instrument-use").run(coil, showman);
    expect(damage[0]).toMatchObject({ actor: showman, formula: "1d-3", damageType: "burn" });
    expect(shocks[0]).toMatchObject({ actor: showman, kind: "lethal", formula: "1d+1", continuous: true });

    damage.length = 0;
    shocks.length = 0;
    const small = gear("Small Tesla Coil", { tl: "8" });
    form = { skill: "0", line: "household", shielded: true, time: "1" };
    nextRolls = [{ success: false, criticalFailure: true, margin: 7, roll: 18 }];
    await action("ht-instrument-use").run(small, showman);
    expect(damage[0]).toMatchObject({ formula: "1" });
    expect(shocks).toHaveLength(0);
  });

  it("reads a telegraph line through a mirror galvanometer at +4", async () => {
    const mirror = gear("Mirror Galvanometer");
    const operator = character("Operator", { skills: { "Electronics Operation/TL5 (Communications)": 11 }, items: [mirror] });
    await action("ht-instrument-telegraph").run(mirror, operator);
    expect(rolls[0]).toMatchObject({ base: 11, skill: "Electronics Operation (Communications)" });
    expect(values(rolls[0])).toEqual([4]);
  });

  it("puts the spectrum analyzer to its uses, each with what it needs", async () => {
    const analyzer = gear("Spectrum Analyzer", { tl: "7" });
    const tech = character("Tech", { skills: { "Mechanic/TL7 (Gasoline Engine)": 12, Linguistics: 10, "Electronics Operation (Scientific)": 13 }, items: [analyzer] });
    form = { use: "vibration", signal: "am", time: "1" };
    await action("ht-instrument-analyze").run(analyzer, tech);
    expect(ui.notifications!.warn).toHaveBeenCalledWith("GCC.HT.Instruments.NeedsAccelerometer");

    tech.items.push(gear("Accelerometer (TL7)", { tl: "7" }));
    await action("ht-instrument-analyze").run(analyzer, tech);
    expect(rolls[0]).toMatchObject({ base: 12, skill: "Mechanic (Gasoline Engine)" });
    expect(values(rolls[0])).toEqual([2]);

    form = { use: "signature", signal: "am", time: "1" };
    await action("ht-instrument-analyze").run(analyzer, tech);
    expect(rolls[1]).toMatchObject({ base: 13, skill: "Electronics Operation (Scientific)" });
    expect(cards.at(-1)).toContain("Signature");
  });

  it("connects a transducer to a display at +2; a critical failure risks it, and one that lives is repaired", async () => {
    const thermistor = gear("Thermistor");
    const tech = character("Tech", { skills: { "Electronics Repair (Scientific)": 12 }, items: [thermistor, gear("Oscilloscope")] });
    form = { skill: "0", time: "1" };
    nextRolls = [{ success: false, criticalFailure: true, margin: 6, roll: 18 }, { success: true, criticalFailure: false, margin: 1, roll: 9 }];
    await action("ht-instrument-connect").run(thermistor, tech);
    expect(rolls[0]).toMatchObject({ base: 12, skill: "Electronics Repair (Scientific)" });
    expect(values(rolls[0])).toEqual([2]);
    expect(rolls[1]).toMatchObject({ base: 10, skill: "HT", kind: "attribute" });
    expect(cards[0]).toContain("Fate.damaged");
    expect(rolls[2]).toMatchObject({ skill: "Electronics Repair (Scientific)" });
  });

  it("shocks whoever is targeted from a Van de Graaff generator, weaker to resist the bigger its sphere", async () => {
    const generator = gear("Van de Graaff Generator");
    const teacher = character("Teacher", { items: [generator] });
    const pupil = character("Pupil");
    targets = [pupil];
    form = { sphere: "18" };
    await action("ht-instrument-discharge").run(generator, teacher);
    expect(shocks[0]).toMatchObject({ actor: pupil, kind: "nonlethal", modifier: -4 });
  });

  it("programs a prototype analog computer in two rolls, and prices a copy built as an invention", async () => {
    const prototype = gear("Tide-Predicting Analog Computer");
    const inventor = character("Inventor", { skills: { "Mathematics (Applied)": 13, "Mechanic (Analog Computers)": 12, "Engineer (Analog Computers)": 14 }, items: [prototype] });
    await action("ht-instrument-use").run(prototype, inventor);
    expect(rolls.map((r) => r.skill)).toEqual(["Mathematics (Applied)", "Mechanic (Analog Computers)"]);

    rolls.length = 0;
    const computer = gear("General-Purpose Analog Computer", { tl: "7", cost: 30000, listCost: 30000 });
    form = { grade: "average", labour: false };
    await action("ht-instrument-build").run(computer, inventor);
    expect(rolls[0]).toMatchObject({ base: 14, skill: "Engineer (Analog Computers)" });
    expect(cards[0]).toContain("CopyCost");
    expect(cards[0]).toContain(`"cost":"${(6000).toLocaleString()}"`);
    expect(cards[0]).toContain('"time":"2d/2"');
  });

  it("compares two signals on an oscilloscope with Electronics Operation (Scientific) and time spent (HT:EE p. 11)", async () => {
    const scope = gear("Oscilloscope");
    const analyst = character("Analyst", { skills: { "Electronics Operation (Scientific)": 12 }, items: [scope] });
    expect(action("ht-instrument-compare").visible(scope)).toBe(true);
    expect(action("ht-instrument-compare").visible(gear("Oscillograph"))).toBe(false);
    form = { time: "2" };
    await action("ht-instrument-compare").run(scope, analyst);
    expect(rolls[0]).toMatchObject({ base: 12, skill: "Electronics Operation (Scientific)", tags: ["instrument", "compare"], item: scope });
    expect(values(rolls[0])).toEqual([1]);
    expect(cards[0]).toContain("Instruments.Compared");
    switches.instruments = false;
    expect(action("ht-instrument-compare").visible(scope)).toBe(false);
  });

  it("gives the bare Geiger-Müller tube its supply's 5d lethal shock, and says what building one takes (HT:EE p. 12)", async () => {
    const tube = gear("Geiger-Müller Tube");
    const physicist = character("Physicist", { skills: { Physics: 13 }, items: [tube] });
    expect(action("ht-geiger-supply").visible(tube)).toBe(true);
    expect(action("ht-geiger-supply").visible(gear("Geiger Counter (TL6)"))).toBe(false);
    expect(action("ht-geiger-supply").visible(gear("Geiger-Müller Tube", {}, "ultra-tech"))).toBe(false);
    const victim = character("Victim");
    targets = [victim];
    await action("ht-geiger-supply").run(tube, physicist);
    expect(shocks[0]).toMatchObject({ actor: victim, kind: "lethal", formula: "5d", continuous: true, source: "geigerSupply" });
  });

  it("shocks one the user doesn't own through the GM, from the Geiger supply or the Van de Graaff (API 1.149.0)", async () => {
    const stranger = { ...character("Stranger"), isOwner: false };
    targets = [stranger];
    const tube = gear("Geiger-Müller Tube");
    const physicist = character("Physicist", { items: [tube] });
    await action("ht-geiger-supply").run(tube, physicist);
    const generator = gear("Van de Graaff Generator");
    const teacher = character("Teacher", { items: [generator] });
    form = { sphere: "9" };
    await action("ht-instrument-discharge").run(generator, teacher);
    expect(shocks.map((s) => [s.actor.name, s.sourceActor])).toEqual([["Stranger", physicist], ["Stranger", teacher]]);
    expect(ui.notifications!.warn).not.toHaveBeenCalled();
  });

  it("builds an analog computer from Mechanic (Analog Computers)-6 for one without the Engineer skill", async () => {
    const computer = gear("General-Purpose Analog Computer", { tl: "7", cost: 30000, listCost: 30000 });
    const mechanic = character("Mechanic", { skills: { "Mechanic (Analog Computers)": 12 }, items: [computer] });
    form = { grade: "average", labour: false };
    await action("ht-instrument-build").run(computer, mechanic);
    expect(rolls[0]).toMatchObject({ base: 6, skill: "Engineer (Analog Computers)" });

    rolls.length = 0;
    const layman = character("Layman", { items: [computer] });
    await action("ht-instrument-build").run(computer, layman);
    expect(rolls).toEqual([]);
  });

  it("plots a waveform by hand at -2, with time spent", async () => {
    const mathematician = character("Mathematician", { skills: { "Mathematics (Applied)": 13 } });
    form = { time: "4" };
    await action("ht-plot-waveform").run({ type: "skill", name: "Mathematics (Applied)" }, mathematician);
    expect(rolls[0]).toMatchObject({ base: 13, skill: "Mathematics (Applied)" });
    expect(values(rolls[0])).toEqual([-2, 2]);
  });
});

describe("combined devices (HT:EE p. 9)", () => {
  const combined = (name: string, book: string | null = "high-tech") => ({ ...gear(name, { extensions: { [MODULE_ID]: { device: { combined: true } } } }, book) });
  const rollWith = (item: any, tags: string[] = ["skill"]) => {
    const context = { actor: character("User"), item, skill: "Electronics Operation (Communications)", tags, modifiers: [] as any[] };
    hooks.get("gworld.successRollModifiers")!(context);
    return context.modifiers;
  };

  it("puts every roll made with a device its sheet marks as combined at -2", () => {
    expect(rollWith(combined("Small Radio (TL6)"))).toEqual([{ key: "ht.combinedDevice", label: "GCC.HT.Instruments.CombinedRecord", value: -2 }]);
    expect(rollWith(gear("Small Radio (TL6)"))).toEqual([]);
    // Another book's gear, and the instrument dialog's own rolls (which carry the line already), take none.
    expect(rollWith(combined("Small Radio (TL6)", "ultra-tech"))).toEqual([]);
    expect(rollWith(combined("Oscilloscope"), ["instrument", "measure"])).toEqual([]);
    switches.combined = false;
    expect(rollWith(combined("Small Radio (TL6)"))).toEqual([]);
  });

  it("ticks the dialog's box for a device marked as combined", async () => {
    const scope = combined("Oscilloscope");
    const tech = character("Tech", { skills: { "Electronics Operation (Scientific)": 12 }, items: [scope] });
    form = { skill: "0", task: "operate", combined: true, time: "1" };
    await action("ht-instrument-use").run(scope, tech);
    expect(dialogs[0]).toMatch(/name="combined" checked/);
    expect(values(rolls[0])).toEqual([-2]);
  });

  it("puts any instrument the user marks as combined at -2, alone of the three switches", async () => {
    switches = { measurement: false, instruments: false, combined: true };
    const scope = gear("Oscilloscope");
    const tech = character("Tech", { skills: { "Electronics Operation (Scientific)": 12 }, items: [scope] });
    form = { skill: "0", combined: true, time: "1" };
    await action("ht-instrument-use").run(scope, tech);
    expect(dialogs[0]).toMatch(/name="combined"\s+\/>/);
    expect(values(rolls[0])).toEqual([-2]);
    expect(cards).toHaveLength(0);
  });
});

describe("training aids (HT:EE p. 13)", () => {
  const study = (actor: any, skill: string, multiplier = 1) => {
    const context = { actor, skill: { type: "skill", name: skill }, method: "selfTeaching", hours: 90, multiplier, lines: [] as string[] };
    hooks.get("gworld.studyModifiers")!(context);
    return context;
  };

  it("counts Hiking studied with an electronic pedometer carried at 1/0.9 of the hours", () => {
    const walker = character("Walker", { items: [gear("Electronic Pedometer", { tl: "8" })] });
    const context = study(walker, "Hiking");
    expect(context.multiplier).toBeCloseTo(1 / 0.9);
    expect(context.lines).toEqual(["GCC.HT.Instruments.Pedometer"]);
    // Another listener's say is kept.
    expect(study(walker, "Hiking", 2).multiplier).toBeCloseTo(2 / 0.9);
  });

  it("leaves other skills, a pedometer left behind or of another book, and the switch off alone", () => {
    expect(study(character("A", { items: [gear("Electronic Pedometer")] }), "Running").multiplier).toBe(1);
    expect(study(character("B", { items: [gear("Electronic Pedometer", { carried: false })] }), "Hiking").multiplier).toBe(1);
    expect(study(character("C", { items: [gear("Electronic Pedometer", {}, "ultra-tech")] }), "Hiking").multiplier).toBe(1);
    switches.instruments = false;
    expect(study(character("D", { items: [gear("Electronic Pedometer")] }), "Hiking").multiplier).toBe(1);
  });

  // Since API 1.146.0 the Study tool reaches attributes and traits, `skill` null for them.
  const train = (actor: any, studied: any) => {
    const context = { actor, skill: studied.kind === "skill" ? studied.item : null, studied, method: "selfTeaching", hours: 90, multiplier: 1, lines: [] as string[] };
    hooks.get("gworld.studyModifiers")!(context);
    return context;
  };
  const ht = { kind: "attribute", item: null, attribute: "HT", name: "HT" };
  const trait = (name: string) => ({ kind: "trait", item: { type: "trait", name }, attribute: null, name });

  it("counts HT, Fit and Very Fit studied with a digital heart monitor carried at 1/0.9 of the hours (HT:EE p. 12)", () => {
    const runner = character("Runner", { items: [gear("Digital Heart Monitor", { tl: "8" })] });
    const context = train(runner, ht);
    expect(context.multiplier).toBeCloseTo(1 / 0.9);
    expect(context.lines).toEqual(["GCC.HT.Instruments.HeartMonitorTraining"]);
    expect(train(runner, trait("Fit")).multiplier).toBeCloseTo(1 / 0.9);
    expect(train(runner, trait("Very Fit")).multiplier).toBeCloseTo(1 / 0.9);
  });

  it("leaves other attributes and traits, a monitor left behind, and the pedometer on HT alone", () => {
    const runner = character("Runner", { items: [gear("Digital Heart Monitor")] });
    expect(train(runner, { kind: "attribute", item: null, attribute: "ST", name: "ST" }).multiplier).toBe(1);
    expect(train(runner, trait("Fitness Freak")).multiplier).toBe(1);
    expect(train(runner, trait("Combat Reflexes")).multiplier).toBe(1);
    expect(train(runner, { kind: "skill", item: { type: "skill", name: "Running" }, attribute: null, name: "Running" }).multiplier).toBe(1);
    expect(train(character("A", { items: [gear("Digital Heart Monitor", { carried: false })] }), ht).multiplier).toBe(1);
    // The pedometer is Hiking's alone: an attribute's or a trait's study, with no skill, isn't.
    const walker = character("Walker", { items: [gear("Electronic Pedometer")] });
    expect(train(walker, ht).multiplier).toBe(1);
    expect(train(walker, trait("Fit")).multiplier).toBe(1);
  });
});
