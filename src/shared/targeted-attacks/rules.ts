/**
 * Targeted Attacks, the rule two books print: a technique for one attack at
 * one target, defaulting to the skill at the target's penalty, of which
 * improving it buys off up to half (Martial Arts p. 68 for melee and unarmed
 * attacks; High-Tech p. 252 for guns). Each book's target penalties are its
 * table; what a book adds on top (Martial Arts' striking techniques, a
 * grapple's halved penalty) stays in the book's own code.
 */

/** A book's figures for the targets a TA may name. */
export interface TargetTable {
  /** The penalty to hit each location, lower-cased, the torso 0. */
  locations: Readonly<Record<string, number>>;
  /** The penalty for chinks in armor: in the torso, and anywhere else. It replaces the location's. */
  chinks: { torso: number; other: number };
  /** The penalty for a TA against a weapon, before anything the book adds for the attack. */
  weapon: number;
}

/**
 * A TA's default penalty from the book's table: the location's, the chinks'
 * in place of it, or the weapon's. A location the table doesn't know is 0.
 */
export function targetDefaultPenalty(table: TargetTable, target: string | null, chinks: boolean): number {
  const at = String(target ?? "torso").toLowerCase();
  if (at === "weapon") return table.weapon;
  if (chinks) return at === "torso" ? table.chinks.torso : table.chinks.other;
  return table.locations[at] ?? 0;
}

/** How much of a TA's penalty improving it may buy off: half, rounded up, or all of it where the book says so. */
export function buyOff(penalty: number, whole = false): number {
  const magnitude = -Math.min(0, penalty);
  return whole ? magnitude : Math.ceil(magnitude / 2);
}

/** Levels bought for a Hard technique's points: none for 0 or 1, one fewer than the points after that. */
export function hardLevels(points: number): number {
  const p = Math.floor(Number(points) || 0);
  return p >= 2 ? p - 1 : 0;
}

/**
 * A TA's level, default and ceiling, from the best of its defaults (each
 * already at its penalty): the ceiling is the best default plus what may be
 * bought off, and the points buy levels up to it as a Hard technique's.
 */
export function targetedAttackBounds(defaults: ReadonlyArray<number | null>, buyable: number, points: number): { level: number | null; default: number | null; ceiling: number | null } {
  const known = defaults.filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  if (known.length === 0) return { level: null, default: null, ceiling: null };
  const best = Math.max(...known);
  const ceiling = best + Math.max(0, buyable);
  return { level: Math.min(ceiling, best + hardLevels(points)), default: best, ceiling };
}
