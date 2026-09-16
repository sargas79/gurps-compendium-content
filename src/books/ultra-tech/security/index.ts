/**
 * GURPS Ultra-Tech's security, restraint and interrogation gear, registered
 * with the system through the add-on API (pp. 101-111).
 *
 *   - **Security systems:** a GM tool that runs a barrier against its targets
 *     (fences, wire, monowire, sonic barriers, neural disruptor fields, dream
 *     nets, disintegrator fields); an item section for doors, safes and locks
 *     by TL.
 *   - **Restraints:** a row action to break free of cuffs and tape, and to
 *     resist power dampers, neuronic restraints and neural pacifiers.
 *   - **Interrogation:** sensory restraints' bonus against their wearer, the
 *     veridicator's bonus to Detect Lies, and GM tools for neural programming
 *     and mind probes.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  BARRIERS,
  CUFFTAPE_FAILURE_DAMAGE,
  CUFFTAPE_SEVERED,
  VERIFIER_SKILL,
  dreamNetRemoval,
  fenceCost,
  monowireSpotting,
  LOCKS,
  SAFES,
  cuffEscapeModifier,
  damperWill,
  doorDr,
  fastProbeTarget,
  mindProbeHours,
  mindProbeResult,
  monowireDice,
  neuralFieldModifier,
  neuralProgrammerQuality,
  neuralProgrammingModifier,
  neuronicModifier,
  pacifierTarget,
  razortapeDamage,
  restraintByName,
  restraintFigures,
  safeDr,
  sensoryRestraintBonus,
  struggleSeconds,
  veridicatorBonus,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Security.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Security.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

export interface SecuritySwitches {
  security: () => boolean;
  restraints: () => boolean;
  interrogation: () => boolean;
}

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const tlOf = (value: unknown): number | null => {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
};
const traitNames = (actor: any): string[] => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
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
const select = (name: string, options: Array<[string, string]>) => `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
const value = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

/** A skill level, or its attribute default, or the attribute itself. */
function level(api: GWorldApi, actor: any, skill: string, fallback: { attribute: "DX" | "IQ" | "HT" | "Will"; modifier: number }): number {
  return api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, fallback.attribute) ?? 10) + fallback.modifier;
}

// ── security systems ──

async function runBarrier(api: GWorldApi): Promise<void> {
  const { targets } = picked();
  if (!targets.length) return void ui.notifications?.warn(L("Barrier.Target"));
  const answer = await ask(L("Barrier.Title"),
    row(L("Barrier.Kind"), select("kind", [...Object.keys(BARRIERS).map((k): [string, string] => [k, L(`Barrier.${k}`)]), ["dreamNetRemoval", L("Barrier.dreamNetRemoval")]]))
    + row(L("Barrier.Tight"), `<input type="checkbox" name="tight" />`)
    + row(L("Barrier.Speed"), select("speed", [["walking", L("Barrier.walking")], ["slow", L("Barrier.slow")], ["running", L("Barrier.running")]]))
    + row(L("Barrier.Effect"), select("effect", [["paralysis", L("Barrier.paralysis")], ["agony", L("Barrier.agony")], ["seizure", L("Barrier.seizure")], ["moderatePain", L("Barrier.moderatePain")]])),
    (form) => ({ kind: value(form, "kind")?.value ?? "laserFence", tight: Boolean(value(form, "tight")?.checked), speed: (value(form, "speed")?.value ?? "walking") as "walking" | "slow" | "running", effect: value(form, "effect")?.value ?? "paralysis" }));
  if (!answer) return;
  if (answer.kind === "dreamNetRemoval") return void pullFromDreamNet(api, targets);
  const barrier = BARRIERS[answer.kind];
  if (!barrier) return;
  for (const victim of targets) {
    const lines: string[] = [];
    const name = String(victim.name ?? "");
    const derived = api.actors.derived(victim) ?? {};
    const sealed = derived.traitEffects?.sealed === true;
    // An open fence or cutting wire can be got past with a roll (pp. 101-102).
    if (barrier.avoid && !(barrier.fence && answer.tight)) {
      const best = barrier.avoid.attribute
        ? api.actors.attribute(victim, barrier.avoid.attribute) ?? 10
        : Math.max(...barrier.avoid.skills.map((skill) => level(api, victim, skill, { attribute: "DX", modifier: -5 })));
      const result: any = await api.roll.success({ actor: victim, base: best, label: F("Barrier.Avoid", { barrier: L(`Barrier.${answer.kind}`) }), modifiers: [{ label: L(`Barrier.${answer.kind}`), value: barrier.avoid.modifier }] } as any);
      if (result?.success) {
        await say(victim, L(`Barrier.${answer.kind}`), [F("Barrier.Avoided", { name })]);
        continue;
      }
    }
    if (barrier.sealedImmune && (sealed || traitNames(victim).some((n) => /^digital mind\b/i.test(n)))) {
      await say(victim, L(`Barrier.${answer.kind}`), [F("Barrier.Immune", { name })]);
      continue;
    }
    if (barrier.affliction) {
      const base = api.actors.attribute(victim, barrier.affliction.attribute) ?? 10;
      const modifiers = [{ label: L(`Barrier.${answer.kind}`), value: barrier.affliction.modifier }];
      if (answer.kind === "neuralDisruptorField" && sealed) {
        const dr = Number(derived.drByLocation?.torso) || 0;
        const bonus = neuralFieldModifier(dr) - barrier.affliction.modifier;
        if (bonus) modifiers.push({ label: L("Barrier.SealedArmor"), value: bonus });
      }
      const result: any = await api.roll.success({ actor: victim, base, kind: "attribute", label: F("Barrier.Resist", { barrier: L(`Barrier.${answer.kind}`) }), modifiers, tags: ["resist", "affliction"] } as any);
      if (result && !result.success) {
        const effect = answer.kind === "electrolaserFence" ? "stunned" : answer.kind === "neuralDisruptorField" ? answer.effect : barrier.affliction.effect;
        await api.actors.applyCondition(victim, { key: effect } as any);
        lines.push(F(answer.kind === "neuralDisruptorField" ? "Barrier.AfflictedMinutes" : "Barrier.Afflicted", { name, effect: L(`Barrier.${effect}`), minutes: result.margin }));
        if (answer.kind === "dreamNet") lines.push(L("Barrier.DreamNetRemoval"));
      } else if (result) lines.push(F("Barrier.Resisted", { name }));
    }
    if (barrier.damage) {
      const formula = answer.kind === "monowire" ? monowireDice(answer.speed) : barrier.damage.formula;
      await api.roll.damage({
        actor: victim,
        label: F("Barrier.DamageLabel", { barrier: L(`Barrier.${answer.kind}`), name }),
        formula,
        damageType: barrier.damage.type,
        armorDivisor: barrier.damage.divisor,
        radiation: barrier.damage.radiation,
        ignoresDr: barrier.damage.ignoresDr,
        massMultiplier: barrier.damage.multiplier,
      } as any);
    }
    if (lines.length) await say(victim, L(`Barrier.${answer.kind}`), lines);
  }
}

/** Pulled out of a dream net without shutting it off (p. 103): a Will roll against stun or 1d hours out. */
async function pullFromDreamNet(api: GWorldApi, targets: any[]): Promise<void> {
  for (const victim of targets) {
    const result: any = await api.roll.success({ actor: victim, base: api.actors.attribute(victim, "Will") ?? 10, kind: "attribute", label: L("Barrier.RemovalLabel") } as any);
    if (!result) continue;
    const outcome = dreamNetRemoval(result);
    if (outcome.unconsciousDice) {
      const roll = new Roll(outcome.unconsciousDice);
      await roll.evaluate();
      await api.actors.applyCondition(victim, { key: "unconscious", duration: { seconds: Number(roll.total) * 3600 } } as any);
      await say(victim, L("Barrier.dreamNetRemoval"), [F("Barrier.RemovalOut", { name: victim.name, hours: roll.total })]);
    } else if (outcome.stunnedSeconds) {
      await api.actors.applyCondition(victim, { key: "stunned", duration: { seconds: outcome.stunnedSeconds } } as any);
      await say(victim, L("Barrier.dreamNetRemoval"), [F("Barrier.RemovalStunned", { name: victim.name, seconds: outcome.stunnedSeconds })]);
    } else await say(victim, L("Barrier.dreamNetRemoval"), [F("Barrier.RemovalFine", { name: victim.name })]);
  }
}

function securityItemLines(item: any): string[] {
  const name = String(item?.name ?? "");
  const tl = tlOf(item?.actor?.system?.tl) ?? tlOf(item?.system?.tl) ?? 9;
  const lines: string[] = [];
  const safe = SAFES[name];
  if (safe) lines.push(F("Item.Safe", { dr: safeDr(safe.dr, tl), hp: safe.hp, tl }));
  if (/^armored doors?$/i.test(name)) lines.push(F("Item.Door", { dr: doorDr(tl), tl }));
  if (name in LOCKS) lines.push(F("Item.Lock", { modifier: LOCKS[name] }));
  const restraint = restraintByName(name);
  if (restraint) {
    const figures = restraintFigures(restraint, tlOf(item?.system?.tl) ?? 9);
    lines.push(F(restraint === "cuffs" || restraint === "heavyCuffs" ? "Item.Cuffs" : "Item.Tape", { ...figures, severed: CUFFTAPE_SEVERED }));
  }
  if (/^explosive collar$/i.test(name)) lines.push(L("Item.Collar"));
  const perPost = Number(item?.system?.listCost) || Number(item?.system?.cost) || 0;
  if (/Fence$/i.test(name) && perPost) lines.push(F("Item.Fence", { open: fenceCost(perPost, 1, false), tight: fenceCost(perPost, 1, true) }));
  if (/^Monowire/i.test(name)) lines.push(F("Item.Monowire", { unaware: monowireSpotting(false), looking: monowireSpotting(true) }));
  if (/^Verifier Software$/i.test(name)) lines.push(F("Item.Verifier", { skill: VERIFIER_SKILL }));
  if (/brainwipe/i.test(name)) lines.push(L("Item.Brainwipe"));
  return lines;
}

// ── restraints ──

const RESISTED = /^(power-damper band|power-damping field|neuronic restraints|neural pacifier)$/i;

async function breakFree(api: GWorldApi, item: any, actor: any): Promise<void> {
  const kind = restraintByName(String(item.name));
  if (!kind) return;
  const figures = restraintFigures(kind, tlOf(item.system?.tl) ?? 9);
  const cuffs = kind === "cuffs" || kind === "heavyCuffs";
  const answer = await ask(L("Break.Title"),
    row(L("Break.Method"), select("method", [["st", F("Break.St", { st: figures.st })], ["escape", L("Break.Escape")]]))
    + (cuffs ? row(L("Break.ArmsAndLegs"), `<input type="checkbox" name="both" />`) + row(L("Break.Attempt"), `<input type="number" name="attempt" value="1" min="1" style="width:60px" />`) : ""),
    (form) => ({ method: value(form, "method")?.value ?? "st", both: Boolean(value(form, "both")?.checked), attempt: Number(value(form, "attempt")?.value) || 1 }));
  if (!answer) return;
  let freed = false;
  if (answer.method === "st") {
    const st = api.actors.attribute(actor, "ST") ?? 10;
    const outcome: any = await api.roll.quickContest({ label: F("Break.Label", { name: item.name }), first: { actor, base: st }, second: { actor, base: figures.st, note: String(item.name) }, tags: ["ut-restraint"] });
    freed = outcome?.outcome === "first";
    if (freed && (kind === "razortape" || kind === "monowireRazortape")) {
      const thrust = String(api.actors.derived(actor)?.thrust ?? api.actors.derived(actor)?.damage?.thrust ?? "1d-2");
      const cut = razortapeDamage(kind, thrust);
      await api.roll.damage({ actor, label: F("Break.Razor", { name: item.name }), formula: cut.formula, damageType: "cut", armorDivisor: cut.divisor } as any);
    }
  } else {
    const base = level(api, actor, "Escape", { attribute: "DX", modifier: -6 });
    const modifiers = cuffs ? [{ label: L(answer.both ? "Break.BothCuffed" : "Break.Cuffed"), value: cuffEscapeModifier(answer.both) }] : [];
    const result: any = await api.roll.success({ actor, base, skill: "Escape", label: F("Break.Label", { name: item.name }), modifiers } as any);
    freed = Boolean(result?.success);
  }
  const lines = [F(freed ? "Break.Freed" : "Break.Held", { name: actor.name, restraint: item.name })];
  if (cuffs) lines.push(F("Break.Time", { seconds: struggleSeconds(answer.attempt) }));
  if (!freed && (kind === "cufftape" || kind === "razortape" || kind === "monowireRazortape")) {
    await api.actors.applyInjury(actor, { amount: CUFFTAPE_FAILURE_DAMAGE, label: String(item.name) });
    lines.push(F("Break.Chafed", { name: actor.name }));
  }
  await say(actor, L("Break.Title"), lines);
}

async function resistDevice(api: GWorldApi, item: any, actor: any): Promise<void> {
  const name = String(item.name);
  const tl = tlOf(item.system?.tl) ?? 9;
  if (/^power-damp/i.test(name)) {
    const answer = await ask(L("Resist.Title"), row(L("Resist.Talent"), `<input type="number" name="talent" value="0" min="0" style="width:60px" />`), (form) => Number(value(form, "talent")?.value) || 0);
    if (answer === null) return;
    const will = api.actors.attribute(actor, "Will") ?? 10;
    const outcome: any = await api.roll.quickContest({
      label: F("Resist.DamperLabel", { name }),
      first: { actor, base: will, modifiers: answer ? [{ label: L("Resist.TalentLine"), value: answer }] : [] },
      second: { actor, base: damperWill(/field/i.test(name), tl), note: name },
      tags: ["ut-power-damper"],
    });
    await say(actor, name, [outcome?.outcome === "first" ? F("Resist.DamperBurnt", { name: actor.name }) : F("Resist.DamperHeld", { name: actor.name, hours: Math.max(1, Number(outcome?.marginOfVictory) || 1) })]);
    return;
  }
  if (/^neuronic/i.test(name)) {
    const inTank = await ask(L("Resist.Title"), row(L("Resist.InTank"), `<input type="checkbox" name="tank" />`), (form) => Boolean(value(form, "tank")?.checked));
    if (inTank === null) return;
    const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "HT") ?? 10, kind: "attribute", label: F("Resist.Label", { name }), modifiers: [{ label: name, value: neuronicModifier(inTank) }], tags: ["resist", "affliction"] } as any);
    await say(actor, name, [result?.success ? F("Resist.Resisted", { name: actor.name }) : F("Resist.Neurolashed", { name: actor.name })]);
    return;
  }
  if (/^neural pacifier/i.test(name)) {
    const setting = await ask(L("Resist.Title"), row(L("Resist.Setting"), select("setting", [["sleep", L("Resist.sleep")], ["control", L("Resist.control")]])), (form) => value(form, "setting")?.value ?? "sleep");
    if (!setting) return;
    const target = pacifierTarget(api.actors.attribute(actor, "HT") ?? 10, api.actors.attribute(actor, "Will") ?? 10);
    const result: any = await api.roll.success({ actor, base: target, kind: "attribute", label: F("Resist.Label", { name }), tags: ["resist"] } as any);
    if (result && !result.success) {
      if (setting === "sleep") await api.actors.applyCondition(actor, { key: "unconscious" } as any);
      else await api.actors.applyCondition(actor, { module: MODULE_ID, key: "ut-pacified", label: L("Resist.Pacified") } as any);
    }
    await say(actor, name, [result?.success ? F("Resist.Resisted", { name: actor.name }) : F(`Resist.Pacifier.${setting}`, { name: actor.name })]);
  }
}

// ── interrogation ──

async function neuralProgramming(api: GWorldApi): Promise<void> {
  const { selected: operator, targets } = picked();
  const subject = targets[0];
  if (!operator || !subject) return void ui.notifications?.warn(L("Programmer.Pick"));
  const answer = await ask(L("Programmer.Title"),
    row(L("Programmer.Points"), `<input type="number" name="points" value="-10" step="1" style="width:70px" />`)
    + row(L("Programmer.Software"), select("complexity", [["7", L("Programmer.basic")], ["9", L("Programmer.good")], ["11", L("Programmer.fine")]])),
    (form) => ({ points: Number(value(form, "points")?.value) || 0, complexity: Number(value(form, "complexity")?.value) || 7 }));
  if (!answer) return;
  const skill = level(api, operator, "Brainwashing", { attribute: "IQ", modifier: -99 });
  const modifiers = [{ label: L("Programmer.Disadvantage"), value: neuralProgrammingModifier(answer.points) }];
  const quality = neuralProgrammerQuality(answer.complexity);
  if (quality) modifiers.push({ label: L("Programmer.Quality"), value: quality });
  const outcome: any = await api.roll.regularContest({
    label: F("Programmer.Label", { name: subject.name }),
    first: { actor: operator, base: Math.max(0, skill), modifiers },
    second: { actor: subject, base: api.actors.attribute(subject, "Will") ?? 10 },
  });
  await say(operator, L("Programmer.Title"), [F(outcome?.outcome === "first" ? "Programmer.Won" : "Programmer.Lost", { name: subject.name, days: outcome?.exchanges ?? 1 })]);
}

async function mindProbe(api: GWorldApi): Promise<void> {
  const { selected: operator, targets } = picked();
  const subject = targets[0];
  if (!operator || !subject) return void ui.notifications?.warn(L("Probe.Pick"));
  const campaign = tlOf(operator?.system?.tl) ?? 10;
  const answer = await ask(L("Probe.Title"),
    row(L("Probe.Speed"), select("speed", [["slow", L("Probe.slow")], ["fast", L("Probe.fast")]]))
    + row(L("Probe.Tl"), `<input type="number" name="tl" value="${Math.max(10, campaign)}" min="10" max="12" style="width:60px" />`),
    (form) => ({ fast: value(form, "speed")?.value === "fast", tl: Number(value(form, "tl")?.value) || 10 }));
  if (!answer) return;
  const skill = level(api, operator, "Electronics Operation (Medical)", { attribute: "IQ", modifier: -5 });
  const result: any = await api.roll.success({ actor: operator, base: skill, skill: "Electronics Operation (Medical)", label: F("Probe.Label", { name: subject.name, hours: mindProbeHours(answer.fast, answer.tl) }) } as any);
  if (!result) return;
  const lines = [F(`Probe.${mindProbeResult(result)}`, { name: subject.name })];
  if (answer.fast) {
    const risk: any = await api.roll.success({ actor: subject, base: fastProbeTarget(api.actors.attribute(subject, "HT") ?? 10, skill), kind: "attribute", label: L("Probe.Risk") } as any);
    if (risk?.criticalFailure) {
      await api.actors.applyCondition(subject, { key: "coma" } as any);
      lines.push(F("Probe.Coma", { name: subject.name }));
    } else if (risk && !risk.success) lines.push(F("Probe.BrainDamage", { name: subject.name }));
  }
  await say(operator, L("Probe.Title"), lines);
}

/** The best sensory restraint a subject is wearing, and its bonus. */
function wornRestraint(actor: any): { name: string; bonus: number } | null {
  let best: { name: string; bonus: number } | null = null;
  for (const item of actor?.items ?? []) {
    if (!isGear(item) || item.system?.equipped !== true) continue;
    const bonus = sensoryRestraintBonus(String(item.name));
    if (bonus > (best?.bonus ?? 0)) best = { name: String(item.name), bonus };
  }
  return best;
}

export function readySecurity(api: GWorldApi, on: SecuritySwitches): void {
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-barrier", label: L("Barrier.Title"), icon: "fa-solid fa-road-barrier", visible: on.security, open: () => runBarrier(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-neural-programmer", label: L("Programmer.Title"), icon: "fa-solid fa-brain", visible: on.interrogation, open: () => neuralProgramming(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-mind-probe", label: L("Probe.Title"), icon: "fa-solid fa-head-side-virus", visible: on.interrogation, open: () => mindProbe(api) });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-security-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-security-item.hbs`,
    visible: (item) => (on.security() || on.restraints() || on.interrogation()) && isGear(item) && securityItemLines(item).length > 0,
    context: (item) => ({ lines: securityItemLines(item) }),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-break-free",
    itemTypes: ["equipment"],
    label: L("Break.Title"),
    icon: "fa-solid fa-link-slash",
    visible: (item) => on.restraints() && restraintByName(String(item?.name)) !== null,
    run: (item, actor) => breakFree(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-resist-device",
    itemTypes: ["equipment"],
    label: L("Resist.Title"),
    icon: "fa-solid fa-hand-fist",
    visible: (item) => on.restraints() && RESISTED.test(String(item?.name ?? "")),
    run: (item, actor) => resistDevice(api, item, actor),
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!on.interrogation() || !actor) return;
    if (/^interrogation\b/i.test(skill)) {
      const subject = context.opponent ?? picked().targets[0] ?? null;
      const worn = subject ? wornRestraint(subject) : null;
      // The grade of a restraint the interrogator carries already counts; only the wearer's is added.
      const carried = [...(actor.items ?? [])].some((i: any) => isGear(i) && sensoryRestraintBonus(String(i.name)) > 0 && i.system?.carried !== false);
      if (worn && !carried) context.modifiers.push({ label: F("Interrogation.Worn", { name: worn.name }), value: worn.bonus });
    }
    if (/^detect lies\b/i.test(skill)) {
      const veridicator = [...(actor.items ?? [])].find((i: any) => isGear(i) && /^veridicator (helmet|program)$/i.test(String(i.name)) && i.system?.carried !== false);
      if (veridicator) context.modifiers.push({ label: F("Interrogation.Veridicator", { name: veridicator.name }), value: veridicatorBonus(tlOf(veridicator.system?.tl) ?? 10) });
    }
  });

}
