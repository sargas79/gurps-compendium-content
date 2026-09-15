/**
 * Extra effort in combat at the table (GURPS Martial Arts p. 131).
 *
 * Giant Step, Great Lunge and Heroic Charge are extra-effort options in the
 * attack dialog; Rapid Recovery is a button on a weapon's row, since it gives
 * back a parry the maneuver or the swing took away. Every option, the system's
 * Feverish Defense, Flurry of Blows and Mighty Blows among them, counts against
 * one offensive and one defensive option a turn. Flurry of Blows buys a
 * Rapid Strike's attacks one at a time, and Mighty Blows is for Attack alone.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { COMMITTED, DEFENSIVE } from "../committed-defensive/index.js";
import { longDamagePenalty } from "../maneuvers/rules.js";
import { gripOf } from "../readying/index.js";
import { isDefensive } from "../grips/rules.js";
import { rapidStrikeLimit, rapidStrikePenalty } from "../multiple-attacks/rules.js";
import {
  CRITICAL_INJURY,
  MOVE_AND_ATTACK_PENALTY,
  effortManeuvers,
  effortRefusal,
  flurryPenalty,
  type EffortOption,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Effort.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Effort.${key}`, data);

const USED = "ma-effort-used";
const LUNGED = "ma-great-lunge";
const RECOVERED = "ma-rapid-recovery";
const RAPID = "ma-rapid-strike-state";
const RAPID_OPTION = "ma-rapid-strike";

const KEYS: Partial<Record<EffortOption, string>> = {
  giantStep: "ma-giant-step",
  greatLunge: "ma-great-lunge-effort",
  heroicCharge: "ma-heroic-charge",
  flurryOfBlows: "ma-flurry-of-blows",
};

interface Used { offense: EffortOption | null; defense: EffortOption | null }

const hasTrait = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && pattern.test(String(item.name ?? "")));
const halves = (actor: any) => hasTrait(actor, /^(trained by a master|weapon master)\b/i);

/** Registers the options, the limits and the refinements. */
export function readyExtraEffort(api: GWorldApi, on: () => boolean, cinematicRapidStrike: () => boolean): void {
  const used = (actor: any): Used => ({ offense: null, defense: null, ...((api.combat.getCombatState(actor, MODULE_ID, USED) as Used | undefined) ?? {}) });
  const note = (actor: any, option: EffortOption) => {
    const current = used(actor);
    const kind = option === "rapidRecovery" || option === "feverishDefense" ? "defense" : "offense";
    if (current[kind] === option) return Promise.resolve();
    return api.combat.setCombatState(actor, MODULE_ID, USED, { ...current, [kind]: option }, "turn");
  };
  const maneuverOf = (actor: any) => String(actor?.system?.maneuver ?? "");
  const allowedOn = (option: EffortOption, actor: any) => effortManeuvers(option, `${MODULE_ID}.${DEFENSIVE}`, `${MODULE_ID}.${COMMITTED}`).includes(maneuverOf(actor));
  const refusal = (option: EffortOption, actor: any) => {
    const reason = effortRefusal(option, used(actor));
    return reason ? L(`Refusals.${reason}`) : null;
  };

  // Giant Step (p. 131): an extra step on Attack or Defensive Attack.
  api.combat.registerExtraEffort({
    module: MODULE_ID,
    key: KEYS.giantStep!,
    label: L("GiantStep"),
    kind: "offense",
    fp: 1,
    available: (context) => on() && !context.ranged && allowedOn("giantStep", context.actor),
    refuse: (context) => refusal("giantStep", context.actor),
    apply: () => ({ notes: [L("GiantStepNote")] }),
  });

  // Great Lunge (p. 131): All-Out Attack (Long)'s reach and swing, keeping the defenses.
  api.combat.registerExtraEffort({
    module: MODULE_ID,
    key: KEYS.greatLunge!,
    label: L("GreatLunge"),
    kind: "offense",
    fp: 1,
    available: (context) => on() && !context.ranged && allowedOn("greatLunge", context.actor),
    refuse: (context) => (context.item && isDefensive(gripOf(api, context.item)) ? L("Refusals.defensiveGrip") : refusal("greatLunge", context.actor)),
    apply: () => ({ reachBonus: 1, notes: [L("GreatLungeNote")] }),
  });

  // Heroic Charge (p. 131): Move and Attack without its -4 or its cap.
  api.combat.registerExtraEffort({
    module: MODULE_ID,
    key: KEYS.heroicCharge!,
    label: L("HeroicCharge"),
    kind: "offense",
    fp: 1,
    available: (context) => on() && !context.ranged && allowedOn("heroicCharge", context.actor),
    refuse: (context) => refusal("heroicCharge", context.actor),
    apply: () => ({ modifiers: [{ label: L("HeroicCharge"), value: -MOVE_AND_ATTACK_PENALTY }], notes: [L("HeroicChargeNote")] }),
  });

  // Flurry of Blows on this module's Rapid Strike (p. 131): its penalty halved, a point of FP an attack.
  const rapidPenalty = (context: any): number | null => {
    const declared = Math.min(rapidStrikeLimit(cinematicRapidStrike()), Math.floor(Number(context.chosen?.[`${MODULE_ID}.${RAPID_OPTION}`] ?? context.options?.[`${MODULE_ID}.${RAPID_OPTION}`]) || 0));
    if (declared >= 2) return rapidStrikePenalty(declared, halves(context.actor));
    const running = api.combat.getCombatState(context.actor, MODULE_ID, RAPID) as { remaining: number; penalty: number } | undefined;
    return running && running.remaining > 0 ? running.penalty : null;
  };
  api.combat.registerExtraEffort({
    module: MODULE_ID,
    key: KEYS.flurryOfBlows!,
    label: L("Flurry"),
    kind: "offense",
    fp: 1,
    // Offered wherever a Rapid Strike could be declared or is running: the dialog doesn't redraw as its number is typed.
    available: (context) => on() && !context.ranged && (rapidPenalty(context) !== null || api.combat.attackSequence(context.actor).count > 0),
    refuse: (context) => refusal("flurryOfBlows", context.actor),
    apply: (context) => {
      const penalty = rapidPenalty(context);
      // Ticked without a Rapid Strike: nothing to halve, and no FP spent on it.
      if (penalty === null) return { fatigue: -1, notes: [L("FlurryWithoutRapidStrike")] };
      return { modifiers: [{ label: L("Flurry"), value: flurryPenalty(penalty) - penalty }] };
    },
  });

  // The system's Flurry of Blows and Mighty Blows under the limit, and Mighty Blows on Attack only (p. 131).
  Hooks.on(api.combat.hooks.meleeAttackOptions, (context: any) => {
    if (!on() || !context?.actor) return;
    const mighty = maneuverOf(context.actor) !== "attack" ? L("Refusals.mightyAttackOnly") : refusal("mightyBlows", context.actor);
    if (mighty && context.mightyBlows) Object.assign(context.mightyBlows, { available: false, refusal: mighty });
    const flurry = refusal("flurryOfBlows", context.actor);
    if (flurry && context.flurryOfBlows) Object.assign(context.flurryOfBlows, { available: false, refusal: flurry });
  });

  /** The new options an attack took, for its critical failure. */
  const pendingInjury = new Map<string, EffortOption>();
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor || context.rollType !== "attack") return;
    const actor = context.actor;
    const chosen = (Object.entries(KEYS) as Array<[EffortOption, string]>).filter(([, key]) => context.options?.[`${MODULE_ID}.${key}`]).map(([option]) => option)
      .filter((option) => option !== "flurryOfBlows" || (context.modifiers ?? []).some((line: any) => line?.label === L("Flurry")));
    if (context.extraEffort?.mightyBlows) chosen.push("mightyBlows");
    if (context.extraEffort?.flurryOfBlows) chosen.push("flurryOfBlows");
    for (const option of chosen) void note(actor, option);
    if (chosen.includes("heroicCharge")) context.skillCap = null;
    if (chosen.includes("greatLunge")) void api.combat.setCombatState(actor, MODULE_ID, LUNGED, true, "turn");
    const risky = chosen.find((option) => option === "giantStep" || option === "greatLunge" || option === "heroicCharge");
    if (risky) pendingInjury.set(String(actor.uuid ?? ""), risky);
  });

  // A Great Lunge's swing hits as All-Out Attack (Long)'s does (p. 131).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!on() || context?.mode?.ranged || !api.combat.getCombatState(context?.actor, MODULE_ID, LUNGED)) return;
    const mode = context.item?.system?.meleeModes?.[Number(context.mode?.index) || 0];
    const penalty = longDamagePenalty(mode?.damageBase, api.rules.parseDiceAdds(String(context.formula ?? ""))?.dice ?? 0);
    if (penalty) context.modifiers.push({ label: L("GreatLunge"), value: penalty });
  });

  // A new option's critical failure: 1 HP of injury, to the leg for a Giant Step (p. 131).
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    const key = String(actor?.uuid ?? "");
    if (!on() || !(context.tags ?? []).includes("attack") || !pendingInjury.has(key)) return;
    const option = pendingInjury.get(key)!;
    pendingInjury.delete(key);
    if (!context.outcome?.criticalFailure || !actor?.isOwner) return;
    void api.actors.applyInjury(actor, { amount: CRITICAL_INJURY, label: F(option === "giantStep" ? "CriticalLeg" : "Critical", { option: L(option === "giantStep" ? "GiantStep" : option === "greatLunge" ? "GreatLunge" : "HeroicCharge") }) });
  });

  // Feverish Defense counts as the turn's defensive option (p. 131).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (on() && context?.feverish && context.defender?.isOwner) void note(context.defender, "feverishDefense");
  });
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on() || !context?.defender) return;
    const reason = refusal("feverishDefense", context.defender);
    if (reason) Object.assign(context.feverish, { available: false, refusal: reason });
  });

  // Rapid Recovery (p. 131): 1 FP for the weapon to parry after all.
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-rapid-recovery",
    itemTypes: ["equipment"],
    label: L("RapidRecovery"),
    icon: "fa-solid fa-rotate-left",
    visible: (item, actor) => {
      if (!on() || !(item?.system?.meleeModes ?? []).length) return false;
      const maneuver = maneuverOf(actor);
      const unbalanced = (item.system.meleeModes as any[]).some((mode) => mode?.unbalanced);
      return maneuver === "moveAndAttack" || (maneuver === "attack" && unbalanced && actor?.system?.conditions?.attackedThisTurn === true);
    },
    run: async (item, actor) => {
      const reason = refusal("rapidRecovery", actor);
      if (reason) return void ui.notifications?.warn(reason);
      const paid = await api.actors.applyInjury(actor, { amount: 1, fatigue: true, label: L("RapidRecovery") });
      if (!paid) return;
      await note(actor, "rapidRecovery");
      await api.combat.setCombatState(actor, MODULE_ID, RECOVERED, String(item.id), "turn");
      ui.notifications?.info(F("Recovered", { weapon: String(item.name ?? "") }));
    },
  });
  Hooks.on(api.combat.hooks.parryWeapons, (context: any) => {
    const recovered = on() ? api.combat.getCombatState(context?.actor, MODULE_ID, RECOVERED) : null;
    if (!recovered) return;
    // After Move and Attack the recovered weapon is the only one that parries.
    const moved = maneuverOf(context.actor) === "moveAndAttack";
    for (const candidate of context.candidates ?? []) {
      if (candidate.itemId === recovered) Object.assign(candidate, { excluded: false, reason: "" });
      else if (moved) Object.assign(candidate, { excluded: true, reason: "moveAndAttack" });
    }
  });
  Hooks.on(api.combat.hooks.maneuverAllowances, (context: any) => {
    if (on() && context?.maneuver === "moveAndAttack" && api.combat.getCombatState(context.actor, MODULE_ID, RECOVERED)) context.defense = "any";
  });
}
