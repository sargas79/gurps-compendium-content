import { describe, expect, it } from "vitest";

import {
  aiComplexity,
  aiLegality,
  complexityForTl,
  computerFigures,
  conflictingOptions,
  decryptionHours,
  encryptionComplexity,
  hardwareFactors,
  highestAiIq,
  highestSoftware,
  hoursText,
  modelByName,
  NO_HARDWARE,
  programLoad,
  programsAtOnce,
  softwareCost,
  timeSpentModifier,
  toolComplexity,
  toolQuality,
} from "./rules.js";

describe("computer models (Ultra-Tech p. 22)", () => {
  it("reads the models from the records' names", () => {
    expect(modelByName("Personal Computer")).toBe("personal");
    expect(modelByName("Megacomputer")).toBe("megacomputer");
    expect(modelByName("Datapad")).toBeNull();
  });

  it("adds +2 Complexity at TL10 and +1 per TL after", () => {
    expect(complexityForTl(9)).toBe(0);
    expect(complexityForTl(10)).toBe(2);
    expect(complexityForTl(12)).toBe(4);
    expect(computerFigures({ model: "personal", tl: 11, options: {} }).complexity).toBe(8);
  });

  it("stores a thousand times more per TL, in the next unit", () => {
    const mainframe = computerFigures({ model: "mainframe", tl: 10, options: {} });
    expect(mainframe.storage).toBe(10_000);
    expect(mainframe.storageUnit).toBe("PB");
  });
});

describe("hardware options (Ultra-Tech p. 23)", () => {
  it("multiplies cost and weight and adds Complexity and LC", () => {
    // The book's own example: fast and hardened is 40 times the cost.
    expect(hardwareFactors({ fast: true, hardened: true })).toMatchObject({ cost: 40, weight: 2, complexity: 1 });
    expect(hardwareFactors({ genius: true, quantum: true })).toMatchObject({ cost: 5000, complexity: 2, lc: -2 });
  });

  it("keeps LC at zero or above", () => {
    expect(computerFigures({ model: "megacomputer", tl: 9, lc: 2, options: { genius: true, quantum: true, ftl: true } }).lc).toBe(0);
  });

  it("drops the options another excludes", () => {
    expect(conflictingOptions({ ...NO_HARDWARE, fast: true, slow: true })).toEqual(["slow"]);
    expect(conflictingOptions({ ...NO_HARDWARE, printed: true, quantum: true })).toEqual(["quantum"]);
    expect(hardwareFactors({ fast: true, genius: true }).complexity).toBe(1);
  });

  it("cuts a slow computer's storage and a printed one's harder", () => {
    expect(computerFigures({ model: "small", tl: 9, options: { slow: true } })).toMatchObject({ complexity: 3, storage: 1 });
    expect(computerFigures({ model: "personal", tl: 9, options: { printed: true } }).storage).toBeCloseTo(0.1);
  });

  it("prices extra storage at $1 and 0.001 lb. a unit", () => {
    expect(computerFigures({ model: "tiny", tl: 9, options: {}, extraStorage: 500 })).toMatchObject({ storage: 501, extraCost: 500, extraWeight: 0.5 });
  });
});

describe("programs at once (Ultra-Tech pp. 22-23)", () => {
  it("runs two of its own Complexity and ten times as many per level below", () => {
    expect(programsAtOnce(2, 2)).toBe(2);
    expect(programsAtOnce(2, 1)).toBe(20);
    expect(programsAtOnce(5, 3)).toBe(200);
    expect(programsAtOnce(2, 3)).toBe(0);
  });

  it("fills up with the book's mix: one Complexity 2 and ten Complexity 1", () => {
    expect(programLoad(2, [2, ...Array(10).fill(1)])).toBeCloseTo(1);
    expect(programLoad(2, [3])).toBe(Infinity);
  });

  it("runs half again as many on a high-capacity computer", () => {
    expect(programsAtOnce(4, 4, 3)).toBe(3);
  });
});

describe("software cost (Ultra-Tech p. 25)", () => {
  it("follows the table", () => {
    expect(softwareCost(1, 9)).toBe(10);
    expect(softwareCost(6, 9)).toBe(3000);
    expect(softwareCost(6, 12)).toBe(3);
    expect(softwareCost(11, 9)).toBe(1_000_000);
    expect(softwareCost(13, 10)).toBe(1_000_000);
    expect(softwareCost(15, 12)).toBe(100_000);
    expect(softwareCost(1, 12)).toBe(0.01);
  });

  it("has what the table calls unavailable cost nothing", () => {
    expect(softwareCost(12, 9)).toBeNull();
    expect(softwareCost(14, 10)).toBeNull();
    expect(softwareCost(3, 8)).toBeNull();
    expect(highestSoftware(11)).toBe(15);
  });
});

describe("software tools (Ultra-Tech p. 25)", () => {
  it("needs Complexity 4 or 5 for good and 6 or 7 for fine", () => {
    expect(toolComplexity("good", "E")).toBe(4);
    expect(toolComplexity("good", "H")).toBe(5);
    expect(toolComplexity("fine", "E")).toBe(6);
    expect(toolComplexity("fine", "VH")).toBe(7);
  });

  it("gives the best bonus the Complexity reaches", () => {
    expect(toolQuality(5, "A")).toEqual({ quality: "good", bonus: 1 });
    expect(toolQuality(6, "A")).toEqual({ quality: "good", bonus: 1 });
    expect(toolQuality(6, "E")).toEqual({ quality: "fine", bonus: 2 });
    expect(toolQuality(3, "E")).toEqual({ quality: "basic", bonus: 0 });
  });
});

describe("artificial intelligence (Ultra-Tech pp. 25, 27-28)", () => {
  it("needs IQ/2 plus the kind's step, rounded up", () => {
    expect(aiComplexity("dedicated", 10)).toBe(6);
    expect(aiComplexity("nonVolitional", 11)).toBe(8);
    expect(aiComplexity("volitional", 10)).toBe(8);
    expect(aiComplexity("weakDedicated", 7)).toBe(4);
    expect(aiComplexity("mindEmulation", 10)).toBe(8);
    expect(aiComplexity("volitional", 10, { fast: true })).toBe(9);
  });

  it("finds the highest IQ a computer runs", () => {
    expect(highestAiIq("volitional", 8)).toBe(10);
    expect(highestAiIq("volitional", 3)).toBeNull();
  });

  it("gives each kind its Legality Class", () => {
    expect(aiLegality("dedicated", 12)).toBe(4);
    expect(aiLegality("nonVolitional", 15)).toBe(3);
    expect(aiLegality("volitional", 8)).toBe(4);
    expect(aiLegality("volitional", 12)).toBe(3);
    expect(aiLegality("volitional", 17)).toBe(2);
    expect(aiLegality("volitional", 20)).toBe(1);
  });
});

describe("encryption (Ultra-Tech p. 47)", () => {
  it("needs Complexity 8 or 10 at TL9 and +2 per TL", () => {
    expect(encryptionComplexity("basic", 9)).toBe(8);
    expect(encryptionComplexity("secure", 11)).toBe(14);
  });

  it("takes a tenth the time per level above and ten times per level below", () => {
    expect(decryptionHours({ standard: "basic", tl: 9, complexity: 8 })).toBe(1);
    expect(decryptionHours({ standard: "basic", tl: 9, complexity: 9 })).toBeCloseTo(0.1);
    expect(decryptionHours({ standard: "basic", tl: 9, complexity: 12 })).toBe(0);
    expect(decryptionHours({ standard: "secure", tl: 9, complexity: 8 })).toBe(100);
  });

  it("gives a quantum computer +5, and triples its time per level below", () => {
    expect(decryptionHours({ standard: "secure", tl: 9, complexity: 5, quantum: true })).toBe(1);
    expect(decryptionHours({ standard: "secure", tl: 10, complexity: 6, quantum: true })).toBe(3);
    expect(decryptionHours({ standard: "secure", tl: 10, complexity: 5, quantum: true })).toBe(10);
    expect(decryptionHours({ standard: "secure", tl: 10, complexity: 4, quantum: true })).toBe(30);
  });

  it("takes the Basic Set's modifier for time spent", () => {
    expect(timeSpentModifier(8, 1)).toBe(3);
    expect(timeSpentModifier(100, 1)).toBe(5);
    expect(timeSpentModifier(1, 1)).toBe(0);
    expect(timeSpentModifier(0.5, 1)).toBe(-5);
    expect(timeSpentModifier(0.05, 1)).toBe(-9);
  });

  it("says a time the way the book does", () => {
    expect(hoursText(0.1)).toEqual({ value: 6, unit: "minutes" });
    expect(hoursText(0.01)).toEqual({ value: 36, unit: "seconds" });
    expect(hoursText(0)).toEqual({ value: 0, unit: "realTime" });
  });
});
