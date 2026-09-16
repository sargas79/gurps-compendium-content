/**
 * GURPS Ultra-Tech's beam weapons, registered with the system through the
 * add-on API (pp. 113-132).
 *
 *   - **The scene's air and water**, which the GM sets from a tool: air
 *     pressure, underwater and the water's clarity, and humidity.
 *   - **Rows** by that environment, through `gworld.weaponAttacks`: the
 *     atmosphere limits of X-ray lasers, grasers, ultraviolet and rainbow
 *     lasers and pulsars, blasters in vacuum, lasers underwater, sonic range by
 *     pressure, an electrolaser's charge lost in vacuum and its aim in the wet.
 *   - **Resistance**, through `gworld.successRollModifiers`: DR at the row's
 *     divisor against an electrolaser or an omni-blaster's stun, and a target's
 *     SM against a microwave disruptor.
 *   - **Effects**, through `gworld.afflictionEffect`: an electrolaser stuns,
 *     and on its kill setting a failure by 5 is a heart attack; an omni-blaster's
 *     stun and a microwave disruptor put someone out for minutes equal to the
 *     margin -- the disruptor only if they are Electrical.
 *   - **Force fields** against graviton beams and disintegrators, which meet
 *     them at a hundredth and a tenth, through `gworld.armorDr`; and a
 *     disintegrated target, through `gworld.afterDamage`.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import {
  FORCE_FIELD_PART,
  LETHAL_ELECTROLASER_LC,
  stabilizedScreenPart,
  KILL_SETTING,
  STANDARD_ENVIRONMENT,
  beamFamily,
  drResistBonus,
  inEnvironment,
  isDisintegrated,
  type BeamEnvironment,
  type BeamFamily,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Beams.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Beams.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The scene flag the environment is kept in. */
const ENVIRONMENT_FLAG = "beamEnvironment";
/** The attack option for an electrolaser's kill setting, and the weapon state it leaves. */
const KILL_OPTION = "ut-electrolaser-kill";
const BUILD_FIELD = "beamBuild";

/** Registers the fields for how a beam was built: an electrolaser's kill setting (p. 119). */
export function initBeams(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [BUILD_FIELD]: new f.SchemaField({ killSetting: new f.BooleanField({ initial: false }) }),
  });
}

/** Whether an electrolaser was built with the kill setting "any electrolaser may have" (p. 119). */
const hasKillSetting = (item: any) => item?.system?.extensions?.[MODULE_ID]?.[BUILD_FIELD]?.killSetting === true;

/** The scene whose air the beams are fired through: the one being viewed, or the active one. */
function beamScene(): any {
  const scenes = (globalThis as any).game?.scenes;
  return scenes?.viewed ?? scenes?.active ?? null;
}

/** The environment of the scene being viewed, or a standard one. */
export function beamEnvironment(): BeamEnvironment {
  const stored = beamScene()?.getFlag?.(MODULE_ID, ENVIRONMENT_FLAG) ?? {};
  const atmospheres = Number(stored.atmospheres);
  return {
    atmospheres: Number.isFinite(atmospheres) && atmospheres >= 0 ? atmospheres : STANDARD_ENVIRONMENT.atmospheres,
    underwater: stored.underwater === true,
    waterClarity: ["clear", "average", "murky"].includes(stored.waterClarity) ? stored.waterClarity : STANDARD_ENVIRONMENT.waterClarity,
    humidity: ["dry", "humid", "rain"].includes(stored.humidity) ? stored.humidity : STANDARD_ENVIRONMENT.humidity,
  };
}

/** The family of the item an attack was made with. */
function familyOf(item: any): BeamFamily | null {
  return item ? beamFamily(String(item.name ?? "")) : null;
}

/** The stored mode an attack was made with. */
function modeOf(item: any, mode: any): any {
  if (!item || !mode) return null;
  const list = mode.ranged === false ? item.system?.meleeModes : item.system?.rangedModes;
  return list?.[Number(mode.index) || 0] ?? null;
}

function traitNames(actor: any): string[] {
  return [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
}

function isElectrical(actor: any): boolean {
  return traitNames(actor).some((name) => /^electrical\b/i.test(name));
}

async function say(actor: any, title: string, line: string): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div><div class="gc-result">${esc(line)}</div></div>`,
  });
}

/** Asks the GM for the scene's air and water, and keeps them on the scene. */
async function setEnvironment(): Promise<void> {
  const scene = beamScene();
  if (!scene || !game.user?.isGM) {
    ui.notifications?.warn(L("NoScene"));
    return;
  }
  const current = beamEnvironment();
  const option = (value: string, chosen: string, label: string) => `<option value="${value}" ${value === chosen ? "selected" : ""}>${esc(label)}</option>`;
  const result: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Environment.Title") },
    content: `<div class="gworld"><p class="ihint">${esc(L("Environment.Hint"))}</p>
      <div class="ifields">
        <label>${esc(L("Environment.Atmospheres"))} <input type="number" name="atmospheres" value="${current.atmospheres}" min="0" step="0.01"></label>
        <label>${esc(L("Environment.Humidity"))} <select name="humidity">${["dry", "humid", "rain"].map((v) => option(v, current.humidity, L(`Environment.${v}`))).join("")}</select></label>
      </div>
      <div class="ifields">
        <label class="icheck"><input type="checkbox" name="underwater" ${current.underwater ? "checked" : ""}> ${esc(L("Environment.Underwater"))}</label>
        <label>${esc(L("Environment.Clarity"))} <select name="waterClarity">${["clear", "average", "murky"].map((v) => option(v, current.waterClarity, L(`Environment.${v}`))).join("")}</select></label>
      </div></div>`,
    ok: {
      label: L("Environment.Set"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return {
          atmospheres: Math.max(0, Number(value("atmospheres")?.value) || 0),
          underwater: Boolean(value("underwater")?.checked),
          waterClarity: value("waterClarity")?.value ?? "average",
          humidity: value("humidity")?.value ?? "dry",
        };
      },
    },
    rejectClose: false,
  });
  if (!result) return;
  await scene.setFlag(MODULE_ID, ENVIRONMENT_FLAG, result);
  // Every weapon row is worked out again for the new air.
  for (const actor of game.actors ?? []) {
    actor.prepareData();
    if (actor.sheet?.rendered) actor.sheet.render();
  }
  ui.notifications?.info(F("Environment.Done", { atmospheres: result.atmospheres }));
}

/** Registers the table-side parts. */
export function readyBeams(api: GWorldApi, on: () => boolean, ignoresEnvironment: (item: any) => boolean = () => false): void {
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ut-beam-environment",
    label: L("Environment.Title"),
    icon: "fa-solid fa-wind",
    visible: on,
    open: () => setEnvironment(),
  } as any);

  // The rows, by the air and water of the scene.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    const family = familyOf(context?.item);
    // A field-jacketed or FTL beam isn't touched by air or water (p. 133).
    if (!family || ignoresEnvironment(context.item)) return;
    const environment = beamEnvironment();
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      const change = inEnvironment(family, {
        accuracy: Number(row.accuracy) || 0,
        halfDamageRange: Number(row.halfDamageRange) || 0,
        maxRange: Number(row.maxRange) || 0,
        armorDivisor: Number(row.armorDivisor) || 1,
      }, environment);
      if (!change.notes.length) continue;
      Object.assign(row, change.row);
      if (change.skill && typeof row.skillLevel === "number") row.skillLevel += change.skill;
      // The charge that rode the laser is gone: the row is the laser's burn (API 1.55.0).
      if (change.chargeLost && row.affliction && row.followUp) {
        Object.assign(row, {
          affliction: false,
          damage: row.followUp.damage,
          damageType: row.followUp.damageType,
          armorDivisor: row.followUp.armorDivisor ?? 1,
          followUp: null,
        });
      }
      for (const note of change.notes) row.notes.push({ label: L(`Notes.${note}`), hint: L(`Hints.${note}`) });
    }
  });

  // An electrolaser's kill setting spends a second shot (p. 119).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: KILL_OPTION,
    label: L("Kill.Label"),
    available: (context: any) => on() && Boolean(context?.ranged) && familyOf(context?.item) === "electrolaser" && hasKillSetting(context?.item),
    apply: () => ({ shots: KILL_SETTING.extraShots, notes: [L("Kill.Note")] }),
  } as any);
  // Which setting the last shot was on, for the roll it forces.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || familyOf(context?.item) !== "electrolaser" || !context.item?.isOwner) return;
    const kill = context.options?.[`${MODULE_ID}.${KILL_OPTION}`] === true;
    void api.combat.setWeaponState(context.item, MODULE_ID, { kill });
  });

  // DR at the row's divisor, and a target's SM against a microwave disruptor.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.tags?.includes?.("resist") || !context.attack) return;
    const family = familyOf(context.attack.item);
    if (!family) return;
    const mode = modeOf(context.attack.item, context.attack.mode);
    const bonus = drResistBonus(family, context.attack.dr, Number(mode?.armorDivisor) || 1);
    if (bonus && (family === "electrolaser" || family === "omniBlaster")) context.modifiers.push({ label: L("Resist.Dr"), value: bonus });
    if (family === "microwave") {
      const sm = Math.round(Number(context.actor?.system?.sm) || 0);
      if (sm) context.modifiers.push({ label: L("Resist.Sm"), value: sm });
    }
  });

  // What a failed roll does.
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    if (!on()) return;
    const family = familyOf(context?.item);
    const margin = Math.max(0, Math.floor(Number(context?.margin) || 0));
    const minutes = { seconds: Math.max(1, margin) * 60 };
    if (family === "electrolaser") {
      context.effects.push({ key: "stunned" });
      const kill = context.item && (api.combat.getWeaponState(context.item, MODULE_ID) as any)?.kill === true;
      if (kill && margin >= KILL_SETTING.heartAttackMargin) {
        context.effects.push({ key: "heartAttack" });
        void say(context.actor, context.label ?? L("Kill.Label"), F("Kill.HeartAttack", { name: context.actor?.name }));
      } else {
        void say(context.actor, context.label ?? "", F("Electrolaser.Recover", { name: context.actor?.name }));
      }
    } else if (family === "omniBlaster") {
      context.effects.push({ key: "unconscious", duration: minutes });
    } else if (family === "microwave") {
      if (isElectrical(context.actor)) context.effects.push({ key: "unconscious", duration: minutes });
      else void say(context.actor, context.label ?? "", F("Microwave.Unaffected", { name: context.actor?.name }));
    }
  });

  // An electrolaser's kill setting, built in or not (p. 119).
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-electrolaser-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-electrolaser-item.hbs`,
    visible: (item) => on() && familyOf(item) === "electrolaser",
    context: (item) => ({ killSetting: hasKillSetting(item), lc: LETHAL_ELECTROLASER_LC }),
    listeners: (element, item) => {
      element.querySelector<HTMLInputElement>("[data-gcc-ut-kill-setting]")?.addEventListener("change", (event) => {
        void item.update({ [`system.extensions.${MODULE_ID}.${BUILD_FIELD}.killSetting`]: (event.currentTarget as HTMLInputElement).checked });
      });
    },
  });

  // Only a reality-stabilized screen stops a ghost particle beam or a reality disintegrator (p. 131).
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on() || !context?.ignoresDr || !context.actor) return;
    for (const line of context.lines ?? []) {
      if (!line.forceField) continue;
      const screen = line.itemId ? context.actor.items?.get?.(line.itemId) : null;
      const stabilized = screen?.system?.extensions?.[MODULE_ID]?.utField?.realityStabilized === true;
      const part = stabilizedScreenPart(String(context.item?.name ?? ""), stabilized);
      if (part === null) return;
      line.againstIgnoresDr = part;
      line.reason = F(stabilized ? "Stabilized" : "NotStabilized", { part: part === 0.2 ? "1/5" : "1/10" });
    }
  });

  // Force fields meet graviton beams and disintegrators at a fraction (pp. 129-130).
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on() || !context?.ignoresDr) return;
    if (stabilizedScreenPart(String(context.item?.name ?? ""), false) !== null) return;
    const part = FORCE_FIELD_PART[familyOf(context.item) as BeamFamily];
    if (!part) return;
    for (const line of context.lines ?? []) {
      if (line.forceField) {
        line.againstIgnoresDr = part;
        line.reason = F("ForceField", { part: part === 0.01 ? "1/100" : "1/10" });
      }
    }
  });

  // "Anyone reduced to -10×HP or less is disintegrated" (p. 130).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    if (!on() || familyOf(context?.item) !== "disintegrator" || !game.user?.isGM) return;
    const actor = context.actor;
    if (isDisintegrated(Number(actor?.system?.hp?.value), Number(actor?.system?.hp?.max))) {
      void say(actor, context.item?.name ?? "", F("Disintegrated", { name: actor?.name }));
    }
  });
}
