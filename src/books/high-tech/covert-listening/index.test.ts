/**
 * The supplement's covert listening (HT:EE pp. 44-45) as the system meets it:
 * on High-Tech's own gear (the bug detector's sweep, the contact mike, the
 * laser mike, the white noise generator), and on the supplement's records,
 * which #480 has yet to capture -- so they are fixtures shaped as its capture
 * writes them: an equipment item by the printed name, with its TL, and a bug's
 * frequency hopping as High-Tech's ECCM radio option in the sensor data.
 * High-Tech's switches alone (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../../shared/module.js";
import type * as Covert from "./index.js";

let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let successes: any[];
let contests: any[];
let chat: any[];
let on: Set<string>;
let dialogAnswer: any;
let targets: any[];
let selected: any[];
let successResult: any;

const key = (k: string) => `${MODULE_ID}.${k}`;
const lines = (list: any[]) => list.map((m) => m.value);

function fakeApi() {
  return {
    registry: { isRuleOn: (k: string) => on.has(k) },
    data: { registerPriceModifier: () => {} },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, k: string) => actor?.attributes?.[k] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
    },
    roll: {
      success: async (o: any) => { successes.push(o); return successResult; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: "first", marginOfVictory: 2 }; },
    },
  };
}

let n = 0;
/** A record as the catalogue writes it: equipment, the printed name, its TL, High-Tech's book flag. */
function gear(name: string, tl = "7", extensions: Record<string, any> = {}): any {
  n += 1;
  return {
    id: `item${n}`,
    name,
    type: "equipment",
    system: { tl, carried: true, equipped: false, equipmentQuality: "basic", forSkills: [], extensions: { [MODULE_ID]: extensions } },
    flags: { [MODULE_ID]: { book: "high-tech" } },
  };
}

function character(name: string, items: any[] = [], more: Record<string, any> = {}): any {
  return { name, uuid: `Actor.${name}`, items, attributes: { IQ: 12, DX: 11, Per: 12 }, skills: {}, ...more };
}

let covert: typeof Covert;

async function load(): Promise<void> {
  vi.resetModules();
  const tables = await import("../../../shared/book-tables.js");
  tables.setRuleReader((k) => on.has(k));
  // High-Tech's comms table, whose ECCM option marks a spread-spectrum bug.
  const data = await import("../../../shared/sensors/data.js");
  const sensors = await import("../sensors/index.js");
  data.SENSOR_TABLES.register(sensors.highTechSensors({ radios: key("radios"), activeSensors: key("activeSensors"), visualSensors: key("visualSensors"), passiveSensors: key("passiveSensors") } as never));
  const surveillance = await import("../surveillance/index.js");
  covert = await import("./index.js");
  surveillance.initSurveillance({ jamming: key("jamming"), jammerKinds: key("jammerKinds"), radarJamming: key("radarJamming") });
  const api = fakeApi();
  surveillance.readySurveillance(api as never, {
    screening: () => on.has(key("securityScreening")),
    surveillance: () => on.has(key("surveillanceGear")),
    jamming: () => on.has(key("jamming")),
    jammerKinds: () => on.has(key("jammerKinds")),
    radarJamming: () => on.has(key("radarJamming")),
    covert: () => on.has(key("covertListening")),
  });
  covert.readyCovertListening(api as never, () => on.has(key("covertListening")));
}

beforeEach(async () => {
  actions = new Map();
  sections = new Map();
  tools = new Map();
  successes = [];
  contests = [];
  chat = [];
  on = new Set();
  dialogAnswer = null;
  targets = [];
  selected = [];
  successResult = { success: true, margin: 2, criticalFailure: false };
  vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` }, user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); }, isGM: true } });
  vi.stubGlobal("Hooks", { on: () => 1 });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { create: async (m: any) => chat.push(m), getSpeaker: () => ({}), getWhisperRecipients: () => ["gm"] } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("canvas", { tokens: { placeables: [], get controlled() { return selected.map((actor) => ({ actor })); } }, grid: { measurePath: () => ({ distance: 0 }) } });
  await load();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the switch (D1: High-Tech's alone)", () => {
  it("shows its buttons, sheet lines and GM tool only when on", () => {
    const laser = gear("Laser Mike");
    const junction = gear("Nonlinear Junction Detector");
    expect(actions.get("ht-laser-listen").visible(laser)).toBe(false);
    expect(actions.get("ht-junction-sweep").visible(junction)).toBe(false);
    expect(sections.get("ht-covert-item").visible(gear("Bug Detector"))).toBe(false);
    expect(tools.get("ht-covert-listening").visible()).toBe(false);
    on.add(key("covertListening"));
    expect(actions.get("ht-laser-listen").visible(laser)).toBe(true);
    expect(actions.get("ht-junction-sweep").visible(junction)).toBe(true);
    expect(actions.get("ht-lock-in").visible(gear("Lock-In Amplifier (TL8)", "8"))).toBe(true);
    expect(actions.get("ht-keylogger-wire").visible(gear("Keylogger", "8"))).toBe(true);
    expect(sections.get("ht-covert-item").visible(gear("Bug Detector"))).toBe(true);
    expect(tools.get("ht-covert-listening").visible()).toBe(true);
  });

  it("puts figures on the sheets of High-Tech's gear and the supplement's records", () => {
    on.add(key("covertListening"));
    const context = (item: any) => sections.get("ht-covert-item").context(item).lines.join(" | ");
    expect(context(gear("Bug Detector"))).toContain('"spread":-5');
    expect(context(gear("White Noise Generator (TL8)", "8"))).toContain("WhiteNoiseNearby");
    expect(context(gear("Isolator"))).toContain('"sm":-10');
    expect(context(gear("Lock-In Amplifier (TL8)", "8"))).toContain('"bonus":10');
    expect(context(gear("Resonant Cavity Microphone"))).toContain('"sm":-5');
    expect(context(gear("Shielded Wallet", "8"))).toContain("Wallet");
    expect(context(gear("Audio Bug (TL7)", "7", { sensor: { eccm: true } }))).toContain("SpreadBug");
    expect(context(gear("Audio Bug (TL7)"))).not.toContain("SpreadBug");
    expect(sections.get("ht-covert-item").visible(gear("Crowbar"))).toBe(false);
  });
});

describe("High-Tech's bug sweep and contact mike, with the supplement's lines", () => {
  it("sweeps at -5 for spread spectrum, only under the switch; an isolator guards only against the junction detector", async () => {
    on.add(key("surveillanceGear"));
    const detector = gear("Bug Detector");
    const sweeper = character("Sweeper", [detector], { skills: { "Electronics Operation (Surveillance)": 13 } });
    dialogAnswer = { hider: 12, kind: "normal", area: 200, spread: true, isolator: true };
    await actions.get("ht-bug-sweep").run(detector, sweeper);
    expect(lines(contests[0].first.modifiers)).toEqual([]);
    on.add(key("covertListening"));
    await actions.get("ht-bug-sweep").run(detector, sweeper);
    expect(lines(contests[1].first.modifiers)).toEqual([-5]);
  });

  it("ticks the boxes where the targeted hider carries a hopping bug and an isolator", async () => {
    const shared = await import("../../../shared/sensors/index.js");
    expect(shared.picked().target).toBeNull();
    const rules = await import("./rules.js");
    const hider = character("Hider", [gear("Audio Bug (TL8)", "8", { sensor: { eccm: true } }), gear("Isolator")]);
    expect(rules.guardsOf(hider)).toEqual({ spreadSpectrum: true, isolator: true });
    expect(rules.guardsOf(character("Plain", [gear("Audio Bug (TL8)", "8")]))).toEqual({ spreadSpectrum: false, isolator: false });
  });

  it("gives the contact mike -4 under white noise, and the supplement's contact microphone the same button", async () => {
    on.add(key("surveillanceGear"));
    const mike = gear("Contact Microphone");
    expect(actions.get("ht-contact-mike").visible(mike)).toBe(true);
    const listener = character("Listener", [mike]);
    dialogAnswer = { dr: 5, hp: 10, shielded: false, whiteNoise: true };
    await actions.get("ht-contact-mike").run(mike, listener);
    expect(lines(successes[0].modifiers)).toEqual([-3]);
    on.add(key("covertListening"));
    await actions.get("ht-contact-mike").run(mike, listener);
    expect(lines(successes[1].modifiers)).toEqual([-3, -4]);
  });
});

describe("the row buttons", () => {
  beforeEach(() => on.add(key("covertListening")));

  it("listens with a TL7 laser mike through curtains, noise and white noise", async () => {
    const laser = gear("Laser Mike");
    dialogAnswer = { yards: 200, curtains: true, noise: 3, whiteNoise: true };
    await actions.get("ht-laser-listen").run(laser, character("Spy"));
    expect(successes[0].skill).toBe("Electronics Operation (Surveillance)");
    expect(lines(successes[0].modifiers)).toEqual([-2, -3, -4]);
  });

  it("filters noise at TL8, and won't reach past its range", async () => {
    const laser = gear("Laser Mike", "8");
    dialogAnswer = { yards: 800, curtains: false, noise: 4, whiteNoise: false };
    await actions.get("ht-laser-listen").run(laser, character("Spy"));
    expect(lines(successes[0].modifiers)).toEqual([]);
    dialogAnswer = { yards: 901, curtains: false, noise: 0, whiteNoise: false };
    await actions.get("ht-laser-listen").run(laser, character("Spy"));
    expect(successes).toHaveLength(1);
    expect(chat.at(-1).content).toContain('"range":900');
  });

  it("traces a planted signal at +6 (+10 digital), a minute per 100 square feet", async () => {
    dialogAnswer = { area: 250 };
    await actions.get("ht-lock-in").run(gear("Lock-In Amplifier (TL7)"), character("Tech"));
    expect(successes[0].skill).toBe("Electronics Operation (Security)");
    expect(lines(successes[0].modifiers)).toEqual([6]);
    expect(chat.at(-1).content).toContain('"minutes":3');
  });

  it("sweeps with the junction detector: an isolator's -2, and a false positive on a failure by 4", async () => {
    const detector = gear("Nonlinear Junction Detector");
    dialogAnswer = { area: 100, isolator: true };
    successResult = { success: false, margin: -4, criticalFailure: false };
    await actions.get("ht-junction-sweep").run(detector, character("Tech"));
    expect(lines(successes[0].modifiers)).toEqual([-2]);
    expect(chat.at(-1).content).toContain("Junction.falsePositive");
    successResult = { success: false, margin: -2, criticalFailure: false };
    await actions.get("ht-junction-sweep").run(detector, character("Tech"));
    expect(chat.at(-1).content).toContain("Junction.missed");
  });

  it("wires a keylogger on Electronics Repair (Surveillance)", async () => {
    await actions.get("ht-keylogger-wire").run(gear("Keylogger", "8"), character("Tech"));
    expect(successes[0].skill).toBe("Electronics Repair (Surveillance)");
  });
});

describe("the GM tool", () => {
  beforeEach(() => on.add(key("covertListening")));
  const job = (task: string, more: Record<string, unknown> = {}) => ({ task, yards: 0, typing: 12, manual: false, shielded: false, ...more });

  it("reads emissions at -1 per 100 yards past 300", async () => {
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("emissionsRead", { yards: 550 }) as never);
    expect(successes[0].skill).toBe("Electronics Operation (EW)");
    expect(lines(successes[0].modifiers)).toEqual([-3]);
  });

  it("times the keylogging sample, then rolls the analysis on Electronics Operation (Surveillance)", async () => {
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("acousticKeylog", { typing: 10 }) as never);
    expect(chat.at(-1).content).toContain('"minutes":4');
    expect(successes).toHaveLength(1);
    expect(successes[0].skill).toBe("Electronics Operation (Surveillance)");
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("acousticKeylog", { typing: 0 }) as never);
    expect(successes).toHaveLength(1);
    expect(chat.at(-1).content).toContain("NoTyping");
  });

  it("captures an RFID chip at -2 and -1 per yard, and not at all through a shielded wallet", async () => {
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("rfidCapture", { yards: 3 }) as never);
    expect(lines(successes[0].modifiers)).toEqual([-2, -3]);
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("rfidCapture", { shielded: true }) as never);
    expect(successes).toHaveLength(1);
    expect(chat.at(-1).content).toContain("WalletBlocks");
  });

  it("makes a booster bag on Scrounging (Per-4 by default) and improvises white noise at -2", async () => {
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("boosterBag") as never);
    expect(successes[0]).toMatchObject({ skill: "Scrounging", base: 8 });
    await covert.runCovertJob(fakeApi() as never, character("Spy"), job("improvisedWhiteNoise") as never);
    expect(successes[1].skill).toBe("Electronics Operation (Media)");
    expect(lines(successes[1].modifiers)).toEqual([-2]);
  });

  it("asks for the selected character", async () => {
    await tools.get("ht-covert-listening").open();
    expect((globalThis as any).ui.notifications.warn).toHaveBeenCalled();
    selected = [character("Spy")];
    dialogAnswer = job("emissionsBuild");
    await tools.get("ht-covert-listening").open();
    expect(successes[0].skill).toBe("Electronics Operation (EW)");
  });
});
