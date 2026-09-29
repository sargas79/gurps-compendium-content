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
 *   node tools/rules.mjs --revised <Basic Set Revised pdf> [--write] [--reviewed]
 *
 * `--revised` reads the Fourth Edition Revised instead: one PDF, printed page p
 * on PDF page p + 10, read with its own profile (lib/revised.mjs). Every
 * heading kept its page, so the register, the core chapters and the citations
 * are the same and the page files keep their names. What the Revised edition
 * adds is built in three ways:
 *
 *   - the switches of its four addenda (pp. 324-334, 337-342, 566, 570-578) get
 *     one page to a section, each section that defines a switch carrying its
 *     `rule` flag (`ADDENDA_RULES`), read with the layout reader
 *   - a box the reader cannot give (a table beside the text, a note in the
 *     margin, a heading it loses) is corrected in lib/revised-fixes.mjs, or
 *     written by hand under `journals-by-hand` from `pdftotext -raw`
 *   - the pages kept by hand are read against what the reader gives for the
 *     Revised layout, written to build/recapture/revised-by-hand/
 *
 * The register is the pinned system's; `--register <optional-rules.ts>` reads
 * another release's, for the switches a later release has added.
 *
 * `--headings` lists every heading, sidebar and run-in on a page and the two
 * after it, which is how a rule the register names differently from the book is
 * tracked down. `--reviewed` promotes clean pages, and is only for after every
 * one of them has been read.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { book, buildRoot, projectRoot, systemRoot } from "./lib/books.mjs";
import { openBook, readPage } from "./lib/pdf-layout.mjs";
import { joinText, structureOf, titleCase, useLexicon } from "./lib/book-structure.mjs";
import { lexiconOf } from "./lib/lexicon.mjs";
import { REVISED_FIXES } from "./lib/revised-fixes.mjs";
import { ADDENDA, PDF_OFFSET as REVISED_OFFSET, LAST_PAGE as REVISED_LAST, REVISED, addendumOf } from "./lib/revised.mjs";

/** The two volumes, and how a printed page number becomes a page in each file. */
const VOLUMES = {
  characters: { label: "Characters", first: 1, last: 336, pdfPage: (page) => page + 2 },
  campaigns: { label: "Campaigns", first: 337, last: 576, pdfPage: (page) => page - 334 },
  // The Revised edition is one volume; its pages are cited as the 2004 ones were.
  revised: { label: "Revised", first: 1, last: REVISED_LAST, pdfPage: (page) => page + REVISED_OFFSET },
};

/** Whether the Revised edition is being read (`--revised`). */
let revised = false;

/** The volume a printed page is read from. */
function volumeOf(page) {
  if (revised) return "revised";
  return page > VOLUMES.characters.last ? "campaigns" : "characters";
}

/** The 2004 volume a page was cited in, which the journal's citations keep. */
function citedVolume(page) {
  return page > VOLUMES.characters.last ? "Campaigns" : "Characters";
}

/** How deep a heading sits: a chapter is the top, a run-in the bottom. */
const LEVEL = { chapter: 0, h1: 1, h2: 2, h3: 3, h4: 4 };

/** A chapter's number, which the Revised edition sets in a line of its own: "Chapter Fifteen". */
const CHAPTER_NUMBER =
  /^Chapter\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty(?:-\w+)?)$/i;

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
  collisions: ["Collisions and Falls"],
  dualWeaponAttack: ["Dual-Weapon Attacks"],
  knockdown: ["Knockdown and Stunning"],
  highSpeed: ["High-Speed Movement"],
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

/**
 * Rules whose page is their whole section, however long. Physical Feats,
 * Vehicles and the magic system each cite a run of pages, and a page cut at a
 * subsection sent the reader back to the book for the rest.
 */
const WHOLE = { physicalActivities: 357, vehicles: 470, magic: 241 };

/**
 * The rules of play that no switch turns off, one page per section: the
 * chapters on success rolls, combat, tactical combat, special combat
 * situations, and injuries, illness and fatigue (Campaigns, chapters 10-14).
 * Each chapter's pages are its second-level sections, or a first-level
 * section that has none; a section a switch's page already holds is left to
 * that page. `folder` sorts a section into the journal's chapter folders.
 */
const CORE = [
  {
    from: 343,
    to: 361,
    folder: () => "rolls",
    // The chapter opens with When to Roll, set across the page as a sidebar
    // is, so its page is written by hand and found by the section after it.
    extra: [{ key: "successRolls", title: "Success Rolls", names: ["When the GM Rolls"], page: 344 }],
    // The Revised layout finds When to Roll as a heading, but its lists are a
    // box, so the hand page above holds the section whole.
    covered: ["When to Roll"],
  },
  { from: 362, to: 383, folder: () => "combat" },
  // A chapter's name tells apart a section it shares with an earlier chapter:
  // Melee Attacks, Special Damage.
  { from: 384, to: 392, folder: () => "combat", chapter: "Tactical Combat" },
  // `intros` are sections whose subsections are all switches' pages already,
  // so their own page is the opening words only. `distinct` are sections named
  // like a switch whose page is another section: the Afflictions switch's page
  // is the advantage, not the attacks of chapter 13 or the conditions of 14.
  {
    from: 393,
    to: 417,
    folder: (title) => (title === "Cinematic Combat Rules" ? "cinematic" : "combat"),
    chapter: "Special Combat Situations",
    intros: ["Cinematic Combat Rules"],
    distinct: ["Afflictions"],
  },
  // `covered` are sections a switch's page holds under another heading: the
  // Poison page runs on through Describing Poisons and Addictive Drugs.
  {
    from: 418,
    to: 444,
    folder: (title) => (["Injuries", "Recovery", "Fatigue"].includes(title) ? "injury" : "activities"),
    chapter: "Injuries, Illness, and Fatigue",
    distinct: ["Afflictions"],
    covered: ["Describing Poisons", "Addictive Drugs"],
    // The page's layout loses Resuscitation's heading, so its page is written
    // by hand and found by the sidebar that follows it.
    extra: [
      { key: "resuscitation", title: "Resuscitation", names: ["Ultra-Tech Drugs"], page: 425, group: "injury" },
      // The Revised edition sets it as a box, not a heading of the section.
      { key: "ultraTechDrugs", title: "Ultra-Tech Drugs", names: ["Ultra-Tech Drugs"], page: 425, group: "injury", revisedOnly: true },
    ],
  },
];

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
    const laid = await readPage(open.get(volume), pdfPage(page), { profile: revised ? REVISED : null });
    // Where the page's text block starts, when the book says (`transcription.topMargin`):
    // a page read from its first line down, not from a margin that cuts it off.
    const structured = structureOf(laid, { top: book("basic-set").transcription.topMargin });
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
      // The Revised edition sets a chapter's number in a line of its own ahead of the title.
      if (CHAPTER_NUMBER.test(block.text)) continue;
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
  return { pages: [...pages], page: first, volume: volumeOf(first) };
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
    // The Revised edition's cost lines also read "Variable", "+50% per person", "-5% per -3", "Average", "Hard".
    if (block.kind === "h4" && /^(?:[-+]?\d[\d,]*(\s+or\s+\d+)?\s+points?\b|Variable$|[-+]\d+%|(?:Easy|Average|Hard|Very Hard)$)/i.test(block.text)) {
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
  return MENDS.reduce((text, [from, to]) => text.replace(from, to), out.join("\n\n") + "\n");
}

/**
 * Words broken across a line that the lexicon cannot mend, because the book
 * never prints them whole anywhere else.
 */
const MENDS = [
  [/hatch-ets/g, "hatchets"],
  [/over-takes/g, "overtakes"],
  [/over-heat/g, "overheat"],
  [/hex-byhex/g, "hex-by-hex"],
  [/maneuver-able/g, "maneuverable"],
  [/manage-able/g, "manageable"],
  [/\bunder-taking\b/g, "undertaking"],
  [/\bdoor-way\b/g, "doorway"],
  [/\bhead-lights\b/g, "headlights"],
  [/\bspot-lights\b/g, "spotlights"],
  [/\bswim-wear\b/g, "swimwear"],
  [/\bpoint-less\b/g, "pointless"],
  // A line broken after a slash or a hyphen the book leaves closed: "cf/ hr", "hard- to-hit".
  [/\b(cf|yards|hours|Taste)\/ (hr|second|day|Smell)\b/g, "$1/$2"],
  [/\(Native\)\/ Written/g, "(Native)/Written"],
  [/\bhard- to-hit/g, "hard-to-hit"],
  // Not a broken word: the bold run-in of "-1×HP –" stops at the times sign.
  [/\*\*(-\d+)\*\*×(HP|FP) –/g, "**$1×$2 –**"],
];

/** The corrections for one page of the Revised edition (lib/revised-fixes.mjs). */
function revisedFixed(id, markdown) {
  let text = markdown;
  for (const fix of REVISED_FIXES[id] ?? []) {
    if (fix.append !== undefined) {
      text = text.replace(/\n*$/, "\n\n") + fix.append + "\n";
      continue;
    }
    const at = typeof fix.find === "string" ? text.indexOf(fix.find) : text.search(fix.find);
    if (at === -1) throw new Error(`${id}: the words a fix looks for are not on the page: ${String(fix.find).slice(0, 60)}`);
    text =
      typeof fix.find === "string"
        ? text.replace(fix.find, () => fix.with)
        : text.replace(fix.find, (...m) => (typeof fix.with === "function" ? fix.with(m) : fix.with));
  }
  return text;
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
async function capture(structure, found, { shallow = false, lastPage = null } = {}) {
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

  const flow = await flowOf(structure, volume, page, Math.max(page + 14, lastPage ?? 0));
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
    if (lastPage && block.page > lastPage) break;
    if (block.kind in LEVEL && length > LONGEST && !lastPage) {
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
  // `--register` names another copy of the register, for reading the switches of a later release
  // of the system than the one the submodule is pinned to.
  const source = readFileSync(flag("--register") ?? join(systemRoot, "src", "system", "optional-rules.ts"), "utf8");
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

/** A heading's text as a key: "Damage Resistance and Penetration" is "damageResistanceAndPenetration". */
function keyOf(text) {
  const words = titleCase(text).replace(/[’']/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join("");
}

async function coreRules(structure, registered) {
  // What the switches' pages already hold, by the headings they were found under.
  const taken = new Set();
  for (const rule of registered) {
    for (const name of [titleOf(rule.key), ...(ALIASES[rule.key] ?? []), ...(SECTIONS[rule.key] ?? [])]) taken.add(norm(name));
  }
  const rules = [];
  const used = new Set(registered.map((r) => r.key));
  for (const chapter of CORE) {
    const headings = [];
    for (let page = chapter.from; page <= chapter.to; page++) {
      const s = await structure(volumeOf(page), page);
      if (!s) continue;
      for (const block of s.blocks) {
        // The Revised edition's chapter number, and the "and" of a chapter's title set over three lines.
        if (CHAPTER_NUMBER.test(block.text) || (revised && block.text === "And")) continue;
        if (block.kind === "h1" || block.kind === "h2") headings.push({ ...block, page });
      }
    }
    headings.forEach((h, i) => {
      const name = titleCase(h.text);
      if (taken.has(norm(name)) && !(chapter.distinct ?? []).includes(name)) return;
      if ((chapter.covered ?? []).includes(name)) return;
      // A first-level section with second-level sections under it has a page
      // of its own for the text before them: Sense Rolls says what a Sense roll is.
      const intro = h.kind === "h1" && headings[i + 1]?.kind === "h2";
      const parent = h.kind === "h2" ? headings.slice(0, i).reverse().find((x) => x.kind === "h1") : h;
      // Two chapters can name a section alike -- Melee Attacks in Combat and in
      // Tactical Combat -- so the later one's key and title carry its chapter.
      let key = keyOf(h.text);
      let title;
      if (used.has(key) && chapter.chapter) {
        key = keyOf(`${h.text} in ${chapter.chapter}`);
        title = `${titleCase(h.text)} (${chapter.chapter})`;
      }
      if (used.has(key)) throw new Error(`Two rules share the key "${key}".`);
      used.add(key);
      rules.push({
        key,
        title,
        reference: `Basic Set: Campaigns p. ${h.page}`,
        group: chapter.folder(titleCase(parent?.text ?? "")),
        names: [titleCase(h.text)],
        core: true,
        shallow: intro || (chapter.intros ?? []).includes(titleCase(h.text)),
      });
    });
  }
  for (const chapter of CORE) {
    for (const extra of chapter.extra ?? []) {
      // The Revised layout finds a heading the 2004 one lost; the section is already a rule.
      if (extra.revisedOnly && !revised) continue;
      if (revised && used.has(extra.key)) continue;
      if (used.has(extra.key)) throw new Error(`Two rules share the key "${extra.key}".`);
      used.add(extra.key);
      rules.push({
        key: extra.key,
        title: extra.title,
        reference: `Basic Set: Campaigns p. ${extra.page}`,
        group: extra.group ?? chapter.folder(extra.title),
        names: extra.names,
        core: true,
      });
    }
  }
  return rules;
}

// ---------------------------------------------------------------------------
// The Revised edition's addenda
// ---------------------------------------------------------------------------

/**
 * The switch each addendum section describes, by the section's printed page
 * and its title. A switch's flag goes on the one page that defines it: the
 * Rules settings page shows a single link to a switch and takes the first
 * entry it finds (GWorldVTT #189), so a second page flagged for the same
 * switch would only make that link ambiguous.
 */
const ADDENDA_RULES = {
  "327 Heroic Archer": "heroicArcher",
  "333 Bonuses for Wildcard Skills": "wildcardBonus",
  "334 Close Combat": "closeCombatAnyWeapon",
  "337 Pulling Rank": "pullingRank",
  "342 Flat-Cost Signature Gear": "flatSignatureGear",
  "566 Additional Hit Locations": "finerHitLocations",
  "571 Expanded Influence Rolls": "expandedInfluence",
  "571 Extra Effort with Powers": "powerExtraEffort",
  "572 Godlike Extra Effort": "godlikeExtraEffort",
  "572 Trading Fatigue for Skill": "fatigueForSkill",
  "572 Humping, Tramping, and Yomping": "realisticMarching",
  "572 Stress and Derangement": "stressAndDerangement",
  "573 Stress": "stressRollPenalties",
  "573 Derangement": "derangementRollPenalties",
  "573 Terrain Types Redux": "terrainTypes",
  "574 Vision Rolls in Combat": "visionRollsInCombat",
  "575 All-Out Attack with Slams": "allOutSlams",
  "575 All-Out Concentrate": "allOutConcentrate",
  "575 All-Out Defense (Mental Defense)": "mentalDefense",
  "575 Committed Attack": "committedAttack",
  "576 Defensive Attack": "defensiveAttack",
  "576 Close-Contact Shots": "closeContactShots",
  "577 Tricky Shooting": "trickyShooting",
  "577 Simplified Range": "simplifiedRange",
  "577 Piercing and Impaling Damage vs Large Targets": "largeTargetDamage",
  "577 Restricted Dodge Against Firearms": "restrictedDodge",
  "578 Basic Abstract Difficulty": "basicAbstractDifficulty",
  "578 Simplified Resources": "simplifiedResources",
};

/**
 * Sections of the addenda that the layout reader cannot give as pages: a box
 * it takes for a table, or a heading it loses. Each is written by hand under
 * `journals-by-hand` from `pdftotext -raw`, found by its id.
 */
const ADDENDA_HAND = [
  { id: "addendum3ChestAndAbdomen", title: "Chest and Abdomen", addendum: "addendum-3", page: 566, rule: "chestAbdomenSplit" },
  { id: "addendum3MissingHitLocations", title: "Missing Hit Locations", addendum: "addendum-3", page: 566, rule: null },
  { id: "addendum4Frostbite", title: "Frostbite", addendum: "addendum-4", page: 574, rule: "frostbite" },
  { id: "addendum4HittingEmWhereItHurts", title: "Hitting ’Em Where It Hurts", addendum: "addendum-4", page: 576, rule: "partialCoverage" },
  { id: "addendum4NonCombatBonuses", title: "Non-Combat Bonuses", addendum: "addendum-4", page: 576, rule: "nonCombatBonuses" },
  // What each addendum says before its first heading, and the boxes and tables beside its sections.
  { id: "addendum1Introduction", title: "Addendum 1: Traits and Techniques", addendum: "addendum-1", page: 324, rule: null },
  { id: "addendum1SelfControlNA", title: "Self-Control “N/A”", addendum: "addendum-1", page: 328, rule: null },
  { id: "addendum2Introduction", title: "Addendum 2: Organizations and Gear", addendum: "addendum-2", page: 337, rule: null },
  { id: "addendum2PatronToRankTables", title: "Patron-to-Rank and Rank-to-Patron Tables", addendum: "addendum-2", page: 338, rule: null },
  { id: "addendum2AssistanceRollsTable", title: "Assistance Rolls Table", addendum: "addendum-2", page: 339, rule: null },
  { id: "addendum2PrivilegeVsAssistance", title: "Privilege vs. Assistance", addendum: "addendum-2", page: 340, rule: null },
  { id: "addendum2TechLevelAndSkillAvailability", title: "Tech Level and Skill Availability", addendum: "addendum-2", page: 341, rule: null },
  { id: "addendum4Introduction", title: "Addendum 4: Tasks and Combat", addendum: "addendum-4", page: 570, rule: null },
  { id: "addendum4BatteriesAndPowerCells", title: "Batteries and Power Cells", addendum: "addendum-4", page: 578, rule: null },
];

/**
 * Sections the layout reader finds that are not sections: the titles of the two tables in the
 * Batteries and Power Cells box, which the reader takes for headings.
 */
const ADDENDA_NOT_SECTIONS = new Set(["addendum4BatteriesTl68", "addendum4PowerCellsTl9"]);

/**
 * Boxes the Revised edition adds to pages it kept, which no heading of the 2004 layout has a page
 * for: written by hand under `journals-by-hand` from `pdftotext -raw`. (Deceptive Attack's note
 * and Turn Sequence's box sit in the text of the pages already there.)
 */
const REVISED_NEW_PAGES = [
  { id: "movementPointCosts", title: "Movement Point Costs", chapter: "Combat", page: 387 },
  { id: "meleeAttackModifiers", title: "Melee Attack Modifiers", chapter: "Combat", page: 547 },
];

/** Whether a register entry belongs to an addendum, whose pages are built from the section list below. */
function inAddendum(rule) {
  if (!/^Basic Set Revised/.test(rule.reference)) return false;
  const first = locate(rule.reference)?.page;
  return first !== undefined && addendumOf(first) !== null;
}

/**
 * The pages of one addendum, one to a section.
 *
 * A second-level section that has third-level sections under it has a page of
 * its own for the words before them, and so does a first-level one; a
 * third-level section is a page whole, with any fourth-level parts. So a page
 * is one heading's own words and the parts below it that have no page of
 * their own. Addendum 3 has no headings but its title, so its page is the
 * chapter's own text.
 */
async function addendumPages(structure, addendum) {
  const flow = await flowOf(structure, "revised", addendum.first, addendum.last);
  const outline = flow.blocks.filter((b) => b.kind in LEVEL);
  const found = (block) => ({ type: "heading", volume: "revised", page: block.page, block });
  const pages = [];

  for (const [i, block] of outline.entries()) {
    const level = LEVEL[block.kind];
    // A cost line ("3 points/level") set as a heading belongs to the entry above it.
    if (level === 4) continue;
    if (level === 0 && addendum.id !== "addendum-3") continue;
    const next = outline[i + 1];
    // Addendum 3's title has a third-level section under it and no first- or second-level ones.
    const hasChildren = Boolean(next) && (LEVEL[next.kind] === level + 1 || level === 0) && level <= 2;
    const got = await capture(structure, found(block), { shallow: hasChildren, lastPage: addendum.last });
    if (!got || got.blocks.length === 0) continue;
    const title = level === 0 ? "Additional Hit Locations" : titleCase(block.text).replace(/\*$/, "");
    pages.push({ title, page: block.page, got, level, intro: hasChildren });
  }
  return pages;
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
  const volume = volumeOf(page);
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

/** The addenda as journal pages, and what the register expects them to answer for. */
async function addendaAsPages(structure, decisions) {
  const out = [];
  const seen = new Set();
  const handDir = join(book("basic-set").dir, "journals-by-hand");
  const push = (page) => {
    if (seen.has(page.rule.key)) throw new Error(`Two addendum pages share the id "${page.rule.key}".`);
    seen.add(page.rule.key);
    out.push(page);
  };
  const flagged = new Set();

  for (const addendum of ADDENDA) {
    const number = addendum.id.slice(-1);
    for (const p of await addendumPages(structure, addendum)) {
      const id = `addendum${number}${keyOf(p.title).replace(/^./, (c) => c.toUpperCase())}`;
      if (ADDENDA_NOT_SECTIONS.has(id)) continue;
      const handFile = join(handDir, `${id}.md`);
      const byHand = existsSync(handFile);
      const markdown = byHand ? readFileSync(handFile, "utf8").replace(/\r\n/g, "\n") : revisedFixed(id, render(p.got.blocks, p.got.base));
      const why = byHand ? [] : doubts(markdown, p.got).filter((doubt) => !((p.intro || markdown.trim().length < 40) && doubt === "very short"));
      const read = byHand ? null : decisions.get(id);
      if (read) why.push(`read and found wanting: ${read}`);
      const cited = p.got.endPage > p.page ? `${p.page}-${p.got.endPage}` : `${p.page}`;
      const rule = ADDENDA_RULES[`${p.page} ${p.title}`] ?? null;
      if (rule) flagged.add(rule);
      push({
        rule: { key: id, group: addendum.title, core: true },
        chapter: addendum.title,
        title: p.title,
        volume: "revised",
        pagesCited: cited,
        reference: `Basic Set Revised p${cited.includes("-") ? "p" : ""}. ${cited}`,
        ruleFlag: rule,
        markdown,
        why,
        via: "addendum",
      });
    }
  }

  for (const hand of ADDENDA_HAND) {
    const handFile = join(handDir, `${hand.id}.md`);
    if (!existsSync(handFile)) {
      console.log(`  addenda: ${hand.id} needs journals-by-hand/${hand.id}.md, written from the raw text of p. ${hand.page}`);
      continue;
    }
    if (hand.rule) flagged.add(hand.rule);
    const addendum = ADDENDA.find((a) => a.id === hand.addendum);
    push({
      rule: { key: hand.id, group: addendum.title, core: true },
      chapter: addendum.title,
      title: hand.title,
      volume: "revised",
      pagesCited: String(hand.page),
      reference: `Basic Set Revised p. ${hand.page}`,
      ruleFlag: hand.rule,
      markdown: readFileSync(handFile, "utf8").replace(/\r\n/g, "\n"),
      why: [],
      via: "addendum",
    });
  }

  for (const extra of REVISED_NEW_PAGES) {
    const handFile = join(handDir, `${extra.id}.md`);
    if (!existsSync(handFile)) {
      console.log(`  new page: ${extra.id} needs journals-by-hand/${extra.id}.md, written from the raw text of p. ${extra.page}`);
      continue;
    }
    push({
      rule: { key: extra.id, group: extra.chapter.toLowerCase(), core: true },
      chapter: extra.chapter,
      title: extra.title,
      volume: "revised",
      pagesCited: String(extra.page),
      markdown: readFileSync(handFile, "utf8").replace(/\r\n/g, "\n"),
      why: [],
      via: "new box",
    });
  }

  // Every switch the register points into an addendum has a page that answers for it.
  // Two switches share their section with another: Expanded Influence's critical option is a note under
  // its table, and the clock is how Stress and Derangement bleed off, on the pages of those two sections.
  const shared = new Set(["expandedInfluenceCritical", "mentalOnTheClock"]);
  const unanswered = registeredRules().filter((rule) => inAddendum(rule) && !flagged.has(rule.key) && !shared.has(rule.key));
  if (unanswered.length) console.log(`  addenda: no page for ${unanswered.map((r) => r.key).join(", ")}`);
  return out;
}

async function main() {
  revised = Boolean(flag("--revised"));
  const paths = revised
    ? { revised: flag("--revised") }
    : { characters: flag("--characters"), campaigns: flag("--campaigns") };
  if (Object.values(paths).some((path) => !path || !existsSync(path))) {
    console.error(
      "Usage: node tools/rules.mjs --characters <pdf> --campaigns <pdf> [--write] [--reviewed]\n" +
        "       node tools/rules.mjs --revised <Basic Set Revised pdf> [--write] [--reviewed]",
    );
    process.exit(1);
  }
  useLexicon(await lexiconOf(Object.values(paths)));
  const structure = library(paths);

  if (flag("--headings")) {
    await listHeadings(structure, flag("--headings"));
    return;
  }

  const write = process.argv.includes("--write");
  const reviewed = process.argv.includes("--reviewed");
  const decisions = readingDecisions();
  const registered = registeredRules();
  // The addenda's switches are pages built from the addenda's own sections, below.
  // A switch for a table's own option (the book raises attributes with earned points only) has no page to give.
  const noPage = new Set(["studyAttributes"]);
  const rules = [...registered.filter((rule) => !inAddendum(rule) && !noPage.has(rule.key)), ...(await coreRules(structure, registered))];
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
      found = await find(structure, rule, rule.names ?? null);
      captured = found ? await capture(structure, found, { shallow: SHALLOW.has(rule.key) || Boolean(rule.shallow), lastPage: WHOLE[rule.key] ?? null }) : null;
      if (captured) markdown = render(captured.blocks, captured.base);
    }

    const handFile = join(book("basic-set").dir, "journals-by-hand", `${rule.key}.md`);
    const byHand = existsSync(handFile);
    // A section found whose words the page sets as sidebars -- Injuries opens
    // its chapter that way -- captures nothing, and its hand page stands in.
    if (!captured || (captured.blocks.length === 0 && !(found && byHand))) {
      missing.push(rule);
      continue;
    }
    // What the Revised layout gives for a page kept by hand, to read the hand page against.
    if (byHand && revised && markdown) {
      const compare = join(buildRoot, "recapture", "revised-by-hand");
      mkdirSync(compare, { recursive: true });
      writeFileSync(join(compare, `${rule.key}.md`), markdown, "utf8");
    }
    if (byHand) markdown = readFileSync(handFile, "utf8").replace(/\r\n/g, "\n");
    else if (revised) markdown = revisedFixed(rule.key, markdown);
    // A section's opening words before its subsections, which have pages of
    // their own, can be a single sentence: Special Movement.
    const why = byHand ? [] : doubts(markdown, captured).filter((doubt) => !(rule.shallow && doubt === "very short"));
    const read = byHand ? null : decisions.get(rule.key);
    if (read) why.push(`read and found wanting: ${read}`);
    const endPage = captured.endPage;
    const pagesCited = endPage > found.page ? `${found.page}-${endPage}` : `${found.page}`;
    pages.push({
      rule,
      title: rule.title ?? titleCase(captured.title).replace(/\/([a-z])/g, (m, c) => "/" + c.toUpperCase()),
      volume: found.volume,
      pagesCited,
      markdown,
      why,
      via: found.type,
    });
  }

  if (revised) pages.push(...(await addendaAsPages(structure, decisions)));

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
      chapter: page.chapter ?? page.rule.group.charAt(0).toUpperCase() + page.rule.group.slice(1),
      pages: `B${page.pagesCited}`,
      reference: page.reference ?? `Basic Set: ${citedVolume(Number.parseInt(page.pagesCited, 10))} p${page.pagesCited.includes("-") ? "p" : ""}. ${page.pagesCited}`,
      rule: page.ruleFlag !== undefined ? page.ruleFlag : page.rule.core ? null : page.rule.key,
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
