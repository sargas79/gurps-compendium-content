/**
 * Ultra-Tech's stealth systems: chameleon and invisibility surfaces, cloaks
 * and nets, infrared cloaking and radar stealth, programmable camouflage,
 * scent masking, deception ECM and distortion fields, holobelts, and the
 * burglary and disguise gear whose bonus is its quality (pp. 95-100).
 */

/** The senses a hider may be hiding from, as the surfaces tell them apart (pp. 98-100). */
export const SENSES = ["vision", "infrared", "hyperspectral", "ultraviolet", "extendedHyperspectral"] as const;
export type Sense = (typeof SENSES)[number];

/** The chameleon surfaces' Stealth bonuses by sense, and whether moving halves them (pp. 98-99). */
export const CHAMELEON: Readonly<Record<string, { tl: number; bonus: Readonly<Record<Sense, number>>; halvedMoving: boolean }>> = Object.freeze({
  thermoOptic: { tl: 9, bonus: { vision: 4, infrared: 4, hyperspectral: 2, ultraviolet: 2, extendedHyperspectral: 1 }, halvedMoving: true },
  multispectral: { tl: 10, bonus: { vision: 8, infrared: 8, hyperspectral: 4, ultraviolet: 4, extendedHyperspectral: 2 }, halvedMoving: true },
  dynamicMultispectral: { tl: 11, bonus: { vision: 8, infrared: 8, hyperspectral: 4, ultraviolet: 4, extendedHyperspectral: 2 }, halvedMoving: false },
  ultimate: { tl: 12, bonus: { vision: 8, infrared: 8, hyperspectral: 8, ultraviolet: 8, extendedHyperspectral: 4 }, halvedMoving: false },
});

/** How a surface is worn: a surface on a suit, a cloak (half again when moving; half the price), or a net (ten times the price). */
export type StealthForm = "surface" | "cloak" | "net";
export const FORM_COST: Readonly<Record<StealthForm, number>> = Object.freeze({ surface: 1, cloak: 0.5, net: 10 });

/** A chameleon surface's Stealth bonus against a sense (pp. 98-99). Round down when halved. */
export function chameleonBonus(kind: string, sense: Sense, options: { moving: boolean; form: StealthForm }): number {
  const figures = CHAMELEON[kind];
  if (!figures) return 0;
  let bonus = figures.bonus[sense];
  if (options.moving && figures.halvedMoving) bonus = Math.floor(bonus / 2);
  if (options.moving && options.form !== "surface") bonus = Math.floor(bonus / 2);
  return bonus;
}

/** Invisibility: +9 to Stealth, +3 silhouetted, and a cloak +3 when moving (p. 100). */
export const INVISIBILITY = Object.freeze({ bonus: 9, silhouetted: 3, cloakMoving: 3, spotMoving: -6, hitMoving: -6 });

/** The senses an invisibility surface of a TL fools (p. 100). */
export function invisibilityCovers(tl: number, sense: Sense): boolean {
  if (sense === "vision" || sense === "infrared") return tl >= 10;
  if (sense === "extendedHyperspectral") return tl >= 12;
  return tl >= 11;
}

/** An invisibility surface's Stealth bonus. */
export function invisibilityBonus(tl: number, sense: Sense, options: { moving: boolean; silhouetted: boolean; form: StealthForm }): number {
  if (!invisibilityCovers(tl, sense)) return 0;
  if (options.silhouetted) return INVISIBILITY.silhouetted;
  if (options.moving && options.form !== "surface") return INVISIBILITY.cloakMoving;
  return INVISIBILITY.bonus;
}

/** Infrared cloaking and radar stealth: -4 at TL9 to -10 at TL12 to detection (pp. 99-100). */
export function signaturePenalty(tl: number): number {
  if (tl < 9) return 0;
  return -Math.min(10, 4 + 2 * (tl - 9));
}

/** The deception jammers' detection penalties, before -2 per TL after their own (p. 99). */
export const JAMMERS: Readonly<Record<string, { tl: number; penalties: Readonly<Record<string, number>>; spoof: boolean }>> = Object.freeze({
  radarJammer: { tl: 9, penalties: { radar: -4, imagingRadar: -2 }, spoof: true },
  sonarJammer: { tl: 9, penalties: { sonar: -4 }, spoof: true },
  distortionField: { tl: 10, penalties: { active: -6 }, spoof: true },
  distortionChip: { tl: 10, penalties: { active: -6 }, spoof: true },
});

/** A jammer's penalties at the TL it was built: -2 more per TL after its own (p. 99). */
export function jammerPenalties(kind: string, tl: number): Record<string, number> {
  const jammer = JAMMERS[kind];
  if (!jammer) return {};
  const extra = -2 * Math.max(0, tl - jammer.tl);
  return Object.fromEntries(Object.entries(jammer.penalties).map(([sensor, value]) => [sensor, value + extra]));
}

/**
 * Spoofing instead of jamming (p. 99): no penalty, but the operator is fooled
 * unless he succeeds by more than half the penalty the jammer would give.
 */
export function spoofFools(margin: number, success: boolean, penalty: number): boolean {
  return !success || margin <= Math.floor(Math.abs(penalty) / 2);
}

/** Larger objects need bigger jammers: cost, weight and cells times the longest dimension squared (p. 99). */
export function jammerScale(longestYards: number): number {
  return Math.max(1, longestYards) ** 2;
}

/** Programmable camouflage's modifier to Camouflage by terrain (p. 99). */
export const CAMOUFLAGE_TERRAIN = Object.freeze({ matching: 2, nonMatching: -1, contrasting: -2 });
export type Terrain = keyof typeof CAMOUFLAGE_TERRAIN;

/** Resetting programmable camouflage takes 4 seconds at TL9, one less per TL (p. 99). */
export function camouflageResetSeconds(tl: number): number {
  return Math.max(1, 4 - Math.max(0, tl - 9));
}

/** Scent masking: +4 to Tracking to cover your trail (p. 100). */
export const SCENT_MASKING = 4;

/** A holobelt: -1 to hit the wearer, and no aimed shots at hit locations (p. 98). */
export const HOLOBELT = -1;

/** An active flesh mask: +3 to Disguise, on top of the kit's quality (p. 98). */
export const FLESH_MASK = 3;

/** Shape-memory disguises (p. 97). */
export type ShapeMemory = "" | "single" | "multi";

/** A shape-memory disguise's price: five times the gadget, or twenty times both gadgets together. */
export function shapeMemoryCost(kind: ShapeMemory, gadget: number, disguise = 0): number {
  if (kind === "single") return gadget * 5;
  if (kind === "multi") return (gadget + disguise) * 20;
  return gadget;
}

/** A gadget with a shape-memory disguise is half its LC, rounded up (p. 97). */
export function shapeMemoryLegality(lc: number | null): number | null {
  if (lc === null) return null;
  return Math.ceil(lc / 2);
}

/** The cell that triggers a shape change by weight: AA to 0.1 lb., A to 1 lb., B to 10 lbs., and so on (p. 97). */
export function shapeMemoryCell(weight: number): string {
  const sizes = ["AA", "A", "B", "C", "D", "E", "F"];
  let limit = 0.1;
  for (const size of sizes) {
    if (weight <= limit) return size;
    limit *= 10;
  }
  return "F";
}

/**
 * What a record's name says it is, for the systems the book prints as gear
 * (pp. 97-100).
 */
export function stealthKindByName(name: string): { kind: string; form: StealthForm } | null {
  const text = String(name ?? "").trim();
  const form: StealthForm = /\bcloak\b/i.test(text) ? "cloak" : /\bnet\b/i.test(text) ? "net" : "surface";
  if (/^thermo-optic chameleon/i.test(text)) return { kind: "thermoOptic", form };
  if (/^dynamic multispectral chameleon/i.test(text)) return { kind: "dynamicMultispectral", form };
  if (/^multispectral chameleon/i.test(text)) return { kind: "multispectral", form };
  if (/^ultimate chameleon/i.test(text)) return { kind: "ultimate", form };
  if (/^invisibility (surface|cloak|net)$/i.test(text)) return { kind: "invisibility", form };
  if (/^infrared cloaking$/i.test(text)) return { kind: "infraredCloaking", form };
  if (/^radar stealth$/i.test(text)) return { kind: "radarStealth", form };
  if (/^programmable camouflage$/i.test(text)) return { kind: "programmableCamouflage", form };
  if (/^scent masking$/i.test(text)) return { kind: "scentMasking", form };
  if (/^deceptive radar jammer$/i.test(text)) return { kind: "radarJammer", form };
  if (/^deceptive sonar jammer$/i.test(text)) return { kind: "sonarJammer", form };
  if (/^distortion field belt$/i.test(text)) return { kind: "distortionField", form };
  if (/^holo-distort belt$/i.test(text)) return { kind: "holoDistort", form };
  if (/^distortion chip$/i.test(text)) return { kind: "distortionChip", form };
  if (/^holobelt$/i.test(text)) return { kind: "holobelt", form };
  if (/^active flesh mask$/i.test(text)) return { kind: "fleshMask", form };
  return null;
}

export const STEALTH_KINDS = [
  "thermoOptic", "multispectral", "dynamicMultispectral", "ultimate", "invisibility", "infraredCloaking", "radarStealth",
  "programmableCamouflage", "scentMasking", "radarJammer", "sonarJammer", "distortionField", "holoDistort", "distortionChip", "holobelt", "fleshMask",
] as const;

/** An electromagnetic autograpnel (p. 96): 30 yards, a winch lifting 800 lbs. at 5 yards a second, 7 at TL11, 10 at TL12; -2 unfamiliar. */
export const AUTOGRAPNEL = Object.freeze({ range: 30, lift: 800, unfamiliar: -2 });
export function autograpnelSpeed(tl: number): number {
  return tl >= 12 ? 10 : tl >= 11 ? 7 : 5;
}

/**
 * Gecko gear (p. 96): half Basic Move on walls and ceilings, 50 lbs. per limb
 * in contact. The limbs a weight needs, and whether that leaves the user
 * crawling (three or four limbs).
 */
export const GECKO_PER_LIMB = 50;
export function geckoLimbs(weight: number): { limbs: number; crawling: boolean; tooHeavy: boolean } {
  const limbs = Math.max(1, Math.ceil(Math.max(0, Number(weight) || 0) / GECKO_PER_LIMB));
  return { limbs, crawling: limbs >= 3, tooHeavy: limbs > 4 };
}

/**
 * An exophase field (p. 96): its user is affected by gravity and gravitic beams,
 * but other physical and energy attacks can't harm him, nor can he harm
 * others; two people in exophase interact normally. Whether a blow lands.
 */
export function exophaseAllows(attackerPhased: boolean, targetPhased: boolean, gravitic: boolean): boolean {
  if (attackerPhased === targetPhased) return true;
  return targetPhased && gravitic;
}

/** A gravitic attack: a graviton beam or a grav hammer (pp. 84, 129). */
export function isGravitic(name: string): boolean {
  return /\bgraviton\b|^grav (hammer|ram)$/i.test(String(name ?? "").trim());
}

export type ForgeryTool = "docFab" | "wallet" | "holoPaper";

/** The forgery tool a record's name is (p. 97). */
export function forgeryToolByName(name: string): ForgeryTool | null {
  const text = String(name ?? "").trim();
  if (/doc-fab$/i.test(text)) return "docFab";
  if (/^programmable wallet$/i.test(text)) return "wallet";
  if (/^holopaper$/i.test(text)) return "holoPaper";
  return null;
}

/**
 * A forgery roll with one of the book's tools (p. 97), given the tool's TL and
 * the document's.
 *
 * - A doc-fab gives its grade at its own TL, "increasing to +TL/2 for any
 *   lower-TL documents": `bonus` is the whole bonus, which replaces the grade.
 * - A programmable wallet rolls its own Forgery-15, "-5 (quality) ... at its own
 *   TL, but counts as basic equipment for lower-TL documents".
 * - HoloPaper rolls Forgery-15 against a visual search, and "will not defeat
 *   examination at its own TL or higher".
 */
export function forgeryRoll(tool: ForgeryTool, toolTl: number, documentTl: number, grade = 0): { ownSkill: number | null; bonus: number; fails: boolean } {
  const lower = documentTl < toolTl;
  if (tool === "docFab") return { ownSkill: null, bonus: lower ? Math.max(grade, Math.floor(toolTl / 2)) : grade, fails: false };
  if (tool === "wallet") return { ownSkill: 15, bonus: lower ? 0 : -5, fails: false };
  return { ownSkill: 15, bonus: 0, fails: !lower };
}

/** A chameleon surface's price for a suit: $4,000 thermo-optic, $6,000 multispectral, $8,000 dynamic, $10,000 ultimate; 4 lbs. (pp. 98-99). */
export const CHAMELEON_SUIT: Readonly<Record<string, { cost: number; weight: number }>> = Object.freeze({
  thermoOptic: { cost: 4000, weight: 4 },
  multispectral: { cost: 6000, weight: 4 },
  dynamicMultispectral: { cost: 8000, weight: 4 },
  ultimate: { cost: 10000, weight: 4 },
});
