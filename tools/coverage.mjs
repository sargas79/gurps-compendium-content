/**
 * What still has no text.
 *
 * This is the entry-level tracker for the content work, and the reason the
 * issues are one per pack rather than one per entry: with 1,764 entries in the
 * Basic Set alone, the list of what is left has to be generated, not maintained.
 *
 * Usage: node tools/coverage.mjs [book] [--pack <name>] [--list] [--status <s>]
 *
 *   --list           name every entry still without text, not just the count
 *   --pack <name>    one pack only, by its short name ("advantages")
 *   --status <s>     list the entries in one state instead ("needs-review")
 */

import { books, packsOf } from "./lib/books.mjs";
import { mergeBook, NO_PROSE, STATUSES } from "./lib/merge-book.mjs";
import { MODULE_ID } from "./lib/books.mjs";

function option(name, fallback = null) {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const wantBook = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const wantPack = option("--pack");
const wantStatus = option("--status");
const list = process.argv.includes("--list");

function bar(done, total) {
  const width = 24;
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return `[${"#".repeat(filled)}${".".repeat(width - filled)}]`;
}

function main() {
  if (wantStatus && !STATUSES.has(wantStatus) && wantStatus !== NO_PROSE) {
    console.error(`--status must be one of ${[...STATUSES].join(", ")}, ${NO_PROSE}.`);
    process.exit(1);
  }

  const all = books().filter((bk) => !wantBook || bk.slug === wantBook);
  if (all.length === 0) {
    console.error(wantBook ? `No book called "${wantBook}".` : "No books under books/.");
    process.exit(1);
  }

  let exit = 0;

  for (const bk of all) {
    const names = packsOf(bk).filter((pack) => !wantPack || pack === wantPack);
    if (names.length === 0) continue;

    const { results, problems } = mergeBook(bk, names);
    console.log(`\n${bk.title}`);

    if (problems.length) {
      exit = 1;
      console.log(`  ${problems.length} problem(s) — run "npm run merge" for the detail.`);
    }

    let bookDone = 0;
    let bookTotal = 0;

    for (const pack of results) {
      const total = pack.documents.length;
      const missing = pack.byStatus.get(NO_PROSE) ?? 0;
      const done = total - missing;

      // A pack of actors takes no text yet, so counting it against the total
      // would put a book's coverage permanently short of 100%.
      if (pack.type !== "Item") {
        console.log(
          `  ${pack.pack.padEnd(16)} ${" ".repeat(26)} ${total} ${pack.type} documents, no text`,
        );
        continue;
      }

      bookDone += done;
      bookTotal += total;

      const states = [...pack.byStatus]
        .filter(([status]) => status !== NO_PROSE)
        .sort()
        .map(([status, count]) => `${status} ${count}`)
        .join(", ");

      const percent = total === 0 ? 0 : Math.round((done / total) * 100);
      console.log(
        `  ${pack.pack.padEnd(16)} ${bar(done, total)} ${String(percent).padStart(3)}%  ` +
          `${done}/${total}${states ? `  (${states})` : ""}`,
      );

      if (wantStatus) {
        for (const document of pack.documents) {
          if (document.flags[MODULE_ID].status === wantStatus) {
            const note = document.flags[MODULE_ID].notes;
            console.log(`      ${document.name}${note ? ` — ${note}` : ""}`);
          }
        }
      } else if (list && missing > 0) {
        for (const document of pack.documents) {
          if (document.flags[MODULE_ID].status === NO_PROSE) console.log(`      ${document.name}`);
        }
      }
    }

    const percent = bookTotal === 0 ? 0 : Math.round((bookDone / bookTotal) * 100);
    console.log(`  ${"total".padEnd(16)} ${bar(bookDone, bookTotal)} ${String(percent).padStart(3)}%  ${bookDone}/${bookTotal}`);
  }

  if (!list && !wantStatus) {
    console.log(`\nPass --list to name what is left, or --status needs-review to see what is queried.`);
  }

  process.exit(exit);
}

main();
