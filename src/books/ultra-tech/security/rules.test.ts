import { describe, expect, it } from "vitest";

import {
  addDie,
  cuffEscapeModifier,
  damperWill,
  doorDr,
  dreamNetRemoval,
  fastProbeTarget,
  fenceCost,
  mindProbeHours,
  mindProbeResult,
  monowireDice,
  neuralFieldModifier,
  neuralProgrammerQuality,
  neuralProgrammingModifier,
  neuronicModifier,
  pacifierTarget,
  razortapeDamage,
  restraintByName,
  restraintFigures,
  safeDr,
  sensoryRestraintBonus,
  struggleSeconds,
  veridicatorBonus,
} from "./rules.js";

describe("barriers (Ultra-Tech pp. 101-104)", () => {
  it("prices a tight fence at twice an open one", () => {
    expect(fenceCost(5000, 4, false)).toBe(20000);
    expect(fenceCost(5000, 4, true)).toBe(40000);
  });

  it("cuts harder the faster someone walks into monowire", () => {
    expect(monowireDice("slow")).toBe("1d");
    expect(monowireDice("running")).toBe("3d");
  });

  it("gives +1 to resist a neural field per 2 DR of sealed armour", () => {
    expect(neuralFieldModifier(0)).toBe(-1);
    expect(neuralFieldModifier(7)).toBe(2);
  });

  it("stuns someone pulled out of a dream net by the margin, or knocks them out", () => {
    expect(dreamNetRemoval({ success: false, criticalFailure: false, margin: 3 })).toEqual({ stunnedSeconds: 3, unconsciousDice: null });
    expect(dreamNetRemoval({ success: false, criticalFailure: true, margin: 8 }).unconsciousDice).toBe("1d6");
  });

  it("toughens doors and safes by TL", () => {
    expect(doorDr(9)).toBe(100);
    expect(doorDr(12)).toBe(300);
    expect(safeDr(300, 10)).toBe(450);
    expect(safeDr(400, 12)).toBe(1200);
  });
});

describe("restraints (Ultra-Tech pp. 107-108)", () => {
  it("reads the restraints by name and toughens cuffs by TL", () => {
    expect(restraintByName("Heavy-Duty Electronic Cuffs")).toBe("heavyCuffs");
    expect(restraintFigures("cuffs", 11)).toEqual({ st: 30, dr: 20 });
    expect(restraintFigures("cufftape", 12)).toEqual({ st: 20, dr: 1 });
  });

  it("takes Escape at -6, -8 with arms and legs, and 10 minutes after the first try", () => {
    expect(cuffEscapeModifier(false)).toBe(-6);
    expect(cuffEscapeModifier(true)).toBe(-8);
    expect(struggleSeconds(1)).toBe(1);
    expect(struggleSeconds(2)).toBe(600);
  });

  it("cuts a razortape escapee with their own thrust, and monowire harder", () => {
    expect(razortapeDamage("razortape", "1d-1")).toEqual({ formula: "1d-1", divisor: 1 });
    expect(razortapeDamage("monowireRazortape", "1d-1")).toEqual({ formula: "2d-1", divisor: 10 });
    expect(addDie("2d")).toBe("3d");
  });

  it("sets dampers', neuronic restraints' and pacifiers' rolls", () => {
    expect(damperWill(false, 9)).toBe(18);
    expect(damperWill(true, 11)).toBe(24);
    expect(neuronicModifier(true)).toBe(-6);
    expect(pacifierTarget(12, 10)).toBe(9);
  });
});

describe("interrogation (Ultra-Tech pp. 107-110)", () => {
  it("gives sensory restraints their bonus against the wearer", () => {
    expect(sensoryRestraintBonus("Smart Blindfold")).toBe(1);
    expect(sensoryRestraintBonus("Sensory Deprivation Tank")).toBe(2);
    expect(sensoryRestraintBonus("Sensory Deprivation Tank", 1)).toBe(3);
  });

  it("gives a veridicator +TL/2", () => {
    expect(veridicatorBonus(11)).toBe(5);
  });

  it("penalizes neural programming per 5 points and rates its software", () => {
    expect(neuralProgrammingModifier(-10)).toBe(-2);
    expect(neuralProgrammingModifier(-12)).toBe(-3);
    expect(neuralProgrammerQuality(7)).toBe(0);
    expect(neuralProgrammerQuality(11)).toBe(2);
  });

  it("times mind probes and reads their results", () => {
    expect(mindProbeHours(false, 10)).toBe(8);
    expect(mindProbeHours(true, 12)).toBe(0.25);
    expect(mindProbeResult({ success: true, criticalSuccess: false, criticalFailure: false })).toBe("mixed");
    expect(mindProbeResult({ success: false, criticalSuccess: false, criticalFailure: true })).toBe("falseMemories");
    expect(fastProbeTarget(12, 14)).toBe(12);
  });
});
