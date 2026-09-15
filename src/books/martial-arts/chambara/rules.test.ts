import { describe, expect, it } from "vitest";

import {
  acrobaticDefensePenalty,
  balanceModifier,
  chambaraTechniqueLines,
  flyingLeapBonus,
  flyingLeapFatigue,
  halvedPenalty,
  isMaster,
  onMoveAndAttack,
  leapsFully,
  lizardHandsPenalty,
  lizardRetreat,
  retreatFits,
  retreatLines,
  stepsThisTurn,
  tradeableAttacks,
} from "./rules.js";

const total = (lines: Array<{ value: number }>) => lines.reduce((sum, l) => sum + l.value, 0);

/** Chambara fighting (GURPS Martial Arts pp. 128-130). */
describe("chambara movement and attacks", () => {
  it("is for masters only, who leap fully with Acrobatics and Jumping at DX and halve stunt penalties", () => {
    expect([isMaster(["Trained by a Master"]), isMaster(["Weapon Master (Sword)"]), isMaster(["Combat Reflexes"])]).toEqual([true, true, false]);
    expect(leapsFully({ dx: 14, acrobatics: 14, jumping: 15 })).toBe(true);
    expect(leapsFully({ dx: 14, acrobatics: 13, jumping: 15 })).toBe(false);
    expect([halvedPenalty(-6), halvedPenalty(-7), halvedPenalty(2)]).toEqual([-3, -4, 2]);
  });

  it("lets Serena trade her second attack for a step: attack, step, attack, step, attack", () => {
    // Extra Attack 1: two basic attacks. One becomes a three-attack Rapid Strike, the other a step.
    expect(tradeableAttacks({ basicAttacks: 2, traded: 0 })).toBe(1);
    expect(tradeableAttacks({ basicAttacks: 2, traded: 1 })).toBe(0);
    expect(stepsThisTurn({ maneuverSteps: 1, traded: 1 })).toBe(2);
    expect(chambaraTechniqueLines("acrobatic", -1)).toEqual([{ key: "techniqueDefault", value: -6 }, { key: "moveAndAttack", value: 4 }, { key: "stunt", value: 1 }]);
    expect(chambaraTechniqueLines("spinning", 0, -5)).toEqual([{ key: "techniqueDefault", value: -6 }, { key: "wildSwing", value: 5 }]);
    expect([onMoveAndAttack("flying"), onMoveAndAttack("spinning")]).toEqual([true, false]);
  });
});

describe("chambara defenses", () => {
  it("gives a Move 7 fighter's four retreats +0, +2, +1 and -2", () => {
    const retreats = [
      { previous: 0, yards: 3 },
      { previous: 1, yards: 1 },
      { previous: 2, yards: 1 },
      { previous: 3, yards: 2 },
    ];
    expect(retreats.map((r) => total(retreatLines(r)))).toEqual([0, 2, 1, -2]);
    expect(retreatFits({ move: 7, used: 5, yards: 2 })).toBe(true);
    expect(retreatFits({ move: 7, used: 7, yards: 1 })).toBe(false);
    expect([acrobaticDefensePenalty(0), acrobaticDefensePenalty(2)]).toEqual([0, -2]);
  });
});

describe("special feats", () => {
  it("only cancels haste with Flying Leap's easier leaps, and makes a good one free", () => {
    expect(flyingLeapBonus({ double: true, floating: true, haste: -10 })).toBe(10);
    expect(flyingLeapBonus({ double: true, floating: false, haste: 0 })).toBe(0);
    expect(flyingLeapBonus({ double: true, floating: true, haste: -5 })).toBe(5);
    expect([flyingLeapFatigue({ easier: true, success: true, margin: 5 }), flyingLeapFatigue({ easier: false, success: true, margin: 9 })]).toEqual([0, 1]);
  });

  it("balances on a 1-inch rail at -3, and climbs upward to retreat", () => {
    expect(balanceModifier(-11)).toBe(-3);
    expect([lizardRetreat({ success: true }), lizardRetreat({ success: true, criticalSuccess: true }), lizardRetreat({ success: false, criticalFailure: true })]).toEqual(["bonus", "automatic", "criticallyFails"]);
    expect(lizardHandsPenalty(2)).toBe(-4);
  });
});

describe("a Lizard Climb settles the defense (p. 130)", () => {
  it("turns the climb into an automatic success or failure", async () => {
    const { lizardSettles } = await import("./rules.js");
    expect(["bonus", "automatic", "fails", "criticallyFails"].map(lizardSettles)).toEqual([null, "success", "failure", "criticalFailure"]);
  });
});
