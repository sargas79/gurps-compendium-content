/**
 * Poisons and drugs as the Basic Set's poison numbers (Campaigns pp. 437-439),
 * written once for every book that prints some. Ultra-Tech's biochemical
 * agents and High-Tech's assassins' poisons are both a table of these; each
 * book keeps its own table and registers it under its own switches.
 */

/** How a poison reaches the victim (Campaigns p. 437). */
export type Delivery = "blood" | "contact" | "digestive" | "followUp" | "respiratory";

/** The poison numbers the system's dose machinery takes (`actors.dosePoison`, `data.registerPoison`). */
export interface PoisonNumbers {
  delivery: Delivery[];
  delaySeconds: number;
  /** The HT modifier to resist, or null where no roll is allowed. */
  resistanceModifier: number | null;
  damage: "toxic" | "fatigue" | "none";
  dice: number;
  adds: number;
  intervalSeconds: number;
  cycles: number;
  reference: string;
}

/** A poison's numbers, with nothing missing: no delay, no roll, no damage, one cycle unless it says. */
export function poisonNumbers(p: Partial<PoisonNumbers> & { reference: string }): PoisonNumbers {
  return { delivery: [], delaySeconds: 0, resistanceModifier: null, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, ...p };
}

/** What about a victim keeps a poison out. */
export interface Exposure {
  sealed: boolean;
  doesntBreathe: boolean;
  filterLungs: boolean;
  metabolicImmunity: boolean;
}

/**
 * Whether a victim is out of a poison's reach by the way it's delivered, and
 * why: no metabolism keeps every one out; a sealed suit keeps out what is
 * breathed or touched; not breathing, or lungs that filter, keep out what is
 * breathed.
 */
export function protectedByDelivery(delivery: readonly Delivery[], victim: Exposure): "sealed" | "breath" | "metabolic" | null {
  if (victim.metabolicImmunity) return "metabolic";
  const respiratory = delivery.includes("respiratory");
  const contact = delivery.includes("contact");
  if ((respiratory || contact) && victim.sealed) return "sealed";
  if (respiratory && (victim.doesntBreathe || victim.filterLungs)) return "breath";
  return null;
}

// ── more than one dose (Campaigns p. 441) ──

/**
 * What doubling a dose costs its resistance roll: -2 per doubling, as for any
 * poison. A dose of a second depressant counts as another dose, so two doses
 * are one doubling and four are two.
 */
export function doublingPenalty(doses: number): number {
  const n = Math.max(1, Math.floor(Number(doses) || 1));
  return -2 * Math.floor(Math.log2(n)) || 0;
}

/** An overdose: a critical failure on the resistance roll for two or more doses of depressants. */
export function overdoses(doses: number, roll: { criticalFailure?: boolean }): boolean {
  return Math.floor(Number(doses) || 1) > 1 && roll.criticalFailure === true;
}

/** An overdose's unconsciousness: hours equal to the margin of failure, an hour at least. */
export function overdoseSeconds(margin: number): number {
  return Math.max(1, Math.floor(Math.abs(Number(margin) || 0))) * 3600;
}

/**
 * The overdose as a poison: the drug's own resistance roll (the hardest of
 * the drugs taken), 1 point of toxic damage every 15 minutes for 24 cycles.
 */
export function overdosePoison(resistanceModifier: number | null, delivery: Delivery[] = []): PoisonNumbers {
  return poisonNumbers({ delivery, resistanceModifier, damage: "toxic", adds: 1, intervalSeconds: 15 * 60, cycles: 24, reference: "Campaigns p. 441" });
}
