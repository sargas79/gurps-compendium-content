/**
 * What the ordnance rules share: chat lines, a small dialog, the best of
 * several skills, the targeted tokens, and a clock for fuses that counts a
 * combat's rounds as seconds and the world's time outside one.
 */

import { MODULE_ID, type GWorldApi } from "../../../shared/module.js";

export const L = (key: string) => game.i18n.localize(`GCC.HT.Ordnance.${key}`);
export const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Ordnance.${key}`, data);
export const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

export const d6 = (): number => Math.floor(CONFIG.Dice.randomUniform() * 6) + 1;
export const roll3d = (): number => d6() + d6() + d6();

export const isActiveGm = () => Boolean((game as any).users?.activeGM?.isSelf ?? (game as any).user?.isGM);

export async function say(actor: any, title: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

function field(form: HTMLElement | null | undefined, el: HTMLInputElement | HTMLSelectElement): string {
  if ((el as HTMLInputElement).type === "checkbox") return (el as HTMLInputElement).checked ? "on" : "";
  return el.value ?? "";
}

/** A dialog of the given controls; the values by name, or null when closed. */
export async function ask(title: string, content: string, label: string): Promise<((name: string) => string) | null> {
  const values: any = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">${content}</div>`,
    ok: {
      label,
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const out: Record<string, string> = {};
        for (const el of Array.from(form?.querySelectorAll<HTMLInputElement>("[name]") ?? [])) out[el.name] = field(form, el);
        return out;
      },
    },
    rejectClose: false,
  });
  return values && typeof values === "object" ? (name: string) => String(values[name] ?? "") : null;
}

export const row = (label: string, control: string) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(label)}</span>${control}</label>`;
export const number = (name: string, value: number, step = "any") => `<input type="number" name="${name}" value="${value}" step="${step}" style="width:90px">`;
export const select = (name: string, options: Array<{ value: string; label: string; selected?: boolean }>) =>
  `<select name="${name}" style="width:240px">${options.map((o) => `<option value="${esc(o.value)}"${o.selected ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
export const checkbox = (name: string, label: string, checked = false) => `<label class="icheck"><input type="checkbox" name="${name}"${checked ? " checked" : ""}> ${esc(label)}</label>`;
export const hint = (text: string) => `<p class="ihint" style="margin:0">${esc(text)}</p>`;

/** The best of several skills the actor has, each at its modifier, or null for none known. */
export function bestOf(api: GWorldApi, actor: any, choices: ReadonlyArray<{ skill: string; modifier: number }>): { skill: string; level: number; modifier: number } | null {
  let best: { skill: string; level: number; modifier: number } | null = null;
  for (const choice of choices) {
    const level = api.actors.skillLevel(actor, choice.skill);
    if (level === null || level === undefined) continue;
    if (!best || Number(level) + choice.modifier > best.level + best.modifier) best = { skill: choice.skill, level: Number(level), modifier: choice.modifier };
  }
  return best;
}

/** Rolls the best of the skills, with any extra lines; null (and a warning) where the actor knows none. */
export async function skillRoll(api: GWorldApi, actor: any, choices: ReadonlyArray<{ skill: string; modifier: number }>, label: string, extra: Array<{ label: string; value: number }> = [], tags: string[] = []): Promise<any | null> {
  const use = bestOf(api, actor, choices);
  if (!use) {
    ui.notifications?.warn(F("NoSkill", { skills: choices.map((c) => c.skill).join(", ") }));
    return null;
  }
  const modifiers = [...(use.modifier ? [{ label: F("SkillModifier", { skill: use.skill }), value: use.modifier }] : []), ...extra];
  return api.roll.success({ actor, base: use.level, label, skill: use.skill, modifiers, tags: ["ordnance", ...tags] } as any);
}

/** The tokens this user targets. */
export const targetedTokens = (): any[] => [...((game as any).user?.targets ?? [])];

/** Yards between two tokens' centres on the scene. */
export function yardsBetween(a: any, b: any): number | null {
  const scene = (globalThis as any).canvas?.scene;
  const p = a?.center;
  const q = b?.center;
  if (!scene || !p || !q) return null;
  const perYard = (Number(scene.grid?.size) || 100) / (Number(scene.grid?.distance) || 1);
  return Math.round((Math.hypot(p.x - q.x, p.y - q.y) / perYard) * 10) / 10;
}

/** A moment on the fuse clock: a combat's round, or the world's time outside one. */
export interface ClockStamp {
  combat: string | null;
  round: number;
  time: number;
}

/** Now, for an actor: the round of the combat they are in (a second each), and the world's time. */
export function clockNow(actor: any): ClockStamp {
  const combat = (game as any).combat;
  const inIt = combat?.started && [...(combat.combatants ?? [])].some((c: any) => c?.actor?.id === actor?.id);
  return { combat: inIt ? String(combat.id) : null, round: inIt ? Number(combat.round) || 0 : 0, time: Number((game as any).time?.worldTime) || 0 };
}

/** Seconds from a stamp to now: rounds within the same combat, else world time. */
export function secondsSince(stamp: ClockStamp | null | undefined, now: ClockStamp): number {
  if (!stamp) return 0;
  if (stamp.combat && stamp.combat === now.combat) return Math.max(0, now.round - stamp.round);
  return Math.max(0, Math.floor(now.time - stamp.time));
}

/** A module flag on an item, read safely. */
export const itemFlag = (item: any, key: string): any => item?.getFlag?.(MODULE_ID, key) ?? item?.flags?.[MODULE_ID]?.[key];

/** The item's first mode that explodes, or its first ranged mode, with where it is. */
export function mainMode(item: any): { mode: any; index: number; ranged: boolean } | null {
  const ranged: any[] = item?.system?.rangedModes ?? [];
  const melee: any[] = item?.system?.meleeModes ?? [];
  const r = ranged.findIndex((m) => m?.explosive === true);
  if (r >= 0) return { mode: ranged[r], index: r, ranged: true };
  const m = melee.findIndex((x) => x?.explosive === true);
  if (m >= 0) return { mode: melee[m], index: m, ranged: false };
  return ranged.length ? { mode: ranged[0], index: 0, ranged: true } : null;
}

/** A stored mode's damage formula. */
export const formulaOf = (mode: any): string => String(mode?.damageFormula ?? mode?.damage ?? "");
