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
 *
 * A book that prints more about its power keeps it here too: the chemistry
 * of the cells (a name its own table reads), the grades of external power a
 * device runs on as printed, and what an energy store is -- a capacitor, a
 * flywheel -- with its size, material, count and shock. The engine reads the
 * chemistry only through a registered cell variant (`registerCellVariant`),
 * and the grades and built-in rechargeable batteries only under the switch a
 * book's table names for them (`CellTable.externalRule`).
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID } from "../module.js";
import { cellsWeight, enduranceHours, enduranceUnit, enduranceUses as enduranceUsesOf, isCellSizeOf, swappedEndurance, type CellFigures, type CellKind, type CountedUnit } from "./rules.js";

/** One book's cell table. */
export interface CellTable extends BookTable {
  figures: CellFigures;
  /** The full key of the book's switch for its cells. */
  rule: string;
  /** Where the book's text for the sheets sits: "GCC.UT" reads "GCC.UT.Power.Title". */
  i18n: string;
  /**
   * The full key of the switch under which a device's printed grades of
   * external power let it be plugged in without an adapter, and its built-in
   * rechargeable batteries (an endurance with no cell) are tracked; none for
   * a book that prints neither.
   */
  externalRule?: string;
  /**
   * The grade a book's own statistics print for gear that runs on external
   * power, which its cell switch alone lets be plugged in: High-Tech's
   * "external power" (p. 14), kept as the grade "external". None for a book
   * that prints none.
   */
  ownGrade?: string;
  /**
   * The chemistry a gadget's or a spare's cells of a size are, the one the
   * book's table prints where none is chosen, for matching spares to a
   * gadget; none for a book whose cells have no chemistries.
   */
  chemistryOf?: (item: any, size: string) => string;
}

/**
 * Cells of another chemistry than the book's table prices: what they
 * multiply the endurance, the price of a new cell and the cells' weight by,
 * against the size's own figures, and whether they are recharged. The price
 * factor stands in for the book's own multiplier for rechargeable cells.
 */
export interface CellVariant {
  /** A text key, formatted with `labelData` where it names more than the kind. */
  label: string;
  labelData?: Record<string, unknown>;
  endurance: number;
  cost: number;
  weight: number;
  rechargeable: boolean;
  /**
   * Hours the gadget runs on them whatever its own endurance, for a store
   * that gives a larger battery's output for a fixed time (a supercapacitor,
   * HT:EE p. 18); none for cells that scale the endurance.
   */
  fixedHours?: number;
}

/** A rule that says what chemistry an item's cells are, or null for the table's own. */
export type CellVariantResolver = (item: any, cell: { size: string; cells: number } | null, figures: CellFigures) => CellVariant | null;
const variantResolvers: CellVariantResolver[] = [];

/** Registers a rule that gives an item's cells another chemistry than its table's. */
export function registerCellVariant(resolver: CellVariantResolver): void {
  variantResolvers.push(resolver);
}

/** The first registered variant that speaks for an item's cells. */
function variantOf(item: any, cell: { size: string; cells: number } | null, figures: CellFigures | null): CellVariant | null {
  if (!figures) return null;
  for (const resolve of variantResolvers) {
    const variant = resolve(item, cell, figures);
    if (variant) return variant;
  }
  return null;
}

/** Whether the switch for an item's printed grades of external power and built-in batteries is on. */
function externalOn(item: any): boolean {
  const table = CELL_TABLES.figuresFor(item, (t) => isRuleOn(t.rule));
  return Boolean(table?.externalRule && isRuleOn(table.externalRule));
}

/**
 * Whether gear printed with grades of external power can be plugged in as
 * printed: any grade under the switch for them, and the book's own grade
 * under its cell switch alone.
 */
function gradesPlug(item: any, grades: readonly string[]): boolean {
  if (!grades.length) return false;
  if (externalOn(item)) return true;
  const table = CELL_TABLES.figuresFor(item, (t) => isRuleOn(t.rule));
  return Boolean(table?.ownGrade && grades.includes(table.ownGrade));
}

/** What an energy store is, where the record is one. */
export interface StorageData {
  /** "capacitor", "flywheel", or "" for none. */
  kind: string;
  /** The cell size it is rated as, where the book rates it so. */
  size: string;
  /** What it is made of, as the book's table names it; "" for the figures printed. */
  material: string;
  /** How many are wired together, for a bank of capacitors. */
  count: number;
  /** The HT modifier to the shock a fully charged one gives; 0 for none. */
  shock: number;
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
  /** Whether a gadget with an adapter or inverter, or printed with a grade of external power, is plugged in right now. */
  external: boolean;
  /**
   * The id of the carried item it is plugged into -- a generator, a store --
   * where one is named; "" for external power from nowhere in particular.
   */
  source: string;
  /** What the batteries swapped in multiply the endurance by, against the table's own; 1 for none. */
  swapRatio: number;
  /** The chemistry of the cells, as the book's table names it; "" for the table's own. */
  chemistry: string;
  /** The chemistry a registered rule gives the cells, or null for the table's own. */
  variant: CellVariant | null;
  /** The grades of external power the device runs on, as printed. */
  grades: string[];
  /** Built-in rechargeable batteries: an endurance with no cell, tracked where the book's switch for them is on. */
  builtIn: boolean;
  storage: StorageData;
}

/**
 * A rule that scales a gadget's cells and endurance, such as a compact
 * computer's (Ultra-Tech p. 23), or says the gadget as built runs on no power
 * at all (`unpowered`), as a crystal radio set does (HT:EE p. 28).
 */
export type PowerAdjuster = (item: any) => { cells?: number; endurance?: number; unpowered?: boolean } | null;
const adjusters: PowerAdjuster[] = [];

/** Registers a rule that scales a gadget's cells and endurance. */
export function registerPowerAdjuster(adjuster: PowerAdjuster): void {
  adjusters.push(adjuster);
}

/** The product of every registered rule's factors for an item. */
function adjustment(item: any): { cells: number; endurance: number; unpowered: boolean } {
  let cells = 1;
  let endurance = 1;
  let unpowered = false;
  for (const adjuster of adjusters) {
    const factors = adjuster(item);
    if (!factors) continue;
    if (Number.isFinite(factors.cells)) cells *= Number(factors.cells);
    if (Number.isFinite(factors.endurance)) endurance *= Number(factors.endurance);
    if (factors.unpowered === true) unpowered = true;
  }
  return { cells, endurance, unpowered };
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
      source: text(),
      chemistry: text(),
      grades: new f.ArrayField(text()),
      storage: new f.SchemaField({
        kind: text(),
        size: text(),
        material: text(),
        count: new f.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1 }),
        shock: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),
    }),
  });
}

/** This module's power data on an item, with nothing missing. */
export function powerData(item: any): PowerData {
  const d = item?.system?.extensions?.[MODULE_ID]?.power ?? {};
  const draw = d.draw ?? {};
  const figures = CELL_TABLES.figuresFor(item, (t) => isRuleOn(t.rule))?.figures ?? null;
  const isSize = (value: unknown): value is string => figures !== null && isCellSizeOf(figures, value);
  const factor = adjustment(item);
  // A gadget a rule says runs on nothing keeps no cells to change or count down.
  const drawCell = !factor.unpowered && isSize(draw.cell) ? draw.cell : null;
  const cell = !factor.unpowered && isSize(d.cell) ? d.cell : null;
  const cells = scaled(Math.max(0, Math.floor(Number(d.cells) || 0)), factor.cells);
  const drawCells = scaled(Math.max(0, Math.floor(Number(draw.cells) || 0)), factor.cells);
  // Cells swapped in for the table's, where the book allows it: the endurance goes with their weight.
  const table = cell ? { size: cell, cells: Math.max(1, cells) } : drawCell ? { size: drawCell, cells: Math.max(1, drawCells) } : null;
  const swapCells = Math.max(0, Math.floor(Number(d.swapCells) || 0));
  const swapRatio = figures?.swapByWeight && table && isSize(d.swapCell) && swapCells > 0
    ? swappedEndurance(figures, table, { size: d.swapCell, cells: swapCells })
    : null;
  const swap = swapRatio !== null ? { cell: String(d.swapCell), cells: swapCells } : null;
  const loaded = swap ? { size: swap.cell, cells: swap.cells } : table;
  const variant = variantOf(item, loaded, figures);
  const grades = Array.isArray(d.grades) ? d.grades.map((g: unknown) => String(g ?? "").trim()).filter(Boolean) : [];
  const external = externalOn(item);
  const endurance = String(draw.endurance ?? "");
  const builtIn = !factor.unpowered && external && Boolean(d.rechargeable) && !cell && !drawCell && (enduranceHours(endurance) !== null || enduranceUsesOf(endurance) !== null);
  const pluggable = Boolean(figures?.adapters && (d.adapter || d.inverter)) || gradesPlug(item, grades);
  const s = d.storage ?? {};
  return {
    cell,
    cells,
    backpack: Boolean(d.backpack),
    packWeight: factor.unpowered ? 0 : Math.max(0, Number(d.packWeight) || 0),
    emptyWeight: Math.max(0, Number(d.emptyWeight) || 0),
    raw: String(d.raw ?? ""),
    draw: !factor.unpowered && (drawCell || String(draw.endurance ?? "").trim())
      ? { cell: drawCell, cells: drawCells, endurance: String(draw.endurance ?? ""), raw: String(draw.raw ?? "") }
      : null,
    flexible: Boolean(d.flexible),
    nonRechargeable: Boolean(d.nonRechargeable),
    cosmic: Boolean(d.cosmic),
    superscience: Boolean(d.superscience),
    tl: Math.max(0, Math.floor(Number(d.tl) || 0)),
    hoursUsed: Math.max(0, Number(d.hoursUsed) || 0),
    usesUsed: Math.max(0, Math.floor(Number(d.usesUsed) || 0)),
    enduranceFactor: factor.endurance * (swapRatio ?? 1) * (variant?.endurance ?? 1),
    figures,
    rechargeable: variant ? variant.rechargeable : Boolean(d.rechargeable),
    swap,
    adapter: Boolean(figures?.adapters && d.adapter),
    inverter: Boolean(figures?.adapters && d.inverter),
    external: pluggable && Boolean(d.external),
    source: pluggable && d.external ? String(d.source ?? "") : "",
    swapRatio: swapRatio ?? 1,
    chemistry: String(d.chemistry ?? ""),
    variant,
    grades,
    builtIn,
    storage: {
      kind: String(s.kind ?? ""),
      size: String(s.size ?? ""),
      material: String(s.material ?? ""),
      count: Math.max(1, Math.floor(Number(s.count) || 1)),
      shock: Math.floor(Number(s.shock) || 0),
    },
  };
}

/** Whether a gadget can be plugged into external power: through an adapter or inverter, or as printed. */
export function isPluggable(item: any, data: PowerData = powerData(item)): boolean {
  return data.adapter || data.inverter || gradesPlug(item, data.grades);
}

/**
 * Whether the item runs on power the module knows about. An item with no cell
 * data -- the system's own beam weapons among them -- is unpowered until the
 * field is filled in.
 */
export function isPowered(data: PowerData): boolean {
  return Boolean(data.cell || data.packWeight || data.draw?.cell || data.builtIn);
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

/**
 * What the batteries a gadget's record lists weigh, as the list weight counts
 * them: the table's cells, before any size adjustment or swap. Null where the
 * item's book's cell switch is off or the record lists none (an inverter's
 * batteries are added to the gadget, not listed in it).
 */
export function listedCellWeight(item: any): number | null {
  const table = cellTableOf(item);
  const d = item?.system?.extensions?.[MODULE_ID]?.power ?? {};
  if (!table || d.inverter) return null;
  const sizes = table.figures.sizes;
  const count = (value: unknown) => Math.max(1, Math.floor(Number(value) || 0));
  if (sizes.includes(d.cell)) return cellsWeight(table.figures, d.cell, count(d.cells));
  if (sizes.includes(d.draw?.cell)) return cellsWeight(table.figures, d.draw.cell, count(d.draw.cells));
  return null;
}

/**
 * What the batteries in a gadget weigh as it is now: any swapped in, as many
 * as its size takes, in their chemistry's weight. Null where the cell switch
 * is off or it has none.
 */
export function loadedCellWeight(item: any): number | null {
  const table = cellTableOf(item);
  const data = table ? powerData(item) : null;
  const cell = data ? cellOf(data) : null;
  if (!table || !data || !cell) return null;
  return Math.round(cellsWeight(table.figures, cell.size, cell.cells) * (data.variant?.weight ?? 1) * 1000) / 1000;
}

/** Writes part of this module's power data. */
export function storePower(item: any, patch: Partial<Record<keyof PowerData, unknown>>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.power.${key}`, value])));
}

/** Uses left for a gadget whose endurance is counted in uses (or tests, readings, quarts), and what it counts; or null. */
export function usesLeft(data: PowerData): { total: number; left: number; unit: CountedUnit } | null {
  const total = enduranceUsesOf(data.draw?.endurance);
  return total === null ? null : { total, left: Math.max(0, total - data.usesUsed), unit: enduranceUnit(data.draw?.endurance) ?? "uses" };
}
