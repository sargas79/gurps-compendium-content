/**
 * Who hears a sound some of the book's gear makes: a grapnel landing on stone
 * (p. 55), a whistle blown (p. 58), a bow's twang (p. 201). The listener is
 * the one targeted token; the roll is their Hearing, with the Hearing Distance
 * Table's line for how far they are from the sound (Campaigns p. 358), which
 * the system adds from `distance` (API 1.117.0), and the gear's own lines.
 */

import type { GWorldApi } from "../../shared/module.js";

const L = (key: string) => game.i18n.localize(`GCC.HT.Hearing.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GCC.HT.Hearing.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** A sound to be heard: what makes it, how far it carries on an unmodified roll, and the gear's own lines. */
export interface Sound {
  /** What made it, for the roll's label ("the grapnel", "the whistle"). */
  name: string;
  /** The yards at which it is heard on an unmodified Hearing roll. */
  heardAt: number;
  /** The gear's own lines on the roll: a padded grapnel's -2, a bow's silencers. */
  lines?: Array<{ label: string; value: number }>;
  /** A note for the dialog: when the sound is made at all. */
  note?: string;
}

/** The listener's Hearing as the system worked it out; null for one who can't hear (Deafness). */
export function hearingScore(api: GWorldApi, actor: any): number | null {
  const derived = api.actors.derived(actor) as any;
  const row = (derived?.senses ?? []).find((s: any) => s?.sense === "hearing");
  if (row && row.score === null) return null;
  return Number(row?.score) || Number(derived?.per) || 10;
}

function yardsBetween(a: any, b: any): number | null {
  const stage = (globalThis as any).canvas;
  const from = a?.getActiveTokens?.()?.[0];
  const to = b?.getActiveTokens?.()?.[0];
  if (!from?.center || !to?.center || !stage?.grid?.measurePath) return null;
  const distance = Number(stage.grid.measurePath([from.center, to.center])?.distance);
  return Number.isFinite(distance) ? distance : null;
}

/**
 * Asks how far the targeted listener is from the sound (their distance from
 * the one making it, where the map knows both) and rolls their Hearing.
 */
export async function hearSound(api: GWorldApi, source: any, sound: Sound): Promise<void> {
  const listener = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!listener) return void ui.notifications?.warn(L("NoListener"));
  const base = hearingScore(api, listener);
  if (base === null) return void ui.notifications?.warn(F("Deaf", { name: String(listener.name ?? "") }));
  const measured = yardsBetween(source, listener);
  const row = (label: string, input: string) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${esc(label)}</span>${input}</label>`;
  const asked = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("Title", { name: sound.name }) },
    content: `<div class="gworld" style="display:grid;gap:6px">
      <p class="ihint">${esc(F("HeardAt", { name: sound.name, yards: sound.heardAt }))}${sound.note ? ` ${esc(sound.note)}` : ""}</p>
      ${row(L("Yards"), `<input type="number" name="yards" value="${measured === null ? sound.heardAt : Math.round(measured * 100) / 100}" min="0" step="any" style="width:90px">`)}
      ${row(L("Other"), `<input type="number" name="other" value="0" step="1" style="width:90px">`)}
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_e: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const get = (name: string) => form?.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return { yards: Number(get("yards")?.value) || 0, other: Math.trunc(Number(get("other")?.value) || 0) };
      },
    },
    rejectClose: false,
  }) as { yards: number; other: number } | null;
  if (!asked) return;
  const modifiers = [...(sound.lines ?? []).filter((l) => l.value !== 0)];
  if (asked.other) modifiers.push({ label: L("Other"), value: asked.other });
  await api.roll.success({
    actor: listener,
    base,
    skill: "Hearing",
    subject: source,
    tags: ["hearing", "detection"],
    label: F("Roll", { name: String(listener.name ?? ""), sound: sound.name }),
    modifiers,
    distance: { yards: Math.max(0, asked.yards), baseYards: sound.heardAt },
  } as any);
}
