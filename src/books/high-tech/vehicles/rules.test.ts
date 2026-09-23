import { describe, expect, it } from "vitest";

import { shapedArmourMultiplier } from "../../../shared/vehicles/rules.js";
import {
  HT_SHAPED_ARMOUR,
  HT_VEHICLES,
  armourKindAt,
  chargeOf,
  ctisCopes,
  extinguishTarget,
  fitWith,
  fitsGunPort,
  flatTyres,
  gunPortPenalty,
  linkedRateOfFire,
  rideFatigue,
  combatFatigue,
  rivetsMayFly,
  runFlatMiles,
  runFlatMove,
  searchlightRadius,
  skirtsAt,
  soundBaffling,
  tankHearing,
  turretReadies,
} from "./rules.js";

describe("vehicle components (High-Tech pp. 228-229)", () => {
  it("lets a gun port take a weapon no bulkier than -5, and puts the shooter at -4 to -7", () => {
    expect(fitsGunPort(-5)).toBe(true);
    expect(fitsGunPort(-6)).toBe(false);
    expect(gunPortPenalty(undefined)).toBe(-7);
    expect(gunPortPenalty(-5)).toBe(-5);
    expect(gunPortPenalty(-2)).toBe(-4);
    expect(gunPortPenalty(-9)).toBe(-7);
  });

  it("lights two yards of radius a mile, turns a turret by facings, and links RoF", () => {
    expect(searchlightRadius(0.25)).toBe(0.5);
    expect(searchlightRadius(3)).toBe(6);
    expect(turretReadies(3, 60)).toBe(3);
    expect(turretReadies(3, 120)).toBe(6);
    expect(turretReadies(2, 180)).toBe(6);
    expect(turretReadies(2, 30)).toBe(2);
    expect(linkedRateOfFire(20, 20)).toBe(40);
  });

  it("baffles sound by TL-4", () => {
    expect(soundBaffling(7)).toBe(-3);
    expect(soundBaffling(8)).toBe(-4);
  });
});

describe("protection (High-Tech pp. 229, 235)", () => {
  it("puts a fire out on TL+2, or TL+4 with suppression", () => {
    expect(extinguishTarget(6, false)).toBe(8);
    expect(extinguishTarget(7, true)).toBe(11);
  });

  it("runs on flat run-flats at Move less 20% for TL squared miles, and lets CTIS cope with two or three", () => {
    expect(runFlatMove(28)).toBe(22.4);
    expect(runFlatMiles(8)).toBe(64);
    expect(ctisCopes(2, 4)).toBe(true);
    expect(ctisCopes(3, 6)).toBe(false);
    expect(ctisCopes(3, 8)).toBe(true);
    expect(flatTyres({ runFlat: true }, 1, 4)).toBe("runFlat");
    expect(flatTyres({ ctis: true }, 2, 4)).toBe("ctis");
    expect(flatTyres({ ctis: true }, 3, 4)).toBe("flat");
    expect(flatTyres({}, 0, 4)).toBe("none");
  });

  it("multiplies DR by 1.5 for spaced armour and 2 for laminated, from the shared engine's table", () => {
    expect(shapedArmourMultiplier(HT_SHAPED_ARMOUR, "spaced")).toBe(1.5);
    expect(shapedArmourMultiplier(HT_SHAPED_ARMOUR, "laminated")).toBe(2);
    expect(shapedArmourMultiplier(HT_SHAPED_ARMOUR, "")).toBe(1);
  });

  it("puts the T-72A's early laminate on its hull and turret fronts only (p. 244)", () => {
    const t72 = HT_VEHICLES["Uralvagonzavod T-72A"]!;
    expect(armourKindAt(t72, "mainTurret", "front")).toBe("spaced");
    expect(armourKindAt(t72, "body", null)).toBe("spaced");
    expect(armourKindAt(t72, "mainTurret", "side")).toBe("");
    expect(armourKindAt(t72, "body", "top")).toBe("");
  });

  it("gives the Panzer IV skirts on its sides that work as spaced armour (p. 239)", () => {
    const panzer = HT_VEHICLES["Krupp Panzer IV Ausf H"]!;
    expect(skirtsAt(panzer, "body", "side").map((s) => s.dr)).toEqual([10]);
    expect(skirtsAt(panzer, "mainTurret", "side").map((s) => s.dr)).toEqual([15]);
    expect(skirtsAt(panzer, "body", "rear")).toEqual([]);
    expect(armourKindAt(panzer, "track", "side")).toBe("spaced");
    expect(armourKindAt(panzer, "body", "front")).toBe("");
  });

  it("tells a shaped charge and HESH from a load, a name or a (10) crushing line", () => {
    expect(chargeOf({ projectile: "heat" })).toBe("shaped");
    expect(chargeOf({ projectile: "hedp" })).toBe("shaped");
    expect(chargeOf({ projectile: "hesh" })).toBe("hesh");
    expect(chargeOf({ names: ["Carl Gustav M2", "HEAT"] })).toBe("shaped");
    expect(chargeOf({ names: ["L7A1", "HESH"] })).toBe("hesh");
    expect(chargeOf({ damageType: "cr", armorDivisor: 10 })).toBe("shaped");
    expect(chargeOf({ damageType: "cr", armorDivisor: 10, explosive: false })).toBeNull();
    expect(chargeOf({ damageType: "pi++", armorDivisor: 2 })).toBeNull();
  });

  it("sends rivets flying from 20 or more that didn't get through", () => {
    expect(rivetsMayFly(20, 0)).toBe(true);
    expect(rivetsMayFly(19, 0)).toBe(false);
    expect(rivetsMayFly(40, 1)).toBe(false);
  });

  it("fits a vehicle with what the GM adds to its record", () => {
    const fit = fitWith(HT_VEHICLES["Renault FT17"]!, ["intercom", "spaced"]);
    expect(fit).toMatchObject({ riveted: true, intercom: true, spaced: [{ part: "all" }] });
    expect(armourKindAt(fit, "mainTurret", "top")).toBe("spaced");
  });
});

describe("crew (High-Tech pp. 234-235)", () => {
  it("costs 1 FP an hour riding, none head out, and 1 FP every 10 minutes fighting", () => {
    expect(rideFatigue(3, false)).toBe(3);
    expect(rideFatigue(3, true)).toBe(0);
    expect(combatFatigue(599)).toBe(0);
    expect(combatFatigue(1200)).toBe(2);
  });

  it("hears the crew at -4 and outside at -10 with the motor running", () => {
    expect(tankHearing({ motorRunning: true, intercom: false, outside: false })).toBe(-4);
    expect(tankHearing({ motorRunning: true, intercom: true, outside: false })).toBe(0);
    expect(tankHearing({ motorRunning: false, intercom: false, outside: false })).toBe(0);
    expect(tankHearing({ motorRunning: true, intercom: true, outside: true })).toBe(-10);
    expect(tankHearing({ motorRunning: false, intercom: false, outside: true })).toBe(-3);
  });
});
