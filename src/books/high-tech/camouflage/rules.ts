/**
 * High-Tech's camouflage and stealth clothing (pp. 76-77): the patterns by
 * terrain, the dyes and infrared suppression that work against night vision
 * and thermographs, reversible patterns, ghillie suits and their customising,
 * nets, and scent masking. The Camouflage roll itself is the shared engine's
 * (`src/shared/stealth/`); these are the book's figures for it.
 */

import type { ObserverBonuses, TerrainModifiers } from "../../../shared/stealth/rules.js";

/** The patterns the book prints. */
export const PATTERN_KEYS = ["simple", "basic", "advanced", "ghillie"] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

/**
 * Each pattern's TL, its modifier by terrain (a quality bonus, so the best
 * piece worn counts), and what it adds to the clothing's price as a share of
 * it (pp. 76-77):
 *
 * - simple (khaki, olive drab): +1 wherever, at no extra cost;
 * - basic, for a kind of terrain: +2 there, -1 elsewhere, -2 in highly
 *   contrasting terrain, for 100% of the clothing's cost;
 * - advanced, for one very specific terrain: +3 there and -2 almost
 *   everywhere else, for 200%;
 * - a ghillie suit: +3 in similar terrain, and -1 and -2 as for basic
 *   camouflage whatever its quality. It is a suit, priced as one.
 */
export const PATTERNS: Readonly<Record<PatternKey, { tl: number; terrain: TerrainModifiers; clothingCost: number }>> = Object.freeze({
  simple: { tl: 6, terrain: { matching: 1, nonMatching: 1, contrasting: 1 }, clothingCost: 0 },
  basic: { tl: 7, terrain: { matching: 2, nonMatching: -1, contrasting: -2 }, clothingCost: 1 },
  advanced: { tl: 8, terrain: { matching: 3, nonMatching: -2, contrasting: -2 }, clothingCost: 2 },
  ghillie: { tl: 6, terrain: { matching: 3, nonMatching: -1, contrasting: -2 }, clothingCost: 0 },
});

/** From TL7, camouflage clothing's dyes give +1 against technological night vision or infravision (p. 77). */
export const DYES = Object.freeze({ tl: 7, bonus: 1 });

/** Infrared suppression: +2 (quality) against infravision, in place of the dyes' +1 (p. 77). */
export const INFRARED_SUPPRESSION = 2;

/** Building infrared suppression into a ghillie suit: $500, no weight (p. 77). */
export const GHILLIE_INFRARED_COST = 500;

/** Customising a ghillie suit adds the Camouflage roll's margin, to +8 in all (p. 77). */
export const GHILLIE_MOST = 8;

/** Scent masking: -4 to Tracking to follow the wearer by scent; 200% of the clothing's cost (p. 77). */
export const SCENT_MASKING = Object.freeze({ follow: -4, clothingCost: 2 });

export const isPattern = (key: string): key is PatternKey => (PATTERN_KEYS as readonly string[]).includes(key);

/** The pattern showing on a piece: the second one while a reversible piece is turned. */
export function patternShowing(data: { pattern: string; second: string; reversed: boolean }): PatternKey | null {
  const key = data.reversed && data.second ? data.second : data.pattern;
  return isPattern(key) ? key : null;
}

/**
 * A worn pattern's modifier by terrain and what it adds against technological
 * night vision and infravision (pp. 76-77). `tl` is the clothing's, or null
 * where it says none (the pattern's own counts). A customised ghillie suit's
 * bonus in matching terrain goes up by what customising added, to +8.
 */
export function patternFigures(key: PatternKey, options: { tl: number | null; infrared: boolean; custom: number }): { terrain: TerrainModifiers; observers: ObserverBonuses } {
  const figures = PATTERNS[key];
  const tl = options.tl ?? figures.tl;
  const dyes = tl >= DYES.tl ? DYES.bonus : 0;
  const matching = key === "ghillie" ? Math.min(GHILLIE_MOST, figures.terrain.matching + Math.max(0, options.custom)) : figures.terrain.matching;
  return {
    terrain: { ...figures.terrain, matching },
    observers: { nightVision: dyes, infravision: options.infrared ? INFRARED_SUPPRESSION : dyes },
  };
}

/**
 * What the options add to a piece's price (p. 77): each pattern's share of the
 * clothing's cost -- both of a reversible piece's, totalled -- and scent
 * masking's, unless the record's price already includes them; and $500 for
 * infrared suppression in a ghillie suit.
 */
export function camouflagePrice(data: { pattern: string; second: string; scent: boolean; infrared: boolean; builtIn: boolean }): { factor: number; add: number } {
  const share = (key: string) => (isPattern(key) ? PATTERNS[key].clothingCost : 0);
  const factor = data.builtIn ? 1 : 1 + share(data.pattern) + share(data.second) + (data.scent ? SCENT_MASKING.clothingCost : 0);
  const add = data.pattern === "ghillie" && data.infrared ? GHILLIE_INFRARED_COST : 0;
  return { factor, add };
}
