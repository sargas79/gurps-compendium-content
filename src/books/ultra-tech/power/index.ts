/**
 * GURPS Ultra-Tech's power cells, registered with the system through the
 * add-on API (pp. 18-20, 133).
 *
 *   - **init:** the power fields on equipment and armour, in the shape the
 *     book's records arrive with.
 *   - **ready:** a weapon's shots by the kind of cell loaded, through
 *     `gworld.shotsEntry`; a Gear tab section that tracks what is left of each
 *     gadget's endurance, with a control to spend it and a button to change
 *     the cells; and an item sheet section for the kind of cell, rigging the
 *     gadget to run on smaller ones, and what the cells do if they explode.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { cellOf, isPowered, powerData, registerPowerData, storePower, type PowerData } from "./data.js";
import {
  CELL_SIZES,
  JURY_RIG,
  cellCost,
  cellLegality,
  enduranceHours,
  enduranceMultiplier,
  explodingCell,
  hoursText,
  replacementSeconds,
  shotsMultiplier,
  substituteCells,
  type CellSize,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Power.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Power.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Registers what must exist before the world's data is read. */
export function initPower(): void {
  registerPowerData();
}

function isGear(item: any): boolean {
  return item?.type === "equipment" || item?.type === "armor";
}

/** The TL the cells were made at: their own where set, the gadget's otherwise. */
function cellTl(item: any, data: PowerData): number | null {
  if (data.tl) return data.tl;
  const match = /-?\d+/.exec(String(item?.system?.tl ?? ""));
  return match ? Number(match[0]) : null;
}

/** "2 C cells", "a 4-lb. power pack", as the book says it. */
function supplyText(data: PowerData): string {
  const cell = cellOf(data);
  if (cell) {
    const one = cell.cells === 1;
    return F(data.backpack ? (one ? "SupplyPack" : "SupplyPacks") : one ? "Supply" : "Supplies", { cells: cell.cells, size: cell.size });
  }
  if (data.packWeight) return F("SupplyWeight", { weight: data.packWeight });
  return data.raw;
}

/** What is left of a gadget's endurance, or null where it has none to track. */
export function enduranceLeft(data: PowerData): { total: number; left: number } | null | "unlimited" {
  const hours = enduranceHours(data.draw?.endurance);
  if (hours === null) return null;
  const multiplier = enduranceMultiplier(data);
  if (multiplier === null) return "unlimited";
  const total = hours * multiplier;
  return { total, left: Math.max(0, total - data.hoursUsed) };
}

/** Posts a line to the chat as the actor. */
async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

/** Changes a gadget's cells: its endurance back to full, in the seconds the size takes (p. 19). */
async function changeCells(item: any): Promise<void> {
  const data = powerData(item);
  const cell = cellOf(data);
  await storePower(item, { hoursUsed: 0 });
  const seconds = cell ? replacementSeconds(cell.size) : null;
  await say(item.actor, item.name, [seconds ? F("Changed", { supply: supplyText(data), seconds }) : F("ChangedNoTime", { supply: supplyText(data) })]);
}

/**
 * Rigs a gadget to run on cells a size or more smaller (p. 19): an
 * Electrician-2 roll and ten minutes of work; a critical failure damages it.
 */
async function juryRig(api: GWorldApi, item: any, smaller: CellSize): Promise<void> {
  const actor = item.actor;
  const cell = cellOf(powerData(item));
  if (!actor || !cell) return;
  const perCell = substituteCells(cell.size, smaller);
  if (!perCell) {
    ui.notifications?.warn(F("RigNotSmaller", { size: cell.size, smaller }));
    return;
  }
  const level = api.actors.skillLevel(actor, JURY_RIG.skill);
  const base = level ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
  const result = await api.roll.success({
    actor,
    base,
    label: F("RigLabel", { name: item.name }),
    skill: JURY_RIG.skill,
    modifiers: [{ label: L("RigPenalty"), value: JURY_RIG.modifier }],
  } as any);
  if (!result) return;
  const needed = perCell * cell.cells;
  const outcome = result.criticalFailure ? "RigDamaged" : result.success ? "RigDone" : "RigFailed";
  await say(actor, item.name, [F(outcome, { cells: needed, smaller, size: cell.size, minutes: JURY_RIG.minutes })]);
}

/** The item sheet section's data. */
function itemContext(item: any): Record<string, unknown> {
  const data = powerData(item);
  const cell = cellOf(data);
  const tl = cellTl(item, data);
  const blast = cell && tl !== null ? explodingCell({ size: cell.size, cells: cell.cells, tl, kind: data }) : null;
  const ranged = (item.system?.rangedModes ?? []).length > 0;
  const shots = shotsMultiplier(data);
  const lc = cell ? cellLegality(cell.size, data) : null;
  return {
    data,
    supply: supplyText(data),
    ranged,
    price: cell ? F("CellPrice", { size: cell.size, cost: cellCost(cell.size, data), lc: lc === null ? L("NoLc") : `LC${lc}` }) : "",
    endurance: data.draw?.endurance ? F("Endurance", { endurance: data.draw.endurance }) : "",
    shots: ranged ? (shots === null ? L("ShotsUnlimited") : shots !== 1 ? F("ShotsTimes", { times: shots }) : "") : "",
    blast: blast ? F("Blast", { dice: blast.dice, ref: blast.ref, tl }) : "",
    smaller: cell ? CELL_SIZES.slice(0, CELL_SIZES.indexOf(cell.size)).reverse().map((size) => ({ size, cells: (substituteCells(cell.size, size) ?? 0) * cell.cells })) : [],
  };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ut-power]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtPower);
      if (field === "tl") await storePower(item, { tl: Math.max(0, Math.floor(Number(input.value) || 0)) });
      else await storePower(item, { [field]: input.checked });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-ut-rig]").forEach((button) => {
    button.addEventListener("click", () => juryRig(api, item, button.dataset.gccUtRig as CellSize));
  });
}

/** The Gear tab section's data: every carried gadget that runs on cells. */
function gearContext(actor: any): Record<string, unknown> {
  const rows = [...(actor?.items ?? [])]
    .filter((item: any) => isGear(item) && item.system?.carried !== false && isPowered(powerData(item)))
    .map((item: any) => {
      const data = powerData(item);
      const left = enduranceLeft(data);
      const weapon = (item.system?.rangedModes ?? []).length > 0;
      const ranged = (actor.system?.derived?.ranged ?? []).filter((row: any) => row.itemId === item.id && row.shotsCapacity > 0);
      let charge = "";
      let fraction: number | null = null;
      if (left === "unlimited" || data.cosmic) charge = L("Unlimited");
      else if (left) {
        const shown = hoursText(left.left);
        charge = F("Left", { value: shown.value, unit: L(`Unit.${shown.unit}`), endurance: data.draw?.endurance ?? "" });
        fraction = left.total ? left.left / left.total : 0;
      } else if (ranged.length) {
        charge = ranged.map((row: any) => F("ShotsLeft", { loaded: row.shotsLoaded, capacity: row.shotsCapacity })).join(", ");
      }
      return {
        id: item.id,
        name: item.name,
        supply: supplyText(data),
        charge,
        percent: fraction === null ? null : Math.round(fraction * 100),
        tracksHours: Boolean(left && left !== "unlimited"),
        hoursUsed: Math.round(data.hoursUsed * 10) / 10,
        weapon,
        cosmic: data.cosmic,
      };
    });
  return { rows };
}

function gearListeners(element: HTMLElement, actor: any): void {
  const itemOf = (el: HTMLElement) => actor.items.get(el.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? "");
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ut-used]").forEach((input) => {
    input.addEventListener("change", async () => {
      const item = itemOf(input);
      if (item) await storePower(item, { hoursUsed: Math.max(0, Number(input.value) || 0) });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-ut-change]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = itemOf(button);
      if (item) await changeCells(item);
    });
  });
}

/** Registers the table-side parts. */
export function readyPower(api: GWorldApi, on: () => boolean): void {
  // A weapon loaded with non-rechargeable or superscience cells holds more
  // shots than its table line; one on a cosmic cell keeps no count at all.
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    if (!on() || !isGear(context?.item) || context.entry?.capacity === null) return;
    const data = powerData(context.item);
    if (!isPowered(data)) return;
    const multiplier = shotsMultiplier(data);
    if (multiplier === null) {
      context.entry.capacity = null;
      return;
    }
    if (multiplier !== 1) context.entry.capacity = context.entry.capacity * multiplier;
    // A table line with no reload time takes the cell's (p. 19).
    const cell = cellOf(data);
    if (context.entry.reloadSeconds === null && cell) context.entry.reloadSeconds = replacementSeconds(cell.size);
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-power-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-power-item.hbs`,
    visible: (item) => on() && isGear(item) && isPowered(powerData(item)),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-power-gear",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ut-power-gear.hbs`,
    visible: (actor) => on() && [...(actor?.items ?? [])].some((item: any) => isGear(item) && item.system?.carried !== false && isPowered(powerData(item))),
    context: (actor) => gearContext(actor),
    listeners: (element, actor) => gearListeners(element, actor),
  });
}
