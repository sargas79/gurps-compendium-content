/**
 * High-Tech's survival, maritime and parachuting gear and its snacks, as pure
 * rules (pp. 34-35, 56-61). What the system meets them through is in
 * `index.ts`.
 *
 *   - **Shelters (pp. 56-57):** each shelter and each piece of sleeping gear
 *     has a modifier to the HT (or HT-based Survival) roll against freezing
 *     weather; a camper with none of it is at -5. The gear's quality adds to
 *     its modifier.
 *   - **Fire starters (p. 57):** building a fire from natural materials is a
 *     DX-based Survival roll, and most starters give +5 to +10 to it -- so
 *     much that the roll is only for bad conditions.
 *   - **Fishing and trapping (p. 58):** a fisherman or trapper makes up to
 *     five Fishing or Survival rolls a day to forage. A spring trap has an ST;
 *     it strikes for thrust+2 crushing at that ST, and its victim breaks free
 *     against that ST.
 *   - **Survival kits (p. 58):** a kit is made for one Survival specialty. A
 *     land kit used on water, or the other way round, is -3; a kit for
 *     another specialty of the same kind is -1 where the two are similar and
 *     -2 where they are very different; an Urban Survival kit counts as its
 *     own kind, -3 either way.
 *   - **Water (p. 59):** a filter gives +(TL-2) to the HT roll against the
 *     bacteria in the water drunk through it; a hand-pumped desalinator makes
 *     a cup of fresh water (the large model a quart) for 10 minutes' pumping
 *     and 1 FP; a solar still yields a quart a day on a Survival roll.
 *   - **Rescue signals (p. 58) and the dye marker (p. 60):** +2 to a
 *     rescuer's Vision roll to spot the signaller; the marker's patch lasts
 *     about half an hour.
 *   - **Life jackets (p. 59):** +6 to Swimming rolls to keep from drowning,
 *     -3 in a Quick Contest of Swimming.
 *   - **Swim fins (p. 60):** Move on land falls to 2.
 *   - **Parachutes (p. 61):** a Parachuting roll to use one; the canopy opens
 *     80 yards after the ripcord is pulled (the mini-parachute's in half
 *     that), and a jumper who lands first arrives at half the fall's
 *     velocity; open, the chute comes down at 5 yards a second, 1 more for
 *     every 50 lbs. over its rated weight, and at 120% of that weight it
 *     fails. The earliest chutes call for a HT-4 roll against nausea.
 *   - **Death from Above (p. 61):** shooting while coming down under a canopy
 *     is a Move and Attack at the lower of Parachuting and the weapon's skill.
 *   - **Snacks and sports drinks (p. 35):** a snack counts as a decent meal
 *     when resting (+1 FP); a sports drink does the same and counts as a
 *     quart of water.
 */

// ── shelters (pp. 56-57) ──

/** The cold roll's modifier for a camper with no shelter or sleeping gear at all (p. 56). */
export const NO_SHELTER = -5;

/** A piece of shelter or sleeping gear the camper has with them. */
export interface ShelterGear {
  name: string;
  /** Its printed modifier to the cold roll. */
  modifier: number;
  /** Its quality's bonus, which adds to it (p. 56). */
  quality: number;
}

/**
 * The cold roll's shelter line for a camper (p. 56): the best of the gear
 * they have, its quality added, or -5 with none. A tent and a sleeping bag
 * are not added together: the book gives each a modifier of its own and says
 * nothing of stacking them, so the best one counts.
 */
export function shelterLine(gear: readonly ShelterGear[]): { value: number; gear: ShelterGear | null } {
  let best: ShelterGear | null = null;
  for (const g of gear) if (!best || g.modifier + g.quality > best.modifier + best.quality) best = g;
  return best ? { value: best.modifier + best.quality, gear: best } : { value: NO_SHELTER, gear: null };
}

/** A shelter's modifier at the TL it is made at: the sleeping bag's improves at TL8 (p. 56). */
export function shelterModifier(value: number, valueAtTl8: number | null, tl: number): number {
  return valueAtTl8 !== null && tl >= 8 ? valueAtTl8 : value;
}

// ── fire starters (p. 57) ──

/** The fire starters' bonus to build a fire, lowest and highest (p. 57). */
export const FIRE_STARTER_BONUS = Object.freeze({ least: 5, most: 10 });

/** Survival's attribute and its default (Characters p. 224). */
export const SURVIVAL_ATTRIBUTE = "Per";
export const SURVIVAL_DEFAULT = -5;

/**
 * The DX-based Survival level a fire is built at (p. 57): a Survival skill
 * rebased from Per to DX, or DX-5 by default.
 */
export function fireBuildingLevel(dx: number, per: number, survival: number | null): number {
  return survival === null ? dx + SURVIVAL_DEFAULT : survival - per + dx;
}

// ── fishing and trapping (p. 58) ──

/** The foraging rolls a fisherman or trapper may make in a day (p. 58; Foraging, Campaigns p. 427). */
export const FORAGING_ROLLS_A_DAY = 5;

/** A spring trap's blow: thrust+2 crushing at its own ST (p. 58). */
export const TRAP_DAMAGE_ADDS = 2;

/** Each foraging attempt takes an hour, during which a march makes no progress (p. 55). */
export const FORAGING_HOURS = 1;

/**
 * The foraging roll a day's count allows (p. 58): the first five, counted
 * afresh each day of world time; null past the fifth.
 */
export function foragingAttempt(count: { day: number; rolls: number } | null, day: number): number | null {
  const used = count && count.day === day ? count.rolls : 0;
  return used < FORAGING_ROLLS_A_DAY ? used + 1 : null;
}

// ── survival kits (p. 58) ──

/** The Survival specialties by kind (Characters p. 224). */
export const LAND_SPECIALTIES = ["arctic", "desert", "island/beach", "jungle", "mountain", "plains", "swampland", "woodlands"] as const;
export const WATER_SPECIALTIES = ["bank", "deep ocean vent", "fresh-water lake", "open ocean", "reef", "river/stream", "salt-water sea", "tropical lagoon"] as const;

/** A kit for the other kind (land or water), or an Urban Survival kit used in the wild or the other way round. */
export const OTHER_KIND = -3;
/** A kit for a similar specialty of the same kind. */
export const SIMILAR_SPECIALTY = -1;
/** A kit for a very different specialty of the same kind. */
export const DIFFERENT_SPECIALTY = -2;

/**
 * The specialties the book itself counts as similar (p. 58): an arctic kit in
 * the mountains. Any other pair is "very different" unless the kit's own list
 * says otherwise, which is the GM's to fill in.
 */
export const SIMILAR_BY_DEFAULT: ReadonlyArray<readonly [string, string]> = [["arctic", "mountain"]];

export type SurvivalKind = "land" | "water" | "urban";

/**
 * Which Survival a skill name is: "urban" for Urban Survival, otherwise the
 * specialty (lower case) and its kind. Null for any other skill, or a
 * Survival specialty the book doesn't list.
 */
export function survivalOf(name: string): { kind: SurvivalKind; specialty: string } | null {
  const text = String(name ?? "").replace(/\/TL[\d^]*/gi, "").trim().toLowerCase();
  if (/^urban survival\b/.test(text)) return { kind: "urban", specialty: "urban" };
  const match = /^survival\s*\(\s*([^)]*?)\s*\)$/.exec(text);
  if (!match) return null;
  const specialty = match[1]!.replace(/\s+/g, " ");
  if ((LAND_SPECIALTIES as readonly string[]).includes(specialty)) return { kind: "land", specialty };
  if ((WATER_SPECIALTIES as readonly string[]).includes(specialty)) return { kind: "water", specialty };
  return null;
}

/** The specialties a list of names (a kit's "similar" field) names, lower case. */
export function specialtyList(value: unknown): string[] {
  return String(value ?? "").split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * What a kit made for one Survival specialty is worth to a roll of another
 * (p. 58), before its quality; null where it is the kit's own specialty (the
 * system counts it) or either isn't a Survival specialty.
 */
export function kitMismatch(kitSkill: string, rolled: string, similar: readonly string[] = []): number | null {
  const kit = survivalOf(kitSkill);
  const roll = survivalOf(rolled);
  if (!kit || !roll || kit.specialty === roll.specialty) return null;
  if (kit.kind !== roll.kind) return OTHER_KIND;
  const pair = (a: string, b: string) => (x: readonly [string, string]) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a);
  const alike = similar.includes(roll.specialty) || SIMILAR_BY_DEFAULT.some(pair(kit.specialty, roll.specialty));
  return alike ? SIMILAR_SPECIALTY : DIFFERENT_SPECIALTY;
}

/** A survival kit the character carries: the specialties it is for, its quality, and what the GM counts as similar. */
export interface CarriedSurvivalKit {
  skills: string[];
  quality: number;
  similar: string[];
}

/**
 * The equipment line for a Survival roll made with a kit for somewhere else
 * (p. 58): the best of the kits carried, the mismatch added to its quality,
 * or null where no carried kit says anything about this specialty.
 */
export function survivalKitLine(kits: readonly CarriedSurvivalKit[], rolled: string): number | null {
  let best: number | null = null;
  for (const kit of kits) {
    for (const skill of kit.skills) {
      const mismatch = kitMismatch(skill, rolled, kit.similar);
      if (mismatch === null) continue;
      const value = kit.quality + mismatch;
      if (best === null || value > best) best = value;
    }
  }
  return best;
}

// ── water (p. 59) ──

/** A water filter's bonus to HT against the bacteria in the water: TL-2 (p. 59), never below 0. */
export function waterFilterBonus(tl: number): number {
  return Math.max(0, Math.floor(tl) - 2);
}

/** The charcoal-filtered canteen: +2 to HT drinking bacteria-ridden water (p. 53). */
export const CHARCOAL_CANTEEN = /^charcoal-filtered canteen$/i;
export const CHARCOAL_CANTEEN_BONUS = 2;

/** A hand-pumped desalinator (p. 59): 10 minutes' pumping for 1 FP; the large model costs and weighs three times as much. */
export const DESALINATOR = Object.freeze({ minutes: 10, fp: 1, largeMultiplier: 3 });

// ── rescue signals and the dye marker (pp. 58, 60) ──

/** What a rescue signal or a dye marker gives the rescuer's Vision roll (pp. 58, 60). */
export const SIGNAL_VISION = 2;

/**
 * Whether a rescue signal seen out to `range` yards (0 where the book gives
 * none) reaches a rescuer `yards` away (null where the distance isn't known):
 * a signal mirror 50 miles, a strobe 2, a laser flare 10 (p. 58).
 */
export function signalSeen(range: number, yards: number | null): boolean {
  return !(range > 0) || yards === null || yards <= range;
}

/** A whistle is heard on an unmodified Hearing roll at 128 yards (p. 58). */
export const WHISTLE_HEARD_AT = 128;

/** How long a dye marker's patch lasts in ordinary seas: about half an hour (p. 60). */
export const DYE_MARKER_SECONDS = 1800;

// ── life jackets and swim fins (pp. 59-60) ──

/** A life jacket's +6 to Swimming against drowning, and -3 in a race (p. 59). */
export const LIFE_JACKET = Object.freeze({ drowning: 6, race: -3 });

/** Cork life jackets (TL5): -3 to the Swimming roll against injury on first entering the water (p. 59). */
export const CORK_JACKET = Object.freeze({ tl: 5, entering: -3 });

/** Swim fins on land: Move 2 (p. 60). */
export const FINS_LAND_MOVE = 2;

/** Swim fins' Enhanced Move 0.5 (Water): water Move x1.5 (p. 60; Characters p. 52). */
export const FINS_WATER_MULTIPLIER = 1.5;

/** The line that takes a Move down to what swim fins leave on land, or 0 where it is already there. */
export function finsMoveLine(move: number): number {
  return Math.min(0, FINS_LAND_MOVE - Math.max(0, Math.floor(move)));
}

// ── parachutes (p. 61) ──

/** The fall before a chute opens (p. 61); the mini-parachute's is half. */
export const OPENING_YARDS = 80;
/** A round chute's rate of descent once open, in yards a second (p. 61). */
export const DESCENT = 5;
/** Every so many pounds over the rated weight adds a yard a second (p. 61). */
export const OVERLOAD_STEP_LBS = 50;
/** At this share of its rated weight a chute fails (p. 61). */
export const FAILING_LOAD = 1.2;
/** Seconds to put a parachute on and to take it off (p. 61). */
export const DON_SECONDS = 10;
export const DOFF_SECONDS = 2;

/** A parachute's data. */
export interface Chute {
  /** Maximum suspended weight, lbs. */
  maxLbs: number;
  /** The rated weight where the item is made at TL7 or TL8, 0 where the same (p. 61). */
  maxLbsTl7: number;
  maxLbsTl8: number;
  /** Yards fallen before the canopy is open. */
  openingYards: number;
  /** Yards a second once open; 0 where the book gives none (a ram-air chute flies). */
  descent: number;
}

/** A chute's rated weight at the TL it is made at (p. 61). */
export function ratedWeight(chute: Chute, tl: number): number {
  if (tl >= 8 && chute.maxLbsTl8 > 0) return chute.maxLbsTl8;
  if (tl >= 7 && chute.maxLbsTl7 > 0) return chute.maxLbsTl7;
  return chute.maxLbs;
}

/**
 * How fast a chute brings its load down (p. 61): its descent, plus a yard a
 * second for each full 50 lbs. over its rated weight; null where the load is
 * 120% of the rating or more and the chute fails. A chute with no rating
 * printed (the mini-parachute) comes down at its descent whatever it carries.
 */
export function landingSpeed(descent: number, rated: number, load: number): number | null {
  if (rated <= 0) return descent;
  if (load >= rated * FAILING_LOAD) return null;
  const over = Math.max(0, load - rated);
  return descent + Math.floor(over / OVERLOAD_STEP_LBS);
}

/**
 * A jump (p. 61): whether the jumper reaches the ground before the canopy
 * opens, and if so at what velocity -- half what the fall would give,
 * `fallVelocity` being the system's falling velocity for the yards fallen.
 */
export function jumpOutcome(heightYards: number, openingYards: number, fallVelocity: (yards: number) => number): { opens: boolean; velocity: number } {
  const height = Math.max(0, heightYards);
  if (height >= openingYards) return { opens: true, velocity: 0 };
  return { opens: false, velocity: Math.max(1, Math.round(fallVelocity(height) / 2)) };
}

/** The earliest chutes' roll against nausea: HT-4 (p. 61). */
export const EARLY_CHUTE_NAUSEA = -4;

/** From TL8 a barometric device opens the canopy at a preset height, usually 1,000' (p. 61). */
export const AUTO_DEPLOY = Object.freeze({ tl: 8, yards: Math.round(1000 / 3) });

/**
 * Where the canopy starts to open, in yards above the ground: where the
 * ripcord is pulled, or for a jumper who never pulls it, the barometric
 * device's height (or at once, lower than that) -- or 0, the whole fall,
 * with no device (p. 61).
 */
export function pullHeight(heightYards: number, pulls: boolean, autoDeploy: boolean): number {
  const height = Math.max(0, Number(heightYards) || 0);
  if (pulls) return height;
  return autoDeploy ? Math.min(height, AUTO_DEPLOY.yards) : 0;
}

/** Seconds under an open canopy: from where it is fully open to the ground (p. 61). */
export function descentSeconds(pullYards: number, openingYards: number, speed: number): number {
  if (!(speed > 0)) return 0;
  return Math.max(0, (Math.max(0, pullYards) - Math.max(0, openingYards)) / speed);
}

/** How far the wind carries a chute in that time: it drifts with the wind (p. 61). */
export function driftYards(seconds: number, windMph: number): number {
  return Math.round(Math.max(0, seconds) * Math.max(0, windMph) * (1760 / 3600));
}

/** A ram-air chute glides at Move 15 over the ground, up to 35 with a good tailwind high up (p. 61). */
export const RAM_AIR_GLIDE = Object.freeze({ move: 15, tailwind: 35 });

/** A reserve chute: +$250 and 15 lbs. (p. 61). */
export const RESERVE_CHUTE = Object.freeze({ cost: 250, weight: 15 });

/** Guided parachute delivery steers to within a few dozen yards at Move 10-15, up to 5 tons; the infiltration pod carries 500 lbs. (p. 61). */
export const GUIDED_DELIVERY = Object.freeze({ moveLow: 10, moveHigh: 15, tons: 5 });
export const INFILTRATION_POD_LBS = 500;

/**
 * Death from Above (p. 61): the lower of Parachuting and the weapon's skill,
 * as a line on the weapon's roll (0 where Parachuting is no lower).
 */
export function deathFromAboveLine(weaponSkill: number, parachuting: number): number {
  return Math.min(0, Math.floor(parachuting) - Math.floor(weaponSkill));
}

/** Parachuting's defaults: DX-4 or IQ-6 (Characters p. 212). */
export const PARACHUTING_DEFAULT = -4;
export const PARACHUTING_IQ_DEFAULT = -6;

// ── snacks and sports drinks (p. 35) ──

/** What a snack is worth to a rest: a decent meal's extra FP (p. 35; Campaigns p. 427). */
export const SNACK_REST_FP = 1;

/**
 * A snack eaten on the move, at the GM's option: 1 FP back now, and 2 FP
 * lost two hours later (p. 35).
 */
export const SNACK_ON_THE_MOVE = Object.freeze({ fp: 1, crashFp: 2, crashHours: 2 });

/** The crashes due by a world time, and those still to come. */
export function dueCrashes<T extends { at: number }>(pending: readonly T[], now: number): { due: T[]; later: T[] } {
  return { due: pending.filter((p) => p.at <= now), later: pending.filter((p) => p.at > now) };
}
