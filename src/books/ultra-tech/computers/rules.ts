/**
 * Ultra-Tech's computers: what a computer's Complexity is by model, tech
 * level and the options it is built with, what it can run at once, what
 * software costs, the Complexity an AI needs, and how long a computer takes
 * to break encryption (pp. 21-25, 27-28, 46-47).
 *
 * The computer rule is the shared engine's (`src/shared/computers/`), which
 * High-Tech prints too at its TLs; this is Ultra-Tech's table for it, the
 * engine's functions with this book's figures, and the book's own AIs and
 * encryption. The options are fields on the computer that change its
 * figures; nothing is attached to it.
 */

import * as engine from "../../../shared/computers/rules.js";
import type { ComputerFigures, HardwareFigures, OptionEffect, SkillDifficulty, ToolGrade, ToolQuality } from "../../../shared/computers/rules.js";

export { programLoad, programsAtOnce, type HardwareFigures, type SkillDifficulty, type ToolQuality } from "../../../shared/computers/rules.js";
export { timeSpentModifier } from "../../../shared/time-spent.js";

/** The standard models, smallest first (p. 22). */
export const COMPUTER_MODELS = ["tiny", "small", "personal", "microframe", "mainframe", "macroframe", "megacomputer"] as const;
export type ComputerModel = (typeof COMPUTER_MODELS)[number];

/** Each model's Complexity and storage in terabytes at TL9 (p. 22). */
export const MODEL_FIGURES: Readonly<Record<ComputerModel, { complexity: number; storage: number }>> = Object.freeze({
  tiny: { complexity: 3, storage: 1 },
  small: { complexity: 4, storage: 10 },
  personal: { complexity: 5, storage: 100 },
  microframe: { complexity: 6, storage: 1_000 },
  mainframe: { complexity: 7, storage: 10_000 },
  macroframe: { complexity: 8, storage: 100_000 },
  megacomputer: { complexity: 9, storage: 1_000_000 },
});

/**
 * What a later tech level adds to every model's Complexity: +2 at TL10 and a
 * further +1 per TL after it (p. 22).
 */
export function complexityForTl(tl: number): number {
  if (!Number.isFinite(tl) || tl <= 9) return 0;
  return tl - 8;
}

/** The storage units by TL: terabytes at TL9, a thousand times more each TL after (p. 22). */
export const STORAGE_UNITS = ["TB", "PB", "EB", "ZB"] as const;

/** The options a computer can be built with (p. 23). */
export const HARDWARE_OPTIONS = ["compact", "fast", "genius", "hardened", "highCapacity", "printed", "quantum", "slow", "ftl"] as const;
export type HardwareOption = (typeof HARDWARE_OPTIONS)[number];
export type HardwareOptions = Readonly<Record<HardwareOption, boolean>>;

export const NO_HARDWARE: HardwareOptions = Object.freeze(Object.fromEntries(HARDWARE_OPTIONS.map((o) => [o, false])) as Record<HardwareOption, boolean>);

/** Each option's changes (p. 23). Cost and weight multiply together; Complexity and LC add. */
export const OPTION_EFFECTS: Readonly<Record<HardwareOption, OptionEffect>> = Object.freeze({
  compact: { cost: 2, weight: 0.5, cells: 0.5 },
  fast: { complexity: 1, cost: 20 },
  genius: { complexity: 2, cost: 500, lc: -1 },
  hardened: { cost: 2, weight: 2, hardening: 3 },
  highCapacity: { cost: 1.5, programs: 1.5 },
  printed: { complexity: -1, storage: 1 / 1000 },
  quantum: { cost: 10, weight: 2, lc: -1 },
  slow: { complexity: -1, storage: 1 / 10, cost: 1 / 20 },
  ftl: { complexity: 1, cost: 100, weight: 2, lc: -1 },
});

/** The options that can't be taken together (p. 23). */
export const EXCLUSIVE_OPTIONS: ReadonlyArray<readonly HardwareOption[]> = Object.freeze([
  ["fast", "slow", "genius"],
  ["printed", "quantum"],
]);

/** Built-in storage bought on top: $1 and 0.001 lb. per unit of the TL's storage (p. 23). */
export const EXTRA_STORAGE = Object.freeze({ cost: 1, weight: 0.001 });

/** The most complex program the Software Cost Table prices at a TL, or 0 where it prices none (p. 25). */
export function highestSoftware(tl: number): number {
  if (!Number.isFinite(tl) || tl < 9) return 0;
  return Math.min(15, 11 + 2 * (tl - 9));
}

/**
 * A program's price by its Complexity and TL (p. 25): $10 for Complexity 1 at
 * TL9, three times that and then ten times the first for each level up, and a
 * tenth as much per TL after TL9. Null where the table has it unavailable.
 */
export function softwareCost(complexity: number, tl: number): number | null {
  const c = Math.floor(complexity);
  if (c < 1 || c > highestSoftware(tl)) return null;
  const atTl9 = c % 2 === 1 ? 10 ** ((c + 1) / 2) : 3 * 10 ** (c / 2);
  return Math.round((atTl9 / 10 ** (tl - 9)) * 100) / 100;
}

/** Mass-market software may be as little as a tenth of the price (p. 24). */
export const MASS_MARKET = 0.1;

/** Ultra-Tech's figures, as the shared computer engine takes them. */
export const COMPUTERS: ComputerFigures = Object.freeze({
  models: COMPUTER_MODELS,
  modelFigures: MODEL_FIGURES,
  defaultModel: "personal",
  printedTl: null,
  complexityForTl,
  storageUnits: Object.freeze({ firstTl: 9, units: STORAGE_UNITS }),
  options: HARDWARE_OPTIONS,
  effects: OPTION_EFFECTS,
  exclusive: EXCLUSIVE_OPTIONS,
  early: null,
  extraStorage: EXTRA_STORAGE,
  softwareCost,
  lowestProgram: 1,
  massMarket: MASS_MARKET,
  // Good needs Complexity 4 for an Easy skill and 5 otherwise; fine 6 and 7 (p. 25).
  tools: Object.freeze({ good: [4, 5] as const, fine: [6, 7] as const }),
});

/** The model a record's name is, or null. */
export const modelByName = (name: string): ComputerModel | null => engine.modelByName(COMPUTERS, name) as ComputerModel | null;

/** The options a set of choices leaves out because another excludes it, first chosen kept. */
export const conflictingOptions = (options: HardwareOptions): HardwareOption[] => engine.conflictingOptions(COMPUTERS, options) as HardwareOption[];

/** The options as they apply: those another option excludes are left out. */
export const effectiveOptions = (options: Partial<HardwareOptions>): HardwareOptions => engine.effectiveOptions(COMPUTERS, options) as HardwareOptions;

/** Multiplies and adds the options' changes together (p. 23). */
export const hardwareFactors = (options: Partial<HardwareOptions>): HardwareFigures => engine.hardwareFactors(COMPUTERS, options);

/** A computer: its model at a TL, with its options and any storage bought on top. */
export interface ComputerBuild extends engine.ComputerBuild {
  model: ComputerModel;
  options: Partial<HardwareOptions>;
}

export type Computer = engine.Computer;

/** Works out a computer (pp. 22-23). */
export const computerFigures = (build: ComputerBuild): Computer => engine.computerFigures(COMPUTERS, build);

/** The Complexity a software tool of a quality needs for a skill of a difficulty (p. 25). */
export const toolComplexity = (quality: ToolQuality, difficulty: SkillDifficulty): number => engine.toolComplexity(COMPUTERS, quality, difficulty)!;

/** The best quality a program of a Complexity is as a tool for a skill: good +1, fine +2 (p. 25). */
export const toolQuality = (complexity: number, difficulty: SkillDifficulty): { quality: ToolGrade; bonus: number } => engine.toolQuality(COMPUTERS, complexity, difficulty);

/** The kinds of digital mind a computer runs (pp. 25, 27-28). */
export const AI_KINDS = ["weakDedicated", "dedicated", "nonVolitional", "volitional", "mindEmulation"] as const;
export type AiKind = (typeof AI_KINDS)[number];

/**
 * The Complexity an AI of an IQ needs, rounded up (pp. 25, 27-28): IQ/2 for a
 * weak dedicated AI, +1 dedicated, +2 non-volitional, +3 volitional, and
 * (IQ+5)/2 for a mind emulation. The Fast lens adds one, Low-Res takes one off.
 */
export function aiComplexity(kind: AiKind, iq: number, lenses: { fast?: boolean; lowRes?: boolean } = {}): number {
  const half = iq / 2;
  const base = kind === "weakDedicated" ? half
    : kind === "dedicated" ? half + 1
      : kind === "nonVolitional" ? half + 2
        : kind === "volitional" ? half + 3
          : (iq + 5) / 2;
  return Math.ceil(base) + (lenses.fast ? 1 : 0) - (lenses.lowRes ? 1 : 0);
}

/** The highest IQ of an AI kind a Complexity runs, or null where it runs none. */
export function highestAiIq(kind: AiKind, complexity: number, lenses: { fast?: boolean; lowRes?: boolean } = {}): number | null {
  let best: number | null = null;
  for (let iq = 1; iq <= 40; iq++) {
    if (aiComplexity(kind, iq, lenses) <= complexity) best = iq;
  }
  return best;
}

/** An AI's Legality Class (p. 25). */
export function aiLegality(kind: AiKind, iq: number): number | null {
  if (kind === "dedicated" || kind === "weakDedicated") return 4;
  if (kind === "nonVolitional") return iq >= 15 ? 3 : 4;
  if (kind === "volitional") {
    if (iq >= 20) return 1;
    if (iq >= 15) return 2;
    if (iq >= 9) return 3;
    return 4;
  }
  return null;
}

/** The two encryption standards (p. 47). */
export type EncryptionStandard = "basic" | "secure";

/**
 * The Complexity that breaks a standard in an hour: 8 for basic and 10 for
 * secure at TL9, +2 per TL after (p. 47).
 */
export function encryptionComplexity(standard: EncryptionStandard, tl: number): number {
  const base = standard === "secure" ? 10 : 8;
  return base + 2 * Math.max(0, tl - 9);
}

/** A quantum computer adds this to its Complexity for decryption (p. 47). */
export const QUANTUM_DECRYPTION = 5;

/**
 * How many hours an attempt at breaking encryption takes (p. 47): an hour at
 * the standard's Complexity, a tenth as long per level above it and in real
 * time (0) at four or more, ten times as long per level below. A quantum
 * computer below it takes 3, 10, 30 ... hours instead.
 */
export function decryptionHours(options: { standard: EncryptionStandard; tl: number; complexity: number; quantum?: boolean }): number {
  const needed = encryptionComplexity(options.standard, options.tl);
  const effective = options.complexity + (options.quantum ? QUANTUM_DECRYPTION : 0);
  const over = effective - needed;
  if (over >= 4) return 0;
  if (over >= 0) return 1 / 10 ** over;
  const under = -over;
  if (!options.quantum) return 10 ** under;
  return under % 2 === 0 ? 10 ** (under / 2) : 3 * 10 ** ((under - 1) / 2);
}

/** A time in hours as the book gives it: hours, minutes or seconds. */
export function hoursText(hours: number): { value: number; unit: "hours" | "minutes" | "seconds" | "realTime" } {
  if (hours <= 0) return { value: 0, unit: "realTime" };
  if (hours >= 1) return { value: Math.round(hours * 100) / 100, unit: "hours" };
  const minutes = hours * 60;
  if (minutes >= 1) return { value: Math.round(minutes * 100) / 100, unit: "minutes" };
  return { value: Math.round(minutes * 60 * 100) / 100, unit: "seconds" };
}
