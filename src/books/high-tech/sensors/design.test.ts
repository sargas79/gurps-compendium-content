import { describe, expect, it } from "vitest";

import {
  CRYSTAL_SPOT,
  PRINTED_RADIOS,
  crystalSpot,
  cuttingEdgeDesign,
  designActive,
  designFactors,
  designOffered,
  isSparkGap,
  isSuperheterodyne,
  oscillationPenalty,
  qualityBonus,
  regenerativeAdjustment,
  superheterodyneByDefault,
  type DesignInput,
} from "./design.js";

const set = (over: Partial<DesignInput> = {}, options: Record<string, boolean> = {}): DesignInput => ({ tl: 6, size: "large", commMode: "", codePrinted: true, options, ...over });

describe("radio design (HT:EE pp. 28-30, 32, 34)", () => {
  it("offers spark gap at TL6 on large and medium sets, and its options by end", () => {
    expect(designOffered(set())).toContain("sparkGap");
    expect(designOffered(set({ size: "small" }))).not.toContain("sparkGap");
    expect(designOffered(set({ tl: 7 }))).not.toContain("sparkGap");
    const receiver = designOffered(set({ commMode: "receiver" }, { sparkGap: true }));
    expect(receiver).toEqual(expect.arrayContaining(["coherer", "crystalDetector", "diodeDetector"]));
    expect(receiver).not.toContain("wideband");
    // A spark gap carries code only: no audio, and none of the audio receivers.
    expect(receiver).not.toContain("audio");
    expect(receiver).not.toContain("gridLeak");
    const transmitter = designOffered(set({ commMode: "transmitter" }, { sparkGap: true }));
    expect(transmitter).toEqual(expect.arrayContaining(["rotarySparkGap", "ultraRotarySparkGap", "wideband"]));
    expect(transmitter).not.toContain("crystalDetector");
  });

  it("offers the audio receivers on an audio set, and audio only on a set printed for code", () => {
    expect(designOffered(set({ codePrinted: true }))).not.toContain("gridLeak");
    expect(designOffered(set({ codePrinted: true }, { audio: true }))).toEqual(expect.arrayContaining(["gridLeak", "regenerative", "superheterodyne", "quartzTuning"]));
    // High-Tech's radios carry audio as printed, unless made code-only.
    expect(designOffered(set({ codePrinted: false }))).not.toContain("audio");
    expect(designOffered(set({ codePrinted: false }))).toContain("superheterodyne");
    expect(designOffered(set({ codePrinted: false, codeOnly: true }))).not.toContain("superheterodyne");
    // FM from TL7, video from TL7 on large to small sets, digital video at TL8 on small and tiny ones.
    expect(designOffered(set({ tl: 7, codePrinted: false }))).toEqual(expect.arrayContaining(["fm", "video"]));
    expect(designOffered(set({ tl: 8, size: "tiny", codePrinted: false }))).toEqual(expect.arrayContaining(["digitalVideo"]));
    expect(designOffered(set({ tl: 8, size: "tiny", codePrinted: false }))).not.toContain("video");
  });

  it("counts one of each exclusive group", () => {
    expect(designActive(set({ commMode: "receiver" }, { sparkGap: true, coherer: true, crystalDetector: true }))).toEqual(["sparkGap", "crystalDetector"]);
    expect(designActive(set({ commMode: "transmitter" }, { sparkGap: true, rotarySparkGap: true, ultraRotarySparkGap: true, wideband: true }))).toEqual(["sparkGap", "ultraRotarySparkGap", "wideband"]);
    // An option the set can't have doesn't count, whatever its field holds.
    expect(designActive(set({ tl: 7 }, { sparkGap: true, crystalDetector: true }))).toEqual([]);
    expect(isSparkGap(set({ size: "small" }, { sparkGap: true }))).toBe(false);
  });

  it("prices the options, their factors multiplied (HT:EE p. 28)", () => {
    expect(designFactors(set({ commMode: "receiver" }, { sparkGap: true, crystalDetector: true }))).toEqual({ cost: 2, weight: 0.75, range: 0.1, endurance: 1 });
    expect(designFactors(set({ commMode: "receiver" }, { sparkGap: true, diodeDetector: true }))).toEqual({ cost: 2, weight: 1, range: 0.1, endurance: 1 });
    // Send-only x0.9, wideband x1.25 weight and a fifth the endurance, rotary x5.
    expect(designFactors(set({ commMode: "transmitter" }, { sparkGap: true, wideband: true, rotarySparkGap: true }))).toEqual({ cost: 4.5, weight: 1.125, range: 1, endurance: 0.2 });
    expect(designFactors(set({ commMode: "transmitter" }, { sparkGap: true, ultraRotarySparkGap: true })).cost).toBe(18);
    expect(designFactors(set({}, { audio: true, gridLeak: true }))).toMatchObject({ cost: 2, range: 0.2 });
  });

  it("prices what a set carries against what it is printed for (HT:EE pp. 27, 32, 34)", () => {
    // The supplement's code set: audio x2, video x4 and x2 weight.
    expect(designFactors(set({ tl: 7, size: "medium" }, { audio: true })).cost).toBe(2);
    expect(designFactors(set({ tl: 7, size: "medium" }, { audio: true, video: true }))).toMatchObject({ cost: 4, weight: 2 });
    // High-Tech's audio set: video doubles it.
    expect(designFactors(set({ tl: 7, size: "medium", codePrinted: false }, { video: true }))).toMatchObject({ cost: 2, weight: 2 });
    expect(designFactors(set({ tl: 8, size: "small", codePrinted: false }, { digitalVideo: true }))).toMatchObject({ cost: 2, weight: 2 });
    // A spark gap on High-Tech's audio set: code alone, at half; not again where it's made code-only.
    expect(designFactors(set({ codePrinted: false }, { sparkGap: true })).cost).toBe(0.5);
    expect(designFactors(set({ codePrinted: false, codeOnly: true }, { sparkGap: true })).cost).toBe(1);
  });

  it("reprices the trench radio's printed sets to their printed figures (HT:EE pp. 27, 29)", () => {
    // $1,750 and 100 lbs. send-only and wideband: $1,575, 112.5 lbs.
    const tx = PRINTED_RADIOS["Trench Radio Transmitter"]!;
    const txf = designFactors(set({ size: tx.size, commMode: tx.commMode }, tx.options as Record<string, boolean>));
    expect(Math.round(1750 * txf.cost)).toBe(1575);
    expect(100 * txf.weight).toBe(112.5);
    // $1,250 and 30 lbs. receive-only (x0.1, x0.2 weight) with a crystal: $250, 4.5 lbs., and 0.5 mile from 5.
    const rx = PRINTED_RADIOS["Trench Radio Receiver"]!;
    const rxf = designFactors(set({ size: rx.size, commMode: rx.commMode }, rx.options as Record<string, boolean>));
    expect(Math.round(1250 * 0.1 * rxf.cost)).toBe(250);
    expect(Math.round(30 * 0.2 * rxf.weight * 100) / 100).toBe(4.5);
    expect((rx.range * rxf.range) / 1760).toBeCloseTo(0.5);
    // The book's Mix and Match example: 50 miles with 0.5 mile is 5 (HT:EE p. 28).
    expect(Math.sqrt((tx.range / 1760) * ((rx.range * rxf.range) / 1760))).toBeCloseTo(5);
  });

  it("gives a rotary spark gap its quality, and calls quartz at TL6 and FM at TL7 cutting edge", () => {
    expect(qualityBonus(["rotarySparkGap"])).toBe(1);
    expect(qualityBonus(["ultraRotarySparkGap", "wideband"])).toBe(2);
    expect(qualityBonus([])).toBe(0);
    expect(cuttingEdgeDesign(set({ codePrinted: false }, { quartzTuning: true }))).toBe(true);
    expect(cuttingEdgeDesign(set({ tl: 7, codePrinted: false }, { fm: true }))).toBe(true);
    expect(cuttingEdgeDesign(set({ tl: 8, codePrinted: false }, { fm: true }))).toBe(false);
  });

  it("reads the receivers' rolls (HT:EE pp. 28-29)", () => {
    expect(crystalSpot({ success: true })).toEqual({ modifier: CRYSTAL_SPOT.found, blocked: false });
    expect(crystalSpot({ success: false })).toEqual({ modifier: -2, blocked: false });
    expect(crystalSpot({ success: false, criticalFailure: true })).toEqual({ modifier: 0, blocked: true });
    expect(regenerativeAdjustment({ success: true })).toBe("adjusted");
    expect(regenerativeAdjustment({ success: false })).toBe("missed");
    expect(regenerativeAdjustment({ success: false, criticalFailure: true })).toBe("oscillating");
  });

  it("jams receivers near an oscillating set at -4 within 440 yards, 1 less a doubling (HT:EE p. 29)", () => {
    expect(oscillationPenalty(0)).toBe(-4);
    expect(oscillationPenalty(440)).toBe(-4);
    expect(oscillationPenalty(441)).toBe(-3);
    expect(oscillationPenalty(880)).toBe(-3);
    expect(oscillationPenalty(1760)).toBe(-2);
    expect(oscillationPenalty(3520)).toBe(-1);
    expect(oscillationPenalty(3521)).toBe(0);
  });

  it("makes every audio or video receiver a superheterodyne from TL7 (HT:EE p. 29)", () => {
    // At TL6 only by the option.
    expect(isSuperheterodyne(set({ codePrinted: false }))).toBe(false);
    expect(isSuperheterodyne(set({ codePrinted: false }, { superheterodyne: true }))).toBe(true);
    expect(superheterodyneByDefault(set({ codePrinted: false }, { superheterodyne: true }))).toBe(false);
    // High-Tech's TL7 sets carry audio; the supplement's code sets need the audio option, or video.
    expect(isSuperheterodyne(set({ tl: 7, codePrinted: false }))).toBe(true);
    expect(superheterodyneByDefault(set({ tl: 7, codePrinted: false }))).toBe(true);
    expect(isSuperheterodyne(set({ tl: 7, codePrinted: false, codeOnly: true }))).toBe(false);
    expect(isSuperheterodyne(set({ tl: 7 }))).toBe(false);
    expect(isSuperheterodyne(set({ tl: 7 }, { audio: true }))).toBe(true);
    expect(isSuperheterodyne(set({ tl: 7 }, { video: true }))).toBe(true);
    // A send-only set receives nothing.
    expect(isSuperheterodyne(set({ tl: 8, codePrinted: false, commMode: "transmitter" }))).toBe(false);
  });
});
