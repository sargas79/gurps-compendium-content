/**
 * Drawing a gun, holsters and slings, and Who Draws First? with guns
 * (High-Tech pp. 81-82, 153-154, 249): the pure rules. The odd positions,
 * multiple draws and the standoff's cases are the shared engines'
 * (`src/shared/readying/`, `src/shared/standoff/`); this is High-Tech's own
 * table and figures.
 */

import { bootReachable, lowCarry, type Carry, type CarryOptions, type DrawCounts, type Hand } from "../../../shared/readying/rules.js";
import type { ModifierKey } from "../../../shared/standoff/rules.js";

/** The two Fast-Draw specialties for guns, as `specialtyOf` spells them. */
export type GunSpecialty = "pistol" | "longarm";

/** A gun's Fast-Draw specialty from its weapon skill: Pistol for a handgun, Long Arm for the rest. */
export function gunSpecialty(skill: string): GunSpecialty {
  return /pistol/i.test(String(skill ?? "")) ? "pistol" : "longarm";
}

/** The places High-Tech lists for a gun (p. 82), in its order. */
export const GUN_CARRIES: readonly Carry[] = ["belt", "hip", "smallOfBack", "shoulderHolster", "ankle", "boot", "concealed", "patrolSling", "shoulder", "backSling"];

/**
 * A gun's place's modifier to Fast-Draw (p. 82). A long arm is +0 on a patrol
 * sling, -2 slung over the shoulder and -4 slung on the back. A pistol is +0
 * in the belt or a hip holster, -1 at the small of the back or in a shoulder
 * holster, -2 in an ankle holster or a boot (nothing from a low posture,
 * whose own -2 the shared engine leaves off), and -3 in a pocket or
 * concealed.
 */
export function gunCarryModifier(specialty: string, carry: Carry, options: CarryOptions = {}): number | null {
  const table: Record<string, Partial<Record<Carry, number>>> = {
    longarm: { patrolSling: 0, shoulder: -2, backSling: -4 },
    pistol: { belt: 0, hip: 0, smallOfBack: -1, shoulderHolster: -1, ankle: -2, boot: -2, concealed: -3 },
  };
  const value = table[specialty]?.[carry];
  if (value === undefined) return null;
  // From a crouch, kneeling or sitting, the boot's -2 goes as well as the posture's: +0 in all.
  return lowCarry(carry) && bootReachable(String(options.posture ?? "")) ? 0 : value;
}

// ── Holsters, scabbards and slings (pp. 153-154) ──

export type HolsterKind = "belt" | "military" | "shoulder" | "sleeve" | "fastDrawRig" | "undercover" | "retention" | "rifleSling" | "patrolSling" | "scabbard";

export interface Holster {
  /** The guns it holds. */
  specialty: GunSpecialty;
  /** Where it puts the gun, for a gun whose own place is blank. */
  carry: Carry | null;
  /** Its own modifier to Fast-Draw. */
  fastDraw: number;
  /** Its bonus to the Retain Weapon technique while the gun is in it. */
  retain: number;
  /** The largest gun it takes, as Bulk; null for any. */
  maxBulk: number | null;
}

/**
 * The book's holsters and slings, by the records' names. A shoulder
 * holster's -1 is the place's (p. 82 prints it too), so it isn't taken twice;
 * a military holster's -2 goes when its flap is tucked away. The patrol
 * sling's +1 is its own, beside its place's +0.
 */
export const HOLSTERS: Readonly<Record<HolsterKind, Holster>> = {
  belt: { specialty: "pistol", carry: "hip", fastDraw: 0, retain: 0, maxBulk: null },
  military: { specialty: "pistol", carry: "hip", fastDraw: -2, retain: 0, maxBulk: null },
  shoulder: { specialty: "pistol", carry: "shoulderHolster", fastDraw: 0, retain: 0, maxBulk: null },
  sleeve: { specialty: "pistol", carry: null, fastDraw: 0, retain: 0, maxBulk: -1 },
  fastDrawRig: { specialty: "pistol", carry: "hip", fastDraw: 2, retain: 0, maxBulk: null },
  undercover: { specialty: "pistol", carry: null, fastDraw: -1, retain: 0, maxBulk: null },
  retention: { specialty: "pistol", carry: "hip", fastDraw: 0, retain: 2, maxBulk: null },
  rifleSling: { specialty: "longarm", carry: "shoulder", fastDraw: 0, retain: 0, maxBulk: null },
  patrolSling: { specialty: "longarm", carry: "patrolSling", fastDraw: 1, retain: 0, maxBulk: null },
  scabbard: { specialty: "longarm", carry: null, fastDraw: 0, retain: 0, maxBulk: null },
};

const HOLSTER_NAMES: Readonly<Record<string, HolsterKind>> = {
  "belt holster": "belt",
  "military holster": "military",
  "shoulder holster": "shoulder",
  "sleeve holster": "sleeve",
  "fast-draw rig": "fastDrawRig",
  "undercover holster": "undercover",
  "retention holster": "retention",
  "rifle sling": "rifleSling",
  "patrol sling": "patrolSling",
  "scabbard": "scabbard",
};

/** Which holster or sling a record is, by its name; null for anything else. */
export function holsterKindOf(name: string): HolsterKind | null {
  const plain = String(name ?? "").toLowerCase().replace(/\s*\(.*$/, "").trim();
  return HOLSTER_NAMES[plain] ?? null;
}

/** Whether a record is a lanyard (p. 154). */
export function isLanyard(name: string): boolean {
  return /^lanyard\b/i.test(String(name ?? "").trim());
}

/** A holster's modifier to Fast-Draw: a military holster's -2 goes with its flap tucked away. */
export function holsterModifier(kind: HolsterKind | null, options: { flapTucked?: boolean } = {}): number {
  if (!kind) return 0;
  if (kind === "military" && options.flapTucked) return 0;
  return HOLSTERS[kind].fastDraw;
}

/** Whether a gun of this Bulk fits the holster; a sleeve holster takes Bulk -1 at most. */
export function holsterFits(kind: HolsterKind, bulk: number): boolean {
  const max = HOLSTERS[kind].maxBulk;
  return max === null || (Number(bulk) || 0) >= max;
}

/**
 * The Ready maneuvers to draw or stow a gun (p. 153): one for a pistol in or
 * out of its holster, and one to raise a long arm on a patrol sling; two to
 * unsling or sling a long arm, three from the back.
 */
export function drawReadies(specialty: GunSpecialty, carry: Carry | null, kind: HolsterKind | null): number {
  if (specialty === "pistol") return 1;
  if (kind === "patrolSling" || carry === "patrolSling") return 1;
  if (carry === "backSling") return 3;
  if (kind === "rifleSling" || carry === "shoulder") return 2;
  return 1;
}

/**
 * What is left after a successful Fast-Draw (pp. 81, 153): a pistol, or a
 * long arm on a patrol sling, is drawn as a free action; unslinging a long
 * arm takes a second less. Quick-Sheathe (p. 249) does the same for stowing.
 */
export function readiesAfterFastDraw(readies: number): number {
  return Math.max(0, readies - 1);
}

// ── Fast-Draw with guns (p. 81) ──

/** A draw's roll: the off hand's -4 is the shared odd-position line; one gun per hand per turn is free. */
export interface GunDraws extends DrawCounts {
  /** A failed draw ends the turn's drawing. */
  failed: boolean;
}

export const NO_DRAWS: GunDraws = Object.freeze({ master: 0, off: 0, failed: false });

/** Why a draw with this hand isn't allowed this turn, or null: after a failure, or a second gun in the same hand. */
export function drawRefusal(draws: GunDraws, hand: Exclude<Hand, "both">): "failed" | "handUsed" | null {
  if (draws.failed) return "failed";
  return draws[hand] > 0 ? "handUsed" : null;
}

/** The Quick-Sheathe specialties a character's traits give (p. 249). */
export function quickSheatheSpecialties(traitNames: readonly string[]): string[] {
  return traitNames
    .map((n) => /^quick-sheathe\s*\(([^)]+)\)/i.exec(String(n ?? "").trim())?.[1])
    .filter((s): s is string => Boolean(s))
    .map((s) => s.trim().toLowerCase().replace(/[\s-]+/g, ""));
}

// ── Who Draws First? with guns (p. 82) ──

/** A gunfighter's side of a standoff. */
export interface GunSide {
  handOnWeapon: boolean;
  /** The drawn gun's Bulk, 0 or less. */
  bulk: number;
}

export const HAND_ON_GUN = 4;
export const WORSE_BULK = -1;

/**
 * A drawing gunfighter's special modifiers (p. 82): +4 with a hand already on
 * the gun, and -1 for the worse Bulk of the two.
 */
export function gunDrawModifiers(self: GunSide, foe: GunSide): ModifierKey[] {
  const lines: ModifierKey[] = [];
  if (self.handOnWeapon) lines.push({ key: "handOnWeapon", value: HAND_ON_GUN });
  if ((Number(self.bulk) || 0) < (Number(foe.bulk) || 0)) lines.push({ key: "bulk", value: WORSE_BULK });
  return lines;
}

/** The ready gunfighter's only modifier against a Fast-Draw: +1 for Combat Reflexes. */
export function gunReadyModifiers(combatReflexes: boolean): ModifierKey[] {
  return combatReflexes ? [{ key: "combatReflexes", value: 1 }] : [];
}
