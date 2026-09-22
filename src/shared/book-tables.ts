/**
 * Rules two books print, written once.
 *
 * Several books print the same rule with their own figures: High-Tech's gadget
 * options and batteries are Ultra-Tech's at lower TLs. Such a rule's engine
 * lives under `src/shared/<engine>/` and never imports from a book's folder.
 * It keeps one table per book, and each book registers its table, naming its
 * own switches, when its init runs. A book's item takes its own book's table
 * and needs only that book's switch, so a GM can use either book without the
 * other, and a build without one of them still has the other's rules.
 */

import { MODULE_ID } from "./module.js";

/** What every book's table for a shared engine says about itself. */
export interface BookTable {
  /** The book's slug, as `books/<slug>/` and an item's book flag name it. */
  book: string;
  /** The TLs the book's gear covers, which picks a table for an item that names no book. */
  tls?: { min: number; max: number };
}

/** The book a record comes from: the flag this module's packs stamp on every one. */
export function bookOf(item: any): string | null {
  const book = item?.flags?.[MODULE_ID]?.book;
  return typeof book === "string" && book ? book : null;
}

/** The item's own tech level, where it states one. */
function itemTl(item: any): number | null {
  const match = /-?\d+/.exec(String(item?.system?.tl ?? ""));
  return match ? Number(match[0]) : null;
}

let ruleReader: (key: string) => boolean = () => false;

/** Where the engines read a switch from: the system's rules, once the API is there. */
export function setRuleReader(reader: (key: string) => boolean): void {
  ruleReader = reader;
}

/** Whether a switch is on. */
export function isRuleOn(key: string): boolean {
  return ruleReader(key);
}

/** One shared engine's tables, one per book. */
export class BookTables<T extends BookTable> {
  #tables: T[] = [];

  /** Registers a book's table; a second registration for the same book replaces the first. */
  register(table: T): void {
    const at = this.#tables.findIndex((t) => t.book === table.book);
    if (at >= 0) this.#tables[at] = table;
    else this.#tables.push(table);
  }

  /** Every book's table, in the order they were registered. */
  get all(): readonly T[] {
    return this.#tables;
  }

  forBook(book: string | null): T | null {
    return book ? (this.#tables.find((t) => t.book === book) ?? null) : null;
  }

  /**
   * The table whose rule applies to an item, or null where none does.
   *
   * An item from a book with a table takes that book's, and only while `on`
   * says that book's switch is on. Any other item -- the Basic Set's, one made
   * by hand -- takes a switched-on book's: the one whose TLs cover the item's,
   * or else the first registered.
   */
  forItem(item: any, on: (table: T) => boolean): T | null {
    const own = this.forBook(bookOf(item));
    if (own) return on(own) ? own : null;
    const candidates = this.#tables.filter(on);
    const tl = itemTl(item);
    const covering = tl === null ? undefined : candidates.find((t) => t.tls && tl >= t.tls.min && tl <= t.tls.max);
    return covering ?? candidates[0] ?? null;
  }

  /**
   * The table whose figures describe an item, whether or not a switch is on:
   * the one whose rule applies, else the item's own book's, else the first.
   */
  figuresFor(item: any, on: (table: T) => boolean): T | null {
    return this.forItem(item, on) ?? this.forBook(bookOf(item)) ?? this.#tables[0] ?? null;
  }

  /** Forgets every table. For tests. */
  clear(): void {
    this.#tables = [];
  }
}
