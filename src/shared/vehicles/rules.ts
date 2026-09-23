/**
 * The vehicle rules two books print, with no Foundry in them.
 *
 *   - **Occupant restraints.** Ultra-Tech's crashweb (p. 224) and
 *     High-Tech's airbag (p. 229) are one rule with two sets of figures: DR
 *     against the crash's damage for a seated occupant, and a DX roll at -2
 *     each turn to get free of it. The crashweb's DR is ablative; the airbag's
 *     is not, but it works once.
 *   - **Armour against shaped charges.** Ultra-Tech's electromagnetic armour
 *     (p. 187) and High-Tech's spaced and laminated armour (p. 229) multiply
 *     the armour's DR against a shaped charge before the armour divisor: each
 *     book's table gives its kinds and their multipliers.
 */

import type { BookTable } from "../book-tables.js";

// ── occupant restraints ──

/**
 * What a restraint's ablative DR stops of a blow in a crash: the damage
 * left, and the DR left after it (Ultra-Tech p. 224).
 */
export function restraintAbsorb(damage: number, drLeft: number): { damage: number; drLeft: number } {
  const dr = Math.max(0, Math.floor(Number(drLeft) || 0));
  const hit = Math.max(0, Math.floor(Number(damage) || 0));
  const stopped = Math.min(dr, hit);
  return { damage: hit - stopped, drLeft: dr - stopped };
}

/**
 * What a restraint whose DR is not used up stops of a blow: the DR comes off
 * each blow, and stays (High-Tech p. 229).
 */
export function restraintStops(damage: number, dr: number): number {
  return Math.max(0, Math.floor(Number(damage) || 0) - Math.max(0, Math.floor(Number(dr) || 0)));
}

// ── armour against shaped charges ──

/** A book's kinds of armour made against shaped charges, and what each multiplies DR by. */
export interface ShapedArmourTable extends BookTable {
  kinds: Readonly<Record<string, { multiplier: number; negatesHesh?: boolean }>>;
}

/** The multiplier a kind of armour gives its DR against a shaped charge; 1 for none. */
export function shapedArmourMultiplier(table: ShapedArmourTable, kind: string): number {
  return kind ? (table.kinds[kind]?.multiplier ?? 1) : 1;
}

/** A DR multiplied against a shaped charge, before the armour divisor, rounded down. */
export function drAgainstShapedCharge(dr: number, multiplier: number): number {
  return Math.floor(Math.max(0, Number(dr) || 0) * (multiplier > 0 ? multiplier : 1) + 1e-9);
}
