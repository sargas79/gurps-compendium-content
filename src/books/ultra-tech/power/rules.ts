/**
 * Ultra-Tech's power cells (pp. 18-20, 133): what each size costs and weighs,
 * how long one takes to change, the kinds of cell that last longer or cost
 * more, rigging a gadget to run on smaller ones, and what one does when it
 * blows up.
 *
 * The rule is the shared cell engine's (`src/shared/power/`), which other
 * books print too; this is Ultra-Tech's table for it, and the engine's
 * functions with this book's figures.
 */

import * as engine from "../../../shared/power/rules.js";
import type { Cell, CellFigures, CellKind } from "../../../shared/power/rules.js";

export { enduranceHours, enduranceUses, explosionMultiple, hoursText, type CellKind } from "../../../shared/power/rules.js";

/** The cell sizes the book lists, smallest first (p. 18). */
export const CELL_SIZES = ["AA", "A", "B", "C", "D", "E", "F"] as const;
export type CellSize = (typeof CELL_SIZES)[number];

/** Each size's price, weight and Legality Class (p. 19); null LC where the book gives none. */
export const CELLS: Readonly<Record<CellSize, Cell>> = Object.freeze({
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

/** Flexible AA and A cells cost the usual; the larger ones four times as much (p. 19). */
export const FLEXIBLE_COST = 4;
/** "100 times as expensive" (p. 19). */
export const COSMIC_COST = 100;
/** Non-rechargeable cells "last twice as long, or provide twice as many shots" (p. 19). */
export const NON_RECHARGEABLE = 2;
/** The superscience power cell "multiplies the weapon's number of shots by 5" (p. 133). */
export const SUPERSCIENCE_SHOTS = 5;

/** Rigging the substitute is Electrician-2 and ten minutes a try; a critical failure damages the gadget (p. 19). */
export const JURY_RIG = Object.freeze({ skill: "Electrician", modifier: -2, minutes: 10 });

/** An exploding cell's relative explosive force by TL (p. 19), and a cosmic cell's (p. 20). */
export const CELL_REF: Readonly<Record<number, number>> = Object.freeze({ 9: 1 / 8, 10: 1 / 2, 11: 2, 12: 4 });
export const COSMIC_REF = 5000;

/** Ultra-Tech's figures, as the shared cell engine takes them. */
export const POWER_CELLS: CellFigures = Object.freeze({
  sizes: CELL_SIZES,
  cells: CELLS,
  // Three seconds for A, B and C, five for the tiny AA and the heavy D and E, twenty for F (p. 19).
  replacementSeconds: Object.freeze({ AA: 5, A: 3, B: 3, C: 3, D: 5, E: 5, F: 20 }),
  flexible: Object.freeze({ cost: FLEXIBLE_COST, fullPrice: ["AA", "A"] }),
  // Cosmic cells are LC2, or LC1 for E and F (p. 19).
  cosmic: Object.freeze({ cost: COSMIC_COST, lc: Object.freeze({ AA: 2, A: 2, B: 2, C: 2, D: 2, E: 1, F: 1 }), ref: COSMIC_REF }),
  nonRechargeable: NON_RECHARGEABLE,
  superscienceShots: SUPERSCIENCE_SHOTS,
  // Ten for each step down, so a D cell takes 10 C cells or 100 B cells (p. 19).
  substitutePerStep: 10,
  juryRig: JURY_RIG,
  ref: CELL_REF,
  kinds: ["flexible", "nonRechargeable", "cosmic", "superscience"] as const,
});

/** One cell's price, by its size and kind. */
export const cellCost = (size: CellSize, kind: CellKind = {}): number => engine.cellCost(POWER_CELLS, size, kind);

/** A cell's Legality Class: cosmic cells are LC2, or LC1 for E and F (p. 19). */
export const cellLegality = (size: CellSize, kind: CellKind = {}): number | null => engine.cellLegality(POWER_CELLS, size, kind);

/** Seconds to change a cell (p. 19). */
export const replacementSeconds = (size: CellSize): number | null => engine.replacementSeconds(POWER_CELLS, size);

/** How much longer a kind of cell lasts, or null for as long as it's wanted. */
export const enduranceMultiplier = (kind: CellKind = {}): number | null => engine.enduranceMultiplier(POWER_CELLS, kind);

/** How many more shots a kind of cell gives a weapon, or null for no count at all. */
export const shotsMultiplier = (kind: CellKind = {}): number | null => engine.shotsMultiplier(POWER_CELLS, kind);

/** Cells smaller that stand in for one of this size (p. 19). */
export const substituteCells = (size: CellSize, smaller: CellSize): number | null => engine.substituteCells(POWER_CELLS, size, smaller);

/** The REF of a cell of this TL, held at the ends of the book's list. */
export const cellRef = (tl: number, kind: CellKind = {}): number => engine.cellRef(POWER_CELLS, tl, kind);

/** What an exploding cell does: dice of crushing explosive damage. */
export const explodingCell = (options: { size: CellSize; cells?: number; tl: number; kind?: CellKind }) => engine.explodingCell(POWER_CELLS, options);
