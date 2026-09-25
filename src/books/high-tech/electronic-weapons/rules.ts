/**
 * Electronic weapons and non-nuclear EMP from the supplement Electricity and
 * Electronics (HT:EE pp. 49-51), part of High-Tech (decision E1 in #471): the
 * figures, as pure functions and tables.
 *
 * The weapons' statistics are their records' (#480, the Weapons Tables of
 * HT:EE pp. 50-51); what the tables' notes say a failed roll leaves is here.
 * The records are matched by name, as printed: the supplement's Cattle Prod,
 * Air Taser Model 34000, Dazzler, Active Denial System and NNEMP, p. 21's
 * Laser Pointer and p. 32's Acoustic Hailing Device, and High-Tech's own
 * Stun Gun, Stun Baton, Cattle Prod, Tasertron TE-76 and TASER M26, which the
 * supplement's tables list too (E2 in #471).
 */

const nameOf = (name: unknown) => String(name ?? "").trim();

/** The supplement's page label in citations and on records. */
export const SUPPLEMENT = /Electricity and Electronics/i;

/** Whether a record is the supplement's own, by the page it cites. */
export const fromSupplement = (reference: unknown): boolean => SUPPLEMENT.test(String(reference ?? ""));

// ── electric stunners (HT:EE p. 49) ──

/** An electric stunner, contact or ranged: every one the supplement's tables list (HT:EE pp. 49, 51). */
export function isElectricStunner(name: unknown): boolean {
  return /^(stun gun|stun baton|cattle prod|tasertron\b|taser\b|air taser\b)/i.test(nameOf(name));
}

/** A cattle prod, High-Tech's or the supplement's. */
export const isCattleProd = (name: unknown): boolean => /^cattle prod\b/i.test(nameOf(name));

/**
 * What an electric stunner in hand gives (HT:EE p. 49): its pain helps
 * Interrogation as torture does, +6; Intimidation +2 where the subject knows
 * what the device is; a cattle prod +2 to Animal Handling.
 */
export const STUNNER_SKILLS = Object.freeze({ interrogation: 6, intimidation: 2, animalHandling: 2 });

/** The skill bonus a stunner in hand gives to a roll of `skill`, or null for a skill it doesn't help. */
export function stunnerSkillBonus(skill: unknown, prod: boolean): { kind: "interrogation" | "intimidation" | "animalHandling"; value: number } | null {
  const name = nameOf(skill);
  if (/^interrogation\b/i.test(name)) return { kind: "interrogation", value: STUNNER_SKILLS.interrogation };
  if (/^intimidation\b/i.test(name)) return { kind: "intimidation", value: STUNNER_SKILLS.intimidation };
  if (prod && /^animal handling\b/i.test(name)) return { kind: "animalHandling", value: STUNNER_SKILLS.animalHandling };
  return null;
}

/**
 * The supplement's cattle prod pains rather than stuns (HT:EE p. 51, note
 * [4]): Moderate Pain, or Severe Pain applied to the face or groin, for a
 * minute a point the roll failed by (at least one).
 */
export function prodPain(margin: number, faceOrGroin: boolean): { key: "moderatePain" | "severePain"; minutes: number } {
  return { key: faceOrGroin ? "severePain" : "moderatePain", minutes: Math.max(1, Math.floor(Math.abs(Number(margin) || 0))) };
}

// ── directed-energy weapons (HT:EE pp. 50-51) ──

/** The supplement's lasers at the eyes: the dazzler and p. 21's laser pointer, red or green (HT:EE p. 51, notes [1]-[3]). */
export const isEyeLaser = (name: unknown): boolean => /^(dazzler|(green )?laser pointer)\b/i.test(nameOf(name));

/** A laser pointer, red or green (HT:EE p. 21). */
export const isLaserPointer = (name: unknown): boolean => /^(green )?laser pointer\b/i.test(nameOf(name));

/**
 * A laser pointer is used at -1 to Beam Weapons (Pistol) (HT:EE p. 51): the
 * Ranged Weapons Table's skill penalty, which a ranged mode has no field for.
 */
export const LASER_POINTER_SKILL = -1;
export const isHailingDevice = (name: unknown): boolean => /^acoustic hailing device\b/i.test(nameOf(name));
export const isActiveDenial = (name: unknown): boolean => /^active denial system\b/i.test(nameOf(name));

/**
 * A dazzle blinds only eyes adapted to twilight or darker: darkness that
 * costs -2 or worse (HT:EE p. 51, note [1]). `darkness` is the level where
 * the victim stands, 0 (none) to 10.
 */
export const DARK_ADAPTED = 2;
export const darkAdapted = (darkness: number): boolean => (Number(darkness) || 0) >= DARK_ADAPTED;

/** Obscuring conditions (fog, smoke) give +1 to resist a dazzle per -1 they put on Vision (HT:EE p. 51, note [2]). */
export const obscurementBonus = (visionPenalty: number): number => Math.max(0, Math.floor(Math.abs(Math.min(0, Number(visionPenalty) || 0))));

/**
 * The hailing device (HT:EE p. 51, note [4]): Moderate Pain while the sound
 * lasts; after a minute of it, tinnitus (Hard of Hearing) for a minute a
 * point the roll failed by, and then an HT roll -- a failure keeps it for 1d
 * months, a critical failure for good. Protected Hearing gives +5 to resist
 * all of it and keeps the loss from being permanent; Deafness is immune.
 */
export const HAILING = Object.freeze({ protectedHearing: 5, exposureSeconds: 60 });

export const tinnitusMinutes = (margin: number): number => Math.max(1, Math.floor(Math.abs(Number(margin) || 0)));

/** What the HT roll after tinnitus leaves: it passes, lasts 1d months, or is for good. */
export function hearingLoss(outcome: { success: boolean; criticalFailure?: boolean }, protectedHearing: boolean): "passes" | "months" | "permanent" {
  if (outcome.success) return "passes";
  return outcome.criticalFailure && !protectedHearing ? "permanent" : "months";
}

/** Days in a month, for a condition's duration. */
export const DAYS_PER_MONTH = 30;

/**
 * The Active Denial System (HT:EE p. 51, note [5]): Agony while the victim
 * stays in the beam's area and for a second after, though he can still flee.
 */
export const ACTIVE_DENIAL = Object.freeze({ afterSeconds: 1 });

// ── non-nuclear EMP (HT:EE p. 50) ──

/**
 * An NNEMP disables electronics within 220 yards, and is destroyed by going
 * off. Each device rolls HT, +3 if Hardened or purely electrical (nothing
 * electronic in it); a failure shuts it down until repaired, and repairing a
 * non-Hardened electronic device is at -6.
 */
export const NNEMP = Object.freeze({ radiusYards: 220, resistant: 3, repair: -6 });

export const isNnemp = (name: unknown): boolean => /^nnemp\b/i.test(nameOf(name));

/** What a device is to the pulse: plain electronics, Hardened, or purely electrical. */
export type PulseKind = "electronic" | "hardened" | "electrical";
export const PULSE_KINDS: readonly PulseKind[] = ["electronic", "hardened", "electrical"];

/** The modifier on a device's HT roll against the pulse. */
export const nnempModifier = (kind: PulseKind): number => (kind === "electronic" ? 0 : NNEMP.resistant);

/** The penalty to repair a device the pulse shut down. */
export const nnempRepairPenalty = (kind: PulseKind): number => (kind === "electronic" ? NNEMP.repair : 0);

/** Whether a device stands close enough to the burst: within 220 yards, or wherever the distance can't be read. */
export const withinPulse = (yards: number | null): boolean => yards === null || yards <= NNEMP.radiusYards;
