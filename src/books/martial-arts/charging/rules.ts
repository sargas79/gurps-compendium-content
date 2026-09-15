/**
 * Dealing with charging foes (GURPS Martial Arts p. 106): Obstruction and
 * Holding a Foe at Bay. The pure rules.
 */

/** A parrying weapon strikes with swing damage, unless all it can do is thrust. */
export function strikeBase(bases: readonly string[]): "sw" | "thr" | null {
  if (bases.includes("sw")) return "sw";
  return bases.includes("thr") ? "thr" : null;
}

/**
 * What a stop thrust, parry or obstruction does to a charging foe it didn't
 * knock down (knockdown and knockback are the system's own rolls).
 */
export type BayOutcome =
  /** A thrusting, impaling weapon wounded him: it's inside him. */
  | "impaled"
  /** The weapon is in the way: a Quick Contest of ST, or two movement points to sidestep. */
  | "inTheWay";

export function holdAtBay(options: { injury: number; thrust: boolean; damageType: string }): BayOutcome {
  if (options.injury > 0 && options.thrust && options.damageType === "imp") return "impaled";
  return "inTheWay";
}

/** The Will roll to run yourself through: -3, +3 for High Pain Threshold, -4 for Low. */
export function runThroughModifier(pain: "high" | "low" | null): number {
  return -3 + (pain === "high" ? 3 : pain === "low" ? -4 : 0);
}

/** The most a dice+adds roll can come to. */
export function maximumDamage(dice: { dice: number; adds: number; multiplier?: number }): number {
  return Math.max(0, (Number(dice.dice) || 0) * 6 + (Number(dice.adds) || 0)) * (Number(dice.multiplier) || 1);
}

/** The injury running onto the weapon adds: the blow's maximum injury, less what it already did. */
export function runThroughInjury(options: { maxDamage: number; dr: number; wounding: number; injuryTaken: number }): number {
  const maximum = Math.floor(Math.max(0, options.maxDamage - options.dr) * options.wounding);
  return Math.max(0, maximum - Math.max(0, options.injuryTaken));
}

/** Whether the weapon comes out his back: its maximum damage at his thrust beats the DR there. */
export function passesThrough(maxThrustDamage: number, backDr: number): boolean {
  return maxThrustDamage > backDr;
}
