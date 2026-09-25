/**
 * High-Tech's generators, collectors and flywheels as sources a gadget is
 * plugged into (pp. 14-15; HT:EE pp. 9, 17-18), and running them as world
 * time passes.
 *
 * A generator gives external power "while [its] fuel holds out" (p. 14). Each
 * one the character carries is offered to the gadgets that can be plugged in,
 * as the shared engine's source (`registerPowerSource`), with the grade of
 * external power it supplies -- none named for High-Tech's own, which any
 * device takes; the supplement's grade where its switch is on (HT:EE p. 9) --
 * and whether it gives power now:
 *
 *   - a generator with a tank or a firebox while it is running and its fuel
 *     holds out; as world time passes, a running one burns its tank's hours,
 *     or a steam engine its wood and water by the hour, taking a cord of wood
 *     from what the character carries as the firebox empties (pp. 14, 16);
 *   - a windmill or wind generator while it is running and the wind blows
 *     (p. 15; HT:EE p. 17), in high or low wind for the supplement's grades;
 *   - a hydroelectric turbine while it is running (p. 15);
 *   - a solar collector while it is running and the light where the
 *     character stands gives no Vision penalty (p. 15);
 *   - a muscle-powered generator while someone cranks it (p. 14).
 *
 * A flywheel (HT:EE p. 18) is a store: a gadget built for batteries runs on it
 * for as long as its share of the same size of battery's energy gives, in
 * proportion to the gadget's own batteries' weight (p. 10); a device printed
 * with the grade its peak output equals runs on the peak for up to two
 * minutes. It is spun up again on external power.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { powerData, storePower, tableCellOf } from "../../../shared/power/data.js";
import { registerPowerSource, type PowerSource } from "../../../shared/power/index.js";
import { cellsWeight, enduranceHours } from "../../../shared/power/rules.js";
import { tankLeft, type GeneratorFigures, type WindSpeed } from "./generators.js";
import type { PowerGrade } from "./grades.js";
import { FLYWHEEL_PEAK_MINUTES, flywheelFigures } from "./storage.js";

/** What this module keeps on a generator or flywheel as it runs: its flags. */
export interface GeneratorState {
  /** Running now: burning fuel, turning in the wind or the stream, or taking in sunlight. */
  running: boolean;
  /** The wind it turns in: "high", "low" (the supplement's two speeds; High-Tech's windmill takes either as windy), or "calm". */
  wind: "high" | "low" | "calm";
  /** Pounds of wood left in a steam engine's firebox from the last cord put in. */
  wood: number;
  /** Gallons of water a steam engine has used since it was last filled. */
  water: number;
  /** A flywheel's share of its full store drawn since it was last spun up, 0 to 1. */
  drawn: number;
}

/** A generator's or flywheel's state, with nothing missing. */
export function generatorState(item: any): GeneratorState {
  const s = item?.flags?.[MODULE_ID]?.generator ?? {};
  const wind = s.wind === "high" || s.wind === "low" || s.wind === "calm" ? s.wind : "high";
  return {
    running: s.running === true,
    wind,
    wood: Math.max(0, Number(s.wood) || 0),
    water: Math.max(0, Number(s.water) || 0),
    drawn: Math.min(1, Math.max(0, Number(s.drawn) || 0)),
  };
}

/** Writes part of a generator's state. */
export function storeGeneratorState(item: any, patch: Partial<GeneratorState>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`flags.${MODULE_ID}.generator.${key}`, value])));
}

/** Whether a generator is switched on and off (the Gear tab's Running box): all but the muscle-powered. */
export function runs(figures: GeneratorFigures): boolean {
  return figures.source !== "muscle";
}

/** What a source supplies to a gadget: its grades (null for none named) and the batteries it stands in for. */
export interface Supply {
  supplies: readonly string[] | null;
  standsFor: { size: string; cells: number } | null;
}

/**
 * What a generator supplies. High-Tech's own give "external power" (p. 14),
 * of no named grade. Where the supplement's switch is on, its figures say
 * (HT:EE pp. 17-18): the grades it supplies -- a wind generator's by the
 * wind -- or, for one that only stands in for batteries, those batteries.
 */
export function supplyOf(figures: GeneratorFigures, state: Pick<GeneratorState, "wind">, storageOn: boolean): Supply {
  const ee = storageOn || figures.volume === "ee" ? figures.ee : undefined;
  if (!ee) return { supplies: null, standsFor: null };
  if (ee.wind) return { supplies: state.wind === "calm" ? [] : ee.wind[state.wind as WindSpeed].supplies, standsFor: null };
  if (ee.supplies?.length) return { supplies: ee.supplies, standsFor: ee.standsFor ?? null };
  if (ee.standsFor) return { supplies: [], standsFor: ee.standsFor };
  return { supplies: null, standsFor: null };
}

/** Why a source gives power or doesn't, as a text key under GCC.HT.Power.SourceStatus and its data. */
export interface Availability {
  available: boolean;
  status: string;
  data?: Record<string, unknown>;
}

/**
 * Whether a generator gives power now. `hoursRun` is its tank's hours used;
 * `darkness` the Vision penalty for darkness where the character stands, or
 * null where it isn't read; `woodCarried` whether a cord of wood is carried
 * for a steam engine's firebox.
 */
export function availability(figures: GeneratorFigures, state: GeneratorState, hoursRun: number, darkness: number | null, woodCarried: boolean): Availability {
  if (!runs(figures)) return { available: true, status: "cranked" };
  // A dry tank says so whether or not it is switched on.
  if (figures.tank && tankLeft(figures.tank, hoursRun) <= 0) return { available: false, status: "empty" };
  if (!state.running) return { available: false, status: "off" };
  if (figures.tank) {
    const left = tankLeft(figures.tank, hoursRun);
    return left > 0 ? { available: true, status: "fuel", data: { left: Math.round(left * 10) / 10, hours: figures.tank.hours } } : { available: false, status: "empty" };
  }
  if (figures.burns) return state.wood > 0 || woodCarried ? { available: true, status: "burning", data: { wood: Math.round(state.wood) } } : { available: false, status: "noWood" };
  if (figures.source === "wind") return state.wind === "calm" ? { available: false, status: "calm" } : { available: true, status: state.wind === "low" && figures.ee?.wind ? "lowWind" : "wind" };
  if (figures.source === "solar") return darkness !== null && darkness < 0 ? { available: false, status: "dark", data: { darkness } } : { available: true, status: "sun" };
  return { available: true, status: "running" };
}

/** What running a generator some hours does: its tank's new hours, its firebox, the cords of wood it takes, the water it uses, and whether it stops. */
export interface RunResult {
  hoursRun: number;
  wood: number;
  cords: number;
  water: number;
  stopped: boolean;
}

/**
 * Runs a generator for some hours of world time (pp. 14, 16). A tank runs
 * down by the hour and the generator stops when it's dry. A steam engine
 * burns its wood and water by the hour, putting in a cord from what is
 * carried (`cordsCarried`, each `cordWeight` pounds) as the firebox empties,
 * and stops when there is no wood left. Others run as long as they're on.
 */
export function runGenerator(figures: GeneratorFigures, state: GeneratorState, hoursRun: number, hours: number, cordsCarried: number, cordWeight: number): RunResult {
  const h = Math.max(0, Number(hours) || 0);
  const out: RunResult = { hoursRun, wood: state.wood, cords: 0, water: state.water, stopped: false };
  if (figures.tank) {
    out.hoursRun = Math.min(figures.tank.hours, hoursRun + h);
    out.stopped = out.hoursRun >= figures.tank.hours;
    return out;
  }
  if (figures.burns) {
    let needed = figures.burns.wood * h;
    let burnt = h;
    let cordsLeft = Math.max(0, Math.floor(cordsCarried));
    const cord = Math.max(1, Number(cordWeight) || 1);
    while (needed > out.wood && cordsLeft > 0) {
      out.wood += cord;
      out.cords += 1;
      cordsLeft -= 1;
    }
    if (needed > out.wood) {
      // It burns what is in the firebox and goes out.
      burnt = figures.burns.wood > 0 ? out.wood / figures.burns.wood : h;
      needed = out.wood;
      out.stopped = true;
    }
    out.wood = Math.round((out.wood - needed) * 1000) / 1000;
    out.water = Math.round((out.water + figures.burns.water * burnt) * 1000) / 1000;
  }
  return out;
}

/** The book's record for a cord of wood (p. 16). */
export const WOOD_RECORD = "Wood (per cord)";

/** A cord's weight, from the record carried: 1-2 tons (p. 16), 2,000 lbs. on the record. */
export const CORD_WEIGHT = 2000;

/**
 * A flywheel as a store for a gadget (HT:EE p. 18): hours of the gadget's use
 * a full one holds. A gadget built for batteries runs on the flywheel's share
 * of its own size of battery's energy, in proportion to the weight of the
 * gadget's own batteries (p. 10): a Medium flywheel holds two-thirds of an M
 * battery. A device printed with the grade the flywheel's peak equals runs on
 * the peak for up to two minutes. Null where the gadget can't run on it.
 */
export function flywheelHours(flywheel: { size: string; material: unknown }, gadget: { endurance: number | null; cellWeight: number | null; grades: readonly string[] }, batteryWeight: (size: string) => number): number | null {
  const f = flywheelFigures(flywheel.size, flywheel.material);
  if (!f) return null;
  if (gadget.endurance !== null && gadget.cellWeight !== null && gadget.cellWeight > 0) {
    const stored = f.energy * batteryWeight(flywheel.size);
    return Math.round(gadget.endurance * (stored / gadget.cellWeight) * 1000) / 1000;
  }
  if (f.grade && (gadget.grades.includes(f.grade) || gadget.grades.includes("external"))) return FLYWHEEL_PEAK_MINUTES / 60;
  return null;
}

/** The grade a flywheel's peak output equals, for matching it to a device (HT:EE p. 18); none for the VL, which prints none. */
export function flywheelSupplies(size: string, material: unknown): PowerGrade[] {
  const grade = flywheelFigures(size, material)?.grade;
  return grade ? [grade] : [];
}

/** What the source registration needs from the book's power rules. */
export interface SourceDeps {
  generatorFor: (item: any) => GeneratorFigures | null;
  shown: (figures: GeneratorFigures) => boolean;
  storageOn: () => boolean;
  darkness: (actor: any) => number | null;
  statusText: (availability: Availability) => string;
  flywheelStatus: (drawn: number) => string;
}

const carried = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.system?.carried !== false);

/** Hours a generator has run on its tank: the power data's hours used. */
export const tankHours = (item: any): number => Math.max(0, Number(item?.system?.extensions?.[MODULE_ID]?.power?.hoursUsed) || 0);

/** The cords of wood an actor carries. */
function cordsOf(actor: any): any[] {
  return carried(actor).filter((i: any) => i.name === WOOD_RECORD && (Number(i.system?.quantity) || 0) > 0);
}

/** The generators and flywheels an actor carries, as sources for a gadget. */
export function highTechSources(actor: any, gadget: any, deps: SourceDeps): PowerSource[] {
  const gadgetData = powerData(gadget);
  const usual = tableCellOf(gadgetData);
  const figures = gadgetData.figures;
  const weightOf = (size: string) => (figures?.cells[size]?.weight ?? 0);
  const out: PowerSource[] = [];
  const darkness = () => deps.darkness(actor);
  for (const item of carried(actor)) {
    const generator = deps.generatorFor(item);
    if (generator && deps.shown(generator) && !generator.mechanical) {
      const state = generatorState(item);
      const supply = supplyOf(generator, state, deps.storageOn());
      const reading = availability(generator, state, tankHours(item), generator.source === "solar" ? darkness() : null, cordsOf(actor).length > 0);
      out.push({
        item,
        supplies: supply.supplies,
        standsForWeight: supply.standsFor ? weightOf(supply.standsFor.size) * supply.standsFor.cells : null,
        available: reading.available,
        status: deps.statusText(reading),
      });
      continue;
    }
    const stored = powerData(item).storage;
    if (deps.storageOn() && stored.kind === "flywheel" && item.id !== gadget?.id) {
      const hours = flywheelHours(stored, {
        endurance: enduranceHours(gadgetData.draw?.endurance),
        cellWeight: usual && figures ? cellsWeight(figures, usual.size, usual.cells) : null,
        grades: gadgetData.grades,
      }, weightOf);
      if (hours === null) continue;
      const state = generatorState(item);
      const left = Math.max(0, hours * (1 - state.drawn));
      out.push({
        item,
        // It fits whatever the rule above says it can run.
        supplies: null,
        standsForWeight: null,
        available: left > 0,
        status: deps.flywheelStatus(state.drawn),
        store: {
          left,
          total: hours,
          spend: (spent: number) => storeGeneratorState(item, { drawn: Math.min(1, Math.max(0, state.drawn + (Number(spent) || 0) / hours)) }),
        },
      });
    }
  }
  return out;
}

/** Registers the book's sources with the engine. */
export function registerHighTechSources(deps: SourceDeps, on: () => boolean): void {
  registerPowerSource((actor, gadget) => (on() ? highTechSources(actor, gadget, deps) : []));
}

/**
 * Runs every running generator an actor carries for some hours of world
 * time, and says so where one stops. Only the active GM's client calls it.
 */
export async function advanceGenerators(actor: any, hours: number, deps: Pick<SourceDeps, "generatorFor" | "shown">, say: (actor: any, item: any, line: string) => Promise<void>, api: GWorldApi | null, lines: { empty: (item: any) => string; noWood: (item: any) => string }): Promise<void> {
  if (!(hours > 0)) return;
  for (const item of carried(actor)) {
    const figures = deps.generatorFor(item);
    if (!figures || !deps.shown(figures) || !runs(figures)) continue;
    const state = generatorState(item);
    if (!state.running || (!figures.tank && !figures.burns)) continue;
    const cords = cordsOf(actor);
    const count = cords.reduce((n, c) => n + (Number(c.system?.quantity) || 0), 0);
    const cordWeight = Number(cords[0]?.system?.weight) || CORD_WEIGHT;
    const result = runGenerator(figures, state, tankHours(item), hours, count, cordWeight);
    let taken = result.cords;
    for (const cord of cords) {
      if (taken <= 0) break;
      const take = Math.min(taken, Number(cord.system?.quantity) || 0);
      if (api?.items?.changeQuantity) await api.items.changeQuantity(cord, -take, { reason: "steamEngine" } as never);
      else await cord.update({ "system.quantity": (Number(cord.system?.quantity) || 0) - take });
      taken -= take;
    }
    if (figures.tank) await storePower(item, { hoursUsed: result.hoursRun });
    await storeGeneratorState(item, { wood: result.wood, water: result.water, ...(result.stopped ? { running: false } : {}) });
    if (result.stopped) await say(actor, item, figures.tank ? lines.empty(item) : lines.noWood(item));
  }
}
