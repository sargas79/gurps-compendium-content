/**
 * High-Tech's projectiles (pp. 109, 166-175): the rules, with no Foundry in
 * them. A load's projectile takes the place of the solid bullet the gun's
 * statistics assume, and of the Basic Set's choice of round (Characters
 * pp. 276, 279) where one was made; it never stacks with it.
 *
 *   - **Projectile options (pp. 166-169).** Kinetic-energy projectiles:
 *     rifled slugs, hollow-points, poison, AP, APHC, frangible, APDS, APFSDS,
 *     baton, beanbag, SAPFSDS, underwater darts and the depleted-uranium
 *     rounds; and Minié balls (p. 109), which load a muzzle-loading rifle as
 *     fast as a musket. A shotgun fires the others from a rifled slug's
 *     figures.
 *   - **Exotic bullets (p. 168).** What the bullet is made of: silver (and
 *     other dense metals) as lead, lighter stuff at half or a tenth.
 *   - **Multiple-projectile loads (pp. 172-174).** The number of projectiles
 *     (NP) sets the damage (the NS multiple), the size of each sets the
 *     range and, for shot, the damage type; canister, shotshells, buck-and-
 *     ball, shrapnel, multi-ball, beehive, multi-flechette, rubber shot and
 *     annular blast fragmentation. Every gun counts Rcl 1 with them.
 *   - **Projectile upgrades (pp. 174-175).** Airburst, incendiary, self-
 *     destruct and tracer.
 *   - **Explosive-energy projectiles (pp. 169-170).** LE, SAPLE, APEX, HE,
 *     SAPHE, SAPHEC, APHEX, EFP, HEAT, HEDP, HESH, MS-HEAT and thermobaric.
 *     The book gives no formula for their explosions: the blast is the one
 *     the gun's record prints (decision D5, #335), and the projectile adds
 *     the rules around it (`explosive.ts`) and the solid shot's changes here.
 *   - **Cargo projectiles (pp. 171-172).** Illumination, smoke, tear gas,
 *     liquid, poison gas and white phosphorus: the round's own hit here, what
 *     its cargo does in `explosive.ts`.
 */

import { stepPiercing } from "../../../shared/loads/dice.js";
import { LIQUID_LC, type Liquid } from "./explosive.js";
import type { CalibreRow } from "./calibres.js";

// ── the catalogue ──

/** The kinetic-energy projectile options (pp. 109, 166-169). */
export const KINETIC_PROJECTILES = [
  "minie", "rifledSlug", "hollowPoint", "poison", "ap", "aphc", "frangible", "apds", "apfsds",
  "baton", "beanbag", "sapfsds", "underwaterDart", "apdu", "apdsdu", "apfsdsdu",
] as const;
/** The multiple-projectile loads (pp. 172-174). */
export const MULTIPLE_PROJECTILES = ["canister", "shotshell", "buckAndBall", "shrapnel", "duplex", "triplex", "beehive", "multiFlechette", "rubberShot", "abf"] as const;
/** The explosive-energy projectiles (pp. 169-170). */
export const EXPLOSIVE_PROJECTILES = ["le", "saple", "apex", "he", "saphe", "saphec", "aphex", "efp", "heat", "hedp", "hesh", "msheat", "thermobaric"] as const;
/** The ejecting- and bursting-cargo projectiles (pp. 171-172). */
export const CARGO_PROJECTILES = ["illumination", "smoke", "tearGas", "liquid", "poisonGas", "whitePhosphorus"] as const;
/** Every projectile a load may name; blank for the solid bullet the gun's statistics assume. */
export const PROJECTILES = ["", ...KINETIC_PROJECTILES, ...MULTIPLE_PROJECTILES, ...EXPLOSIVE_PROJECTILES, ...CARGO_PROJECTILES] as const;
export type Projectile = (typeof PROJECTILES)[number];

/** What an exotic bullet is made of (p. 168): lead or the like, silver, another dense metal, a light or a very light stuff. */
export const MATERIALS = ["", "silver", "dense", "light", "veryLight"] as const;
export type BulletMaterial = (typeof MATERIALS)[number];

/** The projectile upgrades (pp. 174-175). */
export const PROJECTILE_UPGRADES = ["airburst", "incendiary", "selfDestruct", "tracer"] as const;
export type ProjectileUpgrade = (typeof PROJECTILE_UPGRADES)[number];

export const isMultiple = (p: string): boolean => (MULTIPLE_PROJECTILES as readonly string[]).includes(p);
export const isKinetic = (p: string): boolean => (KINETIC_PROJECTILES as readonly string[]).includes(p);
export const isExplosiveProjectile = (p: string): p is ExplosiveProjectile => (EXPLOSIVE_PROJECTILES as readonly string[]).includes(p);
export const isCargo = (p: string): p is CargoProjectile => (CARGO_PROJECTILES as readonly string[]).includes(p);
export type ExplosiveProjectile = (typeof EXPLOSIVE_PROJECTILES)[number];
export type CargoProjectile = (typeof CARGO_PROJECTILES)[number];

interface ProjectileFigures {
  tl: number;
  /** CPS multiplied by. */
  cps: number;
  /** Its own Legality Class, null where the book gives none. */
  lc: number | null;
  /** Least and greatest calibre in millimetres, where the book sets one. */
  minMm?: number;
  maxMm?: number;
}

export const PROJECTILE_FIGURES: Readonly<Record<Exclude<Projectile, "">, ProjectileFigures>> = Object.freeze({
  minie: { tl: 5, cps: 1, lc: null },
  rifledSlug: { tl: 6, cps: 1, lc: null },
  hollowPoint: { tl: 5, cps: 1, lc: 3 },
  poison: { tl: 5, cps: 1, lc: 1 },
  ap: { tl: 6, cps: 1.5, lc: 2 },
  aphc: { tl: 6, cps: 2, lc: 2 },
  frangible: { tl: 6, cps: 1.5, lc: 3 },
  apds: { tl: 7, cps: 3, lc: 1 },
  // The smallest is .50 Browning (p. 167).
  apfsds: { tl: 7, cps: 4, lc: 1, minMm: 12.7 },
  baton: { tl: 7, cps: 2, lc: 3, minMm: 10 },
  beanbag: { tl: 7, cps: 3, lc: 3, minMm: 9 },
  sapfsds: { tl: 7, cps: 2, lc: 2, maxMm: 10 },
  underwaterDart: { tl: 7, cps: 2, lc: 2 },
  apdu: { tl: 8, cps: 3, lc: 1 },
  apdsdu: { tl: 8, cps: 4, lc: 1 },
  apfsdsdu: { tl: 8, cps: 5, lc: 1, minMm: 10 },
  canister: { tl: 4, cps: 1, lc: 3, minMm: 20 },
  shotshell: { tl: 4, cps: 1, lc: 3, minMm: 5 },
  buckAndBall: { tl: 5, cps: 1, lc: 3, minMm: 10 },
  shrapnel: { tl: 5, cps: 2, lc: 1 },
  duplex: { tl: 6, cps: 1.5, lc: 3 },
  triplex: { tl: 6, cps: 1.5, lc: 3 },
  beehive: { tl: 7, cps: 5, lc: 1 },
  multiFlechette: { tl: 7, cps: 4, lc: 3, minMm: 10 },
  rubberShot: { tl: 7, cps: 2, lc: 3, minMm: 10 },
  abf: { tl: 8, cps: 5, lc: 1 },
  // Explosive-energy projectiles (pp. 169-170).
  le: { tl: 4, cps: 2, lc: 1 },
  saple: { tl: 5, cps: 2, lc: 1 },
  apex: { tl: 6, cps: 3, lc: 1 },
  he: { tl: 6, cps: 2, lc: 1 },
  saphe: { tl: 6, cps: 2, lc: 1 },
  saphec: { tl: 6, cps: 2, lc: 1 },
  aphex: { tl: 7, cps: 4, lc: 1 },
  efp: { tl: 7, cps: 8, lc: 1, minMm: 50 },
  heat: { tl: 7, cps: 3, lc: 1, minMm: 20 },
  hedp: { tl: 7, cps: 4, lc: 1, minMm: 20 },
  hesh: { tl: 7, cps: 3, lc: 1, minMm: 50 },
  msheat: { tl: 8, cps: 8, lc: 1, minMm: 50 },
  thermobaric: { tl: 8, cps: 8, lc: 1, minMm: 20 },
  // Cargo projectiles (pp. 171-172). Poison gas's cost is its filler's, and a liquid round's LC its filler's.
  illumination: { tl: 5, cps: 5, lc: 4, minMm: 10 },
  smoke: { tl: 6, cps: 3, lc: 3, minMm: 10 },
  tearGas: { tl: 6, cps: 3, lc: 3, minMm: 10 },
  liquid: { tl: 7, cps: 1, lc: null },
  poisonGas: { tl: 6, cps: 1, lc: 0, minMm: 20 },
  whitePhosphorus: { tl: 6, cps: 2, lc: 1, minMm: 20 },
});

/** Shells that burst in the air already, and so carry airburst at no cost (p. 175). */
const BURSTING_SHELLS: readonly string[] = ["shrapnel", "beehive", "abf"];

export const UPGRADE_FIGURES: Readonly<Record<ProjectileUpgrade, { tl: number; cps: number }>> = Object.freeze({
  airburst: { tl: 5, cps: 1.5 },
  incendiary: { tl: 5, cps: 1.5 },
  selfDestruct: { tl: 6, cps: 1.5 },
  tracer: { tl: 6, cps: 1.5 },
});

/** Silver bullets cost 50 times as much (p. 168, from Characters p. 275). */
export const SILVER_CPS = 50;
/** Handloading jacketed silver bullets is at -3 to Armoury (p. 168). */
export const SILVER_ARMOURY = -3;

/** The shot sizes the book names (p. 173), for the sheet to offer: diameter in mm. */
export const SHOT_SIZES: ReadonlyArray<{ name: string; mm: number }> = [
  { name: "0000 Buck", mm: 9.5 },
  { name: "00 Buck", mm: 8.38 },
  { name: "0 Buck", mm: 8.13 },
  { name: "1 Buck", mm: 7.62 },
  { name: "4 Buck", mm: 6.1 },
  { name: "4 Bird", mm: 3.3 },
  { name: "6 Bird", mm: 2.79 },
  { name: "9 Bird", mm: 2.03 },
  { name: "10 Bird", mm: 1.78 },
  { name: "Dust", mm: 1.02 },
];

/** 00 Buck, which the book's shotguns fire unless it says otherwise (p. 173). */
export const DEFAULT_BUCKSHOT_MM = 8.38;

/**
 * The projectile size a load takes where it names none: 00 Buck for shot and
 * the buck of buck-and-ball, flechettes of 2mm (p. 174: "around 2-3mm"),
 * canister's usual 12.7mm balls (p. 172).
 */
const DEFAULT_SIZE: Readonly<Partial<Record<Projectile, number>>> = {
  shotshell: DEFAULT_BUCKSHOT_MM,
  buckAndBall: DEFAULT_BUCKSHOT_MM,
  rubberShot: DEFAULT_BUCKSHOT_MM,
  multiFlechette: 2,
  canister: 12.7,
};

/** A load's projectile, as the rules read it. */
export interface ProjectileLoad {
  projectile: Projectile;
  /** Diameter of each of a multiple load's projectiles in mm; 0 for the default. */
  shotMm: number;
  /** Projectiles in a multiple load (NP); 0 for the most the bore takes. */
  shotCount: number;
  material: BulletMaterial;
  projectileUpgrades: ProjectileUpgrade[];
  /** A dose of poison's cost, added to CPS (p. 167). */
  poisonCost: number;
  /**
   * A cargo round's own dice where the gun's description prints them (the
   * 40mm smoke round's 1d+1, p. 143), for a mode whose row is the blast of
   * another round; blank for the mode's own dice.
   */
  hitDamage?: string;
  /** What a liquid round carries, which sets its LC (p. 172). */
  liquid?: string;
}

/** What the projectile rules need to know of a gun's mode. */
export interface ProjectileGun {
  calibre: CalibreRow | null;
  /** The bore in millimetres, null where neither the table nor the gun's name gives it. */
  boreMm: number | null;
  tl: number;
  automatic: boolean;
  /** A smoothbore firing shot, whose statistics are for 00 Buck. */
  shotgun: boolean;
  /** A muzzle-loading rifle, for Minié balls. */
  muzzleLoadingRifle: boolean;
  /** A gun built to fire underwater, or one whose round is an underwater dart. */
  underwater: boolean;
  /** The mode fires an explosive round (shrapnel, beehive and ABF shells, airburst, self-destruct). */
  explosive: boolean;
  /**
   * The mode's own line is the blast (a grenade launcher's, a rocket's, a
   * mortar's), rather than a solid shot with the blast linked to it.
   */
  burstPrimary?: boolean;
  /** A lower-velocity round than a cannon's: a grenade launcher's, a shotgun's, a mortar's (p. 171). */
  lowVelocity?: boolean;
  /** A low-powered smoothbore: a grenade launcher or an air gun, which alone fire liquid rounds (p. 172). */
  lowPowered?: boolean;
  /** The projectiles the mode's RoF lists (9 for "3x9"). */
  projectiles: number;
}

export type ProjectileRefusal = "tl" | "calibreSmall" | "calibreLarge" | "shotgunOnly" | "notPistol" | "muzzleRifle" | "underwater" | "shell" | "lowPowered" | "record" | "liquid";

/** Why a gun can't fire a projectile; null where it can. */
export function projectileRefusal(projectile: Projectile, gun: ProjectileGun): ProjectileRefusal | null {
  if (!projectile) return null;
  const figures = PROJECTILE_FIGURES[projectile];
  // Multi-ball rounds are for revolvers and bolt-actions at TL6, automatic weapons at TL7 (p. 173).
  const tl = (projectile === "duplex" || projectile === "triplex") && gun.automatic ? 7 : figures.tl;
  if (gun.tl < tl) return "tl";
  // A gun whose bore nothing gives is taken at its word.
  if (gun.boreMm !== null && figures.minMm !== undefined && gun.boreMm < figures.minMm) return "calibreSmall";
  if (gun.boreMm !== null && figures.maxMm !== undefined && gun.boreMm > figures.maxMm) return "calibreLarge";
  switch (projectile) {
    case "rifledSlug":
      return gun.shotgun ? null : "shotgunOnly";
    case "minie":
      return gun.muzzleLoadingRifle ? null : "muzzleRifle";
    // In rifle and MG chamberings, not pistol calibres (p. 167).
    case "apds":
      return gun.calibre?.class === "handgun" ? "notPistol" : null;
    case "underwaterDart":
      return gun.underwater ? null : "underwater";
    // Shells with a bursting charge: the weapon's own round describes them (pp. 173-174).
    case "shrapnel":
    case "beehive":
    case "abf":
      return gun.explosive ? null : "shell";
    // For low-powered, large-bore weapons: shotguns and grenade launchers (p. 174).
    case "multiFlechette":
      return gun.shotgun || gun.calibre?.class === "grenadeLauncher" ? null : "lowPowered";
    // Only low-powered smoothbores fire liquid rounds; a gun's would burst them (p. 172).
    case "liquid":
      return gun.lowPowered ? null : "liquid";
    default:
      // No formula gives an explosion's damage (p. 169): an explosive round, or a bursting
      // cargo round, is fired from a mode whose record prints its blast.
      if ((isExplosiveProjectile(projectile) || projectile === "poisonGas" || projectile === "whitePhosphorus") && !gun.explosive) return "record";
      return null;
  }
}

export type ProjectileUpgradeRefusal = "tl" | "explosiveOnly" | "solidOnly" | "handgun";

/** Why a load can't take a projectile upgrade; null where it can. */
export function projectileUpgradeRefusal(upgrade: ProjectileUpgrade, projectile: Projectile, gun: ProjectileGun): ProjectileUpgradeRefusal | null {
  if (gun.tl < UPGRADE_FIGURES[upgrade].tl) return "tl";
  switch (upgrade) {
    case "airburst":
      return gun.explosive || BURSTING_SHELLS.includes(projectile) ? null : "explosiveOnly";
    case "selfDestruct":
      return gun.explosive ? null : "explosiveOnly";
    case "incendiary":
      // A solid bullet; full-calibre AP and APHC from late TL6 (p. 175). Not normally for handguns.
      if (!["", "minie", "ap", "aphc"].includes(projectile)) return "solidOnly";
      if ((projectile === "ap" || projectile === "aphc") && gun.tl < 6) return "tl";
      return gun.calibre?.class === "handgun" ? "handgun" : null;
    default:
      return null;
  }
}

// ── number of projectiles (pp. 172-173) ──

/** The NS table (p. 172): NP and the damage multiple for it. */
const NS_TABLE: ReadonlyArray<readonly [number, number]> = [
  [4, 0.5], [7, 0.38], [9, 0.33], [12, 0.29], [16, 0.25], [20, 0.22], [25, 0.2], [50, 0.14], [75, 0.12], [100, 0.1],
  [150, 0.082], [200, 0.071], [300, 0.058], [500, 0.045], [700, 0.038], [1000, 0.032], [1500, 0.026], [2000, 0.022], [3000, 0.018], [5000, 0.014],
];

/**
 * The damage multiple for a number of projectiles (p. 172): the table's, NP
 * between two rows taking the higher; outside the table 1/(square root of NP).
 */
export function nsFor(np: number): number {
  const n = Math.max(1, Math.floor(Number(np) || 1));
  if (n === 1) return 1;
  if (n < 4 || n > 5000) return Math.round((1 / Math.sqrt(n)) * 1000) / 1000;
  return NS_TABLE.find(([at]) => n <= at)![1];
}

/** The most projectiles of a size a bore holds (p. 172): (calibre/diameter) cubed, a fortieth of it for flechettes. */
export function maxProjectiles(boreMm: number, diameterMm: number, flechettes = false): number {
  if (!(boreMm > 0) || !(diameterMm > 0)) return 0;
  const most = (boreMm / diameterMm) ** 3 / (flechettes ? 40 : 1);
  return Math.max(1, Math.floor(most + 1e-9));
}

/** Shot by size (p. 173): buckshot from about 8mm, birdshot from 2mm, smallshot below. */
export function shotKind(diameterMm: number): "buckshot" | "birdshot" | "smallshot" {
  if (diameterMm >= 8) return "buckshot";
  return diameterMm >= 2 ? "birdshot" : "smallshot";
}

/** A bullet's damage type by its actual diameter (pp. 162-163), for canister's balls: pi+ under 15mm, pi++ from it. */
const canisterType = (diameterMm: number): string => (diameterMm >= 15 ? "pi++" : "pi+");

/** A multiple load's projectile size and count, filled in where the load leaves them. */
export function multipleLoad(load: Pick<ProjectileLoad, "projectile" | "shotMm" | "shotCount">, gun: ProjectileGun): { mm: number; count: number } {
  const mm = load.shotMm > 0 ? load.shotMm : (DEFAULT_SIZE[load.projectile] ?? DEFAULT_BUCKSHOT_MM);
  if (load.shotCount > 0) return { mm, count: Math.floor(load.shotCount) };
  // Buck-and-ball has two or three buckshot pellets beside the ball (p. 173).
  if (load.projectile === "buckAndBall") return { mm, count: 3 };
  // A shotgun's own buckshot: the count its RoF lists.
  if (load.projectile === "shotshell" && gun.shotgun && mm === DEFAULT_BUCKSHOT_MM && gun.projectiles > 1) return { mm, count: gun.projectiles };
  const most = gun.boreMm ? maxProjectiles(gun.boreMm, mm, load.projectile === "multiFlechette") : 0;
  return { mm, count: Math.max(2, most || gun.projectiles) };
}

// ── what a projectile does to a row ──

/** The row's figures a projectile changes. */
export interface ProjectileRow {
  damage: string;
  damageType: string;
  armorDivisor: number;
  halfDamageRange: number;
  maxRange: number;
  accuracy: number;
  malfunction: number | null;
  projectiles: number;
  recoil: number;
}

export type ProjectileNote =
  | "slug" | "hpExpansion" | "noDr" | "poison" | "depletedUranium" | "underwaterDart" | "minie"
  | "ballRange" | "shell" | "beehive" | "silver" | "airburst" | "airburstFuse" | "selfDestruct" | "tracer" | "replacesBasic"
  | "cargoHit";

export interface ProjectileEffect {
  /** The row, its damage still to be multiplied by `damageFactor` (with the ammunition upgrades' own). */
  row: ProjectileRow;
  damageFactor: number;
  /**
   * A first hit with its own line (buck-and-ball's ball): its dice, to be
   * multiplied by its own `factor` and by `damageFactor`.
   */
  firstHit: { damage: string; factor: number; damageType: string; armorDivisor: number } | null;
  noOverpenetration: boolean;
  doubleKnockback: boolean;
  incendiary: boolean;
  scatterSquared: boolean;
  /** Distances underwater multiplied by this, not by 1,000 (p. 169); 0 for the gun's own. */
  underwaterFactor: number;
  notes: Array<{ key: ProjectileNote; data?: Record<string, unknown> }>;
}

/** A damage type moved down a step where the calibre is below a size: AP and its kin (pp. 167, 169). */
const smallerThan = (gun: ProjectileGun, mm: number): boolean => gun.boreMm === null || gun.boreMm < mm;

/** The bore of a 20-gauge shotgun (p. 162): a rifled slug from one this size or larger does pi++ (p. 166). */
const TWENTY_GAUGE_MM = 15.6;

/** Figures multiplied and rounded to the yard. */
const times = (n: number, factor: number): number => Math.round((Number(n) || 0) * factor);

/**
 * The row a load's projectile fires (pp. 166-175), from the gun's own row
 * for a solid bullet. The dice come back unmultiplied, with the factor that
 * multiplies them, so that the ammunition upgrades' factors multiply in
 * before the book's Adjusting Damage rounds them once (p. 166).
 */
export function projectileRow(row: ProjectileRow, load: ProjectileLoad, gun: ProjectileGun): ProjectileEffect {
  const out: ProjectileEffect = {
    row: { ...row },
    damageFactor: 1,
    firstHit: null,
    noOverpenetration: false,
    doubleKnockback: false,
    incendiary: false,
    scatterSquared: false,
    underwaterFactor: 0,
    notes: [],
  };
  const r = out.row;
  const p = load.projectile;
  const multiple = isMultiple(p);

  // A shotgun fires the other projectiles from a rifled slug's figures (pp. 166, 168): four
  // times the buckshot's damage, pi++ from 20-gauge up and pi+ below, +1 Acc, 1/2D x2.5 and
  // Max x1.5, and no multiplier after RoF.
  const slug = (): void => {
    out.damageFactor *= 4;
    r.damageType = gun.boreMm !== null && gun.boreMm < TWENTY_GAUGE_MM ? "pi+" : "pi++";
    r.accuracy += 1;
    r.halfDamageRange = times(r.halfDamageRange, 2.5);
    r.maxRange = times(r.maxRange, 1.5);
    r.projectiles = 1;
  };
  if (gun.shotgun && p && !multiple && p !== "minie" && !isExplosiveProjectile(p) && p !== "poisonGas" && p !== "whitePhosphorus") {
    slug();
    out.notes.push({ key: "slug" });
  }

  // Hollow-point's expansion: a step up the piercing ladder at (0.5); objects without DR get DR 1.
  const expands = (): void => {
    r.armorDivisor *= 0.5;
    r.damageType = stepPiercing(r.damageType, 1);
    out.notes.push({ key: "noDr" });
  };
  switch (p) {
    case "hollowPoint":
    case "poison":
      expands();
      // TL5-7 hollow-points in self-loaders: -1 Malf. (p. 167).
      if (gun.automatic && gun.tl <= 7 && r.malfunction !== null) r.malfunction -= 1;
      // Low-velocity rounds (handguns, SMGs) may fail to expand, at the GM's option.
      if (gun.calibre?.class === "handgun") out.notes.push({ key: "hpExpansion", data: { roll: Math.max(0, gun.tl - 3) } });
      if (p === "poison") out.notes.push({ key: "poison" });
      break;
    case "ap":
      r.armorDivisor *= 2;
      out.damageFactor *= 0.7;
      if (smallerThan(gun, 20)) r.damageType = stepPiercing(r.damageType, -1);
      break;
    case "aphc":
      r.armorDivisor *= 2;
      if (smallerThan(gun, 20)) r.damageType = stepPiercing(r.damageType, -1);
      break;
    case "frangible":
      expands();
      out.noOverpenetration = true;
      r.halfDamageRange = times(r.halfDamageRange, 0.9);
      r.maxRange = times(r.maxRange, 0.9);
      break;
    case "apds":
    case "apdsdu":
      r.armorDivisor *= 2;
      out.damageFactor *= p === "apds" ? 1.3 : 1.5;
      if (smallerThan(gun, 30)) r.damageType = stepPiercing(r.damageType, -1);
      r.halfDamageRange = times(r.halfDamageRange, 1.5);
      r.maxRange = times(r.maxRange, 1.5);
      break;
    case "apfsds":
      r.armorDivisor *= 2;
      out.damageFactor *= 1.5;
      // Below 40mm pi++ becomes pi, and pi+ or pi becomes pi- (p. 167).
      if (smallerThan(gun, 40)) r.damageType = r.damageType === "pi++" ? "pi" : stepPiercing(r.damageType, -3);
      r.halfDamageRange = times(r.halfDamageRange, 2);
      r.maxRange = times(r.maxRange, 2);
      break;
    case "apfsdsdu":
      r.armorDivisor *= 2;
      out.damageFactor *= 1.7;
      // Below 40mm pi++ becomes pi+ and pi+ becomes pi; pi and pi- stay (p. 169).
      if (smallerThan(gun, 40) && (r.damageType === "pi++" || r.damageType === "pi+")) r.damageType = stepPiercing(r.damageType, -1);
      r.halfDamageRange = times(r.halfDamageRange, 2);
      r.maxRange = times(r.maxRange, 2);
      break;
    case "apdu":
      r.armorDivisor *= 2;
      out.damageFactor *= 1.2;
      if (smallerThan(gun, 20)) r.damageType = stepPiercing(r.damageType, -1);
      break;
    case "baton":
      r.armorDivisor *= 0.5;
      out.damageFactor *= 0.2;
      r.damageType = "cr";
      out.doubleKnockback = gun.boreMm !== null && gun.boreMm > 35;
      r.accuracy = Math.max(0, r.accuracy - 1);
      r.halfDamageRange = times(r.halfDamageRange, 1 / 5);
      r.maxRange = times(r.maxRange, 1 / 5);
      break;
    case "beanbag":
      r.armorDivisor *= 0.2;
      out.damageFactor *= 0.2;
      r.damageType = "cr";
      out.doubleKnockback = gun.boreMm !== null && gun.boreMm >= 15;
      r.accuracy = 0;
      r.halfDamageRange = times(r.halfDamageRange, 1 / 8);
      r.maxRange = times(r.maxRange, 1 / 8);
      break;
    case "sapfsds":
      r.armorDivisor *= 2;
      r.damageType = "pi-";
      r.halfDamageRange = times(r.halfDamageRange, 1.5);
      r.maxRange = times(r.maxRange, 1.5);
      break;
    case "underwaterDart":
      r.damageType = "imp";
      out.underwaterFactor = 25;
      out.notes.push({ key: "underwaterDart" });
      break;
    case "minie":
      out.notes.push({ key: "minie" });
      break;
    default:
      if (isExplosiveProjectile(p)) explosiveShot(out, p, gun);
      else if (isCargo(p)) cargoHit(out, load, gun);
      break;
  }
  if (p === "apdu" || p === "apdsdu" || p === "apfsdsdu") out.notes.push({ key: "depletedUranium" });

  if (multiple) multipleRow(out, load, gun);

  // What the bullet is made of (p. 168).
  switch (load.material) {
    case "light":
      out.damageFactor *= 0.5;
      r.halfDamageRange = times(r.halfDamageRange, 0.5);
      r.maxRange = times(r.maxRange, 0.5);
      break;
    case "veryLight":
      out.damageFactor *= 0.1;
      r.halfDamageRange = times(r.halfDamageRange, 0.1);
      r.maxRange = times(r.maxRange, 0.1);
      break;
    case "silver":
      // Soft silver fouls a rifled barrel: -1 Acc and Malf. at the GM's discretion; a jacketed hollow-point doesn't.
      if (!gun.shotgun && p !== "hollowPoint" && p !== "poison") {
        r.accuracy = Math.max(0, r.accuracy - 1);
        if (r.malfunction !== null) r.malfunction -= 1;
        out.notes.push({ key: "silver" });
      }
      break;
    default:
      break;
  }

  // Projectile upgrades (pp. 174-175).
  const upgrades = load.projectileUpgrades;
  if (upgrades.includes("airburst") || BURSTING_SHELLS.includes(p)) {
    // Attacking an Area (p. B414): a TL5-6 time fuse gives +3 (+1 at a flier), a TL7+ proximity fuse +4; a miss scatters by the margin squared.
    out.scatterSquared = true;
    out.notes.push(gun.tl <= 6 ? { key: "airburstFuse" } : { key: "airburst" });
  }
  if (upgrades.includes("incendiary")) out.incendiary = true;
  if (upgrades.includes("tracer")) {
    // A tracer is incendiary out to 1/2D, where it burns out (p. 175).
    out.incendiary = true;
    out.notes.push({ key: "tracer", data: { range: r.halfDamageRange || r.maxRange } });
  }
  if (upgrades.includes("selfDestruct")) out.notes.push({ key: "selfDestruct", data: { range: r.halfDamageRange || r.maxRange } });
  return out;
}

/**
 * What an explosive round does to the shot itself (pp. 169-170), against the
 * solid shot's figures: its armour divisor, and AP's damage and type for APEX
 * and APHEX. Where the mode's own line is the blast, that line is the round's
 * already, and only a shaped charge's (10) is set on it. The blast is the
 * record's (`explosive.ts`).
 */
function explosiveShot(out: ProjectileEffect, p: ExplosiveProjectile, gun: ProjectileGun): void {
  const r = out.row;
  const figures = EXPLOSIVE_SHOT[p];
  if (gun.burstPrimary) {
    if (figures.jet) r.armorDivisor = 10;
    return;
  }
  r.armorDivisor = figures.divisor;
  if (figures.factor !== 1) out.damageFactor *= figures.factor;
  if (figures.type) r.damageType = figures.type;
  if (figures.stepDownBelow && smallerThan(gun, figures.stepDownBelow)) r.damageType = stepPiercing(r.damageType, -1);
}

/**
 * The shot an explosive round fires beside its blast, against the solid
 * shot's (pp. 169-170): the armour divisor, a damage multiple, a damage type,
 * a step down the piercing ladder below a calibre, and whether the round is a
 * shaped charge whose jet has (10).
 */
const EXPLOSIVE_SHOT: Readonly<Record<ExplosiveProjectile, { divisor: number; factor: number; type?: string; stepDownBelow?: number; jet?: boolean }>> = Object.freeze({
  le: { divisor: 0.5, factor: 1 },
  saple: { divisor: 1, factor: 1 },
  // APEX is AP with a small bursting charge; APHEX, APHC with one (pp. 167, 169-170).
  apex: { divisor: 2, factor: 0.7, stepDownBelow: 20 },
  he: { divisor: 0.5, factor: 1 },
  saphe: { divisor: 1, factor: 1 },
  saphec: { divisor: 1, factor: 1 },
  aphex: { divisor: 2, factor: 1, stepDownBelow: 20 },
  efp: { divisor: 2, factor: 1, type: "pi++" },
  heat: { divisor: 10, factor: 1, jet: true },
  hedp: { divisor: 10, factor: 1, jet: true },
  hesh: { divisor: 0.5, factor: 1 },
  msheat: { divisor: 10, factor: 1, jet: true },
  thermobaric: { divisor: 0.5, factor: 1 },
});

/**
 * A cargo round's own hit (pp. 171-172), against the solid shot's figures or
 * the dice the gun's description prints for it. Smoke and tear gas get (0.5),
 * and from a lower-velocity gun (a grenade launcher, a shotgun) crush, with
 * double knockback over 35mm; a liquid round (0.2), half damage, crushing,
 * Range /4; poison gas and white phosphorus (0.5) on the shot that carries
 * their burst. Illumination leaves the hit as it is.
 */
function cargoHit(out: ProjectileEffect, load: ProjectileLoad, gun: ProjectileGun): void {
  const r = out.row;
  const p = load.projectile as CargoProjectile;
  const hit = String(load.hitDamage ?? "").trim();
  // Poison gas and white phosphorus burst: their blast is the record's, and so is its line.
  const bursting = p === "poisonGas" || p === "whitePhosphorus";
  if (hit && !bursting) r.damage = hit;
  else if (gun.burstPrimary && !bursting) out.notes.push({ key: "cargoHit" });
  switch (p) {
    case "smoke":
    case "tearGas":
      r.armorDivisor = 0.5;
      if (gun.lowVelocity) {
        r.damageType = "cr";
        out.doubleKnockback = gun.boreMm !== null && gun.boreMm > 35;
      }
      break;
    case "liquid":
      r.armorDivisor = 0.2;
      out.damageFactor *= 0.5;
      r.damageType = "cr";
      r.halfDamageRange = times(r.halfDamageRange, 1 / 4);
      r.maxRange = times(r.maxRange, 1 / 4);
      break;
    case "poisonGas":
    case "whitePhosphorus":
      if (!gun.burstPrimary) r.armorDivisor = 0.5;
      break;
    default:
      break;
  }
}

/** A multiple-projectile load's row (pp. 172-174). Every one counts Rcl 1. */
function multipleRow(out: ProjectileEffect, load: ProjectileLoad, gun: ProjectileGun): void {
  const r = out.row;
  const p = load.projectile;
  const { mm, count } = multipleLoad(load, gun);
  // "Multiply damage by NS" is for a full-bore bullet's damage. A shotgun's is its
  // buckshot's, the NS of the count its RoF lists taken back out of it.
  const fromFullBore = (np: number): number => nsFor(np) / (gun.shotgun && gun.projectiles > 1 ? nsFor(gun.projectiles) : 1);
  const ranges = (half: number, max: number): void => {
    r.halfDamageRange = Math.round(mm * half);
    r.maxRange = Math.round(mm * max);
  };
  switch (p) {
    case "shotshell": {
      out.damageFactor *= fromFullBore(count);
      const kind = shotKind(mm);
      r.damageType = kind === "buckshot" ? "pi" : "pi-";
      r.armorDivisor = kind === "buckshot" ? 1 : kind === "birdshot" ? 0.5 : 0.2;
      if (kind !== "buckshot") out.notes.push({ key: "noDr" });
      // A shotgun's own 00 Buck keeps the ranges its row lists, which the book rounded from these.
      if (!(gun.shotgun && mm === DEFAULT_BUCKSHOT_MM && count === gun.projectiles)) ranges(5, 100);
      r.projectiles = count;
      break;
    }
    case "canister":
      out.damageFactor *= fromFullBore(count);
      r.damageType = canisterType(mm);
      ranges(5, 50);
      r.projectiles = count;
      break;
    case "multiFlechette":
      out.damageFactor *= fromFullBore(count);
      r.damageType = "pi-";
      ranges(50, 600);
      r.projectiles = count;
      break;
    case "rubberShot":
      out.damageFactor *= fromFullBore(count);
      r.damageType = "cr";
      r.armorDivisor *= 0.2;
      ranges(2, 10);
      r.projectiles = count;
      break;
    case "buckAndBall": {
      // The ball does the gun's damage (a shotgun's slug's), and hits first; the buck do 1d+1 pi
      // each, with their own range; the ball's is x0.9 (p. 173).
      const ball = { damage: r.damage, factor: 1, damageType: r.damageType, armorDivisor: r.armorDivisor, half: r.halfDamageRange, max: r.maxRange };
      if (gun.shotgun) {
        ball.factor = 4;
        ball.damageType = gun.boreMm !== null && gun.boreMm < TWENTY_GAUGE_MM ? "pi+" : "pi++";
        ball.half = times(ball.half, 2.5);
        ball.max = times(ball.max, 1.5);
      }
      out.firstHit = { damage: ball.damage, factor: ball.factor, damageType: ball.damageType, armorDivisor: ball.armorDivisor };
      out.notes.push({ key: "ballRange", data: { half: times(ball.half, 0.9), max: times(ball.max, 0.9) } });
      r.damage = "1d+1";
      r.damageType = "pi";
      r.armorDivisor = 1;
      ranges(5, 100);
      r.projectiles = 1 + count;
      break;
    }
    case "duplex":
    case "triplex": {
      const n = p === "duplex" ? 2 : 3;
      out.damageFactor *= p === "duplex" ? 0.85 : 0.7;
      r.halfDamageRange = times(r.halfDamageRange, 1 / n);
      r.maxRange = times(r.maxRange, 1 / n);
      r.projectiles = n;
      break;
    }
    case "shrapnel":
    case "abf":
      out.notes.push({ key: "shell" });
      break;
    case "beehive":
      // It bursts at its Max, and has no 1/2D (p. 173).
      r.halfDamageRange = 0;
      out.notes.push({ key: "beehive" });
      break;
    default:
      break;
  }
  if (r.projectiles > 1) r.recoil = 1;
}

// ── cost and legality (pp. 166-175) ──

/**
 * What a load's projectile, material and projectile upgrades do to the cost
 * per shot: a multiple, a cost added (a dose of poison), and the Legality
 * Class the strictest of them sets.
 */
export function projectileMultiples(load: ProjectileLoad): { cps: number; add: number; lc: number | null } {
  let cps = 1;
  let lc: number | null = null;
  const stricter = (own: number | null) => {
    if (own !== null) lc = lc === null ? own : Math.min(lc, own);
  };
  if (load.projectile) {
    cps *= PROJECTILE_FIGURES[load.projectile].cps;
    stricter(PROJECTILE_FIGURES[load.projectile].lc);
    // A liquid round's LC is its filler's (p. 172).
    if (load.projectile === "liquid") stricter(LIQUID_LC[load.liquid as Liquid] ?? null);
  }
  if (load.material === "silver") cps *= SILVER_CPS;
  for (const upgrade of load.projectileUpgrades) {
    if (upgrade === "airburst" && BURSTING_SHELLS.includes(load.projectile)) continue;
    cps *= UPGRADE_FIGURES[upgrade].cps;
  }
  return { cps, add: load.projectile === "poison" ? Math.max(0, Number(load.poisonCost) || 0) : 0, lc };
}

/** The Basic Set rounds and High-Tech projectiles match-grade may be made with: solid, hollow-point, AP, APHC (p. 165). */
export const MATCH_PROJECTILES: readonly string[] = ["", "hp", "hollowPoint", "ap", "aphc"];
