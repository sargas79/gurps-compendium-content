/**
 * A character as a ritual caster (Monster Hunters 1 pp. 24-25, 32-39),
 * worked out from what the system says of their skills and traits, and from
 * this module's own data on them.
 *
 * The system worked this out in its character data model. Here it is read on
 * demand: the Paths off Thaumatology and Magery, the reserve, the conditional
 * limit, and for each ritual the Path its rolls use and what Ritual Mastery
 * and a grimoire add.
 */

import type { GWorldApi } from "../../../shared/module.js";
import { governingPath, type GoverningPath, type RitualEffectEntry } from "./cost.js";
import { casterData, equipmentData, type RitualSystem } from "./data.js";
import { conditionalLimit } from "./lasting.js";
import { PATHS, isRitualAdept, manaReserveMax, pathCeiling, pathLevel, pathOfSkill, pathSkillName, type RitualPath } from "./path.js";
import { grimoireBonus, masteredRitual, ritualMasteryBonus } from "./tricks.js";

type Comprehension = "none" | "broken" | "accented" | "native";

const traitsOf = (actor: any): any[] => [...(actor?.items ?? [])].filter((i: any) => i?.type === "trait");

/** A character's Magery, as the system reads it off their traits; null for none. */
export function mageryOf(api: GWorldApi, actor: any): number | null {
  const held = traitsOf(actor).map((t: any) => ({ name: String(t.name ?? ""), levels: Number(t.system?.levels ?? 0) }));
  const magery = api.rules.traitEffects(held).magery;
  return typeof magery === "number" ? magery : null;
}

/** One Path as the caster has it. */
export interface PathEntry {
  path: RitualPath;
  name: string;
  owned: boolean;
  level: number | null;
  atDefault: boolean;
  capped: boolean;
}

/** Everything the Magic tab and the casting card need of a caster. */
export interface RitualPathState {
  thaumatology: number | null;
  magery: number | null;
  ceiling: number | null;
  adept: boolean;
  reserve: { value: number; max: number };
  conditional: { hanging: number; limit: number };
  paths: PathEntry[];
}

/**
 * A caster's Paths, reserve and conditional limit. The owned Path skills'
 * levels are the system's, which this module's `gworld.skillLevels` listener
 * has already held to the ceiling; a Path not on the sheet is read at default.
 */
export function ritualPathOf(api: GWorldApi, actor: any): RitualPathState {
  const thaumatology = api.actors.skillLevel(actor, "Thaumatology");
  const magery = mageryOf(api, actor);
  const data = casterData(actor);
  const max = manaReserveMax(magery);
  const skills = [...(actor?.items ?? [])].filter((i: any) => i?.type === "skill");
  return {
    thaumatology,
    magery,
    ceiling: pathCeiling({ thaumatology, magery }),
    adept: traitsOf(actor).some((t: any) => isRitualAdept(String(t.name ?? ""))),
    reserve: { value: Math.min(max, data.manaReserve), max },
    conditional: {
      hanging: data.active.filter((r) => r.conditional).length,
      limit: conditionalLimit({ thaumatology, magery }),
    },
    paths: PATHS.map((path) => {
      const owned = skills.find((s: any) => pathOfSkill(String(s.name ?? "")) === path);
      const level = owned
        ? {
            level: typeof owned.system?.derived?.level === "number" ? owned.system.derived.level : null,
            atDefault: Boolean(owned.system?.derived?.fromDefault),
            capped: pathLevel({ trained: Number(owned.system?.points) > 0 ? rawLevel(owned) : null, thaumatology, magery }).capped,
          }
        : pathLevel({ trained: null, thaumatology, magery });
      return { path, name: pathSkillName(path), owned: Boolean(owned), ...level };
    }),
  };
}

/** A skill's level before this module held it down: the level plus whatever its note took off. */
function rawLevel(skill: any): number | null {
  const level = skill.system?.derived?.level;
  if (typeof level !== "number") return null;
  const lines = (skill.system?.derived?.bonusLines ?? []) as Array<{ source?: string; value?: number }>;
  const taken = lines.filter((l) => l.source === "gurps-compendium-content").reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  return level - taken;
}

/**
 * Holds a character's Path skills to the ceiling and gives each its default,
 * for the system's `gworld.skillLevels` hook: "A Path can never exceed either
 * the caster's Thaumatology skill or (12 + Magery level)", and each "defaults
 * to Thaumatology-6", no higher than 12 (p. 33).
 */
export function holdPaths(
  context: { actor: any; skills: Array<{ item: any; name: string; level: number | null; fromDefault: boolean; note?: string; source?: string }>; levelOf: (name: string) => number | null },
  magery: number | null,
  notes: { capped: string; defaulted: string },
  source: string,
): void {
  const thaumatology = context.levelOf("Thaumatology");
  for (const entry of context.skills) {
    if (!pathOfSkill(entry.name)) continue;
    const trained = Number(entry.item?.system?.points) > 0 ? entry.level : null;
    const held = pathLevel({ trained, thaumatology, magery });
    if (held.level === entry.level && held.atDefault === entry.fromDefault) continue;
    Object.assign(entry, { level: held.level, fromDefault: held.atDefault, note: held.capped ? notes.capped : notes.defaulted, source });
  }
}

/** A ritual as one caster would cast it. */
export interface RitualSkill extends GoverningPath {
  name: string;
  mastery: number;
  masteryHeld: boolean;
  grimoire: { name: string; itemId: string; bonus: number } | null;
}

/**
 * The Path a ritual's rolls use for this caster, at -1 for each Path past the
 * second (p. 35), and the bonuses their copy of it earns: Ritual Mastery for
 * the ritual as mastered (p. 25), and the best grimoire carried for it as
 * defined (p. 39). Without the rule in play, no Path is known.
 */
export function ritualSkillOf(api: GWorldApi, actor: any, ritual: { name: string; system: RitualSystem }, inPlay: boolean): RitualSkill {
  const state = inPlay ? ritualPathOf(api, actor) : null;
  const levels = Object.fromEntries((state?.paths ?? []).map((p) => [p.path, p.level])) as Partial<Record<RitualPath, number | null>>;
  const skill = governingPath(ritual.system.effects ?? [], levels);
  const identity = String(ritual.system.derived?.identity ?? "");
  const traitNames = traitsOf(actor).map((t: any) => String(t.name ?? ""));
  const ranks: Comprehension[] = ["none", "broken", "accented", "native"];
  const comprehensionOf = (language: string, translation: Comprehension): Comprehension => {
    const known = [...(actor?.items ?? [])].find((l: any) => l?.type === "language" && String(l.name ?? "").trim().toLowerCase() === language.trim().toLowerCase());
    const own = known ? ranks[Math.min(ranks.indexOf(known.system?.spoken), ranks.indexOf(known.system?.written))] ?? "none" : "none";
    return ranks[Math.max(ranks.indexOf(own), ranks.indexOf(translation))] ?? "none";
  };
  let grimoire: RitualSkill["grimoire"] = null;
  for (const book of [...(actor?.items ?? [])].filter((i: any) => i?.type === "equipment" && i.system?.carried)) {
    const g = equipmentData(book).grimoire;
    for (const entry of g.rituals) {
      if (!entry.identity || entry.identity !== identity) continue;
      const bonus = grimoireBonus({
        bonus: entry.bonus,
        deadLanguage: Boolean(g.deadLanguage),
        comprehension: g.deadLanguage ? comprehensionOf(g.deadLanguage, g.translation) : "native",
        encrypted: g.encrypted,
        decoded: g.decoded,
      });
      if (!grimoire || bonus > grimoire.bonus) grimoire = { name: String(book.name ?? ""), itemId: String(book.id ?? ""), bonus };
    }
  }
  return {
    ...skill,
    name: skill.path ? pathSkillName(skill.path) : "",
    mastery: ritualMasteryBonus({ traitNames, ritualName: String(ritual.name ?? ""), masteredAs: String(ritual.system.masteredAs ?? ""), identity }),
    masteryHeld: traitNames.some((t) => masteredRitual(t)?.toLowerCase() === String(ritual.name ?? "").trim().toLowerCase()),
    grimoire,
  };
}

/** A ritual's effects, as the casting card and a ritual in effect keep them. */
export function effectsOf(ritual: { system: RitualSystem }): RitualEffectEntry[] {
  return (ritual.system.effects ?? []).map((e) => ({ path: e.path, effect: e.effect, greater: Boolean(e.greater) }));
}
