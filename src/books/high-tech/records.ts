/**
 * What High-Tech's records carry for the rules that read them, kept in this
 * module's own fields on the system's items.
 *
 * The system keeps a module's extension data to the schema the module
 * registers: a key never registered is dropped when a document is read. The
 * captured and hand-kept records write these keys, so each is registered
 * here in the shape they write, whether or not the rule that reads it exists
 * yet. High-Tech registers its own rather than borrowing Ultra-Tech's, so the
 * book needs no other (decision D1).
 *
 *   - `explosive`: the explosive an item is, as the Relative Explosive Force
 *     Table names it (p. 183), and the pounds of it the item holds -- a pound
 *     of TNT, a tube holding a quarter-pound of extrudable explosive (#349).
 *     The REF comes from the table, not the record, so the two can't disagree;
 *     the demolition rules (#378) read it.
 *
 * The batteries gear runs on are `power`, registered with the shared cell
 * engine (`power/`).
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../shared/extensions.js";
import { MODULE_ID } from "../../shared/module.js";
import { explosive, type ExplosiveRow } from "./explosives/ref.js";

/** The keys this registers, for anything that needs to know them. */
export const RECORD_KEYS = ["explosive", "firearmBuild"] as const;

/** A barrel heavier or lighter than usual (p. 86). */
export const BARRELS = ["", "light", "extraHeavy"] as const;
export type Barrel = (typeof BARRELS)[number];

/** How a gun is built, as its record says. */
export interface FirearmBuild {
  waterPints: number;
  condenser: boolean;
  barrel: Barrel;
  /** 0 for the usual time. */
  barrelChangeSeconds: number;
  /** 0 for an ordinary gun. */
  underwaterFactor: number;
}

/** Adds the record fields to this module's data on equipment and armour. */
export function registerHighTechRecordData(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    explosive: new f.SchemaField({
      type: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      pounds: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    }),
    firearmBuild: new f.SchemaField({
      waterPints: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      condenser: new f.BooleanField({ initial: false }),
      barrel: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...BARRELS] }),
      barrelChangeSeconds: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      underwaterFactor: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    }),
  });
}

/** How a gun is built, with nothing missing. */
export function firearmBuild(item: any): FirearmBuild {
  const d = item?.system?.extensions?.[MODULE_ID]?.firearmBuild ?? {};
  const count = (v: unknown) => Math.max(0, Number(v) || 0);
  return {
    waterPints: count(d.waterPints),
    condenser: d.condenser === true,
    barrel: BARRELS.includes(d.barrel) ? d.barrel : "",
    barrelChangeSeconds: Math.floor(count(d.barrelChangeSeconds)),
    underwaterFactor: count(d.underwaterFactor),
  };
}

/** An item's charge: its row of the REF table and the pounds of it, or null for an item that is none. */
export function chargeOf(item: any): { row: ExplosiveRow; pounds: number } | null {
  const data = item?.system?.extensions?.[MODULE_ID]?.explosive;
  const row = explosive(String(data?.type ?? ""));
  const pounds = Number(data?.pounds);
  return row && pounds > 0 ? { row, pounds } : null;
}
