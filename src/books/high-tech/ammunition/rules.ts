/**
 * High-Tech's ammunition (pp. 161-165, 174-178): the rules, with no Foundry
 * in them.
 *
 *   - **Ammunition classes and upgrades (pp. 163-165).** A gun's class of
 *     ammunition comes from its calibre's row of the Ammunition Tables:
 *     powder and shot, cased, caseless, consumable cased. The upgrades a load
 *     may carry -- field-expedient shot, paper cartridges, light cases,
 *     extra-powerful, match-grade, subsonic and silent -- each say which
 *     classes and TLs take them, what they do to the row (Adjusting Damage,
 *     p. 166, for the dice) and what they multiply the cost and weight per
 *     shot by. Upgrades combine by multiplying.
 *   - **Cost and weight per shot (pp. 175-177).** The table's CPS and WPS,
 *     times the upgrades; 5% off for 500 rounds bought at once, 15% for
 *     5,000; 5% off found with an Area Knowledge roll, 15% on a critical.
 *   - **Cartridge conversions (p. 164).** Which cartridges a caplock's bore
 *     takes.
 *   - **Handloading and reloading (p. 174).** The tools and their pace; a
 *     perfectly matched load; materials at the round's CPS, or half for
 *     reloads.
 *   - **Misloading (p. 178).** The chains of interchangeable calibres and the
 *     Misloading Table.
 */

import { parseDice } from "../../../shared/loads/dice.js";
import type { CalibreRow } from "./calibres.js";
import { MATCH_PROJECTILES } from "./projectiles.js";

// ── classes of ammunition (pp. 163-165) ──

/**
 * A round's class: powder and shot loaded separately (multi-part), a round in
 * a case, one with none, one whose case burns away, an air gun's pellet, a
 * mortar bomb. A gun made for one class fires no other (p. 163).
 */
export type AmmunitionClass = "powderAndShot" | "cased" | "caseless" | "consumable" | "airGun" | "shell";

export function ammunitionClass(row: CalibreRow | null): AmmunitionClass | null {
  if (!row) return null;
  if (row.notes.includes("powderAndShot")) return "powderAndShot";
  if (row.notes.includes("airGun")) return "airGun";
  if (row.notes.includes("caseless")) return "caseless";
  if (row.notes.includes("consumableCased") || row.notes.includes("semiConsumableCased")) return "consumable";
  if (row.notes.includes("mortarShell")) return "shell";
  return "cased";
}

/** Fixed ammunition: propellant, primer and projectile as one (p. 164). */
const FIXED: readonly AmmunitionClass[] = ["cased", "caseless", "consumable"];

// ── the upgrades (pp. 163-165) ──

export const AMMUNITION_UPGRADES = ["fieldExpedient", "paperCartridge", "lightCased", "extraPowerful", "matchGrade", "subsonic", "silent"] as const;
export type AmmunitionUpgrade = (typeof AMMUNITION_UPGRADES)[number];

interface UpgradeFigures {
  /** The TL it appears at. */
  tl: number;
  /** Cost and weight per shot multiplied by. */
  cps: number;
  wps: number;
  /** Its own Legality Class, where it has one. */
  lc: number | null;
  /** The classes of ammunition it can be had for; null for any the gun fires. */
  classes: readonly AmmunitionClass[] | null;
  /** Upgrades it can't be combined with. */
  excludes: readonly AmmunitionUpgrade[];
}

export const UPGRADES: Readonly<Record<AmmunitionUpgrade, UpgradeFigures>> = Object.freeze({
  // Stones or coins down a muzzle-loader's barrel (p. 163).
  fieldExpedient: { tl: 3, cps: 1, wps: 1, lc: null, classes: ["powderAndShot"], excludes: ["paperCartridge"] },
  // Charge and ball wrapped in paper, from the late 16th century (p. 163): half the loading time.
  paperCartridge: { tl: 4, cps: 1, wps: 1, lc: null, classes: ["powderAndShot"], excludes: ["fieldExpedient"] },
  // Composite or plastic cases (p. 164): WPS x0.7, CPS x2.
  lightCased: { tl: 5, cps: 2, wps: 0.7, lc: null, classes: ["cased"], excludes: [] },
  // A hotter charge (p. 165): Dmg, Range and ST x1.1; CPS x1.5.
  extraPowerful: { tl: 4, cps: 1.5, wps: 1, lc: null, classes: ["powderAndShot", ...FIXED], excludes: ["matchGrade"] },
  // Projectile and propellant matched (p. 165): Acc x1.25, at most +1; CPS x2.
  matchGrade: { tl: 6, cps: 2, wps: 1, lc: null, classes: FIXED, excludes: ["extraPowerful"] },
  // Below the speed of sound (p. 165): CPS x1.3.
  subsonic: { tl: 6, cps: 1.3, wps: 1, lc: null, classes: FIXED, excludes: [] },
  // Gases trapped in the case (p. 165): the 16-yard line to hear; CPS x10, LC1.
  silent: { tl: 7, cps: 10, wps: 1, lc: 1, classes: ["cased"], excludes: [] },
});

/**
 * Rounds already below the speed of sound, which subsonic ammunition gains
 * nothing on (p. 165): the .32 ACP, .380 ACP, 9x18mm Makarov and .45 ACP,
 * and the 9x39mm.
 */
const ALREADY_SUBSONIC = [/^\.32 ACP/, /^\.380 ACP/, /^9×18mm Makarov/, /^\.45 ACP/, /^9×39mm/];

/** The rounds of the handgun table that are PDW rounds, which subsonic ammunition treats as rifle rounds (p. 165). */
const PDW_ROUNDS = [/^4\.6×30mm/, /^5\.7×28mm/];

/** How subsonic ammunition treats a round: a pistol's, a PDW's or rifle's, or neither. */
export function subsonicKind(row: CalibreRow | null, skill: string): "pistol" | "rifle" | null {
  if (row) {
    if (row.class === "rifle" || PDW_ROUNDS.some((re) => re.test(row.name))) return "rifle";
    return row.class === "handgun" ? "pistol" : null;
  }
  if (/\((?:pistol|smg)\)/i.test(skill)) return "pistol";
  return /\((?:rifle|musket)\)/i.test(skill) ? "rifle" : null;
}

/** What the upgrades need to know of a gun. */
export interface GunFacts {
  /** The calibre's row, null where the table has none. */
  calibre: CalibreRow | null;
  tl: number;
  /** A self-loader: match-grade isn't for them (p. 165). */
  automatic: boolean;
  /** A cheap gun, which suffers an extra-powerful charge at TL7-8 too (p. 165). */
  cheap: boolean;
  /** The mode's weapon skill. */
  skill: string;
  /** The Basic Set round loaded in the mode: "", "hp", "aphc", "apds", ... */
  ammunition: string;
  /** High-Tech's projectile in the load, which takes the Basic Set round's place (pp. 166-174); blank for none. */
  projectile?: string;
}

export type UpgradeRefusal = "tl" | "class" | "excludes" | "automatic" | "alreadySubsonic" | "notPistolOrRifle" | "alreadyLight" | "projectile";


/** The TL light cases reach a round at (p. 164): shotshells late TL5, grenade rounds TL6, other cartridges mid-TL8. */
function lightCasedTl(row: CalibreRow | null): number {
  if (row?.class === "shotgun") return 5;
  if (row?.class === "grenadeLauncher") return 6;
  return 8;
}

/** Why a load can't take an upgrade, beside the others it has; null where it can. */
export function upgradeRefusal(upgrade: AmmunitionUpgrade, gun: GunFacts, others: readonly AmmunitionUpgrade[] = []): UpgradeRefusal | null {
  const figures = UPGRADES[upgrade];
  const tl = upgrade === "lightCased" ? lightCasedTl(gun.calibre) : figures.tl;
  if (gun.tl < tl) return "tl";
  const cls = ammunitionClass(gun.calibre);
  // A gun whose round the table doesn't list is taken at its word, except for what needs powder and shot.
  if (figures.classes && (cls ? !figures.classes.includes(cls) : figures.classes.every((c) => c === "powderAndShot"))) return "class";
  if (others.some((o) => o !== upgrade && figures.excludes.includes(o))) return "excludes";
  switch (upgrade) {
    case "lightCased":
      if (gun.calibre?.notes.includes("lightCased")) return "alreadyLight";
      break;
    case "matchGrade":
      if (gun.automatic) return "automatic";
      // The load's own projectile where it has one, else the Basic Set round.
      if (!MATCH_PROJECTILES.includes(gun.projectile || gun.ammunition)) return "projectile";
      break;
    case "subsonic":
      if (gun.calibre && ALREADY_SUBSONIC.some((re) => re.test(gun.calibre!.name))) return "alreadySubsonic";
      if (!subsonicKind(gun.calibre, gun.skill)) return "notPistolOrRifle";
      break;
    default:
      break;
  }
  return null;
}

/** The upgrades of a list the gun takes, in the list's order, each checked against those before it. */
export function allowedUpgrades(upgrades: readonly AmmunitionUpgrade[], gun: GunFacts): AmmunitionUpgrade[] {
  const out: AmmunitionUpgrade[] = [];
  for (const upgrade of AMMUNITION_UPGRADES) {
    if (upgrades.includes(upgrade) && upgradeRefusal(upgrade, gun, out) === null) out.push(upgrade);
  }
  return out;
}

// ── Adjusting Damage (p. 166) ──

/**
 * Damage multiplied as the book adjusts it: dice and adds as points (a die is
 * 3.5), multiplied and divided back into dice; a remainder of .15-.42 is +1,
 * .43-.64 is +2, .65-.85 is a die more at -1, .86 or more a die more; under a
 * die, 1d-5 to 1d; over 12 dice, 6d times the nearest whole number. 4d-1
 * times 1.1 is 4d; 6d+2 times 1.5 is 10d.
 */
export function adjustDamage(formula: string, factor: number): string {
  const d = parseDice(formula);
  if (!d || factor === 1 || !(factor > 0)) return formula;
  const dice = (d.adds ? (d.dice * 3.5 + d.adds) / 3.5 : d.dice) * d.multiplier * factor;
  // The book reads the remainder to two places: 9.857 is 9.86, a whole die more.
  const result = Math.round(dice * 100) / 100;
  if (result > 12) return `6dx${Math.max(1, Math.round(result / 6))}`;
  if (result < 1) {
    const adds = result <= 0.32 ? -5 : result <= 0.42 ? -4 : result <= 0.56 ? -3 : result <= 0.75 ? -2 : result <= 0.95 ? -1 : 0;
    return adds ? `1d${adds}` : "1d";
  }
  const whole = Math.floor(result);
  const rest = Math.round((result - whole) * 100) / 100;
  if (rest >= 0.86) return `${whole + 1}d`;
  if (rest >= 0.65) return `${whole + 1}d-1`;
  if (rest >= 0.43) return `${whole}d+2`;
  if (rest >= 0.15) return `${whole}d+1`;
  return `${whole}d`;
}

// ── what the upgrades do to a row ──

/** The row's figures the upgrades change. */
export interface AmmunitionRow {
  damage: string;
  halfDamageRange: number;
  maxRange: number;
  accuracy: number;
  malfunction: number | null;
  minSt: number;
}

/** What the upgrades did to a row that it can't carry: how it is heard, and what needs the GM. */
export interface AmmunitionEffect {
  row: AmmunitionRow;
  /** Added to Hearing rolls to hear the shot. */
  hearing: number;
  /** Heard on the Hearing Distance Table's 16-yard line (p. 158) whatever the gun. */
  silent: boolean;
  notes: Array<"extraPowerfulAuto" | "extraPowerfulPowder">;
  /** What the damage was multiplied by, the projectile's factor with the upgrades' (p. 166). */
  damageFactor: number;
}

/**
 * The row a load fires: the gun's own row (`row`) with the upgrades, and
 * `baseAccuracy` the gun's listed Acc, which match-grade multiplies. A
 * `matched` load was handloaded to a perfect match for this gun (p. 174).
 * `batchMalfunction` is what a critically failed batch of reloads lost.
 */
export function upgradedRow(row: AmmunitionRow, upgrades: readonly AmmunitionUpgrade[], gun: GunFacts, options: { baseAccuracy: number; matched?: boolean; batchMalfunction?: number; damageFactor?: number }): AmmunitionEffect {
  // A projectile's multiple comes in with the upgrades', so the dice are rounded once (p. 166).
  let damage = options.damageFactor ?? 1;
  let range = 1;
  let st = 1;
  let accuracy = 0;
  let malfunction = -Math.max(0, Math.floor(-(options.batchMalfunction ?? 0)));
  let hearing = 0;
  let silent = false;
  const notes: AmmunitionEffect["notes"] = [];
  const cls = ammunitionClass(gun.calibre);
  for (const upgrade of upgrades) {
    switch (upgrade) {
      case "fieldExpedient":
        // Stones and coins: -1 Acc, half damage and range, -2 Malf. (p. 163).
        accuracy -= 1;
        damage *= 0.5;
        range *= 0.5;
        malfunction -= 2;
        break;
      case "extraPowerful":
        damage *= 1.1;
        range *= 1.1;
        st *= 1.1;
        // Most TL5-6 guns, and cheap TL7-8 ones, aren't built for it: -1 Malf. (p. 165).
        if (gun.tl <= 6 || gun.cheap) malfunction -= 1;
        if (gun.automatic) notes.push("extraPowerfulAuto");
        if (cls === "powderAndShot") notes.push("extraPowerfulPowder");
        break;
      case "matchGrade": {
        // Acc x1.25, fractions dropped, +1 at most; a perfect handloaded match x1.5, +2 at most.
        const base = Math.max(0, options.baseAccuracy);
        const [factor, cap] = options.matched ? [1.5, 2] : [1.25, 1];
        accuracy += Math.min(cap, Math.floor(base * factor) - base);
        break;
      }
      case "subsonic":
        if (subsonicKind(gun.calibre, gun.skill) === "pistol") {
          hearing -= 1;
          range *= 0.8;
        } else {
          hearing -= 2;
          damage *= 0.6;
          range *= 0.6;
        }
        break;
      case "silent":
        silent = true;
        break;
      default:
        break;
    }
  }
  const round = (n: number) => Math.round((Number(n) || 0) * range);
  return {
    row: {
      damage: adjustDamage(row.damage, damage),
      halfDamageRange: round(row.halfDamageRange),
      maxRange: round(row.maxRange),
      accuracy: Math.max(0, row.accuracy + accuracy),
      malfunction: row.malfunction === null ? null : row.malfunction + malfunction,
      // "9 x 1.1 = 9.9 or 10" (p. 165).
      minSt: row.minSt > 0 ? Math.round(row.minSt * st) : row.minSt,
    },
    hearing,
    silent,
    notes,
    damageFactor: damage,
  };
}

// ── cost and weight per shot (pp. 175-177) ──

/** A price to the cent, halves up: $3.705 is $3.71, whatever the floating point makes of it. */
const cents = (n: number): number => Math.round(n * 100 + 1e-6) / 100;

/** Who made the rounds: bought, handloaded new from components, or reloaded into fired cases (p. 174). */
export const SOURCES = ["", "handloaded", "reloaded"] as const;
export type AmmunitionSource = (typeof SOURCES)[number];

/** The upgrades' cost and weight multiples, and the Legality Class the strictest of them sets. */
export function upgradeMultiples(upgrades: readonly AmmunitionUpgrade[]): { cps: number; wps: number; lc: number | null } {
  let cps = 1;
  let wps = 1;
  let lc: number | null = null;
  for (const upgrade of upgrades) {
    cps *= UPGRADES[upgrade].cps;
    wps *= UPGRADES[upgrade].wps;
    const own = UPGRADES[upgrade].lc;
    if (own !== null) lc = lc === null ? own : Math.min(lc, own);
  }
  return { cps, wps, lc };
}

/**
 * A round's cost and weight: the table's CPS and WPS times the upgrades, and
 * times the projectile's multiple plus what it adds (a dose of poison,
 * p. 167). Handloaded rounds cost their materials, the round's usual CPS;
 * reloads half of it (p. 174); either way times the projectile's multiple. Rounded to the cent and the ten-thousandth of
 * a pound.
 */
export function perShot(row: CalibreRow, upgrades: readonly AmmunitionUpgrade[], source: AmmunitionSource = "", projectile: { cps: number; add: number } = { cps: 1, add: 0 }): { cps: number; wps: number } {
  const multiples = upgradeMultiples(upgrades);
  // The projectile's materials cost the same handloaded: Special Agent Lafayette's silver hollow-points are $0.3 x 50 (p. 168).
  const base = source === "handloaded" ? row.cps : source === "reloaded" ? row.cps / 2 : row.cps * multiples.cps;
  const cps = base * projectile.cps + projectile.add;
  return { cps: cents(cps), wps: Math.round(row.wps * multiples.wps * 10000) / 10000 };
}

/** Bought at once: 5% off 500 rounds or more, 15% off 5,000 or more (p. 175). */
export function bulkDiscount(rounds: number): number {
  return rounds >= 5000 ? 15 : rounds >= 500 ? 5 : 0;
}

/** What an Area Knowledge roll for where one shops finds: 5% off, 15% on a critical success (p. 175). */
export function areaKnowledgeDiscount(outcome: { success: boolean; criticalSuccess?: boolean }): number {
  return outcome.criticalSuccess ? 15 : outcome.success ? 5 : 0;
}

/** A price with discounts in percent taken off one after the other. */
export function discounted(cost: number, ...percents: number[]): number {
  return cents(percents.reduce((c, p) => c * (1 - Math.max(0, p) / 100), cost));
}

// ── cartridge conversions (p. 164) ──

/** The bore a round is named for: ".44" of ".44 Caplock (M1860 Army)". */
const boreOf = (name: string): string => /^(\.\d+)/.exec(name)?.[1] ?? "";

/** The cartridges a caplock's bore takes: .44 takes .44 or .45, .36 takes .38, .31 takes .32; others their own bore. */
const CONVERTS_TO: Readonly<Record<string, readonly string[]>> = { ".44": [".44", ".45"], ".36": [".38"], ".31": [".32"] };

/** Whether a gun's round is a caplock's, which a gunsmith can convert to cartridges (p. 164). */
export function isConvertible(row: CalibreRow | null): boolean {
  return Boolean(row && /caplock/i.test(row.name) && boreOf(row.name));
}

/**
 * The cartridges a caplock can be converted to fire (p. 164): the bullet must
 * fit the bore, the round must be of its own table, and never a Magnum.
 */
export function conversionsFor(row: CalibreRow | null, table: readonly CalibreRow[]): CalibreRow[] {
  if (!row || !isConvertible(row)) return [];
  const bore = boreOf(row.name);
  const bores = CONVERTS_TO[bore] ?? [bore];
  return table.filter((r) => r.class === row.class && ammunitionClass(r) === "cased" && bores.includes(boreOf(r.name)) && !/magnum/i.test(r.name));
}

/** A conversion's Armoury (Small Arms) roll and time (p. 164). */
export const CONVERSION = Object.freeze({ modifier: -4, days: 3 });

// ── handloading and reloading (p. 174) ──

export const HANDLOADING_TOOLS = ["press", "progressive", "powered"] as const;
export type HandloadingTool = (typeof HANDLOADING_TOOLS)[number];

/** Each tool: its TL, rounds an hour, minutes between Armoury rolls, cost and weight (p. 174). */
export const TOOLS: Readonly<Record<HandloadingTool, { tl: number; perHour: number; rollEvery: number; cost: number; weight: number }>> = Object.freeze({
  press: { tl: 5, perHour: 20, rollEvery: 60, cost: 100, weight: 2 },
  progressive: { tl: 6, perHour: 1000, rollEvery: 30, cost: 500, weight: 10 },
  powered: { tl: 7, perHour: 5000, rollEvery: 30, cost: 1000, weight: 20 },
});

/** Dies for another calibre (p. 174). */
export const EXTRA_DIES_COST = 30;
/** Matched rounds are loaded no faster than 20 an hour (p. 174). */
export const MATCHED_PER_HOUR = 20;
/** The Armoury rolls for reloading fired cases are at +2 (p. 174). */
export const RELOADING_BONUS = 2;
/** A critical success on a reloading batch takes a quarter off its time (p. 174). */
export const CRITICAL_TIME_SAVED = 0.25;

/** The minutes a batch takes, and how many Armoury rolls. */
export function batchTime(tool: HandloadingTool, rounds: number, matched: boolean): { minutes: number; rolls: number } {
  const figures = TOOLS[tool];
  const perHour = matched ? Math.min(MATCHED_PER_HOUR, figures.perHour) : figures.perHour;
  const minutes = Math.ceil((Math.max(0, rounds) / perHour) * 60);
  return { minutes, rolls: Math.max(1, Math.ceil(minutes / figures.rollEvery)) };
}

/** Handloading is for cased ammunition (p. 174). */
export function canHandload(row: CalibreRow | null): boolean {
  return ammunitionClass(row) === "cased";
}

// ── misloading (p. 178) ──

/**
 * The Ammunition Interchangeability chains (p. 178), as groups from left to
 * right; the rounds in one group are truly interchangeable. A gun made for a
 * round fires those in the groups to its right, not those to its left.
 */
export const INTERCHANGEABLE: ReadonlyArray<ReadonlyArray<readonly string[]>> = [
  [["7.63x25mm", "7.62x25mm"]],
  [[".357 Magnum"], [".38 Special"]],
  [[".44 Magnum"], [".44 Special"], [".44 Russian", ".44 American"]],
  [[".454 Casull"], [".45 Long Colt"], [".45 S&W"]],
  [[".476 Enfield"], [".455 Webley", ".450 Adams"], [".442 RIC"]],
  [[".22 LR"], [".22 Short"]],
  [["20G 2.75in"], ["20G 2.5in"]],
  [["12G 3in"], ["12G 2.75in"], ["12G 2.5in"]],
];

/** Where a round stands on the chains: its chain and group, found by the row's name. */
function placeOn(name: string, lookup: (calibre: string) => CalibreRow[]): { chain: number; group: number } | null {
  for (let chain = 0; chain < INTERCHANGEABLE.length; chain += 1) {
    const groups = INTERCHANGEABLE[chain]!;
    for (let group = 0; group < groups.length; group += 1) {
      if (groups[group]!.some((calibre) => lookup(calibre).some((row) => row.name === name))) return { chain, group };
    }
  }
  return null;
}

/**
 * Whether a gun made for one round fires another (p. 178): the same round;
 * one interchangeable with it; a shorter one down its chain, which only a
 * revolver or a manual repeater takes (not a self-loader); or neither, a
 * misload.
 */
export function chambering(gun: CalibreRow, round: CalibreRow, options: { selfLoader: boolean; lookup: (calibre: string) => CalibreRow[] }): "same" | "interchangeable" | "shorter" | "misload" {
  if (gun.name === round.name) return "same";
  const a = placeOn(gun.name, options.lookup);
  const b = placeOn(round.name, options.lookup);
  if (!a || !b || a.chain !== b.chain) return "misload";
  if (a.group === b.group) return "interchangeable";
  return b.group > a.group && !options.selfLoader ? "shorter" : "misload";
}

/**
 * A round's bore in millimetres: the metric figure its name gives
 * ("9×19mm", ".44 Magnum (10.9×33mmR)"), or its inch figure converted
 * (".44 Caplock" is 11.2mm); null where it gives neither.
 */
export function boreMm(row: CalibreRow): number | null {
  const metric = /(\d+(?:\.\d+)?)×\d/.exec(row.name) ?? /^(\d+(?:\.\d+)?)mm/.exec(row.name);
  if (metric) return Number(metric[1]);
  const inch = /^(\.\d+)/.exec(row.name);
  return inch ? Math.round(Number(inch[1]) * 25.4 * 100) / 100 : null;
}

/**
 * The rounds of a gun's own table and class near enough its bore to be
 * loaded into it by mistake (p. 178): within a third of a millimetre.
 */
export function nearRounds(row: CalibreRow, table: readonly CalibreRow[]): CalibreRow[] {
  const bore = boreMm(row);
  if (bore === null) return [];
  const seen = new Set<string>([row.name]);
  return table.filter((r) => {
    const other = boreMm(r);
    if (r.class !== row.class || ammunitionClass(r) !== ammunitionClass(row) || other === null || Math.abs(other - bore) > 0.3 || seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
}

/** What the Misloading Table's 3d says (p. 178). */
export type MisloadResult = "fires" | "firesAndJams" | "jams" | "misfire" | "damaged" | "bursts";

export function misloadResult(roll: number): MisloadResult {
  if (roll <= 3) return "fires";
  if (roll === 4) return "firesAndJams";
  if (roll <= 10) return "jams";
  if (roll <= 16) return "misfire";
  return roll === 17 ? "damaged" : "bursts";
}

/** A damaged gun's repair: at least a day, and 1d x 10% of its price in parts (p. 178). */
export const MISLOAD_REPAIR = Object.freeze({ days: 1, partsPercentPerDie: 10 });
