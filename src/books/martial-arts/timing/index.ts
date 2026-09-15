/**
 * Who acts first at the table (GURPS Martial Arts pp. 103, 108, 110).
 *
 * Who Draws First?: a GM tool settles a standoff between two fighters. Stop
 * Hits: a Wait's response arms one against a foe, both roll to hit as usual,
 * and the defense that follows carries the penalty. Cascading Waits: a GM tool
 * rolls the waiting fighters' Quick Contest and posts the order they act in.
 * A Matter of Inches: a length on melee weapons, and weapon weight and length
 * in those three contests, in feints, Beats, multiple parries and parrying
 * flails.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";
import { addExtensionFields, ITEM_EXTENSION_TYPES } from "../../../shared/extensions.js";
import {
  WEAPON_LENGTHS,
  absoluteWeight,
  drawCase,
  drawModifiers,
  drawWinner,
  lengthOf,
  longestReach,
  multipleParryPenalty,
  readyModifiers,
  relativeWeight,
  stopHitPenalized,
  stopHitPenalty,
  waitModifiers,
  waitOrder,
  type DrawSide,
  type ModifierKey,
  type StopHitRoll,
  type TimedWeapon,
  type WaitDistance,
  type WaitResult,
} from "./rules.js";

const L = (key: string) => game.i18n.localize(`GCC.MA.Timing.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.MA.Timing.${key}`, data);
const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ""));

/** The foe a Wait's Stop Hit is armed against, until the round ends. */
const ARMED = "ma-stop-hit-armed";
/** A fighter's roll to hit in a Stop Hit, until the round ends. */
const STOP_HIT_ROLL = "ma-stop-hit-roll";
const STOP_HIT_OPTION = "ma-stop-hit";
const FEINT_KIND_OPTION = "ma-feint-as";

interface StoredStopHit extends StopHitRoll { vs: string; itemId: string }

/** Adds the length field on weapons. */
export function initTiming(): void {
  const f = foundry.data.fields as any;
  addExtensionFields("Item", ITEM_EXTENSION_TYPES, { weaponLength: new f.StringField({ required: true, blank: true, initial: "" }) });
}

const traitNamed = (actor: any, pattern: RegExp) => [...(actor?.items ?? [])].some((i: any) => i.type === "trait" && pattern.test(String(i.name ?? "")));
const combatReflexes = (actor: any) => traitNamed(actor, /^combat reflexes/i);
const timeSense = (actor: any) => traitNamed(actor, /^enhanced time sense/i);
const trained = (actor: any) => traitNamed(actor, /^(trained by a master|weapon master)/i);
const optionValue = (actor: any, key: string) => actor?.getFlag?.("gworld", "maneuverOptions")?.[MODULE_ID]?.[key];
const chat = (content: string) => ChatMessage.implementation.create({ content: `<div class="gworld gworld-chat">${content}</div>` });
const lineLabels = (lines: ModifierKey[]) => lines.filter((l) => l.value).map((l) => ({ label: L(`Lines.${l.key}`), value: l.value }));

/** Registers the tools, the Stop Hit response and the hooks. */
export function readyTiming(api: GWorldApi, draws: () => boolean, stopHits: () => boolean, waits: () => boolean, inches: () => boolean): void {
  const rowsOf = (actor: any): any[] => ((api.actors.derived(actor)?.melee ?? []) as any[]).filter((r) => typeof r.skillLevel === "number" && r.usable !== false);
  const stOf = (actor: any) => Number(api.actors.attribute(actor, "ST")) || 10;
  const bare = (row: any) => !row?.itemId || row?.natural === true;
  const lengthOfRow = (actor: any, row: any) => {
    const item = row?.itemId ? actor?.items?.get?.(row.itemId) : null;
    return lengthOf(String(item?.name ?? row?.name ?? ""), item?.system?.extensions?.[MODULE_ID]?.weaponLength ?? null);
  };
  const timed = (actor: any, row: any): TimedWeapon => ({
    reach: longestReach(String(row?.reach ?? "")),
    length: lengthOfRow(actor, row),
    swing: row?.damageBase === "sw",
    weight: bare(row) ? 0 : Number(row?.weight) || 0,
  });
  const feels = (actor: any, row: any, feintOrParry = false) => relativeWeight({ st: stOf(actor), weaponSt: row?.minSt ?? null, bareHands: bare(row), unbalanced: row?.unbalanced === true, feintOrParry });
  const heft = (row: any) => absoluteWeight({ bareHands: bare(row), weight: Number(row?.weight) || 0, unbalanced: row?.unbalanced === true });
  /** The row a parry is made with: the parrying weapon's best, or bare hands. */
  const parryRow = (actor: any, itemId: string | undefined) => rowsOf(actor)
    .filter((r) => (itemId ? r.itemId === itemId : bare(r)) && r.parry !== null)
    .sort((a, b) => (Number(b.parry) || 0) - (Number(a.parry) || 0))[0] ?? null;
  const tokensPicked = () => {
    const actors = [...((globalThis as any).canvas?.tokens?.controlled ?? []), ...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
    return actors.filter((a: any, i: number) => actors.findIndex((b: any) => b.uuid === a.uuid) === i);
  };

  // ── A Matter of Inches: a weapon's length (p. 110) ──
  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "ma-weapon-length",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/ma-weapon-length.hbs`,
    visible: (item: any) => inches() && item?.type === "equipment" && (item.system?.meleeModes ?? []).length > 0,
    context: (item: any) => {
      const stored = String(item?.system?.extensions?.[MODULE_ID]?.weaponLength ?? "");
      const byName = lengthOf(String(item?.name ?? ""));
      return {
        byName: byName ? F("ByName", { length: L(`Lengths.${byName}`) }) : L("NotListed"),
        choices: WEAPON_LENGTHS.map((value) => ({ value, label: L(`Lengths.${value}`), selected: value === stored })),
      };
    },
    listeners: (element: HTMLElement, item: any) => {
      element.querySelector<HTMLSelectElement>("[data-ma-weapon-length]")?.addEventListener("change", (event) => {
        void item.update({ [`system.extensions.${MODULE_ID}.weaponLength`]: (event.target as HTMLSelectElement).value });
      });
    },
  });

  // ── Who Draws First? (p. 103) ──
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-who-draws-first",
    label: L("Draw.Title"),
    icon: "fa-solid fa-hand-back-fist",
    visible: draws,
    open: () => whoDrawsFirst(),
  });

  async function whoDrawsFirst(): Promise<void> {
    const fighters = tokensPicked();
    if (fighters.length !== 2) return void ui.notifications?.warn(L("Draw.Pick"));
    const column = (actor: any, i: number) => {
      const rows = rowsOf(actor).map((r, n) => `<option value="${n}">${esc(r.name)}${r.mode ? ` (${esc(r.mode)})` : ""}: ${r.skillLevel}</option>`).join("");
      const fastDraws = [...(actor.items ?? [])].filter((s: any) => s.type === "skill" && /^fast-draw/i.test(String(s.name ?? "")))
        .map((s: any) => `<option value="${esc(s.name)}">${esc(s.name)}: ${api.actors.skillLevel(actor, String(s.name)) ?? "-"}</option>`).join("");
      return `<fieldset style="flex:1"><legend>${esc(actor.name)}</legend>
        <label>${L("Draw.Weapon")} <select name="row${i}">${rows}</select></label>
        <label><input type="checkbox" name="ready${i}"> ${L("Draw.Ready")}</label>
        <label>${L("Draw.FastDraw")} <select name="fastDraw${i}"><option value="">${L("Draw.None")}</option>${fastDraws}</select></label>
        <label><input type="checkbox" name="greased${i}"> ${L("Lines.greased")}</label>
        <label><input type="checkbox" name="hand${i}"> ${L("Lines.handOnWeapon")}</label>
        <label>${L("Draw.Other")} <input type="number" name="other${i}" value="0" step="1"></label>
      </fieldset>`;
    };
    const form = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("Draw.Title") },
      content: `<div class="gworld" style="display:flex;gap:8px">${fighters.map(column).join("")}</div><p class="ihint">${L("Draw.OtherHint")}</p>`,
      ok: { label: L("Draw.Resolve"), callback: (_e: Event, button: any) => new (foundry.applications as any).ux.FormDataExtended(button.form).object },
      rejectClose: false,
    }) as Record<string, any> | null;
    if (!form) return;
    const sides = fighters.map((actor: any, i: number) => {
      const row = rowsOf(actor)[Number(form[`row${i}`]) || 0] ?? null;
      const fastDrawSkill = String(form[`fastDraw${i}`] ?? "");
      const side: DrawSide = {
        greased: Boolean(form[`greased${i}`]),
        handOnWeapon: Boolean(form[`hand${i}`]),
        swing: row?.damageBase === "sw",
        st: stOf(actor),
        weapon: { ...timed(actor, row), weaponSt: row?.minSt ?? null, bareHands: bare(row), unbalanced: row?.unbalanced === true },
      };
      return {
        actor,
        row,
        side,
        other: Number(form[`other${i}`]) || 0,
        ready: Boolean(form[`ready${i}`]),
        fastDrawSkill,
        fastDraw: fastDrawSkill ? api.actors.skillLevel(actor, fastDrawSkill) : null,
      };
    });
    const [a, b] = sides as [typeof sides[number], typeof sides[number]];
    if (!a.row || !b.row) return void ui.notifications?.warn(L("Draw.NoWeapon"));
    const on = inches();
    const drawing = (s: typeof a, foe: typeof a, extra: ModifierKey[] = []) => [
      ...lineLabels([...drawModifiers(s.side, foe.side, on), ...extra]),
      ...(s.other ? [{ label: L("Draw.Other"), value: s.other }] : []),
    ];
    const label = F("Draw.Label", { a: a.actor.name, b: b.actor.name });
    const standoff = drawCase({ ready: a.ready, fastDraw: a.fastDraw }, { ready: b.ready, fastDraw: b.fastDraw });
    let result = "";
    const first = (s: typeof a) => F("Draw.First", { name: s.actor.name });
    const simultaneous = L("Draw.Simultaneous");
    const contest = async (useFastDraw: boolean) => {
      const outcome: any = await api.roll.quickContest({
        label,
        first: { actor: a.actor, base: useFastDraw ? Number(a.fastDraw) : a.row.skillLevel, note: useFastDraw ? a.fastDrawSkill : a.row.name, modifiers: drawing(a, b) },
        second: { actor: b.actor, base: useFastDraw ? Number(b.fastDraw) : b.row.skillLevel, note: useFastDraw ? b.fastDrawSkill : b.row.name, modifiers: drawing(b, a) },
        tags: ["whoDrawsFirst"],
      } as any);
      const winner = drawWinner("contest", outcome?.outcome ?? "tie", true);
      return winner === "simultaneous" ? simultaneous : first(winner === "first" ? a : b);
    };
    if (standoff.kind === "bothReady") result = L("Draw.BothReady");
    else if (standoff.kind === "readyStrikes") result = first(standoff.side === "a" ? a : b);
    else if (standoff.kind === "readyVsFastDraw") {
      const ready = standoff.side === "a" ? a : b;
      const drawer = standoff.side === "a" ? b : a;
      const outcome: any = await api.roll.quickContest({
        label,
        first: { actor: ready.actor, base: ready.row.skillLevel, note: ready.row.name, modifiers: lineLabels(readyModifiers(ready.side, combatReflexes(ready.actor), on)) },
        second: { actor: drawer.actor, base: Number(drawer.fastDraw), note: drawer.fastDrawSkill, modifiers: drawing(drawer, ready, [{ key: "againstReady", value: -10 }]) },
        tags: ["whoDrawsFirst"],
      } as any);
      const winner = drawWinner("readyVsFastDraw", outcome?.outcome ?? "tie", true);
      result = first(winner === "second" ? drawer : ready);
    } else if (standoff.kind === "fastDrawRoll") {
      const drawer = standoff.side === "a" ? a : b;
      const foe = standoff.side === "a" ? b : a;
      const outcome: any = await api.roll.success({ actor: drawer.actor, base: Number(drawer.fastDraw), label, skill: drawer.fastDrawSkill, modifiers: drawing(drawer, foe) } as any);
      if (outcome?.criticalFailure) result = F("Draw.ThrowsAway", { name: drawer.actor.name, foe: foe.actor.name });
      else if (outcome?.success) result = first(drawer);
      else result = await contest(false);
    } else result = await contest(standoff.fastDraw);
    // A greased scabbard leaves the weapon greasy (p. 103).
    for (const s of sides) {
      if (s.side.greased && s.actor.isOwner) {
        await api.actors.applyCondition(s.actor, { module: MODULE_ID, key: "ma-greasy-weapon", label: L("Draw.Greasy"), effects: { modifiers: [{ label: L("Draw.Greasy"), value: -1, rolls: ["attack", "parry"] }] } } as any);
      }
    }
    await chat(`<div class="gc-head"><span class="gc-label">${L("Draw.Title")}</span></div><div class="gc-result">${esc(result)}</div>`);
  }

  // ── Stop Hits (p. 108) ──
  api.combat.registerManeuverOption({
    module: MODULE_ID,
    key: STOP_HIT_OPTION,
    maneuver: "wait",
    label: L("StopHit.Option"),
    available: stopHits,
    response: {
      label: L("StopHit.Respond"),
      trigger: async (actor: any) => {
        if (!stopHits()) return;
        const targets = [...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
        if (targets.length !== 1) return void ui.notifications?.warn(L("StopHit.Pick"));
        await api.combat.setCombatState(actor, MODULE_ID, ARMED, String(targets[0].uuid), "round");
        ui.notifications?.info(F("StopHit.Armed", { name: String(actor?.name ?? ""), foe: String(targets[0].name ?? "") }));
      },
    },
  } as any);

  const armedAgainst = (actor: any) => String(api.combat.getCombatState(actor, MODULE_ID, ARMED) ?? "");
  const stopHitRoll = (actor: any) => (api.combat.getCombatState(actor, MODULE_ID, STOP_HIT_ROLL) as StoredStopHit | undefined) ?? null;
  /** An attack in a Stop Hit, noted before its roll and stored once it is rolled. */
  const pending = new Map<string, Omit<StoredStopHit, "hit" | "margin">>();

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor?.uuid) return;
    pending.delete(actor.uuid);
    if (!stopHits() || !actor.isOwner || context.ranged || context.mode?.ranged) return;
    const targets = (context.targets ?? []) as any[];
    if (targets.length !== 1 || !targets[0]?.uuid) return;
    const foe = targets[0];
    if (armedAgainst(actor) !== foe.uuid && armedAgainst(foe) !== actor.uuid) return;
    const rows = rowsOf(actor);
    const row = context.item
      ? rows.find((r) => r.itemId === context.item.id && r.modeIndex === Number(context.mode?.index ?? 0)) ?? rows.find((r) => r.itemId === context.item.id)
      : rows.find((r) => bare(r) && String(context.dataset?.rollLabel ?? "").includes(String(r.name ?? ""))) ?? null;
    pending.set(actor.uuid, { vs: String(foe.uuid), itemId: String(context.item?.id ?? ""), swing: row?.damageBase === "sw", weight: row ? feels(actor, row) : 0, weapon: timed(actor, row) });
  });

  Hooks.on(api.combat.hooks.afterSuccessRoll, (context: any) => {
    const actor = context?.actor;
    const noted = actor?.uuid ? pending.get(actor.uuid) : undefined;
    if (!noted || context.kind !== "attack") return;
    pending.delete(actor.uuid);
    const outcome = context.outcome ?? {};
    const roll: StoredStopHit = { ...noted, hit: outcome.success === true, margin: Number(outcome.margin) || 0 };
    void api.combat.setCombatState(actor, MODULE_ID, STOP_HIT_ROLL, roll, "round");
  });

  Hooks.on(api.combat.hooks.defenseModifiers, (context: any) => {
    const defender = context?.defender;
    const attacker = context?.attacker;
    if (!defender?.uuid || !attacker?.uuid) return;
    const on = inches();

    // The defense after a Stop Hit: -1, or -3 to parry with the attacking weapon.
    if (stopHits()) {
      const theirs = stopHitRoll(attacker);
      if (theirs && theirs.vs === defender.uuid) {
        const stored = stopHitRoll(defender);
        const mine = stored && stored.vs === attacker.uuid ? stored : null;
        const penalized = stopHitPenalized(theirs, mine ?? { hit: false, margin: 0 }, on);
        if (penalized.b) {
          const sameWeapon = context.defense === "parry" && Boolean(mine?.itemId) && context.parryWeapon?.itemId === mine?.itemId;
          context.modifiers.push({ label: L("StopHit.Penalty"), value: stopHitPenalty(sameWeapon) });
        }
      }
    }

    if (!on || context.defense !== "parry") return;
    const row = parryRow(defender, context.parryWeapon?.natural ? undefined : context.parryWeapon?.itemId);
    // Multiple parries, by relative weight (p. 110).
    const previous = Number(context.defenseCounts?.parries) || 0;
    const line = (context.modifiers ?? []).find((m: any) => m?.label === game.i18n.localize("GWORLD.Defense.MultipleParries"));
    if (previous && line) {
      const basic = Number((api.rules as any).multipleParryPenalty?.(previous, { fencing: context.parryWeapon?.isFencing === true, trained: trained(defender) })) || 0;
      const adjusted = multipleParryPenalty(previous, feels(defender, row, true), trained(defender));
      // Scaled, so another rule's halving of the same line still applies to it.
      if (basic && adjusted !== basic) line.value = Math.floor((Number(line.value) * adjusted) / basic) || 0;
    }
    // Parrying a flail, by absolute weight (p. 110).
    if (context.attackWeapon?.flail) {
      const value = 2 * heft(row);
      if (value) context.modifiers.push({ label: L("Lines.flailWeight"), value });
    }
  });

  // A fencing weapon may try to parry a flail, at its weight's penalty (p. 110).
  Hooks.on(api.combat.hooks.defenseChoices, (context: any) => {
    if (inches() && context?.attackWeapon?.flail) context.parriesFlail = true;
  });

  // A Stop Hit's weapon may parry that foe though it was unbalanced or went unready (p. 108).
  Hooks.on(api.combat.hooks.parryWeapons, (context: any) => {
    if (!stopHits() || !context?.actor) return;
    const roll = stopHitRoll(context.actor);
    if (!roll?.itemId) return;
    for (const candidate of context.candidates ?? []) {
      if (candidate.itemId === roll.itemId && candidate.excluded) candidate.excluded = false;
    }
  });

  // Weight in feints and Beats (p. 110): the feinter's weapon here, the foe's parry below.
  let feinter: { uuid: string; beat: boolean } | null = null;
  Hooks.on(api.combat.hooks.feintModifiers, (context: any) => {
    feinter = null;
    if (!inches() || !context?.actor) return;
    const beat = optionValue(context.actor, FEINT_KIND_OPTION) === "beat";
    feinter = { uuid: String(context.actor.uuid), beat };
    const rows = rowsOf(context.actor);
    const row = context.item ? rows.find((r) => r.itemId === context.item.id && r.modeIndex === Number(context.mode?.index ?? 0)) ?? rows.find((r) => r.itemId === context.item.id) : rows.find(bare);
    const weight = feels(context.actor, row, true);
    if (weight) context.modifiers.push({ label: L("Lines.weight"), value: weight });
    if (beat && heft(row)) context.modifiers.push({ label: L("Lines.beatWeight"), value: heft(row) });
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!inches() || !feinter || !(context?.tags ?? []).includes("feint")) return;
    if (context.actor?.uuid === feinter.uuid || context.opponent?.uuid !== feinter.uuid) return;
    const row = parryRow(context.actor, api.actors.derived(context.actor)?.defenses?.parry?.weapon?.itemId || undefined);
    const weight = feels(context.actor, row, true);
    if (weight) context.modifiers.push({ label: L("Lines.weight"), value: weight });
    if (feinter.beat && heft(row)) context.modifiers.push({ label: L("Lines.beatWeight"), value: heft(row) });
  });

  // ── Cascading Waits (p. 108) ──
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "ma-cascading-waits",
    label: L("Waits.Title"),
    icon: "fa-solid fa-hourglass-half",
    visible: waits,
    open: () => cascadingWaits(),
  });

  async function cascadingWaits(): Promise<void> {
    const fighters = tokensPicked();
    if (fighters.length < 2) return void ui.notifications?.warn(L("Waits.Pick"));
    const distances = ["none", "step", ...Array.from({ length: 9 }, (_v, n) => String(n + 2))];
    const line = (actor: any, i: number) => {
      const scores = [`<option value="dx">DX: ${api.actors.attribute(actor, "DX") ?? "-"}</option>`, ...rowsOf(actor).map((r, n) => `<option value="${n}">${esc(r.name)}${r.mode ? ` (${esc(r.mode)})` : ""}: ${r.skillLevel}</option>`)].join("");
      return `<tr><td>${esc(actor.name)}</td>
        <td><input type="checkbox" name="proceed${i}" checked></td>
        <td><select name="score${i}">${scores}</select></td>
        <td><select name="distance${i}">${distances.map((d) => `<option value="${d}">${Number(d) ? F("Waits.Yards", { yards: d }) : L(`Waits.${d}`)}</option>`).join("")}</select></td>
        <td><input type="checkbox" name="late${i}"></td></tr>`;
    };
    const form = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("Waits.Title") },
      content: `<div class="gworld"><table class="gt"><thead><tr><th></th><th>${L("Waits.Proceed")}</th><th>${L("Waits.Score")}</th><th>${L("Waits.Distance")}</th><th>${L("Waits.Late")}</th></tr></thead><tbody>${fighters.map(line).join("")}</tbody></table></div>`,
      ok: { label: L("Waits.Roll"), callback: (_e: Event, button: any) => new (foundry.applications as any).ux.FormDataExtended(button.form).object },
      rejectClose: false,
    }) as Record<string, any> | null;
    if (!form) return;
    const on = inches();
    const results: WaitResult[] = [];
    const names = new Map<string, string>();
    const waiting: string[] = [];
    for (const [i, actor] of fighters.entries()) {
      if (!form[`proceed${i}`]) {
        waiting.push(String(actor.name));
        continue;
      }
      const choice = String(form[`score${i}`] ?? "dx");
      const row = choice === "dx" ? null : rowsOf(actor)[Number(choice)] ?? null;
      const raw = String(form[`distance${i}`] ?? "step");
      const distance: WaitDistance = raw === "none" || raw === "step" ? raw : Number(raw) || "step";
      const lines = waitModifiers({
        combatReflexes: combatReflexes(actor),
        basicSpeed: Number(api.actors.derived(actor)?.basicSpeed) || 0,
        distance,
        late: Boolean(form[`late${i}`]),
        swing: row?.damageBase === "sw",
        weight: row ? feels(actor, row) : 0,
      }, on);
      const outcome: any = await api.roll.success({
        actor,
        base: row ? row.skillLevel : Number(api.actors.attribute(actor, "DX")) || 10,
        label: F("Waits.RollLabel", { name: actor.name }),
        ...(row?.skillName ? { skill: row.skillName } : {}),
        modifiers: lineLabels(lines),
        tags: ["cascadingWaits"],
      } as any);
      const id = `${i}`;
      names.set(id, String(actor.name));
      results.push({ id, success: outcome?.success === true, margin: Number(outcome?.margin) || 0, ets: timeSense(actor), ...(row ? { weapon: timed(actor, row) } : {}) });
    }
    const order = waitOrder(results, on);
    const items = order.map((group) => `<li>${esc(group.map((id) => names.get(id)).join(", "))}${group.length > 1 ? ` <span class="gc-mod">${L("Waits.Together")}</span>` : ""}</li>`).join("");
    await chat(`<div class="gc-head"><span class="gc-label">${L("Waits.Title")}</span></div>
      <ol class="gc-result">${items}</ol>
      ${waiting.length ? `<div class="gc-note">${esc(F("Waits.StillWaiting", { names: waiting.join(", ") }))}</div>` : ""}`);
  }
}
