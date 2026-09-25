/**
 * The laboratory instruments of the supplement Electricity and Electronics
 * (HT:EE pp. 9-13), registered with the system through the add-on API under
 * three High-Tech switches. The rules are in `rules.ts`.
 *
 *   - **electricalMeasurement** (HT:EE p. 10): "Use" on an instrument's row
 *     asks what it is for. Detecting a source is at +4 for a voltage high
 *     enough to harm (or, on the scientific instruments, a hazard such as
 *     radiation or strong acid, p. 12) and -4 for a weak one; a professional's
 *     routine checks succeed on their own. A failed measurement is off by 5%
 *     per point of failure, 1% with good gear and 0.25% with fine; a critical
 *     failure stops the instrument or gives an absurd reading. The
 *     instrument's quality gives its usual bonus (Campaigns p. 345). Physics'
 *     row improvises a spark-gap voltmeter at -5.
 *   - **labInstruments** (HT:EE pp. 10-13): each instrument's own modifiers
 *     in the same dialog -- a moving-magnet galvanometer's magnetic
 *     disturbance (-1 to -10), electrical noise that a lock-in amplifier
 *     disregards (-6 at TL7, -9 at TL8), an early vacuum-tube voltmeter's -2,
 *     a signal tracer's -5 on FM and the listener's Hearing modifiers, an
 *     unusually complex device's -1 to -5 (doubled against a science), the
 *     TL6 photodetector's darkness penalty, the TL6 metal detector's -2 and
 *     the field skill that reads its finds, a heart monitor worn briefly
 *     (-2, or -4 under half an hour); the Tesla coil's burn on a critical
 *     failure and its spark to an unshielded power line on an 18; a dedicated
 *     device at +2; a transducer read only through a display carried with
 *     it. And on their own rows: a mirror galvanometer reading a telegraph
 *     line (+4), the spectrum analyzer's four uses (Mechanic and Linguistics
 *     +2 with an accelerometer or a microphone, a sound signature as
 *     Discriminatory Hearing tells one, a signal traced at +2 on AM and FM),
 *     a transducer connected to a display (+2; a critical failure risks the
 *     transducer), a Van de Graaff generator's shock (+2 to resist from the
 *     classroom model, -6 per doubling of its sphere), an oscilloscope
 *     comparing two signals on Electronics Operation (Scientific), a shock
 *     from a Geiger-Müller tube's high-voltage supply (5d lethal; p. 12), an
 *     analog computer set up or built as a copy of an invention (Engineer
 *     (Analog Computers), or Mechanic (Analog Computers)-6), and a waveform plotted by
 *     hand from Physics' or Mathematics (Applied)'s row at -2. Studying
 *     Hiking with an electronic pedometer carried takes 10% less time
 *     (p. 13), through the Study tool's `gworld.studyModifiers`.
 *   - **combinedDevices** (HT:EE p. 9): a device combined from separate
 *     parts is at -2 to use. A High-Tech device's sheet marks it as one (the
 *     `device.combined` field, beside #490's), and every roll made with it
 *     takes the -2; a transducer read through a display is one, and the
 *     instrument dialog marks any other for a single use. This is not
 *     High-Tech's combination gadgets (p. 10).
 *
 * The instruments are found by name (the catalogue's records, #478, and
 * High-Tech's own Geiger counters and metal detector), and only High-Tech's
 * gear or gear that names no book takes them.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import { deviceData, isDevice } from "../devices/index.js";
import { hearingModifier } from "../sensors/index.js";
import {
  ANALOG_ENGINEER,
  ANALOG_MECHANIC,
  ANALYZER_BONUS,
  ANALYZER_SKILL,
  ANALYZER_USES,
  APPLIED_MATHEMATICS,
  COIL_BURN,
  COIL_LINE,
  COMBINED,
  COMMUNICATIONS,
  COMPARE_SKILL,
  CONNECT_BONUS,
  GEIGER_SUPPLY,
  HAND_PLOT,
  LINES,
  LINE_DAMAGE,
  MAGNETIC_WORST,
  PEDOMETER,
  PEDOMETER_SKILL,
  PEDOMETER_TIME,
  PHYSICS,
  REPAIR_ANY,
  REPAIR_SCIENTIFIC,
  SCIENTIFIC,
  SIGNALS,
  SKILL_DEFAULTS,
  SKILL_FROM_SKILL,
  SOURCES,
  SOURCE_MODIFIER,
  SPARK_GAP,
  TELEGRAPH_BONUS,
  WEAR_MODIFIER,
  WEAR_TIMES,
  coilMishap,
  complexityPenalty,
  copyCost,
  darknessPenalty,
  instrumentOf,
  isAccelerometer,
  isDisplay,
  isGeigerTube,
  isMicrophone,
  magneticPenalty,
  noisePenalty,
  reading,
  studyMultiplier,
  tracingModifier,
  transducerFate,
  vanDeGraaffModifier,
  type AnalyzerUse,
  type Instrument,
  type Line,
  type Signal,
  type SkillChoice,
  type Source,
  type Task,
  type WearTime,
} from "./rules.js";

const NS = "GCC.HT.Instruments";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** The multiples of the usual time a user may take (Campaigns p. 346). */
const TIME_MULTIPLES = [1, 2, 4, 8, 15, 30] as const;

export interface InstrumentSwitches {
  measurement: () => boolean;
  instruments: () => boolean;
  combined: () => boolean;
}

type Line_ = { label: string; value: number };

const nameOf = (item: any) => String(item?.name ?? "");
const carried = (item: any) => item?.type === "equipment" && item.system?.carried !== false;
const carriedGear = (actor: any): any[] => [...(actor?.items ?? [])].filter(carried);

/** The instrument an item is, where it is High-Tech's (the supplement's are, decision E1) or names no book. */
export function instrumentItem(item: any): Instrument | null {
  if (item?.type !== "equipment" || !ourBook(item)) return null;
  return instrumentOf(item.name);
}

/** High-Tech's gear (the supplement's is, decision E1), or gear that names no book. */
function ourBook(item: any): boolean {
  const book = bookOf(item);
  return book === null || book === "high-tech";
}

// ── skills ──

interface Rolled {
  skill: string;
  level: number;
  modifier: number;
  /** True where the character hasn't learned it and rolls at its default. */
  defaulted: boolean;
}

/** A character's level with a skill choice: their best specialty for `any`, else the skill, else its default from IQ. */
function levelFor(api: GWorldApi, actor: any, choice: SkillChoice): Rolled | null {
  if (choice.any) {
    const prefix = api.rules.toolSkillKey(choice.skill);
    let best: Rolled | null = null;
    for (const skill of [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill")) {
      const name = String(skill.name ?? "");
      if (!api.rules.toolSkillKey(name).startsWith(prefix)) continue;
      const level = api.actors.skillLevel(actor, name);
      if (typeof level === "number" && (!best || level > best.level)) best = { skill: name.replace(/\/TL\d*/i, ""), level, modifier: choice.modifier, defaulted: false };
    }
    if (best) return best;
  } else {
    const level = api.actors.skillLevel(actor, choice.skill);
    if (typeof level === "number") return { skill: choice.skill, level, modifier: choice.modifier, defaulted: false };
  }
  // A skill defaulting to another the character knows, the best of them.
  let fromSkill: Rolled | null = null;
  for (const from of SKILL_FROM_SKILL[choice.skill] ?? []) {
    const level = api.actors.skillLevel(actor, from.skill);
    if (typeof level === "number" && (!fromSkill || level + from.modifier > fromSkill.level)) {
      fromSkill = { skill: choice.skill, level: level + from.modifier, modifier: choice.modifier, defaulted: true };
    }
  }
  if (fromSkill) return fromSkill;
  const fallback = SKILL_DEFAULTS[choice.skill];
  if (fallback === undefined) return null;
  const iq = Number(api.actors.attribute(actor, "IQ" as never)) || 10;
  return { skill: choice.skill, level: iq + fallback, modifier: choice.modifier, defaulted: true };
}

/** Every choice the character can roll, best first. */
function options(api: GWorldApi, actor: any, choices: readonly SkillChoice[]): Rolled[] {
  return choices.map((c) => levelFor(api, actor, c)).filter((r): r is Rolled => r !== null).sort((a, b) => b.level + b.modifier - (a.level + a.modifier));
}

const skillLabel = (r: Rolled) => `${r.skill}${r.modifier ? ` ${signed(r.modifier)}` : ""}: ${r.level + r.modifier}${r.defaulted ? ` (${L("Default")})` : ""}`;

// ── dialogs and cards ──

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const numberInput = (name: string, value: number, max: number) => `<input type="number" name="${name}" value="${value}" min="0" max="${max}" step="1" style="width:70px" />`;
const select = (name: string, choices: Array<{ value: string; label: string }>, chosen?: string) =>
  `<select name="${name}">${choices.map((c) => `<option value="${esc(c.value)}" ${c.value === chosen ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`;
const checkbox = (name: string, checked: boolean) => `<input type="checkbox" name="${name}" ${checked ? "checked" : ""} />`;
const value = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
const number = (form: HTMLElement, name: string) => Number(value(form, name)) || 0;
const checked = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked === true;

const skillSelect = (rolls: Rolled[]) => row(L("Skill"), select("skill", rolls.map((r, i) => ({ value: String(i), label: skillLabel(r) }))));
const timeSelect = () => row(L("TimeSpent"), select("time", TIME_MULTIPLES.map((t) => ({ value: String(t), label: t === 1 ? L("TimeUsual") : F("Times", { times: t, bonus: signed(timeSpentModifier(t, 1)) }) }))));
const timeLine = (form: HTMLElement): Line_[] => {
  const times = number(form, "time") || 1;
  const bonus = timeSpentModifier(times, 1);
  return bonus ? [{ label: F("TimeLine", { times }), value: bonus }] : [];
};

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Rolls a skill choice with its own modifier as the first line. */
function roll(api: GWorldApi, actor: any, used: Rolled, label: string, lines: Line_[], tags: string[], item: any = null): Promise<any> {
  const modifiers = [...(used.modifier ? [{ label: F("SkillModifier", { skill: used.skill }), value: used.modifier }] : []), ...lines.filter((l) => l.value !== 0)];
  return api.roll.success({ actor, base: used.level, skill: used.skill, label, modifiers, tags: ["instrument", ...tags], ...(item ? { item } : {}) } as any);
}

/** The quality line an instrument gives a roll it isn't already a tool for (HT:EE p. 10; Campaigns p. 345). */
function qualityLine(api: GWorldApi, item: any, skill: string): Line_[] {
  const quality = String(item?.system?.equipmentQuality ?? "basic");
  const wanted = api.rules.toolSkillKey(skill);
  if ((item?.system?.forSkills ?? []).some((s: unknown) => api.rules.toolSkillKey(String(s ?? "")) === wanted)) return [];
  const tl = Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
  const bonus = Number(api.rules.equipmentQualityModifier(quality as never, { technological: true, tl })) || 0;
  return bonus ? [{ label: F("QualityLine", { quality: L(`Quality.${quality}`) }), value: bonus }] : [];
}

/** The most electrical noise a lock-in amplifier in hand disregards: the one used, or one carried (HT:EE p. 11). */
function lockInCancels(item: any, actor: any): number {
  return Math.max(0, ...[item, ...carriedGear(actor)].map((i) => instrumentItem(i)?.cancelsNoise ?? 0));
}

/** Whether the character carries a display to read a transducer through (HT:EE p. 12). */
const carriesDisplay = (actor: any, except: any = null) => carriedGear(actor).some((i) => i !== except && instrumentItem(i) !== null && isDisplay(i.name));

// ── using an instrument ──

interface UseAnswer {
  used: Rolled;
  task: Task;
  lines: Line_[];
  combined: boolean;
  shielded: boolean;
  line: Line;
}

/** The dialog for using an instrument: its skill, task and each switch's modifiers. */
async function askUse(api: GWorldApi, item: any, actor: any, inst: Instrument, on: InstrumentSwitches): Promise<UseAnswer | null> {
  const rolls = options(api, actor, inst.skills);
  if (!rolls.length) {
    ui.notifications?.warn(F("NoSkill", { skills: inst.skills.map((s) => s.skill).join(", ") }));
    return null;
  }
  const measuring = on.measurement() && inst.tasks.some((t) => t !== "operate");
  const lab = on.instruments();
  const tasks = measuring ? inst.tasks : (["operate"] as const);
  let html = skillSelect(rolls);
  if (tasks.length > 1) html += row(L("TaskField"), select("task", tasks.map((t) => ({ value: t, label: L(`Task.${t}`) }))));
  if (measuring && inst.tasks.includes("detect")) html += row(L("SourceField"), select("source", SOURCES.map((s) => ({ value: s, label: `${L(`Source.${s}`)} (${signed(SOURCE_MODIFIER[s])})` }))));
  if (lab) {
    if (inst.magnetic) html += row(F("Magnetic", { worst: MAGNETIC_WORST }), numberInput("magnetic", 0, MAGNETIC_WORST));
    if (inst.tasks.includes("measure") || inst.kind === "signalTracer") {
      const cancels = lockInCancels(item, actor);
      html += row(cancels ? F("NoiseLockIn", { cancels }) : L("Noise"), numberInput("noise", 0, 10));
    }
    if (inst.earlyModel) html += row(F("EarlyModel", { value: inst.earlyModel }), checkbox("early", true));
    if (inst.kind === "signalTracer") html += row(L("SignalField"), select("signal", SIGNALS.map((s) => ({ value: s, label: `${L(`Signal.${s}`)} (${signed(tracingModifier(inst.kind, s))})` }))));
    if (inst.kind === "transducer" || inst.kind === "dedicated") html += row(L("Complexity"), numberInput("complexity", 0, 5));
    if (inst.darkness) html += row(L("Darkness"), numberInput("darkness", 0, 9));
    if (inst.kind === "heartMonitor") html += row(L("WearField"), select("wear", WEAR_TIMES.map((w) => ({ value: w, label: `${L(`Wear.${w}`)} (${signed(WEAR_MODIFIER[w])})` }))));
    if (inst.coil) {
      html += row(L("Supply"), select("line", LINES.map((l) => ({ value: l, label: `${L(`Line.${l}`)} (${LINE_DAMAGE[l]})` })), COIL_LINE[inst.coil]));
      html += row(L("Shielded"), checkbox("shielded", false));
    }
  }
  if (on.combined()) html += row(F("Combined", { value: COMBINED }), checkbox("combined", inst.kind === "transducer" || deviceData(item).combined));
  html += timeSelect();

  return ask(F("UseTitle", { name: nameOf(item) }), html, (form): UseAnswer => {
    const used = rolls[number(form, "skill")] ?? rolls[0]!;
    const task = (tasks.length > 1 ? value(form, "task") : tasks[0]) as Task;
    const lines: Line_[] = [];
    if (measuring && task === "detect") {
      const source = (value(form, "source") || "ordinary") as Source;
      if (SOURCE_MODIFIER[source]) lines.push({ label: L(`Source.${source}`), value: SOURCE_MODIFIER[source] });
    }
    if (measuring) lines.push(...qualityLine(api, item, used.skill));
    if (lab) {
      if (inst.magnetic) lines.push({ label: L("MagneticLine"), value: magneticPenalty(number(form, "magnetic")) });
      const noise = number(form, "noise");
      if (noise > 0) {
        const cancels = lockInCancels(item, actor);
        lines.push({ label: cancels ? F("NoiseLineLockIn", { noise, cancels }) : F("NoiseLine", { noise }), value: noisePenalty(noise, cancels) });
      }
      if (inst.earlyModel && checked(form, "early")) lines.push({ label: L("EarlyModelLine"), value: inst.earlyModel });
      if (inst.kind === "signalTracer") {
        const signal = (value(form, "signal") || "audio") as Signal;
        lines.push({ label: L(`Signal.${signal}`), value: tracingModifier(inst.kind, signal) });
        // The tracer's loudspeaker is heard: good or bad hearing counts (HT:EE p. 11).
        const hearing = hearingModifier(api, actor);
        if (hearing) lines.push({ label: L("HearingLine"), value: hearing });
      }
      if (inst.kind === "transducer" || inst.kind === "dedicated") lines.push({ label: L("ComplexityLine"), value: complexityPenalty(number(form, "complexity"), used.skill) });
      if (inst.darkness) lines.push({ label: L("DarknessLine"), value: darknessPenalty(number(form, "darkness")) });
      if (inst.drift) lines.push({ label: L("DriftLine"), value: inst.drift });
      if (inst.kind === "heartMonitor") {
        const wear = (value(form, "wear") || "day") as WearTime;
        lines.push({ label: L(`Wear.${wear}`), value: WEAR_MODIFIER[wear] });
      }
    }
    const combined = on.combined() && checked(form, "combined");
    if (combined) lines.push({ label: L("CombinedLine"), value: COMBINED });
    lines.push(...timeLine(form));
    return { used, task, lines, combined, shielded: checked(form, "shielded"), line: (value(form, "line") || (inst.coil ? COIL_LINE[inst.coil] : "household")) as Line };
  });
}

/** Uses an instrument: the roll, then what it reads and what went wrong. */
export async function useInstrument(api: GWorldApi, item: any, actor: any, on: InstrumentSwitches): Promise<void> {
  const inst = instrumentItem(item);
  if (!inst || !actor) return;
  // A transducer gives nothing without a display to read it through (HT:EE p. 12).
  if (on.instruments() && inst.kind === "transducer" && !carriesDisplay(actor, item)) return void ui.notifications?.warn(L("NeedsDisplay"));
  if (on.instruments() && inst.kind === "analogComputer" && !inst.generalPurpose) return programAnalog(api, item, actor);
  const answer = await askUse(api, item, actor, inst, on);
  if (!answer) return;
  const outcome: any = await roll(api, actor, answer.used, F("UseLabel", { name: nameOf(item), task: L(`Task.${answer.task}`) }), answer.lines, [answer.task], item);
  if (!outcome) return;
  const title = nameOf(item);
  const lines: string[] = [];
  if (on.measurement()) {
    const read = reading(answer.task, outcome, item.system?.equipmentQuality);
    if (read) lines.push(read.kind === "off" ? F("Reading.off", { percent: read.percent }) : L(`Reading.${read.kind}`));
    if (answer.task === "detect") lines.push(L("Routine"));
  }
  if (on.instruments()) {
    if (inst.coil) {
      const mishap = coilMishap(outcome, answer.shielded);
      if (mishap.burn) {
        lines.push(F("CoilBurn", { burn: COIL_BURN[inst.coil] }));
        await api.roll.damage({ actor, item, label: F("CoilBurnLabel", { name: title }), formula: COIL_BURN[inst.coil], damageType: "burn" as never, source: "teslaCoil" } as any);
      }
      if (mishap.line) {
        lines.push(F("CoilLine", { damage: LINE_DAMAGE[answer.line] }));
        await api.hazards.shock({ actor, kind: "lethal", modifier: 0, continuous: true, formula: LINE_DAMAGE[answer.line], metalArmor: false } as any);
      }
    }
    if (inst.interpret && outcome.success) await interpret(api, actor, inst.interpret, title);
    if (isGeigerTube(item.name)) lines.push(F("GeigerSupply", { damage: GEIGER_SUPPLY.damage }));
  }
  await say(actor, title, lines);
}

/** A metal detector's find is read with a field's skill (HT:EE p. 12): the best the character has. */
async function interpret(api: GWorldApi, actor: any, skills: readonly string[], title: string): Promise<void> {
  const best = options(api, actor, skills.map((skill) => ({ skill, modifier: 0 })));
  if (!best.length) return void say(actor, title, [F("InterpretNone", { skills: skills.join(", ") })]);
  await roll(api, actor, best[0]!, F("InterpretLabel", { name: title }), [], ["interpret"]);
}

// ── the rows of their own ──

/** A mirror galvanometer on a telegraph line: Electronics Operation (Communications) +4 (HT:EE p. 11). */
async function readTelegraph(api: GWorldApi, item: any, actor: any): Promise<void> {
  const used = levelFor(api, actor, { skill: COMMUNICATIONS, modifier: TELEGRAPH_BONUS });
  if (!used) return;
  await roll(api, actor, used, F("TelegraphLabel", { name: nameOf(item) }), [], ["telegraph"], item);
}

/**
 * An oscilloscope comparing two signals (HT:EE p. 11): Electronics Operation
 * (Scientific), with time spent. The GM says whether they match -- two voices
 * from the same person, say -- on a success.
 */
async function compareSignals(api: GWorldApi, item: any, actor: any): Promise<void> {
  const used = levelFor(api, actor, { skill: COMPARE_SKILL, modifier: 0 });
  if (!used) return;
  const answer = await ask(F("CompareTitle", { name: nameOf(item) }), `<p class="ihint">${esc(L("CompareHint"))}</p>` + timeSelect(), (form) => ({ time: timeLine(form) }));
  if (!answer) return;
  const outcome: any = await roll(api, actor, used, F("CompareLabel", { name: nameOf(item) }), answer.time, ["compare"], item);
  if (!outcome || "refused" in outcome) return;
  await say(actor, nameOf(item), [L(outcome.success ? "Compared" : "NotCompared")]);
}

/**
 * A shock from the Geiger-Müller tube's high-voltage supply (HT:EE p. 12):
 * 5d lethal electrical damage to the targeted character, or the one holding
 * the tube, through the system's shock.
 */
async function supplyShock(api: GWorldApi, actor: any): Promise<void> {
  const victim = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean)[0] ?? actor;
  if (!victim) return;
  // The shock is written to the victim: only their owner (or the GM) can run it.
  if (!victim.isOwner) return void ui.notifications?.warn(F("NotYourVictim", { name: victim.name }));
  await api.hazards.shock({ actor: victim, kind: "lethal", modifier: 0, continuous: true, formula: GEIGER_SUPPLY.damage, metalArmor: false, source: "geigerSupply" } as any);
}

/** The spectrum analyzer's uses (HT:EE p. 11). */
async function analyze(api: GWorldApi, item: any, actor: any): Promise<void> {
  const uses = [...ANALYZER_USES, "tracing"] as const;
  const answer = await ask(F("AnalyzeTitle", { name: nameOf(item) }),
    row(L("Use"), select("use", uses.map((u) => ({ value: u, label: L(`Analyze.${u}`) }))))
    + row(L("SignalField"), select("signal", SIGNALS.filter((s) => s !== "audio").map((s) => ({ value: s, label: L(`Signal.${s}`) }))))
    + timeSelect(),
    (form) => ({ use: value(form, "use") as AnalyzerUse | "tracing", signal: (value(form, "signal") || "am") as Signal, time: timeLine(form) }));
  if (!answer) return;
  const gear = carriedGear(actor);
  if (answer.use === "vibration" && !gear.some((i) => isAccelerometer(i.name))) return void ui.notifications?.warn(L("NeedsAccelerometer"));
  if (answer.use === "speech" && !gear.some((i) => isMicrophone(i.name))) return void ui.notifications?.warn(L("NeedsMicrophone"));
  const choice: SkillChoice = answer.use === "tracing"
    ? { skill: REPAIR_ANY, modifier: 0, any: true }
    : { skill: ANALYZER_SKILL[answer.use], modifier: 0, any: answer.use === "vibration" };
  const used = levelFor(api, actor, choice);
  if (!used) return void ui.notifications?.warn(F("NoSkill", { skills: choice.skill }));
  const bonus = answer.use === "tracing" ? tracingModifier("spectrumAnalyzer", answer.signal) : answer.use === "signature" ? 0 : ANALYZER_BONUS;
  const lines = [...(bonus ? [{ label: L(`Analyze.${answer.use}`), value: bonus }] : []), ...answer.time];
  await roll(api, actor, used, F("AnalyzeLabel", { name: nameOf(item), use: L(`Analyze.${answer.use}`) }), lines, ["spectrumAnalyzer", answer.use], item);
  if (answer.use === "signature") await say(actor, nameOf(item), [L("Signature")]);
}

/**
 * Connecting a transducer to a display (HT:EE p. 12): Electronics Operation
 * or Electronics Repair (Scientific) +2, or its science. A failure gives no
 * meaningful readings; a critical failure makes the transducer roll its HT
 * or be destroyed, and one that survives needs Electronics Repair
 * (Scientific) to mend.
 */
async function connect(api: GWorldApi, item: any, actor: any): Promise<void> {
  const inst = instrumentItem(item);
  if (!inst) return;
  if (!carriesDisplay(actor, item)) return void ui.notifications?.warn(L("NeedsDisplay"));
  const choices: SkillChoice[] = [{ skill: SCIENTIFIC, modifier: CONNECT_BONUS }, { skill: REPAIR_SCIENTIFIC, modifier: CONNECT_BONUS }, ...(inst.science ? [{ skill: inst.science, modifier: 0 }] : [])];
  const rolls = options(api, actor, choices);
  if (!rolls.length) return;
  const answer = await ask(F("ConnectTitle", { name: nameOf(item) }), skillSelect(rolls) + timeSelect(), (form) => ({ used: rolls[number(form, "skill")] ?? rolls[0]!, time: timeLine(form) }));
  if (!answer) return;
  const outcome: any = await roll(api, actor, answer.used, F("ConnectLabel", { name: nameOf(item) }), answer.time, ["transducer"], item);
  if (!outcome) return;
  if (!outcome.criticalFailure) return void say(actor, nameOf(item), [L(outcome.success ? "Connected" : "NoReadings")]);
  // The transducer's HT: 10 unless its record says otherwise (HT:EE p. 9).
  const ht = Number(item.system?.extensions?.[MODULE_ID]?.device?.ht) || 10;
  const survives: any = await api.roll.success({ actor, base: ht, skill: "HT", kind: "attribute", label: F("TransducerHt", { name: nameOf(item) }), modifiers: [], tags: ["instrument", "transducer"], item } as any);
  if (!survives) return;
  const fate = transducerFate(survives);
  await say(actor, nameOf(item), [L(`Fate.${fate}`)]);
  if (fate === "damaged") {
    const repair = levelFor(api, actor, { skill: REPAIR_SCIENTIFIC, modifier: 0 });
    if (repair) await roll(api, actor, repair, F("RepairLabel", { name: nameOf(item) }), [], ["transducer", "repair"], item);
  }
}

/** A Van de Graaff generator's charge, discharged into whoever touches it: a nonlethal shock (HT:EE p. 11; Campaigns p. 432). */
async function discharge(api: GWorldApi, item: any, actor: any): Promise<void> {
  const inst = instrumentItem(item);
  if (!inst?.sphere) return;
  const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  const victim = targets[0] ?? actor;
  if (victim && !victim.isOwner) return void ui.notifications?.warn(F("NotYourVictim", { name: victim.name }));
  const answer = await ask(F("DischargeTitle", { name: nameOf(item) }),
    `<p class="ihint">${esc(F("DischargeVictim", { name: victim?.name ?? "" }))}</p>`
    + row(L("Sphere"), `<input type="number" name="sphere" value="${inst.sphere}" min="${inst.sphere}" step="1" style="width:70px" />`),
    (form) => ({ sphere: number(form, "sphere") || inst.sphere! }));
  if (!answer || !victim) return;
  await api.hazards.shock({ actor: victim, kind: "nonlethal", modifier: vanDeGraaffModifier(answer.sphere, inst.sphere), continuous: false, metalArmor: false } as any);
}

/**
 * Programming a prototype analog computer (HT:EE p. 13): Mathematics
 * (Applied) to define the problem, then Mechanic (Analog Computers) or
 * Electronics Repair (Scientific) to set the machine up.
 */
async function programAnalog(api: GWorldApi, item: any, actor: any): Promise<void> {
  const title = nameOf(item);
  const define = levelFor(api, actor, { skill: APPLIED_MATHEMATICS, modifier: 0 });
  if (!define) return;
  const first: any = await roll(api, actor, define, F("DefineLabel", { name: title }), [], ["analogComputer"], item);
  if (!first) return;
  if (!first.success) return void say(actor, title, [L("ProblemUndefined")]);
  const setup = options(api, actor, [{ skill: ANALOG_MECHANIC, modifier: 0 }, { skill: REPAIR_SCIENTIFIC, modifier: 0 }])[0];
  if (!setup) return;
  await roll(api, actor, setup, F("SetUpLabel", { name: title }), [], ["analogComputer"], item);
}

/**
 * Building an analog computer as a modified copy of an invention (HT:EE
 * p. 13): Engineer (Analog Computers), with a single copy's cost and time
 * (Campaigns p. 474) -- Average for a desktop machine, Complex for a
 * differential analyzer or anything as big.
 */
async function buildAnalog(api: GWorldApi, item: any, actor: any): Promise<void> {
  const inst = instrumentItem(item);
  if (!inst) return;
  const title = nameOf(item);
  const answer = await ask(F("BuildTitle", { name: title }),
    row(L("GradeField"), select("grade", ["average", "complex"].map((g) => ({ value: g, label: L(`Grade.${g}`) })), inst.grade))
    + row(L("Labour"), checkbox("labour", false)),
    (form) => ({ grade: value(form, "grade") === "complex" ? "complex" as const : "average" as const, labour: checked(form, "labour") }));
  if (!answer) return;
  // Engineer (Analog Computers), or Mechanic (Analog Computers) at -6 for one who hasn't learned it.
  const engineer = levelFor(api, actor, { skill: ANALOG_ENGINEER, modifier: 0 });
  if (!engineer) return void ui.notifications?.warn(F("NoSkill", { skills: `${ANALOG_ENGINEER}, ${ANALOG_MECHANIC}` }));
  const outcome: any = await roll(api, actor, engineer, F("BuildLabel", { name: title }), [], ["analogComputer", "invention"], item);
  if (!outcome) return;
  const time = api.rules.gradeRow(answer.grade).prototypeTime;
  const retail = Number(item.system?.listCost ?? item.system?.cost) || 0;
  await say(actor, title, [
    L(outcome.success ? "Built" : "NotBuilt"),
    F("CopyCost", { cost: copyCost(retail, answer.labour).toLocaleString(), grade: L(`Grade.${answer.grade}`) }),
    F("CopyTime", { time: `${api.rules.formatDiceAdds(time.dice as never)}/2`, unit: L(`Unit.${time.unit}`) }),
  ]);
}

/** A spark-gap voltmeter, improvised to measure a voltage: Physics at -5 (HT:EE p. 10). */
async function sparkGap(api: GWorldApi, actor: any): Promise<void> {
  const used = levelFor(api, actor, { skill: PHYSICS, modifier: 0 });
  if (!used) return;
  const outcome: any = await roll(api, actor, used, L("SparkGapLabel"), [{ label: L("SparkGapLine"), value: SPARK_GAP }], ["measure", "sparkGap"]);
  if (!outcome) return;
  const read = reading("measure", outcome, "improvised");
  if (read) await say(actor, L("SparkGap"), [read.kind === "off" ? F("Reading.off", { percent: read.percent }) : L(`Reading.${read.kind}`)]);
}

/** A waveform plotted by hand from timed meter readings: Mathematics (Applied) or Physics at -2, with time spent (HT:EE p. 11). */
async function plotByHand(api: GWorldApi, skill: any, actor: any): Promise<void> {
  const used = levelFor(api, actor, { skill: String(skill.name ?? "").replace(/\/TL\d*/i, ""), modifier: 0 });
  if (!used) return;
  const answer = await ask(L("PlotTitle"), timeSelect(), (form) => timeLine(form));
  if (!answer) return;
  await roll(api, actor, used, L("PlotLabel"), [{ label: L("PlotLine"), value: HAND_PLOT }, ...answer], ["waveform"]);
}

// ── registration ──

export function readyInstruments(api: GWorldApi, on: InstrumentSwitches): void {
  // A roll made with a device marked as combined from separate parts: -2 (HT:EE p. 9). The
  // instrument dialog's own rolls carry the line already, ticked or not.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.combined() || !context?.item || !isDevice(context.item) || !deviceData(context.item).combined) return;
    if ((context.tags ?? []).includes("instrument")) return;
    context.modifiers.push({ key: "ht.combinedDevice", label: L("CombinedRecord"), value: COMBINED });
  });

  const any = () => on.measurement() || on.instruments() || on.combined();
  const sameSkill = (item: any, name: string) => item?.type === "skill" && api.rules.toolSkillKey(String(item.name ?? "")) === api.rules.toolSkillKey(name);

  // Studying Hiking with an electronic pedometer carried: 10% less study time (HT:EE p. 13; API 1.133.0).
  Hooks.on(api.combat.hooks.studyModifiers, (context: any) => {
    if (!on.instruments() || !context || !sameSkill(context.skill, PEDOMETER_SKILL)) return;
    if (!carriedGear(context.actor).some((item) => PEDOMETER.test(nameOf(item).trim()) && ourBook(item))) return;
    const multiplier = Number(context.multiplier);
    context.multiplier = (Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1) * studyMultiplier(PEDOMETER_TIME);
    if (Array.isArray(context.lines)) context.lines.push(L("Pedometer"));
  });
  const kindIs = (item: any, test: (inst: Instrument) => boolean) => {
    const inst = instrumentItem(item);
    return inst !== null && test(inst);
  };

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-use",
    itemTypes: ["equipment"],
    label: L("Use"),
    icon: "fa-solid fa-gauge-high",
    // Measuring needs a task to measure; the lab switch reaches every instrument, and so does the
    // combined device's -2 (any instrument may be one).
    visible: (item) => any() && kindIs(item, (inst) => on.instruments() || on.combined() || inst.tasks.some((t) => t !== "operate")),
    run: (item, actor) => useInstrument(api, item, actor, on),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-telegraph",
    itemTypes: ["equipment"],
    label: L("Telegraph"),
    icon: "fa-solid fa-tower-broadcast",
    visible: (item) => on.instruments() && kindIs(item, (inst) => inst.telegraph === true),
    run: (item, actor) => readTelegraph(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-compare",
    itemTypes: ["equipment"],
    label: L("CompareButton"),
    icon: "fa-solid fa-code-compare",
    visible: (item) => on.instruments() && kindIs(item, (inst) => inst.kind === "oscilloscope"),
    run: (item, actor) => compareSignals(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-geiger-supply",
    itemTypes: ["equipment"],
    label: L("SupplyShock"),
    icon: "fa-solid fa-bolt",
    visible: (item) => on.instruments() && ourBook(item) && isGeigerTube(item?.name),
    run: (_item, actor) => supplyShock(api, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-analyze",
    itemTypes: ["equipment"],
    label: L("AnalyzeButton"),
    icon: "fa-solid fa-wave-square",
    visible: (item) => on.instruments() && kindIs(item, (inst) => inst.kind === "spectrumAnalyzer"),
    run: (item, actor) => analyze(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-connect",
    itemTypes: ["equipment"],
    label: L("Connect"),
    icon: "fa-solid fa-plug",
    visible: (item) => on.instruments() && kindIs(item, (inst) => inst.kind === "transducer"),
    run: (item, actor) => connect(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-discharge",
    itemTypes: ["equipment"],
    label: L("Discharge"),
    icon: "fa-solid fa-bolt",
    visible: (item) => on.instruments() && kindIs(item, (inst) => typeof inst.sphere === "number"),
    run: (item, actor) => discharge(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-instrument-build",
    itemTypes: ["equipment"],
    label: L("Build"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => on.instruments() && kindIs(item, (inst) => inst.kind === "analogComputer"),
    run: (item, actor) => buildAnalog(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-spark-gap",
    itemTypes: ["skill"],
    label: L("SparkGap"),
    icon: "fa-solid fa-bolt-lightning",
    visible: (item) => on.measurement() && sameSkill(item, PHYSICS),
    run: (_item, actor) => sparkGap(api, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-plot-waveform",
    itemTypes: ["skill"],
    label: L("PlotTitle"),
    icon: "fa-solid fa-chart-line",
    visible: (item) => on.instruments() && (sameSkill(item, PHYSICS) || sameSkill(item, APPLIED_MATHEMATICS)),
    run: (item, actor) => plotByHand(api, item, actor),
  });
}
