import { describe, expect, it } from "vitest";

import { beatScores, bestResistance, evaluateHelps, evaluateOffset, rebased, ruseScores } from "./rules.js";

/** Feints (GURPS Martial Arts pp. 49, 100-101). */
describe("resisting a feint", () => {
  it("takes the best combat skill whatever is in hand: Baajikiil resists at 18 while wielding a mace at 8", () => {
    expect(bestResistance(12, [8, 18], [])).toBe(18);
    expect(bestResistance(12, [8], [15])).toBe(15);
  });
});

describe("Beats and Ruses", () => {
  it("rebases a skill on another attribute", () => {
    expect(rebased(14, 12, 11)).toBe(13);
  });

  it("rolls a Beat on ST against the defender's better of DX- and ST-based", () => {
    expect(beatScores({ attacker: { skill: 15, dx: 13, st: 14 }, defender: { best: 14, dx: 12, st: 13 } })).toEqual({ attacker: 16, defender: 15 });
  });

  it("rolls a Ruse on IQ against the defender's best of Per-based, DX-based or Tactics", () => {
    expect(ruseScores({ attacker: { skill: 14, dx: 12, iq: 13 }, defender: { best: 14, dx: 12, per: 11, tactics: 15 } })).toEqual({ attacker: 15, defender: 15 });
    expect(ruseScores({ attacker: { skill: 14, dx: 12, iq: 13 }, defender: { best: 14, dx: 12, per: 13, tactics: null } }).defender).toBe(15);
  });
});

describe("the Evaluate bonus against feints and Deceptive Attacks", () => {
  it("offsets the penalty up to the bonus, never past zero: -4 with two turns of Evaluate is -2", () => {
    expect(evaluateOffset(-4, 2)).toBe(2);
    expect(evaluateOffset(-1, 3)).toBe(1);
    expect(evaluateOffset(0, 3)).toBe(0);
  });

  it("also helps Body Language, Observation and Expert Skill (Hoplology)", () => {
    expect(evaluateHelps("Body Language")).toBe(true);
    expect(evaluateHelps("Expert Skill (Hoplology)")).toBe(true);
    expect(evaluateHelps("Tracking")).toBe(false);
  });
});
