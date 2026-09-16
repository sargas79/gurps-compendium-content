/**
 * GURPS Ultra-Tech's gadgets, registered with the system through the add-on
 * API (pp. 14-17).
 *
 *   - **init:** this book's fields on equipment and armour.
 *   - **ready:** the price modifier for the options a gadget was built with
 *     and for the size of the character carrying it; the +2 a rugged gadget
 *     has on equipment failure; and an item sheet section that holds the
 *     options and shows the statistics, the price, the antique's Legality
 *     Class and whether the gadget is worth maintaining.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { BUILDS, DISGUISES, GRADES, isBuilt, registerUltraTechData, storeUltraTech, ultraTechItem, type UltraTechItem } from "./data.js";
import {
  RUGGED,
  antiqueLegality,
  costFactor,
  gadgetDr,
  gadgetHealth,
  gadgetPrice,
  maintenanceThreshold,
  needsMaintenanceChecks,
  smFactor,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.${key}`, data);

/** Whether the switches this book's gadget rules sit behind are on. */
export interface GadgetSwitches {
  options: () => boolean;
  sm: () => boolean;
  legality: () => boolean;
}

/** Registers what must exist before the world's data is read. */
export function initGadgets(): void {
  registerUltraTechData();
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
export function ultraTechPrice(item: any, data: UltraTechItem, on: GadgetSwitches): { cost: number; weight: number; factor: number; size: number } | null {
  if (!isGear(item)) return null;
  const built = on.options() && isBuilt(data);
  const size = on.sm() && data.adjustForSm ? smFactor(carrierSm(item)) : 1;
  if (!built && size === 1) return null;
  const list = listOf(item);
  const priced = built
    ? gadgetPrice({ listCost: list.cost, listWeight: list.weight, cellWeight: data.cellWeight, options: data.options })
    : { cost: list.cost, weight: list.weight, costFactor: 1 };
  return {
    cost: Math.round(priced.cost * size * 100) / 100,
    weight: Math.round(priced.weight * size * 100) / 100,
    factor: priced.costFactor,
    size,
  };
}

/** The statistics the book assumes for a gadget that states none (p. 17). */
export function ultraTechStatistics(api: GWorldApi, item: any, data: UltraTechItem, weight: number): { hp: number; ht: number; dr: number } {
  const own = item?.type === "armor" ? Number(item?.system?.dr) || null : null;
  return {
    hp: api.rules.objectHitPoints(Math.max(0, weight), "unliving"),
    ht: gadgetHealth({ rugged: data.options.rugged, own: data.health || null }),
    dr: gadgetDr({ build: data.build, rugged: data.options.rugged, own }),
  };
}

/** The item sheet section's data. */
function itemContext(api: GWorldApi, item: any, on: GadgetSwitches): Record<string, unknown> {
  const data = ultraTechItem(item);
  const priced = ultraTechPrice(item, data, on);
  const weight = priced?.weight ?? listOf(item).weight;
  const statistics = ultraTechStatistics(api, item, data, weight);
  const tl = itemTl(item);
  const campaign = campaignTl(item);
  const lc = typeof item?.system?.lc === "number" ? Number(item.system.lc) : null;
  const antique = on.legality() ? antiqueLegality({ lc, tl, campaignTl: campaign }) : { lc, steps: 0 };
  const cost = priced?.cost ?? listOf(item).cost;
  return {
    data,
    options: on.options(),
    sizeAdjusted: on.sm(),
    legality: on.legality(),
    disguises: DISGUISES.map((value) => ({ value, label: L(`Gadget.Disguise.${value || "none"}`), selected: data.options.disguise === value })),
    grades: GRADES.map((value) => ({ value, label: L(`Gadget.Grade.${value || "none"}`), selected: data.options.grade === value })),
    builds: BUILDS.map((value) => ({ value, label: L(`Gadget.Build.${value}`), selected: data.build === value })),
    priced: priced ? F("Gadget.PricedAt", { cost: priced.cost, weight: priced.weight, factor: Math.round(costFactor(data.options) * 100) / 100 }) : "",
    sized: priced && priced.size !== 1 ? F("Gadget.Sized", { sm: carrierSm(item), factor: priced.size < 1 ? `1/${Math.round(1 / priced.size)}` : String(priced.size) }) : "",
    statistics: F("Gadget.Statistics", statistics),
    antique: antique.steps ? F("Gadget.Antique", { lc: antique.lc, was: lc, campaign }) : "",
    maintenance: campaign
      ? F(needsMaintenanceChecks({ cost, tl: campaign }) ? "Gadget.Maintained" : "Gadget.Simple", { threshold: maintenanceThreshold(campaign), campaign })
      : "",
  };
}

/** Writes what the sheet's fields change. */
function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUt);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "rugged" || field === "adjustForSm") await storeUltraTech(item, { [field]: Boolean(value) });
      else if (field === "styling") await storeUltraTech(item, { styling: Math.max(0, Math.min(10, Math.floor(Number(value) || 0))) });
      else if (field === "cellWeight") await storeUltraTech(item, { cellWeight: Math.max(0, Number(value) || 0) });
      else if (field === "health") await storeUltraTech(item, { health: Math.max(0, Math.floor(Number(value) || 0)) });
      else if (field === "disguise" || field === "grade" || field === "build") await storeUltraTech(item, { [field]: String(value) });
    });
  });
}

/** Registers the table-side parts. */
export function readyGadgets(api: GWorldApi, on: GadgetSwitches): void {
  // The options reprice the item; nothing is attached to it (pp. 15-16).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-gadget",
    types: ["equipment", "armor"],
    apply: (item) => {
      const priced = ultraTechPrice(item, ultraTechItem(item), on);
      return priced ? { cost: priced.cost, weight: priced.weight, label: L("Gadget.Title") } : null;
    },
  });

  // "A rugged gadget gets a +2 HT bonus" (p. 15), which is what an equipment
  // failure roll is made against.
  Hooks.on(api.combat.hooks.equipmentFailure, (context: any) => {
    if (!on.options() || !isGear(context?.item)) return;
    if (ultraTechItem(context.item).options.rugged) context.modifiers.push({ label: L("Gadget.Rugged"), value: RUGGED.health });
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-gadget-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-gadget-item.hbs`,
    visible: (item) => (on.options() || on.sm() || on.legality()) && isGear(item),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });
}
