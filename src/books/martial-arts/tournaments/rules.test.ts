import { describe, expect, it } from "vitest";

import { artOrSport, bestSkill, deadlyHits, matchWinner, nextPhase, pressResult } from "./rules.js";

/** Tournament combat (GURPS Martial Arts pp. 134-135). */
describe("the Quick Contest method", () => {
  it("rolls Combat Sport skills in a light-contact bout", () => {
    expect([artOrSport("Karate Sport"), artOrSport("Combat Art (Fencing)"), artOrSport("Lance Sport"), artOrSport("Karate"), artOrSport("Artillery (Cannon)")]).toEqual(["sport", "art", "sport", null, null]);
    const skills = [{ name: "Karate", level: 15, kind: "combat" as const }, { name: "Karate Sport", level: 12, kind: "sport" as const }, { name: "Karate Art", level: 13, kind: "art" as const }];
    expect(bestSkill(skills, "lightContact")?.name).toBe("Karate Sport");
    expect(bestSkill(skills, "nonContact")?.name).toBe("Karate Art");
    expect(bestSkill(skills, "noHoldsBarred")?.name).toBe("Karate");
  });

  it("hits a winner who failed once, the loser once, and a critical failure three times", () => {
    expect(deadlyHits({ won: true, success: false, criticalFailure: false })).toBe(1);
    expect(deadlyHits({ won: true, success: true, criticalFailure: false })).toBe(0);
    expect(deadlyHits({ won: false, success: true, criticalFailure: false })).toBe(1);
    expect(deadlyHits({ won: false, success: false, criticalFailure: true })).toBe(3);
    expect([matchWinner({ first: 2, second: 1 }), matchWinner({ first: 1, second: 1 })]).toEqual(["first", null]);
  });
});

describe("the detailed method", () => {
  it("extends a flurry by the margin when one fighter presses and wins Tactics by 2", () => {
    expect(pressResult("first", { outcome: "first", marginOfVictory: 2 })).toEqual({ roll: false, seconds: 2, lull: false });
    expect(pressResult("first", { outcome: "second", marginOfVictory: 3 })).toEqual({ roll: false, seconds: 0, lull: true });
    expect(pressResult("both")).toEqual({ roll: true, seconds: 0, lull: false });
    expect([nextPhase({ phase: "lull", flurries: 0, oneFlurry: false }), nextPhase({ phase: "flurry", flurries: 1, oneFlurry: false }), nextPhase({ phase: "lull", flurries: 1, oneFlurry: true })]).toEqual(["flurry", "lull", "lull"]);
  });
});
