/**
 * All-Out Attack (Long), slams as All-Out Attacks, and Move and Attack with any
 * melee attack, at the table (GURPS Martial Arts pp. 97-98, 107).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  longCrouchPosture,
  longDamagePenalty,
  moveAndAttackRefusals,
  slamMayUseFullMove,
  slamThrust,
  strikingPart,
  type StrikingPart,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.${key}`);

export const LONG = "ma-long";
const CROUCH_OPTION = "ma-long-crouch";
const SLAM_OPTION = "ma-slam-full-move";
const SLAM_DAMAGE_OPTION = "ma-move-slam-damage";
/** What struck on a Move and Attack, until the fighter's next turn. */
const STRUCK = "ma-move-struck";

function optionValue(actor: any, key: string): unknown {
  return actor?.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[key];
}

const onLong = (actor: any) =>
  String(actor?.system?.maneuver ?? "") === "allOutAttack" && String(actor?.system?.allOutAttackOption ?? "") === `${MODULE_ID}.${LONG}`;

const onMoveAndAttack = (actor: any) => String(actor?.system?.maneuver ?? "") === "moveAndAttack";

/** Registers the All-Out Attack options and slams. */
export function readyAllOutAttack(api: GWorldApi, on: () => boolean): void {
  // All-Out Attack (Long): a yard more reach (p. 98).
  api.combat.registerAllOutAttackOption({
    module: MODULE_ID,
    key: LONG,
    label: L("Long.Title"),
    available: () => on(),
    attack: (context) => (context.ranged ? null : { reachBonus: 1, notes: [L("Long.Note")] }),
  });

  // Ending in a crouch, on a DX roll after the attack.
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: CROUCH_OPTION,
    maneuver: "allOutAttack",
    label: L("Long.Crouch"),
    available: () => on(),
    refuse: ({ actor }) => (onLong(actor) ? null : L("Long.OnlyLong")),
  });

  // A slam, flying tackle, pounce or shield rush at full Move (p. 98).
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: SLAM_OPTION,
    maneuver: "allOutAttack",
    label: L("Slam.FullMove"),
    available: () => on(),
    refuse: ({ actor }) => (slamMayUseFullMove(String(actor?.system?.allOutAttackOption ?? "")) ? null : L("Slam.NotThisOption")),
  });

  Hooks.on(api.combat.hooks.maneuverAllowances, (context: any) => {
    if (!on() || context?.maneuver !== "allOutAttack") return;
    if (optionValue(context.actor, SLAM_OPTION) === true && slamMayUseFullMove(String(context.option ?? ""))) context.movement = "full";
  });

  // A swing made Long is -2 damage, or -1 per die (p. 98).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!on() || context?.mode?.ranged || !onLong(context?.actor)) return;
    const mode = context.item?.system?.meleeModes?.[Number(context.mode?.index) || 0];
    const penalty = longDamagePenalty(mode?.damageBase, api.rules.parseDiceAdds(String(context.formula ?? ""))?.dice ?? 0);
    if (penalty) context.modifiers.push({ label: L("Long.Title"), value: penalty });
  });

  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!on() || !context?.actor?.isOwner || !context.outcome) return;
    if (!(context.tags ?? []).includes("attack") || !onLong(context.actor) || optionValue(context.actor, CROUCH_OPTION) !== true) return;
    void (async () => {
      const dx = api.actors.attribute(context.actor, "DX") ?? 10;
      const outcome: any = await api.roll.success({ actor: context.actor, base: dx, label: L("Long.CrouchRoll"), kind: "attribute" } as any);
      if (outcome) await api.actors.setPosture(context.actor, longCrouchPosture(outcome));
    })();
  });
}

/** Registers Move and Attack with any melee attack. */
export function readyMoveAndAttack(api: GWorldApi, on: () => boolean): void {
  // A parry is allowed, with what didn't strike (p. 107).
  Hooks.on(api.combat.hooks.maneuverAllowances, (context: any) => {
    if (on() && context?.maneuver === "moveAndAttack") context.defense = "any";
  });

  // A thrust may use slam damage where that is better (p. 107).
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: SLAM_DAMAGE_OPTION,
    maneuver: "moveAndAttack",
    label: L("Move.SlamDamage"),
    available: () => on(),
  });

  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!on() || context?.mode?.ranged || !onMoveAndAttack(context?.actor)) return;
    if (optionValue(context.actor, SLAM_DAMAGE_OPTION) !== true) return;
    const mode = context.item?.system?.meleeModes?.[Number(context.mode?.index) || 0];
    if (mode?.damageBase !== "thr") return;
    const thrust = api.rules.parseDiceAdds(String(context.formula ?? ""));
    if (!thrust) return;
    const hp = Number(context.actor.system?.hp?.max) || 0;
    // The velocity is the Move the fighter has now.
    const move = Number(context.actor.system?.derived?.move ?? context.actor.system?.derived?.basicMove) || 0;
    const better = slamThrust({ thrust, slam: api.rules.slamDamage(hp, move), weaponModifier: Number(mode.damageModifier) || 0 });
    if (better) context.formula = api.rules.formatDiceAdds(better);
  });

  // Note what struck, for the defenses that follow.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || context?.ranged || !context?.actor?.isOwner || !onMoveAndAttack(context.actor)) return;
    const label = `${String(context.dataset?.rollLabel ?? "")} ${String(context.dataset?.rollSkill ?? "")}`;
    void api.combat.setCombatState(context.actor, MODULE_ID, STRUCK, { itemId: String(context.item?.id ?? ""), part: strikingPart(context.item ?? null, label) }, "combat");
  });

  const struck = (actor: any): { itemId: string; part: StrikingPart } | null => {
    const value = api.combat.getCombatState(actor, MODULE_ID, STRUCK) as { itemId: string; part: StrikingPart } | undefined;
    return value && typeof value === "object" ? value : null;
  };

  // No retreat, no dodge after a kick or the like, no block with a shield that struck.
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on() || !onMoveAndAttack(context?.defender)) return;
    const record = struck(context.defender);
    if (!record) return;
    const refused = moveAndAttackRefusals(record.part);
    for (const choice of context.choices ?? []) {
      if (choice.key === "dodge" && refused.dodge) Object.assign(choice, { available: false, refusal: L("Move.NoDodge") });
      if (choice.key === "block" && refused.block) Object.assign(choice, { available: false, refusal: L("Move.NoBlock") });
    }
    Object.assign(context.retreat, { available: false, refusal: L("Move.NoRetreat") });
  });

  // No parry with the arm that struck.
  Hooks.on(api.combat.hooks.parryWeapons, (context: any) => {
    if (!on() || !onMoveAndAttack(context?.actor)) return;
    const record = struck(context.actor);
    if (!record || (record.part !== "weapon" && record.part !== "hand")) return;
    for (const candidate of context.candidates ?? []) {
      if (candidate.itemId === record.itemId) Object.assign(candidate, { excluded: true, reason: L("Move.NoParry") });
    }
  });

  // No Rapid Strike, and Deceptive Attack only where the cap is lifted (p. 107).
  Hooks.on(api.combat.hooks.meleeAttackOptions, (context: any) => {
    if (!on() || context?.maneuver !== "moveAndAttack") return;
    Object.assign(context.rapidStrike, { available: false, refusal: L("Move.NoRapidStrike") });
    Object.assign(context.deceptiveAttack, { available: false, refusal: L("Move.NoDeceptive") });
  });

  Hooks.on(api.combat.hooks.turnStart, (_combat: any, combatant: any) => {
    if (game.user?.isGM && combatant?.actor) void api.combat.clearCombatState(combatant.actor, MODULE_ID, STRUCK);
  });
}
