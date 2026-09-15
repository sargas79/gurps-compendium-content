/**
 * Readying weapons (GURPS Martial Arts pp. 101-104): the pure rules for
 * multiple Fast-Draw, Fast-Draw from odd positions and carry locations, rapid
 * grip changes, and quick-readying nearby weapons.
 */

export type Hand = "master" | "off" | "both";
export type Grip = "regular" | "defensive" | "reversed";
export const GRIPS: readonly Grip[] = ["regular", "defensive", "reversed"];

/** Draws made so far this turn, by hand. A two-handed draw counts for both. */
export interface DrawCounts {
  master: number;
  off: number;
}

/**
 * The multiple Fast-Draw penalty (p. 103): -2 per earlier attempt with the
 * hand (the worse hand for a two-handed draw), and -2 per weapon when drawing
 * several identical ones at once. Heroic Archer or Weapon Master halves it,
 * and both quarter it, rounding in the warrior's favor.
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

/** Where a weapon is carried, as the carry-location table names it. */
export type Carry =
  | "hip" | "oppositeHip" | "sameHip" | "shoulder" | "backSling" | "inHand" | "quiver" | "ground"
  | "elsewhere" | "chestHandleDown" | "boot" | "belt" | "concealed" | "teeth" | "pegs" | "coiled" | "wrapped" | "other";
export const CARRIES: readonly Carry[] = [
  "hip", "oppositeHip", "sameHip", "shoulder", "backSling", "inHand", "quiver", "ground",
  "elsewhere", "chestHandleDown", "boot", "belt", "concealed", "teeth", "pegs", "coiled", "wrapped", "other",
];

/** The Fast-Draw specialty a skill's name gives, lower-cased and hyphen-free. */
export function specialtyOf(skill: string): string {
  return (/\(([^)]+)\)/.exec(skill)?.[1] ?? "").trim().toLowerCase().replace(/[\s-]+/g, "");
}

/** A carry location's modifier for a specialty (p. 104); null where the table doesn't list that place. */
export function carryModifier(specialty: string, carry: Carry, options: { reversedGrip?: boolean; noScabbard?: boolean } = {}): number | null {
  const table: Record<string, Partial<Record<Carry, number>>> = {
    arrow: { ground: 1, quiver: 0, belt: -2 },
    flexible: { coiled: 0, wrapped: -2 },
    forcesword: { hip: 0, elsewhere: -1, boot: -2, concealed: -3 },
    knife: { hip: 0, quiver: 0, elsewhere: -1, chestHandleDown: -1, boot: -2, belt: -2, concealed: -3, teeth: -5 },
    shuriken: { pegs: 0, other: -3 },
    sword: { oppositeHip: 0, shoulder: 0, sameHip: options.reversedGrip ? 0 : -1, inHand: 0 },
    tonfa: { sameHip: 0, oppositeHip: -1, other: -2 },
    twohandedsword: { backSling: 0, shoulder: 0, inHand: 0, other: -2 },
  };
  const row = table[specialty];
  if (!row || row[carry] === undefined) return null;
  return row[carry]! + (specialty === "sword" && options.noScabbard ? -2 : 0);
}

/**
 * The situation's modifiers to a Fast-Draw roll, or a DX roll to reach a
 * weapon (p. 103). A weapon in a boot is easy to reach from a crouch, kneeling
 * or sitting: neither that posture's -2 nor the boot's applies.
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
  const low = options.posture === "crouching" || options.posture === "kneeling" || options.posture === "sitting";
  if (options.posture === "crawling" || options.posture === "lying") lines.push({ key: "posture", value: -4 });
  else if (low && options.carry !== "boot") lines.push({ key: "posture", value: -2 });
  if (options.grappled) lines.push({ key: "grappled", value: -4 });
  if (options.upsideDown && options.carry !== "chestHandleDown") lines.push({ key: "upsideDown", value: -2 });
  if (options.moving) lines.push({ key: "moving", value: -2 });
  if (options.hand === "off") lines.push({ key: "offHand", value: -4 });
  return lines;
}

/** Whether a boot's own -2 is ignored: from a crouch, kneeling or sitting. */
export function bootReachable(posture: string): boolean {
  return posture === "crouching" || posture === "kneeling" || posture === "sitting";
}

/** A rapid grip change's roll (p. 102): -4 two-handed, -6 one-handed, 0 with a tonfa. Never to or from a Defensive Grip. */
export function rapidGripPenalty(options: { twoHanded: boolean; tonfa: boolean }): number {
  if (options.tonfa) return 0;
  return options.twoHanded ? -4 : -6;
}

/** Where a nearby weapon is readied from in one second (p. 104), and the roll's modifier. */
export type QuickSource = "floorCrouch" | "floorFlip" | "rack" | "stuckOnFoot" | "stuckMounted";
export const QUICK_SOURCES: Readonly<Record<QuickSource, number>> = {
  floorCrouch: -3,
  floorFlip: -5,
  rack: -3,
  stuckOnFoot: -1,
  stuckMounted: -3,
};
