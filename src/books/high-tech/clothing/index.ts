/**
 * High-Tech's clothing against the weather and its climate-controlled
 * clothing (pp. 63-65, 74), registered with the system through the add-on API
 * under three switches. The rules are in `rules.ts`; what an outfit is comes
 * from its name, and what its wearer has left off from this module's
 * `clothing` data on it.
 *
 *   - **Clothing and weather (clothingAndWeather):** the class of clothing
 *     the character is wearing, answered to `gworld.weatherClothing` from the
 *     worn outfits (arctic clothes worn as winter or ordinary with layers
 *     off); -1 on the cold roll for each piece a worn winter or arctic outfit
 *     is missing; a worn wicking undergarment's +1 on the heat roll; DR 1 for
 *     fur winter or arctic clothes, through `gworld.armorDr`; an outfit's
 *     weight by TL, as a price modifier; and body armour's 2 FP on a hot
 *     day's battle (`gworld.fatigueCost`, the day's temperature since API
 *     1.138.0).
 *   - **Frostbite (frostbite):** where the cold costs FP, a damage card for
 *     each exposed hit location, a point of injury per FP it came to after
 *     Very Fit, through no DR (`gworld.afterFatigue`).
 *   - **Climate control (climateControl):** worn heated clothing, a
 *     climate-control system or a cooling vest widens the comfort zone
 *     (`temperatureTolerance`) through the shared climate engine, the powered
 *     ones while their cells last; heated clothing counts as winter clothes
 *     either way; and gear that widens the hot end spares a hot march its
 *     extra fatigue.
 */

import { CLIMATE_TABLES, readyClimate, workingClimateGear, type ClimateGear } from "../../../shared/climate/index.js";
import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  COOLING_VEST,
  FUR_DR,
  HEATED_CLOTHING,
  HOT_BATTLE_ARMOUR_FP,
  HIGH_TECH_CLIMATE_GEAR,
  PIECES,
  WICKING,
  WICKING_BONUS,
  WORN_AS,
  baseName,
  betterClass,
  exposedLocations,
  frostbiteInjury,
  furCovers,
  hikingWithoutHeat,
  missingPiecesPenalty,
  outfitOf,
  outfitWeightFactor,
  wornClass,
  type ClothingClass,
  type Outfit,
  type Piece,
  type WornAs,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Clothing.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Clothing.${key}`, data);

const FIELD = "clothing";

export interface ClothingSwitches {
  clothing: () => boolean;
  frostbite: () => boolean;
  climate: () => boolean;
}

/** What this module keeps on an outfit. */
export interface ClothingData {
  /** The pieces the wearer has left off. */
  missing: Piece[];
  /** Arctic clothes with layers off (p. 63). */
  wornAs: WornAs;
  /** Made of fur: DR 1 at the GM's option (p. 64). */
  fur: boolean;
}

/**
 * Registers the fields this module keeps on an outfit, and the book's
 * climate-control table, with any pieces another of the book's switches
 * covers (the supplement Electricity and Electronics' heaters and fans).
 */
export function initClothing(climateRule: string, more: readonly ClimateGear[] = []): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      missing: new f.SchemaField(Object.fromEntries(PIECES.map((p) => [p, flag()]))),
      wornAs: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...WORN_AS] }),
      fur: flag(),
    }),
  });
  CLIMATE_TABLES.register({ book: "high-tech", tls: { min: 5, max: 8 }, rule: climateRule, gear: [...HIGH_TECH_CLIMATE_GEAR, ...more] });
}

/** An outfit's clothing data, with nothing missing. */
export function clothingData(item: any): ClothingData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    missing: PIECES.filter((p) => d.missing?.[p] === true),
    wornAs: WORN_AS.includes(d.wornAs) ? d.wornAs : "",
    fur: d.fur === true,
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const isWorn = (item: any): boolean => item?.type === "equipment" && item.system?.carried !== false && item.system?.equipped === true;
const actorKey = (actor: any): string => String(actor?.uuid ?? actor?.id ?? "");

/** What a worn piece is worth against the cold, or null for a piece that isn't clothing to these rules. */
function clothingOf(item: any, on: ClothingSwitches): { clothing: ClothingClass; outfit: Outfit | null } | null {
  const outfit = on.clothing() ? outfitOf(item?.name) : null;
  if (outfit) return { clothing: wornClass(outfit, clothingData(item).wornAs), outfit };
  // Without power heated clothing is winter clothing, and with it the suit is still that and more (p. 74).
  if (on.climate() && HEATED_CLOTHING.test(baseName(item?.name))) return { clothing: "winter", outfit: null };
  return null;
}

/** The character's best worn clothing against the cold, or null where they wear none these rules know. */
export function wornClothing(actor: any, on: ClothingSwitches): { item: any; clothing: ClothingClass; outfit: Outfit | null } | null {
  let best: { item: any; clothing: ClothingClass; outfit: Outfit | null } | null = null;
  for (const item of actor?.items ?? []) {
    if (!isWorn(item)) continue;
    const worn = clothingOf(item, on);
    if (worn && (!best || betterClass(best.clothing, worn.clothing) !== best.clothing)) best = { item, ...worn };
  }
  return best;
}

/** The pieces the outfit giving this class leaves off, where the outfit needs them. */
function missingFor(actor: any, clothing: ClothingClass, on: ClothingSwitches): Piece[] {
  const worn = wornClothing(actor, on);
  if (!worn?.outfit?.pieces || worn.clothing !== clothing || clothing === "light") return [];
  return clothingData(worn.item).missing;
}

/** The worn armour that covers the torso (a piece with no locations covers the whole body), or null. */
function bodyArmour(actor: any): any {
  return [...(actor?.items ?? [])].find((i: any) => i?.type === "armor" && i.system?.equipped === true && i.system?.carried !== false
    && (!(i.system?.locations?.length) || i.system.locations.includes("torso"))) ?? null;
}

// ── frostbite (p. 63) ──

/** The class of clothing each character's last cold roll was made in, for the FP it costs. */
const lastColdRoll = new Map<string, ClothingClass>();

async function frostbite(api: GWorldApi, actor: any, fp: number, clothing: ClothingClass, on: ClothingSwitches): Promise<void> {
  const injury = frostbiteInjury(fp);
  if (injury <= 0) return;
  for (const location of exposedLocations(clothing, missingFor(actor, clothing, on))) {
    await api.roll.damage({
      actor,
      label: F("FrostbiteLabel", { name: String(actor?.name ?? ""), location: game.i18n.localize(`GCC.HT.Clothing.Location.${location}`), fp }),
      formula: String(injury),
      damageType: "tox" as never,
      ignoresDr: true,
      calledShot: { hitLocation: location, chink: false } as never,
      source: "frostbite",
    });
  }
}

// ── the item sheet ──

function itemLines(item: any, on: ClothingSwitches): string[] {
  const lines: string[] = [];
  const outfit = on.clothing() ? outfitOf(item?.name) : null;
  if (outfit) {
    const data = clothingData(item);
    const clothing = wornClass(outfit, data.wornAs);
    lines.push(F("ClassItem", { clothing: game.i18n.localize(`GCC.HT.Clothing.Class.${clothing}`) }));
    if (outfit.pieces && clothing !== "light" && data.missing.length) lines.push(F("MissingItem", { penalty: missingPiecesPenalty(data.missing) }));
    if (outfit.pieces && data.fur) lines.push(F("FurItem", { dr: FUR_DR }));
    const factor = outfit.weighed ? outfitWeightFactor(outfit.weightRow, tlOf(item)) : null;
    if (factor !== null && factor !== 1) lines.push(F("WeightItem", { factor, tl: tlOf(item) }));
  }
  if (on.clothing() && WICKING.test(baseName(item?.name))) lines.push(F("WickingItem", { bonus: WICKING_BONUS }));
  if (on.climate()) {
    const gear = HIGH_TECH_CLIMATE_GEAR.find((g) => g.pattern.test(baseName(item?.name)));
    if (gear) {
      if (gear.zone.coldF && gear.zone.heatF) lines.push(F("ZoneBoth", { degrees: gear.zone.coldF }));
      else if (gear.zone.coldF) lines.push(F("ZoneCold", { degrees: gear.zone.coldF }));
      else lines.push(F("ZoneHeat", { degrees: gear.zone.heatF, hours: COOLING_VEST.hours, minutes: COOLING_VEST.soakMinutes }));
      if (gear.powered) lines.push(L("PoweredItem"));
      if (gear.zone.heatF) lines.push(L("HotMarchItem"));
    }
    if (HEATED_CLOTHING.test(baseName(item?.name))) lines.push(L("HeatedWinterItem"));
  }
  return lines;
}

function itemContext(item: any, on: ClothingSwitches): Record<string, unknown> {
  const outfit = on.clothing() ? outfitOf(item?.name) : null;
  const data = clothingData(item);
  return {
    lines: itemLines(item, on),
    pieces: outfit?.pieces ? PIECES.map((p) => ({ key: p, label: L(`Piece.${p}`), missing: data.missing.includes(p) })) : null,
    fur: outfit?.pieces ? { checked: data.fur } : null,
    wornAs: outfit?.clothing === "arctic"
      ? WORN_AS.map((w) => ({ value: w, label: L(w ? `WornAs.${w}` : "WornAs.arctic"), selected: w === data.wornAs }))
      : null,
    editable: item.isOwner,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-clothing]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtClothing);
      await item.update({ [`${path}.${key}`]: input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value });
    });
  });
}

export function readyClothing(api: GWorldApi, on: ClothingSwitches): void {
  readyClimate();

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-clothing-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-clothing-item.hbs`,
    visible: (item) => item?.type === "equipment" && itemLines(item, on).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // An outfit's weight by TL (p. 65), from the TL7 weight the records carry.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-clothing-weight",
    types: ["equipment"],
    apply: (item, price) => {
      const outfit = on.clothing() ? outfitOf(item?.name) : null;
      const factor = outfit?.weighed ? outfitWeightFactor(outfit.weightRow, tlOf(item)) : null;
      if (factor === null || factor === 1) return null;
      return { cost: price.cost, weight: Math.round(price.weight * factor * 1000) / 1000, label: F("WeightLabel", { tl: tlOf(item) }) };
    },
  });

  // What the character is wearing against the cold (p. 63; Campaigns p. 430).
  Hooks.on(api.combat.hooks.weatherClothing, (context: any) => {
    if (!context?.actor || !(on.clothing() || on.climate())) return;
    const worn = wornClothing(context.actor, on);
    if (!worn) return;
    const current = typeof context.clothing === "string" ? (context.clothing as ClothingClass) : null;
    if (betterClass(current, worn.clothing) === current && current !== null) return;
    context.clothing = worn.clothing;
    context.label = String(worn.item.name ?? "");
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const tags: string[] = context?.tags ?? [];
    if (!actor || !Array.isArray(context.modifiers) || !tags.includes("exposure")) return;

    if (tags.includes("cold")) {
      const clothing: ClothingClass = context.weather?.clothing ?? "winter";
      lastColdRoll.set(actorKey(actor), clothing);
      // Winter or arctic clothes with pieces left off: -1 each (p. 63).
      if (on.clothing()) {
        const missing = missingFor(actor, clothing, on);
        if (missing.length) context.modifiers.push({ label: F("MissingLine", { pieces: missing.map((p) => L(`Piece.${p}`)).join(", ") }), value: missingPiecesPenalty(missing) });
      }
    }

    // A wicking undergarment in the heat (p. 64).
    if (tags.includes("heat") && on.clothing()) {
      const wicking = [...(actor.items ?? [])].find((i: any) => isWorn(i) && WICKING.test(baseName(i.name)));
      if (wicking) context.modifiers.push({ label: F("WickingLine", { name: wicking.name }), value: WICKING_BONUS });
    }
  });

  Hooks.on(api.combat.hooks.fatigueCost, (context: any) => {
    const actor = context?.actor;
    if (!actor) return;
    const details = context.details ?? {};

    // Body armour on a hot day's battle: the Basic Set's 2 FP for anyone in
    // plate or an overcoat (p. 65; Campaigns p. 426), unless worn gear cools.
    if (on.clothing() && context.reason === "battle" && details.hot === true) {
      const armour = bodyArmour(actor);
      if (armour && !workingClimateGear(actor).some(({ gear }) => gear.zone.heatF > 0)) {
        context.fp = (Number(context.fp) || 0) + HOT_BATTLE_ARMOUR_FP;
        context.sources.push(F("HotBattleLine", { name: armour.name, fp: HOT_BATTLE_ARMOUR_FP }));
      }
    }

    // Gear that widens the hot end spares a march its hot-weather point an hour (p. 74; Campaigns p. 426).
    if (on.climate() && context.reason === "hiking" && details.hot === true) {
      const cooler = workingClimateGear(actor).find(({ gear }) => gear.zone.heatF > 0);
      if (!cooler) return;
      const fp = hikingWithoutHeat(Number(context.fp) || 0, Number(details.hours) || 0);
      if (fp === context.fp) return;
      context.fp = fp;
      context.sources.push(F("HotMarchLine", { name: cooler.item.name }));
    }
  });

  // Frostbite: a point to each exposed location per FP the cold took, once
  // Very Fit and the fatigue chart have had their say (p. 63; API 1.138.0).
  Hooks.on(api.combat.hooks.afterFatigue, (context: any) => {
    const actor = context?.actor;
    if (!actor || context.reason !== "exposure" || context.details?.heat !== false) return;
    const clothing = lastColdRoll.get(actorKey(actor)) ?? "winter";
    lastColdRoll.delete(actorKey(actor));
    const fp = Number(context.fpLost) || 0;
    if (on.frostbite() && fp > 0) void frostbite(api, actor, fp, clothing, on);
  });

  // Fur winter or arctic clothes: DR 1 wherever the outfit covers (p. 64).
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.clothing() || !context?.actor || !Array.isArray(context.lines)) return;
    const worn = [...(context.actor.items ?? [])].find((i: any) => isWorn(i) && outfitOf(i.name)?.pieces && clothingData(i).fur);
    if (!worn || !furCovers(String(context.hitLocation ?? ""), clothingData(worn).missing)) return;
    context.lines.push({ label: F("FurLine", { name: worn.name }), dr: FUR_DR, applies: true, forceField: false, flexible: true, hardened: 0, itemId: worn.id, source: "armor" });
  });
}
