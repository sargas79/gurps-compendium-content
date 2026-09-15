import { describe, expect, it } from "vitest";

import {
  equipmentModifier,
  familiarityOffset,
  masterQualifies,
  outlineOf,
  perkAllowance,
  styleCost,
  stylesKnown,
  studentQualifies,
  trainingAllowance,
  TRAINING_TIMES,
  type StyleOutline,
} from "./rules.js";

const style = (name: string, required: string[]): StyleOutline => ({ name, familiarity: `Style Familiarity (${name})`, required, techniques: [], cinematic: [], perks: [] });

/** Styles and training (GURPS Martial Arts pp. 49, 141-148, 232-233). */
describe("a style's cost and whether it is known", () => {
  it("reads a style from its template: the ungrouped skills are the required ones", () => {
    const outline = outlineOf("Krav Maga", [
      { name: "Style Familiarity (Krav Maga)", itemType: "trait", group: "" },
      { name: "Karate", itemType: "skill", group: "" },
      { name: "Wrestling", itemType: "skill", group: "" },
      { name: "Arm Lock (Wrestling)", itemType: "technique", group: "techniques" },
      { name: "Power Blow", itemType: "skill", group: "cinematic" },
      { name: "Improvised Weapons (Karate)", itemType: "trait", group: "perks" },
      { name: "Brawling", itemType: "skill", group: "optional" },
    ]);
    expect(outline).toMatchObject({ required: ["Karate", "Wrestling"], techniques: ["Arm Lock (Wrestling)"], cinematic: ["Power Blow"], perks: ["Improvised Weapons (Karate)"] });
    expect(styleCost(outline!)).toBe(3);
    expect(outlineOf("Warrior", [{ name: "Brawling", itemType: "skill", group: "" }])).toBeNull();
  });

  it("puts Krav Maga (3) and Sambo (4) at 7 points, with the shared skill's surplus spendable on either", () => {
    const krav = style("Krav Maga", ["Karate", "Wrestling"]);
    const sambo = style("Sambo", ["Judo", "Wrestling", "Karate"]);
    const points: Record<string, number> = { "Style Familiarity (Krav Maga)": 1, "Style Familiarity (Sambo)": 1, Karate: 1, Wrestling: 1, Judo: 1 };
    const pointsIn = (name: string) => points[name] ?? 0;
    expect(stylesKnown([krav, sambo], pointsIn)).toMatchObject({ cost: 7, spent: 5, known: false });
    points.Judo = 3;
    expect(stylesKnown([krav, sambo], pointsIn)).toMatchObject({ cost: 7, spent: 7, known: true });
    expect(stylesKnown([krav], (name) => (name === "Wrestling" ? 0 : 2))).toMatchObject({ known: false, missing: ["Wrestling"] });
  });

  it("allows two general perks and four style perks at 40 points", () => {
    expect(perkAllowance(40, 40)).toEqual({ general: 2, style: 4 });
    expect(perkAllowance(19, 9)).toEqual({ general: 0, style: 0 });
  });

  it("takes 1 off a feint or Deceptive Attack from a foe whose styles are all familiar", () => {
    expect(familiarityOffset(-2, true)).toBe(1);
    expect(familiarityOffset(-2, false)).toBe(0);
    expect(familiarityOffset(0, true)).toBe(0);
  });
});

describe("training", () => {
  it("prices the equipment's bonus: fine +2, the best +TL/2 but at least +2, and +2 before TL6", () => {
    expect(equipmentModifier("basic", 8)).toBe(0);
    expect(equipmentModifier("fine", 8)).toBe(2);
    expect(equipmentModifier("best", 8)).toBe(4);
    expect(equipmentModifier("best", 3)).toBe(2);
    expect(equipmentModifier("", 8)).toBe(0);
  });

  it("rolls a month's Training Sequence with Teaching 14 and fine equipment against 18", () => {
    expect(14 + TRAINING_TIMES.month + equipmentModifier("fine", 8)).toBe(18);
  });

  it("needs a master with 20+ in the skills, Teaching 12+ and the spark", () => {
    expect(masterQualifies({ taughtLevels: [20, 21], teaching: 14, spark: true }).ok).toBe(true);
    expect(masterQualifies({ taughtLevels: [19], teaching: 11, spark: false }).reasons).toEqual(["skills", "teaching", "spark"]);
  });

  it("takes students with no attribute below average and two at +2, or a stylist at 16+", () => {
    expect(studentQualifies({ attributes: [10, 12, 12, 10], styleLevels: [] })).toBe(true);
    expect(studentQualifies({ attributes: [9, 12, 12, 10], styleLevels: [] })).toBe(false);
    expect(studentQualifies({ attributes: [9, 10, 10, 10], styleLevels: [16, 17] })).toBe(true);
  });

  it("lets a student spend up to the margin, +5 with Eidetic Memory, halved for Laziness", () => {
    expect(trainingAllowance(3, { eidetic: true, photographic: false, lazy: false, critical: false })).toEqual({ points: 8, free: 0 });
    expect(trainingAllowance(3, { eidetic: false, photographic: true, lazy: true, critical: true })).toEqual({ points: 6, free: 1 });
  });
});
