/**
 * Builds the rules journal from the system's own register of rules.
 *
 * The system keeps every optional rule with the page that defines it, because
 * its "GURPS rules in play" settings page shows exactly that. So the page list
 * is not invented here: it is that register, read out of the pinned submodule,
 * one journal entry per rule, each keeping the rule's switch id.
 *
 * The text comes from the book's structure rather than from a stream of lines.
 * `lib/pdf-layout.mjs` reads where every run of text sits and what it is set
 * in, and `lib/book-structure.mjs` turns that into headings at their levels,
 * paragraphs that carry on across columns and pages, and sidebars and tables
 * kept apart from the running text. A rule is then what the book prints under
 * its heading, down to the next heading of the same level or higher:
 *
 *   - under a heading, the whole section, subsections included
 *   - in a sidebar, the sidebar
 *   - as a bold run-in, that paragraph and the ones that follow it
 *
 * A word broken across lines is mended the way the book spells it where no
 * break touches it (`lib/lexicon.mjs`), and scraps of a table that fell into
 * the running text are left out.
 *
 * The Basic Set is two books with one run of page numbers -- Characters ends at
 * 336 and Campaigns carries on from 337 -- so a rule's volume follows from its
 * page, and the citation on the journal page names it.
 *
 * Usage:
 *   node tools/rules.mjs --characters <pdf> --campaigns <pdf> [--write] [--reviewed]
 *   node tools/rules.mjs --characters <pdf> --campaigns <pdf> --headings <book-page>
 *
 * `--headings` lists every heading, sidebar and run-in on a page and the two
 * after it, which is how a rule the register names differently from the book is
 * tracked down. `--reviewed` promotes clean pages, and is only for after every
 * one of them has been read.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { book, projectRoot, systemRoot } from "./lib/books.mjs";
import { openBook, readPage } from "./lib/pdf-layout.mjs";
import { joinText, structureOf, titleCase, useLexicon } from "./lib/book-structure.mjs";
import { lexiconOf } from "./lib/lexicon.mjs";

/** The two volumes, and how a printed page number becomes a page in each file. */
const VOLUMES = {
  characters: { label: "Characters", first: 1, last: 336, pdfPage: (page) => page + 2 },
  campaigns: { label: "Campaigns", first: 337, last: 576, pdfPage: (page) => page - 334 },
};

/** How deep a heading sits: a chapter is the top, a run-in the bottom. */
const LEVEL = { chapter: 0, h1: 1, h2: 2, h3: 3, h4: 4 };

/** A rule is cut at a subsection boundary once it has run this long. */
const LONGEST = 16000;

/**
 * Rules the register names differently from the book.
 *
 * Each was found by listing the headings on the rule's page with --headings and
 * reading them, so every entry here names a heading that exists. They are
 * exceptions, not a second register: a rule whose key matches its heading
 * needs nothing.
 */
const ALIASES = {
  afflictions: ["Affliction"],
  aging: ["Age and Aging"],
  battleFatigue: ["Fighting a Battle"],
  criticalTables: ["Critical Success and Failure"],
  fire: ["Flame"],
  intoxication: ["Drinking and Intoxication"],
  physicalActivities: ["Physical Feats"],
  sleep: ["Missed Sleep"],
  study: ["Improvement Through Study"],
  spellDistraction: ["Distraction and Injury"],
  swarms: ["Swarm Attacks"],
  vehicleManeuvers: ["Basic Vehicle Combat"],
  bluntTrauma: ["Flexible Armor and Blunt Trauma"],
  dualWeaponAttack: ["Dual-Weapon Attacks"],
  frontArmor: ["Armor Tables"],
  layeredArmor: ["Combining and Layering Armor"],
  minimumSt: ["ST (Strength)"],
  reactions: ["Reaction Rolls"],
};

/**
 * Rules the book deals with in more than one place, gathered into one page.
 *
 * Exposure is cold and heat, which the book sets as two sections; weapon
 * breakage is a sidebar on parrying heavy weapons, a section on breaking a
 * weapon, and the Broken Weapons sidebar, forty pages apart. A page for the
 * switch holds all of it, each part under its own heading.
 */
const SECTIONS = {
  exposure: ["Cold", "Heat"],
  weaponBreakage: ["Parrying Heavy Weapons", "Breaking a Weapon", "Broken Weapons"],
  weaponQuality: ["Melee Weapon Quality", "Muscle-Powered Ranged Weapon Quality"],
  maintainingSpells: ["Duration of Spells and Maintaining Spells", "Casting Spells While Maintaining Other Spells"],
};

/**
 * Rules whose page is the first part of their section only.
 *
 * Front armour is one line -- "F" means the DR only protects from the front --
 * in the explanation that opens the armour tables. The section goes on to the
 * three tables themselves, which are the system's statistics already.
 */
const SHALLOW = new Set(["frontArmor"]);

function flag(name, fallback = null) {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

/** Lower case, no punctuation, and "attacks" the same as "attack". */
function norm(text) {
  return String(text)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/(ies)$/, "y").replace(/s$/, "") : w))
    .join(" ");
}

/** "deceptiveAttack" is "Deceptive Attack", and "ruleOf16" is "Rule of 16". */
function titleOf(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** How well a heading's text answers to one of a rule's names: 0 when not at all. */
function score(text, names) {
  const t = norm(text);
  if (!t) return 0;
  let best = 0;
  for (const name of names) {
    const n = norm(name);
    if (t === n) best = Math.max(best, 3);
    else if (t.startsWith(`${n} `) || n.startsWith(`${t} `)) best = Math.max(best, 2);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Reading the book
// ---------------------------------------------------------------------------

/**
 * One volume's pages as structure, parsed once and kept.
 *
 * pdf.js takes a moment a page, and a run of the tool reads a few hundred, so
 * the structure is cached beside the other extracted material.
 */
function library(paths) {
  const open = new Map();
  const memory = new Map();

  return async function structure(volume, page) {
    const key = `${volume}:${page}`;
    if (memory.has(key)) return memory.get(key);

    const cacheDir = join(projectRoot, "extracted", "structure", volume);
    const cacheFile = join(cacheDir, `${page}.json`);
    if (existsSync(cacheFile)) {
      const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
      memory.set(key, cached);
      return cached;
    }

    const { first, last, pdfPage } = VOLUMES[volume];
    if (page < first || page > last) return null;
    if (!open.has(volume)) open.set(volume, await openBook(paths[volume]));
    const laid = await readPage(open.get(volume), pdfPage(page));
    const structured = structureOf(laid);
    // Keep the book's page number, not the file's.
    for (const block of structured.blocks) block.page = page;
    for (const aside of structured.asides) {
      aside.page = page;
      delete aside.top;
      for (const block of aside.blocks ?? []) block.page = page;
    }
    structured.page = page;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(structured), "utf8");
    memory.set(key, structured);
    return structured;
  };
}

/**
 * The running text of a stretch of pages, as one sequence.
 *
 * A paragraph that ran off the foot of a page arrives on the next as a block of
 * its own, marked as continuing; here the two become one again.
 */
async function flowOf(structure, volume, from, to) {
  const blocks = [];
  const asides = [];
  // Which block of the flow each page's own block became, so a table can be
  // placed after the text it stands under.
  const became = new Map();
  const pages = new Map();
  for (let page = from; page <= to; page++) {
    const s = await structure(volume, page);
    if (!s) continue;
    pages.set(page, s);
    for (const block of s.blocks) {
      const last = blocks[blocks.length - 1];
      // An item set with a hanging indent carries on indented at the head of
      // the next page, so the page could not mark it as continuing; a line
      // opening in lower case after a sentence left unfinished says the same.
      const unfinished =
        last && last.kind === "p" && block.kind === "p" && !block.runIn &&
        /^[a-z(]/.test(block.text) && !/[.!?][”"’)]?$/.test(last.text);
      if ((block.continues && last && last.kind === "p") || unfinished) {
        last.text = joinAcross(last.text, block.text);
        became.set(block, last);
        continue;
      }
      const copy = { ...block };
      blocks.push(copy);
      became.set(block, copy);
    }
    asides.push(...s.asides);
  }
  return { blocks, asides, became, pages };
}

/**
 * The block of running text a table is printed under: the last paragraph or
 * heading above it in a column it stands over, or failing that the text that
 * flows into those columns. A table belongs to a rule only if that block does.
 */
function anchorOf(table, flow) {
  const s = flow.pages.get(table.page);
  if (!s) return null;
  const { edges, width } = s.columns ?? { edges: [], width: 0 };
  const x1 = table.x1 ?? table.x + 1;
  const covers = edges.map((e, i) => (table.x < e + width && x1 > e ? i : -1)).filter((i) => i >= 0);
  // A scrap of the table's own heading left in the text is not an anchor.
  const above = s.blocks.filter((b) => covers.includes(b.column) && b.y < table.y && !isDebris(b));
  let anchor = above.sort((a, b) => a.y - b.y).at(-1);
  if (!anchor) {
    // At the head of its columns: after whatever the page reads before them.
    const first = s.blocks.findIndex((b) => covers.includes(b.column));
    anchor = first > 0 ? s.blocks[first - 1] : null;
    if (!anchor) {
      const at = flow.blocks.indexOf(flow.became.get(s.blocks[0]));
      return at > 0 ? flow.blocks[at - 1] : null;
    }
  }
  return flow.became.get(anchor) ?? null;
}

function joinAcross(before, after) {
  return joinText(before, after);
}

// ---------------------------------------------------------------------------
// Finding and capturing a rule
// ---------------------------------------------------------------------------

/**
 * Every page a reference cites, and the volume they are in.
 *
 * "Campaigns pp. 359, 494" cites two places, and the rule is on the second:
 * searching only the first finds Influence Rolls. A range cites its whole span.
 */
function locate(reference) {
  const pages = new Set();
  for (const m of String(reference).matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    for (let p = from; p <= Math.min(to, from + 12); p++) pages.add(p);
  }
  if (pages.size === 0) return null;
  const first = Math.min(...pages);
  return { pages: [...pages], page: first, volume: first > VOLUMES.characters.last ? "campaigns" : "characters" };
}

/**
 * The best place in the book for a rule: a heading, a sidebar, or a run-in,
 * nearest its cited page among the best-matching.
 */
async function find(structure, rule, explicit = null) {
  const where = locate(rule.reference);
  if (!where) return null;
  const names = explicit ?? [titleOf(rule.key), ...(ALIASES[rule.key] ?? [])];
  const candidates = [];

  const pages = new Set();
  for (const cited of where.pages) for (const d of [0, 1, -1, 2]) pages.add(cited + d);
  for (const page of pages) {
    const s = await structure(where.volume, page);
    if (!s) continue;
    const distance = Math.min(...where.pages.map((cited) => Math.abs(page - cited)));

    s.blocks.forEach((block, index) => {
      if (block.kind in LEVEL) {
        const value = score(block.text, names);
        if (value) candidates.push({ type: "heading", page, index, block, value, distance });
      } else if (block.runIn) {
        const value = score(block.runIn.replace(/[:.]\s*$/, ""), names);
        if (value) candidates.push({ type: "run-in", page, index, block, value: value - 0.5, distance });
      }
    });
    s.asides.forEach((aside, index) => {
      if (aside.kind !== "sidebar") return;
      if (aside.title) {
        const value = score(aside.title, names);
        if (value) candidates.push({ type: "sidebar", page, index, aside, value: value + 0.25, distance });
      }
      aside.blocks.forEach((block, inner) => {
        if (!(block.kind in LEVEL)) return;
        const value = score(block.text, names);
        if (value) candidates.push({ type: "sidebar-section", page, index, inner, aside, block, value, distance });
      });
    });
  }

  candidates.sort((a, b) => b.value - a.value || a.distance - b.distance);
  return candidates[0] ? { ...candidates[0], volume: where.volume } : null;
}

/** Markdown for a stretch of blocks, headings placed relative to the rule's own. */
function render(blocks, baseLevel) {
  const out = [];
  for (const block of blocks) {
    if (block.kind === "table") {
      out.push(tableMarkdown(block.rows));
      continue;
    }
    // A trait's cost is set like a heading under its name -- "10 points/level"
    // -- but it is a line of the entry, not a section.
    if (block.kind === "h4" && /^[-+]?\d[\d,]*(\s+or\s+\d+)?\s+points?\b/i.test(block.text)) {
      out.push(`**${escape(block.text)}**`);
      continue;
    }
    if (block.kind in LEVEL) {
      const depth = Math.min(5, Math.max(3, LEVEL[block.kind] - baseLevel + 2));
      out.push(`${"#".repeat(depth)} ${titleCase(block.text)}`);
      continue;
    }
    let text = escape(block.text).replace(/^•\s*/, "- ");
    if (block.runIn) {
      const runIn = escape(block.runIn);
      if (text.startsWith(runIn)) text = `**${runIn.trim()}**${text.slice(runIn.length)}`;
    }
    out.push(text);
  }
  return out.join("\n\n") + "\n";
}

/** Characters Markdown would read as formatting: "-10 points*", "a_b". */
function escape(text) {
  return String(text).replace(/([*_`\\])/g, "\\$1");
}

function tableMarkdown(rows) {
  const clean = rows.filter((r) => r.length);
  if (clean.length === 0) return "";

  const width = Math.max(...clean.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill("")].map((c) => escape(c).replace(/\|/g, "\\|"));
  const lines = [`| ${pad(clean[0]).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`];
  for (const row of clean.slice(1)) lines.push(`| ${pad(row).join(" | ")} |`);
  return lines.join("\n");
}

/**
 * A piece of a table that fell into the running text: a column heading on its
 * own -- "Weight", "Range Cost" -- or a row of figures, "Canoe 23† +1/1 12c".
 * The pages of vehicle tables came out as dozens of these. Running text ends
 * its paragraphs with a sentence and is mostly words; these are neither.
 */
function isDebris(block) {
  if (block.kind !== "p") return false;
  const text = block.text.trim();
  // A column heading on its own line, "SM Occ.", may end in a full stop.
  if (block.runIn && text === block.runIn && !/[a-z]{4}/.test(text)) return true;
  // So may a heading with a cell or two run into it, "Notes 2 var." -- where a
  // real run-in ends in a colon however short its text: "Movement: Step."
  if (block.runIn && !/[:.–—-]$/.test(block.runIn.trim()) && text.length - block.runIn.length < 10) return true;
  if (/[.!?:;)]$/.test(text)) return false;
  if (block.runIn && text === block.runIn) return true;
  // A name in a table's first column: "“Barnstormer”".
  if (text.split(/\s+/).length <= 2) return true;
  const tokens = text.split(/\s+/);
  const figures = tokens.filter((t) => /^[-+–$†‡*[\]()\d.,/×%]*\d[-+–$†‡*[\]()\d.,/×%]*[A-Za-z]{0,3}[†‡*,]*$/.test(t));
  return tokens.length >= 2 && figures.length / tokens.length >= 0.35;
}

/**
 * The rule's text, from where it was found to where it ends.
 *
 * Under a heading, that is everything down to the next heading at the same
 * level or above, with the tables printed in that stretch. Very long sections
 * -- a whole chapter cited for one switch -- are cut at a subsection boundary,
 * and the page says the rest is in the book.
 */
async function capture(structure, found, { shallow = false } = {}) {
  const { volume, page } = found;

  if (found.type === "sidebar") {
    return { title: found.aside.title, blocks: found.aside.blocks, base: 1, endPage: page, cut: false };
  }
  if (found.type === "sidebar-section") {
    const level = LEVEL[found.block.kind];
    const rest = found.aside.blocks.slice(found.inner + 1);
    const end = rest.findIndex((b) => b.kind in LEVEL && LEVEL[b.kind] <= level);
    return {
      title: found.block.text,
      blocks: end === -1 ? rest : rest.slice(0, end),
      base: level,
      endPage: page,
      cut: false,
    };
  }

  const flow = await flowOf(structure, volume, page, page + 14);
  const { blocks, asides } = flow;
  const start = blocks.findIndex((b) => b.page === page && b.text === found.block.text && b.kind === found.block.kind);
  if (start === -1) return null;

  if (found.type === "run-in") {
    const taken = [blocks[start]];
    for (const block of blocks.slice(start + 1)) {
      if (block.kind in LEVEL || block.runIn) break;
      taken.push(block);
    }
    return { title: found.block.runIn.replace(/[:.]\s*$/, ""), blocks: taken, base: 3, endPage: taken.at(-1).page, cut: false };
  }

  const level = LEVEL[found.block.kind];
  const taken = [];
  // Blocks joined onto the one before them, so a table under either finds it.
  const absorbed = new Map();
  let length = 0;
  let cut = false;
  for (const block of blocks.slice(start + 1)) {
    if (block.kind in LEVEL && (shallow || LEVEL[block.kind] <= level)) break;
    if (block.kind in LEVEL && length > LONGEST) {
      cut = true;
      break;
    }
    if (isDebris(block)) continue;
    // With a scrap of table taken out, the sentence it interrupted joins up
    // again: "The" / "[12] mass-produced swords" is "The mass-produced swords".
    const last = taken.at(-1);
    const rest = block.kind === "p" && !block.runIn ? block.text.replace(/^\[\d+\]\s+(?=[a-z])/, "") : null;
    if (last?.kind === "p" && rest && /^[a-z]/.test(rest) && !/[.!?:][”"’)]?$/.test(last.text)) {
      last.text = joinText(last.text, rest);
      absorbed.set(block, last);
      length += rest.length;
      continue;
    }
    taken.push(block);
    length += block.text.length;
  }

  // A table's title set in the middle of a column can fall between the halves
  // of a sentence: "the GM should" / "Magic Items Table" / "try not to drop
  // inadvertent clues". The sentence is joined and the title follows it.
  for (let i = 1; i + 1 < taken.length; i++) {
    const [before, heading, after] = [taken[i - 1], taken[i], taken[i + 1]];
    if (!(heading.kind in LEVEL) || before.kind !== "p" || after.kind !== "p" || after.runIn) continue;
    if (!/^[a-z]/.test(after.text) || /[.!?:][”"’)]?$/.test(before.text)) continue;
    before.text = joinText(before.text, after.text);
    absorbed.set(after, before);
    taken.splice(i + 1, 1);
  }

  const endPage = taken.at(-1)?.page ?? page;
  // The tables printed within the stretch, each placed after the text it
  // stands under. A table beside some other section is that section's: the
  // Climbing table is not part of Regular Contests because it shares a page.
  const heading = blocks[start];
  const within = new Set([heading, ...taken]);
  const placed = new Map();
  for (const table of asides.filter((a) => a.kind === "table" && a.page >= page && a.page <= endPage)) {
    const found = anchorOf(table, flow);
    const anchor = absorbed.get(found) ?? found;
    if (!anchor || !within.has(anchor)) continue;
    if (!placed.has(anchor)) placed.set(anchor, []);
    placed.get(anchor).push(table);
  }
  const withTables = [];
  for (const block of [heading, ...taken]) {
    if (block !== heading) withTables.push(block);
    for (const table of (placed.get(block) ?? []).sort((a, b) => a.y - b.y)) withTables.push(table);
  }

  return { title: found.block.text, blocks: withTables, base: level, endPage, cut };
}

// ---------------------------------------------------------------------------
// The register, and what reading decided
// ---------------------------------------------------------------------------

function registeredRules() {
  const source = readFileSync(join(systemRoot, "src", "system", "optional-rules.ts"), "utf8");
  const body = source.slice(source.indexOf("OPTIONAL_RULES: Record"));
  const groups = [...body.matchAll(/^\s{2}(\w+):\s*\[/gm)];
  const rules = [];
  for (const [index, group] of groups.entries()) {
    const from = group.index;
    const to = index + 1 < groups.length ? groups[index + 1].index : body.length;
    for (const match of body.slice(from, to).matchAll(/key:\s*"([^"]+)"[\s\S]{0,200}?reference:\s*"([^"]+)"/g)) {
      rules.push({ key: match[1], reference: match[2], group: group[1] });
    }
  }
  return rules;
}

function readingDecisions() {
  const path = join(book("basic-set").dir, "review.json");
  if (!existsSync(path)) return new Map();
  return new Map(Object.entries(JSON.parse(readFileSync(path, "utf8")).journals ?? {}));
}

/** What looks wrong with a captured rule, before anyone reads it. */
function doubts(markdown, captured) {
  const text = markdown.replace(/[#*|\\-]/g, " ").replace(/\s+/g, " ").trim();
  const found = [];
  if (text.length < 120) found.push("very short");
  if (!/[.!?"')\]]$/.test(text) && !/\|\s*$/.test(markdown.trim())) {
    found.push("stops mid-sentence, so the capture was cut short");
  }
  if (/�/.test(markdown)) found.push("a character did not survive extraction");
  if (captured.cut) found.push("a long section, cut at a subsection; the rest is in the book");
  return found;
}

// ---------------------------------------------------------------------------

async function listHeadings(structure, pageText) {
  const page = Number(pageText);
  const volume = page > VOLUMES.characters.last ? "campaigns" : "characters";
  for (let p = page; p <= page + 2; p++) {
    const s = await structure(volume, p);
    if (!s) continue;
    console.log(`\n${VOLUMES[volume].label} p. ${p}`);
    for (const b of s.blocks) {
      if (b.kind in LEVEL) console.log(`  ${b.kind.padEnd(7)} ${b.text}`);
      else if (b.runIn) console.log(`  run-in  ${b.runIn}`);
    }
    for (const a of s.asides) {
      console.log(`  ${a.kind.padEnd(7)} ${a.title ?? "(untitled)"}`);
      for (const b of a.blocks ?? []) if (b.kind in LEVEL) console.log(`    ${b.kind.padEnd(5)} ${b.text}`);
    }
  }
}

async function main() {
  const paths = { characters: flag("--characters"), campaigns: flag("--campaigns") };
  if (!paths.characters || !paths.campaigns || !existsSync(paths.characters) || !existsSync(paths.campaigns)) {
    console.error("Usage: node tools/rules.mjs --characters <pdf> --campaigns <pdf> [--write] [--reviewed]");
    process.exit(1);
  }
  useLexicon(await lexiconOf([paths.characters, paths.campaigns]));
  const structure = library(paths);

  if (flag("--headings")) {
    await listHeadings(structure, flag("--headings"));
    return;
  }

  const write = process.argv.includes("--write");
  const reviewed = process.argv.includes("--reviewed");
  const decisions = readingDecisions();
  const rules = registeredRules();
  const pages = [];
  const missing = [];

  for (const rule of rules) {
    let found;
    let captured;
    let markdown;

    if (SECTIONS[rule.key]) {
      const parts = [];
      for (const name of SECTIONS[rule.key]) {
        const part = await find(structure, rule, [name]);
        const got = part ? await capture(structure, part) : null;
        if (got && got.blocks.length) parts.push({ part, got });
      }
      if (parts.length === SECTIONS[rule.key].length) {
        found = parts[0].part;
        captured = {
          title: titleOf(rule.key),
          cut: parts.some((p) => p.got.cut),
          endPage: Math.max(...parts.map((p) => p.got.endPage)),
          blocks: parts.flatMap((p) => p.got.blocks),
        };
        markdown = parts
          .map((p) => `### ${titleCase(p.got.title)}\n\n${render(p.got.blocks, p.got.base + 1)}`)
          .join("\n");
      }
    } else {
      found = await find(structure, rule);
      captured = found ? await capture(structure, found, { shallow: SHALLOW.has(rule.key) }) : null;
      if (captured) markdown = render(captured.blocks, captured.base);
    }

    if (!captured || captured.blocks.length === 0) {
      missing.push(rule);
      continue;
    }
    const why = doubts(markdown, captured);
    const read = decisions.get(rule.key);
    if (read) why.push(`read and found wanting: ${read}`);
    const endPage = captured.endPage;
    const pagesCited = endPage > found.page ? `${found.page}-${endPage}` : `${found.page}`;
    pages.push({
      rule,
      title: titleCase(captured.title),
      volume: found.volume,
      pagesCited,
      markdown,
      why,
      via: found.type,
    });
  }

  const flagged = pages.filter((p) => p.why.length).length;
  console.log(`${rules.length} rules in the system's register`);
  console.log(`  found   ${pages.length} (${flagged} of them need a person)`);
  console.log(`  missing ${missing.length}`);
  for (const rule of missing) console.log(`    ${rule.key.padEnd(24)} ${rule.reference}`);
  if (process.argv.includes("--report")) {
    console.log("\nWhat each rule matched:");
    for (const p of pages) {
      console.log(`  ${p.rule.key.padEnd(22)} ${p.via.padEnd(15)} p.${p.pagesCited.padEnd(8)} ${String(p.markdown.length).padStart(6)}c  "${p.title}"${p.why.length ? "  !! " + p.why.join("; ") : ""}`);
    }
  }

  if (!write) {
    console.log("\nNothing written. Add --write.");
    return;
  }

  const dir = join(book("basic-set").dir, "journals");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const index = { pages: [] };
  for (const page of pages) {
    const file = `${page.rule.key}.md`;
    writeFileSync(join(dir, file), page.markdown, "utf8");
    index.pages.push({
      id: page.rule.key,
      title: page.title,
      chapter: page.rule.group.charAt(0).toUpperCase() + page.rule.group.slice(1),
      pages: `B${page.pagesCited}`,
      reference: `Basic Set: ${VOLUMES[page.volume].label} p${page.pagesCited.includes("-") ? "p" : ""}. ${page.pagesCited}`,
      rule: page.rule.key,
      file,
      status: page.why.length ? "needs-review" : reviewed ? "reviewed" : "transcribed",
      ...(page.why.length ? { notes: page.why.join("; ") } : {}),
    });
  }
  index.pages.sort((a, b) => a.chapter.localeCompare(b.chapter) || a.title.localeCompare(b.title));
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${pages.length} pages and index.json into ${dir}`);
}

await main();
