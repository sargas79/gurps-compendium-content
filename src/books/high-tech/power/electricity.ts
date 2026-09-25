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
 *     voltaic pile's HT roll every half hour; the two wet cells the book
 *     names, the Daniell cell's -1 to Electrician and Electronics Operation
 *     with what it powers and the gravity cell's daily upkeep roll (a failure
 *     spends its power) and new cell; and a confined lithium-ion
 *     battery as an explosive, REF 0.25, for the Demolition tool.
 *   - **Energy storage (energyStorage):** capacitors and banks of them, a
 *     row that discharges one into someone as a nonlethal shock at its HT
 *     modifier, worse for each capacitor wired in (-2 for a second, then the
 *     Speed/Range penalty for the count); supercapacitors as a choice on a
 *     battery record, twenty times the price for the next size's output for
 *     a minute, and on a gadget one size smaller than its batteries, which
 *     then runs a minute on it; flywheels by material, repriced and
 *     reweighed, and a store a gadget can be plugged into. The
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
import { enduranceLeft, recharge, rechargeableGear } from "../../../shared/power/index.js";
import type { CellFigures } from "../../../shared/power/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  CHARGER_HOURS,
  CHARGER_SKILLS,
  CHEMISTRIES,
  CHEMISTRY_KEYS,
  DANIELL_PENALTY,
  GRAVITY_CELL,
  LITHIUM_ION_REF,
  PRINTED_CHEMISTRY,
  VOLTAIC_PILE,
  batteryInChemistry,
  chargerExplosion,
  chemistryFactors,
  daniellSkill,
  gravityCellSkills,
  isChemistry,
  isWetCell,
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
  supercapacitorFactors,
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

/**
 * The cell variant a supercapacitor gives a gadget (HT:EE p. 18): it has the
 * output of the next size up for a minute, so a gadget runs a minute on one a
 * size smaller than its batteries -- an M supercapacitor in place of an L
 * battery -- at the smaller size's weight and twenty times its price, and it
 * is recharged. None below the smallest size, or with the switch off.
 */
export function supercapacitorVariant(item: any, cell: { size: string } | null, figures: CellFigures, own: CellFigures, on: () => boolean): CellVariant | null {
  if (figures !== own || !cell || !on() || !isOwnGear(item) || batterySizeOf(item, figures) !== null) return null;
  if (item?.system?.extensions?.[MODULE_ID]?.power?.chemistry !== SUPERCAPACITOR.key) return null;
  const factors = supercapacitorFactors(cell.size, figures.sizes, (size) => figures.cells[size]!, (size) => chemistryFactors(size, "alkaline"));
  if (!factors) return null;
  return { label: "GCC.HT.Energy.SupercapacitorFor", labelData: { size: factors.size }, endurance: 1, cost: factors.cost, weight: factors.weight, rechargeable: true, fixedHours: SUPERCAPACITOR.minutes / 60 };
}

/** Registers the supercapacitor variant with the engine, under the energy storage switch's full key. */
export function registerSupercapacitorVariant(own: CellFigures, ruleKey: string): void {
  registerCellVariant((item, cell, figures) => supercapacitorVariant(item, cell, figures, own, () => isRuleOn(ruleKey)));
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
  if (on.storage() && (battery || data.storage.kind === "flywheel" || data.storage.kind === "capacitor" || loadedSize(item, figures) !== null)) return true;
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
  // A battery record may be made a supercapacitor, and a gadget run on one a size smaller than its batteries.
  const offerSuper = on.storage() && (battery !== null || (loaded !== null && figures.sizes.indexOf(loaded.size) > 0));
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
      if (isWetCell(chosen)) lines.push(L("WetCellHint"));
      if (chosen === "daniellCell") lines.push(F("DaniellHint", { penalty: DANIELL_PENALTY }));
      if (chosen === "gravityCell") lines.push(L("GravityHint"));
    }
    if (chosen === SUPERCAPACITOR.key && offerSuper && battery) {
      const next = supercapacitorStandsFor(size, figures.sizes);
      lines.push(next ? F("SupercapacitorLine", { size: next, minutes: SUPERCAPACITOR.minutes }) : F("SupercapacitorLargest", { size, minutes: SUPERCAPACITOR.minutes }));
    } else if (chosen === SUPERCAPACITOR.key && offerSuper && loaded) {
      const smaller = figures.sizes[figures.sizes.indexOf(loaded.size) - 1];
      lines.push(F("SupercapacitorGadget", { size: smaller, usual: loaded.size, minutes: SUPERCAPACITOR.minutes }));
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

/** The chemistry a gadget's loaded batteries are: the one chosen, else what High-Tech's table prints the size as. */
function loadedChemistry(item: any, figures: CellFigures): string | null {
  const loaded = loadedSize(item, figures);
  if (!loaded) return null;
  return powerData(item).chemistry || PRINTED_CHEMISTRY[loaded.size] || null;
}

/** The carried gadgets a charger can recharge: rechargeable ones on batteries of its chemistry. */
export function chargeableGear(actor: any, figures: CellFigures, chemistry: string): ReturnType<typeof rechargeableGear> {
  return rechargeableGear(actor).filter((t) => loadedChemistry(t.item, figures) === chemistry);
}

/** The select of gadgets a charger can recharge, "nothing named" first. */
function targetRow(targets: ReturnType<typeof rechargeableGear>): string {
  return targets.length
    ? row(L("Charger.Target"), select("target", [["", L("Charger.NoTarget")], ...targets.map((t): [string, string] => [String(t.item.id), F("Charger.TargetOption", { name: t.item.name, left: Math.round(t.left * 10) / 10, total: Math.round(t.total * 10) / 10 })])]))
    : "";
}

/** Recharges a gadget in full, and says so; or says the battery is charged where none is named. */
async function charged(actor: any, item: any, target: ReturnType<typeof rechargeableGear>[number] | null, hours: number | null): Promise<void> {
  if (target) await recharge(target.item, target.total);
  const line = target
    ? (hours === null ? F("Charger.GadgetChargedNoTime", { name: target.item.name }) : F("Charger.GadgetCharged", { name: target.item.name, hours }))
    : F("Charger.Charged", { hours });
  await say(actor, item.name, [line]);
}

export async function chargeBattery(api: GWorldApi, item: any, actor: any, figures?: CellFigures): Promise<void> {
  if (!actor) return;
  // A lead-acid battery in a gadget the character carries can be the one charged (HT:EE p. 18).
  const targets = figures ? chargeableGear(actor, figures, "leadAcid") : [];
  const answer = await ask(L("Charger.Title"),
    `<p class="ihint">${esc(L("Charger.Hint"))}</p>`
    + targetRow(targets)
    + row(L("Charger.Setting"), select("setting", [["medium", F("Charger.medium", { hours: CHARGER_HOURS.medium })], ["high", F("Charger.high", { hours: CHARGER_HOURS.high })]]))
    + row(L("Charger.Size"), select("size", [["L", "L"], ["VL", "VL"]])),
    (form) => ({ target: String(field(form, "target")?.value ?? ""), setting: field(form, "setting")?.value === "high" ? "high" : "medium", size: field(form, "size")?.value === "VL" ? "VL" : "L" }));
  if (!answer) return;
  const target = targets.find((t) => String(t.item.id) === answer.target) ?? null;
  // The battery that may blow up is the gadget's own, where one is named.
  const size = target && (target.size === "L" || target.size === "VL") ? target.size : answer.size;
  if (answer.setting === "medium") {
    await charged(actor, item, target, CHARGER_HOURS.medium);
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
    await charged(actor, item, target, CHARGER_HOURS.high);
    return;
  }
  const blast = chargerExplosion(size);
  await say(actor, item.name, [F("Charger.Explodes", { size }), F("Charger.Acid", { yards: blast.acidYards })]);
  await api.roll.damage({ actor, item, label: F("Charger.BlastLabel", { size }), formula: blast.formula, damageType: "cr", explosive: true, source: "batteryExplosion" } as any);
}

// ── the lithium-ion battery recharger (HT:EE p. 18) ─────────────────────────

const LITHIUM_CHARGER_NAME = /^Lithium-Ion Battery Recharger$/;

/**
 * Recharges a lithium-ion battery plugged into the recharger (HT:EE p. 18):
 * a gadget the character carries on lithium-ion batteries, in full. The book
 * gives no time for it.
 */
export async function chargeLithiumIon(item: any, actor: any, figures: CellFigures): Promise<void> {
  if (!actor) return;
  const targets = chargeableGear(actor, figures, "lithiumIon");
  if (!targets.length) return void ui.notifications?.warn(L("Charger.NoLithiumIon"));
  const answer = await ask(L("Charger.LithiumTitle"), `<p class="ihint">${esc(L("Charger.LithiumHint"))}</p>` + targetRow(targets),
    (form) => ({ target: String(field(form, "target")?.value ?? "") }));
  const target = targets.find((t) => String(t.item.id) === answer?.target) ?? null;
  if (!target) return;
  await charged(actor, item, target, null);
}

// ── the voltaic pile (HT:EE p. 16) ───────────────────────────────────────────

const PILE_NAME = /^Voltaic Pile$/;

export async function runVoltaicPile(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const result: any = await api.roll.success({ actor, base: VOLTAIC_PILE.ht, kind: "attribute", skill: "HT", item, label: F("Pile.Label", { name: item.name, minutes: VOLTAIC_PILE.minutes }), modifiers: [], tags: ["voltaicPile"] } as any);
  if (!result || "refused" in result) return;
  await say(actor, item.name, [result.success ? F("Pile.Runs", { minutes: VOLTAIC_PILE.minutes }) : L("Pile.Blocked")]);
}

// ── the gravity cell (HT:EE p. 17) ───────────────────────────────────────────

/**
 * Tending a gravity cell for the day, or setting up a new one (HT:EE p. 17):
 * the best of the skills the character's TL allows. A failed day's tending
 * loses the cell's power -- a gadget running on it has its endurance spent;
 * a new cell set up gives full power, an hour later.
 */
export async function gravityCell(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("Gravity.Title"),
    `<p class="ihint">${esc(L("Gravity.Hint"))}</p>` + row(L("Gravity.Task"), select("task", [["tend", L("Gravity.tend")], ["setUp", F("Gravity.setUp", { hours: GRAVITY_CELL.setUpHours })]])),
    (form) => ({ task: field(form, "task")?.value === "setUp" ? "setUp" as const : "tend" as const }));
  if (!answer) return;
  const tl = api.rules.parseTechLevel(String(actor.system?.tl ?? ""));
  const skills = gravityCellSkills(answer.task, typeof tl === "number" && Number.isFinite(tl) ? tl : null);
  const best = bestSkill(api, actor, skills);
  if (!best) return void ui.notifications?.warn(F("Charger.NoSkill", { skills: skills.join(", ") }));
  const result: any = await api.roll.success({ actor, base: best.level, skill: best.skill, item, label: F(`Gravity.${answer.task}Label`, { name: item.name }), modifiers: [], tags: ["gravityCell"] } as any);
  if (!result || "refused" in result) return;
  const left = enduranceLeft(powerData(item));
  const tracked = left !== null && left !== "unlimited";
  if (answer.task === "tend") {
    if (result.success) return void (await say(actor, item.name, [L("Gravity.Tended")]));
    if (tracked) await storePower(item, { hoursUsed: left.total } as never);
    return void (await say(actor, item.name, [L(tracked ? "Gravity.Lost" : "Gravity.LostUntracked")]));
  }
  if (!result.success) return void (await say(actor, item.name, [L("Gravity.NotSetUp")]));
  if (tracked) await storePower(item, { hoursUsed: 0 } as never);
  await say(actor, item.name, [F("Gravity.SetUp", { hours: GRAVITY_CELL.setUpHours })]);
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
    run: (item, actor) => { void chargeBattery(api, item, actor, figures); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-lithium-charger",
    itemTypes: ["equipment"],
    label: L("Charger.LithiumTitle"),
    icon: "fa-solid fa-plug-circle-bolt",
    visible: (item) => on.chemistry() && isOwnGear(item) && LITHIUM_CHARGER_NAME.test(String(item?.name ?? "")),
    run: (item, actor) => { void chargeLithiumIon(item, actor, figures); },
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
    key: "ee-gravity-cell",
    itemTypes: ["equipment"],
    label: L("Gravity.Title"),
    icon: "fa-solid fa-flask-vial",
    visible: (item) => on.chemistry() && isOwnGear(item) && powerData(item).chemistry === "gravityCell",
    run: (item, actor) => { void gravityCell(api, item, actor); },
  });

  // The Daniell cell's barrier weakens the current: -1 to Electrician or Electronics Operation with what it powers (HT:EE p. 17).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const item = context?.item;
    if (!on.chemistry() || !Array.isArray(context?.modifiers) || !isOwnGear(item) || powerData(item).chemistry !== "daniellCell") return;
    if (powerData(item).external || !daniellSkill(context.skill)) return;
    context.modifiers.push({ label: L("DaniellLine"), value: DANIELL_PENALTY });
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
