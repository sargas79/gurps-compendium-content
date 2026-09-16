import { describe, expect, it } from "vitest";

import { protectionWorn } from "./rules.js";
import {
  battlesuitLevel,
  carryWeightless,
  checkoutSeconds,
  gravpackPenalty,
  isGravpack,
  limitedLevel,
  poweredSuit,
  suitEffects,
  suitLimitsDx,
  suitWeightCounts,
  unfittedPenalty,
} from "./suits.js";

const on = { powered: true, augmentation: true, fitted: true };

describe("powered suits (Ultra-Tech pp. 181-186)", () => {
  it("knows the suits by name, a cybersuit by its TL", () => {
    expect(poweredSuit("Heavy Battlesuit", 10)).toMatchObject({ liftingSt: 20, strikingSt: 20, basicMove: 2, superJump: 1 });
    expect(poweredSuit("Cybersuit", 11)).toMatchObject({ liftingSt: 5, switchable: true });
    expect(poweredSuit("Cybersuit", 12)).toMatchObject({ liftingSt: 8 });
    expect(poweredSuit("Marine Combat Walker", 9)).toMatchObject({ basicMove: 1, paralysedUnpowered: true });
    expect(poweredSuit("Heavy Battlesuit Helmet", 10)).toBeNull();
    expect(poweredSuit("Reflex Vest", 9)).toBeNull();
  });

  it("adds nothing without power, or with a cybersuit's augmentation off", () => {
    const ranger = poweredSuit("Ranger Exoskeleton", 10)!;
    expect(suitEffects(ranger, on)).toMatchObject({ liftingSt: 12, strikingSt: 12, superJump: 2 });
    expect(suitEffects(ranger, { ...on, powered: false })).toBeNull();
    const cyber = poweredSuit("Military Cybersuit", 11)!;
    expect(suitEffects(cyber, { ...on, augmentation: false })).toBeNull();
    expect(suitEffects(poweredSuit("Nanosuit", 12)!, on)).toMatchObject({ enhancedMove: 1 });
    expect(suitEffects(poweredSuit("Power Sleeve", 9)!, on)).toMatchObject({ armSt: 6, liftingSt: 0 });
  });

  it("carries its own weight while powered, a cybersuit even with augmentation off, an exofield belt never", () => {
    const light = poweredSuit("Light Exoskeleton", 9)!;
    expect(suitWeightCounts(light, on)).toBe(false);
    expect(suitWeightCounts(light, { ...on, powered: false })).toBe(true);
    expect(suitWeightCounts(poweredSuit("Cybersuit", 11)!, { ...on, augmentation: false })).toBe(false);
    expect(suitWeightCounts(poweredSuit("Exofield Belt", 12)!, on)).toBe(true);
    expect(suitWeightCounts(poweredSuit("Lower Body Exoskeleton", 9)!, on)).toBe(true);
  });

  it("limits DX by Battlesuit skill for a full suit, not a sleeve or a cybersuit with its augmentation off", () => {
    expect(suitLimitsDx(poweredSuit("Powered Combat Armor", 9)!, on)).toBe(true);
    expect(suitLimitsDx(poweredSuit("Power Sleeve", 9)!, on)).toBe(false);
    expect(suitLimitsDx(poweredSuit("Cybersuit", 11)!, { ...on, augmentation: false })).toBe(false);
    expect(suitLimitsDx(poweredSuit("Exofield Belt", 12)!, { ...on, powered: false })).toBe(false);
  });

  it("reads Battlesuit skill from the skill, the other suit skills at -2, or DX-5", () => {
    expect(battlesuitLevel({ battlesuit: 13, vaccSuit: null, nbcSuit: null, dx: 12 })).toBe(13);
    expect(battlesuitLevel({ battlesuit: null, vaccSuit: 14, nbcSuit: null, dx: 12 })).toBe(12);
    expect(battlesuitLevel({ battlesuit: null, vaccSuit: null, nbcSuit: null, dx: 12 })).toBe(7);
    expect(battlesuitLevel({ battlesuit: 11, vaccSuit: null, nbcSuit: null, dx: 12 }, 2)).toBe(13);
  });

  it("holds a DX-based skill to the suit skill, less an unfitted TL9-10 suit's penalty", () => {
    // DX 14, Stealth-15 and Vacc Suit-13 function at Stealth-13 (Characters p. 192).
    expect(limitedLevel(15, 13, 0)).toBe(13);
    expect(limitedLevel(11, 13, -1)).toBe(10);
    const pca = poweredSuit("Powered Combat Armor", 9)!;
    expect(unfittedPenalty(pca, 9, false)).toBe(-1);
    expect(unfittedPenalty(pca, 11, false)).toBe(0);
    expect(unfittedPenalty(poweredSuit("Combat Walker", 9)!, 9, false)).toBe(0);
  });

  it("halves the checkout on a Battlesuit roll, the HEX suit's minute too", () => {
    expect(checkoutSeconds(poweredSuit("Commando Battlesuit", 10)!, true)).toBe(15);
    expect(checkoutSeconds(poweredSuit("HEX Suit", 10)!, false)).toBe(60);
  });

  it("seals a battlesuit with its own helmet on", () => {
    expect(protectionWorn("Heavy Battlesuit", [])).toBeNull();
    expect(protectionWorn("Heavy Battlesuit", ["Heavy Battlesuit Helmet"])).toMatchObject({ sealed: true, vacuumSupport: true, radiationPf: 5, pressureAtm: 10, air: true });
    expect(protectionWorn("Nanosuit", [])).toMatchObject({ sealed: true, pressureAtm: 10 });
    expect(protectionWorn("Nanosuit", [])?.air).toBeUndefined();
  });
});

describe("the gravpack (p. 75)", () => {
  it("penalises DX a point per 40 lbs. until the wearer is used to it", () => {
    expect(isGravpack("Gravpack")).toBe(true);
    expect(gravpackPenalty(39, false)).toBe(-0);
    expect(gravpackPenalty(90, false)).toBe(-2);
    expect(gravpackPenalty(500, false)).toBe(-3);
    expect(gravpackPenalty(90, true)).toBe(0);
  });

  it("takes the load off the heaviest gear first", () => {
    expect(carryWeightless([10, 50, 30], 60)).toEqual([10, 0, 20]);
    expect(carryWeightless([5, 5], 100)).toEqual([0, 0]);
  });
});
