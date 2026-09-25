import { describe, expect, it } from "vitest";

import {
  BURST_PACKET,
  computerNeeded,
  encryptionGearByName,
  forgeryNeeds,
  forgeryToolByName,
  hiddenCapacity,
  improvisedLevel,
  isComputer,
  isPrinter,
  luggageByName,
  muleModifier,
  muleOutcome,
  programComplexity,
  standard,
  teamBonus,
  teamHelps,
} from "./rules.js";

describe("breaking codes (pp. 210-211)", () => {
  it("takes the better of IQ-5 and Cryptography for an ad-libbed code", () => {
    expect(improvisedLevel(12, null)).toBe(7);
    expect(improvisedLevel(12, 14)).toBe(14);
    expect(improvisedLevel(15, 9)).toBe(10);
  });

  it("gives +1 for each team member with Cryptography 17+, at most +4", () => {
    expect(teamBonus([17, 16, 18])).toBe(2);
    expect(teamBonus([17, 17, 17, 17, 17, 20])).toBe(4);
    expect(teamBonus([])).toBe(0);
    expect(teamHelps("improvised")).toBe(true);
    expect(teamHelps("basic8")).toBe(false);
  });

  it("gives the encryption standards' base times and computers", () => {
    expect(standard("basic6")).toEqual({ hours: 10 * 365 * 24, complexity: 1 });
    expect(standard("basic6", 2)).toEqual({ hours: 365 * 24, complexity: 2 });
    expect(standard("basic7")).toEqual({ hours: 7 * 24, complexity: 3 });
    expect(standard("basic8")).toEqual({ hours: 24, complexity: 5 });
    expect(standard("secure8")?.hours).toBeNull();
    expect(standard("improvised")).toBeNull();
  });
});

describe("forgery and counterfeiting (pp. 213-214)", () => {
  it("knows the book's tools by name", () => {
    expect(forgeryToolByName("Forgery Tools")).toBe("forgery");
    expect(forgeryToolByName("Counterfeiting Tools")).toBe("counterfeiting");
    expect(forgeryToolByName("Card Printer")).toBe("cards");
    expect(forgeryToolByName("Doc-Fab")).toBeNull();
  });

  it("needs a computer and printer from TL7, and card gear for credit cards", () => {
    expect(forgeryNeeds("forgery", 6)).toEqual({ computer: false, cardGear: false });
    expect(forgeryNeeds("forgery", 7)).toEqual({ computer: true, cardGear: false });
    expect(forgeryNeeds("cards", 8)).toEqual({ computer: true, cardGear: true });
    expect(isComputer("Small Computer")).toBe(true);
    expect(isComputer("Computer Monitoring Gear (TL8)")).toBe(false);
    expect(isPrinter("Desktop Printer")).toBe(true);
    expect(isPrinter("Card Printer")).toBe(false);
  });
});

describe("disguise and smuggling (pp. 214-215)", () => {
  it("gives smuggler's luggage a secret area of a tenth its capacity", () => {
    expect(luggageByName("Smuggler's Attaché Case")).toBe("attacheCase");
    expect(hiddenCapacity("steamerTrunk")).toEqual({ lbs: 40, cf: 0.5 });
    expect(hiddenCapacity("attacheCase")).toEqual({ lbs: 2, cf: 0.2 });
    expect(hiddenCapacity("suitcase")).toBeNull();
  });

  it("puts a mule's HT roll at -1 per 50 pellets", () => {
    expect(muleModifier(49)).toBe(0);
    expect(muleModifier(50)).toBe(-1);
    expect(muleModifier(150)).toBe(-3);
  });

  it("bursts a packet only on a critical failure", () => {
    expect(muleOutcome({ success: true })).toBe("safe");
    expect(muleOutcome({ success: false })).toBe("incident");
    expect(muleOutcome({ success: false, criticalFailure: true })).toBe("burst");
  });

  it("doses a burst packet as the Basic Set's overdose", () => {
    expect(BURST_PACKET).toMatchObject({ resistanceModifier: -4, damage: "toxic", dice: 0, adds: 1, intervalSeconds: 900, cycles: 24 });
  });
});

describe("code-breaking programs and encryption gear (p. 211)", () => {
  it("gives the programs their Complexity, and the computer the higher of the program's and the standard's", () => {
    expect(programComplexity("Basic Code-Breaking Program (TL7)")).toBe(3);
    expect(programComplexity("Basic Code-Breaking Program (TL8)")).toBe(3);
    expect(programComplexity("Good Code-Breaking Program")).toBe(5);
    expect(programComplexity("Fine Code-Breaking Program")).toBe(7);
    expect(programComplexity("Small Computer")).toBeNull();
    expect(computerNeeded(3, 5)).toBe(5);
    expect(computerNeeded(5, 3)).toBe(5);
    expect(computerNeeded(3, null)).toBe(3);
  });

  it("reads the encryption gear's code from its record", () => {
    expect(encryptionGearByName("Cipher Wheel")).toEqual({ code: "manual" });
    expect(encryptionGearByName("Cipher Machine")).toEqual({ code: "basic6" });
    expect(encryptionGearByName("Basic Encryption (TL7)")).toEqual({ code: "basic7" });
    expect(encryptionGearByName("Basic Encryption Unit")).toEqual({ code: "basic8" });
    expect(encryptionGearByName("Secure Encryption (TL7)")).toEqual({ code: "secure7", complexity: 2 });
    expect(encryptionGearByName("Secure Encryption (TL8)")).toEqual({ code: "secure8" });
    expect(encryptionGearByName("Secure Encryption Unit")).toEqual({ code: "secure8" });
    expect(encryptionGearByName("Basic Encryption (TL6)")).toBeNull();
  });
});
