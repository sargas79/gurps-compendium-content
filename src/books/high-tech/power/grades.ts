/**
 * The grades of external power, from the Electricity and Electronics
 * supplement (HT:EE p. 9), which splits what High-Tech calls "external
 * power" (p. 14) five ways, from least to most: peripheral (a computer's
 * port), automotive (a vehicle's outlet), household, major appliance, and
 * industrial. A record keeps the grades it runs on in `power.grades`, as
 * keys; High-Tech's unsplit external power is `external`.
 */

export const POWER_GRADES = ["peripheral", "automotive", "household", "majorAppliance", "industrial", "external"] as const;
export type PowerGrade = (typeof POWER_GRADES)[number];

/** Each grade's TL, and the voltage the book gives it (volts at TL6, then from TL7, where they differ). */
export const GRADES: Readonly<Record<PowerGrade, { tl: number | null }>> = Object.freeze({
  // A computer's port, 5 volts (USB, 1996).
  peripheral: { tl: 8 },
  // A vehicle's outlet: 6 volts at TL6, 12 at TL7-8.
  automotive: { tl: 6 },
  // 110-120 volts in North America and Japan, 220-240 elsewhere.
  household: { tl: 6 },
  // 230-240 volts, for large appliances and home workshops.
  majorAppliance: { tl: 6 },
  // Typically 480 volts, for heavy-duty equipment.
  industrial: { tl: 6 },
  // High-Tech's own, unsplit (p. 14).
  external: { tl: null },
});

/** The grades a record keeps that the table knows, in the book's order. */
export function gradesOf(values: readonly unknown[]): PowerGrade[] {
  return POWER_GRADES.filter((grade) => values.includes(grade));
}
