import { describe, expect, it } from "vitest";

import { gadgetLines, stripPlainClosing, stripPrice, withoutPriceStub } from "./gadget-text.mjs";

describe("stripPrice", () => {
  it("drops an Ultra-Tech closing line", () => {
    expect(stripPrice("A handy pistol-sized version. $50, neg. weight, A/10 hr. LC4.")).toBe("A handy pistol-sized version.");
  });

  it("drops a High-Tech price range and what a price is per", () => {
    expect(stripPrice("The buckle can hide a small gun. $10-$50, neg. LC4.")).toBe("The buckle can hide a small gun.");
    expect(stripPrice("Wrapped in heavy, tar-covered rope. Per mile: $10,000, 2 tons. LC4.")).toBe("Wrapped in heavy, tar-covered rope.");
  });

  it("stops at the closing line, keeping a weight the text states", () => {
    expect(stripPrice("A leather duffle or similar. Holds 100 lbs. $60, 10 lbs. LC4.")).toBe("A leather duffle or similar. Holds 100 lbs.");
  });

  it("drops a sentence that only named the price", () => {
    expect(stripPrice("A handy makeshift restraint. A 60-yard roll is $5, 1 lb. LC4.")).toBe("A handy makeshift restraint.");
    expect(stripPrice("For air-powered tools. Per 5' length: $10, 1 lb. LC4.")).toBe("For air-powered tools.");
  });
});

// High-Tech: Electricity and Electronics closes a gadget on its power, price,
// weight and years, with no legality class (HT:EE pp. 8-9). The sentences here
// are made up; only the shape of the closing is the book's.
describe("stripPlainClosing", () => {
  it("drops the power, the price and weight, and the years", () => {
    expect(stripPlainClosing("Reads a small current. Household power. $52, 10 lbs. [1922] 1936.")).toBe("Reads a small current.");
    expect(stripPlainClosing("A pocket model. 2×XS/120 hours or rechargeable/120 hours. $40, 1 lb. 1960.")).toBe("A pocket model.");
    expect(stripPlainClosing("A bench model. Household power. $4,000; 25 lbs. 2000.")).toBe("A bench model.");
    expect(stripPlainClosing("Bolted to the floor. Household power. $3,700, stationary. [1938] 1940.")).toBe("Bolted to the floor.");
    expect(stripPlainClosing("A short one. 2×XS, $260, 1.25 lb. 1993.")).toBe("A short one.");
  });

  it("drops a prototype's complexity and years", () => {
    expect(stripPlainClosing("A stack of discs. Simple complexity. Stationary. [1800].")).toBe("A stack of discs.");
    expect(stripPlainClosing("A glass jar. Simple complexity. 0.75 lb. [1745].")).toBe("A glass jar.");
  });

  it("drops every closing in an entry that prices two models", () => {
    expect(stripPlainClosing("A big one. $280, 7.5 lbs. 1980. A compact one. XS/4 hours. $150, 6 lbs. 1985.")).toBe("A big one. A compact one.");
    expect(stripPlainClosing("A bulb. $1.50, neg. Small bulbs too. $5/dozen, neg. [1906] 1911.")).toBe("A bulb. Small bulbs too.");
    expect(stripPlainClosing("A probe. 0.5 lb., $100. [1909] 1929. A meter. Household power. $960, 15 lbs.")).toBe("A probe. A meter.");
  });

  it("drops a closing line that says more than its price", () => {
    expect(stripPlainClosing("A pen. Household power. $750, 15 lbs.; $375, 10 lbs. for each extra pen. [1888] 1900.")).toBe("A pen.");
    expect(stripPlainClosing("A mast. $1,100, 100 lbs. (mast not included). [1887] 1930.")).toBe("A mast.");
    expect(stripPlainClosing("A lamp. A sturdier one costs $40, 2 lbs., with DR 3. [1899] 1911.")).toBe("A lamp.");
    expect(stripPlainClosing("A lamp. $30, 3 lbs. 1878 for arcs (p. 20); 1904 for filaments.")).toBe("A lamp.");
    expect(stripPlainClosing("Sold in boxes. A box of ten is $5, 1 lb. [1885] 1915.")).toBe("Sold in boxes.");
  });

  it("drops years printed a sentence after the price", () => {
    expect(stripPlainClosing("A meter. XS/120 hours. $26, 4 lbs. Later models read more. 1923.")).toBe("A meter. Later models read more.");
  });

  it("leaves a sentence that merely ends on a year", () => {
    expect(stripPlainClosing("It was first shown in 1911.")).toBe("It was first shown in 1911.");
    expect(stripPlainClosing("Runs on household power.")).toBe("Runs on household power.");
  });
});

describe("withoutPriceStub", () => {
  it("leaves a finished sentence alone", () => {
    expect(withoutPriceStub("Keeps indefinitely.")).toBe("Keeps indefinitely.");
  });

  it("leaves a long unfinished tail for a person to read", () => {
    const tail = "x".repeat(130);
    expect(withoutPriceStub(`One. ${tail}`)).toBe(`One. ${tail}`);
  });

  it("empties a label that was all price", () => {
    expect(withoutPriceStub("Per meal:")).toBe("");
  });
});

describe("gadgetLines", () => {
  it("breaks after a legality class and before a labelled gadget", () => {
    expect(gadgetLines("Holdout -1. $50, 0.5 lb. LC4. Magnetic Diskettes (TL7)")).toEqual([
      "Holdout -1. $50, 0.5 lb. LC4.",
      "Magnetic Diskettes (TL7)",
    ]);
    expect(gadgetLines("Dive Mask (TL6). See Goggles (p. 71). Snorkel (TL6). A modern snorkel.")).toEqual([
      "Dive Mask (TL6). See Goggles (p. 71). ",
      "Snorkel (TL6). A modern snorkel.",
    ]);
  });

  it("breaks before a label opening on a lower-case unit", () => {
    expect(gadgetLines("A meter. $10, 1 lb. 1950. pH Meter (TL7). A small one.")).toEqual(["A meter. $10, 1 lb. 1950. ", "pH Meter (TL7). A small one."]);
  });

  it("leaves a line holding one gadget whole", () => {
    expect(gadgetLines("Whetstone (TL5). For sharpening tools and weapons. $5, 1 lb. LC4.")).toHaveLength(1);
  });
});
