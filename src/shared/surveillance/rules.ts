/**
 * Countersurveillance and jamming: the rules the books print alike.
 *
 * Ultra-Tech (p. 105) and High-Tech (p. 212) find a hidden bug by the same
 * Quick Contest: the sweeper's Electronics Operation (Surveillance) against
 * that of whoever hid it. A radio jammer (High-Tech p. 212) makes anyone who
 * would use radio gear within its range win a Quick Contest of his own
 * Electronics Operation against the jammer operator's Electronics Operation
 * (EW), and a little further out still roll against his skill, unopposed.
 * Each book's figures -- its gear, its ranges, how far out the unopposed roll
 * reaches -- are its own, in its table.
 */

/** The skill a bug is hidden and found with (Ultra-Tech p. 105; High-Tech pp. 208, 212). */
export const SURVEILLANCE = "Electronics Operation (Surveillance)";
/** The skill a jammer is run with (High-Tech p. 212). */
export const EW = "Electronics Operation (EW)";

/** What a jammer does to gear at a distance: a Quick Contest within its range, an unopposed roll a little further out, or nothing. */
export type JammingReach = "contest" | "roll" | "clear";

/**
 * How a jammer reaches gear this many yards from it: within its range, a
 * Quick Contest; within `shadow` times its range, an unopposed roll to use the
 * gear even where none is normally needed; beyond, nothing.
 */
export function jammingReach(yards: number, range: number, shadow: number): JammingReach {
  if (!(range > 0) || !Number.isFinite(yards) || yards < 0) return "clear";
  if (yards <= range) return "contest";
  if (yards <= range * Math.max(1, shadow)) return "roll";
  return "clear";
}

/** Whether a side won a Quick Contest: `first` is the side that asked. */
export const wonContest = (outcome: unknown): boolean => outcome === "first";
