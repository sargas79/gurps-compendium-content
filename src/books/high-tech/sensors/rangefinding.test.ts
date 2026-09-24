import { describe, expect, it } from "vitest";

import { DWELL, detectorSkill, dwellRange, emissionModifier, emissionReach, rangefindingPenalty, sensorSizeModifier } from "./rangefinding.js";
import { ACTIVE_SENSORS } from "./rules.js";

describe("active rangefinding (HT:EE p. 35)", () => {
  it("detects emissions free to twice the range, then -1 per 20% of it, to -10 at four times", () => {
    expect(emissionModifier(2000, 1000)).toBe(0);
    expect(emissionModifier(2200, 1000)).toBe(-1);
    expect(emissionModifier(2201, 1000)).toBe(-2);
    expect(emissionModifier(3000, 1000)).toBe(-5);
    expect(emissionModifier(4000, 1000)).toBe(-10);
    expect(emissionModifier(4001, 1000)).toBeNull();
    expect(emissionReach(1000)).toBe(4000);
  });

  it("takes an LPI sensor's steps of its halved range, from 1.5 times it", () => {
    // Range 1,000 halved to 500: free to 750, -1 per 100 yards, to -10 at 1,750.
    expect(emissionModifier(750, 1000, true)).toBe(0);
    expect(emissionModifier(850, 1000, true)).toBe(-1);
    expect(emissionModifier(1750, 1000, true)).toBe(-10);
    expect(emissionModifier(1760, 1000, true)).toBeNull();
    expect(emissionReach(1000, true)).toBe(1750);
  });

  it("counts the target's size at half its SM, rounded down", () => {
    expect(sensorSizeModifier(0)).toBe(0);
    expect(sensorSizeModifier(1)).toBe(0);
    expect(sensorSizeModifier(5)).toBe(2);
    expect(sensorSizeModifier(-1)).toBe(-1);
    expect(sensorSizeModifier(-4)).toBe(-2);
  });

  it("takes -2 per doubling past range in half steps: -1 at 1.5 times", () => {
    expect([1, 1.2, 1.5, 1.6, 2, 2.5, 3, 4, 6, 8, 12].map((times) => rangefindingPenalty(100 * times, 100))).toEqual([0, -1, -1, -2, -2, -3, -3, -4, -5, -6, -7]);
  });

  it("reaches twice as far dwelling 4 times as long, four times at 15, helping the target +2 or +4", () => {
    expect(dwellRange(100)).toBe(100);
    expect(dwellRange(100, "x4")).toBe(200);
    expect(dwellRange(100, "x15")).toBe(400);
    expect(rangefindingPenalty(400, dwellRange(100, "x15"))).toBe(0);
    expect(DWELL.x4).toMatchObject({ time: 4, detect: 2 });
    expect(DWELL.x15).toMatchObject({ time: 15, detect: 4 });
  });

  it("detects sonar with Sonar and radar with EW by default", () => {
    expect(detectorSkill("sonar")).toBe("Electronics Operation (Sonar)");
    expect(detectorSkill("radar")).toBe("Electronics Operation (EW)");
  });

  it("reads the supplement's handheld sonar and ground-penetrating radar as High-Tech's active sensors", () => {
    expect(ACTIVE_SENSORS["Handheld Sonar"]).toMatchObject({ kind: "sonar", skill: "Electronics Operation (Sonar)" });
    expect(ACTIVE_SENSORS["Handheld Sonar"]!.range(8)).toBe(10);
    expect(ACTIVE_SENSORS["Ground-Penetrating Radar"]).toMatchObject({ kind: "gpr", skill: "Electronics Operation (Scientific)", survey: 2 });
    expect(ACTIVE_SENSORS["Ground-Penetrating Radar"]!.range(7)).toBe(50);
  });
});
