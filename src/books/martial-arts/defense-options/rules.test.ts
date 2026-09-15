import { describe, expect, it } from "vitest";

import {
  crossParryBreakage,
  crossParryScore,
  dodgeLimitPenalty,
  legParryDefends,
  longTwoHandedParry,
  multipleBlockPenalty,
  retreatOptionBonus,
  riposteAgainst,
  riposteAllowed,
  ripostePenalties,
  unarmedParry,
} from "./rules.js";

/** Active defense options (GURPS Martial Arts pp. 121-125). */
describe("Cross Parry", () => {
  it("parries at the better Parry +2", () => {
    expect(crossParryScore([9, 7])).toBe(11);
  });

  it("meets a heavy weapon as the two weapons' combined weight, and the lighter breaks", () => {
    const rank = (q: string) => ({ cheap: 0, good: 1, fine: 2 } as Record<string, number>)[q] ?? 1;
    const combined = crossParryBreakage([{ name: "Shortsword", weight: 2, quality: "good" }, { name: "Large Knife", weight: 1, quality: "cheap" }], rank);
    expect(combined.weight).toBe(3);
    expect(combined.quality).toBe("cheap");
    expect(combined.breaks.name).toBe("Large Knife");
    // A 7-lb. weapon is under three times 3 lbs.: no roll to break.
    expect(7 / combined.weight).toBeLessThan(3);
  });
});

describe("Riposte", () => {
  it("lets Harry parry at 11 after a -4 Riposte, but not below 8", () => {
    expect(riposteAllowed(15, 4)).toBe(true);
    expect(riposteAllowed(11, 4)).toBe(false);
  });

  it("gives Black Odo -4 to his sword's parry and -2 to his shield's block", () => {
    expect(ripostePenalties(4, riposteAgainst({ shield: false, unarmed: false, hand: true }))).toEqual({ parry: -4, block: -2, dodge: -2 });
    expect(riposteAgainst({ shield: true, unarmed: false, hand: true })).toBe("block");
    expect(riposteAgainst({ shield: false, unarmed: true, hand: false })).toBe("dodge");
  });
});

describe("retreats, legs and long weapons", () => {
  it("dives and sideslips at the retreat bonus -1, slips at -2, and a fencing parry dives at +1 -1", () => {
    expect(retreatOptionBonus("dive", 3, false)).toBe(2);
    expect(retreatOptionBonus("sideslip", 1, false)).toBe(0);
    expect(retreatOptionBonus("slip", 3, false)).toBe(1);
    expect(retreatOptionBonus("dive", 3, true)).toBe(0);
  });

  it("parries with a leg only against the feet, legs and groin", () => {
    expect(legParryDefends("leg")).toBe(true);
    expect(legParryDefends("groin")).toBe(true);
    expect(legParryDefends("torso")).toBe(false);
    expect(unarmedParry(12)).toBe(9);
  });

  it("knows a long two-handed weapon", () => {
    expect(longTwoHandedParry("Staff", 2, true)).toBe(true);
    expect(longTwoHandedParry("Spear", 1, true)).toBe(false);
    expect(longTwoHandedParry("Broadsword", 2, true)).toBe(false);
  });
});

describe("limits on dodging and blocking", () => {
  it("puts -1 on each dodge after the first", () => {
    expect(dodgeLimitPenalty(0)).toBe(0);
    expect(dodgeLimitPenalty(2)).toBe(-2);
  });

  it("puts the third block in a turn at -10, or -5 for a Weapon Master", () => {
    expect(multipleBlockPenalty(2, false)).toBe(-10);
    expect(multipleBlockPenalty(1, true)).toBe(-3);
    expect(multipleBlockPenalty(2, true)).toBe(-5);
    expect(multipleBlockPenalty(3, true)).toBe(-8);
  });
});
