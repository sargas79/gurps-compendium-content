/**
 * Ultra-Tech's gadgets: the options a gadget is built with, the statistics it
 * is assumed to have, what it costs a character of another size, and how old
 * age makes it legal (pp. 14-17).
 *
 * The options are fields that reprice the item, as the book prices them, and
 * never a second item attached to it.
 */

/** How a gadget is disguised as something else (p. 15). */
export type Disguise = "" | "massProduced" | "custom";

/** A gadget built down to a price or up to a weight (p. 15). */
export type Grade = "" | "cheap" | "expensive";

/** What a gadget was built with. */
export interface GadgetOptions {
  disguise: Disguise;
  /** Styling's multiplier on the price, 2 to 10; 0 or 1 for a gadget with none (p. 15). */
  styling: number;
  rugged: boolean;
  grade: Grade;
}

/** "Double the cost for a mass-produced disguised item; multiply cost by 5 for a custom-built one" (p. 15). */
export const DISGUISE_COST: Readonly<Record<Disguise, number>> = { "": 1, massProduced: 2, custom: 5 };

/** Styling costs "2 to 10 times as much depending on the complexity" (p. 15). */
export const STYLING_RANGE = Object.freeze({ least: 2, most: 10 });

/** Rugged: "+2 HT bonus and ... twice its normal DR. Add 20% to weight and double the cost" (p. 15). */
export const RUGGED = Object.freeze({ cost: 2, weight: 1.2, health: 2, dr: 2 });

/** Cheap is half price at 1.5 times the weight, expensive twice the price at 2/3 (p. 15). */
export const GRADE_COST: Readonly<Record<Grade, number>> = { "": 1, cheap: 0.5, expensive: 2 };
export const GRADE_WEIGHT: Readonly<Record<Grade, number>> = { "": 1, cheap: 1.5, expensive: 2 / 3 };

/** A gadget with nothing chosen. */
export const NO_OPTIONS: GadgetOptions = Object.freeze({ disguise: "", styling: 0, rugged: false, grade: "" });

/** Styling's multiplier, which is 1 until it is at least the least the book charges. */
export function stylingCost(styling: number): number {
  const asked = Number(styling) || 0;
  if (asked < STYLING_RANGE.least) return 1;
  return Math.min(STYLING_RANGE.most, asked);
}

/** What the options multiply the price by. */
export function costFactor(options: GadgetOptions): number {
  return (DISGUISE_COST[options.disguise] ?? 1) * stylingCost(options.styling) * (options.rugged ? RUGGED.cost : 1) * (GRADE_COST[options.grade] ?? 1);
}

/**
 * An option-built gadget's price and weight from its list figures.
 *
 * Cheap and expensive are weighed "excluding the weight of any power cells"
 * (p. 15), so the cells are set aside for that factor and put back; rugged's
 * 20% is on the gadget as it stands.
 */
export function gadgetPrice(figures: {
  listCost: number;
  listWeight: number;
  cellWeight?: number;
  options: GadgetOptions;
}): { cost: number; weight: number; costFactor: number } {
  const listCost = Math.max(0, Number(figures.listCost) || 0);
  const listWeight = Math.max(0, Number(figures.listWeight) || 0);
  const cells = Math.min(listWeight, Math.max(0, Number(figures.cellWeight) || 0));
  const factor = costFactor(figures.options);
  const graded = (listWeight - cells) * (GRADE_WEIGHT[figures.options.grade] ?? 1) + cells;
  const weight = graded * (figures.options.rugged ? RUGGED.weight : 1);
  return {
    cost: Math.round(listCost * factor * 100) / 100,
    weight: Math.round(weight * 100) / 100,
    costFactor: factor,
  };
}

/**
 * What a gadget's weight, cost and power cells are multiplied by for a user of
 * this Size Modifier (p. 16).
 *
 * The book's table prints two SM -2 rows -- "SM -2 ×1/10" and "SM -2 ×1/5" --
 * which cannot both be the factor for SM -2. The rows are read here as the
 * mirror of the positive side the table sets beside them (×2, ×5, ×10, ×20),
 * so ×1/5 is SM -2 and ×1/10 is SM -3.
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

/** The factor for a Size Modifier, held at the ends of the table. */
export function smFactor(sm: number): number {
  const size = Math.round(Number(sm) || 0);
  if (size <= -4) return SM_FACTORS[-4]!;
  if (size >= 10) return SM_FACTORS[10]!;
  return SM_FACTORS[size] ?? 1;
}

/** What a gadget is made of, which sets the DR the book assumes (p. 17). */
export type Build = "plastic" | "weapon" | "solidMelee" | "own";

/** "Most gadgets are made of plastic with DR 2. Weapons are normally DR 4, or DR 6 for solid metal melee weapons" (p. 17). */
export const TYPICAL_DR: Readonly<Record<Exclude<Build, "own">, number>> = { plastic: 2, weapon: 4, solidMelee: 6 };

/** "A gadget is assumed to have HT 10 unless otherwise noted. Rugged gadgets are HT 12" (p. 17). */
export const ASSUMED_HEALTH = 10;

export function gadgetHealth(options: { rugged?: boolean; own?: number | null }): number {
  const base = typeof options.own === "number" && options.own > 0 ? options.own : ASSUMED_HEALTH;
  return base + (options.rugged ? RUGGED.health : 0);
}

/**
 * The DR the book assumes for a gadget: the piece's own where it has one --
 * "Armor, suits, vehicles, etc. have their specified DR" -- and the typical
 * figure for what it is otherwise, doubled where the gadget is rugged (p. 17).
 */
export function gadgetDr(options: { build: Build; rugged?: boolean; own?: number | null }): number {
  const own = typeof options.own === "number" && options.own > 0 ? options.own : null;
  const base = options.build === "own" ? (own ?? TYPICAL_DR.plastic) : (own ?? TYPICAL_DR[options.build]);
  return base * (options.rugged ? RUGGED.dr : 1);
}

/** Below this much, "the GM may assume it's so simple that it will work indefinitely" (p. 14). */
export const MAINTENANCE_THRESHOLDS: Readonly<Record<number, number>> = Object.freeze({ 9: 30, 10: 50, 11: 75, 12: 100 });

/** The threshold at a campaign's TL, held at the ends of the book's list. */
export function maintenanceThreshold(tl: number): number {
  const level = Math.round(Number(tl) || 0);
  if (level <= 9) return MAINTENANCE_THRESHOLDS[9]!;
  if (level >= 12) return MAINTENANCE_THRESHOLDS[12]!;
  return MAINTENANCE_THRESHOLDS[level]!;
}

/** Whether a gadget is worth keeping maintenance checks for at this TL (p. 14). */
export function needsMaintenanceChecks(options: { cost: number; tl: number }): boolean {
  return (Number(options.cost) || 0) >= maintenanceThreshold(options.tl);
}

/** How far an antique's Legality Class may rise: "to a maximum of 2 beyond its starting LC (up to LC4)" (p. 14). */
export const MOST_ANTIQUE_STEPS = 2;
export const HIGHEST_LC = 4;

/**
 * An obsolete gadget's Legality Class (p. 14): "For every two full TLs by
 * which a device is obsolete, its LC can increase by 1, to a maximum of 2
 * beyond its starting LC (up to LC4)", counted from the TL of the gadget
 * itself rather than the TL it was introduced at.
 */
export function antiqueLegality(options: { lc: number | null; tl: number | null; campaignTl: number | null }): { lc: number | null; steps: number } {
  const lc = options.lc;
  const tl = options.tl;
  const campaign = options.campaignTl;
  if (lc === null || tl === null || campaign === null || !Number.isFinite(tl) || !Number.isFinite(campaign)) return { lc, steps: 0 };
  const obsolete = Math.floor(campaign) - Math.floor(tl);
  if (obsolete < 2) return { lc, steps: 0 };
  const steps = Math.min(MOST_ANTIQUE_STEPS, Math.floor(obsolete / 2));
  const raised = Math.min(HIGHEST_LC, lc + steps);
  return { lc: raised, steps: raised - lc };
}
