import { describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import {
  LOCK_RECORDS,
  LOCK_TOUGHNESS,
  SAFES,
  addToDice,
  caltropLodged,
  caltropsSteppedOn,
  caltropsVision,
  cryOutModifier,
  cuttingInjury,
  lockQualityCost,
  lockQualityModifier,
  olderLockBonus,
  pickGunModifier,
  pickSeconds,
  pickSkill,
  wireLayingMinutes,
} from "./rules.js";

describe("locks (pp. 203-205)", () => {
  it("grades a lock's quality: +5, 0 or -5 to pick, x1, x5 or x20 to buy", () => {
    expect([lockQualityModifier("basic"), lockQualityModifier("good"), lockQualityModifier("fine")]).toEqual([5, 0, -5]);
    expect([lockQualityCost("basic"), lockQualityCost("good"), lockQualityCost("fine")]).toEqual([1, 5, 20]);
  });

  it("keeps each toughness's DR and HP, and a safe's own", () => {
    expect(LOCK_TOUGHNESS).toEqual({ weak: { dr: 3, hp: 2 }, standard: { dr: 6, hp: 3 }, tough: { dr: 12, hp: 3 } });
    expect(SAFES["Bank Vault"]).toEqual({ dr: 400, hp: 127 });
    expect(SAFES["Depository"]).toEqual({ dr: 800, hp: 345 });
    for (const name of Object.keys(SAFES)) expect(LOCK_RECORDS[name]?.kind).toBe("safe");
  });

  it("picks mechanical locks with Lockpicking and electronic ones with Electronics Operation (Security)", () => {
    expect(pickSkill("lock")).toBe("Lockpicking");
    expect(pickSkill("safe")).toBe("Lockpicking");
    expect(pickSkill("electronic")).toBe("Electronics Operation (Security)");
    expect(pickSkill("verifier")).toBe("Electronics Operation (Security)");
  });

  it("takes a minute for a lock, an hour for a safe, five seconds with a lockpick gun", () => {
    expect(pickSeconds("lock", false)).toBe(60);
    expect(pickSeconds("safe", false)).toBe(3600);
    expect(pickSeconds("lock", true)).toBe(5);
  });

  it("gives the lockpick gun +4 against a basic lock and -5 against the rest (p. 213)", () => {
    expect(pickGunModifier("basic")).toBe(4);
    expect(pickGunModifier("good")).toBe(-5);
    expect(pickGunModifier("fine")).toBe(-5);
  });

  it("turns the Tech-Level Modifiers' penalty into a bonus against older locks: +3 at two TLs, +1 at one", () => {
    const penalty = (lock: number, skill: number) => rules.techLevelModifier({ skillTechLevel: skill, equipmentTechLevel: lock, iqBased: true });
    expect(olderLockBonus(5, 7, penalty(5, 7))).toBe(3);
    expect(olderLockBonus(6, 7, penalty(6, 7))).toBe(1);
    expect(olderLockBonus(5, 8, penalty(5, 8))).toBe(5);
    expect(olderLockBonus(8, 8, penalty(8, 8))).toBe(0);
    expect(olderLockBonus(8, 7, penalty(8, 7))).toBe(0);
  });
});

describe("traps (p. 203)", () => {
  it("reads caltrops' Vision roll: the Move's speed penalty and -2 when not watching", () => {
    expect(caltropsVision(rules.speedRangeModifier(5), false)).toEqual([{ key: "speed", value: -2 }, { key: "watching", value: -2 }]);
    expect(caltropsVision(rules.speedRangeModifier(2), true)).toEqual([]);
  });

  it("steps on one caltrop per point of failure, at least one", () => {
    expect(caltropsSteppedOn({ success: true, margin: 3 })).toBe(0);
    expect(caltropsSteppedOn({ success: false, margin: 0 })).toBe(1);
    expect(caltropsSteppedOn({ success: false, margin: 3 })).toBe(3);
  });

  it("lodges a caltrop whose damage reaches the footwear's DR", () => {
    expect(caltropLodged(2, 2)).toBe(true);
    expect(caltropLodged(1, 2)).toBe(false);
    expect(caltropLodged(0, 0)).toBe(true);
  });

  it("takes a thrust down by the trap's modifier", () => {
    expect(addToDice("1d-1", -3)).toBe("1d-4");
    expect(addToDice("1d+2", -3)).toBe("1d-1");
    expect(addToDice("2d-1", 1)).toBe("2d");
  });
});

describe("barriers (p. 204)", () => {
  it("rolls Will not to cry out: +3 High Pain Threshold, -4 Low, minus razor wire's injury", () => {
    expect(cryOutModifier({ highPainThreshold: true, lowPainThreshold: false, injury: 0 })).toBe(3);
    expect(cryOutModifier({ highPainThreshold: false, lowPainThreshold: true, injury: 2 })).toBe(-6);
  });

  it("works out a cut's injury through DR", () => {
    expect(cuttingInjury(5, 1)).toBe(6);
    expect(cuttingInjury(1, 3)).toBe(0);
  });

  it("lays wire at a man-minute a yard, three without the gear", () => {
    expect(wireLayingMinutes(15, true)).toBe(15);
    expect(wireLayingMinutes(15, false)).toBe(45);
  });
});
