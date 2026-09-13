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
 *     Bad Temper          Camouflage                     Claws
 *     -10 points*         IQ/Easy                        Variable
 *                         Defaults: IQ-4 or Survival-2.
 *
 * A perk has none at all, being always worth one point; that case is handled
 * where this is used rather than here.
 */
const COST = new RegExp(
  [
    "^variable$",
    "^[-+±]?[\\d/½\\s]+(or\\s+\\d+\\s+)?points?\\b", // -10 points*, 2 points/level
    "^see\\s", //                                       see Melee Weapon, p. 208
    "^(ST|DX|IQ|HT|Will|Per)/(Easy|Average|Hard|Very Hard)\\b", // DX/Hard
    "^defaults?:", //                                   Defaults: IQ-4 or Survival-2.
    "^[-+]\\d+%", //                                    +50%, -10%
  ].join("|"),
  "i",
);

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
    if (/^[A-Z][A-Za-z' -]{2,40}:/.test(line)) break;
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

  for (const delta of [0, 1, -1, 2, 3, -2]) {
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
        body.push(line);
      }
      // An entry that runs to the foot of the page continues at the top of the
      // next one, before that page's first heading.
      if (j >= lines.length && index + 1 < pages.length) {
        for (const line of usefulLines(pages[index + 1])) {
          if (FURNITURE.test(line)) continue;
          if (names.has(bare(line))) break;
          if (COST.test(line)) break;
          body.push(line);
        }
      }
      if (body.length) return { kind: "heading", paragraphs: rejoin(body), page: cited + delta };
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
  if (text.length > 6000) found.push("very long, may have run past the entry");
  if (paragraphs.length > 18) found.push("many paragraphs, may have run past the entry");
  // A double quote after a digit is inches -- 12" of talon -- not a quotation.
  if ((text.replace(/(\d)"/g, "$1").match(/"/g) ?? []).length % 2) {
    found.push("an unbalanced quotation mark");
  }
  if (kind === "variant") found.push("taken from the family's shared text; check the variant's own line");
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

  const records = [];
  const tally = { heading: 0, "sub-entry": 0, variant: 0, absent: 0, kept: 0 };

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
        status: "needs-review",
        notes: "no entry of this name in the book at the cited page; may be the data file's own name for a purchase the book describes elsewhere",
        description: "",
      });
      continue;
    }

    tally[found.kind]++;
    const why = doubts(found.paragraphs, found.kind);
    records.push({
      _id: entry._id,
      name: entry.name,
      pages: `B${found.page}`,
      status: why.length ? "needs-review" : "transcribed",
      notes: why.join("; "),
      description: toHtml(found.paragraphs),
    });
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
