/**
 * A book's rules, as the add-on registers them.
 *
 * Each book is a folder under `src/books/<slug>/` that exports one of these.
 * Its rules group is named for the book, and every switch in it starts off:
 * a table turns on the books it owns.
 */

import { MODULE_ID, type GWorldApi, type RuleRegistry } from "./module.js";

export interface BookRules {
  /** The book's slug, as `books/<slug>/` names it; also the rules group's id. */
  slug: string;
  /** The rules group's label: "GURPS <Book>". */
  label: string;
  /** Registers the book's switches in its group. Called during `gworld.registerRules`. */
  registerRules?: (registry: RuleRegistry, group: string) => void;
  /** Registers what must exist before the world's data is read: data extensions, hooks. Called on `init`. */
  init?: (api: GWorldApi) => void;
  /** Registers the book's maneuvers, options, sheet sections and cards. Called on `gworld.ready`. */
  ready?: (api: GWorldApi) => void;
}

/** Registers every book's group, then lets each book register its switches. */
export function registerBookRules(books: readonly BookRules[], registry: RuleRegistry): void {
  for (const book of books) {
    const group = registry.registerRuleGroup({ module: MODULE_ID, id: book.slug, label: book.label });
    if (!group) continue;
    try {
      book.registerRules?.(registry, book.slug);
    } catch (error) {
      console.error(`${MODULE_ID} | ${book.label}: registering its rules failed`, error);
    }
  }
}

/** Lets each book register what must exist before the world's data is read. */
export function initBooks(books: readonly BookRules[], api: GWorldApi): void {
  for (const book of books) {
    try {
      book.init?.(api);
    } catch (error) {
      console.error(`${MODULE_ID} | ${book.label}: its init work failed`, error);
    }
  }
}

/** Lets each book register what needs the ready world. */
export function readyBooks(books: readonly BookRules[], api: GWorldApi): void {
  for (const book of books) {
    try {
      book.ready?.(api);
    } catch (error) {
      console.error(`${MODULE_ID} | ${book.label}: its ready work failed`, error);
    }
  }
}
