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

// ── worrying at a bite (p. 115) ──

/** The parts worrying can only hurt so far, and what it may take off (p. 115). */
export type BittenPart = "nose" | "ear" | "extremityTendon" | "extremity" | "limbTendon" | "other";

/** Which of those parts a bite is at, from the system's location and the module's finer one. */
export function bittenPart(hitLocation: string, addonLocation: string | null | undefined): BittenPart {
  const addon = String(addonLocation ?? "");
  if (/.ma-nose$/.test(addon)) return "nose";
  if (/.ma-ear$/.test(addon)) return "ear";
  if (/.ma-(hand|foot)Joint$/.test(addon)) return "extremityTendon";
  if (/.ma-(arm|leg)Joint$/.test(addon)) return "limbTendon";
  if (["hand", "foot"].includes(hitLocation)) return "extremity";
  return "other";
}

/** The most injury worrying does to a part in one turn (p. 115): HP/4 or HP/3, and no cap elsewhere. */
export function worryCap(part: BittenPart, hp: number): number | null {
  const points = Math.max(1, Number(hp) || 10);
  if (part === "nose" || part === "ear" || part === "extremityTendon") return Math.floor(points / 4);
  if (part === "extremity" || part === "limbTendon") return Math.floor(points / 3);
  return null;
}

/**
 * What worrying takes off (p. 115): a nose or an ear once the injury reaches
 * twice what cripples it, and a finger once it reaches twice what cripples the
 * hand. Nothing larger comes off.
 */
export function bittenOff(part: BittenPart, totalInjury: number, hp: number): "nose" | "ear" | "finger" | null {
  const points = Math.max(1, Number(hp) || 10);
  const total = Math.max(0, Number(totalInjury) || 0);
  if (part === "nose" && total >= 2 * Math.floor(points / 4)) return "nose";
  if (part === "ear" && total >= 2 * Math.floor(points / 4)) return "ear";
  if (part === "extremity" && total >= 2 * Math.floor(points / 3)) return "finger";
  return null;
}

// ── bodies in close combat (pp. 119-120) ──

/** How much a Born Biter's jaw and nose are easier to hit (p. 115): the feature's own bonus. */
export function bornBiterTargeting(levels: number): number {
  return Math.max(0, Math.min(3, Math.floor(Number(levels) || 0)));
}

/** A Horizontal fighter's lines against an upright foe of much the same size (p. 119). */
export function horizontalHit(location: string, smDifference: number): number {
  if (Math.abs(Number(smDifference) || 0) > 1) return 0;
  if (["foot", "leg", "groin"].includes(location)) return 1;
  if (["neck", "face", "eye", "skull"].includes(location)) return -1;
  return 0;
}

/** What Horizontal does to damage per die (p. 119): -1 kicking without claws, +1 with a head butt. */
export function horizontalDamagePerDie(kind: string, claws: boolean): number {
  if (kind === "headButt") return 1;
  if (["kick", "aerialKick"].includes(kind) && !claws) return -1;
  return 0;
}

/** The attacks a Horizontal body cannot make at all (p. 119). */
export const HORIZONTAL_PROHIBITED: readonly string[] = [
  "backbreaker", "elbowDrop", "elbowStrike", "kneeDrop", "kneeStrike", "piledriver", "twoHandedPunch", "uppercut", "flyingTackle",
];

/** Whether Horizontal rules an attack out, by the attack's name (p. 119). */
export function horizontalRefuses(name: string): boolean {
  const n = String(name ?? "").toLowerCase();
  return /backbreaker|elbow drop|elbow strike|knee drop|knee strike|piledriver|two-handed punch|uppercut|flying tackle/.test(n);
}

/** What close combat does to a fighter whose legs are gone (p. 120): -3 crippled, -6 missing, and the foe's +3. */
export function lameCloseCombat(kind: "crippledLegs" | "missingLegs" | "legless" | null, standing: boolean): { rolls: number; foeKnockdown: number } {
  if (!kind || !standing) return { rolls: 0, foeKnockdown: 0 };
  if (kind === "crippledLegs") return { rolls: -3, foeKnockdown: 3 };
  return { rolls: -6, foeKnockdown: 3 };
}

/** The grappling techniques that need fingers, which No Fine Manipulators rules out (p. 120). */
export function needsFingers(name: string): boolean {
  return /strangl|chok(e|ing)|eye-poke|finger lock|lethal strike|pole-vault kick|grab(bing)? weapon/i.test(String(name ?? ""));
}

/** The grappling techniques No Fine Manipulators makes clumsy (p. 120): -4 unless legs or teeth do the work. */
export function clumsyGrappling(name: string): boolean {
  const n = String(name ?? "").toLowerCase();
  if (/scissors hold|leg grapple|leg lock|teeth|bite/.test(n)) return false;
  return /arm lock|backbreaker|choke hold|head lock|piledriver|judo throw|wrist lock|grapple/.test(n);
}

// ── All-Out Grapple and Strike (p. 114) ──

/** Grabbing a second foe in the same turn is a Dual-Weapon Attack (p. 114). */
export const TWOFER_PENALTY = -4;

/** The skills that ram two grappled foes together (p. 114). */
export const RAM_SKILLS: readonly string[] = ["DX", "Brawling", "Sumo Wrestling", "Wrestling"];

/** Ramming two held foes together (p. 114): the only bonus is for two skulls. */
export function ramDamageBonus(locations: readonly string[]): number {
  return locations.length >= 2 && locations.every((location) => location === "skull") ? 1 : 0;
}
