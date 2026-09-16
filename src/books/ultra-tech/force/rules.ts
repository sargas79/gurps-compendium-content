/**
 * GURPS Ultra-Tech's force fields, as rules the table reads (pp. 190-195):
 * force screens and their variants, barrier screens, force shields, stasis
 * webs, life support fields and the tau-shield.
 */

import { baseName } from "../armor/rules.js";

// ── force screens (pp. 190-192) ──────────────────────────────────────────────

/** The force screens, by name. `diameter` is a barrier screen's standard size in yards. */
export const SCREENS: Readonly<Record<string, { barrier: boolean; diameter?: number }>> = {
  "light force screen": { barrier: true, diameter: 5 },
  "medium force screen": { barrier: true, diameter: 10 },
  "heavy force screen": { barrier: true, diameter: 15 },
  "personal force screen": { barrier: false },
  "tactical force screen": { barrier: false },
};

export function screenOf(name: string): { barrier: boolean; diameter?: number } | null {
  return SCREENS[baseName(name).toLowerCase()] ?? null;
}

/** A screen's variant options (pp. 191-192). */
export interface ScreenOptions {
  /** Which half is reinforced, or "" for an unadjustable screen; "none" for an adjustable one left even. */
  adjustable: "" | "none" | "front" | "back";
  cloaking: boolean;
  energy: boolean;
  kinetic: boolean;
  opaque: boolean;
  permeable: boolean;
  /** A permeable screen letting air through right now. */
  breathing: boolean;
  realityStabilized: boolean;
  safetySwitch: boolean;
  velocity: boolean;
}

export const NO_SCREEN_OPTIONS: ScreenOptions = {
  adjustable: "", cloaking: false, energy: false, kinetic: false, opaque: false, permeable: false,
  breathing: false, realityStabilized: false, safetySwitch: false, velocity: false,
};

/** The options' cost modifiers, added together (p. 191). */
export function screenCostFactor(options: ScreenOptions): number {
  let modifier = 0;
  if (options.adjustable) modifier += 1;
  if (options.cloaking) modifier += 1;
  if (options.energy) modifier -= 0.5;
  // A kinetic screen can't also be an energy screen (p. 192).
  if (options.kinetic && !options.energy) modifier -= 0.5;
  // Pointless on a velocity or energy screen, which lets air through already.
  if (options.permeable && !options.velocity && !options.energy) modifier += 0.5;
  if (options.realityStabilized) modifier += 1;
  if (options.safetySwitch) modifier += 0.1;
  if (options.velocity) modifier -= 0.1;
  return Math.max(0.1, Math.round((1 + modifier) * 100) / 100);
}

/** A barrier screen's price scaled to its diameter (p. 191). */
export function barrierFactor(standardDiameter: number, diameter: number): number {
  if (!(standardDiameter > 0) || !(diameter > 0)) return 1;
  return diameter / standardDiameter;
}

/** A barrier screen's SM: its diameter on the Size Modifier Table, +2 for a sphere (p. 191). */
export function barrierSm(diameter: number, sizeModifier: (yards: number) => number): number {
  return sizeModifier(diameter) + 2;
}

/** Whether a shot that missed its target by this much struck the screen instead (p. 191). */
export function missHitsScreen(marginOfFailure: number, targetSm: number, screenSm: number): boolean {
  return marginOfFailure > 0 && marginOfFailure <= screenSm - targetSm;
}

/** What an attack is, for what a screen stops. */
export interface AttackKind {
  /** Beams, force swords, electrical attacks, fire. */
  energy: boolean;
  /** A ranged attack: bullets, beams, explosions. */
  fast: boolean;
}

/** Whether the screen counts against an attack at all (p. 192). */
export function screenStops(options: ScreenOptions, attack: AttackKind): boolean {
  if (options.energy && !attack.energy) return false;
  if (options.kinetic && !options.energy && attack.energy) return false;
  if (options.velocity && !attack.fast) return false;
  return true;
}

/** An adjustable screen's DR against a blow from this arc: ×1.5 on the reinforced half, ×1/2 elsewhere (p. 191). */
export function adjustedDr(dr: number, reinforced: ScreenOptions["adjustable"], arc: string | null | undefined): number {
  if (reinforced !== "front" && reinforced !== "back") return dr;
  if (!arc) return dr;
  return Math.floor(arc === reinforced ? dr * 1.5 : dr / 2);
}

/**
 * What an active screen gives in trait terms (p. 190): sealed, full pressure
 * and vacuum support, PF equal to its DR -- none of which a velocity or energy
 * screen gives.
 */
export function screenProtection(options: ScreenOptions, dr: number): { sealed: boolean; vacuumSupport: boolean; pressureSupport: number; radiationPf: number } {
  const open = options.velocity || options.energy;
  return {
    sealed: !open && !(options.permeable && options.breathing),
    vacuumSupport: !open,
    pressureSupport: open ? 0 : 3,
    radiationPf: open || (options.kinetic && !options.energy) ? 1 : Math.max(1, dr),
  };
}

/** DR a partly spent screen regains a second: 1 for every 10 it started with, at least 1 (p. 190). */
export function regenerationPerSecond(fullDr: number): number {
  return Math.max(1, Math.floor(Math.max(0, fullDr) / 10));
}

// ── force shields (pp. 192-193) ─────────────────────────────────────────────

/** A force shield bracelet: a buckler's agility with a large shield's DB, hardened DR 100 (p. 192). */
export const FORCE_SHIELD = { db: 3, dr: 100, skill: "Shield (Buckler)" } as const;

export function isReflectiveShield(name: string): boolean {
  return /^reflective force shield$/i.test(baseName(name));
}

// ── stasis and time (pp. 193-195) ───────────────────────────────────────────

/** The divisor a stasis web puts on anything passing through it (p. 193). */
export const STASIS_DIVISOR = 10_000_000;

/** Damage left after a stasis web: effectively none. */
export function throughStasis(damage: number): number {
  return Math.floor(Math.max(0, damage) / STASIS_DIVISOR);
}

/** A stasis generator: seconds to set the duration and to switch it on (p. 194). */
export const STASIS = { setSeconds: 2, activateSeconds: 1, minimumSeconds: 300 } as const;

export function isStasisDevice(name: string): boolean {
  return /^stasis (cube|chamber|belt|grid)$/i.test(baseName(name));
}

/** A life support field: DR 5 against energy, radiation divided by 10, +60°F on the hot side (p. 194). */
export const LIFE_SUPPORT = { dr: 5, radiationDivisor: 10, heatF: 60 } as const;

export function isLifeSupportBelt(name: string): boolean {
  return /^life-support belt$/i.test(baseName(name));
}

/** The tau-shield's power: 180 minutes divided by its Altered Time Rate levels, 18 minutes an infinity (p. 195). */
export const TAU = { minutes: 180, infinityMinutes: 18, maxLevels: 9 } as const;

export function tauMinutes(levels: number): number {
  const n = Math.max(1, Math.min(TAU.maxLevels, Math.floor(levels)));
  return TAU.minutes / n;
}

/** Subjective seconds a tactical tau-shield gives the wearer for each real second: its levels plus one (p. 195). */
export function tauRatio(levels: number): number {
  return Math.max(1, Math.min(TAU.maxLevels, Math.floor(levels))) + 1;
}

/** A stasis key collapses a stasis web at contact range, a stasis disruptor at 10 yards (p. 96). */
export function stasisCollapseRange(name: string): number | null {
  const text = String(name ?? "").trim();
  if (/^stasis key$/i.test(text)) return 1;
  if (/^stasis disruptor$/i.test(text)) return 10;
  return null;
}
