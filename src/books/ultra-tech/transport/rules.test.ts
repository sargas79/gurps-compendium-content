import { describe, expect, it } from "vitest";

import {
  crashwebDr,
  interceptorOpponent,
  interstellarJumpCost,
  landingRadius,
  lifeSupportDays,
  projectorModifier,
  projectorPrice,
  slidewalkModifier,
  slidewalkSpeed,
  telegateFactor,
  throughTheGate,
} from "./rules.js";

describe("vehicle systems (Ultra-Tech pp. 222-232)", () => {
  it("gives a crashweb DR equal to TL and shares life support", () => {
    expect(crashwebDr(10)).toBe(10);
    expect(lifeSupportDays(6, 2)).toBe(3);
  });

  it("rolls running on a slidewalk", () => {
    expect(slidewalkModifier(30, false)).toBe(0);
    expect(slidewalkModifier(20, true)).toBe(-3);
    expect(slidewalkSpeed(20, 5, false)).toBe(30);
  });

  it("lands a capsule by its roll", () => {
    const success = { success: true, criticalSuccess: false, criticalFailure: false, margin: 5 };
    expect(landingRadius(success, 18)).toEqual({ miles: 800, outcome: "near" });
    expect(landingRadius({ ...success, margin: 10 }, 5)).toEqual({ miles: 1, outcome: "near" });
    expect(landingRadius({ ...success, criticalSuccess: true }, 30).miles).toBe(1);
    expect(landingRadius({ success: false, criticalSuccess: false, criticalFailure: true, margin: 1 }, 10).outcome).toBe("disaster");
  });
});

describe("matter transmission (Ultra-Tech pp. 104, 233-235)", () => {
  it("prices telegates by radius and pairing", () => {
    expect(telegateFactor({ radiusYards: 3, paired: true })).toBe(1.5);
    expect(telegateFactor({ radiusYards: 0, paired: false })).toBe(1);
  });

  it("sends a minigate's stopped blow through the gate", () => {
    expect(throughTheGate({ success: true, margin: 2 }, false)).toBe(true);
    expect(throughTheGate({ success: true, margin: 6 }, false)).toBe(false);
    expect(throughTheGate({ success: true, margin: 6 }, true)).toBe(true);
    expect(throughTheGate({ success: false, margin: 1 }, true)).toBe(false);
  });

  it("rolls a teleport projector by distance", () => {
    expect(projectorModifier(2500, false)).toBe(-2);
    expect(projectorModifier(500, true)).toBe(4);
    expect(projectorModifier(12000, false)).toBeNull();
  });

  it("prices projectors and interstellar jumps", () => {
    expect(projectorPrice(2, false)).toEqual({ cost: 20_000_000, weight: 4000 });
    expect(projectorPrice(1, true)).toEqual({ cost: 7_500_000, weight: 1500 });
    expect(interstellarJumpCost(1)).toBe(100000);
    expect(interstellarJumpCost(4)).toBe(10_000_000);
    expect(interceptorOpponent(null, 12)).toBe(12);
  });
});
