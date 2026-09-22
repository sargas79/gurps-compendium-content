/**
 * What the gadget engine keeps about a piece of gear, under this module's own
 * fields on the system's items, whichever book's table prices it.
 *
 * The options are fields that reprice the item, never items of their own,
 * and the book's list figures stay the system's: what is kept here is what
 * the gadget was built with.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID } from "../module.js";
import { NO_OPTIONS, type Build, type Disguise, type GadgetOptions, type Grade } from "./rules.js";

/** The item types the engine keeps data on. */
export const ITEM_TYPES = ITEM_EXTENSION_TYPES;

/**
 * The key the fields sit under, inside this module's own extension. It is
 * Ultra-Tech's name because that book's gadgets came first, and worlds hold
 * data under it; every book's gadgets share it, since an item comes from one.
 */
const FIELD = "ultraTech";

export const DISGUISES: readonly Disguise[] = ["", "massProduced", "custom"];
export const GRADES: readonly Grade[] = ["", "cheap", "expensive"];
export const BUILDS: readonly Build[] = ["plastic", "weapon", "solidMelee", "own"];

/** What the engine keeps on a gadget. */
export interface GadgetItem {
  options: GadgetOptions;
  /** The weight of the power cells in the piece, which cheap and expensive leave out. */
  cellWeight: number;
  /** The "adjust for SM" the tables print after a gadget's weight, cost and power. */
  adjustForSm: boolean;
  /** What the gadget is made of, for the DR the book assumes. */
  build: Build;
  /** The gadget's own HT, where the book states one; zero to assume the book's. */
  health: number;
}

let registered = false;

/** Adds the gadget fields to the module's data on equipment and armour, once whichever books ask. */
export function registerGadgetData(): void {
  if (registered) return;
  registered = true;
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_TYPES, {
    [FIELD]: new f.SchemaField({
      /** Disguised as something else of similar shape. */
      disguise: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...DISGUISES] }),
      /** Styling's multiplier on the price, 2 to 10; zero for a gadget with none. */
      styling: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 10 }),
      /** Built to withstand abuse. */
      rugged: new f.BooleanField({ initial: false }),
      /** Built down to a price or up to a weight. */
      grade: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...GRADES] }),
      cellWeight: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      adjustForSm: new f.BooleanField({ initial: false }),
      build: new f.StringField({ required: true, nullable: false, blank: false, initial: "plastic", choices: [...BUILDS] }),
      health: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    }),
  });
}

/** The gadget data on an item, with nothing missing. */
export function gadgetItem(item: any): GadgetItem {
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
export function isBuilt(data: GadgetItem): boolean {
  return Boolean(data.options.disguise || data.options.styling >= 2 || data.options.rugged || data.options.grade || data.adjustForSm);
}

/** Writes part of the gadget data on an item. */
export function storeGadget(item: any, patch: Record<string, unknown>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${FIELD}.${key}`, value])));
}
