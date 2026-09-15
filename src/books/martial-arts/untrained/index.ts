/**
 * Untrained fighters and Harsh Realism for Unarmed Fighters, at the table
 * (GURPS Martial Arts pp. 113, 124).
 *
 * Untrained: when a fight starts the GM is told who must make a Fright Check
 * at +5, and each untrained combatant's turn starts with the Coin Toss. Without
 * a melee skill at DX level (or an Art or Sport skill at DX+3), Committed and
 * Defensive Attack aren't offered, and Feints, Deceptive Attacks, Rapid Strikes
 * and Defensive Grips are refused.
 *
 * Harsh realism: every bare-handed parry against a weapon is at -3, and failing
 * by 3 or less puts the limb in the way of the blow; low blows are harder to
 * parry by hand; an unarmed blow to the skull hurts the striker; the off hand
 * and a hurt striking part cost skill or damage.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { COMMITTED, DEFENSIVE } from "../committed-defensive/index.js";
import { gripOf } from "../readying/index.js";
import { isDefensive } from "../grips/rules.js";
import {
  HEAT_OF_BATTLE,
  UNARMED_PARRY_VS_WEAPON,
  UNARMED_SKILLS,
  bruisedKnuckles,
  coinToss,
  isCombatSkill,
  isUntrained,
  limbInTheWay,
  limbSpared,
  lowLineParry,
  mayUseAdvancedOptions,
  offHandPenalty,
  type SkillEntry,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Untrained.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Untrained.${key}`, data);

const LIMB = "ma-parried-limb";
const OFF_HAND = "ma-off-hand";
const BRUISED = "ma-bruised";
const FULL_POWER = "ma-bruised-full";

const skillsOf = (actor: any): SkillEntry[] => [...(actor?.items ?? [])]
  .filter((item: any) => item.type === "skill" || item.type === "technique")
  .map((item: any) => ({ name: String(item.name ?? ""), relativeLevel: typeof item.system?.derived?.relativeLevel === "number" ? item.system.derived.relativeLevel : null }));
const traitNamed = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((item: any) => (item.type === "trait" || item.type === "technique") && pattern.test(String(item.name ?? "")));
const combatReflexes = (actor: any) => traitNamed(actor, /^combat reflexes/i);
const post = (content: string) => ChatMessage.implementation.create({
  content: `<div class="gworld gworld-chat">${content}</div>`,
  whisper: [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id),
});
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);

/** Whether Limited Maneuver Selection lets this fighter use the advanced maneuvers and options. */
export function allowsAdvancedOptions(on: () => boolean): (actor: any) => boolean {
  return (actor) => !on() || mayUseAdvancedOptions(skillsOf(actor));
}

/** Registers both rule sets' hooks and options. */
export function readyUntrained(api: GWorldApi, untrained: () => boolean, harsh: () => boolean): void {
  const allowed = allowsAdvancedOptions(untrained);

  // ── untrained fighters (p. 113) ──
  Hooks.on(api.combat.hooks.combatStart, (combat: any) => {
    if (!untrained() || !isActiveGm()) return;
    const names = [...(combat?.combatants ?? [])].map((c: any) => c.actor).filter((a: any) => a && isUntrained(skillsOf(a), combatReflexes(a))).map((a: any) => foundry.utils.escapeHTML(String(a.name)));
    if (names.length) void post(`<div class="gc-head"><span class="gc-label">${L("Fear")}</span></div><div class="gc-result">${F("FearText", { names: names.join(", "), bonus: HEAT_OF_BATTLE })}</div>`);
  });
  Hooks.on(api.combat.hooks.turnStart, async (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!untrained() || !isActiveGm() || !actor || !isUntrained(skillsOf(actor), combatReflexes(actor))) return;
    const roll = new Roll("1d6");
    await roll.evaluate();
    const choice = coinToss(Number(roll.total));
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${L("CoinToss")}</span></div><div class="gc-result">${F(choice === "attack" ? "CoinAttack" : "CoinDefend", { name: foundry.utils.escapeHTML(String(actor.name)), roll: roll.total })}</div></div>`,
      rolls: [roll],
    });
  });
  Hooks.on(api.combat.hooks.meleeAttackOptions, (context: any) => {
    if (!context?.actor || allowed(context.actor)) return;
    for (const key of ["deceptiveAttack", "rapidStrike"]) {
      if (context[key]) Object.assign(context[key], { available: false, refusal: L("Limited") });
    }
  });
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!context?.actor || context.rollType !== "attack" || allowed(context.actor)) return;
    const maneuver = String(context.actor.system?.maneuver ?? "");
    const rapid = Math.floor(Number(context.options?.[`${MODULE_ID}.ma-rapid-strike`]) || 0) >= 2;
    const grip = context.item && !context.ranged ? isDefensive(gripOf(api, context.item)) : false;
    if (rapid || Number(context.deceptive) > 0 || grip || maneuver === `${MODULE_ID}.${COMMITTED}` || maneuver === `${MODULE_ID}.${DEFENSIVE}`) {
      context.refusal = L("Limited");
    }
  });
  Hooks.on(api.combat.hooks.feintModifiers, (context: any) => {
    if (context?.actor && !allowed(context.actor)) context.refusal = L("Limited");
  });

  // ── harsh realism: parrying weapons and low-line parries (p. 124) ──
  const pending = new Map<string, { itemUuid: string; spared: boolean }>();
  const unarmedParry = (parryWeapon: any) => Boolean(parryWeapon) && (parryWeapon.natural === true || UNARMED_SKILLS.includes(String(parryWeapon.skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase()));
  const weaponAttack = (weapon: any) => {
    const skill = String(weapon?.skill ?? "");
    return Boolean(weapon) && skill !== "" && skill !== "DX" && isCombatSkill(skill) && !UNARMED_SKILLS.includes(skill.replace(/\s*\(.*$/, "").trim().toLowerCase());
  };
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!harsh() || context?.defense !== "parry") return;
    const parry = context.parryWeapon;
    if (unarmedParry(parry) && weaponAttack(context.attackWeapon)) {
      const already = api.rules.bareHandedParryModifier({ parrySkill: String(parry.skill ?? ""), bareHanded: true, attackIsWeapon: true, attackIsThrust: context.attackWeapon?.thrust === true });
      const extra = UNARMED_PARRY_VS_WEAPON - already;
      if (extra) context.modifiers.push({ label: L("ParryWeapon"), value: extra });
      const flexible = /kusari|whip|flail/i.test(String(context.attackWeapon?.skill ?? ""));
      const spared = limbSpared({ parrySkill: String(parry.skill ?? ""), closeCombat: context.defender?.system?.conditions?.closeCombat === true, damageType: String(context.attackWeapon?.damageType ?? ""), flexible });
      if (context.attackWeapon?.itemUuid) pending.set(String(context.defender?.uuid ?? ""), { itemUuid: String(context.attackWeapon.itemUuid), spared });
    }
    const row = parry?.itemId ? ((api.actors.derived(context.defender)?.melee ?? []) as any[]).find((r) => r.itemId === parry.itemId) : null;
    const handOrReachC = parry?.natural === true || String(row?.reach ?? "").trim() === "C";
    const low = lowLineParry({ posture: String(context.defender?.system?.posture ?? "standing"), hitLocation: String(context.calledShot?.hitLocation ?? ""), handOrReachC });
    if (low) context.modifiers.push({ label: L("LowLine"), value: low });
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const key = String(context?.actor?.uuid ?? "");
    const limb = pending.get(key);
    if (!limb || !(context.tags ?? []).includes("parry")) return;
    pending.delete(key);
    const outcome = context.outcome;
    if (!harsh() || !outcome || outcome.success || limb.spared || !limbInTheWay(Number(outcome.margin) || 0) || !context.actor?.isOwner) return;
    void api.combat.setCombatState(context.actor, MODULE_ID, LIMB, { itemUuid: limb.itemUuid }, "turn");
    void post(`<div class="gc-result">${F("LimbHit", { name: foundry.utils.escapeHTML(String(context.actor.name ?? "")) })}</div>`);
  });
  // The blow lands on the parrying arm (p. 124).
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    if (!harsh() || !context?.actor || !context.damage) return;
    const limb = api.combat.getCombatState(context.actor, MODULE_ID, LIMB) as { itemUuid: string } | undefined;
    if (!limb || String(context.damage.itemUuid ?? context.item?.uuid ?? "") !== limb.itemUuid) return;
    context.damage.hitLocation = "arm";
    delete context.damage.addonLocation;
    void api.combat.clearCombatState(context.actor, MODULE_ID, LIMB);
  });

  // ── harsh realism: striking bone (p. 124) ──
  Hooks.on(api.combat.hooks.hurtingYourself, (context: any) => {
    if (harsh() && context?.hitLocation === "skull") context.minimumDr = 0;
  });

  // ── harsh realism: the off hand, and a hurt striking part (p. 124) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: OFF_HAND,
    label: L("OffHand"),
    attack: "melee",
    available: (context) => harsh() && !context.item,
    apply: (context) => {
      const trained = traitNamed(context.actor, /^(ambidexterity|off-hand weapon training)/i);
      const penalty = offHandPenalty(trained);
      if (!penalty.skill) return { notes: [L("OffHandTrained")] };
      return { modifiers: [{ label: L("OffHand"), value: penalty.skill }], damageModifiers: [{ label: L("OffHandSt"), value: -1 }] };
    },
  });
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: BRUISED,
    label: L("Bruised"),
    attack: "melee",
    input: { type: "number", min: 0, max: 4 },
    available: (context) => harsh() && !context.item,
    apply: (context, value) => {
      const shock = bruisedKnuckles(Number(value), traitNamed(context.actor, /^high pain threshold/i));
      if (!shock) return Number(value) > 0 ? { notes: [L("BruisedIgnored")] } : null;
      if (context.chosen?.[`${MODULE_ID}.${FULL_POWER}`]) {
        const low = traitNamed(context.actor, /^low pain threshold/i);
        return { notes: [F(low ? "BruisedFullLow" : "BruisedFull", { shock })] };
      }
      return { damageModifiers: [{ label: L("BruisedPulled"), value: shock }] };
    },
  });
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: FULL_POWER,
    label: L("BruisedFullPower"),
    attack: "melee",
    available: (context) => harsh() && !context.item,
    apply: () => null,
  });
  // Striking at full power with a hurt part: its shock again (p. 124).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!harsh() || context?.rollType !== "attack" || !context.options?.[`${MODULE_ID}.${FULL_POWER}`]) return;
    const shock = bruisedKnuckles(Number(context.options?.[`${MODULE_ID}.${BRUISED}`]), traitNamed(context.actor, /^high pain threshold/i));
    if (!shock || !context.actor?.isOwner) return;
    void api.actors.applyCondition(context.actor, {
      module: MODULE_ID,
      key: "ma-bruised-shock",
      label: L("Bruised"),
      effects: { modifiers: [{ label: L("Shock"), value: shock, rolls: ["skill", "attribute", "attack"] }] },
      duration: { turns: 1 },
    });
  });
}
