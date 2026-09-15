/**
 * GURPS Martial Arts: the book's rules, registered with the GWorld system
 * through its add-on API. The book calls every one of its rules optional
 * (p. 96), so its group's switches all start off. So far this registers
 * Committed Attack and Defensive Attack (pp. 99-100).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { readyCommittedDefensive } from "./committed-defensive/index.js";

const SLUG = "martial-arts";
const REFERENCE = "Martial Arts";

/** The book's switches. */
const RULES = [
  { key: "committedDefensiveAttack", pages: "pp. 99-100", implemented: true },
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
      name: `GCC.MA.Rules.${rule.key}.Name`,
      hint: `GCC.MA.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

function ready(api: GWorldApi): void {
  readyCommittedDefensive(api, () => api.registry.isRuleOn(ruleKey("committedDefensiveAttack")));
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Martial Arts",
  registerRules,
  ready,
};
