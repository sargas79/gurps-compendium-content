/**
 * The countersurveillance and jamming engine: a sweep for a hidden bug, and
 * radio jammers against the gear used near them, for any book that prints
 * them (see `rules.ts`).
 *
 *   - **The bug sweep** is one Quick Contest, whichever book's detector runs
 *     it: the caller gives the sweeper's score and lines, the engine rolls it
 *     against whoever hid the bug (the targeted character, or a skill typed
 *     in) and says whether the bug was found.
 *   - **Jamming** takes each book's table: which records are jammers, how far
 *     they reach and with what skill, which gear they hinder and with which
 *     skill it is used, and how far past a jammer's range the unopposed roll
 *     reaches. A jammer is switched on from its row; the gear's row button
 *     then finds every switched-on jammer on the map within reach of its
 *     user's token and rolls the contest or the roll for each, and a jammer
 *     that blocks one kind of gear outright simply blocks it.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { card, carried, skillBase, yardsBetween } from "../sensors/index.js";
import { EW, SURVEILLANCE, jammingReach, wonContest, type JammingReach } from "./rules.js";

// ── the bug sweep ──

/** One side of a sweep: the score rolled, the lines on it, and what the score is. */
export interface SweepSide {
  actor: any;
  base: number;
  modifiers?: Array<{ label: string; value: number }>;
  note?: string;
}

/**
 * Sweeps for a hidden bug: a Quick Contest of the sweeper's Electronics
 * Operation (Surveillance) against whoever hid it (Ultra-Tech p. 105;
 * High-Tech p. 212). True where the sweeper found it, false where not, null
 * where the contest wasn't rolled.
 */
export async function bugSweepContest(api: GWorldApi, options: { label: string; sweeper: SweepSide; hider: SweepSide; tags?: string[] }): Promise<boolean | null> {
  const result: any = await api.roll.quickContest({
    label: options.label,
    first: { actor: options.sweeper.actor, base: options.sweeper.base, modifiers: options.sweeper.modifiers ?? [], note: options.sweeper.note ?? SURVEILLANCE },
    second: { actor: options.hider.actor ?? null, base: options.hider.base, modifiers: options.hider.modifiers ?? [], note: options.hider.note ?? SURVEILLANCE },
    tags: ["bugSweep", ...(options.tags ?? [])],
  } as any);
  return result ? wonContest(result.outcome) : null;
}

// ── jamming ──

/** A jammer, as its book's table reads its record. */
export interface Jammer {
  /** How far it reaches, in yards. */
  range: number;
  /** A fixed effective skill for one that needs no operator; null where its operator's EW is rolled. */
  skill: number | null;
  /** A kind of gear it blocks outright within its range, and no other; unset for a jammer that hinders all radio gear. */
  blocks?: string;
}

/** Gear a jammer hinders, as its book's table reads its record. */
export interface Jammable {
  /** The Electronics Operation specialty the gear is used with. */
  skill: string;
  /** What kind of gear it is, for a jammer that blocks only one kind. */
  kind: string;
}

/** A book's jammers and the gear they hinder. */
export interface JammerTable extends BookTable {
  /** The switch that turns the rule on for this book's gear, as a full key. */
  switch: string;
  /** The book's localization namespace, holding `<ns>.Jamming.*`. */
  i18n: string;
  /** How many times a jammer's range the unopposed roll reaches. */
  shadow: number;
  jammer(item: any): Jammer | null;
  jammable(item: any): Jammable | null;
  /** The jammer operator's Electronics Operation (EW), with whatever default the book gives it. */
  operatorSkill(api: GWorldApi, actor: any): number;
}

export const JAMMER_TABLES = new BookTables<JammerTable>();

const tableOn = (t: JammerTable) => isRuleOn(t.switch);
const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Jamming.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Jamming.${key}`, data);

/** The flag a switched-on jammer carries. */
export const JAMMER_ON = "jammerOn";

/** A record's jammer figures and table, where its book's rule is on. */
export function jammerOf(item: any): { table: JammerTable; jammer: Jammer } | null {
  const table = JAMMER_TABLES.forItem(item, (t) => tableOn(t) && t.jammer(item) !== null);
  const jammer = table?.jammer(item) ?? null;
  return table && jammer ? { table, jammer } : null;
}

/** A record's figures as gear a jammer hinders, where its book's rule is on. */
export function jammableOf(item: any): { table: JammerTable; gear: Jammable } | null {
  const table = JAMMER_TABLES.forItem(item, (t) => tableOn(t) && t.jammable(item) !== null);
  const gear = table?.jammable(item) ?? null;
  return table && gear ? { table, gear } : null;
}

export const isSwitchedOn = (item: any): boolean => Boolean(item?.getFlag?.(MODULE_ID, JAMMER_ON) ?? item?.flags?.[MODULE_ID]?.[JAMMER_ON]);

/** A switched-on jammer somewhere on the map, and how far it is from the character. */
export interface JammerInReach {
  holder: any;
  item: any;
  table: JammerTable;
  jammer: Jammer;
  yards: number;
  reach: JammingReach | "blocked";
}

/** The actors with a token on the map. */
function actorsOnMap(): any[] {
  const tokens: any[] = (globalThis as any).canvas?.tokens?.placeables ?? [];
  return [...new Set(tokens.map((t) => t.actor).filter(Boolean))];
}

/**
 * Every switched-on jammer that reaches gear of this kind in the character's
 * hands, nearest first: a jammer that blocks one kind blocks it within its
 * range and ignores every other kind.
 */
export function jammersReaching(actor: any, gear: Jammable, actors: any[] = actorsOnMap()): JammerInReach[] {
  const found: JammerInReach[] = [];
  for (const holder of actors) {
    for (const item of holder?.items ?? []) {
      if (!carried(item) || !isSwitchedOn(item)) continue;
      const own = jammerOf(item);
      if (!own) continue;
      const yards = holder === actor ? 0 : yardsBetween(actor, holder);
      if (yards === null) continue;
      const { jammer, table } = own;
      const reach: JammerInReach["reach"] = jammer.blocks
        ? (jammer.blocks === gear.kind && yards <= jammer.range ? "blocked" : "clear")
        : jammingReach(yards, jammer.range, table.shadow);
      if (reach !== "clear") found.push({ holder, item, table, jammer, yards, reach });
    }
  }
  return found.sort((a, b) => a.yards - b.yards);
}

/** Switches a jammer on or off; switching one on is obvious to everyone near, though not where it is (High-Tech p. 212). */
async function toggleJammer(item: any, actor: any, table: JammerTable): Promise<void> {
  const on = !isSwitchedOn(item);
  await item.setFlag(MODULE_ID, JAMMER_ON, on);
  await card(actor, String(item.name ?? ""), [L(table.i18n, on ? "SwitchedOn" : "SwitchedOff")]);
}

/**
 * Using radio gear with jammers about: for each jammer that reaches it, the
 * Quick Contest within its range, or the unopposed roll further out. The
 * first one lost jams the gear.
 */
export async function useNearJammers(api: GWorldApi, item: any, actor: any, actors?: any[]): Promise<"clear" | "through" | "jammed" | null> {
  const own = jammableOf(item);
  if (!actor || !own) return null;
  const { table, gear } = own;
  const ns = table.i18n;
  const reaching = jammersReaching(actor, gear, actors);
  const title = F(ns, "UseLabel", { name: item.name ?? "" });
  if (!reaching.length) {
    await card(actor, title, [L(ns, "NoneInReach")]);
    return "clear";
  }
  const base = skillBase(api, actor, gear.skill);
  for (const near of reaching) {
    if (near.reach === "blocked") {
      await card(actor, title, [F(ns, "Blocked", { jammer: near.item.name ?? "" })]);
      return "jammed";
    }
    if (near.reach === "contest") {
      const operator = near.jammer.skill ?? near.table.operatorSkill(api, near.holder);
      const result: any = await api.roll.quickContest({
        label: F(ns, "ContestLabel", { name: item.name ?? "", jammer: near.item.name ?? "" }),
        first: { actor, base, note: gear.skill },
        second: { actor: near.jammer.skill === null ? near.holder : null, base: operator, note: near.jammer.skill === null ? EW : String(near.item.name ?? "") },
        tags: ["jamming"],
      } as any);
      if (!result) return null;
      if (!wonContest(result.outcome)) {
        await card(actor, title, [F(ns, "Jammed", { jammer: near.item.name ?? "" })]);
        return "jammed";
      }
      continue;
    }
    const result: any = await api.roll.success({
      actor,
      base,
      skill: gear.skill,
      label: F(ns, "NearLabel", { name: item.name ?? "", jammer: near.item.name ?? "", shadow: near.table.shadow }),
      tags: ["jamming"],
      item,
    } as any);
    if (!result) return null;
    if (!result.success) {
      await card(actor, title, [F(ns, "Jammed", { jammer: near.item.name ?? "" })]);
      return "jammed";
    }
  }
  await card(actor, title, [L(ns, "GetsThrough")]);
  return "through";
}

let readied = false;

/** Registers the jammer's switch and the gear's button, once whichever books ask. */
export function readyJamming(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  const ns = () => JAMMER_TABLES.all.find(tableOn)?.i18n ?? JAMMER_TABLES.all[0]?.i18n ?? "GCC.HT";
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "jammer-switch",
    itemTypes: ["equipment"],
    label: L(ns(), "SwitchTitle"),
    icon: "fa-solid fa-tower-broadcast",
    visible: (item) => jammerOf(item) !== null,
    run: (item, actor) => {
      const own = jammerOf(item);
      return own ? toggleJammer(item, actor, own.table) : Promise.resolve();
    },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "jammer-use-near",
    itemTypes: ["equipment"],
    label: L(ns(), "UseTitle"),
    icon: "fa-solid fa-signal",
    visible: (item) => jammableOf(item) !== null,
    run: async (item, actor) => {
      await useNearJammers(api, item, actor);
    },
  });
}

