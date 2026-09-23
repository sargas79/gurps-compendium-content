import { describe, expect, it } from "vitest";

import { applyPatch, patchApplies } from "./patch.mjs";

const gun = (modes) => ({
  name: "Colt M79, 40x46mmSR",
  system: { weaponClass: "firearm", rangedModes: modes.map((malfunction) => ({ name: "attack", malfunction })) },
});

const rule = (fields) => ({ pack: "equipment", pattern: /./, where: {}, set: {}, ...fields });

describe("patchApplies", () => {
  it("matches by name", () => {
    expect(patchApplies(rule({ pattern: /^Colt M79/ }), gun([null]))).toBe(true);
    expect(patchApplies(rule({ pattern: /^Glock/ }), gun([null]))).toBe(false);
  });

  it("also needs every where field to hold its value exactly", () => {
    const record = gun([null]);
    expect(patchApplies(rule({ where: { "system.weaponClass": "firearm" } }), record)).toBe(true);
    expect(patchApplies(rule({ where: { "system.weaponClass": "bow" } }), record)).toBe(false);
    expect(patchApplies(rule({ where: { "system.rangedModes.0.name": "attack" } }), record)).toBe(true);
    expect(patchApplies(rule({ where: { "system.missing.field": "x" } }), record)).toBe(false);
  });
});

describe("applyPatch", () => {
  it("sets a field by path, making what is missing", () => {
    const record = gun([null]);
    applyPatch(rule({ set: { name: "M79", "system.extra.note": 1 } }), record);
    expect(record.name).toBe("M79");
    expect(record.system.extra).toEqual({ note: 1 });
  });

  it("sets a field on every element where the path has a *", () => {
    const record = gun([null, null, 16]);
    applyPatch(rule({ set: { "system.rangedModes.*.malfunction": 17 } }), record);
    expect(record.system.rangedModes.map((mode) => mode.malfunction)).toEqual([17, 17, 17]);
  });

  it("leaves a record without the array alone rather than making one", () => {
    const armour = { name: "Hard Hat", system: { dr: 4 } };
    applyPatch(rule({ set: { "system.rangedModes.*.malfunction": 17 } }), armour);
    expect(armour).toEqual({ name: "Hard Hat", system: { dr: 4 } });
  });

  it("copies the value, so records never share an object", () => {
    const a = gun([null]);
    const b = gun([null]);
    const linked = { damage: "HT-5" };
    const r = rule({ set: { "system.rangedModes.*.linked": linked } });
    applyPatch(r, a);
    applyPatch(r, b);
    a.system.rangedModes[0].linked.damage = "changed";
    expect(b.system.rangedModes[0].linked.damage).toBe("HT-5");
    expect(linked.damage).toBe("HT-5");
  });
});
