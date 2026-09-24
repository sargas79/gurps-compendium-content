/**
 * High-Tech's security screening, surveillance and jamming (pp. 205-213,
 * 217), registered with the system through the add-on API under three
 * switches. The figures are in `rules.ts`; the bug sweep's Quick Contest and
 * the jammers are the shared countersurveillance engine's
 * (`src/shared/surveillance/`), with this book's table.
 *
 *   - **Security screening (securityScreening):** a row button on the metal
 *     detectors, baggage screeners, CT scanner and portable X-ray: the
 *     operator's Electronics Operation (Security) roll to claim the gear's
 *     bonus, then the search -- a Quick Contest of Search against the targeted
 *     character's Holdout, in which clothing built to hide things does
 *     nothing against a metal detector, or a roll of Search, Traps or
 *     Explosives (EOD) with the bonus. A GM tool runs a security system:
 *     spotting it (a Quick Contest against Camouflage if hidden), identifying
 *     it, defeating it in secret (Traps or Electronics Operation (Security),
 *     with the housing opened first where it's wired against tampering), a
 *     smart fence's section, a seismic detector's zone and a signature pad
 *     (an identity verifier's quality, and getting past it, are the locks
 *     rule's). A row button on the acoustic
 *     countersniper system rolls against 10 plus the shot's Hearing modifier;
 *     the other gear shows its figures on its sheet (pp. 205-207, 217).
 *   - **Surveillance gear (surveillanceGear):** a spike mike worn is
 *     Parabolic Hearing at (TL-4) levels; row buttons listen with a contact
 *     mike through a barrier at -(DR+HP)/5 (-5 more for a shielded room),
 *     guide a pinhead mike's cable on a DX-based roll, search with an
 *     endoscope, copy a sealed document with the document scanner, build a
 *     bug at home at SM+9, and sweep for a bug with a bug detector: the Quick
 *     Contest with whoever hid it, at the detector's quality, +4 for a radio
 *     beacon, none possible for a phone tap or laser mike (pp. 208-212).
 *   - **Jamming (jamming):** a jammer is switched on from its row; radio
 *     gear's row button rolls the Quick Contest against each switched-on
 *     jammer on the map within range, or the unopposed roll within 10 times
 *     its range; a cell-phone jammer blocks cellular beacons outright, and a
 *     call through it takes a Hearing roll at -2 to follow (pp. 212-213,
 *     revised by HT:EE p. 50).
 *   - **Jammer varieties (jammerKinds):** an operated radio jammer -- the
 *     area jammer, the supplement's large and portable jammers -- is switched
 *     on as broad-spectrum (its operator's EW roll, then -2 to every user in
 *     range and a plain roll out to 10 times it) or selective (a roll, or a
 *     Quick Contest where the frequency isn't known, to catch each user, at -1
 *     per 10% past its range, then -4 or -2); a spectrum analyzer gives the
 *     operator +4 (HT:EE p. 49).
 *   - **Radar jamming (radarJamming):** a radar jammer is a broad-spectrum
 *     jammer against radar and Electronics Operation (Sensors); a radar
 *     spoofer is a Quick Contest of EW against the radar's Sensors (HT:EE
 *     pp. 49-50).
 */

import { isRuleOn } from "../../../shared/book-tables.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, card, carried, distanceText, esc, itemTl, picked, row, sensorData, skillBase, worn } from "../../../shared/sensors/index.js";
import { JAMMER_TABLES, bugSweepContest, readyJamming, type Jammable, type Jammer, type JammerTable } from "../../../shared/surveillance/index.js";
import type { JammerVariety } from "../../../shared/surveillance/rules.js";
import { ACTIVE_SENSORS, EW_FROM_COMM, radioByName } from "../sensors/rules.js";
import { DIRECT_SEQUENCE, FREQUENCY_HOPPING, spreadJammingBonus } from "../sigint/rules.js";
import {
  BEACON_BATTERY,
  COMMUNICATIONS,
  COUNTERSNIPER_BASE,
  DOCUMENT_SCANNER,
  EW,
  HOMEMADE,
  CELL_PHONE_HEARING,
  JAMMER_SHADOW,
  JAMMER_VARIETY_PENALTIES,
  LASER_MIKE_RANGE,
  MILLIMETER_WAVE_RANGE,
  NOISY_BUG,
  OPTICAL_RECOGNITION,
  SCREENING_SKILLS,
  SEARCH_ENDOSCOPE,
  SECURITY,
  SECURITY_TASKS,
  SEISMIC_STEALTH,
  SENSORS,
  SHIELDED_ROOM,
  SIGNATURE_PAD,
  SMART_FENCE,
  SPECTRUM_ANALYZER,
  SPOT_VISION,
  SPOT_WAYS,
  SURVEILLANCE,
  SURVEILLANCE_ENDOSCOPE,
  SWEEP_KINDS,
  bugOf,
  contactMikePenalty,
  defeatSkill,
  homemadeBugPenalty,
  isPinheadMike,
  isSpectrumAnalyzer,
  isUndercoverClothing,
  isWhiteNoise,
  jammableByName,
  jammerByName,
  negatesUndercoverClothing,
  qualityBonus,
  rebased,
  screenerOf,
  screeningBonus,
  spikeMikeLevels,
  supplementJammerByName,
  sweepMinutes,
  isContactMike,
  type Screener,
  type ScreeningSearch,
  type SecurityTask,
  type SpotWay,
  type SweepKind,
} from "./rules.js";
import { ISOLATOR, SPREAD_SPECTRUM, WHITE_NOISE, guardsOf } from "../covert-listening/rules.js";

const NS = "GCC.HT";
const L = (key: string) => game.i18n.localize(`${NS}.Surveillance.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.Surveillance.${key}`, data);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const nameOf = (item: any) => String(item?.name ?? "").trim();
const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";

export interface SurveillanceSwitches {
  screening: () => boolean;
  surveillance: () => boolean;
  jamming: () => boolean;
  jammerKinds: () => boolean;
  radarJamming: () => boolean;
  /** The supplement's covert listening (HT:EE pp. 44-45), which adds to the bug sweep and the contact mike. */
  covert?: () => boolean;
}

/** The switches the jammer table answers to, as full keys. */
export interface JammingSwitches {
  jamming: string;
  jammerKinds: string;
  radarJamming: string;
  /** The supplement's spread spectrum, which helps a radio through a jammer of a variety (HT:EE pp. 46-47). */
  spreadSpectrum?: string;
}

/** A character's level with a skill, or the attribute's default at -5 (p. B173). */
function levelOr(api: GWorldApi, actor: any, skill: string, attribute: "IQ" | "DX" | "Per"): number {
  return api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, attribute) ?? 10) - 5;
}

const check = (form: HTMLElement, name: string) => Boolean(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.checked);
const value = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value ?? "";
const number = (form: HTMLElement, name: string) => Number(value(form, name)) || 0;
const options = (values: readonly string[], label: (v: string) => string, selected?: string) =>
  values.map((v) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(label(v))}</option>`).join("");

// ── the jammer table ──

/**
 * A record as a jammer, under the switch that runs it: High-Tech's jammers
 * under `jamming`, save that an operated one (the area jammer) runs as either
 * of the supplement's varieties while `jammerKinds` is on (HT:EE p. 49); the
 * supplement's large and portable jammers under `jammerKinds`; its radar
 * jammer and spoofer under `radarJamming`.
 */
export function jammerFor(item: any, switches: JammingSwitches): Jammer | null {
  if (!isGear(item)) return null;
  const name = nameOf(item);
  const own = jammerByName(name);
  if (own) {
    if (own.skill === null && !own.blocks && isRuleOn(switches.jammerKinds)) return { ...own, variety: "choose" };
    return isRuleOn(switches.jamming) ? own : null;
  }
  const supplement = supplementJammerByName(name, itemTl(item));
  if (!supplement || !isRuleOn(switches[supplement.rule])) return null;
  const { range, skill, hinders, variety, spoofs } = supplement;
  return { range, skill, ...(hinders ? { hinders } : {}), ...(variety ? { variety } : {}), ...(spoofs ? { spoofs } : {}) };
}

/**
 * A record as gear a jammer hinders: radio gear while either radio-jamming
 * rule is on; a radar (pp. 45-46) while radar jamming is, used with
 * Electronics Operation (Sensors) (HT:EE p. 49).
 */
export function jammableFor(item: any, switches: JammingSwitches): Jammable | null {
  if (!isGear(item)) return null;
  const name = nameOf(item);
  if (isRuleOn(switches.jamming) || isRuleOn(switches.jammerKinds)) {
    const gear = jammableByName(name, itemTl(item));
    if (gear) return gear;
  }
  if (isRuleOn(switches.radarJamming) && ACTIVE_SENSORS[name]?.kind === "radar") return { skill: SENSORS, kind: "radar" };
  return null;
}

/** A spectrum analyzer the operator carries: +4 to his EW for jamming, under the varieties' rule (HT:EE p. 49). */
export function analyzerLines(actor: any, jammerKinds: string): Array<{ label: string; value: number }> {
  if (!isRuleOn(jammerKinds)) return [];
  const analyzer = [...(actor?.items ?? [])].find((i: any) => carried(i) && isSpectrumAnalyzer(nameOf(i)));
  return analyzer ? [{ label: String(analyzer.name), value: SPECTRUM_ANALYZER }] : [];
}

/**
 * A spread-spectrum radio against a jammer of a variety (HT:EE pp. 46-47):
 * +4 with frequency hopping (the ECCM option) against a selective jammer, with
 * direct sequence against a broad-spectrum one.
 */
export function spreadLines(item: any, variety: JammerVariety, spreadSpectrum: string | undefined): Array<{ label: string; value: number }> {
  if (!spreadSpectrum || !isRuleOn(spreadSpectrum)) return [];
  const tl = itemTl(item);
  if (!radioByName(nameOf(item), tl)) return [];
  const options = sensorData(item).options;
  const bonus = spreadJammingBonus({ hopping: tl >= FREQUENCY_HOPPING.tl && options.eccm === true, direct: tl >= DIRECT_SEQUENCE.tl && options.directSequence === true }, variety);
  return bonus ? [{ label: F(variety === "selective" ? "Jammer.Hopping" : "Jammer.DirectSequence", { name: String(item.name) }), value: bonus }] : [];
}

/** High-Tech's jammers and the gear they hinder, behind the book's jamming switches. */
export function highTechJammers(switches: JammingSwitches): JammerTable {
  return {
    book: "high-tech",
    tls: { min: 0, max: 8 },
    switches: [switches.jamming, switches.jammerKinds, switches.radarJamming],
    i18n: NS,
    shadow: JAMMER_SHADOW,
    jammer: (item) => jammerFor(item, switches),
    jammable: (item) => jammableFor(item, switches),
    // Electronics Operation (EW) defaults to Electronics Operation (Communications)-4 (p. 209).
    operatorSkill: (api, actor) => {
      const comm = api.actors.skillLevel(actor, COMMUNICATIONS);
      return api.actors.skillLevel(actor, EW) ?? (comm !== null ? comm + EW_FROM_COMM : skillBase(api, actor, EW));
    },
    varieties: JAMMER_VARIETY_PENALTIES,
    operatorModifiers: (actor) => analyzerLines(actor, switches.jammerKinds),
    gearModifiers: (item, variety) => spreadLines(item, variety, switches.spreadSpectrum),
  };
}

/** Registers the book's jammer table with the shared engine. */
export function initSurveillance(switches: JammingSwitches): void {
  JAMMER_TABLES.register(highTechJammers(switches));
}

// ── what the gear's sheet says ──

/** The lines on a record's sheet, under the switches that are on. */
export function surveillanceLines(item: any, on: { screening: boolean; surveillance: boolean; jamming: boolean; jammerKinds?: boolean; radarJamming?: boolean }): string[] {
  if (!isGear(item)) return [];
  const name = nameOf(item);
  const tl = itemTl(item);
  const lines: string[] = [];
  if (on.screening) {
    const screener = screenerOf(name);
    if (screener) {
      lines.push(L(`Screen.${screener.kind}`));
      if (screener.operatorRoll) lines.push(L("Screen.Operator"));
      if (screener.kind === "handheldMetal" || screener.kind === "walkthroughMetal") lines.push(L("Screen.Undercover"));
    }
    if (/^millimeter-wave camera$/i.test(name)) lines.push(F("Security.MillimeterWave", { range: MILLIMETER_WAVE_RANGE }));
    if (/^optical recognition software$/i.test(name)) lines.push(F("Security.OpticalRecognition", OPTICAL_RECOGNITION));
    if (/^acoustic countersniper system$/i.test(name)) lines.push(F("Security.Countersniper", { base: COUNTERSNIPER_BASE }));
    if (/^seismic detector$/i.test(name)) lines.push(F("Security.Seismic", { modifier: SEISMIC_STEALTH }));
    if (/^voiceprint analyzer$/i.test(name)) lines.push(L("Security.Voiceprint"));
    if (/^ir motion detector$/i.test(name)) lines.push(L("Security.IrMotion"));
    if (/^proximity (fence|detector)\b/i.test(name)) lines.push(L("Security.Proximity"));
    if (/^microwave fence$/i.test(name)) lines.push(L("Security.MicrowaveFence"));
  }
  if (on.surveillance) {
    const levels = spikeMikeLevels(name, tl);
    if (levels) lines.push(F("Mike.Spike", { levels, factor: 2 ** levels }));
    if (isPinheadMike(name)) lines.push(L("Mike.Pinhead"));
    if (isContactMike(name)) lines.push(L("Mike.Contact"));
    if (/^laser mike$/i.test(name)) lines.push(F(tl >= 8 ? "Mike.LaserTl8" : "Mike.LaserTl7", { range: LASER_MIKE_RANGE[Math.min(8, Math.max(7, tl))] }));
    const bug = bugOf(name);
    if (bug?.sweep === "undetectable") lines.push(L("Bug.Undetectable"));
    if (bug?.sweep === "noisy") lines.push(F("Bug.Noisy", { bonus: signed(NOISY_BUG) }));
    if (bug?.sm !== null && bug?.sm !== undefined) lines.push(F("Bug.Homemade", { sm: bug.sm, modifier: homemadeBugPenalty(bug.sm) }));
    if (/^(personal )?cellular beacon$/i.test(name)) lines.push(F("Bug.CellularBeacon", BEACON_BATTERY));
    if (/^bug detector$/i.test(name)) lines.push(F("Sweep.Line", { bonus: signed(NOISY_BUG) }));
    if (/^search endoscope$/i.test(name)) lines.push(F("Endoscope.Search", { search: signed(SEARCH_ENDOSCOPE.Search!), lockpicking: signed(SEARCH_ENDOSCOPE.Lockpicking!) }));
    if (/^surveillance endoscope$/i.test(name)) lines.push(F("Endoscope.Surveillance", SURVEILLANCE_ENDOSCOPE));
    if (/^security document scanner$/i.test(name)) lines.push(F("DocumentScanner", { modifier: DOCUMENT_SCANNER }));
    if (/^shielded room\b/i.test(name)) lines.push(F("ShieldedRoom", { modifier: SHIELDED_ROOM }));
    if (/^voice modulator$/i.test(name)) lines.push(L(tl >= 8 ? "VoiceModulatorTl8" : "VoiceModulatorTl7"));
  }
  if (on.jamming) {
    const jammer = jammerByName(name);
    if (jammer?.blocks) lines.push(F("Jammer.Blocks", { range: jammer.range, hearing: CELL_PHONE_HEARING, shadow: JAMMER_SHADOW }));
    else if (jammer) lines.push(F(jammer.skill === null ? "Jammer.Operated" : "Jammer.Unmanned", { range: jammer.range, skill: jammer.skill ?? 0, shadow: JAMMER_SHADOW }));
    if (jammableByName(name, tl)) lines.push(F("Jammer.Hindered", { shadow: JAMMER_SHADOW }));
    if (isWhiteNoise(name)) lines.push(L("Jammer.WhiteNoise"));
  }
  if (on.jammerKinds) {
    const own = jammerByName(name);
    const supplement = supplementJammerByName(name, tl);
    const range = own && own.skill === null && !own.blocks ? own.range : supplement?.rule === "jammerKinds" ? supplement.range : null;
    if (range !== null) lines.push(F("Jammer.Varieties", { range: distanceText(NS, range), shadow: JAMMER_SHADOW }));
    if (isSpectrumAnalyzer(name)) lines.push(F("Jammer.Analyzer", { bonus: signed(SPECTRUM_ANALYZER) }));
    if (jammableByName(name, tl)) lines.push(L("Jammer.HinderedVarieties"));
  }
  if (on.radarJamming) {
    const supplement = supplementJammerByName(name, tl);
    if (supplement?.rule === "radarJamming") lines.push(F(supplement.spoofs ? "Jammer.Spoofer" : "Jammer.Radar", { range: distanceText(NS, supplement.range), shadow: JAMMER_SHADOW }));
    if (ACTIVE_SENSORS[name]?.kind === "radar") lines.push(L("Jammer.RadarHindered"));
  }
  return lines;
}

// ── screening ──

/**
 * What clothing built to hide things adds to a character's Holdout, as the
 * lines that take it off again: it is no use against a detector-assisted
 * search (p. 206). The clothing's bonus is the Holdout skill's tool line.
 */
export function undercoverLines(actor: any): Array<{ label: string; value: number }> {
  const skill = [...(actor?.items ?? [])].find((i: any) => i.type === "skill" && /^holdout$/i.test(String(i.name ?? "").trim()));
  const derived = skill?.system?.derived;
  const tool = derived?.toolItemId ? actor.items?.get?.(derived.toolItemId) : null;
  const bonus = Number(derived?.toolBonus) || 0;
  if (!tool || !isUndercoverClothing(tool.name) || bonus <= 0) return [];
  return [{ label: F("Screen.UndercoverLine", { name: tool.name }), value: -bonus }];
}

/**
 * A screening device used on the targeted character, or on something being
 * searched (pp. 206-207, 217); `screener` is the supplement's reading of its
 * own detectors where it runs one (HT:EE p. 43).
 */
export async function screen(api: GWorldApi, item: any, actor: any, screener: Screener | null = screenerOf(nameOf(item))): Promise<void> {
  if (!actor || !screener) return;
  const kind = screener.kind;
  const target = picked().target;
  const skills = SCREENING_SKILLS[kind];
  const metal = kind === "handheldMetal" || kind === "walkthroughMetal";
  const answer = await ask(F("Screen.Title", { name: item.name }),
    (skills.length > 1 ? row(L("Screen.Skill"), `<select name="skill">${options(skills, (s) => s)}</select>`) : "")
    + row(L(metal ? "Screen.Metal" : "Screen.MetalWeapons"), `<input type="checkbox" name="metallic" ${metal ? "checked" : ""} />`)
    + (kind === "baggage" || kind === "ct" ? row(L("Screen.Explosive"), `<input type="checkbox" name="explosive" />`) : "")
    + (kind === "handheldMetal" ? row(L("Screen.PatDown"), `<input type="checkbox" name="patDown" />`) : "")
    + (kind === "walkthroughMetal" ? row(L("Screen.Sensitivity"), `<select name="sensitivity">${options(["1", "2", "3"], (v) => `+${v}`)}</select>`) : "")
    + (target ? `<p class="ihint">${esc(F("Screen.Against", { name: target.name }))}</p>` : ""),
    (form) => ({
      skill: skills.length > 1 ? value(form, "skill") || skills[0]! : skills[0]!,
      metallic: check(form, "metallic"),
      explosive: check(form, "explosive"),
      patDown: check(form, "patDown"),
      sensitivity: number(form, "sensitivity") || 1,
    }));
  if (!answer) return;
  const search: ScreeningSearch = { ...answer, tl: itemTl(item) };
  const label = F("Screen.Label", { name: item.name, skill: search.skill });
  let bonus = screeningBonus(kind, search);
  // The operator of a screening system rolls to claim its bonuses (p. 206).
  if (bonus && screener.operatorRoll) {
    const operated: any = await api.roll.success({ actor, base: skillBase(api, actor, SECURITY), skill: SECURITY, label: F("Screen.OperatorLabel", { name: item.name }), tags: ["screening"], item } as any);
    if (!operated) return;
    if (!operated.success) {
      bonus = 0;
      await card(actor, label, [L("Screen.OperatorFailed")]);
    }
  }
  const modifiers = bonus ? [{ label: String(item.name), value: bonus }] : [];
  const tags = ["detection", "screening", ...(metal ? ["metalDetector"] : [])];
  const base = levelOr(api, actor, search.skill, search.skill === "Search" ? "Per" : "IQ");
  if (target && search.skill === "Search") {
    const hider = bonus && negatesUndercoverClothing(kind, search) ? undercoverLines(target) : [];
    await api.roll.quickContest({
      label,
      first: { actor, base, modifiers, note: "Search" },
      second: { actor: target, base: levelOr(api, target, "Holdout", "IQ"), modifiers: hider, note: "Holdout" },
      tags,
    } as any);
    return;
  }
  await api.roll.success({ actor, base, skill: search.skill, label, modifiers, tags, item, ...(target ? { subject: target } : {}) } as any);
}

/** The acoustic countersniper system: 10 plus the shot's total Hearing modifier to locate the shooter (p. 207). */
async function countersniper(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("Security.CountersniperTitle"),
    row(L("Security.HearingModifier"), `<input type="number" name="hearing" value="0" step="1" style="width:70px" />`),
    (form) => ({ hearing: number(form, "hearing") }));
  if (!answer) return;
  const label = F("Security.CountersniperLabel", { name: item.name });
  const result: any = await api.roll.success({
    actor, base: COUNTERSNIPER_BASE, label, item, tags: ["countersniper"],
    modifiers: answer.hearing ? [{ label: L("Security.HearingModifier"), value: answer.hearing }] : [],
  } as any);
  if (result) await card(actor, label, [L(result.success ? "Security.ShooterFound" : "Security.ShooterLost")]);
}

// ── the security system GM tool ──

/** Posts a card the GMs alone see: the intruders needn't know until they trip the alarm (p. 205). */
async function gmCard(title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    whisper: ChatMessage.implementation.getWhisperRecipients("GM"),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** One of the security system rolls, for the selected character (pp. 205-206). */
export async function securitySystem(api: GWorldApi): Promise<void> {
  const actor = picked().selected;
  if (!actor) return void ui.notifications?.warn(L("Security.PickIntruder"));
  const answer = await ask(L("Security.Title"),
    row(L("Security.TaskLabel"), `<select name="task">${options(SECURITY_TASKS, (t) => L(`Security.Task.${t}`))}</select>`)
    + row(L("Security.WayLabel"), `<select name="way">${options(SPOT_WAYS, (w) => F(`Security.Way.${w}`, { modifier: SPOT_VISION }))}</select>`)
    + row(L("Security.Concealed"), `<input type="number" name="camouflage" value="0" min="0" step="1" style="width:70px" />`)
    + row(L("Security.Sophisticated"), `<input type="checkbox" name="sophisticated" checked />`)
    + row(L("Security.Tamper"), `<input type="checkbox" name="tamper" />`),
    (form) => ({
      task: (value(form, "task") || "spot") as SecurityTask,
      way: (value(form, "way") || "vision") as SpotWay,
      camouflage: number(form, "camouflage"),
      sophisticated: check(form, "sophisticated"),
      tamper: check(form, "tamper"),
    }));
  if (!answer) return;
  await runSecurityTask(api, actor, answer);
}

/** The roll or rolls a security task takes. Exported for tests. */
export async function runSecurityTask(api: GWorldApi, actor: any, answer: { task: SecurityTask; way: SpotWay; camouflage: number; sophisticated: boolean; tamper: boolean }): Promise<void> {
  const title = L(`Security.Task.${answer.task}`);
  const roll = (skill: string, base: number, modifiers: Array<{ label: string; value: number }> = [], extra: Record<string, unknown> = {}) =>
    api.roll.success({ actor, base, skill, label: F("Security.RollLabel", { task: title, skill: skill || L("Security.Vision") }), modifiers, tags: ["securitySystem"], ...extra } as any) as Promise<any>;
  switch (answer.task) {
    case "spot": {
      // Vision-5, Observation, or Per-based Traps; a concealed system makes it a Quick Contest against Camouflage (p. 205).
      const per = api.actors.attribute(actor, "Per") ?? 10;
      const way = answer.way;
      const skill = way === "vision" ? "" : way === "observation" ? "Observation" : "Traps";
      const base = way === "vision" ? per : way === "observation" ? levelOr(api, actor, "Observation", "Per") : rebased(levelOr(api, actor, "Traps", "IQ"), api.actors.attribute(actor, "IQ") ?? 10, per);
      const modifiers = way === "vision" ? [{ label: L("Security.SpotVision"), value: SPOT_VISION }] : [];
      const tags = ["securitySystem", "detection", ...(way === "traps" ? [] : ["vision"])];
      if (answer.camouflage > 0) {
        await api.roll.quickContest({
          label: F("Security.RollLabel", { task: title, skill: skill || L("Security.Vision") }),
          first: { actor, base, modifiers, note: skill || L("Security.Vision") },
          second: { actor: null, base: answer.camouflage, note: "Camouflage" },
          tags,
        } as any);
        return;
      }
      await api.roll.success({ actor, base, skill, label: F("Security.RollLabel", { task: title, skill: skill || L("Security.Vision") }), modifiers, tags, kind: way === "vision" ? "attribute" : "skill" } as any);
      return;
    }
    case "identify": {
      const skill = defeatSkill(answer.sophisticated);
      await roll(skill, skillBase(api, actor, skill));
      return;
    }
    case "defeat": {
      // Traps for a mechanical device or simple circuit, Electronics Operation (Security) for the rest; the GM rolls in
      // secret, and any failure sets off the alarm -- opening a housing wired against tampering first (pp. 205-206).
      const skill = defeatSkill(answer.sophisticated);
      const base = skillBase(api, actor, skill);
      if (answer.tamper) {
        const opened = await roll(skill, base, [], { secret: true, label: F("Security.RollLabel", { task: L("Security.Housing"), skill }) });
        if (!opened) return;
        if (!opened.success) return void (await gmCard(title, [F("Security.Alarm", { name: actor.name })]));
      }
      const result = await roll(skill, base, [], { secret: true });
      if (result) await gmCard(title, [F(result.success ? "Security.Defeated" : "Security.Alarm", { name: actor.name })]);
      return;
    }
    case "smartFence": {
      const result = await roll(SECURITY, skillBase(api, actor, SECURITY), [{ label: L("Security.SmartFenceLine"), value: SMART_FENCE }], { secret: true });
      if (result) await gmCard(title, [F(result.success ? "Security.Defeated" : "Security.Alarm", { name: actor.name })]);
      return;
    }
    case "seismic": {
      const result = await roll("Stealth", levelOr(api, actor, "Stealth", "DX"), [{ label: L("Security.SeismicLine"), value: SEISMIC_STEALTH }], { secret: true });
      if (result) await gmCard(title, [F(result.success ? "Security.SeismicCrossed" : "Security.Alarm", { name: actor.name })]);
      return;
    }
    case "signature":
      await roll("Forgery", skillBase(api, actor, "Forgery"), [{ label: L("Security.SignatureLine"), value: SIGNATURE_PAD }]);
      return;
  }
}

// ── surveillance ──

/**
 * Listening through a barrier with a contact mike: -(DR+HP)/5, and -5 more in
 * a shielded room (pp. 208, 212); with the supplement's covert listening, -4
 * where a white noise generator masks the talk (HT:EE p. 44).
 */
export async function contactMike(api: GWorldApi, item: any, actor: any, covert = false): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("Mike.ContactTitle"),
    row(L("Mike.BarrierDr"), `<input type="number" name="dr" value="2" min="0" step="1" style="width:70px" />`)
    + row(L("Mike.BarrierHp"), `<input type="number" name="hp" value="10" min="0" step="1" style="width:70px" />`)
    + row(F("Mike.Shielded", { modifier: SHIELDED_ROOM }), `<input type="checkbox" name="shielded" />`)
    + (covert ? row(F("Covert.WhiteNoiseRow", { modifier: WHITE_NOISE }), `<input type="checkbox" name="whiteNoise" />`) : ""),
    (form) => ({ dr: number(form, "dr"), hp: number(form, "hp"), shielded: check(form, "shielded"), whiteNoise: covert && check(form, "whiteNoise") }));
  if (!answer) return;
  const barrier = contactMikePenalty(answer.dr, answer.hp);
  const modifiers = [
    ...(barrier ? [{ label: F("Mike.BarrierLine", { dr: answer.dr, hp: answer.hp }), value: barrier }] : []),
    ...(answer.shielded ? [{ label: L("Mike.ShieldedLine"), value: SHIELDED_ROOM }] : []),
    ...(covert && answer.whiteNoise ? [{ label: L("Covert.WhiteNoiseLine"), value: WHITE_NOISE }] : []),
  ];
  await api.roll.success({ actor, base: skillBase(api, actor, SURVEILLANCE), skill: SURVEILLANCE, label: F("Mike.ContactLabel", { name: item.name }), modifiers, tags: ["hearing", "surveillance"], item } as any);
}

/** Guiding a pinhead mike's cable: a DX-based Electronics Operation (Surveillance) roll (p. 208). */
async function pinheadMike(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const iq = api.actors.attribute(actor, "IQ") ?? 10;
  const dx = api.actors.attribute(actor, "DX") ?? 10;
  const label = F("Mike.PinheadLabel", { name: item.name });
  const result: any = await api.roll.success({ actor, base: rebased(skillBase(api, actor, SURVEILLANCE), iq, dx), skill: SURVEILLANCE, label, tags: ["surveillance", "DX"], item } as any);
  if (result) await card(actor, label, [L(result.success ? "Mike.PinheadIn" : result.criticalFailure ? "Mike.PinheadBroken" : "Mike.PinheadStuck")]);
}

/** Searching with a search endoscope: +3 to Search in a hollow object or body cavity, +2 to Lockpicking through a drilled hole (p. 209). */
async function endoscope(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const skills = Object.keys(SEARCH_ENDOSCOPE);
  const answer = await ask(L("Endoscope.Title"), row(L("Screen.Skill"), `<select name="skill">${options(skills, (s) => s)}</select>`), (form) => ({ skill: value(form, "skill") || "Search" }));
  if (!answer) return;
  const base = levelOr(api, actor, answer.skill, answer.skill === "Search" ? "Per" : "IQ");
  await api.roll.success({ actor, base, skill: answer.skill, label: F("Endoscope.Label", { name: item.name, skill: answer.skill }), modifiers: [{ label: String(item.name), value: SEARCH_ENDOSCOPE[answer.skill] ?? 0 }], tags: answer.skill === "Search" ? ["detection"] : [], item } as any);
}

/** Copying a sealed document: Electronics Operation (Security or Surveillance) at -2 (p. 209). */
async function documentScanner(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const skill = (api.actors.skillLevel(actor, SECURITY) ?? -Infinity) >= (api.actors.skillLevel(actor, SURVEILLANCE) ?? -Infinity) ? SECURITY : SURVEILLANCE;
  await api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label: F("DocumentLabel", { name: item.name }), modifiers: [{ label: String(item.name), value: DOCUMENT_SCANNER }], tags: ["surveillance"], item } as any);
}

/** Building a bug at home: Electronics Repair (Surveillance) at SM+9 below a matchbox's size, half a day and $10-$20 (p. 210). */
async function homemadeBug(api: GWorldApi, item: any, actor: any): Promise<void> {
  const bug = bugOf(nameOf(item));
  if (!actor || bug?.sm === null || bug?.sm === undefined) return;
  const penalty = homemadeBugPenalty(bug.sm);
  const label = F("Bug.HomemadeLabel", { name: item.name });
  const result: any = await api.roll.success({ actor, base: skillBase(api, actor, HOMEMADE.skill), skill: HOMEMADE.skill, label, modifiers: penalty ? [{ label: F("Bug.SmLine", { sm: bug.sm }), value: penalty }] : [], tags: ["surveillance"] } as any);
  if (result) await card(actor, label, [F(result.success ? "Bug.Built" : "Bug.NotBuilt", { hours: HOMEMADE.hours, low: HOMEMADE.cost[0], high: HOMEMADE.cost[1] })]);
}

/**
 * Sweeping a room with a bug detector (p. 212): a Quick Contest of
 * Electronics Operation (Surveillance) with whoever hid the bug, a minute per
 * 100 square feet, at the detector's quality (good +1, fine +2); +4 for a
 * radio beacon (p. 210); a phone tap, laser mike or laser pinhead mike it
 * can't sense at all (pp. 208-209). With the supplement's covert listening,
 * -5 for a bug using spread spectrum and -2 for one an isolator guards,
 * ticked to start with where the targeted hider carries such a bug or an
 * isolator (HT:EE p. 44).
 */
export async function sweepForBugs(api: GWorldApi, item: any, actor: any, covert = false): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const hiderLevel = target ? skillBase(api, target, SURVEILLANCE) : 12;
  const guards = covert && target ? guardsOf(target) : { spreadSpectrum: false, isolator: false };
  const answer = await ask(L("Sweep.Title"),
    row(target ? F("Sweep.HiderIs", { name: target.name }) : L("Sweep.Hider"), `<input type="number" name="hider" value="${hiderLevel}" min="0" step="1" style="width:70px" />`)
    + row(L("Sweep.KindLabel"), `<select name="kind">${options(SWEEP_KINDS, (k) => F(`Sweep.Kind.${k}`, { bonus: signed(NOISY_BUG) }))}</select>`)
    + row(L("Sweep.Area"), `<input type="number" name="area" value="100" min="0" step="10" style="width:90px" />`)
    + (covert
      ? row(F("Covert.SpreadRow", { modifier: SPREAD_SPECTRUM }), `<input type="checkbox" name="spread" ${guards.spreadSpectrum ? "checked" : ""} />`)
        + row(F("Covert.IsolatorRow", { modifier: ISOLATOR }), `<input type="checkbox" name="isolator" ${guards.isolator ? "checked" : ""} />`)
      : ""),
    (form) => ({
      hider: number(form, "hider"), kind: (value(form, "kind") || "normal") as SweepKind, area: number(form, "area"),
      spread: covert && check(form, "spread"), isolator: covert && check(form, "isolator"),
    }));
  if (!answer) return;
  const label = F("Sweep.Label", { name: item.name });
  const time = F("Sweep.Time", { minutes: sweepMinutes(answer.area), area: answer.area });
  if (answer.kind === "undetectable") return void (await card(actor, label, [L("Sweep.CantSense"), time]));
  // The quality's bonus, unless the record already gives it to the skill as a tool (p. B345).
  const asTool = (item.system?.forSkills ?? []).some((s: string) => String(s).trim().toLowerCase() === SURVEILLANCE.toLowerCase());
  const quality = asTool ? 0 : qualityBonus(item.system?.equipmentQuality);
  const modifiers = [
    ...(quality ? [{ label: F("Sweep.Quality", { name: item.name }), value: quality }] : []),
    ...(answer.kind === "noisy" ? [{ label: L("Sweep.NoisyLine"), value: NOISY_BUG }] : []),
    ...(covert && answer.spread ? [{ label: L("Covert.SpreadLine"), value: SPREAD_SPECTRUM }] : []),
    ...(covert && answer.isolator ? [{ label: L("Covert.IsolatorLine"), value: ISOLATOR }] : []),
  ];
  const found = await bugSweepContest(api, {
    label,
    sweeper: { actor, base: skillBase(api, actor, SURVEILLANCE), modifiers },
    hider: { actor: target ?? null, base: answer.hider },
  });
  if (found !== null) await card(actor, label, [L(found ? "Sweep.Found" : "Sweep.Missed"), time]);
}

/** Registers the section, the buttons, the GM tool, the spike mike's hearing and the jammers. */
export function readySurveillance(api: GWorldApi, on: SurveillanceSwitches): void {
  const state = () => ({ screening: on.screening(), surveillance: on.surveillance(), jamming: on.jamming(), jammerKinds: on.jammerKinds(), radarJamming: on.radarJamming() });
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-surveillance-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-surveillance-item.hbs`,
    visible: (item) => surveillanceLines(item, state()).length > 0,
    context: (item) => ({ lines: surveillanceLines(item, state()) }),
  });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-security-system", label: L("Security.Title"), icon: "fa-solid fa-shield-halved", visible: on.screening, open: () => securitySystem(api) });

  const named = (pattern: RegExp) => (item: any) => isGear(item) && pattern.test(nameOf(item));
  const actions: Array<{ key: string; label: string; icon: string; visible: (item: any) => boolean; run: (item: any, actor: any) => Promise<void> }> = [
    { key: "ht-screen", label: L("Screen.Action"), icon: "fa-solid fa-magnifying-glass", visible: (item) => on.screening() && isGear(item) && screenerOf(nameOf(item)) !== null, run: (item, actor) => screen(api, item, actor) },
    { key: "ht-countersniper", label: L("Security.CountersniperTitle"), icon: "fa-solid fa-crosshairs", visible: (item) => on.screening() && named(/^acoustic countersniper system$/i)(item), run: (item, actor) => countersniper(api, item, actor) },
    { key: "ht-contact-mike", label: L("Mike.ContactTitle"), icon: "fa-solid fa-ear-listen", visible: (item) => on.surveillance() && isGear(item) && isContactMike(nameOf(item)), run: (item, actor) => contactMike(api, item, actor, on.covert?.() ?? false) },
    { key: "ht-pinhead-mike", label: L("Mike.PinheadTitle"), icon: "fa-solid fa-microphone", visible: (item) => on.surveillance() && isGear(item) && isPinheadMike(nameOf(item)), run: (item, actor) => pinheadMike(api, item, actor) },
    { key: "ht-endoscope", label: L("Endoscope.Title"), icon: "fa-solid fa-eye", visible: (item) => on.surveillance() && named(/^search endoscope$/i)(item), run: (item, actor) => endoscope(api, item, actor) },
    { key: "ht-document-scanner", label: L("DocumentTitle"), icon: "fa-solid fa-envelope-open-text", visible: (item) => on.surveillance() && named(/^security document scanner$/i)(item), run: (item, actor) => documentScanner(api, item, actor) },
    { key: "ht-homemade-bug", label: L("Bug.HomemadeTitle"), icon: "fa-solid fa-screwdriver-wrench", visible: (item) => on.surveillance() && isGear(item) && typeof bugOf(nameOf(item))?.sm === "number", run: (item, actor) => homemadeBug(api, item, actor) },
    { key: "ht-bug-sweep", label: L("Sweep.Title"), icon: "fa-solid fa-bug", visible: (item) => on.surveillance() && named(/^bug detector$/i)(item), run: (item, actor) => sweepForBugs(api, item, actor, on.covert?.() ?? false) },
  ];
  for (const action of actions) api.sheets.registerRowAction({ module: MODULE_ID, itemTypes: ["equipment"], ...action });

  // A spike mike in use turns the wall into a sounding board: Parabolic Hearing at (TL-4) levels (p. 208).
  Hooks.on("gworld.traitEffects", (context: any) => {
    const actor = context?.actor;
    if (!on.surveillance() || !actor || !context?.effects) return;
    for (const item of actor.items ?? []) {
      if (!worn(item)) continue;
      const levels = spikeMikeLevels(nameOf(item), itemTl(item));
      if (!levels || levels <= (Number(context.effects.parabolicHearing) || 0)) continue;
      context.effects.parabolicHearing = levels;
      context.sources?.push({ effect: "parabolicHearing", label: String(item.name), value: levels });
    }
  });

  readyJamming(api);
}
