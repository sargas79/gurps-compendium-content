/**
 * A world that took Committed Attack or Defensive Attack under this module's
 * maneuvers (before the Basic Set carried them, system 1.67.0) has fighters
 * still on those. They move to the system's maneuvers of the same name, with
 * their choices, so nothing is left on a maneuver that no longer exists.
 * Idempotent: it changes only what still holds the old keys.
 */

import { MODULE_ID } from "../../../shared/module.js";

/** The maneuvers this module used to register, and the system's that replace them. */
const MANEUVERS: Readonly<Record<string, "committedAttack" | "defensiveAttack">> = {
  [`${MODULE_ID}.ma-committed-attack`]: "committedAttack",
  [`${MODULE_ID}.ma-defensive-attack`]: "defensiveAttack",
};

/** The old choices, and the system's option each became (the system's own module id is `gworld`). */
const OPTIONS: Readonly<Record<string, string>> = {
  "ma-committed-mode": "committedKind",
  "ma-committed-steps": "committedStep",
  "ma-defensive-benefit": "defensiveBenefit",
};

/** The system's maneuver for a stored one, or null where it isn't one this module registered. */
export function movedManeuver(key: unknown): "committedAttack" | "defensiveAttack" | null {
  return MANEUVERS[String(key ?? "")] ?? null;
}

/** The system's stored choices for this module's, from the module's own: a second step was a count, and is now a tick. */
export function movedOptions(old: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const moved: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(OPTIONS)) {
    const value = old?.[from];
    if (value === undefined || value === null || value === "") continue;
    moved[to] = from === "ma-committed-steps" ? Number(value) >= 2 : value;
  }
  return moved;
}

/** Moves every world actor still on the old maneuvers, from the GM's client. Resolves to how many it moved. */
export async function migrateManeuvers(): Promise<number> {
  if (!game.user?.isGM) return 0;
  let moved = 0;
  for (const actor of (game.actors ?? []) as any[]) {
    // A stored value the data model no longer accepts may already read as its initial one, so read the source.
    const stored = actor?._source?.system?.maneuver ?? actor?.system?.maneuver;
    const to = movedManeuver(stored);
    if (!to) continue;
    try {
      const options = actor.getFlag?.("gworld", "maneuverOptions") ?? {};
      const carried = movedOptions(options[MODULE_ID]);
      const update: Record<string, unknown> = { "system.maneuver": to };
      if (Object.keys(carried).length) update["flags.gworld.maneuverOptions.gworld"] = { ...(options.gworld ?? {}), ...carried };
      await actor.update(update);
      moved++;
    } catch (error) {
      console.warn(`${MODULE_ID} | could not move ${String(actor?.name ?? "")} to the system's ${to}`, error);
    }
  }
  return moved;
}
