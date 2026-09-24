/**
 * Energy storage, from the Electricity and Electronics supplement (HT:EE
 * pp. 17-18): capacitors and "batteries" of them, supercapacitors, and
 * flywheels by material.
 *
 * A capacitor empties itself in one surge, so what it does is a nonlethal
 * shock (Campaigns pp. 432-433) at the HT modifier its size gives. Wiring
 * several together makes the shock worse: -2 more for two, and for three or
 * more a further penalty read off the Size and Speed/Range Table's
 * Speed/Range column, taking the count as a Linear Measurement (Campaigns
 * p. 550). A supercapacitor is rated like a battery but gives the output of
 * the next size up for a minute, at twenty times the price. A flywheel
 * stores a share of a battery's energy and gives it back at a far higher
 * peak for up to two minutes; the printed figures are carbon fibre, and
 * steel and titanium are heavier and cheaper.
 */

import type { PowerGrade } from "./grades.js";

/** The penalty a second capacitor adds (HT:EE p. 17). */
export const SECOND_CAPACITOR = -2;

/**
 * A bank of capacitors' HT modifier to its shock: one's own; -2 more for
 * two; and for three or more, that -2 and the Speed/Range penalty for the
 * count read as yards, as a further penalty (HT:EE p. 17). `speedRange` is
 * the system's table (`rules.speedRangeModifier`).
 */
export function capacitorBankModifier(single: number, count: number, speedRange: (yards: number) => number): number {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const base = Math.floor(Number(single) || 0);
  if (n === 1) return base;
  if (n === 2) return base + SECOND_CAPACITOR;
  return base + SECOND_CAPACITOR + Math.min(0, Math.floor(Number(speedRange(n)) || 0));
}

/** A capacitor's shock is nonlethal, at an HT modifier between 0 and -4 for most (HT:EE p. 17). */
export const CAPACITOR_SHOCK = Object.freeze({ min: -4, max: 0 });

/** A bank of capacitors is a Simple invention from TL5 on (HT:EE p. 17; Campaigns p. 473). */
export const CAPACITOR_BANK = Object.freeze({ complexity: "simple", tl: 5 });

/** Supercapacitors (TL8): the output of the next size up, for a minute, at twenty times the price (HT:EE p. 18). */
export const SUPERCAPACITOR = Object.freeze({ key: "supercapacitor", tl: 8, cost: 20, minutes: 1 });

/** The size whose output a supercapacitor of a size gives, or null above the largest. */
export function supercapacitorStandsFor(size: string, sizes: readonly string[]): string | null {
  const at = sizes.indexOf(size);
  return at >= 0 && at + 1 < sizes.length ? sizes[at + 1]! : null;
}

// ── flywheels (HT:EE p. 18) ─────────────────────────────────────────────────

/** The flywheel sizes printed: the share of the same-size battery's energy stored, and the peak output. */
export const FLYWHEELS: Readonly<Record<string, { energy: number; peak: number; grade: PowerGrade | null }>> = Object.freeze({
  // Two-thirds of an M battery's energy, at 60 times its output: household power.
  M: { energy: 2 / 3, peak: 60, grade: "household" },
  // An L battery's energy at 100 times its output: industrial power.
  L: { energy: 1, peak: 100, grade: "industrial" },
  // A VL battery's energy at 100 times its output (no grade printed).
  VL: { energy: 1, peak: 100, grade: null },
});

/** Peak output lasts up to two minutes. */
export const FLYWHEEL_PEAK_MINUTES = 2;

export const FLYWHEEL_MATERIALS = ["carbonFiber", "steel", "titanium"] as const;
export type FlywheelMaterial = (typeof FLYWHEEL_MATERIALS)[number];

/**
 * Each material against the printed carbon-fibre figures: its TL, the sizes
 * it comes in, and what it multiplies the energy, weight and cost by.
 */
export const MATERIALS: Readonly<Record<FlywheelMaterial, { tl: number; sizes: readonly string[]; energy: number; weight: number; cost: number }>> = Object.freeze({
  carbonFiber: { tl: 8, sizes: ["M", "L", "VL"], energy: 1, weight: 1, cost: 1 },
  // Four and a half times the weight, a third the cost; L and VL only.
  steel: { tl: 7, sizes: ["L", "VL"], energy: 1, weight: 4.5, cost: 1 / 3 },
  // A third more energy, three times the weight, two-thirds the cost; L and VL only.
  titanium: { tl: 7, sizes: ["L", "VL"], energy: 4 / 3, weight: 3, cost: 2 / 3 },
});

export function isFlywheelMaterial(value: unknown): value is FlywheelMaterial {
  return typeof value === "string" && (FLYWHEEL_MATERIALS as readonly string[]).includes(value);
}

/** Whether a material comes in a size. */
export function materialFits(material: FlywheelMaterial, size: string): boolean {
  return MATERIALS[material].sizes.includes(size);
}

/**
 * A flywheel's price and weight in a material, from its printed figures;
 * null for carbon fibre, a material that doesn't come in the size, or one
 * the table doesn't know.
 */
export function flywheelPrice(size: string, material: unknown, price: { cost: number; weight: number }): { cost: number; weight: number } | null {
  if (!isFlywheelMaterial(material) || material === "carbonFiber" || !materialFits(material, size)) return null;
  const m = MATERIALS[material];
  return { cost: Math.round(price.cost * m.cost * 100) / 100, weight: Math.round(price.weight * m.weight * 1000) / 1000 };
}

/** What a flywheel stores and gives: the share of the same-size battery's energy, its peak, and the grade that peak equals. */
export function flywheelFigures(size: string, material: unknown): { energy: number; peak: number; grade: PowerGrade | null; minutes: number } | null {
  const printed = FLYWHEELS[size];
  if (!printed) return null;
  const m = isFlywheelMaterial(material) && materialFits(material, size) ? MATERIALS[material] : MATERIALS.carbonFiber;
  return { energy: printed.energy * m.energy, peak: printed.peak, grade: printed.grade, minutes: FLYWHEEL_PEAK_MINUTES };
}
