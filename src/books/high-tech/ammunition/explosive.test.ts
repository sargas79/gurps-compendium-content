/**
 * High-Tech's explosive and cargo rounds (pp. 169-172), as pure rules:
 * checked against the book's HESH example (a Watervliet M40 against a T-55's
 * turret) and the 40mm grenade launcher rounds of p. 143.
 */

import { describe, expect, it } from "vitest";

import { rowIn, type LoadRow } from "../../../shared/loads/rows.js";
import { calibreRowOf } from "./calibres.js";
import {
  airburstFragments,
  cargoRow,
  explosiveRow,
  gasEffect,
  gasReaches,
  gasesOf,
  heshSpall,
  illuminatedDarkness,
  maxDamage,
  sapleExplodes,
  tearGasVision,
} from "./explosive.js";
import { projectileMultiples, projectileRefusal, projectileRow, type ProjectileGun, type ProjectileLoad, type ProjectileRow } from "./projectiles.js";
import { adjustDamage, boreMm } from "./rules.js";

const gunOf = (name: string, patch: Partial<ProjectileGun> = {}): ProjectileGun => {
  const calibre = calibreRowOf(name);
  return {
    calibre, boreMm: calibre ? boreMm(calibre) : null, tl: 8, automatic: false, shotgun: calibre?.class === "shotgun",
    muzzleLoadingRifle: false, underwater: false, explosive: false, projectiles: 1, ...patch,
  };
};
const load = (patch: Partial<ProjectileLoad>): ProjectileLoad => ({ projectile: "", shotMm: 0, shotCount: 0, material: "", projectileUpgrades: [], poisonCost: 0, ...patch });
const kinetic = (patch: Partial<ProjectileRow>): ProjectileRow => ({
  damage: "5dx2", damageType: "pi++", armorDivisor: 0.5, halfDamageRange: 400, maxRange: 4000, accuracy: 3, malfunction: 17, projectiles: 1, recoil: 2, ...patch,
});
function shot(r: ProjectileRow, l: ProjectileLoad, gun: ProjectileGun) {
  const effect = projectileRow(r, l, gun);
  return { ...effect, row: { ...effect.row, damage: adjustDamage(effect.row.damage, effect.damageFactor) } };
}

/** A cannon's row: a solid shot with the record's blast linked to it (the Hotchkiss 1-pdr's, p. 137). */
const cannonRow = (): LoadRow => rowIn({
  damage: "5dx2", damageType: "pi++", armorDivisor: 0.5,
  followUp: { damage: "2d", damageType: "cr", explosive: true, armorDivisor: 1, fragmentation: "2d", followUp: true, label: "Follow-up" },
});
/** A grenade launcher's row: its own line is the HE blast (the M79's 4d-1 [2d], p. 145). */
const launcherRow = (): LoadRow => rowIn({ damage: "4d-1", damageType: "cr", explosive: true, fragmentation: "2d" });
/** A HEAT launcher's: the jet with (10), its blast linked (the M72A2's, p. 150). */
const heatRow = (): LoadRow => rowIn({ damage: "6dx3", damageType: "cr", explosive: true, armorDivisor: 10, followUp: { damage: "6dx2", damageType: "cr", explosive: true, armorDivisor: 1, label: "Linked" } });

describe("explosive rounds need the record's blast (pp. 169-170)", () => {
  it("refuses an explosive round where the mode prints no blast, or the bore is too small", () => {
    expect(projectileRefusal("he", gunOf("Glock 17, 9x19mm"))).toBe("record");
    expect(projectileRefusal("he", gunOf("Hotchkiss 1-pdr, 37x94mmR", { boreMm: 37, explosive: true }))).toBeNull();
    expect(projectileRefusal("heat", gunOf("Browning M2HB, .50 BMG", { boreMm: 12.7, explosive: true }))).toBe("calibreSmall");
    expect(projectileRefusal("hesh", gunOf("Watervliet M40, 106x607mmR", { boreMm: 106, explosive: true }))).toBeNull();
    expect(projectileRefusal("msheat", gunOf("Watervliet M40, 106x607mmR", { boreMm: 106, explosive: true, tl: 7 }))).toBe("tl");
    expect(projectileRefusal("whitePhosphorus", gunOf("M79, 40x46mmSR", { explosive: false }))).toBe("record");
  });

  it("changes a cannon's shot against the solid shot's: HE (0.5), APEX (2) x0.7, EFP pi++ (2)", () => {
    const cannon = gunOf("Hotchkiss 1-pdr, 37x94mmR", { boreMm: 37, explosive: true, burstPrimary: false });
    expect(shot(kinetic({}), load({ projectile: "he" }), cannon).row).toMatchObject({ damage: "5dx2", armorDivisor: 0.5 });
    expect(shot(kinetic({}), load({ projectile: "saphe" }), cannon).row.armorDivisor).toBe(1);
    // 35 x 0.7 = 24.5 points: 7d.
    expect(shot(kinetic({}), load({ projectile: "apex" }), cannon).row).toMatchObject({ damage: "7d", armorDivisor: 2, damageType: "pi++" });
    // Below 20mm APEX steps the type down, as AP does.
    const small = gunOf("Oerlikon, 15mm", { boreMm: 15, explosive: true });
    expect(shot(kinetic({ damageType: "pi+" }), load({ projectile: "aphex" }), small).row).toMatchObject({ armorDivisor: 2, damageType: "pi" });
    expect(shot(kinetic({ damageType: "cr" }), load({ projectile: "efp" }), gunOf("Rheinmetall, 75mm", { boreMm: 75, explosive: true })).row).toMatchObject({ damageType: "pi++", armorDivisor: 2 });
  });

  it("leaves a launcher's blast as its record prints it, but for a shaped charge's (10)", () => {
    const launcher = gunOf("M79, 40x46mmSR", { explosive: true, burstPrimary: true });
    expect(shot(kinetic({ damage: "4d-1", damageType: "cr", armorDivisor: 1 }), load({ projectile: "he" }), launcher).row).toMatchObject({ damage: "4d-1", armorDivisor: 1 });
    expect(shot(kinetic({ damage: "4d", damageType: "cr", armorDivisor: 1 }), load({ projectile: "hedp" }), launcher).row.armorDivisor).toBe(10);
  });

  it("links the blast or has it follow the hit, bursting inside, with or without fragments; every one incendiary", () => {
    const he = explosiveRow(cannonRow(), "he", { tl: 7, burstPrimary: false }).row;
    expect(he.incendiary).toBe(true);
    expect(he.followUp).toMatchObject({ followUp: false, fragmentation: "2d" });
    const saple = explosiveRow(cannonRow(), "saple", { tl: 6, burstPrimary: false });
    expect(saple.row.followUp).toMatchObject({ followUp: true, blastPlacement: "internal", fragmentation: "2d" });
    expect(saple.notes).toContainEqual({ key: "sapleDud", data: { roll: 4 } });
    expect(explosiveRow(cannonRow(), "saphec", { tl: 7, burstPrimary: false }).row.followUp).toMatchObject({ followUp: true, fragmentation: "" });
    // A shaped charge's blast is linked to its jet; HEAT throws no fragments.
    const heat = explosiveRow({ ...heatRow(), followUp: { ...heatRow().followUp!, fragmentation: "2d" } }, "heat", { tl: 7, burstPrimary: true }).row;
    expect(heat).toMatchObject({ armorDivisor: 10, explosive: true });
    expect(heat.followUp).toMatchObject({ followUp: false, fragmentation: "" });
    // A launcher's HE blast keeps its fragments; a thermobaric one loses them and falls off slower.
    expect(explosiveRow(launcherRow(), "he", { tl: 7, burstPrimary: true }).row.fragmentation).toBe("2d");
    const thermobaric = explosiveRow(launcherRow(), "thermobaric", { tl: 8, burstPrimary: true });
    expect(thermobaric.row.fragmentation).toBe("");
    expect(thermobaric.notes.map((n) => n.key)).toContain("thermobaric");
  });

  it("makes early SAPLE a dud unless 1d comes up TL-2 or less", () => {
    expect(sapleExplodes(5, 3)).toBe(true);
    expect(sapleExplodes(5, 4)).toBe(false);
    expect(sapleExplodes(6, 4)).toBe(true);
    expect(sapleExplodes(7, 6)).toBe(true);
  });

  it("spalls a T-55's turret: 8dx5's 240 points give 24 cutting against DR 6, 18 through (p. 170)", () => {
    expect(maxDamage("8dx5")).toBe(240);
    expect(heshSpall(240, 560)).toEqual({ damage: 24, dr: 6, through: 18 });
    const notes = explosiveRow(rowIn({ damage: "6dx7", damageType: "pi++", armorDivisor: 0.5, followUp: { damage: "8dx5", damageType: "cr", explosive: true, armorDivisor: 1, label: "Linked" } }), "hesh", { tl: 7, burstPrimary: false }).notes;
    expect(notes).toContainEqual({ key: "heshSpall", data: { damage: 24 } });
  });

  it("does only an airburst HE round's fragments, as the row's own attack (p. 175)", () => {
    expect(airburstFragments(launcherRow())).toMatchObject({ damage: "2d", damageType: "cut", armorDivisor: 1, explosive: false, fragmentation: "", followUp: null });
    expect(airburstFragments(cannonRow())).toMatchObject({ damage: "2d", damageType: "cut", explosive: false, followUp: null });
    expect(airburstFragments(heatRow())).toBeNull();
  });

  it("prices the rounds: HEAT x3, thermobaric x8, a scent marker LC2", () => {
    expect(projectileMultiples(load({ projectile: "heat" }))).toEqual({ cps: 3, add: 0, lc: 1 });
    expect(projectileMultiples(load({ projectile: "thermobaric" })).cps).toBe(8);
    expect(projectileMultiples(load({ projectile: "liquid", liquid: "scent" })).lc).toBe(2);
    expect(projectileMultiples(load({ projectile: "liquid", liquid: "paint" })).lc).toBe(4);
    expect(projectileMultiples(load({ projectile: "poisonGas" })).lc).toBe(0);
  });
});

describe("cargo rounds (pp. 143, 171-172)", () => {
  const m79 = () => gunOf("Colt M79, 40x46mmSR", { explosive: true, burstPrimary: true, lowVelocity: true, lowPowered: true });

  it("fires the M79's smoke and tear-gas rounds as 1d+1(0.5) cr dkb from their printed 1d+1 (p. 143)", () => {
    const smoke = shot(kinetic({ damage: "4d-1", damageType: "cr", armorDivisor: 1 }), load({ projectile: "smoke", hitDamage: "1d+1" }), m79());
    expect(smoke.row).toMatchObject({ damage: "1d+1", damageType: "cr", armorDivisor: 0.5 });
    expect(smoke.doubleKnockback).toBe(true);
    // Without the printed dice the blast's stand in, and the row says so.
    expect(shot(kinetic({ damage: "4d-1", damageType: "cr" }), load({ projectile: "tearGas" }), m79()).notes.map((n) => n.key)).toContain("cargoHit");
    // From a cannon, only the (0.5).
    const cannon = gunOf("Hotchkiss 1-pdr, 37x94mmR", { boreMm: 37 });
    expect(shot(kinetic({ armorDivisor: 1 }), load({ projectile: "smoke" }), cannon).row).toMatchObject({ damageType: "pi++", armorDivisor: 0.5 });
  });

  it("drops an ejecting-cargo round's blast: its charge only lets the cargo out", () => {
    const smoke = cargoRow(launcherRow(), "smoke").row;
    expect(smoke).toMatchObject({ explosive: false, fragmentation: "", followUp: null });
    expect(cargoRow(launcherRow(), "illumination").notes).toContainEqual({ key: "flareBurn", data: { dice: "1d", seconds: 10 } });
  });

  it("fires a liquid round only from a low-powered smoothbore: (0.2), half damage, crushing, Range /4", () => {
    expect(projectileRefusal("liquid", gunOf("Remington Model 870, 12G 2.75''"))).toBe("liquid");
    expect(projectileRefusal("liquid", m79())).toBeNull();
    expect(shot(kinetic({ damage: "2d", damageType: "pi", armorDivisor: 1, halfDamageRange: 40, maxRange: 400 }), load({ projectile: "liquid" }), m79()).row)
      .toMatchObject({ damage: "1d", damageType: "cr", armorDivisor: 0.2, halfDamageRange: 10, maxRange: 100 });
  });

  it("bursts white phosphorus into burning fragments that burn every 10 seconds for a minute", () => {
    const wp = cargoRow(rowIn({ damage: "2d", damageType: "cr", explosive: true }), "whitePhosphorus");
    expect(wp.row).toMatchObject({ damageType: "burn", explosive: true, incendiary: true, fragmentation: "1d", fragmentationType: "burn", fragmentationDivisor: 0.2, fragmentationLingerEvery: 10, fragmentationLingerFor: 60 });
    // Behind a cannon's shot it follows the hit; the linked line can't keep the lingering.
    const behind = cargoRow(cannonRow(), "whitePhosphorus");
    expect(behind.row.followUp).toMatchObject({ followUp: true, damageType: "burn", fragmentationType: "burn", fragmentationDivisor: 0.2 });
    expect(behind.notes.map((n) => n.key)).toContain("wpLinger");
    // Poison gas: a follow-up crushing blast.
    expect(cargoRow(cannonRow(), "poisonGas").row.followUp).toMatchObject({ followUp: true, damageType: "cr" });
  });

  it("makes tear gas opaque and rolls HT-2 against coughing, blindness and retching (p. 171)", () => {
    expect(tearGasVision(1)).toBe(-3);
    expect(tearGasVision(8)).toBe(-10);
    expect(gasesOf(false)).toEqual(["tearGasCoughing", "tearGasBlinding"]);
    expect(gasesOf(true)).toContain("vomitingAgent");
    // The time in the cloud plus the margin's minutes; five minutes a point for the vomiting agent.
    expect(gasEffect("tearGasCoughing", 3, 20)).toEqual({ condition: "coughing", seconds: 200 });
    expect(gasEffect("tearGasBlinding", 1, 0)).toEqual({ condition: "blinded", seconds: 60 });
    expect(gasEffect("vomitingAgent", 2, 20)).toEqual({ condition: "retching", seconds: 620 });
    // The margin by its size, signed or not (#539).
    expect(gasEffect("tearGasCoughing", -3, 20)).toEqual(gasEffect("tearGasCoughing", 3, 20));
    expect(gasEffect("vomitingAgent", -4, 0)).toEqual({ condition: "retching", seconds: 1200 });
    // A gas mask keeps out what is breathed, not what gets in the eyes; a sealed suit keeps out both.
    const masked = { sealed: false, doesntBreathe: false, filterLungs: true };
    expect(gasReaches("tearGasCoughing", masked)).toBe(false);
    expect(gasReaches("tearGasBlinding", masked)).toBe(true);
    expect(gasReaches("tearGasBlinding", { ...masked, sealed: true })).toBe(false);
  });

  it("lifts the darkness penalty under a flare to -3, a signal flare's to -5, never making it worse", () => {
    expect(illuminatedDarkness(-7, "parachute")).toBe(-3);
    expect(illuminatedDarkness(-7, "signal")).toBe(-5);
    expect(illuminatedDarkness(-2, "signal")).toBe(-2);
  });
});
