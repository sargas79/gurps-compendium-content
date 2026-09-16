/**
 * GURPS Ultra-Tech: the book's rules, registered with the GWorld system
 * through its add-on API. Its group's switches all start off, as every book's
 * do. So far this registers the gadget options a piece of gear is built with
 * and the statistics the book assumes for it (pp. 15, 17), gear adjusted for
 * the size of whoever carries it (p. 16), and the Legality Class an obsolete
 * gadget may be carried under, with the price below which a gadget is too
 * simple to maintain (p. 14), and the power cells gear runs on (pp. 18-20, 133).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initGadgets, readyGadgets } from "./gadgets/index.js";
import { initPower, readyPower } from "./power/index.js";
import { registerRecordData } from "./records.js";

const SLUG = "ultra-tech";
const REFERENCE = "Ultra-Tech";

/** The book's switches. */
const RULES = [
  { key: "gadgetOptions", pages: "pp. 15, 17", implemented: true },
  { key: "adjustingForSm", pages: "p. 16", implemented: true },
  { key: "legalityAndAntiques", pages: "p. 14", implemented: true },
  { key: "powerCells", pages: "pp. 18-20, 133", implemented: true },
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
      name: `GCC.UT.Rules.${rule.key}.Name`,
      hint: `GCC.UT.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

function init(): void {
  initGadgets();
  initPower();
  registerRecordData();
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyGadgets(api, { options: rule("gadgetOptions"), sm: rule("adjustingForSm"), legality: rule("legalityAndAntiques") });
  readyPower(api, rule("powerCells"));
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Ultra-Tech",
  registerRules,
  init,
  ready,
};
