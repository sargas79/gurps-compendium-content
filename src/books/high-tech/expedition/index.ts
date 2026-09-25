/**
 * High-Tech's expedition gear (pp. 51-56), registered with the system through
 * the add-on API under four switches. The rules are in `rules.ts`; what each
 * record is (a light and how far it reaches, an instrument or a map, LBE or a
 * pack, a piece of climbing gear) is its `expedition` data, written on the
 * records from book.json. What the character did with it -- a light lit or
 * set down, LBE set up, a pack fitted, a GPS out of sight of its satellites --
 * is kept in this module's flags on the item.
 *
 *   - **Light sources (lightSources):** a row action lights a light or puts
 *     it out, and another sets a lit light down as an area on the map -- a
 *     lantern or candle round it, a beam as a cone toward the one target or
 *     along its bearer's facing (dropped, a fuel lantern rolls HT 6 on hard
 *     ground and breaks, a lit glass one starting a 1-yard fire for 10d
 *     seconds, whose card rolls each second's 1d-1 burning at a fifth of DR).
 *     Lanterns, the carbide lamp and candles burn their fill down, as does a
 *     snapped chemlight, which can't be put out; a row action refills them
 *     (a new candle or stick off the count), a survival flashlight is wound
 *     for its minutes, and a TL8 flashlight's batteries last ten times as
 *     long. An attack on a target a light reaches -- one
 *     set down round it, one carried within its radius, or the attacker's own
 *     beam out to its length -- takes its darkness down to that of a lit spot
 *     (Campaigns p. 394's -3; the keyed `darkness` line); a light set down
 *     also lights its radius for the system's `darknessAt` (API 1.102.0). A
 *     flashlight's IR filter (+$25), an IR mode or an IR chemlight lights
 *     only for eyes that see infrared, on the attack as in `darknessAt`
 *     (`../infrared.ts`), an infrared beam set down included, and blinds
 *     nobody. A tactical light shone in the eyes asks each target for HT-4
 *     against 10 seconds' blindness per point of failure; one fitted to a
 *     gun does the same from the gun's row (`shineTacticalLight`), unless it
 *     shines infrared, and the gadget table counts tactical lights as rugged
 *     and expensive already.
 *   - **Navigation gear (navigationGear):** the best bonus of a compass,
 *     chronometer, navigating or surveying instruments or a GPS receiver as a
 *     line on Navigation and Mathematics (Surveying), and the map line on
 *     Navigation and Forward Observer: -10 with none, an inaccurate map's -1
 *     to -5.
 *   - **Load-bearing equipment (loadBearingEquipment):** a Soldier or
 *     IQ-based Hiking roll sets LBE up (its quality, or -2 set up badly, then
 *     goes on Fast-Draw from pouches and on a row action's DX roll to reach
 *     gear) and fits a pack (a good or fine one's quality on Hiking; a badly
 *     fitted one's moderate pain after a day's hiking); TL8 packs weigh half
 *     and backpacks cost double; the hourly march; getting something out of
 *     a pack (1d or 2d seconds); and a canteen not full sloshing away LBE's
 *     Stealth benefit.
 *   - **Climbing gear (climbingGear):** the fall to twice the distance past
 *     the last fastener, rolled by the system's falling procedure, shooting while rappelling (-4, -2 with Sure-Footed),
 *     throwing a grapnel and who hears it land (a padded one, +1 lb., at
 *     -2), snowshoes' -1 Move, and crampons' +2 to a kick
 *     (beside the system's +1 for boots, which they are worn over); an
 *     ascender, descender or suction cups cancelling the climb's own penalty
 *     on the Climb roll (its `climbKind` line); a climb on ice from the
 *     crampons' row at +1; the personal lifting device's rides and
 *     cartridges; and the rope loads, the hand drill and the avalanche
 *     transceiver on their sheets.
 */

import { placeArea } from "../../../shared/areas.js";
import { infraredLight, seesInfrared } from "../infrared.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { registerPowerAdjuster } from "../../../shared/power/data.js";
import { hearSound, type Sound } from "../hearing.js";
import {
  AVALANCHE_RANGE,
  BLINDED_PENALTY,
  CARRY_KINDS,
  CLIMBING_KINDS,
  CRAMPON_ICE,
  CRAMPON_KICK,
  FLAP_READY,
  HAND_DRILL_MINUTES,
  LANTERN_FIRE,
  LIFTING_DEVICE,
  WINDING_SECONDS,
  beamWidth,
  burnLeft,
  burnOf,
  cancelsClimb,
  liftingClimb,
  retrieveDice,
  ropeLoad,
  sloshes,
  tl8BatteryFactor,
  lbeStealth,
  FITS,
  GLASS_LANTERN_FIRE_YARDS,
  IR_FILTER_COST,
  LIGHT_KINDS,
  NAVIGATION_KINDS,
  RELIGHT_SECONDS,
  ROPE_GEAR,
  TACTICAL_BLINDING_HT,
  anchoredFall,
  blindedSeconds,
  breaksWhenDropped,
  canBeInfrared,
  drawsFromLbe,
  fittingRoll,
  GRAPNEL_RING_YARDS,
  PADDED_GRAPNEL,
  grapnelLoad,
  grapnelRange,
  grapnelRoll,
  infraredCost,
  lanternSurvives,
  lbeBonus,
  litPenalty,
  mapModifier,
  marchMph,
  navSkillOf,
  navigationBonus,
  packPrice,
  qualityBonus,
  rappelPenalty,
  reaches,
  snowshoeMove,
  type CarryKind,
  type ClimbingKind,
  type Fit,
  type Instrument,
  type Light,
  type NavigationKind,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Expedition.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Expedition.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "expedition";
const LIGHT_AREA = "ht-light";
/** What an infrared beam's area has in its id, after the item's: it lights only for eyes that see infrared. */
const IR_BEAM = "-ir-";
const FIRE_AREA = "ht-lantern-fire";
const FIRE_CARD = "ht-lantern-fire";
const EYES_CARD = "ht-light-eyes";
const RAPPEL_OPTION = "ht-rappelling";
const BLINDED = "htLightBlinded";

export interface ExpeditionSwitches {
  lights: () => boolean;
  navigation: () => boolean;
  loadBearing: () => boolean;
  climbing: () => boolean;
}

/** What this module keeps on a piece of expedition gear. */
export interface ExpeditionData {
  light: Light | null;
  navigation: NavigationKind;
  /** An inaccurate map's penalty, -1 to -5; 0 for an accurate one. */
  mapPenalty: number;
  carry: CarryKind;
  climbing: ClimbingKind;
  /** A padded grapnel: +1 lb., -2 to hear it land (p. 55). */
  padded: boolean;
}

/** What the character did with it, kept in this module's flags. */
export interface ExpeditionState {
  lit: boolean;
  broken: boolean;
  placed: boolean;
  fit: Fit;
  noSignal: boolean;
  /** The world time a light with a burning time was lit, or null while it is out. */
  litAt: number | null;
  /** The seconds of its fill already burned before it was last lit. */
  burned: number;
  /** A canteen not filled to the brim, which sloshes (p. 53). */
  notFull: boolean;
  /** Yards of ascent a lifting device's cartridge has used (p. 56). */
  climbed: number;
}

/** Registers the fields this module keeps on expedition gear. */
export function initExpedition(): void {
  const f = foundry.data.fields as any;
  const choice = (choices: readonly string[]) => new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...choices] });
  const yards = () => new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      light: new f.SchemaField({ kind: choice(LIGHT_KINDS), radius: yards(), beam: yards(), infrared: new f.BooleanField({ initial: false }) }),
      navigation: choice(NAVIGATION_KINDS),
      mapPenalty: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: -5, max: 0 }),
      carry: choice(CARRY_KINDS),
      climbing: choice(CLIMBING_KINDS),
      padded: new f.BooleanField({ initial: false }),
    }),
  });
}

/** A piece of gear's data, with nothing missing. */
export function expeditionData(item: any): ExpeditionData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const l = d.light ?? {};
  const kind = LIGHT_KINDS.includes(l.kind) ? l.kind : "";
  const yards = (v: unknown) => Math.max(0, Number(v) || 0);
  return {
    light: kind ? { kind, radius: yards(l.radius), beam: yards(l.beam), infrared: l.infrared === true && canBeInfrared(kind) } : null,
    navigation: NAVIGATION_KINDS.includes(d.navigation) ? d.navigation : "",
    mapPenalty: Math.max(-5, Math.min(0, Math.trunc(Number(d.mapPenalty) || 0))),
    carry: CARRY_KINDS.includes(d.carry) ? d.carry : "",
    climbing: CLIMBING_KINDS.includes(d.climbing) ? d.climbing : "",
    padded: d.padded === true,
  };
}

/** What the character did with a piece of gear. */
export function expeditionState(item: any): ExpeditionState {
  const s = item?.flags?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    lit: s.lit === true,
    broken: s.broken === true,
    placed: s.placed === true,
    fit: FITS.includes(s.fit) ? s.fit : "",
    noSignal: s.noSignal === true,
    litAt: typeof s.litAt === "number" && Number.isFinite(s.litAt) ? s.litAt : null,
    burned: Math.max(0, Number(s.burned) || 0),
    notFull: s.notFull === true,
    climbed: Math.max(0, Number(s.climbed) || 0),
  };
}

const worldNow = (): number => Number((game as any).time?.worldTime) || 0;

/** The burning time a light has left, in seconds, or null for one the book gives none (p. 51-52). */
export function lightLeft(item: any): number | null {
  const burn = burnOf(String(item?.name ?? ""), tlOf(item));
  if (!burn) return null;
  const state = expeditionState(item);
  return burnLeft(burn, state.burned, state.lit ? state.litAt : null, worldNow());
}

/** Whether a lit light has burned through its fuel (p. 51-52). */
const spent = (item: any): boolean => lightLeft(item) === 0;

async function setState(item: any, patch: Partial<ExpeditionState>): Promise<void> {
  await item.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`flags.${MODULE_ID}.${FIELD}.${k}`, v])));
}

/** The sound a grapnel makes landing on stone, as `hearSound` takes it. */
export function grapnelSound(item: any): Sound {
  return {
    name: String(item?.name ?? ""),
    heardAt: GRAPNEL_RING_YARDS,
    lines: expeditionData(item).padded ? [{ label: L("PaddedLine"), value: PADDED_GRAPNEL.hearing }] : [],
    note: L("GrapnelHeardNote"),
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const carried = (item: any) => item?.type === "equipment" && item.system?.carried !== false;
const gearOf = (actor: any): any[] => [...(actor?.items ?? [])].filter(carried);

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
    ...(rolls.length ? { rolls } : {}),
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

// ── light sources (pp. 51-52) ──

/**
 * The lit lights a character carries: not one they have set down, which lights
 * where it lies, nor one burned out. With `forEyes`, an infrared one only
 * where those eyes see it.
 */
function litLights(actor: any, forEyes?: (light: Light) => boolean): Array<{ item: any; light: Light }> {
  return gearOf(actor)
    .map((item) => ({ item, light: expeditionData(item).light, state: expeditionState(item) }))
    .filter((l): l is { item: any; light: Light; state: ExpeditionState } => l.light !== null && l.state.lit && !l.state.broken && !l.state.placed && !spent(l.item))
    .filter((l) => !forEyes || forEyes(l.light));
}

/** A smart flashlight switches to infrared-only by itself (p. 52): no filter to buy. */
const hasIrMode = (item: any): boolean => /^smart flashlight\b/i.test(String(item?.name ?? ""));

/**
 * The light a target stands in, by name, or null: a light set down round it,
 * a light somebody on the map carries within its radius (the target's own
 * included), or the attacker's own beam, aimed at the target, out to its
 * length.
 */
export function lightOver(api: GWorldApi, attacker: any, target: any): string | null {
  // An infrared light counts only for an attacker who sees infrared.
  const sees = seesInfrared(api, attacker);
  const visible = (light: Light) => !light.infrared || sees;
  const scene = stage()?.scene;
  if (scene) {
    const now = worldNow();
    for (const area of (api.areas.list(scene) as any[]) ?? []) {
      if (!String(area?.id ?? "").startsWith(`${MODULE_ID}-${LIGHT_AREA}-`)) continue;
      // A light set down goes out when its fuel does.
      if (typeof area.expires === "number" && now >= area.expires) continue;
      // An infrared one, round it or a beam, lights only for eyes that see infrared.
      if ((area?.light?.litFor || String(area.id).includes(IR_BEAM)) && !sees) continue;
      const inside: any[] = (api.areas as any).standsIn?.(scene, area) ?? [];
      if (inside.some((t) => t?.id === target?.id)) return String(area.label ?? "");
    }
  }
  for (const token of (stage()?.tokens?.placeables ?? []) as any[]) {
    for (const { item, light } of litLights(token?.actor, visible)) {
      const yards = token?.document?.id === target?.id ? 0 : yardsBetween(token, target);
      if (yards !== null && reaches(light, yards, false)) return String(item.name ?? "");
    }
  }
  const own = attacker?.getActiveTokens?.()?.[0];
  for (const { item, light } of litLights(attacker, visible)) {
    const yards = own ? yardsBetween(own, target) : null;
    if (yards !== null && reaches(light, yards, true)) return String(item.name ?? "");
  }
  return null;
}

async function switchLight(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = expeditionData(item);
  if (!data.light) return;
  const name = String(item.name ?? "");
  const state = expeditionState(item);
  const burn = burnOf(name, tlOf(item));
  const now = worldNow();
  const lit = !state.lit;
  // A chemlight, once snapped, glows until it is spent (p. 52).
  if (!lit && burn?.fuel === "snap" && !spent(item)) return void ui.notifications?.warn(F("CantPutOut", { name }));
  // Wound or shaken, a survival flashlight gives its minutes afresh (p. 52).
  if (lit && burn?.fuel === "wind") {
    await setState(item, { lit: true, litAt: now, burned: 0 });
    await say(actor, name, [F("Wound", { name, seconds: WINDING_SECONDS, minutes: burn.seconds / 60 })]);
    return;
  }
  if (lit && burn && spent(item)) return void ui.notifications?.warn(F(`OutOfFuel.${burn.fuel}`, { name }));
  // What has burned so far is kept when it goes out, and counted from now when it is lit (pp. 51-52).
  const burned = !lit && burn && state.litAt !== null ? state.burned + Math.max(0, now - state.litAt) : state.burned;
  await setState(item, { lit, ...(burn ? { litAt: lit ? now : null, burned } : {}) });
  if (!lit) await pickUp(api, item, actor);
  const kind = data.light.kind;
  const how = !lit ? "PutOut"
    : kind === "electric" || kind === "tactical" ? "SwitchedOnReady"
      : kind === "chemical" ? "SnappedOn"
        : breaksWhenDropped(kind) ? "LitLantern" : "LitFlame";
  const lines = [F(how, { name, min: RELIGHT_SECONDS.min, max: RELIGHT_SECONDS.max })];
  if (lit && burn) lines.push(F("BurnsFor", { time: durationText(lightLeft(item) ?? 0) }));
  await say(actor, name, lines);
}

/** A span of seconds as the sheet says it: hours and minutes, or minutes. */
function durationText(seconds: number): string {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  return minutes >= 60 ? F("HoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) : F("MinutesOnly", { minutes });
}

/**
 * A new fill for a light that burns out (pp. 51-52): a pint of oil or a
 * charge of carbide put in, or another candle or chemlight off the count.
 */
async function refuel(api: GWorldApi, item: any, actor: any): Promise<void> {
  const name = String(item.name ?? "");
  const burn = burnOf(name, tlOf(item));
  if (!burn || burn.fuel === "wind") return;
  if (burn.fuel === "ounce" || burn.fuel === "snap") {
    const quantity = Number(item.system?.quantity);
    if (Number.isFinite(quantity) && quantity <= 1) return void ui.notifications?.warn(F("NoneLeft", { name }));
    await api.items.changeQuantity(item, -1, { reason: L(`Refuel.${burn.fuel}`) });
  }
  await setState(item, { lit: false, litAt: null, burned: 0 });
  await pickUp(api, item, actor);
  await say(actor, name, [F(`Refuelled.${burn.fuel}`, { name, time: durationText(burn.seconds) })]);
}

/** Sets a lit light down (or drops it) where its bearer stands, or where their template lies. */
async function setDown(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = expeditionData(item);
  if (!data.light) return;
  const name = String(item.name ?? "");
  let dropped = false;
  if (breaksWhenDropped(data.light.kind)) {
    const asked: any = await foundry.applications.api.DialogV2.prompt({
      window: { title: name },
      content: `<div class="gworld"><p class="ihint">${esc(L("DropHint"))}</p>
        <div class="ichecks"><label class="icheck"><input type="checkbox" name="dropped"> ${esc(L("DroppedHard"))}</label></div></div>`,
      ok: {
        label: L("SetDown"),
        callback: (_event: Event, button: HTMLElement) => ({ dropped: Boolean(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="dropped"]')?.checked) }),
      },
      rejectClose: false,
    });
    if (!asked) return;
    dropped = asked.dropped === true;
  }
  if (dropped) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    if (!lanternSurvives(Number(roll.total))) {
      const wasLit = expeditionState(item).lit;
      await setState(item, { lit: false, broken: true, placed: false });
      const lines = [F("LanternBreaks", { name, roll: roll.total })];
      if (data.light.kind === "kerosene") lines.push(L("KeroseneDouses"));
      await say(actor, name, lines, [roll]);
      // The glass one spills its burning oil (p. 51; Molotov cocktail, p. 191).
      if (data.light.kind === "glassLantern" && wasLit) await lanternFire(api, item, actor);
      return;
    }
    await say(actor, name, [F("LanternSurvives", { name, roll: roll.total })], [roll]);
  }
  const state = expeditionState(item);
  if (!state.lit) return;
  // A light with fuel to burn goes out where it lies when the fuel does.
  const left = lightLeft(item);
  const seconds = left === null ? null : left;
  if (data.light.radius > 0) {
    // It lights its radius for the system's darknessAt too: an infrared one only for those who see it.
    const light = { litFor: data.light.infrared ? infraredLight(api) : null };
    const id = await placeArea(api, { key: `${LIGHT_AREA}-${item.id}`, label: name, actor, radiusYards: data.light.radius, lines: [], seconds, bare: true, light });
    if (!id) return void ui.notifications?.warn(L("NoPlace"));
    await setState(item, { placed: true });
    await say(actor, name, [F("SetDownLine", { name, yards: data.light.radius })]);
    return;
  }
  // A beam set down shines where it points: toward the one token targeted, or the way its bearer's token faces.
  if (data.light.beam > 0) {
    const id = await placeBeam(api, item, actor, data.light.beam, seconds, data.light.infrared);
    if (!id) return void ui.notifications?.warn(L("NoPlaceBeam"));
    await setState(item, { placed: true });
    await say(actor, name, [F("SetDownBeam", { name, yards: data.light.beam, width: beamWidth(data.light.beam) })]);
  }
}

/**
 * Places a beam light set down as a cone from its bearer's token. An infrared
 * one is marked in its id (`IR_BEAM`), and `lightOver` counts it only for eyes
 * that see infrared. Its bearer is the source, so a player's beam is placed
 * by the GM's client (API 1.150.0).
 */
async function placeBeam(api: GWorldApi, item: any, actor: any, yards: number, seconds: number | null, infrared = false): Promise<string | null> {
  const scene = stage()?.scene;
  const own = actor?.getActiveTokens?.()?.[0];
  const from = centreOf(own);
  if (!scene || !from) return null;
  const targets = [...((game as any).user?.targets ?? [])];
  const toward = targets.length === 1 ? centreOf(targets[0]) : null;
  const direction = Number(own?.document?.rotation ?? own?.rotation);
  // Foundry's token rotation is 0 facing down (south); an area's direction is 0 facing east.
  const cone = toward ? { toward, length: yards, width: beamWidth(yards) } : { direction: ((Number.isFinite(direction) ? direction : 0) + 90) % 360, length: yards, width: beamWidth(yards) };
  const now = worldNow();
  return api.areas.add(scene.id ?? scene, {
    id: `${MODULE_ID}-${LIGHT_AREA}-${item.id}${infrared ? IR_BEAM : "-"}${foundry.utils.randomID(8)}`,
    label: String(item.name ?? ""),
    center: from,
    cone,
    lines: [],
    expires: seconds === null ? null : now + seconds,
  } as any, actor ? { source: actor } : undefined);
}

/**
 * A lit glass lantern broken on hard ground starts a 1-yard fire (p. 51): as
 * a Molotov cocktail on the ground (p. 191; Campaigns p. 411), 1d-1 burning
 * a second, DR at a fifth, for 10d seconds. The area marks it on the map,
 * and the card rolls each second's damage for the GM to apply.
 */
async function lanternFire(api: GWorldApi, item: any, actor: any): Promise<void> {
  const roll = new Roll(`${LANTERN_FIRE.burnsForDice}d6`);
  await roll.evaluate();
  const seconds = Number(roll.total) || 0;
  const name = String(item.name ?? "");
  await placeArea(api, { key: `${FIRE_AREA}-${item.id}`, label: F("FireArea", { name }), actor, radiusYards: GLASS_LANTERN_FIRE_YARDS, lines: [], seconds, bare: true });
  const formula = api.rules.formatDiceAdds({ dice: LANTERN_FIRE.dice, adds: LANTERN_FIRE.adds });
  await api.chat.post(`${MODULE_ID}.${FIRE_CARD}`, { name, seconds, yards: GLASS_LANTERN_FIRE_YARDS, formula, divisor: LANTERN_FIRE.armorDivisor, until: worldNow() + seconds } satisfies FireData, { actor } as any);
}

type FireData = { name: string; seconds: number; yards: number; formula: string; divisor: number; until: number };

/** A second of the lantern's fire: the damage roll, burning at a fifth of DR, for the GM to apply to whoever stands in it. */
async function burnSecond(api: GWorldApi, data: FireData, actor: any): Promise<void> {
  if (worldNow() >= data.until) return void ui.notifications?.info(F("FireOut", { name: data.name }));
  await api.roll.damage({ actor, label: F("FireSecond", { name: data.name }), formula: data.formula, damageType: "burn" as never, armorDivisor: data.divisor, source: "lanternFire" } as any);
}

/**
 * Takes a light's areas off the map, with its bearer as the source: a player,
 * who can't write the scene, has the GM's client take them off (API 1.150.0).
 */
async function pickUp(api: GWorldApi, item: any, actor: any): Promise<void> {
  const scene = stage()?.scene;
  if (scene) {
    const prefix = `${MODULE_ID}-${LIGHT_AREA}-${item.id}-`;
    const source = actor ? { source: actor } : undefined;
    for (const area of (api.areas.list(scene) as any[]) ?? []) {
      if (String(area?.id ?? "").startsWith(prefix)) await api.areas.remove(scene.id ?? scene, area.id, source);
    }
  }
  if (expeditionState(item).placed) await setState(item, { placed: false });
}

type EyesData = { victimUuid: string; victim: string; light: string; result: string; surprised?: string };

/** Whether a light shines infrared only (p. 52): it blinds nobody. */
export const shinesInfrared = (item: any): boolean => expeditionData(item).light?.infrared === true;

/** Shines a tactical light in the eyes of each targeted token within its beam (p. 52). */
async function shineInEyes(api: GWorldApi, item: any, actor: any): Promise<void> {
  const light = expeditionData(item).light;
  if (!light) return;
  await shineTacticalLight(api, String(item.name ?? ""), light.beam, actor);
}

/**
 * Asks each targeted token within a tactical light's beam for its HT-4
 * against blindness (p. 52): the light carried by hand, or one fitted to a
 * gun (p. 156, whose row calls this). The card's buttons work wherever it
 * came from.
 */
export async function shineTacticalLight(api: GWorldApi, name: string, beamYards: number, actor: any): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])];
  if (!targets.length) return void ui.notifications?.warn(L("EyesTarget"));
  const own = actor?.getActiveTokens?.()?.[0];
  const light: Light = { kind: "tactical", radius: 0, beam: beamYards };
  for (const token of targets) {
    const yards = own ? yardsBetween(own, token) : null;
    if (yards !== null && !reaches(light, yards, true)) continue;
    const victim = token?.actor;
    if (!victim) continue;
    const data: EyesData = { victimUuid: String(victim.uuid ?? ""), victim: String(victim.name ?? ""), light: name, result: "" };
    await api.chat.post(`${MODULE_ID}.${EYES_CARD}`, data, { actor: victim } as any);
  }
}

/**
 * In a surprise situation the light stuns (p. 52): the GM says whether the
 * victim was surprised, partly or totally, and the system's surprise stuns
 * them mentally (Campaigns p. 393; API 1.104.0).
 */
async function surpriseWithLight(api: GWorldApi, message: any, data: EyesData, total: boolean): Promise<void> {
  const victim: any = data.victimUuid ? await fromUuid(data.victimUuid) : null;
  if (!victim || data.surprised) return;
  const result: any = await api.actors.surprise(victim, { total });
  if (!result) return;
  await api.chat.update(message, { ...data, surprised: F(result.kind === "total" ? "EyesSurprisedTotal" : "EyesSurprisedPartial", { name: victim.name, seconds: result.freezeSeconds }) });
}

async function resistLight(api: GWorldApi, message: any, data: EyesData): Promise<void> {
  const victim: any = data.victimUuid ? await fromUuid(data.victimUuid) : null;
  if (!victim || data.result) return;
  const ht = Number(api.actors.attribute(victim, "HT")) || 10;
  const outcome: any = await api.roll.success({
    actor: victim, base: ht, label: F("EyesRoll", { name: victim.name }), skill: "HT", kind: "attribute",
    modifiers: [{ label: L("TacticalLight"), value: TACTICAL_BLINDING_HT }], tags: ["resist", "vision", "tacticalLight"],
  } as any);
  if (!outcome) return;
  if (outcome.success) return void api.chat.update(message, { ...data, result: F("EyesResisted", { name: victim.name }) });
  const seconds = blindedSeconds(Number(outcome.margin) || 1);
  await api.actors.applyCondition(victim, {
    module: MODULE_ID, key: BLINDED, label: L("Blinded"),
    effects: { modifiers: [{ label: L("Blinded"), value: BLINDED_PENALTY, rolls: ["vision", "attack"] }] },
    duration: { seconds },
  } as any);
  await api.chat.update(message, { ...data, result: F("EyesBlinded", { name: victim.name, seconds }) });
}

// ── navigation (pp. 52-53) ──

function instrumentsOf(actor: any): Instrument[] {
  return gearOf(actor)
    .map((item) => ({ item, kind: expeditionData(item).navigation }))
    .filter((i) => i.kind && i.kind !== "map")
    .map(({ item, kind }) => ({ kind, name: String(item.name ?? ""), tl: tlOf(item), noSignal: expeditionState(item).noSignal }));
}

/** The navigation lines on a skill: the instruments' bonus and the map's. */
export function navigationLines(actor: any, skillName: string): Array<{ label: string; value: number }> {
  const skill = navSkillOf(skillName);
  if (!skill) return [];
  const instruments = instrumentsOf(actor);
  const lines: Array<{ label: string; value: number }> = [];
  const bonus = navigationBonus(skill, instruments);
  if (bonus) lines.push({ label: F("InstrumentLine", { name: bonus.name }), value: bonus.value });
  const maps = gearOf(actor).filter((i) => expeditionData(i).navigation === "map").map((i) => expeditionData(i).mapPenalty);
  const map = mapModifier(skill, maps, instruments);
  if (map !== null && map !== 0) lines.push({ label: L(maps.length ? "InaccurateMap" : "NoMap"), value: map });
  return lines;
}

// ── load-bearing gear (pp. 53-55) ──

/** The best bonus of the LBE a character has set up, with its name; null with none set up. */
export function lbeOf(actor: any): { value: number; name: string } | null {
  let best: { value: number; name: string } | null = null;
  for (const item of gearOf(actor)) {
    if (expeditionData(item).carry !== "lbe") continue;
    const value = lbeBonus(expeditionState(item).fit, String(item.system?.equipmentQuality ?? "basic"), tlOf(item));
    if (value !== null && (!best || value > best.value)) best = { value, name: String(item.name ?? "") };
  }
  return best;
}

async function fitGear(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = expeditionData(item);
  const attr = (key: "IQ" | "HT") => Number(api.actors.attribute(actor, key)) || 10;
  const use = fittingRoll({ iq: attr("IQ"), ht: attr("HT"), soldier: api.actors.skillLevel(actor, "Soldier"), hiking: api.actors.skillLevel(actor, "Hiking") });
  const lbe = data.carry === "lbe";
  const outcome: any = await api.roll.success({
    actor, base: use.level, label: F(lbe ? "SetUpRoll" : "FitRoll", { name: item.name, skill: use.skill === "Hiking" ? L("IqHiking") : use.skill }),
    skill: use.skill, kind: "skill", tags: [lbe ? "lbeSetUp" : "packFit"],
  } as any);
  if (!outcome) return;
  await setState(item, { fit: outcome.success ? "ok" : "failed" });
  const key = lbe ? (outcome.success ? "SetUpDone" : "SetUpFailed") : (outcome.success ? "FitDone" : "FitFailed");
  await say(actor, String(item.name ?? ""), [F(key, { name: item.name, bonus: qualityBonus(String(item.system?.equipmentQuality ?? "basic"), tlOf(item)) })]);
}

async function reachGear(api: GWorldApi, item: any, actor: any): Promise<void> {
  const value = lbeBonus(expeditionState(item).fit, String(item.system?.equipmentQuality ?? "basic"), tlOf(item));
  if (value === null) return;
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  await api.roll.success({
    actor, base: dx, label: F("ReachRoll", { name: item.name }), skill: "DX", kind: "attribute",
    modifiers: value ? [{ label: String(item.name ?? ""), value }] : [], tags: ["lbe", "ready"],
  } as any);
}

// ── climbing gear (pp. 55-56) ──

/**
 * A ride on the personal lifting device (p. 56): 3 yards a second up or down
 * the rope, a cartridge's 200 yards of ascent, and nothing over 300 lbs.
 */
async function ride(item: any, actor: any): Promise<void> {
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><div class="ifields">
      <label>${esc(L("LiftYards"))} <input type="number" name="yards" value="20" min="0" step="1" style="width:70px"></label>
      <label>${esc(L("LiftLoad"))} <input type="number" name="load" value="200" min="0" step="5" style="width:70px"></label>
      </div><div class="ichecks"><label class="icheck"><input type="checkbox" name="down"> ${esc(L("LiftDown"))}</label></div></div>`,
    ok: {
      label: L("LiftAction"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          yards: Math.max(0, Number(form?.querySelector<HTMLInputElement>('[name="yards"]')?.value) || 0),
          load: Math.max(0, Number(form?.querySelector<HTMLInputElement>('[name="load"]')?.value) || 0),
          down: form?.querySelector<HTMLInputElement>('[name="down"]')?.checked === true,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer) return;
  const name = String(item.name ?? "");
  const climb = liftingClimb(answer.yards, answer.load);
  if (!climb.lifts) return void (await say(actor, name, [F("LiftTooHeavy", { load: answer.load, lbs: LIFTING_DEVICE.lbs })]));
  const state = expeditionState(item);
  const left = Math.max(0, LIFTING_DEVICE.cartridgeYards - state.climbed);
  if (!answer.down && answer.yards > left) return void (await say(actor, name, [F("LiftNoFuel", { yards: answer.yards, left })]));
  if (!answer.down) await setState(item, { climbed: state.climbed + answer.yards });
  await say(actor, name, [F(answer.down ? "LiftedDown" : "LiftedUp", { name: actor?.name ?? "", yards: answer.yards, seconds: climb.seconds, left: answer.down ? left : left - answer.yards })]);
}

// ── the item sheet ──

function itemContext(api: GWorldApi, item: any, on: ExpeditionSwitches): Record<string, unknown> {
  const data = expeditionData(item);
  const state = expeditionState(item);
  const lines: string[] = [];
  const context: Record<string, unknown> = { editable: item.isOwner };
  if (on.lights() && data.light) {
    const reach = [data.light.radius ? F("RadiusLine", { yards: data.light.radius }) : "", data.light.beam ? F("BeamLine", { yards: data.light.beam }) : ""].filter(Boolean).join(L("Or"));
    if (reach) lines.push(F("ReachLine", { reach }));
    lines.push(L(state.broken ? "BrokenLine" : state.lit ? (state.placed ? "PlacedLine" : "LitLine") : "UnlitLine"));
    if (breaksWhenDropped(data.light.kind)) lines.push(L(`KindLine.${data.light.kind}`));
    if (data.light.kind === "electric" || data.light.kind === "tactical") lines.push(L("ReadyLine"));
    if (data.light.kind === "tactical" && !data.light.infrared) lines.push(F("TacticalLine", { ht: TACTICAL_BLINDING_HT }));
    if (data.light.infrared) lines.push(L("InfraredLine"));
    if (canBeInfrared(data.light.kind)) context.light = { infrared: data.light.infrared === true, hint: F(hasIrMode(item) || data.light.kind === "chemical" ? "InfraredModeHint" : "InfraredFilterHint", { cost: IR_FILTER_COST }) };
    // How long it burns on its fuel, and what is left (pp. 51-52).
    const burn = burnOf(String(item.name ?? ""), tlOf(item));
    if (burn) {
      lines.push(F(`Burn.${burn.fuel}`, { time: durationText(burn.seconds), winding: WINDING_SECONDS }));
      const left = lightLeft(item);
      if (burn.fuel !== "wind" && left !== null && left < burn.seconds) lines.push(left > 0 ? F("BurnLeft", { time: durationText(left) }) : L(`OutOfFuelLine.${burn.fuel}`));
    }
    const battery = tl8BatteryFactor(String(item.name ?? ""), tlOf(item));
    if (battery) lines.push(F("Tl8Battery", { factor: battery }));
  }
  if (on.lights() && /^tritium illuminator$/i.test(String(item.name ?? "").trim())) lines.push(L("TritiumLine"));
  if (on.loadBearing()) {
    // Canteens slosh when not full, undoing LBE's Stealth benefit (p. 53).
    if (sloshes(String(item.name ?? ""))) {
      lines.push(L("SloshLine"));
      context.canteen = { notFull: state.notFull };
    }
    if (data.carry === "backpack" || data.carry === "bag") lines.push(F("RetrieveLine", { dice: retrieveDice(data.carry) }));
    if (data.carry === "lbe") lines.push(F("FlapLine", { readies: FLAP_READY }));
  }
  if (on.climbing()) {
    const name = String(item.name ?? "").trim();
    const load = ropeLoad(name);
    if (load !== null) lines.push(F("RopeLine", { lbs: load }));
    if (/^hand drill$/i.test(name)) lines.push(F("DrillLine", { minutes: HAND_DRILL_MINUTES }));
    if (/^personal lifting device$/i.test(name)) lines.push(F("LiftLine", { speed: LIFTING_DEVICE.yardsPerSecond, yards: LIFTING_DEVICE.cartridgeYards, lbs: LIFTING_DEVICE.lbs, left: Math.max(0, LIFTING_DEVICE.cartridgeYards - state.climbed) }));
    if (/^avalanche transceiver$/i.test(name)) lines.push(F("AvalancheLine", { least: AVALANCHE_RANGE.least, most: AVALANCHE_RANGE.most }));
  }
  if (on.navigation() && data.navigation) {
    lines.push(L(`NavLine.${data.navigation}`));
    if (data.navigation === "map") context.map = { penalty: data.mapPenalty };
    if (data.navigation === "gps") context.gps = { noSignal: state.noSignal };
  }
  if (on.loadBearing() && data.carry) {
    const bonus = lbeBonus(state.fit, String(item.system?.equipmentQuality ?? "basic"), tlOf(item));
    if (data.carry === "lbe") lines.push(state.fit ? F(state.fit === "ok" ? "LbeLine" : "LbeBadLine", { bonus: bonus! >= 0 ? `+${bonus}` : String(bonus) }) : L("LbeNotSetUp"));
    else lines.push(L(state.fit === "ok" ? "PackFitted" : state.fit === "failed" ? "PackBadlyFitted" : "PackNotFitted"));
    const move = Number((api.actors.derived(item.actor) as any)?.move);
    if (item.actor && Number.isFinite(move)) lines.push(F("MarchLine", { move, mph: marchMph(move) }));
  }
  if (on.climbing() && data.climbing) {
    lines.push(L(`ClimbLine.${data.climbing}`));
    if (data.climbing === "grapnel") {
      lines.push(F("GrapnelLoad", { lbs: grapnelLoad(tlOf(item)) }));
      context.grapnel = { padded: data.padded };
    }
    if (data.climbing === "snowshoes") lines.push(L(snowshoeMove(tlOf(item)) ? "SnowshoeMove" : "SnowshoeFast"));
    if (data.climbing === "crampons") lines.push(F("CramponIce", { bonus: CRAMPON_ICE }));
  }
  context.lines = lines;
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelector<HTMLInputElement>("[data-gcc-ht-map]")?.addEventListener("change", async (event) => {
    const value = Math.max(-5, Math.min(0, Math.trunc(Number((event.currentTarget as HTMLInputElement).value) || 0)));
    await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.mapPenalty`]: value });
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-padded]")?.addEventListener("change", async (event) => {
    await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.padded`]: (event.currentTarget as HTMLInputElement).checked });
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-infrared]")?.addEventListener("change", async (event) => {
    await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.light.infrared`]: (event.currentTarget as HTMLInputElement).checked });
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-gps]")?.addEventListener("change", async (event) => {
    await setState(item, { noSignal: (event.currentTarget as HTMLInputElement).checked });
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-canteen]")?.addEventListener("change", async (event) => {
    await setState(item, { notFull: (event.currentTarget as HTMLInputElement).checked });
  });
}

export function readyExpedition(api: GWorldApi, on: ExpeditionSwitches): void {
  // The infrared kind of light, registered while the system is readying.
  infraredLight(api);
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-expedition-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-expedition-item.hbs`,
    visible: (item) => item?.type === "equipment" && (itemContext(api, item, on).lines as string[]).length > 0,
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── light sources (pp. 51-52) ──
  const lightOf = (item: any) => expeditionData(item).light;
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-light-switch",
    itemTypes: ["equipment"],
    label: L("SwitchAction"),
    icon: "fa-solid fa-lightbulb",
    visible: (item) => on.lights() && lightOf(item) !== null && !expeditionState(item).broken,
    run: (item, actor) => { void switchLight(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-light-set-down",
    itemTypes: ["equipment"],
    label: L("SetDown"),
    icon: "fa-solid fa-location-dot",
    visible: (item) => {
      const light = lightOf(item);
      const state = expeditionState(item);
      return on.lights() && light !== null && !state.broken && !state.placed && (state.lit ? light.radius > 0 || light.beam > 0 : breaksWhenDropped(light.kind));
    },
    run: (item, actor) => { void setDown(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-light-refuel",
    itemTypes: ["equipment"],
    label: L("RefuelAction"),
    icon: "fa-solid fa-gas-pump",
    visible: (item) => {
      if (!on.lights() || !lightOf(item) || expeditionState(item).broken) return false;
      const burn = burnOf(String(item.name ?? ""), tlOf(item));
      const left = lightLeft(item);
      return burn !== null && burn.fuel !== "wind" && left !== null && left < burn.seconds;
    },
    run: (item, actor) => { void refuel(api, item, actor); },
  });
  // A flashlight's batteries last ten times as long at TL8 (p. 52).
  registerPowerAdjuster((item) => {
    if (!on.lights() || !lightOf(item)) return null;
    const factor = tl8BatteryFactor(String(item?.name ?? ""), tlOf(item));
    return factor ? { endurance: factor } : null;
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-light-pick-up",
    itemTypes: ["equipment"],
    label: L("PickUp"),
    icon: "fa-solid fa-hand",
    visible: (item) => on.lights() && expeditionState(item).placed,
    run: (item, actor) => {
      void (async () => {
        await pickUp(api, item, actor);
        await say(actor, String(item.name ?? ""), [F("PickedUp", { name: item.name })]);
      })();
    },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-light-eyes",
    itemTypes: ["equipment"],
    label: L("EyesAction"),
    icon: "fa-solid fa-eye-slash",
    // An infrared light blinds nobody: it is only seen through night-vision gear (p. 52).
    visible: (item) => on.lights() && lightOf(item)?.kind === "tactical" && !lightOf(item)?.infrared && !expeditionState(item).broken,
    run: (item, actor) => { void shineInEyes(api, item, actor); },
  });
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: EYES_CARD,
    template: `modules/${MODULE_ID}/templates/ht-expedition-card.hbs`,
    // Posted only under a switch that shines a light: by hand here, or fitted to a gun (the accessories').
    actions: {
      resist: async ({ message, data }: any) => { await resistLight(api, message, data as EyesData); },
      surprisePartial: { permission: "gm", run: async ({ message, data }: any) => { await surpriseWithLight(api, message, data as EyesData, false); } },
      surpriseTotal: { permission: "gm", run: async ({ message, data }: any) => { await surpriseWithLight(api, message, data as EyesData, true); } },
    },
  } as any);
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: FIRE_CARD,
    template: `modules/${MODULE_ID}/templates/ht-lantern-fire-card.hbs`,
    actions: {
      burn: { permission: "gm", run: async ({ data, actor }: any) => { if (on.lights()) await burnSecond(api, data as FireData, actor); } },
    },
  } as any);

  // A target a light reaches is no darker than a lit spot (pp. 51-52; Campaigns p. 394).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.lights()) return;
    const line = (context?.modifiers ?? []).find((m: any) => m?.key === "darkness");
    const target = context?.targetTokens?.[0];
    if (!line || !target) return;
    const value = litPenalty(Number(line.darkness) || 0, Number(line.value) || 0);
    if (value <= (Number(line.value) || 0)) return;
    const light = lightOver(api, context.actor, target);
    if (!light) return;
    line.value = value;
    line.label = F("LitDarkness", { label: line.label, light });
  });

  // ── navigation (pp. 52-53) ──
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    const actor = context?.actor;
    const name = String(context?.name ?? "");
    if (!actor || !name) return;
    if (on.navigation()) {
      for (const line of navigationLines(actor, name)) context.lines?.push?.({ ...line, source: MODULE_ID });
    }
    // A pack of quality, fitted, helps Hiking (p. 54).
    if (on.loadBearing() && /^hiking\b/i.test(name)) {
      const packs = gearOf(actor).filter((i) => ["backpack", "bag"].includes(expeditionData(i).carry) && expeditionState(i).fit === "ok");
      const best = packs.map((i) => ({ name: String(i.name ?? ""), value: qualityBonus(String(i.system?.equipmentQuality ?? "basic"), tlOf(i)) })).sort((a, b) => b.value - a.value)[0];
      if (best && best.value > 0) context.lines?.push?.({ label: F("PackHiking", { name: best.name }), value: best.value, source: MODULE_ID });
    }
  });

  // ── load-bearing gear (pp. 53-55) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-lbe-fit",
    itemTypes: ["equipment"],
    label: L("FitAction"),
    icon: "fa-solid fa-person-hiking",
    visible: (item) => on.loadBearing() && expeditionData(item).carry !== "",
    run: (item, actor) => { void fitGear(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-lbe-reach",
    itemTypes: ["equipment"],
    label: L("ReachAction"),
    icon: "fa-solid fa-hand-back-fist",
    visible: (item) => on.loadBearing() && expeditionData(item).carry === "lbe" && expeditionState(item).fit !== "",
    run: (item, actor) => { void reachGear(api, item, actor); },
  });
  // Getting something out of a pack: a long action of 1d or 2d seconds, no Fast-Draw (p. 54).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-pack-retrieve",
    itemTypes: ["equipment"],
    label: L("RetrieveAction"),
    icon: "fa-solid fa-box-open",
    visible: (item) => on.loadBearing() && ["backpack", "bag"].includes(expeditionData(item).carry),
    run: (item, actor) => {
      void (async () => {
        const dice = retrieveDice(expeditionData(item).carry);
        const roll = new Roll(`${dice}d6`);
        await roll.evaluate();
        await say(actor, String(item.name ?? ""), [F("Retrieved", { name: actor?.name ?? "", item: item.name, seconds: roll.total })], [roll]);
      })();
    },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-pack-pain",
    itemTypes: ["equipment"],
    label: L("DayHikedAction"),
    icon: "fa-solid fa-person-walking",
    visible: (item) => on.loadBearing() && ["backpack", "bag"].includes(expeditionData(item).carry) && expeditionState(item).fit === "failed",
    run: (item, actor) => {
      void (async () => {
        await api.actors.applyCondition(actor, { key: "moderatePain" } as any);
        await say(actor, String(item.name ?? ""), [F("PackPain", { name: actor?.name ?? "" })]);
      })();
    },
  });

  // Climbing gear cancels the climb's own penalty (pp. 55-56): the system's
  // line keyed climbKind on the Climb roll (Campaigns p. 349; API 1.103.0).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const tags: string[] = context?.tags ?? [];
    if (!on.climbing() || !tags.includes("climbing") || !Array.isArray(context.modifiers)) return;
    const line = context.modifiers.find((m: any) => m?.key === "climbKind");
    if (!line || !(Number(line.value) < 0)) return;
    const gear = gearOf(context.actor).find((i) => cancelsClimb(expeditionData(i).climbing, String(i.name ?? ""), tags));
    if (!gear) return;
    line.value = 0;
    line.label = F("ClimbCancelled", { label: line.label ?? "", name: gear.name });
  });

  // Quality LBE at TL6+ lightens Stealth's encumbrance penalty by its
  // quality (p. 54): the system's line keyed encumbrance (Characters p. 222; API 1.103.0).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.loadBearing() || !Array.isArray(context?.modifiers) || !/^stealth\b/i.test(String(context.skill ?? ""))) return;
    const line = context.modifiers.find((m: any) => m?.key === "encumbrance");
    if (!line || !(Number(line.value) < 0)) return;
    // A canteen not full to the brim sloshes: no Stealth benefit from the LBE (p. 53).
    const slosher = gearOf(context.actor).find((i) => sloshes(String(i.name ?? "")) && expeditionState(i).notFull);
    if (slosher) return;
    const best = gearOf(context.actor)
      .filter((i) => expeditionData(i).carry === "lbe")
      .map((i) => ({ name: String(i.name ?? ""), bonus: lbeStealth(String(i.system?.equipmentQuality ?? "basic"), tlOf(i)) }))
      .sort((a, b) => b.bonus - a.bonus)[0];
    if (!best?.bonus) return;
    line.value = Math.min(0, Number(line.value) + best.bonus);
    line.label = F("LbeStealth", { label: line.label ?? "", name: best.name, bonus: best.bonus });
  });

  // Fast-Draw from set-up LBE takes its quality (p. 54).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.loadBearing() || !drawsFromLbe(String(context?.skill ?? ""))) return;
    const lbe = lbeOf(context.actor);
    if (lbe && lbe.value) context.modifiers?.push?.({ label: F("LbeFastDraw", { name: lbe.name }), value: lbe.value });
  });

  // TL8 packs weigh half; backpacks cost double (p. 54).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-pack-price",
    types: ["equipment"],
    apply: (item, price) => {
      if (!on.loadBearing()) return null;
      const m = packPrice(expeditionData(item).carry, tlOf(item));
      if (!m) return null;
      return { cost: Math.round(price.cost * m.cost * 100) / 100, weight: Math.round(price.weight * m.weight * 1000) / 1000, label: L("Tl8Pack") };
    },
  });

  // A flashlight's IR filter (p. 52).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-ir-filter",
    types: ["equipment"],
    apply: (item, price) => {
      const cost = on.lights() ? infraredCost(expeditionData(item).light, hasIrMode(item)) : 0;
      return cost ? { cost: Math.round((price.cost + cost) * 100) / 100, weight: price.weight, label: L("IrFilterPrice") } : null;
    },
  });

  // A padded grapnel's extra pound (p. 55).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-padded-grapnel",
    types: ["equipment"],
    apply: (item, price) => {
      const data = expeditionData(item);
      if (!on.climbing() || data.climbing !== "grapnel" || !data.padded) return null;
      return { cost: price.cost, weight: Math.round((price.weight + PADDED_GRAPNEL.weight) * 1000) / 1000, label: L("PaddedPrice") };
    },
  });

  // ── climbing gear (pp. 55-56) ──
  const ropeGear = (actor: any) => gearOf(actor).some((i) => ROPE_GEAR.includes(expeditionData(i).climbing));
  const sureFooted = (actor: any) => [...(actor?.items ?? [])].some((i: any) => i?.type === "trait" && /^sure-footed\b/i.test(String(i.name ?? "")));
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: RAPPEL_OPTION,
    label: L("Rappelling"),
    attack: "ranged",
    available: (context: any) => on.climbing() && ropeGear(context?.actor),
    apply: (context: any, value: unknown) => {
      if (!value) return null;
      const sure = sureFooted(context?.actor);
      return { modifiers: [{ label: L(sure ? "RappellingSure" : "Rappelling"), value: rappelPenalty(sure) }] };
    },
  } as any);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-climb-fall",
    itemTypes: ["equipment"],
    label: L("FallAction"),
    icon: "fa-solid fa-person-falling",
    visible: (item) => on.climbing() && ["harness", "rappelKit"].includes(expeditionData(item).climbing),
    run: (item, actor) => {
      void (async () => {
        const asked: any = await foundry.applications.api.DialogV2.prompt({
          window: { title: String(item.name ?? "") },
          content: `<div class="gworld"><p class="ihint">${esc(L("FallHint"))}</p>
            <div class="ifields"><label>${esc(L("FallYards"))} <input type="number" min="0" step="1" name="yards" value="3"></label></div></div>`,
          ok: {
            label: L("FallAction"),
            callback: (_event: Event, button: HTMLElement) => ({ yards: Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="yards"]')?.value) || 0 }),
          },
          rejectClose: false,
        });
        if (!asked) return;
        const yards = anchoredFall(asked.yards);
        await say(actor, String(item.name ?? ""), [F("FallLine", { name: actor?.name ?? "", above: asked.yards, yards })]);
        // The fall itself, as the system's falling procedure rolls it (Campaigns pp. 430-431).
        if (yards > 0 && actor) await api.hazards.fall(actor, { yards });
      })();
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grapnel",
    itemTypes: ["equipment"],
    label: L("GrapnelAction"),
    icon: "fa-solid fa-anchor",
    visible: (item) => on.climbing() && expeditionData(item).climbing === "grapnel",
    run: (item, actor) => {
      void (async () => {
        const use = grapnelRoll(Number(api.actors.attribute(actor, "DX")) || 10, api.actors.skillLevel(actor, "Throwing"));
        const st = Number(api.actors.attribute(actor, "ST")) || 10;
        await say(actor, String(item.name ?? ""), [F("GrapnelLine", { yards: grapnelRange(st), lbs: grapnelLoad(tlOf(item)) }), L("GrapnelRing")]);
        await api.roll.success({ actor, base: use.level, label: F("GrapnelRoll", { skill: use.skill === "DX" ? "DX-3" : "Throwing" }), skill: use.skill, kind: use.skill === "DX" ? "attribute" : "skill", tags: ["grapnel"] } as any);
      })();
    },
  });

  // A grapnel landing on stone or concrete rings: heard on an unmodified
  // roll at 1 yard, a padded one at -2 (p. 55; Campaigns p. 358).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-grapnel-heard",
    itemTypes: ["equipment"],
    label: L("GrapnelHeardAction"),
    icon: "fa-solid fa-ear-listen",
    visible: (item) => on.climbing() && expeditionData(item).climbing === "grapnel",
    run: (item, actor) => void hearSound(api, actor, grapnelSound(item)),
  });

  // Crampons on ice: +1 to Climbing (p. 56). The system's Climb roll knows
  // no ice, so the climb on ice is rolled from the crampons' row.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-crampons-ice",
    itemTypes: ["equipment"],
    label: L("IceClimbAction"),
    icon: "fa-solid fa-icicles",
    visible: (item) => on.climbing() && expeditionData(item).climbing === "crampons",
    run: (item, actor) => {
      void (async () => {
        const known = api.actors.skillLevel(actor, "Climbing");
        const base = typeof known === "number" ? known : (Number(api.actors.attribute(actor, "DX")) || 10) - 5;
        const worn = item.system?.equipped === true;
        await api.roll.success({
          actor, base, label: L("IceClimbRoll"), skill: "Climbing", kind: "skill",
          modifiers: worn ? [{ label: F("CramponLine", { name: item.name }), value: CRAMPON_ICE }] : [],
          tags: ["climbing", "climb-ice", "DX"],
        } as any);
      })();
    },
  });

  // The personal lifting device: 3 yards a second, 200 yards up a cartridge, 300 lbs. (p. 56).
  const isLifter = (item: any) => /^personal lifting device$/i.test(String(item?.name ?? "").trim());
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-lifting-device",
    itemTypes: ["equipment"],
    label: L("LiftAction"),
    icon: "fa-solid fa-elevator",
    visible: (item) => on.climbing() && isLifter(item),
    run: (item, actor) => { void ride(item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-lifting-cartridge",
    itemTypes: ["equipment"],
    label: L("CartridgeAction"),
    icon: "fa-solid fa-rotate-left",
    visible: (item) => on.climbing() && isLifter(item) && expeditionState(item).climbed > 0,
    run: (item, actor) => {
      void (async () => {
        await setState(item, { climbed: 0 });
        await say(actor, String(item.name ?? ""), [F("CartridgeFitted", { yards: LIFTING_DEVICE.cartridgeYards })]);
      })();
    },
  });

  // Snowshoes' bulk: -1 Move while worn, but for TL8 ones (p. 56).
  Hooks.on(api.data.hooks.moveModifiers, (context: any) => {
    if (!on.climbing()) return;
    const shoes = gearOf(context?.actor).find((i) => expeditionData(i).climbing === "snowshoes" && i.system?.equipped === true && snowshoeMove(tlOf(i)) !== 0);
    if (shoes) context.lines?.push?.({ label: String(shoes.name ?? ""), value: snowshoeMove(tlOf(shoes)) });
  });

  // Crampons' spikes: +2 to kicking damage while worn (p. 56). They go on
  // over boots, so the system's +1 for the boots (Characters p. 271) stays.
  Hooks.on(api.combat.hooks.unarmedAttacks, (context: any) => {
    if (!on.climbing()) return;
    const crampons = gearOf(context?.actor).find((i) => expeditionData(i).climbing === "crampons" && i.system?.equipped === true);
    if (!crampons) return;
    for (const entry of context.rows ?? []) {
      if (entry.mode?.naturalKey !== "kick" || !entry.row) continue;
      entry.row.damage = context.addToDamage(String(entry.row.damage ?? ""), CRAMPON_KICK);
      entry.row.notes?.push?.({ label: String(crampons.name ?? ""), hint: F("CramponKick", { bonus: CRAMPON_KICK }) });
    }
  });
}
