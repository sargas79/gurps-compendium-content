/**
 * Electric fences, electric locks, screening and alarms from the supplement
 * Electricity and Electronics (HT:EE pp. 42-44), part of High-Tech (decision
 * E1 in #471): the figures, as pure functions and tables. They extend
 * High-Tech's own locks, traps and barriers (pp. 202-205) and its security
 * systems (pp. 205-207), whose figures are in `../security/rules.ts` and
 * `../surveillance/rules.ts`.
 *
 * The supplement's records (#480) are matched by name: the printed name, a
 * variant's in brackets ("Magnetic Lock (Micro)", "Keycard Reader (RFID)",
 * "Biometric Identification (Fingerprints)"), a unit after it ("Low-Voltage
 * Fence (per mile)"). Where the supplement's record is High-Tech's (E2 in
 * #471, `overlap-ee.txt`), High-Tech's record stands for it: the signature,
 * voiceprint and retinal systems are its Signature Pad, Voiceprint Analyzer
 * and Retinal Scanner, the security metal detector its handheld one, the
 * infrared motion detector and proximity sensor its IR Motion Detector and
 * Proximity Detector.
 */

import type { LockRecord } from "../security/rules.js";
import type { Screener } from "../surveillance/rules.js";

export const SECURITY = "Electronics Operation (Security)";
export const SECURITY_REPAIR = "Electronics Repair (Security)";
export const ELECTRICIAN = "Electrician";

const nameKey = (name: unknown) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// ── electric fences (HT:EE pp. 42, 44) ──

/**
 * A low-voltage fence (HT:EE p. 42): nonlethal electrical damage (p. 9)
 * resisted each second by an unmodified HT roll, with Moderate Pain
 * (Campaigns p. 428) while touching it; the stun lasts while the contact
 * does, and the rolls to recover, one a second, start once it is broken.
 */
export const LOW_VOLTAGE = Object.freeze({ modifier: 0, pain: "moderatePain" as const });

/**
 * A stun-lethal (high-voltage) fence (HT:EE p. 42): the low-voltage effects
 * at a first touch, then high voltage at a second -- 3d burning a second as
 * lethal electrical damage (p. 9).
 */
export const STUN_LETHAL = Object.freeze({ formula: "3d" });

/**
 * A lethal current that does more than 1 point of injury keeps the victim
 * from letting go of the source (HT:EE p. 9).
 */
export const HELD_INJURY = 1;
export const holdsOn = (injury: number): boolean => Math.max(0, Number(injury) || 0) > HELD_INJURY;

/** The seconds of contact the current runs before the GM's cut-off, at most. */
export const MAX_CONTACT_SECONDS = 60;

/**
 * Which touch of a stun-lethal fence this is: the first gets the low-voltage
 * effects and arms it, any later one the high voltage (HT:EE p. 42).
 */
export type FenceTouch = "first" | "second";
export const fenceStage = (fence: FenceKind, touch: FenceTouch): "low" | "high" => (fence === "stunLethal" && touch === "second" ? "high" : "low");

/**
 * A security fence carries a current that sets off an alarm at a touch: $100
 * more on a fence, free on a stun-lethal one (HT:EE p. 44).
 */
export const SECURITY_FENCE_COST = 100;

/** The fences the switch knows: the supplement's two, and High-Tech's cattle and lethal fences (p. 204), which take the alarm too. */
export type FenceKind = "lowVoltage" | "stunLethal" | "cattle" | "lethal";
const FENCES: ReadonlyArray<[RegExp, FenceKind]> = [
  [/^low-voltage (electric )?fence\b/i, "lowVoltage"],
  [/^(high-voltage|stun-lethal) (electric )?fence\b/i, "stunLethal"],
  [/^cattle fence\b/i, "cattle"],
  [/^lethal fence\b/i, "lethal"],
];
export const fenceOf = (name: unknown): FenceKind | null => FENCES.find(([pattern]) => pattern.test(String(name ?? "").trim()))?.[1] ?? null;

/** The security fence's alarm costs $100 on a fence, nothing on a stun-lethal one, which has it already (HT:EE p. 44). */
export const securityFenceCost = (fence: FenceKind): number => (fence === "stunLethal" ? 0 : SECURITY_FENCE_COST);

/** Whether a fence sets off an alarm when touched: a stun-lethal one always does, another where it's a security fence (HT:EE p. 44). */
export const fenceAlarms = (fence: FenceKind, alarmed: boolean): boolean => fence === "stunLethal" || alarmed;

// ── electric locks (HT:EE p. 42) ──

/** The supplement's lock records, with the switch that runs each. */
export interface SupplementLock extends LockRecord {
  rule: "electricLocks" | "alarmSystems";
}

/**
 * A magnetic lock's holding force as an effective ST, figured as for
 * electromagnets (HT:EE pp. 22-23, 42), by size.
 */
export const MAGNETIC_LOCKS: Readonly<Record<string, { st: number; force: number }>> = Object.freeze({
  micro: { st: 12, force: 275 },
  mini: { st: 18, force: 650 },
  midi: { st: 20, force: 800 },
  standard: { st: 24, force: 1200 },
  shear: { st: 32, force: 2000 },
});
export type MagneticSize = keyof typeof MAGNETIC_LOCKS;

/** A magnetic lock's size from its record's name, or null where it isn't one; a plain "Magnetic Lock" is the standard size. */
export function magneticSize(name: unknown): MagneticSize | null {
  const key = nameKey(name);
  const sizes = Object.keys(MAGNETIC_LOCKS).join("|");
  const match = new RegExp(`^(?:(${sizes}) magnetic lock|magnetic lock(?:\\s*[,(:-]\\s*(${sizes})\\)?)?)$`).exec(key);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "standard") as MagneticSize;
}

/**
 * A key switch is bypassed with Electronics Repair (Security) or Mechanic for
 * the vehicle it starts, or picked with a standard Lockpicking roll (HT:EE
 * p. 42).
 */
export const KEY_SWITCH_SKILLS = [SECURITY_REPAIR, "Mechanic", "Lockpicking"] as const;

/**
 * The digital stethoscope (HT:EE pp. 14, 42): +1 to crack a safe, +3 to
 * defeat a security device where hearing its mechanism helps, +1 to
 * Explosives (EOD) to find or defuse a mechanical bomb, and it cancels -1 of
 * the penalty for noise in each.
 */
export const DIGITAL_STETHOSCOPE = Object.freeze({ safe: 1, hearing: 3, eod: 1, noise: 1 });
export const isDigitalStethoscope = (name: unknown): boolean => nameKey(name) === "digital stethoscope";

// ── screening (HT:EE p. 43) ──

/** The keycard technologies (HT:EE p. 43). An RFID reader costs twice as much, which its record's price already says. */
export const KEYCARD_TECHNOLOGIES = ["optical barcode", "magnetic stripe", "holepunched", "rfid", "smart card"] as const;
export type KeycardTechnology = (typeof KEYCARD_TECHNOLOGIES)[number];

/** A keycard reader's technology from its record's name, "" for a plain reader, or null where it isn't one. */
export function keycardOf(name: unknown): KeycardTechnology | "" | null {
  const key = nameKey(name).replace(/hole-punched/, "holepunched");
  const techs = KEYCARD_TECHNOLOGIES.join("|");
  const match = new RegExp(`^(?:key ?card reader(?:\\s*[,(:-]\\s*(${techs})\\)?)?|(${techs}) key ?card reader|(${techs}) key ?card)$`).exec(key);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? "") as KeycardTechnology | "";
}

/** A reader that keeps a record of the cards scanned costs twice as much (HT:EE p. 43). */
export const KEYCARD_LOG_COST = 2;

/** The biometric kinds (HT:EE p. 43). */
export const BIOMETRICS = ["signature", "voiceprint", "hand geometry", "fingerprints", "retinal patterns", "facial recognition"] as const;
export type Biometric = (typeof BIOMETRICS)[number];

/** High-Tech's identity verifiers that stand for the supplement's biometric systems (p. 205; HT:EE p. 43). */
const HIGH_TECH_BIOMETRICS: Readonly<Record<string, Biometric>> = Object.freeze({
  "signature pad": "signature",
  "voiceprint analyzer": "voiceprint",
  "retinal scanner": "retinal patterns",
  "fingerprint scanner": "fingerprints",
});
/** Whether a biometric record is High-Tech's own, whose bypass is High-Tech's rule. */
export const isHighTechBiometric = (name: unknown): boolean => nameKey(name) in HIGH_TECH_BIOMETRICS;

/** A biometric verifier's kind from its record's name, or null where it isn't one. */
export function biometricOf(name: unknown): Biometric | null {
  const own = HIGH_TECH_BIOMETRICS[nameKey(name)];
  if (own) return own;
  const key = nameKey(name).replace(/\bfingerprint\b/, "fingerprints").replace(/\bretinal pattern\b/, "retinal patterns");
  const kinds = BIOMETRICS.join("|");
  const match = new RegExp(`^(?:biometric (?:identification|scanner|verifier)\\s*[,(:-]\\s*(${kinds})\\)?|(${kinds}))$`).exec(key);
  return (match?.[1] ?? match?.[2] ?? null) as Biometric | null;
}

/**
 * A biometric system is bypassed by opening its case and altering its
 * circuits, with Electronics Repair (Security) at +5 for a basic system, no
 * modifier for a good one (x5 cost) and -5 for a fine one (x20) (HT:EE
 * p. 43): High-Tech's identity-verifier grades (p. 205), rolled with repair
 * rather than operation. An intruder with Electronics Operation (Security)
 * fools a signature pad with Forgery at -3.
 */
export const SIGNATURE_FORGERY = -3;

/** A portable biometric unit on rechargeable batteries, recharged daily: $5 and 0.2 lb. more (HT:EE p. 43). */
export const PORTABLE_BIOMETRIC = Object.freeze({ cost: 5, weight: 0.2 });

/** The supplement's lock and screening records, as High-Tech's lock rules read them. */
export function supplementLock(name: unknown): SupplementLock | null {
  const key = nameKey(name);
  if (/^key switch$/.test(key)) return { kind: "lock", rule: "electricLocks" };
  if (/^(electric deadbolt|keypad combination lock|smart lock)$/.test(key)) return { kind: "electronic", rule: "electricLocks" };
  if (magneticSize(key)) return { kind: "electronic", rule: "electricLocks" };
  if (keycardOf(key) !== null) return { kind: "electronic", rule: "alarmSystems" };
  const biometric = isHighTechBiometric(key) ? null : biometricOf(key);
  if (biometric) return { kind: "verifier", rule: "alarmSystems", skill: SECURITY_REPAIR, ...(biometric === "signature" ? { forgery: SIGNATURE_FORGERY } : {}) };
  return null;
}

// ── screening devices (HT:EE p. 43) ──

/**
 * The supplement's security metal detector is High-Tech's handheld one, and
 * its portable X-ray machine High-Tech's own (E2), which High-Tech's
 * screening already runs. A general-purpose metal detector works as the
 * handheld one in improvised use (+1 to Explosives (EOD), Search or Traps; +2
 * to Search with a one-minute pat-down), with an Electronics Operation
 * (Security) roll -- the operator's roll High-Tech's screening already makes
 * (p. 206).
 */
export const SUPPLEMENT_SCREENERS: Readonly<Record<string, Screener>> = Object.freeze({
  "metal detector": { kind: "handheldMetal", operatorRoll: true },
});
/** A detector's name without the TL its record is named with ("Metal Detector (TL6)"). */
const detectorKey = (name: unknown) => nameKey(name).replace(/\s*\(tl\d+\)$/, "");
export const supplementScreener = (name: unknown): Screener | null => SUPPLEMENT_SCREENERS[detectorKey(name)] ?? null;
export const isImprovisedDetector = (name: unknown): boolean => detectorKey(name) === "metal detector";

// ── alarms (HT:EE pp. 43-44) ──

/** What an alarm is to the rules: how it's disabled, and what it senses. */
export interface Alarm {
  key: string;
  /** Simple enough to disable with Traps (the electric alarm). */
  simple?: boolean;
  /** How far it senses, in yards, where printed. */
  yards?: number;
}

const ALARMS: ReadonlyArray<[RegExp, Alarm]> = [
  [/^electric alarm\b/i, { key: "electric", simple: true }],
  [/^pressure mat\b/i, { key: "pressureMat" }],
  [/^ultrasonic alarm\b/i, { key: "ultrasonic" }],
  // The supplement's proximity sensor is High-Tech's Proximity Detector (E2).
  [/^proximity (sensor|detector)\b/i, { key: "proximity", yards: 1 }],
  [/^car alarm\b/i, { key: "car" }],
  [/^photoelectric beam\b/i, { key: "photoelectric", yards: 3 }],
  [/^(infrared|ir) motion detector\b/i, { key: "infrared", yards: 25 }],
  [/^infrasonic alarm\b/i, { key: "infrasonic" }],
];
export const alarmOf = (name: unknown): Alarm | null => ALARMS.find(([pattern]) => pattern.test(String(name ?? "").trim()))?.[1] ?? null;

/**
 * Spotting an alarm is Vision-5, Observation or a Per-based Traps roll, a
 * Quick Contest against Camouflage where it's hidden (HT:EE p. 43): High-Tech's
 * spotting roll (p. 205), which this rule reuses. Identifying the type is
 * Electronics Operation (Security); disabling it Electronics Repair
 * (Security), or Traps for an alarm as simple as the electric alarm; an
 * unsophisticated system without its own batteries is shut down by cutting
 * its power with an Electrician roll, which sets off a professional one.
 */
export const ALARM_TASKS = ["spot", "identify", "disable", "cutPower"] as const;
export type AlarmTask = (typeof ALARM_TASKS)[number];

export const alarmDisableSkill = (simple: boolean): string => (simple ? "Traps" : SECURITY_REPAIR);

/** What cutting an alarm's power does: nothing with its own batteries, the alarm for a professional system, else the roll (HT:EE p. 43). */
export function cutPowerOutcome(options: { ownBatteries: boolean; professional: boolean }): "noEffect" | "alarm" | "roll" {
  if (options.ownBatteries) return "noEffect";
  return options.professional ? "alarm" : "roll";
}

/** The jobs the electric locks and screening rules add to the GM's security tool. */
export const LOCK_TASKS = ["keySwitch", "magneticPower", "magneticForce", "biometric", "signature"] as const;
export type LockTask = (typeof LOCK_TASKS)[number];
/** Which switch runs each job. */
export const TASK_RULE: Readonly<Record<AlarmTask | LockTask, "electricLocks" | "alarmSystems">> = Object.freeze({
  spot: "alarmSystems",
  identify: "alarmSystems",
  disable: "alarmSystems",
  cutPower: "alarmSystems",
  keySwitch: "electricLocks",
  magneticPower: "electricLocks",
  magneticForce: "electricLocks",
  biometric: "alarmSystems",
  signature: "alarmSystems",
});
