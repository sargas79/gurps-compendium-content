/**
 * Clothes that hide things, the rule two books print: Monster Hunters 1's
 * long coat and Undercover improvement (p. 59), and High-Tech's long coat,
 * ponchos and undercover clothing (p. 64). An article gives a Holdout bonus of
 * its own (a long coat's +4), and clothing cut to hide things adds +1 or +2
 * (quality). Each book says, from its own data, what an article gives; the
 * character's best worn article is what counts.
 */

/** Undercover clothing's Holdout bonus, from none to +2. */
export function undercoverLevel(level: number | undefined): 0 | 1 | 2 {
  const n = Math.floor(Number(level) || 0);
  return n >= 2 ? 2 : n === 1 ? 1 : 0;
}

/** An article's Holdout bonus: its own, with undercover clothing's added. */
export function holdoutBonus(options: { own: number; undercover?: number }): number {
  return Math.max(0, Math.floor(Number(options.own) || 0)) + undercoverLevel(options.undercover);
}

/** What one book says an article gives toward Holdout, or null where it gives nothing. */
export type ArticleBonus = (item: any) => { own: number; undercover?: number } | null;

/** Whether an article is on the character: armour worn, other gear carried. */
export function wornArticle(item: any): boolean {
  if (item?.type === "armor") return Boolean(item.system?.equipped);
  if (item?.type === "equipment") return item.system?.carried !== false;
  return false;
}

/** The best Holdout bonus the character's articles give, by one book's reading, and the article giving it. */
export function bestConcealment(items: Iterable<any>, bonusOf: ArticleBonus, worn: (item: any) => boolean = wornArticle): { holdout: number; source: string; item: any } {
  const out = { holdout: 0, source: "", item: null as any };
  for (const item of items) {
    if (!worn(item)) continue;
    const given = bonusOf(item);
    if (!given) continue;
    const bonus = holdoutBonus(given);
    if (bonus > out.holdout) Object.assign(out, { holdout: bonus, source: String(item.name ?? ""), item });
  }
  return out;
}

/** Whether a success roll is a Holdout roll: the skill, or a default rolled in its place (API 1.152.0). */
export function isHoldoutRoll(context: { skill?: unknown } | null | undefined): boolean {
  return String(context?.skill ?? "").trim().toLowerCase() === "holdout";
}

/**
 * Puts the best worn article's Holdout bonus on a Holdout roll as what the
 * character wears: the line keyed `clothing` (Characters p. 200; the system's
 * `roll.holdout` keys the caller's clothing so since API 1.152.0). A clothing
 * line already there -- the caller's, or another book's article -- is the
 * same thing, so the better of the two stands, never both.
 */
export function wearClothingLine(modifiers: Array<{ label: string; value: number; key?: string }>, bonus: number, label: string): void {
  if (!Array.isArray(modifiers) || !(bonus > 0)) return;
  const kept = modifiers.find((line) => line?.key === "clothing");
  if (!kept) {
    modifiers.push({ key: "clothing", label, value: bonus });
    return;
  }
  if (bonus > (Number(kept.value) || 0)) Object.assign(kept, { label, value: bonus });
}
