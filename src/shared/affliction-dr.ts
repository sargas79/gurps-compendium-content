/**
 * The system's DR line on an affliction's resistance roll, for every book
 * whose weapons count DR their own way.
 *
 * Since API 1.105.0 the system gives the victim of an affliction a bonus equal
 * to his DR (Characters p. 35): worn armour, his own DR and a force field at
 * the spot struck, divided by the row's armour divisor. It is one line in
 * `gworld.successRollModifiers`, keyed `afflictionDr`, on the roll tagged
 * `resist` and `affliction`. A book whose weapon counts DR the same way needs
 * nothing more. A book that counts it another way changes that line's value,
 * and a book whose weapon DR does nothing against takes the line out, so DR is
 * never counted twice.
 */

/** The key the system gives its DR line on a resistance roll. */
export const AFFLICTION_DR_KEY = "afflictionDr";

/** The system's DR line on a resistance roll, or null where it gave none. */
export function afflictionDrLine(context: any): { key?: string; label?: string; value: number } | null {
  const modifiers: any[] = Array.isArray(context?.modifiers) ? context.modifiers : [];
  return modifiers.find((m) => m?.key === AFFLICTION_DR_KEY) ?? null;
}

/** Takes the system's DR line off a resistance roll, for an attack DR does nothing against. True if there was one. */
export function dropAfflictionDr(context: any): boolean {
  const modifiers: any[] = Array.isArray(context?.modifiers) ? context.modifiers : [];
  const at = modifiers.findIndex((m) => m?.key === AFFLICTION_DR_KEY);
  if (at < 0) return false;
  modifiers.splice(at, 1);
  return true;
}

/**
 * Sets the system's DR line to a book's own count, taking it out at 0. Where
 * the system gave no line (no DR at the spot, or an attack DR does nothing
 * against), none is added.
 */
export function setAfflictionDr(context: any, value: number, label?: string): void {
  const line = afflictionDrLine(context);
  if (!line) return;
  const bonus = Math.max(0, Math.floor(Number(value) || 0));
  if (bonus <= 0) {
    dropAfflictionDr(context);
    return;
  }
  line.value = bonus;
  if (label) line.label = label;
}

/**
 * The armour divisor of the row that forced the roll: the mode's own where the
 * mode is the affliction, else its linked affliction's (a stun baton's blow
 * with its shock linked). 1 where the item names none.
 */
export function afflictionRowDivisor(item: any, mode: { index?: number; ranged?: boolean } | null | undefined): number {
  const rows: any[] = (mode?.ranged ? item?.system?.rangedModes : item?.system?.meleeModes) ?? [];
  const row = rows[Math.max(0, Math.floor(Number(mode?.index) || 0))];
  const divisor = row?.affliction ? row.armorDivisor : row?.linked?.affliction ? row.linked.armorDivisor : row?.armorDivisor;
  return Number(divisor) > 0 ? Number(divisor) : 1;
}

/**
 * The DR the system's line was worked from: its value times the row's
 * divisor. Exact for a divisor of 1 or less; for a larger divisor the line
 * was rounded down, so this is the least DR that gives it.
 */
export function afflictionDrMet(context: any, rowDivisor: number): number {
  const line = afflictionDrLine(context);
  if (!line) return 0;
  const divisor = Number(rowDivisor) > 0 ? Number(rowDivisor) : 1;
  return Math.max(0, Math.round((Number(line.value) || 0) * divisor));
}
