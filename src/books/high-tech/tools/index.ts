/**
 * High-Tech's tools, forced entry and household hazards (pp. 24-33, 50),
 * registered with the system through the add-on API under four switches. The
 * rules are in `rules.ts`; what each record is (a kit, a tool that works at
 * so much a second, a chainsaw, a hazard) is its `tool` data, written on the
 * records from book.json.
 *
 *   - **Tool kits (toolKits):** a portable kit or workshop carried for
 *     another specialty of a skill, and a workshop for a close or distant
 *     craft, as a tool of the skill at that figure (`data.registerToolGrade`,
 *     so the system weighs its TL and picks the best tool); the repair skills marked as
 *     needing a kit, for the system's no-equipment line; light crafts' kits and large
 *     vehicles' repriced; a lab's set-up time and a machine shop's output
 *     shown on the item.
 *   - **Forced-entry tools (forcedEntryTools):** a derived attack row for
 *     each tool that works at so much a second (or a bite, or a blow), with
 *     Forced Entry; the Ready maneuvers the hand ram, door opener and
 *     spreader take, counted by a row action and required before the attack;
 *     the glass cutter's roll and the duct-tape restraint as row actions. A
 *     fire extinguisher's bursts, each a roll to put out the fire on a
 *     targeted character (a flamethrower's fuel taken off; the system's
 *     `burning` left for the GM to take off, as no call ends it; never
 *     thermite or napalm), counted on the item; a fire shelter, got
 *     into and out of by a row action, DR 10 against burning inside it.
 *   - **Chainsaws (chainsaws):** Forced Entry rows for rescue work, one at
 *     the (0.5) divisor for hard material; a blow from it that fails to
 *     penetrate (or the row action, for a door or a car) rolls the stall or
 *     the snap, which refuses the saw's attacks until it is restarted or
 *     repaired; the carbide chain, which costs double and ends both; and the
 *     nail gun's -4.
 *     A torch's burn time and the doorbuster's strips are counted as the
 *     tool is used, a second or a shot at a time, and the tool refuses to
 *     work once they run out until it is refilled; a jack, lift bags, a
 *     hoist, a spreader or a come-along tells whether it manages a load. A
 *     firefighter alert, set off or on a wearer out cold, is +4 to Hearing
 *     to find him; a Stokes litter dropped runs its occupant's fall with DR 5.
 *   - **Household hazards (householdHazards):** a row action on a propane
 *     cylinder or an appliance that rolls what it does; a blow struck at a
 *     cylinder, which ruptures it through DR 6 with anything but crushing and
 *     sets it off near a flame; and lead as a poison the sheet doses, whose
 *     worse symptoms are named once the victim is past half their HP, and
 *     intensifying ones after a second failed roll.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  CARBIDE_CHAIN_COST,
  GLASS_CUTTER_REALISTIC,
  GLASS_CUTTER_WOUND,
  HARD_MATERIAL_DIVISOR,
  HAZARD_KINDS,
  KIT_SIZES,
  LEAD_POISON,
  NAIL_GUN_PENALTY,
  PROPANE_DR,
  PROPANE_FRAGMENTS,
  SNAPPED_CHAIN,
  VEHICLE_TONS,
  WORK_MATERIALS,
  breakFreeRoll,
  chainsawMishap,
  extinguisherOf,
  extinguishes,
  isFireShelter,
  FIRE_SHELTER_DR,
  FIREFIGHTER_ALERT,
  STOKES_LITTER,
  alertSounding,
  diceRange,
  glassCutterOutcome,
  kitFor,
  kitPriceMultipliers,
  leadStage,
  leadSymptomsWorsen,
  liftOutcome,
  listOf,
  nailGunLevel,
  needsKit,
  propaneRuptures,
  readiesNeeded,
  snapStrikesWielder,
  supplyLeft,
  SUPPLY_KINDS,
  SUPPLY_PER_USE,
  SUPPLY_REFILLS,
  TON_LBS,
  workDamage,
  type CarriedKit,
  type HazardKind,
  type KitSize,
  type Lifting,
  type Supply,
  type Work,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Tools.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Tools.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "tool";
const TAPE_CARD = "ht-duct-tape";
const LEAD = "leadPoisoning";
const WORK_MODE = "ht-tool-work";
const RESCUE_MODE = "ht-chainsaw-rescue";
const HARD_MODE = "ht-chainsaw-hard";
/** The bursts spent from a fire extinguisher; and a fire shelter someone is inside. */
const BURSTS_FLAG = "htBurstsUsed";
const SHELTER_FLAG = "htShelterInside";
/** The burn time or shots used from a tool's supply since it was last refilled. */
const SUPPLY_FLAG = "htSupplyUsed";
/** A firefighter alert set off by hand, its wearer trapped. */
const ALERT_FLAG = "htAlertSounding";
/** Lead poisoning's course on its victim: the failed resistance rolls, and whether half the HP is gone. */
const LEAD_FLAG = "htLeadCourse";
/**
 * The fire a burst puts out that this module keeps: a flamethrower's fuel (pp. 178, 29). The
 * system's own `burning` has no call to end it, so the GM takes that off; thermite and napalm burn on.
 */
const PUT_OUT = [`${MODULE_ID}.ht-flame-burning`];
const BURNING_ON = [`${MODULE_ID}.ht-thermite-burning`, `${MODULE_ID}.ht-napalm-burning`];

/** What a record is beyond a kit, a working tool or a hazard: the tools with a rule of their own. */
export const TOOL_USES = ["", "chainsaw", "nailGun", "glassCutter", "ductTape"] as const;
export type ToolUse = (typeof TOOL_USES)[number];

export interface ToolSwitches {
  kits: () => boolean;
  forcedEntry: () => boolean;
  chainsaws: () => boolean;
  hazards: () => boolean;
}

/** What this module keeps on a tool. */
export interface ToolData {
  kit: KitSize;
  lightCraft: boolean;
  /** The largest vehicle a mechanic's or armourer's kit or shop repairs, in tons; 0 for the usual 10. */
  vehicleTons: number;
  closeCrafts: string[];
  distantCrafts: string[];
  /** A portable lab's set-up (or packing) time (p. 50). */
  setupSeconds: number;
  /** A computer-aided workshop's output (p. 29). */
  partsPerHour: number;
  use: ToolUse;
  carbide: boolean;
  readies: number;
  readiesWaivedAtSt: number;
  work: Work | null;
  hazard: { kind: HazardKind; damage: string; upTo: string; perSecond: boolean } | null;
  /** A torch's burn time or the doorbuster's strips (pp. 27, 30), or null. */
  supply: Supply | null;
  /** What a jack, lift bags, a hoist, a spreader or a come-along lifts (pp. 25, 29-30), or null. */
  lift: Lifting | null;
}

/** Registers the fields this module keeps on a tool. */
export function initTools(): void {
  const f = foundry.data.fields as any;
  const whole = (max: number, initial = 0) => new f.NumberField({ required: true, nullable: false, integer: true, initial, min: 0, max });
  const text = () => new f.StringField({ required: true, nullable: false, blank: true, initial: "" });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      kit: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...KIT_SIZES] }),
      lightCraft: new f.BooleanField({ initial: false }),
      vehicleTons: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      closeCrafts: text(),
      distantCrafts: text(),
      setupSeconds: whole(86400),
      partsPerHour: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      use: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...TOOL_USES] }),
      carbide: new f.BooleanField({ initial: false }),
      readies: whole(20),
      readiesWaivedAtSt: whole(100),
      work: new f.SchemaField({
        damage: text(),
        type: text(),
        divisor: new f.NumberField({ required: true, nullable: false, initial: 1, min: 0 }),
        every: whole(3600, 1),
        multiplier: new f.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1, max: 100 }),
        against: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...WORK_MATERIALS] }),
        stRoll: new f.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        carbideBonus: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      }),
      hazard: new f.SchemaField({
        kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...HAZARD_KINDS] }),
        damage: text(),
        upTo: text(),
        perSecond: new f.BooleanField({ initial: false }),
      }),
      supply: new f.SchemaField({
        kind: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SUPPLY_KINDS] }),
        amount: whole(86400),
        refill: new f.StringField({ required: true, nullable: false, blank: false, initial: "refill", choices: [...SUPPLY_REFILLS] }),
      }),
      lift: new f.SchemaField({
        lbs: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
        st: whole(1000),
      }),
    }),
  });
}

/** A tool's data, with nothing missing. */
export function toolData(item: any): ToolData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  const w = d.work ?? {};
  const h = d.hazard ?? {};
  const sp = d.supply ?? {};
  const lf = d.lift ?? {};
  const supplyKind = SUPPLY_KINDS.includes(sp.kind) ? sp.kind : "";
  const lift: Lifting = { lbs: Math.max(0, Number(lf.lbs) || 0), st: count(lf.st) };
  const damage = String(w.damage ?? "").trim();
  const hazardKind: HazardKind = HAZARD_KINDS.includes(h.kind) ? h.kind : "";
  return {
    kit: KIT_SIZES.includes(d.kit) ? d.kit : "",
    lightCraft: d.lightCraft === true,
    vehicleTons: Math.max(0, Number(d.vehicleTons) || 0),
    closeCrafts: listOf(d.closeCrafts),
    distantCrafts: listOf(d.distantCrafts),
    setupSeconds: count(d.setupSeconds),
    partsPerHour: Math.max(0, Number(d.partsPerHour) || 0),
    use: TOOL_USES.includes(d.use) ? d.use : "",
    carbide: d.carbide === true,
    readies: count(d.readies),
    readiesWaivedAtSt: count(d.readiesWaivedAtSt),
    work: damage
      ? {
          damage,
          type: String(w.type ?? "") || "cr",
          divisor: Number(w.divisor) > 0 ? Number(w.divisor) : 1,
          every: w.every === undefined ? 1 : count(w.every),
          multiplier: Math.max(1, count(w.multiplier)),
          against: WORK_MATERIALS.includes(w.against) ? w.against : "",
          stRoll: typeof w.stRoll === "number" ? Math.trunc(w.stRoll) : null,
          carbideBonus: Math.trunc(Number(w.carbideBonus) || 0),
        }
      : null,
    hazard: hazardKind ? { kind: hazardKind, damage: String(h.damage ?? "").trim(), upTo: String(h.upTo ?? "").trim(), perSecond: h.perSecond === true } : null,
    supply: supplyKind && count(sp.amount) > 0
      ? { kind: supplyKind, amount: count(sp.amount), refill: SUPPLY_REFILLS.includes(sp.refill) ? sp.refill : "refill" }
      : null,
    lift: lift.lbs > 0 || lift.st > 0 ? lift : null,
  };
}

/** What is used of a tool's supply since it was last refilled. */
const supplyUsed = (item: any): number => Math.max(0, Math.floor(Number(item?.getFlag?.(MODULE_ID, SUPPLY_FLAG)) || 0));

const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const meleeModes = (item: any): any[] => item?.system?.meleeModes ?? [];

/** Whether an item is a chainsaw whose chain is the ordinary one: the kind with the hard-material rules (p. 27). */
export function ordinaryChainsaw(item: any): boolean {
  const data = toolData(item);
  return data.use === "chainsaw" && !data.carbide;
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

// ── tool kits (p. 24) ──

/** A kit as the wrong-specialty rule reads it, or null for gear that isn't one. */
function kitOf(item: any): CarriedKit | null {
  if (item?.type !== "equipment") return null;
  const data = toolData(item);
  if (!data.kit) return null;
  return { size: data.kit, skills: (item.system?.forSkills ?? []).map(String), close: data.closeCrafts, distant: data.distantCrafts };
}

/**
 * What a kit made for something else is worth to a skill (p. 24), as a
 * stated tool modifier for the system's grader, or null where the rule has
 * nothing to say: the kit's own skill, or one it has nothing to do with.
 */
export function wrongKitGrade(api: GWorldApi, item: any, skill: string): { modifier: number } | null {
  const kit = kitOf(item);
  if (!kit || !skill) return null;
  const value = kitFor(kit, skill, (name) => api.rules.toolSkillKey(name));
  return value === null ? null : { modifier: value };
}

// ── the chainsaw's state (p. 27) ──

type SawState = "" | "stalled" | "snapped";

function sawState(api: GWorldApi, item: any): SawState {
  const state = (api.combat.getWeaponState(item, MODULE_ID) as any)?.chainsaw;
  return state === "stalled" || state === "snapped" ? state : "";
}

/** Rolls what a chainsaw does on a blow that didn't get through, and puts it out of action as it says. */
export async function chainsawFails(api: GWorldApi, item: any, actor: any): Promise<void> {
  const roll = new Roll("1d6");
  await roll.evaluate();
  const mishap = chainsawMishap(Number(roll.total));
  const name = String(item?.name ?? "");
  if (mishap === "none") return void say(actor, name, [F("MishapNone", { roll: roll.total })], [roll]);
  await api.combat.setWeaponState(item, MODULE_ID, { chainsaw: mishap === "stall" ? "stalled" : "snapped" });
  if (mishap === "stall") return void say(actor, name, [F("MishapStall", { roll: roll.total })], [roll]);
  const lashes = snapStrikesWielder(tlOf(item));
  await say(actor, name, [F(lashes ? "MishapSnapLashes" : "MishapSnapBreaks", { roll: roll.total })], [roll]);
  if (lashes) {
    await api.roll.damage({ actor, item, label: F("SnappedChain", { name: String(actor?.name ?? "") }), formula: SNAPPED_CHAIN.damage, damageType: SNAPPED_CHAIN.type as never, source: "snappedChain" });
  }
}

// ── the glass cutter and duct tape (p. 26) ──

async function cutGlass(api: GWorldApi, item: any, actor: any): Promise<void> {
  const cinematic: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(L("GlassHint"))}</p>
      <div class="ichecks"><label class="icheck"><input type="checkbox" name="cinematic"> ${esc(L("GlassCinematic"))}</label></div></div>`,
    ok: {
      label: L("GlassCut"),
      callback: (_event: Event, button: HTMLElement) => ({ cinematic: Boolean(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="cinematic"]')?.checked) }),
    },
    rejectClose: false,
  });
  if (!cinematic) return;
  const dx = Number(api.actors.attribute(actor, "DX")) || 10;
  const forcedEntry = api.actors.skillLevel(actor, "Forced Entry");
  const use = forcedEntry !== null && forcedEntry > dx ? { skill: "Forced Entry", level: forcedEntry } : { skill: "DX", level: dx };
  const modifiers = cinematic.cinematic ? [] : [{ label: L("GlassRealistic"), value: GLASS_CUTTER_REALISTIC }];
  const outcome: any = await api.roll.success({ actor, base: use.level, label: F("GlassRoll", { skill: use.skill }), skill: use.skill, kind: use.skill === "DX" ? "attribute" : "skill", modifiers, tags: ["glassCutter"] } as any);
  if (!outcome) return;
  const result = glassCutterOutcome(Boolean(outcome.success), Boolean(outcome.criticalFailure));
  await say(actor, String(item.name ?? ""), [L(result === "cut" ? "GlassDone" : result === "noisy" ? "GlassNoisy" : "GlassCutHand")]);
  if (result === "cutHand") {
    await api.roll.damage({ actor, item, label: F("GlassWound", { name: String(actor?.name ?? "") }), formula: GLASS_CUTTER_WOUND.damage, damageType: GLASS_CUTTER_WOUND.type as never, calledShot: { hitLocation: "hand", addonLocation: null } as never });
  }
}

type TapeData = {
  captiveUuid: string;
  captive: string;
  taper: string;
  line: string;
  freed: string;
};

async function tapeUp(api: GWorldApi, item: any, actor: any): Promise<void> {
  const captive = targetedActor();
  if (!captive) return void ui.notifications?.warn(L("TapeTarget"));
  const data: TapeData = {
    captiveUuid: String(captive.uuid ?? ""),
    captive: String(captive.name ?? ""),
    taper: String(actor?.name ?? ""),
    line: F("TapeLine", { captive: captive.name, taper: actor?.name ?? "" }),
    freed: "",
  };
  await api.chat.post(`${MODULE_ID}.${TAPE_CARD}`, data, { actor: captive } as any);
}

async function breakFree(api: GWorldApi, message: any, data: TapeData): Promise<void> {
  const captive: any = data.captiveUuid ? await fromUuid(data.captiveUuid) : null;
  if (!captive || data.freed) return;
  const use = breakFreeRoll(Number(api.actors.attribute(captive, "ST")) || 10, api.actors.skillLevel(captive, "Escape"));
  const outcome: any = await api.roll.success({ actor: captive, base: use.level, label: F(use.skill === "ST" ? "BreakFreeSt" : "BreakFreeEscape", { name: captive.name }), skill: use.skill === "ST" ? "ST" : "Escape", kind: use.skill === "ST" ? "attribute" : "skill", tags: ["ductTape", "escape"] } as any);
  if (outcome?.success) await api.chat.update(message, { ...data, freed: F("TapeFreed", { captive: captive.name }) });
}

// ── household hazards (pp. 31-32) ──

async function hazardDamage(api: GWorldApi, item: any, actor: any): Promise<void> {
  const hazard = toolData(item).hazard;
  if (!hazard?.damage) return;
  const name = String(item.name ?? "");
  let formula = hazard.damage;
  const steps = diceRange(hazard.damage, hazard.upTo);
  if (steps.length > 1) {
    const chosen: any = await foundry.applications.api.DialogV2.prompt({
      window: { title: name },
      content: `<div class="gworld"><p class="ihint">${esc(F("HeatHint", { from: steps[0], to: steps.at(-1) }))}</p>
        <div class="ifields"><label>${esc(L("Heat"))} <select name="dice">${steps.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select></label></div></div>`,
      ok: {
        label: L("HazardRoll"),
        callback: (_event: Event, button: HTMLElement) => ({ dice: button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="dice"]')?.value ?? "" }),
      },
      rejectClose: false,
    });
    if (!chosen?.dice) return;
    formula = String(chosen.dice);
  }
  const label = F(hazard.perSecond ? "HazardPerSecond" : "HazardLabel", { name });
  if (hazard.kind === "explosion") return propaneBlast(api, item, actor, formula);
  // An institutional microwave does hit points, not damage (p. 32): nothing stops it and nothing is shoved.
  const injury = hazard.kind === "injury";
  await api.roll.damage({
    actor,
    item,
    label,
    formula,
    damageType: (hazard.kind === "cut" ? "cut" : "burn") as never,
    ...(injury ? { ignoresDr: true, noKnockback: true } : {}),
    source: "householdHazard",
  });
}

/** A ruptured propane cylinder's fireball: burning explosive damage, with 1d cutting fragments (p. 31). */
async function propaneBlast(api: GWorldApi, item: any, actor: any, formula: string): Promise<void> {
  await api.roll.damage({ actor, item, label: F("HazardLabel", { name: String(item.name ?? "") }), formula, damageType: "burn" as never, explosive: true, fragmentation: PROPANE_FRAGMENTS, source: "propane" });
}

/** The damage types a blow at a cylinder can be, as the system's things take them. */
const BLOW_TYPES = ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++", "burn", "cor"] as const;

/**
 * A blow struck at a propane cylinder (p. 31): the system puts it on the
 * cylinder at its DR 6 (`items.applyDamage`), and anything but crushing that
 * gets through ruptures it -- a fireball near a flame, escaping gas elsewhere.
 */
async function strikeCylinder(api: GWorldApi, item: any, actor: any): Promise<void> {
  const name = String(item.name ?? "");
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: name },
    content: `<div class="gworld"><p class="ihint">${esc(F("Propane.StrikeHint", { dr: PROPANE_DR }))}</p>
      <div class="ifields">
        <label>${esc(L("Propane.Damage"))} <input type="number" name="damage" value="0" min="0" step="1"></label>
        <label>${esc(L("Propane.Type"))} <select name="type">${BLOW_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></label>
        <label>${esc(L("Propane.Divisor"))} <input type="number" name="divisor" value="1" min="0.1" step="any"></label>
      </div>
      <div class="ichecks"><label class="icheck"><input type="checkbox" name="flame"> ${esc(L("Propane.NearFlame"))}</label></div></div>`,
    ok: {
      label: L("Propane.Strike"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        const value = (n: string) => root?.querySelector<HTMLInputElement>(`[name="${n}"]`);
        return { damage: Number(value("damage")?.value) || 0, type: String(value("type")?.value ?? "cr"), divisor: Number(value("divisor")?.value) || 1, flame: Boolean(value("flame")?.checked) };
      },
    },
    rejectClose: false,
  });
  if (!answer) return;
  const result: any = await (api.items as any).applyDamage({ item, damage: answer.damage, type: answer.type, armorDivisor: answer.divisor, label: F("Propane.Struck", { name }) });
  if (!result) return;
  if (!propaneRuptures(answer.type, Number(result.penetrating) || 0)) return void say(actor, name, [F("Propane.Holds", { name })]);
  if (!answer.flame) return void say(actor, name, [F("Propane.Vents", { name })]);
  await say(actor, name, [F("Propane.Fireball", { name })]);
  const hazard = toolData(item).hazard;
  if (hazard?.damage) await propaneBlast(api, item, actor, hazard.damage);
}

// ── lifting (pp. 25, 29-30) ──

/** The line saying what a lifting tool lifts. */
function liftLine(api: GWorldApi, lift: Lifting): string {
  if (lift.lbs > 0) return F("Lift.RatedLine", { load: loadText(lift.lbs) });
  const bl = Number(api.rules.basicLift(lift.st)) || 0;
  return F("Lift.StLine", { st: lift.st, bl: Math.round(bl), lift: loadText(bl * 8), shift: loadText(bl * 50) });
}

/** A load in tons from two tons up, else in pounds. */
function loadText(lbs: number): string {
  return lbs >= 2 * TON_LBS ? F("Lift.Tons", { tons: Math.round((lbs / TON_LBS) * 10) / 10 }) : F("Lift.Lbs", { lbs: Math.round(lbs).toLocaleString("en-US") });
}

/** Asks a load's weight and says whether the tool manages it. */
async function liftLoad(api: GWorldApi, item: any, actor: any): Promise<void> {
  const lift = toolData(item).lift;
  if (!lift) return;
  const name = String(item.name ?? "");
  const lbs: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: name },
    content: `<div class="gworld"><p class="ihint">${esc(liftLine(api, lift))}</p>
      <div class="ifields"><label>${esc(L("Lift.Load"))} <input type="number" name="lbs" value="0" min="0" step="any"></label></div></div>`,
    ok: {
      label: L("Lift.Action"),
      callback: (_event: Event, button: HTMLElement) => Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('[name="lbs"]')?.value) || 0,
    },
    rejectClose: false,
  });
  if (lbs === null || lbs === undefined) return;
  const outcome = liftOutcome(lift, Number(lbs), (st) => Number(api.rules.basicLift(st)) || 0);
  await say(actor, name, [F(`Lift.${outcome}`, { name, load: loadText(Number(lbs)) })]);
}

/** A Stokes litter dropped with its occupant (the one token targeted) in it: a fall with DR 5 (p. 29). */
async function dropLitter(api: GWorldApi, item: any, actor: any): Promise<void> {
  const occupant = targetedActor();
  if (!occupant) return void ui.notifications?.warn(L("Litter.Target"));
  const name = String(item.name ?? "");
  const answer: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: name },
    content: `<div class="gworld"><p class="ihint">${esc(F("Litter.Hint", { name: String(occupant.name ?? ""), dr: STOKES_LITTER.dr }))}</p>
      <div class="ifields"><label>${esc(L("Litter.Yards"))} <input type="number" name="yards" value="1" min="0" step="any"></label></div>
      <div class="ichecks"><label class="icheck"><input type="checkbox" name="soft"> ${esc(L("Litter.Soft"))}</label></div></div>`,
    ok: {
      label: L("Litter.Action"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        return { yards: Number(root?.querySelector<HTMLInputElement>('[name="yards"]')?.value) || 0, soft: Boolean(root?.querySelector<HTMLInputElement>('[name="soft"]')?.checked) };
      },
    },
    rejectClose: false,
  });
  if (!answer || !(answer.yards > 0)) return;
  if (!occupant.isOwner) return void say(actor, name, [F("Litter.Gm", { name: String(occupant.name ?? ""), yards: answer.yards, dr: STOKES_LITTER.dr })]);
  await api.hazards.fall(occupant, { yards: answer.yards, onto: answer.soft ? "soft" : "hard", modifiers: [{ label: F("Litter.DrLine", { dr: STOKES_LITTER.dr }), value: -STOKES_LITTER.dr }] } as any);
}

/** Sprays a fire extinguisher at each targeted character within its range, a burst each (p. 29). */
async function extinguish(api: GWorldApi, item: any, actor: any): Promise<void> {
  const figures = extinguisherOf(String(item.name ?? ""));
  if (!figures) return;
  const name = String(item.name ?? "");
  const victims = [...((game as any).user?.targets ?? [])];
  if (!victims.length) return void ui.notifications?.warn(L("Extinguisher.Target"));
  const tl = api.rules.parseTechLevel(item.system?.tl) ?? 6;
  let used = Number(item.getFlag?.(MODULE_ID, BURSTS_FLAG)) || 0;
  const own = actor?.getActiveTokens?.()?.[0] ?? null;
  const lines: string[] = [];
  const rolls: any[] = [];
  for (const token of victims) {
    const victim = token?.actor;
    if (!victim) continue;
    if (used >= figures.bursts) {
      lines.push(F("Extinguisher.Empty", { name }));
      break;
    }
    const yards = yardsApart(own, token);
    if (yards !== null && yards > figures.yards) {
      lines.push(F("Extinguisher.OutOfRange", { name: String(victim.name ?? ""), yards: figures.yards }));
      continue;
    }
    used += 1;
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const conditions = ((api.actors.conditions(victim) ?? []) as any[]).map((c) => String(c?.id ?? ""));
    if (!extinguishes(Number(roll.total), tl)) {
      lines.push(F("Extinguisher.Missed", { name: String(victim.name ?? ""), roll: roll.total, target: tl + 2 }));
      continue;
    }
    const out = conditions.filter((id) => PUT_OUT.includes(id));
    const put = victim.isOwner ? out : [];
    for (const id of put) await api.actors.removeCondition(victim, id);
    // The system's own burning, and fuel on a victim this user can't change: the GM takes it off.
    const left = out.length > put.length || Boolean(victim.statuses?.has?.("burning"));
    const key = left ? "Extinguisher.PutOutGm" : put.length ? "Extinguisher.PutOut" : "Extinguisher.Doused";
    lines.push(F(key, { name: String(victim.name ?? ""), roll: roll.total, target: tl + 2 }));
    if (conditions.some((id) => BURNING_ON.includes(id))) lines.push(F("Extinguisher.BurnsOn", { name: String(victim.name ?? "") }));
  }
  if (item.isOwner) await item.setFlag(MODULE_ID, BURSTS_FLAG, Math.min(figures.bursts, used));
  lines.push(F("Extinguisher.Left", { left: Math.max(0, figures.bursts - used), bursts: figures.bursts }));
  await say(actor, name, lines, rolls);
}

/** Yards between two tokens' centres, where the map knows both. */
function yardsApart(a: any, b: any): number | null {
  const grid = (globalThis as any).canvas?.grid;
  if (!a?.center || !b?.center || !grid?.measurePath) return null;
  const distance = Number(grid.measurePath([a.center, b.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

// ── the item sheet ──

const workLabel = (work: Work): string => {
  const pace = work.every === 0 ? L("PerUse") : work.every === 1 ? L("PerSecond") : F("EverySeconds", { seconds: work.every });
  return work.against ? F("WorkAgainst", { pace, against: L(`Against.${work.against}`) }) : pace;
};

/** A supply's amount as the book gives it: minutes of burn time past a minute, else seconds; shots. */
function supplyAmount(supply: Supply, amount: number): string {
  if (supply.kind === "shots") return F("Supply.Shots", { shots: amount });
  return amount >= 60 && amount % 60 === 0 ? F("Minutes", { minutes: amount / 60 }) : F("Seconds", { seconds: amount });
}

function itemContext(api: GWorldApi, item: any, on: ToolSwitches): Record<string, unknown> {
  const data = toolData(item);
  const lines: string[] = [];
  const context: Record<string, unknown> = { editable: item.isOwner };
  // A kit, or a tool carried for a skill that could be marked as one.
  if (on.kits() && (data.kit || (item.system?.category === "tool" && (item.system?.forSkills?.length ?? 0) > 0))) {
    context.kit = {
      sizes: KIT_SIZES.map((s) => ({ value: s, label: L(`Kit.${s || "none"}`), selected: s === data.kit })),
      isKit: Boolean(data.kit),
      workshop: data.kit === "workshop",
      lightCraft: data.lightCraft,
      vehicleTons: data.vehicleTons || "",
      closeCrafts: data.closeCrafts.join(", "),
      distantCrafts: data.distantCrafts.join(", "),
    };
    if (data.kit) lines.push(L(`KitLine.${data.kit}`));
    if (data.kit && data.vehicleTons > VEHICLE_TONS) lines.push(F("VehicleLine", { tons: data.vehicleTons, multiplier: Math.round((data.vehicleTons / VEHICLE_TONS) * 100) / 100 }));
    if (data.setupSeconds) lines.push(F("SetupLine", { time: data.setupSeconds >= 60 ? F("Minutes", { minutes: Math.round(data.setupSeconds / 60) }) : F("Seconds", { seconds: data.setupSeconds }) }));
    if (data.partsPerHour) lines.push(F("PartsLine", { pounds: data.partsPerHour }));
  }
  if (on.forcedEntry()) {
    if (data.work) {
      const damage = workDamage(data.work, (base, modifier) => `${base}${modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : ""}`, data.carbide);
      lines.push(F("WorkLine", { damage, divisor: data.work.divisor !== 1 ? `(${data.work.divisor})` : "", type: data.work.type, pace: workLabel(data.work) }));
      if (data.work.stRoll !== null) lines.push(F("StRollLine", { modifier: data.work.stRoll >= 0 ? `+${data.work.stRoll}` : String(data.work.stRoll) }));
    }
    if (data.work?.carbideBonus) context.carbide = { checked: data.carbide, label: L("CarbideEdge"), hint: F("CarbideEdgeHint", { bonus: data.work.carbideBonus }) };
    if (data.readies) lines.push(F(data.readiesWaivedAtSt ? "ReadiesWaivedLine" : "ReadiesLine", { readies: data.readies, st: data.readiesWaivedAtSt }));
    if (data.supply) {
      const left = supplyLeft(data.supply, supplyUsed(item));
      lines.push(F(`Supply.${data.supply.kind}Line`, { left: supplyAmount(data.supply, left), amount: supplyAmount(data.supply, data.supply.amount), refill: L(`Supply.Refill.${data.supply.refill}`) }));
    }
    if (data.lift) lines.push(liftLine(api, data.lift));
    if (data.use === "glassCutter") lines.push(F("GlassLine", { penalty: GLASS_CUTTER_REALISTIC }));
    if (data.use === "ductTape") lines.push(L("TapeItemLine"));
  }
  if (on.chainsaws() && data.use === "chainsaw") {
    context.carbide = { checked: data.carbide, label: L("Carbide"), hint: L("CarbideHint") };
    lines.push(L(data.carbide ? "CarbideLine" : "HardLine"));
    const state = sawState(api, item);
    if (state) lines.push(L(state === "stalled" ? "StalledLine" : "SnappedLine"));
  }
  if (on.chainsaws() && data.use === "nailGun") lines.push(F("NailGunLine", { penalty: NAIL_GUN_PENALTY }));
  if (on.forcedEntry()) {
    const extinguisher = extinguisherOf(String(item.name ?? ""));
    if (extinguisher) {
      const used = Number(item.getFlag?.(MODULE_ID, BURSTS_FLAG)) || 0;
      lines.push(F("Extinguisher.Line", { left: Math.max(0, extinguisher.bursts - used), bursts: extinguisher.bursts, yards: extinguisher.yards, target: (api.rules.parseTechLevel(item.system?.tl) ?? 6) + 2 }));
    }
    if (isFireShelter(String(item.name ?? ""))) lines.push(F(item.getFlag?.(MODULE_ID, SHELTER_FLAG) ? "Shelter.InsideLine" : "Shelter.Line", { dr: FIRE_SHELTER_DR }));
    if (FIREFIGHTER_ALERT.pattern.test(String(item.name ?? ""))) lines.push(F(item.getFlag?.(MODULE_ID, ALERT_FLAG) ? "Alert.SoundingLine" : "Alert.Line", { bonus: FIREFIGHTER_ALERT.hearing }));
    if (STOKES_LITTER.pattern.test(String(item.name ?? ""))) lines.push(F("Litter.Line", { dr: STOKES_LITTER.dr }));
  }
  if (on.hazards() && data.hazard) {
    lines.push(data.hazard.kind === "explosion"
      ? F("PropaneLine", { dr: PROPANE_DR, damage: data.hazard.damage, fragments: PROPANE_FRAGMENTS })
      : F(`HazardLine.${data.hazard.kind}`, { damage: data.hazard.upTo ? `${data.hazard.damage}-${data.hazard.upTo}` : data.hazard.damage, pace: data.hazard.perSecond ? ` ${L("PerSecond")}` : "" }));
  }
  context.lines = lines;
  return context;
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}.${FIELD}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-tool]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = String(input.dataset.gccHtTool);
      let value: unknown = input.value;
      if (input instanceof HTMLInputElement && input.type === "checkbox") value = input.checked;
      else if (key === "vehicleTons") value = Math.max(0, Number(input.value) || 0);
      await item.update({ [`${path}.${key}`]: value });
    });
  });
}

export function readyTools(api: GWorldApi, on: ToolSwitches): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-tools-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-tools-item.hbs`,
    visible: (item) => {
      if (item?.type !== "equipment") return false;
      const context = itemContext(api, item, on);
      return (context.lines as string[]).length > 0 || Boolean(context.kit) || Boolean(context.carbide);
    },
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── tool kits (p. 24) ──
  // A kit made for another specialty, or a workshop for another craft, serves the skill at that
  // figure (API 1.145.0): the system weighs the kit's TL against the skill's, and picks it only
  // where it is worth more than the skill's own tools. Registered after the devices' and
  // computers' graders, whose `false` for broken gear must come first.
  api.data.registerToolGrade({
    module: MODULE_ID,
    key: "ht-wrong-kit",
    grade: (item, skill) => (on.kits() ? wrongKitGrade(api, item, String(skill?.name ?? "")) : null),
  });

  // Tool kits are essential to the repair skills (p. 24): without one, the
  // system gives the skill the Basic Set's no-equipment line (API 1.135.0).
  api.data.registerNeedsEquipment({
    module: MODULE_ID,
    key: "ht-repair-kits",
    test: (skill) => on.kits() && needsKit(String(skill?.name ?? "")),
  });

  // A kit for a light craft, or for vehicles over 10 tons; a chainsaw's carbide chain.
  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-tool-price",
    types: ["equipment"],
    apply: (item, price) => {
      const data = toolData(item);
      let cost = 1;
      let weight = 1;
      const labels: string[] = [];
      if (on.kits() && data.kit) {
        const m = kitPriceMultipliers(data);
        if (m.cost !== 1 || m.weight !== 1) {
          cost *= m.cost;
          weight *= m.weight;
          labels.push(L(data.lightCraft ? "LightCraftPrice" : "VehiclePrice"));
        }
      }
      if (on.chainsaws() && data.use === "chainsaw" && data.carbide) {
        cost *= CARBIDE_CHAIN_COST;
        labels.push(L("CarbidePrice"));
      }
      if (!labels.length) return null;
      return { cost: Math.round(price.cost * cost * 100) / 100, weight: Math.round(price.weight * weight * 1000) / 1000, label: labels.join(", ") };
    },
  });

  // ── forced entry (pp. 25-30) ──
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: WORK_MODE,
    label: L("WorkMode"),
    kind: "melee",
    applies: (item) => on.forcedEntry() && toolData(item).work !== null,
    mode: (item, _actor, helpers: any) => {
      const data = toolData(item);
      const work = data.work!;
      const damage = workDamage(work, (base, modifier) => String(helpers.damage?.(base, modifier) ?? ""), data.carbide);
      const dx = Number(helpers.attribute?.("DX")) || 10;
      const known = helpers.skillLevel?.("Forced Entry") ?? null;
      const notes = [{ label: workLabel(work), hint: L("WorkHint") }];
      if (work.stRoll !== null) notes.push({ label: F("StRollNote", { modifier: work.stRoll >= 0 ? `+${work.stRoll}` : String(work.stRoll) }), hint: L("StRollHint") });
      return {
        mode: L("WorkMode"),
        skillName: "Forced Entry",
        skillLevel: known ?? dx - 5,
        damage,
        damageType: work.type,
        armorDivisor: work.divisor,
        reach: "C",
        parry: null,
        damageRollable: api.rules.parseDiceAdds(damage) !== null,
        notes,
      };
    },
  });

  // The Ready maneuvers before each use: counted by the row action, required by the attack.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tool-ready",
    itemTypes: ["equipment"],
    label: L("ReadyAction"),
    icon: "fa-solid fa-hand-fist",
    visible: (item) => on.forcedEntry() && toolData(item).readies > 0,
    run: (item, actor) => {
      void (async () => {
        const data = toolData(item);
        const needed = readiesNeeded(data.readies, data.readiesWaivedAtSt, Number(api.actors.attribute(actor, "ST")) || 10);
        if (!needed) return void ui.notifications?.info(F("NoReadiesNeeded", { name: item.name }));
        const done = Math.min(needed, (Number((api.combat.getWeaponState(item, MODULE_ID) as any)?.readied) || 0) + 1);
        await api.combat.setWeaponState(item, MODULE_ID, { readied: done });
        await say(actor, String(item.name ?? ""), [F(done >= needed ? "ReadyDone" : "ReadyCount", { done, needed })]);
      })();
    },
  });

  // A torch's burn time, the doorbuster's strips (pp. 27, 30): refilled from the row.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tool-refill",
    itemTypes: ["equipment"],
    label: L("Supply.Action"),
    icon: "fa-solid fa-gas-pump",
    visible: (item) => on.forcedEntry() && toolData(item).supply !== null,
    run: (item, actor) => {
      void (async () => {
        const supply = toolData(item).supply;
        if (!supply || !item.isOwner) return;
        await item.setFlag(MODULE_ID, SUPPLY_FLAG, 0);
        await say(actor, String(item.name ?? ""), [F("Supply.Refilled", { refill: L(`Supply.Refill.${supply.refill}`), amount: supplyAmount(supply, supply.amount) })]);
      })();
    },
  });

  // A jack, lift bags, a hoist, a spreader or a come-along against a load (pp. 25, 29-30).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-tool-lift",
    itemTypes: ["equipment"],
    label: L("Lift.Action"),
    icon: "fa-solid fa-weight-hanging",
    visible: (item) => on.forcedEntry() && toolData(item).lift !== null,
    run: (item, actor) => { void liftLoad(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-glass-cutter",
    itemTypes: ["equipment"],
    label: L("GlassCut"),
    icon: "fa-regular fa-circle",
    visible: (item) => on.forcedEntry() && toolData(item).use === "glassCutter",
    run: (item, actor) => { void cutGlass(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-duct-tape",
    itemTypes: ["equipment"],
    label: L("TapeAction"),
    icon: "fa-solid fa-tape",
    visible: (item) => on.forcedEntry() && toolData(item).use === "ductTape",
    run: (item, actor) => { void tapeUp(api, item, actor); },
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: TAPE_CARD,
    template: `modules/${MODULE_ID}/templates/ht-tools-card.hbs`,
    actions: {
      breakFree: async ({ message, data }: any) => { if (on.forcedEntry()) await breakFree(api, message, data as TapeData); },
    },
  } as any);

  // ── rescue tools (pp. 29-30) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-extinguisher",
    itemTypes: ["equipment"],
    label: L("Extinguisher.Action"),
    icon: "fa-solid fa-fire-extinguisher",
    visible: (item) => on.forcedEntry() && extinguisherOf(String(item.name ?? "")) !== null,
    run: (item, actor) => { void extinguish(api, item, actor); },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-fire-shelter",
    itemTypes: ["equipment"],
    label: L("Shelter.Action"),
    icon: "fa-solid fa-tent",
    visible: (item) => on.forcedEntry() && isFireShelter(String(item.name ?? "")),
    run: (item, actor) => {
      void (async () => {
        const inside = !item.getFlag?.(MODULE_ID, SHELTER_FLAG);
        await item.setFlag(MODULE_ID, SHELTER_FLAG, inside);
        await say(actor, String(item.name ?? ""), [F(inside ? "Shelter.GotIn" : "Shelter.GotOut", { name: String(actor?.name ?? ""), dr: FIRE_SHELTER_DR })]);
      })();
    },
  });
  // Inside a fire shelter: DR 10 against burning (p. 30), a layer of its own over everything else.
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.forcedEntry() || context?.damageType !== "burn" || !Array.isArray(context.lines)) return;
    const shelter = [...(context.actor?.items ?? [])].find((i: any) => i?.type === "equipment" && isFireShelter(String(i.name ?? "")) && i.getFlag?.(MODULE_ID, SHELTER_FLAG) === true);
    if (!shelter) return;
    context.lines.push({ label: String(shelter.name ?? ""), dr: FIRE_SHELTER_DR, applies: true, forceField: false, flexible: true, hardened: 0, itemId: shelter.id, source: "armor", reason: L("Shelter.Reason") });
  });

  // The firefighter alert (p. 30): set off by hand, or sounding by itself once its wearer is out cold.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-firefighter-alert",
    itemTypes: ["equipment"],
    label: L("Alert.Action"),
    icon: "fa-solid fa-bell",
    visible: (item) => on.forcedEntry() && FIREFIGHTER_ALERT.pattern.test(String(item.name ?? "")) && item.isOwner,
    run: (item, actor) => {
      void (async () => {
        const sounding = !item.getFlag?.(MODULE_ID, ALERT_FLAG);
        await item.setFlag(MODULE_ID, ALERT_FLAG, sounding);
        await say(actor, String(item.name ?? ""), [F(sounding ? "Alert.Sounds" : "Alert.Reset", { name: String(actor?.name ?? ""), bonus: FIREFIGHTER_ALERT.hearing })]);
      })();
    },
  });
  // Someone listening for a downed firefighter hears the alarm: +4 to Hearing.
  Hooks.on(api.combat.hooks.detectionModifiers, (context: any) => {
    const subject = context?.subject;
    if (!on.forcedEntry() || !subject || context.sense !== "hearing" || !Array.isArray(context.modifiers)) return;
    const unconscious = Boolean(subject.statuses?.has?.("unconscious"));
    const alert = [...(subject.items ?? [])].find((i: any) => i?.type === "equipment" && FIREFIGHTER_ALERT.pattern.test(String(i.name ?? ""))
      && alertSounding({ worn: i.system?.equipped === true, set: i.getFlag?.(MODULE_ID, ALERT_FLAG) === true, unconscious }));
    if (alert) context.modifiers.push({ label: F("Alert.HearingLine", { name: String(alert.name ?? "") }), value: FIREFIGHTER_ALERT.hearing });
  });

  // The Stokes litter dropped (p. 29): its occupant falls with DR 5, taken off the fall's damage.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-stokes-litter",
    itemTypes: ["equipment"],
    label: L("Litter.Action"),
    icon: "fa-solid fa-bed-pulse",
    visible: (item) => on.forcedEntry() && STOKES_LITTER.pattern.test(String(item.name ?? "")),
    run: (item, actor) => { void dropLitter(api, item, actor); },
  });

  // ── chainsaws (pp. 27-28) ──
  const sawRow = (item: any, actor: any, helpers: any, hard: boolean) => {
    const own = helpers.rows?.(item)?.melee?.[0] ?? {};
    const damage = String(own.damage ?? "");
    const dx = Number(helpers.attribute?.("DX")) || 10;
    const known = helpers.skillLevel?.("Forced Entry") ?? null;
    return {
      mode: L(hard ? "HardMode" : "RescueMode"),
      skillName: "Forced Entry",
      skillLevel: known ?? dx - 5,
      damage,
      damageType: String(own.damageType ?? "cut"),
      armorDivisor: hard ? HARD_MATERIAL_DIVISOR : 1,
      reach: String(own.reach ?? "1"),
      parry: null,
      twoHanded: true,
      damageRollable: api.rules.parseDiceAdds(damage) !== null,
      notes: [{ label: L(hard ? "HardNote" : "RescueNote"), hint: L(hard ? "HardHint" : "RescueHint") }],
    };
  };
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: RESCUE_MODE,
    label: L("RescueMode"),
    kind: "melee",
    applies: (item) => on.chainsaws() && toolData(item).use === "chainsaw" && meleeModes(item).length > 0,
    mode: (item, actor, helpers) => sawRow(item, actor, helpers, false),
  });
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: HARD_MODE,
    label: L("HardMode"),
    kind: "melee",
    applies: (item) => on.chainsaws() && ordinaryChainsaw(item) && meleeModes(item).length > 0,
    mode: (item, actor, helpers) => sawRow(item, actor, helpers, true),
  });

  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!item || !on.chainsaws()) return;
    const data = toolData(item);
    for (const entry of context.rows ?? []) {
      const row = entry?.row;
      if (!row) continue;
      // The combat row: the divisor it takes against hard things (p. 27).
      if (data.use === "chainsaw" && !data.carbide && entry.kind === "melee") {
        row.notes?.push?.({ label: F("HardCombatNote", { divisor: HARD_MATERIAL_DIVISOR }), hint: L("HardHint") });
      }
      // The nail gun, fired with its safety held back (p. 28).
      if (data.use === "nailGun" && entry.kind === "ranged" && typeof row.skillLevel === "number") {
        row.skillLevel = nailGunLevel(row.skillLevel, Boolean(row.atDefault));
        row.notes?.push?.({ label: F("NailGunNote", { penalty: NAIL_GUN_PENALTY }), hint: L("NailGunHint") });
      }
    }
  });

  // A stalled or broken saw doesn't cut; a tool short of its Ready maneuvers isn't ready.
  // The count starts again once the attack is rolled (`gworld.afterSuccessRoll`), which an
  // attack refused afterwards (by another rule, or below skill 3) never reaches.
  const spending = new Map<string, any>();
  const supplying = new Map<string, any>();
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item) return;
    spending.delete(String(context.actor?.uuid ?? ""));
    supplying.delete(String(context.actor?.uuid ?? ""));
    if (context.refusal) return;
    const data = toolData(item);
    // A torch out of burn time, a doorbuster out of strips (pp. 27, 30).
    if (on.forcedEntry() && data.supply) {
      if (supplyLeft(data.supply, supplyUsed(item)) < SUPPLY_PER_USE) {
        context.refusal = F(`Supply.${data.supply.kind}Refusal`, { name: item.name, refill: L(`Supply.Refill.${data.supply.refill}`) });
        return;
      }
      if (item.isOwner) supplying.set(String(context.actor?.uuid ?? ""), item);
    }
    if (on.chainsaws() && data.use === "chainsaw") {
      const state = sawState(api, item);
      if (state) {
        context.refusal = F(state === "stalled" ? "StalledRefusal" : "SnappedRefusal", { name: item.name });
        return;
      }
    }
    const index = Number(context.mode?.index) || 0;
    if (on.forcedEntry() && data.readies && context.mode?.ranged !== true && !context.mode?.derived && index === 0) {
      const needed = readiesNeeded(data.readies, data.readiesWaivedAtSt, Number(api.actors.attribute(context.actor, "ST")) || 10);
      const done = Number((api.combat.getWeaponState(item, MODULE_ID) as any)?.readied) || 0;
      if (done < needed) {
        context.refusal = F("ReadiesRefusal", { name: item.name, done, needed });
        return;
      }
      if (needed && item.isOwner) spending.set(String(context.actor?.uuid ?? ""), item);
    }
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const key = String(context?.actor?.uuid ?? "");
    const fed = supplying.get(key);
    if (fed && (context?.tags ?? []).includes("attack")) {
      supplying.delete(key);
      if (!context.item || context.item === fed || String(context.item.id ?? "") === String(fed.id ?? "")) {
        void fed.setFlag(MODULE_ID, SUPPLY_FLAG, supplyUsed(fed) + SUPPLY_PER_USE);
      }
    }
    const item = spending.get(key);
    if (!item || !(context?.tags ?? []).includes("attack")) return;
    spending.delete(key);
    if (context.item && context.item !== item && String(context.item.id ?? "") !== String(item.id ?? "")) return;
    void api.combat.setWeaponState(item, MODULE_ID, { readied: 0 });
  });

  // A blow from the hard-material row that got nowhere (p. 27).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const item = context?.item;
    if (!on.chainsaws() || !item?.isOwner || !ordinaryChainsaw(item)) return;
    if (context.mode?.derived !== `${MODULE_ID}.${HARD_MODE}`) return;
    if ((Number(context.result?.penetrating) || 0) > 0) return;
    void chainsawFails(api, item, item.actor ?? null);
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-chainsaw-bind",
    itemTypes: ["equipment"],
    label: L("FailedAction"),
    icon: "fa-solid fa-triangle-exclamation",
    visible: (item) => on.chainsaws() && ordinaryChainsaw(item) && !sawState(api, item),
    run: (item, actor) => { void chainsawFails(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-chainsaw-fix",
    itemTypes: ["equipment"],
    label: L("FixAction"),
    icon: "fa-solid fa-screwdriver-wrench",
    visible: (item) => on.chainsaws() && toolData(item).use === "chainsaw" && Boolean(sawState(api, item)),
    run: (item, actor) => {
      void (async () => {
        const state = sawState(api, item);
        await api.combat.setWeaponState(item, MODULE_ID, { chainsaw: "" });
        await say(actor, String(item.name ?? ""), [L(state === "stalled" ? "Restarted" : "Repaired")]);
      })();
    },
  });

  // ── household hazards (pp. 31-33) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-hazard",
    itemTypes: ["equipment"],
    label: L("HazardAction"),
    icon: "fa-solid fa-fire",
    visible: (item) => on.hazards() && toolData(item).hazard !== null,
    run: (item, actor) => { void hazardDamage(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-propane-strike",
    itemTypes: ["equipment"],
    label: L("Propane.Strike"),
    icon: "fa-solid fa-burst",
    visible: (item) => on.hazards() && toolData(item).hazard?.kind === "explosion" && item.isOwner,
    run: (item, actor) => { void strikeCylinder(api, item, actor); },
  });

  // A propane cylinder's DR 6 (p. 31), as the thing a blow is put on.
  Hooks.on(api.data.hooks.objectStats, (context: any) => {
    if (!on.hazards() || toolData(context?.item).hazard?.kind !== "explosion") return;
    context.dr = PROPANE_DR;
    context.notes?.push?.(F("Propane.DrNote", { dr: PROPANE_DR }));
  });

  api.data.registerPoison({ module: MODULE_ID, key: LEAD, label: "GCC.HT.Tools.LeadPoison", poison: LEAD_POISON as any, available: () => on.hazards() });

  // Past half their HP, the victim's worse symptoms (p. 33): the GM's to pick. A
  // second failed roll, and every one after, intensifies them toward seizures and coma.
  Hooks.on(api.combat.hooks.poisonCycle, (context: any) => {
    const actor = context?.actor;
    if (!on.hazards() || context?.source !== `${MODULE_ID}.${LEAD}` || !actor?.isOwner) return;
    void (async () => {
      // One course per dose, by the active poison's id; doses gone from the actor are forgotten.
      const id = String(context.poison?.id ?? "");
      const live = new Set(((api.actors.activePoisons(actor) ?? []) as any[]).map((p) => String(p?.id ?? "")));
      const stored = (actor.getFlag?.(MODULE_ID, LEAD_FLAG) ?? {}) as Record<string, { failed?: number; pastHalf?: boolean }>;
      const courses: Record<string, { failed: number; pastHalf: boolean }> = {};
      for (const [key, value] of Object.entries(stored)) {
        if (live.has(key) && key !== id) courses[key] = { failed: Number(value?.failed) || 0, pastHalf: value?.pastHalf === true };
      }
      const course = stored[id] ?? {};
      const failedNow = context.resisted === false;
      const failed = (Number(course.failed) || 0) + (failedNow ? 1 : 0);
      const pastHalf = course.pastHalf === true || leadSymptomsWorsen(context.symptomsNow ?? []);
      if (id && !context.finished) courses[id] = { failed, pastHalf };
      // The whole flag is written, so doses cleared or finished leave no entry behind.
      await actor.unsetFlag?.(MODULE_ID, LEAD_FLAG);
      if (Object.keys(courses).length) await actor.setFlag?.(MODULE_ID, LEAD_FLAG, courses);
      const stage = leadStage({ pastHalf, failedRolls: failed });
      // The worse symptoms are named once, as the victim passes half their HP; intensifying ones on each failed roll.
      if (stage === "intensifying" && failedNow) await say(actor, L("Lead"), [F("LeadIntensifies", { name: actor.name, failed })]);
      else if (stage === "worse" && leadSymptomsWorsen(context.symptomsNow ?? [])) await say(actor, L("Lead"), [F("LeadWorse", { name: actor.name })]);
    })();
  });
}

