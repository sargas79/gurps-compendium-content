/**
 * High-Tech's special shooting situations (p. 85): guns fired underwater,
 * shots into water and steeply into the air, and automatics in space.
 */

/** Distance underwater counts a thousand times over for an ordinary gun (p. 85). */
export const UNDERWATER_FACTOR = 1000;

/** Whether the rule is for this gun: an ordinary TL6-8 firearm (p. 85). */
export function modernGun(techLevel: number): boolean {
  return techLevel >= 6 && techLevel <= 8;
}

/**
 * A row fired underwater: its ranges divided by what the distance is
 * multiplied by -- 1,000 for an ordinary gun, 25 for a gun built to fire
 * underwater (pp. 85, 92, 117) -- to the nearest tenth of a yard. A row's
 * ranges are whole yards, so a range there was stays at least one: a pistol's
 * 1/2D of 160 yards is under a foot of water, which a yard stands for, rather
 * than reading as no 1/2D at all.
 */
export function underwaterRange(row: { halfDamageRange: number; maxRange: number }, factor: number): { halfDamageRange: number; maxRange: number } {
  const f = factor > 0 ? factor : UNDERWATER_FACTOR;
  const tenth = (n: number) => {
    const range = Math.max(0, Number(n) || 0);
    return range > 0 ? Math.max(1, Math.round((range / f) * 10) / 10) : 0;
  };
  return { halfDamageRange: tenth(row.halfDamageRange), maxRange: tenth(row.maxRange) };
}

/** Malf. underwater: 1 less for any gun, 2 less for an automatic -- self-loading pistols too (p. 85). */
export function underwaterMalfunctionLoss(automatic: boolean): number {
  return automatic ? 2 : 1;
}

/** An automatic TL6-8 gun in space malfunctions on 14 -- not a revolver or a manual repeater (p. 85). */
export const SPACE_MALFUNCTION = 14;

/** Every shot into the water is at -4 (p. 85). */
export const INTO_WATER_PENALTY = -4;

/** The distance a shot into water counts: the range to the surface, and each yard of water a thousand (p. 85). */
export function intoWaterDistance(rangeYards: number, depthFeet: number): number {
  return Math.max(0, rangeYards) + (Math.max(0, depthFeet) * UNDERWATER_FACTOR) / 3;
}

/** Firing at 50°-90° into the air cuts the range to 80% (p. 85). */
export const STEEP_ANGLE_RANGE = 0.8;

/** How a shot's distance stands against the row's ranges: in reach, past 1/2D, or out of range. */
export function reach(distance: number, row: { halfDamageRange: number; maxRange: number }, rangeFactor = 1): "full" | "half" | "out" {
  const max = Math.max(0, row.maxRange) * rangeFactor;
  const half = Math.max(0, row.halfDamageRange) * rangeFactor;
  if (max > 0 && distance > max) return "out";
  if (half > 0 && distance > half) return "half";
  return "full";
}
