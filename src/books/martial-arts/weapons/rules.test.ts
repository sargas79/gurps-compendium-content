import { describe, expect, it } from "vitest";

import {
  accessoryAdds,
  balanceModifier,
  concealmentPrice,
  customQualityCost,
  holdoutBonus,
  holdoutPenalty,
  hooks,
  lowerGrade,
  makesTwoHanded,
  materialsPercent,
  parryAfterSkill,
} from "./rules.js";

const none = { rig: 0, trick: false, clothing: 0, disguise: "" as const };

/** Building weapons (GURPS Martial Arts pp. 214, 216-218, 221). */
describe("combination weapons", () => {
  it("makes a sickle with a two-yard kusari $80, 4.5 lbs., ST 10 and two-handed", () => {
    const adds = accessoryAdds(["kusari2"], false);
    expect([40 + adds.cost, 2 + adds.weight, 8 + adds.st]).toEqual([80, 4.5, 10]);
    expect(makesTwoHanded(["kusari2"])).toBe(true);
  });

  it("makes a scythe with a four-yard kusari $95, 10 lbs. and ST 14", () => {
    const adds = accessoryAdds(["kusari4"], true);
    expect([15 + adds.cost, 5 + adds.weight, 11 + adds.st]).toEqual([95, 10, 14]);
  });

  it("gives the Hook technique with a hook, a pick or a sickle", () => {
    expect(hooks(["pick"])).toBe(true);
    expect(hooks(["hammer", "spear"])).toBe(false);
    expect(accessoryAdds(["hook"], false)).toEqual({ cost: 25, weight: 0, st: 0 });
  });
});

describe("quality", () => {
  it("prices Sir Liam's sword at $15,600", () => {
    expect(materialsPercent("veryFine", "sword", 3)).toBe(1900);
    expect(customQualityCost(600, { balance: "fine", materials: 1900, presentation: 0, silver: "edged" })).toBe(15600);
  });

  it("prices General Schwarz's dress saber at $2,520", () => {
    expect(materialsPercent("cheap", "sword", 7)).toBe(-80);
    expect(customQualityCost(700, { balance: "cheap", materials: -80, presentation: 400, silver: "" })).toBe(2520);
  });

  it("never discounts past -80%", () => {
    expect(customQualityCost(100, { balance: "cheap", materials: -80, presentation: 0, silver: "" })).toBe(20);
  });

  it("prices fine materials by kind of weapon, and nothing at TL7+", () => {
    expect(materialsPercent("fine", "cutting", 3)).toBe(900);
    expect(materialsPercent("fine", "crushing", 3)).toBe(200);
    expect(materialsPercent("fine", "sword", 8)).toBe(0);
    expect(materialsPercent("fine", "bow", 8)).toBe(300);
    expect(materialsPercent("veryFine", "crushing", 3)).toBeNull();
  });

  it("gives balance -1 or +1 to skill, which moves Parry only across an even skill", () => {
    expect(balanceModifier("fine")).toBe(1);
    expect(balanceModifier("cheap")).toBe(-1);
    expect(parryAfterSkill(9, 12, 1)).toBe(9);
    expect(parryAfterSkill(9, 13, 1)).toBe(10);
    expect(parryAfterSkill(9, 12, -1)).toBe(8);
  });
});

describe("hidden weapons", () => {
  it("puts a dagger's Holdout at -1 and a kusari's at -6", () => {
    expect(holdoutPenalty({ ranged: false, bulk: 0, weight: 0.25, reaches: ["C"], flexible: false })).toBe(-1);
    expect(holdoutPenalty({ ranged: false, bulk: 0, weight: 5, reaches: ["1-4*"], flexible: true })).toBe(-6);
    expect(holdoutPenalty({ ranged: true, bulk: -3, weight: 3, reaches: [], flexible: false })).toBe(-3);
  });

  it("adds a rig's, a trick mechanism's and clothing's bonuses", () => {
    expect(holdoutBonus({ rig: 2, trick: true, clothing: 1, disguise: "" })).toBe(5);
  });

  it("caps a presentation javelin for $300 and 2.5 lbs., and hides a kusari in a jutte for $240", () => {
    expect(concealmentPrice(150, 2, { ...none, disguise: "cap" }, true)).toEqual({ cost: 300, weight: 2.5 });
    expect(concealmentPrice(80, 3.5, { ...none, disguise: "sheathed" }, false)).toEqual({ cost: 240, weight: 3.5 });
    expect(concealmentPrice(100, 1, { ...none, trick: true, rig: 1 }, false)).toEqual({ cost: 200, weight: 1 });
  });

  it("makes a sheathed blade a grade lower", () => {
    expect(lowerGrade("veryFine")).toBe("fine");
    expect(lowerGrade("good")).toBe("cheap");
  });
});
