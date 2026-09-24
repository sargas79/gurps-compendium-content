/**
 * The Electricity and Electronics supplement's power (HT:EE pp. 9, 16-18),
 * on High-Tech's battery table and the shared cell engine, under three of
 * High-Tech's switches (decision E1 in #471):
 *
 *   - **Battery chemistry (batteryChemistry):** a battery's chemistry is a
 *     field on its record, never a second item. On one of High-Tech's
 *     battery records it reprices the battery from the printed size (T to M
 *     alkaline, L and VL lead-acid) through the chosen chemistry's multiples
 *     of alkaline; on a gadget it is the chemistry of the batteries loaded,
 *     which scales their endurance and weight, prices new ones, and says
 *     whether they are recharged, through the engine's cell variant. Rows for
 *     a lithium-ion battery's runaway (3d burning, a large-area injury from
 *     M up) and the car-battery recharger's high-amperage setting, whose
 *     critical failure blows the battery up with an acid splash; the
 *     voltaic pile's HT roll every half hour; and a confined lithium-ion
 *     battery as an explosive, REF 0.25, for the Demolition tool.
 *   - **Energy storage (energyStorage):** capacitors and banks of them, a
 *     row that discharges one into someone as a nonlethal shock at its HT
 *     modifier, worse for each capacitor wired in (-2 for a second, then the
 *     Speed/Range penalty for the count); supercapacitors as a choice on a
 *     battery record, twenty times the price for the next size's output for
 *     a minute; flywheels by material, repriced and reweighed. The
 *     supplement's generators join High-Tech's generator table as data
 *     (`generators.ts`), read by the Gear tab's generators section.
 *   - **External power (externalPower):** the five grades of external power
 *     a device runs on, a field on its record, shown on its power line; a
 *     device printed with batteries or a grade can be plugged in without an
 *     adapter; and built-in rechargeable batteries (an endurance with no
 *     cell) are tracked on the Gear tab and recharged in place.
 *
 * They apply to High-Tech's records (the supplement's are High-Tech's) and to
 * gear that names no book.
 */

import { bookOf, isRuleOn } from "../../../shared/book-tables.js";
import { cellOf, powerData, registerCellVariant, storePower, type CellVariant, type PowerData } from "../../../shared/power/data.js";
import type { CellFigures } from "../../../shared/power/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  CHARGER_HOURS,
  CHARGER_SKILLS,
  CHEMISTRIES,
  CHEMISTRY_KEYS,
  LITHIUM_ION_REF,
  PRINTED_CHEMISTRY,
  VOLTAIC_PILE,
  batteryInChemistry,
  chargerExplosion,
  chemistryFactors,
  isChemistry,
  roundCost,
  roundWeight,
  runawayDamage,
  runsAway,
  type RunawayCause,
} from "./chemistry.js";
import { GRADES, gradesOf, type PowerGrade } from "./grades.js";
import {
  CAPACITOR_BANK,
  FLYWHEEL_MATERIALS,
  MATERIALS,
  SUPERCAPACITOR,
  capacitorBankModifier,
  flywheelFigures,
  flywheelPrice,
  materialFits,
  supercapacitorStandsFor,
} from "./storage.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Energy.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Energy.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

export interface ElectricSwitches {
  chemistry: () => boolean;
  storage: () => boolean;
  external: () => boolean;
}

/** High-Tech's gear, or gear that names no book. */
function isOwnGear(item: any): boolean {
  if (item?.type !== "equipment" && item?.type !== "armor") return false;
  const book = bookOf(item);
  return book === null || book === "high-tech";
}

/** The size of one of High-Tech's battery records ("M Battery"), or null for anything else. */
export function batterySizeOf(item: any, figures: CellFigures): string | null {
  if (item?.type !== "equipment" || !isOwnGear(item) || !figures.spareRecord) return null;
  const name = String(item.name ?? "");
  return figures.sizes.find((size) => figures.spareRecord!.replace("{size}", size) === name) ?? null;
}

/** The size of the batteries a gadget has loaded, where it runs on High-Tech's. */
function loadedSize(item: any, figures: CellFigures): { size: string; cells: number } | null {
  if (!isOwnGear(item)) return null;
  const data = powerData(item);
  return data.figures === figures ? cellOf(data) : null;
}

/**
 * The cell variant a chemistry gives a gadget's batteries (HT:EE pp. 16-18),
 * against the size as High-Tech prints it, while the switch is on.
 */
export function chemistryVariant(item: any, cell: { size: string } | null, figures: CellFigures, own: CellFigures, on: () => boolean): CellVariant | null {
  if (figures !== own || !cell || !on() || !isOwnGear(item)) return null;
  const chosen = item?.system?.extensions?.[MODULE_ID]?.power?.chemistry;
  const factors = chemistryFactors(cell.size, chosen);
  if (!factors) return null;
  return { label: `GCC.HT.Energy.Chemistry.${chosen}`, ...factors };
}

/** Registers the chemistry variant with the engine, under the switch's full key. */
export function registerChemistryVariant(own: CellFigures, ruleKey: string): void {
  registerCellVariant((item, cell, figures) => chemistryVariant(item, cell, figures, own, () => isRuleOn(ruleKey)));
}

/** A battery record's price and weight in its chemistry, or as a supercapacitor (HT:EE pp. 16-18). */
export function batteryRecordPrice(item: any, figures: CellFigures, price: { cost: number; weight: number }, on: ElectricSwitches): { cost: number; weight: number; label: string } | null {
  const size = batterySizeOf(item, figures);
  if (!size) return null;
  const chosen = item?.system?.extensions?.[MODULE_ID]?.power?.chemistry;
  if (chosen === SUPERCAPACITOR.key) {
    // Twenty times the price of an alkaline battery of the size, which weighs what one does.
    const alkaline = chemistryFactors(size, "alkaline");
    if (!on.storage() || !alkaline) return null;
    return { cost: roundCost(price.cost * alkaline.cost * SUPERCAPACITOR.cost), weight: roundWeight(price.weight * alkaline.weight), label: "Supercapacitor" };
  }
  if (!on.chemistry()) return null;
  const changed = batteryInChemistry(size, chosen, price);
  return changed ? { ...changed, label: "Chemistry" } : null;
}

/** A flywheel's price and weight in its material (HT:EE p. 18), or null. */
export function flywheelRecordPrice(item: any, price: { cost: number; weight: number }, on: ElectricSwitches): { cost: number; weight: number } | null {
  if (!on.storage() || !isOwnGear(item)) return null;
  const storage = powerData(item).storage;
  return storage.kind === "flywheel" ? flywheelPrice(storage.size, storage.material, price) : null;
}

// ── the item sheet ───────────────────────────────────────────────────────────

/** The grades a device runs on, with what each is, as lines. */
function gradeLines(data: PowerData): string[] {
  return gradesOf(data.grades).map((grade: PowerGrade) => F(GRADES[grade].tl ? "GradeLine" : "GradeLineNoTl", { grade: L(`Grade.${grade}`), tl: GRADES[grade].tl, what: L(`GradeHint.${grade}`) }));
}

/** Whether the section has anything to show for the item. */
function sectionShows(item: any, figures: CellFigures, on: ElectricSwitches): boolean {
  if (!isOwnGear(item)) return false;
  const data = powerData(item);
  const battery = batterySizeOf(item, figures) !== null;
  if (on.chemistry() && (battery || loadedSize(item, figures) !== null)) return true;
  if (on.storage() && (battery || data.storage.kind === "flywheel" || data.storage.kind === "capacitor")) return true;
  return on.external() && (data.grades.length > 0 || data.builtIn);
}

function sectionContext(api: GWorldApi, item: any, figures: CellFigures, on: ElectricSwitches): Record<string, unknown> {
  const data = powerData(item);
  const battery = batterySizeOf(item, figures);
  const loaded = loadedSize(item, figures);
  const size = battery ?? loaded?.size ?? null;
  const chosen = data.chemistry;
  const lines: string[] = [];
  let chemistry: Record<string, unknown> | null = null;
  const offerSuper = on.storage() && battery !== null;
  if (size && ((on.chemistry() && (battery || loaded)) || offerSuper)) {
    const printed = PRINTED_CHEMISTRY[size];
    const options = [
      { value: "", label: F("PrintedAs", { chemistry: printed ? L(`Chemistry.${printed}`) : "" }), selected: !chosen },
      ...(on.chemistry() ? CHEMISTRY_KEYS.map((key) => ({ value: key, label: F("ChemistryOption", { chemistry: L(`Chemistry.${key}`), tl: CHEMISTRIES[key].tl }), selected: chosen === key })) : []),
      ...(offerSuper ? [{ value: SUPERCAPACITOR.key, label: F("ChemistryOption", { chemistry: L("Chemistry.supercapacitor"), tl: SUPERCAPACITOR.tl }), selected: chosen === SUPERCAPACITOR.key }] : []),
    ];
    chemistry = { options };
    const factors = on.chemistry() ? chemistryFactors(size, chosen) : null;
    if (factors) {
      lines.push(F("ChemistryLine", {
        endurance: Math.round(factors.endurance * 100) / 100,
        cost: Math.round(factors.cost * 100) / 100,
        weight: Math.round(factors.weight * 100) / 100,
        recharge: L(factors.rechargeable ? "Rechargeable" : "Throwaway"),
      }));
      if (size === "M" && chosen && chosen !== "alkaline") lines.push(L("MediumNote"));
      if (chosen === "lithiumIon") lines.push(L("LithiumIonHint"));
      if (chosen === "wetCell") lines.push(L("WetCellHint"));
    }
    if (chosen === SUPERCAPACITOR.key && offerSuper) {
      const next = supercapacitorStandsFor(size, figures.sizes);
      lines.push(next ? F("SupercapacitorLine", { size: next, minutes: SUPERCAPACITOR.minutes }) : F("SupercapacitorLargest", { size, minutes: SUPERCAPACITOR.minutes }));
    }
  }
  let flywheel: Record<string, unknown> | null = null;
  if (on.storage() && data.storage.kind === "flywheel") {
    const f = flywheelFigures(data.storage.size, data.storage.material);
    flywheel = {
      options: FLYWHEEL_MATERIALS.filter((m) => materialFits(m, data.storage.size)).map((m) => ({
        value: m === "carbonFiber" ? "" : m,
        label: F("MaterialOption", { material: L(`Material.${m}`), tl: MATERIALS[m].tl }),
        selected: (data.storage.material || "carbonFiber") === m,
      })),
    };
    if (f) {
      lines.push(F(f.grade ? "FlywheelLine" : "FlywheelLineNoGrade", {
        energy: Math.round(f.energy * 100) / 100,
        size: data.storage.size,
        peak: f.peak,
        grade: f.grade ? L(`Grade.${f.grade}`) : "",
        minutes: f.minutes,
      }));
    }
  }
  let capacitor: Record<string, unknown> | null = null;
  if (on.storage() && data.storage.kind === "capacitor") {
    const modifier = capacitorBankModifier(data.storage.shock, data.storage.count, (yards) => Number(api.rules.speedRangeModifier(yards)) || 0);
    capacitor = { count: data.storage.count };
    lines.push(F(data.storage.count > 1 ? "BankLine" : "CapacitorLine", { count: data.storage.count, modifier, tl: CAPACITOR_BANK.tl }));
  }
  if (on.external()) {
    lines.push(...gradeLines(data));
    if (data.builtIn) lines.push(F("BuiltInLine", { endurance: data.draw?.endurance ?? "" }));
  }
  return { editable: Boolean(item?.isOwner ?? true), chemistry, flywheel, capacitor, lines };
}

function sectionListeners(element: HTMLElement, item: any): void {
  element.querySelector<HTMLSelectElement>("[data-ee-chemistry]")?.addEventListener("change", async (event) => {
    const value = String((event.target as HTMLSelectElement).value ?? "");
    await storePower(item, { chemistry: isChemistry(value) || value === SUPERCAPACITOR.key ? value : "" } as never);
  });
  element.querySelector<HTMLSelectElement>("[data-ee-material]")?.addEventListener("change", async (event) => {
    const value = String((event.target as HTMLSelectElement).value ?? "");
    await item.update({ [`system.extensions.${MODULE_ID}.power.storage.material`]: value });
  });
  element.querySelector<HTMLInputElement>("[data-ee-capacitors]")?.addEventListener("change", async (event) => {
    const value = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1));
    await item.update({ [`system.extensions.${MODULE_ID}.power.storage.count`]: value });
  });
}

// ── dialogs and cards ────────────────────────────────────────────────────────

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const select = (name: string, options: Array<[string, string]>, chosen = "") =>
  `<select name="${name}">${options.map(([value, label]) => `<option value="${esc(value)}"${value === chosen ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
const field = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The best of the skills the character has, or null. */
function bestSkill(api: GWorldApi, actor: any, skills: readonly string[]): { skill: string; level: number } | null {
  let best: { skill: string; level: number } | null = null;
  for (const skill of skills) {
    const level = api.actors.skillLevel(actor, skill);
    if (typeof level === "number" && Number.isFinite(level) && (!best || level > best.level)) best = { skill, level };
  }
  return best;
}

/** The first token the user has targeted, else the character holding the item. */
function victimOf(actor: any): any {
  return [...((game as any).user?.targets ?? [])][0]?.actor ?? actor;
}

// ── lithium-ion runaway (HT:EE p. 18) ────────────────────────────────────────

/** The lithium-ion battery or gadget batteries, their size, or null. */
function lithiumIonSize(item: any, figures: CellFigures): string | null {
  if (powerData(item).chemistry !== "lithiumIon") return null;
  return batterySizeOf(item, figures) ?? loadedSize(item, figures)?.size ?? null;
}

export async function lithiumIonRunaway(api: GWorldApi, item: any, actor: any, figures: CellFigures): Promise<void> {
  const size = lithiumIonSize(item, figures);
  if (!size || !actor) return;
  const answer = await ask(L("Runaway.Title"),
    `<p class="ihint">${esc(L("Runaway.Hint"))}</p>` + row(L("Runaway.Cause"), select("cause", [["short", L("Runaway.short")], ["crushed", L("Runaway.crushed")], ["overcharged", L("Runaway.overcharged")]])),
    (form) => ({ cause: (field(form, "cause")?.value ?? "short") as RunawayCause }));
  if (!answer) return;
  let held: boolean | null = null;
  if (answer.cause !== "short") {
    const ht = Math.max(1, Number(api.items.objectStats(item)?.ht) || 10);
    const result: any = await api.roll.success({ actor, base: ht, kind: "attribute", skill: "HT", item, label: F("Runaway.HtLabel", { name: item.name }), modifiers: [], tags: ["lithiumIonRunaway"] } as any);
    if (!result || "refused" in result) return;
    held = Boolean(result.success);
  }
  if (!runsAway(answer.cause, held)) {
    await say(actor, item.name, [L("Runaway.Held")]);
    return;
  }
  const damage = runawayDamage(size, figures.sizes);
  await say(actor, item.name, [L(damage.largeArea ? "Runaway.LargeArea" : "Runaway.OneLocation"), L("Runaway.Fire")]);
  await api.roll.damage({ actor, item, label: F("Runaway.Label", { name: item.name }), formula: damage.formula, damageType: "burn", largeArea: damage.largeArea, source: "lithiumIonRunaway" } as any);
}

// ── the car-battery recharger (HT:EE p. 18) ──────────────────────────────────

const CHARGER_NAME = /^Car-Battery Recharger$/;

export async function chargeBattery(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("Charger.Title"),
    `<p class="ihint">${esc(L("Charger.Hint"))}</p>`
    + row(L("Charger.Setting"), select("setting", [["medium", F("Charger.medium", { hours: CHARGER_HOURS.medium })], ["high", F("Charger.high", { hours: CHARGER_HOURS.high })]]))
    + row(L("Charger.Size"), select("size", [["L", "L"], ["VL", "VL"]])),
    (form) => ({ setting: field(form, "setting")?.value === "high" ? "high" : "medium", size: field(form, "size")?.value === "VL" ? "VL" : "L" }));
  if (!answer) return;
  if (answer.setting === "medium") {
    await say(actor, item.name, [F("Charger.Charged", { hours: CHARGER_HOURS.medium })]);
    return;
  }
  // The high setting has to be watched: Electrician, or Mechanic for the engine.
  const mechanics = [...(actor.items ?? [])].filter((i: any) => i?.type === "skill" && /^Mechanic\b/i.test(String(i.name ?? ""))).map((i: any) => String(i.name));
  const best = bestSkill(api, actor, [...new Set([...CHARGER_SKILLS, ...mechanics])]);
  if (!best) {
    ui.notifications?.warn(F("Charger.NoSkill", { skills: CHARGER_SKILLS.join(", ") }));
    return;
  }
  const result: any = await api.roll.success({ actor, base: best.level, skill: best.skill, item, label: F("Charger.RollLabel", { name: item.name }), modifiers: [], tags: ["batteryCharger"] } as any);
  if (!result || "refused" in result) return;
  if (!result.criticalFailure) {
    await say(actor, item.name, [F("Charger.Charged", { hours: CHARGER_HOURS.high })]);
    return;
  }
  const blast = chargerExplosion(answer.size);
  await say(actor, item.name, [F("Charger.Explodes", { size: answer.size }), F("Charger.Acid", { yards: blast.acidYards })]);
  await api.roll.damage({ actor, item, label: F("Charger.BlastLabel", { size: answer.size }), formula: blast.formula, damageType: "cr", explosive: true, source: "batteryExplosion" } as any);
}

// ── the voltaic pile (HT:EE p. 16) ───────────────────────────────────────────

const PILE_NAME = /^Voltaic Pile$/;

export async function runVoltaicPile(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const result: any = await api.roll.success({ actor, base: VOLTAIC_PILE.ht, kind: "attribute", skill: "HT", item, label: F("Pile.Label", { name: item.name, minutes: VOLTAIC_PILE.minutes }), modifiers: [], tags: ["voltaicPile"] } as any);
  if (!result || "refused" in result) return;
  await say(actor, item.name, [result.success ? F("Pile.Runs", { minutes: VOLTAIC_PILE.minutes }) : L("Pile.Blocked")]);
}

// ── discharging a capacitor (HT:EE p. 17) ────────────────────────────────────

export async function dischargeCapacitor(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = powerData(item);
  if (data.storage.kind !== "capacitor") return;
  const answer = await ask(L("Discharge.Title"),
    `<p class="ihint">${esc(L("Discharge.Hint"))}</p>`
    + row(L("Discharge.Count"), `<input type="number" name="count" value="${data.storage.count}" min="1" step="1" style="width:6em">`),
    (form) => ({ count: Math.max(1, Math.floor(Number(field(form, "count")?.value) || 1)) }));
  if (!answer) return;
  const modifier = capacitorBankModifier(data.storage.shock, answer.count, (yards) => Number(api.rules.speedRangeModifier(yards)) || 0);
  const victim = victimOf(actor);
  if (!victim) return;
  await api.hazards.shock({ actor: victim, kind: "nonlethal", modifier, continuous: false } as any);
}

// ── registration ─────────────────────────────────────────────────────────────

/** Registers the supplement's price modifiers, item sheet section, row actions and explosive. */
export function readyElectricity(api: GWorldApi, figures: CellFigures, on: ElectricSwitches): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ee-battery-chemistry",
    types: ["equipment"],
    apply: (item: any, price: { cost: number; weight: number }) => {
      const changed = batteryRecordPrice(item, figures, price, on);
      return changed ? { cost: changed.cost, weight: changed.weight, label: L(changed.label === "Chemistry" ? "ChemistryPrice" : "SupercapacitorPrice") } : null;
    },
  } as any);

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ee-flywheel",
    types: ["equipment"],
    apply: (item: any, price: { cost: number; weight: number }) => {
      const changed = flywheelRecordPrice(item, price, on);
      return changed ? { ...changed, label: L("FlywheelPrice") } : null;
    },
  } as any);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ee-energy-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-energy-item.hbs`,
    visible: (item) => sectionShows(item, figures, on),
    context: (item) => sectionContext(api, item, figures, on),
    listeners: (element, item) => sectionListeners(element, item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-lithium-runaway",
    itemTypes: ["equipment"],
    label: L("Runaway.Title"),
    icon: "fa-solid fa-fire",
    visible: (item) => on.chemistry() && isOwnGear(item) && lithiumIonSize(item, figures) !== null,
    run: (item, actor) => { void lithiumIonRunaway(api, item, actor, figures); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-battery-charger",
    itemTypes: ["equipment"],
    label: L("Charger.Title"),
    icon: "fa-solid fa-car-battery",
    visible: (item) => on.chemistry() && isOwnGear(item) && CHARGER_NAME.test(String(item?.name ?? "")),
    run: (item, actor) => { void chargeBattery(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-voltaic-pile",
    itemTypes: ["equipment"],
    label: L("Pile.Title"),
    icon: "fa-solid fa-flask",
    visible: (item) => on.chemistry() && isOwnGear(item) && PILE_NAME.test(String(item?.name ?? "")),
    run: (item, actor) => { void runVoltaicPile(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-capacitor-discharge",
    itemTypes: ["equipment"],
    label: L("Discharge.Title"),
    icon: "fa-solid fa-bolt",
    visible: (item) => on.storage() && isOwnGear(item) && powerData(item).storage.kind === "capacitor",
    run: (item, actor) => { void dischargeCapacitor(api, item, actor); },
  });

  // A confined M or larger lithium-ion battery as an improvised bomb (HT:EE p. 18).
  (api.data as any).registerExplosive?.({
    module: MODULE_ID,
    key: "ee-lithium-ion-battery",
    label: L("LithiumIonBomb"),
    ref: LITHIUM_ION_REF,
    tl: 8,
    available: () => on.chemistry(),
  });
}
