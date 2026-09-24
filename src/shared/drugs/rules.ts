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
