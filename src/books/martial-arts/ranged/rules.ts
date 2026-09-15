/**
 * Ranged attack options (GURPS Martial Arts pp. 97, 119-121): the pure rules
 * for quick-shooting bows, Rapid Strike and Rapid Fire with thrown weapons,
 * aiming them, and prediction shots.
 */

/** What a quick-shooter brings to the two rolls (p. 119). */
export interface QuickShooter {
  heroicArcher: boolean;
  /** A Weapon Master whose weapons include this one. */
  weaponMaster: boolean;
  /** On All-Out Attack (Determined): +1 to both rolls. */
  determined: boolean;
  /** A realistic game, in combat: an extra -4 to the Bow and Fast-Draw rolls (p. 120). */
  realisticUnderFire: boolean;
}

/** The penalty on both quick-shooting rolls: -6, -3 with Heroic Archer or Weapon Master, -1 with both. */
export function quickShootPenalty(shooter: QuickShooter): number {
  const halvings = (shooter.heroicArcher ? 1 : 0) + (shooter.weaponMaster ? 1 : 0);
  const base = halvings === 2 ? -1 : halvings === 1 ? -3 : -6;
  return base + (shooter.determined ? 1 : 0) + (shooter.realisticUnderFire ? -4 : 0);
}

/** The extra -4 a realistic quick-shooter's Fast-Draw takes under fire (p. 120). */
export function quickDrawPenalty(realisticUnderFire: boolean): number {
  return realisticUnderFire ? -4 : 0;
}

/**
 * The Fast-Draw specialty that readies ammunition for a weapon that can be
 * quick-shot -- a bow, blowpipe or sling with RoF 1 and Shots 1(2) -- or
 * null for any other (p. 120).
 */
export function quickShootDraw(mode: { skill?: unknown; shots?: unknown; rateOfFire?: unknown }): string | null {
  if (String(mode.shots ?? "").replace(/\s/g, "") !== "1(2)" || (Number(mode.rateOfFire) || 1) !== 1) return null;
  const skill = String(mode.skill ?? "").trim().toLowerCase();
  if (skill === "bow" || skill.startsWith("blowpipe")) return "Fast-Draw (Arrow)";
  if (skill.startsWith("sling")) return "Fast-Draw (Stone)";
  return null;
}

/** The maneuvers a quick-shot may be made on: Attack or All-Out Attack (Determined), and Move and Attack for a Heroic Archer. */
export function quickShootManeuver(maneuver: string, allOutOption: string, heroicArcher: boolean): boolean {
  if (maneuver === "attack") return true;
  if (maneuver === "allOutAttack") return allOutOption === "determined";
  return heroicArcher && maneuver === "moveAndAttack";
}

/** How one hand's throws in a two-handed Rapid Strike are penalized: -4 for Dual-Weapon Attack, -4 more for the off hand (p. 121). */
export type ThrowingHand = "one" | "master" | "off";
export function throwingHandPenalty(hand: ThrowingHand): number {
  return hand === "master" ? -4 : hand === "off" ? -8 : 0;
}

/** How many of a weapon can be held ready to throw in one hand: four under 1 lb., otherwise one (p. 121). */
export function readyInHand(weight: number, fingers = 5): number {
  return weight > 0 && weight < 1 ? Math.max(1, fingers - 1) : 1;
}

/** Whether a damage type is a small sharp item's rather than a blunt one's. */
export function isSharp(damageType: string): boolean {
  return ["cut", "imp", "pi-", "pi", "pi+", "pi++"].includes(String(damageType).trim().toLowerCase());
}

/**
 * How many small weapons one hand can toss as a handful (p. 120): BL/50 lbs.
 * of sharp items or BL/20 lbs. of blunt ones, BL/20 for all in a cinematic
 * game, never more than there are.
 */
export function handfulCount(options: { basicLift: number; weight: number; sharp: boolean; cinematic: boolean; quantity: number }): number {
  const { basicLift, weight, sharp, cinematic, quantity } = options;
  if (!(weight > 0) || !(basicLift > 0)) return 0;
  const pounds = basicLift / (sharp && !cinematic ? 50 : 20);
  // A hair over, so 1.7 lbs. of 0.1-lb. stars is 17 and not 16.
  const count = Math.floor(pounds / weight + 1e-9);
  return Math.max(0, Math.min(count, Math.floor(Number(quantity) || 0)));
}

/** What a handful of `count` does to a single weapon's figures (p. 120): Acc 0, Rcl 2, Bulk -2. */
export function handfulProfile(count: number): { perDie: number; rangeFactor: number; accuracy: number; recoil: number; bulk: number } {
  const few = count <= 4;
  return { perDie: few ? -1 : -2, rangeFactor: few ? 2 / 3 : 1 / 3, accuracy: 0, recoil: 2, bulk: -2 };
}

/** A range cut to a fraction, rounded to the nearest yard. */
export function scaledRange(yards: number, factor: number): number {
  return Math.max(0, Math.round((Number(yards) || 0) * factor));
}

/** A prediction shot at `level`: -2 per level to hit, -1 per level to the target's Dodge only (p. 121). */
export function predictionShot(level: number): { toHit: number; dodge: number } {
  const n = Math.max(0, Math.floor(Number(level) || 0));
  return n > 0 ? { toHit: -2 * n, dodge: -n } : { toHit: 0, dodge: 0 };
}

/** A Deceptive Attack needs effective skill of at least 10 after every modifier (p. B369). */
export const DECEPTIVE_MINIMUM = 10;

/** A Heroic Archer's extra aim: +1 for the first second, +2 for two or more (p. 97). */
export function heroicArcherAim(turns: number): number {
  const t = Math.floor(Number(turns) || 0);
  return t >= 2 ? 2 : t === 1 ? 1 : 0;
}
