/**
 * What the camouflage engine keeps on a piece of gear, and each book's table
 * for it.
 *
 * A piece of camouflage is its book's by its record: the table says what a
 * record is (a pattern worn, a net laid over gear, a system the book prints
 * with its own figures) and what its options cost. The pattern is a field
 * that reprices the clothing it is printed on, never an item of its own; the
 * field offers every book's patterns, built once every book has registered.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID } from "../module.js";
import { OBSERVERS, TERRAINS, type Observer, type ObserverBonuses, type Terrain, type TerrainModifiers } from "./rules.js";

/** The key the fields sit under, inside this module's own extension. */
const FIELD = "camouflage";

/** The actor flag that says what a character is hiding in and from. */
export const HIDING_FLAG = "camouflage";

/** Where a character is hiding and who from, as their Gear tab says. */
export interface HidingState {
  terrain: Terrain;
  observer: Observer;
}

/** A piece of camouflage, as its book's table reads it. */
export interface CamouflageGear {
  /**
   * How it counts on a Camouflage roll: `quality` is the roll's equipment
   * line, the best piece worn taking the place of the system's; `modifier` is
   * a line of its own on the roll.
   */
  counts: "quality" | "modifier";
  pattern: TerrainModifiers;
  /** What it adds against an observer relying on technological night vision or infravision. */
  observers?: ObserverBonuses;
  /** Laid over gear rather than worn: a net, rolled for by whoever deploys it. */
  deployed?: boolean;
}

/** Scent masking: a modifier on the wearer's own Tracking roll to cover a trail, or on anyone's to follow them. */
export interface ScentMasking {
  own?: number;
  follow?: number;
}

/** What the engine keeps on a piece of camouflage. */
export interface CamouflageData {
  /** The pattern printed on it, a key of its book's table. */
  pattern: string;
  /** The pattern on the other side of a reversible piece. */
  second: string;
  /** Whether the second side is the one showing. */
  reversed: boolean;
  /** Infrared suppression built in. */
  infrared: boolean;
  /** Scent masking built in. */
  scent: boolean;
  /** What customising has added to its bonus. */
  custom: number;
  /** Laid over gear rather than worn. */
  net: boolean;
  /** Whether the record's price already includes the pattern and scent masking. */
  builtIn: boolean;
}

/** A book's figures and readings for its camouflage. */
export interface CamouflageFigures {
  /** The patterns its item sheet offers, as keys the field keeps. */
  patterns: readonly string[];
  /** The camouflage a record is, or null. */
  gear(item: any, data: CamouflageData): CamouflageGear | null;
  /** The label of a `modifier` piece's line on a Camouflage roll. */
  label(item: any, state: HidingState): string;
  /** The scent masking a worn record gives, or null. */
  scent?(item: any, data: CamouflageData): ScentMasking | null;
  /** The label of a scent-masking line. */
  scentLabel?(item: any, which: keyof ScentMasking): string;
  /** What the options do to the price: a factor on it, then dollars added. Null for nothing. */
  price?(item: any, data: CamouflageData): { factor: number; add: number } | null;
  /** The most customising may bring a piece's bonus to, or null where it can't be customised. */
  customise?(item: any, data: CamouflageData): { base: number; most: number } | null;
  /** A terrain the book kept for a character before the engine was shared, or null. */
  storedTerrain?(actor: any): Terrain | null;
}

/** One book's camouflage table. */
export interface CamouflageTable extends BookTable {
  /** The full key of the switch its camouflage rule needs. */
  switch: string;
  /** Where the book's text sits: "GCC.HT" reads "GCC.HT.Camouflage.Title". */
  i18n: string;
  /** Whether the engine's Gear tab and item sections speak for it; a book with its own sections says false. */
  sections: boolean;
  figures: CamouflageFigures;
}

/** Every book's camouflage table. */
export const CAMOUFLAGE_TABLES = new BookTables<CamouflageTable>();

/** The table whose rule applies to an item: its own book's while its switch is on; for an item of no book, a switched-on book's that knows it. */
export function camouflageTableOf(item: any, knows: (table: CamouflageTable) => boolean = () => true, on: (key: string) => boolean = isRuleOn): CamouflageTable | null {
  return CAMOUFLAGE_TABLES.forItem(item, (t) => on(t.switch) && knows(t));
}

/** Every pattern any book's table offers. */
function allPatterns(): string[] {
  return [...new Set(CAMOUFLAGE_TABLES.all.flatMap((t) => t.figures.patterns))];
}

let registered = false;

/** Adds the camouflage fields to this module's data on equipment and armour, once whichever books ask. */
export function registerCamouflageData(): void {
  if (registered) return;
  registered = true;
  const f = foundry.data.fields as any;
  const pattern = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...allPatterns()] });
  // Built once every book has registered its table, so the field holds every book's patterns.
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: () => new f.SchemaField({
      pattern: pattern(),
      second: pattern(),
      reversed: new f.BooleanField({ initial: false }),
      infrared: new f.BooleanField({ initial: false }),
      scent: new f.BooleanField({ initial: false }),
      custom: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      net: new f.BooleanField({ initial: false }),
      builtIn: new f.BooleanField({ initial: false }),
    }),
  });
}

/** This module's camouflage data on an item, with nothing missing. */
export function camouflageData(item: any): CamouflageData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const patterns = allPatterns();
  const pattern = (value: unknown) => (patterns.includes(String(value)) ? String(value) : "");
  return {
    pattern: pattern(data.pattern),
    second: pattern(data.second),
    reversed: data.reversed === true,
    infrared: data.infrared === true,
    scent: data.scent === true,
    custom: Math.max(0, Math.trunc(Number(data.custom) || 0)),
    net: data.net === true,
    builtIn: data.builtIn === true,
  };
}

/** Writes one of the fields on an item. */
export function storeCamouflage(item: any, field: keyof CamouflageData, value: unknown): Promise<unknown> {
  return item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
}

/** Where a character is hiding and who from: their Gear tab's choice, else what a book kept before, else matching terrain seen by eye. */
export function hidingState(actor: any): HidingState {
  const stored = actor?.getFlag?.(MODULE_ID, HIDING_FLAG) ?? {};
  const kept = CAMOUFLAGE_TABLES.all.map((t) => t.figures.storedTerrain?.(actor) ?? null).find((t) => t !== null) ?? null;
  return {
    terrain: TERRAINS.includes(stored.terrain) ? stored.terrain : (kept ?? "matching"),
    observer: OBSERVERS.includes(stored.observer) ? stored.observer : "vision",
  };
}

/** Changes where a character is hiding, or who from. */
export function setHiding(actor: any, change: Partial<HidingState>): Promise<unknown> {
  return actor.setFlag(MODULE_ID, HIDING_FLAG, { ...hidingState(actor), ...change });
}
