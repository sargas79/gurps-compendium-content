/**
 * Ultra-Tech's gadgets: the options a gadget is built with, the statistics it
 * is assumed to have, what it costs a character of another size, and how old
 * age makes it legal (pp. 14-17).
 *
 * The rule is the shared gadget engine's (`src/shared/gadgets/`), which other
 * books print too; this is Ultra-Tech's table for it, and the engine's
 * functions with this book's figures.
 */

import * as engine from "../../../shared/gadgets/rules.js";
import type { Build, Disguise, GadgetFigures, GadgetOptions, Grade } from "../../../shared/gadgets/rules.js";

export { NO_OPTIONS, type Build, type Disguise, type GadgetOptions, type Grade } from "../../../shared/gadgets/rules.js";

/** "Double the cost for a mass-produced disguised item; multiply cost by 5 for a custom-built one" (p. 15). */
export const DISGUISE_COST: Readonly<Record<Disguise, number>> = { "": 1, massProduced: 2, custom: 5 };

/** Styling costs "2 to 10 times as much depending on the complexity" (p. 15). */
export const STYLING_RANGE = Object.freeze({ least: 2, most: 10 });

/** Rugged: "+2 HT bonus and ... twice its normal DR. Add 20% to weight and double the cost" (p. 15). */
export const RUGGED = Object.freeze({ cost: 2, weight: 1.2, health: 2, dr: 2 });

/** Cheap is half price at 1.5 times the weight, expensive twice the price at 2/3 (p. 15). */
export const GRADE_COST: Readonly<Record<Grade, number>> = { "": 1, cheap: 0.5, expensive: 2 };
export const GRADE_WEIGHT: Readonly<Record<Grade, number>> = { "": 1, cheap: 1.5, expensive: 2 / 3 };

/**
 * What a gadget's weight, cost and power cells are multiplied by for a user of
 * this Size Modifier (p. 16).
 *
 * The book's table prints its first rows as SM -3, -2, -2 and -1; the errata
 * corrects them to SM -4, -3, -2 and -1, so ×1/20 is SM -4, ×1/10 SM -3 and
 * ×1/5 SM -2.
 */
export const SM_FACTORS: Readonly<Record<number, number>> = Object.freeze({
  [-4]: 1 / 20,
  [-3]: 1 / 10,
  [-2]: 1 / 5,
  [-1]: 1 / 2,
  0: 1,
  1: 2,
  2: 5,
  3: 10,
  4: 20,
  5: 50,
  6: 100,
  7: 200,
  8: 500,
  9: 1000,
  10: 2000,
});

/** "Most gadgets are made of plastic with DR 2. Weapons are normally DR 4, or DR 6 for solid metal melee weapons" (p. 17). */
export const TYPICAL_DR: Readonly<Record<Exclude<Build, "own">, number>> = { plastic: 2, weapon: 4, solidMelee: 6 };

/** "A gadget is assumed to have HT 10 unless otherwise noted. Rugged gadgets are HT 12" (p. 17). */
export const ASSUMED_HEALTH = 10;

/** Below this much, "the GM may assume it's so simple that it will work indefinitely" (p. 14). */
export const MAINTENANCE_THRESHOLDS: Readonly<Record<number, number>> = Object.freeze({ 9: 30, 10: 50, 11: 75, 12: 100 });

/** How far an antique's Legality Class may rise: "to a maximum of 2 beyond its starting LC (up to LC4)" (p. 14). */
export const MOST_ANTIQUE_STEPS = 2;
export const HIGHEST_LC = 4;

/** Ultra-Tech's figures, as the shared gadget engine takes them. */
export const GADGETS: GadgetFigures = Object.freeze({
  disguiseCost: DISGUISE_COST,
  styling: STYLING_RANGE,
  rugged: RUGGED,
  gradeCost: GRADE_COST,
  gradeWeight: GRADE_WEIGHT,
  smFactors: SM_FACTORS,
  typicalDr: TYPICAL_DR,
  assumedHealth: ASSUMED_HEALTH,
  maintenance: MAINTENANCE_THRESHOLDS,
  antique: Object.freeze({ steps: MOST_ANTIQUE_STEPS, highestLc: HIGHEST_LC }),
});

/** Styling's multiplier, which is 1 until it is at least the least the book charges. */
export const stylingCost = (styling: number): number => engine.stylingCost(GADGETS, styling);

/** What the options multiply the price by. */
export const costFactor = (options: GadgetOptions): number => engine.costFactor(GADGETS, options);

/** An option-built gadget's price and weight from its list figures; cheap and expensive leave the cells out (p. 15). */
export const gadgetPrice = (figures: Parameters<typeof engine.gadgetPrice>[1]) => engine.gadgetPrice(GADGETS, figures);

/** The factor for a Size Modifier, held at the ends of the table (p. 16). */
export const smFactor = (sm: number): number => engine.smFactor(GADGETS, sm);

export const gadgetHealth = (options: { rugged?: boolean; own?: number | null }): number => engine.gadgetHealth(GADGETS, options);

/** The DR the book assumes for a gadget (p. 17). */
export const gadgetDr = (options: { build: Build; rugged?: boolean; own?: number | null }): number => engine.gadgetDr(GADGETS, options);

/** The threshold at a campaign's TL, held at the ends of the book's list (p. 14). */
export const maintenanceThreshold = (tl: number): number => engine.maintenanceThreshold(GADGETS, tl)!;

/** Whether a gadget is worth keeping maintenance checks for at this TL (p. 14). */
export const needsMaintenanceChecks = (options: { cost: number; tl: number }): boolean => engine.needsMaintenanceChecks(GADGETS, options);

/**
 * An obsolete gadget's Legality Class (p. 14): "For every two full TLs by
 * which a device is obsolete, its LC can increase by 1, to a maximum of 2
 * beyond its starting LC (up to LC4)".
 */
export const antiqueLegality = (options: { lc: number | null; tl: number | null; campaignTl: number | null }) => engine.antiqueLegality(GADGETS, options);
