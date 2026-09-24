/**
 * The Electricity and Electronics supplement's electronic battlefield (HT:EE
 * pp. 45-46): military gear's toughness, surveillance cameras, the seismic
 * ground sensor, chaff and the reconnaissance UAVs, as pure functions and
 * tables. The Size and Speed/Range Table is the system's
 * (`rules.speedRangeModifier`), handed in by the caller.
 */

import { hydrophoneModifiers } from "../sensors/rules.js";

const nameKey = (name: unknown) => String(name ?? "").trim().toLowerCase();

export const OBSERVATION = "Observation";
export const SURVEILLANCE = "Electronics Operation (Surveillance)";

// ── military gear (HT:EE p. 45) ─────────────────────────────────────────────

/** Military electronics are built rugged: HT 12 and DR 8, where other devices have HT 10 and a lower DR (HT:EE p. 45). */
export const MILITARY = Object.freeze({ ht: 12, dr: 8 });

/**
 * A military device's HT and DR (HT:EE p. 45): the rugged figures, save
 * where its record states its own.
 */
export function militaryStatistics(stated: { ht: number | null; dr: number | null }): { ht: number; dr: number } {
  return { ht: stated.ht ?? MILITARY.ht, dr: stated.dr ?? MILITARY.dr };
}

// ── surveillance cameras (HT:EE p. 45; High-Tech p. 206) ────────────────────

/**
 * Watching through a surveillance camera (HT:EE p. 45): its low-resolution
 * picture puts Observation at -4, and a pan/tilt/zoom camera, able to focus
 * on one spot, at -2; the high-definition camera of TL8 is -2, and nothing
 * with pan/tilt/zoom. The supplement's cameras are High-Tech's p. 206
 * records (E2 in #471), by those records' names.
 */
export interface Camera {
  penalty: number;
  ptzPenalty: number;
  /** The year pan/tilt/zoom became available for it. */
  ptzYear: number;
}

export const CAMERAS: Readonly<Record<string, Camera>> = Object.freeze({
  "video surveillance camera (tl7)": { penalty: -4, ptzPenalty: -2, ptzYear: 1968 },
  "video surveillance camera (tl8)": { penalty: -2, ptzPenalty: 0, ptzYear: 2003 },
});

/** The record names the camera rule reads, as printed in the packs. */
export const CAMERA_RECORDS = ["Video Surveillance Camera (TL7)", "Video Surveillance Camera (TL8)"] as const;

export const cameraOf = (name: unknown): Camera | null => CAMERAS[nameKey(name)] ?? null;

/** A camera's penalty to Observation, with pan/tilt/zoom or without (HT:EE p. 45). */
export function cameraPenalty(camera: Camera, panTiltZoom: boolean): number {
  return panTiltZoom ? camera.ptzPenalty : camera.penalty;
}

/**
 * Pan/tilt/zoom adds $300 to a camera (HT:EE p. 45). High-Tech p. 206
 * triples the cost and weight instead; the switch that runs this is the
 * supplement's, so its figure is the one used.
 */
export const PTZ_COST = 300;

/** The skills that hide someone from a watcher: the guard's roll is a Quick Contest against the best of them (HT:EE p. 45). */
export const HIDING_SKILLS = ["Stealth", "Shadowing", "Camouflage"] as const;

// ── the seismic ground sensor (HT:EE p. 45) ─────────────────────────────────

/** The record the seismic rule reads. */
export const SEISMIC_RECORD = "Seismic Ground Sensor";
export const isSeismicSensor = (name: unknown): boolean => nameKey(name) === nameKey(SEISMIC_RECORD);

/**
 * Picking up footsteps or vehicles with a seismic ground sensor (HT:EE
 * p. 45): Electronics Operation (Surveillance), plus the source's Size
 * Modifier, plus its speed as a bonus off the Size and Speed/Range Table,
 * less the range's penalty from the same table (p. B550). The same scheme as
 * High-Tech's hydrophone (p. 49), so its function reads the table.
 */
export function seismicModifiers(options: { sm: number; speed: number; range: number }, speedRange: (yards: number) => number): Array<{ key: "size" | "speed" | "range"; value: number }> {
  return hydrophoneModifiers({ ...options, current: 0 }, speedRange).filter((l): l is { key: "size" | "speed" | "range"; value: number } => l.key !== "current");
}

// ── chaff (HT:EE p. 45) ─────────────────────────────────────────────────────

/** The record the chaff rule reads. */
export const CHAFF_RECORD = "Chaff (per package)";
export const isChaff = (name: unknown): boolean => nameKey(name) === nameKey(CHAFF_RECORD);

/** Each package of chaff dumped gives -2 to radar targeting of the craft (HT:EE p. 45). */
export const CHAFF_PER_PACKAGE = -2;

/** The penalty for this many packages dumped. */
export function chaffPenalty(packages: number): number {
  const n = Math.max(0, Math.floor(Number(packages) || 0));
  return n > 0 ? n * CHAFF_PER_PACKAGE : 0;
}

// ── reconnaissance UAVs (HT:EE p. 46) ───────────────────────────────────────

/**
 * What a record says about a drone (HT:EE p. 46): its onboard autopilot's
 * skill with the craft's control skill, and its Dodge for avoiding obstacles;
 * the remote control's bonus to the operator's Piloting rolls; how far from
 * its controller it may fly, in miles; and its ceiling, in feet. Zero is
 * none.
 */
export interface DroneData {
  autopilot: number;
  autopilotDodge: number;
  remoteBonus: number;
  controlRangeMiles: number;
  ceilingFeet: number;
}

/** A drone's data with nothing missing. */
export function droneOf(value: unknown): DroneData {
  const d = (value ?? {}) as Record<string, unknown>;
  const whole = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    autopilot: whole(d.autopilot),
    autopilotDodge: whole(d.autopilotDodge),
    remoteBonus: whole(d.remoteBonus),
    controlRangeMiles: Math.max(0, Number(d.controlRangeMiles) || 0),
    ceilingFeet: whole(d.ceilingFeet),
  };
}

/** Whether the data describes a drone at all. */
export const isDrone = (data: DroneData): boolean =>
  data.autopilot > 0 || data.remoteBonus > 0 || data.controlRangeMiles > 0 || data.ceilingFeet > 0;

/** The two UAVs as the table prints them (HT:EE p. 46), for the records. */
export const UAV_RECORDS: Readonly<Record<string, DroneData>> = Object.freeze({
  // Piloting (Helicopter)-14 and Dodge-9 for avoiding obstacles, +1 from the touch screen, 4 miles, 1,640 feet.
  "Phantom 4 Pro": { autopilot: 14, autopilotDodge: 9, remoteBonus: 1, controlRangeMiles: 4, ceilingFeet: 1640 },
  // Piloting (Vertol)-10 and Dodge-8, +2 from the touch screen and track pen, 7 miles, 10,500 feet.
  "RQ-16A T-Hawk": { autopilot: 10, autopilotDodge: 8, remoteBonus: 2, controlRangeMiles: 7, ceilingFeet: 10500 },
});

const MILE = 1760;

/**
 * Whether the operator is within the controller's range (HT:EE p. 46): a
 * distance the map can't give, or a drone with no range stated, counts as in
 * range.
 */
export function withinControlRange(data: DroneData, yards: number | null): boolean {
  if (yards === null || !Number.isFinite(yards) || data.controlRangeMiles <= 0) return true;
  return yards <= data.controlRangeMiles * MILE;
}

/** Whether a height, in feet, is above the drone's ceiling (HT:EE p. 46); a drone with none has no limit. */
export function aboveCeiling(data: DroneData, feet: number | null): boolean {
  if (feet === null || !Number.isFinite(feet) || data.ceilingFeet <= 0) return false;
  return feet > data.ceilingFeet;
}
