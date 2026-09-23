/**
 * What powers a piece of gear, kept in this module's own fields on the
 * system's items, whichever book's cell table prices it.
 *
 * A book's records arrive with the cell their table line gives -- its size,
 * how many, whether it is worn as a pack, and the draw and endurance where the
 * line prints one -- written by the extraction step in `tools/lib/power-cells.mjs`.
 * This schema holds that shape as it is, so an imported record keeps it, and
 * adds what the table leaves to the owner: the kind of cell loaded, its TL,
 * and how much of its endurance has been used; and, for a book that allows
 * them, cells of another size swapped in, a power adapter or inverter, and
 * whether the gadget is running on external power.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID } from "../module.js";
import { enduranceUses as enduranceUsesOf, swappedEndurance, type CellFigures, type CellKind } from "./rules.js";

/** One book's cell table. */
export interface CellTable extends BookTable {
  figures: CellFigures;
  /** The full key of the book's switch for its cells. */
  rule: string;
  /** Where the book's text for the sheets sits: "GCC.UT" reads "GCC.UT.Power.Title". */
  i18n: string;
}

/** Every book's cell table. */
export const CELL_TABLES = new BookTables<CellTable>();

/** The cell table whose rule applies to an item, where its book's switch is on. */
export function cellTableOf(item: any, on: (key: string) => boolean = isRuleOn): CellTable | null {
  return CELL_TABLES.forItem(item, (t) => on(t.rule));
}

/** Every size any book's table lists. */
function allSizes(): string[] {
  return [...new Set(CELL_TABLES.all.flatMap((t) => t.figures.sizes))];
}

/** What this module keeps on a powered item. */
export interface PowerData extends Required<CellKind> {
  /** The cell the table gives, or null where it gives a pack's weight or nothing. */
  cell: string | null;
  cells: number;
  backpack: boolean;
  /** A power pack's weight in pounds, where the table prints one instead of a cell. */
  packWeight: number;
  emptyWeight: number;
  raw: string;
  /** The draw and endurance the table prints, where it prints one. */
  draw: { cell: string | null; cells: number; endurance: string; raw: string } | null;
  /** The cells' own TL, where it isn't the gadget's; zero for the gadget's. */
  tl: number;
  /** Hours of the endurance used since the cells were last changed. */
  hoursUsed: number;
  /** Uses spent since the cells were last changed, for an endurance counted in uses. */
  usesUsed: number;
  /** What another rule multiplies the endurance by: a compact computer's half (Ultra-Tech p. 23). */
  enduranceFactor: number;
  /** The figures of the book whose cells these are, or null where no book has registered a table. */
  figures: CellFigures | null;
  /** Cells of another size or number swapped in for the table's, where the book allows it; their weight scales the endurance. */
  swap: { cell: string; cells: number } | null;
  /** A power adapter, so a gadget built for cells can run on external power. */
  adapter: boolean;
  /** An inverter, so a gadget built for external power runs on cells. */
  inverter: boolean;
  /** Whether a gadget with an adapter or inverter is plugged into external power right now. */
  external: boolean;
}

/** A rule that scales a gadget's cells and endurance, such as a compact computer's (Ultra-Tech p. 23). */
export type PowerAdjuster = (item: any) => { cells?: number; endurance?: number } | null;
const adjusters: PowerAdjuster[] = [];

/** Registers a rule that scales a gadget's cells and endurance. */
export function registerPowerAdjuster(adjuster: PowerAdjuster): void {
  adjusters.push(adjuster);
}

/** The product of every registered rule's factors for an item. */
function adjustment(item: any): { cells: number; endurance: number } {
  let cells = 1;
  let endurance = 1;
  for (const adjuster of adjusters) {
    const factors = adjuster(item);
    if (!factors) continue;
    if (Number.isFinite(factors.cells)) cells *= Number(factors.cells);
    if (Number.isFinite(factors.endurance)) endurance *= Number(factors.endurance);
  }
  return { cells, endurance };
}

/** A cell count scaled, never below one cell where there were any. */
const scaled = (count: number, factor: number) => (count > 0 ? Math.max(1, Math.ceil(count * factor)) : 0);

let registered = false;

/** Adds the power fields to this module's data on equipment and armour, once whichever books ask. */
export function registerPowerData(): void {
  if (registered) return;
  registered = true;
  const f = foundry.data.fields as any;
  // Read when a value is checked, so a book that registers its table later still has its sizes allowed.
  const size = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: () => ["", ...allSizes()] });
  const count = () => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 });
  const amount = () => new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
  const text = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "" });
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    power: new f.SchemaField({
      cell: size(),
      cells: count(),
      backpack: flag(),
      packWeight: amount(),
      emptyWeight: amount(),
      raw: text(),
      draw: new f.SchemaField({ cell: size(), cells: count(), endurance: text(), raw: text() }),
      flexible: flag(),
      nonRechargeable: flag(),
      cosmic: flag(),
      superscience: flag(),
      tl: count(),
      hoursUsed: amount(),
      usesUsed: count(),
      rechargeable: flag(),
      swapCell: size(),
      swapCells: count(),
      adapter: flag(),
      inverter: flag(),
      external: flag(),
    }),
  });
}

/** This module's power data on an item, with nothing missing. */
export function powerData(item: any): PowerData {
  const d = item?.system?.extensions?.[MODULE_ID]?.power ?? {};
  const draw = d.draw ?? {};
  const figures = CELL_TABLES.figuresFor(item, (t) => isRuleOn(t.rule))?.figures ?? null;
  const isSize = (value: unknown): value is string => typeof value === "string" && Boolean(figures?.sizes.includes(value));
  const drawCell = isSize(draw.cell) ? draw.cell : null;
  const factor = adjustment(item);
  const cell = isSize(d.cell) ? d.cell : null;
  const cells = scaled(Math.max(0, Math.floor(Number(d.cells) || 0)), factor.cells);
  const drawCells = scaled(Math.max(0, Math.floor(Number(draw.cells) || 0)), factor.cells);
  // Cells swapped in for the table's, where the book allows it: the endurance goes with their weight.
  const table = cell ? { size: cell, cells: Math.max(1, cells) } : drawCell ? { size: drawCell, cells: Math.max(1, drawCells) } : null;
  const swapCells = Math.max(0, Math.floor(Number(d.swapCells) || 0));
  const swapRatio = figures?.swapByWeight && table && isSize(d.swapCell) && swapCells > 0
    ? swappedEndurance(figures, table, { size: d.swapCell, cells: swapCells })
    : null;
  const swap = swapRatio !== null ? { cell: String(d.swapCell), cells: swapCells } : null;
  return {
    cell,
    cells,
    backpack: Boolean(d.backpack),
    packWeight: Math.max(0, Number(d.packWeight) || 0),
    emptyWeight: Math.max(0, Number(d.emptyWeight) || 0),
    raw: String(d.raw ?? ""),
    draw: drawCell || String(draw.endurance ?? "").trim()
      ? { cell: drawCell, cells: drawCells, endurance: String(draw.endurance ?? ""), raw: String(draw.raw ?? "") }
      : null,
    flexible: Boolean(d.flexible),
    nonRechargeable: Boolean(d.nonRechargeable),
    cosmic: Boolean(d.cosmic),
    superscience: Boolean(d.superscience),
    tl: Math.max(0, Math.floor(Number(d.tl) || 0)),
    hoursUsed: Math.max(0, Number(d.hoursUsed) || 0),
    usesUsed: Math.max(0, Math.floor(Number(d.usesUsed) || 0)),
    enduranceFactor: factor.endurance * (swapRatio ?? 1),
    figures,
    rechargeable: Boolean(d.rechargeable),
    swap,
    adapter: Boolean(figures?.adapters && d.adapter),
    inverter: Boolean(figures?.adapters && d.inverter),
    external: Boolean(figures?.adapters && (d.adapter || d.inverter) && d.external),
  };
}

/**
 * Whether the item runs on power the module knows about. An item with no cell
 * data -- the system's own beam weapons among them -- is unpowered until the
 * field is filled in.
 */
export function isPowered(data: PowerData): boolean {
  return Boolean(data.cell || data.packWeight || data.draw?.cell);
}

/** The cells the item runs on: any swapped in, else the table's cell, or the draw's where only that says. */
export function cellOf(data: PowerData): { size: string; cells: number } | null {
  if (data.swap) return { size: data.swap.cell, cells: data.swap.cells };
  return tableCellOf(data);
}

/** The cells the item's table gives, whatever is swapped in. */
export function tableCellOf(data: PowerData): { size: string; cells: number } | null {
  if (data.cell) return { size: data.cell, cells: Math.max(1, data.cells) };
  if (data.draw?.cell) return { size: data.draw.cell, cells: Math.max(1, data.draw.cells) };
  return null;
}

/** Writes part of this module's power data. */
export function storePower(item: any, patch: Partial<Record<keyof PowerData, unknown>>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.power.${key}`, value])));
}

/** Uses left for a gadget whose endurance is counted in uses, or null. */
export function usesLeft(data: PowerData): { total: number; left: number } | null {
  const total = enduranceUsesOf(data.draw?.endurance);
  return total === null ? null : { total, left: Math.max(0, total - data.usesUsed) };
}
