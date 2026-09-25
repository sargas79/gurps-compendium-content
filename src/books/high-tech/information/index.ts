/**
 * High-Tech's computers, books and libraries (pp. 17-22), registered with the
 * system through the add-on API.
 *
 *   - **computerSystems:** the book's table for the shared computer engine
 *     (`src/shared/computers/`), which does the pricing, the item sheet
 *     section and the Gear tab section: the TL8 models, the options, the
 *     early technologies of a TL6-7 computer, and software priced from the
 *     Program Cost Table. Here too, a worn head-up display's +1 to Driving
 *     and Piloting (p. 21), and on a roll made with a High-Tech computer or
 *     program (the item the system names for it, API 1.95.0) the -2 for each
 *     of an unfamiliar operating system, computer type and program, under
 *     the system's familiarity rule, and the terminal's penalty (pp. 20-21).
 *   - **booksAndLibraries:** a manual or reference work, marked on its item
 *     sheet with the skill it covers, that a row button follows: the skill
 *     at its attribute default, with a time-spent bonus that can at most win
 *     the penalty back (p. 17); and a library, whose grade makes it Research
 *     equipment (the record's own grade), costs a hundred times as much for an
 *     occult subject, and at the GM's option lends a good or fine library's
 *     bonus to the skill it covers (p. 18).
 */

import { bookOf } from "../../../shared/book-tables.js";
import { COMPUTER_TABLES, computerTableOf, initComputers, readyComputers, type ComputerTable } from "../../../shared/computers/index.js";
import { DIFFICULTIES, computerData, isProgram, modelOf } from "../../../shared/computers/data.js";
import type { SkillDifficulty } from "../../../shared/computers/rules.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import { ERA_COMPUTERS, INTERFACES, LANGUAGES, TOUCH_SIZES, type InterfaceSetup, type Language } from "../computing/rules.js";
import {
  COMPUTERS,
  HUD_BONUS,
  LIBRARY_RESEARCH,
  MANUAL_DEFAULT,
  OCCULT_LIBRARY_COST,
  TERMINALS,
  TERMINAL_PENALTY,
  TIME_MULTIPLES,
  computerUseLines,
  hudHelps,
  isHud,
  libraryGrade,
  manualRoll,
  type ComputerUse,
  type LibraryGrade,
  type Terminal,
} from "./rules.js";

const FIELD = "htReference";
/** What this module keeps on a High-Tech computer: its operating system and terminal (pp. 20-21). */
const COMPUTER_FIELD = "htComputer";
const ATTRIBUTES = ["IQ", "DX", "HT", "ST", "Will", "Per"] as const;

const L = (key: string) => game.i18n.localize(`GCC.HT.Books.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Books.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const C = (key: string) => game.i18n.localize(`GCC.HT.ComputerUse.${key}`);
const CF = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.ComputerUse.${key}`, data);

/**
 * High-Tech's computer table, behind the book's own switch (its full key),
 * with the Electricity and Electronics supplement's eras and models behind
 * theirs (HT:EE pp. 36-37).
 */
export function highTechComputers(rule: string, erasRule?: string): ComputerTable {
  return {
    book: "high-tech",
    tls: { min: 0, max: 8 },
    figures: COMPUTERS,
    rule,
    i18n: "GCC.HT",
    ...(erasRule ? { variant: { rule: erasRule, figures: ERA_COMPUTERS, i18n: "GCC.HT.Eras" } } : {}),
  };
}

/** What this module keeps on a manual or a library. */
export interface ReferenceData {
  /** A manual or reference work, followed while doing a task. */
  manual: boolean;
  /** The skill the manual or library covers. */
  skill: string;
  attribute: (typeof ATTRIBUTES)[number];
  difficulty: SkillDifficulty;
  /** A library for magical research, Hidden Lore and the like. */
  occult: boolean;
  /** The GM lets the library's bonus extend to the skill itself. */
  extendsToSkill: boolean;
}

/** Registers the table, the engine, and the reference fields. */
export function initInformation(computerRule: string, erasRule?: string): void {
  COMPUTER_TABLES.register(highTechComputers(computerRule, erasRule));
  initComputers();
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      manual: flag(),
      skill: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      attribute: new f.StringField({ required: true, nullable: false, blank: false, initial: "IQ", choices: [...ATTRIBUTES] }),
      difficulty: new f.StringField({ required: true, nullable: false, blank: false, initial: "A", choices: [...DIFFICULTIES] }),
      occult: flag(),
      extendsToSkill: flag(),
    }),
    [COMPUTER_FIELD]: new f.SchemaField({
      operatingSystem: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      terminal: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...TERMINALS] }),
      // The supplement's: the interface it is worked through (HT:EE pp. 39-41),
      // how it is programmed (p. 38), and a burned-out tube (p. 37).
      interface: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...INTERFACES] }),
      touch: new f.StringField({ required: true, nullable: false, blank: false, initial: "desktop", choices: [...TOUCH_SIZES] }),
      multitouch: new f.BooleanField({ initial: true }),
      voiceTrained: flag(),
      earlyTouch: flag(),
      wiredGloves: flag(),
      language: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...LANGUAGES] }),
      burntOut: flag(),
    }),
  });
}

/** What this module keeps on a High-Tech computer. */
export interface ComputerSetup extends InterfaceSetup {
  operatingSystem: string;
  terminal: Terminal;
  language: Language;
  burntOut: boolean;
}

/** A High-Tech computer's operating system, terminal, interface and language, with nothing missing. */
export function computerSetup(item: any): ComputerSetup {
  const data = item?.system?.extensions?.[MODULE_ID]?.[COMPUTER_FIELD] ?? {};
  const among = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => ((list as readonly unknown[]).includes(value) ? (value as T) : fallback);
  return {
    operatingSystem: String(data.operatingSystem ?? "").trim(),
    terminal: among(TERMINALS, data.terminal, ""),
    interface: among(INTERFACES, data.interface, ""),
    touch: among(TOUCH_SIZES, data.touch, "desktop"),
    multitouch: data.multitouch !== false,
    voiceTrained: Boolean(data.voiceTrained),
    earlyTouch: Boolean(data.earlyTouch),
    wiredGloves: Boolean(data.wiredGloves),
    language: among(LANGUAGES, data.language, ""),
    burntOut: Boolean(data.burntOut),
  };
}

/** Writes part of what this module keeps on a High-Tech computer. */
export function storeSetup(item: any, patch: Partial<ComputerSetup>): Promise<unknown> {
  return item.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${MODULE_ID}.${COMPUTER_FIELD}.${key}`, value])));
}

/** A High-Tech computer, where the item is one and the switch is on. */
function highTechComputer(item: any): boolean {
  const table = computerTableOf(item);
  return table?.book === "high-tech" && Boolean(modelOf(item, table));
}

/**
 * What a roll made with this item is made with, as the familiarity rule
 * reads it: a High-Tech computer, or a High-Tech program and the computer it
 * runs on. The computer type goes by the computer's name, as the system's
 * familiarities go by names. Null for anything else.
 */
export function computerUseOf(item: any): ComputerUse | null {
  const table = computerTableOf(item);
  if (table?.book !== "high-tech" || item?.type !== "equipment") return null;
  const program = isProgram(item, table) ? item : null;
  const computer = program ? (item.actor?.items?.get?.(computerData(item).runsOn) ?? null) : modelOf(item, table) ? item : null;
  if (!program && !computer) return null;
  const known = computer && highTechComputer(computer) ? computer : null;
  const setup = computerSetup(known);
  return {
    program: program ? String(program.name ?? "") : null,
    computerType: known ? String(known.name ?? "") : null,
    operatingSystem: setup.operatingSystem || null,
    terminal: setup.terminal,
  };
}

/** The key each line goes by on the roll: `ht.computerType` and so on, for a rule that changes one. */
export const lineKey = (key: string) => `ht.${key}`;

/** The lines a roll with a High-Tech computer or program takes, labelled. */
export function computerRollLines(api: GWorldApi, actor: any, item: any): Array<{ key: string; label: string; value: number }> {
  const use = computerUseOf(item);
  if (!use) return [];
  // The familiarity rule is the system's, and a character without a list (an NPC) takes none of it.
  const list = actor?.system?.familiarities;
  const familiar = api.registry.isRuleOn("familiarity") && Array.isArray(list) ? (name: string) => api.rules.isFamiliar(list.map(String), name) : null;
  return computerUseLines(use, familiar).map((line) => ({
    key: lineKey(line.key),
    label: line.key === "terminal" ? CF("TerminalLine", { terminal: C(`Terminal.${line.name}`) }) : CF(`Unfamiliar.${line.key}`, { name: line.name }),
    value: line.value,
  }));
}

/** This module's reference data on an item, with nothing missing. */
export function referenceData(item: any): ReferenceData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    manual: Boolean(data.manual),
    skill: String(data.skill ?? "").trim(),
    attribute: ATTRIBUTES.includes(data.attribute) ? data.attribute : "IQ",
    difficulty: DIFFICULTIES.includes(data.difficulty) ? data.difficulty : "A",
    occult: Boolean(data.occult),
    extendsToSkill: Boolean(data.extendsToSkill),
  };
}

/** Whether an item is this book's, or one that names no other book. */
const ownOrUnbooked = (item: any) => {
  const book = bookOf(item);
  return book === null || book === "high-tech";
};

/** A library's grade, for equipment whose name is one. */
export function libraryOf(item: any): LibraryGrade | null {
  return item?.type === "equipment" && ownOrUnbooked(item) ? libraryGrade(String(item?.name ?? "")) : null;
}

/** A manual carried: marked, with the skill it covers named. */
export function isManual(item: any): boolean {
  if (item?.type !== "equipment" || item.system?.carried === false) return false;
  const data = referenceData(item);
  return data.manual && Boolean(data.skill);
}

/** A computer or a program, which is no reference work. */
function isComputing(item: any): boolean {
  const table = computerTableOf(item) ?? COMPUTER_TABLES.forBook("high-tech");
  return Boolean(modelOf(item, table)) || isProgram(item, table);
}

/** The skill named, compared as the sheet names it: "Electronics Repair/TL8 (Computers)" is "electronics repair (computers)". */
const skillKey = (name: string) => String(name ?? "").toLowerCase().replace(/\/tl\s*\d*/g, "").replace(/\s+/g, " ").trim();

/** Follows a manual: asks for the time taken, then rolls the skill at its attribute default (p. 17). */
async function followManual(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = referenceData(item);
  const attribute = Number(api.actors.attribute(actor, data.attribute)) || 10;
  const own = api.actors.skillLevel(actor, data.skill);
  const atDefault = attribute + MANUAL_DEFAULT[data.difficulty];
  if (own !== null && own >= atDefault) {
    ui.notifications?.info(F("OwnBetter", { name: actor.name, skill: data.skill, level: own }));
    return;
  }
  const options = TIME_MULTIPLES.map((times) => `<option value="${times}">${esc(F("Times", { times, bonus: signed(timeSpentModifier(times, 1)) }))}</option>`).join("");
  const times = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("FollowTitle", { name: item.name }) },
    content: `<div class="gworld" style="display:grid;gap:6px">
      <p class="ihint">${esc(F("FollowHint", { skill: data.skill, attribute: data.attribute, penalty: MANUAL_DEFAULT[data.difficulty] }))}</p>
      <label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(L("TimeTaken"))}</span><select name="times">${options}</select></label>
    </div>`,
    ok: {
      label: L("Roll"),
      callback: (_event: Event, button: HTMLElement) => Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="times"]')?.value) || 1,
    },
    rejectClose: false,
  }) as number | null;
  if (!times) return;
  const roll = manualRoll(attribute, data.difficulty, times);
  await api.roll.success({
    actor,
    base: roll.base,
    skill: data.skill,
    label: F("RollLabel", { skill: data.skill, name: item.name }),
    modifiers: roll.time ? [{ label: L("TimeSpent"), value: roll.time }] : [],
  } as any);
}

/** The item sheet section's data. */
function itemContext(item: any): Record<string, unknown> {
  const data = referenceData(item);
  const grade = libraryOf(item);
  return {
    data,
    isLibrary: Boolean(grade),
    library: grade ? F("Library", { grade: L(`Grade.${grade}`), modifier: LIBRARY_RESEARCH[grade] >= 0 ? `+${LIBRARY_RESEARCH[grade]}` : LIBRARY_RESEARCH[grade] }) : "",
    extends: grade ? LIBRARY_RESEARCH[grade] > 0 : false,
    showFields: data.manual || Boolean(grade),
    attributes: ATTRIBUTES.map((value) => ({ value, selected: value === data.attribute })),
    difficulties: DIFFICULTIES.map((value) => ({ value, selected: value === data.difficulty })),
    defaultText: data.manual && data.skill ? F("Default", { skill: data.skill, attribute: data.attribute, penalty: MANUAL_DEFAULT[data.difficulty] }) : "",
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ht-reference]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.htReference);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
    });
  });
}

/** Registers the table-side parts. */
export function readyInformation(api: GWorldApi, on: { computers: () => boolean; books: () => boolean }): void {
  readyComputers(api);

  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    const actor = context?.actor;
    const name = String(context?.name ?? "");
    if (!actor) return;
    const items = [...(actor.items ?? [])];
    // A head-up display, worn, helps where quick reaction to what it shows matters (p. 21).
    if (on.computers() && hudHelps(name)) {
      const hud = items.find((item: any) => item.type === "equipment" && item.system?.equipped === true && ownOrUnbooked(item) && isHud(item.name));
      if (hud) context.lines.push({ label: hud.name, value: HUD_BONUS, source: MODULE_ID });
    }
    // A good or fine library lends its bonus to the skill it covers, where the GM allows (p. 18).
    if (on.books()) {
      const lent = items
        .filter((item: any) => item.system?.carried !== false && libraryOf(item) && referenceData(item).extendsToSkill && skillKey(referenceData(item).skill) === skillKey(name))
        .map((item: any) => ({ item, bonus: LIBRARY_RESEARCH[libraryOf(item)!] }))
        .filter((row) => row.bonus > 0)
        .sort((a, b) => b.bonus - a.bonus)[0];
      if (lent) context.lines.push({ label: lent.item.name, value: lent.bonus, source: MODULE_ID });
    }
  });

  // An unfamiliar operating system, computer type or program, and a cramped
  // terminal, on a roll made with a High-Tech computer or program (pp. 20-21).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.computers() || !context?.item) return;
    context.modifiers.push(...computerRollLines(api, context.actor, context.item));
  });

  // A library on an occult subject costs a hundred times as much (p. 18).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-occult-library",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.books() || !libraryOf(item) || !referenceData(item).occult) return null;
      return { cost: price.cost * OCCULT_LIBRARY_COST, label: L("Occult") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-reference-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-reference-item.hbs`,
    visible: (item) => on.books() && item?.type === "equipment" && !(item.system?.meleeModes?.length || item.system?.rangedModes?.length) && !isComputing(item),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-computer-use",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-computer-use.hbs`,
    visible: (item) => on.computers() && highTechComputer(item),
    context: (item) => {
      const setup = computerSetup(item);
      return {
        setup,
        terminals: TERMINALS.map((value) => ({
          value,
          selected: value === setup.terminal,
          label: TERMINAL_PENALTY[value] ? CF("TerminalOption", { terminal: C(`Terminal.${value}`), penalty: TERMINAL_PENALTY[value] }) : C(`Terminal.${value || "none"}`),
        })),
      };
    },
    listeners: (element, item) => {
      element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ht-computer]").forEach((input) => {
        input.addEventListener("change", async () => {
          await item.update({ [`system.extensions.${MODULE_ID}.${COMPUTER_FIELD}.${input.dataset.htComputer}`]: String(input.value ?? "").trim() });
        });
      });
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-follow-manual",
    itemTypes: ["equipment"],
    label: L("Follow"),
    icon: "fa-solid fa-book-open",
    visible: (item) => on.books() && isManual(item),
    run: (item, actor) => followManual(api, item, actor),
  });
}
