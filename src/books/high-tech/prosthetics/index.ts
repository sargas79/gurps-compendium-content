/**
 * High-Tech's prosthetics and elective surgery (pp. 225-226), registered with
 * the system through the add-on API under the prosthetics switch. The rules
 * are in `rules.ts`.
 *
 *   - **Prosthetics as Mitigators:** while eyeglasses, contact lenses, a
 *     hearing aid or an arm or leg prosthetic is worn, the disadvantage it
 *     answers is out of play through `gworld.traitsInPlay`, the sheet saying
 *     which item mitigates it, and the lesser disadvantage it leaves (a basic
 *     arm's Ham-Fisted 2) is put back in its place. A leg prosthetic also
 *     gives back reduced Basic Move through `gworld.traitEffects`. A hearing
 *     aid whose battery has run down mitigates nothing. The points stay as
 *     bought: whether a PC pays back the difference is the GM's (p. 225).
 *   - **Elective surgery:** a GM tool that runs the operation through
 *     `actors.operate` (the Basic Set's surgery roll) and reads its outcome:
 *     a success is recorded on the patient, and laser eye surgery on every
 *     eye takes Bad Sight out of play as cured. Where one trait becomes
 *     another (Fat to Overweight, Beautiful to Very Beautiful), the new build
 *     or Appearance is written through `actors.changeTrait`; where a trait
 *     would be added or taken away, or the book leaves the choice (Attractive
 *     to Beautiful or Handsome), the card tells the GM what to set.
 *
 * Eyeglasses knocked off or broken by a blow to the head are the protective
 * oddments' (p. 225): glasses knocked off are no longer worn, and broken ones
 * carry that switch's broken flag; neither mitigates anything. With both
 * switches on, the oddments' own correction of Bad Sight finds it already out
 * of play and adds nothing.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { powerData } from "../../../shared/power/data.js";
import { enduranceLeft } from "../../../shared/power/index.js";
import { BROKEN_FLAG } from "../oddments/index.js";
import {
  BUILDS,
  PROCEDURES,
  appearanceChange,
  appearanceOf,
  basicMoveRegained,
  buildOf,
  isBadSight,
  mitigations,
  planOperation,
  prostheticFor,
  type Operation,
  type Procedure,
} from "./rules.js";

const NS = "GCC.HT.Prosthetics";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Actor flag: the elective operations done, and the eyes laser surgery has cured. */
export const SURGERY_FLAG = "htElectiveSurgery";
const CARD = "ht-elective-surgery";

export interface SurgeryRecord {
  operations: Array<{ procedure: Procedure; from: string; to: string; cost: number; recoveryDays: number; time: number }>;
  eyesCured: number;
}

export function surgeryRecord(actor: any): SurgeryRecord {
  const flag = actor?.getFlag?.(MODULE_ID, SURGERY_FLAG) ?? actor?.flags?.[MODULE_ID]?.[SURGERY_FLAG] ?? {};
  return {
    operations: Array.isArray(flag.operations) ? flag.operations : [],
    eyesCured: Math.max(0, Math.floor(Number(flag.eyesCured) || 0)),
  };
}

const traitItems = (actor: any): any[] => [...(actor?.items ?? [])].filter((i: any) => i?.type === "trait");
const traitNames = (actor: any): string[] => traitItems(actor).map((i: any) => String(i.name ?? ""));

/** Whether a device has run out of the power its cells give. */
function outOfPower(item: any): boolean {
  const left = enduranceLeft(powerData(item));
  return Boolean(left && left !== "unlimited" && left.left <= 0);
}

/** Eyeglasses a head hit broke (p. 225), as the protective oddments mark them. */
const broken = (item: any): boolean => Boolean(item?.flags?.[MODULE_ID]?.[BROKEN_FLAG]);

/** The prosthetics the character is wearing and that work: equipped, whole, and with power where they need it. */
export function wornProsthetics(actor: any): string[] {
  return [...(actor?.items ?? [])]
    .filter((i: any) => i?.type === "equipment" && i.system?.equipped === true && prostheticFor(String(i.name ?? "")) && !broken(i) && !outOfPower(i))
    .map((i: any) => String(i.name ?? ""));
}

/** How many eyes the patient has: one with One Eye (Characters p. 147). */
const eyesOf = (actor: any): number => (traitNames(actor).some((n) => /^one eye\b/i.test(n.trim())) ? 1 : 2);

/** Whether laser eye surgery has cured the patient's Bad Sight: every eye done (p. 225). */
export function sightCured(actor: any): boolean {
  return surgeryRecord(actor).eyesCured >= eyesOf(actor);
}

/**
 * Takes the mitigated disadvantages out of play, and Bad Sight laser surgery
 * cured. `entries` are the hook's `{ name, inPlay }` rows. `only` limits it
 * to the prosthetics of that name, and leaves surgery out: the supplement
 * Electricity and Electronics' audio switch mitigates with hearing aids alone
 * (HT:EE p. 32). A trait already out of play is left as it is, so running
 * both is running one.
 */
export function applyMitigations(actor: any, entries: any[], only?: RegExp): void {
  const open = entries.filter((e) => e && e.inPlay !== false);
  const worn = wornProsthetics(actor).filter((name) => !only || only.test(name.trim()));
  for (const m of mitigations(open.map((e) => String(e.name ?? "")), worn)) {
    const entry = open[m.trait];
    entry.inPlay = false;
    entry.reason = F("Mitigated", { item: m.by });
    if (m.leaves.length) entry.restores = m.leaves.map((l) => ({ ...l }));
  }
  if (only || !sightCured(actor)) return;
  for (const entry of open) {
    if (entry.inPlay === false || !isBadSight(String(entry.name ?? ""))) continue;
    entry.inPlay = false;
    entry.reason = L("Cured");
  }
}

/** The patients the GM means: the selected tokens' actors, else every character. */
function candidates(): any[] {
  const selected = ((globalThis as any).canvas?.tokens?.controlled ?? []).map((t: any) => t.actor).filter(Boolean);
  const all = [...((game as any).actors ?? [])].filter((a: any) => a.type === "character");
  return [...new Set([...selected, ...all])];
}

const select = (name: string, options: Array<[string, string]>, selected = "") =>
  `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

/** Plans the operation the dialog asked for, on this patient. */
export function operationFor(patient: any, choice: { procedure: Procedure; techLevel: number; lighter: boolean; eyes: number; hands: number }): Operation {
  const names = traitNames(patient);
  const build = buildOf(names);
  // Lighter is a step toward Skinny, the end of the list; heavier toward Very Fat.
  const toward = BUILDS[BUILDS.indexOf(build) + (choice.lighter ? 1 : -1)];
  return planOperation({
    procedure: choice.procedure,
    techLevel: choice.techLevel,
    build,
    toward: toward ?? build,
    appearance: appearanceOf(traitItems(patient).map((i: any) => ({ name: String(i.name ?? ""), levels: Number(i.system?.levels ?? 0) }))),
    badSight: names.some(isBadSight),
    eyes: Math.min(choice.eyes, eyesOf(patient)),
    hands: choice.hands,
  });
}

async function electiveSurgery(api: GWorldApi): Promise<void> {
  if (!game.user?.isGM) return;
  const people = candidates();
  if (!people.length) return void ui.notifications?.warn(L("NoPatient"));
  const actors = people.map((a: any) => [String(a.id), String(a.name ?? "")] as [string, string]);
  const procedures: Array<[string, string]> = (Object.keys(PROCEDURES) as Procedure[]).map((p) => [p, L(`Procedure.${p}`)]);
  const chosen: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld"><p class="ihint">${esc(L("Hint"))}</p>
      <div class="ifields">
        <label>${esc(L("Patient"))} ${select("patient", actors, actors[0]?.[0])}</label>
        <label>${esc(L("Surgeon"))} ${select("surgeon", actors, actors[0]?.[0])}</label>
        <label>${esc(L("ProcedureLabel"))} ${select("procedure", procedures, "appearance")}</label>
        <label>${esc(L("TechLevel"))} <input type="number" name="tl" value="" placeholder="${esc(L("SurgeonTl"))}"></label>
        <label>${esc(L("Direction"))} ${select("direction", [["lighter", L("Lighter")], ["heavier", L("Heavier")]], "lighter")}</label>
        <label>${esc(L("Eyes"))} <input type="number" name="eyes" value="2" min="1" max="2"></label>
        <label>${esc(L("Hands"))} <input type="number" name="hands" value="2" min="1" max="2"></label>
        <label>${esc(L("Modifier"))} <input type="number" name="modifier" value="0"></label>
      </div></div>`,
    ok: {
      label: L("Operate"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
        return {
          patient: value("patient"), surgeon: value("surgeon"), procedure: value("procedure") as Procedure,
          tl: value("tl"), lighter: value("direction") !== "heavier",
          eyes: Number(value("eyes")) || 2, hands: Number(value("hands")) || 2, modifier: Number(value("modifier")) || 0,
        };
      },
    },
    rejectClose: false,
  });
  if (!chosen) return;
  const patient = (game as any).actors?.get(chosen.patient);
  const surgeon = (game as any).actors?.get(chosen.surgeon);
  if (!patient || !surgeon) return;
  const techLevel = String(chosen.tl).trim() !== "" ? Math.floor(Number(chosen.tl) || 0) : Math.floor(Number(surgeon.system?.tl) || 0);
  await operateElectively(api, { patient, surgeon, techLevel, procedure: chosen.procedure, lighter: chosen.lighter, eyes: chosen.eyes, hands: chosen.hands, modifier: chosen.modifier });
}

/** Rolls the operation through the system and posts the card that records it. */
export async function operateElectively(api: GWorldApi, options: {
  patient: any; surgeon: any; techLevel: number; procedure: Procedure; lighter?: boolean; eyes?: number; hands?: number; modifier?: number;
}): Promise<Operation | null> {
  const { patient, surgeon } = options;
  const plan = operationFor(patient, {
    procedure: options.procedure, techLevel: options.techLevel, lighter: options.lighter !== false, eyes: options.eyes ?? 2, hands: options.hands ?? 2,
  });
  if (plan.refusal) {
    ui.notifications?.warn(F(`Refusal.${plan.refusal}`, { tl: plan.tl, name: String(patient.name ?? "") }));
    return null;
  }
  const label = F("OperationLabel", { procedure: L(`Procedure.${plan.procedure}`), surgeon: String(surgeon.name ?? "") });
  // The system's roll resolves to its outcome (API 1.112.0); null where the patient can't be changed.
  const outcome: any = await api.actors.operate({ surgeon, patient, techLevel: options.techLevel, label, modifier: Number(options.modifier) || 0 });
  if (!outcome) return null;
  const eyes = plan.procedure === "vision" ? Math.min(Math.max(1, Math.floor(Number(options.eyes) || 2)), eyesOf(patient)) : 0;
  const lines = outcome.success ? await recordOperation(patient, plan, eyes, api) : [L(`FailedNote.${plan.procedure}`)];
  await api.chat.post(`${MODULE_ID}.${CARD}`, {
    title: L("Title"),
    text: describe(patient, plan, eyes),
    lines,
    buttons: [],
    patient: String(patient.id),
    plan,
    eyes,
  }, { actor: patient, whisper: [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id) } as any);
  return plan;
}

/**
 * Writes the new build or Appearance through the system's `changeTrait`
 * (GM only), where one of the character's traits becomes another. False
 * where the GM must still set it: a trait to add or take away, or a choice
 * the book leaves open.
 */
async function writeTrait(api: GWorldApi, patient: any, plan: Operation): Promise<boolean> {
  if (plan.procedure === "build") {
    if (plan.from === "Average" || plan.to === "Average") return false;
    return (await api.actors.changeTrait(patient, { name: plan.from, replaceWith: plan.to })) !== null;
  }
  if (plan.procedure !== "appearance") return false;
  const traits = [...(patient?.items ?? [])].filter((i: any) => i?.type === "trait").map((i: any) => ({ id: String(i.id ?? ""), name: String(i.name ?? ""), levels: Number(i.system?.levels) || 0 }));
  const change = appearanceChange(traits);
  if (!change) return false;
  return (await api.actors.changeTrait(patient, change)) !== null;
}

/** The card's first line: who, what, the price and the recovery. */
function describe(patient: any, plan: Operation, eyes: number): string {
  return F(`Plan.${plan.procedure}`, {
    name: String(patient.name ?? ""), from: plan.from, to: plan.to, cost: plan.cost.toLocaleString("en-US"), days: plan.recoveryDays, eyes,
  });
}

/** Records a successful operation on the patient, returning what the card says next. */
export async function recordOperation(patient: any, plan: Operation, eyes: number, api?: GWorldApi): Promise<string[]> {
  const record = surgeryRecord(patient);
  const time = Number((game as any).time?.worldTime) || 0;
  const operations = [...record.operations, { procedure: plan.procedure, from: plan.from, to: plan.to, cost: plan.cost, recoveryDays: plan.recoveryDays, time }];
  const eyesCured = plan.procedure === "vision" ? record.eyesCured + eyes : record.eyesCured;
  await patient.setFlag(MODULE_ID, SURGERY_FLAG, { operations, eyesCured });
  const name = String(patient.name ?? "");
  const written = api ? await writeTrait(api, patient, plan) : false;
  if (plan.procedure === "build") return [F(written ? "BuildChanged" : "SetBuild", { name, to: plan.to })];
  if (plan.procedure === "appearance") return [F(written ? "AppearanceChanged" : "SetAppearance", { name, to: plan.to })];
  if (plan.procedure === "vision") return [eyesCured >= eyesOf(patient) ? F("SightCured", { name }) : F("OneEyeDone", { name })];
  return [F("FingerprintsGone", { name })];
}

export function readyProsthetics(api: GWorldApi, on: () => boolean): void {
  Hooks.on("gworld.traitsInPlay", (context: any) => {
    if (!on() || !context?.actor || !Array.isArray(context.traits)) return;
    applyMitigations(context.actor, context.traits);
  });

  // A leg prosthetic's Mitigator on reduced Basic Move (p. 226): the points it covers come back while it is worn.
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!on() || !context?.effects?.secondary) return;
    const actor = context.actor;
    const reduced = -Math.min(0, Math.floor(Number(actor?.system?.purchased?.basicMove) || 0));
    const worn = wornProsthetics(actor);
    const regained = basicMoveRegained(reduced, traitNames(actor), worn);
    if (!regained) return;
    context.effects.secondary.basicMove = (Number(context.effects.secondary.basicMove) || 0) + regained;
    const leg = worn.find((n) => /leg prosthetic/i.test(n)) ?? "";
    context.sources?.push?.({ effect: "secondary.basicMove", label: F("MoveRegained", { item: leg }), value: regained });
  });

  const finish = async ({ message, data }: any, worked: boolean) => {
    const patient = (game as any).actors?.get(String(data?.patient ?? ""));
    if (!patient || !data?.plan) return;
    // Cards posted before the operation's outcome was read still ask the GM.
    const lines = worked ? await recordOperation(patient, data.plan as Operation, Number(data.eyes) || 0, api) : [L(`FailedNote.${data.plan.procedure}`)];
    await api.chat.update(message, { ...data, lines, buttons: [] });
  };
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ht-elective-surgery.hbs`,
    actions: {
      worked: { permission: "gm", run: (context: any) => finish(context, true) },
      failed: { permission: "gm", run: (context: any) => finish(context, false) },
    },
  } as any);

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-elective-surgery",
    label: L("Title"),
    icon: "fa-solid fa-user-doctor",
    visible: on,
    open: () => electiveSurgery(api),
  } as any);
}
