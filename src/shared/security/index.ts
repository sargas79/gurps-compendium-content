/**
 * The security engine, for every book that prints the rule (Ultra-Tech
 * pp. 101-104; High-Tech pp. 202-205): a barrier someone crosses -- the roll
 * that gets past it, the affliction it forces, the damage it does -- and a
 * safe's, an armoured door's and a lock's figures on the item sheet.
 *
 * Each book registers its table in `SECURITY_TABLES`: its barriers, safes,
 * doors and locks, the switch that turns its figures on and the namespace of
 * its text. Its own GM tool and item section call these with its table, and
 * add what it prints alone (Ultra-Tech's monowire and dream nets, High-Tech's
 * lock grades, caltrops and electric fences).
 */

import { BookTables, type BookTable } from "../book-tables.js";
import type { GWorldApi } from "../module.js";

/** What a barrier does to someone who crosses it. */
export interface Barrier {
  /** A roll that avoids it: an open fence's Acrobatics-3 or Escape-3, cutting or barbed wire's DX-5 a yard. */
  avoid?: { skills: readonly string[]; attribute?: "DX"; modifier: number };
  damage?: { formula: string; type: "burn" | "cut" | "cor"; divisor: number; radiation?: boolean; surge?: boolean; ignoresDr?: boolean; multiplier?: number };
  /** An affliction resisted by HT or Will. */
  affliction?: { attribute: "HT" | "Will"; modifier: number; effect: string; divisor?: number };
  /** Only an open fence can be avoided; a tight one can't. */
  fence?: boolean;
  /** Who it can't affect. */
  sealedImmune?: boolean;
}

/** A book's security figures. */
export interface SecurityTable extends BookTable {
  /** Where the book's text is: `<ns>.Barrier.*` and `<ns>.Item.*`. */
  ns: string;
  /** The switch, as its full key, that turns the book's rule on for its items. */
  switch: string;
  barriers: Readonly<Record<string, Barrier>>;
  /** Safes by name, with their DR and HP. */
  safes: Readonly<Record<string, { dr: number; hp: number }>>;
  /** A safe's DR at a TL, where the book scales it; its printed DR where not. */
  safeDr?: (base: number, tl: number) => number;
  /** Locks by name, with their modifier to pick. */
  locks: Readonly<Record<string, number>>;
  /** Armoured doors: the names that are one, and an inch's DR by TL. */
  door?: { pattern: RegExp; dr: (tl: number) => number };
  /** The TL an item is read at where neither it nor its owner says. */
  defaultTl: number;
}

export const SECURITY_TABLES = new BookTables<SecurityTable>();

const tlOf = (value: unknown): number | null => {
  const match = /\d+/.exec(String(value ?? ""));
  return match ? Number(match[0]) : null;
};
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** A safe's, an armoured door's and a lock's figures, in the book's words. */
export function figureLines(item: any, table: SecurityTable): string[] {
  const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${table.ns}.Item.${key}`, data);
  const name = String(item?.name ?? "");
  const tl = tlOf(item?.actor?.system?.tl) ?? tlOf(item?.system?.tl) ?? table.defaultTl;
  const lines: string[] = [];
  const safe = table.safes[name];
  if (safe) lines.push(F("Safe", { dr: table.safeDr ? table.safeDr(safe.dr, tl) : safe.dr, hp: safe.hp, tl }));
  if (table.door?.pattern.test(name)) lines.push(F("Door", { dr: table.door.dr(tl), tl }));
  if (name in table.locks) lines.push(F("Lock", { modifier: table.locks[name] }));
  return lines;
}

/** What the book decides about one crossing, beyond the barrier's own figures. */
export interface Crossing {
  /** The barrier's name, in the book's words. */
  name: string;
  /** Whether the avoiding roll is offered: never at a tight fence. */
  avoidable?: boolean;
  /** Whether the victim is beyond the barrier's reach. */
  immune?: boolean;
  /** Lines added to the resistance roll. */
  afflictionModifiers?: Array<{ label: string; value: number }>;
  /** The condition a failed resistance roll applies, where not the barrier's own effect. */
  effect?: string | undefined;
  /** The text key for the affliction taking hold (`Afflicted` unless said). */
  afflictedKey?: string | undefined;
  /** Lines said once the affliction takes hold. */
  afflictedLines?: string[];
  /** The damage rolled, where not the barrier's own formula. */
  formula?: string | undefined;
  /** Leave the chat to the caller, which adds its own lines to `lines`. */
  quiet?: boolean;
}

/** What came of a crossing. */
export interface Crossed {
  avoided: boolean;
  immune: boolean;
  afflicted: boolean;
  /** The damage rolled, or null where none was. */
  damage: number | null;
  /** What happened, for the chat. */
  lines: string[];
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/**
 * One victim crosses a barrier: the roll to get past it where it can be got
 * past, then the affliction it forces and the damage it does.
 */
export async function crossBarrier(api: GWorldApi, ns: string, victim: any, barrier: Barrier, crossing: Crossing): Promise<Crossed> {
  const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Barrier.${key}`, data);
  const L = (key: string) => game.i18n.localize(`${ns}.Barrier.${key}`);
  const name = String(victim?.name ?? "");
  const done = async (crossed: Crossed): Promise<Crossed> => {
    if (!crossing.quiet && crossed.lines.length) await say(victim, crossing.name, crossed.lines);
    return crossed;
  };
  const crossed: Crossed = { avoided: false, immune: false, afflicted: false, damage: null, lines: [] };
  if (barrier.avoid && crossing.avoidable !== false) {
    const best = barrier.avoid.attribute
      ? api.actors.attribute(victim, barrier.avoid.attribute) ?? 10
      : Math.max(...barrier.avoid.skills.map((skill) => api.actors.skillLevel(victim, skill) ?? (api.actors.attribute(victim, "DX") ?? 10) - 5));
    const result: any = await api.roll.success({ actor: victim, base: best, label: F("Avoid", { barrier: crossing.name }), modifiers: [{ label: crossing.name, value: barrier.avoid.modifier }] } as any);
    if (result?.success) return done({ ...crossed, avoided: true, lines: [F("Avoided", { name })] });
  }
  if (crossing.immune) return done({ ...crossed, immune: true, lines: [F("Immune", { name })] });
  if (barrier.affliction) {
    const base = api.actors.attribute(victim, barrier.affliction.attribute) ?? 10;
    const modifiers = [{ label: crossing.name, value: barrier.affliction.modifier }, ...(crossing.afflictionModifiers ?? [])];
    const result: any = await api.roll.success({ actor: victim, base, kind: "attribute", label: F("Resist", { barrier: crossing.name }), modifiers, tags: ["resist", "affliction"] } as any);
    if (result && !result.success) {
      const effect = crossing.effect ?? barrier.affliction.effect;
      await api.actors.applyCondition(victim, { key: effect } as any);
      crossed.afflicted = true;
      crossed.lines.push(F(crossing.afflictedKey ?? "Afflicted", { name, effect: L(effect), minutes: result.margin }));
      crossed.lines.push(...(crossing.afflictedLines ?? []));
    } else if (result) crossed.lines.push(F("Resisted", { name }));
  }
  if (barrier.damage) {
    const rolled = await api.roll.damage({
      actor: victim,
      label: F("DamageLabel", { barrier: crossing.name, name }),
      formula: crossing.formula ?? barrier.damage.formula,
      damageType: barrier.damage.type,
      armorDivisor: barrier.damage.divisor,
      radiation: barrier.damage.radiation,
      ignoresDr: barrier.damage.ignoresDr,
      massMultiplier: barrier.damage.multiplier,
    } as any);
    crossed.damage = typeof rolled === "number" && Number.isFinite(rolled) ? rolled : null;
  }
  return done(crossed);
}
