/**
 * "Talents never add to wildcard skills" (GURPS Monster Hunters 1: Champions
 * p. 24). A wildcard already stands for every skill it covers, so a Talent
 * covering one of them adds nothing to it.
 *
 * The system works out a skill's Talent bonus as one of its bonus lines; this
 * cancels that line on a wildcard skill, with the reason, while the book's
 * switch is on.
 */

/** A bonus line, as the system's skill-bonuses hook hands them over. */
interface BonusLine {
  key?: string;
  label: string;
  value: number;
  source: string;
  reason?: string;
}

/** Cancels the Talent line on a wildcard skill. Returns whether it changed anything. */
export function skipTalentOnWildcard(context: { difficulty?: string; lines: BonusLine[] }, reason: string): boolean {
  if (context.difficulty !== "W") return false;
  let changed = false;
  for (const line of context.lines) {
    if (line.key !== "talent" || line.value === 0) continue;
    line.value = 0;
    line.reason = reason;
    changed = true;
  }
  return changed;
}
