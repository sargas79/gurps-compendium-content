/**
 * GURPS Ultra-Tech's power cells (pp. 18-20, 133): the book's table for the
 * shared cell engine, which does the rest -- a weapon's shots by the kind of
 * cell loaded, the Gear tab's tracking of each gadget's endurance, and the
 * item sheet section for the kind of cell, rigging it to smaller ones and what
 * the cells do if they explode.
 */

import { CELL_TABLES, initPower, readyPower, type CellTable } from "../../../shared/power/index.js";
import type { GWorldApi } from "../../../shared/module.js";
import { POWER_CELLS } from "./rules.js";

/** Ultra-Tech's cell table, behind the book's own switch (its full key). */
export function ultraTechCells(rule: string): CellTable {
  return { book: "ultra-tech", tls: { min: 9, max: 12 }, figures: POWER_CELLS, rule, i18n: "GCC.UT" };
}

/** Registers the table, and what must exist before the world's data is read. */
export function initUltraTechPower(rule: string): void {
  CELL_TABLES.register(ultraTechCells(rule));
  initPower();
}

/** Registers the table-side parts, if no other book has yet. */
export function readyUltraTechPower(api: GWorldApi): void {
  readyPower(api);
}
