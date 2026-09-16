/**
 * Ultra-Tech's computers: what a computer's Complexity is by model, tech
 * level and the options it is built with, what it can run at once, what
 * software costs, the Complexity an AI needs, and how long a computer takes
 * to break encryption (pp. 21-25, 27-28, 46-47).
 *
 * The options are fields on the computer that change its figures; nothing is
 * attached to it.
 */

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

/** The model a record's name is, or null. */
export function modelByName(name: string): ComputerModel | null {
  const text = String(name ?? "").trim().toLowerCase();
  const found = COMPUTER_MODELS.find((model) => text === model || text === `${model} computer`);
  return found ?? null;
}

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

interface OptionEffect {
  complexity?: number;
  cost?: number;
  weight?: number;
  lc?: number;
  /** A factor on the data the computer stores. */
  storage?: number;
  /** A factor on the programs it runs at once. */
  programs?: number;
  /** A factor on its power cells and its operating time. */
  cells?: number;
  /** Added to HT against attacks on electrical gadgets. */
  hardening?: number;
}

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

/** The options a set of choices leaves out because another excludes it, first chosen kept. */
export function conflictingOptions(options: HardwareOptions): HardwareOption[] {
  const dropped: HardwareOption[] = [];
  for (const group of EXCLUSIVE_OPTIONS) {
    const chosen = group.filter((option) => options[option]);
    dropped.push(...chosen.slice(1));
  }
  return dropped;
}

/** The options as they apply: those another option excludes are left out. */
export function effectiveOptions(options: Partial<HardwareOptions>): HardwareOptions {
  const whole = { ...NO_HARDWARE, ...options } as Record<HardwareOption, boolean>;
  for (const option of conflictingOptions(whole)) whole[option] = false;
  return whole;
}

/** What a computer built with these options is, relative to the model's figures. */
export interface HardwareFigures {
  complexity: number;
  cost: number;
  weight: number;
  lc: number;
  storage: number;
  programs: number;
  cells: number;
  hardening: number;
}

/** Multiplies and adds the options' changes together (p. 23). */
export function hardwareFactors(options: Partial<HardwareOptions>): HardwareFigures {
  const chosen = effectiveOptions(options);
  const figures: HardwareFigures = { complexity: 0, cost: 1, weight: 1, lc: 0, storage: 1, programs: 1, cells: 1, hardening: 0 };
  for (const option of HARDWARE_OPTIONS) {
    if (!chosen[option]) continue;
    const effect = OPTION_EFFECTS[option];
    figures.complexity += effect.complexity ?? 0;
    figures.lc += effect.lc ?? 0;
    figures.hardening += effect.hardening ?? 0;
    figures.cost *= effect.cost ?? 1;
    figures.weight *= effect.weight ?? 1;
    figures.storage *= effect.storage ?? 1;
    figures.programs *= effect.programs ?? 1;
    figures.cells *= effect.cells ?? 1;
  }
  return figures;
}

/** Built-in storage bought on top: $1 and 0.001 lb. per unit of the TL's storage (p. 23). */
export const EXTRA_STORAGE = Object.freeze({ cost: 1, weight: 0.001 });

/** A computer: its model at a TL, with its options and any storage bought on top. */
export interface ComputerBuild {
  model: ComputerModel;
  tl: number;
  options: Partial<HardwareOptions>;
  /** Units of the TL's storage bought on top (terabytes at TL9). */
  extraStorage?: number;
  /** The Legality Class of the record, before the options change it. */
  lc?: number | null;
}

/** A computer's worked-out figures. */
export interface Computer {
  complexity: number;
  /** In units of the TL's storage: terabytes at TL9, petabytes at TL10, and so on. */
  storage: number;
  storageUnit: (typeof STORAGE_UNITS)[number];
  /** Factors on the list price and weight, and what extra storage adds to each. */
  costFactor: number;
  weightFactor: number;
  extraCost: number;
  extraWeight: number;
  lc: number | null;
  /** Programs of its own Complexity it runs at once. */
  programsAtOwn: number;
  cellFactor: number;
  hardening: number;
}

/** Works out a computer (pp. 22-23). */
export function computerFigures(build: ComputerBuild): Computer {
  const model = MODEL_FIGURES[build.model];
  const factors = hardwareFactors(build.options);
  const tl = Number.isFinite(build.tl) ? build.tl : 9;
  const unit = STORAGE_UNITS[Math.max(0, Math.min(STORAGE_UNITS.length - 1, tl - 9))] ?? "TB";
  const extra = Math.max(0, Number(build.extraStorage) || 0);
  return {
    complexity: Math.max(0, model.complexity + complexityForTl(tl) + factors.complexity),
    storage: model.storage * factors.storage + extra,
    storageUnit: unit,
    costFactor: factors.cost,
    weightFactor: factors.weight,
    extraCost: extra * EXTRA_STORAGE.cost,
    extraWeight: extra * EXTRA_STORAGE.weight,
    lc: typeof build.lc === "number" ? Math.max(0, build.lc + factors.lc) : null,
    programsAtOwn: 2 * factors.programs,
    cellFactor: factors.cells,
    hardening: factors.hardening,
  };
}

/**
 * How many programs of a Complexity a computer runs at once: two of its own
 * Complexity, ten times as many per level below it, none above it; a
 * high-capacity computer half again as many (p. 22-23).
 */
export function programsAtOnce(computerComplexity: number, programComplexity: number, programsAtOwn = 2): number {
  const below = computerComplexity - programComplexity;
  if (below < 0) return 0;
  return programsAtOwn * 10 ** below;
}

/**
 * The share of a computer's capacity a set of programs takes, 1 being all of
 * it; a program above its Complexity can't run at all and makes it Infinity.
 */
export function programLoad(computerComplexity: number, programs: readonly number[], programsAtOwn = 2): number {
  let load = 0;
  for (const complexity of programs) {
    const room = programsAtOnce(computerComplexity, complexity, programsAtOwn);
    if (!room) return Infinity;
    load += 1 / room;
  }
  return load;
}

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

export type SkillDifficulty = "E" | "A" | "H" | "VH";
export type ToolQuality = "good" | "fine";

/** The Complexity a software tool of a quality needs for a skill of a difficulty (p. 25). */
export function toolComplexity(quality: ToolQuality, difficulty: SkillDifficulty): number {
  const easy = difficulty === "E";
  if (quality === "good") return easy ? 4 : 5;
  return easy ? 6 : 7;
}

/** The best quality a program of a Complexity is as a tool for a skill: good +1, fine +2 (p. 25). */
export function toolQuality(complexity: number, difficulty: SkillDifficulty): { quality: ToolQuality | "basic"; bonus: number } {
  if (complexity >= toolComplexity("fine", difficulty)) return { quality: "fine", bonus: 2 };
  if (complexity >= toolComplexity("good", difficulty)) return { quality: "good", bonus: 1 };
  return { quality: "basic", bonus: 0 };
}

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

/**
 * The Basic Set's modifier for time spent against a base time (Campaigns
 * p. 346): +1 for twice as long up to +5 for 30 times; -1 per 10% less, to
 * -9 at a tenth. The decryption roll takes it instead of the codes' modifiers
 * (p. 47).
 */
export function timeSpentModifier(spent: number, base: number): number {
  if (!(base > 0) || !(spent > 0)) return 0;
  const ratio = spent / base;
  if (ratio >= 1) {
    const steps: Array<[number, number]> = [[30, 5], [15, 4], [8, 3], [4, 2], [2, 1]];
    return steps.find(([times]) => ratio >= times)?.[1] ?? 0;
  }
  const less = Math.floor(Math.round((1 - ratio) * 1000) / 100);
  return -Math.min(9, less);
}

/** A time in hours as the book gives it: hours, minutes or seconds. */
export function hoursText(hours: number): { value: number; unit: "hours" | "minutes" | "seconds" | "realTime" } {
  if (hours <= 0) return { value: 0, unit: "realTime" };
  if (hours >= 1) return { value: Math.round(hours * 100) / 100, unit: "hours" };
  const minutes = hours * 60;
  if (minutes >= 1) return { value: Math.round(minutes * 100) / 100, unit: "minutes" };
  return { value: Math.round(minutes * 60 * 100) / 100, unit: "seconds" };
}
