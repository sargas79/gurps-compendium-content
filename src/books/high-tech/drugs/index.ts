/**
 * High-Tech's hygiene supplies, drugs and poisons (pp. 221, 226-227),
 * registered with the system through the add-on API under two switches. The
 * rules are in `rules.ts`; the poisons are a table in the shared poison
 * engine (`src/shared/drugs/`), which Ultra-Tech's agents are another of.
 *
 *   - **Hygiene and drugs (hygieneAndDrugs):** soap, hand sanitizer, foot
 *     powder, insect repellent, salt tablets, quinine and antimalarial pills
 *     in daily use (worn) as lines on the Contagion, Infection, illness and
 *     heat rolls; a row action that gives a dose -- smelling salts' HT roll
 *     to come round, morphine as a painkiller (High Pain Threshold,
 *     Unfazeable and euphoria for the margin's hours), aspirin taking 1 or 2
 *     off pain's penalty on the rolls it reaches, antibiotics' +TL/2 against
 *     an illness (through `actors.treatIllness`) or a wound's infection,
 *     castor oil, activated charcoal, chelating agents and antitoxins as a
 *     treatment of a dose
 *     (`actors.treatPoison`), truth serum's FP and its -2 to Will and
 *     self-control, DMSO mixed into a blood or digestive poison to make it a
 *     contact agent, and a day's psychiatric drug as a Mitigator, its
 *     disadvantages out of play (`gworld.traitsInPlay`) -- a multi-dose
 *     bottle counting its doses before one comes off the count.
 *   - **High-Tech poisons (highTechPoisons):** curare, ricin, strychnine,
 *     botulin and irradiated thallium as poisons the system doses and cycles
 *     (in the sheet's dose dialog too), their damage "regardless of the roll"
 *     as the system's cycle and this module's HT roll each cycle for what a
 *     failure adds: curare's paralysis and choking, ricin's coughing and
 *     choking, strychnine's seizures and choking over 2d hours, botulin's
 *     4d and its paralysis roll one worse each cycle, lasting until healed as
 *     a crippling injury; and a row action that administers a dose to the
 *     targets.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { poisonDose, poisonKeyOf, protectedByDelivery, registerPoisonTable, type PoisonTable } from "../../../shared/drugs/index.js";
import {
  CASTOR_OIL_BONUS,
  CHARCOAL_BONUS,
  DRUG_KINDS,
  HT_POISONS,
  PAINKILLER,
  PSYCHIATRIC_DOSE_SECONDS,
  SUNSCREEN_DR,
  TRUTH_SERUM,
  analgesicRelief,
  antitoxinBonuses,
  dailyUseLines,
  dosesPerRecord,
  drugKindByName,
  halfTl,
  isDrug,
  isHygiene,
  isPoison,
  mitigatedList,
  mitigates,
  painkillerSeconds,
  poisonEffects,
  poisonRoll,
  strychnineCycles,
  truthSerumSeconds,
  withDmso,
  type DrugKind,
  type HtPoison,
  type InUse,
} from "./rules.js";

const NS = "GCC.HT.Drugs";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Ultra-Tech's medical drugs already keep a `drug` field, so this book's is its own. */
const FIELD = "htDrug";
/** The module's own conditions: morphine, aspirin, a wound's antibiotics, truth serum. */
const MORPHINE = "htMorphine";
const ANALGESIC = "htAnalgesic";
const WOUND_ANTIBIOTICS = "htWoundAntibiotics";
const TRUTH_SERUM_KEY = "htTruthSerum";
/** A day's psychiatric drug: `{ until, name, mitigates }`. */
const PSYCHIATRIC_FLAG = "htPsychiatric";
/** Per dose of a High-Tech poison: ricin's failed first roll, strychnine's rolled cycles. */
const POISON_FLAG = "htPoisonDoses";
/** The attributes a roll is tagged with that pain's penalty reaches (Campaigns p. 428). */
const PAIN_ROLLS = ["DX", "IQ", "Will", "Per"];

export interface DrugSwitches {
  hygiene: () => boolean;
  poisons: () => boolean;
}

/** What this module keeps on a supply, drug or poison. */
export interface DrugData {
  kind: DrugKind | "";
  /** Doses taken from the record in hand, for a bottle of several. */
  dosesUsed: number;
  /** A poison mixed with a dose of DMSO, now a contact agent (p. 227). */
  dmso: boolean;
  /** A psychiatric drug's disadvantages, comma-separated; blank for the book's list. */
  mitigates: string;
}

/** Registers the fields this module keeps on the supplies, drugs and poisons. */
export function initDrugs(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...DRUG_KINDS] }),
      dosesUsed: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      dmso: new f.BooleanField({ initial: false }),
      mitigates: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
    }),
  });
}

/** A record of this book's, or one of no book's (D1). */
const ours = (item: any) => {
  const book = bookOf(item);
  return book === null || book === "high-tech";
};

/** A supply's, drug's or poison's data, its kind read off the name where the field leaves it blank. */
export function drugData(item: any): DrugData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const own = (DRUG_KINDS as readonly string[]).includes(d.kind) ? (d.kind as DrugKind) : "";
  return {
    kind: item?.type === "equipment" && ours(item) ? own || drugKindByName(String(item?.name ?? "")) : "",
    dosesUsed: Math.max(0, Math.floor(Number(d.dosesUsed) || 0)),
    dmso: d.dmso === true,
    mitigates: String(d.mitigates ?? ""),
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 6;
const worldNow = (): number => Number((game as any).time?.worldTime) || 0;
const isCarried = (item: any): boolean => item?.type === "equipment" && item.system?.carried !== false;
const inUse = (item: any): boolean => isCarried(item) && item.system?.equipped === true;
const htOf = (api: GWorldApi, actor: any): number => Number(api.actors.attribute(actor, "HT")) || 10;
const switchFor = (on: DrugSwitches, kind: string): boolean => (isPoison(kind) ? on.poisons() : Boolean(kind) && on.hygiene());

/** The supplies and drugs a character has in daily use: carried and worn. */
function dailyUse(actor: any): InUse[] {
  const used: InUse[] = [];
  for (const item of actor?.items ?? []) {
    if (!inUse(item)) continue;
    const kind = drugData(item).kind;
    if (kind && (isHygiene(kind) || kind === "quinine" || kind === "antimalarial")) used.push({ kind, name: String(item.name ?? "") });
  }
  return used;
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
    ...(rolls.length ? { rolls } : {}),
  });
}

/** The targeted characters, or the one using the item where nobody is targeted. */
function patientsOf(actor: any): any[] {
  const targeted = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  return targeted.length ? targeted : actor ? [actor] : [];
}

/**
 * Takes one dose off a record: a bottle of several counts its doses and comes
 * off the count at the last. False where there is none left.
 */
async function useDose(item: any): Promise<boolean> {
  const quantity = Number(item?.system?.quantity);
  if (Number.isFinite(quantity) && quantity <= 0) return false;
  const per = dosesPerRecord(String(item?.name ?? ""), drugData(item).kind);
  const used = drugData(item).dosesUsed + 1;
  const path = `system.extensions.${MODULE_ID}.${FIELD}.dosesUsed`;
  if (used < per) {
    await item.update({ [path]: used });
    return true;
  }
  await item.update({ [path]: 0, ...(Number.isFinite(quantity) ? { "system.quantity": quantity - 1 } : {}) });
  return true;
}

async function choose(title: string, hint: string, fields: string): Promise<Record<string, string> | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld"><p class="ihint">${esc(hint)}</p><div class="ifields">${fields}</div></div>`,
    ok: {
      label: title,
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const out: Record<string, string> = {};
        form?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]").forEach((el) => { out[el.name] = el.value; });
        return out;
      },
    },
    rejectClose: false,
  }) as Promise<Record<string, string> | null>;
}

const select = (label: string, name: string, options: Array<{ value: string; label: string }>) =>
  `<label>${esc(label)} <select name="${name}">${options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select></label>`;

/** Whether a module condition of this book's is on an actor now. */
function hasCondition(api: GWorldApi, actor: any, key: string): boolean {
  return (api.actors.conditions(actor) ?? []).some((c: any) => c?.id === `${MODULE_ID}.${key}`);
}

/** The worst pain an actor is in (Campaigns p. 428), or null. */
function painGrade(actor: any): "moderate" | "severe" | "terrible" | null {
  const statuses = actor?.statuses;
  if (!statuses?.has) return null;
  if (statuses.has("terriblePain")) return "terrible";
  if (statuses.has("severePain")) return "severe";
  if (statuses.has("moderatePain")) return "moderate";
  return null;
}

/** A resistance roll of this module's, at HT and a modifier; one that can't be attempted fails by what it lacks. */
async function resist(api: GWorldApi, actor: any, label: string, modifiers: Array<{ label: string; value: number }>, tags: string[]): Promise<{ success: boolean; margin: number; criticalFailure: boolean }> {
  const base = htOf(api, actor);
  const result: any = await api.roll.success({ actor, base, label, skill: "HT", kind: "attribute", modifiers, tags: [...tags, "HT"] } as any);
  if (result) return { success: result.success === true, margin: Number(result.margin) || 0, criticalFailure: result.criticalFailure === true };
  const effective = base + modifiers.reduce((sum, m) => sum + m.value, 0);
  return { success: false, margin: Math.max(1, 3 - effective), criticalFailure: false };
}

// ── the poisons (p. 227) ──

/** This book's table in the shared poison engine. */
let POISON_TABLE: PoisonTable<HtPoison> = { book: "high-tech", poisons: HT_POISONS, labelPrefix: `${NS}.Poison`, available: () => false };

type DoseState = Record<string, { failedFirst?: boolean; cycles?: number }>;
const doseStates = (actor: any): DoseState => ({ ...((actor?.getFlag?.(MODULE_ID, POISON_FLAG) as DoseState | undefined) ?? {}) });

/** What one cycle of a High-Tech poison does beyond its damage (p. 227). */
async function poisonCycle(api: GWorldApi, context: any, poison: HtPoison): Promise<void> {
  const actor = context.actor;
  const dose = context.poison ?? {};
  const id = String(dose.id ?? "");
  const cycle = Math.max(1, Number(dose.cyclesSuffered) || 1);
  const name = String(actor.name ?? "");
  const title = String(dose.name ?? L(`Poison.${poison}`));
  const states = doseStates(actor);
  const state = { ...(states[id] ?? {}) };
  const lines: string[] = [];

  const modifier = poisonRoll(poison, cycle);
  let outcome: { success: boolean; margin: number; criticalFailure: boolean } | null = null;
  if (modifier !== null) {
    const modifiers = [{ label: F("PoisonRollLine", { name: title }), value: modifier }];
    // The antitoxin's or treatment's standing bonus, which the system's own roll would have taken (Campaigns p. 439).
    const treatment = Number(dose.treatment) || 0;
    if (treatment) modifiers.push({ label: L("TreatmentLine"), value: treatment });
    outcome = await resist(api, actor, F("PoisonRollLabel", { name: title }), modifiers, ["poison", "highTechPoison"]);
  }
  const failedFirst = state.failedFirst === true;
  if (cycle === 1 && outcome && !outcome.success) state.failedFirst = true;

  const effect = poisonEffects(poison, cycle, outcome, failedFirst);
  for (const condition of effect.conditions) {
    // Each lasts until the next cycle; botulin's paralysis until it heals.
    const conditionId = await api.actors.applyCondition(actor, { key: condition.key, ...(condition.lasting || !HT_POISONS[poison].intervalSeconds ? {} : { duration: { seconds: HT_POISONS[poison].intervalSeconds } }) } as any);
    if (poison === "botulin" && condition.lasting && conditionId) await crippleByBotulin(api, actor, conditionId, title);
  }
  if (effect.injury) {
    const roll = new Roll(effect.injury.replace(/d$/, "d6"));
    await roll.evaluate();
    await api.actors.applyInjury(actor, { amount: roll.total ?? 0, label: title });
    lines.push(F("Injury", { name, amount: roll.total ?? 0, dice: effect.injury }));
  }
  for (const note of effect.notes) lines.push(F(`Note.${note}`, { name, penalty: modifier ?? 0 }));

  // Strychnine lasts 2d hours: rolled when it first strikes (p. 227).
  if (poison === "strychnine" && cycle === 1) {
    const roll = new Roll("2d6");
    await roll.evaluate();
    state.cycles = strychnineCycles(roll.total ?? 7);
    lines.push(F("StrychnineHours", { hours: roll.total ?? 7 }));
  }
  const ends = effect.ends || (poison === "strychnine" && typeof state.cycles === "number" && cycle >= state.cycles);
  if (ends && !context.finished && id) {
    await api.actors.clearPoison(actor, id);
    if (poison === "strychnine") lines.push(F("StrychnineOver", { name }));
  }
  if (ends || context.finished) delete states[id];
  else states[id] = state;
  await actor.setFlag(MODULE_ID, POISON_FLAG, states);
  await say(actor, title, lines);
}

// ── botulin's paralysis, healing as a lasting crippling injury (p. 227) ──

/** The location botulin's paralysis cripples: the lungs and spine, which no attack aims at. */
const NERVES_KEY = "ht-lungs-spine";
/** The paralysis on an actor: the crippled part the system keeps, and the condition that holds them. */
const BOTULIN_FLAG = "htBotulinParalysis";

/**
 * Records botulin's paralysis as a lasting crippling injury of the lungs and
 * spine (p. 227; Campaigns p. 422) through the system's crippled parts
 * (API 1.114.0), which heals in 1d months less a physician's help. The
 * paralysis condition stays until that part has healed.
 */
async function crippleByBotulin(api: GWorldApi, actor: any, conditionId: string, title: string): Promise<void> {
  const part: any = await api.actors.cripple(actor, `${MODULE_ID}.${NERVES_KEY}`, { duration: "lasting", label: title });
  if (!part) return;
  await actor.setFlag(MODULE_ID, BOTULIN_FLAG, { part: String(part.id), condition: conditionId });
  await say(actor, title, [F("BotulinCrippled", { name: String(actor.name ?? ""), months: part.months })]);
}

/** Lifts botulin's paralysis once the crippled part has healed, or the GM has taken it off the sheet. */
export async function checkBotulinHealed(api: GWorldApi, actor: any): Promise<boolean> {
  const kept = actor?.getFlag?.(MODULE_ID, BOTULIN_FLAG) as { part?: string; condition?: string } | undefined;
  if (!kept?.part || !actor?.isOwner) return false;
  if (api.actors.crippled(actor).some((p: any) => String(p.id) === kept.part)) return false;
  if (kept.condition) await api.actors.removeCondition(actor, kept.condition);
  await actor.unsetFlag(MODULE_ID, BOTULIN_FLAG);
  await say(actor, L("Poison.botulin"), [F("BotulinHealed", { name: String(actor.name ?? "") })]);
  return true;
}

/** Administers a dose of a poison to each target: DMSO makes a blood or digestive one a contact agent (p. 227). */
async function administer(api: GWorldApi, item: any): Promise<void> {
  const data = drugData(item);
  if (!isPoison(data.kind)) return;
  const victims = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  if (!victims.length) return void ui.notifications?.warn(L("PickVictims"));
  const delivery = data.dmso ? withDmso(HT_POISONS[data.kind].delivery) : [...HT_POISONS[data.kind].delivery];
  const name = data.dmso ? F("WithDmso", { name: item.name }) : String(item.name ?? "");
  for (const victim of victims) {
    if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name: item.name }));
    const effects = api.actors.derived(victim)?.traitEffects ?? {};
    const why = protectedByDelivery(delivery, { sealed: effects.sealed === true, doesntBreathe: effects.doesntBreathe === true, filterLungs: effects.filterLungs === true, metabolicImmunity: false });
    if (why) {
      await say(victim, name, [F(`Protected.${why}`, { name: victim.name })]);
      continue;
    }
    await api.actors.dosePoison(victim, poisonDose(POISON_TABLE, data.kind, name, { delivery }));
  }
  if (data.dmso) await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.dmso`]: false });
}

// ── the drugs (pp. 226-227) ──

/** Picks one of a patient's doses (or illnesses), or a wound for antibiotics. */
async function pickDose(api: GWorldApi, item: any, patient: any, illness: boolean, extra: Array<{ value: string; label: string }> = []): Promise<Record<string, string> | null> {
  const doses = (api.actors.activePoisons(patient) ?? []).filter((d: any) => (d.illness === true) === illness);
  const options = [...doses.map((d: any) => ({ value: String(d.id), label: String(d.name) })), ...extra];
  if (!options.length) {
    ui.notifications?.warn(F(illness ? "NoIllness" : "NoPoison", { name: patient.name }));
    return null;
  }
  return choose(String(item.name ?? ""), F("TreatHint", { name: patient.name }), select(L("Dose"), "id", options));
}

async function giveDrug(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = drugData(item);
  const kind = data.kind;
  const [patient] = patientsOf(actor);
  if (!patient || !isDrug(kind)) return;
  const name = String(item.name ?? "");
  const who = String(patient.name ?? "");
  const tl = tlOf(item);

  switch (kind) {
    case "ammonia": {
      // Smelling salts: a HT roll to come round at once (p. 226).
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      const outcome = await resist(api, patient, F("AmmoniaLabel", { name: who }), [], ["ammoniaInhalant"]);
      if (outcome.success) await api.actors.undoKnockdown(patient, { posture: String(patient.system?.posture ?? "lying") });
      return say(patient, name, [F(outcome.success ? "AmmoniaWakes" : "AmmoniaFails", { name: who })]);
    }
    case "morphine": {
      // Painkillers (Campaigns p. 441): HT-4 to resist; failure brings the relief, for the margin's hours.
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      const outcome = await resist(api, patient, F("MorphineLabel", { name: who }), [{ label: L("PainkillerLine"), value: PAINKILLER.resistanceModifier }], ["drug", "painkiller"]);
      if (outcome.success) return say(patient, name, [F("MorphineResisted", { name: who })]);
      const seconds = painkillerSeconds(outcome.margin);
      await api.actors.applyCondition(patient, { module: MODULE_ID, key: MORPHINE, label: name, duration: { seconds } } as any);
      await api.actors.applyCondition(patient, { key: "euphoria", duration: { seconds } } as any);
      return say(patient, name, [F("MorphineWorks", { name: who, hours: seconds / 3600 })]);
    }
    case "analgesics": {
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      await api.actors.applyCondition(patient, { module: MODULE_ID, key: ANALGESIC, label: name } as any);
      return say(patient, name, [F("AnalgesicTaken", { name: who })]);
    }
    case "antibiotics":
    case "antibioticOintment": {
      // +TL/2 against a bacterial disease or a wound's infection (p. 226).
      const bonus = halfTl(tl);
      const wound = { value: "wound", label: L("Wound") };
      const answer = await pickDose(api, item, patient, true, [wound]);
      if (!answer) return;
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      if (answer.id === "wound") {
        await api.actors.applyCondition(patient, { module: MODULE_ID, key: WOUND_ANTIBIOTICS, label: name, effects: { modifiers: [{ label: name, value: bonus, rolls: ["infection"] }] }, duration: { seconds: 86400 } } as any);
        return say(patient, name, [F("WoundTreated", { name: who, bonus })]);
      }
      const given = await api.actors.treatIllness(patient, String(answer.id), { bonus, techLevel: tl, label: name });
      return say(patient, name, [F("IllnessTreated", { name: who, bonus: given })]);
    }
    case "castorOil":
    case "charcoal":
    case "chelating":
    case "antitoxin": {
      const answer = await pickDose(api, item, patient, false);
      if (!answer) return;
      let bonus = kind === "castorOil" ? CASTOR_OIL_BONUS : kind === "charcoal" ? CHARCOAL_BONUS : halfTl(tl);
      if (kind === "antitoxin") {
        const pick = await choose(name, L("AntitoxinHint"), select(L("Bonus"), "bonus", antitoxinBonuses(tl).map((b) => ({ value: String(b), label: `+${b}` }))));
        if (!pick) return;
        bonus = Number(pick.bonus) || 1;
      }
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      const dose = (api.actors.activePoisons(patient) ?? []).find((d: any) => d.id === answer.id);
      const poison = poisonKeyOf(POISON_TABLE, dose?.source);
      // Botulin's antitoxin stops it outright before paralysis sets in (p. 227).
      if (kind === "antitoxin" && poison === "botulin") {
        await api.actors.clearPoison(patient, String(answer.id));
        return say(patient, name, [F("BotulinAntitoxin", { name: who })]);
      }
      const given = await api.actors.treatPoison(patient, String(answer.id), { bonus, label: name });
      const lines = [F("PoisonTreated", { name: who, bonus: given })];
      if (kind === "antitoxin" && poison === "curare") lines.push(L("CurareAntitoxin"));
      if (kind === "chelating") lines.push(L("ChelatingRadiation"));
      return say(patient, name, lines);
    }
    case "truthSerum": {
      // 1d FP after 30 seconds, and HT-1 against -2 to Will and self-control for (20 - HT)/2 minutes (p. 227).
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      const roll = new Roll(TRUTH_SERUM.fatigue.replace(/d$/, "d6"));
      await roll.evaluate();
      // A drug's FP, not exertion: through the fatigue chart, unhalved (Campaigns p. 426).
      if ((roll.total ?? 0) > 0) await api.actors.spendFatigue(patient, roll.total ?? 0, { exertion: false, details: { rule: "truthSerum" } });
      const outcome = await resist(api, patient, F("TruthSerumLabel", { name: who }), [{ label: name, value: TRUTH_SERUM.resistanceModifier }], ["drug", "truthSerum"]);
      const lines = [F("TruthSerumFp", { name: who, fp: roll.total ?? 0 })];
      if (!outcome.success) {
        const seconds = truthSerumSeconds(htOf(api, patient));
        await api.actors.applyCondition(patient, {
          module: MODULE_ID, key: TRUTH_SERUM_KEY, label: name,
          effects: { modifiers: [{ label: L("TruthSerumLine"), value: TRUTH_SERUM.penalty, rolls: ["Will", "selfControl"] }] },
          duration: { seconds },
        } as any);
        lines.push(F("TruthSerumWorks", { name: who, penalty: TRUTH_SERUM.penalty, minutes: seconds / 60 }));
      } else lines.push(F("TruthSerumResisted", { name: who }));
      return say(patient, name, lines);
    }
    case "psychiatric": {
      if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name }));
      const list = mitigatedList(data.mitigates);
      await patient.setFlag(MODULE_ID, PSYCHIATRIC_FLAG, { until: worldNow() + PSYCHIATRIC_DOSE_SECONDS, name, mitigates: list });
      return say(patient, name, [F("PsychiatricTaken", { name: who, list: list.join(", ") })]);
    }
    case "dmso":
      return mixDmso(item, actor);
    default:
  }
}

/** Mixes a dose of DMSO into one of the character's blood or digestive poisons (p. 227). */
async function mixDmso(item: any, actor: any): Promise<void> {
  const poisons = [...(actor?.items ?? [])].filter((i: any) => {
    const kind = drugData(i).kind;
    return isPoison(kind) && !drugData(i).dmso && withDmso(HT_POISONS[kind].delivery).includes("contact") && !HT_POISONS[kind].delivery.includes("contact");
  });
  if (!poisons.length) return void ui.notifications?.warn(L("NoAgentForDmso"));
  const answer = await choose(String(item.name ?? ""), L("DmsoHint"), select(L("Agent"), "id", poisons.map((p: any) => ({ value: String(p.id), label: String(p.name) }))));
  const target = answer ? poisons.find((p: any) => p.id === answer.id) : null;
  if (!target) return;
  if (!(await useDose(item))) return void ui.notifications?.warn(F("NoneLeft", { name: item.name }));
  await target.update({ [`system.extensions.${MODULE_ID}.${FIELD}.dmso`]: true });
  await say(actor, String(item.name ?? ""), [F("DmsoMixed", { agent: target.name })]);
}

/** The psychiatric drug holding a character's disadvantages at bay today, or null. */
function psychiatricDose(actor: any): { name: string; mitigates: string[] } | null {
  const stored = actor?.getFlag?.(MODULE_ID, PSYCHIATRIC_FLAG);
  if (!stored || !(Number(stored.until) > worldNow())) return null;
  return { name: String(stored.name ?? ""), mitigates: Array.isArray(stored.mitigates) ? stored.mitigates.map(String) : [] };
}

// ── the sheets ──

function itemLines(item: any, on: DrugSwitches): string[] {
  const data = drugData(item);
  const kind = data.kind;
  if (!kind || !switchFor(on, kind)) return [];
  const tl = tlOf(item);
  const lines: string[] = [];
  const per = dosesPerRecord(String(item.name ?? ""), kind);
  if (isPoison(kind)) {
    const roll = poisonRoll(kind, kind === "botulin" ? 2 : 1);
    lines.push(L(`Effect.${kind}`));
    if (roll !== null) lines.push(F("PoisonRollItem", { roll: `HT${roll >= 0 ? "+" : ""}${roll}` }));
    if (data.dmso) lines.push(L("DmsoItem"));
  } else {
    lines.push(F(`Effect.${kind}`, { bonus: halfTl(tl), dr: SUNSCREEN_DR, castor: CASTOR_OIL_BONUS, charcoal: CHARCOAL_BONUS, most: Math.max(1, halfTl(tl)) }));
    if (isHygiene(kind) || kind === "quinine" || kind === "antimalarial") lines.push(L("DailyUse"));
  }
  if (per > 1) lines.push(F("Doses", { used: data.dosesUsed, per }));
  return lines;
}

function itemContext(item: any, on: DrugSwitches): Record<string, unknown> {
  const data = drugData(item);
  return {
    lines: itemLines(item, on),
    psychiatric: data.kind === "psychiatric" ? { mitigates: data.mitigates, placeholder: mitigatedList("").join(", ") } : null,
    editable: item.isOwner,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ht-drug]").forEach((input) => {
    input.addEventListener("change", async () => {
      await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${String(input.dataset.gccHtDrug)}`]: input.value });
    });
  });
}

export function readyDrugs(api: GWorldApi, on: DrugSwitches): void {
  // The poisons the system doses and cycles (API 1.57.0).
  POISON_TABLE = { ...POISON_TABLE, available: () => on.poisons() };
  registerPoisonTable(api, POISON_TABLE);

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-drugs-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-drugs-item.hbs`,
    visible: (item) => itemLines(item, on).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── the rolls the supplies and drugs change ──
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    if (!on.hygiene() || !actor || !Array.isArray(context.modifiers)) return;
    const tags: string[] = context.tags ?? [];
    const disease = String(context.disease?.name ?? context.poison?.name ?? "");
    for (const line of dailyUseLines(dailyUse(actor), { tags, disease })) context.modifiers.push({ label: line.name, value: line.value });
    // Aspirin: 1 or 2 back on the rolls pain penalizes -- DX-, IQ-, Will- and Per-based rolls that
    // aren't defenses or resistance, and self-control rolls (p. 226; Campaigns pp. 421, 428).
    const painRoll = tags.includes("selfControl") || (context.kind !== "defense" && !tags.includes("resist") && PAIN_ROLLS.some((t) => tags.includes(t)));
    if (painRoll && hasCondition(api, actor, ANALGESIC)) {
      const effects = api.actors.derived(actor)?.traitEffects ?? {};
      const threshold = effects.noShock ? "high" : (Number(effects.shockMultiplier) || 1) > 1 ? "low" : "normal";
      const relief = analgesicRelief(painGrade(actor), threshold);
      if (relief) context.modifiers.push({ label: L("AnalgesicLine"), value: relief });
    }
  });

  // Morphine's High Pain Threshold and Unfazeable (p. 226; Campaigns p. 441), which halves pain's penalty (p. 428).
  Hooks.on("gworld.traitEffects", (context: any) => {
    const actor = context?.actor;
    const effects = context?.effects;
    if (!on.hygiene() || !actor || !effects) return;
    const conditions = (api.actors.conditions(actor) ?? []) as any[];
    const has = (key: string) => conditions.find((c) => c?.id === `${MODULE_ID}.${key}`);
    const morphine = has(MORPHINE);
    if (morphine) {
      const label = String(morphine.label ?? L("Morphine"));
      if (!effects.noShock) {
        effects.noShock = true;
        effects.knockdown = (Number(effects.knockdown) || 0) + 3;
        context.sources?.push?.({ effect: "noShock", label });
      }
      if (!effects.unfazeable) {
        effects.unfazeable = true;
        context.sources?.push?.({ effect: "unfazeable", label });
      }
    }
  });

  // A psychiatric drug taken today is a Mitigator (p. 227; Characters p. 112): the disadvantages it
  // treats are out of play while the dose works, their points still counted (API 1.61.0).
  Hooks.on("gworld.traitsInPlay", (context: any) => {
    if (!on.hygiene() || !context?.actor || !Array.isArray(context.traits)) return;
    const dose = psychiatricDose(context.actor);
    if (!dose) return;
    for (const entry of context.traits) {
      if (!entry || entry.inPlay === false || !mitigates(dose.mitigates, String(entry.name ?? ""))) continue;
      entry.inPlay = false;
      entry.reason = F("PsychiatricMitigates", { item: dose.name });
    }
  });

  // What a cycle of one of this book's poisons does beyond its damage.
  Hooks.on(api.combat.hooks.poisonCycle, (context: any) => {
    const poison = poisonKeyOf(POISON_TABLE, context?.source);
    if (!poison || !on.poisons() || !context.actor?.isOwner) return;
    void poisonCycle(api, context, poison);
  });

  // Botulin's paralysis cripples the lungs and spine: a location of this
  // module's that the system can keep as crippled, and nobody can aim at.
  api.combat.registerHitLocation({ module: MODULE_ID, key: NERVES_KEY, label: L("LungsAndSpine"), parent: "torso", penalty: 0, available: () => false } as any);
  // It heals with world time, or when the GM takes it off the sheet: the GM's client lifts the paralysis.
  const isActiveGm = () => (game as any).user?.isGM === true && (game as any).users?.activeGM?.id === (game as any).user?.id;
  Hooks.on("updateWorldTime", () => {
    if (!on.poisons() || !isActiveGm()) return;
    // World actors, and the unlinked tokens' own on every scene.
    const unlinked = [...((game as any).scenes ?? [])].flatMap((scene: any) => [...(scene.tokens ?? [])].filter((t: any) => !t.actorLink && t.actor).map((t: any) => t.actor));
    for (const actor of [...((game as any).actors ?? []), ...unlinked]) if (actor.getFlag?.(MODULE_ID, BOTULIN_FLAG)) void checkBotulinHealed(api, actor);
  });
  Hooks.on("updateActor", (actor: any, changes: any) => {
    if (!on.poisons() || !isActiveGm() || changes?.flags?.gworld?.crippled === undefined) return;
    if (actor.getFlag?.(MODULE_ID, BOTULIN_FLAG)) void checkBotulinHealed(api, actor);
  });

  // ── row actions ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-drug-give",
    itemTypes: ["equipment"],
    label: L("GiveAction"),
    icon: "fa-solid fa-syringe",
    visible: (item) => {
      const kind = drugData(item).kind;
      return on.hygiene() && isDrug(kind) && kind !== "quinine" && kind !== "antimalarial";
    },
    run: (item, actor) => { void giveDrug(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-poison-dose",
    itemTypes: ["equipment"],
    label: L("DoseAction"),
    icon: "fa-solid fa-skull-crossbones",
    visible: (item) => on.poisons() && isPoison(drugData(item).kind),
    run: (item) => { void administer(api, item); },
  });
}
