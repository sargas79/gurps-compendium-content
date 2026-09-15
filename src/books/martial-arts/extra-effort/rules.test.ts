import { describe, expect, it } from "vitest";

import { effortKind, effortManeuvers, effortRefusal, flurryPenalty } from "./rules.js";
import { rapidStrikePenalty } from "../multiple-attacks/rules.js";

/** Extra effort in combat (GURPS Martial Arts p. 131). */
describe("the limit", () => {
  it("allows one offensive and one defensive option a turn, the same one again", () => {
    expect(effortRefusal("mightyBlows", { offense: "giantStep", defense: null })).toBe("oneOffense");
    expect(effortRefusal("giantStep", { offense: "giantStep", defense: null })).toBeNull();
    expect(effortRefusal("rapidRecovery", { offense: "giantStep", defense: null })).toBeNull();
    expect(effortRefusal("feverishDefense", { offense: null, defense: "rapidRecovery" })).toBe("oneDefense");
    expect(effortKind("feverishDefense")).toBe("defense");
  });

  it("puts each option on its maneuvers", () => {
    expect(effortManeuvers("giantStep", "m.def", "m.com")).toEqual(["attack", "m.def"]);
    expect(effortManeuvers("greatLunge", "m.def", "m.com")).toEqual(["attack", "m.com", "moveAndAttack"]);
    expect(effortManeuvers("heroicCharge", "m.def", "m.com")).toEqual(["moveAndAttack"]);
    expect(effortManeuvers("mightyBlows", "m.def", "m.com")).toEqual(["attack"]);
  });
});

describe("Flurry of Blows", () => {
  it("takes a Weapon Master's four-attack Rapid Strike from -9 to -4", () => {
    expect(flurryPenalty(rapidStrikePenalty(4, true))).toBe(-4);
    expect(flurryPenalty(-6)).toBe(-3);
  });
});
