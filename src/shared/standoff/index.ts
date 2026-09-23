/**
 * Who Draws First? at the table, for every book that prints it (Martial Arts
 * p. 103, High-Tech p. 82): a GM tool settles a standoff between two fighters,
 * one selected and one targeted, or both targeted.
 *
 * The flow is the same in both books: pick each fighter's weapon, whether it
 * is out, and the Fast-Draw skill; the rules then call for no roll, a
 * Fast-Draw roll, or a Quick Contest, and the chat says who strikes first.
 * Each book passes its profile: the attacks a fighter may pick, the special
 * modifiers it prints, the odd positions, and its own text.
 */

import type { GWorldApi } from "../module.js";
import { AGAINST_READY, drawCase, drawWinner, type ModifierKey } from "./rules.js";

export * from "./rules.js";

type Line = { label: string; value: number };

/** One fighter in a standoff, with the book's own data for its side. */
export interface Fighter<S> {
  actor: any;
  row: any;
  side: S;
  other: number;
  ready: boolean;
  fastDrawSkill: string;
  fastDraw: number | null;
}

/** What a book brings to the standoff. */
export interface StandoffProfile<S> {
  /**
   * Where the book's text sits: "GCC.MA.Timing" reads "GCC.MA.Timing.Draw.Title"
   * and the lines' labels as "GCC.MA.Timing.Lines.<key>".
   */
  i18n: string;
  /** The attacks a fighter may draw and strike with. */
  rows(actor: any): any[];
  /** The checkboxes beside "weapon ready", by form name and line key. */
  checks: ReadonlyArray<{ name: string; line: string }>;
  /** The book's data for one side, from its attack and its checked boxes. */
  side(actor: any, row: any, checked: Record<string, boolean>): S;
  /** A drawing fighter's special modifiers against a foe. */
  drawLines(self: Fighter<S>, foe: Fighter<S>): ModifierKey[];
  /** The ready fighter's modifiers against a Fast-Draw. */
  readyLines(self: Fighter<S>): ModifierKey[];
  /** Fast-Draw from odd positions, which applies whatever skill is rolled. */
  oddPositions(self: Fighter<S>): Line[];
  /** What follows the standoff, such as a greasy weapon. */
  after?(fighters: ReadonlyArray<Fighter<S>>): Promise<void>;
}

const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ""));

/** The controlled and targeted tokens' actors, each once. */
function tokensPicked(): any[] {
  const actors = [...((globalThis as any).canvas?.tokens?.controlled ?? []), ...((game as any).user?.targets ?? [])].map((t: any) => t?.actor).filter(Boolean);
  return actors.filter((a: any, i: number) => actors.findIndex((b: any) => b.uuid === a.uuid) === i);
}

/** Runs a standoff between the two fighters picked on the canvas. */
export async function whoDrawsFirst<S>(api: GWorldApi, profile: StandoffProfile<S>): Promise<void> {
  const L = (key: string) => game.i18n.localize(`${profile.i18n}.${key}`);
  const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${profile.i18n}.${key}`, data);
  const lineLabels = (lines: ModifierKey[]) => lines.filter((l) => l.value).map((l) => ({ label: L(`Lines.${l.key}`), value: l.value }));

  const fighters = tokensPicked();
  if (fighters.length !== 2) return void ui.notifications?.warn(L("Draw.Pick"));
  const column = (actor: any, i: number) => {
    const rows = profile.rows(actor).map((r, n) => `<option value="${n}">${esc(r.name)}${r.mode ? ` (${esc(r.mode)})` : ""}: ${r.skillLevel}</option>`).join("");
    const fastDraws = [...(actor.items ?? [])].filter((s: any) => s.type === "skill" && /^fast-draw/i.test(String(s.name ?? "")))
      .map((s: any) => `<option value="${esc(s.name)}">${esc(s.name)}: ${api.actors.skillLevel(actor, String(s.name)) ?? "-"}</option>`).join("");
    const checks = profile.checks.map((c) => `<label><input type="checkbox" name="${c.name}${i}"> ${L(`Lines.${c.line}`)}</label>`).join("\n        ");
    return `<fieldset style="flex:1"><legend>${esc(actor.name)}</legend>
        <label>${L("Draw.Weapon")} <select name="row${i}">${rows}</select></label>
        <label><input type="checkbox" name="ready${i}"> ${L("Draw.Ready")}</label>
        <label>${L("Draw.FastDraw")} <select name="fastDraw${i}"><option value="">${L("Draw.None")}</option>${fastDraws}</select></label>
        ${checks}
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
  const sides: Array<Fighter<S>> = fighters.map((actor: any, i: number) => {
    const row = profile.rows(actor)[Number(form[`row${i}`]) || 0] ?? null;
    const fastDrawSkill = String(form[`fastDraw${i}`] ?? "");
    const checked = Object.fromEntries(profile.checks.map((c) => [c.name, Boolean(form[`${c.name}${i}`])]));
    return {
      actor,
      row,
      side: profile.side(actor, row, checked),
      other: Number(form[`other${i}`]) || 0,
      ready: Boolean(form[`ready${i}`]),
      fastDrawSkill,
      fastDraw: fastDrawSkill ? api.actors.skillLevel(actor, fastDrawSkill) : null,
    };
  });
  const [a, b] = sides as [Fighter<S>, Fighter<S>];
  if (!a.row || !b.row) return void ui.notifications?.warn(L("Draw.NoWeapon"));
  const drawing = (s: Fighter<S>, foe: Fighter<S>, extra: ModifierKey[] = []) => [
    ...lineLabels([...profile.drawLines(s, foe), ...extra]),
    ...profile.oddPositions(s),
    ...(s.other ? [{ label: L("Draw.Other"), value: s.other }] : []),
  ];
  const label = F("Draw.Label", { a: a.actor.name, b: b.actor.name });
  const standoff = drawCase({ ready: a.ready, fastDraw: a.fastDraw }, { ready: b.ready, fastDraw: b.fastDraw });
  let result = "";
  const first = (s: Fighter<S>) => F("Draw.First", { name: s.actor.name });
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
      first: { actor: ready.actor, base: ready.row.skillLevel, note: ready.row.name, modifiers: lineLabels(profile.readyLines(ready)) },
      second: { actor: drawer.actor, base: Number(drawer.fastDraw), note: drawer.fastDrawSkill, modifiers: drawing(drawer, ready, [{ key: "againstReady", value: AGAINST_READY }]) },
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
  await profile.after?.(sides);
  await ChatMessage.implementation.create({ content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${L("Draw.Title")}</span></div><div class="gc-result">${esc(result)}</div></div>` });
}
