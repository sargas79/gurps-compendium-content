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
 *
 * A book's figures say which of the parts it prints: Ultra-Tech's rigging to
 * smaller cells and exploding cells; High-Tech's rechargeable batteries,
 * swapping a gadget's batteries for another size with its endurance in
 * proportion to their weight, and power adapters and inverters (pp. 13-14).
 * `powerPriceChange` is what those last two do to the gadget's price and
 * weight, for a book to register as a price modifier.
 */

import { isProgram } from "../computers/data.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { CELL_TABLES, cellOf, cellTableOf, isPluggable, isPowered, powerData, registerPowerData, storePower, tableCellOf, usesLeft, type CellTable, type PowerData } from "./data.js";
import {
  cellCost,
  cellLegality,
  cellsWeight,
  enduranceHours,
  enduranceMultiplier,
  explodingCell,
  hasCellRef,
  hoursText,
  replacementSeconds,
  shotsMultiplier,
  substituteCells,
} from "./rules.js";

export { CELL_TABLES, cellTableOf, type CellTable };

/**
 * A new cell's price: the size's, times its chemistry's factor where a rule
 * gives it one (in place of the book's rechargeable multiplier), else by the
 * kind of cell the book prices.
 */
export function cellPrice(figures: CellTable["figures"], size: string, data: PowerData): number {
  if (data.variant) return Math.round(figures.cells[size]!.cost * data.variant.cost * 100) / 100;
  return cellCost(figures, size, data);
}

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

/**
 * A program, which runs on a computer and draws no power of its own: one the
 * computer engine marks as a program, or a weightless record named as
 * software or a program, as the catalogue lists them (High-Tech pp. 22, 211).
 */
function isSoftware(item: any): boolean {
  if (isProgram(item, null)) return true;
  return !(Number(item?.system?.weight) > 0) && /\b(software|program)\b/i.test(String(item?.name ?? ""));
}

/**
 * Gear with no cells that an inverter could run on them: equipment that isn't
 * a weapon or a program, from a book whose table has inverters, with its
 * switch on.
 */
export function tableForInverter(item: any): CellTable | null {
  if (item?.type !== "equipment" || (item.system?.rangedModes ?? []).length || (item.system?.meleeModes ?? []).length || isSoftware(item)) return null;
  const table = cellTableOf(item);
  return table?.figures.adapters && !isPowered(powerData(item)) ? table : null;
}

/**
 * What a book's adapters, inverters and swapped cells do to a gadget's price
 * and weight (High-Tech pp. 10, 13-14), or null where they do nothing. A
 * gadget's price leaves its cells out and its weight includes them (High-Tech
 * pp. 10-11), so:
 *   - cells swapped in change the weight by the difference between the new
 *     cells' weight and the old;
 *   - a power adapter costs and weighs what the usual cells do;
 *   - an inverter costs and weighs what the cells it runs on do, and the
 *     gadget, listed with none, now carries those cells too.
 */
export function powerPriceChange(item: any): { cost: number; weight: number } | null {
  if (!isGear(item) || !cellTableOf(item)) return null;
  const data = powerData(item);
  const figures = data.figures;
  const loaded = cellOf(data);
  const usual = tableCellOf(data);
  if (!figures || !loaded || !usual) return null;
  let cost = 0;
  let weight = 0;
  if (data.inverter) {
    cost += figures.cells[loaded.size]!.cost * loaded.cells;
    weight += 2 * cellsWeight(figures, loaded.size, loaded.cells);
  } else {
    if (data.swap) weight += cellsWeight(figures, loaded.size, loaded.cells) - cellsWeight(figures, usual.size, usual.cells);
    if (data.adapter) {
      cost += figures.cells[usual.size]!.cost * usual.cells;
      weight += cellsWeight(figures, usual.size, usual.cells);
    }
  }
  // Cells of another chemistry weigh their own: the gadget's weight includes them.
  if (data.variant && data.variant.weight !== 1) weight += cellsWeight(figures, loaded.size, loaded.cells) * (data.variant.weight - 1);
  return cost || weight ? { cost, weight: Math.round(weight * 1000) / 1000 } : null;
}

/** The TL the cells were made at: their own where set, the gadget's otherwise. */
function cellTl(item: any, data: PowerData): number | null {
  if (data.tl) return data.tl;
  const match = /-?\d+/.exec(String(item?.system?.tl ?? ""));
  return match ? Number(match[0]) : null;
}

/** "2 C cells", "a 4-lb. power pack", as the book says it, with the cells' chemistry where a rule gives them one. */
function supplyText(ns: string, data: PowerData): string {
  const cell = cellOf(data);
  if (cell) {
    const one = cell.cells === 1;
    const text = F(ns, data.backpack ? (one ? "SupplyPack" : "SupplyPacks") : one ? "Supply" : "Supplies", { cells: cell.cells, size: cell.size });
    return data.variant ? `${text} (${game.i18n.localize(data.variant.label)})` : text;
  }
  if (data.packWeight) return F(ns, "SupplyWeight", { weight: data.packWeight });
  if (data.builtIn) return L(ns, "BuiltIn");
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
  // Plugged into external power through an adapter or inverter, it runs as long as that lasts (High-Tech p. 14).
  if (data.external) return "unlimited";
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

/**
 * Changes a gadget's cells: its endurance back to full, in the seconds the
 * size takes. Where the book sells its cells as throwaways, new ones cost
 * their price, and rechargeable ones are recharged instead (High-Tech p. 13).
 */
async function changeCells(item: any, table: CellTable): Promise<void> {
  const data = powerData(item);
  const cell = cellOf(data);
  await storePower(item, { hoursUsed: 0, usesUsed: 0 });
  const seconds = cell ? replacementSeconds(table.figures, cell.size) : null;
  const ns = table.i18n;
  const lines = [seconds ? F(ns, "Changed", { supply: supplyText(ns, data), seconds }) : F(ns, "ChangedNoTime", { supply: supplyText(ns, data) })];
  // Built-in batteries are recharged where they sit, never changed.
  if (data.builtIn) lines[0] = F(ns, "Recharged", { supply: supplyText(ns, data) });
  else if (table.figures.rechargeable && cell) {
    if (data.rechargeable) lines[0] = F(ns, "Recharged", { supply: supplyText(ns, data) });
    else {
      const spares = await useSpares(item.actor, table.figures.spareRecord, cell);
      lines.push(spares ? F(ns, "SparesUsed", { cells: cell.cells, name: spares.name, left: spares.left }) : F(ns, "NewCellsCost", { cost: Math.round(cellPrice(table.figures, cell.size, data) * cell.cells * 100) / 100 }));
    }
  }
  await say(item.actor, item.name, lines);
}

/**
 * Takes the new cells from the spares the actor carries, where the book has
 * a record for them and there are enough: what was used, or null.
 */
async function useSpares(actor: any, record: string | undefined, cell: { size: string; cells: number }): Promise<{ name: string; left: number } | null> {
  if (!actor || !record) return null;
  const name = record.replace("{size}", cell.size);
  const spare = [...(actor.items ?? [])].find((i: any) => i.name === name && i.system?.carried !== false && (Number(i.system?.quantity) || 0) >= cell.cells);
  if (!spare) return null;
  const left = (Number(spare.system.quantity) || 0) - cell.cells;
  await spare.update({ "system.quantity": left });
  return { name, left };
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
  if (!rig) return;
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
  if (!result || "refused" in result) return;
  const needed = perCell * cell.cells;
  const outcome = result.criticalFailure ? "RigDamaged" : result.success ? "RigDone" : "RigFailed";
  await say(actor, item.name, [F(ns, outcome, { cells: needed, smaller, size: cell.size, minutes: rig.minutes })]);
}

/** The sizes a gadget may swap to: every size, or from the smallest an inverter takes. */
function swapSizes(figures: CellTable["figures"], data: PowerData): readonly string[] {
  const min = data.inverter && figures.adapters ? figures.sizes.indexOf(figures.adapters.inverterMin) : 0;
  return figures.sizes.slice(Math.max(0, min));
}

/** The item sheet section's data, in the words of the book whose table applies. */
function itemContext(item: any, table: CellTable): Record<string, unknown> {
  const ns = table.i18n;
  const figures = table.figures;
  const data = powerData(item);
  const cell = cellOf(data);
  const usual = tableCellOf(data);
  const tl = cellTl(item, data);
  const blast = cell && tl !== null && hasCellRef(figures) ? explodingCell(figures, { size: cell.size, cells: cell.cells, tl, kind: data }) : null;
  const ranged = (item.system?.rangedModes ?? []).length > 0;
  const shots = shotsMultiplier(figures, data);
  const lc = cell ? cellLegality(figures, cell.size, data) : null;
  const kinds = Object.fromEntries(figures.kinds.map((kind) => [kind, kind !== "superscience" || ranged]));
  const swap = figures.swapByWeight && usual
    ? {
      sizes: swapSizes(figures, data).map((size) => ({ size, selected: size === (data.swap?.cell ?? usual.size) })),
      cells: data.swap?.cells ?? usual.cells,
      usual: F(ns, usual.cells === 1 ? "Supply" : "Supplies", { cells: usual.cells, size: usual.size }),
    }
    : null;
  return {
    ns,
    data,
    supply: supplyText(ns, data),
    ranged,
    kinds,
    price: cell ? F(ns, "CellPrice", { size: cell.size, cost: cellPrice(figures, cell.size, data), lc: lc === null ? L(ns, "NoLc") : `LC${lc}` }) : "",
    endurance: data.draw?.endurance ? F(ns, data.enduranceFactor !== 1 ? "EnduranceScaled" : "Endurance", { endurance: data.draw.endurance, factor: Math.round(data.enduranceFactor * 100) / 100 }) : "",
    shots: ranged ? (shots === null ? L(ns, "ShotsUnlimited") : shots !== 1 ? F(ns, "ShotsTimes", { times: shots }) : "") : "",
    blast: blast ? F(ns, "Blast", { dice: blast.dice, ref: blast.ref, tl }) : "",
    tlField: hasCellRef(figures),
    smaller: cell && figures.juryRig ? figures.sizes.slice(0, figures.sizes.indexOf(cell.size)).reverse().map((size) => ({ size, cells: (substituteCells(figures, cell.size, size) ?? 0) * cell.cells })) : [],
    swap,
    adapters: Boolean(figures.adapters),
    inverterEndurance: data.inverter ? (data.draw?.endurance ?? "") : null,
  };
}

/** The item sheet section for gear an inverter could run on cells. */
function inverterContext(table: CellTable): Record<string, unknown> {
  return { ns: table.i18n, inverterOnly: true, min: table.figures.adapters?.inverterMin ?? "" };
}

/** Fits or takes out an inverter: it runs on the smallest cell it takes, for an endurance the GM sets. */
async function setInverter(item: any, fitted: boolean, figures: CellTable["figures"]): Promise<void> {
  const min = figures.adapters?.inverterMin ?? "";
  if (fitted) await storePower(item, { inverter: true, cell: min, cells: 1, swapCell: "", swapCells: 0, hoursUsed: 0 } as any);
  else await storePower(item, { inverter: false, external: false, cell: "", cells: 0, swapCell: "", swapCells: 0, hoursUsed: 0, draw: { cell: "", cells: 0, endurance: "", raw: "" } } as any);
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement>("[data-gcc-power]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccPower);
      const table = cellTableOf(item);
      if (field === "tl") await storePower(item, { tl: Math.max(0, Math.floor(Number(input.value) || 0)) });
      else if (field === "inverter" && table) await setInverter(item, input.checked, table.figures);
      else await storePower(item, { [field]: input.checked });
    });
  });
  // Cells of another size or number: back to the table's own when they match it.
  const swapSize = element.querySelector<HTMLSelectElement>("[data-gcc-power-swap]");
  const swapCount = element.querySelector<HTMLInputElement>("[data-gcc-power-swap-cells]");
  const storeSwap = async () => {
    const usual = tableCellOf(powerData(item));
    const size = String(swapSize?.value ?? "");
    const cells = Math.max(1, Math.floor(Number(swapCount?.value) || 1));
    const same = !usual || (size === usual.size && cells === usual.cells);
    await storePower(item, same ? { swapCell: "", swapCells: 0 } : { swapCell: size, swapCells: cells } as any);
  };
  swapSize?.addEventListener("change", storeSwap);
  swapCount?.addEventListener("change", storeSwap);
  element.querySelector<HTMLInputElement>("[data-gcc-power-endurance]")?.addEventListener("change", async (event) => {
    const value = String((event.target as HTMLInputElement).value ?? "").trim();
    await item.update({ [`system.extensions.${MODULE_ID}.power.draw.endurance`]: value });
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

/**
 * The carried gadgets whose cells can be recharged, with what is left of each
 * and what its cells weigh: what a generator or recharger can top up.
 */
export function rechargeableGear(actor: any): Array<{ item: any; total: number; left: number; weight: number; size: string; cells: number }> {
  return poweredGear(actor).flatMap(({ item, table }) => {
    const data = powerData(item);
    const cell = cellOf(data);
    const left = enduranceLeft(data);
    if (!table.figures.rechargeable || !data.rechargeable || !cell || !left || left === "unlimited") return [];
    const weight = cellsWeight(table.figures, cell.size, cell.cells) * (data.variant?.weight ?? 1);
    return [{ item, total: left.total, left: left.left, weight: Math.round(weight * 1000) / 1000, size: cell.size, cells: cell.cells }];
  });
}

/** Gives a gadget back hours of its endurance, to full; the hours it got back. */
export async function recharge(item: any, hours: number): Promise<number> {
  const data = powerData(item);
  const back = Math.min(data.hoursUsed, Math.max(0, Number(hours) || 0));
  if (back > 0) await storePower(item, { hoursUsed: Math.round((data.hoursUsed - back) * 1000) / 1000 });
  return back;
}

/**
 * The Gear tab section's data: every carried gadget that runs on cells, in a
 * card for each book whose table they take, headed in that book's words
 * ("Batteries", "Power cells"), in the order the gadgets are listed.
 */
export function powerGearContext(actor: any): Record<string, unknown> {
  const gear = poweredGear(actor);
  const rows = gear.map(({ item, table }) => {
    const ns = table.i18n;
    const data = powerData(item);
    const left = enduranceLeft(data);
    const weapon = (item.system?.rangedModes ?? []).length > 0;
    const pluggable = isPluggable(item, data);
    const ranged = (actor.system?.derived?.ranged ?? []).filter((row: any) => row.itemId === item.id && row.shotsCapacity > 0);
    let charge = "";
    let fraction: number | null = null;
    const uses = usesLeft(data);
    if (data.external) charge = L(ns, "OnExternal");
    else if (uses && !data.cosmic) {
      charge = uses.unit === "uses"
        ? F(ns, "UsesLeft", { left: uses.left, total: uses.total })
        : F(ns, "CountLeft", { left: uses.left, total: uses.total, unit: L(ns, `Counted.${uses.unit}`) });
      fraction = uses.total ? uses.left / uses.total : 0;
    } else if (left === "unlimited" || data.cosmic) charge = L(ns, "Unlimited");
    else if (left) {
      const shown = hoursText(left.left);
      // Swapped cells, or cells of another chemistry, last their own time, not the table's.
      const whole = data.swap || data.variant ? hoursText(left.total) : null;
      charge = F(ns, "Left", { value: shown.value, unit: L(ns, `Unit.${shown.unit}`), endurance: whole ? `${whole.value} ${L(ns, `Unit.${whole.unit}`)}` : (data.draw?.endurance ?? "") });
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
      tracksUses: Boolean(uses) && !data.cosmic && !data.external,
      pluggable,
      external: data.external,
      recharge: Boolean(table.figures.rechargeable && data.rechargeable),
      usesUsed: data.usesUsed,
      hoursUsed: Math.round(data.hoursUsed * 10) / 10,
      weapon,
      cosmic: data.cosmic,
      ns,
    };
  });
  const groups: Array<{ ns: string; rows: typeof rows }> = [];
  for (const row of rows) {
    const group = groups.find((g) => g.ns === row.ns);
    if (group) group.rows.push(row);
    else groups.push({ ns: row.ns, rows: [row] });
  }
  return { groups };
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
  element.querySelectorAll<HTMLInputElement>("[data-gcc-power-external]").forEach((input) => {
    input.addEventListener("change", async () => {
      const item = itemOf(input);
      if (item) await storePower(item, { external: input.checked });
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
    // A table line with no reload time takes the cell's, where the book gives one.
    const cell = cellOf(data);
    const seconds = cell ? replacementSeconds(table.figures, cell.size) : null;
    if (context.entry.reloadSeconds === null && seconds !== null) context.entry.reloadSeconds = seconds;
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "power-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/power-item.hbs`,
    visible: (item) => tableIfPowered(item) !== null || tableForInverter(item) !== null,
    context: (item) => {
      const powered = tableIfPowered(item);
      return powered ? itemContext(item, powered) : inverterContext(tableForInverter(item)!);
    },
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
    context: (actor) => powerGearContext(actor),
    listeners: (element, actor) => gearListeners(element, actor),
  });
}
