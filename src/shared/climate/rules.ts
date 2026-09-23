/**
 * Climate control, the rule two books print: gear that widens the wearer's
 * comfort zone the way Temperature Tolerance does (Characters p. 93), so the
 * cold (Campaigns p. 430) and the heat (p. 434) start further out. Ultra-Tech
 * gives each suit the range it keeps its wearer comfortable in (pp. 171,
 * 176-185); High-Tech gives the degrees a system adds to either end (p. 74).
 * Both come down to the degrees added to each side, which the system reads as
 * the character's `temperatureTolerance`.
 */

/** Degrees added to the cold and the hot end of the comfort zone. */
export interface ComfortZone {
  coldF: number;
  heatF: number;
}

/** The system's comfort zone edges, in °F: below the one it's cold, above the other it's hot. */
export const COMFORT_ZONE = { coldF: 35, heatF: 80 } as const;

/** Degrees a climate control range adds to each side of the comfort zone. */
export function climateTolerance(climate: readonly [number, number]): ComfortZone {
  return { coldF: Math.max(0, COMFORT_ZONE.coldF - climate[0]), heatF: Math.max(0, climate[1] - COMFORT_ZONE.heatF) };
}

/** Where a character's trait effects and the sources beside them are, as `gworld.traitEffects` hands them over. */
export interface TraitEffectsContext {
  effects: { temperatureTolerance?: { coldF?: number; heatF?: number } } & Record<string, any>;
  sources: Array<{ effect: string; label: string; value?: number }>;
}

/**
 * Widens a character's comfort zone to what a piece of gear gives, where it
 * gives more than they already have: several pieces don't add up, the best
 * one on each side counts.
 */
export function widenComfortZone(context: TraitEffectsContext, zone: ComfortZone, label: string): void {
  const tolerance = context.effects.temperatureTolerance;
  if (!tolerance) return;
  if (zone.coldF > (Number(tolerance.coldF) || 0)) {
    tolerance.coldF = zone.coldF;
    context.sources.push({ effect: "temperatureTolerance.coldF", label, value: zone.coldF });
  }
  if (zone.heatF > (Number(tolerance.heatF) || 0)) {
    tolerance.heatF = zone.heatF;
    context.sources.push({ effect: "temperatureTolerance.heatF", label, value: zone.heatF });
  }
}
