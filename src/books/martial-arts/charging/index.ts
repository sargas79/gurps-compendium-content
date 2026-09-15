/**
 * Dealing with charging foes at the table (GURPS Martial Arts p. 106).
 *
 * Obstruction: a fighter who can parry rolls weapon skill in place of DX
 * against someone evading him, and winning offers a card to strike him for
 * half damage. Holding a Foe at Bay: a stop thrust or an obstruction that hurts
 * a foe posts a card to the GM, with the Quick Contest of ST that gets him
 * closer or the Will roll that runs him onto an impaling weapon.
 *
 * The parry against an attacker entering close combat is the system's own
 * strike after parrying an unarmed attack. The attacker weighs ST/10 lbs. for
 * the parrying weapon if he grabs or grapples, ST lbs. otherwise, and the
 * strike can hold him at bay like a stop thrust.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { chargeWeight, grabsOrGrapples, holdAtBay, maximumDamage, passesThrough, runThroughInjury, runThroughModifier, strikeBase } from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Charging.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Charging.${key}`, data);

const CARD = "ma-charging";
/** The foe a fighter just obstructed, whose damage may hold him at bay. */
const OBSTRUCTED = "ma-obstructed";

const traitNamed = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((i: any) => i.type === "trait" && pattern.test(String(i.name ?? "")));
const painOf = (actor: any): "high" | "low" | null => (traitNamed(actor, /^high pain threshold/i) ? "high" : traitNamed(actor, /^low pain threshold/i) ? "low" : null);
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);
const fromUuid = (uuid: unknown) => (globalThis as any).fromUuidSync?.(String(uuid ?? "")) ?? null;

interface CardData {
  title: string;
  text: string;
  notes: string[];
  buttons: Array<{ action: string; label: string }>;
  [key: string]: unknown;
}

/** Registers the resolver, the card and the hooks. */
export function readyCharging(api: GWorldApi, on: () => boolean): void {
  const rowsOf = (actor: any): any[] => ((api.actors.derived(actor)?.melee ?? []) as any[]).filter((r) => typeof r.skillLevel === "number" && r.usable !== false);
  /** The weapon a fighter can parry with that gives the best skill. */
  const obstructingRow = (actor: any) => rowsOf(actor).filter((r) => r.itemId && !r.natural && r.parry !== null).sort((a, b) => b.skillLevel - a.skillLevel)[0] ?? null;
  /** The row a weapon strikes with: a swing if it has one, else a thrust. */
  const strikingRow = (actor: any, itemId: string) => {
    const rows = rowsOf(actor).filter((r) => r.itemId === itemId && r.damageRollable !== false);
    const base = strikeBase(rows.map((r) => String(r.damageBase ?? "")));
    return rows.filter((r) => r.damageBase === base).sort((a, b) => maxOf(b.damage) - maxOf(a.damage))[0] ?? null;
  };
  const maxOf = (formula: unknown) => {
    const parsed = (api.rules as any).parseDiceAdds?.(String(formula ?? ""));
    return parsed ? maximumDamage(parsed) : 0;
  };
  const post = (data: CardData, actor: any) => api.chat.post(`${MODULE_ID}.${CARD}`, data, {
    actor,
    whisper: [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id),
  } as any);

  // ── Obstruction (p. 106) ──
  const obstructing = new Map<string, { itemId: string }>();
  api.roll.registerContestResolver({
    module: MODULE_ID,
    key: "ma-obstruction",
    label: L("Obstruction"),
    applies: (context: any) => on() && (context?.tags ?? []).includes("evade") && Boolean(obstructingRow(context.second?.actor)),
    resolve: (context: any) => {
      const row = obstructingRow(context.second.actor);
      obstructing.delete(`${context.first.actor?.uuid}>${context.second.actor?.uuid}`);
      if (!row || row.skillLevel <= context.second.base) return null;
      obstructing.set(`${context.first.actor?.uuid}>${context.second.actor?.uuid}`, { itemId: String(row.itemId) });
      return { second: { base: row.skillLevel, note: String(row.name ?? "") } };
    },
  } as any);

  Hooks.on((api.combat.hooks as any).afterQuickContest ?? "gworld.afterQuickContest", (context: any) => {
    if (!on() || !(context?.tags ?? []).includes("evade")) return;
    const mover = context.first?.actor;
    const foe = context.second?.actor;
    const key = `${mover?.uuid}>${foe?.uuid}`;
    const weapon = obstructing.get(key);
    obstructing.delete(key);
    // Only a win strikes; a tie just stops him.
    if (!weapon || context.outcome !== "second" || !foe) return;
    const item = foe.items?.get?.(weapon.itemId);
    void post({
      title: L("Obstruction"),
      text: F("Obstructs", { foe: String(foe.name ?? ""), mover: String(mover?.name ?? ""), weapon: String(item?.name ?? "") }),
      notes: [],
      buttons: [{ action: "obstruct", label: L("StrikeHalf") }],
      foeUuid: String(foe.uuid),
      moverUuid: String(mover?.uuid ?? ""),
      itemId: weapon.itemId,
    }, foe);
  });

  // ── Parry (p. 106): the unarmed attacker's "weapon weight" (API 1.44.0) ──
  Hooks.on(api.combat.hooks.breakageOdds, (context: any) => {
    if (!on() || context?.delivery !== "unarmed" || !context.attacker || !("attackWeight" in context)) return;
    const st = Number(api.actors.attribute(context.attacker, "ST")) || 10;
    context.attackWeight = Math.max(Number(context.attackWeight) || 0, chargeWeight(st, grabsOrGrapples(context.attackTags ?? [])));
  });

  // ── Holding a Foe at Bay (p. 106) ──
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const victim = context?.actor;
    const item = context?.item;
    const attacker = item?.parent ?? null;
    const result = context?.result;
    if (!on() || !isActiveGm() || !victim || !attacker || !result || context.mode?.ranged) return;
    const stopThrust = attacker.system?.maneuver === "wait";
    const obstructed = api.combat.getCombatState(attacker, MODULE_ID, OBSTRUCTED) === victim.uuid;
    // The system's strike after a weapon parried an unarmed attack (API 1.43.0).
    const parried = context.damage?.source === "parriedLimb";
    if (!stopThrust && !obstructed && !parried) return;
    const row = rowsOf(attacker).find((r) => r.itemId === item.id && r.modeIndex === Number(context.mode?.index ?? 0)) ?? null;
    const outcome = holdAtBay({ injury: Number(result.injury) || 0, thrust: row?.damageBase === "thr", damageType: String(context.damage?.type ?? "") });
    const notes = [
      ...(result.knockdown?.required ? [L("IfKnockedDown")] : []),
      ...(Number(result.knockback?.yards) > 0 ? [F("Knockback", { yards: Number(result.knockback.yards) })] : []),
    ];
    const names = { victim: String(victim.name ?? ""), attacker: String(attacker.name ?? ""), weapon: String(item.name ?? "") };
    const shared = { victimUuid: String(victim.uuid), attackerUuid: String(attacker.uuid), itemId: String(item.id), modeIndex: Number(context.mode?.index ?? 0) };
    if (outcome === "impaled") {
      void post({
        title: L("AtBay"),
        text: F("Impaled", names),
        notes,
        buttons: [{ action: "runThrough", label: L("RunThrough") }],
        ...shared,
        maxDamage: Number(context.damage?.maxDamage) || 0,
        dr: Number(result.effectiveDr) || 0,
        wounding: Number(result.woundingModifier) || 1,
        injury: Number(result.injury) || 0,
      }, victim);
    } else {
      void post({ title: L("AtBay"), text: F("InTheWay", names), notes, buttons: [{ action: "stContest", label: L("StContest") }], ...shared }, victim);
    }
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: CARD,
    template: `modules/${MODULE_ID}/templates/ma-charging.hbs`,
    actions: {
      // The obstructing fighter strikes, for half damage.
      obstruct: async ({ data }: any) => {
        const foe = fromUuid(data.foeUuid);
        const mover = fromUuid(data.moverUuid);
        const row = foe ? strikingRow(foe, String(data.itemId)) : null;
        if (!foe || !row) return;
        if (mover) await api.combat.setCombatState(foe, MODULE_ID, OBSTRUCTED, String(mover.uuid), "round");
        await api.roll.damage({
          actor: foe,
          item: foe.items?.get?.(String(data.itemId)) ?? null,
          mode: { index: Number(row.modeIndex) || 0, ranged: false },
          label: F("ObstructionDamage", { weapon: String(row.name ?? "") }),
          formula: String(row.damage),
          damageType: row.damageType,
          armorDivisor: Number(row.armorDivisor) || 1,
          // Damage as for a parry, halved and rounded down.
          halfDamage: true,
        } as any);
      },
      // The foe tries to force his way past the weapon.
      stContest: async ({ data }: any) => {
        const victim = fromUuid(data.victimUuid);
        const attacker = fromUuid(data.attackerUuid);
        if (!victim || !attacker) return;
        const result: any = await api.roll.quickContest({
          label: F("StContestLabel", { victim: String(victim.name ?? ""), attacker: String(attacker.name ?? "") }),
          first: { actor: victim, base: Number(api.actors.attribute(victim, "ST")) || 10, note: "ST" },
          second: { actor: attacker, base: Number(api.actors.attribute(attacker, "ST")) || 10, note: "ST" },
          tags: ["holdAtBay"],
        } as any);
        ui.notifications?.info(F(result?.outcome === "first" ? "PushesIn" : "HeldOff", { victim: String(victim.name ?? "") }));
      },
      // The foe runs himself onto the weapon.
      runThrough: async ({ data }: any) => {
        const victim = fromUuid(data.victimUuid);
        const attacker = fromUuid(data.attackerUuid);
        if (!victim) return;
        const pain = painOf(victim);
        const outcome: any = await api.roll.success({
          actor: victim,
          base: Number(api.actors.attribute(victim, "Will")) || 10,
          label: F("RunThroughLabel", { victim: String(victim.name ?? "") }),
          kind: "attribute",
          modifiers: [{ label: L("RunThrough"), value: runThroughModifier(pain) }],
        } as any);
        if (!outcome?.success) return;
        const more = runThroughInjury({ maxDamage: Number(data.maxDamage) || 0, dr: Number(data.dr) || 0, wounding: Number(data.wounding) || 1, injuryTaken: Number(data.injury) || 0 });
        if (more > 0) await api.actors.applyInjury(victim, { amount: more, label: L("RunThrough") });
        // His own thrust with the weapon, against the DR on his back.
        const row = attacker ? rowsOf(attacker).find((r) => r.itemId === data.itemId && r.modeIndex === Number(data.modeIndex)) : null;
        const thrust = (api.rules as any).thrustDamage?.(Number(api.actors.attribute(victim, "ST")) || 10);
        const max = thrust ? maximumDamage({ dice: thrust.dice, adds: (Number(thrust.adds) || 0) + (Number(row?.damageModifier) || 0) }) : 0;
        const backDr = Number(api.actors.derived(victim)?.drByLocation?.torso) || 0;
        const through = passesThrough(max, backDr);
        await ChatMessage.implementation.create({
          speaker: ChatMessage.implementation.getSpeaker({ actor: victim }),
          content: `<div class="gworld gworld-chat"><div class="gc-result">${foundry.utils.escapeHTML(F(through ? "PassesThrough" : "Stuck", { victim: String(victim.name ?? ""), injury: more, max, dr: backDr }))}</div></div>`,
        });
      },
    },
  } as any);
}
