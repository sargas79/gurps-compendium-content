/**
 * The Electricity and Electronics supplement's electric light (HT:EE pp. 9,
 * 20-22): how bright a lamp is, how its light falls off, what darkness it
 * leaves, and the glare of light far brighter than the eyes are used to.
 *
 * Light is measured in lux, read against the Illumination Levels table
 * (HT:EE p. 20). Each row of the table is a step: the rows run 0.05, 0.2, 1,
 * 5, 20 and 100 lux for darkness penalties of -5 to 0, and on to 500, 2,000,
 * 10,000 and 50,000 lux with no penalty. The rows repeat a pattern -- times
 * 4, 5 and 5, a hundredfold every three rows -- and the supplement's own
 * figures past the table sit on it: glare from 200,000 lux (step 10), an arc
 * flash's 1,000,000 lux one step past that, at -1 to HT (HT:EE p. 9). So the
 * steps here run on either side of the table by that pattern.
 */

/** The lux of the table's first row, step 0: -5 (HT:EE p. 20). */
const FIRST_ROWS = [0.05, 0.2, 1] as const;

/** The lux at a step of the Illumination Levels table, extended by its own pattern (HT:EE p. 20). */
export function stepLux(step: number): number {
  const s = Math.trunc(step);
  const within = ((s % 3) + 3) % 3;
  return FIRST_ROWS[within]! * 100 ** Math.floor(s / 3);
}

/** The step a light of this many lux reaches: the last row it comes up to; -Infinity for none. */
export function luxStep(lux: number): number {
  const l = Number(lux);
  if (!(l > 0) || !Number.isFinite(l)) return -Infinity;
  let step = Math.floor(3 * Math.log10(l / FIRST_ROWS[0]) / 2);
  // Correct the estimate against the rows themselves, allowing for rounding.
  while (stepLux(step + 1) <= l * (1 + 1e-9)) step += 1;
  while (stepLux(step) > l * (1 + 1e-9)) step -= 1;
  return step;
}

/** The step at which darkness ends: 100 lux, a very overcast day (HT:EE p. 20). */
export const NO_PENALTY_STEP = 5;

/** The worst partial darkness (Campaigns p. 394): a light never leaves total darkness where it reaches. */
export const WORST_PARTIAL_DARKNESS = 9;

/**
 * The darkness a step leaves, 0 (none) to 9: -5 to 0 from the table
 * (HT:EE p. 20), a point more for each step below it, never total darkness.
 */
export function stepDarkness(step: number): number {
  if (step >= NO_PENALTY_STEP) return 0;
  if (!Number.isFinite(step)) return WORST_PARTIAL_DARKNESS;
  return Math.min(WORST_PARTIAL_DARKNESS, NO_PENALTY_STEP - Math.trunc(step));
}

/**
 * How many steps a lamp's light loses this far from it: none within a yard,
 * one at 2 yards, two at 3-5, three at 6-10, and 3 more for each further
 * tenfold distance (HT:EE p. 20).
 */
export function falloffSteps(yards: number): number {
  const d = Math.max(0, Number(yards) || 0);
  if (d <= 1) return 0;
  if (d <= 2) return 1;
  if (d <= 5) return 2;
  if (d <= 10) return 3;
  return 3 + 3 * Math.ceil(Math.log10(d / 10) - 1e-9);
}

// ── lamps (HT:EE pp. 20-22) ──

/** The lighting elements of the Light Sources Table, with their relative efficiency (HT:EE p. 22). */
export const ELEMENTS = Object.freeze({
  arc: { tl: 6, efficiency: 0.5 },
  carbonFilament: { tl: 6, efficiency: 0.25 },
  neon: { tl: 6, efficiency: 3 },
  tungstenFilament: { tl: 6, efficiency: 1 },
  compactFluorescent: { tl: 8, efficiency: 5 },
  led: { tl: 8, efficiency: 6 },
  advancedLed: { tl: 8, efficiency: 20 },
});
export type Element = keyof typeof ELEMENTS;
export const ELEMENT_KEYS = Object.keys(ELEMENTS) as Element[];

/** The lamp types of the Illuminating Effect Table: what the rated wattage is multiplied by for lux (HT:EE p. 22). */
export const GEOMETRIES = Object.freeze({
  /** A 360° sphere, out to a 1-yard radius. */
  exposed: { multiplier: 1.5, beam: false },
  /** A 180° hemisphere, out to a 1-yard radius. */
  recessed: { multiplier: 3, beam: false },
  /** Aimed at a large area, a cone 2 yards wide. */
  conical: { multiplier: 6, beam: true },
  /** Aimed at a small area, a cone 32" wide. */
  closeRange: { multiplier: 30, beam: true },
});
export type Geometry = keyof typeof GEOMETRIES;
export const GEOMETRY_KEYS = Object.keys(GEOMETRIES) as Geometry[];

/** A lamp: its element, its geometry, its rated wattage, and for a beam how far it reaches. */
export interface Lamp {
  element: Element;
  geometry: Geometry;
  /** The rated wattage: what a tungsten filament bulb of the same light would draw (HT:EE p. 20). */
  watts: number;
  /**
   * A brighter element in place of the usual one: the rated wattage (and the
   * lux) times the element's efficiency, with the battery life or actual
   * wattage left as it was (HT:EE p. 21).
   */
  brighter: boolean;
  /** A beam's range in yards, 0 for a lamp that isn't a beam or has none printed. */
  range: number;
}

/**
 * The lamps the supplement prints, by record name, as each is usually fitted
 * (HT:EE pp. 20-22). Fixtures take a standard bulb, 40, 60 or 100 watts: 60
 * here, which the item sheet changes. The Yablochkov candle is an arc light,
 * which comes only at 100 rated watts; the carbon filament bulb's usual 60
 * watts is 15 rated.
 */
export const LAMPS: Readonly<Record<string, Lamp>> = Object.freeze({
  "Yablochkov Candle": { element: "arc", geometry: "exposed", watts: 100, brighter: false, range: 0 },
  "Carbon Filament Bulb": { element: "carbonFilament", geometry: "exposed", watts: 15, brighter: false, range: 0 },
  "Tungsten Filament Bulb": { element: "tungstenFilament", geometry: "exposed", watts: 60, brighter: false, range: 0 },
  "Fluorescent Light": { element: "compactFluorescent", geometry: "exposed", watts: 60, brighter: false, range: 0 },
  "Light-Emitting Diode Bulb": { element: "led", geometry: "exposed", watts: 60, brighter: false, range: 0 },
  "Floor Lamp": { element: "tungstenFilament", geometry: "exposed", watts: 60, brighter: false, range: 0 },
  "Table Lamp": { element: "tungstenFilament", geometry: "exposed", watts: 60, brighter: false, range: 0 },
  "Ceiling Lamp": { element: "tungstenFilament", geometry: "recessed", watts: 60, brighter: false, range: 0 },
  "Desk Lamp": { element: "tungstenFilament", geometry: "closeRange", watts: 60, brighter: false, range: 1 },
  "Spotlight": { element: "tungstenFilament", geometry: "conical", watts: 100, brighter: false, range: 100 },
  "Flashlight": { element: "tungstenFilament", geometry: "conical", watts: 1.5, brighter: false, range: 10 },
  "Rugged Flashlight": { element: "tungstenFilament", geometry: "conical", watts: 1.5, brighter: false, range: 10 },
  "Penlight": { element: "tungstenFilament", geometry: "conical", watts: 1, brighter: false, range: 1 },
});

/** The lamp a record is, by its name; null for anything else. */
export function lampNamed(name: unknown): Lamp | null {
  const lamp = LAMPS[String(name ?? "").trim()];
  return lamp ? { ...lamp } : null;
}

/** A lamp read from stored data, with anything missing or wrong taken from `fallback`. */
export function lampFrom(data: any, fallback: Lamp): Lamp {
  const d = data ?? {};
  const watts = Number(d.watts);
  const range = Number(d.range);
  return {
    element: ELEMENT_KEYS.includes(d.element) ? d.element : fallback.element,
    geometry: GEOMETRY_KEYS.includes(d.geometry) ? d.geometry : fallback.geometry,
    watts: watts > 0 ? watts : fallback.watts,
    brighter: typeof d.brighter === "boolean" ? d.brighter : fallback.brighter,
    range: range >= 0 && Number.isFinite(range) && d.range !== undefined && d.range !== null && d.range !== "" ? range : fallback.range,
  };
}

/** Whether a lamp throws a beam rather than lighting all round (HT:EE p. 22). */
export const isBeam = (lamp: Lamp): boolean => GEOMETRIES[lamp.geometry].beam;

/**
 * A lamp's lux in its 1-yard radius, or where its beam is focused: the rated
 * wattage times its geometry's multiplier, and times the element's efficiency
 * where a brighter element is fitted (HT:EE pp. 20-22).
 */
export function lampLux(lamp: Lamp): number {
  const brighter = lamp.brighter ? ELEMENTS[lamp.element].efficiency : 1;
  return Math.max(0, lamp.watts) * brighter * GEOMETRIES[lamp.geometry].multiplier;
}

/**
 * What an externally powered lamp actually draws: the rated wattage over the
 * efficiency, unless a brighter element keeps it (HT:EE p. 20).
 */
export function actualWatts(lamp: Lamp): number {
  if (lamp.brighter) return lamp.watts;
  return lamp.watts / ELEMENTS[lamp.element].efficiency;
}

/** What a battery-powered lamp's endurance is multiplied by: the efficiency, unless a brighter element spends it (HT:EE pp. 20-21). */
export function batteryMultiplier(lamp: Lamp): number {
  return lamp.brighter ? 1 : ELEMENTS[lamp.element].efficiency;
}

/** While a beam is in use, the darkness in the larger area around never passes -9 (HT:EE p. 20). */
export const BEAM_SPILL_DARKNESS = WORST_PARTIAL_DARKNESS;

/**
 * How wide a beam's cone is where it is focused, in yards: a conical beam 2
 * yards, a close-range beam 32 inches (HT:EE p. 22's Illuminating Effect
 * Table).
 */
export const BEAM_WIDTH: Readonly<Record<Geometry, number>> = Object.freeze({ exposed: 0, recessed: 0, conical: 2, closeRange: 32 / 36 });

/** The cone is never narrower than the lamp's own half yard either side of its axis. */
const BEAM_MIN_HALF_WIDTH = 0.5;

/**
 * Whether a spot lies in a lamp's beam: `along` yards ahead of the lamp on
 * its axis and `off` yards to one side. A beam lights only the area it is
 * aimed at (HT:EE p. 20): a cone widening evenly from the lamp to its width
 * at its range, and on at the same angle past it. A lamp lighting all round
 * lights every spot.
 */
export function inBeam(lamp: Lamp, along: number, off: number): boolean {
  if (!isBeam(lamp)) return true;
  if (!(along >= 0)) return Math.hypot(along, off) <= BEAM_MIN_HALF_WIDTH;
  const range = Math.max(1, lamp.range);
  const half = Math.max(BEAM_MIN_HALF_WIDTH, (BEAM_WIDTH[lamp.geometry] / 2) * (along / range));
  return Math.abs(off) <= half + 1e-9;
}

/**
 * The step a lamp's light reaches this far away. A lamp lighting all round
 * gives its lux out to a yard and falls off from there. A beam lights only
 * where it is aimed: its lux out to its range, then falling off by the same
 * steps over multiples of that range (HT:EE p. 20).
 */
export function lampStepAt(lamp: Lamp, yards: number): number {
  const full = luxStep(lampLux(lamp));
  const d = Math.max(0, Number(yards) || 0);
  if (!isBeam(lamp)) return full - falloffSteps(d);
  const range = Math.max(1, lamp.range);
  return full - falloffSteps(d / range);
}

/** The darkness a lamp leaves this far away, 0 to 9; a beam's at worst the -9 it leaves around (HT:EE p. 20). */
export function lampDarknessAt(lamp: Lamp, yards: number): number {
  const darkness = stepDarkness(lampStepAt(lamp, yards));
  return isBeam(lamp) ? Math.min(darkness, BEAM_SPILL_DARKNESS) : darkness;
}

// ── tasks that need bright light (HT:EE p. 20) ──

/** The light some tasks need, in lux: reading or sewing, up to a surgical theater's (HT:EE p. 20). */
export const BRIGHT_TASKS = Object.freeze({ reading: 500, surgery: 50_000 });
export type BrightTask = keyof typeof BRIGHT_TASKS;

/** A task in less light than it needs is at -2 (HT:EE p. 20). */
export const DIM_TASK_PENALTY = -2;

/**
 * The skills whose rolls are the book's bright-light tasks (HT:EE p. 20):
 * Sewing, as reading light's task, and Surgery, the surgical theater's. Other
 * reading is left to the GM, as no one skill is reading.
 */
export function brightTaskOf(skill: unknown): BrightTask | null {
  const text = String(skill ?? "").trim();
  if (/^surgery\b/i.test(text)) return "surgery";
  if (/^sewing\b/i.test(text)) return "reading";
  return null;
}

/** The penalty for a task needing this much light, in this much: 0 or -2. */
export function brightTaskPenalty(lux: number, needed: number): number {
  return luxStep(lux) >= luxStep(needed) ? 0 : DIM_TASK_PENALTY;
}

/** The lux of daylight, for a spot the scene's daylight reaches (HT:EE p. 20). */
export const DAYLIGHT_LUX = 10_000;

/** The least lux a darkness leaves: the table's row for that penalty (HT:EE p. 20). */
export const darknessLux = (darkness: number): number => stepLux(NO_PENALTY_STEP - Math.max(0, Math.min(10, Math.trunc(Number(darkness) || 0))));

// ── aiming a beam (HT:EE p. 20) ──

/** A beam aimed by someone who heard the target: -6 in place of worse darkness, the skill no higher than 9 (HT:EE p. 20). */
export const HEARD_AIM = Object.freeze({ penalty: -6, cap: 9 });

/**
 * Aiming by ear, once the aimer has heard the target (HT:EE p. 20): -6 in
 * place of the darkness where that is better, and whatever more brings the
 * adjusted skill down to 9. Null where the darkness is no worse than -6.
 */
export function heardAim(base: number, darkness: number): { penalty: number; cap: number } | null {
  const dark = Math.min(0, Math.trunc(Number(darkness) || 0));
  if (dark >= HEARD_AIM.penalty) return null;
  const adjusted = Math.trunc(Number(base) || 0) + HEARD_AIM.penalty;
  return { penalty: HEARD_AIM.penalty, cap: Math.min(0, HEARD_AIM.cap - adjusted) };
}

/** Where a missed beam lands: yards equal to the margin of failure, left on an odd die, right on an even one (HT:EE p. 20). */
export function beamDrift(margin: number, die: number): { yards: number; side: "left" | "right" } {
  return { yards: Math.max(1, Math.abs(Math.trunc(Number(margin) || 0))), side: Math.trunc(die) % 2 === 1 ? "left" : "right" };
}

// ── glare (HT:EE pp. 9, 20-21) ──

/** Light this bright calls for the roll whatever the eyes are used to: 200,000 lux (HT:EE p. 20). */
export const GLARE_LUX = 200_000;
/** Or light this many steps above what the eyes are adapted to (HT:EE p. 20). */
export const GLARE_STEPS = 5;

/** A flashbulb: 900,000 lux at a yard over a hemisphere, and -5 to look straight at it (HT:EE p. 21). */
export const FLASHBULB = Object.freeze({ lux: 900_000, geometry: "recessed" as Geometry, lookingAt: -5 });
/** An arc flash: 1,000,000 lux (HT:EE p. 9). */
export const ARC_FLASH_LUX = 1_000_000;

/** A flashbulb's step this far away: its hemisphere falls off as a lamp's does (HT:EE pp. 20-21). */
export const flashbulbStepAt = (yards: number): number => luxStep(FLASHBULB.lux) - falloffSteps(yards);

/**
 * Whether light of this step calls for the HT roll against glare, from eyes
 * adapted to `adapted`, and at what: from 200,000 lux, or five steps above
 * the adaptation, whichever comes first, at -1 a step past it (HT:EE p. 20;
 * the arc flash's -1 at 1,000,000 lux, p. 9, is the same count).
 */
export function glareRoll(step: number, adapted: number): { required: boolean; modifier: number } {
  const threshold = Math.min(adapted + GLARE_STEPS, luxStep(GLARE_LUX));
  if (!Number.isFinite(step) || step < threshold) return { required: false, modifier: 0 };
  return { required: true, modifier: threshold - step };
}

/** A dazzled character's extra penalty on Vision (HT:EE p. 20). */
export const DAZZLED_VISION = -4;

/**
 * The margin of a roll against glare the system refuses to make, at an
 * effective HT below 3 (Campaigns p. 344): a failure by what it fell short of
 * 3, at least 1.
 */
export function refusedMargin(effective: number): number {
  const e = Number(effective);
  return -Math.max(1, Number.isFinite(e) ? 3 - Math.trunc(e) : 1);
}

/** What the HT roll against glare leaves (HT:EE p. 20). */
export type GlareOutcome =
  | { kind: "unaffected" }
  | { kind: "readapt" }
  | { kind: "dazzled"; minutes: number }
  | { kind: "blinded"; seconds: number; minutes: number };

/**
 * Success by 3 or more avoids problems; by 0-2 the eyes must re-adapt to the
 * lower light; failure dazzles for minutes equal to the margin; a critical
 * failure blinds for seconds equal to the margin, then dazzles as a failure
 * does (HT:EE p. 20).
 */
export function glareOutcome(outcome: { success: boolean; margin: number; criticalFailure?: boolean }): GlareOutcome {
  const by = Math.max(1, Math.abs(Math.trunc(Number(outcome.margin) || 0)));
  if (outcome.success) return Math.abs(Number(outcome.margin) || 0) >= 3 ? { kind: "unaffected" } : { kind: "readapt" };
  if (outcome.criticalFailure) return { kind: "blinded", seconds: by, minutes: by };
  return { kind: "dazzled", minutes: by };
}
