/**
 * Electric fences, electric locks, screening and alarms from the supplement
 * Electricity and Electronics (HT:EE pp. 42-44), part of High-Tech (decision
 * E1 in #471), under three switches. The figures are in `rules.ts`, the fence
 * shocks in `fences.ts`. They extend High-Tech's own security rules: its
 * lock records and grades, and its traps tool (`../security/`), and its
 * security system's spotting roll and screening button (`../surveillance/`).
 *
 *   - **Stun-lethal fences (stunLethalFences):** the traps tool runs a
 *     low-voltage fence (a nonlethal shock each second on an unmodified HT
 *     roll, Moderate Pain, the stun held while touching) and a stun-lethal
 *     one (that at a first touch; 3d burning a second as lethal electrical
 *     damage at a second, holding on anyone it injures by more than 1 point
 *     until the current is cut) through `hazards.shock` and the shock hooks.
 *     A fence can be a security fence, $100 more (free on a stun-lethal one),
 *     which sets off an alarm when touched.
 *   - **Electric locks (electricLocks):** the key switch, electric deadbolt,
 *     keypad combination lock, smart lock and the five magnetic locks are
 *     High-Tech's lock records, with its quality grades; the GM's electric
 *     security tool bypasses a key switch (Electronics Repair (Security),
 *     Mechanic or Lockpicking), cuts a magnetic lock's power (Electrician) or
 *     forces it (a Quick Contest of ST against the lock's). The digital
 *     stethoscope gives +1 to crack a safe and +3 to disable a security
 *     device by ear.
 *   - **Screening and alarms (alarmSystems):** the keycard readers (x2 for a
 *     log of the cards) and the biometric systems join High-Tech's identity
 *     verifiers, bypassed with Electronics Repair (Security) at their grade
 *     (+5, 0, -5; x1, x5, x20), a portable one $5 and 0.2 lb. more (High-Tech's
 *     own verifiers, which stand for three of them, keep High-Tech's bypass);
 *     a general-purpose metal detector screens in improvised use as
 *     High-Tech's handheld detector does. The tool spots an alarm (High-Tech's
 *     roll), identifies it, disables it (Traps for an electric alarm) and cuts
 *     its power; each alarm's figures are on its sheet.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, card, esc, picked, row, skillBase } from "../../../shared/sensors/index.js";
import { LOCK_QUALITIES, lockQualityModifier, type LockQuality } from "../security/rules.js";
import { runSecurityTask, screen } from "../surveillance/index.js";
import { SPOT_VISION, SPOT_WAYS, type SpotWay } from "../surveillance/rules.js";
import { registerFenceHooks } from "./fences.js";
import {
  ALARM_TASKS,
  DIGITAL_STETHOSCOPE,
  ELECTRICIAN,
  EOD_SKILL,
  KEYCARD_LOG_COST,
  KEY_SWITCH_SKILLS,
  LOCK_TASKS,
  MAGNETIC_LOCKS,
  PORTABLE_BIOMETRIC,
  SECURITY,
  SECURITY_REPAIR,
  SIGNATURE_FORGERY,
  STUN_LETHAL,
  TASK_RULE,
  alarmDisableSkill,
  alarmOf,
  biometricOf,
  cutPowerOutcome,
  fenceOf,
  isDigitalStethoscope,
  isHighTechBiometric,
  isImprovisedDetector,
  keycardOf,
  magneticSize,
  securityFenceCost,
  stethoscopeBonus,
  supplementScreener,
  type AlarmTask,
  type LockTask,
} from "./rules.js";

const NS = "GCC.HT.ElectricSecurity";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const FIELD = "eeSecurity";
const nameOf = (item: any) => String(item?.name ?? "").trim();
const isGear = (item: any) => item?.type === "equipment";
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export interface ElectricSecuritySwitches {
  fences: () => boolean;
  electricLocks: () => boolean;
  alarms: () => boolean;
}

/** The record's calculated options: a keycard reader's log, a portable biometric unit, a security fence. */
interface Options {
  logged: boolean;
  portable: boolean;
  alarmed: boolean;
}

/** Registers the record options: improvements are fields that reprice the record, never items attached to it. */
export function initElectricSecurity(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      logged: new f.BooleanField({ initial: false }),
      portable: new f.BooleanField({ initial: false }),
      alarmed: new f.BooleanField({ initial: false }),
    }),
  });
}

export function optionsOf(item: any): Options {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return { logged: data.logged === true, portable: data.portable === true, alarmed: data.alarmed === true };
}

/** A record of this book's, or one of no book's (D1). */
const ours = (item: any) => {
  const book = bookOf(item);
  return book === null || book === "high-tech";
};

/** Which option a record offers under the switches that are on. */
function optionFor(item: any, on: ElectricSecuritySwitches): keyof Options | null {
  if (!isGear(item) || !ours(item)) return null;
  const name = nameOf(item);
  const fence = fenceOf(name);
  if (fence && fence !== "stunLethal" && on.fences()) return "alarmed";
  if (keycardOf(name) !== null && on.alarms()) return "logged";
  if (biometricOf(name) && on.alarms()) return "portable";
  return null;
}

// ── what the gear's sheet says ──

/** The lines on a record's sheet, under the switches that are on. */
export function electricLines(item: any, on: ElectricSecuritySwitches): string[] {
  if (!isGear(item) || !ours(item)) return [];
  const name = nameOf(item);
  const lines: string[] = [];
  if (on.fences()) {
    const fence = fenceOf(name);
    if (fence === "lowVoltage") lines.push(L("Fence.LowVoltage"));
    if (fence === "stunLethal") lines.push(F("Fence.StunLethal", { formula: STUN_LETHAL.formula }));
    if (fence) lines.push(fence === "stunLethal" ? L("Fence.SecurityFree") : F("Fence.Security", { cost: securityFenceCost(fence) }));
  }
  if (on.electricLocks()) {
    if (/^key switch$/i.test(name)) lines.push(F("Lock.KeySwitch", { skills: KEY_SWITCH_SKILLS.join(", ") }));
    if (/^electric deadbolt$/i.test(name)) lines.push(L("Lock.Deadbolt"));
    if (/^keypad combination lock$/i.test(name)) lines.push(L("Lock.Keypad"));
    if (/^smart lock$/i.test(name)) lines.push(L("Lock.Smart"));
    const size = magneticSize(name);
    if (size) lines.push(F("Lock.Magnetic", { ...MAGNETIC_LOCKS[size], skill: ELECTRICIAN }));
    if (isDigitalStethoscope(name)) lines.push(F("Lock.Stethoscope", DIGITAL_STETHOSCOPE));
  }
  if (on.alarms()) {
    const keycard = keycardOf(name);
    if (keycard !== null) lines.push(F("Screen.Keycard", { log: KEYCARD_LOG_COST }), ...(keycard ? [L(`Screen.Tech.${keycard.replace(/ (\w)/g, (_m, c: string) => c.toUpperCase())}`)] : []));
    const biometric = biometricOf(name);
    if (biometric) {
      // High-Tech's own verifiers keep High-Tech's bypass (p. 205): the supplement adds its notes and the portable unit.
      if (!isHighTechBiometric(name)) lines.push(F("Screen.Biometric", { skill: SECURITY_REPAIR, ...PORTABLE_BIOMETRIC }));
      else lines.push(F("Screen.Portable", PORTABLE_BIOMETRIC));
      const kind = biometric.replace(/ (\w)/g, (_m, c: string) => c.toUpperCase());
      lines.push(F(`Screen.Kind.${kind}`, { modifier: SIGNATURE_FORGERY }));
    }
    if (supplementScreener(name) && isImprovisedDetector(name)) lines.push(L("Screen.Improvised"));
    const alarm = alarmOf(name);
    if (alarm) {
      lines.push(F(`Alarm.${alarm.key}`, { yards: alarm.yards ?? 0 }));
      lines.push(F("Alarm.Rolls", { vision: SPOT_VISION, disable: alarmDisableSkill(alarm.simple === true) }));
    }
  }
  return lines;
}

function itemContext(item: any, on: ElectricSecuritySwitches): Record<string, unknown> {
  const option = optionFor(item, on);
  return {
    lines: electricLines(item, on),
    option: option ? { key: option, label: L(`Option.${option}`), hint: L(`Option.${option}Hint`), checked: optionsOf(item)[option], editable: Boolean(item?.isOwner) } : null,
  };
}

// ── the GM tool ──

type Task = AlarmTask | LockTask;

interface TaskAnswer {
  task: Task;
  way: SpotWay;
  camouflage: number;
  /** An alarm simple enough for Traps, as the electric alarm is. */
  simple: boolean;
  ownBatteries: boolean;
  professional: boolean;
  /** Hearing the mechanism helps, for the digital stethoscope's +3. */
  hearing: boolean;
  /** Noise imposes a penalty: the stethoscope cancels -1 of it. */
  noisy?: boolean;
  grade: LockQuality;
  /** The magnetic lock's ST. */
  st: number;
}

const carries = (actor: any, test: (name: string) => boolean) => [...(actor?.items ?? [])].some((i: any) => i?.type === "equipment" && i.system?.carried !== false && test(nameOf(i)));

async function gmCard(title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    whisper: ChatMessage.implementation.getWhisperRecipients("GM"),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The tasks the switches that are on offer. */
export const tasksFor = (on: ElectricSecuritySwitches): Task[] =>
  [...ALARM_TASKS, ...LOCK_TASKS].filter((task) => (TASK_RULE[task] === "electricLocks" ? on.electricLocks() : on.alarms()));

/** The magnetic lock a targeted character has, for the tool to start from: its ST, or the standard size's. */
function targetedMagneticSt(): number {
  const target = picked().target;
  const lock = [...(target?.items ?? [])].map((i: any) => magneticSize(i?.name)).find(Boolean);
  return MAGNETIC_LOCKS[lock ?? "standard"]!.st;
}

/** One of the supplement's security jobs, for the selected character. */
export async function electricSecurity(api: GWorldApi, on: ElectricSecuritySwitches): Promise<void> {
  const actor = picked().selected;
  if (!actor) return void ui.notifications?.warn(L("PickIntruder"));
  const tasks = tasksFor(on);
  if (!tasks.length) return;
  const opts = (values: readonly string[], label: (v: string) => string) => values.map((v) => `<option value="${esc(v)}">${esc(label(v))}</option>`).join("");
  const box = (name: string, checked = false) => `<input type="checkbox" name="${name}" ${checked ? "checked" : ""} />`;
  const answer = await ask(L("Title"),
    row(L("TaskLabel"), `<select name="task">${opts(tasks, (t) => L(`Task.${t}`))}</select>`)
    + (on.alarms()
      ? row(L("WayLabel"), `<select name="way">${opts(SPOT_WAYS, (w) => F(`Way.${w}`, { modifier: SPOT_VISION }))}</select>`)
        + row(L("Concealed"), `<input type="number" name="camouflage" value="0" min="0" step="1" style="width:70px" />`)
        + row(L("Simple"), box("simple"))
        + row(L("OwnBatteries"), box("ownBatteries"))
        + row(L("Professional"), box("professional"))
        + row(L("GradeLabel"), `<select name="grade">${opts(LOCK_QUALITIES, (q) => F("GradeOption", { grade: L(`Grade.${q}`), modifier: signed(lockQualityModifier(q as LockQuality)) }))}</select>`)
      : "")
    + (on.electricLocks()
      ? row(F("Hearing", { bonus: DIGITAL_STETHOSCOPE.hearing }), box("hearing", true))
        + row(L("EodNoisy"), box("noisy"))
        + row(L("LockSt"), `<input type="number" name="st" value="${targetedMagneticSt()}" min="1" step="1" style="width:70px" />`)
      : ""),
    (form): TaskAnswer => {
      const value = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value ?? "";
      const check = (name: string) => Boolean(form.querySelector<HTMLInputElement>(`[name=${name}]`)?.checked);
      return {
        task: (value("task") || tasks[0]) as Task,
        way: (value("way") || "vision") as SpotWay,
        camouflage: Number(value("camouflage")) || 0,
        simple: check("simple"),
        ownBatteries: check("ownBatteries"),
        professional: check("professional"),
        hearing: check("hearing"),
        noisy: check("noisy"),
        grade: (value("grade") || "basic") as LockQuality,
        st: Math.max(1, Number(value("st")) || 24),
      };
    });
  if (!answer) return;
  await runElectricTask(api, actor, answer, on);
}

/** The roll or card a job takes. Exported for tests. */
export async function runElectricTask(api: GWorldApi, actor: any, answer: TaskAnswer, on: ElectricSecuritySwitches): Promise<void> {
  if (TASK_RULE[answer.task] === "electricLocks" ? !on.electricLocks() : !on.alarms()) return;
  const title = L(`Task.${answer.task}`);
  const roll = (skill: string, modifiers: Array<{ label: string; value: number }> = [], extra: Record<string, unknown> = {}) =>
    api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label: F("RollLabel", { task: title, skill }), modifiers, tags: ["securitySystem"], ...extra } as any) as Promise<any>;
  // The digital stethoscope: +3 to defeat a security device where hearing its mechanism helps,
  // and -1 of a noise penalty cancelled (HT:EE p. 42).
  const byEar = on.electricLocks() && answer.hearing && carries(actor, isDigitalStethoscope)
    ? [{ label: L("StethoscopeLine"), value: stethoscopeBonus(DIGITAL_STETHOSCOPE.hearing, answer.noisy === true) }]
    : [];
  switch (answer.task) {
    case "spot":
      // The same roll as High-Tech's (p. 205): Vision-5, Observation, Per-based Traps, or the contest with Camouflage (HT:EE p. 43).
      await runSecurityTask(api, actor, { task: "spot", way: answer.way, camouflage: answer.camouflage, sophisticated: true, tamper: false });
      return;
    case "identify":
      await roll(SECURITY);
      return;
    case "disable": {
      // Rolled in secret: any failure sets off the alarm (High-Tech p. 205).
      const skill = alarmDisableSkill(answer.simple);
      const result = await roll(skill, byEar, { secret: true });
      if (result) await gmCard(title, [F(result.success ? "Disabled" : "AlarmSounds", { name: actor.name })]);
      return;
    }
    case "cutPower": {
      const outcome = cutPowerOutcome(answer);
      if (outcome === "noEffect") return void (await gmCard(title, [F("OwnBatteriesLine", { name: actor.name })]));
      if (outcome === "alarm") return void (await gmCard(title, [F("ProfessionalLine", { name: actor.name })]));
      const result = await roll(ELECTRICIAN, [], { secret: true });
      if (result) await gmCard(title, [F(result.success ? "PowerCut" : "PowerOn", { name: actor.name })]);
      return;
    }
    case "keySwitch": {
      // Whichever of the three the intruder is best at (HT:EE p. 42).
      const skill = [...KEY_SWITCH_SKILLS].sort((a, b) => skillBase(api, actor, b) - skillBase(api, actor, a))[0]!;
      const result = await roll(skill);
      if (result) await card(actor, title, [F(result.success ? "Bypassed" : "NotBypassed", { name: actor.name })]);
      return;
    }
    case "magneticPower": {
      const result = await roll(ELECTRICIAN);
      if (result) await card(actor, title, [F(result.success ? "MagnetOff" : "PowerOn", { name: actor.name })]);
      return;
    }
    case "magneticForce":
      await api.roll.quickContest({
        label: F("ForceLabel", { st: answer.st }),
        first: { actor, base: api.actors.attribute(actor, "ST") ?? 10, note: "ST" },
        second: { actor: null, base: answer.st, note: L("MagnetNote") },
        tags: ["ST"],
      } as any);
      return;
    case "biometric": {
      const modifier = lockQualityModifier(answer.grade);
      await roll(SECURITY_REPAIR, [...(modifier ? [{ label: F("GradeLine", { grade: L(`Grade.${answer.grade}`) }), value: modifier }] : []), ...byEar]);
      return;
    }
    case "signature":
      // Only an intruder with Electronics Operation (Security) may try (HT:EE p. 43).
      if (api.actors.skillLevel(actor, SECURITY) === null) return void (await card(actor, title, [F("NeedsSecurity", { name: actor.name, skill: SECURITY })]));
      await roll("Forgery", [{ label: L("SignatureLine"), value: SIGNATURE_FORGERY }]);
      return;
  }
}

/**
 * Listening to a mechanical bomb with the digital stethoscope (HT:EE p. 42):
 * +1 to the next Explosives (EOD) roll to find or defuse it, and 1 more where
 * noise imposes a penalty, held on the character until that roll
 * (`actors.addPendingModifier`).
 */
export async function listenToBomb(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const answer = await ask(L("EodTitle"), `<p class="ihint">${esc(L("EodHint"))}</p>` + row(L("EodNoisy"), `<input type="checkbox" name="noisy">`),
    (form) => ({ noisy: form.querySelector<HTMLInputElement>('[name="noisy"]')?.checked === true }));
  if (!answer) return;
  const value = stethoscopeBonus(DIGITAL_STETHOSCOPE.eod, answer.noisy);
  await api.actors.addPendingModifier(actor, { label: F("EodLine", { name: nameOf(item) }), value, skill: EOD_SKILL } as any);
  await card(actor, nameOf(item), [F("EodHeld", { name: actor.name, bonus: signed(value), skill: EOD_SKILL })]);
}

/** Registers the sheet section, the price, the screening button, the GM tool and the fence hooks. */
export function readyElectricSecurity(api: GWorldApi, on: ElectricSecuritySwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-electric-security-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-electric-security-item.hbs`,
    visible: (item) => electricLines(item, on).length > 0 || optionFor(item, on) !== null,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => {
      element.querySelectorAll<HTMLInputElement>("[data-gcc-ht-ee-option]").forEach((input) => {
        input.addEventListener("change", () => void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${input.dataset.gccHtEeOption}`]: input.checked }));
      });
    },
  });

  // A keycard reader's log doubles its price; a portable biometric unit is $5 and 0.2 lb. more; a security fence $100 more (HT:EE pp. 43-44).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-electric-security",
    types: ["equipment"],
    apply: (item, price) => {
      const option = optionFor(item, on);
      if (!option || !optionsOf(item)[option]) return null;
      if (option === "logged") return { cost: price.cost * KEYCARD_LOG_COST, weight: price.weight, label: L("Option.logged") };
      if (option === "portable") return { cost: price.cost + PORTABLE_BIOMETRIC.cost, weight: Math.round((price.weight + PORTABLE_BIOMETRIC.weight) * 100) / 100, label: L("Option.portable") };
      const fence = fenceOf(nameOf(item));
      return fence ? { cost: price.cost + securityFenceCost(fence), weight: price.weight, label: L("Option.alarmed") } : null;
    },
  });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-electric-security", label: L("Title"), icon: "fa-solid fa-bolt", visible: () => on.electricLocks() || on.alarms(), open: () => electricSecurity(api, on) });

  // The supplement's security metal detector, and a general-purpose one in improvised use, screen as High-Tech's handheld detector (HT:EE p. 43).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-ee-screen",
    itemTypes: ["equipment"],
    label: L("ScreenAction"),
    icon: "fa-solid fa-magnifying-glass",
    visible: (item) => on.alarms() && isGear(item) && ours(item) && supplementScreener(nameOf(item)) !== null,
    run: (item, actor) => { void screen(api, item, actor, supplementScreener(nameOf(item))); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-ee-stethoscope-eod",
    itemTypes: ["equipment"],
    label: L("EodTitle"),
    icon: "fa-solid fa-stethoscope",
    visible: (item) => on.electricLocks() && isGear(item) && ours(item) && isDigitalStethoscope(nameOf(item)),
    run: (item, actor) => { void listenToBomb(api, item, actor); },
  });

  registerFenceHooks(api, on.fences);
}
