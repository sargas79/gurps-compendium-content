/**
 * Where a book's statistics and text come from, and what they are called once
 * they reach Foundry.
 *
 * A book is a directory under `books/` holding a `book.json`. Two kinds exist,
 * and the difference is one field:
 *
 *   - `"statistics": "system"` — the Basic Set. The GWorld system already ships
 *     its numbers, generated there from the GCA data file and checked by its own
 *     validator. This repository adds only the books' text, so the statistics are
 *     read straight out of the pinned submodule and never copied in.
 *   - `"statistics": "book"` (the default) — every other book. Its numbers are
 *     generated from its own GCA file into `books/<slug>/packs-src/` by
 *     `extract.mjs`, and committed there.
 *
 * Either way the merge treats them the same from here on: statistics from one
 * place, text from `books/<slug>/prose/`, and a pack named `<slug>-<type>`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const systemRoot = join(projectRoot, "system");
export const booksRoot = join(projectRoot, "books");
export const buildRoot = join(projectRoot, "build");
export const distRoot = join(projectRoot, "dist");

/** The module's own id, which is also its flag namespace. */
export const MODULE_ID = "gurps-compendium-content";

/** The system these packs are for. Only ever this one. */
export const SYSTEM_ID = "gworld";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * The pinned system's manifest.
 *
 * Its absence means the submodule was never initialised, which is the most
 * common way a fresh clone fails; say so rather than reporting a missing file.
 */
export function systemManifest() {
  const path = join(systemRoot, "src", "system.json");
  if (!existsSync(path)) {
    throw new Error(
      `No system manifest at ${path}.\n` +
        `The pinned GWorld system is a git submodule. Run:\n` +
        `  git submodule update --init`,
    );
  }
  return readJson(path);
}

/**
 * Every book in the repository, in a stable order -- or, when `GCC_BOOKS`
 * names some ("basic-set,monster-hunters-1"), only those.
 *
 * The filter is for releases. v0.1.0 is the Basic Set alone although the
 * repository already held Monster Hunters 1 when it was cut, and building it
 * with `GCC_BOOKS=basic-set` makes that release again from its tag.
 */
export function books() {
  if (!existsSync(booksRoot)) return [];
  const all = readdirSync(booksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(booksRoot, slug, "book.json")))
    .sort();
  const wanted = (process.env.GCC_BOOKS ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
  const unknown = wanted.filter((slug) => !all.includes(slug));
  if (unknown.length) {
    throw new Error(`GCC_BOOKS names ${unknown.join(", ")}, which is not a book here. Books: ${all.join(", ")}.`);
  }
  return all.filter((slug) => !wanted.length || wanted.includes(slug)).map((slug) => book(slug));
}

/** One book, with the defaults its `book.json` may leave out. */
export function book(slug) {
  const raw = readJson(join(booksRoot, slug, "book.json"));
  if (raw.slug && raw.slug !== slug) {
    throw new Error(`books/${slug}/book.json calls itself "${raw.slug}"; the directory name wins.`);
  }
  return {
    slug,
    title: raw.title ?? slug,
    label: raw.label ?? raw.title ?? slug,
    prefix: raw.prefix ?? null,
    gdf: raw.gdf ?? null,
    reference: raw.reference ?? raw.title ?? slug,
    statistics: raw.statistics === "system" ? "system" : "book",
    types: raw.types ?? {},
    // The GCA category a power's abilities are filed under, as a pattern whose
    // first group names the power: "^_MH (?:Psionics - )?(.+)" reads
    // "_MH Psionics - ESP" as ESP. Null for a book with no powers.
    powerCategory: raw.powerCategory ?? null,
    // The pages of the [MODIFIERS] section holding the book's own enhancements
    // and limitations, for parse-gdf-modifiers.mjs. Null for a book with none.
    modifiers: raw.modifiers ?? null,
    // Records the parsers write that the book should not have: the pack, a
    // name pattern and the reason (tools/extract.mjs). The pack matters -- the
    // Powerstone spell is not a powerstone.
    exclude: (raw.exclude ?? []).map((rule) => ({
      pack: String(rule.pack),
      pattern: new RegExp(rule.pattern),
      reason: String(rule.reason ?? ""),
    })),
    // Fields to set on the parsers' records, by path, where the system cannot
    // take what the data file says yet (tools/extract.mjs).
    patch: (raw.patch ?? []).map((rule) => ({
      pack: String(rule.pack),
      pattern: new RegExp(rule.pattern),
      set: rule.set ?? {},
      reason: String(rule.reason ?? ""),
    })),
    // How the book's PDF is read, for tools/transcribe.mjs: book page +
    // pdfOffset = PDF page, the letters a page is recorded with, and a pattern
    // for the part of a data-file name the book does not print.
    transcription: {
      pdfOffset: raw.transcription?.pdfOffset ?? null,
      pageLabel: raw.transcription?.pageLabel ?? raw.prefix ?? "",
      namePrefix: raw.transcription?.namePrefix ? new RegExp(raw.transcription.namePrefix) : null,
      // Pages set on a tinted panel read as boxes; their contents are the running text.
      asidesAsText: raw.transcription?.asidesAsText === true,
      // Data-file names the book prints differently: a typo, or a shorter name.
      aliases: raw.transcription?.aliases ?? {},
      // Weapons a book describes once for a whole family: "These weapons are
      // available in the same models as TL10 high-energy lasers". Each rule turns
      // a name into the model's -- "Heavy X-Ray Laser Pistol" into "Heavy Laser
      // Pistol" -- and names the heading the family's own text is under.
      families: (raw.transcription?.families ?? []).map((rule) => ({
        pattern: new RegExp(rule.pattern),
        replace: String(rule.replace ?? ""),
        heading: String(rule.heading),
        headingOnly: rule.headingOnly === true,
      })),
    },
    dir: join(booksRoot, slug),
  };
}

/** The directory holding this book's statistics, whoever generated them. */
export function statisticsDir(bk) {
  return bk.statistics === "system"
    ? join(systemRoot, "packs-src")
    : join(bk.dir, "packs-src");
}

/**
 * The packs this book has, by the name the statistics directory gives them.
 *
 * These are the system's own pack names for the Basic Set (`advantages`,
 * `skills`, …) and whatever the book's extraction produced for the others.
 */
export function packsOf(bk) {
  const dir = statisticsDir(bk);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every document in one pack of one book's statistics. */
export function readStatistics(bk, pack) {
  const dir = join(statisticsDir(bk), pack);
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const raw = readJson(join(dir, file));
    for (const entry of Array.isArray(raw) ? raw : [raw]) out.push({ entry, file });
  }
  return out;
}

/** The book's text for one pack, by document id, or an empty map. */
export function readProse(bk, pack) {
  const path = join(bk.dir, "prose", `${pack}.json`);
  if (!existsSync(path)) return { path, records: new Map() };
  const raw = readJson(path);
  const records = new Map();
  for (const record of Array.isArray(raw) ? raw : [raw]) {
    if (records.has(record._id)) {
      throw new Error(`${path}: two records share the id ${record._id}.`);
    }
    records.set(record._id, record);
  }
  return { path, records };
}

/** The Foundry pack name for one of a book's packs. */
export function packId(bk, pack) {
  return `${bk.slug}-${pack}`;
}

/**
 * What kind of document a pack holds, by the pack's short name.
 *
 * Not every pack is a pack of items: the system's `creatures` is an Actor pack,
 * and an Actor carries its own traits and skills as embedded documents. Assuming
 * Item produces a pack Foundry loads and then strips, because each document is
 * read against the wrong schema — so the answer is taken from the system's own
 * manifest rather than guessed.
 *
 * A book that brings its own statistics may name types in its `book.json`; what
 * it does not name is an Item pack, which is what almost everything is.
 */
export function packDocumentTypes(bk) {
  const types = new Map();
  if (bk.statistics === "system") {
    for (const pack of systemManifest().packs ?? []) {
      types.set(pack.name, pack.type ?? "Item");
    }
  }
  for (const [pack, type] of Object.entries(bk.types ?? {})) types.set(pack, type);
  return types;
}

/** Actor types this system defines, which decide a document's key prefix. */
export const ACTOR_TYPES = new Set(["character", "npc"]);

/** Title case for a pack's label: "equipment" → "Equipment". */
export function packLabel(bk, pack) {
  const words = pack
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return `${bk.label} – ${words}`;
}
