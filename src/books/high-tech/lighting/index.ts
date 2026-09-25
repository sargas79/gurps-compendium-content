/**
 * The Electricity and Electronics supplement's electric light (HT:EE pp. 9,
 * 20-22), registered with the system through the add-on API under two
 * switches. The rules are in `rules.ts`.
 *
 *   - **Illumination (illumination):** a lamp's lux, from its rated wattage,
 *     its element and its geometry, and the darkness it leaves as it falls off
 *     with distance: read by the system for each light on the canvas that is
 *     a lamp (`areas.registerLightLevel`, API 1.116.0) -- a light the GM has
 *     made one of the supplement's lamps in its configuration sheet, a
 *     token's own light where its character carries one, or a lamp set down
 *     as a module's light on an area. A beam lights only its cone, pointed
 *     the way its light or token is turned; beside it, the darkness stays no
 *     worse than -9 as far as the light reaches. The least
 *     darkness a light leaves wins, and none makes the spot darker than it
 *     was. A GM tool reads the light at the selected tokens, and whether it
 *     is bright enough for reading or surgery (-2 without); Sewing and
 *     Surgery rolls take that -2 from the light at the roller's token. A row action aims
 *     a beam: DX at the darkness where it is aimed, or by ear at -6 (the
 *     skill no higher than 9) once a Hearing roll or a Quick Contest against
 *     the target's Stealth finds it, drifting left or right on a miss.
 *   - **Glare (lightDazzle):** light five steps above what the eyes are
 *     adapted to, or 200,000 lux, calls for an HT roll at -1 a step past
 *     that: a failure dazzles (-4 to Vision) for minutes, a critical failure
 *     blinds for seconds first (the system's imposed Blindness, API 1.120.0,
 *     at -10 to fight as someone not used to it). A flashbulb fired at the
 *     targets and a GM tool (an arc flash, or any light in lux) post the roll.
 *     Protected Vision and a Nictitating Membrane help as against a laser
 *     (the shared dazzle engine's reading).
 */

import { bookOf } from "../../../shared/book-tables.js";
import { eyeProtection } from "../../../shared/dazzle/rules.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  ARC_FLASH_LUX,
  BRIGHT_TASKS,
  DAYLIGHT_LUX,
  DAZZLED_VISION,
  ELEMENTS,
  ELEMENT_KEYS,
  FLASHBULB,
  BEAM_SPILL_DARKNESS,
  HEARD_AIM,
  LAMPS,
  NO_PENALTY_STEP,
  actualWatts,
  batteryMultiplier,
  beamDrift,
  brightTaskOf,
  brightTaskPenalty,
  darknessLux,
  flashbulbStepAt,
  glareOutcome,
  glareRoll,
  heardAim,
  inBeam,
  isBeam,
  lampDarknessAt,
  lampFrom,
  lampLux,
  lampNamed,
  lampStepAt,
  luxStep,
  refusedMargin,
  stepLux,
  type BrightTask,
  type Lamp,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Lighting.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Lighting.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** A lamp's settings, on the item (its wattage, element, a brighter element) or on a light the GM marked. */
export const LAMP_FLAG = "eeLamp";
const GLARE_CARD = "ee-glare";
const DAZZLED = "ee-dazzled";
const BLINDED = "ee-glare-blinded";
const FLASHBULB_NAME = /^flashbulb$/i;

export interface LightingSwitches {
  illumination: () => boolean;
  dazzle: () => boolean;
}

/** This book's gear, or gear from no book. */
const ownBook = (item: any): boolean => item?.type === "equipment" && [null, "high-tech"].includes(bookOf(item));
const carried = (item: any): boolean => item?.type === "equipment" && item.system?.carried !== false;

/** The lamp an item is, by its record's name, with the wattage and element set on it; null for anything else. */
export function lampOf(item: any): Lamp | null {
  if (!ownBook(item)) return null;
  const named = lampNamed(item?.name);
  return named ? lampFrom(item?.flags?.[MODULE_ID]?.[LAMP_FLAG], named) : null;
}

/**
 * The lamp a character's own light is: the brightest they carry that is lit
 * (High-Tech's light switch, where it has been used), else the brightest they
 * carry at all.
 */
export function carriedLamp(actor: any): { item: any; lamp: Lamp } | null {
  const lamps = [...(actor?.items ?? [])].filter(carried).map((item) => ({ item, lamp: lampOf(item) })).filter((l): l is { item: any; lamp: Lamp } => l.lamp !== null);
  const lit = lamps.filter((l) => l.item?.flags?.[MODULE_ID]?.expedition?.lit === true);
  const pool = lit.length ? lit : lamps;
  return pool.sort((a, b) => lampLux(b.lamp) - lampLux(a.lamp))[0] ?? null;
}

/** An item by its id, on a character on the map or in the world. */
function itemById(id: string): any {
  const tokens: any[] = stage()?.tokens?.placeables ?? [];
  for (const token of tokens) {
    const found = token?.actor?.items?.get?.(id);
    if (found) return found;
  }
  for (const actor of (game as any).actors ?? []) {
    const found = actor?.items?.get?.(id);
    if (found) return found;
  }
  return null;
}

/**
 * The lamp a module's light on an area is (GWorld API 1.102.0): a light set
 * down, whose area id names its item (`<module>-ht-light-<item id>-...`), read
 * as that item's lamp with its own wattage and element; else a lamp by the
 * area's label, the name of what was set down. Null for any other.
 */
export function lampOfArea(area: any): Lamp | null {
  if (!area || typeof area.id !== "string" || !area.light) return null;
  const itemId = new RegExp(`^${MODULE_ID}-ht-light-([A-Za-z0-9]+)`).exec(area.id)?.[1];
  const own = itemId ? lampOf(itemById(itemId)) : null;
  return own ?? lampNamed(area.label);
}

/** The lamp a light on the canvas is: one the GM marked, the lamp a token's character carries, or a lamp set down on an area; null for any other. */
export function lampOfLight(light: any): Lamp | null {
  if (light && !light.documentName && !light.document && light.light) return lampOfArea(light);
  const doc = light?.document ?? light;
  if (doc?.documentName === "AmbientLight") {
    const data = doc.flags?.[MODULE_ID]?.[LAMP_FLAG];
    const base = lampNamed(data?.lamp);
    return base ? lampFrom(data, base) : null;
  }
  if (doc?.documentName === "Token") return carriedLamp(doc.actor)?.lamp ?? null;
  return null;
}

/** While a spot's light is being measured, the lux each lamp that reaches it gives there. */
let measuring: number[] | null = null;

/**
 * Whether a spot lies in the beam of a lamp on the canvas: the light's (or
 * the token's) rotation is where it points, Foundry's 0 facing down the map.
 * A light on an area has no direction, and its lamp lights its whole circle.
 */
export function beamReaches(lamp: Lamp, light: any, spot: { x?: number; y?: number; distance?: number }): boolean {
  if (!isBeam(lamp)) return true;
  const doc = light?.document ?? light;
  if (doc?.documentName !== "Token" && doc?.documentName !== "AmbientLight") return true;
  const size = Number(stage()?.grid?.size) || 100;
  const centre = doc.documentName === "Token"
    ? (centreOf(doc.object) ?? { x: Number(doc.x) + ((Number(doc.width) || 1) * size) / 2, y: Number(doc.y) + ((Number(doc.height) || 1) * size) / 2 })
    : { x: Number(doc.x), y: Number(doc.y) };
  const dx = Number(spot?.x) - centre.x;
  const dy = Number(spot?.y) - centre.y;
  const pixels = Math.hypot(dx, dy);
  if (!Number.isFinite(pixels) || pixels === 0) return true;
  const perPixel = Number(spot?.distance) > 0 ? Number(spot.distance) / pixels : (Number(stage()?.grid?.distance) || 1) / size;
  const angle = (((Number(doc.rotation) || 0) + 90) * Math.PI) / 180;
  const along = (dx * Math.cos(angle) + dy * Math.sin(angle)) * perPixel;
  const off = (-dx * Math.sin(angle) + dy * Math.cos(angle)) * perPixel;
  return inBeam(lamp, along, off);
}

/** The darkness a lamp on the canvas leaves at a spot, for the system's reading (HT:EE p. 20). */
export function lampLevel(on: LightingSwitches, light: any, spot: { x?: number; y?: number; distance?: number }): number | null {
  if (!on.illumination()) return null;
  const lamp = lampOfLight(light);
  if (!lamp) return null;
  // Outside its beam, a beam in use still keeps the darkness around it no worse than -9 (HT:EE p. 20).
  if (!beamReaches(lamp, light, spot)) return BEAM_SPILL_DARKNESS;
  const yards = Math.max(0, Number(spot?.distance) || 0);
  measuring?.push(stepLux(lampStepAt(lamp, yards)));
  return lampDarknessAt(lamp, yards);
}

/** The light at a token: about how many lux, and the darkness and its penalty for the observer. */
export interface LightHere {
  lux: number;
  darkness: number;
  penalty: number;
}

/**
 * The light at a token: the system's reading of the darkness there, and the
 * lux of the brightest lamp reaching it -- else daylight's 10,000 lux, or the
 * least the darkness allows (HT:EE p. 20). Null off the map.
 */
export function lightAt(api: GWorldApi, token: any, observer: any = null): LightHere | null {
  const areas = api.areas as any;
  if (!token || typeof areas.darknessAt !== "function") return null;
  const lamps: number[] = [];
  measuring = lamps;
  let reading: any;
  try {
    reading = areas.darknessAt(null, token, observer ? { observer } : {});
  } finally {
    measuring = null;
  }
  if (!reading) return null;
  const ambient = reading.lighting?.daylight ? DAYLIGHT_LUX : darknessLux(Number(reading.darkness) || 0);
  return { lux: Math.max(ambient, ...lamps), darkness: Number(reading.darkness) || 0, penalty: Number(reading.penalty) || 0 };
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

// ── where things are on the map ──

const stage = () => (globalThis as any).canvas;
const centreOf = (token: any): { x: number; y: number } | null => {
  const c = token?.center ?? token?.object?.center;
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { x: c.x, y: c.y } : null;
};

function yardsBetween(a: any, b: any): number | null {
  const from = centreOf(a);
  const to = centreOf(b);
  const grid = stage()?.grid;
  if (!from || !to || !grid?.measurePath) return null;
  const distance = Number(grid.measurePath([from, to])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
const formatLux = (lux: number): string => (lux >= 1 ? Math.round(lux).toLocaleString("en") : String(Number(lux.toPrecision(2))));
const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

// ── the item sheet ──

/** What a lamp's sheet says: its light, how it falls off, and what it draws. */
export function lampLines(lamp: Lamp): string[] {
  const lux = lampLux(lamp);
  const lines = [isBeam(lamp)
    ? F(lamp.range > 0 ? "BeamLux" : "BeamLuxNoRange", { lux: formatLux(lux), range: lamp.range })
    : F("RadiusLux", { lux: formatLux(lux), geometry: L(`Geometry.${lamp.geometry}`) })];
  const at = (yards: number) => signed(-lampDarknessAt(lamp, yards)).replace(/^0$/, L("None"));
  const distances = isBeam(lamp) && lamp.range > 1 ? [lamp.range, lamp.range * 2, lamp.range * 10] : [1, 2, 5, 10, 100];
  lines.push(F("Falloff", { list: distances.map((d) => F("AtYards", { yards: d, penalty: at(d) })).join(", ") }));
  lines.push(lamp.brighter
    ? F("BrighterLine", { efficiency: ELEMENTS[lamp.element].efficiency })
    : F("DrawLine", { watts: Number(actualWatts(lamp).toFixed(2)), battery: batteryMultiplier(lamp) }));
  if (lamp.element === "neon") lines.push(L("NeonLine"));
  return lines;
}

function itemContext(item: any): Record<string, unknown> {
  const lamp = lampOf(item)!;
  return {
    editable: item.isOwner,
    watts: lamp.watts,
    brighter: lamp.brighter,
    elements: ELEMENT_KEYS.map((key) => ({ key, label: F("ElementOption", { name: L(`Element.${key}`), efficiency: ELEMENTS[key].efficiency }), selected: key === lamp.element })),
    lines: lampLines(lamp),
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const set = (key: string, value: unknown) => item.update({ [`flags.${MODULE_ID}.${LAMP_FLAG}.${key}`]: value });
  element.querySelector<HTMLInputElement>("[data-gcc-ee-lamp-watts]")?.addEventListener("change", (event) => {
    const watts = Number((event.currentTarget as HTMLInputElement).value);
    if (watts > 0) void set("watts", watts);
  });
  element.querySelector<HTMLSelectElement>("[data-gcc-ee-lamp-element]")?.addEventListener("change", (event) => {
    void set("element", (event.currentTarget as HTMLSelectElement).value);
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ee-lamp-brighter]")?.addEventListener("change", (event) => {
    void set("brighter", (event.currentTarget as HTMLInputElement).checked);
  });
}

// ── the GM's tools (HT:EE p. 20) ──

/**
 * The lamp fields added to a light's own configuration sheet: which of the
 * supplement's lamps it is (none, an ordinary light), and its rated watts,
 * element and a brighter element, each left blank to keep the lamp's own.
 * Their names are the light's flag, so the sheet saves them with the light.
 */
export function lampConfigFields(doc: any): string {
  const data = doc?.flags?.[MODULE_ID]?.[LAMP_FLAG] ?? {};
  const name = `flags.${MODULE_ID}.${LAMP_FLAG}`;
  const option = (value: string, label: string, chosen: unknown) => `<option value="${esc(value)}"${value === chosen ? " selected" : ""}>${esc(label)}</option>`;
  const lamps = [option("", L("MarkClear"), data.lamp ?? ""), ...Object.keys(LAMPS).map((n) => option(n, n, data.lamp))].join("");
  const elements = [option("", L("AsRecord"), data.element ?? ""), ...ELEMENT_KEYS.map((k) => option(k, L(`Element.${k}`), data.element))].join("");
  const watts = Number(data.watts) > 0 ? String(Number(data.watts)) : "";
  return `<fieldset data-gcc-ee-lamp-config><legend>${esc(L("MarkTitle"))}</legend>
    <p class="hint">${esc(L("MarkHint"))}</p>
    <div class="form-group"><label>${esc(L("MarkLamp"))}</label><div class="form-fields"><select name="${name}.lamp">${lamps}</select></div></div>
    <div class="form-group"><label>${esc(L("Watts"))}</label><div class="form-fields"><input type="number" name="${name}.watts" min="0" step="any" value="${watts}" placeholder="${esc(L("AsRecord"))}"></div></div>
    <div class="form-group"><label>${esc(L("ElementLabel"))}</label><div class="form-fields"><select name="${name}.element">${elements}</select></div></div>
    <div class="form-group"><label>${esc(L("Brighter"))}</label><div class="form-fields"><input type="checkbox" name="${name}.brighter"${data.brighter === true ? " checked" : ""}></div></div>
  </fieldset>`;
}

/** What a task needing bright light gets at this lux: met, or -2 (HT:EE p. 20). */
function taskLine(lux: number, task: BrightTask): string {
  const penalty = brightTaskPenalty(lux, BRIGHT_TASKS[task]);
  return F(penalty ? "TaskShort" : "TaskMet", { task: L(`Task.${task}`), lux: formatLux(BRIGHT_TASKS[task]), penalty });
}

/** Reads the light at each selected token (HT:EE p. 20). */
export async function readLight(api: GWorldApi): Promise<void> {
  if (!game.user?.isGM) return;
  const tokens: any[] = stage()?.tokens?.controlled ?? [];
  if (!tokens.length) return void ui.notifications?.warn(L("ReadNone"));
  const lines: string[] = [];
  for (const token of tokens) {
    const here = lightAt(api, token, token.actor ?? null);
    const name = String(token.name ?? token.actor?.name ?? "");
    if (!here) {
      lines.push(F("ReadOff", { name }));
      continue;
    }
    lines.push(F("ReadLine", { name, lux: formatLux(here.lux), penalty: here.penalty ? signed(here.penalty) : L("None") }));
    lines.push(`${taskLine(here.lux, "reading")}; ${taskLine(here.lux, "surgery")}`);
  }
  await say(null, L("ReadTitle"), lines);
}

// ── aiming a beam (HT:EE p. 20) ──

/** A character's Hearing score, as the system worked it out. */
function hearingOf(api: GWorldApi, actor: any): number {
  const derived: any = api.actors.derived(actor);
  const senses: any[] = derived?.senses ?? [];
  return Number(senses.find((s) => s?.sense === "hearing")?.score) || Number(derived?.per) || (api.actors.attribute(actor, "Per") ?? 10);
}

/**
 * Aiming by ear (HT:EE p. 20): where the darkness is worse than -6, the
 * aimer may first listen for the target -- a Hearing roll, or a Quick Contest
 * of Hearing against the target's Stealth where it moves quietly. Heard, the
 * beam is aimed at -6 in place of the darkness, the skill no higher than 9.
 * True where it was heard, false where not or the aimer sticks to sight, null
 * where the dialog was closed.
 */
async function aimByEar(api: GWorldApi, actor: any, target: any, penalty: number): Promise<boolean | null> {
  const how: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("AimAction") },
    content: `<div class="gworld"><p class="ihint">${esc(F("EarHint", { penalty, heard: HEARD_AIM.penalty, cap: HEARD_AIM.cap }))}</p>
      <div class="ifields"><label>${esc(L("EarHow"))} <select name="how">
        <option value="sight">${esc(L("Ear.sight"))}</option>
        <option value="hearing">${esc(L("Ear.hearing"))}</option>
        <option value="stealth">${esc(L("Ear.stealth"))}</option>
      </select></label></div></div>`,
    ok: { label: L("AimAction"), callback: (_event: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="how"]')?.value ?? "sight" },
    rejectClose: false,
  });
  if (!how) return null;
  if (how === "sight") return false;
  const who = target?.actor ?? null;
  const label = F("EarRoll", { name: String(target?.name ?? who?.name ?? "") });
  if (how === "stealth" && who) {
    const stealth = api.actors.skillLevel(who, "Stealth") ?? (Number(api.actors.attribute(who, "DX")) || 10) - 5;
    const result: any = await api.roll.quickContest({
      label,
      first: { actor, base: hearingOf(api, actor), note: "Hearing" },
      second: { actor: who, base: stealth, note: "Stealth" },
      tags: ["hearing", "beamAim"],
    } as any);
    return result ? result.outcome === "first" : null;
  }
  const result: any = await api.roll.success({ actor, base: hearingOf(api, actor), skill: "Hearing", label, tags: ["hearing", "detection", "beamAim"], subject: who } as any);
  return result ? result.success === true : null;
}

/**
 * Aims a beam at the targeted token: DX at the darkness there, or by ear at
 * -6 where that is better and the target was heard (HT:EE p. 20); a miss
 * lands to one side.
 */
export async function aimBeam(api: GWorldApi, item: any, actor: any, die: () => number = d6): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])];
  if (targets.length !== 1) return void ui.notifications?.warn(L("AimTarget"));
  const target = targets[0];
  const here = lightAt(api, target, actor);
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  let modifiers = here && here.penalty < 0 ? [{ label: L("AimDarkness"), value: here.penalty }] : [];
  const ear = here ? heardAim(dx, here.penalty) : null;
  if (ear) {
    const heard = await aimByEar(api, actor, target, here!.penalty);
    if (heard === null) return;
    if (heard) modifiers = [{ label: L("AimHeard"), value: ear.penalty }, ...(ear.cap ? [{ label: F("AimCap", { cap: HEARD_AIM.cap }), value: ear.cap }] : [])];
  }
  const outcome: any = await api.roll.success({
    actor, base: dx, label: F("AimRoll", { name: String(item.name ?? "") }), skill: "DX", kind: "attribute",
    modifiers, tags: ["beamAim"], item,
  } as any);
  if (!outcome) return;
  const who = String(target.name ?? target.actor?.name ?? "");
  const lines = [outcome.success ? F("AimHit", { name: who }) : (() => {
    const drift = beamDrift(Number(outcome.margin) || 1, die());
    return F("AimMiss", { name: who, yards: drift.yards, side: L(`Side.${drift.side}`) });
  })()];
  await say(actor, String(item.name ?? ""), lines);
}

// ── glare (HT:EE pp. 9, 20-21) ──

/** A glare roll owed: who, from what, at what. */
export interface GlareData {
  victimUuid: string;
  victim: string;
  source: string;
  modifier: number;
  /** Whether looking straight at it is an option on the card: a flashbulb's -5. */
  lookingAt: number;
  result: string;
}

/** The step the eyes at a token are adapted to: the light there, or a lit interior's off the map. */
function adaptedAt(api: GWorldApi, token: any): number {
  const here = token ? lightAt(api, token, token.actor ?? null) : null;
  return here ? luxStep(here.lux) : NO_PENALTY_STEP;
}

/**
 * Posts the glare roll for each victim that owes one, light of `step` against
 * the light their eyes are used to, and says who doesn't. Exported for the
 * electrical hazards' arc flash.
 */
export async function postGlare(api: GWorldApi, victims: Array<{ token: any; step: number }>, source: string, lookingAt = 0): Promise<void> {
  const spared: string[] = [];
  for (const { token, step } of victims) {
    const actor = token?.actor;
    if (!actor) continue;
    const roll = glareRoll(step, adaptedAt(api, token));
    if (!roll.required) {
      spared.push(String(actor.name ?? ""));
      continue;
    }
    const data: GlareData = { victimUuid: String(actor.uuid ?? ""), victim: String(actor.name ?? ""), source, modifier: roll.modifier, lookingAt, result: "" };
    await api.chat.post(`${MODULE_ID}.${GLARE_CARD}`, { ...data }, { actor } as any);
  }
  if (spared.length) await say(null, source, [F("NoGlare", { names: spared.join(", ") })]);
}

/** Fires a flashbulb at the targeted tokens: 900,000 lux at a yard, falling off (HT:EE p. 21). */
async function fireFlashbulb(api: GWorldApi, item: any, actor: any): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])];
  if (!targets.length) return void ui.notifications?.warn(L("FlashTarget"));
  const own = actor?.getActiveTokens?.()?.[0];
  const victims = targets.map((token) => ({ token, step: flashbulbStepAt((own ? yardsBetween(own, token) : null) ?? 1) }));
  await postGlare(api, victims, String(item.name ?? ""), FLASHBULB.lookingAt);
}

/** The GM's glare: an arc flash, or light of any lux, at the selected tokens (HT:EE pp. 9, 20). */
async function gmGlare(api: GWorldApi): Promise<void> {
  if (!game.user?.isGM) return;
  const tokens: any[] = stage()?.tokens?.controlled ?? [];
  if (!tokens.length) return void ui.notifications?.warn(L("GlareNone"));
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("GlareTitle") },
    content: `<div class="gworld"><p class="ihint">${esc(F("GlareHint", { names: tokens.map((t) => t.name).join(", ") }))}</p>
      <div class="ifields">
        <label>${esc(L("GlareLux"))} <input type="number" name="lux" min="0" step="any" value="${ARC_FLASH_LUX}"></label>
        <label>${esc(L("GlareSource"))} <input type="text" name="source" value="${esc(L("ArcFlash"))}"></label>
      </div></div>`,
    ok: {
      label: L("GlareApply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "";
        return { lux: Number(value("lux")) || 0, source: value("source") || L("GlareTitle") };
      },
    },
    rejectClose: false,
  });
  if (!answer || !(answer.lux > 0)) return;
  await postGlare(api, tokens.map((token) => ({ token, step: luxStep(answer.lux) })), answer.source);
}

const hasCondition = (api: GWorldApi, actor: any, key: string): boolean => ((api.actors.conditions(actor) ?? []) as any[]).some((c) => c?.id === `${MODULE_ID}.${key}`);

/** The HT roll against glare, and what it leaves (HT:EE p. 20). */
export async function resistGlare(api: GWorldApi, message: any, data: GlareData, looking: boolean): Promise<void> {
  const victim: any = data.victimUuid ? await fromUuid(data.victimUuid) : null;
  if (!victim || data.result) return;
  const effects = (api.actors.derived(victim) as any)?.traitEffects ?? {};
  if (effects.blindness === true) return void api.chat.update(message, { ...data, result: F("AlreadyBlind", { name: victim.name }) });
  const modifiers: Array<{ label: string; value: number }> = [];
  if (data.modifier) modifiers.push({ label: L("GlareLine"), value: data.modifier });
  if (looking && data.lookingAt) modifiers.push({ label: L("LookingAt"), value: data.lookingAt });
  const protection = eyeProtection({ protectedVision: effects.protectedSense?.vision === true, nictitatingMembrane: Number(effects.nictitatingMembrane) || 0 });
  if (protection) modifiers.push({ label: L("Protection"), value: protection });
  const outcome: any = await api.roll.success({
    actor: victim, base: Number(api.actors.attribute(victim, "HT")) || 10, label: F("GlareRoll", { name: victim.name, source: data.source }), skill: "HT", kind: "attribute",
    modifiers, tags: ["resist", "vision", "glare"], returnRefusal: true,
  } as any);
  if (!outcome) return;
  // The system makes no roll at an effective HT below 3 (Campaigns p. 344):
  // the victim can't resist, and fails by at least what the roll fell short.
  const result = outcome.refused
    ? glareOutcome({ success: false, margin: refusedMargin(Number(outcome.effective)) })
    : glareOutcome({ success: outcome.success === true, margin: Number(outcome.margin) || 0, criticalFailure: outcome.criticalFailure === true });
  if (result.kind === "blinded") {
    await api.actors.applyCondition(victim, { module: MODULE_ID, key: BLINDED, label: L("Blinded"), duration: { seconds: result.seconds } } as any);
  }
  if (result.kind === "dazzled" || result.kind === "blinded") {
    const seconds = result.minutes * 60 + (result.kind === "blinded" ? result.seconds : 0);
    await api.actors.applyCondition(victim, {
      module: MODULE_ID, key: DAZZLED, label: L("Dazzled"),
      effects: { modifiers: [{ label: L("Dazzled"), value: DAZZLED_VISION, rolls: ["vision"] }] },
      duration: { seconds },
    } as any);
  }
  const text = result.kind === "blinded" ? F("ResultBlinded", { name: victim.name, seconds: result.seconds, minutes: result.minutes })
    : result.kind === "dazzled" ? F("ResultDazzled", { name: victim.name, minutes: result.minutes, penalty: DAZZLED_VISION })
      : F(result.kind === "readapt" ? "ResultReadapt" : "ResultUnaffected", { name: victim.name });
  await api.chat.update(message, { ...data, result: text });
}

export function readyLighting(api: GWorldApi, on: LightingSwitches): void {
  // ── illumination (HT:EE pp. 20-22) ──
  (api.areas as any).registerLightLevel?.({
    module: MODULE_ID,
    key: "ee-lamps",
    level: (_observer: any, light: any, spot: any) => lampLevel(on, light, spot),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ee-lamp-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-lighting-item.hbs`,
    visible: (item) => on.illumination() && lampOf(item) !== null,
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-aim-beam",
    itemTypes: ["equipment"],
    label: L("AimAction"),
    icon: "fa-solid fa-crosshairs",
    visible: (item) => {
      const lamp = on.illumination() ? lampOf(item) : null;
      return lamp !== null && isBeam(lamp);
    },
    run: (item, actor) => { void aimBeam(api, item, actor); },
  });

  // Sewing and Surgery in less light than they need: -2, read at the roller's token (HT:EE p. 20).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.illumination() || !Array.isArray(context?.modifiers)) return;
    const task = brightTaskOf(context.skill);
    const token = task ? context.actor?.getActiveTokens?.()?.[0] : null;
    if (!task || !token) return;
    const here = lightAt(api, token, context.actor);
    const penalty = here ? brightTaskPenalty(here.lux, BRIGHT_TASKS[task]) : 0;
    if (penalty) context.modifiers.push({ label: F("DimTask", { task: L(`Task.${task}`), lux: formatLux(here!.lux) }), value: penalty });
  });

  // A light on the map is marked as a lamp in its own configuration sheet.
  Hooks.on("renderAmbientLightConfig", (app: any, html: HTMLElement) => {
    if (!on.illumination() || !game.user?.isGM) return;
    const root: HTMLElement | null = (html as any)?.querySelector ? html : (app?.element ?? null);
    if (!root || root.querySelector("[data-gcc-ee-lamp-config]")) return;
    const where = root.querySelector('.tab[data-tab="basic"]') ?? root.querySelector("form") ?? root;
    where.insertAdjacentHTML("beforeend", lampConfigFields(app?.document));
  });
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ee-read-light",
    label: L("ReadTitle"),
    icon: "fa-solid fa-sun",
    visible: on.illumination,
    open: () => readLight(api),
  } as any);

  // ── glare (HT:EE pp. 9, 20-21) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ee-flashbulb",
    itemTypes: ["equipment"],
    label: L("FlashAction"),
    icon: "fa-solid fa-camera",
    visible: (item) => on.dazzle() && ownBook(item) && FLASHBULB_NAME.test(String(item?.name ?? "")),
    run: (item, actor) => { void fireFlashbulb(api, item, actor); },
  });
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ee-glare",
    label: L("GlareTitle"),
    icon: "fa-solid fa-bolt",
    visible: on.dazzle,
    open: () => gmGlare(api),
  } as any);
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: GLARE_CARD,
    template: `modules/${MODULE_ID}/templates/ht-lighting-card.hbs`,
    actions: {
      resist: async ({ message, data }: any) => { if (on.dazzle()) await resistGlare(api, message, data as GlareData, false); },
      resistLooking: async ({ message, data }: any) => { if (on.dazzle()) await resistGlare(api, message, data as GlareData, true); },
    },
  } as any);

  // A critical failure blinds for a few seconds: the system's imposed Blindness (HT:EE p. 20).
  Hooks.on("gworld.traitEffects", (context: any) => {
    const effects = context?.effects;
    if (!effects || !on.dazzle() || !context.actor || !hasCondition(api, context.actor, BLINDED)) return;
    effects.blindness = true;
    if (Array.isArray(context.sources)) context.sources.push({ effect: "blindness", label: L("Blinded") });
  });
}
