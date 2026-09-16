import { describe, expect, it } from "vitest";

import {
  NO_SCREEN_OPTIONS,
  adjustedDr,
  barrierFactor,
  barrierSm,
  isLifeSupportBelt,
  isReflectiveShield,
  isStasisDevice,
  missHitsScreen,
  regenerationPerSecond,
  screenCostFactor,
  screenOf,
  screenProtection,
  screenStops,
  tauMinutes,
  tauRatio,
  throughStasis,
  stasisCollapseRange,
} from "./rules.js";

const options = (patch = {}) => ({ ...NO_SCREEN_OPTIONS, ...patch });
// The Size Modifier Table's figures for these diameters (Characters p. 19).
const sizeModifier = (yards: number) => ({ 5: 2, 10: 4, 15: 5, 30: 7 } as Record<number, number>)[yards] ?? 0;

describe("force screens (Ultra-Tech pp. 190-192)", () => {
  it("knows the screens, barrier or conformal", () => {
    expect(screenOf("Medium Force Screen")).toEqual({ barrier: true, diameter: 10 });
    expect(screenOf("Personal Force Screen")).toEqual({ barrier: false });
    expect(screenOf("Force Shield Bracelet")).toBeNull();
  });

  it("regenerates a point a second for every 10 DR, at least 1", () => {
    expect(regenerationPerSecond(55)).toBe(5);
    expect(regenerationPerSecond(60)).toBe(6);
    expect(regenerationPerSecond(7)).toBe(1);
  });

  it("adds the variants' cost modifiers together", () => {
    expect(screenCostFactor(options())).toBe(1);
    expect(screenCostFactor(options({ adjustable: "none", safetySwitch: true }))).toBe(2.1);
    expect(screenCostFactor(options({ energy: true, velocity: true, permeable: true }))).toBe(0.4);
    expect(screenCostFactor(options({ energy: true, kinetic: true }))).toBe(0.5);
  });

  it("stops only what its variant stops", () => {
    const beam = { energy: true, fast: true };
    const punch = { energy: false, fast: false };
    const bullet = { energy: false, fast: true };
    expect(screenStops(options(), punch)).toBe(true);
    expect(screenStops(options({ energy: true }), bullet)).toBe(false);
    expect(screenStops(options({ kinetic: true }), beam)).toBe(false);
    expect(screenStops(options({ velocity: true }), punch)).toBe(false);
    expect(screenStops(options({ velocity: true }), bullet)).toBe(true);
  });

  it("reinforces the chosen half of an adjustable screen and weakens the rest", () => {
    expect(adjustedDr(60, "front", "front")).toBe(90);
    expect(adjustedDr(60, "front", "side")).toBe(30);
    expect(adjustedDr(60, "back", "back")).toBe(90);
    expect(adjustedDr(60, "front", null)).toBe(60);
    expect(adjustedDr(60, "none", "front")).toBe(60);
  });

  it("seals the wearer with PF equal to its DR, unless it lets air or energy through", () => {
    expect(screenProtection(options(), 150)).toEqual({ sealed: true, vacuumSupport: true, pressureSupport: 3, radiationPf: 150 });
    expect(screenProtection(options({ velocity: true }), 150)).toEqual({ sealed: false, vacuumSupport: false, pressureSupport: 0, radiationPf: 1 });
    expect(screenProtection(options({ permeable: true, breathing: true }), 60)).toMatchObject({ sealed: false, vacuumSupport: true });
    expect(screenProtection(options({ kinetic: true }), 60).radiationPf).toBe(1);
  });

  it("scales a barrier screen to its diameter, +2 SM for a sphere", () => {
    expect(barrierFactor(10, 30)).toBe(3);
    expect(barrierSm(10, sizeModifier)).toBe(6);
    expect(barrierSm(30, sizeModifier)).toBe(9);
    // A man (SM 0) inside a 10-yard screen (SM +6): a miss by 6 or less hits the screen.
    expect(missHitsScreen(4, 0, 6)).toBe(true);
    expect(missHitsScreen(7, 0, 6)).toBe(false);
  });
});

describe("force shields, stasis and time (pp. 192-195)", () => {
  it("finds the reflective shield, the stasis devices and the life support belt", () => {
    expect(isReflectiveShield("Reflective Force Shield")).toBe(true);
    expect(isStasisDevice("Stasis Belt")).toBe(true);
    expect(isStasisDevice("Stasis Key")).toBe(false);
    expect(isLifeSupportBelt("Life-Support Belt")).toBe(true);
  });

  it("lets nothing through a stasis web", () => {
    expect(throughStasis(5000)).toBe(0);
    expect(throughStasis(30_000_000)).toBe(3);
  });

  it("divides the tau-shield's power by its levels and speeds its wearer up", () => {
    expect(tauMinutes(1)).toBe(180);
    expect(tauMinutes(9)).toBe(20);
    expect(tauMinutes(20)).toBe(20);
    expect(tauRatio(1)).toBe(2);
    expect(tauRatio(3)).toBe(4);
  });
});

describe("stasis keys (#299, p. 96)", () => {
  it("collapses a stasis web at contact or 10 yards", () => {
    expect(stasisCollapseRange("Stasis Key")).toBe(1);
    expect(stasisCollapseRange("Stasis Disruptor")).toBe(10);
    expect(stasisCollapseRange("Stasis Belt")).toBeNull();
  });
});
