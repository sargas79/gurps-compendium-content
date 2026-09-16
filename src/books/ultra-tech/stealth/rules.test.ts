import { describe, expect, it } from "vitest";

import {
  camouflageResetSeconds,
  chameleonBonus,
  invisibilityBonus,
  invisibilityCovers,
  jammerPenalties,
  jammerScale,
  shapeMemoryCell,
  shapeMemoryCost,
  shapeMemoryLegality,
  signaturePenalty,
  spoofFools,
  stealthKindByName,
  AUTOGRAPNEL,
  autograpnelSpeed,
  exophaseAllows,
  forgeryRoll,
  forgeryToolByName,
  geckoLimbs,
  isGravitic,
  CHAMELEON_SUIT,
  CHAMELEON,
} from "./rules.js";

describe("chameleon surfaces (Ultra-Tech pp. 98-99)", () => {
  it("gives each sense its bonus, halved when moving", () => {
    expect(chameleonBonus("thermoOptic", "vision", { moving: false, form: "surface" })).toBe(4);
    expect(chameleonBonus("thermoOptic", "extendedHyperspectral", { moving: true, form: "surface" })).toBe(0);
    expect(chameleonBonus("multispectral", "infrared", { moving: true, form: "surface" })).toBe(4);
  });

  it("doesn't halve a dynamic surface, but halves a cloak again", () => {
    expect(chameleonBonus("dynamicMultispectral", "vision", { moving: true, form: "surface" })).toBe(8);
    expect(chameleonBonus("dynamicMultispectral", "vision", { moving: true, form: "cloak" })).toBe(4);
    expect(chameleonBonus("multispectral", "hyperspectral", { moving: true, form: "cloak" })).toBe(1);
  });
});

describe("invisibility (Ultra-Tech p. 100)", () => {
  it("fools more senses at each TL", () => {
    expect(invisibilityCovers(10, "infrared")).toBe(true);
    expect(invisibilityCovers(10, "ultraviolet")).toBe(false);
    expect(invisibilityCovers(11, "hyperspectral")).toBe(true);
    expect(invisibilityCovers(11, "extendedHyperspectral")).toBe(false);
  });

  it("gives +9, +3 silhouetted, and a cloak +3 when moving", () => {
    expect(invisibilityBonus(10, "vision", { moving: true, silhouetted: false, form: "surface" })).toBe(9);
    expect(invisibilityBonus(10, "vision", { moving: false, silhouetted: true, form: "surface" })).toBe(3);
    expect(invisibilityBonus(10, "vision", { moving: true, silhouetted: false, form: "cloak" })).toBe(3);
    expect(invisibilityBonus(10, "ultraviolet", { moving: false, silhouetted: false, form: "surface" })).toBe(0);
  });
});

describe("signatures and jammers (Ultra-Tech pp. 99-100)", () => {
  it("takes -4 at TL9 to -10 at TL12 off infrared or radar detection", () => {
    expect(signaturePenalty(9)).toBe(-4);
    expect(signaturePenalty(12)).toBe(-10);
  });

  it("adds -2 per TL after a jammer's own", () => {
    expect(jammerPenalties("radarJammer", 9)).toEqual({ radar: -4, imagingRadar: -2 });
    expect(jammerPenalties("distortionField", 12)).toEqual({ active: -10 });
  });

  it("fools an operator who doesn't beat half the penalty", () => {
    expect(spoofFools(2, true, -4)).toBe(true);
    expect(spoofFools(3, true, -4)).toBe(false);
    expect(spoofFools(5, false, -4)).toBe(true);
  });

  it("scales a vehicle's jammer by its longest dimension squared", () => {
    expect(jammerScale(5)).toBe(25);
  });
});

describe("camouflage and disguises (Ultra-Tech p. 97, 99)", () => {
  it("resets programmable camouflage faster at higher TLs", () => {
    expect(camouflageResetSeconds(9)).toBe(4);
    expect(camouflageResetSeconds(12)).toBe(1);
  });

  it("prices shape-memory disguises and halves their LC", () => {
    expect(shapeMemoryCost("single", 500)).toBe(2500);
    expect(shapeMemoryCost("multi", 500, 100)).toBe(12000);
    expect(shapeMemoryLegality(3)).toBe(2);
    expect(shapeMemoryLegality(1)).toBe(1);
    expect(shapeMemoryCell(0.5)).toBe("A");
    expect(shapeMemoryCell(5)).toBe("B");
  });

  it("reads the systems from the records' names", () => {
    expect(stealthKindByName("Invisibility Cloak")).toEqual({ kind: "invisibility", form: "cloak" });
    expect(stealthKindByName("Dynamic Multispectral Chameleon Surface")?.kind).toBe("dynamicMultispectral");
    expect(stealthKindByName("Gecko Gear")).toBeNull();
  });
});

describe("covert gear with numbers (#299, pp. 96-97)", () => {
  it("winds an autograpnel faster at higher TLs", () => {
    expect(AUTOGRAPNEL.range).toBe(30);
    expect([10, 11, 12].map(autograpnelSpeed)).toEqual([5, 7, 10]);
  });

  it("holds 50 lbs. a limb on gecko gear, crawling at three limbs", () => {
    expect(geckoLimbs(40)).toEqual({ limbs: 1, crawling: false, tooHeavy: false });
    expect(geckoLimbs(150)).toEqual({ limbs: 3, crawling: true, tooHeavy: false });
    expect(geckoLimbs(210).tooHeavy).toBe(true);
  });

  it("lets only gravitic attacks reach someone in exophase", () => {
    expect(exophaseAllows(false, true, false)).toBe(false);
    expect(exophaseAllows(false, true, true)).toBe(true);
    expect(exophaseAllows(true, false, false)).toBe(false);
    expect(exophaseAllows(true, true, false)).toBe(true);
    expect(isGravitic("Graviton Beamer")).toBe(true);
    expect(isGravitic("Grav Hammer")).toBe(true);
    expect(isGravitic("Laser Rifle")).toBe(false);
  });

  it("forges with a doc-fab, a programmable wallet and HoloPaper", () => {
    expect(forgeryToolByName("Desktop Doc-Fab")).toBe("docFab");
    expect(forgeryToolByName("HoloPaper")).toBe("holoPaper");
    expect(forgeryRoll("docFab", 9, 9, 2)).toEqual({ ownSkill: null, bonus: 2, fails: false });
    expect(forgeryRoll("docFab", 10, 8, 1)).toEqual({ ownSkill: null, bonus: 5, fails: false });
    expect(forgeryRoll("wallet", 11, 11)).toEqual({ ownSkill: 15, bonus: -5, fails: false });
    expect(forgeryRoll("wallet", 11, 8)).toEqual({ ownSkill: 15, bonus: 0, fails: false });
    expect(forgeryRoll("holoPaper", 11, 11).fails).toBe(true);
    expect(forgeryRoll("holoPaper", 11, 9).fails).toBe(false);
  });
});

describe("chameleon systems on a swarm (#299)", () => {
  it("prices a surface as a suit (pp. 98-99)", () => {
    expect(CHAMELEON_SUIT.thermoOptic).toEqual({ cost: 4000, weight: 4 });
    expect(Object.keys(CHAMELEON_SUIT)).toEqual(Object.keys(CHAMELEON));
  });
});
