/**
 * Which book's rule sets a gun's quality, where two could.
 *
 * The Basic Set grades a gun fine or very fine for more Acc (Campaigns
 * p. 407 as the system has it). Monster Hunters' weapon improvements read
 * that grade for the same Acc; High-Tech's firearm quality puts two separate
 * improvements, accuracy and reliability work, in its place (High-Tech p. 79).
 * With both books' switches on, each would take the grade's Acc back out and
 * put its own in, and a gun would get both.
 *
 * A book whose rule replaces the grade on a gun claims it here while its
 * switch is on; a book whose rule only reads the grade asks first and leaves
 * a claimed gun's Acc alone. Neither imports the other, and either works
 * without the other.
 */

interface Claim {
  book: string;
  claims: (item: any) => boolean;
}

const CLAIMS: Claim[] = [];

/** A book's claim on guns' quality; a second registration for the same book replaces the first. */
export function registerFirearmGradeClaim(book: string, claims: (item: any) => boolean): void {
  const at = CLAIMS.findIndex((c) => c.book === book);
  if (at >= 0) CLAIMS[at] = { book, claims };
  else CLAIMS.push({ book, claims });
}

/** The book whose rule sets this gun's quality, other than `asking`, or null where none claims it. */
export function firearmGradeClaimedBy(item: any, asking = ""): string | null {
  for (const claim of CLAIMS) {
    if (claim.book === asking) continue;
    try {
      if (claim.claims(item)) return claim.book;
    } catch {
      // A claim that can't read the item doesn't claim it.
    }
  }
  return null;
}

/** For tests: forgets every claim. */
export function clearFirearmGradeClaims(): void {
  CLAIMS.length = 0;
}
