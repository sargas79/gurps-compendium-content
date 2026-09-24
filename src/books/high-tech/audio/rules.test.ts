import { describe, expect, it } from "vitest";

import { hearingDistanceModifier } from "../../../../system/src/rules/index.js";
import {
  CARBON_QUALITY,
  amplifiedRange,
  amplifierOf,
  audioKind,
  baseName,
  basicHydrophoneBonus,
  chainQuality,
  intimidationBonus,
  linkQuality,
  listeningPenalty,
  paSpeakers,
  parabolicBonus,
  printedQuality,
  speakerWeightFactor,
} from "./rules.js";

describe("audio records by name (HT:EE pp. 31-32; High-Tech pp. 39, 41, 226)", () => {
  it("reads the supplement's names printed at several TLs, and High-Tech's own", () => {
    expect(baseName("Guitar Amplifier (TL7)")).toBe("Guitar Amplifier");
    expect(audioKind("Microphone (TL8)")).toBe("microphone");
    expect(audioKind("Microphone")).toBe("microphone");
    expect(audioKind("Throat Microphone (TL6)")).toBe("microphone");
    expect(audioKind("Parabolic Microphone (TL8)")).toBe("parabolic");
    expect(audioKind("Shotgun Microphone (TL7)")).toBe("shotgun");
    expect(audioKind("Headphones")).toBe("headphones");
    expect(audioKind("Stereo Headphones")).toBe("headphones");
    expect(audioKind("Wireless Headphones")).toBe("headphones");
    expect(audioKind("Headphones and Throat Mike")).toBe("headphones");
    expect(audioKind("Earbuds")).toBe("earbuds");
    expect(audioKind("Loudspeaker")).toBe("speaker");
    expect(audioKind("Tactical Headset")).toBe("headset");
    expect(audioKind("Bullhorn")).toBe("amplifier");
    expect(audioKind("Hearing Aid (TL6)")).toBe("hearingAid");
    expect(audioKind("Laser Microphone")).toBeNull();
    expect(audioKind("Radio")).toBeNull();
  });
});

describe("sound quality (HT:EE pp. 30-32)", () => {
  it("is the weakest link's", () => {
    expect(chainQuality([2, 1, 0])).toBe(0);
    expect(chainQuality([2, -5, 1])).toBe(-5);
    expect(chainQuality([])).toBe(0);
  });

  it("takes the GM's figure, then a carbon microphone's -5, then the grade and the make", () => {
    expect(linkQuality({ grade: 2, stated: -2, carbon: true, printed: 0 })).toBe(-2);
    expect(linkQuality({ grade: 2, stated: null, carbon: true, printed: 0 })).toBe(CARBON_QUALITY);
    expect(linkQuality({ grade: 1, stated: null, carbon: false, printed: -2 })).toBe(-1);
  });

  it("puts the TL6 guitar amplifier at -2, not the later ones", () => {
    expect(printedQuality("Guitar Amplifier (TL6)", 6)).toBe(-2);
    expect(printedQuality("Guitar Amplifier (TL7)", 7)).toBe(0);
    expect(printedQuality("Public Address System", 6)).toBe(0);
  });

  it("doubles a loudspeaker's weight for each step of quality", () => {
    expect(speakerWeightFactor("basic")).toBe(1);
    expect(speakerWeightFactor("good")).toBe(2);
    expect(speakerWeightFactor("fine")).toBe(4);
  });

  it("gives an aimed parabolic microphone +2 for high sounds, +1 for speech, nothing for low ones", () => {
    expect(parabolicBonus("high")).toBe(2);
    expect(parabolicBonus("speech")).toBe(1);
    expect(parabolicBonus("low")).toBe(0);
  });
});

describe("headphones and earbuds (HT:EE p. 31)", () => {
  it("leave the wearer Hard of Hearing, -2 turned down", () => {
    expect(listeningPenalty("headphones", "loud")).toEqual({ hardOfHearing: true, modifier: 0 });
    expect(listeningPenalty("headphones", "low")).toEqual({ hardOfHearing: false, modifier: -2 });
    expect(listeningPenalty("headphones", "off")).toEqual({ hardOfHearing: false, modifier: 0 });
  });

  it("cost half that with earbuds", () => {
    expect(listeningPenalty("earbuds", "loud")).toEqual({ hardOfHearing: false, modifier: -2 });
    expect(listeningPenalty("earbuds", "low")).toEqual({ hardOfHearing: false, modifier: -1 });
  });

  it("do nothing for gear that isn't played into the ear", () => {
    expect(listeningPenalty("speaker", "loud")).toEqual({ hardOfHearing: false, modifier: 0 });
  });
});

describe("amplifiers (HT:EE p. 32)", () => {
  it("have their base Hearing ranges", () => {
    expect(amplifierOf("Public Address System", 6)?.front).toBe(16);
    expect(amplifierOf("Guitar Amplifier (TL6)", 6)?.front).toBe(16);
    expect(amplifierOf("Guitar Amplifier (TL7)", 7)?.front).toBe(32);
    expect(amplifierOf("Guitar Amplifier (TL8)", 8)?.front).toBe(32);
    expect(amplifierOf("Acoustic Hailing Device", 8)?.front).toBe(256);
    expect(amplifierOf("Microphone", 6)).toBeNull();
  });

  it("reach less to a bullhorn's side and rear, and nothing outside the hailing device's cone", () => {
    const bullhorn = amplifierOf("Bullhorn", 7)!;
    expect([amplifiedRange(bullhorn, "front"), amplifiedRange(bullhorn, "side"), amplifiedRange(bullhorn, "rear")]).toEqual([16, 8, 4]);
    const lrad = amplifierOf("Acoustic Hailing Device", 8)!;
    expect(amplifiedRange(lrad, "front")).toBe(256);
    expect(amplifiedRange(lrad, "outside")).toBeNull();
    expect(amplifiedRange(amplifierOf("Public Address System", 6)!, "rear")).toBe(16);
  });

  it("are heard with the Hearing Distance Table's modifier", () => {
    // A bullhorn heard from 64 yards in front: two doublings past 16 yards.
    expect(hearingDistanceModifier(64, amplifiedRange(amplifierOf("Bullhorn", 7)!, "front")!)).toBe(-2);
  });

  it("give +1 to Intimidation close in", () => {
    const bullhorn = amplifierOf("Bullhorn", 7)!;
    expect(intimidationBonus(bullhorn, 2)).toBe(1);
    expect(intimidationBonus(bullhorn, 3)).toBe(0);
    expect(intimidationBonus(bullhorn, 2, "side")).toBe(0);
    expect(intimidationBonus(bullhorn, 1, "side")).toBe(1);
    expect(intimidationBonus(amplifierOf("Acoustic Hailing Device", 8)!, 32)).toBe(1);
    expect(intimidationBonus(amplifierOf("Public Address System", 6)!, 1)).toBe(0);
  });

  it("add $20 and 3 lbs. a public address speaker, the battery shared among them", () => {
    expect(paSpeakers(2)).toEqual({ cost: 40, weight: 6, endurance: 1 / 3 });
    expect(paSpeakers(0)).toEqual({ cost: 0, weight: 0, endurance: 1 });
  });
});

describe("the supplement's hydrophone (HT:EE p. 31)", () => {
  it("is +2 at TL7 and +4 at TL8", () => {
    expect(basicHydrophoneBonus("Hydrophone", 6)).toBe(0);
    expect(basicHydrophoneBonus("Hydrophone", 7)).toBe(2);
    expect(basicHydrophoneBonus("Hydrophone", 8)).toBe(4);
    expect(basicHydrophoneBonus("Small Hydrophone", 7)).toBeNull();
  });
});
