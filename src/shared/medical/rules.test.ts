import { afterEach, describe, expect, it } from "vitest";

import { MODULE_ID } from "../module.js";
import { MEDICAL_TABLES, bestLine, deviceFor, deviceIn, deviceSkill, type Device } from "./rules.js";

const automed: Device = { tl: 9, skills: { firstAid: 13, surgery: 13 }, perTl: 2 };
const aed: Device = { tl: 8, skills: { resuscitation: 12 }, perTl: 0 };
const item = (name: string, book: string | null, tl = "8") => ({ name, system: { tl }, flags: book ? { [MODULE_ID]: { book } } : {} });

afterEach(() => MEDICAL_TABLES.clear());

describe("medical devices, one table per book", () => {
  it("finds a device by name and gives its skill by TL", () => {
    const devices = [[/^automed$/i, automed]] as const;
    expect(deviceIn(devices, " Automed ")).toBe(automed);
    expect(deviceIn(devices, "Automed Mk II")).toBeNull();
    expect(deviceIn(null, "Automed")).toBeNull();
    expect(deviceSkill(automed, "surgery", 11)).toBe(17);
    expect(deviceSkill(automed, "diagnosis", 11)).toBeNull();
  });

  it("takes an item's own book's table, only while that book's switch is on", () => {
    let highTech = true;
    let ultraTech = false;
    MEDICAL_TABLES.register({ book: "ultra-tech", tls: { min: 9, max: 12 }, on: () => ultraTech, devices: [[/^automed$/i, automed]] });
    MEDICAL_TABLES.register({ book: "high-tech", tls: { min: 0, max: 8 }, on: () => highTech, devices: [[/^automatic external defibrillator\b/i, aed]] });
    expect(deviceFor(item("Automatic External Defibrillator (AED)", "high-tech"))).toBe(aed);
    expect(deviceFor(item("Automed", "ultra-tech", "9"))).toBeNull();
    ultraTech = true;
    highTech = false;
    expect(deviceFor(item("Automed", "ultra-tech", "9"))).toBe(automed);
    expect(deviceFor(item("Automatic External Defibrillator (AED)", "high-tech"))).toBeNull();
    // One made by hand takes the switched-on book's table that covers its TL.
    expect(deviceFor(item("Automed", null, "10"))).toBe(automed);
  });

  it("counts only the best of several equipment lines", () => {
    expect(bestLine([])).toBeNull();
    expect(bestLine([{ label: "a", value: 1 }, { label: "b", value: 3 }, { label: "c", value: 3 }])).toEqual({ label: "b", value: 3 });
  });
});
