/**
 * The electronic battlefield's communications from High-Tech: Electricity and
 * Electronics (HT:EE pp. 46-48): spread-spectrum radio, signals intelligence
 * and its gear, and the cipher and code-breaking machines. The figures and the
 * arithmetic, with nothing of Foundry in them.
 *
 * Triangulation (HT:EE p. 47) revises High-Tech's direction finder (High-Tech
 * pp. 38-39), so it is the `radios` switch's, in `../sensors/rules.ts`
 * (decision E3 in #471).
 */

import { timeSpentModifier } from "../../../shared/time-spent.js";

// ── Spread spectrum (HT:EE pp. 46-47) ──

/**
 * Frequency hopping (TL7): -4 to rolls to detect the signal, and +4 to
 * Electronics Operation (EW) against a selective jammer's interference, for
 * twice the cost (HT:EE p. 46). It is High-Tech's ECCM option (High-Tech p.
 * 39), which the supplement revises: the -4 to detect in place of detection at
 * 1.5 times the range, and +4 against a selective jammer in place of immunity.
 */
export const FREQUENCY_HOPPING = Object.freeze({ tl: 7, detect: -4, jamming: 4, cost: 2 });

/**
 * Direct sequence (TL8, widespread after 1990): the signal can be detected at
 * no more than 1.5 times the radio's range, and +4 to Electronics Operation
 * (EW) against a broad-spectrum jammer or other signals on the band; treated
 * as cutting-edge gear (HT:EE pp. 8, 47). It is priced as the other
 * spread-spectrum system, twice the cost; the device's cutting-edge field
 * prices it as new gear.
 */
export const DIRECT_SEQUENCE = Object.freeze({ tl: 8, detection: 1.5, jamming: 4, cost: 2 });

/** A radio's spread spectrum: frequency hopping (the ECCM option) and direct sequence. */
export interface Spread {
  hopping?: boolean;
  direct?: boolean;
}

/** How far away a transmitting radio can be detected: twice its range, 1.5 times with direct sequence (High-Tech p. 39; HT:EE p. 47). */
export function spreadDetectionRange(range: number, spread: Spread): number {
  return range * (spread.direct ? DIRECT_SEQUENCE.detection : 2);
}

/** The modifier to detect a spread-spectrum signal: -4 for frequency hopping (HT:EE p. 46). */
export function spreadDetectModifier(spread: Spread): number {
  return spread.hopping ? FREQUENCY_HOPPING.detect : 0;
}

/**
 * The bonus to get through a jammer of a variety (HT:EE pp. 46-47, 49):
 * frequency hopping against a selective jammer, direct sequence against a
 * broad-spectrum one.
 */
export function spreadJammingBonus(spread: Spread, variety: "broad" | "selective"): number {
  if (variety === "selective" && spread.hopping) return FREQUENCY_HOPPING.jamming;
  if (variety === "broad" && spread.direct) return DIRECT_SEQUENCE.jamming;
  return 0;
}

/**
 * Direct sequence filters out other signals on the band: +4 against
 * interference on the tuning roll, never more than the interference's own
 * penalty (HT:EE p. 47).
 */
export function directSequenceTuning(conditions: number): number {
  return conditions < 0 ? Math.min(DIRECT_SEQUENCE.jamming, -conditions) : 0;
}

// ── Signals intelligence (HT:EE pp. 47-48) ──

export const EW = "Electronics Operation (EW)";
export const COMM = "Electronics Operation (Communications)";

/** A standard radio receiver is improvised gear for signals intelligence: -5 for a technological skill (HT:EE p. 47; p. B345). */
export const IMPROVISED_GEAR = -5;

/** The intercept unit: +4 to monitor routine traffic, and standard gear for the rest (HT:EE p. 48). */
export const INTERCEPT_ROUTINE = 4;

/** The TL8 handheld spectrum analyzer finds transmitters in the field at Electronics Operation (EW) -2 (HT:EE p. 48). */
export const DIGITAL_ANALYZER = -2;

/** A spectrum analyzer: +4 to Electronics Operation (EW) to identify an active frequency (HT:EE p. 48). */
export const IDENTIFY_FREQUENCY = 4;

/** An oscilloscope: +1 to signal tracing (HT:EE pp. 11, 47-48). */
export const OSCILLOSCOPE = 1;

/**
 * How a sender transmits (HT:EE p. 47): continuously, found with no roll
 * unless something penalizes it, and then after a minute; ongoing, as in
 * messages traded in combat, always with a roll; or rarely, a roll each
 * 4-hour watch, and the GM says whether there was anything to hear.
 */
export const TRANSMISSIONS = ["continuous", "ongoing", "rare"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

/** A watch for rare transmissions lasts 4 hours (HT:EE p. 47). */
export const WATCH_HOURS = 4;

/** Whether picking up a sender takes a roll, given the modifiers that apply (HT:EE p. 47). */
export function detectionRolled(transmission: Transmission, modifiers: ReadonlyArray<{ value: number }>): boolean {
  if (transmission !== "continuous") return true;
  return modifiers.some((m) => m.value < 0);
}

/** The antenna a listener searches with: a whip (or a monopole), a half-wave dipole or loop, or a directional antenna. */
export type SearchAntenna = "whip" | "dipole" | "directional";

/**
 * How many searches each channel or scan takes with an antenna: a dipole or
 * loop two, at right angles; a directional antenna ten (HT:EE pp. 28, 47).
 */
export const SEARCHES: Readonly<Record<SearchAntenna, number>> = Object.freeze({ whip: 1, dipole: 2, directional: 10 });

/**
 * Dividing a watch for rare transmissions between searches (HT:EE p. 47):
 * each gets an equal share of the time, and takes the haste modifier (p.
 * B346) for that share, rounded down to the next lower one: -5 for two, -8
 * for four. The Basic Set allows no more than 90% off, so ten or more
 * searches take -9.
 */
export function channelHaste(searches: number): number {
  const n = Math.max(1, Math.floor(Number(searches) || 1));
  if (n === 1) return 0;
  return -Math.min(9, Math.ceil(Math.round((1 - 1 / n) * 1000) / 100 - 1e-9));
}

/** Monitoring several channels for continuous or ongoing transmission takes a minute each (HT:EE p. 47). */
export function channelMinutes(searches: number): number {
  return Math.max(1, Math.floor(Number(searches) || 1));
}

/**
 * Scanning a band for continuous or ongoing transmission (HT:EE p. 47): 15
 * minutes at TL6, 5 at TL7, 5 seconds at TL8 with computer-controlled
 * scanning (a TL8 intercept unit's, p. 48); a later set without it scans as
 * a TL7 one. In seconds, for one scan; null before TL6.
 */
export function scanSeconds(tl: number, computerScanning: boolean): number | null {
  if (tl < 6) return null;
  if (tl === 6) return 15 * 60;
  return tl >= 8 && computerScanning ? 5 : 5 * 60;
}

/**
 * Scanning for rare transmissions, a 4-hour watch at a time (HT:EE p. 47):
 * -10 at TL6, -8 at TL7, and a further -4 with a dipole or loop, -9 with a
 * directional antenna. The book prints no TL8 figure; a later set takes
 * TL7's.
 */
export const RARE_SCAN = Object.freeze({ tl6: -10, tl7: -8 });
export const RARE_SCAN_ANTENNA: Readonly<Record<SearchAntenna, number>> = Object.freeze({ whip: 0, dipole: -4, directional: -9 });
export function rareScanPenalty(tl: number, antenna: SearchAntenna): number {
  return (tl <= 6 ? RARE_SCAN.tl6 : RARE_SCAN.tl7) + RARE_SCAN_ANTENNA[antenna];
}

/**
 * Aiming an antenna at a detected transmitter (HT:EE p. 47): a dipole or loop
 * is aimed as an area attack, a directional antenna as a cone (p. B413); either
 * scatters on a miss (p. B414). Found with a directional antenna, the aim is
 * automatic.
 */
export function aimShape(antenna: SearchAntenna): "area" | "cone" {
  return antenna === "directional" ? "cone" : "area";
}

/** At TL6, or with improvised gear, aiming an antenna takes a minute (HT:EE p. 47). */
export const AIM_SECONDS = 60;

/**
 * The haste penalty for aiming at a brief transmission (HT:EE p. 47; p.
 * B346): only where the aim takes a minute, at TL6 or with improvised gear,
 * for a transmission shorter than that.
 */
export function aimHaste(tl: number, improvised: boolean, transmissionSeconds: number): number {
  if (!(tl <= 6 || improvised)) return 0;
  const seconds = Number(transmissionSeconds) || 0;
  if (seconds <= 0 || seconds >= AIM_SECONDS) return 0;
  return timeSpentModifier(seconds, AIM_SECONDS);
}

/** The SIGINT gear a radio may be built with, as options that reprice it (HT:EE p. 48). */
export const SIGINT_OPTIONS: Readonly<Record<"rdf" | "hfdf", { cost: number; tl: number }>> = Object.freeze({
  // A receive-only radio with a directional antenna: twice the cost. [1902] 1919.
  rdf: { cost: 2, tl: 6 },
  // High-frequency direction finding: five times the cost. [1926] 1942, cutting edge until 1945.
  hfdf: { cost: 5, tl: 7 },
});

/** An improvised radio direction finder (a loop of wire or a dipole): -5 to its rolls (HT:EE p. 48). */
export const IMPROVISED_RDF = -5;

/** Taking a bearing on a beacon: a minute, an unopposed roll, and +1 to Navigation (HT:EE p. 48). */
export const BEACON = Object.freeze({ seconds: 60, navigation: 1 });
export const NAVIGATION = ["Navigation (Land)", "Navigation (Sea)", "Navigation (Air)"] as const;

/** Whether a record is a spectrum analyzer, and whether the TL8 handheld one (HT:EE pp. 11, 48). */
export function spectrumAnalyzerOf(name: unknown): "lab" | "digital" | null {
  const text = String(name ?? "").trim().toLowerCase();
  if (text === "spectrum analyzer") return "lab";
  if (text === "spectrum analyzer (digital)" || text === "digital spectrum analyzer") return "digital";
  return null;
}

// ── Encryption and decryption (HT:EE p. 48) ──

/** Sending enciphered text: -4 to Electronics Operation (Communications), since errors don't show (HT:EE p. 48). */
export const ENCIPHERED_TEXT = -4;

/**
 * Extra time reduces or avoids the -4 for sending enciphered text (HT:EE p.
 * 48; p. B346): the bonus for time spent, never more than the penalty.
 */
export function encipheredTimeBonus(times: number): number {
  const t = Number(times) || 1;
  if (t <= 1) return 0;
  return Math.min(-ENCIPHERED_TEXT, timeSpentModifier(t, 1));
}

/**
 * The code-breaking machines (HT:EE p. 48): the electromechanical bombe, +1
 * to break codes made on a cipher machine such as the Enigma, from 1940; and
 * Colossus, a dedicated vacuum-tube macroframe, +2 to Cryptography for
 * code-breaking, from 1944. A general-purpose computer is the standard
 * equipment for Cryptography since (p. B186).
 */
export const DECRYPTION_MACHINES = Object.freeze({
  bombe: { bonus: 1, year: 1940, cipherMachineOnly: true },
  colossus: { bonus: 2, year: 1944, cipherMachineOnly: false },
});
export type DecryptionMachine = keyof typeof DECRYPTION_MACHINES;

/**
 * A machine's bonus to break a code: the bombe only against a cipher
 * machine's code (High-Tech's TL6 basic encryption, p. 211); neither against
 * an ad-libbed code, which is a Quick Contest of wits.
 */
export function machineBonus(machine: DecryptionMachine | "" | null | undefined, code: string): number {
  if (!machine || code === "improvised") return 0;
  const figures = DECRYPTION_MACHINES[machine];
  if (!figures) return 0;
  if (figures.cipherMachineOnly && code !== "basic6") return 0;
  return figures.bonus;
}

/** A cipher machine the record is, for sending enciphered text (High-Tech p. 211; HT:EE p. 48). */
export function isCipherMachine(name: unknown): boolean {
  return /^cipher machine$/i.test(String(name ?? "").trim());
}
