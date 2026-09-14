/**
 * GURPS Magic: the book's rules, registered with the GWorld system through its
 * add-on API. Its group holds the book's switches, all off by default. So far
 * this registers Powerstones (pp. 20, 69-70) and spells that attack without
 * being Missile or Melee spells: jets, breaths and rains (pp. 73-76, 187-198).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initPowerstones, readyPowerstones } from "./powerstones/index.js";
import { readySpellAttacks } from "./spell-attacks/index.js";

const SLUG = "magic";
const REFERENCE = "GURPS Magic";

/** The book's switches. */
const RULES = [
  { key: "powerstones", pages: "pp. 20, 69-70", implemented: true },
  { key: "spellAttacks", pages: "pp. 73-76, 187-198", implemented: true },
] as const;

/** A switch's full key, as the system stores it. */
export const ruleKey = (key: (typeof RULES)[number]["key"]) => `${MODULE_ID}.${key}`;

function registerRules(registry: RuleRegistry, group: string): void {
  for (const rule of RULES) {
    registry.registerRule({
      module: MODULE_ID,
      group,
      key: rule.key,
      // Localization keys: the Rules page localizes them, and this runs before
      // the translations are loaded.
      name: `GCC.Magic.Rules.${rule.key}.Name`,
      hint: `GCC.Magic.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

function init(): void {
  initPowerstones();
}

function ready(api: GWorldApi): void {
  readyPowerstones(api, () => api.registry.isRuleOn(ruleKey("powerstones")));
  readySpellAttacks(api, () => api.registry.isRuleOn(ruleKey("spellAttacks")));
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Magic",
  registerRules,
  init,
  ready,
};
