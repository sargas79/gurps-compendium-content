import { describe, expect, it } from "vitest";

import {
  IMPLANTS,
  chipSlotCaps,
  chipSlotPrice,
  cognitiveCap,
  doubleDamage,
  easier,
  implantOf,
  operationOutcome,
  operationTerms,
  procedureAt,
  psychPermanenceModifier,
  recoveryText,
  skillChipPricePerPoint,
  usedPercent,
} from "./rules.js";

describe("the Surgical Procedures Table (Ultra-Tech p. 207)", () => {
  it("finds each implant's procedure by its record's name, eased at higher TLs", () => {
    expect(procedureAt(implantOf("Boosted Reflexes")!, 9)).toBe("major");
    expect(procedureAt(implantOf("Boosted Reflexes")!, 10)).toBe("minor");
    expect(procedureAt(implantOf("Accelerated Reflexes")!, 11)).toBe("radical");
    expect(procedureAt(implantOf("Accelerated Reflexes")!, 12)).toBe("major");
    expect(implantOf("bionic eye (two)")).toMatchObject({ eye: true, count: 2 });
    expect(implantOf("Psych Implant")?.brain).toBe(true);
    expect(implantOf("Laser Rifle")).toBeNull();
    expect(Object.keys(IMPLANTS).length).toBeGreaterThan(60);
    expect(easier("radical")).toBe("major");
    expect(easier("simple")).toBe("simple");
  });

  it("reads the table for an installation, the brain or eye figure for brain and eye surgery", () => {
    expect(operationTerms("major", { operation: "install", brainOrEye: false, robotic: true })).toEqual({ modifier: 0, minutes: 120, injury: "1d", recoverySeconds: 7 * 86400, fee: 10000, mechanicAllowed: false });
    expect(operationTerms("radical", { operation: "install", brainOrEye: true, robotic: true }).modifier).toBe(-5);
  });

  it("doubles recovery and injury without robotic instruments, a simple procedure's to 1d/2", () => {
    expect(operationTerms("minor", { operation: "install", brainOrEye: false, robotic: false })).toMatchObject({ injury: "1d", recoverySeconds: 2 * 86400 });
    expect(operationTerms("simple", { operation: "install", brainOrEye: false, robotic: false }).injury).toBe("1d/2");
    expect(doubleDamage("3d")).toBe("6d");
    expect(doubleDamage("1d/2")).toBe("1d");
    expect(doubleDamage("1")).toBe("2");
  });

  it("makes removal easier, and salvage from a corpse faster and cheaper (p. 208)", () => {
    expect(operationTerms("major", { operation: "remove", brainOrEye: false, robotic: true }).modifier).toBe(1);
    expect(operationTerms("major", { operation: "removeScrap", brainOrEye: false, robotic: true })).toMatchObject({ modifier: 2, minutes: 60 });
    expect(operationTerms("radical", { operation: "salvage", brainOrEye: false, robotic: true })).toMatchObject({ minutes: 80, fee: 10000, recoverySeconds: 0, mechanicAllowed: true });
  });

  it("halves recovery on a critical success, and doubles injury and risks defects on a critical failure", () => {
    const terms = operationTerms("major", { operation: "install", brainOrEye: true, robotic: true });
    expect(operationOutcome(terms, { success: true, critical: true }, { procedure: "major", brain: true })).toMatchObject({ installed: true, recoverySeconds: 3.5 * 86400 });
    expect(operationOutcome(terms, { success: false, critical: false }, { procedure: "major", brain: true })).toMatchObject({ installed: false, injury: "1d", defective: false, brainInjury: false });
    expect(operationOutcome(terms, { success: false, critical: true }, { procedure: "major", brain: true })).toMatchObject({ injury: "2d", defective: true, brainInjury: true });
    expect(operationOutcome(terms, { success: false, critical: true }, { procedure: "minor", brain: true }).brainInjury).toBe(false);
  });

  it("states recovery in hours, days or weeks", () => {
    expect(recoveryText(3600)).toEqual({ value: 1, unit: "hours" });
    expect(recoveryText(86400)).toEqual({ value: 1, unit: "days" });
    expect(recoveryText(28 * 86400)).toEqual({ value: 4, unit: "weeks" });
    expect(recoveryText(3.5 * 86400)).toEqual({ value: 3.5, unit: "days" });
  });
});

describe("parts and prices (pp. 208, 216-219)", () => {
  it("prices second-hand and salvaged parts by 1d+1", () => {
    expect(usedPercent("secondHand", 1)).toBe(20);
    expect(usedPercent("secondHand", 6)).toBe(70);
    expect(usedPercent("salvaged", 6)).toBe(35);
  });

  it("prices and caps chip slots, skill chips and cognitive enhancement by TL", () => {
    // A skip slot: one slot of 4 points.
    expect(chipSlotPrice(1, 4)).toBe(17000);
    expect(chipSlotCaps(9)).toEqual({ slots: 2, pointsPerChip: 10 });
    expect(chipSlotCaps(12)).toEqual({ slots: 5, pointsPerChip: 25 });
    expect(skillChipPricePerPoint(9)).toBe(1000);
    expect(skillChipPricePerPoint(11)).toBe(200);
    expect(cognitiveCap(10)).toBe(15);
    expect(cognitiveCap(12)).toBe(60);
  });

  it("gives Will+4 at three months to shake off a psych implant, -1 a doubling", () => {
    expect(psychPermanenceModifier(2)).toBeNull();
    expect(psychPermanenceModifier(3)).toBe(4);
    expect(psychPermanenceModifier(6)).toBe(3);
    expect(psychPermanenceModifier(12)).toBe(2);
    expect(psychPermanenceModifier(24)).toBe(1);
    expect(psychPermanenceModifier(9)).toBe(3);
  });
});
