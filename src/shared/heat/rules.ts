/**
 * A weapon heating up from sustained fire, the rule two books print:
 * Ultra-Tech's beams (p. 133) and High-Tech's firearms (pp. 85-86). Both count
 * the shots fired since the weapon was last cool against a limit, let a short
 * break start the count again while the weapon is still within it, and cool
 * an overheated weapon only after a longer rest. Each book brings its own
 * table: how long the break and the rest are, and (in its own code) the limit
 * and what overheating does.
 */

/** A book's timings. */
export interface HeatTable {
  /** Short of overheating, a pause this long since the last shot starts the count again. */
  pauseSeconds: number;
  /** A rest this long cools the weapon, however hot. */
  coolSeconds: number;
}

/** A weapon's heat: shots fired since it last cooled, and when it last fired (world seconds). */
export interface Heat {
  shots: number;
  lastShot: number | null;
}

export const COOL_HEAT: Heat = Object.freeze({ shots: 0, lastShot: null });

/** A heat record read from stored data, with nothing missing. */
export function heatFrom(stored: any): Heat {
  const shots = Math.max(0, Number(stored?.shots) || 0);
  const last = stored?.lastShot;
  return { shots, lastShot: last !== null && last !== undefined && Number.isFinite(Number(last)) ? Number(last) : null };
}

/** The shots counted now: none once the weapon has rested long enough. */
export function shotsCounted(heat: Heat, now: number, table: HeatTable): number {
  if (heat.lastShot !== null && now - heat.lastShot >= table.coolSeconds) return 0;
  return heat.shots;
}

/** Whether the weapon is past its limit now. */
export function isOverheated(heat: Heat, limit: number, now: number, table: HeatTable): boolean {
  return shotsCounted(heat, now, table) > limit;
}

/**
 * The heat after firing some shots: a long rest cools it; short of
 * overheating, a pause starts the count again; otherwise the shots add up.
 */
export function afterFiring(heat: Heat, shots: number, limit: number, now: number, table: HeatTable): Heat {
  const gap = heat.lastShot === null ? Number.POSITIVE_INFINITY : now - heat.lastShot;
  let count = heat.shots;
  if (gap >= table.coolSeconds) count = 0;
  else if (count <= limit && gap >= table.pauseSeconds) count = 0;
  return { shots: count + Math.max(0, shots), lastShot: now };
}
