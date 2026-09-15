import { describe, expect, it } from "vitest";

import {
  bulletTimeSuggested,
  commandsProxy,
  defeatedFoesBonus,
  distracts,
  etiquetteRefuses,
  proxyPenalty,
  proxyRange,
  rebasedLevel,
  secretStylesAllowed,
  stageCombatDefault,
  unshoutedStyle,
  willsAftermath,
  willsModifiers,
  willsRound,
  willsScore,
} from "./rules.js";

/** The book's other cinematic combat rules (GURPS Martial Arts pp. 130, 132-133). */
describe("mind games", () => {
  it("gives the loser of a Contest of Wills won by 3 +3 to react and -3 to attack", () => {
    const round = willsRound({ success: true, margin: 2 }, { success: false, margin: 1 });
    expect(round).toEqual({ winner: "first", margin: 3 });
    expect(willsAftermath(round!.margin)).toEqual({ reaction: 3, attack: -3 });
    expect(willsRound({ success: true, margin: 2 }, { success: true, margin: 5 })).toBeNull();
  });

  it("rolls the best of Will, Intimidation and Mental Strength, with the book's modifiers", () => {
    expect(willsScore({ will: 12, intimidation: 14, mentalStrength: null })).toBe(14);
    expect(willsModifiers({ fearlessness: 2, indomitable: true, unfazeable: false, bestCombatSkill: 18, foeBestCombatSkill: 12, reputation: 2 })).toEqual([
      { key: "fearlessness", value: 2 }, { key: "indomitable", value: 5 }, { key: "betterFighter", value: 2 }, { key: "reputation", value: 2 },
    ]);
    expect(willsModifiers({ fearlessness: 0, indomitable: false, unfazeable: true, bestCombatSkill: 12, foeBestCombatSkill: 18, reputation: 0 })).toEqual([{ key: "unfazeable", value: 5 }]);
  });

  it("distracts on Bad Temper but not Berserk, and rewards a reputation for beating crowds", () => {
    expect([distracts("Bad Temper (12)"), distracts("Berserk (9)"), distracts("Bloodlust")]).toEqual([true, false, false]);
    expect([defeatedFoesBonus(4), defeatedFoesBonus(12), defeatedFoesBonus(40)]).toEqual([0, 2, 4]);
  });
});

describe("faking it, etiquette and shouts", () => {
  it("defaults Stage Combat, and rebases a skill on another attribute", () => {
    expect(stageCombatDefault({ combatArt: 14, combat: 15, performance: null })).toBe(12);
    expect(stageCombatDefault({ combatArt: null, combat: null, performance: null })).toBeNull();
    expect(rebasedLevel(13, 10, 12)).toBe(15);
  });

  it("offers a swordsman only a dodge against a punch", () => {
    expect([
      etiquetteRefuses({ delivery: "unarmed", defense: "dodge", bareHanded: false }),
      etiquetteRefuses({ delivery: "unarmed", defense: "parry", bareHanded: false }),
      etiquetteRefuses({ delivery: "unarmed", defense: "block", bareHanded: false }),
      etiquetteRefuses({ delivery: "unarmed", defense: "parry", bareHanded: true }),
      etiquetteRefuses({ delivery: "melee", defense: "parry", bareHanded: false }),
    ]).toEqual([false, true, true, false, false]);
  });

  it("shouts each secret style once a battle, and allows one per 50 points", () => {
    expect(unshoutedStyle(["Monkey King", "Southern Fire"], ["Monkey King"])).toBe("Southern Fire");
    expect(unshoutedStyle(["Monkey King"], ["Monkey King"])).toBeNull();
    expect(secretStylesAllowed(149)).toBe(2);
  });
});

describe("proxies and Bullet Time", () => {
  it("prices each proxy", () => {
    expect(proxyPenalties()).toEqual([-4, -6, -6, -9, -4, -4, -7]);
    expect([proxyRange(11), commandsProxy(14, 12), commandsProxy(12, 12)]).toEqual([6, true, false]);
    expect([bulletTimeSuggested(["Enhanced Time Sense"]), bulletTimeSuggested(["Combat Reflexes"])]).toEqual([true, false]);
  });
});

function proxyPenalties(): number[] {
  return [proxyPenalty("object"), proxyPenalty("slapArm"), proxyPenalty("slapLeg"), proxyPenalty("slapHead"), proxyPenalty("puppetWilling"), proxyPenalty("puppetUnwilling", 6), proxyPenalty("puppetUnwilling", 13)];
}
