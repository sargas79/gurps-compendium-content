/**
 * Where a weapon is carried, for every book that prints Fast-Draw from odd
 * positions (Martial Arts p. 104 for blades and the like, High-Tech p. 82 for
 * guns).
 *
 * Each book registers its table in `CARRY_TABLES`: the places it lists, what
 * each is worth to a Fast-Draw specialty, and its switches. The place is one
 * field on the item, and one item sheet section offers the places of every
 * book whose switch is on; a specialty takes the figure of the first such
 * book that lists it, so a gun needs only High-Tech's switch and a sword only
 * Martial Arts'.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { CARRIES, type Carry, type CarryFigures, type CarryOptions } from "./rules.js";

export * from "./rules.js";

/** One book's carry locations. */
export interface CarryTable extends BookTable {
  /** The full keys of the switches that use the table; any one of them on puts it in play. */
  rules: readonly string[];
  /** The places the book lists, in its order. */
  carries: readonly Carry[];
  figures: CarryFigures;
  /** Where the book's text sits: "GCC.MA.Readying" reads "GCC.MA.Readying.Carries.hip" and "GCC.MA.Readying.Carry". */
  i18n: string;
}

/** Every book's carry table. */
export const CARRY_TABLES = new BookTables<CarryTable>();

/** The tables whose switches are on. */
export function carryTablesOn(on: (key: string) => boolean = isRuleOn): CarryTable[] {
  return CARRY_TABLES.all.filter((t) => t.rules.some((key) => on(key)));
}

let fieldAdded = false;

/** Adds where a weapon is carried, once whichever books ask, before the world's items are read. */
export function initCarry(): void {
  if (fieldAdded) return;
  fieldAdded = true;
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, { carry: new f.StringField({ required: true, blank: true, initial: "" }) });
}

/** Where an item is carried, or null where it doesn't say. */
export function carryOf(item: any): Carry | null {
  const value = item?.system?.extensions?.[MODULE_ID]?.carry;
  return CARRIES.includes(value as Carry) ? (value as Carry) : null;
}

/**
 * A place's modifier for a Fast-Draw specialty: the first switched-on book's
 * table that lists the specialty there; null where none does.
 */
export function carryModifierOf(specialty: string, carry: Carry, options: CarryOptions = {}, on: (key: string) => boolean = isRuleOn): number | null {
  for (const table of carryTablesOn(on)) {
    const value = table.figures(specialty, carry, options);
    if (value !== null) return value;
  }
  return null;
}

let sectionRegistered = false;

/** Registers the item sheet section, once whichever books ask. */
export function readyCarry(api: GWorldApi): void {
  if (sectionRegistered) return;
  sectionRegistered = true;
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "carry",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/carry.hbs`,
    visible: (item) => item?.type === "equipment" && carryTablesOn().length > 0,
    context: (item) => {
      const tables = carryTablesOn();
      const labels = new Map<Carry, string>();
      for (const table of tables) {
        for (const carry of table.carries) if (!labels.has(carry)) labels.set(carry, game.i18n.localize(`${table.i18n}.Carries.${carry}`));
      }
      const current = carryOf(item);
      return {
        label: game.i18n.localize(`${tables[0]?.i18n}.Carry`),
        carries: [...labels].map(([value, label]) => ({ value, label, selected: current === value })),
      };
    },
    listeners: (element, item) => {
      element.querySelector<HTMLSelectElement>("[data-gcc-carry]")?.addEventListener("change", (event) => {
        void item.update({ [`system.extensions.${MODULE_ID}.carry`]: (event.currentTarget as HTMLSelectElement).value });
      });
    },
  });
}
