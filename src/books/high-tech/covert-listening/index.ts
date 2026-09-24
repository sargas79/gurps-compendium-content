/**
 * Bugs, taps and countersurveillance from the supplement Electricity and
 * Electronics (HT:EE pp. 44-45), part of High-Tech (decision E1 in #471),
 * under the switch `covertListening`. The figures are in `rules.ts`.
 *
 *   - **High-Tech's own gear:** the bug detector's sweep takes -5 for a bug
 *     using spread spectrum and -2 for one an isolator guards, and the
 *     contact mike's roll -4 under white noise (both High-Tech's buttons,
 *     under `surveillanceGear`, with this switch adding the lines). A row
 *     button listens with the laser mike: in range, -2 through heavy curtains
 *     or triple glazing, -1 to -4 for noise at TL7, -4 under white noise. The
 *     white noise generator's sheet says what it does to eavesdroppers and to
 *     the people working near it.
 *   - **The supplement's records** (#480 captures them; until then, by the
 *     names its capture gives): row buttons trace a planted signal with the
 *     lock-in amplifier, sweep with the nonlinear junction detector (a failure
 *     by 4 or more takes a rusty nail for a bug) and wire a keylogger into a
 *     typewriter; the isolator, resonant cavity microphone and shielded wallet
 *     show their figures on their sheets.
 *   - **A GM tool** runs the jobs the supplement prints with no record:
 *     building and reading a computer-emissions interceptor, the typing sample
 *     acoustic keylogging needs, capturing an RFID chip, making a booster bag,
 *     and an FM receiver as a white noise generator.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, card, esc, itemTl, picked, row, skillBase } from "../../../shared/sensors/index.js";
import { sensorData } from "../../../shared/sensors/data.js";
import { LASER_MIKE_RANGE, bugOf, isContactMike, sweepMinutes } from "../surveillance/rules.js";
import {
  COVERT_TASKS,
  CURTAINS,
  EMISSIONS_FREE,
  IMPROVISED_WHITE_NOISE,
  ISOLATOR,
  ISOLATOR_SM,
  KEYLOGGER_RANGE_MILES,
  KEYLOGGER_WIRING_MINUTES,
  KEYLOG_SAMPLE,
  MAX_NOISE,
  RESONANT_CAVITY_SM,
  RFID_CAPTURE,
  SECURITY,
  SPREAD_SPECTRUM,
  SURVEILLANCE,
  TASK_SKILL,
  WHITE_NOISE,
  WIRING,
  emissionsPenalty,
  guardsOf,
  isIsolator,
  isJunctionDetector,
  isKeylogger,
  isLaserMike,
  isLockInAmplifier,
  isResonantCavity,
  isShieldedWallet,
  isWhiteNoiseGenerator,
  junctionOutcome,
  keylogMinutes,
  laserNoise,
  lockInBonus,
  rfidPenalty,
  type CovertTask,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Covert.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Covert.${key}`, data);
const nameOf = (item: any) => String(item?.name ?? "").trim();
const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";

const check = (form: HTMLElement, name: string) => Boolean(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.checked);
const value = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value ?? "";
const number = (form: HTMLElement, name: string) => Number(value(form, name)) || 0;
const numberInput = (name: string, initial: number, step = 1) => `<input type="number" name="${name}" value="${initial}" min="0" step="${step}" style="width:80px" />`;
const checkbox = (name: string, checked = false) => `<input type="checkbox" name="${name}" ${checked ? "checked" : ""} />`;

/** A character's level with a skill, or an attribute's default (p. B173). */
function levelOr(api: GWorldApi, actor: any, skill: string, attribute: "IQ" | "DX" | "Per", penalty: number): number {
  return api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, attribute) ?? 10) + penalty;
}

// ── what the gear's sheet says ──

/** The lines on a record's sheet under the switch. */
export function covertLines(item: any): string[] {
  if (!isGear(item)) return [];
  const name = nameOf(item);
  const tl = itemTl(item);
  const lines: string[] = [];
  if (/^bug detector$/i.test(name)) lines.push(F("Detector", { spread: SPREAD_SPECTRUM, isolator: ISOLATOR }));
  if (isWhiteNoiseGenerator(name)) lines.push(F("WhiteNoise", { modifier: WHITE_NOISE }), L("WhiteNoiseNearby"));
  if (isLaserMike(name)) lines.push(F(tl >= 8 ? "LaserTl8" : "LaserTl7", { curtains: CURTAINS, noise: MAX_NOISE, whiteNoise: WHITE_NOISE }));
  if (isContactMike(name) || /^audio bug\b/i.test(name)) lines.push(F("MaskedByWhiteNoise", { modifier: WHITE_NOISE }));
  if (isResonantCavity(name)) lines.push(F("Resonant", { sm: RESONANT_CAVITY_SM, modifier: WHITE_NOISE }));
  if (isIsolator(name)) lines.push(F("Isolator", { modifier: ISOLATOR, sm: ISOLATOR_SM }));
  if (isLockInAmplifier(name)) lines.push(F("LockIn", { bonus: lockInBonus(tl) }));
  if (isJunctionDetector(name)) lines.push(F("JunctionLine", { isolator: ISOLATOR }));
  if (isKeylogger(name)) lines.push(F("Keylogger", { minutes: KEYLOGGER_WIRING_MINUTES, miles: KEYLOGGER_RANGE_MILES }));
  if (isShieldedWallet(name)) lines.push(L("Wallet"));
  // A bug fitted with frequency hopping (the ECCM option, p. 39) is spread spectrum.
  if (bugOf(name) && sensorData(item).options.eccm === true) lines.push(F("SpreadBug", { modifier: SPREAD_SPECTRUM }));
  return lines;
}

// ── the row buttons ──

/**
 * Listening with a laser mike (HT:EE p. 44; High-Tech p. 208): Electronics
 * Operation (Surveillance) out to its range, -2 through heavy curtains or
 * triple glazing, -1 to -4 for noise where the TL7 mike can't filter it, -4
 * under white noise. Bug detectors can't sense it.
 */
export async function listenWithLaser(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const tl = itemTl(item);
  const range = LASER_MIKE_RANGE[Math.min(8, Math.max(7, tl))]!;
  const answer = await ask(L("LaserTitle"),
    row(L("Yards"), numberInput("yards", Math.min(100, range), 10))
    + row(F("CurtainsRow", { modifier: CURTAINS }), checkbox("curtains"))
    + (tl >= 8 ? "" : row(F("NoiseRow", { max: MAX_NOISE }), numberInput("noise", 0)))
    + row(F("WhiteNoiseRow", { modifier: WHITE_NOISE }), checkbox("whiteNoise")),
    (form) => ({ yards: number(form, "yards"), curtains: check(form, "curtains"), noise: number(form, "noise"), whiteNoise: check(form, "whiteNoise") }));
  if (!answer) return;
  const label = F("LaserLabel", { name: item.name });
  if (answer.yards > range) return void (await card(actor, label, [F("OutOfRange", { range })]));
  const noise = laserNoise(answer.noise, tl);
  const modifiers = [
    ...(answer.curtains ? [{ label: L("CurtainsLine"), value: CURTAINS }] : []),
    ...(noise ? [{ label: L("NoiseLine"), value: noise }] : []),
    ...(answer.whiteNoise ? [{ label: L("WhiteNoiseLine"), value: WHITE_NOISE }] : []),
  ];
  await api.roll.success({ actor, base: skillBase(api, actor, SURVEILLANCE), skill: SURVEILLANCE, label, modifiers, tags: ["hearing", "surveillance"], item } as any);
}

/** Tracing a planted signal with a lock-in amplifier: Electronics Operation (Security) +6, +10 at TL8, a minute per 100 square feet (HT:EE p. 44). */
export async function traceSignal(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("LockInTitle"), row(L("Area"), numberInput("area", 100, 10)), (form) => ({ area: number(form, "area") }));
  if (!answer) return;
  const label = F("LockInLabel", { name: item.name });
  const result: any = await api.roll.success({
    actor, base: skillBase(api, actor, SECURITY), skill: SECURITY, label, item, tags: ["surveillance"],
    modifiers: [{ label: String(item.name), value: lockInBonus(itemTl(item)) }],
  } as any);
  if (result) await card(actor, label, [L(result.success ? "LeakFound" : "LeakMissed"), F("Time", { minutes: sweepMinutes(answer.area), area: answer.area })]);
}

/**
 * Sweeping with a nonlinear junction detector (HT:EE p. 44): Electronics
 * Operation (Security) finds any solid-state device in the room, -2 where an
 * isolator guards it; a failure by 4 or more, or a critical failure, takes a
 * stray object for a bug.
 */
export async function junctionSweep(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const guarded = target ? guardsOf(target).isolator : false;
  const answer = await ask(L("JunctionTitle"),
    row(L("Area"), numberInput("area", 100, 10)) + row(F("IsolatorRow", { modifier: ISOLATOR }), checkbox("isolator", guarded)),
    (form) => ({ area: number(form, "area"), isolator: check(form, "isolator") }));
  if (!answer) return;
  const label = F("JunctionLabel", { name: item.name });
  const result: any = await api.roll.success({
    actor, base: skillBase(api, actor, SECURITY), skill: SECURITY, label, item, tags: ["surveillance", "bugSweep"],
    modifiers: answer.isolator ? [{ label: L("IsolatorLine"), value: ISOLATOR }] : [],
  } as any);
  if (!result) return;
  await card(actor, label, [L(`Junction.${junctionOutcome(result)}`), F("Time", { minutes: sweepMinutes(answer.area), area: answer.area })]);
}

/** Wiring a keylogger into an electric typewriter: half an hour's access and Electronics Repair (Surveillance) (HT:EE p. 45). */
export async function wireKeylogger(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const label = F("WireLabel", { name: item.name });
  const result: any = await api.roll.success({ actor, base: skillBase(api, actor, WIRING), skill: WIRING, label, item, tags: ["surveillance"] } as any);
  if (result) await card(actor, label, [F(result.success ? "Wired" : "NotWired", { minutes: KEYLOGGER_WIRING_MINUTES })]);
}

// ── the GM tool ──

/** One of the jobs the supplement prints with no record, for the selected character. */
export async function covertJob(api: GWorldApi): Promise<void> {
  const actor = picked().selected;
  if (!actor) return void ui.notifications?.warn(L("PickCharacter"));
  const target = picked().target;
  const typing = target ? levelOr(api, target, "Typing", "DX", -4) : 12;
  const shielded = target ? [...(target.items ?? [])].some((i: any) => isShieldedWallet(i?.name)) : false;
  const answer = await ask(L("ToolTitle"),
    row(L("TaskLabel"), `<select name="task">${COVERT_TASKS.map((t) => `<option value="${t}">${esc(L(`Task.${t}`))}</option>`).join("")}</select>`)
    + row(L("Yards"), numberInput("yards", 0))
    + row(target ? F("TypingOf", { name: target.name }) : L("Typing"), numberInput("typing", typing))
    + row(L("Manual"), checkbox("manual"))
    + row(L("ShieldedRow"), checkbox("shielded", shielded)),
    (form) => ({ task: (value(form, "task") || "emissionsBuild") as CovertTask, yards: number(form, "yards"), typing: number(form, "typing"), manual: check(form, "manual"), shielded: check(form, "shielded") }));
  if (!answer) return;
  await runCovertJob(api, actor, answer);
}

/** The roll or card a job takes. Exported for tests. */
export async function runCovertJob(api: GWorldApi, actor: any, answer: { task: CovertTask; yards: number; typing: number; manual: boolean; shielded: boolean }): Promise<void> {
  const title = L(`Task.${answer.task}`);
  const skill = TASK_SKILL[answer.task];
  const roll = (modifiers: Array<{ label: string; value: number }> = [], base?: number) =>
    api.roll.success({ actor, base: base ?? skillBase(api, actor, skill!), skill, label: F("JobLabel", { task: title, skill }), modifiers, tags: ["surveillance"] } as any);
  switch (answer.task) {
    case "emissionsBuild":
      await roll();
      return;
    case "emissionsRead": {
      const penalty = emissionsPenalty(answer.yards);
      await roll(penalty ? [{ label: F("EmissionsLine", { yards: answer.yards, free: EMISSIONS_FREE }), value: penalty }] : []);
      return;
    }
    case "acousticKeylog": {
      const minutes = keylogMinutes(answer.typing, answer.manual);
      await card(actor, title, [minutes === null ? L("NoTyping") : F("SampleTime", { minutes, characters: KEYLOG_SAMPLE.characters, words: KEYLOG_SAMPLE.words })]);
      return;
    }
    case "rfidCapture": {
      if (answer.shielded) return void (await card(actor, title, [L("WalletBlocks")]));
      const extra = rfidPenalty(answer.yards) - RFID_CAPTURE;
      await roll([{ label: L("RfidLine"), value: RFID_CAPTURE }, ...(extra ? [{ label: F("RfidDistance", { yards: Math.floor(answer.yards) }), value: extra }] : [])]);
      return;
    }
    case "boosterBag":
      // Scrounging defaults to Per-4 (p. B218).
      await roll([], levelOr(api, actor, "Scrounging", "Per", -4));
      return;
    case "improvisedWhiteNoise":
      await roll([{ label: L("ImprovisedLine"), value: IMPROVISED_WHITE_NOISE }]);
      return;
  }
}

/** Registers the section, the buttons and the GM tool. */
export function readyCovertListening(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-covert-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-covert-item.hbs`,
    visible: (item) => on() && covertLines(item).length > 0,
    context: (item) => ({ lines: on() ? covertLines(item) : [] }),
  });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-covert-listening", label: L("ToolTitle"), icon: "fa-solid fa-user-secret", visible: on, open: () => covertJob(api) });
  const named = (test: (name: string) => boolean) => (item: any) => on() && isGear(item) && test(nameOf(item));
  const actions = [
    { key: "ht-laser-listen", label: L("LaserTitle"), icon: "fa-solid fa-ear-listen", visible: named(isLaserMike), run: (item: any, actor: any) => listenWithLaser(api, item, actor) },
    { key: "ht-lock-in", label: L("LockInTitle"), icon: "fa-solid fa-wave-square", visible: named(isLockInAmplifier), run: (item: any, actor: any) => traceSignal(api, item, actor) },
    { key: "ht-junction-sweep", label: L("JunctionTitle"), icon: "fa-solid fa-bug", visible: named(isJunctionDetector), run: (item: any, actor: any) => junctionSweep(api, item, actor) },
    { key: "ht-keylogger-wire", label: L("WireTitle"), icon: "fa-solid fa-keyboard", visible: named(isKeylogger), run: (item: any, actor: any) => wireKeylogger(api, item, actor) },
  ];
  for (const action of actions) api.sheets.registerRowAction({ module: MODULE_ID, itemTypes: ["equipment"], ...action });
}
