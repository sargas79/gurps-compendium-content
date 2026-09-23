/**
 * Backblast, for every book that prints it (Ultra-Tech p. 145, High-Tech
 * p. 147), as pure rules: the hot gas, or the countermass, a launcher throws
 * out behind it when it fires, into a 60-degree cone.
 *
 * Each book gives its own figures. Ultra-Tech prints a fixed damage and
 * reach for each class of launcher; High-Tech prints the dice for each
 * weapon, and the reach follows from them: a rocket's or counterblast
 * weapon's burning blast does full damage to two yards a die and half to six
 * a die, a countermass weapon's crushing one reaches two yards a die.
 */

/** The damage a backblast does: burning hot gas, or crushing countermass. */
export type BackblastKind = "burn" | "cr";

/** One launcher's backblast. */
export interface Backblast {
  /** The dice, as a formula: "1d+2", "5dx2". */
  damage: string;
  kind: BackblastKind;
  /** How far behind the launcher it does its full damage, in yards. */
  fullYards: number;
  /** How far it still does half damage, in yards; no further than `fullYards` where it does none. */
  halfYards: number;
}

/** The cone behind the launcher the backblast fills, in degrees across (High-Tech p. 147). */
export const BACKBLAST_CONE_DEGREES = 60;

/** Yards a die: a burning blast's full and half reach, a countermass blast's reach (High-Tech p. 147). */
export const BACKBLAST_REACH = Object.freeze({
  burn: { full: 2, half: 6 },
  cr: { full: 2, half: 2 },
});

/**
 * The dice a formula rolls, counted as the backblast's reach counts them: a
 * multiplier counts its dice that many times ("5dx2" is ten dice), and adds
 * count for nothing. Zero for a formula that isn't dice.
 */
export function backblastDice(formula: string): number {
  const m = /^(\d*)d(?:[+-]\d+)?(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?$/i.exec(String(formula ?? "").replace(/\s+/g, ""));
  if (!m) return 0;
  const dice = m[1] ? Number(m[1]) : 1;
  const times = m[2] ? Number(m[2]) : 1;
  return Math.max(0, Math.floor(dice * times));
}

/** A launcher's backblast from its dice and kind, with the reach the dice give it (High-Tech p. 147). */
export function backblastFromDice(damage: string, kind: BackblastKind): Backblast | null {
  const dice = backblastDice(damage);
  if (!dice) return null;
  const reach = BACKBLAST_REACH[kind];
  return { damage: String(damage).replace(/\s+/g, ""), kind, fullYards: reach.full * dice, halfYards: reach.half * dice };
}

/** A point on the map, in yards. */
export interface Point { x: number; y: number }

/** Where a point stands in a backblast: in its full damage, in its half damage, or out of it. */
export type BackblastZone = "full" | "half" | null;

/**
 * Whether a point is caught by a launcher's backblast. The launcher points
 * from `firer` to `aim`, and the cone opens behind it, the opposite way, 30
 * degrees to either side. The firer's own square is not in it.
 */
export function backblastZone(firer: Point, aim: Point, point: Point, blast: Backblast): BackblastZone {
  const back = { x: firer.x - aim.x, y: firer.y - aim.y };
  const length = Math.hypot(back.x, back.y);
  const to = { x: point.x - firer.x, y: point.y - firer.y };
  const distance = Math.hypot(to.x, to.y);
  if (!length || distance < 0.5) return null;
  const cos = (back.x * to.x + back.y * to.y) / (length * distance);
  if (cos < Math.cos((BACKBLAST_CONE_DEGREES / 2) * (Math.PI / 180)) - 1e-9) return null;
  if (distance <= blast.fullYards) return "full";
  if (distance <= blast.halfYards) return "half";
  return null;
}

/**
 * Firing indoors (High-Tech p. 147). In a small enclosed space the walls
 * throw a burning backblast back at the firer; a countermass weapon's is what
 * makes it safe to fire there. Either way the report is deafening: a firer
 * without hearing protection rolls HT-4 or is stunned.
 */
export const INDOORS_HT_PENALTY = -4;

export function reflectsAtFirer(blast: Backblast): boolean {
  return blast.kind === "burn";
}
