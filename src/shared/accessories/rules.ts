/**
 * What is bolted to a gun, for every book that prints it: Ultra-Tech's
 * accessories (pp. 149-152) and High-Tech's (pp. 153-160) read these. Each
 * book keeps its own catalogue; these are the rules both use.
 */

/**
 * What a variable-power scope is worth for the seconds aimed: the Basic Set's
 * scope gives up a point for each second short of its bonus (Campaigns p. 411).
 */
export function scopeAfterAiming(bonus: number, secondsAimed: number): number {
  return Math.max(0, Math.min(bonus, Math.floor(secondsAimed)));
}

/**
 * What a fixed-power scope is worth for the seconds aimed: all of it once the
 * shooter has aimed at least as many seconds as the bonus, nothing before
 * (Campaigns p. 411).
 */
export function fixedScopeAfterAiming(bonus: number, secondsAimed: number): number {
  const full = Math.max(0, Math.floor(bonus));
  return Math.floor(secondsAimed) >= full ? full : 0;
}

/** A targeting program: +1 to one Guns or Gunner specialization at Complexity 3, +2 at 4 (Ultra-Tech p. 150). */
export function targetingProgramBonus(complexity: number): number {
  return complexity >= 4 ? 2 : complexity >= 3 ? 1 : 0;
}

/** The ST penalty a row carries at a new ST requirement, never worse than the one it had (Characters p. 270). */
export function minStPenaltyAfter(st: number, minSt: number | null, had: number): number {
  const now = minSt === null || minSt <= st ? 0 : st - minSt;
  return Math.max(had, now);
}

/** The ST penalty a row carries at an ST requirement, better or worse than before (Characters p. 270). */
export function minStPenaltyAt(st: number, minSt: number | null): number {
  return minSt === null || minSt <= st ? 0 : st - minSt;
}

/** An ST requirement times a multiplier, rounded up; none stays none. */
export function scaledMinSt(minSt: number | null, multiplier: number): number | null {
  return minSt === null ? null : Math.ceil(minSt * multiplier - 1e-9);
}

/** Damage multiplied by a factor, by its average: 3d x1.5 is 4d+2. Text that isn't dice stays as it is. */
export function multiplyDamage(formula: string, factor: number): string {
  const m = /^(\d*)d([+-]\d+)?$/i.exec(String(formula ?? "").replace(/\s+/g, ""));
  if (!m || factor === 1) return formula;
  const d = { dice: m[1] ? Number(m[1]) : 1, adds: m[2] ? Number(m[2]) : 0 };
  const total = (d.dice * 3.5 + d.adds) * factor;
  const dice = Math.max(1, Math.floor(total / 3.5));
  const adds = Math.round(total - dice * 3.5);
  return `${dice}d${adds > 0 ? `+${adds}` : adds < 0 ? `${adds}` : ""}`;
}
