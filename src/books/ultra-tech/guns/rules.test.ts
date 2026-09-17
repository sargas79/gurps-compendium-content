import { describe, expect, it } from "vitest";

import {
  backblast,
  etcCell,
  gyrocDivisor,
  homingCost,
  homingRefusal,
  homingSense,
  homingSkill,
  isAirGun,
  isConventional,
  isElectromagnetic,
  isGyroc,
  launcherByName,
  multiplyDamage,
  smartGrenadeCost,
  velocityEffect,
  vortexBounce,
} from "./rules.js";

describe("slugthrowers (Ultra-Tech pp. 135-141)", () => {
  it("tells the kinds of gun apart by name", () => {
    expect(isConventional("Assault Carbine, 7mmCL")).toBe(true);
    expect(isConventional("Heavy Pistol, 10mmCLP")).toBe(true);
    expect(isConventional("Civilian Shotgun, 18.5mmPC")).toBe(true);
    expect(isConventional("Gauss Rifle, 4mm")).toBe(false);
    expect(isElectromagnetic("Gauss Rifle, 4mm")).toBe(true);
    expect(isElectromagnetic("EMGL, 40mmG")).toBe(true);
    expect(isElectromagnetic("Grav Needler")).toBe(false);
    expect(isAirGun("Needler, 3mmN")).toBe(true);
    expect(isAirGun("Gauss Needler, 3mm")).toBe(false);
    expect(isAirGun("Partisan Needler, 3mmN")).toBe(false);
    expect(isGyroc("Gyroc Carbine, 15mm")).toBe(true);
  });

  it("multiplies damage by its average", () => {
    expect(multiplyDamage("3d", 1.5)).toBe("4d+2");
    expect(multiplyDamage("4d+2", 1.5)).toBe("6d+3");
    expect(multiplyDamage("2d", 0.5)).toBe("1d");
    expect(multiplyDamage("HT-5", 1.5)).toBe("HT-5");
  });

  it("puts an ETC gun's cell in its grip by the gun", () => {
    expect(etcCell("Guns (Pistol)")).toBe("A");
    expect(etcCell("Guns (Rifle)")).toBe("B");
    expect(etcCell("Guns (SMG)")).toBe("B");
    expect(etcCell("Gunner (Machine Gun)")).toBe("C");
  });

  it("boosts or lowers the velocity", () => {
    expect(velocityEffect("boosted")).toMatchObject({ perDie: 1, rangeFactor: 1.3, propellant: 1.5 });
    expect(velocityEffect("low")).toMatchObject({ damageFactor: 0.5, rangeFactor: 0.5, hearing: -3, propellant: 0.25 });
    expect(velocityEffect("standard").damageFactor).toBe(1);
  });
});

describe("gyrocs and missiles (Ultra-Tech pp. 144-145)", () => {
  it("cuts a gyroc's damage at short range", () => {
    expect(gyrocDivisor(1)).toBe(3);
    expect(gyrocDivisor(2)).toBe(3);
    expect(gyrocDivisor(3)).toBe(2);
    expect(gyrocDivisor(10)).toBe(2);
    expect(gyrocDivisor(11)).toBe(1);
    expect(gyrocDivisor(null)).toBe(1);
  });

  it("knows the launchers and their backblast", () => {
    expect(launcherByName("IML, 64mm (TL 9)")).toBe("iml");
    expect(launcherByName("MLAWS, 64mm (TL10)")).toBe("mlaws");
    expect(launcherByName("TML, 100mm (TL 9)")).toBe("tml");
    expect(launcherByName("Gyroc Carbine, 15mm")).toBe(null);
    expect(backblast("iml")).toEqual({ damage: "2d", yards: 2 });
    expect(backblast("tml")).toEqual({ damage: "4d", yards: 3 });
  });
});

describe("homing projectiles (Ultra-Tech p. 146)", () => {
  it("fits a seeker by calibre and TL", () => {
    expect(homingRefusal("infrared", 15, 9)).toBe(null);
    expect(homingRefusal("infrared", 10, 9)).toBe("tooSmall");
    expect(homingRefusal("infrared", 10, 10)).toBe(null);
    expect(homingRefusal("infrared", 3, 12)).toBe(null);
    expect(homingRefusal("multispectral", 25, 9)).toBe("tooSmall");
    expect(homingRefusal("multispectral", 25, 10)).toBe(null);
    expect(homingRefusal("multiscanner", 15, 10)).toBe("tl");
    expect(homingRefusal("multiscanner", 15, 11)).toBe(null);
  });

  it("gives its skill, cost and sense", () => {
    expect(homingSkill("infrared", 9)).toBe(13);
    expect(homingSkill("infrared", 11)).toBe(15);
    expect(homingSkill("multispectral", 10)).toBe(15);
    expect(homingSkill("multiscanner", 12)).toBe(13);
    expect(homingCost("infrared")).toBe(4);
    expect(homingCost("multispectral")).toBe(10);
    expect(homingSense("multispectral", "antiRadiation")).toBe("radarAndRadio");
    expect(homingSense("infrared")).toBe("infravision");
  });
});

describe("grenades and vortex rings (Ultra-Tech pp. 134, 146-147)", () => {
  it("charges for a smart grenade only at TL9", () => {
    expect(smartGrenadeCost(9)).toBe(100);
    expect(smartGrenadeCost(10)).toBe(0);
  });

  it("bounces a vortex ring as the book's example does", () => {
    expect(vortexBounce(4, 30)).toEqual({ penalty: -8, range: 18 });
    expect(vortexBounce(0, 30)).toEqual({ penalty: 0, range: 30 });
  });
});

describe("a seeker's roll tags (#329)", () => {
  it("names the sense the round homes with", async () => {
    const { homingSense, seekerTags } = await import("./rules.js");
    expect(seekerTags(homingSense("infrared"))).toEqual(["infrared"]);
    expect(seekerTags(homingSense("multispectral", "active"))).toEqual(["radar", "imagingRadar"]);
    expect(seekerTags(homingSense("multispectral"))).toEqual(["hyperspectral"]);
  });
});
