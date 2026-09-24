/**
 * The Electricity and Electronics supplement's electromedicine (HT:EE pp.
 * 13-14, 21), as pure rules. What the system meets them through is in
 * `index.ts`. The defibrillator's revival roll is High-Tech's emergency
 * medicine, revised (`../medicine/rules.ts`).
 *
 *   - **Diathermy (HT:EE p. 13):** half an hour of shortwave diathermy and a
 *     Physician roll ease deep pain one step (Campaigns p. 428); an early
 *     machine, on a Tesla coil, is -2 to skill and burns the patient for 1d-3
 *     on a critical failure.
 *   - **The heating pad (HT:EE p. 21):** half an hour on it and an HT roll
 *     ease lasting pain one step.
 *   - **Electroconvulsive therapy (HT:EE p. 14):** the patient suffers a
 *     Seizure (Campaigns p. 429); a course of treatment is a Physician roll,
 *     and success mitigates Chronic Depression or Manic-Depressive for a year
 *     (Characters p. 112); the patient rolls HT-2 or forgets the 1d days
 *     before it, a quirk's worth of Amnesia.
 *   - **The laser scalpel (HT:EE p. 14):** +2 to the Surgery rolls that High
 *     Manual Dexterity helps.
 */

/** What a record is to these rules, by its name. */
export type Electromedicine = "diathermy" | "heatingPad" | "ect" | "laserScalpel";

const KINDS: ReadonlyArray<readonly [RegExp, Electromedicine]> = [
  [/^portable diathermy apparatus$|^diathermy\b/i, "diathermy"],
  [/^heating pad$/i, "heatingPad"],
  [/^electroconvulsive therapy device$/i, "ect"],
  [/^laser scalpel$/i, "laserScalpel"],
];

export function electromedicineOf(name: unknown): Electromedicine | null {
  const text = String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
  return KINDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** Each treatment for pain takes half an hour (HT:EE pp. 13, 21). */
export const PAIN_TREATMENT_MINUTES = 30;

/** An early diathermy machine: -2 to skill, 1d-3 burns on a critical failure (HT:EE p. 13). */
export const EARLY_DIATHERMY = Object.freeze({ penalty: -2, burn: "1d-3" });

/** Physician is IQ/Hard: IQ-7 unlearned (Characters p. 213). */
export const PHYSICIAN_DEFAULT = -7;

/** The steps of pain, worst first (Campaigns p. 428), as the system's conditions name them. */
export const PAIN_STEPS = ["agony", "terriblePain", "severePain", "moderatePain"] as const;
export type PainStep = (typeof PAIN_STEPS)[number];

/** The worst pain among a character's conditions, or null. */
export function worstPain(statuses: { has(key: string): boolean } | null | undefined): PainStep | null {
  if (!statuses?.has) return null;
  return PAIN_STEPS.find((step) => statuses.has(step)) ?? null;
}

/** Pain one step less intense: the next grade down, or none after Moderate Pain. */
export function easedPain(step: PainStep): PainStep | null {
  return PAIN_STEPS[PAIN_STEPS.indexOf(step) + 1] ?? null;
}

/** Electroconvulsive therapy (HT:EE p. 14). */
export const ECT = Object.freeze({
  /** The patient's roll against the memory loss. */
  htModifier: -2,
  /** How long a successful course mitigates the disorder: a year, in seconds. */
  mitigatesSeconds: 365 * 24 * 3600,
});

/** The disorders a successful course mitigates. */
export const ECT_MITIGATES = /^(chronic depression|manic-depressive)\b/i;

/** Whether a mitigation given at some time still holds at another. */
export function stillMitigated(until: unknown, now: number): boolean {
  return typeof until === "number" && Number.isFinite(until) && now < until;
}

/** The laser scalpel's bonus to Surgery (HT:EE p. 14). */
export const LASER_SCALPEL = 2;
