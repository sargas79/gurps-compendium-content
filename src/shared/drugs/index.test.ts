/**
 * The shared poison engine: a book's table registered under its own switch,
 * and its doses known by their source (decision D1: High-Tech's poisons
 * need no other book).
 */

import { describe, expect, it } from "vitest";

import { MODULE_ID } from "../module.js";
import * as rules from "../../../system/src/rules/index.js";
import { doseDelivery, doublingPenalty, overdosePoison, overdoseSeconds, overdoses, poisonDose, poisonKeyOf, poisonNumbers, protectedByDelivery, registerPoisonTable, type PoisonTable } from "./index.js";

const table: PoisonTable<"venom" | "gas"> = {
  book: "some-book",
  poisons: {
    venom: poisonNumbers({ delivery: ["blood"], resistanceModifier: -3, damage: "toxic", dice: 1, reference: "A p. 1" }),
    gas: poisonNumbers({ delivery: ["respiratory"], reference: "A p. 2" }),
  },
  labelPrefix: "X.Poison",
  available: (key) => key === "venom",
};

describe("the shared poison engine", () => {
  it("fills in what a poison leaves out", () => {
    expect(table.poisons.gas).toEqual({ delivery: ["respiratory"], delaySeconds: 0, resistanceModifier: null, damage: "none", dice: 0, adds: 0, intervalSeconds: 0, cycles: 1, reference: "A p. 2" });
  });

  it("registers each poison of a table under the table's own availability", () => {
    const registered: any[] = [];
    registerPoisonTable({ data: { registerPoison: (p: any) => registered.push(p) } } as never, table);
    expect(registered.map((r) => [r.module, r.key, r.label, r.available()])).toEqual([
      [MODULE_ID, "venom", "X.Poison.venom", true],
      [MODULE_ID, "gas", "X.Poison.gas", false],
    ]);
  });

  it("makes a dose that names its source, and knows its own doses by it", () => {
    const dose = poisonDose(table, "venom", "Venom", { delivery: ["contact"] });
    expect(dose).toMatchObject({ name: "Venom", source: `${MODULE_ID}.venom`, delivery: ["contact"], dice: 1 });
    expect(poisonKeyOf(table, dose.source)).toBe("venom");
    expect(poisonKeyOf(table, `${MODULE_ID}.nerveGas`)).toBeNull();
    expect(poisonKeyOf(table, "other-module.venom")).toBeNull();
    expect(poisonKeyOf(table, null)).toBeNull();
  });

  it("keeps out what a sealed suit, a body that doesn't breathe, or no metabolism keeps out", () => {
    const open = { sealed: false, doesntBreathe: false, filterLungs: false, metabolicImmunity: false };
    expect(protectedByDelivery(["contact"], { ...open, sealed: true })).toBe("sealed");
    expect(protectedByDelivery(["respiratory"], { ...open, filterLungs: true })).toBe("breath");
    expect(protectedByDelivery(["digestive"], { ...open, sealed: true })).toBeNull();
    expect(protectedByDelivery(["digestive"], { ...open, metabolicImmunity: true })).toBe("metabolic");
  });

  it("knows a dose's delivery by a registered table's source or a Basic Set example's name, else not at all", () => {
    registerPoisonTable({ data: { registerPoison: () => undefined } } as never, table);
    const api = { rules } as never;
    expect(doseDelivery(api, { source: `${MODULE_ID}.gas`, name: "Gas" })).toEqual(["respiratory"]);
    expect(doseDelivery(api, { name: "Arsenic" })).toEqual(["digestive"]);
    expect(doseDelivery(api, { name: "Something the GM made" })).toBeNull();
  });

  it("takes -2 per doubling of a dose, and overdoses only on a critical failure for two doses or more (Campaigns p. 441)", () => {
    expect([1, 2, 3, 4, 8].map(doublingPenalty)).toEqual([0, -2, -2, -4, -6]);
    expect(overdoses(2, { criticalFailure: true })).toBe(true);
    expect(overdoses(1, { criticalFailure: true })).toBe(false);
    expect(overdoses(2, { criticalFailure: false })).toBe(false);
    expect(overdoseSeconds(3)).toBe(3 * 3600);
    expect(overdoseSeconds(0)).toBe(3600);
    expect(overdosePoison(-4)).toMatchObject({ resistanceModifier: -4, damage: "toxic", dice: 0, adds: 1, intervalSeconds: 900, cycles: 24 });
  });
});
