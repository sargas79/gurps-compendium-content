import { describe, expect, it } from "vitest";

import {
  accessoryComputer,
  aiSoftwarePrice,
  backupGigabytes,
  bodyPrice,
  cyborgComputer,
  intelligenceComplexity,
  isAutomaton,
  knockbackStunPenalty,
  lensName,
  parseCostModifier,
  reprogrammingBonus,
} from "./rules.js";

describe("pricing a robot (Ultra-Tech pp. 28-29)", () => {
  it("splits a lens from its template's name", () => {
    expect(lensName("Biomorphic: Living Flesh")).toEqual({ prefix: "Biomorphic", lens: "Living Flesh" });
    expect(lensName("Android")).toEqual({ prefix: "", lens: "Android" });
  });

  it("reads a lens's percentage or dollars", () => {
    expect(parseCostModifier("+50%")).toEqual({ percent: 0.5, dollars: 0 });
    expect(parseCostModifier("+$10,000")).toEqual({ percent: 0, dollars: 10000 });
  });

  it("adds the lenses' percentages on the base cost", () => {
    // A $50,000 android with living flesh (+50%) and fur (+10%).
    expect(bodyPrice(50000, [{ percent: 0.5, dollars: 0 }, { percent: 0.1, dollars: 0 }])).toBe(80000);
  });

  it("prices AI software from the table with 5% per extra point", () => {
    // Volitional IQ 10 is Complexity 8: $3,000 at TL10; 60 extra points is +300%.
    expect(aiSoftwarePrice({ kind: "volitional", iq: 10, tl: 10, extraPoints: 60 })).toEqual({ complexity: 8, base: 3000, price: 12000 });
    expect(aiSoftwarePrice({ kind: "volitional", iq: 10, tl: 10, extraPoints: -100 })?.price).toBe(600);
    expect(aiSoftwarePrice({ kind: "cyborgBrain", iq: 10, tl: 10, extraPoints: 0 })).toBeNull();
  });

  it("gives a drone Complexity 3 and a cyborg brain none", () => {
    expect(intelligenceComplexity("drone", 0)).toBe(3);
    expect(intelligenceComplexity("cyborgBrain", 10)).toBeNull();
  });
});

describe("computers in robots (Ultra-Tech pp. 27, 30)", () => {
  it("finds the computer the Accessories perk names", () => {
    expect(accessoryComputer(["Payload 1", "Accessories (Personal computer)"])).toBe("personal");
    expect(accessoryComputer(["Accessories (Small computer; fire extinguisher)"])).toBe("small");
    expect(accessoryComputer(["Radio"])).toBeNull();
  });

  it("makes a total cyborg's computer one size smaller", () => {
    expect(cyborgComputer("personal")).toBe("small");
    expect(cyborgComputer("tiny")).toBeNull();
  });

  it("sizes a backup at 5 MB for Complexity 1 and ten times per level", () => {
    expect(backupGigabytes(1)).toBeCloseTo(0.005);
    expect(backupGigabytes(4)).toBeCloseTo(5);
  });
});

describe("robots in action (Ultra-Tech pp. 34-35)", () => {
  it("gives a hacker +3 against an Automaton", () => {
    expect(reprogrammingBonus(["Automaton"])).toBe(3);
    expect(reprogrammingBonus(["Slave Mentality"])).toBe(3);
    expect(reprogrammingBonus(["Digital Mind"])).toBe(0);
  });

  it("rolls IQ at -2 per yard of knockback", () => {
    expect(knockbackStunPenalty(3)).toBe(-6);
  });

  it("knows an Automaton by its trait or lens", () => {
    expect(isAutomaton(["Automaton (Has Sense of Humor)"])).toBe(true);
    expect(isAutomaton([], ["nonVolitional"])).toBe(true);
    expect(isAutomaton([], ["volitional"])).toBe(false);
  });
});
