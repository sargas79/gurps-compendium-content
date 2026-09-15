/**
 * Postures in attack at the table (GURPS Martial Arts pp. 98-99): the posture
 * tables on every melee attack, dropping to the ground as part of an attack,
 * and whether a lying fighter is face-up.
 */

import { addExtensionFields } from "../../shared/extensions.js";
import { MODULE_ID, type GWorldApi } from "../../shared/module.js";
import { DROPS, attackKind, dropCost, postureEffect, postureOfDrop, tablePosture, type Drop, type DropManeuver } from "./posture.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Posture.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Posture.${key}`, data);

const DROP_OPTION = "ma-drop";
/** The damage the tables took off the attack just rolled, for its damage roll. */
const DAMAGE = "ma-posture-damage";

/** The maneuvers a drop rides along with, by the system's key. */
const DROP_MANEUVERS: Record<string, DropManeuver> = {
  attack: "attack",
  [`${MODULE_ID}.ma-committed-attack`]: "committed",
  allOutAttack: "allOutAttack",
  moveAndAttack: "moveAndAttack",
};

/** The actor types this keeps data on. */
const ACTOR_TYPES = ["character", "npc"] as const;

/** Whether a lying fighter is face-up: this module's field, prone by default. */
function faceUpOf(actor: any): boolean {
  return actor?.system?.extensions?.[MODULE_ID]?.faceUp === true;
}

function postureOf(actor: any) {
  return tablePosture(String(actor?.system?.posture ?? "standing"), faceUpOf(actor));
}

/** Adds the face-up field before the world's actors are read. */
export function initPostureAttacks(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Actor", ACTOR_TYPES, { faceUp: new f.BooleanField({ required: true, initial: false }) });
}

/** Registers the drop options, the tables' hooks, and the face-up control. */
export function readyPostureAttacks(api: GWorldApi, on: () => boolean): void {
  for (const [maneuver, kind] of Object.entries(DROP_MANEUVERS)) {
    api.combat.registerManeuverOption({
      module: MODULE_ID,
      key: dropKey(kind),
      maneuver,
      label: L("Drop"),
      input: { type: "select", choices: DROPS.map((d) => ({ value: d, label: L(`Drops.${d}`) })) },
      available: () => on(),
      refuse: ({ actor, chosen }) => {
        const value = chosen[`${MODULE_ID}.${dropKey(kind)}`];
        if (!DROPS.includes(value as Drop)) return null;
        return dropCost(postureOf(actor), value as Drop, kind) ? null : L("CantDropFromHere");
      },
    });
  }

  // A drop that takes the whole step or movement leaves none (p. 98).
  Hooks.on(api.combat.hooks.maneuverAllowances, (context: any) => {
    if (!on()) return;
    const kind = DROP_MANEUVERS[String(context?.maneuver ?? "")];
    const drop = kind ? chosenDropFor(context.actor, kind) : null;
    if (drop && dropCost(postureOf(context.actor), drop, kind!) === "all") context.movement = "none";
  });

  // The tables, on every melee attack.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || context?.ranged || !context?.actor) return;
    const attacker = postureOf(context.actor);
    const targetActor = (context.targets ?? [])[0] ?? null;
    const name = `${String(context.dataset?.rollLabel ?? "")} ${String(context.item ? "" : context.dataset?.rollSkill ?? "")}`.trim();
    const kind = attackKind(name, context.item ? { reach: String(context.dataset?.reach ?? "") } : null);
    const location = String(context.calledShot?.hitLocation ?? "torso");
    const effect = postureEffect({ attacker, target: targetActor ? postureOf(targetActor) : "standing", kind, location });
    if (effect.refusal === "prohibited" || (effect.refusal === "outOfReach" && targetActor)) {
      context.refusal = F(effect.refusal === "prohibited" ? "Prohibited" : "OutOfReach", { posture: L(`Postures.${attacker}`), attack: name || kind });
      return;
    }
    if (!targetActor) return;
    for (const line of effect.hit) context.modifiers.push({ label: L(`Line.${line.key}`), value: line.value });
    if (context.actor.isOwner) void api.combat.setCombatState(context.actor, MODULE_ID, DAMAGE, effect.damage, "turn");
  });

  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!on() || context?.mode?.ranged || !context?.actor) return;
    const value = Number(api.combat.getCombatState(context.actor, MODULE_ID, DAMAGE)) || 0;
    if (!value) return;
    context.modifiers.push({ label: L("Title"), value });
    if (context.actor.isOwner) void api.combat.clearCombatState(context.actor, MODULE_ID, DAMAGE);
  });

  // The drop happens with the attack.
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!on() || !context?.actor?.isOwner || !(context.tags ?? []).includes("attack")) return;
    const kind = DROP_MANEUVERS[String(context.actor.system?.maneuver ?? "")];
    const drop = kind ? chosenDropFor(context.actor, kind) : null;
    if (!drop || !dropCost(postureOf(context.actor), drop, kind!)) return;
    const next = postureOfDrop(drop);
    void (async () => {
      await context.actor.update({ [`system.extensions.${MODULE_ID}.faceUp`]: next.faceUp });
      await api.actors.setPosture(context.actor, next.posture);
    })();
  });

  // Face-up or prone, while lying.
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-face-up",
    sheet: "character",
    tab: "combat",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ma-face-up.hbs`,
    visible: (actor) => on() && String(actor?.system?.posture ?? "") === "lying",
    context: (actor) => ({ faceUp: faceUpOf(actor) }),
    listeners: (element, actor) => {
      element.querySelector<HTMLInputElement>("[data-ma-face-up]")?.addEventListener("change", (event) => {
        void actor.update({ [`system.extensions.${MODULE_ID}.faceUp`]: (event.currentTarget as HTMLInputElement).checked });
      });
    },
  });
}

/** The drop option's key on each maneuver. */
function dropKey(kind: DropManeuver): string {
  return kind === "attack" ? DROP_OPTION : `${DROP_OPTION}-${kind}`;
}

/** The drop chosen on this maneuver's option. */
function chosenDropFor(actor: any, kind: DropManeuver): Drop | null {
  const value = actor?.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[dropKey(kind)];
  return DROPS.includes(value as Drop) ? (value as Drop) : null;
}
