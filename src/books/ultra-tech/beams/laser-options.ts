/**
 * GURPS Ultra-Tech's laser options, registered with the system through the
 * add-on API (pp. 113-118).
 *
 *   - **init:** the options a laser is built with, on equipment.
 *   - **ready:** the price they add; the row each setting fires; an item sheet
 *     section to build the laser and switch its setting; Protected Vision and a
 *     Nictitating Membrane against a dazzle or blinding beam, and the blindness
 *     it leaves; weather's DR and glass's divisor as attack options; and an eye
 *     a laser crippled, which is crippled for good.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  GLASS_DIVISOR,
  HIGH_ENERGY,
  NO_LASER_OPTIONS,
  activeSetting,
  canDazzle,
  canPulse,
  laserOptionFactor,
  laserRow,
  laserSettings,
  visionResistBonus,
  weatherDr,
  type LaserOptions,
  type LaserSetting,
} from "./lasers.js";
import { beamFamily, type BeamFamily } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Lasers.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Lasers.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "laser";
const WEATHER_OPTION = "ut-laser-weather";
const GLASS_OPTION = "ut-laser-glass";
const SETTINGS: readonly LaserSetting[] = ["beam", "dazzle", "blinding", "pulse"];

/** Families a dazzle or blinding beam's roll to resist comes from. */
const EYE_BEAMS: ReadonlySet<BeamFamily> = new Set(["dazzler", ...HIGH_ENERGY]);
/** Families whose burn weather and glass change: every high-energy laser, and an electrolaser's (pp. 114, 119). */
const WEATHERED: ReadonlySet<BeamFamily> = new Set([...HIGH_ENERGY, "electrolaser"]);

/** Registers the option fields. */
export function initLaserOptions(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      dazzle: new f.BooleanField({ initial: false }),
      blinding: new f.BooleanField({ initial: false }),
      pulse: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", "pulse", "pulseBeam"] }),
      setting: new f.StringField({ required: true, nullable: false, blank: false, initial: "beam", choices: [...SETTINGS] }),
    }),
  });
}

/** A laser's options, with nothing missing. */
export function laserOptionsOf(item: any): LaserOptions {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    dazzle: d.dazzle === true,
    blinding: d.blinding === true,
    pulse: d.pulse === "pulse" || d.pulse === "pulseBeam" ? d.pulse : "",
    setting: SETTINGS.includes(d.setting) ? d.setting : NO_LASER_OPTIONS.setting,
  };
}

function familyOf(item: any): BeamFamily | null {
  return item?.type === "equipment" ? beamFamily(String(item.name ?? "")) : null;
}

function traitNames(actor: any): string[] {
  return [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
}

async function say(actor: any, title: string, line: string): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div><div class="gc-result">${esc(line)}</div></div>`,
  });
}

/** The item sheet section's data. */
function itemContext(item: any): Record<string, unknown> {
  const family = familyOf(item)!;
  const options = laserOptionsOf(item);
  const setting = activeSetting(options);
  return {
    options,
    dazzleAllowed: canDazzle(family, item.name),
    pulseAllowed: canPulse(family, item.name),
    pulses: [["", "PulseNone"], ["pulse", "PulseOnly"], ["pulseBeam", "PulseBeam"]].map(([value, key]) => ({ value, label: L(key!), selected: options.pulse === value })),
    settings: laserSettings(options).map((value) => ({ value, label: L(`Setting.${value}`), selected: value === setting })),
    cost: F("Cost", { factor: Math.round(laserOptionFactor(options) * 100) / 100 }),
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const store = (patch: Record<string, unknown>) => item.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`system.extensions.${MODULE_ID}.${FIELD}.${k}`, v])));
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-laser]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtLaser);
      if (field === "dazzle" || field === "blinding") await store({ [field]: (input as HTMLInputElement).checked });
      else if (field === "pulse") await store({ pulse: input.value });
      else if (field === "setting") {
        await store({ setting: input.value });
        // "Switching to or from this mode takes a Ready maneuver" (pp. 113-114, 118).
        if (item.actor) await say(item.actor, item.name, F("Switched", { setting: L(`Setting.${input.value}`) }));
      }
    });
  });
}

/** Registers the table-side parts. */
export function readyLaserOptions(api: GWorldApi, on: () => boolean): void {
  // "The setting adds +10% to laser cost"; a pulse-beam laser "is +100% to cost" (pp. 113, 114, 118).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-laser-options",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on() || !HIGH_ENERGY.has(familyOf(item) as BeamFamily)) return null;
      const factor = laserOptionFactor(laserOptionsOf(item));
      return factor === 1 ? null : { cost: Math.round(price.cost * factor * 100) / 100, label: L("Title") };
    },
  });

  // The row each setting fires.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    const family = familyOf(context?.item);
    if (!family || !HIGH_ENERGY.has(family)) return;
    const setting = activeSetting(laserOptionsOf(context.item));
    if (setting === "beam") return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged" || entry.row.affliction) continue;
      const row = entry.row;
      Object.assign(row, laserRow(setting, {
        damage: String(row.damage ?? ""),
        damageType: String(row.damageType ?? ""),
        armorDivisor: Number(row.armorDivisor) || 1,
        halfDamageRange: Number(row.halfDamageRange) || 0,
        maxRange: Number(row.maxRange) || 0,
        explosive: row.explosive === true,
        affliction: false,
        afflictionAttribute: "",
        afflictionModifier: 0,
      }));
      row.notes.push({ label: L(`Setting.${setting}`), hint: L(`SettingHint.${setting}`) });
    }
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-laser-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-laser-item.hbs`,
    visible: (item) => on() && HIGH_ENERGY.has(familyOf(item) as BeamFamily),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  // Weather and glass, as the attacker says they lie on the beam's path (p. 114).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: WEATHER_OPTION,
    label: L("Weather.Label"),
    input: { type: "number", min: 0, step: 1 },
    available: (context: any) => on() && Boolean(context?.ranged) && WEATHERED.has(familyOf(context?.item) as BeamFamily),
    apply: (_context: any, value: unknown) => (weatherDr(Number(value)) ? { notes: [F("Weather.Note", { dr: weatherDr(Number(value)) })] } : null),
  } as any);
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: GLASS_OPTION,
    label: L("Glass.Label"),
    available: (context: any) => on() && Boolean(context?.ranged) && HIGH_ENERGY.has(familyOf(context?.item) as BeamFamily),
    apply: () => ({ notes: [L("Glass.Note")] }),
  } as any);
  // What the last shot was fired through, for the damage it does.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !WEATHERED.has(familyOf(context?.item) as BeamFamily) || !context.item?.isOwner) return;
    const weather = weatherDr(Number(context.options?.[`${MODULE_ID}.${WEATHER_OPTION}`]) || 0);
    const glass = context.options?.[`${MODULE_ID}.${GLASS_OPTION}`] === true;
    void api.combat.setWeaponState(context.item, MODULE_ID, { weatherDr: weather, glass });
  });
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on() || !WEATHERED.has(familyOf(context?.item) as BeamFamily)) return;
    const state = (api.combat.getWeaponState(context.item, MODULE_ID) as any) ?? {};
    const dr = Math.max(0, Math.floor(Number(state.weatherDr) || 0));
    if (dr) context.lines.push({ label: L("Weather.Line"), dr, applies: true, forceField: false, flexible: false, hardened: 0, reason: L("Weather.Hint") });
  });
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    if (!on() || !HIGH_ENERGY.has(familyOf(context?.item) as BeamFamily)) return;
    const state = (api.combat.getWeaponState(context.item, MODULE_ID) as any) ?? {};
    if (state.glass === true && (Number(context.damage?.armorDivisor) || 1) < GLASS_DIVISOR && !context.damage?.ignoresDr) {
      context.damage.armorDivisor = GLASS_DIVISOR;
    }
  });

  // Protected Vision and a Nictitating Membrane against a dazzle or blinding beam (pp. 113-114).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("resist") || !context.attack?.item) return;
    const family = familyOf(context.attack.item);
    if (!family || !EYE_BEAMS.has(family)) return;
    if (family !== "dazzler" && !["dazzle", "blinding"].includes(activeSetting(laserOptionsOf(context.attack.item)))) return;
    const bonus = visionResistBonus(traitNames(context.actor));
    if (bonus) context.modifiers.push({ label: L("VisionProtection"), value: bonus });
  });

  // Blindness for minutes equal to the margin, or for good from a blinding beam (pp. 113-114).
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    if (!on()) return;
    const family = familyOf(context?.item);
    if (!family || !EYE_BEAMS.has(family)) return;
    const setting = family === "dazzler" ? "dazzle" : activeSetting(laserOptionsOf(context.item));
    const margin = Math.max(1, Math.floor(Number(context.margin) || 0));
    if (setting === "dazzle") {
      context.effects.push({ module: MODULE_ID, key: "ut-dazzled", label: L("Dazzled"), duration: { seconds: margin * 60 } });
      void say(context.actor, context.label ?? "", F("DazzledLine", { name: context.actor?.name, minutes: margin }));
    } else if (setting === "blinding") {
      context.effects.push({ module: MODULE_ID, key: "ut-blinded", label: L("Blinded") });
      void say(context.actor, context.label ?? "", F("BlindedLine", { name: context.actor?.name }));
    }
  });

  // "If an eye takes enough laser damage to cripple it, the result is always permanent crippling" (p. 114).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    if (!on() || !game.user?.isGM || !HIGH_ENERGY.has(familyOf(context?.item) as BeamFamily)) return;
    if (context.damage?.hitLocation === "eye" && context.result?.crippled) {
      void say(context.actor, context.item?.name ?? "", F("EyeLost", { name: context.actor?.name }));
    }
  });
}
