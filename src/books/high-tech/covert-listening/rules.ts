/**
 * Bugs, taps and countersurveillance from the supplement Electricity and
 * Electronics (HT:EE pp. 44-45), part of High-Tech (decision E1 in #471):
 * the figures, as pure functions and tables. They extend High-Tech's own
 * surveillance gear (pp. 208-213), whose figures are in `../surveillance/rules.ts`.
 */

import { sensorData } from "../../../shared/sensors/data.js";
import { EW, SECURITY, SURVEILLANCE, bugOf, jammableByName } from "../surveillance/rules.js";

export { SECURITY, SURVEILLANCE, EW };
export const MEDIA = "Electronics Operation (Media)";
export const WIRING = "Electronics Repair (Surveillance)";

const nameKey = (name: unknown) => String(name ?? "").trim().toLowerCase();
/** The TL an item was made at, TL9 where it says none (as the sensors engine reads it). */
const itemTl = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0] ?? 9);

// ── sweeping for a bug (HT:EE p. 44) ──

/**
 * A bug detector finds a bug that transmits at -5 where the bug uses spread
 * spectrum (HT:EE pp. 44, 46-47). A High-Tech radio's ECCM option is its
 * frequency hopping (p. 39), which is spread spectrum, so a bug with it
 * counts.
 */
export const SPREAD_SPECTRUM = -5;

/** An isolator guarding a bug: -2 to rolls to detect it; the isolator itself is SM -10 (HT:EE p. 44). */
export const ISOLATOR = -2;
export const ISOLATOR_SM = -10;
export const isIsolator = (name: unknown): boolean => nameKey(name) === "isolator";

/** A bug a bug detector can sense (p. 212): one High-Tech's bug table lists, or gear that transmits by Surveillance. */
function isSensedBug(item: any): boolean {
  const name = String(item?.name ?? "");
  const bug = bugOf(name);
  if (bug) return bug.sweep !== "undetectable";
  return jammableByName(name, itemTl(item))?.skill === SURVEILLANCE;
}

/**
 * What guards the bugs a character carries, for the sweep's dialog to start
 * from: a bug with spread spectrum (ECCM), and an isolator (HT:EE p. 44).
 */
export function guardsOf(actor: any): { spreadSpectrum: boolean; isolator: boolean } {
  const items: any[] = [...(actor?.items ?? [])].filter((i) => i?.type === "equipment" && i.system?.carried !== false);
  return {
    spreadSpectrum: items.some((i) => isSensedBug(i) && sensorData(i).options.eccm === true),
    isolator: items.some((i) => isIsolator(i.name)),
  };
}

// ── white noise (HT:EE p. 44) ──

/**
 * A white noise generator masks conversation: -4 to eavesdropping through an
 * audio bug, a contact, laser or resonant cavity microphone (HT:EE p. 44).
 * High-Tech's own line says it defeats a laser mike outright (p. 213); the
 * supplement makes it the penalty, which is what this switch rolls.
 */
export const WHITE_NOISE = -4;
export const isWhiteNoiseGenerator = (name: unknown): boolean => /^white noise generator\b/.test(nameKey(name));

/**
 * An FM receiver tuned between stations makes an improvised generator, unless
 * it picks up a signal that isn't random: Electronics Operation (Media) at -2
 * to avoid that (HT:EE p. 44).
 */
export const IMPROVISED_WHITE_NOISE = -2;

// ── the lock-in amplifier (HT:EE pp. 11, 44) ──

/**
 * Tracing a known signal a signal generator put into a facility or a line:
 * Electronics Operation (Security) at +6, or +10 with the digital TL8
 * amplifier, a minute per 100 square feet (HT:EE p. 44).
 */
export function lockInBonus(tl: number): number {
  return tl >= 8 ? 10 : 6;
}
export const isLockInAmplifier = (name: unknown): boolean => /^lock-in amplifier\b/.test(nameKey(name));

// ── the laser microphone (HT:EE p. 44; High-Tech p. 208) ──

/** Heavy curtains or triple glazing between the speakers and the window: -2 (HT:EE p. 44). */
export const CURTAINS = -2;
/** Noise such as running water, -1 to -4 (HT:EE p. 44). */
export const MAX_NOISE = 4;
export const isLaserMike = (name: unknown): boolean => /^laser (mike|microphone)$/.test(nameKey(name));

/**
 * What background noise costs a laser mike: -1 to -4 as the GM rates it
 * (HT:EE p. 44), but none at TL8, whose mike filters ordinary noise out
 * (High-Tech p. 208).
 */
export function laserNoise(noise: number, tl: number): number {
  if (tl >= 8) return 0;
  const rated = Math.max(0, Math.min(MAX_NOISE, Math.round(Number(noise) || 0)));
  return rated ? -rated : 0;
}

// ── the nonlinear junction detector (HT:EE p. 44) ──

export const isJunctionDetector = (name: unknown): boolean => nameKey(name) === "nonlinear junction detector";

/** What a junction detector's sweep came to. */
export type JunctionOutcome = "found" | "missed" | "falsePositive";

/**
 * A sweep finds any solid-state device in the room on Electronics Operation
 * (Security); a failure by 4 or more, or a critical failure, takes a rusty
 * nail or the like for a bug (HT:EE p. 44).
 */
export function junctionOutcome(result: { success?: boolean; margin?: number; criticalFailure?: boolean }): JunctionOutcome {
  if (result.success) return "found";
  if (result.criticalFailure || Math.abs(Math.floor(Number(result.margin) || 0)) >= 4) return "falsePositive";
  return "missed";
}

// ── emissions, keystrokes and RFID (HT:EE p. 45) ──

/** Reading a computer's emissions is free out to 300 yards (HT:EE p. 45). */
export const EMISSIONS_FREE = 300;

/** Reading a computer's emissions: -1 per 100 yards, or part, past 300 (HT:EE p. 45). */
export function emissionsPenalty(yards: number): number {
  const past = (Number(yards) || 0) - EMISSIONS_FREE;
  return past > 0 ? -Math.ceil(past / 100) : 0;
}

/** Acoustic keylogging (or the accelerometer's) needs a sample of 1,000 typed characters, about 200 words (HT:EE p. 45). */
export const KEYLOG_SAMPLE = Object.freeze({ characters: 1000, words: 200 });

/**
 * How long a typist takes to give that sample: Typing is skill x 5 words a
 * minute on an electric typewriter or a keyboard, skill x 3 on a manual
 * (p. B228). Null where the typist can't type at all.
 */
export function keylogMinutes(typing: number, manual = false): number | null {
  const wpm = Math.max(0, Math.floor(Number(typing) || 0)) * (manual ? 3 : 5);
  return wpm > 0 ? Math.ceil(KEYLOG_SAMPLE.words / wpm) : null;
}

/** A keylogger wired into an electric typewriter: half an hour's access and Electronics Repair (Surveillance) (HT:EE p. 45). */
export const KEYLOGGER_WIRING_MINUTES = 30;
/** A keylogger's built-in transmitter reaches 2 miles (HT:EE p. 45). */
export const KEYLOGGER_RANGE_MILES = 2;
export const isKeylogger = (name: unknown): boolean => nameKey(name) === "keylogger";

/** Capturing an RFID chip's data: Electronics Operation (Security) at -2, and -1 per full yard to the chip (HT:EE p. 45). */
export const RFID_CAPTURE = -2;
export function rfidPenalty(yards: number): number {
  return RFID_CAPTURE - Math.max(0, Math.floor(Number(yards) || 0));
}

/** A shielded wallet keeps an RFID card from being read at all (HT:EE p. 45). */
export const isShieldedWallet = (name: unknown): boolean => nameKey(name) === "shielded wallet";

/** The resonant cavity microphone is SM -5, its antenna 9 inches long (HT:EE p. 44). */
export const RESONANT_CAVITY_SM = -5;
export const isResonantCavity = (name: unknown): boolean => nameKey(name) === "resonant cavity microphone";

/** The covert-listening jobs the GM tool runs, for records the supplement prints with no statistics. */
export const COVERT_TASKS = ["emissionsBuild", "emissionsRead", "acousticKeylog", "rfidCapture", "boosterBag", "improvisedWhiteNoise"] as const;
export type CovertTask = (typeof COVERT_TASKS)[number];

/** The skill each job is rolled against, or null for the keylogging sample, which is timed rather than rolled (HT:EE pp. 44-45). */
export const TASK_SKILL: Readonly<Record<CovertTask, string | null>> = Object.freeze({
  emissionsBuild: EW,
  emissionsRead: EW,
  acousticKeylog: null,
  rfidCapture: SECURITY,
  boosterBag: "Scrounging",
  improvisedWhiteNoise: MEDIA,
});
