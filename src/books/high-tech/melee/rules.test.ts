import { describe, expect, it } from "vitest";

import {
  bayonetProfiles,
  bayonetReadies,
  bayonetReloadSeconds,
  builtForClubbing,
  canBeCompound,
  contactStunSeconds,
  gradeBelow,
  isContactStunner,
  levelFrom,
  longArmReach,
  replacementSheath,
  rifleButtProfiles,
  scaledRange,
  sheathHtModifier,
  sheathIsBaton,
  sheathWeight,
  sheathedWeight,
  stainlessSwordMultiplier,
  takesBladeMaterial,
} from "./rules.js";

describe("bayonets and rifle butts (pp. 197-198)", () => {
  it("takes four Ready maneuvers to fix, three after Fast-Draw (Knife)", () => {
    expect(bayonetReadies(false)).toBe(4);
    expect(bayonetReadies(true)).toBe(3);
  });

  it("slows a muzzleloader's reload by a tenth, rounded up", () => {
    expect(bayonetReloadSeconds(10)).toBe(11);
    expect(bayonetReloadSeconds(15)).toBe(17);
    expect(bayonetReloadSeconds(20)).toBe(22);
  });

  it("gives TL4-6 long arms Reach 1, 2* and TL7-8 ones Reach 1", () => {
    expect(longArmReach(5)).toBe("1,2*");
    expect(longArmReach(7)).toBe("1");
    expect(bayonetProfiles(true, 5)).toEqual([expect.objectContaining({ skill: "Spear", base: "thr", modifier: 3, damageType: "imp", reach: "1,2*", twoHanded: true })]);
    expect(bayonetProfiles(false, 8).map((p) => `${p.skill} ${p.base}${p.modifier} ${p.damageType} ${p.reach}`)).toEqual(["Knife sw-2 cut C,1", "Knife thr0 imp C"]);
  });

  it("strikes with the butt (Staff thr+2) or swings the gun (Two-Handed Axe/Mace sw+3)", () => {
    const [butt, club] = rifleButtProfiles(8);
    expect(butt).toMatchObject({ skill: "Staff", base: "thr", modifier: 2, damageType: "cr", reach: "1" });
    expect(club).toMatchObject({ skill: "Two-Handed Axe/Mace", base: "sw", modifier: 3, damageType: "cr" });
    expect(builtForClubbing(4, 1)).toBe(true);
    expect(builtForClubbing(6, 1)).toBe(false);
    expect(builtForClubbing(5, 7)).toBe(false);
  });

  it("uses the best of the skill and its defaults", () => {
    const [spear] = bayonetProfiles(true, 7);
    expect(levelFrom(spear!, (s) => (s === "DX" ? 12 : null))).toBe(7);
    expect(levelFrom(spear!, (s) => (s === "DX" ? 12 : s === "Staff" ? 13 : null))).toBe(11);
    expect(levelFrom(spear!, (s) => (s === "Spear" ? 14 : s === "DX" ? 12 : null))).toBe(14);
  });
});

describe("sheaths (p. 198)", () => {
  it("weighs the sheath a third of the table weight unless the book says", () => {
    expect(sheathWeight(3.75, 0)).toBe(1.25);
    expect(sheathWeight(1.5, 1)).toBe(1);
    expect(sheathedWeight(1, 0, "")).toBe(1);
    expect(sheathedWeight(3.75, 0, "flexible")).toBe(2.5);
    expect(sheathedWeight(1.5, 1, "none")).toBe(0.5);
  });

  it("gives -1 and -2 on HT rolls, and a rigid sheath of a pound or more is a baton", () => {
    expect(sheathHtModifier("")).toBe(0);
    expect(sheathHtModifier("flexible")).toBe(-1);
    expect(sheathHtModifier("none")).toBe(-2);
    expect(sheathIsBaton(3.75, 0, "")).toBe(true);
    expect(sheathIsBaton(1.5, 1, "")).toBe(true);
    expect(sheathIsBaton(1, 0, "")).toBe(false);
    expect(sheathIsBaton(3.75, 0, "flexible")).toBe(false);
  });

  it("prices a replacement sheath at a tenth of a good weapon, twice that rigid", () => {
    expect(replacementSheath(550)).toEqual({ flexible: 55, rigid: 110 });
  });
});

describe("blade composition (pp. 197-198)", () => {
  it("prices a stainless sword's grades from list", () => {
    expect(stainlessSwordMultiplier("cheap", 6)).toBe(1);
    expect(stainlessSwordMultiplier("good", 6)).toBe(8);
    expect(stainlessSwordMultiplier("fine", 6)).toBe(40);
    expect(stainlessSwordMultiplier("veryFine", 6)).toBeNull();
    expect(stainlessSwordMultiplier("good", 7)).toBe(1);
    expect(stainlessSwordMultiplier("fine", 8)).toBe(8);
    expect(stainlessSwordMultiplier("veryFine", 7)).toBe(40);
    expect(stainlessSwordMultiplier("cheap", 7)).toBeNull();
  });

  it("fits blades that cut or impale, and a sword cane is a grade lower", () => {
    expect(takesBladeMaterial(["cut", "imp"])).toBe(true);
    expect(takesBladeMaterial(["cr"])).toBe(false);
    expect(gradeBelow("fine")).toBe("good");
    expect(gradeBelow("cheap")).toBe("cheap");
  });
});

describe("stun weapons (p. 199)", () => {
  it("stuns for the contact and (20 - HT) seconds more, at least one", () => {
    expect(contactStunSeconds(0, 10)).toBe(10);
    expect(contactStunSeconds(3, 12)).toBe(11);
    expect(contactStunSeconds(0, 22)).toBe(1);
  });

  it("knows the book's stun weapons by name", () => {
    expect(isContactStunner("Stun Baton")).toBe(true);
    expect(isContactStunner("Cattle Prod")).toBe(true);
    expect(isContactStunner("Stun Wand")).toBe(false);
  });
});

describe("muscle-powered weapons (p. 201)", () => {
  it("builds any bow but a composite one compound", () => {
    expect(canBeCompound("Longbow")).toBe(true);
    expect(canBeCompound("Composite Bow")).toBe(false);
    expect(canBeCompound("Compound Longbow")).toBe(false);
  });

  it("scales a range to the ST it shoots at", () => {
    expect(scaledRange(150, 10, 12)).toBe(180);
  });
});
