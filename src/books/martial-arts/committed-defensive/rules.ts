/**
 * A Wait's response of Committed Attack or Defensive Attack (GURPS Martial
 * Arts p. 108): the pure rules. The maneuvers are the Basic Set's now (Revised,
 * pp. 575-576) and the system's; this is the figures a Wait's response takes
 * from them.
 *
 * Committed Attack: Determined for +2 to hit or Strong for +1 to ST-based
 * damage, and the defenses after it at -2, with no retreat, no parry with what
 * attacked, no block with a shield that attacked, and no dodge after a kick.
 * Defensive Attack: -2 damage, or -1 per die if that is worse.
 */

/** How a Committed Attack is made. */
export type CommittedMode = "determined" | "strong";
export const COMMITTED_MODES: readonly CommittedMode[] = ["determined", "strong"];

/** What a Defensive Attack buys. */
export type DefensiveBenefit = "parry" | "block" | "sameWeapon" | "kick";
export const DEFENSIVE_BENEFITS: readonly DefensiveBenefit[] = ["parry", "block", "sameWeapon", "kick"];

/** A Wait's response, named in advance: a Committed Attack must say which kind (p. 108). */
export type WaitResponse = "committedDetermined" | "committedStrong" | "defensive";
export const WAIT_RESPONSES: readonly WaitResponse[] = ["committedDetermined", "committedStrong", "defensive"];

/** The to-hit bonus a Committed Attack's mode gives. */
export function committedHitBonus(mode: CommittedMode | null): number {
  return mode === "determined" ? 2 : 0;
}

/** The damage bonus a Committed Attack's mode gives: +1 to ST-based thrust or swing damage, when Strong. */
export function committedDamageBonus(mode: CommittedMode | null, stBased: boolean): number {
  return mode === "strong" && stBased ? 1 : 0;
}

/** Every defense after a Committed Attack is at -2. */
export const COMMITTED_DEFENSE_PENALTY = -2;

/** A Defensive Attack's damage: -2, or -1 per die if that is worse. */
export function defensiveDamagePenalty(dice: number): number {
  return -Math.max(2, Math.floor(Number(dice) || 0));
}

/** What a fighter attacked with, as the defenses after it need to know. */
export interface AttackedWith {
  /** The weapon's id; blank for a natural attack. */
  itemId: string;
  kick: boolean;
  shield: boolean;
}

/** What a Committed Attack takes away, given what it was made with. */
export function committedRefusals(attacked: AttackedWith | null): { dodge: boolean; block: boolean } {
  return { dodge: Boolean(attacked?.kick), block: Boolean(attacked?.shield) };
}

/** A Wait response's stance, as the maneuvers would make it. */
export function stanceOfResponse(response: WaitResponse | null): { kind: "committed"; mode: CommittedMode } | { kind: "defensive"; benefit: null } | null {
  if (response === "committedDetermined") return { kind: "committed", mode: "determined" };
  if (response === "committedStrong") return { kind: "committed", mode: "strong" };
  if (response === "defensive") return { kind: "defensive", benefit: null };
  return null;
}

/** Whether a dice formula's attack is ST-based: thrust or swing, or a natural attack. */
export function isStBased(damageBase: string | null | undefined, natural: boolean): boolean {
  return natural || damageBase === "sw" || damageBase === "thr";
}
