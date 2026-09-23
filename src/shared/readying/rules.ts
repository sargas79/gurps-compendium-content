/**
 * Readying weapons, the rules two books print: multiple Fast-Draw, Fast-Draw
 * from odd positions, and where a weapon is carried (Martial Arts pp. 101-104
 * for blades and the like; High-Tech pp. 81-82 for guns). Each book's own
 * carry-location figures are its table, registered in `CARRY_TABLES`.
 */

export type Hand = "master" | "off" | "both";

/** Draws made so far this turn, by hand. A two-handed draw counts for both. */
export interface DrawCounts {
  master: number;
  off: number;
}

/**
 * The multiple Fast-Draw penalty (Martial Arts p. 103): -2 per earlier attempt
 * with the hand (the worse hand for a two-handed draw), and -2 per weapon when
 * drawing several identical ones at once. Heroic Archer or Weapon Master
 * halves it, and both quarter it, rounding in the warrior's favor.
 */
export function multipleDrawPenalty(counts: DrawCounts, hand: Hand, weapons: number, halvings: number): number {
  const prior = hand === "both" ? Math.max(counts.master, counts.off) : counts[hand];
  const many = Math.max(1, Math.floor(Number(weapons) || 1));
  const raw = -2 * prior + (many > 1 ? -2 * many : 0);
  const divisor = halvings >= 2 ? 4 : halvings === 1 ? 2 : 1;
  return raw === 0 ? 0 : Math.ceil(raw / divisor);
}

/** The counts after a draw: one per weapon drawn, on each hand used. */
export function afterDraw(counts: DrawCounts, hand: Hand, weapons: number): DrawCounts {
  const many = Math.max(1, Math.floor(Number(weapons) || 1));
  return {
    master: counts.master + (hand === "master" || hand === "both" ? many : 0),
    off: counts.off + (hand === "off" || hand === "both" ? many : 0),
  };
}

/**
 * Where a weapon is carried, as the books' carry-location lists name it.
 * Martial Arts' places come first; High-Tech adds a holster at the small of
 * the back, a shoulder holster, an ankle holster and a patrol sling.
 */
export type Carry =
  | "hip" | "oppositeHip" | "sameHip" | "shoulder" | "backSling" | "inHand" | "quiver" | "ground"
  | "elsewhere" | "chestHandleDown" | "boot" | "belt" | "concealed" | "teeth" | "pegs" | "coiled" | "wrapped" | "other"
  | "smallOfBack" | "shoulderHolster" | "ankle" | "patrolSling";
export const CARRIES: readonly Carry[] = [
  "hip", "oppositeHip", "sameHip", "shoulder", "backSling", "inHand", "quiver", "ground",
  "elsewhere", "chestHandleDown", "boot", "belt", "concealed", "teeth", "pegs", "coiled", "wrapped", "other",
  "smallOfBack", "shoulderHolster", "ankle", "patrolSling",
];

/** The Fast-Draw specialty a skill's name gives, lower-cased and hyphen-free. */
export function specialtyOf(skill: string): string {
  return (/\(([^)]+)\)/.exec(skill)?.[1] ?? "").trim().toLowerCase().replace(/[\s-]+/g, "");
}

/** A place that is easy to reach from a low posture: a boot, or an ankle holster (High-Tech p. 82). */
export function lowCarry(carry: Carry | null): boolean {
  return carry === "boot" || carry === "ankle";
}

/** Whether a boot's own -2 is ignored: from a crouch, kneeling or sitting. */
export function bootReachable(posture: string): boolean {
  return posture === "crouching" || posture === "kneeling" || posture === "sitting";
}

/**
 * The situation's modifiers to a Fast-Draw roll, or a DX roll to reach a
 * weapon (Martial Arts p. 103, High-Tech pp. 81-82). A weapon in a boot is
 * easy to reach from a crouch, kneeling or sitting: neither that posture's -2
 * nor the boot's applies.
 */
export function situationModifiers(options: {
  posture: string;
  grappled: boolean;
  upsideDown: boolean;
  moving: boolean;
  hand: Hand;
  carry: Carry | null;
}): Array<{ key: string; value: number }> {
  const lines: Array<{ key: string; value: number }> = [];
  const low = bootReachable(options.posture);
  if (options.posture === "crawling" || options.posture === "lying") lines.push({ key: "posture", value: -4 });
  else if (low && !lowCarry(options.carry)) lines.push({ key: "posture", value: -2 });
  if (options.grappled) lines.push({ key: "grappled", value: -4 });
  if (options.upsideDown && options.carry !== "chestHandleDown") lines.push({ key: "upsideDown", value: -2 });
  if (options.moving) lines.push({ key: "moving", value: -2 });
  if (options.hand === "off") lines.push({ key: "offHand", value: -4 });
  return lines;
}

/** What a book's carry figures may depend on beyond the place. */
export interface CarryOptions {
  reversedGrip?: boolean;
  noScabbard?: boolean;
  posture?: string;
}

/**
 * A carry location's modifier for a Fast-Draw specialty, as a book's table
 * gives it; null where that table doesn't list the specialty at that place.
 */
export type CarryFigures = (specialty: string, carry: Carry, options?: CarryOptions) => number | null;
