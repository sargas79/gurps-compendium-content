/**
 * High-Tech's communications and sensors (pp. 36-50), registered with the
 * system through the add-on API: the book's table for the shared comms and
 * sensors engine (`src/shared/sensors/`), which does the pricing, the item
 * sheet section, the comm and sweep GM tools, the lock and worn optics as
 * senses, and what this book prints alone.
 *
 *   - **radios:** a radio's range by size and TL, reaching one of another
 *     size, stretching it, slowed data, cities, underground and live video,
 *     the long antenna and the satellite uplink on the comm tool; the radio
 *     options priced (code-only, direction finder, intercept, radiotelephone,
 *     receive-only, ECCM, GPS, uplink, long antenna), and the pocket laser
 *     and diver communicators; a row button for telegraphy -- sending,
 *     enciphering, recognizing and faking a fist, tapping a line -- and for a
 *     direction finder's fix and an intercept (pp. 36-40). Two different
 *     radios reach the square root of the product of their ranges, as the
 *     supplement Electricity and Electronics revises the rule (HT:EE p. 28),
 *     and an antenna at either end multiplies the link.
 *   - **radioTuning** (HT:EE pp. 27, 29-30): the tuning roll to pick up a
 *     faint signal or one through interference -- the range past standard,
 *     interference or good conditions, the listener's Hearing modifiers or a
 *     galvanometer, a software-defined radio's +4 -- in the comm tool and as
 *     a row button, and a coil-tuned set's drift; the radio peripheral.
 *   - **radioAntennas** (HT:EE p. 28): the dipole and the directional
 *     antenna beside High-Tech's long antenna (the monopole), priced, and in
 *     the comm tool the dipole's bearing and the aiming roll.
 *   - **shortwaveSkip** (HT:EE p. 30): the shortwave option, and in the comm
 *     tool a signal skipping off the upper atmosphere: 2,000 miles a skip,
 *     -1 each further skip, -2 for each of a bad time of day, summer and a
 *     solar flare.
 *   - **radioDesign** (HT:EE pp. 28-30, 32, 34): how a radio is built
 *     (`design.ts`) -- spark gap and its detectors and transmitters,
 *     send-only, quartz tuning, the grid-leak, regenerative and
 *     superheterodyne receivers, audio, FM, video and digital video --
 *     priced, the receivers' range and rolls in the comm tool and the
 *     tuning roll, and the trench radio kit's sets and wire.
 *   - **activeSensors:** sonar, radar, GPR and thru-wall radar by TL, their
 *     modes priced, and a sweep at -2 per doubling past range, within the
 *     sensor's arc, with sonar's noise, a GPR's medium, and the Quick Contest
 *     against a jammer or an infiltrator; a tactical sensor locks on for +3,
 *     on top of any targeting software (pp. 45-47).
 *   - **rangefindingEmissions:** the supplement's refinements (HT:EE p. 35):
 *     the sweep's penalty in half steps, the target's size at half its SM,
 *     and dwelling 4 or 15 times as long to reach 2 or 4 times as far, which
 *     helps the target detect the emissions; a GM tool for detecting a
 *     sonar's or radar's emissions, past twice its range at -1 per 20% of it
 *     to -10; and the supplement's ground-penetrating radar's +2 to a skill.
 *   - **visualSensors:** optics as Telescopic Vision, night-vision optics and
 *     thermographs as Night Vision and Infravision with the Colorblindness,
 *     No Depth Perception and No Peripheral Vision they impose while in use;
 *     IR illumination; a thermograph's +2 to spot a warm target and +3 to
 *     Tracking; and a row button for the Stealth roll against lens shine
 *     (pp. 47-48).
 *   - **passiveSensors:** a hydrophone's detection roll, and its fix's +3 to
 *     hit and +4 to shadow; sound-detection gear identifying or locating a
 *     sound; a directional microphone as Parabolic Hearing (pp. 48-50).
 *
 * Under `radios`, the direction finder's fix is the supplement's
 * triangulation (HT:EE p. 47, revising pp. 38-39; decision E3 in #471). The
 * supplement's electronic-warfare switches add to the radios here (HT:EE pp.
 * 46-48): **spreadSpectrum** reads the ECCM option as frequency hopping and
 * adds direct sequence; **signalsIntelligence** adds the RDF and HF/DF
 * options, whose rolls are in `../sigint/`; **cipherMachines** lets extra
 * time offset the -4 for sending enciphered text.
 */

import { isRuleOn } from "../../../shared/book-tables.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  F as SF,
  SENSOR_TABLES,
  ask,
  card,
  carried,
  distanceText,
  esc,
  initSensors,
  itemTl,
  lockTargetOf,
  lockedSensor,
  picked,
  readySensors,
  row,
  sensorData,
  setLock,
  skillBase,
  worn,
  yardsBetween,
  type SensorTable,
} from "../../../shared/sensors/index.js";
import type { Comm, CommContext, CommPair, CommReception, SensorData, SensorFigures, SensorParts, SweepContext, WornSenses } from "../../../shared/sensors/data.js";
import { activeRangePenalty, emissionDetectionRange, rangeExtensionModifier, slowedRangeFactor, type CommMode } from "../../../shared/sensors/rules.js";
import {
  ANTENNAS,
  CONDITIONS,
  DRIFT_MINUTES,
  INTERFERENCE,
  RADIO_PERIPHERALS,
  SKIP_CONDITIONS,
  aimsItself,
  antennaFactor,
  driftsByDefault,
  hasLargeAntenna,
  skipApplies,
  skipLines,
  skipsFor,
  tuningRoll,
  type AntennaKey,
  type AntennaSetting,
  type SkipCondition,
} from "./reception.js";
import {
  ACTIVE_SENSORS,
  COUNTERMEASURES,
  DATA_RATES,
  ENCIPHERED,
  EW_FROM_COMM,
  FAKE_FIST,
  GPR_MEDIUM,
  HYDROPHONE_FIX,
  IMAGING_RANGE,
  IMAGING_WEIGHT,
  IR_LOCATE,
  LENS_HOOD,
  MILITARY_DIVECOM,
  MODE_COST,
  OPTICS,
  OTHER_COMMS,
  RADIO_OPTIONS,
  SEARCH_HYDROPHONE_COST,
  SENSOR_ARC,
  SONAR_NOISE,
  SOUND_IDENTIFY,
  STABILIZED,
  TACTICAL_IDENTIFY,
  THERMOGRAPH,
  TL8_RADAR_WEIGHT,
  WIDE_BEAM,
  AMATEUR_RADIO,
  DF_ANTENNAS,
  MATHEMATICS,
  TRIANGULATION,
  activeModes,
  directionalMicLevels,
  triangulationFix,
  triangulationLevel,
  triangulationLines,
  type DfAntennas,
  type DfSystem,
  hydrophoneBonus,
  hydrophoneModifiers,
  isNightVision,
  isSoundDetector,
  isTelegraph,
  opticSenses,
  radioByName,
  radioDetectionRange,
  radioOptions,
  radioPairRange,
  soundLocationModifier,
  tapIsContested,
  type ActiveFigures,
  type RadioSize,
} from "./rules.js";
import { instrumentOf, isGalvanometer } from "../instruments/rules.js";
import {
  DESIGN_KEYS,
  DISTORTED_AUDIO,
  GROUND_AERIAL,
  OSCILLATION,
  PRINTED_RADIOS,
  REGENERATIVE_MISS,
  crystalSpot,
  cuttingEdgeDesign,
  designActive,
  designFactors,
  designOffered,
  isSparkGap,
  qualityBonus,
  regenerativeAdjustment,
  type DesignInput,
  type DesignKey,
} from "./design.js";
import { cuttingEdgeFactor } from "../devices/rules.js";
import { deviceData } from "../devices/index.js";
import { registerPowerAdjuster } from "../../../shared/power/data.js";
import {
  DIRECT_SEQUENCE,
  FREQUENCY_HOPPING,
  INTERCEPT_ROUTINE,
  OSCILLOSCOPE,
  SIGINT_OPTIONS,
  directSequenceTuning,
  encipheredTimeBonus,
  spreadDetectModifier,
  spreadDetectionRange,
  type Spread,
} from "../sigint/rules.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import { DETECTOR_SKILLS, DWELL, detectorSkill, dwellRange, emissionModifier, emissionReach, rangefindingPenalty, sensorSizeModifier, type Dwell } from "./rangefinding.js";

const NS = "GCC.HT";
const L = (key: string) => game.i18n.localize(`${NS}.Sensor.${key}`);
const F = (key: string, data: Record<string, unknown>) => SF(NS, key, data);
const distance = (yards: number) => distanceText(NS, yards);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const COMM = "Electronics Operation (Communications)";
const EW = "Electronics Operation (EW)";

/** The book's switches, as full keys: its four, and the three the supplement Electricity and Electronics adds to its radios. */
export interface SensorSwitches {
  radios: string;
  activeSensors: string;
  visualSensors: string;
  passiveSensors: string;
  /** The supplement's refinements to the active sensors (HT:EE p. 35). */
  rangefindingEmissions?: string;
  radioTuning?: string;
  radioAntennas?: string;
  shortwaveSkip?: string;
  radioDesign?: string;
  /** The supplement's electronic warfare (HT:EE pp. 46-48). */
  spreadSpectrum?: string;
  signalsIntelligence?: string;
  cipherMachines?: string;
}

/** The supplement's rangefinding switch's full key, once registered. */
let rangefindingKey: string | null = null;
const rangefindingOn = () => rangefindingKey !== null && isRuleOn(rangefindingKey);

/** A sensor whose emissions a detector can pick up: sonar and radar (High-Tech p. 45; HT:EE p. 35). */
const emits = (figures: ActiveFigures | undefined) => figures?.kind === "sonar" || figures?.kind === "radar";

/** The supplement's radio switches, as full keys, once the table is built. */
const SUPPLEMENT = { tuning: "", antennas: "", shortwave: "", design: "", spread: "", sigint: "", cipher: "" };
/** Whether one of the supplement's switches that add to the radios is on. */
export const supplementOn = (part: keyof typeof SUPPLEMENT) => Boolean(SUPPLEMENT[part]) && isRuleOn(SUPPLEMENT[part]);

const nameOf = (item: any) => String(item?.name ?? "").trim();

/**
 * The radio a record is, at its TL: one of the radios by name, or where the
 * supplement's design rules are on, one of the trench radio's sets (HT:EE p.
 * 29), read as the set it's built on.
 */
export function radioOf(item: any): { size: RadioSize; tl: number; range: number } | null {
  const radio = radioByName(nameOf(item), itemTl(item));
  if (radio) return radio;
  const printed = supplementOn("design") ? PRINTED_RADIOS[nameOf(item)] : undefined;
  return printed ? { size: printed.size, tl: printed.tl, range: printed.range } : null;
}

/** A record the supplement prints: its radios are priced for code alone (HT:EE p. 27). */
const fromSupplement = (item: any) => /Electricity and Electronics/i.test(String(item?.system?.reference ?? ""));

/** A radio as the design rules read it, where `radioDesign` is on (HT:EE pp. 28-30, 32, 34). */
function designOf(item: any, data: SensorData = sensorData(item)): DesignInput | null {
  if (!supplementOn("design")) return null;
  const radio = radioOf(item);
  if (!radio) return null;
  return { tl: itemTl(item), size: radio.size, commMode: data.commMode, codePrinted: fromSupplement(item) || Boolean(PRINTED_RADIOS[nameOf(item)]), codeOnly: data.options.codeOnly === true, options: data.options };
}

/** The design options that count on a radio, where `radioDesign` is on. */
function designed(item: any, data: SensorData = sensorData(item)): DesignKey[] {
  const input = designOf(item, data);
  return input ? designActive(input) : [];
}

/**
 * An antenna of its own a character carries for their radios: gear that
 * isn't a comm and is set as a dipole, as the trench radio kit's wire is
 * (HT:EE pp. 28-29).
 */
function carriedAntenna(actor: any): any {
  if (!actor || !supplementOn("design")) return null;
  return [...(actor.items ?? [])].find((i: any) => carried(i) && isAntenna(i)) ?? null;
}

/** Gear that is a dipole antenna and nothing else: the trench radio kit's wire (HT:EE p. 29). */
const isAntenna = (item: any) => sensorData(item).options.dipoleAntenna === true && !radioOf(item) && !peripheralOf(item) && !OTHER_COMMS[nameOf(item)];

/** The radio peripheral a record is: a computer as a software-defined radio (HT:EE p. 30). */
export const peripheralOf = (item: any) => RADIO_PERIPHERALS[nameOf(item)] ?? null;

/**
 * A radio's spread spectrum, where the switch is on (HT:EE pp. 46-47): the
 * ECCM option as frequency hopping from TL7, direct sequence from TL8.
 */
export function spreadOf(item: any, data: SensorData = sensorData(item)): Spread {
  if (!supplementOn("spread") || !radioOf(item)) return {};
  const tl = itemTl(item);
  return { hopping: tl >= FREQUENCY_HOPPING.tl && data.options.eccm === true, direct: tl >= DIRECT_SEQUENCE.tl && data.options.directSequence === true };
}

/** The SIGINT gear a radio was built with, where the switch is on (HT:EE p. 48): the RDF and HF/DF options from their TLs. */
export function sigintGearOf(item: any, data: SensorData = sensorData(item)): { rdf: boolean; hfdf: boolean } {
  if (!supplementOn("sigint") || !radioOf(item)) return { rdf: false, hfdf: false };
  const tl = itemTl(item);
  return { rdf: tl >= SIGINT_OPTIONS.rdf.tl && data.options.rdf === true, hfdf: tl >= SIGINT_OPTIONS.hfdf.tl && data.options.hfdf === true };
}

/** A radio that takes fixes: High-Tech's direction finder, or the supplement's RDF or HF/DF (High-Tech pp. 38-39; HT:EE p. 48). */
export function findsDirection(item: any): boolean {
  if (!radioOf(item)) return false;
  const gear = sigintGearOf(item);
  return sensorData(item).options.directionFinder === true || gear.rdf || gear.hfdf;
}

/** The antennas a radio was built with that count: the long antenna under `radios`, the dipole and directional antenna under `radioAntennas` from their TLs (HT:EE p. 28). */
export function antennasOf(item: any, data: SensorData = sensorData(item)): Partial<Record<AntennaKey, boolean>> {
  const tl = itemTl(item);
  const more = supplementOn("antennas");
  return {
    longAntenna: data.options.longAntenna === true,
    // A dipole of its own, or a wire its owner carries strung as one (HT:EE pp. 28-29).
    dipoleAntenna: (more && tl >= ANTENNAS.dipoleAntenna.tl && data.options.dipoleAntenna === true) || (tl >= ANTENNAS.dipoleAntenna.tl && Boolean(carriedAntenna(item?.actor))),
    directionalAntenna: more && tl >= ANTENNAS.directionalAntenna.tl && data.options.directionalAntenna === true,
  };
}

/** A shortwave set, where the switch is on (HT:EE p. 30). */
const isShortwave = (item: any, data: SensorData = sensorData(item)) => supplementOn("shortwave") && Boolean(radioOf(item)) && itemTl(item) >= 6 && data.options.shortwave === true;

/** A comm's range in yards, with the options that change it: a long antenna's double, the laser's wide beam, the military divecom (pp. 39-40). */
function commOfItem(item: any): Comm | null {
  const data = sensorData(item);
  const radio = radioOf(item);
  // A detector or a grid-leak receiver cuts the set's own range (HT:EE pp. 28-29).
  if (radio) {
    const input = designOf(item, data);
    return { family: "radio", size: radio.size, range: radio.range * (input ? designFactors(input).range : 1), cuts: "radio" };
  }
  const peripheral = peripheralOf(item);
  if (peripheral) return { family: "radio", size: "medium", range: peripheral.range, cuts: "radio" };
  const other = OTHER_COMMS[nameOf(item)];
  if (!other) return null;
  let range = other.range;
  if (other.family === "laser" && data.options.wideBeam) range *= WIDE_BEAM;
  if (other.family === "underwater" && data.options.military) range *= MILITARY_DIVECOM.range;
  return { family: other.family, size: other.size, range, cuts: other.cuts };
}

/** An active sensor's figures by its record's name. */
const activeFigures = (item: any): ActiveFigures | undefined => ACTIVE_SENSORS[nameOf(item)];

/** An optic worn as a sense. */
const opticOf = (item: any) => OPTICS[nameOf(item)];

function commLines(item: any, data: SensorData, lines: string[], options: string[]): boolean {
  const tl = itemTl(item);
  if (isTelegraph(nameOf(item))) {
    lines.push(L("TelegraphLine"));
    return false;
  }
  const radio = radioOf(item);
  const comm = commOfItem(item);
  if (!comm || comm.range === null) return false;
  if (radio) {
    const antenna = data.options.longAntenna;
    const range = comm.range * (antenna ? 2 : 1);
    lines.push(F("RadioRange", { range: distance(comm.range), tl: radio.tl }));
    if (radio.size === "large") lines.push(L("LargeSetUp"));
    if (antenna) lines.push(L("LongAntennaLine"));
    if (data.options.satelliteUplink) lines.push(L("UplinkLine"));
    const spread = spreadOf(item, data);
    // With spread spectrum, the supplement's detection: twice the range, 1.5 times with direct sequence (HT:EE pp. 46-47).
    lines.push(F("Detected", { range: distance(supplementOn("spread") ? spreadDetectionRange(range, spread) : radioDetectionRange(range, data.options.eccm === true)) }));
    lines.push(L("RadioInUse"));
    lines.push(F("SlowedData", { quarter: slowedRangeFactor(1 / 4), hundredth: slowedRangeFactor(1 / 100), tenThousandth: slowedRangeFactor(1 / 10000) }));
    if (data.options.codeOnly) lines.push(L("CodeOnlyLine"));
    if (data.options.directionFinder) lines.push(L("DirectionFinderLine"));
    if (data.options.intercept) lines.push(L("InterceptLine"));
    if (data.options.eccm) lines.push(spread.hopping ? F("HoppingLine", { detect: FREQUENCY_HOPPING.detect, jamming: signed(FREQUENCY_HOPPING.jamming) }) : L("EccmLine"));
    if (data.options.gps) lines.push(L("GpsLine"));
    if (data.options.radiotelephone) lines.push(L("RadiotelephoneLine"));
    if (data.commMode) lines.push(L(`CommMode.${data.commMode}`));
    // The supplement's radios are printed for code already (HT:EE p. 27): High-Tech's code-only option would halve them twice.
    options.push(...radioOptions(radio.size, tl).filter((key) => key !== "codeOnly" || !fromSupplement(item)));
    supplementLines(item, data, lines, options);
    return true;
  }
  if (peripheralOf(item)) {
    lines.push(F("PeripheralRange", { range: distance(comm.range) }));
    if (supplementOn("tuning")) lines.push(F("EnhancedTuningLine", { bonus: 4 }));
    return false;
  }
  lines.push(F(comm.family === "laser" ? "LaserRange" : "DivecomRange", { range: distance(comm.range) }));
  if (comm.family === "laser") {
    lines.push(L(data.options.wideBeam ? "WideBeamLine" : "NarrowBeamLine"));
    options.push("wideBeam");
  } else {
    lines.push(L("DivecomLine"));
    options.push("military");
  }
  return false;
}

/** What the supplement's switches add to a radio's sheet: its antennas, shortwave and tuning, spread spectrum and SIGINT gear (HT:EE pp. 28-30, 46-48). */
function supplementLines(item: any, data: SensorData, lines: string[], options: string[]): void {
  const tl = itemTl(item);
  if (supplementOn("spread") && tl >= DIRECT_SEQUENCE.tl) {
    options.push("directSequence");
    if (spreadOf(item, data).direct) lines.push(F("DirectSequenceLine", { detection: DIRECT_SEQUENCE.detection, jamming: signed(DIRECT_SEQUENCE.jamming) }));
  }
  if (supplementOn("sigint")) {
    const gear = sigintGearOf(item, data);
    for (const key of ["rdf", "hfdf"] as const) if (tl >= SIGINT_OPTIONS[key].tl) options.push(key);
    if (data.options.intercept) lines.push(F("InterceptUnitLine", { bonus: signed(INTERCEPT_ROUTINE) }));
    if (gear.rdf) lines.push(L("RdfLine"));
    if (gear.hfdf) lines.push(L("HfdfLine"));
    lines.push(L("SigintLine"));
  }
  if (supplementOn("antennas")) {
    const has = antennasOf(item, data);
    if (tl >= ANTENNAS.dipoleAntenna.tl) options.push("dipoleAntenna");
    if (tl >= ANTENNAS.directionalAntenna.tl) options.push("directionalAntenna");
    if (has.dipoleAntenna) lines.push(F("DipoleLine", { factor: ANTENNAS.dipoleAntenna.range }));
    if (has.directionalAntenna) lines.push(F(aimsItself(tl) ? "DirectionalLineAuto" : "DirectionalLine", { factor: ANTENNAS.directionalAntenna.range }));
  }
  if (supplementOn("shortwave") && tl >= 6) {
    options.push("shortwave");
    if (isShortwave(item, data)) lines.push(L(hasLargeAntenna(antennasOf(item, data)) ? "ShortwaveLine" : "ShortwaveNoAntenna"));
  }
  if (supplementOn("tuning")) lines.push(drifts(item, data) ? F("TuningDrift", { minutes: DRIFT_MINUTES }) : L("TuningLine"));
  designLines(item, data, lines, options);
}

/** Whether a set drifts unless the GM says otherwise: coil-tuned, and not quartz-tuned, a superheterodyne or a spark gap's few switched frequencies (HT:EE p. 29). */
function drifts(item: any, data: SensorData = sensorData(item)): boolean {
  if (peripheralOf(item) || !driftsByDefault(itemTl(item))) return false;
  const input = designOf(item, data);
  if (!input) return true;
  const active = designActive(input);
  return !isSparkGap(input) && !active.includes("quartzTuning") && !active.includes("superheterodyne");
}

/** What `radioDesign` adds to a radio's sheet: the options its TL, size and build offer, and what those it has do (HT:EE pp. 28-30, 32, 34). */
function designLines(item: any, data: SensorData, lines: string[], options: string[]): void {
  const input = designOf(item, data);
  if (!input) return;
  options.push(...designOffered(input));
  const active = designActive(input);
  if (PRINTED_RADIOS[nameOf(item)]) lines.push(L("PrintedBuild"));
  if (isSparkGap(input)) {
    lines.push(L("SparkGapLine"));
    if (!input.commMode) lines.push(L("SparkGapEnds"));
    if (input.commMode === "transmitter" && input.size !== "large") lines.push(L("SparkGapLarge"));
    if (input.commMode === "transmitter" && !active.includes("wideband")) lines.push(L("WidebandRequired"));
  } else if (input.codePrinted) lines.push(L(active.some((k) => k === "audio" || k === "video" || k === "digitalVideo") ? "CarriesAudio" : "CodePrinted"));
  for (const key of active) {
    if (key === "sparkGap" || key === "audio") continue;
    if (key === "regenerative") lines.push(F("RegenerativeLine", { penalty: OSCILLATION.penalty, yards: OSCILLATION.yards }));
    else if (key === "ultraRotarySparkGap") lines.push(F("UltraRotaryLine", { bonus: qualityBonus([key]), penalty: DISTORTED_AUDIO }));
    else if (key === "rotarySparkGap") lines.push(F("RotaryLine", { bonus: qualityBonus([key]) }));
    else lines.push(L(`Design.${key}`));
  }
  if (cuttingEdgeDesign(input)) lines.push(L(deviceData(item).cuttingEdge ? "DesignCuttingEdgeMarked" : "DesignCuttingEdge"));
}

/** The trench radio kit's wire on its own sheet: a dipole for its owner's radios, which may lie on the ground (HT:EE p. 29). */
function antennaLines(data: SensorData, lines: string[], options: string[]): void {
  lines.push(F("AntennaWireLine", { factor: ANTENNAS.dipoleAntenna.range }));
  if (data.options.groundAerial) lines.push(F("GroundAerialLine", { penalty: GROUND_AERIAL }));
  options.push("groundAerial");
}

function activeLines(item: any, data: SensorData, lines: string[], options: string[]): void {
  const figures = activeFigures(item)!;
  const tl = itemTl(item);
  const range = figures.range(tl);
  const lpi = data.options.lpi === true;
  lines.push(F("ActiveRange", { range: distance(lpi ? range / 2 : range), tl, skill: figures.skill }));
  if (data.options.imaging) lines.push(F("ImagingRange", { range: distance(range * IMAGING_RANGE) }));
  if (figures.kind === "sonar" || figures.kind === "radar") lines.push(F("Emissions", { range: distance(emissionDetectionRange(range, lpi)), arc: SENSOR_ARC }));
  if (figures.kind === "sonar") lines.push(L("SonarLine"));
  if (figures.kind === "radar") lines.push(L("RadarLine"));
  if (figures.kind === "gpr") lines.push(L("GprLine"));
  if (figures.kind === "thruWall") lines.push(L("ThruWallLine"));
  if (data.options.tactical) lines.push(F(figures.kind === "radar" ? "TacticalRadar" : "TacticalSonar", { range: distance(range * TACTICAL_IDENTIFY) }));
  if (rangefindingOn()) {
    lines.push(F("Rangefinding", { x4: DWELL.x4.time, x15: DWELL.x15.time, d4: DWELL.x4.detect, d15: DWELL.x15.detect }));
    if (emits(figures)) lines.push(F("EmissionReach", { range: distance(emissionReach(range, lpi)) }));
    if (figures.survey) lines.push(F("SurveyLine", { bonus: signed(figures.survey) }));
  }
  options.push(...activeModes(figures, tl));
}

function visualLines(item: any, data: SensorData, lines: string[], options: string[]): void {
  const optic = opticOf(item)!;
  const tl = itemTl(item);
  const lit = data.options.irIlluminated === true;
  const senses = opticSenses({ ...optic, mounted: false }, lit)!;
  if (optic.magnification > 1) lines.push(F("Magnification", { magnification: optic.magnification, levels: senses.telescopic }));
  if (optic.nightVision) lines.push(optic.needsIllumination ? F("NightVisionLit", { level: optic.nightVision }) : F("NightVision", { level: senses.nightVision }));
  if (optic.thermal) {
    lines.push(F("Thermograph", { spot: signed(THERMOGRAPH.spot), tracking: signed(THERMOGRAPH.tracking), distinguish: THERMOGRAPH.distinguish }));
    lines.push(L(tl >= 8 ? "WarmUpFast" : "WarmUpSlow"));
  }
  if (senses.imposed) lines.push(L("Imposed"));
  if (optic.mounted) lines.push(L("Mounted"));
  if (optic.protectedVision) lines.push(L("ProtectedVisionLine"));
  if (optic.stabilized) lines.push(F("StabilizedLine", { penalty: STABILIZED }));
  if (optic.illuminator) lines.push(L("IlluminatorLine"));
  lines.push(F(optic.antiReflective || data.options.lensHood ? "LensShineHooded" : "LensShine", { bonus: signed(LENS_HOOD) }));
  if (isNightVision(optic)) options.push("irIlluminated");
  if (!optic.antiReflective) options.push("lensHood");
}

function passiveLines(item: any, data: SensorData, lines: string[], options: string[]): boolean {
  const name = nameOf(item);
  const tl = itemTl(item);
  const bonus = hydrophoneBonus(name, tl);
  if (bonus !== null) {
    lines.push(F(data.options.search ? "SearchHydrophone" : "Hydrophone", { bonus: signed(bonus), tl, identify: HYDROPHONE_FIX.identify, shadow: HYDROPHONE_FIX.shadow, hit: HYDROPHONE_FIX.hit }));
    lines.push(L("HydrophoneHears"));
    options.push("search");
    return true;
  }
  if (isSoundDetector(name)) {
    lines.push(F("SoundDetector", { bonus: SOUND_IDENTIFY }));
    return true;
  }
  const levels = directionalMicLevels(name, tl);
  if (levels !== null) {
    lines.push(F("DirectionalMic", { factor: 2 ** levels, levels }));
    return true;
  }
  return false;
}

/** The comm's or sensor's lines and options on its item sheet, or null where none of the book's switches that apply is on. */
function sheet(item: any, data: SensorData, on: SensorParts): { lines: string[]; modes: boolean; options: string[] } | null {
  const lines: string[] = [];
  const options: string[] = [];
  let modes = false;
  let shown = false;
  if (on.comms && (commOfItem(item) || isTelegraph(nameOf(item)))) {
    modes = commLines(item, data, lines, options);
    shown = true;
  } else if (on.comms && supplementOn("design") && isAntenna(item)) {
    antennaLines(data, lines, options);
    shown = true;
  }
  if (on.active && activeFigures(item)) {
    activeLines(item, data, lines, options);
    shown = true;
  }
  if (on.visual && opticOf(item)) {
    visualLines(item, data, lines, options);
    shown = true;
  }
  if (on.passive && passiveLines(item, data, lines, options)) shown = true;
  return shown ? { lines, modes, options } : null;
}

/** What the radio options, receive-only, the communicators' versions and the sensor modes do to price and weight (pp. 38-40, 46, 49). */
function price(item: any, data: SensorData, on: SensorParts): { cost: number; weight: number } | null {
  let cost = 1;
  let weight = 1;
  let applies = false;
  const tl = itemTl(item);
  const radio = on.comms ? radioOf(item) : null;
  if (radio) {
    applies = true;
    const factors = radioFactors(item, data, radio);
    // A record printed with its options (the trench radio's sets) already costs what they make it (HT:EE p. 29).
    const printed = PRINTED_RADIOS[nameOf(item)];
    const base = printed ? radioFactors(item, { commMode: printed.commMode, options: printedOptions(printed.options) }, radio) : { cost: 1, weight: 1 };
    cost *= factors.cost / base.cost;
    weight *= factors.weight / base.weight;
  }
  if (on.comms && OTHER_COMMS[nameOf(item)]?.family === "underwater" && data.options.military) {
    applies = true;
    cost *= MILITARY_DIVECOM.cost;
    weight *= MILITARY_DIVECOM.weight;
  }
  const active = on.active ? activeFigures(item) : undefined;
  if (active) {
    applies = true;
    const modes = activeModes(active, tl);
    for (const mode of modes) if (data.options[mode]) cost *= MODE_COST[mode as keyof typeof MODE_COST];
    if (modes.includes("imaging") && data.options.imaging) weight *= IMAGING_WEIGHT;
    // The radars' TL7 weights, halved at TL8 (p. 46).
    if (active.kind === "radar" && tl >= 8) weight *= TL8_RADAR_WEIGHT;
  }
  if (on.passive && hydrophoneBonus(nameOf(item), tl) !== null && data.options.search) {
    applies = true;
    cost *= SEARCH_HYDROPHONE_COST;
  }
  return applies ? { cost, weight } : null;
}

/** A printed record's design options, every one of them set on or off, so a box ticked or cleared on the item is priced against the printing. */
function printedOptions(options: Readonly<Partial<Record<DesignKey, boolean>>>): Record<string, boolean> {
  return Object.fromEntries(DESIGN_KEYS.map((key) => [key, options[key] === true]));
}

/**
 * What a radio's options do to its price and weight, as factors: High-Tech's
 * options (pp. 38-39), the supplement's antennas (HT:EE p. 28), receive-only
 * (p. 39), and where `radioDesign` is on, how it's built (HT:EE pp. 28-30,
 * 32, 34), with quartz tuning at TL6 and FM at TL7 priced as cutting edge
 * (HT:EE p. 8) unless the device is already marked so.
 */
function radioFactors(item: any, data: SensorData, radio: { size: RadioSize }): { cost: number; weight: number } {
  const tl = itemTl(item);
  let cost = 1;
  let weight = 1;
  const input = designOf(item, data);
  const active = input ? designActive(input) : [];
  const video = active.includes("video") || active.includes("digitalVideo");
  for (const key of radioOptions(radio.size, tl)) {
    if (!data.options[key]) continue;
    // Code-only: never on the supplement's radios, printed for code already, nor on a set built for video.
    if (key === "codeOnly" && (fromSupplement(item) || video)) continue;
    cost *= RADIO_OPTIONS[key]!.cost;
    weight *= RADIO_OPTIONS[key]!.weight ?? 1;
  }
  // The dipole and the directional antenna: a tenth and a half more cost and weight (HT:EE p. 28); a wire carried apart is priced as its own record.
  const own = { ...antennasOf(item, data), dipoleAntenna: supplementOn("antennas") && tl >= ANTENNAS.dipoleAntenna.tl && data.options.dipoleAntenna === true };
  for (const key of ["dipoleAntenna", "directionalAntenna"] as const) {
    if (!own[key]) continue;
    cost *= ANTENNAS[key].cost;
    weight *= ANTENNAS[key].weight;
  }
  // Direct sequence, twice the cost and cutting edge (HT:EE pp. 8, 47); the RDF twice and HF/DF five times (HT:EE p. 48).
  if (spreadOf(item, data).direct) {
    cost *= DIRECT_SEQUENCE.cost;
    if (!deviceData(item).cuttingEdge) cost *= cuttingEdgeFactor(String(item?.system?.equipmentQuality ?? "basic")) ?? 1;
  }
  const gear = sigintGearOf(item, data);
  if (gear.rdf) cost *= SIGINT_OPTIONS.rdf.cost;
  if (gear.hfdf) cost *= SIGINT_OPTIONS.hfdf.cost;
  if (data.commMode === "receiver") {
    cost *= 0.1;
    weight *= 0.2;
  }
  if (input) {
    const design = designFactors(input);
    cost *= design.cost;
    weight *= design.weight;
    if (cuttingEdgeDesign(input) && !deviceData(item).cuttingEdge) cost *= cuttingEdgeFactor(String(item?.system?.equipmentQuality ?? "basic")) ?? 1;
  }
  return { cost, weight };
}

/** What a worn optic or directional microphone does for the senses (pp. 47-48, 50). */
function senses(item: any, _actor: any, data: SensorData, on: SensorParts): WornSenses | null {
  const optic = opticOf(item);
  if (optic) {
    if (!on.visual) return null;
    const worn = opticSenses(optic, data.options.irIlluminated === true);
    if (!worn) return null;
    return {
      ...(worn.nightVision ? { nightVision: worn.nightVision } : {}),
      ...(worn.infravision ? { infravision: true } : {}),
      ...(worn.telescopic ? { telescopic: worn.telescopic } : {}),
      ...(worn.protectedVision ? { protectedVision: true } : {}),
      ...(worn.imposed ? { colorblindness: true, noDepthPerception: true, restrictedVision: "noPeripheral" as const } : {}),
    };
  }
  const levels = on.passive ? directionalMicLevels(nameOf(item), itemTl(item)) : null;
  return levels ? { parabolicHearing: levels } : null;
}

/** What the listener hears with beyond the set: Hearing modifiers (p. B358), as their Hearing score over Perception. */
export function hearingModifier(api: GWorldApi, actor: any): number {
  const derived: any = api.actors.derived?.(actor) ?? null;
  const per = Number(derived?.per);
  const hearing = Number((derived?.senses ?? []).find((s: any) => s?.sense === "hearing")?.score);
  return Number.isFinite(per) && Number.isFinite(hearing) ? hearing - per : 0;
}

/** The listener's Hearing score (p. B358): Perception with their Hearing modifiers. */
function hearingScore(api: GWorldApi, actor: any): number {
  const derived: any = api.actors.derived?.(actor) ?? null;
  const hearing = Number((derived?.senses ?? []).find((s: any) => s?.sense === "hearing")?.score);
  if (Number.isFinite(hearing)) return hearing;
  const per = Number(derived?.per);
  return Number.isFinite(per) ? per : api.actors.attribute(actor, "IQ") ?? 10;
}

/** A character carries a galvanometer to watch a signal's strength (HT:EE pp. 10-11, 29). */
const carriesGalvanometer = (actor: any) => [...(actor?.items ?? [])].some((i: any) => carried(i) && isGalvanometer(nameOf(i)));

/**
 * One end's antennas as set for a link (HT:EE p. 28): the dipole's bearing
 * from the dialog, and the directional antenna aimed -- by aiming software at
 * TL8, or by an Electronics Operation (Communications) roll its owner makes.
 */
async function antennaSetting(item: any, side: "a" | "b", context: CommContext | undefined, lines: string[]): Promise<AntennaSetting> {
  const has = antennasOf(item);
  const setting: AntennaSetting = {};
  if (has.dipoleAntenna) {
    setting.dipole = context?.answers?.[`dipole-${side}`] === "endOn" ? "endOn" : "broadside";
    lines.push(F(setting.dipole === "endOn" ? "DipoleEndOn" : "DipoleBroadside", { name: item.name, factor: ANTENNAS.dipoleAntenna.range }));
  }
  if (has.directionalAntenna) {
    if (aimsItself(itemTl(item))) {
      setting.aimed = true;
      lines.push(F("AutoAimed", { name: item.name, factor: ANTENNAS.directionalAntenna.range }));
    } else if (context && context.answers?.[`aim-${side}`] === true) {
      const owner = item.actor ?? null;
      const result: any = owner ? await context.api.roll.success({ actor: owner, base: skillBase(context.api, owner, COMM), skill: COMM, label: F("AimLabel", { name: item.name }), tags: ["antennaAim"] } as any) : null;
      setting.aimed = result?.success === true;
      lines.push(F(setting.aimed ? "Aimed" : "AimMissed", { name: item.name, factor: ANTENNAS.directionalAntenna.range }));
    } else lines.push(F("NotAimed", { name: item.name }));
  }
  return setting;
}

/**
 * Two comms' range, with the lines about how each was built: two radios by
 * the supplement's square root of the product (HT:EE p. 28, in place of
 * High-Tech p. 38), each end's antennas multiplying the link; two of the
 * other comms, alike in size, by the shorter range (p. 38).
 */
async function pairRange({ a, b }: CommPair, context?: CommContext): Promise<{ range: number; lines: string[] }> {
  const da = sensorData(a.item);
  const db = sensorData(b.item);
  const radio = a.comm.family === "radio";
  const lines: string[] = [];
  let range: number;
  // The listener's set is set up first, where the tool asks (HT:EE pp. 28-29).
  const setUp = radio && context ? await setUpReceiver(context.api, a.item, a.item.actor) : null;
  if (setUp && context) {
    lines.push(...setUp.lines);
    SET_UP.set(context.answers, setUp.modifiers);
  }
  if (radio) {
    const side = async (item: any, comm: Comm, data: SensorData, key: "a" | "b") => ({
      size: comm.size,
      range: (comm.range ?? 0) * (key === "a" && setUp ? (setUp.blocked ? 0 : setUp.rangeFactor) : 1),
      satelliteUplink: data.options.satelliteUplink === true && Boolean(radioOf(item)),
      antenna: antennaFactor(antennasOf(item, data), await antennaSetting(item, key, context, lines)),
    });
    range = radioPairRange(await side(a.item, a.comm, da, "a"), await side(b.item, b.comm, db, "b"));
  } else {
    range = Math.min(a.comm.range ?? 0, b.comm.range ?? 0);
  }
  if (!Number.isFinite(range)) lines.push(L("UplinkReach"));
  // A shortwave transmitter needs a large antenna to skip (HT:EE p. 30).
  if (radio && isShortwave(a.item, da) && isShortwave(b.item, db) && !canSkip(a.item, b.item)) lines.push(F("NoLargeAntenna", { name: b.item.name }));
  for (const [item, data] of [[a.item, da], [b.item, db]] as const) if (data.commMode === "receiver") lines.push(F("ReceiveOnly", { name: item.name }));
  if (radio) for (const [item, data] of [[a.item, da], [b.item, db]] as const) if (designOf(item, data)?.commMode === "transmitter") lines.push(F("SendOnly", { name: item.name }));
  // An ultra-high-speed rotary spark gap's audio is badly distorted (HT:EE pp. 28, 32).
  if (radio && designed(b.item, db).includes("ultraRotarySparkGap")) lines.push(F("DistortedAudio", { name: b.item.name, penalty: DISTORTED_AUDIO }));
  return { range, lines };
}

/** What a set's receiver took on being set up, for the roll to hear through it, by the comm tool's answers. */
const SET_UP = new WeakMap<object, Array<{ key: string; value: number }>>();

/** What setting up a receiver gave: its range cut, its modifiers to receive, whether it hears nothing, and what to say. */
interface SetUp {
  rangeFactor: number;
  modifiers: Array<{ key: string; value: number }>;
  blocked: boolean;
  lines: string[];
}

/**
 * Setting up the listener's set before it hears anything (HT:EE pp. 28-29),
 * each an Electronics Operation (Communications) roll by its owner: a
 * crystal's sensitive spot (+2 to receive, -2 on a failure, nothing on a
 * critical failure), a regenerative receiver's adjustment (a fifth the range
 * on a failure; on a critical failure it oscillates, hears nothing and jams
 * receivers nearby); and a ground aerial's -2.
 */
async function setUpReceiver(api: GWorldApi, item: any, actor: any): Promise<SetUp> {
  const out: SetUp = { rangeFactor: 1, modifiers: [], blocked: false, lines: [] };
  const active = designed(item);
  const roll = (label: string, tag: string) => (actor ? api.roll.success({ actor, base: skillBase(api, actor, COMM), skill: COMM, label, tags: [tag] } as any) : Promise.resolve(null)) as Promise<any>;
  if (active.includes("crystalDetector")) {
    const spot = crystalSpot(await roll(F("CrystalLabel", { name: item.name }), "crystalSpot"));
    if (spot.blocked) {
      out.blocked = true;
      out.lines.push(F("CrystalLost", { name: item.name }));
    } else if (spot.modifier) {
      out.modifiers.push({ key: "crystal", value: spot.modifier });
      out.lines.push(F(spot.modifier > 0 ? "CrystalFound" : "CrystalMissed", { name: item.name, value: signed(spot.modifier) }));
    }
  }
  if (active.includes("regenerative")) {
    const state = regenerativeAdjustment(await roll(F("RegenerativeAdjust", { name: item.name }), "regenerative"));
    if (state === "missed") {
      out.rangeFactor *= REGENERATIVE_MISS;
      out.lines.push(F("RegenerativeMissed", { name: item.name, divisor: Math.round(1 / REGENERATIVE_MISS) }));
    } else if (state === "oscillating") {
      out.blocked = true;
      out.lines.push(F("RegenerativeOscillates", { name: item.name, penalty: OSCILLATION.penalty, yards: OSCILLATION.yards }));
    }
  }
  const wire = radioOf(item) ? carriedAntenna(item.actor) : null;
  if (wire && sensorData(wire).options.groundAerial) out.modifiers.push({ key: "groundAerial", value: GROUND_AERIAL });
  return out;
}

/** The comm tool's rows for the supplement's rules: each dipole's bearing, aiming each directional antenna, the tuning roll's conditions, shortwave's (HT:EE pp. 27-30). */
function commFields({ a, b }: CommPair): { html: string; read(form: HTMLElement): Record<string, unknown> } | null {
  if (a.comm.family !== "radio") return null;
  let html = "";
  for (const [key, item] of [["a", a.item], ["b", b.item]] as const) {
    const has = antennasOf(item);
    if (has.dipoleAntenna) html += row(F("DipoleBearing", { name: item.name }), `<select name="dipole-${key}"><option value="broadside">${esc(L("Bearing.broadside"))}</option><option value="endOn">${esc(L("Bearing.endOn"))}</option></select>`);
    if (has.directionalAntenna && !aimsItself(itemTl(item))) html += row(F("AimAntenna", { name: item.name }), `<input type="checkbox" name="aim-${key}" checked />`);
  }
  const tuning = supplementOn("tuning");
  if (tuning) {
    html += row(L("Conditions"), `<select name="conditions">${CONDITIONS.map((c) => `<option value="${c}" ${c === 0 ? "selected" : ""}>${esc(c === 0 ? L("ConditionsNone") : c === INTERFERENCE.worst ? F("ConditionsBlocked", { value: c }) : (c > 0 ? `+${c}` : String(c)))}</option>`).join("")}</select>`)
      + row(L("Galvanometer"), `<input type="checkbox" name="galvanometer" ${carriesGalvanometer(a.item.actor) ? "checked" : ""} />`)
      + row(F("Drift", { minutes: DRIFT_MINUTES }), `<input type="checkbox" name="drift" ${drifts(a.item) ? "checked" : ""} />`);
  }
  const shortwave = isShortwave(a.item) && isShortwave(b.item);
  if (shortwave) for (const c of SKIP_CONDITIONS) html += row(L(`Skip.${c}`), `<input type="checkbox" name="skip-${c}" />`);
  if (!html) return null;
  return {
    html,
    read: (form) => {
      const value = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
      const checked = (name: string) => (value(name) as HTMLInputElement | null)?.checked === true;
      const answers: Record<string, unknown> = {
        "dipole-a": value("dipole-a")?.value ?? "broadside",
        "dipole-b": value("dipole-b")?.value ?? "broadside",
        "aim-a": checked("aim-a"),
        "aim-b": checked("aim-b"),
      };
      if (tuning) Object.assign(answers, { conditions: Number(value("conditions")?.value) || 0, galvanometer: checked("galvanometer"), drift: checked("drift") });
      if (shortwave) answers.skip = Object.fromEntries(SKIP_CONDITIONS.map((c) => [c, checked(`skip-${c}`)]));
      return answers;
    },
  };
}

/** What goes into picking up a signal on a set, whichever way it's asked for. */
interface Listening {
  api: GWorldApi;
  actor: any;
  item: any;
  yards: number;
  /** The signal's standard range here, in yards, after the cuts. */
  range: number;
  conditions: number;
  galvanometer: boolean;
  drift: boolean;
  /** Shortwave's conditions, where both ends are shortwave and the transmitter has a large antenna; null otherwise. */
  skip: Partial<Record<SkipCondition, boolean>> | null;
  /** What setting up the listener's set gave to receive: a crystal's spot, a ground aerial (HT:EE pp. 28-29). */
  design?: Array<{ key: string; value: number }>;
}

/**
 * Picking up a signal (HT:EE pp. 27, 29-30): by its ground range, or where
 * both sets are shortwave, by skipping off the upper atmosphere if that is
 * better; the tuning roll where `radioTuning` is on, or shortwave's penalties
 * alone where only `shortwaveSkip` is. Null where neither switch has
 * anything to say, so the shared stretch applies.
 */
function listen(input: Listening): CommReception | null {
  const tuning = supplementOn("tuning");
  const stretch = Number.isFinite(input.range) ? rangeExtensionModifier(input.yards, input.range) : 0;
  const skipped = input.skip ? skipLines(input.yards, input.skip) : null;
  const skip = skipped && Number.isFinite(input.range) && skipApplies(input.yards, input.range, stretch, skipped) ? skipped : undefined;
  const design = input.design ?? [];
  if (!tuning && !skip && !design.length) return null;
  // A superheterodyne is tuned with a simple Hearing roll, whose score already holds the Hearing modifiers (HT:EE p. 29).
  const superhet = tuning && designed(input.item).includes("superheterodyne");
  const lines: string[] = [];
  if (skip) lines.push(F("SkipLine", { skips: skipsFor(input.yards) }));
  const roll = tuningRoll({
    rangeModifier: stretch,
    conditions: tuning ? input.conditions : 0,
    hearing: tuning && !superhet ? hearingModifier(input.api, input.actor) : 0,
    galvanometer: tuning && !superhet && input.galvanometer,
    enhanced: tuning && Boolean(peripheralOf(input.item)),
    ...(skip ? { skip } : {}),
    ...(design.length ? { extra: design } : {}),
  });
  // Direct sequence filters out other signals on the band: +4 against the interference (HT:EE p. 47).
  const filtered = tuning && roll?.needed && spreadOf(input.item).direct ? directSequenceTuning(input.conditions) : 0;
  if (roll && filtered) roll.lines.push({ key: "directSequence", value: filtered });
  if (!roll) {
    lines.push(L(tuning && input.conditions <= INTERFERENCE.worst ? "Blocked" : "OutOfRange"));
    return { lines, roll: null };
  }
  if (tuning && input.drift) lines.push(F("DriftLine", { minutes: DRIFT_MINUTES }));
  if (!roll.needed) {
    lines.push(L("ClearSignal"));
    return { lines, roll: null };
  }
  const modifiers = roll.lines.map((l) => ({ label: L(`Tuning.${l.key}`), value: l.value }));
  if (superhet) {
    lines.push(L("SuperhetRoll"));
    return { lines, roll: { label: F("TuningLabel", { name: input.item.name }), skill: "Hearing", base: hearingScore(input.api, input.actor), modifiers, tags: ["radioTuning", "hearing"] } };
  }
  return { lines, roll: { label: F("TuningLabel", { name: input.item.name }), skill: COMM, modifiers, tags: ["radioTuning"] } };
}

/** Whether a shortwave link can skip: both sets shortwave, and the transmitter with a large antenna (HT:EE p. 30). */
function canSkip(listener: any, transmitter: any): boolean {
  return isShortwave(listener) && isShortwave(transmitter) && hasLargeAntenna(antennasOf(transmitter));
}

/** The comm tool's roll to pick up the signal, where the supplement's switches print one (HT:EE pp. 27-30). */
function reception({ a, b }: CommPair, context: CommContext & { range: number; stretch: number | null }): CommReception | null {
  if (a.comm.family !== "radio") return null;
  return listen({
    api: context.api,
    actor: a.item.actor,
    item: a.item,
    design: SET_UP.get(context.answers) ?? [],
    yards: context.yards,
    range: context.range,
    conditions: Number(context.answers.conditions) || 0,
    galvanometer: context.answers.galvanometer === true,
    drift: context.answers.drift === true,
    skip: canSkip(a.item, b.item) ? ((context.answers.skip as Partial<Record<SkipCondition, boolean>> | undefined) ?? {}) : null,
  });
}

/** A sweep with an active sensor (pp. 45-47). */
async function sweep({ api, selected, target, sensors, measured }: SweepContext): Promise<void> {
  const kinds = new Set(sensors.map((s) => activeFigures(s.item)?.kind));
  const imagingAny = sensors.some((s) => sensorData(s.item).options.imaging);
  const refined = rangefindingOn();
  const surveying = refined && sensors.some((s) => activeFigures(s.item)?.survey);
  const answer = await ask(L("SweepTitle"),
    row(L("Sensor"), `<select name="sensor">${sensors.map((s, i) => `<option value="${i}">${esc(s.item.name)}</option>`).join("")}</select>`)
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round((measured ?? 100) * 10) / 10}" min="0" step="any" style="width:90px" />`)
    + row(F("OutsideArc", { arc: SENSOR_ARC }), `<input type="checkbox" name="arc" />`)
    + (kinds.has("sonar") ? row(L("Noise"), `<select name="noise">${SONAR_NOISE.map((n) => `<option value="${n}">${n === 0 ? esc(L("NoNoise")) : n}</option>`).join("")}</select>`) : "")
    + (imagingAny ? row(L("ImagingMode"), `<input type="checkbox" name="imaging" />`) : "")
    + (kinds.has("gpr") ? row(L("MediumLabel"), `<select name="medium">${Object.keys(GPR_MEDIUM).map((m) => `<option value="${m}">${esc(L(`Medium.${m}`))}</option>`).join("")}</select>`) : "")
    + (kinds.has("radar") && target ? row(L("Countermeasures"), `<select name="counter"><option value="">${esc(L("Counter.none"))}</option>${Object.keys(COUNTERMEASURES).map((c) => `<option value="${c}">${esc(L(`Counter.${c}`))}</option>`).join("")}</select>`) : "")
    + (refined ? row(L("TargetSm"), `<input type="number" name="sm" value="${Number(target?.system?.sm) || 0}" step="1" style="width:70px" />`) + dwellRow() : "")
    + (surveying ? surveyRow() : ""),
    (form) => ({
      survey: String(form.querySelector<HTMLInputElement>("[name=survey]")?.value ?? "").trim(),
      index: Number(form.querySelector<HTMLSelectElement>("[name=sensor]")?.value) || 0,
      yards: Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0,
      arc: Boolean(form.querySelector<HTMLInputElement>("[name=arc]")?.checked),
      noise: Number(form.querySelector<HTMLSelectElement>("[name=noise]")?.value) || 0,
      imaging: Boolean(form.querySelector<HTMLInputElement>("[name=imaging]")?.checked),
      medium: (form.querySelector<HTMLSelectElement>("[name=medium]")?.value ?? "soil") as keyof typeof GPR_MEDIUM,
      counter: (form.querySelector<HTMLSelectElement>("[name=counter]")?.value ?? "") as "" | keyof typeof COUNTERMEASURES,
      sm: Number(form.querySelector<HTMLInputElement>("[name=sm]")?.value) || 0,
      dwell: readDwell(form),
    }));
  if (!answer) return;
  const chosen = sensors[answer.index] ?? sensors[0]!;
  const figures = activeFigures(chosen.item)!;
  const data = sensorData(chosen.item);
  const title = F("SweepLabel", { sensor: chosen.item.name });
  // Only targets within the sensor's arc (p. 45).
  if (answer.arc) return void card(selected, title, [F("ArcMiss", { arc: SENSOR_ARC })]);
  let base = figures.range(itemTl(chosen.item));
  if (answer.imaging && data.options.imaging) base *= IMAGING_RANGE;
  if (figures.kind === "gpr") base *= GPR_MEDIUM[answer.medium] ?? 1;
  const lpi = data.options.lpi === true;
  const modifiers: Array<{ label: string; value: number }> = [];
  // The supplement's half steps, from the range dwelling reaches (HT:EE p. 35); High-Tech's -2 per doubling otherwise.
  const dwell = refined ? answer.dwell ?? "" : "";
  const reach = dwellRange(lpi ? base / 2 : base, dwell);
  const penalty = refined ? rangefindingPenalty(answer.yards, reach) : activeRangePenalty(answer.yards, base, lpi);
  if (penalty) modifiers.push({ label: F("RangeLine", { range: distance(reach) }), value: penalty });
  if (figures.kind === "sonar" && answer.noise) modifiers.push({ label: L("NoiseLine"), value: answer.noise });
  // The target's size at half its SM (HT:EE p. 35).
  const size = refined ? sensorSizeModifier(answer.sm ?? 0) : 0;
  if (size) modifiers.push({ label: F("SizeLine", { sm: answer.sm }), value: size });
  const lines: string[] = [];
  if (dwell) lines.push(F("DwellLine", { time: DWELL[dwell].time, bonus: signed(DWELL[dwell].detect) }));
  if (figures.kind === "gpr" && answer.medium !== "soil") lines.push(F("MediumLine", { medium: L(`Medium.${answer.medium}`), range: distance(base) }));
  if (data.options.tactical) lines.push(F(figures.kind === "radar" ? "TacticalRadar" : "TacticalSonar", { range: distance(figures.range(itemTl(chosen.item)) * TACTICAL_IDENTIFY) }));
  const tags = ["detection", figures.kind];
  // A target using countermeasures or stealth: a Quick Contest against the jammer's operator's EW or the infiltrator's Stealth (p. 46).
  if (answer.counter && target) {
    const skill = COUNTERMEASURES[answer.counter];
    await api.roll.quickContest({
      label: title,
      first: { actor: selected, base: skillBase(api, selected, figures.skill), modifiers, note: figures.skill },
      second: { actor: target, base: answer.counter === "jammer" ? skillBase(api, target, skill) : api.actors.skillLevel(target, skill) ?? (api.actors.attribute(target, "DX") ?? 10) - 5, note: skill },
      tags,
    } as any);
  } else {
    const result: any = await api.roll.success({ actor: selected, base: skillBase(api, selected, figures.skill), skill: figures.skill, label: title, modifiers, tags, ...(target ? { subject: target } : {}) } as any);
    // The supplement's ground-penetrating radar: success is +2 to a skill the survey serves (HT:EE p. 35),
    // held for the operator's next roll of the skill the dialog names (API 1.132.0).
    if (refined && figures.survey && result?.success) {
      const held = answer.survey
        ? await api.actors.addPendingModifier(selected, { label: F("SurveyHeldLabel", { sensor: chosen.item.name }), value: figures.survey, skill: answer.survey })
        : null;
      lines.push(held ? F("SurveyHeld", { bonus: signed(figures.survey), name: selected.name, skill: answer.survey }) : F("SurveyResult", { bonus: signed(figures.survey) }));
    }
  }
  if (lines.length) await card(selected, title, lines);
}

/** The skills the book names a ground-penetrating radar's survey serving (HT:EE p. 35), offered for the one it helps. */
const SURVEY_SKILLS = ["Archaeology", "Prospecting", "Engineer", "Explosives (EOD)"] as const;

/** The dialog row naming the skill a survey helps: blank leaves the bonus to the GM. */
function surveyRow(): string {
  return row(L("SurveySkill"), `<input type="text" name="survey" value="" list="ht-survey-skills" style="width:140px" />`
    + `<datalist id="ht-survey-skills">${SURVEY_SKILLS.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>`);
}

/** The dialog row for dwelling on a target (HT:EE p. 35). */
function dwellRow(): string {
  return row(L("Dwell"), `<select name="dwell"><option value="">${esc(L("DwellOption.none"))}</option>${(Object.keys(DWELL) as Dwell[]).map((d) => `<option value="${d}">${esc(F(`DwellOption.${d}`, { time: DWELL[d].time, range: DWELL[d].range }))}</option>`).join("")}</select>`);
}
const readDwell = (form: HTMLElement): Dwell | "" => {
  const value = form.querySelector<HTMLSelectElement>("[name=dwell]")?.value ?? "";
  return value in DWELL ? (value as Dwell) : "";
};

/**
 * Detecting an active sensor's emissions (HT:EE p. 35; High-Tech p. 45): the
 * selected character detects the targeted character's sonar or radar. Inside
 * its arc and within twice its range (1.5 times the halved range with LPI)
 * there is nothing to roll; past that, a roll at -1 per further 20% of its
 * range, to -10; and +2 or +4 while its operator dwells on a target.
 */
async function detectEmissions(api: GWorldApi): Promise<void> {
  const { selected, target } = picked();
  if (!selected || !target) return void ui.notifications?.warn(L("EmissionsPick"));
  const found = [...(target.items ?? [])].filter((item: any) => carried(item) && emits(activeFigures(item)));
  if (!found.length) return void ui.notifications?.warn(L("NoEmitter"));
  const measured = yardsBetween(selected, target);
  const first = detectorSkill(activeFigures(found[0])!.kind);
  const answer = await ask(L("EmissionsTitle"),
    row(L("Sensor"), `<select name="sensor">${found.map((item: any, i) => `<option value="${i}">${esc(item.name)}</option>`).join("")}</select>`)
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? 1000)}" min="0" step="any" style="width:90px" />`)
    + row(F("OutsideArcEmitter", { arc: SENSOR_ARC }), `<input type="checkbox" name="arc" />`)
    + dwellRow()
    + row(L("DetectorSkill"), `<select name="skill">${DETECTOR_SKILLS.map((k) => `<option value="${k}" ${k === first ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>`),
    (form) => ({
      index: Number(form.querySelector<HTMLSelectElement>("[name=sensor]")?.value) || 0,
      yards: Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0,
      arc: Boolean(form.querySelector<HTMLInputElement>("[name=arc]")?.checked),
      dwell: readDwell(form),
      skill: form.querySelector<HTMLSelectElement>("[name=skill]")?.value || first,
    }));
  if (!answer) return;
  const item = found[answer.index] ?? found[0];
  const figures = activeFigures(item)!;
  const range = figures.range(itemTl(item));
  const lpi = sensorData(item).options.lpi === true;
  const title = F("EmissionsLabel", { sensor: item.name, name: target.name });
  // Only a detector within the sensor's arc (High-Tech p. 45).
  if (answer.arc) return void card(selected, title, [F("EmitterArcMiss", { arc: SENSOR_ARC })]);
  const modifier = emissionModifier(answer.yards, range, lpi);
  if (modifier === null) return void card(selected, title, [F("EmissionsOut", { range: distance(emissionReach(range, lpi)) })]);
  if (modifier === 0) return void card(selected, title, [F("EmissionsDetected", { range: distance(emissionDetectionRange(range, lpi)) })]);
  const modifiers = [{ label: L("EmissionLine"), value: modifier }];
  if (answer.dwell) modifiers.push({ label: F("DwellBonus", { time: DWELL[answer.dwell].time }), value: DWELL[answer.dwell].detect });
  await api.roll.success({ actor: selected, base: skillBase(api, selected, answer.skill), skill: answer.skill, label: title, modifiers, tags: ["detection", "emissions", figures.kind], subject: target } as any);
}

const MODES: readonly CommMode[] = ["", "receiver"];
const DESIGN_MODES: readonly CommMode[] = ["", "receiver", "transmitter"];

const FIGURES: SensorFigures = {
  options: ["codeOnly", "directionFinder", "intercept", "radiotelephone", "eccm", "gps", "satelliteUplink", "longAntenna", "dipoleAntenna", "directionalAntenna", "shortwave", "directSequence", "rdf", "hfdf", ...DESIGN_KEYS, "groundAerial", "wideBeam", "military", "tactical", "lpi", "imaging", "lensHood", "irIlluminated", "search"],
  // Send-only too, as the supplement builds a set (HT:EE pp. 28-29): the field holds it whichever books are loaded, and a sheet offers it where the design rules are on.
  commModes: DESIGN_MODES,
  commModesFor: (item, data) => (designOf(item, data) ? DESIGN_MODES : MODES),
  comm: commOfItem,
  active: (item, data) => {
    const figures = activeFigures(item);
    return figures ? { kind: figures.kind, range: figures.range(itemTl(item)) * (data.options.lpi ? 0.5 : 1) } : null;
  },
  senses,
  sheet,
  price,
  pairRange,
  commFields,
  reception,
  dataRates: DATA_RATES,
  sweep,
  // Only a tactical sonar or radar has the targeting mode (pp. 45-46).
  canLock: (item, data) => data.options.tactical === true && Boolean(activeFigures(item)),
  lockCounts: () => true,
};

/** High-Tech's comms and sensors table, behind the book's own four switches. */
export function highTechSensors(switches: SensorSwitches): SensorTable {
  SUPPLEMENT.tuning = switches.radioTuning ?? "";
  SUPPLEMENT.antennas = switches.radioAntennas ?? "";
  SUPPLEMENT.shortwave = switches.shortwaveSkip ?? "";
  SUPPLEMENT.design = switches.radioDesign ?? "";
  SUPPLEMENT.spread = switches.spreadSpectrum ?? "";
  SUPPLEMENT.sigint = switches.signalsIntelligence ?? "";
  SUPPLEMENT.cipher = switches.cipherMachines ?? "";
  return {
    book: "high-tech",
    tls: { min: 0, max: 8 },
    switches: { comms: switches.radios, active: switches.activeSensors, visual: switches.visualSensors, passive: switches.passiveSensors },
    i18n: NS,
    figures: FIGURES,
  };
}

/** Registers the table, and what must exist before the world's data is read. */
export function initHighTechSensors(switches: SensorSwitches): void {
  rangefindingKey = switches.rangefindingEmissions ?? null;
  SENSOR_TABLES.register(highTechSensors(switches));
  initSensors();
  // A wideband spark-gap transmitter's cells last a fifth as long (HT:EE p. 29), against what a printed set already counts.
  registerPowerAdjuster((item) => {
    const input = designOf(item);
    if (!input) return null;
    const printed = PRINTED_RADIOS[nameOf(item)];
    const base = printed ? designFactors({ ...input, commMode: printed.commMode, options: printedOptions(printed.options) }).endurance : 1;
    const factor = designFactors(input).endurance / base;
    return factor === 1 ? null : { endurance: factor };
  });
}

// ── What the book prints alone ──

/** An optic's IR illuminator is on: the wearer is a light to night-vision gear and thermographs (p. 47). */
function shinesInfrared(actor: any): boolean {
  return [...(actor?.items ?? [])].some((i: any) => worn(i) && OPTICS[nameOf(i)]?.illuminator === true && sensorData(i).options.irIlluminated === true);
}

/** The night-vision optic or thermograph a character wears, if any. */
function wornViewer(actor: any, thermalOnly = false): any {
  return [...(actor?.items ?? [])].find((i: any) => {
    const optic = OPTICS[nameOf(i)];
    return worn(i) && optic && !optic.mounted && (optic.thermal || (!thermalOnly && optic.nightVision));
  });
}

/**
 * Telegraphy (p. 36): sending or reading a message, recognizing a fist,
 * faking one in a Quick Contest with the recipient at -6, or tapping a line
 * (from TL6 a Quick Contest with the recipient to go unnoticed); every roll
 * at -4 on an enciphered message.
 */
async function telegraphy(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const tasks = ["send", "recognize", "fake", "tap"] as const;
  const answer = await ask(L("TelegraphyTitle"),
    row(L("TaskLabel"), `<select name="task">${tasks.map((t) => `<option value="${t}">${esc(L(`Telegraphy.${t}`))}</option>`).join("")}</select>`)
    + row(F("Enciphered", { modifier: ENCIPHERED }), `<input type="checkbox" name="cipher" />`)
    + (supplementOn("cipher") ? row(L("CipherTime"), `<input type="number" name="times" value="1" min="1" step="1" style="width:70px" />`) : ""),
    (form) => ({
      task: (form.querySelector<HTMLSelectElement>("[name=task]")?.value ?? "send") as (typeof tasks)[number],
      cipher: Boolean(form.querySelector<HTMLInputElement>("[name=cipher]")?.checked),
      times: Number(form.querySelector<HTMLInputElement>("[name=times]")?.value) || 1,
    }));
  if (!answer) return;
  const modifiers: Array<{ label: string; value: number }> = answer.cipher ? [{ label: L("EncipheredLine"), value: ENCIPHERED }] : [];
  // Sending enciphered text slowly offsets the -4, never beyond it (HT:EE p. 48; p. B346).
  const slow = answer.cipher && answer.task === "send" && supplementOn("cipher") ? encipheredTimeBonus(answer.times) : 0;
  if (slow) modifiers.push({ label: F("CipherTimeLine", { times: answer.times }), value: slow });
  // A rotary spark gap's steadier output: a quality bonus to send on it (HT:EE p. 28).
  const quality = answer.task === "send" || answer.task === "fake" ? qualityBonus(designed(item)) : 0;
  const sender = quality ? [...modifiers, { label: F("QualityLine", { name: item.name }), value: quality }] : modifiers;
  const label = F("TelegraphyRoll", { task: L(`Telegraphy.${answer.task}`), name: item.name });
  const contested = answer.task === "fake" || (answer.task === "tap" && tapIsContested(itemTl(item)));
  const recipient = picked().target;
  if (contested && !recipient) return void ui.notifications?.warn(L("RecipientPick"));
  if (contested) {
    const mine = answer.task === "fake" ? [...sender, { label: L("FakeFistLine"), value: FAKE_FIST }] : sender;
    await api.roll.quickContest({
      label,
      first: { actor, base: skillBase(api, actor, COMM), modifiers: mine, note: COMM },
      second: { actor: recipient, base: skillBase(api, recipient, COMM), modifiers, note: COMM },
      tags: ["telegraphy"],
    } as any);
    return;
  }
  await api.roll.success({ actor, base: skillBase(api, actor, COMM), skill: COMM, label, modifiers: sender, tags: ["telegraphy"] } as any);
  await card(actor, label, [L(`Telegraphy.${answer.task}Result`)]);
}

/** A character's Electronics Operation (EW): known, from Electronics Operation (Communications)-4, or IQ-5 (p. B189; High-Tech p. 209). */
export function ewLevel(api: GWorldApi, actor: any): number {
  const comm = api.actors.skillLevel(actor, COMM);
  return api.actors.skillLevel(actor, EW) ?? (comm !== null && comm !== undefined ? comm + EW_FROM_COMM : skillBase(api, actor, EW));
}

/** The better Mathematics a fix is plotted with, or the IQ-6 default of a Hard skill (p. B207). */
function mathematicsLevel(api: GWorldApi, actor: any): number {
  const known = MATHEMATICS.map((skill) => api.actors.skillLevel(actor, skill)).filter((v): v is number => typeof v === "number");
  return known.length ? Math.max(...known) : (api.actors.attribute(actor, "IQ") ?? 10) - 6;
}

/** A carried oscilloscope: +1 to signal tracing, under the supplement's SIGINT switch (HT:EE pp. 11, 47-48). */
export function tracingOscilloscope(actor: any): any {
  if (!supplementOn("sigint")) return null;
  return [...(actor?.items ?? [])].find((i: any) => carried(i) && instrumentOf(nameOf(i))?.kind === "oscilloscope") ?? null;
}

/** The first side's roll in the last fix's Quick Contest, for its criticals: the contest reports only who won. */
let lastFixRoll: { criticalSuccess?: boolean; criticalFailure?: boolean } | null = null;

/**
 * A fix on a transmitter: the supplement's triangulation (HT:EE p. 47, in
 * place of High-Tech pp. 38-39; E3 in #471). The operator plots the lines by
 * hand with a basic or improvised direction finder, or rolls Electronics
 * Operation (EW) with HF/DF; +6, the antennas' spacing and the source's
 * distance from the Size and Speed/Range Table, -2 for two antennas, -5
 * improvised, and haste for a signal under a minute; a Quick Contest with the
 * targeted operator where the source is concealed. The general area comes
 * with scatter of a share of the range (p. B414), rolled for direction.
 */
async function directionFinder(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const gear = sigintGearOf(item);
  const system: DfSystem = gear.hfdf ? "hfdf" : sensorData(item).options.directionFinder || gear.rdf ? "basic" : "improvised";
  const measured = target ? yardsBetween(actor, target) : null;
  const systems: DfSystem[] = ["basic", "improvised", "hfdf"];
  const answer = await ask(L("DirectionFinderTitle"),
    row(L("DfSystem"), `<select name="system">${systems.map((s) => `<option value="${s}" ${s === system ? "selected" : ""}>${esc(L(`Df.${s}`))}</option>`).join("")}</select>`)
    + row(L("DfAntennas"), `<select name="antennas">${DF_ANTENNAS.map((a) => `<option value="${a}">${esc(L(`DfAntenna.${a}`))}</option>`).join("")}</select>`)
    + row(L("DfBaseline"), `<input type="number" name="baseline" value="1760" min="0" style="width:90px" />`)
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? 1760)}" min="0" style="width:90px" />`)
    + row(F("DfSignal", { seconds: TRIANGULATION.signalSeconds }), `<input type="number" name="seconds" value="0" min="0" style="width:70px" />`)
    + row(L("DfConcealed"), `<input type="checkbox" name="concealed" ${target ? "checked" : ""} />`),
    (form) => ({
      system: (form.querySelector<HTMLSelectElement>("[name=system]")?.value ?? system) as DfSystem,
      antennas: (form.querySelector<HTMLSelectElement>("[name=antennas]")?.value ?? "three") as DfAntennas,
      baseline: Number(form.querySelector<HTMLInputElement>("[name=baseline]")?.value) || 0,
      yards: Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0,
      seconds: Number(form.querySelector<HTMLInputElement>("[name=seconds]")?.value) || 0,
      concealed: Boolean(form.querySelector<HTMLInputElement>("[name=concealed]")?.checked),
    }));
  if (!answer) return;
  const label = F(target ? "DirectionFinderRoll" : "DirectionFinderOpen", { name: item.name, target: target?.name ?? "" });
  // A single antenna gives the direction only (HT:EE p. 47).
  if (answer.antennas === "one") return void card(actor, label, [L("Fix.directionOnly")]);
  if (answer.concealed && !target) return void ui.notifications?.warn(L("TransmitterPick"));
  const amateur = api.actors.skillLevel(actor, AMATEUR_RADIO);
  const plotted = triangulationLevel({ system: answer.system, ew: ewLevel(api, actor), mathematics: mathematicsLevel(api, actor), amateurRadio: amateur ?? null, antennas: answer.antennas })!;
  const note = plotted.skill === "ew" ? EW : plotted.skill === "amateurRadio" ? AMATEUR_RADIO : L("DfPlotting");
  const modifiers = triangulationLines({ system: answer.system, antennas: answer.antennas, baselineYards: answer.baseline, distanceYards: answer.yards, signalSeconds: answer.seconds }, (yards) => api.rules.speedRangeModifier(yards), timeSpentModifier)
    .map((l) => ({ label: L(`DfLine.${l.key}`), value: l.value }));
  const scope = tracingOscilloscope(actor);
  if (scope) modifiers.push({ label: F("TracingLine", { name: scope.name }), value: OSCILLOSCOPE });
  const lines: string[] = [];
  if (answer.system === "improvised") lines.push(L("Fix.ambiguous"));
  let roll: { success: boolean; margin: number; criticalSuccess?: boolean; criticalFailure?: boolean };
  if (answer.concealed && target) {
    lastFixRoll = null;
    const contest: any = await api.roll.quickContest({
      label,
      first: { actor, base: plotted.level, modifiers, note },
      second: { actor: target, base: ewLevel(api, target), note: EW },
      tags: ["directionFinder", "triangulation"],
    } as any);
    if (!contest) return;
    const won = contest.outcome === "first";
    // Heard from the contest's hook while it ran.
    const own = lastFixRoll as { criticalSuccess?: boolean; criticalFailure?: boolean } | null;
    roll = { success: won, margin: won ? Number(contest.marginOfVictory) || 0 : 0, criticalSuccess: won && own?.criticalSuccess === true, criticalFailure: !won && own?.criticalFailure === true };
  } else {
    const result: any = await api.roll.success({ actor, base: plotted.level, skill: plotted.skill === "ew" ? EW : plotted.skill === "amateurRadio" ? AMATEUR_RADIO : note, label, modifiers, tags: ["directionFinder", "triangulation"], item, ...(target ? { subject: target } : {}) } as any);
    if (!result) return;
    roll = { success: Boolean(result.success), margin: Number(result.margin) || 0, criticalSuccess: result.criticalSuccess === true, criticalFailure: result.criticalFailure === true };
  }
  const fix = triangulationFix(roll);
  if (fix.kind === "area") {
    const direction = new Roll("1d6");
    await direction.evaluate();
    const bearing = api.rules.scatterBearing(Number(direction.total) || 1);
    lines.push(F("Fix.area", { share: Math.round(fix.share * 100), yards: Math.round(answer.yards * fix.share), bearing }));
  } else lines.push(L(`Fix.${fix.kind}`));
  await card(actor, label, lines);
}

/** Intercepting the targeted character's transmissions with a radio intercept (pp. 39, 209). */
async function intercept(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = picked().target;
  if (!actor) return;
  const theirs = target ? [...(target.items ?? [])].find((i: any) => carried(i) && radioOf(i)) : null;
  const eccm = theirs ? sensorData(theirs).options.eccm === true : false;
  const answer = await ask(L("InterceptTitle"),
    row(L("Avoiding"), `<input type="checkbox" name="avoiding" ${eccm ? "checked" : ""} />`),
    (form) => ({ avoiding: Boolean(form.querySelector<HTMLInputElement>("[name=avoiding]")?.checked) }));
  if (!answer) return;
  const own = ewLevel(api, actor);
  const label = F("InterceptRoll", { name: item.name });
  // A frequency-hopping signal is -4 to detect (HT:EE p. 46).
  const hop = theirs ? spreadDetectModifier(spreadOf(theirs)) : 0;
  const modifiers = hop ? [{ label: F("HoppingDetect", { name: theirs.name }), value: hop }] : [];
  if (answer.avoiding && target) {
    await api.roll.quickContest({ label, first: { actor, base: own, modifiers, note: EW }, second: { actor: target, base: skillBase(api, target, EW), note: EW }, tags: ["intercept"] } as any);
  } else {
    await api.roll.success({ actor, base: own, skill: EW, label, modifiers, tags: ["intercept"] } as any);
  }
  if (eccm) await card(actor, label, [F("EccmSpoofs", { name: theirs.name })]);
}

/**
 * Tuning a set in to a signal (HT:EE pp. 27, 29-30): the distance to the
 * transmitter and its standard range -- the targeted character's radio's
 * reach to this one where there is one, this set's own otherwise -- the
 * interference or conditions, a galvanometer, and a coil-tuned set's drift.
 */
async function tuneIn(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const mine = commOfItem(item);
  if (!mine || mine.range === null) return;
  const theirs = target ? [...(target.items ?? [])].find((i: any) => carried(i) && commOfItem(i)?.family === "radio") : null;
  const pair: CommPair | null = theirs ? { a: { item, comm: mine }, b: { item: theirs, comm: commOfItem(theirs)! } } : null;
  const standard = pair ? (await pairRange(pair)).range : mine.range * antennaFactor(antennasOf(item));
  const measured = target ? yardsBetween(actor, target) : null;
  const shortwave = pair ? isShortwave(item) && isShortwave(theirs) : isShortwave(item);
  const answer = await ask(F("TuneTitle", { name: item.name }),
    row(L("Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? standard)}" min="0" style="width:90px" />`)
    + row(L("SignalRange"), `<input type="number" name="range" value="${Number.isFinite(standard) ? Math.round(standard) : 0}" min="0" style="width:90px" />`)
    + row(L("Conditions"), `<select name="conditions">${CONDITIONS.map((c) => `<option value="${c}" ${c === 0 ? "selected" : ""}>${esc(c === 0 ? L("ConditionsNone") : c === INTERFERENCE.worst ? F("ConditionsBlocked", { value: c }) : (c > 0 ? `+${c}` : String(c)))}</option>`).join("")}</select>`)
    + row(L("Galvanometer"), `<input type="checkbox" name="galvanometer" ${carriesGalvanometer(actor) ? "checked" : ""} />`)
    + row(F("Drift", { minutes: DRIFT_MINUTES }), `<input type="checkbox" name="drift" ${drifts(item) ? "checked" : ""} />`)
    + (shortwave ? SKIP_CONDITIONS.map((c) => row(L(`Skip.${c}`), `<input type="checkbox" name="skip-${c}" />`)).join("") : ""),
    (form) => ({
      yards: Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0,
      range: Number(form.querySelector<HTMLInputElement>("[name=range]")?.value) || 0,
      conditions: Number(form.querySelector<HTMLSelectElement>("[name=conditions]")?.value) || 0,
      galvanometer: Boolean(form.querySelector<HTMLInputElement>("[name=galvanometer]")?.checked),
      drift: Boolean(form.querySelector<HTMLInputElement>("[name=drift]")?.checked),
      skip: Object.fromEntries(SKIP_CONDITIONS.map((c) => [c, Boolean(form.querySelector<HTMLInputElement>(`[name=skip-${c}]`)?.checked)])) as Partial<Record<SkipCondition, boolean>>,
    }));
  if (!answer) return;
  const lines: string[] = [];
  // The set is set up first: a crystal's spot, a regenerative set's adjustment (HT:EE pp. 28-29).
  const setUp = await setUpReceiver(api, item, actor);
  lines.push(...setUp.lines);
  if (setUp.blocked) return void card(actor, F("TuningLabel", { name: item.name }), lines);
  // A shortwave set skips to a shortwave transmitter with a large antenna; with no one targeted, the GM vouches for the far end.
  if (theirs && shortwave && !canSkip(item, theirs)) lines.push(F("NoLargeAntenna", { name: theirs.name }));
  const skip = shortwave && (!theirs || canSkip(item, theirs)) ? answer.skip : null;
  const heard = listen({ api, actor, item, yards: answer.yards, range: (answer.range || Infinity) * setUp.rangeFactor, conditions: answer.conditions, galvanometer: answer.galvanometer, drift: answer.drift, skip, design: setUp.modifiers });
  if (!heard) return void (lines.length ? card(actor, F("TuningLabel", { name: item.name }), lines) : undefined);
  const title = F("TuningLabel", { name: item.name });
  if (heard.roll) await api.roll.success({ actor, base: heard.roll.base ?? skillBase(api, actor, COMM), skill: heard.roll.skill, label: heard.roll.label, modifiers: heard.roll.modifiers, tags: heard.roll.tags, ...(target ? { subject: target } : {}) } as any);
  await card(actor, title, [...lines, ...heard.lines]);
}

/** Lens shine on a bright day: a Stealth roll, +4 with a hood or anti-reflective screens (p. 47). */
async function lensShine(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const optic = opticOf(item);
  const hooded = optic?.antiReflective || sensorData(item).options.lensHood;
  const modifiers = hooded ? [{ label: F("HoodLine", { name: item.name }), value: LENS_HOOD }] : [];
  const base = api.actors.skillLevel(actor, "Stealth") ?? (api.actors.attribute(actor, "DX") ?? 10) - 5;
  await api.roll.success({ actor, base, skill: "Stealth", label: F("LensShineRoll", { name: item.name }), modifiers, tags: ["lensShine"] } as any);
}

/**
 * Listening with a hydrophone (p. 49): Electronics Operation (Sonar) with its
 * bonus, the target's size and speed, and penalties for range and the
 * current. Success fixes the target: +8 to identify, +4 to shadow, and --
 * except with a search hydrophone -- +3 to hit it with an aimed attack.
 */
function hydrophone(api: GWorldApi, item: any, actor: any): Promise<void> {
  return hydrophoneRoll(api, item, actor, { bonus: hydrophoneBonus(nameOf(item), itemTl(item)) ?? 0, fix: true });
}

/**
 * The hydrophone's detection roll, for High-Tech's tactical hydrophones
 * (`fix`: success fixes the target) and for the supplement Electricity and
 * Electronics' basic one, which hears and detects but fixes nothing (HT:EE
 * p. 31).
 */
export async function hydrophoneRoll(api: GWorldApi, item: any, actor: any, options: { bonus: number; fix: boolean }): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const bonus = options.bonus;
  const sm = Number(target?.system?.sm) || 0;
  const measured = target ? yardsBetween(actor, target) : null;
  const answer = await ask(L("HydrophoneTitle"),
    row(L("TargetSm"), `<input type="number" name="sm" value="${sm}" step="1" style="width:70px" />`)
    + row(L("TargetSpeed"), `<input type="number" name="speed" value="0" min="0" step="any" style="width:70px" />`)
    + row(L("Distance"), `<input type="number" name="range" value="${Math.round(measured ?? 100)}" min="0" style="width:90px" />`)
    + row(L("Current"), `<input type="number" name="current" value="0" min="0" step="any" style="width:70px" />`),
    (form) => ({
      sm: Number(form.querySelector<HTMLInputElement>("[name=sm]")?.value) || 0,
      speed: Number(form.querySelector<HTMLInputElement>("[name=speed]")?.value) || 0,
      range: Number(form.querySelector<HTMLInputElement>("[name=range]")?.value) || 0,
      current: Number(form.querySelector<HTMLInputElement>("[name=current]")?.value) || 0,
    }));
  if (!answer) return;
  const modifiers = [
    ...(bonus ? [{ label: item.name, value: bonus }] : []),
    ...hydrophoneModifiers(answer, (yards) => api.rules.speedRangeModifier(yards)).map((l) => ({ label: L(`HydrophoneLine.${l.key}`), value: l.value })),
  ];
  const skill = "Electronics Operation (Sonar)";
  const result: any = await api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label: F("HydrophoneRoll", { name: item.name }), modifiers, tags: ["detection", "hydrophone"], ...(target ? { subject: target } : {}) } as any);
  if (!result?.success || !options.fix) return;
  const search = sensorData(item).options.search === true;
  if (target && !search) await setLock(api, actor, item, target);
  await card(actor, F("HydrophoneRoll", { name: item.name }), [F(search ? "FixSearch" : "HydrophoneFix", { identify: HYDROPHONE_FIX.identify, shadow: HYDROPHONE_FIX.shadow, hit: HYDROPHONE_FIX.hit })]);
}

/** Sound-detection gear: +4 to identify a sound, or locating one by its distance and loudness, with the ambient noise (p. 49). */
async function soundDetection(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("SoundTitle"),
    row(L("TaskLabel"), `<select name="task"><option value="identify">${esc(F("Sound.identify", { bonus: SOUND_IDENTIFY }))}</option><option value="locate">${esc(L("Sound.locate"))}</option></select>`)
    + row(L("SoundMiles"), `<input type="number" name="miles" value="10" min="0" step="any" style="width:70px" />`)
    + row(L("SoundDecibels"), `<input type="number" name="db" value="100" min="0" step="10" style="width:70px" />`)
    + row(L("Ambient"), `<input type="number" name="ambient" value="0" min="-10" max="0" step="1" style="width:70px" />`),
    (form) => ({
      task: form.querySelector<HTMLSelectElement>("[name=task]")?.value === "locate" ? "locate" : "identify",
      miles: Number(form.querySelector<HTMLInputElement>("[name=miles]")?.value) || 0,
      db: Number(form.querySelector<HTMLInputElement>("[name=db]")?.value) || 0,
      ambient: Math.max(-10, Math.min(0, Number(form.querySelector<HTMLInputElement>("[name=ambient]")?.value) || 0)),
    }));
  if (!answer) return;
  const modifiers: Array<{ label: string; value: number }> = [];
  if (answer.task === "identify") modifiers.push({ label: item.name, value: SOUND_IDENTIFY });
  else {
    const located = soundLocationModifier(answer.miles, answer.db);
    if (located) modifiers.push({ label: F("SoundLocate", { miles: answer.miles, db: answer.db }), value: located });
  }
  if (answer.ambient) modifiers.push({ label: L("AmbientLine"), value: answer.ambient });
  const skill = "Electronics Operation (Sensors)";
  await api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label: F("SoundRoll", { name: item.name }), modifiers, tags: ["hearing"] } as any);
  if (answer.task === "locate") await card(actor, F("SoundRoll", { name: item.name }), [L("Triangulate")]);
}

/** Registers the engine's parts, once whichever books ask, and what this book prints alone. */
export function readyHighTechSensors(api: GWorldApi, on: { radios: () => boolean; active: () => boolean; visual: () => boolean; passive: () => boolean; tuning?: () => boolean; design?: () => boolean }): void {
  readySensors(api);

  const radioWith = (item: any, option: string) => on.radios() && Boolean(radioOf(item)) && sensorData(item).options[option] === true;
  const actions: Array<{ key: string; label: string; icon: string; visible: (item: any) => boolean; run: (item: any, actor: any) => Promise<void> }> = [
    { key: "ht-telegraphy", label: L("TelegraphyTitle"), icon: "fa-solid fa-tower-cell", visible: (item) => on.radios() && (isTelegraph(nameOf(item)) || Boolean(radioOf(item))), run: (item, actor) => telegraphy(api, item, actor) },
    { key: "ht-direction-finder", label: L("DirectionFinderTitle"), icon: "fa-solid fa-compass", visible: (item) => on.radios() && findsDirection(item), run: (item, actor) => directionFinder(api, item, actor) },
    { key: "ht-intercept", label: L("InterceptTitle"), icon: "fa-solid fa-ear-listen", visible: (item) => radioWith(item, "intercept"), run: (item, actor) => intercept(api, item, actor) },
    { key: "ht-radio-tuning", label: L("TuneButton"), icon: "fa-solid fa-radio", visible: (item) => Boolean(on.tuning?.()) && Boolean(radioOf(item) || peripheralOf(item)), run: (item, actor) => tuneIn(api, item, actor) },
    { key: "ht-lens-shine", label: L("LensShineTitle"), icon: "fa-solid fa-sun", visible: (item) => on.visual() && Boolean(opticOf(item)) && !opticOf(item)!.mounted, run: (item, actor) => lensShine(api, item, actor) },
    { key: "ht-hydrophone", label: L("HydrophoneTitle"), icon: "fa-solid fa-water", visible: (item) => on.passive() && hydrophoneBonus(nameOf(item), itemTl(item)) !== null, run: (item, actor) => hydrophone(api, item, actor) },
    { key: "ht-sound-detection", label: L("SoundTitle"), icon: "fa-solid fa-volume-high", visible: (item) => on.passive() && isSoundDetector(nameOf(item)), run: (item, actor) => soundDetection(api, item, actor) },
  ];
  for (const action of actions) api.sheets.registerRowAction({ module: MODULE_ID, itemTypes: ["equipment"], ...action });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-emissions", label: L("EmissionsTitle"), icon: "fa-solid fa-wave-square", visible: rangefindingOn, open: () => detectEmissions(api) });

  // The plotter's own roll in a fix's Quick Contest, for its criticals (HT:EE p. 47).
  Hooks.on(api.combat.hooks.afterQuickContest, (context: any) => {
    if (Array.isArray(context?.tags) && context.tags.includes("triangulation")) lastFixRoll = context.first?.outcome ?? null;
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor) return;
    const skill = String(context?.skill ?? "");
    const tags: string[] = Array.isArray(context?.tags) ? context.tags : [];
    const subject = context?.subject ?? null;
    if (on.visual()) {
      const thermal = wornViewer(actor, true);
      // A thermograph: +3 to Tracking a trail no more than an hour old, +2 to Vision to spot a warm target (p. 48).
      if (thermal && /^tracking\b/i.test(skill)) context.modifiers.push({ label: F("HeatTrail", { name: thermal.name }), value: THERMOGRAPH.tracking });
      if (thermal && subject && tags.includes("vision") && tags.includes("detection")) context.modifiers.push({ label: F("WarmTarget", { name: thermal.name }), value: THERMOGRAPH.spot });
      // An active IR source is a light to night-vision gear and thermographs: +4 to locate it (p. 47).
      const viewer = subject && tags.includes("detection") ? wornViewer(actor) : null;
      if (viewer && shinesInfrared(subject)) context.modifiers.push({ label: F("InfraredSource", { name: viewer.name }), value: IR_LOCATE });
    }
    // A hydrophone's fix: +4 to shadow the target (p. 49).
    if (on.passive() && subject && /^shadowing\b/i.test(skill) && lockTargetOf(api, actor) === String(subject.uuid)) {
      const fix = lockedSensor(api, actor, [subject]);
      if (fix && hydrophoneBonus(nameOf(fix.item), itemTl(fix.item)) !== null) context.modifiers.push({ label: F("FixLine", { name: fix.item.name }), value: HYDROPHONE_FIX.shadow });
    }
  });
}
