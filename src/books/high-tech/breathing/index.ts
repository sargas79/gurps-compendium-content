/**
 * High-Tech's breathing gear and environment suits (pp. 72-76), registered
 * with the system through the add-on API under two switches. The rules are in
 * `rules.ts`; the trait terms and their writing are the shared protective gear
 * engine's, which Ultra-Tech's armour reads with its own table.
 *
 *   - **Breathing gear (breathingGear):** gas masks as Filter Lungs, and every
 *     mask and diving rig's No Sense of Smell/Taste and No Peripheral or
 *     Tunnel Vision, through `gworld.traitEffects`; an SCBA, scuba or
 *     full-face mask as Doesn't Breathe while a tank feeds it, a rebreather or
 *     scuba set while its own gas lasts, and hard-hat dress while worn; a
 *     tank's air by TL, divided by the depth the diver is at (kept on the
 *     diver, so all their supplies read it), a minute less for every FP spent
 *     (`gworld.fatigueCost`) and every failed Fright Check
 *     (`gworld.afterSuccessRoll`), and row actions to breathe from it and to
 *     refill it; a diver who breathed a pure-oxygen rebreather below 30'
 *     rolls HT against the bends (Campaigns p. 435) on a card when back at the
 *     surface; Scuba (Closed-Circuit) at Scuba-4, and Scuba from it at -2
 *     (`gworld.skillLevels`); a gas mask keeping tear gas out of the eyes and
 *     nose; and the sheet's notes: don times, muffled speech, the TL6 hose,
 *     bubbles.
 *   - **Environment suits (environmentSuits):** biohazard and NBC suits sealed
 *     with an air mask under them (an NBC suit no longer, once wet or 72 hours
 *     after it was first put on), the TL8 biohazard lining's PF 2.5, and the
 *     biohazard suit tripling the FP of effort and weather; the anti-G suit's
 *     row rolling HT against high acceleration (Campaigns p. 434) with its
 *     +3; the EVA suit's climate control, and a bomb suit's where one is
 *     fitted, in the climate engine (`suitClimateGear`); the clean suit's
 *     +4 HT against contagion; the Apollo suits sealed with their helmets,
 *     breathing from a tank or the EVA suit's seven-hour pack, the EVA suit's
 *     climate control, the helmets' senses; biomedical sensors on the patient
 *     as +1 to Diagnosis, or -2 read from afar; and the sheet's notes for
 *     the rest.
 *
 * The Environment Suit skill that limits DX while a suit is worn is the
 * record's `environmentSuit`, which the system reads.
 */

import { bookOf } from "../../../shared/book-tables.js";
import type { ClimateGear } from "../../../shared/climate/index.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { BIOMEDICAL, BIOMEDICAL_TABLES, addProtection, protectionText, readyBiomedical } from "../../../shared/protective-gear/index.js";
import {
  AIR_LOST,
  ANTI_G,
  ANTI_G_BONUS,
  BOMB_SUIT,
  CLEAN_SUIT_CONTAGION,
  CLIMATE_CONTROL,
  CLOSED_CIRCUIT,
  CLOSED_CIRCUIT_DEFAULTS,
  GAS_MASK_FILTER,
  GAS_MASK_HOSE,
  HOT_SUIT_REASONS,
  NBC_SEAL_HOURS,
  OPEN_CIRCUIT,
  OXYGEN_DEPTH_FEET,
  SPACE_SUIT_EVA,
  WET_TURNOUT,
  airLeft,
  airTankSize,
  airUsedBreathing,
  breathesPureOxygen,
  breathingGear,
  breathingProtection,
  hasBiomedicalSensors,
  hotSuitFp,
  isAirMask,
  isBiohazardSuit,
  isCleanSuit,
  isGasMask,
  isNbcSuit,
  isRebreather,
  isTankFed,
  mufflesSpeech,
  nbcSeals,
  oxygenBendsRisk,
  pressureAtDepth,
  scubaDefault,
  supplyMinutes,
  type BreathingRule,
} from "./rules.js";
import { defaultedLevel, type CostTable } from "../skills/rules.js";

const NS = "GCC.HT.Breathing";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Item flag: the textbook minutes of a supply used, and the depth it is breathed at. */
const AIR_FLAG = "htAir";
/** Item flag: turnout gear soaked with water (p. 75), or an NBC suit that got wet. */
const WET_FLAG = "htWet";
/** Actor flag: the depth the diver is at, in feet. */
const DEPTH_FLAG = "htDiveDepth";
/** Actor flag: the diver breathed pure oxygen below 30' and risks the bends on surfacing (p. 76). */
const BENDS_FLAG = "htOxygenBends";
/** Item flag: the world time an NBC suit was first put on (p. 75). */
const NBC_FLAG = "htNbcSince";
/** Item flag: a bomb disposal suit fitted with a climate-control system (p. 76). */
const FITTED_FLAG = "htClimateFitted";
const BENDS_CARD = "ht-bends";
const worldNow = (): number => Number((game as any).time?.worldTime) || 0;

/**
 * The environment suits' climate control, for the climate engine (pp. 74-76):
 * the EVA suit's always, a bomb disposal suit's where the sheet says one is
 * fitted. So the engine's readers -- a hot march, armour in a hot battle --
 * know the suits cool, under the suits' own switch.
 */
export function suitClimateGear(rule: string): ClimateGear[] {
  return [
    { pattern: SPACE_SUIT_EVA, zone: CLIMATE_CONTROL, rule },
    { pattern: BOMB_SUIT, zone: CLIMATE_CONTROL, rule, running: (item: any) => item?.flags?.[MODULE_ID]?.[FITTED_FLAG] === true },
  ];
}

/** Whether a worn NBC suit still seals: dry, and within 72 hours of first being put on (p. 75). */
export function nbcSealHolds(item: any): boolean {
  const since = item?.flags?.[MODULE_ID]?.[NBC_FLAG];
  return nbcSeals({ wet: item?.flags?.[MODULE_ID]?.[WET_FLAG] === true, since: typeof since === "number" ? since : null, now: worldNow() });
}

/** Worn turnout gear that is soaked, or null. */
function wetTurnout(actor: any): any {
  return [...(actor?.items ?? [])].find((i: any) => i?.system?.equipped === true && /^turnout gear$/i.test(breathingName(i)) && i.getFlag?.(MODULE_ID, WET_FLAG) === true) ?? null;
}

export interface BreathingSwitches {
  breathing: () => boolean;
  suits: () => boolean;
}

/** What has been used of a supply's air, and at what depth it is breathed. */
export interface AirState {
  used: number;
  depthFeet: number;
}

const isGear = (item: any) => item?.type === "armor" || item?.type === "equipment";
const worn = (item: any) => isGear(item) && item.system?.equipped === true;
const carried = (item: any) => isGear(item) && item.system?.carried !== false;
/** The book's own gear, or gear from no book at all: another book's is its own table's. */
const ours = (item: any) => { const book = bookOf(item); return book === null || book === "high-tech"; };
/** The TL an item was made at, TL7 where it says none. */
const tlOf = (item: any) => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 7;
const nameOf = (item: any) => String(item?.name ?? "");
/**
 * The TL a supply's air is read at: the tank's own, or its owner's where that
 * is later -- a TL8 diver fills a tank to TL8's figures (p. 74).
 */
const supplyTl = (item: any) => Math.max(tlOf(item), Number(/\d+/.exec(String(item?.actor?.system?.tl ?? ""))?.[0]) || 0);

/**
 * The depth a diver is at, kept on the diver, so every tank and rebreather
 * they carry reads the same depth (p. 74); null for one never given a depth.
 */
export function diverDepth(actor: any): number | null {
  const feet = actor?.getFlag?.(MODULE_ID, DEPTH_FLAG) ?? actor?.flags?.[MODULE_ID]?.[DEPTH_FLAG];
  return typeof feet === "number" && Number.isFinite(feet) ? Math.max(0, feet) : null;
}

export function airState(item: any): AirState {
  const stored = item?.getFlag?.(MODULE_ID, AIR_FLAG) ?? item?.flags?.[MODULE_ID]?.[AIR_FLAG] ?? {};
  // The diver's depth where the supply is carried; a loose supply keeps its own.
  const depth = diverDepth(item?.actor) ?? stored.depthFeet;
  return { used: Math.max(0, Number(stored.used) || 0), depthFeet: Math.max(0, Number(depth) || 0) };
}

/**
 * Sets the depth a supply is breathed at: on its diver where it is carried,
 * on the supply itself otherwise. A diver coming up from below 30' on a
 * pure-oxygen rebreather rolls against the bends at the surface (p. 76).
 */
async function setDepth(item: any, feet: number): Promise<void> {
  const depth = Math.max(0, Number(feet) || 0);
  const actor = item?.actor;
  if (!actor) {
    await item?.setFlag?.(MODULE_ID, AIR_FLAG, { ...airState(item), depthFeet: depth });
    return;
  }
  if (!actor.isOwner) return;
  await actor.setFlag(MODULE_ID, DEPTH_FLAG, depth);
  if (depth > 0) {
    if (breathingOn() && oxygenBendsRisk(nameOf(item), depth) && actor.getFlag?.(MODULE_ID, BENDS_FLAG) !== true) {
      await actor.setFlag(MODULE_ID, BENDS_FLAG, true);
      await say(actor, nameOf(item), [F("OxygenDeep", { feet: OXYGEN_DEPTH_FEET })]);
    }
    return;
  }
  if (actor.getFlag?.(MODULE_ID, BENDS_FLAG) === true) {
    await actor.unsetFlag(MODULE_ID, BENDS_FLAG);
    if (bendsCard) await bendsCard(actor, nameOf(item));
  }
}

/** Posts the card for a diver's roll against the bends; set when the book is ready. */
let bendsCard: ((actor: any, source: string) => Promise<void>) | null = null;

/** The minutes a supply has left at its depth, or null for an item that isn't one. */
export function minutesLeft(item: any): number | null {
  if (!ours(item)) return null;
  const minutes = supplyMinutes(nameOf(item), supplyTl(item));
  if (minutes === null) return null;
  const state = airState(item);
  return airLeft(minutes, state.used, state.depthFeet);
}

const hasAir = (item: any) => (minutesLeft(item) ?? 0) > 0;

/**
 * The supply the wearer is breathing from, or null: a rebreather or scuba set
 * worn, the EVA suit's pack with its helmet on, or a tank carried for a mask
 * or a sealed Apollo suit that needs one -- each while it still holds air.
 */
export function airSupply(actor: any, on: BreathingSwitches): any {
  const items = [...(actor?.items ?? [])].filter(ours);
  const wornItems = items.filter(worn);
  const wearing = (pattern: RegExp) => wornItems.find((i) => pattern.test(breathingName(i)));
  if (on.breathing()) {
    const own = wornItems.find((i) => (isRebreather(nameOf(i)) || /^scuba gear$/i.test(breathingName(i))) && hasAir(i));
    if (own) return own;
  }
  if (on.suits()) {
    const eva = wearing(/^space suit, eva$/i);
    if (eva && wearing(/^space suit, eva space helmet$/i) && hasAir(eva)) return eva;
  }
  const needsTank = (on.breathing() && wornItems.some((i) => isTankFed(nameOf(i))))
    || (on.suits() && Boolean(wearing(/^space suit$/i) && wearing(/^space suit space helmet$/i)));
  if (!needsTank) return null;
  return items.find((i) => carried(i) && airTankSize(nameOf(i)) && hasAir(i)) ?? null;
}

/** A name without its TL, as the tables read it. */
function breathingName(item: any): string {
  return nameOf(item).replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

let breathingOn: () => boolean = () => false;

/**
 * Whether a character wears a mask that makes them immune to eye and nose
 * irritants -- tear gas -- as every mask the tables print does (pp. 72-73, 76).
 */
export function wearsIrritantMask(actor: any): boolean {
  if (!breathingOn() || !actor) return false;
  return [...(actor.items ?? [])].some((i: any) => worn(i) && ours(i) && (isAirMask(nameOf(i)) || isRebreather(nameOf(i)) || /^(scuba gear|closed-dress suit|hard-hat suit)$/i.test(breathingName(i))));
}

/** Takes minutes off a supply's air: a textbook minute for each. */
async function spendAir(item: any, minutes: number): Promise<void> {
  if (!item?.isOwner || !(minutes > 0)) return;
  const state = airState(item);
  await item.setFlag(MODULE_ID, AIR_FLAG, { ...state, used: state.used + minutes });
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

const round = (n: number) => Math.round(n * 10) / 10;

// ── the sheet ────────────────────────────────────────────────────────────────

/** What an item's sheet says about it under the switches that are on. */
export function breathingLines(item: any, on: BreathingSwitches): string[] {
  if (!ours(item)) return [];
  const name = nameOf(item);
  const base = breathingName(item);
  const tl = tlOf(item);
  const lines: string[] = [];
  const gear = breathingGear(name, tl);
  const ruleOn = (rule: BreathingRule) => (rule === "breathing" ? on.breathing() : on.suits());
  if (gear && ruleOn(gear.rule)) {
    if (gear.alone && Object.keys(gear.alone).length) lines.push(F("Alone", { list: protectionText(NS, gear.alone) }));
    if (gear.completedBy) lines.push(F("With", { with: L(`Completes.${gear.completedBy.key}`), list: protectionText(NS, gear.completedBy.grants) }));
    if (gear.don) lines.push(F("Don", { on: gear.don.on, off: gear.don.off }));
  }
  if (on.breathing()) {
    if (isAirMask(name) || isRebreather(name) || /^(scuba gear|closed-dress suit|hard-hat suit)$/i.test(base)) lines.push(L("Irritants"));
    if (mufflesSpeech(name, tl)) lines.push(L("Muffled"));
    else if (isAirMask(name)) lines.push(L("Amplifier"));
    if (isGasMask(name) && tl === GAS_MASK_HOSE.tl) lines.push(F("Hose", { toHit: GAS_MASK_HOSE.toHit }));
    if (isGasMask(name)) lines.push(F("Filter", { cost: GAS_MASK_FILTER.cost, weight: GAS_MASK_FILTER.weight }));
    if (isTankFed(name)) lines.push(L("TankFed"));
    if (/^(scuba mask|ffm|scuba gear)$/i.test(base)) lines.push(L("Bubbles"));
    if (isRebreather(name)) lines.push(breathesPureOxygen(name) ? F("Oxygen", { feet: OXYGEN_DEPTH_FEET }) : L("MixedGas"));
    if (/^(closed-dress suit|hard-hat suit)$/i.test(base)) lines.push(L("HardHat"));
  }
  const minutes = supplyMinutes(name, supplyTl(item));
  const supplyOn = minutes !== null && (/^space suit, eva$/i.test(base) ? on.suits() : on.breathing());
  if (supplyOn) {
    const state = airState(item);
    const left = airLeft(minutes!, state.used, state.depthFeet);
    lines.push(F("Holds", { minutes: minutes!, tl: Math.max(6, Math.min(8, supplyTl(item))) }));
    lines.push(state.depthFeet > 0
      ? F("LeftAtDepth", { left: round(left), feet: state.depthFeet, pressure: round(pressureAtDepth(state.depthFeet)) })
      : F("Left", { left: round(left) }));
    lines.push(F("Exertion", { fp: AIR_LOST.perFp, fright: AIR_LOST.perFailedFright }));
  }
  if (on.suits()) {
    if (isBiohazardSuit(name)) lines.push(L("HotSuit"));
    if (isNbcSuit(name)) {
      lines.push(F("NbcSeal", { hours: NBC_SEAL_HOURS }));
      if (!nbcSealHolds(item)) lines.push(L("NbcSealLost"));
    }
    if (isCleanSuit(name)) lines.push(F("CleanSuit", { bonus: CLEAN_SUIT_CONTAGION }));
    if (/^anti-g suit$/i.test(base)) lines.push(F("AntiG", { bonus: ANTI_G_BONUS }));
    if (/^dry suit$/i.test(base)) lines.push(L("DrySuit"));
    if (/^wetsuit$/i.test(base)) lines.push(L("Wetsuit"));
    if (/^turnout gear$/i.test(base)) lines.push(F("Turnout", { dr: WET_TURNOUT.dr, times: WET_TURNOUT.multiplier }));
    if (/^bomb disposal suit$/i.test(base)) lines.push(L("BombSuit"));
    if (SPACE_SUIT_EVA.test(base) || (BOMB_SUIT.test(base) && item?.flags?.[MODULE_ID]?.[FITTED_FLAG] === true)) lines.push(L("SuitClimate"));
    if (hasBiomedicalSensors(name)) lines.push(F("Biomedical", { bonus: BIOMEDICAL.inPerson, remote: BIOMEDICAL.remote }));
  }
  return lines;
}

function itemContext(item: any, on: BreathingSwitches): Record<string, unknown> {
  const minutes = supplyMinutes(nameOf(item), tlOf(item));
  const supply = ours(item) && minutes !== null && (/^space suit, eva$/i.test(breathingName(item)) ? on.suits() : on.breathing());
  const turnout = on.suits() && /^turnout gear$/i.test(breathingName(item));
  // An NBC suit that got wet loses its seal (p. 75): the same tick as turnout gear's.
  const nbc = on.suits() && ours(item) && isNbcSuit(nameOf(item));
  const fitted = on.suits() && ours(item) && BOMB_SUIT.test(breathingName(item)) ? { checked: item?.flags?.[MODULE_ID]?.[FITTED_FLAG] === true } : null;
  return { lines: breathingLines(item, on), supply, depthFeet: airState(item).depthFeet, turnout, nbc, fitted, wet: item?.getFlag?.(MODULE_ID, WET_FLAG) === true, editable: item?.isOwner === true };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelector<HTMLInputElement>("[data-gcc-ht-turnout-wet]")?.addEventListener("change", async (event) => {
    await item.setFlag(MODULE_ID, WET_FLAG, (event.currentTarget as HTMLInputElement).checked);
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-climate-fitted]")?.addEventListener("change", async (event) => {
    await item.setFlag(MODULE_ID, FITTED_FLAG, (event.currentTarget as HTMLInputElement).checked);
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-dive-depth]")?.addEventListener("change", async (event) => {
    await setDepth(item, Math.max(0, Number((event.currentTarget as HTMLInputElement).value) || 0));
  });
}

// ── high acceleration (Campaigns p. 434) ─────────────────────────────────────

/**
 * The HT roll against a sudden high acceleration: -2 a doubling past 2.5
 * times home gravity, +2 seated or lying down, -2 upside down, and the anti-G
 * suit's +3 through the roll's `acceleration` tag (p. 74). A failure costs FP
 * equal to the margin; a critical failure also blacks the wearer out for ten
 * seconds a point of it.
 */
async function accelerationRoll(api: GWorldApi, actor: any): Promise<void> {
  if (!actor) return;
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("AccelerationAction") },
    content: `<div class="gworld" style="display:grid;gap:6px">`
      + `<label>${esc(L("GForce"))} <input type="number" name="g" value="5" min="0" step="0.5"></label>`
      + `<label>${esc(L("HomeGravity"))} <input type="number" name="home" value="1" min="0" step="0.1"></label>`
      + `<label class="icheck"><input type="checkbox" name="braced" checked> ${esc(L("Braced"))}</label>`
      + `<label class="icheck"><input type="checkbox" name="inverted"> ${esc(L("Inverted"))}</label></div>`,
    ok: {
      label: L("AccelerationAction"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest(".application");
        return {
          g: Number(form?.querySelector<HTMLInputElement>("[name=g]")?.value) || 0,
          home: Number(form?.querySelector<HTMLInputElement>("[name=home]")?.value) || 1,
          braced: form?.querySelector<HTMLInputElement>("[name=braced]")?.checked === true,
          inverted: form?.querySelector<HTMLInputElement>("[name=inverted]")?.checked === true,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer) return;
  if (!api.rules.accelerationNeedsRoll({ gForce: answer.g, homeGravity: answer.home })) {
    await say(actor, L("AccelerationAction"), [F("NoAccelerationRoll", { g: answer.g })]);
    return;
  }
  const ht = Number(api.actors.attribute(actor, "HT")) || 10;
  const doublings = api.rules.accelerationTarget({ health: 0, gForce: answer.g, homeGravity: answer.home });
  const modifiers = [
    ...(doublings ? [{ label: F("GForceLine", { g: answer.g }), value: doublings }] : []),
    ...(answer.braced ? [{ label: L("Braced"), value: 2 }] : []),
    ...(answer.inverted ? [{ label: L("Inverted"), value: -2 }] : []),
  ];
  const outcome: any = await api.roll.success({ actor, base: ht, label: F("AccelerationRoll", { g: answer.g }), skill: "HT", kind: "attribute", modifiers, tags: ["acceleration", "HT"] } as any);
  if (!outcome || "refused" in outcome || outcome.success) return;
  const harm = api.rules.accelerationHarm({ margin: Number(outcome.margin) || 0, criticalFailure: outcome.criticalFailure === true });
  if (harm.fatigue > 0) await api.actors.applyInjury(actor, { amount: harm.fatigue, fatigue: true, label: L("AccelerationAction") } as any);
  if (harm.blackoutSeconds > 0) await api.actors.applyCondition(actor, { key: "unconscious", holdRecovery: { seconds: harm.blackoutSeconds } } as any);
  await say(actor, L("AccelerationAction"), [F(harm.blackoutSeconds ? "AccelerationBlackout" : "AccelerationFp", { name: String(actor.name ?? ""), fp: harm.fatigue, seconds: harm.blackoutSeconds })]);
}

// ── ready ────────────────────────────────────────────────────────────────────

export function readyBreathing(api: GWorldApi, on: BreathingSwitches): void {
  breathingOn = on.breathing;
  const anyOn = () => on.breathing() || on.suits();
  const ruleOn = (rule: BreathingRule) => (rule === "breathing" ? on.breathing() : on.suits());
  const supplyRuleOn = (item: any) => (/^space suit, eva$/i.test(breathingName(item)) ? on.suits() : on.breathing());

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-breathing-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-breathing-item.hbs`,
    visible: (item) => anyOn() && breathingLines(item, on).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── wet turnout gear (p. 75): +5 DR against burning, and the burning that
  // gets through doubled -- a vulnerability from worn gear (Characters p. 161; API 1.106.0) ──
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.suits() || String(context?.damageType ?? "") !== "burn") return;
    const gear = wetTurnout(context.actor);
    const line = gear ? (context.lines ?? []).find((l: any) => l?.itemId === gear.id) : null;
    if (!line) return;
    line.dr = (Number(line.dr) || 0) + WET_TURNOUT.dr;
    line.reason = [line.reason, F("TurnoutWetDr", { dr: WET_TURNOUT.dr })].filter(Boolean).join("; ");
  });
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const damage = context?.damage;
    if (!on.suits() || !damage || String(damage.type ?? "") !== "burn") return;
    const gear = wetTurnout(context.actor);
    if (!gear) return;
    damage.vulnerabilities = [...(Array.isArray(damage.vulnerabilities) ? damage.vulnerabilities : []), { form: "burn", multiplier: WET_TURNOUT.multiplier, label: F("TurnoutSteam", { name: gear.name }) }];
  });

  // ── what the gear is, in trait terms (pp. 72-76) ──
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!anyOn() || !context?.actor || !context.effects) return;
    const wornItems = [...(context.actor.items ?? [])].filter((i: any) => worn(i) && ours(i));
    const names = wornItems.map(nameOf);
    let pf = 1;
    let pfLabel = "";
    for (const item of wornItems) {
      // A wet NBC suit, or one worn past 72 hours, no longer seals (p. 75).
      if (on.suits() && isNbcSuit(nameOf(item)) && !nbcSealHolds(item)) continue;
      const protection = breathingProtection(nameOf(item), tlOf(item), names, ruleOn);
      if (!protection) continue;
      addProtection(context, protection, nameOf(item));
      if ((protection.radiationPf ?? 0) > pf) { pf = protection.radiationPf!; pfLabel = nameOf(item); }
    }
    // A PF divides the dose before the body's own tolerance does (Campaigns p. 436).
    if (pf > 1) {
      context.effects.radiationTolerance = Math.max(1, Number(context.effects.radiationTolerance) || 1) * pf;
      context.sources.push({ effect: "radiationTolerance", label: pfLabel, value: pf });
    }
    // Doesn't Breathe while the tank, rebreather or pack holds out (pp. 73-76).
    const supply = airSupply(context.actor, on);
    if (supply && !context.effects.doesntBreathe) {
      context.effects.doesntBreathe = true;
      context.sources.push({ effect: "doesntBreathe", label: nameOf(supply) });
    }
  });

  // ── the air (p. 74) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-breathe",
    itemTypes: ["equipment", "armor"],
    label: L("Breathe"),
    icon: "fa-solid fa-lungs",
    visible: (item) => ours(item) && supplyMinutes(nameOf(item), tlOf(item)) !== null && supplyRuleOn(item),
    run: async (item, actor) => {
      if (!item?.isOwner) return;
      const state = airState(item);
      const answer: any = await foundry.applications.api.DialogV2.prompt({
        window: { title: L("Breathe") },
        content: `<div class="gworld" style="display:grid;gap:6px">`
          + `<label>${esc(L("BreatheMinutes"))} <input type="number" name="minutes" value="10" min="0" step="1"></label>`
          + `<label>${esc(L("DepthFeet"))} <input type="number" name="depth" value="${state.depthFeet}" min="0" step="1"></label></div>`,
        ok: {
          label: L("Breathe"),
          callback: (_event: Event, button: HTMLElement) => {
            const form = button.closest(".application");
            return { minutes: Number(form?.querySelector<HTMLInputElement>("[name=minutes]")?.value) || 0, depth: Number(form?.querySelector<HTMLInputElement>("[name=depth]")?.value) || 0 };
          },
        },
        rejectClose: false,
      });
      if (!answer) return;
      const depthFeet = Math.max(0, answer.depth);
      const used = state.used + airUsedBreathing(answer.minutes, depthFeet);
      await item.setFlag(MODULE_ID, AIR_FLAG, { ...(item.getFlag?.(MODULE_ID, AIR_FLAG) ?? {}), used });
      await setDepth(item, depthFeet);
      const left = minutesLeft(item) ?? 0;
      await say(actor, nameOf(item), [F("Breathed", { minutes: answer.minutes, feet: depthFeet, left: round(left) }), ...(left <= 0 ? [L("Empty")] : [])]);
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-refill",
    itemTypes: ["equipment", "armor"],
    label: L("Refill"),
    icon: "fa-solid fa-rotate-left",
    visible: (item) => ours(item) && supplyMinutes(nameOf(item), tlOf(item)) !== null && supplyRuleOn(item) && airState(item).used > 0,
    run: async (item, actor) => {
      if (!item?.isOwner) return;
      await item.setFlag(MODULE_ID, AIR_FLAG, { ...airState(item), used: 0 });
      await say(actor, nameOf(item), [L("Refilled")]);
    },
  });

  Hooks.on(api.combat.hooks.fatigueCost, (context: any) => {
    const actor = context?.actor;
    if (!actor || !anyOn()) return;
    // "Incredibly hot": the biohazard suit triples the FP of effort and weather (p. 74).
    if (on.suits() && HOT_SUIT_REASONS.has(String(context.reason ?? "")) && (Number(context.fp) || 0) > 0) {
      const suit = [...(actor.items ?? [])].find((i: any) => worn(i) && ours(i) && isBiohazardSuit(nameOf(i)));
      if (suit) {
        context.fp = hotSuitFp(Number(context.fp) || 0);
        context.sources?.push?.(F("HotSuitSource", { name: nameOf(suit) }));
      }
    }
    // Every FP spent costs a minute of the air breathed (p. 74).
    const fp = Math.max(0, Math.round(Number(context.fp) || 0));
    if (on.breathing() && fp > 0) {
      const supply = airSupply(actor, on);
      if (supply) void spendAir(supply, fp * AIR_LOST.perFp);
    }
  });

  // And so does every failed Fright Check (p. 74).
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!on.breathing() || !(context?.tags ?? []).includes("fright") || context?.outcome?.success !== false) return;
    const supply = airSupply(context.actor, on);
    if (supply) void spendAir(supply, AIR_LOST.perFailedFright);
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.suits() || !context?.actor) return;
    const tags: string[] = context.tags ?? [];
    // The clean suit against a disease-ridden victim (p. 75 note 3).
    if (tags.includes("contagion")) {
      const suit = [...(context.actor.items ?? [])].find((i: any) => worn(i) && ours(i) && isCleanSuit(nameOf(i)));
      if (suit) context.modifiers.push({ label: nameOf(suit), value: CLEAN_SUIT_CONTAGION });
    }
    // The anti-G suit against high acceleration (p. 74; Campaigns p. 434).
    if (tags.includes("acceleration")) {
      const suit = [...(context.actor.items ?? [])].find((i: any) => worn(i) && ours(i) && ANTI_G.test(breathingName(i)));
      if (suit) context.modifiers.push({ label: nameOf(suit), value: ANTI_G_BONUS });
    }
  });

  // High acceleration (Campaigns p. 434), which the system has the rule for
  // but rolls nowhere: the HT roll, from the anti-G suit's row (p. 74).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-acceleration",
    itemTypes: ["armor", "equipment"],
    label: L("AccelerationAction"),
    icon: "fa-solid fa-jet-fighter",
    visible: (item) => on.suits() && ours(item) && ANTI_G.test(breathingName(item)),
    run: (_item, actor) => { void accelerationRoll(api, actor); },
  });

  // A NBC suit's 72 hours run from when it is first put on (p. 75).
  Hooks.on("updateItem", (item: any, changes: any, _options: any, userId: string) => {
    if (userId !== (game as any).user?.id || !on.suits() || changes?.system?.equipped !== true || !ours(item) || !isNbcSuit(nameOf(item))) return;
    if (typeof item.flags?.[MODULE_ID]?.[NBC_FLAG] !== "number" && item.isOwner) void item.setFlag(MODULE_ID, NBC_FLAG, worldNow());
  });

  // The bends, for a diver back at the surface from below 30' on pure oxygen (p. 76; Campaigns p. 435).
  api.chat.registerChatCard({
    module: MODULE_ID,
    key: BENDS_CARD,
    template: `modules/${MODULE_ID}/templates/ht-bends-card.hbs`,
    actions: {
      roll: async ({ message, data, actor }: any) => {
        if (!on.breathing() || data?.result || !actor) return;
        const outcome: any = await api.roll.success({ actor, base: Number(api.actors.attribute(actor, "HT")) || 10, label: L("BendsRoll"), skill: "HT", kind: "attribute", tags: ["bends", "HT"] } as any);
        if (!outcome || "refused" in outcome) return;
        const result = api.rules.bendsOutcome({ success: outcome.success === true, criticalSuccess: outcome.criticalSuccess === true, criticalFailure: outcome.criticalFailure === true });
        if (result === "agony") await api.actors.applyCondition(actor, { key: "agony" } as any);
        if (result === "collapse") await api.actors.applyCondition(actor, { key: "unconscious" } as any);
        await api.chat.update(message, { ...data, result: F(`Bends.${result}`, { name: String(actor.name ?? "") }) });
      },
    },
  } as any);
  bendsCard = async (actor, source) => {
    await api.chat.post(`${MODULE_ID}.${BENDS_CARD}`, { title: source, text: F("BendsCard", { name: String(actor?.name ?? ""), feet: OXYGEN_DEPTH_FEET }), result: "" }, { actor } as any);
  };

  // Scuba (Closed-Circuit), the GM's optional specialty for rebreathers:
  // Scuba-4, and Scuba from it at -2 (p. 76).
  Hooks.on(api.data.hooks.skillLevels, (context: any) => {
    if (!on.breathing() || !Array.isArray(context?.skills)) return;
    const skills: any[] = context.skills;
    const closed = skills.find((s) => CLOSED_CIRCUIT.test(String(s?.name ?? "")));
    const open = skills.find((s) => OPEN_CIRCUIT.test(String(s?.name ?? "")));
    if (!closed || !open) return;
    // Both levels as the system worked them out, so one default doesn't feed the other.
    const known = { closed: typeof closed.level === "number" ? closed.level : null, open: typeof open.level === "number" ? open.level : null };
    const attributes = context.attributes ?? {};
    const table = api.rules as unknown as CostTable;
    for (const [entry, closedCircuit, other] of [[closed, true, known.open], [open, false, known.closed]] as const) {
      const level = scubaDefault(closedCircuit, other);
      if (level === null) continue;
      const system = entry.item?.system ?? {};
      const derived = system.derived ?? {};
      const changed = defaultedLevel({
        level: typeof entry.level === "number" ? entry.level : null,
        fromDefault: Boolean(entry.fromDefault),
        points: Number(system.points) || 0,
        relativeLevel: typeof derived.relativeLevel === "number" ? derived.relativeLevel : null,
        defaultCredit: Number(derived.defaultCredit) || 0,
        attribute: Number(attributes[String(system.attribute ?? "DX")]) || 10,
        difficulty: String(system.difficulty ?? "A"),
      }, level, table);
      const modifier = closedCircuit ? CLOSED_CIRCUIT_DEFAULTS.fromScuba : CLOSED_CIRCUIT_DEFAULTS.toScuba;
      if (changed) Object.assign(entry, { ...changed, note: F(closedCircuit ? "ClosedFromScuba" : "ScubaFromClosed", { modifier }), source: MODULE_ID });
    }
  });

  // Biomedical sensors on the patient: +1 to Diagnosis (p. 75), counted once with Ultra-Tech's.
  BIOMEDICAL_TABLES.register({
    book: "high-tech",
    tls: { min: 0, max: 8 },
    on: on.suits,
    applies: (item) => hasBiomedicalSensors(nameOf(item)),
    label: (item) => F("BiomedicalModifier", { item: nameOf(item) }),
  });
  readyBiomedical(api);
}
