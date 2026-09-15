/**
 * Melee attack options (GURPS Martial Arts pp. 109-113): the pure rules for
 * Defensive Grip and half-swording, Reversed Grip, Pummeling, Tip Slash and
 * Telegraphic Attack.
 */

import type { Grip } from "../readying/rules.js";

/** Whether a grip is a Defensive Grip, half-swording included. */
export function isDefensive(grip: Grip): boolean {
  return grip === "defensive" || grip === "halfSword";
}

/** The swords that can be half-sworded: "a sword held behind the tip" (p. 111). */
const SWORD_SKILLS = ["broadsword", "shortsword", "two-handed sword", "rapier", "saber", "smallsword"];

/** Whether a skill is a sword skill, which half-swording needs. */
export function isSwordSkill(skill: string): boolean {
  return SWORD_SKILLS.includes(String(skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase());
}

/**
 * A swing's damage penalty in a Defensive Grip with a two-handed weapon, or
 * any swing in a Reversed Grip (pp. 110, 112): -2, or -1 per die if that is
 * worse.
 */
export function swingDamagePenalty(dice: number): number {
  return -Math.max(2, Math.floor(Number(dice) || 0));
}

/** The reach column's entries, as written. */
function reaches(reach: string): string[] {
  return String(reach ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

/**
 * Reach in a Reversed Grip (p. 111): a reach 1 weapon works at reach C, and a
 * reach 2 one drops to reach 1. A "*" stays with its entry.
 */
export function reversedReach(reach: string): string {
  const mapped = reaches(reach).map((entry) => {
    const star = entry.endsWith("*") ? "*" : "";
    const yards = entry.replace("*", "");
    if (yards === "1") return `C${star}`;
    if (yards === "2") return `1${star}`;
    return entry;
  });
  return [...new Set(mapped)].join(", ");
}

/** Whether a weapon can take a Reversed Grip: a thrusting weapon of reach C, 1 or 2 (p. 111). */
export function canReverse(reach: string, thrusts: boolean): boolean {
  const entries = reaches(reach).map((entry) => entry.replace("*", ""));
  return thrusts && entries.length > 0 && entries.every((entry) => ["C", "1", "2"].includes(entry));
}

/** The longest reach in a column, as text: "C" when it reaches no further (p. 113). */
export function longestReachText(reach: string): string {
  const yards = reaches(reach).map((entry) => Number(entry.replace("*", ""))).filter(Number.isFinite);
  return yards.length > 0 ? String(Math.max(...yards)) : "C";
}

/** Whether a weapon reaches C or 1, which Pummeling needs (p. 111). */
export function canPummel(reach: string): boolean {
  return reaches(reach).some((entry) => ["C", "1"].includes(entry.replace("*", "")));
}

/** What one of an item's melee rows becomes in a grip, as the Combat tab shows it. */
export interface GripRowChange {
  skill: number;
  damage: number;
  reach: string | null;
  parry: number;
  twoHanded: boolean | null;
  /** The row can't be used: no swings when half-swording. */
  refused: "noSwing" | null;
}

/**
 * A melee row's changes for its weapon's grip (pp. 109-112).
 *
 * - Defensive Grip with a one-handed weapon: -2 to hit, +1 damage, and it counts
 *   as two-handed.
 * - Defensive Grip with a two-handed weapon: swings at -2 damage, or -1 per die.
 * - Half-swording, a sword's Defensive Grip: reach C, and no swings.
 * - Reversed Grip: the reach shortens, thrusts get +1 damage, swings -2 (or -1
 *   per die), and the weapon parries at -2.
 *
 * The Defensive Grip's +1 to parry depends on where the blow comes from, so it
 * is left to the defense.
 */
export function gripRowChange(grip: Grip, row: { twoHanded: boolean; swung: boolean; reach: string; dice: number; sword: boolean }): GripRowChange {
  const change: GripRowChange = { skill: 0, damage: 0, reach: null, parry: 0, twoHanded: null, refused: null };
  if (isDefensive(grip)) {
    if (!row.twoHanded) Object.assign(change, { skill: -2, damage: 1, twoHanded: true });
    else if (row.swung) change.damage = swingDamagePenalty(row.dice);
    if (grip === "halfSword" && row.sword) {
      change.reach = "C";
      if (row.swung) change.refused = "noSwing";
    }
  } else if (grip === "reversed") {
    change.reach = reversedReach(row.reach);
    change.damage = row.swung ? swingDamagePenalty(row.dice) : 1;
    change.parry = -2;
  }
  return change;
}

/**
 * A Defensive Grip's parry (p. 110): +1 against attacks from the front, and an
 * extra -1 from the side. Outside tactical combat every blow counts as from the
 * front.
 */
export function defensiveGripParry(arc: string | null): number {
  if (arc === "side") return -1;
  if (arc === "back") return 0;
  return 1;
}

/** A Defensive Grip's -1 to the odds of breakage with a two-handed weapon (p. 110). */
export const DEFENSIVE_GRIP_BREAKAGE = -1;

/** Telegraphic Attack (p. 113): +4 to hit, and +2 to every defense against it. */
export const TELEGRAPHIC_HIT = 4;
export const TELEGRAPHIC_DEFENSE = 2;

/**
 * Pummeling's skill (p. 111): DX-1, Brawling-1 or Karate-1, or Hammer Fist or
 * Two-Handed Punch where either is better. Full skill with a tonfa or a sword
 * with a knuckle guard. Returns the score and what it is from, or null.
 */
export function pummelSkill(options: {
  dx: number;
  brawling: number | null;
  karate: number | null;
  hammerFist: number | null;
  twoHandedPunch: number | null;
  fullSkill: number | null;
}): { level: number; skill: string } {
  const candidates: Array<{ level: number; skill: string }> = [{ level: options.dx - 1, skill: "DX" }];
  if (options.brawling !== null) candidates.push({ level: options.brawling - 1, skill: "Brawling" });
  if (options.karate !== null) candidates.push({ level: options.karate - 1, skill: "Karate" });
  if (options.hammerFist !== null) candidates.push({ level: options.hammerFist, skill: "Hammer Fist" });
  if (options.twoHandedPunch !== null) candidates.push({ level: options.twoHandedPunch, skill: "Two-Handed Punch" });
  if (options.fullSkill !== null) candidates.push({ level: options.fullSkill, skill: "" });
  return candidates.reduce((best, next) => (next.level > best.level ? next : best));
}

/**
 * A Reversed Grip's butt strike at reach 1 (p. 112): thrust damage for a
 * crushing weapon, thrust-1 crushing for any other.
 */
export function buttStrikeModifier(crushingWeapon: boolean): number {
  return crushingWeapon ? 0 : -1;
}

/**
 * A forearm parry in a Reversed Grip (p. 112): Brawling or Karate along the
 * forearm at -1, or no penalty with a tonfa. Returns the Parry, from the skill.
 */
export function forearmParry(skillLevel: number, tonfa: boolean): number {
  return 3 + Math.floor(skillLevel / 2) + (tonfa ? 0 : -1);
}
