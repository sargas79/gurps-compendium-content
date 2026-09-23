/**
 * What a load does to the dice and damage type of the round it changes, for
 * every book that loads a weapon with something other than its ordinary round
 * (Ultra-Tech's warheads, pp. 152-159; High-Tech's ammunition, pp. 163-175).
 */

const PIERCING = ["pi-", "pi", "pi+", "pi++"];

/** A piercing type moved up or down the ladder, held at the ends; other types unchanged. */
export function stepPiercing(type: string, steps: number): string {
  const i = PIERCING.indexOf(type);
  if (i < 0) return type;
  return PIERCING[Math.max(0, Math.min(PIERCING.length - 1, i + steps))]!;
}

export interface Dice { dice: number; adds: number; multiplier: number }

/** "3d-1", "6dx2" or "6d×2" as its dice, adds and multiple; null for anything else. */
export function parseDice(formula: string): Dice | null {
  const m = /^(\d*)d([+-]\d+)?(?:[x×](\d+))?$/i.exec(String(formula ?? "").replace(/\s+/g, ""));
  if (!m) return null;
  return { dice: m[1] ? Number(m[1]) : 1, adds: m[2] ? Number(m[2]) : 0, multiplier: m[3] ? Number(m[3]) : 1 };
}

export function formatDice(d: Dice): string {
  const adds = d.adds > 0 ? `+${d.adds}` : d.adds < 0 ? `${d.adds}` : "";
  return `${d.dice}d${adds}${d.multiplier > 1 ? `x${d.multiplier}` : ""}`;
}

/** "+1 damage per die" (Ultra-Tech pp. 152-158). */
export function plusPerDie(formula: string, perDie: number): string {
  const d = parseDice(formula);
  if (!d || !perDie) return formula;
  return formatDice({ ...d, adds: d.adds + d.dice * perDie });
}

/** Damage divided by a whole factor: dice and adds alike, half a die as +2, at least 1d-4. */
export function divideDamage(formula: string, by: number): string {
  const d = parseDice(formula);
  if (!d || by <= 1) return formula;
  const total = (d.dice * 3.5 + d.adds) * d.multiplier / by;
  const dice = Math.floor(total / 3.5);
  if (dice < 1) return formatDice({ dice: 1, adds: Math.max(-4, Math.round(total - 3.5)), multiplier: 1 });
  return formatDice({ dice, adds: Math.round(total - dice * 3.5), multiplier: 1 });
}

/** A range multiplied, rounded to the nearest yard. */
export const timesRange = (range: number, factor: number): number => Math.round((Number(range) || 0) * factor);
