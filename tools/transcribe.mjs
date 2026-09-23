/**
 * Drafts a pack's text from the book's PDF, for a person to check.
 *
 * Transcribing 330 advantages by hand is not work anybody does accurately, so
 * this locates each entry in the book and captures what the book prints under
 * it. What it produces is a draft: every record comes out `transcribed`, and
 * `--review` is the separate pass that promotes what passes inspection.
 *
 * How an entry is found. Each compendium entry already cites its page, because
 * the system's GCA parser put it there, so there is no need to guess where to
 * look. On that page (and its neighbours, since a citation can be a line out)
 * the entry is one of three things:
 *
 *   - a **heading**: its name on a line of its own, followed by the cost line.
 *     The body runs to the next heading.
 *   - a **variant**: `Claws (Talons)`, `Enhanced Move (Air)`. The book gives the
 *     family one heading and each variant a paragraph under it, so the text is
 *     the family's opening plus that paragraph.
 *   - **absent**: `Extra ST` and its kin are the GCA file's way of writing an
 *     attribute purchase, not entries the book names. They get no text, and
 *     saying so is the answer rather than a gap.
 *
 * Other books print their entries in shapes of their own, and Monster Hunters
 * 1 added four: a heading carrying its cost ("Seekersense 29 points"), a power
 * modifier headed "Power Modifier: Psionic", several labelled entries run
 * together on one line ("ESP Talent: ... Psychokinesis Talent: ..."), and a
 * line of gear holding several items, each ending in its price.
 *
 * What differs between books is in their `book.json` under `transcription`:
 * `pdfOffset` (book page + offset = PDF page), `pageLabel` (how a page is
 * recorded, "B" or "MH1:"), and `namePrefix`, a pattern for the part of a
 * data-file name the book does not print ("BIO: " before an ability).
 *
 * The capture is deliberately literal. It does not repeat the cost line, which
 * is a statistic the system already holds, and it does not try to repair the
 * things a PDF extraction gets wrong -- a merged page range, an unbalanced
 * quote -- it flags them, because a repair nobody looked at is worse than a
 * flag somebody reads.
 *
 * Usage:
 *   node tools/transcribe.mjs <book> <pack> --pdf <file> [--offset N] [--pages A-B] [--write]
 *   node tools/transcribe.mjs <book> <pack> --review [--write]
 *
 * `--offset` is book page + offset = PDF page. It defaults to the book's
 * `transcription.pdfOffset`, or 2, which is the Basic Set's Characters volume;
 * Campaigns is -334. `--pages` limits the draft to entries citing those book
 * pages; every other entry keeps the text it has. Nothing is written without
 * `--write`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { ACTOR_TYPES, book, packsOf, projectRoot, readProse, readStatistics } from "./lib/books.mjs";
import { gadgetLines, stripPrice } from "./lib/gadget-text.mjs";

/**
 * The line under a heading that says what kind of thing the entry is.
 *
 * Each chapter writes it differently, and the text begins after however many of
 * them there are:
 *
 *     Bad Temper          Camouflage                     Deathtouch
 *     -10 points*         IQ/Easy                        Melee
 *                         Defaults: IQ-4 or Survival-2.
 *
 * A perk has none at all, being always worth one point; that case is handled
 * where this is used rather than here.
 */
const COST = new RegExp(
  [
    "^variable$",
    // -10 points*, 2 points/level, and the list forms "0, 1, or 2 points" and
    // "10 or more points", which a family heading prints for all its variants.
    "^[-+±]?[\\d/½,\\s]+(or\\s+(?:more\\s+|\\d+\\s+))?points?\\b",
    "^see\\s", //                                       see Melee Weapon, p. 208
    "^(ST|DX|IQ|HT|Will|Per)/(Easy|Average|Hard|Very Hard)\\b", // DX/Hard
    "^defaults?:", //                                   Defaults: IQ-4 or Survival-2.
    "^[-+]\\d+%", //                                    +50%, -10%
    // Monster Hunters 1 prints a prerequisite above the cost -- "Ritual Adept /
    // Prerequisite: Magery. / 40 points" -- and a wildcard skill's attribute
    // alone: "Blade! / DX".
    "^prerequisites?:",
    "^(ST|DX|IQ|HT|Will|Per)$",
    // A spell's class stands where another chapter puts a cost: "Regular",
    // "Information; Area", "Special; Resisted by HT".
    "^(regular|area|missile|melee|blocking|information|special|enchantment)\\b[^.]{0,60}$",
  ].join("|"),
  "i",
);

/**
 * The stat block a spell prints after its description.
 *
 * "Cost: 1 to 3. Prerequisite: Wither Limb." is the spell's statistics, which
 * the system already holds, so the text stops here rather than repeating them.
 */
const STATS = /^(duration|cost|base cost|time to cast|casting time|prerequisites?|item|energy cost)\s*:/i;

/**
 * Where an Ultra-Tech robot's traits begin, which ends its text: a robot
 * template's text is its opening paragraph, not the trait list.
 */
const TEMPLATE_STATS = /^(Attribute Modifiers|Attributes|Secondary Characteristic Modifiers|Advantages):/;

/** The legality class an Ultra-Tech gadget's closing line ends on: "... LC3." */
const GADGET_CLOSE = /\bLC\s*\d\.?$/;

/**
 * What ends an Ultra-Tech gadget's text that has no closing price: the next
 * gadget's inline label ("Assault Laser (TL9): ..."), a weapon table's header
 * or its skill line ("BEAM WEAPONS (RIFLE) (DX-4, ...)"), or a table's caption.
 */
const GADGET_STOP =
  /^(?:TL\s+Weapon\b|[A-Z][A-Z ()'-]+\((?:DX|IQ|HT)[-+]\d|.{0,80}?\(TL[\d^-]+\):|[A-Z][^.:]{2,60}\(TL[\d^-]+\)$)|\bTable$/;

/**
 * How a power's ability is built: "Statistics: Recovery (PM, -10%) [9]".
 *
 * It is the last thing an ability prints, bar a footnote to it, and it is the
 * only place the book says what the ability is made of, so it is kept, and
 * the text stops once it and what belongs to it are done. Stopping at the
 * next heading is not enough: a page's closing epigraph follows the last
 * ability with no heading between them.
 *
 * What belongs to it is a footnote, a "Feature:", or a line still stating
 * costs -- Exoteleport's "Level 1 adds Advantage, Warp (...), +300%, for +30
 * points" -- none of which an epigraph ever carries.
 */
const STATISTICS = /^Statistics:/;
const AFTER_STATISTICS = /^([*†‡]|Feature:)|\[[\d,/\s or]+(?:\/level)?\]|[-+]\d+%/;

/**
 * A section's own heading inside a chapter, which ends whatever came before
 * it: "Psychokinesis Abilities", "Mysticism Skills", "Power Modifier: Psionic".
 * A running head looks the same as a chapter's all-capitals section title, so
 * those are no help; these are the ones that can be told apart.
 */
const SUBHEADING = /^(?:[A-Z][A-Za-z'-]*\s){1,3}(?:Abilities|Skills)$|^Power Modifier:/;

/** A leading bullet or footnote mark, which stands before an inline label. */
const LEADING_MARK = /^[^A-Za-z0-9"'(]+\s*/;

/** A running head or a page number, which ends a page's text. */
const FURNITURE = /^([A-Z][A-Z '&-]{3,}|\d{1,3})$/;

/** What a PDF extraction gets wrong often enough to be worth flagging. */
const SUSPECT = [
  [/\bpp?\.\s*\d{5,}/, "a page range ran together"],
  [/[a-z]{2}[A-Z][a-z]/, "a hyphenated word may have closed up"],
];

function flag(name, fallback = null) {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

function normalise(text) {
  return text
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    // A dash between words, as the Latin-1 reading used to give it.
    .replace(/–/g, "-")
    // The books' symbol font puts its multiplication sign where Latin-1 has the
    // yen sign, as lib/pdf-layout.mjs also finds: "4¥ magnification".
    .replace(/¥/g, "×")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The book, one string per page, cached so the PDF is read once.
 *
 * Read as UTF-8: pdftotext's default is Latin-1 on some builds, and read back
 * as UTF-8 every degree sign and accent became a replacement character.
 */
function pagesOf(pdf) {
  const cache = join(projectRoot, "extracted", "pages-" + pdf.replace(/\W+/g, "-").slice(-60) + "-utf8.json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));

  const result = spawnSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) {
    throw new Error(`pdftotext failed on ${pdf}. Is it installed and is the path right?`);
  }
  const pages = result.stdout.split("\f");
  mkdirSync(join(projectRoot, "extracted"), { recursive: true });
  writeFileSync(cache, JSON.stringify(pages), "utf8");
  return pages;
}

/**
 * The book, one string per page, read from its layout rather than as a stream.
 *
 * High-Tech sets its gear on tinted panels beside sidebars, and pdftotext's
 * stream interleaves the two: "...watch is $100, neg. LC4. Pocketknife (TL5)"
 * with the towel sidebar's lines between a pocketknife's. The layout reader
 * (lib/book-structure.mjs) reads a column at a time and keeps a sidebar
 * apart, so each paragraph and heading arrives as one line, as the stream
 * gives them where it can. A book that says `transcription.layout` is read so.
 *
 * Only the pages asked for are read (it takes a second a page), and each is
 * cached. Every other page is left empty. With `asidesAsText` a box's title
 * and paragraphs come first, as recapture.mjs reads them; a paragraph two
 * boxes both claim is kept once.
 */
async function layoutPagesOf(pdf, bk, wanted) {
  const [{ openBook, readPage }, { structureOf, useLexicon }, { lexiconOf }] = await Promise.all([
    import("./lib/pdf-layout.mjs"),
    import("./lib/book-structure.mjs"),
    import("./lib/lexicon.mjs"),
  ]);
  const dir = join(projectRoot, "extracted", "layout", bk.slug);
  mkdirSync(dir, { recursive: true });
  let opened = null;
  const pages = [];
  for (const index of [...wanted].sort((a, b) => a - b)) {
    const cache = join(dir, `${index + 1}.txt`);
    if (existsSync(cache)) {
      pages[index] = readFileSync(cache, "utf8");
      continue;
    }
    if (!opened) {
      useLexicon(await lexiconOf([pdf]));
      opened = await openBook(pdf);
    }
    if (index + 1 > opened.pages) continue;
    const s = structureOf(await readPage(opened, index + 1));
    const lines = [];
    const seen = new Set();
    const take = (text) => {
      const line = String(text ?? "").replace(/\s+/g, " ").trim();
      if (!line || seen.has(line)) return;
      seen.add(line);
      lines.push(line);
    };
    const boxes = bk.transcription.asidesAsText ? s.asides.filter((aside) => aside.kind !== "table") : [];
    for (const aside of boxes) {
      take(aside.title);
      for (const block of aside.blocks ?? []) if (block.kind !== "table") take(block.text);
    }
    for (const block of s.blocks) if (block.kind !== "table") take(block.text);
    pages[index] = lines.join("\n");
    writeFileSync(cache, pages[index], "utf8");
  }
  return Array.from({ length: Math.max(pages.length, 1) }, (_, i) => pages[i] ?? "");
}

/** The first page an entry cites, from the reference the system wrote. */
function citedPage(entry) {
  // A creature keeps its page in its notes -- "Apes. Basic Set: Campaigns p.
  // 456" -- having no reference field of its own.
  const cite = entry.system?.reference || entry.system?.details?.notes || "";
  // A range -- "pp. 459-460" -- cites its first page.
  const match = /p\.\s*([\d,\s\-–]+)\.?\s*$/.exec(cite);
  return match ? Number(/\d+/.exec(match[1])[0]) : null;
}

/**
 * The line where a creature's statistics begin, which is where its text ends.
 *
 * A bestiary entry is a name, a line or two about the animal, and then its
 * numbers: "ST 11; DX 12; IQ 6; HT 12. Will 10; Per 10...", "Move 7. SM 0;
 * 140 lbs.", "Traits: ...", "Skills: ...". The numbers are on the sheet
 * already, so only what comes before them is the description.
 */
const CREATURE_STATS = /^(ST \d|Move \d|Traits( and Skills)?:|Skills:)/;

/** Plurals an "s" does not make. */
const IRREGULAR_PLURALS = { Ox: "Oxen", Wolf: "Wolves", Mouse: "Mice" };

/**
 * A creature's own words, or its family's when it has none.
 *
 * "Gorilla / A great ape." has a line of its own. "Grizzly Bear" goes straight
 * to its numbers, because what the book says about bears it says once, under
 * "Bears", for all four of them -- so that opening is the grizzly's
 * description, the same way a trait variant takes its family's.
 */
function captureCreature(entry, pages, offset) {
  const cited = citedPage(entry);
  if (cited === null) return null;
  const name = normalise(entry.name);
  const family = normalise(String(entry.system?.details?.notes ?? "").split(".")[0] ?? "");

  for (const delta of [0, 1, -1, 2]) {
    const index = cited + offset - 1 + delta;
    if (index < 0 || index >= pages.length) continue;
    const lines = usefulLines(pages[index]);
    // A creature the book treats as a kind rather than a breed is headed in
    // the plural -- "Camels", "Elephants", "Oxen" -- with no line of its own
    // in the singular.
    const headings = [name, `${name}s`, `${name}es`, IRREGULAR_PLURALS[name]].filter(Boolean);
    const at = lines.findIndex((line) => headings.includes(line) || headings.includes(withoutTechLevel(line)));
    if (at === -1) continue;

    const own = [];
    for (let i = at + 1; i < lines.length; i++) {
      if (CREATURE_STATS.test(lines[i]) || FURNITURE.test(lines[i])) break;
      own.push(lines[i]);
    }
    if (own.length) return { kind: "heading", paragraphs: rejoin(own), page: cited + delta };

    // No line of its own: take what the book says under the family's name.
    for (let back = at - 1; back >= 0; back--) {
      if (lines[back] !== family) continue;
      const opening = [];
      for (let i = back + 1; i < lines.length; i++) {
        if (CREATURE_STATS.test(lines[i]) || FURNITURE.test(lines[i]) || lines[i].length < 40) break;
        opening.push(lines[i]);
      }
      if (opening.length) return { kind: "variant", paragraphs: rejoin(opening), page: cited + delta };
      break;
    }
    return null;
  }
  return null;
}

/**
 * A line's text with the icon digits the book prints after a heading removed.
 *
 * The slash matters: "Shtick 2/3" is a heading, and leaving the slash on turns
 * it into a name nothing recognises, so the entry before it swallows the rest of
 * the page.
 */
function bare(line) {
  return line.replace(/[\s\d/]+$/, "");
}

/**
 * Rejoins a paragraph the columns broke in half.
 *
 * pdftotext gives one line per visual paragraph, but a paragraph continuing
 * across a column break arrives as two. Kept apart they render as two
 * paragraphs mid-sentence. A paragraph of prose ends with punctuation, so one
 * that does not is unfinished and the next line continues it -- including when
 * that line opens with a capital, as "...others get +3 to their" / "Hearing
 * roll." does across a column break.
 */
function rejoin(paragraphs) {
  const out = [];
  for (const paragraph of paragraphs) {
    const previous = out[out.length - 1];
    if (previous && !/[.!?:;"')\]]$/.test(previous)) {
      out[out.length - 1] = `${previous} ${paragraph}`;
    } else {
      out.push(paragraph);
    }
  }
  return out;
}

/**
 * A skill's defaults at the head of its text, left behind when the word
 * "Defaults:" went to another column: "Biology-5, or This is the skill of
 * growing things." The defaults are statistics the system holds.
 */
const LEADING_DEFAULTS = /^(?:[A-Z][A-Za-z()/ ]*?-\d+(?:\s*,)?\s*(?:or\s+)?\.?\s*)+(?=[A-Z])/;

/**
 * A variant's paragraph without the cost it ends on: "Craftiness: Acting, ...
 * Reaction bonus: none! 5 points/level." The cost is the system's.
 */
function withoutTrailingCost(text) {
  return text.replace(/\s+\d+(?:\s+or\s+\d+)?\s+points?(?:\/level)?\.$/, "");
}

/** A cost at the head of a paragraph: "10 or more points", "0, 1, or 2 points". */
const LEADING_COST = /^(?:[\d,\s]+(?:or\s+(?:more\s+)?)?(?:\d+\s+)?points?(?:\/level)?\*?\s+)(?=[A-Z])/;

/**
 * What reading the drafts decided, per pack, by entry name.
 *
 * The review standard for this repository is a person reading every captured
 * entry and judging it coherent and complete -- not collating it word by word
 * against the printed page. Reading finds what no check can: a tail that runs
 * into the next section ("...deal with questions like 'What about leap year?'"
 * ending Absolute Timing with the GM's note on exotic traits), a variant that
 * picked up the wrong family's note, a description that is only the trailing
 * remark and not the entry itself.
 *
 * Those decisions have to survive the tool being run again, or every re-run
 * would quietly promote them back. So they are kept here, in the repository,
 * where a later reader can see what was judged and why.
 */
function readingDecisions(bk, packName) {
  const path = join(bk.dir, "review.json");
  if (!existsSync(path)) return new Map();
  const all = JSON.parse(readFileSync(path, "utf8"));
  return new Map(Object.entries(all[packName] ?? {}));
}

/** A name may carry parentheses and other characters a pattern would read. */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The data file counts in figures where the book spells it: "4 Legs" is "Four Legs". */
const NUMBERS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
function spellNumber(label) {
  const match = /^(\d)(\D.*)$/.exec(label);
  return match ? NUMBERS[Number(match[1])] + match[2] : null;
}

/**
 * The family's own words, before it starts listing its variants.
 *
 * "You have claws. This advantage modifies all your hands and feet" belongs to
 * every kind of claw, so a variant that carried only its own line would lose
 * what the family says about all of them.
 */
function familyOpening(pages, index, family) {
  let lines = usefulLines(pages[index]);
  let at = lines.findIndex((line) => bare(line) === family);
  // The family's heading may sit on the page before the variant's paragraph.
  if (at === -1 && index > 0) {
    lines = usefulLines(pages[index - 1]);
    at = lines.findIndex((line) => bare(line) === family);
  }
  if (at === -1) return [];
  const lead = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (COST.test(line) && lead.length === 0) continue;
    // A variant label may carry a slash -- "Axe/Mace:" -- and missing it let
    // every Thrown Weapon specialty pick up the axe's line as its own.
    if (/^[A-Z][A-Za-z'/ -]{2,40}:/.test(line)) break;
    if (FURNITURE.test(line)) break;
    lead.push(line);
    if (lead.length >= 2) break;
  }
  return lead;
}

/**
 * Every entry name in the book, so a heading can be told from a paragraph.
 *
 * Drawn from all of the book's packs rather than the one being written: an
 * advantage's text ends where the next heading starts, and the next heading may
 * be a perk or a disadvantage on the same page.
 */
function headingNames(bk) {
  const names = new Set();
  for (const pack of packsOf(bk)) {
    for (const { entry } of readStatistics(bk, pack)) {
      for (const printed of printedNames(entry.name, bk)) names.add(printed);
    }
  }
  return names;
}

/**
 * The names an entry may be printed under, the data file's own first.
 *
 * Monster Hunters 1's data file files a power's abilities under a prefix the
 * book does not print -- "BIO: Discriminatory Smell 2" is the second level of
 * "Discriminatory Smell", and "MYS: Heroic Feats (ST)" is "Heroic Feats"
 * bought for ST -- so the book's name is the data file's with the prefix, a
 * trailing level and a specialty taken off, in that order. A book with no
 * such prefix gets its data file's name and nothing else.
 */
function printedNames(name, bk) {
  const own = normalise(name);
  const alias = bk.transcription.aliases?.[own] ?? capturedLabels(bk).get(own);
  if (alias) return [own, normalise(alias)];
  const prefix = bk.transcription.namePrefix;
  if (!prefix || !prefix.test(own)) return [own, ...gadgetNames(own)];
  const bare = own.replace(prefix, "");
  const unlevelled = bare.replace(/\s+\d$/, "");
  const family = unlevelled.replace(/\s*\([^)]*\)$/, "");
  return [...new Set([own, bare, unlevelled, family])];
}

/**
 * The labels captured gear is printed under, by the name its record was given.
 *
 * `tools/capture-gear.mjs` names a record after the label it read, and where
 * reading the page settled on another name -- "Windmills (TL5)" is priced as
 * one windmill, "Alcohol" per gallon -- a `capture.set` rule renames it. The
 * rule's pattern is then the label the book prints, and the text under that
 * label is the record's: it is where the record's statistics came from. Only a
 * pattern that is a plain name counts; the book's own `aliases` win over it.
 */
const labelsByBook = new WeakMap();
function capturedLabels(bk) {
  if (labelsByBook.has(bk)) return labelsByBook.get(bk);
  const labels = new Map();
  for (const rule of bk.capture?.set ?? []) {
    const renamed = rule.set?.name;
    const literal = /^\^((?:[^\\.*+?^$()[\]{}|]|\\[()*.+?"])+)\$$/.exec(String(rule.pattern));
    if (!renamed || !literal) continue;
    // A footnote mark after the label is the book's, not the name's: "Hardtack*".
    const label = literal[1].replace(/\\(.)/g, "$1").replace(/\*$/, "");
    if (label !== renamed) labels.set(normalise(renamed), normalise(label));
  }
  labelsByBook.set(bk, labels);
  return labels;
}

/**
 * The shorter names Ultra-Tech prints a data file's gadget under.
 *
 * The data file tells apart what the book prints once: "Anti-Materiel Rifle,
 * 15mmCL" is headed "Anti-Materiel Rifle", "IML, 64mm (TL10)" is the IML, and a
 * robot's lens, "Android: TL10 Model", is printed "TL10 Model" under the
 * Android. The fullest name comes first, so it wins where the book prints it.
 */
function gadgetNames(name) {
  const out = [];
  let short = name.replace(/\s*\(TL[\d\s^-]+\)$/, "");
  if (short !== name) out.push(short);
  const uncalibred = short.replace(/,\s*[^,]*\d[^,]*$/, "");
  if (uncalibred !== short) out.push((short = uncalibred));
  const lens = /^[^:]+: (.+)$/.exec(short);
  if (lens) out.push(lens[1]);
  return out;
}

/** A heading's tech level, which the data file's name leaves off: "Android (TL9-12)". */
function withoutTechLevel(line) {
  return line.replace(/\s*\(TL[\d\s^/-]+\)$/, "");
}

/**
 * Whether a line is the heading of some entry in the book.
 *
 * Either the name alone, as the Basic Set prints it, or the name with its cost
 * on the same line, as Monster Hunters 1 prints a power's ability:
 * "Seekersense 29 points", "Spirit Channeling see p. 44".
 */
function isHeading(line, names, next = "") {
  if (withoutTechLevel(line).length >= 60) return false;
  // A wildcard skill printed in another book's list -- Detective! and Gun!
  // are the Basic Set's, between Blade! and Inventor! -- is a name this book's
  // packs do not know, but its shape gives it away: a short line with no
  // closing punctuation, and its attribute alone on the next.
  if (/^(ST|DX|IQ|HT|Will|Per)$/.test(next) && line.length < 30 && !/[.,;:]$/.test(line)) return true;
  if (names.has(bare(line)) || names.has(withoutTechLevel(line))) return true;
  for (let at = line.indexOf(" "); at !== -1; at = line.indexOf(" ", at + 1)) {
    if (names.has(line.slice(0, at)) && COST.test(line.slice(at + 1))) return true;
  }
  return false;
}

/** Whether a line heads this entry: its name, its name and cost, or its power modifier. */
function headsEntry(line, candidate) {
  // One power modifier can cover several powers the data file names apart:
  // "Power Modifier: Psionic" is the modifier for "Psionic: ESP" and the rest.
  const modifier = /^Power Modifier: (.+)$/.exec(line);
  if (modifier && (candidate === modifier[1] || candidate.startsWith(`${modifier[1]}: `))) return "labelled";
  if (line.startsWith(`${candidate} `) && line.length - candidate.length < 40 && COST.test(line.slice(candidate.length + 1))) {
    return "costed";
  }
  return bare(line) === candidate || withoutTechLevel(line) === candidate ? "bare" : null;
}

/**
 * A line of gear split into its items.
 *
 * The equipment chapter of Monster Hunters 1 runs several items together on
 * one line -- "Cigarette Lighter. Useful even for non-smokers. $10, neg. Duct
 * Tape. A 15-yard..." -- and each ends in its price and weight, so that is
 * where one item stops and the next begins.
 */
const labelSplitters = new WeakMap();

/**
 * A line split before every entry label it carries.
 *
 * "ESP Talent: Adds to any roll to use an ESP ability. Psychokinesis Talent:
 * Adds..." is four entries on one line, and taken whole the first would carry
 * the other three.
 */
function labelledParts(line, names) {
  if (!labelSplitters.has(names)) {
    const labels = [...names]
      .filter((name) => name.length > 3)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);
    labelSplitters.set(names, labels.length ? new RegExp(`(?<=[.!?):]\\s)(?=(?:${labels.join("|")})(?:\\s*\\([^)]*\\))*:\\s)`) : null);
  }
  const splitter = labelSplitters.get(names);
  return splitter ? line.split(splitter) : [line];
}

function itemsOf(line) {
  // "$10, neg.", "$2, 0.5 lb.", and a running time after the weight: "$250,
  // 0.25 lb., 10 hrs."
  return line.split(/(?<=\$[\d,]+(?:\.\d+)?\s*,\s*(?:neg|[\d.,/]+\s*lbs?)\.(?:,\s*[\d.]+\s*hrs?\.)?)\s+(?=[A-Z])/);
}

/** Where a page's own text stops: a running head, a folio, or the end. */
function usefulLines(page) {
  return page
    .split("\n")
    .map((line) => normalise(line))
    .flatMap(gadgetLines)
    .filter((line) => line.length > 0);
}

/**
 * A weapon the book describes once for its whole family.
 *
 * "X-ray lasers are available in the same models as TL10 high-energy lasers",
 * so the Heavy X-Ray Laser Pistol's text is what the book says of X-ray lasers,
 * then what it says of the heavy laser pistol. The book's `families` rules map
 * one name to the other and name the family's heading.
 */
function captureFamily(entry, pages, offset, names, bk, byName) {
  const cited = citedPage(entry);
  if (cited === null) return null;
  for (const rule of bk.transcription.families ?? []) {
    if (!rule.pattern.test(entry.name)) continue;
    // A rule with no model -- "Heavy Mind Disruptor", which no neural disruptor
    // matches -- takes the family's text alone.
    let own = { paragraphs: [] };
    if (rule.scoped) {
      // Members named only by size -- "Large (TL9): 25-mile range." -- repeat
      // under every family on the page, so the member is looked for under its
      // family's heading and nowhere else.
      const member = entry.name.replace(rule.pattern, rule.replace).replace(/\s+/g, " ").trim();
      const found = scopedMember(pages, cited + offset - 1, rule.heading, member);
      if (!found) continue;
      own = { paragraphs: [found] };
    } else if (!rule.headingOnly) {
      // The model is usually a record of its own; where it is only a name the
      // book prints ("Reflex (TL9):" for the Reflex Vest), it is looked for
      // where the entry itself is cited.
      const modelName = entry.name.replace(rule.pattern, rule.replace).replace(/\s+/g, " ").trim();
      const model = byName.get(modelName) ?? { ...entry, _id: undefined, name: modelName };
      own = capture(model, pages, offset, names, bk);
      if (!own?.paragraphs.length) continue;
      // A rule with no heading is a name the book prints differently, and the
      // model's text is the whole of it.
      if (!rule.heading) return { kind: "family", paragraphs: own.paragraphs, page: own.page };
    }
    for (const delta of [0, -1, 1, -2, 2]) {
      const index = cited + offset - 1 + delta;
      if (index < 0 || index >= pages.length) continue;
      const lines = usefulLines(pages[index]);
      const at = lines.findIndex((line) => withoutTechLevel(line) === rule.heading);
      if (at === -1) continue;
      // The family's opening runs until the next heading, which is short.
      const opening = [];
      for (const line of lines.slice(at + 1)) {
        // A capitalised section title ("SONIC WEAPONS") ends it as surely.
        // So does the heading of the family's first member: "One Bionic Arm (TL9)".
        if (FURNITURE.test(line) || (line.length < 60 && /[^.!?:)"]$/.test(line))) break;
        if (line.length < 70 && withoutTechLevel(line) !== line) break;
        // Or a member run into the text, "Reflex (TL9): ...", whose own text
        // follows -- in High-Tech, "Telephone (TL6). $25, 3 lbs."
        if (/^[^:]{0,80}\(TL[\d\s^/-]+\):/.test(line) || /^[^.:]{0,80}\(TL[\d\s^/-]+\)\.\s/.test(line)) break;
        // Or the skill line over a weapon table.
        if (GADGET_STOP.test(line)) break;
        opening.push(line);
      }
      if (!opening.length) continue;
      return { kind: "family", paragraphs: [...rejoin(opening), ...own.paragraphs], page: cited + delta };
    }
  }
  return null;
}

/** A labelled member of a gadget family, split out of a line holding several. */
const MEMBER_SPLIT = /(?<=[.!?)]\s)(?=[A-Z][^:()]{0,40}\(TL[\d\s^/-]+\):\s)/;

/**
 * The text of one member under its family's heading: from the heading on the
 * cited page (or the one before or after) to the next heading.
 */
function scopedMember(pages, cited, heading, member) {
  for (const index of [cited, cited - 1, cited + 1]) {
    if (index < 0 || index >= pages.length) continue;
    const lines = usefulLines(pages[index]);
    const at = lines.findIndex((line) => withoutTechLevel(line) === heading);
    if (at === -1) continue;
    const after = [...lines.slice(at + 1), ...usefulLines(pages[index + 1] ?? "")];
    const pieces = [];
    for (const line of after) {
      if (FURNITURE.test(line)) continue;
      // The next family's heading ends the search.
      if (line.length < 70 && withoutTechLevel(line) !== line) break;
      pieces.push(...line.split(MEMBER_SPLIT));
    }
    const label = new RegExp(`^${escapeRegExp(member)}\\s*\\(TL[\\d\\s^/-]+\\):\\s*(.*)$`);
    const at2 = pieces.findIndex((piece) => label.test(piece));
    if (at2 === -1) continue;
    let text = label.exec(pieces[at2])[1];
    for (const next of pieces.slice(at2 + 1)) {
      if (/[.!?"')]$/.test(text) || MEMBER_SPLIT.test(` . ${next}`) || /^[A-Z][^:()]{0,40}\(TL/.test(next)) break;
      text = `${text} ${next}`;
    }
    const own = withoutTrailingCost(stripPrice(text)).trim();
    return own.length ? own : null;
  }
  return null;
}

/** Whether an entry is a lens printed under its robot: "Android: TL10 Model". */
function lensScoped(entry) {
  return entry.type === "template" && /^[^:]+: /.test(entry.name);
}

/**
 * The lines a lens is looked for in.
 *
 * Android and Petbot both print a "TL10 Model" on p. 41, so a lens is taken
 * only after its own robot's heading, running on into the next page. A lens of
 * no robot ("Intelligence: Drone") or whose robot began a page earlier is
 * looked for on the page as it is.
 */
function lensScope(entry, pages, index, lines) {
  if (!lensScoped(entry)) return lines;
  const robot = entry.name.split(": ")[0];
  const at = lines.findIndex((line) => withoutTechLevel(line) === robot);
  if (at === -1) return lines;
  // Reading order can put a column of lenses before the heading they follow on
  // the printed page, so what precedes the heading is looked at last.
  return [...lines.slice(at + 1), ...usefulLines(pages[index + 1] ?? ""), ...lines.slice(0, at)];
}

/**
 * A capture carried on past the line it started on.
 *
 * A paragraph broken by a column or a page arrives as two lines, and the first
 * does not end a sentence: "...uses holographic projection to" / "immerse the
 * user in 3D imagery." Lines are added until one does.
 */
function continued(text, lines, at, pages, index, names) {
  let out = text;
  for (const line of [...lines.slice(at + 1), ...usefulLines(pages[index + 1] ?? "")]) {
    if (/[.!?"')]$/.test(out)) break;
    if (FURNITURE.test(line)) continue;
    // The next line may go on to start the next entry: "...ducted fans for" /
    // "quiet flight. Submarine (TL9) (+62 points): This uses water jets".
    const parts = labelledParts(line, names);
    out = `${out} ${parts[0]}`;
    if (parts.length > 1) break;
  }
  return out;
}

/** A sentence that only states a lens's traits or price, which the record holds. */
const LENS_STATISTICS = /\[[-+]?\d+(?:\/copy)?\]|\$\d|\bLC\s*\d|% to (?:dollar )?cost|^(?:Add|Remove|Delete|Upgrade)\b|^[-+]\d+ Complexity/;

/** A lens's text without the sentences that only state its statistics. */
function withoutStatistics(text) {
  // A sentence ends where the next begins with a capital, a sign or a price, so
  // "(p. 109)" and "0.01 lbs." stay inside theirs.
  return text
    .split(/(?<=[.!?]["')]?)\s+(?=["'(]?[A-Z+$-])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !LENS_STATISTICS.test(sentence))
    .join(" ");
}

/**
 * The text under one entry.
 *
 * Returns `{ kind, paragraphs, page }`, or null when the book has no such entry.
 */
function capture(entry, pages, offset, names, bk) {
  const cited = citedPage(entry);
  if (cited === null) return null;
  const candidates = printedNames(entry.name, bk);
  const name = candidates[candidates.length > 1 ? 1 : 0];
  // A lens is never printed under its robot's name, only its own.
  const inlineNames = lensScoped(entry) ? candidates.slice(1) : candidates;

  // Outward from the cited page. Most entries are on it or beside it, but a
  // spell cites the page its college begins on, and a college runs for several
  // pages, so the sweep has to reach further before giving up.
  // Backwards it reaches only a little further, and last: a power's abilities
  // cite their own pages while the power modifier they share was printed at
  // the head of the section, three pages before "Psionic: Teleportation".
  const deltas = [0, 1, -1, 2, 3, -2, ...Array.from({ length: 12 }, (_, n) => n + 4), -3];

  // Where the entry's heading was seen with nothing captured under it: the book
  // does print the entry, so it is not "no entry", whatever else fails.
  let headedOn = null;

  for (const delta of deltas) {
    const index = cited + offset - 1 + delta;
    if (index < 0 || index >= pages.length) continue;
    const lines = usefulLines(pages[index]);

    // A heading, with the cost line under it.
    for (let i = 0; i < lines.length; i++) {
      const heads = candidates.map((c) => headsEntry(lines[i], c)).find(Boolean);
      if (!heads) continue;
      const next = lines[i + 1] ?? "";
      // A perk prints no cost, being always worth one point, so a heading is
      // taken on the name plus either a cost line or the prose that follows it.
      // A heading that carries its own cost needs neither.
      if (heads === "bare" && !COST.test(next) && next.length < 60) continue;

      const body = [];
      // A skill states its difficulty and then its defaults, so more than one
      // signature line can stand between the heading and the text.
      let j = i + 1;
      while (j < lines.length && COST.test(lines[j])) j++;
      let built = false;
      let closed = false;
      for (; j < lines.length; j++) {
        const line = lines[j];
        if (FURNITURE.test(line)) continue;
        // After an ability's statistics, only their footnotes belong to it.
        if (built && !AFTER_STATISTICS.test(line)) break;
        // The next entry begins. A heading is short and names something the
        // book lists; the cost line under it is the usual confirmation, but a
        // perk has none, so a short line bearing a known name is enough.
        if (isHeading(line, names, lines[j + 1]) || SUBHEADING.test(line)) break;
        if (STATS.test(line) || TEMPLATE_STATS.test(line) || GADGET_STOP.test(line)) break;
        // An Ultra-Tech gadget closes on its price and legality class: "$20,000,
        // 5 lbs., B/10 hr. LC3." That line is the record's, and the gadget ends.
        if (GADGET_CLOSE.test(line)) {
          const own = stripPrice(line).replace(GADGET_CLOSE, "").trim();
          if (own) body.push(own);
          closed = true;
          break;
        }
        body.push(line);
        if (STATISTICS.test(line)) built = true;
      }
      // An entry that runs to the foot of the page continues at the top of the
      // next one, before that page's first heading.
      if (j >= lines.length && !built && !closed && index + 1 < pages.length) {
        const following = usefulLines(pages[index + 1]);
        for (const [k, line] of following.entries()) {
          if (FURNITURE.test(line)) continue;
          if (built && !AFTER_STATISTICS.test(line)) break;
          if (isHeading(line, names, following[k + 1]) || SUBHEADING.test(line)) break;
          if (COST.test(line) || STATS.test(line) || TEMPLATE_STATS.test(line) || GADGET_STOP.test(line)) break;
          if (GADGET_CLOSE.test(line)) {
            const own = stripPrice(line).replace(GADGET_CLOSE, "").trim();
            if (own) body.push(own);
            break;
          }
          body.push(line);
          if (STATISTICS.test(line)) built = true;
        }
      }
      if (body.length) return { kind: "heading", paragraphs: rejoin(body), page: cited + delta };
      headedOn ??= cited + delta;
    }

    // An inline entry. The equipment chapter is lists, not headings: a piece of
    // gear is one line carrying its name, its tech level, what it does, and what
    // it costs -- "Horseshoes (TL3). Shod horses get +2 HT on any rolls for
    // stamina on long rides. Per set: $50, 4 lbs." Only the middle is text; the
    // price and the weight are statistics the system already holds.
    // The parenthetical is usually a tech level but not always: "First Aid Kit
    // (var.)" varies by TL, and a name read without it repeats itself in its own
    // description.
    // A footnote mark may follow the name: "Camera, Digital*. Basic equipment..."
    // Ultra-Tech prints more between the name and the colon -- "Mannequin (-2
    // points) (TL9):" -- and names the same lens under several robots, so a lens
    // is looked for only under its own robot's heading.
    const scoped = lensScope(entry, pages, index, lines);
    // A weapon may also print its calibre there: "Wrist Needler, 3mm (TL9):".
    for (const candidate of inlineNames) {
      const inline = new RegExp(
        // High-Tech puts the footnote mark before the tech level: "Hardtack* (TL5)."
        `^${escapeRegExp(candidate)}\\*?((?:\\s*\\([^)]*\\)|,\\s*[^,:()]{1,12}(?=\\s*[(:]))*)\\*?\\s*[.:]\\s*(.*)$`,
        "i",
      );
      for (const [at, whole] of scoped.entries()) {
        for (const line of itemsOf(whole).flatMap((l) => labelledParts(l, names))) {
          const match = inline.exec(line);
          if (!match) continue;
          // Only the last piece of a line can run on to the next.
          const last = whole.endsWith(line);
          const text = withoutTrailingCost(stripPrice(last ? continued(match[2], scoped, at, pages, index, names) : match[2]));
          if (lensScoped(entry)) {
            const own = withoutStatistics(text);
            if (own.length < 15) return { kind: "statistics", paragraphs: [], page: cited + delta };
            return { kind: "inline", paragraphs: [own], page: cited + delta };
          }
          // A gadget labelled with its tech level may say little: "Nausea Pistol
          // (TL9): A handy pistol-sized version.", "Infrared Binoculars (TL9):
          // 16× magnification." The label is proof enough that it is an entry.
          // The label may be in the name itself: High-Tech's "Rope, 1/2" (TL6)."
          const labelled = /\(TL[\d\s^/-]+\)/.test(match[1] + candidate);
          if (text.length < (labelled ? 8 : 15)) continue;
          // A weapon table row reads as an inline entry and is not one: "Pistol
          // Crossbow thr+2 imp 1 ±15/±20 4/0.06 1" is the statistics line, every
          // figure of which the system already holds. Prose is sentences.
          if (/\b(thr|sw)\s*[+-]?\d*\s+(imp|cut|cr|pi\+*|pi-|burn|tox|fat|cor)\b/i.test(text)) continue;
          const words = (text.match(/\b[a-z]{3,}\b/gi) ?? []).length;
          if (words < (labelled ? 1 : 5)) continue;
          return { kind: "inline", paragraphs: [text], page: cited + delta };
        }
      }
    }
    if (lensScoped(entry)) continue;

    // A variant. The book gives the family one heading and each variant a
    // paragraph opening with its own name and a colon -- "Blunt Claws: Very
    // short claws, like those of a dog." -- so the text is the family's opening
    // plus that paragraph. `Claws (Talons)` is the data file's way of naming
    // one; `Burning Attack`, under Innate Attack, carries no parentheses at all.
    const split = /^(.*?)\s*\(([^)]+)\)$/.exec(name);
    const family = split ? normalise(split[1]) : null;
    const labels = [name, split ? normalise(split[2]) : null]
      .filter(Boolean)
      .flatMap((label) => [label, spellNumber(label)])
      .filter(Boolean);

    // A label may stand behind a bullet or a footnote mark, and the data file
    // does not always capitalise it as the book does: "Higher Purpose (Defend
    // the faith)" is printed "Defend the Faith:".
    const unmarked = lines.flatMap((line) => labelledParts(line.replace(LEADING_MARK, ""), names));
    const opens = (line, label) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`);
    for (const label of labels) {
      const at = unmarked.findIndex((line) => opens(line, label));
      if (at === -1) continue;
      const lead = family ? familyOpening(pages, index, family) : [];
      return {
        kind: "variant",
        paragraphs: [...lead, withoutTrailingCost(unmarked[at])],
        page: cited + delta,
      };
    }

    // A perk bought for a specialty is described once, under its own name:
    // "Quick Reload (Magazine)" is what "Quick Reload:" says.
    if (family) {
      const at = unmarked.findIndex((line) => opens(line, family));
      if (at !== -1) return { kind: "variant", paragraphs: [withoutTrailingCost(unmarked[at])], page: cited + delta };
    }

    // A sub-entry with no colon: a paragraph that simply opens with the name.
    for (const candidate of [name, family].filter(Boolean)) {
      for (const line of unmarked) {
        // "Tangler Pistol, 25mm (TL9): ..." opens with "Tangler" and is another
        // gadget's own label, not a paragraph about the tangler.
        if (/^[^:]{0,80}\(TL[\d\s^-]+\):/.test(line)) continue;
        if (line.startsWith(candidate + " ") && line.length > candidate.length + 25 && !COST.test(line)) {
          // High-Tech's layout runs a gadget's heading into its one paragraph --
          // "Optical Disks (TL8) All TL8 computers are assumed..." -- which then
          // closes on its price, and may run on into the next column after it.
          // The tech level may be in the name already: "Cord (TL7) Synthetic."
          const level = /\)$/.test(candidate) ? "?" : "";
          const run = new RegExp(`^${escapeRegExp(candidate)}(?:\\s*\\((?:TL[\\d\\s^/-]+|var\\.)\\))${level}\\s+(?=["A-Z])`).exec(line);
          if (run) {
            const own = stripPrice(line.slice(run[0].length).replace(/(\bLC\s?\d\.).*$/, "$1"));
            if (own) return { kind: "sub-entry", paragraphs: [own], page: cited + delta };
          }
          return { kind: candidate === name ? "sub-entry" : "variant", paragraphs: [line], page: cited + delta };
        }
      }
    }
  }
  return headedOn === null ? null : { kind: "empty", paragraphs: [], page: headedOn };
}

/** Paragraphs to the HTML the item sheet renders. */
function toHtml(paragraphs) {
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return paragraphs
    .map((p) => {
      const modifiers = /^(Modifiers|Special Enhancements|Special Limitations|Notes|Statistics):/.exec(p);
      if (modifiers) {
        return `<p><em>${modifiers[1]}:</em>${escape(p.slice(modifiers[0].length))}</p>`;
      }
      return `<p>${escape(p)}</p>`;
    })
    .join("");
}

/** What is doubtful about a captured body, if anything. */
function doubts(paragraphs, kind) {
  const text = paragraphs.join(" ");
  const found = [];
  for (const [pattern, why] of SUSPECT) if (pattern.test(text)) found.push(why);
  if (text.length < 40) found.push("very short");
  // "Fur Loincloth Fur Tunic Bronze Breastplate Bronze Corselet..." is a table's
  // column of names, and prose is mostly small lowercase words holding capitals
  // apart. When almost nothing is lowercase, it is a list.
  const words = text.match(/[A-Za-z]+/g) ?? [];
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  if (words.length >= 8 && lower / words.length < 0.2) {
    found.push("reads as a list of names from a table, not a description");
  }
  // Reading the drafts turned up three failures no earlier check caught, each
  // of which looks fine until you get to the end of the entry.
  if (!/[.!?"')\]]$/.test(text.trim())) {
    found.push("stops mid-sentence, so the capture was cut short");
  }
  if (/�/.test(text)) {
    found.push("a character did not survive extraction");
  }
  if (/(?:[A-Z][a-z]+[ -]){1,4}[A-Z][a-z]+\s+\d{1,3}\.?$/.test(text.trim())) {
    found.push("ends on what looks like the next heading");
  }
  if (!/^["'(“]?[A-Z0-9]/.test(text.trim())) {
    found.push("starts mid-sentence");
  }
  // "...spy, or thief. [-5*], Duty [-2 to -15]" -- a template's list of traits
  // arriving with the first trait's name missing, which is what a lost line
  // looks like when the rest of the list survives.
  // A quirk's heading is printed inline, so a short entry runs straight into
  // the next: "...group action. Delusions You may take a completely trivial".
  // The seam is a sentence ending, a capitalised name, and then "You".
  if (/[.!?]\s+(?:[A-Z][a-z]+\s){1,4}(?:You|Your)\b/.test(text)) {
    found.push("runs into the next entry, whose heading is printed inline");
  }
  if (/[.:]\s+\[[-+]?\d/.test(text)) {
    found.push("a cost in brackets with no name before it, so a line was lost");
  }
  // A price that survived is a statistic the system also holds, so the two would
  // drift apart the first time one changed.
  if (/\$\d/.test(text)) found.push("a price is still in the text");
  // A page with a sidebar through it reads out of order: a power's statistics
  // arrive in the middle of another entry's sentence ("...limited by the
  // Psionic PM Statistics: Fatigue Attack..."), and a word broken at the end of
  // a sidebar line joins the first word of the column beside it ("the fol- and
  // each use costs you 1 FP"). Within a column a paragraph is one line, so a
  // broken word with a space in it only happens where two columns met.
  if (/[^.!?)\]]\s+Statistics:/.test(text)) {
    found.push("a statistics line interrupts a sentence, so the columns were read out of order");
  }
  if (/[a-z]- [a-z]/.test(text)) {
    found.push("a word broken across lines, where columns meet; check the two halves belong together");
  }
  if (text.length > 6000) found.push("very long, may have run past the entry");
  if (paragraphs.length > 18) found.push("many paragraphs, may have run past the entry");
  // A double quote after a digit is inches -- 12" of talon -- not a quotation.
  if ((text.replace(/(\d)"/g, "$1").match(/"/g) ?? []).length % 2) {
    found.push("an unbalanced quotation mark");
  }
  return found;
}

async function main() {
  const slug = process.argv[2];
  const packName = process.argv[3];
  const write = process.argv.includes("--write");
  const review = process.argv.includes("--review");

  if (!slug || !packName || slug.startsWith("--")) {
    console.error("Usage: node tools/transcribe.mjs <book> <pack> --pdf <file> [--offset N] [--write]");
    process.exit(1);
  }

  const bk = book(slug);
  const target = join(bk.dir, "prose", `${packName}.json`);

  if (review) return runReview(bk, packName, target, write);

  const pdf = flag("--pdf");
  if (!pdf || !existsSync(pdf)) {
    console.error(`--pdf must name the book's PDF. Got: ${pdf}`);
    process.exit(1);
  }
  // The Basic Set's two volumes each have their own offset, so it is given on
  // the command line; a single-volume book may state it once in book.json.
  const offset = Number(flag("--offset", String(bk.transcription.pdfOffset ?? 2)));
  const label = bk.transcription.pageLabel;
  const range = flag("--pages");
  const pageRange = range ? range.split("-").map(Number) : null;
  if (pageRange && (pageRange.length !== 2 || pageRange.some(Number.isNaN))) {
    console.error(`--pages takes a range of book pages, "5-61". Got: ${range}`);
    process.exit(1);
  }

  // The layout reader is slow, so it reads only the pages the entries being
  // drafted cite, and the few either side a capture may look at.
  let pages;
  if (bk.transcription.layout) {
    const wanted = new Set();
    for (const { entry } of readStatistics(bk, packName)) {
      const cited = citedPage(entry);
      if (cited === null || (pageRange && (cited < pageRange[0] || cited > pageRange[1]))) continue;
      for (let delta = -3; delta <= 16; delta++) if (cited + offset - 1 + delta >= 0) wanted.add(cited + offset - 1 + delta);
    }
    pages = await layoutPagesOf(pdf, bk, wanted);
  } else {
    pages = pagesOf(pdf);
  }
  const names = headingNames(bk);
  const existing = readProse(bk, packName).records;
  const readingNotes = readingDecisions(bk, packName);

  const records = [];
  const tally = { heading: 0, inline: 0, "sub-entry": 0, variant: 0, family: 0, statistics: 0, empty: 0, absent: 0, kept: 0 };
  const byName = new Map();
  for (const pack of packsOf(bk)) {
    for (const { entry } of readStatistics(bk, pack)) byName.set(entry.name, entry);
  }

  for (const { entry } of readStatistics(bk, packName)) {
    const already = existing.get(entry._id);
    // A book done a few chapters at a time: an entry cited outside the pages
    // being worked on keeps whatever text it has, and gets none if it has none.
    const cited = citedPage(entry);
    if (pageRange && (cited === null || cited < pageRange[0] || cited > pageRange[1])) {
      if (already) {
        records.push(already);
        tally.kept++;
      }
      continue;
    }
    if (already && already.status === "reviewed") {
      records.push(already);
      tally.kept++;
      continue;
    }

    const found = ACTOR_TYPES.has(entry.type)
      ? captureCreature(entry, pages, offset)
      : // A family rule names a record the book prints under its family, so it
        // goes first: a cybernetic's own heading holds only its statistics.
        (captureFamily(entry, pages, offset, names, bk, byName) ?? capture(entry, pages, offset, names, bk));
    if (found?.kind === "statistics") {
      tally.statistics++;
      records.push({
        _id: entry._id,
        name: entry.name,
        pages: `${label}${found.page}`,
        status: "no-entry",
        notes: "the book prints only this lens's statistics, which the record holds",
        description: "",
      });
      continue;
    }
    if (!found) {
      tally.absent++;
      // For a trait or an item, not finding a name means the book never uses
      // it: "Extra ST" is the data file's. A creature is different -- every one
      // in the pack came out of the bestiary -- so not finding it means the
      // tool failed, and the book is still to be read.
      // A book that files abilities under a prefix it does not print describes
      // every one of them, so not finding one is the tool's failure, as it is
      // for a creature.
      const creature = ACTOR_TYPES.has(entry.type) || Boolean(bk.transcription.namePrefix?.test(entry.name));
      records.push({
        _id: entry._id,
        name: entry.name,
        pages: citedPage(entry) ? `${label}${citedPage(entry)}` : "",
        status: creature ? "needs-review" : "no-entry",
        notes: creature
          ? "not located, or located without a description of its own; the book does describe it"
          : "the book prints no entry of this name; the data file's own name for something it describes elsewhere, or a row of a table",
        description: "",
      });
      continue;
    }

    tally[found.kind]++;
    if (found.kind === "empty") {
      records.push({
        _id: entry._id,
        name: entry.name,
        pages: `${label}${found.page}`,
        status: "needs-review",
        notes: "its heading is on the page, but nothing was captured under it before the next section began",
        description: "",
      });
      continue;
    }
    // A family's shared cost can sit at the head of its text -- "0, 1, or 2
    // points Anyone with a mouth has blunt teeth" -- and it is a statistic the
    // system holds, stripped here for the same reason a price is.
    const paragraphs = [...found.paragraphs];
    paragraphs[0] = paragraphs[0].replace(LEADING_COST, "").replace(LEADING_DEFAULTS, "");
    // When the defaults were a paragraph of their own, what is left is just the
    // last of them -- "Merchant-6." -- which is no more text than the rest was.
    if (/^([A-Z][A-Za-z()/ ]*?-\d+\.?)?$/.test(paragraphs[0].trim())) paragraphs.shift();
    // "A great ape." is the whole of the gorilla's entry, so shortness is no
    // sign of a cut capture for a creature the way it is for a trait.
    const why = doubts(paragraphs, found.kind).filter(
      (reason) => !(ACTOR_TYPES.has(entry.type) && reason === "very short"),
    );
    const read = readingNotes.get(entry.name);
    if (read) why.push(`read and found wanting: ${read}`);
    records.push({
      _id: entry._id,
      name: entry.name,
      pages: `${label}${found.page}`,
      status: why.length ? "needs-review" : "transcribed",
      notes: why.join("; "),
      description: toHtml(paragraphs),
    });
  }

  // Variants that came back with identical text got the family's trailing note
  // rather than their own description: "Cyclic (1 hour interval)" and four
  // siblings all read "Cyclic attacks are often Resistible...", which is true of
  // every one and describes none. Unrelated items may legitimately match -- a
  // bottle and a canteen both hold a quart -- so only a shared family counts.
  const family = (name) => name.replace(/\s*\(.*$/, "").trim();
  const byText = new Map();
  for (const record of records) {
    if (!record.description || record.status === "no-entry") continue;
    const group = byText.get(record.description) ?? [];
    group.push(record);
    byText.set(record.description, group);
  }
  for (const group of byText.values()) {
    if (group.length < 2) continue;
    const families = new Set(group.map((r) => family(r.name)));
    if (families.size !== 1) continue;
    // "Blaster Cannon (TL10)" and "(TL11)" are one weapon the book prints once.
    if (group.every((record) => /\(TL ?\d+\)$/.test(record.name))) continue;
    for (const record of group) {
      if (record.status === "reviewed") continue;
      const why = "shares its text with its sibling variants, so it is the family's note, not its own";
      record.status = "needs-review";
      record.notes = record.notes ? `${record.notes}; ${why}` : why;
    }
  }

  console.log(`${bk.title} / ${packName}: ${records.length} entries`);
  for (const [kind, n] of Object.entries(tally)) if (n) console.log(`  ${kind.padEnd(10)} ${n}`);
  const flagged = records.filter((r) => r.status === "needs-review").length;
  console.log(`  ${"flagged".padEnd(10)} ${flagged} need a person`);

  if (!write) {
    console.log("\nNothing written. Add --write.");
    return;
  }
  mkdirSync(join(bk.dir, "prose"), { recursive: true });
  writeFileSync(target, JSON.stringify(records, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${target}`);
}

/**
 * Promotes clean drafts to `reviewed`.
 *
 * Everything a machine can check about a piece of transcribed text has been
 * checked by the time a record reaches `transcribed` with no note: it was found
 * where the entry says it is, it stops where the next entry starts, and it
 * carries none of the marks a bad extraction leaves. This is the step that says
 * so, and it deliberately refuses to touch anything already flagged.
 */
function runReview(bk, packName, target, write) {
  const { records } = readProse(bk, packName);
  let promoted = 0;
  const out = [];
  for (const record of records.values()) {
    if (record.status === "transcribed" && !record.notes) {
      out.push({ ...record, status: "reviewed" });
      promoted++;
    } else {
      out.push(record);
    }
  }
  const remaining = out.filter((r) => r.status === "needs-review").length;
  console.log(`${packName}: promoted ${promoted} to reviewed; ${remaining} still need a person.`);
  if (write) {
    writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log(`Wrote ${target}`);
  } else {
    console.log("Nothing written. Add --write.");
  }
}

await main();
