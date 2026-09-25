/**
 * GURPS High-Tech's protective oddments and portable cover (pp. 68-72, 225),
 * as rules the table reads.
 *
 *   - Footwear and Stealth (pp. 68-69): moccasins, sneakers and climbing
 *     shoes are +1 to move silently; arctic, blast and firefighter boots -1.
 *   - Breaking footwear in (p. 69): HT, Hiking or HT-based Soldier, with the
 *     equipment modifier for custom-made pairs of good or fine quality;
 *     failure is moderate pain for 2d days, critical failure terrible pain
 *     (or, at the GM's word, a crippled foot).
 *   - A hockey glove (p. 69): Ham-Fisted 1 for fine work with that hand.
 *   - Ear protection (p. 70): Protected Hearing while worn; ordinary earmuffs
 *     and earplugs are Hard of Hearing too, the electronic ones are not while
 *     their cells last.
 *   - Goggles and glasses (p. 71): Nictitating Membrane from goggles and a
 *     dive mask, Protected Vision from anti-laser goggles, tinted goggles, and
 *     tinted (TL6+) and ballistic sunglasses; a Ready maneuver to put any of
 *     them on or take it off.
 *   - A cup and a mouthguard (p. 71): +2 to knockdown rolls for groin hits,
 *     +1 for face hits; the mouthguard's speech as Disturbing Voice.
 *   - Eyeglasses (p. 225): they correct Bad Sight and protect the eyes as
 *     glasses do, but a head hit breaks them on a 1 and knocks them off on
 *     2-3; contact lenses correct it and can't be lost that way, but don't
 *     protect.
 *   - Homemade armour (p. 71): paper and tape at Armoury (Body Armor)+5, a
 *     plastic bucket at +3.
 *   - Portable cover (p. 72): an explosives blanket takes its DR 25 off the
 *     damage roll of a charge it smothers, and held up it is cover for
 *     several people; a radiation blanket does the same and gives PF 3 to
 *     those exposed.
 */

import type { DiceAdds } from "../explosives/rules.js";

/** A name without the TL a table adds to it: "Sunglasses (TL6)" is "Sunglasses". */
export function baseName(name: unknown): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

/** An item's TL, read for its leading number. */
export function tlOf(tl: unknown): number {
  return Number(/\d+/.exec(String(tl ?? ""))?.[0]) || 0;
}

// ── footwear (pp. 68-69) ─────────────────────────────────────────────────────

/**
 * Footwear's modifier to Stealth when moving silently (pp. 68-69). Cleats'
 * -1 is on hard floors alone, which the roll can't tell, so it is left to the
 * GM.
 */
const FOOTWEAR_STEALTH: ReadonlyArray<[RegExp, number]> = [
  [/^moccasins$/i, 1],
  [/^sneakers$/i, 1],
  [/^shoes, climbing$/i, 1],
  [/^boots, arctic$/i, -1],
  [/^boots, blast$/i, -1],
  [/^boots, firefighter$/i, -1],
];

/** A pair's Stealth modifier, or 0 for footwear that makes no difference. */
export function footwearStealth(name: unknown): number {
  const base = baseName(name);
  return FOOTWEAR_STEALTH.find(([pattern]) => pattern.test(base))?.[1] ?? 0;
}

/**
 * The Stealth line for the pairs worn: the worst of them, since a penalty is
 * the clumsy boot doing its work; a bonus only where nothing worn has a
 * penalty. Null where none makes a difference.
 */
export function stealthOf(pairs: ReadonlyArray<{ name: string }>): { name: string; value: number } | null {
  let best: { name: string; value: number } | null = null;
  for (const pair of pairs) {
    const value = footwearStealth(pair.name);
    if (!value) continue;
    if (!best || value < best.value) best = { name: pair.name, value };
  }
  return best;
}

/** The equipment modifier for custom-made footwear (p. 69; Characters p. 345). */
export const CUSTOM_FOOTWEAR = { "": 0, good: 1, fine: 2 } as const;
export type CustomFootwear = keyof typeof CUSTOM_FOOTWEAR;

/**
 * The roll to break footwear in (p. 69): the best of HT, Hiking (HT-based,
 * default HT-5) and HT-based Soldier (Soldier is IQ-based, default IQ-5).
 */
export function breakInRoll(options: { ht: number; iq: number; hiking: number | null; soldier: number | null }): { skill: "HT" | "Hiking" | "Soldier"; level: number } {
  const hiking = options.hiking ?? options.ht - 5;
  const soldier = options.soldier !== null ? options.soldier - options.iq + options.ht : options.ht - 5;
  let best: { skill: "HT" | "Hiking" | "Soldier"; level: number } = { skill: "HT", level: options.ht };
  if (hiking > best.level) best = { skill: "Hiking", level: hiking };
  if (soldier > best.level) best = { skill: "Soldier", level: soldier };
  return best;
}

/** What the break-in roll leaves: nothing, moderate pain, or terrible pain, for 2d days. */
export function breakInPain(outcome: { success: boolean; criticalFailure?: boolean }): "moderatePain" | "terriblePain" | null {
  if (outcome.success) return null;
  return outcome.criticalFailure ? "terriblePain" : "moderatePain";
}

export const DAY_SECONDS = 86_400;

// ── gloves, ear and eye protection (pp. 69-71) ──────────────────────────────

/** What a piece of protective gear grants while worn. */
export interface GearGrant {
  hamFisted?: number;
  protectedHearing?: boolean;
  hardOfHearing?: boolean;
  nictitatingMembrane?: number;
  protectedVision?: boolean;
  /** The lowest TL whose version grants Protected Vision (sunglasses: TL6). */
  protectedVisionFromTl?: number;
}

const GEAR: ReadonlyArray<[RegExp, GearGrant]> = [
  // Gloves (p. 69): the padded glove makes fine work clumsy.
  [/^hockey glove$/i, { hamFisted: 1 }],
  // Ear protection (p. 70).
  [/^(earmuffs|earplugs)$/i, { protectedHearing: true, hardOfHearing: true }],
  [/^electronic (earmuffs|earplugs)$/i, { protectedHearing: true }],
  // Goggles (p. 71). Plain goggles' DR 1 is their membrane, and their record's DR already.
  [/^dive mask$/i, { nictitatingMembrane: 1 }],
  [/^goggles$/i, { nictitatingMembrane: 1 }],
  [/^anti-laser goggles$/i, { nictitatingMembrane: 4, protectedVision: true }],
  [/^tactical goggles$/i, { nictitatingMembrane: 5 }],
  // Glasses (p. 71): tinted from TL6, ballistic ones always.
  [/^sunglasses$/i, { protectedVision: true, protectedVisionFromTl: 6 }],
  [/^ballistic sunglasses$/i, { protectedVision: true }],
];

/**
 * What a worn piece grants, at its TL, or null for a piece these rules don't
 * know. `state` says what the item's own data adds: plain goggles with tinted
 * lenses give Protected Vision too (p. 71), and electronic ear protection
 * whose cells are spent is no more than the plain kind, muffling everything
 * (p. 70).
 */
export function gearGrant(name: unknown, tl: number, state: { tinted?: boolean; unpowered?: boolean } = {}): GearGrant | null {
  const base = baseName(name);
  if (state.unpowered && ELECTRONIC_EARS.test(base)) return { protectedHearing: true, hardOfHearing: true };
  const grant = GEAR.find(([pattern]) => pattern.test(base))?.[1];
  if (!grant) return null;
  const { protectedVisionFromTl, ...rest } = grant;
  if (state.tinted && TINTABLE.test(base)) return { ...rest, protectedVision: true };
  if (protectedVisionFromTl !== undefined && tl < protectedVisionFromTl) return { ...rest, protectedVision: false };
  return rest;
}

/** Ear protection that filters noise electronically, on cells (p. 70). */
export const ELECTRONIC_EARS = /^electronic (earmuffs|earplugs)$/i;

/** Goggles that may have tinted lenses, which then give Protected Vision against bright ordinary light (p. 71). */
export const TINTABLE = /^goggles$/i;

/** The goggles and glasses that take a Ready maneuver to put on or take off (p. 71). */
export const EYE_PROTECTION = /^(dive mask|goggles|anti-laser goggles|tactical goggles|sunglasses|ballistic sunglasses)$/i;

/**
 * Goggles whose record is armour with DR on the eyes: that DR is the
 * membrane's (p. 71), so the membrane stands for it and the piece's own line
 * is refused, never counted twice.
 */
export const MEMBRANE_IS_THE_DR = /^goggles$/i;

/** Ham-Fisted granted by gear is at most two levels (Characters p. 138). */
export const HAM_FISTED_MAX = 2;

// ── the cup and the mouthguard (p. 71) ──────────────────────────────────────

/** Bonuses to the knockdown roll for a hit on the location a piece guards (p. 71). */
const KNOCKDOWN_GEAR: ReadonlyArray<[RegExp, string, number]> = [
  [/^cup$/i, "groin", 2],
  [/^mouthguard$/i, "face", 1],
];

/** A worn piece's knockdown bonus against a hit on a location, or 0. */
export function knockdownBonus(name: unknown, hitLocation: string): number {
  const base = baseName(name);
  const hit = KNOCKDOWN_GEAR.find(([pattern, location]) => pattern.test(base) && location === hitLocation);
  return hit?.[2] ?? 0;
}

export const MOUTHGUARD = /^mouthguard$/i;

/**
 * Disturbing Voice (Characters p. 132), which a mouthguard's speech counts
 * as: -2 to the skills that lean on the voice, the list the Basic Set gives
 * Stuttering (p. 157), whose effects it shares.
 */
export const VOICE_SKILLS: readonly string[] = ["Diplomacy", "Fast-Talk", "Performance", "Public Speaking", "Sex Appeal", "Singing"];
export const DISTURBING_VOICE = -2;

/** Whether a skill, by name, is one a disturbing voice hampers. */
export function isVoiceSkill(name: unknown): boolean {
  const base = String(name ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return VOICE_SKILLS.some((s) => s.toLowerCase() === base);
}

// ── eyeglasses and contact lenses (p. 225) ──────────────────────────────────

export const EYEGLASSES = /^eyeglasses$/i;
export const CONTACT_LENSES = /^contact lenses$/i;

/** Eyeglasses protect the eyes as glasses do (pp. 71, 225): DR 1. */
export const EYEGLASSES_DR = 1;

/** The locations that make a hit a head hit. */
export const HEAD_LOCATIONS: readonly string[] = ["skull", "face", "eye"];

/** What a head hit does to eyeglasses, by 1d (p. 225): 1 breaks them, 2-3 knock them off. */
export function eyeglassesOnHeadHit(die: number): "broken" | "knockedOff" | null {
  if (die <= 1) return "broken";
  if (die <= 3) return "knockedOff";
  return null;
}

// ── homemade armour (p. 71) ─────────────────────────────────────────────────

/** Homemade armour: the Armoury (Body Armor) roll's bonus and the time the job takes (p. 71). */
export interface HomemadeArmor {
  bonus: number;
  minutes: number;
  /** Paper comes apart in damp weather. */
  soaks: boolean;
}

const HOMEMADE: ReadonlyArray<[RegExp, HomemadeArmor]> = [
  [/^homemade armor, paper and tape$/i, { bonus: 5, minutes: 30, soaks: true }],
  [/^homemade armor, plastic bucket$/i, { bonus: 3, minutes: 180, soaks: false }],
];

export function homemadeArmor(name: unknown): HomemadeArmor | null {
  const base = baseName(name);
  return HOMEMADE.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

export const ARMOURY_BODY_ARMOR = "Armoury (Body Armor)";

/** The Armoury (Body Armor) level to make it with: the skill, or its IQ-5 default (Characters p. 178). */
export function armouryLevel(skill: number | null, iq: number): number {
  return skill ?? iq - 5;
}

// ── portable cover (p. 72) ──────────────────────────────────────────────────

/** A blanket laid over a charge: its DR comes off the damage roll; the radiation blanket's PF. */
export interface Blanket {
  dr: number;
  protectionFactor: number;
}

const BLANKETS: ReadonlyArray<[RegExp, Blanket]> = [
  [/^explosives blanket$/i, { dr: 25, protectionFactor: 1 }],
  [/^radiation blanket$/i, { dr: 25, protectionFactor: 3 }],
];

export function blanketOf(name: unknown): Blanket | null {
  const base = baseName(name);
  return BLANKETS.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

/**
 * A charge's damage under a blanket (p. 72): the dice as they are, less the
 * blanket's DR. A roll with a multiplier ("6dx2") is laid out as dice first,
 * so the DR comes off the whole roll and not off each multiple of it.
 */
export function smothered(damage: DiceAdds, dr: number): { dice: DiceAdds; less: number } {
  const times = damage.multiplier && damage.multiplier > 0 ? damage.multiplier : 1;
  return { dice: { dice: Math.round(damage.dice * times), adds: Math.round(damage.adds * times) }, less: -Math.max(0, dr) };
}

/**
 * A blanket held up as portable cover for several people (p. 72; Characters
 * p. 407): its DR stands between each of them and a blow from the side it
 * faces -- the front, or a blow from no known side, as for the system's "F".
 */
export function coverMeets(arc: string | null | undefined): boolean {
  return !arc || arc === "front";
}

/** Radiation through a blanket's PF: the dose it lets through (Characters p. 436). */
export function shieldedRads(rads: number, protectionFactor: number): number {
  return protectionFactor > 1 ? rads / protectionFactor : rads;
}
