/**
 * Contact stunners at the table, for every book that prints them
 * (Ultra-Tech p. 165, High-Tech p. 199). The rules are in `rules.ts`.
 *
 * Each book registers a table: its switch, which of its items are contact
 * stunners, the armour divisor their shock has, and the label the armour's
 * bonus goes on the roll under. The system already gives the roll to resist
 * a bonus for DR (Characters p. 35; API 1.105.0), one line keyed
 * `afflictionDr`. One `gworld.successRollModifiers` listener makes that line
 * the books' count: the DR at the spot struck, worn metallic armour held to
 * DR 1, divided by the divisor. It is never a second line. An item from
 * a book with a table takes that book's, and only while that book's switch
 * is on; any other takes the first switched-on table that claims it.
 */

import { BookTables, bookOf, type BookTable } from "../book-tables.js";
import { afflictionDrLine, afflictionDrMet, afflictionRowDivisor, setAfflictionDr } from "../affliction-dr.js";
import type { GWorldApi } from "../module.js";
import { contactDrBonusAt, wearsMetallicArmor } from "./rules.js";

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

/** Makes the system's DR line on the roll to resist the books' count, once whichever books ask. */
export function readyStunners(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!context?.tags?.includes?.("resist")) return;
    const table = stunnerTableOf(context.attack?.item);
    if (!table) return;
    // No line: no DR at the spot, or the attack gets past it. Nothing to count.
    const line = afflictionDrLine(context);
    if (!line) return;
    const met = afflictionDrMet(context, afflictionRowDivisor(context.attack.item, context.attack.mode));
    const bonus = contactDrBonusAt(met, Number(context.attack.dr) || 0, table.armorDivisor, wearsMetallicArmor(context.actor));
    if (bonus !== line.value) setAfflictionDr(context, bonus, table.label());
  });
}

/** Forgets that the listener was added. For tests. */
export function resetStunners(): void {
  readied = false;
  STUNNER_TABLES.clear();
}
