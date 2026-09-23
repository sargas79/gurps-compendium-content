/**
 * Severe bleeding, for every book that prints it (Martial Arts p. 138,
 * High-Tech p. 162): some wounds bleed faster or harder than the Basic Set's
 * roll a minute (Campaigns p. 420), and some need Surgery to stop. Which
 * wounds, and how badly, is each book's table; what follows from them is
 * the same in both. The pure rules.
 */

/** A wound bleeding faster or harder than the Basic Set's, and whether bandages can stop it. */
export interface SevereWound {
  intervalSeconds: number;
  modifier: number;
  surgery: boolean;
}

/** Several severe wounds bleed at the fastest rate and the worst penalty. */
export function worstBleeding(wounds: readonly SevereWound[]): SevereWound | null {
  if (!wounds.length) return null;
  return {
    intervalSeconds: Math.min(...wounds.map((w) => w.intervalSeconds)),
    modifier: Math.min(...wounds.map((w) => w.modifier)),
    surgery: wounds.some((w) => w.surgery),
  };
}
