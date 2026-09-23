/**
 * High-Tech's sustained fire (pp. 85-86, 129), registered with the system
 * through the add-on API under the sustainedFire switch. The rules are in
 * `rules.ts`; the counting is the shared heat engine's.
 *
 *   - **Heat:** every attack's rounds, as `gworld.afterShots` reports them,
 *     are counted on the gun (this module's `gunHeat` flag). A machine gun's
 *     rounds weigh by how it is fired: sustained, rapid or assault, as the
 *     gunner sets it or as the pauses and bursts show. A water jacket takes
 *     the rounds until its water is gone.
 *   - **Rows:** past the safe number, -1 Acc and Malf.; at three times it, a
 *     machine gun's -2; and at three times it the Acc lost is kept as the
 *     gun's Acc lost to wear (#364's field), which the rows take off.
 *   - **Item sheet:** the safe number and heat, the gun's build (barrel, water
 *     jacket, condenser, how long its barrel takes to change),
 *     well-maintained and the way it is fired; cooling it, refilling the
 *     jacket, and changing the barrel: a Guns or Gunner roll, the heat gone on
 *     a success, a burned hand on a critical failure.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { COOL_HEAT, afterFiring, heatFrom, shotsCounted, type Heat } from "../../../shared/heat/rules.js";
import { firearmData, isFirearm, qualityOf } from "../firearms/index.js";
import { BARRELS, firearmBuild } from "../records.js";
import {
  BARREL_CHANGE_SECONDS,
  FIRE_DISCIPLINES,
  GUN_HEAT,
  burnMinutes,
  heatPenalty,
  heatWeight,
  roundsPerPint,
  safeShots,
  waterRoundsLeft,
  workedOutDiscipline,
  type FireDiscipline,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Sustained.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Sustained.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "firearm";
const HEAT_FLAG = "gunHeat";

/** What this module keeps on a gun for sustained fire, beside #364's fields on the same `firearm` object. */
export function sustainedFireFields(f: any): Record<string, unknown> {
  return {
    maintained: new f.BooleanField({ initial: false }),
    discipline: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...FIRE_DISCIPLINES] }),
  };
}

function sustainedData(item: any): { maintained: boolean; discipline: FireDiscipline | "" } {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return { maintained: d.maintained === true, discipline: FIRE_DISCIPLINES.includes(d.discipline) ? d.discipline : "" };
}

/** A gun's heat, with the water its jacket has used and whether this spell of heat has warped it. */
export interface GunHeat extends Heat {
  water: number;
  warped: boolean;
}

export function gunHeatOf(item: any): GunHeat {
  const stored = item?.flags?.[MODULE_ID]?.[HEAT_FLAG] ?? {};
  return { ...heatFrom(stored), water: Math.max(0, Math.floor(Number(stored.water) || 0)), warped: stored.warped === true };
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const now = (): number => Number(game.time?.worldTime) || 0;

/** A machine gun or autocannon, by its skill; or a gun the book says to treat as one with a light barrel (pp. 118, 121). */
export function isMachineGun(item: any): boolean {
  if (firearmBuild(item).barrel) return true;
  return rangedModes(item).some((m) => /(^|[^a-z])machine gun/i.test(String(m?.skill ?? "")));
}

/** The gun's safe number of rounds: a machine gun's in sustained fire. */
export function gunSafeShots(item: any): number {
  const mode = rangedModes(item)[0] ?? {};
  return safeShots({
    machineGun: isMachineGun(item),
    malfunction: typeof mode.malfunction === "number" ? mode.malfunction : null,
    reliable: qualityOf(item).reliable,
    techLevel: tlOf(item),
    barrel: firearmBuild(item).barrel,
    maintained: sustainedData(item).maintained,
  });
}

/** What the gun's heat takes off now. */
export function gunHeatPenalty(item: any): { accuracy: number; malfunction: number; shots: number; limit: number } {
  const limit = gunSafeShots(item);
  const shots = shotsCounted(gunHeatOf(item), now(), GUN_HEAT);
  return { ...heatPenalty(shots, limit, isMachineGun(item)), shots, limit };
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** What firing some rounds does to a gun: the heat to keep, and what to say and change. */
export function heatAfterShots(item: any, shots: { fired: number; total: number }, at: number): { heat: GunHeat; accuracyLost: number; lines: string[]; discipline: FireDiscipline | null } {
  const before = gunHeatOf(item);
  const build = firearmBuild(item);
  const machineGun = isMachineGun(item);
  const limit = gunSafeShots(item);
  const lines: string[] = [];
  let rounds = Math.max(0, Math.floor(shots.total));
  let water = before.water;
  // The jacket's water takes the heat until it has boiled away (p. 129).
  if (build.waterPints > 0) {
    const left = waterRoundsLeft(build.waterPints, water, build.condenser);
    const cooled = Math.min(left, rounds);
    water += cooled;
    rounds -= cooled;
    if (left > 0 && waterRoundsLeft(build.waterPints, water, build.condenser) === 0) lines.push(L("WaterGone"));
  }
  const pause = before.lastShot === null ? null : at - before.lastShot;
  const rof = Math.max(1, Number(rangedModes(item)[0]?.rateOfFire) || 1);
  const discipline = machineGun ? (sustainedData(item).discipline || workedOutDiscipline(shots.fired, rof, pause)) : null;
  const heat = afterFiring(before, rounds * (discipline ? heatWeight(discipline) : 1), limit, at, GUN_HEAT);
  const was = heatPenalty(shotsCounted(before, at, GUN_HEAT), limit, machineGun);
  const penalty = heatPenalty(heat.shots, limit, machineGun);
  if (penalty.accuracy > was.accuracy) lines.push(F("Overheated", { accuracy: penalty.accuracy, malfunction: penalty.malfunction }));
  // Three times the safe number: the Acc lost stays lost, once for each spell of heat (p. 86).
  const wasWarped = before.warped && shotsCounted(before, at, GUN_HEAT) > 0;
  const warpedNow = penalty.warped && !wasWarped;
  const accuracyLost = warpedNow ? penalty.accuracy : 0;
  if (warpedNow) lines.push(F("Warped", { accuracy: penalty.accuracy }));
  return { heat: { ...heat, water, warped: penalty.warped }, accuracyLost, lines, discipline };
}

export interface SustainedFireSwitches {
  sustained: () => boolean;
}

function itemContext(item: any, careOn: boolean): Record<string, unknown> {
  const build = firearmBuild(item);
  const data = sustainedData(item);
  const machineGun = isMachineGun(item);
  const limit = gunSafeShots(item);
  const penalty = gunHeatPenalty(item);
  const heat = gunHeatOf(item);
  const waterLeft = build.waterPints > 0 ? waterRoundsLeft(build.waterPints, heat.water, build.condenser) : 0;
  return {
    editable: item.isOwner,
    build,
    data,
    machineGun,
    barrels: BARRELS.map((b) => ({ value: b, label: L(`Barrel.${b || "standard"}`), selected: b === build.barrel })),
    disciplines: [
      { value: "", label: L("Discipline.auto"), selected: data.discipline === "" },
      ...FIRE_DISCIPLINES.map((d) => ({ value: d, label: L(`Discipline.${d}`), selected: data.discipline === d })),
    ],
    safe: machineGun
      ? F("SafeMachineGun", { sustained: limit, rapid: Math.floor(limit / heatWeight("rapid")), assault: Math.floor(limit / heatWeight("assault")) })
      : F("SafeSmallArms", { safe: limit }),
    heat: F(penalty.accuracy ? "HeatOver" : "Heat", { shots: Math.round(penalty.shots), limit, accuracy: penalty.accuracy, malfunction: penalty.malfunction }),
    water: build.waterPints > 0 ? F("WaterLine", { pints: build.waterPints, rounds: waterLeft, per: roundsPerPint(build.condenser) }) : "",
    barrelSeconds: build.barrelChangeSeconds || BARREL_CHANGE_SECONDS,
    canChangeBarrel: machineGun || build.barrelChangeSeconds > 0,
    showAccuracyLost: !careOn,
    accuracyLost: firearmData(item).accuracyLost,
    hasActor: Boolean(item.actor),
  };
}

/** Changes a hot barrel: a Guns or Gunner roll; on a success the gun is cool; a critical failure burns the hand (p. 129). */
async function changeBarrel(api: GWorldApi, item: any): Promise<void> {
  const actor = item?.actor;
  if (!actor) return void ui.notifications?.warn(L("NoActor"));
  const skill = String(rangedModes(item)[0]?.skill ?? "");
  const level = api.actors.skillLevel(actor, skill);
  if (typeof level !== "number") return void ui.notifications?.warn(F("NoSkill", { skill }));
  const seconds = firearmBuild(item).barrelChangeSeconds || BARREL_CHANGE_SECONDS;
  const outcome: any = await api.roll.success({ actor, base: level, label: F("BarrelRoll", { gun: item.name, seconds }), skill } as any);
  if (!outcome) return;
  if (outcome.success) {
    const heat = gunHeatOf(item);
    await item.update({ [`flags.${MODULE_ID}.${HEAT_FLAG}`]: { ...COOL_HEAT, water: heat.water, warped: false } });
    return void say(actor, String(item.name ?? ""), [F("BarrelChanged", { seconds })]);
  }
  if (outcome.criticalFailure) {
    const die = Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
    const minutes = burnMinutes(die);
    await api.actors.applyCondition(actor, { key: "moderatePain", duration: { seconds: minutes * 60 } } as any);
    return void say(actor, String(item.name ?? ""), [F("BarrelBurned", { die, minutes })]);
  }
  return void say(actor, String(item.name ?? ""), [F("BarrelFailed", { seconds })]);
}

function itemListeners(api: GWorldApi, element: HTMLElement, item: any): void {
  const firearm = `system.extensions.${MODULE_ID}.${FIELD}`;
  const build = `system.extensions.${MODULE_ID}.firearmBuild`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-sustained]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtSustained);
      const checkbox = input instanceof HTMLInputElement && input.type === "checkbox";
      const number = input instanceof HTMLInputElement && input.type === "number";
      const value = checkbox ? (input as HTMLInputElement).checked : number ? Math.max(0, Number(input.value) || 0) : input.value;
      const path = key === "maintained" || key === "discipline" || key === "accuracyLost" ? firearm : build;
      await item.update({ [`${path}.${key}`]: key === "accuracyLost" || key === "barrelChangeSeconds" ? Math.floor(Number(value)) : value });
    });
  });
  element.querySelector("[data-gcc-ht-cool]")?.addEventListener("click", () => {
    const heat = gunHeatOf(item);
    void item.update({ [`flags.${MODULE_ID}.${HEAT_FLAG}`]: { ...COOL_HEAT, water: heat.water, warped: false } });
  });
  element.querySelector("[data-gcc-ht-refill]")?.addEventListener("click", () => {
    const heat = gunHeatOf(item);
    void item.update({ [`flags.${MODULE_ID}.${HEAT_FLAG}`]: { ...heat, water: 0 } });
  });
  element.querySelector("[data-gcc-ht-barrel]")?.addEventListener("click", () => void changeBarrel(api, item));
}

export function readySustainedFire(api: GWorldApi, on: SustainedFireSwitches, care: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-sustained-fire-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-sustained-fire-item.hbs`,
    visible: (item) => on.sustained() && isFirearm(api, item),
    context: (item) => itemContext(item, care()),
    listeners: (element, item) => itemListeners(api, element, item),
  });

  // Every attack's rounds heat the gun (pp. 85-86), counted as the system reports them.
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!on.sustained() || !item?.isOwner || !isFirearm(api, item)) return;
    const result = heatAfterShots(item, { fired: Number(context.fired) || 0, total: Number(context.shots) || 0 }, now());
    const update: Record<string, unknown> = { [`flags.${MODULE_ID}.${HEAT_FLAG}`]: result.heat };
    if (result.accuracyLost) update[`system.extensions.${MODULE_ID}.${FIELD}.accuracyLost`] = Math.min(10, firearmData(item).accuracyLost + result.accuracyLost);
    void item.update(update);
    if (result.lines.length) void say(context.actor, String(item.name ?? ""), result.lines);
  });

  // A hot gun's rows: Acc and Malf. down (pp. 85-86).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!on.sustained() || !isFirearm(api, item)) return;
    const penalty = gunHeatPenalty(item);
    if (!penalty.accuracy && !penalty.malfunction) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      row.accuracy = Math.max(0, (Number(row.accuracy) || 0) - penalty.accuracy);
      if (typeof row.malfunction === "number") row.malfunction -= penalty.malfunction;
      row.notes?.push?.({ label: F("HotNote", { accuracy: penalty.accuracy, malfunction: penalty.malfunction }), hint: F("HotHint", { shots: Math.round(penalty.shots), limit: penalty.limit }) });
    }
  });
}
