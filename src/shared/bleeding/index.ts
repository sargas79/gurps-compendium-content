/**
 * Severe bleeding at the table, for every book that prints it (Martial Arts
 * p. 138, High-Tech p. 162).
 *
 * Each book registers its table in `BLEEDING_TABLES` -- its switch, the flag
 * its wounds are kept in and its text -- and records the severe wounds its
 * own table finds with `recordSevereWound`. `readySevereBleeding` registers
 * once however many books call it, and reads every switched-on book's wounds
 * together, so two books on at once make one worst wound, not two:
 *
 *   - the worst wound sets how often the character bleeds and adds its
 *     penalty to the roll (`gworld.bleedingSchedule`);
 *   - First Aid on a bleeding patient takes the same penalty, and a wound
 *     that needs Surgery isn't stopped by it (`gworld.firstAid`);
 *   - a GM tool staunches it with a Surgery roll at that penalty.
 *
 * A book whose table has `woundSize` also puts the wound's size on First Aid
 * and Surgery (High-Tech p. 162: the bleeding roll's whole penalty).
 */

import { BookTables, type BookTable } from "../book-tables.js";
import { MODULE_ID, type GWorldApi } from "../module.js";
import { worstBleeding, type SevereWound } from "./rules.js";

export * from "./rules.js";

/** One book's severe bleeding. */
export interface BleedingTable extends BookTable {
  /** Whether the book's switch is on. */
  on: () => boolean;
  /** The actor flag (this module's) the book's wounds are kept in. */
  flag: string;
  /**
   * Where the book's text sits: "GCC.MA.Injury" reads "GCC.MA.Injury.SevereWound",
   * `Staunch`, `StaunchWho`, `NoSurgery`, `StaunchLabel`, `Surgeon`, and
   * `WoundSize` where the table has `woundSize`.
   */
  i18n: string;
  /** The wound-size penalty the book adds to First Aid and Surgery on a bleeding patient, or none. */
  woundSize?: (actor: any) => number;
}

export const BLEEDING_TABLES = new BookTables<BleedingTable>();

const onTables = () => BLEEDING_TABLES.all.filter((t) => t.on());

/** Adds a severe wound to an actor, in the book's own flag. */
export async function recordSevereWound(actor: any, table: BleedingTable, wound: SevereWound): Promise<void> {
  await actor.setFlag(MODULE_ID, table.flag, [...(actor.getFlag(MODULE_ID, table.flag) ?? []), wound]);
}

/** Forgets a book's severe wounds on an actor. */
export async function clearSevereWounds(actor: any, table: BleedingTable): Promise<void> {
  if (actor?.getFlag?.(MODULE_ID, table.flag) !== undefined) await actor.unsetFlag(MODULE_ID, table.flag);
}

/** A bleeding actor's worst severe wound, across every switched-on book; null while not bleeding. */
export function severeBleedingOf(actor: any): SevereWound | null {
  if (!actor?.statuses?.has?.("bleeding")) return null;
  return worstBleeding(onTables().flatMap((t) => (actor.getFlag?.(MODULE_ID, t.flag) ?? []) as SevereWound[]));
}

/** What a bleeding patient's treatment is at: the worst wound's line, and the wound's size where a book says so. */
export function treatmentLines(actor: any): Array<{ label: string; value: number }> {
  if (!actor?.statuses?.has?.("bleeding")) return [];
  const tables = onTables();
  const worst = severeBleedingOf(actor);
  const lines: Array<{ label: string; value: number }> = [];
  if (worst?.modifier && tables[0]) lines.push({ label: game.i18n.localize(`${tables[0].i18n}.SevereWound`), value: worst.modifier });
  const sized = tables.find((t) => t.woundSize);
  const size = sized?.woundSize?.(actor) ?? 0;
  if (sized && size) lines.push({ label: game.i18n.localize(`${sized.i18n}.WoundSize`), value: size });
  return lines;
}

let readied = false;

/** Registers the hooks and the Surgery tool, once whichever books ask. */
export function readySevereBleeding(api: GWorldApi): void {
  if (readied) return;
  readied = true;
  const text = (key: string) => game.i18n.localize(`${onTables()[0]?.i18n ?? BLEEDING_TABLES.all[0]?.i18n ?? ""}.${key}`);

  Hooks.on(api.combat.hooks.bleedingSchedule, (context: any) => {
    const worst = severeBleedingOf(context?.actor);
    if (!worst) return;
    context.intervalSeconds = Math.min(Number(context.intervalSeconds) || 60, worst.intervalSeconds);
    context.modifier = (Number(context.modifier) || 0) + worst.modifier;
  });
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!(context?.tags ?? []).includes("firstAid")) return;
    context.modifiers.push(...treatmentLines(context.opponent));
  });
  Hooks.on(api.combat.hooks.firstAid, (context: any) => {
    if (severeBleedingOf(context?.patient)?.surgery) context.stopsBleeding = false;
  });
  api.sheets.registerGmTool({
    module: MODULE_ID,
    key: "staunch-surgery",
    label: text("Staunch"),
    icon: "fa-solid fa-kit-medical",
    visible: () => onTables().length > 0,
    open: () => staunch(api, text),
  });
}

/** Staunches the targeted patient's bleeding with a Surgery roll. */
async function staunch(api: GWorldApi, text: (key: string) => string): Promise<void> {
  const patient = [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
  if (!patient) return void ui.notifications?.warn(text("StaunchWho"));
  // The selected token's character operates, or whoever the GM picks.
  let surgeon = (globalThis as any).canvas?.tokens?.controlled?.[0]?.actor ?? null;
  if (!surgeon) {
    const options = [...((game as any).actors ?? [])].filter((a: any) => a.type === "character" && a.id !== patient.id).map((a: any) => `<option value="${a.id}">${foundry.utils.escapeHTML(String(a.name))}</option>`).join("");
    const id = await foundry.applications.api.DialogV2.prompt({
      window: { title: text("Staunch") },
      content: `<div class="gworld"><label style="display:flex;justify-content:space-between;gap:8px"><span>${text("Surgeon")}</span><select name="surgeon">${options}</select></label></div>`,
      ok: { label: text("Staunch"), callback: (_e: Event, button: HTMLElement) => button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('[name="surgeon"]')?.value ?? "" },
      rejectClose: false,
    }) as string | null;
    surgeon = id ? (game as any).actors?.get(id) ?? null : null;
  }
  if (!surgeon) return;
  const level = api.actors.skillLevel(surgeon, "Surgery");
  if (level === null) return void ui.notifications?.warn(text("NoSurgery"));
  const outcome: any = await api.roll.success({
    actor: surgeon,
    base: level,
    label: game.i18n.format(`${onTables()[0]?.i18n ?? ""}.StaunchLabel`, { patient: String(patient.name ?? "") }),
    skill: "Surgery",
    modifiers: treatmentLines(patient),
  } as any);
  if (!outcome?.success) return;
  await api.actors.stopBleeding(patient);
  if (patient.isOwner) for (const table of BLEEDING_TABLES.all) await clearSevereWounds(patient, table);
}

/** Forgets the tables and lets the hooks register again. For tests. */
export function resetSevereBleeding(): void {
  BLEEDING_TABLES.clear();
  readied = false;
}
