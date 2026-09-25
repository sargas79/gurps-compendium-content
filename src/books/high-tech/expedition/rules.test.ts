import { describe, expect, it } from "vitest";

import {
  anchoredFall,
  beamWidth,
  blindedSeconds,
  breaksWhenDropped,
  burnLeft,
  burnOf,
  liftingClimb,
  retrieveDice,
  ropeLoad,
  sloshes,
  tl8BatteryFactor,
  drawsFromLbe,
  fittingRoll,
  grapnelLoad,
  grapnelRange,
  grapnelRoll,
  lanternSurvives,
  lbeBonus,
  litPenalty,
  mapModifier,
  marchMph,
  navSkillOf,
  navigationBonus,
  packPrice,
  qualityBonus,
  rappelPenalty,
  reaches,
  snowshoeMove,
  type Instrument,
} from "./rules.js";

describe("lights (High-Tech pp. 51-52)", () => {
  it("takes a darkness past 3 down to a lit spot's, keeping what the eyes took off", () => {
    expect(litPenalty(7, -7)).toBe(-3);
    expect(litPenalty(9, -9)).toBe(-3);
    // Night Vision 2 took two off before: it takes two off the -3 too.
    expect(litPenalty(7, -5)).toBe(-1);
    // Eyes that ignore darkness, and a darkness a light doesn't better.
    expect(litPenalty(7, 0)).toBe(0);
    expect(litPenalty(2, -2)).toBe(-2);
  });

  it("reaches within its radius, and within its beam where it is aimed", () => {
    const carbide = { kind: "lantern" as const, radius: 5, beam: 10 };
    expect(reaches(carbide, 5, false)).toBe(true);
    expect(reaches(carbide, 8, false)).toBe(false);
    expect(reaches(carbide, 8, true)).toBe(true);
    expect(reaches(carbide, 11, true)).toBe(false);
  });

  it("breaks a dropped fuel lantern on a roll over HT 6", () => {
    expect(breaksWhenDropped("glassLantern")).toBe(true);
    expect(breaksWhenDropped("kerosene")).toBe(true);
    expect(breaksWhenDropped("electric")).toBe(false);
    expect(lanternSurvives(6)).toBe(true);
    expect(lanternSurvives(7)).toBe(false);
  });

  it("blinds for 10 seconds per point of failure", () => {
    expect(blindedSeconds(-3)).toBe(30);
    expect(blindedSeconds(0)).toBe(10);
  });
});

describe("navigation instruments (High-Tech pp. 52-53)", () => {
  const i = (kind: Instrument["kind"], tl = 5, noSignal = false): Instrument => ({ kind, name: kind, tl, noSignal });

  it("reads the skills by specialty", () => {
    expect(navSkillOf("Navigation/TL8 (Land)")).toBe("land");
    expect(navSkillOf("Navigation (Sea)")).toBe("sea");
    expect(navSkillOf("Mathematics/TL5 (Surveying)")).toBe("surveying");
    expect(navSkillOf("Forward Observer/TL8")).toBe("forwardObserver");
    expect(navSkillOf("Navigation/TL10 (Space)")).toBeNull();
    expect(navSkillOf("Mathematics (Pure)")).toBeNull();
  });

  it("gives the best bonus, not their sum", () => {
    expect(navigationBonus("land", [i("compass"), i("gps", 8)])).toEqual({ value: 3, name: "gps" });
    expect(navigationBonus("land", [i("compass"), i("gps", 8, true)])).toEqual({ value: 1, name: "compass" });
    expect(navigationBonus("air", [i("surveying")])).toBeNull();
    expect(navigationBonus("surveying", [i("surveying")])?.value).toBe(2);
    expect(navigationBonus("forwardObserver", [i("compass")])).toBeNull();
  });

  it("gives navigating instruments +2 at TL5, +3 at TL6, and +3 with a chronometer", () => {
    expect(navigationBonus("sea", [i("instruments")])?.value).toBe(2);
    expect(navigationBonus("sea", [i("instruments", 6)])?.value).toBe(3);
    expect(navigationBonus("sea", [i("chronometer")])?.value).toBe(1);
    expect(navigationBonus("sea", [i("chronometer"), i("instruments")])).toEqual({ value: 3, name: "chronometer + instruments" });
    expect(navigationBonus("land", [i("chronometer")])).toBeNull();
  });

  it("is -10 without a map, an inaccurate map's penalty with one, and nothing at sea with chart books", () => {
    expect(mapModifier("land", [], [])).toBe(-10);
    expect(mapModifier("forwardObserver", [-3], [])).toBe(-3);
    expect(mapModifier("air", [-3, 0], [])).toBe(0);
    expect(mapModifier("sea", [], [i("instruments")])).toBe(0);
    expect(mapModifier("surveying", [], [])).toBeNull();
  });
});

describe("load-bearing gear (High-Tech pp. 53-55)", () => {
  it("adds its quality set up, -2 set up badly, nothing before", () => {
    expect(qualityBonus("fine")).toBe(2);
    expect(qualityBonus("best", 8)).toBe(4);
    expect(lbeBonus("ok", "good")).toBe(1);
    expect(lbeBonus("ok", "basic")).toBe(0);
    expect(lbeBonus("failed", "fine")).toBe(-2);
    expect(lbeBonus("", "fine")).toBeNull();
  });

  it("sets up with the better of Soldier and IQ-based Hiking", () => {
    expect(fittingRoll({ iq: 12, ht: 10, soldier: 11, hiking: 12 })).toEqual({ skill: "Hiking", level: 14 });
    expect(fittingRoll({ iq: 10, ht: 12, soldier: 13, hiking: 13 })).toEqual({ skill: "Soldier", level: 13 });
    expect(fittingRoll({ iq: 10, ht: 10, soldier: null, hiking: null })).toEqual({ skill: "Soldier", level: 5 });
  });

  it("helps Fast-Draw from pouches, not from a holster or scabbard", () => {
    expect(drawsFromLbe("Fast-Draw (Ammo)")).toBe(true);
    expect(drawsFromLbe("Fast-Draw (Knife)")).toBe(true);
    expect(drawsFromLbe("Fast-Draw (Pistol)")).toBe(false);
    expect(drawsFromLbe("Fast-Draw (Long Arm)")).toBe(false);
    expect(drawsFromLbe("Guns (Pistol)")).toBe(false);
  });

  it("halves a TL8 pack's weight and doubles a TL8 backpack's cost", () => {
    expect(packPrice("backpack", 8)).toEqual({ cost: 2, weight: 0.5 });
    expect(packPrice("bag", 8)).toEqual({ cost: 1, weight: 0.5 });
    expect(packPrice("backpack", 7)).toBeNull();
    expect(packPrice("lbe", 8)).toBeNull();
  });

  it("marches at Move/2 mph", () => {
    expect(marchMph(5)).toBe(2.5);
  });
});

describe("climbing gear (High-Tech pp. 55-56)", () => {
  it("falls twice the distance past the last fastener", () => {
    expect(anchoredFall(3)).toBe(6);
  });

  it("shoots at -4 rappelling, -2 with Sure-Footed", () => {
    expect(rappelPenalty(false)).toBe(-4);
    expect(rappelPenalty(true)).toBe(-2);
  });

  it("throws a grapnel at DX-3 or Throwing, to ST x 2 yards, holding 300 lbs. (600 at TL7)", () => {
    expect(grapnelRoll(12, null)).toEqual({ skill: "DX", level: 9 });
    expect(grapnelRoll(12, 13)).toEqual({ skill: "Throwing", level: 13 });
    expect(grapnelRange(11)).toBe(22);
    expect(grapnelLoad(5)).toBe(300);
    expect(grapnelLoad(7)).toBe(600);
  });

  it("costs snowshoes 1 Move, but not TL8 ones", () => {
    expect(snowshoeMove(5)).toBe(-1);
    expect(snowshoeMove(8)).toBe(0);
  });

  it("reads rope loads, the lifting device's climbs and the avalanche beacon (pp. 55-56)", () => {
    expect(ropeLoad("Rope, 1/2\", Hemp (10 yards)")).toBe(300);
    expect(ropeLoad("Rope, 1/2\", Synthetic (10 yards)")).toBe(4000);
    expect(ropeLoad("Cord, Synthetic (100 yards)")).toBe(55);
    expect(ropeLoad("Detonating Cord (per pound)")).toBeNull();
    expect(liftingClimb(100, 250)).toEqual({ seconds: 34, lifts: true });
    expect(liftingClimb(10, 301).lifts).toBe(false);
  });
});

describe("burning times and the rest of the expedition gear (pp. 51-54)", () => {
  it("knows each light's fill, and what is left of it", () => {
    expect(burnOf("Kerosene Lantern", 6)).toEqual({ seconds: 12 * 3600, fuel: "pint" });
    expect(burnOf("Wax Candles (per ounce)", 1)).toEqual({ seconds: 8 * 3600, fuel: "ounce" });
    expect(burnOf("Survival Flashlight", 6)).toEqual({ seconds: 180, fuel: "wind" });
    expect(burnOf("Survival Flashlight", 8)).toEqual({ seconds: 360, fuel: "wind" });
    expect(burnOf("Flashlight", 6)).toBeNull();
    const pint = burnOf("Glass Lantern", 5)!;
    expect(burnLeft(pint, 3600, 100, 100 + 3600)).toBe(8 * 3600);
    expect(burnLeft(pint, 3600, null, 99999)).toBe(9 * 3600);
    expect(burnLeft(pint, 0, 0, 11 * 3600)).toBe(0);
  });

  it("gives TL8 flashlights ten times the batteries, and beams a cone no narrower than 2 yards", () => {
    expect(tl8BatteryFactor("Mini-Flashlight", 8)).toBe(10);
    expect(tl8BatteryFactor("Mini-Flashlight", 7)).toBeNull();
    expect(tl8BatteryFactor("Floodlight", 8)).toBeNull();
    expect(beamWidth(5)).toBe(2);
    expect(beamWidth(100)).toBe(20);
  });

  it("slows a pack's retrieval, and tells the canteens that slosh", () => {
    expect(retrieveDice("backpack")).toBe(2);
    expect(retrieveDice("bag")).toBe(1);
    expect(sloshes("Canteen")).toBe(true);
    expect(sloshes("Water Pack")).toBe(false);
  });
});
