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
 *     tank's air by TL, divided by the depth, a minute less for every FP spent
 *     (`gworld.fatigueCost`) and every failed Fright Check
 *     (`gworld.afterSuccessRoll`), and row actions to breathe from it and to
 *     refill it; a gas mask keeping tear gas out of the eyes and nose; and the
 *     sheet's notes: don times, muffled speech, the TL6 hose, bubbles.
 *   - **Environment suits (environmentSuits):** biohazard and NBC suits sealed
 *     with an air mask under them, the TL8 biohazard lining's PF 2.5, and the
 *     biohazard suit tripling the FP of effort and weather; the clean suit's
 *     +4 HT against contagion; the Apollo suits sealed with their helmets,
 *     breathing from a tank or the EVA suit's seven-hour pack, the EVA suit's
 *     climate control, the helmets' senses; biomedical sensors on the patient
 *     as +1 to Diagnosis; and the sheet's notes for the rest.
 *
 * The Environment Suit skill that limits DX while a suit is worn is the
 * record's `environmentSuit`, which the system reads.
 */

import { bookOf } from "../../../shared/book-tables.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { BIOMEDICAL, BIOMEDICAL_TABLES, addProtection, protectionText, readyBiomedical } from "../../../shared/protective-gear/index.js";
import {
  AIR_LOST,
  ANTI_G_BONUS,
  CLEAN_SUIT_CONTAGION,
  GAS_MASK_FILTER,
  GAS_MASK_HOSE,
  HOT_SUIT_REASONS,
  NBC_SEAL_HOURS,
  OXYGEN_DEPTH_FEET,
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
  isRebreather,
  isTankFed,
  mufflesSpeech,
  pressureAtDepth,
  supplyMinutes,
  type BreathingRule,
} from "./rules.js";

const NS = "GCC.HT.Breathing";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Item flag: the textbook minutes of a supply used, and the depth it is breathed at. */
const AIR_FLAG = "htAir";

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

export function airState(item: any): AirState {
  const stored = item?.getFlag?.(MODULE_ID, AIR_FLAG) ?? item?.flags?.[MODULE_ID]?.[AIR_FLAG] ?? {};
  return { used: Math.max(0, Number(stored.used) || 0), depthFeet: Math.max(0, Number(stored.depthFeet) || 0) };
}

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
    if (/^nbc suit$/i.test(base)) lines.push(F("NbcSeal", { hours: NBC_SEAL_HOURS }));
    if (isCleanSuit(name)) lines.push(F("CleanSuit", { bonus: CLEAN_SUIT_CONTAGION }));
    if (/^anti-g suit$/i.test(base)) lines.push(F("AntiG", { bonus: ANTI_G_BONUS }));
    if (/^dry suit$/i.test(base)) lines.push(L("DrySuit"));
    if (/^wetsuit$/i.test(base)) lines.push(L("Wetsuit"));
    if (/^turnout gear$/i.test(base)) lines.push(F("Turnout", { dr: WET_TURNOUT.dr, times: WET_TURNOUT.multiplier }));
    if (/^bomb disposal suit$/i.test(base)) lines.push(L("BombSuit"));
    if (hasBiomedicalSensors(name)) lines.push(F("Biomedical", { bonus: BIOMEDICAL.inPerson, remote: BIOMEDICAL.remote }));
  }
  return lines;
}

function itemContext(item: any, on: BreathingSwitches): Record<string, unknown> {
  const minutes = supplyMinutes(nameOf(item), tlOf(item));
  const supply = ours(item) && minutes !== null && (/^space suit, eva$/i.test(breathingName(item)) ? on.suits() : on.breathing());
  return { lines: breathingLines(item, on), supply, depthFeet: airState(item).depthFeet, editable: item?.isOwner === true };
}

function itemListeners(element: HTMLElement, item: any): void {
  element.querySelector<HTMLInputElement>("[data-gcc-ht-dive-depth]")?.addEventListener("change", async (event) => {
    const feet = Math.max(0, Number((event.currentTarget as HTMLInputElement).value) || 0);
    await item.setFlag(MODULE_ID, AIR_FLAG, { ...airState(item), depthFeet: feet });
  });
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

  // ── what the gear is, in trait terms (pp. 72-76) ──
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!anyOn() || !context?.actor || !context.effects) return;
    const wornItems = [...(context.actor.items ?? [])].filter((i: any) => worn(i) && ours(i));
    const names = wornItems.map(nameOf);
    let pf = 1;
    let pfLabel = "";
    for (const item of wornItems) {
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
      await item.setFlag(MODULE_ID, AIR_FLAG, { used, depthFeet });
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
