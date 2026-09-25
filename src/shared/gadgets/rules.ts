/**
 * Gadgets, as the books that print the rule price them: the options a gadget
 * is built with, the statistics it is assumed to have, what it costs a
 * character of another size, and how old age makes it legal (Ultra-Tech
 * pp. 14-17; High-Tech pp. 8-11 prints the same rules for its TLs, with a
 * few of its own: styling in tiers, a fragile kind of cheap, options some
 * gear can't take, quality adding to HT, and the maintenance threshold as a
 * share of starting wealth).
 *
 * Every figure comes from the book's table (`GadgetFigures`); this file holds
 * the arithmetic alone. The options are fields that reprice the item, and
 * never a second item attached to it. A figure only one book prints is
 * optional, and a table without it gets the rule as the other book has it.
 */

/** How a gadget is disguised as something else. */
export type Disguise = "" | "massProduced" | "custom";

/**
 * A gadget built down to a price or up to a weight. "fragile" is the second
 * kind of cheap High-Tech prints: no heavier, but frailer (p. 10).
 */
export type Grade = "" | "cheap" | "fragile" | "expensive";

/** What a gadget is made of, which sets the DR the book assumes. */
export type Build = "plastic" | "weapon" | "solidMelee" | "own";

/** The kinds of gear a book may keep an option off. */
export type GearKind = "clothing" | "weapon" | "armor";

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

/** One tier of styling, where a book prints them: what it multiplies the price by, and the reaction bonus it buys. */
export interface StylingTier {
  cost: number;
  reaction: number;
}

/** One book's figures for its gadgets. */
export interface GadgetFigures {
  /** What each disguise multiplies the price by. */
  disguiseCost: Readonly<Record<Disguise, number>>;
  /** The least and most styling multiplies the price by. */
  styling: Readonly<{ least: number; most: number }>;
  /**
   * Styling in fixed tiers, lowest first, where the book prints them: a
   * gadget's styling is then the highest tier its multiplier reaches.
   */
  stylingTiers?: readonly StylingTier[];
  /** Rugged's multipliers on price, weight and DR, and its HT bonus. */
  rugged: Readonly<{ cost: number; weight: number; health: number; dr: number }>;
  /** Each grade's multipliers on price and on weight less the power cells'; a grade the book doesn't print is left out. */
  gradeCost: Readonly<Partial<Record<Grade, number>>>;
  gradeWeight: Readonly<Partial<Record<Grade, number>>>;
  /** A grade's change to HT, and its multiplier on DR, where it has one. */
  gradeHealth?: Readonly<Partial<Record<Grade, number>>>;
  gradeDr?: Readonly<Partial<Record<Grade, number>>>;
  /** The gear that can't be built rugged, cheap or expensive, where the book keeps some off. */
  noBuildOptions?: readonly GearKind[];
  /** What the item's quality grade adds to its HT, where the book says it does. */
  qualityHealth?: Readonly<Record<string, number>>;
  /** Weight, cost and power by the carrier's Size Modifier, held at the table's ends. */
  smFactors: Readonly<Record<number, number>>;
  /** Whether the Size Modifier also scales how many power cells the gadget takes. */
  smScalesCells?: boolean;
  /**
   * Whether the cells' weight cheap and expensive leave out comes from the
   * cell engine, where it knows the record's cells, rather than the gadget's
   * own field.
   */
  cellsFromPower?: boolean;
  /** The DR the book assumes by what the gadget is made of. */
  typicalDr: Readonly<Record<Exclude<Build, "own">, number>>;
  /** The HT a gadget is assumed to have where it states none. */
  assumedHealth: number;
  /** The price by campaign TL below which a gadget needs no maintenance; null where the book gives none. */
  maintenance: Readonly<Record<number, number>> | null;
  /** The same threshold as a share of the TL's average starting wealth, where the book gives it so. */
  maintenanceShare?: number;
  /**
   * How many steps an antique's Legality Class may rise, and the highest it
   * may reach; `exemptControlled` where the book keeps gear that is always
   * controlled (NBC weapons) from rising.
   */
  antique: Readonly<{ steps: number; highestLc: number; exemptControlled?: boolean }>;
}

/** A number's entry in a table keyed by integers, held at the table's ends. */
function heldAtEnds(table: Readonly<Record<number, number>>, at: number): number | undefined {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!keys.length) return undefined;
  const key = Math.min(keys.at(-1)!, Math.max(keys[0]!, Math.round(Number(at) || 0)));
  return table[key];
}

/** The tier a styling multiplier reaches, in a book that prints tiers; null for none. */
export function stylingTier(figures: GadgetFigures, styling: number): StylingTier | null {
  const asked = Number(styling) || 0;
  const reached = (figures.stylingTiers ?? []).filter((tier) => asked >= tier.cost);
  return reached.at(-1) ?? null;
}

/** Styling's multiplier, which is 1 until it is at least the least the book charges. */
export function stylingCost(figures: GadgetFigures, styling: number): number {
  if (figures.stylingTiers) return stylingTier(figures, styling)?.cost ?? 1;
  const asked = Number(styling) || 0;
  if (asked < figures.styling.least) return 1;
  return Math.min(figures.styling.most, asked);
}

/** The reaction bonus a gadget's styling buys, where the book prints one. */
export function stylingReaction(figures: GadgetFigures, styling: number): number {
  return stylingTier(figures, styling)?.reaction ?? 0;
}

/** The grades a book prints, in the order the sheet offers them. */
export function gradesOf(figures: GadgetFigures): Grade[] {
  return (["", "cheap", "fragile", "expensive"] as Grade[]).filter((grade) => grade === "" || figures.gradeCost[grade] !== undefined);
}

/** Whether a kind of gear may be built rugged, cheap or expensive by this book. */
export function takesBuildOptions(figures: GadgetFigures, kinds: readonly GearKind[]): boolean {
  return !kinds.some((kind) => figures.noBuildOptions?.includes(kind));
}

/** The options as this book allows them on this kind of gear: rugged and the grades dropped where it keeps them off. */
export function allowedOptions(figures: GadgetFigures, options: GadgetOptions, kinds: readonly GearKind[]): GadgetOptions {
  const grade = figures.gradeCost[options.grade] === undefined ? "" : options.grade;
  if (takesBuildOptions(figures, kinds)) return { ...options, grade };
  return { ...options, rugged: false, grade: "" };
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

/**
 * A gadget's HT: its own where its entry states one, the book's assumption
 * otherwise, with rugged's bonus, and where the book prints them the grade's
 * change and what its quality adds -- the two bonuses add up (High-Tech
 * p. 11: a rugged, fine piece is HT 14).
 */
export function gadgetHealth(figures: GadgetFigures, options: { rugged?: boolean; own?: number | null; grade?: Grade; quality?: string }): number {
  const base = typeof options.own === "number" && options.own > 0 ? options.own : figures.assumedHealth;
  return base
    + (options.rugged ? figures.rugged.health : 0)
    + (options.grade ? (figures.gradeHealth?.[options.grade] ?? 0) : 0)
    + (options.quality ? (figures.qualityHealth?.[options.quality] ?? 0) : 0);
}

/**
 * The DR the book assumes for a gadget: the piece's own where it has one --
 * armour, suits and vehicles have theirs -- and the typical figure for what it
 * is otherwise, multiplied where the gadget is rugged, and where its grade
 * changes it (fragile halves it, rounded down).
 */
export function gadgetDr(figures: GadgetFigures, options: { build: Build; rugged?: boolean; own?: number | null; grade?: Grade }): number {
  const own = typeof options.own === "number" && options.own > 0 ? options.own : null;
  const base = options.build === "own" ? (own ?? figures.typicalDr.plastic) : (own ?? figures.typicalDr[options.build]);
  const graded = options.grade ? (figures.gradeDr?.[options.grade] ?? 1) : 1;
  const dr = base * (options.rugged ? figures.rugged.dr : 1) * graded;
  return graded === 1 ? dr : Math.floor(dr);
}

/**
 * The maintenance threshold at a campaign's TL: the book's list, held at its
 * ends, or its share of the TL's average starting wealth, read through
 * `wealthAt`. Null where the book gives none.
 */
export function maintenanceThreshold(figures: GadgetFigures, tl: number, wealthAt?: (tl: number) => number): number | null {
  if (figures.maintenanceShare !== undefined && wealthAt) {
    return Math.round(figures.maintenanceShare * wealthAt(tl) * 100) / 100;
  }
  return figures.maintenance ? (heldAtEnds(figures.maintenance, tl) ?? null) : null;
}

/** Whether a gadget is worth keeping maintenance checks for at this TL. */
export function needsMaintenanceChecks(figures: GadgetFigures, options: { cost: number; tl: number }, wealthAt?: (tl: number) => number): boolean {
  const threshold = maintenanceThreshold(figures, options.tl, wealthAt);
  return threshold !== null && (Number(options.cost) || 0) >= threshold;
}

/**
 * The technical skills a maintenance check is made against (Campaigns
 * p. 485), as High-Tech names them for each kind of gear (p. 9): Armoury for
 * weapons and defenses, Computer Operation for software, Electrician for
 * appliances, Electronics Repair for electronic devices, Machinist for tools,
 * Mechanic for power plants and vehicles, Sewing for fabric.
 */
export const MAINTENANCE_SKILLS = Object.freeze(["Armoury", "Computer Operation", "Electrician", "Electronics Repair", "Machinist", "Mechanic", "Sewing"]);

/** The skill a gadget's maintenance is likeliest to take, from what it is. */
export function maintenanceSkillFor(facts: { weapon: boolean; armor: boolean; vehicle: boolean; powered: boolean }): string {
  if (facts.weapon || facts.armor) return "Armoury";
  if (facts.vehicle) return "Mechanic";
  return facts.powered ? "Electronics Repair" : "Machinist";
}

/**
 * Missed or failed maintenance checks cost the gadget a point of HT each,
 * cumulative, on its HT rolls; each point comes back as a major repair, at an
 * extra -2 with parts costing 1d x 10% of its price (Campaigns pp. 484-485).
 */
export const MAJOR_REPAIR = Object.freeze({ modifier: -2, partsShare: 0.1 });

/** A maintenance check's result: kept up, or a point of HT lost (Campaigns p. 485). */
export function maintenanceOutcome(options: { missed: boolean; success: boolean }): "kept" | "lost" {
  return !options.missed && options.success ? "kept" : "lost";
}

/**
 * An obsolete gadget's Legality Class: for every two full TLs by which it is
 * obsolete its LC rises by one, as far as the book allows (Ultra-Tech p. 14;
 * High-Tech p. 8), counted from the TL of the gadget itself rather than the
 * TL it was introduced at. Where the book says so, gear that is always
 * controlled -- chemical, biological and nuclear weapons -- never rises.
 */
export function antiqueLegality(figures: GadgetFigures, options: { lc: number | null; tl: number | null; campaignTl: number | null; controlled?: boolean }): { lc: number | null; steps: number } {
  const lc = options.lc;
  const tl = options.tl;
  const campaign = options.campaignTl;
  if (lc === null || tl === null || campaign === null || !Number.isFinite(tl) || !Number.isFinite(campaign)) return { lc, steps: 0 };
  if (options.controlled && figures.antique.exemptControlled) return { lc, steps: 0 };
  const obsolete = Math.floor(campaign) - Math.floor(tl);
  if (obsolete < 2) return { lc, steps: 0 };
  const steps = Math.min(figures.antique.steps, Math.floor(obsolete / 2));
  const raised = Math.min(figures.antique.highestLc, lc + steps);
  return { lc: raised, steps: raised - lc };
}
