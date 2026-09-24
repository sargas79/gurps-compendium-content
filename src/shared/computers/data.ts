/**
 * What the computer engine keeps on a computer or a program, in this module's
 * own fields on the system's items, whichever book's table it takes.
 *
 * A computer is one of its book's models, named by its record or chosen, with
 * the options it was built with; a program is its Complexity, and which of the
 * character's computers it runs on.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../extensions.js";
import { MODULE_ID } from "../module.js";
import { modelByName, type ComputerFigures, type HardwareOptions, type SkillDifficulty } from "./rules.js";

const FIELD = "computer";

export const DIFFICULTIES: readonly SkillDifficulty[] = ["E", "A", "H", "VH"];

/** One book's computer table. */
export interface ComputerTable extends BookTable {
  figures: ComputerFigures;
  /** The full key of the book's switch for its computers. */
  rule: string;
  /** Where the book's text for the sheets sits: "GCC.UT" reads "GCC.UT.Computer.Title". */
  i18n: string;
  /** What else the book says a computer of a Complexity could hold, in its words: Ultra-Tech's AIs. */
  notes?: (complexity: number) => string;
  /** Whether an attack is one a hardened computer resists: the book's EMP and microwave weapons. */
  electricalAttack?: (item: any, modeIndex: number) => boolean;
  /**
   * Another set of figures the book prints for its computers -- a supplement's
   * eras and models -- behind a switch of its own, in its own words. While
   * that switch is on, the book's computers take these figures in place of
   * the table's, and the engine runs for the book's items even with the
   * table's own switch off.
   */
  variant?: { rule: string; figures: ComputerFigures; i18n: string };
}

/** Every book's computer table. */
export const COMPUTER_TABLES = new BookTables<ComputerTable>();

/**
 * A table as it stands with the switches: with its variant's figures and
 * words in place of its own while the variant's switch is on.
 */
export function withVariant(table: ComputerTable, on: (key: string) => boolean = isRuleOn): ComputerTable {
  const variant = table.variant;
  return variant && on(variant.rule) ? { ...table, figures: variant.figures, i18n: variant.i18n } : table;
}

/** The computer table whose rule applies to an item, where its book's switch (or its variant's) is on. */
export function computerTableOf(item: any, on: (key: string) => boolean = isRuleOn): ComputerTable | null {
  const table = COMPUTER_TABLES.forItem(item, (t) => on(t.rule) || Boolean(t.variant && on(t.variant.rule)));
  return table ? withVariant(table, on) : null;
}

/** Every set of figures any book's table holds, its variant's included. */
function allFigures(): ComputerFigures[] {
  return COMPUTER_TABLES.all.flatMap((t) => (t.variant ? [t.figures, t.variant.figures] : [t.figures]));
}

/** Every model any book's table lists. */
function allModels(): string[] {
  return [...new Set(allFigures().flatMap((f) => f.models))];
}

/** Every option any book's table lists. */
function allOptions(): string[] {
  return [...new Set(allFigures().flatMap((f) => f.options))];
}

export interface ComputerData {
  /** The model chosen; blank for the one the record's name is, or none. */
  model: string;
  options: HardwareOptions;
  /** Storage bought on top, in units of the computer's TL. */
  extraStorage: number;
  /** A program's Complexity; zero for an item that isn't one, or a Complexity 0 program. */
  complexity: number;
  /** Marks a program, which a book may rate at Complexity 0. */
  program: boolean;
  /** Mass-market software, at a fraction of the price. */
  massMarket: boolean;
  /** The id of the character's computer the program runs on. */
  runsOn: string;
  /** The difficulty of the skill a software tool is for. */
  difficulty: SkillDifficulty;
}

let registered = false;

/** Adds the computer fields to this module's data on equipment and armour, once whichever books ask. */
export function registerComputerData(): void {
  if (registered) return;
  registered = true;
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  // Built once every book has registered its table, so the field holds every book's models and options.
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: () => new f.SchemaField({
      model: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: () => ["", ...allModels()] }),
      options: new f.SchemaField(Object.fromEntries(allOptions().map((option) => [option, flag()]))),
      extraStorage: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      complexity: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 20 }),
      program: flag(),
      massMarket: flag(),
      runsOn: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      difficulty: new f.StringField({ required: true, nullable: false, blank: false, initial: "A", choices: [...DIFFICULTIES] }),
    }),
  });
}

/** This module's computer data on an item, with nothing missing. */
export function computerData(item: any): ComputerData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const options = Object.fromEntries(allOptions().map((option) => [option, Boolean(data.options?.[option])]));
  return {
    model: allModels().includes(data.model) ? data.model : "",
    options,
    extraStorage: Math.max(0, Number(data.extraStorage) || 0),
    complexity: Math.max(0, Math.floor(Number(data.complexity) || 0)),
    program: Boolean(data.program),
    massMarket: Boolean(data.massMarket),
    runsOn: String(data.runsOn ?? ""),
    difficulty: DIFFICULTIES.includes(data.difficulty) ? data.difficulty : "A",
  };
}

/** The model an item is in its table: the one chosen, or the one its name is. */
export function modelOf(item: any, table: ComputerTable | null, data: ComputerData = computerData(item)): string | null {
  if (item?.type !== "equipment" || !table) return null;
  if (data.model && table.figures.models.includes(data.model)) return data.model;
  return modelByName(table.figures, String(item?.name ?? ""));
}

/** Whether an item is a program. */
export function isProgram(item: any, table: ComputerTable | null, data: ComputerData = computerData(item)): boolean {
  return item?.type === "equipment" && (data.complexity > 0 || data.program) && !modelOf(item, table, data);
}

/** Writes part of the computer data on an item; `options.x` paths reach the options. */
export function storeComputer(item: any, patch: Record<string, unknown>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${FIELD}.${key}`, value])));
}
