import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAGNETIC_LOCKS,
  alarmDisableSkill,
  alarmOf,
  biometricOf,
  cutPowerOutcome,
  fenceAlarms,
  fenceOf,
  fenceStage,
  holdsOn,
  isDigitalStethoscope,
  keycardOf,
  magneticSize,
  securityFenceCost,
  supplementLock,
  supplementScreener,
} from "./rules.js";

describe("the supplement's electric security (HT:EE pp. 42-44)", () => {
  it("reads the fences, High-Tech's among them", () => {
    expect(fenceOf("Low-Voltage Fence (per mile)")).toBe("lowVoltage");
    expect(fenceOf("High-Voltage Fence (per 0.25 mile)")).toBe("stunLethal");
    expect(fenceOf("Cattle Fence (control box and 1/4 mile)")).toBe("cattle");
    expect(fenceOf("Lethal Fence (control box and 1/4 mile)")).toBe("lethal");
    expect(fenceOf("Laser Fence (TL8)")).toBeNull();
  });

  it("escalates a stun-lethal fence at the second touch only", () => {
    expect(fenceStage("stunLethal", "first")).toBe("low");
    expect(fenceStage("stunLethal", "second")).toBe("high");
    expect(fenceStage("lowVoltage", "second")).toBe("low");
  });

  it("holds on whoever a lethal current injures by more than 1 point (p. 9)", () => {
    expect(holdsOn(1)).toBe(false);
    expect(holdsOn(2)).toBe(true);
  });

  it("prices the security fence, free on a stun-lethal one, and sounds its alarm", () => {
    expect(securityFenceCost("lowVoltage")).toBe(100);
    expect(securityFenceCost("stunLethal")).toBe(0);
    expect(fenceAlarms("stunLethal", false)).toBe(true);
    expect(fenceAlarms("lowVoltage", false)).toBe(false);
    expect(fenceAlarms("lowVoltage", true)).toBe(true);
  });

  it("reads a magnetic lock's size in each form a record may take", () => {
    expect(magneticSize("Magnetic Lock (Micro)")).toBe("micro");
    expect(magneticSize("Magnetic Lock, Shear")).toBe("shear");
    expect(magneticSize("Mini Magnetic Lock")).toBe("mini");
    expect(magneticSize("Magnetic Lock")).toBe("standard");
    expect(magneticSize("Magnetic Lockpick")).toBeNull();
    expect(Object.values(MAGNETIC_LOCKS).map((s) => s.st)).toEqual([12, 18, 20, 24, 32]);
  });

  it("reads the keycard technologies and biometric kinds", () => {
    expect(keycardOf("Keycard Reader")).toBe("");
    expect(keycardOf("Keycard Reader (RFID)")).toBe("rfid");
    expect(keycardOf("Keycard Reader, Magnetic Stripe")).toBe("magnetic stripe");
    expect(keycardOf("Smart Card Keycard Reader")).toBe("smart card");
    expect(keycardOf("Card Table")).toBeNull();
    expect(biometricOf("Biometric Identification (Fingerprints)")).toBe("fingerprints");
    expect(biometricOf("Biometric Identification, Retinal Pattern")).toBe("retinal patterns");
    expect(biometricOf("Hand Geometry")).toBe("hand geometry");
    // High-Tech's verifiers stand for the supplement's, whose records overlap-ee.txt leaves out (E2).
    expect(biometricOf("Fingerprint Scanner")).toBe("fingerprints");
    expect(biometricOf("Voiceprint Analyzer")).toBe("voiceprint");
    expect(supplementLock("Signature Pad")).toBeNull();
  });

  it("gives each lock and screening record its kind, skill and switch", () => {
    expect(supplementLock("Key Switch")).toEqual({ kind: "lock", rule: "electricLocks" });
    expect(supplementLock("Magnetic Lock (Midi)")).toEqual({ kind: "electronic", rule: "electricLocks" });
    expect(supplementLock("Smart Lock")).toEqual({ kind: "electronic", rule: "electricLocks" });
    expect(supplementLock("Keycard Reader (Holepunched)")).toEqual({ kind: "electronic", rule: "alarmSystems" });
    expect(supplementLock("Biometric Identification (Signature)")).toEqual({ kind: "verifier", rule: "alarmSystems", skill: "Electronics Repair (Security)", forgery: -3 });
    expect(supplementLock("Biometric Identification (Voiceprint)")).toEqual({ kind: "verifier", rule: "alarmSystems", skill: "Electronics Repair (Security)" });
    expect(supplementLock("Lock, Tough")).toBeNull();
  });

  it("reads the alarms and how each is disabled", () => {
    expect(alarmOf("Electric Alarm (per portal)")).toEqual({ key: "electric", simple: true });
    expect(alarmOf("IR Motion Detector")).toEqual({ key: "infrared", yards: 25 });
    expect(alarmOf("Proximity Detector (per item)")).toEqual({ key: "proximity", yards: 1 });
    expect(alarmOf("Proximity Fence (per foot)")).toBeNull();
    expect(alarmOf("Photoelectric Beam")?.yards).toBe(3);
    expect(alarmDisableSkill(true)).toBe("Traps");
    expect(alarmDisableSkill(false)).toBe("Electronics Repair (Security)");
  });

  it("cuts an alarm's power only where it has none of its own, and a professional one goes off", () => {
    expect(cutPowerOutcome({ ownBatteries: true, professional: true })).toBe("noEffect");
    expect(cutPowerOutcome({ ownBatteries: false, professional: true })).toBe("alarm");
    expect(cutPowerOutcome({ ownBatteries: false, professional: false })).toBe("roll");
  });

  it("screens with a general-purpose metal detector improvised", () => {
    expect(supplementScreener("Security Metal Detector")).toBeNull();
    expect(supplementScreener("Metal Detector")).toEqual({ kind: "handheldMetal", operatorRoll: true });
    expect(supplementScreener("Metal Detector (TL6)")).toEqual({ kind: "handheldMetal", operatorRoll: true });
    expect(supplementScreener("Walkthrough Metal Detector (TL8)")).toBeNull();
  });
});

/**
 * Every record the rules read, by the name the supplement's catalogue (#480)
 * and High-Tech's give it, with what the rules make of it; and every record
 * of the packs the rules read is one of these.
 */
const RECORDS: Record<string, string> = {
  "Low-Voltage Fence (per mile)": "fence lowVoltage",
  "High-Voltage Fence (per 0.25 mile)": "fence stunLethal",
  "Cattle Fence (control box and 1/4 mile)": "fence cattle",
  "Lethal Fence (control box and 1/4 mile)": "fence lethal",
  "Key Switch": "lock lock electricLocks",
  "Electric Deadbolt": "lock electronic electricLocks",
  "Keypad Combination Lock": "lock electronic electricLocks",
  "Smart Lock": "lock electronic electricLocks",
  "Magnetic Lock (Micro)": "lock electronic electricLocks magnet micro",
  "Magnetic Lock (Mini)": "lock electronic electricLocks magnet mini",
  "Magnetic Lock (Midi)": "lock electronic electricLocks magnet midi",
  "Magnetic Lock (Standard)": "lock electronic electricLocks magnet standard",
  "Magnetic Lock (Shear)": "lock electronic electricLocks magnet shear",
  "Keycard Reader (Optical Barcode)": "lock electronic alarmSystems keycard optical barcode",
  "Keycard Reader (Magnetic Stripe)": "lock electronic alarmSystems keycard magnetic stripe",
  "Keycard Reader (Holepunched)": "lock electronic alarmSystems keycard holepunched",
  "Keycard Reader (RFID)": "lock electronic alarmSystems keycard rfid",
  "Keycard Reader (Smart Card)": "lock electronic alarmSystems keycard smart card",
  "Biometric Identification (Hand Geometry)": "lock verifier alarmSystems biometric hand geometry",
  "Biometric Identification (Fingerprints)": "lock verifier alarmSystems biometric fingerprints",
  "Biometric Identification (Facial Recognition)": "lock verifier alarmSystems biometric facial recognition",
  "Signature Pad": "biometric signature",
  "Voiceprint Analyzer": "biometric voiceprint",
  "Retinal Scanner": "biometric retinal patterns",
  "Fingerprint Scanner": "biometric fingerprints",
  "Metal Detector": "screener",
  "Metal Detector (TL6)": "screener",
  "Metal Detector (TL8)": "screener",
  "Electric Alarm": "alarm electric",
  "Electric Alarm (per portal)": "alarm electric",
  "Pressure Mat (per square foot)": "alarm pressureMat",
  "Ultrasonic Alarm": "alarm ultrasonic",
  "Car Alarm": "alarm car",
  "Photoelectric Beam (per beam)": "alarm photoelectric",
  "Infrasonic Alarm": "alarm infrasonic",
  "IR Motion Detector": "alarm infrared",
  "Proximity Detector (per item)": "alarm proximity",
  "Digital Stethoscope": "stethoscope",
};

/** What the rules make of a name. */
function reading(name: string): string {
  const parts: string[] = [];
  const fence = fenceOf(name);
  if (fence) parts.push(`fence ${fence}`);
  const lock = supplementLock(name);
  if (lock) parts.push(`lock ${lock.kind} ${lock.rule}`);
  const size = magneticSize(name);
  if (size) parts.push(`magnet ${size}`);
  const keycard = keycardOf(name);
  if (keycard) parts.push(`keycard ${keycard}`);
  const biometric = biometricOf(name);
  if (biometric) parts.push(`biometric ${biometric}`);
  if (supplementScreener(name)) parts.push("screener");
  const alarm = alarmOf(name);
  if (alarm) parts.push(`alarm ${alarm.key}`);
  if (isDigitalStethoscope(name)) parts.push("stethoscope");
  return parts.join(" ");
}

describe("the records the rules read (#480, E2)", () => {
  const dir = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
  const names = new Set(readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => (JSON.parse(readFileSync(join(dir, f), "utf8")) as Array<{ name: string }>).map((d) => d.name)));

  it("names each one as a record of the book's packs", () => {
    expect(Object.keys(RECORDS).filter((name) => !names.has(name))).toEqual([]);
  });

  it("reads each one as the rules mean it", () => {
    expect(Object.fromEntries(Object.keys(RECORDS).map((name) => [name, reading(name)]))).toEqual(RECORDS);
  });

  it("reads no other record of the packs", () => {
    expect([...names].filter((name) => reading(name) && !(name in RECORDS))).toEqual([]);
  });
});
