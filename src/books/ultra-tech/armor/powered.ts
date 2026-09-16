/**
 * GURPS Ultra-Tech's powered suits, registered with the system through the
 * add-on API (pp. 181-186, and the gravpack on p. 75).
 *
 *   - **init:** a suit's state on armour and equipment: switched on, fitted,
 *     its augmentation, and a pack's weightless load.
 *   - **ready:** Lifting and Striking ST, Arm ST, Super Jump, Basic Move and
 *     Enhanced Move while a worn suit is powered, through `gworld.traitEffects`;
 *     the suit's weight, and a pack's load, left out of encumbrance through
 *     `gworld.carriedWeight`; DX-based skills held to Battlesuit skill, less an
 *     unfitted suit's penalty, through `gworld.skillLevels`, and DX rolls through
 *     `gworld.successRollModifiers`; an exofield belt's DR gone without power;
 *     an item sheet section for all of it, and row actions to suit up and to
 *     refit a suit.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { powerData } from "../power/data.js";
import { enduranceLeft } from "../power/index.js";
import {
  GRAVPACK,
  REFIT,
  SUIT_UP,
  battlesuitLevel,
  carryWeightless,
  checkoutSeconds,
  gravpackPenalty,
  isGravpack,
  limitedLevel,
  poweredSuit,
  suitEffects,
  suitLimitsDx,
  suitWeightCounts,
  unfittedPenalty,
  type PoweredSuit,
  type SuitState,
} from "./suits.js";

const L = (key: string) => game.i18n.localize(`GCC.UT.Suits.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.UT.Suits.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "utSuit";

/** Registers the suit fields. */
export function initPoweredSuits(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      on: new f.BooleanField({ initial: true }),
      fitted: new f.BooleanField({ initial: true }),
      augmentation: new f.BooleanField({ initial: true }),
      load: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      accustomed: new f.BooleanField({ initial: false }),
    }),
  });
}

interface SuitFields { on: boolean; fitted: boolean; augmentation: boolean; load: number; accustomed: boolean }

function fieldsOf(item: any): SuitFields {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    on: d.on !== false,
    fitted: d.fitted !== false,
    augmentation: d.augmentation !== false,
    load: Math.max(0, Number(d.load) || 0),
    accustomed: d.accustomed === true,
  };
}

const itemTl = (item: any) => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const isGear = (item: any) => item?.type === "armor" || item?.type === "equipment";
const worn = (item: any) => isGear(item) && item.system?.equipped === true;

/** Whether a suit has run out of the power its cells give. */
function outOfPower(item: any): boolean {
  const left = enduranceLeft(powerData(item));
  return Boolean(left && left !== "unlimited" && left.left <= 0);
}

/** A suit's statistics and state, or null for anything that isn't one. */
function suitOf(item: any): { suit: PoweredSuit; state: SuitState; fields: SuitFields; tl: number } | null {
  if (!isGear(item)) return null;
  const tl = itemTl(item);
  const suit = poweredSuit(String(item.name ?? ""), tl);
  if (!suit) return null;
  const fields = fieldsOf(item);
  return { suit, fields, tl, state: { powered: fields.on && !outOfPower(item), augmentation: fields.augmentation, fitted: fields.fitted } };
}

/** The worn suits and packs on a character. */
function wornSuits(actor: any) {
  return [...(actor?.items ?? [])].filter(worn).map((item: any) => ({ item, found: suitOf(item) })).filter((s) => s.found) as Array<{ item: any; found: NonNullable<ReturnType<typeof suitOf>> }>;
}

/** The worn gravpack or powered lower-body exoskeleton's weightless load, and its DX penalty. */
function weightlessLoads(actor: any): Array<{ item: any; lbs: number; penalty: number }> {
  const loads: Array<{ item: any; lbs: number; penalty: number }> = [];
  for (const item of [...(actor?.items ?? [])].filter(worn)) {
    const fields = fieldsOf(item);
    if (isGravpack(String(item.name)) && fields.on && !outOfPower(item)) {
      const lbs = Math.min(GRAVPACK.maxLbs, fields.load);
      loads.push({ item, lbs, penalty: gravpackPenalty(lbs, fields.accustomed) });
      continue;
    }
    const found = suitOf(item);
    if (found?.suit.payloadLbs && found.state.powered) loads.push({ item, lbs: Math.min(found.suit.payloadLbs, fields.load), penalty: 0 });
  }
  return loads;
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

/** The actor's Battlesuit skill as a suit reads it. */
function suitSkill(api: GWorldApi, actor: any, suit: PoweredSuit, levelOf?: (name: string) => number | null, dx?: number): number {
  const read = (name: string) => (levelOf ? levelOf(name) : api.actors.skillLevel(actor, name));
  return battlesuitLevel({
    battlesuit: read("Battlesuit"),
    vaccSuit: read("Vacc Suit"),
    nbcSuit: read("NBC Suit"),
    dx: dx ?? api.actors.attribute(actor, "DX") ?? 10,
  }, suit.skillBonus ?? 0);
}

// ── the sheet ────────────────────────────────────────────────────────────────

function itemContext(item: any): Record<string, unknown> {
  const found = suitOf(item);
  const fields = fieldsOf(item);
  const lines: string[] = [];
  const gravpack = isGravpack(String(item?.name ?? ""));
  if (found) {
    const { suit, state, tl } = found;
    const gains: string[] = [];
    if (suit.liftingSt) gains.push(F("Gain.liftingSt", { value: suit.liftingSt }));
    if (suit.strikingSt) gains.push(F("Gain.strikingSt", { value: suit.strikingSt }));
    if (suit.armSt) gains.push(F("Gain.armSt", { value: suit.armSt }));
    if (suit.superJump) gains.push(F("Gain.superJump", { value: suit.superJump }));
    if (suit.basicMove) gains.push(F("Gain.basicMove", { value: suit.basicMove }));
    if (suit.enhancedMove) gains.push(F("Gain.enhancedMove", { value: suit.enhancedMove }));
    if (gains.length) lines.push(F("Gains", { list: gains.join(", ") }));
    lines.push(L(`Scope.${suit.scope}`));
    if (suit.skillBonus) lines.push(F("SkillBonus", { value: suit.skillBonus }));
    lines.push(L(suit.carriesItself ? (suit.carriesItselfUnaugmented ? "WeightAlways" : "WeightPowered") : "WeightCounts"));
    if (suit.payloadLbs) lines.push(F("Payload", { lbs: suit.payloadLbs }));
    if (suit.fitted && tl < 11) lines.push(L("Fitting"));
    else if (suit.fitted) lines.push(L("Nanogel"));
    lines.push(F("Checkout", { stepIn: SUIT_UP.stepIn, helmet: SUIT_UP.helmet, seconds: suit.donSeconds ?? SUIT_UP.checkout }));
    for (const note of suit.notes ?? []) lines.push(L(`Note.${note}`));
    if (!state.powered) lines.push(L(suit.paralysedUnpowered ? "Unpowered.paralysed" : suit.nothingUnpowered ? "Unpowered.nothing" : "Unpowered.carry"));
  }
  if (gravpack) lines.push(F("Gravpack", { max: GRAVPACK.maxLbs, per: GRAVPACK.lbsPerDx }));
  return {
    lines,
    fields,
    fitting: Boolean(found?.suit.fitted && found.tl < 11),
    switchable: Boolean(found?.suit.switchable),
    load: gravpack || Boolean(found?.suit.payloadLbs),
    gravpack,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ut-suit]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccUtSuit);
      if (input.type === "checkbox") {
        await item.update({ [`${path}.${field}`]: input.checked });
        if (field === "on" && !input.checked && item.actor && worn(item)) await announceUnpowered(item);
      } else {
        await item.update({ [`${path}.${field}`]: Math.max(0, Number(input.value) || 0) });
      }
    });
  });
}

/** What losing power does to the wearer (pp. 181-182). */
async function announceUnpowered(item: any): Promise<void> {
  const found = suitOf(item);
  if (!found) return;
  const key = found.suit.paralysedUnpowered ? "Unpowered.paralysed" : found.suit.nothingUnpowered ? "Unpowered.nothing" : "Unpowered.carry";
  await say(item.actor, String(item.name), [F("PoweredDown", { name: item.actor.name }), L(key)]);
}

// ── actions ─────────────────────────────────────────────────────────────────

/** Getting into a suit and checking it out: a Battlesuit roll halves the time (p. 182). */
async function suitUp(api: GWorldApi, item: any, actor: any): Promise<void> {
  const found = suitOf(item);
  if (!found || !actor?.isOwner) return;
  const base = suitSkill(api, actor, found.suit);
  const result: any = await api.roll.success({ actor, base, skill: "Battlesuit", label: F("CheckoutLabel", { item: item.name }), modifiers: [] } as any);
  if (!result) return;
  await say(actor, String(item.name), [F(result.success ? "CheckoutFast" : "CheckoutSlow", { seconds: checkoutSeconds(found.suit, result.success) })]);
}

/** Refitting a suit to its wearer: two hours and an Armoury (Body Armor)+2 roll (p. 182). */
async function refit(api: GWorldApi, item: any, actor: any): Promise<void> {
  const found = suitOf(item);
  if (!found || !actor?.isOwner) return;
  const level = api.actors.skillLevel(actor, REFIT.skill);
  const base = level ?? (api.actors.attribute(actor, "IQ") ?? 10) - 5;
  const result: any = await api.roll.success({ actor, base, skill: REFIT.skill, label: F("RefitLabel", { item: item.name }), modifiers: [{ label: L("RefitBonus"), value: REFIT.modifier }] } as any);
  if (!result) return;
  if (result.success) await item.update({ [`system.extensions.${MODULE_ID}.${FIELD}.fitted`]: true });
  const key = result.success ? "RefitDone" : result.criticalFailure ? "RefitBroken" : "RefitAgain";
  await say(actor, String(item.name), [F(key, { hours: REFIT.hours })]);
}

// ── ready ────────────────────────────────────────────────────────────────────

export function readyPoweredSuits(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ut-suit-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ut-suit-item.hbs`,
    visible: (item) => on() && (Boolean(suitOf(item)) || isGravpack(String(item?.name ?? ""))),
    context: (item) => itemContext(item),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-suit-up",
    itemTypes: ["armor", "equipment"],
    label: L("CheckoutTitle"),
    icon: "fa-solid fa-user-astronaut",
    visible: (item) => on() && Boolean(suitOf(item)),
    run: (item, actor) => suitUp(api, item, actor),
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ut-suit-refit",
    itemTypes: ["armor", "equipment"],
    label: L("RefitTitle"),
    icon: "fa-solid fa-ruler-combined",
    visible: (item) => {
      if (!on()) return false;
      const found = suitOf(item);
      return Boolean(found && unfittedPenalty(found.suit, found.tl, false) < 0 && !found.fields.fitted);
    },
    run: (item, actor) => refit(api, item, actor),
  });

  // What a powered suit adds to its wearer (pp. 181-185).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!on() || !context?.actor || !context.effects) return;
    const effects = context.effects;
    for (const { item, found } of wornSuits(context.actor)) {
      const gains = suitEffects(found.suit, found.state);
      if (!gains) continue;
      const label = String(item.name);
      const add = (key: "liftingSt" | "strikingSt" | "armSt", value: number) => {
        if (!value) return;
        effects[key] = (Number(effects[key]) || 0) + value;
        context.sources.push({ effect: key, label, value });
      };
      add("liftingSt", gains.liftingSt);
      add("strikingSt", gains.strikingSt);
      add("armSt", gains.armSt);
      if (gains.superJump > (Number(effects.superJump) || 0)) {
        effects.superJump = gains.superJump;
        context.sources.push({ effect: "superJump", label, value: gains.superJump });
      }
      if (gains.basicMove && effects.secondary) {
        effects.secondary.basicMove = (Number(effects.secondary.basicMove) || 0) + gains.basicMove;
        context.sources.push({ effect: "secondary.basicMove", label, value: gains.basicMove });
      }
      const multiplier = 2 ** gains.enhancedMove;
      if (gains.enhancedMove && multiplier > (Number(effects.enhancedMove) || 1)) {
        effects.enhancedMove = multiplier;
        context.sources.push({ effect: "enhancedMove", label, value: gains.enhancedMove });
      }
    }
  });

  // The suit carries its own weight, and a pack its load (pp. 75, 181-185).
  Hooks.on("gworld.carriedWeight", (context: any) => {
    if (!on() || !context?.actor || !Array.isArray(context.lines)) return;
    for (const line of context.lines) {
      const found = worn(line.item) ? suitOf(line.item) : null;
      if (found && !suitWeightCounts(found.suit, found.state)) {
        line.counts = false;
        line.reason = L("WeightReason");
      }
    }
    for (const load of weightlessLoads(context.actor)) {
      if (load.lbs <= 0) continue;
      // What the pack holds: the carried gear not worn, heaviest first.
      const held = context.lines.filter((line: any) => line.counts !== false && line.item !== load.item && line.item?.system?.equipped !== true);
      const left = carryWeightless(held.map((line: any) => Number(line.weight) || 0), load.lbs);
      held.forEach((line: any, i: number) => {
        if (left[i]! < line.weight) {
          line.weight = left[i];
          line.reason = F("LoadReason", { item: load.item.name });
        }
      });
    }
  });

  // DX-based skills held to Battlesuit skill, less an unfitted suit's penalty and a pack's mass (p. 75; Characters p. 192).
  Hooks.on("gworld.skillLevels", (context: any) => {
    if (!on() || !context?.actor || !Array.isArray(context.skills)) return;
    // The character's derived data isn't written yet here: DX comes with the hook (API 1.58.0).
    const limits = dxLimits(api, context.actor, context.levelOf, Number(context.attributes?.DX) || undefined);
    if (!limits) return;
    for (const entry of context.skills) {
      if (entry?.item?.system?.attribute !== "DX" || typeof entry.level !== "number") continue;
      const level = limitedLevel(entry.level, limits.cap ?? Infinity, limits.penalty);
      if (level < entry.level) {
        entry.level = level;
        entry.note = limits.note;
        entry.source = MODULE_ID;
      }
    }
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || context?.kind !== "attribute" || !(context.tags ?? []).includes("DX") || !context.actor) return;
    const limits = dxLimits(api, context.actor);
    if (!limits) return;
    const dx = Number(context.base) || 0;
    const value = Math.min(0, (limits.cap ?? dx) - dx) + limits.penalty;
    if (value) context.modifiers.push({ label: limits.note, value });
  });

  // An exofield belt gives no DR without power (p. 181).
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on() || !context?.actor) return;
    for (const line of context.lines ?? []) {
      const found = suitOf(line.itemId ? context.actor.items?.get?.(line.itemId) : null);
      if (found?.suit.nothingUnpowered && !found.state.powered) {
        line.applies = false;
        line.reason = L("Unpowered.nothing");
      }
    }
  });
}

/** The cap Battlesuit skill puts on DX-based rolls, and the penalties besides, for a character in a suit. */
function dxLimits(api: GWorldApi, actor: any, levelOf?: (name: string) => number | null, dx?: number): { cap: number | null; penalty: number; note: string } | null {
  let cap: number | null = null;
  let penalty = 0;
  const names: string[] = [];
  for (const { item, found } of wornSuits(actor)) {
    if (suitLimitsDx(found.suit, found.state)) {
      const level = suitSkill(api, actor, found.suit, levelOf, dx);
      cap = cap === null ? level : Math.min(cap, level);
      names.push(String(item.name));
    }
    const unfitted = unfittedPenalty(found.suit, found.tl, found.fields.fitted);
    if (unfitted) { penalty += unfitted; names.push(F("Unfitted", { item: item.name })); }
  }
  for (const load of weightlessLoads(actor)) {
    if (load.penalty) { penalty += load.penalty; names.push(F("LoadPenalty", { item: load.item.name })); }
  }
  if (cap === null && !penalty) return null;
  return { cap, penalty, note: F("DxNote", { list: names.join(", ") }) };
}
