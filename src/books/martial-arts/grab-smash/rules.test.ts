import { describe, expect, it } from "vitest";

import {
  biteAllows,
  biteCanPin,
  biteDamage,
  extraArmBonus,
  extraLegBonus,
  insideGrapple,
  kissTheWallBonus,
  kissTheWallLocations,
  morePinArms,
  painFor,
} from "./rules.js";

/** Grab and Smash, pain, teeth and bodies in close combat (GURPS Martial Arts pp. 114-119). */
describe("grab and smash", () => {
  it("counts a knee to the face inside a grapple on the head, and the vitals inside the torso", () => {
    expect(insideGrapple("skull", { hitLocation: "face" })).toBe(true);
    expect(insideGrapple("face", { hitLocation: "face", addonLocation: "gurps-compendium-content.ma-nose" })).toBe(true);
    expect(insideGrapple("torso", { hitLocation: "vitals" })).toBe(true);
    expect(insideGrapple("arm", { hitLocation: "torso" })).toBe(false);
  });

  it("rams a lying foe only face or skull first, +1 against a hard surface", () => {
    expect(kissTheWallLocations(true)).toEqual(["face", "skull"]);
    expect(kissTheWallLocations(false)).not.toContain("foot");
    expect(kissTheWallBonus(true)).toBe(1);
  });

  it("turns points into pain: 5 is severe, 10 is agony", () => {
    expect([painFor(1), painFor(3), painFor(5), painFor(9), painFor(10)]).toEqual([null, "moderatePain", "severePain", "terriblePain", "agony"]);
  });
});

describe("teeth and bodies", () => {
  it("keeps an SM +0 biter off the vitals, skull and spine, and lets an SM +3 biter pin", () => {
    expect(biteAllows(0, { hitLocation: "vitals" })).toBe(false);
    expect(biteAllows(0, { hitLocation: "torso", addonLocation: "gurps-compendium-content.ma-spine" })).toBe(false);
    expect(biteAllows(0, { hitLocation: "arm" })).toBe(true);
    expect(biteAllows(1, { hitLocation: "vitals" })).toBe(true);
    expect([biteCanPin(2), biteCanPin(3)]).toEqual([false, true]);
  });

  it("bites for thrust-1 crushing, +1 per die with Brawling at DX+2", () => {
    expect(biteDamage({ dice: 1, adds: -1 }, null)).toEqual({ dice: 1, adds: -2 });
    expect(biteDamage({ dice: 1, adds: -1 }, 2)).toEqual({ dice: 1, adds: -1 });
  });

  it("gives a four-armed grappler +4 and +3 to pin a two-armed foe, and legs +1 each", () => {
    expect(extraArmBonus(4)).toBe(4);
    expect(morePinArms(4, 2)).toBe(3);
    expect(morePinArms(2, 2)).toBe(0);
    expect(extraLegBonus(4)).toBe(2);
  });
});
