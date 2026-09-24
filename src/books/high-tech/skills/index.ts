/**
 * The supplement Electricity and Electronics' skills (HT:EE pp. 6-8, 15),
 * registered with the system through the add-on API under High-Tech's
 * `skillSubstitutes` switch (decision E5 in #471). The skills themselves --
 * Machine Operation, Hobby Skill (Feats of Science), the three electrophones,
 * Physics (Electromagnetism), the new Mechanic, Engineer and Artist
 * specialties and the Hot Stick technique -- are records in High-Tech's packs,
 * with their own defaults; the tables are in `rules.ts`.
 *
 *   - **Skill substitutes (skillSubstitutes):** through `gworld.skillLevels`,
 *     the new defaults the supplement gives the Basic Set's skills --
 *     Electronics Operation (Media) from Photography-5, (Medical) from
 *     Diagnosis-2, (Scientific) from a science at -2 (and (Sensors) and
 *     (Sonar), for scientific work), (Security) from Traps-2, and Photography
 *     from Electronics Operation (Media)-5 -- bought up from like any default
 *     (Characters p. 173), with a note on the level naming it. And a row
 *     action on a skill that stands in for others -- Physics
 *     (Electromagnetism) for the supplement's Physics rolls and for Engineer
 *     (Electrical or Electronics) to invent a proof of concept, a Hobby Skill
 *     for operating or repairing small, low-power systems -- that rolls it
 *     at its own level in the other's place, when the player says the task
 *     fits. Those leave levels alone, so a hobbyist's Electrician isn't
 *     raised for a power line.
 *
 * The system's records are never edited: the defaults live only in the
 * levels this listener hands back, and only with the switch on.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { ask, esc, row } from "../../../shared/sensors/index.js";
import { bestNewDefault, defaultedLevel, standInsFor, type BestDefault, type CostTable, type KnownSkill } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Skills.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Skills.${key}`, data);

/** The note on the level: where the default comes from, and what for. */
function defaultNote(sub: BestDefault): string {
  const text = F("Default", { skill: `${sub.from}${sub.modifier}`, page: sub.page });
  return sub.scope ? `${text} ${L(`Scope.${sub.scope}`)}` : text;
}

/** The new defaults, onto the skills the system hands `gworld.skillLevels`. */
export function applyNewDefaults(table: CostTable, context: any): void {
  const entries: any[] = Array.isArray(context?.skills) ? context.skills : [];
  // Every level as the system worked it out, so one new default doesn't feed another.
  const known: KnownSkill[] = entries.map((s) => ({ name: String(s?.name ?? ""), level: typeof s?.level === "number" ? s.level : null }));
  const attributes = context?.attributes ?? {};
  for (const entry of entries) {
    const sub = bestNewDefault(String(entry?.name ?? ""), known);
    if (!sub) continue;
    const system = entry.item?.system ?? {};
    const derived = system.derived ?? {};
    const changed = defaultedLevel({
      level: typeof entry.level === "number" ? entry.level : null,
      fromDefault: Boolean(entry.fromDefault),
      points: Number(system.points) || 0,
      relativeLevel: typeof derived.relativeLevel === "number" ? derived.relativeLevel : null,
      defaultCredit: Number(derived.defaultCredit) || 0,
      attribute: Number(attributes[String(system.attribute ?? "IQ")]) || 10,
      difficulty: String(system.difficulty ?? "A"),
    }, sub.level, table);
    if (changed) Object.assign(entry, { ...changed, note: defaultNote(sub), source: MODULE_ID });
  }
}

/** Rolls the skill in another's place, for a task the player says it fits (HT:EE pp. 7-8). */
export async function standIn(api: GWorldApi, item: any, actor: any): Promise<void> {
  const options = standInsFor(String(item?.name ?? ""));
  if (!options.length || !actor) return;
  const level = api.actors.skillLevel(actor, String(item.name));
  if (typeof level !== "number") return;
  const select = `<select name="target">${options.map((o, i) => `<option value="${i}">${esc(`${o.target} (${L(`Scope.${o.scope}`)})`)}</option>`).join("")}</select>`;
  const answer = await ask(L("StandInTitle"),
    `<p class="hint">${esc(F("StandInHint", { skill: item.name, level }))}</p>` + row(L("StandInFor"), select),
    (form) => Number(form.querySelector<HTMLSelectElement>('[name="target"]')?.value ?? 0));
  if (answer === null) return;
  const chosen = options[answer] ?? options[0]!;
  await api.roll.success({
    actor, base: level, kind: "skill", skill: String(item.name), item,
    label: F("StandInLabel", { skill: item.name, target: chosen.target, scope: L(`Scope.${chosen.scope}`), page: chosen.page }),
    tags: ["skillSubstitute"],
  } as any);
}

/** Registers the listener and the row action; `on` reads the switch each time. */
export function readySkills(api: GWorldApi, on: { substitutes: () => boolean }): void {
  const table = api.rules as unknown as CostTable;
  Hooks.on(api.data.hooks.skillLevels, (context: any) => {
    if (on.substitutes()) applyNewDefaults(table, context);
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-skill-stand-in",
    itemTypes: ["skill"],
    label: L("StandInTitle"),
    icon: "fa-solid fa-right-left",
    visible: (item: any) => on.substitutes() && standInsFor(String(item?.name ?? "")).length > 0,
    run: (item: any, actor: any) => { void standIn(api, item, actor); },
  });
}
