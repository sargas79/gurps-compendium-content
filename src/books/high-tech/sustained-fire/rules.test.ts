import { describe, expect, it } from "vitest";

import {
  burnMinutes,
  heatPenalty,
  heatWeight,
  roundsPerPint,
  safeShots,
  smallArmsSafeShots,
  waterRoundsLeft,
  workedOutDiscipline,
} from "./rules.js";

const facts = (patch = {}) => ({ machineGun: false, malfunction: 17 as number | null, reliable: 0, techLevel: 7, barrel: "" as const, maintained: false, ...patch });

describe("safe numbers (High-Tech pp. 85-86)", () => {
  it("gives small arms 100 rounds, 50 if unreliable, 150 if reliable, 200 if very fine", () => {
    expect(smallArmsSafeShots(17, 0)).toBe(100);
    expect(smallArmsSafeShots(16, 0)).toBe(50);
    expect(smallArmsSafeShots(15, 0)).toBe(50);
    expect(smallArmsSafeShots(null, 0)).toBe(150);
    expect(smallArmsSafeShots(17, 1)).toBe(150);
    expect(smallArmsSafeShots(16, 2)).toBe(200);
  });

  it("works the TL, barrel and maintenance in, as the M60 example does", () => {
    // A well-maintained TL7 M60: 800 × 1.25 = 1,000 in sustained fire, a quarter of it in assault fire.
    const m60 = safeShots(facts({ machineGun: true, maintained: true }));
    expect(m60).toBe(1000);
    expect(m60 / heatWeight("assault")).toBe(250);
    expect(safeShots(facts({ techLevel: 6 }))).toBe(75);
    expect(safeShots(facts({ techLevel: 8 }))).toBe(150);
    expect(safeShots(facts({ machineGun: true, barrel: "extraHeavy", techLevel: 6 }))).toBe(900);
    expect(safeShots(facts({ machineGun: true, barrel: "light" }))).toBe(400);
  });

  it("weighs rapid and assault fire against the sustained figure", () => {
    expect([heatWeight("sustained"), heatWeight("rapid"), heatWeight("assault")]).toEqual([1, 2, 4]);
  });

  it("works out how a machine gun was fired from its pauses and bursts", () => {
    expect(workedOutDiscipline(5, 10, null)).toBe("sustained");
    expect(workedOutDiscipline(5, 10, 5)).toBe("sustained");
    expect(workedOutDiscipline(5, 10, 3)).toBe("rapid");
    expect(workedOutDiscipline(5, 10, 1)).toBe("assault");
    // A full-RoF burst is a long one, pauses or not.
    expect(workedOutDiscipline(10, 10, 5)).toBe("assault");
  });
});

describe("what heat does (High-Tech pp. 85-86)", () => {
  it("takes 1 Acc and Malf. past the safe number, 2 from a machine gun at three times it, and keeps the Acc lost", () => {
    expect(heatPenalty(100, 100, false)).toEqual({ accuracy: 0, malfunction: 0, warped: false });
    expect(heatPenalty(101, 100, false)).toEqual({ accuracy: 1, malfunction: 1, warped: false });
    expect(heatPenalty(300, 100, false)).toEqual({ accuracy: 1, malfunction: 1, warped: true });
    expect(heatPenalty(3000, 1000, true)).toEqual({ accuracy: 2, malfunction: 2, warped: true });
  });

  it("cools a water-cooled gun 500 rounds a pint, 5,000 with a condenser (p. 129)", () => {
    expect(roundsPerPint(false)).toBe(500);
    expect(roundsPerPint(true)).toBe(5000);
    expect(waterRoundsLeft(7.5, 0, false)).toBe(3750);
    expect(waterRoundsLeft(7.5, 3700, false)).toBe(50);
    expect(waterRoundsLeft(1, 9000, false)).toBe(0);
  });

  it("burns the hand for a die's minutes on a critical failure changing the barrel (p. 129)", () => {
    expect(burnMinutes(4)).toBe(4);
  });
});
