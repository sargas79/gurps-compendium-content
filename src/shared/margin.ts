/**
 * A failed roll's margin, read by its size.
 *
 * The books time an affliction by "the margin of failure": how far the roll
 * missed, a whole number of at least nothing. The system's rolls report that
 * size (`resolveSuccess` never gives a negative margin), but its hooks don't
 * say so, and its own tests hand `gworld.afflictionEffect` a failure as a
 * negative number. Every reader here takes the size, so either reads the same.
 */
export function marginOfFailure(margin: unknown): number {
  return Math.floor(Math.abs(Number(margin) || 0));
}
