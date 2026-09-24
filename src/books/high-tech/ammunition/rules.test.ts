import { describe, expect, it } from "vitest";

import { CALIBRES, calibreClassOf, calibreRowOf, gunCalibreRows } from "./calibres.js";
import {
  adjustDamage,
  allowedUpgrades,
  ammunitionClass,
  areaKnowledgeDiscount,
  batchTime,
  bulkDiscount,
  chambering,
  conversionsFor,
  discounted,
  misloadResult,
  nearRounds,
  perShot,
  upgradeMultiples,
  upgradeRefusal,
  upgradedRow,
  type GunFacts,
} from "./rules.js";

const row = (name: string) => calibreRowOf(name)!;
const gun = (calibre: string | null, patch: Partial<GunFacts> = {}): GunFacts => ({
  calibre: calibre ? row(calibre) : null, tl: 8, automatic: false, cheap: false, skill: "Guns (Rifle)", ammunition: "", ...patch,
});
const figures = (patch: Partial<Parameters<typeof upgradedRow>[0]> = {}) => ({ damage: "7d", halfDamageRange: 1000, maxRange: 4000, accuracy: 6, malfunction: 17, minSt: 10, ...patch });

describe("the calibre a gun's name gives (pp. 175-177)", () => {
  it("reads the book's short forms of a calibre", () => {
    expect(gunCalibreRows("12G 2.75''").map((r) => r.name)).toEqual(["12-gauge 2.75” (18.5×70mmR)", "12-gauge 2.75” (18.5×70mmR)"]);
    expect(calibreRowOf("S&W Model 34 Kit Gun, .22 LR")?.name).toBe(".22 Long Rifle (5.7×16mmR)");
    expect(calibreRowOf("H&H Royal Double-Express, .600 NE")?.cps).toBe(20);
    expect(calibreRowOf("Martini-Henry Mk I, .450 MH")?.name).toBe(".450 Martini-Henry (11.43×59mmR)");
    expect(calibreRowOf("Tower Blunderbuss, 11G Flintlock")?.notes).toContain("powderAndShot");
    expect(calibreRowOf("Glock 17, 9x19mm")?.name).toBe("9×19mm Parabellum");
  });

  it("finds a calibre two tables print in the gun's own table (#433)", () => {
    // ".75 Flintlock" is the Rigby pistol's (p. 176) and the Brown Bess musket's (p. 177).
    expect(calibreRowOf("Brown Bess, .75 Flintlock", "Guns (Musket)")?.name).toBe(".75 Flintlock (Brown Bess)");
    expect(calibreRowOf("Rigby Traveling Pistol, .75 Flintlock", "Guns (Pistol)")?.name).toBe(".75 Flintlock (Rigby)");
    expect(calibreRowOf("Kentucky Rifle, .45 Flintlock", "Guns (Rifle)")?.name).toBe(".45 Flintlock (Kentucky)");
    expect(calibreRowOf("North West Gun, .50 Flintlock", "Guns (Musket)")?.name).toBe(".50 Flintlock (North West)");
    expect(calibreRowOf("Collier, .50 Flintlock", "Guns (Pistol)")?.name).toBe(".50 Flintlock (Collier)");
    // Without a skill, the maker the name holds decides; with neither, the first row.
    expect(calibreRowOf("Brown Bess, .75 Flintlock")?.name).toBe(".75 Flintlock (Brown Bess)");
    expect(calibreRowOf("Rigby Traveling Pistol, .75 Flintlock")?.name).toBe(".75 Flintlock (Rigby)");
    expect(calibreRowOf(".75 Flintlock")?.name).toBe(".75 Flintlock (Rigby)");
    // A skill whose table doesn't print the calibre leaves the rows as they are.
    expect(calibreRowOf("Glock 17, 9x19mm", "Guns (Rifle)")?.name).toBe("9×19mm Parabellum");
  });

  it("reads the table a gun's rounds are in from its skill", () => {
    expect(calibreClassOf("Guns (Pistol)")).toBe("handgun");
    expect(calibreClassOf("Guns Sport (Pistol)")).toBe("handgun");
    expect(calibreClassOf("Guns (Submachine Gun)")).toBe("handgun");
    expect(calibreClassOf("Guns (Musket)")).toBe("rifle");
    expect(calibreClassOf("Gunner (Machine Gun)")).toBe("rifle");
    expect(calibreClassOf("Guns (Shotgun)")).toBe("shotgun");
    expect(calibreClassOf("Guns (Grenade Launcher)")).toBe("grenadeLauncher");
    expect(calibreClassOf("Throwing")).toBeNull();
  });

  it("gives each round its class", () => {
    expect(ammunitionClass(row(".75 Flintlock"))).toBe("powderAndShot");
    expect(ammunitionClass(row("9x19mm"))).toBe("cased");
    expect(ammunitionClass(row("15.43x54mm"))).toBe("consumable");
    expect(ammunitionClass(row("4.73x33mm"))).toBe("caseless");
    expect(ammunitionClass(null)).toBeNull();
  });
});

describe("Adjusting Damage (p. 166)", () => {
  it("works the book's examples", () => {
    // A Kentucky rifle's 4d-1 made extra-powerful: 14.3 points, 4.09 dice, 4d.
    expect(adjustDamage("4d-1", 1.1)).toBe("4d");
    // APDSDU: 6d+2 x1.5 is 34.5 points, 9.86 dice, 10d.
    expect(adjustDamage("6d+2", 1.5)).toBe("10d");
  });

  it("keeps fractions of plain dice, reads the remainder by the book's bands, and runs into 6d multiples past 12 dice", () => {
    expect(adjustDamage("3d", 1.1)).toBe("3d+1"); // 3.3
    expect(adjustDamage("3d", 1.5)).toBe("4d+2"); // 4.5
    expect(adjustDamage("3d", 0.9)).toBe("3d-1"); // 2.7
    expect(adjustDamage("1d", 0.3)).toBe("1d-5");
    expect(adjustDamage("1d", 0.5)).toBe("1d-3");
    expect(adjustDamage("10d", 2)).toBe("6dx3");
    expect(adjustDamage("4d-1", 1)).toBe("4d-1");
    expect(adjustDamage("spec.", 1.1)).toBe("spec.");
  });
});

describe("the ammunition upgrades (pp. 163-165)", () => {
  it("makes a TL5 gun extra-powerful: Dmg, Range and ST x1.1 and -1 Malf.", () => {
    const kentucky = gun(".45 Flintlock", { tl: 5 });
    const out = upgradedRow({ damage: "4d-1", halfDamageRange: 110, maxRange: 1200, accuracy: 3, malfunction: 16, minSt: 9 }, ["extraPowerful"], kentucky, { baseAccuracy: 3 });
    expect(out.row).toEqual({ damage: "4d", halfDamageRange: 121, maxRange: 1320, accuracy: 3, malfunction: 15, minSt: 10 });
    expect(out.notes).toContain("extraPowerfulPowder");
    // A good TL8 gun takes it in its stride; a cheap one doesn't.
    expect(upgradedRow(figures(), ["extraPowerful"], gun("5.56x45mm"), { baseAccuracy: 6 }).row.malfunction).toBe(17);
    expect(upgradedRow(figures(), ["extraPowerful"], gun("5.56x45mm", { cheap: true }), { baseAccuracy: 6 }).row.malfunction).toBe(16);
  });

  it("gives match-grade Acc x1.25 at most +1, and a perfect handloaded match x1.5 at most +2", () => {
    // A Glock 23's Acc 2 gains nothing; an AWM's 6 becomes 7, or 8 for a perfect match (pp. 165, 174).
    expect(upgradedRow(figures({ accuracy: 2 }), ["matchGrade"], gun(".40 S&W"), { baseAccuracy: 2 }).row.accuracy).toBe(2);
    expect(upgradedRow(figures(), ["matchGrade"], gun(".338 Lapua Magnum"), { baseAccuracy: 6 }).row.accuracy).toBe(7);
    expect(upgradedRow(figures(), ["matchGrade"], gun(".338 Lapua Magnum"), { baseAccuracy: 6, matched: true }).row.accuracy).toBe(8);
    // Multiplied from the gun's own Acc, on top of whatever else the row already has.
    expect(upgradedRow(figures({ accuracy: 8 }), ["matchGrade"], gun(".338 Lapua Magnum"), { baseAccuracy: 6 }).row.accuracy).toBe(9);
  });

  it("makes subsonic pistol rounds quieter and shorter-ranged, and rifle rounds weaker too", () => {
    const pistol = upgradedRow(figures({ damage: "2d+2", halfDamageRange: 160, maxRange: 1900 }), ["subsonic"], gun("9x19mm", { skill: "Guns (Pistol)" }), { baseAccuracy: 2 });
    expect(pistol).toMatchObject({ hearing: -1, row: { damage: "2d+2", halfDamageRange: 128, maxRange: 1520 } });
    const rifle = upgradedRow(figures({ damage: "5d", halfDamageRange: 500, maxRange: 3500 }), ["subsonic"], gun("5.56x45mm"), { baseAccuracy: 5 });
    expect(rifle).toMatchObject({ hearing: -2, row: { damage: "3d", halfDamageRange: 300, maxRange: 2100 } });
    // A PDW round is treated as a rifle's.
    expect(upgradedRow(figures(), ["subsonic"], gun("4.6x30mm", { skill: "Guns (SMG)" }), { baseAccuracy: 3 }).hearing).toBe(-2);
  });

  it("puts silent rounds on the 16-yard line, and field-expedient shot at half damage and range", () => {
    expect(upgradedRow(figures(), ["silent"], gun("9x19mm"), { baseAccuracy: 2 })).toMatchObject({ silent: true, hearing: 0, notes: [] });
    const stones = upgradedRow({ damage: "4d-1", halfDamageRange: 100, maxRange: 1500, accuracy: 2, malfunction: 16, minSt: 10 }, ["fieldExpedient"], gun(".75 Flintlock", { tl: 5 }), { baseAccuracy: 2 });
    expect(stones.row).toMatchObject({ damage: "2d", halfDamageRange: 50, maxRange: 750, accuracy: 1, malfunction: 14 });
  });

  it("refuses what the book refuses", () => {
    expect(upgradeRefusal("matchGrade", gun("5.56x45mm", { automatic: true }))).toBe("automatic");
    expect(upgradeRefusal("matchGrade", gun("5.56x45mm"), ["extraPowerful"])).toBe("excludes");
    expect(upgradeRefusal("matchGrade", gun("5.56x45mm", { ammunition: "apds" }))).toBe("projectile");
    expect(upgradeRefusal("matchGrade", gun("5.56x45mm", { tl: 5 }))).toBe("tl");
    expect(upgradeRefusal("subsonic", gun(".45 ACP"))).toBe("alreadySubsonic");
    expect(upgradeRefusal("subsonic", gun(".75 Flintlock", { tl: 6 }))).toBe("class");
    expect(upgradeRefusal("subsonic", gun("12G 2.75in"))).toBe("notPistolOrRifle");
    expect(upgradeRefusal("silent", gun("4.73x33mm"))).toBe("class");
    expect(upgradeRefusal("paperCartridge", gun("9x19mm"))).toBe("class");
    expect(upgradeRefusal("paperCartridge", gun(".75 Flintlock", { tl: 5 }))).toBeNull();
    // Light cases: shotshells at late TL5, other cartridges at TL8; never twice.
    expect(upgradeRefusal("lightCased", gun("5.56x45mm", { tl: 7 }))).toBe("tl");
    expect(upgradeRefusal("lightCased", gun("5.56x45mm"))).toBeNull();
    expect(upgradeRefusal("lightCased", gun("12G 3in", { tl: 6 }))).toBe("alreadyLight");
    // A gun the tables don't list takes the upgrades that don't need powder and shot.
    expect(upgradeRefusal("extraPowerful", gun(null))).toBeNull();
    expect(upgradeRefusal("paperCartridge", gun(null))).toBe("class");
    expect(allowedUpgrades(["matchGrade", "extraPowerful", "subsonic"], gun("5.56x45mm"))).toEqual(["extraPowerful", "subsonic"]);
  });
});

describe("cost and weight per shot (pp. 164-165, 174-177)", () => {
  it("multiplies the table's CPS and WPS by the upgrades", () => {
    // Plastic-cased 5.56x45mm: WPS 0.027 x 0.7 = 0.019, CPS $0.5 x 2 = $1 (p. 164).
    expect(perShot(row("5.56x45mm"), ["lightCased"])).toEqual({ cps: 1, wps: 0.0189 });
    expect(perShot(row("9x19mm"), ["matchGrade"])).toEqual({ cps: 0.6, wps: 0.026 });
    expect(perShot(row("9x19mm"), ["silent", "subsonic"]).cps).toBe(3.9);
    expect(upgradeMultiples(["silent"]).lc).toBe(1);
  });

  it("prices handloads at their materials: the CPS, or half for reloads", () => {
    expect(perShot(row("9x19mm"), ["matchGrade"], "handloaded").cps).toBe(0.3);
    expect(perShot(row(".50 Browning"), [], "reloaded").cps).toBe(2);
  });

  it("takes bulk and Area Knowledge discounts off", () => {
    expect([bulkDiscount(499), bulkDiscount(500), bulkDiscount(5000)]).toEqual([0, 5, 15]);
    expect(areaKnowledgeDiscount({ success: true })).toBe(5);
    expect(areaKnowledgeDiscount({ success: true, criticalSuccess: true })).toBe(15);
    expect(areaKnowledgeDiscount({ success: false })).toBe(0);
    expect(discounted(100, 5, 15)).toBe(80.75);
  });
});

describe("cartridge conversions (p. 164)", () => {
  it("offers the cartridges that fit a caplock's bore, never Magnums", () => {
    const army = conversionsFor(row(".44 Caplock (M1860 Army)"), CALIBRES).map((r) => r.name);
    expect(army).toContain(".44 Colt (11.25×28mmR)");
    expect(army).toContain(".45 Long Colt (11.43×33mmR)");
    expect(army.some((n) => /magnum/i.test(n))).toBe(false);
    expect(conversionsFor(row(".36 Caplock (M1851 Navy)"), CALIBRES).every((r) => r.name.startsWith(".38"))).toBe(true);
    expect(conversionsFor(row("9x19mm"), CALIBRES)).toEqual([]);
  });
});

describe("handloading (p. 174)", () => {
  it("times a batch by its tools", () => {
    expect(batchTime("press", 100, false)).toEqual({ minutes: 300, rolls: 5 });
    expect(batchTime("progressive", 1000, false)).toEqual({ minutes: 60, rolls: 2 });
    // Matched rounds go no faster than 20 an hour, whatever the machine.
    expect(batchTime("powered", 40, true)).toEqual({ minutes: 120, rolls: 4 });
  });
});

describe("misloading (p. 178)", () => {
  const fires = (gunRound: string, round: string, selfLoader = false) => chambering(row(gunRound), row(round), { selfLoader, lookup: gunCalibreRows });

  it("lets a revolver or manual repeater fire the shorter rounds down its chain, and nothing up it", () => {
    expect(fires(".44 Magnum", ".44 Special")).toBe("shorter");
    expect(fires(".44 Magnum", ".44 American")).toBe("shorter");
    expect(fires(".44 Special", ".44 Magnum")).toBe("misload");
    expect(fires(".44 Magnum", ".44 Special", true)).toBe("misload");
    expect(fires(".44 Russian", ".44 American")).toBe("interchangeable");
    expect(fires("7.63x25mm", "7.62x25mm", true)).toBe("interchangeable");
    expect(fires("12G 3in", "12G 2.5in")).toBe("shorter");
    expect(fires(".22 LR", ".22 Short")).toBe("shorter");
    expect(fires("9x19mm", ".40 S&W")).toBe("misload");
    expect(fires("9x19mm", "9x19mm")).toBe("same");
  });

  it("offers the rounds near a gun's bore to load by mistake", () => {
    const near = nearRounds(row(".44 Special"), CALIBRES).map((r) => r.name);
    expect(near).toEqual(expect.arrayContaining([".44 Magnum (10.9×33mmR)", ".44 Russian (11×25mmR)", ".44 American (11×23mmR)"]));
    expect(near.some((n) => n.startsWith(".45 ACP"))).toBe(false);
    expect(near).not.toContain(".44 Special (10.9×29mmR)");
    // Loose powder and ball isn't a cartridge to chamber.
    expect(near.some((n) => /caplock/i.test(n))).toBe(false);
  });

  it("reads the Misloading Table", () => {
    expect([3, 4, 5, 10, 11, 16, 17, 18].map(misloadResult)).toEqual(["fires", "firesAndJams", "jams", "jams", "misfire", "misfire", "damaged", "bursts"]);
  });
});
