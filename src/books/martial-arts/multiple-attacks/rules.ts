/**
 * Multiple attacks (GURPS Martial Arts pp. 126-128): the pure rules for how
 * many attacks a maneuver yields, Rapid Strikes of more than two attacks, and
 * switching targets.
 */

/**
 * The attacks a maneuver yields (p. 126): one per attacking maneuver, one more
 * per level of Extra Attack, and All-Out Attack (Double) adds one attack rather
 * than doubling them.
 */
export function baseAttacks(options: { attacks: boolean; extraAttacks: number; allOutDouble: boolean }): number {
  if (!options.attacks) return 0;
  return 1 + Math.max(0, Math.floor(options.extraAttacks)) + (options.allOutDouble ? 1 : 0);
}

/** The Rapid Strike penalty per extra attack (p. 127). */
export const RAPID_STRIKE_STEP = -6;

/**
 * A Rapid Strike's penalty on each of its attacks (p. 127): -6 per attack past
 * the first, applied to all of them, and halved (in the fighter's favour) with
 * Trained by a Master or Weapon Master: -9 for a Weapon Master's four attacks.
 */
export function rapidStrikePenalty(attacks: number, halved: boolean): number {
  const extra = Math.max(1, Math.floor(attacks) - 1);
  const raw = RAPID_STRIKE_STEP * extra;
  return halved ? Math.ceil(raw / 2) : raw;
}

/** The most attacks a Rapid Strike may have: two, or any number under the cinematic rule (p. 127). */
export function rapidStrikeLimit(cinematic: boolean): number {
  return cinematic ? 9 : 2;
}

/**
 * Attacks a change of target uses up (pp. 127-128): one per full yard skipped
 * between one target and the next, so foes side by side cost nothing and a
 * yard's gap costs one attack.
 */
export function skippedAttacks(yardsBetween: number): number {
  return Math.max(0, Math.floor(yardsBetween + 1e-9) - 1);
}

/** The attacks left in a sequence once those spent on feints and skipped yards are taken off. */
export function attacksLeft(options: { base: number; rapidStrikeExtra: number; feints: number; skipped: number }): number {
  return Math.max(0, options.base + options.rapidStrikeExtra - options.feints - options.skipped);
}

/** The special options that each trade one attack of a maneuver (p. 127). */
export type SpecialOption = "rapidStrike" | "combination" | "dualWeapon";

/** Why a special option can't be taken: one per maneuver, and no Rapid Strike on Move and Attack. */
export function specialRefusal(wanted: SpecialOption, used: SpecialOption | null, maneuver: string): "oneSpecial" | "noRapidOnMove" | null {
  if (wanted === "rapidStrike" && maneuver === "moveAndAttack") return "noRapidOnMove";
  if (used && used !== wanted) return "oneSpecial";
  return null;
}

/** A grappling move's key within a sequence: the same move on the same foe can't repeat (p. 128). */
export function grappleMoveKey(move: string, foe: string): string {
  return `${move}:${foe}`;
}
