/**
 * High-Tech's shooting options and gun techniques (pp. 84-85, 249-252): the
 * two-handed pistol stance, Precision Aiming, the Ranged Rapid Strike,
 * Close-Quarters Battle, Targeted Attacks with guns, Instant Arsenal Disarm
 * and the expanded Gunslinger. Pure rules, with no Foundry in them.
 */

import { buyOff, targetDefaultPenalty, targetedAttackBounds, type TargetTable } from "../../../shared/targeted-attacks/rules.js";

// ── Pistolero (p. 84) ──

/** Minimum ST in the two-handed stance: times 0.8, rounded up. */
export function pistoleroMinSt(minSt: number | null): number | null {
  if (minSt === null || !Number.isFinite(minSt) || minSt <= 0) return minSt;
  return Math.ceil(Math.round(minSt * 8) / 10);
}

/** Bulk in the two-handed stance: one step better, never above 0. */
export function pistoleroBulk(bulk: number): number {
  const b = Math.floor(Number(bulk) || 0);
  return b < 0 ? b + 1 : b;
}

/** Whether a weapon skill is a pistol's, which the stance is for. */
export function isPistolSkill(skill: string): boolean {
  return /\(\s*pistol\s*\)\s*$/i.test(String(skill ?? "").trim());
}

// ── Precision Aiming (pp. 84, 251) ──

/**
 * The seconds of Aim at which each further +1 may be claimed, past the usual
 * three seconds: twice, four, eight, fifteen and thirty times as long, as
 * Time Spent gives them (p. B346).
 */
export const PRECISION_SECONDS = [6, 12, 24, 45, 90] as const;

/** The IQ-based weapon skill roll's penalty for each +1, which the technique buys off. */
export const PRECISION_PENALTY = -6;

/** The most the extra time can be worth. */
export const PRECISION_MAX = PRECISION_SECONDS.length;

/** How many of the extra +1s the time aimed so far has made room for. */
export function precisionRollsDue(seconds: number): number {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return PRECISION_SECONDS.filter((t) => s >= t).length;
}

/** The second of Aim at which the next +1 may be claimed, or null once all five are. */
export function nextPrecisionSecond(claimed: number): number | null {
  return PRECISION_SECONDS[Math.max(0, Math.floor(claimed))] ?? null;
}

/**
 * The most the extra aim can add for a gun: +5, and no more than the lower
 * of what its sights or scope give and its basic Acc.
 */
export function precisionCap(accuracy: number, scope: number): number {
  return Math.max(0, Math.min(PRECISION_MAX, Math.floor(Number(scope) || 0), Math.floor(Number(accuracy) || 0)));
}

/** What a precision roll leads to: +1 more, nothing (at the cap), or the aim lost; a critical failure also gives the sniper away. */
export function precisionOutcome(success: boolean, criticalFailure: boolean): "gained" | "lost" | "spotted" {
  if (success) return "gained";
  return criticalFailure ? "spotted" : "lost";
}

// ── Ranged Rapid Strike (pp. 85, 252) ──

/** The Rapid Strike's penalty on each attack, which Quick-Shot buys off. */
export const RANGED_RAPID_STRIKE_PENALTY = -6;

/** A gun has to fire at RoF 2 or more to make two attacks in one second. */
export const RANGED_RAPID_STRIKE_MIN_ROF = 2;

/**
 * The share of the gun's RoF each attack may use: the two attacks come out of
 * one second's shots, so each takes half (rounded down, at least one).
 */
export const RANGED_RAPID_STRIKE_ROF_SHARE = 0.5;

/** The maneuvers a Rapid Strike may be made on (p. B370). */
export const RAPID_STRIKE_MANEUVERS = ["attack", "allOutAttack"] as const;

export function rangedRapidStrikeRefusal(options: { rateOfFire: number; maneuver: string; spraying: boolean }): "rateOfFire" | "maneuver" | "spraying" | null {
  if ((Number(options.rateOfFire) || 1) < RANGED_RAPID_STRIKE_MIN_ROF) return "rateOfFire";
  if (options.maneuver && !(RAPID_STRIKE_MANEUVERS as readonly string[]).includes(options.maneuver)) return "maneuver";
  if (options.spraying) return "spraying";
  return null;
}

// ── The expanded Gunslinger (p. 249) ──

/** The techniques whose default penalty the expanded Gunslinger halves, by name. */
export const GUNSLINGER_HALVES = /^(fanning|fast-firing|quick-shot|thumbing|two-handed thumbing)\b/i;

/** A default penalty halved, rounded in the shooter's favor. */
export function halvedDefault(penalty: number): number {
  const p = Math.min(0, Math.floor(Number(penalty) || 0));
  return p === 0 ? 0 : -Math.floor(-p / 2);
}

/** Move and Attack or close combat with a gun: the Bulk line counts for nothing (the Acc bonus is still lost). */
export function gunslingerIgnoresBulk(situation: string): boolean {
  return situation === "moveAndAttack" || situation === "closeCombat";
}

// ── Close-Quarters Battle (pp. 250-251) ──

/**
 * What Close-Quarters Battle adds to a Move and Attack at a target no
 * further in yards than the shooter's Per: its level stands in for the
 * skill's, the Bulk penalty (-2 or Bulk) still comes off, and the result may
 * not exceed the skill. `relative` is the technique's level less the skill's,
 * `bulkLine` the Move and Attack line already on the roll.
 */
export function closeQuartersLine(relative: number, bulkLine: number): number {
  const r = Math.max(0, Math.floor(Number(relative) || 0));
  const bulk = Math.min(0, Math.floor(Number(bulkLine) || 0));
  return Math.min(r, -bulk);
}

export function withinCloseQuarters(rangeYards: number | null, per: number | null): boolean {
  return typeof rangeYards === "number" && typeof per === "number" && rangeYards >= 0 && rangeYards <= per;
}

// ── Targeted Attacks with guns (p. 252) ──

/**
 * The gun's figures: the Basic Set's locations, "head" at -5 as the book's
 * own example reads it, -10 for chinks (-8 in the torso) and -4 against a
 * weapon.
 */
export const HIGH_TECH_TARGETS: TargetTable = {
  locations: { torso: 0, arm: -2, leg: -2, groin: -3, vitals: -3, hand: -4, foot: -4, face: -5, head: -5, neck: -5, skull: -7, eye: -9 },
  chinks: { torso: -8, other: -10 },
  weapon: -4,
};

/** The called-shot locations a TA's target stands for: "head" is aimed as the face. */
const TARGET_LOCATIONS: Readonly<Record<string, string>> = { head: "face" };

/** The Guns specialties (p. B198), and the book's short names for some. */
const GUNS_SPECIALTIES = ["Grenade Launcher", "Gyroc", "Light Anti-Armor Weapon", "Light Machine Gun", "Musket", "Pistol", "Rifle", "Shotgun", "Submachine Gun"];
const SPECIALTY_ALIASES: Readonly<Record<string, string>> = {
  smg: "Submachine Gun",
  lmg: "Light Machine Gun",
  law: "Light Anti-Armor Weapon",
  gl: "Grenade Launcher",
};

export interface GunTargetedAttack {
  /** The weapon skill, "Guns (Pistol)". */
  skill: string;
  /** The target, lower-cased: a location or "weapon". */
  target: string;
  chinks: boolean;
}

/** The skill a TA names: a gun skill in full, "Guns (Pistol)", or a Guns specialty, "Pistol" or "SMG"; blank for anything else. */
export function gunSkillOf(specialty: string): string {
  const s = String(specialty ?? "").trim();
  if (/^(guns|gunner|beam weapons)\b.*\(.*\)\s*$/i.test(s)) return s;
  const known = SPECIALTY_ALIASES[s.toLowerCase()] ?? GUNS_SPECIALTIES.find((g) => g.toLowerCase() === s.toLowerCase());
  return known ? `Guns (${known})` : "";
}

/** A gun TA from its technique name, "TA (Specialty/Target)" or "Targeted Attack (Specialty/Target)". */
export function readGunTargetedAttack(name: string): GunTargetedAttack | null {
  const inner = /^(?:TA|Targeted Attack)\s*\((.+)\)\s*$/i.exec(String(name ?? "").trim())?.[1];
  if (!inner) return null;
  const cut = inner.lastIndexOf("/");
  if (cut <= 0) return null;
  const skill = gunSkillOf(inner.slice(0, cut));
  let target = inner.slice(cut + 1).trim().toLowerCase();
  const chinks = /\bchinks\b/.test(target);
  target = target.replace(/\bchinks\b/, "").trim() || "torso";
  if (!skill || !(target === "weapon" || target in HIGH_TECH_TARGETS.locations)) return null;
  if (chinks && target === "weapon") return null;
  return { skill, target, chinks };
}

/** A gun TA's default penalty (p. 252). */
export function gunTargetPenalty(ta: GunTargetedAttack): number {
  return targetDefaultPenalty(HIGH_TECH_TARGETS, ta.target, ta.chinks);
}

/** A gun TA's level, default and ceiling: the skill at the target's penalty, up to half of it bought off as a Hard technique. */
export function gunTargetedAttackLevel(ta: GunTargetedAttack, skill: number | null, points: number): { level: number | null; default: number | null; ceiling: number | null } {
  const penalty = gunTargetPenalty(ta);
  return targetedAttackBounds([skill === null ? null : skill + penalty], buyOff(penalty), points);
}

/** Whether a TA is for a shot at this location with this skill. */
export function aimedWhereTaAims(ta: GunTargetedAttack, skill: string, location: string | null, chinks: boolean): boolean {
  if (String(skill ?? "").trim().toLowerCase() !== ta.skill.toLowerCase()) return false;
  const at = String(location ?? "torso").toLowerCase();
  return (TARGET_LOCATIONS[ta.target] ?? ta.target) === at && ta.chinks === chinks;
}

// ── Instant Arsenal Disarm (p. 251) ──

/** The grappling roll to grab the gun first. */
export const INSTANT_ARSENAL_GRAB_PENALTY = -4;

/** The foe's margin of victory under which the gun is left intact but unready. */
export const INSTANT_ARSENAL_UNREADY_MARGIN = 3;

/**
 * The Quick Contest's result for the gun: taken apart and unable to fire,
 * unready, or no worse for it; a critical failure lets the foe shoot the
 * disarmer in the hand.
 */
export function instantArsenalResult(options: { outcome: "first" | "second" | "tie"; marginOfVictory: number; criticalFailure: boolean }): "disabled" | "unready" | "intact" | "shotAtHand" {
  if (options.criticalFailure) return "shotAtHand";
  if (options.outcome === "first") return "disabled";
  if (options.outcome === "second" && (Number(options.marginOfVictory) || 0) < INSTANT_ARSENAL_UNREADY_MARGIN) return "unready";
  return "intact";
}

// ── Mounted Shooting (p. 251) ──

/**
 * Whether a Mounted Shooting technique, "Mounted Shooting (SMG/Motorcycle)",
 * is for the vehicle being shot from (p. 251): its second specialty against
 * the vehicle's control skill -- the skill's own specialty, "Driving
 * (Motorcycle)", or a skill with none, "Bicycling" -- or its name. A
 * technique that names no vehicle, or a shot from a mount or a vehicle not
 * known, takes it as it is.
 */
export function mountedShootingFits(technique: string, vehicle: { name: string; skill: string } | null): boolean {
  const kind = /\(([^)]*)\)\s*$/.exec(String(technique ?? ""))?.[1]?.split("/")[1]?.trim().toLowerCase() ?? "";
  if (!kind || !vehicle) return true;
  const skill = String(vehicle.skill ?? "").trim().toLowerCase();
  const specialty = /\(([^)]*)\)\s*$/.exec(skill)?.[1]?.trim() ?? "";
  if (specialty ? specialty === kind : skill.replace(/\s*\(.*$/, "") === kind) return true;
  return String(vehicle.name ?? "").toLowerCase().includes(kind);
}

/** Mounted Shooting's default: the ranged weapon skill -4. */
export const MOUNTED_SHOOTING_DEFAULT = -4;

/**
 * The penalty for shooting from a moving mount or vehicle (Campaigns p. 548)
 * with Mounted Shooting improved: the rough ride and limited mobility can't
 * take the weapon skill below the technique's level, so the line is never
 * worse than the technique's level less the skill. At its default the
 * technique does nothing. Other penalties apply as usual.
 */
export function mountedShootingLine(penalty: number, relative: number | null): number {
  const value = Math.min(0, Math.trunc(Number(penalty) || 0));
  if (relative === null || !Number.isFinite(relative) || relative <= MOUNTED_SHOOTING_DEFAULT) return value;
  return Math.max(value, Math.min(0, Math.trunc(relative)));
}

// ── Zen Marksmanship (p. 250) ──

/**
 * Zen Marksmanship works as Zen Archery (Characters p. 228), for point-target
 * small arms. It is specialized as Guns is; the book's records leave out the
 * grenade launcher, light anti-armor weapon and light machine gun, as the text
 * lets the GM, and at high TLs it may take Beam Weapons specialties too.
 * Each specialty covers the weapon skill of the same specialty.
 */
export const ZEN_MARKSMANSHIP: ReadonlyArray<{ key: string; skill: string; covers: string[] }> = [
  ...["Gyroc", "Musket", "Pistol", "Rifle", "Shotgun", "Submachine Gun"].map((specialty) => ({
    key: `ht-zen-${specialty.toLowerCase().replace(/\s+/g, "-")}`,
    skill: `Zen Marksmanship (${specialty})`,
    covers: [`Guns (${specialty})`],
  })),
  ...["Pistol", "Rifle"].map((specialty) => ({
    key: `ht-zen-beam-${specialty.toLowerCase()}`,
    skill: `Zen Marksmanship (Beam ${specialty})`,
    covers: [`Beam Weapons (${specialty})`],
  })),
];
