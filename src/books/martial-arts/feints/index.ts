/**
 * Feints at the table (GURPS Martial Arts pp. 49, 100-101): Beats, Ruses,
 * defensive feints, resisting with the best combat skill, and the Evaluate
 * bonus against feints and Deceptive Attacks.
 *
 * A Beat or defensive feint is kept on the feinter as combat state; the defense
 * and attack hooks read it from whoever is fighting.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { BEAT_DEFENSES, FEINT_KINDS, beatScores, bestResistance, evaluateHelps, evaluateOffset, ruseScores, type BeatDefense, type FeintKind } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Feint.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Feint.${key}`, data);

const KIND_OPTION = "ma-feint-as";
const DEFENSE_OPTION = "ma-beat-defense";
const DEFENSIVE_OPTION = "ma-defensive-feint";
const BEAT = "ma-beat";
const DEFENSIVE = "ma-defensive-feint-effect";

interface BeatState { target: string; defense: BeatDefense; penalty: number; turnsLeft: number }
interface DefensiveState { target: string; penalty: number; turnsLeft: number }

function optionValue(actor: any, key: string): unknown {
  return actor?.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[key];
}

function feintKindOf(actor: any): FeintKind | null {
  const value = optionValue(actor, KIND_OPTION);
  return FEINT_KINDS.includes(value as FeintKind) ? (value as FeintKind) : null;
}

/** Everyone who might hold a Beat or defensive feint: the combatants, else the world's actors. */
function fighters(): any[] {
  const combatants = (game as any).combat?.combatants;
  if (combatants?.size) return [...combatants].map((c: any) => c.actor).filter(Boolean);
  return [...((game as any).actors ?? [])];
}

/** The best score a foe resists a feint with: DX, any melee or unarmed skill they know, or a Feint technique. */
function resistanceOf(api: GWorldApi, foe: any): number {
  const skills = [...(foe?.items ?? [])]
    .filter((i: any) => i.type === "skill" && (api.rules.inSkillFamily(String(i.name ?? ""), "melee") || api.rules.inSkillFamily(String(i.name ?? ""), "unarmed")))
    .map((i: any) => Number(i.system?.derived?.level))
    .filter(Number.isFinite);
  const feints = [...(foe?.items ?? [])]
    .filter((i: any) => i.type === "technique" && /^feint\b/i.test(String(i.name ?? "")))
    .map((i: any) => Number(i.system?.derived?.level))
    .filter(Number.isFinite);
  return bestResistance(api.actors.attribute(foe, "DX") ?? 10, skills, feints);
}

/** Registers the options, the contest resolver and the hooks. */
export function readyFeints(api: GWorldApi, on: () => boolean): void {
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: KIND_OPTION,
    maneuver: "feint",
    label: L("As"),
    input: { type: "select", choices: FEINT_KINDS.map((k) => ({ value: k, label: L(`Kinds.${k}`) })) },
    available: () => on(),
  });
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: DEFENSE_OPTION,
    maneuver: "feint",
    label: L("BeatAgainst"),
    input: { type: "select", choices: BEAT_DEFENSES.map((d) => ({ value: d, label: L(`Defenses.${d}`) })) },
    available: () => on(),
    refuse: ({ chosen }) => (chosen[`${MODULE_ID}.${KIND_OPTION}`] === "beat" ? null : L("OnlyBeat")),
  });
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: DEFENSIVE_OPTION,
    maneuver: "feint",
    label: L("Defensive"),
    available: () => on(),
  });

  // What each side rolls (p. 100-101).
  api.roll.registerContestResolver({
    module: MODULE_ID,
    key: "ma-feints",
    label: L("Title"),
    applies: (context: any) => on() && (context?.tags ?? []).includes("feint"),
    resolve: (context: any) => {
      const feinter = context.first.actor;
      const foe = context.second.actor;
      const best = Math.max(Number(context.second.base) || 0, resistanceOf(api, foe));
      const attr = (actor: any, key: "DX" | "ST" | "IQ" | "Per") => api.actors.attribute(actor, key) ?? 10;
      const kind = feintKindOf(feinter);
      if (kind === "beat") {
        const scores = beatScores({
          attacker: { skill: context.first.base, dx: attr(feinter, "DX"), st: attr(feinter, "ST") },
          defender: { best, dx: attr(foe, "DX"), st: attr(foe, "ST") },
        });
        return { first: { base: scores.attacker, note: L("OnSt") }, second: { base: scores.defender, note: L("DxOrSt") } };
      }
      if (kind === "ruse") {
        const scores = ruseScores({
          attacker: { skill: context.first.base, dx: attr(feinter, "DX"), iq: attr(feinter, "IQ") },
          defender: { best, dx: attr(foe, "DX"), per: attr(foe, "Per"), tactics: api.actors.skillLevel(foe, "Tactics") },
        });
        return { first: { base: scores.attacker, note: L("OnIq") }, second: { base: scores.defender, note: L("PerDxOrTactics") } };
      }
      return best > context.second.base ? { second: { base: best, note: L("BestCombatSkill") } } : null;
    },
  });

  // A Beat or a defensive feint takes the result over.
  Hooks.on(api.combat.hooks.feintResult, (context: any) => {
    if (!on() || !context?.feinter) return;
    const kind = feintKindOf(context.feinter);
    const defensive = optionValue(context.feinter, DEFENSIVE_OPTION) === true;
    if (kind !== "beat" && !defensive) return;
    context.record = false;
    const result = context.result ?? {};
    if (!result.success || !context.feinter.isOwner) return;
    const target = String(context.foe?.uuid ?? "");
    const penalty = Number(result.defensePenalty) || 0;
    if (defensive) {
      void api.combat.setCombatState(context.feinter, MODULE_ID, DEFENSIVE, { target, penalty, turnsLeft: 2 } satisfies DefensiveState, "combat");
      ui.notifications?.info(F("DefensiveLanded", { foe: String(context.foe?.name ?? ""), penalty }));
      return;
    }
    const value = optionValue(context.feinter, DEFENSE_OPTION);
    const defense: BeatDefense = BEAT_DEFENSES.includes(value as BeatDefense) ? (value as BeatDefense) : "parry";
    void api.combat.setCombatState(context.feinter, MODULE_ID, BEAT, { target, defense, penalty, turnsLeft: 2 } satisfies BeatState, "combat");
    ui.notifications?.info(F("BeatLanded", { foe: String(context.foe?.name ?? ""), defense: L(`Defenses.${defense}`), penalty }));
  });

  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!on() || !context?.defender) return;
    const uuid = String(context.defender.uuid ?? "");
    // A Beat lowers the one defense against everyone (p. 100).
    for (const fighter of fighters()) {
      const beat = api.combat.getCombatState(fighter, MODULE_ID, BEAT) as BeatState | undefined;
      if (beat && beat.target === uuid && beat.defense === context.defense && beat.penalty < 0) {
        context.modifiers.push({ label: F("BeatBy", { name: String(fighter.name ?? "") }), value: beat.penalty });
      }
    }
    // An Evaluate against the attacker offsets feints and Deceptive Attacks (p. 100).
    if (String(context.defender.system?.maneuver ?? "") === "evaluate") {
      const offset = evaluateOffset(Number(context.deception) || 0, Number(context.defender.system?.derived?.evaluateBonus) || 0);
      if (offset) context.modifiers.push({ label: L("EvaluateOffset"), value: offset });
    }
  });

  // A defensive feint penalizes the foe's next attack against the feinter (p. 101).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor) return;
    const uuid = String(context.actor.uuid ?? "");
    const aimedAt = new Set((context.targets ?? []).map((a: any) => String(a?.uuid ?? "")));
    for (const fighter of fighters()) {
      const feint = api.combat.getCombatState(fighter, MODULE_ID, DEFENSIVE) as DefensiveState | undefined;
      if (!feint || feint.target !== uuid || !aimedAt.has(String(fighter.uuid ?? ""))) continue;
      context.modifiers.push({ label: F("DefensiveBy", { name: String(fighter.name ?? "") }), value: feint.penalty });
      if (fighter.isOwner) void api.combat.clearCombatState(fighter, MODULE_ID, DEFENSIVE);
    }
  });

  // The Evaluate bonus on noticing the evaluated foe (p. 100).
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on() || !context?.actor || String(context.actor.system?.maneuver ?? "") !== "evaluate") return;
    if (!evaluateHelps(String(context.skill ?? ""))) return;
    const bonus = Number(context.actor.system?.derived?.evaluateBonus) || 0;
    if (bonus) context.modifiers.push({ label: L("Evaluate"), value: bonus });
  });

  // A Beat lasts until the end of the beater's next turn.
  Hooks.on(api.combat.hooks.turnEnd, (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!game.user?.isGM || !actor) return;
    for (const key of [BEAT, DEFENSIVE]) {
      const state = api.combat.getCombatState(actor, MODULE_ID, key) as { turnsLeft: number } | undefined;
      if (!state) continue;
      if (state.turnsLeft <= 1) void api.combat.clearCombatState(actor, MODULE_ID, key);
      else void api.combat.setCombatState(actor, MODULE_ID, key, { ...state, turnsLeft: state.turnsLeft - 1 }, "combat");
    }
  });
}
