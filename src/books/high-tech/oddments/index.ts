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
 *     them off on 2-3 (`gworld.afterDamage`); and a row action that makes
 *     homemade armour with Armoury (Body Armor).
 *   - **Portable cover (portableCover):** a row action on an explosives or
 *     radiation blanket that sets off a charge beneath it, the blanket's DR
 *     25 coming off the charge's damage roll (`hazards.detonate`,
 *     `gworld.damageModifiers`); and a radiation blanket in use giving PF 3
 *     against a dose (`gworld.radiationDose`).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { formatDamage, parseDamage } from "../explosives/rules.js";
import {
  ARMOURY_BODY_ARMOR,
  CONTACT_LENSES,
  CUSTOM_FOOTWEAR,
  DAY_SECONDS,
  DISTURBING_VOICE,
  EYEGLASSES,
  EYEGLASSES_DR,
  HAM_FISTED_MAX,
  HEAD_LOCATIONS,
  MEMBRANE_IS_THE_DR,
  MOUTHGUARD,
  armouryLevel,
  baseName,
  blanketOf,
  breakInPain,
  breakInRoll,
  eyeglassesOnHeadHit,
  gearGrant,
  homemadeArmor,
  isVoiceSkill,
  knockdownBonus,
  shieldedRads,
  smothered,
  stealthOf,
  tlOf,
  type CustomFootwear,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Oddments.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Oddments.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** Eyeglasses a head hit broke (p. 225): they neither correct nor protect until replaced. */
export const BROKEN_FLAG = "htBroken";
/** Footwear already broken in (p. 69). */
export const BROKEN_IN_FLAG = "htBrokenIn";

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
    const grant = gearGrant(item.name, tlOf(item.system?.tl));
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

// ── the item sheet ──

function itemLines(item: any, on: OddmentSwitches): string[] {
  const lines: string[] = [];
  if (on.oddments()) {
    const grant = gearGrant(item?.name, tlOf(item?.system?.tl));
    if (grant?.hamFisted) lines.push(L("HamFistedItem"));
    if (grant?.protectedHearing) lines.push(L(grant.hardOfHearing ? "EarsBlockedItem" : "EarsItem"));
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

  // A radiation blanket in use: PF 3 (p. 72; Characters p. 436).
  Hooks.on("gworld.radiationDose", (context: any) => {
    if (!on.cover() || !context?.actor) return;
    const blanket = wornItems(context.actor).find((i) => (blanketOf(i.name)?.protectionFactor ?? 1) > 1);
    if (!blanket) return;
    const pf = blanketOf(blanket.name)!.protectionFactor;
    context.rads = shieldedRads(Number(context.rads) || 0, pf);
    context.sources?.push?.(F("RadiationLine", { name: blanket.name, pf }));
  });
}
