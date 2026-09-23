import { describe, expect, it } from "vitest";

import {
  accurateBonus,
  allowedQuality,
  feedOf,
  immediateActionModifier,
  isFullAuto,
  malfunctionAfter,
  modernMalfunction,
  qualityCostMultiplier,
  qualityProblems,
  qualityStep,
  rerollMalfunctions,
  ruggedObjectStats,
  specialtyCovers,
  specialtyOf,
  wearPenalty,
} from "./rules.js";

describe("firearm quality (High-Tech p. 79)", () => {
  it("gives +1 Acc for fine accuracy work on base Acc 2+, and +2 for very fine on Acc 4+", () => {
    expect(accurateBonus(1, 2)).toBe(1);
    expect(accurateBonus(1, 1)).toBe(0);
    expect(accurateBonus(2, 4)).toBe(2);
    // Very fine work on an Acc 3 attack is still the fine work: +1.
    expect(accurateBonus(2, 3)).toBe(1);
    expect(accurateBonus(0, 5)).toBe(0);
  });

  it("prices each improvement as a share of the gun's cost, added together", () => {
    expect(qualityCostMultiplier({ accurate: 0, reliable: 0 })).toBe(1);
    expect(qualityCostMultiplier({ accurate: 1, reliable: 0 })).toBe(1.75);
    expect(qualityCostMultiplier({ accurate: 2, reliable: 0 })).toBe(4.75);
    expect(qualityCostMultiplier({ accurate: 0, reliable: 1 })).toBe(1.25);
    expect(qualityCostMultiplier({ accurate: 0, reliable: 2 })).toBe(2.25);
    // Fine accurate and reliable together: the Basic Set's fine grade, twice the price.
    expect(qualityCostMultiplier({ accurate: 1, reliable: 1 })).toBe(2);
  });

  it("raises Malf. a step a grade, and holds it at 17 with a second roll past that", () => {
    expect(malfunctionAfter(16, 1, 0)).toEqual({ malfunction: 17, reroll: false });
    expect(malfunctionAfter(15, 2, 0)).toEqual({ malfunction: 17, reroll: false });
    expect(malfunctionAfter(17, 1, 0)).toEqual({ malfunction: 17, reroll: true });
    expect(malfunctionAfter(16, 2, 0)).toEqual({ malfunction: 17, reroll: true });
    expect(malfunctionAfter(17, 2, 0)).toEqual({ malfunction: 17, reroll: true });
    expect(malfunctionAfter(null, 2, 0)).toEqual({ malfunction: null, reroll: false });
  });

  it("takes the second roll away before a penalty takes Malf. below 17", () => {
    expect(malfunctionAfter(17, 1, 1)).toEqual({ malfunction: 17, reroll: false });
    expect(malfunctionAfter(17, 0, 1)).toEqual({ malfunction: 16, reroll: false });
    expect(malfunctionAfter(17, 1, 2)).toEqual({ malfunction: 16, reroll: false });
  });

  it("malfunctions on the second roll only when it reaches Malf. too", () => {
    expect(rerollMalfunctions(17, 17)).toBe(true);
    expect(rerollMalfunctions(16, 17)).toBe(false);
  });

  it("refuses accuracy work a gun is too inaccurate for, and reliability work on a full-automatic", () => {
    expect(isFullAuto([3])).toBe(false);
    expect(isFullAuto([1, 10])).toBe(true);
    expect(qualityProblems({ accurate: 1, reliable: 0 }, { bestAccuracy: 1, fullAuto: false })).toEqual(["accurate1"]);
    expect(qualityProblems({ accurate: 2, reliable: 0 }, { bestAccuracy: 3, fullAuto: false })).toEqual(["accurate2"]);
    expect(qualityProblems({ accurate: 0, reliable: 1 }, { bestAccuracy: 3, fullAuto: true })).toEqual(["fullAuto"]);
    expect(qualityProblems({ accurate: 2, reliable: 2 }, { bestAccuracy: 5, fullAuto: false })).toEqual([]);
    expect(allowedQuality({ accurate: 2, reliable: 2 }, { bestAccuracy: 3, fullAuto: true })).toEqual({ accurate: 1, reliable: 0 });
  });

  it("reads a step as 0, 1 or 2", () => {
    expect([qualityStep(-1), qualityStep("1"), qualityStep(5), qualityStep(undefined)]).toEqual([0, 1, 2, 0]);
  });
});

describe("gun care (High-Tech pp. 80-81, 129)", () => {
  it("counts the Malf. lost to wear, a cloth belt and an untrained shooter", () => {
    expect(wearPenalty({ lost: 0, clothBelt: false, untrained: false })).toBe(0);
    expect(wearPenalty({ lost: 2, clothBelt: true, untrained: true })).toBe(4);
  });

  it("makes a military gun at least DR 6, HT 11 and a famously rugged one DR 8, HT 12", () => {
    const system = { dr: 3, ht: 10 };
    expect([ruggedObjectStats(system, ""), ruggedObjectStats(system, "military"), ruggedObjectStats(system, "rugged")]).toEqual([
      { dr: 3, ht: 10 }, { dr: 6, ht: 11 }, { dr: 8, ht: 12 },
    ]);
    // A gun the system already makes tougher keeps its own figures.
    expect(ruggedObjectStats({ dr: 9, ht: 12 }, "military")).toEqual({ dr: 9, ht: 12 });
  });

  it("swaps misfires and stoppages at TL6-8, but not for a revolver", () => {
    expect(modernMalfunction("misfire", 7, false)).toBe("stoppage");
    expect(modernMalfunction("stoppage", 6, false)).toBe("misfire");
    expect(modernMalfunction("misfire", 7, true)).toBe("misfire");
    expect(modernMalfunction("misfire", 5, false)).toBe("misfire");
    expect(modernMalfunction("mechanical", 7, false)).toBe("mechanical");
  });
});

describe("Immediate Action (High-Tech pp. 81, 249-251)", () => {
  it("is -4 without the technique, and what the technique leaves of it", () => {
    expect(immediateActionModifier(null)).toBe(-4);
    expect(immediateActionModifier(-4)).toBe(-4);
    expect(immediateActionModifier(-1)).toBe(-1);
    expect(immediateActionModifier(2)).toBe(0);
    expect(immediateActionModifier(-6)).toBe(-4);
  });

  it("tells a magazine-fed self-loader from a belt-fed gun and everything else", () => {
    expect(feedOf({ shots: "7+1(3)", rateOfFire: 3, skill: "Guns (Pistol)" })).toBe("magazine");
    expect(feedOf({ shots: "30+1(3)", rateOfFire: 12, skill: "Guns (Rifle)" })).toBe("magazine");
    expect(feedOf({ shots: "250(5)", rateOfFire: 10, skill: "Gunner (Machine Gun)" })).toBe("belt");
    expect(feedOf({ shots: "100(5)", rateOfFire: 9, skill: "Guns (Light Machine Gun)" })).toBe("belt");
    // A Lewis gun's 47-round pan is a magazine.
    expect(feedOf({ shots: "47(5)", rateOfFire: 9, skill: "Guns (Light Machine Gun)" })).toBe("magazine");
    expect(feedOf({ shots: "6(3i)", rateOfFire: 3, skill: "Guns (Pistol)" })).toBe("other");
    expect(feedOf({ shots: "5+1(3)", rateOfFire: 1, skill: "Guns (Rifle)" })).toBe("other");
    expect(feedOf({ shots: "1,000(5)", rateOfFire: 5, skill: "Gunner (Machine Gun)" })).toBe("belt");
    expect(feedOf({ shots: "", rateOfFire: 1, skill: "Guns (Pistol)" })).toBe("other");
  });

  it("matches a perk's specialty to the weapon's skill", () => {
    expect(specialtyOf("Guns (Pistol)")).toBe("pistol");
    expect(specialtyCovers("Pistol", "Guns (Pistol)")).toBe(true);
    expect(specialtyCovers("Guns (Pistol)", "Guns (Pistol)")).toBe(true);
    expect(specialtyCovers("Rifle", "Guns (Pistol)")).toBe(false);
    expect(specialtyCovers("", "Guns (Pistol)")).toBe(false);
  });
});
