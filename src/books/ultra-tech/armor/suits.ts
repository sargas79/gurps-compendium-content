/**
 * GURPS Ultra-Tech's powered suits, as rules the table reads (pp. 181-186):
 * what each exoskeleton and battlesuit adds to its wearer while powered, what
 * Battlesuit skill limits, the weight a suit carries for its wearer, fitting,
 * checking out, and the gravpack's weightless load (p. 75).
 */

import { baseName } from "./rules.js";

/** Which of the wearer's tasks the suit's skill limits. */
export type SuitScope = "all" | "lowerBody" | "arm" | "none";

/** A powered suit's statistics. */
export interface PoweredSuit {
  liftingSt?: number;
  strikingSt?: number;
  /** Arm ST for one arm (p. 181). */
  armSt?: number;
  superJump?: number;
  basicMove?: number;
  /** Enhanced Move (Ground) levels. */
  enhancedMove?: number;
  /** What Battlesuit skill limits while the suit is powered. */
  scope: SuitScope;
  /** A bonus to Battlesuit skill the suit itself gives. */
  skillBonus?: number;
  /** The suit carries its own weight while powered. */
  carriesItself: boolean;
  /** Carries its own weight even with its augmentation switched off (p. 184). */
  carriesItselfUnaugmented?: boolean;
  /** Needs fitting at TL9-10 (p. 182); walkers, the worksuit and cybersuits don't. */
  fitted: boolean;
  /** Can switch its augmentation off (p. 184). */
  switchable?: boolean;
  /** A load it carries weightlessly while powered, in pounds (p. 181). */
  payloadLbs?: number;
  /** Useless without power: no DR, no enhancement (p. 181). */
  nothingUnpowered?: boolean;
  /** Paralyses its wearer when it loses power (p. 182). */
  paralysedUnpowered?: boolean;
  /** Seconds to get in or out when it isn't the usual (p. 182). */
  donSeconds?: number;
  /** Notes the sheet shows: "hamFisted", "badGrip", "sm1", "sm2", "noSmell". */
  notes?: string[];
}

const BATTLESUIT = { scope: "all" as const, carriesItself: true, fitted: true };

/** The book's powered suits, by name without their TL. */
const SUITS: ReadonlyArray<[RegExp, PoweredSuit | ((tl: number) => PoweredSuit)]> = [
  [/^heavy exoskeleton$/i, { ...BATTLESUIT, liftingSt: 12, strikingSt: 8, notes: ["sm1", "hamFisted"] }],
  [/^light exoskeleton$/i, { ...BATTLESUIT, liftingSt: 10, strikingSt: 6 }],
  [/^ranger exoskeleton$/i, { ...BATTLESUIT, liftingSt: 12, strikingSt: 12, superJump: 2 }],
  [/^stealth exoskeleton$/i, { ...BATTLESUIT, liftingSt: 4, strikingSt: 4 }],
  [/^lower[- ]body exoskeleton$/i, { scope: "lowerBody", carriesItself: false, fitted: true, payloadLbs: 70 }],
  [/^power sleeve$/i, { scope: "arm", carriesItself: false, fitted: true, armSt: 6 }],
  [/^exofield belt$/i, { scope: "all", carriesItself: false, fitted: false, liftingSt: 20, strikingSt: 20, superJump: 3, nothingUnpowered: true }],
  [/^(infantry |marine |space )?combat walker$/i, { scope: "all", carriesItself: true, fitted: false, liftingSt: 20, strikingSt: 20, basicMove: 1, paralysedUnpowered: true, notes: ["sm2", "badGrip", "noSmell"] }],
  [/^powered combat armor$/i, { ...BATTLESUIT, liftingSt: 10, strikingSt: 10, superJump: 1 }],
  [/^commando battlesuit$/i, { ...BATTLESUIT, liftingSt: 15, strikingSt: 15, superJump: 2 }],
  [/^heavy battlesuit$/i, { ...BATTLESUIT, liftingSt: 20, strikingSt: 20, basicMove: 2, superJump: 1, notes: ["sm1"] }],
  [/^command battlesuit$/i, { ...BATTLESUIT, liftingSt: 18, strikingSt: 18, basicMove: 3, superJump: 2 }],
  [/^scout battlesuit$/i, { ...BATTLESUIT, liftingSt: 16, strikingSt: 16, basicMove: 4, superJump: 3 }],
  // It cancels its weight but doesn't otherwise add to the wearer's mobility (p. 184).
  [/^hex suit$/i, { ...BATTLESUIT, liftingSt: 8, strikingSt: 4, donSeconds: 60, notes: ["sm1"] }],
  [/^cybersuit$/i, (tl) => ({ scope: "all", carriesItself: true, carriesItselfUnaugmented: true, fitted: false, switchable: true, liftingSt: tl >= 12 ? 8 : 5, strikingSt: tl >= 12 ? 8 : 5, basicMove: 1, superJump: 1 })],
  [/^military cybersuit$/i, { scope: "all", carriesItself: true, carriesItselfUnaugmented: true, fitted: false, switchable: true, liftingSt: 10, strikingSt: 10, basicMove: 1, superJump: 2 }],
  [/^dreadnought battlesuit$/i, { ...BATTLESUIT, liftingSt: 30, strikingSt: 30, basicMove: 3, superJump: 3, notes: ["sm1"] }],
  [/^nanosuit$/i, { scope: "all", carriesItself: true, fitted: false, liftingSt: 10, strikingSt: 10, enhancedMove: 1, superJump: 2, skillBonus: 2 }],
  [/^warsuit$/i, { ...BATTLESUIT, liftingSt: 40, strikingSt: 40, basicMove: 3, superJump: 4 }],
];

/** A piece's powered suit statistics, or null. `tl` is the suit's own. */
export function poweredSuit(name: string, tl: number): PoweredSuit | null {
  const base = baseName(name);
  const found = SUITS.find(([pattern]) => pattern.test(base))?.[1];
  if (!found) return null;
  return typeof found === "function" ? found(tl) : found;
}

/** A suit's state on the sheet. */
export interface SuitState {
  /** Switched on, and with power left. */
  powered: boolean;
  /** Strength augmentation on (only a switchable suit turns it off). */
  augmentation: boolean;
  /** Fitted to its wearer. */
  fitted: boolean;
}

/** What a worn suit adds to its wearer's traits, or null for nothing (pp. 181-185). */
export function suitEffects(suit: PoweredSuit, state: SuitState): Required<Pick<PoweredSuit, "liftingSt" | "strikingSt" | "armSt" | "superJump" | "basicMove" | "enhancedMove">> | null {
  if (!state.powered) return null;
  if (suit.switchable && !state.augmentation) return null;
  return {
    liftingSt: suit.liftingSt ?? 0,
    strikingSt: suit.strikingSt ?? 0,
    armSt: suit.armSt ?? 0,
    superJump: suit.superJump ?? 0,
    basicMove: suit.basicMove ?? 0,
    enhancedMove: suit.enhancedMove ?? 0,
  };
}

/** Whether a worn suit's weight counts toward encumbrance (pp. 181-185). */
export function suitWeightCounts(suit: PoweredSuit, state: SuitState): boolean {
  if (!state.powered) return true;
  if (suit.switchable && !state.augmentation) return !suit.carriesItselfUnaugmented;
  return !suit.carriesItself;
}

/** Whether Battlesuit skill limits DX-based rolls: a powered suit whose augmentation is on, and whose limit reaches all tasks. */
export function suitLimitsDx(suit: PoweredSuit, state: SuitState): boolean {
  if (suit.scope !== "all") return false;
  if (suit.switchable && !state.augmentation) return false;
  return state.powered || !suit.nothingUnpowered;
}

/** Battlesuit skill as the limit reads it: the skill, or its default from the other suit skills or DX (Characters p. 192). */
export function battlesuitLevel(levels: { battlesuit: number | null; vaccSuit: number | null; nbcSuit: number | null; dx: number }, bonus = 0): number {
  const candidates = [
    levels.battlesuit,
    levels.vaccSuit === null ? null : levels.vaccSuit - 2,
    levels.nbcSuit === null ? null : levels.nbcSuit - 2,
    levels.dx - 5,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return Math.max(...candidates) + bonus;
}

/** A DX-based level held to the suit skill (Characters p. 192), less the unfitted suit's penalty (p. 182). */
export function limitedLevel(level: number, suitLevel: number, unfittedPenalty: number): number {
  return Math.min(level, suitLevel) + unfittedPenalty;
}

/** An unfitted TL9-10 suit's penalty to DX and DX-based skills (p. 182); nanogel fits anyone at TL11+. */
export function unfittedPenalty(suit: PoweredSuit, tl: number, fitted: boolean): number {
  if (!suit.fitted || fitted || tl >= 11) return 0;
  return -1;
}

/** Getting into a suit: seconds to step in, to fit a helmet, and to check out, halved by a skill roll (p. 182). */
export const SUIT_UP = { stepIn: 3, helmet: 3, checkout: 30 } as const;
export function checkoutSeconds(suit: PoweredSuit, success: boolean): number {
  const seconds = suit.donSeconds ?? SUIT_UP.checkout;
  return success ? seconds / 2 : seconds;
}

/** Refitting a suit to a new wearer: two hours and an Armoury (Body Armor)+2 roll (p. 182). */
export const REFIT = { hours: 2, skill: "Armoury (Body Armor)", modifier: 2 } as const;

/** The gravpack: up to 120 lbs. carried weightlessly, -1 DX per 40 lbs. until used to it (p. 75). */
export const GRAVPACK = { maxLbs: 120, lbsPerDx: 40 } as const;

export function isGravpack(name: string): boolean {
  return /^gravpack$/i.test(baseName(name));
}

/** The DX penalty a weightless load's mass gives. */
export function gravpackPenalty(loadLbs: number, accustomed: boolean): number {
  if (accustomed) return 0;
  return -Math.floor(Math.max(0, Math.min(GRAVPACK.maxLbs, loadLbs)) / GRAVPACK.lbsPerDx);
}

/**
 * Weight taken off the heaviest of these lines until `lbs` is used up: a
 * weightless load in a pack. Returns each line's weight left.
 */
export function carryWeightless(weights: readonly number[], lbs: number): number[] {
  let left = Math.max(0, lbs);
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0]);
  const out = [...weights];
  for (const [w, i] of order) {
    if (left <= 0) break;
    const taken = Math.min(w, left);
    out[i] = Math.round((w - taken) * 1000) / 1000;
    left -= taken;
  }
  return out;
}
