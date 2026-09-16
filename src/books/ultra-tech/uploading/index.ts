/**
 * GURPS Ultra-Tech's uploading and downloading, registered with the system
 * through the add-on API (pp. 219-221).
 *
 * Two GM tools. **Upload a mind** runs a destructive or non-destructive
 * upload of the targeted character, alive or dead, and whispers the GM the
 * resolution it got (secretly, where the book has the GM roll) with the mind
 * emulation's Complexity and storage. **Download a mind** runs the download
 * into the targeted host, whispers its outcome and any hidden flaw, and can
 * apply a low- or very-low-res copy to the host: skill points cut, IQ and
 * the amnesia traits, and a 50% chance of Flashbacks.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  DELIBERATE_LOW_RES,
  DESTRUCTIVE_MODIFIER,
  EMULATION_TB,
  HIDDEN_FLAWS,
  LOST_MINUTES,
  QUICK_LOW_RES,
  SAME_SPECIES_OTHER_PERSON,
  copiedSkillPoints,
  copyEffects,
  deadBrainModifier,
  destructiveResult,
  downloadResult,
  emulationComplexity,
  nonDestructiveResult,
  type Resolution,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Upload.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Upload.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const picked = () => ({
  selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
  target: [...((game as any).user?.targets ?? [])][0]?.actor ?? null,
});
const gmIds = () => [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id);
const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));

async function whisper(title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
    whisper: gmIds(),
  });
}

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
const field = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

/** A skill level, falling back to IQ-6 for a Hard technical default. */
const skill = (api: GWorldApi, actor: any, name: string) => api.actors.skillLevel(actor, name) ?? (api.actors.attribute(actor, "IQ") ?? 10) - 6;

/** Rolls secretly for the GM: the book has the GM roll where a critical failure goes unnoticed. */
async function secretRoll(api: GWorldApi, options: Record<string, unknown>): Promise<any> {
  return api.roll.success({ ...options, rollMode: "blindroll" } as any);
}

async function upload(api: GWorldApi): Promise<void> {
  const { selected: operator, target: subject } = picked();
  if (!operator || !subject) return void ui.notifications?.warn(L("Pick"));
  const tl = Number(/\d+/.exec(String(operator.system?.tl ?? ""))?.[0]) || 10;
  const answer = await ask(L("UploadTitle"),
    row(L("Method"), `<select name="method"><option value="nonDestructive">${esc(L("nonDestructive"))}</option><option value="destructive">${esc(L("destructive"))}</option><option value="bushRobot">${esc(L("bushRobot"))}</option></select>`)
    + row(L("Tl"), `<input type="number" name="tl" value="${Math.max(10, tl)}" min="10" max="12" style="width:60px" />`)
    + row(L("QuickLowRes"), `<input type="checkbox" name="quick" />`)
    + row(L("Dead"), `<input type="checkbox" name="dead" />`)
    + row(L("HoursDead"), `<input type="number" name="hours" value="0" min="0" style="width:60px" />`)
    + row(L("Preserved"), `<input type="checkbox" name="preserved" />`)
    + row(L("Frozen"), `<input type="checkbox" name="frozen" />`),
    (form) => ({
      method: field(form, "method")?.value ?? "nonDestructive",
      tl: Number(field(form, "tl")?.value) || 10,
      quick: Boolean(field(form, "quick")?.checked),
      dead: Boolean(field(form, "dead")?.checked),
      hours: Number(field(form, "hours")?.value) || 0,
      preserved: Boolean(field(form, "preserved")?.checked),
      frozen: Boolean(field(form, "frozen")?.checked),
    }));
  if (!answer) return;
  const common: Array<{ label: string; value: number }> = [];
  if (answer.dead) common.push({ label: L("DeadModifier"), value: deadBrainModifier({ hoursDead: answer.hours, preserved: answer.preserved, frozen: answer.frozen }) });
  let resolution: Resolution;
  let hidden = false;
  if (answer.method === "nonDestructive") {
    const quick = answer.quick && answer.tl >= 11;
    const modifiers = [...common, ...(quick ? [{ label: L("QuickLowRes"), value: QUICK_LOW_RES.modifier }] : [])];
    const roll = await secretRoll(api, { actor: operator, base: skill(api, operator, "Electronics Operation (Medical)"), skill: "Electronics Operation (Medical)", label: F("ScanLabel", { name: subject.name, time: quick ? L("TenMinutes") : L("AnHour") }), modifiers });
    if (!roll) return;
    ({ resolution, hidden } = nonDestructiveResult({ tl: answer.tl, quickLowRes: quick, success: roll.success, criticalFailure: roll.criticalFailure }));
  } else {
    const medical = answer.method === "bushRobot" ? "Surgery" : "Physician";
    const rolls = [];
    for (const name of [medical, "Electronics Operation (Medical)"]) {
      const roll: any = await api.roll.success({ actor: operator, base: skill(api, operator, name), skill: name, label: F("DestructiveLabel", { name: subject.name, skill: name }), modifiers: [{ label: L("destructive"), value: DESTRUCTIVE_MODIFIER }, ...common] } as any);
      if (!roll) return;
      rolls.push(roll);
    }
    resolution = destructiveResult(rolls);
  }
  const iq = api.actors.attribute(subject, "IQ") ?? 10;
  const fixed = traitNames(subject).some((n) => /fixed iq|domestic animal|wild animal/i.test(n));
  const lines = [F(`Result.${resolution}`, { name: subject.name })];
  if (hidden) lines.push(L("Hidden"));
  if (resolution !== "failed") {
    lines.push(F("Emulation", { complexity: emulationComplexity(iq, fixed), tb: EMULATION_TB }));
    if (answer.dead) lines.push(F("LostMinutes", { dice: LOST_MINUTES.dice, times: LOST_MINUTES.times }));
  }
  if (answer.method !== "nonDestructive") lines.push(L("BrainDestroyed"));
  await whisper(L("UploadTitle"), lines);
}

/** Applies a low- or very-low-res copy's effects to a character (p. 220). */
async function applyCopy(actor: any, resolution: Resolution): Promise<string[]> {
  const effects = copyEffects(resolution);
  if (!effects || !actor?.isOwner) return [];
  const lines: string[] = [];
  const skills = [...(actor.items ?? [])].filter((i: any) => i.type === "skill" || i.type === "technique");
  await actor.updateEmbeddedDocuments("Item", skills.map((i: any) => ({ _id: i.id, "system.points": copiedSkillPoints(Number(i.system?.points) || 0, effects.skillPoints) })));
  lines.push(F("AppliedSkills", { fraction: effects.skillPoints === 0.5 ? "1/2" : "1/4" }));
  if (effects.iq) {
    await actor.update({ "system.attributes.IQ": (Number(actor.system?.attributes?.IQ) || 10) + effects.iq });
    lines.push(F("AppliedIq", { iq: effects.iq }));
  }
  const add = [...effects.add];
  if (effects.flashbacksChance && Math.random() < 0.5) add.push({ name: "Flashbacks (Mild)", points: -5 });
  if (add.length) {
    await actor.createEmbeddedDocuments("Item", add.map((t) => ({ name: t.name, type: "trait", system: { points: t.points } })));
    lines.push(F("AppliedTraits", { traits: add.map((t) => `${t.name} [${t.points}]`).join(", ") }));
  }
  const lost = [...(actor.items ?? [])].filter((i: any) => i.type === "trait" && effects.lose.some((name) => String(i.name).startsWith(name)));
  if (lost.length) {
    await actor.deleteEmbeddedDocuments("Item", lost.map((i: any) => i.id));
    lines.push(F("AppliedLost", { traits: lost.map((i: any) => i.name).join(", ") }));
  }
  return lines;
}

async function download(api: GWorldApi): Promise<void> {
  const { selected: operator, target: host } = picked();
  if (!operator || !host) return void ui.notifications?.warn(L("Pick"));
  const answer = await ask(L("DownloadTitle"),
    row(L("Recipient"), `<select name="recipient"><option value="blank">${esc(L("blank"))}</option><option value="otherPerson">${esc(L("otherPerson"))}</option><option value="otherSpecies">${esc(L("otherSpecies"))}</option></select>`)
    + row(L("Physiology"), `<input type="number" name="physiology" value="0" step="1" style="width:60px" />`)
    + row(L("DeliberateLowRes"), `<input type="checkbox" name="lowres" />`)
    + row(L("ApplyCopy"), `<input type="checkbox" name="apply" checked />`),
    (form) => ({
      recipient: field(form, "recipient")?.value ?? "blank",
      physiology: Number(field(form, "physiology")?.value) || 0,
      lowRes: Boolean(field(form, "lowres")?.checked),
      apply: Boolean(field(form, "apply")?.checked),
    }));
  if (!answer) return;
  const modifiers: Array<{ label: string; value: number }> = [];
  if (answer.recipient === "otherPerson") modifiers.push({ label: L("otherPerson"), value: SAME_SPECIES_OTHER_PERSON });
  if (answer.recipient === "otherSpecies" && answer.physiology) modifiers.push({ label: L("Physiology"), value: answer.physiology });
  if (answer.lowRes) modifiers.push({ label: L("DeliberateLowRes"), value: DELIBERATE_LOW_RES.modifier });
  const roll = await secretRoll(api, { actor: operator, base: skill(api, operator, "Electronics Operation (Medical)"), skill: "Electronics Operation (Medical)", label: F("DownloadLabel", { name: host.name }), modifiers });
  if (!roll) return;
  const result = downloadResult(roll);
  let resolution = result.resolution;
  if (result.outcome === "replaced" && answer.lowRes) resolution = "lowRes";
  const lines = [F(`Download.${result.outcome}`, { name: host.name })];
  if (result.outcome === "hiddenFlaw") lines.push(F("Flaw", { flaw: L(`Flaws.${HIDDEN_FLAWS[Math.floor(Math.random() * HIDDEN_FLAWS.length)]}`) }));
  if (resolution === "lowRes" || resolution === "veryLowRes") {
    lines.push(F(`Result.${resolution}`, { name: host.name }));
    if (answer.apply) lines.push(...await applyCopy(host, resolution));
  }
  if (result.outcome !== "brainDestroyed") lines.push(L("MindTransfer"));
  await whisper(L("DownloadTitle"), lines);
}

export function readyUploading(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-upload", label: L("UploadTitle"), icon: "fa-solid fa-cloud-arrow-up", visible: on, open: () => upload(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-download", label: L("DownloadTitle"), icon: "fa-solid fa-cloud-arrow-down", visible: on, open: () => download(api) });
}
