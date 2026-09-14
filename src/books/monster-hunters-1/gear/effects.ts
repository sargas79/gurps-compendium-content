/**
 * What Monster Hunters 1's gear does to an item and its user (pp. 53-54,
 * 59-61, 63), worked out from this module's gear data and the system's own
 * fields: the price and weight, the attack rows, the odds of breakage, and a
 * character's concealment and Signature Gear.
 */

import type { GWorldApi } from "../../../shared/module.js";
import { isHoly } from "../holy.js";
import { gearData, loadFor, type GearData } from "./data.js";
import { gadgetCostFactor, gadgetWeightFactor, holdoutBonus, improvedGadget, SCENT_MASKING_PENALTY, signatureGearPointCost } from "./gadgets.js";
import { isShotgun, specialAmmunitionEffect } from "./special-ammunition.js";
import {
  allowedWeapon,
  improvedWeaponPrice,
  improvisedPenalty,
  weaponImprovementEffects,
  weaponImprovementProblems,
  type ImprovedWeapon,
} from "./weapon-improvements.js";

const modesOf = (item: any): any[] => [...(item?.system?.meleeModes ?? []), ...(item?.system?.rangedModes ?? [])];

/** Whether an item is a weapon, as the book's weapon options read it: equipment with a skill to attack with. */
export function isWeapon(item: any): boolean {
  return item?.type === "equipment" && modesOf(item).some((m) => String(m?.skill ?? "").trim() !== "");
}

/** Whether an item is priced as a gadget or an article of clothing: armour, or equipment with no attack. */
export function isGadget(item: any): boolean {
  return item?.type === "armor" || (item?.type === "equipment" && modesOf(item).length === 0);
}

/** The weapon's class, as the item says or the system works it out. */
export function weaponClassOf(api: GWorldApi, item: any): ImprovedWeapon["weaponClass"] {
  const own = String(item?.system?.weaponClass ?? "");
  if (own) return own as ImprovedWeapon["weaponClass"];
  const modes = modesOf(item);
  return api.rules.weaponClassOf({
    skills: modes.map((m) => String(m.skill ?? "")),
    damageTypes: modes.map((m) => String(m.damageType ?? "")) as never,
    hasMalfunction: (item?.system?.rangedModes ?? []).some((m: any) => m.malfunction),
    isFencing: (item?.system?.meleeModes ?? []).some((m: any) => m.isFencing),
  }) as ImprovedWeapon["weaponClass"];
}

/** The weapon as the book's improvement rules read it, as asked for. */
export function askedWeapon(api: GWorldApi, item: any, data: GearData = gearData(item)): ImprovedWeapon {
  return {
    weaponClass: weaponClassOf(api, item),
    quality: String(item?.system?.quality ?? "good") as ImprovedWeapon["quality"],
    material: String(item?.system?.material ?? "") as ImprovedWeapon["material"],
    improvements: { ...data.weapon, holy: isHoly(item) },
    twoHandedAxeOrMace: modesOf(item).some((m) => /two-handed axe\/mace/i.test(String(m.skill ?? ""))),
  };
}

/** The problems with what a weapon asks for, by key. */
export const weaponProblems = (api: GWorldApi, item: any, data?: GearData) => weaponImprovementProblems(askedWeapon(api, item, data));

/** The list figures: this module's, the system's list price, or the item's own. */
function listOf(item: any, data: GearData): { cost: number; weight: number } {
  const systemList = Number(item?.system?.listCost) || 0;
  return {
    cost: data.listCost || systemList || Number(item?.system?.cost) || 0,
    weight: data.listWeight || Number(item?.system?.weight) || 0,
  };
}

/**
 * An item's price and weight under the book's gear rules, or null where they
 * don't change it. A weapon is priced by its options, grade, material and
 * holiness; a gadget or article of clothing by its improvements and, other
 * than a tool kit or lab, its equipment grade.
 */
export function gearPrice(api: GWorldApi, item: any): { cost: number; weight: number; costFactor: number } | null {
  const data = gearData(item);
  const list = listOf(item, data);
  let priced: { cost: number; weight: number; costFactor: number } | null = null;
  if (isWeapon(item)) {
    priced = improvedWeaponPrice(allowedWeapon(askedWeapon(api, item, data)), list);
  } else if (isGadget(item)) {
    const quality = item.type === "equipment" && item.system?.category !== "tool" ? String(item.system?.equipmentQuality ?? "basic") : "basic";
    const cf = gadgetCostFactor(data.gadget, quality);
    const wf = gadgetWeightFactor(data.gadget);
    if (cf === 0 && wf === 1 && !data.listCost && !data.listWeight) return null;
    const g = improvedGadget({ listCost: list.cost, listWeight: list.weight, improvements: data.gadget, quality });
    priced = { cost: g.cost, weight: g.weight, costFactor: g.costFactor };
  }
  if (!priced) return null;
  const stored = { cost: Number(item?.system?.cost) || 0, weight: Number(item?.system?.weight) || 0 };
  return priced.cost === stored.cost && priced.weight === stored.weight ? null : priced;
}

/** What the rows' notes say, localized. */
export type NoteText = (key: string) => { label: string; hint: string };

/**
 * Changes an item's attack rows for the book's weapon options (pp. 59-61)
 * and special ammunition (p. 63), for the system's `gworld.weaponAttacks`
 * hook. The book's grades take the place of the Basic Set's where they
 * differ: what the Basic Set's grade added to damage, Acc and range is taken
 * back out, and the book's put in.
 */
export function adjustWeaponRows(api: GWorldApi, context: any, noteText: NoteText, followUpLabel: string): void {
  const item = context?.item;
  if (!isWeapon(item)) return;
  const data = gearData(item);
  const weapon = allowedWeapon(askedWeapon(api, item, data));
  const firearm = weapon.weaponClass === "firearm";
  const askedQuality = String(item.system?.quality ?? "good") as ImprovedWeapon["quality"];
  const basicGrade = api.registry.isRuleOn("weaponQuality") ? askedQuality : "good";
  const traitNames = [...(context.actor?.items ?? [])].filter((i: any) => i?.type === "trait").map((i: any) => String(i.name ?? ""));

  for (const entry of context.rows ?? []) {
    const { mode, row, basis } = entry;
    const ranged = entry.kind === "ranged";
    const fx = weaponImprovementEffects(weapon, { damageType: mode.damageType ?? "", baseAccuracy: basis.accuracy, thrown: Boolean(mode.thrown), ranged });

    if (typeof row.skillLevel === "number") {
      row.skillLevel += fx.skill + improvisedPenalty({ penalty: data.improvisedPenalty, skill: String(mode.skill ?? ""), traitNames });
    }

    // Damage: a firearm's grade is in its Acc, and "spec." damage has nothing to add to.
    if (!firearm && !mode.damageSpecial && typeof row.damage === "string") {
      const basicBonus = api.rules.qualityDamageBonus(basicGrade as never, String(mode.damageType ?? "") as never, String(item.system?.material ?? "") as never);
      row.damage = fx.st
        ? context.addToDamage(context.damageAt(entry, basis.st + fx.st), fx.damage)
        : context.addToDamage(row.damage, fx.damage - basicBonus);
    }

    if (!ranged) continue;
    const basicAccuracy = api.registry.isRuleOn("weaponQuality") ? api.rules.qualityAccuracyBonus(weapon.weaponClass as never, basicGrade as never, Boolean(mode.thrown)) : 0;
    const basicRange = api.registry.isRuleOn("weaponQuality") ? api.rules.qualityRangeMultiplier(weapon.weaponClass as never, basicGrade as never) : 1;
    row.accuracy = (Number(row.accuracy) || 0) - basicAccuracy + fx.accuracy;
    if (fx.st) {
      const at = context.rangeAt(entry, basis.st + fx.st);
      row.halfDamageRange = at.halfDamageRange * fx.rangeMultiplier;
      row.maxRange = at.maxRange * fx.rangeMultiplier;
    } else if (fx.rangeMultiplier !== basicRange) {
      row.halfDamageRange = (Number(row.halfDamageRange) || 0) / basicRange * fx.rangeMultiplier;
      row.maxRange = (Number(row.maxRange) || 0) / basicRange * fx.rangeMultiplier;
    }

    // Special ammunition, which takes the place of the Basic Set's kinds of round.
    if (!firearm) continue;
    const load = loadFor(data, Number(row.modeIndex) || 0);
    if (!load.powder && !load.payload) continue;
    const special = specialAmmunitionEffect(load, {
      damage: basis.damage,
      damageType: String(basis.damageType || mode.damageType || "pi") as never,
      armorDivisor: api.rules.materialArmorDivisor(String(item.system?.material ?? "") as never, String(mode.damageType ?? "") as never) ?? basis.armorDivisor,
      accuracy: basis.accuracy,
      st: mode.minSt ?? null,
      shotgun: isShotgun({ skill: String(mode.skill ?? ""), name: String(item.name ?? ""), projectiles: Number(mode.projectiles ?? 1) || 1 }),
      projectiles: Number(mode.projectiles ?? 1) || 1,
    });
    row.damage = special.noDamage ? "—" : special.damage;
    row.damageType = special.damageType;
    row.armorDivisor = special.armorDivisor;
    row.accuracy = basis.accuracy + fx.accuracy + special.accuracy;
    if (special.fixedRange) {
      row.halfDamageRange = 0;
      row.maxRange = special.fixedRange;
    } else {
      row.halfDamageRange = basis.halfDamageRange * fx.rangeMultiplier * special.rangeMultiplier;
      row.maxRange = basis.maxRange * fx.rangeMultiplier * special.rangeMultiplier;
    }
    if (special.rateOfFire !== null) row.rateOfFire = special.rateOfFire;
    if (special.st !== null) row.minSt = special.st;
    if (special.projectiles !== null) row.projectiles = special.projectiles;
    if (special.material) row.material = special.material;
    if (special.holy) row.holy = true;
    if (special.followUp) row.followUp = { ...special.followUp, label: followUpLabel };
    row.notes.push(...special.notes.map((key) => noteText(key)));
  }
}

/**
 * The book's odds of breakage for a parrying weapon (pp. 59-61), for the
 * system's `gworld.breakageOdds` hook. Only while the weapon breaks as its own
 * grade: a superior swing that changes the grade is the Basic Set's to judge.
 */
export function bookBreakage(api: GWorldApi, context: any): void {
  const item = context?.item;
  if (!isWeapon(item)) return;
  const weapon = allowedWeapon(askedWeapon(api, item));
  // The grade the parry was judged at, where nothing changed it.
  const own = api.registry.isRuleOn("weaponQuality") ? String(item.system?.quality ?? "good") : "good";
  if (context.quality !== own) return;
  context.breakage = weaponImprovementEffects(weapon, { damageType: "" }).breakage;
}

/**
 * What a character wears to hide things and themselves (p. 59): the best
 * Holdout an article worn or carried gives, with Undercover's, and
 * Scent-Masking's -4 to Smell rolls to find them.
 */
export function concealmentOf(actor: any): { holdout: number; smell: number; source: string } {
  const out = { holdout: 0, smell: 0, source: "" };
  for (const item of [...(actor?.items ?? [])]) {
    if (item.type !== "armor" && item.type !== "equipment") continue;
    const worn = item.type === "armor" ? Boolean(item.system?.equipped) : item.system?.carried !== false;
    if (!worn) continue;
    const data = gearData(item);
    const bonus = holdoutBonus({ own: data.holdout, undercover: data.gadget.undercover });
    if (bonus > out.holdout) Object.assign(out, { holdout: bonus, source: String(item.name ?? "") });
    if (data.gadget.scentMasking && item.type === "armor") out.smell = SCENT_MASKING_PENALTY;
  }
  return out;
}

/**
 * Signature Gear (p. 53): "1 point for every $10,000 or fraction thereof"
 * of each item marked, against the points the character's Signature Gear
 * trait holds.
 */
export function signatureGearOf(api: GWorldApi, actor: any): { needed: number; points: number } {
  const traits = [...(actor?.items ?? [])].filter((i: any) => i?.type === "trait").map((i: any) => ({ name: String(i.name ?? ""), levels: Number(i.system?.levels ?? 0) }));
  const needed = [...(actor?.items ?? [])]
    .filter((i: any) => gearData(i).signature)
    .reduce((sum, i: any) => sum + signatureGearPointCost(api.data.effectivePrice(i).cost * Math.max(1, Number(i.system?.quantity ?? 1) || 1)), 0);
  return { needed, points: api.rules.signatureGearPoints(traits) };
}
