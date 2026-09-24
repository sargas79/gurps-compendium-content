/**
 * Whether every word of a text is a word the book prints.
 *
 * A layout reading can split a word in two ("sig nal"), leave a line-end
 * hyphen standing on the next line's word ("sig -nal"), or run two words
 * together ("aDVR"). None of those is a word the book prints, and pdftotext's
 * stream of the book is a reading independent of the layout's: a word of a
 * text that the stream never prints is a word the text got wrong (private
 * #542, #544).
 *
 * The stream prints a word broken at a line's end in two halves, "sig-" and
 * "nal". Where the next line follows, the halves count joined and hyphenated,
 * and not as words of their own. Where the stream puts other text between
 * them (a column break, a pull quote), a word counts when its first half hangs
 * on a hyphen and its second is a word on the same page or the next. Either
 * way the check can't tell a joined word from a hyphenated one: the
 * transcriber's lexicon decides that (`lib/lexicon.mjs`).
 */

/** pdftotext's characters, as a text writes them. */
export function normalise(text) {
  return String(text)
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‑‐–]/g, "-")
    .replace(/¥/g, "×")
    .replace(/­/g, "")
    .replace(/\r/g, "");
}

const WORD = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;
const BREAK = /([A-Za-z])-[ \t]*\n\s*([a-z])/g;

/** The words a book's stream prints: `stream` is pdftotext's text, pages split at form feeds. */
export function printedWords(stream) {
  const all = normalise(stream);
  const words = new Set();
  // The halves of a broken word are not words the book prints, so the stream
  // counts only with its breaks mended.
  for (const text of [all.replace(BREAK, "$1$2"), all.replace(BREAK, "$1-$2")]) {
    for (const w of text.match(WORD) ?? []) words.add(w.toLowerCase());
  }
  // Each page's halves left hanging on a hyphen, and its lower-case words, for
  // words broken where the stream sets other text between the halves: it
  // runs a pull quote or a sidebar into the line that carries the word on.
  const pages = all.split("\f").map((page) => ({
    ends: new Set([...page.matchAll(/([A-Za-z]+) ?-(?=[ \t]*(?:\n|$)|[ \t]+\S)/g)].map((m) => m[1].toLowerCase())),
    starts: new Set(page.match(/(?<![A-Za-z'-])[a-z]+/g) ?? []),
  }));
  const broken = (word) => {
    for (let k = 1; k < word.length; k++) {
      const head = word.slice(0, k).replace(/-$/, "");
      const tail = word.slice(k);
      if (!/^[a-z]+$/.test(tail)) continue;
      if (pages.some((page, i) => page.ends.has(head) && (page.starts.has(tail) || pages[i + 1]?.starts.has(tail)))) return true;
    }
    return false;
  };
  return {
    has(word) {
      const lower = word.toLowerCase();
      const bare = lower.replace(/'s$/, "");
      if (words.has(lower) || words.has(bare)) return true;
      // A hyphenated compound whose halves the book prints.
      if (bare.includes("-") && bare.split("-").every((part) => !part || words.has(part))) return true;
      return broken(bare);
    },
  };
}

/** A record's description as plain text. */
export function plainText(html) {
  return normalise(String(html).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
}

/**
 * What in a text the book doesn't print: each word the stream never prints,
 * and each line-end hyphen left standing on the next word ("sig -nal"), which
 * hides a split when both halves happen to be words.
 */
export function unprinted(text, printed) {
  const plain = plainText(text);
  const odd = (plain.match(WORD) ?? []).filter((w) => !printed.has(w));
  for (const m of plain.matchAll(/([A-Za-z]+) -([a-z]+)/g)) odd.push(`${m[1]} -${m[2]}`);
  return odd;
}
