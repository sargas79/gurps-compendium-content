/**
 * Shoves and slams with weapons, and striking at or grabbing shields (GURPS
 * Martial Arts pp. 112-113). The pure rules.
 */

/** Weapons too flexible to shove with (p. 112). */
const FLEXIBLE = ["kusari", "whip", "flail", "two-handed flail", "monowire whip", "force whip", "garrote", "lariat", "bolas"];

/** The skills of the long weapons that can cross-check in two hands (p. 112). */
const CROSS_CHECK = ["polearm", "spear", "staff", "two-handed axe/mace", "two-handed flail"];

/** A weapon's longest reach in yards: "C" is 0, "1,2*" is 2. */
export function longestReach(reach: string): number {
  const yards = String(reach ?? "").replace(/\*/g, "").split(/[,-]/).map((part) => part.trim()).map((part) => (part === "C" ? 0 : Number(part)));
  return Math.max(0, ...yards.filter(Number.isFinite));
}

/** Whether a melee weapon can shove: rigid, with reach 1 or more (p. 112). */
export function canShoveWith(skill: string, reach: string): boolean {
  return !FLEXIBLE.includes(skill.trim().toLowerCase()) && longestReach(reach) >= 1;
}

/**
 * Whether a weapon can slam or shove two foes (p. 112): reach 2+, ready in two
 * hands, and a Polearm, Spear, Staff, Two-Handed Axe/Mace or Two-Handed Flail
 * weapon -- or a Two-Handed Sword weapon in a Defensive Grip.
 */
export function canCrossCheck(options: { skill: string; reach: string; twoHanded: boolean; defensiveGrip: boolean }): boolean {
  if (!options.twoHanded || longestReach(options.reach) < 2) return false;
  const skill = options.skill.trim().toLowerCase();
  return CROSS_CHECK.includes(skill) || (skill === "two-handed sword" && options.defensiveGrip);
}

/** Two foes at once: -4 to hit each (p. 112). */
export const TWO_FOES = -4;
/** A cross-check at the neck (p. 112). */
export const NECK = -5;

/**
 * The penalty to strike at a shield or cloak (p. 113): the -4 to hit a reach 1
 * weapon, plus its Defense Bonus.
 */
export function shieldStrikePenalty(db: number): number {
  return -4 + Math.max(0, Math.floor(Number(db) || 0));
}

/** Whether a shield or cloak can be knocked away rather than only damaged: a cloak or buckler (p. 113). */
export function canKnockAway(skill: string): boolean {
  const s = skill.trim().toLowerCase();
  return s === "cloak" || s === "shield (buckler)";
}

/** The penalty to grab a shield or cloak (p. 113): -4 plus its Defense Bonus. */
export function grabShieldPenalty(db: number): number {
  return shieldStrikePenalty(db);
}

/** What breaking free of a grabbed shield brings each side (p. 113): +5 to a two-handed grab, +4 to a strapped shield. */
export function breakFreeModifiers(twoHandedGrab: boolean, strapped: boolean): { grabber: number; victim: number } {
  return { grabber: twoHandedGrab ? 5 : 0, victim: strapped ? 4 : 0 };
}
