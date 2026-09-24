/**
 * The supplement's appliances and power tools as pure rules (HT:EE pp. 14,
 * 20-25).
 */

import { describe, expect, it } from "vitest";

import { basicLift } from "../../../../system/src/rules/index.js";
import {
  KITCHEN_GEAR,
  PORTABLE_ELECTROMAGNET,
  SHREDDED,
  baseName,
  kitchenGearOf,
  kitchenModifier,
  kitchenSkillOf,
  magnetFigures,
  powerToolOf,
  powerToolWork,
  printedMagnet,
  weatherApplianceOf,
} from "./rules.js";

describe("heaters and fans (HT:EE pp. 21, 23)", () => {
  it("give +1 or +2 to HT against the cold or the heat, by the record's name", () => {
    expect(weatherApplianceOf("Incandescent Bulb Heater")).toMatchObject({ cold: 1 });
    expect(weatherApplianceOf("Resistance Wire Heater")).toMatchObject({ cold: 2 });
    expect(weatherApplianceOf("Large Fan")).toMatchObject({ heat: 2 });
    expect(weatherApplianceOf("Small Fan (TL6)")).toMatchObject({ heat: 1 });
    expect(weatherApplianceOf("Small Fan (TL8)")).toMatchObject({ heat: 1 });
    expect(weatherApplianceOf("Solid-State Heat Pump")).toBeNull();
  });
});

describe("kitchen gear (HT:EE p. 21)", () => {
  const options = { familiar: true, improvised: -2 };
  it("gives the microwave oven -2 to Cooking and -1 to Housekeeping, the induction cooker +1 to both", () => {
    const microwave = kitchenGearOf("Microwave Oven")!;
    expect(kitchenModifier(microwave, "Cooking", options)).toBe(-2);
    expect(kitchenModifier(microwave, "Housekeeping", options)).toBe(-1);
    const cooker = kitchenGearOf("Induction Cooker")!;
    expect(kitchenModifier(cooker, "Cooking", options)).toBe(1);
    expect(kitchenModifier(cooker, "Housekeeping", options)).toBe(1);
  });

  it("puts the induction cooker's unfamiliarity on it, and makes the hot plate improvised", () => {
    expect(kitchenModifier(kitchenGearOf("Induction Cooker")!, "Cooking", { familiar: false, improvised: -2 })).toBe(-1);
    expect(kitchenModifier(kitchenGearOf("Microwave Oven")!, "Cooking", { familiar: false, improvised: -2 })).toBe(-2);
    expect(kitchenModifier(kitchenGearOf("Hot Plate")!, "Housekeeping", { familiar: true, improvised: -2 })).toBe(-2);
    expect(KITCHEN_GEAR).toHaveLength(3);
    // High-Tech's institutional microwave is a hazard, not this.
    expect(kitchenGearOf("Microwave")).toBeNull();
  });

  it("knows Cooking and Housekeeping by name", () => {
    expect(kitchenSkillOf("Cooking")).toBe("Cooking");
    expect(kitchenSkillOf("Housekeeping")).toBe("Housekeeping");
    expect(kitchenSkillOf("Cooking (Baking)")).toBe("Cooking");
    expect(kitchenSkillOf("Cookery")).toBeNull();
  });
});

describe("shredders (HT:EE p. 23)", () => {
  it("is -5 to Forensics for a cross-cut shredder's pieces", () => {
    expect(SHREDDED).toEqual({ strips: 0, crosscut: -5 });
  });
});

describe("electromagnets (HT:EE pp. 22-23)", () => {
  it("works the book's example: an iron core 5 inches across is ST 40, BL 320 lbs., holding 3,200 lbs.", () => {
    expect(magnetFigures({ core: "iron", diameter: 5, length: 6 }, basicLift)).toEqual({ st: 40, basicLift: 320, load: 3200, reach: 6 });
  });

  it("gives the portable electromagnet ST 8 and the 130 lbs. it lifts, and a superconducting core 100 ST an inch", () => {
    expect(printedMagnet("Portable Electromagnet")).toEqual(PORTABLE_ELECTROMAGNET);
    expect(magnetFigures(PORTABLE_ELECTROMAGNET, basicLift)).toMatchObject({ st: 8, basicLift: 13, load: 130, reach: 1 });
    expect(magnetFigures({ core: "superconducting", diameter: 2, length: 4 }, basicLift).st).toBe(200);
    expect(printedMagnet("Magnetic Lock")).toBeNull();
  });
});

describe("power tools (HT:EE pp. 14, 21, 24)", () => {
  it("gives each tool its damage a second, against what it works on", () => {
    expect(powerToolOf("Power Drill")?.work).toMatchObject({ damage: "1d+2", type: "pi++", divisor: 2, every: 1, against: "wood" });
    expect(powerToolOf("Compact Power Drill")?.work.damage).toBe("1d+2");
    expect(powerToolOf("Circular Saw")?.work).toMatchObject({ damage: "sw+3", type: "cut", divisor: 2 });
    expect(powerToolOf("Compact Circular Saw")?.work).toMatchObject({ damage: "sw+1", type: "cut", divisor: 2 });
    expect(powerToolOf("Arc Welder")?.work).toMatchObject({ damage: "3d", type: "burn", divisor: 2, against: "" });
    expect(powerToolOf("Hot Plate")?.work).toMatchObject({ damage: "1d-3", type: "burn", divisor: 1 });
    expect(powerToolOf("Soldering Iron (TL6)")?.work).toMatchObject({ damage: "1", type: "burn" });
    expect(powerToolOf("Soldering Iron (TL7)")?.work).toMatchObject({ damage: "1", type: "burn" });
    expect(powerToolOf("Soldering Laser")).toBeNull();
    expect(powerToolOf("Replacement Arc Welder Electrode")).toBeNull();
  });

  it("gives a saw with a diamond blade (5) against concrete and brick, and an early drill -2", () => {
    const saw = powerToolOf("Circular Saw")!;
    expect(powerToolWork(saw, true)).toMatchObject({ damage: "sw+3", divisor: 5, against: "concreteRock" });
    expect(powerToolWork(saw, false)).toMatchObject({ divisor: 2, against: "wood" });
    // A drill has no diamond blade.
    expect(powerToolWork(powerToolOf("Power Drill")!, true).divisor).toBe(2);
    expect(powerToolOf("Power Drill")?.earlyPenalty).toBe(-2);
  });

  it("reads a record's name without the TL it repeats at", () => {
    expect(baseName("Small Fan (TL8)")).toBe("Small Fan");
    expect(baseName("Circular Saw")).toBe("Circular Saw");
  });
});
