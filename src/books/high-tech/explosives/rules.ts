/**
 * High-Tech's explosives and incendiaries (pp. 181-188), as pure rules: what
 * an explosion does besides its damage, how much explosive a job takes,
 * explosives that go off when they shouldn't (or don't when they should), and
 * the incendiaries. `index.ts` registers them with the system; the REF table
 * is `ref.ts`.
 */

import type { ExplosiveRow } from "./ref.js";

// ── damage formulas ─────────────────────────────────────────────────────────

/** A damage formula: dice, adds and a whole multiplier, as the system rolls it. */
export interface DiceAdds {
  dice: number;
  adds: number;
  multiplier?: number;
}

/** Reads "6d", "8d+2", "6dx2" or "6d×14" (the system's grammar), or null. */
export function parseDamage(formula: string): DiceAdds | null {
  const text = String(formula ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x");
  const m = /^(\d*)d([+-]\d+)?(?:x(\d+))?$/.exec(text);
  if (!m) return null;
  const dice = m[1] ? Number(m[1]) : 1;
  const adds = m[2] ? Number(m[2]) : 0;
  const multiplier = m[3] ? Number(m[3]) : 1;
  if (multiplier < 1) return null;
  return multiplier === 1 ? { dice, adds } : { dice, adds, multiplier };
}

/** Writes a formula back as the system reads it: "8d+2", "6dx4". */
export function formatDamage(d: DiceAdds): string {
  const sign = d.adds > 0 ? `+${d.adds}` : d.adds < 0 ? String(d.adds) : "";
  const times = d.multiplier && d.multiplier > 1 ? `x${d.multiplier}` : "";
  return `${d.dice}d${sign}${times}`;
}

/**
 * A formula scaled by a factor: its multiplier, where that stays whole
 * (6dx2 doubled is 6dx4); otherwise its dice laid out, with what is left of a
 * die as adds at 3.5 points a die -- as the system lays out a charge whose
 * multiplier isn't whole (Campaigns p. 415). The average holds either way.
 */
export function scaleDamage(d: DiceAdds, factor: number): DiceAdds {
  const f = Number(factor);
  if (!(f > 0) || f === 1) return { ...d };
  const times = d.multiplier && d.multiplier > 1 ? d.multiplier : 1;
  const scaled = times * f;
  if (Number.isInteger(scaled) && scaled >= 1) return scaled === 1 ? { dice: d.dice, adds: d.adds } : { dice: d.dice, adds: d.adds, multiplier: scaled };
  const total = d.dice * scaled;
  const dice = Math.max(1, Math.floor(total));
  const adds = Math.round((total - dice) * 3.5 + d.adds * scaled);
  return { dice, adds };
}

// ── side effects of explosions (pp. 181-182) ────────────────────────────────

/**
 * A blast inside a room or a vehicle: sealed, everyone in it takes double
 * damage; with doors and windows to blow out, 1.5 times (p. 181). The GM
 * judges whether the walls hold (more than 2 points reach them, but not
 * enough to burst them).
 */
export const ENCLOSURES = ["", "sealed", "vented"] as const;
export type Enclosure = (typeof ENCLOSURES)[number];

export function enclosureFactor(enclosure: unknown): number {
  if (enclosure === "sealed") return 2;
  if (enclosure === "vented") return 1.5;
  return 1;
}

/** The HT roll against concussion: -1 per 5 points of crushing that got through DR (p. 182). */
export function concussionModifier(penetratingCrushing: number): number {
  return -Math.floor(Math.max(0, Number(penetratingCrushing) || 0) / 5);
}

/** The HT roll against the flash: -1 per 10 points of damage received, DR or no (p. 182). */
export function flashModifier(damage: number): number {
  return -Math.floor(Math.max(0, Number(damage) || 0) / 10);
}

/** Ordinary earplugs +1, Protected Hearing (or high-quality earmuffs) +5 (p. 182). */
export const HEARING_PROTECTION = { earplugs: 1, protected: 5 } as const;
/** Sunglasses or a tinted windshield +1, welding goggles +3, Protected Vision (or antiglare goggles) +5 (p. 182). */
export const EYE_PROTECTION = { sunglasses: 1, welding: 3, protected: 5 } as const;

/** Ear and eye gear by name, with what it gives against a blast (pp. 70-71, 182). */
const HEARING_GEAR: ReadonlyArray<{ pattern: RegExp; bonus: number }> = [
  { pattern: /\bearmuffs\b|\belectronic earplugs\b/i, bonus: HEARING_PROTECTION.protected },
  { pattern: /\bearplugs\b/i, bonus: HEARING_PROTECTION.earplugs },
];
const EYE_GEAR: ReadonlyArray<{ pattern: RegExp; bonus: number }> = [
  { pattern: /\banti-?glare goggles\b|\banti-?laser goggles\b|\bballistic sunglasses\b/i, bonus: EYE_PROTECTION.protected },
  { pattern: /\bwelding goggles\b/i, bonus: EYE_PROTECTION.welding },
  { pattern: /\bsunglasses\b|\btinted\b/i, bonus: EYE_PROTECTION.sunglasses },
];

/** The best bonus the gear worn gives: they don't add up. */
function gearBonus(names: readonly string[], table: ReadonlyArray<{ pattern: RegExp; bonus: number }>, protectedSense: boolean, full: number): number {
  let best = protectedSense ? full : 0;
  for (const name of names) {
    const hit = table.find((g) => g.pattern.test(String(name ?? "")));
    if (hit) best = Math.max(best, hit.bonus);
  }
  return best;
}

export function hearingBonus(worn: readonly string[], protectedHearing: boolean): number {
  return gearBonus(worn, HEARING_GEAR, protectedHearing, HEARING_PROTECTION.protected);
}

export function eyeBonus(worn: readonly string[], protectedVision: boolean): number {
  return gearBonus(worn, EYE_GEAR, protectedVision, EYE_PROTECTION.protected);
}

/** What a failed roll against concussion or the flash leaves (p. 182). */
export interface SenseLoss {
  /** Deafened or blinded outright; otherwise a penalty to the sense. */
  total: boolean;
  /** The sense's penalty: the margin of failure. */
  penalty: number;
  /** How long before the roll to recover: (20 - HT) minutes, at least one; two seconds with the sense protected. */
  seconds: number;
}

/**
 * A failure costs the sense the margin; by 10 or more, or a critical
 * failure, the whole sense. It lasts (20 - HT) minutes, at least one -- two
 * seconds for someone with the sense protected. Any failure also stuns.
 */
export function senseLoss(options: { margin: number; criticalFailure: boolean; ht: number; protectedSense: boolean }): SenseLoss {
  const penalty = Math.max(1, Math.floor(Math.abs(Number(options.margin) || 0)));
  const total = options.criticalFailure || penalty >= 10;
  const minutes = Math.max(1, 20 - Math.floor(Number(options.ht) || 0));
  return { total, penalty, seconds: options.protectedSense ? 2 : minutes * 60 };
}

/**
 * The roll vs. HT each turn once the time is up (p. 182): success ends it,
 * and a critical failure leaves it for good -- Hard of Hearing or Bad Sight
 * for a penalty, Deafness or Blindness for the whole sense.
 */
export function senseRecovery(outcome: { success: boolean; criticalFailure: boolean }): "recovered" | "lasting" | "still" {
  if (outcome.criticalFailure) return "lasting";
  return outcome.success ? "recovered" : "still";
}

/**
 * The disadvantage a lasting loss leaves (p. 182; Campaigns p. 422), by the
 * system's trait names; null for Bad Sight, whose kind the GM picks.
 */
export function lastingSenseTrait(sense: "hearing" | "vision", total: boolean): string | null {
  if (sense === "hearing") return total ? "Deafness" : "Hard of Hearing";
  return total ? "Blindness" : null;
}

// ── explosive destruction of materiel (pp. 182-183) ─────────────────────────

/** The jobs the book gives a charge for (p. 182). */
export const DEMOLITION_JOBS = ["crater", "timberBored", "timberWrapped", "girder", "brickWall", "concreteWall", "ironPlate", "steelPlate"] as const;
export type DemolitionJob = (typeof DEMOLITION_JOBS)[number];

/** What a job's formula reads. */
export interface JobSize {
  /** Feet to the surface (a crater). */
  depthFeet?: number;
  /** Inches: a timber's thickness, or a plate's. */
  thicknessInches?: number;
  /** Feet: a wall's thickness. */
  thicknessFeet?: number;
  /** Square inches: a girder's cross-section. */
  areaSquareInches?: number;
  /** Feet: the hole wanted. */
  holeFeet?: number;
}

/** The explosive each formula is written for: black powder for a crater, TNT for the rest (p. 182). */
const BLACK_POWDER_REF = 0.5;
const TNT_REF = 1;

/** The pounds of the formula's own explosive a job takes, and that explosive's REF. */
export function jobCharge(job: DemolitionJob, size: JobSize): { pounds: number; ref: number } {
  const n = (v: unknown) => Math.max(0, Number(v) || 0);
  switch (job) {
    case "crater":
      return { pounds: 300 * n(size.depthFeet), ref: BLACK_POWDER_REF };
    case "timberBored":
      return { pounds: 0.004 * n(size.thicknessInches) ** 2, ref: TNT_REF };
    case "timberWrapped":
      return { pounds: 0.025 * n(size.thicknessInches) ** 2, ref: TNT_REF };
    case "girder":
      return { pounds: 0.5 * n(size.areaSquareInches), ref: TNT_REF };
    case "brickWall":
      return { pounds: 0.5 * n(size.holeFeet) * n(size.thicknessFeet) ** 2, ref: TNT_REF };
    case "concreteWall":
      return { pounds: 1 * n(size.holeFeet) * n(size.thicknessFeet) ** 2, ref: TNT_REF };
    case "ironPlate":
      return { pounds: 2 * n(size.holeFeet) * n(size.thicknessInches) ** 2, ref: TNT_REF };
    case "steelPlate":
      return { pounds: 2.5 * n(size.holeFeet) * n(size.thicknessInches) ** 2, ref: TNT_REF };
  }
}

/** The inputs each job's formula reads. */
export const JOB_INPUTS: Readonly<Record<DemolitionJob, readonly (keyof JobSize)[]>> = {
  crater: ["depthFeet"],
  timberBored: ["thicknessInches"],
  timberWrapped: ["thicknessInches"],
  girder: ["areaSquareInches"],
  brickWall: ["holeFeet", "thicknessFeet"],
  concreteWall: ["holeFeet", "thicknessFeet"],
  ironPlate: ["holeFeet", "thicknessInches"],
  steelPlate: ["holeFeet", "thicknessInches"],
};

/** Jobs whose formula already packs the charge in: a crater's mine and a bored timber (p. 182). */
const PACKED_ALREADY: readonly DemolitionJob[] = ["crater", "timberBored"];
/** A shaped charge blows a hole in a wall (p. 183). */
const SHAPED_JOBS: readonly DemolitionJob[] = ["brickWall", "concreteWall"];

export const canTamp = (job: DemolitionJob) => !PACKED_ALREADY.includes(job);
export const canShape = (job: DemolitionJob) => SHAPED_JOBS.includes(job);

/**
 * The pounds of an explosive a job takes: the formula's weight times its
 * explosive's REF, divided by this one's (p. 182); halved when tamped into a
 * bored hole, or for a shaped charge on a wall -- the same saving, and the
 * two don't add up (pp. 182-183).
 */
export function chargeFor(options: { job: DemolitionJob; size: JobSize; ref: number; tamped?: boolean; shaped?: boolean }): number {
  const ref = Number(options.ref);
  if (!(ref > 0)) return 0;
  const base = jobCharge(options.job, options.size);
  const halved = (options.tamped && canTamp(options.job)) || (options.shaped && canShape(options.job));
  return (base.pounds * base.ref) / ref / (halved ? 2 : 1);
}

/**
 * Setting a shaped charge: at TL6 Explosives (Demolition) at -4 to remember
 * the effect, then at -5 to make one; from TL7 one roll at no penalty
 * (p. 183).
 */
export function shapedChargeRolls(skillTl: number): number[] {
  return (Number(skillTl) || 0) <= 6 ? [-4, -5] : [0];
}

/** A shaped charge with a metal liner, properly fused, has an armour divisor of (10) (p. 183). */
export const SHAPED_DIVISOR = 10;

/** The DR a shaped charge meets: the structure's, divided by 10. */
export function shapedDr(dr: number): number {
  return Math.floor(Math.max(0, Number(dr) || 0) / SHAPED_DIVISOR);
}

// ── unstable and home-made explosives (pp. 184-187) ─────────────────────────

/** Nitroglycerin that is dropped or jolted goes off on 12+ on 3d; impure nitro, on 10+ (p. 184). */
export const NITRO_SHOCK = 12;
export const IMPURE_NITRO_SHOCK = 10;

const isNitro = (row: ExplosiveRow | null) => /^nitroglycerin\b/i.test(String(row?.type ?? ""));
/** An explosive with nitroglycerin in it: nitro itself, dynamite and blasting gelatin (pp. 183-185). */
export const carriesNitro = (row: ExplosiveRow | null) => /\(NG\)|^Dynamite\b|^Blasting Gelatin\b/i.test(`${row?.type ?? ""} ${row?.use ?? ""}`);
/** Dynamite -- which can be boiled for its nitro (p. 185). Military dynamite has none. */
export const isDynamite = (row: ExplosiveRow | null) => /^dynamite\b/i.test(String(row?.type ?? ""));

/**
 * The 3d roll a jolt sets an explosive off on, or null for a stable one:
 * the number set on the item (old, sweating dynamite, at the GM's call; or
 * impure nitro), else nitroglycerin's 12 (pp. 184-185).
 */
export function shockNumber(row: ExplosiveRow | null, set: number): number | null {
  const n = Math.floor(Number(set) || 0);
  if (n >= 3 && n <= 18) return n;
  return isNitro(row) ? NITRO_SHOCK : null;
}

/** Whether a jolt set it off. */
export function shockDetonates(roll: number, number: number | null): boolean {
  return number !== null && Math.floor(Number(roll) || 0) >= number;
}

/**
 * Skimming nitro from dynamite, by Chemistry-2 or Explosives (Demolition)-2:
 * failure by 1 ruins the dynamite, by 2 blows half of it up, by more all of
 * it (p. 185).
 */
export type SkimOutcome = "skimmed" | "ruined" | "half" | "all";
export const SKIM_MODIFIER = -2;
export function skimOutcome(success: boolean, margin: number): SkimOutcome {
  if (success) return "skimmed";
  const by = Math.abs(Math.floor(Number(margin) || 0));
  if (by <= 1) return "ruined";
  if (by === 2) return "half";
  return "all";
}

/** What a home-made batch is, as the roll to make it left it (p. 186). */
export const FLAWS = ["", "sound", "unstable", "weak", "smelly", "inert"] as const;
export type Flaw = (typeof FLAWS)[number];

/** The home-cooked explosives the book gives a recipe for (pp. 186-187). */
export type Recipe = "blackPowder" | "plastic" | "anfo" | "fuelAir";

export function recipeFor(row: ExplosiveRow | null): Recipe | null {
  const type = String(row?.type ?? "");
  if (/powder$/i.test(type) && !/smokeless/i.test(type)) return "blackPowder";
  if (/plastic explosive/i.test(String(row?.use ?? ""))) return "plastic";
  if (/^anfo$|^ammonium nitrate/i.test(type)) return "anfo";
  if (/^fuel-air/i.test(type)) return "fuelAir";
  return null;
}

/** A step of a recipe: any one of the skills, at its modifier, the best of them rolled. */
export type RecipeStep = ReadonlyArray<{ skill: string; modifier: number }>;

const DEMOLITION = "Explosives (Demolition)";

/**
 * The rolls a batch takes (pp. 186-187): black powder, Explosives
 * (Demolition), Explosives (Fireworks)+4 or Chemistry+4; plastique,
 * Chemistry or Explosives (Demolition); ANFO, Chemistry+4 or Explosives
 * (Demolition)+4 to mix it; a fuel-air device, Chemistry-3 and then
 * Explosives (Demolition)-4.
 */
export const RECIPES: Readonly<Record<Recipe, readonly RecipeStep[]>> = {
  blackPowder: [[{ skill: DEMOLITION, modifier: 0 }, { skill: "Explosives (Fireworks)", modifier: 4 }, { skill: "Chemistry", modifier: 4 }]],
  plastic: [[{ skill: "Chemistry", modifier: 0 }, { skill: DEMOLITION, modifier: 0 }]],
  anfo: [[{ skill: "Chemistry", modifier: 4 }, { skill: DEMOLITION, modifier: 4 }]],
  fuelAir: [[{ skill: "Chemistry", modifier: -3 }], [{ skill: DEMOLITION, modifier: -4 }]],
};

/**
 * What a failed batch is. Plastique comes out unstable, weak, smelly and/or
 * inert (p. 186) -- one of them by a die here (1-2 unstable, 3-4 weak, 5
 * smelly, 6 inert), the GM adding more if they like; any other recipe simply
 * doesn't work.
 */
export function failedBatch(recipe: Recipe, d6: number): Flaw {
  if (recipe !== "plastic") return "inert";
  const die = Math.floor(Number(d6) || 0);
  if (die <= 2) return "unstable";
  if (die <= 4) return "weak";
  if (die === 5) return "smelly";
  return "inert";
}

/** A critical failure making plastique or a fuel-air device sets the batch off (pp. 186-187). */
export const blowsUpOnCriticalFailure = (recipe: Recipe) => recipe === "plastic" || recipe === "fuelAir";

/** Unstable plastique: -4 to every Explosives roll to use it (p. 186). */
export const UNSTABLE_PENALTY = -4;
/** Weak plastique does half damage (p. 186). */
export const WEAK_FACTOR = 0.5;
/** Home-made ANFO takes an Explosives (Demolition)+2 roll to set off (p. 186). */
export const ANFO_DETONATION = { skill: DEMOLITION, modifier: 2 } as const;

/** A fuel-air blast is divided by 2 x the distance, not 3 x (p. 187). */
export const FUEL_AIR_DIVISOR_PER_YARD = 2;
export const isFuelAir = (row: ExplosiveRow | null) => /^fuel-air/i.test(String(row?.type ?? ""));

// ── incendiaries (p. 188) ───────────────────────────────────────────────────

/**
 * Thermite: 3d burn a second to whatever it touches, every 10 points of it
 * taking 1 off the DR there for good (in effect, semi-ablative DR); about 25
 * seconds a pound. Its sparks do 3 points a second within a yard and 1 at two
 * yards, without harming DR.
 */
export const THERMITE = { dice: 3, adds: 0, secondsPerPound: 25, damagePerDr: 10 } as const;
export const THERMITE_SPARKS = [{ yards: 1, damage: 3 }, { yards: 2, damage: 1 }] as const;

export function thermiteSeconds(pounds: number): number {
  return Math.floor(Math.max(0, Number(pounds) || 0) * THERMITE.secondsPerPound);
}

/** The DR left where thermite burns, once it has done so much damage there. */
export function thermiteDr(dr: number, damageSoFar: number): number {
  const lost = Math.floor(Math.max(0, Number(damageSoFar) || 0) / THERMITE.damagePerDr);
  return Math.max(0, Math.floor(Number(dr) || 0) - lost);
}

/** The points of DR a second of thermite destroys: those its damage so far crosses a 10 for. */
export function thermiteDrDestroyed(damageBefore: number, damageAfter: number): number {
  const lost = (damage: number) => Math.floor(Math.max(0, Number(damage) || 0) / THERMITE.damagePerDr);
  return Math.max(0, lost(damageAfter) - lost(damageBefore));
}

/**
 * The DR thermite meets on a victim: the DR there now, which already lacks
 * what it wore off the armour for good (`worn`), less what it destroyed
 * beyond that, of DR no armour carries (natural DR, say).
 */
export function thermiteDrOnVictim(drNow: number, damageSoFar: number, worn: number): number {
  const lost = Math.floor(Math.max(0, Number(damageSoFar) || 0) / THERMITE.damagePerDr);
  return Math.max(0, Math.floor(Number(drNow) || 0) - Math.max(0, lost - Math.max(0, Math.floor(Number(worn) || 0))));
}

/** Thermite burning on an object, second by second, from the seconds' rolls. */
export interface ThermiteOnObject {
  /** Seconds it burned before the object's HP ran out, or all of them. */
  seconds: number;
  damage: number;
  injury: number;
  /** The DR left where it burned. */
  drLeft: number;
  /** Whether it burned through: HP at 0 or below. */
  through: boolean;
}

export function thermiteOnObject(rolls: readonly number[], dr: number, hp: number): ThermiteOnObject {
  let damage = 0;
  let injury = 0;
  let seconds = 0;
  const maxHp = Math.max(1, Math.floor(Number(hp) || 0));
  for (const roll of rolls) {
    seconds += 1;
    const now = thermiteDr(dr, damage);
    injury += Math.max(0, roll - now);
    damage += Math.max(0, roll);
    if (injury >= maxHp) break;
  }
  return { seconds, damage, injury, drLeft: thermiteDr(dr, damage), through: injury >= maxHp };
}

/**
 * Napalm: 1d-1 burn a second, as ordinary flame, for at least a minute; only
 * full immersion or a heavy burial puts it out (p. 188).
 */
export const NAPALM = { dice: 1, adds: -1, minSeconds: 60 } as const;
export const isNapalm = (name: string) => /\bnapalm\b/i.test(String(name ?? ""));
