/**
 * Gadgets, as the books that print the rule price them: the options a gadget
 * is built with, the statistics it is assumed to have, what it costs a
 * character of another size, and how old age makes it legal (Ultra-Tech
 * pp. 14-17; High-Tech prints the same rules for its TLs).
 *
 * Every figure comes from the book's table (`GadgetFigures`); this file holds
 * the arithmetic alone. The options are fields that reprice the item, and
 * never a second item attached to it.
 */

/** How a gadget is disguised as something else. */
export type Disguise = "" | "massProduced" | "custom";

/** A gadget built down to a price or up to a weight. */
export type Grade = "" | "cheap" | "expensive";

/** What a gadget is made of, which sets the DR the book assumes. */
export type Build = "plastic" | "weapon" | "solidMelee" | "own";

/** What a gadget was built with. */
export interface GadgetOptions {
  disguise: Disguise;
  /** Styling's multiplier on the price; 0 or 1 for a gadget with none. */
  styling: number;
  rugged: boolean;
  grade: Grade;
}

/** A gadget with nothing chosen. */
export const NO_OPTIONS: GadgetOptions = Object.freeze({ disguise: "", styling: 0, rugged: false, grade: "" });

/** One book's figures for its gadgets. */
export interface GadgetFigures {
  /** What each disguise multiplies the price by. */
  disguiseCost: Readonly<Record<Disguise, number>>;
  /** The least and most styling multiplies the price by. */
  styling: Readonly<{ least: number; most: number }>;
  /** Rugged's multipliers on price, weight and DR, and its HT bonus. */
  rugged: Readonly<{ cost: number; weight: number; health: number; dr: number }>;
  /** Cheap's and expensive's multipliers on price and on weight less the power cells'. */
  gradeCost: Readonly<Record<Grade, number>>;
  gradeWeight: Readonly<Record<Grade, number>>;
  /** Weight, cost and power by the carrier's Size Modifier, held at the table's ends. */
  smFactors: Readonly<Record<number, number>>;
  /** The DR the book assumes by what the gadget is made of. */
  typicalDr: Readonly<Record<Exclude<Build, "own">, number>>;
  /** The HT a gadget is assumed to have where it states none. */
  assumedHealth: number;
  /** The price by campaign TL below which a gadget needs no maintenance; null where the book gives none. */
  maintenance: Readonly<Record<number, number>> | null;
  /** How many steps an antique's Legality Class may rise, and the highest it may reach. */
  antique: Readonly<{ steps: number; highestLc: number }>;
}

/** A number's entry in a table keyed by integers, held at the table's ends. */
function heldAtEnds(table: Readonly<Record<number, number>>, at: number): number | undefined {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!keys.length) return undefined;
  const key = Math.min(keys.at(-1)!, Math.max(keys[0]!, Math.round(Number(at) || 0)));
  return table[key];
}

/** Styling's multiplier, which is 1 until it is at least the least the book charges. */
export function stylingCost(figures: GadgetFigures, styling: number): number {
  const asked = Number(styling) || 0;
  if (asked < figures.styling.least) return 1;
  return Math.min(figures.styling.most, asked);
}

/** What the options multiply the price by. */
export function costFactor(figures: GadgetFigures, options: GadgetOptions): number {
  return (figures.disguiseCost[options.disguise] ?? 1)
    * stylingCost(figures, options.styling)
    * (options.rugged ? figures.rugged.cost : 1)
    * (figures.gradeCost[options.grade] ?? 1);
}

/**
 * An option-built gadget's price and weight from its list figures.
 *
 * Cheap and expensive are weighed without the power cells (Ultra-Tech p. 15),
 * so the cells are set aside for that factor and put back; rugged's extra
 * weight is on the gadget as it stands.
 */
export function gadgetPrice(figures: GadgetFigures, gadget: {
  listCost: number;
  listWeight: number;
  cellWeight?: number;
  options: GadgetOptions;
}): { cost: number; weight: number; costFactor: number } {
  const listCost = Math.max(0, Number(gadget.listCost) || 0);
  const listWeight = Math.max(0, Number(gadget.listWeight) || 0);
  const cells = Math.min(listWeight, Math.max(0, Number(gadget.cellWeight) || 0));
  const factor = costFactor(figures, gadget.options);
  const graded = (listWeight - cells) * (figures.gradeWeight[gadget.options.grade] ?? 1) + cells;
  const weight = graded * (gadget.options.rugged ? figures.rugged.weight : 1);
  return {
    cost: Math.round(listCost * factor * 100) / 100,
    weight: Math.round(weight * 100) / 100,
    costFactor: factor,
  };
}

/** The factor for a Size Modifier, held at the ends of the book's table. */
export function smFactor(figures: GadgetFigures, sm: number): number {
  return heldAtEnds(figures.smFactors, sm) ?? 1;
}

export function gadgetHealth(figures: GadgetFigures, options: { rugged?: boolean; own?: number | null }): number {
  const base = typeof options.own === "number" && options.own > 0 ? options.own : figures.assumedHealth;
  return base + (options.rugged ? figures.rugged.health : 0);
}

/**
 * The DR the book assumes for a gadget: the piece's own where it has one --
 * armour, suits and vehicles have theirs -- and the typical figure for what it
 * is otherwise, multiplied where the gadget is rugged.
 */
export function gadgetDr(figures: GadgetFigures, options: { build: Build; rugged?: boolean; own?: number | null }): number {
  const own = typeof options.own === "number" && options.own > 0 ? options.own : null;
  const base = options.build === "own" ? (own ?? figures.typicalDr.plastic) : (own ?? figures.typicalDr[options.build]);
  return base * (options.rugged ? figures.rugged.dr : 1);
}

/** The maintenance threshold at a campaign's TL, held at the ends of the book's list; null where it has none. */
export function maintenanceThreshold(figures: GadgetFigures, tl: number): number | null {
  return figures.maintenance ? (heldAtEnds(figures.maintenance, tl) ?? null) : null;
}

/** Whether a gadget is worth keeping maintenance checks for at this TL. */
export function needsMaintenanceChecks(figures: GadgetFigures, options: { cost: number; tl: number }): boolean {
  const threshold = maintenanceThreshold(figures, options.tl);
  return threshold !== null && (Number(options.cost) || 0) >= threshold;
}

/**
 * An obsolete gadget's Legality Class: for every two full TLs by which it is
 * obsolete its LC rises by one, as far as the book allows (Ultra-Tech p. 14),
 * counted from the TL of the gadget itself rather than the TL it was
 * introduced at.
 */
export function antiqueLegality(figures: GadgetFigures, options: { lc: number | null; tl: number | null; campaignTl: number | null }): { lc: number | null; steps: number } {
  const lc = options.lc;
  const tl = options.tl;
  const campaign = options.campaignTl;
  if (lc === null || tl === null || campaign === null || !Number.isFinite(tl) || !Number.isFinite(campaign)) return { lc, steps: 0 };
  const obsolete = Math.floor(campaign) - Math.floor(tl);
  if (obsolete < 2) return { lc, steps: 0 };
  const steps = Math.min(figures.antique.steps, Math.floor(obsolete / 2));
  const raised = Math.min(figures.antique.highestLc, lc + steps);
  return { lc: raised, steps: raised - lc };
}
