/**
 * High-Tech's projectiles (pp. 166-175), checked against the book's own
 * examples: the rifled, frangible, baton and beanbag slugs, APDSDU in a G3,
 * the triplex .38 Special, birdshot from a .45 pistol, and the silver
 * hollow-points of p. 168.
 */

import { describe, expect, it } from "vitest";

import { calibreRowOf } from "./calibres.js";
import {
  maxProjectiles,
  multipleLoad,
  nsFor,
  projectileMultiples,
  projectileRefusal,
  projectileRow,
  projectileUpgradeRefusal,
  shotKind,
  type ProjectileGun,
  type ProjectileLoad,
  type ProjectileRow,
} from "./projectiles.js";
import { adjustDamage, boreMm, perShot, upgradedRow } from "./rules.js";

const gunOf = (name: string, patch: Partial<ProjectileGun> = {}): ProjectileGun => {
  const calibre = calibreRowOf(name);
  return {
    calibre,
    boreMm: calibre ? boreMm(calibre) : null,
    tl: 8,
    automatic: false,
    shotgun: calibre?.class === "shotgun",
    muzzleLoadingRifle: false,
    underwater: false,
    explosive: false,
    projectiles: 1,
    ...patch,
  };
};

const load = (patch: Partial<ProjectileLoad>): ProjectileLoad => ({ projectile: "", shotMm: 0, shotCount: 0, material: "", projectileUpgrades: [], poisonCost: 0, ...patch });

const row = (patch: Partial<ProjectileRow>): ProjectileRow => ({
  damage: "2d", damageType: "pi", armorDivisor: 1, halfDamageRange: 100, maxRange: 1000, accuracy: 2, malfunction: 17, projectiles: 1, recoil: 2, ...patch,
});

/** The row a projectile fires, its dice multiplied as the book adjusts them (p. 166). */
function fired(r: ProjectileRow, l: ProjectileLoad, gun: ProjectileGun) {
  const effect = projectileRow(r, l, gun);
  return { ...effect, row: { ...effect.row, damage: adjustDamage(effect.row.damage, effect.damageFactor) } };
}

// The Remington 870's 00 Buck: 1d+1 pi, Acc 3, 40/800, 2x9 (p. 104).
const remington = () => gunOf("Remington Model 870, 12G 2.75''", { projectiles: 9 });
const buckshot = () => row({ damage: "1d+1", accuracy: 3, halfDamageRange: 40, maxRange: 800, projectiles: 9, recoil: 1 });

describe("shotgun slugs (pp. 103, 166-168)", () => {
  it("makes a 12-gauge rifled slug 5d pi++, +1 Acc, 1/2D x2.5 and Max x1.5, one projectile", () => {
    expect(fired(buckshot(), load({ projectile: "rifledSlug" }), remington()).row).toMatchObject({ damage: "5d", damageType: "pi++", accuracy: 4, halfDamageRange: 100, maxRange: 1200, projectiles: 1 });
    // Smaller than 20-gauge, pi+.
    expect(fired(buckshot(), load({ projectile: "rifledSlug" }), gunOf("Shotgun, .410 3''", { projectiles: 5 })).row.damageType).toBe("pi+");
  });

  it("fires the other projectiles from the slug: frangible 5d(0.5) pi++ that never overpenetrates, baton 1d(0.5) cr, beanbag 1d(0.2) cr dkb", () => {
    const frangible = fired(buckshot(), load({ projectile: "frangible" }), remington());
    expect(frangible.row).toMatchObject({ damage: "5d", damageType: "pi++", armorDivisor: 0.5 });
    expect(frangible.noOverpenetration).toBe(true);
    expect(fired(buckshot(), load({ projectile: "baton" }), remington()).row).toMatchObject({ damage: "1d", damageType: "cr", armorDivisor: 0.5, accuracy: 3 });
    const beanbag = fired(buckshot(), load({ projectile: "beanbag" }), remington());
    expect(beanbag.row).toMatchObject({ damage: "1d", damageType: "cr", armorDivisor: 0.2, accuracy: 0 });
    expect(beanbag.doubleKnockback).toBe(true);
  });

  it("refuses a rifled slug to anything but a shotgun", () => {
    expect(projectileRefusal("rifledSlug", gunOf("H&K G3, 7.62x51mm"))).toBe("shotgunOnly");
    expect(projectileRefusal("rifledSlug", remington())).toBeNull();
  });
});

describe("kinetic projectiles (pp. 166-169)", () => {
  it("steps a hollow-point up the piercing ladder at (0.5), -1 Malf. in a TL5-7 self-loader", () => {
    const glock = gunOf("Glock 17, 9x19mm", { automatic: true, tl: 7 });
    expect(fired(row({ damage: "2d+2" }), load({ projectile: "hollowPoint" }), glock).row).toMatchObject({ damage: "2d+2", damageType: "pi+", armorDivisor: 0.5, malfunction: 16 });
    expect(fired(row({ damageType: "pi++" }), load({ projectile: "hollowPoint" }), gunOf("Glock 17, 9x19mm", { tl: 8 })).row).toMatchObject({ damageType: "pi++", malfunction: 17 });
  });

  it("makes El Chacal's APDSDU for a 7.62mm G3 10d(2) pi- (p. 166)", () => {
    const g3 = gunOf("H&K G3, 7.62x51mm");
    const shown = fired(row({ damage: "6d+2", halfDamageRange: 1000, maxRange: 4200 }), load({ projectile: "apdsdu" }), g3);
    expect(shown.row).toMatchObject({ damage: "10d", damageType: "pi-", armorDivisor: 2, halfDamageRange: 1500, maxRange: 6300 });
    expect(shown.notes.map((n) => n.key)).toContain("depletedUranium");
  });

  it("makes APDS in a rifle (2), x1.3, a step down and Range x1.5, and refuses it to pistol calibres", () => {
    expect(fired(row({ damage: "7d" }), load({ projectile: "apds" }), gunOf("M16A2, 5.56x45mm")).row).toMatchObject({ damage: "9d", damageType: "pi-", armorDivisor: 2, halfDamageRange: 150, maxRange: 1500 });
    expect(projectileRefusal("apds", gunOf("Glock 17, 9x19mm"))).toBe("notPistol");
  });

  it("makes AP x0.7 and APHC full damage, both (2) and a step down below 20mm; APFSDS below 40mm takes pi+ to pi-", () => {
    const rifle = gunOf("M16A2, 5.56x45mm");
    expect(fired(row({ damage: "5d" }), load({ projectile: "ap" }), rifle).row).toMatchObject({ damage: "3d+2", damageType: "pi-", armorDivisor: 2 });
    expect(fired(row({ damage: "5d" }), load({ projectile: "aphc" }), rifle).row).toMatchObject({ damage: "5d", damageType: "pi-", armorDivisor: 2 });
    const browning = gunOf("Browning M2HB, .50 Browning", { boreMm: 12.7 });
    expect(fired(row({ damage: "6dx2", damageType: "pi+" }), load({ projectile: "apfsds" }), browning).row).toMatchObject({ damage: "6dx3", damageType: "pi-", halfDamageRange: 200, maxRange: 2000 });
    expect(projectileRefusal("apfsds", rifle)).toBe("calibreSmall");
  });

  it("makes a .38 Special beanbag 1d-4(0.2) cr (p. 168)", () => {
    const shown = fired(row({ damage: "2d", halfDamageRange: 110, maxRange: 1200 }), load({ projectile: "beanbag" }), gunOf("S&W Model 10, .38 Special"));
    expect(shown.row).toMatchObject({ damage: "1d-4", damageType: "cr", armorDivisor: 0.2, halfDamageRange: 14, maxRange: 150 });
    expect(shown.doubleKnockback).toBe(false);
  });

  it("gives an underwater dart impaling damage and the x25 underwater, only in a gun built for it", () => {
    expect(projectileRefusal("underwaterDart", gunOf("Glock 17, 9x19mm"))).toBe("underwater");
    const shown = fired(row({}), load({ projectile: "underwaterDart" }), gunOf("H&K P11, 7.62x36mm", { underwater: true }));
    expect(shown.row.damageType).toBe("imp");
    expect(shown.underwaterFactor).toBe(25);
  });

  it("offers Minié balls to a muzzle-loading rifle only", () => {
    expect(projectileRefusal("minie", gunOf("Enfield P/1853, .577 Caplock", { tl: 5, muzzleLoadingRifle: true }))).toBeNull();
    expect(projectileRefusal("minie", gunOf("Brown Bess, .75 Flintlock", { tl: 5 }))).toBe("muzzleRifle");
  });
});

describe("multiple projectiles (pp. 172-174)", () => {
  it("reads NS off the table, NP between two rows taking the higher, and the most a bore holds", () => {
    expect(nsFor(223)).toBe(0.058);
    expect(nsFor(9)).toBe(0.33);
    expect(nsFor(105)).toBe(0.082);
    expect(maxProjectiles(18.5, 2.79)).toBe(291);
    expect(shotKind(8.38)).toBe("buckshot");
    expect(shotKind(2.41)).toBe("birdshot");
    expect(shotKind(1.02)).toBe("smallshot");
  });

  it("gives a .45 pistol's 105-pellet 2.41mm birdshot 1d-5(0.5) pi-, Range 12/241, x105 and Rcl 1 (p. 173)", () => {
    const colt = gunOf("Colt Government, .45 ACP");
    const shown = fired(row({ damage: "2d", damageType: "pi+" }), load({ projectile: "shotshell", shotMm: 2.41, shotCount: 105 }), colt);
    expect(shown.row).toMatchObject({ damage: "1d-5", damageType: "pi-", armorDivisor: 0.5, halfDamageRange: 12, maxRange: 241, projectiles: 105, recoil: 1 });
  });

  it("keeps a shotgun's own 00 Buck as it is, and works birdshot from it", () => {
    expect(multipleLoad(load({ projectile: "shotshell" }), remington())).toEqual({ mm: 8.38, count: 9 });
    expect(fired(buckshot(), load({ projectile: "shotshell" }), remington()).row).toMatchObject({ damage: "1d+1", damageType: "pi", armorDivisor: 1, halfDamageRange: 40, maxRange: 800, projectiles: 9 });
    // 6 Bird: 223 pellets, the typical one-ounce load (p. 172).
    expect(fired(buckshot(), load({ projectile: "shotshell", shotMm: 2.79, shotCount: 223 }), remington()).row).toMatchObject({ damage: "1d-5", damageType: "pi-", armorDivisor: 0.5, halfDamageRange: 14, maxRange: 279, projectiles: 223 });
    // With no count, the most the bore holds.
    expect(multipleLoad(load({ projectile: "shotshell", shotMm: 2.79 }), remington()).count).toBe(291);
  });

  it("fires a triplex .38 Special at 1d+1, Range 37/400, x3, Rcl 1 (p. 173)", () => {
    const shown = fired(row({ damage: "2d", halfDamageRange: 110, maxRange: 1200 }), load({ projectile: "triplex" }), gunOf("S&W Model 10, .38 Special"));
    expect(shown.row).toMatchObject({ damage: "1d+1", halfDamageRange: 37, maxRange: 400, projectiles: 3, recoil: 1 });
  });

  it("makes buck-and-ball's first hit the ball, and the rest 1d+1 pi buckshot", () => {
    const bess = gunOf("Brown Bess, .75 Flintlock", { tl: 5, boreMm: 19 });
    const shown = fired(row({ damage: "4d+1", damageType: "pi++", halfDamageRange: 100, maxRange: 1500 }), load({ projectile: "buckAndBall" }), bess);
    expect(shown.row).toMatchObject({ damage: "1d+1", damageType: "pi", projectiles: 4, recoil: 1, halfDamageRange: 42, maxRange: 838 });
    expect(shown.firstHit).toEqual({ damage: "4d+1", factor: 1, damageType: "pi++", armorDivisor: 1 });
    expect(shown.notes).toContainEqual({ key: "ballRange", data: { half: 90, max: 1350 } });
    // From a shotgun the ball is the slug.
    const slugBall = projectileRow(buckshot(), load({ projectile: "buckAndBall" }), remington()).firstHit!;
    expect(adjustDamage(slugBall.damage, slugBall.factor)).toBe("5d");
  });

  it("makes canister pi+ or pi++ by the balls' size, Range from their diameter", () => {
    const gun = gunOf("Napoleon 12-pounder, 117mm", { boreMm: 117, tl: 5 });
    const shown = fired(row({ damage: "6dx10", damageType: "cr" }), load({ projectile: "canister", shotMm: 25, shotCount: 50 }), gun);
    expect(shown.row).toMatchObject({ damageType: "pi++", halfDamageRange: 125, maxRange: 1250, projectiles: 50 });
    expect(projectileRefusal("canister", gunOf("Glock 17, 9x19mm"))).toBe("calibreSmall");
  });
});

describe("projectile upgrades (pp. 174-175)", () => {
  const launcher = () => gunOf("M79, 40x46mmSR", { explosive: true });

  it("bursts an airburst round in the air, a miss scattering by the margin squared, only for explosive rounds", () => {
    const shown = fired(row({ damage: "4d", damageType: "cr" }), load({ projectileUpgrades: ["airburst"] }), launcher());
    expect(shown.scatterSquared).toBe(true);
    expect(shown.notes.map((n) => n.key)).toContain("airburst");
    expect(projectileUpgradeRefusal("airburst", "", gunOf("Glock 17, 9x19mm"))).toBe("explosiveOnly");
    // A TL5-6 time fuse gives +3, not +4.
    expect(fired(row({}), load({ projectileUpgrades: ["airburst"] }), { ...launcher(), tl: 6 }).notes.map((n) => n.key)).toContain("airburstFuse");
  });

  it("makes a tracer incendiary out to 1/2D, and incendiary rounds solid bullets only", () => {
    const shown = fired(row({ halfDamageRange: 500 }), load({ projectileUpgrades: ["tracer"] }), gunOf("M16A2, 5.56x45mm"));
    expect(shown.incendiary).toBe(true);
    expect(shown.notes).toContainEqual({ key: "tracer", data: { range: 500 } });
    expect(projectileUpgradeRefusal("incendiary", "hollowPoint", gunOf("M16A2, 5.56x45mm"))).toBe("solidOnly");
    expect(projectileUpgradeRefusal("incendiary", "", gunOf("Glock 17, 9x19mm"))).toBe("handgun");
  });

  it("multiplies the cost: x1.5 each, airburst free in a shrapnel shell", () => {
    expect(projectileMultiples(load({ projectile: "apds", projectileUpgrades: ["tracer"] }))).toEqual({ cps: 4.5, add: 0, lc: 1 });
    expect(projectileMultiples(load({ projectile: "shrapnel", projectileUpgrades: ["airburst"] })).cps).toBe(2);
  });
});

describe("exotic bullets and prices (pp. 166-168, 175)", () => {
  it("prices Special Agent Lafayette's silver hollow-points for his .40 S&W at $15 a round, garlic free (p. 168)", () => {
    const row40 = calibreRowOf("Glock 23, .40 S&W")!;
    expect(perShot(row40, [], "handloaded", projectileMultiples(load({ projectile: "hollowPoint", material: "silver" }))).cps).toBe(15);
    // Poison adds its dose.
    expect(perShot(row40, [], "", projectileMultiples(load({ projectile: "poison", poisonCost: 20 }))).cps).toBe(20.3);
  });

  it("halves a light bullet's damage and range, and costs a silver bullet in a rifled gun -1 Acc and Malf.", () => {
    const glock = gunOf("Glock 23, .40 S&W");
    expect(fired(row({ damage: "2d+1" }), load({ material: "light" }), glock).row).toMatchObject({ damage: "1d", halfDamageRange: 50, maxRange: 500 });
    expect(fired(row({}), load({ material: "silver" }), glock).row).toMatchObject({ accuracy: 1, malfunction: 16 });
    // A jacketed hollow-point keeps the barrel clean.
    expect(fired(row({}), load({ projectile: "hollowPoint", material: "silver" }), glock).row).toMatchObject({ accuracy: 2, malfunction: 17 });
  });

  it("multiplies a projectile's damage with the upgrades' before rounding once (p. 166)", () => {
    const g3 = gunOf("H&K G3, 7.62x51mm");
    const effect = projectileRow(row({ damage: "6d+2" }), load({ projectile: "apdsdu" }), g3);
    const upgraded = upgradedRow({ damage: effect.row.damage, halfDamageRange: 1000, maxRange: 4000, accuracy: 5, malfunction: 17, minSt: 10 }, ["extraPowerful"], { calibre: g3.calibre, tl: 8, automatic: false, cheap: false, skill: "Guns (Rifle)", ammunition: "", projectile: "apdsdu" }, { baseAccuracy: 5, damageFactor: effect.damageFactor });
    // 23 x 1.5 x 1.1 = 37.95 points, 10.84 dice: 11d-1.
    expect(upgraded.row.damage).toBe("11d-1");
  });
});
