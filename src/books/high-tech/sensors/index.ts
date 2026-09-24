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
 *     direction finder's fix and an intercept (pp. 36-40).
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
import type { Comm, CommPair, SensorData, SensorFigures, SensorParts, SweepContext, WornSenses } from "../../../shared/sensors/data.js";
import { activeRangePenalty, emissionDetectionRange, slowedRangeFactor, type CommMode } from "../../../shared/sensors/rules.js";
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
  activeModes,
  directionFinderFix,
  directionalMicLevels,
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
} from "./rules.js";
import { DETECTOR_SKILLS, DWELL, detectorSkill, dwellRange, emissionModifier, emissionReach, rangefindingPenalty, sensorSizeModifier, type Dwell } from "./rangefinding.js";

const NS = "GCC.HT";
const L = (key: string) => game.i18n.localize(`${NS}.Sensor.${key}`);
const F = (key: string, data: Record<string, unknown>) => SF(NS, key, data);
const distance = (yards: number) => distanceText(NS, yards);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const COMM = "Electronics Operation (Communications)";
const EW = "Electronics Operation (EW)";

/** The book's four switches, as full keys. */
export interface SensorSwitches {
  radios: string;
  activeSensors: string;
  visualSensors: string;
  passiveSensors: string;
  /** The supplement's refinements to the active sensors (HT:EE p. 35). */
  rangefindingEmissions?: string;
}

/** The supplement's rangefinding switch's full key, once registered. */
let rangefindingKey: string | null = null;
const rangefindingOn = () => rangefindingKey !== null && isRuleOn(rangefindingKey);

/** A sensor whose emissions a detector can pick up: sonar and radar (High-Tech p. 45; HT:EE p. 35). */
const emits = (figures: ActiveFigures | undefined) => figures?.kind === "sonar" || figures?.kind === "radar";

const nameOf = (item: any) => String(item?.name ?? "").trim();

/** The radio a record is, at its TL. */
const radioOf = (item: any) => radioByName(nameOf(item), itemTl(item));

/** A comm's range in yards, with the options that change it: a long antenna's double, the laser's wide beam, the military divecom (pp. 39-40). */
function commOfItem(item: any): Comm | null {
  const data = sensorData(item);
  const radio = radioOf(item);
  if (radio) return { family: "radio", size: radio.size, range: radio.range, cuts: "radio" };
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
    lines.push(F("RadioRange", { range: distance(range), tl: radio.tl }));
    if (radio.size === "large") lines.push(L("LargeSetUp"));
    if (antenna) lines.push(L("LongAntennaLine"));
    if (data.options.satelliteUplink) lines.push(L("UplinkLine"));
    lines.push(F("Detected", { range: distance(radioDetectionRange(range, data.options.eccm === true)) }));
    lines.push(L("RadioInUse"));
    lines.push(F("SlowedData", { quarter: slowedRangeFactor(1 / 4), hundredth: slowedRangeFactor(1 / 100), tenThousandth: slowedRangeFactor(1 / 10000) }));
    if (data.options.codeOnly) lines.push(L("CodeOnlyLine"));
    if (data.options.directionFinder) lines.push(L("DirectionFinderLine"));
    if (data.options.intercept) lines.push(L("InterceptLine"));
    if (data.options.eccm) lines.push(L("EccmLine"));
    if (data.options.gps) lines.push(L("GpsLine"));
    if (data.options.radiotelephone) lines.push(L("RadiotelephoneLine"));
    if (data.commMode) lines.push(L(`CommMode.${data.commMode}`));
    options.push(...radioOptions(radio.size, tl));
    return true;
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
    for (const key of radioOptions(radio.size, tl)) {
      if (!data.options[key]) continue;
      cost *= RADIO_OPTIONS[key]!.cost;
      weight *= RADIO_OPTIONS[key]!.weight ?? 1;
    }
    if (data.commMode === "receiver") {
      cost *= 0.1;
      weight *= 0.2;
    }
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

/** Two comms' range (p. 38), with the lines about how each was built. */
function pairRange({ a, b }: CommPair): { range: number; lines: string[] } {
  const da = sensorData(a.item);
  const db = sensorData(b.item);
  const radio = a.comm.family === "radio";
  const side = (item: any, comm: Comm, data: SensorData) => ({
    size: comm.size,
    range: comm.range ?? 0,
    longAntenna: radio && data.options.longAntenna === true,
    satelliteUplink: radio && data.options.satelliteUplink === true,
  });
  const range = radioPairRange(side(a.item, a.comm, da), side(b.item, b.comm, db));
  const lines: string[] = [];
  if (!Number.isFinite(range)) lines.push(L("UplinkReach"));
  for (const [item, data] of [[a.item, da], [b.item, db]] as const) if (data.commMode === "receiver") lines.push(F("ReceiveOnly", { name: item.name }));
  return { range, lines };
}

/** A sweep with an active sensor (pp. 45-47). */
async function sweep({ api, selected, target, sensors, measured }: SweepContext): Promise<void> {
  const kinds = new Set(sensors.map((s) => activeFigures(s.item)?.kind));
  const imagingAny = sensors.some((s) => sensorData(s.item).options.imaging);
  const refined = rangefindingOn();
  const answer = await ask(L("SweepTitle"),
    row(L("Sensor"), `<select name="sensor">${sensors.map((s, i) => `<option value="${i}">${esc(s.item.name)}</option>`).join("")}</select>`)
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round((measured ?? 100) * 10) / 10}" min="0" step="any" style="width:90px" />`)
    + row(F("OutsideArc", { arc: SENSOR_ARC }), `<input type="checkbox" name="arc" />`)
    + (kinds.has("sonar") ? row(L("Noise"), `<select name="noise">${SONAR_NOISE.map((n) => `<option value="${n}">${n === 0 ? esc(L("NoNoise")) : n}</option>`).join("")}</select>`) : "")
    + (imagingAny ? row(L("ImagingMode"), `<input type="checkbox" name="imaging" />`) : "")
    + (kinds.has("gpr") ? row(L("Medium"), `<select name="medium">${Object.keys(GPR_MEDIUM).map((m) => `<option value="${m}">${esc(L(`Medium.${m}`))}</option>`).join("")}</select>`) : "")
    + (kinds.has("radar") && target ? row(L("Countermeasures"), `<select name="counter"><option value="">${esc(L("Counter.none"))}</option>${Object.keys(COUNTERMEASURES).map((c) => `<option value="${c}">${esc(L(`Counter.${c}`))}</option>`).join("")}</select>`) : "")
    + (refined ? row(L("TargetSm"), `<input type="number" name="sm" value="${Number(target?.system?.sm) || 0}" step="1" style="width:70px" />`) + dwellRow() : ""),
    (form) => ({
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
    // The supplement's ground-penetrating radar: success is +2 to a skill the survey serves (HT:EE p. 35).
    if (refined && figures.survey && result?.success) lines.push(F("SurveyResult", { bonus: signed(figures.survey) }));
  }
  if (lines.length) await card(selected, title, lines);
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

const FIGURES: SensorFigures = {
  options: ["codeOnly", "directionFinder", "intercept", "radiotelephone", "eccm", "gps", "satelliteUplink", "longAntenna", "wideBeam", "military", "tactical", "lpi", "imaging", "lensHood", "irIlluminated", "search"],
  commModes: MODES,
  comm: commOfItem,
  active: (item, data) => {
    const figures = activeFigures(item);
    return figures ? { kind: figures.kind, range: figures.range(itemTl(item)) * (data.options.lpi ? 0.5 : 1) } : null;
  },
  senses,
  sheet,
  price,
  pairRange,
  dataRates: DATA_RATES,
  sweep,
  // Only a tactical sonar or radar has the targeting mode (pp. 45-46).
  canLock: (item, data) => data.options.tactical === true && Boolean(activeFigures(item)),
  lockCounts: () => true,
};

/** High-Tech's comms and sensors table, behind the book's own four switches. */
export function highTechSensors(switches: SensorSwitches): SensorTable {
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
    + row(F("Enciphered", { modifier: ENCIPHERED }), `<input type="checkbox" name="cipher" />`),
    (form) => ({
      task: (form.querySelector<HTMLSelectElement>("[name=task]")?.value ?? "send") as (typeof tasks)[number],
      cipher: Boolean(form.querySelector<HTMLInputElement>("[name=cipher]")?.checked),
    }));
  if (!answer) return;
  const modifiers: Array<{ label: string; value: number }> = answer.cipher ? [{ label: L("EncipheredLine"), value: ENCIPHERED }] : [];
  const label = F("TelegraphyRoll", { task: L(`Telegraphy.${answer.task}`), name: item.name });
  const contested = answer.task === "fake" || (answer.task === "tap" && tapIsContested(itemTl(item)));
  const recipient = picked().target;
  if (contested && !recipient) return void ui.notifications?.warn(L("RecipientPick"));
  if (contested) {
    const mine = answer.task === "fake" ? [...modifiers, { label: L("FakeFistLine"), value: FAKE_FIST }] : modifiers;
    await api.roll.quickContest({
      label,
      first: { actor, base: skillBase(api, actor, COMM), modifiers: mine, note: COMM },
      second: { actor: recipient, base: skillBase(api, recipient, COMM), modifiers, note: COMM },
      tags: ["telegraphy"],
    } as any);
    return;
  }
  await api.roll.success({ actor, base: skillBase(api, actor, COMM), skill: COMM, label, modifiers, tags: ["telegraphy"] } as any);
  await card(actor, label, [L(`Telegraphy.${answer.task}Result`)]);
}

/** A radio direction finder's fix on the targeted character's transmitter (pp. 38-39). */
async function directionFinder(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = picked().target;
  if (!actor || !target) return void ui.notifications?.warn(L("TransmitterPick"));
  const label = F("DirectionFinderRoll", { name: item.name, target: target.name });
  const contest: any = await api.roll.quickContest({
    label,
    first: { actor, base: skillBase(api, actor, COMM), note: COMM },
    second: { actor: target, base: skillBase(api, target, COMM), note: COMM },
    tags: ["directionFinder"],
  } as any);
  if (!contest) return;
  const won = contest.outcome === "first";
  const margin = Number(contest.marginOfVictory) || 0;
  await card(actor, label, [won ? L(`Fix.${directionFinderFix(margin)}`) : L("Fix.none"), L("Fix.again")]);
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
  const own = api.actors.skillLevel(actor, EW) ?? (api.actors.skillLevel(actor, COMM) !== null ? api.actors.skillLevel(actor, COMM)! + EW_FROM_COMM : skillBase(api, actor, EW));
  const label = F("InterceptRoll", { name: item.name });
  if (answer.avoiding && target) {
    await api.roll.quickContest({ label, first: { actor, base: own, note: EW }, second: { actor: target, base: skillBase(api, target, EW), note: EW }, tags: ["intercept"] } as any);
  } else {
    await api.roll.success({ actor, base: own, skill: EW, label, tags: ["intercept"] } as any);
  }
  if (eccm) await card(actor, label, [F("EccmSpoofs", { name: theirs.name })]);
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
async function hydrophone(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const bonus = hydrophoneBonus(nameOf(item), itemTl(item)) ?? 0;
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
  if (!result?.success) return;
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
export function readyHighTechSensors(api: GWorldApi, on: { radios: () => boolean; active: () => boolean; visual: () => boolean; passive: () => boolean }): void {
  readySensors(api);

  const radioWith = (item: any, option: string) => on.radios() && Boolean(radioOf(item)) && sensorData(item).options[option] === true;
  const actions: Array<{ key: string; label: string; icon: string; visible: (item: any) => boolean; run: (item: any, actor: any) => Promise<void> }> = [
    { key: "ht-telegraphy", label: L("TelegraphyTitle"), icon: "fa-solid fa-tower-cell", visible: (item) => on.radios() && (isTelegraph(nameOf(item)) || Boolean(radioOf(item))), run: (item, actor) => telegraphy(api, item, actor) },
    { key: "ht-direction-finder", label: L("DirectionFinderTitle"), icon: "fa-solid fa-compass", visible: (item) => radioWith(item, "directionFinder"), run: (item, actor) => directionFinder(api, item, actor) },
    { key: "ht-intercept", label: L("InterceptTitle"), icon: "fa-solid fa-ear-listen", visible: (item) => radioWith(item, "intercept"), run: (item, actor) => intercept(api, item, actor) },
    { key: "ht-lens-shine", label: L("LensShineTitle"), icon: "fa-solid fa-sun", visible: (item) => on.visual() && Boolean(opticOf(item)) && !opticOf(item)!.mounted, run: (item, actor) => lensShine(api, item, actor) },
    { key: "ht-hydrophone", label: L("HydrophoneTitle"), icon: "fa-solid fa-water", visible: (item) => on.passive() && hydrophoneBonus(nameOf(item), itemTl(item)) !== null, run: (item, actor) => hydrophone(api, item, actor) },
    { key: "ht-sound-detection", label: L("SoundTitle"), icon: "fa-solid fa-volume-high", visible: (item) => on.passive() && isSoundDetector(nameOf(item)), run: (item, actor) => soundDetection(api, item, actor) },
  ];
  for (const action of actions) api.sheets.registerRowAction({ module: MODULE_ID, itemTypes: ["equipment"], ...action });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-emissions", label: L("EmissionsTitle"), icon: "fa-solid fa-wave-square", visible: rangefindingOn, open: () => detectEmissions(api) });

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
