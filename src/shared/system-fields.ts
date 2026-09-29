/**
 * Data this module kept before the Basic Set Revised gave it to the system
 * (Basic Set Revised pp. 342, 576; GWorldVTT API 1.182-1.188), carried to the
 * system's own fields once, by the GM's client:
 *
 *   - Balanced, Cutting-Edge, Disguised and Rugged on equipment (Monster
 *     Hunters 1's gadget and weapon options, Ultra-Tech's and High-Tech's
 *     Rugged and a custom-built Disguise) are `system.balanced`,
 *     `system.cuttingEdge`, `system.disguised` and `system.rugged`; Disguised
 *     on clothing is `system.disguised`.
 *   - Signature Gear's flag is `system.signature`.
 *   - High-Tech's n-in-6 armour coverage is `system.coverage`, the field the
 *     packs write, which the system's partial coverage switch rolls.
 *
 * The schema still declares this module's old fields, so a world's values are
 * there to read; each is cleared as it is moved, which makes the step
 * idempotent (nothing is recorded, and a second run finds nothing). What the
 * system has no field for stays this module's: Cutting-Edge and Rugged on
 * clothing, a mass-produced Disguise.
 */

import { MODULE_ID } from "./module.js";

const EXT = `system.extensions.${MODULE_ID}`;

/**
 * The update that moves an item's old fields to the system's, or null where
 * it holds none. A system field already set is left as it is.
 */
export function legacyUpdate(item: any): Record<string, unknown> | null {
  const type = item?.type;
  if (type !== "equipment" && type !== "armor") return null;
  const sys = item.system ?? {};
  const ext = sys.extensions?.[MODULE_ID] ?? {};
  const update: Record<string, unknown> = {};
  const move = (held: unknown, field: string, clear: string): void => {
    if (held !== true) return;
    if (sys[field] !== true) update[`system.${field}`] = true;
    update[`${EXT}.${clear}`] = false;
  };

  const gadget = ext.gadget ?? {};
  move(gadget.disguised, "disguised", "gadget.disguised");
  move(ext.signature, "signature", "signature");
  if (type === "equipment") {
    move(gadget.cuttingEdge, "cuttingEdge", "gadget.cuttingEdge");
    move(gadget.rugged, "rugged", "gadget.rugged");
    move(ext.weapon?.balanced, "balanced", "weapon.balanced");
    move(ext.weapon?.disguised, "disguised", "weapon.disguised");
    move(ext.ultraTech?.rugged, "rugged", "ultraTech.rugged");
  }
  if (ext.ultraTech?.disguise === "custom") {
    if (sys.disguised !== true) update["system.disguised"] = true;
    update[`${EXT}.ultraTech.disguise`] = "";
  }

  // n in 6 of the location: 1 to 5, the system's default being all six.
  const coverage = Math.floor(Number(ext.htArmor?.coverage) || 0);
  if (type === "armor" && coverage > 0) {
    if (coverage < 6 && !(Number(sys.coverage) > 0 && Number(sys.coverage) < 6)) update["system.coverage"] = coverage;
    update[`${EXT}.htArmor.coverage`] = 0;
  }
  return Object.keys(update).length ? update : null;
}

/** Moves the world's items, and those on its actors, to the system's fields; the GM's client only. */
export async function migrateLegacyFields(): Promise<{ changed: number; failed: number }> {
  const g = game as any;
  if (!g.user?.isGM) return { changed: 0, failed: 0 };
  const items: any[] = [...(g.items ?? [])];
  for (const actor of g.actors ?? []) items.push(...(actor.items ?? []));
  let changed = 0;
  let failed = 0;
  for (const item of items) {
    const update = legacyUpdate(item);
    if (!update) continue;
    try {
      await item.update(update);
      changed += 1;
    } catch (error) {
      failed += 1;
      console.warn(`${MODULE_ID} | could not move ${String(item?.name ?? "")}'s fields to the system's`, error);
    }
  }
  if (changed || failed) console.info(`${MODULE_ID} | moved ${changed} item(s)' fields to the system's (${failed} failed)`);
  return { changed, failed };
}
