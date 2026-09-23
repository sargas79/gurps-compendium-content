/**
 * The vehicle engine, for every book that prints vehicle systems (Ultra-Tech
 * pp. 222-235; High-Tech pp. 228-235): the GM tool's dialog and card, who is
 * aboard which vehicle, occupant restraints, and armour made against shaped
 * charges.
 *
 * Each book keeps its own GM tool, its own switches and its own figures:
 *
 *   - `RESTRAINT_TABLES`: a book's restraints (Ultra-Tech's crashweb,
 *     High-Tech's airbag), each a condition on the occupant with DR against
 *     crushing damage and a DX roll to get free. One injury hook serves every
 *     book's, each only while its own switch is on.
 *   - `SHAPED_ARMOUR_TABLES`: a book's armour kinds made against shaped
 *     charges (Ultra-Tech's EMA, High-Tech's spaced and laminated armour),
 *     with their multipliers (`rules.ts`).
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { restraintAbsorb, restraintStops, type ShapedArmourTable } from "./rules.js";

const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

// ── the GM tool's dialog and card ──

/** The token the GM has selected, and the ones targeted. */
export function picked(): { selected: any; targets: any[] } {
  return {
    selected: (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null,
    targets: [...((game as any).user?.targets ?? [])].map((t: any) => t.actor).filter(Boolean),
  };
}

/** Posts a card of lines under a title. */
export async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** Asks the fields, and reads the answer from the dialog's form. */
export async function ask<T>(title: string, fields: string, read: (form: HTMLElement) => T): Promise<T | null> {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="gworld" style="display:grid;gap:6px">${fields}</div>`,
    ok: { label: title, callback: (_event: Event, button: HTMLElement) => read(button.closest<HTMLElement>(".application")!) },
    rejectClose: false,
  }) as Promise<T | null>;
}
export const row = (label: string, input: string) => `<label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${esc(label)}</span>${input}</label>`;
export const select = (name: string, options: Array<[string, string]>) => `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
export const num = (name: string, value: number) => `<input type="number" name="${name}" value="${value}" step="any" style="width:90px" />`;
export const check = (name: string, checked = false) => `<input type="checkbox" name="${name}" ${checked ? "checked" : ""} />`;
export const val = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

// ── who is aboard ──

/** A vehicle: a vehicle actor on the map, or vehicle equipment on a Gear tab. */
export function isVehicle(doc: any): boolean {
  if (!doc?.system?.vehicle) return false;
  return doc.documentName === "Actor" ? doc.type === "vehicle" : doc.type === "equipment" && doc.system?.category === "vehicle";
}

/** Whether a seat in a vehicle's crew is this actor's. */
function seatIs(seat: any, actor: any): boolean {
  const uuid = String(seat?.uuid ?? "");
  if (!uuid) return false;
  return uuid === String(actor?.uuid ?? "") || (Boolean(actor?.id) && uuid.endsWith(`.${actor.id}`));
}

/** The vehicle actor whose crew this actor is in, or null. */
export function vehicleAboard(actor: any): any | null {
  if (!actor) return null;
  const actors: any[] = [...((game as any).actors ?? [])];
  return actors.find((v) => v?.type === "vehicle" && (v.system?.crew ?? []).some((seat: any) => seatIs(seat, actor))) ?? null;
}

/** The actors in a vehicle's crew that can be found. */
export function crewOf(vehicle: any): any[] {
  const seats: any[] = vehicle?.system?.crew ?? [];
  return seats.map((seat) => (globalThis as any).fromUuidSync?.(String(seat?.uuid ?? "")) ?? null).filter(Boolean);
}

/** The vehicle's operator, or else the first of its crew. */
export function operatorOf(vehicle: any): any | null {
  const seats: any[] = vehicle?.system?.crew ?? [];
  const seat = seats.find((s) => s?.operator) ?? seats[0];
  return seat ? ((globalThis as any).fromUuidSync?.(String(seat.uuid ?? "")) ?? null) : null;
}

// ── occupant restraints ──

/** One book's restraint. */
export interface Restraint {
  /** The condition key it puts on the occupant, `<module>.<key>` in the system. */
  condition: string;
  /** The DX modifier to get free of it. */
  escape: number;
  /** True where its DR is used up by what it stops (a crashweb), false where it stays (an airbag). */
  ablative: boolean;
  /** The actor flag its DR is kept in. */
  flag: string;
}

/** A book's restraints, and the switch that turns them on. */
export interface RestraintTable extends BookTable {
  /** The switch, as its full key. */
  switch: string;
  restraints: Readonly<Record<string, Restraint>>;
}

export const RESTRAINT_TABLES = new BookTables<RestraintTable>();

/** The restraints an actor is held by now, from the books whose switch is on. */
export function restraintsOn(api: GWorldApi, actor: any): Array<{ table: RestraintTable; key: string; restraint: Restraint }> {
  const ids = (api.actors.conditions(actor) ?? []).map((c: any) => String(c?.id ?? ""));
  const out: Array<{ table: RestraintTable; key: string; restraint: Restraint }> = [];
  for (const table of RESTRAINT_TABLES.all) {
    if (!isRuleOn(table.switch)) continue;
    for (const [key, restraint] of Object.entries(table.restraints)) {
      if (ids.some((id) => id.endsWith(restraint.condition))) out.push({ table, key, restraint });
    }
  }
  return out;
}

/** Puts a restraint on an occupant, with its DR, under a label. */
export async function restrain(api: GWorldApi, actor: any, restraint: Restraint, dr: number, label: string): Promise<void> {
  await api.actors.applyCondition(actor, { module: MODULE_ID, key: restraint.condition, label } as any);
  await actor.setFlag(MODULE_ID, restraint.flag, dr);
}

/**
 * An occupant's DX roll to get free of one book's restraint: its escape
 * modifier under the book's label, and every one of the book's restraints
 * off on a success.
 */
export async function freeFrom(api: GWorldApi, actor: any, table: RestraintTable, key: string, labels: { roll: string; line: string }): Promise<boolean> {
  const restraint = table.restraints[key];
  if (!restraint) return false;
  const result: any = await api.roll.success({ actor, base: api.actors.attribute(actor, "DX") ?? 10, kind: "attribute", label: labels.roll, modifiers: [{ label: labels.line, value: restraint.escape }] } as any);
  if (!result?.success) return false;
  for (const c of api.actors.conditions(actor).filter((c: any) => String(c.id).includes(restraint.condition))) await api.actors.removeCondition(actor, c.id);
  return true;
}

let restraintsReady = false;

/** The one injury hook every book's restraints share (Ultra-Tech p. 224; High-Tech p. 229). */
export function readyRestraints(api: GWorldApi): void {
  if (restraintsReady) return;
  restraintsReady = true;
  Hooks.on(api.combat.hooks.injury, (context: any) => {
    const victim = context?.actor;
    if (!victim || !context.damage) return;
    if (String(context.damage.type ?? context.damage.damageType ?? "") !== "cr") return;
    for (const { restraint } of restraintsOn(api, victim)) {
      const dr = Number(victim.getFlag?.(MODULE_ID, restraint.flag)) || 0;
      if (dr <= 0) continue;
      const basic = Number(context.damage.basicDamage) || 0;
      if (restraint.ablative) {
        const absorbed = restraintAbsorb(basic, dr);
        context.damage.basicDamage = absorbed.damage;
        void victim.setFlag(MODULE_ID, restraint.flag, absorbed.drLeft);
      } else {
        context.damage.basicDamage = restraintStops(basic, dr);
      }
    }
  });
}

/** Forgets the hook, for tests. */
export function resetRestraints(): void {
  restraintsReady = false;
}

// ── armour against shaped charges ──

export const SHAPED_ARMOUR_TABLES = new BookTables<ShapedArmourTable>();
