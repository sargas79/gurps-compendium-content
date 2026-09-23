/**
 * High-Tech's reloading, careful loading and black-powder fouling (pp. 86-88,
 * 251), registered with the system through the add-on API under three
 * switches. The rules are in `rules.ts`.
 *
 *   - **Reloading (firearmLoading):** how a gun loads is a field on it (#364's
 *     `firearm` object), worked out from its Shots column and skill where
 *     that is reliable and set from the book's descriptions where it isn't.
 *     `gworld.shotsEntry` then gives the Reload button the book's time for
 *     that procedure, what Fast-Draw (Ammo) saves on it, and the aids that
 *     help as ticks: a powder flask or paper cartridges (one or the other;
 *     the cartridges halve the time), a greased patch, a speedloader the
 *     character carries, clamped magazines, an assistant gunner. A gun
 *     loaded a round at a time -- a breechloader, a revolver, an internal
 *     magazine through a gate -- is timed for the rounds the Reload button
 *     is asked to load (`perRoundSeconds`). A character who knows
 *     Double-Loading rolls it at its own level in place of Fast-Draw (Ammo)
 *     (`fastDrawRoll`), for the extra seconds a pair. Loading in the saddle
 *     or on a moving vehicle needs its roll first (`requiredRolls`). A
 *     muzzle-loading long arm loaded from anything but standing takes half
 *     as long again.
 *   - **Careful loading (carefulLoading):** a muzzle-loading musket or rifle
 *     set to load carefully takes twice as long, and the load it takes so
 *     shoots at +1 Acc.
 *   - **Black-powder fouling (blackPowderFouling):** the shots a black-powder
 *     gun fires, as `gworld.afterShots` reports them, are counted since it
 *     was last cleaned: every five add a tenth to its loading time and take a
 *     step off Malf., every ten a point of Acc. Cleaning it, from its sheet,
 *     takes two minutes.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { isFirearm, techniqueRelative } from "../firearms/index.js";
import { isMachineGun } from "../sustained-fire/index.js";
import {
  BLACK_POWDER_LOADING,
  CAREFUL_LOADING_ACC,
  CLEANING_SECONDS,
  FLASK_SECONDS,
  LOADING_TYPES,
  SPEEDLOADER,
  blackPowderClass,
  blackPowderLoad,
  doubleLoadingSaving,
  firesBlackPowder,
  fouledSeconds,
  loadingByTheRound,
  loadingRolls,
  foulingPenalty,
  helpedSeconds,
  isLongArm,
  loadingSeconds,
  workedOutLoading,
  type LoadingType,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Reloading.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Reloading.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "firearm";
const FOULING_FLAG = "fouling";
const CAREFUL_FLAG = "carefulLoad";
const POWDERS = ["", "black", "other"] as const;
type Powder = (typeof POWDERS)[number];

/** The Basic Set skill that reloads faster, and the High-Tech technique of it (p. 251). */
const FAST_DRAW_AMMO = "Fast-Draw (Ammo)";
const DOUBLE_LOADING = /^double-loading\b/i;
const DOUBLE_LOADING_DEFAULT = -2;

/** What this module keeps on a gun for reloading, beside #364's fields on the same `firearm` object. */
export function reloadingFields(f: any): Record<string, unknown> {
  return {
    loadingType: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...LOADING_TYPES] }),
    powder: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...POWDERS] }),
    loadCarefully: new f.BooleanField({ initial: false }),
  };
}

interface ReloadingData {
  loadingType: LoadingType | "";
  powder: Powder;
  loadCarefully: boolean;
}

function reloadingData(item: any): ReloadingData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    loadingType: LOADING_TYPES.includes(d.loadingType) ? d.loadingType : "",
    powder: POWDERS.includes(d.powder) ? d.powder : "",
    loadCarefully: d.loadCarefully === true,
  };
}

const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;

/** A mode's Shots column, read as the system reads it. */
function shotsOf(api: GWorldApi, mode: any): { capacity: number | null; chambered: boolean; reloadSeconds: number | null; perShot: boolean } {
  const entry = api.rules.parseShots(String(mode?.shots ?? ""));
  return {
    capacity: typeof entry.capacity === "number" ? entry.capacity : null,
    chambered: entry.chambered === true,
    reloadSeconds: typeof entry.reloadSeconds === "number" ? entry.reloadSeconds : null,
    perShot: entry.perShot === true,
  };
}

/** How a gun's mode loads: the gun's own say, or its statistics'. */
export function loadingOf(api: GWorldApi, item: any, modeIndex = 0): LoadingType {
  return reloadingData(item).loadingType || workedOutLoadingOf(api, item, modeIndex);
}

function workedOutLoadingOf(api: GWorldApi, item: any, modeIndex: number): LoadingType {
  const mode = rangedModes(item)[modeIndex] ?? rangedModes(item)[0];
  return workedOutLoading({ name: String(item?.name ?? ""), skill: String(mode?.skill ?? ""), rateOfFire: Number(mode?.rateOfFire) || 0, ...shotsOf(api, mode) });
}

/** Whether a gun fires black powder: as its data says, or by how it loads and its TL. Never a rocket. */
export function blackPowderGun(api: GWorldApi, item: any): boolean {
  if (rangedModes(item).every((m) => /rocket/i.test(String(m?.skill ?? "")))) return false;
  return firesBlackPowder(reloadingData(item).powder, loadingOf(api, item), tlOf(item));
}

/** The shots fired since the gun was last cleaned. */
export function foulingShots(item: any): number {
  return Math.max(0, Math.floor(Number(item?.flags?.[MODULE_ID]?.[FOULING_FLAG]?.shots) || 0));
}

/** Whether the load in the gun went in carefully. */
export function carefullyLoaded(item: any): boolean {
  return item?.flags?.[MODULE_ID]?.[CAREFUL_FLAG] === true;
}

export interface ReloadingSwitches {
  loading: () => boolean;
  careful: () => boolean;
  fouling: () => boolean;
}

/** Whether a gun can be loaded carefully: a muzzle-loading musket or rifle (p. 86). */
function loadsCarefully(api: GWorldApi, item: any): boolean {
  if (loadingOf(api, item) !== "muzzleloader") return false;
  const mode = rangedModes(item)[0];
  const seconds = shotsOf(api, mode).reloadSeconds ?? 0;
  return isLongArm(blackPowderClass("muzzleloader", String(mode?.skill ?? ""), seconds));
}

/** The character's items whose names match, for aids that start ticked when they are carried. */
const carries = (actor: any, name: RegExp): boolean => [...(actor?.items ?? [])].some((i: any) => name.test(String(i?.name ?? "")));

/**
 * The Double-Loading roll a character who knows the technique makes in
 * place of Fast-Draw (Ammo): its success gives Fast-Draw's saving and the
 * technique's own (p. 251). Null for a character who doesn't know it.
 */
function doubleLoadingRoll(api: GWorldApi, actor: any): { level: number; label: string } | null {
  const technique = [...(actor?.items ?? [])].find((i: any) => i?.type === "technique" && DOUBLE_LOADING.test(String(i.name ?? "")));
  if (!technique) return null;
  const own = technique.system?.derived?.level;
  const relative = techniqueRelative(api, actor, FAST_DRAW_AMMO, DOUBLE_LOADING, DOUBLE_LOADING_DEFAULT);
  const base = api.actors.skillLevel(actor, FAST_DRAW_AMMO);
  const level = typeof own === "number" ? own : relative !== null && typeof base === "number" ? base + relative : null;
  return level === null ? null : { level, label: String(technique.name ?? "Double-Loading") };
}

/** The best of the character's Riding skills, or Riding at default; null where there is none. */
function ridingLevel(api: GWorldApi, actor: any): number | null {
  const own = [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill" && /^riding\b/i.test(String(i.name ?? "")))
    .map((i: any) => api.actors.skillLevel(actor, String(i.name)))
    .filter((n): n is number => typeof n === "number");
  if (own.length) return Math.max(...own);
  const fallback = api.actors.skillLevel(actor, "Riding");
  return typeof fallback === "number" ? fallback : null;
}

/** Whether the character is aboard a vehicle that is moving: in a vehicle's crew, its speed above 0 (as the system reads it). */
function onMovingVehicle(actor: any): boolean {
  const uuid = String(actor?.uuid ?? "");
  if (!uuid) return false;
  return ((game as any).actors?.contents ?? []).some((v: any) => v?.type === "vehicle"
    && (Number(v.system?.speed) || 0) > 0
    && (v.system?.crew ?? []).some((seat: any) => seat?.uuid === uuid));
}

/** The rolls the load needs where the shooter is (pp. 86-87), as the Reload button takes them. */
function requiredLoadingRolls(api: GWorldApi, actor: any, type: LoadingType, skill: string): any[] {
  const rolls = loadingRolls({ type, mounted: actor?.system?.mounted === true, movingVehicle: onMovingVehicle(actor) });
  return rolls.map((roll) => {
    const guns = api.actors.skillLevel(actor, skill);
    const riding = roll.riding ? ridingLevel(api, actor) : null;
    const label = F(roll.where === "mounted" ? "MountedRoll" : "VehicleRoll", { skill, modifier: roll.modifier });
    // A roll with no level and a skill the character lacks fails.
    if (typeof guns !== "number") return { skill, label };
    if (roll.riding && riding === null) return { skill: "Riding", label };
    return { level: Math.min(guns, riding ?? guns) + roll.modifier, label };
  });
}

const aidId = (key: string) => `${MODULE_ID}.${key}`;

/**
 * What the switches make of a gun's Shots entry: its time, what Fast-Draw
 * (Ammo) saves and the aids the Reload button offers. Changes `entry`.
 */
export function reloadEntry(api: GWorldApi, item: any, modeIndex: number, mode: any, entry: any, actor: any, on: ReloadingSwitches): void {
  if (!entry || entry.thrown || typeof entry.capacity !== "number" || typeof entry.reloadSeconds !== "number") return;
  const type = loadingOf(api, item, modeIndex);
  const fouling = on.fouling() && blackPowderGun(api, item) ? foulingPenalty(foulingShots(item)).steps : 0;
  const careful = on.careful() && reloadingData(item).loadCarefully && loadsCarefully(api, item);
  const aids: any[] = Array.isArray(entry.aids) ? entry.aids : (entry.aids = []);

  if (on.loading()) {
    const rolls = requiredLoadingRolls(api, actor, type, String(mode?.skill ?? ""));
    if (rolls.length) entry.requiredRolls = [...(Array.isArray(entry.requiredRolls) ? entry.requiredRolls : []), ...rolls];
  }

  if (on.loading() && BLACK_POWDER_LOADING.includes(type)) {
    const posture = String(actor?.system?.posture ?? "standing");
    const load = blackPowderLoad({ type, skill: String(mode?.skill ?? ""), tableSeconds: entry.reloadSeconds, lowPosture: posture !== "standing", careful, foulingSteps: fouling });
    entry.reloadSeconds = load.seconds;
    entry.fastDrawSeconds = load.seconds - load.fastDraw;
    entry.fastDrawPer = entry.perShot ? "round" : "reload";
    const flask = carries(actor, /powder flask/i);
    for (const aid of load.aids) {
      aids.push({
        id: aidId(aid.key),
        label: F(`Aid.${aid.key}`, { seconds: Math.abs(aid.seconds), flask: FLASK_SECONDS }),
        seconds: aid.seconds,
        ...(aid.multiplier !== undefined ? { multiplier: aid.multiplier } : {}),
        ...(aid.exclusiveGroup ? { exclusiveGroup: aidId(aid.exclusiveGroup) } : {}),
        ...(aid.fastDrawSeconds !== undefined ? { fastDrawSeconds: Math.max(0, aid.fastDrawSeconds) } : {}),
        checked: aid.key === "flask" && flask,
      });
    }
    return;
  }

  // The rounds loaded by hand: what is missing, or a full load for the sheet. A
  // "+1" gun's round in the chamber goes in as the action is worked (p. 88).
  const full = entry.capacity + (entry.chambered ? 1 : 0);
  const missing = full - Math.max(0, Number(mode?.loaded) || 0);
  const rounds = Math.min(entry.capacity, missing > 0 ? missing : full);
  const time = on.loading() ? loadingSeconds(type, rounds) : null;
  if (!time) {
    // The table's own time, loaded carefully or fouled.
    let seconds = entry.reloadSeconds;
    if (careful) seconds *= 2;
    entry.reloadSeconds = fouledSeconds(seconds, fouling);
    return;
  }

  const speedloader = SPEEDLOADER[type] && carries(actor, /^speedloader/i) ? SPEEDLOADER[type] : null;
  const doubling = doubleLoadingSaving(type, 2) > 0 ? doubleLoadingRoll(api, actor) : null;
  const byTheRound = loadingByTheRound(type);
  entry.perShot = false;

  // A round at a time: the Reload button asks how many and times that many (GWorld API 1.88.0). Not
  // where the time is a whole: a speedloader's, Double-Loading's pairs, fouling's tenths of the total.
  if (byTheRound && !speedloader && !doubling && !fouling) {
    entry.reloadSeconds = byTheRound.seconds;
    entry.perRoundSeconds = byTheRound.perRound;
    entry.fastDrawSeconds = byTheRound.fastDrawPerRound;
    entry.fastDrawPer = "round";
    return;
  }

  entry.reloadSeconds = fouledSeconds(time.seconds, fouling);
  entry.fastDrawSeconds = time.seconds - time.fastDraw;
  entry.fastDrawPer = "reload";

  // Double-Loading, rolled at its own level in place of Fast-Draw (Ammo): its success saves what Fast-Draw
  // does and a second or two a pair more (p. 251). A speedloader's saving replaces it (p. 87).
  const doubled = doubleLoadingSaving(type, rounds);
  if (doubling && doubled > 0) {
    entry.fastDrawRoll = { level: doubling.level, label: doubling.label };
    entry.fastDrawSeconds += doubled;
  }
  if (speedloader) {
    aids.push({
      id: aidId("speedloader"),
      label: F("Aid.speedloader", { seconds: speedloader.seconds, fastDraw: speedloader.fastDraw }),
      seconds: speedloader.seconds - time.seconds,
      fastDrawSeconds: speedloader.seconds - speedloader.fastDraw,
      checked: true,
    });
  }
  const helped = helpedSeconds(type);
  if (helped !== null) {
    // Clamped magazines and an assistant gunner reach Fast-Draw's time, not past it (p. 88).
    const off = { seconds: helped - time.seconds, fastDrawSeconds: 0 };
    if (type === "magazine") aids.push({ id: aidId("clamped"), label: F("Aid.clamped", { seconds: helped }), ...off, checked: carries(actor, /^magazine clamp/i) });
    if (type !== "magazine" || isMachineGun(item)) aids.push({ id: aidId("assistant"), label: F("Aid.assistant", { seconds: helped }), ...off });
  }
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The reload a full load takes, as the item sheet shows it. */
function reloadLine(api: GWorldApi, item: any, on: ReloadingSwitches): string {
  const mode = rangedModes(item)[0];
  const entry: any = { ...api.rules.parseShots(String(mode?.shots ?? "")), aids: [] };
  if (typeof entry.capacity !== "number" || typeof entry.reloadSeconds !== "number") return "";
  const empty = { ...mode, loaded: 0 };
  reloadEntry(api, item, 0, empty, entry, item?.actor ?? null, on);
  // A barrel or chamber at a time: the time for one. Otherwise a full load, however it is timed.
  const rounds = entry.perShot ? 1 : entry.capacity + (entry.chambered ? 1 : 0);
  const seconds = api.rules.reloadTime(entry, rounds);
  if (seconds === null) return "";
  const fast = api.rules.reloadTimeWith({ entry, seconds, rounds, aids: [], fastDraw: true }).seconds ?? seconds;
  return F(`Time${entry.perShot ? "PerRound" : "Whole"}`, { seconds, fastDraw: fast });
}

function itemContext(api: GWorldApi, item: any, on: ReloadingSwitches): Record<string, unknown> {
  const data = reloadingData(item);
  const worked = workedOutLoadingOf(api, item, 0);
  const shots = foulingShots(item);
  const penalty = foulingPenalty(shots);
  const black = blackPowderGun(api, item);
  const doubling = item?.actor && doubleLoadingSaving(loadingOf(api, item), 2) > 0 ? doubleLoadingRoll(api, item.actor) : null;
  return {
    editable: item.isOwner,
    loading: on.loading(),
    types: [
      { value: "", label: F("Type.auto", { type: L(`Type.${worked}`) }), selected: data.loadingType === "" },
      ...LOADING_TYPES.map((t) => ({ value: t, label: L(`Type.${t}`), selected: data.loadingType === t })),
    ],
    time: on.loading() || on.fouling() || on.careful() ? reloadLine(api, item, on) : "",
    doubleLoading: on.loading() && doubling ? F("DoubleLoadingLine", { name: doubling.label, level: doubling.level }) : "",
    careful: on.careful() && loadsCarefully(api, item),
    loadCarefully: data.loadCarefully,
    carefulLine: on.careful() && carefullyLoaded(item) ? F("CarefullyLoaded", { acc: CAREFUL_LOADING_ACC }) : "",
    fouling: on.fouling(),
    powders: POWDERS.map((p) => ({ value: p, label: p ? L(`Powder.${p}`) : F("Powder.auto", { powder: L(`Powder.${firesBlackPowder("", loadingOf(api, item), tlOf(item)) ? "black" : "other"}`) }), selected: data.powder === p })),
    foulingLine: on.fouling() && black
      ? F(!penalty.steps ? "FoulingClean" : penalty.accuracy ? "FoulingLineAcc" : "FoulingLine", { shots, malfunction: penalty.malfunction, accuracy: penalty.accuracy, percent: penalty.steps * 10 })
      : "",
    canClean: on.fouling() && black && shots > 0,
    cleanMinutes: CLEANING_SECONDS / 60,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-reloading]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtReloading);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      await item.update({ [`${path}.${key}`]: value });
    });
  });
  element.querySelector("[data-gcc-ht-clean]")?.addEventListener("click", async () => {
    await item.update({ [`flags.${MODULE_ID}.${FOULING_FLAG}`]: { shots: 0 } });
    await say(item.actor, String(item.name ?? ""), [F("Cleaned", { minutes: CLEANING_SECONDS / 60 })]);
  });
}

export function readyReloading(api: GWorldApi, on: ReloadingSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-reloading-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-reloading-item.hbs`,
    visible: (item) => (on.loading() || on.careful() || on.fouling()) && isFirearm(api, item),
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // The Reload button's time, Fast-Draw saving and aids (pp. 86-88, 251).
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    const item = context?.item;
    if (!(on.loading() || on.careful() || on.fouling()) || !isFirearm(api, item)) return;
    reloadEntry(api, item, Number(context.modeIndex) || 0, context.mode, context.entry, context.actor, on);
  });

  // A reload: the load goes in carefully or not (p. 86).
  Hooks.on("preUpdateItem", (item: any, changes: any) => {
    if (!on.careful() || !isFirearm(api, item)) return;
    const modes = foundry.utils.getProperty(changes, "system.rangedModes");
    if (!Array.isArray(modes)) return;
    const was = rangedModes(item);
    const loaded = modes.some((mode: any, i: number) => (Number(mode?.loaded) || 0) > (Number(was[i]?.loaded) || 0));
    if (!loaded) return;
    const careful = reloadingData(item).loadCarefully && loadsCarefully(api, item);
    if (careful !== carefullyLoaded(item)) foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${CAREFUL_FLAG}`, careful);
  });

  // Every shot: the careful load is spent, and a black-powder gun fouls (p. 86).
  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    if (!item?.isOwner || !isFirearm(api, item)) return;
    const update: Record<string, unknown> = {};
    if (carefullyLoaded(item)) update[`flags.${MODULE_ID}.${CAREFUL_FLAG}`] = false;
    const fired = Math.max(0, Math.floor(Number(context.fired ?? context.shots) || 0));
    if (on.fouling() && fired > 0 && blackPowderGun(api, item)) {
      const before = foulingShots(item);
      const after = before + fired;
      update[`flags.${MODULE_ID}.${FOULING_FLAG}`] = { shots: after };
      const was = foulingPenalty(before);
      const now = foulingPenalty(after);
      if (now.steps > was.steps) void say(context.actor, String(item.name ?? ""), [F(now.accuracy ? "FouledAcc" : "Fouled", { shots: after, malfunction: now.malfunction, accuracy: now.accuracy, percent: now.steps * 10 })]);
    }
    if (Object.keys(update).length) void item.update(update);
  });

  // The rows: +1 Acc for a careful load; fouling's Malf. and Acc (p. 86).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!(on.careful() || on.fouling()) || !isFirearm(api, item)) return;
    const careful = on.careful() && carefullyLoaded(item);
    const penalty = on.fouling() && blackPowderGun(api, item) ? foulingPenalty(foulingShots(item)) : null;
    if (!careful && !penalty?.steps) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "ranged") continue;
      const row = entry.row;
      if (careful) {
        row.accuracy = (Number(row.accuracy) || 0) + CAREFUL_LOADING_ACC;
        row.notes?.push?.({ label: F("CarefulNote", { acc: CAREFUL_LOADING_ACC }), hint: L("CarefulHint") });
      }
      if (penalty?.steps) {
        row.accuracy = Math.max(0, (Number(row.accuracy) || 0) - penalty.accuracy);
        if (typeof row.malfunction === "number") row.malfunction -= penalty.malfunction;
        row.notes?.push?.({ label: F(penalty.accuracy ? "FouledNoteAcc" : "FouledNote", { malfunction: penalty.malfunction, accuracy: penalty.accuracy }), hint: F("FouledHint", { shots: foulingShots(item) }) });
      }
    }
  });
}
