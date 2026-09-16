import { describe, expect, it } from "vitest";

import {
  AGENT_POISONS,
  aegisSkill,
  agentEffects,
  cloudSeconds,
  dominatorCost,
  embrittlementDamage,
  firefoamDice,
  muskDays,
  nanotracerConcealment,
  nerveSymptoms,
  protectedFrom,
  shrikeSkill,
  smokeFormSeconds,
  splatterDetonation,
  splatterFormula,
  splatterSkill,
} from "./rules.js";

const open = { sealed: false, doesntBreathe: false, filterLungs: false, metabolicImmunity: false };

describe("agents as poisons (Ultra-Tech pp. 159-162)", () => {
  it("gives each its resistance, damage and cycles", () => {
    expect(AGENT_POISONS.nerveGas).toMatchObject({ resistanceModifier: -6, damage: "toxic", dice: 1, intervalSeconds: 60, cycles: 6 });
    expect(AGENT_POISONS.nerveGasResidue.resistanceModifier).toBe(-3);
    expect(AGENT_POISONS.contactNervePoison.resistanceModifier).toBe(AGENT_POISONS.nervePoison.resistanceModifier! + 2);
    expect(AGENT_POISONS.contactSleepPoison.resistanceModifier).toBe(AGENT_POISONS.sleepPoison.resistanceModifier! + 2);
    expect(AGENT_POISONS.nanoburnDamage).toMatchObject({ resistanceModifier: null, dice: 1, adds: -1, intervalSeconds: 180, cycles: 10 });
    expect(AGENT_POISONS.dominator.delaySeconds).toBe(21600);
    expect(AGENT_POISONS.dominatorSuperscience.delaySeconds).toBe(60);
  });

  it("works out what a failure does", () => {
    expect(agentEffects("riotGas", 4, false)).toEqual([{ condition: "nauseated", seconds: null, note: "riotGasNauseated" }]);
    expect(agentEffects("riotGas", 5, false)[0]!.condition).toBe("retching");
    expect(agentEffects("sleepGas", 3, false)).toEqual([{ condition: "unconscious", seconds: 180, note: "sleepGas" }]);
    expect(agentEffects("paralysisGas", 2, false)[0]!.condition).toBe(null);
    expect(agentEffects("paralysisGas", 4, false)[0]).toMatchObject({ condition: "paralysis", seconds: 240 });
    expect(agentEffects("paralysisGas", 9, true)[0]!.condition).toBe("coma");
    expect(agentEffects("sleepPoison", 4, false)[0]!.condition).toBe("drowsy");
    expect(agentEffects("sleepPoison", 6, false)[0]).toMatchObject({ condition: "unconscious", seconds: 360 });
    expect(agentEffects("nanoburn", 2, false)[0]).toMatchObject({ condition: "paralysis", seconds: 360 });
    expect(agentEffects("nerveGas", 5, false)).toEqual([]);
  });

  it("brings the nerve agents' symptoms at a third, a half and two-thirds", () => {
    expect(nerveSymptoms("1/3")).toEqual({ condition: "coughing", disorder: "Mild" });
    expect(nerveSymptoms("1/2")).toEqual({ condition: "nauseated", disorder: "Severe" });
    expect(nerveSymptoms("2/3")).toEqual({ condition: null, disorder: "Crippling" });
    expect(nerveSymptoms("x")).toBe(null);
  });

  it("keeps an agent out of a sealed suit, a body that doesn't breathe, or a machine", () => {
    expect(protectedFrom("riotGas", open)).toBe(null);
    expect(protectedFrom("riotGas", { ...open, filterLungs: true })).toBe("breath");
    expect(protectedFrom("sleepGas", { ...open, doesntBreathe: true })).toBe(null);
    expect(protectedFrom("sleepGas", { ...open, sealed: true })).toBe("sealed");
    expect(protectedFrom("nervePoison", { ...open, sealed: true })).toBe(null);
    expect(protectedFrom("nervePoison", { ...open, metabolicImmunity: true })).toBe("metabolic");
  });
});

describe("clouds, smoke and foams (Ultra-Tech pp. 159-161)", () => {
  it("disperses a cloud by the wind", () => {
    expect(cloudSeconds(0)).toBe(300);
    expect(cloudSeconds(0.5)).toBe(300);
    expect(cloudSeconds(10)).toBe(30);
    expect(smokeFormSeconds(12)).toBe(3);
  });

  it("puts out fires, embrittles metal and lets musk wash off", () => {
    expect(firefoamDice(10)).toBe(2);
    expect(embrittlementDamage(4)).toEqual({ dice: 3, multiplier: 4, hours: 12 });
    expect(embrittlementDamage(1).multiplier).toBe(1);
    expect(muskDays(3)).toBe(11);
    expect(muskDays(20)).toBe(0);
  });
});

describe("metabolic nanoweapons (Ultra-Tech pp. 161-162)", () => {
  it("prices dominator nano by the disadvantages' points", () => {
    expect(dominatorCost(-5, false, false)).toBe(500);
    expect(dominatorCost(-15, true, true)).toBe(6000);
  });

  it("gives Aegis, splatter and shrike their skills", () => {
    expect(aegisSkill(10)).toBe(10);
    expect(aegisSkill(12)).toBe(14);
    expect(splatterSkill(11)).toBe(12);
    expect(shrikeSkill(11, 0)).toBe(14);
    expect(shrikeSkill(10, 2)).toBe(14);
    expect(nanotracerConcealment(11)).toBe(-4);
  });

  it("works out splatter's detonation, as the book's example does", () => {
    expect(splatterDetonation({ doses: 1, minutes: 5, aegisWins: 3 })).toEqual({ dice: 5, perDie: -3, exterminated: false });
    expect(splatterFormula(5, -3)).toBe("5d-15");
    expect(splatterDetonation({ doses: 3, minutes: 50, aegisWins: 0 }).dice).toBe(90);
    expect(splatterDetonation({ doses: 1, minutes: 9, aegisWins: 6 }).exterminated).toBe(true);
    expect(splatterFormula(4, 0)).toBe("4d");
  });
});
