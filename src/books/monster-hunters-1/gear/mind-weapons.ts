/**
 * The mind disruptor and the neutralizer (Monster Hunters 1 p. 58), as pure
 * rules.
 *
 * Both are Will-based afflictions, and the book gives the victim's roll one
 * bonus: "a bonus equal to any Mind Shield". Armour does nothing against
 * them, so the system's DR line on the resistance roll (Characters p. 35)
 * goes, and the victim's Mind Shield levels come in its place -- his own, and
 * a worn mental shield's Mind Shield 4, "cumulative with any natural Mind
 * Shield" (p. 58).
 */

/** The book's two Will-based afflictions (p. 58), by their records' names. */
export const MIND_WEAPON = /^(?:mind disruptor|neutralizer)$/i;

/** The mental shield's Mind Shield (p. 58), by its record's name. */
export const MENTAL_SHIELD = Object.freeze({ pattern: /^mental shield\b/i, level: 4 });

/** Whether an item is one of the book's own mind weapons: its record, cited to the book. */
export function isMindWeapon(item: any): boolean {
  return MIND_WEAPON.test(String(item?.name ?? "").trim()) && /^monster hunters 1\b/i.test(String(item?.system?.reference ?? ""));
}

/**
 * A character's Mind Shield (p. 58): the levels of every Mind Shield trait
 * (named as a power's ability, "TEL: Mind Shield", too), and 4 for a mental
 * shield worn.
 */
export function mindShieldLevels(items: Iterable<any>): number {
  let total = 0;
  for (const item of items ?? []) {
    const name = String(item?.name ?? "").trim();
    if (item?.type === "trait" && /(?:^|:\s*)mind shield\b/i.test(name)) {
      const printed = Number(/mind shield\D*(\d+)/i.exec(name)?.[1]);
      total += Math.max(1, Math.floor(Number(item.system?.levels) || printed || 1));
    } else if (item?.type === "equipment" && item.system?.equipped === true && MENTAL_SHIELD.pattern.test(name)) {
      total += MENTAL_SHIELD.level;
    }
  }
  return total;
}
