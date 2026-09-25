/**
 * High-Tech's printed rounds (pp. 103, 143): which guns fire them, the row
 * each fires, and what they cost.
 */

import { describe, expect, it } from "vitest";

import { CALIBRES } from "./calibres.js";
import { firesPrinted, limitedFactor, printedCps, printedRound, printedRoundsFor, printedRow } from "./printed.js";

const row = (name: string) => CALIBRES.find((r) => r.name.startsWith(name))!;
const round = (key: string) => printedRound(key)!;
const base = { damage: "1d+1", damageType: "pi", armorDivisor: 1, halfDamageRange: 40, maxRange: 800, accuracy: 3, projectiles: 9, recoil: 1, minSt: 10 };

describe("which guns fire a printed round (pp. 103, 143, 178)", () => {
  it("puts a 2.5\" shell in a gun chambered for 2.75\", auto-loader or not, and a 3\" shell in neither", () => {
    const gun = { calibre: row("12-gauge 2.75”") };
    expect(firesPrinted(round("sgBeanbag"), gun)).toBe(true);
    expect(firesPrinted(round("sgApds"), gun)).toBe(true);
    expect(firesPrinted(round("sgHeat"), gun)).toBe(false);
    expect(firesPrinted(round("sgHeat"), { calibre: row("12-gauge 3”") })).toBe(true);
    expect(firesPrinted(round("sgBeanbag"), { calibre: row("12-gauge 3”") })).toBe(true);
    expect(firesPrinted(round("sgBeanbag"), { calibre: row("20-gauge 2.75”") })).toBe(false);
  });

  it("loads rock salt into any shotgun shell, and nothing else", () => {
    expect(firesPrinted(round("sgRockSalt"), { calibre: row("20-gauge 2.75”") })).toBe(true);
    expect(firesPrinted(round("sgRockSalt"), { calibre: row(".45 ACP") })).toBe(false);
  });

  it("gives 40×46mmSR launchers their rounds, and 37×122mmR launchers the asterisked ones", () => {
    const m79 = printedRoundsFor({ calibre: row("40×46mmSR") }).map((r) => r.key);
    expect(m79).toContain("glHedp7");
    expect(m79).toContain("glNet");
    expect(m79).not.toContain("sgBeanbag");
    const gas = printedRoundsFor({ calibre: row("37×122mmR") }).map((r) => r.key);
    expect(gas).toEqual(["glBaton", "glBeanbag", "glIllumination", "glNet", "glRubber", "glSmoke", "glTearGas"]);
    expect(printedRoundsFor({ calibre: null })).toEqual([]);
  });
});

describe("the row a printed round fires", () => {
  it("fires a beanbag at the slug's Rcl less one, as one projectile", () => {
    expect(printedRow(base, round("sgBeanbag"), 5)).toMatchObject({
      damage: "1d", damageType: "cr", armorDivisor: 0.2, doubleKnockback: true, accuracy: 0, halfDamageRange: 10, maxRange: 150, projectiles: 1, recoil: 4,
    });
  });

  it("fires multi-flechettes as n×20 at Rcl 1, keeping the gun's Acc", () => {
    expect(printedRow(base, round("sgFlechette"), 5)).toMatchObject({ damage: "1d+1", damageType: "pi-", projectiles: 20, recoil: 1, accuracy: 3 });
  });

  it("gives the 12G HE shell its follow-up and 3-yard minimum range, and HEDP its linked blast", () => {
    const he = printedRow(base, round("sgHe"), 5);
    expect(he).toMatchObject({ damage: "4d", damageType: "pi++", armorDivisor: 0.5, minRange: 3, recoil: 5 });
    expect(he.followUp).toEqual({ damage: "1d-1", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "1d", followUp: true });
    const hedp = printedRow({ ...base, damage: "4d-1", damageType: "cr", halfDamageRange: 0, maxRange: 440, projectiles: 1, recoil: 2, minSt: 8 }, round("glHedpPlus"), 2);
    expect(hedp).toMatchObject({ damage: "7d", armorDivisor: 10, explosive: true, minRange: 30, maxRange: 880, minSt: 10 });
    expect(hedp.followUp).toMatchObject({ damage: "6d", fragmentation: "2d", followUp: false });
  });

  it("makes Dragon's Breath a 10-yard cone, and rock salt a HT roll", () => {
    expect(printedRow(base, round("sgFlameJet"), 5)).toMatchObject({ damage: "1d-2", damageType: "burn", maxRange: 75, halfDamageRange: 0, coneMaxWidth: 10 });
    expect(printedRow(base, round("sgRockSalt"), 5)).toMatchObject({ damage: "", affliction: true, afflictionAttribute: "HT", afflictionModifier: 0, maxRange: 10 });
  });
});

describe("what a printed round costs (pp. 103, 143, 166)", () => {
  it("is the book's price, its experimental price in limited production, or five to ten times the price", () => {
    expect(printedCps(round("sgApds"), 0)).toBe(1.5);
    expect(printedCps(round("sgApds"), 5)).toBe(7.5);
    expect(printedCps(round("sgBeanbag"), 8)).toBe(12);
    expect(limitedFactor(4)).toBe(0);
    expect(limitedFactor(7)).toBe(7);
    expect(limitedFactor(11)).toBe(0);
  });
});
