/**
 * Grab and Smash, pain, teeth and bodies in close combat, at the table (GURPS
 * Martial Arts pp. 114-119).
 *
 * Grab and Smash: a thrust at the location an All-Out Attack grappled this turn
 * gets All-Out Attack (Strong)'s damage; Kiss the Wall is a grapple action;
 * Inflict Pain turns a hold's points into pain; attacks from inside a grapple
 * are at -4.
 *
 * Bodies: everyone can bite, and may hold on; what a bite reaches depends on
 * size, and a much larger biter can pin a standing foe; extra arms and legs
 * help grappling.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import {
  GRAPPLED_ATTACK,
  PAINS,
  biteAllows,
  biteCanPin,
  biteDamage,
  extraArmBonus,
  extraLegBonus,
  insideGrapple,
  kissTheWallBonus,
  kissTheWallLocations,
  morePinArms,
  painFor,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.GrabSmash.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.GrabSmash.${key}`, data);

/** This turn's grapple, by an All-Out Attack, and where it holds. */
const GRABBED = "ma-grabbed-this-turn";
/** A thrust that hit inside that grapple, owed its damage bonus. */
const SMASH = "ma-smash";
/** A bite that means to hold on. */
const BITE_HOLD = "ma-bite-hold";
const BITE_PENDING = "ma-bite-pending";
const BITE_GRAPPLE = "ma-bite-grapple";
const PAIN = "ma-cause-pain";
const BITE_MODE = `${MODULE_ID}.ma-bite`;

const traitLevels = (actor: any, pattern: RegExp): number => [...(actor?.items ?? [])]
  .filter((item: any) => item.type === "trait" && pattern.test(String(item.name ?? "")))
  .reduce((sum: number, item: any) => sum + (Number(item.system?.levels) || 1), 0);
const armsOf = (actor: any) => 2 + traitLevels(actor, /^extra arms?\b/i);
const legsOf = (actor: any) => 2 + traitLevels(actor, /^extra legs?\b/i);
const hasTeeth = (actor: any) => traitLevels(actor, /^(sharp teeth|teeth|fangs|sharp beak|weak bite)\b/i) > 0;
const bornBiter = (actor: any) => Math.min(3, traitLevels(actor, /^born biter\b/i));
const smOf = (actor: any) => Number(actor?.system?.sm) || 0;

/** Registers both switches' hooks, the bite, and the grapple actions. */
export function readyGrabAndSmash(api: GWorldApi, smash: () => boolean, bodies: () => boolean): void {
  // ── all-out grapple and strike (p. 118) ──
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const tags: string[] = context?.tags ?? [];
    const actor = context?.actor;
    if (!actor?.isOwner || !tags.includes("grapple") || !context.outcome?.success) return;
    if (smash() && actor.system?.maneuver === "allOutAttack") {
      const location = tags.find((t) => t !== "grapple" && t !== "attack") ?? "torso";
      void api.combat.setCombatState(actor, MODULE_ID, GRABBED, location, "turn");
    }
  });
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!context?.actor || context.rollType !== "attack") return;
    const actor = context.actor;
    const grapple = api.combat.grapple(actor);
    // Attacking from inside a grapple (p. 119).
    if (smash() && grapple && !grapple.holding && !context.ranged) context.modifiers.push({ label: L("FromInside"), value: GRAPPLED_ATTACK });
    // A thrust into this turn's All-Out grapple.
    const grabbed = api.combat.getCombatState(actor, MODULE_ID, GRABBED) as string | undefined;
    if (smash() && grabbed && grapple?.holding && !context.ranged && (context.dataset?.damageBase === "thr" || (context.dataset?.unarmed === "1" && !context.dataset?.damageBase))) {
      // A punch, kick or knee is a thrust, though its row names no base.
      const target = context.calledShot ?? { hitLocation: "torso", addonLocation: null };
      // Where the grapple holds now, which a lock may have moved since it was made.
      if (insideGrapple(String(grapple.hitLocation ?? grabbed), target)) void api.combat.setCombatState(actor, MODULE_ID, SMASH, true, "turn");
    }
    // A bite (p. 115): what it may reach, and whether it holds on.
    if (bodies() && context.mode?.derived === BITE_MODE) {
      const foe = context.targets?.[0] ?? null;
      const lead = smOf(actor) + bornBiter(actor) - smOf(foe);
      if (context.calledShot && !biteAllows(lead, context.calledShot)) {
        context.refusal = L("BiteCantReach");
        return;
      }
      if (context.options?.[`${MODULE_ID}.${BITE_HOLD}`] && foe) {
        void api.combat.setCombatState(actor, MODULE_ID, BITE_PENDING, { foe: String(foe.uuid), hitLocation: context.calledShot?.hitLocation ?? "torso", lead }, "turn");
      }
    }
  });
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!smash() || !context?.actor || context.mode?.ranged || !api.combat.getCombatState(context.actor, MODULE_ID, SMASH)) return;
    const dice = api.rules.parseDiceAdds(String(context.formula ?? ""))?.dice ?? 0;
    context.modifiers.push({ label: L("Smash"), value: api.rules.strongAttackDamageBonus(dice) });
    void api.combat.clearCombatState(context.actor, MODULE_ID, SMASH);
  });

  // ── kiss the wall (p. 118) ──
  const skillOf = (actor: any, names: string[]) => names
    .map((name) => ({ name, level: name === "DX" ? api.actors.attribute(actor, "DX") : api.actors.skillLevel(actor, name) }))
    .filter((o): o is { name: string; level: number } => typeof o.level === "number")
    .sort((a, b) => b.level - a.level)[0] ?? null;
  api.combat.registerGrappleAction({
    module: MODULE_ID,
    key: "ma-kiss-the-wall",
    label: L("KissTheWall"),
    applies: (grapple, actor) => smash() && grapple.holding && grapple.hands >= 2 && ["standing", "kneeling"].includes(String(actor?.system?.posture ?? "standing")),
    run: async ({ actor, foe }) => {
      if (!foe) return;
      const lying = String(foe.system?.posture ?? "standing") !== "standing";
      const locations = kissTheWallLocations(lying);
      const options = locations.map((loc) => `<option value="${loc}">${game.i18n.localize(`GWORLD.HitLocation.${loc}`)}</option>`).join("");
      const asked = await foundry.applications.api.DialogV2.prompt({
        window: { title: L("KissTheWall") },
        content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
          <label style="display:flex;justify-content:space-between;gap:8px"><span>${L("Location")}</span><select name="loc">${options}</select></label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="hard" checked> <span>${L("HardSurface")}</span></label></div>`,
        ok: {
          label: L("KissTheWall"),
          callback: (_e: Event, button: HTMLElement) => {
            const form = button.closest<HTMLElement>(".application");
            return { loc: form?.querySelector<HTMLSelectElement>('[name="loc"]')?.value ?? locations[0], hard: form?.querySelector<HTMLInputElement>('[name="hard"]')?.checked === true };
          },
        },
        rejectClose: false,
      }) as { loc: string; hard: boolean } | null;
      if (!asked) return;
      const skill = skillOf(actor, ["DX", "Brawling", "Sumo Wrestling", "Wrestling"]);
      if (!skill) return;
      const penalty = Number((api.rules as any).HIT_LOCATIONS?.[asked.loc]?.toHit) || 0;
      const outcome: any = await api.roll.success({
        actor,
        base: skill.level,
        kind: "attack",
        label: F("KissLabel", { foe: String(foe.name ?? ""), location: game.i18n.localize(`GWORLD.HitLocation.${asked.loc}`) }),
        ...(skill.name === "DX" ? {} : { skill: skill.name }),
        modifiers: penalty ? [{ label: game.i18n.localize(`GWORLD.HitLocation.${asked.loc}`), value: penalty }] : [],
        unarmed: true,
      } as any);
      if (!outcome) return;
      const thrust = String(api.actors.derived(actor)?.thrust ?? "1d-2");
      const dx = api.actors.attribute(actor, "DX") ?? 10;
      const wrestle = Math.max(api.actors.skillLevel(actor, "Wrestling") ?? -99, api.actors.skillLevel(actor, "Sumo Wrestling") ?? -99);
      const stBonus = wrestle >= dx + 2 ? 2 : wrestle >= dx + 1 ? 1 : 0;
      const bonus = kissTheWallBonus(asked.hard) + stBonus;
      if (outcome.criticalFailure) {
        await api.combat.endGrapple(actor);
        await api.roll.damage({ actor, label: L("KissSlip"), formula: thrust, damageType: "cr", ...(bonus ? { modifiers: [{ label: L("KissTheWall"), value: bonus }] } : {}), calledShot: { hitLocation: "face" } } as any);
        return;
      }
      if (!outcome.success) return;
      await api.roll.damage({ actor, label: F("KissDamage", { foe: String(foe.name ?? "") }), formula: thrust, damageType: "cr", ...(bonus ? { modifiers: [{ label: L("KissTheWall"), value: bonus }] } : {}), calledShot: { hitLocation: asked.loc } } as any);
    },
  });

  // ── pain in close combat (p. 119) ──
  const inflictPain = async (victim: any, points: number) => {
    const pain = painFor(points);
    for (const other of PAINS) if (other !== pain) await api.actors.removeCondition(victim, other);
    if (!pain) return null;
    await api.actors.applyCondition(victim, { key: pain, duration: { turns: 1 } });
    return pain;
  };
  api.combat.registerGrappleAction({
    module: MODULE_ID,
    key: "ma-inflict-pain",
    label: L("InflictPain"),
    applies: (grapple) => smash() && grapple.holding,
    run: async ({ actor, foe }) => {
      if (!foe) return;
      const points = await foundry.applications.api.DialogV2.prompt({
        window: { title: L("InflictPain") },
        content: `<div class="gworld"><p>${L("PainHint")}</p><label style="display:flex;justify-content:space-between;gap:8px"><span>${L("Points")}</span><input type="number" name="points" value="0" min="0" step="1" style="width:80px"></label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="choke"> <span>${L("PainChokes")}</span></label></div>`,
        ok: {
          label: L("InflictPain"),
          callback: (_e: Event, button: HTMLElement) => {
            const form = button.closest<HTMLElement>(".application");
            return { points: Number(form?.querySelector<HTMLInputElement>('[name="points"]')?.value) || 0, choke: form?.querySelector<HTMLInputElement>('[name="choke"]')?.checked === true };
          },
        },
        rejectClose: false,
      }) as { points: number; choke: boolean } | null;
      if (!points) return;
      if (points.choke) await api.combat.setCombatState(foe, MODULE_ID, PAIN, String(actor.uuid), "combat");
      else if (!foe.isOwner) return;
      if (points.points > 0) {
        const pain = await inflictPain(foe, points.points);
        ui.notifications?.info(pain ? F("Pained", { foe: String(foe.name ?? ""), pain: game.i18n.localize(`GWORLD.Affliction.Name.${pain}`) }) : F("NoPain", { foe: String(foe.name ?? "") }));
      }
    },
  });
  // A strangle chosen to hurt rather than injure: its points become pain (p. 119).
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const victim = context?.actor;
    if (!smash() || !victim || context.item || !context.damage || context.damage.type !== "cr") return;
    if (!api.combat.getCombatState(victim, MODULE_ID, PAIN) || !api.combat.grapple(victim)) return;
    const points = Math.max(0, Number(context.damage.basicDamage) || 0);
    context.damage.basicDamage = 0;
    void inflictPain(victim, points);
  });

  // ── teeth (p. 115) ──
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: "ma-bite",
    label: L("Bite"),
    kind: "melee",
    self: true,
    applies: (_item: unknown, actor: any) => bodies() && !hasTeeth(actor),
    mode: (_item: unknown, _actor: unknown, helpers: any) => {
      const dx = Number(helpers.attribute?.("DX")) || 10;
      const brawling = helpers.skillLevel("Brawling");
      const thrust = api.rules.parseDiceAdds(String(helpers.damage?.("thr", 0) ?? "1d-2")) ?? { dice: 1, adds: -2 };
      const damage = api.rules.formatDiceAdds(biteDamage(thrust, brawling === null ? null : brawling - dx) as any);
      const useBrawling = brawling !== null && brawling > dx;
      return { skillName: useBrawling ? "Brawling" : "DX", skillLevel: useBrawling ? brawling : dx, damage, damageType: "cr", reach: "C", parry: null, naturalKey: "bite", unarmed: true, damageRollable: true };
    },
  });
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: BITE_HOLD,
    label: L("BiteHold"),
    attack: "melee",
    available: (context) => bodies() && !context.item,
    apply: () => null,
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, async (context: any) => {
    const actor = context?.actor;
    const pending = actor ? (api.combat.getCombatState(actor, MODULE_ID, BITE_PENDING) as { foe: string; hitLocation: string; lead: number } | undefined) : undefined;
    if (!pending || !(context.tags ?? []).includes("attack")) return;
    await api.combat.clearCombatState(actor, MODULE_ID, BITE_PENDING);
    if (!context.outcome?.success || !bodies()) return;
    const foe = await (globalThis as any).fromUuid?.(pending.foe);
    if (!foe) return;
    // A bite holds as one hand, or as two for a biter a size or two larger (p. 115).
    await api.combat.beginGrapple({ grappler: actor, victim: foe, hands: pending.lead >= 1 ? 2 : 1, hitLocation: pending.hitLocation });
    await api.combat.setCombatState(actor, MODULE_ID, BITE_GRAPPLE, pending.lead, "combat");
  });
  Hooks.on(api.combat.hooks.grappleMove, (context: any) => {
    if (!bodies() || context?.move !== "pin") return;
    const lead = Number(api.combat.getCombatState(context.actor, MODULE_ID, BITE_GRAPPLE));
    const grapple = api.combat.grapple(context.actor);
    if (grapple?.holding && grapple.hitLocation === "torso" && biteCanPin(lead)) context.waiveRequirements = true;
  });

  // ── extra arms and legs (p. 114) ──
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!bodies() || !(context?.tags ?? []).includes("grapple") || !(context.tags ?? []).includes("attack")) return;
    const bonus = extraArmBonus(armsOf(context.actor));
    if (bonus) context.modifiers.push({ label: L("ExtraArms"), value: bonus });
  });
  Hooks.on(api.combat.hooks.grappleContest, (context: any) => {
    if (!bodies() || !context) return;
    const { move, actor, foe } = context;
    if (move === "breakFree") {
      const mine = extraArmBonus(armsOf(actor));
      const theirs = extraArmBonus(armsOf(foe));
      if (mine) context.first.modifiers.push({ label: L("ExtraArms"), value: mine });
      if (theirs) context.second.modifiers.push({ label: L("ExtraArms"), value: theirs });
    }
    if (move === "pin") {
      const more = morePinArms(armsOf(actor), armsOf(foe));
      if (more) context.first.modifiers.push({ label: L("MoreArms"), value: more });
      const resist = morePinArms(armsOf(foe), armsOf(actor));
      if (resist) context.second.modifiers.push({ label: L("MoreArms"), value: resist });
    }
    if (move === "takedown") {
      const legs = extraLegBonus(legsOf(foe));
      if (legs) context.second.modifiers.push({ label: L("ExtraLegs"), value: legs });
    }
  });
}
