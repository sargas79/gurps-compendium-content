/**
 * Multiple attacks at the table (GURPS Martial Arts pp. 126-128).
 *
 * The attack sequence is worked out through `gworld.attackSequence`: attacks
 * from the maneuver and Extra Attack, plus a Rapid Strike's extra attacks, less
 * the feints traded for attacks and the yards skipped between targets. Every
 * attack picks its own target. This module's own Rapid Strike option stands in
 * for the system's, so a Rapid Strike can have more than two attacks under the
 * cinematic rule; the same grappling move can't be repeated on a foe in one
 * turn. With the ranged options switched on, a Rapid Strike may be thrown
 * (pp. 120-121).
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { thrownModes } from "../ranged/index.js";
import {
  attacksLeft,
  baseAttacks,
  grappleMoveKey,
  rapidStrikeLimit,
  rapidStrikePenalty,
  skippedAttacks,
  specialRefusal,
  type SpecialOption,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.MultipleAttacks.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.MultipleAttacks.${key}`, data);

export const RAPID_STRIKE = "ma-rapid-strike";
/** This turn's Rapid Strike: its attacks, and how many are still to come. */
const RAPID = "ma-rapid-strike-state";
const FEINTS = "ma-feints-traded";
const SKIPPED = "ma-yards-skipped";
const LAST_TARGET = "ma-last-target";
const SPECIAL = "ma-special-option";
const GRAPPLES = "ma-grapple-moves";

interface RapidState { attacks: number; remaining: number; penalty: number }

const hasTrait = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && pattern.test(String(item.name ?? "")));
const halves = (actor: any) => hasTrait(actor, /^(trained by a master|weapon master)\b/i);
const inCombat = () => Boolean((game as any).combat?.started);

/** Yards between two token documents on their scene. */
function yardsBetween(a: any, b: any): number {
  const grid = a?.parent?.grid ?? b?.parent?.grid;
  const size = Number(grid?.size) || 100;
  const distance = Number(grid?.distance) || 1;
  const dx = (Number(a?.x) || 0) - (Number(b?.x) || 0);
  const dy = (Number(a?.y) || 0) - (Number(b?.y) || 0);
  return Math.round(Math.hypot(dx, dy) / size) * distance;
}

/** Registers the sequence, the Rapid Strike option and the hooks. */
export function readyMultipleAttacks(api: GWorldApi, on: () => boolean, cinematic: () => boolean, thrown: () => boolean = () => false): void {
  const state = <T>(actor: any, key: string): T | undefined => api.combat.getCombatState(actor, MODULE_ID, key) as T | undefined;
  // A Rapid Strike is a melee attack's, or a thrown weapon's under the ranged options (p. 120).
  const rapidAttack = (ranged: boolean, item: any, derived?: unknown) => !ranged || (thrown() && !derived && thrownModes(item).length > 0);

  Hooks.on(api.combat.hooks.attackSequence, (context: any) => {
    if (!on() || !context?.actor) return;
    const actor = context.actor;
    const info = Number(context.count) > 0;
    const base = baseAttacks({
      attacks: info,
      extraAttacks: Math.max(0, (Number(actor.system?.derived?.attacksPerTurn) || 1) - 1),
      allOutDouble: context.maneuver === "allOutAttack" && context.option === "double",
    });
    const rapid = state<RapidState>(actor, RAPID);
    context.count = attacksLeft({
      base,
      rapidStrikeExtra: rapid ? rapid.attacks - 1 : 0,
      feints: Number(state<number>(actor, FEINTS)) || 0,
      skipped: Number(state<number>(actor, SKIPPED)) || 0,
    });
    if (context.count > 1) context.pickTargets = true;
  });

  // The system's own Rapid Strike gives way to this module's (p. 127).
  Hooks.on(api.combat.hooks.meleeAttackOptions, (context: any) => {
    if (!on() || !context?.rapidStrike) return;
    Object.assign(context.rapidStrike, { available: false, refusal: L("UseOwnRapidStrike") });
  });

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: RAPID_STRIKE,
    label: L("RapidStrike"),
    attack: "any",
    input: { type: "number", min: 0, max: 9 },
    available: (context) => on() && rapidAttack(Boolean(context.ranged), context.item) && api.combat.attackSequence(context.actor).count > 0,
    refuse: (context) => {
      const reason = specialRefusal("rapidStrike", state<SpecialOption>(context.actor, SPECIAL) ?? null, String(context.maneuver ?? ""));
      if (reason) return L(`Refusals.${reason}`);
      return state<RapidState>(context.actor, RAPID) ? L("Refusals.alreadyRapid") : null;
    },
    apply: (context, value) => {
      const attacks = Math.min(rapidStrikeLimit(cinematic()), Math.floor(Number(value) || 0));
      if (attacks < 2) return null;
      return { modifiers: [{ label: F("RapidStrikeLine", { attacks }), value: rapidStrikePenalty(attacks, halves(context.actor)) }] };
    },
  });

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor || context.rollType !== "attack") return;
    const actor = context.actor;
    const writes: Array<Promise<unknown>> = [];

    // A Rapid Strike declared on this attack, or one still running.
    const declared = Math.min(rapidStrikeLimit(cinematic()), Math.floor(Number(context.options?.[`${MODULE_ID}.${RAPID_STRIKE}`]) || 0));
    const running = state<RapidState>(actor, RAPID);
    const rapid = rapidAttack(Boolean(context.ranged), context.item, context.mode?.derived);
    // Offered on a thrown weapon's every row, but a handful is one burst, not a Rapid Strike (p. 121).
    if (!rapid && declared >= 2) {
      context.refusal = L("Refusals.noRapidHere");
      return;
    }
    if (rapid && declared >= 2) {
      const penalty = rapidStrikePenalty(declared, halves(actor));
      writes.push(api.combat.setCombatState(actor, MODULE_ID, RAPID, { attacks: declared, remaining: declared - 1, penalty } satisfies RapidState, "turn"));
      writes.push(api.combat.setCombatState(actor, MODULE_ID, SPECIAL, "rapidStrike", "turn"));
    } else if (rapid && running && running.remaining > 0) {
      context.modifiers.push({ label: F("RapidStrikeLine", { attacks: running.attacks }), value: running.penalty });
      writes.push(api.combat.setCombatState(actor, MODULE_ID, RAPID, { ...running, remaining: running.remaining - 1 }, "turn"));
    }

    // A Dual-Weapon Attack is the maneuver's one special option (p. 127).
    const dual = [game.i18n.localize("GWORLD.Melee.DualPrimary"), game.i18n.localize("GWORLD.Melee.DualOff")];
    if ((context.modifiers ?? []).some((line: any) => dual.includes(line?.label))) {
      const reason = specialRefusal("dualWeapon", state<SpecialOption>(actor, SPECIAL) ?? null, String(actor.system?.maneuver ?? ""));
      if (reason) {
        context.refusal = L(`Refusals.${reason}`);
        return;
      }
      writes.push(api.combat.setCombatState(actor, MODULE_ID, SPECIAL, "dualWeapon", "turn"));
    }

    // Switching targets: each full yard skipped uses up an attack (pp. 127-128).
    const token = (context.targetTokens ?? [])[0];
    if (inCombat() && token) {
      const last = state<{ uuid: string; x: number; y: number; scene: string }>(actor, LAST_TARGET);
      if (last && last.uuid !== token.uuid && last.scene === String(token.parent?.id ?? "")) {
        const skipped = skippedAttacks(yardsBetween(token, { x: last.x, y: last.y, parent: token.parent }));
        if (skipped > 0) {
          const sequence = api.combat.attackSequence(actor);
          if (sequence.made + skipped >= sequence.count) {
            context.refusal = F("TooFar", { skipped });
            return;
          }
          writes.push(api.combat.setCombatState(actor, MODULE_ID, SKIPPED, (Number(state<number>(actor, SKIPPED)) || 0) + skipped, "turn"));
          ui.notifications?.info(F("Skipped", { skipped }));
        }
      }
      writes.push(api.combat.setCombatState(actor, MODULE_ID, LAST_TARGET, { uuid: String(token.uuid ?? ""), x: Number(token.x) || 0, y: Number(token.y) || 0, scene: String(token.parent?.id ?? "") }, "turn"));
    }
    void Promise.all(writes);
  });

  // An attack traded for a feint (p. 127).
  Hooks.on(api.combat.hooks.feintResult, (context: any) => {
    const actor = context?.feinter;
    if (!on() || !actor?.isOwner || !inCombat() || api.combat.attackSequence(actor).count === 0) return;
    void api.combat.setCombatState(actor, MODULE_ID, FEINTS, (Number(state<number>(actor, FEINTS)) || 0) + 1, "turn");
  });

  // The same grappling move on the same foe only once a turn (p. 128).
  Hooks.on(api.combat.hooks.grappleMove, (context: any) => {
    if (!on() || !inCombat() || !context?.actor) return;
    const moves = state<string[]>(context.actor, GRAPPLES) ?? [];
    const key = grappleMoveKey(String(context.move ?? ""), String(context.foe?.uuid ?? ""));
    if (moves.includes(key)) {
      context.refusal = L("RepeatedGrapple");
      return;
    }
    void api.combat.setCombatState(context.actor, MODULE_ID, GRAPPLES, [...moves, key], "turn");
  });
}
