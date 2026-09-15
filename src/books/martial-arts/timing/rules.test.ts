import { describe, expect, it } from "vitest";

import {
  absoluteWeight,
  drawCase,
  drawModifiers,
  drawWinner,
  lengthOf,
  longestReach,
  multipleParryPenalty,
  readyModifiers,
  relativeWeight,
  stopHitPenalized,
  stopHitPenalty,
  tieBreak,
  waitModifiers,
  waitOrder,
  type DrawSide,
} from "./rules.js";

const side = (over: Partial<DrawSide> = {}, weapon: Partial<DrawSide["weapon"]> = {}): DrawSide => ({
  greased: false,
  handOnWeapon: false,
  swing: false,
  st: 10,
  ...over,
  weapon: { reach: 1, length: null, weight: 3, weaponSt: 10, bareHands: false, unbalanced: false, ...weapon },
});

/** Who acts first (GURPS Martial Arts pp. 103, 108, 110). */
describe("Who Draws First?", () => {
  it("gives a ready fighter with Combat Reflexes +1 against Fast-Draw at -10, and the tie", () => {
    const standoff = drawCase({ ready: true, fastDraw: null }, { ready: false, fastDraw: 14 });
    expect(standoff).toEqual({ kind: "readyVsFastDraw", side: "a", fastDraw: true });
    expect(readyModifiers(side(), true, false)).toEqual([{ key: "combatReflexes", value: 1 }]);
    expect(drawWinner("readyVsFastDraw", "tie", true)).toBe("first");
    expect(drawWinner("readyVsFastDraw", "tie", false)).toBe("second");
    expect(drawWinner("contest", "tie", true)).toBe("simultaneous");
  });

  it("sorts the other standoffs", () => {
    expect(drawCase({ ready: true, fastDraw: null }, { ready: false, fastDraw: null }).kind).toBe("readyStrikes");
    expect(drawCase({ ready: false, fastDraw: null }, { ready: false, fastDraw: 12 })).toEqual({ kind: "fastDrawRoll", side: "b", fastDraw: true });
    expect(drawCase({ ready: false, fastDraw: 12 }, { ready: false, fastDraw: 13 })).toEqual({ kind: "contest", side: null, fastDraw: true });
    expect(drawCase({ ready: false, fastDraw: null }, { ready: false, fastDraw: null }).fastDraw).toBe(false);
  });

  it("adds grease and a hand on the weapon, and takes -1 for the longer and heavier weapon", () => {
    const greatsword = side({ greased: true, handOnWeapon: true, st: 12 }, { reach: 2, weight: 7, weaponSt: 12 });
    const rapier = side({}, { reach: 2, weight: 2.75, weaponSt: 9 });
    expect(drawModifiers(greatsword, rapier, false)).toEqual([{ key: "greased", value: 1 }, { key: "handOnWeapon", value: 4 }, { key: "heavier", value: -1 }]);
    // A Matter of Inches: the greatsword is longer on the scale, and ST 12 for ST 12 feels neither heavy nor light.
    const inches = drawModifiers({ ...greatsword, swing: true, weapon: { ...greatsword.weapon, length: "veryLong" } }, { ...rapier, weapon: { ...rapier.weapon, length: "long" } }, true);
    expect(inches).toEqual([{ key: "greased", value: 1 }, { key: "handOnWeapon", value: 4 }, { key: "longer", value: -1 }, { key: "swing", value: -1 }]);
  });
});

describe("Stop Hits", () => {
  it("leaves the smaller margin defending at -1, or -3 parrying with the attacking weapon", () => {
    expect(stopHitPenalized({ hit: true, margin: 3 }, { hit: true, margin: 1 }, false)).toEqual({ a: false, b: true });
    expect([stopHitPenalty(false), stopHitPenalty(true)]).toEqual([-1, -3]);
    expect(stopHitPenalized({ hit: true, margin: 2 }, { hit: true, margin: 2 }, false)).toEqual({ a: true, b: true });
    expect(stopHitPenalized({ hit: false, margin: 1 }, { hit: true, margin: 0 }, false)).toEqual({ a: true, b: false });
    expect(stopHitPenalized({ hit: false, margin: 1 }, { hit: false, margin: 4 }, false)).toEqual({ a: false, b: false });
  });

  it("takes a swing's 1 off the margin and breaks ties by Reach with A Matter of Inches", () => {
    expect(stopHitPenalized({ hit: true, margin: 3, swing: true }, { hit: true, margin: 2 }, true)).toEqual({ a: true, b: true });
    const greatsword = { reach: 2, length: "veryLong" as const, swing: false, weight: 7 };
    const rapier = { reach: 2, length: "long" as const, swing: false, weight: 2.75 };
    expect(stopHitPenalized({ hit: true, margin: 2, weapon: rapier }, { hit: true, margin: 2, weapon: greatsword }, true)).toEqual({ a: true, b: false });
  });
});

describe("Cascading Waits", () => {
  it("adds Combat Reflexes, Basic Speed and distance, and orders by margin", () => {
    expect(waitModifiers({ combatReflexes: true, basicSpeed: 6.25, distance: "none", late: false }, false)).toEqual([
      { key: "combatReflexes", value: 1 }, { key: "basicSpeed", value: 6 }, { key: "stationary", value: 2 },
    ]);
    expect(waitModifiers({ combatReflexes: false, basicSpeed: 5, distance: 3, late: true }, false)).toEqual([
      { key: "basicSpeed", value: 5 }, { key: "distance", value: -3 }, { key: "late", value: -2 },
    ]);
    expect(waitOrder([
      { id: "fail2", success: false, margin: 2, ets: false },
      { id: "win1", success: true, margin: 1, ets: false },
      { id: "win4", success: true, margin: 4, ets: false },
      { id: "fail0", success: false, margin: 0, ets: false },
      { id: "win1b", success: true, margin: 1, ets: false },
      { id: "ets", success: false, margin: 5, ets: true },
    ], false)).toEqual([["ets"], ["win4"], ["win1", "win1b"], ["fail0"], ["fail2"]]);
  });
});

describe("A Matter of Inches", () => {
  it("weighs a weapon against its wielder's ST, and by its actual weight", () => {
    expect([
      relativeWeight({ st: 10, weaponSt: 12, bareHands: false, unbalanced: false }),
      relativeWeight({ st: 15, weaponSt: 10, bareHands: false, unbalanced: false }),
      relativeWeight({ st: 30, weaponSt: 10, bareHands: false, unbalanced: true }),
      relativeWeight({ st: 10, weaponSt: null, bareHands: true, unbalanced: false }),
      relativeWeight({ st: 10, weaponSt: null, bareHands: true, unbalanced: false, feintOrParry: true }),
    ]).toEqual([-2, 1, 2, 2, 0]);
    expect([
      absoluteWeight({ bareHands: false, weight: 1.5, unbalanced: false }),
      absoluteWeight({ bareHands: false, weight: 2, unbalanced: false }),
      absoluteWeight({ bareHands: false, weight: 12, unbalanced: true }),
    ]).toEqual([-2, -1, 1]);
  });

  it("places weapons on the length scale and breaks ties with it", () => {
    expect([lengthOf("Greatsword"), lengthOf("Rapier (Light)"), lengthOf("Dagger"), lengthOf("Laser Pistol"), lengthOf("Rapier", "veryShort")]).toEqual(["veryLong", "long", "veryShort", null, "veryShort"]);
    expect([longestReach("2,3*"), longestReach("C"), longestReach("1-3*")]).toEqual([3, 0, 3]);
    expect(tieBreak({ reach: 1, length: "medium", swing: true, weight: 3 }, { reach: 1, length: "medium", swing: false, weight: 3 })).toBeGreaterThan(0);
    expect(tieBreak({ reach: 1, length: "medium", swing: false, weight: 2 }, { reach: 1, length: "medium", swing: false, weight: 3 })).toBeLessThan(0);
  });

  it("adjusts multiple parries by relative weight, halving for a master", () => {
    expect([multipleParryPenalty(1, 0, false), multipleParryPenalty(2, -1, false), multipleParryPenalty(2, 3, false), multipleParryPenalty(1, -1, true)]).toEqual([-4, -10, -2, -3]);
    expect(multipleParryPenalty(0, -2, false)).toBe(0);
  });
});
