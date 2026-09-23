import { describe, expect, it } from "vitest";

import { surgeryEquipment } from "../../../../system/src/rules/medicine.js";
import { deviceIn, deviceSkill } from "../../../shared/medical/rules.js";
import {
  ANTISEPTIC,
  CPR_MINUTES_PER_FP,
  HT_DEVICES,
  PORTABLE_SURGERY_FIRST_AID,
  SUTURING_IMPROVISED,
  cprFatigue,
  defibrillatorBonus,
  depletedGrade,
  firstAidGearWithoutFluids,
  hemostaticLine,
  surgicalKitLine,
} from "./rules.js";

describe("resuscitation (High-Tech p. 220)", () => {
  it("gives a manual defibrillator +2 at TL7 and +3 at TL8, or the record's own figure", () => {
    expect(defibrillatorBonus(0, 7)).toBe(2);
    expect(defibrillatorBonus(0, 8)).toBe(3);
    expect(defibrillatorBonus(3, 7)).toBe(3);
  });

  it("has the AED resuscitate at skill 12 through the shared device engine", () => {
    const aed = deviceIn(HT_DEVICES, "Automatic External Defibrillator (AED)")!;
    expect(deviceSkill(aed, "resuscitation", 8)).toBe(12);
    expect(deviceSkill(aed, "firstAid", 8)).toBeNull();
    expect(deviceIn(HT_DEVICES, "Manual Defibrillator (TL8)")).toBeNull();
  });

  it("charges a point of fatigue for each five minutes of CPR", () => {
    expect(CPR_MINUTES_PER_FP).toBe(5);
    expect([0, 1, 2, 3].map((before) => cprFatigue(before, 1))).toEqual([0, 0, 0, 0]);
    expect(cprFatigue(4, 1)).toBe(1);
    expect(cprFatigue(9, 1)).toBe(1);
    expect(cprFatigue(0, 10)).toBe(2);
  });
});

describe("first aid gear (High-Tech pp. 220-221, 224)", () => {
  it("holds first aid gear to +1 without blood or IV fluids, leaving less alone", () => {
    expect(firstAidGearWithoutFluids(2)).toBe(1);
    expect(firstAidGearWithoutFluids(1)).toBe(1);
    expect(firstAidGearWithoutFluids(-5)).toBe(-5);
  });

  it("steps a depleted kit down a grade: fine to good to basic to improvised", () => {
    expect(depletedGrade("fine")).toBe("good");
    expect(depletedGrade("good")).toBe("basic");
    expect(depletedGrade("basic")).toBe("improvised");
    expect(depletedGrade("improvised")).toBe("improvised");
    expect(depletedGrade("best")).toBe("fine");
  });

  it("adds hemostatic bandages' +1 only where it beats the gear in use", () => {
    expect(hemostaticLine(0)).toBe(1);
    expect(hemostaticLine(1)).toBe(0);
    expect(hemostaticLine(2)).toBe(0);
    expect(hemostaticLine(-5)).toBe(6);
    expect(PORTABLE_SURGERY_FIRST_AID).toBe(2);
  });
});

describe("surgery (High-Tech pp. 223-225)", () => {
  it("cancels the Basic Set table's line for the TL of the operation, the kit's own standing", () => {
    // The kits' own modifiers are the table's by their TLs: -2, 0, +1, +2.
    expect([5, 6, 7, 8].map(surgeryEquipment)).toEqual([-2, 0, 1, 2]);
    expect(surgicalKitLine(surgeryEquipment(8))).toBe(-2);
    expect(surgicalKitLine(surgeryEquipment(5))).toBe(2);
    expect(surgicalKitLine(surgeryEquipment(6))).toBe(0);
    expect(SUTURING_IMPROVISED).toBe(-5);
  });

  it("takes -2 off the infection roll with antiseptic", () => {
    expect(ANTISEPTIC.bonus).toBe(2);
  });
});
