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
 *   - **Attack options:** a shot into water, at -4 and with the water's depth
 *     counted a thousand times over against the gun's ranges; a shot steeply
 *     into the air, at 80% of the range. A shot out of range is refused, and
 *     one the water puts past 1/2D says so on the card.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { isVacuum, sceneEnvironment, updateSceneEnvironment } from "../../../shared/environment/index.js";
import { isFirearm } from "../firearms/index.js";
import { isRevolver } from "../rate-of-fire/index.js";
import { firearmBuild } from "../records.js";
import {
  INTO_WATER_PENALTY,
  SPACE_MALFUNCTION,
  STEEP_ANGLE_RANGE,
  UNDERWATER_FACTOR,
  intoWaterDistance,
  modernGun,
  reach,
  underwaterMalfunctionLoss,
  underwaterRange,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Environment.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Environment.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const INTO_WATER = "ht-into-water";
const STEEP_ANGLE = "ht-steep-angle";
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

export function readyEnvironments(api: GWorldApi, on: () => boolean, options: { underwaterFactor?: (item: any, modeIndex: number) => number } = {}): void {
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ht-shooting-environment",
    label: L("Title"),
    icon: "fa-solid fa-water",
    visible: on,
    open: () => setEnvironment(),
  } as any);

  // A gun's rows under water or in space (p. 85).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!on() || !isFirearm(api, item)) return;
    const environment = sceneEnvironment();
    const vacuum = isVacuum(environment);
    if (!environment.underwater && !vacuum) return;
    const own = firearmBuild(item).underwaterFactor;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      // An underwater dart loaded carries its own factor, as a gun built for the water does (p. 169).
      const factor = options.underwaterFactor?.(item, (item.system?.rangedModes ?? []).indexOf(entry.mode)) || own;
      const built = factor > 0;
      // The rule is for ordinary TL6-8 guns; one built to fire underwater has its own factor at any TL.
      if (!modernGun(tlOf(item)) && !built) continue;
      const row = entry.row;
      const automatic = isAutomatic(item, entry.mode);
      if (environment.underwater) {
        Object.assign(row, underwaterRange({ halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0 }, factor));
        // A gun that won't malfunction (no Malf.) keeps none to lose.
        const losesMalf = !built && typeof row.malfunction === "number";
        if (losesMalf) row.malfunction -= underwaterMalfunctionLoss(automatic);
        row.notes?.push?.({ label: F(losesMalf ? "UnderwaterNote" : "UnderwaterRangeNote", { factor: built ? factor : UNDERWATER_FACTOR, malf: underwaterMalfunctionLoss(automatic) }), hint: L(built ? "UnderwaterBuiltHint" : "UnderwaterHint") });
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

  // A shot at 50°-90° into the air: 80% of the range (p. 85).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: STEEP_ANGLE,
    label: L("SteepAngle"),
    attack: "ranged",
    available: (context: any) => on() && isFirearm(api, context?.item),
    apply: () => ({ notes: [L("SteepAngleNote")] }),
  } as any);

  // The distance either option makes of the shot, against the row's ranges.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.ranged || !isFirearm(api, context.item)) return;
    const feet = Math.floor(Number(context.options?.[option(INTO_WATER)]) || 0);
    const steep = context.options?.[option(STEEP_ANGLE)] === true;
    if (feet <= 0 && !steep) return;
    const row = rangedRow(context.actor, context.item, Number(context.mode?.index) || 0);
    if (!row) return;
    const ranges = { halfDamageRange: Number(row.halfDamageRange) || 0, maxRange: Number(row.maxRange) || 0 };
    const yards = Math.max(0, Number(context.rangeYards) || 0);
    const distance = feet > 0 ? intoWaterDistance(yards, feet) : yards;
    if (reach(distance, ranges, steep ? STEEP_ANGLE_RANGE : 1) === "out") {
      context.refusal = F("OutOfRange", { yards: Math.round(distance), max: Math.round(ranges.maxRange * (steep ? STEEP_ANGLE_RANGE : 1)) });
    }
  });
}
