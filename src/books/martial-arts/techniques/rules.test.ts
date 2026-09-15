import { describe, expect, it } from "vitest";

import {
  artAndSport,
  buyOff,
  combinationLevels,
  combinationPartLevels,
  combinationPenalty,
  combinationUsable,
  needsSetup,
  predictability,
  readCombination,
  readTargetedAttack,
  specialTechniqueName,
  targetPenalty,
  targetedAttackLevel,
  techniquesTogether,
} from "./rules.js";

/** Targeted Attacks and Combinations (GURPS Martial Arts pp. 64, 68, 80). */
const ta = (name: string) => readTargetedAttack(name)!;
const bounds = (name: string, skill: number, technique: number | null = null) => {
  const r = targetedAttackLevel(ta(name), { skill, technique, points: 99 });
  return [r.default, r.ceiling];
};

describe("Targeted Attacks", () => {
  it("reads a TA's skill, attack and target from its name", () => {
    expect(ta("TA (Two-Handed Sword Swing/Neck)")).toEqual({ skill: "Two-Handed Sword", attack: "swing", target: "neck", chinks: false });
    expect(ta("TA (Karate Knee Strike/Groin)")).toMatchObject({ skill: "Karate", attack: "knee strike", target: "groin" });
    expect(ta("TA (Rapier Thrust/Vitals Chinks)")).toMatchObject({ attack: "thrust", target: "vitals", chinks: true });
    expect(readTargetedAttack("Kicking (Karate)")).toBeNull();
  });

  it("defaults and caps as the book's examples do", () => {
    // Skill 12 in each, so the figures read as skill-N.
    expect(bounds("TA (Broadsword Swing/Neck)", 12)).toEqual([7, 10]);
    expect(bounds("TA (Wrestling Grapple/Arm)", 12)).toEqual([11, 12]);
    expect(bounds("TA (Boxing Punch/Face)", 12)).toEqual([7, 10]);
    expect(bounds("TA (Broadsword Disarm/Weapon)", 12)).toEqual([6, 9]);
    expect(bounds("TA (Judo Throw/Skull)", 12)).toEqual([5, 9]);
    expect(bounds("TA (Rapier Thrust/Vitals Chinks)", 12)).toEqual([2, 7]);
    expect(bounds("TA (Wrestling Grab/Weapon)", 12)).toEqual([8, 10]);
    // Karate-4 or Knee Strike-3; cannot exceed Karate-2 or Knee Strike-1.
    expect(bounds("TA (Karate Knee Strike/Groin)", 12)).toEqual([8, 10]);
    expect(bounds("TA (Karate Knee Strike/Groin)", 12, 12)).toEqual([9, 11]);
    expect(specialTechniqueName(ta("TA (Karate Knee Strike/Groin)"))).toBe("Knee Strike (Karate)");
  });

  it("buys levels as a Hard technique", () => {
    expect(targetedAttackLevel(ta("TA (Broadsword Swing/Neck)"), { skill: 12, technique: null, points: 0 }).level).toBe(7);
    expect(targetedAttackLevel(ta("TA (Broadsword Swing/Neck)"), { skill: 12, technique: null, points: 3 }).level).toBe(9);
    expect(targetPenalty(ta("TA (Judo Grapple/Face)"))).toBe(-3);
    expect(buyOff(-5, "punch")).toBe(3);
  });

  it("makes a TA predictable from its third use on a foe", () => {
    expect(predictability(1)).toBe(0);
    expect(predictability(2)).toBe(1);
  });
});

describe("Combinations", () => {
  it("reads its parts in order", () => {
    const parts = readCombination("Combination (Judo Grapple/Torso + Judo Throw + Karate Kick/Face)")!;
    expect(parts.map((p) => p.attack)).toEqual(["grapple", "throw", "kick"]);
    expect(parts[1]!.target).toBeNull();
    expect(needsSetup(parts[1]!)).toBe(true);
  });

  it("puts Don Ortiz's Combination at 10+9, and 16+15 for 9 points", () => {
    expect(combinationPartLevels([16, 15], { points: 0, master: false })).toEqual([10, 9]);
    expect(combinationLevels(9, 2)).toBe(6);
    expect(combinationPartLevels([16, 15], { points: 9, master: false })).toEqual([16, 15]);
  });

  it("puts Sifu Chen's at 14+14+9 with Trained by a Master, and 20+20+15 for 10 points", () => {
    expect(combinationPenalty(3, true)).toBe(-6);
    expect(combinationPartLevels([20, 20, 15], { points: 0, master: true })).toEqual([14, 14, 9]);
    expect(combinationPartLevels([20, 20, 15], { points: 10, master: true })).toEqual([20, 20, 15]);
    expect(combinationPartLevels([20, 20, 15], { points: 20, master: true })).toEqual([20, 20, 15]);
  });

  it("needs 5 points in a three-attack Combination without master training", () => {
    expect(combinationUsable(3, 4, false)).toBe(false);
    expect(combinationUsable(3, 5, false)).toBe(true);
    expect(combinationUsable(2, 0, false)).toBe(true);
  });
});

describe("defaults and techniques together", () => {
  it("adds the Art and Sport versions of a combat skill", () => {
    expect(artAndSport("Karate")).toEqual(["Karate Art", "Karate Sport"]);
    expect(artAndSport("Karate Art")).toEqual([]);
  });

  it("adds techniques' levels relative to the skill", () => {
    expect(techniquesTogether(14, [12, 13])).toBe(11);
  });
});
