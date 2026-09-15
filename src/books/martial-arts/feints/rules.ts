/**
 * Feints: Beats, Ruses, defensive feints, and resisting with the best combat
 * skill (GURPS Martial Arts pp. 49, 100-101): the pure rules.
 */

/** What a feint is made as, beyond the Basic Set's. */
export type FeintKind = "beat" | "ruse";
export const FEINT_KINDS: readonly FeintKind[] = ["beat", "ruse"];

/** The defense a Beat is aimed at. */
export type BeatDefense = "parry" | "block" | "dodge";
export const BEAT_DEFENSES: readonly BeatDefense[] = ["parry", "block", "dodge"];

/** A skill's level re-based on another attribute: DX-based 14 at DX 12 is 13 on ST 11. */
export function rebased(level: number, from: number, to: number): number {
  return level - from + to;
}

/**
 * The scores a Beat is rolled with (p. 100): the attacker's skill on ST, and
 * the defender's best of DX-based or ST-based.
 */
export function beatScores(options: {
  attacker: { skill: number; dx: number; st: number };
  defender: { best: number; dx: number; st: number };
}): { attacker: number; defender: number } {
  return {
    attacker: rebased(options.attacker.skill, options.attacker.dx, options.attacker.st),
    defender: Math.max(options.defender.best, rebased(options.defender.best, options.defender.dx, options.defender.st)),
  };
}

/**
 * The scores a Ruse is rolled with (p. 101): the attacker's skill on IQ, and
 * the defender's best of a Per-based skill, a DX-based one, or Tactics.
 */
export function ruseScores(options: {
  attacker: { skill: number; dx: number; iq: number };
  defender: { best: number; dx: number; per: number; tactics: number | null };
}): { attacker: number; defender: number } {
  return {
    attacker: rebased(options.attacker.skill, options.attacker.dx, options.attacker.iq),
    defender: Math.max(options.defender.best, rebased(options.defender.best, options.defender.dx, options.defender.per), options.defender.tactics ?? -Infinity),
  };
}

/**
 * How much of an attack's deception a defender who has been evaluating the
 * attacker takes off (p. 100): up to the Evaluate bonus, never past zero.
 */
export function evaluateOffset(deception: number, evaluateBonus: number): number {
  const penalty = Math.max(0, -Math.floor(Number(deception) || 0));
  return Math.min(penalty, Math.max(0, Math.floor(Number(evaluateBonus) || 0)));
}

/** The best score to resist a feint with: DX, any combat skill, or a Feint technique (p. 100). */
export function bestResistance(dx: number, combatSkills: readonly number[], feintTechniques: readonly number[]): number {
  return Math.max(dx, ...combatSkills, ...feintTechniques);
}

/** The skills the Evaluate bonus also helps against the evaluated foe (p. 100). */
export function evaluateHelps(skill: string): boolean {
  return /^(body language|observation|expert skill \(hoplology\))/i.test(skill.trim());
}
