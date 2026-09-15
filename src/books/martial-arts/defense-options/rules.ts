/**
 * Active defense options (GURPS Martial Arts pp. 121-125): the pure rules for
 * Cross Parry, retreat options, Riposte, leg parries, parrying with long
 * two-handed weapons, and the limits on dodging and blocking.
 */

/** A Cross Parry's score (p. 121): the better of the two weapons' Parries, +2. */
export function crossParryScore(parries: readonly number[]): number {
  return Math.max(...parries) + 2;
}

/**
 * What a Cross Parry against a heavy weapon counts as (p. 121): one two-handed
 * weapon of their combined weight and the lower quality, and the lighter one is
 * the one that breaks.
 */
export function crossParryBreakage<T extends { weight: number; quality: string }>(weapons: readonly T[], qualityRank: (quality: string) => number): { weight: number; quality: string; breaks: T } {
  const weight = weapons.reduce((sum, w) => sum + (Number(w.weight) || 0), 0);
  const quality = [...weapons].sort((a, b) => qualityRank(a.quality) - qualityRank(b.quality))[0]!.quality;
  const breaks = [...weapons].sort((a, b) => (Number(a.weight) || 0) - (Number(b.weight) || 0))[0]!;
  return { weight, quality, breaks };
}

/** The retreat options (pp. 123-124). */
export type RetreatOption = "dive" | "sideslip" | "slip";
export const RETREAT_OPTIONS: readonly RetreatOption[] = ["dive", "sideslip", "slip"];

/**
 * A retreat option's bonus (pp. 122-124): the retreat bonus less 1 for a dive
 * or sideslip and less 2 for a slip. A fencing parry's +3 is only +1 when
 * diving (or rolling).
 */
export function retreatOptionBonus(option: RetreatOption, retreatBonus: number, fencingParry: boolean): number {
  const bonus = option === "dive" && fencingParry ? 1 : retreatBonus;
  return bonus + (option === "slip" ? -2 : -1);
}

/** The lowest a Riposte may take a Parry, before other modifiers (p. 124). */
export const RIPOSTE_FLOOR = 8;

/** Whether a Riposte's penalty is allowed: the Parry may not go below 8 (p. 124). */
export function riposteAllowed(parry: number, penalty: number): boolean {
  return penalty > 0 && parry - penalty >= RIPOSTE_FLOOR;
}

/** What the foe attacked with, which decides which of his defenses a Riposte takes most from. */
export type RiposteAgainst = "parry" | "block" | "dodge";

/**
 * A Riposte's penalties on the foe's defenses against the ripostor's next
 * attack (p. 124): the matching defense takes the whole penalty and the others
 * half, rounded down.
 */
export function ripostePenalties(penalty: number, against: RiposteAgainst): Record<RiposteAgainst, number> {
  const half = -Math.floor(penalty / 2);
  return {
    parry: against === "parry" ? -penalty : half,
    block: against === "block" ? -penalty : half,
    dodge: against === "dodge" ? -penalty : half,
  };
}

/** The defense a Riposte hits hardest (p. 124): the parried hand's Parry, the shield's Block, or Dodge against a non-hand unarmed attack. */
export function riposteAgainst(attack: { shield: boolean; unarmed: boolean; hand: boolean }): RiposteAgainst {
  if (attack.shield) return "block";
  if (attack.unarmed && !attack.hand) return "dodge";
  return "parry";
}

/** The locations a leg parry defends (p. 123): the feet, legs and groin. */
export function legParryDefends(hitLocation: string | null | undefined): boolean {
  return hitLocation === "leg" || hitLocation === "foot" || hitLocation === "groin";
}

/** A bare-handed parry from a skill: 3 + half the skill (Campaigns p. 376). */
export function unarmedParry(skill: number): number {
  return 3 + Math.floor(skill / 2);
}

/** The skills whose long two-handed weapons parry both halves of a Dual-Weapon Attack (p. 123). */
export function longTwoHandedParry(skill: string, longestReach: number, twoHanded: boolean): boolean {
  const base = String(skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return twoHanded && longestReach >= 2 && ["polearm", "spear", "staff", "two-handed sword"].includes(base);
}

/** The cumulative penalty for dodges after the first in a turn (p. 122). */
export function dodgeLimitPenalty(previous: number): number {
  return previous > 0 ? -previous : 0;
}

/**
 * The cumulative penalty for blocks after the first in a turn (p. 123): -5
 * each, or half that for a Weapon Master, rounded up: -3, -5, -8.
 */
export function multipleBlockPenalty(previous: number, weaponMaster: boolean): number {
  if (previous <= 0) return 0;
  const raw = 5 * previous;
  return -(weaponMaster ? Math.ceil(raw / 2) : raw);
}
