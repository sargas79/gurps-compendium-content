import { describe, expect, it } from "vitest";

import {
  HT_POISONS,
  analgesicRelief,
  antitoxinBonuses,
  dailyUseLines,
  dosesPerRecord,
  drugKindByName,
  halfTl,
  mitigatedList,
  mitigates,
  painkillerSeconds,
  poisonEffects,
  poisonRoll,
  strychnineCycles,
  truthSerumSeconds,
  withDmso,
} from "./rules.js";

describe("the records (High-Tech pp. 221, 226-227)", () => {
  it("knows each by the start of its name", () => {
    expect(drugKindByName("Soap (month's supply)")).toBe("soap");
    expect(drugKindByName("Insect Repellant (10-use bottle)")).toBe("insectRepellent");
    expect(drugKindByName("Hand Sanitizer Gel (week's supply)")).toBe("handSanitizer");
    expect(drugKindByName("Morphine")).toBe("morphine");
    expect(drugKindByName("Antibiotics")).toBe("antibiotics");
    expect(drugKindByName("Antibiotics (Two-Week Course)")).toBe("antibiotics");
    expect(drugKindByName("Antibiotic Ointment (10-dose tube)")).toBe("antibioticOintment");
    expect(drugKindByName("Botulin Toxins")).toBe("botulin");
    expect(drugKindByName("Irradiated Thallium")).toBe("thallium");
    expect(drugKindByName("Curare")).toBe("curare");
    expect(drugKindByName("Soapstone Carving")).toBe("");
  });

  it("counts a bottle's doses from its name", () => {
    expect(dosesPerRecord("Analgesics (100 doses)", "analgesics")).toBe(100);
    expect(dosesPerRecord("Insect Repellant (10-use bottle)", "insectRepellent")).toBe(10);
    expect(dosesPerRecord("Sunscreen (four-use bottle)", "sunscreen")).toBe(4);
    expect(dosesPerRecord("Salt Tablets (bottle of 50)", "saltTablets")).toBe(50);
    expect(dosesPerRecord("Antibiotic Ointment (10-dose tube)", "antibioticOintment")).toBe(10);
    expect(dosesPerRecord("Ammonia Inhalants (vial)", "ammonia")).toBe(20);
    expect(dosesPerRecord("Morphine", "morphine")).toBe(1);
  });
});

describe("hygiene and daily-use drugs (pp. 221, 226)", () => {
  const all = [
    { kind: "soap", name: "Soap" }, { kind: "handSanitizer", name: "Gel" }, { kind: "footPowder", name: "Powder" },
    { kind: "insectRepellent", name: "Repellent" }, { kind: "saltTablets", name: "Salt" }, { kind: "quinine", name: "Quinine" },
  ] as const;

  it("gives soap +1 to Contagion and Infection, sanitizer +1 to Contagion", () => {
    expect(dailyUseLines(all, { tags: ["disease", "infection", "HT"], disease: "Infection" })).toEqual([{ kind: "soap", name: "Soap", value: 1 }]);
    expect(dailyUseLines(all, { tags: ["disease", "contagion", "HT"], disease: "Influenza" }).map((l) => l.value)).toEqual([1, 1]);
  });

  it("gives insect repellent +3 against an insect-borne disease only", () => {
    expect(dailyUseLines(all, { tags: ["contagion"], disease: "Yellow Fever" })).toContainEqual({ kind: "insectRepellent", name: "Repellent", value: 3 });
    expect(dailyUseLines(all, { tags: ["contagion"], disease: "Influenza" }).some((l) => l.kind === "insectRepellent")).toBe(false);
  });

  it("gives foot powder +2 against a fungal infection of the feet", () => {
    expect(dailyUseLines(all, { tags: ["contagion"], disease: "Trench Foot" })).toContainEqual({ kind: "footPowder", name: "Powder", value: 2 });
  });

  it("gives salt tablets +1 on the heat roll", () => {
    expect(dailyUseLines(all, { tags: ["exposure", "heat", "HT"], disease: "" })).toEqual([{ kind: "saltTablets", name: "Salt", value: 1 }]);
    expect(dailyUseLines(all, { tags: ["exposure", "cold", "HT"], disease: "" })).toEqual([]);
  });

  it("gives quinine +5 to avoid malaria and +3 to recover from it", () => {
    expect(dailyUseLines(all, { tags: ["contagion"], disease: "Malaria" })).toContainEqual({ kind: "quinine", name: "Quinine", value: 5 });
    expect(dailyUseLines(all, { tags: ["disease", "illness", "HT"], disease: "Malaria" })).toEqual([{ kind: "quinine", name: "Quinine", value: 3 }]);
    expect(dailyUseLines([{ kind: "antimalarial", name: "Atabrine" }], { tags: ["illness"], disease: "Malaria" })).toEqual([{ kind: "antimalarial", name: "Atabrine", value: 3 }]);
  });
});

describe("drugs (pp. 226-227)", () => {
  it("gives half the TL, and an antitoxin +1 to +TL/2", () => {
    expect(halfTl(6)).toBe(3);
    expect(halfTl(7)).toBe(3);
    expect(halfTl(8)).toBe(4);
    expect(antitoxinBonuses(6)).toEqual([1, 2, 3]);
  });

  it("takes 1 or 2 off pain's penalty after Pain Threshold, never more than the pain", () => {
    expect(analgesicRelief("moderate", "normal")).toBe(2);
    expect(analgesicRelief("moderate", "high")).toBe(1);
    expect(analgesicRelief("severe", "low")).toBe(2);
    expect(analgesicRelief("terrible", "normal", 1)).toBe(1);
    expect(analgesicRelief(null, "normal")).toBe(0);
  });

  it("lasts the painkiller the margin's hours, truth serum (20 - HT)/2 minutes", () => {
    expect(painkillerSeconds(3)).toBe(3 * 3600);
    expect(painkillerSeconds(0)).toBe(3600);
    expect(truthSerumSeconds(10)).toBe(300);
    expect(truthSerumSeconds(13)).toBe(180);
    expect(truthSerumSeconds(25)).toBe(60);
  });

  it("makes a blood or digestive agent a contact agent with DMSO, and leaves the rest", () => {
    expect(withDmso(["digestive"])).toEqual(["contact"]);
    expect(withDmso(["blood", "digestive", "respiratory"])).toEqual(["contact"]);
    expect(withDmso(["followUp"])).toEqual(["followUp"]);
  });

  it("names the disadvantages a psychiatric drug mitigates", () => {
    expect(mitigatedList("")).toContain("Paranoia");
    expect(mitigatedList("Paranoia, Flashbacks (Mild)")).toEqual(["Paranoia", "Flashbacks (Mild)"]);
    expect(mitigates(["Flashbacks (Mild)"], "Flashbacks (Severe)")).toBe(true);
    expect(mitigates(["Paranoia"], "Bad Temper")).toBe(false);
  });
});

describe("the poisons (p. 227)", () => {
  it("runs each one's damage and cycles, with no roll of the system's", () => {
    expect(HT_POISONS.curare).toMatchObject({ delivery: ["followUp"], delaySeconds: 60, resistanceModifier: null, damage: "toxic", dice: 2, intervalSeconds: 1800, cycles: 4 });
    expect(HT_POISONS.ricin).toMatchObject({ delaySeconds: 28800, dice: 3, intervalSeconds: 28800, cycles: 10 });
    expect(HT_POISONS.strychnine).toMatchObject({ delaySeconds: 900, damage: "none", intervalSeconds: 300 });
    expect(HT_POISONS.botulin).toMatchObject({ delaySeconds: 43200, damage: "none", intervalSeconds: 43200 });
    expect(HT_POISONS.thallium).toMatchObject({ delaySeconds: 10800, dice: 1, intervalSeconds: 86400, cycles: 10 });
    expect(strychnineCycles(7)).toBe(84);
  });

  it("rolls curare at HT-6, ricin at HT-2, botulin one worse each cycle after the first", () => {
    expect(poisonRoll("curare", 3)).toBe(-6);
    expect(poisonRoll("ricin", 1)).toBe(-2);
    expect(poisonRoll("strychnine", 1)).toBe(0);
    expect(poisonRoll("botulin", 1)).toBeNull();
    expect(poisonRoll("botulin", 2)).toBe(-1);
    expect(poisonRoll("botulin", 5)).toBe(-4);
    expect(poisonRoll("thallium", 1)).toBeNull();
  });

  it("paralyses on curare's failure and chokes on its critical failure", () => {
    const fail = { success: false, criticalFailure: false };
    expect(poisonEffects("curare", 1, { success: true, criticalFailure: false }, false).conditions).toEqual([]);
    expect(poisonEffects("curare", 1, fail, false).conditions).toEqual([{ key: "paralysis" }]);
    expect(poisonEffects("curare", 1, { success: false, criticalFailure: true }, false).conditions).toEqual([{ key: "paralysis" }, { key: "choking" }]);
  });

  it("chokes ricin's victim who failed the first roll and a later one", () => {
    const fail = { success: false, criticalFailure: false };
    expect(poisonEffects("ricin", 1, { success: true, criticalFailure: false }, false).conditions).toEqual([{ key: "nauseated" }]);
    expect(poisonEffects("ricin", 1, fail, false).conditions).toEqual([{ key: "nauseated" }, { key: "coughing" }]);
    expect(poisonEffects("ricin", 2, fail, true).conditions.map((c) => c.key)).toContain("choking");
    expect(poisonEffects("ricin", 2, fail, false).conditions.map((c) => c.key)).not.toContain("choking");
  });

  it("gives botulin's 4d first, then lasting paralysis on a failure, which ends the dose", () => {
    const onset = poisonEffects("botulin", 1, null, false);
    expect(onset.injury).toBe("4d");
    expect(onset.conditions.map((c) => c.key)).toEqual(["nauseated", "retching"]);
    const paralysed = poisonEffects("botulin", 3, { success: false, criticalFailure: false }, false);
    expect(paralysed.conditions).toEqual([{ key: "paralysis", lasting: true }]);
    expect(paralysed.ends).toBe(true);
    expect(poisonEffects("botulin", 3, { success: true, criticalFailure: false }, false).ends).toBe(false);
  });

  it("gives strychnine a seizure every cycle and choking on a failure", () => {
    expect(poisonEffects("strychnine", 4, { success: true, criticalFailure: false }, false).conditions).toEqual([{ key: "seizure" }]);
    expect(poisonEffects("strychnine", 4, { success: false, criticalFailure: false }, false).conditions).toEqual([{ key: "seizure" }, { key: "choking" }]);
  });
});
