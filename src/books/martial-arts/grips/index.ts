/**
 * Melee attack options at the table (GURPS Martial Arts pp. 109-113).
 *
 * A weapon's grip is this module's weapon state, set by a Ready from the
 * Readying section or a weapon row's grip button. The grip changes the
 * weapon's rows on the Combat tab (damage, reach, Parry, hands), its attack
 * rolls and parries through the attack and defense hooks, and its odds of
 * breaking. A Defensive Grip's -2 to hit goes on the roll rather than the row,
 * since the row's skill is what the character's Parry is worked out from.
 * Pummeling, Tip Slash and a Reversed Grip's butt strike are attack modes
 * worked out from the weapon's own rows; Telegraphic Attack is an attack option.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { gripOf } from "../readying/index.js";
import { GRIPS, type Grip } from "../readying/rules.js";
import { weaponParry } from "../defense-options/index.js";
import {
  DEFENSIVE_GRIP_BREAKAGE,
  TELEGRAPHIC_DEFENSE,
  TELEGRAPHIC_HIT,
  buttStrikeModifier,
  canPummel,
  canReverse,
  defensiveGripParry,
  forearmParry,
  gripRowChange,
  isDefensive,
  isSwordSkill,
  longestReachText,
  pummelSkill,
  swingDamagePenalty,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Grips.${key}`);
const G = (grip: Grip) => game.i18n.localize(`GCC.MA.Readying.Grips.${grip}`);

export const TELEGRAPHIC = "ma-telegraphic-attack";
const TIP_SLASH = "ma-tip-slash";
const PUMMEL = "ma-pummel";
const BUTT_STRIKE = "ma-butt-strike";
const FOREARM = "ma-forearm-parry";

const meleeModes = (item: any): any[] => (Array.isArray(item?.system?.meleeModes) ? item.system.meleeModes : []);
const thrusts = (item: any) => meleeModes(item).some((mode) => mode?.damageBase === "thr");
const reachOf = (item: any) => meleeModes(item).map((mode) => String(mode?.reach ?? "")).join(", ");

/** Which grips a weapon can take: a Reversed Grip needs a thrusting weapon of reach C to 2, and half-swording a sword. */
export function gripsFor(item: any): Grip[] {
  if (item?.type !== "equipment" || meleeModes(item).length === 0) return [];
  return GRIPS.filter((grip) => {
    if (grip === "reversed") return canReverse(reachOf(item), thrusts(item));
    if (grip === "halfSword") return meleeModes(item).some((mode) => isSwordSkill(String(mode?.skill ?? "")));
    return true;
  });
}

/** The grip that counts for a weapon: one it can't take is held as usual. */
function effectiveGrip(api: GWorldApi, item: any): Grip {
  const grip = gripOf(api, item);
  return gripsFor(item).includes(grip) ? grip : "regular";
}

function adjust(api: GWorldApi, formula: string, by: number): string {
  if (!by) return formula;
  const parsed = api.rules.parseDiceAdds(String(formula ?? ""));
  return parsed ? api.rules.formatDiceAdds(api.rules.addModifier(parsed, by)) : formula;
}

const diceOf = (api: GWorldApi, formula: unknown) => api.rules.parseDiceAdds(String(formula ?? ""))?.dice ?? 0;

async function chooseGrip(api: GWorldApi, item: any): Promise<void> {
  const grips = gripsFor(item);
  const current = effectiveGrip(api, item);
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: String(item?.name ?? "") },
    content: `<div class="gworld"><label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${escape(game.i18n.localize("GCC.MA.Readying.Grip"))}</span>
      <select name="grip">${grips.map((grip) => `<option value="${grip}" ${grip === current ? "selected" : ""}>${escape(G(grip))}</option>`).join("")}</select>
    </label><p class="ihint">${escape(game.i18n.localize("GCC.MA.Readying.ReadyHint"))}</p></div>`,
    ok: {
      label: game.i18n.localize("GCC.MA.Readying.Ready"),
      callback: (_event: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="grip"]')?.value ?? null,
    },
  });
  if (typeof answer !== "string" || !grips.includes(answer as Grip)) return;
  await api.combat.setWeaponState(item, MODULE_ID, { grip: answer });
}

/** Registers the grips' effects, the attack modes, Telegraphic Attack and the forearm parry. */
export function readyMeleeOptions(api: GWorldApi, on: () => boolean): void {
  // Taking up or letting go of a grip is a Ready (pp. 110-111).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-grip",
    itemTypes: ["equipment"],
    label: game.i18n.localize("GCC.MA.Readying.Grip"),
    icon: "fa-solid fa-hand-fist",
    visible: (item) => on() && gripsFor(item).length > 1,
    run: (item) => chooseGrip(api, item),
  });

  // What a grip does to the weapon's rows (pp. 109-112).
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on() || !context?.item) return;
    const grip = effectiveGrip(api, context.item);
    if (grip === "regular") return;
    for (const entry of context.rows ?? []) {
      if (entry?.kind !== "melee") continue;
      const mode = entry.mode ?? {};
      const change = gripRowChange(grip, {
        twoHanded: Boolean(mode.twoHanded),
        swung: mode.damageBase === "sw",
        reach: String(entry.row.reach ?? ""),
        dice: diceOf(api, entry.row.damage),
        sword: isSwordSkill(String(mode.skill ?? "")),
      });
      const row = entry.row;
      if (change.damage) row.damage = context.addToDamage(String(row.damage ?? ""), change.damage);
      if (change.reach !== null) row.reach = change.reach;
      if (change.parry && typeof row.parry === "number") row.parry += change.parry;
      if (change.twoHanded !== null) row.twoHanded = change.twoHanded;
      const label = grip === "reversed" ? "Reversed" : grip === "halfSword" && isSwordSkill(String(mode.skill ?? "")) ? "HalfSword" : "Defensive";
      row.notes.push({ label: change.refused ? L("NoSwing") : L(label), hint: L(`${label}Hint`) });
    }
  });

  // No swings when half-swording, and Tip Slash counts as one (pp. 111, 113);
  // 2 less off the chinks-in-armor penalty; and what a Telegraphic Attack can't
  // be combined with (p. 113).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || context?.ranged) return;
    const item = context.item;
    const grip = item ? effectiveGrip(api, item) : "regular";
    // A one-handed weapon in a Defensive Grip attacks at -2 (p. 110).
    if (isDefensive(grip) && context.mode?.index >= 0) {
      const mode = meleeModes(item)[context.mode.index];
      const change = gripRowChange(grip, { twoHanded: Boolean(mode?.twoHanded), swung: mode?.damageBase === "sw", reach: String(mode?.reach ?? ""), dice: 0, sword: isSwordSkill(String(mode?.skill ?? "")) });
      if (change.skill) context.modifiers.push({ label: L("DefensiveParry"), value: change.skill });
    }
    if (item && grip === "halfSword") {
      const mode = context.mode?.index >= 0 ? meleeModes(item)[context.mode.index] : null;
      const swing = context.mode?.derived === `${MODULE_ID}.${TIP_SLASH}` || mode?.damageBase === "sw";
      if (swing && meleeModes(item).some((m) => isSwordSkill(String(m?.skill ?? "")))) {
        context.refusal = L("NoSwing");
        return;
      }
      if (context.calledShot?.chink) context.modifiers.push({ label: L("Chinks"), value: 2 });
    }
    if (context.options?.[`${MODULE_ID}.${TELEGRAPHIC}`]) {
      if (Number(context.deceptive) < 0) {
        context.refusal = L("TelegraphicDeceptive");
        return;
      }
      if (Number(context.feint) < 0) context.defensePenalty = Number(context.defensePenalty) - Number(context.feint);
      if (Number(context.evaluate) > 0) context.modifiers.push({ label: L("TelegraphicEvaluate"), value: -Number(context.evaluate) });
    }
  });

  // A Defensive Grip parries at +1 from the front and -1 more from the side
  // (p. 110); a feint or Deceptive Attack from a Reversed Grip to the front or
  // sides is -1 more to defend (p. 112).
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!on()) return;
    if (context?.defense === "parry" && context.parryWeapon?.itemId) {
      const weapon = context.defender?.items?.get?.(context.parryWeapon.itemId);
      // A forearm parry isn't made with the gripped weapon.
      const forearmParried = (context.modifiers ?? []).some((line: any) => line?.label === L("Forearm"));
      if (weapon && !forearmParried && isDefensive(effectiveGrip(api, weapon))) {
        const value = defensiveGripParry(context.arc ?? null);
        if (value) context.modifiers.push({ label: L("DefensiveParry"), value });
      }
    }
    const attackUuid = context?.attackWeapon?.itemUuid;
    if (attackUuid && Number(context.deception) < 0 && context.arc !== "back") {
      const weapon = (globalThis as any).fromUuidSync?.(attackUuid);
      if (weapon && effectiveGrip(api, weapon) === "reversed") context.modifiers.push({ label: L("ReversedDeception"), value: -1 });
    }
  });

  // A fencing weapon in a Defensive Grip can parry a flail (p. 110).
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on() || !context?.parryWeapon?.isFencing) return;
    const weapon = context.defender?.items?.get?.(context.parryWeapon.itemId);
    if (weapon && isDefensive(effectiveGrip(api, weapon))) context.parryWeapon.parriesFlail = true;
  });

  // A two-handed weapon in a Defensive Grip is -1 to the odds of breakage (p. 110).
  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    if (!on() || !context?.item || !isDefensive(effectiveGrip(api, context.item))) return;
    if (!meleeModes(context.item).some((mode) => mode?.twoHanded)) return;
    const grade = typeof context.breakage === "number" ? context.breakage : api.rules.breakageModifier(context.quality);
    context.breakage = grade + DEFENSIVE_GRIP_BREAKAGE;
  });

  // Tip Slash (p. 113): a weapon that thrusts to impale slashes with the tip,
  // for its impaling damage at -2 as cutting, at its longest current reach.
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: TIP_SLASH,
    label: L("TipSlash"),
    kind: "melee",
    applies: (item) => on() && meleeModes(item).some((mode) => mode?.damageBase === "thr" && mode?.damageType === "imp"),
    mode: (item, _actor, helpers) => {
      const rows = (helpers.rows?.(item).melee ?? []) as any[];
      const thrust = rows.find((row) => row.damageBase === "thr" && row.damageType === "imp");
      if (!thrust) return null;
      const grip = effectiveGrip(api, item);
      const dice = diceOf(api, thrust.damage);
      // It counts as a swing: a Reversed Grip's thrust bonus becomes its swing
      // penalty, and a two-handed Defensive Grip's swing penalty applies.
      const original = meleeModes(item)[Number(thrust.modeIndex) || 0];
      let by = -2;
      if (grip === "reversed") by += -1 + swingDamagePenalty(dice);
      else if (isDefensive(grip) && original?.twoHanded) by += swingDamagePenalty(dice);
      return {
        ...thrust,
        mode: L("TipSlash"),
        damage: adjust(api, String(thrust.damage), by),
        damageType: "cut",
        damageModifier: (Number(thrust.damageModifier) || 0) + by,
        reach: longestReachText(rows.map((row) => row.reach).join(", ")),
        parry: null,
        swung: true,
        notes: [],
        followUp: null,
      };
    },
  });

  // Pummeling (p. 111): a pommel, hilt or butt at reach C, for thrust crushing
  // plus the skill's bonus, +1 with two hands.
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: PUMMEL,
    label: L("Pummel"),
    kind: "melee",
    applies: (item) => on() && item?.type === "equipment" && canPummel(reachOf(item)),
    mode: (item, actor, helpers) => {
      const rows = (helpers.rows?.(item).melee ?? []) as any[];
      if (rows.length === 0 || !helpers.damage) return null;
      const dx = api.actors.attribute(actor, "DX") ?? 10;
      const level = (name: string) => helpers.skillLevel(name);
      const full = rows.some((row) => /tonfa/i.test(String(row.skillName ?? ""))) || /knuckle/i.test(String(item?.name ?? ""))
        ? Math.max(...rows.map((row) => Number(row.skillLevel) || 0))
        : null;
      const best = pummelSkill({ dx, brawling: level("Brawling"), karate: level("Karate"), hammerFist: level("Hammer Fist"), twoHandedPunch: level("Two-Handed Punch"), fullSkill: full });
      const base = helpers.damage("thr", 0);
      const dice = diceOf(api, base);
      const skillBonus = best.skill === "Brawling" || best.skill === "Karate" ? api.rules.unarmedDamageBonusPerDie(best.skill, level(best.skill) ?? dx, dx) * dice : 0;
      const twoHanded = rows.some((row) => row.twoHanded);
      const bonus = skillBonus + (twoHanded ? 1 : 0);
      return {
        skillName: best.skill || String(rows[0].skillName ?? ""),
        skillLevel: best.level,
        damage: adjust(api, base, bonus),
        damageType: "cr",
        damageBase: "thr",
        damageModifier: bonus,
        stBased: true,
        reach: "C",
        parry: null,
        twoHanded,
        swung: false,
        damageRollable: true,
        usable: true,
        weight: rows[0].weight,
        material: rows[0].material,
        quality: rows[0].quality,
      };
    },
  });

  // A Reversed Grip's butt strike at reach 1 (p. 112): thrust damage for a
  // crushing weapon, thrust-1 crushing for any other.
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: BUTT_STRIKE,
    label: L("ButtStrike"),
    kind: "melee",
    applies: (item) => on() && effectiveGrip(api, item) === "reversed" && meleeModes(item).some((mode) => String(mode?.reach ?? "").split(",").some((r) => r.trim().replace("*", "") === "1")),
    mode: (item, _actor, helpers) => {
      const rows = (helpers.rows?.(item).melee ?? []) as any[];
      if (rows.length === 0 || !helpers.damage) return null;
      const crushing = meleeModes(item).some((mode) => mode?.damageType === "cr");
      const by = buttStrikeModifier(crushing);
      const best = rows.reduce((a, b) => ((Number(b.skillLevel) || 0) > (Number(a.skillLevel) || 0) ? b : a));
      return {
        skillName: best.skillName,
        skillLevel: best.skillLevel,
        damage: helpers.damage("thr", by),
        damageType: "cr",
        damageBase: "thr",
        damageModifier: by,
        stBased: true,
        reach: "1",
        parry: null,
        swung: false,
        damageRollable: true,
        usable: true,
        twoHanded: best.twoHanded,
        weight: best.weight,
        material: best.material,
        quality: best.quality,
      };
    },
  });

  // Telegraphic Attack (p. 113): +4 to hit, +2 to every defense, and criticals
  // judged on the skill before the +4.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: TELEGRAPHIC,
    label: L("Telegraphic"),
    attack: "melee",
    available: () => on(),
    apply: (context) => ({
      modifiers: [{ label: L("Telegraphic"), value: TELEGRAPHIC_HIT }],
      defenseModifiers: [{ label: L("Telegraphic"), value: TELEGRAPHIC_DEFENSE }],
      criticalSkill: context.effectiveSkill,
    }),
  });

  // A Reversed Grip's forearm parry (p. 112): Brawling or Karate at -1, or no
  // penalty with a tonfa, with a reach C or 1 weapon.
  const forearm = (defender: any): number | null => {
    const weapons = [...(defender?.items ?? [])].filter((item: any) => effectiveGrip(api, item) === "reversed" && canPummel(reachOf(item)));
    if (weapons.length === 0) return null;
    const tonfa = weapons.some((item: any) => meleeModes(item).some((mode) => /tonfa/i.test(String(mode?.skill ?? ""))));
    const levels = ["Brawling", "Karate"].map((name) => api.actors.skillLevel(defender, name)).filter((l): l is number => typeof l === "number");
    return levels.length > 0 ? forearmParry(Math.max(...levels), tonfa) : null;
  };
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: FOREARM,
    label: L("Forearm"),
    defenses: ["parry"],
    available: (context) => on() && forearm(context.defender) !== null,
    refuse: (context) => (forearm(context.defender) === null ? L("ForearmNone") : null),
    apply: (context) => {
      const score = forearm(context.defender);
      const current = weaponParry(context.defender, context.parryWeapon);
      if (score === null || current === null || score === current) return null;
      return { modifiers: [{ label: L("Forearm"), value: score - current }] };
    },
    after: async (context, outcome) => {
      if (!outcome || outcome.success) return;
      await (ChatMessage as any).implementation.create({
        speaker: (ChatMessage as any).implementation.getSpeaker({ actor: context.defender }),
        content: `<p>${foundry.utils.escapeHTML(L("ForearmFailed"))}</p>`,
      });
    },
  });
}
