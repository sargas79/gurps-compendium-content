/**
 * Ultra-Tech's vehicle systems and matter transmission: crashwebs, life
 * support, slidewalks, flight packs and zero-G thrusters, life pods' and drop
 * capsules' landings, stealth capsules; MT booths and their ranges, telegates,
 * minigates, teleport projectors, beacons and MT interceptors (pp. 104,
 * 222-235).
 */

/** A crashweb is ablative DR equal to TL for a seated occupant in a crash; DX-2 each turn to get free (p. 224). */
export function crashwebDr(tl: number): number {
  return Math.max(0, Math.floor(tl));
}
export const CRASHWEB_ESCAPE = -2;

/** Limited life support: man-days shared among the occupants (p. 224). */
export function lifeSupportDays(manDays: number, occupants: number): number {
  return occupants > 0 ? manDays / occupants : 0;
}

/**
 * Running on a slidewalk (p. 222): DX+3 each turn, -1 per 10 mph running with
 * the belt or -3 per 10 mph against it; the speed is the belt's plus or minus
 * 2 mph per point of Move.
 */
export function slidewalkModifier(beltMph: number, against: boolean): number {
  const tens = Math.floor(Math.max(0, beltMph) / 10);
  return 3 - (against ? 3 : 1) * tens;
}
export function slidewalkSpeed(beltMph: number, move: number, against: boolean): number {
  return against ? beltMph - 2 * move : beltMph + 2 * move;
}

/** A zero-G thruster burst changes speed a yard a second; a hand thruster's cylinder holds 30, a pack 100 seconds (p. 231). */
export const THRUSTERS: Readonly<Record<string, { bursts: number; skills: readonly string[] }>> = Object.freeze({
  "Hand Thruster": { bursts: 30, skills: ["Free Fall", "Vacc Suit"] },
  "Thruster Pack": { bursts: 100, skills: ["Free Fall"] },
});

/** Strapping on: a flight pack four seconds; a thruster pack 10 seconds and a Vacc Suit roll, retried every 5 (p. 231). */
export const STRAP_ON = Object.freeze({ flightPack: 4, thrusterPack: 10, retry: 5 });

/** A nuclear jetpack's plasma wash: 2d burn with radiation behind and below within two yards; +3 to spot the user (p. 231). */
export const NUCLEAR_JETPACK = Object.freeze({ wash: "2d", spotted: 3 });

/**
 * A life pod's or drop capsule's landing (p. 232): Navigation (Space)-12
 * unless the user programs it. A critical success lands within a mile; a
 * success within 5d x 100 miles less 200 per point of margin (at least a
 * mile); a failure anywhere on the planet; a critical failure a disaster.
 */
export function landingRadius(result: { success: boolean; criticalSuccess: boolean; criticalFailure: boolean; margin: number }, rolled5d: number): { miles: number | null; outcome: "pinpoint" | "near" | "anywhere" | "disaster" } {
  if (result.criticalSuccess) return { miles: 1, outcome: "pinpoint" };
  if (result.success) return { miles: Math.max(1, rolled5d * 100 - 200 * result.margin), outcome: "near" };
  if (result.criticalFailure) return { miles: null, outcome: "disaster" };
  return { miles: null, outcome: "anywhere" };
}
export const CAPSULE_NAVIGATION = 12;

/** A stealth capsule: -5 to be struck by homing missiles, and -5 to the sensor operator's roll to keep contact (p. 232). */
export const STEALTH_CAPSULE = -5;

/** MT booth ranges: 20 miles, and 10, 100, 1,000 or 10,000 times the cost and weight for longer ones (p. 233). */
export const BOOTH_RANGES: Readonly<Record<string, number>> = Object.freeze({ standard: 1, continental: 10, planetary: 100, interplanetary: 1000, interstellar: 10000 });
export const BOOTH_RANGE_MILES = 20;

/** Telegates: network gates cost what booths do, times the radius in yards past doorway size; paired gates half (p. 234). */
export function telegateFactor(options: { radiusYards: number; paired: boolean }): number {
  return Math.max(1, options.radiusYards) * (options.paired ? 0.5 : 1);
}

/** A minigate is a shield of Defense Bonus 4; a blow its DB stopped goes through the gate (p. 234). */
export const MINIGATE_DB = 4;

/** Whether a defense succeeded only because of the minigate's DB, or was a block with it. */
export function throughTheGate(result: { success: boolean; margin: number }, blocked: boolean): boolean {
  if (!result.success) return false;
  return blocked || result.margin < MINIGATE_DB;
}

/**
 * A teleport projector's roll (p. 235): Electronics Operation (Matter
 * Transmitters) at -1 per 1,000 miles, +4 between cooperating projectors; up
 * to 10,000 miles. Null beyond the range.
 */
export function projectorModifier(miles: number, cooperating: boolean): number | null {
  if (miles > 10000) return null;
  return -Math.floor(Math.max(0, miles) / 1000) + (cooperating ? 4 : 0);
}

/** A send-only projector is half the weight and cost; each platform past the first $5 million and 1,000 lbs. (p. 235). */
export function projectorPrice(platforms: number, sendOnly: boolean): { cost: number; weight: number } {
  const extra = Math.max(0, platforms - 1);
  const cost = 15_000_000 + 5_000_000 * extra;
  const weight = 3000 + 1000 * extra;
  return sendOnly ? { cost: cost / 2, weight: weight / 2 } : { cost, weight };
}

/** An interstellar projector's jump: $100,000 for a yard, and ten times per doubling of the platform's radius (p. 235). */
export function interstellarJumpCost(radiusYards: number): number {
  const doublings = Math.max(0, Math.log2(Math.max(1, radiusYards)));
  return 100000 * 10 ** doublings;
}

/** An MT interceptor rolls against an unmanned system's TL (p. 104). */
export function interceptorOpponent(operatorSkill: number | null, systemTl: number): number {
  return operatorSkill ?? systemTl;
}

/**
 * What a crashweb's ablative DR stops of a blow in a crash (p. 224): the
 * damage left, and the DR left after it.
 */
export function crashwebAbsorb(damage: number, drLeft: number): { damage: number; drLeft: number } {
  const dr = Math.max(0, Math.floor(Number(drLeft) || 0));
  const hit = Math.max(0, Math.floor(Number(damage) || 0));
  const stopped = Math.min(dr, hit);
  return { damage: hit - stopped, drLeft: dr - stopped };
}

/** Disabling a civilian vehicle's crashweb: Electronics Repair (Security), a minute an attempt (p. 224). */
export const CRASHWEB_DISABLE = Object.freeze({ skill: "Electronics Repair (Security)", minutes: 1 });

/** A helipack: 200 miles' range, two yards' clearance each side, no use in trace atmosphere or vacuum (p. 230). */
export const HELIPACK = Object.freeze({ miles: 200, clearance: 2 });

/** A spare cylinder: three seconds for a hand thruster, five for a thruster pack (p. 231). */
export const CYLINDER_CHANGE: Readonly<Record<string, number>> = Object.freeze({ "Hand Thruster": 3, "Thruster Pack": 5 });

/** The nuclear jetpack's wash reaches two yards below and behind (p. 231). */
export const JETPACK_WASH_YARDS = 2;
