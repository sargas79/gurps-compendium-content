import { describe, expect, it } from "vitest";

import {
  EOD,
  JAMMER_VARIETY_PENALTIES,
  bugOf,
  contactMikePenalty,
  homemadeBugPenalty,
  jammableByName,
  jammerByName,
  isSpectrumAnalyzer,
  negatesUndercoverClothing,
  qualityBonus,
  rebased,
  screenerOf,
  screeningBonus,
  spikeMikeLevels,
  supplementJammerByName,
  sweepMinutes,
  type ScreeningSearch,
} from "./rules.js";

const search = (more: Partial<ScreeningSearch> = {}): ScreeningSearch => ({ skill: "Search", metallic: true, explosive: false, patDown: false, sensitivity: 1, tl: 7, ...more });

describe("screening gear (High-Tech pp. 206-207, 217)", () => {
  it("knows the records", () => {
    expect(screenerOf("Handheld Metal Detector (TL8)")).toEqual({ kind: "handheldMetal", operatorRoll: true });
    expect(screenerOf("Walkthrough Metal Detector (TL7)")?.kind).toBe("walkthroughMetal");
    expect(screenerOf("Hold Baggage Screener")?.kind).toBe("baggage");
    expect(screenerOf("CT Scanner")?.kind).toBe("ct");
    expect(screenerOf("Portable X-Ray Machine (TL8)")).toEqual({ kind: "portableXray", operatorRoll: false });
    expect(screenerOf("Flashlight")).toBeNull();
  });

  it("gives a handheld metal detector +1 to find metal, +2 to Search with a pat-down", () => {
    expect(screeningBonus("handheldMetal", search())).toBe(1);
    expect(screeningBonus("handheldMetal", search({ patDown: true }))).toBe(2);
    expect(screeningBonus("handheldMetal", search({ skill: "Traps", patDown: true }))).toBe(1);
    expect(screeningBonus("handheldMetal", search({ skill: EOD }))).toBe(1);
    expect(screeningBonus("handheldMetal", search({ metallic: false }))).toBe(0);
  });

  it("gives a walkthrough detector +1 to +3 as set", () => {
    expect(screeningBonus("walkthroughMetal", search({ sensitivity: 3 }))).toBe(3);
    expect(screeningBonus("walkthroughMetal", search({ sensitivity: 9 }))).toBe(3);
    expect(screeningBonus("walkthroughMetal", search({ sensitivity: 0 }))).toBe(1);
  });

  it("gives X-ray screeners +3, +1 more at TL8 for metal or explosives; CT +4, +6 for explosives; the EOD X-ray +5 and +4", () => {
    expect(screeningBonus("baggage", search({ metallic: false }))).toBe(3);
    expect(screeningBonus("baggage", search({ tl: 8 }))).toBe(4);
    expect(screeningBonus("baggage", search({ tl: 8, metallic: false, explosive: true }))).toBe(4);
    expect(screeningBonus("ct", search())).toBe(4);
    expect(screeningBonus("ct", search({ explosive: true }))).toBe(6);
    expect(screeningBonus("portableXray", search())).toBe(5);
    expect(screeningBonus("portableXray", search({ skill: EOD }))).toBe(4);
    expect(screeningBonus("portableXray", search({ skill: "Traps" }))).toBe(0);
  });

  it("lets only a metal detector's search for metal negate undercover clothing", () => {
    expect(negatesUndercoverClothing("handheldMetal", search())).toBe(true);
    expect(negatesUndercoverClothing("walkthroughMetal", search())).toBe(true);
    expect(negatesUndercoverClothing("handheldMetal", search({ skill: "Traps" }))).toBe(false);
    expect(negatesUndercoverClothing("baggage", search())).toBe(false);
  });
});

describe("surveillance gear (High-Tech pp. 208-212)", () => {
  it("makes a spike mike (TL-4) levels of Parabolic Hearing", () => {
    expect(spikeMikeLevels("Spike Mike", 7)).toBe(3);
    expect(spikeMikeLevels("Laser Spike Mike", 8)).toBe(4);
    expect(spikeMikeLevels("Pinhead Mike", 7)).toBeNull();
  });

  it("hears through a barrier at -(DR+HP)/5, rounded down", () => {
    expect(contactMikePenalty(2, 10)).toBe(-2);
    expect(contactMikePenalty(4, 0)).toBe(0);
    expect(contactMikePenalty(20, 30)).toBe(-10);
  });

  it("builds a bug smaller than a matchbox at SM+9", () => {
    expect(homemadeBugPenalty(-9)).toBe(0);
    expect(homemadeBugPenalty(-13)).toBe(-4);
    expect(bugOf("Audio Bug (TL8)")).toEqual({ sm: -13, sweep: "normal" });
    expect(bugOf("Radio Beacon (TL7)")?.sweep).toBe("noisy");
    expect(bugOf("Laser Pinhead Mike")?.sweep).toBe("undetectable");
  });

  it("sweeps a minute per 100 square feet, at the detector's quality", () => {
    expect(sweepMinutes(100)).toBe(1);
    expect(sweepMinutes(250)).toBe(3);
    expect(sweepMinutes(0)).toBe(1);
    expect(qualityBonus("basic")).toBe(0);
    expect(qualityBonus("good")).toBe(1);
    expect(qualityBonus("fine")).toBe(2);
  });

  it("rolls a skill against another attribute", () => {
    expect(rebased(13, 12, 10)).toBe(11);
  });
});

describe("jammers (High-Tech pp. 212-213)", () => {
  it("knows each jammer's range and skill", () => {
    expect(jammerByName("Area Jammer (TL6)")).toEqual({ range: 880, skill: null, hinders: ["radio", "cellPhone"] });
    expect(jammerByName("Area Jammer (TL8)")).toEqual({ range: 3520, skill: null, hinders: ["radio", "cellPhone"] });
    expect(jammerByName("Expendable Radio Jammer")).toEqual({ range: 50, skill: 18, hinders: ["radio", "cellPhone"] });
    // The supplement's revision: a call through it is followed on Hearing-2 (HT:EE p. 50).
    expect(jammerByName("Cell-Phone Jammer")).toEqual({ range: 15, skill: null, blocks: "cellPhone", hearing: -2 });
  });

  it("knows the gear a jammer hinders and the skill it's used with", () => {
    expect(jammableByName("Small Radio (TL8)", 8)).toEqual({ skill: "Electronics Operation (Communications)", kind: "radio" });
    expect(jammableByName("Cellular Phone", 8)).toEqual({ skill: "Electronics Operation (Communications)", kind: "cellPhone", voice: true });
    expect(jammableByName("Personal Cellular Beacon", 8)).toEqual({ skill: "Electronics Operation (Surveillance)", kind: "cellPhone" });
    expect(jammableByName("Audio Bug (TL7)", 7)?.skill).toBe("Electronics Operation (Surveillance)");
    expect(jammableByName("Miniature Video Bug", 8)?.kind).toBe("radio");
    expect(jammableByName("Phone Tap", 6)).toBeNull();
  });
});

describe("the supplement's jammers (HT:EE pp. 49-50)", () => {
  const MILE = 1760;

  it("ranges a large jammer as a large radio and a portable one as a medium radio, by the TL in the name or the record's", () => {
    expect(supplementJammerByName("Large Jammer (TL6)", 6)).toEqual({ rule: "jammerKinds", variety: "choose", range: 50 * MILE, skill: null, hinders: ["radio", "cellPhone"] });
    expect(supplementJammerByName("Large Jammer (TL8)", 8)?.range).toBe(200 * MILE);
    expect(supplementJammerByName("Portable Jammer (TL7)", 7)?.range).toBe(10 * MILE);
    expect(supplementJammerByName("Portable Jammer", 8)?.range).toBe(35 * MILE);
  });

  it("blinds radar out to 15 miles, 30 at TL8, and the spoofer is a TL8 radar jammer", () => {
    expect(supplementJammerByName("Radar Jammer (TL7)", 7)).toEqual({ rule: "radarJamming", variety: "broad", range: 15 * MILE, skill: null, hinders: ["radar"] });
    expect(supplementJammerByName("Radar Jammer", 8)?.range).toBe(30 * MILE);
    expect(supplementJammerByName("Radar Spoofer", 8)).toEqual({ rule: "radarJamming", variety: null, spoofs: true, range: 30 * MILE, skill: null, hinders: ["radar"] });
  });

  it("knows none of High-Tech's own, nor anything else", () => {
    expect(supplementJammerByName("Area Jammer (TL7)", 7)).toBeNull();
    expect(supplementJammerByName("Cell-Phone Jammer", 8)).toBeNull();
    expect(supplementJammerByName("Large Radio (TL7)", 7)).toBeNull();
  });

  it("gives the varieties' penalties and the spectrum analyzer", () => {
    expect(JAMMER_VARIETY_PENALTIES).toEqual({ broad: { within: -2, shadow: 0 }, selective: { within: -4, shadow: -2 } });
    expect(isSpectrumAnalyzer("Spectrum Analyzer")).toBe(true);
    expect(isSpectrumAnalyzer("Spectrum Vision")).toBe(false);
  });
});
