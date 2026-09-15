/**
 * All-Out Attack (Long), slams as All-Out Attacks, and Move and Attack with
 * any melee attack (GURPS Martial Arts pp. 97-98, 107): the pure rules.
 */

/** A swing made with All-Out Attack (Long): -2 damage, or -1 per die if that is worse. Thrusts are unchanged. */
export function longDamagePenalty(damageBase: string | null | undefined, dice: number): number {
  return damageBase === "sw" ? -Math.max(2, Math.floor(Number(dice) || 0)) : 0;
}

/** The posture ending an All-Out Attack (Long) in a crouch leaves: a crouch, or kneeling on a failure, or down on a critical failure. */
export function longCrouchPosture(outcome: { success: boolean; criticalFailure: boolean }): "crouching" | "kneeling" | "lying" {
  if (outcome.success) return "crouching";
  return outcome.criticalFailure ? "lying" : "kneeling";
}

/** Which All-Out Attack options a slam at full Move may use: Determined, Feint or Strong, not Long (or Double, which slams at half Move). */
export function slamMayUseFullMove(option: string): boolean {
  return option === "determined" || option === "feint" || option === "strong";
}

/** A melee attack's body part, as Move and Attack's defense limits read it. */
export type StrikingPart = "hand" | "weapon" | "shield" | "other";

/**
 * What an attack struck with, from the weapon (if any) and the attack's
 * name. A kick, bite, head butt, slam or the like strikes with something that
 * isn't a hand.
 */
export function strikingPart(item: { type?: string } | null, label: string): StrikingPart {
  if (item?.type === "shield") return "shield";
  if (item) return "weapon";
  return /\b(kick|stamp|stomp|knee|bite|head ?butt|slam|tackle|tail|trample)/i.test(label) ? "other" : "hand";
}

/**
 * What Move and Attack takes away after the attack roll (p. 107): no retreat,
 * no dodge after attacking with a leg, head or other body part, and no block
 * with a shield that struck. A parry with an arm that struck is the parry
 * weapons' business.
 */
export function moveAndAttackRefusals(part: StrikingPart | null): { dodge: boolean; block: boolean } {
  return { dodge: part === "other", block: part === "shield" };
}

/**
 * A thrusting attack's damage on Move and Attack, where slam damage is
 * better (p. 107): HP x velocity / 100 in dice, from the slam table the
 * caller passes, plus the weapon's own modifier.
 */
export function slamThrust(options: {
  thrust: { dice: number; adds: number };
  slam: { dice: number; modifier: number };
  weaponModifier: number;
}): { dice: number; adds: number } | null {
  const slam = { dice: options.slam.dice, adds: options.slam.modifier + options.weaponModifier };
  const average = (d: { dice: number; adds: number }) => d.dice * 3.5 + d.adds;
  return average(slam) > average(options.thrust) ? slam : null;
}
