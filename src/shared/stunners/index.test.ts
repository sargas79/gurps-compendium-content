/**
 * The shared contact-stunner engine: each book's items take their own
 * book's table and need only that book's switch (decision D1).
 */

import { afterEach, describe, expect, it } from "vitest";

import { MODULE_ID } from "../module.js";
import { STUNNER_TABLES, contactDrBonus, resetStunners, stunnerTableOf, type StunnerTable } from "./index.js";

const table = (book: string, on: boolean, name: RegExp): StunnerTable => ({ book, on: () => on, applies: (item) => name.test(String(item?.name ?? "")), armorDivisor: 0.5, label: () => book });
const item = (name: string, book?: string) => ({ name, flags: book ? { [MODULE_ID]: { book } } : {} });

afterEach(() => resetStunners());

describe("contact stunners (Ultra-Tech p. 165, High-Tech p. 199)", () => {
  it("gives armour +2 a point at (0.5), metallic armour counting as DR 1", () => {
    expect(contactDrBonus(3, 0.5, false)).toBe(6);
    expect(contactDrBonus(5, 0.5, true)).toBe(2);
    expect(contactDrBonus(3, 1, false)).toBe(3);
    expect(contactDrBonus(0, 0.5, false)).toBe(0);
  });

  it("takes an item's own book's table, and only while that book's switch is on", () => {
    STUNNER_TABLES.register(table("ultra-tech", false, /stun wand/i));
    STUNNER_TABLES.register(table("high-tech", true, /stun baton/i));
    expect(stunnerTableOf(item("Stun Baton", "high-tech"))?.book).toBe("high-tech");
    expect(stunnerTableOf(item("Stun Wand", "ultra-tech"))).toBeNull();
    expect(stunnerTableOf(item("Stun Baton"))?.book).toBe("high-tech");
    expect(stunnerTableOf(item("Stun Wand", "high-tech"))).toBeNull();
  });
});
