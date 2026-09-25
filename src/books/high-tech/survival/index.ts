/**
 * High-Tech's survival and camping gear, maritime gear, parachutes and
 * snacks (pp. 34-35, 56-61), registered with the system through the add-on
 * API under four switches. The rules are in `rules.ts`; what each record is (a
 * shelter, a fire starter, a trap, a kit, a chute...) is its `survival` data,
 * written on the records from book.json.
 *
 *   - **Survival gear (survivalGear):** a camper's shelter or sleeping gear on
 *     the cold roll (or -5 with none), from the "Camping out" box on the
 *     Inventory tab; fire starters' +5 to +10 on a DX-based Survival roll;
 *     foraging from a fishing kit's, trap's or snare's row -- Fishing, or the
 *     best land Survival with the trap's own quality, up to five a day, an
 *     hour each; a spring trap's blow and the Quick Contest of ST to break free; a
 *     survival kit carried for another environment as the Survival roll's
 *     equipment line (`gworld.skillBonuses`); a water filter's +(TL-2), or a
 *     charcoal-filtered canteen's +2, on the HT roll against a digestive
 *     disease (the Illness dialog's own among them); the hand-pumped desalinator's
 *     pumping and the solar still's Survival roll as row actions; a rescue
 *     signal in use as +2 to a rescuer's Vision roll, out to the range it is
 *     seen at; and who hears a whistle, heard at 128 yards.
 *   - **Maritime gear (maritimeGear):** a life jacket worn gives +6 to
 *     Swimming rolls (the drowning rolls among them) and -3 in a Quick Contest
 *     of Swimming; swim fins worn are Enhanced Move 0.5 (Water) on water
 *     Move and take Move on land to 2; a released dye marker is +2 to Vision rolls to
 *     spot its user for half an hour.
 *   - **Parachuting (parachuting):** a jump as a row action -- the
 *     Parachuting roll, where the canopy opens (by itself at 1,000' from TL8,
 *     for a jumper who never pulls), the landing speed for the load and a
 *     chute that fails under it, the drift in the wind, the half-velocity
 *     landing of a jumper who hits first, the earliest chutes' nausea -- with
 *     the landing rolled from the card; Death from Above as an attack option,
 *     only while under the open canopy; a reserve chute priced; and notes for
 *     the ram-air chute's glide and the guided delivery gear.
 *   - **Rations (rations):** a snack or sports drink eaten from its row,
 *     one taken off the count, and the card saying what it counts as; eaten
 *     on the move, 1 FP back now and 2 FP gone two hours later, charged by the
 *     active GM's client as world time passes.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { hearSound } from "../hearing.js";
import { toolsFor } from "../equipment/index.js";
import {
  AUTO_DEPLOY,
  CHARCOAL_CANTEEN,
  CHARCOAL_CANTEEN_BONUS,
  CORK_JACKET,
  DESALINATOR,
  DON_SECONDS,
  DOFF_SECONDS,
  DYE_MARKER_SECONDS,
  FINS_LAND_MOVE,
  FINS_WATER_MULTIPLIER,
  FIRE_STARTER_BONUS,
  FORAGING_HOURS,
  FORAGING_ROLLS_A_DAY,
  GUIDED_DELIVERY,
  INFILTRATION_POD_LBS,
  LIFE_JACKET,
  NO_SHELTER,
  PARACHUTING_DEFAULT,
  PARACHUTING_IQ_DEFAULT,
  RAM_AIR_GLIDE,
  RESERVE_CHUTE,
  SIGNAL_VISION,
  SNACK_ON_THE_MOVE,
  WHISTLE_HEARD_AT,
  SNACK_REST_FP,
  SURVIVAL_ATTRIBUTE,
  TRAP_DAMAGE_ADDS,
  deathFromAboveLine,
  descentSeconds,
  driftYards,
  dueCrashes,
  finsMoveLine,
  fireBuildingLevel,
  foragingAttempt,
  jumpOutcome,
  landingSpeed,
  pullHeight,
  ratedWeight,
  shelterLine,
  shelterModifier,
  signalSeen,
  specialtyList,
  survivalKitLine,
  survivalOf,
  waterFilterBonus,
  type CarriedSurvivalKit,
  type Chute,
  type ShelterGear,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Survival.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Survival.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "survival";
const CARD = "ht-survival-card";
const CAMPING_FLAG = "htCamping";
const DYE_FLAG = "htDyeMarker";
const DEATH_FROM_ABOVE = "ht-death-from-above";
/** Actor flag: the day's foraging rolls, `{ day, rolls }` (p. 58). */
const FORAGE_FLAG = "htForaging";
/** Actor flag: the FP a snack eaten on the move takes back later, `[{ at, fp, item }]` (p. 35). */
const CRASH_FLAG = "htSnackCrash";
/** Actor flag: the jumper is under an open canopy, until they land (p. 61). */
const CANOPY_FLAG = "htUnderCanopy";

/** What a record is to these rules. */
export const SURVIVAL_KINDS = [
  "",
  "shelter",
  "fireStarter",
  "fishing",
  "trap",
  "survivalKit",
  "waterFilter",
  "desalinator",
  "solarStill",
  "signal",
  "whistle",
  "lifeJacket",
  "swimFins",
  "dyeMarker",
  "parachute",
  "cargoChute",
  "snack",
  "sportsDrink",
] as const;
export type SurvivalKindKey = (typeof SURVIVAL_KINDS)[number];

export interface SurvivalSwitches {
  survival: () => boolean;
  maritime: () => boolean;
  parachuting: () => boolean;
  rations: () => boolean;
}

/** What this module keeps on a piece of survival gear. */
export interface SurvivalData {
  kind: SurvivalKindKey;
  /** A shelter's cold-roll modifier, a trap's ST, or the yards a rescue signal is seen at (0 for no limit given). */
  value: number;
  /** A shelter's modifier at TL8, where it differs (the sleeping bag, p. 56). */
  valueAtTl8: number | null;
  /** A survival kit's specialties the GM counts as similar to its own (p. 58). */
  similar: string[];
  /** A desalinator's large model: a quart for the pumping, not a cup (p. 59). */
  large: boolean;
  chute: Chute;
  /** The HT modifier against nausea on a jump, or null for none (p. 61). */
  nausea: number | null;
  /** A parachute packed with a reserve (p. 61). */
  reserve: boolean;
}

/** Registers the fields this module keeps on survival gear. */
export function initSurvival(): void {
  const f = foundry.data.fields as any;
  const number = (initial = 0) => new f.NumberField({ required: true, nullable: false, initial, min: 0 });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SURVIVAL_KINDS] }),
      value: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      valueAtTl8: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      similar: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      large: new f.BooleanField({ initial: false }),
      maxLbs: number(),
      maxLbsTl7: number(),
      maxLbsTl8: number(),
      openingYards: number(),
      descent: number(),
      nausea: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      reserve: new f.BooleanField({ initial: false }),
    }),
  });
}

/** A piece of gear's survival data, with nothing missing. */
export function survivalData(item: any): SurvivalData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const whole = (v: unknown) => Math.max(0, Number(v) || 0);
  return {
    kind: SURVIVAL_KINDS.includes(d.kind) ? d.kind : "",
    value: Math.trunc(Number(d.value) || 0),
    valueAtTl8: typeof d.valueAtTl8 === "number" ? Math.trunc(d.valueAtTl8) : null,
    similar: specialtyList(d.similar),
    large: d.large === true,
    chute: { maxLbs: whole(d.maxLbs), maxLbsTl7: whole(d.maxLbsTl7), maxLbsTl8: whole(d.maxLbsTl8), openingYards: whole(d.openingYards), descent: whole(d.descent) },
    nausea: typeof d.nausea === "number" ? Math.trunc(d.nausea) : null,
    reserve: d.reserve === true,
  };
}

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const worldNow = (): number => Number((game as any).time?.worldTime) || 0;
const isCarried = (item: any): boolean => item?.type === "equipment" && item.system?.carried !== false;
const inUse = (item: any): boolean => isCarried(item) && item.system?.equipped === true;

function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const from = a?.getActiveTokens?.()?.[0];
  const to = b?.getActiveTokens?.()?.[0];
  if (!from?.center || !to?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([from.center, to.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/** A rescue signal's range for the item sheet, in miles past one. */
function signalRange(yards: number): string {
  return yards >= 1760 ? F("Miles", { miles: Math.round((yards / 1760) * 10) / 10 }) : F("Yards", { yards });
}

/** The character's carried gear of a kind. */
function gearOf(actor: any, kind: SurvivalKindKey, worn = false): any[] {
  return [...(actor?.items ?? [])].filter((item: any) => (worn ? inUse(item) : isCarried(item)) && survivalData(item).kind === kind);
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
    ...(rolls.length ? { rolls } : {}),
  });
}

/** The one token the user has targeted's actor, or null. */
function targetedActor(): any {
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length === 1 ? targets[0]?.actor ?? null : null;
}

/** Takes one off a consumable's count (`items.changeQuantity`); false where there is none left. */
async function useOne(api: GWorldApi, item: any): Promise<boolean> {
  const quantity = Number(item?.system?.quantity);
  if (!Number.isFinite(quantity)) return true;
  if (quantity <= 0) return false;
  await api.items.changeQuantity(item, -1, { reason: String(item?.name ?? "") });
  return true;
}

// ── shelters (pp. 56-57) ──

/** Whether the character is camping out, as the Inventory tab's box says. */
export function isCamping(actor: any): boolean {
  return actor?.getFlag?.(MODULE_ID, CAMPING_FLAG) === true;
}

/** The shelter and sleeping gear the character has with them, as the cold roll weighs it. */
function shelterGear(api: GWorldApi, actor: any): ShelterGear[] {
  return gearOf(actor, "shelter").map((item: any) => {
    const data = survivalData(item);
    return {
      name: String(item.name ?? ""),
      modifier: shelterModifier(data.value, data.valueAtTl8, tlOf(item)),
      quality: Number(api.rules.equipmentQualityModifier(item.system?.equipmentQuality ?? "basic")) || 0,
    };
  });
}

/** The cold roll's line for a camper, or null for somebody not camping out. */
export function campingLine(api: GWorldApi, actor: any): { label: string; value: number } | null {
  if (!isCamping(actor)) return null;
  const { value, gear } = shelterLine(shelterGear(api, actor));
  return { label: gear ? F("ShelterLine", { name: gear.name }) : L("NoShelterLine"), value };
}

// ── survival kits (p. 58) ──

function carriedKits(api: GWorldApi, actor: any): CarriedSurvivalKit[] {
  return gearOf(actor, "survivalKit").map((item: any) => ({
    skills: (item.system?.forSkills ?? []).map(String),
    quality: Number(api.rules.toolModifier(item.system?.equipmentQuality ?? "basic", item.system?.equipmentModifier)) || 0,
    similar: survivalData(item).similar,
  }));
}

/** A Survival roll's equipment line from a kit for another environment, or null where the rule has nothing to say. */
export function survivalKitEquipment(api: GWorldApi, actor: any, skill: string): number | null {
  if (!actor || !survivalOf(skill) || toolsFor(api, actor, skill).length) return null;
  return survivalKitLine(carriedKits(api, actor), skill);
}

// ── fire starters (p. 57) ──

/** The character's best Survival specialty's level, or null for none. */
function bestSurvival(api: GWorldApi, actor: any, landOnly = false): { name: string; level: number } | null {
  let best: { name: string; level: number } | null = null;
  for (const item of actor?.items ?? []) {
    const survival = item?.type === "skill" ? survivalOf(String(item.name ?? "")) : null;
    if (!survival || (landOnly && survival.kind !== "land")) continue;
    const level = api.actors.skillLevel(actor, String(item.name));
    if (typeof level === "number" && (!best || level > best.level)) best = { name: String(item.name), level };
  }
  return best;
}

async function buildFire(api: GWorldApi, item: any, actor: any): Promise<void> {
  const bonuses = Array.from({ length: FIRE_STARTER_BONUS.most - FIRE_STARTER_BONUS.least + 1 }, (_, i) => FIRE_STARTER_BONUS.least + i);
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(L("FireHint"))}</p>
      <div class="ifields">
        <label>${esc(L("FireBonus"))} <select name="bonus">${bonuses.map((b) => `<option value="${b}">+${b}</option>`).join("")}</select></label>
        <label>${esc(L("Conditions"))} <input type="number" name="modifier" value="0" step="1" style="width:60px"></label>
      </div></div>`,
    ok: {
      label: L("FireRoll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          bonus: Number(form?.querySelector<HTMLSelectElement>('[name="bonus"]')?.value) || FIRE_STARTER_BONUS.least,
          modifier: Math.trunc(Number(form?.querySelector<HTMLInputElement>('[name="modifier"]')?.value) || 0),
        };
      },
    },
    rejectClose: false,
  });
  if (!answer) return;
  const survival = bestSurvival(api, actor);
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const per = Number(api.actors.attribute(actor, SURVIVAL_ATTRIBUTE as never)) || 10;
  const base = fireBuildingLevel(dx, per, survival?.level ?? null);
  const modifiers = [{ label: F("FireStarterLine", { name: item.name }), value: answer.bonus }];
  if (answer.modifier) modifiers.push({ label: L("Conditions"), value: answer.modifier });
  await api.roll.success({ actor, base, label: F("FireLabel", { skill: survival?.name ?? L("SurvivalDefault") }), skill: survival?.name ?? "DX", kind: survival ? "skill" : "attribute", modifiers, tags: ["fireBuilding", "DX"], item } as any);
}

// ── traps (p. 58) ──

type TrapData = { title: string; lines: string[]; trap: { victimUuid: string; victim: string; st: number; name: string; freed: string } | null; landing: null };

async function springTrap(api: GWorldApi, item: any, actor: any): Promise<void> {
  const victim = targetedActor();
  if (!victim) return void ui.notifications?.warn(L("TrapTarget"));
  const st = survivalData(item).value;
  const thrust = api.rules.thrustDamage(st);
  const formula = api.rules.formatDiceAdds({ ...thrust, adds: thrust.adds + TRAP_DAMAGE_ADDS });
  const name = String(item.name ?? "");
  await api.roll.damage({ actor, item, label: F("TrapBlow", { name, victim: victim.name }), formula, damageType: "cr" as never, source: "springTrap" });
  const data: TrapData = {
    title: name,
    lines: [F("TrapCaught", { victim: victim.name, name, st })],
    trap: { victimUuid: String(victim.uuid ?? ""), victim: String(victim.name ?? ""), st, name, freed: "" },
    landing: null,
  };
  await api.chat.post(`${MODULE_ID}.${CARD}`, data, { actor: victim } as any);
}

async function breakFree(api: GWorldApi, message: any, data: TrapData): Promise<void> {
  const trap = data.trap;
  if (!trap || trap.freed) return;
  const victim: any = trap.victimUuid ? await fromUuid(trap.victimUuid) : null;
  if (!victim) return;
  const result: any = await api.roll.quickContest({
    label: F("BreakFreeLabel", { name: trap.name }),
    first: { actor: victim, base: Number(api.actors.attribute(victim, "ST")) || 10, note: "ST" },
    second: { actor: null, base: trap.st, note: trap.name },
    tags: ["springTrap", "breakFree"],
  } as any);
  if (result?.outcome === "first") await api.chat.update(message, { ...data, trap: { ...trap, freed: F("TrapFreed", { victim: victim.name }) } });
}

// ── foraging (pp. 55, 58) ──

/** Whether gear forages with Fishing (a kit or an outfit) rather than Survival (traps and snares). */
const fishes = (item: any): boolean => (item?.system?.forSkills ?? []).some((s: unknown) => /^fishing\b/i.test(String(s ?? "")));

/**
 * A foraging roll with fishing or trapping gear (p. 58; Foraging, Campaigns
 * p. 427): Fishing, with the kit or outfit the system already counts for it;
 * or the best Survival specialty, with the trap's or snare's own quality --
 * the book gives it to plain "Survival", which the system matches to no
 * specialty. Up to five a day, each an hour's work (p. 55).
 */
async function forage(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!actor) return;
  const day = Math.floor(worldNow() / 86400);
  const stored = actor.getFlag?.(MODULE_ID, FORAGE_FLAG);
  const attempt = foragingAttempt(stored && typeof stored === "object" ? { day: Number(stored.day), rolls: Number(stored.rolls) || 0 } : null, day);
  if (attempt === null) return void ui.notifications?.warn(F("ForageSpent", { rolls: FORAGING_ROLLS_A_DAY }));
  const per = Number(api.actors.attribute(actor, SURVIVAL_ATTRIBUTE as never)) || 10;
  const modifiers: Array<{ label: string; value: number }> = [];
  let skill: string;
  let base: number;
  if (fishes(item)) {
    skill = "Fishing";
    base = api.actors.skillLevel(actor, skill) ?? per - 4;
  } else {
    // Traps and snares are staked on land.
    const survival = bestSurvival(api, actor, true);
    skill = survival?.name ?? "Survival";
    base = survival?.level ?? per - 5;
    const quality = Number(api.rules.toolModifier(item.system?.equipmentQuality ?? "basic", item.system?.equipmentModifier)) || 0;
    if (quality) modifiers.push({ label: F("ForageGear", { name: item.name }), value: quality });
  }
  const outcome: any = await api.roll.success({ actor, base, label: F("ForageRoll", { name: item.name, attempt, rolls: FORAGING_ROLLS_A_DAY }), skill, kind: "skill", modifiers, tags: ["foraging", SURVIVAL_ATTRIBUTE], item } as any);
  if (!outcome || "refused" in outcome) return;
  await actor.setFlag(MODULE_ID, FORAGE_FLAG, { day, rolls: attempt });
  await say(actor, String(item.name ?? ""), [F(outcome.success ? "ForageFound" : "ForageNothing", { name: String(actor.name ?? ""), hours: FORAGING_HOURS, left: FORAGING_ROLLS_A_DAY - attempt })]);
}

// ── water (p. 59) ──

async function pumpWater(api: GWorldApi, item: any, actor: any): Promise<void> {
  // Pumping is exertion, charged through the fatigue chart (Campaigns p. 426).
  const spent = await api.actors.spendFatigue(actor, DESALINATOR.fp, { details: { rule: "desalinator", item: String(item.name ?? "") } });
  if (!spent) return;
  await say(actor, String(item.name ?? ""), [F(survivalData(item).large ? "PumpedQuart" : "PumpedCup", { name: actor.name, minutes: DESALINATOR.minutes, fp: DESALINATOR.fp })]);
}

async function useStill(api: GWorldApi, item: any, actor: any): Promise<void> {
  const survival = bestSurvival(api, actor);
  const per = Number(api.actors.attribute(actor, SURVIVAL_ATTRIBUTE as never)) || 10;
  const outcome: any = await api.roll.success({ actor, base: survival?.level ?? per - 5, label: F("StillLabel", { name: item.name }), skill: survival?.name ?? SURVIVAL_ATTRIBUTE, kind: survival ? "skill" : "attribute", tags: ["solarStill", SURVIVAL_ATTRIBUTE], item } as any);
  if (!outcome) return;
  await say(actor, String(item.name ?? ""), [L(outcome.success ? "StillWater" : "StillNothing")]);
}

// ── signals and the dye marker (pp. 58, 60) ──

/** Whether a dye marker this character released is still colouring the water. */
function dyeActive(actor: any): boolean {
  return Number(actor?.getFlag?.(MODULE_ID, DYE_FLAG)) > worldNow();
}

async function releaseDye(api: GWorldApi, item: any, actor: any): Promise<void> {
  if (!(await useOne(api, item))) return void ui.notifications?.warn(F("NoneLeft", { name: item.name }));
  await actor.setFlag(MODULE_ID, DYE_FLAG, worldNow() + DYE_MARKER_SECONDS);
  await say(actor, String(item.name ?? ""), [F("DyeReleased", { name: actor.name, bonus: SIGNAL_VISION, minutes: DYE_MARKER_SECONDS / 60 })]);
}

// ── parachutes (p. 61) ──

type JumpData = { title: string; lines: string[]; trap: null; landing: { formula: string; label: string; rolled: boolean } | null; canopy?: { landed: boolean } | null };

/** Whether a jumper is coming down under an open canopy, for Death from Above (p. 61). */
export function underCanopy(actor: any): boolean {
  return actor?.getFlag?.(MODULE_ID, CANOPY_FLAG) === true;
}

async function setCanopy(actor: any, open: boolean): Promise<void> {
  if (!actor?.isOwner) return;
  if (open) await actor.setFlag(MODULE_ID, CANOPY_FLAG, true);
  else if (underCanopy(actor)) await actor.unsetFlag(MODULE_ID, CANOPY_FLAG);
}

/** The character's Parachuting level: the skill, or the better of DX-4 and IQ-6. */
export function parachutingLevel(api: GWorldApi, actor: any): number {
  const known = api.actors.skillLevel(actor, "Parachuting");
  if (typeof known === "number") return known;
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const iq = Number(api.actors.attribute(actor, "IQ")) || 10;
  return Math.max(dx + PARACHUTING_DEFAULT, iq + PARACHUTING_IQ_DEFAULT);
}

/** The character's own weight, from the sheet's "weight" (the first number in it), or 0. */
function bodyWeight(actor: any): number {
  return Number(/\d+(?:\.\d+)?/.exec(String(actor?.system?.details?.weight ?? ""))?.[0]) || 0;
}

const damageFormula = (api: GWorldApi, d: { dice: number; modifier: number }) => api.rules.formatDiceAdds({ dice: d.dice, adds: d.modifier });

async function jump(api: GWorldApi, item: any, actor: any): Promise<void> {
  const data = survivalData(item);
  const carried = Number(api.actors.encumbrance(actor)?.carriedWeight) || 0;
  const autoDeploy = tlOf(item) >= AUTO_DEPLOY.tl;
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(F("JumpHint", { yards: data.chute.openingYards }))}</p>
      <div class="ifields">
        <label>${esc(L("PullHeight"))} <input type="number" name="height" value="${Math.max(data.chute.openingYards * 2, 100)}" min="0" step="10" style="width:80px"></label>
        <label>${esc(L("Load"))} <input type="number" name="load" value="${Math.round(bodyWeight(actor) + carried)}" min="0" step="5" style="width:80px"></label>
        <label>${esc(L("Wind"))} <input type="number" name="wind" value="0" min="0" step="1" style="width:60px"></label>
      </div>
      <div class="ichecks"><label class="icheck" data-tooltip="${esc(F(autoDeploy ? "NoPullAutoHint" : "NoPullHint", { yards: AUTO_DEPLOY.yards }))}"><input type="checkbox" name="noPull"> ${esc(L("NoPull"))}</label></div></div>`,
    ok: {
      label: L("Jump"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          height: Math.max(0, Number(form?.querySelector<HTMLInputElement>('[name="height"]')?.value) || 0),
          load: Math.max(0, Number(form?.querySelector<HTMLInputElement>('[name="load"]')?.value) || 0),
          wind: Math.max(0, Number(form?.querySelector<HTMLInputElement>('[name="wind"]')?.value) || 0),
          noPull: form?.querySelector<HTMLInputElement>('[name="noPull"]')?.checked === true,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer) return;
  // A jumper who pulls the ripcord rolls Parachuting to use the chute right (p. 61).
  if (!answer.noPull) await api.roll.success({ actor, base: parachutingLevel(api, actor), label: F("JumpRoll", { name: item.name }), skill: "Parachuting", kind: "skill", tags: ["parachuting", "DX"], item } as any);

  const name = String(actor?.name ?? "");
  const hp = Number(actor?.system?.hp?.max) || Number(api.actors.attribute(actor, "HT")) || 10;
  const rated = ratedWeight(data.chute, tlOf(item));
  const speed = landingSpeed(data.chute.descent, rated, answer.load);
  // Nobody pulls: the barometric device opens it from TL8, or nothing does (p. 61).
  const pulled = pullHeight(answer.height, !answer.noPull, autoDeploy);
  const outcome = jumpOutcome(pulled, data.chute.openingYards, (yards) => api.rules.fallingVelocity(yards));
  const lines: string[] = [];
  let landing: JumpData["landing"] = null;
  let canopy = false;
  if (answer.noPull) lines.push(autoDeploy && pulled > 0 ? F("AutoDeploys", { yards: pulled }) : L("NeverOpens"));
  if (answer.noPull && pulled <= 0) {
    const fall = api.rules.fallingDamage({ hitPoints: hp, yardsFallen: answer.height });
    landing = { formula: damageFormula(api, fall.damage), label: F("FallLanding", { name, velocity: fall.velocity }), rolled: false };
  } else if (speed === null) {
    // Past 120% of its rating the chute simply fails: the whole fall.
    const fall = api.rules.fallingDamage({ hitPoints: hp, yardsFallen: answer.height });
    lines.push(F("ChuteFails", { load: answer.load, rated }));
    landing = { formula: damageFormula(api, fall.damage), label: F("FallLanding", { name, velocity: fall.velocity }), rolled: false };
  } else if (!outcome.opens) {
    const hit = api.rules.slamDamage(hp * 2, outcome.velocity);
    lines.push(F("HitFirst", { yards: data.chute.openingYards, velocity: outcome.velocity }));
    landing = { formula: damageFormula(api, hit), label: F("FallLanding", { name, velocity: outcome.velocity }), rolled: false };
  } else {
    canopy = true;
    lines.push(F("Opens", { yards: data.chute.openingYards }));
    if (data.chute.descent > 0) {
      const hit = api.rules.slamDamage(hp * 2, speed);
      lines.push(F(rated <= 0 ? "DescentUnrated" : answer.load > rated ? "DescentOver" : "Descent", { speed, load: answer.load, rated }));
      // It drifts with the wind all the way down (p. 61).
      const seconds = descentSeconds(pulled, data.chute.openingYards, speed);
      const drift = driftYards(seconds, answer.wind);
      if (drift > 0) lines.push(F("Drift", { yards: drift, seconds: Math.round(seconds), wind: answer.wind }));
      landing = { formula: damageFormula(api, hit), label: F("HardLanding", { name, velocity: speed }), rolled: false };
    } else lines.push(F("Flies", { rated, move: RAM_AIR_GLIDE.move, tailwind: RAM_AIR_GLIDE.tailwind }));
  }
  // Coming down under the canopy until the landing: when Death from Above is possible (p. 61).
  await setCanopy(actor, canopy);
  await api.chat.post(`${MODULE_ID}.${CARD}`, { title: String(item.name ?? ""), lines, trap: null, landing, canopy: canopy ? { landed: false } : null } satisfies JumpData, { actor } as any);

  // The earliest chutes swing about badly (p. 61).
  if (data.nausea !== null) {
    const ht = Number(api.actors.attribute(actor, "HT")) || 10;
    const sick: any = await api.roll.success({ actor, base: ht, label: L("NauseaRoll"), skill: "HT", kind: "attribute", modifiers: [{ label: F("EarlyChute", { name: item.name }), value: data.nausea }], tags: ["parachuteNausea", "HT"] } as any);
    if (sick && !sick.success) await api.actors.applyCondition(actor, { key: "nauseated" } as any);
  }
}

// ── snacks (p. 35) ──

/**
 * A snack or sports drink: a decent meal on the next rest (p. 35); or, at the
 * GM's option, on the move -- 1 FP back now, and 2 FP gone two hours later.
 */
async function eat(api: GWorldApi, item: any, actor: any): Promise<void> {
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(F("EatHint", { fp: SNACK_ON_THE_MOVE.fp, crash: SNACK_ON_THE_MOVE.crashFp, hours: SNACK_ON_THE_MOVE.crashHours }))}</p>
      <div class="ichecks"><label class="icheck"><input type="checkbox" name="moving"> ${esc(L("OnTheMove"))}</label></div></div>`,
    ok: {
      label: L("EatAction"),
      callback: (_event: Event, button: HTMLElement) => ({ moving: button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="moving"]')?.checked === true }),
    },
    rejectClose: false,
  });
  if (!answer) return;
  if (!(await useOne(api, item))) return void ui.notifications?.warn(F("NoneLeft", { name: item.name }));
  const data = survivalData(item);
  const lines: string[] = [];
  if (answer.moving) {
    const restored: any = await api.actors.restoreFatigue(actor, SNACK_ON_THE_MOVE.fp, { reason: String(item.name ?? "") });
    const pending = crashesOf(actor);
    await actor.setFlag(MODULE_ID, CRASH_FLAG, [...pending, { at: worldNow() + SNACK_ON_THE_MOVE.crashHours * 3600, fp: SNACK_ON_THE_MOVE.crashFp, item: String(item.name ?? "") }]);
    lines.push(F("SnackOnTheMove", { name: actor.name, item: item.name, fp: restored ? restored.to - restored.from : 0, crash: SNACK_ON_THE_MOVE.crashFp, hours: SNACK_ON_THE_MOVE.crashHours }));
  } else lines.push(F("SnackEaten", { name: actor.name, item: item.name, fp: SNACK_REST_FP }));
  if (data.kind === "sportsDrink") lines.push(L("DrinkWater"));
  await say(actor, String(item.name ?? ""), lines);
}

type Crash = { at: number; fp: number; item: string };

function crashesOf(actor: any): Crash[] {
  const stored = actor?.getFlag?.(MODULE_ID, CRASH_FLAG);
  return Array.isArray(stored) ? stored.filter((c: any) => Number.isFinite(Number(c?.at))).map((c: any) => ({ at: Number(c.at), fp: Math.max(0, Math.trunc(Number(c.fp) || 0)), item: String(c.item ?? "") })) : [];
}

/** The characters whose crashes are being settled now, by uuid: a second tick before the flag is written skips them. */
const settling = new Set<string>();

/** The FP a snack eaten on the move takes back when its two hours are up: not exertion, so Very Fit doesn't halve it. */
async function settleCrashes(api: GWorldApi, actor: any): Promise<void> {
  const key = String(actor?.uuid ?? "");
  if (!key || settling.has(key)) return;
  settling.add(key);
  try {
    const { due, later } = dueCrashes(crashesOf(actor), worldNow());
    if (!due.length) return;
    if (later.length) await actor.setFlag(MODULE_ID, CRASH_FLAG, later);
    else await actor.unsetFlag(MODULE_ID, CRASH_FLAG);
    for (const crash of due) {
      if (crash.fp > 0) await api.actors.spendFatigue(actor, crash.fp, { reason: "module", exertion: false, details: { rule: "snackCrash", item: crash.item } } as any);
      await say(actor, crash.item, [F("SnackCrash", { name: String(actor.name ?? ""), fp: crash.fp, item: crash.item })]);
    }
  } finally {
    settling.delete(key);
  }
}

// ── the sheets ──

/** The maritime gear with no roll of its own, and its sheet note (p. 60; scuba's air is the breathing gear's, pp. 72-74). */
const MARITIME_NOTES: ReadonlyArray<[RegExp, string]> = [
  [/^snorkel$/i, "snorkel"],
  [/^life raft$/i, "raft"],
  [/^dive cage$/i, "cage"],
  [/^emergency beacon$/i, "beacon"],
  [/^scuba gear$/i, "scuba"],
];

function itemLines(item: any, on: SurvivalSwitches): string[] {
  const data = survivalData(item);
  const lines: string[] = [];
  const tl = tlOf(item);
  if (on.survival()) {
    switch (data.kind) {
      case "shelter": {
        const modifier = shelterModifier(data.value, data.valueAtTl8, tl);
        lines.push(F("ShelterItem", { modifier: modifier >= 0 ? `+${modifier}` : modifier, none: NO_SHELTER }));
        break;
      }
      case "fireStarter":
        lines.push(F("FireItem", { least: FIRE_STARTER_BONUS.least, most: FIRE_STARTER_BONUS.most }));
        break;
      case "fishing":
        lines.push(F("ForagingItem", { rolls: FORAGING_ROLLS_A_DAY }));
        break;
      case "trap":
        lines.push(F("TrapItem", { st: data.value, adds: TRAP_DAMAGE_ADDS }), F("ForagingItem", { rolls: FORAGING_ROLLS_A_DAY }));
        break;
      case "survivalKit":
        lines.push(L("KitItem"));
        break;
      case "waterFilter":
        lines.push(F("FilterItem", { bonus: waterFilterBonus(tl) }));
        break;
      case "desalinator":
        lines.push(F(data.large ? "DesalinatorItemLarge" : "DesalinatorItem", { minutes: DESALINATOR.minutes, fp: DESALINATOR.fp }));
        break;
      case "solarStill":
        lines.push(L("StillItem"));
        break;
      case "signal":
        lines.push(F("SignalItem", { bonus: SIGNAL_VISION }));
        if (data.value > 0) lines.push(F("SignalRangeItem", { range: signalRange(data.value) }));
        break;
      case "whistle":
        lines.push(F("WhistleItem", { yards: WHISTLE_HEARD_AT }));
        break;
      default:
    }
  }
  if (on.maritime()) {
    if (data.kind === "lifeJacket") {
      lines.push(F("JacketItem", { drowning: LIFE_JACKET.drowning, race: LIFE_JACKET.race }));
      if (tl > 0 && tl <= CORK_JACKET.tl) lines.push(F("CorkItem", { penalty: CORK_JACKET.entering }));
    }
    if (data.kind === "swimFins") lines.push(F("FinsItem", { move: FINS_LAND_MOVE }));
    if (data.kind === "dyeMarker") lines.push(F("DyeItem", { bonus: SIGNAL_VISION, minutes: DYE_MARKER_SECONDS / 60 }));
    // The rest of the maritime gear prints no roll: what it is for, on the sheet (p. 60).
    const maritime = MARITIME_NOTES.find(([pattern]) => pattern.test(String(item?.name ?? "").trim()));
    if (maritime) lines.push(L(`Maritime.${maritime[1]}`));
  }
  if (on.parachuting()) {
    if (data.kind === "parachute") {
      const rated = ratedWeight(data.chute, tl);
      lines.push(F(rated > 0 ? "ChuteItem" : "ChuteItemUnrated", { rated, yards: data.chute.openingYards, don: DON_SECONDS, doff: DOFF_SECONDS }));
      if (data.chute.descent > 0) lines.push(F("ChuteDescentItem", { speed: data.chute.descent }));
      if (data.nausea !== null) lines.push(F("NauseaItem", { modifier: data.nausea }));
      if (tl >= AUTO_DEPLOY.tl) lines.push(F("AutoDeployItem", { yards: AUTO_DEPLOY.yards }));
      if (data.chute.descent <= 0) lines.push(F("GlideItem", { move: RAM_AIR_GLIDE.move, tailwind: RAM_AIR_GLIDE.tailwind }));
      if (data.reserve) lines.push(F("ReserveItem", { cost: RESERVE_CHUTE.cost, weight: RESERVE_CHUTE.weight }));
    }
    if (data.kind === "cargoChute") lines.push(F("CargoChuteItem", { rated: data.chute.maxLbs, speed: data.chute.descent }));
    const base = String(item?.name ?? "").trim();
    if (/^guided parachute delivery$/i.test(base)) lines.push(F("GuidedItem", { low: GUIDED_DELIVERY.moveLow, high: GUIDED_DELIVERY.moveHigh, tons: GUIDED_DELIVERY.tons }));
    if (/^infiltration pod$/i.test(base)) lines.push(F("PodItem", { lbs: INFILTRATION_POD_LBS }));
  }
  if (on.rations()) {
    if (data.kind === "snack") lines.push(F("SnackItem", { fp: SNACK_REST_FP }));
    if (data.kind === "sportsDrink") lines.push(F("SportsDrinkItem", { fp: SNACK_REST_FP }));
  }
  return lines;
}

function itemContext(item: any, on: SurvivalSwitches): Record<string, unknown> {
  const data = survivalData(item);
  const kit = on.survival() && data.kind === "survivalKit";
  return {
    lines: itemLines(item, on),
    kit: kit ? { similar: data.similar.join(", ") } : null,
    desalinator: on.survival() && data.kind === "desalinator" ? { large: data.large } : null,
    reserve: on.parachuting() && data.kind === "parachute" ? { checked: data.reserve } : null,
    editable: item.isOwner,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement>("[data-gcc-ht-survival]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtSurvival);
      await item.update({ [`${path}.${key}`]: input.type === "checkbox" ? input.checked : input.value });
    });
  });
}

function campContext(api: GWorldApi, actor: any): Record<string, unknown> {
  // What the cold roll would take were the character camping out, with or without the box ticked.
  const { value, gear } = shelterLine(shelterGear(api, actor));
  const label = gear ? F("ShelterLine", { name: gear.name }) : L("NoShelterLine");
  return { camping: isCamping(actor), line: `${label}: ${value >= 0 ? "+" : ""}${value}` };
}

function campListeners(element: HTMLElement, actor: any): void {
  element.querySelector<HTMLInputElement>("[data-gcc-ht-camping]")?.addEventListener("change", async (event) => {
    await actor.setFlag(MODULE_ID, CAMPING_FLAG, (event.currentTarget as HTMLInputElement).checked);
  });
}

export function readySurvival(api: GWorldApi, on: SurvivalSwitches): void {
  const any = () => on.survival() || on.maritime() || on.parachuting() || on.rations();

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-survival-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-survival-item.hbs`,
    visible: (item) => item?.type === "equipment" && any() && itemLines(item, on).length > 0,
    context: (item) => itemContext(item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-survival-camp",
    sheet: "character",
    tab: "gear",
    template: `modules/${MODULE_ID}/templates/ht-survival-camp.hbs`,
    visible: () => on.survival(),
    context: (actor) => campContext(api, actor),
    listeners: (element, actor) => campListeners(element, actor),
  });

  // The large hand-pumped desalinator: three times the cost and weight (p. 59).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-survival-price",
    types: ["equipment"],
    apply: (item, price) => {
      const data = survivalData(item);
      if (!on.survival() || data.kind !== "desalinator" || !data.large) return null;
      return { cost: price.cost * DESALINATOR.largeMultiplier, weight: Math.round(price.weight * DESALINATOR.largeMultiplier * 1000) / 1000, label: L("Large") };
    },
  });

  // A reserve chute: +$250, 15 lbs. (p. 61).
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-reserve-chute",
    types: ["equipment"],
    apply: (item, price) => {
      const data = survivalData(item);
      if (!on.parachuting() || data.kind !== "parachute" || !data.reserve) return null;
      return { cost: price.cost + RESERVE_CHUTE.cost, weight: Math.round((price.weight + RESERVE_CHUTE.weight) * 1000) / 1000, label: L("Reserve") };
    },
  });

  // ── the rolls the gear changes ──
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    const tags: string[] = context?.tags ?? [];
    if (!actor || !Array.isArray(context.modifiers)) return;

    // Shelter and sleeping gear against the cold (p. 56).
    if (on.survival() && tags.includes("exposure") && tags.includes("cold")) {
      const line = campingLine(api, actor);
      if (line) context.modifiers.push(line);
    }

    // A water filter against what is in the water (p. 59), or a
    // charcoal-filtered canteen's +2 (p. 53): a disease caught by drinking,
    // as the Illness dialog's digestive vector gives it (API 1.104.0).
    if (on.survival() && tags.includes("contagion") && context.disease?.vector === "digestive") {
      const filters = [
        ...gearOf(actor, "waterFilter", true).map((item) => ({ item, bonus: waterFilterBonus(tlOf(item)) })),
        ...[...(actor.items ?? [])].filter((item: any) => isCarried(item) && CHARCOAL_CANTEEN.test(String(item.name ?? "").trim())).map((item: any) => ({ item, bonus: CHARCOAL_CANTEEN_BONUS })),
      ].sort((a, b) => b.bonus - a.bonus);
      const best = filters[0];
      if (best && best.bonus) context.modifiers.push({ label: F("FilterLine", { name: best.item.name }), value: best.bonus });
    }

    // A life jacket on Swimming rolls: +6 against drowning, -3 in a race (p. 59).
    if (on.maritime() && api.rules.toolSkillKey(String(context.skill ?? "")) === "swimming") {
      const jacket = gearOf(actor, "lifeJacket", true)[0];
      if (jacket) {
        const race = context.kind === "contest" || tags.includes("contest");
        context.modifiers.push({ label: F(race ? "JacketRace" : "JacketLine", { name: jacket.name }), value: race ? LIFE_JACKET.race : LIFE_JACKET.drowning });
      }
    }
  });

  // A kit for another environment (p. 58), where none is carried for this one.
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    if (!on.survival() || !api.registry.isRuleOn("equipmentModifiers")) return;
    const value = survivalKitEquipment(api, context?.actor, String(context?.name ?? ""));
    if (value === null) return;
    const line = (context.lines ?? []).find((l: any) => l?.key === "tools");
    if (line) {
      line.value = value;
      line.reason = L("WrongKitReason");
    } else context.lines?.push?.({ key: "tools", label: L("WrongKit"), value, source: MODULE_ID });
  });

  // A rescuer looking for a signaller: a signal in use, or the dye in the water (pp. 58, 60).
  Hooks.on(api.combat.hooks.detectionModifiers, (context: any) => {
    const subject = context?.subject;
    if (!subject || context.sense !== "vision" || !Array.isArray(context.modifiers)) return;
    // A signal counts only as far as it can be seen (p. 58), where the map gives the distance.
    const yards = yardsBetween(context.observer, subject);
    const signal = on.survival() ? gearOf(subject, "signal", true).find((item) => signalSeen(survivalData(item).value, yards)) : null;
    if (signal) context.modifiers.push({ label: F("SignalLine", { name: signal.name }), value: SIGNAL_VISION });
    if (on.maritime() && dyeActive(subject)) context.modifiers.push({ label: L("DyeLine"), value: SIGNAL_VISION });
  });

  // Swim fins: Enhanced Move 0.5 (Water) in the water, Move 2 on land (p. 60).
  Hooks.on(api.data.hooks.moveModifiers, (context: any) => {
    if (!on.maritime() || !Array.isArray(context?.lines)) return;
    const fins = gearOf(context.actor, "swimFins", true)[0];
    if (!fins) return;
    if (context.medium === "water") {
      context.lines.push({ label: F("FinsWaterLine", { name: fins.name }), multiplier: FINS_WATER_MULTIPLIER, medium: "water" });
      return;
    }
    if (context.medium && context.medium !== "ground") return;
    const value = finsMoveLine(Number(context.move) || 0);
    if (value) context.lines.push({ label: F("FinsLine", { name: fins.name }), value });
  });

  // Death from Above (p. 61).
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: DEATH_FROM_ABOVE,
    label: L("DeathFromAbove"),
    attack: "ranged",
    available: (context) => on.parachuting() && gearOf(context.actor, "parachute").length > 0,
    // Coming down under an open canopy, on a Move and Attack (p. 61).
    refuse: (context) => (String(context.maneuver ?? "") === "moveAndAttack" && underCanopy(context.actor) ? null : L("DeathFromAboveRefusal")),
    apply: (context) => {
      const value = deathFromAboveLine(Number(context.effectiveSkill) || 0, parachutingLevel(api, context.actor));
      return { modifiers: value ? [{ label: L("DeathFromAboveLine"), value }] : [], notes: [L("DeathFromAboveNote")] };
    },
  });

  // ── row actions ──
  const action = (key: string, label: string, icon: string, visible: (item: any) => boolean, run: (item: any, actor: any) => Promise<void>) =>
    api.sheets.registerRowAction({ module: MODULE_ID, key, itemTypes: ["equipment"], label: L(label), icon, visible, run: (item, actor) => { void run(item, actor); } });
  const kindIs = (kind: SurvivalKindKey) => (item: any) => survivalData(item).kind === kind;

  action("ht-fire", "FireAction", "fa-solid fa-fire", (item) => on.survival() && kindIs("fireStarter")(item), (item, actor) => buildFire(api, item, actor));
  action("ht-trap", "TrapAction", "fa-solid fa-bear-trap", (item) => on.survival() && kindIs("trap")(item) && survivalData(item).value > 0, (item, actor) => springTrap(api, item, actor));
  action("ht-desalinate", "PumpAction", "fa-solid fa-droplet", (item) => on.survival() && kindIs("desalinator")(item), (item, actor) => pumpWater(api, item, actor));
  action("ht-solar-still", "StillAction", "fa-solid fa-sun", (item) => on.survival() && kindIs("solarStill")(item), (item, actor) => useStill(api, item, actor));
  action("ht-whistle", "WhistleAction", "fa-solid fa-ear-listen", (item) => on.survival() && kindIs("whistle")(item), async (item, actor) => hearSound(api, actor, { name: String(item.name ?? ""), heardAt: WHISTLE_HEARD_AT }));
  action("ht-dye-marker", "DyeAction", "fa-solid fa-fill-drip", (item) => on.maritime() && kindIs("dyeMarker")(item), (item, actor) => releaseDye(api, item, actor));
  action("ht-jump", "JumpAction", "fa-solid fa-parachute-box", (item) => on.parachuting() && kindIs("parachute")(item), (item, actor) => jump(api, item, actor));
  action("ht-eat", "EatAction", "fa-solid fa-utensils", (item) => on.rations() && (kindIs("snack")(item) || kindIs("sportsDrink")(item)), (item, actor) => eat(api, item, actor));
  action("ht-forage", "ForageAction", "fa-solid fa-fish", (item) => on.survival() && (kindIs("fishing")(item) || kindIs("trap")(item)), (item, actor) => forage(api, item, actor));

  // A snack's crash, two hours on: the active GM's client charges it as world time passes (p. 35).
  const isActiveGm = () => (game as any).user?.isGM === true && (game as any).users?.activeGM?.id === (game as any).user?.id;
  Hooks.on("updateWorldTime", () => {
    if (!on.rations() || !isActiveGm()) return;
    const unlinked = [...((game as any).scenes ?? [])].flatMap((scene: any) => [...(scene.tokens ?? [])].filter((t: any) => !t.actorLink && t.actor).map((t: any) => t.actor));
    for (const actor of [...((game as any).actors ?? []), ...unlinked]) if (crashesOf(actor).length) void settleCrashes(api, actor);
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ht-survival-card.hbs`,
    actions: {
      breakFree: async ({ message, data }: any) => { if (on.survival()) await breakFree(api, message, data as TrapData); },
      landing: async ({ message, data, actor }: any) => {
        const landing = (data as JumpData).landing;
        if (!on.parachuting() || !landing || landing.rolled) return;
        await api.roll.damage({ actor, label: landing.label, formula: landing.formula, damageType: "cr" as never, source: "parachuteLanding" });
        await setCanopy(actor, false);
        await api.chat.update(message, { ...data, landing: { ...landing, rolled: true }, ...(data.canopy ? { canopy: { landed: true } } : {}) });
      },
      // Down without a hard landing to roll: off the canopy (p. 61).
      landed: async ({ message, data, actor }: any) => {
        if (!on.parachuting() || !data?.canopy || data.canopy.landed) return;
        await setCanopy(actor, false);
        await api.chat.update(message, { ...data, canopy: { landed: true }, ...(data.landing ? { landing: { ...data.landing, rolled: true } } : {}) });
      },
    },
  } as any);
}
