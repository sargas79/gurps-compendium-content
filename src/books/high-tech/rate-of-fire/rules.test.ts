import { describe, expect, it } from "vitest";

import {
  boughtOff,
  burstShots,
  doubleActionAimPenalty,
  doubleActionOnlyAccuracy,
  fanned,
  fanningFumble,
  fastFired,
  fastFiringRates,
  fireSettings,
  looksLikeRevolver,
  nextFireSetting,
  resistsAccidentalDischarge,
  settingRow,
  thumbed,
  workedOutBurstLimit,
  workedOutTrigger,
} from "./rules.js";

const rof = (rateOfFire: number, mark = "", second = 0, secondMark = "") => ({ rateOfFire, mark, second, secondMark });

describe("trigger mechanisms (p. 82)", () => {
  it("takes a pistol loaded a round at a time into five chambers or more for a revolver", () => {
    expect(looksLikeRevolver({ skill: "Guns (Pistol)", shots: "6(5i)", rateOfFire: 1 })).toBe(true);
    expect(looksLikeRevolver({ skill: "Guns (Pistol)", shots: "6(3i)", rateOfFire: 3 })).toBe(true);
    expect(looksLikeRevolver({ skill: "Guns (Pistol)", shots: "2(3i)", rateOfFire: 1 })).toBe(false);
    expect(looksLikeRevolver({ skill: "Guns (Pistol)", shots: "7+1(3)", rateOfFire: 3 })).toBe(false);
    expect(looksLikeRevolver({ skill: "Guns (Rifle)", shots: "6(3i)", rateOfFire: 1 })).toBe(false);
  });

  it("works out single-action for a RoF 1 revolver and anything but a revolver, double-action for a faster revolver", () => {
    expect(workedOutTrigger(true, 1)).toBe("sa");
    expect(workedOutTrigger(true, 3)).toBe("da");
    expect(workedOutTrigger(false, 3)).toBe("sa");
    expect(workedOutTrigger(false, 13)).toBe("sa");
  });

  it("costs an aimed double-action shot a point of the Acc it got, unless cocked", () => {
    expect(doubleActionAimPenalty("da", false, 2)).toBe(-1);
    expect(doubleActionAimPenalty("da", true, 2)).toBe(0);
    expect(doubleActionAimPenalty("da", false, 0)).toBe(0);
    expect(doubleActionAimPenalty("sa", false, 2)).toBe(0);
    expect(doubleActionAimPenalty("safe", false, 2)).toBe(0);
  });

  it("takes a point of Acc off a DAO gun, never below 0", () => {
    expect(doubleActionOnlyAccuracy(2)).toBe(1);
    expect(doubleActionOnlyAccuracy(0)).toBe(0);
  });

  it("makes DAO and safe-action guns hard to fire by accident", () => {
    expect(resistsAccidentalDischarge("dao")).toBe(true);
    expect(resistsAccidentalDischarge("safe")).toBe(true);
    expect(resistsAccidentalDischarge("da")).toBe(false);
  });
});

describe("automatic weapons (pp. 82-83)", () => {
  it("gives a selective-fire gun single shots, and a full-auto-only gun no selector", () => {
    expect(fireSettings(rof(13))).toEqual(["primary", "semi"]);
    expect(fireSettings(rof(8, "!"))).toEqual(["primary"]);
    expect(fireSettings(rof(3))).toEqual(["primary"]);
    expect(fireSettings(rof(9, "#", 7))).toEqual(["primary", "second", "semi"]);
    expect(fireSettings(rof(33, "!", 66, "!"))).toEqual(["primary", "second"]);
  });

  it("cycles the selector", () => {
    expect(nextFireSetting(["primary", "semi"], "primary")).toBe("semi");
    expect(nextFireSetting(["primary", "semi"], "semi")).toBe("primary");
    expect(nextFireSetting(["primary", "second", "semi"], "second")).toBe("semi");
  });

  it("limits a high-cyclic gun to bursts of a third of its RoF", () => {
    expect(workedOutBurstLimit(rof(9, "#"))).toBe(3);
    expect(workedOutBurstLimit(rof(2, "#"))).toBe(2);
    expect(workedOutBurstLimit(rof(9))).toBe(0);
  });

  it("offers only whole bursts, up to three (the Beretta 93R example: 3, 6 or 9)", () => {
    expect(burstShots(3, 9)).toEqual([3, 6, 9]);
    expect(burstShots(2, 9)).toEqual([2, 4, 6]);
    expect(burstShots(3, 3)).toEqual([3]);
  });

  it("makes single shots RoF 3, and bars spraying from limited bursts and suppression from high-cyclic ones", () => {
    expect(settingRow("semi", rof(13), 0)).toMatchObject({ rateOfFire: 3, noSprayingFire: true, noSuppressionFire: true });
    expect(settingRow("primary", rof(9), 3)).toMatchObject({ rateOfFire: 9, recoil: null, burstLimit: 3, noSprayingFire: true, noSuppressionFire: false });
    expect(settingRow("primary", rof(9, "#", 7), 3)).toMatchObject({ rateOfFire: 9, recoil: 1, noSprayingFire: true, noSuppressionFire: true });
    expect(settingRow("second", rof(9, "#", 7), 3)).toMatchObject({ rateOfFire: 7, recoil: null, burstLimit: 0, noSprayingFire: false });
    expect(settingRow("primary", rof(13), 0)).toMatchObject({ rateOfFire: 13, burstLimit: 0, noSprayingFire: false, noSuppressionFire: false });
  });
});

describe("fast-firing (p. 84)", () => {
  const gun = { rateOfFire: 3, fullAuto: false, burstLimited: false, singleActionRevolver: false };

  it("pulls a RoF 2 or 3 gun up to 6, and a two-handed single-action revolver from 2 to 4", () => {
    expect(fastFiringRates(gun)).toEqual([4, 5, 6]);
    expect(fastFiringRates({ ...gun, rateOfFire: 2 })).toEqual([3, 4, 5, 6]);
    expect(fastFiringRates({ ...gun, rateOfFire: 1, singleActionRevolver: true })).toEqual([2, 3, 4]);
    expect(fastFiringRates({ ...gun, rateOfFire: 1 })).toEqual([]);
    expect(fastFiringRates({ ...gun, fullAuto: true })).toEqual([]);
    expect(fastFiringRates({ ...gun, burstLimited: true })).toEqual([]);
  });

  it("gives the Colt .38 Super example's figures: -4 at RoF 4-6, Rcl +2 at 5 and +4 at 6", () => {
    expect(fastFired(4, false, null)).toEqual({ penalty: -4, recoilModifier: 0 });
    expect(fastFired(5, false, null)).toEqual({ penalty: -4, recoilModifier: 2 });
    expect(fastFired(6, false, null)).toEqual({ penalty: -4, recoilModifier: 4 });
    // With the technique at full skill the penalty goes, the Rcl stays.
    expect(fastFired(6, false, 0)).toEqual({ penalty: 0, recoilModifier: 4 });
  });

  it("fires a two-handed single-action revolver at RoF 2 free, and at -2 above it", () => {
    expect(fastFired(2, true, null)).toEqual({ penalty: 0, recoilModifier: 0 });
    expect(fastFired(4, true, null)).toEqual({ penalty: -2, recoilModifier: 0 });
    expect(fastFired(4, true, -1)).toEqual({ penalty: -1, recoilModifier: 0 });
  });

  it("buys off a penalty by the technique's level relative to the skill", () => {
    expect(boughtOff(-4, null)).toBe(-4);
    expect(boughtOff(-4, -2)).toBe(-2);
    expect(boughtOff(-4, 3)).toBe(0);
    expect(boughtOff(-4, -9)).toBe(-4);
  });
});

describe("fanning and thumbing (pp. 83-84)", () => {
  it("gives the Duke's figures: -4, -6, -8 at RoF 2-4, -10 and Rcl +2 at RoF 5", () => {
    expect(fanned(2, null)).toEqual({ penalty: -4, recoilModifier: 0 });
    expect(fanned(3, null)).toEqual({ penalty: -6, recoilModifier: 0 });
    expect(fanned(4, null)).toEqual({ penalty: -8, recoilModifier: 0 });
    expect(fanned(5, null)).toEqual({ penalty: -10, recoilModifier: 2 });
  });

  it("with the technique bought up, only the -2 steps and the Rcl stay", () => {
    expect(fanned(2, 0).penalty).toBe(0);
    expect(fanned(3, 0).penalty).toBe(-2);
    expect(fanned(5, 0)).toEqual({ penalty: -6, recoilModifier: 2 });
  });

  it("thumbs at -2, bought off by the technique", () => {
    expect(thumbed(null).penalty).toBe(-2);
    expect(thumbed(-1).penalty).toBe(-1);
    expect(thumbed(0).penalty).toBe(0);
  });

  it("drops the gun on 1-3 and bruises the hand on 4-6 for the margin in minutes", () => {
    expect(fanningFumble(2, 5)).toEqual({ dropped: true, painMinutes: 0 });
    expect(fanningFumble(5, 5)).toEqual({ dropped: false, painMinutes: 5 });
  });
});
