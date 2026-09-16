/**
 * Ultra-Tech's uploading and downloading: destructive and non-destructive
 * uploads and uploading the dead, mind emulations' Complexity, downloading and
 * its hidden flaws, and low- and very-low-res copies (pp. 219-221).
 */

/** How good a copy of a mind is. */
export type Resolution = "full" | "lowRes" | "veryLowRes" | "failed";

const ORDER: readonly Resolution[] = ["full", "lowRes", "veryLowRes", "failed"];

/** The next resolution down: a full scan becomes low-res, low-res very-low-res. */
export function lowerResolution(resolution: Resolution): Resolution {
  return ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(resolution) + 1)] ?? "failed";
}

/** Destructive uploading rolls Physician-5 and Electronics Operation (Medical)-5 (p. 219). */
export const DESTRUCTIVE_MODIFIER = -5;

/**
 * A destructive upload's result from its two rolls (p. 219): both succeed for
 * a full copy; a failure by 1 leaves a low-res copy, by 2 a very-low-res one,
 * by 3 or more (or a critical failure) nothing. Only one try.
 */
export function destructiveResult(rolls: ReadonlyArray<{ success: boolean; criticalFailure: boolean; margin: number }>): Resolution {
  let result: Resolution = "full";
  for (const roll of rolls) {
    if (roll.success) continue;
    if (roll.criticalFailure || roll.margin >= 3) return "failed";
    const this_: Resolution = roll.margin >= 2 ? "veryLowRes" : "lowRes";
    if (ORDER.indexOf(this_) > ORDER.indexOf(result)) result = this_;
  }
  return result;
}

/**
 * A non-destructive scan (p. 219): an hour and Electronics Operation
 * (Medical). TL10 imaging makes only low-res scans; TL11 makes full ones, or
 * low-res ones in 10 minutes at +2. A critical failure makes a scan one step
 * lower without anyone knowing; any other failure makes nothing, and another
 * try is possible.
 */
export function nonDestructiveResult(options: { tl: number; quickLowRes: boolean; success: boolean; criticalFailure: boolean }): { resolution: Resolution; hidden: boolean } {
  const aimed: Resolution = options.tl <= 10 || options.quickLowRes ? "lowRes" : "full";
  if (options.criticalFailure) return { resolution: lowerResolution(aimed), hidden: true };
  if (!options.success) return { resolution: "failed", hidden: false };
  return { resolution: aimed, hidden: false };
}

/** A quick low-res scan at TL11: 10 minutes at +2 (p. 219). */
export const QUICK_LOW_RES = Object.freeze({ modifier: 2, minutes: 10 });

/** A deliberate low-res copy: +2 to skill, half the time and cost (p. 220). */
export const DELIBERATE_LOW_RES = Object.freeze({ modifier: 2, timeAndCost: 0.5 });

/**
 * Uploading the dead (p. 219): -2 for a corpse, -1 per hour since death
 * unless the brain is preserved or in nanostasis, -3 more if frozen.
 */
export function deadBrainModifier(options: { hoursDead: number; preserved: boolean; frozen: boolean }): number {
  let modifier = -2;
  if (!options.preserved) modifier -= Math.max(0, Math.floor(options.hoursDead));
  if (options.frozen) modifier -= 3;
  return modifier;
}

/** The minutes before death a dead mind's upload loses: 1d x 20 (p. 219). */
export const LOST_MINUTES = Object.freeze({ dice: "1d6", times: 20 });

/** A brain can't be uploaded after total destruction (-10xHP), 5,000+ rads, or a skull or eye death (p. 219). */
export function brainUploadable(options: { hp: number; maxHp: number; rads: number; skullOrEyeDeath: boolean }): boolean {
  if (options.skullOrEyeDeath) return false;
  if (options.rads >= 5000) return false;
  return options.hp > -10 * Math.max(1, options.maxHp);
}

/**
 * A mind emulation's Complexity (p. 220): 4 + IQ/2, rounded up, one less for
 * a being with Fixed IQ. (The Mind Emulation lens on p. 27 gives (IQ+5)/2;
 * the uploading chapter's worked example follows this one.)
 */
export function emulationComplexity(iq: number, fixedIq = false): number {
  return 4 + Math.ceil(iq / 2) - (fixedIq ? 1 : 0);
}

/** A stored mind emulation takes about 100 TB (p. 220). */
export const EMULATION_TB = 100;

/**
 * Downloading (p. 221): Electronics Operation (Medical), -1 into another
 * person of the same species, physiology modifiers into another species.
 * Success replaces the host's mind. Failure destroys the host's brain; a
 * critical failure or failure by 5+ seems to work but hides a flaw, and
 * leaves a low-res copy (very-low-res on a critical failure).
 */
export function downloadResult(roll: { success: boolean; criticalFailure: boolean; margin: number }): { outcome: "replaced" | "brainDestroyed" | "hiddenFlaw"; resolution: Resolution } {
  if (roll.success) return { outcome: "replaced", resolution: "full" };
  if (roll.criticalFailure) return { outcome: "hiddenFlaw", resolution: "veryLowRes" };
  if (roll.margin >= 5) return { outcome: "hiddenFlaw", resolution: "lowRes" };
  return { outcome: "brainDestroyed", resolution: "failed" };
}

export const SAME_SPECIES_OTHER_PERSON = -1;

/** The hidden flaws a botched download may carry (p. 221). */
export const HIDDEN_FLAWS = ["partialAmnesia", "splitPersonality", "wrongEmulation"] as const;

/** What a low- or very-low-res copy does to a character (p. 220). */
export interface CopyEffects {
  /** The fraction of skill points kept. */
  skillPoints: number;
  iq: number;
  /** Traits added, by name and cost. */
  add: Array<{ name: string; points: number }>;
  /** Whether Flashbacks (Mild) comes with a 50% chance. */
  flashbacksChance: boolean;
  /** Advantages lost: those based on emotional sensitivity. */
  lose: readonly string[];
}

export const EMOTIONAL_ADVANTAGES = ["Charisma", "Empathy", "Fashion Sense", "Rapier Wit"] as const;

export function copyEffects(resolution: Resolution, partialAmnesia = true): CopyEffects | null {
  if (resolution === "lowRes") {
    return { skillPoints: 0.5, iq: 0, add: partialAmnesia ? [{ name: "Amnesia (Partial)", points: -10 }] : [], flashbacksChance: partialAmnesia, lose: [] };
  }
  if (resolution === "veryLowRes") {
    return { skillPoints: 0.25, iq: -1, add: [{ name: "Amnesia (Total)", points: -25 }], flashbacksChance: true, lose: EMOTIONAL_ADVANTAGES };
  }
  return null;
}

/** Skill points after a copy keeps a fraction of them, rounded down (p. 220). */
export function copiedSkillPoints(points: number, fraction: number): number {
  return Math.floor(points * fraction);
}

/** A personality overlay's blend: Split Personality with -10 to -30 points of other mental disadvantages each (p. 221). */
export const OVERLAY_DISADVANTAGES = Object.freeze({ least: -10, most: -30 });
