/**
 * GURPS High-Tech: the book's rules, registered with the GWorld system
 * through its add-on API. Its group's switches all start off, as every book's
 * do.
 *
 * About a fifth of the book's rules are Ultra-Tech's at lower TLs, and some
 * are Martial Arts'. Those live once, as shared engines under `src/shared/`,
 * and this book registers its own table for each and its own switch, so a GM
 * can use High-Tech without either of the other books. So far this registers
 * a gun's quality, its care, and clearing a stoppage by Immediate Action
 * (pp. 79-81, 129, 249-251).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initFirearms, readyFirearms } from "./firearms/index.js";
import { initHighTechPower } from "./power/index.js";
import { registerHighTechRecordData } from "./records.js";

const SLUG = "high-tech";
const REFERENCE = "High-Tech";

/**
 * Switch keys are one namespace across this module's books, so where High-Tech
 * prints a rule Ultra-Tech has a switch for, it takes its own key. These are
 * reserved for the rule issues that register them, beside the Ultra-Tech key
 * each would have clashed with.
 */
export const RESERVED_KEYS = Object.freeze({
  /** Gadget options and statistics (Ultra-Tech: gadgetOptions). */
  equipmentOptions: "gadgetOptions",
  /** Gear adjusted for the carrier's Size Modifier (Ultra-Tech: adjustingForSm). */
  gearForSm: "adjustingForSm",
  /** Obsolete gear's Legality Class (Ultra-Tech: legalityAndAntiques). */
  antiqueLegality: "legalityAndAntiques",
  /** Computers (Ultra-Tech: computers). */
  computerSystems: "computers",
  /** Restraints (Ultra-Tech: restraints). */
  restraintDevices: "restraints",
});

/** The book's switches. */
const RULES = [
  { key: "firearmQuality", pages: "p. 79", implemented: true },
  { key: "gunCare", pages: "pp. 80-81, 129", implemented: true },
  { key: "immediateAction", pages: "pp. 81, 249-251", implemented: true },
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
      name: `GCC.HT.Rules.${rule.key}.Name`,
      hint: `GCC.HT.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

/**
 * Each rule issue adds its switches to RULES and registers its tables with
 * the shared engines in `init`. The battery table is registered already,
 * with its switch left for #358, so the captured gear keeps its batteries
 * (#348), and so are the record fields the explosives carry (#349).
 */
function init(): void {
  initHighTechPower();
  registerHighTechRecordData();
  initFirearms();
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyFirearms(api, { quality: rule("firearmQuality"), care: rule("gunCare"), immediateAction: rule("immediateAction") });
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS High-Tech",
  registerRules,
  init,
  ready,
};
