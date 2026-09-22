/**
 * GURPS Ultra-Tech's gadgets (pp. 14-17): the book's table for the shared
 * gadget engine, which does the rest -- the price modifier for the options a
 * gadget was built with and for the size of its carrier, a rugged gadget's +2
 * on equipment failure, and the item sheet section with the statistics, the
 * antique's Legality Class and whether the gadget is worth maintaining.
 */

import { GADGET_TABLES, initGadgets, readyGadgets, type GadgetTable } from "../../../shared/gadgets/index.js";
import type { GWorldApi } from "../../../shared/module.js";
import { GADGETS } from "./rules.js";

/** Ultra-Tech's gadget table, behind the book's own three switches (full keys). */
export function ultraTechGadgets(switches: GadgetTable["switches"]): GadgetTable {
  return { book: "ultra-tech", tls: { min: 9, max: 12 }, figures: GADGETS, switches, i18n: "GCC.UT" };
}

/** Registers the table, and what must exist before the world's data is read. */
export function initUltraTechGadgets(switches: GadgetTable["switches"]): void {
  GADGET_TABLES.register(ultraTechGadgets(switches));
  initGadgets();
}

/** Registers the table-side parts, if no other book has yet. */
export function readyUltraTechGadgets(api: GWorldApi): void {
  readyGadgets(api);
}
