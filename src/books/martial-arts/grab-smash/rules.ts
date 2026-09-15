/**
 * Grab and Smash, pain in close combat, teeth, and bodies in close combat
 * (GURPS Martial Arts pp. 114-119). The pure rules.
 */

/**
 * Whether a thrust at `target` strikes the grappled location or a target
 * inside it (p. 118): the groin, spine or vitals inside the torso; the eye,
 * jaw or nose inside the head; an artery or joint inside its limb.
 */
export function insideGrapple(grappled: string, target: { hitLocation: string; addonLocation?: string | null }): boolean {
  const head = ["skull", "face"];
  const addon = String(target.addonLocation ?? "");
  if (target.hitLocation === grappled) return true;
  if (grappled === "torso") return ["groin", "vitals"].includes(target.hitLocation) || /\.ma-spine$/.test(addon);
  if (head.includes(grappled)) return head.includes(target.hitLocation) || target.hitLocation === "eye" || /\.ma-(jaw|nose)$/.test(addon);
  return false;
}

/** Kiss the wall (p. 118): anywhere but the feet on a standing foe, the face or skull on one lying down. */
export function kissTheWallLocations(victimLying: boolean): readonly string[] {
  return victimLying ? ["face", "skull"] : ["torso", "skull", "face", "neck", "arm", "hand", "leg", "vitals", "groin", "eye"];
}

/** Kiss the wall's damage bonus (p. 118): +1 for a hard surface. */
export function kissTheWallBonus(hardSurface: boolean): number {
  return hardSurface ? 1 : 0;
}

/** The pain a lock inflicts instead of the points it would have done (p. 119). */
export function painFor(points: number): "moderatePain" | "severePain" | "terriblePain" | "agony" | null {
  const p = Math.floor(Number(points) || 0);
  if (p >= 10) return "agony";
  if (p >= 6) return "terriblePain";
  if (p >= 4) return "severePain";
  if (p >= 2) return "moderatePain";
  return null;
}

/** The pain conditions, which replace one another rather than adding up (p. 119). */
export const PAINS = ["moderatePain", "severePain", "terriblePain", "agony"] as const;

/** An attack from inside a grapple (p. 119). */
export const GRAPPLED_ATTACK = -4;

/** What a bite may target, by how much the biter's SM exceeds the victim's (p. 115). */
export function biteAllows(smLead: number, target: { hitLocation: string; addonLocation?: string | null }): boolean {
  if (smLead >= 1) return true;
  const addon = String(target.addonLocation ?? "");
  if (["skull", "vitals"].includes(target.hitLocation)) return false;
  return !/\.ma-(spine|armVein|legVein|neckVein)$/.test(addon);
}

/** Whether a biter this much larger engulfs a torso and may pin a standing foe (p. 115). */
export function biteCanPin(smLead: number): boolean {
  return smLead >= 3;
}

/** A bite's damage (p. 115): thrust-1 crushing, and Brawling's +1 per die at DX+2 or better. */
export function biteDamage(thrust: { dice: number; adds: number }, brawlingOverDx: number | null): { dice: number; adds: number } {
  const bonus = brawlingOverDx !== null && brawlingOverDx >= 2 ? thrust.dice : 0;
  return { dice: thrust.dice, adds: thrust.adds - 1 + bonus };
}

/** Extra arms in close combat (p. 114): +2 per arm past two to grapple, hold and break free; +3 to pin with more arms. */
export function extraArmBonus(arms: number): number {
  return 2 * Math.max(0, Math.floor(Number(arms) || 2) - 2);
}

export function morePinArms(arms: number, foeArms: number): number {
  return arms > foeArms ? 3 : 0;
}

/** Extra legs (p. 114): +1 per leg past two against being knocked over. */
export function extraLegBonus(legs: number): number {
  return Math.max(0, Math.floor(Number(legs) || 2) - 2);
}
