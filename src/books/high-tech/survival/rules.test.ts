import { describe, expect, it } from "vitest";

import { fallingVelocity } from "../../../../system/src/rules/falling.js";
import {
  DIFFERENT_SPECIALTY,
  NO_SHELTER,
  OTHER_KIND,
  SIMILAR_SPECIALTY,
  deathFromAboveLine,
  descentSeconds,
  driftYards,
  dueCrashes,
  finsMoveLine,
  fireBuildingLevel,
  foragingAttempt,
  jumpOutcome,
  kitMismatch,
  landingSpeed,
  pullHeight,
  ratedWeight,
  shelterLine,
  shelterModifier,
  specialtyList,
  survivalKitLine,
  survivalOf,
  waterFilterBonus,
} from "./rules.js";

describe("shelters (High-Tech pp. 56-57)", () => {
  it("takes the best gear, its quality added, or -5 with none", () => {
    expect(shelterLine([])).toEqual({ value: NO_SHELTER, gear: null });
    const blanket = { name: "Blanket", modifier: -2, quality: 0 };
    const tent = { name: "Tent, Dome", modifier: 2, quality: 0 };
    const fineBag = { name: "Sleeping Bag", modifier: 1, quality: 2 };
    expect(shelterLine([blanket]).value).toBe(-2);
    expect(shelterLine([blanket, tent]).gear).toBe(tent);
    expect(shelterLine([blanket, tent, fineBag])).toEqual({ value: 3, gear: fineBag });
  });

  it("gives the sleeping bag +1 at TL8 only", () => {
    expect(shelterModifier(0, 1, 5)).toBe(0);
    expect(shelterModifier(0, 1, 7)).toBe(0);
    expect(shelterModifier(0, 1, 8)).toBe(1);
    expect(shelterModifier(3, null, 8)).toBe(3);
  });
});

describe("fire starters (High-Tech p. 57)", () => {
  it("rolls Survival rebased from Per to DX, or DX-5", () => {
    expect(fireBuildingLevel(12, 10, 13)).toBe(15);
    expect(fireBuildingLevel(9, 12, 13)).toBe(10);
    expect(fireBuildingLevel(11, 10, null)).toBe(6);
  });
});

describe("survival kits (High-Tech p. 58)", () => {
  it("reads a Survival specialty and its kind", () => {
    expect(survivalOf("Survival (Arctic)")).toEqual({ kind: "land", specialty: "arctic" });
    expect(survivalOf("Survival (Open Ocean)")).toEqual({ kind: "water", specialty: "open ocean" });
    expect(survivalOf("Urban Survival")).toEqual({ kind: "urban", specialty: "urban" });
    expect(survivalOf("Survival")).toBeNull();
    expect(survivalOf("Naturalist")).toBeNull();
  });

  it("gives -3 across land and water or Urban Survival, -1 similar and -2 very different", () => {
    expect(kitMismatch("Survival (Jungle)", "Survival (Jungle)")).toBeNull();
    expect(kitMismatch("Survival (Jungle)", "Survival (Reef)")).toBe(OTHER_KIND);
    expect(kitMismatch("Urban Survival", "Survival (Woodlands)")).toBe(OTHER_KIND);
    expect(kitMismatch("Survival (Woodlands)", "Urban Survival")).toBe(OTHER_KIND);
    expect(kitMismatch("Survival (Arctic)", "Survival (Mountain)")).toBe(SIMILAR_SPECIALTY);
    expect(kitMismatch("Survival (Mountain)", "Survival (Arctic)")).toBe(SIMILAR_SPECIALTY);
    expect(kitMismatch("Survival (Desert)", "Survival (Jungle)")).toBe(DIFFERENT_SPECIALTY);
    expect(kitMismatch("Survival (Woodlands)", "Survival (Jungle)", specialtyList("Jungle, Swampland"))).toBe(SIMILAR_SPECIALTY);
  });

  it("takes the best carried kit, quality added", () => {
    const vest = { skills: ["Survival (Jungle)"], quality: 1, similar: [] };
    const covert = { skills: ["Survival (Woodlands)"], quality: 0, similar: ["swampland"] };
    expect(survivalKitLine([vest, covert], "Survival (Swampland)")).toBe(-1);
    expect(survivalKitLine([vest], "Survival (Open Ocean)")).toBe(-2);
    expect(survivalKitLine([vest], "Survival (Jungle)")).toBeNull();
    expect(survivalKitLine([], "Survival (Jungle)")).toBeNull();
  });
});

describe("water (High-Tech p. 59)", () => {
  it("gives a filter TL-2", () => {
    expect(waterFilterBonus(6)).toBe(4);
    expect(waterFilterBonus(8)).toBe(6);
    expect(waterFilterBonus(1)).toBe(0);
  });
});

describe("swim fins (High-Tech p. 60)", () => {
  it("takes Move on land to 2", () => {
    expect(finsMoveLine(5)).toBe(-3);
    expect(finsMoveLine(2)).toBe(0);
    expect(finsMoveLine(1)).toBe(0);
  });
});

describe("parachutes (High-Tech p. 61)", () => {
  const round = { maxLbs: 150, maxLbsTl7: 200, maxLbsTl8: 250, openingYards: 80, descent: 5 };

  it("rates the round chute by the TL it is made at", () => {
    expect(ratedWeight(round, 6)).toBe(150);
    expect(ratedWeight(round, 7)).toBe(200);
    expect(ratedWeight(round, 8)).toBe(250);
    expect(ratedWeight({ ...round, maxLbsTl7: 0, maxLbsTl8: 0 }, 8)).toBe(150);
  });

  it("adds a yard a second per full 50 lbs. over, and fails at 120%", () => {
    expect(landingSpeed(5, 150, 150)).toBe(5);
    expect(landingSpeed(5, 200, 239)).toBe(5);
    expect(landingSpeed(5, 200, 240)).toBeNull();
    expect(landingSpeed(5, 250, 299)).toBe(5);
    expect(landingSpeed(5, 250, 300)).toBeNull();
    expect(landingSpeed(5, 400, 460)).toBe(6);
    expect(landingSpeed(5, 0, 900)).toBe(5);
  });

  it("lands a jumper who hits first at half the fall's velocity", () => {
    expect(jumpOutcome(100, 80, fallingVelocity)).toEqual({ opens: true, velocity: 0 });
    // 17 yards is velocity 19 on the table (Campaigns p. 431): half, rounded, is 10.
    expect(jumpOutcome(17, 80, fallingVelocity)).toEqual({ opens: false, velocity: 10 });
    expect(jumpOutcome(30, 40, fallingVelocity).opens).toBe(false);
  });

  it("shoots at the lower of Parachuting and the weapon's skill (Death from Above)", () => {
    expect(deathFromAboveLine(14, 11)).toBe(-3);
    expect(deathFromAboveLine(12, 15)).toBe(0);
  });

  it("opens where pulled, or by the TL8 device at 1,000', or never", () => {
    expect(pullHeight(500, true, false)).toBe(500);
    expect(pullHeight(1000, false, true)).toBe(333);
    expect(pullHeight(200, false, true)).toBe(200);
    expect(pullHeight(1000, false, false)).toBe(0);
  });

  it("drifts with the wind for the time under the canopy", () => {
    expect(descentSeconds(580, 80, 5)).toBe(100);
    expect(descentSeconds(50, 80, 5)).toBe(0);
    expect(descentSeconds(500, 80, 0)).toBe(0);
    expect(driftYards(100, 10)).toBe(489);
    expect(driftYards(100, 0)).toBe(0);
  });
});

describe("foraging and snacks (High-Tech pp. 35, 55, 58)", () => {
  it("allows five foraging rolls a day", () => {
    expect(foragingAttempt(null, 3)).toBe(1);
    expect(foragingAttempt({ day: 3, rolls: 4 }, 3)).toBe(5);
    expect(foragingAttempt({ day: 3, rolls: 5 }, 3)).toBeNull();
    expect(foragingAttempt({ day: 2, rolls: 5 }, 3)).toBe(1);
  });

  it("splits the snack crashes due from those to come", () => {
    expect(dueCrashes([{ at: 10 }, { at: 30 }], 20)).toEqual({ due: [{ at: 10 }], later: [{ at: 30 }] });
  });
});
