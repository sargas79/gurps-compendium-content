import { describe, expect, it } from "vitest";

import {
  brainUploadable,
  copiedSkillPoints,
  copyEffects,
  deadBrainModifier,
  destructiveResult,
  downloadResult,
  emulationComplexity,
  lowerResolution,
  nonDestructiveResult,
} from "./rules.js";

const ok = { success: true, criticalFailure: false, margin: 2 };
const fail = (margin: number) => ({ success: false, criticalFailure: false, margin });

describe("uploading (Ultra-Tech p. 219)", () => {
  it("reads a destructive upload from its worse roll", () => {
    expect(destructiveResult([ok, ok])).toBe("full");
    expect(destructiveResult([ok, fail(1)])).toBe("lowRes");
    expect(destructiveResult([fail(1), fail(2)])).toBe("veryLowRes");
    expect(destructiveResult([fail(3), ok])).toBe("failed");
    expect(destructiveResult([{ success: false, criticalFailure: true, margin: 1 }, ok])).toBe("failed");
  });

  it("scans only low-res at TL10, and one step lower unnoticed on a critical failure", () => {
    expect(nonDestructiveResult({ tl: 10, quickLowRes: false, success: true, criticalFailure: false })).toEqual({ resolution: "lowRes", hidden: false });
    expect(nonDestructiveResult({ tl: 10, quickLowRes: false, success: false, criticalFailure: true })).toEqual({ resolution: "veryLowRes", hidden: true });
    expect(nonDestructiveResult({ tl: 11, quickLowRes: false, success: false, criticalFailure: true })).toEqual({ resolution: "lowRes", hidden: true });
    expect(nonDestructiveResult({ tl: 11, quickLowRes: false, success: false, criticalFailure: false }).resolution).toBe("failed");
    expect(lowerResolution("veryLowRes")).toBe("failed");
  });

  it("penalizes uploading the dead by the hours and the freezing", () => {
    expect(deadBrainModifier({ hoursDead: 3, preserved: false, frozen: false })).toBe(-5);
    expect(deadBrainModifier({ hoursDead: 30, preserved: true, frozen: true })).toBe(-5);
  });

  it("can't upload a destroyed or irradiated brain", () => {
    expect(brainUploadable({ hp: -50, maxHp: 10, rads: 0, skullOrEyeDeath: false })).toBe(true);
    expect(brainUploadable({ hp: -100, maxHp: 10, rads: 0, skullOrEyeDeath: false })).toBe(false);
    expect(brainUploadable({ hp: 0, maxHp: 10, rads: 6000, skullOrEyeDeath: false })).toBe(false);
  });
});

describe("mind emulations and downloading (Ultra-Tech pp. 220-221)", () => {
  it("needs Complexity 4 + IQ/2, one less with Fixed IQ", () => {
    expect(emulationComplexity(10)).toBe(9);
    expect(emulationComplexity(5, true)).toBe(6);
    expect(emulationComplexity(11)).toBe(10);
  });

  it("reads a download's roll", () => {
    expect(downloadResult(ok)).toEqual({ outcome: "replaced", resolution: "full" });
    expect(downloadResult(fail(2)).outcome).toBe("brainDestroyed");
    expect(downloadResult(fail(5))).toEqual({ outcome: "hiddenFlaw", resolution: "lowRes" });
    expect(downloadResult({ success: false, criticalFailure: true, margin: 1 }).resolution).toBe("veryLowRes");
  });

  it("gives low- and very-low-res copies their traits", () => {
    expect(copyEffects("lowRes")).toMatchObject({ skillPoints: 0.5, iq: 0, flashbacksChance: true });
    expect(copyEffects("veryLowRes")).toMatchObject({ skillPoints: 0.25, iq: -1 });
    expect(copyEffects("full")).toBeNull();
    expect(copiedSkillPoints(7, 0.25)).toBe(1);
  });
});
