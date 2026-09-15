/**
 * The module's entry point.
 *
 * The module carries other GURPS books into the GWorld system: their text
 * and statistics in packs, and their rules here, registered through the
 * system's add-on API. Each book registers a rules group on
 * `gworld.registerRules`, and whatever else it needs once the world is ready.
 */

import { BOOKS } from "./books/index.js";
import { initBooks, readyBooks, registerBookRules } from "./shared/book.js";
import { readyPickerText } from "./shared/picker-text.js";
import { API_RANGE, HOOKS, MODULE_ID, type GWorldApi, type RuleRegistry } from "./shared/module.js";

Hooks.once(HOOKS.registerRules, (registry: RuleRegistry) => {
  registerBookRules(BOOKS, registry);
});

// The system's own init has run by now, so the API is there: data extensions
// and hooks go in before the world's documents are read.
Hooks.once("init", () => {
  const api = (game as unknown as { gworld?: { api?: GWorldApi } }).gworld?.api;
  if (!api?.satisfies?.(API_RANGE)) {
    console.warn(`${MODULE_ID} | the GWorld API ${api?.version ?? "(missing)"} doesn't satisfy ${API_RANGE}; the books' rules are not registered`);
    return;
  }
  initBooks(BOOKS, api);
});

Hooks.once(HOOKS.ready, (api: GWorldApi) => {
  // The manifest's range only warns the GM; an API this build can't use is
  // left alone rather than half registered.
  if (!api?.satisfies?.(API_RANGE)) {
    console.warn(`${MODULE_ID} | the GWorld API ${api?.version ?? "(missing)"} doesn't satisfy ${API_RANGE}; the books' rules are not registered`);
    return;
  }
  readyBooks(BOOKS, api);
  readyPickerText();
});
