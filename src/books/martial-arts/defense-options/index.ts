/**
 * Active defense options at the table (GURPS Martial Arts pp. 121-125).
 *
 * Defense options on the card: Cross Parry, Supported Parry, the retreat
 * options, Riposte, the leg parry, and a long two-handed weapon's parry
 * against both halves of a Dual-Weapon Attack. The defense hooks refine
 * fencing parries and long two-handed weapons' multiple parries; weapons a
 * Cross or Supported Parry used are out of the running for the rest of the
 * turn; a Riposte's penalty waits for the fighter's next attack. A second
 * switch limits dodges, allows more than one block at a price, and asks for
 * evasive movement to dodge firearms.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  RETREAT_OPTIONS,
  crossParryBreakage,
  crossParryScore,
  dodgeLimitPenalty,
  legParryDefends,
  longTwoHandedParry,
  multipleBlockPenalty,
  retreatOptionBonus,
  riposteAgainst,
  riposteAllowed,
  ripostePenalties,
  unarmedParry,
  type RetreatOption,
  type RiposteAgainst,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Defenses.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Defenses.${key}`, data);

const CROSS = "ma-cross-parry";
const SUPPORTED = "ma-supported-parry";
const RETREAT = "ma-retreat-option";
const RIPOSTE = "ma-riposte";
const LEG = "ma-leg-parry";
const DUAL = "ma-dual-weapon-parry";
const EVASIVE = "ma-evasive-movement";
/** Weapons a Cross or Supported Parry used, out of the running this turn. */
const LOCKED = "ma-parry-locked";
const LEG_USED = "ma-leg-parry-used";
const RIPOSTE_STATE = "ma-riposte-pending";
const EVASIVE_STATE = "ma-evasive-against";
const WAIT_PARRIED = "ma-wait-parried";

const BASIC_MANEUVERS = ["doNothing", "move", "changePosture", "ready", "aim", "evaluate", "attack", "feint", "allOutAttack", "moveAndAttack", "allOutDefense", "concentrate", "wait"];
const QUALITY_RANK: Record<string, number> = { cheap: 0, good: 1, fine: 2, veryFine: 3 };

interface RipostePending { foe: string; penalty: number; weaponId: string; against: RiposteAgainst }

const traitNamed = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((item: any) => item.type === "trait" && pattern.test(String(item.name ?? "")));
const master = (actor: any) => traitNamed(actor, /^(trained by a master|weapon master)\b/i);
const weaponMaster = (actor: any) => traitNamed(actor, /^weapon master\b/i);
const firearm = (skill: unknown) => ["guns", "beam weapons", "gunner"].includes(String(skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase());
const reachYards = (reach: unknown) => Math.max(0, ...String(reach ?? "").split(/[,-]/).map((r) => Number(r.trim().replace("*", ""))).filter(Number.isFinite));

/** The defender's ready melee weapons that can parry, one row each (the best), and not locked this turn. */
function parryingWeapons(api: GWorldApi, defender: any): Array<{ itemId: string; parry: number; weight: number; quality: string; twoHanded: boolean }> {
  const locked = (api.combat.getCombatState(defender, MODULE_ID, LOCKED) as string[] | undefined) ?? [];
  const best = new Map<string, any>();
  for (const row of (defender?.system?.derived?.melee ?? []) as any[]) {
    if (!row.itemId || typeof row.parry !== "number" || row.unready || row.usable === false || locked.includes(row.itemId)) continue;
    if (!best.has(row.itemId) || row.parry > best.get(row.itemId).parry) best.set(row.itemId, row);
  }
  return [...best.values()].map((row) => ({ itemId: row.itemId, parry: row.parry, weight: Number(row.weight) || 0, quality: String(row.quality ?? "good"), twoHanded: Boolean(row.twoHanded) }));
}

const currentParry = (defender: any) => Number(defender?.system?.derived?.defenses?.parry?.total);

/**
 * The Parry of the weapon the card's parry is made with, before the defense's
 * own modifiers (a shield's DB, a retreat): what a different way of parrying is
 * measured against, since the card rolls the whole defense.
 */
export function weaponParry(defender: any, parryWeapon: { itemId?: string; natural?: boolean } | null | undefined): number | null {
  const rows = ((defender?.system?.derived?.melee ?? []) as any[]).filter((row) => typeof row.parry === "number" && (parryWeapon?.natural || !parryWeapon?.itemId ? !row.itemId : row.itemId === parryWeapon.itemId));
  return rows.length > 0 ? Math.max(...rows.map((row) => row.parry)) : null;
}

/** A Cross Parry chosen for a defense being rolled, for the heavy-parry check that follows on this client. */
const crossParrying = new Map<string, Array<{ itemId: string; weight: number; quality: string }>>();

/** Registers the options and hooks. */
export function readyDefenseOptions(api: GWorldApi, on: () => boolean, limits: () => boolean): void {
  const lock = (defender: any, ids: string[]) => {
    const locked = (api.combat.getCombatState(defender, MODULE_ID, LOCKED) as string[] | undefined) ?? [];
    return api.combat.setCombatState(defender, MODULE_ID, LOCKED, [...new Set([...locked, ...ids])], "turn");
  };

  // Cross Parry (p. 121): both ready weapons at the better Parry +2.
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: CROSS,
    label: L("Cross"),
    defenses: ["parry"],
    available: (context) => on() && parryingWeapons(api, context.defender).length >= 2,
    apply: (context) => {
      const weapons = parryingWeapons(api, context.defender).sort((a, b) => b.parry - a.parry).slice(0, 2);
      const current = weaponParry(context.defender, context.parryWeapon) ?? Math.max(...weapons.map((w) => w.parry));
      if (weapons.length < 2) return null;
      crossParrying.set(String(context.defender?.uuid ?? ""), weapons);
      return { modifiers: [{ label: L("Cross"), value: crossParryScore(weapons.map((w) => w.parry)) - current }] };
    },
    after: async (context) => {
      const weapons = crossParrying.get(String(context.defender?.uuid ?? "")) ?? [];
      crossParrying.delete(String(context.defender?.uuid ?? ""));
      await lock(context.defender, weapons.map((w) => w.itemId));
    },
  });

  // Weapons a Cross or Supported Parry used can't parry again this turn (p. 121).
  Hooks.on(api.combat.hooks.parryWeapons, (context: any) => {
    if (!on() || !context?.actor) return;
    const locked = (api.combat.getCombatState(context.actor, MODULE_ID, LOCKED) as string[] | undefined) ?? [];
    for (const candidate of context.candidates ?? []) {
      if (locked.includes(candidate.itemId)) Object.assign(candidate, { excluded: true, reason: L("Locked") });
    }
  });

  // A heavy weapon parried by a Cross Parry meets both weapons as one (p. 121).
  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    const weapons = crossParrying.get(String(context?.defender?.uuid ?? ""));
    if (!on() || !weapons || weapons.length < 2) return;
    const combined = crossParryBreakage(weapons, (q) => QUALITY_RANK[q] ?? 1);
    context.weight = combined.weight;
    context.breakage = api.rules.breakageModifier(combined.quality as any);
    context.item = context.defender?.items?.get?.(combined.breaks.itemId) ?? context.item;
  });

  // Supported Parry (p. 121): a hand on the weapon, +1, and no more parries with it this turn.
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: SUPPORTED,
    label: L("Supported"),
    defenses: ["parry"],
    available: (context) => on() && Boolean(context.parryWeapon && !context.parryWeapon.natural),
    apply: () => ({ modifiers: [{ label: L("Supported"), value: 1 }] }),
    after: async (context) => {
      if (context.parryWeapon?.itemId) await lock(context.defender, [context.parryWeapon.itemId]);
    },
  });

  // Dive, Sideslip and Slip (pp. 123-124), in place of an ordinary retreat.
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: RETREAT,
    label: L("RetreatOption"),
    input: { type: "select", choices: RETREAT_OPTIONS.map((value) => ({ value, label: L(`Retreats.${value}`) })) },
    available: (context) => on() && context.delivery !== "ranged" && !api.combat.getCombatState(context.defender, MODULE_ID, LEG_USED),
    refuse: (context) => (context.retreating ? L("RetreatAlready") : null),
    apply: (context, value) => {
      if (!RETREAT_OPTIONS.includes(value as RetreatOption)) return null;
      const fencing = context.defense === "parry" && context.parryWeapon?.isFencing === true;
      const retreat = api.rules.retreatBonus({ defense: context.defense, skill: String(context.parryWeapon?.skill ?? ""), isFencing: fencing });
      return { modifiers: [{ label: L(`Retreats.${value}`), value: retreatOptionBonus(value as RetreatOption, retreat, fencing) }] };
    },
    after: async (context, _outcome, value) => {
      if (value === "dive") await api.actors.setPosture(context.defender, "lying");
    },
  });

  // Riposte (pp. 124-125): a penalty on the parry now for one on the foe's defense later.
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: RIPOSTE,
    label: L("Riposte"),
    defenses: ["parry"],
    input: { type: "number", min: 0, max: 10 },
    available: () => on(),
    refuse: (context) => {
      const penalty = Number(context.chosen?.[`${MODULE_ID}.${RIPOSTE}`]) || 0;
      const parry = weaponParry(context.defender, context.parryWeapon) ?? currentParry(context.defender);
      return penalty > 0 && !riposteAllowed(parry, penalty) ? L("RiposteFloor") : null;
    },
    apply: (_context, value) => {
      const penalty = Math.floor(Number(value) || 0);
      return penalty > 0 ? { modifiers: [{ label: L("Riposte"), value: -penalty }] } : null;
    },
    after: async (context, outcome, value) => {
      const penalty = Math.floor(Number(value) || 0);
      if (!outcome?.success || penalty <= 0 || !context.attacker || !context.parryWeapon) return;
      const weapon = context.attackWeapon ?? {};
      const skill = String(weapon.skill ?? "");
      const against = riposteAgainst({
        shield: /^shield/i.test(skill),
        unarmed: context.delivery === "unarmed",
        hand: !/kick|bite|butt|knee/i.test(String(context.attack ?? "")),
      });
      const pending: RipostePending = { foe: String(context.attacker.uuid ?? ""), penalty, weaponId: String(context.parryWeapon.itemId || "bare"), against };
      await api.combat.setCombatState(context.defender, MODULE_ID, RIPOSTE_STATE, pending, "combat");
      ui.notifications?.info(F("RipostePending", { penalty, foe: String(context.attacker.name ?? "") }));
    },
  });

  // The ripostor's next attack with that weapon at that foe (p. 124).
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor) return;
    const actor = context.actor;
    const pending = api.combat.getCombatState(actor, MODULE_ID, RIPOSTE_STATE) as RipostePending | undefined;
    if (pending && (context.targets ?? []).some((t: any) => String(t?.uuid ?? "") === pending.foe) && String(context.item?.id ?? "bare") === pending.weaponId) {
      const penalties = ripostePenalties(pending.penalty, pending.against);
      for (const defense of ["parry", "block", "dodge"] as const) {
        if (penalties[defense]) context.defenseModifiers.push({ label: L("Riposte"), value: penalties[defense], defenses: [defense] });
      }
      void api.combat.clearCombatState(actor, MODULE_ID, RIPOSTE_STATE);
    }
    // An unbalanced weapon that parried during a Wait can't then attack in it (p. 125).
    const parried = (api.combat.getCombatState(actor, MODULE_ID, WAIT_PARRIED) as string[] | undefined) ?? [];
    if (actor.system?.maneuver === "wait" && context.item && parried.includes(String(context.item.id))) context.refusal = L("WaitParried");
  });

  // A Riposte unused by the end of the fighter's next turn is gone.
  Hooks.on(api.combat.hooks.turnEnd, (_combat: any, combatant: any) => {
    if (!game.user?.isGM || !combatant?.actor) return;
    const pending = api.combat.getCombatState(combatant.actor, MODULE_ID, RIPOSTE_STATE) as (RipostePending & { armed?: boolean }) | undefined;
    if (!pending) return;
    if (pending.armed) void api.combat.clearCombatState(combatant.actor, MODULE_ID, RIPOSTE_STATE);
    else void api.combat.setCombatState(combatant.actor, MODULE_ID, RIPOSTE_STATE, { ...pending, armed: true }, "combat");
  });

  // A leg parry (p. 123): Brawling or Karate against attacks to the feet, legs or groin.
  const legSkill = (defender: any) => Math.max(-99, ...["Brawling", "Karate"].map((name) => api.actors.skillLevel(defender, name) ?? -99));
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: LEG,
    label: L("Leg"),
    defenses: ["parry"],
    available: (context) => on() && legSkill(context.defender) > -99,
    refuse: (context) => {
      if (!legParryDefends(context.calledShot?.hitLocation)) return L("LegOnly");
      return api.combat.getCombatState(context.defender, MODULE_ID, LEG_USED) ? L("LegUsed") : null;
    },
    apply: (context) => {
      const current = weaponParry(context.defender, context.parryWeapon);
      return current !== null ? { modifiers: [{ label: L("Leg"), value: unarmedParry(legSkill(context.defender)) - current }] } : null;
    },
    after: async (context, outcome) => {
      await api.combat.setCombatState(context.defender, MODULE_ID, LEG_USED, true, "turn");
      if (outcome && !outcome.success && context.delivery !== "unarmed") ui.notifications?.info(L("LegHit"));
    },
  });

  // A long two-handed weapon parries both halves of a Dual-Weapon Attack (p. 123).
  const longWeapon = (context: any) => {
    const item = context.parryWeapon?.itemId ? context.defender?.items?.get?.(context.parryWeapon.itemId) : null;
    const modes: any[] = item?.system?.meleeModes ?? [];
    return modes.some((mode) => longTwoHandedParry(String(mode?.skill ?? ""), reachYards(mode?.reach), Boolean(mode?.twoHanded)));
  };
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: DUAL,
    label: L("Dual"),
    defenses: ["parry"],
    available: (context) => on() && longWeapon(context),
    apply: () => ({ modifiers: [{ label: L("Dual"), value: -1 }] }),
    after: (_context, outcome) => {
      if (outcome && !outcome.success) ui.notifications?.info(L("DualFailed"));
    },
  });

  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    const defender = context?.defender;
    if (!defender) return;
    const counts = context.defenseCounts ?? { parries: 0, blocks: 0, dodges: 0 };
    if (on() && context.defense === "parry") {
      const line = (context.modifiers ?? []).find((m: any) => m?.label === game.i18n.localize("GWORLD.Defense.MultipleParries"));
      if (line) {
        // Half the multiple-parry penalty for a long two-handed weapon (p. 123),
        // and a fencing weapon's halving only against attacks from the front (p. 122).
        if (longWeapon(context)) line.value = Math.trunc(line.value / 2);
        else if (context.parryWeapon?.isFencing && (context.arc === "side" || context.arc === "back")) line.value *= 2;
      }
    }
    if (limits() && context.defense === "dodge" && !master(defender)) {
      const value = dodgeLimitPenalty(counts.dodges);
      if (value) context.modifiers.push({ label: L("DodgeLimit"), value });
    }
    if (limits() && context.defense === "block") {
      const value = multipleBlockPenalty(counts.blocks, weaponMaster(defender));
      if (value) context.modifiers.push({ label: L("MultipleBlocks"), value });
    }
  });

  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    const defender = context?.defender;
    if (!defender) return;
    // A fencing weapon that also works with a non-fencing skill can parry flails (p. 221).
    if (on() && context.parryWeapon?.isFencing) {
      const item = defender.items?.get?.(context.parryWeapon.itemId);
      const fencing = ["rapier", "saber", "smallsword", "main-gauche"];
      if ((item?.system?.meleeModes ?? []).some((mode: any) => mode?.skill && !fencing.includes(String(mode.skill).replace(/\s*\(.*$/, "").trim().toLowerCase()))) context.parryWeapon.parriesFlail = true;
    }
    // No retreat in a turn a leg parried (p. 123).
    if (on() && api.combat.getCombatState(defender, MODULE_ID, LEG_USED)) Object.assign(context.retreat, { available: false, refusal: L("LegNoRetreat") });
    if (!limits()) return;
    // More than one block, at a price (p. 123).
    context.blockAgain = true;
    // Dodging a firearm takes evasive movement against that shooter (p. 122).
    if (firearm(context.attackWeapon?.skill) && !master(defender)) {
      const against = api.combat.getCombatState(defender, MODULE_ID, EVASIVE_STATE);
      const attackerUuid = String((context.attacker ?? null)?.uuid ?? "");
      const dodge = (context.choices ?? []).find((c: any) => c.key === "dodge");
      if (dodge && (!against || (attackerUuid && against !== attackerUuid))) Object.assign(dodge, { available: false, refusal: L("NoEvasive") });
    }
  });

  // Evasive movement, declared on the fighter's own turn against the shooter they target (p. 122).
  for (const maneuver of BASIC_MANEUVERS) {
    api.combat.registerManeuverOption({
      module: MODULE_ID,
      key: `${EVASIVE}-${maneuver}`,
      maneuver,
      label: L("Evasive"),
      input: { type: "checkbox" },
      available: () => limits(),
    });
  }
  Hooks.on(api.combat.hooks.turnEnd, (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!limits() || !actor?.isOwner) return;
    // The client of a player who owns the fighter, or the GM's for one nobody plays.
    const players = (game as any).users?.filter?.((u: any) => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")) ?? [];
    if (game.user?.isGM ? players.length > 0 : false) return;
    const maneuver = String(actor.system?.maneuver ?? "");
    const chosen = actor.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[`${EVASIVE}-${maneuver}`];
    const targets = [...((game as any).user?.targets ?? [])];
    if (chosen && targets.length === 1 && targets[0]?.actor) void api.combat.setCombatState(actor, MODULE_ID, EVASIVE_STATE, String(targets[0].actor.uuid), "combat");
    else void api.combat.clearCombatState(actor, MODULE_ID, EVASIVE_STATE);
  });

  // Note an unbalanced weapon parrying during a Wait (p. 125).
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    if (!on() || !actor?.isOwner || actor.system?.maneuver !== "wait" || !(context.tags ?? []).includes("parry")) return;
    const weapon = actor.system?.derived?.defenses?.parry?.weapon;
    const rows = ((actor.system?.derived?.melee ?? []) as any[]).filter((row) => row.itemId === weapon?.itemId);
    if (!weapon?.itemId || !rows.some((row) => row.unbalanced)) return;
    const parried = (api.combat.getCombatState(actor, MODULE_ID, WAIT_PARRIED) as string[] | undefined) ?? [];
    void api.combat.setCombatState(actor, MODULE_ID, WAIT_PARRIED, [...new Set([...parried, String(weapon.itemId)])], "turn");
  });
}
