import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as rules from "../../../../system/src/rules/index.js";
import { clearFirearmGradeClaims, registerFirearmGradeClaim } from "../../../shared/firearm-grade.js";
import { adjustWeaponRows, concealmentOf, gearPrice } from "./effects.js";

const globals = globalThis as Record<string, unknown>;
const M = "gurps-compendium-content";
beforeAll(() => { globals.game = { gworld: { api: { rules } } }; });
afterAll(() => { delete globals.game; });

/** Just the API the effects read: the system's rules, and whether the Basic Set's weapon grades are in play. */
const api = (weaponQuality = false) => ({ rules, registry: { isRuleOn: (key: string) => key === "weaponQuality" && weaponQuality } }) as never;

const gear = (patch: Record<string, unknown> = {}) => ({ extensions: { [M]: patch } });

describe("prices under the book's gear rules (pp. 54, 59-61)", () => {
  it("makes a cutting-edge, rugged flashlight three times its list price at 0.8 of its weight", () => {
    const flashlight = { type: "equipment", system: { cost: 10, weight: 1, ...gear({ gadget: { cuttingEdge: true, rugged: true } }) } };
    expect(gearPrice(api(), flashlight)).toEqual({ cost: 30, weight: 0.8, costFactor: 2 });
    expect(gearPrice(api(), { type: "equipment", system: { cost: 10, weight: 1 } })).toBeNull();
  });

  it("prices a very fine sword at four times its list price, and a silver one at twenty", () => {
    const sword = (quality: string, material = "") => ({
      type: "equipment",
      system: { cost: 500, listCost: 500, weight: 3, quality, material, weaponClass: "sword", meleeModes: [{ skill: "Broadsword", damageType: "cut" }] },
    });
    expect(gearPrice(api(), sword("veryFine"))?.cost).toBe(2000);
    expect(gearPrice(api(), sword("good", "silver"))?.cost).toBe(10000);
    // Silver can't be very fine, so it is priced as the good silver sword it is allowed to be.
    expect(gearPrice(api(), sword("veryFine", "silver"))?.cost).toBe(10000);
  });
});

describe("attack rows under the book's gear rules", () => {
  const entry = (kind: "melee" | "ranged", mode: Record<string, unknown>, row: Record<string, unknown>, basis: Record<string, unknown>) =>
    ({ kind, mode, row: { notes: [], followUp: null, modeIndex: 0, ...row }, basis: { st: 10, armorDivisor: 1, halfDamageRange: 0, maxRange: 0, accuracy: 0, malfunction: null, ...basis } });
  const helpers = {
    addToDamage: (formula: string, bonus: number) => {
      const parsed = rules.parseDiceAdds(formula);
      return parsed && bonus ? rules.formatDiceAdds({ ...parsed, adds: parsed.adds + bonus }) : formula;
    },
    damageAt: () => "",
    rangeAt: () => ({ halfDamageRange: 0, maxRange: 0 }),
  };

  it("takes the Basic Set's very fine bonus back out and puts the book's in, with balanced's +1 skill", () => {
    const sword = { type: "equipment", name: "Sword", system: { quality: "veryFine", weaponClass: "sword", meleeModes: [{ skill: "Broadsword", damageType: "cut" }], ...gear({ weapon: { balanced: true } }) } };
    const row = entry("melee", { skill: "Broadsword", damageType: "cut" }, { skillLevel: 12, damage: "1d+3" }, { damage: "1d+1", damageType: "cut" });
    adjustWeaponRows(api(true), { item: sword, actor: { items: [] }, rows: [row], ...helpers }, (key) => ({ label: key, hint: "" }), "(follow-up)");
    // Basic Set very fine was already +2; the book's is +2 too, so only the skill moves.
    expect(row.row).toMatchObject({ skillLevel: 13, damage: "1d+3" });
  });

  it("gives a thermate load its lost damage, its burning follow-up, and a match-grade powder's Acc", () => {
    const rifle = {
      type: "equipment", name: "Rifle",
      system: { weaponClass: "firearm", rangedModes: [{ skill: "Guns (Rifle)", damageType: "pi" }], ...gear({ loads: [{ mode: 0, powder: "matchGrade", payload: "thermate" }] }) },
    };
    const row = entry("ranged", { skill: "Guns (Rifle)", damageType: "pi", projectiles: 1 }, { skillLevel: 12, damage: "7d", accuracy: 5, halfDamageRange: 700, maxRange: 3500 }, { damage: "7d", damageType: "pi", accuracy: 5, halfDamageRange: 700, maxRange: 3500 });
    adjustWeaponRows(api(), { item: rifle, actor: { items: [] }, rows: [row], ...helpers }, (key) => ({ label: key, hint: "" }), "(follow-up)");
    expect(row.row).toMatchObject({ damage: "7d-7", accuracy: 6, followUp: { damage: "1d-2", damageType: "burn", explosive: false, label: "(follow-up)" } });
  });

  it("leaves a fine gun's Acc to another book whose rule claims its quality, keeping a load's Acc", () => {
    const rifle = (loads: unknown[] = []) => ({
      type: "equipment", name: "Rifle",
      system: { quality: "fine", weaponClass: "firearm", rangedModes: [{ skill: "Guns (Rifle)", damageType: "pi" }], ...gear({ loads }) },
    });
    // The Basic Set's fine grade already in the row: Acc 5 +1.
    const rowFor = () => entry("ranged", { skill: "Guns (Rifle)", damageType: "pi", projectiles: 1 }, { skillLevel: 12, damage: "7d", accuracy: 6, halfDamageRange: 700, maxRange: 3500 }, { damage: "7d", damageType: "pi", accuracy: 5, halfDamageRange: 700, maxRange: 3500 });
    const adjust = (item: any) => {
      const row = rowFor();
      adjustWeaponRows(api(true), { item, actor: { items: [] }, rows: [row], ...helpers }, (key) => ({ label: key, hint: "" }), "(follow-up)");
      return (row.row as Record<string, unknown>).accuracy;
    };
    expect(adjust(rifle())).toBe(6);
    registerFirearmGradeClaim("high-tech", (item) => item?.name === "Rifle");
    try {
      // The row is left as the other book's rule leaves it, with or without a match-grade load's +1.
      expect(adjust(rifle())).toBe(6);
      expect(adjust(rifle([{ mode: 0, powder: "matchGrade" }]))).toBe(7);
    } finally {
      clearFirearmGradeClaims();
    }
  });
});

describe("concealment (p. 59)", () => {
  it("takes the best Holdout worn, with Undercover's, and Scent-Masking's -4 from clothing", () => {
    const actor = {
      items: [
        { type: "armor", name: "Long coat", system: { equipped: true, ...gear({ holdout: 4, gadget: { undercover: 1, scentMasking: true } }) } },
        { type: "armor", name: "Coat left at home", system: { equipped: false, ...gear({ holdout: 9 }) } },
      ],
    };
    expect(concealmentOf(actor)).toEqual({ holdout: 5, smell: -4, source: "Long coat" });
  });
});
