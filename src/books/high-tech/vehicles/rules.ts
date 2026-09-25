/**
 * High-Tech's vehicle components, protection and crew (pp. 228-229,
 * 234-235), with no Foundry in them.
 *
 *   - **Vehicle components (pp. 228-229).** A gun port: -1 to the shooter's
 *     skill, a 30-degree arc, no weapon bulkier than Bulk -5, and -4 to -7
 *     (usually -7) to hit him from outside; a searchlight's lit circle, two
 *     yards across per mile of range, and its blinding attack at Acc 12 on DX;
 *     a turret's Ready maneuvers per 60 degrees turned; linked weapons fired as
 *     one with the sum of their RoF; smoke dischargers' screen; sound baffling
 *     at -(TL-4) to hear the vehicle.
 *   - **Protection (pp. 229, 234-235).** An internal fire extinguisher puts a
 *     fire out on TL+2 or less, a fire-suppression system on TL+4 with a second
 *     try two seconds later; run-flat tyres run on flat at -1 Handling and
 *     Move less 20% for TL squared miles, and a central tyre-inflation system
 *     ignores two flats (three on an eight-wheeler); an airbag is DR 10 against
 *     a collision above Move 5, and DX-2 a turn to get out from behind it;
 *     improved brakes +1 to keep control while braking hard; spaced armour
 *     multiplies DR by 1.5 against HEAT and HEDP, laminated armour by 2, before
 *     the armour divisor, and either negates HESH's spall; riveted armour hit
 *     for 20 or more without being pierced flies apart inside on 1-3 on 1d, and
 *     a crewman the Occupant Hit Table picks takes 2d cutting.
 *   - **Crew (pp. 234-235).** Riding in a TL6 tank costs 1 FP an hour (none
 *     with your head outside), fighting in one 1 FP every 10 minutes; while the
 *     motor runs the crew hear each other at -4 without headsets (late TL6),
 *     and hear outside at -10 (-3 with the motor off); buttoned up, each has
 *     his arc, sees nothing within five yards and is at -2 to Vision beyond.
 *
 * The vehicles of chapter 8 carry what their text gives them in
 * `HT_VEHICLES`, by the name their records have; a GM can fit any vehicle
 * with more.
 */

import type { ShapedArmourTable } from "../../../shared/vehicles/rules.js";

// ── what a vehicle is fitted with ──

/** Where on a vehicle a piece of armour is: its hull, its turret, or all of it. */
export type ArmourPart = "hull" | "turret" | "all";
export type Arc = "front" | "side" | "rear" | "top" | "underbody";

/** A stretch of armour of one kind: a part, from some arcs (all of them where none are given). */
export interface ArmourSpot {
  part: ArmourPart;
  arcs?: readonly Arc[];
}

/** Armour skirts: a layer of DR on a part from some arcs, which works as spaced armour (p. 239). */
export interface Skirt extends ArmourSpot {
  dr: number;
}

/**
 * Armour around one crew post against an occupant hit (Campaigns p. 555):
 * DR by the face the shot came in from. A face the text gives nothing for
 * has none.
 */
export interface CrewArmour {
  /** Who sits behind it: the pilot, the coxswain. */
  post: "pilot" | "coxswain";
  front?: number;
  side?: number;
  rear?: number;
}

/** A gun shield on one of a vehicle's several mounts: it guards that mount's gunner alone. */
export interface GunShield {
  mount: "rearPintle";
  dr: number;
}

/** What a vehicle is fitted with, of the components the book rules for. */
export interface VehicleFit {
  /** Gun ports, and the penalty to hit someone at one from outside (-4 to -7, p. 228). */
  gunPorts?: number;
  gunPortPenalty?: number;
  /** A searchlight's range in miles (p. 228). */
  searchlightMiles?: number;
  /** A turret's Ready maneuvers per 60 degrees (p. 228). */
  turretReadies?: number;
  /** A mount that turns a facing a second, and can fire while it turns (the PBR's gun tub, p. 242). */
  turretSeconds?: number;
  extinguisher?: boolean;
  fireSuppression?: boolean;
  runFlat?: boolean;
  ctis?: boolean;
  airbags?: boolean;
  improvedBrakes?: boolean;
  soundBaffling?: boolean;
  smokeDischargers?: boolean;
  iff?: boolean;
  spaced?: readonly ArmourSpot[];
  laminated?: readonly ArmourSpot[];
  skirts?: readonly Skirt[];
  riveted?: boolean;
  /** A tank whose crew ride as in a TL6 tank (pp. 234-235). */
  tank?: boolean;
  /** Headsets for the crew, from late TL6 (p. 234). */
  intercom?: boolean;
  /** Cockpit armour around a crewman, against occupant hits (pp. 237-238, 242). */
  crewArmour?: readonly CrewArmour[];
  /** Gun shields on single mounts (p. 242). */
  gunShields?: readonly GunShield[];
}

/**
 * What a crew post's armour gives against an occupant hit from a face: its
 * DR there, or null where it has none. A shot with no face comes from the
 * front; from above or below, the cockpit armour the book prints doesn't
 * reach.
 */
export function crewArmourDr(armour: CrewArmour, arc: string | null | undefined): number | null {
  const face = arc ?? "front";
  const dr = face === "front" ? armour.front : face === "side" ? armour.side : face === "rear" ? armour.rear : undefined;
  return typeof dr === "number" && dr > 0 ? dr : null;
}

/** The components a GM can fit a vehicle with, as switches. */
export const FITTINGS = [
  "gunPorts", "searchlight", "extinguisher", "fireSuppression", "runFlat", "ctis", "airbags", "improvedBrakes",
  "soundBaffling", "smokeDischargers", "iff", "spaced", "laminated", "riveted", "tank", "intercom",
] as const;
export type Fitting = (typeof FITTINGS)[number];

/** A vehicle's fit with the GM's fittings added. */
export function fitWith(base: VehicleFit, fittings: readonly string[]): VehicleFit {
  const fit: VehicleFit = { ...base };
  const has = (f: Fitting) => fittings.includes(f);
  if (has("gunPorts")) fit.gunPorts = Math.max(1, fit.gunPorts ?? 0);
  if (has("searchlight")) fit.searchlightMiles = fit.searchlightMiles ?? 0.25;
  for (const f of ["extinguisher", "fireSuppression", "runFlat", "ctis", "airbags", "improvedBrakes", "soundBaffling", "smokeDischargers", "iff", "riveted", "tank", "intercom"] as const) {
    if (has(f)) fit[f] = true;
  }
  if (has("spaced")) fit.spaced = [{ part: "all" }];
  if (has("laminated")) fit.laminated = [{ part: "all" }];
  return fit;
}

const FRONT: readonly Arc[] = ["front"];
const SIDES: readonly Arc[] = ["side"];

/**
 * The chapter's vehicles, by their records' names: the components their
 * text and notes give them (pp. 232-244).
 */
export const HT_VEHICLES: Readonly<Record<string, VehicleFit>> = Object.freeze({
  // Riveted armour; turret two Ready maneuvers a facing; no headsets yet (pp. 234-235).
  "Renault FT17": { turretReadies: 2, riveted: true, tank: true },
  // Armoured windows that slide down as gun ports (p. 236).
  "Cadillac V-16 Armored": { gunPorts: 2, gunPortPenalty: -7 },
  // Cockpit armour on an occupant hit: DR 15 front and sides, 25 behind (p. 237).
  "Focke-Wulf Fw 190A-6 Würger": { iff: true, crewArmour: [{ post: "pilot", front: 15, side: 15, rear: 25 }] },
  // Cockpit armour on an occupant hit: DR 20 from the front, 35 from the back (p. 238).
  "NAA P-51D Mustang IV": { iff: true, crewArmour: [{ post: "pilot", front: 20, rear: 35 }] },
  // Skirts on the turret and body sides work as spaced armour; an extinguisher; smoke discharger on some (pp. 238-239).
  "Krupp Panzer IV Ausf H": {
    turretReadies: 3, extinguisher: true, smokeDischargers: true, tank: true, intercom: true,
    skirts: [{ part: "hull", arcs: SIDES, dr: 10 }, { part: "turret", arcs: SIDES, dr: 15 }],
  },
  // A gun port on the turret's left side; an extinguisher (pp. 238-239).
  "Pressed Steel M4A1(76)W Sherman IIA": { turretReadies: 3, extinguisher: true, gunPorts: 1, tank: true, intercom: true },
  // The gunner's searchlight, a smoke discharger, an extinguisher, run-flat tyres (p. 240).
  "Panhard AML60-7": { turretReadies: 3, searchlightMiles: 0.25, smokeDischargers: true, extinguisher: true, runFlat: true },
  // An IR searchlight, a gun port each side, an extinguisher, CTIS (p. 240).
  "GAZ BRDM-2": { turretReadies: 2, searchlightMiles: 0.25, gunPorts: 2, extinguisher: true, ctis: true },
  "Aérospatiale SA316B Alouette III": { iff: true },
  "Hughes OH-6A Cayuse": { iff: true },
  "MDHC AH-6J Little Bird": { iff: true },
  // The bow gun tub turns a facing a second and fires as it turns; a searchlight; sound baffling;
  // the coxswain's cockpit armour, DR 20 all round; a DR 35 gun shield on the rear pintle (p. 242).
  "Uniflite PBR MK 2": {
    turretSeconds: 1, searchlightMiles: 0.25, soundBaffling: true,
    crewArmour: [{ post: "coxswain", front: 20, side: 20, rear: 20 }], gunShields: [{ mount: "rearPintle", dr: 35 }],
  },
  // Improved brakes and run-flat tyres (p. 242).
  "AM General M1025": { improvedBrakes: true, runFlat: true },
  "Boeing M998 Avenger": { turretReadies: 2, improvedBrakes: true, runFlat: true, iff: true },
  "O'Gara-Hess & Eisenhardt M1114": { improvedBrakes: true, runFlat: true },
  "MSG GMV": { improvedBrakes: true, runFlat: true },
  "Sadler Piranha": { fireSuppression: true },
  // Early laminate on the body and turret fronts, treated as spaced; fire suppression; smoke dischargers (p. 244).
  "Uralvagonzavod T-72A": {
    turretReadies: 3, searchlightMiles: 0.75, smokeDischargers: true, fireSuppression: true, intercom: true,
    spaced: [{ part: "hull", arcs: FRONT }, { part: "turret", arcs: FRONT }],
  },
});

// ── components (pp. 228-229) ──

/** A gun port: -1 to skill, a 30-degree arc, Bulk no worse than -5, -7 to hit the shooter from outside (p. 228). */
export const GUN_PORT = Object.freeze({ skill: -1, arcDegrees: 30, worstBulk: -5, fromOutside: -7, mostPenalty: -4 });

/** Whether a weapon of this Bulk can be fired from a gun port. */
export function fitsGunPort(bulk: number): boolean {
  return (Number(bulk) || 0) >= GUN_PORT.worstBulk;
}

/** A gun port's penalty to hit the shooter, from -4 to -7. */
export function gunPortPenalty(penalty: number | undefined): number {
  const n = Math.trunc(Number(penalty) || GUN_PORT.fromOutside);
  return Math.max(GUN_PORT.fromOutside, Math.min(GUN_PORT.mostPenalty, n));
}

/**
 * A searchlight (p. 228): it lights a circle two yards across per mile of
 * range (a radius of two yards a mile), the beam is spotted at twice its
 * range, and its blinding attack has Acc 12 on DX and ignores darkness.
 */
export const SEARCHLIGHT = Object.freeze({ yardsPerMile: 2, spottedFactor: 2, accuracy: 12, blindedDice: "1d" });
export function searchlightRadius(miles: number): number {
  return Math.round(Math.max(0, Number(miles) || 0) * SEARCHLIGHT.yardsPerMile * 100) / 100;
}

/** The Ready maneuvers a turret takes to turn so many degrees: its per-facing figure per 60 degrees (p. 228). */
export function turretReadies(perFacing: number, degrees: number): number {
  const facings = Math.ceil(Math.min(180, Math.max(0, Math.abs(Number(degrees) || 0))) / 60);
  return Math.max(0, Math.floor(Number(perFacing) || 0)) * facings;
}

/** Linked weapons fire as one with the sum of their RoF (p. 229). */
export function linkedRateOfFire(own: number, others: number): number {
  return Math.max(1, Math.floor(Number(own) || 1)) + Math.max(0, Math.floor(Number(others) || 0));
}

/**
 * A smoke discharger's screen (p. 229): 50 yards wide, 25 high and 25 deep,
 * 50 yards off the face it was fired from; three seconds to form, 1-4 minutes
 * to disperse.
 */
export const SMOKESCREEN = Object.freeze({ wide: 50, high: 25, deep: 25, yards: 50, forms: 3, disperses: "1d4" });

/** Sound baffling: -(TL-4) to hear the vehicle (p. 229). */
export function soundBaffling(tl: number): number {
  return -Math.max(0, Math.floor(Number(tl) || 0) - 4);
}

// ── protection (pp. 229, 234-235) ──

/** An extinguisher's or a fire-suppression system's roll: TL+2 or TL+4 or less on 3d (p. 229). */
export function extinguishTarget(tl: number, suppression: boolean): number {
  return Math.floor(Number(tl) || 0) + (suppression ? 4 : 2);
}
/** A fire-suppression system tries again two seconds after a failure (p. 229). */
export const SUPPRESSION_RETRY_SECONDS = 2;

/** Run-flat tyres running flat: -1 Handling, Move less 20%, for TL squared miles (p. 229). */
export const RUN_FLAT = Object.freeze({ handling: -1, moveFactor: 0.8 });
export function runFlatMiles(tl: number): number {
  const t = Math.max(0, Math.floor(Number(tl) || 0));
  return t * t;
}

/** A Move run on flat run-flat tyres, rounded down to a tenth. */
export function runFlatMove(move: number): number {
  return Math.floor(Math.max(0, Number(move) || 0) * RUN_FLAT.moveFactor * 10 + 1e-9) / 10;
}

/** The flats CTIS copes with: two on a four- or six-wheeler, three on an eight-wheeler (p. 229). */
export function ctisCopes(flats: number, wheels: number): boolean {
  const most = wheels >= 8 ? 3 : 2;
  return Math.max(0, Math.floor(Number(flats) || 0)) <= most;
}

/** How a vehicle with some tyres flat runs: as it was, on its run-flats, or on the Basic Set's own flat tyres. */
export function flatTyres(fit: VehicleFit, flats: number, wheels: number): "none" | "ctis" | "runFlat" | "flat" {
  if (Math.max(0, Math.floor(Number(flats) || 0)) === 0) return "none";
  if (fit.ctis && ctisCopes(flats, wheels)) return "ctis";
  return fit.runFlat ? "runFlat" : "flat";
}

/** An airbag: DR 10 against a collision or fall above Move 5, and DX-2 a turn to get free (p. 229). */
export const AIRBAG = Object.freeze({ dr: 10, aboveMove: 5, escape: -2 });
export function airbagsFire(speed: number): boolean {
  return (Number(speed) || 0) > AIRBAG.aboveMove;
}

/** Improved brakes: +1 to Driving rolls to keep control while braking hard (p. 229). */
export const IMPROVED_BRAKES = 1;

/** High-Tech's armour made against shaped charges (p. 229), in the shared engine's terms. */
export const HT_SHAPED_ARMOUR: ShapedArmourTable = Object.freeze({
  book: "high-tech",
  kinds: Object.freeze({ spaced: { multiplier: 1.5, negatesHesh: true }, laminated: { multiplier: 2, negatesHesh: true } }),
});

/** The locations that are a vehicle's turret; the rest of what has DR is its hull. */
const TURRETS: ReadonlySet<string> = new Set(["mainTurret", "independentTurret"]);

/** Whether a stretch of armour is where a shot landed, from the arc it came in on (no arc is the front). */
export function spotCovers(spot: ArmourSpot, location: string, arc: string | null): boolean {
  const part = spot.part === "all" || (spot.part === "turret" ? TURRETS.has(location) : !TURRETS.has(location));
  return part && (!spot.arcs?.length || spot.arcs.includes((arc ?? "front") as Arc));
}

/** The kind of armour made against shaped charges at a spot: laminated before spaced, since it is the better. */
export function armourKindAt(fit: VehicleFit, location: string, arc: string | null): "" | "spaced" | "laminated" {
  if ((fit.laminated ?? []).some((s) => spotCovers(s, location, arc))) return "laminated";
  if ((fit.spaced ?? []).some((s) => spotCovers(s, location, arc))) return "spaced";
  if ((fit.skirts ?? []).some((s) => spotCovers(s, location, arc))) return "spaced";
  return "";
}

/** The skirts at a spot. */
export function skirtsAt(fit: VehicleFit, location: string, arc: string | null): Skirt[] {
  return (fit.skirts ?? []).filter((s) => spotCovers(s, location, arc));
}

/** What a shot is, as spaced and laminated armour meet it. */
export type Charge = "shaped" | "hesh" | null;

/** The projectiles High-Tech's loads name that are shaped charges (pp. 169-170, 182-183). */
const SHAPED_PROJECTILES: ReadonlySet<string> = new Set(["heat", "hedp", "msheat"]);

/**
 * What a shot is: a shaped charge where its load is HEAT, HEDP or MS-HEAT, or
 * its name says HEAT or HEDP, or its line is the crushing (10) jet the tables
 * print a shaped charge's warhead as; HESH where its load or name says so.
 */
export function chargeOf(options: { projectile?: string | undefined; names?: readonly string[] | undefined; damageType?: string | undefined; armorDivisor?: number | undefined; explosive?: boolean | undefined }): Charge {
  const projectile = String(options.projectile ?? "");
  if (SHAPED_PROJECTILES.has(projectile)) return "shaped";
  if (projectile === "hesh") return "hesh";
  const names = (options.names ?? []).map((n) => String(n ?? ""));
  if (names.some((n) => /\bHESH\b/i.test(n))) return "hesh";
  if (names.some((n) => /\b(MS-)?HEAT\b|\bHEDP\b/i.test(n))) return "shaped";
  if (options.explosive !== false && String(options.damageType ?? "") === "cr" && (Number(options.armorDivisor) || 1) >= 10) return "shaped";
  return null;
}

/**
 * Riveted armour's spall (p. 235): a blow of 20 or more that doesn't get
 * through, then 1-3 on 1d, then the Occupant Hit Table; the crewman hit
 * takes 2d cutting.
 */
export const RIVET_SPALL = Object.freeze({ damage: 20, onOrUnder: 3, dice: "2d", damageType: "cut" });
export function rivetsMayFly(basicDamage: number, penetrating: number): boolean {
  return (Number(basicDamage) || 0) >= RIVET_SPALL.damage && (Number(penetrating) || 0) <= 0;
}

// ── crew (pp. 234-235) ──

/** Riding in a TL6 tank: 1 FP an hour, none with your head outside; fighting in one, 1 FP every 10 minutes (p. 234). */
export function rideFatigue(hours: number, headOut: boolean): number {
  return headOut ? 0 : Math.max(0, Math.floor(Number(hours) || 0));
}
export function combatFatigue(seconds: number): number {
  return Math.max(0, Math.floor((Number(seconds) || 0) / 600));
}

/**
 * Hearing in a tank (p. 234): the crew hear each other at -4 while the motor
 * runs, unless they have headsets; they hear outside at -10 while it runs,
 * -3 while it doesn't.
 */
export function tankHearing(options: { motorRunning: boolean; intercom: boolean; outside: boolean }): number {
  if (options.outside) return options.motorRunning ? -10 : -3;
  return options.motorRunning && !options.intercom ? -4 : 0;
}

/** Buttoned up: -2 to Vision, nothing seen within five yards (p. 234). */
export const BUTTONED_UP = Object.freeze({ vision: -2, blindYards: 5 });

/** Each crew post's arc of vision buttoned up, in degrees (p. 234). */
export const BUTTONED_ARCS = Object.freeze({ loader: 0, gunner: 60, driver: 90, commander: 360 });
