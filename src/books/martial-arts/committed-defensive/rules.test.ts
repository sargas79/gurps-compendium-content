import { describe, expect, it } from "vitest";

import {
  committedDamageBonus,
  committedHitBonus,
  committedRefusals,
  committedStepPenalty,
  defensiveDamagePenalty,
  defensiveDefenseBonus,
  isStBased,
  stanceOfResponse,
} from "./rules.js";

/** Committed Attack and Defensive Attack (GURPS Martial Arts pp. 99-100). */
describe("Committed Attack", () => {
  it("gives Determined +2 to hit, and a second step takes it back", () => {
    expect(committedHitBonus("determined") + committedStepPenalty(2)).toBe(0);
    expect(committedHitBonus("determined") + committedStepPenalty(1)).toBe(2);
    expect(committedHitBonus("strong")).toBe(0);
    expect(committedHitBonus(null)).toBe(0);
  });

  it("gives Strong +1 to thrust or swing damage only", () => {
    expect(committedDamageBonus("strong", isStBased("sw", false))).toBe(1);
    expect(committedDamageBonus("strong", isStBased("thr", false))).toBe(1);
    expect(committedDamageBonus("strong", isStBased("fixed", false))).toBe(0);
    expect(committedDamageBonus("strong", isStBased("", true))).toBe(1);
    expect(committedDamageBonus("determined", true)).toBe(0);
  });

  it("takes the dodge after a kick and the block after a shield bash", () => {
    expect(committedRefusals({ itemId: "", kick: true, shield: false })).toEqual({ dodge: true, block: false });
    expect(committedRefusals({ itemId: "s", kick: false, shield: true })).toEqual({ dodge: false, block: true });
    expect(committedRefusals(null)).toEqual({ dodge: false, block: false });
  });
});

describe("Defensive Attack", () => {
  it("does -2 damage, or -1 per die where that is worse", () => {
    expect(defensiveDamagePenalty(1)).toBe(-2);
    expect(defensiveDamagePenalty(2)).toBe(-2);
    expect(defensiveDamagePenalty(3)).toBe(-3);
  });

  it("gives +1 to the one defense it was made for", () => {
    expect(defensiveDefenseBonus("parry", "parry")).toBe(1);
    expect(defensiveDefenseBonus("parry", "block")).toBe(0);
    expect(defensiveDefenseBonus("block", "block")).toBe(1);
    expect(defensiveDefenseBonus("sameWeapon", "parry")).toBe(0);
  });
});

describe("a Wait's response", () => {
  it("names a Committed Attack's kind in advance, or a Defensive Attack", () => {
    expect(stanceOfResponse("committedStrong")).toEqual({ kind: "committed", mode: "strong" });
    expect(stanceOfResponse("defensive")).toEqual({ kind: "defensive", benefit: null });
    expect(stanceOfResponse(null)).toBeNull();
  });
});
