/**
 * High-Tech's security screening, surveillance and jamming (pp. 205-213,
 * 217): the figures, as pure functions and tables.
 */

import { radioByName } from "../sensors/rules.js";

export const SECURITY = "Electronics Operation (Security)";
export const SURVEILLANCE = "Electronics Operation (Surveillance)";
export const COMMUNICATIONS = "Electronics Operation (Communications)";
export const EW = "Electronics Operation (EW)";
export const EOD = "Explosives (Explosive Ordnance Disposal)";

const nameKey = (name: unknown) => String(name ?? "").trim().toLowerCase();

// ── security systems (pp. 205-207) ──

/**
 * Spotting an intrusion-detection system (p. 205): a Vision roll at -5, an
 * Observation roll, or a Per-based Traps roll; a concealed one makes it a
 * Quick Contest against the installer's Camouflage.
 */
export const SPOT_VISION = -5;
export const SPOT_WAYS = ["vision", "observation", "traps"] as const;
export type SpotWay = (typeof SPOT_WAYS)[number];

/** Neutralizing each section of a smart fence: Electronics Operation (Security) at -4 (p. 205). */
export const SMART_FENCE = -4;
/** Forging a signature on a signature pad, with the skill and a computer analysis of a real one: Forgery at -3 (p. 205). */
export const SIGNATURE_PAD = -3;
/** Crossing a seismic detector's zone unnoticed, knowing it's there: Stealth at -4, at Move 1 (p. 206). */
export const SEISMIC_STEALTH = -4;

/** The ways the GM tool runs a security system. */
export const SECURITY_TASKS = ["spot", "identify", "defeat", "smartFence", "seismic", "signature"] as const;
export type SecurityTask = (typeof SECURITY_TASKS)[number];

/**
 * The skill that defeats a security device (p. 205): Traps for a mechanical
 * device or a simple circuit, Electronics Operation (Security) for anything
 * more sophisticated.
 */
export const defeatSkill = (sophisticated: boolean): string => (sophisticated ? SECURITY : "Traps");

/** The acoustic countersniper system rolls against 10 plus the shot's total Hearing modifier (p. 207). */
export const COUNTERSNIPER_BASE = 10;
/** Optical recognition software as a guard's Perception: 14 conservatively, 18 or more generously (p. 207). */
export const OPTICAL_RECOGNITION = Object.freeze({ conservative: 14, generous: 18 });

/**
 * What a subject fools optical recognition with (p. 207): Disguise or Acting,
 * "about as easily as they would a guard", the better of the two; null for a
 * subject with neither.
 */
export function recognitionCover(disguise: number | null, acting: number | null): { skill: "Disguise" | "Acting"; level: number } | null {
  if (disguise === null && acting === null) return null;
  if (acting !== null && (disguise === null || acting > disguise)) return { skill: "Acting", level: acting };
  return { skill: "Disguise", level: disguise! };
}
/** A millimeter-wave camera sees as Imaging Radar out to 10 yards (p. 207). */
export const MILLIMETER_WAVE_RANGE = 10;

// ── screening (pp. 206-207, 217) ──

/** What a screening device is. */
export type ScreenerKind = "handheldMetal" | "walkthroughMetal" | "baggage" | "ct" | "portableXray";

export interface Screener {
  kind: ScreenerKind;
  /** Whether its operator rolls Electronics Operation (Security) to claim its bonuses (p. 206): the screening systems do; the EOD team's X-ray doesn't. */
  operatorRoll: boolean;
}

/** The screening gear by record (pp. 206-207, 217). */
export const SCREENERS: Readonly<Record<string, Screener>> = Object.freeze({
  "handheld metal detector (tl7)": { kind: "handheldMetal", operatorRoll: true },
  "handheld metal detector (tl8)": { kind: "handheldMetal", operatorRoll: true },
  "handheld metal detector": { kind: "handheldMetal", operatorRoll: true },
  "walkthrough metal detector (tl7)": { kind: "walkthroughMetal", operatorRoll: true },
  "walkthrough metal detector (tl8)": { kind: "walkthroughMetal", operatorRoll: true },
  "walkthrough metal detector": { kind: "walkthroughMetal", operatorRoll: true },
  "carry-on baggage screener": { kind: "baggage", operatorRoll: true },
  "hold baggage screener": { kind: "baggage", operatorRoll: true },
  "pallet or cargo container screener": { kind: "baggage", operatorRoll: true },
  "ct scanner": { kind: "ct", operatorRoll: true },
  "portable x-ray machine (tl8)": { kind: "portableXray", operatorRoll: false },
  "portable x-ray machine": { kind: "portableXray", operatorRoll: false },
});

export const screenerOf = (name: unknown): Screener | null => SCREENERS[nameKey(name)] ?? null;

/** The skills a screening device helps, by kind. */
export const SCREENING_SKILLS: Readonly<Record<ScreenerKind, readonly string[]>> = Object.freeze({
  handheldMetal: ["Search", "Traps", EOD],
  walkthroughMetal: ["Search"],
  baggage: ["Search"],
  ct: ["Search"],
  portableXray: ["Search", EOD],
});

/** What the screener is looking for, and how the search is made. */
export interface ScreeningSearch {
  skill: string;
  /** Whether the thing sought is metallic: a gun, a knife, a mine, a detonator. */
  metallic: boolean;
  /** Whether it is an explosive. */
  explosive: boolean;
  /** A handheld metal detector with a one-minute pat-down. */
  patDown: boolean;
  /** A walkthrough detector's sensitivity, 1 to 3. */
  sensitivity: number;
  /** The item's TL. */
  tl: number;
}

/**
 * A screening device's bonus to a search (pp. 206-207, 217), or 0 where it
 * gives none:
 *   - a handheld metal detector, +1 to Search, Traps and Explosives (EOD) to
 *     find metal; with a one-minute pat-down, +2 to Search;
 *   - a walkthrough metal detector, +1 to +3 to Search as it is set, for metal;
 *   - an X-ray baggage screener, +3 to Search, +1 more at TL8 for metallic
 *     weapons, detonators and explosives;
 *   - a CT scanner, +4 to Search, +6 to find explosives;
 *   - the EOD team's portable X-ray, +5 to Search examining a package's or
 *     vehicle's contents, +4 to Explosives (EOD) defusing a bomb.
 */
export function screeningBonus(kind: ScreenerKind, search: ScreeningSearch): number {
  const skill = search.skill;
  switch (kind) {
    case "handheldMetal":
      if (!search.metallic || !SCREENING_SKILLS.handheldMetal.includes(skill)) return 0;
      return skill === "Search" && search.patDown ? 2 : 1;
    case "walkthroughMetal":
      return skill === "Search" && search.metallic ? Math.max(1, Math.min(3, Math.round(search.sensitivity) || 1)) : 0;
    case "baggage":
      if (skill !== "Search") return 0;
      return 3 + (search.tl >= 8 && (search.metallic || search.explosive) ? 1 : 0);
    case "ct":
      return skill === "Search" ? (search.explosive ? 6 : 4) : 0;
    case "portableXray":
      return skill === "Search" ? 5 : skill === EOD ? 4 : 0;
  }
}

/** A metal detector makes clothing built to hide things useless (p. 206). */
export const negatesUndercoverClothing = (kind: ScreenerKind, search: ScreeningSearch): boolean =>
  (kind === "handheldMetal" || kind === "walkthroughMetal") && search.skill === "Search" && search.metallic;

/** Clothing built to hide things (p. 64), by its record's name. */
export const isUndercoverClothing = (name: unknown): boolean => /^undercover clothing\b/i.test(String(name ?? "").trim());

// ── audio and visual surveillance (pp. 208-210) ──

/** A spike mike turns the wall into a sounding board: Parabolic Hearing at (TL-4) levels (p. 208). */
export function spikeMikeLevels(name: unknown, tl: number): number | null {
  if (!/^(laser )?spike mike\b/i.test(String(name ?? "").trim())) return null;
  return Math.max(0, tl - 4) || null;
}

/**
 * A contact mike, or the supplement's contact microphone, which prints the
 * same rule (HT:EE p. 44), by its record's name.
 */
export const isContactMike = (name: unknown): boolean => /^contact (mike|microphone)$/i.test(String(name ?? "").trim());

/** A contact mike hears through a barrier at -(DR + HP)/5, rounded down (p. 208; HT:EE p. 44). */
export function contactMikePenalty(dr: number, hp: number): number {
  const total = Math.max(0, Number(dr) || 0) + Math.max(0, Number(hp) || 0);
  return total >= 5 ? -Math.floor(total / 5) : 0;
}

/** A shielded room gives at least -5 to electronic intelligence-gathering against it (p. 212). */
export const SHIELDED_ROOM = -5;

/** Guiding a pinhead mike's cable is a DX-based Electronics Operation (Surveillance) roll (p. 208). */
export const isPinheadMike = (name: unknown): boolean => /^(laser )?pinhead mike\b/i.test(String(name ?? "").trim());
/** A skill rolled against another attribute: the level less the attribute it's based on, plus the other (p. B172). */
export const rebased = (level: number, from: number, to: number): number => level - from + to;

/** The laser mike's range: 300 yards at TL7, 900 at TL8 (p. 208). */
export const LASER_MIKE_RANGE: Readonly<Record<number, number>> = Object.freeze({ 7: 300, 8: 900 });

/** A search endoscope: +3 to Search in hollow objects and body cavities, +2 to Lockpicking through a drilled hole (p. 209). */
export const SEARCH_ENDOSCOPE: Readonly<Record<string, number>> = Object.freeze({ Search: 3, Lockpicking: 2 });
/** A surveillance endoscope's tiny lens: -3 to Vision; spotting its tube, Vision-5 (p. 209). */
export const SURVEILLANCE_ENDOSCOPE = Object.freeze({ vision: -3, spot: -5 });
/** A security document scanner copies a sealed document on Electronics Operation (Security or Surveillance) at -2 (p. 209). */
export const DOCUMENT_SCANNER = -2;

/**
 * The bugs by record: their Size Modifier, for a home-made one (p. 210), and
 * what a bug detector makes of them (p. 212): a radio beacon is +4 to find,
 * and a phone tap, a laser mike or a laser pinhead mike can't be found by one
 * at all (pp. 208-209).
 */
export const BUGS: Readonly<Record<string, { sm: number | null; sweep: "normal" | "noisy" | "undetectable" }>> = Object.freeze({
  "audio bug (tl7)": { sm: -9, sweep: "normal" },
  "audio bug (tl8)": { sm: -13, sweep: "normal" },
  "contact mike": { sm: -11, sweep: "normal" },
  // The supplement's contact microphone, SM -11 as well (HT:EE p. 44).
  "contact microphone": { sm: -11, sweep: "normal" },
  "pinhead mike": { sm: -16, sweep: "normal" },
  "miniature video bug": { sm: -11, sweep: "normal" },
  "subminiature video bug": { sm: -13, sweep: "normal" },
  "video bug": { sm: -9, sweep: "normal" },
  "radio beacon (tl7)": { sm: null, sweep: "noisy" },
  "radio beacon (tl8)": { sm: null, sweep: "noisy" },
  "phone tap": { sm: null, sweep: "undetectable" },
  "laser mike": { sm: null, sweep: "undetectable" },
  "laser pinhead mike": { sm: -16, sweep: "undetectable" },
});
export const bugOf = (name: unknown) => BUGS[nameKey(name)] ?? null;

/** The kinds of bug a sweep may be after. */
export const SWEEP_KINDS = ["normal", "noisy", "undetectable"] as const;
export type SweepKind = (typeof SWEEP_KINDS)[number];
/** Anyone scanning for bugs has +4 to find a radio beacon (p. 210). */
export const NOISY_BUG = 4;

/**
 * A home-made bug (p. 210): half a day's work, $10-$20 of parts and an
 * Electronics Repair (Surveillance) roll, at a penalty of SM + 9 for anything
 * smaller than a matchbox (SM -9).
 */
export function homemadeBugPenalty(sm: number): number {
  return sm < -9 ? sm + 9 : 0;
}
export const HOMEMADE = Object.freeze({ skill: "Electronics Repair (Surveillance)", hours: 12, cost: [10, 20] as const });

/** A cellular beacon's battery lasts 10 times as long reporting hourly, 100 times daily (p. 210). */
export const BEACON_BATTERY = Object.freeze({ hourly: 10, daily: 100 });

// ── countersurveillance (pp. 211-212) ──

/** A bug detector's sweep takes about a minute per 100 square feet (p. 212). */
export function sweepMinutes(squareFeet: number): number {
  return Math.max(1, Math.ceil((Number(squareFeet) || 0) / 100));
}

/** Good and fine gear's +1 and +2 (p. B345), as the bug detector's quality grades give it (p. 212). */
export function qualityBonus(grade: unknown): number {
  return grade === "fine" ? 2 : grade === "good" ? 1 : 0;
}

// ── jamming (pp. 212-213) ──

/** At up to 10 times a jammer's range, radio gear takes an unopposed roll to use (p. 212). */
export const JAMMER_SHADOW = 10;
const MILE = 1760;

/** A jammer's figures, as the shared engine reads them. */
export interface JammerFigures {
  range: number;
  skill: number | null;
  blocks?: string;
  hinders?: readonly string[];
  hearing?: number;
}

/** What a radio jammer hinders: radio gear, and what rides the cell network. */
export const RADIO_GEAR = Object.freeze(["radio", "cellPhone"]);

/**
 * A Tesla coil or a spark-gap transmitter adapted to jam (HT:EE p. 49): -2
 * to the operator's Electronics Operation (EW), after 4 hours in a workshop,
 * or with a tool kit and a Scrounging roll. Both make broadband noise -- a
 * spark-gap set is wideband by necessity and tunes imprecisely at best
 * (HT:EE pp. 28-29) -- so neither can put all its output on one frequency:
 * they jam broad-spectrum.
 */
export const ADAPTED_JAMMER = Object.freeze({ modifier: -2, hours: 4 });

/**
 * Following a call through a cell-phone jammer: a Hearing roll at -2 to make
 * out what is said, within its range, where High-Tech blocked the call
 * outright (HT:EE p. 50, revising High-Tech p. 213). The supplement makes it a
 * broad-spectrum jammer on the cell band, so out to 10 times its range the
 * Hearing roll is unmodified; data on the band -- a cellular beacon -- is
 * still blocked within its range.
 */
export const CELL_PHONE_HEARING = -2;

/**
 * The jammers by record (pp. 212-213): the area jammer's half mile, mile and
 * two miles with an operator; the expendable jammer's 50 yards at an effective
 * EW 18 with none; the cell-phone jammer, which blocks cell-phone traffic
 * within 15 yards, save a call a listener follows by ear (HT:EE p. 50).
 */
export const JAMMERS: Readonly<Record<string, JammerFigures>> = Object.freeze({
  "area jammer (tl6)": { range: MILE / 2, skill: null, hinders: RADIO_GEAR },
  "area jammer (tl7)": { range: MILE, skill: null, hinders: RADIO_GEAR },
  "area jammer (tl8)": { range: 2 * MILE, skill: null, hinders: RADIO_GEAR },
  "expendable radio jammer": { range: 50, skill: 18, hinders: RADIO_GEAR },
  "cell-phone jammer": { range: 15, skill: null, blocks: "cellPhone", hearing: CELL_PHONE_HEARING },
});
export const jammerByName = (name: unknown) => JAMMERS[nameKey(name)] ?? null;

/** The cell-phone jammer, by its record's name. */
export const isCellPhoneJammer = (name: unknown): boolean => nameKey(name) === "cell-phone jammer";

/** A cell-phone jammer with double the radius has 4 times the cost and weight (HT:EE p. 50). */
export const DOUBLE_RADIUS = Object.freeze({ range: 2, cost: 4, weight: 4 });

// ── the supplement's jammers (HT:EE pp. 49-50) ──

/**
 * The varieties' penalties to the user's roll (HT:EE p. 49): a
 * broad-spectrum jammer, -2 within its range and a plain roll out to 10 times
 * it; a selective jammer that has caught the frequency, -4 and -2.
 */
export const JAMMER_VARIETY_PENALTIES = Object.freeze({
  broad: Object.freeze({ within: -2, shadow: 0 }),
  selective: Object.freeze({ within: -4, shadow: -2 }),
});

/**
 * A spectrum analyzer: +4 to Electronics Operation (EW) for jamming (HT:EE
 * p. 49, which points to both models: the TL7 laboratory one, p. 11, and the
 * TL8 handheld one, p. 48, recorded as "Spectrum Analyzer (Digital)").
 */
export const SPECTRUM_ANALYZER = 4;
export const isSpectrumAnalyzer = (name: unknown): boolean => /^(digital )?spectrum analyzer\b/i.test(String(name ?? "").trim());

/** Radar gear, and the skill it is used with, for a radar jammer (HT:EE p. 49). */
export const SENSORS = "Electronics Operation (Sensors)";

/** A supplement jammer's figures, and which of its rules runs it. */
export interface SupplementJammer extends JammerFigures {
  rule: "jammerKinds" | "radarJamming";
  /** Operated either way, the operator picking; or broad-spectrum always. */
  variety: "choose" | "broad" | null;
  spoofs?: boolean;
}

/** The radar jammer's radius: 15 miles, doubled at TL8 (HT:EE p. 49). */
const radarJammerRange = (tl: number) => 15 * MILE * (tl >= 8 ? 2 : 1);

/**
 * The supplement's jammers by record (HT:EE pp. 49-50), at the TL their name
 * gives or the record's own:
 *   - a large jammer ranges as a large radio of its TL (High-Tech p. 38's
 *     table, which the supplement's radios repeat), a portable jammer as a
 *     medium radio; either runs broad-spectrum or selective;
 *   - a radar jammer blinds radar out to 15 miles, 30 at TL8, as a
 *     broad-spectrum jammer against Electronics Operation (Sensors);
 *   - a radar spoofer is a TL8 radar jammer that feeds the radar a false
 *     picture in a Quick Contest instead of blinding it.
 */
export function supplementJammerByName(name: unknown, itemTl: number): SupplementJammer | null {
  const match = /^(large jammer|portable jammer|radar jammer|radar spoofer)(?: \(TL(\d+)\))?$/i.exec(String(name ?? "").trim());
  if (!match) return null;
  const kind = match[1]!.toLowerCase();
  const tl = match[2] ? Number(match[2]) : itemTl;
  if (kind === "radar spoofer") return { rule: "radarJamming", variety: null, spoofs: true, range: radarJammerRange(8), skill: null, hinders: ["radar"] };
  if (kind === "radar jammer") return { rule: "radarJamming", variety: "broad", range: radarJammerRange(tl), skill: null, hinders: ["radar"] };
  const radio = radioByName(`${kind === "large jammer" ? "Large" : "Medium"} Radio (TL${Math.max(6, Math.min(8, tl))})`, tl);
  return radio ? { rule: "jammerKinds", variety: "choose", range: radio.range, skill: null, hinders: RADIO_GEAR } : null;
}

/**
 * The radio gear a jammer hinders (p. 212), and the Electronics Operation
 * specialty each is used with: radios and phones with Communications, bugs,
 * transmitters and tracking beacons with Surveillance. Cell phones and
 * cellular beacons ride the cell network, which a cell-phone jammer blocks;
 * a phone carries a voice a listener may follow through it (HT:EE p. 50).
 */
export function jammableByName(name: unknown, tl: number): { skill: string; kind: string; voice?: boolean } | null {
  const text = String(name ?? "").trim();
  if (radioByName(text, tl)) return { skill: COMMUNICATIONS, kind: "radio" };
  if (/^(early )?cellular phone$|^cell phone$/i.test(text)) return { skill: COMMUNICATIONS, kind: "cellPhone", voice: true };
  if (/^satellite phone$/i.test(text)) return { skill: COMMUNICATIONS, kind: "radio" };
  if (/^(personal )?cellular beacon$/i.test(text)) return { skill: SURVEILLANCE, kind: "cellPhone" };
  if (/^(audio bug|radio beacon|a\/v transmitter|a\/v transceiver)\b|^(miniature |subminiature )?video bug$/i.test(text)) return { skill: SURVEILLANCE, kind: "radio" };
  return null;
}

/** A white noise generator defeats laser mikes, audio bugs and tape recorders (p. 213). */
export const isWhiteNoise = (name: unknown): boolean => /^white noise generator\b/i.test(String(name ?? "").trim());
