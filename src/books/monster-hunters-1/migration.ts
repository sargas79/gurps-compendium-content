/**
 * Moving a world's Monster Hunters 1 data out of the system's storage and into
 * this module's, while the system still defines it (system 1.4.0), ahead of
 * the release that stops defining it (1.5.0).
 *
 * Every step goes through the system's migration helpers, which record it in
 * the world so it runs once, and run it again after a failure. The system
 * lists the same data as deprecated, and the manifest's
 * `flags.gworld.migrates` names the ids below, so the GM isn't warned about
 * data this module takes over.
 */

import { MODULE_ID, type GWorldApi } from "../../shared/module.js";
import { RITUAL_TYPE } from "./ritual/data.js";

/** The deprecated data this module takes over, by the system's ids. */
export const MIGRATES = ["ritual-items", "ritual-path", "bonus-points", "holy-items", "gear-options", "rule-switches"] as const;

/** The book's switches, under the same key in the system's group and this module's. */
export const RULE_KEYS = ["talentsSkipWildcards", "holyAttacks", "ritualPathMagic", "monsterHuntersGear", "bonusPointSpending"] as const;

/** A ritual's data, as the system's type stored it and this module's type stores it. */
export function ritualSystem(source: Record<string, any>): Record<string, unknown> {
  const { extensions: _dropped, ...rest } = source ?? {};
  void _dropped;
  return {
    description: rest.description ?? "",
    reference: rest.reference ?? "",
    effects: Array.isArray(rest.effects) ? rest.effects : [],
    definition: rest.definition ?? {},
    casting: rest.casting ?? {},
    masteredAs: rest.masteredAs ?? "",
    blocking: Boolean(rest.blocking),
  };
}

/** A weapon's ranged modes' special loads, as one entry per mode that has one. */
export function loadsFromModes(modes: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(modes) ? modes : [])
    .map((m: any, index) => ({
      mode: index,
      powder: String(m?.powder ?? ""),
      payload: String(m?.payload ?? ""),
      powderAdjust: Number(m?.powderAdjust) || 0,
      payloadAdjust: Number(m?.payloadAdjust) || 0,
      magazineCost: Number(m?.magazineCost) || 0,
    }))
    .filter((l) => l.powder || l.payload || l.powderAdjust || l.payloadAdjust || l.magazineCost);
}

/** The steps, in order, and what each did. */
export async function migrateWorld(api: GWorldApi): Promise<Array<{ step: string; changed: number; failed: number; skipped: boolean }>> {
  if (!game.user?.isGM) return [];
  const m = api.migration;
  const done: Array<{ step: string; changed: number; failed: number; skipped: boolean }> = [];
  const run = async (step: string, work: () => Promise<{ changed: number; failed: number; skipped: boolean }>) => {
    const result = await work();
    done.push({ step, ...result });
  };

  await run("mh1-ritual-items", () => m.migrateItemType({
    module: MODULE_ID, step: "mh1-ritual-items", fromType: "ritual", toType: RITUAL_TYPE, mapData: (source) => ritualSystem(source),
  }));
  await run("mh1-actor-fields", () => m.moveFields({
    module: MODULE_ID, step: "mh1-actor-fields", documentName: "Actor", types: ["character", "npc"],
    fields: { ritualPath: "ritualPath", bonusPoints: "points" },
  }));
  await run("mh1-equipment-fields", () => m.moveFields({
    module: MODULE_ID, step: "mh1-equipment-fields", documentName: "Item", types: ["equipment"],
    fields: {
      holy: "holy",
      charm: "charm",
      grimoire: "grimoire",
      improvements: "gadget",
      holdout: "holdout",
      signature: "signature",
      listWeight: "listWeight",
      weaponImprovements: "weapon",
      improvisedPenalty: "improvisedPenalty",
      rangedModes: "loads",
    },
    map: (value, path) => (path === "rangedModes" ? loadsFromModes(value) : value),
  }));
  await run("mh1-armor-fields", () => m.moveFields({
    module: MODULE_ID, step: "mh1-armor-fields", documentName: "Item", types: ["armor"],
    fields: { improvements: "gadget", holdout: "holdout", signature: "signature", listWeight: "listWeight" },
  }));
  for (const key of RULE_KEYS) {
    const step = `mh1-rule-${key}`;
    await run(step, () => m.moveRuleState({ module: MODULE_ID, step, fromKey: key, toKey: `${MODULE_ID}.${key}`, turnOff: true }));
  }
  return done;
}
