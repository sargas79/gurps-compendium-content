/**
 * Ultra-Tech's laser options (pp. 113-118): the dazzle, blinding and pulse
 * modes a high-energy laser can be built with, what dazzle and blinding lasers
 * do to eyes, and what weather and glass do to a laser.
 */

import type { BeamFamily } from "./rules.js";

/** A laser's settings: the beam it is built to fire, and the modes it can switch to. */
export type LaserSetting = "beam" | "dazzle" | "blinding" | "pulse";

/** How a laser was built. */
export interface LaserOptions {
  /** A dazzle mode, +10% to cost (p. 113). */
  dazzle: boolean;
  /** A blinding mode, +10% to cost (p. 114). */
  blinding: boolean;
  /** A pulse laser, or a pulse-beam laser that fires either at +100% to cost (p. 118). */
  pulse: "" | "pulse" | "pulseBeam";
  /** The setting it is on; switching takes a Ready maneuver. */
  setting: LaserSetting;
}

export const NO_LASER_OPTIONS: LaserOptions = Object.freeze({ dazzle: false, blinding: false, pulse: "", setting: "beam" });

/** The high-energy lasers the options are for (pp. 114-116). */
export const HIGH_ENERGY: ReadonlySet<BeamFamily> = new Set(["laser", "blueGreen", "ultraviolet", "xray", "graser", "rainbow"]);

/** The chemical lasers, which can't be pulse lasers (pp. 114-115, 118). */
const CHEMICAL = /^(assault laser|laser sniper rifle|semi-portable laser)$/i;

/** Whether a laser of this family and name may be built as a pulse laser (p. 118). */
export function canPulse(family: BeamFamily, name: string): boolean {
  return HIGH_ENERGY.has(family) && family !== "rainbow" && !CHEMICAL.test(String(name ?? "").trim());
}

/** Whether a high-energy laser can be built with dazzle or blinding modes (pp. 113-114). */
export function canDazzle(family: BeamFamily, name: string): boolean {
  return HIGH_ENERGY.has(family) && !CHEMICAL.test(String(name ?? "").trim());
}

/** What the options multiply the price by (pp. 113, 114, 118). */
export function laserOptionFactor(options: LaserOptions): number {
  return 1 + (options.dazzle ? 0.1 : 0) + (options.blinding ? 0.1 : 0) + (options.pulse === "pulseBeam" ? 1 : 0);
}

/** The settings a laser built this way can be switched to. */
export function laserSettings(options: LaserOptions): LaserSetting[] {
  const settings: LaserSetting[] = options.pulse === "pulse" ? ["pulse"] : ["beam"];
  if (options.pulse === "pulseBeam") settings.push("pulse");
  if (options.dazzle) settings.push("dazzle");
  if (options.blinding) settings.push("blinding");
  return settings;
}

/** The setting the laser is on, or its first where the stored one isn't one it has. */
export function activeSetting(options: LaserOptions): LaserSetting {
  const settings = laserSettings(options);
  return settings.includes(options.setting) ? options.setting : settings[0]!;
}

/** "Reduce the armor divisor one step ... or delete it entirely" for infrared, visible and ultraviolet lasers (p. 118). */
export function pulseDivisor(divisor: number): number {
  const d = Number(divisor) || 1;
  if (d >= 10) return 5;
  if (d >= 5) return 3;
  return 1;
}

/** A row's figures a laser setting changes. */
export interface LaserRow {
  damage: string;
  damageType: string;
  armorDivisor: number;
  halfDamageRange: number;
  maxRange: number;
  explosive: boolean;
  affliction: boolean;
  afflictionAttribute: string;
  afflictionModifier: number;
}

/**
 * A row as the setting fires it: a pulse is crushing and explosive at a step
 * less divisor and twice the range (p. 118); dazzle is a HT-5 affliction at the
 * face or eyes (p. 113); blinding is a HT-10 affliction (p. 114).
 */
export function laserRow(setting: LaserSetting, row: LaserRow): LaserRow {
  switch (setting) {
    case "pulse":
      return { ...row, damageType: "cr", explosive: true, armorDivisor: pulseDivisor(row.armorDivisor), halfDamageRange: row.halfDamageRange * 2, maxRange: row.maxRange * 2 };
    case "dazzle":
      return { ...row, damage: "—", armorDivisor: 1, explosive: false, affliction: true, afflictionAttribute: "HT", afflictionModifier: -5 };
    case "blinding":
      return { ...row, damage: "—", armorDivisor: 1, explosive: false, affliction: true, afflictionAttribute: "HT", afflictionModifier: -10 };
    default:
      return row;
  }
}

/** "Protected Vision adds +5 to resist. A Nictitating Membrane adds +1 per level" (pp. 113-114). */
export function visionResistBonus(traitNames: readonly string[]): number {
  let bonus = 0;
  for (const name of traitNames) {
    if (/^protected vision\b/i.test(name)) bonus += 5;
    const membrane = /^nictitating membrane\b\D*(\d+)?/i.exec(name);
    if (membrane) bonus += Math.max(1, Number(membrane[1]) || 1);
  }
  return bonus;
}

/**
 * Extra DR from weather against a high-energy laser: "equal to the vision
 * penalty (per yard)" (p. 114), so a beam through 3 yards of smoke at -10 a yard
 * meets DR 30. The GM gives the whole penalty along the beam's path.
 */
export function weatherDr(pathPenalty: number): number {
  return Math.max(0, Math.floor(Math.abs(Number(pathPenalty) || 0)));
}

/** A laser striking glass, a visor or a window that isn't laser-resistant has a (10) divisor (p. 114). */
export const GLASS_DIVISOR = 10;
