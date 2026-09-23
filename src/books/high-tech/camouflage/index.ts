/**
 * High-Tech's camouflage (pp. 76-77), registered with the system through the
 * add-on API: the book's table for the shared camouflage engine
 * (`src/shared/stealth/`), which does the Camouflage roll, the Gear tab's
 * terrain and observer, the pricing, the item sheet section and the row
 * buttons, under the camouflageGear switch.
 *
 *   - A worn pattern is the Camouflage skill's equipment line: simple +1
 *     anywhere; basic +2 in matching terrain, -1 elsewhere and -2 in
 *     contrasting terrain; advanced +3 and -2; a ghillie suit +3, -1 and -2.
 *     From TL7 the dyes give +1 more against technological night vision or
 *     infravision, and infrared suppression (the poncho, the IR net, a
 *     ghillie suit with it built in) +2 against infravision.
 *   - A reversible piece's other pattern is a second field, and a row button
 *     turns it inside out; both patterns are priced.
 *   - A ghillie suit's row button customises it: a Camouflage roll whose
 *     margin adds to its bonus, to +8.
 *   - A net's row button hides gear: the deployer's Camouflage with the net's
 *     pattern for the terrain.
 *   - Scent masking worn is -4 to Tracking to follow the wearer.
 *   - Patterns and scent masking on other clothing reprice it as a share of
 *     its cost; infrared suppression in a ghillie suit is $500.
 */

import { CAMOUFLAGE_TABLES, initCamouflage, readyCamouflage, type CamouflageTable } from "../../../shared/stealth/index.js";
import type { CamouflageData, CamouflageFigures } from "../../../shared/stealth/data.js";
import type { GWorldApi } from "../../../shared/module.js";
import { GHILLIE_MOST, PATTERNS, PATTERN_KEYS, SCENT_MASKING, camouflagePrice, patternFigures, patternShowing } from "./rules.js";

const NS = "GCC.HT";

const tlOf = (item: any): number | null => {
  const match = /\d+/.exec(String(item?.system?.tl ?? ""));
  return match ? Number(match[0]) : null;
};

const FIGURES: CamouflageFigures = {
  patterns: PATTERN_KEYS,
  gear(item: any, data: CamouflageData) {
    const key = patternShowing(data);
    if (!key) return null;
    const figures = patternFigures(key, { tl: tlOf(item), infrared: data.infrared, custom: data.custom });
    return { counts: "quality", pattern: figures.terrain, observers: figures.observers, deployed: data.net };
  },
  label: (item: any) => String(item?.name ?? ""),
  scent: (_item: any, data: CamouflageData) => (data.scent ? { follow: SCENT_MASKING.follow } : null),
  scentLabel: (item: any) => game.i18n.format(`${NS}.Camouflage.ScentFollow`, { name: item?.name ?? "" }),
  price: (_item: any, data: CamouflageData) => (data.pattern || data.second || data.scent ? camouflagePrice(data) : null),
  customise: (_item: any, data: CamouflageData) => (patternShowing(data) === "ghillie" && !data.net ? { base: PATTERNS.ghillie.terrain.matching, most: GHILLIE_MOST } : null),
};

/** High-Tech's camouflage table, under its switch's full key. */
export function highTechCamouflage(switchKey: string): CamouflageTable {
  return { book: "high-tech", tls: { min: 0, max: 8 }, switch: switchKey, i18n: NS, sections: true, figures: FIGURES };
}

/** Registers the table, and the fields, before the world's data is read. */
export function initHighTechCamouflage(switchKey: string): void {
  CAMOUFLAGE_TABLES.register(highTechCamouflage(switchKey));
  initCamouflage();
}

/** Registers the engine's parts, once whichever books ask. */
export function readyHighTechCamouflage(api: GWorldApi): void {
  readyCamouflage(api);
}
