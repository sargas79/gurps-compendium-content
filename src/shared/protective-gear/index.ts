/**
 * Protective gear as the system meets it, for every book that prints it: what
 * a worn piece adds to a character's trait effects (`gworld.traitEffects`),
 * the list of it a sheet shows in a book's own words, and the patient a
 * Diagnosis roll reads biomedical sensors from. Each book registers its own
 * listeners with its own table and switch; these only do the writing.
 *
 * Biomedical sensors are one rule two books print (Ultra-Tech p. 187,
 * High-Tech p. 75), so they are one listener: each book registers which of
 * its gear carries them, and a patient's sensors give +1 once, whichever
 * books are on.
 */

import { BookTables, bookOf, type BookTable } from "../book-tables.js";
import { climateTolerance, widenComfortZone } from "../climate/rules.js";
import type { GWorldApi } from "../module.js";
import { BIOMEDICAL, pressureSupportLevel, type Protection } from "./rules.js";

export * from "./rules.js";

const VISION_RANK: Record<string, number> = { noPeripheral: 1, tunnel: 2 };

/**
 * Adds what a worn piece protects against to a character's trait effects,
 * naming it as the source of each: never loosening what is already there.
 */
export function addProtection(context: any, protection: Protection, label: string): void {
  const effects = context.effects;
  const push = (effect: string, value?: number) => context.sources.push({ effect, label, ...(value !== undefined ? { value } : {}) });
  if (protection.sealed && !effects.sealed) { effects.sealed = true; push("sealed"); }
  if (protection.vacuumSupport && !effects.vacuumSupport) { effects.vacuumSupport = true; push("vacuumSupport"); }
  const pressure = pressureSupportLevel(protection.pressureAtm ?? 0);
  if (pressure > (Number(effects.pressureSupport) || 0)) { effects.pressureSupport = pressure; push("pressureSupport", pressure); }
  const zone = protection.climate ? climateTolerance(protection.climate) : protection.comfort;
  if (zone) widenComfortZone(context, zone, label);
  if (effects.protectedSense) {
    if ((protection.glare || protection.mask) && !effects.protectedSense.vision) { effects.protectedSense.vision = true; push("protectedSense.vision"); }
    if ((protection.mask || protection.smell) && !effects.protectedSense.tasteSmell) { effects.protectedSense.tasteSmell = true; push("protectedSense.tasteSmell"); }
    if (protection.hearing && !effects.protectedSense.hearing) { effects.protectedSense.hearing = true; push("protectedSense.hearing"); }
  }
  if (protection.filter && !effects.filterLungs) { effects.filterLungs = true; push("filterLungs"); }
  if (protection.air && !effects.doesntBreathe) { effects.doesntBreathe = true; push("doesntBreathe"); }
  // A worse limit on sight only: the system never loosens it (Characters p. 151).
  if (protection.restrictedVision && (VISION_RANK[protection.restrictedVision] ?? 0) > (VISION_RANK[effects.restrictedVision] ?? 0)) {
    effects.restrictedVision = protection.restrictedVision;
    push(`restrictedVision.${protection.restrictedVision}`);
  }
  if (protection.noSmellTaste && !effects.noSmellTaste) { effects.noSmellTaste = true; push("noSmellTaste"); }
}

/**
 * A readable list of what a piece protects against, in a book's words: the
 * keys are read under `<prefix>.Protection`.
 */
export function protectionText(prefix: string, protection: Protection | null): string {
  if (!protection) return "";
  const L = (key: string) => game.i18n.localize(`${prefix}.Protection.${key}`);
  const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`${prefix}.Protection.${key}`, data);
  const parts: string[] = [];
  if (protection.sealed) parts.push(L("sealed"));
  if (protection.vacuumSupport) parts.push(L("vacuumSupport"));
  if (protection.pressureAtm) parts.push(F("pressure", { atm: protection.pressureAtm }));
  if (protection.radiationPf) parts.push(F("radiationPf", { pf: protection.radiationPf }));
  if (protection.climate) parts.push(F("climate", { low: protection.climate[0], high: protection.climate[1] }));
  if (protection.comfort) parts.push(F("comfort", { cold: protection.comfort.coldF, heat: protection.comfort.heatF }));
  if (protection.glare) parts.push(L("glare"));
  if (protection.hearing) parts.push(L("hearing"));
  if (protection.mask) parts.push(L("mask"));
  if (protection.smell) parts.push(L("smell"));
  if (protection.filter) parts.push(L("filter"));
  if (protection.air) parts.push(L("air"));
  if (protection.restrictedVision) parts.push(L(protection.restrictedVision));
  if (protection.noSmellTaste) parts.push(L("noSmellTaste"));
  return parts.join(", ");
}

/** The patient of a Diagnosis roll: the roll's opponent, or the one targeted token's character. */
export function diagnosisPatient(context: any): any {
  return context?.opponent ?? [...((game as any).user?.targets ?? [])][0]?.actor ?? null;
}

/** One book's gear with biomedical sensors. */
export interface BiomedicalTable extends BookTable {
  /** Whether the book's switch is on. */
  on: () => boolean;
  /** Whether an item is one of the book's pieces with biomedical sensors. */
  applies: (item: any) => boolean;
  /** The label of the bonus on the Diagnosis roll, naming the piece. */
  label: (item: any) => string;
}

/** Every book's gear with biomedical sensors. */
export const BIOMEDICAL_TABLES = new BookTables<BiomedicalTable>();

/**
 * The table that claims an item as carrying biomedical sensors, or null. An
 * item from a book with a table takes that book's, and only while that
 * book's switch is on; any other takes the first switched-on table that
 * claims it.
 */
export function biomedicalTableOf(item: any): BiomedicalTable | null {
  if (!item) return null;
  const own = BIOMEDICAL_TABLES.forBook(bookOf(item));
  if (own) return own.on() && own.applies(item) ? own : null;
  return BIOMEDICAL_TABLES.all.find((t) => t.on() && t.applies(item)) ?? null;
}

const wornGear = (item: any) => (item?.type === "armor" || item?.type === "equipment") && item.system?.equipped === true;

let biomedicalReadied = false;

/** Puts a patient's biomedical sensors on a Diagnosis roll, once whichever books ask. */
export function readyBiomedical(api: GWorldApi): void {
  if (biomedicalReadied) return;
  biomedicalReadied = true;
  Hooks.on(api.combat.hooks.successRollModifiers, (context: any) => {
    if (!context?.actor || !/^diagnosis\b/i.test(String(context.skill ?? ""))) return;
    const patient = diagnosisPatient(context);
    for (const item of patient?.items ?? []) {
      const table = wornGear(item) ? biomedicalTableOf(item) : null;
      if (!table) continue;
      // However many pieces, or books, claim them, the sensors are +1 once.
      context.modifiers.push({ label: table.label(item), value: BIOMEDICAL.inPerson });
      return;
    }
  });
}

/** Forgets the listener and the tables. For tests. */
export function resetBiomedical(): void {
  biomedicalReadied = false;
  BIOMEDICAL_TABLES.clear();
}
