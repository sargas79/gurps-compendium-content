/**
 * Using artillery (pp. 139-141): indirect fire directed by a forward
 * observer, and predicted fire on an area picked out on a map.
 *
 * Fire at a target the gunner can't see is blind: -10 to skill and no Acc.
 * A forward observer (FO) who can talk to the gun works out where he and the
 * gun are (a Navigation roll), then finds the target (a Forward Observer
 * roll); that roll's margin moves the first shot's -10. Each correction after
 * a shot is another Forward Observer roll whose margin is added on, never past
 * 0. Predicted fire skips the FO: the gunner attacks an area of ground
 * (Campaigns p. 414) with no -10, and can't follow a target that moves.
 */

/** Blind fire: the gunner's penalty before the FO whittles it down (p. 139). */
export const INDIRECT_FIRE_PENALTY = -10;

/** What the FO has to find his way with (p. 139): a compass is +1, GPS +3. */
export type NavigationAid = "none" | "compass" | "gps";
export const NAVIGATION_AID_BONUS: Readonly<Record<NavigationAid, number>> = Object.freeze({ none: 0, compass: 1, gps: 3 });

/** Navigating with no map at all is -10 (p. 139). */
export const NO_MAP_PENALTY = -10;

/** The Navigation roll's modifiers (p. 139), each with the key of its label. */
export function navigationModifiers(options: { aid: NavigationAid; map: boolean }): Array<{ key: string; value: number }> {
  const lines: Array<{ key: string; value: number }> = [];
  const aid = NAVIGATION_AID_BONUS[options.aid] ?? 0;
  if (aid) lines.push({ key: options.aid, value: aid });
  if (!options.map) lines.push({ key: "noMap", value: NO_MAP_PENALTY });
  return lines;
}

/**
 * The distance the FO's range penalty is taken at (p. 139): the yards to the
 * target over his vision aid's magnification, and halved again by a
 * rangefinder when the target is within its reach.
 */
export function observationYards(options: { yards: number; magnification?: number; rangefinderYards?: number }): number {
  const yards = Math.max(0, Number(options.yards) || 0);
  const magnification = Math.max(1, Number(options.magnification) || 1);
  const reach = Math.max(0, Number(options.rangefinderYards) || 0);
  const rangefinder = reach > 0 && yards <= reach ? 2 : 1;
  return yards / magnification / rangefinder;
}

/**
 * The FO's own range penalty (p. 139), in place of the Size and Speed/Range
 * Table's: -3 for each 500 yards or part of 500.
 */
export function observationRangePenalty(effectiveYards: number): number {
  const yards = Math.max(0, Number(effectiveYards) || 0);
  return yards > 0 ? -3 * Math.ceil(yards / 500) : 0;
}

/** A roll's margin as a signed number: positive for a success, negative for a failure. */
export function signedMargin(outcome: { success: boolean; margin: number }): number {
  const margin = Math.max(0, Math.floor(Number(outcome.margin) || 0));
  return outcome.success ? margin : -margin;
}

/**
 * What the FO has taken off the -10 after a Forward Observer roll (p. 139):
 * the roll's margin added to what he had, success or failure, never more than
 * the whole 10 (he can't give the gunner a bonus). A critical success takes
 * it all off at once.
 */
export function adjustmentAfter(current: number, outcome: { success: boolean; margin: number; criticalSuccess?: boolean }): number {
  const whole = -INDIRECT_FIRE_PENALTY;
  if (outcome.criticalSuccess) return whole;
  return Math.min(whole, (Number(current) || 0) + signedMargin(outcome));
}

/** The gunner's penalty for this shot: -10 less the FO's adjustment, never a bonus (p. 139). */
export function shotPenalty(adjustment: number): number {
  return Math.min(0, INDIRECT_FIRE_PENALTY + (Number(adjustment) || 0));
}

/** Locating the target and calling it in, and each correction, take 2d+5 seconds (p. 139). */
export const SPOTTING_TIME = "2d6+5";

/** Low-angle missions (flat, fast) and high-angle missions (lobbed over obstacles) (p. 139). */
export type Trajectory = "low" | "high";

/** Yards a round covers in a second (p. 139): 500 on a low-angle mission, 250 on a high-angle one. */
export const FLIGHT_YARDS_PER_SECOND: Readonly<Record<Trajectory, number>> = Object.freeze({ low: 500, high: 250 });

/**
 * A heavy weapon's time of flight (p. 139): the seconds the round takes to
 * arrive, a part of a second rounding up (6,900 yards on a low-angle mission
 * is 14 seconds). Small arms ignore it.
 */
export function timeOfFlight(yards: number, trajectory: Trajectory): number {
  const distance = Math.max(0, Number(yards) || 0);
  return Math.ceil(distance / FLIGHT_YARDS_PER_SECOND[trajectory === "high" ? "high" : "low"]);
}

/**
 * The usual mission for a gun (p. 139): high-angle for mortars (a weapon with
 * a minimum range lobs its rounds) and for any fire past 3,000 yards,
 * low-angle otherwise. The GM may pick the other.
 */
export function usualTrajectory(options: { minRange: number; yards: number }): Trajectory {
  return (Number(options.minRange) || 0) > 0 || (Number(options.yards) || 0) > 3000 ? "high" : "low";
}

/** Observed fire under a forward observer, or predicted fire on an area off a map (p. 139). */
export type Mission = "observed" | "predicted";

/**
 * A weapon the tool offers indirect fire for (p. 139): artillery, cannon and
 * mortars (Artillery or Gunner skills), machine guns, and any row the records
 * call "Indirect fire".
 */
export function firesIndirectly(mode: { name?: unknown; skill?: unknown }): boolean {
  const skill = String(mode.skill ?? "");
  return /^(artillery|gunner)\b/i.test(skill) || /machine gun/i.test(skill) || /\bindirect\b/i.test(String(mode.name ?? ""));
}
