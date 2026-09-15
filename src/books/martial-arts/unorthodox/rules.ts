/**
 * Weapons used outside their makers' plans (GURPS Martial Arts pp. 212, 220,
 * 224): unfamiliar weapons, two-handed weapons in one hand, melee weapons
 * hurled, and everyday things improvised as weapons. The pure rules.
 */

// ── unfamiliar weapons (p. 212) ──

/** Fighting with a weapon one isn't familiar with. */
export const UNFAMILIAR_WIELD = -2;
/** A Quick Contest against a weapon one has never seen. */
export const UNFAMILIAR_CONTEST = -2;
/** Parrying a weapon one has never seen. */
export const UNFAMILIAR_PARRY = -1;

/** The weapon groups in a comma- or semicolon-separated list, trimmed, compared without case. */
export function weaponGroups(text: unknown): string[] {
  return String(text ?? "").split(/[,;]/).map((part) => part.trim().toLowerCase()).filter(Boolean);
}

/** Whether a weapon of `group` is familiar to someone who knows `familiar`. A weapon with no group is everyone's. */
export function isFamiliar(group: unknown, familiar: readonly string[]): boolean {
  const wanted = String(group ?? "").trim().toLowerCase();
  return wanted === "" || familiar.includes(wanted);
}

/** A side's penalty in a Quick Contest: -2 facing an unfamiliar weapon, nothing when both sides are (it cancels). */
export function contestPenalty(facingUnfamiliar: boolean, foeFacingUnfamiliar: boolean): number {
  return facingUnfamiliar && !foeFacingUnfamiliar ? UNFAMILIAR_CONTEST : 0;
}

// ── two-handed weapons in one hand (p. 220; p. B270) ──

/** The skill a two-handed weapon is wielded with in one hand, or null where it has no one-handed use by this rule. */
export function oneHandedSkill(skill: string, damageBase: string): string | null {
  switch (skill.trim().toLowerCase()) {
    case "polearm":
      return damageBase === "thr" ? "Spear" : "Axe/Mace";
    case "staff":
    case "two-handed sword":
      return "Broadsword";
    case "two-handed axe/mace":
      return "Axe/Mace";
    case "two-handed flail":
      return "Flail";
    default:
      // A spear's one-handed use is its own line of statistics.
      return null;
  }
}

/**
 * Whether a fighter is strong enough to wield a two-handed weapon in one hand,
 * and whether it then stays ready (p. B270): a "†" weapon at 1.5 times its ST
 * (unready after attacking) or 3 times (ready); a "‡" weapon at 3 times.
 */
export function oneHandedGrip(st: number, minSt: number | null, unreadyAfterAttack: boolean): "ready" | "unready" | null {
  if (minSt === null || !(minSt > 0)) return "ready";
  if (st >= minSt * 3) return "ready";
  if (!unreadyAfterAttack && st >= Math.ceil(minSt * 1.5)) return "unready";
  return null;
}

/** One-handed use of a two-handed weapon: its damage at -1. */
export const ONE_HANDED_DAMAGE = -1;

// ── hurled melee weapons (p. 220) ──

/** What a melee weapon is hurled with, and whether it strikes with thrust or swing damage. */
export interface Hurl {
  skill: string;
  attack: "thr" | "sw";
  /** The extra -4 to hit; none with Thrown Weapon (Sword). */
  penalty: number;
}

export const HURL_PENALTY = -4;

const SWORD_SKILLS = ["broadsword", "rapier", "saber", "shortsword", "smallsword", "two-handed sword"];

/**
 * The throw a melee weapon wielded with `skill` makes. A blade hurled point
 * first rolls DX; a stick wielded with a sword skill uses Thrown Weapon
 * (Stick). Null for a weapon the table doesn't cover.
 */
export function hurlFor(skill: string, crushingOnly: boolean): Hurl | null {
  const s = skill.trim().toLowerCase();
  if (["flail", "kusari", "two-handed flail"].includes(s)) return { skill: "Bolas", attack: "sw", penalty: HURL_PENALTY };
  if (SWORD_SKILLS.includes(s)) {
    return crushingOnly
      ? { skill: "Thrown Weapon (Stick)", attack: "sw", penalty: HURL_PENALTY }
      : { skill: "DX", attack: "thr", penalty: HURL_PENALTY };
  }
  if (["axe/mace", "two-handed axe/mace"].includes(s)) return { skill: "Thrown Weapon (Axe/Mace)", attack: "sw", penalty: HURL_PENALTY };
  if (s === "shield") return { skill: "Thrown Weapon (Disc)", attack: "thr", penalty: HURL_PENALTY };
  if (["jitte/sai", "knife", "main-gauche"].includes(s)) return { skill: "Thrown Weapon (Knife)", attack: "thr", penalty: HURL_PENALTY };
  if (["polearm", "spear", "staff"].includes(s)) return { skill: "Thrown Weapon (Spear)", attack: "thr", penalty: HURL_PENALTY };
  return null;
}

/** A thrown skill's default, where the thrower doesn't know it: DX-4 (p. B226, p. B181). */
export const THROWN_DEFAULT = -4;

/** A hurled weapon's range from the thrower's ST (p. 220): x0.5/x1 up to 4 lbs., x0.2/x0.5 heavier. */
export function hurlRange(st: number, weight: number): { halfDamageRange: number; maxRange: number } {
  const light = weight <= 4;
  return {
    halfDamageRange: Math.max(0, Math.round(st * (light ? 0.5 : 0.2))),
    maxRange: Math.max(0, Math.round(st * (light ? 1 : 0.5))),
  };
}

// ── improvised weapons (p. 224) ──

/** An everyday item used as a weapon: what it counts as, and at what cost. */
export interface Improvised {
  key: string;
  /** The real weapon it stands in for, by name, and which of its lines. */
  base: string;
  skill: string;
  damage: number;
  skillPenalty: number;
  canParry: boolean;
  /** Reach, where it isn't the base weapon's. */
  reach?: string;
  armorDivisor?: number;
  glass?: boolean;
  /** Thrust rather than swing, where the base does both. */
  attack?: "thr" | "sw";
}

/** The items on p. 224 that stand in for a weapon wielded with a weapon skill. */
export const IMPROVISED: readonly Improvised[] = [
  { key: "barbell", base: "Maul", skill: "Two-Handed Axe/Mace", damage: 0, skillPenalty: -2, canParry: true },
  { key: "beltBuckle", base: "Life-Preserver", skill: "Flail", damage: -1, skillPenalty: -1, canParry: false },
  { key: "beltWhip", base: "Whip (1-yard)", skill: "Whip", damage: -1, skillPenalty: -2, canParry: false },
  { key: "bottleBroken", base: "Small Knife", skill: "Knife", damage: 0, skillPenalty: -2, canParry: false, armorDivisor: 0.5 },
  { key: "bottleIntact", base: "Knobbed Club", skill: "Axe/Mace", damage: -2, skillPenalty: -2, canParry: true, glass: true },
  { key: "carAntenna", base: "Baton", skill: "Shortsword", damage: -2, skillPenalty: -1, canParry: true },
  { key: "chain", base: "Kusari", skill: "Kusari", damage: -1, skillPenalty: -1, canParry: false },
  { key: "curtainRodSolid", base: "Jo", skill: "Staff", damage: 0, skillPenalty: -1, canParry: true },
  { key: "curtainRodHollow", base: "Jo", skill: "Staff", damage: -2, skillPenalty: -1, canParry: true },
  { key: "dumbbell", base: "Small Mace", skill: "Axe/Mace", damage: 0, skillPenalty: -1, canParry: true },
  { key: "iceScraper", base: "Small Knife", skill: "Knife", damage: -2, skillPenalty: -1, canParry: false, attack: "sw" },
  { key: "magazine", base: "Baton", skill: "Shortsword", damage: 0, skillPenalty: -1, canParry: true, attack: "thr" },
  { key: "nailClippers", base: "Dagger", skill: "Knife", damage: -3, skillPenalty: -2, canParry: false },
  { key: "pen", base: "Dagger", skill: "Knife", damage: -2, skillPenalty: -1, canParry: false },
  { key: "purseSwung", base: "Life-Preserver", skill: "Flail", damage: -1, skillPenalty: -1, canParry: false },
  { key: "ruler", base: "Urumi", skill: "Whip", damage: -2, skillPenalty: -2, canParry: false, reach: "1" },
  { key: "scarfWeighted", base: "Life-Preserver", skill: "Flail", damage: 0, skillPenalty: -1, canParry: false },
  { key: "scissors", base: "Dagger", skill: "Knife", damage: -1, skillPenalty: -1, canParry: false },
  { key: "shank", base: "Dagger", skill: "Knife", damage: -1, skillPenalty: -1, canParry: false },
];

/** The skill penalty an improvised weapon takes: none for someone with the Improvised Weapons perk in its skill (p. 50). */
export function improvisedSkillPenalty(entry: Improvised, perkSkills: readonly string[]): number {
  return perkSkills.map((s) => s.trim().toLowerCase()).includes(entry.skill.toLowerCase()) ? 0 : entry.skillPenalty;
}

/** A glass weapon breaks on 1-3 on 1d, and on a 1 cuts its wielder's hand (p. 224). */
export function glassBreaks(roll: number): { breaks: boolean; cutsHand: boolean } {
  return { breaks: roll <= 3, cutsHand: roll === 1 };
}
