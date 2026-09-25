/**
 * The Electricity and Electronics supplement's computers (HT:EE pp. 36-41),
 * registered with the system through the add-on API. They extend High-Tech's
 * computers (`../information/`), whose table in the shared computer engine
 * carries the supplement's figures as its variant.
 *
 *   - **computerEras:** the supplement's size categories, basic technologies
 *     and design options, which the engine prices and works out as fields on
 *     the computer (HT:EE p. 37; the variant in `highTechComputers`); and a
 *     vacuum-tube computer's daily HT roll against a burned-out tube, with the
 *     minor repair that mends it (p. 37, after Campaigns p. 484); until then
 *     the machine and the programs on it serve no skill as tools
 *     (`data.registerToolGrade`), so the system picks other gear, and a roll
 *     still made with one of them is refused.
 *   - **computerInterfaces:** the interface a High-Tech computer is worked
 *     through, set on its sheet: a familiarity of its own (-2 until learned,
 *     under the system's familiarity rule), driven only by a computer of the
 *     Complexity it needs, with a touch screen's, a stylus's, voice control's
 *     and a brain-computer interface's modifiers on rolls made with the
 *     computer or a program on it; and a light pen's HT roll every 10 minutes
 *     (HT:EE pp. 39-41). The tasks take what the supplement prints for them:
 *     a text interface's -1 to navigate by the arrow keys, typing on a touch
 *     screen -1 without a keyboard carried (a Typing roll with no computer
 *     named takes the touch-screen computer in use), a VR headset offsetting
 *     up to -2 of a Computer Operation roll's penalties, and wired gloves,
 *     ticked on a VR computer, -2 to a DX-based skill worked through it. The
 *     arrow keys and the headset count only on a roll tagged for them
 *     (`screenNavigation`, `vrTask`), as the computer's "Work it" row asks.
 *     A roll the system makes is neither: which tasks those are is the
 *     GM's.
 *   - **programmingLanguages:** on a Computer Programming roll made with a
 *     High-Tech computer or a program on it, machine code's -5 (not for
 *     Eidetic Memory), and a high-level language lifting the penalty for an
 *     unfamiliar computer type; Computer Operation rolled as a complementary
 *     skill for the next Computer Programming roll with the machine; and a
 *     hard-wired machine "programmed" with Engineer (Electronics), Electronics
 *     Repair (Computers) or Computer Operation (HT:EE p. 38).
 *
 * What the catalogue writes, which these read: a computer record's name as
 * printed ("Workstation", "Minicomputer", "Medium Computer": the engine's
 * model by name, or `computer.model` where a record sets it) and its `tl`; an
 * interface record's name ("Light Pen", "Stylus").
 */

import { bookOf } from "../../../shared/book-tables.js";
import { COMPUTER_TABLES, computerIn, computerTableOf, withVariant, type ComputerTable } from "../../../shared/computers/index.js";
import { computerData, isProgram, modelOf } from "../../../shared/computers/data.js";
import { effectiveOptions } from "../../../shared/computers/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { computerSetup, lineKey, storeSetup } from "../information/index.js";
import {
  BURNOUT_REPAIR_SKILL,
  COMPUTER_OPERATION_DEFAULT,
  DIGITAL_CIRCUITS,
  INTERFACES,
  INTERFACE_COMPLEXITY,
  INTERFACE_FAMILIARITY,
  LANGUAGES,
  LIGHT_PEN_MINUTES,
  MACHINE_CODE_PENALTY,
  TOUCH_SIZES,
  UNFAMILIAR_CIRCUITS,
  WIRING,
  WIRING_SKILL,
  complementaryModifier,
  interfaceLines,
  isKeyboard,
  isLightPen,
  isOperation,
  isProgramming,
  isStylus,
  lightPenStrain,
  sparesMachineCode,
  type Interface,
  type Wiring,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Computing.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Computing.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** The actor flag holding a complementary Computer Operation roll, for the next programming roll with a computer. */
const COMPLEMENTARY_FLAG = "htComplementary";

/** Which of the supplement's switches are on. */
export interface ComputingSwitches {
  eras: () => boolean;
  interfaces: () => boolean;
  languages: () => boolean;
}

/**
 * High-Tech's computer table as it stands for an item -- with the eras
 * where their switch is on -- whether or not a switch puts the engine to
 * work on it: these rules read a computer's Complexity with the engine off.
 */
function highTechTable(item: any): ComputerTable | null {
  const table = computerTableOf(item);
  if (table) return table.book === "high-tech" ? table : null;
  const book = bookOf(item);
  const own = COMPUTER_TABLES.forBook("high-tech");
  return own && (book === null || book === "high-tech") ? withVariant(own) : null;
}

/** Whether an item is a High-Tech computer. */
export function isHighTechComputer(item: any): boolean {
  return item?.type === "equipment" && Boolean(modelOf(item, highTechTable(item)));
}

/** A High-Tech computer's Complexity, or null for an item that isn't one. */
export function complexityOf(item: any): number | null {
  return computerIn(highTechTable(item), item)?.complexity ?? null;
}

/** Whether a High-Tech computer is built with an option, once the options that exclude it are dropped. */
export function builtWith(item: any, option: string): boolean {
  const table = highTechTable(item);
  if (!table || !modelOf(item, table)) return false;
  const tl = Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0] ?? table.figures.printedTl ?? 8);
  return Boolean(effectiveOptions(table.figures, computerData(item).options, tl)[option]);
}

/** The High-Tech computer a roll is made with: the item itself, or the one the program on it runs on. */
export function computerBehind(item: any): any | null {
  if (item?.type !== "equipment") return null;
  if (isHighTechComputer(item)) return item;
  const table = highTechTable(item);
  if (!table || !isProgram(item, table)) return null;
  const host = item.actor?.items?.get?.(computerData(item).runsOn) ?? null;
  return host && isHighTechComputer(host) ? host : null;
}

/** Whether a vacuum-tube computer is down with a burned-out tube, where the eras' switch is on (HT:EE p. 37). */
export function isBurntOut(computer: any, on: Pick<ComputingSwitches, "eras">): boolean {
  return on.eras() && computerSetup(computer).burntOut === true && builtWith(computer, "vacuumTube");
}

/** Whether the character carries a stylus. */
function carriesStylus(actor: any): boolean {
  return [...(actor?.items ?? [])].some((item: any) => item.type === "equipment" && item.system?.carried !== false && isStylus(item.name));
}

/** Whether a character has Eidetic or Photographic Memory. */
function hasEideticMemory(actor: any): boolean {
  return [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && sparesMachineCode(item.name));
}

/** The familiarity test the system's rule gives, or null where it is off or the character keeps no list (an NPC). */
function familiarity(api: GWorldApi, actor: any): ((name: string) => boolean) | null {
  const list = actor?.system?.familiarities;
  return api.registry.isRuleOn("familiarity") && Array.isArray(list) ? (name: string) => api.rules.isFamiliar(list.map(String), name) : null;
}

/** Whether the character carries a keyboard to type with. */
function carriesKeyboard(actor: any): boolean {
  return [...(actor?.items ?? [])].some((item: any) => item.type === "equipment" && item.system?.carried !== false && isKeyboard(item.name));
}

/** Whether a skill is Typing. */
const isTyping = (skill: string) => /^typing\b/i.test(String(skill ?? "").trim());

/** Whether the character's skill of this name is based on DX: manual dexterity, as wired gloves hamper it (HT:EE p. 41). */
function dexterityBased(actor: any, skill: string): boolean {
  const name = String(skill ?? "").trim().toLowerCase();
  const own = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && String(i.name ?? "").trim().toLowerCase().replace(/\/tl\d+/i, "") === name);
  return own?.system?.attribute === "DX";
}

/** A roll's tag for navigating the display, which a text interface does by the arrow keys (HT:EE p. 40). */
export const NAVIGATION_TAG = "screenNavigation";
/** A roll's tag for a task a VR headset helps with (HT:EE p. 41). */
export const VR_TASK_TAG = "vrTask";

/**
 * The interface lines a roll with a computer takes, labelled (HT:EE pp.
 * 39-41); `penalties` is what the roll already carries, `tags` what it is
 * tagged with.
 */
export function interfaceRollLines(api: GWorldApi, actor: any, computer: any, skill: string, penalties = 0, tags: readonly string[] = []): Array<{ key: string; label: string; value: number }> {
  const setup = computerSetup(computer);
  if (!setup.interface) return [];
  const roll = {
    computerOperation: isOperation(skill), stylus: carriesStylus(actor), typing: isTyping(skill), keyboard: carriesKeyboard(actor), dexterity: dexterityBased(actor, skill), penalties,
    navigating: tags.includes(NAVIGATION_TAG), vrTask: tags.includes(VR_TASK_TAG),
  };
  const lines = interfaceLines(setup, complexityOf(computer) ?? 0, roll, familiarity(api, actor));
  const name = L(`Interface.${setup.interface}`);
  // With a stylus the screen is worked single-touch.
  const multitouch = setup.multitouch && !lines.some((line) => line.key === "stylus");
  return lines.map((line) => ({
    key: `ht.interface.${line.key}`,
    label: line.key === "touch" ? F("TouchLine", { size: L(`Touch.${setup.touch}`), touch: L(multitouch ? "Multitouch" : "SingleTouch") }) : F(`Line.${line.key}`, { name }),
    value: line.value,
  }));
}

/**
 * What a Computer Programming roll with a computer takes for its language
 * (HT:EE p. 38): machine code's -5, unless the programmer has Eidetic
 * Memory; and with a high-level language, the key of the unfamiliar
 * computer type's line to take away.
 */
export function languageLines(actor: any, computer: any): { lines: Array<{ key: string; label: string; value: number }>; lift: string[] } {
  const language = computerSetup(computer).language;
  if (language === "machineCode" && !hasEideticMemory(actor)) return { lines: [{ key: "ht.machineCode", label: L("MachineCodeLine"), value: MACHINE_CODE_PENALTY }], lift: [] };
  if (language === "highLevel") return { lines: [], lift: [lineKey("computerType")] };
  return { lines: [], lift: [] };
}

/** A complementary roll kept for the next programming roll with a computer. */
function complementaryFor(actor: any, computer: any): number | null {
  const kept = actor?.getFlag?.(MODULE_ID, COMPLEMENTARY_FLAG);
  return kept && kept.computer === computer?.id && Number.isFinite(Number(kept.value)) ? Number(kept.value) : null;
}

/** The IQ-based default a skill falls back to where the character hasn't it. */
function levelOrDefault(api: GWorldApi, actor: any, skill: string, iqDefault: number | null): number | null {
  const own = api.actors.skillLevel(actor, skill);
  if (own !== null) return own;
  if (iqDefault === null) return null;
  const iq = Number(api.actors.attribute(actor, "IQ"));
  return Number.isFinite(iq) ? iq + iqDefault : null;
}

/** Posts a line or two to chat as the character. */
async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld"><strong>${esc(title)}</strong>${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`,
  });
}

// ── the row actions ─────────────────────────────────────────────────────────

/** The day's HT roll for a vacuum-tube computer; a failure burns out a tube (HT:EE p. 37). */
async function rollBurnout(api: GWorldApi, item: any, actor: any): Promise<void> {
  const health = Number((api.rules as any).ASSUMED_HEALTH) || 10;
  // The machine's own roll, not one made with it: no user's familiarity comes into it.
  const outcome: any = await api.roll.success({ actor, base: health, label: F("BurnoutRoll", { name: item.name }), tags: ["tubeBurnout"] } as any);
  if (!outcome || outcome.success) return;
  await storeSetup(item, { burntOut: true });
  await say(actor, String(item.name ?? ""), [L("BurntOut")]);
}

/** A minor repair for a burned-out tube: Electronics Repair (Computers) at the price's modifier, half an hour a try (Campaigns p. 484). */
async function repairBurnout(api: GWorldApi, item: any, actor: any): Promise<void> {
  // Electronics Repair defaults to IQ-5 (Characters p. 190).
  const level = levelOrDefault(api, actor, BURNOUT_REPAIR_SKILL, -5);
  if (level === null) return void ui.notifications?.warn(F("NoSkill", { skill: BURNOUT_REPAIR_SKILL }));
  const cost = Number(item.system?.cost) || 0;
  const price = Number((api.rules as any).priceModifier?.(cost)) || 0;
  const outcome: any = await api.roll.success({
    actor,
    base: level,
    skill: BURNOUT_REPAIR_SKILL,
    label: F("RepairRoll", { name: item.name }),
    modifiers: price ? [{ label: L("PriceModifier"), value: price }] : [],
    tags: ["repair"],
  } as any);
  if (!outcome?.success) return;
  await storeSetup(item, { burntOut: false });
  await say(actor, String(item.name ?? ""), [L("Repaired")]);
}

/** A light pen's HT roll every 10 minutes of use: 1 FP on a failure, and 1 HP as well on a critical failure (HT:EE p. 40). */
async function lightPenRoll(api: GWorldApi, item: any, actor: any): Promise<void> {
  const health = Number(api.actors.attribute(actor, "HT")) || 10;
  const outcome: any = await api.roll.success({ actor, base: health, label: F("LightPenRoll", { name: item.name, minutes: LIGHT_PEN_MINUTES }), tags: ["lightPen", "HT"] } as any);
  if (!outcome) return;
  const strain = lightPenStrain(outcome);
  if (strain.fp) await api.actors.spendFatigue(actor, strain.fp, { details: { rule: "lightPen", item: String(item.name ?? "") } });
  if (strain.hp) await api.actors.applyInjury(actor, { amount: strain.hp, label: String(item.name ?? "") });
}

/**
 * Computer Operation rolled as a complementary skill (HT:EE p. 38): made
 * with the computer, so its familiarity penalties apply, and kept for the
 * next Computer Programming roll with it.
 */
async function complementaryRoll(api: GWorldApi, item: any, actor: any): Promise<void> {
  const level = levelOrDefault(api, actor, "Computer Operation", COMPUTER_OPERATION_DEFAULT);
  if (level === null) return void ui.notifications?.warn(F("NoSkill", { skill: "Computer Operation" }));
  const outcome: any = await api.roll.success({ actor, base: level, skill: "Computer Operation", label: F("ComplementaryRoll", { name: item.name }), item, tags: ["complementary"] } as any);
  if (!outcome) return;
  const value = complementaryModifier(outcome);
  await actor.setFlag(MODULE_ID, COMPLEMENTARY_FLAG, { computer: item.id, value });
  await say(actor, String(item.name ?? ""), [F("ComplementaryKept", { value: signed(value) })]);
}

/**
 * Works a computer on Computer Operation, saying what the task is: navigating
 * the display (a text interface's arrow keys, -1) and a task the VR headset
 * helps with (up to -2 of penalties offset) (HT:EE pp. 40-41).
 */
async function workComputer(api: GWorldApi, item: any, actor: any): Promise<void> {
  const kind = computerSetup(item).interface;
  const answer = (await foundry.applications.api.DialogV2.prompt({
    window: { title: F("WorkTitle", { name: item.name }) },
    content: `<div class="gworld" style="display:grid;gap:6px">
      ${kind === "text" ? `<label><input type="checkbox" name="navigating" /> ${esc(L("WorkNavigating"))}</label>` : ""}
      ${kind === "vr" ? `<label><input type="checkbox" name="vrTask" /> ${esc(L("WorkVr"))}</label>` : ""}
      <p class="ihint">${esc(L("WorkHint"))}</p>
    </div>`,
    ok: {
      label: L("Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const checked = (name: string) => Boolean(form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked);
        return { navigating: checked("navigating"), vrTask: checked("vrTask") };
      },
    },
    rejectClose: false,
  })) as { navigating: boolean; vrTask: boolean } | null;
  if (!answer) return;
  const level = levelOrDefault(api, actor, "Computer Operation", COMPUTER_OPERATION_DEFAULT);
  if (level === null) return;
  const tags = ["computerWork", ...(answer.navigating ? [NAVIGATION_TAG] : []), ...(answer.vrTask ? [VR_TASK_TAG] : [])];
  await api.roll.success({ actor, base: level, skill: "Computer Operation", label: F("WorkTitle", { name: item.name }), item, tags } as any);
}

/** "Programs" a hard-wired machine: by designing its circuits, rewiring it, or setting its jacks and switches (HT:EE p. 38). */
async function wireProgram(api: GWorldApi, item: any, actor: any): Promise<void> {
  const option = (w: Wiring) => `<option value="${w}">${esc(F(`Wiring.${w}`, { skill: WIRING_SKILL[w] }))}</option>`;
  const chosen = (await foundry.applications.api.DialogV2.prompt({
    window: { title: F("WireTitle", { name: item.name }) },
    content: `<div class="gworld" style="display:grid;gap:6px">
      <p class="ihint">${esc(L("WireHint"))}</p>
      <label>${esc(L("WireHow"))} <select name="how">${WIRING.map(option).join("")}</select></label>
    </div>`,
    ok: {
      label: L("Roll"),
      callback: (_event: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="how"]')?.value ?? "",
    },
    rejectClose: false,
  })) as Wiring | null;
  if (!chosen || !WIRING.includes(chosen)) return;
  const skill = WIRING_SKILL[chosen];
  // Engineer has no attribute default; Electronics Repair is IQ-5 and Computer Operation IQ-4 (Characters pp. 184, 190).
  const level = levelOrDefault(api, actor, skill, chosen === "design" ? null : chosen === "rewire" ? -5 : COMPUTER_OPERATION_DEFAULT);
  if (level === null) return void ui.notifications?.warn(F("NoSkill", { skill }));
  const modifiers: Array<{ label: string; value: number }> = [];
  if (chosen === "design" && api.actors.isFamiliar(actor, DIGITAL_CIRCUITS) === false) modifiers.push({ label: L("UnfamiliarCircuits"), value: UNFAMILIAR_CIRCUITS });
  // Only setting its jacks and switches works the machine, and takes its familiarity penalties.
  await api.roll.success({ actor, base: level, skill, label: F("WireRoll", { name: item.name }), ...(chosen === "configure" ? { item } : {}), modifiers, tags: ["wiring"] } as any);
}

// ── the sheet ──────────────────────────────────────────────────────────────

/** The item sheet section's data: the interface, the language and a burned-out tube. */
function sectionContext(api: GWorldApi, item: any, on: ComputingSwitches): Record<string, unknown> {
  const setup = computerSetup(item);
  const complexity = complexityOf(item) ?? 0;
  const context: Record<string, unknown> = { setup };
  if (on.interfaces()) {
    const kind = setup.interface;
    const needs = kind ? INTERFACE_COMPLEXITY[kind] : 0;
    const actor = item.actor ?? null;
    const known = kind && actor ? api.actors.isFamiliar(actor, INTERFACE_FAMILIARITY[kind]) : null;
    context.interfaces = {
      kinds: INTERFACES.map((value: Interface) => ({
        value,
        selected: value === kind,
        label: value ? F("InterfaceOption", { name: L(`Interface.${value}`), complexity: INTERFACE_COMPLEXITY[value] }) : L("Interface.none"),
      })),
      touch: kind === "touch",
      voice: kind === "voice",
      vr: kind === "vr",
      sizes: TOUCH_SIZES.map((value) => ({ value, selected: value === setup.touch, label: L(`Touch.${value}`) })),
      tooLow: kind && complexity < needs ? F("TooLow", { name: L(`Interface.${kind}`), needs, complexity }) : "",
      note: kind ? L(`Note.${kind}`) : "",
      familiarName: kind ? INTERFACE_FAMILIARITY[kind] : "",
      canLearn: known !== null && api.registry.isRuleOn("familiarity"),
      familiar: known === true,
    };
  }
  if (on.languages()) {
    context.languages = {
      options: LANGUAGES.map((value) => ({ value, selected: value === setup.language, label: L(`Language.${value || "none"}`) })),
      note: L(`LanguageNote.${setup.language || "none"}`),
      dedicated: builtWith(item, "dedicated") ? L("Dedicated") : "",
    };
  }
  if (on.eras() && builtWith(item, "vacuumTube")) context.burnout = setup.burntOut ? L("BurntOut") : L("Tubes");
  return context;
}

function sectionListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-ht-computing]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.htComputing);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "familiar") {
        const name = String(input.dataset.name ?? "");
        if (item.actor && name) await api.actors.setFamiliar(item.actor, name, Boolean(value));
        return;
      }
      await storeSetup(item, { [field]: value } as never);
    });
  });
}

/** Registers the table-side parts. */
export function readyComputing(api: GWorldApi, on: ComputingSwitches): void {
  // A computer down with a burned-out tube, and the programs on it, serve no skill as tools
  // (HT:EE p. 37; API 1.145.0): the system passes them over for working gear when it picks a
  // skill's tool. Registered before the tool kits' grader.
  api.data.registerToolGrade({
    module: MODULE_ID,
    key: "ht-burnt-out-computer",
    grade: (item) => {
      const computer = computerBehind(item);
      return computer && isBurntOut(computer, on) ? false : null;
    },
  });

  // A Typing roll named with no computer: the touch-screen computer the typist has in use, typed on without a keyboard (HT:EE p. 40).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.interfaces() || context?.item || !isTyping(String(context?.skill ?? "")) || !Array.isArray(context?.modifiers)) return;
    const computer = [...(context.actor?.items ?? [])].find((i: any) => i?.system?.equipped === true && isHighTechComputer(i) && computerSetup(i).interface === "touch");
    if (computer && !isBurntOut(computer, on)) context.modifiers.push(...interfaceRollLines(api, context.actor, computer, String(context.skill)).filter((l) => l.key === "ht.interface.touchTyping"));
  });

  // After High-Tech's own computer lines (information/), which a high-level language may lift.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!context?.item || !(on.eras() || on.interfaces() || on.languages())) return;
    const computer = computerBehind(context.item);
    if (!computer) return;
    // A burned-out tube stops the machine until the minor repair (HT:EE p. 37; Campaigns p. 484):
    // a roll its caller still makes with it, or with a program on it, is refused.
    if (isBurntOut(computer, on)) {
      if (!context.refusal) context.refusal = F("BurntOutRefusal", { name: computer.name });
      return;
    }
    if (!(on.interfaces() || on.languages())) return;
    const skill = String(context.skill ?? "");
    const penalties = (context.modifiers as any[]).reduce((sum, m) => sum + Math.min(0, Number(m?.value) || 0), 0);
    if (on.interfaces()) context.modifiers.push(...interfaceRollLines(api, context.actor, computer, skill, penalties, Array.isArray(context.tags) ? context.tags : []));
    if (on.languages() && isProgramming(skill)) {
      const { lines, lift } = languageLines(context.actor, computer);
      for (let i = context.modifiers.length - 1; i >= 0; i -= 1) if (lift.includes(context.modifiers[i]?.key)) context.modifiers.splice(i, 1);
      context.modifiers.push(...lines);
      const kept = complementaryFor(context.actor, computer);
      if (kept !== null) context.modifiers.push({ key: "ht.complementary", label: L("ComplementaryLine"), value: kept });
    }
  });

  // A complementary roll counts once: the programming roll that takes it uses it up.
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!on.languages() || !context?.item || !isProgramming(String(context.skill ?? ""))) return;
    const computer = computerBehind(context.item);
    if (computer && complementaryFor(context.actor, computer) !== null) void context.actor.unsetFlag(MODULE_ID, COMPLEMENTARY_FLAG);
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-computing",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-computing.hbs`,
    visible: (item) => isHighTechComputer(item) && (on.interfaces() || on.languages() || (on.eras() && builtWith(item, "vacuumTube"))),
    context: (item) => sectionContext(api, item, on),
    listeners: (element, item) => sectionListeners(api, element, item),
  });

  const computerRow = (item: any) => isHighTechComputer(item) && item.system?.carried !== false;
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tube-burnout",
    itemTypes: ["equipment"],
    label: L("Burnout"),
    icon: "fa-solid fa-lightbulb",
    visible: (item) => on.eras() && computerRow(item) && builtWith(item, "vacuumTube") && !computerSetup(item).burntOut,
    run: (item, actor) => rollBurnout(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tube-repair",
    itemTypes: ["equipment"],
    label: L("Repair"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => on.eras() && computerRow(item) && computerSetup(item).burntOut,
    run: (item, actor) => repairBurnout(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-computer-work",
    itemTypes: ["equipment"],
    label: L("Work"),
    icon: "fa-solid fa-computer",
    visible: (item) => on.interfaces() && computerRow(item) && ["text", "vr"].includes(computerSetup(item).interface),
    run: (item, actor) => workComputer(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-light-pen",
    itemTypes: ["equipment"],
    label: L("LightPen"),
    icon: "fa-solid fa-pen",
    visible: (item) => on.interfaces() && item.system?.carried !== false && isLightPen(item.name),
    run: (item, actor) => lightPenRoll(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-complementary",
    itemTypes: ["equipment"],
    label: L("Complementary"),
    icon: "fa-solid fa-terminal",
    visible: (item) => on.languages() && computerRow(item) && computerSetup(item).language !== "wired" && !builtWith(item, "dedicated"),
    run: (item, actor) => complementaryRoll(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-wire-program",
    itemTypes: ["equipment"],
    label: L("Wire"),
    icon: "fa-solid fa-plug",
    visible: (item) => on.languages() && computerRow(item) && (computerSetup(item).language === "wired" || builtWith(item, "dedicated")),
    run: (item, actor) => wireProgram(api, item, actor),
  });
}
