/**
 * Monster Hunters 1's gear options as the system now owns them (Basic Set
 * Revised p. 342): Balanced, Cutting-Edge, Disguised and Rugged are read from
 * the item's calculated fields, and priced with the system's `pricingOf`.
 */

import { describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { MODULE_ID } from "../../../shared/module.js";
import { gearData, ownGadget, ownWeapon } from "./data.js";
import { gadgetPricing, gearPrice } from "./effects.js";

const api = { rules, registry: { isRuleOn: () => false } } as never;
const item = (type: string, system: Record<string, unknown> = {}, ext: Record<string, unknown> = {}) => ({ type, name: "Thing", system: { cost: 20, weight: 1, ...system, extensions: { [MODULE_ID]: ext } } });

describe("reading the system's fields", () => {
  it("takes a gadget's Cutting-Edge, Disguised and Rugged from the item, not this module's copies", () => {
    const data = gearData(item("equipment", { cuttingEdge: true, rugged: true }, { gadget: { disguised: true } }));
    expect(data.gadget).toMatchObject({ cuttingEdge: true, rugged: true, disguised: false });
  });

  it("keeps Cutting-Edge and Rugged on clothing this module's, and reads its Disguised from the system", () => {
    const data = gearData(item("armor", { disguised: true }, { gadget: { cuttingEdge: true, rugged: true, scentMasking: true } }));
    expect(data.gadget).toMatchObject({ cuttingEdge: true, rugged: true, disguised: true, scentMasking: true });
  });

  it("takes a weapon's Balanced and Disguised, and Signature Gear's flag, from the system", () => {
    const data = gearData(item("equipment", { balanced: true, disguised: true, signature: true }, { weapon: { titanium: true } }));
    expect(data.weapon).toMatchObject({ balanced: true, disguised: true, titanium: true });
    expect(data.signature).toBe(true);
  });

  it("writes back only what is this module's", () => {
    const clothing = item("armor");
    expect(ownGadget(clothing, { cuttingEdge: true, disguised: true, rugged: true, scentMasking: true, undercover: 1 })).toEqual({ cuttingEdge: true, disguised: false, rugged: true, scentMasking: true, undercover: 1 });
    expect(ownGadget(item("equipment"), { cuttingEdge: true, disguised: true, rugged: true, scentMasking: false, undercover: 0 })).toMatchObject({ cuttingEdge: false, disguised: false, rugged: false });
    expect(ownWeapon({ balanced: true, disguised: true, titanium: true, weighted: false, compound: false })).toEqual({ balanced: false, disguised: false, titanium: true, weighted: false, compound: false });
  });
});

describe("pricing a gadget with the system's pricing", () => {
  it("is three times the price and 0.8 the weight for a cutting-edge, rugged gadget", () => {
    const flashlight = item("equipment", { cuttingEdge: true, rugged: true, listCost: 20, listWeight: 1 });
    const { costFactor, weightFactor } = gadgetPricing(api, flashlight);
    expect(costFactor).toBe(2);
    expect(weightFactor).toBeCloseTo(0.8);
    expect(gearPrice(api, flashlight)).toMatchObject({ cost: 60, weight: 0.8 });
  });

  it("adds good or fine equipment, and the book's scent-masking and undercover on clothing", () => {
    expect(gadgetPricing(api, item("equipment", { equipmentQuality: "fine" })).costFactor).toBe(19);
    const coat = item("armor", { disguised: true }, { gadget: { scentMasking: true, undercover: 2, rugged: true } });
    // Disguised +4 from the system; rugged +1, scent-masking +2 and Undercover +19 the book's.
    expect(gadgetPricing(api, coat).costFactor).toBe(4 + 1 + 2 + 19);
  });

  it("prices nothing for a plain gadget", () => {
    expect(gearPrice(api, item("equipment"))).toBeNull();
  });
});
