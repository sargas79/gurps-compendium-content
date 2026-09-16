/**
 * GURPS Ultra-Tech's force fields, registered with the system through the
 * add-on API (pp. 190-195).
 *
 *   - **init:** a field's options on armour and equipment: a screen's
 *     variants and diameter, a life support belt's breathing setting, and the
 *     tau-shield's setting and levels.
 *   - **Force screens:** the variants priced; what each variant stops, and an
 *     adjustable screen's reinforced half, through `gworld.armorDr` (the screen
 *     is already a force-field layer with semi-ablative DR on its record); the
 *     spent DR regenerating as world time passes, through `items.restoreDr`;
 *     sealed, pressure and vacuum support and PF equal to its DR while worn and
 *     powered, through `gworld.traitEffects`; a barrier screen's size and SM.
 *   - **Force shields:** the bracelets are shields; the reflective one's DX roll
 *     to return a blocked beam is a row action.
 *   - **Stasis and time:** a row action puts the wearer of a stasis belt or cube
 *     (or a tau-shield on infinity) into stasis for the time set, and no damage
 *     gets through it, through `gworld.injury`; a life support belt's DR against
 *     energy, radiation, heat and sealing; the tau-shield's power and time rate.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { beamFamily } from "../beams/rules.js";
import { powerData } from "../power/data.js";
import { enduranceLeft } from "../power/index.js";
import {
  LIFE_SUPPORT,
  NO_SCREEN_OPTIONS,
  STASIS,
  TAU,
  adjustedDr,
  barrierFactor,
  barrierSm,
  isLifeSupportBelt,
  isReflectiveShield,
  isStasisDevice,
  stasisCollapseRange,
  regenerationPerSecond,
  screenCostFactor,
  screenOf,
  screenProtection,
  screenStops,
  tauMinutes,
  tauRatio,
  throughStasis,
  type ScreenOptions,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Force.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Force.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "utField";
const STASIS_KEY = "ut-stasis";
const BOOLEAN_OPTIONS = ["cloaking", "energy", "kinetic", "opaque", "permeable", "breathing", "realityStabilized", "safetySwitch", "velocity"] as const;

export interface ForceSwitches {
  screens: () => boolean;
  shields: () => boolean;
  stasis: () => boolean;
}

/** Registers the field options. */
export function initForceFields(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      adjustable: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", "none", "front", "back"] }),
      ...Object.fromEntries(BOOLEAN_OPTIONS.map((key) => [key, new f.BooleanField({ initial: false })])),
      diameter: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      tauSetting: new f.StringField({ required: true, nullable: false, blank: false, initial: "off", choices: ["off", "tactical", "infinity"] }),
      tauLevels: new f.NumberField({ required: true, nullable: false, initial: 1, min: 1, max: TAU.maxLevels, integer: true }),
    }),
  });
}

function fieldOf(item: any): Record<string, any> {
  return item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
}

export function screenOptionsOf(item: any): ScreenOptions {
  const d = fieldOf(item);
  const options: ScreenOptions = { ...NO_SCREEN_OPTIONS, adjustable: ["none", "front", "back"].includes(d.adjustable) ? d.adjustable : "" };
  for (const key of BOOLEAN_OPTIONS) options[key] = d[key] === true;
  return options;
}

const worn = (item: any) => (item?.type === "armor" || item?.type === "equipment") && item.system?.equipped === true;

/** Whether a device has run out of the power its cells give. */
function outOfPower(item: any): boolean {
  const left = enduranceLeft(powerData(item));
  return Boolean(left && left !== "unlimited" && left.left <= 0);
}

/** Whether an attack is an energy attack, and whether it moves fast, for what a screen stops (p. 192). */
function attackKind(item: any, mode: any, damageType: string): { energy: boolean; fast: boolean } {
  const name = String(item?.name ?? "");
  const energy = Boolean(item && beamFamily(name)) || damageType === "burn" || /\bforce (sword|blade|glaive|whip)\b|\b(stun|shock|zap)\b/i.test(name);
  return { energy, fast: mode?.ranged === true };
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

/** Yards between two actors' tokens, or null where the map can't say. */
function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const ta = a?.getActiveTokens?.()?.[0];
  const tb = b?.getActiveTokens?.()?.[0];
  if (!ta?.center || !tb?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([ta.center, tb.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

async function askNumber(title: string, label: string, value: number, min: number): Promise<number | null> {
  const answer = await (foundry.applications.api as any).DialogV2.prompt({
    window: { title },
    content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span><input type="number" name="value" value="${value}" min="${min}" step="1" style="width:110px"></label></div>`,
    ok: { label: title, callback: (_e: Event, b: HTMLElement) => Number(b.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="value"]')?.value ?? value) },
    rejectClose: false,
  });
  return answer === null || answer === undefined || !Number.isFinite(Number(answer)) ? null : Math.max(min, Math.floor(Number(answer)));
}

// ── the sheet ────────────────────────────────────────────────────────────────

function itemContext(api: GWorldApi, item: any, on: ForceSwitches): Record<string, unknown> {
  const name = String(item?.name ?? "");
  const d = fieldOf(item);
  const lines: string[] = [];
  const screen = on.screens() ? screenOf(name) : null;
  const options = screenOptionsOf(item);
  if (screen) {
    const dr = Number(item.system?.dr) || 0;
    lines.push(F("RegenLine", { rate: regenerationPerSecond(dr) }));
    const protection = screenProtection(options, dr);
    lines.push(protection.sealed ? F("SealedLine", { pf: protection.radiationPf }) : F("OpenLine", { pf: protection.radiationPf }));
    if (screen.barrier && screen.diameter) {
      const diameter = Number(d.diameter) || screen.diameter;
      lines.push(F("BarrierLine", { diameter, sm: barrierSm(diameter, api.rules.sizeModifier) }));
    } else {
      lines.push(L("ConformalLine"));
    }
    if (options.cloaking) lines.push(L("CloakingLine"));
    if (options.opaque) lines.push(L("OpaqueLine"));
    if (options.realityStabilized) lines.push(L("StabilizedLine"));
    if (options.safetySwitch) lines.push(L("SafetyLine"));
  }
  if (on.shields() && isReflectiveShield(name)) lines.push(L("ReflectLine"));
  if (on.shields() && /^force ward$/i.test(name)) lines.push(L("WardLine"));
  const stasisDevice = on.stasis() && isStasisDevice(name);
  if (stasisDevice) lines.push(F("StasisLine", { set: STASIS.setSeconds, on: STASIS.activateSeconds }));
  const lifeSupport = on.stasis() && isLifeSupportBelt(name);
  if (lifeSupport) lines.push(F("LifeSupportLine", { dr: LIFE_SUPPORT.dr, divisor: LIFE_SUPPORT.radiationDivisor, heat: LIFE_SUPPORT.heatF }));
  const tau = on.stasis() && /^tau-shield$/i.test(name);
  if (tau) lines.push(F("TauLine", { ratio: tauRatio(Number(d.tauLevels) || 1), extra: Math.max(1, Number(d.tauLevels) || 1), minutes: Math.round(tauMinutes(Number(d.tauLevels) || 1) * 10) / 10, infinity: TAU.infinityMinutes }));
  if (on.stasis() && /reality stabilizer$/i.test(name)) lines.push(L("StabilizerLine"));
  if (on.stasis() && /hypertime field generator$/i.test(name)) lines.push(L("HypertimeLine"));
  return {
    lines,
    screen: Boolean(screen),
    barrier: Boolean(screen?.barrier),
    diameter: Number(d.diameter) || screen?.diameter || 0,
    options,
    adjustables: ["", "none", "front", "back"].map((value) => ({ value, label: L(`AdjustChoice.${value || "no"}`), selected: options.adjustable === value })),
    checks: BOOLEAN_OPTIONS.filter((k) => k !== "breathing").map((key) => ({ key, label: L(`Option.${key}`), hint: L(`Option.${key}Hint`), checked: options[key] })),
    breathing: (screen && options.permeable) || lifeSupport,
    tau,
    tauSettings: ["off", "tactical", "infinity"].map((value) => ({ value, label: L(`Tau.${value}`), selected: (d.tauSetting ?? "off") === value })),
    tauLevels: Math.max(1, Number(d.tauLevels) || 1),
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-field]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtField);
      if (input instanceof HTMLInputElement && input.type === "checkbox") return void item.update({ [`${path}.${field}`]: input.checked });
      if (input instanceof HTMLInputElement && input.type === "number") return void item.update({ [`${path}.${field}`]: Math.max(0, Number(input.value) || 0) });
      await item.update({ [`${path}.${field}`]: input.value });
    });
  });
}

// ── ready ────────────────────────────────────────────────────────────────────

export function readyForceFields(api: GWorldApi, on: ForceSwitches): void {
  const anyOn = () => on.screens() || on.shields() || on.stasis();

  // A screen's variants, and a barrier screen's size (pp. 191-192).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-force-screen",
    types: ["armor"],
    apply: (item, price) => {
      if (!on.screens()) return null;
      const screen = screenOf(String(item?.name ?? ""));
      if (!screen) return null;
      const factor = screenCostFactor(screenOptionsOf(item));
      const size = screen.barrier && screen.diameter ? barrierFactor(screen.diameter, Number(fieldOf(item).diameter) || screen.diameter) : 1;
      if (factor === 1 && size === 1) return null;
      return { cost: Math.round(price.cost * factor * size * 100) / 100, weight: Math.round(price.weight * size * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-force-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-force-item.hbs`,
    visible: (item) => anyOn() && (itemContext(api, item, on).lines as string[]).length > 0,
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── force screens ──
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!context?.actor || !Array.isArray(context.lines)) return;
    const kind = attackKind(context.item, context.mode, String(context.damageType ?? ""));
    if (on.screens()) {
      for (const line of context.lines) {
        const item = line.itemId ? context.actor.items?.get?.(line.itemId) : null;
        if (!item || !screenOf(String(item.name))) continue;
        const options = screenOptionsOf(item);
        if (outOfPower(item)) {
          line.applies = false;
          line.reason = L("NoPower");
        } else if (!screenStops(options, kind)) {
          line.applies = false;
          line.reason = L(options.energy ? "Reason.energy" : options.kinetic ? "Reason.kinetic" : "Reason.velocity");
        } else if (options.adjustable === "front" || options.adjustable === "back") {
          const dr = adjustedDr(line.dr, options.adjustable, context.arc);
          if (dr !== line.dr) {
            line.reason = L(dr > line.dr ? "Reason.reinforced" : "Reason.weakened");
            line.dr = dr;
          }
        }
      }
    }
    // A life support belt's DR 5 against energy attacks (p. 194).
    if (on.stasis() && kind.energy) {
      const belt = [...(context.actor.items ?? [])].find((i: any) => worn(i) && isLifeSupportBelt(String(i.name)) && !outOfPower(i));
      if (belt) context.lines.push({ label: String(belt.name), dr: LIFE_SUPPORT.dr, applies: true, forceField: true, flexible: false, hardened: 0, reason: L("LifeSupportReason") });
    }
  });

  // Sealed, with pressure and vacuum support and PF equal to its DR, while it's on (p. 190); a life support belt's protection (p. 194).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!anyOn() || !context?.actor || !context.effects) return;
    const effects = context.effects;
    for (const item of context.actor.items ?? []) {
      if (!worn(item) || outOfPower(item)) continue;
      const label = String(item.name);
      if (on.screens() && item.type === "armor" && screenOf(label)) {
        const dr = Math.max(0, (Number(item.system?.dr) || 0) - (Number(item.system?.drLost) || 0));
        const protection = screenProtection(screenOptionsOf(item), dr);
        if (protection.sealed && !effects.sealed) { effects.sealed = true; context.sources.push({ effect: "sealed", label }); }
        if (protection.vacuumSupport && !effects.vacuumSupport) { effects.vacuumSupport = true; context.sources.push({ effect: "vacuumSupport", label }); }
        if (protection.pressureSupport > (Number(effects.pressureSupport) || 0)) { effects.pressureSupport = protection.pressureSupport; context.sources.push({ effect: "pressureSupport", label, value: protection.pressureSupport }); }
        if (protection.radiationPf > 1) {
          effects.radiationTolerance = Math.max(1, Number(effects.radiationTolerance) || 1) * protection.radiationPf;
          context.sources.push({ effect: "radiationTolerance", label, value: protection.radiationPf });
        }
      }
      if (on.stasis() && isLifeSupportBelt(label)) {
        const breathing = fieldOf(item).breathing === true;
        if (!breathing && !effects.sealed) { effects.sealed = true; context.sources.push({ effect: "sealed", label }); }
        effects.radiationTolerance = Math.max(1, Number(effects.radiationTolerance) || 1) * LIFE_SUPPORT.radiationDivisor;
        context.sources.push({ effect: "radiationTolerance", label, value: LIFE_SUPPORT.radiationDivisor });
        if (effects.temperatureTolerance) {
          effects.temperatureTolerance.heatF = (Number(effects.temperatureTolerance.heatF) || 0) + LIFE_SUPPORT.heatF;
          context.sources.push({ effect: "temperatureTolerance.heatF", label, value: LIFE_SUPPORT.heatF });
        }
      }
    }
  });

  // A spent screen regenerates a point a second for every 10 DR, on or off (p. 190), as world time passes.
  Hooks.on("updateWorldTime", (_worldTime: number, delta: number) => {
    if (!on.screens() || !(delta > 0)) return;
    const gm = (game.users as any)?.activeGM;
    if (!game.user?.isGM || (gm && gm.id !== game.user.id)) return;
    const actors = new Set<any>([...(game.actors ?? []), ...((canvas as any)?.tokens?.placeables ?? []).map((t: any) => t.actor).filter(Boolean)]);
    for (const actor of actors) {
      for (const item of actor.items ?? []) {
        if (item.type !== "armor" || !screenOf(String(item.name)) || !(Number(item.system?.drLost) > 0)) continue;
        void api.items.restoreDr(item, regenerationPerSecond(Number(item.system?.dr) || 0) * delta);
      }
    }
  });

  // ── force shields ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-reflect-beam",
    itemTypes: ["shield", "equipment"],
    label: L("ReflectTitle"),
    icon: "fa-solid fa-arrow-rotate-left",
    visible: (item) => on.shields() && isReflectiveShield(String(item?.name ?? "")),
    run: async (item, actor) => {
      if (!actor?.isOwner) return;
      const damage = await askNumber(L("ReflectTitle"), L("ReflectDamage"), 0, 0);
      if (damage === null) return;
      const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "DX") ?? 10, kind: "attribute", tags: ["DX"], label: F("ReflectLabel", { item: item.name }), modifiers: [] } as any);
      if (!result) return;
      await say(actor, String(item.name), [F(result.success ? "Reflected" : "NotReflected", { damage })]);
    },
  });

  // ── stasis ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-stasis",
    itemTypes: ["equipment", "armor"],
    label: L("StasisTitle"),
    icon: "fa-solid fa-hourglass",
    visible: (item) => on.stasis() && (isStasisDevice(String(item?.name ?? "")) || (/^tau-shield$/i.test(String(item?.name ?? "")) && fieldOf(item).tauSetting === "infinity")),
    run: async (item, actor) => {
      if (!actor?.isOwner) return;
      const tau = /^tau-shield$/i.test(String(item.name));
      const seconds = await askNumber(L("StasisTitle"), L("StasisSeconds"), tau ? 60 : STASIS.minimumSeconds, tau ? 1 : STASIS.minimumSeconds);
      if (seconds === null) return;
      await api.actors.applyCondition(actor, { module: MODULE_ID, key: STASIS_KEY, label: L("StasisCondition"), duration: { seconds } });
      await say(actor, String(item.name), [F(tau ? "TauInfinity" : "StasisOn", { name: actor.name, seconds, minutes: TAU.infinityMinutes })]);
    },
  });
  // A stasis key or disruptor collapses a stasis web around its targets (p. 96).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-stasis-collapse",
    itemTypes: ["equipment"],
    label: L("CollapseTitle"),
    icon: "fa-solid fa-burst",
    visible: (item) => on.stasis() && stasisCollapseRange(String(item?.name ?? "")) !== null,
    run: async (item, actor) => {
      const range = stasisCollapseRange(String(item?.name ?? "")) ?? 1;
      const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean);
      if (!targets.length) return void ui.notifications?.warn(L("CollapsePick"));
      const lines: string[] = [];
      for (const target of targets) {
        const distance = yardsBetween(actor, target);
        if (distance !== null && distance > range) { lines.push(F("CollapseOutOfRange", { name: target.name, range })); continue; }
        const stasis = (api.actors.conditions(target) ?? []).find((c: any) => String(c?.id ?? "").endsWith(STASIS_KEY));
        if (!stasis) { lines.push(F("CollapseNothing", { name: target.name })); continue; }
        await api.actors.removeCondition(target, String(stasis.id));
        lines.push(F("Collapsed", { name: target.name }));
      }
      await say(actor, String(item.name), lines);
    },
  });

  // Nothing gets through a stasis web (p. 193).
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    if (!on.stasis() || !context?.actor || !context.damage) return;
    const inStasis = (api.actors.conditions(context.actor) ?? []).some((c: any) => String(c?.id ?? "").endsWith(STASIS_KEY));
    if (inStasis) context.damage.basicDamage = throughStasis(Number(context.damage.basicDamage) || 0);
  });
}
