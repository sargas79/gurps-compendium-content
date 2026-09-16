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

describe("worrying at a bite (p. 115)", () => {
  it("names the part, caps the injury and takes parts off", async () => {
    const { bittenPart, worryCap, bittenOff } = await import("./rules.js");
    expect(bittenPart("face", "gurps-compendium-content.ma-nose")).toBe("nose");
    expect(bittenPart("hand", null)).toBe("extremity");
    expect(bittenPart("arm", "gurps-compendium-content.ma-armJoint")).toBe("limbTendon");
    expect(bittenPart("torso", null)).toBe("other");
    expect([worryCap("nose", 12), worryCap("extremity", 12), worryCap("other", 12)]).toEqual([3, 4, null]);
    expect(bittenOff("nose", 5, 12)).toBeNull();
    expect(bittenOff("nose", 6, 12)).toBe("nose");
    expect(bittenOff("ear", 6, 12)).toBe("ear");
    expect(bittenOff("extremity", 8, 12)).toBe("finger");
    expect(bittenOff("other", 100, 12)).toBeNull();
  });
});

describe("bodies in close combat (pp. 115, 119-120)", () => {
  it("makes a Born Biter's jaw and nose easier to find", async () => {
    const { bornBiterTargeting } = await import("./rules.js");
    expect([bornBiterTargeting(0), bornBiterTargeting(3), bornBiterTargeting(5)]).toEqual([0, 3, 3]);
  });

  it("gives a Horizontal fighter the low line and costs him the high one", async () => {
    const { horizontalHit, horizontalDamagePerDie, horizontalRefuses } = await import("./rules.js");
    expect([horizontalHit("leg", 0), horizontalHit("skull", 1), horizontalHit("torso", 0), horizontalHit("leg", 2)]).toEqual([1, -1, 0, 0]);
    expect([horizontalDamagePerDie("kick", false), horizontalDamagePerDie("kick", true), horizontalDamagePerDie("headButt", false)]).toEqual([-1, 0, 1]);
    expect([horizontalRefuses("Piledriver"), horizontalRefuses("Elbow Strike"), horizontalRefuses("Punch")]).toEqual([true, true, false]);
  });

  it("weighs crippled and missing legs in close combat", async () => {
    const { lameCloseCombat } = await import("./rules.js");
    expect(lameCloseCombat("crippledLegs", true)).toEqual({ rolls: -3, foeKnockdown: 3 });
    expect(lameCloseCombat("missingLegs", true)).toEqual({ rolls: -6, foeKnockdown: 3 });
    expect(lameCloseCombat("missingLegs", false)).toEqual({ rolls: 0, foeKnockdown: 0 });
    expect(lameCloseCombat(null, true)).toEqual({ rolls: 0, foeKnockdown: 0 });
  });

  it("tells the grapples that need fingers from the ones that are merely clumsy", async () => {
    const { needsFingers, clumsyGrappling } = await import("./rules.js");
    expect([needsFingers("Strangle"), needsFingers("Finger Lock"), needsFingers("Arm Lock")]).toEqual([true, true, false]);
    expect([clumsyGrappling("Arm Lock"), clumsyGrappling("Scissors Hold"), clumsyGrappling("Wrench Limb (Teeth)"), clumsyGrappling("Punch")]).toEqual([true, false, false, false]);
  });
});

describe("All-Out Grapple and Strike (p. 114)", () => {
  it("adds a point only for two skulls knocked together", async () => {
    const { ramDamageBonus, TWOFER_PENALTY } = await import("./rules.js");
    expect(ramDamageBonus(["skull", "skull"])).toBe(1);
    expect(ramDamageBonus(["skull", "torso"])).toBe(0);
    expect(ramDamageBonus(["skull"])).toBe(0);
    expect(TWOFER_PENALTY).toBe(-4);
  });
});
