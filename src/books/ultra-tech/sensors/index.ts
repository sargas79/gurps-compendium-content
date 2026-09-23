/**
 * GURPS Ultra-Tech's communicators and sensors, registered with the system
 * through the add-on API (pp. 42-46, 60-67): the book's table for the shared
 * comms and sensors engine (`src/shared/sensors/`), which does the pricing,
 * the item sheet section, the comm and sweep GM tools, the lock and worn
 * optics as senses, and what this book prints alone.
 *
 *   - **Communicators:** a comm's range by size and TL on its sheet, receive-
 *     and transmit-only comms and quantum channels priced, and, on the comm
 *     tool, a quantum channel's tenth, and whether a laser microphone or
 *     homing beacon reaches.
 *   - **Sensors:** worn optics grant Night Vision, Infravision, Hyperspectral
 *     Vision and Telescopic Vision; sound detectors, chemsniffers and sensor
 *     gloves their bonuses; tactical sensors priced; an active sensor's range,
 *     LPI and emissions on its sheet; a lock gives +3 to hit with targeting
 *     software, which an ESM warns of with +1 to Dodge; a row action for a
 *     chemsniffer's or sound detector's Electronics Operation (Sensors) task;
 *     and the sweep, with ladar, spoofing, force screens, jammers and reflec.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  ACTIVE_TARGETING,
  F as SF,
  SENSOR_TABLES,
  ask,
  card,
  carried,
  distanceText,
  esc,
  initSensors,
  itemTl,
  lockTargetOf,
  lockedSensor,
  readySensors,
  row,
  sensorData,
  skillBase,
  tlOf,
  type SensorTable,
} from "../../../shared/sensors/index.js";
import type { CommPair, SensorData, SensorFigures, SensorParts, SweepContext, WornSenses } from "../../../shared/sensors/data.js";
import { beamEnvironment } from "../beams/index.js";
import { reflecAgainstRadar } from "../armor/index.js";
import { jammersAgainst, spoofFools } from "../stealth/index.js";
import {
  ACTIVE_RANGES,
  CONCEALED_WEAPONS,
  ESM_DODGE,
  INFRARED_TRACKING,
  LADAR,
  SOUND_DETECTOR,
  VISUAL_SENSORS,
  activeByName,
  activeRangePenalty,
  activeTlFactor,
  airSonarRange,
  CELL_DETECTION,
  QUANTUM_CHANNEL,
  canHaveQuantumChannel,
  chemsnifferWorks,
  gravscannerDetection,
  homingBeaconRange,
  isTargetingSoftware,
  laserMicrophoneRange,
  sensorTasks,
  hydrophoneDetection,
  radscannerDetection,
  slowedRangeFactor,
  chemsnifferBonuses,
  commByName,
  commModeFactors,
  commRange,
  emissionDetectionRange,
  magnificationAt,
  mixedRange,
  sensorGloveBonus,
  tacticalFactor,
  visualSenses,
  type CommMode,
} from "./rules.js";

export { ACTIVE_TARGETING, lockedSensor };

const NS = "GCC.UT";
const L = (key: string) => game.i18n.localize(`${NS}.Sensor.${key}`);
const F = (key: string, data: Record<string, unknown>) => SF(NS, key, data);
const distance = (yards: number) => distanceText(NS, yards);

/** The book's two switches, as full keys. */
export interface SensorSwitches {
  communicators: string;
  sensors: string;
}

/** A passive detector's bonus by size and TL (pp. 62-63). */
function passiveLine(item: any): string {
  const name = String(item?.name ?? "");
  const tl = Math.max(itemTl(item), tlOf(item?.actor?.system?.tl) ?? 0);
  const hydrophone = /^(Small|Medium|Large) Hydrophone$/i.exec(name)?.[1]?.toLowerCase();
  if (hydrophone) return F("Hydrophone", { bonus: hydrophoneDetection(hydrophone as any, tl), tl });
  const grav = /^(Very Large|Large|Medium|Small) Gravscanner$/i.exec(name)?.[1]?.toLowerCase();
  if (grav) return F("Gravscanner", { bonus: gravscannerDetection((grav === "very large" ? "veryLarge" : grav) as any, tl), tl });
  const rad = /^(Large|Medium|Small) Radscanner$/i.exec(name)?.[1]?.toLowerCase();
  if (rad) return F("Radscanner", { bonus: radscannerDetection(rad as any, tl), tl, cells: Object.entries(CELL_DETECTION).map(([cell, mod]) => `${cell} ${mod >= 0 ? "+" : ""}${mod}`).join(", ") });
  if (/^homing beacon$/i.test(name)) return F("BeaconRange", { range: distance(homingBeaconRange(tl)), tl });
  const mike = laserMicrophoneRange(name, tl);
  if (mike !== null) return F("MikeRange", { range: distance(mike), tl });
  const tasks = sensorTasks(name, itemTl(item));
  if (tasks) return tasks.map((task) => F(`Task.${task.key}`, { bonus: task.bonus })).join(" ");
  return "";
}

/** The comm's and sensor's lines and options on its item sheet, or null where neither applies. */
function sheet(item: any, data: SensorData, on: SensorParts): { lines: string[]; modes: boolean; options: string[] } | null {
  const tl = itemTl(item);
  const name = String(item?.name ?? "");
  const lines: string[] = [];
  const options: string[] = [];
  const comm = on.comms ? commByName(name) : null;
  if (comm) {
    const range = commRange(comm.family, comm.size, tl);
    const quantum = data.options.quantum && canHaveQuantumChannel(comm.family);
    if (range !== null) lines.push(F("CommRange", { range: distance(range * (quantum ? QUANTUM_CHANNEL.range : 1)), tl }));
    if (quantum) lines.push(L("QuantumLine"));
    if (comm.family === "radio") lines.push(L("RadioCuts"));
    if (data.commMode) lines.push(L(`CommMode.${data.commMode}`));
    if (canHaveQuantumChannel(comm.family)) options.push("quantum");
  }
  const active = on.active ? activeByName(name) : null;
  if (active) {
    const figures = ACTIVE_RANGES[active.kind][active.size];
    const factor = activeTlFactor(active.kind, tl);
    const range = figures.range * factor * (data.options.lpi ? 0.5 : 1);
    lines.push(F("ActiveRange", { range: distance(range), tl }));
    if (figures.imaging) lines.push(F("ImagingRange", { range: distance(figures.imaging * factor * (data.options.lpi ? 0.5 : 1)) }));
    lines.push(F("Emissions", { range: distance(emissionDetectionRange(figures.range * factor, data.options.lpi)) }));
    if (data.options.tactical) lines.push(F("Tactical", { factor: tacticalFactor(active.kind) }));
    options.push("tactical", "lpi");
  }
  if (comm) lines.push(F("SlowedData", { quarter: slowedRangeFactor(1 / 4), hundredth: slowedRangeFactor(1 / 100), tenThousandth: slowedRangeFactor(1 / 10000) }));
  // Sonar in air (p. 65), at the pressure the GM set for the scene's beams.
  const environment = beamEnvironment();
  if (active?.kind === "sonar" && !environment.underwater) {
    const atmospheres = environment.atmospheres;
    lines.push(atmospheres > 0
      ? F("AirSonar", { range: distance(airSonarRange(ACTIVE_RANGES.sonar[active.size].range * activeTlFactor("sonar", tl), atmospheres)), atmospheres })
      : L("VacuumSonar"));
  }
  const passive = on.passive ? passiveLine(item) : "";
  if (passive) lines.push(passive);
  const visual = on.visual ? VISUAL_SENSORS[name] : undefined;
  if (visual) {
    const introduced = Number(/\d+/.exec(String(item.system?.tl ?? ""))?.[0]) || 9;
    const campaign = tlOf(item.actor?.system?.tl) ?? introduced;
    const magnification = magnificationAt(visual, introduced, Math.max(introduced, campaign));
    lines.push(F(`Visual.${visual.kind}`, { magnification, nightVision: visual.nightVision }));
  }
  if (!comm && !active && !passive && !visual) return null;
  return { lines, modes: Boolean(comm), options };
}

/** What receive- and transmit-only comms, tactical sensors and quantum channels do to price and weight (pp. 46-47, 64-66). */
function price(item: any, data: SensorData, on: SensorParts): { cost: number; weight: number } | null {
  const name = String(item?.name ?? "");
  const comm = on.comms ? commByName(name) : null;
  const active = on.active ? activeByName(name) : null;
  if (!comm && !active) return null;
  let cost = 1;
  let weight = 1;
  if (comm && data.commMode) {
    const factors = commModeFactors(comm.family, data.commMode);
    cost *= factors.cost;
    weight *= factors.weight;
  }
  if (active && data.options.tactical) cost *= tacticalFactor(active.kind);
  if (comm && data.options.quantum && canHaveQuantumChannel(comm.family)) cost *= QUANTUM_CHANNEL.cost;
  return { cost, weight };
}

/** Worn optics as senses (pp. 60-61); sound detectors, chemsniffers and sensor gloves sharpen hearing, smell and touch (pp. 61-62, 67). */
function senses(item: any, actor: any, _data: SensorData, on: SensorParts): WornSenses | null {
  const name = String(item?.name ?? "");
  const visual = VISUAL_SENSORS[name];
  if (visual) {
    if (!on.visual) return null;
    const introduced = itemTl(item);
    const campaign = Math.max(introduced, tlOf(actor?.system?.tl) ?? introduced);
    const worn = visualSenses({ ...visual, magnification: magnificationAt(visual, introduced, campaign), tl: introduced });
    if (!worn) return null;
    return {
      ...(worn.nightVision ? { nightVision: worn.nightVision } : {}),
      ...(worn.infravision ? { infravision: true } : {}),
      ...(worn.hyperspectral ? { hyperspectral: true } : {}),
      ...(worn.telescopic ? { telescopic: worn.telescopic } : {}),
    };
  }
  if (!on.passive) return null;
  if (/sound detector$/i.test(name)) return { acute: { hearing: SOUND_DETECTOR.hearing } };
  if (/chemsniffer$/i.test(name)) {
    const acute = chemsnifferBonuses(itemTl(item)).acute;
    return acute ? { acute: { tasteSmell: acute } } : null;
  }
  if (/^sensor gloves$/i.test(name)) return { acute: { touch: sensorGloveBonus(itemTl(item)) } };
  return null;
}

/** Two comms' range: the smaller's at the lower TL, times the steps between their sizes; a quantum channel's tenth (pp. 43, 47). */
function pairRange({ a, b }: CommPair): { range: number; lines: string[] } {
  const ca = commByName(String(a.item.name))!;
  const cb = commByName(String(b.item.name))!;
  const tl = Math.min(itemTl(a.item), itemTl(b.item));
  let range = mixedRange(ca.family, ca.size, cb.size, tl) ?? 0;
  const quantum = canHaveQuantumChannel(ca.family) && (sensorData(a.item).options.quantum || sensorData(b.item).options.quantum);
  if (quantum) range *= QUANTUM_CHANNEL.range;
  return { range, lines: quantum ? [L("QuantumLine")] : [] };
}

/**
 * With or without a pair of comms: a homing beacon the target carries, and a
 * laser microphone the selected character aims at the target (p. 105).
 */
function commExtras(api: GWorldApi, selected: any, target: any): Array<(yards: number) => Promise<string[]>> {
  const extras: Array<(yards: number) => Promise<string[]>> = [];
  const beacon = [...(target.items ?? [])].find((i: any) => carried(i) && /^homing beacon$/i.test(String(i.name)));
  if (beacon) {
    extras.push(async (yards) => {
      const range = homingBeaconRange(itemTl(beacon));
      return [F(yards <= range ? "BeaconHeard" : "BeaconLost", { name: beacon.name, range: distance(range) })];
    });
  }
  const mike = [...(selected.items ?? [])].filter(carried).find((i: any) => laserMicrophoneRange(String(i.name), itemTl(i)) !== null);
  if (mike) {
    extras.push(async (yards) => {
      const range = laserMicrophoneRange(String(mike.name), itemTl(mike))!;
      if (yards > range) return [F("MikeOut", { name: mike.name, range: distance(range) })];
      const skill = "Electronics Operation (Surveillance)";
      await api.roll.success({ actor: selected, base: skillBase(api, selected, skill), skill, label: F("MikeLabel", { name: mike.name }) } as any);
      return [F("MikeIn", { name: mike.name, range: distance(range) })];
    });
  }
  return extras;
}

/** A sweep with an active sensor at a distance (pp. 63-66). */
async function sweep({ api, selected, target, sensors, measured }: SweepContext): Promise<void> {
  const answer = await ask(L("SweepTitle"),
    row(L("Sensor"), `<select name="sensor">${sensors.map((s, i) => `<option value="${i}">${esc(s.item.name)}</option>`).join("")}</select>`)
    + row(L("Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? 100)}" min="0" style="width:90px" />`)
    + row(L("Imaging"), `<input type="checkbox" name="imaging" />`)
    + row(L("LadarUnknown"), `<input type="checkbox" name="unknown" />`)
    + row(L("Spoof"), `<input type="checkbox" name="spoof" />`),
    (form) => ({
      index: Number(form.querySelector<HTMLSelectElement>("[name=sensor]")?.value) || 0,
      yards: Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0,
      imaging: Boolean(form.querySelector<HTMLInputElement>("[name=imaging]")?.checked),
      unknown: Boolean(form.querySelector<HTMLInputElement>("[name=unknown]")?.checked),
      spoof: Boolean(form.querySelector<HTMLInputElement>("[name=spoof]")?.checked),
    }));
  if (!answer) return;
  const chosen = sensors[answer.index] ?? sensors[0]!;
  const active = activeByName(String(chosen.item.name))!;
  const data = sensorData(chosen.item);
  const figures = ACTIVE_RANGES[active.kind][active.size];
  const environment = beamEnvironment();
  const inWater = (answer.imaging && figures.imaging ? figures.imaging : figures.range) * activeTlFactor(active.kind, itemTl(chosen.item));
  // Out of the water, sonar reaches a tenth as far times the scene's pressure (p. 65).
  const base = active.kind === "sonar" && !environment.underwater ? airSonarRange(inWater, environment.atmospheres) : inWater;
  const modifiers: Array<{ label: string; value: number }> = [];
  const penalty = activeRangePenalty(answer.yards, base, data.options.lpi);
  if (penalty) modifiers.push({ label: F("RangeLine", { range: distance(data.options.lpi ? base / 2 : base) }), value: penalty });
  if (active.kind === "ladar") modifiers.push({ label: L(answer.unknown ? "LadarUnknown" : "LadarIdentify"), value: answer.unknown ? LADAR.unknown : LADAR.identify });
  // An opaque or cloaking force screen is invisible to active sensors (p. 192).
  const screened = target ? [...(target.items ?? [])].find((i: any) => i?.type === "armor" && i.system?.equipped === true && (i.system?.extensions?.[MODULE_ID]?.utField?.opaque === true || i.system?.extensions?.[MODULE_ID]?.utField?.cloaking === true)) : null;
  if (screened) return void ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: selected }), content: `<div class="gworld gworld-chat"><div class="gc-result">${esc(F("ScreenHides", { name: target.name, screen: screened.name }))}</div></div>` });
  // Jammers on the target (p. 99): their penalty, or, spoofing, a roll to see through them.
  const sensorKind = active.kind === "radar" ? (answer.imaging ? "imagingRadar" : "radar") : active.kind === "sonar" ? "sonar" : "active";
  const jammers = target ? jammersAgainst(target, sensorKind) : [];
  const spoofing = jammers.length > 0 && answer.spoof;
  if (!spoofing) for (const jammer of jammers) modifiers.push({ label: jammer.name, value: jammer.penalty });
  // Reflec is an excellent radar reflector (p. 173).
  const reflec = target && active.kind === "radar" ? reflecAgainstRadar(target) : null;
  if (reflec) modifiers.push(reflec);
  const skill = active.kind === "sonar" ? "Electronics Operation (Sonar)" : "Electronics Operation (Sensors)";
  const result: any = await api.roll.success({ actor: selected, base: skillBase(api, selected, skill), skill, label: F("SweepLabel", { sensor: chosen.item.name }), modifiers, tags: ["detection", sensorKind], ...(target ? { subject: target } : {}) } as any);
  if (result && spoofing) {
    const worst = Math.min(...jammers.map((j) => j.penalty));
    await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: selected }), content: `<div class="gworld gworld-chat"><div class="gc-result">${esc(L(spoofFools(result.margin, result.success, worst) ? "Spoofed" : "SeesThrough"))}</div></div>` });
  }
}

/** Whether a character carries targeting software, which a lock's +3 needs (p. 63). */
function hasTargetingSoftware(actor: any): boolean {
  return [...(actor?.items ?? [])].some((i: any) => i?.system?.carried !== false && isTargetingSoftware(String(i?.name ?? "")));
}

const MODES: readonly CommMode[] = ["", "receiver", "transmitter"];

const FIGURES: SensorFigures = {
  options: ["quantum", "tactical", "lpi"],
  commModes: MODES,
  comm: (item) => {
    const comm = commByName(String(item?.name ?? ""));
    return comm ? { family: comm.family, size: comm.size, range: commRange(comm.family, comm.size, itemTl(item)), cuts: comm.family === "radio" ? "radio" : null } : null;
  },
  active: (item, data) => {
    const active = activeByName(String(item?.name ?? ""));
    return active ? { kind: active.kind, range: ACTIVE_RANGES[active.kind][active.size].range * activeTlFactor(active.kind, itemTl(item)) * (data.options.lpi ? 0.5 : 1) } : null;
  },
  senses,
  sheet,
  price,
  pairRange,
  commExtras,
  sweep,
  canLock: () => true,
  lockCounts: hasTargetingSoftware,
};

/** Ultra-Tech's comms and sensors table, behind the book's own two switches. */
export function ultraTechSensors(switches: SensorSwitches): SensorTable {
  return {
    book: "ultra-tech",
    tls: { min: 9, max: 12 },
    switches: { comms: switches.communicators, active: switches.sensors, visual: switches.sensors, passive: switches.sensors },
    i18n: NS,
    figures: FIGURES,
  };
}

/** Registers the table, and what must exist before the world's data is read. */
export function initUltraTechSensors(switches: SensorSwitches): void {
  SENSOR_TABLES.register(ultraTechSensors(switches));
  initSensors();
}

/** An active sensor item's range in yards at its TL, halved with LPI, or null for anything else (pp. 63-66). */
export function activeSensorRange(item: any): number | null {
  return FIGURES.active(item, sensorData(item))?.range ?? null;
}

/** A chemsniffer's or sound detector's Electronics Operation (Sensors) roll for a task it helps (pp. 61-62). */
async function senseTask(api: GWorldApi, item: any, actor: any): Promise<void> {
  const tasks = sensorTasks(String(item?.name ?? ""), itemTl(item));
  if (!tasks || !actor) return;
  const chemsniffer = /chemsniffer$/i.test(String(item.name));
  const answer = await ask(L("TaskTitle"),
    row(L("TaskLabel"), `<select name="task">${tasks.map((t, i) => `<option value="${i}">${esc(F(`Task.${t.key}`, { bonus: t.bonus }))}</option>`).join("")}</select>`)
    + (chemsniffer ? row(L("Sealed"), `<input type="checkbox" name="sealed" />`) : ""),
    (form) => ({
      index: Number(form.querySelector<HTMLSelectElement>("[name=task]")?.value) || 0,
      sealed: Boolean(form.querySelector<HTMLInputElement>("[name=sealed]")?.checked),
    }));
  if (!answer) return;
  if (chemsniffer && !chemsnifferWorks(beamEnvironment(), answer.sealed)) return void card(actor, L("TaskTitle"), [F("NoScent", { name: item.name })]);
  const task = tasks[answer.index] ?? tasks[0]!;
  const skill = "Electronics Operation (Sensors)";
  await api.roll.success({ actor, base: skillBase(api, actor, skill), skill, label: F("TaskRoll", { name: item.name }), modifiers: [{ label: F(`Task.${task.key}`, { bonus: task.bonus }), value: task.bonus }] } as any);
}

/** Registers the engine's parts, once whichever books ask, and what this book prints alone. */
export function readyUltraTechSensors(api: GWorldApi, on: { communicators: () => boolean; sensors: () => boolean }): void {
  readySensors(api);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-sensor-task",
    itemTypes: ["equipment"],
    label: L("TaskTitle"),
    icon: "fa-solid fa-magnifying-glass",
    visible: (item) => on.sensors() && Boolean(sensorTasks(String(item?.name ?? ""), itemTl(item))),
    run: (item, actor) => senseTask(api, item, actor),
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!on.sensors() || !actor || !skill) return;
    const items = [...(actor.items ?? [])];
    const worn = (i: any) => (i?.type === "equipment" || i?.type === "armor") && i.system?.equipped === true;
    const best = (entries: Array<{ label: string; value: number }>) => entries.sort((a, b) => b.value - a.value)[0];
    if (/^tracking\b/i.test(skill)) {
      const line = best([
        ...items.filter((i: any) => carried(i) && /chemsniffer$/i.test(String(i.name))).map((i: any) => ({ label: String(i.name), value: chemsnifferBonuses(itemTl(i)).tracking })),
        ...items.filter((i: any) => worn(i) && VISUAL_SENSORS[String(i.name)]?.kind === "infrared").map((i: any) => ({ label: F("HeatTrail", { name: i.name }), value: INFRARED_TRACKING })),
      ]);
      if (line) context.modifiers.push(line);
    }
    if (/^shadowing\b/i.test(skill)) {
      const detector = items.find((i: any) => carried(i) && /sound detector$/i.test(String(i.name)));
      if (detector) context.modifiers.push({ label: F("NoisyTarget", { name: detector.name }), value: SOUND_DETECTOR.shadowing });
    }
    if (/^search\b/i.test(skill)) {
      const lines: Array<{ label: string; value: number }> = [];
      for (const i of items.filter(carried)) {
        const active = activeByName(String(i.name));
        if (active?.kind === "terahertz") lines.push({ label: F("ConcealedWeapons", { name: i.name }), value: CONCEALED_WEAPONS.terahertz });
        if (active?.kind === "radar") lines.push({ label: F("ConcealedWeapons", { name: i.name }), value: CONCEALED_WEAPONS.imagingRadar });
      }
      const line = best(lines);
      if (line) context.modifiers.push(line);
    }
  });

  // An ESM warns of an attack aimed with an active targeting sensor: +1 to Dodge (p. 62).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    const defender = context?.defender;
    const attacker = context?.attacker;
    if (!on.sensors() || !defender || !attacker || context?.defense !== "dodge") return;
    const esm = [...(defender.items ?? [])].find((i: any) => carried(i) && /esm detector$/i.test(String(i.name)));
    if (!esm) return;
    if (lockTargetOf(api, attacker) === String(defender.uuid)) context.modifiers.push({ label: String(esm.name), value: ESM_DODGE });
  });
}
