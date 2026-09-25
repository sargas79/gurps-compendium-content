/**
 * The computer engine, registered with the system through the add-on API, for
 * every book that prints the rule (Ultra-Tech pp. 21-25; High-Tech pp. 19-22
 * at TL6-8).
 *
 * Each book registers its table in `COMPUTER_TABLES` -- its figures, its
 * switch and its text -- then calls `initComputers` and `readyComputers`,
 * which register once however many books call them. What they register reads
 * the item's own book's table on every call -- its variant's figures and
 * words, where the book prints a second set (a supplement's computer eras)
 * and that set's switch is on:
 *
 *   - **init:** the computer and program fields on equipment.
 *   - **ready:** the price of a computer built with options, and of a program
 *     the record leaves unpriced, from the book's software table; a compact
 *     computer's cells; a hardened computer's HT against an attack on
 *     electrical gadgets; an item sheet section for the model, the options
 *     and a program's Complexity; and a Gear tab section with each computer's
 *     Complexity and what it runs at once. Editing a computer on the sheet
 *     writes its worked-out Complexity to the system's own `complexity`
 *     (Campaigns p. 472), which the system's item sheet and inventing read.
 */

import { registerPowerAdjuster } from "../power/data.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { COMPUTER_TABLES, DIFFICULTIES, computerData, computerTableOf, isProgram, modelOf, registerComputerData, storeComputer, withVariant, type ComputerData, type ComputerTable } from "./data.js";
import { computerFigures, conflictingOptions, programLoad, programsAtOnce, toolComplexity, toolQuality, type Computer } from "./rules.js";

export { COMPUTER_TABLES, computerTableOf, withVariant, type ComputerTable };

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Computer.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Computer.${key}`, data);

/** Registers what must exist before the world's data is read. */
export function initComputers(): void {
  registerComputerData();
}

/** A tech level as a number: "11^" is 11. */
function tlOf(value: unknown): number | null {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
}

/** The TL a computer or program is at: its own, else the campaign's, else the table's printed TL or TL9. */
function itemTl(item: any, table: ComputerTable): number {
  return tlOf(item?.system?.tl) ?? tlOf(item?.actor?.system?.tl) ?? table.figures.printedTl ?? 9;
}

/** The TL software is bought at: the campaign's where the carrier's sheet states a later one, or the program's own. */
function buyingTl(item: any, table: ComputerTable): number {
  return Math.max(itemTl(item, table), tlOf(item?.actor?.system?.tl) ?? 0);
}

/** A computer item's figures in a table, whatever the switches, or null for an item that isn't one of its models. */
export function computerIn(table: ComputerTable | null, item: any, data: ComputerData = computerData(item)): Computer | null {
  const model = modelOf(item, table, data);
  if (!table || !model) return null;
  const lc = typeof item?.system?.lc === "number" ? Number(item.system.lc) : null;
  return computerFigures(table.figures, { model, tl: itemTl(item, table), options: data.options, extraStorage: data.extraStorage, lc });
}

/** A computer item's table and worked-out figures, or null for an item that isn't one or whose book's switch is off. */
export function computerOf(item: any, data: ComputerData = computerData(item)): { table: ComputerTable; computer: Computer } | null {
  const table = computerTableOf(item);
  const computer = computerIn(table, item, data);
  return table && computer ? { table, computer } : null;
}

/**
 * Writes a computer's worked-out Complexity to the system's `complexity`
 * field (Campaigns p. 472), where it differs. Only for an item that is one of
 * a switched-on book's computers; anything else keeps what it has. Returns
 * whether it wrote.
 */
export async function syncComplexity(item: any): Promise<boolean> {
  const found = computerOf(item);
  if (!found || !item?.isOwner) return false;
  const complexity = Math.max(0, Math.floor(Number(found.computer.complexity) || 0));
  if ((Number(item.system?.complexity) || 0) === complexity) return false;
  await item.update({ "system.complexity": complexity });
  return true;
}

/** A program's table, or null for an item that isn't one or whose book's switch is off. */
function programTable(item: any, data: ComputerData = computerData(item)): ComputerTable | null {
  const table = computerTableOf(item);
  return table && isProgram(item, table, data) ? table : null;
}

/** A number as the sheet shows it. */
function amount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : String(Math.round(value * 1000) / 1000);
}

/** The character's computers and the programs on each. */
export function computersOf(actor: any): Array<{ item: any; table: ComputerTable; computer: Computer; programs: any[] }> {
  const items = [...(actor?.items ?? [])].filter((item: any) => item.system?.carried !== false);
  const computers = items
    .map((item: any) => ({ item, found: computerOf(item) }))
    .filter((row): row is { item: any; found: { table: ComputerTable; computer: Computer } } => row.found !== null);
  return computers.map(({ item, found }) => ({
    item,
    ...found,
    programs: items.filter((program: any) => programTable(program) !== null && computerData(program).runsOn === item.id),
  }));
}

/** The item sheet section's data, in the words of the book whose table applies. */
function itemContext(item: any, table: ComputerTable): Record<string, unknown> {
  const ns = table.i18n;
  const figures = table.figures;
  const data = computerData(item);
  const model = modelOf(item, table, data);
  const found = model ? computerOf(item, data) : null;
  const program = isProgram(item, table, data);
  const kind = model ? "computer" : program ? "program" : "";
  const tl = itemTl(item, table);
  const conflicts = conflictingOptions(figures, data.options, tl);
  const context: Record<string, unknown> = {
    ns,
    data,
    kinds: ["", "computer", "program"].map((value) => ({ value, label: L(ns, `Kind.${value || "none"}`), selected: value === kind })),
    isComputer: kind === "computer",
    isProgram: kind === "program",
    models: figures.models.map((value) => ({ value, label: L(ns, `Model.${value}`), selected: value === model })),
    extraStorage: Boolean(figures.extraStorage),
    options: figures.options.map((value) => ({ value, label: L(ns, `Option.${value}`), hint: L(ns, `Option.${value}Hint`), checked: Boolean(data.options[value]), conflict: conflicts.includes(value) })),
    difficulties: DIFFICULTIES.map((value) => ({ value, selected: value === data.difficulty })),
    lowestProgram: figures.lowestProgram,
  };
  if (found) {
    const { computer } = found;
    context.figures = F(ns, "Figures", {
      complexity: computer.complexity,
      storage: amount(computer.storage),
      unit: computer.storageUnit,
      own: amount(computer.programsAtOwn),
      below: amount(programsAtOnce(computer.complexity, computer.complexity - 1, computer.programsAtOwn)),
    });
    context.lc = computer.lc !== null && computer.lc !== item.system?.lc ? F(ns, "Legality", { lc: computer.lc }) : "";
    context.cells = computer.cellFactor !== 1 ? L(ns, "CompactCells") : "";
    context.hardened = computer.hardening ? F(ns, "Hardened", { bonus: computer.hardening }) : "";
    context.problems = computer.problems.map((problem) => F(ns, `Problem.${problem}`, { tl, built: computer.tl }));
    context.notes = table.notes?.(computer.complexity) ?? "";
  }
  if (program) {
    const at = buyingTl(item, table);
    const cost = figures.softwareCost(data.complexity, at);
    context.price = cost === null
      ? F(ns, "Unavailable", { complexity: data.complexity, tl: at })
      : F(ns, "TablePrice", { cost: amount(data.massMarket ? cost * figures.massMarket : cost), complexity: data.complexity, tl: at });
    const skills = (item.system?.forSkills ?? []) as string[];
    if (skills.length) {
      const tool = toolQuality(figures, data.complexity, data.difficulty);
      context.tool = F(ns, `Tool.${tool.quality}`, {
        skills: skills.join(", "),
        basic: toolComplexity(figures, "basic", data.difficulty) ?? 0,
        good: toolComplexity(figures, "good", data.difficulty),
        fine: toolComplexity(figures, "fine", data.difficulty),
      });
      context.toolQuality = tool.quality;
      context.toolMismatch = tool.quality !== "none" && String(item.system?.equipmentQuality ?? "basic") !== tool.quality;
    }
    const computers = computersOf(item.actor);
    context.computers = [
      { value: "", label: L(ns, "NotRunning"), selected: !data.runsOn },
      ...computers.map((row) => ({ value: row.item.id, label: `${row.item.name} (${F(ns, "ComplexityShort", { complexity: row.computer.complexity })})`, selected: row.item.id === data.runsOn })),
    ];
    context.carried = Boolean(item.actor);
  }
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-computer]").forEach((input) => {
    input.addEventListener("change", async () => {
      const table = computerTableOf(item);
      if (!table) return;
      const lowest = table.figures.lowestProgram;
      const field = String(input.dataset.gccComputer);
      const checked = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : null;
      if (field === "kind") {
        const kind = input.value;
        if (kind === "computer") await storeComputer(item, { model: modelOf(item, table, { ...computerData(item), model: "" }) ?? table.figures.defaultModel, complexity: 0, program: false });
        else if (kind === "program") await storeComputer(item, { model: "", complexity: Math.max(lowest, computerData(item).complexity), program: true });
        else await storeComputer(item, { model: "", complexity: 0, program: false });
      } else if (field.startsWith("options.")) await storeComputer(item, { [field]: Boolean(checked) });
      else if (field === "massMarket") await storeComputer(item, { massMarket: Boolean(checked) });
      else if (field === "extraStorage") await storeComputer(item, { extraStorage: Math.max(0, Number(input.value) || 0) });
      else if (field === "complexity") await storeComputer(item, { complexity: Math.max(lowest, Math.min(20, Math.floor(Number(input.value) || lowest))) });
      else if (field === "model" || field === "runsOn" || field === "difficulty") await storeComputer(item, { [field]: input.value });
      // The model and options set the computer's Complexity: the system's own field follows.
      await syncComplexity(item);
    });
  });
  element.querySelector("[data-gcc-computer-quality]")?.addEventListener("click", async () => {
    const table = computerTableOf(item);
    if (!table) return;
    const data = computerData(item);
    await item.update({ "system.equipmentQuality": toolQuality(table.figures, data.complexity, data.difficulty).quality });
  });
}

/** The Gear tab section's data, headed in the words of the first book whose table applies. */
function gearContext(actor: any): Record<string, unknown> {
  const computers = computersOf(actor);
  const rows = computers.map(({ item, table, computer, programs }) => {
    const complexities = programs.map((program: any) => computerData(program).complexity);
    const load = programLoad(computer.complexity, complexities, computer.programsAtOwn);
    return {
      id: item.id,
      ns: table.i18n,
      name: item.name,
      complexity: computer.complexity,
      storage: `${amount(computer.storage)} ${computer.storageUnit}`,
      programs: programs.map((program: any) => {
        const complexity = computerData(program).complexity;
        return { name: program.name, complexity, tooComplex: complexity > computer.complexity };
      }),
      load: Number.isFinite(load) ? Math.round(load * 100) : null,
      overloaded: !Number.isFinite(load) || load > 1.0000001,
      notes: table.notes?.(computer.complexity) ?? "",
    };
  });
  return { ns: computers[0]?.table.i18n ?? "GCC.UT", rows };
}

/**
 * A computer whose option halves its cells runs half the time on them:
 * Ultra-Tech's compact computer (p. 23). The cell engine multiplies this with
 * any other change to the endurance, such as cells swapped in by weight.
 */
export function computerCells(item: any): { cells: number; endurance: number } | null {
  const found = computerOf(item);
  return found && found.computer.cellFactor !== 1 ? { cells: found.computer.cellFactor, endurance: found.computer.cellFactor } : null;
}

let readied = false;

/** Registers the table-side parts, once whichever books ask. */
export function readyComputers(api: GWorldApi): void {
  if (readied) return;
  readied = true;

  registerPowerAdjuster(computerCells);

  // A hardened computer's HT bonus against an attack on electrical gadgets:
  // whichever book's EMP or microwave weapon it is (Ultra-Tech p. 23; High-Tech p. 20).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!context?.tags?.includes?.("resist") || !context.attack?.item) return;
    const item = context.attack.item;
    const index = Math.max(0, Math.floor(Number(context.attack.mode?.index) || 0));
    if (!COMPUTER_TABLES.all.some((table) => table.electricalAttack?.(item, index))) return;
    const hardened = computersOf(context.actor).filter((row) => row.computer.hardening > 0).sort((a, b) => b.computer.hardening - a.computer.hardening)[0];
    if (hardened) context.modifiers.push({ label: F(hardened.table.i18n, "HardenedLine", { name: hardened.item.name }), value: hardened.computer.hardening });
  });

  // Options reprice the computer from the model's figures, and extra storage
  // adds to it; a program with no price of its own takes the book's table's.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "computer",
    types: ["equipment"],
    apply: (item, price) => {
      const data = computerData(item);
      const found = computerOf(item, data);
      if (found) {
        const { table, computer } = found;
        if (computer.costFactor === 1 && computer.weightFactor === 1 && !computer.extraCost) return null;
        return {
          cost: Math.round((price.cost * computer.costFactor + computer.extraCost) * 100) / 100,
          weight: Math.round((price.weight * computer.weightFactor + computer.extraWeight) * 1000) / 1000,
          label: L(table.i18n, "Title"),
        };
      }
      const table = programTable(item, data);
      if (table && !(Number(item?.system?.listCost) || Number(item?.system?.cost))) {
        const cost = table.figures.softwareCost(data.complexity, buyingTl(item, table));
        if (cost === null) return null;
        return { cost: data.massMarket ? Math.round(cost * table.figures.massMarket * 100) / 100 : cost, label: L(table.i18n, "SoftwareTitle") };
      }
      return null;
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "computer-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/computer-item.hbs`,
    visible: (item) => item?.type === "equipment" && computerTableOf(item) !== null,
    context: (item) => itemContext(item, computerTableOf(item)!),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "computer-gear",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/computer-gear.hbs`,
    visible: (actor) => computersOf(actor).length > 0,
    context: (actor) => gearContext(actor),
  });
}
