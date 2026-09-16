/**
 * Generates one book's statistics from its GCA 5 data file.
 *
 * The parsers belong to the system, not to this repository: they are the same
 * `tools/parse-gdf.mjs` and `tools/parse-gdf-spells.mjs` that built the Basic
 * Set's packs, run out of the pinned submodule against another book with its own
 * page prefix. Nothing about reading a GDF is reimplemented here; this only says
 * which file, which prefix, and where the output goes.
 *
 * Records that also cite a Basic Set page are the system's already, and the
 * parser leaves them out. They are written to `books/<slug>/overlap.txt` rather
 * than discarded, because a supplement sometimes revises an entry it reprints,
 * and those revisions are added by hand after reading the list.
 *
 * Records the data file gets wrong or never had are kept by hand, in
 * `packs-src/<pack>/<slug>-by-hand.json`. --write only ever writes the parsers'
 * own files (named for the book), so it leaves those files alone. A name kept by hand
 * also wins: the parser reports its own record as a duplicate and writes nothing
 * for it.
 *
 * Records a book should not have at all go in book.json's `exclude`, each a
 * name pattern and the reason, and are taken out of the parsers' files after
 * they are written. Magic's 323 powerstones, one per capacity, are the case:
 * capacity belongs on one item (sargas79/GWorldVTT#190). Fields the system
 * cannot take yet go in `patch`, each a pack, a name pattern, the fields to set
 * by path, and the reason: Magic's jets and rains do damage without being
 * Missile or Melee spells, which the system's validator refuses.
 *
 * Usage: node tools/extract.mjs <book> [--write]
 *
 * Without --write nothing is written and the counts are reported, which is how a
 * book's triage is done.
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { MODULE_ID, book, books, statisticsDir, systemRoot } from "./lib/books.mjs";
import { powerOf } from "./lib/power-cells.mjs";

/** Where the GCA data files live on this machine, unless the book says otherwise. */
const GDF_ROOT = process.env.GURPS_GDF_DIR ?? "E:/data files";

// parse-gdf.mjs reads spells too, through parse-gdf-spells.mjs and with the
// overlap filter. Running the spell parser on its own as well wrote a second,
// unfiltered copy under the Basic Set's file name.
const PARSERS = [
  { script: "parse-gdf.mjs", what: "traits, skills, techniques, gear and spells" },
  // Only for a book whose book.json says which pages hold its modifiers.
  { script: "parse-gdf-modifiers.mjs", what: "enhancements and limitations", needs: "modifiers" },
];

function acceptsBookOptions(path) {
  if (!existsSync(path)) return false;
  const source = readFileSync(path, "utf8");
  return source.includes("--book") && source.includes("--prefix") && source.includes("--out");
}

async function main() {
  const slug = process.argv[2];
  const write = process.argv.includes("--write");

  if (!slug || slug.startsWith("--")) {
    console.error("Usage: node tools/extract.mjs <book> [--write]\n");
    console.error("  --write writes the parsers' files only; packs-src/<pack>/<book>-by-hand.json is never touched.\n");
    console.error(`Books: ${books().map((bk) => bk.slug).join(", ")}`);
    process.exit(1);
  }

  const bk = book(slug);

  if (bk.statistics === "system") {
    console.log(
      `${bk.title} takes its statistics from the system's own packs, which are ` +
        `generated in GWorldVTT from the GCA file. There is nothing to extract here; ` +
        `this book contributes text only.`,
    );
    return;
  }

  if (!bk.gdf) {
    console.error(`books/${slug}/book.json names no "gdf".`);
    process.exit(1);
  }
  if (!bk.prefix) {
    console.error(`books/${slug}/book.json names no "prefix" (the letters its pages cite, e.g. "MA").`);
    process.exit(1);
  }

  const gdf = existsSync(bk.gdf) ? bk.gdf : join(GDF_ROOT, bk.gdf);
  if (!existsSync(gdf)) {
    console.error(
      `No GCA data file at ${gdf}.\n` +
        `Set GURPS_GDF_DIR, or give "gdf" in book.json as a full path.`,
    );
    process.exit(1);
  }

  const usable = PARSERS.filter((parser) =>
    (!parser.needs || bk[parser.needs]) && acceptsBookOptions(join(systemRoot, "tools", parser.script)),
  );

  if (usable.length === 0) {
    console.error(
      `The pinned system's parsers read the Basic Set only.\n` +
        `  --prefix/--book/--out reached parse-gdf-spells.mjs in GWorldVTT PR #88 and\n` +
        `  parse-gdf.mjs in https://github.com/sargas79/GWorldVTT/issues/98.\n` +
        `  Bump the submodule to a release carrying both, then run this again.`,
    );
    process.exit(1);
  }

  const out = statisticsDir(bk);
  if (write) await mkdir(out, { recursive: true });

  console.log(`${bk.title} — ${gdf}`);
  console.log(`  prefix ${bk.prefix}, reference "${bk.reference}"${write ? "" : ", dry run"}\n`);

  for (const parser of usable) {
    const script = join(systemRoot, "tools", parser.script);
    const args = [
      script,
      gdf,
      "--prefix", bk.prefix,
      "--book", bk.reference,
      "--out", out,
      ...(parser.script === "parse-gdf-modifiers.mjs"
        ? ["--pack", "modifiers", "--file", `${slug}-modifiers.json`, "--from", String(bk.modifiers.from), "--to", String(bk.modifiers.to)]
        : ["--overlap", join(bk.dir, "overlap.txt")]),
      ...(parser.script === "parse-gdf.mjs" && bk.powerCategory ? ["--power-category", bk.powerCategory] : []),
      ...(write ? ["--write"] : []),
    ];
    console.log(`  ${parser.script} (${parser.what})`);
    const result = spawnSync(process.execPath, args, { stdio: "inherit" });
    if (result.status !== 0) {
      console.error(`  ${parser.script} failed.`);
      process.exit(result.status ?? 1);
    }
  }

  // What the book says it should not have, out of the parsers' files.
  if (write && bk.exclude.length) {
    for (const entry of readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = join(out, entry.name);
      const rules = bk.exclude.filter((rule) => rule.pack === entry.name);
      if (!rules.length) continue;
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes("-by-hand"))) {
        const docs = JSON.parse(readFileSync(join(dir, file), "utf8"));
        if (!Array.isArray(docs)) continue;
        const kept = docs.filter((doc) => !rules.some((rule) => rule.pattern.test(String(doc.name ?? ""))));
        if (kept.length === docs.length) continue;
        writeFileSync(join(dir, file), JSON.stringify(kept, null, 2) + "\n", "utf8");
        for (const rule of rules) {
          const count = docs.filter((doc) => rule.pattern.test(String(doc.name ?? ""))).length;
          if (count) console.log(`  excluded ${count} from ${entry.name}/${file}: ${rule.reason}`);
        }
      }
    }
  }

  // What the book says to change in the parsers' records: fields set by path.
  if (write && bk.patch.length) {
    for (const entry of readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = join(out, entry.name);
      const rules = bk.patch.filter((rule) => rule.pack === entry.name);
      if (!rules.length) continue;
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes("-by-hand"))) {
        const docs = JSON.parse(readFileSync(join(dir, file), "utf8"));
        if (!Array.isArray(docs)) continue;
        let changed = false;
        for (const rule of rules) {
          const matched = docs.filter((doc) => rule.pattern.test(String(doc.name ?? "")));
          for (const doc of matched) {
            for (const [path, value] of Object.entries(rule.set)) {
              const keys = path.split(".");
              const parent = keys.slice(0, -1).reduce((node, key) => (node[key] ??= {}), doc);
              parent[keys.at(-1)] = structuredClone(value);
            }
          }
          if (matched.length) {
            changed = true;
            console.log(`  patched ${matched.length} in ${entry.name}/${file}: ${rule.reason}`);
          }
        }
        if (changed) writeFileSync(join(dir, file), JSON.stringify(docs, null, 2) + "\n", "utf8");
      }
    }
  }

  // What each gadget is powered by, which no parser reads because no book but
  // this one has power cells: the size, how many, whether it is worn as a pack,
  // and how long it lasts. It goes in the module's own extension data, where
  // the book's rules read it and the system's schema never sees it.
  if (write) await addPowerCells(gdf, out);

  // A parser that found nothing still writes its file, under the Basic Set's
  // name when it has no stem of its own: an empty spells pack is not a pack.
  if (write) {
    for (const entry of readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = join(out, entry.name);
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const docs = JSON.parse(readFileSync(join(dir, file), "utf8"));
        if (Array.isArray(docs) && docs.length === 0) rmSync(join(dir, file));
      }
      if (readdirSync(dir).filter((f) => f.endsWith(".json")).length === 0) rmSync(dir, { recursive: true, force: true });
    }
  }

  if (usable.length < PARSERS.filter((p) => !p.needs || bk[p.needs]).length) {
    const missing = PARSERS.filter((p) => (!p.needs || bk[p.needs]) && !usable.includes(p)).map((p) => p.script);
    console.log(
      `\nSkipped ${missing.join(", ")}: the pinned system's copy reads the Basic Set only.`,
    );
  }

  console.log(
    write
      ? `\nWritten to ${out}. Read books/${slug}/overlap.txt before going further: ` +
          `anything the book revises rather than reprints is added by hand.`
      : `\nNothing written. Add --write when the counts look right.`,
  );
}

await main();

/**
 * Writes what each gadget is powered by into the records the parsers produced.
 *
 * The GCA file carries it in three columns the system's reader keeps but no
 * parser uses, because power cells are this book's (pp. 18-20) and the system
 * implements the Basic Set. So the file is read again here, through the
 * system's own reader, and matched to the records by name.
 */
async function addPowerCells(gdfPath, out) {
  const gdf = readFileSync(gdfPath, "utf8");
  const { fields, nameOf, records } = await import(
    pathToFileURL(join(systemRoot, "tools", "gdf.mjs")).href
  );

  const byName = new Map();
  for (const record of records(gdf)) {
    const power = powerOf(fields(record.text));
    if (power) byName.set(nameOf(record), power);
  }
  if (byName.size === 0) return;

  let written = 0;
  for (const entry of readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = join(out, entry.name);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes("-by-hand"))) {
      const docs = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (!Array.isArray(docs)) continue;
      let changed = false;
      for (const doc of docs) {
        const power = byName.get(String(doc.name ?? ""));
        if (!power) continue;
        doc.system ??= {};
        doc.system.extensions ??= {};
        doc.system.extensions[MODULE_ID] ??= {};
        doc.system.extensions[MODULE_ID].power = power;
        changed = true;
        written += 1;
      }
      if (changed) writeFileSync(join(dir, file), JSON.stringify(docs, null, 2) + "\n", "utf8");
    }
  }
  console.log(`  power cells written on ${written} record(s) of ${byName.size} the file gives one`);
}
