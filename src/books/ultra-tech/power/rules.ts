/**
 * Ultra-Tech's power cells (pp. 18-20, 133): what each size costs and weighs,
 * how long one takes to change, the kinds of cell that last longer or cost
 * more, rigging a gadget to run on smaller ones, and what one does when it
 * blows up.
 */

/** The cell sizes the book lists, smallest first (p. 18). */
export const CELL_SIZES = ["AA", "A", "B", "C", "D", "E", "F"] as const;
export type CellSize = (typeof CELL_SIZES)[number];

/** Each size's price, weight and Legality Class (p. 19); null LC where the book gives none. */
export const CELLS: Readonly<Record<CellSize, { cost: number; weight: number; lc: number | null }>> = Object.freeze({
  AA: { cost: 1, weight: 0.0005, lc: null },
  A: { cost: 2, weight: 0.005, lc: null },
  B: { cost: 3, weight: 0.05, lc: null },
  C: { cost: 10, weight: 0.5, lc: null },
  D: { cost: 100, weight: 5, lc: 4 },
  E: { cost: 2000, weight: 20, lc: 4 },
  F: { cost: 20000, weight: 200, lc: 4 },
});

export function isCellSize(value: unknown): value is CellSize {
  return typeof value === "string" && (CELL_SIZES as readonly string[]).includes(value);
}

/** What kind of cell a gadget is run on. */
export interface CellKind {
  /** Flat cells stuck on like stamps (p. 19). */
  flexible?: boolean;
  /** Twice the endurance or the shots, but never recharged (p. 19). */
  nonRechargeable?: boolean;
  /** Unlimited power to an ordinary device, at a hundred times the price (pp. 19-20). */
  cosmic?: boolean;
  /** The beam weapon option that multiplies its shots by 5 (p. 133). */
  superscience?: boolean;
}

/** Flexible AA and A cells cost the usual; the larger ones four times as much (p. 19). */
export const FLEXIBLE_COST = 4;
/** "100 times as expensive" (p. 19). */
export const COSMIC_COST = 100;
/** Non-rechargeable cells "last twice as long, or provide twice as many shots" (p. 19). */
export const NON_RECHARGEABLE = 2;
/** The superscience power cell "multiplies the weapon's number of shots by 5" (p. 133). */
export const SUPERSCIENCE_SHOTS = 5;

/** One cell's price, by its size and kind. */
export function cellCost(size: CellSize, kind: CellKind = {}): number {
  let cost = CELLS[size].cost;
  if (kind.flexible && size !== "AA" && size !== "A") cost *= FLEXIBLE_COST;
  if (kind.cosmic) cost *= COSMIC_COST;
  return cost;
}

/** A cell's Legality Class: cosmic cells are LC2, or LC1 for E and F (p. 19). */
export function cellLegality(size: CellSize, kind: CellKind = {}): number | null {
  if (kind.cosmic) return size === "E" || size === "F" ? 1 : 2;
  return CELLS[size].lc;
}

/**
 * Seconds to change a cell (p. 19): three for A, B and C, five for the tiny AA
 * and the heavy D and E, twenty for F.
 */
export function replacementSeconds(size: CellSize): number {
  if (size === "F") return 20;
  if (size === "AA" || size === "D" || size === "E") return 5;
  return 3;
}

/** How much longer a kind of cell lasts, or null for as long as it's wanted. */
export function enduranceMultiplier(kind: CellKind = {}): number | null {
  if (kind.cosmic) return null;
  return kind.nonRechargeable ? NON_RECHARGEABLE : 1;
}

/** How many more shots a kind of cell gives a weapon, or null for no count at all. */
export function shotsMultiplier(kind: CellKind = {}): number | null {
  if (kind.cosmic) return null;
  return (kind.nonRechargeable ? NON_RECHARGEABLE : 1) * (kind.superscience ? SUPERSCIENCE_SHOTS : 1);
}

/** Hours in each unit the book's endurance figures use. */
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

/** How long is left, in the book's own terms. */
export function hoursText(hours: number): { value: number; unit: "hr" | "day" | "wk" } {
  if (hours >= 24 * 7 * 2) return { value: Math.round((hours / (24 * 7)) * 10) / 10, unit: "wk" };
  if (hours >= 48) return { value: Math.round((hours / 24) * 10) / 10, unit: "day" };
  return { value: Math.round(hours * 10) / 10, unit: "hr" };
}

/**
 * Cells one size smaller that stand in for one of this size: ten for each
 * step down, so a D cell takes 10 C cells or 100 B cells (p. 19).
 */
export function substituteCells(size: CellSize, smaller: CellSize): number | null {
  const steps = CELL_SIZES.indexOf(size) - CELL_SIZES.indexOf(smaller);
  return steps > 0 ? 10 ** steps : null;
}

/** Rigging the substitute is Electrician-2 and ten minutes a try; a critical failure damages the gadget (p. 19). */
export const JURY_RIG = Object.freeze({ skill: "Electrician", modifier: -2, minutes: 10 });

/** An exploding cell's relative explosive force by TL (p. 19), and a cosmic cell's (p. 20). */
export const CELL_REF: Readonly<Record<number, number>> = Object.freeze({ 9: 1 / 8, 10: 1 / 2, 11: 2, 12: 4 });
export const COSMIC_REF = 5000;

/** The REF of a cell of this TL, held at the ends of the book's list. */
export function cellRef(tl: number, kind: CellKind = {}): number {
  if (kind.cosmic) return COSMIC_REF;
  const level = Math.round(Number(tl) || 0);
  if (level <= 9) return CELL_REF[9]!;
  if (level >= 12) return CELL_REF[12]!;
  return CELL_REF[level]!;
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

/** What an exploding cell does: dice of crushing explosive damage. */
export function explodingCell(options: { size: CellSize; cells?: number; tl: number; kind?: CellKind }): { dice: number; ref: number; weight: number } {
  const weight = CELLS[options.size].weight * Math.max(1, Math.floor(options.cells ?? 1));
  const ref = cellRef(options.tl, options.kind);
  const multiple = explosionMultiple(weight, ref);
  return { dice: Math.round(6 * multiple * 10) / 10, ref, weight };
}
