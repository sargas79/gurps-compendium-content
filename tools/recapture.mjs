/**
 * Captures a book's entries again, from the page's layout.
 *
 * `transcribe.mjs` reads the book as one stream of lines, which is what it had
 * when the text was first captured. Where a page has two columns and a sidebar,
 * that stream interleaves them, so an entry can stop mid-sentence, run into the
 * next, or pick up a table's figures. `lib/book-structure.mjs` -- built for the
 * rules journal -- reads the page a column at a time and knows a heading from a
 * paragraph and a sidebar from the text around it. This tool takes each entry
 * from there instead.
 *
 * It writes nothing to the prose files. It writes a report of every entry it
 * captured beside the text already held, most different first, and a JSON file
 * of the captures for a reviewer to apply one entry at a time after reading.
 *
 * Usage:
 *   node tools/recapture.mjs <pack> --characters <pdf> --campaigns <pdf> [--status needs-review,reviewed]
 *   node tools/recapture.mjs <pack> --book <slug> --pdf <pdf> [--status ...]
 *
 * The Basic Set is two volumes sharing one run of pages; any other book is one
 * PDF, read at its book.json `transcription.pdfOffset`.
 *
 * Output: build/recapture/<pack>.json and build/recapture/<pack>.txt
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { book, buildRoot, projectRoot, readProse, readStatistics } from "./lib/books.mjs";
import { joinText, structureOf, useLexicon } from "./lib/book-structure.mjs";
import { lexiconOf } from "./lib/lexicon.mjs";
import { openBook, readPage } from "./lib/pdf-layout.mjs";

const BASIC_SET_VOLUMES = {
  characters: { first: 1, last: 336, pdfPage: (page) => page + 2 },
  campaigns: { first: 337, last: 576, pdfPage: (page) => page - 334 },
};

/** A book's volumes: the Basic Set's two, or one for any other book, cached under its slug. */
function volumesOf(bk) {
  if (bk.slug === "basic-set") return BASIC_SET_VOLUMES;
  const offset = bk.transcription.pdfOffset ?? 0;
  return { [bk.slug]: { first: 1, last: 100000, pdfPage: (page) => page + offset } };
}

const RANK = { chapter: 0, h1: 1, h2: 2, h3: 3, h4: 4 };

/** A cost or class line set as a heading under the entry's name. */
const STAT_LINE =
  /^(?:Variable|Varies|[-+]?\d+%.*|[-+]?\d.*\bpoints?\b.*|.*\bpoints?\s*(?:\/|per)\s*.+|(?:IQ|DX|HT|ST|Will|Per)\/(?:Easy|Average|Hard|Very Hard)(?:\s+or\s+.+)?|Easy|Average|Hard|Very Hard|(?:Regular|Area|Missile|Melee|Blocking|Information|Enchantment|Special)(?:[;,].*)?)$/i;

/** The same, left on the end of a heading that names an entry: "Morph Variable". */
const TRAILING_STAT = /\s+(?:Variable|-?\d+(?:\s*(?:,|or|to)\s*-?\d+)*\s+points?(?:\/level)?|(?:\([a-z]{2,4}\)\s*)?[-+]\d+%.*)$/i;

/** A perk's name and icon digits, set as a line of text: "Autotrance 2", "Shtick 2/3". */
const PERK_HEADING = /^[A-Z][A-Za-z'’ -]{2,40}?(?:\s+[\d/]+){1,2}$/;

/** The same run into the paragraph before it: "...Combat Reflexes. Fur 3 1 You have fur." */
const PERK_INLINE = /[.!?](?=\s+[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,3}(?:\s+[1-4](?:\/[1-4])?){1,2}\s+(?:You|Your)\b)/;

/** Lines that are a skill's or spell's statistics, not its description. */
const STAT_PARAGRAPH = /^(?:Defaults?|Prerequisites?)\s*:/;

/**
 * A spell's statistics after its description: its duration, cost, time to cast
 * and prerequisites, which the system holds. GURPS Magic sets them as paragraphs
 * between the description and the item it can be enchanted into.
 */
const SPELL_STATS = /^(?:Duration|(?:Base |Energy )?Cost(?: to (?:cast|create))?|Time to cast|Prerequisites?)\b[^:]{0,30}:/i;

function option(name) {
  const at = process.argv.indexOf(name);
  return at !== -1 ? process.argv[at + 1] : null;
}

function library(paths, volumes) {
  const open = new Map();
  const memory = new Map();
  const names = Object.keys(volumes);
  return async function structure(page) {
    if (memory.has(page)) return memory.get(page);
    const volume = names.find((name) => page <= volumes[name].last) ?? names.at(-1);
    const { first, last, pdfPage } = volumes[volume];
    if (page < first || page > last) return null;
    const cacheDir = join(projectRoot, "extracted", "structure", volume);
    const cacheFile = join(cacheDir, `${page}.json`);
    let s;
    if (existsSync(cacheFile)) {
      s = JSON.parse(readFileSync(cacheFile, "utf8"));
    } else {
      if (!open.has(volume)) open.set(volume, await openBook(paths[volume]));
      s = structureOf(await readPage(open.get(volume), pdfPage(page)));
      for (const block of s.blocks) block.page = page;
      for (const aside of s.asides) {
        aside.page = page;
        delete aside.top;
        for (const block of aside.blocks ?? []) block.page = page;
      }
      s.page = page;
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(s), "utf8");
    }
    memory.set(page, s);
    return s;
  };
}

/**
 * Whether the book's boxes are its running text.
 *
 * GURPS Martial Arts sets nearly every page on a tinted panel, which the layout
 * reader takes for a box: an entry's heading is the box's title, or a heading
 * inside it, and the page's own running text is a few stray lines. A book that
 * says so in `transcription.asidesAsText` is read with each box's title as a
 * heading and its paragraphs as text, in the order the boxes stand; a box the
 * reader found twice is read once.
 */
let asidesAsText = false;

/** A page's blocks, with its boxes' contents read as text where the book asks for that. */
function pageBlocks(s) {
  if (!asidesAsText) return s.blocks;
  const out = [];
  const seen = new Set();
  for (const aside of s.asides) {
    if (aside.kind === "table") continue;
    const inner = (aside.blocks ?? []).filter((b) => b.kind in RANK || b.kind === "p");
    const key = inner.map((b) => b.text).join("\n");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (aside.title) out.push({ kind: "h3", text: aside.title, page: s.page, y: aside.y ?? 0, column: aside.column });
    out.push(...inner);
  }
  return [...out, ...s.blocks];
}

/** The running text of a stretch of pages, a paragraph broken over a page made whole. */
async function flowOf(structure, from, to) {
  const blocks = [];
  const asides = [];
  for (let page = from; page <= to; page++) {
    const s = await structure(page);
    if (!s) continue;
    // Which block of the flow each of the page's blocks became, so a table can
    // be placed after the text it is printed under.
    const became = new Map();
    for (const block of pageBlocks(s)) {
      const last = blocks[blocks.length - 1];
      const unfinished =
        last && last.kind === "p" && block.kind === "p" && !block.runIn &&
        /^[a-z(]/.test(block.text) && !/[.!?][”"’)]?$/.test(last.text);
      if ((block.continues && last && last.kind === "p") || unfinished) {
        last.text = joinText(last.text, block.text);
        became.set(block, last);
        continue;
      }
      const copy = { ...block, tables: [] };
      blocks.push(copy);
      became.set(block, copy);
    }
    for (const aside of s.asides) {
      if (aside.kind === "table" && goodTable(aside.rows)) {
        const anchor = anchorOf(aside, s);
        if (anchor && became.has(anchor)) became.get(anchor).tables.push(aside.rows);
        continue;
      }
      asides.push({ ...aside, page });
    }
  }
  return { blocks, asides };
}

/** A table read cleanly: every row the same width, and no cell a run of prose. */
function goodTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const width = rows[0].length;
  return width >= 2 && rows.every((r) => r.length === width && r.every((c) => String(c).length <= 40));
}

/** The block of running text a table is printed under, on its own page. */
function anchorOf(table, page) {
  const { edges, width } = page.columns ?? { edges: [], width: 0 };
  const x1 = table.x1 ?? table.x + 1;
  const covers = edges.map((e, i) => (table.x < e + width && x1 > e ? i : -1)).filter((i) => i >= 0);
  const above = page.blocks.filter((b) => covers.includes(b.column) && b.y < table.y);
  return above.sort((a, b) => a.y - b.y).at(-1) ?? null;
}

/** A heading as the name it prints, without the book's icon digits, marks or cost. */
function headingName(text) {
  return String(text)
    .replace(/[†‡*]+/g, "")
    // A Very Hard spell is marked so beside its name: "Great Haste (VH)".
    .replace(/\s*\(VH\)/, "")
    // A technological spell carries its tech level: "Seek Machine/TL".
    .replace(/\/TL\b/, "")
    .replace(/(\s+[\d/]+){1,3}\s*$/, "")
    .replace(TRAILING_STAT, "")
    .trim();
}

const norm = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

function candidatesFor(name) {
  const noTl = (s) => s.replace(/\/TL\b/, "");
  // An option of a modifier, as the data file writes it: "Melee Attack: Reach
  // C", "Gadget/Breakable: DR 3-5". The book describes it under the modifier.
  const option = /^([^:(/]+?)(?:\/([^:]+))?:\s*(.+)$/.exec(name);
  if (option) {
    const families = [option[1].trim(), option[2] ? option[2].trim() : null].filter(Boolean);
    const variant = option[3].replace(/\s*\(.*\)\s*$/, "").trim();
    return { exact: [name, variant], family: families, variant };
  }
  const family = name.replace(/\s*\(.*\)\s*$/, "");
  const variant = /\(([^)]*)\)\s*$/.exec(name)?.[1] ?? null;
  // "Based On DX (Target Roll)" is the data file's; the book has one modifier.
  if (/^Based On /i.test(name)) return { exact: ["Based on (Different Attribute)"], family: [], variant: null };
  return { exact: [name, noTl(name)], family: family !== name ? [family, noTl(family)] : [], variant };
}

/** Paragraphs from a heading to where its section ends. */
function section(blocks, at, spells = false) {
  // An entry set as a fourth-level heading with its cost -- "Alternate Form
  // Variable" under Shapeshifting -- has sub-headings at the same level
  // ("Special Limitations"), so it ends at the next heading that carries a cost,
  // or a higher heading. A quirk's heading carries no cost, and the next quirk's
  // heading ends it.
  const heading = blocks[at];
  const rank = heading.kind === "h4" && TRAILING_STAT.test(heading.text.trim()) ? RANK.h3 : RANK[heading.kind];
  const out = [];
  let leading = true;
  let statOpen = false;
  for (let i = at + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind in RANK) {
      const r = RANK[b.kind];
      if (leading && b.kind === "h4" && STAT_LINE.test(b.text.trim().replace(/\*+$/, ""))) continue;
      if (r <= rank) break;
      if (PERK_HEADING.test(b.text.trim())) break;
      // A sub-heading that carries a cost is the next entry, set one level down.
      const t = b.text.trim();
      if ((TRAILING_STAT.test(t) && /[A-Za-z]{3}/.test(t.replace(TRAILING_STAT, ""))) || STAT_LINE.test(t)) break;
      out.push({ kind: "sub", text: b.text.trim() });
      for (const rows of b.tables ?? []) out.push({ kind: "table", rows });
      leading = false;
      continue;
    }
    if (b.kind !== "p") continue;
    // A table printed under a statistics line -- Penetrating Weapon's costs by
    // armor divisor -- is the spell's, though the line itself is left out.
    if (spells && SPELL_STATS.test(b.text.trim())) {
      statOpen = !/[.!?]$/.test(b.text.trim());
      for (const rows of b.tables ?? []) out.push({ kind: "table", rows });
      continue;
    }
    if (spells && statOpen && !leading && /^[a-z(]/.test(b.text.trim())) {
      statOpen = !/[.!?]$/.test(b.text.trim());
      for (const rows of b.tables ?? []) out.push({ kind: "table", rows });
      continue;
    }
    // A spell's class, set as a line of text under its name: "Regular; Resisted by HT".
    if (spells && leading && STAT_LINE.test(b.text.trim())) continue;
    // The book's icon digits for a trait's type, set apart from its heading: "3 1".
    if (/^[\d/\s]+$/.test(b.text)) continue;
    if (PERK_HEADING.test(b.text.trim())) break;
    const inline = PERK_INLINE.exec(b.text);
    if (inline) {
      out.push({ kind: "p", text: b.text.slice(0, inline.index + 1).trim(), runIn: b.runIn });
      break;
    }
    if (leading && STAT_PARAGRAPH.test(b.text)) {
      statOpen = !/[.!?]$/.test(b.text.trim());
      continue;
    }
    if (leading && statOpen) {
      statOpen = !/[.!?]$/.test(b.text.trim());
      continue;
    }
    if (leading && /^\*/.test(b.text.trim())) continue;
    // "see Melee Weapon, p. 208": a cross-reference, not a description. A
    // description can open with the word too -- "See through air" -- so only a
    // short line naming a page counts.
    if (leading && /^see\b/i.test(b.text) && /\bpp?\.\s*\d/.test(b.text) && b.text.length < 120) return null;
    leading = false;
    out.push({ kind: "p", text: b.text.trim(), runIn: b.runIn });
    for (const rows of b.tables ?? []) out.push({ kind: "table", rows });
  }
  return out;
}

/** A labelled paragraph -- "Criminal Record: You have been..." -- and its label. */
function labelOf(text) {
  // A label is a name: its words capitalised but for the small ones, and short.
  const m = /^((?:[A-Z0-9][^\s:]*)(?:\s+(?:[A-Z0-9(][^\s:]*|of|and|or|the|to|in|on|with|for|a|an|at|by|vs\.?)){0,6}):\s/.exec(text);
  if (!m) return null;
  if (/^(Example|Examples|Note|Notes|Modifiers|Special Enhancements?|Special Limitations?)$/i.test(m[1])) return null;
  return m[1];
}

/** A variant's own paragraphs inside its family's text, with the family's opening before them. */
function variantOf(paragraphs, variant, name) {
  const wants = [norm(variant), norm(name)];
  const at = paragraphs.findIndex((p) => p.kind === "p" && labelOf(p.text) && wants.includes(norm(labelOf(p.text))));
  if (at === -1) return null;
  const firstLabel = paragraphs.findIndex((p) => p.kind === "p" && labelOf(p.text));
  const underSub = paragraphs.slice(0, at).some((p) => p.kind === "sub");
  const opening = underSub ? [] : paragraphs.slice(0, firstLabel);
  const own = [paragraphs[at]];
  for (let i = at + 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.kind === "sub" || (p.kind === "p" && labelOf(p.text))) break;
    own.push(p);
  }
  return [...opening, ...own];
}

async function capture(structure, record, spells) {
  const cited = Number(/\d+/.exec(record.pages ?? "")?.[0] ?? 0);
  if (!cited) return { found: false, why: "no page cited" };
  const { blocks, asides } = await flowOf(structure, Math.max(1, cited - 1), cited + 3);
  const { exact, family, variant } = candidatesFor(record.name);
  const headings = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.kind in RANK && b.kind !== "chapter")
    // An entry's own heading before a section title of the same words ("WEALTH"
    // over "Wealth"), then nearest the cited page.
    .sort((x, y) => {
      const level = (b) => (b.kind === "h3" || b.kind === "h4" ? 0 : 1);
      return level(x.b) - level(y.b) || Math.abs(x.b.page - cited) - Math.abs(y.b.page - cited) || x.i - y.i;
    });

  for (const hit of headings.filter(({ b }) => exact.some((n) => norm(headingName(b.text)) === norm(n)))) {
    const paragraphs = section(blocks, hit.i, spells);
    if (paragraphs) return { found: true, kind: "heading", page: hit.b.page, paragraphs };
  }
  for (const hit of headings.filter(({ b }) => family.some((n) => norm(headingName(b.text)) === norm(n)))) {
    const paragraphs = section(blocks, hit.i, spells);
    if (!paragraphs) continue;
    const own = variant ? variantOf(paragraphs, variant, record.name) : null;
    if (own) return { found: true, kind: "variant", page: hit.b.page, paragraphs: own };
    return { found: true, kind: "family", page: hit.b.page, paragraphs };
  }
  // A heading written as a pattern for several entries: "Summon (Air) Elemental",
  // "(Animal) Control", "Keen (Sense)", "Command Spirit (type)". Each entry it
  // stands for takes its whole text.
  for (const { b, i } of headings) {
    const name = headingName(b.text);
    if (!/\([A-Za-z ]+\)/.test(name)) continue;
    const pattern = new RegExp(
      "^" + name.split(/(\([A-Za-z ]+\))/).map((part, k) => (k % 2 ? "(?:\\(?)[A-Za-z' -]+?(?:\\)?)" : part.replace(/[.*+?^${}|[\]\\]/g, "\\$&"))).join("") + "$",
      "i",
    );
    // "Command Spirit" as well as "Command Spirit (Banshees)".
    const bare = norm(name.replace(/\s*\([A-Za-z ]+\)\s*/g, " "));
    if (!exact.some((n) => pattern.test(n) || norm(n) === bare)) continue;
    const paragraphs = section(blocks, i, spells);
    if (paragraphs?.length) return { found: true, kind: "family", page: b.page, paragraphs };
  }
  // An entry printed as a labelled paragraph with no heading of its own.
  for (const n of [...exact, ...family]) {
    const at = blocks.findIndex((b) => b.kind === "p" && labelOf(b.text) && norm(labelOf(b.text)) === norm(n));
    if (at !== -1) {
      const own = [{ kind: "p", text: blocks[at].text }];
      for (let i = at + 1; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.kind !== "p" || labelOf(b.text)) break;
        own.push({ kind: "p", text: b.text });
      }
      own[0] = { kind: "p", text: own[0].text.slice(labelOf(own[0].text).length + 1).trim() };
      return { found: true, kind: "labelled", page: blocks[at].page, paragraphs: own };
    }
  }
  const titled = asides.findIndex((a) => a.title && exact.some((n) => norm(headingName(a.title)) === norm(n)));
  if (titled !== -1) {
    const parts = [...(asides[titled].blocks ?? [])];
    for (let i = titled + 1; i < asides.length && !asides[i].title && asides[i].page === asides[titled].page; i++) {
      parts.push(...(asides[i].blocks ?? []));
    }
    const paragraphs = section([{ kind: "h3", text: record.name }, ...parts.map((b) => ({ ...b }))], 0);
    if (paragraphs?.length) return { found: true, kind: "sidebar", page: asides[titled].page, paragraphs };
  }
  return { found: false, why: "no heading or label of that name within the cited pages" };
}

/** The book's typography in the house style the prose files already use. */
function plainText(s) {
  return String(s)
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*[–—]\s*/g, " - ")
    .replace(/­/g, "");
}

function toHtml(paragraphs) {
  const escape = (s) => plainText(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = [];
  let list = [];
  const flush = () => {
    if (list.length) html.push(`<ul>${list.map((t) => `<li>${escape(t)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const p of paragraphs) {
    if (p.kind === "p" && /^•\s*/.test(p.text)) {
      list.push(p.text.replace(/^•\s*/, ""));
      continue;
    }
    flush();
    if (p.kind === "table") {
      // A heading set on two lines arrives as two rows: "Number of" over "People".
      const rows = p.rows.map((r) => [...r]);
      const wordy = (r) => r.every((c) => /[A-Za-z]/.test(c) && !/\d/.test(c));
      if (rows.length > 2 && wordy(rows[0]) && wordy(rows[1])) {
        rows.splice(0, 2, rows[0].map((c, i) => `${c} ${rows[1][i]}`));
      }
      p.rows = rows;
      html.push(
        `<table>${p.rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${escape(c)}</th>` : `<td>${escape(c)}</td>`)).join("")}</tr>`).join("")}</table>`,
      );
      continue;
    }
    if (p.kind === "sub") {
      html.push(`<p><em>${escape(p.text)}</em></p>`);
      continue;
    }
    const label = labelOf(p.text) ?? /^(Example|Examples|Note|Notes|Modifiers|Special Enhancements?|Special Limitations?):/.exec(p.text)?.[1];
    if (label) {
      html.push(`<p><em>${escape(label)}:</em>${escape(p.text.slice(label.length + 1))}</p>`);
    } else {
      html.push(`<p>${escape(p.text)}</p>`);
    }
  }
  flush();
  return html.join("");
}

const words = (html) =>
  plainText(String(html).replace(/<[^>]+>/g, " "))
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];

/** How much of two texts' wording they share, 0 to 1. */
function likeness(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length && !wb.length) return 1;
  const counts = new Map();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of wb) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      common++;
      counts.set(w, n - 1);
    }
  }
  return (2 * common) / (wa.length + wb.length);
}

async function main() {
  const pack = process.argv[2];
  const bk = book(option("--book") ?? "basic-set");
  const paths = bk.slug === "basic-set"
    ? { characters: option("--characters"), campaigns: option("--campaigns") }
    : { [bk.slug]: option("--pdf") };
  const statuses = new Set((option("--status") ?? "needs-review,reviewed").split(","));
  if (!pack || pack.startsWith("--") || Object.values(paths).some((path) => !path)) {
    console.error(
      "Usage: node tools/recapture.mjs <pack> --characters <pdf> --campaigns <pdf> [--status needs-review,reviewed]\n" +
        "       node tools/recapture.mjs <pack> --book <slug> --pdf <pdf> [--status ...]",
    );
    process.exit(1);
  }
  useLexicon(await lexiconOf(Object.values(paths)));
  asidesAsText = Boolean(bk.transcription?.asidesAsText);
  const structure = library(paths, volumesOf(bk));
  const { records } = readProse(bk, pack);
  // An entry with no text yet is captured too, as status "none", for a book
  // whose statistics are its own: its page comes from the entry's reference.
  if (bk.statistics === "book") {
    for (const { entry } of readStatistics(bk, pack)) {
      if (records.has(entry._id)) continue;
      const page = /\d+/.exec(entry.system?.reference ?? "")?.[0];
      records.set(entry._id, { _id: entry._id, name: entry.name, pages: page ? `${bk.prefix}${page}` : "", status: "none", notes: "", description: "" });
    }
  }

  const results = [];
  const only = option("--only");
  for (const record of records.values()) {
    if (!statuses.has(record.status)) continue;
    if (only && record.name !== only) continue;
    const got = await capture(structure, record, pack === "spells");
    if (only) console.log(JSON.stringify(got, null, 2));
    const description = got.found ? toHtml(got.paragraphs) : "";
    results.push({
      _id: record._id,
      name: record.name,
      status: record.status,
      notes: record.notes,
      kind: got.found ? got.kind : "absent",
      why: got.why ?? "",
      page: got.page ?? null,
      likeness: got.found ? Number(likeness(record.description, description).toFixed(3)) : 0,
      old: record.description,
      description,
    });
  }
  results.sort((a, b) => a.likeness - b.likeness);

  const outDir = join(buildRoot, "recapture");
  mkdirSync(outDir, { recursive: true });
  const stem = bk.slug === "basic-set" ? pack : `${bk.slug}-${pack}`;
  writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(results, null, 2), "utf8");
  const text = (html) => plainText(String(html).replace(/<\/p>|<\/li>/g, "\n").replace(/<[^>]+>/g, "")).trim();
  const report = results.map(
    (r) =>
      `########## ${r.name} [${r.status}] kind=${r.kind} page=${r.page} likeness=${r.likeness}${r.why ? ` (${r.why})` : ""}\n` +
      (r.notes ? `NOTES: ${r.notes}\n` : "") +
      `--- OLD ---\n${text(r.old)}\n--- NEW ---\n${text(r.description)}\n`,
  );
  writeFileSync(join(outDir, `${stem}.txt`), report.join("\n"), "utf8");
  const tally = {};
  for (const r of results) tally[r.kind] = (tally[r.kind] ?? 0) + 1;
  const same = results.filter((r) => r.likeness >= 0.97).length;
  console.log(`${pack}: ${results.length} entries`, tally, `${same} at 0.97 likeness or more`);
}

await main();
