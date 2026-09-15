/**
 * Close combat (GURPS Martial Arts pp. 114, 116-119, 121-122): grappling after
 * All-Out and Committed Attacks, one-handed grappling, the actions after a
 * grapple, sprawling, defending while grappling, and long weapons in close
 * combat. The pure rules.
 */

/** A move that follows a grapple, which All-Out and Committed Attacks leave the victim open to (p. 114). */
export function followsGrapple(move: string): boolean {
  return move === "takedown" || move === "pin";
}

/**
 * What the victim's own maneuver does to his roll against a move that follows a
 * grapple (p. 114): an All-Out Attack loses it outright, a Committed Attack is
 * at -2.
 */
export function victimOpening(maneuver: "allOut" | "committed" | "other"): { loses: boolean; modifier: number } {
  if (maneuver === "allOut") return { loses: true, modifier: 0 };
  if (maneuver === "committed") return { loses: false, modifier: -2 };
  return { loses: false, modifier: 0 };
}

/** All-Out Attack (Determined) on a DX-based grappling roll, or (Strong) on a ST-based one (p. 114). */
export function allOutGrappling(option: string, stBased: boolean): number {
  if (option === "determined" && !stBased) return 4;
  if (option === "strong" && stBased) return 2;
  return 0;
}

/**
 * A one-handed strangle (p. 116): half ST, rounded down, in place of the -5 for
 * one hand.
 */
export function oneHandedStrangle(strength: number): number {
  return Math.floor(Math.max(0, Number(strength) || 0) / 2);
}

/** The -5 the Basic Set gives a one-handed strangle, which half ST replaces (p. 116). */
export const ONE_HAND_STRANGLE = -5;

/** The fighter with more free hands gets +3 to shift a grip (p. 117). */
export function shiftGripBonus(grapplerFree: number, victimFree: number): { grappler: number; victim: number } {
  if (grapplerFree > victimFree) return { grappler: 3, victim: 0 };
  if (victimFree > grapplerFree) return { grappler: 0, victim: 3 };
  return { grappler: 0, victim: 0 };
}

/** Sitting on a pinned foe (p. 117): +3 per point of SM the larger has, +2 per victim arm past two. */
export function sitOnHimModifiers(grapplerSm: number, victimSm: number, victimArms = 2): { grappler: number; victim: number } {
  const diff = (Number(grapplerSm) || 0) - (Number(victimSm) || 0);
  return {
    grappler: diff > 0 ? 3 * diff : 0,
    victim: (diff < 0 ? 3 * -diff : 0) + 2 * Math.max(0, Math.floor(victimArms) - 2),
  };
}

/** A foe sat on breaks free against +5, not +10 (p. 117). */
export const SAT_ON_GRIP = 5;

/** The locks a throw can be made from, and where the throw does its damage (pp. 118-119). */
export function throwLocation(hitLocation: string): string | null {
  switch (hitLocation) {
    case "arm":
    case "hand":
    case "neck":
    case "leg":
      return hitLocation;
    default:
      return null;
  }
}

/** Sprawling against a takedown (p. 119): +3 to the Contest. */
export const SPRAWL_BONUS = 3;

/** What a sprawl comes to (p. 119): the sprawler always falls; a taker who doesn't win falls too and loses the grapple. */
export function sprawlResult(outcome: "first" | "second" | "tie"): { sprawlerFalls: boolean; takerFalls: boolean; grappleLost: boolean } {
  const takerWon = outcome === "first";
  return { sprawlerFalls: true, takerFalls: !takerWon, grappleLost: !takerWon };
}

/** A grappled fighter's defenses (p. 121): -2 to Block and Parry, -1 to Dodge. */
export function grappledDefense(defense: string): number {
  return defense === "dodge" ? -1 : defense === "block" || defense === "parry" ? -2 : 0;
}

/** A weapon's longest reach in yards, and whether it has "C" at all. */
export function reachOf(reach: string): { longest: number; close: boolean } {
  const parts = String(reach ?? "").replace(/\*/g, "").split(/[,-]/).map((p) => p.trim()).filter(Boolean);
  return { longest: Math.max(0, ...parts.map((p) => (p === "C" ? 0 : Number(p))).filter(Number.isFinite)), close: parts.includes("C") };
}

/**
 * A long weapon in close combat (p. 117): -4 to skill per yard of its longest
 * reach, the Parry from that skill (-2 a yard), and -1 swing damage a yard.
 * Nothing for a weapon with "C" in its reach.
 */
export function closeCombatPenalty(reach: string): { skill: number; parry: number; swing: number } {
  const { longest, close } = reachOf(reach);
  if (close || longest < 1) return { skill: 0, parry: 0, swing: 0 };
  return { skill: -4 * longest, parry: -2 * longest, swing: -longest };
}

/** Whether a long weapon only does quarterstaff damage with its haft in close combat (p. 117). */
export function haftOnly(skill: string, reach: string): boolean {
  const { longest } = reachOf(reach);
  return longest >= 2 && longest <= 3 && ["polearm", "spear", "two-handed axe/mace"].includes(skill.trim().toLowerCase());
}
