/**
 * High-Tech's black market (pp. 7-9) and the prices of used and old gear
 * (p. 10), as pure functions. The GM tool is in `index.ts`.
 *
 * Finding a black-market seller is a Streetwise roll -- the Contact's, or the
 * buyer's own where there is no Contact -- made by the GM in secret, at minus
 * the local Control Rating, with the Cultural Familiarity penalty, +1 where
 * the place helps (a major port, a border with a low-CR country, weak law
 * enforcement) and -3 in an area the buyer doesn't know. The gray market is
 * the same roll at +3, with milder trouble on a failure. Outlawed (LC0) goods
 * are an adventure, not a roll.
 */

/** Where the place makes the underground easier to reach (p. 8). */
export const FAVOURABLE_AREA_BONUS = 1;
/** An area the buyer doesn't know (p. 8); Contacts seldom have it. */
export const UNFAMILIAR_AREA_PENALTY = -3;
/** Gray-market goods are easier to find (p. 9). */
export const GRAY_MARKET_BONUS = 3;

/** The niches of the black market the book describes, each with its own trouble on a failure (p. 8). */
export const MARKETS = ["general", "electronics", "medical", "combatGear"] as const;
export type Market = (typeof MARKETS)[number];

/** What the roll is made with, and where. */
export interface BlackMarketSearch {
  controlRating: number;
  /** The Cultural Familiarity modifier, 0 or less. */
  culture: number;
  favourableArea: boolean;
  unfamiliarArea: boolean;
  gray: boolean;
}

/** The modifiers the roll takes, keyed for their labels (p. 8). */
export function blackMarketModifiers(search: BlackMarketSearch): Array<{ key: string; value: number }> {
  const lines: Array<{ key: string; value: number }> = [];
  const rating = Math.max(0, Math.min(6, Math.floor(Number(search.controlRating) || 0)));
  if (rating) lines.push({ key: "controlRating", value: -rating });
  const culture = Math.min(0, Math.trunc(Number(search.culture) || 0));
  if (culture) lines.push({ key: "culture", value: culture });
  if (search.favourableArea) lines.push({ key: "favourableArea", value: FAVOURABLE_AREA_BONUS });
  if (search.unfamiliarArea) lines.push({ key: "unfamiliarArea", value: UNFAMILIAR_AREA_PENALTY });
  if (search.gray) lines.push({ key: "gray", value: GRAY_MARKET_BONUS });
  return lines;
}

/**
 * What came of the search. A success finds a seller; a failure brings the
 * niche's trouble, and a critical failure its worse trouble. On the gray
 * market the GM goes lighter on both.
 */
export type Finding = "found" | "failure" | "criticalFailure";

export function findingOf(outcome: { success: boolean; criticalFailure: boolean }): Finding {
  if (outcome.success) return "found";
  return outcome.criticalFailure ? "criticalFailure" : "failure";
}

/** What an item's black-market price is, as a share of the legal price (p. 8). */
export const BLACK_MARKET_SHARE = Object.freeze({
  /** Easily copied media and textiles. */
  copied: 0.05,
  /** Almost everything else. */
  other: 0.6,
});

/**
 * The black-market price of something also sold legally (p. 8): as little as
 * 5% for media and textiles, about 60% for the rest. Something hard to get
 * legally the dealers price as they like, which is the GM's call; this is
 * null for it.
 */
export function blackMarketPrice(listPrice: number, options: { copied: boolean; hardToGetLegally: boolean }): number | null {
  if (options.hardToGetLegally) return null;
  const share = options.copied ? BLACK_MARKET_SHARE.copied : BLACK_MARKET_SHARE.other;
  return Math.round(Math.max(0, Number(listPrice) || 0) * share * 100) / 100;
}

/** What a piece of gear is sold as, second-hand or old stock (p. 10). */
export type Condition = "new" | "used" | "old";

/**
 * The range a price falls in (p. 10): recent gear used sells for 50-80% of
 * new, and old but not yet obsolete gear, new, for 1-10% of what it cost.
 * The GM sets the price within it.
 */
export function conditionPrice(listPrice: number, condition: Condition): { low: number; high: number } {
  const price = Math.max(0, Number(listPrice) || 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  if (condition === "used") return { low: round(price * 0.5), high: round(price * 0.8) };
  if (condition === "old") return { low: round(price * 0.01), high: round(price * 0.1) };
  return { low: price, high: price };
}

/** Whether the goods are outlawed, which the book makes an adventure rather than a roll (p. 9). */
export function isOutlawed(lc: number | null): boolean {
  return lc === 0;
}
