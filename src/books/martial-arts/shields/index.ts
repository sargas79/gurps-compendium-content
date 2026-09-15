/**
 * Shoves and slams with weapons, and striking at or grabbing shields, at the
 * table (GURPS Martial Arts pp. 112-113).
 *
 * The weapon shoves and long-weapon slams are the system's slam and shove,
 * registered as variants: weapon skill to hit, reach or Defense Bonus added,
 * the weapon taking the slammer's damage, two foes at -4 each. Shields and
 * cloaks become targets for striking at weapons, at -4 plus DB, with no parry
 * and no DB against the blow. Grabbing one is a button on the Combat tab; the
 * victim loses Block and DB until they break free.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { gripOf } from "../readying/index.js";
import { isDefensive } from "../grips/rules.js";
import {
  NECK,
  TWO_FOES,
  breakFreeModifiers,
  canCrossCheck,
  canKnockAway,
  canShoveWith,
  grabShieldPenalty,
  longestReach,
  shieldStrikePenalty,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Shields.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Shields.${key}`, data);

/** Who has hold of this character's shield: set on the victim, cleared when they break free. */
const GRAB_FLAG = "shieldGrab";
const GRAB_CONDITION = "ma-shield-grabbed";

interface Grab { grabber: string; shieldId: string; twoHanded: boolean; strapped: boolean; conditionId: string }

const readyShield = (actor: any) => [...(actor?.items ?? [])].find((item: any) => item.type === "shield" && item.system?.equipped) ?? null;
const shieldSkill = (shield: any) => String(shield?.system?.skill ?? "");
const grabOf = (actor: any): Grab | null => (actor?.getFlag?.(MODULE_ID, GRAB_FLAG) as Grab | undefined) ?? null;

/** Registers the variants, the strike targets, the grab and its limits. */
export function readyShoves(api: GWorldApi, on: () => boolean): void {
  const meleeRows = (actor: any): any[] => ((api.actors.derived(actor)?.melee ?? []) as any[])
    .filter((row) => row.itemId && typeof row.skillLevel === "number" && row.usable !== false && !row.unready);
  const best = (rows: any[]) => rows.sort((a, b) => b.skillLevel - a.skillLevel)[0] ?? null;

  /** The best ready weapon to shove with, or the ready shield. */
  const shover = (actor: any) => {
    const shield = readyShield(actor);
    const row = best(meleeRows(actor).filter((r) => canShoveWith(String(r.skillName ?? ""), String(r.reach ?? ""))));
    const shieldLevel = shield ? api.actors.skillLevel(actor, shieldSkill(shield)) : null;
    if (shield && shieldLevel !== null && (!row || shieldLevel >= row.skillLevel)) {
      return { name: String(shield.name), skill: shieldSkill(shield), level: shieldLevel, bonus: Number(shield.system?.db) || 0, oneHanded: true };
    }
    return row ? { name: String(row.name), skill: String(row.skillName), level: Number(row.skillLevel), bonus: longestReach(String(row.reach)), oneHanded: row.twoHanded !== true } : null;
  };
  /** The best ready long weapon to cross-check with. */
  const crossChecker = (actor: any) => best(meleeRows(actor).filter((r) => {
    const item = actor.items.get(r.itemId);
    return canCrossCheck({ skill: String(r.skillName ?? ""), reach: String(r.reach ?? ""), twoHanded: r.twoHanded === true, defensiveGrip: item ? isDefensive(gripOf(api, item)) : false });
  }));

  // ── shoves with weapons (p. 112) ──
  api.combat.registerSlam({
    module: MODULE_ID, key: "ma-weapon-shove", label: L("WeaponShove"), kind: "shove",
    available: (actor) => on() && shover(actor) !== null,
    prepare: (actor) => {
      const w = shover(actor);
      return w ? { skill: { name: w.skill, level: w.level }, damageBonus: w.bonus, oneHanded: w.oneHanded, notes: [F("With", { weapon: w.name })] } : null;
    },
  });
  api.combat.registerSlam({
    module: MODULE_ID, key: "ma-long-shove", label: L("LongShove"), kind: "shove",
    available: (actor) => on() && crossChecker(actor) !== null,
    prepare: (actor) => {
      const r = crossChecker(actor);
      return r ? { skill: { name: String(r.skillName), level: Number(r.skillLevel) }, toHit: TWO_FOES, damageBonus: longestReach(String(r.reach)), oneHanded: false, foes: 2, notes: [F("With", { weapon: r.name })] } : null;
    },
  });

  // ── slams with long weapons (p. 112) ──
  const crossCheck = (key: string, label: string, extra: { toHit?: number; foes?: 1 | 2; note?: string }) => api.combat.registerSlam({
    module: MODULE_ID, key, label, kind: "slam",
    available: (actor) => on() && crossChecker(actor) !== null,
    prepare: (actor) => {
      const r = crossChecker(actor);
      if (!r) return null;
      return {
        skill: { name: String(r.skillName), level: Number(r.skillLevel) },
        damageBonus: longestReach(String(r.reach)),
        bearer: String(r.name),
        ...(extra.toHit ? { toHit: extra.toHit } : {}),
        ...(extra.foes ? { foes: extra.foes } : {}),
        notes: extra.note ? [extra.note] : [],
      };
    },
  });
  crossCheck("ma-cross-check", L("CrossCheck"), {});
  crossCheck("ma-cross-check-neck", L("CrossCheckNeck"), { toHit: NECK, note: L("NeckNote") });
  crossCheck("ma-cross-check-two", L("CrossCheckTwo"), { toHit: TWO_FOES, foes: 2 });

  // ── striking at shields (pp. 112-113) ──
  Hooks.on(api.combat.hooks.weaponTargets, (context: any) => {
    if (!on() || !context?.foe) return;
    const shields = [...(context.foe.items ?? [])].filter((item: any) => item.type === "shield" && item.system?.equipped);
    for (const shield of shields) {
      const target = {
        id: String(shield.id),
        name: String(shield.name),
        penalty: shieldStrikePenalty(Number(shield.system?.db) || 0),
        canDisarm: canKnockAway(shieldSkill(shield)),
        noParry: true,
        noDefenseBonus: true,
        disarmPenaltyForAll: true,
      };
      context.targets = [...context.targets.filter((t: any) => t.id !== target.id), target];
    }
  });

  // ── grabbing shields (p. 113) ──
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!on() || !grabOf(context?.defender)) return;
    for (const choice of context.choices ?? []) {
      if (choice.key === "block" && choice.available) Object.assign(choice, { available: false, refusal: L("ShieldHeld") });
    }
  });
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-shields",
    sheet: "character",
    tab: "combat",
    position: "end",
    template: `modules/${MODULE_ID}/templates/ma-shields.hbs`,
    visible: () => on(),
    context: (actor) => {
      const grab = grabOf(actor);
      return { held: grab ? F("HeldBy", { name: (globalThis as any).fromUuidSync?.(grab.grabber)?.name ?? "?" }) : null };
    },
    listeners: (element, actor) => {
      element.querySelector<HTMLButtonElement>("[data-ma-grab-shield]")?.addEventListener("click", () => void grabShield(api, actor));
      element.querySelector<HTMLButtonElement>("[data-ma-break-free]")?.addEventListener("click", () => void breakFree(api, actor));
    },
  });
}

/** Grabs the targeted foe's shield or cloak: DX or a grappling skill at -4 plus DB (p. 113). */
async function grabShield(api: GWorldApi, actor: any): Promise<void> {
  const targets = [...((game as any).user?.targets ?? [])];
  const foe = targets.length === 1 ? targets[0]?.actor : null;
  if (!foe) return void ui.notifications?.warn(L("OneTarget"));
  const shield = readyShield(foe);
  if (!shield) return void ui.notifications?.warn(F("NoShield", { name: String(foe.name ?? "") }));
  const options = ["DX", "Judo", "Sumo Wrestling", "Wrestling"]
    .map((name) => ({ name, level: name === "DX" ? api.actors.attribute(actor, "DX") : api.actors.skillLevel(actor, name) }))
    .filter((o): o is { name: string; level: number } => typeof o.level === "number")
    .sort((a, b) => b.level - a.level);
  const skill = options[0];
  if (!skill) return;
  const hands = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Grab") },
    content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px"><span>${L("Hands")}</span>
      <select name="hands"><option value="1">${L("OneHand")}</option><option value="2">${L("TwoHands")}</option></select></label></div>`,
    ok: { label: L("Grab"), callback: (_e: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="hands"]')?.value === "2" },
    rejectClose: false,
  });
  if (hands === null || hands === undefined) return;
  const db = Number(shield.system?.db) || 0;
  const outcome: any = await api.roll.success({
    actor,
    base: skill.level,
    kind: "attack",
    label: F("GrabLabel", { shield: String(shield.name), foe: String(foe.name ?? "") }),
    ...(skill.name === "DX" ? {} : { skill: skill.name }),
    modifiers: [{ label: L("Grab"), value: grabShieldPenalty(db) }],
    delivery: "unarmed",
  } as any);
  // A hit holds it; the foe's defense is theirs to roll on the card first.
  if (!outcome?.success || outcome.criticalFailure || !foe.isOwner) return;
  const conditionId = await api.actors.applyCondition(foe, {
    module: MODULE_ID,
    key: GRAB_CONDITION,
    label: F("Grabbed", { shield: String(shield.name) }),
    effects: { modifiers: db ? [{ label: L("NoDb"), value: -db, rolls: ["dodge", "parry"] }] : [] },
  });
  const grab: Grab = { grabber: String(actor.uuid), shieldId: String(shield.id), twoHanded: hands === true, strapped: !canKnockAway(shieldSkill(shield)), conditionId: String(conditionId ?? "") };
  await foe.setFlag(MODULE_ID, GRAB_FLAG, grab);
}

/** Breaks free of a shield grab: a Quick Contest of ST, +5 to a two-handed grab and +4 to a strapped shield (p. 113). */
async function breakFree(api: GWorldApi, actor: any): Promise<void> {
  const grab = grabOf(actor);
  if (!grab) return;
  const grabber = (globalThis as any).fromUuidSync?.(grab.grabber) ?? null;
  const release = async () => {
    if (grab.conditionId) await api.actors.removeCondition(actor, grab.conditionId);
    await actor.unsetFlag(MODULE_ID, GRAB_FLAG);
  };
  if (!grabber) return release();
  const bonus = breakFreeModifiers(grab.twoHanded, grab.strapped);
  const result: any = await api.roll.quickContest({
    label: F("BreakFreeLabel", { name: String(actor.name ?? "") }),
    first: { actor, base: api.actors.attribute(actor, "ST") ?? 10, note: "ST", ...(bonus.victim ? { modifiers: [{ label: L("Strapped"), value: bonus.victim }] } : {}) },
    second: { actor: grabber, base: api.actors.attribute(grabber, "ST") ?? 10, note: "ST", ...(bonus.grabber ? { modifiers: [{ label: L("TwoHands"), value: bonus.grabber }] } : {}) },
  } as any);
  if (result?.outcome === "first") {
    await release();
    ui.notifications?.info(F("Free", { name: String(actor.name ?? "") }));
  }
}
