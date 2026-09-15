/**
 * Acrobatic Stand, acrobatic movement, and Acrobatic and Flying Attacks at the
 * table (GURPS Martial Arts pp. 98, 105-107).
 *
 * The rolls are made from a section on the Combat tab. What they leave behind
 * is combat state until the fighter's next turn: the next dodge's bonus or
 * penalty, and no defenses at all after an all-out stand.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { STUNTS, acrobaticDodge, standModifiers, standOutcome, stuntAttackPenalty, stuntRoll, type LowPosture } from "./rules.js";
import { halvedPenalty } from "../chambara/rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Acrobatics.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Acrobatics.${key}`, data);

const ACROBATIC_ATTACK = "ma-acrobatic-attack";
const FLYING_ATTACK = "ma-flying-attack";
/** The next dodge's Acrobatic Dodge modifier. */
const DODGE = "ma-acrobatic-dodge";
/** No active defenses, after an all-out stand. */
const NO_DEFENSE = "ma-no-defense";

function optionValue(actor: any, key: string): unknown {
  return actor?.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[key];
}

/** A skill's level, or an attribute's for "DX". */
function levelOf(api: GWorldApi, actor: any, name: string): number | null {
  return name === "DX" ? api.actors.attribute(actor, "DX") : api.actors.skillLevel(actor, name);
}

/** A chambara fighter's stunt lines: the total penalty halved, rounding against him (p. 128). */
function chambaraHalved(lines: Array<{ key: string; value: number }>, halves: boolean): Array<{ key: string; value: number }> {
  if (!halves) return lines;
  const total = lines.reduce((sum, line) => sum + line.value, 0);
  const halved = halvedPenalty(total);
  return halved === total ? lines : [...lines, { key: "chambara", value: halved - total }];
}

async function standUp(api: GWorldApi, actor: any, allOut: boolean, crouch: boolean, halves: boolean): Promise<void> {
  const from = String(actor?.system?.posture ?? "standing");
  if (from !== "lying" && from !== "sitting" && from !== "crawling") {
    ui.notifications?.info(L("AlreadyUp"));
    return;
  }
  const acrobatics = api.actors.skillLevel(actor, "Acrobatics");
  if (acrobatics === null) {
    ui.notifications?.warn(L("NoAcrobatics"));
    return;
  }
  const encumbrance = Number(api.actors.encumbrance(actor)?.level) || 0;
  const outcome: any = await api.roll.success({
    actor,
    base: acrobatics,
    label: L("Stand"),
    skill: "Acrobatics",
    modifiers: chambaraHalved(standModifiers(encumbrance, allOut), halves).map((line) => ({ label: L(`Line.${line.key}`), value: line.value })),
  } as any);
  if (!outcome) return;
  const result = standOutcome(from as LowPosture, outcome, crouch);
  await api.actors.setPosture(actor, result.posture);
  if (allOut) await api.combat.setCombatState(actor, MODULE_ID, NO_DEFENSE, true, "combat");
  if (result.note !== "none") ui.notifications?.info(L(`Note.${result.note}`));
}

async function performStunt(api: GWorldApi, actor: any, key: string, input: number, window: boolean, halves: boolean): Promise<void> {
  const stunt = STUNTS.find((s) => s.key === key);
  if (!stunt) return;
  const acrobaticAttack = String(actor?.system?.maneuver ?? "") === "moveAndAttack" && optionValue(actor, ACROBATIC_ATTACK) === true;
  const roll = stuntRoll({
    stunt,
    levelOf: (name) => levelOf(api, actor, name),
    input,
    window: key === "vaulting" && window,
    acrobaticAttack,
    speedRange: api.rules.speedRangeModifier,
  });
  if (!roll) {
    ui.notifications?.warn(F("NoSkill", { skills: stunt.skills.map((s) => s.name).join(", ") }));
    return;
  }
  const outcome: any = await api.roll.success({
    actor,
    base: roll.base,
    label: `${L(`Stunt.${key}`)} (${roll.skill})`,
    ...(roll.skill === "DX" ? { kind: "attribute" } : { skill: roll.skill }),
    modifiers: chambaraHalved(roll.modifiers, halves).map((line) => ({ label: L(`Line.${line.key}`), value: line.value })),
  } as any);
  if (outcome) await api.combat.setCombatState(actor, MODULE_ID, DODGE, acrobaticDodge(outcome.success), "combat");
}

/** A Flying Attack's leap: DX or Jumping, and down on a failure. */
async function flyingLeap(api: GWorldApi, actor: any): Promise<void> {
  const dx = levelOf(api, actor, "DX");
  const jumping = api.actors.skillLevel(actor, "Jumping");
  const useJumping = jumping !== null && jumping > (dx ?? -Infinity);
  const outcome: any = await api.roll.success({
    actor,
    base: useJumping ? jumping : (dx ?? 10),
    label: L("FlyingLeap"),
    ...(useJumping ? { skill: "Jumping" } : { kind: "attribute" }),
  } as any);
  if (outcome && !outcome.success) {
    await api.actors.setPosture(actor, "lying");
    ui.notifications?.warn(L("Note.fellFlying"));
  }
}

/** Registers the section, the options and the defense hooks. */
export function readyAcrobatics(api: GWorldApi, on: () => boolean, chambara: (actor: any) => boolean = () => false): void {
  // A chambara fighter may use all of this, at half the penalty (p. 128).
  const allowed = (actor: any) => on() || chambara(actor);
  // An Acrobatic Attack or a Flying Attack, as the Move and Attack it is (p. 107).
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: ACROBATIC_ATTACK,
    maneuver: "moveAndAttack",
    label: L("AcrobaticAttack"),
    available: (actor: any) => allowed(actor),
    refuse: ({ chosen }) => (chosen[`${MODULE_ID}.${FLYING_ATTACK}`] === true ? L("OneOrOther") : null),
    // A chambara fighter's -2 is halved, like a Flying Attack's -1 (p. 129).
    attack: (context: any) => ({ modifiers: [{ label: L("AcrobaticAttack"), value: chambara(context?.actor) ? halvedPenalty(stuntAttackPenalty("acrobatic")) : stuntAttackPenalty("acrobatic") }] }),
  });
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: FLYING_ATTACK,
    maneuver: "moveAndAttack",
    label: L("FlyingAttack"),
    available: (actor: any) => allowed(actor),
    refuse: ({ chosen }) => (chosen[`${MODULE_ID}.${ACROBATIC_ATTACK}`] === true ? L("OneOrOther") : null),
    attack: () => ({ modifiers: [{ label: L("FlyingAttack"), value: stuntAttackPenalty("flying") }] }),
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-acrobatics",
    sheet: "character",
    tab: "combat",
    position: "start",
    template: `modules/${MODULE_ID}/templates/ma-acrobatics.hbs`,
    visible: (actor) => allowed(actor),
    context: (actor) => {
      const posture = String(actor?.system?.posture ?? "standing");
      return {
        low: posture === "lying" || posture === "sitting" || posture === "crawling",
        stunts: STUNTS.map((s) => ({ key: s.key, label: L(`Stunt.${s.key}`), input: s.input ?? "" })),
        flying: String(actor?.system?.maneuver ?? "") === "moveAndAttack" && optionValue(actor, FLYING_ATTACK) === true,
        dodge: api.combat.getCombatState(actor, MODULE_ID, DODGE) as number | undefined,
        noDefense: api.combat.getCombatState(actor, MODULE_ID, NO_DEFENSE) === true,
      };
    },
    listeners: (element, actor) => {
      element.querySelector("[data-ma-stand]")?.addEventListener("click", () => {
        const allOut = element.querySelector<HTMLInputElement>("[data-ma-stand-allout]")?.checked ?? false;
        const crouch = element.querySelector<HTMLInputElement>("[data-ma-stand-crouch]")?.checked ?? false;
        void standUp(api, actor, allOut, crouch, chambara(actor));
      });
      element.querySelector("[data-ma-stunt-roll]")?.addEventListener("click", () => {
        const key = element.querySelector<HTMLSelectElement>("[data-ma-stunt]")?.value ?? "";
        const input = Number(element.querySelector<HTMLInputElement>("[data-ma-stunt-input]")?.value) || 0;
        const window = element.querySelector<HTMLInputElement>("[data-ma-stunt-window]")?.checked ?? false;
        void performStunt(api, actor, key, input, window, chambara(actor));
      });
      element.querySelector("[data-ma-flying-leap]")?.addEventListener("click", () => void flyingLeap(api, actor));
    },
  });

  // The next dodge after a stunt is an Acrobatic Dodge (p. 105).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!allowed(context?.defender) || context?.defense !== "dodge") return;
    const value = Number(api.combat.getCombatState(context.defender, MODULE_ID, DODGE));
    if (value) context.modifiers.push({ label: L("AcrobaticDodge"), value });
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!allowed(context?.actor) || !context?.actor?.isOwner || !(context.tags ?? []).includes("dodge")) return;
    if (api.combat.getCombatState(context.actor, MODULE_ID, DODGE) !== undefined) void api.combat.clearCombatState(context.actor, MODULE_ID, DODGE);
  });

  // An all-out stand leaves no active defenses (p. 98).
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!allowed(context?.defender) || api.combat.getCombatState(context?.defender, MODULE_ID, NO_DEFENSE) !== true) return;
    for (const choice of context.choices ?? []) Object.assign(choice, { available: false, refusal: L("NoDefenseAllOut") });
  });

  Hooks.on(api.combat.hooks.turnStart, (_combat: any, combatant: any) => {
    if (!game.user?.isGM || !combatant?.actor) return;
    void api.combat.clearCombatState(combatant.actor, MODULE_ID, NO_DEFENSE);
    void api.combat.clearCombatState(combatant.actor, MODULE_ID, DODGE);
  });
}
