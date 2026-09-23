/**
 * Prosthetics and elective surgery (High-Tech pp. 225-226).
 *
 * Medical prosthetics are Mitigators (Characters p. 112): while one is worn,
 * the disadvantage it answers is bought off, though many leave a lesser one
 * behind. Elective surgery moves build or Appearance a step per operation, and
 * laser eye surgery cures Bad Sight.
 */

/** A lesser disadvantage a prosthetic leaves while it is worn. */
export interface LeftOver {
  name: string;
  levels?: number;
}

/** One medical prosthetic: what it answers, and what it leaves. */
export interface Prosthetic {
  /** The item's name, as the records carry it. */
  name: RegExp;
  /** The disadvantage it mitigates, by trait name. */
  mitigates: RegExp;
  /** The lesser disadvantages it leaves while worn. */
  leaves: LeftOver[];
  /** Points of reduced Basic Move it also mitigates: a number, or all of them. */
  basicMove: number | "all";
}

const BAD_SIGHT = /^bad sight\b/i;
const HARD_OF_HEARING = /^hard of hearing\b/i;
const ONE_ARM = /^one arm\b/i;
// "Missing Legs" is one of Lame's kinds in the Basic Set (Characters p. 141).
const MISSING_LEGS = /^(lame \(missing legs?\)|missing legs?)$/i;

/**
 * The prosthetics (pp. 225-226). Eyeglasses swap Bad Sight for its mitigated
 * form; contact lenses are treated as glasses. A basic arm leaves the arm
 * crude, Ham-Fisted 2 for it; a basic leg also mitigates a point of reduced
 * Basic Move, an advanced leg all of it. The hearing aid answers Hard of
 * Hearing.
 */
export const PROSTHETICS: readonly Prosthetic[] = Object.freeze([
  { name: /^eyeglasses\b/i, mitigates: BAD_SIGHT, leaves: [], basicMove: 0 },
  { name: /^contact lenses\b/i, mitigates: BAD_SIGHT, leaves: [], basicMove: 0 },
  { name: /^hearing aid\b/i, mitigates: HARD_OF_HEARING, leaves: [], basicMove: 0 },
  { name: /^basic arm prosthetic\b/i, mitigates: ONE_ARM, leaves: [{ name: "Ham-Fisted", levels: 2 }], basicMove: 0 },
  { name: /^advanced arm prosthetic\b/i, mitigates: ONE_ARM, leaves: [], basicMove: 0 },
  { name: /^basic leg prosthetic\b/i, mitigates: MISSING_LEGS, leaves: [], basicMove: 1 },
  { name: /^advanced leg prosthetic\b/i, mitigates: MISSING_LEGS, leaves: [], basicMove: "all" },
]);

/** The prosthetic an item is, or null. */
export function prostheticFor(name: string): Prosthetic | null {
  const text = String(name ?? "").trim();
  return PROSTHETICS.find((p) => p.name.test(text)) ?? null;
}

/** A trait the worn prosthetics take out of play: the trait's index, the item that answers it, and what it leaves. */
export interface Mitigation {
  trait: number;
  by: string;
  leaves: LeftOver[];
}

/**
 * Which of a character's traits the worn prosthetics mitigate. Each
 * prosthetic answers one trait, the first it matches that nothing else has
 * answered; a second pair of glasses changes nothing.
 */
export function mitigations(traits: readonly string[], worn: readonly string[]): Mitigation[] {
  const out: Mitigation[] = [];
  for (const item of worn) {
    const prosthetic = prostheticFor(item);
    if (!prosthetic) continue;
    const trait = traits.findIndex((name, i) => prosthetic.mitigates.test(String(name).trim()) && !out.some((m) => m.trait === i));
    if (trait >= 0) out.push({ trait, by: item, leaves: prosthetic.leaves.map((l) => ({ ...l })) });
  }
  return out;
}

/**
 * The points of reduced Basic Move a worn leg prosthetic gives back (p. 226):
 * one for the basic leg, all for the advanced, the best of those worn. Only
 * for somebody missing a leg, whose reduced Move it is.
 */
export function basicMoveRegained(reduced: number, traits: readonly string[], worn: readonly string[]): number {
  const down = Math.max(0, Math.floor(Number(reduced) || 0));
  if (!down || !traits.some((t) => MISSING_LEGS.test(String(t).trim()))) return 0;
  let best = 0;
  for (const item of worn) {
    const prosthetic = prostheticFor(item);
    if (!prosthetic || prosthetic.mitigates !== MISSING_LEGS) continue;
    best = Math.max(best, prosthetic.basicMove === "all" ? down : Math.min(down, prosthetic.basicMove));
  }
  return best;
}

/** Whether a trait is Bad Sight, which laser eye surgery cures (p. 225). */
export function isBadSight(name: string): boolean {
  return BAD_SIGHT.test(String(name ?? "").trim());
}

// ── elective surgery (p. 225) ──────────────────────────────────────────────

/**
 * Build, in the order surgery moves it a step at a time (p. 225): Very Fat,
 * Fat, Overweight, normal and Skinny (Characters pp. 18-19). Normal build is
 * no trait at all.
 */
export const BUILDS = ["Very Fat", "Fat", "Overweight", "Average", "Skinny"] as const;
export type Build = (typeof BUILDS)[number];

/** A character's build from their traits. */
export function buildOf(traits: readonly string[]): Build {
  const names = traits.map((t) => String(t).trim().toLowerCase());
  for (const build of BUILDS) if (build !== "Average" && names.includes(build.toLowerCase())) return build;
  return "Average";
}

/** The builds one operation reaches: a step either way. */
export function buildSteps(from: Build): Build[] {
  const at = BUILDS.indexOf(from);
  return [BUILDS[at - 1], BUILDS[at + 1]].filter((b): b is Build => Boolean(b));
}

/**
 * Appearance as a step from Average (Characters p. 21): the advantage's
 * levels run Attractive, Beautiful, Handsome, Very Beautiful, Very Handsome,
 * Transcendent (Beautiful and Handsome one step, their "Very" forms the
 * next); the disadvantage's run Unattractive, Ugly, Hideous, Monstrous,
 * Horrific, a step down each.
 */
export interface AppearanceTrait {
  name: string;
  levels: number;
}

const ADVANTAGE_STEP = [0, 1, 2, 2, 3, 3, 4] as const;
const NAMED_STEPS: Record<string, number> = {
  horrific: -5, monstrous: -4, hideous: -3, ugly: -2, unattractive: -1,
  attractive: 1, handsome: 2, beautiful: 2, "very handsome": 3, "very beautiful": 3, transcendent: 4,
};

/** A character's Appearance step, 0 for Average. */
export function appearanceOf(traits: readonly AppearanceTrait[]): number {
  for (const trait of traits) {
    const name = String(trait.name ?? "").trim().toLowerCase();
    const levels = Math.max(1, Math.floor(Number(trait.levels) || 0) || 1);
    if (name === "appearance") return ADVANTAGE_STEP[Math.min(levels, 6)]!;
    if (name === "appearance (disadvantage)") return -Math.min(levels, 5);
    // A trait named for its level, as older records and templates carry it.
    const named = /^(?:appearance \()?([a-z ]+?)\)?$/.exec(name)?.[1] ?? "";
    if (named in NAMED_STEPS) return NAMED_STEPS[named]!;
  }
  return 0;
}

/** An Appearance step's name. */
export const APPEARANCE_NAMES: Record<number, string> = {
  [-5]: "Horrific", [-4]: "Monstrous", [-3]: "Hideous", [-2]: "Ugly", [-1]: "Unattractive",
  0: "Average", 1: "Attractive", 2: "Handsome/Beautiful", 3: "Very Handsome/Very Beautiful", 4: "Transcendent",
};

/**
 * What improving Appearance a step costs, and the TL it needs (p. 225):
 * Attractive $4,000 and Handsome/Beautiful $8,000 at TL7, Very
 * Handsome/Very Beautiful $12,000 at TL8. Each step is its own operation.
 * Those are the only steps the book prices.
 */
export const APPEARANCE_OPERATIONS: Record<number, { tl: number; cost: number }> = {
  1: { tl: 7, cost: 4000 },
  2: { tl: 7, cost: 8000 },
  3: { tl: 8, cost: 12000 },
};

/** A procedure the GM tool offers. */
export type Procedure = "build" | "appearance" | "vision" | "fingerprints";

/** What each procedure costs, the TL it needs, how long recovery takes and its Legality Class (p. 225). */
export const PROCEDURES: Record<Procedure, { tl: number; cost: number; recoveryDays: number; lc: number; perEye?: true; perHand?: true; cinematic?: true }> = {
  // Changing Body: a step of build either way, a week's recovery.
  build: { tl: 7, cost: 5000, recoveryDays: 7, lc: 4 },
  // Improving Appearance: the step's own price, a week per operation.
  appearance: { tl: 7, cost: 0, recoveryDays: 7, lc: 4 },
  // Improving Vision: laser surgery, per eye, a couple of days.
  vision: { tl: 8, cost: 2000, recoveryDays: 2, lc: 4, perEye: true },
  // Removing Fingerprints: cinematic only, per hand.
  fingerprints: { tl: 6, cost: 1000, recoveryDays: 0, lc: 2, perHand: true, cinematic: true },
};

/** One operation planned: what it changes, what it costs, and why it can't be done if it can't. */
export interface Operation {
  procedure: Procedure;
  from: string;
  to: string;
  cost: number;
  recoveryDays: number;
  tl: number;
  /** Why the operation can't be done, as a localization key, or null. */
  refusal: string | null;
}

/**
 * Plans an operation. `toward` is the build to move to, for Changing Body;
 * `eyes` the eyes operated on and `hands` the hands, for the procedures priced
 * by them.
 */
export function planOperation(options: {
  procedure: Procedure;
  techLevel: number;
  build?: Build;
  toward?: Build;
  appearance?: number;
  badSight?: boolean;
  eyes?: number;
  hands?: number;
}): Operation {
  const spec = PROCEDURES[options.procedure];
  const tl = Math.floor(Number(options.techLevel) || 0);
  const base = { procedure: options.procedure, recoveryDays: spec.recoveryDays };
  if (options.procedure === "build") {
    const from = options.build ?? "Average";
    const to = options.toward ?? from;
    const refusal = !buildSteps(from).includes(to) ? "NotABuildStep" : tl < spec.tl ? "TooLowTl" : null;
    return { ...base, from, to, cost: spec.cost, tl: spec.tl, refusal };
  }
  if (options.procedure === "appearance") {
    const from = Math.trunc(Number(options.appearance) || 0);
    const next = APPEARANCE_OPERATIONS[from + 1];
    const needs = next?.tl ?? spec.tl;
    const refusal = !next ? "NoAppearanceStep" : tl < needs ? "TooLowTl" : null;
    return { ...base, from: APPEARANCE_NAMES[from] ?? String(from), to: APPEARANCE_NAMES[from + 1] ?? String(from + 1), cost: next?.cost ?? 0, tl: needs, refusal };
  }
  if (options.procedure === "vision") {
    const eyes = Math.max(1, Math.min(2, Math.floor(Number(options.eyes) || 2)));
    const refusal = !options.badSight ? "NoBadSight" : tl < spec.tl ? "TooLowTl" : null;
    return { ...base, from: "Bad Sight", to: "", cost: spec.cost * eyes, tl: spec.tl, refusal };
  }
  const hands = Math.max(1, Math.min(2, Math.floor(Number(options.hands) || 2)));
  return { ...base, from: "", to: "", cost: spec.cost * hands, tl: spec.tl, refusal: tl < spec.tl ? "TooLowTl" : null };
}
