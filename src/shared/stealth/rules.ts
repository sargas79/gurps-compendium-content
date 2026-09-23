/**
 * Camouflage: the rule the books print alike, whatever their gear.
 *
 * Spotting someone hidden is a Quick Contest of the observer's Vision or
 * Observation against the hider's Camouflage (Characters p. 183). A pattern
 * helps where the terrain matches it and hurts where it doesn't: Ultra-Tech's
 * programmable camouflage (p. 99) and High-Tech's patterns and ghillie suits
 * (pp. 76-77) grade it the same three ways -- matching terrain, terrain that
 * doesn't match, and highly contrasting terrain. Each book's figures are its
 * own, in its table.
 */

/** How the terrain around a hider compares with their camouflage. */
export const TERRAINS = ["matching", "nonMatching", "contrasting"] as const;
export type Terrain = (typeof TERRAINS)[number];

/** A pattern's modifier in each kind of terrain. */
export type TerrainModifiers = Readonly<Record<Terrain, number>>;

/** A pattern's modifier in a terrain. */
export function terrainModifier(pattern: TerrainModifiers, terrain: Terrain): number {
  return pattern[terrain] ?? 0;
}

/**
 * How the one looking sees: with the naked eye, or relying on technological
 * night vision or infravision, which some camouflage is built against
 * (High-Tech pp. 76-77).
 */
export const OBSERVERS = ["vision", "nightVision", "infravision"] as const;
export type Observer = (typeof OBSERVERS)[number];

/** What a piece of camouflage gives against each observer, on top of its pattern. */
export type ObserverBonuses = Readonly<Partial<Record<Exclude<Observer, "vision">, number>>>;

/** A piece of camouflage's worth: its pattern in the terrain, plus what it adds against the observer. */
export function camouflageValue(pattern: TerrainModifiers, terrain: Terrain, observer: Observer, bonuses: ObserverBonuses = {}): number {
  const extra = observer === "vision" ? 0 : (bonuses[observer] ?? 0);
  return terrainModifier(pattern, terrain) + extra;
}

/**
 * The observer an actor's technological senses make them: the one the
 * camouflage does worst against, where their gear gives both.
 */
export function observerOf(senses: { nightVision?: boolean; infravision?: boolean }, worth: (observer: Observer) => number): Observer {
  const seen: Observer[] = [];
  if (senses.nightVision) seen.push("nightVision");
  if (senses.infravision) seen.push("infravision");
  if (!seen.length) return "vision";
  return seen.reduce((worst, next) => (worth(next) < worth(worst) ? next : worst));
}
