/**
 * Close combat at the table (GURPS Martial Arts pp. 114, 116-119, 121-122).
 *
 * Grappling options: the victim of a takedown or pin who made an All-Out Attack
 * loses it without a roll, and one who made a Committed Attack rolls at -2;
 * Determined and Strong add to the grappler's rolls; a one-handed strangle uses
 * half ST. The grapple panel gets Add a Hand, Release a Hand, Shift Grip, Sit on
 * Him, Shove Around, Throw from a Lock and Sprawl. A grappled fighter defends
 * at -2 (-1 Dodge) and can't retreat, and neither can a grappler still holding.
 *
 * Long weapons in close combat: -4 skill a yard of reach, the Parry from it and
 * -1 swing damage a yard, and a haft attack for long polearms.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { stanceOf } from "../committed-defensive/index.js";
import {
  ONE_HAND_STRANGLE,
  ONE_HANDED_DAMAGE,
  bearHugModifiers,
  bearHugRefusal,
  grappleActionAllowed,
  grappleActionsAllowed,
  haftRefused,
  oneHandedPenalty,
  type GrappleLimbs,
  SAT_ON_GRIP,
  SPRAWL_BONUS,
  allOutGrappling,
  closeCombatPenalty,
  followsGrapple,
  grappledDefense,
  haftOnly,
  oneHandedStrangle,
  reachOf,
  shiftGripBonus,
  sitOnHimModifiers,
  sprawlResult,
  throwLocation,
  victimOpening,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.CloseCombat.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.CloseCombat.${key}`, data);

const SPRAWL = "ma-sprawl";
/** Which limbs a grapple is held with, for bear hugs and for the hands a grappler keeps free. */
const LIMBS = "ma-grapple-limbs";
/** The actions after a grapple taken this turn. */
const ACTIONS_TAKEN = "ma-grapple-actions";
const CHOKED_UP = "chokedUp";
const SAT_ON = "ma-sat-on";
const SHOVED = "ma-shoved-bonus";
const GRAPPLING = ["Judo", "Wrestling", "Sumo Wrestling", "Brawling"];
const LOCATIONS = ["torso", "neck", "arm", "hand", "leg", "foot", "skull", "face"];

/** Registers both switches' hooks and grapple actions. */
export function readyCloseCombat(api: GWorldApi, grappling: () => boolean, longWeapons: () => boolean): void {
  const level = (actor: any, name: string) => (["ST", "DX", "HT"].includes(name) ? api.actors.attribute(actor, name as "ST") : api.actors.skillLevel(actor, name));
  const best = (actor: any, names: string[]) => names
    .map((name) => ({ name, level: level(actor, name) }))
    .filter((o): o is { name: string; level: number } => typeof o.level === "number")
    .sort((a, b) => b.level - a.level)[0] ?? { name: "DX", level: 10 };
  const limbsOf = (actor: any): GrappleLimbs => (api.combat.getCombatState(actor, MODULE_ID, LIMBS) === "legs" ? "legs" : "arms");
  const maneuverKind = (actor: any): "allOut" | "committed" | "other" => {
    if (String(actor?.system?.maneuver ?? "") === "allOutAttack") return "allOut";
    return stanceOf(api, actor)?.kind === "committed" ? "committed" : "other";
  };

  // ── All-Out and Committed Attacks when grappling; one hand (pp. 114, 116) ──
  Hooks.on(api.combat.hooks.grappleContest, (context: any) => {
    if (!grappling() || !context) return;
    const { move, actor, foe, grapple } = context;
    if (followsGrapple(move)) {
      const opening = victimOpening(maneuverKind(foe));
      if (opening.loses) {
        context.winner = "first";
        return;
      }
      if (opening.modifier) context.second.modifiers.push({ label: L("Committed"), value: opening.modifier });
    }
    // Determined on a DX-based takedown, Strong on a ST-based pin, strangle or break free.
    const option = String(actor?.system?.allOutAttackOption ?? "");
    const stBased = move !== "takedown";
    const committed = stanceOf(api, actor);
    const bonus = maneuverKind(actor) === "allOut"
      ? allOutGrappling(option, stBased)
      : committed?.kind === "committed" ? allOutGrappling(committed.mode ?? "", stBased) / 2 : 0;
    if (bonus) context.first.modifiers.push({ label: L(stBased ? "Strong" : "Determined"), value: bonus });
    // A one-handed strangle: half ST instead of the -5 (p. 116).
    if (stBased && move !== "breakFree" && grapple?.holding && Number(grapple.hands) === 1 && limbsOf(actor) === "arms" && move !== "choke") {
      context.first.base = oneHandedStrangle(Number(context.first.base));
      context.first.modifiers.push({ label: L("OneHandHalf"), value: 0 });
    }
    if (move === "choke" && grapple?.holding && Number(grapple.hands) === 1) {
      context.first.base = oneHandedStrangle(Number(context.first.base));
      context.first.modifiers = context.first.modifiers
        .map((line: any) => (line.value <= ONE_HAND_STRANGLE ? { ...line, value: line.value - ONE_HAND_STRANGLE } : line))
        .filter((line: any) => line.value !== 0);
    }
    // A foe sat on breaks free against +5 (p. 117), and a shoved one keeps his margin (p. 118).
    if (move === "breakFree") {
      const sat = api.combat.getCombatState(actor, MODULE_ID, SAT_ON);
      if (sat) context.second.modifiers = [...context.second.modifiers.filter((line: any) => line.label !== game.i18n.localize("GWORLD.Grapple.Grip")), { label: L("SatOn"), value: SAT_ON_GRIP }];
      const shoved = Number(api.combat.getCombatState(actor, MODULE_ID, SHOVED)) || 0;
      if (shoved) {
        context.first.modifiers.push({ label: L("ShovedBack"), value: shoved });
        void api.combat.clearCombatState(actor, MODULE_ID, SHOVED);
      }
    }
    // Sprawling (p. 119): +3.
    if (move === "takedown" && api.combat.getCombatState(foe, MODULE_ID, SPRAWL)) context.second.modifiers.push({ label: L("Sprawl"), value: SPRAWL_BONUS });
  });
  Hooks.on(api.combat.hooks.afterGrappleContest, async (context: any) => {
    // Breaking free gets a foe out from under whoever sat on him.
    if (context?.move === "breakFree" && context.outcome === "first") {
      await api.combat.clearCombatState(context.actor, MODULE_ID, SAT_ON);
      await api.combat.clearCombatState(context.foe, MODULE_ID, LIMBS);
    }
    if (!grappling() || context?.move !== "takedown") return;
    const { actor, foe } = context;
    if (!api.combat.getCombatState(foe, MODULE_ID, SPRAWL)) return;
    const result = sprawlResult(context.outcome);
    await api.combat.clearCombatState(foe, MODULE_ID, SPRAWL);
    if (result.sprawlerFalls) await api.actors.setPosture(foe, "lying");
    if (result.takerFalls) await api.actors.setPosture(actor, "lying");
    if (result.grappleLost) await api.combat.endGrapple(actor);
    ui.notifications?.info(F(result.grappleLost ? "SprawlWorked" : "SprawlFailed", { foe: String(foe?.name ?? ""), taker: String(actor?.name ?? "") }));
  });

  // ── the actions after a grapple (pp. 117-119) ──
  /**
   * An action after a grapple takes an Attack, All-Out Attack or Committed
   * Attack maneuver, and a turn holds one of them -- two on All-Out Attack
   * (Double) (p. 119).
   */
  const actionsLeft = (actor: any) => grappleActionsAllowed(String(actor?.system?.maneuver ?? ""), String(actor?.system?.allOutAttackOption ?? ""))
    - (Number(api.combat.getCombatState(actor, MODULE_ID, ACTIONS_TAKEN)) || 0);
  const mayAct = (actor: any) => grappleActionAllowed(String(actor?.system?.maneuver ?? ""), stanceOf(api, actor)?.kind === "committed") && actionsLeft(actor) > 0;
  const action = (key: string, applies: (grapple: any, actor: any) => boolean, run: (context: { actor: any; foe: any; grapple: any }) => unknown) =>
    api.combat.registerGrappleAction({
      module: MODULE_ID,
      key,
      label: L(`Actions.${key}`),
      applies: (grapple, actor) => grappling() && applies(grapple, actor),
      run: async (context: { actor: any; foe: any; grapple: any }) => {
        const actor = context.actor;
        if (!mayAct(actor)) {
          ui.notifications?.warn(L(grappleActionAllowed(String(actor?.system?.maneuver ?? ""), stanceOf(api, actor)?.kind === "committed") ? "ActionUsed" : "ActionManeuver"));
          return;
        }
        await api.combat.setCombatState(actor, MODULE_ID, ACTIONS_TAKEN, (Number(api.combat.getCombatState(actor, MODULE_ID, ACTIONS_TAKEN)) || 0) + 1, "turn");
        return run(context);
      },
    });

  action("ma-add-hand", (g) => g.holding && g.hands < 2, ({ actor, grapple }) => api.combat.updateGrapple(actor, { hands: Number(grapple.hands) + 1 }));
  action("ma-release-hand", (g) => g.holding && g.hands > 1, ({ actor, grapple }) => api.combat.updateGrapple(actor, { hands: Number(grapple.hands) - 1 }));
  action("ma-shift-grip", (g) => g.holding, async ({ actor, foe, grapple }) => {
    if (!foe) return;
    const options = LOCATIONS.filter((loc) => loc !== grapple.hitLocation).map((loc) => `<option value="${loc}">${game.i18n.localize(`GWORLD.HitLocation.${loc}`)}</option>`).join("");
    const to = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("Actions.ma-shift-grip") },
      content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px"><span>${L("ShiftTo")}</span><select name="to">${options}</select></label></div>`,
      ok: { label: L("Actions.ma-shift-grip"), callback: (_e: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="to"]')?.value ?? "" },
      rejectClose: false,
    }) as string | null;
    if (!to) return;
    const bonus = shiftGripBonus(Math.max(0, 2 - Number(grapple.hands)), 2);
    const mine = best(actor, ["DX", ...GRAPPLING]);
    const theirs = best(foe, ["DX", ...GRAPPLING]);
    const result: any = await api.roll.quickContest({
      label: F("ShiftLabel", { name: String(actor.name ?? ""), to: game.i18n.localize(`GWORLD.HitLocation.${to}`) }),
      first: { actor, base: mine.level, note: mine.name, ...(bonus.grappler ? { modifiers: [{ label: L("FreeHands"), value: bonus.grappler }] } : {}) },
      second: { actor: foe, base: theirs.level, note: theirs.name, ...(bonus.victim ? { modifiers: [{ label: L("FreeHands"), value: bonus.victim }] } : {}) },
    } as any);
    if (result?.outcome === "first") await api.combat.updateGrapple(actor, { hitLocation: to });
    else if (result?.outcome === "second") await api.combat.endGrapple(actor);
  });
  action("ma-sit-on-him", (g) => g.holding && g.pinned, async ({ actor, foe }) => {
    if (!foe) return;
    const mods = sitOnHimModifiers(Number(actor.system?.sm) || 0, Number(foe.system?.sm) || 0);
    const mine = best(actor, ["ST", "DX", ...GRAPPLING]);
    const theirs = best(foe, ["ST", "DX", ...GRAPPLING]);
    const result: any = await api.roll.quickContest({
      label: F("SitLabel", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }),
      first: { actor, base: mine.level, note: mine.name, ...(mods.grappler ? { modifiers: [{ label: L("Size"), value: mods.grappler }] } : {}) },
      second: { actor: foe, base: theirs.level, note: theirs.name, ...(mods.victim ? { modifiers: [{ label: L("Size"), value: mods.victim }] } : {}) },
    } as any);
    if (result?.outcome === "first") {
      await api.actors.setPosture(actor, "sitting");
      await api.combat.setCombatState(foe, MODULE_ID, SAT_ON, String(actor.uuid), "combat");
      ui.notifications?.info(F("SatOnText", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }));
    } else if (result?.outcome === "second") {
      await api.combat.endGrapple(actor);
    }
  });
  action("ma-shove-around", (g) => g.holding, async ({ actor, foe }) => {
    if (!foe) return;
    const mine = best(actor, ["ST", "DX", ...GRAPPLING]);
    const theirs = best(foe, ["ST", "DX", ...GRAPPLING]);
    const result: any = await api.roll.quickContest({
      label: F("ShoveLabel", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }),
      first: { actor, base: mine.level, note: mine.name },
      second: { actor: foe, base: theirs.level, note: theirs.name },
    } as any);
    if (result?.outcome === "first") ui.notifications?.info(F("Shoved", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }));
    if (result?.outcome === "second" && result.marginOfVictory > 0) await api.combat.setCombatState(foe, MODULE_ID, SHOVED, result.marginOfVictory, "combat");
  });
  action("ma-throw-from-lock", (g) => g.holding && throwLocation(g.hitLocation) !== null, async ({ actor, foe, grapple }) => {
    if (!foe) return;
    if (String(foe.system?.posture ?? "standing") !== "standing") return void ui.notifications?.warn(L("ThrowStanding"));
    const mine = best(actor, ["Judo", "Wrestling", "Sumo Wrestling"]);
    const theirs = best(foe, ["ST", "DX", "Breakfall", ...GRAPPLING]);
    const result: any = await api.roll.quickContest({
      label: F("ThrowLabel", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }),
      first: { actor, base: mine.level, note: mine.name, ...(Number(grapple.hands) === 1 ? { modifiers: [{ label: L("OneHand"), value: -4 }] } : {}) },
      second: { actor: foe, base: theirs.level, note: theirs.name },
    } as any);
    const breakfall = theirs.name === "Breakfall";
    if (result?.outcome === "first") {
      await api.actors.setPosture(foe, "lying");
      const swing = String(api.actors.derived(actor)?.swing ?? "1d");
      const wrestling = api.actors.skillLevel(actor, "Wrestling");
      const dx = api.actors.attribute(actor, "DX") ?? 10;
      // Wrestling's ST bonus as a damage bonus (p. 118): +1 at DX+1, +2 at DX+2 or better.
      const bonus = wrestling === null ? 0 : wrestling >= dx + 2 ? 2 : wrestling >= dx + 1 ? 1 : 0;
      await api.roll.damage({
        actor,
        label: F("ThrowDamage", { location: game.i18n.localize(`GWORLD.HitLocation.${throwLocation(grapple.hitLocation)}`) }),
        formula: swing,
        damageType: "cr",
        ...(bonus ? { modifiers: [{ label: "Wrestling", value: bonus }] } : {}),
        calledShot: { hitLocation: throwLocation(grapple.hitLocation) },
      } as any);
    } else if (breakfall) {
      await api.actors.setPosture(foe, "lying");
      ui.notifications?.info(F("Breakfall", { foe: String(foe.name ?? "") }));
    }
  });
  // A bear hug (p. 117): squeezing a torso held in two arms or legs.
  action("ma-bear-hug", (g) => g.holding && g.hitLocation === "torso", async ({ actor, foe, grapple }) => {
    if (!foe) return;
    const fatigue = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("Actions.ma-bear-hug") },
      content: `<p>${foundry.utils.escapeHTML(F("BearHugAsk", { foe: String(foe.name ?? "") }))}</p>`,
      yes: { label: L("BearHugFatigue") },
      no: { label: L("BearHugInjury") },
    }) as boolean;
    const limbs = limbsOf(actor);
    const refusal = bearHugRefusal({
      hitLocation: String(grapple.hitLocation ?? "torso"),
      hands: Number(grapple.hands) || 0,
      limbs,
      smGrappler: Number(actor.system?.sm) || 0,
      smVictim: Number(foe.system?.sm) || 0,
      fatigueOnly: fatigue === true,
      victimWeight: Number(foe.system?.weight) || 0,
      basicLift: Number(api.actors.basicLift(actor)) || 0,
    });
    if (refusal) return void ui.notifications?.warn(L(`BearHug.${refusal}`));
    const constriction = [...(actor.items ?? [])].some((i: any) => i.type === "trait" && /^constriction attack\b/i.test(String(i.name ?? "")));
    const lines = bearHugModifiers({ constriction, limbs }).map((line) => ({ label: L(`BearHug.${line.key}`), value: line.value }));
    const st = (who: any) => Number(api.actors.attribute(who, "ST")) || 10;
    const theirs = best(foe, ["ST", "HT"]);
    const result: any = await api.roll.quickContest({
      label: F("BearHugLabel", { name: String(actor.name ?? ""), foe: String(foe.name ?? "") }),
      first: { actor, base: st(actor), note: "ST", ...(lines.length ? { modifiers: lines } : {}) },
      second: { actor: foe, base: theirs.level, note: theirs.name },
    } as any);
    if (result?.outcome !== "first") return void ui.notifications?.info(F("BearHugHeld", { foe: String(foe.name ?? "") }));
    const injury = Math.max(1, Number(result.marginOfVictory) || 1);
    if (fatigue) {
      await api.actors.applyInjury(foe, { amount: injury, fatigue: true, label: L("Actions.ma-bear-hug") });
      ui.notifications?.info(F("BearHugFp", { foe: String(foe.name ?? ""), fp: injury }));
      return;
    }
    // Crushing damage to the torso, without the neck's wounding modifier.
    await api.roll.damage({
      actor,
      label: F("BearHugDamage", { foe: String(foe.name ?? "") }),
      formula: String(injury),
      damageType: "cr",
      calledShot: { hitLocation: "torso" },
    } as any);
  });

  // Switching arms for legs, and back (p. 118).
  action("ma-switch-limbs", (g) => g.holding, async ({ actor }) => {
    const next: GrappleLimbs = limbsOf(actor) === "legs" ? "arms" : "legs";
    await api.combat.setCombatState(actor, MODULE_ID, LIMBS, next, "combat");
    ui.notifications?.info(L(next === "legs" ? "SwitchedToLegs" : "SwitchedToArms"));
  });

  action("ma-sprawl", (g, actor) => !g.holding && !api.combat.getCombatState(actor, MODULE_ID, SPRAWL), async ({ actor }) => {
    await api.combat.setCombatState(actor, MODULE_ID, SPRAWL, true, "combat");
    ui.notifications?.info(F("SprawlReady", { name: String(actor.name ?? "") }));
  });

  // ── one-handed locks and holds (p. 116) ──
  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: "ma-one-handed",
    label: L("OneHanded"),
    attack: "melee",
    // The dialog shows the first choice as chosen, so the first is none.
    input: { type: "select", choices: [{ value: "", label: "—" }, { value: "hand", label: L("OneHandedHand") }, { value: "crook", label: L("OneHandedCrook") }] },
    available: () => grappling(),
    apply: (_context: any, value: unknown) => {
      const penalty = oneHandedPenalty(String(value ?? ""));
      return penalty ? { modifiers: [{ label: L("OneHanded"), value: penalty }], notes: [L("OneHandedNote")] } : null;
    },
  } as any);
  // A throw from a one-handed lock, and the damage rolls that go with it (p. 116).
  Hooks.on(api.combat.hooks.damageModifiers, (context: any) => {
    if (!grappling()) return;
    const grapple = api.combat.grapple(context?.actor);
    if (!grapple?.holding || Number(grapple.hands) !== 1 || limbsOf(context.actor) !== "arms") return;
    if (!/lock|hold|throw/i.test(String(context.label ?? ""))) return;
    context.modifiers.push({ label: L("OneHand"), value: ONE_HANDED_DAMAGE });
  });

  // ── defense while grappling (pp. 121-122) ──
  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    if (!grappling()) return;
    const grapple = api.combat.grapple(context?.defender);
    if (!grapple || grapple.holding) return;
    const penalty = grappledDefense(String(context.defense));
    if (penalty) context.modifiers.push({ label: L("Grappled"), value: penalty });
  });
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (!grappling()) return;
    const grapple = api.combat.grapple(context?.defender);
    if (!grapple) return;
    Object.assign(context.retreat, { available: false, refusal: L(grapple.holding ? "LetGoToRetreat" : "GrappledNoRetreat") });
    // A grappler with both hands on the foe has none left to parry with.
    if (grapple.holding && Number(grapple.hands) >= 2 && limbsOf(context.defender) === "arms" && context.parryWeapon?.natural) {
      for (const choice of context.choices ?? []) if (choice.key === "parry" && choice.available) Object.assign(choice, { available: false, refusal: L("HandsHolding") });
    }
  });

  // ── long weapons in close combat (p. 117) ──
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!longWeapons()) return;
    const inClose = context?.actor?.system?.conditions?.closeCombat === true;
    // A reach 2 or 3 polearm, spear or two-handed axe has only its haft until a
    // Ready chokes it up, and again until another Ready readies it (p. 117).
    const haft = longInClose(context?.item, context?.actor);
    if (!inClose && !haft) return;
    for (const entry of context.rows ?? []) {
      if (entry.kind !== "melee") continue;
      const penalty = closeCombatPenalty(String(entry.row.reach ?? ""));
      if (!penalty.skill) continue;
      if (haft) {
        entry.row.usable = false;
        entry.row.notes.push({ label: L("ChokeUp"), hint: L("HaftOnlyHint") });
        continue;
      }
      // The awkward attack the Basic Set doesn't allow at all, at its penalties.
      entry.row.usable = true;
      if (typeof entry.row.skillLevel === "number") entry.row.skillLevel += penalty.skill;
      if (typeof entry.row.parry === "number") entry.row.parry += penalty.parry;
      if (entry.mode?.damageBase === "sw") entry.row.damage = context.addToDamage(String(entry.row.damage ?? ""), penalty.swing);
      entry.row.notes.push({ label: L("InClose"), hint: F("InCloseHint", { skill: penalty.skill, parry: penalty.parry }) });
    }
  });
  const chokedUp = (item: any) => (api.combat.getWeaponState(item, MODULE_ID) as any)?.[CHOKED_UP] === true;
  const longInClose = (item: any, actor: any) => longWeapons()
    && ((item?.system?.meleeModes ?? []) as any[]).some((m) => haftOnly(String(m?.skill ?? ""), String(m?.reach ?? "")))
    && haftRefused({ inClose: actor?.system?.conditions?.closeCombat === true, chokedUp: chokedUp(item) });
  // Choking it up around the head, and readying it again, each take a Ready (p. 117).
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ma-choke-up",
    itemTypes: ["equipment"],
    label: L("ChokeUp"),
    icon: "fa-solid fa-hands-holding",
    visible: (item: any) => longWeapons() && ((item?.system?.meleeModes ?? []) as any[]).some((m) => haftOnly(String(m?.skill ?? ""), String(m?.reach ?? ""))),
    run: async (item: any) => {
      const next = !chokedUp(item);
      await api.combat.setWeaponState(item, MODULE_ID, { [CHOKED_UP]: next });
      ui.notifications?.info(F(next ? "ChokedUp" : "ChokedDown", { weapon: String(item.name ?? "") }));
    },
  } as any);
  api.combat.registerDerivedAttackMode({
    module: MODULE_ID,
    key: "ma-haft",
    label: L("Haft"),
    kind: "melee",
    applies: (item, actor) => longInClose(item, actor),
    mode: (item, _actor, helpers: any) => {
      const row = ((helpers.rows?.(item)?.melee ?? []) as any[]).find((r) => haftOnly(String(r.skillName ?? ""), String(item.system?.meleeModes?.[r.modeIndex]?.reach ?? r.reach ?? "")));
      if (!row) return null;
      const { longest } = reachOf(String(item.system?.meleeModes?.[row.modeIndex]?.reach ?? ""));
      // Quarterstaff damage with the haft, swing+2 crushing less a point a yard of reach.
      const damage = String(helpers.damage?.("sw", 2 - longest) ?? "");
      return { skillName: row.skillName, skillLevel: row.skillLevel, damage, damageType: "cr", reach: "C", parry: row.parry, damageRollable: api.rules.parseDiceAdds(damage) !== null };
    },
  });
}
