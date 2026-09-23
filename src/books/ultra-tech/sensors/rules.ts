/**
 * Ultra-Tech's communicators and sensors: communicator range by size and TL,
 * reaching a comm of another size and stretching range, receive- and
 * transmit-only comms; worn passive visual sensors as senses; the indirect
 * sensors' bonuses; active sensors' ranges, the penalty past them, targeting
 * locks and LPI; ESM; radscanners against power cells (pp. 42-46, 60-67).
 *
 * The rules High-Tech prints too -- the sizes' steps, stretching range,
 * slowed data, radio's cuts, the active sensors' range penalty and emissions,
 * magnification as Telescopic Vision -- are the shared engine's
 * (`src/shared/sensors/`); this is Ultra-Tech's gear and figures for it.
 */

import { COMM_SIZES, RECEIVER, TRANSMITTER, sizeStepFactor, telescopicLevels, type CommMode, type CommSize } from "../../../shared/sensors/rules.js";

export {
  COMM_SIZES,
  TARGETING_LOCK,
  activeRangePenalty,
  emissionDetectionRange,
  radioRangeFactor,
  rangeExtensionModifier,
  sizeStepFactor,
  slowedRangeFactor,
  telescopicLevels,
  type CommMode,
  type CommSize,
} from "../../../shared/sensors/rules.js";

export type CommFamily = "ir" | "laser" | "radio" | "sonar" | "gravityRipple" | "neutrino" | "ftl" | "neurocomm";

/** Each family's range in yards at its base TL, by size (pp. 43-46). Parsecs are kept in yards too. */
const MILE = 1760;
const PARSEC = 19.2e12 * MILE;
export const COMM_RANGES: Readonly<Record<CommFamily, Partial<Record<CommSize, number>>>> = Object.freeze({
  ir: { large: 25 * MILE, medium: 2.5 * MILE, small: 500, tiny: 50, micro: 5 },
  laser: { veryLarge: 50000 * MILE, large: 5000 * MILE, medium: 500 * MILE, small: 50 * MILE, tiny: 5 * MILE, micro: 1000 },
  radio: { veryLarge: 10000 * MILE, large: 1000 * MILE, medium: 100 * MILE, small: 10 * MILE, tiny: MILE, micro: 200 },
  sonar: { large: 300 * MILE, medium: 30 * MILE, small: 3 * MILE, tiny: 600, micro: 60 },
  gravityRipple: { veryLarge: 1_000_000 * MILE, large: 100000 * MILE, medium: 10000 * MILE, small: 1000 * MILE, tiny: 100 * MILE, micro: 10 * MILE },
  neutrino: { veryLarge: 1_000_000 * MILE, large: 100000 * MILE, medium: 10000 * MILE, small: 1000 * MILE, tiny: 100 * MILE },
  ftl: { veryLarge: 10 * PARSEC, large: PARSEC, medium: 0.1 * PARSEC, small: 0.01 * PARSEC, tiny: 0.001 * PARSEC },
  neurocomm: { large: 10 * MILE, medium: MILE, small: 200, tiny: 20 },
});

/** The factor on a comm's range for its TL (pp. 44-46). */
export function commTlFactor(family: CommFamily, tl: number, size: CommSize): number {
  switch (family) {
    case "ir":
    case "laser":
    case "radio":
      return tl >= 12 ? 10 : tl >= 11 ? 5 : tl >= 10 ? 2 : 1;
    case "sonar":
      return tl >= 12 ? 3 : tl >= 11 ? 2 : tl >= 10 ? 1.5 : 1;
    case "gravityRipple":
    case "neutrino":
      // The very large ones reach 100,000 miles at TL10 and 1,000,000 at TL11; everything doubles at TL12.
      if (size === "veryLarge" && tl <= 10) return 0.1;
      return tl >= 12 ? 2 : 1;
    case "ftl":
      // The very large FTL radio reaches 2 parsecs at TL11^ and 10 at TL12^.
      return size === "veryLarge" && tl <= 11 ? 0.2 : 1;
    default:
      return 1;
  }
}

/** A comm's range in yards at a TL. */
export function commRange(family: CommFamily, size: CommSize, tl: number): number | null {
  const base = COMM_RANGES[family][size];
  return base === undefined ? null : base * commTlFactor(family, tl, size);
}

/**
 * The range between two comms of different sizes (p. 43): the smaller one's
 * range, times 3, 10, 30, 100 ... for each size the larger is greater.
 */
export function mixedRange(family: CommFamily, a: CommSize, b: CommSize, tl: number): number | null {
  const small = COMM_SIZES.indexOf(a) <= COMM_SIZES.indexOf(b) ? a : b;
  const steps = Math.abs(COMM_SIZES.indexOf(a) - COMM_SIZES.indexOf(b));
  const range = commRange(family, small, tl);
  if (range === null) return null;
  return range * sizeStepFactor(steps);
}

/**
 * A receive-only or transmit-only comm's price and weight (p. 46): a receiver
 * is 10% the cost and 20% the weight, a transmitter 90% and 80%; for
 * gravity-ripple, neutrino and FTL comms each is half, with half the cells.
 */
export function commModeFactors(family: CommFamily | null, mode: CommMode): { cost: number; weight: number } {
  if (!mode) return { cost: 1, weight: 1 };
  if (family === "gravityRipple" || family === "neutrino" || family === "ftl") return { cost: 0.5, weight: 0.5 };
  return mode === "receiver" ? { ...RECEIVER } : { ...TRANSMITTER };
}

/** The comm a record's name is: "Radio Communicator (Large)". */
export function commByName(name: string): { family: CommFamily; size: CommSize } | null {
  const text = String(name ?? "");
  const size = /\((very large|large|medium|small|tiny|micro)\)\s*$/i.exec(text)?.[1]?.toLowerCase();
  if (!size) return null;
  const sizeKey = (size === "very large" ? "veryLarge" : size) as CommSize;
  const families: Array<[RegExp, CommFamily]> = [
    [/^IR Communicator/i, "ir"], [/^Laser Communicator/i, "laser"], [/^Radio Communicator/i, "radio"], [/^Sonar Communicator/i, "sonar"],
    [/^Gravity-Ripple Communicator/i, "gravityRipple"], [/^Neutrino Communicator/i, "neutrino"], [/^FTL Radio/i, "ftl"], [/^Neural Communicator/i, "neurocomm"],
  ];
  const family = families.find(([re]) => re.test(text))?.[1];
  return family ? { family, size: sizeKey } : null;
}

/** The passive visual sensors (pp. 60-61). */
export type VisualKind = "nightVision" | "infrared" | "hyperspectral" | "pesa";
export type VisualForm = "binoculars" | "goggles" | "glasses" | "contacts" | "camera" | "array";

export interface VisualSensor {
  kind: VisualKind;
  form: VisualForm;
  /** Its magnification at its own TL. */
  magnification: number;
  tl: number;
  nightVision: number;
}

/** The passive visual sensors by record name, with their magnification and Night Vision (pp. 60-61). */
export const VISUAL_SENSORS: Readonly<Record<string, Omit<VisualSensor, "tl">>> = Object.freeze({
  'Electro-Optical Binoculars ("Televiewers")': { kind: "nightVision", form: "binoculars", magnification: 64, nightVision: 9 },
  "Electro-Optical Surveillance Camera": { kind: "nightVision", form: "camera", magnification: 4, nightVision: 9 },
  "Night Vision Contacts": { kind: "nightVision", form: "contacts", magnification: 1, nightVision: 7 },
  'Night Vision Glasses ("Night Shades")': { kind: "nightVision", form: "glasses", magnification: 2, nightVision: 8 },
  "Night Vision Goggles or Visor": { kind: "nightVision", form: "goggles", magnification: 4, nightVision: 9 },
  "Infrared Imaging Sensor Array": { kind: "infrared", form: "array", magnification: 64, nightVision: 0 },
  "Infrared Binoculars": { kind: "infrared", form: "binoculars", magnification: 16, nightVision: 0 },
  "Infrared Surveillance Camera": { kind: "infrared", form: "camera", magnification: 4, nightVision: 0 },
  "Infrared Goggles or Visor": { kind: "infrared", form: "goggles", magnification: 2, nightVision: 0 },
  "Infrared Video Glasses": { kind: "infrared", form: "glasses", magnification: 1, nightVision: 0 },
  "Infrared Contacts": { kind: "infrared", form: "contacts", magnification: 1, nightVision: 0 },
  "Hyperspectral Imaging Sensor Array": { kind: "hyperspectral", form: "array", magnification: 32, nightVision: 0 },
  "Hyperspectral Binoculars": { kind: "hyperspectral", form: "binoculars", magnification: 16, nightVision: 0 },
  "Hyperspectral Surveillance Camera": { kind: "hyperspectral", form: "camera", magnification: 4, nightVision: 0 },
  "Hyperspectral Goggles or Visor": { kind: "hyperspectral", form: "goggles", magnification: 1, nightVision: 0 },
  "Hyperspectral Video Glasses": { kind: "hyperspectral", form: "glasses", magnification: 1, nightVision: 0 },
  "Hyperspectral Contacts": { kind: "hyperspectral", form: "contacts", magnification: 1, nightVision: 0 },
  "PESA Sensor Array": { kind: "pesa", form: "array", magnification: 32, nightVision: 0 },
  "PESA Binoculars": { kind: "pesa", form: "binoculars", magnification: 16, nightVision: 0 },
  "PESA Surveillance Camera": { kind: "pesa", form: "camera", magnification: 4, nightVision: 0 },
  "PESA Goggles or Visor": { kind: "pesa", form: "goggles", magnification: 1, nightVision: 0 },
  "PESA Video Glasses": { kind: "pesa", form: "glasses", magnification: 1, nightVision: 0 },
});

/**
 * Magnification at a later TL (pp. 60-61): night vision optics double at TL10
 * and quadruple at TL11+; infrared doubles one TL later and quadruples two
 * later; hyperspectral and PESA double every TL after their own.
 */
export function magnificationAt(sensor: Omit<VisualSensor, "tl">, introduced: number, tl: number): number {
  const later = Math.max(0, tl - introduced);
  if (sensor.kind === "nightVision") return sensor.magnification * (tl >= 11 ? 4 : tl >= 10 ? 2 : 1);
  if (sensor.kind === "infrared") return sensor.magnification * (later >= 2 ? 4 : later >= 1 ? 2 : 1);
  return sensor.magnification * 2 ** later;
}

/** What a worn visual sensor grants as senses (pp. 60-61). Cameras and arrays aren't worn. */
export function visualSenses(sensor: VisualSensor): { nightVision: number; infravision: boolean; hyperspectral: boolean; telescopic: number } | null {
  if (sensor.form === "camera" || sensor.form === "array") return null;
  return {
    nightVision: Math.min(9, sensor.nightVision),
    infravision: sensor.kind === "infrared",
    hyperspectral: sensor.kind === "hyperspectral" || sensor.kind === "pesa",
    telescopic: telescopicLevels(sensor.magnification),
  };
}

/** Infrared sensors: +3 to Tracking a heat trail no more than an hour old (p. 60). */
export const INFRARED_TRACKING = 3;

/** Chemsniffers: +4 to detect, +4 Tracking, +8 to analyze by scent, +1 per TL past TL9 (pp. 61-62). */
export function chemsnifferBonuses(tl: number): { detect: number; tracking: number; analyze: number; acute: number } {
  const later = Math.max(0, tl - 9);
  return { detect: 4 + later, tracking: 4, analyze: 8, acute: later };
}

/** Sound detectors: +4 Hearing, +4 Shadowing a noisy target, +8 to identify a sound (p. 62). */
export const SOUND_DETECTOR = Object.freeze({ hearing: 4, shadowing: 4, identify: 8 });

/** Hydrophones' detection bonus: +8, +10, +12, +2 per TL after TL9; +8 identify, +4 shadow, +3 to hit (pp. 62-63). */
export function hydrophoneDetection(size: "small" | "medium" | "large", tl: number): number {
  return ({ small: 8, medium: 10, large: 12 })[size] + 2 * Math.max(0, tl - 9);
}

/** Gravscanners: +6 very large (TL9), +12 large, +6 medium, 0 small, +6 per TL after introduction (p. 63). */
export function gravscannerDetection(size: "veryLarge" | "large" | "medium" | "small", tl: number): number {
  const base = { veryLarge: 6, large: 12, medium: 6, small: 0 }[size];
  const introduced = size === "veryLarge" ? 9 : 11;
  return base + 6 * Math.max(0, tl - introduced);
}

/** Radscanners: +18, +12, +6, and +2 at TL11 or +4 at TL12 (p. 63). */
export function radscannerDetection(size: "large" | "medium" | "small", tl: number): number {
  return ({ large: 18, medium: 12, small: 6 })[size] + (tl >= 12 ? 4 : tl >= 11 ? 2 : 0);
}

/** Detecting an operating power cell with a radscanner: -12 for AA up to +6 for F (p. 63). */
export const CELL_DETECTION: Readonly<Record<string, number>> = Object.freeze({ AA: -12, A: -9, B: -6, C: -3, D: 0, E: 3, F: 6 });

/** Sensor gloves: +4 to tasks by touch, +2 more at TL11, +4 at TL12 (p. 67). */
export function sensorGloveBonus(tl: number): number {
  return 4 + (tl >= 12 ? 4 : tl >= 11 ? 2 : 0);
}

/** The active sensors (pp. 64-66). */
export type ActiveKind = "ladar" | "radar" | "sonar" | "terahertz" | "ultrascanner";
export type ActiveSize = "small" | "medium" | "large";

/** Active sensors' ranges in yards at TL9 (TL11 for ultrascanners), with imaging ranges where different (pp. 64-66). */
export const ACTIVE_RANGES: Readonly<Record<ActiveKind, Record<ActiveSize, { range: number; imaging?: number }>>> = Object.freeze({
  ladar: { small: { range: 10 * MILE }, medium: { range: 30 * MILE }, large: { range: 100 * MILE } },
  radar: { small: { range: 10 * MILE, imaging: MILE }, medium: { range: 30 * MILE, imaging: 3 * MILE }, large: { range: 100 * MILE, imaging: 10 * MILE } },
  sonar: { small: { range: 200 }, medium: { range: 2000 }, large: { range: 20000 } },
  terahertz: { small: { range: 200 }, medium: { range: 600 }, large: { range: 2000 } },
  ultrascanner: { small: { range: 10 * MILE, imaging: 2000 }, medium: { range: 30 * MILE, imaging: 3 * MILE }, large: { range: 100 * MILE, imaging: 10 * MILE } },
});

/** An active sensor's range factor for TL: x2 at TL10, x5 at TL11, x10 at TL12; ultrascanners double at TL12 (pp. 64-66). */
export function activeTlFactor(kind: ActiveKind, tl: number): number {
  if (kind === "ultrascanner") return tl >= 12 ? 2 : 1;
  return tl >= 12 ? 10 : tl >= 11 ? 5 : tl >= 10 ? 2 : 1;
}

/** The active sensor a record's name is: "Medium Radar". */
export function activeByName(name: string): { kind: ActiveKind; size: ActiveSize } | null {
  const match = /^(Small|Medium|Large) (Ladar|Radar|Sonar|Terahertz Radar|Ultrascanner)$/i.exec(String(name ?? "").trim());
  if (!match) return null;
  const kinds: Record<string, ActiveKind> = { ladar: "ladar", radar: "radar", sonar: "sonar", "terahertz radar": "terahertz", ultrascanner: "ultrascanner" };
  return { kind: kinds[match[2]!.toLowerCase()]!, size: match[1]!.toLowerCase() as ActiveSize };
}

/** A tactical sensor costs 5 times as much, a tactical sonar 10 times (pp. 64-66). */
export function tacticalFactor(kind: ActiveKind): number {
  return kind === "sonar" ? 10 : 5;
}

/** An ESM's warning: +1 to Dodge an attack aimed with an active targeting sensor it detects (p. 62). */
export const ESM_DODGE = 1;

/** Ladar: -4 to spot an unknown target, +4 to identify a known one (p. 64). */
export const LADAR = Object.freeze({ unknown: -4, identify: 4 });

/** Imaging radar's +3 to Search for concealed weapons; terahertz radar's +4 (p. 65). */
export const CONCEALED_WEAPONS = Object.freeze({ imagingRadar: 3, terahertz: 4 });

/** Air sonar has a tenth the range times the air pressure (p. 65). */
export function airSonarRange(range: number, atmospheres: number): number {
  return (range / 10) * Math.max(0, atmospheres);
}

/** A quantum channel (p. 47): laser and neutrino comms only, at 10% of normal range and 10 times the cost. */
export const QUANTUM_CHANNEL = Object.freeze({ range: 0.1, cost: 10 });
export function canHaveQuantumChannel(family: CommFamily | null | undefined): boolean {
  return family === "laser" || family === "neutrino";
}

/** Homing beacons are picked up 10 miles away, x5 at TL10, x20 at TL11, x100 at TL12 (p. 105). */
export function homingBeaconRange(tl: number): number {
  return 10 * MILE * (tl >= 12 ? 100 : tl >= 11 ? 20 : tl >= 10 ? 5 : 1);
}

/** A laser microphone's range: 3,000 yards, 300 for the pocket model, x2 at TL10, x5 at TL11, x10 at TL12 (p. 105). */
export function laserMicrophoneRange(name: string, tl: number): number | null {
  const text = String(name ?? "").trim();
  const base = /^pocket laser mike$/i.test(text) ? 300 : /^laser microphone$/i.test(text) ? 3000 : null;
  if (base === null) return null;
  return base * (tl >= 12 ? 10 : tl >= 11 ? 5 : tl >= 10 ? 2 : 1);
}

/** A sensing task an Electronics Operation (Sensors) roll makes with a gadget's help. */
export interface SensorTask {
  key: "detect" | "analyze" | "identify";
  bonus: number;
}

/**
 * The Electronics Operation (Sensors) tasks a chemsniffer or sound detector
 * helps (pp. 61-62): a chemsniffer's +4 to detect (plus its TL's) and +8 to
 * analyze or recognize by scent; a sound detector's +8 to analyze and
 * identify a sound. Null for anything else.
 */
export function sensorTasks(name: string, tl: number): SensorTask[] | null {
  const text = String(name ?? "");
  if (/chemsniffer$/i.test(text)) {
    const bonuses = chemsnifferBonuses(tl);
    return [{ key: "detect", bonus: bonuses.detect }, { key: "analyze", bonus: bonuses.analyze }];
  }
  if (/sound detector$/i.test(text)) return [{ key: "identify", bonus: SOUND_DETECTOR.identify }];
  return null;
}

/** A chemsniffer "can't detect anything in a sealed environment, underwater, or in vacuum" (p. 61). */
export function chemsnifferWorks(environment: { underwater: boolean; atmospheres: number }, sealed = false): boolean {
  return !sealed && !environment.underwater && environment.atmospheres > 0.01;
}

/** Targeting software, which a lock's +3 is "used in conjunction with" (p. 63): the targeting programs (p. 150). */
export function isTargetingSoftware(name: string): boolean {
  return /^targeting program\b/i.test(String(name ?? "").trim());
}
