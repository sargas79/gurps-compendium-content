/**
 * High-Tech's armour and protective gear (pp. 64-69), registered with the
 * system through the add-on API under three switches. The rules are in
 * `rules.ts`; what a piece does comes from this module's `htArmor` data on it,
 * which the records carry and the item sheet lets the table change.
 *
 *   - **Partial coverage (partialCoverage):** a piece that covers n in 6 of a
 *     location protects when 1d comes up n or less, the n of several pieces
 *     there added up; an attack option to strike around it at -(n-1) (never
 *     better than -1), which the blow then passes; a steel toe box's DR on 2
 *     in 6 foot hits; high boots with their tops turned up over 3 in 6 of the
 *     legs; and the better DR a piece gives some locations from the front (the
 *     TL7 fragmentation vest's vitals, the bomb disposal suit's torso); a
 *     one-sided piece worn at the back, as a trauma plate may be, meeting
 *     blows from behind in place of the front (p. 67); all through
 *     `gworld.armorDr` (p. 69; pp. 66-68, 75), none of them rolled for the
 *     sheet's figures; and shoulder pads' +1 to a slam's damage and DR 3
 *     against what the slammer takes back (p. 66 note 4).
 *   - **Concealing armour (concealedArmor):** a row action on a worn piece
 *     rolls a Quick Contest of Holdout, less the piece's DR (a third of it for
 *     flexible armour) and plus up to 4 for a concealable design, against the
 *     Search of each targeted searcher, at the range penalty; and a long coat's,
 *     poncho's or undercover clothing's bonus on a Holdout roll while worn, as
 *     the roll's clothing line (pp. 64, 66; Characters p. 200, API 1.152.0).
 *   - **Materials (armorMaterials):** steel, smart foam and titanium as a
 *     field that reprices a piece or a shield and changes its DR, and trauma
 *     plates as semi-ablative DR, worn down a point for every 10 points of
 *     basic damage and put right by replacing the plate (pp. 65, 67).
 */

import { bestConcealment, isHoldoutRoll, wearClothingLine } from "../../../shared/concealment/rules.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  DESIGN_MAX,
  MATERIALS,
  MATERIAL_EFFECTS,
  SLAM_PADS,
  TOE_BOX_SIXTHS,
  TOPS_UP,
  armorHoldoutPenalty,
  canTurnUpTops,
  clothingHoldout,
  clothingHoldoutBonus,
  combinedSixths,
  concealArmorModifier,
  frontDrAt,
  materialDr,
  materialPrice,
  partialStands,
  pieceDrAt,
  plateLoss,
  sideMeets,
  strikeAroundPenalty,
  type ArmorMaterial,
  type WornSide,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Armor.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Armor.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "htArmor";
/** A shield's material: shields have an extension of their own, apart from armour and equipment. */
const SHIELD_FIELD = "htMaterial";
/** Item flag: DR a semi-ablative plate has lost. */
const PLATE_FLAG = "htPlateLost";
/** Actor flag an older version kept for the attacker's strike around partial armour; cleared when met. */
const AROUND_FLAG = "htStrikeAround";
/** The attack option's key. */
export const STRIKE_AROUND_OPTION = "ht-strike-around";

export interface ArmorSwitches {
  partial: () => boolean;
  conceal: () => boolean;
  materials: () => boolean;
  /** Whether one-sided pieces are read by side: partial coverage with the system's frontArmor switch on (set when ready). */
  sided?: () => boolean;
}

/** What this module keeps on a piece. */
export interface HtArmorData {
  /** Sixths of each location the piece covers, 1-5; 0 for all of it. */
  coverage: number;
  /** A better DR against a blow from the front, at these locations; 0 for none. */
  frontDr: number;
  frontLocations: string[];
  /** A steel toe box's DR, where an attack on the foot hits the toe; 0 for none. */
  toeDr: number;
  /** A design made to be concealed: up to +4 toward the Holdout penalty. */
  concealment: number;
  material: ArmorMaterial;
  /** A ceramic trauma plate, semi-ablative at the GM's option. */
  semiAblative: boolean;
  /** High boots worn with the tops turned up. */
  topsUp: boolean;
  /** Worn to slam with: +1 to the slam's damage, DR 3 against what the slammer takes back (p. 66 note 4). */
  slamPads: boolean;
  /** A one-sided piece (the system's "F") worn at the back: it meets blows from behind (p. 67). */
  back: boolean;
}

/** Registers the fields this module keeps on armour and on shields. */
export function initHighTechArmor(): void {
  const f = foundry.data.fields as any;
  const int = (max?: number) => new f.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0, ...(max !== undefined ? { max } : {}) });
  const material = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...MATERIALS] });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      coverage: int(5),
      frontDr: int(),
      frontLocations: new f.ArrayField(new f.StringField({ required: true, nullable: false, blank: false }), { required: true, initial: [] }),
      toeDr: int(),
      concealment: int(DESIGN_MAX),
      material: material(),
      semiAblative: new f.BooleanField({ initial: false }),
      topsUp: new f.BooleanField({ initial: false }),
      slamPads: new f.BooleanField({ initial: false }),
      back: new f.BooleanField({ initial: false }),
    }),
  });
  addExtensionFields("Item", ["shield"], { [SHIELD_FIELD]: material() });
}

/** A piece's data, with nothing missing. A shield carries only its material. */
export function htArmorData(item: any): HtArmorData {
  const ext = item?.system?.extensions?.[MODULE_ID] ?? {};
  const d = ext[FIELD] ?? {};
  const whole = (v: unknown, max = Infinity) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const material = item?.type === "shield" ? ext[SHIELD_FIELD] : d.material;
  return {
    coverage: whole(d.coverage, 5),
    frontDr: whole(d.frontDr),
    frontLocations: Array.isArray(d.frontLocations) ? d.frontLocations.map(String) : [],
    toeDr: whole(d.toeDr),
    concealment: whole(d.concealment, DESIGN_MAX),
    material: MATERIALS.includes(material) ? material : "",
    semiAblative: d.semiAblative === true,
    topsUp: d.topsUp === true,
    slamPads: d.slamPads === true,
    back: d.back === true,
  };
}

const isArmor = (item: any) => item?.type === "armor";
const isWorn = (item: any) => isArmor(item) && item.system?.equipped === true;
/** The worn pads a character slams with (p. 66 note 4), or null. */
const slamPadsOn = (actor: any): any => [...(actor?.items ?? [])].find((i: any) => isWorn(i) && htArmorData(i).slamPads) ?? null;
const locationsOf = (item: any): string[] => item?.system?.locations ?? [];
/** Whether a piece covers a location by its own list (an empty list is the whole body). */
const covers = (item: any, location: string) => locationsOf(item).length === 0 || locationsOf(item).includes(location);
/** The side a one-sided piece is worn on, or null for a piece that armours all round. */
export function sideOf(item: any): WornSide | null {
  if (item?.system?.frontOnly !== true) return null;
  return htArmorData(item).back ? "back" : "front";
}
/** Whether one-sided pieces are read by side, and whether the table plays front-only armour: set when ready. */
let readsSides: () => boolean = () => false;
let frontArmorOn: () => boolean = () => false;

/**
 * The worn pieces at a location that a blow from `arc` met, less those a
 * listener refused: a piece at the front alone isn't struck from behind
 * (Characters p. 282), and one worn at the back only from behind (p. 67).
 */
export function piecesMet(actor: any, location: string, arc: string | null, refused: readonly string[]): any[] {
  return [...(actor?.items ?? [])].filter((item: any) => {
    if (!isWorn(item) || !covers(item, location) || refused.includes(item.id)) return false;
    const side = sideOf(item);
    return !(side === "back" && readsSides() ? arc !== "back" : side !== null && arc && arc !== "front" && frontArmorOn());
  });
}

/** The DR of the rigid armour a blow met at a location: the worn pieces that aren't flexible, added up. */
export function rigidDrMet(actor: any, location: string, arc: string | null, refused: readonly string[], damageType: string): number {
  return piecesMet(actor, location, arc, refused)
    .filter((item) => item.system?.flexible !== true)
    .reduce((sum, item) => sum + pieceDrAt(item.system ?? {}, damageType, location), 0);
}
const plateLost = (item: any): number => Math.max(0, Math.floor(Number(item?.getFlag?.(MODULE_ID, PLATE_FLAG) ?? item?.flags?.[MODULE_ID]?.[PLATE_FLAG]) || 0));
const d6 = () => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>`
      + lines.map((line) => `<div class="gc-result">${esc(line)}</div>`).join("") + `</div>`,
  });
}

// ── partial coverage ─────────────────────────────────────────────────────────

/** The worn pieces covering part of a location, and the sixths each covers. */
export function partialPiecesAt(actor: any, location: string): Array<{ item: any; sixths: number; topsUp: boolean }> {
  const out: Array<{ item: any; sixths: number; topsUp: boolean }> = [];
  for (const item of actor?.items ?? []) {
    if (!isWorn(item)) continue;
    const data = htArmorData(item);
    if (data.coverage && covers(item, location)) out.push({ item, sixths: data.coverage, topsUp: false });
    else if (location === TOPS_UP.location && data.topsUp && canTurnUpTops(item.name) && !covers(item, location)) out.push({ item, sixths: TOPS_UP.sixths, topsUp: true });
  }
  return out;
}

/** The sixths of a location a character's partial armour covers, added up; 0 for none. */
export function sixthsAt(actor: any, location: string): number {
  return combinedSixths(partialPiecesAt(actor, location).map((p) => p.sixths));
}

/**
 * Whether the blow struck around partial armour: the attack chose the option
 * and was aimed at the location it landed on. The blow carries its attack
 * options and called shot to `gworld.armorDr` (API 1.108.0).
 */
function struckAround(context: any, location: string): boolean {
  if (context.options?.[`${MODULE_ID}.${STRIKE_AROUND_OPTION}`] !== true) return false;
  return String(context.calledShot?.hitLocation ?? "") === location;
}

/** The line a piece's own DR makes where the piece isn't listed: high boots' tops over the leg. */
function topsUpLine(item: any, damageType: string, on: ArmorSwitches): any {
  const data = htArmorData(item);
  const dr = Math.max(0, Math.floor(Number(item.system?.dr) || 0));
  return {
    label: F("TopsUpLabel", { name: item.name }),
    dr: on.materials() ? materialDr(dr, data.material, damageType) : dr,
    applies: true,
    forceField: false,
    flexible: item.system?.flexible === true,
    hardened: Math.max(0, Math.floor(Number(item.system?.hardened) || 0)),
    itemId: item.id,
    source: "armor",
  };
}

// ── concealing armour ────────────────────────────────────────────────────────

/** The DR a piece shows against most attacks, in its material: what Holdout is penalised by. */
function concealedDr(item: any, on: ArmorSwitches): number {
  const data = htArmorData(item);
  const dr = Math.max(0, Math.floor(Number(item?.system?.dr) || 0));
  return on.materials() ? materialDr(dr, data.material, "") : dr;
}

/** The best Holdout the character's worn clothes give, by High-Tech's reading (p. 64). */
export function clothingConcealment(actor: any): { holdout: number; source: string } {
  const best = bestConcealment(actor?.items ?? [], (item) => clothingHoldout(item?.name), (item) => (item?.type === "armor" || item?.type === "equipment") && item.system?.equipped === true && item.system?.carried !== false);
  return { holdout: best.holdout, source: best.source };
}

function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const from = a?.getActiveTokens?.()?.[0];
  const to = b?.getActiveTokens?.()?.[0];
  if (!from?.center || !to?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([from.center, to.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/**
 * Quick Contests of Holdout against the Search of each targeted searcher, to
 * keep a worn piece hidden (p. 66): each looks for himself, so the piece stays
 * hidden only from those it wins against.
 */
export async function concealFromSearch(api: GWorldApi, item: any, actor: any, on: ArmorSwitches): Promise<void> {
  if (!actor?.isOwner) return;
  const searchers = [...new Set([...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter((a: any) => a && a !== actor))];
  if (!searchers.length) return void ui.notifications?.warn(L("ConcealPick"));
  const data = htArmorData(item);
  const dr = concealedDr(item, on);
  const flexible = item.system?.flexible === true;
  const penalty = armorHoldoutPenalty(dr, flexible);
  const design = concealArmorModifier(dr, flexible, data.concealment) - penalty;
  const holdout = api.actors.skillLevel(actor, "Holdout");
  const hiding: Array<{ label: string; value: number }> = [];
  if (penalty) hiding.push({ label: F(flexible ? "ConcealFlexible" : "ConcealRigid", { dr }), value: penalty });
  if (design) hiding.push({ label: L("ConcealDesign"), value: design });
  // The clothes come in on the roll itself, as its clothing line (`gworld.successRollModifiers`).
  const outcomes: string[] = [];
  for (const searcher of searchers) {
    const search = api.actors.skillLevel(searcher, "Search");
    const yards = yardsBetween(actor, searcher);
    const range = yards !== null ? Number(api.rules.speedRangeModifier(yards)) || 0 : 0;
    const result: any = await api.roll.quickContest({
      label: F("ConcealLabel", { item: item.name }),
      first: { actor, base: holdout ?? (Number(api.actors.attribute(actor, "IQ")) || 10) - 5, modifiers: hiding, note: "Holdout" },
      second: { actor: searcher, base: search ?? (Number(api.actors.attribute(searcher, "Per")) || 10) - 5, modifiers: range ? [{ label: F("RangeLine", { yards: Math.round((yards ?? 0) * 10) / 10 }), value: range }] : [], note: "Search" },
      tags: ["holdout", "search", "concealArmor"],
    } as any);
    // A contest closed unrolled: the rest aren't asked either.
    if (!result) break;
    outcomes.push(F(result.outcome === "first" ? "ConcealHidden" : "ConcealSeen", { item: item.name, searcher: searcher.name }));
  }
  await say(actor, String(item.name), outcomes);
}

// ── the sheet ────────────────────────────────────────────────────────────────

function itemLines(item: any, on: ArmorSwitches): string[] {
  const lines: string[] = [];
  const data = htArmorData(item);
  if (isArmor(item) && on.partial()) {
    if (data.coverage) lines.push(F("CoverageItem", { n: data.coverage, penalty: strikeAroundPenalty(data.coverage) }));
    if (data.frontDr && data.frontLocations.length) lines.push(F("FrontItem", { dr: data.frontDr, locations: data.frontLocations.map((l) => game.i18n.localize(`GCC.HT.Armor.Location.${l}`)).join(", ") }));
    if (data.toeDr) lines.push(F("ToeItem", { dr: data.toeDr, n: TOE_BOX_SIXTHS }));
    if (data.topsUp && canTurnUpTops(item.name)) lines.push(F("TopsUpItem", { n: TOPS_UP.sixths }));
    if (on.sided?.() && sideOf(item) === "back") lines.push(L("BackItem"));
  }
  if (on.conceal()) {
    if (isArmor(item)) {
      const dr = concealedDr(item, on);
      const flexible = item.system?.flexible === true;
      lines.push(F("ConcealItem", { modifier: concealArmorModifier(dr, flexible, data.concealment), rule: L(flexible ? "ConcealFlexibleRule" : "ConcealRigidRule") }));
    }
    const clothes = clothingHoldoutBonus(item?.name);
    if (clothes) lines.push(F("ClothesItem", { bonus: clothes }));
  }
  if (on.materials() && (isArmor(item) || item?.type === "shield")) {
    if (data.material) lines.push(L(`MaterialItem.${data.material}`));
    if (isArmor(item) && data.semiAblative) lines.push(F("PlateItem", { lost: plateLost(item) }));
  }
  return lines;
}

function itemContext(item: any, on: ArmorSwitches): Record<string, unknown> {
  const data = htArmorData(item);
  const armor = isArmor(item);
  const shield = item?.type === "shield";
  return {
    lines: itemLines(item, on),
    editable: item?.isOwner === true,
    coverage: armor && on.partial()
      ? [0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n ? F("CoverageSixths", { n }) : L("CoverageWhole"), selected: data.coverage === n }))
      : null,
    topsUp: armor && on.partial() && canTurnUpTops(item?.name) ? { checked: data.topsUp } : null,
    back: armor && on.sided?.() && sideOf(item) !== null ? { checked: data.back } : null,
    concealment: armor && on.conceal()
      ? Array.from({ length: DESIGN_MAX + 1 }, (_, n) => ({ value: n, label: n ? `+${n}` : L("DesignNone"), selected: data.concealment === n }))
      : null,
    materials: (armor || shield) && on.materials()
      ? MATERIALS.map((value) => ({ value, label: L(value ? `Material.${value}` : "Material.none"), selected: data.material === value }))
      : null,
    materialPath: shield ? SHIELD_FIELD : `${FIELD}.material`,
    semiAblative: armor && on.materials() ? { checked: data.semiAblative } : null,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-armor]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtArmor);
      const value = input instanceof HTMLInputElement && input.type === "checkbox"
        ? input.checked
        : key === `${FIELD}.coverage` || key === `${FIELD}.concealment` ? Math.max(0, Math.floor(Number(input.value) || 0)) : input.value;
      await item.update({ [`${path}.${key}`]: value });
    });
  });
}

// ── ready ────────────────────────────────────────────────────────────────────

export function readyHighTechArmor(api: GWorldApi, switches: ArmorSwitches): void {
  // A piece's side counts only where the table plays front-only armour (the system's frontArmor switch).
  const on: ArmorSwitches = { ...switches, sided: () => switches.partial() && api.registry.isRuleOn("frontArmor") };
  readsSides = on.sided!;
  frontArmorOn = () => api.registry.isRuleOn("frontArmor");
  const anyOn = () => on.partial() || on.conceal() || on.materials();

  // A piece or shield remade in steel, smart foam or titanium (p. 65).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-armor-material",
    types: ["armor", "shield"],
    apply: (item, price) => {
      if (!on.materials()) return null;
      const material = htArmorData(item).material;
      const priced = materialPrice(price, material);
      return priced ? { ...priced, label: L(`Material.${material}`) } : null;
    },
  });

  // A steel shield's own DR doubled (p. 65).
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    if (!on.materials() || context?.item?.type !== "shield") return;
    const material = htArmorData(context.item).material;
    const factor = material ? MATERIAL_EFFECTS[material].drFactor : 1;
    if (factor === 1 || !(Number(context.dr) > 0)) return;
    context.dr = Number(context.dr) * factor;
    context.notes?.push?.(L(`Material.${material}`));
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-armor-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-armor-item.hbs`,
    visible: (item) => {
      if (!anyOn() || !["armor", "shield", "equipment"].includes(item?.type)) return false;
      const context = itemContext(item, on);
      return (context.lines as string[]).length > 0 || Boolean(context.coverage || context.back || context.concealment || context.materials);
    },
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-conceal-armor",
    itemTypes: ["armor"],
    label: L("ConcealTitle"),
    icon: "fa-solid fa-user-secret",
    visible: (item) => on.conceal() && isWorn(item) && !clothingHoldout(item?.name),
    run: (item, actor) => concealFromSearch(api, item, actor, on),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-replace-plate",
    itemTypes: ["armor"],
    label: L("PlateReplace"),
    icon: "fa-solid fa-shield-halved",
    visible: (item) => on.materials() && htArmorData(item).semiAblative && plateLost(item) > 0,
    run: async (item, actor) => {
      if (!item?.isOwner) return;
      await item.unsetFlag(MODULE_ID, PLATE_FLAG);
      await say(actor, String(item.name), [F("PlateReplaced", { item: item.name })]);
    },
  });

  // Striking around partial armour (p. 69): the option, and its penalty once the aim is known.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: STRIKE_AROUND_OPTION,
    label: L("StrikeAround"),
    available: () => on.partial(),
    apply: () => null,
  } as any);

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor || !Array.isArray(context.modifiers)) return;
    // The flag an older version kept; the blow now carries the option itself.
    if (actor.getFlag?.(MODULE_ID, AROUND_FLAG) && actor.isOwner) void actor.unsetFlag(MODULE_ID, AROUND_FLAG);
    const chosen = on.partial() && Boolean(context.options?.[`${MODULE_ID}.${STRIKE_AROUND_OPTION}`]);
    if (!chosen) return;
    const location = String(context.calledShot?.hitLocation ?? "torso");
    const target = (context.targets ?? []).find(Boolean);
    const sixths = target ? sixthsAt(target, location) : 0;
    const penalty = strikeAroundPenalty(sixths);
    if (penalty === null) context.modifiers.push({ label: F("StrikeAroundNothing", { location }), value: 0 });
    else context.modifiers.push({ label: F("StrikeAroundLine", { n: sixths }), value: penalty });
  });

  // Pads worn to slam with: +1 to the slammer's blow (p. 66 note 4; the slam's source, API 1.139.0).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!on.partial() || context?.source !== "slam" || !Array.isArray(context.modifiers)) return;
    const pads = slamPadsOn(context.actor);
    if (pads) context.modifiers.push({ label: F("SlamPadsDamage", { name: pads.name }), value: SLAM_PADS.damage });
  });

  // What each piece is worth against the blow.
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!(on.partial() || on.materials()) || !context?.actor || !Array.isArray(context.lines)) return;
    const actor = context.actor;
    const location = String(context.hitLocation ?? "");
    const damageType = String(context.damageType ?? "");
    const partial: Array<{ line: any; sixths: number }> = [];
    const note = (line: any, reason: string) => { line.reason = [line.reason, reason].filter(Boolean).join("; "); };
    // The sheet's figures (API 1.140.0): no blow, so nothing is rolled for it.
    const preview = context.preview === true;
    // What a slammer takes back, against pads worn to slam with (p. 66 note 4).
    const slammed = on.partial() && context.source === "slammed";
    const pads = slammed ? slamPadsOn(actor) : null;
    if (pads && !context.lines.some((l: any) => l.itemId === pads.id)) {
      context.lines.push({ label: String(pads.name ?? ""), dr: SLAM_PADS.dr, applies: true, forceField: false, flexible: false, hardened: 0, itemId: pads.id, source: "armor", reason: L("SlamPadsReason") });
    }
    // A one-sided piece worn at the back meets a blow from behind, which the
    // system's "F" turns away (p. 67); the loop below reads it as any other.
    if (on.sided!() && context.arc === "back") {
      for (const item of actor.items ?? []) {
        if (!isWorn(item) || sideOf(item) !== "back" || !covers(item, location) || context.lines.some((l: any) => l.itemId === item.id)) continue;
        context.lines.push({
          label: String(item.name ?? ""),
          dr: pieceDrAt(item.system ?? {}, damageType, location),
          applies: true,
          forceField: false,
          flexible: item.system?.flexible === true,
          hardened: Math.max(0, Math.floor(Number(item.system?.hardened) || 0)),
          itemId: item.id,
          source: "armor",
          reason: L("BackReason"),
        });
      }
    }

    for (const line of context.lines) {
      if (line.source === "natural" || !line.itemId) continue;
      const item = actor.items?.get?.(line.itemId);
      if (!isArmor(item)) continue;
      const data = htArmorData(item);
      // Worn at the back, it doesn't meet a blow from the front or the side, or
      // one from nowhere in particular (the sheet's figures among them).
      if (on.sided!() && sideOf(item) === "back" && !sideMeets("back", context.arc)) {
        line.applies = false;
        note(line, L("BackRefused"));
        continue;
      }
      if (pads && item.id === pads.id) {
        // All of the pads, whatever their coverage, at their DR against crushing.
        if (line.dr < SLAM_PADS.dr) line.dr = SLAM_PADS.dr;
        if (!line.reason) note(line, L("SlamPadsReason"));
        continue;
      }
      if (on.materials()) {
        const dr = materialDr(line.dr, data.material, damageType);
        if (dr !== line.dr) { line.dr = dr; note(line, L(`Material.${data.material}`)); }
        const lost = data.semiAblative ? plateLost(item) : 0;
        if (lost > 0) { line.dr = Math.max(0, line.dr - lost); note(line, F("PlateReason", { lost })); }
      }
      if (!on.partial()) continue;
      const front = frontDrAt({ dr: data.frontDr, locations: data.frontLocations }, location, context.arc);
      if (front !== null && front > line.dr) { line.dr = front; note(line, F("FrontReason", { dr: front })); }
      if (location === "foot" && data.toeDr > line.dr && context.fromBelow !== true) {
        if (preview) { note(line, F("ToePreview", { dr: data.toeDr, n: TOE_BOX_SIXTHS })); continue; }
        const roll = d6();
        if (partialStands(TOE_BOX_SIXTHS, roll)) { line.dr = data.toeDr; note(line, F("ToeHit", { roll, n: TOE_BOX_SIXTHS })); }
        else note(line, F("ToeMissed", { roll, n: TOE_BOX_SIXTHS }));
      }
      if (data.coverage) partial.push({ line, sixths: data.coverage });
    }

    if (!on.partial()) return;
    // High boots with the tops up are a layer the leg's list doesn't know.
    for (const piece of partialPiecesAt(actor, location).filter((p) => p.topsUp)) {
      const line = topsUpLine(piece.item, damageType, on);
      context.lines.push(line);
      partial.push({ line, sixths: piece.sixths });
    }
    if (!partial.length) return;
    const sixths = combinedSixths(partial.map((p) => p.sixths));
    if (struckAround(context, location)) {
      for (const p of partial) { p.line.applies = false; note(p.line, L("StruckAround")); }
      return;
    }
    if (sixths >= 6) return;
    if (preview) {
      for (const p of partial) note(p.line, F("PartialPreview", { n: sixths }));
      return;
    }
    const roll = d6();
    const stands = partialStands(sixths, roll);
    for (const p of partial) {
      if (!stands) p.line.applies = false;
      note(p.line, F(stands ? "PartialStood" : "PartialMissed", { roll, n: sixths }));
    }
  });

  // What the blow took off a semi-ablative plate (p. 67).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const actor = context?.actor;
    const result = context?.result;
    if (!on.materials() || !actor?.isOwner || !result) return;
    // One client writes: the GM where one is present, or the owner who applied it.
    if (!game.user?.isGM && (game.users as any)?.activeGM) return;
    const location = String(result.hitLocation ?? context.damage?.hitLocation ?? "");
    const basic = Math.max(0, Number(result.basicDamage) || 0);
    const arc = context.damage?.arc ?? null;
    const refused: string[] = result.refusedPieces ?? [];
    const cards: string[] = [];
    for (const item of piecesMet(actor, location, arc, refused)) {
      if (!htArmorData(item).semiAblative) continue;
      const already = plateLost(item);
      const lost = plateLoss(basic, Math.max(0, Math.floor(Number(item.system?.dr) || 0) - already));
      if (lost <= 0) continue;
      void item.setFlag(MODULE_ID, PLATE_FLAG, already + lost);
      cards.push(F("PlateWorn", { item: item.name, lost, total: already + lost }));
    }
    if (cards.length) void say(actor, context.item?.name ?? L("Title"), cards);
  });

  // A long coat's, poncho's or undercover clothing's bonus on a Holdout roll (p. 64): what the
  // character wears, the roll's `clothing` line (Characters p. 200; API 1.152.0), the better of it
  // and one already there. At default as well as with the skill.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.conceal() || !isHoldoutRoll(context) || !Array.isArray(context.modifiers)) return;
    const clothes = clothingConcealment(context.actor);
    if (clothes.holdout) wearClothingLine(context.modifiers, clothes.holdout, F("ClothesLine", { name: clothes.source }));
  });
}
