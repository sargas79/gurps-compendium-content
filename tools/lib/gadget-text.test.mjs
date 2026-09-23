import { describe, expect, it } from "vitest";

import { gadgetLines, stripPrice, withoutPriceStub } from "./gadget-text.mjs";

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

  it("leaves a line holding one gadget whole", () => {
    expect(gadgetLines("Whetstone (TL5). For sharpening tools and weapons. $5, 1 lb. LC4.")).toHaveLength(1);
  });
});
