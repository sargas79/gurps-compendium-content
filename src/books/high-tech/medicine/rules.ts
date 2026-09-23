/**
 * High-Tech's emergency medicine and medical facilities (pp. 219-225), as
 * pure rules: defibrillators and the AED, CPR's fatigue, what first aid gear
 * is worth without IV fluids or once depleted, hemostatic bandages, the
 * surgical kits' own TL modifiers, anaesthesia and antiseptic.
 */

import type { Device } from "../../../shared/medical/rules.js";

/** What a record is to these rules, as its `medical` data says. */
export const MEDICAL_KINDS = [
  "",
  "airway",
  "defibrillator",
  "aed",
  "ivKit",
  "ivFluid",
  "firstAidKit",
  "hemostatic",
  "imaging",
  "portableSurgery",
  "surgicalKit",
  "suturingKit",
  "anesthesia",
  "antiseptic",
] as const;
export type MedicalKind = (typeof MEDICAL_KINDS)[number];

/**
 * High-Tech's table for the shared device engine: the AED, which once hooked
 * up "performs resuscitation with an effective skill of 12" (p. 220).
 */
export const HT_DEVICES: ReadonlyArray<readonly [RegExp, Device]> = [
  [/^automatic external defibrillator\b/i, { tl: 8, skills: { resuscitation: 12 }, perTl: 0 }],
];

/** Hooking an AED up is an IQ+4 roll, following its spoken instructions (p. 220). */
export const AED_HOOKUP = 4;

/** Electronics Operation (Medical) works a manual defibrillator (p. 220) or an imaging instrument (p. 222). */
export const MEDICAL_ELECTRONICS = "Electronics Operation (Medical)";

/** Electronics Operation is IQ/Average: IQ-5 unlearned (Characters p. 189). */
export const ELECTRONICS_DEFAULT = -5;

/** Physician is IQ/Hard: IQ-7 unlearned (Characters p. 213). */
export const PHYSICIAN_DEFAULT = -7;

/** Diagnosis is IQ/Hard: IQ-6 unlearned (Characters p. 187). */
export const DIAGNOSIS_DEFAULT = -6;

/** A manual defibrillator's bonus to resuscitation: +2 at TL7, +3 at TL8 (p. 220), unless the record says. */
export function defibrillatorBonus(value: number, tl: number): number {
  if (value > 0) return Math.trunc(value);
  return tl >= 8 ? 3 : 2;
}

/** Manual CPR costs whoever gives it 1 FP per five minutes (p. 220); each resuscitation attempt is a minute (Campaigns p. 425). */
export const CPR_MINUTES_PER_FP = 5;

/** The FP a stretch of CPR on one patient comes due for, the minutes already given counted. */
export function cprFatigue(minutesBefore: number, minutesAdded: number): number {
  const before = Math.max(0, Math.floor(Number(minutesBefore) || 0));
  const after = before + Math.max(0, Math.floor(Number(minutesAdded) || 0));
  return Math.floor(after / CPR_MINUTES_PER_FP) - Math.floor(before / CPR_MINUTES_PER_FP);
}

/**
 * First aid gear claims its +2 for fine quality only with blood or IV fluids
 * to hand; otherwise +1 is the best it gives (p. 220). A lower figure stands.
 */
export const WITHOUT_FLUIDS_BEST = 1;
export function firstAidGearWithoutFluids(value: number): number {
  return Math.min(value, WITHOUT_FLUIDS_BEST);
}

/** Starting an IV takes a minute; most solutions run 4-6 hours (p. 220). */
export const IV = Object.freeze({ startMinutes: 1, hoursLeast: 4, hoursMost: 6 });

/**
 * The equipment grades, worst to best, as a depleted kit steps down them:
 * "fine (+2), good (+1), basic (0), and improvised (-5)" (p. 221).
 */
const GRADES = ["none", "improvised", "basic", "good", "fine", "best"] as const;
export type Grade = (typeof GRADES)[number];

/** The grade a depleted kit works at: the next one down (p. 221). */
export function depletedGrade(grade: string): Grade {
  const at = GRADES.indexOf(grade as Grade);
  if (at < 0) return "improvised";
  return GRADES[Math.max(1, at - 1)]!;
}

/** Hemostatic bandages: +1 (quality) to First Aid on a bleeding wound, in 30 seconds (p. 221). */
export const HEMOSTATIC = Object.freeze({ bonus: 1, seconds: 30 });

/**
 * What hemostatic bandages add to First Aid on a bleeding wound over the
 * healer's other gear: quality bonuses don't add up, so only the amount by
 * which +1 beats what they already have.
 */
export function hemostaticLine(toolValue: number): number {
  return Math.max(0, HEMOSTATIC.bonus - Math.trunc(Number(toolValue) || 0));
}

/** Portable surgery gives +2 (quality) to First Aid as well as its +1 to Surgery (p. 224). */
export const PORTABLE_SURGERY_FIRST_AID = 2;

/**
 * A surgical kit's own TL modifier (-2 at TL5, 0 at TL6, +1 at TL7, +2 at
 * TL8, pp. 223-224) is the kit's quality line on Surgery; the Basic Set's
 * table (Campaigns p. 424) gives the same figures by the TL of the operation,
 * assuming basic tools of that TL. With the kit in hand the kit's figure
 * stands in for the table's, so the table's comes back off: the line that
 * cancels it.
 */
export function surgicalKitLine(tableModifier: number): number {
  const table = Math.trunc(Number(tableModifier) || 0);
  return table ? -table : 0;
}

/** A suturing kit is improvised equipment, -5, for anything but simple stitching (p. 224). */
export const SUTURING_IMPROVISED = -5;

/**
 * A failed roll to put the patient under leaves Surgery at -2, as for no
 * anaesthetic (p. 224). A portable anaesthesia machine's tank lasts four
 * hours (p. 225), which is how long a patient put under stays so here.
 */
export const ANESTHESIA = Object.freeze({ failed: -2, hours: 4, cooperativeMinutes: 1, uncooperativeLeast: 3, uncooperativeMost: 5 });

/**
 * Cleaning a wound with antiseptic removes -2 from the HT roll against
 * infection, with no skill roll (p. 225). The cleaning counts for the wound's
 * next infection roll, if it comes within a day.
 */
export const ANTISEPTIC = Object.freeze({ bonus: 2, hours: 24 });

/** An early X-ray machine gives patient and operator 1d rads a photograph (p. 223). */
export const XRAY_RADS_DICE = 1;
