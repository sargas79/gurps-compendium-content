/**
 * Working a ritual at the table (Monster Hunters 1 pp. 35-39), ported from
 * the system's `system/ritual-casting.ts` onto the add-on API.
 *
 * A casting is one chat card that lives as long as the ritual does. It keeps
 * the energy gathered against the cost, and offers each next step with its
 * modifiers worked out: another gathering roll, a source to tap, and at the
 * end the final roll. The card's data is the state; every step redraws the
 * card from it (`chat.update`), so whoever looks at the chat sees where the
 * ritual stands.
 *
 * The GM sets the circumstances on the card itself: whether the caster has a
 * connection to the subject, what the ground is, and how long magic has been
 * worked there. Other casters can be added to work together (p. 39), and each
 * caster's Ritual Mastery and grimoire count for their own rolls (pp. 25, 39).
 *
 * A ritual the GM has agreed can block is also offered as a defense against
 * an attack, and resolved at once (p. 37).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  backfireEnergy,
  finalOutcome,
  gatheringOutcome,
  gatheringSeconds,
  gatheringStreakPenalty,
  hurriedGatheringPenalty,
  nonAdeptPenalties,
  sacrifice,
  sitePotencyBonus,
  tapping,
  type CastingConditions,
  type Consecration,
  type RitualRoll,
} from "./casting.js";
import { effectsOf, ritualPathOf, ritualSkillOf } from "./caster.js";
import { RITUAL_DURATIONS, type RitualEffectEntry } from "./cost.js";
import { NO_CHARM, RITUAL_TYPE, casterData, equipmentData, storeActive, storeCharm, storeReserve, type RitualInEffect, type RitualSystem } from "./data.js";
import {
  CHARM_PREPARATION_SECONDS,
  CHARM_WORKSPACES,
  extensionEnergy,
  hangConditional,
  mayBeConditional,
  ritualDurationSeconds,
  sharedEffects,
  stackingSurvivor,
  type CharmWorkspace,
} from "./lasting.js";
import { BLOCKING_GATHER_PENALTY, BLOCKING_TAP_PENALTY, finalCaster, workingTogetherPenalty } from "./tricks.js";

const L = (key: string) => game.i18n.localize(`GCC.MH1.RitualCast.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MH1.RitualCast.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** One line of the card's record of the casting. */
interface LogEntry {
  text: string;
  kind: "gain" | "quirk" | "bad" | "note";
}

/** One caster working the ritual. */
interface Caster {
  uuid: string;
  name: string;
  skillName: string;
  /** The Path's level, with the penalty for extra Paths already in it. */
  skill: number;
  adept: boolean;
  magery: number | null;
  /** Ritual Mastery's bonus for this ritual as defined (p. 25). */
  mastery: number;
  /** The best grimoire carried for it, and whether it is being read from (p. 39). */
  grimoire: { name: string; bonus: number } | null;
  useGrimoire: boolean;
  /** How long this caster has worked; casters working together work at once. */
  seconds: number;
}

/** Everything the card remembers. */
export interface CastingState {
  itemId: string;
  name: string;
  identity: string;
  effects: RitualEffectEntry[];
  cost: number;
  information: boolean;
  casters: Caster[];
  /** The caster whose turn the buttons take. */
  acting: number;
  connected: boolean;
  consecration: Consecration;
  adeptTimes: boolean;
  /** How long magic has been worked where the ritual is cast; -1 for desecrated ground. */
  siteYears: number;
  /** The seconds an adept takes over each gathering attempt, from one to five. */
  hurriedTo: number;
  energy: number;
  attempts: number;
  /** A critical success makes the next gathering attempt one second. */
  quick: boolean;
  quirks: number;
  /** Everyone who has sacrificed to this ritual: "may only contribute to a given ritual once". */
  donors: string[];
  log: LogEntry[];
  state: "gathering" | "cast" | "backfired" | "abandoned";
  /** How long the ritual lasts once in effect, from its item. */
  durationSeconds: number;
  /** Whether it has the Lesser Control Magic a conditional casting needs (p. 38). */
  mayBeConditional: boolean;
  conditional: boolean;
  condition: string;
  /** The lead caster's object it is being bound to as a charm, and where the charm is made (pp. 38-39). */
  charmItemId: string;
  workspace: CharmWorkspace;
  /** An extension of a ritual already in effect: which, and by how long (p. 37). */
  extend: { activeId: string; seconds: number } | null;
}

type Modifier = { label: string; value: number };

/** What the module needs from the table: the API and whether the rule is in play. */
export interface RitualContext {
  api: GWorldApi;
  on: () => boolean;
}

let context: RitualContext | null = null;
let cardId: string | null = null;
let triggerCardId: string | null = null;

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));
const describeModifiers = (mods: Modifier[]) => mods.map((m) => `${m.label} ${signed(m.value)}`).join(", ");

function conditionsOf(flag: CastingState, caster: Caster): CastingConditions {
  return { adept: caster.adept, magery: caster.magery, connected: flag.connected, consecration: flag.consecration, adeptTimes: flag.adeptTimes };
}

/** The bonuses a caster brings to this ritual: Ritual Mastery and an open grimoire. */
function bonusModifiers(caster: Caster): Modifier[] {
  const out: Modifier[] = [];
  if (caster.mastery) out.push({ label: game.i18n.localize("GCC.MH1.Ritual.Mastery"), value: caster.mastery });
  if (caster.useGrimoire && caster.grimoire?.bonus) out.push({ label: caster.grimoire.name, value: caster.grimoire.bonus });
  return out;
}

/** The modifiers on every roll a caster makes for the ritual. */
function generalModifiers(flag: CastingState, caster: Caster): Modifier[] {
  const out: Modifier[] = nonAdeptPenalties(conditionsOf(flag, caster)).map((p) => ({ label: L(`Penalty.${p.key}`), value: p.value }));
  const together = workingTogetherPenalty(flag.casters.length);
  if (together) out.push({ label: L("Together"), value: together });
  // "the normal equipment modifiers for nontechnological skills" for making a charm (p. 39).
  if (flag.charmItemId && CHARM_WORKSPACES[flag.workspace]) out.push({ label: L(`Workspace.${flag.workspace}`), value: CHARM_WORKSPACES[flag.workspace] });
  return [...out, ...bonusModifiers(caster)];
}

/** The modifiers on a caster's next gathering attempt: the general ones and those only gathering takes (p. 35). */
function gatheringModifiers(flag: CastingState, caster: Caster): Modifier[] {
  const out = generalModifiers(flag, caster);
  const streak = gatheringStreakPenalty(flag.attempts + 1);
  if (streak) out.push({ label: L("Streak"), value: streak });
  const conditions = conditionsOf(flag, caster);
  const hurried = flag.quick || (!conditions.adept && !conditions.adeptTimes) ? 0 : hurriedGatheringPenalty(flag.hurriedTo);
  if (hurried) out.push({ label: F("Hurried", { seconds: flag.hurriedTo }), value: hurried });
  const site = flag.siteYears > 0 ? sitePotencyBonus(flag.siteYears) : 0;
  if (site) out.push({ label: L("Site"), value: site });
  return out;
}

const total = (mods: Modifier[]) => mods.reduce((sum, m) => sum + m.value, 0);

/** "Using a grimoire doubles all casting times" (p. 39). */
const timeFactor = (caster: Caster) => (caster.useGrimoire && caster.grimoire ? 2 : 1);

function gatherSecondsFor(flag: CastingState, caster: Caster): number {
  return gatheringSeconds(conditionsOf(flag, caster), { hurriedTo: flag.hurriedTo, quick: flag.quick }) * timeFactor(caster);
}

function tapFor(flag: CastingState, caster: Caster): { seconds: number; roll: boolean } {
  const tap = tapping(conditionsOf(flag, caster));
  return { seconds: tap.seconds * timeFactor(caster), roll: tap.roll };
}

/** "5 s", "5 min", "1 h 2 min". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const actingCaster = (flag: CastingState): Caster => flag.casters[Math.max(0, Math.min(flag.casters.length - 1, flag.acting))]!;

const fromUuidOrNull = async (uuid: string): Promise<any> => (uuid ? fromUuid(uuid).catch(() => null) : null);

/** What the card's template shows, worked out from its state. */
async function viewOf(flag: CastingState): Promise<Record<string, unknown>> {
  const { api } = context!;
  const caster = actingCaster(flag);
  const gathering = gatheringModifiers(flag, caster);
  const last = flag.casters[finalCaster(flag.casters.map((c) => c.skill))]!;
  const final = generalModifiers(flag, last);
  const actor = await fromUuidOrNull(caster.uuid);
  const reserve = actor ? ritualPathOf(api, actor).reserve.value : 0;
  const tap = tapFor(flag, caster);
  const general = generalModifiers(flag, caster);
  const years = [0, 20, 50, 100, 500, 1000];
  const open = flag.state === "gathering";
  const together = flag.casters.length > 1;
  const lead = flag.conditional ? await fromUuidOrNull(flag.casters[0]!.uuid) : null;
  return {
    open,
    enough: flag.energy >= flag.cost,
    percent: flag.cost > 0 ? Math.min(100, Math.round((100 * flag.energy) / flag.cost)) : 100,
    anyNonAdept: flag.casters.some((c) => !c.adept),
    anyQuick: flag.casters.some((c) => c.adept) || flag.adeptTimes,
    together,
    costLabel: F("Cost", { cost: flag.cost }),
    energyLabel: `${flag.energy} / ${flag.cost} ${L("Energy")}`,
    attemptsLabel: flag.attempts ? F("Attempts", { count: flag.attempts }) : "",
    quirksLabel: flag.quirks ? F("Quirks", { count: flag.quirks }) : "",
    casters: flag.casters.map((c, index) => ({
      ...c,
      index,
      acting: index === flag.acting,
      showActing: open && together,
      showFinal: together && c === last,
      grimoireLabel: c.grimoire ? `${c.grimoire.name} +${c.grimoire.bonus}` : "",
      masteryLabel: c.mastery ? `${game.i18n.localize("GCC.MH1.Ritual.Mastery")} +${c.mastery}` : "",
      openGrimoire: open && Boolean(c.grimoire),
      usedGrimoire: !open && c.useGrimoire && Boolean(c.grimoire),
    })),
    gather: { label: F("GatherAction", { target: caster.skill + total(gathering), time: duration(gatherSecondsFor(flag, caster)) }), note: describeModifiers(gathering) },
    cast: { label: `${F("CastAction", { target: last.skill + total(final) })}${together ? ` (${last.name})` : ""}`, note: describeModifiers(final) },
    reserve: reserve
      ? `${F("ReserveAction", { reserve, time: duration(tap.seconds) })}${tap.roll ? ` (${F("TapRoll", { target: caster.skill + total(general) })})` : ""}`
      : "",
    sacrifice: `${F("SacrificeAction", { time: duration(tap.seconds) })}${tap.roll ? ` (${F("TapRoll", { target: caster.skill + total(general) })})` : ""}`,
    desecrated: flag.siteYears < 0,
    elapsed: duration(Math.max(0, ...flag.casters.map((c) => c.seconds))),
    sites: [
      { value: "-1", label: L("SiteDesecrated"), selected: flag.siteYears < 0 },
      ...years.map((y) => ({ value: String(y), label: y ? F("SiteYears", { years: y }) : L("SiteOrdinary"), selected: flag.siteYears === y })),
    ],
    charms: lead
      ? [...(lead.items ?? [])]
        .filter((i: any) => i.type === "equipment" && !equipmentData(i).charm.ritual)
        .map((i: any) => ({ id: i.id, name: i.name, selected: i.id === flag.charmItemId }))
      : [],
    workspaces: (Object.keys(CHARM_WORKSPACES) as CharmWorkspace[]).map((w) => ({
      value: w, label: `${L(`Workspace.${w}`)} (${signed(CHARM_WORKSPACES[w])})`, selected: flag.workspace === w,
    })),
    consecrations: (["consecrated", "hasty", "none"] as Consecration[]).map((c) => ({ value: c, label: L(`Consecration.${c}`), selected: flag.consecration === c })),
  };
}

/** Redraws the card from its state. */
async function save(message: any, flag: CastingState): Promise<void> {
  const updated = await context!.api.chat.update(message, { casting: flag, view: await viewOf(flag) });
  if (!updated) ui.notifications?.warn(L("NotYourCard"));
}

/** Rolls 3d6 against a target, for a step of the casting. */
async function roll3d6(target: number): Promise<{ roll: any; result: RitualRoll & { total: number } }> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
  const resolved = context!.api.rules.resolveSuccess(roll.total, target, dice);
  return { roll, result: { ...resolved, total: roll.total } };
}

/**
 * A character as a caster of this ritual: the Path they would roll, and the
 * bonuses their own copy of the ritual earns. Null for somebody who cannot
 * cast it at all.
 */
function casterFor(actor: any, effects: RitualEffectEntry[], identity: string): Caster | null {
  const { api, on } = context!;
  if (!on() || !actor) return null;
  const state = ritualPathOf(api, actor);
  // Ritual Mastery and a grimoire attach to the ritual as defined, so they
  // come from this caster's own ritual with the same definition, if any.
  const own = [...(actor.items ?? [])].find((i: any) => i.type === RITUAL_TYPE && i.system?.derived?.identity === identity);
  const skill = ritualSkillOf(api, actor, own ?? { name: "", system: { effects, derived: { identity } } as unknown as RitualSystem }, true);
  if (skill.level === null || !skill.path) return null;
  return {
    uuid: String(actor.uuid),
    name: String(actor.name),
    skillName: skill.name,
    skill: skill.level,
    adept: state.adept,
    magery: state.magery,
    mastery: own ? skill.mastery : 0,
    grimoire: own && skill.grimoire && skill.grimoire.bonus > 0 ? { name: skill.grimoire.name, bonus: skill.grimoire.bonus } : null,
    useGrimoire: false,
    seconds: 0,
  };
}

/** Starts working a ritual from its item: the card, with nothing gathered yet. */
export async function startRitualCasting(actor: any, item: any, options: { extend?: { activeId: string; step: number } } = {}): Promise<void> {
  if (!context || !cardId) return;
  if (!context.on()) {
    ui.notifications?.info(L("SwitchOff"));
    return;
  }
  if (item?.type !== RITUAL_TYPE) return;
  const effects = effectsOf(item);
  if (!effects.length) {
    ui.notifications?.warn(L("NoEffects"));
    return;
  }
  const identity = String(item.system?.derived?.identity ?? "");
  const caster = casterFor(actor, effects, identity);
  if (!caster) {
    const path = ritualSkillOf(context.api, actor, item, true).name;
    ui.notifications?.warn(F("Uncastable", { path }));
    return;
  }
  const casting = item.system?.casting ?? {};
  // An extension costs "that required for the additional duration", using the same Path (p. 37).
  const running = options.extend ? casterData(actor).active.find((r) => r.id === options.extend!.activeId) : null;
  const extensionCost = running ? extensionEnergy({ originalSeconds: running.originalSeconds, addedStep: options.extend!.step }) : null;
  if (options.extend && extensionCost === null) {
    ui.notifications?.warn(L("ExtendTooLong"));
    return;
  }
  const flag: CastingState = {
    itemId: String(item.id),
    name: running ? F("ExtensionName", { name: String(item.name) }) : String(item.name),
    identity,
    effects,
    cost: extensionCost ?? Number(item.system?.derived?.cost?.total ?? 0),
    durationSeconds: ritualDurationSeconds({ step: Number(casting.durationStep) || 0, extraMonths: Number(casting.extraMonths) || 0, years: Number(casting.years) || 0 }),
    mayBeConditional: !running && mayBeConditional(effects),
    conditional: false,
    condition: "",
    charmItemId: "",
    workspace: "basic",
    extend: running ? { activeId: running.id, seconds: ritualDurationSeconds({ step: options.extend!.step }) } : null,
    information: casting.rangeKind === "information",
    casters: [caster],
    acting: 0,
    connected: true,
    consecration: "none",
    adeptTimes: false,
    siteYears: 0,
    hurriedTo: 5,
    energy: 0,
    attempts: 0,
    quick: false,
    quirks: 0,
    donors: [],
    log: [],
    state: "gathering",
  };
  await context.api.chat.post(cardId, { casting: flag, view: await viewOf(flag) }, { actor });
}

/** The card's state, copied, for a step to change. */
const stateOf = (data: any): CastingState | null =>
  data?.casting && Array.isArray(data.casting.casters) ? (foundry.utils.deepClone(data.casting) as CastingState) : null;

/** Whether a GM is at the table: the circumstances are theirs to say, and a table without one lets the player. */
const mayRule = () => Boolean(game.user?.isGM) || !game.users?.some?.((u: any) => u.isGM && u.active);

/** The card's settings, as its inputs change them. */
async function changeSetting(message: any, data: any, key: string, input: { value?: string; checked?: boolean; button: HTMLElement }): Promise<void> {
  const flag = stateOf(data);
  if (!flag || flag.state !== "gathering") return;
  const checked = Boolean(input.checked);
  const value = String(input.value ?? "");
  switch (key) {
    case "connected": flag.connected = checked; break;
    case "adeptTimes": flag.adeptTimes = checked; break;
    case "consecration": flag.consecration = (["consecrated", "hasty", "none"].includes(value) ? value : "none") as Consecration; break;
    case "siteYears": flag.siteYears = Number(value) || 0; break;
    case "hurriedTo": flag.hurriedTo = Math.max(1, Math.min(5, Math.floor(Number(value) || 5))); break;
    case "acting": flag.acting = Math.max(0, Math.min(flag.casters.length - 1, Number(value) || 0)); break;
    case "conditional": flag.conditional = checked && flag.mayBeConditional; if (!flag.conditional) flag.charmItemId = ""; break;
    case "condition": flag.condition = value.slice(0, 200); break;
    case "workspace": flag.workspace = (value in CHARM_WORKSPACES ? value : "basic") as CharmWorkspace; break;
    case "charm": {
      // "The actual creation requires 30 minutes to prepare the object" (p. 39).
      const had = Boolean(flag.charmItemId);
      flag.charmItemId = flag.conditional ? value : "";
      const lead = flag.casters[0]!;
      if (!had && flag.charmItemId) lead.seconds += CHARM_PREPARATION_SECONDS;
      if (had && !flag.charmItemId) lead.seconds = Math.max(0, lead.seconds - CHARM_PREPARATION_SECONDS);
      break;
    }
    case "grimoire": {
      const caster = flag.casters[Number(input.button?.dataset?.index)];
      if (caster?.grimoire) caster.useGrimoire = checked;
      break;
    }
    default: return;
  }
  await save(message, flag);
}

/** A step of the casting, from one of the card's buttons. */
async function act(message: any, data: any, action: string): Promise<void> {
  const flag = stateOf(data);
  if (!flag || flag.state !== "gathering") return;
  const caster = actingCaster(flag);
  const actor = await fromUuidOrNull(caster.uuid);
  if (!actor) return;
  switch (action) {
    case "gather": return gather(message, flag, caster);
    case "reserve": return tapReserve(message, actor, flag, caster);
    case "sacrifice": return sacrificeTo(message, actor, flag, caster);
    case "cast": return castRitual(message, flag);
    case "join": return joinCasters(message, flag);
    case "abandon":
      flag.state = "abandoned";
      flag.log.push({ text: F("Abandoned", { energy: flag.energy }), kind: "note" });
      return save(message, flag);
  }
}

const targetedActors = (): any[] => [...(game.user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);

/**
 * Adds the targeted characters as casters (p. 39): "add their energy totals
 * together", each at -1 for every caster past the first.
 */
async function joinCasters(message: any, flag: CastingState): Promise<void> {
  let added = 0;
  for (const actor of targetedActors()) {
    if (!actor?.uuid || flag.casters.some((c) => c.uuid === actor.uuid)) continue;
    const caster = casterFor(actor, flag.effects, flag.identity);
    if (!caster) {
      ui.notifications?.warn(F("CannotJoin", { name: String(actor.name) }));
      continue;
    }
    flag.casters.push(caster);
    flag.log.push({ text: F("Joined", { name: caster.name, skill: `${caster.skillName}-${caster.skill}` }), kind: "note" });
    added += 1;
  }
  if (!added) {
    ui.notifications?.warn(L("JoinHint"));
    return;
  }
  await save(message, flag);
}

/** One attempt to gather ambient energy (p. 35). */
async function gather(message: any, flag: CastingState, caster: Caster): Promise<void> {
  if (flag.siteYears < 0 || flag.energy >= flag.cost) return;
  const target = caster.skill + total(gatheringModifiers(flag, caster));
  const { result } = await roll3d6(target);
  const outcome = gatheringOutcome(result);
  caster.seconds += gatherSecondsFor(flag, caster);
  flag.attempts += 1;
  flag.quick = outcome.quick;
  const rolled = F("RolledBy", { name: caster.name, roll: result.total, target });
  if (outcome.backfire) {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
  } else {
    flag.energy += outcome.energy;
    if (outcome.quirk) flag.quirks += 1;
    flag.log.push({
      text: `${rolled}: ${F(outcome.quirk ? "GatheredQuirk" : outcome.quick ? "GatheredQuick" : "Gathered", { energy: outcome.energy })}`,
      kind: outcome.quirk ? "quirk" : "gain",
    });
  }
  await save(message, flag);
}

/**
 * A roll to tap a source, which only a non-adept working at an adept's speed
 * has to make (p. 36). False where it failed and nothing was drawn.
 */
async function tapRoll(message: any, flag: CastingState, caster: Caster): Promise<boolean> {
  const tap = tapFor(flag, caster);
  caster.seconds += tap.seconds;
  if (!tap.roll) return true;
  const target = caster.skill + total(generalModifiers(flag, caster));
  const { result } = await roll3d6(target);
  const rolled = F("RolledBy", { name: caster.name, roll: result.total, target });
  if (result.criticalFailure) {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
    await save(message, flag);
    return false;
  }
  if (!result.success) {
    flag.log.push({ text: `${rolled}: ${L("TapFailed")}`, kind: "bad" });
    await save(message, flag);
    return false;
  }
  return true;
}

/** Draws on the acting caster's mana reserve (p. 36). */
async function tapReserve(message: any, actor: any, flag: CastingState, caster: Caster): Promise<void> {
  // A caster who joined from another player's sheet draws on their own
  // reserve only through someone who may change it.
  if (!actor.isOwner) {
    ui.notifications?.warn(F("NotYours", { name: caster.name }));
    return;
  }
  const reserve = ritualPathOf(context!.api, actor).reserve.value;
  const needed = Math.max(0, flag.cost - flag.energy);
  if (reserve <= 0 || needed <= 0) return;
  const amount = await askNumbers(L("ReserveTitle"), [{ key: "amount", label: F("ReservePrompt", { reserve }), initial: Math.min(reserve, needed), max: reserve }]);
  const drawn = Math.min(reserve, Math.max(0, Math.floor(amount?.amount ?? 0)));
  if (!drawn) return;
  if (!(await tapRoll(message, flag, caster))) return;
  await storeReserve(actor, reserve - drawn);
  flag.energy += drawn;
  flag.log.push({ text: F("FromReserve", { name: caster.name, energy: drawn, left: reserve - drawn }), kind: "gain" });
  await save(message, flag);
}

/**
 * A sacrifice of HP and FP, from a caster or a willing subject touching them:
 * "Every 2 HP or 3 FP expended translate into a point of energy", and "Each
 * person is a separate source, and may only contribute to a given ritual
 * once" (p. 36). The willing are the casters and whoever the user has
 * targeted.
 */
async function sacrificeTo(message: any, actor: any, flag: CastingState, caster: Caster): Promise<void> {
  const others = await Promise.all(flag.casters.map((c) => fromUuidOrNull(c.uuid)));
  const candidates = [actor, ...others, ...targetedActors()]
    .filter((a: any, i: number, all: any[]) => a?.uuid && all.findIndex((b: any) => b?.uuid === a.uuid) === i)
    .filter((a: any) => !flag.donors.includes(String(a.uuid)));
  if (!candidates.length) {
    ui.notifications?.warn(L("NoDonors"));
    return;
  }
  const answer = await askNumbers(L("SacrificeTitle"), [
    { key: "hp", label: L("SacrificeHp"), initial: 0 },
    { key: "fp", label: L("SacrificeFp"), initial: 0 },
  ], candidates.map((c: any) => ({ value: String(c.uuid), label: String(c.name) })));
  if (!answer) return;
  const donor = candidates.find((c: any) => String(c.uuid) === answer.donor) ?? candidates[0];
  const spent = sacrifice({ hp: answer.hp ?? 0, fp: answer.fp ?? 0 });
  if (!spent.energy) return;
  if (!donor.isOwner) {
    ui.notifications?.warn(F("CannotApply", { names: String(donor.name) }));
    return;
  }
  if (!(await tapRoll(message, flag, caster))) return;
  const label = flag.name;
  if (spent.hp) await context!.api.actors.applyInjury(donor, { amount: spent.hp, label });
  if (spent.fp) await context!.api.actors.applyInjury(donor, { amount: spent.fp, fatigue: true, label });
  flag.donors.push(String(donor.uuid));
  flag.energy += spent.energy;
  flag.log.push({ text: F("Sacrificed", { name: String(donor.name), hp: spent.hp, fp: spent.fp, energy: spent.energy }), kind: "gain" });
  await save(message, flag);
}

/** The final roll, made by the caster with the highest skill (pp. 36-37, 39). */
async function castRitual(message: any, flag: CastingState): Promise<void> {
  if (flag.energy < flag.cost) return;
  const caster = flag.casters[finalCaster(flag.casters.map((c) => c.skill))]!;
  const actor = await fromUuidOrNull(caster.uuid);
  if (!actor) return;
  const target = caster.skill + total(generalModifiers(flag, caster));
  const { roll, result } = await roll3d6(target);
  const outcome = finalOutcome(result, { information: flag.information });

  // "For spells to learn information, the GM rolls": the roll goes to the GM
  // alone, and the card says only that it was made.
  if (flag.information) {
    const gms = (game.users?.filter?.((u: any) => u.isGM) ?? []).map((u: any) => u.id);
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      whisper: gms,
      blind: true,
      rolls: [roll],
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(flag.name)}</span></div>`
        + `<div class="gc-result ${result.success ? "success" : "failure"}">${esc(F("Rolled", { roll: result.total, target }))}: `
        + `${esc(L(outcome.kind === "lie" ? "InformationLie" : outcome.kind === "retry" ? "InformationRetry" : "InformationTrue"))}</div></div>`,
    });
    if (outcome.kind === "retry") {
      caster.seconds += outcome.retrySeconds;
      flag.log.push({ text: L("InformationRolledRetry"), kind: "note" });
    } else {
      flag.state = "cast";
      flag.log.push({ text: L("InformationRolled"), kind: "note" });
    }
    return save(message, flag);
  }

  const rolled = F("RolledBy", { name: caster.name, roll: result.total, target });
  if (outcome.kind === "backfire") {
    flag.state = "backfired";
    flag.log.push({ text: `${rolled}: ${F("Backfire", { energy: backfireEnergy(flag.energy) })}`, kind: "bad" });
    return save(message, flag);
  }
  if (outcome.kind === "retry") {
    caster.seconds += outcome.retrySeconds;
    flag.log.push({ text: `${rolled}: ${F("Retry", { seconds: outcome.retrySeconds })}`, kind: "bad" });
    return save(message, flag);
  }

  flag.state = "cast";
  flag.log.push({ text: `${rolled}: ${F("Cast", { margin: result.margin })}`, kind: "gain" });
  if (outcome.refillReserve) await refillReserve(actor, flag);
  await recordRitual(flag, result.margin);
  await save(message, flag);
  await offerResistance(actor, flag.name, result.total, target, flag.casters.map((c) => c.uuid));
}

/**
 * Puts a cast ritual on its caster's sheet (pp. 37-39): an extension adds to
 * the one it extends; a conditional ritual hangs, defusing the oldest past
 * the limit, and is bound to its charm if it has one; anything else lasts its
 * duration. A ritual sharing an effect with one already in effect is noted,
 * with which would remain on the same subject.
 */
async function recordRitual(flag: CastingState, margin: number): Promise<void> {
  const lead = await fromUuidOrNull(flag.casters[0]!.uuid);
  if (!lead?.isOwner) return;
  const now = Number(game.time?.worldTime ?? 0) || 0;
  const active = casterData(lead).active;

  if (flag.extend) {
    const running = active.find((r) => r.id === flag.extend!.activeId);
    if (!running) return;
    running.expiresAt = Math.max(Number(running.expiresAt ?? now), now) + flag.extend.seconds;
    running.durationSeconds += flag.extend.seconds;
    await storeActive(lead, active);
    flag.log.push({ text: F("Extended", { name: running.name, time: duration(flag.extend.seconds) }), kind: "note" });
    return;
  }

  for (const other of active) {
    const shared = sharedEffects(flag.effects, other.effects ?? []);
    if (!shared.length || other.conditional !== flag.conditional) continue;
    const survivor = stackingSurvivor(Number(other.energy) || 0, flag.cost) === "new" ? flag.name : other.name;
    flag.log.push({ text: F("Stacking", { other: other.name, effects: shared.join(", "), survivor }), kind: "note" });
  }

  const id = foundry.utils.randomID();
  const charm = flag.conditional && flag.charmItemId ? lead.items.get(flag.charmItemId) : null;
  const entry: RitualInEffect = {
    id,
    itemId: flag.itemId,
    name: flag.name,
    energy: flag.cost,
    margin,
    effects: flag.effects,
    durationSeconds: flag.durationSeconds,
    originalSeconds: flag.durationSeconds,
    startedAt: now,
    expiresAt: flag.conditional ? null : now + flag.durationSeconds,
    conditional: flag.conditional,
    condition: flag.condition,
    charm: charm ? String(charm.name) : "",
  };

  if (flag.conditional) {
    const limit = ritualPathOf(context!.api, lead).conditional.limit;
    const result = hangConditional(active.filter((r) => r.conditional), entry, limit);
    const defusedIds = new Set(result.defused.map((r) => r.id));
    await storeActive(lead, [...active.filter((r) => !r.conditional), ...result.hanging]);
    for (const gone of result.defused) flag.log.push({ text: F("Defused", { name: gone.name, limit }), kind: "bad" });
    // A defused ritual's charm is an ordinary object again.
    for (const item of [...(lead.items ?? [])]) {
      if (item.type === "equipment" && defusedIds.has(equipmentData(item).charm.activeId)) await storeCharm(item, NO_CHARM);
    }
    if (charm) {
      await storeCharm(charm, { ritual: flag.name, margin, casterUuid: String(lead.uuid), activeId: id, condition: flag.condition });
      flag.log.push({ text: F("Charmed", { item: String(charm.name) }), kind: "note" });
    } else {
      flag.log.push({ text: F("Hanging", { count: result.hanging.length, limit }), kind: "note" });
    }
    return;
  }

  // A momentary ritual is over as soon as it works.
  if (flag.durationSeconds <= 0) return;
  active.push(entry);
  await storeActive(lead, active);
}

/**
 * Sets off a conditional ritual (p. 38): "once triggered, it will last for
 * its normal duration", with the margin it was cast with. From its charm
 * when the charm is broken, or from the caster's sheet when the condition
 * is met.
 */
export async function triggerRitual(caster: any, activeId: string, source: string): Promise<void> {
  const entry = casterData(caster).active.find((r) => r.id === activeId && r.conditional);
  if (!entry || !triggerCardId) return;
  // Only someone who may change the caster's sheet can start the ritual on
  // it. Anyone else -- a friend breaking the charm they were given -- posts
  // the card with a control for the caster's player or the GM to do so.
  const started = caster.isOwner ? await startTriggered(caster, activeId) : false;
  await context!.api.chat.post(triggerCardId, {
    name: entry.name,
    triggered: F("Triggered", { source, margin: entry.margin }),
    lasts: entry.durationSeconds > 0 ? F("LastsFor", { time: duration(entry.durationSeconds) }) : "",
    waiting: started ? "" : F("TriggerWaiting", { name: String(caster.name ?? "") }),
    activeId,
    pending: !started,
    startLabel: L("StartTriggered"),
  }, { actor: caster });
}

/** Starts a triggered conditional ritual on its caster's sheet. False where it was no longer hanging. */
async function startTriggered(caster: any, activeId: string): Promise<boolean> {
  const active = casterData(caster).active;
  const index = active.findIndex((r) => r.id === activeId && r.conditional);
  if (index < 0) return false;
  const entry = active[index]!;
  const now = Number(game.time?.worldTime ?? 0) || 0;
  if (entry.durationSeconds > 0) Object.assign(entry, { conditional: false, charm: "", startedAt: now, expiresAt: now + entry.durationSeconds });
  else active.splice(index, 1);
  await storeActive(caster, active);
  return true;
}

/**
 * Breaks a charm (p. 38): "The ritual can be triggered by the subject
 * breaking the charm. This takes a Ready maneuver". The object is gone, and
 * the spell "goes off automatically, using its original margin of success".
 */
export async function breakCharm(item: any): Promise<void> {
  const charm = equipmentData(item).charm;
  if (item?.type !== "equipment" || !charm.ritual) return;
  const caster = await fromUuidOrNull(charm.casterUuid);
  const holder = item.actor;
  const source = F("CharmBroken", { item: String(item.name), name: String(holder?.name ?? "") });
  if (caster && casterData(caster).active.some((r) => r.id === charm.activeId)) {
    await triggerRitual(caster, charm.activeId, source);
  } else {
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: holder }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(charm.ritual)}</span></div>`
        + `<div class="gc-result success">${esc(F("Triggered", { source, margin: charm.margin }))}</div></div>`,
    });
  }
  const quantity = Number(item.system?.quantity ?? 1) || 1;
  if (quantity > 1) {
    await item.update({ "system.quantity": quantity - 1, [`system.extensions.${MODULE_ID}.charm`]: NO_CHARM });
  } else {
    await item.delete();
  }
}

/** "A caster may cancel all the effects of his own ritual before they expire" (p. 37); a conditional one he may not. */
export async function cancelRitual(caster: any, activeId: string): Promise<void> {
  const active = casterData(caster).active;
  const entry = active.find((r) => r.id === activeId);
  if (!entry || !caster.isOwner) return;
  if (entry.conditional && !game.user?.isGM) {
    ui.notifications?.warn(L("CannotCancelConditional"));
    return;
  }
  await storeActive(caster, active.filter((r) => r.id !== activeId));
}

/** Asks how long to extend a ritual by, no longer than it first lasted, and opens its casting card (p. 37). */
export async function extendRitual(caster: any, activeId: string): Promise<void> {
  const entry = casterData(caster).active.find((r) => r.id === activeId);
  const item = entry ? caster.items.get(entry.itemId) : null;
  if (!entry || entry.conditional || !item) return;
  const steps = RITUAL_DURATIONS.map((d, step) => ({ d, step }))
    .filter(({ step }) => step > 0 && extensionEnergy({ originalSeconds: entry.originalSeconds, addedStep: step }) !== null);
  if (!steps.length) return;
  const answer = await (foundry.applications.api as any).DialogV2.prompt({
    window: { title: F("ExtensionName", { name: String(entry.name) }) },
    content: `<div class="gworld"><label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("ExtendBy"))}</span><select name="step">${steps
      .map(({ d, step }) => `<option value="${step}" ${step === steps.at(-1)!.step ? "selected" : ""}>${esc(game.i18n.localize(`GCC.MH1.Ritual.Duration.${d}`))} (${step})</option>`)
      .join("")}</select></label></div>`,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) => Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="step"]')?.value ?? 0),
    },
    rejectClose: false,
  });
  if (!answer) return;
  await startRitualCasting(caster, item, { extend: { activeId, step: Number(answer) } });
}

/** What the Magic tab shows of a ritual in effect: how long is left, or what it waits for. */
export function describeRitualInEffect(entry: RitualInEffect): { status: string; expired: boolean } {
  if (entry.conditional) {
    return { status: entry.charm ? F("OnCharm", { item: entry.charm }) : F("WaitingFor", { condition: entry.condition || "—" }), expired: false };
  }
  const now = Number(game.time?.worldTime ?? 0) || 0;
  const left = Number(entry.expiresAt ?? now) - now;
  return left > 0 ? { status: F("Remaining", { time: duration(left) }), expired: false } : { status: L("Expired"), expired: true };
}

/** A critical success "instantly refills the caster's mana reserve" (p. 37). */
async function refillReserve(actor: any, flag: { log: LogEntry[] }): Promise<void> {
  const max = ritualPathOf(context!.api, actor).reserve.max;
  if (max <= 0) return;
  // The ritual still works; the refill is for whoever may change that sheet.
  if (!actor.isOwner) {
    flag.log.push({ text: F("RefillNotYours", { name: String(actor.name ?? ""), max }), kind: "note" });
    return;
  }
  await storeReserve(actor, max);
  flag.log.push({ text: F("ReserveRefilled", { max }), kind: "gain" });
}

/**
 * "Every potential subject who is not a willing participant resists with the
 * better of his HT or Will, plus any Magic Resistance" (p. 36).
 */
async function offerResistance(actor: any, name: string, roll: number, target: number, casters: string[]): Promise<void> {
  const subjects = targetedActors().filter((s: any) => s?.uuid && !casters.includes(s.uuid));
  if (!subjects.length) return;
  await context!.api.magic.postResistance({
    caster: actor,
    label: name,
    casterRoll: roll,
    casterEffective: target,
    subjects,
    resistWith: ["HT", "Will"],
    // The system's own ritual card had no Rule of 16, and the book's rituals name none.
    ruleOf16: false,
  });
}

// ── blocking rituals ─────────────────────────────────────────────────────────

/** The rituals a defender may cast as a blocking spell: marked so by the GM, and within reach. */
export function blockingRitualsOf(defender: any): Array<{ item: any; name: string; level: number; cost: number }> {
  if (!context?.on()) return [];
  return [...(defender?.items ?? [])]
    .filter((i: any) => i.type === RITUAL_TYPE && i.system?.blocking)
    .map((i: any) => ({ item: i, name: String(i.name), level: ritualSkillOf(context!.api, defender, i, true).level, cost: Number(i.system?.derived?.cost?.total ?? 0) }))
    .filter((r): r is { item: any; name: string; level: number; cost: number } => typeof r.level === "number");
}

/**
 * A ritual cast as a defense (p. 37). It "counts as an active defense, and
 * requires the adept to accumulate the necessary energy in zero time":
 * the mana reserve is tapped at -5, ambient energy is gathered at -10, and a
 * non-adept takes their own -5 more for casting quickly. "If any of the rolls
 * fail before enough energy is drawn, the ritual isn't quick enough to work".
 * A grimoire, which doubles the time, cannot be read in no time at all.
 */
export async function castBlockingRitual(defender: any, item: any, attack: string): Promise<void> {
  if (!context || !defender?.isOwner || item?.type !== RITUAL_TYPE || !context.on()) return;
  const effects = effectsOf(item);
  const caster = casterFor(defender, effects, String(item.system?.derived?.identity ?? ""));
  if (!caster) return;
  const cost = Number(item.system?.derived?.cost?.total ?? 0);
  const conditions: CastingConditions = { adept: caster.adept, magery: caster.magery, connected: true, consecration: "consecrated", adeptTimes: true };
  const general = nonAdeptPenalties(conditions).reduce((sum, p) => sum + p.value, 0) + caster.mastery;
  const log: LogEntry[] = [];
  let energy = 0;
  let attempts = 0;
  let outcome: "blocked" | "slow" | "backfire" = "slow";

  const step = async (target: number) => {
    const { result } = await roll3d6(target);
    return { result, text: F("Rolled", { roll: result.total, target }) };
  };

  const reserve = ritualPathOf(context.api, defender).reserve.value;
  let failed = false;
  if (reserve > 0 && cost > 0) {
    const { result, text } = await step(caster.skill + general + BLOCKING_TAP_PENALTY);
    if (result.success) {
      const drawn = Math.min(reserve, cost);
      energy += drawn;
      await storeReserve(defender, reserve - drawn);
      log.push({ text: `${text}: ${F("FromReserve", { name: caster.name, energy: drawn, left: reserve - drawn })}`, kind: "gain" });
    } else {
      failed = true;
      outcome = result.criticalFailure ? "backfire" : "slow";
      log.push({ text: `${text}: ${L("TapFailed")}`, kind: "bad" });
    }
  }
  while (!failed && energy < cost && attempts < 20) {
    attempts += 1;
    const { result, text } = await step(caster.skill + general + BLOCKING_GATHER_PENALTY + gatheringStreakPenalty(attempts));
    const gathered = gatheringOutcome(result);
    if (!result.success) {
      failed = true;
      outcome = gathered.backfire ? "backfire" : "slow";
      log.push({ text: `${text}: ${L("TooSlow")}`, kind: "bad" });
      break;
    }
    energy += gathered.energy;
    log.push({ text: `${text}: ${F("Gathered", { energy: gathered.energy })}`, kind: "gain" });
  }
  if (!failed && energy >= cost) {
    const { result, text } = await step(caster.skill + general);
    const final = finalOutcome(result);
    outcome = final.kind === "success" ? "blocked" : final.kind === "backfire" ? "backfire" : "slow";
    log.push({ text: `${text}: ${outcome === "blocked" ? F("Cast", { margin: result.margin }) : L("TooSlow")}`, kind: outcome === "blocked" ? "gain" : "bad" });
    if (final.refillReserve) await refillReserve(defender, { log });
  }

  const resultText = outcome === "blocked" ? L("Blocked") : outcome === "backfire" ? F("Backfire", { energy: backfireEnergy(energy) }) : L("BlockFailed");
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: defender }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(F("DefendingAgainst", { defense: String(item.name), attack }))}</span>`
      + `<span class="gc-target">${esc(`${caster.skillName}-${caster.skill}`)}</span></div>`
      + `<ol class="gc-log" style="margin: 4px 0; padding-left: 18px">${log.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ol>`
      + `<div class="gc-result ${outcome === "blocked" ? "success" : "failure"}">${esc(resultText)}</div>`
      + `<div class="gc-note">${esc(L("BlockingNote"))}</div></div>`,
  });
}

/** A small form of numbers, with a choice of whose they are where there is one. */
async function askNumbers(
  title: string,
  fields: Array<{ key: string; label: string; initial: number; max?: number }>,
  donors?: Array<{ value: string; label: string }>,
): Promise<Record<string, any> | null> {
  const row = (inner: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center">${inner}</label>`;
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
    ${donors && donors.length > 1
      ? row(`<span>${esc(L("Donor"))}</span><select name="donor">${donors.map((d) => `<option value="${esc(d.value)}">${esc(d.label)}</option>`).join("")}</select>`)
      : ""}
    ${fields.map((f) => row(`<span>${esc(f.label)}</span><input type="number" name="${f.key}" value="${f.initial}" min="0" ${f.max !== undefined ? `max="${f.max}"` : ""} step="1" style="width:80px">`)).join("")}
  </div>`;
  const answer = await (foundry.applications.api as any).DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: L("Apply"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const out: Record<string, any> = { donor: form?.querySelector<HTMLSelectElement>('select[name="donor"]')?.value ?? donors?.[0]?.value };
        for (const f of fields) out[f.key] = Number(form?.querySelector<HTMLInputElement>(`input[name="${f.key}"]`)?.value ?? 0) || 0;
        return out;
      },
    },
    rejectClose: false,
  });
  return answer && typeof answer === "object" ? (answer as Record<string, any>) : null;
}

/** Registers the casting card, the trigger card and the blocking defense. */
export function registerCastingCards(ctx: RitualContext): void {
  context = ctx;
  const { api } = ctx;
  const open = (_message: any, data: any) => data?.casting?.state === "gathering";
  const step = (name: string) => ({ visible: open, run: ({ message, data }: any) => act(message, data, name) });
  const setting = (name: string, ruling = false) => ({
    visible: (message: any, data: any) => open(message, data) && (!ruling || mayRule()),
    run: ({ message, data, value, checked, button }: any) => changeSetting(message, data, name, { value, checked, button }),
  });
  cardId = api.chat.registerChatCard({
    module: MODULE_ID,
    key: "mh1-ritual",
    template: `modules/${MODULE_ID}/templates/mh1-ritual-casting.hbs`,
    actions: {
      gather: step("gather"),
      reserve: step("reserve"),
      sacrifice: step("sacrifice"),
      cast: step("cast"),
      join: step("join"),
      abandon: step("abandon"),
      acting: setting("acting"),
      grimoire: setting("grimoire"),
      connected: setting("connected", true),
      consecration: setting("consecration", true),
      siteYears: setting("siteYears", true),
      adeptTimes: setting("adeptTimes"),
      conditional: setting("conditional"),
      condition: setting("condition"),
      charm: setting("charm"),
      workspace: setting("workspace"),
      hurriedTo: setting("hurriedTo"),
    },
  });
  triggerCardId = api.chat.registerChatCard({
    module: MODULE_ID,
    key: "mh1-ritual-trigger",
    template: `modules/${MODULE_ID}/templates/mh1-ritual-trigger.hbs`,
    actions: {
      start: {
        visible: (_message: any, data: any) => Boolean(data?.pending),
        run: async ({ message, data, actor }: any) => {
          if (!actor?.isOwner) return;
          await startTriggered(actor, String(data.activeId));
          await api.chat.update(message, { ...data, pending: false, waiting: "" });
        },
      },
    },
  });
  api.combat.registerDefense({
    module: MODULE_ID,
    key: "mh1-blocking-ritual",
    label: L("BlockingNote"),
    choices: (defender) => blockingRitualsOf(defender).map((r) => ({ id: String(r.item.id), label: `${r.name} ${r.level} (${r.cost})`, hint: L("BlockingNote") })),
    run: ({ defender, attack, choice }) => castBlockingRitual(defender, defender.items.get(choice.id), attack),
  });
}
