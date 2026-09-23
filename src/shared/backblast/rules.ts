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

/** A point on the map, in scene pixels. */
export interface Point { x: number; y: number }

/** A cone as the system's modifier areas keep it (GWorld API 1.89.0): degrees and scene pixels. */
export interface BackblastCone {
  /** Degrees clockwise from the scene's +x, as Foundry measures a template. */
  direction: number;
  length: number;
  /** Its width at the far end. */
  width: number;
  /** Its width at the apex: a yard. */
  base: number;
}

/**
 * The cone a backblast fills to `yards` behind a launcher pointed from
 * `firer` at `aim`: the opposite way, 30 degrees to either side, so as wide
 * at its end as twice its length times tan 30 degrees. In scene pixels, for
 * the system's cone areas, which start a yard wide at the apex. Null where
 * the launcher points nowhere or the blast reaches no distance.
 */
export function backblastCone(firer: Point, aim: Point, yards: number, pixelsPerYard: number): BackblastCone | null {
  const back = { x: firer.x - aim.x, y: firer.y - aim.y };
  if (!Math.hypot(back.x, back.y) || !(yards > 0) || !(pixelsPerYard > 0)) return null;
  const direction = ((Math.atan2(back.y, back.x) * 180) / Math.PI + 360) % 360;
  const length = yards * pixelsPerYard;
  const width = 2 * length * Math.tan((BACKBLAST_CONE_DEGREES / 2) * (Math.PI / 180));
  return { direction, length, width, base: pixelsPerYard };
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
