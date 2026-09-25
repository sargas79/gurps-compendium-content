/**
 * The electronic battlefield's figures (HT:EE pp. 45-46), and the records
 * they are read from: every name the rule matches is in the merged packs, and
 * the UAVs and the military gear carry their fields.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { speedRangeModifier } from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { ACTIVE_SENSORS } from "../sensors/rules.js";
import {
  CAMERA_RECORDS,
  CHAFF_RECORD,
  MILITARY,
  SEISMIC_RECORD,
  UAV_RECORDS,
  aboveCeiling,
  cameraOf,
  cameraPenalty,
  chaffPenalty,
  droneOf,
  isDrone,
  militaryStatistics,
  seismicModifiers,
  withinControlRange,
} from "./rules.js";

const PACKS = join(import.meta.dirname, "../../../../books/high-tech/packs-src/equipment");
const records: any[] = readdirSync(PACKS).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(PACKS, f), "utf8")));
const byName = (name: string) => records.filter((r) => r.name === name);

describe("military gear (HT:EE p. 45)", () => {
  it("is HT 12 and DR 8, save what the record states", () => {
    expect(MILITARY).toEqual({ ht: 12, dr: 8 });
    expect(militaryStatistics({ ht: null, dr: null })).toEqual({ ht: 12, dr: 8 });
    expect(militaryStatistics({ ht: 14, dr: null })).toEqual({ ht: 14, dr: 8 });
  });
});

describe("surveillance cameras (HT:EE p. 45)", () => {
  it("puts Observation at -4 (TL7) and -2 (TL8), and pan/tilt/zoom at -2 and none", () => {
    const tl7 = cameraOf("Video Surveillance Camera (TL7)")!;
    const tl8 = cameraOf("video surveillance camera (tl8)")!;
    expect([cameraPenalty(tl7, false), cameraPenalty(tl7, true)]).toEqual([-4, -2]);
    expect([cameraPenalty(tl8, false), cameraPenalty(tl8, true)]).toEqual([-2, 0]);
    expect(cameraOf("Thermal-Imaging Surveillance Camera")).toBeNull();
  });
});

describe("the seismic ground sensor (HT:EE p. 45)", () => {
  it("takes the source's SM and speed as bonuses and the range as a penalty, off the Size and Speed/Range Table", () => {
    // A man walking (SM 0, 2 yards/second) 50 yards off: 0, 0, -8.
    expect(seismicModifiers({ sm: 0, speed: 2, range: 50 }, speedRangeModifier)).toEqual([{ key: "range", value: -8 }]);
    // A truck (SM +3) at 10 yards/second, 200 yards off: +3, +4, -12.
    expect(seismicModifiers({ sm: 3, speed: 10, range: 200 }, speedRangeModifier)).toEqual([
      { key: "size", value: 3 },
      { key: "speed", value: 4 },
      { key: "range", value: -12 },
    ]);
  });
});

describe("chaff (HT:EE p. 45)", () => {
  it("gives -2 per package", () => {
    expect(chaffPenalty(1)).toBe(-2);
    expect(chaffPenalty(3)).toBe(-6);
    expect(chaffPenalty(0)).toBe(0);
  });
});

describe("reconnaissance drones (HT:EE p. 46)", () => {
  it("reads a drone's data with nothing missing", () => {
    expect(droneOf(undefined)).toEqual({ autopilot: 0, autopilotDodge: 0, remoteBonus: 0, controlRangeMiles: 0, ceilingFeet: 0, spreadSpectrum: false });
    expect(droneOf({ spreadSpectrum: true }).spreadSpectrum).toBe(true);
    expect(isDrone(droneOf(undefined))).toBe(false);
    expect(isDrone(droneOf({ controlRangeMiles: 4 }))).toBe(true);
  });

  it("checks the controller's range and the ceiling, counting what the map can't say as fine", () => {
    const phantom = UAV_RECORDS["Phantom 4 Pro"]!;
    expect(withinControlRange(phantom, 4 * 1760)).toBe(true);
    expect(withinControlRange(phantom, 4 * 1760 + 1)).toBe(false);
    expect(withinControlRange(phantom, null)).toBe(true);
    expect(aboveCeiling(phantom, 1640)).toBe(false);
    expect(aboveCeiling(phantom, 1641)).toBe(true);
    expect(aboveCeiling(droneOf({}), 99999)).toBe(false);
  });
});

describe("the records the rules read (#524)", () => {
  it("has every record name the rules match", () => {
    const names = [...CAMERA_RECORDS, SEISMIC_RECORD, CHAFF_RECORD, ...Object.keys(UAV_RECORDS), ...Object.entries(ACTIVE_SENSORS).filter(([, s]) => s.kind === "radar").map(([n]) => n)];
    for (const name of names) expect(byName(name), name).toHaveLength(1);
    for (const name of CAMERA_RECORDS) expect(cameraOf(name), name).not.toBeNull();
  });

  it("gives the two UAVs their drone fields, and no longer a line of figures in the description", () => {
    for (const [name, drone] of Object.entries(UAV_RECORDS)) {
      const record = byName(name)[0];
      expect(record.system.category).toBe("vehicle");
      expect(record.system.extensions[MODULE_ID].drone).toEqual(drone);
      expect(record.system.description).toBe("");
    }
    expect(byName("Phantom 4 Pro")[0].system.vehicle.skill).toBe("Piloting (Helicopter)");
    expect(byName("RQ-16A T-Hawk")[0].system.vehicle.skill).toBe("Piloting (Vertol)");
  });

  it("marks the supplement's military electronics, each HT 12 and DR 8", () => {
    const military = records.filter((r) => r.system?.extensions?.[MODULE_ID]?.device?.military === true);
    expect(military.map((r) => r.name).sort()).toEqual([
      "Impact Fuze (TL7)", "Impact Fuze (TL8)", "Laser Designator", "Proximity Fuze (TL7)", "Proximity Fuze (TL8)",
      "Seismic Ground Sensor", "Spectrum Analyzer (Digital)", "Time Fuze (TL7)", "Time Fuze (TL8)",
    ]);
    for (const r of military) expect([r.system.extensions[MODULE_ID].device.ht, r.system.extensions[MODULE_ID].device.dr]).toEqual([12, 8]);
  });
});
