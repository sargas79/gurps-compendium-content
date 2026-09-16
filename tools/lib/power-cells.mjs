/**
 * What a gadget is powered by, read from the GCA file's own columns.
 *
 * Power cells are Ultra-Tech's, not the Basic Set's: sizes AA to F, "assumed to
 * store power without running down when not in use", a D cell "often worn as a
 * separate power pack" and an E cell "about the size of a backpack" (pp. 18-19).
 * The system's schema has no field for any of it and should not: the cells
 * belong to the book. So this is written into the module's own extension data,
 * where the book's rules read it.
 *
 * Three columns carry it. `battery(...)` is the second half of the book's
 * Weight column: what powers the device, written as an optional count, a size
 * letter, and "p" for a supply worn as a pack -- "C", "2C", "Dp", "10Fp". Where
 * the supply is not a cell the book prints its weight in pounds instead, still
 * with the "p": the Assault Laser's "10/4p" is a 10-lb. weapon with a 4-lb.
 * chemical power pack (p. 118). `power(...)` is a draw with an endurance:
 * "2D/8 hr.". `emptyweight(...)` is what the thing weighs with the cell out.
 *
 * Anything that cannot be read is kept verbatim rather than guessed at, so a
 * notation nobody has seen yet shows up as itself instead of as a wrong number.
 */

/** The cell sizes the book lists, smallest first (p. 18). */
export const CELL_SIZES = ["AA", "A", "B", "C", "D", "E", "F"];

const BATTERY = /^(\d+)?\s*(AA|[A-F])?\s*(p)?$/i;

/** One `battery(...)` column, or null where it says nothing this can read. */
export function readBattery(text) {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const m = BATTERY.exec(raw);
  if (!m || (!m[2] && !m[1])) return { raw };
  // A figure with no cell size is the pack's weight in pounds, not a count of
  // cells: the book prints "4p" for a four-pound chemical power pack.
  if (!m[2]) {
    return m[3] ? { packWeight: Number(m[1]), backpack: true, raw } : { raw };
  }
  return {
    cell: m[2].toUpperCase(),
    cells: Number(m[1] ?? 1) || 1,
    ...(m[3] ? { backpack: true } : {}),
    raw,
  };
}

/** One `power(...)` column: a draw and how long it lasts. */
export function readPower(text) {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const m = /^(\d+)?\s*(AA|[A-F])\s*\/\s*(.+)$/i.exec(raw);
  if (!m) return { raw };
  return {
    cell: m[2].toUpperCase(),
    cells: Number(m[1] ?? 1) || 1,
    // "8 hr.", "1 wk", "1 mon." -- the book's own wording, kept as written.
    endurance: m[3].trim().replace(/\s*\(.*$/, ""),
    raw,
  };
}

/** What a gadget's three power columns come to, or null where it has none. */
export function powerOf(fields) {
  const battery = readBattery(fields.get("battery"));
  const draw = readPower(fields.get("power"));
  const empty = Number((fields.get("emptyweight") ?? "").trim());
  const out = {
    ...(battery ?? {}),
    ...(draw ? { draw } : {}),
    ...(Number.isFinite(empty) && empty > 0 ? { emptyWeight: empty } : {}),
  };
  return Object.keys(out).length ? out : null;
}
