import { describe, expect, it } from "vitest";

import {
  CURTAINS,
  IMPROVISED_WHITE_NOISE,
  ISOLATOR,
  SPREAD_SPECTRUM,
  WHITE_NOISE,
  emissionsPenalty,
  isJunctionDetector,
  isLaserMike,
  isLockInAmplifier,
  isWhiteNoiseGenerator,
  junctionOutcome,
  keylogMinutes,
  laserNoise,
  lockInBonus,
  rfidPenalty,
} from "./rules.js";

describe("the supplement's covert listening figures (HT:EE pp. 44-45)", () => {
  it("gives the sweep and eavesdropping penalties with their signs", () => {
    expect(SPREAD_SPECTRUM).toBe(-5);
    expect(ISOLATOR).toBe(-2);
    expect(WHITE_NOISE).toBe(-4);
    expect(IMPROVISED_WHITE_NOISE).toBe(-2);
    expect(CURTAINS).toBe(-2);
  });

  it("gives the lock-in amplifier +6, the digital TL8 one +10", () => {
    expect(lockInBonus(7)).toBe(6);
    expect(lockInBonus(8)).toBe(10);
  });

  it("costs a TL7 laser mike -1 to -4 for noise, and a TL8 one nothing (High-Tech p. 208)", () => {
    expect(laserNoise(0, 7)).toBe(0);
    expect(laserNoise(3, 7)).toBe(-3);
    expect(laserNoise(9, 7)).toBe(-4);
    expect(laserNoise(3, 8)).toBe(0);
  });

  it("takes a stray object for a bug on a failure by 4 or more, or a critical failure", () => {
    expect(junctionOutcome({ success: true, margin: 0 })).toBe("found");
    expect(junctionOutcome({ success: false, margin: -3 })).toBe("missed");
    expect(junctionOutcome({ success: false, margin: -4 })).toBe("falsePositive");
    expect(junctionOutcome({ success: false, margin: -1, criticalFailure: true })).toBe("falsePositive");
  });

  it("reads emissions free to 300 yards, then -1 per 100 yards or part", () => {
    expect(emissionsPenalty(300)).toBe(0);
    expect(emissionsPenalty(301)).toBe(-1);
    expect(emissionsPenalty(400)).toBe(-1);
    expect(emissionsPenalty(401)).toBe(-2);
  });

  it("times the keylogging sample from the typist's Typing (p. B228)", () => {
    // Typing 12 on a keyboard is 60 words a minute; 200 words take 4 minutes.
    expect(keylogMinutes(12)).toBe(4);
    // On a manual, 36 words a minute: 6 minutes.
    expect(keylogMinutes(12, true)).toBe(6);
    expect(keylogMinutes(0)).toBeNull();
  });

  it("captures an RFID chip at -2, and -1 per full yard", () => {
    expect(rfidPenalty(0)).toBe(-2);
    expect(rfidPenalty(0.9)).toBe(-2);
    expect(rfidPenalty(2.7)).toBe(-4);
  });

  it("knows the records by the names High-Tech and the supplement's capture give them", () => {
    expect(isLaserMike("Laser Mike")).toBe(true);
    expect(isLaserMike("Laser Microphone")).toBe(true);
    expect(isLaserMike("Laser Pinhead Mike")).toBe(false);
    expect(isWhiteNoiseGenerator("White Noise Generator (TL8)")).toBe(true);
    expect(isLockInAmplifier("Lock-In Amplifier (TL7)")).toBe(true);
    expect(isJunctionDetector("Nonlinear Junction Detector")).toBe(true);
  });
});
