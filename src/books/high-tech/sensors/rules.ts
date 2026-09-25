/**
 * High-Tech's communications and sensors (pp. 36-50): telegraphy, radios by
 * size and TL and their options, the pocket laser and diver communicators;
 * the active sensors (sonar, radar, ground-penetrating and thru-wall radar)
 * and their modes; optics, night-vision optics and thermographs worn as
 * senses, with what they impose while in use; hydrophones, sound-detection
 * gear and the directional microphone.
 *
 * The rules Ultra-Tech prints too -- stretching range, slowed data, the cuts
 * in cities and for live video, the active sensors' range penalty and
 * emissions, magnification as Telescopic Vision -- are the shared engine's (`src/shared/sensors/`); this is the
 * book's gear and figures for it, and what it prints alone. Reaching a radio
 * of another range follows the supplement Electricity and Electronics
 * (`reception.ts`), which replaces High-Tech's size steps.
 */

import { telescopicLevels, type CommSize } from "../../../shared/sensors/rules.js";
import { GPR_SURVEY } from "./rangefinding.js";
import { mismatchedRange } from "./reception.js";

const MILE = 1760;

// ── Telegraphy (p. 36) ──

/** Every skill roll on an enciphered message is at -4 (p. 36). */
export const ENCIPHERED = -4;
/** Faking another operator's fist: a Quick Contest of Electronics Operation (Communications), the faker at -6 (p. 36). */
export const FAKE_FIST = -6;

/**
 * Tapping a telegraph line (p. 36): at TL5 an uncontested Electronics
 * Operation (Communications) roll; from TL6 the snoop must also win a Quick
 * Contest with the intended recipient, or alert him.
 */
export function tapIsContested(tl: number): boolean {
  return tl >= 6;
}

/** The telegraphs a record may be (p. 36). */
export function isTelegraph(name: string): boolean {
  return /^(telegraph key|register telegraph|automatic telegraph)$/i.test(String(name ?? "").trim());
}

// ── Radios (pp. 37-39) ──

export type RadioSize = "tiny" | "small" | "medium" | "large";

/** Each size's range in miles by TL (p. 38). There is no TL6 tiny radio. */
export const RADIO_RANGES: Readonly<Record<RadioSize, Partial<Record<number, number>>>> = Object.freeze({
  large: { 6: 50, 7: 100, 8: 200 },
  medium: { 6: 5, 7: 10, 8: 35 },
  small: { 6: 1, 7: 2, 8: 5 },
  tiny: { 7: 0.5, 8: 2 },
});

/**
 * The radio a record is: "Medium Radio (TL7)", or a hand-made "Medium Radio"
 * at the item's TL. Its range in yards is the table's at that TL, the
 * nearest TL printed where it prints none.
 */
export function radioByName(name: string, itemTl: number): { size: RadioSize; tl: number; range: number } | null {
  const match = /^(large|medium|small|tiny) radio(?: \(TL(\d+)\))?$/i.exec(String(name ?? "").trim());
  if (!match) return null;
  const size = match[1]!.toLowerCase() as RadioSize;
  const tl = match[2] ? Number(match[2]) : itemTl;
  const printed = Object.keys(RADIO_RANGES[size]).map(Number);
  const nearest = printed.reduce((best, t) => (Math.abs(t - tl) < Math.abs(best - tl) ? t : best), printed[0]!);
  return { size, tl, range: RADIO_RANGES[size][nearest]! * MILE };
}

/** The other communicators: the pocket laser communicator's beam, the diver's underwater set (p. 40). */
export const OTHER_COMMS: Readonly<Record<string, { family: string; size: CommSize; range: number; cuts: "water" | null }>> = Object.freeze({
  "Pocket Laser Communicator": { family: "laser", size: "tiny", range: MILE, cuts: null },
  "Diver Communicator": { family: "underwater", size: "small", range: 3000, cuts: "water" },
});

/** The pocket laser communicator's wide beam: half a mile, and it can be intercepted (p. 40). */
export const WIDE_BEAM = 0.5;
/** The military diver communicator: double the range, three times the cost and weight (p. 40). */
export const MILITARY_DIVECOM = Object.freeze({ range: 2, cost: 3, weight: 3 });

/**
 * The radio options (pp. 38-39): each multiplies the cost (the long antenna,
 * bought with the radio, a quarter of its cost and weight), from its TL; the
 * satellite uplink only for medium and large radios.
 */
export const RADIO_OPTIONS: Readonly<Record<string, { cost: number; weight?: number; tl: number; sizes?: readonly RadioSize[] }>> = Object.freeze({
  codeOnly: { cost: 0.5, tl: 6 },
  directionFinder: { cost: 5, tl: 6 },
  intercept: { cost: 5, tl: 6 },
  radiotelephone: { cost: 1.5, tl: 6 },
  eccm: { cost: 2, tl: 7 },
  gps: { cost: 2, tl: 8 },
  satelliteUplink: { cost: 2, tl: 8, sizes: ["medium", "large"] },
  longAntenna: { cost: 1.25, weight: 1.25, tl: 6 },
});

/** The options a radio of this size and TL may have. */
export function radioOptions(size: RadioSize, tl: number): string[] {
  return Object.entries(RADIO_OPTIONS).filter(([, o]) => tl >= o.tl && (!o.sizes || o.sizes.includes(size))).map(([key]) => key);
}

/** A long antenna doubles the radio's range (p. 39): the supplement's quarter-wave monopole (HT:EE p. 28). */
export const LONG_ANTENNA = 2;

/** One radio of a pair: its size and range, and what it was built with. */
export interface PairRadio {
  size: CommSize;
  range: number;
  longAntenna?: boolean;
  satelliteUplink?: boolean;
  /** What this end's antennas do for the link, as set (`antennaFactor`); where it's missing, the long antenna's double or nothing. */
  antenna?: number;
}

/**
 * The range between two radios. High-Tech started from the shorter range and
 * multiplied it by the size steps (p. 38); the supplement replaces that with
 * the square root of the product of the two ranges (HT:EE p. 28), which is
 * the same for two radios alike and more plausible across TLs. An antenna
 * at either end multiplies the link, and at both ends both count (HT:EE p.
 * 28): the long antenna doubles it (p. 39). A satellite uplink on either
 * reaches anywhere in the world (p. 39).
 */
export function radioPairRange(a: PairRadio, b: PairRadio): number {
  if (a.satelliteUplink || b.satelliteUplink) return Infinity;
  const factor = (r: PairRadio) => r.antenna ?? (r.longAntenna ? LONG_ANTENNA : 1);
  return mismatchedRange(a.range, b.range) * factor(a) * factor(b);
}

/** How far away a transmitting radio can be detected: twice its range, 1.5 times with ECCM (p. 39). */
export function radioDetectionRange(range: number, eccm: boolean): number {
  return range * (eccm ? 1.5 : 2);
}

// ── Triangulation (HT:EE p. 47, revising pp. 38-39) ──

/**
 * A radio direction finder's fix. High-Tech had it won in a Quick Contest of
 * Electronics Operation (Communications), exact on a margin of 5 (pp.
 * 38-39); the supplement Electricity and Electronics revises it as
 * triangulation (HT:EE p. 47), which this follows (decision E3 in #471):
 *
 *   - a basic or improvised direction finder plots the lines by hand: the
 *     lesser of Mathematics (Applied or Surveying) and Electronics Operation
 *     (EW)-2, with haste penalties for a signal on the air under a minute; a
 *     sophisticated system (HF/DF) rolls Electronics Operation (EW) as it is,
 *     with no haste;
 *   - the roll is at +6, plus the Size and Speed/Range Table's figure for the
 *     distance between the antennas as a bonus, less its figure for the
 *     distance to the source (p. B550);
 *   - three antennas are standard; two are at -2; one gives a direction but no
 *     distance, unless it is moved while the transmitter keeps sending and the
 *     two readings plotted alike, which Hobby Skill (Amateur Radio) can also
 *     do;
 *   - a Quick Contest with the transmitter's operator's Electronics Operation
 *     (EW) where the source is concealed, an unopposed roll where it isn't;
 *   - success finds the general area, with scatter (p. B414) of 20% of the
 *     range, 10% on a margin of 2, 5% on a margin of 4, and the exact spot on
 *     a margin of 6 or a critical success; a failure finds nothing, and a
 *     critical failure a wrong location.
 */
export const TRIANGULATION = Object.freeze({ bonus: 6, twoAntennas: -2, manualEw: -2, improvised: -5, signalSeconds: 60 });

/** The systems a fix is taken with: a basic direction finder, an improvised one (a loop or dipole), or HF/DF (HT:EE pp. 47-48). */
export type DfSystem = "basic" | "improvised" | "hfdf";

/** The antennas a fix is plotted from: three, two, one moved to a second spot, or one alone (HT:EE p. 47). */
export type DfAntennas = "three" | "two" | "moved" | "one";
export const DF_ANTENNAS: readonly DfAntennas[] = ["three", "two", "moved", "one"];

export const MATHEMATICS = ["Mathematics (Applied)", "Mathematics (Surveying)"] as const;
export const AMATEUR_RADIO = "Hobby Skill (Amateur Radio)";

/**
 * The level a fix is rolled at (HT:EE p. 47): HF/DF at Electronics Operation
 * (EW); a basic or improvised system at the lesser of the better Mathematics
 * and EW-2. A single antenna moved between readings may use Hobby Skill
 * (Amateur Radio) instead, where that is better. Null where the plotter has
 * no level to roll.
 */
export function triangulationLevel(options: { system: DfSystem; ew: number | null; mathematics: number | null; amateurRadio?: number | null; antennas: DfAntennas }): { level: number; skill: "ew" | "plotting" | "amateurRadio" } | null {
  const ew = options.ew;
  let best: { level: number; skill: "ew" | "plotting" | "amateurRadio" } | null = null;
  if (options.system === "hfdf") best = ew === null ? null : { level: ew, skill: "ew" };
  else if (ew !== null && options.mathematics !== null) best = { level: Math.min(options.mathematics, ew + TRIANGULATION.manualEw), skill: "plotting" };
  const hunt = options.antennas === "moved" ? options.amateurRadio ?? null : null;
  if (hunt !== null && (best === null || hunt > best.level)) best = { level: hunt, skill: "amateurRadio" };
  return best;
}

/**
 * The modifiers on a fix (HT:EE pp. 47-48): +6; the distance between the
 * antennas as a bonus and the distance to the source as a penalty, from the
 * Size and Speed/Range Table (`speedRange` gives its figure for yards); -2
 * for two antennas (or one moved); -5 for an improvised direction finder;
 * haste for a basic or improvised system when the signal stays on under a
 * minute (p. B346). `hasteFor` is the Basic Set's modifier for time spent.
 */
export function triangulationLines(
  options: { system: DfSystem; antennas: DfAntennas; baselineYards: number; distanceYards: number; signalSeconds: number },
  speedRange: (yards: number) => number,
  hasteFor: (spent: number, base: number) => number,
): Array<{ key: "bonus" | "baseline" | "distance" | "antennas" | "improvised" | "haste"; value: number }> {
  const lines: Array<{ key: "bonus" | "baseline" | "distance" | "antennas" | "improvised" | "haste"; value: number }> = [{ key: "bonus", value: TRIANGULATION.bonus }];
  if (options.baselineYards > 0) lines.push({ key: "baseline", value: -speedRange(options.baselineYards) });
  if (options.distanceYards > 0) lines.push({ key: "distance", value: speedRange(options.distanceYards) });
  if (options.antennas === "two" || options.antennas === "moved") lines.push({ key: "antennas", value: TRIANGULATION.twoAntennas });
  if (options.system === "improvised") lines.push({ key: "improvised", value: TRIANGULATION.improvised });
  const seconds = Number(options.signalSeconds) || 0;
  if (options.system !== "hfdf" && seconds > 0 && seconds < TRIANGULATION.signalSeconds) lines.push({ key: "haste", value: hasteFor(seconds, TRIANGULATION.signalSeconds) });
  return lines.filter((l) => l.value !== 0);
}

/** What a fix finds: the exact spot, the general area within a share of the range, nothing, or a wrong location (HT:EE p. 47). */
export type Fix = { kind: "exact" } | { kind: "area"; share: number } | { kind: "none" } | { kind: "wrong" };

/** A fix from its roll: the margin of success or victory, and whether it was a critical. */
export function triangulationFix(roll: { success: boolean; margin: number; criticalSuccess?: boolean; criticalFailure?: boolean }): Fix {
  if (!roll.success) return roll.criticalFailure ? { kind: "wrong" } : { kind: "none" };
  if (roll.criticalSuccess || roll.margin >= 6) return { kind: "exact" };
  return { kind: "area", share: roll.margin >= 4 ? 0.05 : roll.margin >= 2 ? 0.1 : 0.2 };
}

/** Electronics Operation (EW), for intercepting, defaults to Electronics Operation (Communications)-4 (p. 209). */
export const EW_FROM_COMM = -4;

/** The data rates the comm tool offers, and what each does for range (p. 38). */
export const DATA_RATES: readonly number[] = [1, 1 / 4, 1 / 100, 1 / 10000];

// ── Active sensors (pp. 45-46) ──

export type ActiveKind = "sonar" | "radar" | "gpr" | "thruWall";

export interface ActiveFigures {
  kind: ActiveKind;
  size?: "small" | "medium" | "large";
  /** Its range in yards at a TL. */
  range: (tl: number) => number;
  skill: string;
  /** The modes it may be bought with, and the TL each appears at. */
  modes: Readonly<Partial<Record<"tactical" | "lpi" | "imaging", number>>>;
  /** What a successful roll with it gives a skill it serves, where the record says (HT:EE p. 35). */
  survey?: number;
  /**
   * A second antenna the operator may sweep with, and how far it reaches in
   * yards: the supplement's GPR's high-frequency antenna (HT:EE p. 35).
   * `range` is the other, standard one's.
   */
  highFrequency?: number;
}

const SONAR = "Electronics Operation (Sonar)";
const SENSORS = "Electronics Operation (Sensors)";
/** Radar is doubled in range at TL8 (p. 46). */
const radar = (miles: number) => (tl: number) => miles * MILE * (tl >= 8 ? 2 : 1);
const RADAR_MODES = { tactical: 8, lpi: 8 } as const;

/** The active sensors by record name (pp. 45-47; HT:EE p. 35). */
export const ACTIVE_SENSORS: Readonly<Record<string, ActiveFigures>> = Object.freeze({
  // Large sonar: 4,000 yards at TL6, 8,000 at TL7, 20,000 at TL8.
  "Large Sonar": { kind: "sonar", size: "large", range: (tl) => (tl >= 8 ? 20000 : tl >= 7 ? 8000 : 4000), skill: SONAR, modes: { tactical: 6, imaging: 8 } },
  "Medium Sonar": { kind: "sonar", size: "medium", range: () => 2000, skill: SONAR, modes: { tactical: 6, imaging: 8 } },
  "Small Sonar": { kind: "sonar", size: "small", range: () => 100, skill: SONAR, modes: { imaging: 8 } },
  "Large Radar": { kind: "radar", size: "large", range: radar(100), skill: SENSORS, modes: RADAR_MODES },
  "Medium Radar": { kind: "radar", size: "medium", range: radar(15), skill: SENSORS, modes: RADAR_MODES },
  "Small Radar": { kind: "radar", size: "small", range: radar(3), skill: SENSORS, modes: RADAR_MODES },
  // A foot, and 10 yards (p. 46).
  "Handheld GPR": { kind: "gpr", range: () => 1 / 3, skill: "Electronics Operation (Scientific)", modes: {} },
  "Portable GPR": { kind: "gpr", range: () => 10, skill: "Electronics Operation (Scientific)", modes: {} },
  // A person 20 yards beyond a foot-thick wall (pp. 46-47).
  "Thru-Wall Radar": { kind: "thruWall", range: () => 20, skill: "Electronics Operation (Surveillance)", modes: {} },
  // The Electricity and Electronics supplement's (HT:EE p. 35): a handheld
  // sonar reaching 10 yards; a TL7 ground-penetrating radar on a tricycle
  // base, its low-frequency antenna reaching 50 yards down, whose successful
  // roll is +2 to a skill it serves; its high-frequency antenna reaches 10
  // yards, for a finer image.
  "Handheld Sonar": { kind: "sonar", size: "small", range: () => 10, skill: SONAR, modes: {} },
  "Ground-Penetrating Radar": { kind: "gpr", range: () => 50, skill: "Electronics Operation (Scientific)", modes: {}, survey: GPR_SURVEY, highFrequency: 10 },
});

/** The modes a sensor of this TL may have. */
export function activeModes(figures: ActiveFigures, tl: number): string[] {
  return Object.entries(figures.modes).filter(([, from]) => tl >= (from ?? 99)).map(([key]) => key);
}

/** A tactical or LPI sensor is five times the cost; imaging sonar five times the cost and twice the weight (p. 46). */
export const MODE_COST = Object.freeze({ tactical: 5, lpi: 5, imaging: 5 });
export const IMAGING_WEIGHT = 2;
/** Imaging sonar's range is a tenth of the normal (p. 46). */
export const IMAGING_RANGE = 0.1;
/** A TL8 radar weighs half as much (p. 46). */
export const TL8_RADAR_WEIGHT = 0.5;

/** Active sensors scan a 120-degree arc in front of them (p. 45). */
export const SENSOR_ARC = 120;

/** Sonar's ambient noise: -1 near noisy whales to -6 in a busy harbour (p. 45). */
export const SONAR_NOISE: readonly number[] = [0, -1, -2, -3, -4, -5, -6];

/** A tactical radar identifies its targets' general class out to a tenth of its range (p. 46). */
export const TACTICAL_IDENTIFY = 0.1;

/** What a GPR's range becomes in each medium: twenty times in ice, a tenth in concrete or rock (p. 46). */
export const GPR_MEDIUM: Readonly<Record<"soil" | "ice" | "rock", number>> = Object.freeze({ soil: 1, ice: 20, rock: 0.1 });

/** Which Quick Contest a stealthy target makes against radar: a jammer's operator's EW, or an infiltrator's Stealth (p. 46). */
export const COUNTERMEASURES: Readonly<Record<"jammer" | "stealth", string>> = Object.freeze({ jammer: "Electronics Operation (EW)", stealth: "Stealth" });

// ── Passive visual sensors (pp. 47-48) ──

export interface Optic {
  magnification: number;
  /** The level of Night Vision it gives. */
  nightVision?: number;
  /** A thermograph: Infravision. */
  thermal?: boolean;
  /** Works only with an IR illuminator lighting the scene. */
  needsIllumination?: boolean;
  /** Has its own IR illuminator. */
  illuminator?: boolean;
  /** Coated against laser light: Protected Vision. */
  protectedVision?: boolean;
  /** Anti-reflective screens against lens shine. */
  antiReflective?: boolean;
  /** Mechanically stabilized. */
  stabilized?: boolean;
  /** A camera or vehicle system, not an optic anyone wears. */
  mounted?: boolean;
}

/** The optics, night-vision optics and thermographs by record name (pp. 47-48). */
export const OPTICS: Readonly<Record<string, Optic>> = Object.freeze({
  "Binoculars (TL5)": { magnification: 4 },
  Spyglass: { magnification: 4 },
  "Binoculars (TL6)": { magnification: 6 },
  "Pocket Spyglass": { magnification: 4 },
  "Scissors Telescope": { magnification: 6 },
  "Spotting Scope": { magnification: 30 },
  "Military-Grade Binoculars (TL7)": { magnification: 10 },
  "Military-Grade Binoculars (TL8)": { magnification: 10, protectedVision: true, antiReflective: true },
  "Stabilized Binoculars": { magnification: 10, stabilized: true },
  "Early Night-Vision Binoculars": { magnification: 1, nightVision: 2, needsIllumination: true },
  "Night-Vision Binoculars (TL7)": { magnification: 16, nightVision: 4 },
  "Military Surplus Night-Vision Binoculars": { magnification: 1, nightVision: 4, illuminator: true },
  "Night-Vision Binoculars (TL8)": { magnification: 16, nightVision: 9 },
  // "Night Vision 7-9": the best of it, for the later models.
  "Night Vision Goggles": { magnification: 1, nightVision: 9 },
  "Thermal-Imaging Sensor": { magnification: 32, thermal: true, mounted: true },
  "Mini-Thermal Imager": { magnification: 1, thermal: true },
  "Thermal-Imaging Binoculars": { magnification: 8, thermal: true },
  "Thermal-Imaging Goggles": { magnification: 4, thermal: true },
  "Thermal-Imaging Surveillance Camera": { magnification: 4, thermal: true, mounted: true },
});

/** An IR source lighting the scene gives night-vision gear two more levels of Night Vision (p. 47). */
export const IR_NIGHT_VISION = 2;
/** Night-vision gear or a thermograph sees an active IR source as a light: +4 to locate it (p. 47). */
export const IR_LOCATE = 4;
/** A lens hood gives +4 to the Stealth roll against lens shine (p. 47). */
export const LENS_HOOD = 4;
/** A thermograph: +2 to Vision to spot a warm target, +3 to Tracking a trail under an hour old, -4 to tell like shapes apart (p. 48). */
export const THERMOGRAPH = Object.freeze({ spot: 2, tracking: 3, distinguish: -4 });
/** Stabilized binoculars cancel up to -3 in movement penalties (p. 47). */
export const STABILIZED = 3;

/** Every optic protects the eyes behind it with DR 1 (p. 47). */
export const OPTIC_EYE_DR = 1;

/**
 * The ride a Vision roll through a magnifying optic from a moving vehicle is
 * taken to be on. The Basic Set puts no movement penalty on Vision; the book
 * speaks of one (p. 47), and the table for shooting from a moving vehicle
 * (Campaigns p. 548) is the one there is: a handheld optic, read on its
 * middle row -- a bad road or calm water.
 */
export const OBSERVING_RIDE = "rough" as const;

/** A movement penalty after stabilization: up to -3 of it cancelled (p. 47), never a bonus. */
export function stabilizedPenalty(penalty: number, stabilized: boolean): number {
  const value = Math.min(0, Math.trunc(Number(penalty) || 0));
  return stabilized ? Math.min(0, value + STABILIZED) : value;
}

/** What a worn optic does for the senses (pp. 47-48). */
export function opticSenses(optic: Optic, illuminated: boolean): {
  nightVision: number;
  infravision: boolean;
  telescopic: number;
  protectedVision: boolean;
  imposed: boolean;
} | null {
  if (optic.mounted) return null;
  const base = optic.nightVision ?? 0;
  // Night-vision gear lit by an IR source gains two levels; the earliest works only when lit, at its own level.
  const nightVision = optic.needsIllumination ? (illuminated ? base : 0) : base ? Math.min(9, base + (illuminated ? IR_NIGHT_VISION : 0)) : 0;
  return {
    nightVision,
    infravision: optic.thermal === true,
    telescopic: telescopicLevels(optic.magnification),
    protectedVision: optic.protectedVision === true,
    // Colorblindness, No Depth Perception and No Peripheral Vision while using night-vision optics or a thermograph.
    imposed: Boolean(optic.nightVision || optic.thermal),
  };
}

/** Whether a record is night-vision gear, which an IR source helps (p. 47). */
export function isNightVision(optic: Optic | undefined): boolean {
  return Boolean(optic?.nightVision);
}

// ── Indirect passive sensors (pp. 48-50) ──

/** The hydrophones by record name: their detection bonus and the TL each appears at (p. 49). */
export const HYDROPHONES: Readonly<Record<string, { bonus: number; tl: number }>> = Object.freeze({
  "Large Hydrophone": { bonus: 4, tl: 6 },
  "Medium Hydrophone": { bonus: 2, tl: 6 },
  "Small Hydrophone": { bonus: 0, tl: 7 },
});

/** A hydrophone's bonus to Electronics Operation (Sonar) to detect: +2 for each TL after its introduction (p. 49). */
export function hydrophoneBonus(name: string, tl: number): number | null {
  const figures = HYDROPHONES[String(name ?? "").trim()];
  return figures ? figures.bonus + 2 * Math.max(0, tl - figures.tl) : null;
}

/** A search hydrophone costs a tenth and gives no +3 to hit (p. 49). */
export const SEARCH_HYDROPHONE_COST = 0.1;
/** A hydrophone's fix: +8 to identify the target, +4 to shadow it, +3 to hit it with an aimed attack (p. 49). */
export const HYDROPHONE_FIX = Object.freeze({ identify: 8, shadow: 4, hit: 3 });

/**
 * A hydrophone's detection roll (p. 49): the target's size and speed as
 * bonuses and its range as a penalty, each looked up apart on the Size and
 * Speed/Range Table, and the current's speed as a penalty too.
 * `speedRange` is the table's penalty for a distance or speed in yards.
 */
export function hydrophoneModifiers(options: { sm: number; speed: number; range: number; current: number }, speedRange: (yards: number) => number): Array<{ key: "size" | "speed" | "range" | "current"; value: number }> {
  const lines: Array<{ key: "size" | "speed" | "range" | "current"; value: number }> = [
    { key: "size", value: options.sm },
    { key: "speed", value: options.speed > 0 ? -speedRange(options.speed) : 0 },
    { key: "range", value: options.range > 0 ? speedRange(options.range) : 0 },
    { key: "current", value: options.current > 0 ? speedRange(options.current) : 0 },
  ];
  return lines.filter((l) => l.value !== 0);
}

/**
 * What a hydrophone fix carries to an attack it directs (p. 49): the
 * detection roll's own modifiers -- the target's size and speed, the range,
 * the current -- but never a bonus. The hydrophone's bonus to detect is the
 * gear's, not the target's, and stays with the detection.
 */
export function hydrophoneFixPenalty(lines: ReadonlyArray<{ value: number }>): number {
  return Math.min(0, lines.reduce((sum, l) => sum + (Number(l.value) || 0), 0));
}

/** A sound detector: +4 to Electronics Operation (Sensors) to analyze and identify a sound (p. 49). */
export const SOUND_IDENTIFY = 4;

/** Where a sound detector works: in air only, not underwater or in vacuum (p. 49). */
export const SOUND_MEDIA = ["air", "water", "vacuum"] as const;
export type SoundMedium = (typeof SOUND_MEDIA)[number];

/**
 * Whether sound detectors at several sites have fixed a source (p. 49):
 * successes at three sites, or a success at one and a critical success at
 * another.
 */
export function soundTriangulated(results: ReadonlyArray<"success" | "critical" | "failure">): boolean {
  const successes = results.filter((r) => r !== "failure").length;
  return successes >= 3 || (successes >= 2 && results.includes("critical"));
}

/** The detectors the book prints with no roll of their own, by record name (pp. 48-50), for their sheet lines. */
export const DETECTORS: ReadonlyArray<[RegExp, string]> = [
  [/^chemical test kit$/i, "testKit"],
  [/^handheld detector$/i, "handheld"],
  [/^portable nbc detector$/i, "nbc"],
  [/^geiger counter\b/i, "geiger"],
  [/^radiation badge$/i, "badge"],
  [/^personal dosimeter$/i, "dosimeter"],
  [/^metal detector$/i, "metal"],
];

/** A detector's key, or null. */
export function detectorOf(name: string): string | null {
  return DETECTORS.find(([pattern]) => pattern.test(String(name ?? "").trim()))?.[1] ?? null;
}

/** A Geiger counter's reading gives a clue to the source on Electronics Operation (Scientific) (p. 49). */
export const GEIGER_SKILL = "Electronics Operation (Scientific)";

/** The metal detector: up to 20" down, 6" for small things; half the weight at TL8 (p. 50). */
export const METAL_DETECTOR = Object.freeze({ inches: 20, smallInches: 6, tl8Weight: 0.5 });

/**
 * Sound-detection gear locating a sound (p. 49): a 100-decibel source at 10
 * miles is found within two yards; +1 per mile closer or 10 decibels louder,
 * -1 per mile farther or 10 decibels fainter.
 */
export function soundLocationModifier(miles: number, decibels: number): number {
  return Math.trunc(10 - miles) + Math.trunc((decibels - 100) / 10);
}

/** The sound detectors by record name (pp. 49-50). */
export function isSoundDetector(name: string): boolean {
  return /^sound-detection gear$/i.test(String(name ?? "").trim());
}

/** A directional microphone amplifies a sound 4 times at TL7 and 8 at TL8: Parabolic Hearing's doublings (p. 50). */
export function directionalMicLevels(name: string, tl: number): number | null {
  if (!/^directional microphone$/i.test(String(name ?? "").trim())) return null;
  return Math.log2(tl >= 8 ? 8 : 4);
}
