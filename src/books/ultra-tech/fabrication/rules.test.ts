import { describe, expect, it } from "vitest";

import {
  ANTIMATTER_REF,
  MICROGRAM_POUNDS,
  antimatterTrapCapacity,
  blueprintComplexity,
  explosionMultiplier,
  fabricatorGuideline,
  facilityHours,
  foamDr,
  gravityShiftModifier,
  instructorKit,
  microtechMultiplier,
  productionLine,
  psiAmpBoost,
  psiAmpByName,
  psiAmpCriticalFailure,
  psychotronicFeedback,
  ropeLoad,
  ropeStressModifier,
  slipsprayModifier,
  tractorBeam,
  GECKO_ADHESIVE_LOAD,
  NAIL_GUN_SAFETY,
  SONIC_PROBE,
  sonicProbePenalty,
  vaporCanteenHours,
} from "./rules.js";

describe("manufacturing (Ultra-Tech pp. 89-94)", () => {
  it("slows small gadgets down", () => {
    expect(microtechMultiplier(1)).toBe(1);
    expect(microtechMultiplier(0.05)).toBe(5);
    expect(microtechMultiplier(0.005)).toBe(20);
    expect(microtechMultiplier(0.0005)).toBe(100);
  });

  it("works the book's production-line example", () => {
    // A $200 chip weighing 0.005 lbs: 40 hours a chip, an $80,000, 800-lb. line.
    expect(productionLine({ cost: 200, weight: 0.005 })).toEqual({ hours: 40, perItem: 100, lineCost: 80000, lineWeight: 800 });
    expect(productionLine({ cost: 200, weight: 0.005, robotic: true })).toMatchObject({ perItem: 40, lineCost: 800000, lineWeight: 1600 });
  });

  it("times fabrication by cost or weight, whichever is longer", () => {
    expect(facilityHours("minifac", { cost: 500, weight: 5 }, 9)).toBe(10);
    expect(facilityHours("minifac", { cost: 500, weight: 20 }, 10)).toBe(10);
    expect(facilityHours("suitcaseNanofac", { cost: 500, weight: 0.1 }, 12)).toBe(5);
    expect(facilityHours("nope", { cost: 1, weight: 1 }, 9)).toBeNull();
  });

  it("follows the fabricator guideline", () => {
    expect(fabricatorGuideline({ cost: 500, weight: 2 }, 9, false)).toEqual({ hours: 10, cost: 300 });
    expect(fabricatorGuideline({ cost: 500, weight: 2 }, 9, true)).toEqual({ hours: 24, cost: 250 });
    expect(fabricatorGuideline({ cost: 500, weight: 0.05 }, 9, false).hours).toBeNull();
  });

  it("rates blueprints and instructor kits", () => {
    expect(blueprintComplexity(100, false)).toBe(2);
    expect(blueprintComplexity(1000, false)).toBe(3);
    expect(blueprintComplexity(5000, true)).toBe(5);
    expect(instructorKit(4000)).toEqual({ price: 2000, hours: 4, bonus: 5 });
  });
});

describe("tools and materials (Ultra-Tech pp. 81-88)", () => {
  it("strengthens rope by TL and stresses it past its load", () => {
    expect(ropeLoad('3/8"', 9, 11)).toBe(16000);
    expect(ropeStressModifier(1000, 400)).toBe(-2);
    expect(ropeStressModifier(300, 400)).toBeNull();
  });

  it("sets slipspray, foam and tractor beams", () => {
    expect(slipsprayModifier("sprinting")).toBe(-3);
    expect(foamDr(12)).toBe(24);
    expect(tractorBeam("light", 12)).toEqual({ st: 200, range: 1000 });
  });

  it("blows up a microgram of antimatter for about 6dx9", () => {
    expect(explosionMultiplier(MICROGRAM_POUNDS, ANTIMATTER_REF)).toBe(9);
    expect(antimatterTrapCapacity(11)).toBe(1000);
  });
});

describe("gravity and psi (Ultra-Tech pp. 79, 94)", () => {
  it("rolls DX crossing a gravity gradient, -2 per doubling", () => {
    expect(gravityShiftModifier(1, 1.05)).toBeNull();
    expect(gravityShiftModifier(1, 1.5)).toBe(0);
    expect(gravityShiftModifier(1, 5)).toBe(-4);
    expect(gravityShiftModifier(1, 0.25)).toBe(-4);
  });

  it("boosts Talent by TL and burns out on feedback", () => {
    expect(psiAmpByName("Backpack Psi Amplifier")).toBe("backpack");
    expect(psiAmpBoost("backpack", 10)).toBe(3);
    expect(psiAmpBoost("headband", 10)).toBe(0);
    expect(psiAmpCriticalFailure(15, false, false)).toBe(true);
    expect(psiAmpCriticalFailure(15, false, true)).toBe(false);
    expect(psychotronicFeedback({ success: false, margin: 5 })).toBe("coma");
    expect(psychotronicFeedback({ success: false, margin: 2 })).toBe("seizure");
  });
});

describe("tools with numbers (#299, pp. 76-85)", () => {
  it("draws a quart of water faster at higher TLs", () => {
    expect([9, 10, 11, 12].map(vaporCanteenHours)).toEqual([4, 3, 2, 1]);
  });

  it("holds 800 lbs. a square inch with gecko adhesive", () => {
    expect(GECKO_ADHESIVE_LOAD).toBe(800);
  });

  it("keeps a nail gun off living flesh unless its safety is disabled", () => {
    expect(NAIL_GUN_SAFETY.blindDr).toBe(3);
  });

  it("probes -1 per 10 DR with a sonic probe", () => {
    expect(sonicProbePenalty(0)).toBe(0);
    expect(sonicProbePenalty(9)).toBe(0);
    expect(sonicProbePenalty(25)).toBe(-2);
    expect(SONIC_PROBE.lockpicking).toBe(2);
  });
});
