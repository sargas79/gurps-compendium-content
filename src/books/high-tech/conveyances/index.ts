/**
 * High-Tech's personal conveyances (pp. 226, 230-231), registered with the
 * system through the add-on API under one switch, personalConveyances. The
 * rules are in `rules.ts`; what each record is (a bicycle, a skateboard, a
 * surfboard, a wheelchair) is its `conveyance` data, written on the records.
 *
 * A conveyance in use (the Gear tab's equipped box) is the one the character
 * rides:
 *   - **Move (`gworld.moveModifiers`):** a bicycle's rider moves at the better
 *     of his relative Bicycling level and his Move, times the bike's Enhanced
 *     Move, rounded down; a skateboarder at his Move times the board's. The
 *     relative skill is halved as the system halves Move for a rider
 *     reeling or very tired, so a long ride below 1/3 FP slows him.
 *     Road-Bound Enhanced Move is lost off the road, and downhill Move is
 *     doubled, tripled or quadrupled by the slope, both set in the Gear tab's
 *     "Riding" box. The powered wheelchairs move at Move 3.
 *   - **Skill (`gworld.skillBonuses`):** a penny-farthing is -1 to Bicycling.
 *   - **Weight (`gworld.carriedWeight`):** the conveyance ridden is not carried.
 *   - **Price (`data.registerPriceModifier`):** the safety bicycle is lighter
 *     at TL7 and TL8.
 *   - **Water Move (`gworld.moveModifiers`, `medium` water):** a surfer
 *     paddles at Move 1, or rides a wave at the Move the Riding box sets
 *     (12-15 on the best waves).
 *   - **Row actions:** a spill from a penny-farthing (a two-yard fall, run
 *     through the system's falling procedure from the card), a long ride's
 *     fatigue roll under the running rules, a failure costing 1 FP through
 *     the fatigue chart, and a bicycle moving cargo as a two-wheeled cart
 *     (the system's towing, Campaigns p. 353) until it is stopped.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  CONVEYANCE_KINDS,
  CONVEYANCE_SKILL,
  DOWNHILL,
  SURFING,
  TOWING,
  bicycleWeightFactor,
  defaultRelativeLevel,
  longRideTarget,
  ridingMove,
  type ConveyanceKind,
  type RidingMove,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Conveyance.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Conveyance.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "conveyance";
const CARD = "ht-conveyance-card";
const SLOPE_FLAG = "htSlope";
const OFF_ROAD_FLAG = "htOffRoad";
/** The surfer's water Move on a wave, 0 while paddling. */
const SURF_FLAG = "htSurfMove";
/** The bicycle moving cargo, by item id, while the system tows it. */
const CARGO_FLAG = "htCargoBike";

/** What this module keeps on a conveyance. */
export interface ConveyanceData {
  kind: ConveyanceKind;
  /** The Enhanced Move (Ground) level: 0.5 for most bikes and the skateboard, 1 for the racing bike. */
  enhancedMove: number;
  /** Whether that Enhanced Move is Road-Bound. */
  roadBound: boolean;
  /** A modifier to the riding skill (the penny-farthing's -1). */
  skillModifier: number;
  /** The shortest fall a spill is, in yards (the penny-farthing's 2), or 0. */
  spillYards: number;
  /** A fixed Move (the powered wheelchairs' 3), or 0. */
  move: number;
  /** The weight's multiplier at TL7 and TL8 (the safety bicycle's), or 0 for none. */
  weightTl7: number;
  weightTl8: number;
  /** Whether it climbs stairs (the advanced wheelchair). */
  stairs: boolean;
}

/** Registers the fields this module keeps on conveyances. */
export function initConveyances(): void {
  const f = foundry.data.fields as any;
  const number = () => new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...CONVEYANCE_KINDS] }),
      enhancedMove: number(),
      roadBound: new f.BooleanField({ initial: false }),
      skillModifier: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      spillYards: number(),
      move: number(),
      weightTl7: number(),
      weightTl8: number(),
      stairs: new f.BooleanField({ initial: false }),
    }),
  });
}

/** A record's conveyance data, with nothing missing. */
export function conveyanceData(item: any): ConveyanceData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const positive = (v: unknown) => Math.max(0, Number(v) || 0);
  return {
    kind: CONVEYANCE_KINDS.includes(d.kind) ? d.kind : "",
    enhancedMove: positive(d.enhancedMove),
    roadBound: d.roadBound === true,
    skillModifier: Math.trunc(Number(d.skillModifier) || 0),
    spillYards: positive(d.spillYards),
    move: positive(d.move),
    weightTl7: positive(d.weightTl7),
    weightTl8: positive(d.weightTl8),
    stairs: d.stairs === true,
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const isCarried = (item: any): boolean => item?.type === "equipment" && item.system?.carried !== false;
const skillKey = (name: string) => String(name ?? "").replace(/\/TL[\d^]*/gi, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The conveyance the character is riding: the first one carried and in use. */
export function riddenConveyance(actor: any): any {
  return [...(actor?.items ?? [])].find((item: any) => isCarried(item) && item.system?.equipped === true && conveyanceData(item).kind !== "") ?? null;
}

/** The slope the rider is going down, in degrees (the Gear tab's "Riding" box). */
export function slopeOf(actor: any): number {
  return Math.max(0, Number(actor?.getFlag?.(MODULE_ID, SLOPE_FLAG)) || 0);
}

const offRoad = (actor: any): boolean => actor?.getFlag?.(MODULE_ID, OFF_ROAD_FLAG) === true;

/** The water Move a surfer's wave gives, or 0 while paddling (the Gear tab's "Riding" box). */
export function surfMoveOf(actor: any): number {
  const move = Math.floor(Number(actor?.getFlag?.(MODULE_ID, SURF_FLAG)) || 0);
  return move >= SURFING.bestWaves.least && move <= SURFING.bestWaves.most ? move : 0;
}

/** The bicycle moving cargo, while the system is towing it. */
const cargoBikeId = (actor: any): string => String(actor?.getFlag?.(MODULE_ID, CARGO_FLAG) ?? "");

/**
 * The rider's level in a conveyance's skill relative to DX (p. 230), with
 * everything added to it -- the bike's quality, the penny-farthing's -1.
 * This runs while the character is prepared, before the sheet's attributes
 * are, so a learned skill's figure is read off the skill itself: its
 * relative level for the points, plus its bonus lines. A skill the rider
 * hasn't learned is at its best default, with the conveyance's modifier.
 */
export function relativeSkill(api: GWorldApi, actor: any, skill: string, modifier = 0): number | null {
  const item = [...(actor?.items ?? [])].find((i: any) => i?.type === "skill" && skillKey(i.name) === skillKey(skill));
  const d = item?.system?.derived;
  if (d && typeof d.level === "number" && d.fromDefault === false && typeof d.relativeLevel === "number") {
    const bonuses = (Array.isArray(d.bonusLines) ? d.bonusLines : []).reduce((sum: number, l: any) => sum + (Number(l?.value) || 0), 0);
    return d.relativeLevel + bonuses;
  }
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const relative = defaultRelativeLevel(skill, dx, (name) => api.actors.skillLevel(actor, name));
  return relative === null ? null : relative + modifier;
}

/** What riding a conveyance makes of the character's Move, or null for one that doesn't set it. */
export function conveyanceMove(api: GWorldApi, actor: any, item: any, move: number): RidingMove | null {
  const data = conveyanceData(item);
  if (data.kind !== "bicycle" && data.kind !== "skateboard") return null;
  const relative = data.kind === "bicycle" ? relativeSkill(api, actor, CONVEYANCE_SKILL.bicycle as string, data.skillModifier) : null;
  // Reeling and very tired halve Move, the system's already (Campaigns pp. 419, 426): relative skill too.
  const hp = actor?.system?.hp ?? {};
  const fp = actor?.system?.fp ?? {};
  const halvings = [
    Number.isFinite(Number(hp.value)) && api.rules.isReeling(Number(hp.value), Number(hp.max) || 0),
    Number.isFinite(Number(fp.value)) && api.rules.isVeryTired(Number(fp.value), Number(fp.max) || 0),
  ].filter(Boolean).length;
  return ridingMove({ move, relative, enhancedMove: data.enhancedMove, roadBound: data.roadBound, offRoad: offRoad(actor), slope: slopeOf(actor), halvings });
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

// ── a spill (p. 230) ──

type SpillData = { title: string; lines: string[]; landing: { formula: string; label: string; yards?: number; rolled: boolean } };

async function spill(api: GWorldApi, item: any, actor: any): Promise<void> {
  const yards = Math.max(conveyanceData(item).spillYards, 0);
  const hp = Number(actor?.system?.hp?.max) || Number(api.actors.attribute(actor, "HT")) || 10;
  const fall = api.rules.fallingDamage({ hitPoints: hp, yardsFallen: yards });
  const name = String(actor?.name ?? "");
  await api.chat.post(`${MODULE_ID}.${CARD}`, {
    title: String(item.name ?? ""),
    lines: [F("SpillLine", { name, yards, velocity: fall.velocity })],
    landing: { formula: api.rules.formatDiceAdds({ dice: fall.damage.dice, adds: fall.damage.modifier }), label: F("SpillLanding", { name }), yards, rolled: false },
  } satisfies SpillData, { actor } as any);
}

// ── a long ride (p. 230; Campaigns p. 354) ──

async function longRide(api: GWorldApi, item: any, actor: any): Promise<void> {
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(L("LongRideHint"))}</p>
      <div class="ifields"><label>${esc(L("Pace"))} <select name="pace">
        <option value="paced">${esc(F("Paced", { minutes: api.rules.PACED_FATIGUE_MINUTES }))}</option>
        <option value="sprint">${esc(F("Sprint", { seconds: api.rules.SPRINT_FATIGUE_SECONDS }))}</option>
      </select></label></div></div>`,
    ok: {
      label: L("Roll"),
      callback: (_event: Event, button: HTMLElement) => ({ pace: button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="pace"]')?.value === "sprint" ? "sprint" : "paced" }),
    },
    rejectClose: false,
  });
  if (!answer) return;
  const data = conveyanceData(item);
  const skill = CONVEYANCE_SKILL.bicycle as string;
  const ht = Number(api.actors.attribute(actor, "HT")) || 10;
  const relative = relativeSkill(api, actor, skill, data.skillModifier);
  const target = longRideTarget(ht, relative);
  const bySkill = relative !== null && target > ht;
  const outcome: any = await api.roll.success({
    actor, base: target, item,
    label: F(answer.pace === "sprint" ? "SprintRoll" : "PacedRoll", { skill: bySkill ? F("HtBased", { skill }) : "HT" }),
    skill: bySkill ? skill : "HT", kind: bySkill ? "skill" : "attribute", tags: ["longRide", "HT"],
  } as any);
  if (!outcome || outcome.success) return;
  // Exertion through the fatigue chart: Very Fit halves it, and past 0 FP it hurts (Campaigns p. 426).
  const spent: any = await api.actors.spendFatigue(actor, 1, { details: { rule: "longRide", item: String(item.name ?? "") } });
  await say(actor, String(item.name ?? ""), [F("RideTired", { name: actor.name, fp: Number(spent?.fpLost) || 0 })]);
}

// ── moving cargo (p. 230; Campaigns p. 353) ──

/** A bicycle moving cargo counts as a two-wheeled cart: the system tows the bike and its load until stopped. */
async function moveCargo(api: GWorldApi, item: any, actor: any): Promise<void> {
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(F("CargoHint", { divisor: TOWING.divisor, smooth: TOWING.smoothDivisor }))}</p>
      <div class="ifields"><label>${esc(L("CargoWeight"))} <input type="number" name="cargo" min="0" step="any" value="0" /></label></div>
      <div class="ichecks"><label class="icheck"><input type="checkbox" name="smooth" /> ${esc(L("CargoSmooth"))}</label></div></div>`,
    ok: {
      label: L("CargoStart"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          cargo: Math.max(0, Number(form?.querySelector<HTMLInputElement>('[name="cargo"]')?.value) || 0),
          smooth: form?.querySelector<HTMLInputElement>('[name="smooth"]')?.checked === true,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer) return;
  const bike = Math.max(0, Number(item.system?.weight) || 0);
  const towed: any = await api.actors.tow(actor, { weight: bike + answer.cargo, conveyance: "cart", smooth: answer.smooth, label: String(item.name ?? "") });
  if (!towed) return;
  await actor.setFlag(MODULE_ID, CARGO_FLAG, String(item.id ?? ""));
  const lines = [F("CargoLine", { name: actor.name, weight: bike + answer.cargo, effective: towed.effective })];
  if (towed.movable === false) lines.push(F("CargoTooHeavy", { limit: towed.limit }));
  await say(actor, String(item.name ?? ""), lines);
}

async function stopCargo(api: GWorldApi, actor: any): Promise<void> {
  await api.actors.stopTowing(actor);
  await actor.unsetFlag(MODULE_ID, CARGO_FLAG);
}

// ── the sheets ──

function itemLines(item: any): string[] {
  const data = conveyanceData(item);
  const lines: string[] = [];
  const tl = tlOf(item);
  switch (data.kind) {
    case "bicycle":
    case "skateboard": {
      const skill = CONVEYANCE_SKILL[data.kind] as string;
      lines.push(F(data.kind === "bicycle" ? "BicycleItem" : "SkateboardItem", { skill, multiplier: 1 + data.enhancedMove }));
      if (data.roadBound) lines.push(L("RoadBoundItem"));
      lines.push(F("DownhillItem", { steps: DOWNHILL.filter((s) => s.degrees > 0).map((s) => `${s.degrees}° x${s.multiplier}`).join(", ") }));
      if (data.kind === "bicycle") lines.push(L("LongRideItem"), F("TowingItem", { divisor: TOWING.divisor, smooth: TOWING.smoothDivisor }));
      if (data.skillModifier) lines.push(F("SkillModifierItem", { skill, modifier: data.skillModifier }));
      if (data.spillYards > 0) lines.push(F("SpillItem", { yards: data.spillYards }));
      const factor = bicycleWeightFactor(tl, { tl7: data.weightTl7, tl8: data.weightTl8 });
      if (factor !== 1) lines.push(F("LighterItem", { factor, tl }));
      break;
    }
    case "surfboard":
      lines.push(F("SurfboardItem", { skill: CONVEYANCE_SKILL.surfboard, least: SURFING.bestWaves.least, most: SURFING.bestWaves.most, paddling: SURFING.paddling }));
      break;
    case "wheelchair":
      lines.push(data.move > 0 ? F("WheelchairItem", { move: data.move }) : L("ManualWheelchairItem"));
      if (data.stairs) lines.push(L("StairsItem"));
      break;
    default:
  }
  return lines;
}

function ridingContext(api: GWorldApi, actor: any): Record<string, unknown> {
  const item = riddenConveyance(actor);
  const data = conveyanceData(item);
  const derived = api.actors.derived(actor) ?? {};
  const moveLine = (derived.moveLines ?? []).length ? F("MoveNow", { move: Number(derived.move) || 0 }) : null;
  const slope = slopeOf(actor);
  return {
    name: String(item?.name ?? ""),
    slopes: DOWNHILL.map((s) => ({ value: s.degrees, label: s.degrees ? F("Slope", { degrees: s.degrees, multiplier: s.multiplier }) : L("Level"), selected: s.degrees === slope })),
    downhill: data.kind === "bicycle" || data.kind === "skateboard",
    roadBound: data.roadBound,
    offRoad: offRoad(actor),
    surf: data.kind === "surfboard",
    surfMoves: data.kind === "surfboard"
      ? [0, ...Array.from({ length: SURFING.bestWaves.most - SURFING.bestWaves.least + 1 }, (_, i) => SURFING.bestWaves.least + i)].map((value) => ({
          value,
          label: value ? F("OnAWave", { move: value }) : F("Paddling", { move: SURFING.paddling }),
          selected: value === surfMoveOf(actor),
        }))
      : [],
    waterMove: data.kind === "surfboard" ? F("WaterMoveNow", { move: Number(derived.feats?.swimming?.move) || 0 }) : null,
    moveLine,
  };
}

function ridingListeners(element: HTMLElement, actor: any): void {
  element.querySelector<HTMLSelectElement>("[data-gcc-ht-slope]")?.addEventListener("change", async (event) => {
    await actor.setFlag(MODULE_ID, SLOPE_FLAG, Number((event.currentTarget as HTMLSelectElement).value) || 0);
  });
  element.querySelector<HTMLInputElement>("[data-gcc-ht-off-road]")?.addEventListener("change", async (event) => {
    await actor.setFlag(MODULE_ID, OFF_ROAD_FLAG, (event.currentTarget as HTMLInputElement).checked);
  });
  element.querySelector<HTMLSelectElement>("[data-gcc-ht-surf]")?.addEventListener("change", async (event) => {
    await actor.setFlag(MODULE_ID, SURF_FLAG, Number((event.currentTarget as HTMLSelectElement).value) || 0);
  });
}

export function readyConveyances(api: GWorldApi, on: () => boolean): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-conveyance-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-conveyance-item.hbs`,
    visible: (item) => item?.type === "equipment" && on() && itemLines(item).length > 0,
    context: (item) => ({ lines: itemLines(item) }),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-conveyance-riding",
    sheet: "character",
    tab: "gear",
    template: `modules/${MODULE_ID}/templates/ht-conveyance-riding.hbs`,
    visible: (actor) => on() && riddenConveyance(actor) !== null,
    context: (actor) => ridingContext(api, actor),
    listeners: (element, actor) => ridingListeners(element, actor),
  });

  // The safety bicycle, lighter at TL7 and TL8 (p. 230).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-conveyance-price",
    types: ["equipment"],
    apply: (item, price) => {
      const data = conveyanceData(item);
      if (!on() || data.kind === "") return null;
      const factor = bicycleWeightFactor(tlOf(item), { tl7: data.weightTl7, tl8: data.weightTl8 });
      if (factor === 1) return null;
      return { cost: price.cost, weight: Math.round(price.weight * factor * 1000) / 1000, label: F("Lighter", { tl: tlOf(item) }) };
    },
  });

  // Move on the conveyance ridden (pp. 226, 230), and a surfer's in the water (p. 231).
  Hooks.on(api.data.hooks.moveModifiers, (context: any) => {
    if (!on() || !Array.isArray(context?.lines)) return;
    const item = riddenConveyance(context.actor);
    if (!item) return;
    const move = Number(context.move) || 0;
    const data = conveyanceData(item);
    if (context.medium === "water") {
      if (data.kind !== "surfboard") return;
      // Paddling is seldom faster than Move 1; the best waves carry a surfer at 12-15.
      const wave = surfMoveOf(context.actor);
      const target = wave || SURFING.paddling;
      if (target !== move) context.lines.push({ label: F(wave ? "WaveLine" : "PaddleLine", { name: item.name }), value: target - move, medium: "water" });
      return;
    }
    if (context.medium && context.medium !== "ground") return;
    if (data.kind === "wheelchair") {
      if (data.move > 0 && data.move !== move) context.lines.push({ label: String(item.name ?? ""), value: data.move - move });
      return;
    }
    const riding = conveyanceMove(api, context.actor, item, move);
    if (!riding) return;
    if (riding.level !== move) {
      const label = F(riding.fromSkill ? "RideLineSkill" : "RideLine", { name: item.name, base: riding.base, multiplier: riding.enhanced });
      context.lines.push({ label, value: riding.level - move });
    }
    if (riding.downhill > 1) context.lines.push({ label: F("DownhillLine", { degrees: slopeOf(context.actor), multiplier: riding.downhill }), value: riding.move - riding.level });
  });

  // The penny-farthing's -1 to Bicycling (p. 230), while it is ridden.
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if (!on() || !Array.isArray(context?.lines)) return;
    const item = riddenConveyance(context.actor);
    const data = conveyanceData(item);
    const skill = data.kind ? CONVEYANCE_SKILL[data.kind] : null;
    if (!item || !data.skillModifier || !skill || skillKey(context.name) !== skillKey(skill)) return;
    context.lines.push({ key: "conveyance", label: String(item.name ?? ""), value: data.skillModifier, source: MODULE_ID });
  });

  // The conveyance ridden carries its rider, not the other way round; a
  // bicycle moving cargo is in the towed load, not carried as well.
  Hooks.on(api.data.hooks.carriedWeight, (context: any) => {
    if (!on() || !Array.isArray(context?.lines)) return;
    const lineOf = (item: any) => (item ? context.lines.find((l: any) => l?.item === item || (l?.item?.id && l.item.id === item.id)) : null);
    const ridden = lineOf(riddenConveyance(context.actor));
    if (ridden) {
      ridden.counts = false;
      ridden.reason = L("Ridden");
    }
    const cargoId = cargoBikeId(context.actor);
    // The system keeps the towed load in its own flag (flags.gworld.towing) until it stops.
    const cargo = cargoId && context.actor?.flags?.gworld?.towing ? lineOf(context.actor?.items?.get?.(cargoId)) : null;
    if (cargo) {
      cargo.counts = false;
      cargo.reason = L("Towed");
    }
  });

  // ── row actions ──
  api.sheets.registerRowAction({
    module: MODULE_ID, key: "ht-conveyance-spill", itemTypes: ["equipment"], label: L("SpillAction"), icon: "fa-solid fa-person-falling",
    visible: (item) => on() && conveyanceData(item).spillYards > 0,
    run: (item, actor) => { void spill(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID, key: "ht-conveyance-long-ride", itemTypes: ["equipment"], label: L("LongRideAction"), icon: "fa-solid fa-person-biking",
    visible: (item) => on() && conveyanceData(item).kind === "bicycle",
    run: (item, actor) => { void longRide(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID, key: "ht-conveyance-cargo", itemTypes: ["equipment"], label: L("CargoAction"), icon: "fa-solid fa-dolly",
    visible: (item, actor) => on() && conveyanceData(item).kind === "bicycle" && cargoBikeId(actor) !== String(item.id ?? ""),
    run: (item, actor) => { void moveCargo(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID, key: "ht-conveyance-cargo-stop", itemTypes: ["equipment"], label: L("CargoStop"), icon: "fa-solid fa-hand",
    visible: (item, actor) => on() && cargoBikeId(actor) === String(item.id ?? ""),
    run: (_item, actor) => { void stopCargo(api, actor); },
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ht-conveyance-card.hbs`,
    actions: {
      landing: async ({ message, data, actor }: any) => {
        const landing = (data as SpillData).landing;
        if (!on() || !landing || landing.rolled) return;
        // The system's falling procedure: a random location, armour as flexible, the card (Campaigns pp. 430-431).
        if (landing.yards) await api.hazards.fall(actor, { yards: landing.yards });
        else await api.roll.damage({ actor, label: landing.label, formula: landing.formula, damageType: "cr" as never, source: "fall" });
        await api.chat.update(message, { ...data, landing: { ...landing, rolled: true } });
      },
    },
  } as any);
}

