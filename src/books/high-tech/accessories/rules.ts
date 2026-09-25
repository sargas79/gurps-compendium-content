/**
 * High-Tech's firearm accessories (pp. 155-160), as pure rules: magazines
 * worked out from the calibre, sights and what aiming through them is worth,
 * suppressors and the Hearing Distance Table, and stocks, bipods and shooting
 * sticks. The catalogue says, by a record's name, what each captured
 * accessory is.
 */

import type { AccessoryFigures } from "../../../shared/accessories/index.js";

// ── the catalogue ──

/** The records of pp. 155-160, by name, with their figures. */
const CATALOGUE: ReadonlyArray<{ name: RegExp; figures: AccessoryFigures }> = [
  // Telescopic sights (pp. 155-156): +1 Acc per full doubling of magnification, bought by the +1.
  { name: /^fixed-power scope\b/i, figures: { kind: "scope", fixed: true, levels: { min: 1, max: 5 } } },
  { name: /^variable-power scope\b/i, figures: { kind: "scope", fixed: false, levels: { min: 1, max: 5 } } },
  { name: /^improved-visibility sights?\b/i, figures: { kind: "visibilitySights" } },
  // Collimating and reflex sights (p. 156): +1 to Guns out to 300 yards.
  { name: /^(collimating|reflex) sight\b/i, figures: { kind: "reflexSight", yards: 300 } },
  // Night sights (p. 156): the magnifying ones work as fixed-power scopes.
  { name: /^early night sight\b/i, figures: { kind: "nightSight", nightVision: 2, bulk: -2, imposesTunnelVision: true } },
  { name: /^night sight\b/i, figures: { kind: "nightSight", nightVision: 4, accuracy: 2, fixed: true, bulk: -2, imposesTunnelVision: true } },
  { name: /^improved night sight, add-on\b/i, figures: { kind: "nightSight", nightVision: 5, addOn: true, imposesTunnelVision: true } },
  { name: /^improved night sight\b/i, figures: { kind: "nightSight", nightVision: 5, accuracy: 2, fixed: true, bulk: -1, imposesTunnelVision: true } },
  { name: /^advanced night sight, add-on\b/i, figures: { kind: "nightSight", nightVision: 7, addOn: true, imposesTunnelVision: true } },
  { name: /^advanced night sight\b/i, figures: { kind: "nightSight", nightVision: 7, accuracy: 2, fixed: true, imposesTunnelVision: true } },
  // Tactical lights (pp. 52, 156): small ones are usual for pistols and large ones for shoulder arms -- usual, not a rule.
  { name: /^small tactical light\b/i, figures: { kind: "tacticalLight", yards: 25 } },
  { name: /^large tactical light\b/i, figures: { kind: "tacticalLight", yards: 100 } },
  // Targeting lasers (p. 157).
  { name: /^primitive targeting laser\b/i, figures: { kind: "targetingLaser", yards: 200, bulk: -1 } },
  { name: /^(integral )?targeting laser \(sidearm\)/i, figures: { kind: "targetingLaser", yards: 150, fits: "sidearm" } },
  { name: /^(integral )?targeting laser \(shoulder arm\)/i, figures: { kind: "targetingLaser", yards: 750, fits: "shoulder" } },
  // Computer sights (p. 157): a targeting program, a rangefinder, a variable magnification, and night vision or infravision.
  { name: /^computer sight\b/i, figures: { kind: "computerSight", program: 1, rangefinder: 3, yards: 4000, magnification: 3, infravision: true, nightVisionCost: 22500, bulk: -2, imposesTunnelVision: true } },
  { name: /^mini-computer sight\b/i, figures: { kind: "computerSight", program: 1, rangefinder: 3, yards: 2000, magnification: 2, infravision: true, nightVisionCost: 12500, bulk: -1, imposesTunnelVision: true } },
  // Thermal-imaging sights (p. 157), fixed-power like the rest.
  { name: /^thermal-imaging sight\b/i, figures: { kind: "thermalSight", infravision: true, accuracy: 2, fixed: true, bulk: -2, imposesTunnelVision: true } },
  { name: /^improved thermal-imaging sight\b/i, figures: { kind: "thermalSight", infravision: true, accuracy: 2, fixed: true, bulk: -1, imposesTunnelVision: true } },
  { name: /^advanced thermal-imaging sight\b/i, figures: { kind: "thermalSight", infravision: true, accuracy: 2, fixed: true, imposesTunnelVision: true } },
  // Suppressors (p. 159), bought by the -1 Hearing.
  { name: /^detachable baffle suppressor, \.22/i, figures: { kind: "suppressor", levels: { min: 1, max: 4 }, bulk: -1, suppressor: { design: "baffle", damage: 1, range: 1, shots: 0 } } },
  { name: /^detachable baffle suppressor, pistol/i, figures: { kind: "suppressor", levels: { min: 1, max: 4 }, bulk: -1, suppressor: { design: "baffle", damage: 1, range: 1, shots: 0 } } },
  { name: /^detachable baffle suppressor, rifle/i, figures: { kind: "suppressor", levels: { min: 2, max: 4 }, bulk: -1, suppressor: { design: "baffle", damage: 1, range: 1, shots: 0 } } },
  { name: /^detachable baffle suppressor, oversized/i, figures: { kind: "suppressor", levels: { min: 2, max: 4 }, bulk: -2, suppressor: { design: "baffle", damage: 1, range: 1, shots: 0 } } },
  { name: /^detachable wiper suppressor, pistol/i, figures: { kind: "suppressor", levels: { min: 2, max: 4 }, bulk: -1, suppressor: { design: "wiper", damage: 0.8, range: 0.8, shots: 40 } } },
  { name: /^detachable wiper suppressor, rifle/i, figures: { kind: "suppressor", levels: { min: 2, max: 6 }, bulk: -1, suppressor: { design: "wiper", damage: 0.5, range: 0.5, shots: 40 } } },
  // Stocks and mounts (p. 160).
  { name: /^pistol stock\b/i, figures: { kind: "pistolStock", accuracy: 1, bulk: -1 } },
  { name: /^folding stock\b/i, figures: { kind: "foldingStock" } },
  { name: /^bipod\b/i, figures: { kind: "bipod" } },
  { name: /^shooting sticks\b/i, figures: { kind: "shootingSticks" } },
];

/** What an add-on night sight is installed in front of: a scope or a collimating or reflex sight (p. 156). */
export const ADD_ON_HOSTS: readonly AccessoryFigures["kind"][] = ["scope", "reflexSight"];

/**
 * Whether gear made for a sidearm or a shoulder arm goes on a gun fired
 * with this skill (p. 157): a sidearm is a pistol, and a shoulder arm
 * anything else. Gear that says neither goes on any gun.
 */
export function accessoryFits(fits: AccessoryFigures["fits"], skill: string): boolean {
  if (!fits) return true;
  const pistol = /^guns(?: sport)? \(pistol\)/i.test(String(skill ?? "").trim());
  return fits === "sidearm" ? pistol : !pistol;
}

/** What a record of this name is as an accessory, or null. */
export function catalogueFigures(name: string): AccessoryFigures | null {
  const text = String(name ?? "").trim();
  return CATALOGUE.find((entry) => entry.name.test(text))?.figures ?? null;
}

/** A level within what the record allows. */
export function levelWithin(level: unknown, levels: { min: number; max: number } | undefined): number {
  if (!levels) return 0;
  const n = Math.floor(Number(level) || 0);
  return Math.max(levels.min, Math.min(levels.max, n || levels.min));
}

// ── magazines (p. 155) ──

export type MagazineKind = "extended" | "highDensity" | "drum" | "helicalDrum";
export type MagazineMaterial = "steel" | "alloy";

export const MAGAZINE_KINDS: readonly MagazineKind[] = ["extended", "highDensity", "drum", "helicalDrum"];
export const MAGAZINE_MATERIALS: readonly MagazineMaterial[] = ["steel", "alloy"];

/** The multiplier on WPS x rounds that makes a loaded magazine's weight; alloy stands for alloy or plastic. */
const WEIGHT_MULTIPLIER: Record<MagazineKind, Record<MagazineMaterial, number>> = {
  highDensity: { alloy: 1.1, steel: 1.3 },
  extended: { alloy: 1.2, steel: 1.5 },
  helicalDrum: { alloy: 1.3, steel: 1.6 },
  drum: { alloy: 1.6, steel: 2 },
};

/** The fixed part of an empty magazine's cost, beside WPS x 5 x rounds. */
const COST_FACTOR: Record<MagazineKind, Record<MagazineMaterial, number>> = {
  extended: { steel: 25, alloy: 30 },
  highDensity: { steel: 27, alloy: 33 },
  drum: { steel: 250, alloy: 300 },
  helicalDrum: { steel: 250, alloy: 300 },
};

export interface MagazineFigures {
  /** A loaded magazine's weight, and an empty one's cost. */
  weight: number;
  cost: number;
  /** What it does to the gun's Bulk and Malf. */
  bulk: number;
  malfunction: number;
}

/**
 * A magazine's figures (p. 155): weight is WPS x rounds x the box's multiplier,
 * cost WPS x 5 x rounds plus the box's factor. An extended magazine over 1.5
 * times the normal capacity is -1 Bulk, a drum over 3 times; a high-density
 * one never is. A drum is almost always -1 Malf.; an extended or high-density
 * magazine is only where the GM says it's unreliable.
 */
export function magazineFigures(options: { kind: MagazineKind; material: MagazineMaterial; rounds: number; normal: number; wps: number; unreliable?: boolean }): MagazineFigures {
  const rounds = Math.max(0, Math.floor(options.rounds));
  const normal = Math.max(1, Math.floor(options.normal));
  const wps = Math.max(0, options.wps);
  const drum = options.kind === "drum" || options.kind === "helicalDrum";
  const bulky = options.kind === "extended" ? rounds > normal * 1.5 : drum ? rounds > normal * 3 : false;
  return {
    weight: Math.round(wps * rounds * WEIGHT_MULTIPLIER[options.kind][options.material] * 100) / 100,
    cost: Math.round((wps * 5 * rounds + COST_FACTOR[options.kind][options.material]) * 100) / 100,
    bulk: bulky ? -1 : 0,
    malfunction: drum || options.unreliable ? -1 : 0,
  };
}

/**
 * High-density magazines can't go in a grip (p. 155): not for a gun fired with
 * Guns (Pistol), unless its own design has one.
 */
export function highDensityFits(skill: string): boolean {
  return !/^guns(?: sport)? \(pistol\)/i.test(String(skill ?? "").trim());
}

/** The standard magazine's capacity, from the Shots column: "30+1(3)" holds 30. */
export function magazineCapacity(shots: string): number {
  const m = /^\s*(\d+)/.exec(String(shots ?? ""));
  return m ? Number(m[1]) : 0;
}

/**
 * What a magazine does to the gun's price (p. 155): it adds the new magazine's
 * cost, and its loaded weight less the rounds the gun's loaded weight already
 * counts.
 */
export function magazinePriceChange(figures: MagazineFigures, normal: number, wps: number): { cost: number; weight: number } {
  return { cost: figures.cost, weight: Math.round((figures.weight - Math.max(0, normal) * Math.max(0, wps)) * 100) / 100 };
}

// ── sights (pp. 155-157) ──

/**
 * Darkness penalties the sights take off (pp. 155-156): all but the
 * cheapest TL7-8 scopes collect light, a point; an illuminated reticle, up to
 * two; improved-visibility sights a point; a collimating or reflex sight up
 * to three, on every shot.
 */
export const DARKNESS_OFFSET = Object.freeze({ scope: 1, illuminatedReticle: 2, visibilitySights: 1, reflexSight: 3 });

/** A scope's darkness offset, for an aimed shot through it: an illuminated reticle's, or a TL7+ scope's (p. 155). */
export function scopeDarkness(techLevel: number, illuminated: boolean): number {
  if (illuminated) return DARKNESS_OFFSET.illuminatedReticle;
  return techLevel >= 7 ? DARKNESS_OFFSET.scope : 0;
}

/** Within its beam, a tactical light leaves the more favourable of -3 and the darkness penalty (p. 156). */
export const TACTICAL_LIGHT_FLOOR = -3;

/**
 * A darkness penalty after a tactical light and the sights: the light first
 * (no worse than -3 within its beam), then the best of the sights' offsets
 * off what is left, never above 0. The offsets don't add up: each says what
 * it negates, up to its figure.
 */
export function darknessAfter(penalty: number, options: { light: boolean; sightOffset: number }): number {
  let value = Math.min(0, Math.trunc(Number(penalty) || 0));
  if (options.light) value = Math.max(value, TACTICAL_LIGHT_FLOOR);
  return Math.min(0, value + Math.max(0, Math.trunc(Number(options.sightOffset) || 0)));
}

/**
 * The combined bonus of all the sighting gadgetry on a gun can't exceed its
 * base Acc (p. 155): what is over it comes off. Precision Aiming (p. 84) is
 * its own bonus and isn't counted.
 */
export function overSightCap(baseAccuracy: number, bonus: number): number {
  return Math.max(0, bonus - Math.max(0, baseAccuracy));
}

/** A high-powered scope (over 4x, so +3 or better) makes an unaimed shot slower: -1 Bulk (p. 156). */
export function unaimedScopeBulk(scopeBonus: number): number {
  return scopeBonus >= 3 ? -1 : 0;
}

/**
 * A collimating or reflex sight: +1 to Guns out to 300 yards (p. 156), on
 * every shot. It can't be used with a magnifying scope, and a shooter with a
 * targeting laser uses one or the other.
 */
export function reflexBonus(yards: number | null, reach: number, magnifyingScope: boolean): number {
  if (magnifyingScope) return 0;
  if (yards !== null && yards > reach) return 0;
  return 1;
}

/** A computer sight's rangefinder: +3 to an aimed shot within its range (p. 157). */
export function rangefinderBonus(yards: number | null, reach: number, bonus: number): number {
  if (yards !== null && yards > reach) return 0;
  return bonus;
}

export type LaserColour = "red" | "orange" | "green" | "infrared";
export const LASER_COLOURS: readonly LaserColour[] = ["red", "orange", "green", "infrared"];

/**
 * A targeting laser's colour (p. 157): red is the only one at TL7; at TL8 it
 * may be orange (x1.25 cost), green (x4) or infrared (x1.5, LC2). Range in
 * daylight is a third for red and half for orange; green has twice its range
 * in low light; infrared keeps its range but only a shooter with Night
 * Vision, Infravision or Hyperspectral Vision sees the dot.
 */
export const LASER_COLOUR = Object.freeze({
  red: { cost: 1, daylight: 1 / 3, lowLight: 1, tl: 7 },
  orange: { cost: 1.25, daylight: 1 / 2, lowLight: 1, tl: 8 },
  green: { cost: 4, daylight: 1, lowLight: 2, tl: 8 },
  infrared: { cost: 1.5, daylight: 1, lowLight: 1, tl: 8, lc: 2 },
} satisfies Record<LaserColour, { cost: number; daylight: number; lowLight: number; tl: number; lc?: number }>);

/**
 * Whether a shooter sees the laser's dot: an infrared one only with Night
 * Vision, Infravision or Hyperspectral Vision (p. 157).
 */
export function seesLaserDot(colour: LaserColour, vision: { nightVision?: number; infravision?: boolean; hyperspectralVision?: boolean }): boolean {
  if (colour !== "infrared") return true;
  return (Number(vision.nightVision) || 0) > 0 || vision.infravision === true || vision.hyperspectralVision === true;
}

/** A laser's reach in yards by its colour and the light. */
export function laserReach(yards: number, colour: LaserColour, daylight: boolean): number {
  const figures = LASER_COLOUR[colour];
  return Math.round(yards * (daylight ? figures.daylight : figures.lowLight));
}

// ── suppressors and the Hearing Distance Table (pp. 158-159) ──

/** How loud a gun is, by the table's lines. */
export type Report = "airGun" | "veryLight" | "light" | "heavy" | "magnum" | "artillery" | "tankGun";
export const REPORTS: readonly Report[] = ["airGun", "veryLight", "light", "heavy", "magnum", "artillery", "tankGun"];

/** The yards at which each is heard on an unmodified Hearing roll (p. 158). */
export const HEARD_AT: Readonly<Record<Report, number>> = Object.freeze({
  airGun: 16,
  veryLight: 128,
  light: 256,
  heavy: 512,
  magnum: 1024,
  artillery: 2048,
  tankGun: 4096,
});

/**
 * Which line of the table a gun's report is on, as best its figures say: an
 * air gun; a .22 or a musket; a light pistol or a grenade launcher; a heavy
 * pistol, SMG, rifle or shotgun; a magnum rifle or heavy machine gun; a
 * cannon, mortar or launcher as artillery. `average` is the average damage of
 * the gun's first mode.
 */
export function reportOf(facts: { airGun: boolean; calibreClass: string | null; powderAndShot: boolean; skill: string; average: number }): Report {
  if (facts.airGun) return "airGun";
  const skill = String(facts.skill ?? "");
  const kind = facts.calibreClass;
  if (kind === "grenadeLauncher" || /grenade launcher/i.test(skill)) return "light";
  if (kind === "cannon" || kind === "mortar" || kind === "lightAntitank") return "artillery";
  if (facts.powderAndShot) return "veryLight";
  const handgun = kind === "handgun" || /^guns(?: sport)? \(pistol\)/i.test(skill);
  if (handgun) return facts.average <= 5 ? "veryLight" : facts.average <= 7 ? "light" : "heavy";
  if (facts.average > 0 && facts.average <= 6) return "veryLight";
  if (facts.average >= 26.5) return "magnum";
  return "heavy";
}

/**
 * The Hearing modifier for the listener's distance (p. 158): +1 a range step
 * closer than the table's figure, -1 a step further; between two lines, the
 * further counts.
 */
export function hearingDistanceModifier(heardAt: number, yards: number): number {
  const distance = Math.max(0.25, Number(yards) || 0);
  const steps = Math.log2(distance / Math.max(0.25, heardAt));
  return steps > 0 ? -Math.ceil(steps - 1e-9) : Math.floor(-steps + 1e-9);
}

/** Behind the gun or far off to its side: -1 to hear it (p. 158). */
export const OUTSIDE_CONE = -1;
/** A listener with no points in Guns: -4 (p. 158). */
export const UNFAMILIAR_LISTENER = -4;
/** A suppressor on a sealed breech (a bolt-action or dropping block) works a point better (p. 158). */
export const SEALED_BREECH = -1;

export type SuppressorGrade = "poor" | "average" | "good" | "fine";
export const SUPPRESSOR_GRADES: readonly SuppressorGrade[] = ["poor", "average", "good", "fine"];

/**
 * Home-built suppressors (p. 159): the hours to build, the Armoury roll's
 * modifier (null: none needed with Guns or Armoury), how many shots it lasts,
 * what it costs the gun, its weight, and its price as a share of a production
 * model's. A good one copies a model of up to -3 Hearing; a fine one the best.
 */
export const HOME_BUILT = Object.freeze({
  poor: { hours: 0.5, roll: null, lifetime: "1d", hearing: -1, accuracy: -1, malfunction: -1, bulk: -1, weight: 0.5, price: 1 },
  average: { hours: 2, roll: 4, lifetime: "3d", hearing: -2, accuracy: 0, malfunction: 0, bulk: -1, weight: 1, price: 1 },
  good: { hours: 8, roll: 0, lifetime: "", hearing: -3, accuracy: 0, malfunction: 0, bulk: 0, weight: 0, price: 1 / 3 },
  fine: { hours: 16, roll: -2, lifetime: "", hearing: 0, accuracy: 0, malfunction: 0, bulk: 0, weight: 0, price: 1 / 2 },
} satisfies Record<SuppressorGrade, { hours: number; roll: number | null; lifetime: string; hearing: number; accuracy: number; malfunction: number; bulk: number; weight: number; price: number }>);

/**
 * Making a suppressor at home (p. 159). It is designed with Engineer (Small
 * Arms), or at TL7-8 with Research, and built with Armoury (Small Arms),
 * which defaults to Machinist-5, at the grade's modifier. A poor one needs
 * no roll from anyone with Guns or Armoury, and an IQ roll from anyone else.
 * A failed build makes the first shot through it a roll on the Firearm
 * Malfunction Table; a critical failure damages the gun.
 */
export const SUPPRESSOR_DESIGN = Object.freeze({ skill: "Engineer (Small Arms)", research: "Research", researchTl: 7 });
export const SUPPRESSOR_BUILD = Object.freeze({ skill: "Armoury (Small Arms)", fallback: "Machinist", fallbackModifier: -5 });

/** The rolls a home-built suppressor of this grade takes to make, at this TL. */
export function suppressorBuildRolls(grade: SuppressorGrade, tl: number): { designSkills: string[]; buildModifier: number | null } {
  const roll = HOME_BUILT[grade].roll;
  if (roll === null) return { designSkills: [], buildModifier: null };
  return {
    designSkills: tl >= SUPPRESSOR_DESIGN.researchTl ? [SUPPRESSOR_DESIGN.skill, SUPPRESSOR_DESIGN.research] : [SUPPRESSOR_DESIGN.skill],
    buildModifier: roll,
  };
}

/** Attaching or removing a detachable suppressor: 5 seconds threaded, 3 for a TL8 quick-detach model (p. 159). */
export function suppressorSeconds(tl: number): number {
  return tl >= 8 ? 3 : 5;
}

/**
 * A suppressor's Hearing penalty as it stands (p. 159): its level within what
 * the model allows, a home-built one's by its grade (an average one losing a
 * point after half its shots), nothing once it is worn out.
 */
export function suppressorHearing(options: { level: number; levels: { min: number; max: number }; grade: SuppressorGrade | ""; fired: number; lifetime: number }): number {
  const { fired, lifetime, grade } = options;
  if (lifetime > 0 && fired >= lifetime) return 0;
  if (grade === "poor") return HOME_BUILT.poor.hearing;
  if (grade === "average") return fired * 2 >= lifetime && lifetime > 0 ? -1 : HOME_BUILT.average.hearing;
  const level = levelWithin(options.level, options.levels);
  return -(grade === "good" ? Math.min(level, -HOME_BUILT.good.hearing) : level);
}

/** Cinematic silencers double, or even triple, the Hearing penalty (p. 159). */
export function cinematicHearing(penalty: number, multiplier: number): number {
  return penalty * Math.max(1, Math.floor(multiplier));
}

// ── stocks, bipods and shooting sticks (p. 160) ──

/** A pistol stock attached: shot with Guns (Rifle), +1 Acc, -1 Bulk and ST x0.8, rounded up; three seconds on or off. */
export const PISTOL_STOCK = Object.freeze({ skill: "Guns (Rifle)", accuracy: 1, bulk: -1, st: 0.8, seconds: 3 });

/** A stock folded: Bulk a point better, -1 Acc, +1 Recoil unless it is 1, ST x1.2, rounded up; a Ready to fold or unfold. */
export const FOLDED_STOCK = Object.freeze({ bulk: 1, accuracy: -1, recoil: 1, st: 1.2, readies: 1 });

export function foldedBulk(bulk: number): number {
  return Math.min(0, bulk + FOLDED_STOCK.bulk);
}

export function foldedRecoil(recoil: number): number {
  return recoil > 1 ? recoil + FOLDED_STOCK.recoil : recoil;
}

/** A bipod: a prone shooter is braced and needs two-thirds the ST, rounded up; a Ready to open or close it. */
export const BIPOD = Object.freeze({ st: 2 / 3, readies: 1 });

/** What a gun's stored mode is set up for, by its name: "Folded Stock", "w/ Bipod", "w/o Bipod". */
export interface ModeSetup {
  folded: boolean;
  /** true "w/ Bipod", false "w/o Bipod", null where the name doesn't say. */
  bipod: boolean | null;
}

export function modeSetup(name: string): ModeSetup {
  const text = String(name ?? "");
  return {
    folded: /\bfolded stock\b/i.test(text),
    bipod: /\bw\/o bipod\b/i.test(text) ? false : /\bw\/ ?bipod\b/i.test(text) ? true : null,
  };
}

/**
 * Whether a stored mode is the one for the gun's state: a gun with a "Folded
 * Stock" mode uses it only while folded, and its other modes only while not;
 * a gun with "w/ Bipod" modes uses them only with the bipod deployed.
 */
export function modeMatches(setup: ModeSetup, gun: { foldPairs: boolean; bipodPairs: boolean }, state: { folded: boolean; bipod: boolean }): boolean {
  if (gun.foldPairs && setup.folded !== state.folded) return false;
  if (gun.bipodPairs && setup.bipod !== null && setup.bipod !== state.bipod) return false;
  return true;
}
