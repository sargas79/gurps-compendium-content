/**
 * Ultra-Tech's neural, psionic, microwave-pain and sonic beams (pp. 120-126,
 * 132): the settings a neural or mind disruptor is built with, what a failed
 * roll against each does, and who is out of their reach.
 */

import type { BeamFamily } from "./rules.js";
import { marginOfFailure } from "../../../shared/margin.js";

/** A neural disruptor's settings (pp. 121-122). */
export const NEURAL_SETTINGS = ["agony", "ecstasy", "neuralStun", "paralysis", "seizure", "deathBeam"] as const;
/** A mind disruptor's settings (p. 132). */
export const MIND_SETTINGS = ["hypnogogic", "deathBeam", "insanity", "psionicNeutralizer"] as const;
export type BeamSetting = (typeof NEURAL_SETTINGS)[number] | (typeof MIND_SETTINGS)[number];

/** The settings a family can be built with, in the order the book lists them. */
export function settingsFor(family: BeamFamily): readonly BeamSetting[] {
  if (family === "neural") return NEURAL_SETTINGS;
  if (family === "mindDisruptor") return MIND_SETTINGS;
  return [];
}

/** "Each extra setting after the first adds +50% to cost" (pp. 121, 122, 132). */
export function tunableFactor(built: number): number {
  return 1 + 0.5 * Math.max(0, Math.floor(Number(built) || 0) - 1);
}

/** One thing a failed roll does: a condition, for how long, and a line to say. */
export interface BeamOutcome {
  /** The system's condition to apply, or null for a line alone. */
  condition: string | null;
  /** Seconds it lasts; null until removed. */
  seconds: number | null;
  /** The key of the line that explains it. */
  note: string;
}

const minutes = (margin: number) => Math.max(1, margin) * 60;

/** A failure by this much or more is the worse outcome the book gives. */
export const WORSE_MARGIN = 5;

/**
 * What a failed roll against a neural disruptor does (p. 121): the setting's
 * affliction for minutes equal to the margin, with Agony and Ecstasy leaving
 * pain or euphoria after, and a heart attack on a failure by 5 or more; a death
 * beam's is a heart attack on any failure (p. 122).
 */
export function neuralOutcome(setting: BeamSetting, margin: number): BeamOutcome[] {
  const m = marginOfFailure(margin);
  const worse = m >= WORSE_MARGIN;
  switch (setting) {
    case "agony":
      return [{ condition: "agony", seconds: minutes(m), note: "Neural.agony" }, ...(worse ? [{ condition: "heartAttack", seconds: null, note: "Neural.heartAttack" }] : [])];
    case "ecstasy":
      return [{ condition: "ecstasy", seconds: minutes(m), note: "Neural.ecstasy" }, ...(worse ? [{ condition: "heartAttack", seconds: null, note: "Neural.heartAttack" }] : [])];
    case "neuralStun":
      return [{ condition: "unconscious", seconds: minutes(m), note: "Neural.neuralStun" }];
    case "paralysis":
      return [{ condition: "paralysis", seconds: minutes(m), note: "Neural.paralysis" }];
    case "seizure":
      return [{ condition: "seizure", seconds: minutes(m), note: "Neural.seizure" }];
    case "deathBeam":
      return [{ condition: "heartAttack", seconds: null, note: "Neural.deathBeam" }];
    default:
      return [];
  }
}

/**
 * What a failed Will roll against a mind disruptor does (p. 132).
 */
export function mindOutcome(setting: BeamSetting, margin: number): BeamOutcome[] {
  const m = marginOfFailure(margin);
  const worse = m >= WORSE_MARGIN;
  switch (setting) {
    case "hypnogogic":
      // Dazed for minutes; failing by 5 or more, unconscious first and dazed after.
      return worse
        ? [{ condition: "unconscious", seconds: minutes(m), note: "Mind.hypnogogicWorse" }]
        : [{ condition: "daze", seconds: minutes(m), note: "Mind.hypnogogic" }];
    case "deathBeam":
      // Choking for twice the margin in seconds; by 5 or more, a heart attack too.
      return [{ condition: "choking", seconds: Math.max(1, m) * 2, note: "Mind.deathBeam" }, ...(worse ? [{ condition: "heartAttack", seconds: null, note: "Mind.heartAttack" }] : [])];
    case "insanity":
      return worse
        ? [{ condition: "coma", seconds: null, note: "Mind.insanityWorse" }]
        : [{ condition: "hallucinating", seconds: minutes(m), note: "Mind.insanity" }];
    case "psionicNeutralizer":
      return [{ condition: null, seconds: minutes(m), note: "Mind.psionicNeutralizer" }];
    default:
      return [];
  }
}

/** A mindripper: a coma, and amnesia for good on a failure by 5 or more (p. 122). */
export function mindripperOutcome(margin: number): BeamOutcome[] {
  const m = marginOfFailure(margin);
  return [{ condition: "coma", seconds: null, note: m >= WORSE_MARGIN ? "Mindripper.worse" : "Mindripper.coma" }];
}

/**
 * A nauseator (p. 125): Hard of Hearing and Moderate Pain for minutes equal to
 * the margin; by 5 or more, Deafness and retching besides.
 */
export function nauseatorOutcome(margin: number): BeamOutcome[] {
  const m = marginOfFailure(margin);
  return m >= WORSE_MARGIN
    ? [{ condition: "moderatePain", seconds: minutes(m), note: "Nauseator.pain" }, { condition: "retching", seconds: minutes(m), note: "Nauseator.worse" }]
    : [{ condition: "moderatePain", seconds: minutes(m), note: "Nauseator.pain" }];
}

/** Who a beam can't reach at all. */
export interface Target {
  traits: readonly string[];
  iq: number | null;
  sealed: boolean;
  deaf: boolean;
  injuryTolerance: { diffuse?: boolean; noBrain?: boolean; homogenous?: boolean; unliving?: boolean };
}

/**
 * The reason a beam of this family has no effect on this target, or null.
 * Neural beams need a nervous system and reach nobody sealed (p. 121); a mind
 * disruptor needs a mind (p. 132); a nauseator needs ears (p. 125).
 */
export function immunity(family: BeamFamily, target: Target): string | null {
  const machine = target.traits.some((name) => /^machine\b/i.test(name));
  const it = target.injuryTolerance;
  if (family === "neural" || family === "mindripper") {
    if (machine || it.diffuse || it.noBrain || it.homogenous || it.unliving) return "noNerves";
    if (target.sealed) return "sealed";
  }
  if (family === "mindDisruptor") {
    if (target.iq === 0 || target.traits.some((name) => /^digital mind\b/i.test(name))) return "noMind";
  }
  if (family === "nauseator" && target.deaf) return "deaf";
  return null;
}

/** What helps resist: Mind Shield's levels against a mind disruptor, Protected Hearing's +5 against a nauseator. */
export function senseResistBonus(family: BeamFamily, target: { traits: readonly string[]; protectedHearing: boolean }): number {
  if (family === "mindDisruptor") {
    const shield = target.traits.map((name) => /^mind shield\b\D*(\d+)?/i.exec(name)).find(Boolean);
    return shield ? Math.max(1, Number(shield[1]) || 1) : 0;
  }
  if (family === "nauseator") return target.protectedHearing ? 5 : 0;
  return 0;
}

/**
 * What a screamer's injury does to a living target's hearing (p. 125): Hard of
 * Hearing past half its HP, Deafness past two-thirds, until the injury heals.
 */
export function screamerHearing(injury: number, maxHp: number): "" | "hardOfHearing" | "deafness" {
  const hp = Math.max(0, Number(maxHp) || 0);
  const hurt = Math.max(0, Number(injury) || 0);
  if (!hp) return "";
  if (hurt > (hp * 2) / 3) return "deafness";
  if (hurt > hp / 2) return "hardOfHearing";
  return "";
}

/**
 * The condition that follows another once it ends (pp. 121, 132): Moderate Pain
 * after Agony and Euphoria after Ecstasy, "for an equal length of time"; a
 * hypnogogic beam's victim knocked out is dazed after, for as long.
 */
export function followingCondition(setting: BeamSetting, condition: string): string | null {
  if (setting === "agony" && condition === "agony") return "moderatePain";
  if (setting === "ecstasy" && condition === "ecstasy") return "euphoria";
  if (setting === "hypnogogic" && condition === "unconscious") return "daze";
  return null;
}
