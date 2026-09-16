import { describe, expect, it } from "vitest";

import {
  ASSUMED_HEALTH,
  antiqueLegality,
  costFactor,
  gadgetDr,
  gadgetHealth,
  gadgetPrice,
  maintenanceThreshold,
  needsMaintenanceChecks,
  smFactor,
  stylingCost,
  NO_OPTIONS,
} from "./rules.js";

const options = (patch: Partial<typeof NO_OPTIONS> = {}) => ({ ...NO_OPTIONS, ...patch });

describe("gadget options (Ultra-Tech p. 15)", () => {
  it("doubles a mass-produced disguise and quintuples a custom one", () => {
    expect(costFactor(options({ disguise: "massProduced" }))).toBe(2);
    expect(costFactor(options({ disguise: "custom" }))).toBe(5);
  });

  it("charges styling between twice and ten times, and nothing below that", () => {
    expect(stylingCost(0)).toBe(1);
    expect(stylingCost(1)).toBe(1);
    expect(stylingCost(3)).toBe(3);
    expect(stylingCost(40)).toBe(10);
  });

  it("doubles the price and adds a fifth to the weight of a rugged gadget", () => {
    const rugged = gadgetPrice({ listCost: 100, listWeight: 5, options: options({ rugged: true }) });
    expect(rugged).toMatchObject({ cost: 200, weight: 6 });
  });

  it("halves a cheap gadget's price at half again its weight, and leaves its cells out of that", () => {
    expect(gadgetPrice({ listCost: 200, listWeight: 4, options: options({ grade: "cheap" }) })).toMatchObject({ cost: 100, weight: 6 });
    // Two pounds of it are power cells: only the other two weigh half again.
    expect(gadgetPrice({ listCost: 200, listWeight: 4, cellWeight: 2, options: options({ grade: "cheap" }) })).toMatchObject({ cost: 100, weight: 5 });
  });

  it("charges twice for an expensive gadget at two thirds the weight", () => {
    const light = gadgetPrice({ listCost: 300, listWeight: 3, options: options({ grade: "expensive" }) });
    expect(light.cost).toBe(600);
    expect(light.weight).toBe(2);
  });

  it("multiplies the options together", () => {
    // A custom-disguised, styled, rugged gadget: 5 x 4 x 2.
    expect(costFactor(options({ disguise: "custom", styling: 4, rugged: true }))).toBe(40);
  });
});

describe("adjusting for SM (Ultra-Tech p. 16)", () => {
  it("leaves an ordinary-sized user's gadget alone", () => {
    expect(smFactor(0)).toBe(1);
  });

  it("follows the table on either side", () => {
    expect(smFactor(1)).toBe(2);
    expect(smFactor(3)).toBe(10);
    expect(smFactor(10)).toBe(2000);
    expect(smFactor(-1)).toBe(1 / 2);
    expect(smFactor(-2)).toBe(1 / 5);
  });

  it("holds at the ends of the table", () => {
    expect(smFactor(-9)).toBe(1 / 20);
    expect(smFactor(14)).toBe(2000);
  });
});

describe("a gadget's statistics (Ultra-Tech p. 17)", () => {
  it("assumes HT 10, and HT 12 when the gadget is rugged", () => {
    expect(gadgetHealth({})).toBe(ASSUMED_HEALTH);
    expect(gadgetHealth({ rugged: true })).toBe(12);
    expect(gadgetHealth({ rugged: true, own: 11 })).toBe(13);
  });

  it("assumes plastic, and knows a weapon from a solid metal one", () => {
    expect(gadgetDr({ build: "plastic" })).toBe(2);
    expect(gadgetDr({ build: "weapon" })).toBe(4);
    expect(gadgetDr({ build: "solidMelee" })).toBe(6);
  });

  it("gives armour its own DR, and doubles what a rugged gadget has", () => {
    expect(gadgetDr({ build: "own", own: 20 })).toBe(20);
    expect(gadgetDr({ build: "own", own: 20, rugged: true })).toBe(40);
    expect(gadgetDr({ build: "plastic", rugged: true })).toBe(4);
  });
});

describe("maintenance (Ultra-Tech p. 14)", () => {
  it("rises with the campaign's TL", () => {
    expect(maintenanceThreshold(9)).toBe(30);
    expect(maintenanceThreshold(10)).toBe(50);
    expect(maintenanceThreshold(11)).toBe(75);
    expect(maintenanceThreshold(12)).toBe(100);
    expect(maintenanceThreshold(8)).toBe(30);
    expect(maintenanceThreshold(14)).toBe(100);
  });

  it("leaves a simple object out of the checks", () => {
    expect(needsMaintenanceChecks({ cost: 20, tl: 9 })).toBe(false);
    expect(needsMaintenanceChecks({ cost: 40, tl: 9 })).toBe(true);
    expect(needsMaintenanceChecks({ cost: 40, tl: 10 })).toBe(false);
  });
});

describe("legality and antiques (Ultra-Tech p. 14)", () => {
  it("raises a TL10 gauss rifle's LC by one, two TLs later", () => {
    expect(antiqueLegality({ lc: 2, tl: 10, campaignTl: 12 })).toEqual({ lc: 3, steps: 1 });
  });

  it("waits for two full TLs", () => {
    expect(antiqueLegality({ lc: 2, tl: 10, campaignTl: 11 })).toEqual({ lc: 2, steps: 0 });
  });

  it("rises no further than two steps", () => {
    expect(antiqueLegality({ lc: 0, tl: 5, campaignTl: 12 })).toEqual({ lc: 2, steps: 2 });
  });

  it("stops at LC4", () => {
    expect(antiqueLegality({ lc: 3, tl: 6, campaignTl: 12 })).toEqual({ lc: 4, steps: 1 });
    expect(antiqueLegality({ lc: 4, tl: 6, campaignTl: 12 })).toEqual({ lc: 4, steps: 0 });
  });

  it("leaves an item with no LC, or no TL, as it is", () => {
    expect(antiqueLegality({ lc: null, tl: 9, campaignTl: 12 })).toEqual({ lc: null, steps: 0 });
    expect(antiqueLegality({ lc: 2, tl: null, campaignTl: 12 })).toEqual({ lc: 2, steps: 0 });
  });
});
