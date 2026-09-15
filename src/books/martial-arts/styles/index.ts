/**
 * Styles and training at the table (GURPS Martial Arts pp. 49, 141-148,
 * 232-233).
 *
 * A style is a template whose entries hold its Style Familiarity, its required
 * skills (the ungrouped ones), techniques, cinematic abilities and perks. A
 * character is taken to practise every style whose Style Familiarity they
 * have. A section on the Skills tab says whether they know each, and how many
 * Style Perks they may have, with warnings and never a block. Training
 * equipment is a character's data, added to Teaching rolls; The Training
 * Sequence is a GM tool.
 */

import { addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  TRAINING_EQUIPMENT,
  TRAINING_TIMES,
  equipmentModifier,
  familiarityOffset,
  masterQualifies,
  outlineOf,
  perkAllowance,
  styleCost,
  stylesKnown,
  studentQualifies,
  trainingAllowance,
  type StyleOutline,
  type TemplateEntry,
  type TrainingEquipment,
  type TrainingTime,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Styles.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Styles.${key}`, data);

const ACTOR_TYPES = ["character", "npc"] as const;
const key = (name: unknown) => String(name ?? "").trim().toLowerCase();

/** The styles the world's templates describe, by their Style Familiarity's name. */
const catalog = new Map<string, StyleOutline>();
let loading: Promise<void> | null = null;

async function loadCatalog(): Promise<void> {
  catalog.clear();
  const add = (name: string, entries: unknown) => {
    if (!Array.isArray(entries)) return;
    const outline = outlineOf(name, entries as TemplateEntry[]);
    if (outline && !catalog.has(key(outline.familiarity))) catalog.set(key(outline.familiarity), outline);
  };
  for (const item of (game as any).items ?? []) if (item.type === "template") add(item.name, item.system?.entries);
  for (const pack of (game as any).packs ?? []) {
    if (pack.documentName !== "Item") continue;
    try {
      const index = await pack.getIndex({ fields: ["system.entries"] });
      for (const entry of index) if (entry.type === "template") add(entry.name, entry.system?.entries);
    } catch {
      // A pack that can't be indexed costs its own styles, nothing else.
    }
  }
}

/** Adds the training equipment field before the world's actors are read. */
export function initStyles(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Actor", ACTOR_TYPES, { trainingEquipment: new f.StringField({ required: true, blank: true, initial: "" }) });
}

const itemsNamed = (actor: any, name: string) => [...(actor?.items ?? [])].filter((item: any) => key(item.name) === key(name));
const pointsIn = (actor: any) => (name: string) => itemsNamed(actor, name).reduce((sum: number, item: any) => sum + (Number(item.system?.points) || 0), 0);
const hasTrait = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && pattern.test(String(item.name ?? "")));
const spark = (actor: any) => hasTrait(actor, /^(trained by a master|weapon master)\b/i);

/** The styles an actor practises: every Style Familiarity they have that a template describes. */
function stylesOf(actor: any): StyleOutline[] {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item.type === "trait" && /^style familiarity\b/i.test(String(item.name ?? "")))
    .map((item: any) => catalog.get(key(item.name)))
    .filter((style): style is StyleOutline => Boolean(style));
}

/** The Style Familiarity perks an actor has, whether or not a template describes them. */
const familiaritiesOf = (actor: any) => new Set([...(actor?.items ?? [])].filter((item: any) => item.type === "trait" && /^style familiarity\b/i.test(String(item.name ?? ""))).map((item: any) => key(item.name)));

/** Points in combat skills and the techniques bought for them. */
function combatPoints(api: GWorldApi, actor: any): number {
  const combat = (name: string) => (["melee", "unarmed", "shield", "ranged"] as const).some((family) => api.rules.inSkillFamily(name, family));
  return [...(actor?.items ?? [])].reduce((sum: number, item: any) => {
    const name = String(item.name ?? "");
    const counts = item.type === "skill" ? combat(name) : item.type === "technique" ? combat(/\(([^)]+)\)\s*$/.exec(name)?.[1] ?? "") : false;
    return counts ? sum + (Number(item.system?.points) || 0) : sum;
  }, 0);
}

function sectionContext(api: GWorldApi, actor: any, training: boolean, styles: boolean) {
  const points = pointsIn(actor);
  const practised = styles ? stylesOf(actor) : [];
  const allowance = perkAllowance(combatPoints(api, actor), 0);
  let perksTaken = 0;
  let perksAllowed = allowance.general;
  const rows = practised.map((style) => {
    const alone = stylesKnown([style], points);
    const stylePoints = [...style.required, ...style.techniques].reduce((sum, name) => sum + points(name), 0);
    const own = perkAllowance(0, stylePoints).style;
    const taken = style.perks.filter((perk) => itemsNamed(actor, perk).length > 0).length;
    perksTaken += taken;
    perksAllowed += own;
    const cinematic = style.cinematic.filter((name) => itemsNamed(actor, name).length > 0);
    const warnings = [
      ...(taken > own + allowance.general ? [F("TooManyPerks", { taken, allowed: own + allowance.general })] : []),
      ...(cinematic.length > 0 && !spark(actor) ? [F("CinematicWithoutSpark", { skills: cinematic.join(", ") })] : []),
    ];
    return { name: style.name, cost: styleCost(style), spent: alone.spent, known: alone.known, missing: alone.missing.join(", "), perks: taken, perksAllowed: own, warnings };
  });
  const together = practised.length > 1 ? stylesKnown(practised, points) : null;
  const equipment = actor?.system?.extensions?.[MODULE_ID]?.trainingEquipment ?? "";
  return {
    styles,
    training,
    rows,
    together: together ? { cost: together.cost, spent: together.spent, known: together.known } : null,
    general: allowance.general,
    overPerks: perksTaken > perksAllowed,
    perksTaken,
    perksAllowed,
    equipment: ["", ...TRAINING_EQUIPMENT].map((value) => ({ value, label: value ? L(`Equipment.${value}`) : L("Equipment.none"), selected: value === equipment })),
    field: `system.extensions.${MODULE_ID}.trainingEquipment`,
  };
}

async function trainingSequence(api: GWorldApi): Promise<void> {
  if (loading) await loading;
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const characters = [...((game as any).actors ?? [])].filter((actor: any) => actor.type === "character");
  const options = (list: Array<{ value: string; label: string }>) => list.map((o) => `<option value="${escape(o.value)}">${escape(o.label)}</option>`).join("");
  const styles = [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name));
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Training.Title") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label>${escape(L("Training.Master"))} <select name="master">${options(characters.map((a: any) => ({ value: a.id, label: a.name })))}</select></label>
      <label>${escape(L("Training.Style"))} <select name="style">${options(styles.map((s) => ({ value: key(s.familiarity), label: s.name })))}</select></label>
      <label>${escape(L("Training.Time"))} <select name="time">${options(Object.keys(TRAINING_TIMES).map((t) => ({ value: t, label: L(`Training.Times.${t}`) })))}</select></label>
      <fieldset><legend>${escape(L("Training.Students"))}</legend>
        ${characters.map((a: any) => `<label class="icheck"><input type="checkbox" name="student" value="${escape(a.id)}"> ${escape(a.name)}</label>`).join("")}
      </fieldset>
    </div>`,
    ok: {
      label: L("Training.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        const value = (name: string) => root?.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? "";
        return { master: value("master"), style: value("style"), time: value("time"), students: [...(root?.querySelectorAll<HTMLInputElement>('input[name="student"]:checked') ?? [])].map((box) => box.value) };
      },
    },
  });
  if (!answer || typeof answer !== "object") return;
  const { master: masterId, style: styleKey, time, students: studentIds } = answer as { master: string; style: string; time: TrainingTime; students: string[] };
  const master = (game as any).actors?.get(masterId);
  const style = catalog.get(styleKey);
  if (!master || !style || !(time in TRAINING_TIMES)) return;

  const level = (actor: any, name: string) => api.actors.skillLevel(actor, name);
  const check = masterQualifies({ taughtLevels: style.required.map((name) => level(master, name)), teaching: level(master, "Teaching"), spark: spark(master) });
  const lines: Array<{ name: string; text: string }> = [];
  if (!check.ok) {
    ui.notifications?.warn(F("Training.MasterFails", { master: String(master.name), reasons: check.reasons.map((r) => L(`Training.Reasons.${r}`)).join("; ") }));
    return;
  }
  // Training equipment's bonus is added to every Teaching roll by the success
  // roll hook below, and it never has a penalty to leave out.
  const modifiers = TRAINING_TIMES[time] ? [{ label: L(`Training.Times.${time}`), value: TRAINING_TIMES[time] }] : [];
  const outcome: any = await api.roll.success({ actor: master, base: level(master, "Teaching") ?? 0, label: F("Training.Label", { style: style.name }), skill: "Teaching", modifiers } as any);
  if (!outcome) return;
  for (const id of studentIds) {
    const student = (game as any).actors?.get(id);
    if (!student) continue;
    const attributes = (["ST", "DX", "IQ", "HT"] as const).map((a) => api.actors.attribute(student, a) ?? 10);
    if (!studentQualifies({ attributes, styleLevels: style.required.map((name) => level(student, name)) })) {
      lines.push({ name: String(student.name), text: L("Training.StudentFails") });
      continue;
    }
    if (outcome.criticalFailure) {
      lines.push({ name: String(student.name), text: L("Training.Critical") });
      continue;
    }
    if (!outcome.success) {
      lines.push({ name: String(student.name), text: L("Training.Nothing") });
      continue;
    }
    const earned = trainingAllowance(outcome.margin, {
      eidetic: hasTrait(student, /^eidetic memory\b/i),
      photographic: hasTrait(student, /^photographic memory\b/i),
      lazy: hasTrait(student, /^laziness\b/i),
      critical: Boolean(outcome.criticalSuccess),
    });
    lines.push({ name: String(student.name), text: F(earned.free ? "Training.AllowanceFree" : "Training.Allowance", { points: earned.points, free: earned.free }) });
  }
  await api.chat.post(`${MODULE_ID}.ma-training`, { title: F("Training.Label", { style: style.name }), lines }, { actor: master });
}

/** Registers the styles section, the familiarity reduction, the equipment's bonus and the Training Sequence. */
export function readyStyles(api: GWorldApi, styles: () => boolean, training: () => boolean): void {
  loading = loadCatalog();

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-styles",
    sheet: "character",
    tab: "skills",
    position: "end",
    template: `modules/${MODULE_ID}/templates/ma-styles.hbs`,
    visible: () => styles() || training(),
    context: (actor) => sectionContext(api, actor, training(), styles()),
  });

  // Familiarity with every style a foe knows takes 1 off his feints and
  // Deceptive Attacks (p. 49).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!styles() || !context?.attacker || Number(context.deception) >= 0) return;
    const theirs = familiaritiesOf(context.attacker);
    const mine = familiaritiesOf(context.defender);
    const knowsAll = theirs.size > 0 && [...theirs].every((name) => mine.has(name));
    const offset = familiarityOffset(Number(context.deception), knowsAll);
    if (offset) context.modifiers.push({ label: L("Familiarity"), value: offset });
  });

  // Training equipment on teaching (pp. 232-233).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!training() || !Array.isArray(context?.tags) || !context.tags.includes("teaching")) return;
    const level = (context.actor?.system?.extensions?.[MODULE_ID]?.trainingEquipment ?? "") as TrainingEquipment | "";
    const value = equipmentModifier(level, Number(context.actor?.system?.tl) || 3);
    if (value) context.modifiers.push({ label: L("Training.Equipment"), value });
  });

  api.chat.registerChatCard({ module: MODULE_ID, key: "ma-training", template: `modules/${MODULE_ID}/templates/ma-training.hbs` });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-training-sequence",
    label: L("Training.Title"),
    icon: "fa-solid fa-user-graduate",
    visible: training,
    open: () => trainingSequence(api),
  });
}
