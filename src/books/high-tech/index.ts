/**
 * GURPS High-Tech: the book's rules, registered with the GWorld system
 * through its add-on API. Its group's switches all start off, as every book's
 * do.
 *
 * About a fifth of the book's rules are Ultra-Tech's at lower TLs, and some
 * are Martial Arts'. Those live once, as shared engines under `src/shared/`,
 * and this book registers its own table for each and its own switch, so a GM
 * can use High-Tech without either of the other books. No switch is
 * registered yet: the group is there, and the Rules page says its rules are
 * still to come.
 */

import type { BookRules } from "../../shared/book.js";
import { initHighTechPower } from "./power/index.js";
import { registerHighTechRecordData } from "./records.js";

const SLUG = "high-tech";

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

/**
 * No switches yet: each rule issue adds its own, as a RULES list and a
 * `registerRules` like Ultra-Tech's, and registers its tables with the shared
 * engines in `init`. The battery table is registered already, with its switch
 * left for #358, so the captured gear keeps its batteries (#348), and so are
 * the record fields the explosives carry (#349).
 */
export const book: BookRules = {
  slug: SLUG,
  label: "GURPS High-Tech",
  init: () => {
    initHighTechPower();
    registerHighTechRecordData();
  },
};
