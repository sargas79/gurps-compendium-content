import { describe, expect, it } from "vitest";

import { ablativeLoss } from "../../../../system/src/rules/armor.js";
import {
  armorHoldoutPenalty,
  canTurnUpTops,
  clothingHoldout,
  clothingHoldoutBonus,
  combinedSixths,
  concealArmorModifier,
  coversArc,
  frontDrAt,
  materialDr,
  materialPrice,
  partialStands,
  plateLoss,
  sixths,
  strikeAroundPenalty,
} from "./rules.js";

describe("partial coverage (High-Tech p. 69)", () => {
  it("protects on 1d at or under n, the n of several pieces added up", () => {
    expect(partialStands(2, 2)).toBe(true);
    expect(partialStands(2, 3)).toBe(false);
    expect(combinedSixths([2, 3])).toBe(5);
    expect(combinedSixths([5, 3])).toBe(6);
    expect(sixths(0)).toBe(6);
    expect(sixths(3)).toBe(3);
  });

  it("strikes around at -(n-1), never better than -1", () => {
    expect([1, 2, 3, 4, 5].map((n) => strikeAroundPenalty(n))).toEqual([-1, -1, -2, -3, -4]);
    expect(strikeAroundPenalty(6)).toBeNull();
    expect(strikeAroundPenalty(0)).toBeNull();
  });

  it("gives a piece's better DR from the front, an unknown arc counting as the front", () => {
    const vest = { dr: 8, locations: ["vitals"] };
    expect(frontDrAt(vest, "vitals", "front")).toBe(8);
    expect(frontDrAt(vest, "vitals", null)).toBe(8);
    expect(frontDrAt(vest, "vitals", "back")).toBeNull();
    expect(frontDrAt(vest, "torso", "front")).toBeNull();
    expect(frontDrAt({ dr: 0, locations: [] }, "torso", "front")).toBeNull();
    // The engine Ultra-Tech's tailored armour reads too, unchanged.
    expect(coversArc("front", "back")).toBe(false);
    expect(coversArc("backHalf", "back")).toBe(true);
  });

  it("knows the high boots whose tops turn up (p. 68 note 3)", () => {
    expect(canTurnUpTops("Boots, High")).toBe(true);
    expect(canTurnUpTops("Boots")).toBe(false);
  });
});

describe("concealing armour (High-Tech pp. 64, 66)", () => {
  it("penalises Holdout by DR for rigid armour and DR/3 rounded up for flexible", () => {
    expect(armorHoldoutPenalty(5, false)).toBe(-5);
    expect(armorHoldoutPenalty(12, true)).toBe(-4);
    expect(armorHoldoutPenalty(8, true)).toBe(-3);
  });

  it("lets a concealable design take up to 4 off the penalty, never past it", () => {
    // The Advanced Body Armor: 35 flexible, +4 (p. 67).
    expect(concealArmorModifier(35, true, 4)).toBe(-8);
    expect(concealArmorModifier(3, true, 4)).toBe(0);
    expect(concealArmorModifier(5, false, 9)).toBe(-1);
  });

  it("reads the clothes that hide things", () => {
    expect(clothingHoldout("Long Coat")).toEqual({ own: 4, undercover: 0 });
    expect(clothingHoldoutBonus("Long Coat, Leather")).toBe(4);
    expect(clothingHoldoutBonus("Wet-Weather Gear")).toBe(4);
    expect(clothingHoldoutBonus("Infrared-Suppressing Poncho")).toBe(4);
    expect(clothingHoldoutBonus("Undercover Clothing (Ordinary Clothes, +2)")).toBe(2);
    expect(clothingHoldoutBonus("Undercover Clothing (Long Coat, +1)")).toBe(5);
    expect(clothingHoldout("Ordinary Clothes")).toBeNull();
  });
});

describe("materials (High-Tech pp. 65, 67)", () => {
  it("reprices a piece", () => {
    expect(materialPrice({ cost: 900, weight: 30 }, "titanium")).toEqual({ cost: 4500, weight: 10 });
    expect(materialPrice({ cost: 900, weight: 30 }, "steelLight")).toEqual({ cost: 450, weight: 15 });
    expect(materialPrice({ cost: 30, weight: 6 }, "smartFoam")).toEqual({ cost: 300, weight: 6 });
    expect(materialPrice({ cost: 900, weight: 30 }, "steel")).toBeNull();
    expect(materialPrice({ cost: 900, weight: 30 }, "")).toBeNull();
  });

  it("changes the DR", () => {
    expect(materialDr(4, "steel", "cut")).toBe(8);
    expect(materialDr(4, "steelLight", "cut")).toBe(4);
    expect(materialDr(4, "titanium", "cut")).toBe(4);
    expect(materialDr(1, "smartFoam", "cr")).toBe(4);
    expect(materialDr(1, "smartFoam", "pi")).toBe(1);
    expect(materialDr(4, "", "cut")).toBe(4);
  });

  it("wears a trauma plate down as semi-ablative DR does", () => {
    for (const [basic, dr] of [[23, 25], [9, 25], [40, 2], [0, 5]] as const) {
      expect(plateLoss(basic, dr)).toBe(ablativeLoss({ ablative: "semiAblative", dr, basicDamage: basic }));
    }
  });
});
