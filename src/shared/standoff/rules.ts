/**
 * Who Draws First?, the rule two books print: Martial Arts p. 103 for blades,
 * High-Tech p. 82 for guns. Which standoff it is and who wins a tie are the
 * same in both; each book brings its own special modifiers.
 */

export interface ModifierKey { key: string; value: number }

export interface Drawer {
  ready: boolean;
  /** Fast-Draw skill for the weapon, or null for none. */
  fastDraw: number | null;
}

export type DrawCase =
  /** Both have weapons out: the turn sequence or Cascading Waits settles it. */
  | "bothReady"
  /** One has a weapon out and the other can't Fast-Draw: the ready fighter strikes first. */
  | "readyStrikes"
  /** One has a weapon out and the other can Fast-Draw: weapon skill against Fast-Draw at -10. */
  | "readyVsFastDraw"
  /** Neither ready, one knows Fast-Draw: he rolls it, and on a failure it's a contest of weapon skill. */
  | "fastDrawRoll"
  /** Neither ready, both or neither know Fast-Draw: a Quick Contest of Fast-Draw or weapon skill. */
  | "contest";

/** The Fast-Draw roll's penalty against a weapon already out. */
export const AGAINST_READY = -10;

/** Which standoff this is, and the side it turns on ("a" or "b"). */
export function drawCase(a: Drawer, b: Drawer): { kind: DrawCase; side: "a" | "b" | null; fastDraw: boolean } {
  if (a.ready && b.ready) return { kind: "bothReady", side: null, fastDraw: false };
  if (a.ready || b.ready) {
    const ready = a.ready ? "a" : "b";
    const other = a.ready ? b : a;
    return other.fastDraw !== null ? { kind: "readyVsFastDraw", side: ready, fastDraw: true } : { kind: "readyStrikes", side: ready, fastDraw: false };
  }
  if ((a.fastDraw === null) !== (b.fastDraw === null)) return { kind: "fastDrawRoll", side: a.fastDraw !== null ? "a" : "b", fastDraw: true };
  return { kind: "contest", side: null, fastDraw: a.fastDraw !== null && b.fastDraw !== null };
}

/** Who strikes first from a Quick Contest's outcome: a tie goes to the ready fighter, or is simultaneous. */
export function drawWinner(kind: DrawCase, outcome: "first" | "second" | "tie", readyIsFirst: boolean): "first" | "second" | "simultaneous" {
  if (outcome !== "tie") return outcome;
  if (kind === "readyVsFastDraw") return readyIsFirst ? "first" : "second";
  return "simultaneous";
}
