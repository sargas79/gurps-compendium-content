/**
 * The supplement Electricity and Electronics' skills (HT:EE pp. 6-8): the new
 * defaults it gives the Basic Set's skills, and where one of its skills stands
 * in for another. Pure: `index.ts` hands these the character's skills.
 *
 * Two kinds of thing, kept apart because they reach different rolls:
 *
 *   - **Defaults** are defaults like any other (Characters pp. 173-174): the
 *     skill is used at the other skill's level less the penalty, and points
 *     spent on it buy it up from there. They change the skill's level.
 *   - **Stand-ins** are the supplement's substitutions: the other skill is
 *     rolled at its own level, but only for some tasks (small, low-power
 *     systems; the supplement's own Physics rolls; a proof-of-concept
 *     invention). Raising the skill's level would reach every roll of it --
 *     a hobbyist's Electrician on a power line -- so they are rolls the player
 *     chooses to make when the task fits, and levels are left alone.
 */

/** What a default or stand-in is good for, for the note on the level or roll. */
export type SubstituteScope = "scientific" | "imageEditing" | "lowPower" | "supplementPhysics" | "proofOfConcept";

export interface NewDefault {
  /** The skill that gets the default, by its name less "/TL", in lower case. */
  target: RegExp;
  /** The skills it comes from. */
  from: RegExp;
  modifier: number;
  scope?: SubstituteScope;
  /** The supplement's page. */
  page: number;
}

/**
 * The natural sciences a scientific instrument's default reaches (HT:EE p. 6:
 * the science the work belongs to), and their optional specialties
 * (Characters p. 169), such as Physics (Electromagnetism). Which one fits the
 * work is the GM's call; the best of them counts, and the note names it.
 */
const SCIENCE = /^(astronomy|biology|chemistry|geography \(physical\)|geology|mathematics|metallurgy|meteorology|paleontology|physics|physiology)( \(.*\))?$/;

/** The supplement's new defaults onto the Basic Set's skills (pp. 6-7). */
export const NEW_DEFAULTS: readonly NewDefault[] = Object.freeze([
  { target: /^electronics operation \(media\)$/, from: /^photography$/, modifier: -5, scope: "imageEditing", page: 6 },
  { target: /^electronics operation \(medical\)$/, from: /^diagnosis$/, modifier: -2, page: 6 },
  { target: /^electronics operation \(scientific\)$/, from: SCIENCE, modifier: -2, page: 6 },
  { target: /^electronics operation \((sensors|sonar)\)$/, from: SCIENCE, modifier: -2, scope: "scientific", page: 6 },
  { target: /^electronics operation \(security\)$/, from: /^traps$/, modifier: -2, page: 6 },
  // Printed in the Basic Set too (Characters p. 213); here for a skill typed in by hand.
  { target: /^photography$/, from: /^electronics operation \(media\)$/, modifier: -5, page: 7 },
]);

export interface StandIn {
  /** The skill that stands in, by its name less "/TL", in lower case. */
  from: RegExp;
  /** The skills it stands in for, as the book names them. */
  targets: readonly string[];
  scope: SubstituteScope;
  page: number;
}

/**
 * Where the supplement's skills stand in for others, at their own level.
 * Physics (Electromagnetism) for any Physics roll the supplement calls for,
 * and for Engineer (Electrical or Electronics) to invent a device that proves
 * the concept but can't go into production (p. 8). A Hobby Skill for operating
 * or repairing small, low-power systems (p. 7), matched to the gear the
 * supplement rolls it for: amateur radio for radios (p. 47), high fidelity for
 * home audio (pp. 30, 32), home computers (p. 7), and Feats of Science for the
 * electrical apparatus that Electrician also builds and runs (pp. 11-12).
 */
export const STAND_INS: readonly StandIn[] = Object.freeze([
  { from: /^physics \(electromagnetism\)$/, targets: ["Physics"], scope: "supplementPhysics", page: 8 },
  { from: /^physics \(electromagnetism\)$/, targets: ["Engineer (Electrical)", "Engineer (Electronics)"], scope: "proofOfConcept", page: 8 },
  { from: /^hobby skill \((amateur|ham) radio\)$/, targets: ["Electronics Operation (Communications)", "Electronics Repair (Communications)"], scope: "lowPower", page: 7 },
  { from: /^hobby skill \((high fidelity|hi-?fi)\)$/, targets: ["Electronics Operation (Media)", "Electronics Repair (Media)"], scope: "lowPower", page: 7 },
  { from: /^hobby skill \((home )?computers?\)$/, targets: ["Computer Operation", "Electronics Repair (Computers)"], scope: "lowPower", page: 7 },
  { from: /^hobby skill \(feats of science\)$/, targets: ["Electrician"], scope: "lowPower", page: 7 },
]);

/** A skill name as the tables read it: no "/TL" marker, single spaces, lower case. */
export function skillKey(name: string): string {
  return String(name ?? "")
    .replace(/\/TL[\d^]*/gi, "")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)/g, ")")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export interface KnownSkill {
  name: string;
  level: number | null;
}

export interface BestDefault {
  level: number;
  /** The skill it comes from, as the character has it named. */
  from: string;
  modifier: number;
  scope: SubstituteScope | null;
  page: number;
}

/** The best level the supplement's new defaults give `target` from the character's other skills, or null. */
export function bestNewDefault(target: string, known: readonly KnownSkill[]): BestDefault | null {
  const key = skillKey(target);
  let best: BestDefault | null = null;
  for (const rule of NEW_DEFAULTS) {
    if (!rule.target.test(key)) continue;
    for (const skill of known) {
      if (skill.level === null || !Number.isFinite(skill.level)) continue;
      const from = skillKey(skill.name);
      if (from === key || !rule.from.test(from)) continue;
      const level = Math.floor(skill.level) + rule.modifier;
      if (!best || level > best.level) best = { level, from: String(skill.name).trim(), modifier: rule.modifier, scope: rule.scope ?? null, page: rule.page };
    }
  }
  return best;
}

/** What the skill named `source` stands in for, one entry per skill, in the book's order. */
export function standInsFor(source: string): Array<{ target: string; scope: SubstituteScope; page: number }> {
  const key = skillKey(source);
  return STAND_INS.filter((s) => s.from.test(key)).flatMap((s) => s.targets.map((target) => ({ target, scope: s.scope, page: s.page })));
}

/** What a skill has before the supplement's defaults: the system's derived figures. */
export interface SkillStanding {
  level: number | null;
  fromDefault: boolean;
  points: number;
  /** Relative level the points (with any default already counted) bought. */
  relativeLevel: number | null;
  /** Points the best default already counted was worth. */
  defaultCredit: number;
  attribute: number;
  difficulty: string;
}

/** The two Basic Set cost-table helpers (the API's `rules`). */
export interface CostTable {
  defaultCreditPoints(defaultLevel: number, attributeScore: number, difficulty: never): number;
  relativeLevelForPoints(points: number, difficulty: never): number | null;
}

/**
 * The level and whether it is a default, once a new default is weighed
 * (Characters p. 173): a trained skill with a better default is bought up
 * from it -- the default counts as the points its level would cost -- and a
 * skill no better than the default is used at it. Null when nothing changes.
 */
export function defaultedLevel(standing: SkillStanding, level: number, table: CostTable): { level: number; fromDefault: boolean } | null {
  const { points } = standing;
  if (points > 0 && standing.level !== null && !standing.fromDefault && standing.relativeLevel !== null) {
    const credit = table.defaultCreditPoints(level, standing.attribute, standing.difficulty as never);
    if (credit > standing.defaultCredit) {
      const relative = table.relativeLevelForPoints(points + credit, standing.difficulty as never);
      // The skill's bonuses are whatever its level holds over its relative level.
      const bought = relative === null ? null : standing.level - standing.relativeLevel + relative;
      if (bought !== null && bought > standing.level && bought >= level) return { level: bought, fromDefault: false };
    }
  }
  if (standing.level === null || level > standing.level) return { level, fromDefault: true };
  return null;
}
