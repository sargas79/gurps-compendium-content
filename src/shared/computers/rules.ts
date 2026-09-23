/**
 * The computer engine's arithmetic, for every book that prints the rule
 * (Ultra-Tech pp. 21-25; High-Tech pp. 19-22 at TL6-8): what a computer's
 * Complexity and storage are by its model, its tech level and the options it
 * is built with, what it runs at once, what software costs, and the
 * Complexity a software tool needs to be good or fine.
 *
 * Each book gives its own figures -- its models, its options, its software
 * prices -- in a `ComputerFigures` table. The options are fields on the
 * computer that change its figures; nothing is attached to it.
 */

export type SkillDifficulty = "E" | "A" | "H" | "VH";
export type ToolQuality = "good" | "fine";
/** What a program is as a tool: "none" where a book says it is too simple to use the skill with at all. */
export type ToolGrade = ToolQuality | "basic" | "none";

/** A model's Complexity and storage, as its book prints them. */
export interface ModelFigures {
  complexity: number;
  /** In the book's storage unit at the TL it prints its models at. */
  storage: number;
  /** The first TL the model is built at, where the book gives one. */
  tl?: number;
}

/** What an option changes. Cost and weight multiply together; Complexity, LC and hardening add. */
export interface OptionEffect {
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
  /** The first TL the option is built at; a computer of an earlier TL can't have it. */
  tl?: number;
  /** An early technology: the TL a computer built with it is. */
  buildTl?: number;
}

/** One book's figures for the engine. */
export interface ComputerFigures {
  /** The standard models, smallest first. */
  models: readonly string[];
  modelFigures: Readonly<Record<string, ModelFigures>>;
  /** The model an item made a computer by hand starts as: the book's typical desktop. */
  defaultModel: string;
  /**
   * The TL the models' figures describe, or null where they are the item's
   * own TL's, with `complexityForTl` added.
   */
  printedTl: number | null;
  /** What a TL adds to every model's Complexity. */
  complexityForTl: (tl: number) => number;
  /** The storage unit at each TL from `firstTl` on; the last carries on past the end. */
  storageUnits: { firstTl: number; units: readonly string[] };
  /** The options a computer can be built with. */
  options: readonly string[];
  effects: Readonly<Record<string, OptionEffect>>;
  /** Options that can't be taken together; the first chosen is kept. */
  exclusive: ReadonlyArray<readonly string[]>;
  /** Options one of which a computer below `belowTl` must be built with. */
  early: { options: readonly string[]; belowTl: number } | null;
  /** Built-in storage bought on top, per unit of the TL's storage; null where the book sells none. */
  extraStorage: { cost: number; weight: number } | null;
  /** A program's price by its Complexity and the TL it is bought at; null where the book has it unavailable. */
  softwareCost: (complexity: number, tl: number) => number | null;
  /** The least Complexity a program is rated at. */
  lowestProgram: number;
  /** Mass-market software may cost this fraction of the price. */
  massMarket: number;
  /**
   * The Complexity a software tool of each grade needs, for an Easy skill
   * and for any other; `basic` where the book says a skill needs a program
   * of that Complexity to be used at all.
   */
  tools: { basic?: readonly [number, number]; good: readonly [number, number]; fine: readonly [number, number] };
}

export type HardwareOptions = Readonly<Record<string, boolean>>;

/** Every option of a table, off. */
export function noOptions(figures: ComputerFigures): Record<string, boolean> {
  return Object.fromEntries(figures.options.map((o) => [o, false]));
}

/** The model a record's name is -- "Personal Computer", "Megacomputer" -- or null. */
export function modelByName(figures: ComputerFigures, name: string): string | null {
  const text = String(name ?? "").trim().toLowerCase();
  const found = figures.models.find((model) => text === model.toLowerCase() || text === `${model.toLowerCase()} computer`);
  return found ?? null;
}

/** The options another option excludes, the first chosen kept. */
function excluded(figures: ComputerFigures, options: Partial<HardwareOptions>): string[] {
  const dropped: string[] = [];
  for (const group of figures.exclusive) {
    const chosen = group.filter((option) => options[option]);
    dropped.push(...chosen.slice(1));
  }
  return dropped;
}

/**
 * The TL a computer is built at: the one its early technology sets, else the
 * TL its book prints its models at, else its own.
 */
export function buildTl(figures: ComputerFigures, options: Partial<HardwareOptions>, tl: number): number {
  const dropped = excluded(figures, options);
  const early = figures.options.find((o) => options[o] && !dropped.includes(o) && figures.effects[o]?.buildTl !== undefined);
  if (early) return figures.effects[early]!.buildTl!;
  return figures.printedTl ?? tl;
}

/**
 * The options a set of choices leaves out: those another option excludes,
 * the first chosen kept, and those not built yet at the computer's TL.
 */
export function conflictingOptions(figures: ComputerFigures, options: Partial<HardwareOptions>, tl: number | null = null): string[] {
  const dropped = excluded(figures, options);
  if (tl === null) return dropped;
  const at = buildTl(figures, options, tl);
  for (const option of figures.options) {
    const first = figures.effects[option]?.tl;
    if (options[option] && !dropped.includes(option) && first !== undefined && first > at) dropped.push(option);
  }
  return dropped;
}

/** The options as they apply: those left out are dropped. */
export function effectiveOptions(figures: ComputerFigures, options: Partial<HardwareOptions>, tl: number | null = null): Record<string, boolean> {
  const whole: Record<string, boolean> = { ...noOptions(figures) };
  for (const option of figures.options) whole[option] = Boolean(options[option]);
  for (const option of conflictingOptions(figures, whole, tl)) whole[option] = false;
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

/** Multiplies and adds the options' changes together. */
export function hardwareFactors(figures: ComputerFigures, options: Partial<HardwareOptions>, tl: number | null = null): HardwareFigures {
  const chosen = effectiveOptions(figures, options, tl);
  const result: HardwareFigures = { complexity: 0, cost: 1, weight: 1, lc: 0, storage: 1, programs: 1, cells: 1, hardening: 0 };
  for (const option of figures.options) {
    if (!chosen[option]) continue;
    const effect = figures.effects[option] ?? {};
    result.complexity += effect.complexity ?? 0;
    result.lc += effect.lc ?? 0;
    result.hardening += effect.hardening ?? 0;
    result.cost *= effect.cost ?? 1;
    result.weight *= effect.weight ?? 1;
    result.storage *= effect.storage ?? 1;
    result.programs *= effect.programs ?? 1;
    result.cells *= effect.cells ?? 1;
  }
  return result;
}

/** A computer: its model at a TL, with its options and any storage bought on top. */
export interface ComputerBuild {
  model: string;
  tl: number;
  options: Partial<HardwareOptions>;
  /** Units of the TL's storage bought on top. */
  extraStorage?: number;
  /** The Legality Class of the record, before the options change it. */
  lc?: number | null;
}

/** Something about a computer's design its book says can't be so. */
export type DesignProblem = "belowZero" | "needsEarly" | "modelTooLate";

/** A computer's worked-out figures. */
export interface Computer {
  complexity: number;
  /** In units of the TL's storage. */
  storage: number;
  storageUnit: string;
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
  /** The TL it is built at. */
  tl: number;
  problems: DesignProblem[];
}

/** The storage unit at a TL. */
export function storageUnit(figures: ComputerFigures, tl: number): string {
  const { firstTl, units } = figures.storageUnits;
  return units[Math.max(0, Math.min(units.length - 1, tl - firstTl))] ?? units[0] ?? "";
}

/** Works out a computer. */
export function computerFigures(figures: ComputerFigures, build: ComputerBuild): Computer {
  const model = figures.modelFigures[build.model] ?? { complexity: 0, storage: 0 };
  const itemTl = Number.isFinite(build.tl) ? build.tl : (figures.printedTl ?? 0);
  const tl = buildTl(figures, build.options, itemTl);
  const factors = hardwareFactors(figures, build.options, itemTl);
  const extra = figures.extraStorage ? Math.max(0, Number(build.extraStorage) || 0) : 0;
  const raw = model.complexity + figures.complexityForTl(tl) + factors.complexity;
  const problems: DesignProblem[] = [];
  if (raw < 0) problems.push("belowZero");
  const early = figures.early;
  if (early && itemTl < early.belowTl && !early.options.some((o) => effectiveOptions(figures, build.options, itemTl)[o])) problems.push("needsEarly");
  if (model.tl !== undefined && model.tl > tl) problems.push("modelTooLate");
  return {
    complexity: Math.max(0, raw),
    storage: model.storage * factors.storage + extra,
    storageUnit: storageUnit(figures, tl),
    costFactor: factors.cost,
    weightFactor: factors.weight,
    extraCost: extra * (figures.extraStorage?.cost ?? 0),
    extraWeight: extra * (figures.extraStorage?.weight ?? 0),
    lc: typeof build.lc === "number" ? Math.max(0, build.lc + factors.lc) : null,
    programsAtOwn: 2 * factors.programs,
    cellFactor: factors.cells,
    hardening: factors.hardening,
    tl,
    problems,
  };
}

/**
 * How many programs of a Complexity a computer runs at once: two of its own
 * Complexity, ten times as many per level below it, none above it (Basic Set
 * p. 472); a high-capacity computer half again as many.
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

/** The Complexity a software tool of a grade needs for a skill of a difficulty; null where the book sets none. */
export function toolComplexity(figures: ComputerFigures, grade: ToolQuality | "basic", difficulty: SkillDifficulty): number | null {
  const pair = figures.tools[grade];
  if (!pair) return null;
  return difficulty === "E" ? pair[0] : pair[1];
}

/** The best grade a program of a Complexity is as a tool for a skill: good +1, fine +2. */
export function toolQuality(figures: ComputerFigures, complexity: number, difficulty: SkillDifficulty): { quality: ToolGrade; bonus: number } {
  if (complexity >= toolComplexity(figures, "fine", difficulty)!) return { quality: "fine", bonus: 2 };
  if (complexity >= toolComplexity(figures, "good", difficulty)!) return { quality: "good", bonus: 1 };
  const basic = toolComplexity(figures, "basic", difficulty);
  if (basic !== null && complexity < basic) return { quality: "none", bonus: 0 };
  return { quality: "basic", bonus: 0 };
}
