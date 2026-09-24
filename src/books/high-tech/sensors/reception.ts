/**
 * Radio reception from High-Tech: Electricity and Electronics (HT:EE pp.
 * 27-30), which the supplement adds to High-Tech's radios (pp. 36-40):
 *
 *   - the range between two different radios, which replaces High-Tech's
 *     size steps (HT:EE p. 28; High-Tech p. 38), under High-Tech's `radios`;
 *   - interference, the tuning roll and a coil-tuned set's drift (HT:EE pp.
 *     27, 29-30), under `radioTuning`;
 *   - the monopole, dipole and directional antennas (HT:EE p. 28), under
 *     `radioAntennas`; the monopole is High-Tech's long antenna (p. 39);
 *   - shortwave skip (HT:EE p. 30), under `shortwaveSkip`.
 */

const MILE = 1760;

// ── Mix and match (HT:EE p. 28) ──

/**
 * Two different radios reach the square root of the product of their ranges
 * (HT:EE p. 28), in place of High-Tech's rule of the shorter range times the
 * size steps (High-Tech p. 38). Two radios of one range reach that range.
 */
export function mismatchedRange(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  if (a <= 0 || b <= 0) return 0;
  return Math.sqrt(a * b);
}

// ── Antennas (HT:EE p. 28) ──

export type AntennaKey = "longAntenna" | "dipoleAntenna" | "directionalAntenna";

/**
 * The antennas a radio may be built with: each multiplies the range at its
 * end of the link, and the cost and weight, from its TL (HT:EE p. 28). The
 * quarter-wave monopole is High-Tech's long antenna (High-Tech p. 39), which
 * the `radios` switch already runs; the dipole reaches only broadside to its
 * wires, the directional antenna only in a narrow beam once aimed.
 */
export const ANTENNAS: Readonly<Record<AntennaKey, { range: number; cost: number; weight: number; tl: number }>> = Object.freeze({
  longAntenna: { range: 2, cost: 1.25, weight: 1.25, tl: 6 },
  dipoleAntenna: { range: 1.5, cost: 1.1, weight: 1.1, tl: 6 },
  directionalAntenna: { range: 10, cost: 1.5, weight: 1.5, tl: 7 },
});

/** Where the far radio lies from a dipole: broadside to its wires, or off their ends (HT:EE p. 28). */
export type DipoleBearing = "broadside" | "endOn";

/** How one end of a link has its antennas set: the dipole's bearing, and whether the directional antenna is on target. */
export interface AntennaSetting {
  dipole?: DipoleBearing;
  aimed?: boolean;
}

/**
 * What one end's antennas do for a link's range (HT:EE p. 28): a radio uses
 * its best antenna that points the right way; a dipole sends nothing off the
 * ends of its wires, and a directional antenna helps only while aimed. A
 * radio whose only antenna is a dipole end-on reaches nothing. Antennas at
 * both ends both count, so the link's range takes each end's factor.
 */
export function antennaFactor(has: Partial<Record<AntennaKey, boolean>>, setting: AntennaSetting = {}): number {
  const factors: number[] = [];
  if (has.longAntenna) factors.push(ANTENNAS.longAntenna.range);
  if (has.dipoleAntenna) factors.push(setting.dipole === "endOn" ? 0 : ANTENNAS.dipoleAntenna.range);
  if (has.directionalAntenna) factors.push(setting.aimed ? ANTENNAS.directionalAntenna.range : 1);
  return factors.length ? Math.max(...factors) : 1;
}

/** At TL8, automatic aiming software points a directional antenna at a known transmitter, with no roll (HT:EE p. 28). */
export function aimsItself(tl: number): boolean {
  return tl >= 8;
}

/** A large antenna: what a shortwave transmitter needs (HT:EE p. 30). */
export function hasLargeAntenna(has: Partial<Record<AntennaKey, boolean>>): boolean {
  return Boolean(has.longAntenna || has.dipoleAntenna || has.directionalAntenna);
}

// ── Interference and tuning (HT:EE pp. 27, 29-30) ──

/**
 * Interference is -1 to -10 on the rolls to pick up a signal (at -10 it's
 * blocked outright), and good conditions up to +4 (HT:EE p. 27).
 */
export const INTERFERENCE = Object.freeze({ worst: -10, best: 4 });
/** The conditions the tuning roll's dialog offers, worst first. */
export const CONDITIONS: readonly number[] = Array.from({ length: INTERFERENCE.best - INTERFERENCE.worst + 1 }, (_, i) => INTERFERENCE.worst + i);

/** A software-defined radio's enhanced tuning: +4 to the tuning roll (HT:EE pp. 29-30). */
export const ENHANCED_TUNING = 4;
/** A galvanometer watching the signal's strength: +1 in place of the Hearing modifiers (HT:EE p. 29). */
export const GALVANOMETER = 1;
/** A coil-tuned set drifts: the listener rolls again every 10 minutes (HT:EE p. 29). */
export const DRIFT_MINUTES = 10;

/**
 * Whether a set is coil-tuned, and drifts, unless the GM says otherwise:
 * quartz crystals are cutting edge at TL6 (HT:EE p. 29), so a TL6 set is
 * taken to be coil-tuned, and a later one crystal-tuned.
 */
export function driftsByDefault(tl: number): boolean {
  return tl <= 6;
}

/** The radio peripheral: a computer as a software-defined radio, 35 miles, with enhanced tuning (HT:EE p. 30). */
export const RADIO_PERIPHERALS: Readonly<Record<string, { range: number }>> = Object.freeze({
  "Radio Peripheral": { range: 35 * MILE },
});

/** What goes into a tuning roll. */
export interface TuningInput {
  /** The penalty for the distance past the standard range, from the stretch rule (-1 per 10%); null past double. */
  rangeModifier: number | null;
  /** -10 to +4: interference, or good conditions. */
  conditions: number;
  /** The listener's modifiers to Hearing rolls (p. B358): Acute Hearing, Hard of Hearing. */
  hearing: number;
  /** A galvanometer is connected. */
  galvanometer: boolean;
  /** The listener's set is a software-defined radio. */
  enhanced: boolean;
  /** Shortwave's penalties, where the signal skips (see `skipLines`). */
  skip?: Array<{ key: string; value: number }>;
}

export type TuningKey = "range" | "conditions" | "hearing" | "galvanometer" | "enhanced";

/**
 * The tuning roll against Electronics Operation (Communications) (HT:EE p.
 * 29): -1 per 10% past the standard range, the interference or good
 * conditions, the listener's Hearing modifiers (or +1 with a galvanometer in
 * their place), and +4 for a software-defined radio. It is rolled only for a
 * faint signal or against interference: a signal in range and clear comes
 * through with no roll (HT:EE p. 27). Null where the signal is out of reach.
 */
export function tuningRoll(input: TuningInput): { needed: boolean; lines: Array<{ key: TuningKey | string; value: number }> } | null {
  const skip = input.skip ?? null;
  if (input.rangeModifier === null && !skip) return null;
  if (input.conditions <= INTERFERENCE.worst) return null;
  const lines: Array<{ key: TuningKey | string; value: number }> = [];
  if (skip) lines.push(...skip.filter((l) => l.value !== 0));
  else if (input.rangeModifier) lines.push({ key: "range", value: input.rangeModifier });
  if (input.conditions) lines.push({ key: "conditions", value: input.conditions });
  const needed = lines.some((l) => l.value < 0);
  if (!needed) return { needed, lines: [] };
  if (input.galvanometer) lines.push({ key: "galvanometer", value: GALVANOMETER });
  else if (input.hearing) lines.push({ key: "hearing", value: input.hearing });
  if (input.enhanced) lines.push({ key: "enhanced", value: ENHANCED_TUNING });
  return { needed, lines };
}

// ── Shortwave (HT:EE p. 30) ──

/** One skip off the upper atmosphere reaches 2,000 miles (HT:EE p. 30). */
export const SKIP = 2000 * MILE;
/** Six skips reach anywhere on Earth (HT:EE p. 30). */
export const MAX_SKIPS = 6;
/** Each of an unfavourable time of day, summer and a solar flare is -2 (HT:EE p. 30). */
export const SKIP_CONDITION = -2;
export type SkipCondition = "timeOfDay" | "summer" | "solarFlare";
export const SKIP_CONDITIONS: readonly SkipCondition[] = ["timeOfDay", "summer", "solarFlare"];

/** How many skips a shortwave signal takes to cover a distance in yards: one to six, six reaching anywhere (HT:EE p. 30). */
export function skipsFor(yards: number): number {
  return Math.min(MAX_SKIPS, Math.max(1, Math.ceil(yards / SKIP - 1e-9)));
}

/**
 * Shortwave's penalties on the roll to pick up a skipping signal (HT:EE p.
 * 30): -1 for each skip after the first, and -2 for each unfavourable
 * condition. Which time of day is unfavourable turns on the band: daytime for
 * 1.5-12 MHz, night for 12-30 MHz; the GM says.
 */
export function skipLines(yards: number, conditions: Partial<Record<SkipCondition, boolean>>): Array<{ key: string; value: number }> {
  const skips = skipsFor(yards);
  const lines: Array<{ key: string; value: number }> = [{ key: "skips", value: -(skips - 1) }];
  for (const c of SKIP_CONDITIONS) if (conditions[c]) lines.push({ key: c, value: SKIP_CONDITION });
  return lines;
}

/**
 * Whether a shortwave link skips rather than travels by its ground range: past
 * the standard range, where the skip's penalties are no worse than
 * stretching the range would be (or the range can't be stretched that far).
 */
export function skipApplies(yards: number, range: number, rangeModifier: number | null, skip: Array<{ key: string; value: number }>): boolean {
  if (yards <= range) return false;
  if (rangeModifier === null) return true;
  const total = skip.reduce((sum, l) => sum + l.value, 0);
  return total > rangeModifier;
}
