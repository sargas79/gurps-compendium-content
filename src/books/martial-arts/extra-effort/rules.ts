/**
 * Extra effort in combat (GURPS Martial Arts p. 131): the pure rule for Flurry
 * of Blows on a Rapid Strike. The other options and the limit of one offensive
 * and one defensive option a turn are the Basic Set's now (Revised, p. 571).
 */

/**
 * Flurry of Blows on a Rapid Strike (p. 131): the penalty halved, dropping
 * fractions -- a Weapon Master's four attacks go from -9 to -4.
 */
export function flurryPenalty(rapidStrikePenalty: number): number {
  return Math.trunc(rapidStrikePenalty / 2);
}

