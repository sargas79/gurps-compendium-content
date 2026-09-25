/**
 * High-Tech's emergency medicine and medical facilities (pp. 219-225),
 * registered with the system through the add-on API under two switches. The
 * rules are in `rules.ts`; what each record is (a defibrillator, a first aid
 * kit, IV fluids, a surgical kit...) is its `medical` data, written on the
 * records from book.json. The AED is a device that resuscitates on its own
 * skill, High-Tech's table in the shared device engine (`src/shared/medical`)
 * that Ultra-Tech's automeds are in too.
 *
 *   - **Emergency medicine (emergencyMedicine):** a manual defibrillator's
 *     row button rolls Electronics Operation (Medical); the AED's rolls IQ+4
 *     to hook it up, then shocks at its own skill 12. A shock that gets
 *     through restarts a fibrillating heart on the patient's HT+1, a point
 *     more for each shock after it up to HT+5, -1 per 2 full minutes since
 *     the fibrillation began, as the supplement Electricity and Electronics
 *     revises High-Tech's +2 or +3 to resuscitation (HT:EE p. 14; decision E3
 *     in #471); a drowned or suffocated patient's stopped heart it can't
 *     restart. CPR given with either, or from the
 *     GM's "Give CPR" tool, costs the rescuer 1 FP per five minutes; first aid
 *     gear gives +1 at best without blood or IV fluids to hand (a crash kit
 *     carries its own until depleted), and a kit marked depleted works a grade
 *     lower (`gworld.skillBonuses`); hemostatic bandages give +1 (quality) to
 *     First Aid on a bleeding patient, a bandage used; starting an IV from a
 *     bag of fluid, which counts as a quart of water (dextrose also as a meal).
 *   - **Medical facilities (medicalFacilities):** an imaging instrument's
 *     button rolls Electronics Operation (Medical), then Diagnosis with its
 *     +TL/2 (the early X-ray giving both 1d rads) -- carried, it is no
 *     Diagnosis tool; portable surgery's +2 to First Aid; a
 *     surgical kit's own TL modifier in place of the Basic Set table's on an
 *     operation, its resupply's price, and a suturing kit improvised (-5) for
 *     one; putting a patient
 *     under with a chloroform mask or an anaesthesia machine (+2), -2 to
 *     Surgery if it failed; antiseptic cleaning a wound, taking up to 2 of
 *     the dirt's penalty off the infection roll (its `woundDirt` line), a use
 *     of the container's ten each time; and
 *     a TL6-8 healer with no medical supplies or first aid kit giving First
 *     Aid, and a physician's rounds, as at TL5 (`gworld.firstAid`'s and
 *     `gworld.physicianRounds`' `techLevel`).
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MEDICAL_TABLES, deviceFor, deviceSkill } from "../../../shared/medical/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { toolsFor } from "../equipment/index.js";
import {
  AED_HOOKUP,
  REVIVAL,
  ANESTHESIA,
  ANTISEPTIC,
  MEDICAL_SUPPLIES,
  antisepticLine,
  antisepticUses,
  resupplyShare,
  withoutSuppliesTl,
  DIAGNOSIS_DEFAULT,
  ELECTRONICS_DEFAULT,
  HEMOSTATIC,
  HT_DEVICES,
  IV,
  MEDICAL_ELECTRONICS,
  MEDICAL_KINDS,
  PHYSICIAN_DEFAULT,
  PORTABLE_SURGERY_FIRST_AID,
  SUTURING_IMPROVISED,
  WITHOUT_FLUIDS_BEST,
  XRAY_RADS_DICE,
  cprFatigue,
  depletedGrade,
  fibrillationPenalty,
  revivalBonus,
  shockRevives,
  firstAidGearWithoutFluids,
  hemostaticLine,
  surgicalKitLine,
  type MedicalKind,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Medicine.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Medicine.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "medical";
const CPR_FLAG = "htCpr";
const ANESTHESIA_FLAG = "htAnesthesia";
const ANTISEPTIC_FLAG = "htAntiseptic";
const CAUSES = ["heartAttack", "drowning", "asphyxiation"] as const;
type Cause = (typeof CAUSES)[number];

export interface MedicineSwitches {
  emergency: () => boolean;
  facilities: () => boolean;
}

/** What this module keeps on a piece of medical gear. */
export interface MedicalData {
  kind: MedicalKind;
  /** An anaesthesia machine's bonus, an X-ray's dice of rads. */
  value: number;
  /** A first aid kit used until it works a grade lower (p. 221). */
  depleted: boolean;
  /** IV fluid that also counts as a meal: dextrose (p. 220). */
  meal: boolean;
  /** A kit that carries its own IV and a unit of fluid: the crash kit (p. 221). */
  fluids: boolean;
  /** Uses spent from the container in hand: antiseptic's (p. 225). */
  usesSpent: number;
}

/** Registers the fields this module keeps on medical gear. */
export function initMedicine(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...MEDICAL_KINDS] }),
      value: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      depleted: new f.BooleanField({ initial: false }),
      meal: new f.BooleanField({ initial: false }),
      fluids: new f.BooleanField({ initial: false }),
      usesSpent: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    }),
  });
}

/** A piece of gear's medical data, with nothing missing. */
export function medicalData(item: any): MedicalData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    kind: MEDICAL_KINDS.includes(d.kind) ? d.kind : "",
    value: Math.trunc(Number(d.value) || 0),
    depleted: d.depleted === true,
    meal: d.meal === true,
    fluids: d.fluids === true,
    usesSpent: Math.max(0, Math.floor(Number(d.usesSpent) || 0)),
  };
}

const nameOf = (item: any): string => String(item?.name ?? "");
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const worldNow = (): number => Number((game as any).time?.worldTime) || 0;
const isCarried = (item: any): boolean => item?.type === "equipment" && item.system?.carried !== false;
const hasSome = (item: any): boolean => !Number.isFinite(Number(item?.system?.quantity)) || Number(item.system.quantity) > 0;

/** The character's carried gear of a kind, with some left. */
function gearOf(actor: any, kind: MedicalKind): any[] {
  return [...(actor?.items ?? [])].filter((item: any) => isCarried(item) && hasSome(item) && medicalData(item).kind === kind);
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The one token the user has targeted's actor, or null. */
function targetedActor(): any {
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length === 1 ? targets[0]?.actor ?? null : null;
}

/** Takes one off a consumable's count (`items.changeQuantity`); false where there is none left. */
async function useOne(api: GWorldApi, item: any): Promise<boolean> {
  const quantity = Number(item?.system?.quantity);
  if (!Number.isFinite(quantity)) return true;
  if (quantity <= 0) return false;
  await api.items.changeQuantity(item, -1, { reason: nameOf(item) });
  return true;
}

async function rollDice(formula: string): Promise<number> {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll.total ?? 0;
}

/** A skill's level, or its default from IQ. */
function skillOrDefault(api: GWorldApi, actor: any, skill: string, fromIq: number): number {
  return api.actors.skillLevel(actor, skill) ?? (Number(api.actors.attribute(actor, "IQ")) || 10) + fromIq;
}

const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}

// ── resuscitation (p. 220) ──

interface Resuscitation {
  cause: Cause;
  cpr: boolean;
  modifier: number;
}

/** Why the patient needs reviving, whether CPR goes with it, and any modifier. */
function askResuscitation(title: string): Promise<Resuscitation | null> {
  const causes = CAUSES.map((c) => `<option value="${c}">${esc(game.i18n.localize(`GWORLD.Recovery.Cause.${c}`))}</option>`).join("");
  return ask(title,
    row(L("Cause"), `<select name="cause">${causes}</select>`)
    + row(L("WithCpr"), `<input type="checkbox" name="cpr" checked />`)
    + row(L("Modifier"), `<input type="number" name="modifier" value="0" step="1" style="width:60px" />`),
    (form) => ({
      cause: (form.querySelector<HTMLSelectElement>("[name=cause]")?.value ?? "heartAttack") as Cause,
      cpr: Boolean(form.querySelector<HTMLInputElement>("[name=cpr]")?.checked),
      modifier: Math.trunc(Number(form.querySelector<HTMLInputElement>("[name=modifier]")?.value) || 0),
    }));
}

/** Charges the rescuer for a minute of manual CPR on this patient: 1 FP per five minutes (p. 220). */
async function chargeCpr(api: GWorldApi, healer: any, patient: any): Promise<void> {
  const kept = healer?.getFlag?.(MODULE_ID, CPR_FLAG) as { patient?: string; minutes?: number } | undefined;
  const who = String(patient?.uuid ?? patient?.id ?? "");
  const before = kept?.patient === who ? Number(kept.minutes) || 0 : 0;
  const fp = cprFatigue(before, 1);
  await healer?.setFlag?.(MODULE_ID, CPR_FLAG, { patient: who, minutes: before + 1 });
  if (!fp) return;
  // Exertion through the fatigue chart: Very Fit halves it, and past 0 FP it hurts (Campaigns p. 426).
  const spent = await api.actors.spendFatigue(healer, fp, { details: { rule: "cpr" } });
  if (spent) await say(healer, L("Cpr"), [F("CprFatigue", { name: healer.name, fp, minutes: before + 1 })]);
}

/** One minute's resuscitation, the healer's or a stand-in figure's, and the CPR that went with it. */
async function resuscitate(api: GWorldApi, healer: any, patient: any, answer: Resuscitation, options: { skill?: number; techLevel?: number; label?: string; modifier?: number } = {}): Promise<void> {
  await api.actors.resuscitate({
    healer, patient, cause: answer.cause, cpr: answer.cpr, modifier: answer.modifier + (options.modifier ?? 0),
    ...(typeof options.skill === "number" ? { skill: options.skill, skillKind: "physician" as const } : {}),
    ...(typeof options.techLevel === "number" ? { techLevel: options.techLevel } : {}),
    ...(options.label ? { label: options.label } : {}),
  });
  if (answer.cpr) await chargeCpr(api, healer, patient);
}

// ── the defibrillator's revival (HT:EE p. 14; p. 220) ──

/** The shocks one defibrillator has given one patient, and when the fibrillation began. */
export const SHOCKS_FLAG = "eeShocks";

interface Shocking extends Resuscitation {
  /** Minutes since the fibrillation began. */
  minutes: number;
  /** Shocks that got through before this one. */
  shocks: number;
}

/** What the defibrillator knows of this patient: the shocks it gave and when the fibrillation began. */
function shocksGiven(item: any, patient: any): { shocks: number; minutes: number } {
  const kept = item?.getFlag?.(MODULE_ID, SHOCKS_FLAG) as { patient?: string; shocks?: number; since?: number } | undefined;
  if (!kept || kept.patient !== String(patient?.uuid ?? patient?.id ?? "")) return { shocks: 0, minutes: 0 };
  return { shocks: Math.max(0, Number(kept.shocks) || 0), minutes: Math.max(0, Math.floor((worldNow() - (Number(kept.since) || worldNow())) / 60)) };
}

/** The resuscitation dialog, with the fibrillation's minutes and the shocks already given. */
function askShock(title: string, item: any, patient: any): Promise<Shocking | null> {
  const causes = CAUSES.map((c) => `<option value="${c}">${esc(game.i18n.localize(`GWORLD.Recovery.Cause.${c}`))}</option>`).join("");
  const given = shocksGiven(item, patient);
  const whole = (form: HTMLElement, name: string) => Math.max(0, Math.floor(Number(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value) || 0));
  return ask(title,
    row(L("Cause"), `<select name="cause">${causes}</select>`)
    + row(L("WithCpr"), `<input type="checkbox" name="cpr" checked />`)
    + row(L("Minutes"), `<input type="number" name="minutes" value="${given.minutes}" min="0" step="1" style="width:60px" />`)
    + row(L("Shocks"), `<input type="number" name="shocks" value="${given.shocks}" min="0" step="1" style="width:60px" />`)
    + row(L("Modifier"), `<input type="number" name="modifier" value="0" step="1" style="width:60px" />`),
    (form) => ({
      cause: (form.querySelector<HTMLSelectElement>("[name=cause]")?.value ?? "heartAttack") as Cause,
      cpr: Boolean(form.querySelector<HTMLInputElement>("[name=cpr]")?.checked),
      modifier: Math.trunc(Number(form.querySelector<HTMLInputElement>("[name=modifier]")?.value) || 0),
      minutes: whole(form, "minutes"),
      shocks: whole(form, "shocks"),
    }));
}

/**
 * A shock that got through: the heart restarts on the patient's HT+1, a
 * point more for each earlier shock up to HT+5, less a point per 2 full
 * minutes of fibrillation -- the system's resuscitation roll against that
 * figure (HT:EE p. 14). A stopped heart, drowned or suffocated, it can't
 * restart: CPR alone goes on.
 */
async function revive(api: GWorldApi, item: any, healer: any, patient: any, answer: Shocking, techLevel: number): Promise<void> {
  if (!shockRevives(answer.cause)) {
    await say(patient, nameOf(item), [F("NoFibrillation", { name: nameOf(item) })]);
    if (answer.cpr) await resuscitate(api, healer, patient, answer);
    return;
  }
  const bonus = revivalBonus(answer.shocks);
  const penalty = fibrillationPenalty(answer.minutes);
  await item?.setFlag?.(MODULE_ID, SHOCKS_FLAG, { patient: String(patient?.uuid ?? patient?.id ?? ""), shocks: answer.shocks + 1, since: worldNow() - answer.minutes * 60 });
  const ht = Number(api.actors.attribute(patient, "HT")) || 10;
  if (penalty) await say(patient, nameOf(item), [F("Fibrillating", { minutes: answer.minutes, penalty })]);
  await resuscitate(api, healer, patient, answer, { skill: ht + bonus, techLevel, modifier: penalty, label: F("HeartLabel", { patient: patient.name, bonus, name: nameOf(item) }) });
}

/** A manual defibrillator: Electronics Operation (Medical), then the revival (p. 220; HT:EE p. 14). */
async function defibrillate(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor();
  if (!patient) return void ui.notifications?.warn(L("OneTarget"));
  const answer = await askShock(nameOf(item), item, patient);
  if (!answer) return;
  const base = skillOrDefault(api, actor, MEDICAL_ELECTRONICS, ELECTRONICS_DEFAULT);
  const worked: any = await api.roll.success({ actor, base, skill: MEDICAL_ELECTRONICS, label: F("ShockLabel", { name: nameOf(item), patient: patient.name }), tags: ["defibrillator"], item } as any);
  if (!worked) return;
  if (!worked.success) {
    await say(patient, nameOf(item), [F("ShockFailed", { name: nameOf(item) })]);
    if (answer.cpr) await resuscitate(api, actor, patient, answer);
    return;
  }
  await revive(api, item, actor, patient, answer, Math.max(7, tlOf(item)));
}

/** An AED: IQ+4 to hook it up, then it shocks on its own skill (p. 220), and the revival follows (HT:EE p. 14). */
async function useAed(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor();
  if (!patient) return void ui.notifications?.warn(L("OneTarget"));
  const device = deviceFor(item);
  const tl = tlOf(item) || device?.tl || 8;
  const skill = device ? deviceSkill(device, "resuscitation", tl) : null;
  if (skill === null) return;
  const answer = await askShock(nameOf(item), item, patient);
  if (!answer) return;
  const iq = Number(api.actors.attribute(actor, "IQ")) || 10;
  const hooked: any = await api.roll.success({ actor, base: iq, kind: "attribute", skill: "IQ", label: F("HookUpLabel", { name: nameOf(item), patient: patient.name }), modifiers: [{ label: L("AedInstructions"), value: AED_HOOKUP }], tags: ["aed", "IQ"], item } as any);
  if (!hooked) return;
  if (!hooked.success) {
    await say(patient, nameOf(item), [F("NotHookedUp", { name: nameOf(item) })]);
    if (answer.cpr) await resuscitate(api, actor, patient, answer);
    return;
  }
  // The AED's 12 stands for its user's Electronics Operation (Medical) (HT:EE p. 14).
  const shocked: any = await api.roll.success({ actor, base: skill, skill: MEDICAL_ELECTRONICS, label: F("AedShockLabel", { name: nameOf(item), patient: patient.name, skill }), tags: ["defibrillator", "aed"], item } as any);
  if (!shocked) return;
  if (!shocked.success) {
    await say(patient, nameOf(item), [F("ShockFailed", { name: nameOf(item) })]);
    if (answer.cpr) await resuscitate(api, actor, patient, answer);
    return;
  }
  await revive(api, item, actor, patient, answer, tl);
}

/** The GM's CPR: the selected character works on the targeted one, a minute at a time. */
async function giveCpr(api: GWorldApi): Promise<void> {
  const patient = targetedActor();
  const healer = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null;
  if (!patient || !healer) return void ui.notifications?.warn(L("CprWho"));
  const answer = await askResuscitation(L("Cpr"));
  if (!answer) return;
  await resuscitate(api, healer, patient, { ...answer, cpr: true });
}

// ── first aid gear (pp. 220-221, 224) ──

/** Whether a healer has blood or IV fluids, and something to give them with, for their gear's +2 (p. 220). */
export function hasIvFluids(actor: any): boolean {
  const crashKit = gearOf(actor, "firstAidKit").some((kit) => medicalData(kit).fluids && !medicalData(kit).depleted);
  return crashKit || (gearOf(actor, "ivKit").length > 0 && gearOf(actor, "ivFluid").length > 0);
}

const SKILLS = ["first aid", "physician", "surgery", "diagnosis"];

/**
 * The medical gear's lines on a treating skill, or null where these rules
 * leave the system's alone: the best tool once depleted kits are a grade
 * lower, hemostatic bandages kept for bleeding wounds and portable surgery
 * counted for First Aid; then First Aid gear held to +1 without IV fluids.
 */
export function medicalToolLines(api: GWorldApi, context: any, on: MedicineSwitches): { tools: number; techLevel: number; reason: string } | null {
  const actor = context?.actor;
  const name = String(context?.name ?? "");
  const key = api.rules.toolSkillKey(name);
  if (!actor || !SKILLS.includes(key)) return null;
  const firstAid = key === "first aid";
  // An imaging instrument's bonus is for the Diagnosis roll a successful scan allows (p. 222), not for every one.
  const scanOnly = (t: any) => key === "diagnosis" && on.facilities() && medicalData(t).kind === "imaging";
  const tools = toolsFor(api, actor, name);
  const reasons: string[] = [];
  const recompute = tools.some((t) => {
    const data = medicalData(t);
    return scanOnly(t) || (on.emergency() && ((data.kind === "firstAidKit" && data.depleted) || (firstAid && data.kind === "hemostatic")));
  }) || (firstAid && on.facilities() && gearOf(actor, "portableSurgery").length > 0);

  const lines = context.lines as Array<{ key: string; value: number }>;
  let value = lines.filter((l) => l.key === "tools").reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  let techLevel = lines.filter((l) => l.key === "techLevel").reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  if (recompute) {
    const personal = Number(actor.system?.tl) || 0;
    // Why each carried tool is worth what it is here, said only of the one that wins.
    const why = new Map<string, string>();
    if (tools.some(scanOnly)) reasons.push(L("ImagingReason"));
    const carried = tools
      .filter((t) => !(firstAid && on.emergency() && medicalData(t).kind === "hemostatic") && !scanOnly(t))
      .map((t) => {
        const data = medicalData(t);
        const depleted = on.emergency() && data.kind === "firstAidKit" && data.depleted;
        if (depleted) why.set(String(t.id ?? ""), F("DepletedReason", { name: nameOf(t) }));
        const grade = depleted ? depletedGrade(String(t.system?.equipmentQuality ?? "basic")) : String(t.system?.equipmentQuality ?? "basic");
        return { quality: api.rules.toolModifier(grade as never, t.system?.equipmentModifier, { tl: personal }), techLevel: api.rules.parseTechLevel(t.system?.tl), id: String(t.id ?? "") };
      });
    if (firstAid && on.facilities()) {
      for (const setup of gearOf(actor, "portableSurgery")) {
        carried.push({ quality: PORTABLE_SURGERY_FIRST_AID, techLevel: api.rules.parseTechLevel(setup.system?.tl), id: String(setup.id ?? "") });
        why.set(String(setup.id ?? ""), F("PortableSurgeryReason", { name: nameOf(setup) }));
      }
    }
    const item = context.item;
    const skillTl = api.registry.isRuleOn("techLevelModifiers") && api.rules.isTechnologicalSkill(name, item?.system?.techLevel)
      ? api.rules.skillTechLevel(name, item?.system?.techLevel, personal)
      : null;
    const best = api.rules.bestTool(carried, { skillTechLevel: skillTl, iqBased: item?.system?.attribute === "IQ" });
    value = best?.quality ?? 0;
    techLevel = best?.techLevel ?? 0;
    const reason = best?.id ? why.get(best.id) : undefined;
    if (reason) reasons.push(reason);
  }
  // "Otherwise, the best possible quality modifier is +1" (p. 220).
  if (firstAid && on.emergency() && value > WITHOUT_FLUIDS_BEST && !hasIvFluids(actor)) {
    value = firstAidGearWithoutFluids(value);
    reasons.push(L("NoFluidsReason"));
  }
  if (!recompute && !reasons.length) return null;
  return { tools: value, techLevel, reason: reasons.join("; ") };
}

/** The healer's First Aid equipment line, as the skill's level took it. */
function firstAidToolBonus(api: GWorldApi, actor: any): number {
  const skill = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && api.rules.toolSkillKey(String(i.name ?? "")) === "first aid");
  return Number(skill?.system?.derived?.toolBonus) || 0;
}

/** Hemostatic bandages on a bleeding patient's First Aid (p. 221), as far as they beat the healer's other gear. */
export function hemostaticFor(api: GWorldApi, healer: any, patient: any): { item: any; value: number } | null {
  if (!patient?.statuses?.has?.("bleeding")) return null;
  const bandages = gearOf(healer, "hemostatic")[0];
  if (!bandages) return null;
  const value = hemostaticLine(firstAidToolBonus(api, healer));
  return value ? { item: bandages, value } : null;
}

/** Starting an IV from a bag of fluid: a minute, and a quart of water (a meal, for dextrose) (p. 220). */
async function startIv(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor() ?? actor;
  if (!gearOf(actor, "ivKit").length) return void ui.notifications?.warn(L("NeedIvKit"));
  if (!(await useOne(api, item))) return void ui.notifications?.warn(F("NoneLeft", { name: nameOf(item) }));
  const lines = [F("IvStarted", { name: patient.name, item: nameOf(item), minutes: IV.startMinutes, least: IV.hoursLeast, most: IV.hoursMost }), L("IvWater")];
  if (medicalData(item).meal) lines.push(L("IvMeal"));
  await say(patient, nameOf(item), lines);
}

// ── facilities (pp. 222-225) ──

/** An imaging instrument: Electronics Operation (Medical) by the operator, then a Diagnosis roll with its bonus (p. 222). */
async function scan(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor();
  if (!patient) return void ui.notifications?.warn(L("OneTarget"));
  const data = medicalData(item);
  // The early X-ray machine: 1d rads a photograph, to patient and operator alike (p. 223).
  if (data.value > 0) {
    for (const who of new Set([patient, actor])) {
      const rads = await rollDice(`${data.value * XRAY_RADS_DICE}d6`);
      await api.hazards.irradiate({ actor: who, rads, protectionFactor: 1, modifier: 0 });
    }
  }
  const base = skillOrDefault(api, actor, MEDICAL_ELECTRONICS, ELECTRONICS_DEFAULT);
  const worked: any = await api.roll.success({ actor, base, skill: MEDICAL_ELECTRONICS, label: F("ScanLabel", { name: nameOf(item), patient: patient.name }), tags: ["imaging"], item } as any);
  if (!worked) return;
  if (!worked.success) return void say(patient, nameOf(item), [F("ScanFailed", { name: nameOf(item) })]);
  const diagnosis = skillOrDefault(api, actor, "Diagnosis", DIAGNOSIS_DEFAULT);
  const line = imagingLine(api, item, actor);
  await api.roll.success({ actor, base: diagnosis, skill: "Diagnosis", label: F("DiagnoseLabel", { patient: patient.name, name: nameOf(item) }), modifiers: line ? [line] : [], tags: ["diagnosis"], item } as any);
}

/**
 * The instrument's +TL/2 (quality) on the Diagnosis roll its scan allows
 * (p. 222), less the equipment line the skill already has from other gear:
 * a quality bonus stands in for another, it doesn't add to it.
 */
export function imagingLine(api: GWorldApi, item: any, actor: any): { label: string; value: number } | null {
  const quality = api.rules.toolModifier(String(item?.system?.equipmentQuality ?? "best") as never, item?.system?.equipmentModifier, { tl: tlOf(item) });
  const skill = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && api.rules.toolSkillKey(String(i.name ?? "")) === "diagnosis");
  const value = quality - (Number(skill?.system?.derived?.toolBonus) || 0);
  return value > 0 ? { label: F("ImagingLine", { name: nameOf(item) }), value } : null;
}

/** Putting the targeted patient under: a Physician roll, +2 with a machine (pp. 224-225). */
async function anesthetize(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor();
  if (!patient) return void ui.notifications?.warn(L("OneTarget"));
  const bonus = medicalData(item).value;
  const base = skillOrDefault(api, actor, "Physician", PHYSICIAN_DEFAULT);
  const result: any = await api.roll.success({ actor, base, skill: "Physician", label: F("AnesthesiaLabel", { patient: patient.name, name: nameOf(item) }), modifiers: bonus ? [{ label: nameOf(item), value: bonus }] : [], tags: ["anesthesia"], item } as any);
  if (!result) return;
  await patient.setFlag?.(MODULE_ID, ANESTHESIA_FLAG, { ok: Boolean(result.success), at: worldNow() });
  await say(patient, nameOf(item), [F(result.success ? "Under" : "NotUnder", { name: patient.name, least: ANESTHESIA.uncooperativeLeast, most: ANESTHESIA.uncooperativeMost, penalty: ANESTHESIA.failed })]);
}

/** The line a failed anaesthetic puts on the operation, or null (p. 224). */
export function anesthesiaLine(patient: any): { label: string; value: number } | null {
  const kept = patient?.getFlag?.(MODULE_ID, ANESTHESIA_FLAG) as { ok?: boolean; at?: number } | undefined;
  if (!kept || kept.ok || worldNow() - (Number(kept.at) || 0) > ANESTHESIA.hours * 3600) return null;
  return { label: L("AnesthesiaFailed"), value: ANESTHESIA.failed };
}

/**
 * The line a surgeon's surgical kit or suturing kit puts on an operation,
 * or null: the kit's own TL modifier is already on the skill, in place of
 * the Basic Set table's by the TL of the operation (pp. 223-224).
 */
export function surgeryKitLine(api: GWorldApi, context: any): { label: string; value: number } | null {
  const surgeon = context?.actor;
  // A device operating on its own skill (another book's) is not the surgeon with their kit.
  if (!surgeon || context.base !== api.actors.skillLevel(surgeon, "Surgery")) return null;
  const skill = [...(surgeon.items ?? [])].find((i: any) => i?.type === "skill" && api.rules.toolSkillKey(String(i.name ?? "")) === "surgery");
  const toolId = skill?.system?.derived?.toolItemId;
  const tool = toolId ? [...(surgeon.items ?? [])].find((i: any) => i?.id === toolId) : null;
  const kind = medicalData(tool).kind;
  if (kind === "suturingKit") return { label: F("SuturingLine", { name: nameOf(tool) }), value: SUTURING_IMPROVISED };
  if (kind !== "surgicalKit") return null;
  const tl = api.rules.parseTechLevel(surgeon.system?.tl) ?? 3;
  const value = surgicalKitLine(api.rules.surgeryEquipment(tl));
  return value ? { label: F("SurgicalKitLine", { name: nameOf(tool), tl }), value } : null;
}

/**
 * Cleaning the targeted patient's wound: no roll, and -2 off the infection
 * roll (p. 225). A use comes out of the container; the last of its ten takes
 * the container off the count (`items.changeQuantity`).
 */
async function cleanWound(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor() ?? actor;
  if (!hasSome(item)) return void ui.notifications?.warn(F("NoneLeft", { name: nameOf(item) }));
  const per = antisepticUses(nameOf(item));
  const spent = medicalData(item).usesSpent + 1;
  const path = `system.extensions.${MODULE_ID}.${FIELD}.usesSpent`;
  if (spent < per) await item.update({ [path]: spent });
  else {
    await item.update({ [path]: 0 });
    if (Number.isFinite(Number(item?.system?.quantity))) await api.items.changeQuantity(item, -1, { reason: nameOf(item) });
  }
  await patient.setFlag?.(MODULE_ID, ANTISEPTIC_FLAG, worldNow());
  const left = spent < per ? per - spent : 0;
  await say(patient, nameOf(item), [F("Cleaned", { name: patient.name, bonus: ANTISEPTIC.bonus }), F("UsesLeft", { left, per })]);
}

/**
 * Whether a healer has consumable medical supplies to hand: the Medical
 * Supplies record (p. 223), or a first aid kit or crash kit not yet depleted.
 */
export function hasMedicalSupplies(actor: any): boolean {
  const carried = [...(actor?.items ?? [])].filter((i: any) => i?.type === "equipment" && i.system?.carried !== false && (Number(i.system?.quantity ?? 1) || 0) > 0);
  return carried.some((i: any) => MEDICAL_SUPPLIES.test(String(i.name ?? "")) || (medicalData(i).kind === "firstAidKit" && !medicalData(i).depleted));
}

/** Whether the patient's wound was cleaned with antiseptic lately. */
export function cleanedWith(actor: any): boolean {
  const at = actor?.getFlag?.(MODULE_ID, ANTISEPTIC_FLAG);
  return typeof at === "number" && worldNow() - at <= ANTISEPTIC.hours * 3600;
}

// ── the sheets ──

function itemLines(item: any, on: MedicineSwitches): string[] {
  const data = medicalData(item);
  const tl = tlOf(item);
  const lines: string[] = [];
  if (on.emergency()) {
    switch (data.kind) {
      case "airway": lines.push(L("AirwayItem")); break;
      case "defibrillator": lines.push(F("DefibrillatorItem", { first: REVIVAL.first, most: REVIVAL.most, minutes: REVIVAL.minutesPerPoint })); break;
      case "aed": {
        const device = deviceFor(item);
        const skill = device ? deviceSkill(device, "resuscitation", tl || device.tl) : null;
        if (skill !== null) lines.push(F("AedItem", { bonus: AED_HOOKUP, skill }));
        break;
      }
      case "ivKit": lines.push(F("IvKitItem", { minutes: IV.startMinutes })); break;
      case "ivFluid": lines.push(F(data.meal ? "IvMealItem" : "IvFluidItem", { least: IV.hoursLeast, most: IV.hoursMost })); break;
      case "firstAidKit": lines.push(F(data.fluids ? "CrashKitItem" : "KitItem", { best: WITHOUT_FLUIDS_BEST })); break;
      case "hemostatic": lines.push(F("HemostaticItem", { bonus: HEMOSTATIC.bonus, seconds: HEMOSTATIC.seconds })); break;
      default:
    }
  }
  if (on.facilities()) {
    switch (data.kind) {
      case "imaging": lines.push(L("ImagingItem")); if (data.value > 0) lines.push(F("XrayItem", { dice: data.value * XRAY_RADS_DICE })); break;
      case "portableSurgery": lines.push(F("PortableSurgeryItem", { bonus: PORTABLE_SURGERY_FIRST_AID })); break;
      case "surgicalKit": {
        lines.push(L("SurgicalKitItem"));
        const share = resupplyShare(tl);
        const cost = Math.round((Number(item.system?.cost) || 0) * share * 100) / 100;
        if (cost > 0) lines.push(F("ResupplyItem", { cost, percent: Math.round(share * 100) }));
        break;
      }
      case "suturingKit": lines.push(F("SuturingItem", { penalty: SUTURING_IMPROVISED })); break;
      case "anesthesia": lines.push(F(data.value ? "AnesthesiaMachineItem" : "AnesthesiaItem", { bonus: data.value, penalty: ANESTHESIA.failed, hours: ANESTHESIA.hours })); break;
      case "antiseptic": {
        const per = antisepticUses(nameOf(item));
        lines.push(F("AntisepticItem", { bonus: ANTISEPTIC.bonus }), F("UsesLeft", { left: Math.max(0, per - data.usesSpent), per }));
        break;
      }
      default:
    }
  }
  return lines;
}

function itemContext(item: any, on: MedicineSwitches): Record<string, unknown> {
  const data = medicalData(item);
  return {
    lines: itemLines(item, on),
    kit: on.emergency() && data.kind === "firstAidKit" ? { depleted: data.depleted } : null,
    editable: item.isOwner,
  };
}

export function readyMedicine(api: GWorldApi, on: MedicineSwitches): void {
  // High-Tech's table in the shared device engine: the AED.
  MEDICAL_TABLES.register({ book: "high-tech", tls: { min: 0, max: 8 }, on: on.emergency, devices: HT_DEVICES });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-medicine-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-medicine-item.hbs`,
    visible: (item) => item?.type === "equipment" && itemLines(item, on).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => {
      element.querySelector<HTMLInputElement>("[data-gcc-ht-medical=depleted]")?.addEventListener("change", async (event) => {
        await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.depleted`]: (event.currentTarget as HTMLInputElement).checked });
      });
    },
  });

  // First aid gear without IV fluids, depleted kits, hemostatic bandages and portable surgery (pp. 220-221, 224).
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if ((!on.emergency() && !on.facilities()) || !api.registry.isRuleOn("equipmentModifiers")) return;
    const found = medicalToolLines(api, context, on);
    if (!found) return;
    for (const [key, value] of [["tools", found.tools], ["techLevel", found.techLevel]] as const) {
      const line = (context.lines ?? []).find((l: any) => l?.key === key);
      if (line) {
        if (line.value === value) continue;
        line.value = value;
        line.reason = found.reason;
      } else if (value) context.lines?.push?.({ key, label: key === "tools" ? L("Equipment") : L("EquipmentTl"), value, source: MODULE_ID, reason: found.reason });
    }
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const tags: string[] = context?.tags ?? [];
    if (!Array.isArray(context?.modifiers)) return;

    // Hemostatic bandages on a bleeding wound, one used (p. 221).
    if (on.emergency() && tags.includes("firstAid")) {
      const hemostatic = hemostaticFor(api, context.actor, context.opponent);
      if (hemostatic) {
        context.modifiers.push({ label: F("HemostaticLine", { name: nameOf(hemostatic.item), seconds: HEMOSTATIC.seconds }), value: hemostatic.value });
        if (hemostatic.item.isOwner) void useOne(api, hemostatic.item);
      }
    }

    if (on.facilities() && tags.includes("surgery")) {
      const kit = surgeryKitLine(api, context);
      if (kit) context.modifiers.push(kit);
      const anesthesia = anesthesiaLine(context.opponent);
      if (anesthesia) context.modifiers.push(anesthesia);
    }

    // Antiseptic on the wound, and spent on this roll: it removes up to -2 of
    // the dirt's penalty (p. 225), the system's line keyed woundDirt (Campaigns p. 444).
    if (on.facilities() && tags.includes("infection") && cleanedWith(context.actor)) {
      const dirt = (context.modifiers as any[]).find((m) => m?.key === "woundDirt");
      const value = antisepticLine(Number(dirt?.value) || 0);
      if (value) context.modifiers.push({ label: L("AntisepticLine"), value });
      if (context.actor?.isOwner) void context.actor.unsetFlag?.(MODULE_ID, ANTISEPTIC_FLAG);
    }
  });

  // Without consumable supplies, a TL6-8 healer works as TL5 on the First Aid Table (p. 223; Campaigns p. 424).
  Hooks.on(api.combat.hooks.firstAid, (context: any) => {
    if (!on.facilities() || !context?.healer) return;
    const tl = withoutSuppliesTl(Number(context.techLevel) || 0, hasMedicalSupplies(context.healer));
    if (tl !== null) context.techLevel = tl;
  });
  // And on a physician's rounds, the rest of Medical Care (p. 223; Campaigns
  // p. 424): the system takes the Tech-Level Modifiers line for it (API 1.142.0).
  Hooks.on(api.combat.hooks.physicianRounds, (context: any) => {
    if (!on.facilities() || !context?.healer) return;
    const tl = withoutSuppliesTl(Number(context.techLevel) || 0, hasMedicalSupplies(context.healer));
    if (tl === null) return;
    context.techLevel = tl;
    if (Array.isArray(context.lines)) context.lines.push(L("RoundsWithoutSupplies"));
  });

  const action = (key: string, label: string, icon: string, visible: (item: any) => boolean, run: (item: any, actor: any) => Promise<void>) =>
    api.sheets.registerRowAction({ module: MODULE_ID, key, itemTypes: ["equipment"], label: L(label), icon, visible, run: (item, actor) => { void run(item, actor); } });
  const kindIs = (kind: MedicalKind) => (item: any) => medicalData(item).kind === kind;

  action("ht-defibrillate", "DefibrillateAction", "fa-solid fa-heart-pulse", (item) => on.emergency() && kindIs("defibrillator")(item), (item, actor) => defibrillate(api, item, actor));
  action("ht-aed", "AedAction", "fa-solid fa-heart-circle-bolt", (item) => on.emergency() && kindIs("aed")(item), (item, actor) => useAed(api, item, actor));
  action("ht-start-iv", "IvAction", "fa-solid fa-droplet", (item) => on.emergency() && kindIs("ivFluid")(item), (item, actor) => startIv(api, item, actor));
  action("ht-scan", "ScanAction", "fa-solid fa-x-ray", (item) => on.facilities() && kindIs("imaging")(item), (item, actor) => scan(api, item, actor));
  action("ht-anesthetize", "AnesthesiaAction", "fa-solid fa-mask-ventilator", (item) => on.facilities() && kindIs("anesthesia")(item), (item, actor) => anesthetize(api, item, actor));
  action("ht-antiseptic", "AntisepticAction", "fa-solid fa-pump-medical", (item) => on.facilities() && kindIs("antiseptic")(item), (item, actor) => cleanWound(api, item, actor));

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-cpr",
    label: L("Cpr"),
    icon: "fa-solid fa-hand-holding-medical",
    visible: on.emergency,
    open: () => giveCpr(api),
  } as any);
}
