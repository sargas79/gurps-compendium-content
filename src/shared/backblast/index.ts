/**
 * Backblast at the table, for every book that prints it (Ultra-Tech p. 145,
 * High-Tech p. 147). The rules are in `rules.ts`.
 *
 * Each book registers a table: its switch, the backblast it gives an item,
 * the label its roll goes out under, and whether it prints the rest of the
 * rule -- the cone's victims at full and half damage, and firing indoors.
 * When a launcher fires (`gworld.afterShots`, so never for an attack that was
 * refused), the backblast's damage is rolled. With the cone, the tokens
 * behind the firer, the other way from the target, are named, and those at
 * half damage get a half-damage roll of their own. Indoors is an attack
 * option: the walls throw a burning backblast back at the firer, and the
 * report calls for a HT-4 roll against being stunned unless the firer wears
 * hearing protection.
 */

import { BookTables, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { INDOORS_HT_PENALTY, backblastZone, reflectsAtFirer, type Backblast, type Point } from "./rules.js";

export * from "./rules.js";

/** One book's backblast table. */
export interface BackblastTable extends BookTable {
  /** Whether the book's switch is on. */
  on: () => boolean;
  /** The backblast the book gives the item, or null for none. */
  of(item: any): Backblast | null;
  /** The label the backblast's roll goes out under. */
  label(blast: Backblast): string;
  /** Whether the book prints the cone's victims at full and half damage, and firing indoors. */
  cone: boolean;
  /** Where the book's text sits for the cone and indoors: "GCC.HT.Backblast" reads "GCC.HT.Backblast.Caught". */
  i18n?: string;
}

/** Every book's backblast table. */
export const BACKBLAST_TABLES = new BookTables<BackblastTable>();

/** The table whose rule applies to an item, and the backblast it gives it, or null. */
export function backblastOf(item: any): { table: BackblastTable; blast: Backblast } | null {
  const table = BACKBLAST_TABLES.forItem(item, (t) => t.on());
  const blast = table?.of(item) ?? null;
  return table && blast ? { table, blast } : null;
}

/** The attack option for firing from indoors, by its `<module>.<key>`. */
export const INDOORS_OPTION = "backblast-indoors";
export type Indoors = "" | "enclosed" | "protected";

const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

/** What each launcher was last fired with: where the firer stood and aimed, and whether indoors. */
const pending = new Map<string, { indoors: Indoors; aim: Point | null }>();

/** A token's centre, in yards on the map. */
function centre(token: any, yardsPerPixel: number): Point | null {
  const object = token?.object ?? token;
  const c = object?.center;
  if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: c.x * yardsPerPixel, y: c.y * yardsPerPixel };
  const doc = token?.document ?? token;
  const size = Number((globalThis as any).canvas?.dimensions?.size) || 0;
  if (!doc || !size || !Number.isFinite(doc.x)) return null;
  return { x: (doc.x + (Number(doc.width) || 1) * size / 2) * yardsPerPixel, y: (doc.y + (Number(doc.height) || 1) * size / 2) * yardsPerPixel };
}

function yardsPerPixel(): number {
  const d = (globalThis as any).canvas?.dimensions;
  return d?.size ? (Number(d.distance) || 1) / d.size : 0;
}

/** The tokens caught behind a firer who aimed at `aim`, by zone. */
export function caughtBehind(actor: any, aim: Point | null, blast: Backblast): { full: any[]; half: any[] } {
  const scale = yardsPerPixel();
  const firerToken = actor?.getActiveTokens?.()?.[0] ?? null;
  const firer = firerToken && scale ? centre(firerToken, scale) : null;
  const caught = { full: [] as any[], half: [] as any[] };
  if (!firer || !aim) return caught;
  for (const token of (globalThis as any).canvas?.tokens?.placeables ?? []) {
    if (token === firerToken || (token?.document && token.document === firerToken?.document)) continue;
    const at = centre(token, scale);
    const zone = at ? backblastZone(firer, aim, at, blast) : null;
    if (zone) caught[zone].push(token);
  }
  return caught;
}

/** Where the firer aims: their one targeted token, in yards. */
function aimPoint(): Point | null {
  const scale = yardsPerPixel();
  const targets = [...((game as any).user?.targets ?? [])];
  return targets.length && scale ? centre(targets[0], scale) : null;
}

async function say(actor: any, title: string, lines: string[]): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>${lines.map((l) => `<div class="gc-result">${esc(l)}</div>`).join("")}</div>`,
  });
}

const installed = new WeakSet<object>();

/**
 * Registers the backblast's roll on firing and the indoors option, once for
 * however many books call it.
 */
export function readyBackblast(api: GWorldApi): void {
  if (installed.has(api)) return;
  installed.add(api);
  const T = (table: BackblastTable, key: string, data: Record<string, unknown> = {}) => game.i18n.format(`${table.i18n}.${key}`, data);

  api.combat.registerAttackOption({
    module: MODULE_ID,
    key: INDOORS_OPTION,
    label: game.i18n.localize("GCC.Backblast.Indoors"),
    attack: "ranged",
    input: {
      type: "select",
      choices: (["", "enclosed", "protected"] as const).map((value) => ({ value, label: game.i18n.localize(`GCC.Backblast.IndoorsChoice.${value || "outdoors"}`) })),
    },
    available: (context: any) => backblastOf(context?.item)?.table.cone === true,
    apply: (context: any, value: unknown) => {
      const found = backblastOf(context?.item);
      if (!found || (value !== "enclosed" && value !== "protected")) return null;
      const notes = [game.i18n.localize(reflectsAtFirer(found.blast) ? "GCC.Backblast.IndoorsReflects" : "GCC.Backblast.IndoorsSafe")];
      if (value === "enclosed") notes.push(game.i18n.format("GCC.Backblast.IndoorsDeafening", { penalty: INDOORS_HT_PENALTY }));
      return { notes };
    },
  } as any);

  // What the attack was fired with: read when the shots are spent.
  Hooks.on(api.combat.hooks.attackModifiers, (context: any) => {
    const item = context?.item;
    if (!item?.uuid || context?.mode?.ranged !== true || !backblastOf(item)) return;
    const chosen = context.options?.[`${MODULE_ID}.${INDOORS_OPTION}`];
    pending.set(item.uuid, { indoors: chosen === "enclosed" || chosen === "protected" ? chosen : "", aim: aimPoint() });
  });

  Hooks.on(api.combat.hooks.afterShots, (context: any) => {
    const item = context?.item;
    const actor = context?.actor;
    const found = backblastOf(item);
    if (!found || !actor) return;
    const { table, blast } = found;
    const fired = pending.get(item.uuid) ?? { indoors: "" as Indoors, aim: aimPoint() };
    pending.delete(item.uuid);
    if (!table.cone) {
      void api.roll.damage({ actor, label: table.label(blast), formula: blast.damage, damageType: blast.kind } as any);
      return;
    }
    const caught = caughtBehind(actor, fired.aim, blast);
    const names = (tokens: any[]) => tokens.map((t) => String(t?.name ?? t?.document?.name ?? "")).filter(Boolean).join(", ");
    const lines = [T(table, blast.halfYards > blast.fullYards ? "Reach" : "ReachFull", { damage: blast.damage, type: T(table, `Kind.${blast.kind}`), full: blast.fullYards, half: blast.halfYards })];
    if (!fired.aim) lines.push(T(table, "NoAim"));
    else if (!caught.full.length && !caught.half.length) lines.push(T(table, "NobodyCaught"));
    if (caught.full.length) lines.push(T(table, "CaughtFull", { names: names(caught.full) }));
    if (caught.half.length) lines.push(T(table, "CaughtHalf", { names: names(caught.half) }));
    const reflected = fired.indoors !== "" && reflectsAtFirer(blast);
    if (reflected) lines.push(T(table, "Reflected", { name: String(actor.name ?? "") }));
    void (async () => {
      await say(actor, table.label(blast), lines);
      if (caught.full.length || reflected || !fired.aim) {
        await api.roll.damage({ actor, label: table.label(blast), formula: blast.damage, damageType: blast.kind } as any);
      }
      if (caught.half.length) {
        await api.roll.damage({ actor, label: T(table, "HalfLabel", { label: table.label(blast) }), formula: blast.damage, damageType: blast.kind, halfDamage: true } as any);
      }
      if (fired.indoors === "enclosed") {
        const ht = Number(api.actors.attribute(actor, "HT")) || 10;
        const outcome: any = await api.roll.success({ actor, base: ht, label: T(table, "DeafeningRoll"), kind: "attribute", skill: "HT", tags: ["HT"], modifiers: [{ label: T(table, "Deafening"), value: INDOORS_HT_PENALTY }] } as any);
        if (outcome && !outcome.success) await api.actors.applyCondition(actor, { key: "stunned" } as any);
      }
    })();
  });
}
