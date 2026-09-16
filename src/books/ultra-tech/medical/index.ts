/**
 * GURPS Ultra-Tech's medical gear, drugs and nano, registered with the system
 * through the add-on API (pp. 196-206), under three switches.
 *
 *   - **Medical gear:** automeds, suitcase docs, pocket medics, suit docs and
 *     paramedical swarms treating with their own skills through the system's
 *     First Aid, rounds and surgery (API 1.60.0); bandage spray, plasti-skin and
 *     smart bandages; a patient on life support, whose mortal wound checks are
 *     daily at the unit's bonus; a medical bed's and medical supplies' bonus to
 *     a physician's rounds, and the Medical Help Table; hibernation; neural
 *     inhibitors.
 *   - **Drugs and nano:** morphazine, soothe and crediline dosed and resisted
 *     through the system's poison rules; the rest taken from the item: analgine,
 *     antirad, hyperstim, ascepaline, purge, memory-beta, immune machines,
 *     quickheal, critical repair nano, respirocytes, torpine and fast
 *     regeneration nano; drug forms priced.
 *   - **Regeneration:** nanostasis, regeneration and rejuvenation tanks, the
 *     chrysalis machine reviving the dead, the pocket regenerator and the
 *     regeneration ray.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import {
  BANDAGE_SPRAY_HP,
  DRUG_FORMS,
  MEDICAL_BED,
  NANOSTASIS,
  QUICKHEAL,
  REGENERATION_RAY,
  RESISTED_DRUGS,
  SMART_BANDAGE,
  TORPINE,
  analgineHours,
  ascepalineRoll,
  bandageSpraySeconds,
  chrysalisRevival,
  chrysalisRevivalPenalty,
  deviceByName,
  deviceSkill,
  drugByName,
  esuBonus,
  fpAfterHibernation,
  immuneCureDice,
  isLifeSupport,
  medicalBedRounds,
  medicalHelp,
  nanostasisRevival,
  programmingPenalty,
  regeneratedHp,
  regenerationRayOutcome,
  rejuvenationDays,
  rejuvenationOutcome,
  resistedDrugEffect,
  revivalOf,
  smartBandageHp,
  suitDocDays,
  suppliesPatientDays,
  type DeviceSkill,
  type DrugForm,
  type ResistedDrug,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Medical.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Medical.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "drug";
const CARE_FLAG = "utCare";
const FORMS = Object.keys(DRUG_FORMS) as DrugForm[];

export interface MedicalSwitches {
  gear: () => boolean;
  drugs: () => boolean;
  regeneration: () => boolean;
}

/** Where a patient is, as the rolls that follow read it. */
interface Care {
  /** The life-support unit sustaining them, by name. */
  lifeSupport?: string;
  /** In a medical bed. */
  medicalBed?: boolean;
  /** In hibernation or nanostasis, and which. */
  suspended?: "hibernation" | "nanostasis" | null;
  /** World time torpine's trance ends. */
  torpineUntil?: number | null;
  /** World time the last quickheal was taken. */
  quickhealAt?: number;
  /** World times of this week's ascepaline doses. */
  ascepaline?: number[];
  /** Respirocytes in the blood. */
  respirocytes?: boolean;
  /** World time before which the regeneration ray can't be used again. */
  regenerationBarredUntil?: number;
}

export function initMedical(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      form: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...FORMS] }),
    }),
  });
}

const nameOf = (item: any) => String(item?.name ?? "").trim();
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9;
const now = () => Number((game as any).time?.worldTime) || 0;
const DAY = 86400;

function careOf(actor: any): Care {
  return (actor?.getFlag?.(MODULE_ID, CARE_FLAG) as Care | undefined) ?? {};
}

async function setCare(actor: any, patch: Partial<Care>): Promise<void> {
  await actor?.setFlag?.(MODULE_ID, CARE_FLAG, { ...careOf(actor), ...patch });
}

/** The patient: the targeted character, else the selected one, else whoever has the item. */
function patientFor(owner: any): any {
  const targeted = [...((game as any).user?.targets ?? [])][0]?.actor;
  return targeted ?? canvas?.tokens?.controlled?.[0]?.actor ?? owner;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const numberAt = (form: HTMLElement, name: string) => Number(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value) || 0;
const valueAt = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value ?? "";

/** Moves a character's HP, within their maximum. */
async function changeHp(actor: any, by: number): Promise<number> {
  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const current = Number(hp.value) || 0;
  const next = by > 0 ? Math.min(Number(hp.max) || 0, current + by) : current + by;
  if (next !== current) await actor.update({ "system.hp.value": next });
  return next - current;
}

async function rollDice(formula: string): Promise<number> {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll.total ?? 0;
}

/** A condition taken off by its label, where the system put it on. */
async function clearCondition(api: GWorldApi, actor: any, pattern: RegExp): Promise<void> {
  for (const condition of api.actors.conditions(actor)) {
    if (pattern.test(condition.label) || pattern.test(condition.id)) await api.actors.removeCondition(actor, condition.id);
  }
}

/** A device treating with its own skill (pp. 196-201). */
async function deviceTreats(api: GWorldApi, item: any, owner: any): Promise<void> {
  const device = deviceByName(nameOf(item));
  if (!device) return;
  const tl = tlOf(item);
  const offered = (["firstAid", "physician", "surgery"] as DeviceSkill[]).filter((s) => deviceSkill(device, s, tl) !== null);
  const patient = patientFor(owner);
  const what = offered.length === 1 ? offered[0]! : await ask(L("TreatTitle"),
    row(L("Treatment"), `<select name="what">${offered.map((s) => `<option value="${s}">${esc(F(`Skill.${s}`, { skill: deviceSkill(device, s, tl) }))}</option>`).join("")}</select>`),
    (form) => valueAt(form, "what") as DeviceSkill);
  if (!what) return;
  const skill = deviceSkill(device, what, tl)!;
  const label = F("DeviceLabel", { name: nameOf(item), skill });
  if (what === "firstAid") {
    // A pocket medic sprays the wound before it treats shock (p. 200).
    if (/pocket medic/i.test(nameOf(item))) await api.actors.stopBleeding(patient);
    await api.actors.firstAid({ healer: owner, patient, skill, techLevel: tl, label });
  } else if (what === "physician") {
    await api.actors.attendPatient({ healer: owner, patient, skill, label });
  } else {
    await api.actors.operate({ surgeon: owner, patient, skill, techLevel: tl, label });
  }
}

/** Bandage spray and plasti-skin: bleeding stopped, and a point back for the spray (pp. 197-198). */
async function dressWound(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  await api.actors.stopBleeding(patient);
  const lines = [F("BleedingStopped", { name: patient.name })];
  if (/bandage spray/i.test(nameOf(item)) && !/smart/i.test(nameOf(item))) {
    const gained = await changeHp(patient, BANDAGE_SPRAY_HP);
    lines.push(F("SprayHeals", { hp: gained, seconds: bandageSpraySeconds(tlOf(item)) }));
  } else lines.push(L("PlastiSkin"));
  await say(patient, nameOf(item), lines);
}

/** A diagnostic smart bandage: bleeding stopped, then its own First Aid-12 against shock (p. 199). */
async function smartBandage(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  await api.actors.stopBleeding(patient);
  const result: any = await api.roll.success({ actor: patient, base: SMART_BANDAGE.skill, label: F("SmartBandageLabel", { name: nameOf(item), minutes: SMART_BANDAGE.minutes }) } as any);
  if (!result) return;
  const rolled = result.success && !result.criticalFailure ? await rollDice(`${SMART_BANDAGE.dice}d6`) : 0;
  const hp = smartBandageHp(Boolean(result.success), Boolean(result.criticalFailure), rolled);
  const gained = hp ? await changeHp(patient, hp) : 0;
  await say(patient, nameOf(item), [F("SmartBandageResult", { name: patient.name, hp: gained })]);
}

/** Puts a mortally wounded patient on life support: Electronics Operation (Medical), 10 seconds a try (p. 198). */
async function attachLifeSupport(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  const skill = "Electronics Operation (Medical)";
  const base = api.actors.skillLevel(owner, skill) ?? (api.actors.attribute(owner, "IQ") ?? 10) - 5;
  const result: any = await api.roll.success({ actor: owner, base, skill, label: F("AttachLabel", { name: nameOf(item), patient: patient.name }) } as any);
  if (!result?.success) return;
  await setCare(patient, { lifeSupport: nameOf(item) });
  await say(patient, nameOf(item), [F("Attached", { name: patient.name, bonus: esuBonus(nameOf(item)) })]);
}

/** The daily mortal wound check on life support, at the better of HT and a caregiver's Physician (p. 197). */
async function traumaMaintenance(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  const physician = await ask(L("TraumaTitle"), row(L("CaregiverPhysician"), `<input type="number" name="physician" value="0" min="0" style="width:70px" />`), (form) => numberAt(form, "physician"));
  if (physician === null) return;
  if (careOf(patient).lifeSupport !== nameOf(item)) await setCare(patient, { lifeSupport: nameOf(item) });
  await api.actors.rollMortalWound({ actor: patient, physician: physician || null, traumaMaintenance: true });
}

/** Hibernation and nanostasis: going under, and coming out (pp. 198, 200-201). */
async function suspend(api: GWorldApi, item: any, owner: any, on: MedicalSwitches): Promise<void> {
  const patient = patientFor(owner);
  const nanostasis = /nanostasis|chrysalis/i.test(nameOf(item));
  if (nanostasis && !on.regeneration()) return;
  const care = careOf(patient);
  if (!care.suspended) {
    await api.actors.applyCondition(patient, { key: "unconscious" });
    await setCare(patient, { suspended: nanostasis ? "nanostasis" : "hibernation" });
    await say(patient, nameOf(item), [F(nanostasis ? "IntoNanostasis" : "IntoHibernation", { name: patient.name, hours: nanostasis ? NANOSTASIS.hoursIn : 1 })]);
    return;
  }
  await clearCondition(api, patient, /unconscious/i);
  await setCare(patient, { suspended: null });
  if (care.suspended === "hibernation") {
    const fp = Number(patient.system?.fp?.value) || 0;
    await patient.update({ "system.fp.value": fpAfterHibernation(fp) });
    await say(patient, nameOf(item), [F("OutOfHibernation", { name: patient.name })]);
    return;
  }
  // Nanostasis revival: the supervisor's Physician, or the pod's or chrysalis machine's own (pp. 200-202).
  const device = deviceByName(nameOf(item));
  const own = device ? deviceSkill(device, "physician", tlOf(item)) : null;
  const base = own ?? api.actors.skillLevel(owner, "Physician") ?? (api.actors.attribute(owner, "IQ") ?? 10) - 5;
  const result: any = await api.roll.success({ actor: owner, base, skill: "Physician", label: F("ReviveLabel", { name: patient.name }) } as any);
  if (!result) return;
  const revival = nanostasisRevival(revivalOf(result), Number(api.actors.attribute(patient, "HT")) || 10);
  await say(patient, nameOf(item), [F(revival.amnesia ? `Revived.${revival.amnesia}` : "Revived.clear", { name: patient.name, hours: revival.confusedHours, out: /chrysalis/i.test(nameOf(item)) ? Math.ceil(NANOSTASIS.hoursOut / NANOSTASIS.chrysalisSpeed) : NANOSTASIS.hoursOut })]);
}

/** A neural inhibitor: where it's placed, and a HT-6 affliction on the unwilling (p. 201). */
async function neuralInhibitor(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  const answer = await ask(L("InhibitorTitle"),
    row(L("Placement"), `<select name="place"><option value="limb">${esc(L("Place.limb"))}</option><option value="spine">${esc(L("Place.spine"))}</option><option value="skull">${esc(L("Place.skull"))}</option></select>`)
    + row(L("Unwilling"), `<input type="checkbox" name="unwilling" />`),
    (form) => ({ place: valueAt(form, "place"), unwilling: Boolean(form.querySelector<HTMLInputElement>("[name=unwilling]")?.checked) }));
  if (!answer) return;
  if (answer.unwilling) {
    const resisted: any = await api.roll.success({ actor: patient, base: api.actors.attribute(patient, "HT") ?? 10, kind: "attribute", label: L("InhibitorTitle"), modifiers: [{ label: L("InhibitorTitle"), value: -6 }], tags: ["resist"] } as any);
    if (resisted?.success) return void say(patient, nameOf(item), [F("InhibitorResisted", { name: patient.name })]);
  }
  if (answer.place === "skull") await api.actors.applyCondition(patient, { key: "unconscious" });
  if (answer.place === "spine") await api.actors.applyCondition(patient, { key: "paralysis" });
  await say(patient, nameOf(item), [F(`Inhibited.${answer.place}`, { name: patient.name })]);
}

/** Regeneration, rejuvenation and revival in a tank or chrysalis machine (pp. 201-202). */
async function tank(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  const chrysalis = /chrysalis/i.test(nameOf(item));
  const choices = ["regenerate", ...(/rejuvenation|chrysalis/i.test(nameOf(item)) ? ["rejuvenate"] : []), ...(chrysalis ? ["revive"] : [])];
  const answer = await ask(L("TankTitle"),
    row(L("Procedure"), `<select name="what">${choices.map((c) => `<option value="${c}">${esc(L(`Procedure.${c}`))}</option>`).join("")}</select>`)
    + row(L("Hours"), `<input type="number" name="hours" value="24" min="0" style="width:70px" />`)
    + row(L("HoursDead"), `<input type="number" name="dead" value="0" min="0" style="width:70px" />`),
    (form) => ({ what: valueAt(form, "what"), hours: numberAt(form, "hours"), dead: numberAt(form, "dead") }));
  if (!answer) return;
  const own = chrysalis ? deviceSkill(deviceByName(nameOf(item))!, "physician", tlOf(item)) : null;
  const base = own ?? api.actors.skillLevel(owner, "Physician") ?? (api.actors.attribute(owner, "IQ") ?? 10) - 5;
  const modifiers = answer.what === "revive" ? [{ label: F("HoursDeadLine", { hours: answer.dead }), value: chrysalisRevivalPenalty(answer.dead) }].filter((m) => m.value) : [];
  const result: any = await api.roll.success({ actor: owner, base, skill: "Physician", label: F(`ProcedureLabel.${answer.what}`, { name: patient.name }), modifiers } as any);
  if (!result) return;
  if (answer.what === "regenerate") {
    const gained = await changeHp(patient, regeneratedHp(answer.hours, { chrysalis, supervised: Boolean(result.success) }));
    return void say(patient, nameOf(item), [F("Regenerated", { name: patient.name, hp: gained, hours: answer.hours })]);
  }
  if (answer.what === "rejuvenate") {
    return void say(patient, nameOf(item), [F(`Rejuvenation.${rejuvenationOutcome(revivalOf(result))}`, { name: patient.name, days: rejuvenationDays(tlOf(item), chrysalis) })]);
  }
  const revived = chrysalisRevival(Boolean(result.success), Number(result.margin) || 0);
  if (revived !== "mindless" || result.success === false) await clearCondition(api, patient, /dead/i);
  await say(patient, nameOf(item), [F(`Chrysalis.${revived}`, { name: patient.name })]);
}

/** The regeneration ray at high power: an hour to set up and an hour of treatment (p. 202). */
async function regenerationRay(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  if ((careOf(patient).regenerationBarredUntil ?? 0) > now()) return void ui.notifications?.warn(F("RayBarred", { name: patient.name }));
  const base = api.actors.skillLevel(owner, "Physician") ?? (api.actors.attribute(owner, "IQ") ?? 10) - 5;
  const result: any = await api.roll.success({ actor: owner, base, skill: "Physician", label: F("RayLabel", { name: patient.name }) } as any);
  if (!result) return;
  const outcome = regenerationRayOutcome(revivalOf(result));
  if (outcome === "healed" || outcome === "sideEffect") {
    await changeHp(patient, Math.max(0, (Number(patient.system?.hp?.max) || 0) - (Number(patient.system?.hp?.value) || 0)));
  } else {
    const damage = await rollDice(`${REGENERATION_RAY.failureDamage}6`);
    await api.actors.applyInjury(patient, { amount: damage, label: nameOf(item) });
    const weeks = await rollDice("1d6");
    await setCare(patient, { regenerationBarredUntil: now() + weeks * 7 * DAY });
  }
  await say(patient, nameOf(item), [F(`Ray.${outcome}`, { name: patient.name })]);
}

/** A pocket regenerator: bandaging and shock in a minute, by First Aid or Electronics Operation (Medical) (p. 202). */
async function pocketRegenerator(api: GWorldApi, item: any, owner: any): Promise<void> {
  const patient = patientFor(owner);
  await api.actors.stopBleeding(patient);
  const skills = [api.actors.skillLevel(owner, "First Aid"), api.actors.skillLevel(owner, "Electronics Operation (Medical)")].filter((s): s is number => s !== null);
  await api.actors.firstAid({ healer: owner, patient, techLevel: Math.max(12, tlOf(item)), label: nameOf(item), ...(skills.length ? { skill: Math.max(...skills) } : {}) });
}

/** Taking a dose of one of the drugs a roll doesn't resist (pp. 205-206). */
async function takeDose(api: GWorldApi, item: any, owner: any): Promise<void> {
  const drug = drugByName(nameOf(item));
  const patient = patientFor(owner);
  if (!drug) return;
  const name = String(patient.name ?? "");
  const ht = Number(api.actors.attribute(patient, "HT")) || 10;
  const care = careOf(patient);
  const lines: string[] = [];
  switch (drug) {
    case "morphazine":
    case "soothe":
    case "crediline": {
      const dose = await api.actors.dosePoison(patient, { ...(RESISTED_DRUGS[drug] as any), delivery: [...RESISTED_DRUGS[drug].delivery], delaySeconds: 0, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, name: nameOf(item), reference: "Ultra-Tech p. 205", source: `${MODULE_ID}.${drug}` });
      if (dose) await api.actors.advancePoison(patient, dose.id);
      return;
    }
    case "analgine":
      lines.push(F("Drug.analgine", { name, hours: analgineHours(ht) }));
      break;
    case "hyperstim":
      await clearCondition(api, patient, /unconscious/i);
      lines.push(F("Drug.hyperstim", { name }));
      break;
    case "ascepaline": {
      const week = (care.ascepaline ?? []).filter((t) => t > now() - 7 * DAY);
      const doses = week.length + 1;
      await setCare(patient, { ascepaline: [...week, now()] });
      const bonus = ascepalineRoll(doses);
      lines.push(F("Drug.ascepaline", { name }));
      if (bonus !== null) {
        const result: any = await api.roll.success({ actor: patient, base: ht, kind: "attribute", label: F("AscepalineRoll", { doses }), modifiers: [{ label: L("AscepalineRepeat"), value: bonus }] } as any);
        if (result && !result.success) lines.push(F("Drug.ascepalineDamage", { name }));
      }
      break;
    }
    case "purge": {
      const result: any = await api.roll.success({ actor: patient, base: ht, kind: "attribute", label: nameOf(item) } as any);
      if (result?.success) {
        for (const dose of api.actors.activePoisons(patient)) {
          if (!dose.illness && /morphazine|soothe|crediline|sleepGas/.test(String(dose.source ?? ""))) await api.actors.clearPoison(patient, dose.id);
        }
        lines.push(F("Drug.purge", { name, minutes: await rollDice("2d6") }));
      } else if (result?.criticalFailure) {
        await api.actors.applyCondition(patient, { key: "nauseated", duration: { seconds: 3600 } });
        lines.push(F("Drug.purgeNausea", { name }));
      } else lines.push(F("Drug.purgeFailed", { name }));
      break;
    }
    case "quickheal": {
      if ((care.quickhealAt ?? -Infinity) > now() - QUICKHEAL.hours * 3600) return void ui.notifications?.warn(L("QuickhealHour"));
      await setCare(patient, { quickhealAt: now() });
      const gained = await changeHp(patient, await rollDice(`${QUICKHEAL.dice}d6`));
      lines.push(F("Drug.quickheal", { name, hp: gained }));
      break;
    }
    case "respirocytes":
      await setCare(patient, { respirocytes: true });
      lines.push(F("Drug.respirocytes", { name }));
      break;
    case "torpine":
      await api.actors.applyCondition(patient, { key: "unconscious", duration: { seconds: TORPINE.hours * 3600 } });
      await setCare(patient, { torpineUntil: now() + TORPINE.hours * 3600 });
      lines.push(F("Drug.torpine", { name }));
      break;
    case "tailoredImmune":
    case "programmableImmune": {
      const programmable = drug === "programmableImmune";
      const disease = programmable ? await ask(L("ImmuneTitle"), row(L("Disease"), `<select name="d"><option value="known">${esc(L("DiseaseKind.known"))}</option><option value="rare">${esc(L("DiseaseKind.rare"))}</option><option value="unknown">${esc(L("DiseaseKind.unknown"))}</option></select>`), (form) => valueAt(form, "d") as "known" | "rare" | "unknown") : "known";
      if (!disease) return;
      const base = api.actors.skillLevel(owner, "Physician") ?? (api.actors.attribute(owner, "IQ") ?? 10) - 5;
      const result: any = await api.roll.success({ actor: owner, base, skill: "Physician", label: F("ImmuneLabel", { name }), modifiers: [{ label: L(`DiseaseKind.${disease}`), value: programmable ? programmingPenalty(disease) : 0 }].filter((m) => m.value) } as any);
      if (!result?.success) return void say(patient, nameOf(item), [L("Drug.immuneWrong")]);
      for (const dose of api.actors.activePoisons(patient)) if (dose.illness) await api.actors.clearPoison(patient, dose.id);
      lines.push(F("Drug.immune", { name, dice: immuneCureDice(tlOf(item)) }));
      break;
    }
    default:
      lines.push(F(`Drug.${drug}`, { name }));
  }
  await say(patient, nameOf(item), lines);
}

/** Torpine's trance ending: healed, at 1 FP (p. 206). */
async function torpineWakes(api: GWorldApi, owner: any): Promise<void> {
  const patient = patientFor(owner);
  await clearCondition(api, patient, /unconscious/i);
  await changeHp(patient, Math.max(0, (Number(patient.system?.hp?.max) || 0) - (Number(patient.system?.hp?.value) || 0)));
  await patient.update({ "system.fp.value": TORPINE.fp });
  await setCare(patient, { torpineUntil: null });
  await say(patient, L("Torpine"), [F("TorpineWakes", { name: patient.name })]);
}

/** Hyperstim wearing off: HT, 1 HP on a failure and a heart attack on a critical failure (p. 205). */
async function hyperstimWearsOff(api: GWorldApi, owner: any): Promise<void> {
  const patient = patientFor(owner);
  const result: any = await api.roll.success({ actor: patient, base: api.actors.attribute(patient, "HT") ?? 10, kind: "attribute", label: L("HyperstimOff") } as any);
  if (!result || result.success) return;
  await api.actors.applyInjury(patient, { amount: 1, label: L("HyperstimOff") });
  if (result.criticalFailure) await api.actors.applyCondition(patient, { key: "heartAttack" });
}

function itemContext(item: any, on: MedicalSwitches): Record<string, unknown> {
  const name = nameOf(item);
  const tl = tlOf(item);
  const lines: string[] = [];
  const device = deviceByName(name);
  if (on.gear()) {
    if (device) lines.push(F("DeviceSkills", { skills: (["firstAid", "physician", "surgery", "diagnosis"] as DeviceSkill[]).filter((s) => deviceSkill(device, s, tl) !== null).map((s) => F(`Skill.${s}`, { skill: deviceSkill(device, s, tl) })).join(", ") }));
    if (isLifeSupport(name)) lines.push(F("LifeSupportLine", { bonus: esuBonus(name) }));
    if (/^medical bed$/i.test(name)) lines.push(F("MedicalBedLine", { bonus: MEDICAL_BED, rounds: medicalBedRounds(tl) }));
    if (/^medical supplies$/i.test(name)) lines.push(F("SuppliesLine", { days: suppliesPatientDays(tl), rounds: medicalHelp(tl).roundsPerDay, patients: medicalHelp(tl).patients }));
    if (/^suit doc$/i.test(name)) lines.push(F("SuitDocLine", { days: suitDocDays(tl) }));
    if (/bandage spray/i.test(name) && !/smart/i.test(name)) lines.push(F("SprayLine", { seconds: bandageSpraySeconds(tl) }));
  }
  const drug = drugByName(name);
  const form = String(item.system?.extensions?.[MODULE_ID]?.[FIELD]?.form ?? "");
  return {
    editable: item.isOwner,
    drug: on.drugs() && drug !== null && drug !== "aegis",
    forms: [{ value: "", label: L("Form.none"), selected: !form }, ...FORMS.map((value) => ({ value, label: L(`Form.${value}`), selected: value === form }))],
    lines,
  };
}

export function readyMedical(api: GWorldApi, on: MedicalSwitches): void {
  // The drugs a HT roll resists, dosed and resisted by the system (API 1.57.0).
  for (const drug of Object.keys(RESISTED_DRUGS) as ResistedDrug[]) {
    api.data.registerPoison({
      module: MODULE_ID,
      key: drug,
      label: `GCC.UT.Medical.DrugName.${drug}`,
      poison: { ...RESISTED_DRUGS[drug], delivery: [...RESISTED_DRUGS[drug].delivery], delaySeconds: 0, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, reference: "Ultra-Tech p. 205" },
      available: on.drugs,
    });
  }

  Hooks.on(api.combat.hooks.poisonCycle, (context: any) => {
    const source = String(context?.source ?? "");
    if (!on.drugs() || !source.startsWith(`${MODULE_ID}.`) || context.resisted !== false || !context.actor?.isOwner) return;
    const drug = source.slice(MODULE_ID.length + 1) as ResistedDrug;
    if (!(drug in RESISTED_DRUGS)) return;
    const effect = resistedDrugEffect(drug, context.margin, Number(api.actors.attribute(context.actor, "HT")) || 10);
    if (effect.condition) void api.actors.applyCondition(context.actor, { key: effect.condition, duration: { seconds: effect.minutes * 60 } });
    void say(context.actor, L(`DrugName.${drug}`), [F(`Resisted.${drug}`, { name: context.actor.name, minutes: effect.minutes })]);
  });

  // A drug's form sets its price (p. 204).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-medical",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.drugs() || !drugByName(nameOf(item))) return null;
      const form = item.system?.extensions?.[MODULE_ID]?.[FIELD]?.form as DrugForm | undefined;
      const factor = form ? DRUG_FORMS[form] ?? 1 : 1;
      return factor === 1 ? null : { cost: Math.round(price.cost * factor * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-medical-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-medical-item.hbs`,
    visible: (item) => (on.gear() && (deviceByName(nameOf(item)) !== null || isLifeSupport(nameOf(item)) || /^(medical bed|medical supplies|suit doc)$|bandage spray/i.test(nameOf(item)))) || (on.drugs() && drugByName(nameOf(item)) !== null && drugByName(nameOf(item)) !== "aegis"),
    context: (item) => itemContext(item, on),
    listeners: (element, item) => {
      element.querySelectorAll<HTMLSelectElement>("[data-gcc-ut-drug]").forEach((select) => {
        select.addEventListener("change", () => void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.form`]: select.value }));
      });
    },
  });

  // Care the rolls read: life support's bonus on the mortal wound check, a medical bed's and supplies' on the rounds (pp. 198-199).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const tags = (context?.tags ?? []) as string[];
    if (!on.gear()) return;
    if (tags.includes("mortalWound")) {
      const unit = careOf(context.actor).lifeSupport;
      const bonus = unit ? esuBonus(unit) : 0;
      if (bonus) context.modifiers.push({ label: unit, value: bonus });
    }
    if (tags.includes("physician")) {
      const patient = context.opponent;
      const quality: Array<{ label: string; value: number }> = [];
      if (careOf(patient).medicalBed) quality.push({ label: L("MedicalBed"), value: MEDICAL_BED });
      const supplies = [...(context.actor?.items ?? [])].find((i: any) => i.type === "equipment" && i.system?.carried !== false && /^medical supplies$/i.test(nameOf(i)));
      if (supplies) quality.push({ label: nameOf(supplies), value: 1 });
      // Equipment bonuses don't add up: the best of them counts.
      const best = quality.sort((a, b) => b.value - a.value)[0];
      if (best) context.modifiers.push(best);
    }
  });

  // Respirocytes: breathing isn't needed while they last (p. 206).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (on.drugs() && careOf(context?.actor).respirocytes && context.effects) context.effects.doesntBreathe = true;
  });

  const action = (key: string, label: string, icon: string, visible: (item: any) => boolean, run: (item: any, actor: any) => Promise<void>) =>
    api.sheets.registerRowAction({ module: MODULE_ID, key, itemTypes: ["equipment"], label: L(label), icon, visible, run });

  action("ut-device-treats", "TreatTitle", "fa-solid fa-user-doctor", (item) => on.gear() && deviceByName(nameOf(item)) !== null && !/nanostasis pod|chrysalis/i.test(nameOf(item)), (item, actor) => deviceTreats(api, item, actor));
  action("ut-dress-wound", "DressTitle", "fa-solid fa-bandage", (item) => on.gear() && /bandage spray|plasti-skin/i.test(nameOf(item)) && !/smart/i.test(nameOf(item)), (item, actor) => dressWound(api, item, actor));
  action("ut-smart-bandage", "SmartBandageTitle", "fa-solid fa-kit-medical", (item) => on.gear() && /^diagnostic smart bandage/i.test(nameOf(item)), (item, actor) => smartBandage(api, item, actor));
  action("ut-attach-life-support", "AttachTitle", "fa-solid fa-heart-pulse", (item) => on.gear() && isLifeSupport(nameOf(item)), (item, actor) => attachLifeSupport(api, item, actor));
  action("ut-trauma-maintenance", "TraumaTitle", "fa-solid fa-heart-circle-check", (item) => on.gear() && isLifeSupport(nameOf(item)), (item, actor) => traumaMaintenance(api, item, actor));
  action("ut-medical-bed", "BedTitle", "fa-solid fa-bed-pulse", (item) => on.gear() && /^medical bed$/i.test(nameOf(item)), async (item, actor) => {
    const patient = patientFor(actor);
    const inBed = !careOf(patient).medicalBed;
    await setCare(patient, { medicalBed: inBed });
    await say(patient, nameOf(item), [F(inBed ? "InBed" : "OutOfBed", { name: patient.name, rounds: medicalBedRounds(tlOf(item)) })]);
  });
  action("ut-suspend", "SuspendTitle", "fa-solid fa-snowflake", (item) => (on.gear() && /hibernation|suspended animation/i.test(nameOf(item))) || (on.regeneration() && /nanostasis|chrysalis/i.test(nameOf(item))), (item, actor) => suspend(api, item, actor, on));
  action("ut-neural-inhibitor", "InhibitorTitle", "fa-solid fa-circle-minus", (item) => on.gear() && /^neural inhibitor$/i.test(nameOf(item)), (item, actor) => neuralInhibitor(api, item, actor));
  action("ut-tank", "TankTitle", "fa-solid fa-flask", (item) => on.regeneration() && /^(regeneration tank|rejuvenation tank|chrysalis machine)$/i.test(nameOf(item)), (item, actor) => tank(api, item, actor));
  action("ut-regeneration-ray", "RayTitle", "fa-solid fa-sun", (item) => on.regeneration() && /^regeneration ray$/i.test(nameOf(item)), (item, actor) => regenerationRay(api, item, actor));
  action("ut-pocket-regenerator", "PocketTitle", "fa-solid fa-wand-magic-sparkles", (item) => on.regeneration() && /^pocket regenerator$/i.test(nameOf(item)), (item, actor) => pocketRegenerator(api, item, actor));
  action("ut-take-dose", "DoseTitle", "fa-solid fa-syringe", (item) => on.drugs() && drugByName(nameOf(item)) !== null && drugByName(nameOf(item)) !== "aegis", (item, actor) => takeDose(api, item, actor));
  action("ut-torpine-wakes", "TorpineWakesTitle", "fa-solid fa-sun", (item) => on.drugs() && drugByName(nameOf(item)) === "torpine", (_item, actor) => torpineWakes(api, actor));
  action("ut-hyperstim-off", "HyperstimOff", "fa-solid fa-heart-crack", (item) => on.drugs() && drugByName(nameOf(item)) === "hyperstim", (_item, actor) => hyperstimWearsOff(api, actor));
  action("ut-respirocytes-spent", "RespirocytesSpent", "fa-solid fa-lungs", (item) => on.drugs() && drugByName(nameOf(item)) === "respirocytes", async (_item, actor) => {
    const patient = patientFor(actor);
    await setCare(patient, { respirocytes: false });
    await say(patient, L("DrugName.respirocytes"), [F("RespirocytesGone", { name: patient.name })]);
  });
}

/** Whether a character has Aegis nanobots, for the nanoweapons that meet them (p. 206). */
export function hasAegis(actor: any): boolean {
  return [...(actor?.items ?? [])].some((i: any) => /^aegis nanobots$/i.test(nameOf(i)));
}
