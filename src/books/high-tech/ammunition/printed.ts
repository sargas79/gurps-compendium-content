/**
 * The rounds High-Tech prints for one family of guns, with their own
 * statistics: Exotic Shotgun Ammo for the 12-gauge (p. 103) and Grenade
 * Launcher Ammo for 40×46mmSR launchers (p. 143). The rules, with no Foundry
 * in them.
 *
 * A printed round is a load of its own: it takes the place of the row's
 * figures with the book's, where the projectile options (pp. 166-175) would
 * only work them out. Each is filed under the projectile option it is (a
 * beanbag, a tear-gas shell, HEDP), whose switch offers it and whose rules --
 * the cloud, the blast's falloff -- still follow it; the flame jet, rock salt,
 * the net and the camera are none, and go with the projectile options.
 */

import { chambering } from "./rules.js";
import { gunCalibreRows, type CalibreRow } from "./calibres.js";
import type { HighTechSmoke } from "./explosive.js";
import type { Projectile } from "./projectiles.js";

/** The switch a printed round is offered under: the projectile option's it is. */
export type PrintedFamily = "kinetic" | "multiple" | "explosive" | "cargo";

/** A line linked to the round's own, or following it (Characters p. 106). */
export interface PrintedLine {
  damage: string;
  damageType: string;
  armorDivisor: number;
  explosive: boolean;
  fragmentation: string;
  /** True for a follow-up, false for a linked attack. */
  followUp: boolean;
}

export interface PrintedRound {
  key: string;
  page: number;
  /** The round it is made in: a calibre as the Interchangeability table names it ("12G 2.5in"), or null for any shell the gun fires. */
  round: string | null;
  /** Rounds that are "also available in 37×122mmR, with the same stats" (p. 143). */
  also37?: boolean;
  /** Guns of the shotgun table only (rock salt), where `round` is null. */
  shotgunOnly?: boolean;
  tl: number;
  /** The projectile option it is, for its switch and its rules; blank for none. */
  projectile: Projectile;
  family: PrintedFamily;
  /** Null for a round that does no damage (the camera). */
  damage: string | null;
  damageType: string;
  armorDivisor: number;
  explosive?: boolean;
  fragmentation?: string;
  doubleKnockback?: boolean;
  line?: PrintedLine;
  /** Left out, the gun's own. */
  accuracy?: number;
  halfDamageRange?: number;
  maxRange?: number;
  minRange?: number;
  /** "slug": the RoF without its multiplier (p. 103); a number, the projectiles in the n of "n×20". */
  projectiles?: "slug" | number;
  /** "slug": the gun's slug Rcl; "slugLess1": one less, at least 1; a number, that Rcl. */
  recoil?: "slug" | "slugLess1" | number;
  /** Won't cycle in auto-loaders (p. 103). */
  noCycle?: boolean;
  /** The kind of smoke a smoke round is: the 40mm round comes in colours (p. 143). */
  smoke?: HighTechSmoke;
  /** A cloud or a light, its radius in yards and how long it lasts. */
  cloud?: { radius: number; seconds: number };
  /** A cone this wide at its base, in yards (Characters p. 413). */
  cone?: number;
  /** Fires no more than once in this many seconds. */
  everySeconds?: number;
  /** Heard on the 16-yard line (p. 165). */
  silent?: boolean;
  /** Resisted rather than damaging: the attribute and its modifier. */
  affliction?: { attribute: string; modifier: number };
  /** ST multiplied by (p. 143's extra-powerful HEDP). */
  minStFactor?: number;
  /** Cost per shot, and as an experimental round where the book prints one. */
  cps: number;
  experimentalCps?: number;
  lc: number;
}

const SLUG = { projectiles: "slug", recoil: "slug" } as const;
const SLUG_LESS = { projectiles: "slug", recoil: "slugLess1", noCycle: true } as const;

/** Exotic Shotgun Ammo (p. 103) and Grenade Launcher Ammo (p. 143). */
export const PRINTED_ROUNDS: readonly PrintedRound[] = [
  // ── the 12-gauge (p. 103) ──
  { key: "sgApds", page: 103, round: "12G 2.75in", tl: 7, projectile: "apds", family: "kinetic", damage: "6d", damageType: "pi+", armorDivisor: 2, accuracy: 4, halfDamageRange: 150, maxRange: 1600, ...SLUG, cps: 1.5, experimentalCps: 7.5, lc: 2 },
  { key: "sgAphc", page: 103, round: "12G 2.75in", tl: 7, projectile: "aphc", family: "kinetic", damage: "5d", damageType: "pi+", armorDivisor: 2, accuracy: 4, halfDamageRange: 100, maxRange: 1200, ...SLUG, cps: 1, experimentalCps: 5, lc: 2 },
  { key: "sgTearGas", page: 103, round: "12G 2.5in", tl: 7, projectile: "tearGas", family: "cargo", damage: "2d-1", damageType: "cr", armorDivisor: 0.5, accuracy: 3, halfDamageRange: 15, maxRange: 250, cloud: { radius: 4, seconds: 20 }, ...SLUG_LESS, cps: 1.5, lc: 3 },
  { key: "sgBaton", page: 103, round: "12G 2.5in", tl: 7, projectile: "baton", family: "kinetic", damage: "1d", damageType: "cr", armorDivisor: 0.5, accuracy: 2, halfDamageRange: 20, maxRange: 250, ...SLUG_LESS, cps: 1, lc: 3 },
  { key: "sgBeanbag", page: 103, round: "12G 2.5in", tl: 7, projectile: "beanbag", family: "kinetic", damage: "1d", damageType: "cr", armorDivisor: 0.2, doubleKnockback: true, accuracy: 0, halfDamageRange: 10, maxRange: 150, ...SLUG_LESS, cps: 1.5, lc: 3 },
  // Dragon's Breath: a cone of sparks 10 yards wide, once every four seconds, and not from an auto-loader.
  { key: "sgFlameJet", page: 103, round: "12G 2.75in", tl: 7, projectile: "", family: "kinetic", damage: "1d-2", damageType: "burn", armorDivisor: 1, halfDamageRange: 0, maxRange: 75, projectiles: 1, cone: 10, everySeconds: 4, noCycle: true, cps: 1.25, experimentalCps: 6, lc: 3 },
  { key: "sgFrangible", page: 103, round: "12G 2.75in", tl: 7, projectile: "frangible", family: "kinetic", damage: "5d", damageType: "pi++", armorDivisor: 0.5, accuracy: 3, halfDamageRange: 50, maxRange: 600, ...SLUG, cps: 0.75, lc: 3 },
  { key: "sgHe", page: 103, round: "12G 2.75in", tl: 7, projectile: "he", family: "explosive", damage: "4d", damageType: "pi++", armorDivisor: 0.5, line: { damage: "1d-1", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "1d", followUp: true }, accuracy: 4, minRange: 3, halfDamageRange: 100, maxRange: 1200, ...SLUG, cps: 1, experimentalCps: 10, lc: 1 },
  { key: "sgHeat", page: 103, round: "12G 3in", tl: 8, projectile: "heat", family: "explosive", damage: "1d", damageType: "cr", armorDivisor: 10, explosive: true, line: { damage: "1d-1", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "", followUp: false }, accuracy: 4, minRange: 3, halfDamageRange: 100, maxRange: 1200, ...SLUG, cps: 2, experimentalCps: 20, lc: 1 },
  { key: "sgFlechette", page: 103, round: "12G 2.75in", tl: 7, projectile: "multiFlechette", family: "multiple", damage: "1d+1", damageType: "pi-", armorDivisor: 1, halfDamageRange: 100, maxRange: 1200, projectiles: 20, recoil: 1, cps: 2, experimentalCps: 10, lc: 3 },
  // Handloaded into any shell: no damage, Range 10, and a HT roll (DR adding) against moderate pain.
  { key: "sgRockSalt", page: 103, round: null, shotgunOnly: true, tl: 5, projectile: "", family: "kinetic", damage: null, damageType: "", armorDivisor: 1, halfDamageRange: 0, maxRange: 10, projectiles: 1, affliction: { attribute: "HT", modifier: 0 }, cps: 0.25, lc: 4 },
  { key: "sgRubber", page: 103, round: "12G 2.5in", tl: 8, projectile: "rubberShot", family: "multiple", damage: "1d-3", damageType: "cr", armorDivisor: 0.2, halfDamageRange: 20, maxRange: 120, projectiles: 18, recoil: 1, noCycle: true, cps: 1, lc: 3 },
  { key: "sgSilent", page: 103, round: "12G 2.75in", tl: 7, projectile: "shotshell", family: "multiple", damage: "1d", damageType: "pi-", armorDivisor: 0.5, halfDamageRange: 30, maxRange: 600, projectiles: 12, recoil: 1, noCycle: true, silent: true, cps: 5, experimentalCps: 25, lc: 2 },

  // ── 40×46mmSR grenade launchers (p. 143): the first figure of an explosive round's Range is its minimum ──
  { key: "glBaton", page: 143, round: "40×46mmSR", also37: true, tl: 7, projectile: "baton", family: "kinetic", damage: "1d+1", damageType: "cr", armorDivisor: 0.5, doubleKnockback: true, minRange: 0, halfDamageRange: 10, maxRange: 110, cps: 10, lc: 3 },
  { key: "glBeanbag", page: 143, round: "40×46mmSR", also37: true, tl: 7, projectile: "beanbag", family: "kinetic", damage: "1d+1", damageType: "cr", armorDivisor: 0.2, doubleKnockback: true, accuracy: 0, minRange: 0, halfDamageRange: 10, maxRange: 150, cps: 15, lc: 3 },
  { key: "glCamera", page: 143, round: "40×46mmSR", tl: 8, projectile: "", family: "kinetic", damage: null, damageType: "", armorDivisor: 1, minRange: 0, cps: 400, lc: 4 },
  { key: "glHe8", page: 143, round: "40×46mmSR", tl: 8, projectile: "he", family: "explosive", damage: "6d+2", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "2d", cps: 10, lc: 1 },
  { key: "glHedp7", page: 143, round: "40×46mmSR", tl: 7, projectile: "hedp", family: "explosive", damage: "4d", damageType: "cr", armorDivisor: 10, explosive: true, fragmentation: "", line: { damage: "4d+2", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "2d", followUp: false }, cps: 20, lc: 1 },
  { key: "glHedp8", page: 143, round: "40×46mmSR", tl: 8, projectile: "hedp", family: "explosive", damage: "7d", damageType: "cr", armorDivisor: 10, explosive: true, fragmentation: "", line: { damage: "6d", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "2d", followUp: false }, cps: 20, lc: 1 },
  { key: "glHedpPlus", page: 143, round: "40×46mmSR", tl: 8, projectile: "hedp", family: "explosive", damage: "7d", damageType: "cr", armorDivisor: 10, explosive: true, fragmentation: "", line: { damage: "6d", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "2d", followUp: false }, minRange: 30, halfDamageRange: 0, maxRange: 880, minStFactor: 1.2, cps: 30, lc: 1 },
  { key: "glIllumination", page: 143, round: "40×46mmSR", also37: true, tl: 7, projectile: "illumination", family: "cargo", damage: "1d+1", damageType: "cr", armorDivisor: 0.5, doubleKnockback: true, minRange: 0, cloud: { radius: 185, seconds: 40 }, cps: 25, lc: 4 },
  { key: "glFlechette", page: 143, round: "40×46mmSR", tl: 7, projectile: "multiFlechette", family: "multiple", damage: "1d-3", damageType: "pi-", armorDivisor: 1, accuracy: 2, minRange: 0, halfDamageRange: 100, maxRange: 1200, projectiles: 45, recoil: 1, cps: 20, lc: 3 },
  // The net: a stun grenade's effect (p. 193) on whoever it catches (Characters p. 411), Range 10.
  { key: "glNet", page: 143, round: "40×46mmSR", also37: true, tl: 8, projectile: "", family: "kinetic", damage: null, damageType: "", armorDivisor: 1, minRange: 0, halfDamageRange: 0, maxRange: 10, affliction: { attribute: "HT", modifier: -5 }, cps: 50, lc: 3 },
  { key: "glRubber", page: 143, round: "40×46mmSR", also37: true, tl: 8, projectile: "rubberShot", family: "multiple", damage: "1d-3", damageType: "cr", armorDivisor: 0.2, accuracy: 2, minRange: 0, halfDamageRange: 20, maxRange: 120, projectiles: 48, recoil: 1, cps: 10, lc: 3 },
  { key: "glShot7", page: 143, round: "40×46mmSR", tl: 7, projectile: "shotshell", family: "multiple", damage: "1d-1", damageType: "pi-", armorDivisor: 0.5, accuracy: 2, minRange: 0, halfDamageRange: 30, maxRange: 600, projectiles: 20, recoil: 1, cps: 5, lc: 3 },
  { key: "glShot8", page: 143, round: "40×46mmSR", tl: 8, projectile: "shotshell", family: "multiple", damage: "1d-1", damageType: "pi-", armorDivisor: 0.5, accuracy: 2, minRange: 0, halfDamageRange: 30, maxRange: 600, projectiles: 50, recoil: 1, cps: 5, lc: 3 },
  { key: "glSilentHe", page: 143, round: "40×46mmSR", tl: 7, projectile: "he", family: "explosive", damage: "4d+1", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "2d", silent: true, cps: 100, lc: 1 },
  { key: "glSmoke", page: 143, round: "40×46mmSR", also37: true, tl: 7, projectile: "smoke", family: "cargo", damage: "1d+1", damageType: "cr", armorDivisor: 0.5, doubleKnockback: true, minRange: 0, smoke: "colored", cloud: { radius: 8, seconds: 25 }, cps: 15, lc: 3 },
  { key: "glTearGas", page: 143, round: "40×46mmSR", also37: true, tl: 7, projectile: "tearGas", family: "cargo", damage: "1d+1", damageType: "cr", armorDivisor: 0.5, doubleKnockback: true, minRange: 0, cloud: { radius: 8, seconds: 20 }, cps: 15, lc: 3 },
  { key: "glThermobaric", page: 143, round: "40×46mmSR", tl: 8, projectile: "thermobaric", family: "explosive", damage: "8d", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "", cps: 40, lc: 1 },
];

export const PRINTED_KEYS = PRINTED_ROUNDS.map((r) => r.key);

export const printedRound = (key: string): PrintedRound | null => PRINTED_ROUNDS.find((r) => r.key === key) ?? null;

/** The 37mm launchers that fire the rounds marked with an asterisk (p. 143). */
const THIRTY_SEVEN = "37×122mmR";

/**
 * Whether a gun fires a printed round: its own round, or a shorter one down
 * the Interchangeability chains (p. 178), as a gun chambered for 2.75" shells
 * takes 2.5" ones. An auto-loader takes them too: p. 103 says which of them
 * won't cycle its action, not that it can't fire them. Rock salt goes into
 * any shell.
 */
export function firesPrinted(round: PrintedRound, gun: { calibre: CalibreRow | null }): boolean {
  const own = gun.calibre;
  if (!own) return false;
  if (round.round === null) return round.shotgunOnly ? own.class === "shotgun" : true;
  if (round.also37 && own.name === THIRTY_SEVEN) return true;
  const made = gunCalibreRows(round.round);
  if (made.some((r) => r.name === own.name)) return true;
  const row = made[0];
  if (!row) return false;
  const how = chambering(own, row, { selfLoader: false, lookup: gunCalibreRows });
  return how !== "misload";
}

/** The printed rounds a gun fires. */
export const printedRoundsFor = (gun: { calibre: CalibreRow | null }): PrintedRound[] => PRINTED_ROUNDS.filter((r) => firesPrinted(r, gun));

/** The figures of a row a printed round replaces. */
export interface PrintedRowIn {
  damage: string;
  damageType: string;
  armorDivisor: number;
  halfDamageRange: number;
  maxRange: number;
  accuracy: number;
  projectiles: number;
  recoil: number;
  minSt: number;
}

export interface PrintedRowOut extends PrintedRowIn {
  explosive: boolean;
  fragmentation: string;
  doubleKnockback: boolean;
  affliction: boolean;
  afflictionAttribute: string;
  afflictionModifier: number;
  followUp: PrintedLine | null;
  /** Set only where the round gives one. */
  minRange?: number;
  coneMaxWidth?: number;
}

/**
 * The row a printed round fires (pp. 103, 143): the book's figures in place
 * of the gun's, and the gun's own where the book leaves them out. "RoF and
 * Rcl as slug" is the RoF without its multiplier and the higher Rcl the gun
 * lists (p. 103), `slugRecoil`; "slug-1" is one less.
 */
export function printedRow(row: PrintedRowIn, round: PrintedRound, slugRecoil: number): PrintedRowOut {
  const recoil = round.recoil === "slug" ? slugRecoil
    : round.recoil === "slugLess1" ? Math.max(1, slugRecoil - 1)
      : typeof round.recoil === "number" ? round.recoil : row.recoil;
  const out: PrintedRowOut = {
    damage: round.damage ?? "",
    damageType: round.damageType,
    armorDivisor: round.armorDivisor,
    halfDamageRange: round.halfDamageRange ?? row.halfDamageRange,
    maxRange: round.maxRange ?? row.maxRange,
    accuracy: round.accuracy ?? row.accuracy,
    projectiles: round.projectiles === "slug" ? 1 : typeof round.projectiles === "number" ? round.projectiles : row.projectiles,
    recoil,
    minSt: round.minStFactor && row.minSt > 0 ? Math.round(row.minSt * round.minStFactor) : row.minSt,
    explosive: round.explosive === true,
    fragmentation: round.fragmentation ?? "",
    doubleKnockback: round.doubleKnockback === true,
    affliction: Boolean(round.affliction),
    afflictionAttribute: round.affliction?.attribute ?? "",
    afflictionModifier: round.affliction?.modifier ?? 0,
    followUp: round.line ? { ...round.line } : null,
  };
  if (round.minRange !== undefined) out.minRange = round.minRange;
  if (round.cone) out.coneMaxWidth = round.cone;
  return out;
}

/**
 * A printed round's cost per shot: the book's, or its experimental price
 * where one is printed and the round is made in limited production; any
 * other limited-production round costs five to ten times as much, at the
 * GM's choice (p. 166).
 */
export function printedCps(round: PrintedRound, limited: number): number {
  if (limited > 0 && round.experimentalCps !== undefined) return round.experimentalCps;
  return round.cps * (limited > 0 ? limited : 1);
}

/** Limited-production and experimental rounds: five to ten times the cost (p. 166); 0 for none. */
export const LIMITED_FACTORS = [0, 5, 6, 7, 8, 9, 10] as const;
export const limitedFactor = (n: unknown): number => {
  const v = Math.floor(Number(n) || 0);
  return v >= 5 && v <= 10 ? v : 0;
};
