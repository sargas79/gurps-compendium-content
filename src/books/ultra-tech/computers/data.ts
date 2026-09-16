/**
 * What Ultra-Tech keeps on a computer or a program (pp. 21-25), in this
 * module's own fields on the system's items.
 *
 * A computer is one of the book's models, named by its record or chosen, with
 * the options it was built with; a program is its Complexity, and which of the
 * character's computers it runs on.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID } from "../../../shared/module.js";
import { COMPUTER_MODELS, HARDWARE_OPTIONS, NO_HARDWARE, modelByName, type ComputerModel, type HardwareOptions, type SkillDifficulty } from "./rules.js";

const FIELD = "computer";

export const DIFFICULTIES: readonly SkillDifficulty[] = ["E", "A", "H", "VH"];

export interface ComputerData {
  /** The model chosen; blank for the one the record's name is, or none. */
  model: ComputerModel | "";
  options: HardwareOptions;
  /** Storage bought on top, in units of the computer's TL. */
  extraStorage: number;
  /** A program's Complexity; zero for an item that isn't one. */
  complexity: number;
  /** Mass-market software, at a tenth the price (p. 24). */
  massMarket: boolean;
  /** The id of the character's computer the program runs on. */
  runsOn: string;
  /** The difficulty of the skill a software tool is for (p. 25). */
  difficulty: SkillDifficulty;
}

/** Adds the computer fields to this module's data on equipment and armour. */
export function registerComputerData(): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      model: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...COMPUTER_MODELS] }),
      options: new f.SchemaField(Object.fromEntries(HARDWARE_OPTIONS.map((option) => [option, flag()]))),
      extraStorage: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      complexity: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 20 }),
      massMarket: flag(),
      runsOn: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      difficulty: new f.StringField({ required: true, nullable: false, blank: false, initial: "A", choices: [...DIFFICULTIES] }),
    }),
  });
}

/** This module's computer data on an item, with nothing missing. */
export function computerData(item: any): ComputerData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const options = Object.fromEntries(HARDWARE_OPTIONS.map((option) => [option, Boolean(data.options?.[option])])) as unknown as HardwareOptions;
  return {
    model: COMPUTER_MODELS.includes(data.model) ? data.model : "",
    options: { ...NO_HARDWARE, ...options },
    extraStorage: Math.max(0, Number(data.extraStorage) || 0),
    complexity: Math.max(0, Math.floor(Number(data.complexity) || 0)),
    massMarket: Boolean(data.massMarket),
    runsOn: String(data.runsOn ?? ""),
    difficulty: DIFFICULTIES.includes(data.difficulty) ? data.difficulty : "A",
  };
}

/** The model an item is: the one chosen, or the one its name is. */
export function modelOf(item: any, data: ComputerData = computerData(item)): ComputerModel | null {
  if (item?.type !== "equipment") return null;
  return data.model || modelByName(String(item?.name ?? ""));
}

/** Whether an item is a program. */
export function isProgram(item: any, data: ComputerData = computerData(item)): boolean {
  return item?.type === "equipment" && data.complexity > 0 && !modelOf(item, data);
}

/** Writes part of the computer data on an item; `options.x` paths reach the options. */
export function storeComputer(item: any, patch: Record<string, unknown>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${FIELD}.${key}`, value])));
}
