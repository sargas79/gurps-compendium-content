import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { book, packsOf, readProse } from "./books.mjs";
import { printedWords, unprinted } from "./printed-words.mjs";
import { withSource } from "./sources.mjs";

describe("the words a book prints", () => {
  const stream = [
    "The signal carries a long way through the sig-",
    "nal tower, and the relay passes it on.",
    "A fast-moving cart crosses the yard.",
    "The storm broke the wea-",
    "Sidebar: a note set beside the column.",
    "\fther vane on the roof.",
  ].join("\n");
  const printed = printedWords(stream);

  it("counts a word broken at a line's end whole, with its hyphen or without", () => {
    expect(printed.has("signal")).toBe(true);
    expect(printed.has("sig-nal")).toBe(true);
    expect(printed.has("fast-moving")).toBe(true);
    expect(printed.has("Tower's")).toBe(true);
  });

  it("counts a word whose halves the stream sets apart, across other lines or onto the next page", () => {
    expect(printed.has("weather")).toBe(true);
  });

  it("finds a word split in two, a hyphen left standing on the next word, and two words run together", () => {
    expect(unprinted("<p>The sig nal tower.</p>", printed)).toEqual(["sig", "nal"]);
    expect(unprinted("<p>The relay -passes it on.</p>", printed)).toEqual(["relay -passes"]);
    expect(unprinted("<p>It passes aSignal on.</p>", printed)).toEqual(["aSignal"]);
    expect(unprinted("<p>A fast-moving cart &amp; the signal tower.</p>", printed)).toEqual([]);
  });
});

/**
 * Every word of the supplement's text records is a word pdftotext's reading
 * of the book prints (private #542, #544): a layout reading that splits a
 * word, leaves a line-end hyphen standing or runs two words together fails
 * here. It needs the book's PDF, from `GURPS_PDF_DIR` or the archive, and
 * pdftotext; without them it is skipped. A failure names the records only,
 * never their words.
 */
const PDF_DIR = process.env.GURPS_PDF_DIR ?? "C:/Users/diego/Dropbox/Archive/GURPS/Accessories";
const ee = withSource(book("high-tech"), "ee");
const pdf = ee.source.pdf ? join(PDF_DIR, ee.source.pdf) : null;
const stream = pdf && existsSync(pdf) ? spawnSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 28 }) : null;
const readable = Boolean(stream && stream.status === 0 && stream.stdout);

describe.skipIf(!readable)("High-Tech: Electricity and Electronics' prose", () => {
  it("prints every word of every text record", () => {
    const printed = printedWords(stream.stdout);
    const label = ee.transcription.pageLabel;
    const wrong = [];
    let texts = 0;
    for (const pack of packsOf(ee)) {
      for (const record of readProse(ee, pack).records.values()) {
        if (!record.pages?.startsWith(label) || !record.description) continue;
        texts++;
        const odd = unprinted(record.description, printed);
        if (odd.length) wrong.push(`${pack}: ${record.name} (${odd.length})`);
      }
    }
    expect(texts).toBeGreaterThan(300);
    expect(wrong).toEqual([]);
  });
});
