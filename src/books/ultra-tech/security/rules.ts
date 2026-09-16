/**
 * Ultra-Tech's security, restraint and interrogation gear: barriers as damage
 * and rolls, doors, safes and vaults by TL, restraints and breaking free,
 * power dampers, neuronic restraints and the neural pacifier, sensory
 * restraints, lie detection, neural programming and mind probes
 * (pp. 101-111).
 */

/** What a barrier does to someone who crosses it (pp. 101-104). */
export interface Barrier {
  /** A roll that avoids it: an open fence's Acrobatics-3 or Escape-3, cutting wire's DX-5 a yard. */
  avoid?: { skills: readonly string[]; attribute?: "DX"; modifier: number };
  damage?: { formula: string; type: "burn" | "cut" | "cor"; divisor: number; radiation?: boolean; surge?: boolean; ignoresDr?: boolean; multiplier?: number };
  /** An affliction resisted by HT or Will. */
  affliction?: { attribute: "HT" | "Will"; modifier: number; effect: string; divisor?: number };
  /** Only an open fence can be avoided; a tight one can't. */
  fence?: boolean;
  /** Who it can't affect. */
  sealedImmune?: boolean;
}

export const BARRIERS: Readonly<Record<string, Barrier>> = Object.freeze({
  laserFence: { fence: true, avoid: { skills: ["Acrobatics", "Escape"], modifier: -3 }, damage: { formula: "6d", type: "burn", divisor: 2 } },
  electrolaserFence: { fence: true, avoid: { skills: ["Acrobatics", "Escape"], modifier: -3 }, affliction: { attribute: "HT", modifier: -6, effect: "stun", divisor: 2 }, damage: { formula: "1d-3", type: "burn", divisor: 1 } },
  rainbowLaserFence: { fence: true, avoid: { skills: ["Acrobatics", "Escape"], modifier: -3 }, damage: { formula: "6d", type: "burn", divisor: 3 } },
  xrayLaserFence: { fence: true, avoid: { skills: ["Acrobatics", "Escape"], modifier: -3 }, damage: { formula: "6d", type: "burn", divisor: 5, radiation: true, surge: true } },
  graserFence: { fence: true, avoid: { skills: ["Acrobatics", "Escape"], modifier: -3 }, damage: { formula: "6d", type: "burn", divisor: 10, radiation: true, surge: true } },
  cuttingWire: { avoid: { skills: [], attribute: "DX", modifier: -5 }, damage: { formula: "1d-1", type: "cut", divisor: 1 } },
  fragwire: { damage: { formula: "1d-1", type: "cut", divisor: 1 } },
  monowire: { damage: { formula: "2d", type: "cut", divisor: 10 } },
  sonicBarrier: { affliction: { attribute: "HT", modifier: -6, effect: "nauseated" } },
  neuralDisruptorField: { affliction: { attribute: "HT", modifier: -1, effect: "neural" } },
  dreamNet: { affliction: { attribute: "Will", modifier: -4, effect: "paralysis" }, sealedImmune: true },
  disintegratorField: { damage: { formula: "8d", type: "cor", divisor: 1, ignoresDr: true, multiplier: 10 } },
});

/** A monowire strand's damage by how fast someone walks into it (p. 103). */
export function monowireDice(speed: "slow" | "walking" | "running"): string {
  return speed === "slow" ? "1d" : speed === "running" ? "3d" : "2d";
}

/** Monowire is hard to see: Vision or Traps at -4, -1 when looking for it (p. 103). */
export function monowireSpotting(looking: boolean): number {
  return looking ? -1 : -4;
}

/** A neural disruptor field is resisted at HT-1, +1 per 2 DR of sealed armour (p. 103). */
export function neuralFieldModifier(sealedDr: number): number {
  return -1 + Math.floor(Math.max(0, sealedDr) / 2);
}

/** Pulled out of a dream net without shutting it off: a Will roll, stunned seconds by margin, 1d hours out on a critical failure (p. 103). */
export function dreamNetRemoval(result: { success: boolean; criticalFailure: boolean; margin: number }): { stunnedSeconds: number; unconsciousDice: string | null } {
  if (result.criticalFailure) return { stunnedSeconds: 0, unconsciousDice: "1d6" };
  return { stunnedSeconds: result.success ? 0 : result.margin, unconsciousDice: null };
}

/** An open fence costs its price per post, a tight one twice (pp. 101-102). */
export function fenceCost(perPost: number, posts: number, tight: boolean): number {
  return perPost * Math.max(0, posts) * (tight ? 2 : 1);
}

/** An inch of armoured door: HP 50 and DR 100, 150, 200 or 300 by TL (p. 101). */
export function doorDr(tl: number): number {
  if (tl >= 12) return 300;
  if (tl >= 11) return 200;
  if (tl >= 10) return 150;
  return 100;
}

/** Safes' DR is 1.5 times at TL10, twice at TL11, three times at TL12; HP stays (p. 102). */
export function safeDr(base: number, tl: number): number {
  const factor = tl >= 12 ? 3 : tl >= 11 ? 2 : tl >= 10 ? 1.5 : 1;
  return Math.round(base * factor);
}

export const SAFES: Readonly<Record<string, { dr: number; hp: number }>> = Object.freeze({
  "Wall Safe": { dr: 100, hp: 25 },
  "Small Safe": { dr: 300, hp: 80 },
  "Armored Vault": { dr: 400, hp: 100 },
});

/** A complex electronic lock is -4 to pick; a simple one no modifier (p. 102). */
export const LOCKS: Readonly<Record<string, number>> = Object.freeze({ "Simple Lock": 0, "Complex Lock": -4 });

/** The restraints the book prints (pp. 107-108). */
export type Restraint = "cufftape" | "razortape" | "monowireRazortape" | "cuffs" | "heavyCuffs";

export function restraintByName(name: string): Restraint | null {
  const text = String(name ?? "").trim().toLowerCase();
  if (text === "cufftape") return "cufftape";
  if (text === "monowire razortape") return "monowireRazortape";
  if (text === "razortape") return "razortape";
  if (text === "heavy-duty electronic cuffs") return "heavyCuffs";
  if (text === "electronic cuffs") return "cuffs";
  return null;
}

/** A restraint's ST and DR: tape is ST 20, DR 1; cuffs ST 20 and DR 10, heavy ST 40 and DR 15, +5 each per TL after TL9 (p. 107). */
export function restraintFigures(kind: Restraint, tl: number): { st: number; dr: number } {
  if (kind === "cuffs" || kind === "heavyCuffs") {
    const extra = 5 * Math.max(0, tl - 9);
    return kind === "heavyCuffs" ? { st: 40 + extra, dr: 15 + extra } : { st: 20 + extra, dr: 10 + extra };
  }
  return { st: 20, dr: 1 };
}

/** Escaping cuffs by skill: Escape at -6, -8 with arms and legs both cuffed (p. 107). */
export function cuffEscapeModifier(armsAndLegs: boolean): number {
  return armsAndLegs ? -8 : -6;
}

/** The first try at cuffs takes a second, the rest 10 minutes each (p. 107). */
export function struggleSeconds(attempt: number): number {
  return attempt <= 1 ? 1 : 600;
}

/** Six points of cutting, corrosion or burning damage sever cufftape (p. 107). */
export const CUFFTAPE_SEVERED = 6;

/** Each failure to escape cufftape does a point of damage to the taped area (p. 107). */
export const CUFFTAPE_FAILURE_DAMAGE = 1;

/** Breaking razortape by brute force cuts the escapee with their own thrust; monowire adds 1d and (10) (p. 107). */
export function razortapeDamage(kind: Restraint, thrust: string): { formula: string; divisor: number } {
  if (kind === "monowireRazortape") return { formula: addDie(thrust), divisor: 10 };
  return { formula: thrust, divisor: 1 };
}

/** "1d-1" plus a die is "2d-1". */
export function addDie(formula: string): string {
  const match = /^(\d+)d([+-]\d+)?$/.exec(String(formula).trim());
  if (!match) return `${formula}+1d`;
  return `${Number(match[1]) + 1}d${match[2] ?? ""}`;
}

/** A power damper's Will: 18 for a band, 20 for a field, +2 per TL after TL9 (p. 108). */
export function damperWill(field: boolean, tl: number): number {
  return (field ? 20 : 18) + 2 * Math.max(0, tl - 9);
}

/** Neuronic restraints are resisted at HT-5, -1 more in a sensory deprivation tank (p. 108). */
export function neuronicModifier(inTank: boolean): number {
  return inTank ? -6 : -5;
}

/** A neural pacifier is resisted every second against the higher of HT-3 and Will-3 (p. 108). */
export function pacifierTarget(ht: number, will: number): number {
  return Math.max(ht, will) - 3;
}

/** Sensory restraints' bonus to Interrogation against the wearer; the tank's rises to +3 after an hour (p. 108). */
export function sensoryRestraintBonus(name: string, hoursInTank = 0): number {
  const text = String(name ?? "").toLowerCase();
  if (text === "smart blindfold") return 1;
  if (text === "restraint mask") return 2;
  if (text === "sensory deprivation tank") return hoursInTank >= 1 ? 3 : 2;
  return 0;
}

/** A neural veridicator gives +TL/2 to Detect Lies, and is an automatic success (p. 107). */
export function veridicatorBonus(tl: number): number {
  return Math.floor(tl / 2);
}

/** Verifier software has Detect Lies-12 of its own (p. 107). */
export const VERIFIER_SKILL = 12;

/**
 * Neural programming (p. 110): a Regular Contest of Brainwashing against Will,
 * -1 per 5 points (or fraction) of the disadvantage, with the software's
 * quality: Complexity 7 basic, 9 good (+1), 11 fine (+2).
 */
export function neuralProgrammingModifier(disadvantagePoints: number): number {
  return -Math.ceil(Math.abs(disadvantagePoints) / 5);
}

export function neuralProgrammerQuality(complexity: number): number {
  if (complexity >= 11) return 2;
  if (complexity >= 9) return 1;
  return 0;
}

/** A mind probe's hours an attempt: 8 slow, 1 fast, halved at TL11 and again at TL12 (p. 110). */
export function mindProbeHours(fast: boolean, tl: number): number {
  const base = fast ? 1 : 8;
  return base / (tl >= 12 ? 4 : tl >= 11 ? 2 : 1);
}

/** What a mind probe's roll retrieves (p. 110). */
export function mindProbeResult(result: { success: boolean; criticalSuccess: boolean; criticalFailure: boolean }): "exact" | "mixed" | "fragments" | "falseMemories" {
  if (result.criticalSuccess) return "exact";
  if (result.success) return "mixed";
  if (result.criticalFailure) return "falseMemories";
  return "fragments";
}

/** A fast probe's risk: a roll against the lower of the subject's HT and the operator's skill (p. 110). */
export function fastProbeTarget(ht: number, operatorSkill: number): number {
  return Math.min(ht, operatorSkill);
}

/** An MT interceptor rolls against an unmanned system's TL (p. 104). */
export function interceptorOpponent(operatorSkill: number | null, systemTl: number): number {
  return operatorSkill ?? systemTl;
}

/** Remote-controlled weapons: "Roll vs. Traps-9 to spot them first" (p. 101). */
export const REMOTE_WEAPON_SPOT = -9;

/** A multispectral bug sweeper scans on its own at TL+5 (p. 105). */
export function sweeperSkill(tl: number): number {
  return tl + 5;
}

/** The Size and Speed/Range Table's rows from 3 up (Campaigns p. 550): the distance and its penalty. */
const SPEED_RANGE_ROWS: ReadonlyArray<[number, number]> = [
  [3, -1], [5, -2], [7, -3], [10, -4], [15, -5], [20, -6], [30, -7], [50, -8], [70, -9], [100, -10],
  [150, -11], [200, -12], [300, -13], [500, -14], [700, -15], [1000, -16],
];

/**
 * A sensory deprivation tank's Fright Checks (p. 108): the Size and Speed/Range
 * Table read in hours, a roll "every time an interval passes at the listed
 * penalty". The penalties for the intervals passed after `fromHours` up to
 * `toHours`.
 */
export function tankFrightChecks(fromHours: number, toHours: number): number[] {
  return SPEED_RANGE_ROWS.filter(([hours]) => hours > fromHours && hours <= toHours).map(([, penalty]) => penalty);
}
