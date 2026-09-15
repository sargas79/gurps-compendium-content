import { describe, expect, it } from "vitest";

import { holdAtBay, maximumDamage, passesThrough, runThroughInjury, runThroughModifier, strikeBase } from "./rules.js";

/** Dealing with charging foes (GURPS Martial Arts p. 106). */
describe("holding a foe at bay", () => {
  it("runs Tiberius through Rufus' spear for 6 more injury, and out his back", () => {
    // Rufus stop thrusts for 1d+5 and rolls 8: 3 past DR 5, doubled for impaling.
    expect(holdAtBay({ injury: 6, thrust: true, damageType: "imp" })).toBe("impaled");
    expect(runThroughModifier(null)).toBe(-3);
    const max = maximumDamage({ dice: 1, adds: 5 });
    expect(max).toBe(11);
    expect(runThroughInjury({ maxDamage: max, dr: 5, wounding: 2, injuryTaken: 6 })).toBe(6);
    // Tiberius, ST 13, would do 1d+3 with the spear: 9 beats DR 5.
    expect(passesThrough(maximumDamage({ dice: 1, adds: 3 }), 5)).toBe(true);
  });

  it("stops a foe the weapon didn't impale", () => {
    expect(holdAtBay({ injury: 4, thrust: false, damageType: "cut" })).toBe("inTheWay");
    expect(holdAtBay({ injury: 0, thrust: true, damageType: "imp" })).toBe("inTheWay");
    expect([runThroughModifier("high"), runThroughModifier("low")]).toEqual([0, -7]);
  });

  it("strikes with a swing where the weapon can", () => {
    expect(strikeBase(["thr", "sw"])).toBe("sw");
    expect(strikeBase(["thr"])).toBe("thr");
  });
});

describe("parrying a charge (p. 106)", () => {
  it("weighs a grab or grapple at ST/10 and anything else at ST", async () => {
    const { chargeWeight, grabsOrGrapples } = await import("./rules.js");
    expect(chargeWeight(13, true)).toBeCloseTo(1.3);
    expect(chargeWeight(13, false)).toBe(13);
    expect(grabsOrGrapples(["attack", "grapple"])).toBe(true);
    expect(grabsOrGrapples(["slam", "attack"])).toBe(false);
  });
});
