import { describe, expect, it } from "vitest";

import {
  adjustmentAfter,
  firesIndirectly,
  navigationModifiers,
  observationRangePenalty,
  observationYards,
  shotPenalty,
  timeOfFlight,
  usualTrajectory,
} from "./rules.js";

describe("the forward observer (High-Tech p. 139)", () => {
  it("navigates at +1 with a compass, +3 with GPS, -10 with no map", () => {
    expect(navigationModifiers({ aid: "none", map: true })).toEqual([]);
    expect(navigationModifiers({ aid: "compass", map: true })).toEqual([{ key: "compass", value: 1 }]);
    expect(navigationModifiers({ aid: "gps", map: false })).toEqual([{ key: "gps", value: 3 }, { key: "noMap", value: -10 }]);
  });

  it("takes -3 per 500 yards or part of 500, after magnification and a rangefinder in reach", () => {
    // The book's example: 1,500 yards through 6x binoculars is 250 yards, for -3.
    expect(observationRangePenalty(observationYards({ yards: 1500, magnification: 6 }))).toBe(-3);
    expect(observationRangePenalty(observationYards({ yards: 1000 }))).toBe(-6);
    expect(observationRangePenalty(observationYards({ yards: 1001 }))).toBe(-9);
    // A rangefinder halves it only within its reach.
    expect(observationYards({ yards: 2000, rangefinderYards: 3000 })).toBe(1000);
    expect(observationYards({ yards: 4000, rangefinderYards: 3000 })).toBe(4000);
    expect(observationYards({ yards: 2000, magnification: 4, rangefinderYards: 5000 })).toBe(250);
    expect(observationRangePenalty(0)).toBe(0);
  });

  it("moves the first shot's -10 by the margin, never to a bonus", () => {
    // Success by 1: the first shot is at -9 (the book's example).
    const first = adjustmentAfter(0, { success: true, margin: 1 });
    expect(shotPenalty(first)).toBe(-9);
    // A failure makes it worse.
    expect(shotPenalty(adjustmentAfter(0, { success: false, margin: 3 }))).toBe(-13);
    // Corrections add on, and failures can erase earlier gains.
    const second = adjustmentAfter(first, { success: true, margin: 5 });
    expect(shotPenalty(second)).toBe(-4);
    expect(shotPenalty(adjustmentAfter(second, { success: false, margin: 2 }))).toBe(-6);
    // Never past 0.
    expect(shotPenalty(adjustmentAfter(second, { success: true, margin: 9 }))).toBe(0);
    expect(adjustmentAfter(second, { success: true, margin: 9 })).toBe(10);
  });

  it("takes the whole penalty off on a critical success", () => {
    expect(shotPenalty(adjustmentAfter(-3, { success: true, margin: 0, criticalSuccess: true }))).toBe(0);
  });
});

describe("time of flight (p. 139)", () => {
  it("is a second per 500 yards low-angle, per 250 high-angle, rounding up", () => {
    // The book's example: 6,900 yards low-angle is 14 seconds.
    expect(timeOfFlight(6900, "low")).toBe(14);
    expect(timeOfFlight(1000, "high")).toBe(4);
    expect(timeOfFlight(1001, "high")).toBe(5);
    expect(timeOfFlight(0, "low")).toBe(0);
  });

  it("is usually high-angle for mortars and past 3,000 yards", () => {
    expect(usualTrajectory({ minRange: 100, yards: 1000 })).toBe("high");
    expect(usualTrajectory({ minRange: 0, yards: 3500 })).toBe("high");
    expect(usualTrajectory({ minRange: 0, yards: 2000 })).toBe("low");
  });
});

describe("which weapons fire indirectly (p. 139)", () => {
  it("offers artillery, cannon, mortars and machine guns", () => {
    expect(firesIndirectly({ name: "attack", skill: "Artillery (Cannon)" })).toBe(true);
    expect(firesIndirectly({ name: "Direct fire", skill: "Gunner (Cannon)" })).toBe(true);
    expect(firesIndirectly({ name: "attack", skill: "Guns (Light Machine Gun)" })).toBe(true);
    expect(firesIndirectly({ name: "Indirect fire", skill: "" })).toBe(true);
    expect(firesIndirectly({ name: "attack", skill: "Guns (Pistol)" })).toBe(false);
  });
});
