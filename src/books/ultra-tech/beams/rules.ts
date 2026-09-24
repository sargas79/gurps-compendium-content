/**
 * Ultra-Tech's beam weapons (pp. 113-132): which family a weapon belongs to,
 * and what the air, the water and the weather do to each.
 */

/** The families the book describes, each with rules of its own. */
export type BeamFamily =
  | "laser" | "blueGreen" | "ultraviolet" | "dazzler" | "rainbow" | "xray" | "graser"
  | "electrolaser" | "mad" | "microwave" | "neural" | "mindripper" | "blaster" | "omniBlaster" | "pulsar"
  | "nauseator" | "screamer" | "sonicStun" | "flamer" | "plasma" | "forceBeam" | "graviton"
  | "disintegrator" | "ghostParticle" | "displacer" | "mindDisruptor";

/** The families, by the names the book gives the weapons: the most specific first. */
const FAMILIES: ReadonlyArray<[RegExp, BeamFamily]> = [
  [/\bomni-blaster\b/i, "omniBlaster"],
  [/\bblaster\b/i, "blaster"],
  [/\belectrolaser\b/i, "electrolaser"],
  [/\bblue-green\b/i, "blueGreen"],
  [/\bultraviolet\b/i, "ultraviolet"],
  [/\brainbow\b/i, "rainbow"],
  [/\bx-ray\b/i, "xray"],
  [/\bgraser\b/i, "graser"],
  [/\b(dazzler|penlight|flashlight|searchlight)\b/i, "dazzler"],
  [/\blaser\b/i, "laser"],
  [/\bMAD\b/, "mad"],
  [/\b(EMP gun|pulse carbine|scrambler|tactical disruptor)\b/i, "microwave"],
  [/\bmindripper\b/i, "mindripper"],
  [/\bmind disruptor\b/i, "mindDisruptor"],
  [/\b(nerve|neural)\b/i, "neural"],
  [/\b(pulsar|antiparticle)\b/i, "pulsar"],
  [/\bnausea(tor)?\b/i, "nauseator"],
  [/\bscreamer\b/i, "screamer"],
  [/\b(sonic stun|stunner|stinger)\b/i, "sonicStun"],
  [/\bflamer\b/i, "flamer"],
  [/\b(plasma|fusion)\b/i, "plasma"],
  [/\bgraviton\b/i, "graviton"],
  [/\bforce (beamer|pistol|rifle|cannon|beam)\b/i, "forceBeam"],
  [/\bdisintegrator\b/i, "disintegrator"],
  [/\bghost particle\b/i, "ghostParticle"],
  [/\bdisplacer\b/i, "displacer"],
];

/** The family a beam weapon belongs to, by its name, or null for anything else. */
export function beamFamily(name: string): BeamFamily | null {
  const text = String(name ?? "");
  return FAMILIES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** How clear the water is, which caps a blue-green laser's range under it (p. 115). */
export type WaterClarity = "clear" | "average" | "murky";

/** Where the shot is fired, as the GM sets it for the scene. */
export interface BeamEnvironment {
  /** Air pressure in atmospheres: 1 at sea level, 0 in vacuum. */
  atmospheres: number;
  underwater: boolean;
  waterClarity: WaterClarity;
  /** Moist air, or rain, drizzle and heavy fog, which spoil an electrolaser's aim (p. 119). */
  humidity: "dry" | "humid" | "rain";
}

export const STANDARD_ENVIRONMENT: BeamEnvironment = Object.freeze({ atmospheres: 1, underwater: false, waterClarity: "average", humidity: "dry" });

/** Trace air counts as vacuum (Campaigns p. 429). */
export function isVacuum(environment: BeamEnvironment): boolean {
  return !environment.underwater && environment.atmospheres <= 0.01;
}

/** A row's figures the environment can change. */
export interface BeamRow {
  accuracy: number;
  halfDamageRange: number;
  maxRange: number;
  armorDivisor: number;
}

/** What the environment does to a row. */
export interface BeamChange {
  row: BeamRow;
  /** Added to the row's skill. */
  skill: number;
  /** An electrolaser's charge has no air to ride: the row is the laser's burn alone (p. 119). */
  chargeLost: boolean;
  /** Keys of what changed, for the row's notes. */
  notes: string[];
}

/** Caps a row's ranges at a pair of figures, keeping 1/2D no further than Max. */
function capped(row: BeamRow, half: number, max: number): BeamRow {
  const nextMax = Math.min(row.maxRange, Math.round(max));
  return { ...row, maxRange: nextMax, halfDamageRange: Math.min(row.halfDamageRange, Math.round(half), nextMax) };
}

/** Maximum underwater range of a blue-green laser by the water's clarity (p. 115). */
export const BLUE_GREEN_UNDERWATER: Readonly<Record<WaterClarity, number>> = Object.freeze({ clear: 150, average: 60, murky: 15 });

/**
 * What the air, the water and the weather do to a row of a beam weapon of
 * this family (pp. 114-127).
 */
export function inEnvironment(family: BeamFamily, row: BeamRow, environment: BeamEnvironment): BeamChange {
  const atm = Math.max(0, Number(environment.atmospheres) || 0);
  const vacuum = isVacuum(environment);
  const water = environment.underwater;
  const inAir = !vacuum && !water;
  let next = { ...row };
  let skill = 0;
  let chargeLost = false;
  const notes: string[] = [];
  const none = () => ({ ...next, halfDamageRange: 0, maxRange: 0 });

  switch (family) {
    case "laser":
      // Infrared can't get through more than a few inches of water (p. 114).
      if (water) { next = { ...next, halfDamageRange: 0, maxRange: Math.min(next.maxRange, 1) }; notes.push("underwaterInfrared"); }
      break;
    case "blueGreen":
      if (water) { next = capped(next, BLUE_GREEN_UNDERWATER[environment.waterClarity], BLUE_GREEN_UNDERWATER[environment.waterClarity]); notes.push("underwaterBlueGreen"); }
      break;
    case "ultraviolet":
      // "Range cannot exceed 500 yards divided by atmospheric pressure" (p. 115).
      if (inAir && atm > 0) { next = capped(next, 500 / atm, 500 / atm); notes.push("ultravioletAir"); }
      if (water) { next = none(); notes.push("noRangeUnderwater"); }
      break;
    case "rainbow":
      // Defocused in vacuum or trace air; two yards underwater (p. 116).
      if (vacuum) { next = { ...next, halfDamageRange: Math.round(next.halfDamageRange / 10), maxRange: Math.round(next.maxRange / 10), armorDivisor: 1 }; notes.push("rainbowVacuum"); }
      if (water) { next = capped(next, 2, 2); notes.push("rainbowWater"); }
      break;
    case "xray":
      // 7/20 yards in a standard atmosphere, divided by the pressure; nothing underwater (p. 117).
      if (inAir && atm > 0) { next = capped(next, 7 / atm, 20 / atm); notes.push("xrayAir"); }
      if (water) { next = none(); notes.push("noRangeUnderwater"); }
      break;
    case "graser":
      // 70/200 yards in a standard atmosphere, divided by the pressure (p. 118).
      if (inAir && atm > 0) { next = capped(next, 70 / atm, 200 / atm); notes.push("graserAir"); }
      if (water) { next = none(); notes.push("noRangeUnderwater"); }
      break;
    case "blaster":
    case "omniBlaster":
      // Acc halved (round up) and Range divided by 5 in vacuum (p. 123).
      if (vacuum) { next = { ...next, accuracy: Math.ceil(next.accuracy / 2), halfDamageRange: Math.round(next.halfDamageRange / 5), maxRange: Math.round(next.maxRange / 5) }; notes.push("blasterVacuum"); }
      break;
    case "pulsar":
      // "cannot exceed 1,000 yards divided by atmospheric pressure" (p. 124).
      if (inAir && atm > 0) { next = capped(next, 1000 / atm, 1000 / atm); notes.push("pulsarAir"); }
      break;
    case "electrolaser":
      // No air to ionize: only the laser's burn (p. 119).
      if (vacuum) { chargeLost = true; notes.push("electrolaserVacuum"); }
      if (!vacuum && environment.humidity === "humid") { skill -= 2; notes.push("electrolaserHumid"); }
      if (!vacuum && environment.humidity === "rain") { skill -= 6; notes.push("electrolaserRain"); }
      break;
    case "nauseator":
    case "screamer":
    case "sonicStun": {
      // Range times the air pressure, to twice the listed range; none in vacuum
      // unless touching the target (p. 124). A nauseator has no range underwater (p. 125).
      if (vacuum || (water && family === "nauseator")) { next = none(); notes.push(vacuum ? "sonicVacuum" : "noRangeUnderwater"); break; }
      if (!water && atm !== 1) {
        const factor = Math.min(2, atm);
        next = { ...next, halfDamageRange: Math.round(next.halfDamageRange * factor), maxRange: Math.round(next.maxRange * factor) };
        notes.push("sonicPressure");
      }
      break;
    }
    default:
      break;
  }
  return { row: next, skill, chargeLost, notes };
}

/**
 * The families whose affliction DR does nothing against: a dazzler's light
 * (p. 113), microwave and neural disruptors, contact agents that get past it
 * (pp. 120-121), a nauseator's sound (p. 125), and mind disruptors and
 * mindrippers (pp. 122, 132). The system gives every affliction's roll to
 * resist a DR line (Characters p. 35); against these it is taken out.
 *
 * Against the rest DR counts as the system counts it, at the row's armour
 * divisor: "each 2 DR" against an electrolaser (2), a third against an
 * omni-blaster's stun (3), "+1 per 5 DR" against a sonic stunner (5), and a
 * MAD beam's DR in full (1) (pp. 119-125).
 */
export const DR_IGNORED: ReadonlySet<BeamFamily> = new Set(["dazzler", "microwave", "neural", "mindripper", "mindDisruptor", "nauseator"]);

/** Whether a beam family's affliction leaves the victim's DR a bonus to resist it. */
export function drResists(family: BeamFamily): boolean {
  return !DR_IGNORED.has(family);
}

/** Against a DR-ignoring beam, the part of a force field that still stands (pp. 129-130). */
export const FORCE_FIELD_PART: Readonly<Partial<Record<BeamFamily, number>>> = Object.freeze({ graviton: 0.01, disintegrator: 0.1 });

/** "Anyone reduced to -10×HP or less is disintegrated" (p. 130). */
export function isDisintegrated(hp: number, maxHp: number): boolean {
  return maxHp > 0 && hp <= -10 * maxHp;
}

/** A lethal electrolaser's "kill" setting uses two shots, and a failure by 5 or more is a heart attack (p. 119). */
export const KILL_SETTING = Object.freeze({ extraShots: 1, heartAttackMargin: 5 });

/**
 * The part of a force screen that counts against a DR-ignoring beam that only a
 * reality-stabilized screen stops (p. 131): a ghost particle beam at a fifth,
 * a reality disintegrator as a disintegrator (a tenth). Null for other beams.
 */
export function stabilizedScreenPart(name: string, stabilized: boolean): number | null {
  const text = String(name ?? "");
  if (/\bghost particle\b/i.test(text)) return stabilized ? 0.2 : 0;
  if (/\breality disintegrator\b/i.test(text)) return stabilized ? 0.1 : 0;
  return null;
}

/** An electrolaser built with the kill setting is LC2 (p. 119). */
export const LETHAL_ELECTROLASER_LC = 2;

/** A hotshot multiplies an area's radius by 1.3 (p. 133). */
export const HOTSHOT_RADIUS = 1.3;
