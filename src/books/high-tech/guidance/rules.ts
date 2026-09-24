/**
 * Fuzes and guidance from the supplement Electricity and Electronics
 * (HT:EE pp. 48-49), part of High-Tech (decision E1 in #471): the figures
 * `index.ts` wires to the system under `electronicFuzes` and `homingSeekers`.
 *
 * Nothing here reads Ultra-Tech's homing projectiles: a GM may use High-Tech
 * without Ultra-Tech (D1 in #335), and the supplement's seekers are its own.
 */

// ── fuzes (HT:EE p. 48) ─────────────────────────────────────────────────────

export const FUZE_KINDS = ["impact", "proximity", "time"] as const;
export type FuzeKind = (typeof FUZE_KINDS)[number];

/**
 * A proximity fuze's small radar notices a target out to 25 yards and sets
 * the charge off at whatever distance it was set to (HT:EE p. 48).
 */
export const PROXIMITY_DETECTION_YARDS = 25;

/** A time fuze counts down from any setting up to three minutes after firing (HT:EE p. 48). */
export const TIME_FUZE_MAX_SECONDS = 180;

/**
 * Improvising a time fuze from a clock and a few electronic parts is a roll
 * against Explosives (Demolition) (HT:EE p. 48).
 */
export const IMPROVISED_TIME_FUZE = { skill: "Explosives (Demolition)", modifier: 0 } as const;

/** The supplement's fuze records, by their names in the pack (HT:EE p. 48; TL7, and TL8 at half the weight). */
export const FUZE_RECORDS: Readonly<Record<string, FuzeKind>> = Object.freeze({
  "Impact Fuze (TL7)": "impact",
  "Impact Fuze (TL8)": "impact",
  "Proximity Fuze (TL7)": "proximity",
  "Proximity Fuze (TL8)": "proximity",
  "Time Fuze (TL7)": "time",
  "Time Fuze (TL8)": "time",
});

/**
 * The clocks and watches the books sell, any of which can be made into a time
 * fuze: High-Tech's time clocks (p. 188) and timepieces (p. 31), and the
 * supplement's electronic watches (HT:EE p. 39).
 */
export const CLOCKS: readonly string[] = Object.freeze([
  "Mechanical Clock",
  "Electronic Clock",
  "Pocket Watch",
  "Wristwatch",
  "Gadget Wristwatch",
  "Electronic Watch",
  "Digital Watch",
]);

/** A fuze record's kind, by its name; also "Impact Fuze" and the like without a TL. */
export function fuzeKind(name: string): FuzeKind | null {
  const trimmed = String(name ?? "").trim();
  if (FUZE_RECORDS[trimmed]) return FUZE_RECORDS[trimmed]!;
  const m = /^(impact|proximity|time) fuze\b/i.exec(trimmed);
  return m ? (m[1]!.toLowerCase() as FuzeKind) : null;
}

/** Whether a record is a clock or watch a time fuze can be improvised from. */
export const isClock = (name: string): boolean => CLOCKS.includes(String(name ?? "").trim());

/** A proximity fuze's setting: a whole number of yards, at least 1 and no farther than it detects. */
export function proximitySetting(yards: unknown): number {
  const n = Math.floor(Number(yards) || 0);
  return Math.max(1, Math.min(PROXIMITY_DETECTION_YARDS, n));
}

/** A time fuze's setting: whole seconds, at least 1 and at most three minutes. */
export function timeSetting(seconds: unknown): number {
  const n = Math.floor(Number(seconds) || 0);
  return Math.max(1, Math.min(TIME_FUZE_MAX_SECONDS, n));
}

/**
 * Whether a proximity fuze sets its charge off with something this far away:
 * it must be close enough to be detected at all, and within the set distance.
 */
export function proximityTriggers(yards: number | null, setting: number): boolean {
  if (yards === null || !Number.isFinite(yards)) return false;
  return yards <= PROXIMITY_DETECTION_YARDS && yards <= proximitySetting(setting);
}

/** Whether a time fuze has run out, `elapsed` seconds after it was set. */
export const timeFuzeFires = (elapsed: number, setting: number): boolean => elapsed >= timeSetting(setting);

// ── homing weapons (HT:EE p. 49; Campaigns pp. 412-413) ─────────────────────

/** The ways a homing weapon finds its target, as the supplement lists them (HT:EE p. 49). */
export const SEEKERS = ["acoustic", "infrared", "lidar", "radar", "rdf", "laser"] as const;
export type Seeker = (typeof SEEKERS)[number];

/**
 * The seeker chosen for an attack. `infraredHull` is an infrared seeker
 * tracking a warm hull rather than a hot exhaust, and `acousticVitals` an
 * advanced acoustic torpedo homing on propulsion and steering.
 */
export const SEEKER_CHOICES = ["acoustic", "acousticVitals", "infrared", "infraredHull", "lidar", "radar", "rdf", "laser"] as const;
export type SeekerChoice = (typeof SEEKER_CHOICES)[number];

/** The skill a homing missile attacks with, whoever fired it (Campaigns p. 413; HT:EE p. 49). */
export const HOMING_SKILL = 10;

/** The operator's lock-on roll (Campaigns p. 413). */
export const HOMING_AIMING_SKILL = "Artillery (Guided Missile)";

/** An infrared seeker tracking a warm hull instead of hot exhaust (HT:EE p. 49). */
export const WARM_HULL_PENALTY = -2;

/**
 * An advanced acoustic torpedo may go for the propulsion and steering, which
 * count as the vital area (HT:EE p. 49): the Vehicle Hit Location Table's
 * penalty for aiming at it (Campaigns p. 554).
 */
export const VITAL_AREA_PENALTY = -3;

/** The skill a laser designator is held on the target with: Forward Observer, DX-based (Campaigns p. 412). */
export const DESIGNATOR_SKILL = "Forward Observer";

/**
 * The seekers of High-Tech's homing missiles, by record (High-Tech p. 152):
 * the Sidewinder and Stinger home on infrared, the Javelin on an infrared
 * image, which the supplement counts as infrared.
 */
export const MISSILE_SEEKERS: Readonly<Record<string, readonly Seeker[]>> = Object.freeze({
  "Ford AIM-9L Sidewinder, 127mm": ["infrared"],
  "GD FIM-92A Stinger, 70mm": ["infrared"],
  "RLM FGM-148A Javelin, 127mm": ["infrared"],
});

/** A record's seekers, where the book says them. */
export const seekersOf = (name: string): readonly Seeker[] => MISSILE_SEEKERS[String(name ?? "").trim()] ?? [];

/** The seeker a choice attacks with. */
export function seekerOf(choice: SeekerChoice): Seeker {
  if (choice === "infraredHull") return "infrared";
  if (choice === "acousticVitals") return "acoustic";
  return choice;
}

/** The line a choice puts on the homing attack, or null. */
export function seekerModifier(choice: SeekerChoice): { key: "warmHull" | "vitalArea"; value: number } | null {
  if (choice === "infraredHull") return { key: "warmHull", value: WARM_HULL_PENALTY };
  if (choice === "acousticVitals") return { key: "vitalArea", value: VITAL_AREA_PENALTY };
  return null;
}

/**
 * The tags a seeker puts on the attack roll, so what blinds that sense (smoke
 * against infrared, a radar jammer, silence against sonar) can name it
 * (Campaigns p. 412: visibility is judged by the homing sense).
 */
export function seekerTags(seeker: Seeker): string[] {
  switch (seeker) {
    case "acoustic": return ["acoustic", "sonar"];
    case "infrared": return ["infrared"];
    case "lidar": return ["lidar", "laser"];
    case "radar": return ["radar"];
    case "rdf": return ["radio"];
    case "laser": return ["laser", "semiActive"];
  }
}

/** A choice read from an attack option's value, or null for one it doesn't know. */
export function seekerChoice(value: unknown): SeekerChoice | null {
  return (SEEKER_CHOICES as readonly string[]).includes(String(value)) ? (value as SeekerChoice) : null;
}

/** Whether a stored or derived mode homes: the system's `guidance`. */
export const homes = (mode: any): boolean => String(mode?.guidance ?? "") === "homing";

/**
 * A DX-based roll on an IQ-based skill (Campaigns p. 172): the level less IQ
 * plus DX; the default, IQ-5, becomes DX-5.
 */
export function dxBased(level: number | null, iq: number, dx: number): number {
  return level === null ? dx - 5 : level - iq + dx;
}
