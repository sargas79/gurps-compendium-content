/**
 * High-Tech's gun quality, care and Immediate Action (pp. 79-81, 129,
 * 249-251), registered with the system through the add-on API under three
 * switches. The rules themselves are in `rules.ts`.
 *
 *   - **Firearm quality:** accurate and reliable work as fields on a gun that
 *     reprice it and change its rows' Acc and Malf., taking the place of the
 *     Basic Set's fine and very fine grade on a gun while the switch is on; a
 *     gun reliable past Malf. 17 rolls a malfunction again.
 *   - **Gun care:** Malf. lost at default or without the ST, to a cloth belt,
 *     and (as the GM enters it) to abuse, age and hostile surroundings; Acc
 *     lost to abuse; a precision gun's HT roll against abuse; rugged guns'
 *     DR and HT as objects (`gworld.objectStats`, GWorld API 1.90.0), which
 *     breakage, damage to the gun and the exposure roll all read; and
 *     misfires and stoppages swapped for TL6-8 guns other than revolvers.
 *   - **Immediate Action:** clearing a stoppage at -4 (bought off by the
 *     technique), with the gun's TL and familiarity lines, in the Ready
 *     maneuvers its feed takes, with Armorer's Gift, Weapon Bond and an
 *     assistant gunner offered as aids.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import {
  ARMORERS_GIFT_BONUS,
  ASSISTANT_GUNNER_READIES,
  FEEDS,
  IMMEDIATE_ACTION_PENALTY,
  IMMEDIATE_ACTION_READIES,
  MALF_CEILING,
  PRECISION_ABUSE_MODIFIER,
  QUALITY_STEPS,
  RUGGEDNESS,
  WEAPON_BOND_BONUS,
  accurateBonus,
  allowedQuality,
  feedOf,
  immediateActionModifier,
  isFullAuto,
  malfunctionAfter,
  modernMalfunction,
  qualityCostMultiplier,
  qualityProblems,
  qualityStep,
  rerollMalfunctions,
  ruggedObjectStats,
  specialtyCovers,
  wearPenalty,
  type Feed,
  type FirearmQuality,
  type Ruggedness,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Firearm.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Firearm.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "firearm";

export interface FirearmSwitches {
  quality: () => boolean;
  care: () => boolean;
  immediateAction: () => boolean;
  /** Sustained fire, whose warped barrels keep their Acc lost in the same field (pp. 85-86). */
  sustainedFire?: () => boolean;
}

/** What this module keeps on a gun. */
export interface FirearmData extends FirearmQuality {
  /** Malf. and Acc lost to abuse, age and hostile surroundings, as the GM rules (p. 80). */
  malfunctionLost: number;
  accuracyLost: number;
  clothBelt: boolean;
  /** A sniper rifle or target pistol, which rolls HT against abuse (p. 80). */
  precision: boolean;
  rugged: Ruggedness;
  /** How it feeds, where its statistics don't say (p. 81); blank to work it out. */
  feed: Feed | "";
}

/**
 * Registers the fields this module keeps on a gun. `more` adds another rule's
 * fields to the same `firearm` object, so every gun rule of the book reads one
 * place (the rate-of-fire rules add theirs).
 */
export function initFirearms(more?: (fields: any) => Record<string, unknown>): void {
  const f = foundry.data.fields as any;
  const whole = (max: number) => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, max });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      accurate: whole(2),
      reliable: whole(2),
      malfunctionLost: whole(10),
      accuracyLost: whole(10),
      clothBelt: new f.BooleanField({ initial: false }),
      precision: new f.BooleanField({ initial: false }),
      rugged: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...RUGGEDNESS] }),
      feed: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...FEEDS] }),
      ...(more?.(f) ?? {}),
    }),
  });
}

export function firearmData(item: any): FirearmData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  return {
    accurate: qualityStep(d.accurate),
    reliable: qualityStep(d.reliable),
    malfunctionLost: count(d.malfunctionLost),
    accuracyLost: count(d.accuracyLost),
    clothBelt: Boolean(d.clothBelt),
    precision: Boolean(d.precision),
    rugged: RUGGEDNESS.includes(d.rugged) ? d.rugged : "",
    feed: FEEDS.includes(d.feed) ? d.feed : "",
  };
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];

/** Whether an item is a gun: equipment with a ranged attack, in the firearm class as the item says or the system works it out. */
export function isFirearm(api: GWorldApi, item: any): boolean {
  if (item?.type !== "equipment" || rangedModes(item).length === 0) return false;
  const own = String(item.system?.weaponClass ?? "");
  if (own) return own === "firearm";
  const modes = [...(item.system?.meleeModes ?? []), ...rangedModes(item)];
  return api.rules.weaponClassOf({
    skills: modes.map((m) => String(m.skill ?? "")),
    damageTypes: modes.map((m) => String(m.damageType ?? "")) as never,
    hasMalfunction: rangedModes(item).some((m) => m.malfunction),
    isFencing: (item.system?.meleeModes ?? []).some((m: any) => m.isFencing),
  }) === "firearm";
}

/** What the quality rules need to know of a gun: its best base Acc, and whether it fires full-auto. */
function gunFacts(item: any): { bestAccuracy: number; fullAuto: boolean } {
  const modes = rangedModes(item);
  return {
    bestAccuracy: Math.max(0, ...modes.map((m) => Number(m.accuracy) || 0)),
    fullAuto: isFullAuto(modes.map((m) => Number(m.rateOfFire) || 0)),
  };
}

/** The quality a gun has: what its data asks for, less what the book refuses it. */
export function qualityOf(item: any): FirearmQuality {
  return allowedQuality(firearmData(item), gunFacts(item));
}

/** The Basic Set grade the system reads the gun at. */
function basicGrade(api: GWorldApi, item: any): string {
  return api.registry.isRuleOn("weaponQuality") ? String(item?.system?.quality ?? "good") : "good";
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;

/** The character's attack row for a gun's mode, as the system worked it out. */
function rangedRow(actor: any, item: any, modeIndex: number): any {
  const rows: any[] = actor?.system?.derived?.ranged ?? [];
  return rows.find((r) => r?.itemId === item?.id && r?.modeIndex === modeIndex) ?? null;
}

/** Whether the shooter is at default with the gun, or lacks its ST (p. 81). */
const untrained = (row: any): boolean => Boolean(row?.atDefault) || Number(row?.minStPenalty) < 0;

/**
 * A mode's Malf. under the switches that are on, from the table's figure
 * (`base`), and whether a malfunction is rolled again. With the quality
 * switch off, the Basic Set's grade is left in and only wear comes off.
 */
export function gunMalfunction(api: GWorldApi, item: any, base: number | null, row: any, on: FirearmSwitches): { malfunction: number | null; reroll: boolean } {
  const data = firearmData(item);
  const grade = basicGrade(api, item);
  const wear = on.care() ? wearPenalty({ lost: data.malfunctionLost, clothBelt: data.clothBelt, untrained: untrained(row) }) : 0;
  if (!on.quality()) {
    const graded = api.rules.qualityMalfunction(base, grade as never);
    return { malfunction: graded === null ? null : graded - wear, reroll: false };
  }
  // The Basic Set's cheap grade is still -1 (Campaigns p. 407); its fine grades are what the steps replace.
  const cheap = grade === "cheap" ? 1 : 0;
  return malfunctionAfter(base, qualityOf(item).reliable, wear + cheap);
}

/** The item sheet section's data. */
function itemContext(api: GWorldApi, item: any, on: FirearmSwitches): Record<string, unknown> {
  const data = firearmData(item);
  const facts = gunFacts(item);
  const context: Record<string, unknown> = { editable: item.isOwner };
  if (on.quality()) {
    const quality = qualityOf(item);
    const grade = basicGrade(api, item);
    const option = (kind: "Accurate" | "Reliable", step: number, selected: number) => ({
      value: step,
      label: L(`${kind}${step}`),
      selected: step === selected,
      disabled: step > 0 && qualityProblems({ accurate: kind === "Accurate" ? (step as 1 | 2) : 0, reliable: kind === "Reliable" ? (step as 1 | 2) : 0 }, facts).length > 0,
    });
    context.quality = {
      accurate: QUALITY_STEPS.map((s) => option("Accurate", s, data.accurate)),
      reliable: QUALITY_STEPS.map((s) => option("Reliable", s, data.reliable)),
      priced: F("Priced", { multiplier: Math.round(qualityCostMultiplier(quality) * 100) / 100 }),
      grade: grade === "fine" || grade === "veryFine" ? F("GradeSetAside", { grade: game.i18n.localize(`GWORLD.Quality.${grade}`) }) : "",
      reroll: rangedModes(item).some((m) => malfunctionAfter(typeof m.malfunction === "number" ? m.malfunction : null, quality.reliable, 0).reroll)
        ? F("RerollLine", { malf: MALF_CEILING }) : "",
    };
  }
  if (on.care()) {
    // The figures the system uses, once the gun's robustness has had its say.
    const figures = api.items.objectStats(item);
    context.care = {
      data,
      rugged: RUGGEDNESS.map((r) => ({ value: r, label: L(`Rugged.${r || "standard"}`), selected: r === data.rugged })),
      clothBelt: feedFor(item, 0) === "belt" || data.clothBelt,
      lines: [F("RuggedLine", { dr: figures.dr, ht: figures.ht }), L("SafetyLine"), L("MaintenanceLine")],
    };
  }
  if (on.immediateAction()) {
    const worked = feedOf(modeFacts(rangedModes(item)[0]));
    const feed = data.feed || worked;
    context.immediate = {
      feeds: [
        { value: "", label: F("Feed.auto", { feed: L(`Feed.${worked}`) }), selected: data.feed === "" },
        ...FEEDS.map((f) => ({ value: f, label: L(`Feed.${f}`), selected: data.feed === f })),
      ],
      line: F(feed === "belt" ? "ReadiesBelt" : "Readies", { ready: IMMEDIATE_ACTION_READIES[feed], assisted: ASSISTANT_GUNNER_READIES }),
    };
  }
  return context;
}

const modeFacts = (mode: any) => ({ shots: String(mode?.shots ?? ""), rateOfFire: Number(mode?.rateOfFire) || 0, skill: String(mode?.skill ?? "") });

/** How a gun's mode feeds: the item's own say, or its statistics'. */
function feedFor(item: any, modeIndex: number): Feed {
  const data = firearmData(item);
  return data.feed || feedOf(modeFacts(rangedModes(item)[modeIndex] ?? rangedModes(item)[0]));
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-firearm]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtFirearm);
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        await item.update({ [`${path}.${key}`]: input.checked });
        return;
      }
      if (key === "rugged" || key === "feed") {
        await item.update({ [`${path}.${key}`]: input.value });
        return;
      }
      const value = Math.max(0, Math.floor(Number(input.value) || 0));
      if (key === "accurate" || key === "reliable") {
        const asked = { ...firearmData(item), [key]: qualityStep(value) };
        const problem = qualityProblems(asked, gunFacts(item))[0];
        if (problem) {
          ui.notifications?.warn(L(`Problem.${problem}`));
          input.value = String(firearmData(item)[key]);
          return;
        }
      }
      await item.update({ [`${path}.${key}`]: value });
    });
  });
}

/** The character's trait whose name starts with this, and the specialty it names. */
function traitsNamed(actor: any, name: RegExp): string[] {
  return [...(actor?.items ?? [])]
    .filter((i: any) => i?.type === "trait" && name.test(String(i.name ?? "")))
    .map((i: any) => String(i.system?.specialty || /\(([^)]*)\)\s*$/.exec(String(i.name ?? ""))?.[1] || "").trim());
}

/**
 * The level of the character's technique of this name for this skill,
 * relative to the skill, or null where they don't know it (pp. 250-252). The
 * technique names the skill as its prerequisite or in its name, "Fanning
 * (Guns (Pistol))" or "Immediate Action (Pistol)". `penalty` is its default,
 * which the technique's own levels are counted up from where no level is
 * worked out.
 */
export function techniqueRelative(api: GWorldApi, actor: any, skill: string, name: RegExp = /^immediate action\b/i, penalty = IMMEDIATE_ACTION_PENALTY, accept: (technique: any) => boolean = () => true): number | null {
  const technique = [...(actor?.items ?? [])].find((i: any) => i?.type === "technique"
    && name.test(String(i.name ?? ""))
    && accept(i)
    && (specialtyCovers(String(i.system?.prerequisite ?? ""), skill) || specialtyCovers(/^[^(]*\((.*)\)\s*$/.exec(String(i.name ?? ""))?.[1] ?? "", skill)));
  if (!technique) return null;
  const level = technique.system?.derived?.level;
  const base = api.actors.skillLevel(actor, skill);
  if (typeof level === "number" && typeof base === "number") return level - base;
  const levels = Number(technique.system?.derived?.levels);
  return Number.isFinite(levels) ? penalty + levels : null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Three dice, rolled as the system's dice are, for a listener that can't wait on a Roll. */
function threeDice(): number[] {
  return [0, 0, 0].map(() => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1);
}

export function readyFirearms(api: GWorldApi, on: FirearmSwitches): void {
  // Quality work reprices the gun from its cost (p. 79), in place of the Basic Set grade's multiple.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-firearm-quality",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.quality() || !isFirearm(api, item)) return null;
      const grade = basicGrade(api, item);
      // The system priced a graded gun from its list price; that multiple comes back out.
      const graded = (grade === "fine" || grade === "veryFine") && Number(item.system?.listCost) > 0
        ? api.rules.qualityCostMultiplier("firearm", grade as never, tlOf(item)) ?? 1 : 1;
      const multiplier = qualityCostMultiplier(qualityOf(item)) / graded;
      if (multiplier === 1) return null;
      return { cost: Math.round(price.cost * multiplier * 100) / 100, label: L("PriceLabel") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-firearm-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-firearm-item.hbs`,
    visible: (item) => (on.quality() || on.care() || on.immediateAction()) && isFirearm(api, item),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  // The rows: Acc and Malf. from quality work in place of the Basic Set grade's, less what wear costs.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    const accuracyLostOn = on.care() || (on.sustainedFire?.() ?? false);
    if (!(on.quality() || accuracyLostOn) || !isFirearm(api, item)) return;
    const data = firearmData(item);
    const quality = qualityOf(item);
    const grade = basicGrade(api, item);
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const { row, basis } = entry;
      if (on.quality()) {
        const bonus = accurateBonus(quality.accurate, Number(basis.accuracy) || 0);
        row.accuracy = (Number(row.accuracy) || 0) - api.rules.qualityAccuracyBonus("firearm", grade as never, false) + bonus;
        if (bonus) row.notes?.push?.({ label: F("AccurateNote", { bonus }), hint: L("AccurateHint") });
      }
      if (accuracyLostOn && data.accuracyLost) {
        row.accuracy = Math.max(0, (Number(row.accuracy) || 0) - data.accuracyLost);
        row.notes?.push?.({ label: F("AccuracyLostNote", { lost: data.accuracyLost }), hint: L("AccuracyLostHint") });
      }
      if (basis.malfunction === null || basis.malfunction === undefined) continue;
      const result = gunMalfunction(api, item, Number(basis.malfunction), row, on);
      row.malfunction = result.malfunction;
      if (result.reroll) row.notes?.push?.({ label: L("RerollNote"), hint: F("RerollLine", { malf: MALF_CEILING }) });
      if (on.care() && untrained(row)) row.notes?.push?.({ label: L("UntrainedNote"), hint: L("UntrainedHint") });
    }
  });

  // A malfunction: rolled again for a gun reliable past 17 (p. 79); misfires and stoppages swapped at TL6-8 (p. 81).
  Hooks.on(api.combat.hooks.malfunction, (context: any) => {
    const item = context?.item;
    if (!item || !isFirearm(api, item)) return;
    if (on.quality() && Number.isInteger(context.modeIndex)) {
      const mode = rangedModes(item)[context.modeIndex];
      const base = typeof mode?.malfunction === "number" ? mode.malfunction : null;
      const result = gunMalfunction(api, item, base, rangedRow(context.actor, item, context.modeIndex), on);
      if (result.reroll && result.malfunction !== null) {
        const dice = threeDice();
        const roll = dice.reduce((a, b) => a + b, 0);
        const again = rerollMalfunctions(roll, result.malfunction);
        void say(context.actor, String(item.name ?? ""), [F(again ? "RerollFailed" : "RerollSaved", { roll, dice: dice.join(", "), malf: result.malfunction })]);
        if (!again) {
          context.kind = null;
          return;
        }
      }
    }
    if (on.care()) {
      const kind = modernMalfunction(String(context.kind), Number(context.techLevel) || 0, Boolean(context.revolver));
      if (kind !== context.kind) context.kind = kind;
    }
  });

  // Clearing a stoppage by Immediate Action (p. 81).
  Hooks.on(api.combat.hooks.clearMalfunction, (context: any) => {
    const item = context?.item;
    const actor = context?.actor;
    if (!on.immediateAction() || context?.malfunction?.kind !== "stoppage" || !isFirearm(api, item)) return;
    const mode = rangedModes(item)[context.modeIndex] ?? rangedModes(item)[0] ?? {};
    const skill = String(mode.skill ?? "");
    // The -4 applies to either roll; the technique buys it off the weapon skill it is learned for.
    for (const roll of context.rolls ?? []) {
      roll.modifier = roll.key === "weapon" ? immediateActionModifier(techniqueRelative(api, actor, skill)) : IMMEDIATE_ACTION_PENALTY;
      roll.label = F("RollLabel", { roll: roll.label });
    }
    // Whatever the gunman would take to shoot this gun for its TL and for unfamiliarity.
    const use = (api.roll as any).equipmentUse?.(actor, item, skill);
    for (const line of use?.lines ?? []) context.modifiers.push({ label: line.label, value: line.value });
    const feed = feedFor(item, context.modeIndex);
    context.readyManeuvers = IMMEDIATE_ACTION_READIES[feed];
    if (feed === "belt") context.aids.push({ id: `${MODULE_ID}.assistant-gunner`, label: F("AssistantGunner", { ready: ASSISTANT_GUNNER_READIES }), readyManeuvers: ASSISTANT_GUNNER_READIES });
    if (traitsNamed(actor, /^armou?rer'?s gift\b/i).some((s) => specialtyCovers(s, skill))) {
      context.aids.push({ id: `${MODULE_ID}.armorers-gift`, label: F("ArmorersGift", { bonus: ARMORERS_GIFT_BONUS }), modifier: ARMORERS_GIFT_BONUS, checked: true });
    }
    const name = String(item.name ?? "").toLowerCase();
    if (traitsNamed(actor, /^weapon bond\b/i).some((s) => s && (name.includes(s.toLowerCase()) || s.toLowerCase().includes(name)))) {
      context.aids.push({ id: `${MODULE_ID}.weapon-bond`, label: F("WeaponBond", { bonus: WEAPON_BOND_BONUS }), modifier: WEAPON_BOND_BONUS, checked: true });
    }
  });

  // Abuse (p. 80): a precision gun rolls HT rather than HT+4. A rugged one's HT is the object's, below.
  Hooks.on(api.combat.hooks.equipmentFailure, (context: any) => {
    const item = context?.item;
    if (!on.care() || !isFirearm(api, item)) return;
    if (firearmData(item).precision) context.modifiers.push({ label: L("PrecisionLine"), value: PRECISION_ABUSE_MODIFIER });
  });

  // A rugged gun's DR and HT as an object (p. 80), wherever the system works them out.
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    const item = context?.item;
    if (!on.care() || !isFirearm(api, item)) return;
    const rugged = firearmData(item).rugged;
    if (!rugged) return;
    const before = { dr: Number(context.dr) || 0, ht: Number(context.ht) || 0 };
    const after = ruggedObjectStats(before, rugged);
    if (after.dr === before.dr && after.ht === before.ht) return;
    context.dr = after.dr;
    context.ht = after.ht;
    context.notes?.push?.(L(`Rugged.${rugged}`));
  });
}
