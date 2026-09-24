/**
 * The restraints engine: a prisoner in cuffs, a straitjacket or leg irons,
 * registered with the system through the add-on API for every book that
 * prints what restraints do to their wearer (High-Tech p. 217).
 *
 * Each book registers its table in `RESTRAINT_TABLES` -- which of its records
 * are restraints, what they bind, their Escape modifier, what being cuffed
 * behind the back or in front costs, and its text -- then calls
 * `readyRestraints`, which registers once however many books call it. An item
 * takes its own book's table, under that book's switch only.
 *
 * A restraint is on its wearer when the item, on the wearer's sheet, says so:
 * its sheet section sets it on (behind the back or in front, for the wrists)
 * or off, kept in this module's flag. While it is on:
 *
 *   - **Wrists behind the back, or a straitjacket:** the table's DX line on
 *     DX-based rolls and attacks, the hands-only line in its place on the
 *     skills done with the hands alone, and no attack with a weapon or a
 *     punch (`gworld.attackModifiers` refuses it; the system names a punch
 *     since API 1.111.0).
 *   - **Wrists in front:** the table's hands-only line on those skills, and no
 *     one-handed melee blow; two-handed blows and guns are unhindered.
 *   - **Legs:** Lame (crippled legs) through `gworld.traitEffects`, which the
 *     system turns into half Basic Speed as Move and -3 on skills that need
 *     the legs (Characters p. 141), and no kick.
 *   - Row buttons: Escape at the restraint's modifier (freed on a success),
 *     and Acrobatics or Escape to slip cuffed wrists round to the front.
 *
 * Ultra-Tech's own restraints (breaking free by ST, tape and electronic
 * cuffs) stay in its security rules; this engine carries what restraints do
 * to their wearer, which that book does not print.
 */

import { BookTables, isRuleOn, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";

/** What a restraint binds. A straitjacket binds the whole upper body. */
export type Binds = "wrists" | "body" | "legs";

/** Where cuffed wrists are held. */
export type CuffPosition = "behind" | "front";

/** Whether, and how, a restraint is on its wearer: "on" for legs and body. */
export type RestraintState = CuffPosition | "on" | null;

/** A restraint, as its book's table reads its record. */
export interface Restraint {
  binds: Binds;
  /** The modifier to Escape to get out of it. */
  escape: number;
  /** Whether wrists cuffed behind can be brought round to the front by Acrobatics or Escape. */
  slip: boolean;
  /** Whether the hands can't be used at all (a straitjacket's sleeves). */
  noHands?: boolean;
}

/** What wrists held in one position cost: on DX-based rolls, and on tasks done with the hands alone. */
export interface CuffedFigures {
  dx: number;
  hands: number;
  /** Whether a weapon can be used at all (only two-handed or hands-together weapons, in front). */
  weapons: "none" | "twoHanded";
}

/** A book's restraints. */
export interface RestraintTable extends BookTable {
  /** The switch that turns the book's restraints on, as its full key. */
  switch: string;
  /** Its text's namespace: the engine reads `<i18n>.Restraints.*`. */
  i18n: string;
  /** The restraint a record is, or null. */
  restraint(item: any): Restraint | null;
  /** What cuffed wrists cost, behind the back and in front. */
  cuffed: Readonly<Record<CuffPosition, CuffedFigures>>;
  /** The skills done with the hands alone, compared without their specialty. */
  handSkills: readonly string[];
  /** The item sheet's lines about a restraint. */
  lines(item: any, restraint: Restraint): string[];
}

export const RESTRAINT_TABLES = new BookTables<RestraintTable>();

/** The item flag that says a restraint is on its wearer, and where cuffed wrists are held. */
export const RESTRAINT_FLAG = "restraint";

/** The tag this engine's own rolls carry, which its roll lines leave alone. */
const OWN_ROLL = "restraintEscape";

const L = (ns: string, key: string) => game.i18n.localize(`${ns}.Restraints.${key}`);
const F = (ns: string, key: string, data: Record<string, unknown>) => game.i18n.format(`${ns}.Restraints.${key}`, data);
const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

const isGear = (item: any) => item?.type === "equipment" || item?.type === "armor";

/** A restraint of a switched-on book, with its table. */
export interface Held {
  item: any;
  table: RestraintTable;
  restraint: Restraint;
}

/** The restraint a record is, while its book's switch is on. */
export function restraintOf(item: any): Held | null {
  if (!isGear(item)) return null;
  const table = RESTRAINT_TABLES.forItem(item, (t) => isRuleOn(t.switch));
  const restraint = table?.restraint(item) ?? null;
  return table && restraint ? { item, table, restraint } : null;
}

/** Whether a restraint is on its wearer, and where its wrists are held. A straitjacket always holds them behind. */
export function restraintState(item: any, restraint: Restraint): RestraintState {
  const stored = item?.getFlag?.(MODULE_ID, RESTRAINT_FLAG) ?? item?.flags?.[MODULE_ID]?.[RESTRAINT_FLAG];
  if (!stored || stored === "off") return null;
  if (restraint.binds === "wrists") return stored === "front" ? "front" : "behind";
  if (restraint.binds === "body") return "behind";
  return "on";
}

/** What restrains a character: the worst hold on the wrists, and what binds the legs. */
export interface Restrained {
  wrists: { held: Held; position: CuffPosition } | null;
  legs: Held | null;
}

export function restrainedBy(actor: any): Restrained {
  let wrists: Restrained["wrists"] = null;
  let legs: Held | null = null;
  for (const item of actor?.items ?? []) {
    const held = restraintOf(item);
    if (!held) continue;
    const state = restraintState(item, held.restraint);
    if (!state) continue;
    if (held.restraint.binds === "legs") legs ??= held;
    else {
      const position: CuffPosition = state === "front" ? "front" : "behind";
      // Behind the back is the worse hold, and a straitjacket's the worst.
      const worse = !wrists || (position === "behind" && wrists.position === "front") || (held.restraint.noHands && !wrists.held.restraint.noHands);
      if (worse) wrists = { held, position };
    }
  }
  return { wrists, legs };
}

/** A skill's name without its specialty, for comparing. */
const baseSkill = (name: unknown) => String(name ?? "").replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();

/** The line cuffed wrists put on a success roll, or null. */
export function cuffedRollLine(actor: any, context: { kind?: string; skill?: string; tags?: string[] }): { label: string; value: number } | null {
  const wrists = restrainedBy(actor).wrists;
  if (!wrists) return null;
  const tags = context.tags ?? [];
  if (tags.includes(OWN_ROLL) || context.kind === "defense") return null;
  const { table, item } = wrists.held;
  const figures = table.cuffed[wrists.position];
  const skill = baseSkill(context.skill);
  // Getting out of the restraint is the Escape roll's own modifier; Acrobatics to slip the cuffs is the same roll.
  if (skill === "escape") return null;
  if (skill && table.handSkills.some((s) => baseSkill(s) === skill)) {
    return figures.hands ? { label: F(table.i18n, "HandsLine", { name: item.name }), value: figures.hands } : null;
  }
  if (figures.dx && (tags.includes("DX") || context.kind === "attack")) return { label: F(table.i18n, "DxLine", { name: item.name }), value: figures.dx };
  return null;
}

/** Why cuffed wrists stop an attack with this weapon, or null. */
export function cuffedRefusal(actor: any, item: any, mode: { index?: number; ranged?: boolean } | null): string | null {
  const wrists = restrainedBy(actor).wrists;
  if (!wrists || !item) return null;
  const { table } = wrists.held;
  const figures = table.cuffed[wrists.position];
  if (figures.weapons === "none") return F(table.i18n, "NoWeapons", { name: wrists.held.item.name });
  if (mode?.ranged) return null;
  const melee = item.system?.meleeModes?.[Number(mode?.index) || 0];
  return melee && !melee.twoHanded ? F(table.i18n, "NoOneHanded", { name: wrists.held.item.name }) : null;
}

/**
 * Why a restrained character can't make a bare-handed blow, or null: no
 * punch with the wrists held where no weapon can be used (behind the back, a
 * straitjacket), no kick in leg irons. Cuffed in front, a punch is allowed.
 */
export function unarmedRefusal(actor: any, unarmed: unknown): string | null {
  if (unarmed !== "punch" && unarmed !== "kick") return null;
  const { wrists, legs } = restrainedBy(actor);
  if (unarmed === "punch" && wrists && wrists.held.table.cuffed[wrists.position].weapons === "none") {
    return F(wrists.held.table.i18n, "NoPunch", { name: wrists.held.item.name });
  }
  if (unarmed === "kick" && legs) return F(legs.table.i18n, "NoKick", { name: legs.item.name });
  return null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : undefined,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

/** A skill level, or its default. */
function level(api: GWorldApi, actor: any, skill: string, modifier: number): number {
  return api.actors.skillLevel(actor, skill) ?? (api.actors.attribute(actor, "DX") ?? 10) + modifier;
}

/** Escape from a restraint, at its modifier: freed on a success. */
async function escapeFrom(api: GWorldApi, held: Held, actor: any): Promise<void> {
  const { item, table, restraint } = held;
  const ns = table.i18n;
  const result: any = await api.roll.success({
    actor,
    // Escape defaults to DX-6 (Characters p. 192).
    base: level(api, actor, "Escape", -6),
    skill: "Escape",
    label: F(ns, "EscapeLabel", { name: item.name }),
    modifiers: restraint.escape ? [{ label: String(item.name), value: restraint.escape }] : [],
    tags: [OWN_ROLL],
  } as any);
  if (!result) return;
  if (result.success) await item.setFlag(MODULE_ID, RESTRAINT_FLAG, "off");
  await say(actor, String(item.name), [F(ns, result.success ? "Freed" : "Held", { name: actor?.name ?? "", restraint: item.name })]);
}

/** Acrobatics or Escape, whichever is better, to bring wrists cuffed behind round to the front. */
async function slipForward(api: GWorldApi, held: Held, actor: any): Promise<void> {
  const { item, table } = held;
  const ns = table.i18n;
  // Both default to DX-6 (Characters pp. 174, 192).
  const acrobatics = level(api, actor, "Acrobatics", -6);
  const escape = level(api, actor, "Escape", -6);
  const skill = acrobatics > escape ? "Acrobatics" : "Escape";
  const result: any = await api.roll.success({
    actor,
    base: Math.max(acrobatics, escape),
    skill,
    label: F(ns, "SlipLabel", { name: item.name, skill }),
    tags: [OWN_ROLL],
  } as any);
  if (!result) return;
  if (result.success) await item.setFlag(MODULE_ID, RESTRAINT_FLAG, "front");
  await say(actor, String(item.name), [F(ns, result.success ? "Slipped" : "NotSlipped", { name: actor?.name ?? "" })]);
}

/** The item sheet's section: whether the restraint is on, and where, and what it does. */
function sectionContext(item: any): Record<string, unknown> {
  const held = restraintOf(item)!;
  const { table, restraint } = held;
  const ns = table.i18n;
  const state = restraintState(item, restraint) ?? "off";
  const choices = restraint.binds === "wrists" ? ["off", "behind", "front"] : ["off", "on"];
  const shown = restraint.binds === "body" && state === "behind" ? "on" : state;
  return {
    title: L(ns, "Title"),
    stateLabel: L(ns, "State"),
    stateHint: L(ns, "StateHint"),
    states: choices.map((value) => ({ value, label: L(ns, `States.${value}`), selected: value === shown })),
    lines: table.lines(item, restraint),
    editable: item?.isOwner === true,
  };
}

function sectionListeners(element: HTMLElement, item: any): void {
  element.querySelector<HTMLSelectElement>("[data-gcc-restraint=state]")?.addEventListener("change", async (event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    await item.setFlag(MODULE_ID, RESTRAINT_FLAG, ["behind", "front", "on"].includes(value) ? value : "off");
  });
}

let readied = false;

/** Registers the engine's parts, once whichever books ask. */
export function readyRestraints(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  // The row buttons' labels are the first book's words: they are registered once.
  const ns = RESTRAINT_TABLES.all[0]?.i18n ?? "GCC.HT";

  api.sheets.registerSheetSection({
    module: MODULE_ID,
    key: "restraint-item",
    sheet: "item",
    template: `modules/${MODULE_ID}/templates/restraint-item.hbs`,
    visible: (item) => restraintOf(item) !== null,
    context: (item) => sectionContext(item),
    listeners: (element, item) => sectionListeners(element, item),
  });

  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "restraint-escape",
    itemTypes: ["equipment", "armor"],
    label: L(ns, "Escape"),
    icon: "fa-solid fa-link-slash",
    visible: (item) => {
      const held = restraintOf(item);
      return Boolean(held && restraintState(item, held.restraint));
    },
    run: (item, actor) => {
      const held = restraintOf(item);
      return held ? escapeFrom(api, held, actor) : undefined;
    },
  });
  api.sheets.registerRowAction({
    module: MODULE_ID,
    key: "restraint-slip",
    itemTypes: ["equipment", "armor"],
    label: L(ns, "Slip"),
    icon: "fa-solid fa-person-falling",
    visible: (item) => {
      const held = restraintOf(item);
      return Boolean(held && held.restraint.binds === "wrists" && held.restraint.slip && restraintState(item, held.restraint) === "behind");
    },
    run: (item, actor) => {
      const held = restraintOf(item);
      return held ? slipForward(api, held, actor) : undefined;
    },
  });

  // Leg irons are Crippled Legs: Lame, crippled (Characters p. 141).
  Hooks.on("gworld.traitEffects", (context: any) => {
    if (!context?.actor || !context.effects) return;
    const legs = restrainedBy(context.actor).legs;
    if (!legs) return;
    if (context.effects.lame === null || context.effects.lame === undefined) {
      context.effects.lame = "crippled";
      context.sources.push({ effect: "lame", label: String(legs.item.name) });
    }
  });

  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor || !Array.isArray(context.modifiers)) return;
    const line = cuffedRollLine(actor, context);
    if (line) context.modifiers.push(line);
  });

  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const actor = context?.actor;
    if (!actor || context.refusal) return;
    const refusal = cuffedRefusal(actor, context.item ?? null, context.mode ?? null) ?? unarmedRefusal(actor, context.unarmed);
    if (refusal) context.refusal = refusal;
  });
}
