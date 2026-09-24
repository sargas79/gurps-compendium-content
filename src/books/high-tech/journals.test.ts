/**
 * The rules journal's pages against the book's switches (#356, #485).
 *
 * High-Tech's journal holds two books' pages: its own, cited "HT<n>", and the
 * Electricity and Electronics supplement's (E1 in #471), cited "HT:EE<n>" in
 * chapter folders of their own. A page a switch implements names that switch
 * as its `rule`, which is how the Rules page finds its text, so a page naming
 * a switch the book never registers is a dead link, and a supplement switch
 * with no page has no text to open.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MODULE_ID } from "../../shared/module.js";
import { book } from "./index.js";

const JOURNALS = join(import.meta.dirname, "../../../books/high-tech/journals");
const SUPPLEMENT = "High-Tech: Electricity and Electronics";

type Page = { id: string; title: string; chapter: string; pages: string; reference?: string; rule?: string; file: string };

const pages = (JSON.parse(readFileSync(join(JOURNALS, "index.json"), "utf8")) as { pages: Page[] }).pages;
const supplement = pages.filter((p) => p.id.startsWith("ee-"));

/** The book's switches and the reference each cites, as the Rules page lists them. */
function switches(): Map<string, string> {
  const out = new Map<string, string>();
  book.registerRules!(
    { registerRuleGroup: () => "high-tech", registerRule: (r: any) => out.set(`${MODULE_ID}.${r.key}`, r.reference) } as never,
    "high-tech",
  );
  return out;
}

describe("High-Tech's rules journal", () => {
  it("names only switches the book registers", () => {
    const known = switches();
    expect(pages.filter((p) => p.rule && !known.has(p.rule)).map((p) => `${p.id}: ${p.rule}`)).toEqual([]);
  });

  it("has a written page for every entry", () => {
    const missing = pages.filter((p) => !existsSync(join(JOURNALS, p.file)) || readFileSync(join(JOURNALS, p.file), "utf8").trim() === "");
    expect(missing.map((p) => p.id)).toEqual([]);
  });

  describe("the Electricity and Electronics supplement's pages", () => {
    it("are there, one per section that carries rules", () => {
      expect(supplement.length).toBeGreaterThanOrEqual(45);
    });

    it("cite the supplement, never High-Tech's own pages", () => {
      for (const p of supplement) {
        expect(p.pages, p.id).toMatch(/^HT:EE\d+(-\d+)?$/);
        expect(p.reference, p.id).toMatch(new RegExp(`^${SUPPLEMENT} pp?\\. \\d+(-\\d+)?$`));
      }
      // And High-Tech's own pages never cite the supplement.
      for (const p of pages.filter((q) => !q.id.startsWith("ee-"))) expect(p.pages, p.id).toMatch(/^HT\d/);
    });

    it("sit in the supplement's six chapter folders, apart from High-Tech's", () => {
      const folders = new Set(supplement.map((p) => p.chapter));
      expect([...folders].sort()).toEqual([
        "E&E 1. Basic Science",
        "E&E 2. Laboratories and Workshops",
        "E&E 3. Power and Machinery",
        "E&E 4. Signals and Waves",
        "E&E 5. Computation",
        "E&E 6. Electronic Warfare",
      ]);
      expect(pages.filter((p) => !p.id.startsWith("ee-") && folders.has(p.chapter))).toEqual([]);
    });

    it("give every switch that cites the supplement a page", () => {
      const cited = [...switches()].filter(([, reference]) => reference.includes(SUPPLEMENT)).map(([key]) => key);
      const withPage = new Set(supplement.map((p) => p.rule));
      expect(cited.filter((key) => !withPage.has(key))).toEqual([]);
    });
  });
});
