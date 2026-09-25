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
 *     that blocks one kind of gear outright simply blocks it. Where a book
 *     prints the varieties (HT:EE pp. 49-50), a jammer runs broad-spectrum
 *     (its operator's roll to switch it on, then a penalty on every user in
 *     reach) or selective (a roll or contest to catch each user's frequency,
 *     then a heavier penalty); a jammer that blocks voice gear may let a
 *     listener follow the call by ear; and a spoofer feeds the gear a false
 *     picture in a Quick Contest, rolled in secret, which only the GMs are
 *     told the gear lost.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { ask, card, carried, esc, row, skillBase, yardsBetween } from "../sensors/index.js";
import { rangeExtensionModifier } from "../sensors/rules.js";
import {
  EW,
  JAMMER_VARIETIES,
  SURVEILLANCE,
  jammingReach,
  varietyPenalty,
  wonContest,
  type JammerVariety,
  type JammingReach,
  type VarietyPenalty,
} from "./rules.js";

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
  /** The kinds of gear it hinders; unset for every kind. */
  hinders?: readonly string[];
  /**
   * How it spreads its output, where the book prints the varieties
   * (HT:EE p. 49): one variety, or `choose` for a jammer whose operator picks
   * one when switching it on. Unset, the book's plain Quick Contest.
   */
  variety?: JammerVariety | "choose";
  /**
   * Where it blocks voice gear, the Hearing modifier to follow a call through
   * it within its range instead; out to its shadow, the Hearing roll is
   * unmodified (HT:EE p. 50).
   */
  hearing?: number;
  /**
   * A spoofer: it blinds nothing, but a Quick Contest of its operator's
   * Electronics Operation (EW) against the gear's skill, within its range,
   * feeds the gear a false picture where the operator wins (HT:EE p. 50).
   */
  spoofs?: boolean;
}

/** Gear a jammer hinders, as its book's table reads its record. */
export interface Jammable {
  /** The Electronics Operation specialty the gear is used with. */
  skill: string;
  /** What kind of gear it is, for a jammer that blocks only one kind. */
  kind: string;
  /** Gear someone talks over, whose user may follow a call through a jammer by ear. */
  voice?: boolean;
}

/** A book's jammers and the gear they hinder. */
export interface JammerTable extends BookTable {
  /** The switches that turn the rule on for this book's gear, as full keys: the table is on while any is, and says which gear each covers. */
  switches: readonly string[];
  /** The book's localization namespace, holding `<ns>.Jamming.*`. */
  i18n: string;
  /** How many times a jammer's range the unopposed roll reaches. */
  shadow: number;
  jammer(item: any): Jammer | null;
  jammable(item: any): Jammable | null;
  /** The jammer operator's Electronics Operation (EW), with whatever default the book gives it. */
  operatorSkill(api: GWorldApi, actor: any): number;
  /** What each variety does to the user's roll, for a book that prints the varieties. */
  varieties?: Readonly<Record<JammerVariety, VarietyPenalty>>;
  /** The lines on a jammer operator's Electronics Operation (EW) from what he carries, such as a spectrum analyzer. */
  operatorModifiers?(actor: any): Array<{ label: string; value: number }>;
  /** The lines on a user's roll through a jammer of a variety from how the gear is built, such as a spread-spectrum radio's. */
  gearModifiers?(item: any, variety: JammerVariety): Array<{ label: string; value: number }>;
}

export const JAMMER_TABLES = new BookTables<JammerTable>();

const tableOn = (t: JammerTable) => t.switches.some((key) => isRuleOn(key));
const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Jamming.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Jamming.${key}`, data);

/** The flag a switched-on jammer carries. */
export const JAMMER_ON = "jammerOn";
/** The variety its operator picked, for a jammer that may be run either way. */
export const JAMMER_VARIETY = "jammerVariety";
/** Whether a selective jammer's operator knows the frequency, and it holds still. */
export const FREQUENCY_KNOWN = "jammerFrequencyKnown";

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

const flagOf = (item: any, key: string): unknown => item?.getFlag?.(MODULE_ID, key) ?? item?.flags?.[MODULE_ID]?.[key];

export const isSwitchedOn = (item: any): boolean => Boolean(flagOf(item, JAMMER_ON));

/** The variety a jammer runs as: its own, the one its operator picked (broad-spectrum where none was), or none. */
export function varietyOf(item: any, jammer: Jammer): JammerVariety | null {
  if (jammer.variety !== "choose") return jammer.variety ?? null;
  const picked = flagOf(item, JAMMER_VARIETY);
  return JAMMER_VARIETIES.includes(picked as JammerVariety) ? (picked as JammerVariety) : "broad";
}

/** A switched-on jammer somewhere on the map, and how far it is from the character. */
export interface JammerInReach {
  holder: any;
  item: any;
  table: JammerTable;
  jammer: Jammer;
  yards: number;
  /** Within its range ("contest"), out to its shadow ("roll"), or blocking the gear outright. */
  reach: JammingReach | "blocked";
}

/** The actors with a token on the map. */
function actorsOnMap(): any[] {
  const tokens: any[] = (globalThis as any).canvas?.tokens?.placeables ?? [];
  return [...new Set(tokens.map((t) => t.actor).filter(Boolean))];
}

/**
 * How a jammer reaches gear this many yards away: a jammer that hinders some
 * kinds of gear ignores the rest; one that blocks a kind blocks it within its
 * range, save voice gear it lets a listener follow by ear out to its shadow;
 * a spoofer only works within its range.
 */
export function jammerReach(jammer: Jammer, gear: Jammable, yards: number, shadow: number): JammerInReach["reach"] {
  if (jammer.hinders && !jammer.hinders.includes(gear.kind)) return "clear";
  if (jammer.blocks) {
    if (jammer.blocks !== gear.kind) return "clear";
    if (gear.voice && typeof jammer.hearing === "number") return jammingReach(yards, jammer.range, shadow);
    return yards <= jammer.range ? "blocked" : "clear";
  }
  if (jammer.spoofs) return yards <= jammer.range ? "contest" : "clear";
  return jammingReach(yards, jammer.range, shadow);
}

/** Every switched-on jammer that reaches gear of this kind in the character's hands, nearest first. */
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
      const reach = jammerReach(jammer, gear, yards, table.shadow);
      if (reach !== "clear") found.push({ holder, item, table, jammer, yards, reach });
    }
  }
  return found.sort((a, b) => a.yards - b.yards);
}

/** Posts a card the GMs alone see. */
async function gmCard(title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    whisper: ChatMessage.implementation.getWhisperRecipients("GM"),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** The operator's Electronics Operation (EW) for a jammer, or its own fixed skill. */
const operatorBase = (api: GWorldApi, jammer: Jammer, table: JammerTable, holder: any) => jammer.skill ?? table.operatorSkill(api, holder);

/** A character's Hearing score, as the system worked it out. */
function hearingOf(api: GWorldApi, actor: any): number {
  const derived: any = api.actors.derived(actor);
  const senses: any[] = derived?.senses ?? [];
  return Number(senses.find((s) => s?.sense === "hearing")?.score) || Number(derived?.per) || (api.actors.attribute(actor, "Per") ?? 10);
}

/**
 * Switches a jammer on or off; switching one on is obvious to everyone near,
 * though not where it is (High-Tech p. 212). A jammer of the varieties is
 * set up as it goes on (HT:EE p. 49): the operator picks broad-spectrum or
 * selective where he may, and says whether he knows a selective jammer's
 * frequency; a broad-spectrum jammer takes his Electronics Operation (EW)
 * roll to jam at all, and stays off where it fails.
 */
async function toggleJammer(api: GWorldApi, item: any, actor: any, table: JammerTable, jammer: Jammer): Promise<void> {
  const ns = table.i18n;
  const name = String(item.name ?? "");
  const on = !isSwitchedOn(item);
  const lines: string[] = [];
  if (on && jammer.variety && table.varieties) {
    if (jammer.variety === "choose") {
      const picked = await ask(
        L(ns, "VarietyTitle"),
        row(L(ns, "VarietyLabel"), `<select name="variety">${JAMMER_VARIETIES.map((v) => `<option value="${v}">${esc(L(ns, `Variety.${v}`))}</option>`).join("")}</select>`)
          + row(L(ns, "KnownLabel"), `<input type="checkbox" name="known">`),
        (form) => ({
          variety: (form.querySelector<HTMLSelectElement>("[name=variety]")?.value === "selective" ? "selective" : "broad") as JammerVariety,
          known: Boolean(form.querySelector<HTMLInputElement>("[name=known]")?.checked),
        }),
      );
      if (!picked) return;
      await item.setFlag(MODULE_ID, JAMMER_VARIETY, picked.variety);
      await item.setFlag(MODULE_ID, FREQUENCY_KNOWN, picked.known);
    }
    const variety = varietyOf(item, jammer)!;
    if (variety === "broad") {
      const result: any = await api.roll.success({
        actor,
        base: operatorBase(api, jammer, table, actor),
        skill: EW,
        label: F(ns, "JamLabel", { name }),
        modifiers: table.operatorModifiers?.(actor) ?? [],
        tags: ["jamming"],
        item,
      } as any);
      if (!result) return;
      if (!result.success) {
        await card(actor, name, [L(ns, "FailsToJam")]);
        return;
      }
    }
    lines.push(F(ns, `Runs.${variety}`, { name }));
  }
  await item.setFlag(MODULE_ID, JAMMER_ON, on);
  await card(actor, name, [L(ns, on ? "SwitchedOn" : "SwitchedOff"), ...lines]);
}

/**
 * Whether a selective jammer catches the gear's frequency (HT:EE p. 49): an
 * unopposed roll of the operator's Electronics Operation (EW) where he knows
 * it and it holds still, else a Quick Contest against the user's own. Beyond
 * its range it is -1 per 10% further, as a radio's stretched range is, and it
 * reaches no further than double. Null where a roll wasn't made.
 */
async function catchesFrequency(api: GWorldApi, near: JammerInReach, actor: any, name: string): Promise<boolean | null> {
  const { table, jammer, holder, item } = near;
  const ns = table.i18n;
  const stretch = rangeExtensionModifier(near.yards, jammer.range);
  if (stretch === null) return false;
  const modifiers = [...(table.operatorModifiers?.(holder) ?? []), ...(stretch ? [{ label: L(ns, "StretchLine"), value: stretch }] : [])];
  const base = operatorBase(api, jammer, table, holder);
  const label = F(ns, "CatchLabel", { jammer: item.name ?? "", name });
  if (flagOf(item, FREQUENCY_KNOWN)) {
    const result: any = await api.roll.success({ actor: holder, base, skill: EW, label, modifiers, tags: ["jamming"], item } as any);
    return result ? Boolean(result.success) : null;
  }
  const result: any = await api.roll.quickContest({
    label,
    first: { actor: holder, base, modifiers, note: EW },
    second: { actor, base: table.operatorSkill(api, actor), note: EW },
    tags: ["jamming"],
  } as any);
  return result ? wonContest(result.outcome) : null;
}

/**
 * Using gear with jammers about: for each jammer that reaches it, whatever it
 * takes to get through -- the Quick Contest within its range or the
 * unopposed roll further out; for a jammer of the varieties, the user's roll
 * at the variety's penalty, once a selective jammer has caught the frequency;
 * a Hearing roll to follow a call through a jammer that blocks the rest; a
 * Quick Contest against a spoofer. The first one lost jams the gear, or feeds
 * it a false picture.
 */
export async function useNearJammers(api: GWorldApi, item: any, actor: any, actors?: any[]): Promise<"clear" | "through" | "jammed" | "spoofed" | null> {
  const own = jammableOf(item);
  if (!actor || !own) return null;
  const { table, gear } = own;
  const ns = table.i18n;
  const reaching = jammersReaching(actor, gear, actors);
  const name = String(item.name ?? "");
  const title = F(ns, "UseLabel", { name });
  if (!reaching.length) {
    await card(actor, title, [L(ns, "NoneInReach")]);
    return "clear";
  }
  const base = skillBase(api, actor, gear.skill);
  const jammed = async (near: JammerInReach) => {
    await card(actor, title, [F(ns, "Jammed", { jammer: near.item.name ?? "" })]);
    return "jammed" as const;
  };
  for (const near of reaching) {
    const jammerName = String(near.item.name ?? "");
    if (near.reach === "blocked") {
      await card(actor, title, [F(ns, "Blocked", { jammer: jammerName })]);
      return "jammed";
    }
    // Following a call by ear through a jammer that blocks the gear (HT:EE p. 50).
    if (near.jammer.blocks) {
      const modifier = near.reach === "contest" ? (near.jammer.hearing ?? 0) : 0;
      const result: any = await api.roll.success({
        actor,
        base: hearingOf(api, actor),
        skill: "Hearing",
        label: F(ns, "HearLabel", { name, jammer: jammerName }),
        modifiers: modifier ? [{ label: F(ns, "HearLine", { jammer: jammerName }), value: modifier }] : [],
        tags: ["jamming", "hearing"],
        item,
      } as any);
      if (!result) return null;
      if (!result.success) return jammed(near);
      continue;
    }
    // A spoofer's Quick Contest against the gear's own skill (HT:EE p. 50), rolled in secret: the user
    // mustn't learn from the card that the picture is false, so the GMs alone are told.
    if (near.jammer.spoofs) {
      const result: any = await api.roll.quickContest({
        label: F(ns, "SpoofLabel", { name, jammer: jammerName }),
        first: { actor, base, note: gear.skill },
        second: { actor: near.holder, base: operatorBase(api, near.jammer, near.table, near.holder), modifiers: near.table.operatorModifiers?.(near.holder) ?? [], note: EW },
        tags: ["jamming", "spoofing"],
        secret: true,
      } as any);
      if (!result) return null;
      if (!wonContest(result.outcome)) {
        await card(actor, title, [L(ns, "GetsThrough")]);
        await gmCard(title, [F(ns, "Spoofed", { jammer: jammerName })]);
        return "spoofed";
      }
      continue;
    }
    // A jammer of the varieties: the user's roll at its penalty (HT:EE p. 49).
    const variety = varietyOf(near.item, near.jammer);
    const penalties = near.table.varieties;
    if (variety && penalties) {
      if (variety === "selective") {
        const caught = await catchesFrequency(api, near, actor, name);
        if (caught === null) return null;
        if (!caught) continue;
      }
      const penalty = varietyPenalty(near.reach, penalties[variety]);
      const result: any = await api.roll.success({
        actor,
        base,
        skill: gear.skill,
        label: F(ns, "ThroughLabel", { name, jammer: jammerName }),
        modifiers: [...(penalty ? [{ label: F(ns, `VarietyLine.${variety}`, { jammer: jammerName }), value: penalty }] : []), ...(table.gearModifiers?.(item, variety) ?? [])],
        tags: ["jamming"],
        item,
      } as any);
      if (!result) return null;
      if (!result.success) return jammed(near);
      continue;
    }
    if (near.reach === "contest") {
      const operated = near.jammer.skill === null;
      const result: any = await api.roll.quickContest({
        label: F(ns, "ContestLabel", { name, jammer: jammerName }),
        first: { actor, base, note: gear.skill },
        second: {
          actor: operated ? near.holder : null,
          base: operatorBase(api, near.jammer, near.table, near.holder),
          ...(operated && near.table.operatorModifiers ? { modifiers: near.table.operatorModifiers(near.holder) } : {}),
          note: operated ? EW : jammerName,
        },
        tags: ["jamming"],
      } as any);
      if (!result) return null;
      if (!wonContest(result.outcome)) return jammed(near);
      continue;
    }
    const result: any = await api.roll.success({
      actor,
      base,
      skill: gear.skill,
      label: F(ns, "NearLabel", { name, jammer: jammerName, shadow: near.table.shadow }),
      tags: ["jamming"],
      item,
    } as any);
    if (!result) return null;
    if (!result.success) return jammed(near);
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
      return own ? toggleJammer(api, item, actor, own.table, own.jammer) : Promise.resolve();
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
