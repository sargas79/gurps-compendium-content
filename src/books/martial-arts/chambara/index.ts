/**
 * Chambara fighting at the table (GURPS Martial Arts pp. 128-130).
 *
 * Everything here is for masters only: fighters with Trained by a Master or
 * Weapon Master. A section on the Combat tab shows their jumps, trades attacks
 * for steps, and rolls Flying Leap, Light Walk and Lizard Climb. Their retreats
 * are worth +3 and may be taken again, their acrobatics reach every defense,
 * and with Combat Reflexes an attack from behind counts as from the side.
 * Acrobatic stunts at half penalty and the cinematic Rapid Strike are the
 * acrobatics and multiple-attacks modules', asked through `chambaraFighter`.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { baseAttacks } from "../multiple-attacks/rules.js";
import {
  CHAMBARA_TECHNIQUES,
  LIGHT_WALK_SURFACES,
  STOOD_ON_PENALTY,
  acrobaticDefensePenalty,
  balanceModifier,
  chambaraTechniqueLines,
  flyingLeapBonus,
  flyingLeapFatigue,
  isMaster,
  leapsFully,
  lizardHandsPenalty,
  lizardRetreat,
  onMoveAndAttack,
  retreatFits,
  retreatLines,
  stepsThisTurn,
  tradeableAttacks,
  type ChambaraTechnique,
  type LightWalkSurface,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Chambara.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Chambara.${key}`, data);

const RETREATS = "ma-chambara-retreats";
const RETREAT_YARDS = "ma-chambara-retreat-yards";
const RETREAT_OPTION = "ma-chambara-retreat";
const ACROBATIC = "ma-chambara-acrobatic";
const TRADED = "ma-steps-traded";
const LIZARD = "ma-lizard-retreat";
const TECHNIQUE_OPTION = "ma-chambara-technique";
/** The acrobatics module's options, whose -1 a technique buys off. */
const STUNT_OPTIONS = { acrobatic: "ma-acrobatic-attack", flying: "ma-flying-attack" } as const;
const STOOD_ON = "ma-stood-on";

const traitNames = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
const optionValue = (actor: any, key: string) => actor?.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[key];

/** Whether a fighter fights chambara-style: the switch on, and a master (p. 128). */
export function chambaraFighter(on: () => boolean): (actor: any) => boolean {
  return (actor: any) => on() && isMaster(traitNames(actor));
}

/** Registers the section, the defense option and the hooks. */
export function readyChambara(api: GWorldApi, on: () => boolean): void {
  const master = chambaraFighter(on);
  const state = <T>(actor: any, key: string) => api.combat.getCombatState(actor, MODULE_ID, key) as T | undefined;
  const dx = (actor: any) => Number(api.actors.attribute(actor, "DX")) || 10;
  const level = (actor: any, skill: string) => api.actors.skillLevel(actor, skill);
  const moveOf = (actor: any) => Number(api.actors.derived(actor)?.move ?? api.actors.derived(actor)?.basicMove) || 5;
  const basicAttacks = (actor: any) => baseAttacks({
    attacks: true,
    extraAttacks: Math.max(0, (Number(actor?.system?.derived?.attacksPerTurn) || 1) - 1),
    allOutDouble: actor?.system?.maneuver === "allOutAttack" && actor?.system?.allOutAttackOption === "double",
  });
  const roll = (actor: any, skill: string, label: string, modifiers: Array<{ label: string; value: number }>, extra: Record<string, unknown> = {}) => {
    const base = level(actor, skill);
    if (base === null) {
      ui.notifications?.warn(F("NoSkill", { skill }));
      return Promise.resolve(null);
    }
    return api.roll.success({ actor, base, label, skill, modifiers: modifiers.filter((m) => m.value), ...extra } as any) as Promise<any>;
  };

  // ── the section: jumps, steps, and the feats (pp. 128-130) ──
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-chambara",
    sheet: "character",
    tab: "combat",
    template: `modules/${MODULE_ID}/templates/ma-chambara.hbs`,
    visible: (actor: any) => master(actor),
    context: (actor: any) => {
      const fully = leapsFully({ dx: dx(actor), acrobatics: level(actor, "Acrobatics"), jumping: level(actor, "Jumping") });
      const move = (api.rules as any).jumpingMove?.(Number(api.actors.derived(actor)?.basicMove) || 5, level(actor, "Jumping")) ?? 5;
      const rules = api.rules as any;
      const traded = Number(state<number>(actor, TRADED)) || 0;
      return {
        fully,
        jumps: fully ? F("Jumps", {
          high: rules.highJumpInches?.({ move }) ?? 0,
          broad: rules.broadJumpFeet?.({ move }) ?? 0,
          runningHigh: rules.highJumpInches?.({ move, runningStartYards: move }) ?? 0,
          runningBroad: rules.broadJumpFeet?.({ move, runningStartYards: move }) ?? 0,
        }) : L("NoFullLeap"),
        steps: F("Steps", { steps: stepsThisTurn({ maneuverSteps: 1, traded }) }),
        surfaces: Object.keys(LIGHT_WALK_SURFACES).map((key) => ({ key, label: L(`Surfaces.${key}`) })),
      };
    },
    listeners: (element: HTMLElement, actor: any) => {
      const value = (selector: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? "";
      const checked = (selector: string) => element.querySelector<HTMLInputElement>(selector)?.checked ?? false;
      element.querySelector("[data-ma-trade-step]")?.addEventListener("click", () => void tradeForStep(actor));
      element.querySelector("[data-ma-flying-leap-feat]")?.addEventListener("click", () => void leap(actor, checked("[data-ma-leap-double]"), checked("[data-ma-leap-floating]"), Number(value("[data-ma-leap-haste]")) || 0));
      element.querySelector("[data-ma-light-walk]")?.addEventListener("click", () => void lightWalk(actor, value("[data-ma-surface]"), Number(value("[data-ma-thickness]")) || 0));
      element.querySelector("[data-ma-weapon-leap]")?.addEventListener("click", () => void leapOntoWeapon(actor));
      element.querySelector("[data-ma-cling]")?.addEventListener("click", () => void cling(actor, Number(value("[data-ma-climb-modifier]")) || 0));
      element.querySelector("[data-ma-climb-retreat]")?.addEventListener("click", () => void climbRetreat(actor, Number(value("[data-ma-climb-hands]")) || 0, Number(value("[data-ma-climb-modifier]")) || 0));
    },
  });

  /** Trades one of the maneuver's basic attacks for a step (p. 128). */
  async function tradeForStep(actor: any): Promise<void> {
    const traded = Number(state<number>(actor, TRADED)) || 0;
    const sequence = api.combat.attackSequence(actor);
    if (!sequence.count || tradeableAttacks({ basicAttacks: basicAttacks(actor), traded }) <= 0 || sequence.made >= sequence.count) {
      return void ui.notifications?.warn(L("NoTrade"));
    }
    await api.combat.setCombatState(actor, MODULE_ID, TRADED, traded + 1, "turn");
    ui.notifications?.info(F("Traded", { name: String(actor.name ?? ""), steps: stepsThisTurn({ maneuverSteps: 1, traded: traded + 1 }) }));
  }

  // Each traded attack comes off the sequence.
  Hooks.on(api.combat.hooks.attackSequence, (context: any) => {
    if (!master(context?.actor) || !(Number(context.count) > 0)) return;
    const traded = Number(state<number>(context.actor, TRADED)) || 0;
    if (traded) context.count = Math.max(1, Number(context.count) - traded);
  });

  async function leap(actor: any, double: boolean, floating: boolean, haste: number): Promise<void> {
    const bonus = flyingLeapBonus({ double, floating, haste });
    const outcome = await roll(actor, "Flying Leap", L("FlyingLeap"), [
      { label: L("Haste"), value: haste },
      { label: L("EasierLeap"), value: bonus },
    ]);
    if (!outcome) return;
    const fp = flyingLeapFatigue({ easier: double || floating, success: outcome.success, margin: Number(outcome.margin) || 0 });
    if (fp) await api.actors.applyInjury(actor, { amount: fp, fatigue: true, label: L("FlyingLeap") });
    else ui.notifications?.info(L("NoFatigue"));
  }

  async function lightWalk(actor: any, surface: string, thickness: number): Promise<void> {
    const balance = surface === "balance";
    const modifier = balance ? balanceModifier(thickness) : LIGHT_WALK_SURFACES[surface as LightWalkSurface] ?? 0;
    await roll(actor, "Light Walk", balance ? L("Balance") : F("Across", { surface: L(`Surfaces.${surface}`) }), [{ label: balance ? L("Balance") : L(`Surfaces.${surface}`), value: modifier }]);
  }

  /** Leaps onto a foe's weapon, as an attack the foe defends against (p. 130). */
  async function leapOntoWeapon(actor: any): Promise<void> {
    const foes = [...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
    if (foes.length !== 1) return void ui.notifications?.warn(L("TargetFoe"));
    const foe = foes[0];
    const weapons = [...(foe.items ?? [])].filter((i: any) => i.type === "equipment" && i.system?.equipped && (i.system?.meleeModes ?? []).length);
    if (!weapons.length) return void ui.notifications?.warn(L("NoFoeWeapon"));
    const picked = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("WeaponLeap") },
      content: `<div class="gworld"><label>${L("Weapon")} <select name="weapon">${weapons.map((w: any) => `<option value="${w.id}">${foundry.utils.escapeHTML(String(w.name))}</option>`).join("")}</select></label></div>`,
      ok: { label: L("WeaponLeap"), callback: (_e: Event, button: any) => button.form?.elements?.weapon?.value ?? "" },
      rejectClose: false,
    }) as string | null;
    const weapon = picked ? foe.items.get(picked) : null;
    if (!weapon) return;
    const reach = (weapon.system?.meleeModes ?? []).map((m: any) => String(m?.reach ?? "")).join(",");
    const penalty = Number((api.rules as any).strikeAtWeaponPenalty?.({ reach })) || -4;
    const outcome = await roll(actor, "Light Walk", F("WeaponLeapLabel", { weapon: String(weapon.name ?? "") }), [{ label: L("WeaponSize"), value: penalty }], {
      kind: "attack",
      delivery: "unarmed",
      unarmed: true,
    });
    if (!outcome?.success) return;
    await api.chat.post(`${MODULE_ID}.${STOOD_ON}`, {
      text: F("StoodOnAsk", { foe: String(foe.name ?? ""), weapon: String(weapon.name ?? ""), name: String(actor.name ?? "") }),
      foeUuid: String(foe.uuid),
      itemId: String(weapon.id),
      weapon: String(weapon.name ?? ""),
    }, { actor: foe } as any);
  }

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: STOOD_ON,
    template: `modules/${MODULE_ID}/templates/ma-stood-on.hbs`,
    actions: {
      stand: {
        permission: "gm",
        run: async ({ data }: any) => {
          const foe = (globalThis as any).fromUuidSync?.(String(data.foeUuid ?? ""));
          if (!foe) return;
          await api.actors.applyCondition(foe, {
            module: MODULE_ID,
            key: `${STOOD_ON}-${data.itemId}`,
            label: F("StoodOn", { weapon: String(data.weapon ?? "") }),
            effects: { modifiers: [{ label: L("StoodOnLine"), value: STOOD_ON_PENALTY, rolls: ["attack"] }] },
          } as any);
        },
      },
    },
  } as any);

  // A weapon stood on can't attack or parry, and anything else is at -4 (p. 130).
  const stoodOn = (actor: any, itemId: string) => ((api.actors.conditions(actor) ?? []) as any[]).some((c) => c.id === `${MODULE_ID}.${STOOD_ON}-${itemId}`);
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on() || !context?.actor || !context.item) return;
    if (stoodOn(context.actor, context.item.id)) context.refusal = F("CantUse", { weapon: String(context.item.name ?? "") });
  });
  Hooks.on(api.combat.hooks.parryWeapons, (context: any) => {
    if (!on() || !context?.actor) return;
    for (const candidate of context.candidates ?? []) {
      if (stoodOn(context.actor, candidate.itemId)) Object.assign(candidate, { excluded: true, reason: F("CantUse", { weapon: String(candidate.name ?? "") }) });
    }
  });

  async function cling(actor: any, modifier: number): Promise<void> {
    const outcome = await roll(actor, "Lizard Climb", L("Cling"), [{ label: L("ClimbModifier"), value: modifier }]);
    if (outcome && !outcome.success) ui.notifications?.warn(L("Falls"));
  }

  /** A Lizard Climb upward, rolled before the defense it goes with (p. 130). */
  async function climbRetreat(actor: any, freeHands: number, modifier: number): Promise<void> {
    const outcome = await roll(actor, "Lizard Climb", L("ClimbRetreat"), [
      { label: L("FreeHands"), value: lizardHandsPenalty(freeHands) },
      { label: L("ClimbModifier"), value: modifier },
    ]);
    if (!outcome) return;
    const result = lizardRetreat(outcome);
    await api.combat.setCombatState(actor, MODULE_ID, LIZARD, result, "turn");
    ui.notifications?.info(L(`Lizard.${result}`));
  }

  // ── attacks (pp. 128-129) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: TECHNIQUE_OPTION,
    label: L("Technique"),
    // The dialog shows the first choice as chosen, so the first is none.
    input: { type: "select", choices: [{ value: "", label: "—" }, ...CHAMBARA_TECHNIQUES.map((value) => ({ value, label: L(`Techniques.${value}`) }))] },
    available: (context: any) => master(context.actor) && !context.ranged,
    refuse: (context: any) => {
      const actor = context.actor;
      const kind = context.chosen?.[`${MODULE_ID}.${TECHNIQUE_OPTION}`] as ChambaraTechnique | undefined;
      if (kind && onMoveAndAttack(kind) && context.maneuver !== "moveAndAttack") return L("NeedsMoveAndAttack");
      if (!leapsFully({ dx: dx(actor), acrobatics: level(actor, "Acrobatics"), jumping: level(actor, "Jumping") })) return L("NeedsAcrobaticsJumping");
      const offensive = [...(actor.items ?? [])].some((i: any) => i.type === "technique" && Number(i.system?.points) >= 1 && !["parry", "block", "dodge"].includes(String(i.system?.defaultFrom ?? "skill")));
      return offensive ? null : L("NeedsTechnique");
    },
    apply: (context: any, value: unknown) => {
      if (!CHAMBARA_TECHNIQUES.includes(value as ChambaraTechnique)) return null;
      const kind = value as ChambaraTechnique;
      if (!onMoveAndAttack(kind)) return { modifiers: chambaraTechniqueLines(kind, 0).map((line) => ({ label: L(`Lines.${line.key}`), value: line.value })) };
      const stunt = optionValue(context.actor, STUNT_OPTIONS[kind as "acrobatic" | "flying"]) === true ? -1 : 0;
      return { modifiers: chambaraTechniqueLines(kind, stunt).map((line) => ({ label: L(`Lines.${line.key}`), value: line.value })) };
    },
  } as any);
  // The technique also lifts the skill cap of 9; the spinning version buys off the Wild Swing's penalty.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const kind = context?.options?.[`${MODULE_ID}.${TECHNIQUE_OPTION}`] as ChambaraTechnique;
    if (!master(context?.actor) || !CHAMBARA_TECHNIQUES.includes(kind)) return;
    // A version the dialog refused (acrobatic or flying off a Move and Attack) does nothing.
    if (onMoveAndAttack(kind) && context.actor.system?.maneuver !== "moveAndAttack") return;
    if (kind === "spinning") {
      if (!context.wildSwing) {
        context.refusal = L("NeedsWildSwing");
        return;
      }
      const swing = (context.modifiers ?? []).find((m: any) => m?.label === game.i18n.localize("GWORLD.Melee.WildSwing"));
      const lines = chambaraTechniqueLines("spinning", 0, Number(swing?.value) || 0).filter((line) => line.key === "wildSwing");
      for (const line of lines) context.modifiers.push({ label: L(`Lines.${line.key}`), value: line.value });
    }
    context.skillCap = null;
  });

  // ── defenses (p. 129) ──
  // A master's retreat is +3 whatever the defense, and costs -1 for each one before it.
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    const defender = context?.defender;
    if (!master(defender)) return;
    if (context.retreating) {
      const line = (context.modifiers ?? []).find((m: any) => m?.label === game.i18n.localize("GWORLD.Tactical.Retreat"));
      const previous = Number(state<number>(defender, RETREATS)) || 0;
      for (const entry of retreatLines({ previous, yards: 1 })) {
        if (entry.key === "retreat") {
          if (line) line.value = entry.value;
        } else context.modifiers.push({ label: L(`Lines.${entry.key}`), value: entry.value });
      }
      void api.combat.setCombatState(defender, MODULE_ID, RETREATS, previous + 1, "turn");
      void api.combat.setCombatState(defender, MODULE_ID, RETREAT_YARDS, (Number(state<number>(defender, RETREAT_YARDS)) || 0) + 1, "turn");
    }
    // A Lizard Climb upward adds 1 more to the retreat (p. 130).
    const climbed = state<string>(defender, LIZARD);
    if (climbed) {
      if (climbed === "bonus" && context.retreating) context.modifiers.push({ label: L("ClimbRetreat"), value: 1 });
      else if (climbed !== "bonus") ui.notifications?.info(L(`Lizard.${climbed}`));
      void api.combat.clearCombatState(defender, MODULE_ID, LIZARD);
    }
  });

  // A retreat of more than a step: -1 a yard, and no further than Move all told.
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: RETREAT_OPTION,
    label: L("RetreatYards"),
    input: { type: "number", min: 1, max: 20 },
    available: (context: any) => master(context.defender),
    refuse: (context: any) => {
      const yards = Math.floor(Number(context.chosen?.[`${MODULE_ID}.${RETREAT_OPTION}`]) || 0);
      if (!yards) return null;
      if (!context.retreating) return L("TickRetreat");
      const used = Number(state<number>(context.defender, RETREAT_YARDS)) || 0;
      return retreatFits({ move: moveOf(context.defender), used, yards }) ? null : F("BeyondMove", { move: moveOf(context.defender) });
    },
    apply: (context: any, value: unknown) => {
      const yards = Math.floor(Number(value) || 0);
      if (!context.retreating || yards <= 1) return null;
      return { modifiers: retreatLines({ previous: 0, yards }).filter((l) => l.key === "yards").map((l) => ({ label: L(`Lines.${l.key}`), value: l.value })) };
    },
    after: (context: any, _outcome: unknown, value: unknown) => {
      const yards = Math.floor(Number(value) || 0);
      // The retreat's first yard was counted with the retreat itself.
      if (yards > 1) void api.combat.setCombatState(context.defender, MODULE_ID, RETREAT_YARDS, (Number(state<number>(context.defender, RETREAT_YARDS)) || 0) + yards - 1, "turn");
    },
  } as any);

  // Acrobatics for any defense, any number of times, -1 each after the first.
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!master(context?.defender) || !context.acrobatic) return;
    context.acrobatic.defenses = ["dodge", "parry", "block"];
    context.acrobatic.perTurn = null;
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!master(context?.actor) || !(context.tags ?? []).includes("acrobaticDefense")) return;
    const value = acrobaticDefensePenalty(Number(state<number>(context.actor, ACROBATIC)) || 0);
    if (value) context.modifiers.push({ label: L("Lines.acrobaticAgain"), value });
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!master(context?.actor) || !context.actor.isOwner || !(context.tags ?? []).includes("acrobaticDefense")) return;
    void api.combat.setCombatState(context.actor, MODULE_ID, ACROBATIC, (Number(state<number>(context.actor, ACROBATIC)) || 0) + 1, "turn");
  });

  // With Combat Reflexes, an attack from behind counts as from the side (p. 129).
  Hooks.on((api.combat.hooks as any).attackArc ?? "gworld.attackArc", (context: any) => {
    if (context?.arc !== "back" || !master(context.defender)) return;
    if (!traitNames(context.defender).some((name) => /^combat reflexes/i.test(name))) return;
    context.arc = "side";
    context.side = null;
  });
}
