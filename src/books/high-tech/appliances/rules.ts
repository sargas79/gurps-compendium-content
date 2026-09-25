/**
 * The Electricity and Electronics supplement's appliances and power tools
 * (HT:EE pp. 20-25), as pure rules. What the system meets them through is in
 * `index.ts`.
 *
 *   - **Heaters and fans (HT:EE pp. 21, 23):** a heater in use gives +1 (the
 *     incandescent bulb heater, which warms one person) or +2 (the resistance
 *     wire heater, which warms a room) to HT against the cold; a fan +2 (the
 *     large one) or +1 (a small one) against ordinary heat. They are pieces of
 *     High-Tech's climate-control table (`src/shared/climate`), with this
 *     book's appliances switch.
 *   - **Kitchen gear (HT:EE p. 21):** a microwave oven heats less evenly, -1 to
 *     Housekeeping and -2 to Cooking; an induction cooker's control is
 *     precise, +1 to both, once the cook is used to it; a hot plate is
 *     improvised equipment for either.
 *   - **Hazards (HT:EE p. 21):** an early resistance wire heater, poorly
 *     screened, burns 1d-3 a second at a touch; the induction furnace's
 *     molten metal burns 3d at first contact.
 *   - **Shredders and vacuums (HT:EE p. 23):** reconstructing shredded
 *     documents is a Forensics roll, -5 for a cross-cut shredder's confetti; a
 *     crime scene cleaned with a shopvac, the bag carried away, leaves -2 to
 *     the Forensics rolls made there afterwards.
 *   - **Electromagnets (HT:EE pp. 22-23):** an iron core gives ST 8 times its
 *     interior diameter in inches, a superconducting air core 100 times; the
 *     most it holds is 10 times the Basic Lift for that ST, and it pulls only
 *     from as far as its coil is long.
 *   - **Remote control (HT:EE p. 25):** equipment built to be run remotely
 *     costs 10% more.
 *   - **The emergency stop (HT:EE p. 25):** a machine shut down by its kill
 *     switch rolls HT against equipment failure (Campaigns p. 485); the control
 *     is made to be seen, +10 to Per.
 *   - **Power tools (HT:EE pp. 14, 21, 24):** the damage each does to what it
 *     works on each second, as High-Tech's forced-entry tools do (High-Tech
 *     pp. 25-30): the power drill's 1d+2(2) pi++ against wood and plaster (an
 *     early model -2 to skill), a circular saw's swing-based cut, (5) with an
 *     abrasive diamond blade against concrete and brick, the arc welder's
 *     3d(2) burn, the hot plate's 1d-3 and the soldering iron's point.
 */

import type { Work } from "../tools/rules.js";

/** A name without the TL a record adds where it repeats: "Small Fan (TL8)" is "Small Fan". */
export function baseName(name: unknown): string {
  return String(name ?? "").replace(/\s*\(TL\s*\d+\^?\)\s*$/i, "").trim();
}

// ── heaters and fans (HT:EE pp. 21, 23) ──

/** What a heater or fan adds to HT against the weather, and on which side. */
export interface WeatherAppliance {
  pattern: RegExp;
  cold?: number;
  heat?: number;
}

export const WEATHER_APPLIANCES: readonly WeatherAppliance[] = Object.freeze([
  // Four bulbs behind a reflector: too little for a room, enough for one person's hands (HT:EE p. 21).
  { pattern: /^incandescent bulb heater$/i, cold: 1 },
  // Warms a moderate-sized room (HT:EE p. 21).
  { pattern: /^resistance wire heater$/i, cold: 2 },
  // Against ordinary heat (HT:EE p. 23).
  { pattern: /^large fan$/i, heat: 2 },
  // The desk fan, and the battery-powered one of TL8 (HT:EE p. 23).
  { pattern: /^small fan$/i, heat: 1 },
]);

/** A heater's or fan's bonus, by its name, or null. */
export function weatherApplianceOf(name: unknown): WeatherAppliance | null {
  const base = baseName(name);
  return WEATHER_APPLIANCES.find((a) => a.pattern.test(base)) ?? null;
}

// ── kitchen gear (HT:EE p. 21) ──

/** The two skills kitchen gear is used with. */
export const KITCHEN_SKILLS = ["Cooking", "Housekeeping"] as const;
export type KitchenSkill = (typeof KITCHEN_SKILLS)[number];

/** What a piece of kitchen gear is worth to each skill: a modifier, or improvised equipment. */
export interface KitchenGear {
  pattern: RegExp;
  skills: Readonly<Record<KitchenSkill, number | "improvised">>;
  /** Takes the unfamiliar equipment penalty until the cook is used to it. */
  unfamiliar?: boolean;
}

export const KITCHEN_GEAR: readonly KitchenGear[] = Object.freeze([
  { pattern: /^microwave oven$/i, skills: { Cooking: -2, Housekeeping: -1 } },
  { pattern: /^induction cooker$/i, skills: { Cooking: 1, Housekeeping: 1 }, unfamiliar: true },
  { pattern: /^hot plate$/i, skills: { Cooking: "improvised", Housekeeping: "improvised" } },
]);

export function kitchenGearOf(name: unknown): KitchenGear | null {
  const base = baseName(name);
  return KITCHEN_GEAR.find((g) => g.pattern.test(base)) ?? null;
}

/** Which kitchen skill a skill's name is, or null. */
export function kitchenSkillOf(name: unknown): KitchenSkill | null {
  const text = String(name ?? "").trim().toLowerCase();
  return KITCHEN_SKILLS.find((s) => text === s.toLowerCase() || text.startsWith(`${s.toLowerCase()} `) || text.startsWith(`${s.toLowerCase()}/`)) ?? null;
}

/** Using equipment one isn't familiar with (Characters p. 169). */
export const UNFAMILIAR = -2;

/**
 * What a piece of kitchen gear in use is worth to the skill: its modifier,
 * the unfamiliar penalty on top where it takes one and the cook isn't used to
 * it, and improvised equipment at what the Basic Set's table gives.
 */
export function kitchenModifier(gear: KitchenGear, skill: KitchenSkill, options: { familiar: boolean; improvised: number }): number {
  const value = gear.skills[skill];
  const base = value === "improvised" ? options.improvised : value;
  return base + (gear.unfamiliar && !options.familiar ? UNFAMILIAR : 0);
}

// ── printers, scanners and the 3D printer (HT:EE pp. 23-24, 33) ──

/**
 * What a printer does to the Artist roll behind a printed picture: the dot
 * matrix printer's poor resolution -5, an inkjet's none, a laser printer's
 * high resolution +1 (quality); a multifunction printer is an inkjet or a
 * laser one (HT:EE pp. 23-24, 33).
 */
export const PRINTERS: Readonly<Record<string, number>> = Object.freeze({
  "dot matrix printer": -5,
  "inkjet printer": 0,
  "laser printer": 1,
  "multifunction printer": 0,
});
export const printerModifier = (name: unknown): number | null => PRINTERS[baseName(name).toLowerCase()] ?? null;

/**
 * A flatbed scanner captures documents easily, but artistic images, or
 * pictures that must be enlarged, at -2 (quality) to Electronics Operation
 * (Media) (HT:EE p. 33).
 */
export const FLATBED_SCANNER = -2;
export const isFlatbedScanner = (name: unknown) => /^flatbed scanner$/i.test(baseName(name));

/**
 * A 3D printer makes a model or a part on Machinist or Artist (Sculpting),
 * at -2 until the user is familiar with the design method (HT:EE p. 24).
 */
export const PRINT_3D_SKILLS = Object.freeze([
  { skill: "Machinist", attribute: "IQ" as const, default: -5 },
  { skill: "Artist (Sculpting)", attribute: "IQ" as const, default: -6 },
]);
export const is3dPrinter = (name: unknown) => /^3d printer$/i.test(baseName(name));

// ── Forensics (HT:EE p. 23) ──

/** Reconstructing shredded documents: strips, or a cross-cut shredder's small pieces. */
export const SHREDDED = Object.freeze({ strips: 0, crosscut: -5 });
export type Shredding = keyof typeof SHREDDED;

export const isShredder = (name: unknown) => /^shredder$/i.test(baseName(name));

/** A scene cleaned with a shopvac, the bag carried away: -2 to later Forensics rolls there. */
export const VACUUMED_SCENE = -2;

export const isShopvac = (name: unknown) => /^shopvac$/i.test(baseName(name));

// ── electromagnets (HT:EE pp. 22-23) ──

export const MAGNET_CORES = ["", "iron", "superconducting"] as const;
export type MagnetCore = (typeof MAGNET_CORES)[number];

/** ST per inch of interior diameter: an iron core, about 1.6 tesla; a superconducting air core, about 20. */
export const ST_PER_INCH: Readonly<Record<Exclude<MagnetCore, "">, number>> = Object.freeze({ iron: 8, superconducting: 100 });

/** The most a magnet holds is ten times the Basic Lift of its ST. */
export const PORTATIVE_LOAD = 10;

/** High-temperature superconductors suitable for magnets date from 1986: TL8. */
export const SUPERCONDUCTING_TL = 8;

/** A magnet: its core, interior diameter and coil length, in inches. */
export interface Magnet {
  core: Exclude<MagnetCore, "">;
  diameter: number;
  length: number;
}

/** The portable electromagnet: 1" interior diameter, 1" thick (HT:EE p. 23). */
export const PORTABLE_ELECTROMAGNET: Magnet = Object.freeze({ core: "iron", diameter: 1, length: 1 });

/** A magnet's figures: its effective ST, its most held, and the reach of its pull in inches. */
export function magnetFigures(magnet: Magnet, basicLift: (st: number) => number): { st: number; basicLift: number; load: number; reach: number } {
  const st = Math.round(ST_PER_INCH[magnet.core] * Math.max(0, magnet.diameter));
  const bl = basicLift(st);
  return { st, basicLift: bl, load: Math.round(bl * PORTATIVE_LOAD), reach: Math.max(0, magnet.length) };
}

/** A magnet by its record's name, where the book gives one. */
export function printedMagnet(name: unknown): Magnet | null {
  return /^portable electromagnet$/i.test(baseName(name)) ? PORTABLE_ELECTROMAGNET : null;
}

// ── remote control and the emergency stop (HT:EE p. 25) ──

/** Remote-controllable equipment sells for 10% above standard. */
export const REMOTE_CONTROL_PRICE = 1.1;

/** A kill switch is made to be seen. */
export const EMERGENCY_STOP_PER = 10;

// ── power tools (HT:EE pp. 14, 21, 24) ──

/** A power tool's work: the forced-entry tools' figures, and what an abrasive diamond blade does instead. */
export interface PowerTool {
  pattern: RegExp;
  work: Work;
  diamond?: Pick<Work, "divisor" | "against">;
  /** Early models' clumsier arrangements: -2 to skill. */
  earlyPenalty?: number;
  /** As a weapon, crippling damage to a limb amputates it (HT:EE p. 51, note [5]). */
  amputates?: boolean;
}

const perSecond = (damage: string, type: string, divisor = 1, against = ""): Work => ({ damage, type, divisor, every: 1, multiplier: 1, against, stRoll: null, carbideBonus: 0 });

export const POWER_TOOLS: readonly PowerTool[] = Object.freeze([
  // Wood, plaster and the like; the compact drill is the same drill on batteries (HT:EE p. 24).
  { pattern: /^(?:compact )?power drill$/i, work: perSecond("1d+2", "pi++", 2, "wood"), earlyPenalty: -2 },
  // Each second of cutting, as the compact saw's entry has it; a diamond blade for concrete or brick (HT:EE p. 24).
  // As weapons, the saws take off a limb they cripple (HT:EE p. 51, note [5]).
  { pattern: /^circular saw$/i, work: perSecond("sw+3", "cut", 2, "wood"), diamond: { divisor: 5, against: "concreteRock" }, amputates: true },
  { pattern: /^compact circular saw$/i, work: perSecond("sw+1", "cut", 2, "wood"), diamond: { divisor: 5, against: "concreteRock" }, amputates: true },
  // Welds or cuts metal (HT:EE p. 21).
  { pattern: /^arc welder$/i, work: perSecond("3d", "burn", 2) },
  { pattern: /^hot plate$/i, work: perSecond("1d-3", "burn") },
  // A resistance-heated tip, and the smaller TL7 iron (HT:EE p. 14).
  { pattern: /^soldering iron$/i, work: perSecond("1", "burn") },
  // Cuts electric wire, and can cut a power line: a cut each use (HT:EE p. 14).
  { pattern: /^wire cutters$/i, work: { ...perSecond("2d", "cut", 2), every: 0 } },
]);

export function powerToolOf(name: unknown): PowerTool | null {
  const base = baseName(name);
  return POWER_TOOLS.find((t) => t.pattern.test(base)) ?? null;
}

// ── appliance hazards (HT:EE p. 21) ──

/** What an appliance does to someone who touches it: burning damage, once or each second. */
export interface ApplianceHazard {
  pattern: RegExp;
  damage: string;
  perSecond: boolean;
  /** Only early models do it: inadequate screening. */
  earlyOnly?: boolean;
}

export const APPLIANCE_HAZARDS: readonly ApplianceHazard[] = Object.freeze([
  // Early models' inadequate screening: 1d-3 burn a second (HT:EE p. 21).
  { pattern: /^resistance wire heater$/i, damage: "1d-3", perSecond: true, earlyOnly: true },
  // The molten metal in its crucible: 3d burning at first contact (HT:EE p. 21).
  { pattern: /^handheld induction furnace$/i, damage: "3d", perSecond: false },
]);

/** An appliance's hazard by its name, where the book gives one: an early-only one whatever the model, for the sheet to offer the choice. */
export function applianceHazardOf(name: unknown): ApplianceHazard | null {
  const base = baseName(name);
  return APPLIANCE_HAZARDS.find((h) => h.pattern.test(base)) ?? null;
}

/** Whether the hazard applies to this appliance: an early-only one on an early model. */
export const hazardApplies = (hazard: ApplianceHazard | null, early: boolean): hazard is ApplianceHazard => hazard !== null && (!hazard.earlyOnly || early);

/**
 * The limbs a weapon that amputates takes off when it cripples them: an arm
 * or a leg (HT:EE p. 51, note [5] -- a limb, not a hand or foot, which the
 * Basic Set calls extremities, Campaigns p. 421).
 */
export const AMPUTATED_LOCATIONS: ReadonlySet<string> = new Set(["arm", "leg"]);

/** Whether a blow that crippled this location with this tool amputates it. */
export function amputatesAt(name: unknown, location: unknown): boolean {
  return powerToolOf(name)?.amputates === true && AMPUTATED_LOCATIONS.has(String(location ?? ""));
}

/** The work the tool does with its blade: the diamond blade's divisor and material where one is fitted. */
export function powerToolWork(tool: PowerTool, diamond: boolean): Work {
  return diamond && tool.diamond ? { ...tool.work, ...tool.diamond } : tool.work;
}
