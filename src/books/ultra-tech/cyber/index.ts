/**
 * GURPS Ultra-Tech's cybernetics, registered with the system through the
 * add-on API (pp. 207-219).
 *
 *   - **init:** an implant's condition and sizing on equipment: second-hand or
 *     salvaged, chip slots and points, cognitive points, a mount's weapon
 *     weight, an uplifted animal's IQ, a neurotherapy or psych implant's points.
 *   - **ready:**
 *     - the implants priced by their sizing and condition;
 *     - a sheet section with each implant's procedure at its TL, and the caps;
 *     - a GM tool for the Surgical Procedures Table: install, remove or
 *       salvage an implant with the Surgery (or Mechanic) roll, time, injury on
 *       failure, recovery, fee and the critical outcomes;
 *     - an implant's trait out of play until its recovery ends, and electrical
 *       implants out of play after a surge, through `gworld.traitsInPlay`;
 *     - detecting implants, and the psych implant's permanence roll.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { beamFamily } from "../beams/rules.js";
import { loadsOf } from "../warheads/index.js";
import {
  COGNITIVE_PRICE_PER_POINT,
  DETECT_SKILLS,
  DISADVANTAGE_PRICE,
  IMPLANTS,
  restoredWhileRecovering,
  MOUNT_PRICE_PER_LB,
  PROCEDURE_TABLE,
  UPLIFT_PRICE_PER_IQ,
  chipSlotCaps,
  chipSlotPrice,
  cognitiveCap,
  easier,
  implantOf,
  operationOutcome,
  operationTerms,
  procedureAt,
  psychPermanenceModifier,
  recoveryText,
  skillChipPricePerPoint,
  usedPercent,
  type Operation,
  BOMB_CALIBRES,
  CYBER_TRAP,
  IMPLANT_SEED,
  bombImplantCost,
  seedGrows,
  seedHours,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Cyber.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Cyber.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "implant";
/** Actor flag: implants recovering, and electrical implants knocked out, until a world time. */
const RECOVERY_FLAG = "utImplants";

/** Registers the implant fields. */
export function initCybernetics(): void {
  const f = foundry.data.fields as any;
  const count = () => new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      condition: new f.StringField({ required: true, nullable: false, blank: false, initial: "new", choices: ["new", "secondHand", "salvaged"] }),
      usedPercent: count(),
      slots: count(),
      pointsPerChip: count(),
      points: count(),
      weaponWeight: count(),
      racialIq: count(),
      disadvantagePoints: count(),
      seed: new f.BooleanField({ initial: false }),
      bombCalibre: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...BOMB_CALIBRES] }),
    }),
  });
}

function fieldOf(item: any): Record<string, any> {
  return item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
}

const tlOf = (value: unknown) => Number(/\d+/.exec(String(value ?? ""))?.[0]) || 0;
/** The TL an operation is done at: the implant's own, the patient's campaign's if higher. */
const operationTl = (item: any, actor: any) => Math.max(tlOf(item?.system?.tl), tlOf(actor?.system?.tl), 9);

interface Recovery { implants?: Record<string, number>; surgeUntil?: number }
const recoveryOf = (actor: any): Recovery => actor?.getFlag?.(MODULE_ID, RECOVERY_FLAG) ?? {};

/** Whether a trait is an implant vulnerable to surges: its modifiers name Electrical. */
function isElectricalImplant(item: any): boolean {
  if (item?.type !== "trait" || !implantOf(String(item.name))) return false;
  return (item.system?.modifiers ?? []).some((m: any) => /electrical/i.test(String(m?.name ?? "")));
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

// ── prices ───────────────────────────────────────────────────────────────────

/** An implant's price from its sizing, before its condition; null where the record's price stands. */
function sizedCost(item: any): number | null {
  const name = String(item?.name ?? "");
  const d = fieldOf(item);
  if (/^chip slots$/i.test(name) && (d.slots || d.pointsPerChip)) return chipSlotPrice(d.slots, d.pointsPerChip);
  if (/^cognitive enhancement$/i.test(name) && d.points) return COGNITIVE_PRICE_PER_POINT * d.points;
  if (/weapon (arm )?mount$/i.test(name) && d.weaponWeight) return MOUNT_PRICE_PER_LB * d.weaponWeight;
  if (/^neural uplift$/i.test(name) && d.racialIq) return UPLIFT_PRICE_PER_IQ * d.racialIq;
  if (/^neurotherapy implant$/i.test(name) && d.disadvantagePoints) return DISADVANTAGE_PRICE.neurotherapy * d.disadvantagePoints;
  if (/^bomb implant$/i.test(name) && d.bombCalibre) return bombImplantCost(d.bombCalibre, tlOf(item?.system?.tl) || 9);
  if (/^psych implant$/i.test(name) && d.disadvantagePoints) return DISADVANTAGE_PRICE.psych * d.disadvantagePoints;
  return null;
}

// ── the sheet ────────────────────────────────────────────────────────────────

function itemContext(item: any): Record<string, unknown> {
  const name = String(item?.name ?? "");
  const entry = implantOf(name);
  const d = fieldOf(item);
  const tl = operationTl(item, item?.actor);
  const lines: string[] = [];
  if (entry) {
    let procedure = procedureAt(entry, tl);
    if (/^neural uplift$/i.test(name) && d.racialIq > 0 && d.racialIq <= 3) procedure = easier(procedure);
    const row = PROCEDURE_TABLE[procedure];
    const recovery = recoveryText(row.recoverySeconds);
    lines.push(F("ProcedureLine", {
      count: entry.count ?? 1, procedure: L(`Procedure.${procedure}`), tl,
      kind: entry.brain ? L("Brain") : entry.eye ? L("Eye") : "",
      modifier: signed(entry.brain || entry.eye ? row.brainModifier : row.modifier),
      minutes: row.minutes, injury: row.injury, recovery: recovery.value, unit: L(`Unit.${recovery.unit}`), fee: row.fee,
    }));
    if (entry.brain) lines.push(L("BrainRisk"));
  }
  if (/^chip slots$/i.test(name) || /^skip slots$/i.test(name)) {
    const caps = chipSlotCaps(tl);
    lines.push(F("ChipCaps", { slots: caps.slots, points: caps.pointsPerChip, perPoint: skillChipPricePerPoint(tl), tl }));
  }
  if (/^cognitive enhancement$/i.test(name)) lines.push(F("CognitiveCap", { points: cognitiveCap(tl), tl, price: COGNITIVE_PRICE_PER_POINT }));
  if (/^psych implant$/i.test(name)) lines.push(L("PsychLine"));
  if (entry && d.seed === true) lines.push(F(seedGrows(entry) ? "SeedLine" : "SeedCantGrow", { hours: seedHours(Number(item?.system?.cost) || 0) }));
  if (/^bomb implant$/i.test(name)) lines.push(F(d.bombCalibre && bombImplantCost(d.bombCalibre, tlOf(item?.system?.tl) || 9) === null ? "BombUnpriced" : "BombLine", { calibre: d.bombCalibre || "-" }));
  const equipment = item?.type === "equipment" && Boolean(entry);
  return {
    lines,
    equipment,
    fields: d,
    conditions: ["new", "secondHand", "salvaged"].map((value) => ({ value, label: L(`Condition.${value}`), selected: (d.condition ?? "new") === value })),
    used: equipment && d.condition && d.condition !== "new",
    chips: equipment && /^chip slots$/i.test(name),
    cognitive: equipment && /^cognitive enhancement$/i.test(name),
    mount: equipment && /weapon (arm )?mount$/i.test(name),
    uplift: equipment && /^neural uplift$/i.test(name),
    disadvantage: equipment && /^(neurotherapy|psych) implant$/i.test(name),
    bomb: equipment && /^bomb implant$/i.test(name),
    calibres: ["", ...BOMB_CALIBRES].map((value) => ({ value, label: value ? `${value}mm` : L("BombNone"), selected: (d.bombCalibre ?? "") === value })),
  };
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-implant]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtImplant);
      if (input instanceof HTMLInputElement && input.type === "number") return void item.update({ [`${path}.${field}`]: Math.max(0, Number(input.value) || 0) });
      if (input instanceof HTMLInputElement && input.type === "checkbox") return void item.update({ [`${path}.${field}`]: input.checked });
      const patch: Record<string, unknown> = { [`${path}.${field}`]: input.value };
      if (field === "condition") patch[`${path}.usedPercent`] = 0;
      await item.update(patch);
    });
  });
  // Second-hand parts are (1d+1) × 10% of the price, salvaged ones (1d+1) × 5% (p. 208).
  element.querySelectorAll<HTMLButtonElement>("[data-gcc-ut-implant-roll]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = fieldOf(item).condition;
      if (kind !== "secondHand" && kind !== "salvaged") return;
      const roll = new Roll("1d6");
      await roll.evaluate();
      const percent = usedPercent(kind, roll.total);
      await item.update({ [`${path}.usedPercent`]: percent });
      await say(item.actor, String(item.name), [F("UsedRolled", { percent, condition: L(`Condition.${kind}`) })], [roll]);
    });
  });
}

// ── the surgery tool ─────────────────────────────────────────────────────────

interface SurgeryAnswer { implant: string; operation: Operation; tl: number; robotic: boolean; skill: number; mechanic: boolean; count: number; trapped: boolean; looking: boolean }

async function askSurgery(api: GWorldApi, surgeon: any, patient: any): Promise<SurgeryAnswer | null> {
  const names = Object.keys(IMPLANTS).sort();
  const owned = [...(patient?.items ?? [])].map((i: any) => String(i.name)).find((n) => IMPLANTS[n]);
  const surgery = surgeon ? api.actors.skillLevel(surgeon, "Surgery") : null;
  const tl = Math.max(9, tlOf(patient?.system?.tl), tlOf(surgeon?.system?.tl));
  const row = (label: string, control: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin:4px 0"><span>${esc(label)}</span>${control}</label>`;
  const content = `<div class="gworld">`
    + row(L("Tool.Patient"), `<span>${esc(patient?.name ?? L("Tool.NoPatient"))}</span>`)
    + row(L("Tool.Surgeon"), `<span>${esc(surgeon?.name ?? L("Tool.NoSurgeon"))}</span>`)
    + row(L("Tool.Implant"), `<select name="implant">${names.map((n) => `<option value="${esc(n)}" ${n === owned ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`)
    + row(L("Tool.Operation"), `<select name="operation">${["install", "remove", "removeScrap", "salvage"].map((o) => `<option value="${o}">${esc(L(`Operation.${o}`))}</option>`).join("")}</select>`)
    + row(L("Tool.Tl"), `<input type="number" name="tl" value="${tl}" min="9" max="12" step="1" style="width:70px">`)
    + row(L("Tool.Skill"), `<input type="number" name="skill" value="${surgery ?? 10}" step="1" style="width:70px">`)
    + row(L("Tool.Mechanic"), `<input type="checkbox" name="mechanic">`)
    + row(L("Tool.Robotic"), `<input type="checkbox" name="robotic" checked>`)
    + row(L("Tool.Trapped"), `<input type="checkbox" name="trapped">`)
    + row(L("Tool.Looking"), `<input type="checkbox" name="looking">`)
    + `</div>`;
  const answer = await (foundry.applications.api as any).DialogV2.prompt({
    window: { title: L("Tool.Title") },
    content,
    ok: {
      label: L("Tool.Roll"),
      callback: (_e: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application")!;
        const value = (n: string) => form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`);
        const implant = String(value("implant")?.value ?? "");
        return {
          implant,
          operation: String(value("operation")?.value ?? "install") as Operation,
          tl: Number(value("tl")?.value) || tl,
          skill: Number(value("skill")?.value) || 10,
          robotic: (value("robotic") as HTMLInputElement)?.checked !== false,
          mechanic: (value("mechanic") as HTMLInputElement)?.checked === true,
          count: IMPLANTS[implant]?.count ?? 1,
          trapped: (value("trapped") as HTMLInputElement)?.checked === true,
          looking: (value("looking") as HTMLInputElement)?.checked === true,
        };
      },
    },
    rejectClose: false,
  });
  return answer ?? null;
}

async function performSurgery(api: GWorldApi): Promise<void> {
  const surgeon = (canvas as any)?.tokens?.controlled?.[0]?.actor ?? null;
  const patient = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  const answer = await askSurgery(api, surgeon, patient);
  if (!answer) return;
  const entry = implantOf(answer.implant);
  if (!entry) return;
  const procedure = procedureAt(entry, answer.tl);
  const terms = operationTerms(procedure, { operation: answer.operation, brainOrEye: Boolean(entry.brain || entry.eye), robotic: answer.robotic });
  const lines: string[] = [];
  const rolls: any[] = [];
  let recoverySeconds = 0;
  let installed = 0;
  const skill = answer.mechanic && terms.mechanicAllowed ? "Mechanic (Robotics)" : "Surgery";
  // A cyber-trap on removal: Traps-4 to notice it (no penalty looking), a Traps roll to disarm it first (p. 208).
  if (answer.trapped && answer.operation !== "install") {
    const traps = (surgeon ?? patient) ? api.actors.skillLevel(surgeon ?? patient, "Traps") ?? (api.actors.attribute(surgeon ?? patient, "IQ") ?? 10) - 5 : 5;
    const notice: any = await api.roll.success({ actor: surgeon ?? patient, base: traps, skill: "Traps", label: L("Tool.TrapNotice"), modifiers: [{ label: L(answer.looking ? "Tool.Looking" : "Tool.TrapUnlooked"), value: answer.looking ? CYBER_TRAP.looking : CYBER_TRAP.notice }] } as any);
    if (!notice) return;
    if (!notice.success) return void say(patient ?? surgeon, L("Tool.Title"), [L("Tool.TrapGoesOff")]);
    const disarm: any = await api.roll.success({ actor: surgeon ?? patient, base: traps, skill: "Traps", label: L("Tool.TrapDisarm") } as any);
    if (!disarm) return;
    if (!disarm.success) return void say(patient ?? surgeon, L("Tool.Title"), [L("Tool.TrapGoesOff")]);
  }
  for (let i = 0; i < answer.count; i++) {
    const result: any = await api.roll.success({
      actor: surgeon ?? patient,
      base: answer.skill,
      skill,
      label: F("Tool.RollLabel", { operation: L(`Operation.${answer.operation}`), implant: answer.implant, n: i + 1, count: answer.count }),
      modifiers: terms.modifier ? [{ label: F("Tool.ProcedureModifier", { procedure: L(`Procedure.${procedure}`) }), value: terms.modifier }] : [],
    } as any);
    if (!result) return;
    const outcome = operationOutcome(terms, { success: result.success, critical: result.critical === true || result.criticalSuccess === true || result.criticalFailure === true }, { procedure, brain: Boolean(entry.brain) });
    if (outcome.installed) {
      installed += 1;
      recoverySeconds = Math.max(recoverySeconds, outcome.recoverySeconds);
      if ((result.criticalSuccess || (result.critical && result.success)) && !lines.includes(L("Tool.CriticalSuccess"))) lines.push(L("Tool.CriticalSuccess"));
      continue;
    }
    if (outcome.injury && patient && answer.operation !== "salvage") {
      const formula = outcome.injury.includes("/2") ? `ceil(${outcome.injury.replace("/2", "")}/2)` : outcome.injury.replace("d", "d6");
      const injuryRoll = new Roll(/^\d+$/.test(outcome.injury) ? outcome.injury : formula);
      await injuryRoll.evaluate();
      rolls.push(injuryRoll);
      await api.actors.applyInjury(patient, { amount: Math.max(1, injuryRoll.total), label: F("Tool.InjuryLabel", { implant: answer.implant }) });
      lines.push(F("Tool.Injury", { name: patient.name, injury: injuryRoll.total }));
    }
    if (answer.operation === "salvage") lines.push(L(outcome.defective ? "Tool.SalvageDestroyed" : "Tool.SalvageDamaged"));
    else if (outcome.defective) lines.push(L("Tool.Defective"));
    if (outcome.brainInjury) lines.push(L("Tool.BrainInjury"));
  }
  const minutes = Math.round(terms.minutes * answer.count);
  lines.unshift(F("Tool.Summary", { procedure: L(`Procedure.${procedure}`), minutes, fee: terms.fee * answer.count, done: installed, count: answer.count, operation: L(`Operation.${answer.operation}`) }));
  if (installed && answer.operation === "install" && patient) {
    const recovery = recoveryText(recoverySeconds);
    lines.push(F("Tool.Recovery", { name: patient.name, value: recovery.value, unit: L(`Unit.${recovery.unit}`) }));
    if (recoverySeconds > 0 && patient.isOwner) {
      const now = Number(game.time?.worldTime) || 0;
      const stored = recoveryOf(patient);
      await patient.setFlag(MODULE_ID, RECOVERY_FLAG, { ...stored, implants: { ...(stored.implants ?? {}), [answer.implant]: now + recoverySeconds } });
    }
  }
  await say(patient ?? surgeon, L("Tool.Title"), lines, rolls);
}

/** Finding a patient's implants with a scanner: Electronics Operation (Medical) or Diagnosis (p. 208). */
async function detectImplants(api: GWorldApi): Promise<void> {
  const examiner = (canvas as any)?.tokens?.controlled?.[0]?.actor ?? null;
  const patient = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!examiner || !patient) return void ui.notifications?.warn(L("Tool.PickBoth"));
  const levels = DETECT_SKILLS.map((skill) => ({ skill, level: api.actors.skillLevel(examiner, skill) })).filter((s) => s.level !== null) as Array<{ skill: string; level: number }>;
  const best = levels.sort((a, b) => b.level - a.level)[0] ?? { skill: DETECT_SKILLS[1], level: (api.actors.attribute(examiner, "IQ") ?? 10) - 6 };
  const result: any = await api.roll.success({ actor: examiner, base: best.level, skill: best.skill, label: F("Tool.DetectLabel", { name: patient.name }), modifiers: [] } as any);
  if (!result) return;
  const implants = [...(patient.items ?? [])].filter((i: any) => i.type === "trait" && implantOf(String(i.name))).map((i: any) => String(i.name));
  await say(examiner, L("Tool.DetectTitle"), [result.success ? (implants.length ? F("Tool.Found", { list: implants.join(", ") }) : L("Tool.NoneFound")) : L("Tool.DetectFailed")]);
}

// ── ready ────────────────────────────────────────────────────────────────────

export function readyCybernetics(api: GWorldApi, on: () => boolean): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-implant",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on() || !implantOf(String(item?.name ?? ""))) return null;
      const d = fieldOf(item);
      const sized = sizedCost(item);
      const percent = d.condition && d.condition !== "new" && d.usedPercent > 0 ? d.usedPercent / 100 : 1;
      const seed = d.seed === true ? IMPLANT_SEED.costFactor : 1;
      if (sized === null && percent === 1 && seed === 1) return null;
      return { cost: Math.round((sized ?? price.cost) * percent * seed * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-implant-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-implant-item.hbs`,
    visible: (item) => on() && (item?.type === "equipment" || item?.type === "trait") && Boolean(implantOf(String(item.name ?? ""))),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-surgery", label: L("Tool.Title"), icon: "fa-solid fa-user-doctor", visible: on, open: () => void performSurgery(api) } as any);
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-detect-implants", label: L("Tool.DetectTitle"), icon: "fa-solid fa-x-ray", visible: on, open: () => void detectImplants(api) } as any);

  // A psych implant's disadvantage may stay once it's out: Will+4 at three months, -1 each doubling (p. 217).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-psych-removed",
    itemTypes: ["equipment", "trait"],
    label: L("PsychTitle"),
    icon: "fa-solid fa-brain",
    visible: (item) => on() && /^(psych|neurotherapy) implant$/i.test(String(item?.name ?? "")),
    run: async (item, actor) => {
      if (!actor?.isOwner) return;
      const answer = await (foundry.applications.api as any).DialogV2.prompt({
        window: { title: L("PsychTitle") },
        content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(L("PsychMonths"))}</span><input type="number" name="months" value="3" min="0" step="1" style="width:80px"></label></div>`,
        ok: { label: L("PsychTitle"), callback: (_e: Event, b: HTMLElement) => Number(b.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="months"]')?.value ?? 0) },
        rejectClose: false,
      });
      if (answer === null || answer === undefined) return;
      const modifier = psychPermanenceModifier(Number(answer));
      if (modifier === null) return void say(actor, String(item.name), [L("PsychTooSoon")]);
      const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "Will") ?? 10, kind: "attribute", tags: ["Will"], label: F("PsychLabel", { item: item.name }), modifiers: [{ label: F("PsychModifier", { months: answer }), value: modifier }] } as any);
      if (!result) return;
      await say(actor, String(item.name), [L(result.success ? "PsychFreed" : "PsychStays")]);
    },
  });

  // An implant isn't working until it has healed in, nor after a surge (pp. 207, B134).
  Hooks.on("gworld.traitsInPlay", (context: any) => {
    if (!on() || !context?.actor || !Array.isArray(context.traits)) return;
    const stored = recoveryOf(context.actor);
    const now = Number((game as any).time?.worldTime) || 0;
    for (const entry of context.traits) {
      const until = stored.implants?.[entry.name];
      if (until && now < until) {
        entry.inPlay = false;
        entry.reason = L("Recovering");
        // What the implant made up for is missing until it works (since GWorld API 1.63.0).
        const restores = restoredWhileRecovering(String(entry.name ?? ""));
        if (restores.length) entry.restores = restores;
      } else if (stored.surgeUntil && now < stored.surgeUntil && isElectricalImplant(entry.item)) {
        entry.inPlay = false;
        entry.reason = L("SurgeDown");
      }
    }
  });

  // When a recovery or a surge ends, the character's traits are read again.
  Hooks.on("updateWorldTime", (worldTime: number, delta: number) => {
    if (!on()) return;
    const before = worldTime - (Number(delta) || 0);
    const actors = new Set<any>([...((game as any).actors ?? []), ...((canvas as any)?.tokens?.placeables ?? []).map((t: any) => t.actor).filter(Boolean)]);
    for (const actor of actors) {
      const stored = recoveryOf(actor);
      const ends = [...Object.values(stored.implants ?? {}), stored.surgeUntil ?? 0];
      if (!ends.some((until) => until > before && until <= worldTime)) continue;
      actor.reset?.();
      if (actor.sheet?.rendered) actor.sheet.render(false);
    }
  });

  // An EMP warhead or a microwave beam that affects a character knocks out their electrical implants (p. B134).
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    if (!on() || !context?.actor?.isOwner) return;
    const item = context.item;
    const index = Math.max(0, Math.floor(Number(context.mode?.index) || 0));
    const emp = item && (loadsOf(item).some((l) => l.mode === index && l.kind === "emp") || beamFamily(String(item.name ?? "")) === "microwave");
    if (!emp) return;
    const implants = [...(context.actor.items ?? [])].filter(isElectricalImplant);
    if (!implants.length) return;
    const minutes = Math.max(1, Math.floor(Number(context.margin) || 0));
    const now = Number((game as any).time?.worldTime) || 0;
    void context.actor.setFlag(MODULE_ID, RECOVERY_FLAG, { ...recoveryOf(context.actor), surgeUntil: now + minutes * 60 });
    void say(context.actor, context.label ?? "", [F("SurgeLine", { name: context.actor.name, list: implants.map((i: any) => i.name).join(", "), minutes })]);
  });
}
