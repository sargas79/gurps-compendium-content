import { describe, expect, it } from "vitest";

import {
  airLeft,
  airTankMinutes,
  airTankSize,
  airUsedBreathing,
  breathesPureOxygen,
  breathingProtection,
  hasBiomedicalSensors,
  hotSuitFp,
  isAirMask,
  isTankFed,
  mufflesSpeech,
  pressureAtDepth,
  supplyMinutes,
} from "./rules.js";

describe("masks and diving gear (High-Tech pp. 72-74, 76)", () => {
  it("makes a gas mask Filter Lungs, with Tunnel Vision at TL5 and No Peripheral Vision after", () => {
    expect(breathingProtection("Gas Mask (TL 5)", 5, [])).toEqual({ filter: true, noSmellTaste: true, restrictedVision: "tunnel" });
    expect(breathingProtection("Gas Mask (TL 8)", 8, [])).toEqual({ filter: true, noSmellTaste: true, restrictedVision: "noPeripheral" });
  });

  it("leaves a tank-fed mask's air to its tank, and gives hard-hat dress its own", () => {
    expect(breathingProtection("SCBA Mask (TL 7)", 7, [])).toEqual({ noSmellTaste: true, restrictedVision: "noPeripheral" });
    expect(isTankFed("Scuba Mask (TL 8)")).toBe(true);
    expect(isTankFed("FFM (TL 7)")).toBe(true);
    expect(isTankFed("Gas Mask (TL 7)")).toBe(false);
    expect(breathingProtection("Hard-Hat Suit", 8, [])).toEqual({ air: true, noSmellTaste: true, restrictedVision: "tunnel" });
  });

  it("muffles speech through a mask up to TL7", () => {
    expect(mufflesSpeech("Gas Mask (TL 7)", 7)).toBe(true);
    expect(mufflesSpeech("SCBA Mask (TL 8)", 8)).toBe(false);
    expect(mufflesSpeech("Early Rebreather", 7)).toBe(false);
  });

  it("holds air by tank size and TL, held to TL6-8", () => {
    expect(airTankSize("Air Tank, Small")).toBe("small");
    expect(airTankSize("Air Tank (Medium)")).toBeNull();
    expect(airTankMinutes("small", 6)).toBe(12);
    expect(airTankMinutes("medium", 7)).toBe(45);
    expect(airTankMinutes("large", 8)).toBe(180);
    expect(airTankMinutes("large", 10)).toBe(180);
    expect(supplyMinutes("Early Rebreather", 7)).toBe(90);
    expect(supplyMinutes("Advanced Rebreather", 8)).toBe(240);
    expect(supplyMinutes("Space Suit, EVA", 7)).toBe(420);
    expect(supplyMinutes("Scuba Gear", 8)).toBe(90);
    expect(supplyMinutes("Gas Mask (TL 8)", 8)).toBeNull();
  });

  it("divides the air by the pressure of the depth, after what has been used", () => {
    expect(pressureAtDepth(0)).toBe(1);
    expect(pressureAtDepth(33)).toBe(2);
    expect(pressureAtDepth(66)).toBe(3);
    expect(airLeft(45, 0, 33)).toBe(22.5);
    expect(airLeft(45, 5, 0)).toBe(40);
    expect(airLeft(45, 50, 0)).toBe(0);
    // Ten minutes at 33' use twenty of the textbook duration.
    expect(airUsedBreathing(10, 33)).toBe(20);
  });

  it("warns of pure oxygen in the shallow-water rebreathers only", () => {
    expect(breathesPureOxygen("Rebreather")).toBe(true);
    expect(breathesPureOxygen("Advanced Rebreather")).toBe(false);
  });
});

describe("environment suits (High-Tech pp. 74-76)", () => {
  it("seals a biohazard or NBC suit only with an air mask under it", () => {
    expect(breathingProtection("Biohazard Suit", 7, [])).toBeNull();
    expect(breathingProtection("Biohazard Suit", 7, ["Gas Mask (TL 7)"])).toEqual({ sealed: true });
    expect(breathingProtection("NBC Suit", 7, ["SCBA Mask (TL 8)"])).toEqual({ sealed: true });
    expect(breathingProtection("Biohazard Suit (TL8)", 8, [])).toEqual({ radiationPf: 2.5 });
    expect(isAirMask("Advanced Rebreather")).toBe(false);
  });

  it("seals the Apollo suits with their own helmets, and gives the EVA suit climate control", () => {
    expect(breathingProtection("Space Suit", 7, ["Space Suit, EVA Space Helmet"])).toBeNull();
    expect(breathingProtection("Space Suit", 7, ["Space Suit Space Helmet"])).toEqual({ sealed: true, vacuumSupport: true, smell: true });
    expect(breathingProtection("Space Suit, EVA", 7, [])).toEqual({ comfort: { coldF: 60, heatF: 60 } });
    expect(breathingProtection("Space Suit Space Helmet", 7, [])).toEqual({ filter: true, hearing: true, smell: true, glare: true, restrictedVision: "noPeripheral" });
  });

  it("answers to its own switch", () => {
    expect(breathingProtection("Gas Mask (TL 8)", 8, [], (rule) => rule === "suits")).toBeNull();
    expect(breathingProtection("NBC Suit", 7, ["Gas Mask (TL 8)"], (rule) => rule === "breathing")).toBeNull();
  });

  it("triples a biohazard suit's FP, and finds biomedical sensors", () => {
    expect(hotSuitFp(2)).toBe(6);
    expect(hasBiomedicalSensors("Biomedical Sensors")).toBe(true);
    expect(hasBiomedicalSensors("Space Suit, EVA")).toBe(true);
    expect(hasBiomedicalSensors("NBC Suit")).toBe(false);
  });
});
