/**
 * Targeted Attacks and Combinations at the table (GURPS Martial Arts pp. 64,
 * 68, 80).
 *
 * Two technique kinds work their levels out from the technique's name: "TA
 * (Skill Attack/Target)" and "Combination (A + B + C)". An attack aimed where a
 * TA aims, with its skill and move, takes the levels bought in it; a
 * Combination is started from the Combat tab and each of its attacks takes its
 * part's level, ends if a setup fails, and gives the foe +3 once one misses or
 * is defended. Combat techniques also default to their Art and Sport skills.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  COMBINATION_DEFENSE_BONUS,
  artAndSport,
  combinationPartLevels,
  combinationUsable,
  needsSetup,
  predictability,
  readCombination,
  readTargetedAttack,
  specialTechniqueName,
  targetPenalty,
  targetedAttackLevel,
  techniquesTogether,
  type TargetedAttack,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Techniques.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Techniques.${key}`, data);

const TA_KIND = "ma-targeted-attack";
const COMBINATION_KIND = "ma-combination";
const TOGETHER = "ma-techniques-together";
const COMBO_STATE = "ma-combination-running";
const USES = "ma-technique-uses";
const SPECIAL = "ma-special-option";

interface ComboState { id: string; name: string; parts: TargetedAttack[]; levels: number[]; index: number; rolling: number | null; bonus: number; predictable: number }

const FENCING = ["rapier", "saber", "smallsword", "main-gauche"];
const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
const master = (actor: any) => [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && /^(trained by a master|weapon master)\b/i.test(String(item.name ?? "")));
const techniques = (actor: any) => [...(actor?.items ?? [])].filter((item: any) => item.type === "technique");
const sameAttack = (a: TargetedAttack, b: TargetedAttack) => lower(a.skill) === lower(b.skill) && a.attack === b.attack && (a.target ?? "torso") === (b.target ?? "torso") && a.chinks === b.chinks;

/** A TA's level for an actor, from the TA technique they have (with its points) or its default. */
function taLevel(actor: any, ta: TargetedAttack, levelOf: (name: string) => number | null, points?: number) {
  const own = points === undefined ? techniques(actor).find((item: any) => { const parsed = readTargetedAttack(item.name); return parsed && sameAttack(parsed, ta); }) : null;
  const special = specialTechniqueName(ta);
  const technique = special ? techniques(actor).find((item: any) => lower(item.name) === lower(special)) : null;
  return targetedAttackLevel(ta, {
    skill: levelOf(ta.skill),
    technique: typeof technique?.system?.derived?.level === "number" ? technique.system.derived.level : null,
    points: points ?? (Number(own?.system?.points) || 0),
    fencing: FENCING.includes(lower(ta.skill)),
  });
}

/** A Combination's levels for an actor. */
function comboLevels(actor: any, parts: TargetedAttack[], points: number, levelOf: (name: string) => number | null): number[] | null {
  const own = parts.map((part) => taLevel(actor, part, levelOf).level);
  if (own.some((level) => level === null)) return null;
  return combinationPartLevels(own as number[], { points, master: master(actor) });
}

/** The move an attack row makes, as a TA names it. */
function moveOf(context: any): string | null {
  const mode = context.mode?.index >= 0 ? context.item?.system?.meleeModes?.[context.mode.index] : null;
  if (mode?.damageBase === "sw") return "swing";
  if (mode?.damageBase === "thr") return "thrust";
  const label = lower(context.dataset?.rollLabel);
  if (label === "punch") return "punch";
  if (label === "kick") return "kick";
  return null;
}

/** Registers the kinds, the defaults, the attack hooks and the Combinations section. */
export function readyTechniques(api: GWorldApi, on: () => boolean): void {
  const state = <T>(actor: any, key: string) => api.combat.getCombatState(actor, MODULE_ID, key) as T | undefined;
  const levelOfFor = (actor: any) => (name: string) => api.actors.skillLevel(actor, name);

  api.data.registerTechniqueKind({
    module: MODULE_ID,
    key: TA_KIND,
    label: L("TargetedAttack"),
    available: on,
    derive: (technique, actor, helpers) => {
      const ta = readTargetedAttack(technique?.name);
      if (!ta) return { ...(helpers.standard() ?? { level: null, levels: 0, cappedByPrerequisite: false }), notes: [L("TaName")] };
      const result = taLevel(actor, ta, helpers.levelOf, Number(technique?.system?.points) || 0);
      if (result.level === null) return { level: null, notes: [F("NoSkill", { skill: ta.skill })] };
      return {
        level: result.level,
        levels: result.level - (result.default ?? result.level),
        cappedByPrerequisite: result.level === result.ceiling,
        notes: [F("TaNote", { default: result.default, ceiling: result.ceiling })],
      };
    },
  });

  api.data.registerTechniqueKind({
    module: MODULE_ID,
    key: COMBINATION_KIND,
    label: L("Combination"),
    available: on,
    derive: (technique, actor, helpers) => {
      const parts = readCombination(technique?.name);
      if (!parts) return { ...(helpers.standard() ?? { level: null, levels: 0, cappedByPrerequisite: false }), notes: [L("ComboName")] };
      const points = Number(technique?.system?.points) || 0;
      const levels = comboLevels(actor, parts, points, helpers.levelOf);
      if (!levels) return { level: null, notes: [L("ComboMissing")] };
      return {
        level: levels[0]!,
        notes: [levels.join("+"), ...(combinationUsable(parts.length, points, master(actor)) ? [] : [L("ComboUnusable")])],
      };
    },
  });

  // A combat technique also defaults to the Art and Sport versions of its skill (p. 64).
  Hooks.on(api.combat.hooks.techniqueDefaults, (context: any) => {
    if (!on() || !Array.isArray(context?.defaults)) return;
    for (const entry of [...context.defaults]) {
      if (entry?.from !== "skill" || !(["melee", "unarmed", "ranged", "shield"] as const).some((f) => api.rules.inSkillFamily(String(entry.skill ?? ""), f))) continue;
      for (const skill of artAndSport(String(entry.skill))) context.defaults.push({ from: "skill", skill, modifier: Number(entry.modifier) || 0 });
    }
  });

  // Techniques used together in one roll (p. 64): the levels relative to the skill, added up.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: TOGETHER,
    label: L("Together"),
    attack: "melee",
    input: { type: "number", min: -20, max: 0 },
    available: () => on(),
    apply: (context, value) => {
      const relative = Math.floor(Number(value) || 0);
      if (!relative) return null;
      return { modifiers: [{ label: L("Together"), value: techniquesTogether(context.effectiveSkill, [context.effectiveSkill + relative]) - context.effectiveSkill }] };
    },
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-combinations",
    sheet: "character",
    tab: "combat",
    position: "end",
    template: `modules/${MODULE_ID}/templates/ma-combinations.hbs`,
    visible: (actor) => on() && techniques(actor).some((item: any) => readCombination(item.name)),
    context: (actor) => {
      const running = state<ComboState>(actor, COMBO_STATE);
      return {
        combos: techniques(actor).filter((item: any) => readCombination(item.name)).map((item: any) => ({
          id: item.id,
          name: item.name,
          levels: String(item.system?.derived?.notes?.[0] ?? ""),
          running: running && running.id === item.id ? F("Running", { index: running.index + 1, count: running.parts.length }) : "",
        })),
      };
    },
    listeners: (element, actor) => {
      for (const button of element.querySelectorAll<HTMLButtonElement>("[data-ma-combo-start]")) {
        button.addEventListener("click", () => void startCombination(button.dataset.maComboStart ?? ""));
      }
      async function startCombination(id: string): Promise<void> {
        const item = actor.items.get(id);
        const parts = item ? readCombination(item.name) : null;
        if (!item || !parts) return;
        const maneuver = String(actor.system?.maneuver ?? "");
        if (maneuver === "moveAndAttack") return void ui.notifications?.warn(L("NoMove"));
        const special = state<string>(actor, SPECIAL);
        if (special && special !== "combination") return void ui.notifications?.warn(L("OneSpecial"));
        const points = Number(item.system?.points) || 0;
        if (!combinationUsable(parts.length, points, master(actor))) return void ui.notifications?.warn(L("ComboUnusable"));
        const levels = comboLevels(actor, parts, points, levelOfFor(actor));
        if (!levels) return void ui.notifications?.warn(L("ComboMissing"));
        const target = [...((game as any).user?.targets ?? [])][0]?.actor;
        const uses = (state<Record<string, number>>(actor, USES) ?? {})[`${id}:${target?.uuid ?? ""}`] ?? 0;
        const combo: ComboState = { id, name: item.name, parts, levels, index: 0, rolling: null, bonus: 0, predictable: predictability(uses) };
        await api.combat.setCombatState(actor, MODULE_ID, COMBO_STATE, combo, "turn");
        await api.combat.setCombatState(actor, MODULE_ID, SPECIAL, "combination", "turn");
        if (target) await api.combat.setCombatState(actor, MODULE_ID, USES, { ...(state<Record<string, number>>(actor, USES) ?? {}), [`${id}:${target.uuid}`]: uses + 1 }, "combat");
        ui.notifications?.info(F("Started", { name: item.name, levels: levels.join("+") }));
      }
    },
  });

  // A running Combination's attacks count towards the maneuver's (p. 80).
  Hooks.on(api.combat.hooks.attackSequence, (context: any) => {
    const combo = on() ? state<ComboState>(context?.actor, COMBO_STATE) : undefined;
    if (combo && Number(context.count) > 0) context.count = Number(context.count) + combo.parts.length - 1;
  });

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor || context.rollType !== "attack" || context.ranged) return;
    const actor = context.actor;
    const combo = state<ComboState>(actor, COMBO_STATE);
    const shot = context.calledShot;
    if (combo && combo.index < combo.parts.length) {
      const part = combo.parts[combo.index]!;
      if (lower(context.dataset?.rollSkill) !== lower(part.skill) && lower(part.skill) !== lower(context.dataset?.rollSkill?.replace(/\s*\(.*$/, ""))) {
        context.refusal = F("NextPart", { part: `${part.skill} ${part.attack}${part.target ? `/${part.target}` : ""}` });
        return;
      }
      if (part.target && (shot?.hitLocation ?? "torso") !== part.target) {
        context.refusal = F("AimAt", { target: part.target });
        return;
      }
      // The part's level, over what this roll already takes for its location.
      const expected = (Number(context.dataset?.rollTarget) || 0) + (part.target ? targetPenalty(part) : 0);
      const value = combo.levels[combo.index]! - expected;
      if (value) context.modifiers.push({ label: F("PartLine", { name: combo.name, index: combo.index + 1 }), value });
      if (combo.bonus) context.defenseModifiers.push({ label: L("ComboDefended"), value: combo.bonus });
      if (combo.predictable) context.defenseModifiers.push({ label: L("Predictable"), value: combo.predictable });
      void api.combat.setCombatState(actor, MODULE_ID, COMBO_STATE, { ...combo, rolling: combo.index, index: combo.index + 1 }, "turn");
      return;
    }
    // An attack aimed where one of the fighter's TAs aims takes its bought levels (p. 68).
    const move = moveOf(context);
    if (!move || !shot) return;
    const aimed: TargetedAttack = { skill: String(context.dataset?.rollSkill ?? ""), attack: move, target: shot.hitLocation, chinks: shot.chink === true };
    const own = techniques(actor).find((item: any) => { const parsed = readTargetedAttack(item.name); return parsed && sameAttack(parsed, aimed); });
    if (!own) return;
    const result = taLevel(actor, aimed, levelOfFor(actor));
    const bought = (result.level ?? 0) - (result.default ?? 0);
    if (bought) context.modifiers.push({ label: String(own.name), value: bought });
    const target = context.targets?.[0];
    if (target) {
      const uses = state<Record<string, number>>(actor, USES) ?? {};
      const key = `${own.id}:${target.uuid}`;
      const extra = predictability(uses[key] ?? 0);
      if (extra) context.defenseModifiers.push({ label: L("Predictable"), value: extra });
      void api.combat.setCombatState(actor, MODULE_ID, USES, { ...uses, [key]: (uses[key] ?? 0) + 1 }, "combat");
    }
  });

  // A Combination part that missed: +3 for the foe from now on, and the end of it if the next needed this one (p. 80).
  const defendedBy = new Map<string, string>();
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (on() && context?.attacker && state<ComboState>(context.attacker, COMBO_STATE)) defendedBy.set(String(context.defender?.uuid ?? ""), String(context.attacker.uuid ?? ""));
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!on() || !context?.actor?.isOwner) return;
    const tags: string[] = context.tags ?? [];
    if (tags.includes("defense") && context.outcome?.success) {
      const attackerUuid = defendedBy.get(String(context.actor.uuid ?? ""));
      defendedBy.delete(String(context.actor.uuid ?? ""));
      const attacker = attackerUuid ? (globalThis as any).fromUuidSync?.(attackerUuid) : null;
      const combo = attacker ? state<ComboState>(attacker, COMBO_STATE) : undefined;
      if (attacker?.isOwner && combo) void api.combat.setCombatState(attacker, MODULE_ID, COMBO_STATE, { ...combo, bonus: COMBINATION_DEFENSE_BONUS }, "turn");
      return;
    }
    if (!tags.includes("attack")) return;
    const combo = state<ComboState>(context.actor, COMBO_STATE);
    if (!combo || combo.rolling === null) return;
    if (context.outcome?.success) return;
    const next = combo.parts[combo.rolling + 1];
    if (next && needsSetup(next)) {
      void api.combat.clearCombatState(context.actor, MODULE_ID, COMBO_STATE);
      ui.notifications?.info(F("SetupFailed", { name: combo.name }));
      return;
    }
    void api.combat.setCombatState(context.actor, MODULE_ID, COMBO_STATE, { ...combo, bonus: COMBINATION_DEFENSE_BONUS }, "turn");
  });
}
