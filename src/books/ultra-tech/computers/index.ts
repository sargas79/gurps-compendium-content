/**
 * GURPS Ultra-Tech's computers, registered with the system through the add-on
 * API (pp. 21-25, 46-47).
 *
 *   - **init:** the computer and program fields on equipment.
 *   - **ready:** the price of a computer built with options, and of a program
 *     the record leaves unpriced, from the Software Cost Table; an item sheet
 *     section for the model, the options and a program's Complexity; a Gear
 *     tab section with each computer's Complexity, what it runs at once and
 *     the AIs it could hold; and a GM tool for breaking encryption.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { beamFamily } from "../beams/rules.js";
import { registerPowerAdjuster } from "../../../shared/power/data.js";
import { loadsOf } from "../warheads/index.js";
import { DIFFICULTIES, computerData, isProgram, modelOf, registerComputerData, storeComputer, type ComputerData } from "./data.js";
import {
  AI_KINDS,
  COMPUTER_MODELS,
  HARDWARE_OPTIONS,
  MASS_MARKET,
  aiLegality,
  computerFigures,
  conflictingOptions,
  decryptionHours,
  encryptionComplexity,
  highestAiIq,
  hoursText,
  programLoad,
  programsAtOnce,
  softwareCost,
  timeSpentModifier,
  toolComplexity,
  toolQuality,
  type Computer,
  type EncryptionStandard,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Computer.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Computer.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Registers what must exist before the world's data is read. */
export function initComputers(): void {
  registerComputerData();
}

/** A tech level as a number: "11^" is 11. */
function tlOf(value: unknown): number | null {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
}

/** The TL a computer or program is at: its own, else the campaign's, else TL9. */
function itemTl(item: any): number {
  return tlOf(item?.system?.tl) ?? tlOf(item?.actor?.system?.tl) ?? 9;
}

/** The TL software is bought at: the campaign's where the carrier's sheet states a later one, or the program's own. */
function buyingTl(item: any): number {
  return Math.max(itemTl(item), tlOf(item?.actor?.system?.tl) ?? 0);
}

/** A computer item's worked-out figures, or null for an item that isn't one. */
export function computerOf(item: any, data: ComputerData = computerData(item)): Computer | null {
  const model = modelOf(item, data);
  if (!model) return null;
  const lc = typeof item?.system?.lc === "number" ? Number(item.system.lc) : null;
  return computerFigures({ model, tl: itemTl(item), options: data.options, extraStorage: data.extraStorage, lc });
}

/** A number as the sheet shows it. */
function amount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : String(Math.round(value * 1000) / 1000);
}

/** The character's computers and the programs on each. */
function computersOf(actor: any): Array<{ item: any; computer: Computer; programs: any[] }> {
  const items = [...(actor?.items ?? [])].filter((item: any) => item.system?.carried !== false);
  const computers = items
    .map((item: any) => ({ item, computer: computerOf(item) }))
    .filter((row): row is { item: any; computer: Computer } => row.computer !== null);
  return computers.map((row) => ({
    ...row,
    programs: items.filter((item: any) => isProgram(item) && computerData(item).runsOn === row.item.id),
  }));
}

/** What an AI of each kind could be on a computer: its highest IQ and that IQ's LC. */
function aiText(complexity: number): string {
  return AI_KINDS.filter((kind) => kind !== "mindEmulation" && kind !== "weakDedicated")
    .map((kind) => {
      const iq = highestAiIq(kind, complexity);
      return iq === null ? F("AiNone", { kind: L(`Ai.${kind}`) }) : F("AiUpTo", { kind: L(`Ai.${kind}`), iq, lc: aiLegality(kind, iq) });
    })
    .join("; ");
}

/** The item sheet section's data. */
function itemContext(item: any): Record<string, unknown> {
  const data = computerData(item);
  const named = modelOf(item, { ...data, model: "" });
  const model = modelOf(item, data);
  const computer = computerOf(item, data);
  const program = isProgram(item, data);
  const kind = model ? "computer" : program ? "program" : "";
  const conflicts = conflictingOptions(data.options);
  const context: Record<string, unknown> = {
    data,
    named: Boolean(named),
    kinds: ["", "computer", "program"].map((value) => ({ value, label: L(`Kind.${value || "none"}`), selected: value === kind })),
    isComputer: kind === "computer",
    isProgram: kind === "program",
    models: COMPUTER_MODELS.map((value) => ({ value, label: L(`Model.${value}`), selected: value === model })),
    options: HARDWARE_OPTIONS.map((value) => ({ value, label: L(`Option.${value}`), hint: L(`Option.${value}Hint`), checked: data.options[value], conflict: conflicts.includes(value) })),
    difficulties: DIFFICULTIES.map((value) => ({ value, selected: value === data.difficulty })),
  };
  if (computer) {
    context.figures = F("Figures", {
      complexity: computer.complexity,
      storage: amount(computer.storage),
      unit: computer.storageUnit,
      own: amount(computer.programsAtOwn),
      below: amount(programsAtOnce(computer.complexity, computer.complexity - 1, computer.programsAtOwn)),
    });
    context.lc = computer.lc !== null && computer.lc !== item.system?.lc ? F("Legality", { lc: computer.lc }) : "";
    context.cells = computer.cellFactor !== 1 ? L("CompactCells") : "";
    context.hardened = computer.hardening ? F("Hardened", { bonus: computer.hardening }) : "";
    context.ai = aiText(computer.complexity);
  }
  if (program) {
    const tl = buyingTl(item);
    const cost = softwareCost(data.complexity, tl);
    context.price = cost === null
      ? F("Unavailable", { complexity: data.complexity, tl })
      : F("TablePrice", { cost: amount(data.massMarket ? cost * MASS_MARKET : cost), complexity: data.complexity, tl });
    const skills = (item.system?.forSkills ?? []) as string[];
    if (skills.length) {
      const tool = toolQuality(data.complexity, data.difficulty);
      context.tool = F(`Tool.${tool.quality}`, {
        skills: skills.join(", "),
        good: toolComplexity("good", data.difficulty),
        fine: toolComplexity("fine", data.difficulty),
      });
      context.toolQuality = tool.quality;
      context.toolMismatch = String(item.system?.equipmentQuality ?? "basic") !== tool.quality;
    }
    const computers = computersOf(item.actor);
    context.computers = [{ value: "", label: L("NotRunning"), selected: !data.runsOn }, ...computers.map((row) => ({ value: row.item.id, label: `${row.item.name} (${F("ComplexityShort", { complexity: row.computer.complexity })})`, selected: row.item.id === data.runsOn }))];
    context.carried = Boolean(item.actor);
  }
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-computer]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtComputer);
      const checked = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : null;
      if (field === "kind") {
        const kind = input.value;
        if (kind === "computer") await storeComputer(item, { model: modelOf(item, { ...computerData(item), model: "" }) ?? "personal", complexity: 0 });
        else if (kind === "program") await storeComputer(item, { model: "", complexity: Math.max(1, computerData(item).complexity) });
        else await storeComputer(item, { model: "", complexity: 0 });
      } else if (field.startsWith("options.")) await storeComputer(item, { [field]: Boolean(checked) });
      else if (field === "massMarket") await storeComputer(item, { massMarket: Boolean(checked) });
      else if (field === "extraStorage") await storeComputer(item, { extraStorage: Math.max(0, Number(input.value) || 0) });
      else if (field === "complexity") await storeComputer(item, { complexity: Math.max(1, Math.min(20, Math.floor(Number(input.value) || 1))) });
      else if (field === "model" || field === "runsOn" || field === "difficulty") await storeComputer(item, { [field]: input.value });
    });
  });
  element.querySelector("[data-gcc-ut-computer-quality]")?.addEventListener("click", async () => {
    const data = computerData(item);
    await item.update({ "system.equipmentQuality": toolQuality(data.complexity, data.difficulty).quality });
  });
}

/** The Gear tab section's data. */
function gearContext(actor: any): Record<string, unknown> {
  const rows = computersOf(actor).map(({ item, computer, programs }) => {
    const complexities = programs.map((program: any) => computerData(program).complexity);
    const load = programLoad(computer.complexity, complexities, computer.programsAtOwn);
    return {
      id: item.id,
      name: item.name,
      complexity: computer.complexity,
      storage: `${amount(computer.storage)} ${computer.storageUnit}`,
      programs: programs.map((program: any) => {
        const complexity = computerData(program).complexity;
        return { name: program.name, complexity, tooComplex: complexity > computer.complexity };
      }),
      load: Number.isFinite(load) ? Math.round(load * 100) : null,
      overloaded: !Number.isFinite(load) || load > 1.0000001,
      ai: aiText(computer.complexity),
    };
  });
  return { rows };
}

/** Asks for an encryption attempt and posts its time and modifier, rolling Cryptography for a selected character. */
async function breakEncryption(api: GWorldApi): Promise<void> {
  const actor = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null;
  const own = actor ? computersOf(actor) : [];
  const best = own.sort((a, b) => b.computer.complexity - a.computer.complexity)[0] ?? null;
  const campaign = tlOf(actor?.system?.tl) ?? 9;
  const field = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
  const content = `<div class="gworld" style="display:grid;gap:6px">`
    + field(L("Encryption.Standard"), `<select name="standard"><option value="basic">${esc(L("Encryption.basic"))}</option><option value="secure">${esc(L("Encryption.secure"))}</option></select>`)
    + field(L("Encryption.Tl"), `<input type="number" name="tl" value="${campaign}" min="9" max="12" step="1" style="width:70px" />`)
    + field(L("Encryption.Complexity"), `<input type="number" name="complexity" value="${best?.computer.complexity ?? 8}" min="0" step="1" style="width:70px" />`)
    + field(L("Encryption.Quantum"), `<input type="checkbox" name="quantum" ${best && computerData(best.item).options.quantum ? "checked" : ""} />`)
    + field(L("Encryption.Hours"), `<input type="number" name="hours" value="" min="0" step="any" placeholder="${esc(L("Encryption.BaseTime"))}" style="width:90px" />`)
    + (actor ? `<p class="ihint">${esc(F("Encryption.Roller", { name: actor.name }))}</p>` : `<p class="ihint">${esc(L("Encryption.NoRoller"))}</p>`)
    + `</div>`;
  const values = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Encryption.Title") },
    content,
    ok: {
      label: L("Encryption.Go"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return {
          standard: (value("standard")?.value ?? "basic") as EncryptionStandard,
          tl: Number(value("tl")?.value) || 9,
          complexity: Number(value("complexity")?.value) || 0,
          quantum: Boolean(value("quantum")?.checked),
          hours: value("hours")?.value === "" ? null : Number(value("hours")?.value),
        };
      },
    },
    rejectClose: false,
  }) as { standard: EncryptionStandard; tl: number; complexity: number; quantum: boolean; hours: number | null } | null;
  if (!values) return;
  const base = decryptionHours(values);
  const shown = hoursText(base);
  const time = shown.unit === "realTime" ? L("Encryption.RealTime") : F(`Encryption.${shown.unit}`, { value: shown.value });
  const modifier = values.hours === null || base <= 0 ? 0 : timeSpentModifier(values.hours, base);
  const summary = F("Encryption.Result", {
    standard: L(`Encryption.${values.standard}`),
    tl: values.tl,
    needed: encryptionComplexity(values.standard, values.tl),
    complexity: values.complexity,
    quantum: values.quantum ? L("Encryption.QuantumNote") : "",
    time,
  });
  await ChatMessage.implementation.create({
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Encryption.Title"))}</span></div><div class="gc-result">${esc(summary)}</div>`
      + (modifier ? `<div class="gc-result">${esc(F("Encryption.TimeModifier", { modifier: modifier > 0 ? `+${modifier}` : modifier }))}</div>` : "")
      + `</div>`,
    whisper: [...((game as any).users ?? [])].filter((user: any) => user.isGM).map((user: any) => user.id),
  });
  if (!actor) return;
  const level = api.actors.skillLevel(actor, "Cryptography");
  if (level === null) {
    ui.notifications?.warn(F("Encryption.NoSkill", { name: actor.name }));
    return;
  }
  await api.roll.success({
    actor,
    base: level,
    skill: "Cryptography",
    label: F("Encryption.RollLabel", { standard: L(`Encryption.${values.standard}`) }),
    modifiers: modifier ? [{ label: L("Encryption.TimeSpent"), value: modifier }] : [],
  } as any);
}

/** Registers the table-side parts. */
export function readyComputers(api: GWorldApi, on: () => boolean): void {
  // A compact computer uses half the power cells for half the time (p. 23).
  registerPowerAdjuster((item) => {
    if (!on()) return null;
    const computer = computerOf(item);
    return computer && computer.cellFactor !== 1 ? { cells: computer.cellFactor, endurance: computer.cellFactor } : null;
  });

  // A hardened computer's +3 HT against an attack on electrical gadgets: an EMP warhead or a microwave beam (p. 23).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("resist") || !context.attack?.item) return;
    const item = context.attack.item;
    const index = Math.max(0, Math.floor(Number(context.attack.mode?.index) || 0));
    const emp = loadsOf(item).some((l) => l.mode === index && l.kind === "emp") || beamFamily(String(item.name ?? "")) === "microwave";
    if (!emp) return;
    const hardened = computersOf(context.actor).filter((row) => row.computer.hardening > 0).sort((a, b) => b.computer.hardening - a.computer.hardening)[0];
    if (hardened) context.modifiers.push({ label: F("HardenedLine", { name: hardened.item.name }), value: hardened.computer.hardening });
  });

  // Options reprice the computer from the model's figures, and extra storage
  // adds to it (p. 23); a program with no price of its own takes the table's (p. 25).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-computer",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on()) return null;
      const data = computerData(item);
      const computer = computerOf(item, data);
      if (computer) {
        if (computer.costFactor === 1 && computer.weightFactor === 1 && !computer.extraCost) return null;
        return {
          cost: Math.round((price.cost * computer.costFactor + computer.extraCost) * 100) / 100,
          weight: Math.round((price.weight * computer.weightFactor + computer.extraWeight) * 1000) / 1000,
          label: L("Title"),
        };
      }
      if (isProgram(item, data) && !(Number(item?.system?.listCost) || Number(item?.system?.cost))) {
        const cost = softwareCost(data.complexity, buyingTl(item));
        if (cost === null) return null;
        return { cost: data.massMarket ? Math.round(cost * MASS_MARKET * 100) / 100 : cost, label: L("SoftwareTitle") };
      }
      return null;
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-computer-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-computer-item.hbs`,
    visible: (item) => on() && item?.type === "equipment",
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-computer-gear",
    sheet: "character",
    tab: "gear",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ut-computer-gear.hbs`,
    visible: (actor) => on() && computersOf(actor).length > 0,
    context: (actor) => gearContext(actor),
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ut-encryption",
    label: L("Encryption.Title"),
    icon: "fa-solid fa-key",
    visible: on,
    open: () => breakEncryption(api),
  });
}
