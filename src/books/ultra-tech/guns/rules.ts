/**
 * GURPS Ultra-Tech's guns, launchers and grenades (pp. 134-147), as pure
 * rules: ETC and liquid-propellant slugthrowers and their velocity settings,
 * non-metallic air guns, gyrocs at short range, missile backblast and
 * reactionless drives, homing projectiles, smart and saucer grenades, limpet
 * mines, and bouncing a vortex ring.
 */

import type { Backblast } from "../../../shared/backblast/rules.js";

/** A conventional chemical-propellant slugthrower, by its ammunition designation: "7mmCL", "10mmCLP", "18.5mmPC", "40mmPLB" (p. 135). */
export function isConventional(name: string): boolean {
  return /\d(?:\.\d+)?mm(?:CL[PR]?|PC|PLB)\b/i.test(String(name ?? ""));
}

/** A gas-powered air gun, which may be made non-metallic (pp. 139-140). */
export function isAirGun(name: string): boolean {
  return /\b(needler|needle rifle|paint (pistol|carbine)|tangler|ice gun)\b/i.test(String(name ?? "")) && !/gauss|grav|partisan/i.test(String(name ?? ""));
}

/** An electromagnetic gun, whose velocity can be varied as a liquid-propellant gun's (p. 141). */
export function isElectromagnetic(name: string): boolean {
  return /\b(gauss|railgun|emgl|electromag)\b/i.test(String(name ?? "")) && !/\bgrav/i.test(String(name ?? ""));
}

export function isGyroc(name: string): boolean {
  return /\bgyroc\b/i.test(String(name ?? ""));
}

interface Dice { dice: number; adds: number }

function parse(formula: string): Dice | null {
  const m = /^(\d*)d([+-]\d+)?$/i.exec(String(formula ?? "").replace(/\s+/g, ""));
  if (!m) return null;
  return { dice: m[1] ? Number(m[1]) : 1, adds: m[2] ? Number(m[2]) : 0 };
}

function format(d: Dice): string {
  return `${d.dice}d${d.adds > 0 ? `+${d.adds}` : d.adds < 0 ? `${d.adds}` : ""}`;
}

/** Damage multiplied by a factor, by its average: 3d x1.5 is 4d+2. */
export function multiplyDamage(formula: string, factor: number): string {
  const d = parse(formula);
  if (!d || factor === 1) return formula;
  const total = (d.dice * 3.5 + d.adds) * factor;
  const dice = Math.max(1, Math.floor(total / 3.5));
  return format({ dice, adds: Math.round(total - dice * 3.5) });
}

export const PIERCING: readonly string[] = ["pi-", "pi", "pi+", "pi++"];

/** ETC: 1.5 times the piercing damage and range, twice the cost, and a cell for 10 magazines (p. 139). */
export const ETC = Object.freeze({ damage: 1.5, range: 1.5, cost: 2, magazinesPerCell: 10 });

/** The cell an ETC gun's grip or stock holds: A for pistols, B for SMGs, PDWs, shotguns and rifles, C for heavy weapons (p. 139). */
export function etcCell(skill: string): "A" | "B" | "C" {
  const s = String(skill ?? "").toLowerCase();
  if (/\(pistol\)/.test(s)) return "A";
  if (/\((smg|rifle|shotgun)\)/.test(s)) return "B";
  return "C";
}

/** Liquid propellant: 1.5 times the shots a magazine holds and the cost; a bottle fires three magazines, five seconds to change (p. 139). */
export const LIQUID = Object.freeze({ shots: 1.5, cost: 1.5, magazinesPerBottle: 3, bottleReload: 5 });

export type Velocity = "standard" | "boosted" | "low";
export const VELOCITIES: readonly Velocity[] = ["standard", "boosted", "low"];

/**
 * A velocity setting (pp. 139, 141): boosted is +1 piercing damage a die and
 * 1.3 times the range, 1.5 shots from the bottle; low halves damage and range,
 * -3 to hear it, a quarter shot.
 */
export function velocityEffect(velocity: Velocity): { perDie: number; damageFactor: number; rangeFactor: number; hearing: number; propellant: number } {
  if (velocity === "boosted") return { perDie: 1, damageFactor: 1, rangeFactor: 1.3, hearing: 0, propellant: 1.5 };
  if (velocity === "low") return { perDie: 0, damageFactor: 0.5, rangeFactor: 0.5, hearing: -3, propellant: 0.25 };
  return { perDie: 0, damageFactor: 1, rangeFactor: 1, hearing: 0, propellant: 1 };
}

/** Non-metallic air guns: 1.5 times the cost, past metal detectors unloaded (p. 140). */
export const NON_METALLIC = 1.5;

/** A gyroc's piercing damage at short range: divided by 3 at 1-2 yards, by 2 at 3-10 (p. 144). */
export function gyrocDivisor(yards: number | null): number {
  if (yards === null) return 1;
  if (yards <= 2) return 3;
  if (yards <= 10) return 2;
  return 1;
}

export type Launcher = "iml" | "mlaws" | "tml";

export function launcherByName(name: string): Launcher | null {
  const text = String(name ?? "");
  if (/^IML\b/i.test(text)) return "iml";
  if (/^MLAWS\b/i.test(text)) return "mlaws";
  if (/^TML\b/i.test(text)) return "tml";
  return null;
}

/** Backblast: 2d burning in a 2-yard cone behind an IML or MLAWS, 4d in 3 yards behind a TML (p. 145). */
export const BACKBLASTS: Readonly<Record<Launcher, Backblast>> = Object.freeze({
  iml: { damage: "2d", kind: "burn", fullYards: 2, halfYards: 2 },
  mlaws: { damage: "2d", kind: "burn", fullYards: 2, halfYards: 2 },
  tml: { damage: "4d", kind: "burn", fullYards: 3, halfYards: 3 },
});

export function backblast(launcher: Launcher): { damage: string; yards: number } {
  const blast = BACKBLASTS[launcher];
  return { damage: blast.damage, yards: blast.fullYards };
}

/** Reactionless missiles: no backblast, five times the Max range, twice the missile's cost (p. 145). */
export const REACTIONLESS = Object.freeze({ maxRange: 5, missileCost: 2, tl: 11 });

export type Homing = "infrared" | "multispectral" | "multiscanner";
export const HOMING_KINDS: readonly Homing[] = ["infrared", "multispectral", "multiscanner"];
export type MultispectralSetting = "passive" | "antiRadiation" | "active";

const HOMING = Object.freeze({
  infrared: { tl: 9, skill: 13, cost: 4, smallest: { 9: 15, 10: 10, 11: 7, 12: 0 } as Record<number, number> },
  multispectral: { tl: 9, skill: 14, cost: 10, smallest: { 9: 40, 10: 25, 11: 15, 12: 10 } as Record<number, number> },
  multiscanner: { tl: 11, skill: 12, cost: 10, smallest: { 11: 15, 12: 10 } as Record<number, number> },
});

/** Why a homing system can't go in a projectile, or null (p. 146). */
export function homingRefusal(kind: Homing, calibreMm: number | null, tl: number): "tl" | "tooSmall" | null {
  const h = HOMING[kind];
  if (tl < h.tl) return "tl";
  const smallest = h.smallest[Math.min(12, Math.floor(tl))];
  if (smallest === undefined) return "tl";
  if (smallest > 0 && (calibreMm === null || calibreMm < smallest)) return "tooSmall";
  return null;
}

/** A homing projectile's skill: +1 per TL after its introduction (p. 146). */
export function homingSkill(kind: Homing, tl: number): number {
  const h = HOMING[kind];
  return h.skill + Math.max(0, Math.floor(tl) - h.tl);
}

/** A homing projectile costs 4 (infrared) or 10 times the base projectile (p. 146). */
export function homingCost(kind: Homing): number {
  return HOMING[kind].cost;
}

/** The sense a homing projectile attacks with (p. 146). */
export function homingSense(kind: Homing, setting: MultispectralSetting = "passive"): string {
  if (kind === "infrared") return "infravision";
  if (kind === "multiscanner") return "paraRadar";
  return setting === "antiRadiation" ? "radarAndRadio" : setting === "active" ? "imagingRadar" : "hyperspectral";
}

/** Grenade sizes and their warheads (p. 146). */
export const GRENADES = Object.freeze({
  hand: { warheadMm: 64, cost: 40, weight: 1 },
  mini: { warheadMm: 40, cost: 10, weight: 0.25 },
  thimble: { warheadMm: 25, cost: 2.5, weight: 0.06 },
});

/** A grenade goes off two seconds after it's released; pulling the pin takes a second (p. 146). */
export const GRENADE_DELAY = 2;

export type Fusing = "timer" | "delay" | "command" | "impact" | "antiTamper";
export const FUSINGS: readonly Fusing[] = ["timer", "delay", "command", "impact", "antiTamper"];

/** A smart grenade: +$100 at TL9, free from TL10; three Readies to program; delays up to two weeks (p. 147). */
export function smartGrenadeCost(tl: number): number {
  return tl >= 10 ? 0 : 100;
}
export const SMART_GRENADE = Object.freeze({ readies: 3, longestDelaySeconds: 14 * 24 * 3600 });

/** A saucer grenade bounced around a corner: -3 (p. 147). */
export const SAUCER_BOUNCE = -3;

/** A limpet mine pulled off without its code: ST-5 a second, 1 HP from flesh (p. 147). */
export const LIMPET_MINE = Object.freeze({ st: -5, fleshDamage: 1 });

/** A vortex ring bounced: -2 to hit and -10% range a bounce (p. 134). */
export function vortexBounce(bounces: number, range: number): { penalty: number; range: number } {
  const n = Math.max(0, Math.floor(bounces));
  return { penalty: n ? -2 * n : 0, range: Math.max(0, Math.round(range * (1 - 0.1 * n))) };
}

/** A spray can fills a one-yard radius with up to three doses; the cloud lasts 10 seconds indoors (p. 134). */
export const SPRAY_CAN = Object.freeze({ doses: 3, radius: 1, indoorSeconds: 10 });

/** The skill a homing projectile's firer aims with before it attacks at its own (p. 146). */
export const HOMING_AIMING_SKILL = "Artillery (Guided Missile)";

/** The roll tags a seeker's sense gives its attack: what an area or condition naming that sense reads. */
export function seekerTags(sense: string): string[] {
  if (sense === "infravision") return ["infrared"];
  if (sense === "hyperspectral") return ["hyperspectral"];
  if (sense === "imagingRadar") return ["radar", "imagingRadar"];
  if (sense === "radarAndRadio" || sense === "paraRadar") return ["radar"];
  return [];
}
