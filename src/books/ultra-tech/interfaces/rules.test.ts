import { describe, expect, it } from "vitest";

import {
  aiTutorRate,
  dreamTeacherComplexity,
  dreamTeacherRate,
  experiencedLevel,
  filteredAppearance,
  instaskillOverdose,
  instaskillTakes,
  managerSupports,
  seriesComprehension,
  translatorComplexity,
  universalTranslatorLevel,
  virtualTutorComplexity,
} from "./rules.js";

describe("virtual reality (Ultra-Tech p. 54)", () => {
  it("supports up to basic, full or total VR by the manager's Complexity", () => {
    expect(managerSupports(4)).toBe("basic");
    expect(managerSupports(6)).toBe("total");
    expect(managerSupports(3)).toBeNull();
  });

  it("gives the user the lower of the interface and the manager", () => {
    expect(experiencedLevel("full", 4)).toBe("basic");
    expect(experiencedLevel("basic", 6)).toBe("basic");
  });
});

describe("translators (Ultra-Tech p. 48)", () => {
  it("sets Complexity by comprehension and the languages", () => {
    expect(translatorComplexity("native")).toBe(5);
    expect(translatorComplexity("broken", { artificial: 2 })).toBe(1);
    expect(translatorComplexity("accented", { interspecies: true, crossSense: true })).toBe(6);
  });

  it("loses a grade translating in series", () => {
    expect(seriesComprehension("native", "accented")).toBe("broken");
    expect(seriesComprehension("broken", "native")).toBe("none");
  });

  it("learns a language in an hour, six hours and a day", () => {
    expect(universalTranslatorLevel(0.5)).toBe("none");
    expect(universalTranslatorLevel(6)).toBe("accented");
    expect(universalTranslatorLevel(30)).toBe("native");
  });
});

describe("augmented reality and teaching (Ultra-Tech pp. 56-59)", () => {
  it("raises video Appearance a level, to Very Handsome", () => {
    expect(filteredAppearance("Average")).toBe("Attractive");
    expect(filteredAppearance("Very Handsome")).toBe("Very Handsome");
  });

  it("sets tutors' Complexity and study rates", () => {
    expect(virtualTutorComplexity(true)).toBe(3);
    expect(aiTutorRate(false)).toBe("selfStudy");
    expect(dreamTeacherRate("IQ")).toBe("intensive");
    expect(dreamTeacherRate("DX")).toBe("education");
    expect(dreamTeacherComplexity({ difficulty: "VH" })).toBe(9);
    expect(dreamTeacherComplexity({ language: true })).toBe(8);
    expect(dreamTeacherComplexity({ disadvantagePoints: -5 })).toBe(8);
  });

  it("gives instaskill a point only to those with a point or less, and risks voices", () => {
    expect(instaskillTakes(1)).toBe(true);
    expect(instaskillTakes(2)).toBe(false);
    expect(instaskillOverdose({ success: false, criticalFailure: false, margin: 3 })).toEqual({ phantomVoices: true, days: 3 });
    expect(instaskillOverdose({ success: false, criticalFailure: true, margin: 1 }).days).toBe("permanent");
  });
});
