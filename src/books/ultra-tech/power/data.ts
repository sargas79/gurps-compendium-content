/**
 * What powers a piece of gear (pp. 18-20), kept in this module's own fields on
 * the system's items.
 *
 * The book's records arrive with the cell their table line gives -- its size,
 * how many, whether it is worn as a pack, and the draw and endurance where the
 * line prints one -- written by the extraction step in `tools/lib/power-cells.mjs`.
 * This schema holds that shape as it is, so an imported record keeps it, and
 * adds what the table leaves to the owner: the kind of cell loaded, its TL,
 * and how much of its endurance has been used.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CELL_SIZES, enduranceUses as enduranceUsesOf, isCellSize, type CellKind, type CellSize } from "./rules.js";

/** What this module keeps on a powered item. */
export interface PowerData extends Required<CellKind> {
  /** The cell the table gives, or null where it gives a pack's weight or nothing. */
  cell: CellSize | null;
  cells: number;
  backpack: boolean;
  /** A power pack's weight in pounds, where the table prints one instead of a cell. */
  packWeight: number;
  emptyWeight: number;
  raw: string;
  /** The draw and endurance the table prints, where it prints one. */
  draw: { cell: CellSize | null; cells: number; endurance: string; raw: string } | null;
  /** The cells' own TL, where it isn't the gadget's; zero for the gadget's. */
  tl: number;
  /** Hours of the endurance used since the cells were last changed. */
  hoursUsed: number;
  /** Uses spent since the cells were last changed, for an endurance counted in uses. */
  usesUsed: number;
  /** What another rule multiplies the endurance by: a compact computer's half (p. 23). */
  enduranceFactor: number;
}

/** A rule that scales a gadget's cells and endurance, such as a compact computer's (p. 23). */
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

/** Adds the power fields to this module's data on equipment and armour. */
export function registerPowerData(): void {
  const f = foundry.data.fields as any;
  const size = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...CELL_SIZES] });
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
    }),
  });
}

/** This module's power data on an item, with nothing missing. */
export function powerData(item: any): PowerData {
  const d = item?.system?.extensions?.[MODULE_ID]?.power ?? {};
  const draw = d.draw ?? {};
  const drawCell = isCellSize(draw.cell) ? draw.cell : null;
  const factor = adjustment(item);
  return {
    cell: isCellSize(d.cell) ? d.cell : null,
    cells: scaled(Math.max(0, Math.floor(Number(d.cells) || 0)), factor.cells),
    backpack: Boolean(d.backpack),
    packWeight: Math.max(0, Number(d.packWeight) || 0),
    emptyWeight: Math.max(0, Number(d.emptyWeight) || 0),
    raw: String(d.raw ?? ""),
    draw: drawCell || String(draw.endurance ?? "").trim()
      ? { cell: drawCell, cells: scaled(Math.max(0, Math.floor(Number(draw.cells) || 0)), factor.cells), endurance: String(draw.endurance ?? ""), raw: String(draw.raw ?? "") }
      : null,
    flexible: Boolean(d.flexible),
    nonRechargeable: Boolean(d.nonRechargeable),
    cosmic: Boolean(d.cosmic),
    superscience: Boolean(d.superscience),
    tl: Math.max(0, Math.floor(Number(d.tl) || 0)),
    hoursUsed: Math.max(0, Number(d.hoursUsed) || 0),
    usesUsed: Math.max(0, Math.floor(Number(d.usesUsed) || 0)),
    enduranceFactor: factor.endurance,
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

/** The cell the item takes: the table's cell, or the draw's where only that says. */
export function cellOf(data: PowerData): { size: CellSize; cells: number } | null {
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
