/**
 * GURPS Ultra-Tech's medical gear, drugs and nano (pp. 196-206), as pure
 * rules: the devices that treat on their own skills, bandage spray and smart
 * bandages, life support and physician's equipment, the Medical Help Table,
 * hibernation, nanostasis, regeneration, rejuvenation, the chrysalis machine
 * and the regeneration ray, and the drugs' effects.
 */

import { deviceIn, deviceSkill, type Device, type DeviceSkill } from "../../../shared/medical/rules.js";
import { marginOfFailure } from "../../../shared/margin.js";

// The devices' engine is shared with High-Tech's (src/shared/medical); this is Ultra-Tech's table.
export { deviceSkill, type Device, type DeviceSkill };

/** The devices that treat patients on their own skills (pp. 196-202). */
export const DEVICES: ReadonlyArray<[RegExp, Device]> = [
  [/^automed$/i, { tl: 9, skills: { diagnosis: 12, firstAid: 13, physician: 11, surgery: 13 }, perTl: 2 }],
  [/^suitcase doc$/i, { tl: 10, skills: { diagnosis: 10, firstAid: 12, physician: 10, surgery: 10 }, perTl: 2 }],
  [/^pocket medic$/i, { tl: 9, skills: { firstAid: 12 }, perTl: 1 }],
  [/^suit doc$/i, { tl: 10, skills: { physician: 10 }, perTl: 0 }],
  [/^paramedical swarm$/i, { tl: 10, skills: { diagnosis: 10, firstAid: 10 }, perTl: 1 }],
  [/^chrysalis machine$/i, { tl: 11, skills: { physician: 13 }, perTl: 2 }],
  [/^nanostasis pod$/i, { tl: 10, skills: { physician: 14 }, perTl: 0 }],
];

export function deviceByName(name: string): Device | null {
  return deviceIn(DEVICES, name);
}

/** Bandage spray stops bleeding and restores 1 HP in 10 seconds at TL9, 5 at TL10, 3 at TL11, 2 at TL12 (p. 197). */
export function bandageSpraySeconds(tl: number): number {
  return tl >= 12 ? 2 : tl >= 11 ? 3 : tl >= 10 ? 5 : 10;
}
export const BANDAGE_SPRAY_HP = 1;

/** A diagnostic smart bandage treats shock with its own First Aid-12 after 10 minutes: 1d HP, -2 on a critical failure (p. 199). */
export const SMART_BANDAGE = Object.freeze({ skill: 12, minutes: 10, dice: 1, criticalFailure: -2 });

/** What a smart bandage's roll restores. */
export function smartBandageHp(success: boolean, criticalFailure: boolean, rolled: number): number {
  if (criticalFailure) return SMART_BANDAGE.criticalFailure;
  return success ? Math.max(1, rolled) : 0;
}

/** Life support's quality bonus to trauma maintenance: +2 in a hospital, +1 in transport (p. 198). */
export function esuBonus(name: string): number {
  const text = String(name ?? "");
  if (/^hospital esu$/i.test(text)) return 2;
  // An automed sustains a patient as a transport ESU does (p. 197).
  if (/^(transport esu|automed)$/i.test(text)) return 1;
  return 0;
}

/** Whether a device sustains a patient on life support (p. 198). */
export function isLifeSupport(name: string): boolean {
  return /^(hospital|transport|suitcase) esu$|^automed$|^suitcase doc$/i.test(String(name ?? "").trim());
}

/** The Medical Help Table: rounds a day and patients a doctor can keep, by medical TL (p. 199). */
export function medicalHelp(tl: number): { roundsPerDay: number; patients: number } {
  if (tl >= 12) return { roundsPerDay: 5, patients: 200 };
  if (tl >= 11) return { roundsPerDay: 4, patients: 100 };
  if (tl >= 10) return { roundsPerDay: 3, patients: 50 };
  return { roundsPerDay: 2, patients: 50 };
}

/** A medical bed's +3 to Physician, and its rounds a day: 2 at TL9 to 5 at TL12 (p. 199). */
export const MEDICAL_BED = 3;
export function medicalBedRounds(tl: number): number {
  return Math.max(2, Math.min(5, Math.floor(tl) - 7));
}

/** Medical supplies' patient-days: 50 at TL9-10, 100 at TL11, 200 at TL12 (p. 199). */
export function suppliesPatientDays(tl: number): number {
  return tl >= 12 ? 200 : tl >= 11 ? 100 : 50;
}

/** A suit doc's drug pack lasts 5 days at TL10, 10 at TL11, 20 at TL12 (p. 199). */
export function suitDocDays(tl: number): number {
  return tl >= 12 ? 20 : tl >= 11 ? 10 : 5;
}

/** Hibernation: an hour to go under, a tenth the life support and ageing; out of it at 0 FP (p. 198). */
export const HIBERNATION = Object.freeze({ hours: 1, lifeSupport: 0.1 });
export function fpAfterHibernation(fp: number): number {
  return Math.min(0, Math.floor(fp));
}

export type Revival = "criticalSuccess" | "success" | "failure" | "criticalFailure";

export function revivalOf(result: { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean }): Revival {
  if (result.criticalFailure) return "criticalFailure";
  if (result.criticalSuccess) return "criticalSuccess";
  return result.success ? "success" : "failure";
}

/**
 * Coming out of nanostasis (p. 200): Confused (9) for 20-HT hours and a week of
 * partial amnesia on a critical failure (HT weekly to recover), the same with a
 * daily roll on a failure, half the confusion and no memory loss on a success,
 * and straight out on a critical success.
 */
export function nanostasisRevival(outcome: Revival, ht: number): { confusedHours: number; amnesia: "weekly" | "daily" | null } {
  const hours = Math.max(0, 20 - Math.floor(ht));
  if (outcome === "criticalFailure") return { confusedHours: hours, amnesia: "weekly" };
  if (outcome === "failure") return { confusedHours: hours, amnesia: "daily" };
  if (outcome === "success") return { confusedHours: Math.floor(hours / 2), amnesia: null };
  return { confusedHours: 0, amnesia: null };
}

/** Hours to put someone in nanostasis and to revive them; a chrysalis machine works 12 times as fast (pp. 200-202). */
export const NANOSTASIS = Object.freeze({ hoursIn: 5, hoursOut: 8, chrysalisSpeed: 12, nanoCost: 5000 });

/** HP a regeneration tank heals: 1 per 12 hours, 1 an hour in a chrysalis machine; a failed supervision takes twice as long (pp. 201-202). */
export function regeneratedHp(hours: number, options: { chrysalis: boolean; supervised: boolean }): number {
  const per = options.chrysalis ? 1 : 12;
  const time = Math.max(0, hours) / (options.supervised ? 1 : 2);
  return Math.floor(time / per);
}

/** A regeneration tank heals 10 rads a day; lost limbs and organs regrow in six weeks (p. 201). */
export const REGENERATION = Object.freeze({ radsPerDay: 10, regrowWeeks: 6, feedstockPerWeek: 1000 });

/** Rejuvenation takes three months at TL10, six weeks at TL11, a week at TL12; a chrysalis machine 12 times as fast (pp. 201-202). */
export function rejuvenationDays(tl: number, chrysalis: boolean): number {
  const days = tl >= 12 ? 7 : tl >= 11 ? 42 : 90;
  return chrysalis ? Math.ceil(days / NANOSTASIS.chrysalisSpeed) : days;
}

export type Rejuvenation = "rejuvenated" | "confused" | "amnesia" | "disaster";

/** Rejuvenation's supervising Physician roll (p. 201). */
export function rejuvenationOutcome(outcome: Revival): Rejuvenation {
  return outcome === "criticalSuccess" ? "rejuvenated" : outcome === "success" ? "confused" : outcome === "failure" ? "amnesia" : "disaster";
}

/**
 * Reviving the dead in a chrysalis machine (p. 202): Physician at -2 an hour
 * dead, if the body isn't past -10xHT. Success restores the patient; failure by
 * 1-2 with partial amnesia; by 3 or more a body with no mind.
 */
export function chrysalisRevivalPenalty(hoursDead: number): number {
  const penalty = 2 * Math.max(0, Math.floor(hoursDead));
  return penalty ? -penalty : 0;
}
export function chrysalisRevival(success: boolean, margin: number): "restored" | "amnesia" | "mindless" {
  if (success) return "restored";
  return margin <= 2 ? "amnesia" : "mindless";
}

/**
 * The regeneration ray at high power (p. 202): success heals everything; failure
 * is 3d toxic and no more treatment for 1d weeks; a critical failure seems to
 * work, but a side effect shows 1d weeks later.
 */
export function regenerationRayOutcome(outcome: Revival): "healed" | "toxic" | "sideEffect" {
  if (outcome === "criticalFailure") return "sideEffect";
  return outcome === "failure" ? "toxic" : "healed";
}
export const REGENERATION_RAY = Object.freeze({ failureDamage: "3d", physicianBonus: 6, pocketBonus: 2 });

/** Drug delivery: double for an aerosol or contact agent, ten times for an aerosol contact agent (p. 204). */
export const DRUG_FORMS = Object.freeze({ pill: 1, injection: 1, aerosol: 2, contact: 2, aerosolContact: 10 });
export type DrugForm = keyof typeof DRUG_FORMS;

export const DRUGS = ["analgine", "antirad", "hyperstim", "morphazine", "soothe", "crediline", "ascepaline", "purge", "memoryBeta", "tailoredImmune", "programmableImmune", "quickheal", "criticalRepair", "respirocytes", "torpine", "fastRegeneration", "aegis"] as const;
export type Drug = (typeof DRUGS)[number];

export function drugByName(name: string): Drug | null {
  const text = String(name ?? "").trim().toLowerCase();
  const table: Record<string, Drug> = {
    analgine: "analgine", antirad: "antirad", hyperstim: "hyperstim", morphazine: "morphazine", soothe: "soothe", crediline: "crediline",
    ascepaline: "ascepaline", purge: "purge", "memory-beta": "memoryBeta", "tailored immune machines": "tailoredImmune",
    "programmable immune machines": "programmableImmune", quickheal: "quickheal", "critical repair nano": "criticalRepair",
    respirocytes: "respirocytes", torpine: "torpine", "fast regeneration nano": "fastRegeneration", "aegis nanobots": "aegis",
  };
  return table[text] ?? null;
}

/** The drugs a HT roll resists, as the system's dose machinery takes them (p. 205). */
export const RESISTED_DRUGS = Object.freeze({
  morphazine: { resistanceModifier: -3, delivery: ["digestive", "followUp"] as const },
  soothe: { resistanceModifier: -3, delivery: ["digestive"] as const },
  crediline: { resistanceModifier: -3, delivery: ["followUp"] as const },
});
export type ResistedDrug = keyof typeof RESISTED_DRUGS;

/** What a failed roll against a resisted drug does, for minutes (p. 205). */
export function resistedDrugEffect(drug: ResistedDrug, margin: number, ht: number): { condition: string | null; minutes: number } {
  const m = Math.max(1, marginOfFailure(margin));
  if (drug === "morphazine") return { condition: "unconscious", minutes: 8 * 60 * m };
  if (drug === "soothe") return { condition: "euphoria", minutes: 5 * m };
  return { condition: null, minutes: Math.max(1, 25 - Math.floor(ht)) };
}

/** Analgine masks pain, and numbs, for half the user's HT in hours (p. 205). */
export function analgineHours(ht: number): number {
  return Math.max(0, Math.floor(ht) / 2);
}

/** Ascepaline more than once a week: HT+2 for the second dose, +1 the third, and so on (p. 205). */
export function ascepalineRoll(dosesThisWeek: number): number | null {
  if (dosesThisWeek <= 1) return null;
  return 4 - Math.floor(dosesThisWeek);
}

/** Tailored immune machines cure in 3d hours at TL10, 1d at TL11+ (p. 205). */
export function immuneCureDice(tl: number): number {
  return tl >= 11 ? 1 : 3;
}

/** Programming immune machines: -2 for a rare disease, -4 for an unknown one (p. 205). */
export function programmingPenalty(disease: "known" | "rare" | "unknown"): number {
  return disease === "unknown" ? -4 : disease === "rare" ? -2 : 0;
}

/** Aegis nano: +8 to resist unknown nano that allows a HT roll; skill 15 against known nano, 12 unknown (p. 206). */
export const AEGIS = Object.freeze({ resist: 8, knownSkill: 15, unknownSkill: 12 });

/** Torpine: 24 hours unconscious, then healed and at 1 FP (p. 206). */
export const TORPINE = Object.freeze({ hours: 24, fp: 1 });

/** Quickheal restores 1d an hour after First Aid, no more than a dose an hour (p. 206). */
export const QUICKHEAL = Object.freeze({ dice: 1, hours: 1 });

/** Respirocytes: +2 FP and Doesn't Breathe (Oxygen Storage x25) (p. 206). */
export const RESPIROCYTES = Object.freeze({ fp: 2 });

/** Fast regeneration nano: Regeneration (Fast) for an hour, at 1 FP for each HP regenerated (p. 206). */
export const FAST_REGENERATION = Object.freeze({ level: 3, hours: 1, fpPerHp: 1 });

/** What healing costs a patient on fast regeneration nano: the FP after `gained` HP come back, never below 0 (p. 206). */
export function fastRegenerationFp(fp: number, gained: number): number {
  return Math.max(0, Math.floor(Number(fp) || 0) - FAST_REGENERATION.fpPerHp * Math.max(0, Math.floor(Number(gained) || 0)));
}

/** Analgine masks pain like High Pain Threshold: no shock, +3 to knockdown (p. 205; Characters p. 59). */
export const ANALGINE_EFFECTS = Object.freeze({ noShock: true, knockdown: 3 });

/** Antirad: the next exposure's rads halved (p. 205). */
export function antiradDose(rads: number): number {
  return Math.max(0, rads) / 2;
}

/** Under trauma maintenance a mortal wound is checked once a day (p. 197). */
export const LIFE_SUPPORT_CHECK_MINUTES = 1440;
