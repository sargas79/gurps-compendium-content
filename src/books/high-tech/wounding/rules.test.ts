import { describe, expect, it } from "vitest";

import * as system from "../../../../system/src/rules/index.js";
import {
  bodyHitCap,
  capExcessPenalty,
  leastCrippling,
  limbOutcome,
  rollsForVitals,
  severeWound,
  strikesVitals,
  woundFrightCheck,
  woundSizePenalty,
} from "./rules.js";

/** The optional wounding rules (High-Tech p. 162). */
describe("body hits", () => {
  it("rolls for the vitals on an impaling or piercing torso hit, and a 1 strikes them", () => {
    expect(rollsForVitals({ hitLocation: "torso", damageType: "pi" })).toBe(true);
    expect(rollsForVitals({ hitLocation: "torso", damageType: "imp" })).toBe(true);
    expect(rollsForVitals({ hitLocation: "torso", damageType: "cr" })).toBe(false);
    expect(rollsForVitals({ hitLocation: "torso", damageType: "burn" })).toBe(false);
    // No roll for the groin, nor for a module's location on the torso.
    expect(rollsForVitals({ hitLocation: "groin", damageType: "pi" })).toBe(false);
    expect(rollsForVitals({ hitLocation: "torso", addonLocation: "x.vein", damageType: "pi" })).toBe(false);
    expect([1, 2, 6].map(strikesVitals)).toEqual([true, false, false]);
  });

  it("caps the torso and groin at HP with Bleeding, at twice HP without", () => {
    const bodyguard = { damageType: "pi", hp: 11 };
    expect(bodyHitCap({ ...bodyguard, hitLocation: "torso", bleeding: true })).toBe(11);
    expect(bodyHitCap({ ...bodyguard, hitLocation: "torso", bleeding: false })).toBe(22);
    expect(bodyHitCap({ ...bodyguard, hitLocation: "groin", bleeding: true })).toBe(11);
    expect(bodyHitCap({ ...bodyguard, hitLocation: "arm", bleeding: true })).toBeNull();
    expect(bodyHitCap({ ...bodyguard, damageType: "cut", hitLocation: "torso", bleeding: true })).toBeNull();
  });

  it("counts El Chacal's whole 23 points toward the bleeding roll: -4, not the -2 of 11 HP lost", () => {
    const capped = system.capInjury(23, 11);
    expect(capped).toEqual({ injury: 11, lost: 12 });
    expect(system.bleedingModifier(11)).toBe(-2);
    expect(system.bleedingModifier(11) + capExcessPenalty(11, capped.lost)).toBe(-4);
    expect(capExcessPenalty(11, 0)).toBe(0);
  });
});

describe("limb hits", () => {
  it("cripples for good at twice the least crippling injury, and severs a bullet wound only at twice that again", () => {
    // 10 HP: an arm cripples over 5, so on 6; a hand over 10/3, so on 4.
    const arm = system.cripplingThreshold("arm", 10)!;
    expect(leastCrippling(arm)).toBe(6);
    expect(limbOutcome({ injury: 11, threshold: arm, damageType: "pi" })).toBeNull();
    expect(limbOutcome({ injury: 12, threshold: arm, damageType: "pi" })).toBe("permanent");
    expect(limbOutcome({ injury: 23, threshold: arm, damageType: "pi+" })).toBe("permanent");
    expect(limbOutcome({ injury: 24, threshold: arm, damageType: "imp" })).toBe("severed");
    // Any other blow dismembers at twice (p. B421).
    expect(limbOutcome({ injury: 12, threshold: arm, damageType: "cr" })).toBe("severed");
    const hand = system.cripplingThreshold("hand", 10)!;
    expect(leastCrippling(hand)).toBe(4);
    expect(limbOutcome({ injury: 8, threshold: hand, damageType: "pi" })).toBe("permanent");
  });
});

describe("stopping the bleeding", () => {
  it("bleeds the skull, eyes, neck and vitals every 30 seconds, -2 at the neck and -4 at the vitals, needing Surgery", () => {
    expect(severeWound("vitals")).toEqual({ intervalSeconds: 30, modifier: -4, surgery: true });
    expect(severeWound("neck")).toEqual({ intervalSeconds: 30, modifier: -2, surgery: true });
    expect(severeWound("skull")).toEqual({ intervalSeconds: 30, modifier: 0, surgery: true });
    expect(severeWound("eye")).toEqual({ intervalSeconds: 30, modifier: 0, surgery: true });
    expect(severeWound("torso")).toBeNull();
    expect(severeWound("arm")).toBeNull();
  });

  it("puts the wound's size on treatment as the bleeding roll has it", () => {
    expect([4, 5, 11, 23].map(woundSizePenalty)).toEqual([0, -1, -2, -4]);
    expect(woundSizePenalty(23)).toBe(system.bleedingModifier(23));
  });
});

describe("\"You shot me, Mister!\"", () => {
  it("calls for a Fright Check at 4 HP to the torso or head, and at -4 for a crippled limb or eye", () => {
    expect(woundFrightCheck({ hitLocation: "torso", injury: 4, crippled: false })).toBe(0);
    expect(woundFrightCheck({ hitLocation: "torso", injury: 3, crippled: false })).toBeNull();
    expect(woundFrightCheck({ hitLocation: "skull", injury: 6, crippled: false })).toBe(0);
    expect(woundFrightCheck({ hitLocation: "vitals", injury: 9, crippled: false })).toBe(0);
    expect(woundFrightCheck({ hitLocation: "arm", injury: 6, crippled: true })).toBe(-4);
    expect(woundFrightCheck({ hitLocation: "eye", injury: 2, crippled: true })).toBe(-4);
    expect(woundFrightCheck({ hitLocation: "arm", injury: 5, crippled: false })).toBeNull();
    expect(woundFrightCheck({ hitLocation: "leg", injury: 3, crippled: false })).toBeNull();
  });
});
