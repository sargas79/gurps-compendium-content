import { describe, expect, it } from "vitest";

import { MODULE_ID } from "./module.js";
import { legacyUpdate } from "./system-fields.js";

const EXT = `system.extensions.${MODULE_ID}`;
const item = (type: string, system: Record<string, unknown> = {}, ext: Record<string, unknown> = {}) => ({ type, system: { ...system, extensions: { [MODULE_ID]: ext } } });

describe("carrying this module's old fields to the system's", () => {
  it("leaves an item with nothing old alone", () => {
    expect(legacyUpdate(item("equipment"))).toBeNull();
    expect(legacyUpdate(item("trait"))).toBeNull();
    expect(legacyUpdate(item("equipment", { rugged: true }, { gadget: { rugged: false } }))).toBeNull();
  });

  it("moves a gadget's Cutting-Edge, Rugged and Disguised, and clears the old copies", () => {
    const update = legacyUpdate(item("equipment", {}, { gadget: { cuttingEdge: true, rugged: true, disguised: true, scentMasking: true } }));
    expect(update).toEqual({
      "system.disguised": true,
      [`${EXT}.gadget.disguised`]: false,
      "system.cuttingEdge": true,
      [`${EXT}.gadget.cuttingEdge`]: false,
      "system.rugged": true,
      [`${EXT}.gadget.rugged`]: false,
    });
  });

  it("moves a weapon's Balanced and Disguised, and Signature Gear's flag", () => {
    const update = legacyUpdate(item("equipment", {}, { weapon: { balanced: true, disguised: true, titanium: true }, signature: true }));
    expect(update).toMatchObject({ "system.balanced": true, "system.disguised": true, "system.signature": true, [`${EXT}.weapon.balanced`]: false, [`${EXT}.signature`]: false });
  });

  it("keeps Cutting-Edge and Rugged on clothing, which the system has no field for", () => {
    const update = legacyUpdate(item("armor", {}, { gadget: { cuttingEdge: true, rugged: true, disguised: true } }));
    expect(update).toEqual({ "system.disguised": true, [`${EXT}.gadget.disguised`]: false });
  });

  it("takes a custom-built Disguise and Rugged from the gadget engine, and leaves a mass-produced one", () => {
    expect(legacyUpdate(item("equipment", {}, { ultraTech: { rugged: true, disguise: "custom" } }))).toEqual({
      "system.rugged": true,
      [`${EXT}.ultraTech.rugged`]: false,
      "system.disguised": true,
      [`${EXT}.ultraTech.disguise`]: "",
    });
    expect(legacyUpdate(item("equipment", {}, { ultraTech: { disguise: "massProduced" } }))).toBeNull();
  });

  it("does not overwrite a system field already set, but still clears the old copy", () => {
    expect(legacyUpdate(item("equipment", { rugged: true }, { gadget: { rugged: true } }))).toEqual({ [`${EXT}.gadget.rugged`]: false });
  });

  it("carries armour's n in 6 to system.coverage", () => {
    expect(legacyUpdate(item("armor", {}, { htArmor: { coverage: 3, slamPads: true } }))).toEqual({ "system.coverage": 3, [`${EXT}.htArmor.coverage`]: 0 });
    expect(legacyUpdate(item("armor", { coverage: 2 }, { htArmor: { coverage: 3 } }))).toEqual({ [`${EXT}.htArmor.coverage`]: 0 });
    expect(legacyUpdate(item("armor", {}, { htArmor: { coverage: 0 } }))).toBeNull();
  });
});
