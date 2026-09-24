import { describe, expect, it } from "vitest";

import { jammingReach, varietyPenalty, wonContest } from "./rules.js";

describe("a jammer's reach (High-Tech p. 212)", () => {
  it("is a Quick Contest within its range, an unopposed roll within the shadow, and nothing beyond", () => {
    expect(jammingReach(0, 50, 10)).toBe("contest");
    expect(jammingReach(50, 50, 10)).toBe("contest");
    expect(jammingReach(51, 50, 10)).toBe("roll");
    expect(jammingReach(500, 50, 10)).toBe("roll");
    expect(jammingReach(501, 50, 10)).toBe("clear");
  });

  it("reaches nothing without a range or a distance", () => {
    expect(jammingReach(10, 0, 10)).toBe("clear");
    expect(jammingReach(Number.NaN, 50, 10)).toBe("clear");
    expect(jammingReach(-1, 50, 10)).toBe("clear");
  });

  it("reads the first side's win", () => {
    expect(wonContest("first")).toBe(true);
    expect(wonContest("second")).toBe(false);
    expect(wonContest("tie")).toBe(false);
  });
});

describe("a jammer variety's penalty (HT:EE p. 49)", () => {
  it("takes the figure within range, the other out to the shadow, and none beyond", () => {
    const penalty = { within: -4, shadow: -2 };
    expect(varietyPenalty("contest", penalty)).toBe(-4);
    expect(varietyPenalty("roll", penalty)).toBe(-2);
    expect(varietyPenalty("clear", penalty)).toBe(0);
  });
});
