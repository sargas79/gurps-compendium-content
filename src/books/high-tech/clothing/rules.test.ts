import { describe, expect, it } from "vitest";

import {
  betterClass,
  coolingCharge,
  coolingUntil,
  exposedLocations,
  frostbiteInjury,
  furCovers,
  hikingWithoutHeat,
  missingPiecesPenalty,
  outfitOf,
  outfitWeightFactor,
  piecesOf,
  stillMissing,
  wornClass,
} from "./rules.js";

describe("outfits against the cold (High-Tech p. 63)", () => {
  it("grades the book's outfits as Cold does", () => {
    for (const name of ["Summer Clothes", "Ordinary Clothes", "Formal Wear", "High-Fashion Attire"]) expect(outfitOf(name)?.clothing, name).toBe("light");
    expect(outfitOf("Winter Clothes")).toMatchObject({ clothing: "winter", pieces: true, weightRow: "other", weighed: true });
    expect(outfitOf("Arctic Clothes (TL8)")).toMatchObject({ clothing: "arctic", pieces: true, weightRow: "arctic" });
    expect(outfitOf("Wicking Undergarment")).toBeNull();
  });

  it("takes an outfit made on another's pattern as those clothes, keeping its own weight", () => {
    expect(outfitOf("Undercover Clothing (Ordinary Clothes, +1)")).toMatchObject({ clothing: "light", weighed: false });
    expect(outfitOf("Simple Camouflage (Winter Clothes)")).toMatchObject({ clothing: "winter", pieces: true, weighed: false });
  });

  it("lets arctic clothes with layers off count as winter or ordinary clothes, never another outfit more", () => {
    const arctic = outfitOf("Arctic Clothes")!;
    expect(wornClass(arctic, "")).toBe("arctic");
    expect(wornClass(arctic, "winter")).toBe("winter");
    expect(wornClass(arctic, "light")).toBe("light");
    expect(wornClass(outfitOf("Winter Clothes")!, "light")).toBe("winter");
  });

  it("ranks the classes", () => {
    expect(betterClass("light", "arctic")).toBe("arctic");
    expect(betterClass("heatedSuit", "winter")).toBe("heatedSuit");
    expect(betterClass(null, "light")).toBe("light");
  });

  it("is -1 a piece left off", () => {
    expect(missingPiecesPenalty([])).toBe(0);
    expect(missingPiecesPenalty(["gloves", "hat"])).toBe(-2);
  });
});

describe("frostbite (High-Tech p. 63)", () => {
  it("reaches what the clothing leaves bare", () => {
    expect(exposedLocations("light", [])).toEqual(["foot", "hand", "skull", "neck", "face"]);
    expect(exposedLocations("arctic", [])).toEqual([]);
    expect(exposedLocations("winter", ["gloves", "scarf"])).toEqual(["hand", "neck", "face"]);
    expect(exposedLocations("heatedSuit", ["gloves"])).toEqual([]);
  });

  it("is a point per FP lost", () => {
    expect(frostbiteInjury(2)).toBe(2);
    expect(frostbiteInjury(0)).toBe(0);
  });
});

describe("fur (High-Tech p. 64)", () => {
  it("covers the body but the face, eyes and what is left off", () => {
    expect(furCovers("torso", [])).toBe(true);
    expect(furCovers("face", [])).toBe(false);
    expect(furCovers("hand", ["gloves"])).toBe(false);
    expect(furCovers("skull", ["gloves"])).toBe(true);
  });
});

describe("the Clothing Technology Table (High-Tech p. 65)", () => {
  it("multiplies the TL7 weight", () => {
    expect(outfitWeightFactor("other", 5)).toBe(2);
    expect(outfitWeightFactor("other", 6)).toBe(2);
    expect(outfitWeightFactor("arctic", 6)).toBe(1.25);
    expect(outfitWeightFactor("arctic", 8)).toBe(0.5);
    expect(outfitWeightFactor("other", 7)).toBe(1);
    expect(outfitWeightFactor("other", 4)).toBeNull();
  });
});

describe("climate control and a hot march (High-Tech p. 74)", () => {
  it("takes off the hot weather's point an hour", () => {
    expect(hikingWithoutHeat(12, 4)).toBe(8);
    expect(hikingWithoutHeat(2, 4)).toBe(0);
  });

  it("runs a cooling vest's charge four hours, after a quarter hour's soak (p. 74)", () => {
    expect(coolingUntil(100, false)).toBe(100 + 14400);
    expect(coolingUntil(100, true)).toBe(100 + 900 + 14400);
    expect(coolingCharge(null, 0)).toEqual({ state: "fresh", seconds: 14400 });
    expect(coolingCharge(100 + 900 + 14400, 100)).toEqual({ state: "soaking", seconds: 900 });
    expect(coolingCharge(14400, 3600)).toEqual({ state: "charged", seconds: 10800 });
    expect(coolingCharge(14400, 14400)).toEqual({ state: "spent", seconds: 0 });
  });
});

describe("outfit pieces worn apart (p. 63)", () => {
  it("reads boots, gloves, a warm hat and a scarf by name", () => {
    expect(piecesOf("Boots, Arctic (TL7)")).toEqual(["boots"]);
    expect(piecesOf("Hockey Glove")).toEqual(["gloves"]);
    expect(piecesOf("Electrical Gloves (Standard)")).toEqual(["gloves"]);
    expect(piecesOf("Hat, Cloth")).toEqual(["hat"]);
    expect(piecesOf("Balaclava")).toEqual(["hat", "scarf"]);
    expect(piecesOf("Hard Hat (TL8)")).toEqual([]);
    expect(piecesOf("Sedgley Glove Pistol MK 2, .38 S&W")).toEqual([]);
    expect(stillMissing(["boots", "gloves"], ["boots"])).toEqual(["gloves"]);
  });
});
