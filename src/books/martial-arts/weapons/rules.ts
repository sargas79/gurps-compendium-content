/**
 * Building weapons (GURPS Martial Arts pp. 214, 216-218, 221): the pure rules
 * for accessories, balance and custom quality levels, and hidden weapons,
 * applied in the book's order -- accessories, then quality, then concealment.
 */

/** Combination-weapon accessories (p. 214). */
export type Accessory = "hammer" | "hook" | "kusari2" | "kusari4" | "pick" | "sickle" | "spear";
export const ACCESSORIES: readonly Accessory[] = ["hammer", "hook", "kusari2", "kusari4", "pick", "sickle", "spear"];

/** What each accessory adds: cost in $ and weight in lbs. */
export const ACCESSORY_PRICE: Readonly<Record<Accessory, { cost: number; weight: number }>> = {
  hammer: { cost: 25, weight: 0.5 },
  hook: { cost: 25, weight: 0 },
  kusari2: { cost: 40, weight: 2.5 },
  kusari4: { cost: 80, weight: 5 },
  pick: { cost: 50, weight: 0.5 },
  sickle: { cost: 30, weight: 0.5 },
  spear: { cost: 30, weight: 0.5 },
};

/** Whether the accessories make the weapon two-handed: a kusari does (p. 214). */
export function makesTwoHanded(accessories: readonly Accessory[]): boolean {
  return accessories.includes("kusari2") || accessories.includes("kusari4");
}

/** Whether the accessories give the Hook technique: a hook, a pick or a sickle (p. 214). */
export function hooks(accessories: readonly Accessory[]): boolean {
  return accessories.some((a) => a === "hook" || a === "pick" || a === "sickle");
}

/**
 * The cost, weight and ST the accessories add (p. 214): +1 ST per 1 lb. or
 * fraction added to a one-handed weapon, or per 2 lbs. or fraction to a
 * two-handed one -- and a kusari makes it two-handed.
 */
export function accessoryAdds(accessories: readonly Accessory[], twoHanded: boolean): { cost: number; weight: number; st: number } {
  const cost = accessories.reduce((sum, a) => sum + ACCESSORY_PRICE[a].cost, 0);
  const weight = accessories.reduce((sum, a) => sum + ACCESSORY_PRICE[a].weight, 0);
  const perSt = twoHanded || makesTwoHanded(accessories) ? 2 : 1;
  return { cost, weight, st: weight > 0 ? Math.ceil(weight / perSt - 1e-9) : 0 };
}

/** Balance (p. 216). */
export type Balance = "cheap" | "good" | "fine";
export const BALANCES: readonly Balance[] = ["cheap", "good", "fine"];

/** Balance's effect on skill, or on Accuracy for a missile weapon (p. 216). */
export function balanceModifier(balance: Balance | "" | null): number {
  return balance === "cheap" ? -1 : balance === "fine" ? 1 : 0;
}

/** Materials quality, as the Basic Set names it, and the class pricing it. */
export type Materials = "cheap" | "good" | "fine" | "veryFine";
export type WeaponKind = "cutting" | "sword" | "crushing" | "bow" | "firearm";

/**
 * The custom quality levels' materials modifier, in percent (p. 216). Null
 * where the book doesn't sell that grade for that kind of weapon.
 */
export function materialsPercent(materials: Materials, kind: WeaponKind, tl: number): number | null {
  const modern = tl >= 7;
  switch (materials) {
    case "cheap":
      return kind === "bow" || kind === "firearm" ? null : modern ? -80 : -60;
    case "good":
      return modern ? -60 : 0;
    case "fine":
      if (kind === "bow") return 300;
      if (modern) return 0;
      return kind === "cutting" ? 900 : kind === "sword" ? 300 : 200;
    case "veryFine":
      return kind === "sword" ? (modern ? 300 : 1900) : null;
  }
}

/** Silver (p. 216): solid, or coated or edged. */
export type Silver = "solid" | "edged";
export const SILVERS: readonly Silver[] = ["solid", "edged"];

/**
 * A weapon's price under custom quality levels (p. 216): the percentages added
 * up and applied to the price after accessories, never a discount past -80%.
 */
export function customQualityCost(base: number, percents: { balance: Balance | ""; materials: number; presentation: number; silver: Silver | "" }): number {
  const balance = percents.balance === "cheap" ? -60 : percents.balance === "fine" ? 400 : 0;
  const silver = percents.silver === "solid" ? 1900 : percents.silver === "edged" ? 200 : 0;
  const total = balance + percents.materials + Math.max(0, percents.presentation) + silver;
  return Math.round(base * Math.max(0.2, 1 + total / 100) * 100) / 100;
}

/** How a weapon is disguised (p. 218). */
export type Disguise = "harmless" | "cap" | "sheathed";
export const DISGUISES: readonly Disguise[] = ["harmless", "cap", "sheathed"];

export interface Concealment {
  /** A concealed-carry rig's bonus, 0-2. */
  rig: number;
  trick: boolean;
  /** Special clothing's bonus, 0-2. */
  clothing: number;
  disguise: Disguise | "";
}

/**
 * Concealment's cost and weight (p. 218), after accessories and quality: a
 * trick weapon +50%, a harmless-looking one double, one sheathed in another
 * item triple; a rig $50 or $200; a cap $30, or $150 on a presentation weapon,
 * and 0.5 lb.
 */
export function concealmentPrice(cost: number, weight: number, concealment: Concealment, presentation: boolean): { cost: number; weight: number } {
  let multiplier = 1;
  if (concealment.trick) multiplier *= 1.5;
  if (concealment.disguise === "harmless") multiplier *= 2;
  if (concealment.disguise === "sheathed") multiplier *= 3;
  let flat = concealment.rig >= 2 ? 200 : concealment.rig === 1 ? 50 : 0;
  let added = 0;
  if (concealment.disguise === "cap") {
    flat += presentation ? 150 : 30;
    added = 0.5;
  }
  return { cost: Math.round((cost * multiplier + flat) * 100) / 100, weight: Math.round((weight + added) * 100) / 100 };
}

/**
 * The Holdout penalty for a weapon (p. 218): its Bulk for a ranged weapon;
 * weight plus longest reach, rounded up, for a rigid melee weapon; weight plus
 * shortest reach for a flexible one. "C" counts as 0.
 */
export function holdoutPenalty(options: { ranged: boolean; bulk: number; weight: number; reaches: readonly string[]; flexible: boolean }): number {
  if (options.ranged) return Math.min(0, Math.round(options.bulk));
  const yards = options.reaches.flatMap((reach) => String(reach).split(/[,-]/)).map((part) => part.trim().replace("*", "")).map((part) => (part === "C" ? 0 : Number(part))).filter(Number.isFinite);
  const reach = yards.length === 0 ? 0 : options.flexible ? Math.min(...yards) : Math.max(...yards);
  const size = Math.ceil(Math.max(0, options.weight) + reach - 1e-9);
  return size > 0 ? -size : 0;
}

/** What rigs, trick mechanisms and clothing add to Holdout (p. 218). */
export function holdoutBonus(concealment: Concealment): number {
  return Math.min(2, Math.max(0, concealment.rig)) + (concealment.trick ? 2 : 0) + Math.min(2, Math.max(0, concealment.clothing));
}

/** A strapped-on trick weapon (p. 218): -1 to skill in melee. */
export const TRICK_MELEE_PENALTY = -1;
/** The first defense against a weapon popping out of another (p. 218). */
export const POP_OUT_DEFENSE = -2;

/** The materials grade one level lower, for a blade sheathed inside another item (p. 218). */
export function lowerGrade(materials: Materials): Materials {
  return materials === "veryFine" ? "fine" : materials === "fine" ? "good" : "cheap";
}

/**
 * A Parry after a change to skill: Parry is 3 + half skill, rounded down, so a
 * point of skill moves it only when it crosses an even number.
 */
export function parryAfterSkill(parry: number, skill: number, change: number): number {
  return parry + Math.floor((skill + change) / 2) - Math.floor(skill / 2);
}
