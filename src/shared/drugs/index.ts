/**
 * A book's poisons registered with the system's dose machinery (API 1.57.0),
 * one table per book: each book names its poisons, the label prefix it
 * localizes them under, and when each is available -- its own switches only.
 * The doses carry `source: "<module>.<key>"`, which is how a book's
 * `gworld.poisonCycle` listener knows its own.
 */

import { MODULE_ID, type GWorldApi } from "../module.js";
import type { PoisonNumbers } from "./rules.js";

export * from "./rules.js";

/** One book's poisons. */
export interface PoisonTable<K extends string = string> {
  /** The book's slug. */
  book: string;
  poisons: Readonly<Record<K, PoisonNumbers>>;
  /** The localization prefix each poison's name is under: `<prefix>.<key>`. */
  labelPrefix: string;
  /** Whether a poison is offered and run now: its book's switch. */
  available: (key: K) => boolean;
}

/** Offers every poison of a book's table in the sheet's dose dialog while its switch is on. */
export function registerPoisonTable<K extends string>(api: GWorldApi, table: PoisonTable<K>): void {
  for (const key of Object.keys(table.poisons) as K[]) {
    api.data.registerPoison({
      module: MODULE_ID,
      key,
      label: `${table.labelPrefix}.${key}`,
      poison: table.poisons[key] as any,
      available: () => table.available(key),
    });
  }
}

/** The key of the table's poison a dose was made from, or null for anyone else's. */
export function poisonKeyOf<K extends string>(table: PoisonTable<K>, source: unknown): K | null {
  const text = String(source ?? "");
  if (!text.startsWith(`${MODULE_ID}.`)) return null;
  const key = text.slice(MODULE_ID.length + 1);
  return Object.hasOwn(table.poisons, key) ? (key as K) : null;
}

/** The poison a table's key is, as `actors.dosePoison` takes it: its numbers, a name and its source. */
export function poisonDose<K extends string>(table: PoisonTable<K>, key: K, name: string, change: Partial<PoisonNumbers> = {}): any {
  return { ...table.poisons[key], ...change, name, source: `${MODULE_ID}.${key}` };
}
