/**
 * GURPS High-Tech's melee and muscle-powered weapons (pp. 196-201), as pure
 * rules: fixing a bayonet and what it does to the gun, rifle butts and the
 * tomahawk's spike, sheaths apart from their blades, blade composition and
 * sword canes, electric stun weapons held in contact, and compound bows,
 * bow accessories, slingshot shot and spearguns.
 */

// ── bayonets and rifle butts (pp. 197-198) ──

/**
 * Fixing a bayonet takes four Ready maneuvers -- drawing it, changing grip,
 * mounting it, readying the gun as a melee weapon -- or three with a
 * successful Fast-Draw (Knife) roll. Fixed, it costs the gun -1 to Guns and
 * slows a muzzleloader's reload by a tenth, rounded up (p. 197); an
 * unfamiliar gun-and-bayonet pairing is -2 to hit (Familiarity, p. B169).
 */
export const BAYONET = Object.freeze({ readies: 4, fastDrawReadies: 3, gunsPenalty: -1, reloadFactor: 1.1, unfamiliar: -2 });

/** The Ready maneuvers fixing a bayonet takes: three where Fast-Draw (Knife) succeeded. */
export function bayonetReadies(fastDraw: boolean): number {
  return fastDraw ? BAYONET.fastDrawReadies : BAYONET.readies;
}

/** A muzzleloader's reload with a bayonet fixed: a tenth longer, rounded up (p. 197). */
export function bayonetReloadSeconds(seconds: number): number {
  const s = Math.max(0, Number(seconds) || 0);
  // Worked in tenths so 10 seconds is 11, not 12 from a float's rounding.
  return Math.ceil((s * Math.round(BAYONET.reloadFactor * 10)) / 10);
}

/** A long arm's reach as a melee weapon: TL4-6 ones 1, 2*; TL7-8 ones 1 (pp. 197-198). */
export function longArmReach(tl: number): string {
  return tl <= 6 ? "1,2*" : "1";
}

/** What a melee row is: its skill and the skills it defaults to, its damage and reach. */
export interface MeleeProfile {
  key: string;
  skill: string;
  /** DX's default, then the other skills' (Characters pp. 208-209, 222). */
  defaults: ReadonlyArray<{ skill: string; modifier: number }>;
  base: "thr" | "sw";
  modifier: number;
  damageType: string;
  reach: string;
  parry: number | null;
  twoHanded: boolean;
}

const DX = "DX";
const SPEAR = [{ skill: DX, modifier: -5 }, { skill: "Polearm", modifier: -4 }, { skill: "Staff", modifier: -2 }];
const STAFF = [{ skill: DX, modifier: -5 }, { skill: "Polearm", modifier: -4 }, { skill: "Spear", modifier: -2 }];
const TWO_HANDED_AXE = [{ skill: DX, modifier: -5 }, { skill: "Axe/Mace", modifier: -3 }, { skill: "Polearm", modifier: -4 }];
const KNIFE = [{ skill: DX, modifier: -4 }, { skill: "Force Sword", modifier: -3 }, { skill: "Main-Gauche", modifier: -3 }, { skill: "Shortsword", modifier: -3 }];
const SHORTSWORD = [{ skill: DX, modifier: -5 }, { skill: "Broadsword", modifier: -2 }, { skill: "Force Sword", modifier: -4 }, { skill: "Jitte/Sai", modifier: -3 }, { skill: "Knife", modifier: -4 }, { skill: "Saber", modifier: -4 }, { skill: "Smallsword", modifier: -4 }, { skill: "Tonfa", modifier: -3 }];

/**
 * A shoulder arm's bayonet: Spear, thrust+3 impaling, at the gun's reach
 * (p. 197); a sidearm's is a large knife, with Knife (p. B272).
 */
export function bayonetProfiles(longArm: boolean, tl: number): MeleeProfile[] {
  if (longArm) return [{ key: "thrust", skill: "Spear", defaults: SPEAR, base: "thr", modifier: 3, damageType: "imp", reach: longArmReach(tl), parry: 0, twoHanded: true }];
  return [
    { key: "swing", skill: "Knife", defaults: KNIFE, base: "sw", modifier: -2, damageType: "cut", reach: "C,1", parry: -1, twoHanded: false },
    { key: "thrust", skill: "Knife", defaults: KNIFE, base: "thr", modifier: 0, damageType: "imp", reach: "C", parry: -1, twoHanded: false },
  ];
}

/**
 * A shoulder arm's butt: struck end-on with Staff for thrust+2 crushing, or
 * swung by the barrel with Two-Handed Axe/Mace for swing+3 crushing (p. 198).
 */
export function rifleButtProfiles(tl: number): MeleeProfile[] {
  const reach = longArmReach(tl);
  return [
    { key: "butt", skill: "Staff", defaults: STAFF, base: "thr", modifier: 2, damageType: "cr", reach, parry: 0, twoHanded: true },
    { key: "club", skill: "Two-Handed Axe/Mace", defaults: TWO_HANDED_AXE, base: "sw", modifier: 3, damageType: "cr", reach, parry: 0, twoHanded: true },
  ];
}

/**
 * Swinging a gun by the barrel is only advisable with the TL4-5 single-shot
 * muskets and rifles built for it; with anything else the GM may call for a
 * HT roll against breakage (p. 198).
 */
export function builtForClubbing(tl: number, capacity: number | null): boolean {
  return tl <= 5 && capacity === 1;
}

/** A skill's level from the character's own and its defaults: the best of them, or null. */
export function levelFrom(profile: Pick<MeleeProfile, "skill" | "defaults">, levelOf: (skill: string) => number | null): number | null {
  const own = levelOf(profile.skill);
  const options = profile.defaults.map((d) => {
    const base = levelOf(d.skill);
    return typeof base === "number" ? base + d.modifier : null;
  });
  const all = [own, ...options].filter((n): n is number => typeof n === "number");
  return all.length ? Math.max(...all) : null;
}

/** A rigid sheath of a pound or more serves as a baton, with Shortsword (p. 198; the baton, p. B273). */
export function sheathBatonProfiles(): MeleeProfile[] {
  return [
    { key: "swing", skill: "Shortsword", defaults: SHORTSWORD, base: "sw", modifier: 0, damageType: "cr", reach: "1", parry: 0, twoHanded: false },
    { key: "thrust", skill: "Shortsword", defaults: SHORTSWORD, base: "thr", modifier: 0, damageType: "cr", reach: "1", parry: 0, twoHanded: false },
  ];
}

// ── sheaths (p. 198) ──

export type Sheath = "" | "flexible" | "none";
export const SHEATHS: readonly Sheath[] = ["", "flexible", "none"];

/** A sheath of at least this many pounds can be used as a baton. */
export const SHEATH_BATON_WEIGHT = 1;

/** The skills of the knives and swords whose table weight includes a sheath (p. B270). */
export const SHEATHED_SKILLS = /^(knife|shortsword|broadsword|smallsword|rapier|saber|two-handed sword|main-gauche)\b/i;

/** What the sheath weighs: the record's own figure, or a third of the table weight (p. 198). */
export function sheathWeight(listed: number, own: number): number {
  const weight = Math.max(0, Number(listed) || 0);
  const stated = Math.max(0, Number(own) || 0);
  return Math.round((stated > 0 ? Math.min(stated, weight) : weight / 3) * 1000) / 1000;
}

/**
 * The weapon's weight with the sheath it has: the table's with a rigid one;
 * the blade alone with a flexible one (whose weight is negligible) or none.
 */
export function sheathedWeight(listed: number, own: number, sheath: Sheath): number {
  const weight = Math.max(0, Number(listed) || 0);
  if (!sheath) return weight;
  return Math.round((weight - sheathWeight(weight, own)) * 1000) / 1000;
}

/** The HT roll against corrosion and incidental damage (p. B485): -1 in a flexible sheath, -2 with none. */
export function sheathHtModifier(sheath: Sheath): number {
  return sheath === "flexible" ? -1 : sheath === "none" ? -2 : 0;
}

/** Whether the sheath works as a baton: a rigid one of a pound or more. */
export function sheathIsBaton(listed: number, own: number, sheath: Sheath): boolean {
  return !sheath && sheathWeight(listed, own) >= SHEATH_BATON_WEIGHT;
}

/** A replacement sheath: a tenth of a good-quality weapon's price if flexible, twice that if rigid. */
export function replacementSheath(goodPrice: number): { flexible: number; rigid: number } {
  const tenth = Math.max(0, Number(goodPrice) || 0) / 10;
  return { flexible: Math.round(tenth * 100) / 100, rigid: Math.round(tenth * 2 * 100) / 100 };
}

// ── blade composition (pp. 196-198, 201) ──

export type BladeMaterial = "" | "stainless" | "ceramic" | "titanium";
export const BLADE_MATERIALS: readonly BladeMaterial[] = ["", "stainless", "ceramic", "titanium"];

/** The TL each material appears at (p. 198). */
export const BLADE_TL: Readonly<Record<Exclude<BladeMaterial, "">, number>> = Object.freeze({ stainless: 6, ceramic: 7, titanium: 7 });

/**
 * What the material does to the price and to breakage (p. 198): ceramic is
 * triple cost and half weight and breaks as cheap; titanium double cost and
 * three quarters of the weight and breaks as very fine. Stainless costs
 * nothing extra; what it does to a sword is its grade.
 */
export const BLADE_FIGURES: Readonly<Record<Exclude<BladeMaterial, "">, { cost: number; weight: number; breaksAs: "cheap" | "veryFine" | null }>> = Object.freeze({
  stainless: { cost: 1, weight: 1, breaksAs: null },
  ceramic: { cost: 3, weight: 0.5, breaksAs: "cheap" },
  titanium: { cost: 2, weight: 0.75, breaksAs: "veryFine" },
});

export type Grade = "cheap" | "good" | "fine" | "veryFine";
const GRADES: readonly Grade[] = ["cheap", "good", "fine", "veryFine"];

/**
 * A stainless sword's price as a multiple of list (p. 198): list price buys
 * a cheap one at TL6 and a good one at TL7-8, and each of the two grades
 * above that costs double the usual -- 8 and 40 times list. Null for a grade
 * past those two; for one below list's, the ordinary price is left alone.
 */
export function stainlessSwordMultiplier(grade: Grade, tl: number): number | null {
  const base = tl >= 7 ? 1 : 0;
  const steps = GRADES.indexOf(grade) - base;
  if (steps < 0) return null;
  return [1, 8, 40][steps] ?? null;
}

/** Whether the material can go on a weapon: knives, swords and axes -- anything that cuts or impales. */
export function takesBladeMaterial(damageTypes: readonly string[]): boolean {
  return damageTypes.some((t) => t === "cut" || t === "imp");
}

/** The grade one below: a sword cane's thin blade is a level lower than paid for (p. 197). */
export function gradeBelow(grade: Grade): Grade {
  return GRADES[Math.max(0, GRADES.indexOf(grade) - 1)] ?? "cheap";
}

/** The damage a grade adds to cutting and impaling (p. B274): fine +1, very fine +2. */
export function gradeDamage(grade: Grade): number {
  return grade === "fine" ? 1 : grade === "veryFine" ? 2 : 0;
}

// ── electric stun weapons (p. 199) ──

/** A stun weapon's victim rolls HT-3 each second to recover, once the stun has run (p. 199). */
export const CONTACT_STUN = Object.freeze({ recovery: -3 });

/** The seconds the stun lasts: in contact, then (20 - HT) more, at least one (p. 199; Campaigns p. 432). */
export function contactStunSeconds(contactSeconds: number, ht: number): number {
  const held = Math.max(0, Math.floor(Number(contactSeconds) || 0));
  return held + Math.max(1, 20 - Math.floor(Number(ht) || 0));
}

/** The book's stun weapons, by the records' names. */
export function isContactStunner(name: string): boolean {
  return /^(stun gun|stun baton|cattle prod)\b/i.test(String(name ?? "").trim());
}

// ── muscle-powered weapons (p. 201) ──

/** A compound bow or crossbow shoots as if two ST stronger, at double cost (p. 201). */
export const COMPOUND = Object.freeze({ st: 2, cost: 2 });

/** Bow sights and stabilizers: +1 Acc to a skilled user, $100; -1 to one unfamiliar with them (p. 201). */
export const BOW_SIGHTS = Object.freeze({ accuracy: 1, cost: 100, unfamiliar: -1 });

/** Bowstring silencers: -2 to Hearing rolls to hear the twang, $1 the pair (p. 201). */
export const BOW_SILENCERS = Object.freeze({ hearing: -2, cost: 1 });

/** The yards at which a bow and a crossbow are heard on an unmodified Hearing roll (p. 158). */
export const BOW_HEARD_AT = Object.freeze({ bow: 4, crossbow: 8 });

/** A slingshot's lead or steel shot: +1 damage and double range over stones (p. 201). */
export const METAL_SHOT = Object.freeze({ damage: 1, range: 2 });

/** A speargun's range under water is a tenth; its spear is on 10 yards of line (p. 201). */
export const SPEARGUN = Object.freeze({ underwaterDivisor: 10, lineYards: 10 });

/** Whether a bow can be built compound: any but a composite bow (p. 201), and not one already compound. */
export function canBeCompound(name: string): boolean {
  const text = String(name ?? "");
  return !/composite/i.test(text) && !/^compound\b/i.test(text);
}

/** A bow's range at the ST it shoots as: the table's multiples times the new ST, as the old range scales. */
export function scaledRange(range: number, st: number, newSt: number): number {
  const s = Math.max(1, Number(st) || 1);
  return Math.round((Math.max(0, Number(range) || 0) * newSt) / s);
}
