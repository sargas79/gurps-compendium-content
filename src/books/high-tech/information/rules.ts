/**
 * High-Tech's computers, books and libraries (pp. 17-22).
 *
 * The computers are the shared computer engine's rule (`src/shared/computers/`)
 * at TL6-8: this is High-Tech's table for it. The book prints its models at
 * TL8, with storage in gigabytes; a TL6-7 computer is one of the models built
 * at that TL with one of the three early technologies, each of which takes
 * Complexity off (pp. 20-21). Software is priced by Complexity in two columns,
 * TL6-7 and TL8 (p. 22).
 *
 * The rest is the book's own: a manual or reference work followed while doing
 * a task lets its reader use the skill at the attribute default, even without
 * one, and time spent can win back at most that penalty (p. 17); a library is
 * Research equipment by its grade (p. 18); a head-up display helps a driver or
 * pilot (p. 21).
 */

import type { ComputerFigures, OptionEffect, SkillDifficulty } from "../../../shared/computers/rules.js";
import { timeSpentModifier } from "../../../shared/time-spent.js";

/** The standard models, smallest first (p. 20). */
export const COMPUTER_MODELS = ["tiny", "small", "medium", "microframe", "mainframe", "macroframe", "megacomputer"] as const;
export type ComputerModel = (typeof COMPUTER_MODELS)[number];

/** Each model's Complexity and storage in gigabytes at TL8, and the first TL it is built at (p. 20). */
export const MODEL_FIGURES: Readonly<Record<ComputerModel, { complexity: number; storage: number; tl: number }>> = Object.freeze({
  tiny: { complexity: 1, storage: 1, tl: 8 },
  small: { complexity: 2, storage: 10, tl: 8 },
  medium: { complexity: 3, storage: 100, tl: 8 },
  microframe: { complexity: 4, storage: 1_000, tl: 7 },
  mainframe: { complexity: 5, storage: 10_000, tl: 6 },
  macroframe: { complexity: 6, storage: 100_000, tl: 6 },
  megacomputer: { complexity: 7, storage: 1_000_000, tl: 6 },
});

/** The same figures read as bytes at TL6, kilobytes at TL7 and gigabytes at TL8 (p. 20). */
export const STORAGE_UNITS = ["bytes", "KB", "GB"] as const;

/** The options (p. 20), then the early technologies a TL6-7 computer is built with (pp. 20-21). */
export const HARDWARE_OPTIONS = ["compact", "hardened", "highCapacity", "fast", "slow", "mechanical", "vacuumTube", "transistor"] as const;
export type HardwareOption = (typeof HARDWARE_OPTIONS)[number];

/** The early technologies, one of which a TL6-7 computer must have (p. 20). */
export const EARLY_TECHNOLOGIES: readonly HardwareOption[] = Object.freeze(["mechanical", "vacuumTube", "transistor"]);

/** Each option's changes and the TL it first appears at (pp. 20-21). Cost and weight multiply together; Complexity adds. */
export const OPTION_EFFECTS: Readonly<Record<HardwareOption, OptionEffect>> = Object.freeze({
  compact: { cost: 2, weight: 0.5, tl: 7 },
  hardened: { cost: 2, weight: 2, hardening: 3, tl: 7 },
  highCapacity: { cost: 1.5, programs: 1.5, tl: 7 },
  fast: { complexity: 1, cost: 20, tl: 8 },
  slow: { complexity: -1, cost: 1 / 20, tl: 8 },
  mechanical: { complexity: -5, tl: 6, buildTl: 6 },
  // Hardened at no extra cost (p. 21).
  vacuumTube: { complexity: -4, hardening: 3, tl: 7, buildTl: 7 },
  transistor: { complexity: -3, tl: 7, buildTl: 7 },
});

/**
 * The options that can't be taken together: fast and slow (p. 20), one early
 * technology, and hardening a vacuum-tube computer, which already is.
 */
export const EXCLUSIVE_OPTIONS: ReadonlyArray<readonly HardwareOption[]> = Object.freeze([
  ["fast", "slow"],
  ["mechanical", "vacuumTube", "transistor"],
  ["vacuumTube", "hardened"],
]);

/** The Program Cost Table's TL8 column (p. 22): $30 at Complexity 0, then $100, $300, $1,000 ... */
function tl8Price(complexity: number): number {
  return complexity % 2 === 0 ? 3 * 10 ** (complexity / 2 + 1) : 10 ** ((complexity + 3) / 2);
}

/**
 * A program's price by its Complexity and TL (p. 22): the TL8 column up to
 * Complexity 8, and ten times as much at TL6-7, up to Complexity 7. Null
 * where the table has none: above those, and before TL6.
 */
export function softwareCost(complexity: number, tl: number): number | null {
  const c = Math.floor(complexity);
  if (!Number.isFinite(tl) || tl < 6 || c < 0) return null;
  if (tl >= 8) return c > 8 ? null : tl8Price(c);
  return c > 7 ? null : 10 * tl8Price(c);
}

/** Mass-market software may cost as little as a tenth of the table's price (p. 22). */
export const MASS_MARKET = 0.1;

/** High-Tech's figures, as the shared computer engine takes them. */
export const COMPUTERS: ComputerFigures = Object.freeze({
  models: COMPUTER_MODELS,
  modelFigures: MODEL_FIGURES,
  defaultModel: "medium",
  // The entries describe TL8 computers; an early technology makes one earlier (p. 20).
  printedTl: 8,
  complexityForTl: () => 0,
  storageUnits: Object.freeze({ firstTl: 6, units: STORAGE_UNITS }),
  options: HARDWARE_OPTIONS,
  effects: OPTION_EFFECTS,
  exclusive: EXCLUSIVE_OPTIONS,
  early: Object.freeze({ options: EARLY_TECHNOLOGIES, belowTl: 8 }),
  extraStorage: null,
  softwareCost,
  lowestProgram: 0,
  massMarket: MASS_MARKET,
  // Basic needs Complexity 2 for an Easy skill and 3 otherwise, good 4 and 5, fine 6 and 7 (p. 22).
  tools: Object.freeze({ basic: [2, 3] as const, good: [4, 5] as const, fine: [6, 7] as const }),
});

/** A head-up display gives +1 to skills such as Driving and Piloting (p. 21). */
export const HUD_BONUS = 1;

/** Whether a record is a head-up display. */
export function isHud(name: string): boolean {
  return /\bhead-up display\b|\(HUD\)|^HUD\b/i.test(String(name ?? ""));
}

/** Whether a skill is one a head-up display helps: Driving or Piloting, of any specialty (p. 21). */
export function hudHelps(skill: string): boolean {
  return /^(driving|piloting)\b/i.test(String(skill ?? "").trim());
}

/** The attribute default of a skill of each difficulty: -4 Easy to -7 Very Hard (p. 17). */
export const MANUAL_DEFAULT: Readonly<Record<SkillDifficulty, number>> = Object.freeze({ E: -4, A: -5, H: -6, VH: -7 });

/** Time spent as the Basic Set counts it, in multiples of the task's time (Campaigns p. 346). */
export const TIME_MULTIPLES = [1, 2, 4, 8, 15, 30] as const;

/**
 * Following a manual (p. 17): the skill at its attribute default, and the
 * time-spent bonus, which can at most win that penalty back.
 */
export function manualRoll(attribute: number, difficulty: SkillDifficulty, timeMultiple = 1): { base: number; penalty: number; time: number } {
  const penalty = MANUAL_DEFAULT[difficulty];
  const time = Math.min(-penalty, timeSpentModifier(timeMultiple, 1));
  return { base: attribute + penalty, penalty, time };
}

/** The library grades (p. 18). */
export const LIBRARY_GRADES = ["smallCollection", "basic", "good", "fine"] as const;
export type LibraryGrade = (typeof LIBRARY_GRADES)[number];

/**
 * Each grade's Research modifier: a small collection is improvised equipment,
 * at -2 or worse; a basic library is basic, a good one +1, a fine one +2 (p. 18).
 */
export const LIBRARY_RESEARCH: Readonly<Record<LibraryGrade, number>> = Object.freeze({ smallCollection: -2, basic: 0, good: 1, fine: 2 });

/** A library for magical research, Hidden Lore and the like may cost a hundred times as much (p. 18). */
export const OCCULT_LIBRARY_COST = 100;

/** The grade a record's name is -- "Good Library (per skill)" -- or null. */
export function libraryGrade(name: string): LibraryGrade | null {
  const text = String(name ?? "").toLowerCase();
  if (/\bsmall collection\b/.test(text)) return "smallCollection";
  const match = /\b(basic|good|fine) library\b/.exec(text);
  return match ? (match[1] as LibraryGrade) : null;
}
