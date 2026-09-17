/**
 * GURPS Ultra-Tech's guns, launchers and grenades, registered with the system
 * through the add-on API (pp. 134-147), under three switches.
 *
 *   - **Propellant settings:** ETC and liquid-propellant slugthrowers as fields
 *     that reprice them and change their rows (and a liquid-propellant
 *     magazine's shots); boosted and low velocity as an attack option for them
 *     and for electromagnetic guns; non-metallic air guns.
 *   - **Gyrocs and launchers:** a gyroc's damage cut at short range; missile
 *     backblast rolled on firing, and reactionless missiles; smart grenades
 *     programmed, saucer grenades bounced, limpet mines pulled off, and vortex
 *     rings bounced around corners.
 *   - **Homing projectiles:** infrared, multispectral and multiscanner seekers
 *     loaded in a ranged mode, refused where the round is too small for the
 *     TL, making the row a homing attack at the seeker's skill, and priced.
 *
 * Its row listener runs after the warheads', so a warhead's damage is what
 * ETC multiplies.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { loadsOf } from "../warheads/index.js";
import { divideDamage, plusPerDie } from "../warheads/rules.js";
import {
  ETC,
  FUSINGS,
  HOMING_KINDS,
  LIMPET_MINE,
  LIQUID,
  NON_METALLIC,
  PIERCING,
  REACTIONLESS,
  SAUCER_BOUNCE,
  SMART_GRENADE,
  SPRAY_CAN,
  VELOCITIES,
  backblast,
  etcCell,
  gyrocDivisor,
  homingCost,
  homingRefusal,
  homingSense,
  homingSkill,
  HOMING_AIMING_SKILL,
  isAirGun,
  isConventional,
  isElectromagnetic,
  isGyroc,
  launcherByName,
  multiplyDamage,
  smartGrenadeCost,
  velocityEffect,
  vortexBounce,
  type Fusing,
  type Homing,
  type MultispectralSetting,
  type Velocity,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Guns.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Guns.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "gun";
const VELOCITY_OPTION = "ut-velocity";
const SAUCER_OPTION = "ut-saucer-bounce";
const VORTEX_OPTION = "ut-vortex-bounce";
const SETTINGS: readonly MultispectralSetting[] = ["passive", "antiRadiation", "active"];

export interface GunSwitches {
  propellant: () => boolean;
  launchers: () => boolean;
  homing: () => boolean;
}

interface HomingLoad {
  mode: number;
  kind: Homing | "";
  setting: MultispectralSetting;
}

interface GunData {
  etc: boolean;
  liquidPropellant: boolean;
  nonMetallic: boolean;
  reactionless: boolean;
  smart: boolean;
  homing: HomingLoad[];
}

export function initGuns(): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      etc: flag(),
      liquidPropellant: flag(),
      nonMetallic: flag(),
      reactionless: flag(),
      smart: flag(),
      homing: new f.ArrayField(new f.SchemaField({
        mode: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
        kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...HOMING_KINDS] }),
        setting: new f.StringField({ required: true, nullable: false, blank: false, initial: "passive", choices: [...SETTINGS] }),
      }), { required: true, initial: [] }),
    }),
  });
}

function gunData(item: any): GunData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    etc: Boolean(d.etc),
    liquidPropellant: Boolean(d.liquidPropellant),
    nonMetallic: Boolean(d.nonMetallic),
    reactionless: Boolean(d.reactionless),
    smart: Boolean(d.smart),
    homing: (Array.isArray(d.homing) ? d.homing : []).map((h: any) => ({
      mode: Math.max(0, Math.floor(Number(h.mode) || 0)),
      kind: HOMING_KINDS.includes(h.kind) ? h.kind : "",
      setting: SETTINGS.includes(h.setting) ? h.setting : "passive",
    })),
  };
}

const nameOf = (item: any) => String(item?.name ?? "");
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 9;
const isRanged = (item: any) => item?.type === "equipment" && (item.system?.rangedModes ?? []).length > 0;
const isGrenade = (item: any) => /\b(hand grenade|mini hand grenade|thimble grenade|saucer grenade|limpet mine)$/i.test(nameOf(item));
const isVortex = (item: any) => /vortex (pistol|projector)/i.test(nameOf(item));
const velocityCapable = (item: any, data = gunData(item)) => (isConventional(nameOf(item)) && data.liquidPropellant) || isElectromagnetic(nameOf(item));

function homingFor(item: any, mode: number): HomingLoad | null {
  return gunData(item).homing.find((h) => h.mode === mode && h.kind) ?? null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

function yardsToTarget(actor: any): number | null {
  const target = [...((game as any).user?.targets ?? [])][0];
  const stage = (globalThis as any).canvas;
  const from = actor?.getActiveTokens?.()?.[0];
  if (!target?.center || !from?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([from.center, target.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

function itemContext(api: GWorldApi, item: any, on: GunSwitches): Record<string, unknown> {
  const data = gunData(item);
  const name = nameOf(item);
  const tl = tlOf(item);
  const lines: string[] = [];
  const conventional = isConventional(name);
  if (on.propellant()) {
    if (data.etc) lines.push(F("EtcLine", { cell: etcCell(String(item.system?.rangedModes?.[0]?.skill ?? "")), magazines: ETC.magazinesPerCell }));
    if (data.liquidPropellant) lines.push(F("LiquidLine", { magazines: LIQUID.magazinesPerBottle, seconds: LIQUID.bottleReload }));
    if (velocityCapable(item, data)) lines.push(L("VelocityLine"));
    if (/wrist needler/i.test(name)) lines.push(L("WristNeedlerLine"));
  }
  if (on.launchers()) {
    if (isGyroc(name)) lines.push(L("GyrocLine"));
    const launcher = launcherByName(name);
    if (launcher) {
      const blast = backblast(launcher);
      lines.push(data.reactionless ? F("ReactionlessLine", { range: REACTIONLESS.maxRange, cost: REACTIONLESS.missileCost }) : F("BackblastLine", { damage: blast.damage, yards: blast.yards }));
    }
    if (isGrenade(item)) lines.push(F("GrenadeLine", { seconds: 2, smart: data.smart ? F("SmartLine", { readies: SMART_GRENADE.readies }) : "" }));
    if (/saucer grenade/i.test(name)) lines.push(F("SaucerLine", { penalty: SAUCER_BOUNCE }));
    if (/limpet mine$/i.test(name)) lines.push(F("LimpetLine", { st: LIMPET_MINE.st }));
    if (isVortex(item)) lines.push(L("VortexLine"));
    if (/^spray can$/i.test(name)) lines.push(F("SprayCanLine", { doses: SPRAY_CAN.doses, seconds: SPRAY_CAN.indoorSeconds }));
  }
  const calibre = api.rules.calibreOf(name) ?? null;
  const modes = on.homing() && !isGrenade(item)
    ? ((item.system?.rangedModes ?? []) as any[]).map((m, index) => {
      const load = homingFor(item, index);
      return {
        index,
        name: String(m.name ?? ""),
        kinds: [{ value: "", label: L("Homing.none"), selected: !load }, ...HOMING_KINDS.filter((k) => homingRefusal(k, calibre, tl) === null).map((k) => ({ value: k, label: L(`Homing.${k}`), selected: load?.kind === k }))],
        multispectral: load?.kind === "multispectral",
        settings: SETTINGS.map((s) => ({ value: s, label: L(`Setting.${s}`), selected: load?.setting === s })),
        detail: load?.kind ? F("HomingLine", { skill: homingSkill(load.kind, tl), sense: L(`Sense.${homingSense(load.kind, load.setting)}`), cost: homingCost(load.kind) }) : "",
      };
    })
    : [];
  return {
    data,
    editable: item.isOwner,
    propellant: on.propellant() && conventional,
    airGun: on.propellant() && isAirGun(name),
    reactionless: on.launchers() && launcherByName(name) !== null && tl >= REACTIONLESS.tl,
    smart: on.launchers() && isGrenade(item),
    modes,
    lines,
  };
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ut-gun]").forEach((input) => {
    input.addEventListener("change", () => void item.update({ [`${path}.${input.dataset.gccUtGun}`]: input.checked }));
  });
  element.querySelectorAll<HTMLSelectElement>("[data-gcc-ut-homing]").forEach((select) => {
    select.addEventListener("change", async () => {
      const mode = Number(select.dataset.mode) || 0;
      const field = String(select.dataset.gccUtHoming);
      const current = homingFor(item, mode) ?? { mode, kind: "" as const, setting: "passive" as const };
      const next = field === "setting" ? { ...current, setting: select.value as MultispectralSetting } : { ...current, kind: select.value as Homing | "" };
      if (next.kind) {
        const why = homingRefusal(next.kind, api.rules.calibreOf(nameOf(item)) ?? null, tlOf(item));
        if (why) {
          ui.notifications?.warn(L(`Refusal.${why}`));
          return;
        }
      }
      const others = gunData(item).homing.filter((h) => h.mode !== mode);
      await item.update({ [`${path}.homing`]: next.kind ? [...others, next] : others });
    });
  });
}

/** Programs a smart grenade (p. 147): three Readies, then a delay, radio command, impact or anti-tamper fuse. */
async function programGrenade(item: any, actor: any): Promise<void> {
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("ProgramTitle") },
    content: `<div class="gworld" style="display:grid;gap:6px"><label style="display:flex;justify-content:space-between;gap:8px">${esc(L("Fusing"))}<select name="fusing">${FUSINGS.map((f) => `<option value="${f}">${esc(L(`Fuse.${f}`))}</option>`).join("")}</select></label><label style="display:flex;justify-content:space-between;gap:8px">${esc(L("DelaySeconds"))}<input type="number" name="delay" value="10" min="0" max="${SMART_GRENADE.longestDelaySeconds}" style="width:90px" /></label></div>`,
    ok: {
      label: L("ProgramTitle"),
      callback: (_e: Event, b: HTMLElement) => {
        const form = b.closest<HTMLElement>(".application")!;
        return { fusing: form.querySelector<HTMLSelectElement>("[name=fusing]")?.value as Fusing, delay: Math.min(SMART_GRENADE.longestDelaySeconds, Math.max(0, Number(form.querySelector<HTMLInputElement>("[name=delay]")?.value) || 0)) };
      },
    },
    rejectClose: false,
  }) as { fusing: Fusing; delay: number } | null;
  if (!answer) return;
  await say(actor, nameOf(item), [F("Programmed", { fuse: L(`Fuse.${answer.fusing}`), delay: answer.delay, readies: SMART_GRENADE.readies })]);
}

/** Pulls a limpet mine off without its code (p. 147): ST-5 a try each second, a point of injury from flesh. */
async function pullLimpet(api: GWorldApi, actor: any): Promise<void> {
  const flesh = await foundry.applications.api.DialogV2.confirm({ window: { title: L("LimpetTitle") }, content: `<p>${esc(L("LimpetFlesh"))}</p>`, rejectClose: false });
  const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "ST") ?? 10, kind: "attribute", label: L("LimpetTitle"), modifiers: [{ label: L("LimpetNoCode"), value: LIMPET_MINE.st }] } as any);
  if (result?.success && flesh) await api.actors.applyInjury(actor, { amount: LIMPET_MINE.fleshDamage, label: L("LimpetTitle") });
}

export function readyGuns(api: GWorldApi, on: GunSwitches): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-guns",
    types: ["equipment"],
    apply: (item, price) => {
      const data = gunData(item);
      const name = nameOf(item);
      let cost = price.cost;
      if (on.propellant() && isConventional(name)) {
        if (data.etc) cost *= ETC.cost;
        if (data.liquidPropellant) cost *= LIQUID.cost;
      }
      if (on.propellant() && isAirGun(name) && data.nonMetallic) cost *= NON_METALLIC;
      if (on.launchers() && isGrenade(item) && data.smart) cost += smartGrenadeCost(tlOf(item));
      if (on.homing()) {
        // A homing round's price multiplies the ammunition, not the gun; a grenade or missile record is its own round.
        const load = homingFor(item, 0);
        if (load?.kind && (isGrenade(item) || /micromissile|gyroc$/i.test(name))) cost *= homingCost(load.kind);
      }
      return cost === price.cost ? null : { cost: Math.round(cost * 100) / 100, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-guns-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-guns-item.hbs`,
    visible: (item) => (on.propellant() || on.launchers() || on.homing()) && (isRanged(item) || isGrenade(item)),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  // A liquid-propellant magazine holds half as many shots again (p. 139).
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    if (!on.propellant() || !context?.entry || !isConventional(nameOf(context.item)) || !gunData(context.item).liquidPropellant) return;
    if (typeof context.entry.capacity === "number") context.entry.capacity = Math.floor(context.entry.capacity * LIQUID.shots);
  });

  // The rows: ETC's damage and range, a reactionless missile's range, a homing seeker (pp. 139, 145-146).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!isRanged(item)) return;
    const data = gunData(item);
    const name = nameOf(item);
    const tl = tlOf(item);
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      const index = Number(entry.mode?.index ?? (item.system?.rangedModes ?? []).indexOf(entry.mode));
      if (on.propellant() && data.etc && isConventional(name) && PIERCING.includes(String(row.damageType))) {
        row.damage = multiplyDamage(String(row.damage), ETC.damage);
        row.halfDamageRange = Math.round((Number(row.halfDamageRange) || 0) * ETC.range);
        row.maxRange = Math.round((Number(row.maxRange) || 0) * ETC.range);
        row.notes.push({ label: L("Etc"), hint: L("EtcHint") });
      }
      if (on.launchers() && data.reactionless && launcherByName(name)) {
        row.maxRange = Math.round((Number(row.maxRange) || 0) * REACTIONLESS.maxRange);
        row.notes.push({ label: L("Reactionless"), hint: L("ReactionlessHint") });
      }
      const load = on.homing() ? homingFor(item, Math.max(0, index)) : null;
      if (load?.kind) {
        row.guidance = "homing";
        if (typeof row.skillLevel === "number") row.skillLevel = homingSkill(load.kind, tl);
        // "The firer rolls against Artillery (Guided Missile) to aim"; on a success the projectile attacks at its own skill (p. 146).
        row.aimingSkill = HOMING_AIMING_SKILL;
        row.guidedSkillLevel = homingSkill(load.kind, tl);
        row.notes.push({ label: F("HomingNote", { skill: homingSkill(load.kind, tl) }), hint: F("HomingHint", { sense: L(`Sense.${homingSense(load.kind, load.setting)}`) }) });
      }
    }
  });

  // Boosted or low velocity changes the range as well: the speed/range penalty is read at the range it reaches (pp. 139, 141).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.propellant() || !context?.ranged || !velocityCapable(context.item)) return;
    const velocity = context.options?.[`${MODULE_ID}.${VELOCITY_OPTION}`];
    if (velocity !== "boosted" && velocity !== "low") return;
    const line = (context.modifiers ?? []).find((m: any) => m?.key === "speedRange");
    const yards = yardsToTarget(context.actor);
    if (!line || yards === null) return;
    const factor = velocityEffect(velocity).rangeFactor;
    const delta = api.rules.speedRangeModifier(yards / factor) - api.rules.speedRangeModifier(yards);
    if (delta) context.modifiers.push({ label: L(`Velocity.${velocity}`), value: delta });
  });

  // Boosted or low velocity (pp. 139, 141).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: VELOCITY_OPTION,
    label: L("VelocityLabel"),
    attack: "ranged",
    input: { type: "select", choices: VELOCITIES.map((v) => ({ value: v, label: L(`Velocity.${v}`) })) },
    available: (context: any) => on.propellant() && velocityCapable(context?.item),
    apply: (_context: any, value: unknown) => {
      const velocity = VELOCITIES.includes(value as Velocity) ? (value as Velocity) : "standard";
      if (velocity === "standard") return null;
      const effect = velocityEffect(velocity);
      return { notes: [F(`VelocityNote.${velocity}`, { range: effect.rangeFactor, hearing: effect.hearing, propellant: effect.propellant })] };
    },
  } as any);

  // A saucer grenade bounced round a corner: -3 (p. 147).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: SAUCER_OPTION,
    label: L("SaucerLabel"),
    attack: "ranged",
    available: (context: any) => on.launchers() && /saucer grenade/i.test(nameOf(context?.item)),
    apply: () => ({ modifiers: [{ label: L("SaucerLabel"), value: SAUCER_BOUNCE }] }),
  } as any);

  // A vortex ring bounced: -2 and -10% range a bounce (p. 134).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: VORTEX_OPTION,
    label: L("VortexLabel"),
    attack: "ranged",
    input: { type: "number", min: 0, max: 9 },
    available: (context: any) => on.launchers() && isVortex(context?.item),
    apply: (context: any, value: unknown) => {
      const bounces = Math.max(0, Math.floor(Number(value) || 0));
      if (!bounces) return null;
      const range = Number(context.item?.system?.rangedModes?.[0]?.maxRange) || 0;
      const bounce = vortexBounce(bounces, range);
      return { modifiers: [{ label: F("VortexLine2", { bounces }), value: bounce.penalty }], notes: [F("VortexNote", { range: bounce.range })] };
    },
  } as any);

  // On firing: the velocity for the damage roll, and a missile's backblast (p. 145).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || context?.mode?.ranged !== true) return;
    if (on.propellant() && velocityCapable(item) && item.isOwner) {
      const chosen = context.options?.[`${MODULE_ID}.${VELOCITY_OPTION}`];
      void api.combat.setWeaponState(item, MODULE_ID, { velocity: VELOCITIES.includes(chosen) ? chosen : "standard" });
    }
    const launcher = on.launchers() ? launcherByName(nameOf(item)) : null;
    if (launcher && !gunData(item).reactionless) {
      const blast = backblast(launcher);
      void api.roll.damage({ actor: context.actor, label: F("BackblastLabel", { yards: blast.yards }), formula: blast.damage, damageType: "burn" } as any);
    }
  });

  // The damage: the velocity chosen, and a gyroc's short range (pp. 139, 144).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    const item = context?.item;
    if (!item || typeof context.formula !== "string" || !PIERCING.includes(String(context.damageType))) return;
    if (on.propellant() && velocityCapable(item)) {
      const velocity = api.combat.getWeaponState(item, MODULE_ID)?.velocity as Velocity | undefined;
      if (velocity === "boosted") context.formula = plusPerDie(context.formula, velocityEffect("boosted").perDie);
      if (velocity === "low") context.formula = divideDamage(context.formula, 2);
    }
    // A gyroc's rocket is still accelerating: unless its warhead is something other than a solid slug.
    if (on.launchers() && isGyroc(nameOf(item)) && !loadsOf(item).some((l) => l.kind)) {
      const by = gyrocDivisor(yardsToTarget(context.actor));
      if (by > 1) {
        context.formula = divideDamage(context.formula, by);
        context.modifiers?.push?.({ label: F("GyrocShort", { by }), value: 0 });
      }
    }
  });

  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-program-grenade", itemTypes: ["equipment"], label: L("ProgramTitle"), icon: "fa-solid fa-microchip", visible: (item) => on.launchers() && isGrenade(item) && (gunData(item).smart || tlOf(item) >= 10), run: (item, actor) => programGrenade(item, actor) });
  api.sheets.registerRowAction({ module: MODULE_ID, key: "ut-pull-limpet", itemTypes: ["equipment"], label: L("LimpetTitle"), icon: "fa-solid fa-hand", visible: (item) => on.launchers() && /limpet mine$/i.test(nameOf(item)), run: (_item, actor) => pullLimpet(api, canvas?.tokens?.controlled?.[0]?.actor ?? actor) });
}
