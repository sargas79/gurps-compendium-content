/**
 * The gadget engine, registered with the system through the add-on API, for
 * every book that prints the rule (Ultra-Tech pp. 14-17; High-Tech prints it
 * for its TLs).
 *
 * Each book registers its table in `GADGET_TABLES` -- its figures, its three
 * switches and its text -- then calls `initGadgets` and `readyGadgets`, which
 * register once however many books call them. What they register reads the
 * item's own book's table on every call:
 *
 *   - **init:** the gadget fields on equipment and armour.
 *   - **ready:** the price modifier for the options a gadget was built with
 *     and for the size of the character carrying it; the HT bonus a rugged
 *     gadget has on equipment failure; and an item sheet section that holds
 *     the options and shows the statistics, the price, the antique's Legality
 *     Class and whether the gadget is worth maintaining.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { BUILDS, DISGUISES, GRADES, gadgetItem, isBuilt, registerGadgetData, storeGadget, type GadgetItem } from "./data.js";
import {
  antiqueLegality,
  costFactor,
  gadgetDr,
  gadgetHealth,
  gadgetPrice,
  maintenanceThreshold,
  needsMaintenanceChecks,
  smFactor,
  type GadgetFigures,
} from "./rules.js";

/** One book's gadget table. */
export interface GadgetTable extends BookTable {
  figures: GadgetFigures;
  /** The full keys of the book's switches for the options, sizing and antiques. */
  switches: { options: string; sm: string; legality: string };
  /** Where the book's text for the sheet sits: "GCC.UT" reads "GCC.UT.Gadget.Title". */
  i18n: string;
}

/** Every book's gadget table. */
export const GADGET_TABLES = new BookTables<GadgetTable>();

/** The table each part of the rule takes for an item, where that part is switched on. */
export function gadgetTables(item: any, on: (key: string) => boolean = isRuleOn): { options: GadgetTable | null; sm: GadgetTable | null; legality: GadgetTable | null } {
  return {
    options: GADGET_TABLES.forItem(item, (t) => on(t.switches.options)),
    sm: GADGET_TABLES.forItem(item, (t) => on(t.switches.sm)),
    legality: GADGET_TABLES.forItem(item, (t) => on(t.switches.legality)),
  };
}

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Gadget.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Gadget.${key}`, data);

/** Registers what must exist before the world's data is read. */
export function initGadgets(): void {
  registerGadgetData();
}

/** A gadget is anything carried; a character's own body is not gear. */
function isGear(item: any): boolean {
  return item?.type === "equipment" || item?.type === "armor";
}

/** The table's price and weight: the system's list figures where it keeps them, the item's otherwise. */
function listOf(item: any): { cost: number; weight: number } {
  const system = item?.system ?? {};
  return {
    cost: Math.max(0, Number(system.listCost) || Number(system.cost) || 0),
    weight: Math.max(0, Number(system.listWeight) || Number(system.weight) || 0),
  };
}

/** The Size Modifier of whoever carries the gadget. */
function carrierSm(item: any): number {
  return Math.round(Number(item?.actor?.system?.sm) || 0);
}

/** The campaign's tech level, as the carrier's sheet states it. */
function campaignTl(item: any): number | null {
  const tl = Number(item?.actor?.system?.tl);
  return Number.isFinite(tl) && tl > 0 ? tl : null;
}

/** The gadget's own tech level, where the item states one. */
function itemTl(item: any): number | null {
  const raw = String(item?.system?.tl ?? "").trim();
  const match = /-?\d+/.exec(raw);
  return match ? Number(match[0]) : null;
}

/**
 * What the gadget costs and weighs once the options it was built with and the
 * size of its carrier are applied to the table's figures. Null where nothing
 * the module knows about changes them.
 */
export function gadgetPriceOf(item: any, data: GadgetItem, on: (key: string) => boolean = isRuleOn): { cost: number; weight: number; factor: number; size: number; table: GadgetTable } | null {
  if (!isGear(item)) return null;
  const tables = gadgetTables(item, on);
  const built = tables.options !== null && isBuilt(data);
  const size = tables.sm && data.adjustForSm ? smFactor(tables.sm.figures, carrierSm(item)) : 1;
  if (!built && size === 1) return null;
  const list = listOf(item);
  const priced = built
    ? gadgetPrice(tables.options!.figures, { listCost: list.cost, listWeight: list.weight, cellWeight: data.cellWeight, options: data.options })
    : { cost: list.cost, weight: list.weight, costFactor: 1 };
  return {
    cost: Math.round(priced.cost * size * 100) / 100,
    weight: Math.round(priced.weight * size * 100) / 100,
    factor: priced.costFactor,
    size,
    table: (tables.options ?? tables.sm)!,
  };
}

/** The statistics the book assumes for a gadget that states none. */
export function gadgetStatistics(api: GWorldApi, figures: GadgetFigures, item: any, data: GadgetItem, weight: number): { hp: number; ht: number; dr: number } {
  const own = item?.type === "armor" ? Number(item?.system?.dr) || null : null;
  return {
    hp: api.rules.objectHitPoints(Math.max(0, weight), "unliving"),
    ht: gadgetHealth(figures, { rugged: data.options.rugged, own: data.health || null }),
    dr: gadgetDr(figures, { build: data.build, rugged: data.options.rugged, own }),
  };
}

/** The item sheet section's data, in the words of the book whose table applies. */
function itemContext(api: GWorldApi, item: any): Record<string, unknown> {
  const tables = gadgetTables(item);
  const table = (tables.options ?? tables.sm ?? tables.legality)!;
  const ns = table.i18n;
  const data = gadgetItem(item);
  const priced = gadgetPriceOf(item, data);
  const weight = priced?.weight ?? listOf(item).weight;
  const statistics = gadgetStatistics(api, (tables.options ?? table).figures, item, data, weight);
  const tl = itemTl(item);
  const campaign = campaignTl(item);
  const lc = typeof item?.system?.lc === "number" ? Number(item.system.lc) : null;
  const antique = tables.legality ? antiqueLegality(tables.legality.figures, { lc, tl, campaignTl: campaign }) : { lc, steps: 0 };
  const cost = priced?.cost ?? listOf(item).cost;
  const threshold = campaign ? maintenanceThreshold(table.figures, campaign) : null;
  return {
    ns,
    data,
    options: tables.options !== null,
    sizeAdjusted: tables.sm !== null,
    legality: tables.legality !== null,
    disguises: DISGUISES.map((value) => ({ value, label: L(ns, `Disguise.${value || "none"}`), selected: data.options.disguise === value })),
    grades: GRADES.map((value) => ({ value, label: L(ns, `Grade.${value || "none"}`), selected: data.options.grade === value })),
    builds: BUILDS.map((value) => ({ value, label: L(ns, `Build.${value}`), selected: data.build === value })),
    priced: priced ? F(ns, "PricedAt", { cost: priced.cost, weight: priced.weight, factor: Math.round(costFactor(priced.table.figures, data.options) * 100) / 100 }) : "",
    sized: priced && priced.size !== 1 ? F(ns, "Sized", { sm: carrierSm(item), factor: priced.size < 1 ? `1/${Math.round(1 / priced.size)}` : String(priced.size) }) : "",
    statistics: F(ns, "Statistics", statistics),
    antique: antique.steps ? F(ns, "Antique", { lc: antique.lc, was: lc, campaign }) : "",
    maintenance: campaign && threshold !== null
      ? F(ns, needsMaintenanceChecks(table.figures, { cost, tl: campaign }) ? "Maintained" : "Simple", { threshold, campaign })
      : "",
  };
}

/** Writes what the sheet's fields change. */
function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-gadget]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccGadget);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "rugged" || field === "adjustForSm") await storeGadget(item, { [field]: Boolean(value) });
      else if (field === "styling") await storeGadget(item, { styling: Math.max(0, Math.min(10, Math.floor(Number(value) || 0))) });
      else if (field === "cellWeight") await storeGadget(item, { cellWeight: Math.max(0, Number(value) || 0) });
      else if (field === "health") await storeGadget(item, { health: Math.max(0, Math.floor(Number(value) || 0)) });
      else if (field === "disguise" || field === "grade" || field === "build") await storeGadget(item, { [field]: String(value) });
    });
  });
}

let readied = false;

/** Registers the table-side parts, once whichever books ask. */
export function readyGadgets(api: GWorldApi): void {
  if (readied) return;
  readied = true;

  // The options reprice the item; nothing is attached to it.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "gadget",
    types: ["equipment", "armor"],
    apply: (item) => {
      const priced = gadgetPriceOf(item, gadgetItem(item));
      return priced ? { cost: priced.cost, weight: priced.weight, label: L(priced.table.i18n, "Title") } : null;
    },
  });

  // A rugged gadget's HT bonus is what an equipment failure roll is made against.
  Hooks.on(api.combat.hooks.equipmentFailure, (context: any) => {
    if (!isGear(context?.item)) return;
    const table = gadgetTables(context.item).options;
    if (!table) return;
    if (gadgetItem(context.item).options.rugged) context.modifiers.push({ label: L(table.i18n, "Rugged"), value: table.figures.rugged.health });
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "gadget-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/gadget-item.hbs`,
    visible: (item) => {
      if (!isGear(item)) return false;
      const tables = gadgetTables(item);
      return Boolean(tables.options || tables.sm || tables.legality);
    },
    context: (item) => itemContext(api, item),
    listeners: (element, item) => itemListeners(element, item),
  });
}
