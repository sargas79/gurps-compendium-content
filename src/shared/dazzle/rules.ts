/**
 * Lasers aimed at the eyes, for every book that prints them (Ultra-Tech
 * pp. 113-114, High-Tech p. 181).
 *
 * A dazzle beam and a blinding beam are Vision-based afflictions resisted
 * with HT; Protected Vision adds +5 to the roll and a Nictitating Membrane +1
 * a level. A dazzled victim is blind for minutes equal to the margin of
 * failure. What a blinding beam leaves is each book's own: Ultra-Tech's blinds
 * for good, High-Tech's cripples the eyes as a crippling injury does
 * (Campaigns p. 422), for good on a failure by 10 or more. Each book registers
 * its table in `DAZZLE_TABLES` and reads it back by its own slug.
 */

import { BookTables, type BookTable } from "../book-tables.js";

/** One book's reading of what a laser does to eyes. */
export interface DazzleTable extends BookTable {
  /** What a failed roll against a blinding beam leaves. */
  blinding: "permanent" | "crippling";
}

export const DAZZLE_TABLES = new BookTables<DazzleTable>();

/** The two things a laser at the eyes can be set to do. */
export type EyeBeam = "dazzle" | "blinding";

/** What a failed roll leaves the victim with. */
export type Blindness =
  | { kind: "dazzled"; minutes: number }
  | { kind: "blinded"; permanent: boolean };

/** Protected Vision's bonus to resist (Characters p. 78). */
export const PROTECTED_VISION_BONUS = 5;

/** "Protected Vision adds +5 to resist. A Nictitating Membrane adds +1 per level" (Ultra-Tech pp. 113-114), read from trait names. */
export function visionResistBonus(traitNames: readonly string[]): number {
  let bonus = 0;
  for (const name of traitNames) {
    if (/^protected vision\b/i.test(name)) bonus += PROTECTED_VISION_BONUS;
    const membrane = /^nictitating membrane\b\D*(\d+)?/i.exec(name);
    if (membrane) bonus += Math.max(1, Number(membrane[1]) || 1);
  }
  return bonus;
}

/** The same bonus from what the character has, however it came by it: a trait or the gear it wears. */
export function eyeProtection(options: { protectedVision: boolean; nictitatingMembrane: number }): number {
  return (options.protectedVision ? PROTECTED_VISION_BONUS : 0) + Math.max(0, Math.floor(Number(options.nictitatingMembrane) || 0));
}

/** A failure by this much is a critical failure (Characters p. 348). */
export const CRITICAL_MARGIN = 10;

/**
 * What a failed resistance roll leaves: blindness for minutes equal to the
 * margin from a dazzle beam (at least one), and from a blinding beam whatever
 * the book's table says.
 */
export function blindnessFrom(table: DazzleTable, beam: EyeBeam, margin: number): Blindness {
  const by = Math.max(1, Math.floor(Number(margin) || 0));
  if (beam === "dazzle") return { kind: "dazzled", minutes: by };
  return { kind: "blinded", permanent: table.blinding === "permanent" || by >= CRITICAL_MARGIN };
}
