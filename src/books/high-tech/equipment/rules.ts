/**
 * High-Tech's rules for the gear itself (pp. 7-11), as pure functions and the
 * book's figures. The Foundry side is in `index.ts`.
 *
 *   - **Equipment options (pp. 9-11):** disguised, styling, rugged, cheap and
 *     expensive, and the statistics a gadget is assumed to have. The rule is
 *     the shared gadget engine's (`src/shared/gadgets/`), which Ultra-Tech
 *     prints at its TLs; this is High-Tech's table for it, whose own figures
 *     are styling in three tiers with a reaction bonus, a second, fragile kind
 *     of cheap, rugged and the grades kept off clothing, weapons and armour,
 *     quality adding to HT, and the maintenance threshold as a share of
 *     average starting wealth.
 *   - **Combination gadgets (p. 10):** several gadgets in one housing.
 *   - **Adjusting for SM (p. 10)** and **legality with age (p. 8):** the same
 *     table's size factors and antique steps.
 *   - **Equipment bonuses (pp. 7, 11):** the Equipment Bond perk, and
 *     intrinsic bonuses, both stacking with quality.
 *   - **TL and familiarity (p. 11):** the optional rule that treats a
 *     DX-based skill's TL penalty as a familiarity penalty.
 */

import type { GadgetFigures } from "../../../shared/gadgets/rules.js";
import { enduranceByWeight } from "../../../shared/power/rules.js";

// ── equipment options (pp. 9-11) ─────────────────────────────────────────────

/** Disguised (p. 9): twice the price mass-produced, five times custom-built. */
export const DISGUISE_COST = Object.freeze({ "": 1, massProduced: 2, custom: 5 });

/**
 * Styling (p. 10) comes in three tiers, each a bonus to reactions from
 * collectors and buyers (and to Merchant used as an Influence roll on them)
 * for a multiple of the price: +1 for twice, +2 for five times, +3 for ten.
 */
export const STYLING_TIERS = Object.freeze([
  Object.freeze({ cost: 2, reaction: 1 }),
  Object.freeze({ cost: 5, reaction: 2 }),
  Object.freeze({ cost: 10, reaction: 3 }),
]);

/** Rugged (p. 10): +2 HT and twice the DR, at twice the price and a fifth more weight. */
export const RUGGED = Object.freeze({ cost: 2, weight: 1.2, health: 2, dr: 2 });

/**
 * Cheap and expensive (p. 10). Cheap is half the price, and either clunky --
 * half again the weight, batteries aside -- or fragile, at the same weight
 * but -2 HT and half the DR. Expensive is twice the price at two thirds the
 * weight, batteries aside.
 */
export const GRADE_COST = Object.freeze({ "": 1, cheap: 0.5, fragile: 0.5, expensive: 2 });
export const GRADE_WEIGHT = Object.freeze({ "": 1, cheap: 1.5, fragile: 1, expensive: 2 / 3 });
export const GRADE_HEALTH = Object.freeze({ fragile: -2 });
export const GRADE_DR = Object.freeze({ fragile: 0.5 });

/** Rugged, cheap and expensive aren't offered for clothing, weapons or armour (p. 10). */
export const NO_BUILD_OPTIONS = Object.freeze(["clothing", "weapon", "armor"] as const);

/**
 * What quality adds to a gadget's HT (p. 11): the +1 of good quality and the
 * +2 of fine, on top of rugged's. The book names only those two; best
 * quality is held to fine's +2 rather than read as less.
 */
export const QUALITY_HEALTH = Object.freeze({ good: 1, fine: 2, best: 2 });

/** Adjusting for SM (p. 10): cost, weight and power by the user's Size Modifier. */
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

/** The DR the book assumes (p. 11): 2 for most gadgets, 4 for weapons, 6 for solid-metal melee weapons. */
export const TYPICAL_DR = Object.freeze({ plastic: 2, weapon: 4, solidMelee: 6 });

/** A gadget is HT 10 unless its entry says otherwise (p. 11). */
export const ASSUMED_HEALTH = 10;

/**
 * The maintenance threshold (p. 9): gear priced under a thousandth of the
 * campaign TL's average starting wealth may be taken as needing no
 * maintenance -- $5 at TL5 up to $20 at TL8.
 */
export const MAINTENANCE_SHARE = 0.001;

/**
 * Legality with age (p. 8): the LC rises one for every two full TLs a device
 * is obsolete, two at most, and LC4 is as open as it gets; chemical,
 * biological and nuclear weapons stay controlled.
 */
export const ANTIQUE = Object.freeze({ steps: 2, highestLc: 4, exemptControlled: true });

/** High-Tech's figures, as the shared gadget engine takes them. */
export const HIGH_TECH_GADGETS: GadgetFigures = Object.freeze({
  disguiseCost: DISGUISE_COST,
  styling: Object.freeze({ least: 2, most: 10 }),
  stylingTiers: STYLING_TIERS,
  rugged: RUGGED,
  gradeCost: GRADE_COST,
  gradeWeight: GRADE_WEIGHT,
  gradeHealth: GRADE_HEALTH,
  gradeDr: GRADE_DR,
  noBuildOptions: NO_BUILD_OPTIONS,
  qualityHealth: QUALITY_HEALTH,
  smFactors: SM_FACTORS,
  // The power requirement is multiplied with the rest (p. 10), so the battery count goes too.
  smScalesCells: true,
  // The batteries a record lists, where the batteries rule knows them, are what cheap and expensive leave out.
  cellsFromPower: true,
  typicalDr: TYPICAL_DR,
  assumedHealth: ASSUMED_HEALTH,
  maintenance: null,
  maintenanceShare: MAINTENANCE_SHARE,
  antique: ANTIQUE,
});

// ── combination gadgets (p. 10) ──────────────────────────────────────────────

/** One gadget going into a combination: its empty weight is its weight less its batteries. */
export interface CombinationPart {
  name: string;
  cost: number;
  weight: number;
  /** The batteries in its weight, which the combination leaves out and puts back once. */
  cellWeight: number;
  lc: number | null;
  tl: number | null;
}

/**
 * The share of every part but the heaviest (and the costliest) a combination
 * keeps: 80% where the parts can all be used at once, which only share a
 * housing, and 50% where one works at a time, which share their workings too.
 */
export const COMBINATION_SHARE = Object.freeze({ allAtOnce: 0.8, oneAtATime: 0.5 });

/** The largest figure in full and the others at a share, as the book adds both weight and cost. */
function combinedFigure(values: number[], share: number): number {
  const sorted = values.map((v) => Math.max(0, Number(v) || 0)).sort((a, b) => b - a);
  if (!sorted.length) return 0;
  const [first, ...rest] = sorted;
  return Math.round((first! + share * rest.reduce((sum, v) => sum + v, 0)) * 100) / 100;
}

/**
 * A combination gadget (p. 10). Its weight is the heaviest part's empty
 * weight and a share of the others', and its cost the costliest part's and a
 * share of the others'. It runs on one set of batteries -- here the heaviest
 * set any part carried -- and takes the lowest LC of its parts. The book
 * gives no TL for it; it takes its most advanced part's.
 */
export function combineGadgets(parts: readonly CombinationPart[], allAtOnce: boolean): {
  cost: number;
  weight: number;
  emptyWeight: number;
  cellWeight: number;
  lc: number | null;
  tl: number | null;
} {
  const share = allAtOnce ? COMBINATION_SHARE.allAtOnce : COMBINATION_SHARE.oneAtATime;
  const empty = parts.map((p) => Math.max(0, (Number(p.weight) || 0) - Math.max(0, Number(p.cellWeight) || 0)));
  const emptyWeight = combinedFigure(empty, share);
  const cellWeight = Math.max(0, ...parts.map((p) => Math.max(0, Number(p.cellWeight) || 0)));
  const classes = parts.map((p) => p.lc).filter((lc): lc is number => typeof lc === "number" && Number.isFinite(lc));
  const levels = parts.map((p) => p.tl).filter((tl): tl is number => typeof tl === "number" && Number.isFinite(tl));
  return {
    cost: combinedFigure(parts.map((p) => p.cost), share),
    weight: Math.round((emptyWeight + cellWeight) * 100) / 100,
    emptyWeight,
    cellWeight,
    lc: classes.length ? Math.min(...classes) : null,
    tl: levels.length ? Math.max(...levels) : null,
  };
}

/**
 * A part's endurance once it runs off another size of battery (p. 10): in
 * proportion to what the two batteries weigh, so a battery 3.3 times as
 * heavy runs it 3.3 times as long.
 */
export function sharedBatteryEndurance(endurance: number, fromWeight: number, toWeight: number): number {
  const hours = Math.max(0, Number(endurance) || 0);
  // The battery engine's sum; a part that had no battery keeps its endurance, and no battery at all gives none.
  if (!((Number(fromWeight) || 0) > 0)) return hours;
  return Math.round(hours * (enduranceByWeight(fromWeight, toWeight) ?? 0) * 100) / 100;
}

// ── equipment bonuses (pp. 7, 11) ────────────────────────────────────────────

/**
 * Equipment Bond (p. 7): +1 to effective skill with the one piece of gear or
 * kit it names, whatever its quality, and on top of quality's bonus.
 */
export const EQUIPMENT_BOND_BONUS = 1;

/** The gear an Equipment Bond names: its specialty, or what its name gives in brackets. */
export function bondedName(trait: { name?: unknown; system?: { specialty?: unknown } }): string | null {
  const name = String(trait?.name ?? "");
  if (!/^equipment bond\b/i.test(name)) return null;
  const named = String(trait?.system?.specialty || /\(([^)]*)\)\s*$/.exec(name)?.[1] || "").trim();
  return named || null;
}

/**
 * The lines a character's tools for a skill add beside quality's (p. 11):
 * the best intrinsic bonus among them -- a bonus not marked "(quality)",
 * which comes with the gear however good it is -- and Equipment Bond's +1
 * where one of them is the bonded piece. Both add to quality's bonus.
 */
export function equipmentBonusLines(tools: ReadonlyArray<{ name: string; intrinsic: number }>, bonded: readonly string[]): {
  intrinsic: { name: string; value: number } | null;
  bond: { name: string; value: number } | null;
} {
  let intrinsic: { name: string; value: number } | null = null;
  for (const tool of tools) {
    const value = Math.trunc(Number(tool.intrinsic) || 0);
    if (value !== 0 && (intrinsic === null || value > intrinsic.value)) intrinsic = { name: tool.name, value };
  }
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const wanted = new Set(bonded.map(key));
  const held = tools.find((tool) => wanted.has(key(tool.name)));
  return { intrinsic, bond: held ? { name: held.name, value: EQUIPMENT_BOND_BONUS } : null };
}

// ── TL and familiarity (p. 11) ──────────────────────────────────────────────

/**
 * The optional rule of p. 11: a DX-based skill's TL penalty counts as an
 * unfamiliarity penalty instead -- as large as it was, but gone once the
 * character is familiar with the gear. Where the familiarity rule's own -2
 * is on the roll too, the two are one penalty, the larger. Returns what to
 * add to the roll to make it so: 0 where there is no TL penalty.
 */
export function familiarityOffset(options: { techLevel: number; unfamiliar: number; familiar: boolean }): number {
  const techLevel = Math.min(0, Number(options.techLevel) || 0);
  if (techLevel === 0) return 0;
  const unfamiliar = Math.min(0, Number(options.unfamiliar) || 0);
  const wanted = options.familiar ? 0 : Math.min(techLevel, unfamiliar);
  return wanted - (techLevel + unfamiliar);
}
