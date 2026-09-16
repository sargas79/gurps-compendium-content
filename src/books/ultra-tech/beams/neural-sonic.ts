/**
 * GURPS Ultra-Tech's neural, psionic, microwave-pain and sonic beams,
 * registered with the system through the add-on API (pp. 120-126, 132).
 *
 *   - **init:** the settings a neural or mind disruptor is built with, and the
 *     one it is on.
 *   - **ready:** the price the extra settings add; an item sheet section to
 *     choose them; resistance (DR in full against a MAD beam, a fifth of it
 *     against a sonic stunner, Mind Shield against a mind disruptor, Protected
 *     Hearing against a nauseator); what each failure does, and who is out of
 *     reach; and a screamer taking its victim's hearing.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  immunity,
  mindOutcome,
  mindripperOutcome,
  nauseatorOutcome,
  neuralOutcome,
  screamerHearing,
  senseResistBonus,
  settingsFor,
  tunableFactor,
  type BeamOutcome,
  type BeamSetting,
  followingCondition,
} from "./neural.js";
import { beamFamily, drResistBonus, type BeamFamily } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Neural.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Neural.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "beamSetting";
const ALL_SETTINGS: readonly string[] = [...new Set([...settingsFor("neural"), ...settingsFor("mindDisruptor")])];

/** Families this switch rules. */
const FAMILIES: ReadonlySet<BeamFamily> = new Set(["neural", "mindDisruptor", "mindripper", "mad", "nauseator", "screamer", "sonicStun"]);

const FOLLOW_FLAG = "utFollowingConditions";
interface FollowUp { condition: string; at: number; seconds: number }
const followUps = (actor: any): FollowUp[] => {
  const stored = actor?.getFlag?.(MODULE_ID, FOLLOW_FLAG);
  return Array.isArray(stored) ? stored.filter((f: any) => f && typeof f.condition === "string") : [];
};

/** Applies the conditions whose time has come, for as long as what came before (pp. 121, 132). */
async function applyFollowUps(api: GWorldApi, actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  const now = Number((game as any).time?.worldTime) || 0;
  const all = followUps(actor);
  const due = all.filter((f) => f.at <= now);
  if (!due.length) return;
  await actor.setFlag(MODULE_ID, FOLLOW_FLAG, all.filter((f) => f.at > now));
  for (const f of due) {
    const left = f.at + f.seconds - now;
    if (left > 0) await api.actors.applyCondition(actor, { key: f.condition, duration: { seconds: left } } as any);
  }
}

export function initNeuralSonic(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      built: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false, choices: [...ALL_SETTINGS] }), { required: true, initial: [] }),
      setting: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
    }),
  });
}

function familyOf(item: any): BeamFamily | null {
  return item?.type === "equipment" ? beamFamily(String(item.name ?? "")) : null;
}

/** The settings a disruptor was built with (its first setting, where none were chosen) and the one it is on. */
export function beamSettingOf(item: any): { built: BeamSetting[]; setting: BeamSetting | null } {
  const family = familyOf(item);
  const allowed = family ? settingsFor(family) : [];
  if (!allowed.length) return { built: [], setting: null };
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const built = (Array.isArray(d.built) ? d.built : []).filter((s: string) => (allowed as readonly string[]).includes(s)) as BeamSetting[];
  const list = built.length ? built : [allowed[0]!];
  const setting = list.includes(d.setting) ? (d.setting as BeamSetting) : list[0]!;
  return { built: list, setting };
}

function traitNames(actor: any): string[] {
  return [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

function itemContext(item: any): Record<string, unknown> {
  const family = familyOf(item)!;
  const { built, setting } = beamSettingOf(item);
  return {
    settings: settingsFor(family).map((value) => ({ value, label: L(`Setting.${value}`), built: built.includes(value), active: value === setting })),
    cost: F("Cost", { factor: tunableFactor(built.length) }),
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ut-built]").forEach((input) => {
    input.addEventListener("change", async () => {
      const { built } = beamSettingOf(item);
      const value = String(input.dataset.gccUtBuilt) as BeamSetting;
      const next = input.checked ? [...new Set([...built, value])] : built.filter((s) => s !== value);
      await item.update({ [`${path}.built`]: next });
    });
  });
  element.querySelectorAll<HTMLSelectElement>("[data-gcc-ut-setting]").forEach((select) => {
    select.addEventListener("change", async () => {
      await item.update({ [`${path}.setting`]: select.value });
      // "Changing settings is a Ready maneuver" (pp. 121, 132).
      if (item.actor) await say(item.actor, item.name, [F("Switched", { setting: L(`Setting.${select.value}`) })]);
    });
  });
}

export function readyNeuralSonic(api: GWorldApi, on: () => boolean): void {
  // Tunable weapons: +50% for each setting after the first (pp. 121, 122, 132).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-beam-settings",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on()) return null;
      const { built } = beamSettingOf(item);
      const factor = tunableFactor(built.length);
      return factor === 1 ? null : { cost: Math.round(price.cost * factor * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-beam-settings-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-beam-settings.hbs`,
    visible: (item) => on() && settingsFor(familyOf(item) as BeamFamily).length > 0,
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  // The setting on the row, so the table says what the beam does now.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    const { setting } = beamSettingOf(context?.item);
    if (!setting) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind === "ranged") entry.row.notes.push({ label: L(`Setting.${setting}`), hint: L(`SettingHint.${setting}`) });
    }
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("resist") || !context.attack?.item) return;
    const family = familyOf(context.attack.item);
    if (!family || !FAMILIES.has(family)) return;
    const actor = context.actor;
    // MAD beams add the target's DR; a sonic stunner a point per 5 (pp. 120, 125).
    if (family === "mad" || family === "sonicStun") {
      const mode = context.attack.item.system?.rangedModes?.[Number(context.attack.mode?.index) || 0];
      const bonus = drResistBonus(family, context.attack.dr, Number(mode?.armorDivisor) || 1);
      if (bonus) context.modifiers.push({ label: L("Resist.Dr"), value: bonus });
    }
    const effects = actor?.system?.derived?.traitEffects ?? {};
    const bonus = senseResistBonus(family, { traits: traitNames(actor), protectedHearing: effects.protectedSense?.hearing === true });
    if (bonus) context.modifiers.push({ label: L(family === "mindDisruptor" ? "Resist.MindShield" : "Resist.ProtectedHearing"), value: bonus });
  });

  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    if (!on()) return;
    const family = familyOf(context?.item);
    if (!family || !FAMILIES.has(family) || family === "screamer") return;
    const actor = context.actor;
    const effects = actor?.system?.derived?.traitEffects ?? {};
    const name = String(actor?.name ?? "");
    const blocked = immunity(family, {
      traits: traitNames(actor),
      iq: api.actors.attribute(actor, "IQ"),
      sealed: effects.sealed === true,
      deaf: effects.deafness === true,
      injuryTolerance: effects.injuryTolerance ?? {},
    });
    if (blocked) {
      void say(actor, context.label ?? "", [F(`Immune.${blocked}`, { name })]);
      return;
    }
    const margin = Math.max(0, Math.floor(Number(context.margin) || 0));
    const { setting } = beamSettingOf(context.item);
    let outcomes: BeamOutcome[] = [];
    if (family === "neural" && setting) outcomes = neuralOutcome(setting, margin);
    else if (family === "mindDisruptor" && setting) outcomes = mindOutcome(setting, margin);
    else if (family === "mindripper") outcomes = mindripperOutcome(margin);
    else if (family === "nauseator") outcomes = nauseatorOutcome(margin);
    else if (family === "mad") outcomes = [{ condition: "agony", seconds: 1, note: "Mad.agony" }];
    else if (family === "sonicStun") outcomes = [{ condition: "unconscious", seconds: Math.max(1, margin) * 60, note: "Sonic.stun" }];
    const following: FollowUp[] = [];
    const now = Number((game as any).time?.worldTime) || 0;
    for (const outcome of outcomes) {
      if (outcome.condition) context.effects.push({ key: outcome.condition, ...(outcome.seconds ? { duration: { seconds: outcome.seconds } } : {}) });
      const next = setting && outcome.condition && outcome.seconds ? followingCondition(setting, outcome.condition) : null;
      if (next && outcome.seconds) following.push({ condition: next, at: now + outcome.seconds, seconds: outcome.seconds });
    }
    if (following.length && actor?.isOwner) void actor.setFlag(MODULE_ID, FOLLOW_FLAG, [...followUps(actor), ...following]);
    void say(actor, context.label ?? "", outcomes.map((o) => F(o.note, { name, minutes: Math.max(1, margin), seconds: o.seconds ?? 0 })));
  });

  // Moderate pain after agony, euphoria after ecstasy, a daze after a hypnogogic knockout, as world time passes.
  Hooks.on("updateWorldTime", () => {
    if (!on() || !(game as any).user?.isGM) return;
    for (const actor of (game as any).actors ?? []) if (followUps(actor).length) void applyFollowUps(api, actor);
  });

  // A screamer "shakes and bakes": a living victim's hearing goes with half its HP, or two-thirds (p. 125).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    if (!on() || !game.user?.isGM || familyOf(context?.item) !== "screamer") return;
    const actor = context.actor;
    if (traitNames(actor).some((n) => /^machine\b/i.test(n))) return;
    const loss = screamerHearing(Number(context.result?.injury) || 0, Number(actor?.system?.hp?.max) || 0);
    if (loss) void say(actor, context.item?.name ?? "", [F(`Screamer.${loss}`, { name: actor?.name })]);
  });
}
