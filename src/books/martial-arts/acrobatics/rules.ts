/**
 * Acrobatic Stand, acrobatic movement, and Acrobatic and Flying Attacks
 * (GURPS Martial Arts pp. 98, 105-107): the pure rules.
 */

export type LowPosture = "lying" | "sitting" | "crawling";

/** Acrobatic Stand's roll: Acrobatics-6, less encumbrance, +4 for going all-out. */
export function standModifiers(encumbrance: number, allOut: boolean): Array<{ key: string; value: number }> {
  const lines = [{ key: "stand", value: -6 }];
  const enc = Math.max(0, Math.floor(Number(encumbrance) || 0));
  if (enc) lines.push({ key: "encumbrance", value: -enc });
  if (allOut) lines.push({ key: "allOut", value: 4 });
  return lines;
}

/**
 * Where Acrobatic Stand leaves you. From lying down: up (or in a crouch) on a
 * success, and a critical success counts as the step of an attack; sitting on a
 * failure; still lying on a critical failure. From sitting or crawling: up as a
 * step on a success; up but with the turn over on a failure; fallen on a
 * critical failure.
 */
export function standOutcome(
  from: LowPosture,
  outcome: { success: boolean; criticalSuccess: boolean; criticalFailure: boolean },
  crouch: boolean,
): { posture: "standing" | "crouching" | "sitting" | "lying"; note: "asStep" | "turnOver" | "none" } {
  const up = crouch ? "crouching" : "standing";
  if (from === "lying") {
    if (outcome.success) return { posture: up, note: outcome.criticalSuccess ? "asStep" : "none" };
    return { posture: outcome.criticalFailure ? "lying" : "sitting", note: "none" };
  }
  if (outcome.success) return { posture: up, note: "asStep" };
  if (outcome.criticalFailure) return { posture: "lying", note: "none" };
  return { posture: up, note: "turnOver" };
}

/** A movement stunt, the skills it may be rolled against, and what its one number means. */
export interface Stunt {
  key: string;
  skills: Array<{ name: string; modifier: number }>;
  /** The one figure the table supplies: yards moved, a footing penalty, further bounces, repeats. */
  input: "yards" | "penalty" | "bounces" | "repeats" | null;
}

export const STUNTS: readonly Stunt[] = [
  { key: "banisterSitting", skills: [{ name: "DX", modifier: -2 }, { name: "Acrobatics", modifier: -2 }], input: null },
  { key: "banisterStanding", skills: [{ name: "Acrobatics", modifier: -8 }], input: null },
  { key: "skidding", skills: [{ name: "DX", modifier: 0 }, { name: "Skating", modifier: 0 }], input: "penalty" },
  { key: "spinning", skills: [{ name: "Acrobatics", modifier: 0 }, { name: "Running", modifier: 0 }], input: "yards" },
  { key: "swinging", skills: [{ name: "Acrobatics", modifier: 0 }], input: "yards" },
  { key: "ticTac", skills: [{ name: "Acrobatics", modifier: -4 }, { name: "Jumping", modifier: -4 }], input: "bounces" },
  { key: "tumbling", skills: [{ name: "Acrobatics", modifier: 0 }], input: null },
  { key: "vaulting", skills: [{ name: "Acrobatics", modifier: 0 }], input: "repeats" },
];

/**
 * A stunt's roll: the best of its skills with that skill's modifier, and the
 * lines for what the table supplied. Null where the character has none of the
 * skills. `speedRange` is the system's speed/range table.
 */
export function stuntRoll(options: {
  stunt: Stunt;
  levelOf: (name: string) => number | null;
  input: number;
  /** Through a window or a gap, for a vault. */
  window?: boolean;
  /** As the movement of an Acrobatic Attack. */
  acrobaticAttack?: boolean;
  speedRange: (yards: number) => number;
}): { skill: string; base: number; modifiers: Array<{ key: string; value: number }> } | null {
  let best: { skill: string; base: number; modifier: number } | null = null;
  for (const entry of options.stunt.skills) {
    const level = options.levelOf(entry.name);
    if (level === null) continue;
    if (!best || level + entry.modifier > best.base + best.modifier) best = { skill: entry.name, base: level, modifier: entry.modifier };
  }
  if (!best) return null;
  const modifiers: Array<{ key: string; value: number }> = [];
  if (best.modifier) modifiers.push({ key: options.stunt.key, value: best.modifier });
  const input = Math.max(0, Math.floor(Math.abs(Number(options.input) || 0)));
  if (options.stunt.input === "yards" && input) {
    const speed = options.speedRange(input);
    if (speed) modifiers.push({ key: "speed", value: speed });
  }
  if (options.stunt.input === "penalty" && input) modifiers.push({ key: "footing", value: -input });
  if (options.stunt.input === "bounces" && input) modifiers.push({ key: "bounces", value: -2 * input });
  if (options.stunt.input === "repeats" && input) modifiers.push({ key: "repeats", value: -2 * input });
  if (options.window) modifiers.push({ key: "window", value: -4 });
  if (options.acrobaticAttack) modifiers.push({ key: "acrobaticAttack", value: -2 });
  return { skill: best.skill, base: best.base, modifiers };
}

/** The next dodge after a stunt counts as an Acrobatic Dodge: +2 if the stunt worked, -2 if not. */
export function acrobaticDodge(success: boolean): number {
  return success ? 2 : -2;
}

/** An Acrobatic Attack's extra -2 on the attack, and a Flying Attack's -1 more (-5 in all instead of -4). */
export function stuntAttackPenalty(kind: "acrobatic" | "flying" | null): number {
  if (kind === "acrobatic") return -2;
  if (kind === "flying") return -1;
  return 0;
}
