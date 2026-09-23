/**
 * Contact stunners at the table, for every book that prints them
 * (Ultra-Tech p. 165, High-Tech p. 199). The rules are in `rules.ts`.
 *
 * Each book registers a table: its switch, which of its items are contact
 * stunners, the armour divisor their shock has, and the label the armour's
 * bonus goes on the roll under. One `gworld.successRollModifiers` listener
 * then puts the victim's armour on the roll to resist: its DR at the spot
 * struck, metallic armour held to DR 1, divided by the divisor. An item from
 * a book with a table takes that book's, and only while that book's switch
 * is on; any other takes the first switched-on table that claims it.
 */

import { BookTables, bookOf, type BookTable } from "../book-tables.js";
import type { GWorldApi } from "../module.js";
import { contactDrBonus, wearsMetallicArmor } from "./rules.js";

export * from "./rules.js";

/** One book's contact stunners. */
export interface StunnerTable extends BookTable {
  /** Whether the book's switch is on. */
  on: () => boolean;
  /** Whether an item is one of the book's contact stunners. */
  applies: (item: any) => boolean;
  /** The armour divisor the shock is resisted at, where the attack's mode doesn't say. */
  armorDivisor: number;
  /** The label of the armour's line on the roll. */
  label: () => string;
}

/** Every book's contact stunners. */
export const STUNNER_TABLES = new BookTables<StunnerTable>();

/** The table that claims an item as a contact stunner, or null. */
export function stunnerTableOf(item: any): StunnerTable | null {
  if (!item) return null;
  const own = STUNNER_TABLES.forBook(bookOf(item));
  if (own) return own.on() && own.applies(item) ? own : null;
  return STUNNER_TABLES.all.find((t) => t.on() && t.applies(item)) ?? null;
}

let readied = false;

/** Puts the armour on the roll to resist, once whichever books ask. */
export function readyStunners(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!context?.tags?.includes?.("resist")) return;
    const table = stunnerTableOf(context.attack?.item);
    if (!table) return;
    const bonus = contactDrBonus(Number(context.attack.dr) || 0, table.armorDivisor, wearsMetallicArmor(context.actor));
    if (bonus) context.modifiers.push({ label: table.label(), value: bonus });
  });
}

/** Forgets that the listener was added. For tests. */
export function resetStunners(): void {
  readied = false;
  STUNNER_TABLES.clear();
}
