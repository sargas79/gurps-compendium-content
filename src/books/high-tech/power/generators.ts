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
 *
 * The Electricity and Electronics supplement adds its own generators to the
 * table, and its figures for one of High-Tech's (HT:EE pp. 17-18): the grade
 * of external power each supplies (HT:EE p. 9), the batteries it stands in
 * for, and how long it takes to recharge a battery of a size. Those are the
 * `ee` figures, which only the supplement's switch (energyStorage) reads; a
 * record the supplement alone prints is marked `volume: "ee"`.
 */

import type { PowerGrade } from "./grades.js";

/** The fuels the book prices (p. 16), and the two its fuel cells burn. */
export type FuelKind = "gasoline" | "diesel" | "kerosene" | "alcohol" | "wood" | "methanol" | "hydrogen" | "compressedHydrogen";

/** The fuel records, by name (p. 16). */
export const FUELS: Readonly<Record<string, FuelKind>> = Object.freeze({
  "Gasoline (per gallon)": "gasoline",
  "Diesel Fuel (per gallon)": "diesel",
  "Kerosene (per gallon)": "kerosene",
  "Alcohol (per gallon)": "alcohol",
  "Wood (per cord)": "wood",
  // "Extra cylinders are $100, 65 lbs." for the hydrogen fuel cell (p. 15).
  "Hydrogen Cylinder": "hydrogen",
  // The fuel cell power supply's 8 hours of compressed hydrogen (HT:EE p. 17).
  "Compressed Hydrogen (8 hours)": "compressedHydrogen",
});

/** What a generator runs on. */
export type PowerSource = "fuel" | "muscle" | "wind" | "water" | "solar";

/** What the supplement prints for a generator (HT:EE pp. 17-18). */
export interface SupplementGenerator {
  /** The grades of external power it supplies. */
  supplies?: readonly PowerGrade[];
  /** The batteries it takes the place of while it runs. */
  standsFor?: Readonly<{ size: string; cells: number }>;
  /** Hours to recharge one battery of a size. */
  recharges?: Readonly<Record<string, number>>;
  /** FP an hour of work, for one worked by muscle (0: no fatigue). */
  fpPerHour?: number;
  /** A wind generator's output in high and low wind; none in calm. */
  wind?: Readonly<Record<WindSpeed, Readonly<{ supplies: readonly PowerGrade[]; recharges: Readonly<Record<string, number>> }>>>;
  /** The skill its operator rolls as the wind changes; none for one that runs itself. */
  skill?: string;
}

/** The wind a wind generator turns in. */
export type WindSpeed = "high" | "low";

/** One generator's figures. Anything a kind doesn't use is left out. */
export interface GeneratorFigures {
  source: PowerSource;
  /** Printed only in the supplement, whose switch shows it. */
  volume?: "ee";
  /** The supplement's figures. */
  ee?: SupplementGenerator;
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
  "Miniature Muscle-Powered Generator": { source: "muscle", palmCrank: { crankMinutes: 2, runMinutes: 5 } },
  // Fuel cells (p. 15): a gallon of methanol every 3 days; a hydrogen cylinder for 5 hours.
  "Portable Methanol Fuel Cell": { source: "fuel", tank: { fuel: "methanol", amount: 1, hours: 72 } },
  "Semi-Portable Hydrogen Fuel Cell": { source: "fuel", tank: { fuel: "hydrogen", amount: 1, hours: 5, cylinder: true } },
  // Energy collectors (p. 15).
  Windmill: { source: "wind" },
  "Hydroelectric Turbine": { source: "water" },
  "Solar Power Array": { source: "solar" },
  "Solar Powered-Battery Recharger": { source: "solar", recharger: true },

  // The supplement's (HT:EE pp. 17-18).
  // The pedal generator is High-Tech's semi-portable muscle-powered one
  // (overlap-ee.txt): 1 FP an hour stands in for two M batteries, or
  // recharges an S battery in 1.5 hours or an M in 12.
  "Semi-Portable Muscle-Powered Generator": {
    source: "muscle",
    cranked: CRANKED,
    ee: { fpPerHour: 1, standsFor: { size: "M", cells: 2 }, recharges: { S: 1.5, M: 12 } },
  },
  // Cranked by hand with no FP: an S battery's worth, or an XS recharged in an hour, an S in three.
  "Hand Crank Generator": { source: "muscle", volume: "ee", ee: { fpPerHour: 0, standsFor: { size: "S", cells: 1 }, recharges: { XS: 1, S: 3 } } },
  // High wind: household power, or a VL battery in 2 hours; low wind: automotive power, or 10 hours; calm: nothing.
  // The TL6 model is adjusted as the wind changes, by Machine Operation (Wind Generator) (HT:EE p. 6).
  "Wind Generator (TL6)": {
    source: "wind",
    volume: "ee",
    ee: {
      skill: "Machine Operation (Wind Generator)",
      wind: { high: { supplies: ["household"], recharges: { VL: 2 } }, low: { supplies: ["automotive"], recharges: { VL: 10 } } },
    },
  },
  // Twice the output, and it runs itself.
  "Wind Generator (TL8)": {
    source: "wind",
    volume: "ee",
    ee: { wind: { high: { supplies: ["household"], recharges: { VL: 1 } }, low: { supplies: ["automotive"], recharges: { VL: 5 } } } },
  },
  // Automotive power or three M batteries; an M battery recharged in an hour, an L in a day.
  "Portable Solar Panel": { source: "solar", volume: "ee", ee: { supplies: ["automotive"], standsFor: { size: "M", cells: 3 }, recharges: { M: 1, L: 24 } } },
  // Major appliance power for one device, or household power for six to ten; 8 hours on a fill of compressed hydrogen.
  "Fuel Cell Power Supply": { source: "fuel", volume: "ee", tank: { fuel: "compressedHydrogen", amount: 1, hours: 8, cylinder: true }, ee: { supplies: ["majorAppliance", "household"] } },
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

/**
 * Hours to recharge batteries at a generator's rates (HT:EE pp. 17-18): the
 * printed hours for one of the size, times the number; for a size not
 * printed, the nearest printed size's hours scaled by the batteries' weight.
 * Null where it prints no rate at all.
 */
export function rechargeHours(rates: Readonly<Record<string, number>> | undefined, target: { size: string; cells: number }, sizes: readonly string[], weightOf: (size: string) => number): number | null {
  const printed = Object.keys(rates ?? {}).filter((size) => sizes.includes(size));
  if (!rates || !printed.length) return null;
  const cells = Math.max(1, Math.floor(Number(target.cells) || 1));
  if (rates[target.size] !== undefined) return rates[target.size]! * cells;
  const at = sizes.indexOf(target.size);
  const nearest = [...printed].sort((a, b) => Math.abs(sizes.indexOf(a) - at) - Math.abs(sizes.indexOf(b) - at))[0]!;
  const from = weightOf(nearest);
  return from > 0 ? (rates[nearest]! * cells * weightOf(target.size)) / from : null;
}

/** The share of a full charge some hours at a generator's rate give, to a full charge. */
export function rechargedShare(hoursNeeded: number | null, hours: number): number {
  if (hoursNeeded === null) return 0;
  if (hoursNeeded <= 0) return 1;
  return Math.min(1, Math.max(0, Number(hours) || 0) / hoursNeeded);
}

/** Minutes of use a palm-sized generator's cranking gives: five for every two (p. 14). */
export function palmCrankMinutes(palm: { crankMinutes: number; runMinutes: number }, minutesCranked: number): number {
  return (Math.max(0, Number(minutesCranked) || 0) * palm.runMinutes) / palm.crankMinutes;
}
