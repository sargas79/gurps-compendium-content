import { describe, expect, it } from "vitest";

import { computerFigures, conflictingOptions, hardwareFactors, modelByName, programsAtOnce, toolQuality } from "../../../shared/computers/rules.js";
import { COMPUTERS, hudHelps, isHud, libraryGrade, manualRoll, softwareCost } from "./rules.js";

const build = (model: string, options: Record<string, boolean> = {}, tl = 8, lc: number | null = 4) => computerFigures(COMPUTERS, { model, tl, options, lc });

describe("computer types (High-Tech p. 20)", () => {
  it("reads the models from the records' names", () => {
    expect(modelByName(COMPUTERS, "Medium Computer")).toBe("medium");
    expect(modelByName(COMPUTERS, "Megacomputer")).toBe("megacomputer");
    expect(modelByName(COMPUTERS, "Personal Computer")).toBeNull();
    expect(modelByName(COMPUTERS, "Datapad")).toBeNull();
  });

  it("gives each model its TL8 Complexity and storage in gigabytes", () => {
    expect(build("tiny")).toMatchObject({ complexity: 1, storage: 1, storageUnit: "GB", tl: 8, problems: [] });
    expect(build("megacomputer")).toMatchObject({ complexity: 7, storage: 1_000_000, storageUnit: "GB" });
  });

  it("reads a TL8 figure the same whatever TL the record states", () => {
    // The Mainframe record is TL6, when the model appears; its figures are the TL8 machine's.
    expect(build("mainframe", {}, 6)).toMatchObject({ complexity: 5, storageUnit: "GB", problems: ["needsEarly"] });
  });
});

describe("customizing hardware (High-Tech p. 20)", () => {
  it("multiplies cost and weight and adds Complexity", () => {
    // The book's own example: hardened and fast together is 40 times the cost.
    expect(hardwareFactors(COMPUTERS, { hardened: true, fast: true }, 8)).toMatchObject({ cost: 40, weight: 2, complexity: 1, hardening: 3 });
    expect(hardwareFactors(COMPUTERS, { compact: true, highCapacity: true }, 8)).toMatchObject({ cost: 3, weight: 0.5, programs: 1.5 });
    expect(build("medium", { slow: true })).toMatchObject({ complexity: 2, costFactor: 0.05, storage: 100 });
  });

  it("keeps fast and slow apart", () => {
    expect(conflictingOptions(COMPUTERS, { fast: true, slow: true }, 8)).toEqual(["slow"]);
  });

  it("runs three programs of its own Complexity when high-capacity", () => {
    const computer = build("medium", { highCapacity: true });
    expect(programsAtOnce(computer.complexity, computer.complexity, computer.programsAtOwn)).toBe(3);
  });

  it("changes no cells: the book's compact computer only halves the weight", () => {
    expect(build("small", { compact: true }).cellFactor).toBe(1);
  });
});

describe("alternate technologies (High-Tech pp. 20-21)", () => {
  it("takes Complexity off and stores in the TL's unit", () => {
    expect(build("mainframe", { mechanical: true }, 6)).toMatchObject({ complexity: 0, storageUnit: "bytes", tl: 6, problems: [] });
    expect(build("microframe", { transistor: true }, 7)).toMatchObject({ complexity: 1, storageUnit: "KB", tl: 7, problems: [] });
  });

  it("makes a vacuum-tube computer hardened at no extra cost", () => {
    expect(build("mainframe", { vacuumTube: true }, 7)).toMatchObject({ complexity: 1, hardening: 3, costFactor: 1 });
    // Hardening it again changes nothing.
    expect(conflictingOptions(COMPUTERS, { vacuumTube: true, hardened: true }, 7)).toEqual(["hardened"]);
  });

  it("takes only one early technology", () => {
    expect(conflictingOptions(COMPUTERS, { mechanical: true, transistor: true }, 6)).toEqual(["transistor"]);
  });

  it("leaves out an option not built yet at the computer's TL", () => {
    // Fast is TL8; a transistor machine is TL7.
    expect(conflictingOptions(COMPUTERS, { transistor: true, fast: true }, 7)).toEqual(["fast"]);
    // Compact is TL7; a mechanical machine is TL6.
    expect(build("mainframe", { mechanical: true, compact: true }, 6).costFactor).toBe(1);
  });

  it("says when a design can't be built", () => {
    // Below 0 after all modifiers: design a larger computer.
    expect(build("small", { mechanical: true }, 6)).toMatchObject({ complexity: 0, problems: ["belowZero", "modelTooLate"] });
    // A TL7 computer needs one of the technologies.
    expect(build("microframe", {}, 7).problems).toEqual(["needsEarly"]);
  });
});

describe("program cost (High-Tech p. 22)", () => {
  it("follows the TL8 column", () => {
    expect(softwareCost(0, 8)).toBe(30);
    expect(softwareCost(1, 8)).toBe(100);
    expect(softwareCost(2, 8)).toBe(300);
    expect(softwareCost(5, 8)).toBe(10_000);
    expect(softwareCost(8, 8)).toBe(300_000);
  });

  it("charges ten times as much at TL6-7", () => {
    expect(softwareCost(0, 7)).toBe(300);
    expect(softwareCost(3, 6)).toBe(10_000);
    expect(softwareCost(7, 7)).toBe(1_000_000);
  });

  it("has no price where the table has none", () => {
    expect(softwareCost(8, 7)).toBeNull();
    expect(softwareCost(9, 8)).toBeNull();
    expect(softwareCost(2, 5)).toBeNull();
  });
});

describe("software tools (High-Tech p. 22)", () => {
  it("needs a basic program of Complexity 2 or 3 to use the skill at all", () => {
    expect(toolQuality(COMPUTERS, 1, "E")).toEqual({ quality: "none", bonus: 0 });
    expect(toolQuality(COMPUTERS, 2, "E")).toEqual({ quality: "basic", bonus: 0 });
    expect(toolQuality(COMPUTERS, 2, "A")).toEqual({ quality: "none", bonus: 0 });
    expect(toolQuality(COMPUTERS, 3, "VH")).toEqual({ quality: "basic", bonus: 0 });
  });

  it("gives good +1 at 4 or 5 and fine +2 at 6 or 7", () => {
    expect(toolQuality(COMPUTERS, 4, "E")).toEqual({ quality: "good", bonus: 1 });
    expect(toolQuality(COMPUTERS, 4, "H")).toEqual({ quality: "basic", bonus: 0 });
    expect(toolQuality(COMPUTERS, 7, "A")).toEqual({ quality: "fine", bonus: 2 });
  });
});

describe("head-up display (High-Tech p. 21)", () => {
  it("knows the record and the skills it helps", () => {
    expect(isHud("Head-Up Display (HUD)")).toBe(true);
    expect(isHud("Heads-Up Poker Table")).toBe(false);
    expect(hudHelps("Driving (Automobile)")).toBe(true);
    expect(hudHelps("Piloting/TL8 (Light Airplane)")).toBe(true);
    expect(hudHelps("Gunner (Machine Gun)")).toBe(false);
  });
});

describe("manuals (High-Tech p. 17)", () => {
  it("rolls the skill at its attribute default", () => {
    expect(manualRoll(12, "E")).toEqual({ base: 8, penalty: -4, time: 0 });
    expect(manualRoll(12, "VH")).toMatchObject({ base: 5, penalty: -7 });
  });

  it("lets extra time win back the penalty and no more", () => {
    // Four times as long is +2.
    expect(manualRoll(12, "A", 4).time).toBe(2);
    // Thirty times as long is +5 on the Time Spent table; an Easy skill's -4 caps it.
    expect(manualRoll(12, "E", 30).time).toBe(4);
  });
});

describe("libraries (High-Tech p. 18)", () => {
  it("reads the grade from the records' names", () => {
    expect(libraryGrade("Small Collection (per skill)")).toBe("smallCollection");
    expect(libraryGrade("Good Library (per skill)")).toBe("good");
    expect(libraryGrade("Fine Library (per skill)")).toBe("fine");
    expect(libraryGrade("Library Card")).toBeNull();
  });
});
