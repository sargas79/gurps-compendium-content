import { describe, expect, it } from "vitest";

import { destinyPoints, mayPay, poolsFrom, poolsOf, refreshed, regainDestiny, spent, wildcardBonusPoints, wildcardIgnoresFamiliarity } from "./points.js";
import { skipTalentOnWildcard } from "./talents.js";

// Ported from the system's own tests for these rules (GWorldVTT
// src/rules/__tests__/bonus-points.test.ts and the Talents cases).

describe("wildcard bonus points (p. 28)", () => {
  it("gives Blade! with 36 points three a session, for Blade! rolls only", () => {
    expect(wildcardBonusPoints(36)).toBe(3);
    const blade = { kind: "wildcard" as const, skill: "Blade!" };
    expect(mayPay(blade, "buySuccess", { skill: "Blade!" })).toEqual({ allowed: true, gmCheck: false });
    expect(mayPay(blade, "buySuccess", { skill: "Gun!" }).allowed).toBe(false);
  });

  it("leaves flesh wounds and guidance to the GM", () => {
    expect(mayPay({ kind: "wildcard", skill: "Blade!" }, "fleshWound")).toEqual({ allowed: true, gmCheck: true });
    expect(mayPay({ kind: "destiny" }, "buySuccess", { skill: "Gun!" })).toEqual({ allowed: true, gmCheck: false });
  });

  it("shows a wildcard pool where no roll asks which skill", () => {
    expect(mayPay({ kind: "wildcard", skill: "Blade!" }, "buySuccess").allowed).toBe(true);
  });

  it("ignores familiarity from 12 points", () => {
    expect(wildcardIgnoresFamiliarity(12)).toBe(true);
    expect(wildcardIgnoresFamiliarity(11)).toBe(false);
    expect(wildcardBonusPoints(11)).toBe(0);
  });
});

describe("destiny points (p. 23)", () => {
  it("gives 1, 2 or 3, or the GM as many against a negative Destiny", () => {
    expect(destinyPoints(15)).toEqual({ own: 3, gm: 0 });
    expect(destinyPoints(5)).toEqual({ own: 1, gm: 0 });
    expect(destinyPoints(-10)).toEqual({ own: 0, gm: 2 });
  });

  it("regains one a session, never past the start", () => {
    expect(regainDestiny(1, 3)).toBe(2);
    expect(regainDestiny(3, 3)).toBe(3);
  });
});

describe("a character's pools", () => {
  const skills = [{ name: "Blade!", points: 36 }, { name: "Gun!", points: 12 }, { name: "Talker!", points: 6 }];

  it("start full, and keep what was spent", () => {
    const fresh = poolsFrom({ destinyTraitPoints: 10, wildcardSkills: skills, stored: undefined });
    expect(fresh.destiny).toEqual({ value: 2, max: 2 });
    expect(fresh.wildcard).toEqual([
      { skill: "Blade!", value: 3, max: 3, fullyTrained: true },
      { skill: "Gun!", value: 1, max: 1, fullyTrained: true },
      { skill: "Talker!", value: 0, max: 0, fullyTrained: false },
    ]);
    const used = poolsFrom({ destinyTraitPoints: 10, wildcardSkills: skills, stored: { destiny: 1, wildcard: [{ skill: "Blade!", value: 1 }] } });
    expect(used.destiny.value).toBe(1);
    expect(used.wildcard[0]!.value).toBe(1);
  });

  it("spend from the pool chosen, and refuse more than it holds", () => {
    const pools = poolsFrom({ destinyTraitPoints: 10, wildcardSkills: skills, stored: undefined });
    expect(spent(pools, { kind: "destiny" }, 1)?.destiny).toBe(1);
    expect(spent(pools, { kind: "destiny" }, 3)).toBeNull();
    expect(spent(pools, { kind: "wildcard", skill: "Blade!" }, 2)?.wildcard).toEqual([
      { skill: "Blade!", value: 1 }, { skill: "Gun!", value: 1 }, { skill: "Talker!", value: 0 },
    ]);
    expect(spent(pools, { kind: "wildcard", skill: "Nope!" }, 1)).toBeNull();
  });

  it("refresh at the start of a session", () => {
    const pools = poolsFrom({ destinyTraitPoints: -15, wildcardSkills: skills, stored: { gmDestiny: 0, wildcard: [{ skill: "Blade!", value: 0 }] } });
    expect(refreshed(pools)).toEqual({ destiny: 0, gmDestiny: 3, wildcard: [{ skill: "Blade!", value: 3 }, { skill: "Gun!", value: 1 }, { skill: "Talker!", value: 0 }] });
  });

  it("are read off a character's Destiny trait, wildcard skills and stored points", () => {
    const actor = {
      items: [
        { type: "trait", name: "Destiny (Great)", system: { totalPoints: 15 } },
        { type: "skill", name: "Blade!", system: { difficulty: "W", points: 24 } },
        { type: "skill", name: "Broadsword", system: { difficulty: "A", points: 24 } },
      ],
      system: { extensions: { "gurps-compendium-content": { points: { destiny: 2 } } } },
    };
    const pools = poolsOf(actor);
    expect(pools.destiny).toEqual({ value: 2, max: 3 });
    expect(pools.wildcard.map((p) => p.skill)).toEqual(["Blade!"]);
  });
});

describe("Talents and wildcard skills (p. 24)", () => {
  const lines = () => [
    { key: "bonus", label: "Bonus", value: 1, source: "system" },
    { key: "talent", label: "Talent", value: 2, source: "system" },
  ];

  it("cancel the Talent line on a wildcard skill, with the reason", () => {
    const context = { difficulty: "W", lines: lines() };
    expect(skipTalentOnWildcard(context, "Talents never add to wildcard skills")).toBe(true);
    expect(context.lines[1]).toMatchObject({ value: 0, reason: "Talents never add to wildcard skills" });
    expect(context.lines[0]!.value).toBe(1);
  });

  it("leave any other skill alone", () => {
    const context = { difficulty: "VH", lines: lines() };
    expect(skipTalentOnWildcard(context, "x")).toBe(false);
    expect(context.lines[1]!.value).toBe(2);
  });
});
