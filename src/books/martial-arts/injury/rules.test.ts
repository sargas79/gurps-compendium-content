import { describe, expect, it } from "vitest";

import {
  carryThroughDr,
  carryThroughInjury,
  otherPart,
  painSetsIn,
  painThreshold,
  painWill,
  partialInjury,
  severeWound,
  severs,
  woundDuration,
  woundEffect,
  woundTable,
  worstBleeding,
} from "./rules.js";

/** Realistic injury (GURPS Martial Arts pp. 136, 138-139). */
describe("partial injuries", () => {
  it("bands an arm wound by HP/5, HP/3 and HP/2, and the torso by 1/3, 1/2 and 2/3 HP", () => {
    expect(partialInjury("arm", 2, 10)?.dx).toBe(-1);
    expect(partialInjury("arm", 3, 10)?.dx).toBe(-3);
    expect(partialInjury("arm", 4, 10)).toMatchObject({ dx: -5, willRoll: true });
    expect(partialInjury("arm", 6, 10)).toBeNull();
    expect(partialInjury("leg", 3, 10)).toMatchObject({ dodge: -1, move: 0.8 });
    expect(partialInjury("torso", 3, 10)).toBeNull();
    expect(partialInjury("torso", 6, 10)).toMatchObject({ dx: -2, move: 0.8 });
    expect(partialInjury("torso", 7, 10)).toMatchObject({ dx: -3, move: 0.5 });
  });

  it("halves for High Pain Threshold in your favour, 1.5× against you for Low, and waits 2×HT seconds", () => {
    expect([painThreshold(-1, "high"), painThreshold(-3, "high"), painThreshold(-1, "low"), painThreshold(-3, "low")]).toEqual([0, -1, -2, -5]);
    expect([painWill("high"), painWill("low")]).toEqual([3, -4]);
    expect([painSetsIn(19, 10), painSetsIn(20, 10)]).toEqual([false, true]);
  });
});

describe("extreme dismemberment", () => {
  it("carries Leif's greatsword through to the other arm for 3 injury", () => {
    // 11 HP spearman: the arm cripples at HP/2 (5.5), and 15 injury is over twice that.
    expect(severs(15, 5.5)).toBe(true);
    expect(otherPart("arm")).toBe("arm");
    const dr = carryThroughDr({ newDr: 2, severedDr: 2, hp: 11, limb: true });
    expect(dr).toBe(10);
    expect(carryThroughInjury(12, dr)).toBe(3);
  });
});

describe("severe bleeding and lasting wounds", () => {
  it("bleeds a vitals wound every 30 seconds at -4, needing Surgery", () => {
    expect(severeWound({ hitLocation: "vitals", damageType: "imp" })).toEqual({ intervalSeconds: 30, modifier: -4, surgery: true });
    expect(severeWound({ hitLocation: "arm", addonLocation: "gurps-compendium-content.ma-armVein", damageType: "cut" })).toMatchObject({ modifier: -4 });
    expect(severeWound({ hitLocation: "arm", damageType: "cut", severed: "limb" })).toEqual({ intervalSeconds: 30, modifier: -4, surgery: false });
    expect(severeWound({ hitLocation: "torso", damageType: "cr" })).toBeNull();
    expect(worstBleeding([{ intervalSeconds: 60, modifier: -2, surgery: false }, { intervalSeconds: 30, modifier: -1, surgery: true }])).toEqual({ intervalSeconds: 30, modifier: -2, surgery: true });
  });

  it("rolls the skull table, sends a neck stroke there, and times it with HT", () => {
    expect(woundTable("eye")).toBe("skull");
    expect(woundTable("arm", "gurps-compendium-content.ma-armVein")).toBe("veins");
    expect(woundEffect("skull", 3)).toBe("epilepsy");
    expect(woundEffect("skull", 10)).toBeNull();
    expect(woundEffect("neck", 4)).toBe("reroll:skull");
    expect([woundDuration({ success: true }), woundDuration({ success: false }), woundDuration({ success: false, criticalFailure: true })]).toEqual(["shortTerm", "lasting", "permanent"]);
  });
});

describe("lasting injuries' traits (pp. 138-139)", () => {
  it("names the trait an effect is, and matches it with a specialty", async () => {
    const { LASTING_TRAITS, namesTrait } = await import("./rules.js");
    expect(LASTING_TRAITS.amnesiaGrave).toBe("Amnesia (Total)");
    expect(LASTING_TRAITS.lessHt).toBeUndefined();
    expect(namesTrait("Bad Sight (Nearsighted)", "Bad Sight")).toBe(true);
    expect(namesTrait("Bad Sightedness", "Bad Sight")).toBe(false);
    expect(namesTrait("Numb", "numb")).toBe(true);
  });
});
