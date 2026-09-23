/**
 * High-Tech's lie detection and restraints (pp. 215-217), registered with the
 * system through the add-on API: the book's tables for the shared lie-detector
 * engine (`src/shared/interrogation/`) and restraints engine
 * (`src/shared/restraints/`), each under its own switch.
 *
 *   - **Lie detection (lieDetection):** the polygraphs' row button runs a
 *     Quick Contest of the operator's Electronics Operation (Medical) against
 *     the subject's Will, and the margin, won or lost, goes on Interrogation
 *     rolls against that subject; the VSA and CVSA software give half of it.
 *     A subject with Compulsive Lying gives -5 instead.
 *   - **Restraints (restraintDevices):** shackles, handcuffs, flex cuffs,
 *     leg irons (with or without the ball and chain) and the straitjacket,
 *     put on from the item's sheet: cuffed behind -1 DX and -4 on hands-only
 *     tasks with no weapon use, in front -1 on hands-only tasks and no
 *     one-handed blows; leg irons as Crippled Legs; Escape at each one's
 *     modifier, and Acrobatics or Escape to bring cuffed wrists to the front.
 */

import { LIE_DETECTOR_TABLES, readyLieDetectors, type LieDetectorTable } from "../../../shared/interrogation/index.js";
import type { GWorldApi } from "../../../shared/module.js";
import { RESTRAINT_TABLES, readyRestraints, type Restraint, type RestraintTable } from "../../../shared/restraints/index.js";
import {
  BALL_WEIGHT,
  COMPULSIVE_LYING,
  COMPULSIVE_LYING_TRAIT,
  CUFFED,
  HAND_SKILLS,
  POLYGRAPH_SKILL,
  RESTRAINTS,
  detectorShare,
  legIronsEscape,
  restraintKind,
} from "./rules.js";

const NS = "GCC.HT";
const L = (key: string) => game.i18n.localize(`${NS}.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${NS}.${key}`, data);

const tlOf = (item: any): number | null => {
  const match = /\d+/.exec(String(item?.system?.tl ?? ""));
  return match ? Number(match[0]) : null;
};
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** High-Tech's lie detectors, under its switch's full key. */
export function highTechLieDetectors(switchKey: string): LieDetectorTable {
  return {
    book: "high-tech",
    tls: { min: 0, max: 8 },
    switch: switchKey,
    i18n: NS,
    detector: (item: any) => {
      const share = detectorShare(String(item?.name ?? ""));
      return share === null ? null : { share };
    },
    operator: { skill: POLYGRAPH_SKILL, attribute: "IQ", modifier: -5 },
    unreadable: { trait: COMPULSIVE_LYING_TRAIT, value: COMPULSIVE_LYING },
    lines: (_item: any, detector: { share: number }) => [
      F("LieDetection.Contest", { skill: POLYGRAPH_SKILL }),
      ...(detector.share < 1 ? [L("LieDetection.Half")] : []),
      F("LieDetection.Compulsive", { value: COMPULSIVE_LYING }),
    ],
  };
}

/** A High-Tech restraint's figures: leg irons by their TL. */
function restraintFor(item: any): Restraint | null {
  const kind = restraintKind(String(item?.name ?? ""));
  if (!kind) return null;
  const base = RESTRAINTS[kind];
  return kind === "legIrons" ? { ...base, escape: legIronsEscape(tlOf(item)) } : base;
}

function restraintLines(item: any, restraint: Restraint): string[] {
  const kind = restraintKind(String(item?.name ?? ""))!;
  const figures = RESTRAINTS[kind];
  const lines = [F("Restraints.EscapeLine", { modifier: signed(restraint.escape) })];
  if (figures.dr !== undefined) lines.push(F("Restraints.Toughness", { dr: figures.dr, hp: figures.hp }));
  if (restraint.binds === "wrists") {
    lines.push(F("Restraints.Behind", { dx: CUFFED.behind.dx, hands: CUFFED.behind.hands }));
    lines.push(F("Restraints.Front", { hands: CUFFED.front.hands }));
  } else if (restraint.binds === "body") lines.push(F("Restraints.Straitjacket", { dx: CUFFED.behind.dx }));
  else {
    lines.push(L("Restraints.LegIrons"));
    if (/ball and chain/i.test(String(item?.name ?? ""))) lines.push(F("Restraints.Ball", { weight: BALL_WEIGHT }));
  }
  return lines;
}

/** High-Tech's restraints, under its switch's full key. */
export function highTechRestraints(switchKey: string): RestraintTable {
  return {
    book: "high-tech",
    tls: { min: 0, max: 8 },
    switch: switchKey,
    i18n: NS,
    restraint: restraintFor,
    cuffed: CUFFED,
    handSkills: HAND_SKILLS,
    lines: restraintLines,
  };
}

/** Registers the tables before the world's data is read. */
export function initEnforcement(switches: { lieDetection: string; restraints: string }): void {
  LIE_DETECTOR_TABLES.register(highTechLieDetectors(switches.lieDetection));
  RESTRAINT_TABLES.register(highTechRestraints(switches.restraints));
}

/** Registers the engines' parts, once whichever books ask. */
export function readyEnforcement(api: GWorldApi): void {
  readyLieDetectors(api);
  readyRestraints(api);
}
