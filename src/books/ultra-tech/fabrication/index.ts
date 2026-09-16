/**
 * GURPS Ultra-Tech's tools, fabrication, gravity control and psi amplifiers,
 * registered with the system through the add-on API (pp. 74-94).
 *
 *   - **Fabrication:** a GM tool for how long and what it costs to make an
 *     item on a production line, fabricator, robofac, nanofac or replicator,
 *     with its blueprint's Complexity and instructor kit; row actions to apply
 *     repair nanopaste, stress a rope and set off an antimatter trap; a GM
 *     tool for slipspray, super adhesives and tractor beams; item lines for
 *     rope, construction foam, tractor beams and the fabricators.
 *   - **Gravity control:** a GM tool for crossing a gravity gradient; item
 *     lines for gravity plates, screens, mats and grav hammers.
 *   - **Psi amplifiers:** row actions to attune and to amplify, the boost on
 *     the power's rolls, and psychotronic feedback on a critical failure.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import {
  ADHESIVE,
  ANTIMATTER_REF,
  FACILITIES,
  FOAM_POUNDS_PER_GALLON,
  MICROGRAM_POUNDS,
  REPLICATORS,
  REPLICATOR_TEMPLATE,
  SLIPSPRAY_VEHICLE,
  antimatterTrapCapacity,
  blueprintComplexity,
  explosionMultiplier,
  fabricatorGuideline,
  facilityHours,
  facilitySkill,
  foamDr,
  gravityPlates,
  gravityShiftModifier,
  instructorKit,
  productionLine,
  psiAmpBoost,
  psiAmpByName,
  psiAmpCriticalFailure,
  psychotronicFeedback,
  repairPaste,
  ropeLoad,
  ropeStressModifier,
  slipsprayModifier,
  tractorBeam,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Fab.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Fab.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const PSI_FIELD = "psiAmp";
const AMPLIFYING = "utPsiAmp";

export interface FabricationSwitches {
  fabrication: () => boolean;
  gravity: () => boolean;
  psi: () => boolean;
}

export function initFabrication(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [PSI_FIELD]: new f.SchemaField({
      attunedTo: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      burntOut: new f.BooleanField({ initial: false }),
    }),
  });
}

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const tlOf = (value: unknown): number | null => {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
};
const itemTl = (item: any) => tlOf(item?.system?.tl) ?? 9;
const round = (value: number) => Math.round(value * 100) / 100;
const picked = () => ({
  selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
  targets: [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean),
});

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
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
const select = (name: string, options: Array<[string, string]>) => `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
const num = (name: string, value: number, step = "any") => `<input type="number" name="${name}" value="${value}" step="${step}" style="width:90px" />`;
const val = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

// ── fabrication ──

async function fabricationTool(): Promise<void> {
  const kinds = ["productionLine", "roboticLine", "fabricatorParts", "fabricatorScrap", ...Object.keys(FACILITIES), ...Object.keys(REPLICATORS)];
  const answer = await ask(L("Tool.Title"),
    row(L("Tool.Facility"), select("kind", kinds.map((k) => [k, L(`Facility.${k}`)])))
    + row(L("Tool.Cost"), num("cost", 1000)) + row(L("Tool.Weight"), num("weight", 1)) + row(L("Tool.Tl"), num("tl", 10, "1")) + row(L("Tool.Units"), num("units", 1, "1")),
    (form) => ({ kind: val(form, "kind")?.value ?? "minifac", cost: Number(val(form, "cost")?.value) || 0, weight: Number(val(form, "weight")?.value) || 0, tl: Number(val(form, "tl")?.value) || 10, units: Number(val(form, "units")?.value) || 1 }));
  if (!answer) return;
  const item = { cost: answer.cost, weight: answer.weight };
  const lines: string[] = [];
  if (answer.kind === "productionLine" || answer.kind === "roboticLine") {
    const line = productionLine({ ...item, robotic: answer.kind === "roboticLine" });
    lines.push(F("Tool.Line", { hours: round(line.hours), perItem: round(line.perItem), lineCost: round(line.lineCost), lineWeight: round(line.lineWeight) }));
  } else if (answer.kind === "fabricatorParts" || answer.kind === "fabricatorScrap") {
    const guide = fabricatorGuideline(item, answer.tl, answer.kind === "fabricatorScrap");
    lines.push(guide.hours === null ? L("Tool.NoMicrotech") : F("Tool.Fabricator", { hours: round(guide.hours), cost: round(guide.cost) }));
  } else if (answer.kind in REPLICATORS) {
    const capacity = REPLICATORS[answer.kind]!;
    lines.push(item.weight <= capacity ? F("Tool.Replicator", { capacity }) : F("Tool.TooHeavy", { capacity }));
    lines.push(F("Tool.Template", { complexity: REPLICATOR_TEMPLATE.complexity, cost: round(answer.cost * REPLICATOR_TEMPLATE.cost) }));
  } else {
    const hours = facilityHours(answer.kind, item, answer.tl, answer.units);
    const skill = facilitySkill(answer.kind);
    lines.push(F("Tool.FacilityHours", { hours: round(hours ?? 0) }));
    if (skill) lines.push(F("Tool.Skill", { skill }));
  }
  lines.push(F("Tool.Blueprints", { threeD: blueprintComplexity(answer.cost, false), molecular: blueprintComplexity(answer.cost, true) }));
  const kit = instructorKit(answer.cost);
  lines.push(F("Tool.Kit", { price: round(kit.price), hours: round(kit.hours), bonus: kit.bonus }));
  await say(null, L("Tool.Title"), lines);
}

async function applyRepairPaste(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = picked().targets[0] ?? null;
  const answer = await ask(L("Paste.Title"),
    row(L("Paste.Wrong"), `<input type="checkbox" name="wrong" />`) + row(L("Paste.Skill"), `<input type="text" name="skill" value="" placeholder="Electronics Repair" />`),
    (form) => ({ wrong: Boolean(val(form, "wrong")?.checked), skill: String(val(form, "skill")?.value ?? "").trim() }));
  if (!answer) return;
  const lines: string[] = [];
  let skilled = false;
  if (answer.skill && !answer.wrong) {
    const level = api.actors.skillLevel(actor, answer.skill);
    if (level !== null) {
      const result: any = await api.roll.success({ actor, base: level, skill: answer.skill, label: F("Paste.RollLabel", { name: item.name }), modifiers: [{ label: L("Paste.Plus2"), value: 2 }] } as any);
      skilled = Boolean(result?.success);
    }
  }
  const roll = new Roll(answer.wrong ? "1d6-1" : "1d6-2");
  await roll.evaluate();
  const total = Number(roll.total) || 0;
  if (answer.wrong) lines.push(F("Paste.WrongResult", { damage: Math.max(0, total) }));
  else {
    const result = repairPaste(total, skilled);
    lines.push(result.hp >= 0 ? F("Paste.Repaired", { hp: result.hp, hours: result.hours }) : F("Paste.Botched", { damage: -result.hp, hours: result.hours }));
    // Universal paste heals anything with the Machine meta-trait (p. 84).
    if (/universal/i.test(String(item.name)) && target?.isOwner && result.hp > 0) {
      const hp = target.system?.hp;
      if (hp) await target.update({ "system.hp.value": Math.min(Number(hp.max) || 0, (Number(hp.value) || 0) + result.hp) });
      lines.push(F("Paste.Healed", { name: target.name, hp: result.hp }));
    }
  }
  if (Number(item.system?.quantity) > 1) await item.update({ "system.quantity": Number(item.system.quantity) - 1 });
  await say(actor, String(item.name), lines);
}

async function stressRope(api: GWorldApi, item: any, actor: any): Promise<void> {
  const diameter = /\(([^)]+)\)/.exec(String(item.name))?.[1] ?? "";
  const working = ropeLoad(diameter, itemTl(item), Math.max(itemTl(item), tlOf(actor?.system?.tl) ?? 0));
  if (!working) return;
  const load = await ask(L("Rope.Title"), row(L("Rope.Load"), num("load", working * 2)), (form) => Number(val(form, "load")?.value) || 0);
  if (load === null) return;
  const modifier = ropeStressModifier(load, working);
  if (modifier === null) return void say(actor, String(item.name), [F("Rope.Safe", { load, working })]);
  const result: any = await api.roll.success({ actor, base: 12, kind: "attribute", label: F("Rope.RollLabel", { name: item.name }), modifiers: [{ label: F("Rope.Multiple", { working }), value: modifier }] } as any);
  if (result) await say(actor, String(item.name), [result.success ? L("Rope.Holds") : L("Rope.Snaps")]);
}

async function detonateTrap(item: any, actor: any): Promise<void> {
  const capacity = antimatterTrapCapacity(itemTl(item));
  const micrograms = await ask(L("Trap.Title"), row(F("Trap.Micrograms", { capacity }), num("mg", 1)), (form) => Number(val(form, "mg")?.value) || 0);
  if (!micrograms) return;
  const multiplier = explosionMultiplier(micrograms * MICROGRAM_POUNDS, ANTIMATTER_REF);
  const roll = new Roll(`6d6*${multiplier}`);
  await roll.evaluate();
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Trap.Title"))}</span></div><div class="gc-result">${esc(F("Trap.Blast", { micrograms, multiplier, damage: roll.total }))}</div></div>`,
    rolls: [roll],
  });
}

async function hazardsTool(api: GWorldApi): Promise<void> {
  const { targets } = picked();
  if (!targets.length) return void ui.notifications?.warn(L("Hazard.Target"));
  const answer = await ask(L("Hazard.Title"),
    row(L("Hazard.Kind"), select("kind", [["slipspray", L("Hazard.slipspray")], ["adhesive", L("Hazard.adhesive")], ["tractor", L("Hazard.tractor")]]))
    + row(L("Hazard.Gait"), select("gait", [["walking", L("Hazard.walking")], ["crawling", L("Hazard.crawling")], ["sprinting", L("Hazard.sprinting")]]))
    + row(L("Hazard.Flesh"), `<input type="checkbox" name="flesh" />`)
    + row(L("Hazard.Beam"), select("beam", [["utility", L("Hazard.utility")], ["light", L("Hazard.light")], ["heavy", L("Hazard.heavy")]]))
    + row(L("Hazard.Tl"), num("tl", 11, "1")),
    (form) => ({ kind: val(form, "kind")?.value ?? "slipspray", gait: (val(form, "gait")?.value ?? "walking") as "walking" | "crawling" | "sprinting", flesh: Boolean(val(form, "flesh")?.checked), beam: val(form, "beam")?.value ?? "utility", tl: Number(val(form, "tl")?.value) || 11 }));
  if (!answer) return;
  for (const victim of targets) {
    const st = api.actors.attribute(victim, "ST") ?? 10;
    if (answer.kind === "slipspray") {
      const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "DX") ?? 10, kind: "attribute", label: L("Hazard.SlipsprayLabel"), modifiers: [{ label: L(`Hazard.${answer.gait}`), value: slipsprayModifier(answer.gait) }] } as any);
      if (result && !result.success) await api.actors.setPosture(victim, "lyingProne").catch(() => false);
      if (result) await say(victim, L("Hazard.slipspray"), [F(result.success ? "Hazard.Stays" : "Hazard.Falls", { name: victim.name, vehicle: SLIPSPRAY_VEHICLE })]);
    } else if (answer.kind === "adhesive") {
      const outcome: any = await api.roll.regularContest({ label: L("Hazard.AdhesiveLabel"), first: { actor: victim, base: st }, second: { actor: victim, base: ADHESIVE.st, note: L("Hazard.adhesive") } });
      const lines = [F(outcome?.outcome === "first" ? "Hazard.PulledFree" : "Hazard.Stuck", { name: victim.name })];
      if (outcome?.outcome === "first" && answer.flesh) {
        const roll = new Roll("1d6-4");
        await roll.evaluate();
        const damage = Math.max(0, Number(roll.total) || 0);
        if (damage) await api.actors.applyInjury(victim, { amount: damage, label: L("Hazard.adhesive") });
        lines.push(F("Hazard.Torn", { damage }));
      }
      await say(victim, L("Hazard.adhesive"), lines);
    } else {
      const beam = tractorBeam(answer.beam, answer.tl);
      if (!beam) continue;
      const outcome: any = await api.roll.quickContest({ label: L("Hazard.TractorLabel"), first: { actor: victim, base: st }, second: { actor: victim, base: beam.st, note: L(`Hazard.${answer.beam}`) }, tags: ["ut-tractor"] });
      await say(victim, L("Hazard.tractor"), [F(outcome?.outcome === "first" ? "Hazard.Breaks" : "Hazard.Held", { name: victim.name, st: beam.st, range: beam.range })]);
    }
  }
}

function fabricationLines(item: any): string[] {
  const name = String(item?.name ?? "");
  const tl = itemTl(item);
  const campaign = Math.max(tl, tlOf(item?.actor?.system?.tl) ?? 0);
  const lines: string[] = [];
  const diameter = /^Rope \(([^)]+)\)$/.exec(name)?.[1];
  if (diameter) {
    const load = ropeLoad(diameter, tl, campaign);
    if (load) lines.push(F("Item.Rope", { load, tl: campaign }));
  }
  if (/^Construction Foam/i.test(name)) lines.push(F("Item.Foam", { dr: foamDr(1), pounds: FOAM_POUNDS_PER_GALLON }));
  const beam = /^(Heavy|Light|Utility) Tractor-Pressor Beam$/i.exec(name)?.[1]?.toLowerCase();
  if (beam) {
    const figures = tractorBeam(beam, campaign);
    if (figures) lines.push(F("Item.Tractor", { ...figures, tl: campaign }));
  }
  if (/^Portable Antimatter Trap$/i.test(name)) lines.push(F("Item.Trap", { capacity: antimatterTrapCapacity(campaign), tl: campaign }));
  const facility = Object.keys(FACILITIES).find((key) => L(`Facility.${key}`).toLowerCase() === name.toLowerCase());
  if (facility) {
    const rate = FACILITIES[facility]!;
    const later = Math.max(0, campaign - rate.tl);
    const factor = rate.nanofac ? (campaign >= 12 ? 2 : 1) : 2 ** later;
    lines.push(F("Item.Rate", { dollars: rate.dollars * factor, pounds: rate.pounds * (rate.nanofac ? 1 : factor), tl: campaign }));
  }
  return lines;
}

// ── gravity ──

async function gravityShift(api: GWorldApi): Promise<void> {
  const { targets } = picked();
  if (!targets.length) return void ui.notifications?.warn(L("Gravity.Target"));
  const answer = await ask(L("Gravity.Title"), row(L("Gravity.From"), num("from", 1)) + row(L("Gravity.To"), num("to", 2)), (form) => ({ from: Number(val(form, "from")?.value) || 0, to: Number(val(form, "to")?.value) || 0 }));
  if (!answer) return;
  const modifier = gravityShiftModifier(answer.from, answer.to);
  const lines: string[] = [];
  if (modifier === null) lines.push(L("Gravity.NoRoll"));
  if (answer.to > answer.from) lines.push(L("Gravity.HighAcceleration"));
  if (answer.to <= 0) lines.push(L("Gravity.ZeroG"));
  if (lines.length) await say(null, L("Gravity.Title"), lines);
  if (modifier === null) return;
  for (const victim of targets) {
    const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "DX") ?? 10, kind: "attribute", label: F("Gravity.RollLabel", { from: answer.from, to: answer.to }), modifiers: modifier ? [{ label: L("Gravity.Doublings"), value: modifier }] : [] } as any);
    if (result && !result.success) await api.actors.setPosture(victim, "lyingProne").catch(() => false);
  }
}

function gravityLines(item: any): string[] {
  const name = String(item?.name ?? "");
  const tl = Math.max(itemTl(item), tlOf(item?.actor?.system?.tl) ?? 0);
  if (/^Gravity Plates$/i.test(name)) return [F("Item.Plates", { ...gravityPlates(tl), tl })];
  if (/^Gravity Screen/i.test(name)) return [L("Item.Screen")];
  if (/^Gravity Mat$/i.test(name)) return [L("Item.Mat")];
  if (/^Grav (Hammer|Ram)$/i.test(name)) return [F("Item.GravHammer", { damage: /ram/i.test(name) ? (tl >= 12 ? "6d" : "4d") : tl >= 12 ? "3d" : "2d" })];
  return [];
}

// ── psi amplifiers ──

const psiData = (item: any) => {
  const data = item?.system?.extensions?.[MODULE_ID]?.[PSI_FIELD] ?? {};
  return { attunedTo: String(data.attunedTo ?? ""), burntOut: Boolean(data.burntOut) };
};

async function attune(api: GWorldApi, item: any, actor: any): Promise<void> {
  const level = api.actors.skillLevel(actor, "Electronics Operation (Psychotronics)") ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
  const result: any = await api.roll.success({ actor, base: level, skill: "Electronics Operation (Psychotronics)", label: F("Psi.AttuneLabel", { name: item.name }) } as any);
  if (!result) return;
  if (result.success) await item.update({ [`system.extensions.${MODULE_ID}.${PSI_FIELD}.attunedTo`]: String(actor.id) });
  if (result.criticalFailure) await item.update({ [`system.extensions.${MODULE_ID}.${PSI_FIELD}.burntOut`]: true });
  await say(actor, String(item.name), [result.success ? F("Psi.Attuned", { name: actor.name }) : result.criticalFailure ? L("Psi.Damaged") : L("Psi.Wasted")]);
}

async function amplify(item: any, actor: any): Promise<void> {
  const kind = psiAmpByName(String(item.name));
  if (!kind) return;
  const max = psiAmpBoost(kind, Math.max(itemTl(item), tlOf(actor?.system?.tl) ?? 0));
  const data = psiData(item);
  if (data.burntOut) return void ui.notifications?.warn(L("Psi.BurntOut"));
  const current = actor.getFlag(MODULE_ID, AMPLIFYING) ?? {};
  const answer = await ask(L("Psi.AmplifyTitle"), row(L("Psi.Power"), `<input type="text" name="power" value="${esc(current.power ?? "")}" />`) + row(F("Psi.Boost", { max }), num("boost", Math.min(max, Number(current.boost) || max), "1")), (form) => ({ power: String(val(form, "power")?.value ?? "").trim(), boost: Math.max(0, Math.min(max, Math.floor(Number(val(form, "boost")?.value) || 0))) }));
  if (!answer) return;
  if (!answer.boost || !answer.power) {
    await actor.unsetFlag(MODULE_ID, AMPLIFYING);
    return void say(actor, String(item.name), [L("Psi.Off")]);
  }
  await actor.setFlag(MODULE_ID, AMPLIFYING, { itemId: String(item.id), power: answer.power, boost: answer.boost });
  await say(actor, String(item.name), [F("Psi.On", { name: actor.name, power: answer.power, boost: answer.boost, attuned: data.attunedTo === actor.id ? "" : L("Psi.NotAttuned") })]);
}

/** The amplification an actor has running for a roll, where the roll uses the amplified power. */
function amplifiedFor(actor: any, context: any): { item: any; boost: number; attuned: boolean } | null {
  const state = actor?.getFlag?.(MODULE_ID, AMPLIFYING);
  if (!state?.power) return null;
  const text = `${context?.skill ?? ""} ${context?.label ?? ""}`.toLowerCase();
  if (!text.includes(String(state.power).toLowerCase())) return null;
  const item = actor.items?.get?.(state.itemId);
  if (!item || psiData(item).burntOut) return null;
  return { item, boost: Number(state.boost) || 0, attuned: psiData(item).attunedTo === String(actor.id) };
}

export function readyFabrication(api: GWorldApi, on: FabricationSwitches): void {
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-fabrication", label: L("Tool.Title"), icon: "fa-solid fa-industry", visible: on.fabrication, open: () => fabricationTool() });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-hazards", label: L("Hazard.Title"), icon: "fa-solid fa-hand-sparkles", visible: on.fabrication, open: () => hazardsTool(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-gravity-shift", label: L("Gravity.Title"), icon: "fa-solid fa-arrows-down-to-line", visible: on.gravity, open: () => gravityShift(api) });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-repair-paste", itemTypes: ["equipment"], label: L("Paste.Title"), icon: "fa-solid fa-spray-can", visible: (item) => on.fabrication() && /Repair Paste$/i.test(String(item?.name)), run: (item, actor) => applyRepairPaste(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-rope-stress", itemTypes: ["equipment"], label: L("Rope.Title"), icon: "fa-solid fa-link", visible: (item) => on.fabrication() && /^Rope \(/i.test(String(item?.name)), run: (item, actor) => stressRope(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-antimatter-trap", itemTypes: ["equipment"], label: L("Trap.Title"), icon: "fa-solid fa-radiation", visible: (item) => on.fabrication() && /^Portable Antimatter/i.test(String(item?.name)), run: (item, actor) => detonateTrap(item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-psi-attune", itemTypes: ["equipment"], label: L("Psi.AttuneTitle"), icon: "fa-solid fa-wave-square", visible: (item) => on.psi() && psiAmpByName(String(item?.name)) !== null, run: (item, actor) => attune(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-psi-amplify", itemTypes: ["equipment"], label: L("Psi.AmplifyTitle"), icon: "fa-solid fa-brain", visible: (item) => on.psi() && psiAmpByName(String(item?.name)) !== null, run: (item, actor) => amplify(item, actor) });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-fabrication-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-fabrication-item.hbs`,
    visible: (item) => isGear(item) && [...(on.fabrication() ? fabricationLines(item) : []), ...(on.gravity() ? gravityLines(item) : [])].length > 0,
    context: (item) => ({ lines: [...(on.fabrication() ? fabricationLines(item) : []), ...(on.gravity() ? gravityLines(item) : [])] }),
  });

  // The amplifier's boost to the power's Talent (p. 94).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.psi()) return;
    const amp = amplifiedFor(context?.actor, context);
    if (amp?.boost) context.modifiers.push({ label: F("Psi.Line", { name: amp.item.name }), value: amp.boost });
  });

  // A critical failure through an amplifier, or any 15+ through one not attuned: psychotronic feedback (p. 94).
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    if (!on.psi() || !actor?.isOwner) return;
    const amp = amplifiedFor(actor, context);
    const outcome = context?.outcome;
    if (!amp || !outcome || !psiAmpCriticalFailure(Number(outcome.roll) || 0, Boolean(outcome.criticalFailure), amp.attuned)) return;
    void (async () => {
      await amp.item.update({ [`system.extensions.${MODULE_ID}.${PSI_FIELD}.burntOut`]: true });
      await actor.unsetFlag(MODULE_ID, AMPLIFYING);
      const ht = api.actors.attribute(actor, "HT") ?? 10;
      const result: any = await api.roll.success({ actor, base: ht + 3, kind: "attribute", label: L("Psi.FeedbackLabel"), modifiers: [{ label: L("Psi.BoostLine"), value: -amp.boost }] } as any);
      if (!result) return;
      const effect = psychotronicFeedback(result);
      if (effect === "seizure") await api.actors.applyCondition(actor, { key: "seizure", duration: { seconds: result.margin } } as any);
      if (effect === "coma") await api.actors.applyCondition(actor, { key: "coma" } as any);
      await say(actor, L("Psi.FeedbackTitle"), [L("Psi.BurnsOut"), F(`Psi.Feedback.${effect}`, { name: actor.name, seconds: result.margin })]);
    })();
  });
}
