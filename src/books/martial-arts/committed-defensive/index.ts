/**
 * A Wait's response of Committed Attack or Defensive Attack at the table
 * (GURPS Martial Arts p. 108).
 *
 * The two maneuvers themselves are the Basic Set's (Revised, pp. 575-576) and
 * the system carries them. What Martial Arts adds is that a Wait may name
 * either as its response: once triggered, the fighter's attack and defenses
 * take what the maneuver would give, through the options and the damage hook,
 * and through the defense hooks from a note of what the fighter attacked with.
 * The Wait's response is offered while the system's rule for either maneuver
 * is on.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  COMMITTED_DEFENSE_PENALTY,
  COMMITTED_MODES,
  DEFENSIVE_BENEFITS,
  WAIT_RESPONSES,
  committedDamageBonus,
  committedHitBonus,
  committedRefusals,
  defensiveDamagePenalty,
  isStBased,
  stanceOfResponse,
  type AttackedWith,
  type CommittedMode,
  type DefensiveBenefit,
  type WaitResponse,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.${key}`);

const WAIT_OPTION = "ma-wait-response";
/** What the fighter attacked with, until their next turn. */
const ATTACKED_WITH = "ma-attacked-with";
/** A Wait's response, once triggered, until their next turn. */
const RESPONDED = "ma-wait-responded";

/** A maneuver option's stored value on this actor, read from where the system keeps the choices. */
function optionValue(actor: any, module: string, key: string): unknown {
  return actor?.getFlag?.("gworld", "maneuverOptions")?.[module]?.[key];
}

type Stance = { kind: "committed"; mode: CommittedMode | null } | { kind: "defensive"; benefit: DefensiveBenefit | null } | null;

/**
 * Which of the two maneuvers this fighter is on: a Wait's response once
 * triggered, or the system's own maneuver while its rule is on. Only the Wait's
 * is this module's to carry out; the system's does its own.
 */
export function stanceOf(api: GWorldApi, actor: any): Stance {
  return waitStance(api, actor) ?? systemStance(api, actor);
}

/** The system's Committed Attack or Defensive Attack, its choices read where the system keeps them. */
function systemStance(api: GWorldApi, actor: any): Stance {
  const maneuver = String(actor?.system?.maneuver ?? "");
  if (maneuver === "committedAttack" && api.registry.isRuleOn("committedAttack")) {
    const mode = optionValue(actor, "gworld", "committedKind");
    return { kind: "committed", mode: COMMITTED_MODES.includes(mode as CommittedMode) ? (mode as CommittedMode) : null };
  }
  if (maneuver === "defensiveAttack" && api.registry.isRuleOn("defensiveAttack")) {
    const benefit = optionValue(actor, "gworld", "defensiveBenefit");
    return { kind: "defensive", benefit: DEFENSIVE_BENEFITS.includes(benefit as DefensiveBenefit) ? (benefit as DefensiveBenefit) : null };
  }
  return null;
}

/** A Wait's response, once triggered. */
function waitStance(api: GWorldApi, actor: any): Stance {
  if (String(actor?.system?.maneuver ?? "") !== "wait") return null;
  const responded = api.combat.getCombatState(actor, MODULE_ID, RESPONDED);
  return WAIT_RESPONSES.includes(responded as WaitResponse) ? stanceOfResponse(responded as WaitResponse) : null;
}

function attackedWith(api: GWorldApi, actor: any): AttackedWith | null {
  const stored = api.combat.getCombatState(actor, MODULE_ID, ATTACKED_WITH) as AttackedWith | undefined;
  return stored && typeof stored === "object" ? stored : null;
}

/** A select of these values; the system puts a blank choice first. */
const select = (values: readonly string[], prefix: string) => ({
  type: "select" as const,
  choices: values.map((value) => ({ value, label: L(`${prefix}.${value}`) })),
});

/** Registers the Wait's response and the hooks that carry it out. */
export function readyCommittedDefensive(api: GWorldApi, allowed: (actor: any) => boolean = () => true): void {
  // The response is offered while the system's rule for either maneuver is on.
  const on = () => api.registry.isRuleOn("committedAttack") || api.registry.isRuleOn("defensiveAttack");
  const offered = (actor?: any) => on() && (actor === undefined || allowed(actor));

  // A Wait names either as its response, a Committed Attack with its kind (p. 108).
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: WAIT_OPTION,
    maneuver: "wait",
    label: L("Wait.Response"),
    input: select(WAIT_RESPONSES, "Wait.Responses"),
    available: offered,
    attack: (context, value) => {
      if (api.combat.getCombatState(context.actor, MODULE_ID, RESPONDED) !== value) return null;
      const stance = stanceOfResponse(WAIT_RESPONSES.includes(value as WaitResponse) ? (value as WaitResponse) : null);
      const bonus = stance?.kind === "committed" ? committedHitBonus(stance.mode) : 0;
      return bonus ? { modifiers: [{ label: L("Committed.Modes.determined"), value: bonus }] } : null;
    },
    response: {
      label: L("Wait.Respond"),
      trigger: async (actor, value) => {
        if (!on() || !WAIT_RESPONSES.includes(value as WaitResponse)) return;
        await api.combat.setCombatState(actor, MODULE_ID, RESPONDED, value, "combat");
        ui.notifications?.info(`${String(actor?.name ?? "")}: ${L(`Wait.Responses.${String(value)}`)}`);
      },
    },
  });

  // Note what the fighter attacked with, for the defenses that follow.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor?.isOwner || context.ranged) return;
    if (!waitStance(api, context.actor)) return;
    const label = `${String(context.dataset?.rollLabel ?? "")} ${String(context.dataset?.rollSkill ?? "")}`;
    const record: AttackedWith = {
      itemId: String(context.item?.id ?? ""),
      kick: !context.item && /\bkick/i.test(label),
      shield: context.item?.type === "shield",
    };
    void api.combat.setCombatState(context.actor, MODULE_ID, ATTACKED_WITH, record, "combat");
  });

  // Strong's +1 and a Defensive Attack's -2, or -1 per die (pp. 99-100).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!on() || context?.mode?.ranged) return;
    const stance = waitStance(api, context?.actor);
    if (!stance) return;
    if (stance.kind === "committed") {
      const mode = context.item?.system?.meleeModes?.[Number(context.mode?.index) || 0];
      const bonus = committedDamageBonus(stance.mode, isStBased(mode?.damageBase, !context.item));
      if (bonus) context.modifiers.push({ label: L("Committed.Modes.strong"), value: bonus });
      return;
    }
    const dice = api.rules.parseDiceAdds(String(context.formula ?? ""))?.dice ?? 0;
    context.modifiers.push({ label: L("Defensive.Title"), value: defensiveDamagePenalty(dice) });
  });

  // Every defense after a Committed Attack is at -2 (p. 99).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!on() || waitStance(api, context?.defender)?.kind !== "committed") return;
    context.modifiers.push({ label: L("Committed.Title"), value: COMMITTED_DEFENSE_PENALTY });
  });

  // No retreat and no Feverish Defense after a Committed Attack, no dodge after
  // a kick, and no block with a shield that attacked (pp. 99, 131).
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on() || waitStance(api, context?.defender)?.kind !== "committed") return;
    const refused = committedRefusals(attackedWith(api, context.defender));
    for (const choice of context.choices ?? []) {
      if (choice.key === "dodge" && refused.dodge) Object.assign(choice, { available: false, refusal: L("Committed.NoDodge") });
      if (choice.key === "block" && refused.block) Object.assign(choice, { available: false, refusal: L("Committed.NoBlock") });
    }
    Object.assign(context.retreat, { available: false, refusal: L("Committed.NoRetreat") });
    Object.assign(context.feverish, { available: false, refusal: L("Committed.NoFeverish") });
  });

  // No parry with what made a Committed Attack; an unbalanced weapon that made
  // a Defensive Attack may still parry, where that was the benefit (pp. 99-100, 125).
  Hooks.on(api.combat.hooks.parryWeapons, (context: any) => {
    if (!on()) return;
    const stance = waitStance(api, context?.actor);
    const attacked = attackedWith(api, context?.actor);
    if (!stance || !attacked) return;
    for (const candidate of context.candidates ?? []) {
      if (candidate.itemId !== attacked.itemId) continue;
      if (stance.kind === "committed") Object.assign(candidate, { excluded: true, reason: L("Committed.NoParry") });
      else if (stance.benefit === "sameWeapon" && candidate.unbalanced) candidate.excluded = false;
    }
  });

  // What was noted lasts until the fighter's next turn.
  Hooks.on(api.combat.hooks.turnStart, (_combat: any, combatant: any) => {
    if (!game.user?.isGM || !combatant?.actor) return;
    void api.combat.clearCombatState(combatant.actor, MODULE_ID, ATTACKED_WITH);
    void api.combat.clearCombatState(combatant.actor, MODULE_ID, RESPONDED);
  });
}
