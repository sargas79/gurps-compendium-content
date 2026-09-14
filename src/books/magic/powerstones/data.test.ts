import { describe, expect, it } from "vitest";

import { rechargeUpdates, stoneFields, stoneOf, stonePatch, stonePrice, stonesForSpell } from "./data.js";

const M = "gurps-compendium-content";
const KEY = `system.extensions.${M}.powerstone`;

const stone = (id: string, powerstone: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, name: id, type: "equipment", system: { carried: true, ...extra, extensions: { [M]: { powerstone: { isStone: true, ...powerstone } } } },
});

describe("a Powerstone on a piece of equipment", () => {
  it("is only a stone when marked as one, on equipment", () => {
    expect(stoneOf(stone("a", { capacity: 5 }))?.capacity).toBe(5);
    expect(stoneOf(stone("a", { isStone: false }))).toBeNull();
    expect(stoneOf({ type: "armor", system: stone("a", {}).system })).toBeNull();
    expect(stoneFields({ type: "equipment", system: {} })).toMatchObject({ isStone: false, kind: "normal", pricedByCapacity: true, lastRecharged: null });
  });

  it("prices an ordinary stone by capacity, and leaves other kinds and unticked ones at their price", () => {
    expect(stonePrice(stone("a", { capacity: 10 }))).toBe(1900);
    expect(stonePrice(stone("a", { capacity: 11 }))).toBe(2250);
    expect(stonePrice(stone("a", { capacity: 10, kind: "manastone" }))).toBeNull();
    expect(stonePrice(stone("a", { capacity: 10, pricedByCapacity: false }))).toBeNull();
    expect(stonePrice({ type: "equipment", system: {} })).toBeNull();
  });

  it("holds the charge to the capacity, whichever of them changes", () => {
    const current = stoneFields(stone("a", { capacity: 10, charge: 8 }));
    expect(stonePatch(current, { capacity: 5 })).toEqual({ [`${KEY}.capacity`]: 5, [`${KEY}.charge`]: 5 });
    expect(stonePatch(current, { charge: 12 })).toEqual({ [`${KEY}.charge`]: 10 });
    expect(stonePatch(current, { kind: "manastone" })).toEqual({ [`${KEY}.kind`]: "manastone" });
  });
});

describe("the stones offered for a spell", () => {
  const fire = { system: { colleges: ["Fire"] } };
  const water = { system: { colleges: ["Water"] } };
  const items = [
    stone("plain", { capacity: 10, charge: 4 }),
    stone("fire", { capacity: 5, charge: 5, kind: "oneCollege", college: "Fire" }),
    stone("set", { capacity: 5, charge: 3, kind: "dedicated", setInto: "Wand of Fire" }),
    stone("empty", { capacity: 5, charge: 0 }),
    stone("stored", { capacity: 5, charge: 5 }, { carried: false }),
    { id: "rope", name: "rope", type: "equipment", system: {} },
  ];

  it("offers the carried, charged stones that may pay: a One-College one for its college only", () => {
    expect(stonesForSpell(items, fire, null).map((s) => s.id)).toEqual(["plain", "fire"]);
    expect(stonesForSpell(items, water, null).map((s) => s.id)).toEqual(["plain"]);
  });

  it("offers a dedicated stone for spells cast through its item, at half a point per energy", () => {
    const offered = stonesForSpell(items, water, { itemId: "w1", itemName: "Wand of Fire" });
    expect(offered.map((s) => s.id)).toEqual(["plain", "set"]);
    expect(offered.find((s) => s.id === "set")).toMatchObject({ available: 3, multiplier: 0.5 });
  });
});

describe("recharging a character's stones", () => {
  const day = 86400;

  it("starts a stone's clock on its first recharge, then regains a point per day in normal mana", () => {
    const fresh = [{ id: "a", data: stoneFields(stone("a", { capacity: 5, charge: 1 })), carried: false }];
    expect(rechargeUpdates(fresh, "normal", 1000)).toEqual({ updates: [{ _id: "a", [`${KEY}.lastRecharged`]: 1000 }], gained: 0 });
    const kept = [{ id: "a", data: stoneFields(stone("a", { capacity: 5, charge: 1, lastRecharged: 0 })), carried: false }];
    expect(rechargeUpdates(kept, "normal", 2.5 * day)).toEqual({ updates: [{ _id: "a", [`${KEY}.charge`]: 3, [`${KEY}.lastRecharged`]: 2 * day }], gained: 2 });
  });

  it("recharges only the larger of two carried stones, and never a Manastone", () => {
    const stones = [
      { id: "big", data: stoneFields(stone("big", { capacity: 7, charge: 5, lastRecharged: 0 })), carried: true },
      { id: "small", data: stoneFields(stone("small", { capacity: 3, charge: 0, lastRecharged: 0 })), carried: true },
      { id: "mana", data: stoneFields(stone("mana", { capacity: 9, charge: 0, kind: "manastone", lastRecharged: 0 })), carried: true },
    ];
    const { updates, gained } = rechargeUpdates(stones, "normal", 3 * day);
    expect(updates.map((u) => u[`${KEY}.charge`])).toEqual([7, 0, 0]);
    expect(gained).toBe(2);
    // A stone that filled starts its clock again now.
    expect(updates[0]![`${KEY}.lastRecharged`]).toBe(3 * day);
  });
});
