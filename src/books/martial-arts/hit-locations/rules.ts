/**
 * New hit locations (GURPS Martial Arts p. 137): the pure rules for the ear,
 * jaw, joints, nose, spine, and veins and arteries, the finer random rolls on
 * the Basic Set's locations, and what a wound to the ear, nose or spine does.
 */

export type Parent = "torso" | "skull" | "face" | "neck" | "vitals" | "arm" | "leg" | "hand" | "foot";
export type Arc = "front" | "side" | "back";

/** The damage types that pierce: impaling and the piercing kinds. */
export const PIERCING = ["imp", "pi-", "pi", "pi+", "pi++"] as const;

/** Why a location may be missing from a body (p. 137): the traits that take each away. */
export type Removal = "diffuse" | "homogenous" | "noBlood" | "noHead" | "noNeck" | "invertebrate";

export interface LocationDefinition {
  key: string;
  parent: Parent;
  penalty: number;
  damageTypes?: string[];
  arcs?: Arc[];
  /** Added to the parent's wounding modifier. */
  woundingAdd?: number;
  /** A wounding modifier in place of the parent's. */
  wounding?: number;
  cripplingDivisor?: number | null;
  extraDr?: number;
  missFallback?: string | null;
  knockdownCrushing?: number;
  shockKnockdown?: boolean;
  majorWoundKnockdown?: number;
  removedBy: Removal[];
}

const TIGHT = ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++", "burn"];
const BLEEDING = ["cut", "imp", "pi-", "pi", "pi+", "pi++", "burn"];

/**
 * The book's locations, registered under their Basic Set parents. A joint or
 * vein takes its parent's side of the body; the ear can be sliced off with a
 * cut aimed to do it; the skull and face have from-behind versions at their
 * changed penalties; and crushing blows may target the vitals.
 */
export const LOCATIONS: readonly LocationDefinition[] = [
  { key: "ear", parent: "face", penalty: -7, removedBy: ["noHead"] },
  // "Unless a cut aimed to slice it off": injury over HP/4 is lost, and it is a
  // major wound without the face's -5 to knockdown.
  { key: "earSlice", parent: "face", penalty: -7, damageTypes: ["cut"], cripplingDivisor: 4, majorWoundKnockdown: 0, removedBy: ["noHead"] },
  { key: "jaw", parent: "face", penalty: -6, arcs: ["front"], knockdownCrushing: -1, removedBy: ["noHead"] },
  { key: "nose", parent: "face", penalty: -7, arcs: ["front"], removedBy: ["noHead"] },
  { key: "spine", parent: "torso", penalty: -8, arcs: ["back"], extraDr: 3, shockKnockdown: true, majorWoundKnockdown: -5, missFallback: "torso", removedBy: ["diffuse", "homogenous", "invertebrate"] },
  { key: "armJoint", parent: "arm", penalty: -5, damageTypes: TIGHT, cripplingDivisor: 3, missFallback: "arm", removedBy: ["diffuse", "homogenous"] },
  { key: "legJoint", parent: "leg", penalty: -5, damageTypes: TIGHT, cripplingDivisor: 3, missFallback: "leg", removedBy: ["diffuse", "homogenous"] },
  { key: "handJoint", parent: "hand", penalty: -7, damageTypes: TIGHT, cripplingDivisor: 4, missFallback: "hand", removedBy: ["diffuse", "homogenous"] },
  { key: "footJoint", parent: "foot", penalty: -7, damageTypes: TIGHT, cripplingDivisor: 4, missFallback: "foot", removedBy: ["diffuse", "homogenous"] },
  { key: "armVein", parent: "arm", penalty: -5, damageTypes: BLEEDING, woundingAdd: 0.5, cripplingDivisor: null, missFallback: "arm", removedBy: ["diffuse", "homogenous", "noBlood"] },
  { key: "legVein", parent: "leg", penalty: -5, damageTypes: BLEEDING, woundingAdd: 0.5, cripplingDivisor: null, missFallback: "leg", removedBy: ["diffuse", "homogenous", "noBlood"] },
  { key: "neckVein", parent: "neck", penalty: -8, damageTypes: BLEEDING, woundingAdd: 0.5, missFallback: "neck", removedBy: ["diffuse", "homogenous", "noBlood", "noNeck"] },
  { key: "skullBehind", parent: "skull", penalty: -5, arcs: ["back"], removedBy: ["noHead"] },
  { key: "faceBehind", parent: "face", penalty: -7, arcs: ["back"], removedBy: ["noHead"] },
  // Crushing blows at the vitals: -3, at x1, with the knockdown roll the vitals always ask.
  { key: "vitalsCrushing", parent: "vitals", penalty: -3, damageTypes: ["cr"], wounding: 1, removedBy: [] },
];

/** The locations a body has, given what its traits remove. */
export function locationAvailable(definition: LocationDefinition, removals: ReadonlySet<Removal>): boolean {
  return !definition.removedBy.some((removal) => removals.has(removal));
}

/**
 * A random hit refined by the book's 1d sub-rolls (p. 137). Returns the key of
 * the finer location, or null to leave the hit where it is.
 *
 * - Arm or leg: a 1 is a vein or artery for piercing kinds and cutting, or a
 *   joint for crushing.
 * - Face from the front: a 1 is the skull for piercing kinds, or the nose.
 * - Hand or foot: a 1 is a joint.
 * - Neck: a 1 is a vein or artery, or the spine from behind with crushing.
 * - Torso: a 1 is the vitals for piercing and crushing kinds, or the spine for
 *   cutting from behind.
 */
export function refineRandomHit(location: Parent, damageType: string | null, arc: Arc | null, die: number): { key: string | null; basic: Parent | null } {
  if (die !== 1) return { key: null, basic: null };
  const piercing = damageType !== null && (PIERCING as readonly string[]).includes(damageType);
  const crushing = damageType === "cr";
  switch (location) {
    case "arm":
    case "leg":
      if (piercing || damageType === "cut") return { key: `${location}Vein`, basic: null };
      if (crushing) return { key: `${location}Joint`, basic: null };
      return { key: null, basic: null };
    case "face":
      if (arc === "back") return { key: null, basic: null };
      return piercing ? { key: null, basic: "skull" } : { key: "nose", basic: null };
    case "hand":
    case "foot":
      return { key: `${location}Joint`, basic: null };
    case "neck":
      if (arc === "back" && crushing) return { key: "spine", basic: null };
      return { key: "neckVein", basic: null };
    case "torso":
      if (arc === "back" && damageType === "cut") return { key: "spine", basic: null };
      if (piercing || crushing) return crushing ? { key: "vitalsCrushing", basic: null } : { key: null, basic: "vitals" };
      return { key: null, basic: null };
    default:
      return { key: null, basic: null };
  }
}

/** What a wound to one of the book's locations did beyond its injury, for the GM to confirm. */
export type WoundOutcome = "earLost" | "earRemoved" | "noseBroken" | "noseLopped" | "spineCrippled" | "jointCrippled";

/**
 * The lasting results of a wound (p. 137):
 * - an ear sliced for more than HP/4 is cut, and for twice that removed (-1 Appearance);
 * - a nose hurt for more than HP/4 is broken, and cut for twice that lopped off (-2 Appearance);
 * - a spine hurt for more than HP is crippled;
 * - a crippled joint heals at -2.
 * `raw` is the injury before any excess was lost.
 */
export function woundOutcome(key: string, options: { raw: number; maxHp: number; damageType: string; crippled: boolean }): WoundOutcome | null {
  const quarter = options.maxHp / 4;
  switch (key) {
    case "earSlice":
      if (options.raw >= 2 * quarter) return "earRemoved";
      return options.raw > quarter ? "earLost" : null;
    case "nose":
      if (options.damageType === "cut" && options.raw >= 2 * quarter) return "noseLopped";
      return options.raw > quarter ? "noseBroken" : null;
    case "spine":
      return options.crippled || options.raw > options.maxHp ? "spineCrippled" : null;
    case "armJoint":
    case "legJoint":
    case "handJoint":
    case "footJoint":
      return options.crippled ? "jointCrippled" : null;
    default:
      return null;
  }
}
