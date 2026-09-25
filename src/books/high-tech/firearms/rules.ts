/**
 * High-Tech's rules for a gun's quality, its care and clearing it when it
 * jams (pp. 79-81, 129, 249-251), as pure functions. The Foundry side is in
 * `index.ts`.
 *
 *   - **Firearm quality (p. 79):** accuracy and reliability are two separate
 *     improvements, each fine or very fine, priced as a share of the gun's
 *     cost and combinable. They take the place of the Basic Set's single fine
 *     grade on a gun (Characters p. 279), which counts as both at once.
 *   - **Care (pp. 80-81, 129):** Malf. lost to shooting at default or without
 *     the ST, to cloth belts, and to abuse, age and hostile surroundings; Acc
 *     lost to abuse; a precision rifle or pistol rolling HT rather than HT+4
 *     against abuse; rugged guns.
 *   - **Immediate Action (pp. 81, 249-251):** the -4 to clear a stoppage,
 *     bought off by the technique; how many Ready maneuvers the drill takes by
 *     how the gun feeds; Armorer's Gift and Weapon Bond.
 */

// ── firearm quality (p. 79) ────────────────────────────────────────────────

/** A quality step: none, fine or very fine. */
export type QualityStep = 0 | 1 | 2;
export const QUALITY_STEPS: readonly QualityStep[] = [0, 1, 2];

/**
 * Accuracy work (p. 79): fine is +1 Acc and needs a base Acc of 2 or more to
 * do any good; very fine is +2 and needs 4 or more. The work costs 75% of the
 * gun's price for fine and five times that, 375%, for very fine.
 */
export const ACCURATE: Readonly<Record<1 | 2, { accuracy: number; minAccuracy: number; costFactor: number }>> = {
  1: { accuracy: 1, minAccuracy: 2, costFactor: 0.75 },
  2: { accuracy: 2, minAccuracy: 4, costFactor: 3.75 },
};

/**
 * Reliability work (p. 79): fine raises Malf. a step, very fine two, at 25%
 * and five times that, 125%, of the gun's price.
 */
export const RELIABLE: Readonly<Record<1 | 2, { steps: number; costFactor: number }>> = {
  1: { steps: 1, costFactor: 0.25 },
  2: { steps: 2, costFactor: 1.25 },
};

/**
 * The highest Malf. reliability work reaches (p. 79). A gun improved past it
 * stays at 17, but a malfunction is rolled again and only happens if the
 * second roll malfunctions too.
 */
export const MALF_CEILING = 17;

/** What quality work a gun asks for. */
export interface FirearmQuality {
  accurate: QualityStep;
  reliable: QualityStep;
}

/** A whole-number step, held to 0-2. */
export function qualityStep(value: unknown): QualityStep {
  const n = Math.floor(Number(value) || 0);
  return (n <= 0 ? 0 : n >= 2 ? 2 : 1) as QualityStep;
}

/**
 * The Acc accuracy work adds to one of a gun's attacks, from that attack's
 * base Acc (p. 79). Very fine work on an attack whose Acc is only 2 or 3
 * still gives fine's +1: it is the same work taken further.
 */
export function accurateBonus(step: QualityStep, baseAccuracy: number): number {
  for (const level of [2, 1] as const) {
    if (step >= level && baseAccuracy >= ACCURATE[level].minAccuracy) return ACCURATE[level].accuracy;
  }
  return 0;
}

/**
 * Whether a gun fires full-automatic (p. 79): its Rate of Fire above 3, the
 * most a semiautomatic fires, in any of its modes.
 */
export function isFullAuto(ratesOfFire: readonly number[]): boolean {
  return ratesOfFire.some((rof) => Number(rof) > 3);
}

/**
 * Why the quality asked for can't be had on this gun, as keys: accuracy work
 * on a gun too inaccurate to benefit, or reliability work on a full-automatic
 * weapon, which "can't be improved" that way (p. 79).
 */
export function qualityProblems(asked: FirearmQuality, gun: { bestAccuracy: number; fullAuto: boolean }): string[] {
  const problems: string[] = [];
  if (asked.accurate >= 1 && gun.bestAccuracy < ACCURATE[asked.accurate as 1 | 2].minAccuracy) problems.push(`accurate${asked.accurate}`);
  if (asked.reliable >= 1 && gun.fullAuto) problems.push("fullAuto");
  return problems;
}

/** The quality a gun actually has: what was asked for, less what the book refuses it. */
export function allowedQuality(asked: FirearmQuality, gun: { bestAccuracy: number; fullAuto: boolean }): FirearmQuality {
  const accurate = ([2, 1, 0] as const).find((s) => s <= asked.accurate && (s === 0 || gun.bestAccuracy >= ACCURATE[s].minAccuracy)) ?? 0;
  return { accurate, reliable: gun.fullAuto ? 0 : asked.reliable };
}

/**
 * The gun's price as a multiple of its cost with the work done (p. 79): each
 * improvement's share added to the whole. Fine accurate and reliable
 * together come to twice the price, the Basic Set's fine grade.
 */
export function qualityCostMultiplier(quality: FirearmQuality): number {
  return 1 + (quality.accurate ? ACCURATE[quality.accurate].costFactor : 0) + (quality.reliable ? RELIABLE[quality.reliable].costFactor : 0);
}

/**
 * A gun's Malf. after reliability work and what wears it down, and whether a
 * malfunction is rolled again (p. 79).
 *
 * Steps above 17 are counted as one more step, "17, roll again", so a penalty
 * takes the extra roll away before it takes Malf. below 17. A gun whose own
 * Malf. is above 17 gains nothing from the work. Null for a weapon that can't
 * malfunction, before or after.
 */
export function malfunctionAfter(base: number | null, reliableSteps: number, penalty: number): { malfunction: number | null; reroll: boolean } {
  if (base === null) return { malfunction: null, reroll: false };
  if (base > MALF_CEILING) return { malfunction: base - penalty, reroll: false };
  const steps = Math.min(MALF_CEILING + 1, base + Math.max(0, reliableSteps)) - Math.max(0, penalty);
  return steps > MALF_CEILING ? { malfunction: MALF_CEILING, reroll: true } : { malfunction: steps, reroll: false };
}

/** Whether the second roll of a rerolling gun malfunctions too (p. 79). */
export function rerollMalfunctions(roll: number, malfunction: number): boolean {
  return roll >= malfunction;
}

// ── care (pp. 80-81, 129) ──────────────────────────────────────────────────

/**
 * What a shooter's own handling costs a gun's Malf. (p. 81): -1 for anyone
 * shooting at default or without the weapon's minimum ST.
 */
export const UNTRAINED_MALF_PENALTY = 1;

/** Cloth belts soak up mud and water and rot: -1 Malf. (p. 129). */
export const CLOTH_BELT_MALF_PENALTY = 1;

/**
 * A sniper rifle or target pistol rolls against HT, not the usual HT+4, when
 * it is abused (p. 80); a failure costs it 1-3 Acc.
 */
export const PRECISION_ABUSE_MODIFIER = -4;

/**
 * How robust a gun is (p. 80): an ordinary firearm is DR 4, HT 10; many
 * military weapons DR 6, HT 11; a famously rugged one is ruggedized at no
 * extra cost, DR 8, HT 12.
 */
export const RUGGEDNESS = ["", "military", "rugged"] as const;
export type Ruggedness = (typeof RUGGEDNESS)[number];
export const RUGGED_FIGURES: Readonly<Record<Ruggedness, { dr: number; ht: number }>> = {
  "": { dr: 4, ht: 10 },
  military: { dr: 6, ht: 11 },
  rugged: { dr: 8, ht: 12 },
};

/**
 * A gun's DR and HT as an object, made at least as tough as its robustness
 * says (p. 80). An ordinary gun keeps the figures the system works out from
 * its weight and material (Campaigns pp. 483-484); a military or famously
 * rugged one is never below its DR and HT.
 */
export function ruggedObjectStats(stats: { dr: number; ht: number }, ruggedness: Ruggedness): { dr: number; ht: number } {
  const dr = Number(stats.dr) || 0;
  const ht = Number(stats.ht) || 0;
  if (!ruggedness) return { dr, ht };
  const figures = RUGGED_FIGURES[ruggedness];
  return { dr: Math.max(dr, figures.dr), ht: Math.max(ht, figures.ht) };
}

/** What wears a gun's Malf. down. */
export interface MalfunctionWear {
  /** Malf. lost to abuse, age, neglect or a hostile environment, as the GM rules (p. 80). */
  lost: number;
  clothBelt: boolean;
  /** Shooting it at default, or without its minimum ST (p. 81). */
  untrained: boolean;
}

/** The Malf. steps lost to wear. */
export function wearPenalty(wear: MalfunctionWear): number {
  return Math.max(0, Math.floor(wear.lost) || 0) + (wear.clothBelt ? CLOTH_BELT_MALF_PENALTY : 0) + (wear.untrained ? UNTRAINED_MALF_PENALTY : 0);
}

/**
 * The malfunction a TL6-8 gun comes to (p. 81): such guns seldom misfire but
 * often jam, so the GM may swap the table's misfires and stoppages. A
 * revolver keeps the table as it is: its malfunctions are nearly always
 * misfires. Other kinds and other TLs are left alone.
 */
export function modernMalfunction(kind: string, techLevel: number, revolver: boolean): string {
  if (revolver || techLevel < 6 || techLevel > 8) return kind;
  if (kind === "misfire") return "stoppage";
  if (kind === "stoppage") return "misfire";
  return kind;
}

// ── Immediate Action (pp. 81, 249-251) ─────────────────────────────────────

/** The basic penalty to clear a stoppage (p. 81), which the technique buys off. */
export const IMMEDIATE_ACTION_PENALTY = -4;

/**
 * The modifier to an Immediate Action roll for a character with the
 * technique at this level relative to its skill (p. 251): the technique
 * defaults to the skill at -4 and can't exceed it, so what is left of the
 * -4 is its level relative to the skill. Without the technique, -4.
 */
export function immediateActionModifier(relativeLevel: number | null): number {
  if (relativeLevel === null || !Number.isFinite(relativeLevel)) return IMMEDIATE_ACTION_PENALTY;
  return Math.max(IMMEDIATE_ACTION_PENALTY, Math.min(0, Math.round(relativeLevel)));
}

/**
 * The Armoury specialty the Immediate Action technique defaults to at -4,
 * by the weapon skill it is learned for (p. 251): Small Arms for a Guns
 * version, Heavy Weapons for a Gunner one. Null for anything else: the
 * technique is always learned for a Guns or Gunner specialty.
 */
export function immediateActionArmoury(prerequisite: string): string | null {
  const skill = String(prerequisite ?? "").trim();
  if (/^guns\b/i.test(skill)) return "Armoury (Small Arms)";
  if (/^gunner\b/i.test(skill)) return "Armoury (Heavy Weapons)";
  return null;
}

/** Armorer's Gift: +2 on Immediate Action rolls with its Guns specialty (p. 249). */
export const ARMORERS_GIFT_BONUS = 2;

/** Weapon Bond: +1 to skill, and every technique of it, with the bonded weapon (p. 250). */
export const WEAPON_BOND_BONUS = 1;

/** How a gun is fed, which is what Immediate Action has to put right (p. 81). */
export const FEEDS = ["magazine", "belt", "other"] as const;
export type Feed = (typeof FEEDS)[number];

/**
 * How a gun feeds, from its statistics: a belt for a machine gun that takes
 * five seconds or more to reload 50 rounds or more; a magazine for a
 * self-loader (RoF 2 or more) whose rounds aren't loaded one at a time; and
 * anything else -- revolvers, bolt actions, pumps, breechloaders -- as other.
 */
export function feedOf(mode: { shots: string; rateOfFire: number; skill: string }): Feed {
  const shots = String(mode.shots ?? "").replace(/,/g, "");
  const match = /^(\d+)(?:\+\d+)?\((\d+)(i?)\)/i.exec(shots.trim());
  if (!match) return "other";
  const [, capacity, reload, individually] = match;
  if (individually) return "other";
  if (/machine gun/i.test(mode.skill) && Number(reload) >= 5 && Number(capacity) >= 50) return "belt";
  if (Number(mode.rateOfFire) >= 2 && Number(capacity) > 1) return "magazine";
  return "other";
}

/**
 * The Ready maneuvers Immediate Action takes (p. 81): two to tap the
 * magazine, clear the chamber and let the slide fly; four to clear a belt
 * feed, three with an assistant gunner; three otherwise, the average.
 */
export const IMMEDIATE_ACTION_READIES: Readonly<Record<Feed, number>> = { magazine: 2, belt: 4, other: 3 };
export const ASSISTANT_GUNNER_READIES = 3;

/** A Guns or Gunner specialty, from the skill's name: "Guns (Pistol)" is "pistol". */
export function specialtyOf(skill: string): string {
  return (/\(([^)]*)\)\s*$/.exec(String(skill ?? ""))?.[1] ?? "").trim().toLowerCase();
}

/**
 * Whether a perk specialized in `specialty` covers a weapon shot with
 * `skill`: named by the specialty alone ("Pistol") or the whole skill
 * ("Guns (Pistol)").
 */
export function specialtyCovers(specialty: string, skill: string): boolean {
  const wanted = specialty.trim().toLowerCase();
  if (!wanted) return false;
  return wanted === String(skill ?? "").trim().toLowerCase() || wanted === specialtyOf(skill);
}
