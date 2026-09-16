import { describe, expect, it } from "vitest";

import { sizeClass } from "./catalogue.js";
import { divideDamage, loadable, plusPerDie, refusal, stepPiercing, warheadRow, type Launcher, type WarheadRow } from "./rules.js";

const gun = (patch: Partial<Launcher> = {}): Launcher => ({ calibreMm: 10, tl: 10, grenade: false, electromagnetic: false, railgun: false, shotgun: false, homing: false, ...patch });
const row = (patch: Partial<WarheadRow> = {}): WarheadRow => ({
  damage: "3d", damageType: "pi+", armorDivisor: 1, halfDamageRange: 180, maxRange: 2000, projectiles: 1, skillBonus: 0,
  explosive: false, incendiary: false, doubleKnockback: false, radiation: false, fragmentation: "",
  affliction: false, afflictionAttribute: "", afflictionModifier: 0, followUp: null, notes: [], ...patch,
});

describe("warhead sizes and dice", () => {
  it("fires the largest size at or below the calibre", () => {
    expect(sizeClass(10)).toBe(10);
    expect(sizeClass(18.5)).toBe(18.5);
    expect(sizeClass(20)).toBe(18.5);
    expect(sizeClass(7)).toBeNull();
  });

  it("adds a point per die and divides damage", () => {
    expect(plusPerDie("8dx2", 1)).toBe("8d+8x2");
    expect(plusPerDie("3d", 1)).toBe("3d+3");
    expect(divideDamage("4d+4", 4)).toBe("1d+1");
    expect(divideDamage("6d+2", 2)).toBe("3d+1");
  });

  it("steps piercing damage within its ladder", () => {
    expect(stepPiercing("pi+", -1)).toBe("pi");
    expect(stepPiercing("pi-", -1)).toBe("pi-");
    expect(stepPiercing("pi+", 1)).toBe("pi++");
    expect(stepPiercing("cr", 1)).toBe("cr");
  });
});

describe("which weapons load which warheads (Ultra-Tech pp. 152-159)", () => {
  it("keeps armour-piercing rounds out of grenades, and APHC out of Gauss guns", () => {
    expect(refusal("aphc", gun({ grenade: true, calibreMm: 64 }))).toBe("notGrenade");
    expect(refusal("aphc", gun({ electromagnetic: true, calibreMm: 4 }))).toBe("electromagnetic");
    expect(refusal("apds", gun({ railgun: true, electromagnetic: true, calibreMm: 40 }))).toBe("railgun");
  });

  it("holds each warhead to its sizes and TL", () => {
    expect(refusal("he", gun({ calibreMm: 7 }))).toBe("tooSmall");
    expect(refusal("hp", gun({ calibreMm: 15 }))).toBe("tooLarge");
    expect(refusal("burrow", gun({ calibreMm: 4 }))).toBeNull();
    expect(refusal("aphd", gun({ tl: 10 }))).toBe("tl");
    expect(refusal("mininuke", gun({ calibreMm: 40, tl: 10 }))).toBe("tooSmall");
    expect(refusal("mininuke", gun({ calibreMm: 40, tl: 11 }))).toBeNull();
    expect(refusal("sefop", gun({ calibreMm: 40 }))).toBe("homing");
    expect(refusal("shotshell", gun({ calibreMm: 18.5 }))).toBe("shotgun");
  });

  it("lists what a 40mm grenade launcher can fire", () => {
    const kinds = loadable(gun({ calibreMm: 40, tl: 10 }));
    expect(kinds).toContain("he");
    expect(kinds).toContain("stingray");
    expect(kinds).not.toContain("hp");
  });
});

describe("rows with a warhead loaded", () => {
  it("gives APHC a (2) divisor, degrading piercing under 20mm", () => {
    expect(warheadRow("aphc", row(), gun())).toMatchObject({ armorDivisor: 2, damageType: "pi" });
    expect(warheadRow("aphc", row(), gun({ calibreMm: 25 }))).toMatchObject({ armorDivisor: 2, damageType: "pi+" });
  });

  it("gives APDS half again the range and a point per die", () => {
    expect(warheadRow("apds", row(), gun())).toMatchObject({ damage: "3d+3", halfDamageRange: 270, maxRange: 3000 });
  });

  it("makes a hollow-point a step worse against flesh at (0.5)", () => {
    expect(warheadRow("hp", row(), gun())).toMatchObject({ damageType: "pi++", armorDivisor: 0.5 });
  });

  it("keeps a gun's HE round at (0.5) with the table's blast following, +1 per die from TL10", () => {
    const he = warheadRow("he", row(), gun({ calibreMm: 40, tl: 10 }));
    expect(he.armorDivisor).toBe(0.5);
    expect(he.followUp).toMatchObject({ damage: "8d+8", damageType: "cr", explosive: true, fragmentation: "2d", followUp: true });
  });

  it("gives a 64mm HE grenade the table's damage outright", () => {
    expect(warheadRow("he", row({ damage: "8dx2", damageType: "cr" }), gun({ calibreMm: 64, tl: 9, grenade: true }))).toMatchObject({ damage: "8dx2", damageType: "cr", explosive: true, fragmentation: "3d", followUp: null });
  });

  it("replaces a round with a shaped charge's jet and links its blast", () => {
    const shaped = warheadRow("shaped", row(), gun({ calibreMm: 25, tl: 9 }));
    expect(shaped).toMatchObject({ damage: "5dx3", damageType: "cr", armorDivisor: 10, incendiary: true });
    expect(shaped.followUp).toMatchObject({ damage: "2d", followUp: false, fragmentation: "1d+1" });
  });

  it("halves a stingray round at (0.25) and links its discharge", () => {
    const sting = warheadRow("stingray", row({ damage: "4d" }), gun({ calibreMm: 18.5 }));
    expect(sting).toMatchObject({ damage: "2d", armorDivisor: 0.25 });
    expect(sting.followUp).toMatchObject({ damage: "1d", damageType: "burn" });
  });

  it("turns a strobe into an area affliction at the table's penalty", () => {
    expect(warheadRow("strobe", row(), gun({ calibreMm: 40 }))).toMatchObject({ affliction: true, afflictionAttribute: "HT", afflictionModifier: -4, damage: "—" });
  });

  it("dials a mininuke's yield", () => {
    expect(warheadRow("mininuke", row(), gun({ calibreMm: 100, tl: 9 }), { variant: "0.1kt" })).toMatchObject({ damage: "6dx600", explosive: true });
  });

  it("leaves a tangler to the GM, with its strength noted", () => {
    const tangler = warheadRow("tangler", row(), gun({ calibreMm: 25 }));
    expect(tangler.damage).toBe("spec.");
    expect(tangler.notes[0]).toEqual({ key: "spec.tangler", data: { value: "ST 15 (+1 a layer)" } });
  });

  it("weakens a thermobaric blast in thin air and vacuum", () => {
    expect(warheadRow("thermobaric", row(), gun({ calibreMm: 40, tl: 9 }), { atmospheres: 0 }).damage).toBe(divideDamage("8dx2", 4));
  });
});
