/**
 * High-Tech's locks, safes, traps and barriers (pp. 202-205, 213), registered
 * with the system through the add-on API under two switches. The rules are in
 * `rules.ts`; a barrier crossed and a safe's figures are the shared security
 * engine's (`src/shared/security/`), which this book gives its own table.
 *
 *   - **Locks and safes (locksAndSafes):** a lock's, safe's, electronic
 *     lock's or identity verifier's quality as a field on the item that
 *     reprices it (x1, x5, x20) and sets the roll to get past it (+5, 0, -5);
 *     a lock's toughness and a safe's DR and HP as the object the system
 *     breaks (`gworld.objectStats`) and on the item sheet; and a row
 *     action on lockpicks, a lockpick gun or an electronic lockpicking kit
 *     that picks a lock -- a targeted character's, or one described -- with
 *     its quality, the lockpick gun's +4 or -5, a stethoscope's and an
 *     endoscope's +2, Time Spent against a minute (an hour for a safe), and
 *     an older lock's bonus from the Tech-Level Modifiers.
 *   - **Traps and barriers (trapsAndBarriers):** a GM tool that runs a trap
 *     or barrier against its targets -- caltrops' Vision roll and thrust-3
 *     to the foot, a tripwire, a stake pit, barbed and razor wire yard by
 *     yard, a cattle fence's stun held while the victim touches it, a lethal
 *     fence's shocks, and a car stopper -- and each record's figures on the
 *     item sheet.
 *
 * The supplement Electricity and Electronics extends both (HT:EE pp. 42-43,
 * `../electric-security/`): its electric locks and screening systems are lock
 * records here under their own switches (`electricLocks`, `alarmSystems`),
 * its biometric systems joining the identity verifiers' grades, and its
 * low-voltage and stun-lethal fences are the traps tool's under
 * `stunLethalFences`.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { SECURITY_TABLES, crossBarrier, figureLines, type SecurityTable } from "../../../shared/security/index.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";
import { touchFence } from "../electric-security/fences.js";
import { DIGITAL_STETHOSCOPE, supplementLock, type FenceTouch, type SupplementLock } from "../electric-security/rules.js";
import {
  BARRIERS,
  CALTROP_DAMAGE,
  CALTROP_READIES,
  CAR_STOPPER,
  DIRTY_INFECTION,
  ENDOSCOPE_BONUS,
  LETHAL_FENCE,
  LOCK_QUALITIES,
  LOCK_RECORDS,
  LOCK_TOUGHNESS,
  SAFES,
  SMART_FENCE_MODIFIER,
  SPIKE_STRIP,
  STETHOSCOPE_BONUS,
  TRIPWIRE,
  WIRE_SNAG_ST,
  addToDice,
  caltropLodged,
  caltropsSteppedOn,
  caltropsVision,
  cryOutModifier,
  cuttingInjury,
  lockQualityCost,
  lockQualityModifier,
  olderLockBonus,
  pickGunModifier,
  pickSeconds,
  pickSkill,
  wireLayingMinutes,
  type LockKind,
  type LockQuality,
  type LockRecord,
} from "./rules.js";

const NS = "GCC.HT.Security";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const FIELD = "lock";

/** This book's table in the shared security engine: its barriers and safes (pp. 203-204). */
export const SECURITY_TABLE: SecurityTable = Object.freeze({
  book: "high-tech",
  tls: { min: 0, max: 8 },
  ns: NS,
  switch: `${MODULE_ID}.locksAndSafes`,
  barriers: BARRIERS,
  safes: SAFES,
  locks: {},
  defaultTl: 5,
});

export interface SecuritySwitches {
  locks: () => boolean;
  traps: () => boolean;
  /** The supplement's stun-lethal fences, electric locks, and screening and alarms (HT:EE pp. 42-44). */
  fences?: () => boolean;
  electricLocks?: () => boolean;
  alarms?: () => boolean;
}

/** Registers the lock's quality field, and this book's table with the shared security engine. */
export function initHighTechSecurity(): void {
  SECURITY_TABLES.register(SECURITY_TABLE);
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      quality: new f.StringField({ required: true, nullable: false, blank: false, initial: "basic", choices: [...LOCK_QUALITIES] }),
    }),
  });
}

/** A record of this book's, or one of no book's: the rule's to handle under High-Tech's switch (D1). */
const ours = (item: any) => {
  const book = bookOf(item);
  return book === null || book === "high-tech";
};

/** What a record is to the lock rules, or null: High-Tech's by name, then the supplement's (HT:EE pp. 42-43). */
export function lockRecord(item: any): LockRecord | null {
  if (item?.type !== "equipment" || !ours(item)) return null;
  const name = String(item.name ?? "").trim();
  return LOCK_RECORDS[name] ?? supplementLock(name);
}

/** Whether the switch that runs a lock record is on: High-Tech's `locksAndSafes`, or the supplement's own for its records. */
export function lockOn(record: LockRecord | null, on: SecuritySwitches): boolean {
  if (!record) return false;
  const rule = (record as Partial<SupplementLock>).rule;
  if (rule === "electricLocks") return Boolean(on.electricLocks?.());
  if (rule === "alarmSystems") return Boolean(on.alarms?.());
  return on.locks();
}

/** A record's lock rules, where the switch that runs them is on. */
export function activeLock(item: any, on: SecuritySwitches): LockRecord | null {
  const record = lockRecord(item);
  return lockOn(record, on) ? record : null;
}

/** A lock's quality grade: basic unless its field says otherwise. */
export function lockQuality(item: any): LockQuality {
  const value = item?.system?.extensions?.[MODULE_ID]?.[FIELD]?.quality;
  return LOCK_QUALITIES.includes(value) ? value : "basic";
}

/** The picking tools (p. 213): what kind each is. */
type PickTool = "picks" | "gun" | "kit";
const PICK_TOOLS: Readonly<Record<string, PickTool>> = Object.freeze({ "Lockpicks": "picks", "Lockpick Gun": "gun", "Electronic Lockpicking Kit": "kit" });

export function pickTool(item: any): PickTool | null {
  if (item?.type !== "equipment" || !ours(item)) return null;
  return PICK_TOOLS[String(item.name ?? "").trim()] ?? null;
}

/** The kinds of lock a tool gets past: picks and the gun mechanical ones, the kit electronic ones (pp. 204, 213). */
const kindsFor = (tool: PickTool): LockKind[] => (tool === "kit" ? ["electronic", "verifier"] : ["lock", "safe"]);

const STETHOSCOPE = /^(electronic )?stethoscope$/i;
const ENDOSCOPE = /^(search|surveillance) endoscope$/i;
const carries = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((i: any) => i?.type === "equipment" && i.system?.carried !== false && pattern.test(String(i.name ?? "")));

/** A trap or barrier record (pp. 203-205), by name. */
type TrapRecord = "caltrops" | "barbedWire" | "razorWire" | "cattleFence" | "lethalFence" | "spikeStrip" | "carStopper" | "smartFence" | "stakePit";
const TRAP_NAMES: ReadonlyArray<[RegExp, TrapRecord]> = [
  [/^caltrops\b/i, "caltrops"],
  [/^barbed wire\b/i, "barbedWire"],
  [/^razor wire\b/i, "razorWire"],
  [/^cattle fence\b/i, "cattleFence"],
  [/^lethal fence\b/i, "lethalFence"],
  [/^spike strip\b/i, "spikeStrip"],
  [/^electromagnetic car stopper$/i, "carStopper"],
  [/^smart fence\b/i, "smartFence"],
  [/^stake pit$/i, "stakePit"],
];

export function trapRecord(item: any): TrapRecord | null {
  if (item?.type !== "equipment" || !ours(item)) return null;
  const name = String(item.name ?? "").trim();
  return TRAP_NAMES.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));
const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** A dialog of fields; the callback reads the form. */
async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const select = (name: string, options: Array<[string, string]>, selected = "") => `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const checkbox = (name: string, checked = false) => `<input type="checkbox" name="${name}" ${checked ? "checked" : ""} />`;
const number = (name: string, value: number, min = 0) => `<input type="number" name="${name}" value="${value}" min="${min}" step="1" style="width:70px" />`;
const field = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

// ── picking a lock (pp. 203-205, 213) ──

/** The TL a character's skill was learned at, as the system reads it (Characters p. 168). */
function skillTl(api: GWorldApi, actor: any, skill: string): number {
  const wanted = api.rules.normalizeSkillName(skill);
  const item = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && api.rules.normalizeSkillName(String(i.name ?? "")) === wanted);
  return api.rules.skillTechLevel(String(item?.name ?? skill), item?.system?.techLevel, api.rules.parseTechLevel(actor?.system?.tl) ?? 0);
}

/** What is being picked. */
export interface LockTarget {
  name: string;
  kind: LockKind;
  quality: LockQuality;
  tl: number;
  /** The skill that gets past it, where not the kind's own. */
  skill?: string | undefined;
}

/** A pick's modifiers, each with its label: quality, the gun, the lock's TL, aids, time. */
export function pickModifiers(api: GWorldApi, actor: any, tool: PickTool, lock: LockTarget, aids: { stethoscope: boolean; endoscope: boolean; timeFactor: number; digitalStethoscope?: boolean }): { modifiers: Array<{ label: string; value: number }>; impossible: string | null } {
  const modifiers: Array<{ label: string; value: number }> = [];
  const quality = lockQualityModifier(lock.quality);
  if (quality) modifiers.push({ label: F("Pick.Quality", { quality: L(`Quality.${lock.quality}`) }), value: quality });
  if (tool === "gun") modifiers.push({ label: L("Pick.Gun"), value: pickGunModifier(lock.quality) });
  const skill = pickSkill(lock.kind, lock.skill);
  const tl = skillTl(api, actor, skill);
  let impossible: string | null = null;
  if (lock.tl < tl) {
    // An older lock: the size of the Tech-Level Modifiers' penalty, as a bonus (p. 203).
    const bonus = olderLockBonus(lock.tl, tl, api.rules.techLevelModifier({ skillTechLevel: tl, equipmentTechLevel: lock.tl, iqBased: true }));
    if (bonus) modifiers.push({ label: F("Pick.Older", { lock: lock.tl, skill: tl }), value: bonus });
  } else if (lock.tl > tl) {
    // A newer one is equipment beyond the skill, as the system reads it (Characters p. 168).
    const use = api.roll.equipmentUse(actor, { name: lock.name, system: { tl: String(lock.tl) } }, skill);
    impossible = use.impossible;
    for (const line of use.lines) if (line.key === "techLevel") modifiers.push({ label: line.label, value: line.value });
  }
  if (aids.stethoscope && lock.kind !== "electronic" && lock.kind !== "verifier") modifiers.push({ label: L("Pick.Stethoscope"), value: STETHOSCOPE_BONUS });
  if (aids.endoscope) modifiers.push({ label: L("Pick.Endoscope"), value: ENDOSCOPE_BONUS });
  // The supplement's digital stethoscope: +1 to crack a safe (HT:EE pp. 14, 42).
  if (aids.digitalStethoscope && lock.kind === "safe") modifiers.push({ label: L("Pick.DigitalStethoscope"), value: DIGITAL_STETHOSCOPE.safe });
  const base = pickSeconds(lock.kind, tool === "gun");
  const time = timeSpentModifier(base * aids.timeFactor, base);
  if (time) modifiers.push({ label: L("Pick.TimeSpent"), value: time });
  return { modifiers, impossible };
}

const TIME_FACTORS = [1, 2, 4, 8, 15, 30, 0.5] as const;

/** A time in seconds, in words. */
function duration(seconds: number): string {
  if (seconds >= 3600) return F("Hours", { hours: Math.round((seconds / 3600) * 10) / 10 });
  if (seconds >= 60) return F("Minutes", { minutes: Math.round((seconds / 60) * 10) / 10 });
  return F("Seconds", { seconds: Math.round(seconds) });
}

/** Picks a lock with a tool: a targeted character's lock, or one described. */
async function pickLock(api: GWorldApi, item: any, actor: any, on: SecuritySwitches): Promise<void> {
  const tool = pickTool(item);
  if (!tool || !actor) return;
  const kinds = kindsFor(tool);
  const targeted = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean)
    .flatMap((owner: any) => [...(owner.items ?? [])].filter((i: any) => kinds.includes(activeLock(i, on)?.kind as LockKind)).map((lock: any) => ({ owner, lock })));
  const personal = api.rules.parseTechLevel(actor.system?.tl) ?? 8;
  const hasStethoscope = tool !== "kit" && carries(actor, STETHOSCOPE);
  const hasEndoscope = carries(actor, ENDOSCOPE);
  const hasDigital = Boolean(on.electricLocks?.()) && tool !== "kit" && carries(actor, /^digital stethoscope$/i);
  const answer = await ask(L("Pick.Title"),
    (targeted.length ? row(L("Pick.Lock"), select("lock", [["", L("Pick.Described")], ...targeted.map(({ owner, lock }: any, i: number): [string, string] => [String(i), `${lock.name} (${owner.name})`])], "0")) : "")
    + row(L("Pick.Kind"), select("kind", kinds.map((k): [string, string] => [k, L(`Kind.${k}`)])))
    + row(L("Pick.QualityField"), select("quality", LOCK_QUALITIES.map((q): [string, string] => [q, L(`Quality.${q}`)]), "good"))
    + row(L("Pick.Tl"), number("tl", personal))
    + row(L("Pick.Time"), select("time", TIME_FACTORS.map((t): [string, string] => [String(t), L(`Time.${String(t).replace(".", "_")}`)])))
    + (hasStethoscope ? row(L("Pick.Quiet"), checkbox("stethoscope")) : "")
    + (hasEndoscope ? row(L("Pick.UseEndoscope"), checkbox("endoscope", true)) : ""),
    (form) => ({
      lock: field(form, "lock")?.value ?? "",
      kind: (field(form, "kind")?.value ?? kinds[0]) as LockKind,
      quality: (field(form, "quality")?.value ?? "good") as LockQuality,
      tl: Math.max(0, Math.floor(Number(field(form, "tl")?.value) || personal)),
      time: Number(field(form, "time")?.value) || 1,
      stethoscope: Boolean(field(form, "stethoscope")?.checked),
      endoscope: Boolean(field(form, "endoscope")?.checked),
    }));
  if (!answer) return;
  const chosen = answer.lock === "" ? null : targeted[Number(answer.lock)] ?? null;
  const lock: LockTarget = chosen
    ? { name: String(chosen.lock.name), kind: lockRecord(chosen.lock)!.kind, quality: lockQuality(chosen.lock), tl: api.rules.parseTechLevel(chosen.lock.system?.tl) ?? answer.tl, skill: lockRecord(chosen.lock)!.skill }
    : { name: L(`Kind.${answer.kind}`), kind: answer.kind, quality: answer.quality, tl: answer.tl };
  const skill = pickSkill(lock.kind, lock.skill);
  const { modifiers, impossible } = pickModifiers(api, actor, tool, lock, { stethoscope: answer.stethoscope, endoscope: answer.endoscope, timeFactor: answer.time, digitalStethoscope: hasDigital });
  if (impossible) return void ui.notifications?.warn(impossible);
  const base = api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
  const result: any = await api.roll.success({ actor, base, kind: "skill", skill, item, label: F("Pick.Label", { lock: lock.name }), modifiers, tags: ["lockpicking"] } as any);
  if (!result) return;
  const seconds = pickSeconds(lock.kind, tool === "gun") * answer.time;
  await say(actor, String(item.name ?? ""), [F(result.success ? "Pick.Opened" : "Pick.Failed", { name: actor.name, lock: lock.name, time: duration(seconds) })]);
}

// ── traps and barriers (pp. 203-205) ──

const TRAP_KINDS = ["caltrops", "tripwire", "stakePit", "barbedWire", "razorWire", "cattleFence", "lethalFence", "carStopper"] as const;
/** The supplement's fences, under `stunLethalFences` (HT:EE p. 42). */
const FENCE_KINDS = ["lowVoltageFence", "stunLethalFence"] as const;
type TrapKind = (typeof TRAP_KINDS)[number] | (typeof FENCE_KINDS)[number];

interface TrapAnswer {
  kind: TrapKind;
  yards: number;
  seconds: number;
  metal: boolean;
  watching: boolean;
  hidden: boolean;
  fishingLine: boolean;
  dirty: boolean;
  /** A stun-lethal fence's first touch, or a later one (HT:EE p. 42). */
  touch?: FenceTouch;
  /** Seconds before the current is cut, for a victim held on the wire. */
  cutOff?: number;
  /** A security fence, which sets off an alarm when touched (HT:EE p. 44). */
  alarmed?: boolean;
}

/** A Per-based Traps roll's level (p. 203): the skill moved from IQ to Per, or its Per-5 default. */
function perBasedTraps(api: GWorldApi, actor: any): number {
  const per = api.actors.attribute(actor, "Per") ?? 10;
  const traps = api.actors.skillLevel(actor, "Traps");
  return traps === null ? per - 5 : traps - (api.actors.attribute(actor, "IQ") ?? 10) + per;
}

/** A hidden trap's spotting roll; true where it is seen. */
async function spots(api: GWorldApi, victim: any, name: string, modifier: number): Promise<boolean> {
  const modifiers = modifier ? [{ label: L("Trap.FishingLine"), value: modifier }] : [];
  const result: any = await api.roll.success({ actor: victim, base: perBasedTraps(api, victim), kind: "skill", skill: "Traps", label: F("Trap.Spot", { trap: name }), modifiers, tags: ["traps", "spot"] } as any);
  return Boolean(result?.success);
}

const thrustOf = (api: GWorldApi, actor: any) => String(api.actors.derived(actor)?.thrust ?? "1d-2");

async function caltrops(api: GWorldApi, victim: any, name: string, answer: TrapAnswer): Promise<void> {
  const derived = api.actors.derived(victim) ?? {};
  const vision = (derived.senses ?? []).find?.((s: any) => s?.sense === "vision")?.score;
  const base = typeof vision === "number" ? vision : api.actors.attribute(victim, "Per") ?? 10;
  const move = Math.max(0, Number(derived.move) || 0);
  const modifiers = caltropsVision(api.rules.speedRangeModifier(move), answer.watching).map((line) => ({
    label: line.key === "speed" ? F("Trap.MoveSpeed", { move }) : L("Trap.NotWatching"),
    value: line.value,
  }));
  const result: any = await api.roll.success({ actor: victim, base, kind: "attribute", label: F("Trap.Vision", { trap: name }), modifiers, tags: ["vision", "sense"] } as any);
  if (!result) return;
  const count = caltropsSteppedOn(result);
  if (!count) return void say(victim, name, [F("Trap.Avoided", { name: victim.name })]);
  const formula = addToDice(thrustOf(api, victim), CALTROP_DAMAGE.modifier);
  const dr = Number(derived.drByLocation?.[CALTROP_DAMAGE.location]) || 0;
  let lodged = 0;
  for (let i = 0; i < count; i += 1) {
    const rolled = await api.roll.damage({
      actor: victim,
      label: F("Trap.CaltropLabel", { name: victim.name, n: i + 1, count }),
      formula,
      damageType: CALTROP_DAMAGE.type,
      calledShot: { hitLocation: CALTROP_DAMAGE.location, addonLocation: null },
      source: "caltrops",
    } as any);
    if (typeof rolled === "number" && caltropLodged(rolled, dr)) lodged += 1;
  }
  const lines = [F("Trap.SteppedOn", { name: victim.name, count, formula })];
  if (lodged) lines.push(F("Trap.Lodged", { count: lodged, readies: CALTROP_READIES }));
  if (answer.dirty) lines.push(F("Trap.Dirty", { modifier: DIRTY_INFECTION }));
  await say(victim, name, lines);
}

async function tripwire(api: GWorldApi, victim: any, name: string, answer: TrapAnswer): Promise<void> {
  if (answer.hidden && (await spots(api, victim, name, answer.fishingLine ? TRIPWIRE.invisible : 0))) return void say(victim, name, [F("Trap.Spotted", { name: victim.name })]);
  const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "DX") ?? 10, kind: "attribute", label: F("Trap.Trip", { trap: name }), modifiers: [{ label: name, value: TRIPWIRE.dx }], tags: ["DX"] } as any);
  if (!result) return;
  if (result.success) return void say(victim, name, [F("Trap.Kept", { name: victim.name })]);
  await api.actors.setPosture(victim, "prone");
  await say(victim, name, [F("Trap.Tripped", { name: victim.name })]);
}

async function stakePit(api: GWorldApi, victim: any, name: string, answer: TrapAnswer): Promise<void> {
  if (answer.hidden && (await spots(api, victim, name, 0))) return void say(victim, name, [F("Trap.Spotted", { name: victim.name })]);
  const formula = thrustOf(api, victim);
  await api.roll.damage({ actor: victim, label: F("Trap.PitLabel", { name: victim.name }), formula, damageType: "imp", source: "stakePit" } as any);
  await say(victim, name, [F("Trap.FellIn", { name: victim.name, formula }), ...(answer.dirty ? [F("Trap.Dirty", { modifier: DIRTY_INFECTION })] : [])]);
}

/**
 * Through barbed or razor wire a yard at a time: the first failure tears,
 * snags, and asks the Will roll not to cry out (p. 204). The snag is a
 * Binding of ST 8 on the system's entangled state (API 1.107.0), which the
 * sheet's Break free button (ST or Escape against 8) ends.
 */
async function wire(api: GWorldApi, victim: any, name: string, kind: "barbedWire" | "razorWire", answer: TrapAnswer): Promise<void> {
  const barrier = BARRIERS[kind];
  if (!barrier) return;
  const yards = Math.max(1, answer.yards);
  for (let yard = 1; yard <= yards; yard += 1) {
    const crossed = await crossBarrier(api, NS, victim, barrier, { name: F("Barrier.Yard", { barrier: name, yard, yards }), quiet: true });
    if (crossed.avoided) continue;
    const lines = [F("Barrier.Torn", { name: victim.name, yard })];
    const torso = Number(api.actors.derived(victim)?.drByLocation?.torso) || 0;
    const injury = crossed.damage === null ? 0 : cuttingInjury(crossed.damage, torso);
    const traits = traitNames(victim);
    const modifier = cryOutModifier({
      highPainThreshold: traits.some((n) => /^high pain threshold\b/i.test(n)),
      lowPainThreshold: traits.some((n) => /^low pain threshold\b/i.test(n)),
      injury,
    });
    const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "Will") ?? 10, kind: "attribute", label: F("Barrier.CryOut", { name: victim.name }), modifiers: modifier ? [{ label: injury ? F("Barrier.CryOutInjury", { injury }) : L("Barrier.PainThreshold"), value: modifier }] : [], tags: ["Will"] } as any);
    if (result) lines.push(F(result.success ? "Barrier.Silent" : "Barrier.CriedOut", { name: victim.name }));
    const bound = await api.actors.bind(victim, { st: WIRE_SNAG_ST, label: name, source: `${MODULE_ID}.wire` });
    lines.push(F(bound ? "Barrier.SnaggedBound" : "Barrier.Snagged", { st: WIRE_SNAG_ST, name: victim.name }));
    return void say(victim, name, lines);
  }
  await say(victim, name, [F("Barrier.Through", { name: victim.name, yards })]);
}

/** A cattle fence (p. 204): a HT roll each second of contact; a failure stuns, held while the contact lasts. */
async function cattleFence(api: GWorldApi, victim: any, name: string, answer: TrapAnswer): Promise<void> {
  const seconds = Math.max(1, answer.seconds);
  for (let second = 1; second <= seconds; second += 1) {
    const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "HT") ?? 10, kind: "attribute", label: F("Barrier.Zap", { second }), tags: ["resist", "HT", "shock"] } as any);
    if (!result) return;
    if (result.success) continue;
    const left = seconds - second;
    // Stunned while touching it; the rolls to recover start once the contact ends (API 1.89 holdRecovery).
    await api.actors.applyCondition(victim, { key: "stunned", ...(left > 0 ? { holdRecovery: { seconds: left } } : {}) } as any);
    return void say(victim, name, [F(left > 0 ? "Barrier.StunnedHeld" : "Barrier.Stunned", { name: victim.name, seconds: left })]);
  }
  await say(victim, name, [F("Barrier.Resisted", { name: victim.name })]);
}

/** A lethal fence (p. 204): 3d burning a second, each a lethal shock (Campaigns p. 432), held while the contact lasts. */
async function lethalFence(api: GWorldApi, victim: any, answer: TrapAnswer): Promise<void> {
  const seconds = Math.max(1, Math.min(60, answer.seconds));
  for (let second = 1; second <= seconds; second += 1) {
    await api.hazards.shock({ actor: victim, kind: "lethal", modifier: 0, continuous: true, formula: LETHAL_FENCE, metalArmor: answer.metal, contactSeconds: seconds - second } as any);
  }
}

/** An electromagnetic car stopper (pp. 203-204): HT-8 for a TL8+ vehicle or someone Electrical, or out for the margin in seconds. */
async function carStopper(api: GWorldApi, victim: any, name: string): Promise<void> {
  const vehicle = victim?.type === "vehicle";
  const tl = api.rules.parseTechLevel(victim?.system?.tl) ?? 0;
  const affected = vehicle ? tl >= CAR_STOPPER.minTl : traitNames(victim).some((n) => /^electrical\b/i.test(n));
  if (!affected) return void say(victim, name, [F("Barrier.Unaffected", { name: victim.name })]);
  const ht = api.actors.attribute(victim, "HT") ?? (Number(victim?.system?.ht) || 10);
  const result: any = await api.roll.success({ actor: victim, base: ht, kind: "attribute", label: F("Barrier.Resist", { barrier: name }), modifiers: [{ label: name, value: CAR_STOPPER.modifier }], tags: ["resist", "affliction", "HT"] } as any);
  if (!result) return;
  if (result.success) return void say(victim, name, [F("Barrier.Resisted", { name: victim.name })]);
  const seconds = Math.max(1, Math.abs(Number(result.margin) || 0));
  if (!vehicle) await api.actors.applyCondition(victim, { key: "unconscious", duration: { seconds } } as any);
  await say(victim, name, [F("Barrier.KnockedOut", { name: victim.name, seconds })]);
}

async function runTrap(api: GWorldApi, on: SecuritySwitches): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  if (!targets.length) return void ui.notifications?.warn(L("Trap.Target"));
  const traps = on.traps();
  const fences = Boolean(on.fences?.());
  const kinds: TrapKind[] = [...(traps ? TRAP_KINDS : []), ...(fences ? FENCE_KINDS : [])];
  if (!kinds.length) return;
  const answer = await ask(L("Trap.Title"),
    row(L("Trap.Kind"), select("kind", kinds.map((k): [string, string] => [k, L(`Trap.${k}`)])))
    + (traps ? row(L("Trap.Yards"), number("yards", 1, 1)) : "")
    + row(L("Trap.Seconds"), number("seconds", 1, 1))
    + row(L("Trap.Metal"), checkbox("metal"))
    + (traps ? row(L("Trap.Watching"), checkbox("watching")) + row(L("Trap.Hidden"), checkbox("hidden", true)) + row(L("Trap.FishingLine"), checkbox("fishingLine")) + row(L("Trap.DirtyField"), checkbox("dirty")) : "")
    + (fences
      ? row(L("Trap.Touch"), select("touch", [["first", L("Trap.TouchFirst")], ["second", L("Trap.TouchSecond")]]))
        + row(L("Trap.CutOff"), number("cutOff", 10, 1))
        + row(L("Trap.Alarmed"), checkbox("alarmed"))
      : ""),
    (form): TrapAnswer => ({
      kind: (field(form, "kind")?.value ?? kinds[0]) as TrapKind,
      yards: Math.max(1, Math.floor(Number(field(form, "yards")?.value) || 1)),
      seconds: Math.max(1, Math.floor(Number(field(form, "seconds")?.value) || 1)),
      metal: Boolean(field(form, "metal")?.checked),
      watching: Boolean(field(form, "watching")?.checked),
      hidden: Boolean(field(form, "hidden")?.checked),
      fishingLine: Boolean(field(form, "fishingLine")?.checked),
      dirty: Boolean(field(form, "dirty")?.checked),
      touch: (field(form, "touch")?.value ?? "first") as FenceTouch,
      cutOff: Math.max(1, Math.floor(Number(field(form, "cutOff")?.value) || 10)),
      alarmed: Boolean(field(form, "alarmed")?.checked),
    }));
  if (!answer) return;
  await runTrapOn(api, targets, answer);
}

/** Runs a trap or barrier against each victim. */
export async function runTrapOn(api: GWorldApi, victims: any[], answer: TrapAnswer): Promise<void> {
  const name = L(`Trap.${answer.kind}`);
  for (const victim of victims) {
    if (answer.kind === "caltrops") await caltrops(api, victim, name, answer);
    else if (answer.kind === "tripwire") await tripwire(api, victim, name, answer);
    else if (answer.kind === "stakePit") await stakePit(api, victim, name, answer);
    else if (answer.kind === "barbedWire" || answer.kind === "razorWire") await wire(api, victim, name, answer.kind, answer);
    else if (answer.kind === "cattleFence") await cattleFence(api, victim, name, answer);
    else if (answer.kind === "lethalFence") await lethalFence(api, victim, answer);
    else if (answer.kind === "carStopper") await carStopper(api, victim, name);
    else if (answer.kind === "lowVoltageFence" || answer.kind === "stunLethalFence") {
      await touchFence(api, victim, name, {
        fence: answer.kind === "lowVoltageFence" ? "lowVoltage" : "stunLethal",
        touch: answer.touch ?? "first",
        seconds: answer.seconds,
        cutOff: answer.cutOff ?? 10,
        metal: answer.metal,
        alarmed: answer.alarmed ?? false,
      });
    }
  }
}

// ── the item sheet ──

function trapLines(item: any): string[] {
  const trap = trapRecord(item);
  if (trap === "caltrops") return [F("Item.Caltrops", { modifier: CALTROP_DAMAGE.modifier, readies: CALTROP_READIES })];
  if (trap === "barbedWire" || trap === "razorWire") {
    return [
      F(trap === "razorWire" ? "Item.RazorWire" : "Item.BarbedWire", { st: WIRE_SNAG_ST }),
      F("Item.WireLaying", { minutes: wireLayingMinutes(15, true), bare: wireLayingMinutes(15, false) }),
    ];
  }
  if (trap === "cattleFence") return [L("Item.CattleFence")];
  if (trap === "lethalFence") return [F("Item.LethalFence", { damage: LETHAL_FENCE })];
  if (trap === "spikeStrip") return [F("Item.SpikeStrip", { ...SPIKE_STRIP })];
  if (trap === "carStopper") return [F("Item.CarStopper", { modifier: CAR_STOPPER.modifier })];
  if (trap === "smartFence") return [F("Item.SmartFence", { modifier: SMART_FENCE_MODIFIER })];
  if (trap === "stakePit") return [F("Item.StakePit", { modifier: DIRTY_INFECTION })];
  return [];
}

function lockLines(item: any, on: SecuritySwitches): string[] {
  const lines: string[] = [];
  const record = activeLock(item, on);
  if (record) {
    const quality = lockQuality(item);
    const modifier = signed(lockQualityModifier(quality));
    if (record.kind === "lock" && record.toughness) lines.push(F("Item.Toughness", { ...LOCK_TOUGHNESS[record.toughness], toughness: L(`Toughness.${record.toughness}`) }));
    // A safe's DR and HP, from this book's table in the shared engine.
    if (record.kind === "safe") lines.push(...figureLines(item, SECURITY_TABLE));
    lines.push(record.skill ? F("Item.PickWith", { skill: record.skill, modifier }) : F(`Item.Pick.${record.kind}`, { modifier }));
    if (record.forgery !== undefined) lines.push(F("Item.Forgery", { modifier: record.forgery }));
  }
  if (!on.locks()) return lines;
  const tool = pickTool(item);
  if (tool) lines.push(tool === "gun" ? F("Item.Gun", { basic: signed(pickGunModifier("basic")), other: pickGunModifier("fine") }) : L(`Item.${tool}`));
  const name = String(item?.name ?? "");
  if (item?.type === "equipment" && ours(item) && STETHOSCOPE.test(name)) lines.push(F("Item.Stethoscope", { bonus: STETHOSCOPE_BONUS }));
  if (item?.type === "equipment" && ours(item) && ENDOSCOPE.test(name)) lines.push(F("Item.Endoscope", { bonus: ENDOSCOPE_BONUS }));
  return lines;
}

function itemContext(item: any, on: SecuritySwitches): Record<string, unknown> {
  const lines = [...lockLines(item, on), ...(on.traps() ? trapLines(item) : [])];
  const record = activeLock(item, on);
  const quality = lockQuality(item);
  return {
    lines,
    quality: record
      ? { editable: Boolean(item.isOwner), options: LOCK_QUALITIES.map((q) => ({ value: q, label: F("QualityOption", { quality: L(`Quality.${q}`), cost: lockQualityCost(q) }), selected: q === quality })) }
      : null,
  };
}

export function readyHighTechSecurity(api: GWorldApi, on: SecuritySwitches): void {
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-traps", label: L("Trap.Title"), icon: "fa-solid fa-road-barrier", visible: () => on.traps() || Boolean(on.fences?.()), open: () => runTrap(api, on) });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-security-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-security-item.hbs`,
    visible: (item) => item?.type === "equipment" && (itemContext(item, on).lines as string[]).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => {
      element.querySelectorAll<HTMLSelectElement>("[data-gcc-ht-lock-quality]").forEach((input) => {
        input.addEventListener("change", () => void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.quality`]: input.value }));
      });
    },
  });

  // A good lock costs five times a basic one, a fine one twenty; a safe's price moves with its lock's (p. 203).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-lock-quality",
    types: ["equipment"],
    apply: (item, price) => {
      if (!activeLock(item, on)) return null;
      const quality = lockQuality(item);
      const multiple = lockQualityCost(quality);
      if (multiple === 1) return null;
      return { cost: Math.round(price.cost * multiple * 100) / 100, weight: price.weight, label: F("QualityPrice", { quality: L(`Quality.${quality}`) }) };
    },
  });

  // A lock's toughness, or a safe's own DR and HP in place of its lock's, as the object the system breaks (p. 203).
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    const record = activeLock(context?.item, on);
    const figures = record?.kind === "safe" ? SAFES[String(context.item.name ?? "").trim()] : record?.toughness ? LOCK_TOUGHNESS[record.toughness] : null;
    if (!figures) return;
    context.dr = figures.dr;
    context.hp = figures.hp;
    context.notes?.push?.(record?.kind === "safe" ? L("SafeNote") : F("ToughnessNote", { toughness: L(`Toughness.${record!.toughness}`) }));
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-pick-lock",
    itemTypes: ["equipment"],
    label: L("Pick.Title"),
    icon: "fa-solid fa-key",
    visible: (item) => on.locks() && pickTool(item) !== null,
    run: (item, actor) => { void pickLock(api, item, actor, on); },
  });
}
