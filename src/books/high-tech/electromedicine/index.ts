/**
 * Electromedicine from the supplement Electricity and Electronics (HT:EE pp.
 * 13-14, 21), registered with the system through the add-on API under one of
 * High-Tech's switches. The rules are in `rules.ts`; what a record is comes
 * from its name, and an early diathermy machine from the `device` data (#490).
 *
 *   - **Electromedicine (electromedicine):** row actions on the diathermy
 *     apparatus (the healer's Physician roll, -2 on an early machine, whose
 *     critical failure burns the patient 1d-3) and the heating pad (the
 *     patient's HT roll) that ease the patient's pain one step after half an
 *     hour, the system's pain conditions (Campaigns p. 428) stepped down; one
 *     on the electroconvulsive therapy device that gives the patient a
 *     Seizure (Campaigns p. 429), rolls the healer's Physician for the course
 *     and the patient's HT-2 against the memory loss, and on success takes
 *     Chronic Depression or Manic-Depressive out of play for a year as a
 *     Mitigator would (`gworld.traitsInPlay`); the laser scalpel's +2 to
 *     the carrier's Surgery rolls on an operation, for the specialty it is
 *     designed for where the GM names one; and row actions on the
 *     electrocautery and the cautery pen: the healer's Surgery roll stops
 *     the patient's bleeding (`actors.stopBleeding`), the heat causes Severe
 *     Pain without a local anaesthetic, and the pen is used up.
 *
 * The defibrillator is High-Tech's emergency medicine, which the supplement
 * revises (`../medicine`, decision E3 in #471).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { card } from "../../../shared/sensors/index.js";
import { deviceData, isDevice, storeDevice } from "../devices/index.js";
import {
  CAUTERY,
  ECT,
  ECT_MITIGATES,
  EARLY_DIATHERMY,
  LASER_SCALPEL,
  PAIN_TREATMENT_MINUTES,
  PHYSICIAN_DEFAULT,
  easedPain,
  electromedicineOf,
  scalpelFits,
  stillMitigated,
  surgeryLevel,
  worstPain,
  type Electromedicine,
  type PainStep,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Electromedicine.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Electromedicine.${key}`, data);

/** A course of electroconvulsive therapy that worked: when its year ends. */
export const ECT_FLAG = "eeElectroconvulsive";

const worldNow = (): number => Number((game as any).time?.worldTime) || 0;
const kindOf = (item: any): Electromedicine | null => (isDevice(item) ? electromedicineOf(item?.name) : null);

/** The one token the user has targeted's actor, or null. */
function targetedActor(): any {
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length === 1 ? targets[0]?.actor ?? null : null;
}

async function rollDice(formula: string): Promise<{ total: number; roll: any }> {
  const roll = new Roll(formula);
  await roll.evaluate();
  return { total: Number(roll.total) || 0, roll };
}

/** The healer's Physician, or its IQ-7 default. */
function physician(api: GWorldApi, actor: any): number {
  return api.actors.skillLevel(actor, "Physician") ?? (Number(api.actors.attribute(actor, "IQ")) || 10) + PHYSICIAN_DEFAULT;
}

/**
 * Eases a character's pain one step (Campaigns p. 428): the worst pain
 * condition off, and the next grade down on, for what was left of it. A pain
 * set from the token has no entry to take off, so it is applied first.
 */
export async function easePain(api: GWorldApi, patient: any): Promise<{ from: PainStep; to: PainStep | null } | null> {
  const from = worstPain(patient?.statuses);
  if (!from) return null;
  const entry = ((api.actors.conditions(patient) ?? []) as any[]).find((c) => c?.id === from);
  const left = Number(entry?.untilTime) - worldNow();
  if (!entry) await api.actors.applyCondition(patient, { key: from } as any);
  await api.actors.removeCondition(patient, from);
  const to = easedPain(from);
  if (to) await api.actors.applyCondition(patient, { key: to, ...(left > 0 ? { duration: { seconds: left } } : {}) } as any);
  return { from, to };
}

const painName = (step: PainStep | null) => (step ? game.i18n.localize(`GWORLD.Affliction.Name.${step}`) : L("NoPain"));

async function painOutcome(api: GWorldApi, patient: any, title: string, worked: boolean): Promise<void> {
  if (!worked) return void (await card(patient, title, [F("NotEased", { name: patient.name })]));
  const eased = await easePain(api, patient);
  await card(patient, title, [eased ? F("Eased", { name: patient.name, from: painName(eased.from), to: painName(eased.to) }) : F("NoPainToEase", { name: patient.name })]);
}

/** Shortwave diathermy: the healer's Physician roll after half an hour (HT:EE p. 13). */
export async function diathermy(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor() ?? actor;
  if (!actor || !patient) return;
  const early = deviceData(item).earlyModel;
  const title = F("DiathermyTitle", { name: item.name, patient: patient.name, minutes: PAIN_TREATMENT_MINUTES });
  const modifiers = early ? [{ label: L("EarlyMachine"), value: EARLY_DIATHERMY.penalty }] : [];
  const result: any = await api.roll.success({ actor, base: physician(api, actor), skill: "Physician", label: title, modifiers, tags: ["physician", "diathermy"], item, opponent: patient } as any);
  if (!result) return;
  if (early && result.criticalFailure) {
    const burn = await rollDice(EARLY_DIATHERMY.burn.replace(/d/, "d6"));
    const amount = Math.max(0, burn.total);
    if (amount > 0) await api.actors.applyInjury(patient, { amount, label: L("Burned") } as any);
    await card(patient, title, [F("Burn", { name: patient.name, amount, dice: EARLY_DIATHERMY.burn })]);
  }
  await painOutcome(api, patient, title, result.success === true);
}

/** The heating pad: the patient's HT roll after half an hour (HT:EE p. 21). */
export async function heatingPad(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor() ?? actor;
  if (!patient) return;
  const title = F("PadTitle", { name: item.name, patient: patient.name, minutes: PAIN_TREATMENT_MINUTES });
  const ht = Number(api.actors.attribute(patient, "HT")) || 10;
  const result: any = await api.roll.success({ actor: patient, base: ht, kind: "attribute", skill: "HT", label: title, tags: ["HT", "heatingPad"], item } as any);
  if (result) await painOutcome(api, patient, title, result.success === true);
}

/**
 * A course of electroconvulsive therapy (HT:EE p. 14): the Seizure it
 * induces, the healer's Physician roll, and the patient's HT-2 against
 * forgetting the days before it.
 */
export async function electroconvulsive(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor();
  if (!actor || !patient) return void ui.notifications?.warn(L("TargetPatient"));
  const title = F("EctTitle", { name: item.name, patient: patient.name });
  const course: any = await api.roll.success({ actor, base: physician(api, actor), skill: "Physician", label: title, tags: ["physician", "electroconvulsive"], item, opponent: patient } as any);
  if (!course) return;
  const lines: string[] = [];
  const rolls: any[] = [];

  // Treated as a Seizure: 1d minutes incapacitated and 1d FP (Campaigns p. 429).
  const minutes = await rollDice("1d6");
  const fp = await rollDice("1d6");
  rolls.push(minutes.roll, fp.roll);
  await api.actors.applyCondition(patient, { key: "seizure", duration: { seconds: minutes.total * 60 } } as any);
  await api.actors.applyInjury(patient, { amount: fp.total, fatigue: true, label: L("Seizure") } as any);
  lines.push(F("SeizureLine", { name: patient.name, minutes: minutes.total, fp: fp.total }));

  if (course.success) {
    await patient.setFlag?.(MODULE_ID, ECT_FLAG, { until: worldNow() + ECT.mitigatesSeconds, by: String(item.name ?? "") });
    lines.push(F("Mitigated", { name: patient.name }));
  } else lines.push(F("NoEffect", { name: patient.name }));

  const ht = Number(api.actors.attribute(patient, "HT")) || 10;
  const memory: any = await api.roll.success({ actor: patient, base: ht, kind: "attribute", skill: "HT", label: F("MemoryRoll", { name: patient.name }), modifiers: [{ label: item.name, value: ECT.htModifier }], tags: ["HT", "electroconvulsive"], item } as any);
  if (memory && !memory.success) {
    const days = await rollDice("1d6");
    rolls.push(days.roll);
    lines.push(F("Amnesia", { name: patient.name, days: days.total }));
  }
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: patient }),
    rolls,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${foundry.utils.escapeHTML(title)}</span></div>${lines.map((l) => `<div class="gc-result">${foundry.utils.escapeHTML(l)}</div>`).join("")}</div>`,
  });
}

/** A laser scalpel the character carries that is designed for the Surgery rolled (HT:EE p. 14). */
const laserScalpel = (actor: any, skill: unknown) =>
  [...(actor?.items ?? [])].find((i: any) => i?.type === "equipment" && i.system?.carried !== false && kindOf(i) === "laserScalpel" && scalpelFits(deviceData(i).specialty, skill)) ?? null;

/**
 * Cauterizing with the electrocautery or the cautery pen (HT:EE pp. 13-14):
 * the healer's Surgery roll stops the targeted patient's superficial bleeding
 * (Campaigns p. 420) or burns off a small growth; without a local
 * anaesthetic the heat puts the patient in Severe Pain, which the GM takes
 * off when the treatment ends. The pen is thrown away after use.
 */
export async function cauterize(api: GWorldApi, item: any, actor: any): Promise<void> {
  const patient = targetedActor() ?? actor;
  if (!actor || !patient) return;
  const level = surgeryLevel((skill) => api.actors.skillLevel(actor, skill) ?? null);
  if (level === null) return void ui.notifications?.warn(L("NoSurgery"));
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${foundry.utils.escapeHTML(L("CauteryHint"))}</p><label class="icheck"><input type="checkbox" name="anaesthetic" checked> ${foundry.utils.escapeHTML(L("Anaesthetic"))}</label></div>`,
    ok: { label: L("CauteryAction"), callback: (_event: Event, button: HTMLElement) => ({ anaesthetic: button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="anaesthetic"]')?.checked === true }) },
    rejectClose: false,
  }) as { anaesthetic: boolean } | null;
  if (!answer) return;
  const title = F("CauteryTitle", { name: item.name, patient: patient.name });
  const result: any = await api.roll.success({ actor, base: level, skill: CAUTERY.skill, label: title, tags: ["cautery"], item, opponent: patient } as any);
  if (!result || "refused" in result) return;
  const lines: string[] = [];
  if (!answer.anaesthetic) {
    await api.actors.applyCondition(patient, { key: CAUTERY.pain } as any);
    lines.push(F("CauteryPain", { name: patient.name }));
  }
  if (result.success) {
    await api.actors.stopBleeding(patient);
    lines.push(F("Cauterized", { name: patient.name }));
  } else lines.push(F("NotCauterized", { name: patient.name }));
  if (kindOf(item) === "cauteryPen") {
    await api.items.changeQuantity(item, -1, { reason: L("PenUsed") });
    lines.push(L("PenUsed"));
  }
  await card(patient, title, lines);
}

// ── the item sheet ──

function itemLines(item: any): string[] {
  switch (kindOf(item)) {
    case "diathermy": return [F("DiathermyItem", { minutes: PAIN_TREATMENT_MINUTES }), ...(deviceData(item).earlyModel ? [F("EarlyItem", { penalty: EARLY_DIATHERMY.penalty, burn: EARLY_DIATHERMY.burn })] : [])];
    case "heatingPad": return [F("PadItem", { minutes: PAIN_TREATMENT_MINUTES })];
    case "ect": return [F("EctItem", { modifier: ECT.htModifier })];
    case "laserScalpel": return [F("ScalpelItem", { bonus: LASER_SCALPEL }), ...(deviceData(item).specialty ? [F("ScalpelSpecialty", { specialty: deviceData(item).specialty })] : [])];
    case "cautery": return [L("CauteryItem")];
    case "cauteryPen": return [L("CauteryItem"), L("PenItem")];
    default: return [];
  }
}

export function readyElectromedicine(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ee-electromedicine-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ee-electromedicine-item.hbs`,
    visible: (item) => on() && kindOf(item) !== null,
    context: (item) => ({
      editable: Boolean(item?.isOwner ?? true),
      lines: itemLines(item),
      early: kindOf(item) === "diathermy" ? { checked: deviceData(item).earlyModel } : null,
      specialty: kindOf(item) === "laserScalpel" ? { value: deviceData(item).specialty } : null,
    }),
    listeners: (element, item) => {
      element.querySelector<HTMLInputElement>("[data-ee-electromedicine=earlyModel]")?.addEventListener("change", async (event) => {
        await storeDevice(item, { earlyModel: (event.currentTarget as HTMLInputElement).checked });
      });
      element.querySelector<HTMLInputElement>("[data-ee-electromedicine=specialty]")?.addEventListener("change", async (event) => {
        await storeDevice(item, { specialty: String((event.currentTarget as HTMLInputElement).value ?? "").trim() });
      });
    },
  });

  // A course that worked: the disorder out of play for its year, as a Mitigator (HT:EE p. 14; Characters p. 112).
  Hooks.on("gworld.traitsInPlay", (context: any) => {
    if (!on() || !context?.actor || !Array.isArray(context.traits)) return;
    const course = context.actor.getFlag?.(MODULE_ID, ECT_FLAG);
    if (!stillMitigated(course?.until, worldNow())) return;
    for (const entry of context.traits) {
      if (!entry || entry.inPlay === false || !ECT_MITIGATES.test(String(entry.name ?? "").trim())) continue;
      entry.inPlay = false;
      entry.reason = F("MitigatedReason", { name: String(course.by ?? "") });
    }
  });

  // The laser scalpel on an operation (HT:EE p. 14).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !Array.isArray(context?.modifiers)) return;
    const tags: string[] = Array.isArray(context.tags) ? context.tags : [];
    if (!tags.includes("surgery") || !/^surgery\b/i.test(String(context.skill ?? ""))) return;
    const scalpel = laserScalpel(context.actor, context.skill);
    if (scalpel) context.modifiers.push({ label: String(scalpel.name ?? ""), value: LASER_SCALPEL });
  });

  const action = (key: string, label: string, icon: string, kind: Electromedicine, run: (item: any, actor: any) => Promise<void>) =>
    api.sheets.registerRowAction({ module: MODULE_ID, key, itemTypes: ["equipment"], label: L(label), icon, visible: (item) => on() && kindOf(item) === kind, run: (item, actor) => { void run(item, actor); } });
  action("ee-diathermy", "DiathermyAction", "fa-solid fa-wave-square", "diathermy", (item, actor) => diathermy(api, item, actor));
  action("ee-heating-pad", "PadAction", "fa-solid fa-temperature-arrow-up", "heatingPad", (item, actor) => heatingPad(api, item, actor));
  action("ee-electroconvulsive", "EctAction", "fa-solid fa-brain", "ect", (item, actor) => electroconvulsive(api, item, actor));
  action("ee-cautery", "CauteryAction", "fa-solid fa-fire-flame-simple", "cautery", (item, actor) => cauterize(api, item, actor));
  action("ee-cautery-pen", "CauteryAction", "fa-solid fa-fire-flame-simple", "cauteryPen", (item, actor) => cauterize(api, item, actor));
}
