/**
 * The electronic battlefield (HT:EE pp. 45-46) as the system meets it: the
 * sheet sections, row buttons, GM tool, price and hooks, on the merged
 * records' shapes. High-Tech's switches alone (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { speedRangeModifier } from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import type * as Battlefield from "./index.js";

let actions: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let prices: Map<string, any>;
let hooks: Map<string, Array<(context: any) => void>>;
let successes: any[];
let contests: any[];
let chat: any[];
let on: Set<string>;
let dialogAnswer: any;
let confirmAnswer: boolean;
let targets: any[];
let selected: any[];
let states: Map<any, Record<string, unknown>>;
let distance: number;
let gameActors: any[];

const key = (k: string) => `${MODULE_ID}.${k}`;

function fakeApi() {
  return {
    registry: { isRuleOn: (k: string) => on.has(k) },
    rules: { speedRangeModifier },
    data: {
      hooks: { objectStats: "gworld.objectStats", vehicleStats: "gworld.vehicleStats" },
      registerPriceModifier: (m: any) => prices.set(m.key, m),
    },
    combat: {
      hooks: { attackModifiers: "gworld.attackModifiers", successRollModifiers: "gworld.successRollModifiers" },
      getCombatState: (actor: any, _module: string, k: string) => states.get(actor)?.[k],
      setCombatState: async (actor: any, _module: string, k: string, value: unknown) => { states.set(actor, { ...(states.get(actor) ?? {}), [k]: value }); },
    },
    sheets: {
      registerSheetSection: (s: any) => sections.set(s.key, s),
      registerRowAction: (a: any) => actions.set(a.key, a),
      registerGmTool: (t: any) => tools.set(t.key, t),
    },
    actors: {
      attribute: (actor: any, k: string) => actor?.attributes?.[k] ?? 10,
      skillLevel: (actor: any, name: string) => actor?.skills?.[name] ?? null,
      // The system's reading of the vehicle a character is aboard (API 1.141.0), over the world's vehicles here.
      vehicleAboard: (actor: any) => {
        const vehicle = [...((globalThis as any).game?.actors ?? [])].find((v: any) => v?.type === "vehicle" && (v.system?.crew ?? []).some((seat: any) => seat?.uuid === actor?.uuid));
        return vehicle ? { vehicle, operator: false, moving: (Number(vehicle.system?.speed) || 0) > 0, medium: "ground" } : null;
      },
    },
    roll: {
      success: async (o: any) => { successes.push(o); return { success: true }; },
      quickContest: async (o: any) => { contests.push(o); return { outcome: "first" }; },
    },
  };
}

let n = 0;
/** A record as the catalogue writes it: the printed name, its TL, High-Tech's book flag. */
function gear(name: string, extensions: Record<string, any> = {}, system: Record<string, any> = {}): any {
  n += 1;
  const item: any = {
    id: `item${n}`,
    name,
    type: "equipment",
    system: { tl: "8", quantity: 1, carried: true, equipped: false, equipmentQuality: "basic", forSkills: [], meleeModes: [], rangedModes: [], ...system, extensions: { [MODULE_ID]: extensions } },
    flags: { [MODULE_ID]: { book: "high-tech" } },
    updates: [] as any[],
    update: async (patch: any) => { item.updates.push(patch); if ("system.quantity" in patch) item.system.quantity = patch["system.quantity"]; },
  };
  return item;
}

const PHANTOM = { autopilot: 14, autopilotDodge: 9, remoteBonus: 1, controlRangeMiles: 4, ceilingFeet: 1640, spreadSpectrum: false };
const drone = (data: Record<string, any> = PHANTOM) =>
  gear("Phantom 4 Pro", { drone: data }, { category: "vehicle", vehicle: { skill: "Piloting (Helicopter)", handling: 2, stability: 3 } });

function character(name: string, items: any[] = [], more: Record<string, any> = {}): any {
  const list: any = [...items];
  list.get = (id: string) => list.find((i: any) => i.id === id);
  return { name, uuid: `Actor.${name}`, type: "character", items: list, attributes: { IQ: 12, DX: 11, Per: 12 }, skills: {}, getActiveTokens: () => [{ center: { x: 0, y: 0 }, document: { elevation: 0 } }], ...more };
}

/** A remote operator's control roll (API 1.154.0). */
const REMOTE = ["vehicleControl", "remoteControl"];

const fire = (hook: string, context: any) => { for (const fn of hooks.get(hook) ?? []) fn(context); return context; };

let battlefield: typeof Battlefield;

beforeEach(async () => {
  actions = new Map();
  sections = new Map();
  tools = new Map();
  prices = new Map();
  hooks = new Map();
  successes = [];
  contests = [];
  chat = [];
  on = new Set();
  dialogAnswer = null;
  confirmAnswer = false;
  targets = [];
  selected = [];
  states = new Map();
  distance = 0;
  gameActors = [];
  vi.stubGlobal("game", {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` },
    user: { get targets() { return new Set(targets.map((actor) => ({ actor }))); }, isGM: true },
    get actors() { return gameActors; },
  });
  vi.stubGlobal("Hooks", { on: (h: string, fn: any) => { hooks.set(h, [...(hooks.get(h) ?? []), fn]); return 1; } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => dialogAnswer, confirm: async () => confirmAnswer } } } });
  vi.stubGlobal("ChatMessage", { implementation: { create: async (m: any) => chat.push(m), getSpeaker: () => ({}) } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn() } });
  vi.stubGlobal("canvas", { tokens: { get controlled() { return selected.map((actor) => ({ actor })); } }, grid: { measurePath: () => ({ distance }) } });
  vi.resetModules();
  const tables = await import("../../../shared/book-tables.js");
  tables.setRuleReader((k) => on.has(k));
  const sensors = await import("../sensors/index.js");
  sensors.highTechSensors({ radios: key("radios"), activeSensors: key("activeSensors"), visualSensors: key("visualSensors"), passiveSensors: key("passiveSensors"), spreadSpectrum: key("spreadSpectrum") } as never);
  battlefield = await import("./index.js");
  battlefield.readyBattlefield(fakeApi() as never, { sensors: () => on.has(key("battlefieldSensors")), drones: () => on.has(key("reconDrones")), seekers: () => on.has(key("homingSeekers")) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the switches (D1: High-Tech's alone)", () => {
  it("show nothing while off", () => {
    expect(sections.get("ht-battlefield-item").visible(gear("Seismic Ground Sensor"))).toBe(false);
    expect(sections.get("ht-drone-item").visible(drone())).toBe(false);
    expect(actions.get("ht-camera-watch").visible(gear("Video Surveillance Camera (TL7)"))).toBe(false);
    expect(actions.get("ht-drone-autopilot").visible(drone())).toBe(false);
    expect(tools.get("ht-recon-drone").visible()).toBe(false);
    const stats = fire("gworld.objectStats", { item: gear("Seismic Ground Sensor", { device: { military: true } }), hp: 3, ht: 10, dr: 2, notes: [] });
    expect([stats.ht, stats.dr]).toEqual([10, 2]);
  });

  it("each shows its own parts when on", () => {
    on.add(key("battlefieldSensors"));
    expect(sections.get("ht-battlefield-item").visible(gear("Seismic Ground Sensor"))).toBe(true);
    expect(actions.get("ht-seismic-listen").visible(gear("Seismic Ground Sensor"))).toBe(true);
    expect(actions.get("ht-chaff-dump").visible(gear("Chaff (per package)"))).toBe(true);
    expect(sections.get("ht-drone-item").visible(drone())).toBe(false);
    on.add(key("reconDrones"));
    expect(sections.get("ht-drone-item").visible(drone())).toBe(true);
    expect(actions.get("ht-drone-autopilot").visible(drone())).toBe(true);
    expect(tools.get("ht-recon-drone").visible()).toBe(true);
  });

  it("leaves another book's gear alone", () => {
    on.add(key("battlefieldSensors"));
    const other = gear("Video Surveillance Camera (TL7)");
    other.flags[MODULE_ID].book = "ultra-tech";
    expect(actions.get("ht-camera-watch").visible(other)).toBe(false);
    expect(sections.get("ht-battlefield-item").visible(other)).toBe(false);
  });
});

describe("military gear (HT:EE p. 45)", () => {
  beforeEach(() => on.add(key("battlefieldSensors")));

  it("is HT 12 and DR 8 as an object, keeping the system's HP and what the record states", () => {
    const radio = gear("Medium Radio (TL7)", { device: { military: true } });
    const stats = fire("gworld.objectStats", { item: radio, hp: 7, ht: 10, dr: 2, notes: [] });
    expect([stats.hp, stats.ht, stats.dr]).toEqual([7, 12, 8]);
    expect(stats.notes).toEqual(["GCC.HT.Battlefield.MilitaryNote"]);
    const stated = fire("gworld.objectStats", { item: gear("Tough Box", { device: { military: true, dr: 15 } }), hp: 7, ht: 10, dr: 2, notes: [] });
    expect([stated.ht, stated.dr]).toEqual([12, 15]);
    const civilian = fire("gworld.objectStats", { item: gear("Medium Radio (TL7)"), hp: 7, ht: 10, dr: 2, notes: [] });
    expect([civilian.ht, civilian.dr]).toEqual([10, 2]);
  });

  it("is ticked on the sheet, and says so", async () => {
    const context = sections.get("ht-battlefield-item").context(gear("Seismic Ground Sensor", { device: { military: true, ht: 12, dr: 8 } }));
    expect(context.military).toBe(true);
    expect(context.lines.join(" | ")).toContain('MilitaryLine {"ht":12,"dr":8}');
    expect(context.lines.join(" | ")).toContain("SeismicLine");
  });
});

describe("surveillance in general (HT:EE p. 45)", () => {
  const watcher = () => character("Guard", [], { skills: { Observation: 12, "Electronics Operation (Security)": 14, "Electronics Operation (Surveillance)": 13, "Intelligence Analysis": 11 } });

  it("offers its GM tool with the battlefield sensors switch", () => {
    expect(tools.get("ht-surveillance-watch").visible()).toBe(false);
    on.add(key("battlefieldSensors"));
    expect(tools.get("ht-surveillance-watch").visible()).toBe(true);
  });

  it("spots an intrusion on Observation or an electronic readout's Security, contested by a hiding intruder", async () => {
    on.add(key("battlefieldSensors"));
    selected = [watcher()];
    dialogAnswer = { task: "intrusion", readout: "electronic", hiding: false };
    await tools.get("ht-surveillance-watch").open();
    expect(successes[0]).toMatchObject({ base: 14, skill: "Electronics Operation (Security)", tags: ["surveillance", "detection"] });
    targets = [character("Sneak", [], { skills: { Stealth: 11, Camouflage: 13 } })];
    dialogAnswer = { task: "intrusion", readout: "visual", hiding: true };
    await tools.get("ht-surveillance-watch").open();
    expect(contests[0]).toMatchObject({ first: { base: 12, note: "Observation" }, second: { base: 13, note: "Camouflage" } });
  });

  it("keeps watch on the better of Observation and Surveillance, interprets on Intelligence Analysis, and contests countersurveillance with EW", async () => {
    on.add(key("battlefieldSensors"));
    selected = [watcher()];
    dialogAnswer = { task: "watch", readout: "visual", hiding: false };
    await tools.get("ht-surveillance-watch").open();
    expect(successes[0]).toMatchObject({ base: 13, skill: "Electronics Operation (Surveillance)" });
    dialogAnswer = { task: "interpret", readout: "visual", hiding: false };
    await tools.get("ht-surveillance-watch").open();
    expect(successes[1]).toMatchObject({ base: 11, skill: "Intelligence Analysis", tags: ["surveillance"] });
    // Countersurveillance: the selected operator's EW (IQ-5 by default) against the targeted observer's best.
    selected = [character("Spook", [], { attributes: { IQ: 14 } })];
    dialogAnswer = { task: "counter", readout: "visual", hiding: false };
    await tools.get("ht-surveillance-watch").open();
    expect(ui.notifications!.warn).toHaveBeenCalledWith("GCC.HT.Battlefield.ObserverPick");
    targets = [watcher()];
    await tools.get("ht-surveillance-watch").open();
    expect(contests[0]).toMatchObject({ first: { base: 9, note: "Electronics Operation (EW)" }, second: { base: 14, note: "Electronics Operation (Security)" }, tags: ["surveillance", "countersurveillance"] });
  });
});

describe("surveillance cameras (HT:EE p. 45)", () => {
  beforeEach(() => on.add(key("battlefieldSensors")));

  it("watches at -4 through the TL7 camera, as a Quick Contest with a hiding target", async () => {
    const camera = gear("Video Surveillance Camera (TL7)", {}, { tl: "7" });
    const guard = character("Guard", [camera], { skills: { Observation: 13 } });
    await actions.get("ht-camera-watch").run(camera, guard);
    expect(successes[0]).toMatchObject({ base: 13, skill: "Observation" });
    expect(successes[0].modifiers.map((m: any) => m.value)).toEqual([-4]);
    targets = [character("Intruder", [], { skills: { Stealth: 12, Camouflage: 14 } })];
    await actions.get("ht-camera-watch").run(camera, guard);
    expect(contests[0].first.modifiers.map((m: any) => m.value)).toEqual([-4]);
    expect(contests[0].second).toMatchObject({ base: 14, note: "Camouflage" });
  });

  it("with pan/tilt/zoom: -2 at TL7, none at TL8, $300 more, and an intruder's Vision roll spots it", async () => {
    const tl7 = gear("Video Surveillance Camera (TL7)", { device: { panTiltZoom: true } }, { tl: "7", cost: 150 });
    const tl8 = gear("Video Surveillance Camera (TL8)", { device: { panTiltZoom: true } }, { cost: 150 });
    // Observation defaults to Per-5.
    const guard = character("Guard", [tl7, tl8]);
    await actions.get("ht-camera-watch").run(tl7, guard);
    await actions.get("ht-camera-watch").run(tl8, guard);
    expect(successes.map((s) => [s.base, s.modifiers.map((m: any) => m.value)])).toEqual([[7, [-2]], [7, []]]);
    expect(chat.map((m) => m.content).join()).toContain("PtzSpotted");
    expect(prices.get("ht-camera-ptz").apply(tl7, { cost: 150, weight: 2 })).toEqual({ cost: 450, weight: 2, label: "GCC.HT.Battlefield.Ptz" });
    expect(prices.get("ht-camera-ptz").apply(gear("Video Surveillance Camera (TL7)"), { cost: 150, weight: 2 })).toBeNull();
    expect(sections.get("ht-battlefield-item").context(tl8).lines.join()).toContain('CameraLine {"modifier":"0"}');
  });
});

describe("the seismic ground sensor (HT:EE p. 45)", () => {
  it("rolls Electronics Operation (Surveillance) with the Size and Speed/Range Table's lines", async () => {
    on.add(key("battlefieldSensors"));
    const sensor = gear("Seismic Ground Sensor", {}, { tl: "7" });
    const scout = character("Scout", [sensor], { skills: { "Electronics Operation (Surveillance)": 12 } });
    dialogAnswer = { sm: 3, speed: 10, range: 200 };
    await actions.get("ht-seismic-listen").run(sensor, scout);
    expect(successes[0]).toMatchObject({ base: 12, skill: "Electronics Operation (Surveillance)" });
    expect(successes[0].modifiers.map((m: any) => [m.label, m.value])).toEqual([
      ["GCC.HT.Battlefield.SeismicMod.size", 3],
      ["GCC.HT.Battlefield.SeismicMod.speed", 4],
      ["GCC.HT.Battlefield.SeismicMod.range", -12],
    ]);
  });
});

describe("chaff (HT:EE p. 45)", () => {
  beforeEach(() => on.add(key("battlefieldSensors")));

  it("dumps packages off the stack, and each is -2 to a radar-locked shot at the craft and to a radar roll on it", async () => {
    const chaff = gear("Chaff (per package)", {}, { tl: "7", quantity: 5 });
    const pilot = character("Pilot", [chaff]);
    dialogAnswer = { packages: 2 };
    await actions.get("ht-chaff-dump").run(chaff, pilot);
    expect(chaff.system.quantity).toBe(3);
    expect(states.get(pilot)?.eeChaff).toEqual({ packages: 2 });

    const radar = gear("Medium Radar", {}, { tl: "7" });
    const gunner = character("Gunner", [radar]);
    states.set(gunner, { utSensorLock: { targetUuid: pilot.uuid, itemId: radar.id } });
    const attack = fire("gworld.attackModifiers", { actor: gunner, mode: { ranged: true }, targets: [pilot], modifiers: [] });
    expect(attack.modifiers.map((m: any) => m.value)).toEqual([-4]);
    // A shot with no radar lock takes nothing.
    const plain = fire("gworld.attackModifiers", { actor: character("Rifleman"), mode: { ranged: true }, targets: [pilot], modifiers: [] });
    expect(plain.modifiers).toEqual([]);
    const sweep = fire("gworld.successRollModifiers", { skill: "Electronics Operation (Sensors)", subject: pilot, tags: [], modifiers: [] });
    expect(sweep.modifiers.map((m: any) => m.value)).toEqual([-4]);
  });

  it("reaches a missile homing by radar, and not one homing by infrared (HT:EE p. 49)", () => {
    const pilot = character("Pilot");
    states.set(pilot, { eeChaff: { packages: 2 } });
    const missile = gear("Missile", {}, { rangedModes: [{ guidance: "homing" }] });
    const firer = character("Firer", [missile]);
    const shot = (seeker: string) => fire("gworld.attackModifiers", { actor: firer, item: missile, mode: { ranged: true, index: 0 }, options: { [`${MODULE_ID}.ee-seeker`]: seeker }, targets: [pilot], modifiers: [] });
    // Seekers are the homing seekers switch's.
    expect(shot("radar").modifiers).toEqual([]);
    on.add(key("homingSeekers"));
    expect(shot("radar").modifiers.map((m: any) => m.value)).toEqual([-4]);
    expect(shot("infrared").modifiers).toEqual([]);
    // A gun that doesn't home takes nothing, whatever the option says.
    const gun = gear("Rifle", {}, { rangedModes: [{}] });
    expect(fire("gworld.attackModifiers", { actor: firer, item: gun, mode: { ranged: true, index: 0 }, options: { [`${MODULE_ID}.ee-seeker`]: "radar" }, targets: [pilot], modifiers: [] }).modifiers).toEqual([]);
  });

  it("covers the aircraft the dumper crews", () => {
    const pilot = character("Pilot");
    const plane = character("Plane", [], { type: "vehicle", system: { crew: [{ uuid: pilot.uuid, operator: true }] } });
    gameActors = [plane];
    vi.stubGlobal("fromUuidSync", (uuid: string) => (uuid === pilot.uuid ? pilot : null));
    states.set(pilot, { eeChaff: { packages: 1 } });
    const radar = gear("Small Radar");
    const gunner = character("Gunner", [radar]);
    states.set(gunner, { utSensorLock: { targetUuid: plane.uuid, itemId: radar.id } });
    const attack = fire("gworld.attackModifiers", { actor: gunner, mode: { ranged: true }, targets: [plane], modifiers: [] });
    expect(attack.modifiers.map((m: any) => m.value)).toEqual([-2]);
  });
});

describe("reconnaissance drones (HT:EE p. 46)", () => {
  beforeEach(() => on.add(key("reconDrones")));

  it("shows the record's figures on its sheet and the vehicle's lines", () => {
    const phantom = drone();
    const context = sections.get("ht-drone-item").context(phantom);
    expect(context.data).toEqual(PHANTOM);
    const text = context.lines.join(" | ");
    expect(text).toContain('AutopilotLine {"skill":"Piloting (Helicopter)","level":14,"dodge":9}');
    expect(text).toContain('RemoteLine {"bonus":"+1"}');
    expect(text).toContain('RangeLine {"miles":4}');
    expect(text).toContain('CeilingLine {"feet":"1,640"}');
    const stats = fire("gworld.vehicleStats", { vehicle: phantom, handling: 2, stability: 3, lines: [] });
    expect(stats.handling).toBe(2);
    expect(stats.lines).toHaveLength(4);
    expect(fire("gworld.vehicleStats", { vehicle: gear("Truck", {}, { category: "vehicle", vehicle: {} }), lines: [] }).lines).toEqual([]);
    // The T-Hawk's spread-spectrum link (HT:EE p. 46).
    const hawk = drone({ ...PHANTOM, spreadSpectrum: true });
    expect(sections.get("ht-drone-item").context(hawk).lines.join(" | ")).not.toContain("SpreadLine");
    on.add(key("spreadSpectrum"));
    expect(sections.get("ht-drone-item").context(hawk).lines.join(" | ")).toContain('SpreadLine {"detect":-4}');
  });

  it("gives the operator the remote control's bonus within the controller's range", () => {
    const operator = character("Operator");
    const onGear = fire("gworld.successRollModifiers", { actor: operator, tags: ["skill", "vehicleControl"], vehicle: drone(), modifiers: [] });
    expect(onGear.modifiers.map((m: any) => m.value)).toEqual([1]);
    const flying = { ...drone(), documentName: "Actor", type: "vehicle", getActiveTokens: () => [{ center: { x: 0, y: 0 } }] };
    distance = 4 * 1760;
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: flying, modifiers: [] }).modifiers).toHaveLength(1);
    distance = 5 * 1760;
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: flying, modifiers: [], refusal: null }).modifiers).toEqual([]);
  });

  it("refuses the operator's vehicle control roll past the controller's range (API 1.144.0)", () => {
    const operator = character("Operator");
    const flying = { ...drone(), documentName: "Actor", type: "vehicle", getActiveTokens: () => [{ center: { x: 0, y: 0 } }] };
    distance = 5 * 1760;
    const refused = fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: flying, modifiers: [], refusal: null });
    expect(refused.refusal).toBe('GCC.HT.Battlefield.OutOfRangeRefusal {"name":"Phantom 4 Pro","miles":5}');
    // Another listener's refusal is kept.
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: flying, modifiers: [], refusal: "No" }).refusal).toBe("No");
    distance = 4 * 1760;
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: flying, modifiers: [], refusal: null }).refusal).toBeNull();
    // A drone off the map, whose distance isn't known, is flown.
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: ["vehicleControl"], vehicle: drone(), modifiers: [], refusal: null }).refusal).toBeNull();
  });

  it("refuses the control roll while the drone flies above its ceiling (HT:EE p. 46)", () => {
    const operator = character("Operator");
    const at = (elevation: number) => ({ ...drone(), documentName: "Actor", type: "vehicle", getActiveTokens: () => [{ center: { x: 0, y: 0 }, document: { elevation } }] });
    distance = 100;
    // 600 yards is 1,800 feet, above the Phantom's 1,640.
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: at(600), modifiers: [], refusal: null }).refusal).toContain("AboveCeilingRefusal");
    expect(fire("gworld.successRollModifiers", { actor: operator, tags: REMOTE, vehicle: at(500), modifiers: [], refusal: null }).refusal).toBeNull();
  });

  it("rolls the autopilot's Piloting or Dodge", async () => {
    const phantom = drone();
    const owner = character("Owner", [phantom]);
    dialogAnswer = "piloting";
    await actions.get("ht-drone-autopilot").run(phantom, owner);
    dialogAnswer = "dodge";
    await actions.get("ht-drone-autopilot").run(phantom, owner);
    expect(successes.map((s) => [s.base, s.skill, s.tags])).toEqual([[14, "Piloting (Helicopter)", ["autopilot"]], [9, "Dodge", ["autopilot"]]]);
  });

  it("checks the controller's range to the targeted operator and the ceiling on the map", async () => {
    const flying = { ...drone(), documentName: "Actor", type: "vehicle", getActiveTokens: () => [{ center: { x: 0, y: 0 }, document: { elevation: 600 } }] };
    selected = [flying];
    targets = [character("Operator")];
    distance = 8 * 1760;
    dialogAnswer = null;
    await tools.get("ht-recon-drone").open();
    const text = chat.map((m) => m.content).join();
    expect(text).toContain("OutOfRange");
    expect(text).toContain('AboveCeiling {"feet":"1,800"}');
  });

  it("leaves a crew member's roll aboard a drone on the map alone (not remote, API 1.154.0)", () => {
    const operator = character("Operator");
    const flying = { ...drone(), documentName: "Actor", type: "vehicle", getActiveTokens: () => [{ center: { x: 0, y: 0 } }] };
    distance = 5 * 1760;
    const aboard = fire("gworld.successRollModifiers", { actor: operator, tags: ["vehicleControl"], vehicle: flying, modifiers: [], refusal: null, remote: false });
    expect(aboard.refusal).toBeNull();
    expect(aboard.modifiers).toEqual([]);
  });

  it("offers the targeted operator the drone's controls from the GM tool", async () => {
    const updates: any[] = [];
    const flying: any = { ...drone(), documentName: "Actor", type: "vehicle", system: { ...drone().system, crew: [], controller: "" }, getActiveTokens: () => [{ center: { x: 0, y: 0 } }], update: async (patch: any) => { updates.push(patch); } };
    const operator = character("Operator");
    selected = [flying];
    targets = [operator];
    distance = 1760;
    confirmAnswer = true;
    await tools.get("ht-recon-drone").open();
    expect(updates).toEqual([{ "system.controller": "Actor.Operator" }]);
    // Nothing is asked of one who has them.
    expect(await battlefield.offerControls({ ...flying, system: { ...flying.system, controller: "Actor.Operator" } }, operator)).toBe(false);
    // One seated in its crew, as drones were flown before API 1.154.0, leaves the crew in the same update.
    const seated: any = { ...flying, system: { ...flying.system, crew: [{ uuid: "Actor.Operator", operator: true }, { uuid: "Actor.Spotter" }] }, update: async (patch: any) => { updates.push(patch); } };
    expect(await battlefield.offerControls(seated, operator)).toBe(true);
    expect(updates[1]).toEqual({ "system.controller": "Actor.Operator", "system.crew": [{ uuid: "Actor.Spotter" }] });
    // A drone carried as gear has no controller.
    expect(await battlefield.offerControls(drone(), operator)).toBe(false);
    confirmAnswer = false;
    expect(await battlefield.offerControls(flying, operator)).toBe(false);
    expect(updates).toHaveLength(2);
  });
});
