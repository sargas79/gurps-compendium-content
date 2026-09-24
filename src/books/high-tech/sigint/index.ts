/**
 * The electronic battlefield's communications from High-Tech: Electricity and
 * Electronics (HT:EE pp. 46-48), registered with the system through the
 * add-on API. The rules are in `rules.ts`; what they add to High-Tech's radios
 * -- the options, their prices and sheet lines, triangulation -- is in
 * `../sensors/index.ts`.
 *
 *   - **Signals intelligence (signalsIntelligence):** a row button on a radio,
 *     a radio peripheral or a spectrum analyzer. Monitoring routine traffic
 *     (Electronics Operation (Communications or EW), +4 with an intercept
 *     unit); listening for a sender, continuous (no roll unless something
 *     penalizes it), ongoing or rare (a roll each 4-hour watch), with the
 *     tuning roll's modifiers, -5 for a plain receiver, the handheld
 *     spectrum analyzer's -2, -4 against frequency hopping, and the time or
 *     haste of watching several channels or scanning a band with a dipole or
 *     directional antenna; identifying an active frequency with a spectrum
 *     analyzer (+4); aiming an antenna at a transmitter found, as an area or
 *     cone attack that scatters on a miss; and taking a bearing on a beacon
 *     for +1 to Navigation. An operator avoiding interception makes each a
 *     Quick Contest of Electronics Operation (EW).
 *   - **Cipher machines (cipherMachines):** a cipher machine's row sends
 *     enciphered text at -4, which extra time offsets; the code-breaking
 *     machines are in `../codes/`.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, card, carried, esc, itemTl, picked, row, sensorData, skillBase, yardsBetween } from "../../../shared/sensors/index.js";
import { rangeExtensionModifier } from "../../../shared/sensors/rules.js";
import { CONDITIONS, INTERFERENCE, tuningRoll } from "../sensors/reception.js";
import { ewLevel, findsDirection, hearingModifier, peripheralOf, radioOf, spreadOf, tracingOscilloscope } from "../sensors/index.js";
import { radioPairRange } from "../sensors/rules.js";
import {
  BEACON,
  COMM,
  DIGITAL_ANALYZER,
  ENCIPHERED_TEXT,
  EW,
  IDENTIFY_FREQUENCY,
  IMPROVISED_GEAR,
  INTERCEPT_ROUTINE,
  NAVIGATION,
  OSCILLOSCOPE,
  SEARCHES,
  TRANSMISSIONS,
  WATCH_HOURS,
  aimHaste,
  aimShape,
  channelHaste,
  channelMinutes,
  detectionRolled,
  encipheredTimeBonus,
  isCipherMachine,
  rareScanPenalty,
  scanSeconds,
  spectrumAnalyzerOf,
  spreadDetectModifier,
  spreadDetectionRange,
  type SearchAntenna,
  type Transmission,
} from "./rules.js";

const NS = "GCC.HT";
const L = (key: string) => game.i18n.localize(`${NS}.Sigint.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.Sigint.${key}`, data);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const nameOf = (item: any) => String(item?.name ?? "").trim();
const num = (form: HTMLElement, name: string) => Number(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.value) || 0;
const pick = (form: HTMLElement, name: string) => form.querySelector<HTMLSelectElement>(`[name=${name}]`)?.value ?? "";
const checked = (form: HTMLElement, name: string) => Boolean(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.checked);
const select = (name: string, choices: ReadonlyArray<{ value: string; label: string }>, chosen = "") =>
  `<select name="${name}">${choices.map((c) => `<option value="${esc(c.value)}" ${c.value === chosen ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`;

export interface SigintSwitches {
  sigint: () => boolean;
  cipher: () => boolean;
}

type Line = { label: string; value: number };

/** A record that listens for signals: a radio, a radio peripheral or a spectrum analyzer (HT:EE pp. 30, 47-48). */
const listens = (item: any) => Boolean(radioOf(item) || peripheralOf(item) || spectrumAnalyzerOf(nameOf(item)));

/** A carried spectrum analyzer, the item's own first (HT:EE pp. 11, 48). */
function analyzerOf(item: any, actor: any): any {
  if (spectrumAnalyzerOf(nameOf(item))) return item;
  return [...(actor?.items ?? [])].find((i: any) => carried(i) && spectrumAnalyzerOf(nameOf(i))) ?? null;
}

/**
 * The gear's modifier for signals intelligence (HT:EE pp. 47-48): the
 * intercept unit, a direction finder and HF/DF are the proper gear; the
 * handheld spectrum analyzer finds transmitters at -2; any other receiver is
 * improvised, -5.
 */
function gearLine(item: any): Line | null {
  if (spectrumAnalyzerOf(nameOf(item)) === "digital") return { label: F("AnalyzerLine", { name: item.name }), value: DIGITAL_ANALYZER };
  if (isSigintGear(item)) return null;
  return { label: L("ImprovisedLine"), value: IMPROVISED_GEAR };
}
const isSigintGear = (item: any) => Boolean(radioOf(item)) && (sensorData(item).options.intercept === true || findsDirection(item));

/** The antenna a set searches with, as built. */
function antennaOfItem(item: any): SearchAntenna {
  const options = sensorData(item).options;
  return options.directionalAntenna ? "directional" : options.dipoleAntenna ? "dipole" : "whip";
}

/** The targeted character's transmitting radio, if any. */
function theirRadio(target: any): any {
  return target ? [...(target.items ?? [])].find((i: any) => carried(i) && radioOf(i)) ?? null : null;
}

/** Rolls a SIGINT task: unopposed, or a Quick Contest of EW with an operator avoiding interception (HT:EE p. 47). */
async function rollTask(api: GWorldApi, options: { actor: any; base: number; skill: string; label: string; modifiers: Line[]; tags: string[]; item: any; against: any | null }): Promise<{ success: boolean; margin: number } | null> {
  const tags = ["sigint", ...options.tags];
  if (options.against) {
    const contest: any = await api.roll.quickContest({
      label: options.label,
      first: { actor: options.actor, base: options.base, modifiers: options.modifiers, note: options.skill },
      second: { actor: options.against, base: ewLevel(api, options.against), note: EW },
      tags,
    } as any);
    if (!contest) return null;
    const won = contest.outcome === "first";
    const margin = Number(contest.marginOfVictory) || 0;
    return { success: won, margin: won ? margin : -margin };
  }
  const result: any = await api.roll.success({ actor: options.actor, base: options.base, skill: options.skill, label: options.label, modifiers: options.modifiers, tags, item: options.item } as any);
  return result ? { success: Boolean(result.success), margin: Number(result.margin) || 0 } : null;
}

// ── the tasks (HT:EE pp. 47-48) ──

/** Monitoring routine traffic: Electronics Operation (Communications or EW), +4 with an intercept unit (HT:EE pp. 47-48). */
async function monitorRoutine(api: GWorldApi, item: any, actor: any): Promise<void> {
  const comm = skillBase(api, actor, COMM);
  const ew = ewLevel(api, actor);
  const modifiers: Line[] = radioOf(item) && sensorData(item).options.intercept ? [{ label: L("InterceptUnit"), value: INTERCEPT_ROUTINE }] : [];
  const label = F("RoutineLabel", { name: item.name });
  await api.roll.success({ actor, base: Math.max(comm, ew), skill: ew > comm ? EW : COMM, label, modifiers, tags: ["sigint", "routine"], item } as any);
  await card(actor, label, [L("RoutineResult")]);
}

/**
 * Listening for a particular sender (HT:EE p. 47), tuned to its frequency,
 * to several channels in turn, or scanning the band.
 */
async function detectSender(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = picked().target;
  const theirs = theirRadio(target);
  const measured = target ? yardsBetween(actor, target) : null;
  const mine = radioOf(item);
  const theirFigures = theirs ? radioOf(theirs) : null;
  const standard = theirFigures && mine ? radioPairRange({ size: mine.size, range: mine.range }, { size: theirFigures.size, range: theirFigures.range }) : theirFigures?.range ?? mine?.range ?? peripheralOf(item)?.range ?? 0;
  const answer = await ask(L("DetectTitle"),
    row(L("TransmissionField"), select("transmission", TRANSMISSIONS.map((t) => ({ value: t, label: L(`Transmission.${t}`) })), "ongoing"))
    + row(L("FrequencyField"), select("frequency", ["known", "channels", "scan"].map((f) => ({ value: f, label: L(`Frequency.${f}`) })), "known"))
    + row(L("Channels"), `<input type="number" name="channels" value="1" min="1" step="1" style="width:70px" />`)
    + row(L("AntennaField"), select("antenna", (Object.keys(SEARCHES) as SearchAntenna[]).map((a) => ({ value: a, label: F(`Antenna.${a}`, { searches: SEARCHES[a] }) })), antennaOfItem(item)))
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? standard)}" min="0" style="width:90px" />`)
    + row(L("SignalRange"), `<input type="number" name="range" value="${Math.round(standard)}" min="0" style="width:90px" />`)
    + row(L("Conditions"), select("conditions", CONDITIONS.map((c) => ({ value: String(c), label: c === 0 ? L("ConditionsNone") : c === INTERFERENCE.worst ? F("ConditionsBlocked", { value: c }) : signed(c) })), "0"))
    + row(L("Avoiding"), `<input type="checkbox" name="avoiding" />`),
    (form) => ({
      transmission: (pick(form, "transmission") || "ongoing") as Transmission,
      frequency: (pick(form, "frequency") || "known") as "known" | "channels" | "scan",
      channels: Math.max(1, Math.floor(num(form, "channels") || 1)),
      antenna: (pick(form, "antenna") || "whip") as SearchAntenna,
      yards: num(form, "yards"),
      range: num(form, "range"),
      conditions: Number(pick(form, "conditions")) || 0,
      avoiding: checked(form, "avoiding"),
    }));
  if (!answer) return;
  if (answer.avoiding && !target) return void ui.notifications?.warn(L("SenderPick"));
  const label = F("DetectLabel", { name: item.name });
  const lines: string[] = [];
  const spread = theirs ? spreadOf(theirs) : {};
  // Direct sequence can't be detected past 1.5 times the radio's range (HT:EE p. 47).
  if (theirFigures && spread.direct && answer.yards > spreadDetectionRange(theirFigures.range, spread)) return void card(actor, label, [F("DirectSequenceOut", { name: theirs.name })]);
  // The tuning roll's modifiers apply (HT:EE pp. 29, 47).
  const stretch = answer.range > 0 ? rangeExtensionModifier(answer.yards, answer.range) : 0;
  const tuning = tuningRoll({ rangeModifier: stretch, conditions: answer.conditions, hearing: hearingModifier(api, actor), galvanometer: false, enhanced: Boolean(peripheralOf(item)) });
  if (!tuning) return void card(actor, label, [L(answer.conditions <= INTERFERENCE.worst ? "Blocked" : "OutOfRange")]);
  const modifiers: Line[] = tuning.lines.map((l) => ({ label: L(`Tuning.${l.key}`), value: l.value }));
  const gear = gearLine(item);
  if (gear) modifiers.push(gear);
  const hop = spreadDetectModifier(spread);
  if (hop) modifiers.push({ label: F("HoppingLine", { name: theirs.name }), value: hop });
  const searches = SEARCHES[answer.antenna];
  const tl = itemTl(item);
  if (answer.frequency === "channels") {
    const total = answer.channels * searches;
    if (answer.transmission === "rare") {
      const haste = channelHaste(total);
      if (haste) modifiers.push({ label: F("ChannelsLine", { count: total }), value: haste });
    } else lines.push(F("ChannelsTime", { minutes: channelMinutes(total) }));
  } else if (answer.frequency === "scan") {
    if (answer.transmission === "rare") modifiers.push({ label: F("ScanRareLine", { tl }), value: rareScanPenalty(tl, answer.antenna) });
    else {
      const computer = tl >= 8 && radioOf(item) !== null && sensorData(item).options.intercept === true;
      const seconds = scanSeconds(tl, computer);
      if (seconds !== null) lines.push(F(seconds < 60 ? "ScanSeconds" : "ScanMinutes", { value: (seconds * searches) / (seconds < 60 ? 1 : 60), scans: searches }));
    }
  }
  if (answer.transmission === "rare") lines.push(F("RareWatch", { hours: WATCH_HOURS }));
  // A continuous signal is found with no roll unless something penalizes it; then the roll comes after a minute (HT:EE p. 47).
  if (!answer.avoiding && !detectionRolled(answer.transmission, modifiers)) return void card(actor, label, [...lines, L("FoundAutomatically")]);
  if (answer.transmission === "continuous") lines.push(L("AfterAMinute"));
  const result = await rollTask(api, { actor, base: ewLevel(api, actor), skill: EW, label, modifiers, tags: ["detection"], item, against: answer.avoiding ? target : null });
  if (!result) return;
  lines.push(L(result.success ? "Found" : "NotFound"));
  await card(actor, label, lines);
}

/** Identifying an active frequency with a spectrum analyzer: Electronics Operation (EW) +4 (HT:EE p. 48). */
async function identifyFrequency(api: GWorldApi, item: any, actor: any): Promise<void> {
  const analyzer = analyzerOf(item, actor);
  if (!analyzer) return void ui.notifications?.warn(L("NoAnalyzer"));
  await api.roll.success({ actor, base: ewLevel(api, actor), skill: EW, label: F("IdentifyLabel", { name: analyzer.name }), modifiers: [{ label: analyzer.name, value: IDENTIFY_FREQUENCY }], tags: ["sigint", "identify"], item: analyzer } as any);
}

/**
 * Aiming an antenna at a transmitter found (HT:EE p. 47): a dipole or loop as
 * an area attack, at +4 as for an area of ground (p. B414), a directional
 * antenna as a cone (p. B413); automatic where the transmitter was found with
 * a directional antenna. At TL6 or with improvised gear it takes a minute,
 * with haste against a briefer transmission. Success gives the exact
 * direction; a miss scatters by its margin (p. B414).
 */
async function aimAntenna(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = picked().target;
  const measured = target ? yardsBetween(actor, target) : null;
  const own = antennaOfItem(item);
  const answer = await ask(L("AimTitle"),
    row(L("AntennaField"), select("antenna", (["dipole", "directional"] as const).map((a) => ({ value: a, label: L(`Aim.${a}`) })), own === "directional" ? "directional" : "dipole"))
    + row(L("FoundDirectional"), `<input type="checkbox" name="found" ${own === "directional" ? "checked" : ""} />`)
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? 1760)}" min="0" style="width:90px" />`)
    + row(L("TransmissionSeconds"), `<input type="number" name="seconds" value="0" min="0" style="width:70px" />`)
    + row(L("Avoiding"), `<input type="checkbox" name="avoiding" />`),
    (form) => ({
      antenna: (pick(form, "antenna") || "dipole") as SearchAntenna,
      found: checked(form, "found"),
      yards: num(form, "yards"),
      seconds: num(form, "seconds"),
      avoiding: checked(form, "avoiding"),
    }));
  if (!answer) return;
  if (answer.avoiding && !target) return void ui.notifications?.warn(L("SenderPick"));
  const label = F("AimLabel", { name: item.name });
  const beam = F(answer.antenna === "directional" ? "BeamDirectional" : "BeamDipole", {});
  if (answer.found && !answer.avoiding) return void card(actor, label, [L("AimAutomatic"), beam]);
  const shape = aimShape(answer.antenna);
  const modifiers: Line[] = [];
  if (shape === "area") modifiers.push({ label: L("AreaLine"), value: api.rules.AREA_ATTACK_BONUS });
  const gear = gearLine(item);
  if (gear) modifiers.push(gear);
  const haste = aimHaste(itemTl(item), gear?.value === IMPROVISED_GEAR, answer.seconds);
  if (haste) modifiers.push({ label: F("BriefLine", { seconds: answer.seconds }), value: haste });
  const scope = tracingOscilloscope(actor);
  if (scope) modifiers.push({ label: F("TracingLine", { name: scope.name }), value: OSCILLOSCOPE });
  const result = await rollTask(api, { actor, base: ewLevel(api, actor), skill: EW, label, modifiers, tags: ["antennaAim", shape], item, against: answer.avoiding ? target : null });
  if (!result) return;
  if (result.success) return void card(actor, label, [L("AimExact"), beam]);
  const direction = new Roll("1d6");
  await direction.evaluate();
  const scatter = api.rules.scatterDistance({ margin: -result.margin, distanceYards: answer.yards, directionRoll: Number(direction.total) || 1 });
  await card(actor, label, [F("AimScatter", { yards: scatter.yards, bearing: api.rules.scatterBearing(scatter.direction) })]);
}

/** A bearing on a beacon of known location: a minute, an unopposed roll, then Navigation at +1 (HT:EE p. 48). */
async function beaconBearing(api: GWorldApi, item: any, actor: any): Promise<void> {
  const answer = await ask(L("BeaconTitle"),
    row(L("NavigationSkill"), select("navigation", NAVIGATION.map((n) => ({ value: n, label: n })), NAVIGATION[0])),
    (form) => ({ navigation: pick(form, "navigation") || NAVIGATION[0] }));
  if (!answer) return;
  const comm = skillBase(api, actor, COMM);
  const ew = ewLevel(api, actor);
  const label = F("BeaconLabel", { name: item.name });
  const bearing: any = await api.roll.success({ actor, base: Math.max(comm, ew), skill: ew > comm ? EW : COMM, label, modifiers: [], tags: ["sigint", "beacon"], item } as any);
  if (!bearing) return;
  if (!bearing.success) return void card(actor, label, [L("BeaconLost")]);
  await api.roll.success({ actor, base: skillBase(api, actor, answer.navigation), skill: answer.navigation, label: F("NavigationLabel", { name: item.name }), modifiers: [{ label: L("BeaconLine"), value: BEACON.navigation }], tags: ["navigation"] } as any);
}

type Task = "routine" | "detect" | "identify" | "aim" | "beacon";

/** The tasks a record offers: a spectrum analyzer identifies and (the handheld one) finds transmitters; a radio does the rest, a direction finder takes beacons. */
function tasksFor(item: any, actor: any): Task[] {
  const analyzer = spectrumAnalyzerOf(nameOf(item));
  if (analyzer) return analyzer === "digital" ? ["detect", "identify"] : ["identify"];
  const tasks: Task[] = ["routine", "detect"];
  if (analyzerOf(item, actor)) tasks.push("identify");
  if (radioOf(item)) tasks.push("aim");
  if (radioOf(item) && findsDirection(item)) tasks.push("beacon");
  return tasks;
}

/** The SIGINT row button: pick a task, then its dialog (HT:EE pp. 47-48). */
export async function signalsIntelligence(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const tasks = tasksFor(item, actor);
  const chosen = await ask(L("Title"), row(L("TaskField"), select("task", tasks.map((t) => ({ value: t, label: L(`Task.${t}`) })), tasks[0])), (form) => ({ task: (pick(form, "task") || tasks[0]) as Task }));
  if (!chosen || !tasks.includes(chosen.task)) return;
  if (chosen.task === "routine") return monitorRoutine(api, item, actor);
  if (chosen.task === "detect") return detectSender(api, item, actor);
  if (chosen.task === "identify") return identifyFrequency(api, item, actor);
  if (chosen.task === "aim") return aimAntenna(api, item, actor);
  return beaconBearing(api, item, actor);
}

/** Sending enciphered text on a cipher machine: Electronics Operation (Communications) at -4, which extra time offsets (HT:EE p. 48). */
export async function sendEnciphered(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("CipherTitle"), row(L("CipherTime"), `<input type="number" name="times" value="1" min="1" step="1" style="width:70px" />`), (form) => ({ times: num(form, "times") || 1 }));
  if (!answer) return;
  const modifiers: Line[] = [{ label: L("CipherLine"), value: ENCIPHERED_TEXT }];
  const slow = encipheredTimeBonus(answer.times);
  if (slow) modifiers.push({ label: F("CipherTimeLine", { times: answer.times }), value: slow });
  await api.roll.success({ actor, base: skillBase(api, actor, COMM), skill: COMM, label: F("CipherLabel", { name: item.name }), modifiers, tags: ["enciphering"], item } as any);
}

/** Registers the row buttons. */
export function readySigint(api: GWorldApi, on: SigintSwitches): void {
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-sigint",
    itemTypes: ["equipment"],
    label: L("Title"),
    icon: "fa-solid fa-satellite-dish",
    visible: (item) => on.sigint() && listens(item),
    run: (item, actor) => signalsIntelligence(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-cipher-send",
    itemTypes: ["equipment"],
    label: L("CipherTitle"),
    icon: "fa-solid fa-lock",
    visible: (item) => on.cipher() && isCipherMachine(nameOf(item)),
    run: (item, actor) => sendEnciphered(api, item, actor),
  });
}

