/**
 * Armour that covers only part of a hit location. Ultra-Tech's tailored armour
 * covers the front or the back of a part, or half of it, and a half-covered
 * part stands on a 3d roll (pp. 174-175). The Basic Set's n-in-6 coverage
 * (Basic Set Revised p. 576) is the system's, and High-Tech's chances and
 * striking around it went there (#583). What is left here is armour that
 * stands against a blow from one side only.
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
