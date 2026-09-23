/**
 * High-Tech's sustained fire (pp. 85-86, 129): a gun fired hard heats up, its
 * Acc and Malf. falling past a safe number of rounds, a machine gun's safe
 * number set by how it is fired, water jackets soaking up the heat until the
 * water boils away, and barrels changed hot. The counting itself is the
 * shared heat engine's (`src/shared/heat/`), with this book's timings.
 */

import type { HeatTable } from "../../../shared/heat/rules.js";
import type { Barrel } from "../records.js";

/**
 * The count is of rounds fired "in under a minute": a minute without a shot
 * starts it again while the gun is within its safe number, and a quarter of
 * an hour's cooling brings an overheated gun back to normal (p. 86).
 */
export const GUN_HEAT: HeatTable = Object.freeze({ pauseSeconds: 60, coolSeconds: 15 * 60 });

/** How a machine gun is fired, which sets its safe number (p. 86). */
export const FIRE_DISCIPLINES = ["sustained", "rapid", "assault"] as const;
export type FireDiscipline = (typeof FIRE_DISCIPLINES)[number];

/**
 * A machine gun's or autocannon's safe rounds: bursts short of its RoF with
 * 4-5 second pauses, 800; with 2-3 second pauses, 400; long bursts or no
 * pauses, 200 (p. 86).
 */
export const MG_SAFE_SHOTS: Readonly<Record<FireDiscipline, number>> = Object.freeze({ sustained: 800, rapid: 400, assault: 200 });

/**
 * How much heat a round fired each way is worth, counted in rounds of
 * sustained fire: a round of assault fire uses up four times the margin a
 * round of sustained fire does. A gun fired now one way, now another, adds
 * its heat up on one count.
 */
export function heatWeight(discipline: FireDiscipline): number {
  return MG_SAFE_SHOTS.sustained / MG_SAFE_SHOTS[discipline];
}

/**
 * How a machine gun was fired this time, where the gunner hasn't said: a
 * burst of its full RoF or more is a long burst; a shorter one after a pause
 * of 4 seconds or more is sustained fire, after 2-3 seconds rapid fire, and
 * with none assault fire. The first burst counts as paused.
 */
export function workedOutDiscipline(shots: number, rateOfFire: number, pauseSeconds: number | null): FireDiscipline {
  if (rateOfFire > 1 && shots >= rateOfFire) return "assault";
  if (pauseSeconds === null || pauseSeconds >= 4) return "sustained";
  if (pauseSeconds >= 2) return "rapid";
  return "assault";
}

/** What sets a gun's safe number of rounds. */
export interface SafeFacts {
  /** A machine gun or autocannon, or a gun the book says to treat as one. */
  machineGun: boolean;
  /** The table's Malf.: null for a gun that won't malfunction ("very reliable"). */
  malfunction: number | null;
  /** High-Tech's reliable quality steps: 1 fine, 2 very fine (p. 79). */
  reliable: number;
  techLevel: number;
  barrel: Barrel;
  /** Well-maintained, with its feed device (p. 80). */
  maintained: boolean;
}

/**
 * The safe rounds before a pistol, rifle, SMG or shotgun heats up: 100; 50
 * for one the table calls unreliable (Malf. 16 or less); 150 for a fine
 * (reliable) gun or one the table calls very reliable; 200 for a very fine
 * (reliable) one (p. 85).
 */
export function smallArmsSafeShots(malfunction: number | null, reliable: number): number {
  if (reliable >= 2) return 200;
  if (reliable === 1 || malfunction === null) return 150;
  if (malfunction <= 16) return 50;
  return 100;
}

/** ×0.75 at TL6, ×1.5 at TL8 (pp. 85-86). */
export function techLevelFactor(tl: number): number {
  if (tl === 6) return 0.75;
  if (tl === 8) return 1.5;
  return 1;
}

/** ×0.5 for a light barrel, ×1.5 for an extra-heavy one (p. 86). */
export function barrelFactor(barrel: Barrel): number {
  if (barrel === "light") return 0.5;
  if (barrel === "extraHeavy") return 1.5;
  return 1;
}

/** ×1.25 for a well-maintained gun and feed device (pp. 85-86). */
export const MAINTAINED_FACTOR = 1.25;

/**
 * The gun's safe number of rounds: for a machine gun, its sustained-fire
 * figure (other ways of firing weigh more against it, `heatWeight`); for
 * other guns, the one number. The M60 of p. 86 is 800 × 1.25 = 1,000.
 */
export function safeShots(facts: SafeFacts): number {
  const base = facts.machineGun ? MG_SAFE_SHOTS.sustained : smallArmsSafeShots(facts.malfunction, facts.reliable);
  const barrel = facts.machineGun ? barrelFactor(facts.barrel) : 1;
  return Math.floor(base * barrel * techLevelFactor(facts.techLevel) * (facts.maintained ? MAINTAINED_FACTOR : 1));
}

/** The Acc and Malf. heat takes off, and whether the Acc lost stays lost. */
export interface HeatPenalty {
  accuracy: number;
  malfunction: number;
  /** Three times the safe number: the Acc lost is permanent (p. 86). */
  warped: boolean;
}

/**
 * Past the safe number, -1 Acc and Malf.; at three times it, a machine gun
 * loses 2 of each, and any gun's Acc loss becomes permanent (pp. 85-86).
 */
export function heatPenalty(shots: number, limit: number, machineGun: boolean): HeatPenalty {
  if (limit <= 0 || shots <= limit) return { accuracy: 0, malfunction: 0, warped: false };
  if (shots >= 3 * limit) {
    const lost = machineGun ? 2 : 1;
    return { accuracy: lost, malfunction: lost, warped: true };
  }
  return { accuracy: 1, malfunction: 1, warped: false };
}

/**
 * Rounds a pint of the jacket's water cools: 500, or ten times that with a
 * condenser canister (p. 129).
 */
export function roundsPerPint(condenser: boolean): number {
  return condenser ? 5000 : 500;
}

/** The rounds the water left in the jacket will still cool. */
export function waterRoundsLeft(pints: number, roundsUsed: number, condenser: boolean): number {
  return Math.max(0, Math.floor(pints * roundsPerPint(condenser)) - Math.max(0, roundsUsed));
}

/** A hot barrel changes in 10 seconds, with a Guns or Gunner roll (p. 129), unless the gun's own is faster. */
export const BARREL_CHANGE_SECONDS = 10;

/** A critical failure changing a hot barrel burns the hand: 1d minutes of moderate pain (p. 129). */
export function burnMinutes(die: number): number {
  return Math.max(1, Math.min(6, Math.floor(die)));
}
