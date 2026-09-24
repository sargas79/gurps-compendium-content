/**
 * High-Tech's melee and muscle-powered weapons (pp. 196-201), registered
 * with the system through the add-on API under five switches. The rules are
 * in `rules.ts`; the contact stunners' armour is the shared engine's
 * (`src/shared/stunners/`), with this book's table.
 *
 *   - **Bayonets (bayonets):** a gun that carries a bayonet (its weight and
 *     price on the gun); fixing it, four Ready maneuvers counted by a row
 *     action, three after a successful Fast-Draw (Knife); fixed, a derived
 *     melee row (Spear thrust+3 impaling on a shoulder arm, a large knife's
 *     rows on a sidearm), -1 to the gun's Guns rows, a muzzleloader's reload
 *     a tenth longer, and -2 for an unfamiliar pairing as an attack option.
 *     A shoulder arm's butt and its swing by the barrel as derived rows, the
 *     swing noted where the gun isn't a TL4-5 single-shot built for it; the
 *     spiked tomahawk's spike noted as a pick (its record marks the mode a
 *     pick, so the system's picks rule leaves it stuck; Characters p. 405);
 *     the NRS-2 scout knife reversed
 *     by a row action to shoot, and refused as a knife while it is.
 *   - **Sheaths (sheaths):** a knife's or sword's sheath rigid, flexible or
 *     none: the blade alone weighs two thirds, the HT roll against corrosion
 *     and incidental damage is -1 or -2, a replacement sheath's price is
 *     shown, and a rigid sheath of a pound or more is a baton (derived rows,
 *     cheap quality for breakage).
 *   - **Blade composition (bladeComposition):** stainless, ceramic or
 *     titanium blades as a calculated field that reprices the weapon (a
 *     stainless sword's grade priced from list), with ceramic breaking as
 *     cheap and titanium as very fine; a sword cane's blade a grade lower
 *     than paid for, in damage and breakage.
 *   - **Stun weapons (stunWeapons):** the stun gun, stun baton and cattle
 *     prod: the seconds held in contact as an attack option, a victim who
 *     fails stunned with no recovery roll for those seconds and (20 - HT)
 *     more (`holdRecovery`, GWorld API 1.89.0), then recovering at HT-3; the
 *     victim's armour on the roll to resist, metallic armour held to DR 1.
 *   - **High-tech bows (highTechBows):** a bow or crossbow built compound
 *     (double cost, two ST more for damage and range), bow sights (+$100,
 *     +1 Acc to a skilled user, -1 to one unfamiliar with them) and string
 *     silencers, a slingshot's lead or steel shot, and a speargun's range a
 *     tenth under water, on its 10-yard line.
 */

import { ITEM_EXTENSION_TYPES, addExtensionFields } from "../../../shared/extensions.js";
import { sceneEnvironment } from "../../../shared/environment/index.js";
import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { STUNNER_TABLES, readyStunners } from "../../../shared/stunners/index.js";
import { isFirearm } from "../firearms/index.js";
import { loadingOf } from "../reloading/index.js";
import {
  BAYONET,
  BLADE_FIGURES,
  BLADE_MATERIALS,
  BLADE_TL,
  BOW_SIGHTS,
  BOW_SILENCERS,
  COMPOUND,
  CONTACT_STUN,
  METAL_SHOT,
  SHEATHED_SKILLS,
  SHEATHS,
  SPEARGUN,
  bayonetProfiles,
  bayonetReadies,
  bayonetReloadSeconds,
  builtForClubbing,
  canBeCompound,
  contactStunSeconds,
  gradeBelow,
  gradeDamage,
  isContactStunner,
  levelFrom,
  replacementSheath,
  rifleButtProfiles,
  scaledRange,
  sheathBatonProfiles,
  sheathHtModifier,
  sheathIsBaton,
  sheathWeight,
  sheathedWeight,
  stainlessSwordMultiplier,
  takesBladeMaterial,
  type BladeMaterial,
  type Grade,
  type MeleeProfile,
  type Sheath,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Melee.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Melee.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const FIELD = "htWeapon";
const GUN_FIELD = "firearm";
const BAYONET_MODE = "ht-bayonet";
const BAYONET_SWING_MODE = "ht-bayonet-swing";
const BUTT_MODE = "ht-rifle-butt";
const CLUB_MODE = "ht-rifle-club";
const SHEATH_SWING_MODE = "ht-sheath-swing";
const SHEATH_THRUST_MODE = "ht-sheath-thrust";
const UNFAMILIAR_OPTION = "ht-bayonet-unfamiliar";
const SIGHTS_OPTION = "ht-bow-sights-unfamiliar";
const HOLD_OPTION = "ht-contact-hold";
/** The condition that carries a stun weapon's HT-3 on the recovery rolls. */
const SHOCK = "ht-contact-shock";
const SHOTS = ["", "metal"] as const;
type Shot = (typeof SHOTS)[number];

export interface MeleeSwitches {
  bayonets: () => boolean;
  sheaths: () => boolean;
  blades: () => boolean;
  stun: () => boolean;
  bows: () => boolean;
}

/** What this module keeps on a gun for its bayonet, beside #364's fields on the same `firearm` object. */
export function meleeGunFields(f: any): Record<string, unknown> {
  const amount = () => new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 });
  return { bayonet: new f.BooleanField({ initial: false }), bayonetWeight: amount(), bayonetCost: amount() };
}

/** What this module keeps on a melee or muscle-powered weapon. */
export interface WeaponData {
  sheath: Sheath;
  /** The sheath's own weight where the book gives one; 0 for a third of the table weight. */
  sheathWeight: number;
  blade: BladeMaterial;
  compound: boolean;
  sights: boolean;
  silencers: boolean;
  shot: Shot;
}

/** Registers the fields this module keeps on a melee or muscle-powered weapon. */
export function initHighTechMelee(): void {
  const f = foundry.data.fields as any;
  const flag = () => new f.BooleanField({ initial: false });
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, {
    [FIELD]: new f.SchemaField({
      sheath: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SHEATHS] }),
      sheathWeight: new f.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
      blade: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...BLADE_MATERIALS] }),
      compound: flag(),
      sights: flag(),
      silencers: flag(),
      shot: new f.StringField({ required: true, nullable: false, blank: true, initial: "", choices: [...SHOTS] }),
    }),
  });
}

/** A weapon's data, with nothing missing. */
export function weaponData(item: any): WeaponData {
  const d = item?.system?.extensions?.[MODULE_ID]?.[FIELD] ?? {};
  return {
    sheath: SHEATHS.includes(d.sheath) ? d.sheath : "",
    sheathWeight: Math.max(0, Number(d.sheathWeight) || 0),
    blade: BLADE_MATERIALS.includes(d.blade) ? d.blade : "",
    compound: d.compound === true,
    sights: d.sights === true,
    silencers: d.silencers === true,
    shot: SHOTS.includes(d.shot) ? d.shot : "",
  };
}

/** A gun's bayonet: whether it carries one, and what it weighs and costs. */
export function bayonetOf(item: any): { fitted: boolean; weight: number; cost: number } {
  const d = item?.system?.extensions?.[MODULE_ID]?.[GUN_FIELD] ?? {};
  return { fitted: d.bayonet === true, weight: Math.max(0, Number(d.bayonetWeight) || 0), cost: Math.max(0, Number(d.bayonetCost) || 0) };
}

const nameOf = (item: any) => String(item?.name ?? "");
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;
const meleeModes = (item: any): any[] => item?.system?.meleeModes ?? [];
const rangedModes = (item: any): any[] => item?.system?.rangedModes ?? [];
const damageTypesOf = (item: any): string[] => [...meleeModes(item), ...rangedModes(item)].map((m) => String(m?.damageType ?? ""));
const isEquipment = (item: any) => item?.type === "equipment";
const gradeOf = (item: any): Grade => (["cheap", "good", "fine", "veryFine"].includes(item?.system?.quality) ? item.system.quality : "good");

/** A shoulder arm: a rifle, musket, shotgun or light machine gun. */
function isLongArm(item: any): boolean {
  return rangedModes(item).some((m) => /^guns(?: sport)?(?:\/tl)? \((rifle|musket|shotgun|lmg|light machine gun)\)/i.test(String(m?.skill ?? "")));
}

/** A knife or sword whose table weight includes its sheath (p. B270). */
function isSheathed(item: any): boolean {
  return isEquipment(item) && meleeModes(item).some((m) => SHEATHED_SKILLS.test(String(m?.skill ?? ""))) && takesBladeMaterial(damageTypesOf(item));
}

/** A melee or thrown weapon that cuts or impales: knives, swords and axes, which can take another blade (pp. 198, 201). */
function isBladed(item: any): boolean {
  return isEquipment(item) && meleeModes(item).length > 0 && takesBladeMaterial(meleeModes(item).map((m) => String(m?.damageType ?? "")));
}

/** A sword, as the Basic Set prices it: fencing- or sword-class (p. B274). */
function isSword(api: GWorldApi, item: any): boolean {
  const own = String(item?.system?.weaponClass ?? "");
  if (own) return own === "sword" || own === "fencing";
  const modes = meleeModes(item);
  const cls = api.rules.weaponClassOf({
    skills: modes.map((m) => String(m.skill ?? "")),
    damageTypes: modes.map((m) => String(m.damageType ?? "")) as never,
    hasMalfunction: false,
    isFencing: modes.some((m) => m.isFencing),
  });
  return cls === "sword" || cls === "fencing";
}

const bowSkill = (m: any) => /^bow\b(?! \(slingshot\))/i.test(String(m?.skill ?? ""));
const crossbowSkill = (m: any) => /^crossbow\b(?! \(speargun\))/i.test(String(m?.skill ?? ""));
const isBow = (item: any) => isEquipment(item) && rangedModes(item).some(bowSkill);
const isBowOrCrossbow = (item: any) => isEquipment(item) && rangedModes(item).some((m) => bowSkill(m) || crossbowSkill(m));
const isSlingshot = (item: any) => isEquipment(item) && rangedModes(item).some((m) => /^bow \(slingshot\)/i.test(String(m?.skill ?? "")));
const isSpeargun = (item: any) => isEquipment(item) && rangedModes(item).some((m) => /^crossbow \(speargun\)/i.test(String(m?.skill ?? "")));
const isSpikedTomahawk = (item: any) => /spiked tomahawk/i.test(nameOf(item));
const isSwordCane = (item: any) => /^sword cane\b/i.test(nameOf(item));
const isScoutKnife = (item: any) => /\bNRS-2\b/i.test(nameOf(item));
const isStunner = (item: any) => isEquipment(item) && isContactStunner(nameOf(item));
/**
 * A stun weapon this book's p. 199 stun is for. The supplement Electricity
 * and Electronics' own cattle prod (HT:EE p. 51, note [4]) pains rather than
 * stuns, under its electricStunners switch (`../electronic-weapons`); its
 * armour on the roll to resist is still the contact stunners' (`isStunner`).
 */
const stunsOnContact = (item: any) => isStunner(item) && !/Electricity and Electronics/i.test(String(item?.system?.reference ?? ""));

interface WeaponState {
  /** Ready maneuvers spent fixing the bayonet, and how many it takes. */
  bayonetReadies?: number;
  bayonetNeeded?: number;
  bayonetFixed?: boolean;
  /** The NRS-2 turned round to shoot (p. 199). */
  reversed?: boolean;
  /** Seconds the last stun weapon attack was held in contact. */
  contactHold?: number;
}

function stateOf(api: GWorldApi, item: any): WeaponState {
  return (api.combat.getWeaponState(item, MODULE_ID) ?? {}) as WeaponState;
}

/** Whether a gun has its bayonet fixed. */
export function bayonetFixed(api: GWorldApi, item: any): boolean {
  return bayonetOf(item).fitted && stateOf(api, item).bayonetFixed === true;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Adds adds to a damage formula. */
function withAdds(api: GWorldApi, formula: string, dice: number, adds: number): string {
  const parsed = api.rules.parseDiceAdds(String(formula ?? ""));
  if (!parsed || (!dice && !adds)) return formula;
  return api.rules.formatDiceAdds({ ...parsed, dice: parsed.dice + dice, adds: parsed.adds + adds });
}

/** A derived melee row from a profile, at the character's levels and striking ST. */
function profileRow(api: GWorldApi, profile: MeleeProfile, helpers: any, label: string, more: Record<string, unknown> = {}): Record<string, unknown> {
  const levelOf = (skill: string): number | null => (skill === "DX" ? Number(helpers.attribute?.("DX")) || 10 : helpers.skillLevel?.(skill) ?? null);
  const own = helpers.skillLevel?.(profile.skill) ?? null;
  const damage = String(helpers.damage?.(profile.base, profile.modifier) ?? "");
  return {
    mode: label,
    skillName: profile.skill,
    skillLevel: levelFrom(profile, levelOf),
    atDefault: own === null,
    damage,
    damageType: profile.damageType,
    damageBase: profile.base,
    damageModifier: profile.modifier,
    swung: profile.base === "sw",
    reach: profile.reach,
    parry: profile.parry,
    twoHanded: profile.twoHanded,
    damageRollable: api.rules.parseDiceAdds(damage) !== null,
    ...more,
  };
}

// ── the item sheet ──

function itemContext(api: GWorldApi, item: any, on: MeleeSwitches): Record<string, unknown> {
  const data = weaponData(item);
  const lines: string[] = [];
  const gun = on.bayonets() && isFirearm(api, item);
  const bayonet = bayonetOf(item);
  if (gun && bayonet.fitted) lines.push(F(bayonetFixed(api, item) ? "BayonetFixedLine" : "BayonetLine", { readies: BAYONET.readies, fastDraw: BAYONET.fastDrawReadies }));
  const sheathed = on.sheaths() && isSheathed(item);
  if (sheathed) {
    const weight = Number(item.system?.weight) || 0;
    const own = sheathWeight(weight, data.sheathWeight);
    const modifier = sheathHtModifier(data.sheath);
    if (modifier) lines.push(F(data.sheath === "none" ? "NoSheathLine" : "FlexibleLine", { modifier }));
    if (sheathIsBaton(weight, data.sheathWeight, data.sheath)) lines.push(F("BatonLine", { weight: own }));
    const good = goodPrice(api, item);
    if (good > 0) {
      const replacement = replacementSheath(good);
      lines.push(F("ReplacementLine", { flexible: replacement.flexible, rigid: replacement.rigid }));
    }
  }
  const bladed = on.blades() && isBladed(item);
  if (bladed && data.blade) {
    lines.push(F(`BladeLine.${data.blade}`, { tl: BLADE_TL[data.blade] }));
    if (data.blade === "stainless" && isSword(api, item) && stainlessSwordMultiplier(gradeOf(item), tlOf(item)) === null && gradeOf(item) === "veryFine") lines.push(L("StainlessTooFine"));
  }
  if (on.blades() && isSwordCane(item)) lines.push(F("SwordCaneLine", { grade: L(`Grade.${gradeBelow(gradeOf(item))}`) }));
  if (on.stun() && stunsOnContact(item)) lines.push(F("StunLine", { recovery: CONTACT_STUN.recovery }));
  const bow = on.bows() && isBowOrCrossbow(item);
  if (bow && data.silencers && isBow(item)) lines.push(F("SilencerLine", { hearing: BOW_SILENCERS.hearing }));
  if (on.bows() && isSpeargun(item)) lines.push(F("SpeargunLine", { divisor: SPEARGUN.underwaterDivisor, line: SPEARGUN.lineYards }));
  const compound = bow && canBeCompound(nameOf(item)) ? { checked: data.compound } : null;
  const bowAccessories = on.bows() && isBow(item) ? { sights: data.sights, silencers: data.silencers } : null;
  return {
    editable: item.isOwner,
    gun: gun ? { fitted: bayonet.fitted, weight: bayonet.weight, cost: bayonet.cost } : null,
    sheath: sheathed
      ? {
          choices: SHEATHS.map((value) => ({ value, label: L(`Sheath.${value || "rigid"}`), selected: value === data.sheath })),
          weight: data.sheathWeight,
          worked: sheathWeight(Number(item.system?.weight) || 0, data.sheathWeight),
        }
      : null,
    blade: bladed ? BLADE_MATERIALS.map((value) => ({ value, label: L(`Blade.${value || "steel"}`), selected: value === data.blade })) : null,
    compound,
    bowAccessories,
    bowChecks: Boolean(compound || bowAccessories),
    shot: on.bows() && isSlingshot(item) ? SHOTS.map((value) => ({ value, label: L(`Shot.${value || "stone"}`), selected: value === data.shot })) : null,
    lines,
  };
}

function itemListeners(element: HTMLElement, item: any): void {
  const path = `system.extensions.${MODULE_ID}`;
  element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-gcc-ht-melee]").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = String(input.dataset.gccHtMelee);
      const gunField = field.startsWith("bayonet");
      const value: unknown = input instanceof HTMLInputElement && input.type === "checkbox"
        ? input.checked
        : input instanceof HTMLInputElement && input.type === "number" ? Math.max(0, Number(input.value) || 0) : input.value;
      await item.update({ [`${path}.${gunField ? GUN_FIELD : FIELD}.${field}`]: value });
    });
  });
}

/** What a good-quality weapon of this kind costs, for a replacement sheath: list price at the good grade. */
function goodPrice(api: GWorldApi, item: any): number {
  const list = Number(item?.system?.listCost) || Number(item?.system?.cost) || 0;
  const cls = api.rules.weaponClassOf({
    skills: meleeModes(item).map((m) => String(m.skill ?? "")),
    damageTypes: damageTypesOf(item) as never,
    hasMalfunction: false,
    isFencing: meleeModes(item).some((m) => m.isFencing),
  });
  const multiple = (api.rules as any).qualityCostMultiplier?.(cls, "good", tlOf(item) || 3);
  return list * (typeof multiple === "number" ? multiple : 1);
}

// ── price and weight ──

function priced(api: GWorldApi, item: any, price: { cost: number; weight: number }, on: MeleeSwitches): { cost: number; weight: number } | null {
  const data = weaponData(item);
  let cost = price.cost;
  let weight = price.weight;
  if (on.bayonets() && isFirearm(api, item)) {
    const bayonet = bayonetOf(item);
    if (bayonet.fitted) {
      cost += bayonet.cost;
      weight += bayonet.weight;
    }
  }
  const material = on.blades() && isBladed(item) && data.blade ? BLADE_FIGURES[data.blade] : null;
  if (material && data.blade === "stainless" && isSword(api, item)) {
    // A stainless sword's grade, priced from list (p. 198).
    const list = Number(item.system?.listCost) || 0;
    const multiple = list > 0 ? stainlessSwordMultiplier(gradeOf(item), tlOf(item)) : null;
    if (multiple !== null) cost = list * multiple;
  } else if (material) {
    cost *= material.cost;
  }
  // The blade's material changes the blade's weight; a rigid sheath keeps its own (p. 198).
  const sheathed = on.sheaths() && isSheathed(item);
  if (sheathed || material) {
    const listed = price.weight;
    const sheath = sheathed ? sheathWeight(listed, data.sheathWeight) : 0;
    // The weapon with the sheath it has (a flexible sheath's weight is negligible, and no sheath weighs nothing),
    // then the blade's material on the blade alone.
    const carried = sheathed ? sheathedWeight(listed, data.sheathWeight, data.sheath) : listed;
    weight += carried - listed + (listed - sheath) * ((material?.weight ?? 1) - 1);
  }
  if (on.bows() && isBowOrCrossbow(item)) {
    if (data.compound && canBeCompound(nameOf(item))) cost *= COMPOUND.cost;
    if (isBow(item) && data.sights) cost += BOW_SIGHTS.cost;
    if (isBow(item) && data.silencers) cost += BOW_SILENCERS.cost;
  }
  if (cost === price.cost && weight === price.weight) return null;
  return { cost: Math.round(cost * 100) / 100, weight: Math.round(weight * 1000) / 1000 };
}

// ── fixing a bayonet (p. 197) ──

async function fixBayonet(api: GWorldApi, item: any, actor: any): Promise<void> {
  const state = stateOf(api, item);
  if (state.bayonetFixed) {
    await api.combat.setWeaponState(item, MODULE_ID, { bayonetFixed: false, bayonetReadies: 0, bayonetNeeded: 0 });
    return say(actor, nameOf(item), [L("BayonetOff")]);
  }
  let needed = Number(state.bayonetNeeded) || 0;
  const lines: string[] = [];
  if (!needed) {
    // The first Ready draws the bayonet: a successful Fast-Draw (Knife) saves a second.
    const fastDraw = api.actors.skillLevel(actor, "Fast-Draw (Knife)");
    let quick = false;
    if (typeof fastDraw === "number") {
      const result: any = await api.roll.success({ actor, base: fastDraw, skill: "Fast-Draw (Knife)", label: F("FastDrawLabel", { name: nameOf(item) }) } as any);
      quick = result?.success === true;
    }
    needed = bayonetReadies(quick);
  }
  const done = Math.min(needed, (Number(state.bayonetReadies) || 0) + 1);
  const fixed = done >= needed;
  await api.combat.setWeaponState(item, MODULE_ID, fixed ? { bayonetReadies: 0, bayonetNeeded: 0, bayonetFixed: true } : { bayonetReadies: done, bayonetNeeded: needed });
  lines.push(F(fixed ? "BayonetFixed" : "BayonetReady", { done, needed }));
  await say(actor, nameOf(item), lines);
}

// ── registration ──

export function readyHighTechMelee(api: GWorldApi, on: MeleeSwitches): void {
  const any = () => on.bayonets() || on.sheaths() || on.blades() || on.stun() || on.bows();

  STUNNER_TABLES.register({ book: "high-tech", tls: { min: 0, max: 8 }, on: on.stun, applies: isStunner, armorDivisor: 0.5, label: () => L("StunDr") });
  readyStunners(api);

  api.data.registerPriceModifier({
    module: MODULE_ID,
    key: "ht-melee",
    types: ["equipment"],
    apply: (item, price) => {
      if (!any()) return null;
      const result = priced(api, item, price, on);
      return result ? { ...result, label: L("Title") } : null;
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ht-melee-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ht-melee-item.hbs`,
    visible: (item) => {
      if (!any() || !isEquipment(item)) return false;
      const context = itemContext(api, item, on);
      return Boolean(context.gun || context.sheath || context.blade || context.compound || context.bowAccessories || context.shot) || (context.lines as string[]).length > 0;
    },
    context: (item) => itemContext(api, item, on),
    listeners: (element, item) => itemListeners(element, item),
  });

  // ── the rows ──
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    const item = context?.item;
    if (!any() || !isEquipment(item)) return;
    const data = weaponData(item);
    const fixed = on.bayonets() && bayonetFixed(api, item);
    for (const entry of context.rows ?? []) {
      const row = entry.row;
      const mode = entry.mode ?? {};
      if (entry.kind === "ranged") {
        // A fixed bayonet upsets the gun's balance: -1 to Guns (p. 197).
        if (fixed && typeof row.skillLevel === "number") {
          row.skillLevel += BAYONET.gunsPenalty;
          row.notes?.push?.({ label: F("BayonetGunsNote", { penalty: BAYONET.gunsPenalty }), hint: L("BayonetGunsHint") });
        }
        if (on.bows()) bowRow(api, item, data, entry, row, mode);
        continue;
      }
      if (entry.kind !== "melee") continue;
      // The tomahawk's spike: -1, impaling, and a pick (pp. 196; B405).
      if (on.bayonets() && isSpikedTomahawk(item) && row.damageType === "imp") row.notes?.push?.({ label: L("PickNote"), hint: L("PickHint") });
      // A sword cane's thin blade is a grade lower than paid for (p. 197).
      if (on.blades() && isSwordCane(item) && (row.damageType === "cut" || row.damageType === "imp")) {
        const lost = gradeDamage(gradeOf(item)) - gradeDamage(gradeBelow(gradeOf(item)));
        if (lost) row.damage = withAdds(api, row.damage, 0, -lost);
        row.notes?.push?.({ label: L("SwordCaneNote"), hint: L("SwordCaneHint") });
      }
      if (on.stun() && stunsOnContact(item) && (row.affliction || row.followUp || mode.linked)) {
        row.notes?.push?.({ label: F("StunNote", { recovery: CONTACT_STUN.recovery }), hint: L(/cattle prod/i.test(nameOf(item)) ? "ProdHint" : "StunHint") });
      }
    }
  });

  // ── bayonets, rifle butts and sheaths as derived rows ──
  const register = (key: string, applies: (item: any, actor: any) => boolean, profile: (item: any) => MeleeProfile | null, label: string, more: (item: any) => Record<string, unknown> = () => ({})) => {
    api.combat.registerDerivedAttackMode({
      module: MODULE_ID,
      key,
      label,
      kind: "melee",
      applies,
      mode: (item, _actor, helpers: any) => {
        const p = profile(item);
        return p ? profileRow(api, p, helpers, label, more(item)) : null;
      },
    });
  };
  const fixedOn = (item: any) => on.bayonets() && isFirearm(api, item) && bayonetFixed(api, item);
  register(BAYONET_MODE, fixedOn, (item) => bayonetProfiles(isLongArm(item), tlOf(item)).find((p) => p.key === "thrust") ?? null, L("BayonetMode"), () => ({ notes: [{ label: L("BayonetNote"), hint: L("BayonetHint") }] }));
  register(BAYONET_SWING_MODE, (item) => fixedOn(item) && !isLongArm(item), (item) => bayonetProfiles(false, tlOf(item)).find((p) => p.key === "swing") ?? null, L("BayonetSwingMode"));
  const buttOn = (item: any) => on.bayonets() && isFirearm(api, item) && isLongArm(item) && meleeModes(item).length === 0;
  register(BUTT_MODE, buttOn, (item) => rifleButtProfiles(tlOf(item))[0] ?? null, L("ButtMode"));
  register(CLUB_MODE, buttOn, (item) => rifleButtProfiles(tlOf(item))[1] ?? null, L("ClubMode"), (item) => {
    const capacity = api.rules.parseShots(String(rangedModes(item)[0]?.shots ?? "")).capacity;
    return builtForClubbing(tlOf(item), typeof capacity === "number" ? capacity : null) ? {} : { notes: [{ label: L("ClubNote"), hint: L("ClubHint") }] };
  });
  const batonOn = (item: any) => {
    if (!on.sheaths() || !isSheathed(item)) return false;
    const data = weaponData(item);
    return sheathIsBaton(Number(item.system?.weight) || 0, data.sheathWeight, data.sheath);
  };
  // A hollow sheath breaks as cheap (p. 198).
  const sheathMore = (item: any) => ({ quality: "cheap", weight: sheathWeight(Number(item.system?.weight) || 0, weaponData(item).sheathWeight), notes: [{ label: L("SheathNote"), hint: L("SheathHint") }] });
  register(SHEATH_SWING_MODE, batonOn, () => sheathBatonProfiles()[0] ?? null, L("SheathSwingMode"), sheathMore);
  register(SHEATH_THRUST_MODE, batonOn, () => sheathBatonProfiles()[1] ?? null, L("SheathThrustMode"), sheathMore);

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-fix-bayonet",
    itemTypes: ["equipment"],
    label: L("FixAction"),
    icon: "fa-solid fa-khanda",
    visible: (item) => on.bayonets() && isFirearm(api, item) && bayonetOf(item).fitted,
    run: (item, actor) => { void fixBayonet(api, item, actor); },
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-reverse-knife",
    itemTypes: ["equipment"],
    label: L("ReverseAction"),
    icon: "fa-solid fa-rotate",
    visible: (item) => on.bayonets() && isScoutKnife(item),
    run: (item, actor) => {
      void (async () => {
        const reversed = !stateOf(api, item).reversed;
        await api.combat.setWeaponState(item, MODULE_ID, { reversed });
        await say(actor, nameOf(item), [L(reversed ? "Reversed" : "Unreversed")]);
      })();
    },
  });

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: UNFAMILIAR_OPTION,
    label: F("UnfamiliarLabel", { penalty: BAYONET.unfamiliar }),
    attack: "melee",
    available: (context: any) => on.bayonets() && String(context?.mode?.derived ?? "").startsWith(`${MODULE_ID}.${BAYONET_MODE}`),
    apply: () => ({ modifiers: [{ label: L("UnfamiliarLine"), value: BAYONET.unfamiliar }] }),
  } as any);

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: SIGHTS_OPTION,
    label: F("SightsUnfamiliarLabel", { penalty: BOW_SIGHTS.unfamiliar }),
    attack: "ranged",
    available: (context: any) => on.bows() && isBow(context?.item) && weaponData(context?.item).sights,
    apply: () => ({ modifiers: [{ label: L("SightsUnfamiliarLine"), value: BOW_SIGHTS.unfamiliar }] }),
  } as any);

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: HOLD_OPTION,
    label: L("HoldLabel"),
    attack: "melee",
    input: { type: "number", min: 0, max: 600 },
    available: (context: any) => on.stun() && stunsOnContact(context?.item),
    apply: (_context: any, value: unknown) => {
      const seconds = Math.max(0, Math.floor(Number(value) || 0));
      return seconds ? { notes: [F("HoldNote", { seconds })] } : null;
    },
  } as any);

  // The NRS-2 shoots only reversed, and stabs only the right way round; a stun weapon's hold is kept for its effect.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item || context.refusal) return;
    if (on.bayonets() && isScoutKnife(item)) {
      const reversed = stateOf(api, item).reversed === true;
      if (context.mode?.ranged === true && !reversed) return void (context.refusal = F("NotReversed", { name: nameOf(item) }));
      if (context.mode?.ranged !== true && !context.mode?.derived && reversed) return void (context.refusal = F("IsReversed", { name: nameOf(item) }));
    }
    if (on.stun() && stunsOnContact(item) && context.mode?.ranged !== true && item.isOwner) {
      const seconds = Math.max(0, Math.floor(Number(context.options?.[`${MODULE_ID}.${HOLD_OPTION}`]) || 0));
      void api.combat.setWeaponState(item, MODULE_ID, { contactHold: seconds });
    }
  });

  // A fixed bayonet slows a muzzleloader's reload by a tenth (p. 197).
  Hooks.on(api.combat.hooks.shotsEntry, (context: any) => {
    const item = context?.item;
    const entry = context?.entry;
    if (!on.bayonets() || !entry || typeof entry.reloadSeconds !== "number" || entry.thrown) return;
    if (!isFirearm(api, item) || !bayonetFixed(api, item)) return;
    if (loadingOf(api, item, Number(context.modeIndex) || 0) !== "muzzleloader") return;
    entry.reloadSeconds = bayonetReloadSeconds(entry.reloadSeconds);
  });

  // Ceramic breaks as cheap, titanium as very fine; a sword cane a grade below what was paid for (pp. 197-198).
  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    const item = context?.item;
    if (!on.blades() || !isEquipment(item)) return;
    // Only while the weapon breaks as its own grade: a superior swing that changed it is the Basic Set's.
    if (context.quality !== undefined && context.quality !== gradeOf(item)) return;
    const material = isBladed(item) ? weaponData(item).blade : "";
    const breaksAs = material ? BLADE_FIGURES[material].breaksAs : null;
    if (breaksAs) context.breakage = api.rules.breakageModifier(breaksAs as never);
    else if (isSwordCane(item)) context.breakage = api.rules.breakageModifier(gradeBelow(gradeOf(item)) as never);
  });

  // A stun weapon's victim: stunned while it's held on and (20 - HT) seconds more, then HT-3 each second (p. 199).
  Hooks.on(api.combat.hooks.afflictionEffect, (context: any) => {
    const item = context?.item;
    if (!on.stun() || !stunsOnContact(item)) return;
    const held = Math.max(0, Math.floor(Number(stateOf(api, item).contactHold) || 0));
    const ht = Number(api.actors.attribute(context.actor, "HT")) || 10;
    const seconds = contactStunSeconds(held, ht);
    context.effects.push({ key: "stunned", holdRecovery: { seconds } });
    context.effects.push({
      module: MODULE_ID,
      key: SHOCK,
      label: F("ShockLabel", { weapon: nameOf(item), penalty: CONTACT_STUN.recovery }),
      effects: { modifiers: [{ label: F("ShockLine", { weapon: nameOf(item) }), value: CONTACT_STUN.recovery, rolls: ["stunRecovery"] }] },
    });
    void say(context.actor, nameOf(item), [F("Stunned", { name: String(context.actor?.name ?? ""), held, seconds, recovery: CONTACT_STUN.recovery })]);
  });

  // Recovered: the shock's penalty goes with the stun.
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    if (!(context?.tags ?? []).includes("stunRecovery") || !context?.outcome?.success || !actor) return;
    for (const condition of (api.actors.conditions(actor) ?? []) as any[]) {
      if (String(condition?.id ?? "") === `${MODULE_ID}.${SHOCK}`) void api.actors.removeCondition(actor, String(condition.id));
    }
  });
}

/** A bow's, crossbow's, slingshot's or speargun's row under the switch (p. 201). */
function bowRow(api: GWorldApi, item: any, data: WeaponData, entry: any, row: any, mode: any): void {
  if (!row) return;
  const skill = String(mode?.skill ?? row.skillName ?? "");
  // A compound bow shoots two ST higher: its damage and range at that ST.
  if (data.compound && canBeCompound(nameOf(item)) && (bowSkill({ skill }) || crossbowSkill({ skill }))) {
    const st = Number(entry.basis?.st) || Number(mode?.weaponSt) || Number(mode?.minSt) || 10;
    const table = mode?.damageBase === "sw" ? api.rules.swingDamage : api.rules.thrustDamage;
    if (mode?.damageBase === "thr" || mode?.damageBase === "sw") {
      const before = table(st);
      const after = table(st + COMPOUND.st);
      row.damage = withAdds(api, row.damage, after.dice - before.dice, after.adds - before.adds);
    }
    if (mode?.rangeIsStMultiple) {
      row.halfDamageRange = scaledRange(row.halfDamageRange, st, st + COMPOUND.st);
      row.maxRange = scaledRange(row.maxRange, st, st + COMPOUND.st);
    }
    row.notes?.push?.({ label: F("CompoundNote", { st: COMPOUND.st }), hint: L("CompoundHint") });
  }
  // Sights help only a skilled archer (p. 201).
  if (data.sights && bowSkill({ skill }) && !row.atDefault && typeof row.accuracy === "number") {
    row.accuracy += BOW_SIGHTS.accuracy;
    row.notes?.push?.({ label: F("SightsNote", { accuracy: BOW_SIGHTS.accuracy }), hint: L("SightsHint") });
  }
  if (/^bow \(slingshot\)/i.test(skill) && data.shot === "metal") {
    row.damage = withAdds(api, row.damage, 0, METAL_SHOT.damage);
    row.halfDamageRange = Math.round((Number(row.halfDamageRange) || 0) * METAL_SHOT.range);
    row.maxRange = Math.round((Number(row.maxRange) || 0) * METAL_SHOT.range);
    row.notes?.push?.({ label: L("MetalShotNote"), hint: L("MetalShotHint") });
  }
  if (/^crossbow \(speargun\)/i.test(skill)) {
    if (sceneEnvironment().underwater) {
      row.halfDamageRange = Math.max(1, Math.round((Number(row.halfDamageRange) || 0) / SPEARGUN.underwaterDivisor));
      row.maxRange = Math.max(1, Math.round((Number(row.maxRange) || 0) / SPEARGUN.underwaterDivisor));
    }
    row.notes?.push?.({ label: F("LineNote", { yards: SPEARGUN.lineYards }), hint: L("LineHint") });
  }
}
