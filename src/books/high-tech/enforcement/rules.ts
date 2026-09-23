/**
 * High-Tech's enforcement and coercion gear: lie detectors and restraints
 * (pp. 215-217), as the figures the shared engines read.
 */

import type { CuffPosition, CuffedFigures, Restraint } from "../../../shared/restraints/index.js";

// ── lie detection (pp. 215-216) ──

/**
 * A polygraph's reading is a Quick Contest of the operator's Electronics
 * Operation (Medical) against the subject's Will; its margin, won or lost, is
 * the interrogators' modifier to Interrogation (p. 216).
 */
export const POLYGRAPH_SKILL = "Electronics Operation (Medical)";

/** A voice stress analyser counts as a polygraph with half its effect on Interrogation (p. 216). */
export const VSA_SHARE = 0.5;

/** A subject with Compulsive Lying always reads as truthful: -5 on machine-aided Interrogation (p. 216). */
export const COMPULSIVE_LYING = -5;
export const COMPULSIVE_LYING_TRAIT = /^compulsive lying\b/i;

/** The share of the margin a record gives, or null for one that isn't a lie detector. */
export function detectorShare(name: string): number | null {
  const text = String(name ?? "").trim();
  if (/^polygraph\b/i.test(text)) return 1;
  if (/^(vsa|cvsa software)$/i.test(text)) return VSA_SHARE;
  return null;
}

// ── restraints (p. 217) ──

export type RestraintKind = "shackles" | "handcuffs" | "flexCuffs" | "legIrons" | "straitjacket";

/** The restraints and their Escape modifiers, DR and HP (p. 217). */
export const RESTRAINTS: Readonly<Record<RestraintKind, Restraint & { dr?: number; hp?: number }>> = Object.freeze({
  // Crudely fitted: an unmodified Escape roll.
  shackles: { binds: "wrists", escape: 0, slip: true, dr: 4, hp: 10 },
  // Key-locking cuffs: -5 to Escape.
  handcuffs: { binds: "wrists", escape: -5, slip: true, dr: 4, hp: 6 },
  // Plastic loops: -1 to Escape.
  flexCuffs: { binds: "wrists", escape: -1, slip: true, dr: 1, hp: 2 },
  // Non-ratcheting leg irons: an unmodified Escape roll; ratcheting ones -5 (legIronsEscape).
  legIrons: { binds: "legs", escape: 0, slip: false, dr: 4, hp: 10 },
  // As cuffed behind the back, the hands in the sleeves and no slipping them round; Escape at -10 on average.
  straitjacket: { binds: "body", escape: -10, slip: false, noHands: true },
});

export function restraintKind(name: string): RestraintKind | null {
  const text = String(name ?? "").trim().toLowerCase();
  if (text === "shackles") return "shackles";
  if (text === "handcuffs") return "handcuffs";
  if (/^flex cuffs\b/.test(text)) return "flexCuffs";
  if (/^leg irons\b/.test(text)) return "legIrons";
  if (text === "straitjacket") return "straitjacket";
  return null;
}

/** Leg irons: TL5 ones are non-ratcheting (Escape unmodified), TL6-8 ratcheting (Escape-5) (p. 217). */
export function legIronsEscape(tl: number | null): number {
  return (tl ?? 5) >= 6 ? -5 : 0;
}

/** The iron ball on leg irons is carried by the prisoner: 50 lbs. more to carry (p. 217). */
export const BALL_WEIGHT = 50;

/**
 * Cuffed behind the back: -1 to DX in general, -4 on what needs only the
 * hands (worked blind behind the back), and nothing that needs the arms free.
 * In front: no DX penalty and -1 on hands-only tasks; one-handed blows are
 * impossible, while two-handed blows and weapons held with the hands together
 * (guns, two-handed swords) are unhindered (p. 217).
 */
export const CUFFED: Readonly<Record<CuffPosition, CuffedFigures>> = Object.freeze({
  behind: { dx: -1, hands: -4, weapons: "none" },
  front: { dx: 0, hands: -1, weapons: "twoHanded" },
});

/** The skills done with the hands alone, which cuffs hinder by their hands-only figure. */
export const HAND_SKILLS: readonly string[] = Object.freeze([
  "Filch",
  "Knot-Tying",
  "Lockpicking",
  "Pickpocket",
  "Sleight of Hand",
  "Typing",
]);
