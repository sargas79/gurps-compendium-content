/**
 * Armour that covers only part of a hit location, the rule two books print
 * their own way. Ultra-Tech's tailored armour covers the front or the back of
 * a part, or half of it, and a half-covered part stands on a 3d roll (pp.
 * 174-175); High-Tech gives a piece an n-in-6 chance to protect, the chances
 * of several pieces on one location adding up, and lets an attacker strike
 * around it at a penalty (p. 69). What both share is armour that stands
 * against a blow from one side only; each book keeps its own roll.
 */

/**
 * Whether armour on one side of a part stands against a blow from this arc:
 * "front" and "back" (and their halves) only against their own arc, anything
 * else from every arc. An unknown arc -- no facing in play -- counts.
 */
export function coversArc(coverage: string, arc: string | null | undefined): boolean {
  if (coverage === "front" || coverage === "frontHalf") return !arc || arc === "front";
  if (coverage === "back" || coverage === "backHalf") return !arc || arc === "back";
  return coverage !== "none";
}

/** Sixths a piece covers: 1-5 for part of the location, 6 (or anything else) for all of it. */
export function sixths(n: unknown): number {
  const v = Math.floor(Number(n) || 0);
  return v >= 1 && v <= 5 ? v : 6;
}

/** The chance of several partial pieces on one location: their n added up, never past 6 (High-Tech p. 69). */
export function combinedSixths(pieces: readonly number[]): number {
  return Math.min(6, pieces.reduce((sum, n) => sum + Math.max(0, Math.floor(n)), 0));
}

/** Whether partial armour stands against the blow: 1d at or under n (High-Tech p. 69). */
export function partialStands(n: number, roll: number): boolean {
  return roll <= n;
}

/**
 * The penalty to strike around partial armour, over the hit location's own:
 * -(n-1), but never better than -1 (High-Tech p. 69). Null where the armour
 * covers the whole location, which leaves nothing to strike around.
 */
export function strikeAroundPenalty(n: number): number | null {
  if (!(n >= 1 && n <= 5)) return null;
  return -Math.max(1, Math.floor(n) - 1);
}
