/**
 * Styles and training (GURPS Martial Arts pp. 49, 141-148, 232-233): the pure
 * rules for what a style costs and when it is known, the Style Perk allowance,
 * training equipment, and The Training Sequence.
 */

/** A style as its template lays it out. */
export interface StyleOutline {
  name: string;
  /** The Style Familiarity perk's name. */
  familiarity: string;
  /** The required skills: one point each towards the style's cost. */
  required: string[];
  techniques: string[];
  cinematic: string[];
  perks: string[];
}

/** A template entry, as the style templates list them. */
export interface TemplateEntry {
  name: string;
  itemType: string;
  group: string;
}

const key = (name: string) => String(name ?? "").trim().toLowerCase();

/**
 * A style from its template's entries: the Style Familiarity perk, the
 * ungrouped skills (the required ones), and the techniques, cinematic
 * abilities and perks by group. Null for a template with no Style Familiarity.
 */
export function outlineOf(name: string, entries: readonly TemplateEntry[]): StyleOutline | null {
  const familiarity = entries.find((entry) => entry.itemType === "trait" && /^style familiarity\b/i.test(entry.name));
  if (!familiarity) return null;
  const group = (g: string, types: string[]) => entries.filter((entry) => entry.group === g && types.includes(entry.itemType)).map((entry) => entry.name);
  return {
    name,
    familiarity: familiarity.name,
    required: group("", ["skill"]),
    techniques: group("techniques", ["technique"]),
    cinematic: group("cinematic", ["skill", "technique"]),
    perks: group("perks", ["trait"]),
  };
}

/** A style's cost (p. 146): a point for Style Familiarity, and one for each required skill. */
export function styleCost(style: StyleOutline): number {
  return 1 + style.required.length;
}

/**
 * Whether a character knows the styles they have (pp. 146-148).
 *
 * Every Style Familiarity and required skill needs a point, and what is spent
 * on all of them together -- a skill two styles share counted once -- must
 * come to the styles' costs added up; the surplus may be in any of them.
 */
export function stylesKnown(styles: readonly StyleOutline[], pointsIn: (name: string) => number): { cost: number; spent: number; known: boolean; missing: string[] } {
  const components = new Map<string, string>();
  for (const style of styles) {
    components.set(key(style.familiarity), style.familiarity);
    for (const skill of style.required) components.set(key(skill), skill);
  }
  const missing = [...components.values()].filter((name) => pointsIn(name) < 1);
  const spent = [...components.values()].reduce((sum, name) => sum + Math.max(0, pointsIn(name)), 0);
  const cost = styles.reduce((sum, style) => sum + styleCost(style), 0);
  return { cost, spent, known: missing.length === 0 && spent >= cost, missing };
}

/**
 * The Style Perk allowance (p. 49): one general Style Perk per 20 points in
 * combat skills, and one of a style's own perks per 10 points in its
 * techniques and required skills.
 */
export function perkAllowance(combatPoints: number, stylePoints: number): { general: number; style: number } {
  return { general: Math.floor(Math.max(0, combatPoints) / 20), style: Math.floor(Math.max(0, stylePoints) / 10) };
}

/** Training equipment (pp. 232-233). */
export type TrainingEquipment = "basic" | "good" | "fine" | "best";
export const TRAINING_EQUIPMENT: readonly TrainingEquipment[] = ["basic", "good", "fine", "best"];

/**
 * Training equipment's modifier to teaching and learning (pp. 232-233): +0
 * basic, +1 good, +2 fine, and for the best, +TL/2 but at least +2, and no more
 * than +2 before TL6.
 */
export function equipmentModifier(level: TrainingEquipment | "" | null, tl: number): number {
  switch (level) {
    case "good":
      return 1;
    case "fine":
      return 2;
    case "best":
      return tl < 6 ? 2 : Math.max(2, Math.floor(tl / 2));
    default:
      return 0;
  }
}

/** How long a Training Sequence lasts, and its modifier to the Teaching roll (p. 147). */
export type TrainingTime = "day" | "weekend" | "week" | "month" | "season";
export const TRAINING_TIMES: Readonly<Record<TrainingTime, number>> = { day: -9, weekend: -7, week: 0, month: 2, season: 4 };

/** Whether a master may run a Training Sequence (p. 147): 20+ in what is taught, Teaching 12+, and the spark. */
export function masterQualifies(options: { taughtLevels: readonly (number | null)[]; teaching: number | null; spark: boolean }): { ok: boolean; reasons: Array<"skills" | "teaching" | "spark"> } {
  const reasons: Array<"skills" | "teaching" | "spark"> = [];
  if (options.taughtLevels.length === 0 || options.taughtLevels.some((level) => level === null || level < 20)) reasons.push("skills");
  if (options.teaching === null || options.teaching < 12) reasons.push("teaching");
  if (!options.spark) reasons.push("spark");
  return { ok: reasons.length === 0, reasons };
}

/**
 * Whether a student may learn by The Training Sequence (p. 147): no attribute
 * below average and two at +2 or better, or a stylist with every one of the
 * style's skills at 16+.
 */
export function studentQualifies(options: { attributes: readonly number[]; styleLevels: readonly (number | null)[] }): boolean {
  const fresh = options.attributes.every((score) => score >= 10) && options.attributes.filter((score) => score >= 12).length >= 2;
  const stylist = options.styleLevels.length > 0 && options.styleLevels.every((level) => level !== null && level >= 16);
  return fresh || stylist;
}

/**
 * What a student may spend after a successful Training Sequence (p. 147): up
 * to the margin, +5 with Eidetic Memory or +10 with Photographic Memory, halved
 * for Laziness; a critical success gives a free point besides.
 */
export function trainingAllowance(margin: number, options: { eidetic: boolean; photographic: boolean; lazy: boolean; critical: boolean }): { points: number; free: number } {
  let points = Math.max(0, margin) + (options.photographic ? 10 : options.eidetic ? 5 : 0);
  if (options.lazy) points = Math.floor(points / 2);
  return { points, free: options.critical ? 1 : 0 };
}

/**
 * Style Familiarity against a foe's feints and Deceptive Attacks (p. 49): with
 * Familiarity for every style he knows, -1 off the penalty, never past zero.
 */
export function familiarityOffset(deception: number, knowsAll: boolean): number {
  return knowsAll && deception < 0 ? Math.min(1, -deception) : 0;
}
