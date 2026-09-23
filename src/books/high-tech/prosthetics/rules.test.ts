import { describe, expect, it } from "vitest";

import { appearanceOf, basicMoveRegained, buildOf, buildSteps, isBadSight, mitigations, planOperation, prostheticFor } from "./rules.js";

describe("prosthetics as Mitigators (High-Tech pp. 225-226)", () => {
  it("knows each prosthetic by the records' names", () => {
    expect(prostheticFor("Eyeglasses")?.mitigates.test("Bad Sight (Nearsighted)")).toBe(true);
    expect(prostheticFor("Contact Lenses")?.mitigates.test("Bad Sight (Farsighted)")).toBe(true);
    expect(prostheticFor("Hearing Aid")?.mitigates.test("Hard of Hearing")).toBe(true);
    expect(prostheticFor("Basic Arm Prosthetic")?.leaves).toEqual([{ name: "Ham-Fisted", levels: 2 }]);
    expect(prostheticFor("Advanced Leg Prosthetic")?.basicMove).toBe("all");
    expect(prostheticFor("Wheelchair (TL8)")).toBeNull();
  });

  it("takes out the trait each worn prosthetic answers, and leaves the lesser one", () => {
    const traits = ["Fit", "Bad Sight (Nearsighted)", "One Arm", "Hard of Hearing"];
    expect(mitigations(traits, ["Eyeglasses", "Basic Arm Prosthetic"])).toEqual([
      { trait: 1, by: "Eyeglasses", leaves: [] },
      { trait: 2, by: "Basic Arm Prosthetic", leaves: [{ name: "Ham-Fisted", levels: 2 }] },
    ]);
    expect(mitigations(traits, ["Advanced Arm Prosthetic"])).toEqual([{ trait: 2, by: "Advanced Arm Prosthetic", leaves: [] }]);
    // A second pair of glasses answers nothing more.
    expect(mitigations(traits, ["Eyeglasses", "Contact Lenses"])).toHaveLength(1);
    expect(mitigations(["Lame (Missing Legs)"], ["Basic Leg Prosthetic"])).toEqual([{ trait: 0, by: "Basic Leg Prosthetic", leaves: [] }]);
    // A leg prosthetic stands in for one missing leg, not for none at all.
    expect(mitigations(["Lame (Legless)"], ["Advanced Leg Prosthetic"])).toEqual([]);
    expect(mitigations(traits, [])).toEqual([]);
  });

  it("gives back a point of reduced Basic Move with the basic leg, all of it with the advanced", () => {
    const amputee = ["Lame (Missing Legs)"];
    expect(basicMoveRegained(3, amputee, ["Basic Leg Prosthetic"])).toBe(1);
    expect(basicMoveRegained(3, amputee, ["Advanced Leg Prosthetic"])).toBe(3);
    expect(basicMoveRegained(0, amputee, ["Advanced Leg Prosthetic"])).toBe(0);
    expect(basicMoveRegained(3, [], ["Advanced Leg Prosthetic"])).toBe(0);
    expect(basicMoveRegained(3, amputee, ["Eyeglasses"])).toBe(0);
  });

  it("reads Bad Sight in any of its forms", () => {
    expect(isBadSight("Bad Sight (Mitigator: Glasses, -60%)")).toBe(true);
    expect(isBadSight("Bad Temper")).toBe(false);
  });
});

describe("elective surgery (High-Tech p. 225)", () => {
  it("moves build a step either way between Very Fat and Skinny", () => {
    expect(buildOf(["Overweight", "Fit"])).toBe("Overweight");
    expect(buildOf([])).toBe("Average");
    expect(buildSteps("Average")).toEqual(["Overweight", "Skinny"]);
    expect(buildSteps("Very Fat")).toEqual(["Fat"]);
    expect(planOperation({ procedure: "build", techLevel: 8, build: "Fat", toward: "Overweight" })).toMatchObject({ from: "Fat", to: "Overweight", cost: 5000, recoveryDays: 7, refusal: null });
    expect(planOperation({ procedure: "build", techLevel: 8, build: "Fat", toward: "Average" }).refusal).toBe("NotABuildStep");
    expect(planOperation({ procedure: "build", techLevel: 6, build: "Fat", toward: "Overweight" }).refusal).toBe("TooLowTl");
  });

  it("reads Appearance as a step from Average", () => {
    expect(appearanceOf([])).toBe(0);
    expect(appearanceOf([{ name: "Appearance", levels: 1 }])).toBe(1);
    expect(appearanceOf([{ name: "Appearance", levels: 3 }])).toBe(2);
    expect(appearanceOf([{ name: "Appearance", levels: 4 }])).toBe(3);
    expect(appearanceOf([{ name: "Appearance (Disadvantage)", levels: 2 }])).toBe(-2);
    expect(appearanceOf([{ name: "Appearance (Attractive)", levels: 0 }])).toBe(1);
    expect(appearanceOf([{ name: "Handsome", levels: 0 }])).toBe(2);
  });

  it("improves Appearance a step per operation, at the step's price and TL", () => {
    expect(planOperation({ procedure: "appearance", techLevel: 7, appearance: 0 })).toMatchObject({ from: "Average", to: "Attractive", cost: 4000, refusal: null });
    expect(planOperation({ procedure: "appearance", techLevel: 7, appearance: 1 })).toMatchObject({ to: "Handsome/Beautiful", cost: 8000, refusal: null });
    expect(planOperation({ procedure: "appearance", techLevel: 7, appearance: 2 })).toMatchObject({ cost: 12000, tl: 8, refusal: "TooLowTl" });
    expect(planOperation({ procedure: "appearance", techLevel: 8, appearance: 2 }).refusal).toBeNull();
    expect(planOperation({ procedure: "appearance", techLevel: 9, appearance: 3 }).refusal).toBe("NoAppearanceStep");
    expect(planOperation({ procedure: "appearance", techLevel: 9, appearance: -2 }).refusal).toBe("NoAppearanceStep");
  });

  it("cures Bad Sight with laser surgery at TL8, $2,000 an eye", () => {
    expect(planOperation({ procedure: "vision", techLevel: 8, badSight: true, eyes: 2 })).toMatchObject({ cost: 4000, recoveryDays: 2, refusal: null });
    expect(planOperation({ procedure: "vision", techLevel: 8, badSight: true, eyes: 1 }).cost).toBe(2000);
    expect(planOperation({ procedure: "vision", techLevel: 7, badSight: true }).refusal).toBe("TooLowTl");
    expect(planOperation({ procedure: "vision", techLevel: 8, badSight: false }).refusal).toBe("NoBadSight");
  });

  it("removes fingerprints for $1,000 a hand", () => {
    expect(planOperation({ procedure: "fingerprints", techLevel: 6, hands: 2 })).toMatchObject({ cost: 2000, refusal: null });
    expect(planOperation({ procedure: "fingerprints", techLevel: 5 }).refusal).toBe("TooLowTl");
  });
});
