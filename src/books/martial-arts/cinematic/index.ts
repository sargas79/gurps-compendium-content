/**
 * The book's other cinematic combat rules at the table (GURPS Martial Arts
 * pp. 130, 132-133).
 *
 * Contest of Wills: a Concentrate's response challenges the targeted foe, and a
 * card runs the contest turn by turn, then the loser's reaction and his penalty
 * to attack the winner. Concentration: giving in to a distracting disadvantage
 * leaves -2 DX. Fear: gruesome wounds offer the GM a Fright Check, and known
 * victories help Intimidation. Faking it: Stage Combat's defaults, and a tool
 * for the contest with a real fighter. Unarmed Etiquette, Shaking It Off, Shout
 * It Out!, Proxy Fighting and Bullet Time each have their own switch.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  BULLET_TIME_COST,
  DISTRACTED_DX,
  PROXIES,
  SHOUTED_ATTACK,
  SHOUTED_DEFENSE,
  bulletTimeSuggested,
  commandsProxy,
  proxyObjectFits,
  puppetMovement,
  defeatedFoesBonus,
  distracts,
  etiquetteRefuses,
  proxyPenalty,
  proxyRange,
  rebasedLevel,
  secretStylesAllowed,
  stageCombatDefault,
  unshoutedStyle,
  willsAftermath,
  willsModifiers,
  willsRound,
  willsScore,
  type Proxy,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Cinematic.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Cinematic.${key}`, data);
const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ""));

export interface CinematicSwitches {
  wills: () => boolean;
  concentration: () => boolean;
  fear: () => boolean;
  faking: () => boolean;
  etiquette: () => boolean;
  shaking: () => boolean;
  shout: () => boolean;
  proxy: () => boolean;
  bulletTime: () => boolean;
}

const CARD = "ma-cinematic";
const WILLS_CARD = "ma-wills";
const WILLS_OPTION = "ma-contest-of-wills";
const WILLS_REFUSED = "ma-wills-refused";
const WILLS_LOST = "ma-wills-lost";
const SHOUTED = "ma-shouted-styles";
const SECRET_STYLE = "secretStyle";
const FOES_DEFEATED = "foesDefeated";

const traitNames = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait").map((i: any) => String(i.name ?? ""));
const traitLevel = (actor: any, pattern: RegExp) => {
  const trait = [...(actor?.items ?? [])].find((i: any) => i.type === "trait" && pattern.test(String(i.name ?? "")));
  return trait ? Math.max(1, Number(trait.system?.levels) || 1) : 0;
};
const fromUuid = (uuid: unknown) => (globalThis as any).fromUuidSync?.(String(uuid ?? "")) ?? null;
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);
const gmIds = () => [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id);

/** Offers the GM the Fright Check for a gruesome wound, while Fear is on (p. 130). */
let fearCard: ((victim: any) => void) | null = null;

/** Offers a Fright Check for a wound another module made gruesome, such as a part bitten off. */
export function offerFrightCheck(victim: any): void {
  fearCard?.(victim);
}

/** Registers every rule's options, cards, tools and hooks. */
export function readyCinematic(api: GWorldApi, on: CinematicSwitches): void {
  const state = <T>(actor: any, key: string) => api.combat.getCombatState(actor, MODULE_ID, key) as T | undefined;
  const attr = (actor: any, key: "ST" | "DX" | "IQ" | "HT" | "Will" | "Per") => Number(api.actors.attribute(actor, key)) || 10;
  const skills = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.type === "skill").map((i: any) => ({ name: String(i.name ?? ""), level: api.actors.skillLevel(actor, String(i.name ?? "")), item: i }));
  const inFamily = (name: string, family: string) => Boolean((api.rules as any).inSkillFamily?.(name, family));
  /** The best melee or unarmed combat skill, or null. */
  const bestCombat = (actor: any) => {
    const levels = skills(actor).filter((s) => s.level !== null && (inFamily(s.name, "melee") || inFamily(s.name, "unarmed"))).map((s) => s.level as number);
    return levels.length ? Math.max(...levels) : null;
  };
  const card = (data: { title: string; text: string; notes?: string[]; buttons?: Array<{ action: string; label: string }>; [key: string]: unknown }, actor: any, whisper = false) =>
    api.chat.post(`${MODULE_ID}.${CARD}`, { notes: [], buttons: [], ...data }, { actor, ...(whisper ? { whisper: gmIds() } : {}) } as any);

  // ── the Contest of Wills (p. 130) ──
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: WILLS_OPTION,
    maneuver: "concentrate",
    label: L("Wills.Option"),
    available: () => on.wills(),
    response: {
      label: L("Wills.Challenge"),
      trigger: async (challenger: any) => {
        if (!on.wills()) return;
        const foes = [...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
        if (foes.length !== 1) return void ui.notifications?.warn(L("Wills.Pick"));
        const foe = foes[0];
        if (state<string[]>(foe, WILLS_REFUSED)?.includes(String(challenger.uuid))) return void ui.notifications?.warn(F("Wills.AlreadyRefused", { foe: String(foe.name ?? "") }));
        await api.chat.post(`${MODULE_ID}.${WILLS_CARD}`, willsData(challenger, foe, { status: "challenged", repFirst: 0, repSecond: 0, turns: [] }), { actor: foe } as any);
      },
    },
  } as any);

  interface WillsData { challengerUuid: string; foeUuid: string; status: "challenged" | "running" | "refused" | "over"; repFirst: number; repSecond: number; turns: string[]; [key: string]: unknown }
  function willsData(challenger: any, foe: any, data: Partial<WillsData>): WillsData {
    const base = {
      challengerUuid: String(challenger.uuid),
      foeUuid: String(foe.uuid),
      status: "challenged",
      repFirst: 0,
      repSecond: 0,
      turns: [],
      ...data,
    } as WillsData;
    return {
      ...base,
      title: L("Wills.Title"),
      text: F(`Wills.Status.${base.status}`, { challenger: String(challenger.name ?? ""), foe: String(foe.name ?? "") }),
      challengerName: String(challenger.name ?? ""),
      foeName: String(foe.name ?? ""),
      challenged: base.status === "challenged",
      running: base.status === "running",
    };
  }
  const sideOf = (actor: any, foe: any, reputation: number) => {
    const score = willsScore({ will: attr(actor, "Will"), intimidation: api.actors.skillLevel(actor, "Intimidation"), mentalStrength: api.actors.skillLevel(actor, "Mental Strength") });
    const lines = willsModifiers({
      fearlessness: traitLevel(actor, /^fearlessness/i),
      indomitable: traitNames(actor).some((n) => /^indomitable/i.test(n)),
      unfazeable: traitNames(actor).some((n) => /^unfazeable/i.test(n)),
      bestCombatSkill: bestCombat(actor),
      foeBestCombatSkill: bestCombat(foe),
      reputation,
    });
    return { score, modifiers: lines.map((l) => ({ label: L(`Wills.Lines.${l.key}`), value: l.value })) };
  };

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: WILLS_CARD,
    template: `modules/${MODULE_ID}/templates/ma-wills.hbs`,
    actions: {
      accept: async ({ message, data }: any) => {
        const challenger = fromUuid(data.challengerUuid);
        const foe = fromUuid(data.foeUuid);
        if (challenger && foe) await api.chat.update(message, willsData(challenger, foe, { ...data, status: "running" }));
      },
      refuse: async ({ message, data }: any) => {
        const challenger = fromUuid(data.challengerUuid);
        const foe = fromUuid(data.foeUuid);
        if (!challenger || !foe) return;
        const outcome: any = await api.roll.success({ actor: foe, base: attr(foe, "Will"), label: L("Wills.RefuseRoll"), kind: "attribute" } as any);
        if (!outcome) return;
        if (outcome.success) {
          await api.combat.setCombatState(foe, MODULE_ID, WILLS_REFUSED, [...(state<string[]>(foe, WILLS_REFUSED) ?? []), String(challenger.uuid)], "combat");
        }
        await api.chat.update(message, willsData(challenger, foe, { ...data, status: outcome.success ? "refused" : "running" }));
      },
      repFirst: async ({ message, data, value }: any) => {
        const challenger = fromUuid(data.challengerUuid);
        const foe = fromUuid(data.foeUuid);
        if (challenger && foe) await api.chat.update(message, willsData(challenger, foe, { ...data, repFirst: Number(value) || 0 }));
      },
      repSecond: async ({ message, data, value }: any) => {
        const challenger = fromUuid(data.challengerUuid);
        const foe = fromUuid(data.foeUuid);
        if (challenger && foe) await api.chat.update(message, willsData(challenger, foe, { ...data, repSecond: Number(value) || 0 }));
      },
      // One turn of the contest (p. 130).
      round: async ({ message, data }: any) => {
        const challenger = fromUuid(data.challengerUuid);
        const foe = fromUuid(data.foeUuid);
        if (!challenger || !foe || data.status !== "running") return;
        const first = sideOf(challenger, foe, Number(data.repFirst) || 0);
        const second = sideOf(foe, challenger, Number(data.repSecond) || 0);
        const scoreOf = (side: typeof first) => side.score + side.modifiers.reduce((sum, m) => sum + m.value, 0);
        // A Regular Contest's scores are balanced before anyone rolls.
        const balanced = (api.rules as any).balanceContestScores?.(scoreOf(first), scoreOf(second)) ?? { first: scoreOf(first), second: scoreOf(second) };
        const shift = (side: typeof first, target: number) => [...side.modifiers, ...(target !== scoreOf(side) ? [{ label: L("Wills.Balanced"), value: target - scoreOf(side) }] : [])];
        const a: any = await api.roll.success({ actor: challenger, base: first.score, label: L("Wills.Title"), kind: "attribute", modifiers: shift(first, balanced.first), tags: ["contestOfWills"] } as any);
        const b: any = await api.roll.success({ actor: foe, base: second.score, label: L("Wills.Title"), kind: "attribute", modifiers: shift(second, balanced.second), tags: ["contestOfWills"] } as any);
        if (!a || !b) return;
        const settled = willsRound(a, b);
        const turns = [...(data.turns ?? []), settled ? F("Wills.Won", { name: String((settled.winner === "first" ? challenger : foe).name ?? ""), margin: settled.margin }) : L("Wills.NoWinner")];
        if (!settled) return void api.chat.update(message, willsData(challenger, foe, { ...data, turns }));
        const winner = settled.winner === "first" ? challenger : foe;
        const loser = settled.winner === "first" ? foe : challenger;
        const aftermath = willsAftermath(settled.margin);
        const dice = new Roll("3d6");
        await dice.evaluate();
        const reaction = (api.rules as any).reactionRoll?.({ rolled: Number(dice.total), modifier: aftermath.reaction });
        await api.combat.setCombatState(loser, MODULE_ID, WILLS_LOST, { vs: String(winner.uuid), margin: settled.margin }, "combat");
        await api.chat.update(message, willsData(challenger, foe, {
          ...data,
          status: "over",
          turns: [...turns, F("Wills.Reaction", { loser: String(loser.name ?? ""), rolled: Number(dice.total), bonus: aftermath.reaction, total: reaction?.total ?? Number(dice.total) + aftermath.reaction, reaction: game.i18n.localize(`GWORLD.Reaction.${reaction?.reaction ?? "neutral"}`), penalty: aftermath.attack, winner: String(winner.name ?? "") })],
        }));
      },
    },
  } as any);

  // A loser who attacks the winner anyway takes the margin as a penalty.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.wills() || !context?.actor) return;
    const lost = state<{ vs: string; margin: number }>(context.actor, WILLS_LOST);
    if (!lost || !(context.targets ?? []).some((t: any) => t?.uuid === lost.vs)) return;
    const value = willsAftermath(lost.margin).attack;
    if (value) context.modifiers.push({ label: L("Wills.Lost"), value });
  });

  // ── concentration (p. 130) ──
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    if (!on.concentration() || !actor?.isOwner || !(context.tags ?? []).includes("selfControl") || context.outcome?.success !== false) return;
    if (!distracts(String(context.skill ?? ""))) return;
    void api.actors.applyCondition(actor, {
      module: MODULE_ID,
      key: "ma-distracted",
      label: F("Distracted", { trait: String(context.skill ?? "") }),
      effects: { modifiers: [{ label: L("DistractedLine"), value: DISTRACTED_DX, rolls: ["attack", "parry", "block"] }] },
    } as any);
  });

  // ── fear (p. 130) ──
  fearCard = (victim: any) => {
    if (!on.fear() || !isActiveGm() || !victim) return;
    void card({ title: L("Fear.Title"), text: F("Fear.Text", { name: String(victim.name ?? "") }), buttons: [{ action: "fright", label: L("Fear.Roll") }], actorUuid: String(victim.uuid) }, victim, true);
  };
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const victim = context?.actor;
    const result = context?.result;
    if (!on.fear() || !isActiveGm() || !victim || !result) return;
    const location = String(result.hitLocation ?? "");
    const addon = String(result.addonLocation ?? "");
    const raw = (Number(result.injury) || 0) + (Number(result.excessLost) || 0);
    const threshold = (api.rules as any).cripplingThreshold?.(location, Number(victim.system?.hp?.max) || 10) ?? null;
    const dismembered = ["arm", "leg", "hand", "foot"].includes(location) && threshold !== null && raw > 2 * threshold;
    const gruesome = dismembered || (result.crippled && (location === "eye" || /\.ma-(ear|nose)$/.test(addon)));
    if (!gruesome) return;
    fearCard?.(victim);
  });

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-foes-defeated",
    sheet: "character",
    tab: "skills",
    template: `modules/${MODULE_ID}/templates/ma-foes-defeated.hbs`,
    visible: () => on.fear(),
    context: (actor: any) => ({ value: Number(actor?.getFlag?.(MODULE_ID, FOES_DEFEATED)) || 0, bonus: defeatedFoesBonus(Number(actor?.getFlag?.(MODULE_ID, FOES_DEFEATED)) || 0) }),
    listeners: (element: HTMLElement, actor: any) => {
      element.querySelector<HTMLInputElement>("[data-ma-foes-defeated]")?.addEventListener("change", (event) => {
        void actor.setFlag(MODULE_ID, FOES_DEFEATED, Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0)));
      });
    },
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!on.fear() || !/^intimidation\b/i.test(String(context?.skill ?? ""))) return;
    const bonus = defeatedFoesBonus(Number(context.actor?.getFlag?.(MODULE_ID, FOES_DEFEATED)) || 0);
    if (bonus) context.modifiers.push({ label: L("Fear.Victories"), value: bonus });
  });

  // ── faking it (p. 130) ──
  Hooks.on(api.data.hooks.skillLevels, (context: any) => {
    if (!on.faking()) return;
    const entry = (context?.skills ?? []).find((s: any) => /^stage combat$/i.test(String(s.name ?? "").trim()));
    if (!entry || (!entry.fromDefault && entry.level !== null)) return;
    const others = (context.skills ?? []).filter((s: any) => s !== entry && s.level !== null);
    const best = (test: (name: string) => boolean) => {
      const levels = others.filter((s: any) => test(String(s.name ?? ""))).map((s: any) => Number(s.level));
      return levels.length ? Math.max(...levels) : null;
    };
    const level = stageCombatDefault({
      combatArt: best((n) => /^combat (art|sport)\b/i.test(n)),
      combat: best((n) => inFamily(n, "melee") || inFamily(n, "unarmed") || inFamily(n, "ranged")),
      performance: best((n) => /^performance\b/i.test(n)),
    });
    if (level === null || (entry.level !== null && entry.level >= level)) return;
    Object.assign(entry, { level, fromDefault: true, note: L("Faking.Default"), source: MODULE_ID });
  });

  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-faking-it",
    label: L("Faking.Title"),
    icon: "fa-solid fa-masks-theater",
    visible: () => on.faking(),
    open: async () => {
      // The selected token fakes it, or else the first targeted one; the (other) targeted token watches.
      const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
      const performer = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? targets[0] ?? null;
      const observer = targets.find((a: any) => a.uuid !== performer?.uuid) ?? null;
      if (!performer) return void ui.notifications?.warn(L("Faking.Pick"));
      const performance = api.actors.skillLevel(performer, "Performance");
      // A DX-based Performance roll, or DX-5 at default.
      const base = performance === null ? attr(performer, "DX") - 5 : rebasedLevel(performance, attr(performer, "IQ"), attr(performer, "DX"));
      const label = F("Faking.Label", { name: String(performer.name ?? "") });
      const trained = observer ? skills(observer).filter((s) => s.level !== null && (inFamily(s.name, "melee") || inFamily(s.name, "unarmed") || /^combat (art|sport)\b/i.test(s.name))) : [];
      if (!observer || !trained.length) {
        await api.roll.success({ actor: performer, base, label, skill: "Performance" } as any);
        return;
      }
      // An IQ-based roll against his best combat, Combat Art or Combat Sport skill.
      const levels = trained.map((s) => rebasedLevel(Number(s.level), attr(observer, String(s.item.system?.attribute ?? "DX") === "IQ" ? "IQ" : "DX"), attr(observer, "IQ")));
      const result: any = await api.roll.quickContest({
        label,
        first: { actor: performer, base, note: L("Faking.Performance") },
        second: { actor: observer, base: Math.max(...levels), note: L("Faking.BestCombat") },
        tags: ["fakingIt"],
      } as any);
      ui.notifications?.info(F(result?.outcome === "first" ? "Faking.Fooled" : "Faking.SeenThrough", { observer: String(observer.name ?? "") }));
    },
  });

  // ── Unarmed Etiquette (p. 132) ──
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on.etiquette() || context?.delivery !== "unarmed") return;
    for (const choice of context.choices ?? []) {
      if (!choice.available) continue;
      if (etiquetteRefuses({ delivery: context.delivery, defense: choice.key, bareHanded: context.parryWeapon?.natural === true })) {
        Object.assign(choice, { available: false, refusal: L("Etiquette") });
        // The unarmed defenses that injure -- Aggressive Parry and Jam -- aren't
        // affected, so the bare-handed parry and its techniques stay on offer (API 1.43.0).
        if (choice.key === "parry" && context.bareHandedParry) context.bareHandedParry.available = true;
      }
    }
  });

  // ── Shaking It Off (p. 132) ──
  Hooks.on((api.combat.hooks as any).afterKnockdown ?? "gworld.afterKnockdown", (context: any) => {
    const actor = context?.actor;
    if (!on.shaking() || !actor?.isOwner || actor.type !== "character" || context.result?.outcome === "unaffected") return;
    void card({
      title: L("Shake.Title"),
      text: F("Shake.Text", { name: String(actor.name ?? "") }),
      buttons: [{ action: "shake", label: L("Shake.Spend") }],
      actorUuid: String(actor.uuid),
      posture: String(context.previousPosture ?? "standing"),
    }, actor);
  });

  // ...and after a failed roll to stay conscious (API 1.43.0).
  Hooks.on((api.combat.hooks as any).afterConsciousnessRoll ?? "gworld.afterConsciousnessRoll", (context: any) => {
    const actor = context?.actor;
    if (!on.shaking() || !actor?.isOwner || actor.type !== "character" || context.outcome?.success !== false) return;
    void card({
      title: L("Shake.Title"),
      text: F("Shake.TextConscious", { name: String(actor.name ?? "") }),
      buttons: [{ action: "shake", label: L("Shake.Spend") }],
      actorUuid: String(actor.uuid),
      posture: String(context.previousPosture ?? "standing"),
    }, actor);
  });

  // ── Bullet Time (p. 133) ──
  const inBulletTime = (actor: any) => ((api.actors.conditions(actor) ?? []) as any[]).some((c) => c.id === `${MODULE_ID}.ma-bullet-time`);
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-bullet-time",
    label: L("Bullet.Title"),
    icon: "fa-solid fa-stopwatch",
    visible: () => on.bulletTime(),
    open: async () => {
      const actor = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
      if (!actor) return void ui.notifications?.warn(L("Bullet.Pick"));
      const suggested = bulletTimeSuggested(traitNames(actor));
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("Bullet.Title") },
        content: `<p>${esc(F("Bullet.Ask", { name: String(actor.name ?? ""), cost: BULLET_TIME_COST }))}</p>${suggested ? "" : `<p class="ihint">${esc(L("Bullet.NotSuggested"))}</p>`}`,
      });
      if (!confirmed) return;
      const paid = await (api.points as any).spendUnspent?.(actor, BULLET_TIME_COST, L("Bullet.Title"));
      if (!paid) return void ui.notifications?.warn(F("Bullet.CantPay", { cost: BULLET_TIME_COST }));
      await api.actors.applyCondition(actor, { module: MODULE_ID, key: "ma-bullet-time", label: L("Bullet.Condition") } as any);
      await card({ title: L("Bullet.Title"), text: F("Bullet.Text", { name: String(actor.name ?? "") }), buttons: [{ action: "endBulletTime", label: L("Bullet.End") }], actorUuid: String(actor.uuid) }, actor);
    },
  });
  // Foes are defenseless against a fighter in Bullet Time.
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on.bulletTime() || !context?.attacker || !inBulletTime(context.attacker)) return;
    for (const choice of context.choices ?? []) {
      if (choice.available) Object.assign(choice, { available: false, refusal: L("Bullet.Defenseless") });
    }
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ma-cinematic-card.hbs`,
    actions: {
      fright: { permission: "gm", run: async ({ data }: any) => {
        const victim = fromUuid(data.actorUuid);
        if (victim) await (api.roll as any).frightCheck?.(victim, 0);
      } },
      shake: async ({ message, data }: any) => {
        const actor = fromUuid(data.actorUuid);
        if (!actor || data.done) return;
        await api.actors.applyInjury(actor, { amount: 1, fatigue: true, label: L("Shake.Title") });
        await (api.actors as any).undoKnockdown?.(actor, { posture: data.posture });
        await api.chat.update(message, { ...data, done: true, buttons: [], text: F("Shake.Done", { name: String(actor.name ?? "") }) });
      },
      endBulletTime: async ({ message, data }: any) => {
        const actor = fromUuid(data.actorUuid);
        if (!actor) return;
        await api.actors.removeCondition(actor, `${MODULE_ID}.ma-bullet-time`);
        await api.chat.update(message, { ...data, buttons: [], text: F("Bullet.Ended", { name: String(actor.name ?? "") }) });
      },
    },
  } as any);

  // ── Shout It Out! (p. 132) ──
  const secretStyles = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => i.type === "trait" && i.getFlag?.(MODULE_ID, SECRET_STYLE) === true).map((i: any) => String(i.name ?? ""));
  const nextShout = (actor: any) => unshoutedStyle(secretStyles(actor), state<string[]>(actor, SHOUTED) ?? []);
  const recordShout = (actor: any, style: string) => api.combat.setCombatState(actor, MODULE_ID, SHOUTED, [...(state<string[]>(actor, SHOUTED) ?? []), style], "combat");
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-secret-style",
    itemTypes: ["trait"],
    label: L("Shout.Secret"),
    icon: "fa-solid fa-bullhorn",
    visible: (item: any) => on.shout() && /^style familiarity\b/i.test(String(item?.name ?? "")),
    run: async (item: any, actor: any) => {
      const next = item.getFlag(MODULE_ID, SECRET_STYLE) !== true;
      await item.setFlag(MODULE_ID, SECRET_STYLE, next);
      const allowed = secretStylesAllowed(Number(actor?.system?.derived?.points?.total) || 0);
      ui.notifications?.info(F(next ? "Shout.Marked" : "Shout.Unmarked", { style: String(item.name ?? "") }));
      if (next && secretStyles(actor).length > allowed) ui.notifications?.warn(F("Shout.OverLimit", { allowed }));
    },
  });
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: "ma-shout-attack",
    label: L("Shout.Attack"),
    attack: "melee",
    available: (context: any) => on.shout() && secretStyles(context.actor).length > 0,
    refuse: (context: any) => (nextShout(context.actor) ? null : L("Shout.AllUsed")),
    apply: (context: any) => {
      const style = nextShout(context.actor);
      return style ? { defenseModifiers: [{ label: F("Shout.Shouted", { style }), value: SHOUTED_ATTACK }], notes: [F("Shout.Shouted", { style })] } : null;
    },
  } as any);
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!on.shout() || !context?.actor?.isOwner || context.options?.[`${MODULE_ID}.ma-shout-attack`] !== true) return;
    const style = nextShout(context.actor);
    if (style) void recordShout(context.actor, style);
  });
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: "ma-shout-defense",
    label: L("Shout.Defense"),
    available: (context: any) => on.shout() && secretStyles(context.defender).length > 0,
    refuse: (context: any) => (nextShout(context.defender) ? null : L("Shout.AllUsed")),
    apply: (context: any) => {
      const style = nextShout(context.defender);
      return style ? { modifiers: [{ label: F("Shout.Shouted", { style }), value: SHOUTED_DEFENSE }] } : null;
    },
    after: (context: any) => {
      const style = nextShout(context.defender);
      if (style) void recordShout(context.defender, style);
    },
  } as any);

  // ── Proxy Fighting (pp. 132-133) ──
  const puppetOf = (actor: any) => {
    const grapple = api.combat.grapple(actor);
    return grapple && !grapple.holding ? null : grapple?.foe ? fromUuid(grapple.foe) ?? grapple.foe : null;
  };
  const PUPPET = "ma-puppet";
  const basicLiftOf = (actor: any) => Number(api.actors.basicLift(actor)) || 0;
  /** An object proxy heavier than Basic Lift can't be used; the weight entered is already a tenth for a rolling or suspended one. */
  const objectRefusal = (actor: any, proxy: unknown, weight: unknown) => (proxy === "object" && !proxyObjectFits(Number(weight) || 0, basicLiftOf(actor)) ? F("Proxy.TooHeavy", { bl: basicLiftOf(actor) }) : null);
  /** A fighter using a puppet does no more than step until the grapple ends (p. 133). */
  const usePuppet = async (actor: any, proxy: unknown) => {
    if (!String(proxy ?? "").startsWith("puppet")) return;
    const puppet = puppetOf(actor);
    if (!puppet) return;
    await api.combat.setCombatState(actor, MODULE_ID, PUPPET, String(api.combat.grapple(actor)?.foe ?? ""), "combat");
    actor.reset?.();
    if (actor.sheet?.rendered) actor.sheet.render(false);
  };
  Hooks.on(api.combat.hooks.maneuverAllowances, (context: any) => {
    const actor = context?.actor;
    if (!on.proxy() || !actor) return;
    const held = state<string>(actor, PUPPET);
    if (!held) return;
    let grapple: any = null;
    try { grapple = api.combat.grapple(actor); } catch { grapple = null; }
    // Only while the grapple on that proxy lasts.
    if (!grapple || grapple.holding === false || String(grapple.foe ?? "") !== held) return;
    context.movement = puppetMovement(String(context.movement ?? "full"));
  });
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: "ma-proxy",
    label: L("Proxy.Attack"),
    attack: "melee",
    // The dialog shows the first choice as chosen, so the first is none.
    input: { type: "select", choices: [{ value: "", label: "—" }, ...PROXIES.map((value) => ({ value, label: L(`Proxy.Kinds.${value}`) }))] },
    available: () => on.proxy(),
    refuse: (context: any) => {
      const value = context.chosen?.[`${MODULE_ID}.ma-proxy`] as Proxy | undefined;
      if (value === "object") return objectRefusal(context.actor, value, context.chosen?.[`${MODULE_ID}.ma-proxy-weight`]);
      if (!value) return null;
      const person = value.startsWith("puppet") ? puppetOf(context.actor) : (context.targets ?? [])[0]?.actor ?? null;
      if (!person) return L(value.startsWith("puppet") ? "Proxy.NeedGrapple" : "Proxy.NeedTarget");
      return commandsProxy(bestCombat(context.actor), bestCombat(person)) ? null : L("Proxy.Outskilled");
    },
    apply: (context: any, value: unknown) => {
      if (!PROXIES.includes(value as Proxy)) return null;
      void usePuppet(context.actor, value);
      const puppet = value === "puppetUnwilling" ? puppetOf(context.actor) : null;
      return {
        modifiers: [{ label: L(`Proxy.Kinds.${value}`), value: proxyPenalty(value as Proxy, puppet ? attr(puppet, "ST") : 0) }],
        notes: [L(value === "object" ? "Proxy.ObjectNote" : String(value).startsWith("slap") ? "Proxy.SlapNote" : "Proxy.PuppetNote")],
      };
    },
  } as any);
  // What the object weighs, against Basic Lift.
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: "ma-proxy-weight",
    label: L("Proxy.Weight"),
    attack: "melee",
    input: { type: "number", min: 0, max: 10000 },
    available: () => on.proxy(),
    apply: () => null,
  } as any);
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: "ma-proxy-distance",
    label: L("Proxy.Distance"),
    attack: "melee",
    input: { type: "number", min: 0, max: 50 },
    available: () => on.proxy(),
    refuse: (context: any) => {
      const yards = Number(context.chosen?.[`${MODULE_ID}.ma-proxy-distance`]) || 0;
      return yards > proxyRange(attr(context.actor, "ST")) ? F("Proxy.TooFar", { yards: proxyRange(attr(context.actor, "ST")) }) : null;
    },
    apply: (_context: any, value: unknown) => {
      const yards = Math.floor(Number(value) || 0);
      const penalty = yards > 0 ? Number((api.rules as any).speedRangeModifier?.(yards)) || 0 : 0;
      return penalty ? { modifiers: [{ label: L("Proxy.Distance"), value: penalty }] } : null;
    },
  } as any);
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: "ma-proxy-defense",
    label: L("Proxy.Defense"),
    input: { type: "select", choices: (["object", "puppetWilling", "puppetUnwilling"] as Proxy[]).map((value) => ({ value, label: L(`Proxy.Kinds.${value}`) })) },
    available: () => on.proxy(),
    refuse: (context: any) => objectRefusal(context.defender, context.chosen?.[`${MODULE_ID}.ma-proxy-defense`], context.chosen?.[`${MODULE_ID}.ma-proxy-defense-weight`]),
    apply: (context: any, value: unknown) => {
      if (!PROXIES.includes(value as Proxy)) return null;
      const puppet = value === "puppetUnwilling" ? puppetOf(context.defender) : null;
      return { modifiers: [{ label: L(`Proxy.Kinds.${value}`), value: proxyPenalty(value as Proxy, puppet ? attr(puppet, "ST") : 0) }] };
    },
    after: async (context: any, outcome: any, value: unknown) => {
      await usePuppet(context.defender, value);
      if (!outcome || outcome.success) return;
      // Failure means the proxy is hit, not his controller: the GM applies the blow to the proxy.
      const puppet = String(value ?? "").startsWith("puppet") ? puppetOf(context.defender) : null;
      await card({
        title: L("Proxy.Defense"),
        text: puppet ? F("Proxy.StruckPuppet", { proxy: String(puppet.name ?? ""), name: String(context.defender?.name ?? "") }) : F("Proxy.Struck", { name: String(context.defender?.name ?? "") }),
      }, context.defender, true);
    },
  } as any);
  api.combat.registerDefenseOption({
    module: MODULE_ID,
    key: "ma-proxy-defense-weight",
    label: L("Proxy.Weight"),
    input: { type: "number", min: 0, max: 10000 },
    available: () => on.proxy(),
    apply: () => null,
  } as any);
}
