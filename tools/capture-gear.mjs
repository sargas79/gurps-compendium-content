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
 * Other books print their gear the same way with their own marks: High-Tech
 * ends a label with a period, prints its own battery sizes ("2×S/5 hrs."), and
 * prints one name at several TLs. book.json's `capture` says how a book prints
 * it (`labelEnd`, `cellSizes`, `runInHeadings`, `repeatsByTl`); the reading
 * is in tools/lib/capture.mjs, and a book that says nothing reads as
 * Ultra-Tech.
 *
 * A book's other volumes (book.json's `sources`, tools/lib/sources.mjs) are read
 * with `--source <id>`: that volume's PDF offset, reference and `capture`
 * settings stand in for the book's, each record cites the volume, and its id
 * hashes the volume in. A name the volume's own records hold is left alone as
 * above; a name only the book's own records hold is looked up in the volume's
 * overlap file, and captured only where the decision there is "keep" -- the
 * volume prints it with other statistics (private #471, E2). An undecided one
 * is reported, not recorded. A near-duplicate the file lists under this
 * volume's own name is left out where the decision is "skip".
 *
 * What comes out is a draft: every record is read against its page, and what
 * reading settles goes into book.json's `capture` rules (`skip` and `set`), not into the output.
 * A `set` rule's new name is the one checked against the packs, so a record a
 * rule renames may share its printed name with one kept by hand.
 *
 * Usage:
 *   node tools/capture-gear.mjs <book> --pdf <file> --pages 170-221 --file <name> [--write]
 *   node tools/capture-gear.mjs high-tech --source ee --pdf <file> --pages 10-15 --file ee-laboratory [--write]
 *
 * `--file` names the output in `packs-src/equipment/`, "<book>-<name>.json".
 * Nothing is written without `--write`; the dry run prints every record.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { book, projectRoot, statisticsDir, systemRoot } from "./lib/books.mjs";
import { captureSettings, entriesOn, key, nameRepeats, normalise, recordKey, recordOf } from "./lib/capture.mjs";
import { inSource, readOverlap, withSource } from "./lib/sources.mjs";

function flag(name, fallback = null) {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
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

/**
 * Every name the book's packs already hold, the data file's and those kept by
 * hand: `held`, the names of the volume being read, and `others`, those of the
 * book's other volumes, each with the name as its record has it.
 */
function namesHeld(bk) {
  const held = new Set();
  const others = new Map();
  const root = statisticsDir(bk);
  for (const pack of readdirSync(root)) {
    const dir = join(root, pack);
    if (!existsSync(dir) || !readdirSync(dir).length) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      if (file === `${bk.slug}-${flag("--file")}.json`) continue;
      for (const record of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
        if (inSource(bk, record)) {
          held.add(key(record.name));
        } else {
          others.set(normalise(record.name).toLowerCase(), record.name);
          if (!others.has(key(record.name))) others.set(key(record.name), record.name);
        }
      }
    }
  }
  return { held, others };
}

/** The E2 decisions of the volume being read, from its overlap file, or none. */
function overlapOf(bk) {
  if (!bk.source?.overlap) return new Map();
  const path = join(bk.dir, bk.source.overlap);
  return existsSync(path) ? readOverlap(readFileSync(path, "utf8")) : new Map();
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

function main() {
  const slug = process.argv[2];
  const pdf = flag("--pdf");
  const range = /^(\d+)-(\d+)$/.exec(flag("--pages", ""));
  const file = flag("--file");
  if (!slug || !pdf || !range || !file) {
    console.error("Usage: node tools/capture-gear.mjs <book> --pdf <file> --pages 170-221 --file <name> [--write]");
    process.exit(1);
  }
  const bk = withSource(book(slug), flag("--source"));
  const { held, others } = namesHeld(bk);
  const overlap = overlapOf(bk);
  const skills = skillNames();
  const settings = captureSettings(bk.capture);
  const offset = Number(bk.transcription.pdfOffset ?? 0);
  const [from, to] = [Number(range[1]), Number(range[2])];
  // Names the book prints as gadgets but that are something the packs already
  // hold under another name, or no gadget: book.json's `capture.skip`.
  const skip = (bk.capture?.skip ?? []).map((rule) => new RegExp(rule.pattern));

  // The same entries read in stored order, to check each record against.
  const stored = new Map();
  for (const entry of nameRepeats(entriesOn(pagesOf(pdf, true), from, to, offset, settings), settings)) {
    const out = recordOf(entry, bk, skills, settings);
    if (out.record && !stored.has(recordKey(entry, settings))) stored.set(recordKey(entry, settings), out.record.system);
  }

  /** The name the last `capture.set` rule matching a name gives it, if any. */
  const renameOf = (name) =>
    (bk.capture?.set ?? []).filter((rule) => typeof rule.set.name === "string" && new RegExp(rule.pattern).test(name)).at(-1)?.set.name ?? null;

  const records = [];
  const seen = new Set();
  let skipped = 0;
  let undecided = 0;
  let overlapped = 0;
  for (const entry of nameRepeats(entriesOn(pagesOf(pdf), from, to, offset, settings), settings)) {
    // A name book.json's `capture.set` gives the record is what the packs are
    // checked for: High-Tech's by-hand Workshop is not the captured one it
    // renames "Workshop (Electronics Repair)".
    const name = renameOf(entry.name) ?? entry.name;
    if (held.has(key(name)) || seen.has(recordKey(entry, settings))) continue;
    if (skip.some((pattern) => pattern.test(entry.name))) continue;
    // A name the book's own volume holds, read from another volume: the overlap
    // file says whether this volume's statistics differ enough to keep (E2).
    // A near-duplicate under another name is decided there too: a "skip" leaves it out.
    const theirs = others.get(normalise(name).toLowerCase()) ?? others.get(key(name));
    const decided = overlap.get(normalise(name).toLowerCase());
    if (decided?.decision === "skip" && !theirs) {
      overlapped++;
      continue;
    }
    if (theirs) {
      if (!decided) {
        undecided++;
        console.log(`  ?  p.${entry.page} ${name}: the book holds "${theirs}"; decide keep or skip in ${bk.source?.overlap ?? "the overlap file"}`);
        continue;
      }
      if (decided.decision === "skip") {
        overlapped++;
        continue;
      }
    }
    const out = recordOf(entry, bk, skills, settings);
    if (out.record) {
      // What reading the page settled that the closing line could not say:
      // book.json's `capture.set`, each a name pattern, fields by path, a reason.
      // A null removes the field: a power source's supply read as a draw.
      for (const rule of bk.capture?.set ?? []) {
        if (!new RegExp(rule.pattern).test(entry.name)) continue;
        for (const [path, value] of Object.entries(rule.set)) {
          const parts = path.split(".");
          let at = out.record;
          for (const part of parts.slice(0, -1)) at = at[part] ??= {};
          if (value === null) delete at[parts.at(-1)];
          else at[parts.at(-1)] = value;
        }
        out.notes = [];
      }
      const other = stored.get(recordKey(entry, settings));
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
    seen.add(recordKey(entry, settings));
    records.push(out.record);
    const s = out.record.system;
    const supply = s.extensions?.["gurps-compendium-content"]?.power;
    const power = supply?.draw?.raw ?? supply?.raw ?? "";
    console.log(
      `  +  p.${entry.page} ${entry.name} | TL${s.tl} $${s.cost} ${s.weight} lb ${power} LC${s.lc} ${s.category}` +
        (s.equipmentQuality !== "basic" ? ` ${s.equipmentQuality} [${s.forSkills.join(", ")}]` : "") +
        ` | "${out.closing}"` +
        (out.notes.length ? ` !! ${out.notes.join("; ")}` : ""),
    );
  }
  console.log(`\n${records.length} records, ${skipped} entries without a closing line.`);
  if (bk.source) console.log(`${overlapped} left to the book's own records by the overlap file, ${undecided} undecided.`);
  if (!process.argv.includes("--write")) {
    console.log("Nothing written. Add --write.");
    return;
  }
  const target = join(statisticsDir(bk), "equipment", `${slug}-${file}.json`);
  writeFileSync(target, JSON.stringify(records, null, 2) + "\n", "utf8");
  console.log(`Wrote ${target}`);
}

main();
