import { describe, expect, it } from "vitest";

import { LOCATIONS, locationAvailable, refineRandomHit, woundOutcome } from "./rules.js";

const byKey = (key: string) => LOCATIONS.find((l) => l.key === key)!;

/** New hit locations (GURPS Martial Arts p. 137). */
describe("the locations", () => {
  it("puts veins and arteries a half step up the wounding scale, never crippling a limb", () => {
    expect(byKey("legVein")).toMatchObject({ parent: "leg", penalty: -5, woundingAdd: 0.5, cripplingDivisor: null, missFallback: "leg" });
    expect(byKey("legVein").damageTypes).toContain("cut");
    expect(byKey("legVein").damageTypes).not.toContain("cr");
  });

  it("gives the spine DR 3, a knockdown roll on any shock, and aims at it only from behind", () => {
    expect(byKey("spine")).toMatchObject({ extraDr: 3, shockKnockdown: true, arcs: ["back"], missFallback: "torso" });
  });

  it("cripples joints at HP/3 on a limb and HP/4 on an extremity", () => {
    expect(byKey("armJoint").cripplingDivisor).toBe(3);
    expect(byKey("footJoint").cripplingDivisor).toBe(4);
  });

  it("takes joints, the spine and veins away from a Diffuse body, and the ear from a headless one", () => {
    const diffuse = new Set(["diffuse"] as const);
    expect(locationAvailable(byKey("armJoint"), diffuse)).toBe(false);
    expect(locationAvailable(byKey("spine"), diffuse)).toBe(false);
    expect(locationAvailable(byKey("neckVein"), diffuse)).toBe(false);
    expect(locationAvailable(byKey("jaw"), diffuse)).toBe(true);
    expect(locationAvailable(byKey("ear"), new Set(["noHead"] as const))).toBe(false);
  });
});

describe("random hits", () => {
  it("sends a 1 on an arm to a vein for a cut and a joint for crushing", () => {
    expect(refineRandomHit("arm", "cut", null, 1).key).toBe("armVein");
    expect(refineRandomHit("arm", "cr", null, 1).key).toBe("armJoint");
    expect(refineRandomHit("arm", "cut", null, 2).key).toBeNull();
  });

  it("sends a 1 on the face to the skull for piercing kinds and the nose otherwise, from the front", () => {
    expect(refineRandomHit("face", "imp", "front", 1)).toEqual({ key: null, basic: "skull" });
    expect(refineRandomHit("face", "cr", null, 1).key).toBe("nose");
    expect(refineRandomHit("face", "cr", "back", 1).key).toBeNull();
  });

  it("sends a 1 on the neck to the spine from behind with crushing, and to a vein otherwise", () => {
    expect(refineRandomHit("neck", "cr", "back", 1).key).toBe("spine");
    expect(refineRandomHit("neck", "cut", "front", 1).key).toBe("neckVein");
  });

  it("sends a 1 on the torso to the vitals, or the spine for a cut from behind", () => {
    expect(refineRandomHit("torso", "pi", null, 1)).toEqual({ key: null, basic: "vitals" });
    expect(refineRandomHit("torso", "cr", null, 1).key).toBe("vitalsCrushing");
    expect(refineRandomHit("torso", "cut", "back", 1).key).toBe("spine");
  });
});

describe("what a wound does", () => {
  it("cuts an ear over HP/4 and removes it at twice that", () => {
    expect(woundOutcome("earSlice", { raw: 4, maxHp: 12, damageType: "cut", crippled: false })).toBe("earLost");
    expect(woundOutcome("earSlice", { raw: 6, maxHp: 12, damageType: "cut", crippled: false })).toBe("earRemoved");
    expect(woundOutcome("earSlice", { raw: 3, maxHp: 12, damageType: "cut", crippled: false })).toBeNull();
  });

  it("breaks a nose over HP/4, and a cut of twice that lops it off", () => {
    expect(woundOutcome("nose", { raw: 4, maxHp: 12, damageType: "cr", crippled: false })).toBe("noseBroken");
    expect(woundOutcome("nose", { raw: 6, maxHp: 12, damageType: "cut", crippled: false })).toBe("noseLopped");
  });

  it("cripples the spine over HP", () => {
    expect(woundOutcome("spine", { raw: 13, maxHp: 12, damageType: "cr", crippled: false })).toBe("spineCrippled");
    expect(woundOutcome("spine", { raw: 12, maxHp: 12, damageType: "cr", crippled: false })).toBeNull();
  });
});
