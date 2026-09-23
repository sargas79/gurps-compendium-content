/**
 * GURPS High-Tech's generators, energy collectors and fuels (pp. 14-16): what
 * each of the book's records burns and for how long, what cranking a
 * muscle-powered one costs and recharges, and when a solar collector gives no
 * power.
 *
 * A generator gives "external power" (p. 14), which a gadget with a power
 * adapter or an inverter runs on for as long as it lasts. The records carry
 * none of this, so the catalogue reads it by the record's name, as the book's
 * accessory catalogue does.
 */

/** The fuels the book prices (p. 16), and the two its fuel cells burn. */
export type FuelKind = "gasoline" | "diesel" | "kerosene" | "alcohol" | "wood" | "methanol" | "hydrogen";

/** The fuel records, by name (p. 16). */
export const FUELS: Readonly<Record<string, FuelKind>> = Object.freeze({
  "Gasoline (per gallon)": "gasoline",
  "Diesel Fuel (per gallon)": "diesel",
  "Kerosene (per gallon)": "kerosene",
  "Alcohol (per gallon)": "alcohol",
  "Wood (per cord)": "wood",
});

/** What a generator runs on. */
export type PowerSource = "fuel" | "muscle" | "wind" | "water" | "solar";

/** One generator's figures. Anything a kind doesn't use is left out. */
export interface GeneratorFigures {
  source: PowerSource;
  /** Drives tools by a belt rather than making electricity (p. 14). */
  mechanical?: boolean;
  /** A tank: the fuel, how much a fill holds (gallons, or cylinders where `cylinder`), and the hours a fill lasts. */
  tank?: Readonly<{ fuel: FuelKind; amount: number; hours: number; cylinder?: boolean }>;
  /** Burnt an hour where there's no tank: pounds of wood (or of coal instead), and gallons of water. */
  burns?: Readonly<{ wood: number; coal?: number; water: number }>;
  /** A muscle-powered generator's FP an hour of work, and the pounds of batteries an hour recharges. */
  cranked?: Readonly<{ fpPerHour: number; batteryLbsPerHour: number }>;
  /** A miniature one's minutes of cranking and the minutes of use they give, with no fatigue in normal use. */
  palmCrank?: Readonly<{ crankMinutes: number; runMinutes: number }>;
  /** A solar recharger, which recharges batteries rather than giving external power. */
  recharger?: boolean;
  /** What the weight is multiplied by at TL8. */
  tl8Weight?: number;
}

/** "The operator expends 1 FP an hour", and an hour recharges about 10 lbs. of batteries (p. 14). */
export const CRANKED = Object.freeze({ fpPerHour: 1, batteryLbsPerHour: 10 });

/** The book's generators and collectors, by record name (pp. 14-15). */
export const GENERATORS: Readonly<Record<string, GeneratorFigures>> = Object.freeze({
  // Steam (p. 14): wood (or coal) and water by the hour; the engine drives tools by a belt.
  "Semi-Portable Steam Engine": { source: "fuel", mechanical: true, burns: { wood: 250, water: 50 } },
  "Portable Steam-Powered Generator": { source: "fuel", burns: { wood: 20, coal: 5, water: 1 } },
  "Semi-Portable Homemade Steam Generator": { source: "fuel", burns: { wood: 80, water: 5 } },
  // Gasoline (p. 14): a 1-gallon tank lasts 3 hours on the early model, 10 on the later, which is lighter at TL8.
  "Semi-Portable Gasoline Generator": { source: "fuel", tank: { fuel: "gasoline", amount: 1, hours: 3 } },
  "Portable Gasoline Generator": { source: "fuel", tank: { fuel: "gasoline", amount: 1, hours: 10 }, tl8Weight: 2 / 3 },
  // Muscle (p. 14).
  "Portable Muscle-Powered Generator": { source: "muscle", cranked: CRANKED },
  "Semi-Portable Muscle-Powered Generator": { source: "muscle", cranked: CRANKED },
  "Miniature Muscle-Powered Generator": { source: "muscle", palmCrank: { crankMinutes: 2, runMinutes: 5 } },
  // Fuel cells (p. 15): a gallon of methanol every 3 days; a hydrogen cylinder for 5 hours.
  "Portable Methanol Fuel Cell": { source: "fuel", tank: { fuel: "methanol", amount: 1, hours: 72 } },
  "Semi-Portable Hydrogen Fuel Cell": { source: "fuel", tank: { fuel: "hydrogen", amount: 1, hours: 5, cylinder: true } },
  // Energy collectors (p. 15).
  Windmill: { source: "wind" },
  "Hydroelectric Turbine": { source: "water" },
  "Solar Power Array": { source: "solar" },
  "Solar Powered-Battery Recharger": { source: "solar", recharger: true },
});

/** A record's generator figures, or null for anything else. */
export function generatorOf(name: unknown): GeneratorFigures | null {
  return GENERATORS[String(name ?? "")] ?? null;
}

/** A record's fuel, or null for anything else. */
export function fuelOf(name: unknown): FuelKind | null {
  return FUELS[String(name ?? "")] ?? null;
}

/**
 * Whether a solar collector gives power: none at all where it is dim enough
 * for even a -1 Vision penalty (p. 15). `darkness` is that penalty, 0 in good
 * light.
 */
export function solarPowered(darkness: number): boolean {
  return (Number(darkness) || 0) >= 0;
}

/** Hours of a tank left after running some hours. */
export function tankLeft(tank: { hours: number }, hoursRun: number): number {
  return Math.max(0, tank.hours - Math.max(0, Number(hoursRun) || 0));
}

/** The FP whole hours of cranking cost (p. 14). */
export function crankFatigue(cranked: { fpPerHour: number }, hours: number): number {
  return Math.max(0, Math.floor(Number(hours) || 0)) * cranked.fpPerHour;
}

/**
 * The share of a gadget's batteries hours of cranking recharge: an hour for
 * each 10 lbs. of batteries (p. 14), to a full charge.
 */
export function crankedShare(cranked: { batteryLbsPerHour: number }, hours: number, batteryLbs: number): number {
  const lbs = Math.max(0, Number(batteryLbs) || 0);
  if (lbs <= 0) return 1;
  return Math.min(1, (Math.max(0, Number(hours) || 0) * cranked.batteryLbsPerHour) / lbs);
}

/** Minutes of use a palm-sized generator's cranking gives: five for every two (p. 14). */
export function palmCrankMinutes(palm: { crankMinutes: number; runMinutes: number }, minutesCranked: number): number {
  return (Math.max(0, Number(minutesCranked) || 0) * palm.runMinutes) / palm.crankMinutes;
}
