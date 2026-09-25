/**
 * The supplement's audio gear as the system meets it (HT:EE pp. 30-32): the
 * trait effects, the roll modifiers, the Mitigator, the price modifiers, the
 * object figures, the item sheet and the row actions -- with only
 * High-Tech's switches on (decisions D1, E1).
 *
 * The records are shaped as the catalogue will write the supplement's audio
 * gear (#479): named as printed, "(TLn)" where a name repeats at several TLs,
 * the book flag "high-tech", the GM's figures under the `device` data. Beside
 * them, High-Tech's own Headphones, Tactical Headset and Hearing Aid.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { LISTENING_FLAG, qualityOf, readyAudio } from "./index.js";

type Listener = (...args: any[]) => void;

let hooks: Map<string, Listener[]>;
let actions: Map<string, any>;
let sections: Map<string, any>;
let prices: Map<string, any>;
let successes: any[];
let chat: string[];
let on: { fidelity: boolean; amplification: boolean };
let successResult: any;
let dialogAnswer: any;
let targets: any[];

function fakeApi() {
  return {
    rules,
    data: {
      hooks: { objectStats: "gworld.objectStats" },
      registerPriceModifier: (m: any) => prices.set(m.key, m),
    },
    combat: {
      hooks: { successRollModifiers: "gworld.successRollModifiers" },
      setCombatState: vi.fn(),
    },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
    },
    actors: {
      derived: (actor: any) => actor?.derived ?? null,
      attribute: (actor: any, key: string) => actor?.attributes?.[key] ?? null,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    },
    roll: { success: async (o: any) => { successes.push(o); return successResult; } },
  };
}

function fire(hook: string, context: any): any {
  for (const listener of hooks.get(hook) ?? []) listener(context);
  return context;
}

/** A record as the catalogue writes it. */
function record(name: string, system: Record<string, any> = {}, device: Record<string, any> = {}, flags: Record<string, any> = {}): any {
  const item: any = {
    id: name,
    name,
    type: "equipment",
    isOwner: true,
    flags: { [MODULE_ID]: { book: "high-tech", ...flags } },
    system: { tl: "7", equipmentQuality: "basic", cost: 100, weight: 1, carried: true, equipped: true, ...system, extensions: { [MODULE_ID]: { device } } },
  };
  return item;
}

function person(items: any[] = [], more: Record<string, any> = {}): any {
  const actor: any = {
    name: "Listener",
    items,
    attributes: { IQ: 12, Per: 12 },
    skills: {},
    derived: { per: 12, senses: [{ sense: "hearing", score: 12 }] },
    getActiveTokens: () => [{ center: { x: more.x ?? 0 } }],
    ...more,
  };
  for (const item of items) item.actor = actor;
  return actor;
}

const trait = (name: string) => ({ id: name, name, type: "trait", system: {} });
const price = (key: string, item: any) => prices.get(key)!.apply(item, { cost: Number(item.system.cost), weight: Number(item.system.weight) });
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks = new Map();
  actions = new Map();
  sections = new Map();
  prices = new Map();
  successes = [];
  chat = [];
  on = { fidelity: false, amplification: false };
  successResult = { success: true };
  dialogAnswer = null;
  targets = [];
  vi.stubGlobal("Hooks", { on: (name: string, fn: Listener) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    get user() { return { targets: new Set(targets.map((actor) => ({ actor }))) }; },
  });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("canvas", { grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(a.x - b.x) }) }, tokens: { controlled: [] } });
  readyAudio(fakeApi() as never, { fidelity: () => on.fidelity, amplification: () => on.amplification });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function traitEffects(actor: any): { effects: any; sources: any[] } {
  return fire("gworld.traitEffects", { actor, effects: { hardOfHearing: false, protectedSense: {} }, sources: [] });
}

function rollLines(actor: any, context: Record<string, any>): any[] {
  return fire("gworld.successRollModifiers", { actor, modifiers: [], tags: [], ...context }).modifiers;
}

describe("headphones, earbuds and the tactical headset (HT:EE p. 31)", () => {
  it("leave the wearer of headphones that are playing Hard of Hearing, and say what did it", () => {
    const phones = record("Headphones", { tl: "6" }, {}, { [LISTENING_FLAG]: "loud" });
    const actor = person([phones]);
    expect(traitEffects(actor).effects.hardOfHearing).toBe(false);
    on.fidelity = true;
    const { effects, sources } = traitEffects(actor);
    expect(effects.hardOfHearing).toBe(true);
    expect(sources).toEqual([{ effect: "hardOfHearing", label: expect.stringContaining("Headphones") }]);
  });

  it("do nothing while silent or not worn", () => {
    on.fidelity = true;
    expect(traitEffects(person([record("Headphones")])).effects.hardOfHearing).toBe(false);
    expect(traitEffects(person([record("Stereo Headphones", { equipped: false }, {}, { [LISTENING_FLAG]: "loud" })])).effects.hardOfHearing).toBe(false);
  });

  it("cost -2 turned down, and earbuds half the penalty, on the wearer's other Hearing rolls", () => {
    on.fidelity = true;
    const low = person([record("Wireless Headphones", { tl: "8" }, {}, { [LISTENING_FLAG]: "low" })]);
    expect(traitEffects(low).effects.hardOfHearing).toBe(false);
    expect(rollLines(low, { tags: ["hearing", "detection"] }).map((l) => l.value)).toEqual([-2]);
    const buds = person([record("Earbuds", {}, {}, { [LISTENING_FLAG]: "loud" })]);
    expect(rollLines(buds, { tags: ["hearing"] }).map((l) => l.value)).toEqual([-2]);
    expect(rollLines(buds, { tags: ["vision"] })).toEqual([]);
    // Not on what they are listening to.
    expect(rollLines(buds, { tags: ["hearing", "audioChain"] })).toEqual([]);
  });

  it("gives the tactical headset's wearer Protected Hearing", () => {
    on.fidelity = true;
    const { effects, sources } = traitEffects(person([record("Tactical Headset", { tl: "8" })]));
    expect(effects.protectedSense.hearing).toBe(true);
    expect(sources[0]).toEqual({ effect: "protectedSense.hearing", label: "Tactical Headset" });
  });
});

describe("microphones (HT:EE p. 31)", () => {
  it("give +1 to Electronics Operation (Media) in use, but not a carbon one", () => {
    const actor = person([record("Microphone (TL8)", { tl: "8" })]);
    expect(rollLines(actor, { skill: "Electronics Operation (Media)" })).toEqual([]);
    on.fidelity = true;
    expect(rollLines(actor, { skill: "Electronics Operation (Media)" }).map((l) => l.value)).toEqual([1]);
    expect(rollLines(actor, { skill: "Electronics Operation (Comm)" })).toEqual([]);
    const carbon = person([record("Microphone", { tl: "6" }, { carbonMicrophone: true })]);
    expect(rollLines(carbon, { skill: "Electronics Operation (Media)" })).toEqual([]);
  });

  it("price the cheaper microphone at a fifth", () => {
    const mic = record("Microphone", { tl: "6", cost: 100, weight: 3 }, { inexpensive: true });
    expect(price("ht-inexpensive-microphone", mic)).toBeNull();
    on.fidelity = true;
    expect(price("ht-inexpensive-microphone", mic)).toMatchObject({ cost: 20, weight: 3 });
    expect(price("ht-inexpensive-microphone", record("Shotgun Microphone (TL7)", {}, { inexpensive: true }))).toBeNull();
  });

  it("make a carbon microphone HT 12 as an object", () => {
    on.fidelity = true;
    const context = fire("gworld.objectStats", { item: record("Microphone", { tl: "6" }, { carbonMicrophone: true }), hp: 3, ht: 10, dr: 2, notes: [] });
    expect(context.ht).toBe(12);
    expect(fire("gworld.objectStats", { item: record("Microphone"), hp: 3, ht: 10, dr: 2, notes: [] }).ht).toBe(10);
  });

  it("read each link's quality: the grade, a carbon microphone, the GM's figure", () => {
    const api = fakeApi() as never;
    expect(qualityOf(api, record("Headphones", { equipmentQuality: "fine" }))).toBe(2);
    expect(qualityOf(api, record("Microphone", { equipmentQuality: "fine" }, { carbonMicrophone: true }))).toBe(-5);
    expect(qualityOf(api, record("Public Address System", { tl: "6" }, { soundQuality: -2 }))).toBe(-2);
    expect(qualityOf(api, record("Guitar Amplifier (TL6)", { tl: "6" }))).toBe(-2);
  });
});

describe("loudspeakers (HT:EE p. 31)", () => {
  it("weigh twice as much for each step of quality", () => {
    on.fidelity = true;
    expect(price("ht-loudspeaker-quality", record("Loudspeaker", { tl: "6", cost: 20, weight: 3 }))).toBeNull();
    expect(price("ht-loudspeaker-quality", record("Loudspeaker", { tl: "6", cost: 20, weight: 3, equipmentQuality: "fine" }))).toMatchObject({ cost: 20, weight: 12 });
  });
});

describe("listening through a chain of gear (HT:EE pp. 30-31)", () => {
  it("rolls Hearing at the weakest link's quality, with the distance to the sound", async () => {
    on.fidelity = true;
    const mic = record("Microphone", { tl: "6", equipmentQuality: "fine" }, { carbonMicrophone: true });
    const phones = record("Stereo Headphones", { equipmentQuality: "good" });
    const actor = person([mic, phones]);
    dialogAnswer = { links: ["Microphone", "Stereo Headphones"], other: null, task: "hearing", pitch: "none", yards: 8, baseYards: 1 };
    await actions.get("ht-audio-listen").run(phones, actor);
    await flush();
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ base: 12, skill: "Hearing", distance: { yards: 8, baseYards: 1 }, tags: ["hearing", "audioChain"] });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-5]);
  });

  it("aims a parabolic microphone first, and gives its bonus for speech", async () => {
    on.fidelity = true;
    const dish = record("Parabolic Microphone (TL6)", { tl: "6" });
    const actor = person([dish], { skills: { "Electronics Operation (Media)": 13 } });
    dialogAnswer = { links: ["Parabolic Microphone (TL6)"], other: null, task: "hearing", pitch: "speech", yards: 0, baseYards: 1 };
    await actions.get("ht-audio-listen").run(dish, actor);
    await flush();
    expect(successes.map((s) => s.skill)).toEqual(["Electronics Operation (Media)", "Hearing"]);
    expect(successes[0].modifiers).toEqual([]);
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([1]);
  });

  it("gives a shotgun microphone +3 to aim, and stops where the aim fails", async () => {
    on.fidelity = true;
    successResult = { success: false };
    const gun = record("Shotgun Microphone (TL7)");
    const actor = person([gun]);
    dialogAnswer = { links: ["Shotgun Microphone (TL7)"], other: null, task: "hearing", pitch: "high", yards: 0, baseYards: 1 };
    await actions.get("ht-audio-listen").run(gun, actor);
    await flush();
    expect(successes).toHaveLength(1);
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([3]);
    expect(chat.join()).toContain("AimMissed");
  });

  it("takes another link's quality, and the headphones' own Hard of Hearing off what they play", async () => {
    on.fidelity = true;
    const phones = record("Headphones", {}, {}, { [LISTENING_FLAG]: "loud" });
    const actor = person([phones], { derived: { per: 12, senses: [{ sense: "hearing", score: 8 }] } });
    dialogAnswer = { links: ["Headphones"], other: -2, task: "music", pitch: "none", yards: 0, baseYards: 0 };
    await actions.get("ht-audio-listen").run(phones, actor);
    await flush();
    expect(successes[0]).toMatchObject({ skill: "Connoisseur (Music)", base: 7 });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2]);
    dialogAnswer = { ...dialogAnswer, task: "hearing" };
    await actions.get("ht-audio-listen").run(phones, actor);
    await flush();
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([-2, 4]);
  });

  it("is offered on audio gear only, under its switch", () => {
    const listen = actions.get("ht-audio-listen");
    expect(listen.visible(record("Headphones"))).toBe(false);
    on.fidelity = true;
    expect(listen.visible(record("Headphones"))).toBe(true);
    expect(listen.visible(record("Bullhorn"))).toBe(false);
    expect(listen.visible(record("Hearing Aid"))).toBe(false);
    expect(listen.visible(record("Radio"))).toBe(false);
  });
});

describe("the supplement's hydrophone (HT:EE p. 31)", () => {
  it("rolls Electronics Operation (Sonar) through High-Tech's hydrophone roll, and fixes nothing", async () => {
    const phone = record("Hydrophone", { tl: "7" });
    const actor = person([phone]);
    const action = actions.get("ht-audio-hydrophone");
    expect(action.visible(phone)).toBe(false);
    on.fidelity = true;
    expect(action.visible(phone)).toBe(true);
    expect(action.visible(record("Small Hydrophone"))).toBe(false);
    dialogAnswer = { sm: 5, speed: 0, range: 0, current: 0 };
    await action.run(phone, actor);
    await flush();
    expect(successes[0]).toMatchObject({ skill: "Electronics Operation (Sonar)", tags: ["detection", "hydrophone"] });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([2, 5]);
    expect(chat).toEqual([]);
  });
});

describe("amplifiers (HT:EE p. 32)", () => {
  it("have each targeted listener roll Hearing at his distance against the base range in his arc", async () => {
    on.amplification = true;
    const horn = record("Bullhorn");
    const speaker = person([horn], { x: 0 });
    const near = person([], { name: "Near", x: 10 });
    const deaf = person([], { name: "Deaf", x: 5, derived: { per: 10, senses: [{ sense: "hearing", score: null }] } });
    targets = [near, deaf];
    dialogAnswer = { arc: "side", task: "understand", yards: 0 };
    await actions.get("ht-audio-address").run(horn, speaker);
    await flush();
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ actor: near, base: 12, skill: "Hearing", distance: { yards: 10, baseYards: 8 } });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-2]);
    expect(chat.join()).toContain("Deaf");
  });

  it("gives the modifier at a distance the GM enters, and nothing outside a cone", async () => {
    on.amplification = true;
    const lrad = record("Acoustic Hailing Device", { tl: "8" });
    const actor = person([lrad]);
    dialogAnswer = { arc: "front", task: "hear", yards: 1024 };
    await actions.get("ht-audio-address").run(lrad, actor);
    dialogAnswer = { arc: "outside", task: "hear", yards: 10 };
    await actions.get("ht-audio-address").run(lrad, actor);
    await flush();
    expect(successes).toEqual([]);
    expect(chat[0]).toContain('"value":"-2"');
    expect(chat[1]).toContain("OutsideCone");
  });

  it("gives +1 to Intimidation of a subject close in front", () => {
    on.amplification = true;
    const actor = person([record("Bullhorn")], { x: 0 });
    expect(rollLines(actor, { skill: "Intimidation", subject: person([], { x: 2 }) }).map((l) => l.value)).toEqual([1]);
    expect(rollLines(actor, { skill: "Intimidation", subject: person([], { x: 3 }) })).toEqual([]);
    expect(rollLines(person([record("Bullhorn", { equipped: false })]), { skill: "Intimidation", subject: person([], { x: 1 }) })).toEqual([]);
  });

  it("reads each listener's arc from the speaker's facing on the map: the bullhorn's side and rear, the hailing device's cone", async () => {
    on.amplification = true;
    // The speaker's token faces down the map (Foundry's rotation 0).
    const at = (x: number, y: number, rotation = 0) => ({ getActiveTokens: () => [{ center: { x, y }, document: { rotation } }] });
    const horn = record("Bullhorn");
    const speaker = person([horn], at(0, 0));
    const ahead = person([], { name: "Ahead", ...at(0, 10) });
    const beside = person([], { name: "Beside", ...at(10, -5) });
    const behind = person([], { name: "Behind", ...at(0, -10) });
    targets = [ahead, beside, behind];
    // The dialog's arc is for listeners off the map: the facing overrides it here.
    dialogAnswer = { arc: "front", task: "hear", yards: 0 };
    await actions.get("ht-audio-address").run(horn, speaker);
    await flush();
    expect(successes.map((r) => r.distance.baseYards)).toEqual([16, 8, 4]);
    // The hailing device's 60-degree cone: 45 degrees off is outside it.
    successes = [];
    const lrad = record("Acoustic Hailing Device", { tl: "8" });
    targets = [person([], { name: "Aside", ...at(10, 10) }), person([], { name: "Aimed", ...at(1, 20) })];
    await actions.get("ht-audio-address").run(lrad, person([lrad], at(0, 0)));
    await flush();
    expect(successes).toHaveLength(1);
    expect(successes[0].actor.name).toBe("Aimed");
    expect(chat.join()).toContain('OutsideConeOf {"name":"Aside"}');
  });

  it("gives the bullhorn's +1 to Intimidation out to 2 yards in front but only 1 to the side, by the facing", () => {
    on.amplification = true;
    const at = (x: number, y: number) => ({ getActiveTokens: () => [{ center: { x, y }, document: { rotation: 0 } }] });
    const actor = person([record("Bullhorn")], at(0, 0));
    // Measured along the map's x here: 2 yards in front, then 2 and 1 yards to the side.
    expect(rollLines(actor, { skill: "Intimidation", subject: person([], at(2, 4)) }).map((l) => l.value)).toEqual([1]);
    expect(rollLines(actor, { skill: "Intimidation", subject: person([], at(2, -1)) })).toEqual([]);
    expect(rollLines(actor, { skill: "Intimidation", subject: person([], at(1, -0.5)) }).map((l) => l.value)).toEqual([1]);
  });

  it("plays through the TL6 guitar amplifier: set up on Electronics Operation (Media), -2 with distortion; later ones free", async () => {
    on.amplification = true;
    const amp = record("Guitar Amplifier (TL6)", { tl: "6" });
    const player = person([amp, { id: "mi", name: "Musical Instrument (Guitar)", type: "skill", system: {} }], { skills: { "Musical Instrument (Guitar)": 13, "Electronics Operation (Media)": 11 } });
    dialogAnswer = { skill: "Musical Instrument (Guitar)", distortion: true, setUp: true };
    await actions.get("ht-audio-play").run(amp, player);
    await flush();
    expect(successes[0]).toMatchObject({ base: 11, skill: "Electronics Operation (Media)", tags: ["audioSetUp"] });
    expect(successes[1]).toMatchObject({ base: 13, skill: "Musical Instrument (Guitar)" });
    expect(successes[1].modifiers.map((m: any) => m.value)).toEqual([-2]);
    // Set up wrong: no playing.
    successes = [];
    successResult = { success: false };
    await actions.get("ht-audio-play").run(amp, player);
    await flush();
    expect(successes).toHaveLength(1);
    expect(chat.at(-1)).toContain("NotSetUp");
    // The TL7 amplifier: no set-up roll, no penalty.
    successes = [];
    successResult = { success: true };
    const later = record("Guitar Amplifier (TL7)");
    dialogAnswer = { skill: "Musical Instrument (Guitar)", distortion: true, setUp: false };
    await actions.get("ht-audio-play").run(later, person([later, { id: "mi", name: "Musical Instrument (Guitar)", type: "skill", system: {} }], { skills: { "Musical Instrument (Guitar)": 13 } }));
    await flush();
    expect(successes).toHaveLength(1);
    expect(successes[0].modifiers).toEqual([]);
    expect(actions.get("ht-audio-play").visible(record("Bullhorn"))).toBe(false);
  });

  it("price a public address system's extra speakers", () => {
    const pa = record("Public Address System", { tl: "6", cost: 150, weight: 15 }, { extraSpeakers: 2 });
    expect(price("ht-pa-speakers", pa)).toBeNull();
    on.amplification = true;
    expect(price("ht-pa-speakers", pa)).toMatchObject({ cost: 190, weight: 21 });
  });

  it("show their ranges on the item sheet", () => {
    const section = sections.get("ht-audio-item");
    expect(section.visible(record("Bullhorn"))).toBe(false);
    on.amplification = true;
    const context = section.context(record("Bullhorn"));
    expect(context.lines[0]).toContain('"front":16');
    expect(context.quality).toBeNull();
    expect(section.context(record("Public Address System", { tl: "6" })).speakers).toEqual({ value: 0 });
  });
});

describe("recording and playback (HT:EE p. 33)", () => {
  it("holds a narrow cassette to basic quality, and keeps the weakest link a recording was made through", async () => {
    on.fidelity = true;
    const api: any = fakeApi();
    const deck = record("Cassette Recorder", { equipmentQuality: "fine" });
    expect(qualityOf(api, deck)).toBe(0);
    expect(qualityOf(api, record("Reel-to-Reel Tape Recorder", { equipmentQuality: "fine" }))).toBe(2);
    expect(sections.get("ht-audio-item").context(deck).lines.join(" ")).toContain("CassetteLine");
    // Recorded through a carbon microphone: the recording keeps its -5.
    const mike = record("Microphone", { tl: "6" }, { carbonMicrophone: true });
    const flags = deck.flags[MODULE_ID];
    deck.setFlag = async (scope: string, k: string, v: unknown) => { if (scope === MODULE_ID) flags[k] = v; };
    const actor = person([deck, mike]);
    dialogAnswer = { links: ["Microphone"], other: null };
    await actions.get("ht-audio-record").run(deck, actor);
    await flush();
    expect(flags.htRecording).toEqual({ quality: -5, from: "Microphone" });
    expect(qualityOf(api, deck)).toBe(-5);
    expect(chat.at(-1)).toContain('"value":"-5"');
    expect(sections.get("ht-audio-item").context(deck).lines.join(" ")).toContain("RecordingLine");
    // A player plays back; only a recorder records.
    expect(actions.get("ht-audio-record").visible(record("CD Player", { tl: "8" }))).toBe(false);
    expect(actions.get("ht-audio-listen").visible(record("CD Player", { tl: "8" }))).toBe(true);
    on.fidelity = false;
    expect(actions.get("ht-audio-record").visible(deck)).toBe(false);
  });
});

describe("the hearing aid (HT:EE p. 32)", () => {
  const traits = (actor: any) => fire("gworld.traitsInPlay", { actor, traits: [{ name: "Hard of Hearing", inPlay: true }, { name: "Bad Sight (Nearsighted)", inPlay: true }] }).traits;

  it("takes Hard of Hearing out of play while worn, and nothing else", () => {
    const actor = person([record("Hearing Aid (TL6)", { tl: "6" }), record("Eyeglasses"), trait("Hard of Hearing")]);
    expect(traits(actor)[0].inPlay).toBe(true);
    on.amplification = true;
    const now = traits(actor);
    expect(now[0]).toMatchObject({ inPlay: false });
    expect(now[1].inPlay).toBe(true);
    expect(traits(person([record("Hearing Aid", { tl: "8", equipped: false })]))[0].inPlay).toBe(true);
  });

  it("puts an early aid's poor sound on its wearer's Hearing rolls", () => {
    on.amplification = true;
    const actor = person([record("Hearing Aid (TL6)", { tl: "6" }, { soundQuality: -2 })]);
    expect(rollLines(actor, { tags: ["hearing"] }).map((l) => l.value)).toEqual([-2]);
    expect(rollLines(person([record("Hearing Aid (TL7)")]), { tags: ["hearing"] })).toEqual([]);
  });

  it("shows on High-Tech's own record's sheet", () => {
    const section = sections.get("ht-audio-item");
    const aid = record("Hearing Aid", { tl: "8" });
    expect(section.visible(aid)).toBe(false);
    on.amplification = true;
    expect(section.visible(aid)).toBe(true);
    expect(section.context(aid).quality).toEqual({ value: "" });
  });
});
