/**
 * GURPS Ultra-Tech's communicators and sensors, registered with the system
 * through the add-on API (pp. 42-46, 60-67).
 *
 *   - **Communicators:** a comm's range by size and TL on its sheet, receive-
 *     and transmit-only comms priced, and a GM tool for whether two comms
 *     reach each other and what stretching the range takes.
 *   - **Sensors:** worn optics grant Night Vision, Infravision, Hyperspectral
 *     Vision and Telescopic Vision; sound detectors, chemsniffers and sensor
 *     gloves their bonuses; tactical sensors priced; an active sensor's range,
 *     LPI and emissions on its sheet; a row action to lock a sensor on the
 *     target for +3 to hit, which an ESM warns of with +1 to Dodge; and a GM
 *     tool for a sensor sweep at a distance.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { beamEnvironment } from "../beams/index.js";
import { jammersAgainst, spoofFools } from "../stealth/index.js";
import {
  ACTIVE_RANGES,
  CONCEALED_WEAPONS,
  ESM_DODGE,
  INFRARED_TRACKING,
  LADAR,
  SOUND_DETECTOR,
  TARGETING_LOCK,
  VISUAL_SENSORS,
  activeByName,
  activeRangePenalty,
  activeTlFactor,
  airSonarRange,
  CELL_DETECTION,
  gravscannerDetection,
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
  rangeExtensionModifier,
  sensorGloveBonus,
  tacticalFactor,
  visualSenses,
  type CommMode,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Sensor.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Sensor.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "sensor";
const LOCK = "utSensorLock";
const MODES: readonly CommMode[] = ["", "receiver", "transmitter"];

export interface SensorSwitches {
  communicators: () => boolean;
  sensors: () => boolean;
}

interface SensorData {
  commMode: CommMode;
  tactical: boolean;
  lpi: boolean;
}

export function initSensors(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      commMode: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...MODES] }),
      tactical: new f.BooleanField({ initial: false }),
      lpi: new f.BooleanField({ initial: false }),
    }),
  });
}

function sensorData(item: any): SensorData {
  const data = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return { commMode: MODES.includes(data.commMode) ? data.commMode : "", tactical: Boolean(data.tactical), lpi: Boolean(data.lpi) };
}

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
const tlOf = (value: unknown): number | null => {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
};
const itemTl = (item: any) => tlOf(item?.system?.tl) ?? 9;
const worn = (item: any) => isGear(item) && item.system?.equipped === true;
const carried = (item: any) => isGear(item) && item.system?.carried !== false;

/** A distance in yards as a sheet shows it. */
function distanceText(yards: number): string {
  const mile = 1760;
  const parsec = 19.2e12 * mile;
  if (yards >= parsec / 1000) return F("Parsecs", { value: Math.round((yards / parsec) * 1000) / 1000 });
  if (yards >= mile) return F("Miles", { value: Math.round((yards / mile) * 10) / 10 });
  return F("Yards", { value: Math.round(yards) });
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
  return "";
}

/** The TL an item was made at, for a comm or sensor: its own. */
function itemContext(item: any, on: SensorSwitches): Record<string, unknown> {
  const data = sensorData(item);
  const tl = itemTl(item);
  const lines: string[] = [];
  const comm = on.communicators() ? commByName(String(item.name)) : null;
  if (comm) {
    const range = commRange(comm.family, comm.size, tl);
    if (range !== null) lines.push(F("CommRange", { range: distanceText(range), tl }));
    if (data.commMode) lines.push(L(`CommMode.${data.commMode}`));
  }
  const active = on.sensors() ? activeByName(String(item.name)) : null;
  if (active) {
    const figures = ACTIVE_RANGES[active.kind][active.size];
    const factor = activeTlFactor(active.kind, tl);
    const range = figures.range * factor * (data.lpi ? 0.5 : 1);
    lines.push(F("ActiveRange", { range: distanceText(range), tl }));
    if (figures.imaging) lines.push(F("ImagingRange", { range: distanceText(figures.imaging * factor * (data.lpi ? 0.5 : 1)) }));
    lines.push(F("Emissions", { range: distanceText(emissionDetectionRange(figures.range * factor, data.lpi)) }));
    if (data.tactical) lines.push(F("Tactical", { factor: tacticalFactor(active.kind) }));
  }
  if (comm) lines.push(F("SlowedData", { quarter: slowedRangeFactor(1 / 4), hundredth: slowedRangeFactor(1 / 100), tenThousandth: slowedRangeFactor(1 / 10000) }));
  // Sonar in air (p. 65), at the pressure the GM set for the scene's beams.
  const environment = beamEnvironment();
  if (active?.kind === "sonar" && !environment.underwater) {
    const atmospheres = environment.atmospheres;
    lines.push(atmospheres > 0
      ? F("AirSonar", { range: distanceText(airSonarRange(ACTIVE_RANGES.sonar[active.size].range * activeTlFactor("sonar", tl), atmospheres)), atmospheres })
      : L("VacuumSonar"));
  }
  const passive = on.sensors() ? passiveLine(item) : "";
  if (passive) lines.push(passive);
  const visual = on.sensors() ? VISUAL_SENSORS[String(item.name)] : undefined;
  if (visual) {
    const introduced = Number(/\d+/.exec(String(item.system?.tl ?? ""))?.[0]) || 9;
    const campaign = tlOf(item.actor?.system?.tl) ?? introduced;
    const magnification = magnificationAt(visual, introduced, Math.max(introduced, campaign));
    lines.push(F(`Visual.${visual.kind}`, { magnification, nightVision: visual.nightVision }));
  }
  return {
    lines,
    comm: Boolean(comm),
    active: Boolean(active),
    modes: MODES.map((value) => ({ value, label: L(`CommMode.${value || "both"}`), selected: value === data.commMode })),
    data,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ut-sensor]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = String(input.dataset.gccUtSensor);
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      void item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.${field}`]: value });
    });
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

const picked = () => ({
  selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
  target: [...((game as any).user?.targets ?? [])][0]?.actor ?? null,
});

async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;

/** Whether the selected character's comm reaches the targeted character's (p. 43). */
async function commCheck(api: GWorldApi): Promise<void> {
  const { selected, target } = picked();
  if (!selected || !target) return void ui.notifications?.warn(L("CommPick"));
  const comms = (actor: any) => [...(actor.items ?? [])].filter(carried).map((item: any) => ({ item, comm: commByName(String(item.name)) })).filter((c) => c.comm);
  const mine = comms(selected);
  const theirs = comms(target);
  const pair = mine.flatMap((a) => theirs.filter((b) => b.comm!.family === a.comm!.family).map((b) => [a, b] as const))[0];
  if (!pair) return void ui.notifications?.warn(L("NoPair"));
  const [a, b] = pair;
  const tl = Math.min(itemTl(a.item), itemTl(b.item));
  const range = mixedRange(a.comm!.family, a.comm!.size, b.comm!.size, tl) ?? 0;
  const measured = yardsBetween(selected, target);
  const yards = measured ?? await ask(L("CommTitle"), row(L("Distance"), `<input type="number" name="yards" value="1000" min="0" style="width:90px" />`), (form) => Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0);
  if (yards === null) return;
  const modifier = rangeExtensionModifier(yards, range);
  const lines = [F("CommPair", { a: a.item.name, b: b.item.name, range: distanceText(range), distance: distanceText(yards) })];
  if (modifier === 0) lines.push(L("InRange"));
  else if (modifier === null) lines.push(L("OutOfRange"));
  else {
    lines.push(F("Stretch", { modifier }));
    await api.roll.success({ actor: selected, base: api.actors.skillLevel(selected, "Electronics Operation (Communications)") ?? (api.actors.attribute(selected, "IQ") ?? 10) - 5, skill: "Electronics Operation (Communications)", label: L("StretchLabel"), modifiers: [{ label: L("StretchLine"), value: modifier }] } as any);
  }
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: selected }), content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("CommTitle"))}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>` });
}

/** A sweep with an active sensor at a distance (pp. 63-66). */
async function sensorSweep(api: GWorldApi): Promise<void> {
  const { selected, target } = picked();
  if (!selected) return void ui.notifications?.warn(L("SweepPick"));
  const sensors = [...(selected.items ?? [])].filter(carried).map((item: any) => ({ item, active: activeByName(String(item.name)) })).filter((s) => s.active);
  if (!sensors.length) return void ui.notifications?.warn(L("NoSensor"));
  const measured = target ? yardsBetween(selected, target) : null;
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
  const active = chosen.active!;
  const data = sensorData(chosen.item);
  const figures = ACTIVE_RANGES[active.kind][active.size];
  const environment = beamEnvironment();
  const inWater = (answer.imaging && figures.imaging ? figures.imaging : figures.range) * activeTlFactor(active.kind, itemTl(chosen.item));
  // Out of the water, sonar reaches a tenth as far times the scene's pressure (p. 65).
  const base = active.kind === "sonar" && !environment.underwater ? airSonarRange(inWater, environment.atmospheres) : inWater;
  const modifiers: Array<{ label: string; value: number }> = [];
  const penalty = activeRangePenalty(answer.yards, base, data.lpi);
  if (penalty) modifiers.push({ label: F("RangeLine", { range: distanceText(data.lpi ? base / 2 : base) }), value: penalty });
  if (active.kind === "ladar") modifiers.push({ label: L(answer.unknown ? "LadarUnknown" : "LadarIdentify"), value: answer.unknown ? LADAR.unknown : LADAR.identify });
  // Jammers on the target (p. 99): their penalty, or, spoofing, a roll to see through them.
  const sensorKind = active.kind === "radar" ? (answer.imaging ? "imagingRadar" : "radar") : active.kind === "sonar" ? "sonar" : "active";
  const jammers = target ? jammersAgainst(target, sensorKind) : [];
  const spoofing = jammers.length > 0 && answer.spoof;
  if (!spoofing) for (const jammer of jammers) modifiers.push({ label: jammer.name, value: jammer.penalty });
  const skill = active.kind === "sonar" ? "Electronics Operation (Sonar)" : "Electronics Operation (Sensors)";
  const result: any = await api.roll.success({ actor: selected, base: api.actors.skillLevel(selected, skill) ?? (api.actors.attribute(selected, "IQ") ?? 10) - 5, skill, label: F("SweepLabel", { sensor: chosen.item.name }), modifiers } as any);
  if (result && spoofing) {
    const worst = Math.min(...jammers.map((j) => j.penalty));
    await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: selected }), content: `<div class="gworld gworld-chat"><div class="gc-result">${esc(L(spoofFools(result.margin, result.success, worst) ? "Spoofed" : "SeesThrough"))}</div></div>` });
  }
}

/** Locks a sensor onto the targeted token (p. 63): it takes an Aim, and lasts the combat. */
async function lockOn(api: GWorldApi, item: any, actor: any): Promise<void> {
  const target = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!target) return void ui.notifications?.warn(L("LockPick"));
  await api.combat.setCombatState(actor, MODULE_ID, LOCK, { targetUuid: String(target.uuid), itemId: String(item.id) }, "combat");
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<div class="gworld gworld-chat"><div class="gc-result">${esc(F("Locked", { sensor: item.name, target: target.name }))}</div></div>` });
}

export function readySensors(api: GWorldApi, on: SensorSwitches): void {
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ut-sensor",
    types: ["equipment"],
    apply: (item, price) => {
      const data = sensorData(item);
      let cost = price.cost;
      let weight = price.weight;
      const comm = on.communicators() ? commByName(String(item.name)) : null;
      if (comm && data.commMode) {
        const factors = commModeFactors(comm.family, data.commMode);
        cost *= factors.cost;
        weight *= factors.weight;
      }
      const active = on.sensors() ? activeByName(String(item.name)) : null;
      if (active && data.tactical) cost *= tacticalFactor(active.kind);
      if (cost === price.cost && weight === price.weight) return null;
      return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 1000) / 1000, label: L("Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-sensor-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-sensor-item.hbs`,
    visible: (item) => (on.communicators() && Boolean(commByName(String(item?.name)))) || (on.sensors() && (Boolean(activeByName(String(item?.name))) || Boolean(VISUAL_SENSORS[String(item?.name)]) || Boolean(passiveLine(item)))),
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-comm-range", label: L("CommTitle"), icon: "fa-solid fa-tower-broadcast", visible: on.communicators, open: () => commCheck(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "ut-sensor-sweep", label: L("SweepTitle"), icon: "fa-solid fa-satellite-dish", visible: on.sensors, open: () => sensorSweep(api) });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-sensor-lock",
    itemTypes: ["equipment"],
    label: L("LockTitle"),
    icon: "fa-solid fa-crosshairs",
    visible: (item) => on.sensors() && Boolean(activeByName(String(item?.name))),
    run: (item, actor) => lockOn(api, item, actor),
  });

  // Worn optics are senses while they're worn (pp. 60-61); sound detectors,
  // chemsniffers and sensor gloves sharpen hearing, smell and touch (pp. 61-62, 67).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!on.sensors()) return;
    const actor = context?.actor;
    const effects = context?.effects;
    if (!actor || !effects) return;
    for (const item of actor.items ?? []) {
      if (!worn(item)) continue;
      const name = String(item.name);
      const visual = VISUAL_SENSORS[name];
      if (visual) {
        const introduced = itemTl(item);
        const campaign = Math.max(introduced, tlOf(actor.system?.tl) ?? introduced);
        const senses = visualSenses({ ...visual, magnification: magnificationAt(visual, introduced, campaign), tl: introduced });
        if (!senses) continue;
        if (senses.nightVision > (Number(effects.nightVision) || 0)) {
          effects.nightVision = senses.nightVision;
          context.sources.push({ effect: "nightVision", label: name, value: senses.nightVision });
        }
        if (senses.infravision && !effects.infravision) {
          effects.infravision = true;
          context.sources.push({ effect: "infravision", label: name });
        }
        if (senses.hyperspectral && !effects.hyperspectralVision) {
          effects.hyperspectralVision = true;
          context.sources.push({ effect: "hyperspectralVision", label: name });
        }
        if (senses.telescopic > (Number(effects.telescopicVision) || 0)) {
          effects.telescopicVision = senses.telescopic;
          context.sources.push({ effect: "telescopicVision", label: name, value: senses.telescopic });
        }
        continue;
      }
      if (/sound detector$/i.test(name) && effects.acute) {
        effects.acute.hearing = (Number(effects.acute.hearing) || 0) + SOUND_DETECTOR.hearing;
        context.sources.push({ effect: "acute.hearing", label: name, value: SOUND_DETECTOR.hearing });
      }
      if (/chemsniffer$/i.test(name) && effects.acute) {
        const acute = chemsnifferBonuses(itemTl(item)).acute;
        if (acute) {
          effects.acute.tasteSmell = (Number(effects.acute.tasteSmell) || 0) + acute;
          context.sources.push({ effect: "acute.tasteSmell", label: name, value: acute });
        }
      }
      if (/^sensor gloves$/i.test(name) && effects.acute) {
        const bonus = sensorGloveBonus(itemTl(item));
        effects.acute.touch = (Number(effects.acute.touch) || 0) + bonus;
        context.sources.push({ effect: "acute.touch", label: name, value: bonus });
      }
    }
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const skill = String(context?.skill ?? "");
    if (!on.sensors() || !actor || !skill) return;
    const items = [...(actor.items ?? [])];
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

  // A lock gives +3 to an aimed ranged attack at that target (p. 63).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.sensors() || !context?.actor || context?.mode?.ranged !== true) return;
    const lock = api.combat.getCombatState(context.actor, MODULE_ID, LOCK) as { targetUuid: string; itemId: string } | undefined;
    if (!lock) return;
    const targets = (context.targets ?? []) as any[];
    if (!targets.some((t) => String(t?.uuid) === lock.targetUuid)) return;
    const sensor = context.actor.items?.get?.(lock.itemId);
    context.modifiers.push({ label: F("LockLine", { sensor: sensor?.name ?? "" }), value: TARGETING_LOCK });
  });

  // An ESM warns of an attack aimed with an active targeting sensor: +1 to Dodge (p. 62).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    const defender = context?.defender;
    const attacker = context?.attacker;
    if (!on.sensors() || !defender || !attacker || context?.defense !== "dodge") return;
    const esm = [...(defender.items ?? [])].find((i: any) => carried(i) && /esm detector$/i.test(String(i.name)));
    if (!esm) return;
    const lock = api.combat.getCombatState(attacker, MODULE_ID, LOCK) as { targetUuid: string } | undefined;
    if (lock?.targetUuid === String(defender.uuid)) context.modifiers.push({ label: String(esm.name), value: ESM_DODGE });
  });

}
