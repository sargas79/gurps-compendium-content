/**
 * High-Tech's special shooting situations (p. 85), registered with the system
 * through the add-on API under the shootingEnvironments switch. The rules
 * are in `rules.ts`.
 *
 *   - **The scene:** underwater or in space, kept in the scene's environment
 *     (`src/shared/environment/`, the same facts Ultra-Tech's beams read),
 *     which the GM sets from a tool.
 *   - **Rows**, through `gworld.weaponAttacks`: a TL6-8 gun fired underwater
 *     has its ranges divided by 1,000 -- by 25 for a gun built for it -- and
 *     1 less Malf., 2 less for an automatic; an automatic TL6-8 gun in space
 *     malfunctions on 14.
 *     Underwater, a mode loaded with hollow-points is refused, and caseless
 *     rounds are noted as failing in time.
 *   - **A shot into water**, an attack option: -4, with the water's depth
 *     counted a thousand times over against the gun's ranges.
 *   - **A shot steeply into the air**, toggled from the gun's row: the row's
 *     1/2D and Max at 80%, so the card's half damage is the steep shot's.
 *   A shot out of range is refused, and one the water puts past 1/2D says so
 *   on the card.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { isVacuum, sceneEnvironment, updateSceneEnvironment } from "../../../shared/environment/index.js";
import { isFirearm } from "../firearms/index.js";
import { isRevolver } from "../rate-of-fire/index.js";
import { firearmBuild } from "../records.js";
import {
  INTO_WATER_PENALTY,
  SPACE_MALFUNCTION,
  UNDERWATER_FACTOR,
  intoWaterDistance,
  modernGun,
  reach,
  steepRange,
  underwaterMalfunctionLoss,
  underwaterRange,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Environment.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Environment.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const INTO_WATER = "ht-into-water";
const STEEP_STATE = "steep";
const option = (key: string) => `${MODULE_ID}.${key}`;

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;

/** A self-loader: RoF 2 or more and not a revolver; revolvers and manual repeaters aren't (p. 85). */
export function isAutomatic(item: any, mode: any = rangedModes(item)[0]): boolean {
  return (Number(mode?.rateOfFire) || 1) >= 2 && !isRevolver(item);
}

/** The character's attack row for a gun's mode, as the system worked it out. */
function rangedRow(actor: any, item: any, modeIndex: number): any {
  const rows: any[] = actor?.system?.derived?.ranged ?? [];
  return rows.find((r) => r?.itemId === item?.id && r?.modeIndex === modeIndex) ?? null;
}

/** Asks the GM whether the scene is underwater or in space, and keeps it on the scene. */
async function setEnvironment(): Promise<void> {
  if (!game.user?.isGM) return;
  const current = sceneEnvironment();
  const result: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Title") },
    content: `<div class="gworld"><p class="ihint">${esc(L("Hint"))}</p>
      <div class="ichecks">
        <label class="icheck"><input type="checkbox" name="underwater" ${current.underwater ? "checked" : ""}> ${esc(L("Underwater"))}</label>
        <label class="icheck"><input type="checkbox" name="space" ${isVacuum(current) ? "checked" : ""}> ${esc(L("Space"))}</label>
      </div></div>`,
    ok: {
      label: L("Set"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const checked = (name: string) => Boolean(form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked);
        return { underwater: checked("underwater"), space: checked("space") };
      },
    },
    rejectClose: false,
  });
  if (!result) return;
  // Space is vacuum; leaving it brings back the air a scene had, or a standard atmosphere.
  const atmospheres = result.space ? 0 : current.atmospheres <= 0.01 ? 1 : current.atmospheres;
  if (!(await updateSceneEnvironment({ underwater: result.underwater && !result.space, atmospheres }))) {
    ui.notifications?.warn(L("NoScene"));
    return;
  }
  ui.notifications?.info(L(result.space ? "DoneSpace" : result.underwater ? "DoneUnderwater" : "DoneStandard"));
}

/** What a mode's rounds are, for firing underwater (p. 85). */
export interface UnderwaterRounds {
  /** Hollow-points expand in the barrel: they can't be fired underwater. */
  hollowPoint: boolean;
  /** Caseless rounds work for a while after immersion, then fail. */
  caseless: boolean;
}

/** Whether a gun is aimed steeply up, kept on the gun and toggled from its row (p. 85). */
export function aimedSteeply(api: GWorldApi, item: any): boolean {
  return (api.combat.getWeaponState(item, MODULE_ID) as any)?.[STEEP_STATE] === true;
}

export function readyEnvironments(api: GWorldApi, on: () => boolean, options: { underwaterFactor?: (item: any, modeIndex: number) => number; rounds?: (item: any, modeIndex: number) => UnderwaterRounds } = {}): void {
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-shooting-environment",
    label: L("Title"),
    icon: "fa-solid fa-water",
    visible: on,
    open: () => setEnvironment(),
  } as any);


  // Aiming steeply up, toggled from the gun's row: its ranges at 80% on the row itself, so the
  // card's 1/2D and Max are the steep shot's.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-steep-angle",
    itemTypes: ["equipment"],
    label: L("SteepAngle"),
    icon: "fa-solid fa-arrow-up",
    visible: (item) => on() && isFirearm(api, item) && !sceneEnvironment().underwater,
    run: (item) => {
      const now = !aimedSteeply(api, item);
      void api.combat.setWeaponState(item, MODULE_ID, { [STEEP_STATE]: now }).then(() => ui.notifications?.info(F(now ? "SteepOn" : "SteepOff", { gun: String(item?.name ?? "") })));
    },
  });

  // A gun's rows under water, in space or aimed steeply up (p. 85).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!on() || !isFirearm(api, item)) return;
    const environment = sceneEnvironment();
    const vacuum = isVacuum(environment);
    const steep = !environment.underwater && aimedSteeply(api, item);
    if (!environment.underwater && !vacuum && !steep) return;
    const own = firearmBuild(item).underwaterFactor;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      const modeIndex = (item.system?.rangedModes ?? []).indexOf(entry.mode);
      if (steep) {
        row.halfDamageRange = steepRange(Number(row.halfDamageRange) || 0);
        row.maxRange = steepRange(Number(row.maxRange) || 0);
        row.notes?.push?.({ label: L("SteepNote"), hint: L("SteepAngleNote") });
      }
      if (!environment.underwater && !vacuum) continue;
      // An underwater dart loaded carries its own factor, as a gun built for the water does (p. 169).
      const factor = options.underwaterFactor?.(item, modeIndex) || own;
      const built = factor > 0;
      // The rule is for ordinary TL6-8 guns; one built to fire underwater has its own factor at any TL.
      if (!modernGun(tlOf(item)) && !built) continue;
      const automatic = isAutomatic(item, entry.mode);
      if (environment.underwater) {
        Object.assign(row, underwaterRange({ halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0 }, factor));
        // A gun that won't malfunction (no Malf.) keeps none to lose.
        const losesMalf = !built && typeof row.malfunction === "number";
        if (losesMalf) row.malfunction -= underwaterMalfunctionLoss(automatic);
        row.notes?.push?.({ label: F(losesMalf ? "UnderwaterNote" : "UnderwaterRangeNote", { factor: built ? factor : UNDERWATER_FACTOR, malf: underwaterMalfunctionLoss(automatic) }), hint: built ? F("UnderwaterBuiltHint", { factor }) : L("UnderwaterHint") });
        // What the rounds loaded do underwater: hollow-points can't be fired, caseless rounds fail in time.
        const rounds = options.rounds?.(item, modeIndex);
        if (rounds?.hollowPoint) row.notes?.push?.({ label: L("HollowPointNote"), hint: L("HollowPointHint") });
        if (rounds?.caseless) row.notes?.push?.({ label: L("CaselessNote"), hint: L("CaselessHint") });
      } else if (automatic && modernGun(tlOf(item))) {
        row.malfunction = typeof row.malfunction === "number" ? Math.min(row.malfunction, SPACE_MALFUNCTION) : SPACE_MALFUNCTION;
        row.notes?.push?.({ label: F("SpaceNote", { malf: SPACE_MALFUNCTION }), hint: L("SpaceHint") });
      }
    }
  });

  // A shot into the water: -4, and the water's depth a thousand times over against the range (p. 85).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: INTO_WATER,
    label: L("IntoWater"),
    attack: "ranged",
    input: { type: "number", min: 0, max: 1000 },
    available: (context: any) => on() && isFirearm(api, context?.item) && !sceneEnvironment().underwater,
    apply: (context: any, value: unknown) => {
      const feet = Math.floor(Number(value) || 0);
      if (feet <= 0) return null;
      const yards = intoWaterDistance(0, feet);
      const notes = [F("IntoWaterNote", { feet, yards: Math.round(yards) })];
      // The water alone puts the target past 1/2D: the card says so, for the damage roll's half damage.
      const row = rangedRow(context?.actor, context?.item, 0);
      if (row && reach(yards, { halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0 }) === "half") {
        notes.push(F("IntoWaterHalf", { half: Number(row.halfDamageRange) || 0 }));
      }
      return { modifiers: [{ label: L("IntoWaterLine"), value: INTO_WATER_PENALTY }], notes };
    },
  } as any);

  // On the roll: hollow-points underwater, and the distance water or a steep angle makes of the shot, against the row's ranges.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || !isFirearm(api, context.item)) return;
    const modeIndex = Number(context.mode?.index) || 0;
    if (sceneEnvironment().underwater && options.rounds?.(context.item, modeIndex)?.hollowPoint) {
      context.refusal = L("HollowPointRefusal");
      return;
    }
    const feet = Math.floor(Number(context.options?.[option(INTO_WATER)]) || 0);
    const steep = aimedSteeply(api, context.item) && !sceneEnvironment().underwater;
    if (feet <= 0 && !steep) return;
    // The row is already the steep shot's, at 80%.
    const row = rangedRow(context.actor, context.item, modeIndex);
    if (!row) return;
    const ranges = { halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0 };
    const yards = Math.max(0, Number(context.rangeYards) || 0);
    const distance = feet > 0 ? intoWaterDistance(yards, feet) : yards;
    if (reach(distance, ranges) === "out") {
      context.refusal = F("OutOfRange", { yards: Math.round(distance), max: Math.round(ranges.maxRange) });
    }
  });
}
