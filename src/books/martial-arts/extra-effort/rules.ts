/**
 * Extra effort in combat (GURPS Martial Arts p. 131): the pure rules for the
 * new options, the limit of one offensive and one defensive option a turn,
 * and Flurry of Blows on a Rapid Strike.
 */

export type EffortOption = "giantStep" | "greatLunge" | "heroicCharge" | "rapidRecovery" | "flurryOfBlows" | "mightyBlows" | "feverishDefense";

/** Which half of the limit an option counts against (p. 131). */
export function effortKind(option: EffortOption): "offense" | "defense" {
  return option === "rapidRecovery" || option === "feverishDefense" ? "defense" : "offense";
}

/** Why an option can't be taken: another of its kind already this turn. The same option again is fine. */
export function effortRefusal(option: EffortOption, used: { offense: EffortOption | null; defense: EffortOption | null }): "oneOffense" | "oneDefense" | null {
  const kind = effortKind(option);
  const already = kind === "offense" ? used.offense : used.defense;
  if (!already || already === option) return null;
  return kind === "offense" ? "oneOffense" : "oneDefense";
}

/** The maneuvers each new option may be taken on (p. 131). */
export function effortManeuvers(option: EffortOption, defensiveAttack: string, committedAttack: string): readonly string[] {
  switch (option) {
    case "giantStep":
      return ["attack", defensiveAttack];
    case "greatLunge":
      return ["attack", committedAttack, "moveAndAttack"];
    case "heroicCharge":
      return ["moveAndAttack"];
    case "mightyBlows":
      return ["attack"];
    default:
      return [];
  }
}

/**
 * Flurry of Blows on a Rapid Strike (p. 131): the penalty halved, dropping
 * fractions -- a Weapon Master's four attacks go from -9 to -4.
 */
export function flurryPenalty(rapidStrikePenalty: number): number {
  return Math.trunc(rapidStrikePenalty / 2);
}

/** Heroic Charge ignores Move and Attack's -4 and its cap of 9 (p. 131). */
export const MOVE_AND_ATTACK_PENALTY = -4;

/** A new option's critical failure costs 1 HP (p. 131). */
export const CRITICAL_INJURY = 1;
