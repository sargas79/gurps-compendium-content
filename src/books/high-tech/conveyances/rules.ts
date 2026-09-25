/**
 * High-Tech's personal conveyances, as pure rules (pp. 226, 230-231). What
 * the system meets them through is in `index.ts`.
 *
 *   - **Bicycles (p. 230):** ridden with Bicycling, which defaults to DX-4 or
 *     Driving (Motorcycle)-4. A rider's speed starts from the better of his
 *     relative skill level and his Basic Move, which the bike's Enhanced Move
 *     then multiplies (x1.5 for most, x2 for the racing bike), rounded down.
 *     Downhill that Move doubles on a 7.5° slope, triples on a 15° one and
 *     quadruples on a 30° one. Long rides call for HT-based rolls under the
 *     running rules; towing, the bike is a two-wheeled cart. The
 *     penny-farthing is -1 to skill, and any spill from it is at least a
 *     two-yard fall. The TL6 safety bicycle weighs x0.8 at TL7 and x0.5 at
 *     TL8. Paying 5 or 20 times the price buys +1 or +2 to skill, as for any
 *     gear.
 *   - **Skateboards (p. 230):** Sports (Skateboard), defaulting to DX-5,
 *     Sports (Snowboard)-2 or Sports (Surfing)-2; the same downhill
 *     multipliers.
 *   - **Surfboards (p. 231):** Sports (Surfing); the best waves carry a
 *     surfer at Move 12-15, and paddling is seldom faster than Move 1.
 *   - **Wheelchairs (p. 226):** the electric and the advanced wheelchair move
 *     at Move 3; the advanced one climbs stairs at a step a second.
 *
 * Road-Bound Enhanced Move works on roads only, as the advantage's
 * limitation says (Characters p. 52).
 */

/** What a record is to these rules. */
export const CONVEYANCE_KINDS = ["", "bicycle", "skateboard", "surfboard", "wheelchair"] as const;
export type ConveyanceKind = (typeof CONVEYANCE_KINDS)[number];

/** The skill each kind is ridden with (pp. 230-231). */
export const CONVEYANCE_SKILL: Record<Exclude<ConveyanceKind, "">, string | null> = {
  bicycle: "Bicycling",
  skateboard: "Sports (Skateboard)",
  surfboard: "Sports (Surfing)",
  wheelchair: null,
};

/** One default of a skill: an attribute's or another skill's level, plus the modifier. */
export type SkillDefault = { attribute: "DX"; modifier: number } | { skill: string; modifier: number };

/**
 * The defaults of the skills the conveyances are ridden with: Bicycling's
 * are the Basic Set's (Characters p. 180), Sports' the Basic Set's DX-5
 * (p. 222), and the skateboard's the ones p. 230 adds.
 */
export const CONVEYANCE_SKILL_DEFAULTS: Record<string, SkillDefault[]> = {
  Bicycling: [{ attribute: "DX", modifier: -4 }, { skill: "Driving (Motorcycle)", modifier: -4 }],
  "Sports (Skateboard)": [{ attribute: "DX", modifier: -5 }, { skill: "Sports (Snowboard)", modifier: -2 }, { skill: "Sports (Surfing)", modifier: -2 }],
  "Sports (Surfing)": [{ attribute: "DX", modifier: -5 }],
};

/**
 * A skill's level relative to DX at default, for a rider who hasn't learned
 * it: the best of its defaults, each skill default read off the rider's own
 * level in that skill (`levelOf`, null where he doesn't have it).
 */
export function defaultRelativeLevel(skill: string, dx: number, levelOf: (name: string) => number | null): number | null {
  let best: number | null = null;
  for (const d of CONVEYANCE_SKILL_DEFAULTS[skill] ?? []) {
    let relative: number | null = null;
    if ("attribute" in d) relative = d.modifier;
    else {
      const level = levelOf(d.skill);
      if (typeof level === "number") relative = level + d.modifier - dx;
    }
    if (relative !== null && (best === null || relative > best)) best = relative;
  }
  return best;
}

/** The penny-farthing's penalty to Bicycling (p. 230). */
export const PENNY_FARTHING_PENALTY = -1;

/** The shortest fall a spill from a penny-farthing is, in yards (p. 230). */
export const PENNY_FARTHING_SPILL_YARDS = 2;

/** The downhill slopes the book names, in degrees, and what each multiplies Move by (p. 230). */
export const DOWNHILL = Object.freeze([
  { degrees: 0, multiplier: 1 },
  { degrees: 7.5, multiplier: 2 },
  { degrees: 15, multiplier: 3 },
  { degrees: 30, multiplier: 4 },
]);

/** The multiplier for a slope in degrees: the steepest of the book's slopes it reaches. */
export function downhillMultiplier(degrees: number): number {
  let multiplier = 1;
  for (const step of DOWNHILL) if (degrees >= step.degrees) multiplier = step.multiplier;
  return multiplier;
}

/** What a rider's Move comes to on a conveyance, and the steps of it. */
export interface RidingMove {
  /** The Move the ride starts from: the better of relative skill and Move. */
  base: number;
  /** Whether that is the relative skill rather than Move. */
  fromSkill: boolean;
  /** The Enhanced Move multiplier that applied (1 where none did). */
  enhanced: number;
  /** Move on level ground: base times Enhanced Move, rounded down. */
  level: number;
  /** The downhill multiplier. */
  downhill: number;
  /** Move at last. */
  move: number;
}

/**
 * A rider's Move (p. 230), worked as the book's example does: the better of
 * relative skill (bicycles only, `relative` null otherwise) and Move, times
 * the Enhanced Move multiplier (1 + its level), rounded down, then times the
 * downhill multiplier. Road-Bound Enhanced Move counts only on a road.
 *
 * `move` is the system's, already halved (rounding up) for each of reeling
 * and very tired (Campaigns pp. 419, 426); `halvings` counts them, and
 * relative skill is halved as often, so a rider below 1/3 FP on a long ride
 * slows as a runner does (p. 230; Campaigns p. 354).
 */
export function ridingMove(input: { move: number; relative: number | null; enhancedMove: number; roadBound: boolean; offRoad: boolean; slope: number; halvings?: number }): RidingMove {
  const move = Math.max(0, Math.floor(input.move));
  let relative = input.relative === null ? null : Math.floor(input.relative);
  for (let i = 0; relative !== null && i < Math.max(0, Math.floor(input.halvings ?? 0)); i += 1) relative = Math.ceil(relative / 2);
  const fromSkill = relative !== null && relative > move;
  const base = fromSkill ? (relative as number) : move;
  const enhanced = input.roadBound && input.offRoad ? 1 : 1 + Math.max(0, input.enhancedMove);
  const level = Math.floor(base * enhanced + 1e-9);
  const downhill = downhillMultiplier(input.slope);
  return { base, fromSkill, enhanced, level, downhill, move: level * downhill };
}

/** The powered wheelchairs' Move (p. 226). */
export const WHEELCHAIR_MOVE = 3;

/** Surfing (p. 231): the best waves' Move, and paddling's. */
export const SURFING = Object.freeze({ bestWaves: { least: 12, most: 15 }, paddling: 1 });

/**
 * The safety bicycle's weight at a later TL (p. 230): x0.8 at TL7, x0.5 at
 * TL8, from its TL6 figure.
 */
export function bicycleWeightFactor(tl: number, factors: { tl7?: number; tl8?: number }): number {
  if (tl >= 8 && factors.tl8) return factors.tl8;
  if (tl >= 7 && factors.tl7) return factors.tl7;
  return 1;
}

/**
 * Towing (p. 230): the bike counts as a two-wheeled cart, whose load and own
 * weight pull at a tenth of their weight, a twentieth on a smooth, level
 * surface (Campaigns p. 353).
 */
export const TOWING = Object.freeze({ divisor: 10, smoothDivisor: 20 });

/**
 * A long ride (p. 230) under the running rules (Campaigns p. 354): a roll
 * every 15 seconds of sprinting or minute of paced riding, against the better
 * of HT and the HT-based riding skill, 1 FP lost on a failure.
 */
export function longRideTarget(ht: number, relative: number | null): number {
  return relative === null ? ht : Math.max(ht, ht + relative);
}
