/**
 * After the firefight (p. 87): everyone who was there is hard of hearing for
 * a while, and at night the muzzle flashes spoil their night vision.
 */

/** -4 to Hearing where all the shooting was outdoors, -5 inside a building or vehicle (p. 87). */
export function hearingPenalty(indoors: boolean): number {
  return indoors ? -5 : -4;
}

/** A further -2 to Vision rolls in the dark, after a firefight at night (p. 87). */
export const NIGHT_VISION_PENALTY = -2;

/** The impairment lasts (20 - HT) minutes, at least one (p. 87). */
export function impairmentMinutes(ht: number): number {
  return Math.max(1, 20 - Math.floor(Number(ht) || 0));
}

/**
 * Then an HT roll every second recovers: the seconds it takes, rolling 3d
 * with `roll3d` until one succeeds (3-4 always do, 17-18 never; Campaigns
 * p. 348). Capped, for an HT no roll can make.
 */
export function recoverySeconds(ht: number, roll3d: () => number, cap = 600): number {
  const target = Math.floor(Number(ht) || 0);
  for (let second = 1; second <= cap; second += 1) {
    const roll = roll3d();
    if (roll <= 4 || (roll <= 16 && roll <= target)) return second;
  }
  return cap;
}

/** What a firefight did to one person, with Protected Hearing and Protected Vision taken into account. */
export interface Aftermath {
  hearing: number;
  vision: number;
  seconds: number;
}

export function aftermathFor(options: { ht: number; indoors: boolean; night: boolean; protectedHearing: boolean; protectedVision: boolean }, roll3d: () => number): Aftermath | null {
  const hearing = options.protectedHearing ? 0 : hearingPenalty(options.indoors);
  const vision = options.night && !options.protectedVision ? NIGHT_VISION_PENALTY : 0;
  if (!hearing && !vision) return null;
  return { hearing, vision, seconds: impairmentMinutes(options.ht) * 60 + recoverySeconds(options.ht, roll3d) };
}
