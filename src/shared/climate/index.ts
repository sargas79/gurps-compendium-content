/**
 * Climate-control gear as the system meets it: each book registers its table
 * of gear and the degrees each piece adds to the comfort zone, and while it is
 * worn -- and, for a powered piece, while its power lasts -- the wearer's
 * `temperatureTolerance` is widened through `gworld.traitEffects`, which the
 * system's cold and heat rolls read (Campaigns pp. 430, 434).
 *
 * A book's item takes its own book's table and needs only that book's switch;
 * gear made by hand takes a switched-on book's (see `book-tables.ts`).
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { powerData } from "../power/data.js";
import { enduranceLeft } from "../power/index.js";
import { widenComfortZone, type ComfortZone } from "./rules.js";

export { COMFORT_ZONE, climateTolerance, widenComfortZone, type ComfortZone } from "./rules.js";

/** One piece of climate-control gear in a book's table. */
export interface ClimateGear {
  /** Its name without the TL a table adds to it. */
  pattern: RegExp;
  /** The degrees it adds to each end of the comfort zone. */
  zone: ComfortZone;
  /** Runs on power: it gives the zone only while its cells last. */
  powered?: boolean;
}

/** One book's climate-control gear. */
export interface ClimateTable extends BookTable {
  /** The full key of the book's switch for it. */
  rule: string;
  gear: readonly ClimateGear[];
}

/** Every book's climate-control table. */
export const CLIMATE_TABLES = new BookTables<ClimateTable>();

/** A name without the TL a table adds to it: "Heated Clothing (TL8)" is "Heated Clothing". */
function baseName(name: unknown): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

/** A piece's climate-control entry, where its book's switch is on, or null. */
export function climateGearOf(item: any, on: (key: string) => boolean = isRuleOn): ClimateGear | null {
  const table = CLIMATE_TABLES.forItem(item, (t) => on(t.rule));
  if (!table) return null;
  const name = baseName(item?.name);
  return table.gear.find((g) => g.pattern.test(name)) ?? null;
}

/** Whether a piece is worn: carried and in use. */
export function isWorn(item: any): boolean {
  return item?.system?.carried !== false && item?.system?.equipped === true;
}

/**
 * Whether a powered piece is running: its cells aren't spent. A piece with no
 * endurance to track -- on external power, or with its power left untracked --
 * runs.
 */
export function isRunning(item: any): boolean {
  const left = enduranceLeft(powerData(item));
  return !(left && left !== "unlimited" && left.left <= 0);
}

/** The worn climate-control gear that is working now, with what each adds. */
export function workingClimateGear(actor: any, on: (key: string) => boolean = isRuleOn): Array<{ item: any; gear: ClimateGear }> {
  const working: Array<{ item: any; gear: ClimateGear }> = [];
  for (const item of actor?.items ?? []) {
    if (!isWorn(item)) continue;
    const gear = climateGearOf(item, on);
    if (gear && (!gear.powered || isRunning(item))) working.push({ item, gear });
  }
  return working;
}

let listening = false;

/** Widens the wearer's comfort zone for their working gear, once whichever books ask. */
export function readyClimate(): void {
  if (listening) return;
  listening = true;
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!context?.actor || !context.effects) return;
    for (const { item, gear } of workingClimateGear(context.actor)) widenComfortZone(context, gear.zone, String(item.name ?? ""));
  });
}

/** Forgets the listener. For tests. */
export function resetClimate(): void {
  listening = false;
}
