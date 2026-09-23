/**
 * Targeted Attacks and Combinations (GURPS Martial Arts pp. 64, 68, 80): the
 * pure rules for reading them from their names, their defaults and ceilings,
 * what a Combination's attacks roll against and what it costs, and techniques
 * used together. The TA's defaults and ceilings are the shared engine's, with
 * this book's table.
 */

import { buyOff as sharedBuyOff, hardLevels, targetDefaultPenalty, targetedAttackBounds, type TargetTable } from "../../../shared/targeted-attacks/rules.js";

export { hardLevels };

/**
 * A strike's penalty to hit each location (p. 68, as the Basic Set gives
 * them), -10 for chinks (-8 in the torso) and -4 against a weapon.
 */
export const MARTIAL_ARTS_TARGETS: TargetTable = {
  locations: { torso: 0, arm: -2, leg: -2, groin: -3, vitals: -3, hand: -4, foot: -4, face: -5, neck: -5, skull: -7, eye: -9 },
  chinks: { torso: -8, other: -10 },
  weapon: -4,
};

/** Attacks named by a basic move rather than a technique. */
const BASIC_ATTACKS = ["swing", "thrust", "punch", "grab", "grapple", "throw", "disarm"];

/**
 * The striking techniques a TA may name, longest first so "Lethal Kick" isn't
 * read as "Kick", each with the penalty it adds when defaulting from the skill,
 * and the technique it defaults from instead.
 */
const SPECIAL_ATTACKS: ReadonlyArray<{ name: string; penalty: number; technique: string }> = [
  { name: "lethal kick", penalty: -4, technique: "Lethal Kick" },
  { name: "lethal strike", penalty: -2, technique: "Lethal Strike" },
  { name: "elbow strike", penalty: -2, technique: "Elbow Strike" },
  { name: "knee strike", penalty: -1, technique: "Knee Strike" },
  { name: "kicking", penalty: -2, technique: "Kicking" },
  { name: "kick", penalty: -2, technique: "Kicking" },
];

export interface TargetedAttack {
  skill: string;
  /** The move, lower-cased: "swing", "punch", "knee strike". */
  attack: string;
  /** The location, lower-cased, "weapon", or null where the part names none (a Judo Throw after a grapple). */
  target: string | null;
  chinks: boolean;
}

/** Reads "Skill Attack/Target", as a TA's name or a Combination's part writes it. */
export function readAttack(text: string): TargetedAttack | null {
  const [left, right] = String(text ?? "").split("/").map((s) => s.trim());
  if (!left) return null;
  const lower = left.toLowerCase();
  const special = SPECIAL_ATTACKS.find((s) => lower.endsWith(` ${s.name}`));
  const basic = BASIC_ATTACKS.find((a) => lower.endsWith(` ${a}`));
  const attack = special?.name ?? basic;
  if (!attack) return null;
  const skill = left.slice(0, left.length - attack.length).trim();
  if (!skill) return null;
  let target: string | null = null;
  let chinks = false;
  if (right) {
    const t = right.toLowerCase();
    chinks = /\bchinks\b/.test(t);
    target = t.replace(/\bchinks\b/, "").trim() || "torso";
  }
  return { skill, attack, target, chinks };
}

/** A TA from its technique name, "TA (Skill Attack/Target)". */
export function readTargetedAttack(name: string): TargetedAttack | null {
  const inner = /^TA\s*\((.+)\)\s*$/i.exec(String(name ?? ""))?.[1];
  const parsed = inner ? readAttack(inner) : null;
  return parsed?.target ? parsed : null;
}

/** A Combination's parts from its technique name, "Combination (A + B + C)". */
export function readCombination(name: string): TargetedAttack[] | null {
  const inner = /^Combination\s*\((.+)\)\s*$/i.exec(String(name ?? ""))?.[1];
  if (!inner) return null;
  const parts = inner.split("+").map((part) => readAttack(part));
  return parts.length >= 2 && parts.length <= 3 && parts.every(Boolean) ? (parts as TargetedAttack[]) : null;
}

const grappling = (attack: string) => attack === "grab" || attack === "grapple";

/**
 * A TA's default penalty (p. 68): the location's penalty for a strike (or a
 * Judo throw), half of it for a grapple, -10 for chinks (-8 in the torso),
 * -4 against a weapon and -2 more to disarm except with a fencing weapon.
 */
export function targetPenalty(ta: TargetedAttack, fencing = false): number {
  if (ta.target === "weapon") return targetDefaultPenalty(MARTIAL_ARTS_TARGETS, "weapon", false) + (ta.attack === "disarm" && !fencing ? -2 : 0);
  const penalty = targetDefaultPenalty(MARTIAL_ARTS_TARGETS, ta.target, ta.chinks);
  return grappling(ta.attack) && !ta.chinks ? -Math.ceil(-penalty / 2) : penalty;
}

/** The penalty a striking technique adds when a TA defaults from the skill (p. 68). */
export function specialAttackPenalty(attack: string): number {
  return SPECIAL_ATTACKS.find((s) => s.name === attack)?.penalty ?? 0;
}

/** The technique a TA's attack also defaults from, e.g. "Knee Strike (Karate)". */
export function specialTechniqueName(ta: TargetedAttack): string | null {
  const special = SPECIAL_ATTACKS.find((s) => s.name === ta.attack);
  if (special) return `${special.technique} (${ta.skill})`;
  return ta.attack === "disarm" ? `Disarming (${ta.skill})` : null;
}

/** How much of a TA's penalty improving it may buy off (p. 68): half (rounded up), or all of it for a grapple. */
export function buyOff(penalty: number, attack: string): number {
  return sharedBuyOff(penalty, attack === "grapple");
}

/**
 * A TA's level and ceiling (p. 68), from the best of its defaults: the skill
 * with the location and any striking technique's penalty, or the striking
 * technique with the location's penalty alone.
 */
export function targetedAttackLevel(ta: TargetedAttack, options: { skill: number | null; technique: number | null; points: number; fencing?: boolean }): { level: number | null; default: number | null; ceiling: number | null } {
  const penalty = targetPenalty(ta, options.fencing);
  return targetedAttackBounds([
    options.skill === null ? null : options.skill + penalty + specialAttackPenalty(ta.attack),
    options.technique === null ? null : options.technique + penalty,
  ], buyOff(penalty, ta.attack), options.points);
}

/** A Combination's default penalty per attack (p. 80): -6 for two, -12 for three, halved with master training. */
export function combinationPenalty(attacks: number, master: boolean): number {
  const raw = attacks >= 3 ? -12 : -6;
  return master ? raw / 2 : raw;
}

/** Levels a Combination's points buy (p. 80): a Hard technique plus a point per attack. */
export function combinationLevels(points: number, attacks: number): number {
  const p = Math.floor(Number(points) || 0);
  return p > attacks + 1 ? p - attacks - 1 : 0;
}

/**
 * A Combination's levels, one per attack (p. 80): each part's own level at the
 * Combination's penalty, improved together by the levels bought, which can at
 * most buy off that penalty.
 */
export function combinationPartLevels(partLevels: readonly number[], options: { points: number; master: boolean }): number[] {
  const penalty = combinationPenalty(partLevels.length, options.master);
  const bought = Math.min(-penalty, combinationLevels(options.points, partLevels.length));
  return partLevels.map((level) => level + penalty + bought);
}

/** Whether a fighter can use a three-attack Combination: master training, or 5 points spent on it (p. 80). */
export function combinationUsable(attacks: number, points: number, master: boolean): boolean {
  return attacks < 3 || master || Math.floor(Number(points) || 0) >= 5;
}

/** Whether a part needs the one before it to have worked: a throw needs its grapple (p. 80). */
export function needsSetup(part: TargetedAttack): boolean {
  return part.attack === "throw";
}

/** The bonus to defend against the rest of a Combination once one of its attacks missed or was defended (p. 80). */
export const COMBINATION_DEFENSE_BONUS = 3;

/** The defense bonus for a predictable TA or Combination (pp. 68, 80): +1 from the third use on a foe. */
export function predictability(usesBefore: number): number {
  return usesBefore >= 2 ? 1 : 0;
}

/** Techniques used together (p. 64): each one's level relative to the skill, added up and applied to the skill. */
export function techniquesTogether(skill: number, techniqueLevels: readonly number[]): number {
  return skill + techniqueLevels.reduce((sum, level) => sum + (level - skill), 0);
}

/** The combat skills whose techniques also default to the Art and Sport versions (p. 64). */
export function artAndSport(skill: string): string[] {
  const base = String(skill ?? "").trim();
  if (!base || /\b(art|sport)$/i.test(base)) return [];
  return [`${base} Art`, `${base} Sport`];
}
