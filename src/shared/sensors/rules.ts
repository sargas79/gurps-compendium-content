/**
 * Comms and sensors: the rules the books print alike, whatever their gear.
 *
 * Ultra-Tech (pp. 43-46, 60-66) and High-Tech (pp. 37-39, 45-47) rate a comm
 * by size and a range, reach a comm of another size by the same steps,
 * stretch range by the same roll and repeat slowed data for more of it, cut
 * radio in cities and for live video alike; an active sensor takes -2 per
 * doubling past its range and is detected at twice it (1.5 times the halved
 * range with LPI); and each doubling of an optic's magnification is a level of
 * Telescopic Vision. Each book's figures -- its gear, its ranges, its options
 * -- are its own, in its table.
 */

/** Comm sizes, smallest first (Ultra-Tech p. 43; High-Tech p. 38 uses tiny to large). */
export const COMM_SIZES = ["micro", "tiny", "small", "medium", "large", "veryLarge"] as const;
export type CommSize = (typeof COMM_SIZES)[number];

/** How a comm is built: two-way, receive-only or transmit-only. */
export type CommMode = "" | "receiver" | "transmitter";

/** A receive-only comm is 10% the cost and 20% the weight (Ultra-Tech p. 46; High-Tech p. 39). */
export const RECEIVER = Object.freeze({ cost: 0.1, weight: 0.2 });
/** A transmit-only comm is 90% the cost and 80% the weight (Ultra-Tech p. 46). */
export const TRANSMITTER = Object.freeze({ cost: 0.9, weight: 0.8 });

/** How many sizes apart two comms are. */
export function sizeSteps(a: CommSize, b: CommSize): number {
  return Math.abs(COMM_SIZES.indexOf(a) - COMM_SIZES.indexOf(b));
}

/** 1, 3, 10, 30, 100 ... for 0, 1, 2, 3, 4 ... sizes' difference (Ultra-Tech p. 43; High-Tech p. 38). */
export function sizeStepFactor(steps: number): number {
  const tens = 10 ** Math.floor(steps / 2);
  return steps % 2 === 1 ? 3 * tens : tens;
}

/**
 * Stretching a comm's range: an Electronics Operation (Communications) roll
 * at -1 per 10% added, up to double (Ultra-Tech p. 43; High-Tech p. 38). Null
 * past double.
 */
export function rangeExtensionModifier(distance: number, range: number): number | null {
  if (distance <= range) return 0;
  const extra = distance / range - 1;
  if (extra > 1 + 1e-9) return null;
  return -Math.ceil(Math.round(extra * 1000) / 100);
}

/** Repeating data for range: 1/4 speed doubles it, 1/100 times 10, 1/10,000 times 100 (Ultra-Tech p. 43; High-Tech p. 38). */
export function slowedRangeFactor(speedFraction: number): number {
  if (speedFraction <= 1 / 10000) return 100;
  if (speedFraction <= 1 / 100) return 10;
  if (speedFraction <= 1 / 4) return 2;
  return 1;
}

/**
 * What cuts a radio's range: it may drop to a tenth in a city or underground,
 * and is divided by 10 again for a real-time audio-visual signal (Ultra-Tech
 * p. 44; High-Tech p. 38).
 */
export function radioRangeFactor(options: { urban?: boolean; audioVisual?: boolean }): number {
  return (options.urban ? 0.1 : 1) * (options.audioVisual ? 0.1 : 1);
}

/**
 * An active sensor's penalty at a distance: nothing out to its range, -2 per
 * doubling beyond. LPI halves the range (Ultra-Tech p. 63; High-Tech pp. 45-46).
 */
export function activeRangePenalty(distance: number, range: number, lpi = false): number {
  const effective = lpi ? range / 2 : range;
  if (distance <= effective) return 0;
  return -2 * Math.ceil(Math.log2(distance / effective) - 1e-9);
}

/**
 * How far away an active sensor's emissions are detected: twice its range,
 * 1.5 times the halved range with LPI (Ultra-Tech p. 63; High-Tech pp. 45-46).
 */
export function emissionDetectionRange(range: number, lpi = false): number {
  return lpi ? (range / 2) * 1.5 : range * 2;
}

/** Each doubling of magnification ignores -1 in range penalties: Telescopic Vision levels (Ultra-Tech p. 60; High-Tech p. 47). */
export function telescopicLevels(magnification: number): number {
  return magnification > 1 ? Math.floor(Math.log2(magnification) + 1e-9) : 0;
}

/** A targeting lock's +3 to hit with an aimed ranged attack (Ultra-Tech p. 63; High-Tech p. 45). */
export const TARGETING_LOCK = 3;
