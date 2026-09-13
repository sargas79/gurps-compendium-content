/**
 * Drafts the rules journal from the system's own register of rules.
 *
 * The system already keeps a list of every optional rule with the page that
 * defines it, because its "GURPS rules in play" settings page shows exactly
 * that. So the page list for this pack is not something to invent: it is that
 * register, read out of the pinned submodule, one journal entry per rule.
 *
 * That also means each entry can carry the rule's switch id, so the settings
 * page can one day link a rule to the text that explains it without this
 * repository having to know how.
 *
 * The Basic Set is two books with one run of page numbers -- Characters ends at
 * 336 and Campaigns carries on from 337 -- so which PDF a rule is in follows
 * from its citation, and each has its own offset between the page the book
 * prints and the page the file holds.
 *
 * Usage:
 *   node tools/rules.mjs --characters <pdf> --campaigns <pdf> [--write]
 *
 * Nothing is written without --write. Rules whose heading cannot be found are
 * reported and left out: a journal entry with no text in it is worse than an
 * absent one.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { book, projectRoot, systemRoot } from "./lib/books.mjs";

/** Characters runs to p. 336; anything after that is Campaigns. */
const LAST_CHARACTERS_PAGE = 336;

/** book page + offset = index into that PDF's pages. */
const OFFSET = { characters: 1, campaigns: -335 };

/** A running head, a folio, or a sidebar's shout. */
const FURNITURE = /^([A-Z][A-Z '&-]{3,}|\d{1,3})$/;

/** What reading decided about each rule, by rule id. */
function readingDecisions() {
  const path = join(book("basic-set").dir, "review.json");
  if (!existsSync(path)) return new Map();
  return new Map(Object.entries(JSON.parse(readFileSync(path, "utf8")).journals ?? {}));
}

function flag(name, fallback = null) {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

function normalise(text) {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function pagesOf(pdf, tag) {
  const cache = join(projectRoot, "extracted", `rules-${tag}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const result = spawnSync("pdftotext", [pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`pdftotext failed on ${pdf}`);
  const pages = result.stdout.split("\f");
  mkdirSync(join(projectRoot, "extracted"), { recursive: true });
  writeFileSync(cache, JSON.stringify(pages), "utf8");
  return pages;
}

/**
 * The rules the system knows about, from the source its settings page reads.
 *
 * Parsed rather than imported: the register is TypeScript inside a submodule,
 * and a regex over it costs nothing and adds no build step. It is only ever
 * read, so a shape it does not expect shows up as a rule going missing from the
 * report rather than as bad output.
 */
function registeredRules() {
  const source = readFileSync(join(systemRoot, "src", "system", "optional-rules.ts"), "utf8");
  const body = source.slice(source.indexOf("OPTIONAL_RULES: Record"));
  const groups = [...body.matchAll(/^\s{2}(\w+):\s*\[/gm)];

  const rules = [];
  for (const [index, group] of groups.entries()) {
    const from = group.index;
    const to = index + 1 < groups.length ? groups[index + 1].index : body.length;
    for (const match of body.slice(from, to).matchAll(
      /key:\s*"([^"]+)"[\s\S]{0,200}?reference:\s*"([^"]+)"/g,
    )) {
      rules.push({ key: match[1], reference: match[2], group: group[1] });
    }
  }
  return rules;
}

/** "deceptiveAttack" is "Deceptive Attack", and "ruleOf16" is "Rule of 16". */
function titleOf(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, "of")
    .replace(/\bThe\b/g, "the")
    .replace(/\bAnd\b/g, "and");
}

/** A heading reduced to the letters and spaces that make it comparable. */
function key(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Whether a line is the heading for this rule.
 *
 * The system's key and the book's heading agree more often than not, but not
 * always: the switch is `slams` where the book sets "Slam", `hitLocations`
 * where it sets "Hit Location", and `knockdown` where it sets "Knockdown and
 * Stunning". Singulars and a heading that merely begins with the title cover
 * those without a table of exceptions to keep in step with the system.
 */
function headingMatches(line, title) {
  const a = key(line);
  const b = key(title);
  if (!a || a.length > 60) return false;
  const singular = (s) => s.replace(/s$/, "");
  return a === b || singular(a) === singular(b) || a.startsWith(b + " ") || b.startsWith(a + " ");
}

/** The first page a reference cites, and which book that page is in. */
function locate(reference) {
  const page = Number(/(\d+)/.exec(reference)?.[1] ?? 0);
  if (!page) return null;
  return { page, source: page > LAST_CHARACTERS_PAGE ? "campaigns" : "characters" };
}

/**
 * Whether a line is a section heading.
 *
 * The book sets one as a short title-case line with no sentence punctuation, so
 * that is what ends the section above it. Getting this wrong in the cautious
 * direction truncates an entry; getting it wrong the other way runs two
 * together, so the test errs towards stopping.
 */
function isHeading(line) {
  return (
    line.length > 2 &&
    line.length < 55 &&
    /^[A-Z"“]/.test(line) &&
    !/[.!?,;:]$/.test(line) &&
    !/^\d/.test(line)
  );
}

/** The text under one rule's heading, or null if the heading is not there. */
function capture(rule, pages) {
  const where = locate(rule.reference);
  if (!where) return null;
  const title = titleOf(rule.key);

  for (const delta of [0, 1, -1, 2, -2, 3]) {
    const index = where.page + OFFSET[where.source] + delta;
    if (index < 0 || index >= pages[where.source].length) continue;
    const lines = pages[where.source][index]
      .split("\n")
      .map(normalise)
      .filter(Boolean);

    const at = lines.findIndex((line) => headingMatches(line, title));
    if (at === -1) continue;

    const body = [];
    for (let i = at + 1; i < lines.length; i++) {
      const line = lines[i];
      if (FURNITURE.test(line)) continue;
      if (body.length > 0 && isHeading(line)) break;
      body.push(line);
      if (body.length >= 14) break;
    }
    if (body.length) {
      const joined = rejoin(body);
      return {
        title: titleOf(rule.key),
        page: where.page,
        source: where.source,
        body: joined,
        // Judged on the capture before rejoining: joining is what hides the
        // seam, so a check run after it would pass the very pages it should
        // catch.
        doubts: doubts(body, joined),
      };
    }
  }
  return null;
}

/**
 * Rejoins a paragraph the columns broke in half.
 *
 * A paragraph of prose ends with punctuation, so one that does not is unfinished
 * and the line after it continues it.
 */
function rejoin(paragraphs) {
  const out = [];
  for (const paragraph of paragraphs) {
    const previous = out[out.length - 1];
    if (previous && !/[.!?:;"')\]]$/.test(previous)) out[out.length - 1] = `${previous} ${paragraph}`;
    else out.push(paragraph);
  }
  return out;
}

/**
 * What looks wrong with a captured rule.
 *
 * The failure worth catching is interleaving: a rule set across columns beside a
 * table or a sidebar comes back with the neighbour's text spliced into it, and
 * the seam shows as a sentence that stops and restarts on something unrelated.
 * A page like that is still worth having, but not worth trusting unread.
 */
function doubts(raw, joined) {
  const text = joined.join(" ");
  const found = [];
  if (raw.slice(0, -1).some((p) => !/[.!?:"')\]]$/.test(p))) {
    found.push("a sentence breaks across lines, so another column may be spliced in");
  }
  if (text.length < 120) found.push("very short");
  const end = text.trim();
  // A rule that ends by introducing what follows -- "as shown on this table:",
  // "but with the additions below." -- has lost what it introduced.
  if (/:$/.test(end) || /(below|following)\.?$/i.test(end)) {
    found.push("ends by introducing something that did not come across");
  } else if (!/[.!?"')\]]$/.test(end)) {
    found.push("stops mid-sentence, so the capture was cut short");
  }
  if (/�/.test(text)) found.push("a character did not survive extraction");
  if (/\(p\.\s*5\d\d\)/.test(text) && joined.length < 4) {
    found.push("mostly a cross-reference");
  }
  return found;
}

/** Paragraphs to Markdown, which is what a journal page is written in. */
function toMarkdown(found) {
  return found.body.join("\n\n") + "\n";
}

async function main() {
  const write = process.argv.includes("--write");
  // Only after a person has read every clean page: promotes them to reviewed.
  const reviewed = process.argv.includes("--reviewed");
  const decisions = readingDecisions();
  const characters = flag("--characters");
  const campaigns = flag("--campaigns");

  if (!characters || !campaigns || !existsSync(characters) || !existsSync(campaigns)) {
    console.error("Usage: node tools/rules.mjs --characters <pdf> --campaigns <pdf> [--write]");
    process.exit(1);
  }

  const bk = book("basic-set");
  const pages = {
    characters: pagesOf(characters, "characters"),
    campaigns: pagesOf(campaigns, "campaigns"),
  };

  const rules = registeredRules();
  const found = [];
  const missing = [];

  for (const rule of rules) {
    const capture_ = capture(rule, pages);
    if (capture_) {
      const read = decisions.get(rule.key);
      if (read) capture_.doubts.push(`read and found wanting: ${read}`);
      found.push({ rule, ...capture_ });
    }
    else missing.push(rule);
  }

  console.log(`${rules.length} rules in the system's register`);
  const doubtful = found.filter((entry) => entry.doubts.length).length;
  console.log(`  found   ${found.length} (${doubtful} of them need a person)`);
  console.log(`  missing ${missing.length}`);
  if (missing.length) {
    console.log(`\nNot located, and so not written:`);
    for (const rule of missing) console.log(`  ${rule.key.padEnd(24)} ${rule.reference}`);
  }

  if (!write) {
    console.log("\nNothing written. Add --write.");
    return;
  }

  const dir = join(bk.dir, "journals");
  mkdirSync(dir, { recursive: true });

  const index = { pages: [] };
  for (const entry of found) {
    const file = `${entry.rule.key}.md`;
    writeFileSync(join(dir, file), toMarkdown(entry), "utf8");
    index.pages.push({
      id: entry.rule.key,
      title: entry.title,
      chapter: entry.rule.group.charAt(0).toUpperCase() + entry.rule.group.slice(1),
      pages: `B${entry.page}`,
      // The Basic Set is two volumes sharing one run of page numbers, so the
      // citation has to name which one: p. 365 is Campaigns, not Characters.
      reference: `Basic Set: ${entry.source === "campaigns" ? "Campaigns" : "Characters"} p. ${entry.page}`,
      rule: entry.rule.key,
      file,
      status: entry.doubts.length ? "needs-review" : reviewed ? "reviewed" : "transcribed",
      ...(entry.doubts.length ? { notes: entry.doubts.join("; ") } : {}),
    });
  }
  index.pages.sort((a, b) => a.chapter.localeCompare(b.chapter) || a.title.localeCompare(b.title));
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");

  console.log(`\nWrote ${found.length} pages and index.json into ${dir}`);
}

await main();
