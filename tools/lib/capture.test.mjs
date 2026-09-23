import { describe, expect, it } from "vitest";

import { captureSettings, entriesOn, nameRepeats, priceOf, recordKey, recordOf, weightOf } from "./capture.mjs";

/**
 * Reading gear off a book's pages. The text here is made up; the stat lines
 * are the books' own, which is all a record keeps.
 */

const ULTRA_TECH = captureSettings({});
const HIGH_TECH = captureSettings({ labelEnd: ".", cellSizes: ["T", "XS", "S", "M", "L", "VL"], runInHeadings: true, repeatsByTl: true });
const book = (slug, reference) => ({ slug, reference });

/** One page's entries, read the way the tool reads a page. */
const read = (text, settings) => entriesOn(["", text], 1, 1, 1, settings);
const record = (entry, settings, slug = "high-tech", reference = "High-Tech") => recordOf(entry, book(slug, reference), ["First Aid", "Sewing", "Forced Entry"], settings);

describe("Ultra-Tech's labels, the default", () => {
  it("reads a label run into its text with a colon, and its closing line", () => {
    const [entry] = read("Pocket Medic (TL9): A small device that helps. $1,200, 1 lb., B/10 hr. LC4.", ULTRA_TECH);
    expect(entry).toMatchObject({ name: "Pocket Medic", tl: "9", heading: false });
    const { record: r } = record(entry, ULTRA_TECH, "ultra-tech", "Ultra-Tech");
    expect(r.system).toMatchObject({ cost: 1200, weight: 1, lc: 4, reference: "Ultra-Tech p. 1" });
    expect(r.system.extensions["gurps-compendium-content"].power.draw).toEqual({ cell: "B", cells: 1, endurance: "10 hr.", raw: "B/10 hr." });
  });

  it("doesn't take a label ending in a period for one", () => {
    expect(read("Saw (TL5). Cuts things. $20, 3 lbs. LC4.", ULTRA_TECH)).toEqual([]);
  });
});

describe("High-Tech's labels (#348)", () => {
  it("ends a label with a period, and splits entries run together on a line", () => {
    const entries = read("Hammer (TL5). Hits nails. $15, 3 lbs. LC4. Jack (TL5). Lifts cars. $75, 75 lbs. LC4.", HIGH_TECH);
    expect(entries.map((e) => [e.name, e.tl])).toEqual([["Hammer", "5"], ["Jack", "5"]]);
    expect(record(entries[1], HIGH_TECH).record.system).toMatchObject({ cost: 75, weight: 75, lc: 4 });
  });

  it("reads a heading at the end of a line, or run into its own first sentence", () => {
    const entries = read("Can (TL7). Holds fuel. $15, 10 lbs. LC4. Optical Disks (TL8)\nEvery computer reads them. $1, neg. LC4.\nWire Recorder (TL6) These came first. $1,500, 15 lbs., external power. LC4.", HIGH_TECH);
    expect(entries.map((e) => [e.name, e.heading])).toEqual([["Can", false], ["Optical Disks", true], ["Wire Recorder", true]]);
    expect(record(entries[1], HIGH_TECH).record.system).toMatchObject({ cost: 1, weight: 0, lc: 4 });
  });

  it("reads its battery sizes, counts written with a multiplication sign the PDF loses", () => {
    const [entry] = read("Head-Up Display (HUD) (TL8). A display. $5,000, 1.5 lbs., 4�S/4 hrs. LC4.", HIGH_TECH);
    const draw = record(entry, HIGH_TECH).record.system.extensions["gurps-compendium-content"].power.draw;
    expect(draw).toEqual({ cell: "S", cells: 4, endurance: "4 hrs.", raw: "4×S/4 hrs." });
    const [tiny] = read("Radio (TL8). Small. $250, 0.5 lb., 3�XS/10 hrs. LC4.", HIGH_TECH);
    expect(record(tiny, HIGH_TECH).record.system.extensions["gurps-compendium-content"].power.draw).toMatchObject({ cell: "XS", cells: 3 });
  });

  it("names an item printed at two TLs for its TL, and keeps both", () => {
    const entries = nameRepeats(read("Magnetic Tape (TL7). A reel. $100, 7 lbs. LC4. Magnetic Tape (TL8). A cartridge. $50, 0.5 lb. LC4.", HIGH_TECH), HIGH_TECH);
    expect(entries.map((e) => e.name)).toEqual(["Magnetic Tape (TL7)", "Magnetic Tape (TL8)"]);
    expect(new Set(entries.map((e) => recordKey(e, HIGH_TECH))).size).toBe(2);
    // Ultra-Tech doesn't: a repeated name is the same gadget.
    const ut = read("Scanner (TL9): One. $100, 1 lb. LC4. Scanner (TL10): Two. $50, 1 lb. LC4.", ULTRA_TECH);
    expect(nameRepeats(ut, ULTRA_TECH).map((e) => recordKey(e, ULTRA_TECH))).toEqual(["scanner", "scanner"]);
  });

  it("records food with no LC, and a quality bonus as the tools' grade", () => {
    const [food] = read("Portable Soup (TL5). Broth. One meal: $1.50, 1 lb.", HIGH_TECH);
    const out = record(food, HIGH_TECH);
    expect(out.record.system).toMatchObject({ cost: 1.5, weight: 1, lc: null });
    expect(out.notes).toContain("no LC printed");
    const [machine] = read("Sewing Machine (TL5). Treadle-driven. Gives +1 (quality) to Sewing skill. $50, 100 lbs. LC4.", HIGH_TECH);
    expect(record(machine, HIGH_TECH).record.system).toMatchObject({ category: "tool", equipmentQuality: "good", forSkills: ["Sewing"] });
  });
});

describe("prices and weights", () => {
  it("takes the lower of a price range", () => {
    expect(priceOf("$10-$50")).toBe(10);
    expect(priceOf("$10 million")).toBe(10_000_000);
    expect(priceOf("$1,200")).toBe(1200);
  });

  it("reads tons as 2,000 lbs., after any weight in pounds", () => {
    expect(weightOf(", 4 tons.")).toEqual({ weight: 8000 });
    expect(weightOf(", 13.5 tons, external power.")).toEqual({ weight: 27000 });
    expect(weightOf(", 200 lbs. per 2 tons")).toEqual({ weight: 200 });
    expect(weightOf(", neg.")).toEqual({ weight: 0 });
  });
});
