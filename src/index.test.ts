import { describe, expect, it, vi } from "vitest";

import { BOOKS } from "./books/index.js";
import { readyBooks, registerBookRules, type BookRules } from "./shared/book.js";
import { MODULE_ID } from "./shared/module.js";

// The rules engine may be used in tests, straight from the pinned system's
// source, so a book's rule can be checked against the Basic Set's without
// Foundry. Only tests may: the module's own code reaches the system through
// game.gworld.api alone, and the build fails on anything else.
import { parseDiceAdds } from "../system/src/rules/dice.js";

function registry() {
  return {
    registerRuleGroup: vi.fn((g: { module: string; id: string }) => `${g.module}.${g.id}`),
    registerRule: vi.fn(() => "x"),
  };
}

describe("the books' rule groups", () => {
  it("registers one group per book, named for the book, under this module", () => {
    const r = registry();
    registerBookRules(BOOKS, r as never);
    expect(r.registerRuleGroup.mock.calls.map((c) => c[0])).toEqual([
      { module: MODULE_ID, id: "monster-hunters-1", label: "GURPS Monster Hunters 1" },
      { module: MODULE_ID, id: "magic", label: "GURPS Magic" },
      { module: MODULE_ID, id: "martial-arts", label: "GURPS Martial Arts" },
    ]);
    // Monster Hunters 1's switches, all in its own group and off by default.
    const keys = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "monster-hunters-1");
    expect(keys.map((rule: any) => rule.key)).toEqual(["talentsSkipWildcards", "holyAttacks", "ritualPathMagic", "monsterHuntersGear", "bonusPointSpending"]);
    expect(keys.every((rule: any) => rule.default === false && rule.module === MODULE_ID)).toBe(true);
    // GURPS Magic's switches, likewise.
    const magic = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "magic");
    expect(magic.map((rule: any) => [rule.key, rule.default, rule.reference])).toEqual([["powerstones", false, "GURPS Magic pp. 20, 69-70"], ["spellAttacks", false, "GURPS Magic pp. 73-76, 187-198"]]);
    const martialArts = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "martial-arts");
    expect(martialArts.map((rule: any) => [rule.key, rule.default, rule.reference])).toEqual([["committedDefensiveAttack", false, "Martial Arts pp. 99-100"], ["allOutAttackOptions", false, "Martial Arts pp. 97-98"], ["moveAndAttack", false, "Martial Arts p. 107"], ["acrobatics", false, "Martial Arts pp. 98, 105-107"], ["postures", false, "Martial Arts pp. 98-99"], ["feints", false, "Martial Arts pp. 49, 100-101"], ["readying", false, "Martial Arts pp. 101-104"], ["meleeOptions", false, "Martial Arts pp. 109-113"], ["styles", false, "Martial Arts pp. 49, 141-148"], ["training", false, "Martial Arts pp. 147, 232-233"], ["weaponBuilding", false, "Martial Arts pp. 214, 216-218, 221"], ["finerHitLocations", false, "Martial Arts p. 137"], ["multipleAttacks", false, "Martial Arts pp. 126-128"], ["cinematicRapidStrike", false, "Martial Arts p. 127"]]);
  });

  it("lets a book register its switches in its own group, and keeps going past one that fails", () => {
    const r = registry();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: BookRules = { slug: "a", label: "A", registerRules: () => { throw new Error("boom"); } };
    const working: BookRules = { slug: "b", label: "B", registerRules: (reg, group) => { reg.registerRule({ module: MODULE_ID, group, key: "k", name: "K", reference: "", default: false }); } };
    registerBookRules([failing, working], r as never);
    expect(r.registerRule).toHaveBeenCalledWith(expect.objectContaining({ group: "b", key: "k", default: false }));
  });

  it("skips a book's switches when its group was refused", () => {
    const r = registry();
    r.registerRuleGroup.mockReturnValueOnce(null as never);
    const book: BookRules = { slug: "a", label: "A", registerRules: vi.fn() };
    registerBookRules([book], r as never);
    expect(book.registerRules).not.toHaveBeenCalled();
  });

  it("hands each book the API once the world is ready", () => {
    const ready = vi.fn();
    const api = { version: "1.6.0" };
    readyBooks([{ slug: "a", label: "A", ready }], api as never);
    expect(ready).toHaveBeenCalledWith(api);
  });
});

describe("the system's rules engine, in tests", () => {
  it("can be imported from the pinned system", () => {
    expect(parseDiceAdds("2d+1")).toEqual({ dice: 2, adds: 1 });
  });
});
