/**
 * The supplement's device conventions (HT:EE pp. 8-9, 15), worked through
 * with the Basic Set's own rules from the pinned system.
 */

import { describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import {
  CUTTING_EDGE_COST,
  complexityOf,
  copyTime,
  cuttingEdgeFactor,
  deviceInjury,
  deviceStatistics,
  inventionFigures,
  kitBuilder,
  kitGrade,
  kitPrice,
  partOutcome,
  partsBroken,
  unavailableWhileNew,
  yearOf,
} from "./rules.js";

const hitPoints = (weight: number) => rules.objectHitPoints(weight, "unliving");

describe("cutting edge (HT:EE p. 8)", () => {
  it("prices a new device one grade up: basic x5, good x20 in all, fine not sold", () => {
    expect(CUTTING_EDGE_COST).toEqual({ basic: 5, good: 20 });
    expect(cuttingEdgeFactor("basic")).toBe(5);
    // The system already asks x5 for good; the rule takes it to x20.
    expect(cuttingEdgeFactor("good")! * rules.equipmentQualityCost("good")!).toBe(20);
    expect(cuttingEdgeFactor("fine")).toBeNull();
    expect(unavailableWhileNew("fine")).toBe(true);
    expect(cuttingEdgeFactor("best")).toBeNull();
    expect(cuttingEdgeFactor("")).toBeNull();
  });
});

describe("prototypes (HT:EE p. 8)", () => {
  it("reads a record's complexity and years", () => {
    expect(complexityOf("Average")).toBe("average");
    expect(complexityOf("")).toBeNull();
    expect(complexityOf("hard")).toBeNull();
    expect(yearOf(1906)).toBe(1906);
    expect(yearOf(0)).toBeNull();
    expect(yearOf("x")).toBeNull();
  });

  it("gives what inventing it takes under the Basic Set, a grade easier per TL the inventor is ahead", () => {
    const at = (inventorTl: number | null) => inventionFigures({ complexity: "complex", inventorTl, deviceTl: 6, gradeRow: rules.gradeRow, reinventing: rules.reinventing });
    expect(at(null)).toMatchObject({ grade: "complex", easier: false, row: { skill: 18, concept: -14, facilities: 250000 } });
    expect(at(6).easier).toBe(false);
    expect(at(8)).toMatchObject({ grade: "simple", easier: true, row: { concept: -6 } });
  });

  it("makes a copy in half a Prototype roll's time: a Complex one in 1d/2 months (Campaigns p. 474)", () => {
    expect(copyTime(rules.gradeRow("complex"))).toEqual({ dice: 1, adds: 0, unit: "months", divisor: 2 });
    expect(copyTime(rules.gradeRow("simple"))).toEqual({ dice: 1, adds: -2, unit: "days", divisor: 2 });
  });
});

describe("a device's HP, HT and DR (HT:EE p. 9)", () => {
  const none = { hp: null, ht: null, dr: null };

  it("takes HP from the weight as an Unliving object, HT 10 and DR 2", () => {
    // The book's radio: 8 lbs., 8 HP.
    expect(deviceStatistics({ weight: 8, fragile: false, stated: none, hitPoints })).toEqual({ hp: 8, ht: 10, dr: 2 });
  });

  it("gives a negligible-weight device 1 HP, and a fragile one DR 0", () => {
    expect(deviceStatistics({ weight: 0, fragile: true, stated: none, hitPoints })).toEqual({ hp: 1, ht: 10, dr: 0 });
  });

  it("keeps what the record states", () => {
    expect(deviceStatistics({ weight: 8, fragile: true, stated: { hp: 20, ht: 12, dr: 5 }, hitPoints })).toEqual({ hp: 20, ht: 12, dr: 5 });
  });
});

describe("breakable parts (HT:EE p. 8)", () => {
  const state = rules.objectState;

  it("works the book's example: the radio off the table, its tubes and its DR", () => {
    // 8 HP doubled on hardwood, velocity 5 for a yard: 0.8, so 1d-1.
    expect(rules.fallingDamage({ hitPoints: 8, yardsFallen: 1, surface: "hard" }).damage).toEqual({ dice: 1, modifier: -1 });
    // A roll of 2: each 1-HP tube goes to -1 and rolls HT; three of five fail.
    const tubes = partOutcome({ damage: 2, hp: 1, state });
    expect(tubes).toEqual({ hpLeft: -1, state: "breaking", rollsHt: true });
    expect(partsBroken(tubes.state, 5, [9, 12, 14, 8, 11], 10)).toBe(3);
    // DR 2 stops the radio's own share.
    expect(deviceInjury(2, 2)).toBe(0);
    expect(deviceInjury(5, 2)).toBe(3);
  });

  it("leaves parts short of -1xHP whole, and destroys them all at -5xHP", () => {
    expect(partOutcome({ damage: 1, hp: 1, state })).toMatchObject({ state: "failing", rollsHt: false });
    expect(partsBroken("failing", 5, [], 10)).toBe(0);
    expect(partOutcome({ damage: 6, hp: 1, state }).state).toBe("destroyed");
    expect(partsBroken("destroyed", 5, [], 10)).toBe(5);
  });

  it("succeeds on 3-4 and fails on 17-18 whatever the HT", () => {
    expect(partsBroken("breaking", 2, [4, 17], 3)).toBe(1);
    expect(partsBroken("breaking", 2, [4, 17], 18)).toBe(1);
  });
});

describe("kits (HT:EE p. 15)", () => {
  it("costs a quarter of the price: 20% parts and 5% instructions", () => {
    expect(kitPrice(400)).toBe(100);
    expect(kitPrice(-1)).toBe(0);
  });

  it("is built with IQ, or the better Hobby Skill", () => {
    expect(kitBuilder({ iq: 11, hobbies: [] })).toEqual({ name: null, level: 11 });
    expect(kitBuilder({ iq: 11, hobbies: [{ name: "Hobby Skill (Amateur Radio)", level: 13 }, { name: "Hobby Skill (Hi-Fi)", level: 12 }] })).toEqual({ name: "Hobby Skill (Amateur Radio)", level: 13 });
    expect(kitBuilder({ iq: 14, hobbies: [{ name: "Hobby Skill (Hi-Fi)", level: 12 }] })).toEqual({ name: null, level: 14 });
  });

  it("takes its grade from the record's complexity, else from its price", () => {
    expect(kitGrade(null, 2000, rules.gradeForPrice)).toBe("average");
    expect(kitGrade("complex", 50, rules.gradeForPrice)).toBe("complex");
  });
});
