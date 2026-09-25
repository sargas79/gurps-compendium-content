/**
 * Forging a document with a book's tools, registered with the system through
 * the add-on API, for every book that prints forgery gear (Ultra-Tech p. 97;
 * High-Tech pp. 213-214).
 *
 * Each book registers its table in `FORGERY_TABLES` -- which records are its
 * tools, the skills each forges with, what the roll is at for a document of a
 * TL, and the switch and text it uses -- then calls `readyForgery`, which
 * registers once however many books call it: a row button on a tool that asks
 * the skill and the document's TL, and rolls what the tool's own book says.
 */

import { BookTables, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";

/** What a forgery roll comes to with a tool, as its book works it out. */
export type ForgeryOutcome =
  /** The tool can't do it: the card says why, and nothing is rolled. */
  | { fails: string }
  /**
   * The roll: `base` is the level rolled against (the forger's skill, or the
   * tool's own), `skill` names it where it is the forger's, `modifiers` are
   * the lines the tool adds, and `lines` go on a card after the roll;
   * `after` runs once the roll is made, and its lines join them.
   */
  | { base: number; skill?: string; modifiers: Array<{ label: string; value: number }>; lines?: string[]; after?: () => Promise<string[]> };

export interface ForgeryTable extends BookTable {
  /** Whether the book's forgery rule is on. */
  on: () => boolean;
  /** The localization namespace holding the book's `Forgery.*` text. */
  i18n: string;
  /** The tool a record is, as the book names it, or null. */
  tool: (item: any) => string | null;
  /** The skills the tool forges with, the first offered first. */
  skills: (tool: string) => string[];
  /** The roll, given the forger, the tool and the document. */
  roll: (api: GWorldApi, options: { actor: any; item: any; tool: string; skill: string; toolTl: number; documentTl: number }) => ForgeryOutcome;
}

/** Every book's forgery table. */
export const FORGERY_TABLES = new BookTables<ForgeryTable>();

const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));
const tlOf = (item: any): number => Number(/\d+/.exec(String(item?.system?.tl ?? ""))?.[0]) || 0;

/** The tool a record is, with its table, where that table's rule is on. */
export function forgeryToolOf(item: any): { table: ForgeryTable; tool: string } | null {
  if (item?.type !== "equipment") return null;
  for (const table of FORGERY_TABLES.all) {
    if (!table.on()) continue;
    const tool = table.tool(item);
    if (tool) return { table, tool };
  }
  return null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;

/** Forges a document with a tool: the skill and the document's TL asked, then its book's roll. */
export async function forge(api: GWorldApi, item: any, actor: any): Promise<void> {
  const found = forgeryToolOf(item);
  if (!found || !actor) return;
  const { table, tool } = found;
  const L = (key: string) => game.i18n.localize(`${table.i18n}.Forgery.${key}`);
  // A tool that states no TL is taken at the lowest its book covers.
  const toolTl = tlOf(item) || (table.tls?.min ?? 0);
  const skills = table.skills(tool);
  const title = L("Title");
  const answer = (await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${
      row(L("Skill"), `<select name="skill">${skills.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>`)
      + row(L("DocumentTl"), `<input type="number" name="tl" value="${toolTl}" min="0" max="12" style="width:70px" />`)
    }</div>`,
    ok: {
      label: title,
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application")!;
        return {
          skill: form.querySelector<HTMLSelectElement>("[name=skill]")?.value ?? skills[0] ?? "Forgery",
          tl: Number(form.querySelector<HTMLInputElement>("[name=tl]")?.value) || 0,
        };
      },
    },
    rejectClose: false,
  })) as { skill: string; tl: number } | null;
  if (!answer) return;
  const outcome = table.roll(api, { actor, item, tool, skill: answer.skill, toolTl, documentTl: answer.tl });
  if ("fails" in outcome) return void say(actor, String(item.name), [outcome.fails]);
  const label = game.i18n.format(`${table.i18n}.Forgery.Label`, { name: item.name, skill: answer.skill });
  const result = await api.roll.success({ actor, base: outcome.base, ...(outcome.skill ? { skill: outcome.skill } : {}), label, modifiers: outcome.modifiers } as any);
  const lines = [...(outcome.lines ?? []), ...(result && outcome.after ? await outcome.after() : [])];
  if (lines.length) await say(actor, String(item.name), lines);
}

let readied = false;

/** Registers the row button on every book's forgery tools, once whichever books ask. */
export function readyForgery(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "forge",
    itemTypes: ["equipment"],
    // The first table's text: the button's label is fixed when it registers.
    label: game.i18n.localize(`${FORGERY_TABLES.all[0]?.i18n ?? "GCC.UT.Stealth"}.Forgery.Title`),
    icon: "fa-solid fa-id-card",
    visible: (item) => forgeryToolOf(item) !== null,
    run: (item, actor) => forge(api, item, actor),
  });
}

/** Forgets that the engine registered. For tests. */
export function resetForgery(): void {
  readied = false;
}
