/**
 * Writes `build/packs-src/`, the pack source the rest of the build reads.
 *
 * Everything upstream of this is reviewable text and a pinned system; everything
 * downstream is a build artifact. Running it is safe at any time and leaves
 * nothing behind but `build/`.
 *
 * Usage: node tools/merge.mjs
 */

import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { books, buildRoot, packsOf, systemManifest } from "./lib/books.mjs";
import { mergeBook, NO_PROSE } from "./lib/merge-book.mjs";
import { journalPack } from "./lib/journals.mjs";

/** Whether a book has any text or rules of its own yet. */
function hasContent(bk) {
  return ["prose", "journals"].some((sub) => {
    const dir = join(bk.dir, sub);
    return existsSync(dir) && readdirSync(dir).length > 0;
  });
}

async function main() {
  const manifest = systemManifest();
  const all = books();
  if (all.length === 0) {
    console.error("No books under books/. Nothing to merge.");
    process.exit(1);
  }

  // Item and Actor packs go where the system's validator can be pointed at
  // them; JournalEntry packs go beside it, because that validator reads every
  // document as one of the system's own types and a journal page is not one.
  const source = join(buildRoot, "packs-src");
  const journalSource = join(buildRoot, "journals-src");
  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  await mkdir(journalSource, { recursive: true });

  const packs = [];
  const problems = [];

  for (const bk of all) {
    const names = packsOf(bk);
    // A book that has been triaged but not yet extracted -- a book.json and
    // nothing else -- is a book not started, and ships nothing. Text or rules
    // with no statistics to sit on is still a fault.
    if (names.length === 0 && bk.statistics !== "system" && !hasContent(bk)) {
      console.log(`books/${bk.slug}: not extracted yet, so nothing of it is built.`);
      continue;
    }
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
    const dir = join(pack.type === "JournalEntry" ? journalSource : source, pack.id);
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
    // Text on the page, whichever field it lives in -- not records in the file,
    // which would count the entries the book has no text for.
    const written = pack.documents.filter(
      (d) => (d.system?.description ?? d.system?.details?.description ?? "").trim(),
    ).length;
    const detail =
      pack.type === "JournalEntry"
        ? `${pack.documents.length} rules`
        : `${written}/${pack.documents.length} with text`;
    console.log(`  ${pack.id.padEnd(28)} ${detail}`);
  }
}

await main();
