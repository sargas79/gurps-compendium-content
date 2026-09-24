import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STANDARD_ENVIRONMENT,
  beamFamily,
  drResists,
  inEnvironment,
  isDisintegrated,
  isVacuum,
  type BeamEnvironment,
  HOTSHOT_RADIUS,
  LETHAL_ELECTROLASER_LC,
  stabilizedScreenPart,
} from "./rules.js";

const env = (patch: Partial<BeamEnvironment> = {}): BeamEnvironment => ({ ...STANDARD_ENVIRONMENT, ...patch });
const row = { accuracy: 6, halfDamageRange: 200, maxRange: 600, armorDivisor: 2 };

/** Every beam weapon the book's records carry; grav hammers (p. 84), sonic projectors (p. 52) and molecular bonders (p. 84) are tools rather than a beam family. */
function beamRecords(): string[] {
  const dir = join(import.meta.dirname, "../../../../books/ultra-tech/packs-src/equipment");
  const names: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    for (const record of Array.isArray(data) ? data : Object.values(data)) {
      const modes: any[] = (record as any)?.system?.rangedModes ?? [];
      if (/^Grav (Hammer|Ram)$|^Sonic Projector \(|Molecular Bonder$/.test(String((record as any)?.name))) continue;
      if (modes.some((m) => /Beams?\)|Beam Weapons/.test(String(m.skill ?? "")))) names.push(String((record as any).name));
    }
  }
  return names;
}

describe("beam families (Ultra-Tech pp. 113-132)", () => {
  it("places every beam weapon in the book's records", () => {
    const names = beamRecords();
    expect(names.length).toBeGreaterThan(150);
    expect(names.filter((name) => beamFamily(name) === null)).toEqual([]);
  });

  it("reads the more specific name first", () => {
    expect(beamFamily("Heavy Omni-Blaster Pistol")).toBe("omniBlaster");
    expect(beamFamily("Blaster Rifle")).toBe("blaster");
    expect(beamFamily("Heavy Electrolaser")).toBe("electrolaser");
    expect(beamFamily("Rainbow Strike Laser")).toBe("rainbow");
    expect(beamFamily("X-Ray Dino Laser")).toBe("xray");
    expect(beamFamily("Dazzler Carbine")).toBe("dazzler");
    expect(beamFamily("Laser Sniper Rifle")).toBe("laser");
    expect(beamFamily("Tactical MAD")).toBe("mad");
    expect(beamFamily("Scrambler")).toBe("microwave");
    expect(beamFamily("Tactical Neural Disruptor")).toBe("neural");
    expect(beamFamily("Heavy Mind Disruptor")).toBe("mindDisruptor");
    expect(beamFamily("Antiparticle Cannon (TL11)")).toBe("pulsar");
    expect(beamFamily("Semi-Portable Graviton Beam")).toBe("graviton");
    expect(beamFamily("Semi-Portable Force Beam")).toBe("forceBeam");
    expect(beamFamily("Fusion Gatling Gun")).toBe("plasma");
    expect(beamFamily("Broadsword")).toBeNull();
  });
});

describe("beams and the environment", () => {
  it("treats trace air as vacuum, and water as neither", () => {
    expect(isVacuum(env({ atmospheres: 0.01 }))).toBe(true);
    expect(isVacuum(env({ atmospheres: 0, underwater: true }))).toBe(false);
  });

  it("changes nothing in a standard atmosphere", () => {
    for (const family of ["laser", "blaster", "electrolaser", "sonicStun"] as const) {
      expect(inEnvironment(family, row, env())).toMatchObject({ row, skill: 0, chargeLost: false, notes: [] });
    }
  });

  it("limits X-ray lasers and grasers in air, by the pressure, and stops them underwater (pp. 117-118)", () => {
    expect(inEnvironment("xray", { ...row, halfDamageRange: 9680, maxRange: 29920 }, env()).row).toMatchObject({ halfDamageRange: 7, maxRange: 20 });
    expect(inEnvironment("xray", { ...row, halfDamageRange: 9680, maxRange: 29920 }, env({ atmospheres: 0.5 })).row).toMatchObject({ halfDamageRange: 14, maxRange: 40 });
    expect(inEnvironment("graser", { ...row, halfDamageRange: 9680, maxRange: 29920 }, env()).row).toMatchObject({ halfDamageRange: 70, maxRange: 200 });
    expect(inEnvironment("xray", { ...row, halfDamageRange: 9680, maxRange: 29920 }, env({ atmospheres: 0 })).row).toMatchObject({ maxRange: 29920 });
    expect(inEnvironment("graser", row, env({ underwater: true })).row).toMatchObject({ halfDamageRange: 0, maxRange: 0 });
  });

  it("defocuses a rainbow laser in vacuum, and gives it two yards underwater (p. 116)", () => {
    expect(inEnvironment("rainbow", { ...row, halfDamageRange: 900, maxRange: 2700, armorDivisor: 3 }, env({ atmospheres: 0 })).row).toMatchObject({ halfDamageRange: 90, maxRange: 270, armorDivisor: 1 });
    expect(inEnvironment("rainbow", row, env({ underwater: true })).row).toMatchObject({ halfDamageRange: 2, maxRange: 2 });
  });

  it("halves a blaster's Acc, rounding up, and divides its range by 5 in vacuum (p. 123)", () => {
    expect(inEnvironment("blaster", { ...row, accuracy: 5, halfDamageRange: 300, maxRange: 900 }, env({ atmospheres: 0 })).row).toMatchObject({ accuracy: 3, halfDamageRange: 60, maxRange: 180 });
  });

  it("caps an ultraviolet laser at 500 yards over the pressure, and a pulsar at 1,000 (pp. 115, 124)", () => {
    expect(inEnvironment("ultraviolet", { ...row, halfDamageRange: 600, maxRange: 1800 }, env()).row).toMatchObject({ halfDamageRange: 500, maxRange: 500 });
    expect(inEnvironment("pulsar", { ...row, halfDamageRange: 1200, maxRange: 3600 }, env({ atmospheres: 2 })).row).toMatchObject({ halfDamageRange: 500, maxRange: 500 });
  });

  it("stops an infrared laser in water, and caps a blue-green one by the clarity (pp. 114-115)", () => {
    expect(inEnvironment("laser", row, env({ underwater: true })).row).toMatchObject({ halfDamageRange: 0, maxRange: 1 });
    expect(inEnvironment("blueGreen", { ...row, halfDamageRange: 400, maxRange: 1200 }, env({ underwater: true, waterClarity: "murky" })).row).toMatchObject({ halfDamageRange: 15, maxRange: 15 });
  });

  it("takes an electrolaser's charge away in vacuum, and its aim in the wet (p. 119)", () => {
    expect(inEnvironment("electrolaser", row, env({ atmospheres: 0 })).chargeLost).toBe(true);
    expect(inEnvironment("electrolaser", row, env({ humidity: "humid" })).skill).toBe(-2);
    expect(inEnvironment("electrolaser", row, env({ humidity: "rain" })).skill).toBe(-6);
  });

  it("stretches sonic range with the pressure, to twice, and gives it none in vacuum (pp. 124-125)", () => {
    expect(inEnvironment("sonicStun", { ...row, halfDamageRange: 10, maxRange: 30 }, env({ atmospheres: 3 })).row).toMatchObject({ halfDamageRange: 20, maxRange: 60 });
    expect(inEnvironment("sonicStun", { ...row, halfDamageRange: 10, maxRange: 30 }, env({ atmospheres: 0.5 })).row).toMatchObject({ halfDamageRange: 5, maxRange: 15 });
    expect(inEnvironment("screamer", row, env({ atmospheres: 0 })).row).toMatchObject({ halfDamageRange: 0, maxRange: 0 });
    expect(inEnvironment("nauseator", row, env({ underwater: true })).row).toMatchObject({ maxRange: 0 });
  });
});

describe("resisting a beam's affliction", () => {
  it("leaves DR to the system's line for electrolasers, omni-blaster stun, sonic stunners and MAD beams", () => {
    for (const family of ["electrolaser", "omniBlaster", "sonicStun", "mad"] as const) expect(drResists(family)).toBe(true);
  });

  it("gives no DR against dazzlers, contact beams, nauseators and mind disruptors", () => {
    for (const family of ["dazzler", "microwave", "neural", "mindripper", "mindDisruptor", "nauseator"] as const) expect(drResists(family)).toBe(false);
  });
});

describe("disintegrators (p. 130)", () => {
  it("disintegrate at -10 times HP", () => {
    expect(isDisintegrated(-100, 10)).toBe(true);
    expect(isDisintegrated(-99, 10)).toBe(false);
  });
});

describe("stabilized screens, lethal electrolasers and hotshots (#299)", () => {
  it("lets a stabilized screen stand at a fifth against ghost particles (p. 131)", () => {
    expect(stabilizedScreenPart("Ghost Particle Cannon", true)).toBe(0.2);
    expect(stabilizedScreenPart("Ghost Particle Cannon", false)).toBe(0);
    expect(stabilizedScreenPart("Reality Disintegrator Rifle", true)).toBe(0.1);
    expect(stabilizedScreenPart("Disintegrator Pistol", true)).toBeNull();
  });

  it("makes a lethal electrolaser LC2 and a hotshot's radius x1.3 (pp. 119, 133)", () => {
    expect(LETHAL_ELECTROLASER_LC).toBe(2);
    expect(HOTSHOT_RADIUS).toBe(1.3);
  });
});
