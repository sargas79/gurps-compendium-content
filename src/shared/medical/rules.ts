/**
 * Medical devices that treat on their own skill, for every book that prints
 * them (Ultra-Tech pp. 196-202, High-Tech p. 220).
 *
 * A device of this kind is worked by a character, but the roll is the
 * device's: Ultra-Tech's automeds and suitcase docs give First Aid, Physician,
 * Surgery and Diagnosis at a skill that rises with TL, and High-Tech's
 * automatic external defibrillator resuscitates at an effective skill of 12
 * once it is hooked up. The system's healing calls take that skill and TL in
 * place of the healer's (API 1.60.0, resuscitation since 1.77.0). Which
 * devices there are, and their figures, is each book's table in
 * `MEDICAL_TABLES`; an item takes its own book's, and only while that book's
 * switch is on.
 *
 * Equipment bonuses to a treatment don't add up: of several pieces of gear,
 * the best counts (Campaigns p. 345), which `bestLine` picks.
 */

import { BookTables, type BookTable } from "../book-tables.js";

/** The rolls a device can make on its own. */
export type DeviceSkill = "firstAid" | "physician" | "surgery" | "diagnosis" | "resuscitation";

export interface Device {
  /** The TL its skills are given at. */
  tl: number;
  skills: Partial<Record<DeviceSkill, number>>;
  /** Skill added per TL after `tl`. */
  perTl: number;
}

/** One book's devices. */
export interface MedicalTable extends BookTable {
  /** Whether the book's switch for its medical gear is on. */
  on: () => boolean;
  /** The devices, by the name pattern of the record. */
  devices: ReadonlyArray<readonly [RegExp, Device]>;
}

export const MEDICAL_TABLES = new BookTables<MedicalTable>();

/** The device a name is, in a list of devices, or null. */
export function deviceIn(devices: ReadonlyArray<readonly [RegExp, Device]> | null | undefined, name: string): Device | null {
  const text = String(name ?? "").trim();
  return devices?.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** The device an item is, by its own book's table while that book's switch is on; null otherwise. */
export function deviceFor(item: any): Device | null {
  return deviceIn(MEDICAL_TABLES.forItem(item, (table) => table.on())?.devices, String(item?.name ?? ""));
}

/** A device's skill at the TL it was made, or null where it has none. */
export function deviceSkill(device: Device, skill: DeviceSkill, tl: number): number | null {
  const base = device.skills[skill];
  if (base === undefined) return null;
  return base + device.perTl * Math.max(0, Math.floor(tl) - device.tl);
}

/** Of several equipment lines on one treatment, the best: they don't add up (Campaigns p. 345). */
export function bestLine<T extends { value: number }>(lines: readonly T[]): T | null {
  return lines.reduce<T | null>((best, line) => (best === null || line.value > best.value ? line : best), null);
}
