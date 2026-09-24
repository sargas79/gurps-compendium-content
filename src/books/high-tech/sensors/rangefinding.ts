/**
 * Active rangefinding, as the Electricity and Electronics supplement refines
 * High-Tech's active sensors (HT:EE p. 35; High-Tech pp. 45-46):
 *
 *   - A sensor's emissions are detected out to twice its range without a
 *     roll (High-Tech p. 45); past that, a skill roll at -1 for each further
 *     20% of the sensor's range, to at most -10 at a further 200%.
 *   - The target's size counts at half its SM, rounded down.
 *   - Past the rated range the operator takes -2 per doubling, in half steps:
 *     -1 at 1.5 times.
 *   - Dwelling on one target 4 times as long doubles the range before that
 *     penalty, 15 times as long quadruples it; the target gets +2 or +4 to
 *     detect the emissions while it does.
 *
 * The rules High-Tech prints alike with Ultra-Tech -- -2 per doubling and
 * detection at twice the range -- stay the shared engine's
 * (`src/shared/sensors/rules.ts`); this is only what the supplement adds.
 */

import { emissionDetectionRange } from "../../../shared/sensors/rules.js";

/** Each further 20% of the sensor's range beyond where its emissions are detected is -1 (HT:EE p. 35). */
export const EMISSION_STEP = 0.2;
/** No further than 200% of the sensor's range past it, at -10 (HT:EE p. 35). */
export const EMISSION_REACH = 2;

/**
 * The detector's modifier to sense an active sensor's emissions at a distance
 * (HT:EE p. 35): 0 within twice its range (1.5 times the halved range with
 * LPI, High-Tech p. 46), -1 per further 20% of its range, and null past a
 * further 200%. With LPI the range the steps are taken of is the halved one.
 */
export function emissionModifier(distance: number, range: number, lpi = false): number | null {
  const detected = emissionDetectionRange(range, lpi);
  if (distance <= detected) return 0;
  const effective = lpi ? range / 2 : range;
  const extra = (distance - detected) / effective;
  if (extra > EMISSION_REACH + 1e-9) return null;
  return -Math.ceil(Math.round((extra / EMISSION_STEP) * 1000) / 1000);
}

/** How far a detector can sense the emissions with the roll, at its worst (HT:EE p. 35). */
export function emissionReach(range: number, lpi = false): number {
  return emissionDetectionRange(range, lpi) + (lpi ? range / 2 : range) * EMISSION_REACH;
}

/** The target's size to an active sensor: half its SM, rounded down (HT:EE p. 35). */
export function sensorSizeModifier(sm: number): number {
  return Math.floor((Number(sm) || 0) / 2);
}

/**
 * The operator's penalty past a sensor's rated range (HT:EE p. 35): -2 per
 * doubling as High-Tech has it (p. 45), taken a level at a time, the half
 * level at 1.5 times -- 1.5, 2, 3, 4, 6, 8 ... times the range for -1, -2,
 * -3, -4, -5, -6 ...
 */
export function rangefindingPenalty(distance: number, range: number): number {
  if (!(range > 0) || distance <= range) return 0;
  const ratio = distance / range;
  const doublings = Math.floor(Math.log2(ratio) + 1e-9);
  const past = ratio / 2 ** doublings;
  if (past <= 1 + 1e-9) return -2 * doublings;
  return -2 * doublings - (past <= 1.5 + 1e-9 ? 1 : 2);
}

/** Dwelling on a target (HT:EE p. 35): how much longer, the range it reaches before the penalty, and the target's bonus to detect it. */
export const DWELL = Object.freeze({
  x4: Object.freeze({ time: 4, range: 2, detect: 2 }),
  x15: Object.freeze({ time: 15, range: 4, detect: 4 }),
});
export type Dwell = keyof typeof DWELL;

/** The range before the penalty, dwelling or not. */
export function dwellRange(range: number, dwell: Dwell | "" = ""): number {
  return dwell ? range * DWELL[dwell].range : range;
}

/** The supplement's ground-penetrating radar: a successful Electronics Operation (Scientific) roll with it is +2 to a skill it serves (HT:EE p. 35). */
export const GPR_SURVEY = 2;

/**
 * The skill a detector rolls against a sensor's emissions: the book names
 * none, so the GM picks; Electronics Operation (EW) against radar, (Sonar)
 * against sonar, by default (p. B189).
 */
export const DETECTOR_SKILLS = ["Electronics Operation (EW)", "Electronics Operation (Sensors)", "Electronics Operation (Sonar)"] as const;
export const detectorSkill = (kind: string): (typeof DETECTOR_SKILLS)[number] => (kind === "sonar" ? "Electronics Operation (Sonar)" : "Electronics Operation (EW)");
