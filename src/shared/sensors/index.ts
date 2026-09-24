/**
 * The comms and sensors engine, registered with the system through the add-on
 * API, for every book that prints the rule (Ultra-Tech pp. 42-46, 60-67;
 * High-Tech pp. 36-40, 45-50).
 *
 * Each book registers its table in `SENSOR_TABLES` -- its figures, its
 * switches and its text -- then calls `initSensors` and `readySensors`, which
 * register once however many books call them. What they register reads the
 * item's own book's table on every call:
 *
 *   - **init:** the comm and sensor fields on equipment and armour: how a comm
 *     is built, and every book's options.
 *   - **ready:** the options' price; an item sheet section with what the comm
 *     or sensor does at its TL and its options; a GM tool for whether two
 *     characters' comms reach each other (a radio cut in cities and for live
 *     video, slowed data where the book offers it) and the roll to stretch the
 *     range (or the book's own roll to pick up the signal, with its own rows
 *     in the dialog), with whatever else the book checks between them; a GM tool for a
 *     sweep with an active sensor, which the sensor's book runs; a row action
 *     to lock a sensor onto the target, and the lock's +3 to an aimed ranged
 *     attack at it; and worn optics and detectors as senses, with the
 *     disadvantages some impose while in use.
 *
 * What a book prints alone -- Ultra-Tech's chemsniffers and ESM, High-Tech's
 * telegraphy and direction finders -- it registers itself, with the helpers
 * here.
 */

import { isRuleOn } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import {
  SENSOR_TABLES,
  activeOf,
  commOf,
  partsOn,
  registerSensorData,
  sensorData,
  sensorTableOf,
  storeSensor,
  type ActiveSensor,
  type CommPair,
  type SensorTable,
  type WornSenses,
} from "./data.js";
import { radioRangeFactor, rangeExtensionModifier, slowedRangeFactor, TARGETING_LOCK } from "./rules.js";

export { SENSOR_TABLES, activeOf, commOf, partsOn, sensorData, sensorTableOf, type SensorTable };

export const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Sensor.${key}`);
export const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Sensor.${key}`, data);
export const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** The combat state a lock is kept in, under the name worlds already hold it by. */
const LOCK = "utSensorLock";

/** Registers what must exist before the world's data is read. */
export function initSensors(): void {
  registerSensorData();
}

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";
/** A tech level as a number: "11^" is 11. */
export const tlOf = (value: unknown): number | null => {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
};
/** The TL an item was made at, TL9 where it says none. */
export const itemTl = (item: any) => tlOf(item?.system?.tl) ?? 9;
export const worn = (item: any) => isGear(item) && item.system?.equipped === true;
export const carried = (item: any) => isGear(item) && item.system?.carried !== false;

/** A distance in yards as a sheet shows it, in a book's words. */
export function distanceText(ns: string, yards: number): string {
  const mile = 1760;
  const parsec = 19.2e12 * mile;
  if (!Number.isFinite(yards)) return L(ns, "Anywhere");
  if (yards >= parsec / 1000) return F(ns, "Parsecs", { value: Math.round((yards / parsec) * 1000) / 1000 });
  if (yards >= mile) return F(ns, "Miles", { value: Math.round((yards / mile) * 10) / 10 });
  return F(ns, "Yards", { value: yards < 1 ? Math.round(yards * 10) / 10 : Math.round(yards) });
}

/** Yards between two actors' tokens, or null where the map can't say. */
export function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const ta = a?.getActiveTokens?.()?.[0];
  const tb = b?.getActiveTokens?.()?.[0];
  if (!ta?.center || !tb?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([ta.center, tb.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/** The selected token's character and the targeted token's. */
export const picked = () => ({
  selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
  target: [...((game as any).user?.targets ?? [])][0]?.actor ?? null,
});

/** Asks for a few fields in a dialog; null when closed. */
export async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
/** A dialog row: a label and its input. */
export const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;

/** Posts lines to chat as a tool's card. */
export async function card(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>` });
}

/** Posts one line to chat, with no title. */
export async function say(actor: any, line: string): Promise<void> {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<div class="gworld gworld-chat"><div class="gc-result">${esc(line)}</div></div>` });
}

/** A character's level with a skill, or its IQ-5 default (p. B189). */
export function skillBase(api: GWorldApi, actor: any, skill: string): number {
  return api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
}

/** Locks a sensor onto a target until the combat ends (Ultra-Tech p. 63; High-Tech p. 45). */
export async function setLock(api: GWorldApi, actor: any, item: any, target: any): Promise<void> {
  await api.combat.setCombatState(actor, MODULE_ID, LOCK, { targetUuid: String(target.uuid), itemId: String(item.id) }, "combat");
}

/** The target a character's sensor is locked onto, as its uuid, or null. */
export function lockTargetOf(api: GWorldApi, actor: any): string | null {
  const lock = api.combat.getCombatState(actor, MODULE_ID, LOCK) as { targetUuid?: string } | undefined;
  return lock?.targetUuid ?? null;
}

/**
 * The sensor a character has locked onto one of these targets, and whether
 * it's a tactical sensor, or null. A key other listeners read: where a
 * listener set `context[ACTIVE_TARGETING]`, the lock's +3 is already replaced
 * by active-sensor targeting (Ultra-Tech p. 150).
 */
export function lockedSensor(api: GWorldApi, actor: any, targets: any[]): { item: any; tactical: boolean } | null {
  const lock = api.combat.getCombatState(actor, MODULE_ID, LOCK) as { targetUuid: string; itemId: string } | undefined;
  if (!lock || !(targets ?? []).some((t) => String(t?.uuid) === lock.targetUuid)) return null;
  const item = actor?.items?.get?.(lock.itemId);
  return item ? { item, tactical: sensorData(item).options.tactical === true } : null;
}
export const ACTIVE_TARGETING = `${MODULE_ID}.activeTargeting`;

/** The item sheet section's context, for an item its table knows. */
function itemContext(item: any, table: SensorTable): Record<string, unknown> {
  const data = sensorData(item);
  const ns = table.i18n;
  const shown = table.figures.sheet(item, data, partsOn(table)) ?? { lines: [], modes: false, options: [] };
  const cap = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
  return {
    title: L(ns, "Title"),
    lines: shown.lines,
    modeLabel: L(ns, "CommModeLabel"),
    modeHint: L(ns, "CommModeHint"),
    modes: shown.modes ? table.figures.commModes.map((value) => ({ value, label: L(ns, `CommMode.${value || "both"}`), selected: value === data.commMode })) : null,
    options: shown.options.map((key) => ({ key, label: L(ns, `${cap(key)}Label`), hint: L(ns, `${cap(key)}Hint`), checked: data.options[key] === true })),
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-sensor]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
      void storeSensor(item, String(input.dataset.gccSensor), value);
    });
  });
}

/** The table that shows an item's sheet section, or null. */
function sheetTable(item: any): SensorTable | null {
  if (!isGear(item)) return null;
  const data = sensorData(item);
  const table = sensorTableOf(item, (t) => t.figures.sheet(item, data, partsOn(t)) !== null);
  return table && table.figures.sheet(item, data, partsOn(table)) ? table : null;
}

/** The first table with one of these switches on: the one whose words name a tool. */
const firstOn = (part: "comms" | "active") => SENSOR_TABLES.all.find((t) => isRuleOn(t.switches[part])) ?? SENSOR_TABLES.all[0] ?? null;

/**
 * Whether the selected character's comm reaches the targeted character's
 * (Ultra-Tech p. 43; High-Tech p. 38): a pair from one book and of one
 * family, its range cut for a radio in a city or underground and for live
 * video (for an underwater comm, in rough water), slowed data where the book
 * offers it on the tool, and the roll to stretch it. The book adds whatever
 * else it checks between the two.
 */
async function commCheck(api: GWorldApi): Promise<void> {
  const tool = firstOn("comms");
  if (!tool) return;
  const { selected, target } = picked();
  if (!selected || !target) return void ui.notifications?.warn(L(tool.i18n, "CommPick"));
  const comms = (actor: any) => [...(actor.items ?? [])].filter(carried).map((item: any) => ({ item, found: commOf(item) })).filter((c) => c.found);
  const mine = comms(selected);
  const theirs = comms(target);
  const pair = mine.flatMap((a) => theirs.filter((b) => b.found!.table === a.found!.table && b.found!.comm.family === a.found!.comm.family).map((b) => [a, b] as const))[0];
  const extras = SENSOR_TABLES.all.filter((t) => isRuleOn(t.switches.comms)).flatMap((t) => t.figures.commExtras?.(api, selected, target) ?? []);
  if (!pair && !extras.length) return void ui.notifications?.warn(L(tool.i18n, "NoPair"));
  const table = pair?.[0].found!.table ?? tool;
  const ns = table.i18n;
  const cuts = pair?.[0].found!.comm.cuts ?? null;
  const rates = pair ? table.figures.dataRates ?? [] : [];
  const measured = yardsBetween(selected, target);
  const pairOf = (p: NonNullable<typeof pair>): CommPair => ({ a: { item: p[0].item, comm: p[0].found!.comm }, b: { item: p[1].item, comm: p[1].found!.comm } });
  // The book's own rows for this pair, where it prints more than the shared rule.
  const own = pair ? table.figures.commFields?.(pairOf(pair)) ?? null : null;
  const answer = await ask(L(ns, "CommTitle"),
    row(L(ns, "Distance"), `<input type="number" name="yards" value="${Math.round(measured ?? 1000)}" min="0" style="width:90px" />`)
    + (cuts === "radio" ? row(L(ns, "Urban"), `<input type="checkbox" name="urban" />`) + row(L(ns, "AudioVisual"), `<input type="checkbox" name="av" />`) : "")
    + (cuts === "water" ? row(L(ns, "RoughWater"), `<input type="checkbox" name="urban" />`) : "")
    + (rates.length ? row(L(ns, "DataRate"), `<select name="rate">${rates.map((r) => `<option value="${r}">${esc(r === 1 ? L(ns, "FullSpeed") : F(ns, "Fraction", { denominator: Math.round(1 / r) }))}</option>`).join("")}</select>`) : "")
    + (own?.html ?? ""),
    (form) => ({
      yards: Number(form.querySelector<HTMLInputElement>("[name=yards]")?.value) || 0,
      urban: Boolean(form.querySelector<HTMLInputElement>("[name=urban]")?.checked),
      audioVisual: Boolean(form.querySelector<HTMLInputElement>("[name=av]")?.checked),
      rate: Number(form.querySelector<HTMLSelectElement>("[name=rate]")?.value) || 1,
      own: own ? own.read(form) : {},
    }));
  if (!answer) return;
  const yards = answer.yards;
  const lines: string[] = [];

  if (pair) {
    const [a, b] = pair;
    const context = { api, yards, answers: answer.own ?? {} };
    const reading = await table.figures.pairRange(pairOf(pair), context);
    let range = reading.range;
    if (cuts) range *= radioRangeFactor(answer);
    if (answer.rate < 1) range *= slowedRangeFactor(answer.rate);
    lines.push(F(ns, "CommPair", { a: a.item.name, b: b.item.name, range: distanceText(ns, range), distance: distanceText(ns, yards) }));
    if (cuts === "radio" && answer.urban) lines.push(L(ns, "UrbanLine"));
    if (cuts === "radio" && answer.audioVisual) lines.push(L(ns, "AudioVisualLine"));
    if (cuts === "water" && answer.urban) lines.push(L(ns, "RoughWaterLine"));
    if (answer.rate < 1) lines.push(F(ns, "DataRateLine", { denominator: Math.round(1 / answer.rate), factor: slowedRangeFactor(answer.rate) }));
    lines.push(...reading.lines);
    const modifier = Number.isFinite(range) ? rangeExtensionModifier(yards, range) : 0;
    // A book that prints its own roll to pick up the signal makes it in place of the stretch.
    const reception = table.figures.reception?.(pairOf(pair), { ...context, range, stretch: modifier }) ?? null;
    if (reception) {
      lines.push(...reception.lines);
      const roll = reception.roll;
      if (roll) await api.roll.success({ actor: selected, base: skillBase(api, selected, roll.skill), skill: roll.skill, label: roll.label, modifiers: roll.modifiers, tags: roll.tags } as any);
    } else if (modifier === 0) lines.push(L(ns, "InRange"));
    else if (modifier === null) lines.push(L(ns, "OutOfRange"));
    else {
      lines.push(F(ns, "Stretch", { modifier }));
      await api.roll.success({ actor: selected, base: skillBase(api, selected, "Electronics Operation (Communications)"), skill: "Electronics Operation (Communications)", label: L(ns, "StretchLabel"), modifiers: [{ label: L(ns, "StretchLine"), value: modifier }] } as any);
    }
  }

  for (const extra of extras) lines.push(...(await extra(yards)));

  await card(selected, L(ns, "CommTitle"), lines);
}

/**
 * A sweep with an active sensor (Ultra-Tech pp. 63-66; High-Tech pp. 45-46):
 * the selected character's sensors, from one book -- asked which where they
 * carry more than one book's -- swept as that book runs it.
 */
async function sensorSweep(api: GWorldApi): Promise<void> {
  const tool = firstOn("active");
  if (!tool) return;
  const { selected, target } = picked();
  if (!selected) return void ui.notifications?.warn(L(tool.i18n, "SweepPick"));
  const found = [...(selected.items ?? [])].filter(carried).map((item: any) => ({ item, found: activeOf(item) })).filter((s) => s.found);
  if (!found.length) return void ui.notifications?.warn(L(tool.i18n, "NoSensor"));
  const tables = [...new Set(found.map((s) => s.found!.table))];
  let table = tables[0]!;
  if (tables.length > 1) {
    const choice = await ask(L(tool.i18n, "SweepTitle"),
      row(L(tool.i18n, "Sensor"), `<select name="sensor">${found.map((s, i) => `<option value="${i}">${esc(s.item.name)}</option>`).join("")}</select>`),
      (form) => Number(form.querySelector<HTMLSelectElement>("[name=sensor]")?.value) || 0);
    if (choice === null) return;
    table = found[choice]?.found!.table ?? table;
  }
  const sensors: Array<{ item: any; active: ActiveSensor }> = found.filter((s) => s.found!.table === table).map((s) => ({ item: s.item, active: s.found!.active }));
  await table.figures.sweep({ api, table, selected, target, sensors, measured: target ? yardsBetween(selected, target) : null });
}

/** Locks a sensor onto the targeted token: it takes an Aim, and lasts the combat. */
async function lockOn(api: GWorldApi, item: any, actor: any, table: SensorTable): Promise<void> {
  const target = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!target) return void ui.notifications?.warn(L(table.i18n, "LockPick"));
  await setLock(api, actor, item, target);
  await say(actor, F(table.i18n, table.figures.lockCounts(actor) ? "Locked" : "LockedNoSoftware", { sensor: item.name, target: target.name }));
}

/** A worse Restricted Vision than the one set, never a better one. */
const RESTRICTED = [null, "noPeripheral", "tunnel"] as const;

/** Adds what a worn item does for the senses to the character's trait effects, and says where it came from. */
function applySenses(context: any, label: string, senses: WornSenses): void {
  const effects = context.effects;
  const source = (effect: string, value?: number) => context.sources.push(value === undefined ? { effect, label } : { effect, label, value });
  if (senses.nightVision && senses.nightVision > (Number(effects.nightVision) || 0)) {
    effects.nightVision = senses.nightVision;
    source("nightVision", senses.nightVision);
  }
  if (senses.infravision && !effects.infravision) {
    effects.infravision = true;
    source("infravision");
  }
  if (senses.hyperspectral && !effects.hyperspectralVision) {
    effects.hyperspectralVision = true;
    source("hyperspectralVision");
  }
  if (senses.telescopic && senses.telescopic > (Number(effects.telescopicVision) || 0)) {
    effects.telescopicVision = senses.telescopic;
    source("telescopicVision", senses.telescopic);
  }
  if (senses.parabolicHearing && senses.parabolicHearing > (Number(effects.parabolicHearing) || 0)) {
    effects.parabolicHearing = senses.parabolicHearing;
    source("parabolicHearing", senses.parabolicHearing);
  }
  if (senses.protectedVision && effects.protectedSense && !effects.protectedSense.vision) {
    effects.protectedSense.vision = true;
    source("protectedSense.vision");
  }
  for (const sense of ["hearing", "tasteSmell", "touch"] as const) {
    const bonus = senses.acute?.[sense];
    if (!bonus || !effects.acute) continue;
    effects.acute[sense] = (Number(effects.acute[sense]) || 0) + bonus;
    source(`acute.${sense}`, bonus);
  }
  if (senses.colorblindness) {
    effects.colorblindness = true;
    source("colorblindness");
  }
  if (senses.noDepthPerception) {
    effects.noDepthPerception = true;
    source("noDepthPerception");
  }
  if (senses.restrictedVision) {
    if (RESTRICTED.indexOf(senses.restrictedVision) > RESTRICTED.indexOf(effects.restrictedVision ?? null)) effects.restrictedVision = senses.restrictedVision;
    source(`restrictedVision.${senses.restrictedVision}`);
  }
}

/** What each worn optic or detector does for its wearer's senses, from the tables whose switches are on. */
export function wornSenses(actor: any): Array<{ item: any; senses: WornSenses }> {
  const found: Array<{ item: any; senses: WornSenses }> = [];
  for (const item of actor?.items ?? []) {
    if (!worn(item)) continue;
    const data = sensorData(item);
    const table = sensorTableOf(item, (t) => t.figures.senses(item, actor, data, partsOn(t)) !== null);
    const senses = table ? table.figures.senses(item, actor, data, partsOn(table)) : null;
    if (senses) found.push({ item, senses });
  }
  return found;
}

let readied = false;

/** Registers the table-side parts, once whichever books ask. */
export function readySensors(api: GWorldApi): void {
  if (readied) return;
  readied = true;

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "sensor",
    types: ["equipment"],
    apply: (item, price) => {
      const data = sensorData(item);
      const table = sensorTableOf(item, (t) => t.figures.price(item, data, partsOn(t)) !== null);
      const factors = table ? table.figures.price(item, data, partsOn(table)) : null;
      if (!table || !factors || (factors.cost === 1 && factors.weight === 1)) return null;
      return { cost: Math.round(price.cost * factors.cost * 100) / 100, weight: Math.round(price.weight * factors.weight * 1000) / 1000, label: L(table.i18n, "Title") };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "sensor-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/sensor-item.hbs`,
    visible: (item) => sheetTable(item) !== null,
    context: (item) => itemContext(item, sheetTable(item)!),
    listeners: (element, item) => itemListeners(element, item),
  });

  const anyPartOn = (part: "comms" | "active") => () => SENSOR_TABLES.all.some((t) => isRuleOn(t.switches[part]));
  api.sheets.registerGmTool({ module: MODULE_ID, key: "comm-range", label: L(firstOn("comms")?.i18n ?? "GCC.UT", "CommTitle"), icon: "fa-solid fa-tower-broadcast", visible: anyPartOn("comms"), open: () => commCheck(api) });
  api.sheets.registerGmTool({ module: MODULE_ID, key: "sensor-sweep", label: L(firstOn("active")?.i18n ?? "GCC.UT", "SweepTitle"), icon: "fa-solid fa-satellite-dish", visible: anyPartOn("active"), open: () => sensorSweep(api) });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "sensor-lock",
    itemTypes: ["equipment"],
    label: L(SENSOR_TABLES.all[0]?.i18n ?? "GCC.UT", "LockTitle"),
    icon: "fa-solid fa-crosshairs",
    visible: (item) => {
      const found = activeOf(item);
      return Boolean(found && found.table.figures.canLock(item, sensorData(item)));
    },
    run: (item, actor) => lockOn(api, item, actor, activeOf(item)!.table),
  });

  // Worn optics are senses while they're worn, and some impose disadvantages
  // while in use; worn detectors sharpen hearing, smell and touch.
  Hooks.on("gworld.traitEffects", (context: any) => {
    const actor = context?.actor;
    if (!actor || !context?.effects) return;
    for (const { item, senses } of wornSenses(actor)) applySenses(context, String(item.name), senses);
  });

  // A lock gives +3 to an aimed ranged attack at that target.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!context?.actor || context?.mode?.ranged !== true || context[ACTIVE_TARGETING]) return;
    const locked = lockedSensor(api, context.actor, context.targets ?? []);
    if (!locked) return;
    const table = sensorTableOf(locked.item);
    if (!table || !(partsOn(table).active || partsOn(table).passive) || !table.figures.lockCounts(context.actor)) return;
    context.modifiers.push({ label: F(table.i18n, "LockLine", { sensor: locked.item.name ?? "" }), value: TARGETING_LOCK });
  });
}
