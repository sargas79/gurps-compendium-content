/**
 * Firearm accessories kept as items of their own and fitted to a gun, for
 * every book that prints them as records: each book registers a catalogue in
 * `ACCESSORY_TABLES` that says, by a record's name, what kind of accessory it
 * is and its figures. A book's record takes its own book's catalogue and needs
 * only that book's switches; an item from no book (one made by hand) takes a
 * switched-on book's.
 *
 * Ultra-Tech keeps its accessories as fields on the weapon instead
 * (Ultra-Tech pp. 149-152) and registers no catalogue; the rules both books
 * read are in `rules.ts`.
 */

import { BookTables, type BookTable } from "../book-tables.js";

export * from "./rules.js";

/** What an accessory is, as far as the rules go. */
export type AccessoryKind =
  | "scope"
  | "reflexSight"
  | "visibilitySights"
  | "nightSight"
  | "thermalSight"
  | "computerSight"
  | "targetingLaser"
  | "suppressor"
  | "pistolStock"
  | "foldingStock"
  | "bipod"
  | "shootingSticks";

export type SuppressorDesign = "baffle" | "wiper";

/** One catalogue entry's figures. Anything a kind doesn't use is left out. */
export interface AccessoryFigures {
  kind: AccessoryKind;
  /** A record priced per level: per +1 Acc (a scope) or per -1 Hearing (a suppressor). */
  levels?: { min: number; max: number };
  /** A scope that must be aimed for its whole bonus (fixed-power), rather than losing a point a second short. */
  fixed?: boolean;
  /** A sight's bonus to an aimed shot, beside the scope's. */
  accuracy?: number;
  /** What it adds to the weapon's Bulk (negative). */
  bulk?: number;
  /** The vision it gives while the shooter looks through it. */
  nightVision?: number;
  infravision?: boolean;
  /** Whether looking through it leaves the shooter colorblind with tunnel vision. */
  imposesTunnelVision?: boolean;
  /** An add-on that works through another scope or sight rather than on its own. */
  addOn?: boolean;
  /** How far it helps, in yards: a laser's dot, a reflex sight's reach, a rangefinder's. */
  yards?: number;
  /** A computer sight: its targeting program's skill bonus, its rangefinder's aimed bonus and its magnification's most. */
  program?: number;
  rangefinder?: number;
  magnification?: number;
  /** A computer sight's price with Night Vision rather than Infravision. */
  nightVisionCost?: number;
  /** A suppressor's design, the damage and range left to the bullet, and how many shots it lasts (0 for many). */
  suppressor?: { design: SuppressorDesign; damage: number; range: number; shots: number };
  /** Whether it fits only a sidearm or only a shoulder arm. */
  fits?: "sidearm" | "shoulder";
}

/** One book's catalogue. */
export interface AccessoryTable extends BookTable {
  /** Whether any of the book's accessory switches is on. */
  on: () => boolean;
  /** The figures for a record of this name, or null for anything else. */
  figures(name: string): AccessoryFigures | null;
}

/** Every book's accessory catalogue. */
export const ACCESSORY_TABLES = new BookTables<AccessoryTable>();

/** What an item is as an accessory, by the catalogue whose rule applies to it, or null. */
export function accessoryOf(item: any): { table: AccessoryTable; figures: AccessoryFigures } | null {
  if (item?.type !== "equipment") return null;
  const table = ACCESSORY_TABLES.forItem(item, (t) => t.on());
  const figures = table?.figures(String(item?.name ?? "")) ?? null;
  return table && figures ? { table, figures } : null;
}
