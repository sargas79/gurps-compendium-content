/**
 * GURPS High-Tech's clothing against the weather, and its climate-controlled
 * clothing (pp. 63-65, 74), as rules the table reads.
 *
 *   - What an outfit is worth against the cold (p. 63): summer, ordinary and
 *     dress clothes are light clothing, winter clothes are winter clothing,
 *     arctic clothes are arctic clothing -- or, with layers taken off, winter
 *     or light -- as Cold (Campaigns p. 430) grades them.
 *   - Winter and arctic clothes must cover feet, hands, head and neck; each
 *     piece missing is -1 on the roll against the cold (p. 63, taking the
 *     Basic Set's -1 per missing item, Campaigns p. 345).
 *   - Frostbite (p. 63), at the GM's option: a point of injury to each exposed
 *     hit location for each FP lost to the cold.
 *   - A wicking undergarment (p. 64): +1 on rolls against FP loss in the heat.
 *   - Fur winter or arctic clothes may give DR 1 (p. 64, GM's option).
 *   - An outfit's weight by TL (p. 65): the table's multiple of the TL7
 *     weight.
 *   - Climate-controlled clothing (p. 74): degrees added to the comfort zone,
 *     heated clothing counting as winter clothes without power, and a system
 *     that widens the hot end sparing the extra fatigue of hot weather.
 */

import type { ClimateGear } from "../../../shared/climate/index.js";

/** Clothing against the cold, as the system grades it (Campaigns p. 430), worst first. */
export const CLOTHING_CLASSES = ["light", "winter", "arctic", "heatedSuit"] as const;
export type ClothingClass = (typeof CLOTHING_CLASSES)[number];

/** The better of two clothing classes; null counts for nothing. */
export function betterClass(a: ClothingClass | null, b: ClothingClass | null): ClothingClass | null {
  if (!a) return b;
  if (!b) return a;
  return CLOTHING_CLASSES.indexOf(b) > CLOTHING_CLASSES.indexOf(a) ? b : a;
}

/** One of the book's outfits (p. 63). */
export interface Outfit {
  clothing: ClothingClass;
  /** Must cover feet, hands, head and neck to count: winter and arctic clothes. */
  pieces: boolean;
  /** Which row of the Clothing Technology Table weighs it: arctic clothes, or any other (p. 65). */
  weightRow: "arctic" | "other";
}

/** The outfits under Clothing Types, by name (p. 63). */
const OUTFITS: ReadonlyArray<[RegExp, Outfit]> = [
  [/^(summer clothes|ordinary clothes|formal wear|high-fashion attire)$/i, { clothing: "light", pieces: false, weightRow: "other" }],
  [/^winter clothes$/i, { clothing: "winter", pieces: true, weightRow: "other" }],
  [/^arctic clothes$/i, { clothing: "arctic", pieces: true, weightRow: "arctic" }],
];

/** An outfit made on another's pattern, "Undercover Clothing (Ordinary Clothes, +1)": the class of the clothes it is. */
const MADE_AS = /\((summer|ordinary|winter|arctic) clothes\b/i;

/** A name without the TL a table adds to it. */
export function baseName(name: unknown): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

/** One of the book's outfits by name, or null. `weighed` is false for one made on another's pattern, whose weight is its own. */
export function outfitOf(name: unknown): (Outfit & { weighed: boolean }) | null {
  const base = baseName(name);
  const own = OUTFITS.find(([pattern]) => pattern.test(base))?.[1];
  if (own) return { ...own, weighed: true };
  const made = MADE_AS.exec(base)?.[1]?.toLowerCase();
  if (!made) return null;
  const clothing: ClothingClass = made === "winter" ? "winter" : made === "arctic" ? "arctic" : "light";
  return { clothing, pieces: clothing !== "light", weightRow: made === "arctic" ? "arctic" : "other", weighed: false };
}

/** What an arctic outfit is worn as, with layers taken off (p. 63): as it is, or as winter or ordinary clothes. */
export const WORN_AS = ["", "winter", "light"] as const;
export type WornAs = (typeof WORN_AS)[number];

/** An outfit's class as it is worn: arctic clothes with layers off count for less, never more. */
export function wornClass(outfit: Outfit, wornAs: WornAs): ClothingClass {
  if (!wornAs || outfit.clothing !== "arctic") return outfit.clothing;
  return wornAs;
}

/** The pieces a winter or arctic outfit must have: boots, gloves, a warm hat and a scarf (p. 63). */
export const PIECES = ["boots", "gloves", "hat", "scarf"] as const;
export type Piece = (typeof PIECES)[number];

/** Where each missing piece leaves the wearer exposed. */
export const PIECE_LOCATIONS: Readonly<Record<Piece, readonly string[]>> = Object.freeze({
  boots: ["foot"],
  gloves: ["hand"],
  hat: ["skull"],
  scarf: ["neck", "face"],
});

/** Each missing piece's penalty on the roll against the cold (p. 63; Campaigns p. 345). */
export const MISSING_PIECE_PENALTY = -1;

/**
 * What a piece of clothing worn apart from the outfit is, by its name: boots,
 * gloves or mittens, a warm hat, a scarf or balaclava (p. 63's "waterproof
 * boots, gloves, a warm hat, and a scarf"). A hard hat keeps nothing warm.
 */
const PIECE_NAMES: ReadonlyArray<[Piece, RegExp]> = [
  ["boots", /\bboots?\b/i],
  ["gloves", /\b(gloves?|mittens?)$/i],
  ["hat", /^(hat\b|(fur|winter|warm) hat\b|skullcap\b|watch cap\b|beanie\b|balaclava\b)/i],
  ["scarf", /^(scarf\b|balaclava\b|neck gaiter\b)/i],
];

/** The outfit pieces a separately worn item stands in for. */
export function piecesOf(name: unknown): Piece[] {
  const base = baseName(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  return PIECE_NAMES.filter(([, pattern]) => pattern.test(base)).map(([piece]) => piece);
}

/** The pieces still missing once what is worn apart from the outfit fills them. */
export function stillMissing(missing: readonly Piece[], wornApart: readonly Piece[]): Piece[] {
  return missing.filter((piece) => !wornApart.includes(piece));
}

/** The penalty for the pieces missing from a winter or arctic outfit. */
export function missingPiecesPenalty(missing: readonly Piece[]): number {
  const count = new Set(missing).size;
  return count ? MISSING_PIECE_PENALTY * count : 0;
}

/**
 * The hit locations the cold reaches, for frostbite (p. 63): everything a
 * winter outfit must cover, under light clothing; under winter or arctic
 * clothing, what its missing pieces leave bare; nothing inside a heated suit.
 */
export function exposedLocations(clothing: ClothingClass, missing: readonly Piece[]): string[] {
  if (clothing === "heatedSuit") return [];
  const pieces = clothing === "light" ? PIECES : PIECES.filter((p) => missing.includes(p));
  return [...new Set(pieces.flatMap((p) => PIECE_LOCATIONS[p]))];
}

/** Frostbite's injury to each exposed location: a point per FP lost to the cold (p. 63). */
export function frostbiteInjury(fpLost: number): number {
  return Math.max(0, Math.floor(fpLost));
}

/** The locations fur winter or arctic clothes cover, less what the missing pieces leave bare (p. 64). */
export const FUR_DR = 1;
const COVERED = ["skull", "neck", "torso", "vitals", "groin", "arm", "hand", "leg", "foot"] as const;
export function furCovers(location: string, missing: readonly Piece[]): boolean {
  if (!(COVERED as readonly string[]).includes(location)) return false;
  return !missing.some((p) => PIECE_LOCATIONS[p].includes(location));
}

/** A wicking undergarment (p. 64). */
export const WICKING = /^wicking undergarment$/i;
/** Its bonus on HT and HT-based rolls against FP loss in the heat. */
export const WICKING_BONUS = 1;

/**
 * Body armour on a hot day adds to a battle's fatigue (p. 65): the Basic
 * Set's 2 FP for anyone in plate armour or an overcoat (Campaigns p. 426).
 */
export const HOT_BATTLE_ARMOUR_FP = 2;

/** The Clothing Technology Table (p. 65): the TL7 weight's multiple at TL5-8. */
const WEIGHT_BY_TL: Readonly<Record<Outfit["weightRow"], Readonly<Record<number, number>>>> = Object.freeze({
  other: { 5: 2, 6: 2, 7: 1, 8: 0.5 },
  arctic: { 5: 1.5, 6: 1.25, 7: 1, 8: 0.5 },
});

/** An outfit's weight multiple at a TL, or null outside TL5-8, where the table says nothing. */
export function outfitWeightFactor(row: Outfit["weightRow"], tl: number): number | null {
  return WEIGHT_BY_TL[row][Math.floor(tl)] ?? null;
}

// ── climate-controlled clothing (p. 74) ─────────────────────────────────────

/** Heated clothing: counts as winter clothes, and without power that is all it does. */
export const HEATED_CLOTHING = /^heated clothing$/i;

/** A cooling vest (p. 74). */
export const COOLING_SYSTEM = /^cooling system$/i;

/** High-Tech's climate-control gear and the degrees each adds to the comfort zone (p. 74). */
export const HIGH_TECH_CLIMATE_GEAR: readonly ClimateGear[] = Object.freeze([
  { pattern: HEATED_CLOTHING, zone: { coldF: 60, heatF: 0 }, powered: true },
  { pattern: /^climate-control system$/i, zone: { coldF: 60, heatF: 60 }, powered: true },
  // A phase-change or evaporative vest: four hours, then a soak in ice water
  // (its charge is read in `index.ts`, which sets `running` on this entry).
  { pattern: COOLING_SYSTEM, zone: { coldF: 0, heatF: 30 } },
]);

/** A cooling system's charge, and the soak that renews it (p. 74). */
export const COOLING_VEST = { hours: 4, soakMinutes: 15 } as const;

/**
 * When a charge put in now runs out, in world seconds: four hours of cooling,
 * after the quarter hour's soak in ice-cold water where it is being soaked.
 */
export function coolingUntil(now: number, soaked: boolean): number {
  return now + (soaked ? COOLING_VEST.soakMinutes * 60 : 0) + COOLING_VEST.hours * 3600;
}

/**
 * A cooling vest's charge at a moment: `fresh` where none has been put in or
 * run down yet (it comes charged, and starts on its four hours when first
 * worn), `soaking` during the quarter hour in the water, `charged` with the
 * seconds left, or `spent`.
 */
export function coolingCharge(until: number | null, now: number): { state: "fresh" | "soaking" | "charged" | "spent"; seconds: number } {
  if (until === null) return { state: "fresh", seconds: COOLING_VEST.hours * 3600 };
  const left = until - now;
  if (left <= 0) return { state: "spent", seconds: 0 };
  if (left > COOLING_VEST.hours * 3600) return { state: "soaking", seconds: left - COOLING_VEST.hours * 3600 };
  return { state: "charged", seconds: left };
}

/**
 * A march's fatigue in the heat without the hot weather's extra point an
 * hour (Campaigns p. 426), for a hiker whose gear widens the hot end of the
 * comfort zone (p. 74).
 */
export function hikingWithoutHeat(fp: number, hours: number): number {
  return Math.max(0, fp - Math.max(0, Math.floor(hours)));
}
