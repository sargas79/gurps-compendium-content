import { describe, expect, it } from "vitest";

import {
  NO_LASER_OPTIONS,
  activeSetting,
  canDazzle,
  canPulse,
  laserOptionFactor,
  laserRow,
  laserSettings,
  pulseDivisor,
  visionResistBonus,
  weatherDr,
} from "./lasers.js";

const options = (patch = {}) => ({ ...NO_LASER_OPTIONS, ...patch });
const pistol = { damage: "3d", damageType: "burn", armorDivisor: 2, halfDamageRange: 200, maxRange: 600, explosive: false, affliction: false, afflictionAttribute: "", afflictionModifier: 0 };

describe("laser options (Ultra-Tech pp. 113-118)", () => {
  it("adds a tenth to the price for each of dazzle and blinding, and doubles it for a pulse-beam laser", () => {
    expect(laserOptionFactor(options())).toBe(1);
    expect(laserOptionFactor(options({ dazzle: true, blinding: true }))).toBeCloseTo(1.2);
    expect(laserOptionFactor(options({ pulse: "pulseBeam" }))).toBe(2);
    expect(laserOptionFactor(options({ pulse: "pulse" }))).toBe(1);
  });

  it("offers the settings the laser was built with, and falls back to its first", () => {
    expect(laserSettings(options({ dazzle: true, pulse: "pulseBeam" }))).toEqual(["beam", "pulse", "dazzle"]);
    expect(laserSettings(options({ pulse: "pulse" }))).toEqual(["pulse"]);
    expect(activeSetting(options({ setting: "dazzle" }))).toBe("beam");
    expect(activeSetting(options({ pulse: "pulse", setting: "beam" }))).toBe("pulse");
  });

  it("keeps chemical and rainbow lasers out of pulse, and chemical lasers out of dazzle", () => {
    expect(canPulse("laser", "Laser Pistol")).toBe(true);
    expect(canPulse("laser", "Assault Laser")).toBe(false);
    expect(canPulse("rainbow", "Rainbow Laser Rifle")).toBe(false);
    expect(canDazzle("rainbow", "Rainbow Laser Rifle")).toBe(true);
    expect(canDazzle("laser", "Laser Sniper Rifle")).toBe(false);
    expect(canDazzle("blaster", "Blaster Pistol")).toBe(false);
  });

  it("fires a pulse crushing and explosive, a step down in divisor, at twice the range", () => {
    expect(laserRow("pulse", pistol)).toMatchObject({ damage: "3d", damageType: "cr", explosive: true, armorDivisor: 1, halfDamageRange: 400, maxRange: 1200 });
    expect(pulseDivisor(10)).toBe(5);
    expect(pulseDivisor(5)).toBe(3);
    expect(pulseDivisor(2)).toBe(1);
  });

  it("fires dazzle at HT-5 and blinding at HT-10, with no damage", () => {
    expect(laserRow("dazzle", pistol)).toMatchObject({ affliction: true, afflictionAttribute: "HT", afflictionModifier: -5, damage: "—", armorDivisor: 1 });
    expect(laserRow("blinding", pistol)).toMatchObject({ affliction: true, afflictionModifier: -10 });
    expect(laserRow("beam", pistol)).toBe(pistol);
  });
});

describe("eyes and weather", () => {
  it("gives +5 for Protected Vision and +1 a level for a Nictitating Membrane", () => {
    expect(visionResistBonus(["Protected Vision", "Nictitating Membrane 3"])).toBe(8);
    expect(visionResistBonus(["Nictitating Membrane"])).toBe(1);
    expect(visionResistBonus(["Acute Vision 2"])).toBe(0);
  });

  it("turns the vision penalty along the beam into DR", () => {
    expect(weatherDr(-30)).toBe(30);
    expect(weatherDr(10)).toBe(10);
    expect(weatherDr(0)).toBe(0);
  });
});
