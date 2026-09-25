/**
 * Land mines at the table (pp. 189-190), under High-Tech's landMines switch:
 *
 *   - **Placing, finding and disarming:** a row action rolls the best of
 *     Explosives (Demolition)+4, Soldier and Traps+2 to place a ready-made
 *     mine (Explosives (Demolition)-2 for one improvised from a shell),
 *     Explosives (EOD) or Soldier-5 to find one by probing, and Explosives
 *     (EOD) to disarm it -- at -2 against the TMi35's anti-lifting fuse, where
 *     any failure sets it off.
 *   - **Setting one off:** the mine's blast from its record. A bounding mine's
 *     burst is five feet up: its fragments are rolled on their own card, and
 *     whoever is flat on the ground when they are applied takes none (the
 *     card's button drops the targeted tokens flat). The system's own row
 *     leaves those fragments to this action.
 *   - **Directional mines:** the Claymore (and the Stingmore) attack everyone
 *     targeted in their 60-degree cone at basic skill 9, plus the rapid-fire
 *     bonus for their pellets, less the range penalty for their distance
 *     from the mine, nearest first, until the pellets are spent; the card
 *     rolls each target's hits once its Dodge is known. Where the mine has a
 *     token, the cone is the system's (`areas.standsIn`), facing the way the
 *     dialog says (toward the targets, to start with), and a target outside
 *     it is missed. The system's pellet row is at skill 9 too.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { DIRECTIONAL_CONE_DEGREES, MINE_TASKS, avoidsBoundingFragments, bearingToward, coneWidth, directionalVolley, mineFacts, type MineFacts, type MineTask } from "./rules.js";
import { F, L, ask, checkbox, hint, mainMode, formulaOf, number, roll3d, row, say, select, skillRoll, targetedTokens, yardsBetween } from "./common.js";

const BOUNDING_SOURCE = `${MODULE_ID}.bounding`;
const BOUNDING_CARD = "ht-bounding-mine";
const VOLLEY_CARD = "ht-directional-mine";

/** A mine's facts, from an equipment record's name. */
export const mineOf = (item: any): MineFacts | null => (item?.type === "equipment" ? mineFacts(String(item.name ?? "")) : null);

/** A directional mine's pellet mode: the ranged mode with more than one projectile. */
function pelletMode(item: any): { mode: any; index: number } | null {
  const modes: any[] = item?.system?.rangedModes ?? [];
  const index = modes.findIndex((m) => Number(m?.projectiles) > 1 && m?.explosive !== true);
  return index >= 0 ? { mode: modes[index], index } : null;
}

export function readyMines(api: GWorldApi, on: () => boolean): void {
  // ── placing, probing, disarming (p. 189) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-mine-task",
    itemTypes: ["equipment"],
    label: L("Mine.Task"),
    icon: "fa-solid fa-person-digging",
    visible: (item: any) => on() && mineOf(item) !== null,
    run: (item: any, actor: any) => { void mineTask(item, actor); },
  } as any);

  const mineTask = async (item: any, actor: any) => {
    const facts = mineOf(item);
    if (!facts) return;
    const name = String(item.name ?? "");
    const value = await ask(name, [
      row(L("Mine.TaskLabel"), select("task", (Object.keys(MINE_TASKS) as MineTask[]).map((t) => ({ value: t, label: L(`Mine.Tasks.${t}`) })))),
      checkbox("antiLifting", F("Mine.AntiLifting", { penalty: facts.antiLifting ?? -2 }), Boolean(facts.antiLifting)),
      row(L("Mine.Tamper"), number("tamper", 0, "1")),
      hint(L("Mine.TaskHint")),
    ].join(""), L("Mine.Task"));
    if (!value) return;
    const task = (Object.keys(MINE_TASKS) as string[]).includes(value("task")) ? (value("task") as MineTask) : "place";
    const antiLifting = task === "disarm" && value("antiLifting") === "on";
    const tamper = Math.min(0, Math.floor(Number(value("tamper")) || 0));
    const extra = [
      ...(antiLifting ? [{ label: L("Mine.AntiLiftingLine"), value: facts.antiLifting ?? -2 }] : []),
      ...(task === "disarm" && tamper ? [{ label: L("Mine.TamperLine"), value: tamper }] : []),
    ];
    const outcome = await skillRoll(api, actor, MINE_TASKS[task], F(`Mine.Roll.${task}`, { name }), extra, ["mine", task]);
    if (!outcome) return;
    const goesOff = task === "disarm" && !outcome.success && (antiLifting || outcome.criticalFailure);
    await say(actor, name, [F(`Mine.Result.${task}.${outcome.success ? "success" : "failure"}`, { name }), ...(goesOff ? [F("Mine.GoesOff", { name })] : [])]);
    if (goesOff) await setOff(item, actor);
  };

  // ── setting one off (p. 189) ──
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "ht-mine-set-off",
    itemTypes: ["equipment"],
    label: L("Mine.SetOff"),
    icon: "fa-solid fa-burst",
    visible: (item: any) => on() && mineOf(item) !== null && api.registry.isRuleOn("explosions"),
    run: (item: any, actor: any) => { void setOff(item, actor); },
  } as any);

  const setOff = async (item: any, actor: any) => {
    const facts = mineOf(item);
    const main = mainMode(item);
    if (!facts || !main || main.mode?.explosive !== true) return;
    const name = String(item.name ?? "");
    const mode = main.mode;
    const fragments = String(mode.fragmentation ?? "");
    const bounding = facts.kind === "bounding";
    if (facts.armsAfter) await say(actor, name, [F("Mine.Pdm", { arms: facts.armsAfter, hours: Math.round((facts.selfDestructs ?? 0) / 3600) })]);
    await api.roll.damage({
      actor, item, mode: { index: main.index, ranged: main.ranged }, label: F("Mine.Blast", { name }),
      formula: formulaOf(mode), damageType: mode.damageType ?? "cr", armorDivisor: Number(mode.armorDivisor) || 1, explosive: true,
      // A bounding mine's fragments come on their own card, below.
      fragmentation: bounding ? "" : fragments,
      fragmentationType: mode.fragmentationType ?? "", fragmentationDivisor: Number(mode.fragmentationDivisor) || 1,
    } as any);
    if (bounding && fragments) {
      await api.roll.damage({
        actor, label: F("Mine.BoundingFragments", { name, fragments }), formula: fragments,
        damageType: mode.fragmentationType || "cut", armorDivisor: Number(mode.fragmentationDivisor) || 1, source: BOUNDING_SOURCE,
      } as any);
      await api.chat.post(`${MODULE_ID}.${BOUNDING_CARD}`, { name, dropped: [] }, { actor } as any);
    }
    const pellets = facts.kind === "directional" ? pelletMode(item) : null;
    if (facts.pellets && pellets) await volley(item, actor, facts, pellets);
  };

  // Whoever is flat on the ground takes none of a bounding mine's fragments (p. 189).
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const damage = context?.damage;
    if (!on() || damage?.source !== BOUNDING_SOURCE || !avoidsBoundingFragments(context.actor?.system?.posture)) return;
    damage.basicDamage = 0;
    void say(context.actor, L("Mine.BoundingTitle"), [F("Mine.Flat", { name: String(context.actor?.name ?? "") })]);
  });

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: BOUNDING_CARD,
    template: `modules/${MODULE_ID}/templates/ht-mine-card.hbs`,
    actions: {
      // The GM drops the targeted tokens flat: those who threw themselves down at once.
      drop: {
        permission: "gm",
        run: async ({ message, data }: any) => {
          const dropped: string[] = [...(data.dropped ?? [])];
          for (const token of targetedTokens()) {
            const actor = token?.actor;
            if (!actor) continue;
            await (api.actors as any).setPosture(actor, "lying");
            dropped.push(String(actor.name ?? ""));
          }
          await api.chat.update(message, { ...data, dropped: [...new Set(dropped)] });
        },
      },
    },
  } as any);

  // ── directional mines (p. 189) ──
  const volley = async (item: any, actor: any, facts: MineFacts, pellets: { mode: any; index: number }) => {
    const spec = facts.pellets!;
    const name = String(item.name ?? "");
    const origin = actor?.getActiveTokens?.()?.[0] ?? null;
    const tokens = targetedTokens();
    if (!tokens.length) return void ui.notifications?.warn(L("Mine.NoTargets"));
    // The cone, where the mine's token is on the scene: it faces the targets unless the dialog says otherwise.
    const scene = (globalThis as any).canvas?.scene ?? null;
    const facing = scene && origin?.center ? bearingToward(origin.center, tokens.map((t) => t?.center).filter(Boolean)) : null;
    const value = await ask(F("Mine.VolleyTitle", { name }), [
      hint(F("Mine.VolleyHint", { max: spec.max })),
      ...(facing === null ? [] : [row(L("Mine.Facing"), number("facing", facing, "1")), hint(F("Mine.FacingHint", { degrees: DIRECTIONAL_CONE_DEGREES }))]),
      ...tokens.map((t, i) => row(String(t.name ?? t.actor?.name ?? ""), number(`d${i}`, yardsBetween(origin, t) ?? 10))),
    ].join(""), L("Mine.Fire"));
    if (!value) return;
    let inCone = (_token: any) => true;
    if (facing !== null) {
      const perYard = (Number(scene.grid?.size) || 100) / (Number(scene.grid?.distance) || 1);
      const direction = ((Number(value("facing")) || 0) % 360 + 360) % 360;
      // As `areas.list` gives a cone: scene pixels and degrees, a yard wide at the apex (API 1.89.0).
      const cone = {
        id: `${MODULE_ID}-directional-cone`, label: name, center: { x: origin.center.x, y: origin.center.y }, radius: null, region: null, lines: [], expires: null,
        cone: { direction, length: spec.max * perYard, width: coneWidth(spec.max) * perYard, base: perYard },
      };
      const inside = new Set((api.areas.standsIn(scene, cone as any) ?? []).map((doc: any) => String(doc?.id ?? "")));
      inCone = (token: any) => inside.has(String(token?.document?.id ?? token?.id ?? ""));
    }
    const rules = api.rules as any;
    const resolved = directionalVolley(
      tokens.flatMap((t, i) => (inCone(t) ? [{ id: String(i), distance: Math.max(0, Number(value(`d${i}`)) || 0), roll: roll3d() }] : [])),
      spec,
      { rofBonus: Number(rules.rapidFireBonus?.(spec.count)) || 0, rangePenalty: (yards) => Number(rules.speedRangeModifier?.(yards)) || 0 },
    );
    const rows = resolved.map((r, index) => {
      const token = tokens[Number(r.id)];
      return {
        index,
        name: String(token?.name ?? token?.actor?.name ?? ""),
        hits: r.hits, halfDamage: r.halfDamage,
        summary: F(r.halfDamage ? "Mine.RowHalf" : "Mine.Row", { distance: r.distance, skill: r.skill, roll: r.roll }),
        line: r.missed ? L(`Mine.Missed.${r.missed}`) : r.hits > 0 ? F("Mine.Hits", { hits: r.hits, margin: r.margin }) : F("Mine.Miss", { margin: Math.abs(r.margin) }),
        rolled: false,
      };
    });
    // Those targeted outside the cone: missed, with no roll.
    tokens.forEach((t, i) => {
      if (inCone(t)) return;
      rows.push({
        index: rows.length, name: String(t?.name ?? t?.actor?.name ?? ""), hits: 0, halfDamage: false,
        summary: F("Mine.RowOutside", { distance: Math.max(0, Number(value(`d${i}`)) || 0) }), line: L("Mine.Missed.cone"), rolled: false,
      });
    });
    await api.chat.post(`${MODULE_ID}.${VOLLEY_CARD}`, {
      name, itemUuid: String(item.uuid ?? ""), modeIndex: pellets.index,
      pellets: spec.count, left: spec.count - resolved.reduce((sum, r) => sum + r.hits, 0), rows,
    }, { actor } as any);
  };

  api.chat.registerChatCard({
    module: MODULE_ID,
    key: VOLLEY_CARD,
    template: `modules/${MODULE_ID}/templates/ht-mine-volley.hbs`,
    actions: {
      damage: async ({ message, data, actor, button }: any) => {
        const index = Number(button?.dataset?.index);
        const target = data.rows?.[index];
        const item: any = (globalThis as any).fromUuidSync?.(String(data.itemUuid ?? ""));
        const mode = item?.system?.rangedModes?.[Number(data.modeIndex) || 0];
        if (!target || target.rolled || !mode) return;
        const value = await ask(target.name, [row(L("Mine.HitsLanded"), number("hits", target.hits, "1")), hint(L("Mine.DodgeHint"))].join(""), L("Mine.RollDamage"));
        if (!value) return;
        const hits = Math.max(0, Math.min(target.hits, Math.floor(Number(value("hits")) || 0)));
        for (let i = 0; i < hits; i += 1) {
          await api.roll.damage({
            actor, item, mode: { index: Number(data.modeIndex) || 0, ranged: true },
            label: F("Mine.PelletLabel", { name: data.name, n: i + 1, of: hits, target: target.name }),
            formula: formulaOf(mode), damageType: mode.damageType ?? "pi-", armorDivisor: Number(mode.armorDivisor) || 1,
            halfDamage: target.halfDamage === true,
          } as any);
        }
        const rows = [...data.rows];
        rows[index] = { ...target, rolled: true, line: `${target.line} ${F("Mine.Rolled", { hits })}` };
        await api.chat.update(message, { ...data, rows });
      },
    },
  } as any);

  // The rows the system offers: a bounding mine's fragments are this action's; a directional mine's pellets at skill 9.
  Hooks.on(api.combat.hooks.weaponAttacks, (context: any) => {
    if (!on()) return;
    const facts = mineOf(context?.item);
    if (!facts) return;
    for (const entry of context.rows ?? []) {
      const r = entry?.row;
      if (!r || entry.kind !== "ranged") continue;
      if (facts.kind === "bounding" && r.fragmentation) {
        r.fragmentation = "";
        (r.notes ??= []).push({ label: L("Mine.BoundingNote"), hint: L("Mine.BoundingHint") });
      }
      if (facts.pellets && Number(entry.mode?.projectiles) > 1) {
        r.skillLevel = facts.pellets.skill;
        (r.notes ??= []).push({ label: L("Mine.PelletsNote"), hint: F("Mine.PelletsHint", { skill: facts.pellets.skill }) });
      }
    }
  });
}

