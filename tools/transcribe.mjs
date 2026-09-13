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
 * The capture is deliberately literal. It does not repeat the cost line, which
 * is a statistic the system already holds, and it does not try to repair the
 * things a PDF extraction gets wrong -- a merged page range, an unbalanced
 * quote -- it flags them, because a repair nobody looked at is worse than a
 * flag somebody reads.
 *
 * Usage:
 *   node tools/transcribe.mjs <book> <pack> --pdf <file> [--offset 2] [--write]
 *   node tools/transcribe.mjs <book> <pack> --review [--write]
 *
 * `--offset` is book page + offset = PDF page; the Basic Set's is 2. Nothing is
 * written without `--write`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { book, packsOf, projectRoot, readProse, readStatistics, statisticsDir } from "./lib/books.mjs";

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
    .replace(/\s+/g, " ")
    .trim();
}

/** The book, one string per page, cached so the PDF is read once. */
function pagesOf(pdf) {
  const cache = join(projectRoot, "extracted", "pages-" + pdf.replace(/\W+/g, "-").slice(-60) + ".json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));

  const result = spawnSync("pdftotext", [pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) {
    throw new Error(`pdftotext failed on ${pdf}. Is it installed and is the path right?`);
  }
  const pages = result.stdout.split("\f");
  mkdirSync(join(projectRoot, "extracted"), { recursive: true });
  writeFileSync(cache, JSON.stringify(pages), "utf8");
  return pages;
}

/** The first page an entry cites, from the reference the system wrote. */
function citedPage(entry) {
  const match = /p\.\s*([\d,\s]+)$/.exec(entry.system?.reference ?? "");
  return match ? Number(/\d+/.exec(match[1])[0]) : null;
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

/**
 * Drops the price and weight an inline entry ends with.
 *
 * "$50, 4 lbs." and "Per set: $50, 4 lbs." are the item's cost and weight, both
 * of which the system carries as numbers. Repeating them in the text would put
 * a second copy on the sheet, and one that never changes when the other does.
 */
function stripPrice(text) {
  return text
    // "$50, 2 lbs.", "$40, 12 hrs.", "Per set: $50, 4 lbs.", "$200."
    .replace(/\s*(Per\s+[\w\s]+:\s*)?\$[\d,]+(\.\d+)?(\s*,\s*[^.;]{1,24})?\.?\s*$/i, "")
    .replace(/\s*,?\s*[\d./]+\s*lbs?\.?\s*$/i, "")
    .trim();
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
    for (const { entry } of readStatistics(bk, pack)) names.add(normalise(entry.name));
  }
  return names;
}

/** Where a page's own text stops: a running head, a folio, or the end. */
function usefulLines(page) {
  return page
    .split("\n")
    .map((line) => normalise(line))
    .filter((line) => line.length > 0);
}

/**
 * The text under one entry.
 *
 * Returns `{ kind, paragraphs, page }`, or null when the book has no such entry.
 */
function capture(entry, pages, offset, names) {
  const cited = citedPage(entry);
  if (cited === null) return null;
  const name = normalise(entry.name);

  // Outward from the cited page. Most entries are on it or beside it, but a
  // spell cites the page its college begins on, and a college runs for several
  // pages, so the sweep has to reach further before giving up.
  const deltas = [0, 1, -1, 2, 3, -2, ...Array.from({ length: 12 }, (_, n) => n + 4)];

  for (const delta of deltas) {
    const index = cited + offset - 1 + delta;
    if (index < 0 || index >= pages.length) continue;
    const lines = usefulLines(pages[index]);

    // A heading, with the cost line under it.
    for (let i = 0; i < lines.length; i++) {
      if (bare(lines[i]) !== name) continue;
      const next = lines[i + 1] ?? "";
      // A perk prints no cost, being always worth one point, so a heading is
      // taken on the name plus either a cost line or the prose that follows it.
      if (!COST.test(next) && next.length < 60) continue;

      const body = [];
      // A skill states its difficulty and then its defaults, so more than one
      // signature line can stand between the heading and the text.
      let j = i + 1;
      while (j < lines.length && COST.test(lines[j])) j++;
      for (; j < lines.length; j++) {
        const line = lines[j];
        if (FURNITURE.test(line)) continue;
        // The next entry begins. A heading is short and names something the
        // book lists; the cost line under it is the usual confirmation, but a
        // perk has none, so a short line bearing a known name is enough.
        if (names.has(bare(line)) && line.length < 60) break;
        if (STATS.test(line)) break;
        body.push(line);
      }
      // An entry that runs to the foot of the page continues at the top of the
      // next one, before that page's first heading.
      if (j >= lines.length && index + 1 < pages.length) {
        for (const line of usefulLines(pages[index + 1])) {
          if (FURNITURE.test(line)) continue;
          if (names.has(bare(line))) break;
          if (COST.test(line) || STATS.test(line)) break;
          body.push(line);
        }
      }
      if (body.length) return { kind: "heading", paragraphs: rejoin(body), page: cited + delta };
    }

    // An inline entry. The equipment chapter is lists, not headings: a piece of
    // gear is one line carrying its name, its tech level, what it does, and what
    // it costs -- "Horseshoes (TL3). Shod horses get +2 HT on any rolls for
    // stamina on long rides. Per set: $50, 4 lbs." Only the middle is text; the
    // price and the weight are statistics the system already holds.
    // The parenthetical is usually a tech level but not always: "First Aid Kit
    // (var.)" varies by TL, and a name read without it repeats itself in its own
    // description.
    const inline = new RegExp(`^${escapeRegExp(name)}\\s*(\\([^)]*\\))?\\s*[.:]\\s*(.+)$`, "i");
    for (const line of lines) {
      const match = inline.exec(line);
      if (!match) continue;
      const text = stripPrice(match[2]);
      if (text.length < 15) continue;
      // A weapon table row reads as an inline entry and is not one: "Pistol
      // Crossbow thr+2 imp 1 ±15/±20 4/0.06 1" is the statistics line, every
      // figure of which the system already holds. Prose is sentences.
      if (/\b(thr|sw)\s*[+-]?\d*\s+(imp|cut|cr|pi\+*|pi-|burn|tox|fat|cor)\b/i.test(text)) continue;
      if ((text.match(/\b[a-z]{3,}\b/gi) ?? []).length < 5) continue;
      return { kind: "inline", paragraphs: [text], page: cited + delta };
    }

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

    for (const label of labels) {
      const at = lines.findIndex((line) => line.startsWith(label + ":"));
      if (at === -1) continue;
      const lead = family ? familyOpening(pages, index, family) : [];
      return {
        kind: "variant",
        paragraphs: [...lead, lines[at]],
        page: cited + delta,
      };
    }

    // A sub-entry with no colon: a paragraph that simply opens with the name.
    for (const candidate of [name, family].filter(Boolean)) {
      for (const line of lines) {
        if (line.startsWith(candidate + " ") && line.length > candidate.length + 25 && !COST.test(line)) {
          return { kind: candidate === name ? "sub-entry" : "variant", paragraphs: [line], page: cited + delta };
        }
      }
    }
  }
  return null;
}

/** Paragraphs to the HTML the item sheet renders. */
function toHtml(paragraphs) {
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return paragraphs
    .map((p) => {
      const modifiers = /^(Modifiers|Special Enhancements|Special Limitations|Notes):/.exec(p);
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
  if (/[.!?]\s+(?:[A-Z][a-z]+\s){1,4}(?:You|Your)/.test(text)) {
    found.push("runs into the next entry, whose heading is printed inline");
  }
  if (/[.:]\s+\[[-+]?\d/.test(text)) {
    found.push("a cost in brackets with no name before it, so a line was lost");
  }
  // A price that survived is a statistic the system also holds, so the two would
  // drift apart the first time one changed.
  if (/\$\d/.test(text)) found.push("a price is still in the text");
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
    console.error("Usage: node tools/transcribe.mjs <book> <pack> --pdf <file> [--offset 2] [--write]");
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
  const offset = Number(flag("--offset", "2"));

  const pages = pagesOf(pdf);
  const names = headingNames(bk);
  const existing = readProse(bk, packName).records;
  const readingNotes = readingDecisions(bk, packName);

  const records = [];
  const tally = { heading: 0, inline: 0, "sub-entry": 0, variant: 0, absent: 0, kept: 0 };

  for (const { entry } of readStatistics(bk, packName)) {
    const already = existing.get(entry._id);
    if (already && already.status === "reviewed") {
      records.push(already);
      tally.kept++;
      continue;
    }

    const found = capture(entry, pages, offset, names);
    if (!found) {
      tally.absent++;
      records.push({
        _id: entry._id,
        name: entry.name,
        pages: citedPage(entry) ? `B${citedPage(entry)}` : "",
        status: "no-entry",
        notes: "the book prints no entry of this name; the data file's own name for something it describes elsewhere, or a row of a table",
        description: "",
      });
      continue;
    }

    tally[found.kind]++;
    // A family's shared cost can sit at the head of its text -- "0, 1, or 2
    // points Anyone with a mouth has blunt teeth" -- and it is a statistic the
    // system holds, stripped here for the same reason a price is.
    const paragraphs = [...found.paragraphs];
    paragraphs[0] = paragraphs[0].replace(LEADING_COST, "").replace(LEADING_DEFAULTS, "");
    // When the defaults were a paragraph of their own, what is left is just the
    // last of them -- "Merchant-6." -- which is no more text than the rest was.
    if (/^([A-Z][A-Za-z()/ ]*?-\d+\.?)?$/.test(paragraphs[0].trim())) paragraphs.shift();
    const why = doubts(paragraphs, found.kind);
    const read = readingNotes.get(entry.name);
    if (read) why.push(`read and found wanting: ${read}`);
    records.push({
      _id: entry._id,
      name: entry.name,
      pages: `B${found.page}`,
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
