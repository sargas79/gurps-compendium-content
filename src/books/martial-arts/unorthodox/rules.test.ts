import { describe, expect, it } from "vitest";

import {
  IMPROVISED,
  contestPenalty,
  glassBreaks,
  hurlFor,
  hurlRange,
  improvisedSkillPenalty,
  isFamiliar,
  oneHandedGrip,
  oneHandedSkill,
  weaponGroups,
} from "./rules.js";

/** Unfamiliar, one-handed, hurled and improvised weapons (GURPS Martial Arts pp. 212, 220, 224). */
describe("unfamiliar weapons", () => {
  it("reads a fighter's groups, and treats a weapon with no group as everyone's", () => {
    const known = weaponGroups("European; Japanese ,");
    expect(known).toEqual(["european", "japanese"]);
    expect(isFamiliar("Japanese", known)).toBe(true);
    expect(isFamiliar("Indian", known)).toBe(false);
    expect(isFamiliar("", known)).toBe(true);
  });

  it("takes -2 in a Quick Contest facing the unfamiliar, cancelling when both sides are", () => {
    expect(contestPenalty(true, false)).toBe(-2);
    expect(contestPenalty(true, true)).toBe(0);
    expect(contestPenalty(false, true)).toBe(0);
  });
});

describe("two-handed weapons in one hand", () => {
  it("swaps the skill as the table says, and leaves a spear to its own line", () => {
    expect(oneHandedSkill("Polearm", "sw")).toBe("Axe/Mace");
    expect(oneHandedSkill("Polearm", "thr")).toBe("Spear");
    expect(oneHandedSkill("Staff", "sw")).toBe("Broadsword");
    expect(oneHandedSkill("Two-Handed Sword", "sw")).toBe("Broadsword");
    expect(oneHandedSkill("Two-Handed Flail", "sw")).toBe("Flail");
    expect(oneHandedSkill("Spear", "thr")).toBeNull();
  });

  it("needs 1.5 times the ST for a † weapon (unready after it attacks) and 3 times for ‡", () => {
    expect(oneHandedGrip(20, 13, false)).toBe("unready");
    expect(oneHandedGrip(39, 13, false)).toBe("ready");
    expect(oneHandedGrip(20, 13, true)).toBeNull();
    expect(oneHandedGrip(39, 13, true)).toBe("ready");
    expect(oneHandedGrip(12, 13, false)).toBeNull();
  });
});

describe("hurled melee weapons", () => {
  it("throws a broadsword point-first with DX at -4, and a 3-lb. weapon at ST x0.5/x1", () => {
    expect(hurlFor("Broadsword", false)).toEqual({ skill: "DX", attack: "thr", penalty: -4 });
    expect(hurlFor("Shortsword", true)).toEqual({ skill: "Thrown Weapon (Stick)", attack: "sw", penalty: -4 });
    expect(hurlFor("Kusari", false)?.skill).toBe("Bolas");
    expect(hurlFor("Whip", false)).toBeNull();
    expect(hurlRange(10, 3)).toEqual({ halfDamageRange: 5, maxRange: 10 });
    expect(hurlRange(10, 12)).toEqual({ halfDamageRange: 2, maxRange: 5 });
  });
});

describe("improvised weapons", () => {
  it("makes a steel ruler a one-yard urumi at -2 damage with Whip-2, or Whip at no penalty with the perk", () => {
    const ruler = IMPROVISED.find((e) => e.key === "ruler")!;
    expect(ruler).toMatchObject({ base: "Urumi", skill: "Whip", damage: -2, skillPenalty: -2, reach: "1", canParry: false });
    expect(improvisedSkillPenalty(ruler, [])).toBe(-2);
    expect(improvisedSkillPenalty(ruler, ["Whip"])).toBe(0);
  });

  it("breaks glass on 1-3, cutting the hand on a 1", () => {
    expect(glassBreaks(1)).toEqual({ breaks: true, cutsHand: true });
    expect(glassBreaks(3)).toEqual({ breaks: true, cutsHand: false });
    expect(glassBreaks(4)).toEqual({ breaks: false, cutsHand: false });
  });
});
