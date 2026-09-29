/**
 * Extra effort in combat at the table (GURPS Martial Arts p. 131).
 *
 * Giant Step, Great Lunge, Heroic Charge and Rapid Recovery, and the limit of
 * one offensive and one defensive option a turn, are the Basic Set's now
 * (Revised, pp. 571-572) and the system's. What Martial Arts adds stays here:
 * Flurry of Blows buys this module's Rapid Strike's attacks one at a time, and
 * Mighty Blows is for Attack alone. The system's cap counts both.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { rapidStrikeLimit, rapidStrikePenalty } from "../multiple-attacks/rules.js";
import { flurryPenalty } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Effort.${key}`);

const RAPID = "ma-rapid-strike-state";
const RAPID_OPTION = "ma-rapid-strike";
const FLURRY = "ma-flurry-of-blows";

const hasTrait = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && pattern.test(String(item.name ?? "")));
const halves = (actor: any) => hasTrait(actor, /^(trained by a master|weapon master)\b/i);

/** Registers Flurry of Blows on this module's Rapid Strike and the Attack-only limit on Mighty Blows. */
export function readyExtraEffort(api: GWorldApi, on: () => boolean, cinematicRapidStrike: () => boolean): void {
  const maneuverOf = (actor: any) => String(actor?.system?.maneuver ?? "");
  /** The system's cap of one offensive option a turn, read from what the round holds. */
  const refusal = (actor: any, extra: "flurry") => api.effort.capRefusal(actor, [extra]);

  // Flurry of Blows on this module's Rapid Strike (p. 131): its penalty halved, a point of FP an attack.
  const rapidPenalty = (context: any): number | null => {
    const declared = Math.min(rapidStrikeLimit(cinematicRapidStrike()), Math.floor(Number(context.chosen?.[`${MODULE_ID}.${RAPID_OPTION}`] ?? context.options?.[`${MODULE_ID}.${RAPID_OPTION}`]) || 0));
    if (declared >= 2) return rapidStrikePenalty(declared, halves(context.actor));
    const running = api.combat.getCombatState(context.actor, MODULE_ID, RAPID) as { remaining: number; penalty: number } | undefined;
    return running && running.remaining > 0 ? running.penalty : null;
  };
  api.combat.registerExtraEffort({
    module: MODULE_ID,
    key: FLURRY,
    label: L("Flurry"),
    kind: "offense",
    fp: 1,
    // Offered wherever a Rapid Strike could be declared or is running: the dialog doesn't redraw as its number is typed.
    available: (context) => on() && !context.ranged && (rapidPenalty(context) !== null || api.combat.attackSequence(context.actor).count > 0),
    refuse: (context) => refusal(context.actor, "flurry"),
    apply: (context) => {
      const penalty = rapidPenalty(context);
      // Ticked without a Rapid Strike: nothing to halve, and no FP spent on it.
      if (penalty === null) return { fatigue: -1, notes: [L("FlurryWithoutRapidStrike")] };
      return { modifiers: [{ label: L("Flurry"), value: flurryPenalty(penalty) - penalty }] };
    },
  });

  // Mighty Blows on Attack only (p. 131).
  Hooks.on(api.combat.hooks.meleeAttackOptions, (context: any) => {
    if (!on() || !context?.actor || !context.mightyBlows) return;
    if (maneuverOf(context.actor) !== "attack") Object.assign(context.mightyBlows, { available: false, refusal: L("Refusals.mightyAttackOnly") });
  });
}
