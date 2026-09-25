/**
 * High-Tech's liquid projectors and laser dazzlers (pp. 178-181), as pure
 * rules: flamethrowers, spray guns and aerosols, and lasers aimed at the eyes.
 * `index.ts` registers them with the system.
 */

import { CRITICAL_MARGIN, type DazzleTable, type EyeBeam } from "../../../shared/dazzle/rules.js";
import { marginOfFailure } from "../../../shared/margin.js";

// ── flamethrowers (pp. 178-179) ─────────────────────────────────────────────

/** A flamethrower is fired with Liquid Projector (Flamethrower). */
export const FLAMETHROWER_SKILL = /^liquid projector \(flamethrowers?\)/i;
/** A spray canister's skill (p. 180). */
export const SPRAYER_SKILL = /^liquid projector \(sprayer\)/i;
/** A squirt gun's skill (p. 180). */
export const SQUIRT_GUN_SKILL = /^liquid projector \(squirt guns?\)/i;

/** The burning fuel: 1d burn a second (p. 178). */
export const BURN_PER_SECOND = { dice: 1, adds: 0 } as const;
/** It burns for 2d x 5 seconds, 1d x 5 past 1/2D (p. 178). */
export const BURN_SECONDS_PER_DIE = 5;

/** The dice the fuel's burning time is rolled with: two, one past 1/2D. */
export function burnDice(beyondHalfDamage: boolean): number {
  return beyondHalfDamage ? 1 : 2;
}

/**
 * The seconds the fuel burns on a victim, from the dice rolled: 5 a die,
 * divided by a sweep's width, rounding down (p. 178).
 */
export function burnSeconds(dice: readonly number[], width = 1): number {
  const total = dice.reduce((sum, die) => sum + (Number(die) || 0), 0) * BURN_SECONDS_PER_DIE;
  return Math.floor(total / sweepWidth(width));
}

/**
 * DR against the flame: unsealed DR protects at a fifth, rounding down;
 * sealed armour keeps it out entirely, so it counts in full (p. 178).
 */
export function flameDr(dr: number, sealed: boolean): number {
  const whole = Math.max(0, Math.floor(Number(dr) || 0));
  return sealed ? whole : Math.floor(whole / 5);
}

/** The widest area a flamethrower can be played over as an All-Out Attack (p. 178). */
export const MAX_SWEEP_WIDTH = 3;

/** A sweep's width in yards, from 1 (no sweep) to 3. */
export function sweepWidth(value: unknown): number {
  const n = Math.floor(Number(value) || 1);
  return Math.min(MAX_SWEEP_WIDTH, Math.max(1, n));
}

/** "Divide damage and burn duration by the width of the area (round down)" (p. 178). */
export function sweptDamage(basicDamage: number, width: number): number {
  return Math.floor((Number(basicDamage) || 0) / sweepWidth(width));
}

/** Unthickened fuel halves a TL7+ flamethrower's Range (p. 178); TL6 fuel was never thickened. */
export function unthickenedRange(range: number, tl: number): number {
  const r = Number(range) || 0;
  return tl >= 7 ? Math.floor(r / 2) : r;
}

/** What went wrong, from the 3d rolled on a malfunction (p. 179). */
export type FlameMalfunction = "noIgnition" | "noFuel" | "explosion";

/** The flamethrower Malfunction Table (p. 179): 3-5 no ignition, 6-17 no fuel, 18 an explosion. */
export function flameMalfunction(roll: number): FlameMalfunction {
  const r = Math.floor(Number(roll) || 0);
  if (r >= 18) return "explosion";
  if (r <= 5) return "noIgnition";
  return "noFuel";
}

/** Each attempt to put it right takes 10 seconds (p. 179). */
export const CLEARING_SECONDS = 10;
/** An explosion strikes everything within two yards of the firer (p. 179). */
export const EXPLOSION_YARDS = 2;
/** The flamethrower's own DR, against a shot at the weapon (p. 179). */
export const TANK_DR = 2;
/** A shot at a backpack flamethrower is at -4 while its carrier faces the shooter (p. 179). */
export const BACKPACK_FACING_PENALTY = -4;

/** Penetrating damage to the tank: 1d, a 1 blows it up; anything else just disables it (p. 179). */
export function tankStruck(d6: number): "explodes" | "disabled" {
  return Math.floor(Number(d6) || 0) === 1 ? "explodes" : "disabled";
}

/** A vehicle's engine under burning fuel is rolled for again every 3 seconds (p. 179). */
export const ENGINE_CHECK_EVERY = 3;

/**
 * Whether a vehicle has an air-breathing engine for burning fuel to choke
 * (p. 179): one that burns fuel, which its HT code marks flammable,
 * combustible or explosive (Characters p. 462). Electric and muscle-powered
 * vehicles, and anything with no ST, don't.
 */
export function airBreathing(vehicle: { stHp?: unknown; fragility?: unknown } | null | undefined): boolean {
  if (!vehicle || !(Number(vehicle.stHp) > 0)) return false;
  return /[fcx]/i.test(String(vehicle.fragility ?? ""));
}

/**
 * The engine's HT rolls while the fuel burns (p. 179): at once and every 3
 * seconds after, until one fails -- it breaks down -- or the fuel burns out.
 * A 3d roll of 3-4 always succeeds and 17-18 always fails.
 */
export function engineUnderFire(ht: number, seconds: number, rolls: readonly number[]): { brokenDown: boolean; checks: Array<{ second: number; roll: number; success: boolean }> } {
  const checks: Array<{ second: number; roll: number; success: boolean }> = [];
  const target = Math.floor(Number(ht) || 0);
  for (let second = 0, i = 0; second < Math.max(1, seconds) && i < rolls.length; second += ENGINE_CHECK_EVERY, i += 1) {
    const roll = Math.floor(Number(rolls[i]) || 0);
    const success = roll <= 4 || (roll <= 16 && roll <= target);
    checks.push({ second, roll, success });
    if (!success) return { brokenDown: true, checks };
  }
  return { brokenDown: false, checks };
}

/** How many rolls a fire of `seconds` may call for. */
export const engineRollsFor = (seconds: number): number => Math.max(1, Math.ceil(Math.max(1, seconds) / ENGINE_CHECK_EVERY));

// ── spray guns and aerosols (p. 180) ────────────────────────────────────────

/** The wide jet: +2 to hit the face, as blowpipe powders get (p. 180; Characters p. 180). */
export const WIDE_JET_BONUS = 2;
/** The locations a spray must hit to work (p. 180). */
export const SPRAY_TARGETS: readonly string[] = ["face", "eye"];

/** Tear gas's effects last minutes equal to the margin; pepper spray's until washed off (p. 180). */
export type SprayAgent = "tearGas" | "pepper";

export function sprayAgent(name: string): SprayAgent {
  return /\bpepper\b/i.test(String(name ?? "")) ? "pepper" : "tearGas";
}

/** Seconds the coughing and blindness last, or null for "until the solution is washed off" (p. 180). */
export function sprayEffectSeconds(agent: SprayAgent, margin: number): number | null {
  if (agent === "pepper") return null;
  return Math.max(1, marginOfFailure(margin)) * 60;
}

// ── laser dazzlers (p. 181) ─────────────────────────────────────────────────

/** High-Tech's table for the shared engine: a blinding laser cripples the eyes (p. 181). */
export const HT_DAZZLE: DazzleTable = { book: "high-tech", blinding: "crippling", forGoodFrom: CRITICAL_MARGIN };

/** Which of the book's lasers does what, by name (p. 181). */
const HT_LASERS: ReadonlyArray<{ pattern: RegExp; beam: EyeBeam }> = [
  { pattern: /\bqxj04\b|\blaser dazzler\b|\bdazzler\b/i, beam: "dazzle" },
  { pattern: /\bzm87\b|\bblinding laser\b/i, beam: "blinding" },
];

/** What a High-Tech laser weapon does to the eyes, or null for one that isn't one. */
export function eyeBeamOf(name: string): EyeBeam | null {
  return HT_LASERS.find((l) => l.pattern.test(String(name ?? "")))?.beam ?? null;
}

/** Anti-laser goggles give Protected Vision and Nictitating Membrane 4 (p. 71). */
export const ANTI_LASER_GOGGLES = { pattern: /^anti-laser goggles\b/i, nictitatingMembrane: 4 } as const;
