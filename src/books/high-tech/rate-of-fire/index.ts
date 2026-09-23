/**
 * High-Tech's rate-of-fire rules (pp. 82-84, 250-252), registered with the
 * system through the add-on API under four switches. The rules themselves
 * are in `rules.ts`.
 *
 *   - **Trigger mechanisms:** a gun's trigger is a field on it, blank to work
 *     it out (a revolver at RoF 1 is single-action, one at RoF 2+
 *     double-action, anything else single-action). A double-action gun's
 *     aimed shot takes -1 unless it was cocked first; a DAO gun's Acc is a
 *     point lower on its rows.
 *   - **Burst fire:** a gun with a fire selector changes setting from its row
 *     (a Ready maneuver in combat, unless its double or progressive trigger
 *     switches at once); single shots are RoF 3; a limited-burst gun fires
 *     whole bursts, up to three, and can't spray; a high-cyclic gun ("#")
 *     counts hits at Rcl 1 and can't suppress.
 *   - **Fast-firing:** a gun of RoF 2 or 3 pulled up to RoF 6, at -4 (the
 *     technique buys it off) and +2 or +4 Rcl at RoF 5 and 6; a single-action
 *     revolver cocked with the off thumb, RoF 2 free and up to 4 at -2.
 *   - **Fanning and thumbing:** a single-action revolver fanned at RoF 2-5 or
 *     thumbed at RoF 2, with their penalties, the no-aiming rule and the
 *     critical failures; a tied-back or removed trigger leaves nothing else.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { isFirearm, techniqueRelative } from "../firearms/index.js";
import {
  FANNING_PENALTY,
  FANNING_RATES,
  FAST_FIRING_PENALTY,
  FIRE_SETTINGS,
  MAX_BURSTS,
  THUMBING_PENALTY,
  THUMBING_RATE,
  TRIGGERS,
  TRIGGER_TIES,
  TWO_HANDED_PENALTY,
  burstShots,
  doubleActionAimPenalty,
  doubleActionOnlyAccuracy,
  fanned,
  fanningFumble,
  fastFired,
  fastFiringRates,
  fireSettings,
  looksLikeRevolver,
  nextFireSetting,
  resistsAccidentalDischarge,
  settingRow,
  thumbed,
  workedOutBurstLimit,
  workedOutTrigger,
  type FireSetting,
  type RateOfFire,
  type Trigger,
  type TriggerTie,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.RateOfFire.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.RateOfFire.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "firearm";
const REVOLVER_SETTINGS = ["", "yes", "no"] as const;
const COCKED = "ht-cocked";
const BURSTS = "ht-bursts";
const FAST_FIRING = "ht-fast-firing";
const FANNING = "ht-fanning";
const THUMBING = "ht-thumbing";
const option = (key: string) => `${MODULE_ID}.${key}`;

export interface RateOfFireSwitches {
  triggers: () => boolean;
  bursts: () => boolean;
  fastFiring: () => boolean;
  fanning: () => boolean;
}

/** What the book's other shooting rules bring to these (pp. 84, 249). */
export interface RateOfFireHelpers {
  /** Why a gun can't be fanned or thumbed just now (the two-handed stance), or null. */
  noFanning?: (item: any) => string | null;
  /** A technique's default penalty for a shooter who doesn't know it, where another rule changes it; null for the book's. */
  techniqueDefault?: (actor: any, technique: string, penalty: number) => number | null;
}

/** What this module keeps on a gun for these rules, beside #364's fields on the same `firearm` object. */
export interface RateOfFireData {
  /** Blank to work it out from the statistics (p. 82). */
  trigger: Trigger | "";
  /** Whether it is a revolver: blank to work it out. */
  revolver: (typeof REVOLVER_SETTINGS)[number];
  /** Rounds per limited burst (p. 83): 0 for none, or the "#" mark's own. */
  burstLimit: number;
  /** A double or progressive trigger that changes setting at once (p. 83). */
  instantSelector: boolean;
  triggerTie: TriggerTie;
}

/** The fields, added to the gun's `firearm` data by `initFirearms`. */
export function rateOfFireFields(f: any): Record<string, unknown> {
  return {
    trigger: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...TRIGGERS] }),
    revolver: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...REVOLVER_SETTINGS] }),
    burstLimit: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max: 10 }),
    instantSelector: new f.BooleanField({ initial: false }),
    triggerTie: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...TRIGGER_TIES] }),
  };
}

export function rateOfFireData(item: any): RateOfFireData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    trigger: TRIGGERS.includes(d.trigger) ? d.trigger : "",
    revolver: REVOLVER_SETTINGS.includes(d.revolver) ? d.revolver : "",
    burstLimit: Math.max(0, Math.floor(Number(d.burstLimit) || 0)),
    instantSelector: Boolean(d.instantSelector),
    triggerTie: TRIGGER_TIES.includes(d.triggerTie) ? d.triggerTie : "",
  };
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const modeOf = (item: any, index = 0): any => rangedModes(item)[index] ?? rangedModes(item)[0] ?? {};

/** A mode's Rate of Fire as the table printed it. */
function rofOf(mode: any): RateOfFire {
  return {
    rateOfFire: Math.max(1, Number(mode?.rateOfFire) || 1),
    mark: String(mode?.rateOfFireMark ?? ""),
    second: Math.max(0, Number(mode?.rateOfFireSecond) || 0),
    secondMark: String(mode?.rateOfFireSecondMark ?? ""),
  };
}

const factsOf = (mode: any) => ({ skill: String(mode?.skill ?? ""), shots: String(mode?.shots ?? ""), rateOfFire: Number(mode?.rateOfFire) || 1 });

export function isRevolver(item: any): boolean {
  const own = rateOfFireData(item).revolver;
  return own ? own === "yes" : looksLikeRevolver(factsOf(modeOf(item)));
}

/** The gun's trigger: its own, or worked out. */
export function triggerOf(item: any): Trigger {
  return rateOfFireData(item).trigger || workedOutTrigger(isRevolver(item), Number(modeOf(item).rateOfFire) || 1);
}

/** A single-action revolver of RoF 1 in this mode, which fanning, thumbing and two-handed cocking are for (pp. 83-84). */
function singleActionRevolver(item: any, modeIndex = 0): boolean {
  return isRevolver(item) && triggerOf(item) === "sa" && (Number(modeOf(item, modeIndex).rateOfFire) || 1) <= 1;
}

/** Rounds per limited burst in a mode's listed setting. */
function burstLimitOf(item: any, mode: any): number {
  return rateOfFireData(item).burstLimit || workedOutBurstLimit(rofOf(mode));
}

/** The selector's setting, kept on the gun. */
function settingOf(api: GWorldApi, item: any): FireSetting {
  const kept = (api.combat.getWeaponState(item, MODULE_ID) as any)?.fire;
  return FIRE_SETTINGS.includes(kept) && fireSettings(rofOf(modeOf(item))).includes(kept) ? kept : "primary";
}

/** A mode fires full-auto in any setting: fast-firing isn't for it (p. 84). */
const fullAuto = (mode: any) => { const r = rofOf(mode); return r.rateOfFire > 3 || r.second > 3; };

/** The RoFs this mode may be fast-fired at, as the switches and the gun stand. */
function fastRates(api: GWorldApi, item: any, modeIndex = 0): number[] {
  const mode = modeOf(item, modeIndex);
  const limited = settingOf(api, item) === "primary" && burstLimitOf(item, mode) > 0;
  return fastFiringRates({ rateOfFire: rofOf(mode).rateOfFire, fullAuto: fullAuto(mode), burstLimited: limited, singleActionRevolver: singleActionRevolver(item, modeIndex) });
}

const chosen = (values: Record<string, unknown> | undefined, key: string): unknown => values?.[option(key)];
const picked = (value: unknown): number => Math.floor(Number(value) || 0);

/** An attack's accuracy from aiming, as the system's lines give it (0 for an unaimed shot). */
function accuracyGiven(modifiers: any[]): number {
  return (modifiers ?? []).filter((m) => m?.key === "accuracy").reduce((sum, m) => sum + (Number(m.value) || 0), 0);
}
const aimed = (modifiers: any[]) => (modifiers ?? []).some((m) => m?.key === "accuracy" || m?.key === "aim" || m?.key === "braced");

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** A die rolled as the system's dice are, for a listener that can't wait on a Roll. */
const d6 = () => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;

const inCombat = (actor: any): boolean => Boolean((game as any).combat?.started) && Boolean((game as any).combat?.combatants?.some?.((c: any) => c?.actor?.id === actor?.id));

/** Moves a gun's selector to its next setting: a Ready maneuver in combat, unless its trigger switches at once (p. 82). */
export async function switchFireSetting(api: GWorldApi, item: any, actor: any): Promise<FireSetting | null> {
  const settings = fireSettings(rofOf(modeOf(item)));
  if (settings.length < 2) return null;
  const instant = rateOfFireData(item).instantSelector;
  if (!instant && inCombat(actor) && String(actor?.system?.maneuver ?? "") !== "ready") {
    ui.notifications?.warn(F("SelectorNeedsReady", { gun: String(item?.name ?? "") }));
    return null;
  }
  const next = nextFireSetting(settings, settingOf(api, item));
  await api.combat.setWeaponState(item, MODULE_ID, { fire: next });
  const rof = settingRow(next, rofOf(modeOf(item)), burstLimitOf(item, modeOf(item))).rateOfFire;
  await say(actor, String(item?.name ?? ""), [F("SelectorSet", { setting: L(`Setting.${next}`), rof }), L(instant ? "SelectorInstant" : "SelectorReady")]);
  return next;
}

/** The item sheet section's data. */
function itemContext(api: GWorldApi, item: any, on: RateOfFireSwitches): Record<string, unknown> {
  const data = rateOfFireData(item);
  const mode = modeOf(item);
  const revolver = isRevolver(item);
  const worked = workedOutTrigger(revolver, Number(mode.rateOfFire) || 1);
  const trigger = triggerOf(item);
  const context: Record<string, unknown> = { editable: item.isOwner };
  context.trigger = {
    options: [
      { value: "", label: F("Trigger.auto", { trigger: L(`Trigger.${worked}`) }), selected: data.trigger === "" },
      ...TRIGGERS.map((t) => ({ value: t, label: L(`Trigger.${t}`), selected: data.trigger === t })),
    ],
    revolver: REVOLVER_SETTINGS.map((r) => ({ value: r, label: r ? L(`Revolver.${r}`) : F("Revolver.auto", { answer: L(`Revolver.${looksLikeRevolver(factsOf(mode)) ? "yes" : "no"}`) }), selected: data.revolver === r })),
    lines: [
      ...(on.triggers() ? [L(`TriggerLine.${trigger}`)] : []),
      ...(on.triggers() && resistsAccidentalDischarge(trigger) ? [L("SafeLine")] : []),
    ],
  };
  if (on.bursts()) {
    const settings = fireSettings(rofOf(mode));
    const limit = burstLimitOf(item, mode);
    context.bursts = {
      burstLimit: data.burstLimit,
      selector: settings.length > 1,
      instantSelector: data.instantSelector,
      lines: [
        ...(settings.length > 1 ? [F("SettingsLine", { settings: settings.map((s) => L(`Setting.${s}`)).join(", "), current: L(`Setting.${settingOf(api, item)}`) })] : []),
        ...(limit ? [F("BurstLine", { limit, shots: burstShots(limit, rofOf(mode).rateOfFire).join(", ") })] : []),
        ...(rofOf(mode).mark === "#" ? [L("HighCyclicLine")] : []),
      ],
    };
  }
  if (on.fanning() && revolver) {
    context.tie = {
      options: TRIGGER_TIES.map((t) => ({ value: t, label: L(`Tie.${t || "none"}`), selected: data.triggerTie === t })),
    };
  }
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-rof]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtRof);
      if (input instanceof HTMLInputElement && input.type === "checkbox") await item.update({ [`${path}.${key}`]: input.checked });
      else if (key === "burstLimit") await item.update({ [`${path}.${key}`]: Math.max(0, Math.min(10, Math.floor(Number(input.value) || 0))) });
      else await item.update({ [`${path}.${key}`]: input.value });
    });
  });
}

/** What an attack with fanning or thumbing leaves to follow its roll (p. 83), by actor. */
const pending = new Map<string, { kind: "fanning" | "thumbing"; gun: string }>();

export function readyRateOfFire(api: GWorldApi, on: RateOfFireSwitches, helpers: RateOfFireHelpers = {}): void {
  const any = () => on.triggers() || on.bursts() || on.fastFiring() || on.fanning();
  // A technique's level relative to the skill, or its default where the shooter doesn't know it.
  const relativeFor = (actor: any, skill: string, name: RegExp, technique: string, penalty: number) =>
    techniqueRelative(api, actor, skill, name, penalty) ?? helpers.techniqueDefault?.(actor, technique, penalty) ?? null;

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-rate-of-fire-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-rate-of-fire-item.hbs`,
    visible: (item) => any() && isFirearm(api, item),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // The fire selector, from the gun's row (p. 82).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-fire-selector",
    itemTypes: ["equipment"],
    label: L("Selector"),
    icon: "fa-solid fa-sliders",
    visible: (item) => on.bursts() && isFirearm(api, item) && fireSettings(rofOf(modeOf(item))).length > 1,
    run: (item, actor) => { void switchFireSetting(api, item, actor); },
  });

  // The rows: DAO's Acc, the selector's setting, limited and high-cyclic bursts, a tied trigger.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!any() || !isFirearm(api, item)) return;
    const trigger = triggerOf(item);
    const setting = settingOf(api, item);
    const tie = rateOfFireData(item).triggerTie;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const { row, mode } = entry;
      if (on.triggers() && trigger === "dao") {
        row.accuracy = doubleActionOnlyAccuracy(Number(row.accuracy) || 0);
        row.notes?.push?.({ label: L("DaoNote"), hint: L("TriggerLine.dao") });
      }
      if (on.bursts()) {
        const rof = rofOf(mode);
        const settings = fireSettings(rof);
        const figures = settingRow(settings.includes(setting) ? setting : "primary", rof, burstLimitOf(item, mode));
        row.rateOfFire = figures.rateOfFire;
        if (figures.recoil !== null) row.recoil = figures.recoil;
        if (figures.noSprayingFire) row.noSprayingFire = true;
        if (figures.noSuppressionFire) row.noSuppressionFire = true;
        if (settings.length > 1) row.notes?.push?.({ label: F("SettingNote", { setting: L(`Setting.${setting}`) }), hint: L("SelectorHint") });
        if (figures.burstLimit) row.notes?.push?.({ label: F("BurstNote", { limit: figures.burstLimit }), hint: F("BurstLine", { limit: figures.burstLimit, shots: burstShots(figures.burstLimit, figures.rateOfFire).join(", ") }) });
      }
      if (on.fanning() && tie) row.notes?.push?.({ label: L(`Tie.${tie}`), hint: L("TieHint") });
    }
  });

  // ── the attack dialog's options ──

  // A double-action gun cocked for a single-action first shot: no -1 on an aimed shot; a revolver fires just that one (p. 82).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: COCKED,
    label: L("Cocked"),
    attack: "ranged",
    available: (context) => on.triggers() && isFirearm(api, context.item) && triggerOf(context.item) === "da",
    refuse: (context) => (chosen(context.chosen, FAST_FIRING) ? L("CockedNotFast") : null),
    apply: (context) => (isRevolver(context.item) ? { rateOfFire: 1, notes: [L("CockedRevolverNote")] } : null),
  });

  // Whole bursts from a limited-burst gun, up to three (p. 83). A select with no blank, so it is always applied.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: BURSTS,
    label: L("Bursts"),
    attack: "ranged",
    input: { type: "select", choices: Array.from({ length: MAX_BURSTS }, (_, i) => ({ value: String(i + 1), label: F("BurstsChoice", { bursts: i + 1 }) })) },
    available: (context) => on.bursts() && isFirearm(api, context.item) && settingOf(api, context.item) === "primary" && burstLimitOf(context.item, modeOf(context.item)) > 0,
    apply: (context, value) => {
      const mode = modeOf(context.item);
      const limit = burstLimitOf(context.item, mode);
      const shots = burstShots(limit, rofOf(mode).rateOfFire);
      const rof = shots[Math.max(0, Math.min(shots.length, picked(value)) - 1)] ?? limit;
      return { rateOfFire: rof, notes: [F("BurstsNote", { bursts: rof / limit, limit, shots: rof })] };
    },
  });

  // Fast-firing (p. 84), or two-handed cocking of a single-action revolver.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: FAST_FIRING,
    label: L("FastFiring"),
    attack: "ranged",
    input: { type: "select", choices: [{ value: "", label: L("NotUsed") }, ...[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: F("RofChoice", { rof: n }) }))] },
    available: (context) => on.fastFiring() && isFirearm(api, context.item) && fastRates(api, context.item).length > 0,
    refuse: (context) => (chosen(context.chosen, FANNING) || chosen(context.chosen, THUMBING) ? L("NotWithFanning") : null),
    apply: (context, value) => {
      const rof = picked(value);
      if (!fastRates(api, context.item).includes(rof)) return null;
      const twoHanded = singleActionRevolver(context.item);
      const skill = String(modeOf(context.item).skill ?? "");
      const relative = twoHanded
        ? relativeFor(context.actor, skill, /^two-handed thumbing\b/i, "Two-Handed Thumbing", TWO_HANDED_PENALTY)
        : relativeFor(context.actor, skill, /^fast-firing\b/i, "Fast-Firing", FAST_FIRING_PENALTY);
      const effect = fastFired(rof, twoHanded, relative);
      return {
        rateOfFire: rof,
        ...(effect.recoilModifier ? { recoilModifier: effect.recoilModifier } : {}),
        modifiers: effect.penalty ? [{ label: L(twoHanded ? "TwoHandedLine" : "FastFiringLine"), value: effect.penalty }] : [],
        notes: [L(twoHanded ? "TwoHandedNote" : "FastFiringNote")],
      };
    },
  });

  // Fanning (p. 83): RoF 2-5, -4 the technique buys off and -2 a step above 2 it doesn't; +2 Rcl at RoF 5.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: FANNING,
    label: L("Fanning"),
    attack: "ranged",
    input: { type: "select", choices: [{ value: "", label: L("NotUsed") }, ...FANNING_RATES.map((n) => ({ value: String(n), label: F("RofChoice", { rof: n }) }))] },
    available: (context) => on.fanning() && isFirearm(api, context.item) && singleActionRevolver(context.item),
    refuse: (context) => helpers.noFanning?.(context.item) ?? (chosen(context.chosen, THUMBING) || chosen(context.chosen, FAST_FIRING) ? L("NotWithFanning") : null),
    apply: (context, value) => {
      const rof = picked(value);
      if (!(FANNING_RATES as readonly number[]).includes(rof)) return null;
      const skill = String(modeOf(context.item).skill ?? "");
      const technique = fanned(2, relativeFor(context.actor, skill, /^fanning\b/i, "Fanning", FANNING_PENALTY)).penalty;
      const effect = fanned(rof, relativeFor(context.actor, skill, /^fanning\b/i, "Fanning", FANNING_PENALTY));
      const modifiers = [
        ...(technique ? [{ label: L("FanningLine"), value: technique }] : []),
        ...(effect.penalty !== technique ? [{ label: F("FanningRofLine", { rof }), value: effect.penalty - technique }] : []),
      ];
      return { rateOfFire: rof, modifiers, ...(effect.recoilModifier ? { recoilModifier: effect.recoilModifier } : {}), notes: [L("FanningNote")] };
    },
  });

  // Thumbing (p. 83): RoF 2 at -2, which the technique buys off.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: THUMBING,
    label: L("Thumbing"),
    attack: "ranged",
    available: (context) => on.fanning() && isFirearm(api, context.item) && singleActionRevolver(context.item),
    refuse: (context) => helpers.noFanning?.(context.item) ?? (chosen(context.chosen, FANNING) || chosen(context.chosen, FAST_FIRING) ? L("NotWithFanning") : null),
    apply: (context) => {
      const skill = String(modeOf(context.item).skill ?? "");
      const effect = thumbed(relativeFor(context.actor, skill, /^thumbing\b/i, "Thumbing", THUMBING_PENALTY));
      return { rateOfFire: THUMBING_RATE, modifiers: effect.penalty ? [{ label: L("ThumbingLine"), value: effect.penalty }] : [], notes: [L("ThumbingNote")] };
    },
  });

  // On the roll: the mode rolled must be the one the options were for; DA's -1; fanning without aim; a tied trigger.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!any() || !context?.ranged || context.rollType !== "attack" || context.mode?.derived || !isFirearm(api, item)) return;
    const index = Number.isInteger(context.mode?.index) ? Number(context.mode.index) : 0;
    const options = context.options ?? {};
    const fanRof = picked(chosen(options, FANNING));
    const thumbing = chosen(options, THUMBING) === true;
    const fastRof = picked(chosen(options, FAST_FIRING));
    const key = String(context.actor?.uuid ?? "");
    pending.delete(key);

    if (on.fanning() && (fanRof || thumbing)) {
      if (!singleActionRevolver(item, index)) {
        context.refusal = L("NeedsSingleAction");
        return;
      }
      if (fanRof && aimed(context.modifiers)) {
        context.refusal = L("FanningNoAim");
        return;
      }
      pending.set(key, { kind: fanRof ? "fanning" : "thumbing", gun: String(item.name ?? "") });
    } else if (on.fanning() && rateOfFireData(item).triggerTie && isRevolver(item)) {
      context.refusal = F("TiedRefusal", { tie: L(`Tie.${rateOfFireData(item).triggerTie}`) });
      return;
    }
    if (on.fastFiring() && fastRof && !fastRates(api, item, index).includes(fastRof)) {
      context.refusal = F("FastFiringRefusal", { rof: fastRof, rates: fastRates(api, item, index).join(", ") || "-" });
      return;
    }
    if (on.triggers() && !fanRof && !thumbing) {
      const penalty = doubleActionAimPenalty(triggerOf(item), chosen(options, COCKED) === true, accuracyGiven(context.modifiers));
      if (penalty) context.modifiers.push({ label: L("DoubleActionLine"), value: penalty });
    }
  });

  // Fanning's and thumbing's failures (p. 83).
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    const key = String(actor?.uuid ?? "");
    if (!(context?.tags ?? []).includes("attack") || !pending.has(key)) return;
    const { kind, gun } = pending.get(key)!;
    pending.delete(key);
    const outcome = context.outcome ?? {};
    if (!on.fanning() || outcome.success || !actor?.isOwner) return;
    if (kind === "thumbing") {
      void say(actor, gun, [L(outcome.criticalFailure ? "ThumbingFumble" : "ThumbingFailed")]);
      return;
    }
    if (!outcome.criticalFailure) return;
    const die = d6();
    const fumble = fanningFumble(die, Number(outcome.margin) || 0);
    void say(actor, gun, [L("FanningNoShots"), F(fumble.dropped ? "FanningDropped" : "FanningBruised", { die, minutes: fumble.painMinutes })]);
    if (fumble.painMinutes > 0) {
      void api.actors.applyCondition(actor, { key: "moderatePain", duration: { seconds: fumble.painMinutes * 60 } } as any);
    }
  });
}
