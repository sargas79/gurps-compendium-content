/**
 * Where GURPS Ultra-Tech keeps what it knows about a piece of gear
 * (pp. 15-17), under this module's own fields on the system's items.
 *
 * The options are fields that reprice the item, never items of their own,
 * and the book's list figures stay the system's: what is kept here is what
 * the gadget was built with.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import { NO_OPTIONS, type Build, type Disguise, type GadgetOptions, type Grade } from "./rules.js";

/** The item types this book keeps data on. */
export const ITEM_TYPES = ITEM_EXTENSION_TYPES;

/** The key this book's fields sit under, inside this module's own extension. */
const FIELD = "ultraTech";

export const DISGUISES: readonly Disguise[] = ["", "massProduced", "custom"];
export const GRADES: readonly Grade[] = ["", "cheap", "expensive"];
export const BUILDS: readonly Build[] = ["plastic", "weapon", "solidMelee", "own"];

/** What this book keeps on a gadget. */
export interface UltraTechItem {
  options: GadgetOptions;
  /** The weight of the power cells in the piece, which cheap and expensive leave out (p. 15). */
  cellWeight: number;
  /** The "adjust for SM" the tables print after a gadget's weight, cost and power (p. 16). */
  adjustForSm: boolean;
  /** What the gadget is made of, for the DR the book assumes (p. 17). */
  build: Build;
  /** The gadget's own HT, where the book states one; zero to assume HT 10 (p. 17). */
  health: number;
}

/** Adds this book's fields to the module's data on equipment and armour. */
export function registerUltraTechData(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_TYPES, {
    [FIELD]: new f.SchemaField({
      /** Disguised as something else of similar shape (p. 15). */
      disguise: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...DISGUISES] }),
      /** Styling's multiplier on the price, 2 to 10; zero for a gadget with none (p. 15). */
      styling: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 10 }),
      /** Built to withstand abuse (p. 15). */
      rugged: new f.BooleanField({ initial: false }),
      /** Built down to a price or up to a weight (p. 15). */
      grade: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...GRADES] }),
      cellWeight: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      adjustForSm: new f.BooleanField({ initial: false }),
      build: new f.StringField({ required: true, nullable: false, blank: false, initial: "plastic", choices: [...BUILDS] }),
      health: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    }),
  });
}

/** This book's data on an item, with nothing missing. */
export function ultraTechItem(item: any): UltraTechItem {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const disguise = DISGUISES.includes(data.disguise) ? (data.disguise as Disguise) : NO_OPTIONS.disguise;
  const grade = GRADES.includes(data.grade) ? (data.grade as Grade) : NO_OPTIONS.grade;
  const build = BUILDS.includes(data.build) ? (data.build as Build) : "plastic";
  return {
    options: {
      disguise,
      styling: Math.max(0, Math.min(10, Math.floor(Number(data.styling) || 0))),
      rugged: Boolean(data.rugged),
      grade,
    },
    cellWeight: Math.max(0, Number(data.cellWeight) || 0),
    adjustForSm: Boolean(data.adjustForSm),
    build,
    health: Math.max(0, Math.floor(Number(data.health) || 0)),
  };
}

/** Whether anything has been chosen on the item at all. */
export function isBuilt(data: UltraTechItem): boolean {
  return Boolean(data.options.disguise || data.options.styling >= 2 || data.options.rugged || data.options.grade || data.adjustForSm);
}

/** Writes part of this book's data on an item. */
export function storeUltraTech(item: any, patch: Record<string, unknown>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${FIELD}.${key}`, value])));
}
