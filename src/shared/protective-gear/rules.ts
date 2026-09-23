/**
 * Protective gear as the Basic Set's traits, for every book that prints masks,
 * suits and air tanks (Ultra-Tech pp. 171, 176-181; High-Tech pp. 72-76).
 *
 * A book keeps its own table of gear -- each piece by name, what it gives worn
 * alone and what it gives once the helmet or mask that completes it is on --
 * and its own tank durations by TL, and reads them through these helpers. The
 * trait terms are the same whichever book the gear comes from: Sealed, Vacuum
 * and Pressure Support, a Radiation Protection Factor, Temperature Tolerance,
 * the protected senses, Filter Lungs, Doesn't Breathe, and the limits some
 * masks put on sight and smell.
 */

import type { ComfortZone } from "../climate/rules.js";

/** What a piece of protective gear gives, in the Basic Set's trait terms. */
export interface Protection {
  sealed?: boolean;
  vacuumSupport?: boolean;
  /** Pressure support up to this many atmospheres. */
  pressureAtm?: number;
  /** Radiation Protection Factor. */
  radiationPf?: number;
  /** Climate control: the comfort zone it gives, in °F. */
  climate?: readonly [number, number];
  /** Degrees added to each end of the comfort zone, where the book gives it that way. */
  comfort?: ComfortZone;
  /** Glare-resistant: Protected Vision. */
  glare?: boolean;
  /** Hearing protection: Protected Hearing. */
  hearing?: boolean;
  /** A mask over the face: Protected Vision and Protected Smell. */
  mask?: boolean;
  /** Protected Smell alone. */
  smell?: boolean;
  /** Filters what is breathed. */
  filter?: boolean;
  /** Carries its own air: the wearer doesn't need to breathe what is outside. */
  air?: boolean;
  /** Restricted Vision (Characters p. 151) while worn. */
  restrictedVision?: "noPeripheral" | "tunnel";
  /** No Sense of Smell/Taste (Characters p. 146) while worn. */
  noSmellTaste?: boolean;
}

/** A piece of protective gear: what it gives on its own, and with what it needs worn with it. */
export interface ProtectiveGear {
  alone?: Protection;
  /** The helmet or mask that completes it, and what the two give together. */
  completedBy?: { pieces: RegExp; key: string; grants: Protection };
  /** Seconds to put on and take off. */
  don?: { on: number; off: number; skill?: string };
}

/** A book's gear, by name without its TL. */
export type GearTable = ReadonlyArray<readonly [RegExp, ProtectiveGear]>;

/** A name without the TL the table adds to it: "Combat Hardsuit (TL10)" is "Combat Hardsuit". */
export function baseName(name: string): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

/** A piece's entry in a book's table, or null. */
export function gearIn(table: GearTable, name: string): ProtectiveGear | null {
  const base = baseName(name);
  return table.find(([pattern]) => pattern.test(base))?.[1] ?? null;
}

/** What wearing a piece gives, from a book's table, given the names of everything else worn. */
export function protectionWornIn(table: GearTable, name: string, wornNames: readonly string[]): Protection | null {
  const gear = gearIn(table, name);
  if (!gear) return null;
  const completed = gear.completedBy && wornNames.some((other) => gear.completedBy!.pieces.test(baseName(other)));
  if (!completed) return gear.alone ?? null;
  return mergeProtection(gear.alone ?? {}, gear.completedBy!.grants);
}

const VISION_RANK = { noPeripheral: 1, tunnel: 2 } as const;

/** Two sets of protection together: the better of each, and the worse of what limits sight. */
export function mergeProtection(a: Protection, b: Protection): Protection {
  const climate = a.climate && b.climate
    ? ([Math.min(a.climate[0], b.climate[0]), Math.max(a.climate[1], b.climate[1])] as const)
    : (a.climate ?? b.climate);
  const comfort = a.comfort && b.comfort
    ? { coldF: Math.max(a.comfort.coldF, b.comfort.coldF), heatF: Math.max(a.comfort.heatF, b.comfort.heatF) }
    : (a.comfort ?? b.comfort);
  const vision = [a.restrictedVision, b.restrictedVision].filter(Boolean).sort((x, y) => VISION_RANK[y!] - VISION_RANK[x!])[0];
  return {
    ...(a.sealed || b.sealed ? { sealed: true } : {}),
    ...(a.vacuumSupport || b.vacuumSupport ? { vacuumSupport: true } : {}),
    ...(a.pressureAtm || b.pressureAtm ? { pressureAtm: Math.max(a.pressureAtm ?? 0, b.pressureAtm ?? 0) } : {}),
    ...(a.radiationPf || b.radiationPf ? { radiationPf: Math.max(a.radiationPf ?? 0, b.radiationPf ?? 0) } : {}),
    ...(climate ? { climate } : {}),
    ...(comfort ? { comfort } : {}),
    ...(a.glare || b.glare ? { glare: true } : {}),
    ...(a.hearing || b.hearing ? { hearing: true } : {}),
    ...(a.mask || b.mask ? { mask: true } : {}),
    ...(a.smell || b.smell ? { smell: true } : {}),
    ...(a.filter || b.filter ? { filter: true } : {}),
    ...(a.air || b.air ? { air: true } : {}),
    ...(vision ? { restrictedVision: vision } : {}),
    ...(a.noSmellTaste || b.noSmellTaste ? { noSmellTaste: true } : {}),
  };
}

/**
 * Pressure Support's level for a suit rated to this many atmospheres
 * (Characters p. 77): 10 atmospheres is the first level, 100 the second, and
 * anything beyond the third.
 */
export function pressureSupportLevel(atmospheres: number): number {
  if (!(atmospheres > 1)) return 0;
  if (atmospheres <= 10) return 1;
  if (atmospheres <= 100) return 2;
  return 3;
}

// A suit's climate range as degrees added to the comfort zone: the shared climate control engine's.
export { COMFORT_ZONE, climateTolerance } from "../climate/rules.js";

/**
 * A figure from a row printed by TL, starting at `firstTl`: a TL below the row
 * takes its first figure, and one above it its last.
 */
export function figureAtTl(row: readonly number[], firstTl: number, tl: number): number {
  if (!row.length) return 0;
  return row[Math.max(0, Math.min(row.length - 1, Math.floor(tl) - firstTl))]!;
}

/** Biomedical sensors on the patient: +1 to Diagnosis in person, or Diagnosis at -2 from afar (Ultra-Tech p. 187; High-Tech p. 75). */
export const BIOMEDICAL = { inPerson: 1, remote: -2 } as const;
