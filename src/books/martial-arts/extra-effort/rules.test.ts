import { describe, expect, it } from "vitest";

import { flurryPenalty } from "./rules.js";
import { rapidStrikePenalty } from "../multiple-attacks/rules.js";

/** Extra effort in combat (GURPS Martial Arts p. 131). */
describe("Flurry of Blows", () => {
  it("takes a Weapon Master's four-attack Rapid Strike from -9 to -4", () => {
    expect(flurryPenalty(rapidStrikePenalty(4, true))).toBe(-4);
    expect(flurryPenalty(-6)).toBe(-3);
  });
});
