/**
 * What powers High-Tech's gear beyond its own batteries (pp. 10, 13-15;
 * HT:EE pp. 9, 17-18): generators, collectors and flywheels a gadget is
 * plugged into, run as world time passes; batteries swapped into a weapon;
 * spares of the right chemistry; supercapacitors; chargers.
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { CELL_TABLES, enduranceLeft, fittingSources, powerGearContext, registerPowerSource, shotsScale, useSpares } from "../../../shared/power/index.js";
import { isPluggable, loadedCellWeight, powerData } from "../../../shared/power/data.js";
import { sourceFits } from "../../../shared/power/sources.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ultraTechCells } from "../../ultra-tech/power/index.js";
import { BATTERIES_RULE, CHEMISTRY_RULE, ENERGY_STORAGE_RULE, EXTERNAL_POWER_RULE, HIGH_TECH_BATTERIES, generatorFor, highTechBatteries } from "./index.js";
import { chargeableGear, registerChemistryVariant, registerSupercapacitorVariant } from "./electricity.js";
import { FUELS, GENERATORS, fuelOf } from "./generators.js";
import { advanceGenerators, availability, flywheelHours, generatorState, highTechSources, runGenerator, supplyOf, type SourceDeps } from "./sources.js";
import { supercapacitorFactors } from "./storage.js";

const UT_RULE = `${MODULE_ID}.powerCells`;

let nextId = 0;
const gear = (name: string, power: Record<string, unknown>, extra: Record<string, unknown> = {}, flags: Record<string, unknown> = {}) => ({
  id: `i${nextId++}`,
  type: "equipment",
  name,
  system: { tl: "8", cost: 100, weight: 5, quantity: 1, carried: true, extensions: { [MODULE_ID]: { power } }, ...extra },
  flags: { [MODULE_ID]: { book: "high-tech", ...flags } },
});

function only(...keys: string[]) {
  const on = new Set(keys);
  setRuleReader((k) => on.has(k));
}

registerChemistryVariant(HIGH_TECH_BATTERIES, CHEMISTRY_RULE);
registerSupercapacitorVariant(HIGH_TECH_BATTERIES, ENERGY_STORAGE_RULE);

beforeEach(() => {
  CELL_TABLES.register(ultraTechCells(UT_RULE));
  CELL_TABLES.register(highTechBatteries());
});

afterEach(() => {
  CELL_TABLES.clear();
  setRuleReader(() => false);
  vi.unstubAllGlobals();
});

describe("batteries swapped into a battery weapon (pp. 10, 13)", () => {
  it("scales its shots as they scale its endurance: by the batteries' weight", () => {
    only(BATTERIES_RULE);
    const zapper = gear("Stun Gun", { draw: { cell: "S", cells: 1, endurance: "10 hrs." }, swapCell: "M", swapCells: 1 });
    // An M battery weighs 2 lbs., an S 0.33: about six times the shots.
    expect(shotsScale(powerData(zapper))).toBeCloseTo(2 / 0.33);
    expect(shotsScale(powerData(gear("Stun Gun", { draw: { cell: "S", cells: 1, endurance: "10 hrs." } })))).toBe(1);
  });

  it("scales them by a chemistry's endurance, and counts none of a supercapacitor's own", () => {
    only(BATTERIES_RULE, CHEMISTRY_RULE, ENERGY_STORAGE_RULE);
    expect(shotsScale(powerData(gear("Stun Gun", { draw: { cell: "S", cells: 1, endurance: "10 hrs." }, chemistry: "nicad" })))).toBeCloseTo(1 / 3);
    expect(shotsScale(powerData(gear("Stun Gun", { draw: { cell: "S", cells: 1, endurance: "10 hrs." }, chemistry: "supercapacitor" })))).toBe(1);
  });
});

describe("spare batteries of the gadget's chemistry (HT:EE pp. 16-18)", () => {
  const spare = (chemistry: string, quantity = 4) => {
    const item: any = gear("S Battery", { chemistry }, { quantity });
    item.update = vi.fn(async () => undefined);
    return item;
  };

  it("takes spares of the same chemistry only, where a rule gives the gadget one", async () => {
    const alkaline = spare("");
    const nimh = spare("nimh");
    const actor = { items: [alkaline, nimh] };
    expect(await useSpares(actor, "{size} Battery", { size: "S", cells: 2 }, "nimh")).toEqual({ name: "S Battery", left: 2 });
    expect(nimh.update).toHaveBeenCalled();
    expect(alkaline.update).not.toHaveBeenCalled();
    expect(await useSpares(actor, "{size} Battery", { size: "S", cells: 2 }, "lithiumIon")).toBeNull();
    // With no chemistry in play, any will do.
    expect(await useSpares({ items: [spare("nicad")] }, "{size} Battery", { size: "S", cells: 2 }, null)).toMatchObject({ left: 2 });
  });
});

describe("supercapacitors in a gadget (HT:EE p. 18)", () => {
  it("stands one size smaller in for the batteries, at its weight and twenty times its price", () => {
    const factors = supercapacitorFactors("L", HIGH_TECH_BATTERIES.sizes, (s) => HIGH_TECH_BATTERIES.cells[s]!, () => null);
    expect(factors).toEqual({ size: "M", cost: (5 * 20) / 10, weight: 2 / 10 });
    expect(supercapacitorFactors("T", HIGH_TECH_BATTERIES.sizes, (s) => HIGH_TECH_BATTERIES.cells[s]!, () => null)).toBeNull();
  });

  it("runs the gadget a minute, under the energy storage switch", () => {
    const lamp = gear("Lantern", { draw: { cell: "L", cells: 1, endurance: "20 hrs." }, chemistry: "supercapacitor" });
    only(BATTERIES_RULE);
    expect(enduranceLeft(powerData(lamp))).toMatchObject({ total: 20 });
    only(BATTERIES_RULE, ENERGY_STORAGE_RULE);
    const data = powerData(lamp);
    expect(data.variant).toMatchObject({ labelData: { size: "M" }, rechargeable: true });
    expect(enduranceLeft(data)).toMatchObject({ total: 1 / 60 });
    // It weighs what an M battery does.
    expect(loadedCellWeight(lamp)).toBe(2);
  });
});

describe("chargers for a gadget's batteries (HT:EE p. 18)", () => {
  it("finds the carried gadgets on lead-acid or lithium-ion batteries that can be recharged", () => {
    only(BATTERIES_RULE, CHEMISTRY_RULE);
    const atv = gear("Radio", { draw: { cell: "L", cells: 1, endurance: "20 hrs." }, rechargeable: true, hoursUsed: 5 });
    const phone = gear("Phone", { draw: { cell: "XS", cells: 1, endurance: "8 hrs." }, rechargeable: true, chemistry: "lithiumIon" });
    const torch = gear("Torch", { draw: { cell: "S", cells: 1, endurance: "8 hrs." } });
    const actor = { items: [atv, phone, torch] };
    // High-Tech prints its L batteries as lead-acid.
    expect(chargeableGear(actor, HIGH_TECH_BATTERIES, "leadAcid").map((t) => t.item.name)).toEqual(["Radio"]);
    expect(chargeableGear(actor, HIGH_TECH_BATTERIES, "lithiumIon").map((t) => t.item.name)).toEqual(["Phone"]);
  });
});

describe("what a generator supplies (p. 14; HT:EE pp. 9, 17)", () => {
  const state = generatorState({});

  it("gives High-Tech's unsplit external power, which any device takes", () => {
    expect(supplyOf(GENERATORS["Portable Gasoline Generator"]!, state, true)).toEqual({ supplies: null, standsFor: null });
    expect(sourceFits({ grades: ["household"] }, null, { supplies: null, standsForWeight: null })).toBe(true);
  });

  it("gives the supplement's grades under its switch, a wind generator's by the wind", () => {
    const wind = GENERATORS["Wind Generator (TL6)"]!;
    expect(supplyOf(wind, { wind: "high" }, true).supplies).toEqual(["household"]);
    expect(supplyOf(wind, { wind: "low" }, true).supplies).toEqual(["automotive"]);
    expect(supplyOf(GENERATORS["Fuel Cell Power Supply"]!, state, true).supplies).toEqual(["majorAppliance", "household"]);
    // The hand crank only stands in for an S battery.
    expect(supplyOf(GENERATORS["Hand Crank Generator"]!, state, true)).toEqual({ supplies: [], standsFor: { size: "S", cells: 1 } });
  });

  it("matches a device's grade against what the source supplies", () => {
    const automotive = { supplies: ["automotive"], standsForWeight: null };
    expect(sourceFits({ grades: ["household"] }, null, automotive)).toBe(false);
    expect(sourceFits({ grades: ["automotive", "household"] }, null, automotive)).toBe(true);
    // High-Tech's own "external power" device takes any.
    expect(sourceFits({ grades: ["external"] }, null, automotive)).toBe(true);
    // A battery gadget on its adapter takes one standing in for batteries as heavy as its own.
    expect(sourceFits({ grades: [] }, 0.33, { supplies: [], standsForWeight: 0.33 })).toBe(true);
    expect(sourceFits({ grades: [] }, 2, { supplies: [], standsForWeight: 0.33 })).toBe(false);
  });
});

describe("running a generator (pp. 14-16)", () => {
  const on = { running: true, wind: "high" as const, wood: 0, water: 0, drawn: 0 };

  it("gives power only while it runs and its fuel, wind or light holds out", () => {
    const gas = GENERATORS["Portable Gasoline Generator"]!;
    expect(availability(gas, { ...on, running: false }, 0, null, false)).toMatchObject({ available: false, status: "off" });
    expect(availability(gas, on, 4, null, false)).toMatchObject({ available: true, status: "fuel", data: { left: 6, hours: 10 } });
    expect(availability(gas, on, 10, null, false)).toMatchObject({ available: false, status: "empty" });
    expect(availability(gas, { ...on, running: false }, 10, null, false)).toMatchObject({ available: false, status: "empty" });
    expect(availability(GENERATORS.Windmill!, { ...on, wind: "calm" }, 0, null, false).available).toBe(false);
    expect(availability(GENERATORS["Solar Power Array"]!, on, 0, -1, false)).toMatchObject({ available: false, status: "dark" });
    expect(availability(GENERATORS["Solar Power Array"]!, on, 0, 0, false).available).toBe(true);
    expect(availability(GENERATORS["Hydroelectric Turbine"]!, on, 0, null, false).available).toBe(true);
    // A steam engine needs wood in the firebox or a cord carried.
    const steam = GENERATORS["Portable Steam-Powered Generator"]!;
    expect(availability(steam, on, 0, null, false)).toMatchObject({ available: false, status: "noWood" });
    expect(availability(steam, on, 0, null, true).available).toBe(true);
    // Worked by muscle, it gives power while someone cranks it.
    expect(availability(GENERATORS["Portable Muscle-Powered Generator"]!, { ...on, running: false }, 0, null, false).available).toBe(true);
  });

  it("burns a tank down by the hour and stops when it's dry", () => {
    const gas = GENERATORS["Semi-Portable Gasoline Generator"]!;
    expect(runGenerator(gas, on, 1, 1.5, 0, 2000)).toMatchObject({ hoursRun: 2.5, stopped: false });
    expect(runGenerator(gas, on, 2, 4, 0, 2000)).toMatchObject({ hoursRun: 3, stopped: true });
  });

  it("burns a steam engine's wood and water by the hour, a cord at a time", () => {
    // 20 lbs. of wood and a gallon of water an hour (p. 14).
    const steam = GENERATORS["Portable Steam-Powered Generator"]!;
    expect(runGenerator(steam, on, 0, 3, 1, 2000)).toEqual({ hoursRun: 0, wood: 1940, cords: 1, water: 3, stopped: false });
    // Out of wood: it burns what is left and goes out.
    expect(runGenerator(steam, { ...on, wood: 30 }, 0, 3, 0, 2000)).toEqual({ hoursRun: 0, wood: 0, cords: 0, water: 1.5, stopped: true });
  });

  it("runs every running generator an actor carries with world time, taking the cords from its stock", async () => {
    const say = vi.fn(async () => undefined);
    const steam: any = gear("Portable Steam-Powered Generator", {}, {}, { generator: { running: true, wood: 10 } });
    steam.update = vi.fn(async () => undefined);
    const cord: any = gear("Wood (per cord)", {}, { quantity: 2, weight: 2000 });
    const gas: any = gear("Portable Gasoline Generator", { hoursUsed: 9 }, {}, { generator: { running: true } });
    gas.update = vi.fn(async () => undefined);
    const api: any = { items: { changeQuantity: vi.fn(async () => ({})) } };
    const deps = { generatorFor, shown: () => true };
    await advanceGenerators({ items: [steam, cord, gas] }, 2, deps, say, api, { empty: () => "dry", noWood: () => "no wood" });
    expect(api.items.changeQuantity).toHaveBeenCalledWith(cord, -1, { reason: "steamEngine" });
    expect(steam.update).toHaveBeenCalledWith({ [`flags.${MODULE_ID}.generator.wood`]: 1970, [`flags.${MODULE_ID}.generator.water`]: 2 });
    // The gasoline generator had an hour left: it runs dry and stops.
    expect(gas.update).toHaveBeenCalledWith({ [`system.extensions.${MODULE_ID}.power.hoursUsed`]: 10 });
    expect(gas.update).toHaveBeenCalledWith(expect.objectContaining({ [`flags.${MODULE_ID}.generator.running`]: false }));
    expect(say).toHaveBeenCalledWith(expect.anything(), gas, "dry");
  });

  it("names only records the book's packs carry, the hydrogen cylinder among them (p. 15)", () => {
    const records = ["high-tech-by-hand.json", "high-tech-ee-laboratory-power-by-hand.json"]
      .flatMap((file) => JSON.parse(readFileSync(new URL(`../../../../books/high-tech/packs-src/equipment/${file}`, import.meta.url), "utf-8")) as Array<{ name: string; system: any }>);
    const cylinder = records.find((r) => r.name === "Hydrogen Cylinder");
    expect(cylinder?.system).toMatchObject({ cost: 100, weight: 65, tl: "8", reference: "High-Tech p. 15" });
    expect(fuelOf("Hydrogen Cylinder")).toBe("hydrogen");
    expect(Object.keys(FUELS)).toContain("Hydrogen Cylinder");
  });
});

describe("flywheels as a store (HT:EE p. 18)", () => {
  const weight = (size: string) => HIGH_TECH_BATTERIES.cells[size]!.weight;

  it("runs a battery gadget on its share of the same size's energy, by its batteries' weight", () => {
    // A Medium flywheel holds 2/3 of an M battery (2 lbs.): a gadget on an S battery (0.33 lb.) for 10 hours runs about 40.
    expect(flywheelHours({ size: "M", material: "" }, { endurance: 10, cellWeight: 0.33, grades: [] }, weight)).toBeCloseTo((10 * (2 / 3) * 2) / 0.33, 2);
    // Titanium stores a third more.
    expect(flywheelHours({ size: "L", material: "titanium" }, { endurance: 5, cellWeight: 10, grades: [] }, weight)).toBeCloseTo(5 * (4 / 3), 3);
  });

  it("runs a device of its peak's grade for up to two minutes", () => {
    expect(flywheelHours({ size: "M", material: "" }, { endurance: null, cellWeight: null, grades: ["household"] }, weight)).toBeCloseTo(2 / 60);
    expect(flywheelHours({ size: "M", material: "" }, { endurance: null, cellWeight: null, grades: ["industrial"] }, weight)).toBeNull();
  });
});

describe("plugging gear into what the character carries (p. 14)", () => {
  const deps: SourceDeps = {
    generatorFor,
    shown: () => true,
    storageOn: () => true,
    darkness: () => null,
    statusText: (a) => a.status,
    flywheelStatus: (drawn) => `drawn ${drawn}`,
  };

  it("offers High-Tech's external-power devices a generator under the book's switch alone", () => {
    only(BATTERIES_RULE);
    const fridge = gear("Refrigerator (TL8)", { raw: "External power", grades: ["external"] });
    expect(isPluggable(fridge)).toBe(true);
    // The supplement's grades wait for its switch.
    expect(isPluggable(gear("Blender", { raw: "Household power", grades: ["household"] }))).toBe(false);
    only(BATTERIES_RULE, EXTERNAL_POWER_RULE);
    expect(isPluggable(gear("Blender", { raw: "Household power", grades: ["household"] }))).toBe(true);
  });

  it("lists the generators and flywheels that fit a gadget, with whether they give power", () => {
    only(BATTERIES_RULE, EXTERNAL_POWER_RULE);
    const fridge = gear("Refrigerator (TL8)", { raw: "External power", grades: ["external"] });
    const panel = gear("Portable Solar Panel", {}, {}, { generator: { running: true } });
    const gas = gear("Portable Gasoline Generator", { hoursUsed: 10 }, {}, { generator: { running: true } });
    const flywheel = gear("Medium Flywheel", { storage: { kind: "flywheel", size: "M", material: "", count: 1, shock: 0 } }, {}, { generator: { drawn: 0.5 } });
    const radio = gear("Radio", { draw: { cell: "S", cells: 1, endurance: "10 hrs." }, adapter: true });
    const actor = { items: [fridge, panel, gas, flywheel, radio] };
    const forFridge = highTechSources(actor, fridge, deps);
    expect(forFridge.map((s) => [s.item.name, s.available, s.status])).toEqual([
      ["Portable Solar Panel", true, "sun"],
      ["Portable Gasoline Generator", false, "empty"],
      // High-Tech's "external power" takes the flywheel's household peak, for two minutes.
      ["Medium Flywheel", true, "drawn 0.5"],
    ]);
    expect(forFridge[2]!.store!.total).toBeCloseTo(2 / 60);
    // The radio, on its adapter, can draw on the flywheel: half its store is left.
    const forRadio = highTechSources(actor, radio, deps);
    const store = forRadio.find((s) => s.item.name === "Medium Flywheel")!;
    expect(store.store!.total).toBeCloseTo((10 * (2 / 3) * 2) / 0.33, 2);
    expect(store.store!.left).toBeCloseTo(store.store!.total / 2, 2);
  });

  it("shows a plugged-in gadget's source on the Gear tab, and its choices", () => {
    only(BATTERIES_RULE, EXTERNAL_POWER_RULE);
    vi.stubGlobal("game", { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` } });
    const generator = { id: "gen", name: "Test Generator" };
    const lamp = { ...gear("Lamp", { raw: "Household power", grades: ["household"], external: true, source: "gen" }), id: "lamp" };
    const actor = { system: {}, items: [lamp], marker: "gear-tab-test" };
    let available = false;
    registerPowerSource((a) => (a?.marker === "gear-tab-test" ? [{ item: generator, supplies: ["household"], standsForWeight: null, available, status: "not running" }] : []));
    expect(fittingSources(actor, lamp).map((s) => s.item.id)).toEqual(["gen"]);
    let row: any = (powerGearContext(actor) as any).groups[0].rows[0];
    expect(row.charge).toBe('GCC.HT.Power.NoPowerFrom {"name":"Test Generator","status":"not running"}');
    expect(row.choices.map((c: any) => [c.value, c.selected])).toEqual([["cells", false], ["external", false], ["source:gen", true]]);
    expect(row.hasCells).toBe(false);
    available = true;
    row = (powerGearContext(actor) as any).groups[0].rows[0];
    expect(row.charge).toBe('GCC.HT.Power.OnSourceStatus {"name":"Test Generator","status":"not running"}');
  });
});
