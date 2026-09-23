/**
 * The Basic Set's modifier for time spent against a base time (Campaigns
 * p. 346), which several books' rules take: +1 for twice as long up to +5
 * for 30 times; -1 per 10% less, to -9 at a tenth.
 */
export function timeSpentModifier(spent: number, base: number): number {
  if (!(base > 0) || !(spent > 0)) return 0;
  const ratio = spent / base;
  if (ratio >= 1) {
    const steps: Array<[number, number]> = [[30, 5], [15, 4], [8, 3], [4, 2], [2, 1]];
    return steps.find(([times]) => ratio >= times)?.[1] ?? 0;
  }
  const less = Math.floor(Math.round((1 - ratio) * 1000) / 100);
  return -Math.min(9, less);
}
