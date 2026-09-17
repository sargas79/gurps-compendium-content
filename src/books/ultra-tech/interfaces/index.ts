/**
 * GURPS Ultra-Tech's interfaces and media, registered with the system through
 * the add-on API (pp. 24, 47-59).
 *
 * A worn HUD or neural interface gives +1 to Driving, Piloting and Free Fall;
 * a visual enhancement program +1 to Vision. Row actions experience a sensie
 * (immersion or surface mode) and feel its pain and horrors, or total VR's;
 * use a virtual tutor at skill 12; take a dose of instaskill nano, whose point
 * arrives once it assimilates; take off a neural interface helmet (1d if it
 * isn't disconnected first); run a holoprojection's Quick Contests against
 * the targets; and release a scent synthesizer's nauseating odor. An item
 * section explains VR levels, translators, dreamgames, dream teachers, neural
 * interfaces, video masking, scent masking and sonic projectors' ranges as
 * the book gives them.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { agentEffects } from "../agents/rules.js";
import {
  NEURAL_HELMET,
  SCENT_SYNTH,
  holoContest,
  holoVictimModifier,
  sensieShock,
  sonicProjectorRange,
  type HoloAim,
  CONSOLE_GAME_BONUS,
  DREAMGAME_ADDICTION,
  HOLOPROJECTION_NO_INTERFACE,
  HUD_BONUS,
  HUD_SKILLS,
  SENSIE_SURFACE,
  VIRTUAL_TUTOR_SKILL,
  VISUAL_ENHANCEMENT,
  VR_COMPLEXITY,
  PAIR_COST,
  SENSIE_BANDWIDTH,
  aiTutorRate,
  dreamTeacherComplexity,
  dreamTeacherRate,
  experiencedLevel,
  filteredAppearance,
  seriesComprehension,
  translatorComplexity,
  universalTranslatorLevel,
  virtualTutorComplexity,
  instaskillHours,
  instaskillOverdose,
  instaskillTakes,
  managerSupports,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Interface.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Interface.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const carried = (item: any) => isGear(item) && item.system?.carried !== false;
const worn = (item: any) => isGear(item) && item.system?.equipped === true;
const complexityOf = (item: any) => Number(item?.system?.extensions?.[MODULE_ID]?.computer?.complexity) || 0;

/** Worn gear with a HUD or a neural interface, which makes one unnecessary (pp. 24, 48-49, 60). */
const HUD_GEAR = /head-up display|\bhud\b|goggles or visor|video glasses|binoculars|contacts|neural interface helmet|neural induction (helmet|pad)/i;

/** The worn HUD or neural interface a character sees through, by name, or null. */
export function hudSource(actor: any): string | null {
  const item = [...(actor?.items ?? [])].find((i: any) => worn(i) && HUD_GEAR.test(String(i.name)));
  if (item) return String(item.name);
  const trait = [...(actor?.items ?? [])].find((i: any) => i.type === "trait" && /neural interface|computer implant/i.test(String(i.name)));
  return trait ? String(trait.name) : null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
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

/** Experiencing a sensie (p. 57): immersed, or muted on the surface at -3 to other tasks. */
async function experienceSensie(api: GWorldApi, actor: any): Promise<void> {
  const mode = await ask(L("Sensie.Title"), row(L("Sensie.Mode"), `<select name="mode"><option value="surface">${esc(L("Sensie.surface"))}</option><option value="immersion">${esc(L("Sensie.immersion"))}</option><option value="off">${esc(L("Sensie.off"))}</option></select>`), (form) => form.querySelector<HTMLSelectElement>("[name=mode]")?.value ?? "surface");
  if (!mode) return;
  for (const condition of api.actors.conditions(actor).filter((c) => c.id.startsWith(`${MODULE_ID}.ut-sensie`) || c.id.startsWith("ut-sensie"))) await api.actors.removeCondition(actor, condition.id);
  if (mode === "off") return void say(actor, L("Sensie.Title"), [F("Sensie.Ended", { name: actor.name })]);
  if (mode === "surface") {
    await api.actors.applyCondition(actor, {
      module: MODULE_ID,
      key: "ut-sensie-surface",
      label: L("Sensie.surface"),
      effects: { modifiers: [{ label: L("Sensie.surface"), value: SENSIE_SURFACE.tasks, rolls: ["skill", "attack", "defense"] }, { label: L("Sensie.surface"), value: SENSIE_SURFACE.resist, rolls: ["fright"] }] },
    } as any);
    await say(actor, L("Sensie.Title"), [F("Sensie.SurfaceLine", { name: actor.name })]);
  } else {
    await api.actors.applyCondition(actor, { module: MODULE_ID, key: "ut-sensie-immersion", label: L("Sensie.immersion") } as any);
    await say(actor, L("Sensie.Title"), [F("Sensie.ImmersionLine", { name: actor.name })]);
  }
}

/** A virtual tutor coaches a task at an effective skill of 12 (p. 57). */
async function virtualTutor(api: GWorldApi, item: any, actor: any): Promise<void> {
  const task = await ask(L("Tutor.Title"), row(L("Tutor.Task"), `<input type="text" name="task" value="" />`), (form) => form.querySelector<HTMLInputElement>("[name=task]")?.value ?? "");
  if (task === null) return;
  const own = task ? api.actors.skillLevel(actor, task) : null;
  const base = Math.max(VIRTUAL_TUTOR_SKILL, own ?? 0);
  await api.roll.success({ actor, base, label: F("Tutor.Label", { tutor: item.name, task: task || L("Tutor.TheTask") }) } as any);
}

const INSTASKILL_FLAG = "utInstaskill";
interface PendingDose { skillId: string; at: number }
const pendingDoses = (actor: any): PendingDose[] => {
  const stored = actor?.getFlag?.(MODULE_ID, INSTASKILL_FLAG);
  return Array.isArray(stored) ? stored.filter((d: any) => d && typeof d.skillId === "string") : [];
};
const worldTime = () => Number((game as any).time?.worldTime) || 0;

/** Gives the points of doses that have assimilated by now (p. 59). */
async function assimilate(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const doses = pendingDoses(actor);
  const ready = doses.filter((d) => d.at <= worldTime());
  if (!ready.length) return;
  for (const dose of ready) {
    const skill = actor.items.get(dose.skillId);
    if (!skill) continue;
    await skill.update({ "system.points": (Number(skill.system?.points) || 0) + 1 });
    await say(actor, L("Instaskill.Title"), [F("Instaskill.Assimilated", { name: actor.name, skill: skill.name })]);
  }
  await actor.setFlag(MODULE_ID, INSTASKILL_FLAG, doses.filter((d) => d.at > worldTime()));
}

/** A dose of instaskill nano (p. 59): a point in a skill the user has a point or less in. */
async function takeInstaskill(api: GWorldApi, item: any, actor: any): Promise<void> {
  const skills = [...(actor.items ?? [])].filter((i: any) => (i.type === "skill" || i.type === "technique") && instaskillTakes(Number(i.system?.points) || 0));
  if (!skills.length) return void ui.notifications?.warn(L("Instaskill.None"));
  const answer = await ask(L("Instaskill.Title"),
    row(L("Instaskill.Skill"), `<select name="skill">${skills.map((s: any) => `<option value="${s.id}">${esc(s.name)} (${Number(s.system?.points) || 0})</option>`).join("")}</select>`)
    + row(L("Instaskill.Unassimilated"), `<input type="checkbox" name="stacked" ${pendingDoses(actor).some((d) => d.at > worldTime()) ? "checked" : ""} />`)
    + row(L("Instaskill.Superscience"), `<input type="checkbox" name="super" />`),
    (form) => ({ skill: form.querySelector<HTMLSelectElement>("[name=skill]")?.value ?? "", stacked: Boolean(form.querySelector<HTMLInputElement>("[name=stacked]")?.checked), superscience: Boolean(form.querySelector<HTMLInputElement>("[name=super]")?.checked) }));
  if (!answer) return;
  const skill = actor.items.get(answer.skill);
  if (!skill) return;
  const lines: string[] = [];
  if (answer.stacked) {
    const roll: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "IQ") ?? 10, kind: "attribute", label: L("Instaskill.Overdose") } as any);
    if (!roll) return;
    const outcome = instaskillOverdose(roll);
    if (outcome.phantomVoices) {
      await actor.createEmbeddedDocuments("Item", [{ name: "Phantom Voices (Annoying)", type: "trait", system: { points: -5 } }]);
      lines.push(outcome.days === "permanent" ? F("Instaskill.VoicesForever", { name: actor.name }) : F("Instaskill.Voices", { name: actor.name, days: outcome.days }));
      await say(actor, L("Instaskill.Title"), lines);
      return;
    }
  }
  // The point comes once the dose has assimilated (p. 59).
  const hours = instaskillHours(answer.superscience);
  await actor.setFlag(MODULE_ID, INSTASKILL_FLAG, [...pendingDoses(actor), { skillId: skill.id, at: worldTime() + hours * 3600 }]);
  lines.push(F("Instaskill.Point", { name: actor.name, skill: skill.name, hours }));
  if (Number(item.system?.quantity) > 1) await item.update({ "system.quantity": Number(item.system.quantity) - 1 });
  await say(actor, L("Instaskill.Title"), lines);
}

/** Takes off a neural interface helmet (p. 49): 1d injury if it wasn't disconnected first. */
async function removeHelmet(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const disconnected = await ask(L("Helmet.Title"), row(L("Helmet.Disconnected"), `<input type="checkbox" name="off" checked />`), (form) => Boolean(form.querySelector<HTMLInputElement>("[name=off]")?.checked));
  if (disconnected === null) return;
  await item.update({ "system.equipped": false });
  if (disconnected) return void say(actor, String(item.name), [F("Helmet.Removed", { name: actor.name, seconds: NEURAL_HELMET.seconds })]);
  // GURPS dice are sixes: "1d" is 1d6.
  const roll = await new Roll(NEURAL_HELMET.yank.replace(/d(?!\d)/g, "d6")).evaluate();
  await api.actors.applyInjury(actor, { amount: Number(roll.total) || 0, label: String(item.name) });
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), rolls: [roll], content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(item.name)}</span></div><div class="gc-result">${esc(F("Helmet.Yanked", { name: actor.name, injury: roll.total }))}</div></div>` });
}

const HOLOPROJECTORS = /^(mini |super )?holoprojector$|^interactive holoprojection$/i;

/** Runs a holoprojection against the targeted characters (p. 53). */
async function holoprojection(api: GWorldApi, item: any, actor: any): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  if (!targets.length) return void ui.notifications?.warn(L("Holo.Pick"));
  const aims: HoloAim[] = ["fool", "fright", "impersonate"];
  const answer = await ask(L("Holo.Title"),
    row(L("Holo.Aim"), `<select name="aim">${aims.map((a) => `<option value="${a}">${esc(L(`Holo.${a}`))}</option>`).join("")}</select>`)
    + row(L("Holo.Warned"), `<input type="checkbox" name="warned" />`)
    + row(L("Holo.Unsubtle"), `<input type="checkbox" name="unsubtle" />`)
    + row(L("Holo.People"), `<input type="number" name="people" value="0" min="0" style="width:60px" />`)
    + row(L("Holo.Believability"), `<input type="number" name="believability" value="0" min="-5" max="10" style="width:60px" />`)
    + row(L("Holo.Darkness"), `<input type="number" name="darkness" value="0" max="0" style="width:60px" />`)
    + (/^interactive/i.test(String(item.name)) ? row(L("Holo.NoInterface"), `<input type="checkbox" name="nointerface" />`) : ""),
    (form) => {
      const get = (name: string) => form.querySelector<HTMLInputElement>(`[name=${name}]`);
      return {
        aim: (form.querySelector<HTMLSelectElement>("[name=aim]")?.value ?? "fool") as HoloAim,
        warned: Boolean(get("warned")?.checked), unsubtle: Boolean(get("unsubtle")?.checked),
        people: Number(get("people")?.value) || 0, believability: Number(get("believability")?.value) || 0,
        darkness: Number(get("darkness")?.value) || 0, noInterface: Boolean(get("nointerface")?.checked),
      };
    });
  if (!answer) return;
  const contest = holoContest(answer.aim);
  const levels = contest.operator.map((skill) => ({ skill, level: api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5 }));
  const operator = levels.reduce((best, next) => (contest.lowest ? next.level < best.level : next.level > best.level) ? next : best);
  const victimModifier = holoVictimModifier(answer);
  for (const target of targets) {
    const scores = contest.victim.map((score) => ({ score, value: api.actors.attribute(target, score as any) ?? 10 }));
    const victim = scores.reduce((best, next) => (next.value > best.value ? next : best));
    const result: any = await api.roll.quickContest({
      label: F("Holo.Label", { name: item.name, target: target.name }),
      first: { actor, base: operator.level, note: operator.skill, modifiers: answer.noInterface ? [{ label: L("Holo.NoInterface"), value: HOLOPROJECTION_NO_INTERFACE }] : [] },
      second: { actor: target, base: victim.value, note: victim.score, modifiers: victimModifier ? [{ label: L("Holo.VictimLine"), value: victimModifier }] : [] },
      tags: ["holoprojection"],
    } as any);
    if (!result) continue;
    const fooled = result.outcome === "first";
    await say(actor, String(item.name), [F(fooled ? `Holo.${answer.aim}Won` : "Holo.Lost", { target: target.name })]);
    if (fooled && answer.aim === "fright") await api.roll.frightCheck(target, 0);
  }
}

const SCENT_SYNTHESIZERS = /^(odor synthesizer|programmable perfume)$/i;

/** A scent synthesizer's nauseating odor (p. 52): a mild riot gas, resisted at HT. */
async function nauseatingOdor(api: GWorldApi, item: any, actor: any): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
  if (!targets.length) return void ui.notifications?.warn(L("Scent.Pick"));
  const lines: string[] = [];
  for (const target of targets) {
    const result: any = await api.roll.success({ actor: target, base: api.actors.attribute(target, "HT") ?? 10, kind: "attribute", tags: ["HT"], label: F("Scent.Resist", { name: item.name }), modifiers: SCENT_SYNTH.nauseaResist ? [{ label: String(item.name), value: SCENT_SYNTH.nauseaResist }] : [] } as any);
    if (!result) continue;
    if (result.success) { lines.push(F("Scent.Resisted", { target: target.name })); continue; }
    for (const effect of agentEffects("riotGas", Number(result.margin) || 0, Boolean(result.criticalFailure))) {
      if (effect.condition) await api.actors.applyCondition(target, { key: effect.condition } as any);
    }
    lines.push(F("Scent.Sick", { target: target.name }));
  }
  if (lines.length) await say(actor, String(item.name), lines);
}

/** A sensie's pain and horrors, or total VR's without safety interlocks (pp. 55, 57). */
async function feelIt(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const sensie = /^sensie player$/i.test(String(item.name));
  const mode = (api.actors.conditions(actor) ?? []).some((c: any) => String(c?.id ?? "").endsWith("ut-sensie-surface")) ? "surface" : "immersion";
  const answer = await ask(L("Feel.Title"),
    (sensie ? row(L("Feel.Injury"), `<input type="number" name="injury" value="0" min="0" style="width:60px" />`) : "")
    + row(L("Feel.Fright"), `<input type="checkbox" name="fright" ${sensie ? "" : "checked"} />`)
    + row(L("Feel.Penalty"), `<input type="number" name="penalty" value="0" max="0" style="width:60px" />`),
    (form) => ({
      injury: Number(form.querySelector<HTMLInputElement>("[name=injury]")?.value) || 0,
      fright: Boolean(form.querySelector<HTMLInputElement>("[name=fright]")?.checked),
      penalty: Math.min(0, Number(form.querySelector<HTMLInputElement>("[name=penalty]")?.value) || 0),
    }));
  if (!answer) return;
  const lines: string[] = [];
  if (sensie && answer.injury > 0) {
    const shock = sensieShock(answer.injury, Number(api.actors.derived(actor)?.hp?.max ?? actor.system?.hp?.max) || 10, mode);
    if (shock) {
      await api.actors.applyCondition(actor, { module: MODULE_ID, key: "ut-sensie-shock", label: L("Feel.Shock"), duration: { turns: 1 }, effects: { modifiers: [{ label: L("Feel.Shock"), value: shock, rolls: ["skill", "attack", "DX", "IQ"] }] } } as any);
      lines.push(F("Feel.ShockLine", { name: actor.name, shock, mode: L(`Sensie.${mode}`) }));
    }
  }
  if (lines.length) await say(actor, String(item.name), lines);
  // A surface-mode sensie's +4 to the check is on its condition already.
  if (answer.fright) await api.roll.frightCheck(actor, answer.penalty);
}

/** What the item section says about a record, by name. */
function itemLines(item: any): string[] {
  const name = String(item?.name ?? "");
  const complexity = complexityOf(item);
  const lines: string[] = [];
  if (/^VR Gloves$/i.test(name)) lines.push(F("Vr.Interface", { level: L("Vr.gloves"), complexity: VR_COMPLEXITY.gloves }));
  if (/^Basic VR Suit$/i.test(name)) lines.push(F("Vr.Interface", { level: L("Vr.basic"), complexity: VR_COMPLEXITY.basic }));
  if (/^Full VR Suit$/i.test(name)) lines.push(F("Vr.Interface", { level: L("Vr.full"), complexity: VR_COMPLEXITY.full }));
  if (/^VR Manager/i.test(name) && complexity) lines.push(F("Vr.Manager", { level: L(`Vr.${managerSupports(complexity) ?? "gloves"}`) }));
  if (/VR|Dreamgame|Sensie/i.test(name)) lines.push(F("Vr.Lower", { example: L(`Vr.${experiencedLevel("full", 4) ?? "basic"}`) }));
  if (/^Dreamgame/i.test(name)) lines.push(F("Dreamgame", { points: DREAMGAME_ADDICTION }));
  const comprehension = /^Translator Program \((Broken|Accented|Native)\)$/i.exec(name)?.[1]?.toLowerCase() as "broken" | "accented" | "native" | undefined;
  if (comprehension) lines.push(F("Translator", { complexity: translatorComplexity(comprehension), interspecies: translatorComplexity(comprehension, { interspecies: true }), unusual: PAIR_COST.unusual, obscure: PAIR_COST.obscure, series: L(`Comprehension.${seriesComprehension(comprehension, comprehension)}`) }));
  if (/^Universal Translator/i.test(name)) lines.push(F("UniversalTranslator", { hour: L(`Comprehension.${universalTranslatorLevel(1)}`), six: L(`Comprehension.${universalTranslatorLevel(6)}`), day: L(`Comprehension.${universalTranslatorLevel(24)}`) }));
  if (/^Dream Teacher/i.test(name)) lines.push(F("DreamTeacher", { iq: L(`Rate.${dreamTeacherRate("IQ")}`), dx: L(`Rate.${dreamTeacherRate("DX")}`), language: dreamTeacherComplexity({ language: true }), behaviour: dreamTeacherComplexity({ disadvantagePoints: -5 }) }));
  if (/^Virtual Tutor/i.test(name)) lines.push(F("VirtualTutor", { easy: virtualTutorComplexity(true), other: virtualTutorComplexity(false) }));
  if (/^AI Tutor/i.test(name) || /^Nursebot|^Android/i.test(name)) lines.push(F("AiTutor", { nonVolitional: L(`Rate.${aiTutorRate(false)}`), volitional: L(`Rate.${aiTutorRate(true)}`) }));
  if (/^Neural (Interface|Induction|Input)/i.test(name)) lines.push(L("NeuralInterface"));
  if (/^Cosmetic Filter$/i.test(name)) {
    const appearance = [...(item?.actor?.items ?? [])].find((i: any) => i.type === "trait" && /^(Hideous|Ugly|Unattractive|Attractive|Handsome|Beautiful|Very Handsome|Very Beautiful)/i.test(String(i.name)))?.name ?? "Average";
    lines.push(F("CosmeticFilter", { from: appearance, to: filteredAppearance(String(appearance)) }));
  }
  if (/^Entertainment Console$/i.test(name)) lines.push(F("Console", { bonus: CONSOLE_GAME_BONUS }));
  if (/^Interactive Holoprojection$/i.test(name)) lines.push(F("Holoprojection", { penalty: HOLOPROJECTION_NO_INTERFACE }));
  if (/^Sensie Player$/i.test(name)) lines.push(F("SensiePlayer", { immersion: SENSIE_BANDWIDTH.immersion, surface: SENSIE_BANDWIDTH.surface }));
  if (/^Video Masking$/i.test(name)) lines.push(L("VideoMasking"));
  if (SCENT_SYNTHESIZERS.test(name)) lines.push(F("ScentSynth", { mask: SCENT_SYNTH.mask }));
  if (/^Total VR$/i.test(name)) lines.push(L("TotalVr"));
  if (/^Neural Interface Helmet$/i.test(name)) lines.push(F("HelmetLine", { seconds: NEURAL_HELMET.seconds, yank: NEURAL_HELMET.yank }));
  const projector = /^Sonic Projector \((Large|Medium|Small)\)$/i.exec(name)?.[1]?.toLowerCase() as "large" | "medium" | "small" | undefined;
  if (projector) {
    const tl = Math.max(Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9, Number(/\d+/.exec(String(item?.actor?.system?.tl ?? ""))?.[0]) || 0);
    lines.push(F("SonicProjector", { range: sonicProjectorRange(projector, tl), tl }));
  }
  return lines;
}

export function readyInterfaces(api: GWorldApi, on: () => boolean): void {
  // A masking odor: -5 to detect its wearer by smell, or to track them by scent (p. 52).
  Hooks.on(api.combat.hooks.detectionModifiers, (context: any) => {
    if (!on() || !context?.subject) return;
    const bySmell = context.sense === "tasteSmell" || /^tracking\b/i.test(String(context.skill ?? ""));
    if (!bySmell) return;
    const synth = [...(context.subject.items ?? [])].find((i: any) => i?.type === "equipment" && i.system?.carried !== false && SCENT_SYNTHESIZERS.test(String(i.name ?? "")));
    if (synth) context.modifiers.push({ label: String(synth.name), value: SCENT_SYNTH.mask });
  });

  // A HUD's +1 when reacting quickly matters (p. 24).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!on() || !actor || !HUD_SKILLS.some((re) => re.test(skill))) return;
    const source = hudSource(actor);
    if (source) context.modifiers.push({ label: F("HudLine", { source }), value: HUD_BONUS });
  });

  // Visual enhancement: +1 to Vision rolls (p. 56).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!on() || !context?.effects?.acute) return;
    const program = [...(context.actor?.items ?? [])].find((i: any) => carried(i) && /^Visual Enhancement$/i.test(String(i.name)));
    if (!program) return;
    context.effects.acute.vision = (Number(context.effects.acute.vision) || 0) + VISUAL_ENHANCEMENT;
    context.sources.push({ effect: "acute.vision", label: String(program.name), value: VISUAL_ENHANCEMENT });
  });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-sensie", itemTypes: ["equipment"], label: L("Sensie.Title"), icon: "fa-solid fa-head-side-virus", visible: (item) => on() && /^Sensie Player$/i.test(String(item?.name)), run: (_item, actor) => experienceSensie(api, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-virtual-tutor", itemTypes: ["equipment"], label: L("Tutor.Title"), icon: "fa-solid fa-chalkboard-user", visible: (item) => on() && /^Virtual Tutor/i.test(String(item?.name)), run: (item, actor) => virtualTutor(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-feel-it", itemTypes: ["equipment"], label: L("Feel.Title"), icon: "fa-solid fa-face-grimace", visible: (item) => on() && /^(Sensie Player|Total VR)$/i.test(String(item?.name)), run: (item, actor) => feelIt(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-helmet-off", itemTypes: ["equipment"], label: L("Helmet.Title"), icon: "fa-solid fa-helmet-un", visible: (item) => on() && /^Neural Interface Helmet$/i.test(String(item?.name)) && item?.system?.equipped === true, run: (item, actor) => removeHelmet(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-holoprojection", itemTypes: ["equipment"], label: L("Holo.Title"), icon: "fa-solid fa-cube", visible: (item) => on() && HOLOPROJECTORS.test(String(item?.name)), run: (item, actor) => holoprojection(api, item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-scent", itemTypes: ["equipment"], label: L("Scent.Title"), icon: "fa-solid fa-wind", visible: (item) => on() && SCENT_SYNTHESIZERS.test(String(item?.name)), run: (item, actor) => nauseatingOdor(api, item, actor) });

  // Instaskill doses assimilate as world time passes (p. 59); the GM's client gives the points.
  Hooks.on("updateWorldTime", () => {
    if (!on() || !(game as any).user?.isGM) return;
    for (const actor of (game as any).actors ?? []) if (pendingDoses(actor).length) void assimilate(actor);
  });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-instaskill", itemTypes: ["equipment"], label: L("Instaskill.Title"), icon: "fa-solid fa-syringe", visible: (item) => on() && /^Instaskill Nano$/i.test(String(item?.name)), run: (item, actor) => takeInstaskill(api, item, actor) });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-interface-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-interface-item.hbs`,
    visible: (item) => on() && isGear(item) && itemLines(item).length > 0,
    context: (item) => ({ lines: itemLines(item) }),
  });
}
