/**
 * Untrained fighters and Harsh Realism for Unarmed Fighters (GURPS Martial Arts
 * pp. 113, 124). The pure rules.
 */

const base = (skill: string) => skill.replace(/\s*\(.*$/, "").trim().toLowerCase();

/** The unarmed combat skills. */
export const UNARMED_SKILLS = ["boxing", "brawling", "judo", "karate", "sumo wrestling", "wrestling"];

/** The melee combat skills, unarmed ones included. */
const MELEE_SKILLS = [
  "axe/mace", "broadsword", "cloak", "flail", "garrote", "jitte/sai", "knife", "kusari", "lance", "main-gauche",
  "polearm", "rapier", "saber", "shield", "shortsword", "smallsword", "spear", "staff", "tonfa", "two-handed axe/mace",
  "two-handed flail", "two-handed sword", "whip", "force sword", "force whip", "monowire whip", ...UNARMED_SKILLS,
];

/** The ranged combat skills. */
const RANGED_SKILLS = ["beam weapons", "blowpipe", "bolas", "bow", "crossbow", "gunner", "guns", "lasso", "liquid projector", "net", "sling", "spear thrower", "throwing", "thrown weapon", "artillery"];

/** Whether a skill is a melee combat skill. */
export function isMeleeSkill(skill: string): boolean {
  return MELEE_SKILLS.includes(base(skill));
}

/** Whether a skill is a combat skill of any kind. */
export function isCombatSkill(skill: string): boolean {
  const b = base(skill).replace(/\/tl\d*$/, "");
  return isMeleeSkill(skill) || RANGED_SKILLS.includes(b);
}

/** The combat skill an Art or Sport skill stands in for ("Karate Art" is Karate's), or null. */
export function artOrSportOf(skill: string): string | null {
  const match = /^(.+?)\s+(art|sport)$/i.exec(base(skill));
  return match && isMeleeSkill(match[1]!) ? match[1]! : null;
}

/** One of a fighter's skills, as the rule reads it: its name and its level against its attribute. */
export interface SkillEntry {
  name: string;
  relativeLevel: number | null;
}

/** Whether someone counts as untrained for Fear and the Coin Toss (p. 113): no combat skills, no Combat Reflexes. */
export function isUntrained(skills: readonly SkillEntry[], combatReflexes: boolean): boolean {
  return !combatReflexes && !skills.some((s) => isCombatSkill(s.name) || artOrSportOf(s.name) !== null);
}

/**
 * Whether someone may use the maneuvers and options Limited Maneuver Selection
 * holds back (p. 113): a melee combat skill at DX level or better, or an Art or
 * Sport skill at DX+3, since the combat skill defaults to it at -3.
 */
export function mayUseAdvancedOptions(skills: readonly SkillEntry[]): boolean {
  return skills.some((s) => {
    if (s.relativeLevel === null) return false;
    if (isMeleeSkill(s.name)) return s.relativeLevel >= 0;
    return artOrSportOf(s.name) !== null && s.relativeLevel >= 3;
  });
}

/** The Coin Toss (p. 113): 1-3 attacks all-out, 4-6 defends all-out. */
export function coinToss(roll: number): "attack" | "defend" {
  return roll <= 3 ? "attack" : "defend";
}

/** The Fright Check's bonus for the heat of battle (p. 113). */
export const HEAT_OF_BATTLE = 5;

// ── harsh realism (p. 124) ──

/** Every unarmed skill parries a weapon at -3 (p. 124). */
export const UNARMED_PARRY_VS_WEAPON = -3;

/** Whether a failed unarmed parry by this much puts the limb in the way (p. 124): a failure by 3 or less. */
export function limbInTheWay(marginOfFailure: number): boolean {
  return marginOfFailure > 0 && marginOfFailure <= 3;
}

/** The close-combat exception (p. 124): Judo and Karate parries against rigid crushing weapons keep the limb out of it. */
export function limbSpared(options: { parrySkill: string; closeCombat: boolean; damageType: string; flexible: boolean }): boolean {
  const skill = base(options.parrySkill);
  return options.closeCombat && (skill === "judo" || skill === "karate") && options.damageType === "cr" && !options.flexible;
}

/** A standing fighter's parry against a leg or foot with a hand or a reach C weapon (p. 124). */
export function lowLineParry(options: { posture: string; hitLocation: string; handOrReachC: boolean }): number {
  return options.posture === "standing" && (options.hitLocation === "leg" || options.hitLocation === "foot") && options.handOrReachC ? -2 : 0;
}

/** The skills whose +3 retreat bonus comes from footwork, and drops to +1 on a dive (p. 124). */
export function footworkParry(skill: string): boolean {
  return ["boxing", "judo", "karate"].includes(base(skill));
}

/** Striking with the off hand (p. 124): -4 to skill and -2 ST, unless trained out of it. */
export function offHandPenalty(trained: boolean): { skill: number; st: number } {
  return trained ? { skill: 0, st: 0 } : { skill: -4, st: -2 };
}

/** Bruised knuckles (p. 124): the shock penalty for a hurt striking part, at most -4, either suffered again or taken off damage. */
export function bruisedKnuckles(shock: number, highPainThreshold: boolean): number {
  return highPainThreshold ? 0 : -Math.min(4, Math.max(0, Math.floor(Number(shock) || 0)));
}
