/**
 * The gadget engine, registered with the system through the add-on API, for
 * every book that prints the rule (Ultra-Tech pp. 14-17; High-Tech pp. 8-11
 * prints it for its TLs).
 *
 * Each book registers its table in `GADGET_TABLES` -- its figures, its three
 * switches and its text -- then calls `initGadgets` and `readyGadgets`, which
 * register once however many books call them. What they register reads the
 * item's own book's table on every call:
 *
 *   - **init:** the gadget fields on equipment and armour.
 *   - **ready:** the price modifier for the options a gadget was built with
 *     and for the size of the character carrying it; the HT a rugged gadget
 *     (and, where the book says so, a fragile or a quality one) has on
 *     equipment failure; where the book prints styling tiers, their reaction
 *     bonus while the piece is shown; where the size scales the cells too,
 *     the cell count; and an item sheet section that holds the options and
 *     shows the statistics, the price, the antique's Legality Class and
 *     whether the gadget is worth maintaining; and row buttons for the
 *     maintenance check a gadget worth maintaining takes (a technical skill,
 *     a point of HT on its equipment failure rolls for each check missed or
 *     failed) and the major repair that puts a point back (Campaigns
 *     pp. 484-485).
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { listedCellWeight, registerPowerAdjuster } from "../power/data.js";
import { BUILDS, DISGUISES, gadgetItem, isBuilt, registerGadgetData, storeGadget, type GadgetItem } from "./data.js";
import {
  allowedOptions,
  antiqueLegality,
  costFactor,
  gadgetDr,
  gadgetHealth,
  gadgetPrice,
  gradesOf,
  MAINTENANCE_SKILLS,
  MAJOR_REPAIR,
  maintenanceOutcome,
  maintenanceSkillFor,
  maintenanceThreshold,
  needsMaintenanceChecks,
  smFactor,
  stylingReaction,
  takesBuildOptions,
  type GadgetFigures,
  type GadgetOptions,
  type GearKind,
  type Grade,
} from "./rules.js";

/** One book's gadget table. */
export interface GadgetTable extends BookTable {
  figures: GadgetFigures;
  /** The full keys of the book's switches for the options, sizing and antiques. */
  switches: { options: string; sm: string; legality: string };
  /** Where the book's text for the sheet sits: "GCC.UT" reads "GCC.UT.Gadget.Title". */
  i18n: string;
  /**
   * The options a piece of the book's gear is built with as listed, which its
   * list price already pays for (High-Tech p. 52: tactical lights are rugged
   * and expensive to begin with): never charged again, always counted in its
   * statistics. Null or left out for gear built plain.
   */
  builtIn?: (item: any) => BuiltIn | null;
}

/** Options a piece is built with as listed. */
export interface BuiltIn {
  rugged?: boolean;
  grade?: Grade;
}

/** The options a table says a piece is built with as listed, or null. */
function builtInOf(table: GadgetTable | null, item: any): BuiltIn | null {
  try {
    const built = table?.builtIn?.(item) ?? null;
    return built && (built.rugged || built.grade) ? built : null;
  } catch {
    return null;
  }
}

/** The options as they count for the piece's statistics: what was chosen, and what it is built with as listed. */
function withBuiltIn(options: GadgetOptions, built: BuiltIn | null): GadgetOptions {
  if (!built) return options;
  return { ...options, rugged: options.rugged || built.rugged === true, grade: built.grade || options.grade };
}

/** Every book's gadget table. */
export const GADGET_TABLES = new BookTables<GadgetTable>();

/** The table each part of the rule takes for an item, where that part is switched on. */
export function gadgetTables(item: any, on: (key: string) => boolean = isRuleOn): { options: GadgetTable | null; sm: GadgetTable | null; legality: GadgetTable | null } {
  return {
    options: GADGET_TABLES.forItem(item, (t) => on(t.switches.options)),
    sm: GADGET_TABLES.forItem(item, (t) => on(t.switches.sm)),
    legality: GADGET_TABLES.forItem(item, (t) => on(t.switches.legality)),
  };
}

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Gadget.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Gadget.${key}`, data);

/** Registers what must exist before the world's data is read. */
export function initGadgets(): void {
  registerGadgetData();
}

/** A gadget is anything carried; a character's own body is not gear. */
function isGear(item: any): boolean {
  return item?.type === "equipment" || item?.type === "armor";
}

/**
 * What kind of gear an item is, for the options a book keeps off some:
 * armour is armour (and clothing, which the system keeps as armour or prices
 * from the cost of living), and anything with an attack is a weapon.
 */
export function gearKinds(item: any): GearKind[] {
  const system = item?.system ?? {};
  const kinds: GearKind[] = [];
  if (item?.type === "armor") kinds.push("armor", "clothing");
  else if ((Number(system.costOfLivingPercent) || 0) > 0) kinds.push("clothing");
  if ((system.meleeModes?.length ?? 0) > 0 || (system.rangedModes?.length ?? 0) > 0 || system.category === "weapon") kinds.push("weapon");
  return kinds;
}

/** The table's price and weight: the system's list figures where it keeps them, the item's otherwise. */
function listOf(item: any): { cost: number; weight: number } {
  const system = item?.system ?? {};
  return {
    cost: Math.max(0, Number(system.listCost) || Number(system.cost) || 0),
    weight: Math.max(0, Number(system.listWeight) || Number(system.weight) || 0),
  };
}

/** The Size Modifier of whoever carries the gadget. */
export function carrierSm(item: any): number {
  return Math.round(Number(item?.actor?.system?.sm) || 0);
}

/** The campaign's tech level, as the carrier's sheet states it. */
function campaignTl(item: any): number | null {
  const tl = Number(item?.actor?.system?.tl);
  return Number.isFinite(tl) && tl > 0 ? tl : null;
}

/** The gadget's own tech level, where the item states one. */
function itemTl(item: any): number | null {
  const raw = String(item?.system?.tl ?? "").trim();
  const match = /-?\d+/.exec(raw);
  return match ? Number(match[0]) : null;
}

/**
 * What the gadget's power cells weigh, which cheap and expensive leave out of
 * their weight: the cells its record lists where the book says the cell
 * engine knows them and its switch is on, else the gadget's own field. The
 * list weight holds the listed cells, so cells swapped in are the cell
 * engine's to weigh, as the difference, after this (High-Tech p. 10).
 */
export function gadgetCellWeight(item: any, data: GadgetItem, figures: GadgetFigures | null): number {
  const listed = figures?.cellsFromPower ? listedCellWeight(item) : null;
  return listed ?? data.cellWeight;
}

/**
 * The options a gadget is priced with under a table: what that book allows
 * on this kind of gear, less those it is built with as listed, whose price is
 * already in the list's -- they aren't added again.
 */
function optionsUnder(table: GadgetTable, item: any, data: GadgetItem): GadgetItem {
  const allowed = allowedOptions(table.figures, data.options, gearKinds(item));
  const built = builtInOf(table, item);
  if (!built) return { ...data, options: allowed };
  return { ...data, options: { ...allowed, rugged: built.rugged ? false : allowed.rugged, grade: built.grade ? "" : allowed.grade } };
}

/**
 * What the gadget costs and weighs once the options it was built with and the
 * size of its carrier are applied to the table's figures. Null where nothing
 * the module knows about changes them.
 */
export function gadgetPriceOf(item: any, data: GadgetItem, on: (key: string) => boolean = isRuleOn): { cost: number; weight: number; factor: number; size: number; table: GadgetTable } | null {
  if (!isGear(item)) return null;
  const tables = gadgetTables(item, on);
  const allowed = tables.options ? optionsUnder(tables.options, item, data) : data;
  const built = tables.options !== null && isBuilt(allowed);
  const size = tables.sm && data.adjustForSm ? smFactor(tables.sm.figures, carrierSm(item)) : 1;
  if (!built && size === 1) return null;
  const list = listOf(item);
  const priced = built
    ? gadgetPrice(tables.options!.figures, { listCost: list.cost, listWeight: list.weight, cellWeight: gadgetCellWeight(item, data, tables.options!.figures), options: allowed.options })
    : { cost: list.cost, weight: list.weight, costFactor: 1 };
  return {
    cost: Math.round(priced.cost * size * 100) / 100,
    weight: Math.round(priced.weight * size * 100) / 100,
    factor: priced.costFactor,
    size,
    table: (tables.options ?? tables.sm)!,
  };
}

/** The statistics the book assumes for a gadget that states none, with the options its table says it is built with as listed. */
export function gadgetStatistics(api: GWorldApi, figures: GadgetFigures, item: any, data: GadgetItem, weight: number, table: GadgetTable | null = null): { hp: number; ht: number; dr: number } {
  const own = item?.type === "armor" ? Number(item?.system?.dr) || null : null;
  const options = withBuiltIn(allowedOptions(figures, data.options, gearKinds(item)), builtInOf(table, item));
  return {
    hp: api.rules.objectHitPoints(Math.max(0, weight), "unliving"),
    ht: gadgetHealth(figures, { rugged: options.rugged, own: data.health || null, grade: options.grade, quality: String(item?.system?.equipmentQuality ?? "") }),
    dr: gadgetDr(figures, { build: data.build, rugged: options.rugged, own, grade: options.grade }),
  };
}

/** The lines a gadget's build puts on its equipment failure roll, under its book's table. */
export function failureLines(table: GadgetTable, item: any): Array<{ label: string; value: number }> {
  const figures = table.figures;
  const options = withBuiltIn(allowedOptions(figures, gadgetItem(item).options, gearKinds(item)), builtInOf(table, item));
  const lines: Array<{ label: string; value: number }> = [];
  if (options.rugged) lines.push({ label: L(table.i18n, "Rugged"), value: figures.rugged.health });
  const graded = options.grade ? (figures.gradeHealth?.[options.grade] ?? 0) : 0;
  if (graded) lines.push({ label: L(table.i18n, `Grade.${options.grade}`), value: graded });
  const quality = String(item?.system?.equipmentQuality ?? "");
  const fromQuality = figures.qualityHealth?.[quality] ?? 0;
  if (fromQuality) lines.push({ label: F(table.i18n, "Quality", { quality }), value: fromQuality });
  // A firearm's missed checks are the system's own field, which it takes off itself.
  const missed = systemCountsMaintenance(item) ? 0 : missedChecks(item);
  if (missed) lines.push({ label: F(table.i18n, "MissedChecksLine", { missed }), value: -missed });
  return lines;
}

// ── maintenance checks (Campaigns pp. 484-485) ──

/** The maintenance checks missed or failed since the gadget was last repaired, kept in this module's flag. */
const MISSED_FLAG = "gadgetMissedChecks";

/**
 * Whether the system keeps this thing's missed maintenance itself: a firearm,
 * whose sheet has the Basic Set's missed-maintenance field, which the system's
 * HT rolls read (Campaigns p. 485). Its checks go there, not in this module's count.
 */
export function systemCountsMaintenance(item: any): boolean {
  if (item?.type !== "equipment") return false;
  const sys = item.system ?? {};
  const weaponClass = String(sys.weaponClass ?? "");
  if (weaponClass) return weaponClass === "firearm";
  return (sys.rangedModes ?? []).some((m: any) => m?.malfunction);
}

/** The points of HT a gadget has lost to missed or failed maintenance checks (Campaigns p. 485). */
export function missedChecks(item: any): number {
  return Math.max(0, Math.floor(Number(item?.getFlag?.(MODULE_ID, MISSED_FLAG) ?? item?.flags?.[MODULE_ID]?.[MISSED_FLAG]) || 0));
}

/**
 * Whether a gadget takes maintenance checks: its book's options switch on, and
 * priced at or over the book's threshold at the campaign's TL, or with no TL
 * or threshold to weigh it against.
 */
export function maintenanceDue(api: GWorldApi, item: any): GadgetTable | null {
  if (!isGear(item)) return null;
  const table = gadgetTables(item).options;
  if (!table) return null;
  const campaign = campaignTl(item);
  if (campaign === null) return table;
  const wealthAt = (at: number) => api.rules.averageStartingWealth(at);
  if (maintenanceThreshold(table.figures, campaign, wealthAt) === null) return table;
  const cost = gadgetPriceOf(item, gadgetItem(item))?.cost ?? listOf(item).cost;
  return needsMaintenanceChecks(table.figures, { cost, tl: campaign }, wealthAt) ? table : null;
}

/** The skill a gadget's maintenance likely takes. */
function defaultMaintenanceSkill(item: any): string {
  const kinds = gearKinds(item);
  return maintenanceSkillFor({
    weapon: kinds.includes("weapon"),
    armor: item?.type === "armor",
    vehicle: item?.system?.category === "vehicle",
    powered: Boolean(item?.system?.extensions?.[MODULE_ID]?.power),
  });
}

async function sayGadget(actor: any, title: string, lines: string[]): Promise<void> {
  const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Asks which skill, and whether the check was made or missed. */
async function askMaintenance(ns: string, item: any, title: string, withMissed: boolean): Promise<{ skill: string; missed: boolean } | null> {
  const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
  const suggested = defaultMaintenanceSkill(item);
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${String(item.name ?? "")}: ${title}` },
    content: `<div class="gworld"><p class="ihint">${esc(L(ns, withMissed ? "MaintenanceHint" : "RestoreHint"))}</p>
      <div class="ifields"><label>${esc(L(ns, "MaintenanceSkill"))} <select name="skill">${MAINTENANCE_SKILLS.map((s) => `<option value="${esc(s)}"${s === suggested ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label></div>
      ${withMissed ? `<div class="ichecks"><label class="icheck"><input type="checkbox" name="missed"> ${esc(L(ns, "MaintenanceMissed"))}</label></div>` : ""}</div>`,
    ok: {
      label: title,
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        return { skill: String(root?.querySelector<HTMLSelectElement>('[name="skill"]')?.value ?? suggested), missed: Boolean(root?.querySelector<HTMLInputElement>('[name="missed"]')?.checked) };
      },
    },
    rejectClose: false,
  });
  return answer ?? null;
}

/** A skill's name without its TL and specialty, for comparing: "Armoury/TL8 (Small Arms)" is "armoury". */
export function skillBaseName(name: unknown): string {
  return String(name ?? "").replace(/\s*\(.*\)\s*$/, "").replace(/\/TL\s*\d*\s*$/i, "").trim().toLowerCase();
}

/**
 * The character's best level in a technical skill, whatever the specialty
 * ("Armoury (Small Arms)" for Armoury), with the name it goes by; else the
 * default: IQ-5, IQ-4 for Computer Operation, DX-5 for Sewing (Characters pp. 178-220).
 */
export function technicalLevel(api: GWorldApi, actor: any, skill: string): { skill: string; level: number } {
  let best: { skill: string; level: number } | null = null;
  for (const item of actor?.items ?? []) {
    if (item?.type !== "skill" || skillBaseName(item.name) !== skillBaseName(skill)) continue;
    const level = api.actors.skillLevel(actor, String(item.name));
    if (typeof level === "number" && (best === null || level > best.level)) best = { skill: String(item.name), level };
  }
  if (best) return best;
  const own = api.actors.skillLevel(actor, skill);
  if (own !== null) return { skill, level: own };
  if (skill === "Sewing") return { skill, level: (Number(api.actors.attribute(actor, "DX")) || 10) - 5 };
  return { skill, level: (Number(api.actors.attribute(actor, "IQ")) || 10) - (skill === "Computer Operation" ? 4 : 5) };
}

/** A maintenance check (Campaigns p. 485): missed or failed, the gadget loses a point of HT. */
async function checkMaintenance(api: GWorldApi, item: any, actor: any): Promise<void> {
  const table = maintenanceDue(api, item);
  if (!table || !item.isOwner) return;
  const ns = table.i18n;
  const answer = await askMaintenance(ns, item, L(ns, "MaintenanceAction"), true);
  if (!answer) return;
  let success = false;
  if (!answer.missed) {
    // The gadget is what is being maintained, not a tool the roll is made with: it isn't named as the roll's item.
    const use = technicalLevel(api, actor, answer.skill);
    const result: any = await api.roll.success({ actor, base: use.level, skill: use.skill, label: F(ns, "MaintenanceLabel", { name: item.name, skill: use.skill }), tags: ["maintenance"] } as any);
    if (!result) return;
    success = Boolean(result.success);
  }
  if (maintenanceOutcome({ missed: answer.missed, success }) === "kept") return void sayGadget(actor, String(item.name ?? ""), [L(ns, "MaintenanceKept")]);
  // A firearm's count is the system's field on its sheet, which this module doesn't write.
  if (systemCountsMaintenance(item)) {
    return void sayGadget(actor, String(item.name ?? ""), [F(ns, answer.missed ? "MaintenanceSkippedSheet" : "MaintenanceFailedSheet", { missed: (Number(item.system?.missedMaintenance) || 0) + 1 })]);
  }
  const missed = missedChecks(item) + 1;
  await item.setFlag(MODULE_ID, MISSED_FLAG, missed);
  await sayGadget(actor, String(item.name ?? ""), [F(ns, answer.missed ? "MaintenanceSkipped" : "MaintenanceFailed", { missed })]);
}

/** A point of HT lost to maintenance put back: a major repair at -2, with parts at 1d x 10% of the price (Campaigns pp. 484-485). */
async function restoreMaintenance(api: GWorldApi, item: any, actor: any): Promise<void> {
  const table = gadgetTables(item).options;
  if (!table || !item.isOwner || systemCountsMaintenance(item) || !missedChecks(item)) return;
  const ns = table.i18n;
  const answer = await askMaintenance(ns, item, L(ns, "RestoreAction"), false);
  if (!answer) return;
  // The thing under repair isn't a tool the roll is made with: it isn't named as the roll's item.
  const use = technicalLevel(api, actor, answer.skill);
  const result: any = await api.roll.success({
    actor,
    base: use.level,
    skill: use.skill,
    label: F(ns, "RestoreLabel", { name: item.name, skill: use.skill }),
    modifiers: [{ label: L(ns, "MajorRepair"), value: MAJOR_REPAIR.modifier }],
    tags: ["repair", "maintenance"],
  } as any);
  if (!result) return;
  const die = new Roll("1d6");
  await die.evaluate();
  const parts = Math.round((gadgetPriceOf(item, gadgetItem(item))?.cost ?? listOf(item).cost) * Number(die.total) * MAJOR_REPAIR.partsShare * 100) / 100;
  if (!result.success) return void sayGadget(actor, String(item.name ?? ""), [F(ns, "RestoreFailed", { parts })]);
  const missed = missedChecks(item) - 1;
  await item.setFlag(MODULE_ID, MISSED_FLAG, missed);
  await sayGadget(actor, String(item.name ?? ""), [F(ns, "Restored", { parts, missed })]);
}

/**
 * An antique's Legality Class under a book's table: its class (the stored one
 * unless given), raised for every two full TLs it trails the campaign's (the
 * carrier's sheet).
 */
export function antiqueClassOf(item: any, table: GadgetTable, lc: number | null = typeof item?.system?.lc === "number" ? Number(item.system.lc) : null): { lc: number | null; steps: number } {
  return antiqueLegality(table.figures, { lc, tl: itemTl(item), campaignTl: campaignTl(item), controlled: gadgetItem(item).controlled });
}

/** The best reaction bonus the gear a character is showing buys them, where its book prints styling tiers. */
export function stylingLine(actor: any, on: (key: string) => boolean = isRuleOn): { label: string; value: number } | null {
  let best: { label: string; value: number } | null = null;
  for (const item of actor?.items ?? []) {
    if (!isGear(item)) continue;
    const data = gadgetItem(item);
    if (!data.shown) continue;
    const table = gadgetTables(item, on).options;
    if (!table?.figures.stylingTiers) continue;
    const value = stylingReaction(table.figures, data.options.styling);
    if (value > (best?.value ?? 0)) best = { label: F(table.i18n, "StylingLine", { name: String(item.name ?? "") }), value };
  }
  return best;
}

/** The item sheet section's data, in the words of the book whose table applies. */
function itemContext(api: GWorldApi, item: any): Record<string, unknown> {
  const tables = gadgetTables(item);
  const table = (tables.options ?? tables.sm ?? tables.legality)!;
  const ns = table.i18n;
  const figures = (tables.options ?? table).figures;
  const data = gadgetItem(item);
  const priced = gadgetPriceOf(item, data);
  const weight = priced?.weight ?? listOf(item).weight;
  const built = builtInOf(tables.options, item);
  const statistics = gadgetStatistics(api, figures, item, data, weight, tables.options);
  const campaign = campaignTl(item);
  const lc = typeof item?.system?.lc === "number" ? Number(item.system.lc) : null;
  const antique = tables.legality ? antiqueClassOf(item, tables.legality) : { lc, steps: 0 };
  const cost = priced?.cost ?? listOf(item).cost;
  const wealthAt = (at: number) => api.rules.averageStartingWealth(at);
  const threshold = campaign ? maintenanceThreshold(table.figures, campaign, wealthAt) : null;
  const tiers = figures.stylingTiers ?? null;
  const reaction = tiers ? stylingReaction(figures, data.options.styling) : 0;
  // Where the cell engine weighs the record's batteries, the field shows its figure and can't be changed.
  const listedCells = figures.cellsFromPower ? listedCellWeight(item) : null;
  return {
    ns,
    data,
    listedCells: listedCells === null ? null : { weight: Math.round(listedCells * 100) / 100 },
    options: tables.options !== null,
    buildOptions: takesBuildOptions(figures, gearKinds(item)),
    // Built rugged or to a grade as listed: those aren't offered again.
    builtIn: built ? F(ns, "BuiltIn", { options: [built.rugged ? L(ns, "RuggedLabel") : "", built.grade ? L(ns, `Grade.${built.grade}`) : ""].filter(Boolean).join(", ") }) : "",
    builtRugged: built?.rugged === true,
    builtGrade: Boolean(built?.grade),
    sizeAdjusted: tables.sm !== null,
    legality: tables.legality !== null,
    controlledOffered: tables.legality?.figures.antique.exemptControlled === true,
    disguises: DISGUISES.map((value) => ({ value, label: L(ns, `Disguise.${value || "none"}`), selected: data.options.disguise === value })),
    grades: gradesOf(figures).map((value) => ({ value, label: L(ns, `Grade.${value || "none"}`), selected: data.options.grade === value })),
    builds: BUILDS.map((value) => ({ value, label: L(ns, `Build.${value}`), selected: data.build === value })),
    // A book that prints styling in tiers offers the tiers, not a free multiplier.
    stylingTiers: tiers
      ? [{ value: 0, label: L(ns, "Styling.none"), selected: reaction === 0 }, ...tiers.map((tier) => ({
          value: tier.cost,
          label: F(ns, "Styling.tier", { reaction: tier.reaction, cost: tier.cost }),
          selected: reaction === tier.reaction,
        }))]
      : null,
    styled: reaction > 0,
    priced: priced ? F(ns, "PricedAt", { cost: priced.cost, weight: priced.weight, factor: Math.round(costFactor(priced.table.figures, allowedOptions(priced.table.figures, data.options, gearKinds(item))) * 100) / 100 }) : "",
    sized: priced && priced.size !== 1 ? F(ns, "Sized", { sm: carrierSm(item), factor: priced.size < 1 ? `1/${Math.round(1 / priced.size)}` : String(priced.size) }) : "",
    statistics: F(ns, "Statistics", statistics),
    antique: antique.steps ? F(ns, "Antique", { lc: antique.lc, was: lc, campaign }) : "",
    maintenance: [
      campaign && threshold !== null ? F(ns, needsMaintenanceChecks(table.figures, { cost, tl: campaign }, wealthAt) ? "Maintained" : "Simple", { threshold, campaign }) : "",
      tables.options && systemCountsMaintenance(item) && (Number(item.system?.missedMaintenance) || 0) > 0
        ? F(ns, "MissedChecksSheet", { missed: Number(item.system.missedMaintenance) })
        : tables.options && missedChecks(item) ? F(ns, "MissedChecks", { missed: missedChecks(item) }) : "",
    ].filter(Boolean).join(" "),
  };
}

/** Writes what the sheet's fields change. */
function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-gadget]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccGadget);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      if (field === "rugged" || field === "adjustForSm" || field === "shown" || field === "controlled") await storeGadget(item, { [field]: Boolean(value) });
      else if (field === "styling") await storeGadget(item, { styling: Math.max(0, Math.min(10, Math.floor(Number(value) || 0))) });
      else if (field === "cellWeight") await storeGadget(item, { cellWeight: Math.max(0, Number(value) || 0) });
      else if (field === "health") await storeGadget(item, { health: Math.max(0, Math.floor(Number(value) || 0)) });
      else if (field === "disguise" || field === "grade" || field === "build") await storeGadget(item, { [field]: String(value) });
    });
  });
}

/**
 * How many cells a gadget sized for its carrier takes, where the book's
 * table scales the power with the weight and cost (High-Tech p. 10).
 */
export function sizedCells(item: any, on: (key: string) => boolean = isRuleOn): number | null {
  const table = gadgetTables(item, on).sm;
  if (!table?.figures.smScalesCells || !gadgetItem(item).adjustForSm) return null;
  const factor = smFactor(table.figures, carrierSm(item));
  return factor === 1 ? null : factor;
}

let readied = false;

/** Registers the table-side parts, once whichever books ask. */
export function readyGadgets(api: GWorldApi): void {
  if (readied) return;
  readied = true;

  // The options reprice the item; nothing is attached to it.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "gadget",
    types: ["equipment", "armor"],
    apply: (item) => {
      const priced = gadgetPriceOf(item, gadgetItem(item));
      return priced ? { cost: priced.cost, weight: priced.weight, label: L(priced.table.i18n, "Title") } : null;
    },
  });

  // A rugged gadget's HT bonus is what an equipment failure roll is made
  // against, and where the book says so a fragile one's loss and quality's bonus.
  Hooks.on(api.combat.hooks.equipmentFailure, (context: any) => {
    if (!isGear(context?.item)) return;
    const table = gadgetTables(context.item).options;
    if (!table) return;
    context.modifiers.push(...failureLines(table, context.item));
  });

  // Styling's reaction bonus, where the book prints it, while the piece is shown.
  Hooks.on(api.combat.hooks.reactionModifiers, (context: any) => {
    const line = stylingLine(context?.actor);
    if (line) context.modifiers.push(line);
  });

  // Maintenance checks, and the major repairs that put their HT back (Campaigns pp. 484-485).
  // The row buttons' labels are the first book's words: they are registered once.
  const ns = GADGET_TABLES.all[0]?.i18n ?? "GCC.HT";
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "gadget-maintenance",
    itemTypes: ["equipment", "armor"],
    label: L(ns, "MaintenanceAction"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => Boolean(item?.isOwner) && maintenanceDue(api, item) !== null,
    run: (item, actor) => { void checkMaintenance(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "gadget-restore",
    itemTypes: ["equipment", "armor"],
    label: L(ns, "RestoreAction"),
    icon: "fa-solid fa-toolbox",
    visible: (item) => Boolean(item?.isOwner) && isGear(item) && gadgetTables(item).options !== null && !systemCountsMaintenance(item) && missedChecks(item) > 0,
    run: (item, actor) => { void restoreMaintenance(api, item, actor); },
  });

  // A gadget sized for its carrier takes its cells in the same proportion, where the book says so.
  registerPowerAdjuster((item) => {
    const factor = sizedCells(item);
    return factor === null ? null : { cells: factor };
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "gadget-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/gadget-item.hbs`,
    visible: (item) => {
      if (!isGear(item)) return false;
      const tables = gadgetTables(item);
      return Boolean(tables.options || tables.sm || tables.legality);
    },
    context: (item) => itemContext(api, item),
    listeners: (element, item) => itemListeners(element, item),
  });
}
