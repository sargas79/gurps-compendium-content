/**
 * The lie-detector engine: a machine read by its operator against the
 * subject's Will, whose margin goes on the interrogators' Interrogation rolls
 * (High-Tech pp. 215-216), registered with the system through the add-on API
 * for every book that prints such a machine.
 *
 * Each book registers its table in `LIE_DETECTOR_TABLES` -- which of its
 * records are lie detectors and how much of the margin each gives, the skill
 * that reads them, what a subject who can't be read costs, and its text --
 * then calls `readyLieDetectors`, which registers once however many books call
 * it. An item takes its own book's table, under that book's switch only.
 *
 *   - A row button on the machine runs the test on the one token targeted: a
 *     Quick Contest of the operator's skill against the subject's Will. The
 *     margin (plus for a win, minus for a loss) is kept on the machine as its
 *     reading of that subject until the next test or until it is cleared.
 *     The contest is the GM's secret roll (Campaigns p. 494; the system's
 *     secret contest since API 1.111.0), and the reading is told to the GMs
 *     alone.
 *   - An Interrogation roll against a subject a machine has a reading of --
 *     the contest's other side, or the one token targeted -- gets the
 *     reading, times the machine's share, as a line
 *     (`gworld.successRollModifiers`). The machine may be anyone's: its
 *     operator and the questioner need not be the same person. A subject the
 *     table says can't be read (a trait) gives its fixed line instead.
 *
 * Ultra-Tech's veridicator and verifier software, which work on Detect Lies,
 * stay in its security rules.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";

/** A lie detector, as its book's table reads its record. */
export interface LieDetector {
  /** The share of the operator's margin it gives: 1 for a polygraph, 1/2 for a voice stress analyser. */
  share: number;
}

/** A book's lie detectors. */
export interface LieDetectorTable extends BookTable {
  /** The switch that turns the book's lie detection on, as its full key. */
  switch: string;
  /** Its text's namespace: the engine reads `<i18n>.LieDetection.*`. */
  i18n: string;
  /** The lie detector a record is, or null. */
  detector(item: any): LieDetector | null;
  /** The skill the operator reads the machine with, and its default. */
  operator: { skill: string; attribute: "IQ" | "DX"; modifier: number };
  /** A subject the machine can't read -- by a trait's name -- and the fixed line that gives instead. */
  unreadable?: { trait: RegExp; value: number };
  /** The item sheet's lines about a machine. */
  lines(item: any, detector: LieDetector): string[];
}

export const LIE_DETECTOR_TABLES = new BookTables<LieDetectorTable>();

/** The item flag that holds a machine's last reading. */
export const READING_FLAG = "lieReading";

/** A machine's reading of one subject: the operator's margin in the Quick Contest. */
export interface Reading {
  subject: string;
  name: string;
  margin: number;
}

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.LieDetection.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.LieDetection.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";

interface Machine {
  item: any;
  table: LieDetectorTable;
  detector: LieDetector;
}

/** The lie detector a record is, while its book's switch is on. */
export function detectorOf(item: any): Machine | null {
  if (!isGear(item)) return null;
  const table = LIE_DETECTOR_TABLES.forItem(item, (t) => isRuleOn(t.switch));
  const detector = table?.detector(item) ?? null;
  return table && detector ? { item, table, detector } : null;
}

export function readingOf(item: any): Reading | null {
  const stored = item?.getFlag?.(MODULE_ID, READING_FLAG) ?? item?.flags?.[MODULE_ID]?.[READING_FLAG];
  if (!stored || typeof stored.subject !== "string" || !stored.subject) return null;
  return { subject: stored.subject, name: String(stored.name ?? ""), margin: Number(stored.margin) || 0 };
}

/** The operator's margin in the Quick Contest: plus the margin of victory for a win, minus it for a loss. */
export function contestMargin(outcome: { outcome?: string; marginOfVictory?: number } | null): number {
  const margin = Math.abs(Number(outcome?.marginOfVictory) || 0);
  if (outcome?.outcome === "first") return margin;
  if (outcome?.outcome === "second") return -margin;
  return 0;
}

/** What a reading comes to on Interrogation: the margin times the machine's share, rounded toward zero. */
export function readingModifier(margin: number, share: number): number {
  return Math.trunc(margin * share) || 0;
}

const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));

/** Who a subject is, as a reading names them. */
const subjectKey = (actor: any): string => String(actor?.uuid ?? actor?.id ?? "");

/** The line a machine's reading puts on an Interrogation roll against this subject, or null. */
export function readingLine(machine: Machine, subject: any): { label: string; value: number } | null {
  const reading = readingOf(machine.item);
  if (!reading || !subject || reading.subject !== subjectKey(subject)) return null;
  const { table, detector, item } = machine;
  const unreadable = table.unreadable;
  if (unreadable && traitNames(subject).some((n) => unreadable.trait.test(n))) {
    // Labelled as any reading: the roll's card must not give the subject away.
    return { label: F(table.i18n, "ReadingLine", { name: item.name }), value: unreadable.value };
  }
  const value = readingModifier(reading.margin, detector.share);
  return { label: F(table.i18n, "ReadingLine", { name: item.name }), value };
}

/** The machines that might hold a reading of the subject: the questioner's own first, then everyone's. */
function machines(actor: any): Machine[] {
  const actors = [actor, ...[...((game as any).actors ?? [])].filter((a: any) => a !== actor)];
  const found: Machine[] = [];
  for (const owner of actors) {
    for (const item of owner?.items ?? []) {
      const machine = detectorOf(item);
      if (machine && readingOf(item)) found.push(machine);
    }
  }
  return found;
}

const targeted = (): any[] => [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);

/** A card for the GMs alone: the book has the GM make these rolls in secret (p. 216). */
async function tellGm(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    whisper: ChatMessage.implementation.getWhisperRecipients("GM").map((u: any) => u.id),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The test: a Quick Contest of the operator's skill against the subject's Will, kept as the machine's reading. */
async function runTest(api: GWorldApi, machine: Machine, operator: any): Promise<void> {
  const { item, table } = machine;
  const ns = table.i18n;
  const subjects = targeted();
  if (subjects.length !== 1) return void ui.notifications?.warn(L(ns, "PickSubject"));
  const subject = subjects[0];
  const skill = table.operator.skill;
  const base = api.actors.skillLevel(operator, skill) ?? (api.actors.attribute(operator, table.operator.attribute) ?? 10) + table.operator.modifier;
  const outcome: any = await api.roll.quickContest({
    label: F(ns, "TestLabel", { name: item.name, subject: subject.name }),
    first: { actor: operator, base, note: skill },
    second: { actor: subject, base: api.actors.attribute(subject, "Will") ?? 10, note: "Will" },
    tags: ["lieDetector"],
    // The GM makes these rolls in secret: neither side sees the card.
    secret: true,
  } as any);
  if (!outcome) return;
  const margin = contestMargin(outcome);
  await item.setFlag(MODULE_ID, READING_FLAG, { subject: subjectKey(subject), name: String(subject.name ?? ""), margin });
  const line = readingLine(machine, subject);
  await tellGm(operator, String(item.name), [F(ns, "Kept", { subject: subject.name, value: signed(line?.value ?? 0) })]);
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

function sectionContext(item: any): Record<string, unknown> {
  const machine = detectorOf(item)!;
  const ns = machine.table.i18n;
  const reading = readingOf(item);
  const lines = [...machine.table.lines(item, machine.detector)];
  if (reading) lines.push(F(ns, "Holds", { subject: reading.name, value: signed(readingModifier(reading.margin, machine.detector.share)) }));
  return { title: L(ns, "Title"), lines };
}

let readied = false;

/** Registers the engine's parts, once whichever books ask. */
export function readyLieDetectors(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  // The row buttons' labels are the first book's words: they are registered once.
  const ns = LIE_DETECTOR_TABLES.all[0]?.i18n ?? "GCC.HT";

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "lie-detector-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/lie-detector-item.hbs`,
    visible: (item) => detectorOf(item) !== null,
    context: (item) => sectionContext(item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "lie-detector-test",
    itemTypes: ["equipment"],
    label: L(ns, "Test"),
    icon: "fa-solid fa-heart-pulse",
    visible: (item) => detectorOf(item) !== null,
    run: (item, actor) => {
      const machine = detectorOf(item);
      return machine ? runTest(api, machine, actor) : undefined;
    },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "lie-detector-clear",
    itemTypes: ["equipment"],
    label: L(ns, "Clear"),
    icon: "fa-solid fa-eraser",
    visible: (item) => detectorOf(item) !== null && readingOf(item) !== null,
    run: async (item) => {
      if (item?.isOwner) await item.unsetFlag(MODULE_ID, READING_FLAG);
    },
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor || !Array.isArray(context.modifiers) || !/^interrogation\b/i.test(String(context.skill ?? ""))) return;
    const others = targeted();
    const subject = context.opponent ?? (others.length === 1 ? others[0] : null);
    if (!subject) return;
    for (const machine of machines(actor)) {
      const line = readingLine(machine, subject);
      if (line) {
        context.modifiers.push(line);
        return;
      }
    }
  });
}
