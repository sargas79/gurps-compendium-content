import { describe, expect, it } from "vitest";

import {
  immunity,
  mindOutcome,
  mindripperOutcome,
  nauseatorOutcome,
  neuralOutcome,
  screamerHearing,
  senseResistBonus,
  settingsFor,
  tunableFactor,
  type Target,
} from "./neural.js";

const person = (patch: Partial<Target> = {}): Target => ({ traits: [], iq: 10, sealed: false, deaf: false, injuryTolerance: {}, ...patch });

describe("neural disruptors (Ultra-Tech pp. 121-122)", () => {
  it("offers the book's settings, and charges half again for each after the first", () => {
    expect(settingsFor("neural")).toContain("paralysis");
    expect(settingsFor("mindDisruptor")).toContain("hypnogogic");
    expect(settingsFor("blaster")).toEqual([]);
    expect(tunableFactor(1)).toBe(1);
    expect(tunableFactor(3)).toBe(2);
  });

  it("afflicts for minutes equal to the margin, and stops a heart at 5 or more on agony and ecstasy", () => {
    expect(neuralOutcome("paralysis", 3)).toEqual([{ condition: "paralysis", seconds: 180, note: "Neural.paralysis" }]);
    expect(neuralOutcome("agony", 4).map((o) => o.condition)).toEqual(["agony"]);
    expect(neuralOutcome("agony", 5).map((o) => o.condition)).toEqual(["agony", "heartAttack"]);
    expect(neuralOutcome("neuralStun", 2)[0]).toMatchObject({ condition: "unconscious", seconds: 120 });
  });

  it("gives a death beam a heart attack on any failure", () => {
    expect(neuralOutcome("deathBeam", 0).map((o) => o.condition)).toEqual(["heartAttack"]);
  });

  it("can't reach a machine, a body without a brain, or anyone sealed", () => {
    expect(immunity("neural", person({ traits: ["Machine"] }))).toBe("noNerves");
    expect(immunity("neural", person({ injuryTolerance: { diffuse: true } }))).toBe("noNerves");
    expect(immunity("neural", person({ sealed: true }))).toBe("sealed");
    expect(immunity("neural", person())).toBeNull();
  });
});

describe("mind disruptors and mindrippers (Ultra-Tech pp. 122, 132)", () => {
  it("dazes for minutes, or knocks out on a failure by 5", () => {
    expect(mindOutcome("hypnogogic", 2)).toEqual([{ condition: "daze", seconds: 120, note: "Mind.hypnogogic" }]);
    expect(mindOutcome("hypnogogic", 6)[0]).toMatchObject({ condition: "unconscious" });
  });

  it("chokes for twice the margin in seconds, with a heart attack by 5", () => {
    expect(mindOutcome("deathBeam", 3)).toEqual([{ condition: "choking", seconds: 6, note: "Mind.deathBeam" }]);
    expect(mindOutcome("deathBeam", 5).map((o) => o.condition)).toEqual(["choking", "heartAttack"]);
  });

  it("makes someone hallucinate, or puts them in a coma by 5", () => {
    expect(mindOutcome("insanity", 1)[0]).toMatchObject({ condition: "hallucinating", seconds: 60 });
    expect(mindOutcome("insanity", 7)[0]).toMatchObject({ condition: "coma", seconds: null });
  });

  it("can't reach IQ 0 or a Digital Mind, and Mind Shield adds its level", () => {
    expect(immunity("mindDisruptor", person({ iq: 0 }))).toBe("noMind");
    expect(immunity("mindDisruptor", person({ traits: ["Digital Mind"] }))).toBe("noMind");
    expect(senseResistBonus("mindDisruptor", { traits: ["Mind Shield 4"], protectedHearing: false })).toBe(4);
  });

  it("leaves a mindripper's victim in a coma, and without memories by 5", () => {
    expect(mindripperOutcome(2)).toEqual([{ condition: "coma", seconds: null, note: "Mindripper.coma" }]);
    expect(mindripperOutcome(5)[0]!.note).toBe("Mindripper.worse");
  });
});

describe("sonic weapons (Ultra-Tech p. 125)", () => {
  it("pains with a nauseator, and makes someone retch by 5; the deaf are out of reach; Protected Hearing adds 5", () => {
    expect(nauseatorOutcome(2).map((o) => o.condition)).toEqual(["moderatePain"]);
    expect(nauseatorOutcome(5).map((o) => o.condition)).toEqual(["moderatePain", "retching"]);
    expect(immunity("nauseator", person({ deaf: true }))).toBe("deaf");
    expect(senseResistBonus("nauseator", { traits: [], protectedHearing: true })).toBe(5);
  });

  it("takes a screamer's victim's hearing past half HP, and all of it past two-thirds", () => {
    expect(screamerHearing(5, 10)).toBe("");
    expect(screamerHearing(6, 10)).toBe("hardOfHearing");
    expect(screamerHearing(7, 10)).toBe("deafness");
  });
});
