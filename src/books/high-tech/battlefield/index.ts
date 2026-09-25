/**
 * The electronic battlefield from the supplement Electricity and Electronics
 * (HT:EE pp. 45-46), part of High-Tech (decision E1 in #471), under two
 * switches. The figures are in `rules.ts`.
 *
 *   - **Battlefield sensors (battlefieldSensors):**
 *     - *Military gear* is built rugged, HT 12 and DR 8 (HT:EE p. 45): a
 *       device marked military on its sheet takes them as the object the
 *       system breaks (`gworld.objectStats`), save a figure its record
 *       states. The supplement's own military records are marked.
 *     - *Surveillance cameras* (High-Tech p. 206's records, which the
 *       supplement repeats): a row button watches through one, Observation at
 *       -4 (TL7) or -2 (TL8), a Quick Contest against the targeted
 *       character's Stealth, Shadowing or Camouflage where he hides. Pan/tilt/
 *       zoom, ticked on the sheet for $300 more, makes it -2 (TL7) or none
 *       (TL8), and a watched intruder who makes a Vision roll spots the
 *       camera.
 *     - *The seismic ground sensor*: a row button rolls Electronics Operation
 *       (Surveillance) with the source's Size Modifier and speed as bonuses
 *       and the range as a penalty, off the Size and Speed/Range Table
 *       (`rules.speedRangeModifier`, as High-Tech's hydrophone reads it).
 *     - *Chaff*: a row button dumps packages, and until the dumper's next
 *       turn each gives -2 to a ranged attack at the craft made with a radar
 *       lock or by a missile homing by radar (HT:EE p. 49), and to an
 *       Electronics Operation (Sensors) roll against it.
 *   - **Reconnaissance drones (reconDrones):** a vehicle record's drone
 *     data -- the autopilot's skill and Dodge, the remote control's bonus,
 *     the controller's range and the ceiling -- edited on its sheet and set
 *     on the two UAVs (HT:EE p. 46). The remote operator, the drone's
 *     `controller` outside its crew (API 1.154.0), makes its control roll,
 *     tagged `remoteControl`: it takes the remote control's bonus while he is
 *     within the controller's range, and is refused past it (API 1.144.0), and
 *     while the drone flies above its ceiling; the
 *     figures show on the vehicle actor's Hnd/SR (`gworld.vehicleStats`); a row
 *     button, or a GM tool for a drone on the map, rolls the autopilot's
 *     Piloting or Dodge, and the tool checks the controller's range and the
 *     ceiling against the map, and offers the targeted operator the controls.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, card, esc, lockTargetOf, lockedSensor, picked, row, skillBase, yardsBetween } from "../../../shared/sensors/index.js";
import { crewOf, isVehicle, vehicleAboard } from "../../../shared/vehicles/index.js";
import { deviceData, storeDevice, takesDeviceStatistics } from "../devices/index.js";
import { ACTIVE_SENSORS } from "../sensors/rules.js";
import { SENSORS } from "../surveillance/rules.js";
import { chosenSeeker } from "../guidance/index.js";
import { homes, seekerOf } from "../guidance/rules.js";
import {
  CHAFF_PER_PACKAGE,
  HIDING_SKILLS,
  MILITARY,
  OBSERVATION,
  PTZ_COST,
  SURVEILLANCE,
  aboveCeiling,
  cameraOf,
  cameraPenalty,
  chaffPenalty,
  droneOf,
  isChaff,
  isDrone,
  isSeismicSensor,
  militaryStatistics,
  seismicModifiers,
  withinControlRange,
  type DroneData,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Battlefield.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Battlefield.${key}`, data);
const nameOf = (item: any) => String(item?.name ?? "").trim();
const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const number = (form: HTMLElement, name: string) => Number(form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value) || 0;
const numberInput = (name: string, initial: number, step: number | "any" = 1) => `<input type="number" name="${name}" value="${initial}" min="0" step="${step}" style="width:80px" />`;

/** The key the drone data sits under, in this module's own extension. */
const DRONE = "drone";
/** The combat state chaff is kept in, on whoever dumped it. */
const CHAFF_STATE = "eeChaff";

export interface BattlefieldSwitches {
  sensors: () => boolean;
  drones: () => boolean;
  /** The homing seekers switch, which chaff against a radar-homing missile needs too (HT:EE p. 49). */
  seekers?: () => boolean;
}

// ── data ─────────────────────────────────────────────────────────────────────

/**
 * Adds the drone fields to this module's data on equipment and armour, and on
 * the vehicle actor, which takes a vehicle item's extension when it is put on
 * the road.
 */
export function initBattlefield(): void {
  const f = foundry.data.fields as any;
  const whole = () => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 });
  const drone = () => new f.SchemaField({
    autopilot: whole(),
    autopilotDodge: whole(),
    remoteBonus: whole(),
    controlRangeMiles: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
    ceilingFeet: whole(),
  });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, { [DRONE]: drone() });
  addExtensionFields("Actor", ["vehicle"], { [DRONE]: drone() });
}

/** The drone data on a vehicle item or actor. */
export function droneData(doc: any): DroneData {
  return droneOf(doc?.system?.extensions?.[MODULE_ID]?.[DRONE]);
}

/** Whether a vehicle item or actor is a drone of High-Tech's, or of no book's. */
export function isHighTechDrone(doc: any): boolean {
  const book = bookOf(doc);
  return (book === null || book === "high-tech") && isDrone(droneData(doc));
}

// ── what the sheets say ──────────────────────────────────────────────────────

/** Whether the battlefield section shows on an item. */
function battlefieldGear(item: any): boolean {
  return takesDeviceStatistics(item);
}

/** The lines the battlefield section shows, and its checkboxes. */
export function battlefieldContext(item: any): Record<string, unknown> {
  const data = deviceData(item);
  const name = nameOf(item);
  const lines: string[] = [];
  if (data.military) lines.push(F("MilitaryLine", militaryStatistics({ ht: data.ht, dr: data.dr })));
  const camera = cameraOf(name);
  if (camera) {
    lines.push(F("CameraLine", { modifier: signed(cameraPenalty(camera, data.panTiltZoom)) }));
    if (data.panTiltZoom) lines.push(L("PtzSpotted"));
  }
  if (isSeismicSensor(name)) lines.push(L("SeismicLine"));
  if (isChaff(name)) lines.push(F("ChaffLine", { modifier: CHAFF_PER_PACKAGE }));
  return {
    editable: Boolean(item?.isOwner ?? true),
    military: data.military,
    militaryHint: F("MilitaryHint", MILITARY),
    camera: camera !== null,
    panTiltZoom: data.panTiltZoom,
    ptzHint: F("PtzHint", { cost: PTZ_COST, year: camera?.ptzYear ?? "", modifier: signed(camera ? cameraPenalty(camera, true) : 0) }),
    lines,
  };
}

/** The drone's figures as lines, for its sheet and the vehicle's. */
export function droneLines(doc: any): string[] {
  const data = droneData(doc);
  if (!isDrone(data)) return [];
  const skill = String(doc?.system?.vehicle?.skill ?? "").trim() || L("Piloting");
  const lines: string[] = [];
  if (data.autopilot > 0) lines.push(F("AutopilotLine", { skill, level: data.autopilot, dodge: data.autopilotDodge }));
  if (data.remoteBonus > 0) lines.push(F("RemoteLine", { bonus: signed(data.remoteBonus) }));
  if (data.controlRangeMiles > 0) lines.push(F("RangeLine", { miles: data.controlRangeMiles }));
  if (data.ceilingFeet > 0) lines.push(F("CeilingLine", { feet: data.ceilingFeet.toLocaleString("en-US") }));
  return lines;
}

function droneContext(item: any): Record<string, unknown> {
  return { editable: Boolean(item?.isOwner ?? true), data: droneData(item), lines: droneLines(item) };
}

function battlefieldListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement>("[data-ht-battlefield]").forEach((input) => {
    input.addEventListener("change", async () => {
      await storeDevice(item, { [String(input.dataset.htBattlefield)]: input.checked });
    });
  });
}

function droneListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement>("[data-ht-drone]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.htDrone);
      const value = Math.max(0, Number(input.value) || 0);
      await item.update({ [`system.extensions.${MODULE_ID}.${DRONE}.${field}`]: field === "controlRangeMiles" ? value : Math.floor(value) });
    });
  });
}

// ── surveillance cameras (HT:EE p. 45) ──────────────────────────────────────

/** A character's best hiding skill against a watcher, or Stealth's DX-5 default (p. B222). */
function hidingLevel(api: GWorldApi, actor: any): { skill: string; level: number } {
  const known = HIDING_SKILLS.map((skill) => ({ skill, level: api.actors.skillLevel(actor, skill) }))
    .filter((s): s is { skill: (typeof HIDING_SKILLS)[number]; level: number } => typeof s.level === "number")
    .sort((a, b) => b.level - a.level)[0];
  return known ?? { skill: "Stealth", level: (api.actors.attribute(actor, "DX") ?? 10) - 5 };
}

/**
 * Watching through a surveillance camera (HT:EE p. 45): Observation at the
 * camera's penalty; a Quick Contest against the targeted character's best
 * hiding skill. A pan/tilt/zoom camera may be spotted by an intruder's
 * Vision roll.
 */
export async function watchCamera(api: GWorldApi, item: any, actor: any): Promise<void> {
  const camera = cameraOf(nameOf(item));
  if (!actor || !camera) return;
  const ptz = deviceData(item).panTiltZoom;
  const penalty = cameraPenalty(camera, ptz);
  const modifiers = penalty ? [{ label: F(ptz ? "CameraPtzLabel" : "CameraLabel", { name: item.name }), value: penalty }] : [];
  // Observation defaults to Per-5 (p. B211).
  const base = api.actors.skillLevel(actor, OBSERVATION) ?? (api.actors.attribute(actor, "Per") ?? 10) - 5;
  const label = F("WatchLabel", { name: item.name });
  const target = picked().target;
  if (target) {
    const hider = hidingLevel(api, target);
    await api.roll.quickContest({
      label,
      first: { actor, base, modifiers, note: OBSERVATION },
      second: { actor: target, base: hider.level, note: hider.skill },
      tags: ["detection", "vision", "surveillance"],
    } as any);
  } else {
    await api.roll.success({ actor, base, skill: OBSERVATION, label, modifiers, tags: ["detection", "vision", "surveillance"], item } as any);
  }
  if (ptz) await card(actor, label, [L("PtzSpotted")]);
}

// ── the seismic ground sensor (HT:EE p. 45) ─────────────────────────────────

/**
 * Listening for footsteps or vehicles with a seismic ground sensor (HT:EE
 * p. 45): Electronics Operation (Surveillance), with the Size and Speed/Range
 * Table's bonuses for the source's size and speed and its penalty for the
 * range; the targeted character's SM and distance to start with.
 */
export async function seismicListen(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const target = picked().target;
  const sm = Number(target?.system?.sm) || 0;
  const measured = target ? yardsBetween(actor, target) : null;
  const answer = await ask(L("SeismicTitle"),
    row(L("SourceSm"), `<input type="number" name="sm" value="${sm}" step="1" style="width:80px" />`)
    + row(L("SourceSpeed"), numberInput("speed", 1, "any"))
    + row(L("Range"), numberInput("range", Math.round(measured ?? 10))),
    (form) => ({ sm: number(form, "sm"), speed: number(form, "speed"), range: number(form, "range") }));
  if (!answer) return;
  const modifiers = seismicModifiers(answer, (yards) => api.rules.speedRangeModifier(yards)).map((l) => ({ label: L(`SeismicMod.${l.key}`), value: l.value }));
  await api.roll.success({
    actor, base: skillBase(api, actor, SURVEILLANCE), skill: SURVEILLANCE, label: F("SeismicLabel", { name: item.name }),
    modifiers, tags: ["detection", "surveillance"], item, ...(target ? { subject: target } : {}),
  } as any);
}

// ── chaff (HT:EE p. 45) ─────────────────────────────────────────────────────

/** The packages of chaff an actor has out, this turn. */
function chaffOf(api: GWorldApi, actor: any): number {
  const state = api.combat.getCombatState(actor, MODULE_ID, CHAFF_STATE) as { packages?: number } | undefined;
  return Math.max(0, Math.floor(Number(state?.packages) || 0));
}

/**
 * The chaff around a target: its own, its crew's where it is a vehicle, and
 * its vehicle's and fellow crew's where it rides in one.
 */
export function chaffAround(api: GWorldApi, target: any): number {
  if (!target) return 0;
  const seen = new Set<any>();
  const add = (actor: any) => { if (actor) seen.add(actor); };
  add(target);
  if (target.type === "vehicle") crewOf(target).forEach(add);
  const aboard = vehicleAboard(api, target);
  if (aboard) {
    add(aboard);
    crewOf(aboard).forEach(add);
  }
  return [...seen].reduce((sum, actor) => sum + chaffOf(api, actor), 0);
}

/** Dumps chaff: packages off the carried stack, their penalty until the dumper's next turn (HT:EE p. 45). */
export async function dumpChaff(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const stock = Math.max(0, Math.floor(Number(item?.system?.quantity) || 0));
  if (stock <= 0) return void ui.notifications?.warn(L("NoChaff"));
  const answer = await ask(L("ChaffTitle"), row(L("Packages"), `<input type="number" name="packages" value="1" min="1" max="${stock}" step="1" style="width:80px" />`), (form) => ({ packages: number(form, "packages") }));
  if (!answer) return;
  const packages = Math.min(stock, Math.max(1, Math.floor(answer.packages)));
  const out = chaffOf(api, actor) + packages;
  await api.combat.setCombatState(actor, MODULE_ID, CHAFF_STATE, { packages: out }, "turn");
  await item.update({ "system.quantity": stock - packages });
  await card(actor, F("ChaffCard", { name: actor.name }), [F("ChaffDumped", { packages, modifier: chaffPenalty(out) })]);
}

/** Whether an item is a radar of High-Tech's (pp. 45-46). */
const isRadar = (item: any) => ACTIVE_SENSORS[nameOf(item)]?.kind === "radar";

/**
 * Whether an attack is made by a missile homing on its target by radar
 * (HT:EE p. 49): the seeker the attack option chose, or the record's own.
 */
function homesByRadar(context: any): boolean {
  const item = context?.item;
  if (!item) return false;
  const mode = item.system?.rangedModes?.[Number(context.mode?.index) || 0];
  if (!homes(mode)) return false;
  const choice = chosenSeeker(item, context.options);
  return choice !== null && seekerOf(choice) === "radar";
}

// ── reconnaissance drones (HT:EE p. 46) ─────────────────────────────────────

/** Rolls a drone's autopilot: its Piloting, or its Dodge for avoiding an obstacle (HT:EE p. 46). */
export async function rollAutopilot(api: GWorldApi, drone: any, speaker: any, what: "piloting" | "dodge"): Promise<void> {
  const data = droneData(drone);
  const base = what === "dodge" ? data.autopilotDodge : data.autopilot;
  if (base <= 0) return void ui.notifications?.warn(L("NoAutopilot"));
  const skill = what === "dodge" ? "Dodge" : String(drone?.system?.vehicle?.skill ?? "").trim() || L("Piloting");
  await api.roll.success({
    actor: speaker, base, skill,
    label: F(what === "dodge" ? "AutopilotDodgeLabel" : "AutopilotLabel", { name: drone.name, skill }),
    tags: ["autopilot"], item: drone.documentName === "Actor" ? null : drone,
  } as any);
}

async function askAutopilot(): Promise<"piloting" | "dodge" | null> {
  const answer = await ask(L("AutopilotTitle"),
    row(L("AutopilotRoll"), `<select name="what"><option value="piloting">${esc(L("RollPiloting"))}</option><option value="dodge">${esc(L("RollDodge"))}</option></select>`),
    (form) => form.querySelector<HTMLSelectElement>("[name=what]")?.value === "dodge" ? "dodge" as const : "piloting" as const);
  return answer;
}

/** A drone token's height, in feet, from its elevation in yards. */
function heightFeet(actor: any): number | null {
  const token = actor?.getActiveTokens?.()?.[0];
  const elevation = Number(token?.document?.elevation);
  return Number.isFinite(elevation) ? elevation * 3 : null;
}

/**
 * The GM tool for a drone on the map (HT:EE p. 46): the selected drone's
 * controller range to the targeted operator and its ceiling, read from the
 * map, and its autopilot's roll.
 */
export async function droneTool(api: GWorldApi): Promise<void> {
  const drone = picked().selected;
  if (!drone || !isHighTechDrone(drone)) return void ui.notifications?.warn(L("PickDrone"));
  const data = droneData(drone);
  const operator = picked().target;
  const lines = [...droneLines(drone)];
  const yards = operator ? yardsBetween(drone, operator) : null;
  if (operator && yards !== null && data.controlRangeMiles > 0) {
    lines.push(F(withinControlRange(data, yards) ? "InRange" : "OutOfRange", { name: operator.name, miles: Math.round((yards / 1760) * 10) / 10 }));
  }
  const feet = heightFeet(drone);
  if (feet !== null && data.ceilingFeet > 0 && aboveCeiling(data, feet)) lines.push(F("AboveCeiling", { feet: Math.round(feet).toLocaleString("en-US") }));
  await card(drone, F("DroneCard", { name: drone.name }), lines);
  if (operator) await offerControls(drone, operator);
  if (data.autopilot <= 0 && data.autopilotDodge <= 0) return;
  const what = await askAutopilot();
  if (what) await rollAutopilot(api, drone, drone, what);
}

/**
 * Offers to hand a drone's controls to the targeted operator, who flies it
 * from outside its crew (HT:EE p. 46): the vehicle's `controller` (API
 * 1.154.0), which the vehicle sheet's Control button then rolls for, as a
 * remote roll. Nothing is asked where he already has them or rides in it.
 */
export async function offerControls(drone: any, operator: any): Promise<boolean> {
  const uuid = String(operator?.uuid ?? "");
  if (!uuid || drone?.documentName !== "Actor" || drone.type !== "vehicle") return false;
  if (String(drone.system?.controller ?? "") === uuid) return false;
  if ((drone.system?.crew ?? []).some((seat: any) => String(seat?.uuid ?? "") === uuid)) return false;
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("ControlsTitle") },
    content: `<p>${esc(F("ControlsAsk", { drone: drone.name, name: operator.name }))}</p>`,
    rejectClose: false,
  });
  if (!yes) return false;
  await drone.update({ "system.controller": uuid });
  return true;
}

// ── registration ────────────────────────────────────────────────────────────

/** Registers the sections, buttons, GM tool and hooks. */
export function readyBattlefield(api: GWorldApi, on: BattlefieldSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-battlefield-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-battlefield-item.hbs`,
    visible: (item) => on.sensors() && battlefieldGear(item),
    context: (item) => battlefieldContext(item),
    listeners: (element, item) => battlefieldListeners(element, item),
  });
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-drone-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-drone-item.hbs`,
    visible: (item) => on.drones() && isVehicle(item) && (bookOf(item) === null || bookOf(item) === "high-tech"),
    context: (item) => droneContext(item),
    listeners: (element, item) => droneListeners(element, item),
  });

  // Pan/tilt/zoom: $300 more on a surveillance camera (HT:EE p. 45).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-camera-ptz",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.sensors() || !takesDeviceStatistics(item) || !cameraOf(nameOf(item)) || !deviceData(item).panTiltZoom) return null;
      return { cost: price.cost + PTZ_COST, weight: price.weight, label: L("Ptz") };
    },
  });

  // Military gear: HT 12 and DR 8, save what the record states (HT:EE p. 45).
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    if (!on.sensors() || !takesDeviceStatistics(context?.item)) return;
    const data = deviceData(context.item);
    if (!data.military) return;
    const stats = militaryStatistics({ ht: data.ht, dr: data.dr });
    context.ht = stats.ht;
    context.dr = stats.dr;
    context.notes?.push?.(L("MilitaryNote"));
  });

  // Chaff: -2 per package to a ranged attack at the craft made with a radar lock, or by a missile
  // homing on it by radar (HT:EE pp. 45, 49: chaff is cut to a targeting radar's wavelength).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.sensors() || context?.mode?.ranged !== true || !Array.isArray(context?.modifiers)) return;
    const locked = lockedSensor(api, context.actor, context.targets ?? []);
    let target: any = null;
    if (locked && isRadar(locked.item)) {
      const uuid = lockTargetOf(api, context.actor);
      target = (context.targets ?? []).find((t: any) => String(t?.uuid) === uuid) ?? null;
    } else if (on.seekers?.() && homesByRadar(context)) target = (context.targets ?? [])[0] ?? null;
    if (!target) return;
    const penalty = chaffPenalty(chaffAround(api, target));
    if (penalty) context.modifiers.push({ label: F("ChaffModifier", { name: target.name }), value: penalty });
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!Array.isArray(context?.modifiers)) return;
    // Chaff against a radar operator's roll on the craft (HT:EE p. 45).
    if (on.sensors() && context.skill === SENSORS) {
      const subject = context.subject ?? context.opponent ?? null;
      const penalty = chaffPenalty(chaffAround(api, subject));
      if (penalty) context.modifiers.push({ label: F("ChaffModifier", { name: subject?.name ?? "" }), value: penalty });
    }
    // The remote control's bonus to the operator's Piloting, within the controller's range; past
    // it the operator can't fly the drone at all, and the roll is refused (HT:EE p. 46; a vehicle
    // control roll can be refused since API 1.144.0). On a drone on the map it is the remote
    // operator's roll, tagged `remoteControl` (API 1.154.0: the vehicle's `controller`, not in its
    // crew); one of its crew aboard flies it by hand. A drone carried as gear is never remote to
    // the system, and its holder flies it by the remote control.
    const tags: string[] = context.tags ?? [];
    const remote = tags.includes("remoteControl") || context.vehicle?.documentName !== "Actor";
    if (on.drones() && tags.includes("vehicleControl") && remote && context.vehicle && isHighTechDrone(context.vehicle)) {
      const data = droneData(context.vehicle);
      const yards = context.vehicle.documentName === "Actor" ? yardsBetween(context.vehicle, context.actor) : null;
      if (!withinControlRange(data, yards)) {
        if (typeof context.refusal !== "string" || !context.refusal.trim()) {
          context.refusal = F("OutOfRangeRefusal", { name: context.vehicle.name, miles: Math.round(((yards ?? 0) / 1760) * 10) / 10 });
        }
        return;
      }
      // Above its ceiling the controls can't reach it (HT:EE p. 46): the GM brings the token down.
      const feet = context.vehicle.documentName === "Actor" ? heightFeet(context.vehicle) : null;
      if (aboveCeiling(data, feet)) {
        if (typeof context.refusal !== "string" || !context.refusal.trim()) {
          context.refusal = F("AboveCeilingRefusal", { name: context.vehicle.name, feet: Math.round(feet ?? 0).toLocaleString("en-US"), ceiling: data.ceilingFeet.toLocaleString("en-US") });
        }
        return;
      }
      if (data.remoteBonus > 0) context.modifiers.push({ label: L("RemoteModifier"), value: data.remoteBonus });
    }
  });

  // The drone's figures on the vehicle actor's Hnd/SR hint (HT:EE p. 46).
  Hooks.on(api.data.hooks.vehicleStats, (context: any) => {
    if (!on.drones() || !context?.vehicle || !Array.isArray(context.lines) || !isHighTechDrone(context.vehicle)) return;
    for (const label of droneLines(context.vehicle)) context.lines.push({ label });
  });

  const named = (test: (item: any) => boolean) => (item: any) => isGear(item) && test(item);
  const actions = [
    { key: "ht-camera-watch", label: L("WatchTitle"), icon: "fa-solid fa-video", visible: named((item) => on.sensors() && takesDeviceStatistics(item) && cameraOf(nameOf(item)) !== null), run: (item: any, actor: any) => watchCamera(api, item, actor) },
    { key: "ht-seismic-listen", label: L("SeismicTitle"), icon: "fa-solid fa-shoe-prints", visible: named((item) => on.sensors() && isSeismicSensor(nameOf(item))), run: (item: any, actor: any) => seismicListen(api, item, actor) },
    { key: "ht-chaff-dump", label: L("ChaffTitle"), icon: "fa-solid fa-wind", visible: named((item) => on.sensors() && isChaff(nameOf(item))), run: (item: any, actor: any) => dumpChaff(api, item, actor) },
    {
      key: "ht-drone-autopilot", label: L("AutopilotTitle"), icon: "fa-solid fa-helicopter",
      visible: (item: any) => on.drones() && isVehicle(item) && isHighTechDrone(item) && droneData(item).autopilot > 0,
      run: async (item: any, actor: any) => { const what = await askAutopilot(); if (what) await rollAutopilot(api, item, actor, what); },
    },
  ];
  for (const action of actions) api.sheets.registerRowAction({ module: MODULE_ID, itemTypes: ["equipment"], ...action });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ht-recon-drone", label: L("DroneTool"), icon: "fa-solid fa-helicopter", visible: on.drones, open: () => droneTool(api) });
}
