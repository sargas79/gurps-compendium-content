/**
 * Vehicle components, protection and crew as the system meets them: the
 * vehicle's DR where a shot lands, the control roll, the vehicle's figures,
 * the attack options, the crew's senses and fatigue, and the airbag in the
 * shared restraint engine -- with only High-Tech's switches on (decision D1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { RESTRAINT_TABLES, resetRestraints } from "../../../shared/vehicles/index.js";
import { UT_RESTRAINTS } from "../../ultra-tech/transport/index.js";
import { initVehicles, readyVehicles, runKind } from "./index.js";

let hooks: Map<string, Array<(...args: any[]) => void>>;
let options: Map<string, any>;
let sections: Map<string, any>;
let tools: Map<string, any>;
let conditions: any[];
let injuries: any[];
let successes: any[];
let chat: string[];
let on: Record<string, boolean>;
let rolls: number[];
let actors: any[];
let controls: any[];

function fakeApi() {
  return {
    rules,
    combat: {
      hooks: {
        vehicleDr: "gworld.vehicleDr", successRollModifiers: "gworld.successRollModifiers", detectionModifiers: "gworld.detectionModifiers",
        fatigueCost: "gworld.fatigueCost", injury: "gworld.injury", afterVehicleHit: "gworld.afterVehicleHit",
      },
      registerAttackOption: (o: any) => options.set(o.key, o),
    },
    data: { hooks: { prepareDerivedData: "gworld.prepareDerivedData", vehicleStats: "gworld.vehicleStats" } },
    hazards: { controlVehicle: async (o: any) => { controls.push(o); } },
    sheets: { registerGmTool: (t: any) => tools.set(t.key, t), registerSheetSection: (s: any) => sections.set(s.key, s) },
    actors: {
      attribute: () => 10,
      derived: () => ({}),
      conditions: (actor: any) => actor.conditions ?? [],
      applyCondition: async (actor: any, c: any) => { conditions.push({ actor: actor.name, ...c }); actor.conditions = [...(actor.conditions ?? []), { id: `${c.module}.${c.key}` }]; return "c1"; },
      removeCondition: async (actor: any, id: string) => { actor.conditions = (actor.conditions ?? []).filter((c: any) => c.id !== id); },
      applyInjury: async (actor: any, o: any) => { injuries.push({ actor: actor.name, ...o }); return true; },
      spendFatigue: async (actor: any, fp: number, o: any = {}) => { injuries.push({ actor: actor.name, amount: fp, spent: true, ...o }); return { fpLost: fp }; },
      // The system's reading of the vehicle a character is aboard (API 1.141.0), over the world's vehicles here.
      vehicleAboard: (actor: any) => {
        const vehicle = [...((globalThis as any).game?.actors ?? [])].find((v: any) => v?.type === "vehicle" && (v.system?.crew ?? []).some((seat: any) => seat?.uuid === actor?.uuid));
        return vehicle ? { vehicle, operator: false, moving: (Number(vehicle.system?.speed) || 0) > 0, medium: "ground" } : null;
      },
    },
    roll: { success: async (o: any) => { successes.push(o); return { success: true, margin: 0 }; } },
  };
}

function vehicleActor(name: string, vehicle: Record<string, any>, more: Record<string, any> = {}): any {
  const flags: Record<string, any> = {};
  return {
    documentName: "Actor", type: "vehicle", name, id: name, uuid: `Actor.${name}`, flags,
    system: { tl: "7", speed: 0, crew: [], vehicle: { locations: "", ...vehicle }, derived: {} },
    setFlag: async (module: string, key: string, value: any) => { flags[module] = { ...(flags[module] ?? {}), [key]: value }; },
    getFlag: (module: string, key: string) => flags[module]?.[key],
    ...more,
  };
}

function person(name: string): any {
  const flags: Record<string, any> = {};
  return {
    documentName: "Actor", type: "character", name, id: name, uuid: `Actor.${name}`, conditions: [] as any[], flags,
    setFlag: async (module: string, key: string, value: any) => { flags[module] = { ...(flags[module] ?? {}), [key]: value }; },
    getFlag: (module: string, key: string) => flags[module]?.[key],
  };
}

const call = (name: string, context: any) => { for (const fn of hooks.get(name) ?? []) fn(context); return context; };
const drLines = (dr: number) => [{ label: "Vehicle DR", dr, applies: true, hardened: 0 } as any];

function ready(): void {
  const rule = (key: string) => () => on[key] === true;
  setRuleReader((key) => on[key.replace(`${MODULE_ID}.`, "")] === true);
  initVehicles(`${MODULE_ID}.vehicleProtection`);
  RESTRAINT_TABLES.register(UT_RESTRAINTS);
  readyVehicles(fakeApi() as never, { components: rule("vehicleComponents"), protection: rule("vehicleProtection"), crew: rule("crewConditions") });
}

beforeEach(() => {
  hooks = new Map();
  options = new Map();
  sections = new Map();
  tools = new Map();
  conditions = [];
  injuries = [];
  successes = [];
  chat = [];
  on = {};
  rolls = [];
  actors = [];
  controls = [];
  resetRestraints();
  vi.stubGlobal("Hooks", { on: (name: string, fn: (...args: any[]) => void) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` },
    user: { targets: new Set() },
    get actors() { return actors; },
  });
  vi.stubGlobal("fromUuidSync", (uuid: string) => actors.find((a) => a.uuid === uuid) ?? null);
  vi.stubGlobal("foundry", { utils: { escapeHTML: (s: string) => s }, applications: { api: { DialogV2: { prompt: async () => null } } } });
  vi.stubGlobal("ui", { notifications: { warn: vi.fn(), info: vi.fn() } });
  vi.stubGlobal("ChatMessage", { implementation: { getSpeaker: () => ({}), create: async (m: any) => { chat.push(m.content); } } });
  vi.stubGlobal("Roll", class {
    total = 0;
    constructor(public formula: string) {}
    async evaluate() { this.total = rolls.shift() ?? 10; return this; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  RESTRAINT_TABLES.clear();
});

describe("with every switch off", () => {
  it("changes nothing", () => {
    ready();
    const t72 = vehicleActor("Uralvagonzavod T-72A", { dr: 1155 });
    const context = call("gworld.vehicleDr", { vehicle: t72, location: "mainTurret", arc: "front", damageType: "cr", armorDivisor: 10, basicDamage: 1000, lines: drLines(1375) });
    expect(context.lines).toEqual(drLines(1375));
    expect(tools.get("ht-vehicle-components").visible()).toBe(false);
    expect(options.get("ht-gun-port").available({ actor: person("Ivan"), targets: [] })).toBe(false);
  });
});

describe("protection, with only High-Tech's switch on", () => {
  beforeEach(() => {
    on = { vehicleProtection: true };
    ready();
  });

  it("multiplies the T-72A's turret front by 1.5 against a HEAT round, but not its side or an AP shot (pp. 229, 244)", () => {
    const t72 = vehicleActor("Uralvagonzavod T-72A", { dr: 1155 });
    const heat = call("gworld.vehicleDr", { vehicle: t72, location: "mainTurret", arc: "front", damageType: "cr", armorDivisor: 10, basicDamage: 1000, lines: drLines(1375) });
    expect(heat.lines[0].dr).toBe(2062);
    expect(heat.lines[0].reason).toContain("ShapedReason");
    const side = call("gworld.vehicleDr", { vehicle: t72, location: "mainTurret", arc: "side", damageType: "cr", armorDivisor: 10, basicDamage: 1000, lines: drLines(420) });
    expect(side.lines[0].dr).toBe(420);
    const ap = call("gworld.vehicleDr", { vehicle: t72, location: "mainTurret", arc: "front", damageType: "pi++", armorDivisor: 3, basicDamage: 1000, lines: drLines(1375) });
    expect(ap.lines[0].dr).toBe(1375);
  });

  it("reads the round from the weapon's HEAT load, and stops HESH's spall", () => {
    const t72 = vehicleActor("Uralvagonzavod T-72A", { dr: 1155 });
    const gun = { name: "Motovilikha D-81TM", system: { rangedModes: [{ name: "APFSDS", damageType: "pi++", explosive: false }, { name: "HESH", explosive: true }], extensions: { [MODULE_ID]: { htLoads: [{ mode: 0, projectile: "heat" }] } } } };
    const loaded = call("gworld.vehicleDr", { vehicle: t72, item: gun, mode: { index: 0, ranged: true }, location: "body", arc: "front", damageType: "cr", armorDivisor: 10, basicDamage: 500, lines: drLines(1155) });
    expect(loaded.lines[0].dr).toBe(1732);
    const hesh = call("gworld.vehicleDr", { vehicle: t72, item: gun, mode: { index: 1, ranged: true }, location: "body", arc: "front", damageType: "cr", armorDivisor: 1, basicDamage: 500, lines: drLines(1155) });
    expect(hesh.lines[0].dr).toBe(1155);
    expect(hesh.lines[0].reason).toContain("HeshReason");
  });

  it("adds the Panzer IV's skirts on its sides, spaced against HEAT (p. 239)", () => {
    const panzer = vehicleActor("Krupp Panzer IV Ausf H", { dr: 280 });
    const context = call("gworld.vehicleDr", { vehicle: panzer, location: "body", arc: "side", damageType: "cr", armorDivisor: 10, basicDamage: 300, lines: drLines(105) });
    expect(context.lines.map((l: any) => l.dr)).toEqual([157, 15]);
    const plain = call("gworld.vehicleDr", { vehicle: panzer, location: "mainTurret", arc: "side", damageType: "pi", armorDivisor: 1, basicDamage: 30, lines: drLines(155) });
    expect(plain.lines.map((l: any) => l.dr)).toEqual([155, 15]);
  });

  it("sends the FT17's rivets flying from a blow of 20 that didn't get through (p. 235)", async () => {
    const ft17 = vehicleActor("Renault FT17", { dr: 45, occupants: "2", sm: 3 });
    rolls = [2, 5, 7];
    // The blow is weighed once the shot is worked out (API 1.115.0): nothing flies before.
    call("gworld.vehicleDr", { vehicle: ft17, location: "body", arc: "front", damageType: "pi", armorDivisor: 1, basicDamage: 30, lines: drLines(45) });
    await Promise.resolve();
    expect(chat).toEqual([]);
    call("gworld.afterVehicleHit", { vehicle: ft17, location: "body", penetrating: 0, injury: 0 });
    await vi.waitFor(() => expect(chat.join("")).toContain("Spall.Hit"));
    chat = [];
    // A blow that got through sends no rivets flying.
    call("gworld.vehicleDr", { vehicle: ft17, location: "body", arc: "front", damageType: "pi", armorDivisor: 1, basicDamage: 60, lines: drLines(45) });
    call("gworld.afterVehicleHit", { vehicle: ft17, location: "body", penetrating: 15, injury: 15 });
    await Promise.resolve();
    expect(chat).toEqual([]);
    // Nor does a hit with no blow weighed first.
    call("gworld.afterVehicleHit", { vehicle: ft17, location: "body", penetrating: 0, injury: 0 });
    await Promise.resolve();
    expect(chat).toEqual([]);
  });

  it("tells an occupant hit what the cockpit armour gives the pilot from the face the shot came by (pp. 237-238, 242)", async () => {
    const mustang = vehicleActor("NAA P-51D Mustang IV", { dr: 5 });
    call("gworld.afterVehicleHit", { vehicle: mustang, location: "body", arc: "rear", penetrating: 12, injury: 12, occupantHit: { dice: 2 } });
    await vi.waitFor(() => expect(chat.join("")).toContain("Occupant.armour"));
    expect(chat.join("")).toContain('"dr":35');
    chat = [];
    // Nothing printed for its sides.
    call("gworld.afterVehicleHit", { vehicle: mustang, location: "body", arc: "side", penetrating: 12, injury: 12, occupantHit: { dice: 2 } });
    await vi.waitFor(() => expect(chat.join("")).toContain("Occupant.noArmour"));
    chat = [];
    // The PBR's coxswain all round, and the gun shield on its rear pintle.
    const pbr = vehicleActor("Uniflite PBR MK 2", { dr: 3 });
    call("gworld.afterVehicleHit", { vehicle: pbr, location: "body", arc: null, penetrating: 10, injury: 10, occupantHit: { dice: 2 } });
    await vi.waitFor(() => expect(chat.join("")).toContain("Occupant.gunShield"));
    expect(chat.join("")).toContain('"dr":20');
    chat = [];
    // No occupant hit, or a vehicle with no cockpit armour: no card.
    call("gworld.afterVehicleHit", { vehicle: mustang, location: "body", arc: "front", penetrating: 12, injury: 12, occupantHit: null });
    call("gworld.afterVehicleHit", { vehicle: vehicleActor("Willys MB", { dr: 4 }), location: "body", arc: "front", penetrating: 12, injury: 12, occupantHit: { dice: 2 } });
    await Promise.resolve();
    expect(chat).toEqual([]);
  });

  it("runs on flat run-flat tyres at -1 Handling and top speed less 20%, on the figures the rules read (p. 229)", async () => {
    const aml = vehicleActor("Panhard AML60-7", { dr: 35, locations: "T4W", range: 375, roadBound: false });
    const stats = (vehicle: any) => call("gworld.vehicleStats", { vehicle, handling: 1, stability: 4, acceleration: 3, topSpeed: 28, move: { locomotion: "wheels", acceleration: 3, topSpeed: 28 }, lines: [] });
    expect(stats(aml)).toMatchObject({ handling: 1, topSpeed: 28, lines: [] });
    await aml.setFlag(MODULE_ID, "htVehicle", { flats: 1 });
    // The system's control roll and Dodge read the Handling (API 1.115.0): no line of the add-on's own on the roll.
    expect(stats(aml)).toMatchObject({ handling: 0, topSpeed: 22.4, acceleration: 3 });
    expect(call("gworld.successRollModifiers", { tags: ["vehicleControl"], vehicle: aml, modifiers: [] }).modifiers).toEqual([]);
    // CTIS copes with the BRDM-2's two flats.
    const brdm = vehicleActor("GAZ BRDM-2", { dr: 40, locations: "t4W" });
    await brdm.setFlag(MODULE_ID, "htVehicle", { flats: 2 });
    expect(stats(brdm)).toMatchObject({ handling: 1, topSpeed: 28 });
  });

  it("takes the system's crippled wheels as flat tyres the run-flats or CTIS carry (API 1.134.0)", () => {
    // As the system hands it over: one of four wheels crippled, Move 28 down to 14 with its line.
    const lamed = (vehicle: any) => call("gworld.vehicleStats", {
      vehicle, handling: 1, stability: 4, acceleration: 1.5, topSpeed: 14,
      move: { locomotion: "wheels", acceleration: 3, topSpeed: 28 }, crippled: { wheel: 1 },
      lines: [{ label: "Crippled wheel", stat: "topSpeed", value: -14 }],
    });
    const aml = vehicleActor("Panhard AML60-7", { dr: 35, locations: "T4W", range: 375, roadBound: false });
    expect(lamed(aml)).toMatchObject({ handling: 0, acceleration: 3, topSpeed: 22.4, lines: [{ label: "GCC.HT.Vehicles.RunningFlat", stat: "handling" }, { label: "GCC.HT.Vehicles.RunningFlat", stat: "topSpeed" }] });
    const brdm = vehicleActor("GAZ BRDM-2", { dr: 40, locations: "t4W" });
    expect(lamed(brdm)).toMatchObject({ handling: 1, acceleration: 3, topSpeed: 28, lines: [] });
    // A car with neither keeps the system's figures.
    const car = vehicleActor("Car", { dr: 4, locations: "4W" });
    expect(lamed(car)).toMatchObject({ handling: 1, acceleration: 1.5, topSpeed: 14, lines: [{ label: "Crippled wheel" }] });
  });

  it("gives improved brakes +1 on a control roll made for braking hard, from the tool (p. 229)", async () => {
    const driver = person("Driver");
    actors = [driver];
    const car = vehicleActor("Car", { dr: 4, locations: "4W" });
    car.system.crew = [{ uuid: driver.uuid, operator: true }];
    await car.setFlag(MODULE_ID, "htVehicle", { fittings: ["improvedBrakes"] });
    await runKind(fakeApi() as never, car, { kind: "brake" } as any, [], { components: () => false, protection: () => true, crew: () => false });
    expect(controls).toEqual([{ actor: driver, vehicle: car, reason: "hardBraking" }]);
    expect(call("gworld.successRollModifiers", { tags: ["vehicleControl"], vehicle: car, reason: "hardBraking", modifiers: [] }).modifiers).toEqual([{ label: "GCC.HT.Vehicles.ImprovedBrakes", value: 1 }]);
    // Any other control roll, or no such brakes: nothing.
    expect(call("gworld.successRollModifiers", { tags: ["vehicleControl"], vehicle: car, modifiers: [] }).modifiers).toEqual([]);
    expect(call("gworld.successRollModifiers", { tags: ["vehicleControl"], vehicle: vehicleActor("Other", { dr: 4 }), reason: "hardBraking", modifiers: [] }).modifiers).toEqual([]);
  });

  it("puts an airbag in the shared restraint engine: DR 10 against the crash while Ultra-Tech's switch is off (D1)", async () => {
    const driver = person("Driver");
    actors = [driver];
    const car = vehicleActor("AM General M1025", { dr: 8 }, {});
    car.system.crew = [{ uuid: driver.uuid, operator: true }];
    await car.setFlag(MODULE_ID, "htVehicle", { fittings: ["airbags"] });
    await runKind(fakeApi() as never, car, { kind: "airbag", speed: 20 } as any, [], { components: () => false, protection: () => true, crew: () => false });
    expect(conditions[0]).toMatchObject({ actor: "Driver", key: "ht-airbag" });
    const injury = call("gworld.injury", { actor: driver, damage: { type: "cr", basicDamage: 14 } });
    expect(injury.damage.basicDamage).toBe(4);
    // Not ablative: the next blow meets DR 10 too.
    expect(call("gworld.injury", { actor: driver, damage: { type: "cr", basicDamage: 12 } }).damage.basicDamage).toBe(2);
    // A crashweb's condition does nothing with Ultra-Tech's switch off.
    const other = person("Other");
    other.conditions = [{ id: `${MODULE_ID}.ut-crashweb` }];
    await other.setFlag(MODULE_ID, "utCrashwebDr", 10);
    expect(call("gworld.injury", { actor: other, damage: { type: "cr", basicDamage: 14 } }).damage.basicDamage).toBe(14);
  });

  it("rolls an extinguisher at TL+2 and a suppression system twice at TL+4, and puts the fire out (p. 229)", async () => {
    const panzer = vehicleActor("Krupp Panzer IV Ausf H", { dr: 280 }, { conditions: [{ id: "burning" }] });
    panzer.system.tl = "6";
    rolls = [9];
    await runKind(fakeApi() as never, panzer, { kind: "extinguish" } as any, [], { components: () => false, protection: () => true, crew: () => false });
    expect(chat.join("")).toContain("\"target\":8");
    expect(chat.join("")).toContain("StillBurning");
    const t72 = vehicleActor("Uralvagonzavod T-72A", { dr: 1155 }, { conditions: [{ id: "burning" }] });
    rolls = [12, 11];
    chat = [];
    await runKind(fakeApi() as never, t72, { kind: "extinguish" } as any, [], { components: () => false, protection: () => true, crew: () => false });
    expect(chat.join("")).toContain("FireOut");
    expect(t72.conditions).toEqual([]);
  });
});

describe("components, with only High-Tech's switch on", () => {
  beforeEach(() => {
    on = { vehicleComponents: true };
    ready();
  });

  it("offers a gun port to the BRDM-2's crew: -1, refused for a weapon bulkier than -5 (p. 228)", () => {
    const rifleman = person("Rifleman");
    const brdm = vehicleActor("GAZ BRDM-2", { dr: 40 });
    brdm.system.crew = [{ uuid: rifleman.uuid }];
    actors = [brdm, rifleman];
    const port = options.get("ht-gun-port");
    const rifle = { system: { rangedModes: [{ bulk: -5 }] } };
    const launcher = { system: { rangedModes: [{ bulk: -7 }] } };
    expect(port.available({ actor: rifleman, item: rifle, targets: [] })).toBe(true);
    expect(port.available({ actor: person("Walker"), item: rifle, targets: [] })).toBe(false);
    expect(port.refuse({ actor: rifleman, item: rifle })).toBeNull();
    expect(port.refuse({ actor: rifleman, item: launcher })).toContain("GunPortBulk");
    expect(port.apply({ actor: rifleman, item: rifle }).modifiers).toEqual([{ label: "GCC.HT.Vehicles.GunPort", value: -1 }]);
    const at = options.get("ht-at-gun-port");
    expect(at.available({ actor: person("Outside"), targets: [{ actor: rifleman }] })).toBe(true);
    expect(at.apply({}, "-7").modifiers[0].value).toBe(-7);
  });

  it("fires linked weapons at the sum of their RoF (p. 229)", () => {
    const mg = { system: { rangedModes: [{ rateOfFire: 20, mount: "mounted" }] } };
    expect(options.get("ht-linked-weapons").available({ actor: person("Gunner"), item: mg, targets: [] })).toBe(true);
    expect(options.get("ht-linked-weapons").apply({ item: mg }, 20).rateOfFire).toBe(40);
  });

  it("turns a turret in Ready maneuvers by the facing (p. 228)", async () => {
    await runKind(fakeApi() as never, vehicleActor("Uralvagonzavod T-72A", { dr: 1155 }), { kind: "turret", degrees: 120 } as any, [], { components: () => true, protection: () => false, crew: () => false });
    expect(chat.join("")).toContain("\"readies\":6");
  });

  it("takes the searchlight's range penalty from the map, unless one is typed in (p. 228)", async () => {
    const at = (x: number) => ({ getActiveTokens: () => [{ center: { x, y: 0 } }] });
    vi.stubGlobal("canvas", { grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.abs(b.x - a.x) }) } });
    const gunner = person("Gunner");
    actors = [gunner];
    const aml = vehicleActor("Panhard AML60-7", { dr: 35, locations: "T4W" }, at(0));
    aml.system.crew = [{ uuid: gunner.uuid, operator: true }];
    const target = { ...person("Sentry"), ...at(100) };
    const light = (range: number) => runKind(fakeApi() as never, aml, { kind: "searchlight", miles: 0.25, aimed: true, night: false, range } as any, [target], { components: () => true, protection: () => false, crew: () => false });
    await light(0);
    // 100 yards: -10 on the Speed/Range Table.
    expect(successes[0].modifiers).toEqual([{ label: "GCC.HT.Vehicles.Tool.SearchlightAcc", value: 12 }, { label: expect.stringContaining("RangeYards"), value: -10 }]);
    await light(-4);
    expect(successes.at(-1).modifiers.at(-1)).toEqual({ label: "GCC.HT.Vehicles.Tool.Range", value: -4 });
  });

  it("shows a vehicle's components on its item sheet", () => {
    const item = { type: "equipment", name: "GAZ BRDM-2", system: { category: "vehicle", tl: "7", vehicle: { locations: "t4W" } } };
    const section = sections.get("ht-vehicles-item");
    expect(section.visible(item)).toBe(true);
    expect(section.context(item).lines.join(" ")).toContain("Line.gunPorts");
    expect(section.context(item).lines.join(" ")).not.toContain("Line.ctis");
  });
});

describe("crew, with only High-Tech's switch on", () => {
  beforeEach(() => {
    on = { crewConditions: true };
    ready();
  });

  it("hears a crewmate at -4 in an FT17 with the motor running, and outside at -10 (p. 234)", async () => {
    const driver = person("Driver");
    const commander = person("Commander");
    const ft17 = vehicleActor("Renault FT17", { dr: 45 });
    ft17.system.crew = [{ uuid: driver.uuid, operator: true }, { uuid: commander.uuid }];
    actors = [ft17, driver, commander];
    await ft17.setFlag(MODULE_ID, "htVehicle", { motorRunning: true });
    expect(call("gworld.detectionModifiers", { observer: commander, subject: driver, sense: "hearing", modifiers: [] }).modifiers).toEqual([{ label: "GCC.HT.Vehicles.HearCrew", value: -4 }]);
    expect(call("gworld.detectionModifiers", { observer: commander, subject: person("Outside"), sense: "hearing", modifiers: [] }).modifiers).toEqual([{ label: "GCC.HT.Vehicles.HearOutside", value: -10 }]);
    // The Panzer IV's crew have headsets.
    const panzer = vehicleActor("Krupp Panzer IV Ausf H", { dr: 280 });
    panzer.system.crew = [{ uuid: driver.uuid }, { uuid: commander.uuid }];
    actors = [panzer, driver, commander];
    await panzer.setFlag(MODULE_ID, "htVehicle", { motorRunning: true });
    expect(call("gworld.detectionModifiers", { observer: commander, subject: driver, sense: "hearing", modifiers: [] }).modifiers).toEqual([]);
  });

  it("sees at -2 buttoned up, and charges the fight's and the ride's fatigue (p. 234)", async () => {
    const driver = person("Driver");
    const ft17 = vehicleActor("Renault FT17", { dr: 45 });
    ft17.system.crew = [{ uuid: driver.uuid, operator: true }];
    actors = [ft17, driver];
    await ft17.setFlag(MODULE_ID, "htVehicle", { buttonedUp: true });
    expect(call("gworld.detectionModifiers", { observer: driver, sense: "vision", modifiers: [] }).modifiers[0].value).toBe(-2);
    const fight = call("gworld.fatigueCost", { actor: driver, reason: "battle", fp: 1, details: { seconds: 1200 }, sources: [] });
    expect(fight.fp).toBe(3);
    await runKind(fakeApi() as never, ft17, { kind: "ride", hours: 2, headOut: false } as any, [], { components: () => false, protection: () => false, crew: () => true });
    expect(injuries).toEqual([{ actor: "Driver", amount: 2, spent: true, exertion: false, details: { rule: "ride" } }]);
  });
});
