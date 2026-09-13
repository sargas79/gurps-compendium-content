/**
 * Writes `build/packs-src/`, the pack source the rest of the build reads.
 *
 * Everything upstream of this is reviewable text and a pinned system; everything
 * downstream is a build artifact. Running it is safe at any time and leaves
 * nothing behind but `build/`.
 *
 * Usage: node tools/merge.mjs
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { books, buildRoot, packsOf, systemManifest } from "./lib/books.mjs";
import { mergeBook, NO_PROSE } from "./lib/merge-book.mjs";
import { journalPack } from "./lib/journals.mjs";

async function main() {
  const manifest = systemManifest();
  const all = books();
  if (all.length === 0) {
    console.error("No books under books/. Nothing to merge.");
    process.exit(1);
  }

  const source = join(buildRoot, "packs-src");
  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(source, { recursive: true });

  const packs = [];
  const problems = [];

  for (const bk of all) {
    const names = packsOf(bk);
    if (names.length === 0) {
      problems.push(
        `books/${bk.slug}: no statistics. ` +
          (bk.statistics === "system"
            ? `The pinned system has no packs-src; run "git submodule update --init".`
            : `Run "npm run extract -- ${bk.slug}" first.`),
      );
      continue;
    }

    const { results, problems: found } = mergeBook(bk, names);
    problems.push(...found);
    packs.push(...results);

    const journals = await journalPack(bk);
    if (journals) {
      problems.push(...journals.problems);
      packs.push(journals);
    }
  }

  if (problems.length) {
    console.error(`${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  for (const pack of packs) {
    const dir = join(source, pack.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "documents.json"),
      JSON.stringify(pack.documents, null, 2),
      "utf8",
    );
  }

  // The pack list sits beside packs-src rather than inside it: the system's
  // validator walks every .json file in every pack directory and would read a
  // metadata file there as a malformed document.
  await writeFile(
    join(buildRoot, "packs.json"),
    JSON.stringify(
      {
        system: { id: manifest.id, version: manifest.version },
        packs: packs.map((pack) => ({
          id: pack.id,
          label: pack.label,
          type: pack.type,
          book: pack.book.slug,
          bookTitle: pack.book.title,
          documents: pack.documents.length,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Merged against ${manifest.id} ${manifest.version}:`);
  for (const pack of packs) {
    const written = pack.documents.length - (pack.byStatus.get(NO_PROSE) ?? 0);
    const detail =
      pack.type === "JournalEntry"
        ? `${pack.documents.length} rules`
        : `${written}/${pack.documents.length} with text`;
    console.log(`  ${pack.id.padEnd(28)} ${detail}`);
  }
}

await main();
