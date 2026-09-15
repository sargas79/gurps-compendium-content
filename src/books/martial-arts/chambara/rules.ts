/**
 * Chambara fighting (GURPS Martial Arts pp. 128-130): movement, attacks and
 * defenses for masters, and the special feats of Flying Leap, Light Walk and
 * Lizard Climb. The pure rules.
 */

/** Only fighters with Trained by a Master or Weapon Master fight like this (p. 128). */
export function isMaster(traitNames: readonly string[]): boolean {
  return traitNames.some((name) => /^(trained by a master|weapon master)\b/i.test(name));
}

/** A master with Acrobatics and Jumping at DX or better leaps his full jumping distance in combat (p. 128). */
export function leapsFully(options: { dx: number; acrobatics: number | null; jumping: number | null }): boolean {
  return options.acrobatics !== null && options.jumping !== null && options.acrobatics >= options.dx && options.jumping >= options.dx;
}

/** A stunt's total penalty, halved and rounded in the negative direction; a bonus is left alone (p. 128). */
export function halvedPenalty(total: number): number {
  return total < 0 ? Math.floor(total / 2) : total;
}

// ── attacks (pp. 128-129) ──

/** The basic attacks a master may trade for steps: all but one, less those already traded. */
export function tradeableAttacks(options: { basicAttacks: number; traded: number }): number {
  return Math.max(0, Math.floor(options.basicAttacks) - 1 - Math.max(0, Math.floor(options.traded)));
}

/** Steps this turn: the maneuver's own, plus one per attack traded. */
export function stepsThisTurn(options: { maneuverSteps: number; traded: number }): number {
  return Math.max(0, options.maneuverSteps) + Math.max(0, options.traded);
}

export type ChambaraTechnique = "acrobatic" | "flying" | "spinning";
export const CHAMBARA_TECHNIQUES: readonly ChambaraTechnique[] = ["acrobatic", "flying", "spinning"];

/** The versions that are a Move and Attack; the spinning one is a Wild Swing on any attack. */
export function onMoveAndAttack(kind: ChambaraTechnique): boolean {
  return kind !== "spinning";
}

/**
 * A chambara version of an offensive technique, at default (p. 129): -6, and
 * the skill cap of 9 lifted. An acrobatic or flying version buys off Move and
 * Attack's -4 and the stunt's own -1; a spinning one buys off the Wild Swing's
 * penalty (`wildSwing`, the line already on the roll).
 */
export function chambaraTechniqueLines(kind: ChambaraTechnique, stuntPenalty: number, wildSwing = 0): Array<{ key: string; value: number }> {
  const lines = [{ key: "techniqueDefault", value: -6 }];
  if (kind === "spinning") {
    if (wildSwing < 0) lines.push({ key: "wildSwing", value: -wildSwing });
    return lines;
  }
  lines.push({ key: "moveAndAttack", value: 4 });
  if (stuntPenalty < 0) lines.push({ key: "stunt", value: -stuntPenalty });
  return lines;
}

// ── defenses (p. 129) ──

/** A master's retreat: +3 for any defense, -1 per retreat already made this turn, and -1 per yard for one past a step. */
export function retreatLines(options: { previous: number; yards: number }): Array<{ key: string; value: number }> {
  const lines = [{ key: "retreat", value: 3 }];
  const previous = Math.max(0, Math.floor(options.previous));
  if (previous) lines.push({ key: "again", value: -previous });
  const yards = Math.max(1, Math.floor(options.yards));
  if (yards > 1) lines.push({ key: "yards", value: -yards });
  return lines;
}

/** Whether a retreat of these yards fits in what's left of the fighter's Move this turn. */
export function retreatFits(options: { move: number; used: number; yards: number }): boolean {
  return Math.max(0, options.used) + Math.max(1, Math.floor(options.yards)) <= Math.max(0, options.move);
}

/** The Acrobatics roll for an acrobatic defense: -1 per acrobatic defense already made this turn. */
export function acrobaticDefensePenalty(previous: number): number {
  return -Math.max(0, Math.floor(previous)) || 0;
}

// ── special feats (pp. 129-130) ──

/**
 * Flying Leap's easier leaps (p. 129): +5 for one that only doubles, +5 for a
 * floating one, +10 for both, but only to cancel the penalty for haste.
 */
export function flyingLeapBonus(options: { double: boolean; floating: boolean; haste: number }): number {
  const bonus = (options.double ? 5 : 0) + (options.floating ? 5 : 0);
  return Math.min(bonus, Math.max(0, -Math.floor(options.haste)));
}

/** A Flying Leap costs 1 FP, but an easier leap that succeeds by 5 or more costs nothing. */
export function flyingLeapFatigue(options: { easier: boolean; success: boolean; margin: number }): number {
  return options.easier && options.success && options.margin >= 5 ? 0 : 1;
}

export type LightWalkSurface = "skylight" | "tent" | "laundry" | "hedge" | "treetop";
/** Light Walk across a fragile surface (p. 130). */
export const LIGHT_WALK_SURFACES: Readonly<Record<LightWalkSurface, number>> = { skylight: 0, tent: -2, laundry: -4, hedge: -6, treetop: -8 };

/** A feat of balance: +8, plus the Size Modifier for the thickness stood on (p. 130). */
export function balanceModifier(thicknessSm: number): number {
  return 8 + Math.floor(Number(thicknessSm) || 0);
}

/** A fighter stood on has -4 to hit with anything else (p. 130). */
export const STOOD_ON_PENALTY = -4;

/** A Lizard Climb retreat upward (p. 130): +1 more to the retreat, an automatic defense, or a failed one. */
export function lizardRetreat(outcome: { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean }): "bonus" | "automatic" | "fails" | "criticallyFails" {
  if (outcome.criticalSuccess) return "automatic";
  if (outcome.success) return "bonus";
  return outcome.criticalFailure ? "criticallyFails" : "fails";
}

/** Hands left free to parry or block cost the climb -2 each, of the four extremities it wants (p. 130). */
export function lizardHandsPenalty(freeExtremities: number): number {
  return -2 * Math.max(0, Math.min(4, Math.floor(freeExtremities))) || 0;
}
