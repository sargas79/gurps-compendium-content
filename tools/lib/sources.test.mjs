import { describe, expect, it } from "vitest";

import { citationOf, inSource, readOverlap, readSources, volumeKey, volumeOfPages, volumeOfReference, withSource } from "./sources.mjs";

/**
 * A book with a second volume of its own: High-Tech and its supplement
 * Electricity and Electronics (private #471, E1), as book.json describes them.
 */
const raw = {
  sources: [
    {
      id: "ee",
      title: "GURPS High-Tech: Electricity and Electronics",
      reference: "High-Tech: Electricity and Electronics",
      transcription: { pdfOffset: 0, pageLabel: "HT:EE" },
      capture: { labelEnd: ".:", noLegality: true, years: true, skip: [{ pattern: "^Foo$", reason: "a test" }] },
      overlap: "overlap-ee.txt",
    },
  ],
};
const HIGH_TECH = {
  slug: "high-tech",
  title: "GURPS High-Tech",
  reference: "High-Tech",
  transcription: { pdfOffset: 1, pageLabel: "HT", layout: true, asidesAsText: true, aliases: { "T Battery": "Tiny" }, families: [] },
  capture: { labelEnd: ".", skip: [{ pattern: "^Libraries$" }], set: [] },
  sources: readSources(raw),
};
const record = (reference) => ({ name: "Thing", system: { reference } });

describe("a book's other volumes", () => {
  it("tells a citation of the supplement from one of the book, by reference and by page label", () => {
    expect(volumeOfReference(HIGH_TECH, "High-Tech p. 12")?.id).toBeNull();
    expect(volumeOfReference(HIGH_TECH, "High-Tech pp. 12-13")?.id).toBeNull();
    expect(volumeOfReference(HIGH_TECH, "High-Tech: Electricity and Electronics p. 12")?.id).toBe("ee");
    expect(volumeOfPages(HIGH_TECH, "HT12")?.id).toBeNull();
    expect(volumeOfPages(HIGH_TECH, "HT:EE12")?.id).toBe("ee");
    expect(volumeOfPages(HIGH_TECH, "B123")).toBeUndefined();
  });

  it("cites a journal page by its volume", () => {
    expect(citationOf(HIGH_TECH, "HT:EE12")).toBe("High-Tech: Electricity and Electronics p. 12");
    expect(citationOf(HIGH_TECH, "HT:EE18-19")).toBe("High-Tech: Electricity and Electronics pp. 18-19");
    expect(citationOf(HIGH_TECH, "HT6-7")).toBe("High-Tech pp. 6-7");
  });

  it("reads the book as a volume: its reference, label, offset and capture, the book's own citations kept", () => {
    const ee = withSource(HIGH_TECH, "ee");
    expect(ee).toMatchObject({ slug: "high-tech", reference: "High-Tech: Electricity and Electronics", source: { id: "ee" } });
    expect(ee.transcription).toMatchObject({ pdfOffset: 0, pageLabel: "HT:EE", layout: true, asidesAsText: true, aliases: {} });
    expect(ee.capture).toMatchObject({ labelEnd: ".:", noLegality: true, years: true, skip: [{ pattern: "^Foo$" }] });
    expect(volumeKey(ee)).toBe("high-tech-ee");
    // Read as the supplement, a record still cites the volume it cites.
    expect(inSource(ee, record("High-Tech: Electricity and Electronics p. 27"))).toBe(true);
    expect(inSource(ee, record("High-Tech p. 38"))).toBe(false);
    expect(volumeOfReference(ee, "High-Tech p. 38")?.id).toBeNull();
    expect(citationOf(ee, "HT6")).toBe("High-Tech p. 6");
  });

  it("reads a volume's text from where its own page starts it, and the book's from the usual margin", () => {
    // The supplement sets its first line at 44 points, under the usual margin
    // of 45 (HT:EE pp. 26-51): its source says where its text starts.
    const topped = { ...HIGH_TECH, sources: readSources({ sources: [{ ...raw.sources[0], transcription: { pdfOffset: 0, pageLabel: "HT:EE", topMargin: 40 } }] }) };
    expect(withSource(topped, "ee").transcription.topMargin).toBe(40);
    expect(withSource(topped, null).transcription.topMargin).toBeUndefined();
    expect(withSource(HIGH_TECH, "ee").transcription).not.toHaveProperty("topMargin");
  });

  it("reads the book as itself with no source, and a record citing nothing as the book's", () => {
    const own = withSource(HIGH_TECH, null);
    expect(own.source).toBeNull();
    expect(volumeKey(own)).toBe("high-tech");
    expect(inSource(own, record("High-Tech p. 38"))).toBe(true);
    expect(inSource(own, record(""))).toBe(true);
    expect(inSource(own, record("High-Tech: Electricity and Electronics p. 27"))).toBe(false);
  });

  it("refuses a source it can't cite, and names the ones there are", () => {
    expect(() => readSources({ sources: [{ id: "ee", reference: "X" }] })).toThrow(/pageLabel/);
    expect(() => readSources({ sources: [{ id: "EE!", reference: "X", transcription: { pageLabel: "X" } }] })).toThrow(/id/);
    expect(() => withSource(HIGH_TECH, "pg")).toThrow(/Sources: ee/);
  });
});

describe("the overlap file (E2)", () => {
  it("reads each name's decision, and refuses one that is neither keep nor skip", () => {
    const decided = readOverlap("# a comment\n\nEQUIPMENT\tTactical Headset\tTactical Headset\tHT:EE31, HT39\tskip\tidentical\n");
    expect(decided.get("tactical headset")).toMatchObject({ theirs: "Tactical Headset", decision: "skip", why: "identical" });
    expect(() => readOverlap("EQUIPMENT\tRadio\tRadio\tHT:EE27\tmaybe\t")).toThrow(/keep or skip/);
  });
});
