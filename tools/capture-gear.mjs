/**
 * Drafts equipment records from a book's gadget entries, for a person to check.
 *
 * Ultra-Tech prints most of its gear in no data file, but prints every gadget
 * the same way: a label carrying its tech level, what it does, and a closing
 * line with the price, the weight, the cells and how long they last, and the
 * legality class --
 *
 *     Pocket Medic (TL9): A palm-sized diagnostic unit ... $1,200, 1 lb.,
 *     B/10 hr. LC4.
 *
 * either run into the text ("Name (TL9): ...") or as a heading of its own
 * ("Automed (TL9)"), with the closing line where the gadget's text ends. That
 * line holds everything a record needs, so this reads it off each entry in a
 * range of pages and writes one equipment record per gadget.
 *
 * Nothing is guessed. An entry without a price and a legality class is not a
 * gadget this can read, and is reported rather than recorded. A name some pack
 * of the book already holds is left alone, since the data file's record wins.
 * A quality bonus to a skill ("+2 (quality) to First Aid") becomes the item's
 * grade and the skills it is the tools of; an intrinsic bonus is left to the
 * text. Each record cites the page its label is on.
 *
 * What comes out is a draft: every record is read against its page, and what
 * reading settles goes into book.json's `capture` rules (`skip` and `set`), not into the output.
 *
 * Usage:
 *   node tools/capture-gear.mjs <book> --pdf <file> --pages 170-221 --file <name> [--write]
 *
 * `--file` names the output in `packs-src/equipment/`, "<book>-<name>.json".
 * Nothing is written without `--write`; the dry run prints every record.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { book, projectRoot, statisticsDir, systemRoot } from "./lib/books.mjs";
import { readPower } from "./lib/power-cells.mjs";

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

/**
 * The book, one string per page, read one of two ways.
 *
 * Neither is right everywhere. Reading order (the cache tools/transcribe.mjs
 * keeps) can run a table's rows into the paragraph beside it, so a row's
 * "$3,000 ... LC4" reads as that paragraph's price; the order the PDF stores
 * its text keeps tables apart but can put a sidebar's lines inside a paragraph.
 * So the gear is read both ways, and a record the two disagree on is marked for
 * a person to settle against the page.
 */
function pagesOf(pdf, stored = false) {
  const prefix = stored ? "raw-pages-" : "pages-";
  const cache = join(projectRoot, "extracted", prefix + pdf.replace(/\W+/g, "-").slice(-60) + ".json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const result = spawnSync("pdftotext", [...(stored ? ["-raw"] : []), pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`pdftotext failed on ${pdf}.`);
  const pages = result.stdout.split("\f");
  mkdirSync(join(projectRoot, "extracted"), { recursive: true });
  writeFileSync(cache, JSON.stringify(pages), "utf8");
  return pages;
}

/** A tech level as the book prints it in a label: "TL9", "TL10^", "TL9-12". */
const TECH_LEVEL = String.raw`TL\s?\d+\^?(?:[-/]\d+\^?)?`;

/** A tech level alone on a line, the rest of a heading the column broke. */
const TECH_LEVEL_ALONE = new RegExp(String.raw`^\(${TECH_LEVEL}\)$`);

/** A size label that names nothing without its family: "Large", "Very Large". */
const SIZE = /^(Very Large|Large|Medium|Small|Tiny|Micro|Mini)$/;

/**
 * A gadget's label: a capitalised name, any parentheticals, and its tech level
 * in parentheses. Followed by a colon it runs into its text; alone on a line it
 * is a heading.
 */
const LABEL = new RegExp(String.raw`^((?:LC\d\.\s+)?[A-Z0-9"][^:()]{1,60}?(?:\s\([^)]*\))*?)\s\((${TECH_LEVEL})\)(:\s*|$)`);

/** Where a line starts another gadget partway through: after a sentence ends. */
const LABEL_INSIDE = new RegExp(String.raw`(?<=[.!?)]\s)(?=[A-Z][^:()]{1,60}?(?:\s\([^)]*\))*?\s\(${TECH_LEVEL}\):\s)`, "g");

/** A running head or folio. */
const FURNITURE = /^([A-Z][A-Z ,'&-]{3,}|\d{1,3})$/;

/**
 * The closing line: a price, what follows it, and the legality class.
 * "$1,200, 1 lb., B/10 hr. LC4." The last price before the class is the one.
 */
const CLOSING = /(\+?\$[\d,]+(?:\.\d+)?(?:\s+million)?)([^$]{0,160}?)\bLC\s?(\d)\.?/g;

/**
 * A closing line with no legality class, which some gadgets print: "$20, 2 lbs."
 * or "$150 per dose". Only a price followed by a weight or a unit counts, so a
 * price mentioned in passing is not taken for the gadget's.
 */
const BARE_CLOSING = /(\+?\$[\d,]+(?:\.\d+)?(?:\s+million)?)((?:,\s*(?:neg\.|negligible|[\d,./]+\s*lbs?\.?)[^$.]{0,60}|\s+per\s+(?:dose|square foot|yard))[^$]{0,20}?)(?:\.|$)/g;

/** A price: "$1,200", "$0.50", "$10 million". */
function priceOf(text) {
  const million = /million/.test(text) ? 1_000_000 : 1;
  return Number(text.replace(/million|[+$,\s]/g, "")) * million;
}

/** A weight: "1 lb.", "0.5 lbs.", "1/8 lb.", "neg.", "negligible weight". */
function weightOf(text) {
  if (/\bneg(?:\.|ligible)/i.test(text)) return { weight: 0 };
  const fraction = /\b(\d+)\/(\d+)\s*lbs?\b/i.exec(text);
  if (fraction) return { weight: Number(fraction[1]) / Number(fraction[2]) };
  const m = /([\d,]*\.?\d+)\s*lbs?\b/i.exec(text);
  return m ? { weight: Number(m[1].replace(/,/g, "")) } : null;
}

/** Cells and endurance: "B/10 hr.", "2C/20 hr", "D/1 week". */
function powerIn(text) {
  const m = /(\d*\s*(?:AA|[A-F]))\s*\/\s*([\d,.]+\s*(?:hrs?|hours?|min(?:utes?)?|days?|weeks?|wks?|months?|mon|years?|yrs?|seconds?|uses|s)\.?)/i.exec(text);
  if (!m) return null;
  return readPower(`${m[1].replace(/\s+/g, "")}/${m[2]}`);
}

/** The grade a printed quality bonus is (Basic Set p. 345), and whether it maps exactly. */
function gradeOf(bonus) {
  if (/TL\/2/i.test(bonus)) return { grade: "best", exact: true };
  const n = Number(bonus);
  if (n === 1) return { grade: "good", exact: true };
  if (n === 2) return { grade: "fine", exact: true };
  // The grades stop at +2 below "best" (+TL/2, at least +2), so a +3 is never
  // written up to best: it is fine, and marked for a person to see.
  if (n === 3) return { grade: "fine", exact: false };
  if (n >= 4) return { grade: "best", exact: false };
  return null;
}

function ident(slug, name) {
  return createHash("sha1").update(`${slug}:equipment:${name}`).digest("hex").slice(0, 16);
}

/** Every name the book's packs already hold, the data file's and those kept by hand. */
function namesHeld(bk) {
  const held = new Set();
  const root = statisticsDir(bk);
  for (const pack of readdirSync(root)) {
    const dir = join(root, pack);
    if (!existsSync(dir) || !readdirSync(dir).length) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      if (file === `${bk.slug}-${flag("--file")}.json`) continue;
      for (const record of JSON.parse(readFileSync(join(dir, file), "utf8"))) held.add(key(record.name));
    }
  }
  return held;
}

function key(name) {
  return normalise(name).replace(/\s*\(TL\s?\d+\)$/i, "").toLowerCase();
}

/** The Basic Set's skill names, longest first, for reading what a quality bonus is to. */
function skillNames() {
  const out = new Set();
  const dir = join(systemRoot, "packs-src", "skills");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const record of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
      // "First Aid/TL" is printed "First Aid".
      if (record.type === "skill") out.add(record.name.replace(/\s*\(.*\)$/, "").replace(/\/TL$/, ""));
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** The gadget entries on a run of pages, each with its label's page. */
function entriesOn(pages, from, to, offset) {
  const entries = [];
  let current = null;
  let family = null;
  for (let page = from; page <= to; page++) {
    const lines = (pages[page + offset - 1] ?? "")
      .split("\n")
      .map(normalise)
      .filter((line) => line && !FURNITURE.test(line))
      .flatMap((line) => line.split(LABEL_INSIDE))
      // A heading too long for its column puts its tech level on a line of its
      // own: "Gravity-Ripple Communicators" / "(TL10^/11^)".
      .reduce((out, line) => {
        const previous = out[out.length - 1];
        if (previous && TECH_LEVEL_ALONE.test(line) && previous.length < 60 && !/[.!?:;,]$/.test(previous)) {
          out[out.length - 1] = `${previous} ${line}`;
        } else {
          out.push(line);
        }
        return out;
      }, []);
    for (const line of lines) {
      const m = LABEL.exec(line);
      if (m && !/points\)/.test(m[1])) {
        if (current) entries.push(current);
        let name = normalise(m[1].replace(/^LC\d\.\s+/, ""));
        // Sizes listed under a family heading -- "Radio Communicators" then
        // "Large (TL9): ..." -- are named for the family.
        if (SIZE.test(name) && family) name = `${family.replace(/(?<!s)s$/, "")} (${name})`;
        current = {
          name,
          tl: m[2].replace(/^TL\s?/, ""),
          page,
          heading: m[3] === "",
          text: line.slice(m[0].length),
        };
        if (current.heading && !SIZE.test(name)) family = name;
        continue;
      }
      // Stored order breaks lines where the page does: "sepa-" / "rating".
      if (current) current.text = /[a-z]-$/.test(current.text) && /^[a-z]/.test(line) ? current.text.slice(0, -1) + line : `${current.text} ${line}`;
    }
  }
  if (current) entries.push(current);
  return entries;
}

/** A record from one entry, or the reason there is none. */
function recordOf(entry, bk, skills) {
  const notes = [];
  let closings = [...entry.text.matchAll(CLOSING)];
  if (!closings.length) {
    closings = [...entry.text.matchAll(BARE_CLOSING)];
    if (closings.length) notes.push("no LC printed");
  }
  if (!closings.length) return { skip: "no price" };
  const close = closings[0];
  const cost = priceOf(close[1]);
  const after = close[2];
  const weight = weightOf(after);
  const power = powerIn(after);
  const lc = close[3] === undefined ? null : Number(close[3]);
  const text = entry.text.slice(0, close.index + close[0].length);

  // A multi-level TL ("TL9-12") is the first level the gadget exists at.
  // "TL10/11^" is TL10, superscience from TL11: the first level stands. In a
  // range, "TL11-12^", the mark is the whole range's.
  const range = /^(\d+)\^?-\d+\^$/.exec(entry.tl);
  const tl = range ? `${range[1]}^` : entry.tl.replace(/[-/]\d+\^*$/, "").replace(/\^+/, "^");
  if (close[1].startsWith("+")) notes.push("price is an addition to something else");
  if (/^\s*(?:per|\/)/i.test(after)) notes.push(`price is per unit: "${after.trim().split(/[,.]/)[0]}"`);
  if (!weight) notes.push("no weight read");
  if (closings.length > 1) notes.push(`${closings.length} closing lines: variants or options follow`);

  let equipmentQuality = "basic";
  const forSkills = [];
  const quality = /\+(\d+|TL\/2)\s*\(quality\)/i.exec(text);
  if (quality) {
    const grade = gradeOf(quality[1]);
    if (grade) {
      equipmentQuality = grade.grade;
      if (!grade.exact) notes.push(`+${quality[1]} (quality) has no exact grade`);
    }
    // What the bonus is to: the clause around it, up to the next clause. "First
    // Aid using bandage spray receives a +2 (quality) bonus to skill" names it
    // before; "+2 (quality) bonus to First Aid skill and counts as improvised
    // equipment for Surgery" names it after, and Surgery is another clause.
    const start = Math.max(0, text.lastIndexOf(".", quality.index) + 1);
    const tail = text.slice(quality.index);
    const end = quality.index + (/[.;]|,\s|\sand\s(?!HT)|\sbut\s/.exec(tail.slice(12))?.index ?? tail.length) + 12;
    const clause = text.slice(start, end);
    for (const skill of skills) {
      if (new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(clause) && !forSkills.some((s) => s.includes(skill))) {
        forSkills.push(skill);
      }
    }
    if (!forSkills.length) notes.push("quality bonus to no skill read");
  }

  const perDose = /^\s*per\s+dose/i.test(after);
  const category = perDose ? "consumable" : quality ? "tool" : "misc";
  const system = {
    quantity: 1,
    weight: weight?.weight ?? 0,
    cost,
    carried: true,
    equipped: false,
    tl,
    lc,
    costOfLivingPercent: 0,
    description: "",
    reference: `${bk.reference} p. ${entry.page}`,
    category,
    equipmentQuality,
    forSkills,
    quality: "good",
    material: "",
    weaponClass: "",
    listCost: cost,
    hpLost: 0,
    meleeModes: [],
    rangedModes: [],
  };
  if (power) system.extensions = { "gurps-compendium-content": { power: { draw: power } } };
  return {
    record: { _id: ident(bk.slug, entry.name), name: entry.name, type: "equipment", system },
    closing: close[0],
    notes,
  };
}

function main() {
  const slug = process.argv[2];
  const pdf = flag("--pdf");
  const range = /^(\d+)-(\d+)$/.exec(flag("--pages", ""));
  const file = flag("--file");
  if (!slug || !pdf || !range || !file) {
    console.error("Usage: node tools/capture-gear.mjs <book> --pdf <file> --pages 170-221 --file <name> [--write]");
    process.exit(1);
  }
  const bk = book(slug);
  const held = namesHeld(bk);
  const skills = skillNames();
  const offset = Number(bk.transcription.pdfOffset ?? 0);
  const [from, to] = [Number(range[1]), Number(range[2])];
  // Names the book prints as gadgets but that are something the packs already
  // hold under another name, or no gadget: book.json's `capture.skip`.
  const skip = (bk.capture?.skip ?? []).map((rule) => new RegExp(rule.pattern));

  // The same entries read in stored order, to check each record against.
  const stored = new Map();
  for (const entry of entriesOn(pagesOf(pdf, true), from, to, offset)) {
    const out = recordOf(entry, bk, skills);
    if (out.record && !stored.has(key(entry.name))) stored.set(key(entry.name), out.record.system);
  }

  const records = [];
  const seen = new Set();
  let skipped = 0;
  for (const entry of entriesOn(pagesOf(pdf), from, to, offset)) {
    if (held.has(key(entry.name)) || seen.has(key(entry.name))) continue;
    if (skip.some((pattern) => pattern.test(entry.name))) continue;
    const out = recordOf(entry, bk, skills);
    if (out.record) {
      // What reading the page settled that the closing line could not say:
      // book.json's `capture.set`, each a name pattern, fields by path, a reason.
      for (const rule of bk.capture?.set ?? []) {
        if (!new RegExp(rule.pattern).test(entry.name)) continue;
        for (const [path, value] of Object.entries(rule.set)) {
          const parts = path.split(".");
          let at = out.record;
          for (const part of parts.slice(0, -1)) at = at[part] ??= {};
          at[parts.at(-1)] = value;
        }
        out.notes = [];
      }
      const other = stored.get(key(entry.name));
      const s = out.record.system;
      if (!other) out.notes.push("not read in stored order");
      else if (other.cost !== s.cost || other.lc !== s.lc || other.weight !== s.weight) {
        out.notes.push(`stored order reads $${other.cost}, ${other.weight} lb, LC${other.lc}`);
      }
    }
    if (out.skip) {
      skipped++;
      console.log(`  -  p.${entry.page} ${entry.name} (TL${entry.tl}): ${out.skip}`);
      // --why shows what the entry holds, to tell a gadget priced in a table from a mis-read.
      // Any price in it is shown too, since a table's price is often far down.
      if (process.argv.includes("--why")) {
        const prices = [...entry.text.matchAll(/.{0,80}\$[\d,]+.{0,60}/g)].map((m) => ` [${m[0]}]`).join("");
        console.log(`       ${entry.text.slice(0, 400)}${prices}`);
      }
      continue;
    }
    seen.add(key(entry.name));
    records.push(out.record);
    const s = out.record.system;
    const power = s.extensions?.["gurps-compendium-content"]?.power?.draw?.raw ?? "";
    console.log(
      `  +  p.${entry.page} ${entry.name} | TL${s.tl} $${s.cost} ${s.weight} lb ${power} LC${s.lc} ${s.category}` +
        (s.equipmentQuality !== "basic" ? ` ${s.equipmentQuality} [${s.forSkills.join(", ")}]` : "") +
        ` | "${out.closing}"` +
        (out.notes.length ? ` !! ${out.notes.join("; ")}` : ""),
    );
  }
  console.log(`\n${records.length} records, ${skipped} entries without a closing line.`);
  if (!process.argv.includes("--write")) {
    console.log("Nothing written. Add --write.");
    return;
  }
  const target = join(statisticsDir(bk), "equipment", `${slug}-${file}.json`);
  writeFileSync(target, JSON.stringify(records, null, 2) + "\n", "utf8");
  console.log(`Wrote ${target}`);
}

main();
