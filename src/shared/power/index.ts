/**
 * The power cell engine, registered with the system through the add-on API,
 * for every book that prints the rule (Ultra-Tech pp. 18-20, 133; High-Tech's
 * batteries at its TLs).
 *
 * Each book registers its table in `CELL_TABLES` -- its figures, its switch
 * and its text -- then calls `initPower` and `readyPower`, which register once
 * however many books call them. What they register reads the item's own
 * book's table on every call:
 *
 *   - **init:** the power fields on equipment and armour, in the shape the
 *     books' records arrive with.
 *   - **ready:** a weapon's shots by the kind of cell loaded, through
 *     `gworld.shotsEntry`; a Gear tab section that tracks what is left of each
 *     gadget's endurance, with a control to spend it and a button to change
 *     the cells; and an item sheet section for the kind of cell, rigging the
 *     gadget to run on smaller ones, and what the cells do if they explode.
 */

import { MODULE_ID, type GWorldApi } from "../module.js";
import { CELL_TABLES, cellOf, cellTableOf, isPowered, powerData, registerPowerData, storePower, usesLeft, type CellTable, type PowerData } from "./data.js";
import {
  cellCost,
  cellLegality,
  enduranceHours,
  enduranceMultiplier,
  explodingCell,
  hoursText,
  replacementSeconds,
  shotsMultiplier,
  substituteCells,
} from "./rules.js";

export { CELL_TABLES, cellTableOf, type CellTable };

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Power.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Power.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Registers what must exist before the world's data is read. */
export function initPower(): void {
  registerPowerData();
}

function isGear(item: any): boolean {
  return item?.type === "equipment" || item?.type === "armor";
}

/** A carried gadget that runs on cells, with its book's cell table switched on. */
function tableIfPowered(item: any): CellTable | null {
  if (!isGear(item)) return null;
  const table = cellTableOf(item);
  return table && isPowered(powerData(item)) ? table : null;
}

/** The TL the cells were made at: their own where set, the gadget's otherwise. */
function cellTl(item: any, data: PowerData): number | null {
  if (data.tl) return data.tl;
  const match = /-?\d+/.exec(String(item?.system?.tl ?? ""));
  return match ? Number(match[0]) : null;
}

/** "2 C cells", "a 4-lb. power pack", as the book says it. */
function supplyText(ns: string, data: PowerData): string {
  const cell = cellOf(data);
  if (cell) {
    const one = cell.cells === 1;
    return F(ns, data.backpack ? (one ? "SupplyPack" : "SupplyPacks") : one ? "Supply" : "Supplies", { cells: cell.cells, size: cell.size });
  }
  if (data.packWeight) return F(ns, "SupplyWeight", { weight: data.packWeight });
  return data.raw;
}

/** Spends a use of a gadget counted in uses; false when none are left. */
export async function spendUse(item: any): Promise<boolean> {
  const data = powerData(item);
  const uses = usesLeft(data);
  if (!uses || data.cosmic) return true;
  if (uses.left <= 0) return false;
  await storePower(item, { usesUsed: data.usesUsed + 1 });
  return true;
}

/** What is left of a gadget's endurance, or null where it has none to track. */
export function enduranceLeft(data: PowerData): { total: number; left: number } | null | "unlimited" {
  const hours = enduranceHours(data.draw?.endurance);
  if (hours === null || !data.figures) return null;
  const multiplier = enduranceMultiplier(data.figures, data);
  if (multiplier === null) return "unlimited";
  const total = hours * multiplier * (data.enduranceFactor ?? 1);
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

/** Changes a gadget's cells: its endurance back to full, in the seconds the size takes. */
async function changeCells(item: any, table: CellTable): Promise<void> {
  const data = powerData(item);
  const cell = cellOf(data);
  await storePower(item, { hoursUsed: 0, usesUsed: 0 });
  const seconds = cell ? replacementSeconds(table.figures, cell.size) : null;
  const ns = table.i18n;
  await say(item.actor, item.name, [seconds ? F(ns, "Changed", { supply: supplyText(ns, data), seconds }) : F(ns, "ChangedNoTime", { supply: supplyText(ns, data) })]);
}

/**
 * Rigs a gadget to run on cells a size or more smaller: a skill roll and some
 * minutes of work, as the book says; a critical failure damages it.
 */
async function juryRig(api: GWorldApi, item: any, table: CellTable, smaller: string): Promise<void> {
  const actor = item.actor;
  const cell = cellOf(powerData(item));
  if (!actor || !cell) return;
  const ns = table.i18n;
  const rig = table.figures.juryRig;
  const perCell = substituteCells(table.figures, cell.size, smaller);
  if (!perCell) {
    ui.notifications?.warn(F(ns, "RigNotSmaller", { size: cell.size, smaller }));
    return;
  }
  const level = api.actors.skillLevel(actor, rig.skill);
  const base = level ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
  const result = await api.roll.success({
    actor,
    base,
    label: F(ns, "RigLabel", { name: item.name }),
    skill: rig.skill,
    modifiers: [{ label: L(ns, "RigPenalty"), value: rig.modifier }],
  } as any);
  if (!result) return;
  const needed = perCell * cell.cells;
  const outcome = result.criticalFailure ? "RigDamaged" : result.success ? "RigDone" : "RigFailed";
  await say(actor, item.name, [F(ns, outcome, { cells: needed, smaller, size: cell.size, minutes: rig.minutes })]);
}

/** The item sheet section's data, in the words of the book whose table applies. */
function itemContext(item: any, table: CellTable): Record<string, unknown> {
  const ns = table.i18n;
  const figures = table.figures;
  const data = powerData(item);
  const cell = cellOf(data);
  const tl = cellTl(item, data);
  const blast = cell && tl !== null ? explodingCell(figures, { size: cell.size, cells: cell.cells, tl, kind: data }) : null;
  const ranged = (item.system?.rangedModes ?? []).length > 0;
  const shots = shotsMultiplier(figures, data);
  const lc = cell ? cellLegality(figures, cell.size, data) : null;
  return {
    ns,
    data,
    supply: supplyText(ns, data),
    ranged,
    price: cell ? F(ns, "CellPrice", { size: cell.size, cost: cellCost(figures, cell.size, data), lc: lc === null ? L(ns, "NoLc") : `LC${lc}` }) : "",
    endurance: data.draw?.endurance ? F(ns, data.enduranceFactor !== 1 ? "EnduranceScaled" : "Endurance", { endurance: data.draw.endurance, factor: data.enduranceFactor }) : "",
    shots: ranged ? (shots === null ? L(ns, "ShotsUnlimited") : shots !== 1 ? F(ns, "ShotsTimes", { times: shots }) : "") : "",
    blast: blast ? F(ns, "Blast", { dice: blast.dice, ref: blast.ref, tl }) : "",
    smaller: cell ? figures.sizes.slice(0, figures.sizes.indexOf(cell.size)).reverse().map((size) => ({ size, cells: (substituteCells(figures, cell.size, size) ?? 0) * cell.cells })) : [],
  };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement>("[data-gcc-power]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccPower);
      if (field === "tl") await storePower(item, { tl: Math.max(0, Math.floor(Number(input.value) || 0)) });
      else await storePower(item, { [field]: input.checked });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-power-rig]").forEach((button) => {
    button.addEventListener("click", () => {
      const table = cellTableOf(item);
      if (table) void juryRig(api, item, table, String(button.dataset.gccPowerRig));
    });
  });
}

/** The carried gadgets that run on cells whose book's switch is on. */
function poweredGear(actor: any): Array<{ item: any; table: CellTable }> {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item.system?.carried !== false)
    .map((item: any) => ({ item, table: tableIfPowered(item) }))
    .filter((row): row is { item: any; table: CellTable } => row.table !== null);
}

/** The Gear tab section's data: every carried gadget that runs on cells. */
function gearContext(actor: any): Record<string, unknown> {
  const gear = poweredGear(actor);
  const rows = gear.map(({ item, table }) => {
    const ns = table.i18n;
    const data = powerData(item);
    const left = enduranceLeft(data);
    const weapon = (item.system?.rangedModes ?? []).length > 0;
    const ranged = (actor.system?.derived?.ranged ?? []).filter((row: any) => row.itemId === item.id && row.shotsCapacity > 0);
    let charge = "";
    let fraction: number | null = null;
    const uses = usesLeft(data);
    if (uses && !data.cosmic) {
      charge = F(ns, "UsesLeft", { left: uses.left, total: uses.total });
      fraction = uses.total ? uses.left / uses.total : 0;
    } else if (left === "unlimited" || data.cosmic) charge = L(ns, "Unlimited");
    else if (left) {
      const shown = hoursText(left.left);
      charge = F(ns, "Left", { value: shown.value, unit: L(ns, `Unit.${shown.unit}`), endurance: data.draw?.endurance ?? "" });
      fraction = left.total ? left.left / left.total : 0;
    } else if (ranged.length) {
      charge = ranged.map((row: any) => F(ns, "ShotsLeft", { loaded: row.shotsLoaded, capacity: row.shotsCapacity })).join(", ");
    }
    return {
      id: item.id,
      name: item.name,
      supply: supplyText(ns, data),
      charge,
      percent: fraction === null ? null : Math.round(fraction * 100),
      tracksHours: Boolean(left && left !== "unlimited") && !uses,
      tracksUses: Boolean(uses) && !data.cosmic,
      usesUsed: data.usesUsed,
      hoursUsed: Math.round(data.hoursUsed * 10) / 10,
      weapon,
      cosmic: data.cosmic,
    };
  });
  // The headings are the first listed gadget's book's.
  return { ns: gear[0]?.table.i18n ?? CELL_TABLES.all[0]?.i18n ?? "", rows };
}

function gearListeners(element: HTMLElement, actor: any): void {
  const itemOf = (el: HTMLElement) => actor.items.get(el.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? "");
  element.querySelectorAll<HTMLInputElement>("[data-gcc-power-used]").forEach((input) => {
    input.addEventListener("change", async () => {
      const item = itemOf(input);
      if (item) await storePower(item, { hoursUsed: Math.max(0, Number(input.value) || 0) });
    });
  });
  element.querySelectorAll<HTMLInputElement>("[data-gcc-power-uses]").forEach((input) => {
    input.addEventListener("change", async () => {
      const item = itemOf(input);
      if (item) await storePower(item, { usesUsed: Math.max(0, Math.floor(Number(input.value) || 0)) });
    });
  });
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-power-change]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = itemOf(button);
      const table = item ? cellTableOf(item) : null;
      if (item && table) await changeCells(item, table);
    });
  });
}

let readied = false;

/** Registers the table-side parts, once whichever books ask. */
export function readyPower(api: GWorldApi): void {
  if (readied) return;
  readied = true;

  // A weapon loaded with longer-lasting cells holds more shots than its table
  // line; one on a cell that never runs down keeps no count at all.
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    if (context.entry?.capacity === null) return;
    const table = tableIfPowered(context?.item);
    if (!table) return;
    const data = powerData(context.item);
    const multiplier = shotsMultiplier(table.figures, data);
    if (multiplier === null) {
      context.entry.capacity = null;
      return;
    }
    if (multiplier !== 1) context.entry.capacity = context.entry.capacity * multiplier;
    // A table line with no reload time takes the cell's.
    const cell = cellOf(data);
    if (context.entry.reloadSeconds === null && cell) context.entry.reloadSeconds = replacementSeconds(table.figures, cell.size);
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "power-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/power-item.hbs`,
    visible: (item) => tableIfPowered(item) !== null,
    context: (item) => itemContext(item, tableIfPowered(item)!),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "power-gear",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/power-gear.hbs`,
    visible: (actor) => poweredGear(actor).length > 0,
    context: (actor) => gearContext(actor),
    listeners: (element, actor) => gearListeners(element, actor),
  });
}
