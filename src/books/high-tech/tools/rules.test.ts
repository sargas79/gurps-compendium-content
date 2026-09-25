import { describe, expect, it } from "vitest";

import { toolSkillKey } from "../../../../system/src/rules/tech-level.js";
import {
  FIREFIGHTER_ALERT,
  LEAD_DOSE_OZ,
  LEAD_POISON,
  STOKES_LITTER,
  alertSounding,
  leadStage,
  liftOutcome,
  propaneRuptures,
  supplyLeft,
  addToDice,
  breakFreeRoll,
  chainsawMishap,
  diceRange,
  glassCutterOutcome,
  kitFor,
  kitPriceMultipliers,
  leadSymptomsWorsen,
  listOf,
  nailGunLevel,
  readiesNeeded,
  snapStrikesWielder,
  workDamage,
  type CarriedKit,
} from "./rules.js";

const kit = (size: CarriedKit["size"], skills: string[], close: string[] = [], distant: string[] = []): CarriedKit => ({ size, skills, close, distant });

describe("tool kits (High-Tech p. 24)", () => {
  it("leaves a kit's own skill to the system, TL marker or not", () => {
    expect(kitFor(kit("portable", ["Mechanic (Automobile)"]), "Mechanic/TL7 (Automobile)", toolSkillKey)).toBeNull();
  });

  it("gives a portable kit or workshop -2 for another specialty, and a mini-tool kit nothing", () => {
    expect(kitFor(kit("portable", ["Mechanic (Automobile)"]), "Mechanic/TL7 (Motorcycle)", toolSkillKey)).toBe(-2);
    expect(kitFor(kit("workshop", ["Armoury (Small Arms)"]), "Armoury/TL8 (Heavy Weapons)", toolSkillKey)).toBe(-2);
    expect(kitFor(kit("mini", ["Mechanic (Automobile)"]), "Mechanic/TL7 (Motorcycle)", toolSkillKey)).toBeNull();
    expect(kitFor(kit("portable", ["Mechanic (Automobile)"]), "Electrician/TL7", toolSkillKey)).toBeNull();
  });

  it("gives the wrong workshop -2 for a close craft and -5 for a distant one, the better where both", () => {
    const smithy = kit("workshop", ["Smith (Iron)"], ["Machinist"], ["Carpentry", "Machinist"]);
    expect(kitFor(smithy, "Machinist/TL6", toolSkillKey)).toBe(-2);
    expect(kitFor(smithy, "Carpentry", toolSkillKey)).toBe(-5);
    expect(kitFor(kit("portable", ["Smith (Iron)"], ["Machinist"]), "Machinist", toolSkillKey)).toBeNull();
  });

  it("reads a list of crafts as a person types it", () => {
    expect(listOf(" Smith (Iron), Jeweler ;Machinist ")).toEqual(["Smith (Iron)", "Jeweler", "Machinist"]);
  });

  it("prices a light craft's kit at a quarter and a tenth, and a large vehicle's by tons / 10", () => {
    expect(kitPriceMultipliers({ lightCraft: true, vehicleTons: 0 })).toEqual({ cost: 0.25, weight: 0.1 });
    expect(kitPriceMultipliers({ lightCraft: false, vehicleTons: 10 })).toEqual({ cost: 1, weight: 1 });
    // p. 24: a 2,000-ton submarine's workshop is 200 times the cost and weight.
    expect(kitPriceMultipliers({ lightCraft: false, vehicleTons: 2000 })).toEqual({ cost: 200, weight: 200 });
  });
});

describe("forced-entry tools (High-Tech pp. 25-30)", () => {
  const strike = (base: "thr" | "sw", modifier: number) => `${base}${modifier >= 0 ? "+" : ""}${modifier}`;
  const work = (damage: string, more: Partial<{ multiplier: number; carbideBonus: number }> = {}) => ({ damage, multiplier: 1, carbideBonus: 0, ...more });

  it("works a muscle-powered tool out at the user's ST and a power tool from its dice", () => {
    expect(workDamage(work("sw-3"), strike, false)).toBe("sw-3");
    expect(workDamage(work("1d+2"), strike, false)).toBe("1d+2");
    expect(workDamage(work("12d"), strike, false)).toBe("12d");
  });

  it("adds a carbide edge's +1, and doubles a lock buster's blow", () => {
    expect(workDamage(work("sw-3", { carbideBonus: 1 }), strike, true)).toBe("sw-2");
    expect(workDamage(work("sw-3", { carbideBonus: 1 }), strike, false)).toBe("sw-3");
    expect(workDamage(work("sw+4", { multiplier: 2 }), () => "2d+5", false)).toBe("2d+5x2");
  });

  it("adds to dice", () => {
    expect(addToDice("1d+2", 1)).toBe("1d+3");
    expect(addToDice("12d", -1)).toBe("12d-1");
    expect(addToDice("1d-1", 1)).toBe("1d");
    expect(addToDice("1", 1)).toBe("2");
  });

  it("counts the Ready maneuvers: the hand ram's two waived at ST 20, the door opener's three", () => {
    expect(readiesNeeded(2, 20, 12)).toBe(2);
    expect(readiesNeeded(2, 20, 20)).toBe(0);
    expect(readiesNeeded(3, 0, 25)).toBe(3);
  });

  it("settles the glass cutter's roll and the duct tape's", () => {
    expect(glassCutterOutcome(true, false)).toBe("cut");
    expect(glassCutterOutcome(false, false)).toBe("noisy");
    expect(glassCutterOutcome(false, true)).toBe("cutHand");
    expect(breakFreeRoll(12, null)).toEqual({ skill: "ST", level: 9 });
    expect(breakFreeRoll(12, 11)).toEqual({ skill: "Escape", level: 11 });
    expect(breakFreeRoll(12, 8)).toEqual({ skill: "ST", level: 9 });
  });
});

describe("chainsaws and nail guns (High-Tech pp. 27-28)", () => {
  it("rolls nothing on 1-2, a stall on 3-5 and a snap on 6", () => {
    expect([1, 2, 3, 4, 5, 6].map(chainsawMishap)).toEqual(["none", "none", "stall", "stall", "stall", "snap"]);
    expect(snapStrikesWielder(7)).toBe(true);
    expect(snapStrikesWielder(8)).toBe(false);
  });

  it("takes -4 off Guns (Pistol), and leaves DX-4 at default", () => {
    expect(nailGunLevel(14, false)).toBe(10);
    expect(nailGunLevel(8, true)).toBe(8);
  });
});

describe("household hazards (High-Tech pp. 31-33)", () => {
  it("lays a stove's 1d-1 to 2d out die by die", () => {
    expect(diceRange("1d-1", "2d")).toEqual(["1d-1", "1d", "1d+1", "1d+2", "2d-1", "2d"]);
    expect(diceRange("1d-3", "")).toEqual(["1d-3"]);
    expect(diceRange("1", "")).toEqual(["1"]);
  });

  it("makes lead a slow digestive poison, worse past half the victim's HP", () => {
    expect(LEAD_POISON).toMatchObject({ delivery: ["digestive"], resistanceModifier: -4, damage: "toxic", dice: 1, cycles: 3 });
    expect(LEAD_POISON.intervalSeconds).toBe(6 * 7 * 86400);
    expect(leadSymptomsWorsen(["1/3"])).toBe(false);
    expect(leadSymptomsWorsen(["1/3", "1/2"])).toBe(true);
  });
});

describe("supplies, lifting, propane, lead and the rescue gear (High-Tech pp. 25-33)", () => {
  it("counts down a torch's burn time and a strip's shots", () => {
    const bottle = { kind: "seconds" as const, amount: 30, refill: "bottle" as const };
    expect(supplyLeft(bottle, 0)).toBe(30);
    expect(supplyLeft(bottle, 29.7)).toBe(1);
    expect(supplyLeft(bottle, 45)).toBe(0);
  });

  it("lifts up to a rated load, and by ST up to 8 times Basic Lift, shifting up to 50", () => {
    const bl = (st: number) => (st * st) / 5;
    expect(liftOutcome({ lbs: 8000, st: 0 }, 8000, bl)).toBe("lifts");
    expect(liftOutcome({ lbs: 8000, st: 0 }, 8001, bl)).toBe("tooHeavy");
    // The TL8 spreader's Arm ST 45: BL 405.
    expect(liftOutcome({ lbs: 0, st: 45 }, 3240, bl)).toBe("lifts");
    expect(liftOutcome({ lbs: 0, st: 45 }, 20000, bl)).toBe("shifts");
    expect(liftOutcome({ lbs: 0, st: 45 }, 20251, bl)).toBe("tooHeavy");
  });

  it("ruptures a propane cylinder with anything but crushing that gets through", () => {
    expect(propaneRuptures("pi", 1)).toBe(true);
    expect(propaneRuptures("cr", 5)).toBe(false);
    expect(propaneRuptures("burn", 0)).toBe(false);
  });

  it("brings lead's worse symptoms past half the HP, and intensifying ones from the second failed roll", () => {
    expect(leadStage({ pastHalf: false, failedRolls: 1 })).toBe("");
    expect(leadStage({ pastHalf: true, failedRolls: 1 })).toBe("worse");
    expect(leadStage({ pastHalf: false, failedRolls: 2 })).toBe("intensifying");
    expect(LEAD_DOSE_OZ).toBe(0.25);
  });

  it("sounds a worn alert set off or on a wearer out cold, and gives the litter's occupant DR 5", () => {
    expect(alertSounding({ worn: true, set: false, unconscious: true })).toBe(true);
    expect(alertSounding({ worn: true, set: true, unconscious: false })).toBe(true);
    expect(alertSounding({ worn: false, set: true, unconscious: true })).toBe(false);
    expect(alertSounding({ worn: true, set: false, unconscious: false })).toBe(false);
    expect(FIREFIGHTER_ALERT.hearing).toBe(4);
    expect(STOKES_LITTER.dr).toBe(5);
  });
});
