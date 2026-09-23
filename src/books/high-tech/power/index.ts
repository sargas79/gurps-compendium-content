/**
 * GURPS High-Tech's batteries (p. 13): the book's sizes, with what each costs
 * and weighs, as its table for the shared cell engine.
 *
 * The book prints a gadget's batteries as a size and an endurance -- "2×S/5
 * hrs." -- in sizes of its own, T to VL. The captured records carry them in
 * the module's power data, whose cell field accepts the sizes of every book
 * that registers a table, so High-Tech registers its table here to have its
 * records' batteries read at all.
 *
 * Only the sizes are the book's so far. Its switch, `batteries`, isn't
 * registered: until #358 does, and reads the rest of the rule (rechargeables,
 * swapping sizes, inverters, pp. 13-16), the switch is off and nothing but the
 * data is used. The figures the engine's rules would read are left inert.
 */

import { CELL_TABLES, initPower, type CellTable } from "../../../shared/power/index.js";
import type { Cell, CellFigures } from "../../../shared/power/rules.js";
import { MODULE_ID } from "../../../shared/module.js";

/** The battery sizes the book lists, smallest first (p. 13). */
export const BATTERY_SIZES = ["T", "XS", "S", "M", "L", "VL"] as const;

/** Each size's price, weight and Legality Class, for non-rechargeable batteries (p. 13). */
export const BATTERIES: Readonly<Record<(typeof BATTERY_SIZES)[number], Cell>> = Object.freeze({
  T: { cost: 0.25, weight: 0.02, lc: 4 },
  XS: { cost: 0.5, weight: 0.1, lc: 4 },
  S: { cost: 1, weight: 0.33, lc: 4 },
  M: { cost: 5, weight: 2, lc: 4 },
  L: { cost: 10, weight: 10, lc: 4 },
  VL: { cost: 20, weight: 50, lc: 4 },
});

/**
 * High-Tech's figures as the engine takes them. Beyond the sizes, nothing is
 * read yet: no replacement times, no flexible or cosmic cells (Ultra-Tech's),
 * and multipliers of one. #358 fills them in before it registers the switch.
 */
export const HIGH_TECH_BATTERIES: CellFigures = Object.freeze({
  sizes: BATTERY_SIZES,
  cells: BATTERIES,
  replacementSeconds: Object.freeze({}),
  flexible: Object.freeze({ cost: 1, fullPrice: [] }),
  cosmic: Object.freeze({ cost: 1, lc: Object.freeze({}), ref: 0 }),
  nonRechargeable: 1,
  superscienceShots: 1,
  substitutePerStep: 1,
  juryRig: Object.freeze({ skill: "", modifier: 0, minutes: 0 }),
  ref: Object.freeze({}),
});

/** The key #358 registers the book's battery switch under; unregistered, it reads as off. */
export const BATTERIES_RULE = `${MODULE_ID}.batteries`;

/** High-Tech's battery table, for the book's gear at TL5-8. */
export function highTechBatteries(): CellTable {
  return { book: "high-tech", tls: { min: 5, max: 8 }, figures: HIGH_TECH_BATTERIES, rule: BATTERIES_RULE, i18n: "GCC.HT" };
}

/** Registers the table and the power fields, so the book's records keep their batteries. */
export function initHighTechPower(): void {
  CELL_TABLES.register(highTechBatteries());
  initPower();
}
