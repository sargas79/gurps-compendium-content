/**
 * Power cells, as the books that print them price them (Ultra-Tech pp. 18-20,
 * 133; High-Tech's batteries, pp. 13-14, are the same rule at its TLs): what
 * each size costs and weighs, how long one takes to change, the kinds of cell
 * that last longer or cost more, rigging a gadget to run on smaller ones or
 * swapping its size for another, and what one does when it blows up.
 *
 * Every figure comes from the book's table (`CellFigures`); this file holds
 * the arithmetic, and the reading of endurances the tables print.
 */

/** One size of cell: its price, weight and Legality Class, null where the book gives none. */
export interface Cell {
  cost: number;
  weight: number;
  lc: number | null;
}

/** What kind of cell a gadget is run on. */
export interface CellKind {
  /** Flat cells stuck on like stamps. */
  flexible?: boolean;
  /** Longer-lasting cells that are never recharged. */
  nonRechargeable?: boolean;
  /** Unlimited power to an ordinary device. */
  cosmic?: boolean;
  /** The beam weapon option that multiplies its shots. */
  superscience?: boolean;
  /** Cells that can be recharged, where the book prices its cells as throwaways. */
  rechargeable?: boolean;
}

/** The kinds of cell a book offers, in the order its sheet lists them. */
export type CellKindKey = keyof CellKind;

/** One book's figures for its cells. */
export interface CellFigures {
  /** The sizes, smallest first. */
  sizes: readonly string[];
  cells: Readonly<Record<string, Cell>>;
  /** Seconds to change a cell, by size. */
  replacementSeconds: Readonly<Record<string, number>>;
  /** What flexible cells multiply the price by, and the sizes that cost the usual. */
  flexible: Readonly<{ cost: number; fullPrice: readonly string[] }>;
  /** A cosmic cell's multiple of the price, its LC by size, and its REF. */
  cosmic: Readonly<{ cost: number; lc: Readonly<Record<string, number>>; ref: number }>;
  /** How much longer non-rechargeable cells last, and how many more shots they give. */
  nonRechargeable: number;
  /** How many more shots a superscience cell gives a beam weapon. */
  superscienceShots: number;
  /** How many cells one size smaller stand in for one of a size. */
  substitutePerStep: number;
  /** Rigging a gadget to smaller cells: the skill, its modifier and the minutes a try; null where the book has no such rule. */
  juryRig: Readonly<{ skill: string; modifier: number; minutes: number }> | null;
  /** An exploding cell's relative explosive force by TL, held at the ends; empty where the book gives none. */
  ref: Readonly<Record<number, number>>;
  /** The kinds of cell the book offers on a gadget's sheet. */
  kinds: readonly CellKindKey[];
  /** What rechargeable cells multiply the price by, where the book's prices are for throwaway ones. */
  rechargeable?: number;
  /** Whether a gadget may take any size and number of cells, its endurance in proportion to their weight. */
  swapByWeight?: boolean;
  /**
   * Power adapters and inverters, where the book has them: the smallest size
   * an inverter takes. An adapter lets a gadget run on external power; an
   * inverter lets one built for external power run on cells.
   */
  adapters?: Readonly<{ inverterMin: string }>;
  /** The name of the book's record for a spare cell, "{size}" standing for the size: changing cells uses carried ones up. */
  spareRecord?: string;
}

export function isCellSizeOf(figures: CellFigures, value: unknown): value is string {
  return typeof value === "string" && figures.sizes.includes(value);
}

/** One cell's price, by its size and kind. */
export function cellCost(figures: CellFigures, size: string, kind: CellKind = {}): number {
  let cost = figures.cells[size]!.cost;
  if (kind.flexible && !figures.flexible.fullPrice.includes(size)) cost *= figures.flexible.cost;
  if (kind.cosmic) cost *= figures.cosmic.cost;
  if (kind.rechargeable && figures.rechargeable) cost *= figures.rechargeable;
  return cost;
}

/** A cell's Legality Class, a cosmic cell's by its size. */
export function cellLegality(figures: CellFigures, size: string, kind: CellKind = {}): number | null {
  if (kind.cosmic) return figures.cosmic.lc[size] ?? null;
  return figures.cells[size]!.lc;
}

/** Seconds to change a cell, or null where the book gives no time. */
export function replacementSeconds(figures: CellFigures, size: string): number | null {
  return figures.replacementSeconds[size] ?? null;
}

/** How much longer a kind of cell lasts, or null for as long as it's wanted. */
export function enduranceMultiplier(figures: CellFigures, kind: CellKind = {}): number | null {
  if (kind.cosmic) return null;
  return kind.nonRechargeable ? figures.nonRechargeable : 1;
}

/** How many more shots a kind of cell gives a weapon, or null for no count at all. */
export function shotsMultiplier(figures: CellFigures, kind: CellKind = {}): number | null {
  if (kind.cosmic) return null;
  return (kind.nonRechargeable ? figures.nonRechargeable : 1) * (kind.superscience ? figures.superscienceShots : 1);
}

/** Cells of a smaller size that stand in for one of this size, or null where it isn't smaller. */
export function substituteCells(figures: CellFigures, size: string, smaller: string): number | null {
  const steps = figures.sizes.indexOf(size) - figures.sizes.indexOf(smaller);
  return steps > 0 ? figures.substitutePerStep ** steps : null;
}

/** The weight of a number of cells of a size, in pounds. */
export function cellsWeight(figures: CellFigures, size: string, cells: number): number {
  return figures.cells[size]!.weight * Math.max(0, cells);
}

/**
 * What running a gadget on other cells multiplies its endurance by: the new
 * cells' weight over the old (High-Tech pp. 10, 13). An S battery weighs 3.3
 * times an XS, so a gadget moved from one to the other runs 3.3 times as
 * long. Null where either weight is nothing.
 */
export function enduranceByWeight(fromWeight: number, toWeight: number): number | null {
  const before = Math.max(0, Number(fromWeight) || 0);
  const after = Math.max(0, Number(toWeight) || 0);
  return before > 0 && after > 0 ? after / before : null;
}

/** What swapping a gadget's cells for others of a size and number multiplies its endurance by. */
export function swappedEndurance(figures: CellFigures, from: { size: string; cells: number }, to: { size: string; cells: number }): number | null {
  return enduranceByWeight(cellsWeight(figures, from.size, from.cells), cellsWeight(figures, to.size, to.cells));
}

/** Whether the book prints a REF for exploding cells. */
export function hasCellRef(figures: CellFigures): boolean {
  return Object.keys(figures.ref).length > 0;
}

/** The REF of a cell of this TL, held at the ends of the book's list. */
export function cellRef(figures: CellFigures, tl: number, kind: CellKind = {}): number {
  if (kind.cosmic) return figures.cosmic.ref;
  const keys = Object.keys(figures.ref).map(Number).sort((a, b) => a - b);
  const level = Math.min(keys.at(-1)!, Math.max(keys[0]!, Math.round(Number(tl) || 0)));
  return figures.ref[level]!;
}

/** What an exploding cell does: dice of crushing explosive damage. */
export function explodingCell(figures: CellFigures, options: { size: string; cells?: number; tl: number; kind?: CellKind }): { dice: number; ref: number; weight: number } {
  const weight = figures.cells[options.size]!.weight * Math.max(1, Math.floor(options.cells ?? 1));
  const ref = cellRef(figures, options.tl, options.kind);
  const multiple = explosionMultiple(weight, ref);
  return { dice: Math.round(6 * multiple * 10) / 10, ref, weight };
}

/**
 * An explosive's damage from its weight and REF (Campaigns p. 415): 6d times
 * the square root of four times the weight in pounds times the REF. Given here
 * as the multiple of 6d, to the tenth.
 */
export function explosionMultiple(weightLbs: number, ref: number): number {
  const w = Math.max(0, Number(weightLbs) || 0);
  return Math.round(Math.sqrt(w * 4 * Math.max(0, ref)) * 10) / 10;
}

/** Hours in each unit the books' endurance figures use. */
const HOURS: ReadonlyArray<[RegExp, number]> = [
  [/^(?:s|sec|secs|second|seconds)\.?$/i, 1 / 3600],
  [/^(?:min|mins|minute|minutes)\.?$/i, 1 / 60],
  [/^(?:h|hr|hrs|hour|hours)\.?$/i, 1],
  [/^(?:d|day|days)\.?$/i, 24],
  [/^(?:wk|wks|week|weeks)\.?$/i, 24 * 7],
  [/^(?:mo|mon|month|months)\.?$/i, 24 * 30],
  [/^(?:yr|yrs|year|years)\.?$/i, 24 * 365],
];

/**
 * An endurance as the tables print it -- "8 hr.", "1 wk", "2 days" -- in
 * hours, or null where it isn't a time this reads.
 */
export function enduranceHours(text: string | null | undefined): number | null {
  const m = /^\s*([\d,.]+)\s*([a-z.]+)\s*$/i.exec(String(text ?? ""));
  if (!m) return null;
  const amount = Number(m[1]!.replace(/,/g, ""));
  const unit = HOURS.find(([pattern]) => pattern.test(m[2]!));
  if (!unit || !Number.isFinite(amount) || amount <= 0) return null;
  return amount * unit[1];
}

/** How long is left, in the books' own terms. */
export function hoursText(hours: number): { value: number; unit: "hr" | "day" | "wk" } {
  if (hours >= 24 * 7 * 2) return { value: Math.round((hours / (24 * 7)) * 10) / 10, unit: "wk" };
  if (hours >= 48) return { value: Math.round((hours / 24) * 10) / 10, unit: "day" };
  return { value: Math.round(hours * 10) / 10, unit: "hr" };
}

/** What an endurance may be counted in besides time: uses, and High-Tech's tests, readings and quarts. */
export const COUNTED_UNITS = ["uses", "tests", "readings", "quarts"] as const;
export type CountedUnit = (typeof COUNTED_UNITS)[number];

const COUNTED = /^\s*([\d,]+)\s*(uses?|tests?|readings?|quarts?)\.?\s*$/i;

/**
 * An endurance counted in uses, as Ultra-Tech's stasis gear's "C/10 uses"
 * (p. 194), or in what a gadget does with each: High-Tech's clinical
 * analyzer's "300 tests" (p. 223), a thermometer's "1,000 readings" (p. 222),
 * a water purifier's "200 quarts" (p. 59). The number, or null.
 */
export function enduranceUses(text: string | null | undefined): number | null {
  const m = COUNTED.exec(String(text ?? ""));
  if (!m) return null;
  const uses = Number(m[1]!.replace(/,/g, ""));
  return Number.isFinite(uses) && uses > 0 ? uses : null;
}

/** What a counted endurance counts ("uses", "tests", "readings", "quarts"), or null for one that isn't counted. */
export function enduranceUnit(text: string | null | undefined): CountedUnit | null {
  const m = COUNTED.exec(String(text ?? ""));
  if (!m) return null;
  const word = m[2]!.toLowerCase();
  return COUNTED_UNITS.find((unit) => unit.startsWith(word.replace(/s$/, ""))) ?? null;
}
