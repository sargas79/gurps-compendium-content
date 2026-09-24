/**
 * How the book itself spells its words, for mending words broken across lines.
 *
 * A word broken at a line's end keeps its hyphen or loses it, and the break
 * alone cannot say which: "man-" and "aged" is "managed", but "slow-" and
 * "moving" is "slow-moving". A list of prefixes that keep theirs got both kinds
 * wrong -- "man-aged", "high-est", "animaldrawn", "fifthstory". The book prints
 * almost every word somewhere in the middle of a line, where no break touches
 * it, and that is the authority: count each spelling there, and mend a break
 * the way the book spells the word elsewhere.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { projectRoot } from "./books.mjs";
import { openBook, textLines } from "./pdf-layout.mjs";

const CACHE = join(projectRoot, "extracted", "lexicon.json");

/**
 * Where a set of books' lexicon is kept. The Basic Set's two volumes keep the
 * file they always had; any other set gets one named for its paths, so reading
 * Magic does not throw away the Basic Set's.
 */
function cacheFor(paths) {
  if (existsSync(CACHE) && JSON.stringify(JSON.parse(readFileSync(CACHE, "utf8")).paths) === JSON.stringify(paths)) return CACHE;
  const key = createHash("sha1").update(JSON.stringify(paths)).digest("hex").slice(0, 12);
  return join(projectRoot, "extracted", `lexicon-${key}.json`);
}

/** Every word and hyphenated compound printed away from a line break, counted. */
export async function lexiconOf(paths) {
  const cache = cacheFor(paths);
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, "utf8"));
    if (JSON.stringify(cached.paths) === JSON.stringify(paths)) return toMaps(cached);
  }
  const words = {};
  const compounds = {};
  const count = (table, key) => (table[key] = (table[key] ?? 0) + 1);

  for (const path of paths) {
    const book = await openBook(path);
    for (let number = 1; number <= book.pages; number++) {
      let brokenBefore = false;
      for (const line of await textLines(book, number)) {
        const tokens = line.match(/[A-Za-z]+(?:-[A-Za-z]+)*-?/g) ?? [];
        // A justified line can set its closing hyphen apart: "sig -".
        const brokenAfter = /[A-Za-z] ?-$/.test(line);
        tokens.forEach((token, i) => {
          // The two halves of a broken word are not words the book prints.
          if (i === 0 && brokenBefore) return;
          if (i === tokens.length - 1 && brokenAfter) return;
          const lower = token.toLowerCase().replace(/-$/, "");
          if (lower.includes("-")) count(compounds, lower);
          for (const part of lower.split("-")) count(words, part);
        });
        brokenBefore = brokenAfter;
      }
    }
  }
  mkdirSync(dirname(cache), { recursive: true });
  writeFileSync(cache, JSON.stringify({ paths, words, compounds }), "utf8");
  return toMaps({ words, compounds });
}

function toMaps({ words, compounds }) {
  return { words: new Map(Object.entries(words)), compounds: new Map(Object.entries(compounds)) };
}
