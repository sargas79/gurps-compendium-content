/**
 * High-Tech's locks, safes, traps and barriers (pp. 202-205, 213): a lock's
 * toughness, quality and TL, safes and the hour it takes to open one,
 * electronic locks and identity verifiers, the picking aids, and the traps
 * and barriers -- caltrops, tripwires, stake pits, barbed and razor wire,
 * electric fences, car stoppers and spike strips.
 *
 * The barrier model, and a safe's figures on the item sheet, are the shared
 * security engine's (`src/shared/security/`), with this book's table.
 */

import type { Barrier } from "../../../shared/security/index.js";

// ── locks (pp. 203-205) ──

/** A lock's quality grades (p. 203); electronic locks and identity verifiers take the same (pp. 204-205). */
export const LOCK_QUALITIES = ["basic", "good", "fine"] as const;
export type LockQuality = (typeof LOCK_QUALITIES)[number];

/** A basic lock is +5 to pick, a good one no modifier, a fine one -5 (pp. 203, 205). */
export function lockQualityModifier(quality: LockQuality): number {
  return quality === "basic" ? 5 : quality === "fine" ? -5 : 0;
}

/** A good lock costs five times the basic one, a fine one twenty times (pp. 203, 205). */
export function lockQualityCost(quality: LockQuality): number {
  return quality === "fine" ? 20 : quality === "good" ? 5 : 1;
}

/** How hard a lock's exterior is to break: weak, standard or tough (p. 203). */
export const LOCK_TOUGHNESS = Object.freeze({
  weak: { dr: 3, hp: 2 },
  standard: { dr: 6, hp: 3 },
  tough: { dr: 12, hp: 3 },
});
export type LockToughness = keyof typeof LOCK_TOUGHNESS;

/** What a record is to the lock rules. */
export type LockKind = "lock" | "safe" | "electronic" | "verifier";

export interface LockRecord {
  kind: LockKind;
  toughness?: LockToughness;
  /** Forgery's modifier against a signature pad, with a computer analysis of a signature (p. 205). */
  forgery?: number;
}

/** The book's locks, safes, electronic locks and identity verifiers, by record name (pp. 203-205). */
export const LOCK_RECORDS: Readonly<Record<string, LockRecord>> = Object.freeze({
  "Lock, Weak": { kind: "lock", toughness: "weak" },
  "Lock, Standard": { kind: "lock", toughness: "standard" },
  "Lock, Tough": { kind: "lock", toughness: "tough" },
  "Bank Safe": { kind: "safe" },
  "Bank Vault": { kind: "safe" },
  "Depository": { kind: "safe" },
  "Fire Safe": { kind: "safe" },
  "Firearms Safe": { kind: "safe" },
  "Electronic Lock": { kind: "electronic" },
  "Fingerprint Scanner": { kind: "verifier" },
  "Retinal Scanner": { kind: "verifier" },
  "Signature Pad": { kind: "verifier", forgery: -3 },
  "Voiceprint Analyzer": { kind: "verifier" },
});

/** Safes use their own DR and HP, never the lock's toughness (p. 203). */
export const SAFES: Readonly<Record<string, { dr: number; hp: number }>> = Object.freeze({
  "Bank Safe": { dr: 120, hp: 73 },
  "Bank Vault": { dr: 400, hp: 127 },
  "Depository": { dr: 800, hp: 345 },
  "Fire Safe": { dr: 20, hp: 19 },
  "Firearms Safe": { dr: 80, hp: 64 },
});

/** The skill that gets past a lock: Lockpicking for a mechanical one, Electronics Operation (Security) for the rest (pp. 204-205, 213). */
export function pickSkill(kind: LockKind): string {
  return kind === "lock" || kind === "safe" ? "Lockpicking" : "Electronics Operation (Security)";
}

/** A lock takes a minute to pick (Characters p. 206), a safe an hour (p. 203), a lockpick gun five seconds an attempt (p. 213). */
export function pickSeconds(kind: LockKind, pickGun: boolean): number {
  if (pickGun) return 5;
  return kind === "safe" ? 3600 : 60;
}

/**
 * Older locks (p. 203): a burglar gets a bonus the size of the penalty the
 * Tech-Level Modifiers give equipment that many TLs behind the skill
 * (Characters p. 168) -- a TL7 thief is +3 against a TL5 lock and +1 against
 * a TL6 one. `penalty` is that table's figure; a lock no older takes nothing.
 */
export function olderLockBonus(lockTl: number, skillTl: number, penalty: number | null): number {
  if (!(lockTl < skillTl) || penalty === null) return 0;
  return Math.abs(penalty);
}

/** A lockpick gun: +4 more against a basic lock, -5 against a good or fine one (p. 213). */
export function pickGunModifier(quality: LockQuality): number {
  return quality === "basic" ? 4 : -5;
}

/** A stethoscope in a very quiet place is +2 against a mechanical lock (p. 213). */
export const STETHOSCOPE_BONUS = 2;

/** An endoscope, seeing inside the mechanism, is +2 to crack a lock or safe (p. 213). */
export const ENDOSCOPE_BONUS = 2;

/** Neutralizing each 10-yard section of a smart fence is Electronics Operation (Security) at -4 (p. 205). */
export const SMART_FENCE_MODIFIER = -4;

/** A spike strip's deflated tire: -4 to Driving and half Top Speed, flat in five seconds (p. 204). */
export const SPIKE_STRIP = Object.freeze({ driving: -4, topSpeed: 0.5, seconds: 5 });

// ── traps (p. 203) ──

/** A tripwire of fishing line is -2 more to spot; one unseen trips the victim unless they make DX-2 (p. 203). */
export const TRIPWIRE = Object.freeze({ invisible: -2, dx: -2 });

/** A punji stake or a dung-covered caltrop is -2 or worse to resist infection (p. 203). */
export const DIRTY_INFECTION = -2;

/**
 * Caltrops (p. 203): a Vision roll each second while moving, at the speed
 * penalty for the Move (-2 for Move 5), and -2 more when not watching the
 * ground. `speedPenalty` is the Size and Speed/Range Table's figure for the
 * Move, as the system reads it.
 */
export function caltropsVision(speedPenalty: number, watching: boolean): Array<{ key: "speed" | "watching"; value: number }> {
  const lines: Array<{ key: "speed" | "watching"; value: number }> = [];
  if (speedPenalty) lines.push({ key: "speed", value: speedPenalty });
  if (!watching) lines.push({ key: "watching", value: -2 });
  return lines;
}

/** A failed Vision roll steps on as many caltrops as it failed by, at least one (p. 203). */
export function caltropsSteppedOn(result: { success: boolean; margin: number }): number {
  if (result.success) return 0;
  return Math.max(1, Math.abs(Math.trunc(Number(result.margin) || 0)));
}

/** Each caltrop does thrust-3 impaling to the foot, from the victim's own ST (p. 203). */
export const CALTROP_DAMAGE = Object.freeze({ modifier: -3, type: "imp" as const, location: "foot" });

/** Damage at least the footwear's DR leaves the caltrop lodged; pulling each one out takes two Ready maneuvers (p. 203). */
export function caltropLodged(damage: number, dr: number): boolean {
  return damage >= Math.max(0, dr);
}
export const CALTROP_READIES = 2;

/** "1d-1" with -3 more is "1d-4": a thrust from the Damage Table and a trap's modifier. */
export function addToDice(formula: string, modifier: number): string {
  const match = /^(\d+)d([+-]\d+)?$/.exec(String(formula ?? "").trim());
  if (!match) return String(formula ?? "");
  const adds = Number(match[2] ?? 0) + modifier;
  return `${match[1]}d${adds > 0 ? `+${adds}` : adds < 0 ? String(adds) : ""}`;
}

// ── barriers (pp. 203-205) ──

/** Barbed and razor wire: DX-5 a yard to get through; razor wire's failure also cuts for 1d-3 (p. 204). */
export const BARRIERS: Readonly<Record<string, Barrier>> = Object.freeze({
  barbedWire: { avoid: { skills: [], attribute: "DX", modifier: -5 } },
  razorWire: { avoid: { skills: [], attribute: "DX", modifier: -5 }, damage: { formula: "1d-3", type: "cut", divisor: 1 } },
});

/** Wire snags clothing and gear as a Binding of ST 8 (p. 204; Binding, Characters p. 40). */
export const WIRE_SNAG_ST = 8;

/**
 * A failure in the wire tears the skin: a Will roll not to cry out, +3 with
 * High Pain Threshold, -4 with Low, and razor wire's at minus the injury
 * (p. 204).
 */
export function cryOutModifier(options: { highPainThreshold: boolean; lowPainThreshold: boolean; injury: number }): number {
  let value = 0;
  if (options.highPainThreshold) value += 3;
  if (options.lowPainThreshold) value -= 4;
  return value - Math.max(0, Math.trunc(options.injury));
}

/** The injury a cut does through DR: what gets past it, half again (Characters p. 379). */
export function cuttingInjury(damage: number, dr: number): number {
  return Math.floor(Math.max(0, damage - Math.max(0, dr)) * 1.5);
}

/** Laying barbed wire: a man-minute a yard, three without gloves, cutters and fasteners (p. 204). */
export function wireLayingMinutes(yards: number, equipped: boolean): number {
  return Math.max(0, yards) * (equipped ? 1 : 3);
}

/** An electromagnetic car stopper: HT-8, or out of action for seconds equal to the margin (p. 204). */
export const CAR_STOPPER = Object.freeze({ modifier: -8, minTl: 8 });

/** A lethal fence does 3d burning a second (p. 204). */
export const LETHAL_FENCE = "3d";
