/**
 * High-Tech's protective oddments and portable cover (pp. 68-72, 225),
 * registered with the system through the add-on API under two switches. The
 * rules are in `rules.ts`; what a piece is comes from its record's name, and
 * whether it is in use from its being worn (equipped).
 *
 *   - **Protective oddments (protectiveOddments):** worn footwear's Stealth
 *     line (`gworld.skillBonuses`); a row action to break new footwear in, with
 *     moderate or terrible pain for 2d days on a failure; a hockey glove's
 *     Ham-Fisted 1, ear protection's Protected Hearing (and Hard of Hearing),
 *     goggles' Nictitating Membrane and tinted lenses' Protected Vision, and
 *     eyeglasses or contact lenses correcting Bad Sight, all through
 *     `gworld.traitEffects`; a cup's +2 and a mouthguard's +1 to knockdown for
 *     groin and face hits (the knockdown roll's `blow`); the mouthguard's
 *     speech as Disturbing Voice; eyeglasses' DR 1 on the eyes
 *     (`gworld.armorDr`), and a head hit that breaks them on a 1 or knocks
 *     them off on 2-3 (`gworld.afterDamage`); a row action that makes
 *     homemade armour with Armoury (Body Armor); tinted plain goggles giving
 *     Protected Vision; electronic ear protection with its cells spent
 *     muffling as the plain kind does; and a row action that puts goggles or
 *     glasses on or takes them off, a Ready maneuver in combat.
 *   - **Portable cover (portableCover):** a row action on an explosives or
 *     radiation blanket that sets off a charge beneath it, the blanket's DR
 *     25 coming off the charge's damage roll (`hazards.detonate`,
 *     `gworld.damageModifiers`); a row action that holds a blanket up as
 *     cover for its bearer and the targeted characters, its DR 25 a line on
 *     each one's blows from the front (`gworld.armorDr`); and a radiation
 *     blanket giving PF 3 against a dose (`gworld.radiationDose`) to whoever
 *     has it in use, or to everyone while a row action has it laid over the
 *     source.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { powerData } from "../../../shared/power/data.js";
import { enduranceLeft } from "../../../shared/power/index.js";
import { formatDamage, parseDamage } from "../explosives/rules.js";
import {
  ARMOURY_BODY_ARMOR,
  CONTACT_LENSES,
  CUSTOM_FOOTWEAR,
  DAY_SECONDS,
  DISTURBING_VOICE,
  ELECTRONIC_EARS,
  EYEGLASSES,
  EYEGLASSES_DR,
  EYE_PROTECTION,
  HAM_FISTED_MAX,
  HEAD_LOCATIONS,
  MEMBRANE_IS_THE_DR,
  MOUTHGUARD,
  armouryLevel,
  baseName,
  blanketOf,
  breakInPain,
  breakInRoll,
  coverMeets,
  eyeglassesOnHeadHit,
  gearGrant,
  homemadeArmor,
  isVoiceSkill,
  knockdownBonus,
  shieldedRads,
  smothered,
  stealthOf,
  tlOf,
  TINTABLE,
  type CustomFootwear,
  type GearGrant,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Oddments.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Oddments.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Eyeglasses a head hit broke (p. 225): they neither correct nor protect until replaced. */
export const BROKEN_FLAG = "htBroken";
/** Footwear already broken in (p. 69). */
export const BROKEN_IN_FLAG = "htBrokenIn";
/** Plain goggles with tinted lenses (p. 71). */
export const TINTED_FLAG = "htTinted";
/** A blanket held up as cover: the uuids of the actors behind it (p. 72). */
export const COVER_FLAG = "htCover";
/** A radiation blanket laid over the source of the radiation (p. 72). */
export const LAID_FLAG = "htLaidOver";

export interface OddmentSwitches {
  oddments: () => boolean;
  cover: () => boolean;
}

/** The dice these rules roll, for the tests to fix. */
export interface OddmentDice {
  /** Rolls a formula, returning its total and the Roll to show on the card (if any). */
  roll: (formula: string) => Promise<{ total: number; roll: any }>;
}

const foundryDice: OddmentDice = {
  roll: async (formula) => {
    const roll = new Roll(formula);
    await roll.evaluate();
    return { total: Number(roll.total) || 0, roll };
  },
};

const isWorn = (item: any): boolean =>
  (item?.type === "equipment" || item?.type === "armor") && item.system?.carried !== false && item.system?.equipped === true;
const wornItems = (actor: any): any[] => [...(actor?.items ?? [])].filter(isWorn);
const isFootwear = (item: any): boolean => item?.type === "armor" && (item.system?.locations ?? []).includes("foot");
const flag = (item: any, key: string): boolean => item?.flags?.[MODULE_ID]?.[key] === true;
const named = (item: any, pattern: RegExp): boolean => pattern.test(baseName(item?.name));

/** Worn eyeglasses that are whole. */
const wornEyeglasses = (actor: any): any[] => wornItems(actor).filter((i) => named(i, EYEGLASSES) && !flag(i, BROKEN_FLAG));

/** Whether a gadget has run through the endurance its cells give. */
function outOfPower(item: any): boolean {
  const left = enduranceLeft(powerData(item));
  return Boolean(left && left !== "unlimited" && left.left <= 0);
}

/** What a piece grants as it is: its tint, and its cells for electronic ear protection. */
function grantOf(item: any): GearGrant | null {
  return gearGrant(item?.name, tlOf(item?.system?.tl), { tinted: flag(item, TINTED_FLAG), unpowered: named(item, ELECTRONIC_EARS) && outOfPower(item) });
}

const inCombat = (actor: any): boolean => Boolean((game as any).combat?.started) && Boolean((game as any).combat?.combatants?.some?.((c: any) => c?.actor?.id === actor?.id));

/** A blanket's use, as its flag keeps it: who bears it, and for cover who is behind it. */
interface BlanketUse {
  bearer: string;
  behind?: string[];
}

/**
 * A blanket's cover or laid-over flag, where it is this blanket's own: the
 * bearer it names is the actor carrying it. A copy made elsewhere names
 * someone else, and counts for nothing.
 */
function useOf(item: any, key: typeof COVER_FLAG | typeof LAID_FLAG): BlanketUse | null {
  const use = item?.flags?.[MODULE_ID]?.[key];
  if (!use || typeof use !== "object" || typeof use.bearer !== "string" || !blanketOf(item?.name)) return null;
  return use.bearer === String(item?.actor?.uuid ?? "") ? use : null;
}

/** The actors known to bear a blanket in use, by uuid, resolved with `fromUuidSync` when read. */
const bearers = new Set<string>();
let seeded = false;

/** Notes a blanket's bearer, where the blanket is in use. */
function noteBearer(item: any): void {
  const use = useOf(item, COVER_FLAG) ?? useOf(item, LAID_FLAG);
  if (use) bearers.add(use.bearer);
}

/**
 * The actors bearing a blanket in use. The first read notes the world's
 * actors and the scenes' unlinked tokens whose own items carry the flags;
 * after that, `updateItem` notes each new one.
 */
function blanketBearers(): any[] {
  if (!seeded) {
    seeded = true;
    for (const actor of (game as any).actors ?? []) for (const item of actor?.items ?? []) noteBearer(item);
    for (const scene of (game as any).scenes ?? []) {
      for (const token of scene?.tokens ?? []) {
        if (token?.actorLink) continue;
        const flagged = [...(token?.delta?.items ?? [])].some((i: any) => i?.flags?.[MODULE_ID]?.[COVER_FLAG] || i?.flags?.[MODULE_ID]?.[LAID_FLAG]);
        if (flagged && token.actor) for (const item of token.actor.items ?? []) noteBearer(item);
      }
    }
  }
  const found: any[] = [];
  for (const uuid of bearers) {
    const actor = (globalThis as any).fromUuidSync?.(uuid);
    if (actor) found.push(actor);
    else bearers.delete(uuid);
  }
  return found;
}

/** The blanket held up as cover for this character, and who holds it, or null (p. 72). */
function coverFor(actor: any): { item: any; bearer: any } | null {
  const uuid = String(actor?.uuid ?? "");
  if (!uuid) return null;
  for (const bearer of blanketBearers()) {
    for (const item of bearer?.items ?? []) {
      if (item.system?.carried !== false && useOf(item, COVER_FLAG)?.behind?.includes(uuid)) return { item, bearer };
    }
  }
  return null;
}

/** A radiation blanket laid over the source, anywhere in the world, or null (p. 72). */
function laidBlanket(): any {
  for (const bearer of blanketBearers()) {
    const item = [...(bearer?.items ?? [])].find((i: any) => useOf(i, LAID_FLAG) && (blanketOf(i.name)?.protectionFactor ?? 1) > 1);
    if (item) return item;
  }
  return null;
}

async function say(actor: any, title: string, lines: string[], rolls: any[] = []): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
    ...(rolls.length ? { rolls } : {}),
  });
}

// ── the trait effects gear grants (pp. 69-71, 225) ──

function traitEffects(context: any): void {
  const effects = context?.effects;
  const sources: any[] = Array.isArray(context?.sources) ? context.sources : [];
  if (!effects) return;
  let hamFisted: { label: string } | null = null;
  for (const item of wornItems(context.actor)) {
    const label = String(item.name ?? "");
    const grant = grantOf(item);
    if (grant?.hamFisted) hamFisted ??= { label };
    if (grant?.protectedHearing) {
      effects.protectedSense = { ...(effects.protectedSense ?? {}), hearing: true };
      sources.push({ effect: "protectedSense.hearing", label });
    }
    if (grant?.hardOfHearing) {
      effects.hardOfHearing = true;
      sources.push({ effect: "hardOfHearing", label });
    }
    if (grant?.protectedVision) {
      effects.protectedSense = { ...(effects.protectedSense ?? {}), vision: true };
      sources.push({ effect: "protectedSense.vision", label });
    }
    if (grant?.nictitatingMembrane) {
      const levels = grant.nictitatingMembrane;
      if ((Number(effects.nictitatingMembrane) || 0) < levels) effects.nictitatingMembrane = levels;
      sources.push({ effect: "nictitatingMembrane", label, value: levels });
    }
    // Eyeglasses and contact lenses correct Bad Sight while worn (p. 225).
    if (effects.badSight && ((named(item, EYEGLASSES) && !flag(item, BROKEN_FLAG)) || named(item, CONTACT_LENSES))) {
      effects.badSight = null;
      sources.push({ effect: "badSight", label: F("CorrectedSource", { name: label }) });
    }
  }
  // A glove on one hand: one level, whatever else is worn, to the trait's cap.
  if (hamFisted) {
    const levels = Math.min(HAM_FISTED_MAX, (Number(effects.hamFisted) || 0) + 1);
    effects.hamFisted = levels;
    sources.push({ effect: "hamFisted", label: hamFisted.label, value: 1 });
  }
}

// ── rows ──

async function breakIn(api: GWorldApi, item: any, actor: any, dice: OddmentDice): Promise<void> {
  const custom: any = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item.name ?? "") },
    content: `<div class="gworld"><p class="ihint">${esc(L("BreakInHint"))}</p>
      <div class="ifields"><label>${esc(L("Custom"))} <select name="custom">
        ${(Object.keys(CUSTOM_FOOTWEAR) as CustomFootwear[]).map((k) => `<option value="${k}">${esc(L(`CustomQuality.${k || "none"}`))}</option>`).join("")}
      </select></label></div></div>`,
    ok: {
      label: L("BreakIn"),
      callback: (_event: Event, button: HTMLElement) => String(button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="custom"]')?.value ?? ""),
    },
    rejectClose: false,
  });
  if (custom === null || custom === undefined) return;
  const attr = (key: "IQ" | "HT") => Number(api.actors.attribute(actor, key)) || 10;
  const use = breakInRoll({ ht: attr("HT"), iq: attr("IQ"), hiking: api.actors.skillLevel(actor, "Hiking"), soldier: api.actors.skillLevel(actor, "Soldier") });
  const bonus = CUSTOM_FOOTWEAR[(custom in CUSTOM_FOOTWEAR ? custom : "") as CustomFootwear];
  const outcome: any = await api.roll.success({
    actor, base: use.level, label: F("BreakInRoll", { name: item.name, skill: L(`BreakInSkill.${use.skill}`) }),
    skill: use.skill === "HT" ? "HT" : use.skill, kind: use.skill === "HT" ? "attribute" : "skill",
    modifiers: bonus ? [{ label: L(`CustomQuality.${custom}`), value: bonus }] : [],
    tags: ["breakingIn", "HT"], item,
  } as any);
  if (!outcome) return;
  await item.setFlag(MODULE_ID, BROKEN_IN_FLAG, true);
  const pain = breakInPain(outcome);
  if (!pain) return void (await say(actor, String(item.name ?? ""), [F("BrokenIn", { name: item.name })]));
  const days = await dice.roll("2d6");
  await api.actors.applyCondition(actor, { key: pain, duration: { seconds: days.total * DAY_SECONDS } } as any);
  await say(actor, String(item.name ?? ""), [F(pain === "terriblePain" ? "BreakInTerrible" : "BreakInPain", { name: actor.name, days: days.total })], days.roll ? [days.roll] : []);
}

async function makeArmor(api: GWorldApi, item: any, actor: any): Promise<void> {
  const homemade = homemadeArmor(item.name);
  if (!homemade) return;
  const iq = Number(api.actors.attribute(actor, "IQ")) || 10;
  const skill = api.actors.skillLevel(actor, ARMOURY_BODY_ARMOR);
  const outcome: any = await api.roll.success({
    actor, base: armouryLevel(skill, iq), label: F("MakeRoll", { name: item.name }),
    skill: ARMOURY_BODY_ARMOR, kind: "skill",
    modifiers: [{ label: L("MakeBonus"), value: homemade.bonus }], tags: ["homemadeArmor", "IQ"], item,
  } as any);
  if (!outcome) return;
  const lines = [F(outcome.success ? "Made" : "NotMade", { name: item.name, minutes: homemade.minutes })];
  if (outcome.success && homemade.soaks) lines.push(L("PaperSoaks"));
  await say(actor, String(item.name ?? ""), lines);
}

/** Puts goggles or glasses on, or takes them off: in combat, only on a Ready maneuver (p. 71). */
async function putOnOrTakeOff(item: any, actor: any): Promise<void> {
  if (!item?.isOwner) return;
  if (inCombat(actor) && String(actor?.system?.maneuver ?? "") !== "ready") return void ui.notifications?.warn(F("DonNeedsReady", { name: item.name }));
  const wearing = item.system?.equipped !== true;
  await item.update({ "system.equipped": wearing });
  await say(actor, String(item.name ?? ""), [F(wearing ? "Donned" : "Doffed", { name: actor?.name ?? "", item: item.name })]);
}

/** Holds a blanket up as cover for its bearer and the characters the user targets (p. 72). */
async function holdUp(item: any, actor: any): Promise<void> {
  const blanket = blanketOf(item?.name);
  if (!item?.isOwner || !blanket) return;
  const behind = [actor, ...[...((game as any).user?.targets ?? [])].map((t: any) => t?.actor)]
    .filter((a: any, i: number, all: any[]) => a?.uuid && all.findIndex((b: any) => b?.uuid === a.uuid) === i);
  await item.setFlag(MODULE_ID, COVER_FLAG, { bearer: String(item.actor?.uuid ?? actor?.uuid ?? ""), behind: behind.map((a: any) => String(a.uuid)) });
  noteBearer(item);
  await say(actor, String(item.name ?? ""), [F("CoverHeld", { names: behind.map((a: any) => a.name).join(", "), dr: blanket.dr })]);
}

// ── the item sheet ──

function itemLines(item: any, on: OddmentSwitches): string[] {
  const lines: string[] = [];
  if (on.oddments()) {
    const grant = grantOf(item);
    if (grant?.hamFisted) lines.push(L("HamFistedItem"));
    if (grant?.protectedHearing) lines.push(L(named(item, ELECTRONIC_EARS) && grant.hardOfHearing ? "EarsFlatItem" : grant.hardOfHearing ? "EarsBlockedItem" : "EarsItem"));
    if (named(item, EYE_PROTECTION)) lines.push(L("DonItem"));
    if (grant?.nictitatingMembrane) lines.push(F("MembraneItem", { levels: grant.nictitatingMembrane }));
    if (grant?.protectedVision) lines.push(L("ProtectedVisionItem"));
    const stealth = stealthOf([{ name: String(item?.name ?? "") }]);
    if (stealth && isFootwear(item)) lines.push(F("StealthItem", { value: stealth.value > 0 ? `+${stealth.value}` : stealth.value }));
    if (isFootwear(item) && !flag(item, BROKEN_IN_FLAG)) lines.push(L("NotBrokenInItem"));
    for (const location of ["groin", "face"]) {
      const bonus = knockdownBonus(item?.name, location);
      if (bonus) lines.push(F("KnockdownItem", { bonus, location: L(`Location.${location}`) }));
    }
    if (named(item, MOUTHGUARD)) lines.push(F("VoiceItem", { penalty: DISTURBING_VOICE }));
    if (named(item, EYEGLASSES)) lines.push(L(flag(item, BROKEN_FLAG) ? "EyeglassesBrokenItem" : "EyeglassesItem"));
    if (named(item, CONTACT_LENSES)) lines.push(L("ContactsItem"));
    const homemade = homemadeArmor(item?.name);
    if (homemade) lines.push(F("HomemadeItem", { bonus: homemade.bonus, minutes: homemade.minutes }));
  }
  if (on.cover()) {
    const blanket = blanketOf(item?.name);
    if (blanket) lines.push(F(blanket.protectionFactor > 1 ? "RadiationBlanketItem" : "BlanketItem", { dr: blanket.dr, pf: blanket.protectionFactor }));
    const behind = useOf(item, COVER_FLAG)?.behind ?? [];
    if (blanket && behind.length) lines.push(F("CoverItem", { n: behind.length }));
    if (blanket && useOf(item, LAID_FLAG)) lines.push(F("LaidItem", { pf: blanket.protectionFactor }));
  }
  return lines;
}

export function readyOddments(api: GWorldApi, on: OddmentSwitches, dice: OddmentDice = foundryDice): void {
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-oddments-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-oddments-item.hbs`,
    visible: (item) => itemLines(item, on).length > 0 || (on.oddments() && isFootwear(item)),
    context: (item) => ({
      lines: itemLines(item, on),
      broken: on.oddments() && named(item, EYEGLASSES) ? { checked: flag(item, BROKEN_FLAG) } : null,
      brokenIn: on.oddments() && isFootwear(item) ? { checked: flag(item, BROKEN_IN_FLAG) } : null,
      tinted: on.oddments() && named(item, TINTABLE) ? { checked: flag(item, TINTED_FLAG) } : null,
      editable: item.isOwner,
    }),
    listeners: (element, item) => {
      element.querySelectorAll<HTMLInputElement>("[data-gcc-ht-oddment]").forEach((input) => {
        input.addEventListener("change", () => void item.setFlag(MODULE_ID, String(input.dataset.gccHtOddment), input.checked));
      });
    },
  });

  // ── protective oddments (pp. 68-71, 225) ──

  Hooks.on("gworld.traitEffects", (context: any) => {
    if (on.oddments()) traitEffects(context);
  });

  // Footwear on Stealth, the mouthguard on the voice (pp. 68-71).
  Hooks.on(api.data.hooks.skillBonuses, (context: any) => {
    const actor = context?.actor;
    const name = String(context?.name ?? "");
    if (!on.oddments() || !actor || !Array.isArray(context?.lines)) return;
    if (/^stealth\b/i.test(name)) {
      const stealth = stealthOf(wornItems(actor).filter(isFootwear).map((i) => ({ name: String(i.name ?? "") })));
      if (stealth) context.lines.push({ label: F("StealthLine", { name: stealth.name }), value: stealth.value, source: MODULE_ID });
    }
    if (isVoiceSkill(name)) {
      const guard = wornItems(actor).find((i) => named(i, MOUTHGUARD));
      if (guard) context.lines.push({ label: F("VoiceLine", { name: guard.name }), value: DISTURBING_VOICE, source: MODULE_ID });
    }
  });

  // A cup or mouthguard on the knockdown roll for the blow that called for it (p. 71).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.oddments() || !(context?.tags ?? []).includes("knockdown") || !Array.isArray(context.modifiers)) return;
    const location = String(context.blow?.hitLocation ?? "");
    if (!location) return;
    for (const item of wornItems(context.actor)) {
      const bonus = knockdownBonus(item.name, location);
      if (bonus) context.modifiers.push({ label: F("KnockdownLine", { name: item.name }), value: bonus });
    }
  });

  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.oddments() || context?.hitLocation !== "eye" || !Array.isArray(context.lines)) return;
    // Plain goggles' DR is their membrane, which the trait effects now give: not twice (p. 71).
    for (const line of context.lines) {
      const piece = line?.itemId ? context.actor?.items?.get?.(line.itemId) : null;
      if (piece && named(piece, MEMBRANE_IS_THE_DR) && line.source !== "natural") {
        line.applies = false;
        line.reason = L("MembraneReason");
      }
    }
    // Eyeglasses protect the eyes as glasses do (pp. 71, 225).
    const glasses = wornEyeglasses(context.actor)[0];
    if (glasses) context.lines.push({ label: String(glasses.name), dr: EYEGLASSES_DR, applies: true, forceField: false, flexible: false, hardened: 0, itemId: glasses.id, source: "armor" });
  });

  // A head hit and the eyeglasses: broken on a 1, knocked off on 2-3 (p. 225).
  Hooks.on(api.combat.hooks.afterDamage, async (context: any) => {
    const victim = context?.actor;
    if (!on.oddments() || !victim?.isOwner || !HEAD_LOCATIONS.includes(String(context.damage?.hitLocation ?? ""))) return;
    for (const glasses of wornEyeglasses(victim)) {
      const die = await dice.roll("1d6");
      const fate = eyeglassesOnHeadHit(die.total);
      if (fate) await glasses.update({ "system.equipped": false, ...(fate === "broken" ? { [`flags.${MODULE_ID}.${BROKEN_FLAG}`]: true } : {}) });
      await say(victim, String(glasses.name ?? ""), [F(fate === "broken" ? "GlassesBroken" : fate === "knockedOff" ? "GlassesKnockedOff" : "GlassesStay", { name: victim.name, die: die.total })], die.roll ? [die.roll] : []);
    }
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-break-in",
    itemTypes: ["armor"],
    label: L("BreakIn"),
    icon: "fa-solid fa-shoe-prints",
    visible: (item) => on.oddments() && isFootwear(item) && !flag(item, BROKEN_IN_FLAG),
    run: (item, actor) => { void breakIn(api, item, actor, dice); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-homemade-armor",
    itemTypes: ["armor"],
    label: L("Make"),
    icon: "fa-solid fa-scissors",
    visible: (item) => on.oddments() && homemadeArmor(item?.name) !== null,
    run: (item, actor) => { void makeArmor(api, item, actor); },
  });

  // Goggles and glasses: a Ready maneuver to put on or take off (p. 71).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-eye-protection",
    itemTypes: ["equipment", "armor"],
    label: L("DonTitle"),
    icon: "fa-solid fa-glasses",
    visible: (item) => on.oddments() && named(item, EYE_PROTECTION) && item.system?.carried !== false,
    run: (item, actor) => { void putOnOrTakeOff(item, actor); },
  });

  // ── portable cover (p. 72) ──

  /** The charge a blanket is smothering, for the damage roll `detonate` makes straight away. */
  let pending: { label: string; dr: number; name: string } | null = null;

  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!pending || context?.item || context?.label !== pending.label || !Array.isArray(context.modifiers)) return;
    const dice = parseDamage(String(context.formula ?? ""));
    if (!dice) return;
    const under = smothered(dice, pending.dr);
    if (dice.multiplier) context.formula = formatDamage(under.dice);
    context.modifiers.push({ label: F("BlanketLine", { name: pending.name, dr: pending.dr }), value: under.less });
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-blanket",
    itemTypes: ["equipment"],
    label: L("Smother"),
    icon: "fa-solid fa-bomb",
    visible: (item) => on.cover() && blanketOf(item?.name) !== null && api.registry.isRuleOn("explosions"),
    run: (item, actor) => {
      void (async () => {
        const blanket = blanketOf(item.name);
        const explosives: Array<{ id: string; label: string }> = ((api.data as any).explosives?.() ?? []) as any[];
        if (!blanket || !explosives.length) return;
        const asked: any = await foundry.applications.api.DialogV2.prompt({
          window: { title: String(item.name ?? "") },
          content: `<div class="gworld"><p class="ihint">${esc(F("SmotherHint", { dr: blanket.dr }))}</p>
            <div class="ifields">
              <label>${esc(L("Explosive"))} <select name="explosive">${explosives.map((e) => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join("")}</select></label>
              <label>${esc(L("Pounds"))} <input type="number" min="0" step="0.01" name="pounds" value="1"></label>
            </div></div>`,
          ok: {
            label: L("Smother"),
            callback: (_event: Event, button: HTMLElement) => {
              const root = button.closest<HTMLElement>(".application");
              return {
                explosive: String(root?.querySelector<HTMLSelectElement>('[name="explosive"]')?.value ?? ""),
                pounds: Number(root?.querySelector<HTMLInputElement>('[name="pounds"]')?.value) || 0,
              };
            },
          },
          rejectClose: false,
        });
        if (!asked || !(asked.pounds > 0)) return;
        const explosive = explosives.find((e) => e.id === asked.explosive);
        const label = F("SmotheredLabel", { pounds: asked.pounds, explosive: explosive?.label ?? asked.explosive, name: item.name });
        pending = { label, dr: blanket.dr, name: String(item.name ?? "") };
        try {
          // Nobody is packed against a charge under a blanket: the blast is set down, not a contact one.
          const call = (api as any).hazards.detonate({ explosive: asked.explosive, weightLbs: asked.pounds, placement: "nearby", actor, label });
          pending = null;
          await call;
        } finally {
          pending = null;
        }
      })();
    },
  });

  // A blanket copied from one in use arrives lowered and lifted: the flags are the original's.
  Hooks.on("preCreateItem", (item: any) => {
    const flags = item?.flags?.[MODULE_ID];
    if (!flags?.[COVER_FLAG] && !flags?.[LAID_FLAG]) return;
    item.updateSource({ [`flags.${MODULE_ID}.${COVER_FLAG}`]: null, [`flags.${MODULE_ID}.${LAID_FLAG}`]: null });
  });
  // A blanket put to use on any client, an unlinked token's among them, is noted by its bearer.
  Hooks.on("updateItem", (item: any) => noteBearer(item));

  // A blanket held up as cover for several people (p. 72; Characters p. 407).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-blanket-cover",
    itemTypes: ["equipment"],
    label: L("CoverTitle"),
    icon: "fa-solid fa-people-group",
    visible: (item) => on.cover() && blanketOf(item?.name) !== null && !useOf(item, COVER_FLAG),
    run: (item, actor) => { void holdUp(item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-blanket-lower",
    itemTypes: ["equipment"],
    label: L("LowerTitle"),
    icon: "fa-solid fa-person-arrow-down-to-line",
    visible: (item) => on.cover() && useOf(item, COVER_FLAG) !== null,
    run: (item, actor) => {
      if (!item?.isOwner) return;
      void (async () => {
        await item.unsetFlag(MODULE_ID, COVER_FLAG);
        await say(actor, String(item.name ?? ""), [F("CoverLowered", { name: item.name })]);
      })();
    },
  });

  // The blanket's DR between each one behind it and a blow from the front.
  // Cover isn't armour worn, so the sheet's figures leave it out.
  Hooks.on(api.combat.hooks.armorDr, (context: any) => {
    if (!on.cover() || context?.preview === true || !context?.actor || !Array.isArray(context.lines)) return;
    const cover = coverFor(context.actor);
    if (!cover) return;
    const meets = coverMeets(context.arc);
    context.lines.push({
      label: F("CoverLine", { name: cover.item.name }),
      dr: blanketOf(cover.item.name)!.dr,
      applies: meets,
      forceField: false,
      flexible: true,
      hardened: 0,
      source: "armor",
      reason: meets ? F("CoverReason", { bearer: cover.bearer?.name ?? "" }) : L("CoverBehind"),
    });
  });

  // A radiation blanket laid over the source: PF 3 for everyone exposed to it (p. 72).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-blanket-lay",
    itemTypes: ["equipment"],
    label: L("LayTitle"),
    icon: "fa-solid fa-radiation",
    visible: (item) => on.cover() && (blanketOf(item?.name)?.protectionFactor ?? 1) > 1 && !useOf(item, LAID_FLAG),
    run: (item, actor) => {
      if (!item?.isOwner) return;
      void (async () => {
        await item.setFlag(MODULE_ID, LAID_FLAG, { bearer: String(item.actor?.uuid ?? actor?.uuid ?? "") });
        noteBearer(item);
        await say(actor, String(item.name ?? ""), [F("Laid", { name: item.name, pf: blanketOf(item.name)!.protectionFactor })]);
      })();
    },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-blanket-lift",
    itemTypes: ["equipment"],
    label: L("LiftTitle"),
    icon: "fa-solid fa-arrow-up-from-bracket",
    visible: (item) => on.cover() && useOf(item, LAID_FLAG) !== null,
    run: (item, actor) => {
      if (!item?.isOwner) return;
      void (async () => {
        await item.unsetFlag(MODULE_ID, LAID_FLAG);
        await say(actor, String(item.name ?? ""), [F("Lifted", { name: item.name })]);
      })();
    },
  });

  // A radiation blanket in use, or laid over the source: PF 3 (p. 72; Characters p. 436), once.
  Hooks.on("gworld.radiationDose", (context: any) => {
    if (!on.cover() || !context?.actor) return;
    const worn = wornItems(context.actor).find((i) => (blanketOf(i.name)?.protectionFactor ?? 1) > 1);
    const blanket = worn ?? laidBlanket();
    if (!blanket) return;
    const pf = blanketOf(blanket.name)!.protectionFactor;
    context.rads = shieldedRads(Number(context.rads) || 0, pf);
    context.sources?.push?.(F(worn ? "RadiationLine" : "RadiationLaidLine", { name: blanket.name, pf }));
  });
}
