/**
 * GURPS Basic Set, Fourth Edition Revised (2025), read as one PDF.
 *
 * The Revised edition merges the two volumes the 2004 Basic Set was printed
 * in (Characters and Campaigns) into a single file, keeps every heading on
 * the page it had before, and re-flows every page from three columns to two
 * with new type. The reading tools know the 2004 layout by heart; this module
 * is what differs, kept in one place so the tools' other books read as they
 * always did.
 *
 *   pages     printed page p is PDF page p + 10; the front matter is i-viii
 *             and the preface fills pages 1-4
 *   columns   two, 238 points wide on a 257-point pitch, starting 72 points in
 *             on an odd page and 36 on an even one; a paragraph opens with a
 *             12-point indent
 *   type      headings are set in NewAster: the chapter and section titles in
 *             the Black small-capitals face, an entry's name in semibold
 *             italic, its cost in semibold; icon letters (P, M, X, Su...) are
 *             set in Impact
 *   text      `pdftotext -raw -enc UTF-8` keeps the two columns apart and the
 *             minus signs; its default layout interleaves the columns, and its
 *             Latin-1 output drops every minus sign
 *
 * A heading profile was learned from known pages (p. 154 "Shyness", p. 378
 * "Damage Roll", the chapter openers and the addenda's first pages), and
 * `revised.test.mjs` pins each rule to the pages it came from.
 */

/** Printed page p is PDF page p + 10. */
export const PDF_OFFSET = 10;

/** The last printed page of the book, before the index. */
export const LAST_PAGE = 584;

/** The PDF page a printed page is on. */
export const pdfPageOf = (page) => page + PDF_OFFSET;

/** The printed page a PDF page carries. */
export const printedPageOf = (pdfPage) => pdfPage - PDF_OFFSET;

/**
 * The four addenda, which the Revised edition adds between and after the
 * retained pages. Each is a run of printed pages that can be captured as a
 * section: its headings and paragraphs, without an entry in a pack to look for.
 */
export const ADDENDA = [
  { id: "addendum-1", title: "Addendum 1: Traits and Techniques", first: 324, last: 334 },
  { id: "addendum-2", title: "Addendum 2: Organizations and Gear", first: 337, last: 342 },
  { id: "addendum-3", title: "Addendum 3: Hit Locations", first: 566, last: 566 },
  { id: "addendum-4", title: "Addendum 4: Tasks and Combat", first: 570, last: 578 },
];

/** The addendum a printed page is in, if it is in one. */
export function addendumOf(page) {
  return ADDENDA.find((a) => page >= a.first && page <= a.last) ?? null;
}

/** The book as the one volume the reading tools address by printed page. */
export const VOLUME = { first: 1, last: LAST_PAGE, pdfPage: pdfPageOf };

/** The column grid every retained and added page shares. */
export const GRID = { columns: 2, width: 238, pitch: 257, odd: 72, even: 36 };

/** Where a page's text block starts: the Revised edition sets its first line at 36 and its running head at the foot. */
export const TOP = 25;

/** Fonts that are icons, never text: the trait-type letters after a name ("Absolute Direction M P"). */
export const ICON_FONT = /^Impact/;

/** Small capitals: the Black face, whose lower-case letters are the small capitals. */
const SMALL_CAPS = /Black-SC/;

/**
 * The kind of a line of the Revised edition, by how it is set.
 *
 *   chapter   Black small capitals, 55 points and up, or "Chapter Three"
 *   level 1   Black small capitals, 30-54 points ("Modifiers")
 *   level 2   Black small capitals, 18-29 points ("Damage Roll", "Perks")
 *   level 3   14-point semibold italic ("Shyness", "Half Damage (1/2D)")
 *   level 4   11-point semibold ("-5 points/level", "Control Rolls"), and the
 *             11-point semibold or bold italic a perk or sub-entry is set in
 *
 * A running head or a page number is the same face at 16 points, and is
 * furniture, so it is left to the text rule.
 */
export function kindOf(line) {
  const { size, text, font = "" } = line;
  // The heading a box opens with (see `boxesOf` in pdf-layout.mjs) is its title.
  if (line.boxTitle) return "sidebar-title";
  if (SMALL_CAPS.test(font) || (line.black && /^chapter\b/i.test(text))) {
    if (size >= 55 || /^chapter\b/i.test(text)) return "chapter";
    if (size >= 30) return "h1";
    if (size >= 18) return "h2";
    return "text";
  }
  // A cross-reference to another book ("GURPS Power-Ups 4: Enhancements.") is
  // bold italic at 13 to 20 points, and is set in a box; it is not a heading.
  if (size >= 12.5 && size < 15.5 && /SemiBoldIt/.test(font) && text.length < 70) return "h3";
  if (size >= 10.8 && size < 12.5 && /Semi|BoldIt/.test(font) && text.length < 60) return "h4";
  if (size >= 12.5 && /It$/.test(font) && !/Bold|Semi/.test(font)) return "quote";
  if (size >= 12.5) return "text";
  // Tables are set at 8.5 points and under; the 9-point notes and the 9.3-point
  // spell text are running text.
  if (size < 9) return "table";
  return "text";
}

/** A small-capitals heading as it reads: "damage resistanCe" is "Damage Resistance". */
export function headingText(text) {
  const small = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(/(\s+|-)/)
    .map((word, i) => (i > 0 && small.has(word) ? word : word.replace(/[a-z]/, (c) => c.toUpperCase())))
    .join("")
    .replace(/\b(Tl|Hp|Fp|Dr|Iq|Dx|Ht|St|Gm|Pc|Npc)s?\b/g, (m) => m.toUpperCase());
}

/** The Revised edition's typography in the plain form the prose files use. */
export function plainRevised(text) {
  return String(text)
    // The book's non-breaking hyphen is its minus sign: "‑10 points".
    .replace(/[‐‑−]/g, "-")
    .replace(/[­​]/g, "");
}

/** Everything the reading tools need to know of the edition, in one object. */
export const REVISED = {
  id: "revised",
  volume: "revised",
  grid: GRID,
  top: TOP,
  iconFont: ICON_FONT,
  kindOf,
  headingText,
};

/**
 * The chapter names the Revised edition prints in its running head, at the
 * foot of every page, beside the folio: "154 Disadvantages" on a left-hand
 * page and "Disadvantages 155" on a right-hand one.
 */
const RUNNING_HEADS = [
  "Preface", "Introduction", "Creating a Character", "Advantages", "Disadvantages", "Skills", "Templates",
  "Creating Templates", "Character Development", "Equipment", "Technology and Artifacts", "Magic",
  "Psionics", "Success Rolls", "Combat", "Tactical Combat", "Special Combat Situations",
  "Injuries, Illness, and Fatigue", "Animals and Monsters", "Game Mastering", "Game Worlds",
  "Infinite Worlds", "Iconic Characters", "Trait Lists", "Tables", "Glossary", "Index",
  "Character Sheet", "GM Control Sheet", String.raw`Addendum \d`,
];

const HEADS = RUNNING_HEADS.join("|");
const RUNNING_HEAD = new RegExp(String.raw`^(?:\d{1,3}\s+(?:${HEADS})|(?:${HEADS})\s+\d{1,3})$`);

/** Whether a line of `pdftotext -raw` output is the running head and folio. */
export function isRunningHead(line) {
  return RUNNING_HEAD.test(String(line).replace(/\s+/g, " ").trim());
}

/**
 * A line with the trait-type icons after a heading removed: the Revised edition
 * sets them as letters (P physical, M mental, S/So social, X exotic, Su
 * supernatural), so "Absolute Direction M P" is "Absolute Direction". Only a
 * short line of words with no sentence punctuation counts, so a sentence ending
 * on "vitamin A" keeps it.
 */
export function stripIcons(line) {
  const text = String(line).replace(/\s+/g, " ").trim();
  if (text.length > 70 || /[.!?:;,]/.test(text)) return text;
  return text.replace(/(?<=[a-z0-9)])(?:\s+(?:Su|So|P|M|X|A|S)){1,4}$/, "");
}
