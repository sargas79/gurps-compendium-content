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
import { offerFrightCheck } from "../cinematic/index.js";
import { attackKind } from "../posture.js";
import {
  GRAPPLED_ATTACK,
  RAM_SKILLS,
  TWOFER_PENALTY,
  bittenOff,
  bittenPart,
  bornBiterTargeting,
  clumsyGrappling,
  horizontalDamagePerDie,
  horizontalHit,
  horizontalRefuses,
  lameCloseCombat,
  ramDamageBonus,
  needsFingers,
  worryCap,
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
/** What worrying has done to each part so far, by the grappled location. */
const WORRIED = "ma-worried";
/** The finer location a bite holds, beside the grapple's own. */
const BITE_LOCATION = "ma-bite-location";
/** The shock a fighter is feeling, for a break free attempted at once (p. 116). */
const SHOCK = "ma-shock";
/** True while a fighter has already grappled somebody this turn (p. 114). */
const GRAPPLED_THIS_TURN = "ma-grappled-turn";
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
const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);
const fromUuid = (uuid: unknown) => (globalThis as any).fromUuidSync?.(String(uuid ?? "")) ?? null;
/** What marks a worrying bite's damage, so the card's result can be followed (API 1.43.0). */
const WORRY_SOURCE = "ma-worry";

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
        void api.combat.setCombatState(actor, MODULE_ID, BITE_PENDING, { foe: String(foe.uuid), hitLocation: context.calledShot?.hitLocation ?? "torso", addonLocation: context.calledShot?.addonLocation ?? null, lead }, "turn");
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
      // A twofer: the grappled foe goes into another one, who defends (p. 114).
      const other = [...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).find((a: any) => a && a.uuid !== foe.uuid && a.uuid !== actor.uuid) ?? null;
      const locations = kissTheWallLocations(lying);
      const options = locations.map((loc) => `<option value="${loc}">${game.i18n.localize(`GWORLD.HitLocation.${loc}`)}</option>`).join("");
      const asked = await foundry.applications.api.DialogV2.prompt({
        window: { title: L("KissTheWall") },
        content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
          <label style="display:flex;justify-content:space-between;gap:8px"><span>${L("Location")}</span><select name="loc">${options}</select></label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="hard" checked> <span>${L("HardSurface")}</span></label>
          ${other ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="twofer"> <span>${F("Twofer", { foe: String(other.name ?? "") })}</span></label>
          <label style="display:flex;justify-content:space-between;gap:8px"><span>${L("TwoferLocation")}</span><select name="other">${options}</select></label>` : ""}</div>`,
        ok: {
          label: L("KissTheWall"),
          callback: (_e: Event, button: HTMLElement) => {
            const form = button.closest<HTMLElement>(".application");
            return {
              loc: form?.querySelector<HTMLSelectElement>('[name="loc"]')?.value ?? locations[0],
              hard: form?.querySelector<HTMLInputElement>('[name="hard"]')?.checked === true,
              twofer: form?.querySelector<HTMLInputElement>('[name="twofer"]')?.checked === true,
              other: form?.querySelector<HTMLSelectElement>('[name="other"]')?.value ?? locations[0],
            };
          },
        },
        rejectClose: false,
      }) as { loc: string; hard: boolean; twofer: boolean; other: string } | null;
      if (!asked) return;
      // Into another fighter: the worst of the two hit location penalties, and
      // his own defense, with the body counting as a weapon of the first victim's ST (p. 114).
      const twofer = asked.twofer && other ? other : null;
      const penaltyOf = (loc: string) => Number((api.rules as any).HIT_LOCATIONS?.[loc]?.toHit) || 0;
      if (twofer) asked.loc = penaltyOf(asked.other) < penaltyOf(asked.loc) ? asked.other : asked.loc;
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
      if (!twofer) return;
      // The second fighter defends, and takes the same blow if he fails; the
      // hard-surface bonus belongs to skulls knocked together only.
      const weight = Number(api.actors.attribute(foe, "ST")) || 10;
      await ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
        content: `<div class="gworld gworld-chat"><div class="gc-result">${foundry.utils.escapeHTML(F("TwoferNote", { victim: String(twofer.name ?? ""), weight }))}</div></div>`,
      });
      await api.roll.damage({ actor, label: F("KissDamage", { foe: String(twofer.name ?? "") }), formula: thrust, damageType: "cr", ...(bonus ? { modifiers: [{ label: L("KissTheWall"), value: bonus }] } : {}), calledShot: { hitLocation: asked.loc } } as any);
    },
  });

  // ── All-Out Grapple and Strike (p. 114) ──
  // Taking hold of a second foe in the same turn is a Dual-Weapon Attack.
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!smash() || !(context?.tags ?? []).includes("grapple") || !(context.tags ?? []).includes("attack")) return;
    if (!api.combat.getCombatState(context.actor, MODULE_ID, GRAPPLED_THIS_TURN)) return;
    context.modifiers.push({ label: L("RamTogether.DualWeapon"), value: TWOFER_PENALTY });
  });
  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    if (!smash() || !(context?.tags ?? []).includes("grapple") || !(context.tags ?? []).includes("attack")) return;
    if (!context.actor?.isOwner) return;
    void api.combat.setCombatState(context.actor, MODULE_ID, GRAPPLED_THIS_TURN, true, "turn");
  });
  /** The foes a fighter has hold of, as actors, oldest first. */
  const heldBy = (actor: any) => ((api.combat as any).grapples?.(actor) ?? [])
    .filter((grapple: any) => grapple.holding)
    .map((grapple: any) => ({ grapple, foe: fromUuid(grapple.foe) }))
    .filter((held: any) => held.foe);
  api.combat.registerGrappleAction({
    module: MODULE_ID,
    key: "ma-ram-together",
    label: L("RamTogether.Ram"),
    applies: (grapple: any, actor: any) => smash() && grapple.holding && heldBy(actor).length >= 2,
    run: async ({ actor }: { actor: any }) => {
      const [first, second] = heldBy(actor);
      if (!first || !second) return;
      const skill = RAM_SKILLS
        .map((name) => ({ name, level: name === "DX" ? api.actors.attribute(actor, "DX") : api.actors.skillLevel(actor, name) }))
        .filter((option): option is { name: string; level: number } => typeof option.level === "number")
        .sort((a, b) => b.level - a.level)[0];
      if (!skill) return;
      const outcome: any = await api.roll.success({
        actor,
        base: skill.level,
        kind: "attack",
        label: F("RamTogether.RamLabel", { first: String(first.foe.name ?? ""), second: String(second.foe.name ?? "") }),
        ...(skill.name === "DX" ? {} : { skill: skill.name }),
        unarmed: true,
      } as any);
      if (!outcome?.success) return;
      // Each of them defends as usual; the blow lands only where both fail.
      await ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
        content: `<div class="gworld gworld-chat"><div class="gc-result">${foundry.utils.escapeHTML(F("RamTogether.RamNote", { first: String(first.foe.name ?? ""), second: String(second.foe.name ?? "") }))}</div></div>`,
      });
      const thrust = String(api.actors.derived(actor)?.thrust ?? "1d-2");
      const bonus = ramDamageBonus([first.grapple.hitLocation, second.grapple.hitLocation]);
      for (const held of [first, second]) {
        await api.roll.damage({
          actor,
          label: F("RamTogether.RamDamage", { foe: String(held.foe.name ?? "") }),
          formula: thrust,
          damageType: "cr",
          modifiers: [
            { label: L("RamTogether.Ram"), value: -1 },
            ...(bonus ? [{ label: L("RamTogether.Skulls"), value: bonus }] : []),
          ],
          calledShot: { hitLocation: String(held.grapple.hitLocation ?? "torso") },
        } as any);
      }
    },
  } as any);

  // ── worrying (p. 115) ──
  const hpOf = (actor: any) => Number(actor?.system?.hp?.max) || 10;
  api.combat.registerGrappleAction({
    module: MODULE_ID,
    key: "ma-worry",
    label: L("Worry"),
    applies: (grapple, actor) => bodies() && grapple.holding && api.combat.getCombatState(actor, MODULE_ID, BITE_GRAPPLE) !== undefined,
    run: async ({ actor, foe, grapple }) => {
      if (!foe) return;
      const rows = (api.actors.derived(actor)?.melee ?? []) as any[];
      const bite = rows.find((row) => row.derivedMode === BITE_MODE || /^bite\b/i.test(String(row.name ?? "")));
      if (!bite?.damage) return void ui.notifications?.warn(L("WorryNoBite"));
      const location = String(grapple.hitLocation ?? "torso");
      const addon = String(api.combat.getCombatState(actor, MODULE_ID, BITE_LOCATION) ?? "") || null;
      const part = bittenPart(location, addon);
      const cap = worryCap(part, hpOf(foe));
      // It always hits: only the damage is rolled (p. 115).
      await api.roll.damage({
        actor,
        label: F("WorryLabel", { foe: String(foe.name ?? ""), part: game.i18n.localize(`GWORLD.HitLocation.${location}`) }),
        formula: String(bite.damage),
        damageType: String(bite.damageType ?? "cr"),
        calledShot: { hitLocation: location, ...(addon ? { addonLocation: addon } : {}) },
        source: WORRY_SOURCE,
        ...(cap === null ? {} : { notes: [F("WorryCap", { cap })] }),
      } as any);
    },
  });
  // What worrying has done so far, and the part it takes off (p. 115).
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const victim = context?.actor;
    if (!bodies() || !victim || !isActiveGm() || context?.damage?.source !== WORRY_SOURCE) return;
    const result = context.result;
    const part = bittenPart(String(result?.hitLocation ?? ""), String(result?.addonLocation ?? "") || null);
    if (part === "other") return;
    const worried = { ...((api.combat.getCombatState(victim, MODULE_ID, WORRIED) as Record<string, number> | undefined) ?? {}) };
    // A key with no dots in it: a stored object nests them into paths.
    const key = `${result?.hitLocation ?? ""}-${String(result?.addonLocation ?? "").split(".").pop() ?? ""}`;
    const total = (Number(worried[key]) || 0) + (Number(result?.injury) || 0) + (Number(result?.excessLost) || 0);
    worried[key] = total;
    void api.combat.setCombatState(victim, MODULE_ID, WORRIED, worried, "combat");
    const off = bittenOff(part, total, hpOf(victim));
    if (!off) return;
    ui.notifications?.info(F("BittenOff", { victim: String(victim.name ?? ""), part: L(`Parts.${off}`) }));
    void ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: victim }),
      content: `<div class="gworld gworld-chat"><div class="gc-result">${foundry.utils.escapeHTML(F("BittenOffCard", { victim: String(victim.name ?? ""), part: L(`Parts.${off}`) }))}</div></div>`,
      whisper: [...((game as any).users ?? [])].filter((u: any) => u.isGM).map((u: any) => u.id),
    });
    // A part bitten off is as gruesome as a dismemberment (p. 132).
    offerFrightCheck(victim);
  });

  // ── shock, and breaking free at once (p. 116) ──
  Hooks.on(api.combat.hooks.afterDamage, (context: any) => {
    const victim = context?.actor;
    const shock = Number(context?.result?.consequences?.shock) || 0;
    if (!bodies() || !victim?.isOwner || !shock) return;
    // It is gone before the wounded fighter's next turn, so it is kept for this one.
    void api.combat.setCombatState(victim, MODULE_ID, SHOCK, shock, "turn");
  });
  Hooks.on(api.combat.hooks.grappleContest, (context: any) => {
    if (!bodies() || context?.move !== "breakFree") return;
    const first = Number(api.combat.getCombatState(context.actor, MODULE_ID, SHOCK)) || 0;
    const second = Number(api.combat.getCombatState(context.foe, MODULE_ID, SHOCK)) || 0;
    if (first) context.first.modifiers.push({ label: L("Shock"), value: first });
    if (second) context.second.modifiers.push({ label: L("Shock"), value: second });
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
    const pending = actor ? (api.combat.getCombatState(actor, MODULE_ID, BITE_PENDING) as { foe: string; hitLocation: string; addonLocation: string | null; lead: number } | undefined) : undefined;
    if (!pending || !(context.tags ?? []).includes("attack")) return;
    await api.combat.clearCombatState(actor, MODULE_ID, BITE_PENDING);
    if (!context.outcome?.success || !bodies()) return;
    const foe = await (globalThis as any).fromUuid?.(pending.foe);
    if (!foe) return;
    // A bite holds as one hand, or as two for a biter a size or two larger (p. 115).
    await api.combat.beginGrapple({ grappler: actor, victim: foe, hands: pending.lead >= 1 ? 2 : 1, hitLocation: pending.hitLocation });
    await api.combat.setCombatState(actor, MODULE_ID, BITE_GRAPPLE, pending.lead, "combat");
    // The finer location the teeth are in, which the system's grapple doesn't hold.
    await api.combat.setCombatState(actor, MODULE_ID, BITE_LOCATION, pending.addonLocation ?? "", "combat");
  });
  Hooks.on(api.combat.hooks.grappleMove, (context: any) => {
    if (!bodies() || context?.move !== "pin") return;
    const lead = Number(api.combat.getCombatState(context.actor, MODULE_ID, BITE_GRAPPLE));
    const grapple = api.combat.grapple(context.actor);
    if (grapple?.holding && grapple.hitLocation === "torso" && biteCanPin(lead)) context.waiveRequirements = true;
  });

  // ── the bodies that fight differently (pp. 115, 119-120) ──
  const traitNamed = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((i: any) => i.type === "trait" && pattern.test(String(i.name ?? "")));
  const horizontal = (actor: any) => traitNamed(actor, /^horizontal\b/i);
  const clawed = (actor: any) => traitNamed(actor, /^claws\b/i);
  const diffuse = (actor: any) => traitNamed(actor, /^injury tolerance \(diffuse\)/i);
  const homogenous = (actor: any) => traitNamed(actor, /^injury tolerance \(homogenous\)/i);
  const noFineManipulators = (actor: any) => traitNamed(actor, /^no fine manipulators\b/i);
  const oneHandOnly = (actor: any) => traitNamed(actor, /^one (arm|hand)\b/i);
  const spiny = (actor: any) => traitNamed(actor, /^spines\b/i);
  const lameKind = (actor: any): "crippledLegs" | "missingLegs" | "legless" | null => {
    if (traitNamed(actor, /^lame \(legless\)/i) || traitNamed(actor, /^no legs\b/i)) return "legless";
    if (traitNamed(actor, /^lame \(missing legs\)/i)) return "missingLegs";
    if (traitNamed(actor, /^lame \(crippled legs\)/i)) return "crippledLegs";
    return null;
  };
  const standing = (actor: any) => String(actor?.system?.posture ?? "standing") === "standing";

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    if (!bodies() || !context?.actor) return;
    const name = `${String(context.dataset?.rollLabel ?? "")}`.trim();
    const target = (context.targets ?? [])[0] ?? null;
    const location = String(context.calledShot?.hitLocation ?? "torso");
    // A Born Biter's jaw and nose are that much easier to find (p. 115).
    const addon = String(context.calledShot?.addonLocation ?? "");
    if (target && /\.ma-(jaw|nose)$/.test(addon)) {
      const bonus = bornBiterTargeting(traitLevels(target, /^born biter\b/i));
      if (bonus) context.modifiers.push({ label: L("BornBiter"), value: bonus });
    }
    if (horizontal(context.actor)) {
      if (horizontalRefuses(name)) {
        context.refusal = F("HorizontalNo", { attack: name });
        return;
      }
      const line = target && standing(target) ? horizontalHit(location, smOf(context.actor) - smOf(target)) : 0;
      if (line) context.modifiers.push({ label: L("Horizontal"), value: line });
    }
    // Clumsy hands make a grapple that needs fingers impossible, and the rest awkward (p. 120).
    if (noFineManipulators(context.actor)) {
      if (needsFingers(name)) {
        context.refusal = F("NoFingers", { attack: name });
        return;
      }
      if (clumsyGrappling(name)) context.modifiers.push({ label: L("NoFineManipulators"), value: -4 });
    }
    // Crippled or missing legs weigh on every DX-based roll in close combat (p. 120).
    const lame = lameCloseCombat(lameKind(context.actor), standing(context.actor));
    if (lame.rolls && context.actor.system?.conditions?.closeCombat === true) context.modifiers.push({ label: L("Lame"), value: lame.rolls });
  });

  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!bodies() || !context?.actor || !horizontal(context.actor)) return;
    const kind = attackKind(String(context.label ?? ""), null);
    const perDie = horizontalDamagePerDie(kind, clawed(context.actor));
    if (!perDie) return;
    const dice = Number((api.rules as any).parseDiceAdds?.(String(context.formula ?? ""))?.dice) || 0;
    if (dice) context.modifiers.push({ label: L("Horizontal"), value: perDie * dice });
  });

  // Diffuse bodies cannot be grappled at all, and homogenous ones take no injury
  // from locks and throws (p. 120).
  Hooks.on(api.combat.hooks.grappleMove, (context: any) => {
    if (!bodies() || !diffuse(context?.foe)) return;
    context.refusal = F("Diffuse", { foe: String(context.foe?.name ?? "") });
  });
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    if (!bodies() || !homogenous(context?.actor)) return;
    if (!/lock|throw|wrench|neck snap/i.test(String(context.damage?.label ?? ""))) return;
    context.damage.basicDamage = 0;
    ui.notifications?.info(F("Homogenous", { name: String(context.actor?.name ?? "") }));
  });

  Hooks.on(api.combat.hooks.grappleContest, (context: any) => {
    if (!bodies() || !context) return;
    const { move, actor, foe } = context;
    // One arm or one hand: half ST to choke, and a two-handed foe pins more easily (p. 120).
    if (move === "choke" && oneHandOnly(actor)) {
      context.first.base = Math.floor(Number(context.first.base) / 2);
      context.first.modifiers.push({ label: L("OneArm"), value: 0 });
    }
    if (move === "pin") {
      if (oneHandOnly(foe) && !oneHandOnly(actor)) context.first.modifiers.push({ label: L("OneArmFoe"), value: 3 });
      if (oneHandOnly(actor) && !oneHandOnly(foe)) context.second.modifiers.push({ label: L("OneArmFoe"), value: 3 });
    }
    // Legs that are gone leave a fighter easy to take down (p. 120).
    if (move === "takedown") {
      const lame = lameCloseCombat(lameKind(foe), standing(foe));
      if (lame.foeKnockdown) context.first.modifiers.push({ label: L("Lame"), value: lame.foeKnockdown });
    }
  });

  // Spines injure whoever holds on (p. 120).
  Hooks.on(api.combat.hooks.turnStart, (_combat: any, combatant: any) => {
    const actor = combatant?.actor;
    if (!bodies() || !isActiveGm() || !actor) return;
    const grapple = api.combat.grapple(actor);
    const foe = grapple?.foe ? fromUuid(grapple.foe) : null;
    if (!foe || !spiny(foe)) return;
    ui.notifications?.info(F("Spines", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }));
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
