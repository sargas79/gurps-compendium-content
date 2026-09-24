import { describe, expect, it } from "vitest";

import { book, packsOf, readStatistics } from "./books.mjs";
import { inSource, withSource } from "./sources.mjs";

/**
 * The names a volume's transcription rules point at are its records' names:
 * an alias or a family rule naming a record that was renamed or dropped
 * would quietly leave that record without text (private #483).
 */
describe("High-Tech: Electricity and Electronics' transcription names", () => {
  const bk = withSource(book("high-tech"), "ee");
  const names = new Set(packsOf(bk).flatMap((pack) => readStatistics(bk, pack).map(({ entry }) => entry).filter((entry) => inSource(bk, entry)).map((entry) => entry.name)));

  it("aliases only the supplement's own records", () => {
    const missing = Object.keys(bk.transcription.aliases).filter((name) => !names.has(name));
    expect(missing).toEqual([]);
  });

  it("gives each family rule records to match, and a model that is one of them", () => {
    for (const rule of bk.transcription.families) {
      const members = [...names].filter((name) => rule.pattern.test(name));
      expect(members, String(rule.pattern)).not.toEqual([]);
      // A rule with a model names the record whose text its members share.
      if (!rule.headingOnly) for (const member of members) expect(names.has(member.replace(rule.pattern, rule.replace))).toBe(true);
    }
  });
});
