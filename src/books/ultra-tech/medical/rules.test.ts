import { describe, expect, it } from "vitest";

import {
  analgineHours,
  ascepalineRoll,
  bandageSpraySeconds,
  chrysalisRevival,
  chrysalisRevivalPenalty,
  deviceByName,
  deviceSkill,
  drugByName,
  esuBonus,
  fpAfterHibernation,
  immuneCureDice,
  isLifeSupport,
  medicalBedRounds,
  medicalHelp,
  nanostasisRevival,
  programmingPenalty,
  regeneratedHp,
  regenerationRayOutcome,
  rejuvenationDays,
  rejuvenationOutcome,
  resistedDrugEffect,
  revivalOf,
  smartBandageHp,
  suitDocDays,
  suppliesPatientDays,
} from "./rules.js";

describe("devices that treat on their own (Ultra-Tech pp. 196-202)", () => {
  it("gives an automed and a suitcase doc their skills by TL", () => {
    const automed = deviceByName("Automed")!;
    expect(deviceSkill(automed, "surgery", 9)).toBe(13);
    expect(deviceSkill(automed, "physician", 11)).toBe(15);
    const doc = deviceByName("Suitcase Doc")!;
    expect(deviceSkill(doc, "firstAid", 10)).toBe(12);
    expect(deviceSkill(doc, "surgery", 12)).toBe(14);
    expect(deviceSkill(deviceByName("Pocket Medic")!, "firstAid", 11)).toBe(14);
    expect(deviceSkill(deviceByName("Pocket Medic")!, "surgery", 11)).toBe(null);
    expect(deviceByName("First Aid Kit")).toBe(null);
  });
});

describe("first aid and care (Ultra-Tech pp. 197-199)", () => {
  it("speeds bandage spray by TL", () => {
    expect(bandageSpraySeconds(9)).toBe(10);
    expect(bandageSpraySeconds(10)).toBe(5);
    expect(bandageSpraySeconds(12)).toBe(2);
  });

  it("works out a smart bandage", () => {
    expect(smartBandageHp(true, false, 4)).toBe(4);
    expect(smartBandageHp(false, false, 4)).toBe(0);
    expect(smartBandageHp(false, true, 4)).toBe(-2);
  });

  it("knows life support and its bonus", () => {
    expect(esuBonus("Hospital ESU")).toBe(2);
    expect(esuBonus("Transport ESU")).toBe(1);
    expect(esuBonus("Suitcase ESU")).toBe(0);
    expect(esuBonus("Automed")).toBe(1);
    expect(isLifeSupport("Automed")).toBe(true);
    expect(isLifeSupport("Wearable Life Support Unit")).toBe(false);
  });

  it("reads the Medical Help Table and the medical bed", () => {
    expect(medicalHelp(9)).toEqual({ roundsPerDay: 2, patients: 50 });
    expect(medicalHelp(11)).toEqual({ roundsPerDay: 4, patients: 100 });
    expect(medicalHelp(12)).toEqual({ roundsPerDay: 5, patients: 200 });
    expect(medicalBedRounds(9)).toBe(2);
    expect(medicalBedRounds(12)).toBe(5);
    expect(suppliesPatientDays(11)).toBe(100);
    expect(suitDocDays(12)).toBe(20);
  });
});

describe("suspended animation and regeneration (Ultra-Tech pp. 198-202)", () => {
  it("leaves a hibernator at 0 FP", () => {
    expect(fpAfterHibernation(8)).toBe(0);
    expect(fpAfterHibernation(-3)).toBe(-3);
  });

  it("revives from nanostasis by the supervisor's roll", () => {
    expect(nanostasisRevival("criticalFailure", 12)).toEqual({ confusedHours: 8, amnesia: "weekly" });
    expect(nanostasisRevival("failure", 12)).toEqual({ confusedHours: 8, amnesia: "daily" });
    expect(nanostasisRevival("success", 12)).toEqual({ confusedHours: 4, amnesia: null });
    expect(nanostasisRevival("criticalSuccess", 12)).toEqual({ confusedHours: 0, amnesia: null });
    expect(revivalOf({ success: true, criticalSuccess: true })).toBe("criticalSuccess");
  });

  it("regenerates by the hour", () => {
    expect(regeneratedHp(48, { chrysalis: false, supervised: true })).toBe(4);
    expect(regeneratedHp(48, { chrysalis: false, supervised: false })).toBe(2);
    expect(regeneratedHp(5, { chrysalis: true, supervised: true })).toBe(5);
  });

  it("rejuvenates by TL, and by the roll", () => {
    expect(rejuvenationDays(10, false)).toBe(90);
    expect(rejuvenationDays(12, false)).toBe(7);
    expect(rejuvenationDays(11, true)).toBe(4);
    expect(rejuvenationOutcome("success")).toBe("confused");
    expect(rejuvenationOutcome("criticalFailure")).toBe("disaster");
  });

  it("revives the dead in a chrysalis machine", () => {
    expect(chrysalisRevivalPenalty(3)).toBe(-6);
    expect(chrysalisRevivalPenalty(0)).toBe(0);
    expect(chrysalisRevival(true, 0)).toBe("restored");
    expect(chrysalisRevival(false, 2)).toBe("amnesia");
    expect(chrysalisRevival(false, 3)).toBe("mindless");
    expect(regenerationRayOutcome("failure")).toBe("toxic");
    expect(regenerationRayOutcome("criticalFailure")).toBe("sideEffect");
  });
});

describe("drugs and nano (Ultra-Tech pp. 205-206)", () => {
  it("knows the drugs by name", () => {
    expect(drugByName("Memory-Beta")).toBe("memoryBeta");
    expect(drugByName("Aegis Nanobots")).toBe("aegis");
    expect(drugByName("Aspirin")).toBe(null);
  });

  it("works out what a resisted drug does", () => {
    expect(resistedDrugEffect("morphazine", 2, 10)).toEqual({ condition: "unconscious", minutes: 960 });
    expect(resistedDrugEffect("soothe", 3, 10)).toEqual({ condition: "euphoria", minutes: 15 });
    expect(resistedDrugEffect("crediline", 1, 12)).toEqual({ condition: null, minutes: 13 });
  });

  it("times analgine, ascepaline and immune machines", () => {
    expect(analgineHours(11)).toBe(5.5);
    expect(ascepalineRoll(1)).toBe(null);
    expect(ascepalineRoll(2)).toBe(2);
    expect(ascepalineRoll(3)).toBe(1);
    expect(immuneCureDice(10)).toBe(3);
    expect(immuneCureDice(11)).toBe(1);
    expect(programmingPenalty("unknown")).toBe(-4);
  });
});
