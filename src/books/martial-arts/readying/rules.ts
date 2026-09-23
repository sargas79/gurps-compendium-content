/**
 * Readying weapons (GURPS Martial Arts pp. 101-104): the pure rules for
 * multiple Fast-Draw, Fast-Draw from odd positions and carry locations, rapid
 * grip changes, and quick-readying nearby weapons.
 *
 * Multiple Fast-Draw and the odd positions are High-Tech's too, so they live
 * in the shared readying engine (`src/shared/readying/`); this is Martial
 * Arts' table of carry locations, and the rules only it prints.
 */

import type { Carry, CarryOptions } from "../../../shared/readying/rules.js";

export {
  afterDraw,
  bootReachable,
  multipleDrawPenalty,
  situationModifiers,
  specialtyOf,
  type Carry,
  type DrawCounts,
  type Hand,
} from "../../../shared/readying/rules.js";

/** A weapon's grip; half-swording is a sword's Defensive Grip (p. 111). */
export type Grip = "regular" | "defensive" | "halfSword" | "reversed";
export const GRIPS: readonly Grip[] = ["regular", "defensive", "halfSword", "reversed"];

/** The places Martial Arts' carry-location table lists (p. 104). */
export const CARRIES: readonly Carry[] = [
  "hip", "oppositeHip", "sameHip", "shoulder", "backSling", "inHand", "quiver", "ground",
  "elsewhere", "chestHandleDown", "boot", "belt", "concealed", "teeth", "pegs", "coiled", "wrapped", "other",
];

/** A carry location's modifier for a specialty (p. 104); null where the table doesn't list that place. */
export function carryModifier(specialty: string, carry: Carry, options: CarryOptions = {}): number | null {
  const table: Record<string, Partial<Record<Carry, number>>> = {
    arrow: { ground: 1, quiver: 0, belt: -2 },
    flexible: { coiled: 0, wrapped: -2 },
    forcesword: { hip: 0, elsewhere: -1, boot: -2, concealed: -3 },
    knife: { hip: 0, quiver: 0, elsewhere: -1, chestHandleDown: -1, boot: -2, belt: -2, concealed: -3, teeth: -5 },
    shuriken: { pegs: 0, other: -3 },
    sword: { oppositeHip: 0, shoulder: 0, sameHip: options.reversedGrip ? 0 : -1, inHand: 0 },
    tonfa: { sameHip: 0, oppositeHip: -1, other: -2 },
    twohandedsword: { backSling: 0, shoulder: 0, inHand: 0, other: -2 },
  };
  const row = table[specialty];
  if (!row || row[carry] === undefined) return null;
  return row[carry]! + (specialty === "sword" && options.noScabbard ? -2 : 0);
}

/** A rapid grip change's roll (p. 102): -4 two-handed, -6 one-handed, 0 with a tonfa. Never to or from a Defensive Grip. */
export function rapidGripPenalty(options: { twoHanded: boolean; tonfa: boolean }): number {
  if (options.tonfa) return 0;
  return options.twoHanded ? -4 : -6;
}

/** Where a nearby weapon is readied from in one second (p. 104), and the roll's modifier. */
export type QuickSource = "floorCrouch" | "floorFlip" | "rack" | "stuckOnFoot" | "stuckMounted";
export const QUICK_SOURCES: Readonly<Record<QuickSource, number>> = {
  floorCrouch: -3,
  floorFlip: -5,
  rack: -3,
  stuckOnFoot: -1,
  stuckMounted: -3,
};
