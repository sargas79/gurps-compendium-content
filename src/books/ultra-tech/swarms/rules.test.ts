import { describe, expect, it } from "vitest";

import {
  SWARM_ATTACKS,
  cellEnduranceHours,
  designProblems,
  gremlinMalfunction,
  selfReplicatedSize,
  swarmCost,
  swarmEnduranceHours,
  swarmInjury,
  swarmLegality,
  swarmStatistics,
  typeByName,
  type SwarmDesign,
} from "./rules.js";

const design = (patch: Partial<SwarmDesign> = {}): SwarmDesign => ({
  squareYards: 1, bots: "microbot", chassis: "crawler", power: "cells", type: "stinger", tl: 10, ...patch,
});
const person = { living: true, machine: false, swarm: false, sealed: false, dr: 0 };

describe("building a swarm (Ultra-Tech pp. 35-37)", () => {
  it("reads the type from the record's name", () => {
    expect(typeByName("Terminator Swarm")).toBe("terminator");
    expect(typeByName("Utility Fog")).toBeNull();
  });

  it("prices a square yard from the type and multiplies by the area", () => {
    expect(swarmCost(design({ squareYards: 3 }))).toEqual({ perSquareYard: 1500, total: 4500 });
  });

  it("adds the chassis's and power supply's percentages together", () => {
    // Flier +100% and beamed power +50%: 2.5 times.
    expect(swarmCost(design({ chassis: "flier", power: "beamed" })).perSquareYard).toBe(3750);
    expect(swarmCost(design({ bots: "nanobot", chassis: "dust", type: "surveillance", tl: 11 })).perSquareYard).toBe(100);
  });

  it("adds a disguise and a second type, and multiplies self-replication by ten", () => {
    expect(swarmCost(design({ disguised: true })).perSquareYard).toBe(2500);
    expect(swarmCost(design({ secondType: "terminator", tl: 11 })).perSquareYard).toBe(3000);
    expect(swarmCost(design({ bots: "nanobot", type: "devourer", power: "gastrobot", selfReplicating: true, tl: 12 })).perSquareYard).toBe(160000);
  });

  it("charges a repair swarm $250 per further kind of equipment", () => {
    expect(swarmCost(design({ type: "repair", extraModels: 2 })).perSquareYard).toBe(1000);
  });

  it("finds what the book doesn't allow", () => {
    expect(designProblems(design({ chassis: "dust" }))).toEqual(expect.arrayContaining(["chassisBots", "chassisType"]));
    expect(designProblems(design({ bots: "nanobot", chassis: "hopper", tl: 11 }))).toContain("chassisBots");
    expect(designProblems(design({ secondType: "terminator" }))).toContain("multiFunctionTl");
    expect(designProblems(design({ selfReplicating: true, tl: 12 }))).toEqual(expect.arrayContaining(["selfReplicatingType", "selfReplicatingPower"]));
    expect(designProblems(design())).toEqual([]);
  });

  it("takes the lowest Legality Class", () => {
    expect(swarmLegality(design({ type: "cleaning", power: "rtg" }))).toBe(1);
    expect(swarmLegality(design({ type: "cleaning" }))).toBe(4);
  });
});

describe("a swarm's statistics (Ultra-Tech pp. 36-37)", () => {
  it("follows the table by bot size and TL", () => {
    expect(swarmStatistics("microbot", "flier", 10)).toMatchObject({ st: 2, iq: 3, hp: 10, per: 10, speed: 5, move: { ground: 1, air: 6 } });
    expect(swarmStatistics("nanobot", "crawler", 12)).toMatchObject({ st: 1, iq: 4, hp: 20, per: 11 });
  });

  it("doubles an armoured crawler's hit points", () => {
    expect(swarmStatistics("microbot", "armoredCrawler", 10).hp).toBe(20);
  });

  it("runs 12, 72 or 120 hours on its own cells", () => {
    expect(cellEnduranceHours(10)).toBe(12);
    expect(cellEnduranceHours(12)).toBe(120);
    expect(swarmEnduranceHours("gastrobot", 10)).toBeNull();
  });
});

describe("fighting swarms (Ultra-Tech pp. 37, 164, 169)", () => {
  it("lets only sealed DR stop devourers, divided by 2", () => {
    const attack = SWARM_ATTACKS.devourer!;
    expect(swarmInjury({ attack, rolled: 5, squareYards: 1, victim: { ...person, dr: 20 } }).amount).toBe(5);
    expect(swarmInjury({ attack, rolled: 5, squareYards: 1, victim: { ...person, sealed: true, dr: 6 } }).amount).toBe(2);
  });

  it("keeps stingers out with Sealed, and with clothing for two seconds", () => {
    const attack = SWARM_ATTACKS.stinger!;
    expect(swarmInjury({ attack, rolled: 0, squareYards: 1, victim: { ...person, sealed: true } }).proof).toBe("sealed");
    expect(swarmInjury({ attack, rolled: 0, squareYards: 1, victim: person, covering: "clothing", secondsExposed: 1 }).proof).toBe("covered");
    expect(swarmInjury({ attack, rolled: 0, squareYards: 1, victim: person, covering: "clothing", secondsExposed: 2 }).amount).toBe(1);
  });

  it("doesn't slow terminators with clothing, and leaves machines alone", () => {
    const attack = SWARM_ATTACKS.terminator!;
    expect(swarmInjury({ attack, rolled: 0, squareYards: 1, victim: person, covering: "armor", secondsExposed: 0 }).amount).toBe(1);
    expect(swarmInjury({ attack, rolled: 0, squareYards: 1, victim: { ...person, living: false, machine: true } }).proof).toBe("notAffected");
  });

  it("has gremlins do a point per square yard to machinery", () => {
    const attack = SWARM_ATTACKS.gremlin!;
    expect(swarmInjury({ attack, rolled: 0, squareYards: 3, victim: { ...person, living: false, machine: true, dr: 10 } }).amount).toBe(3);
  });

  it("gives gremlin-infested machinery a malfunction number of 17, less 1 per 10% HP lost", () => {
    expect(gremlinMalfunction(0, 20)).toBe(17);
    expect(gremlinMalfunction(4, 20)).toBe(15);
    expect(gremlinMalfunction(3, 20)).toBe(16);
  });

  it("doubles a self-replicating swarm every hour", () => {
    expect(selfReplicatedSize(1, 3)).toBe(8);
  });
});
