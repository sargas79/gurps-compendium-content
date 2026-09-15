import { describe, expect, it } from "vitest";

import { moduleAttackOf, spellAttackKind, stillRunning } from "./rules.js";

const M = "gurps-compendium-content";
const spell = (classes: string[], behavior: string) => ({ system: { classes, attack: { behavior } } });

/** Spells that attack without being Missile or Melee (GURPS Magic pp. 73-76). */
describe("which attack a spell makes", () => {
  it("aims a Regular spell and rains an Area one", () => {
    expect(spellAttackKind(["regular"])).toBe("jet");
    expect(spellAttackKind(["area"])).toBe("rain");
  });

  it("gives nothing to hit with to an Information, Enchantment or Blocking spell, and leaves Missile and Melee to the system", () => {
    expect(spellAttackKind(["information"])).toBeNull();
    expect(spellAttackKind(["regular", "information"])).toBeNull();
    expect(spellAttackKind(["enchantment"])).toBeNull();
    expect(spellAttackKind(["regular", "blocking"])).toBeNull();
    expect(spellAttackKind(["missile"])).toBeNull();
    expect(spellAttackKind(["melee"])).toBeNull();
  });

  it("takes a spell whose record names this module's behavior of the kind its classes allow", () => {
    expect(moduleAttackOf(spell(["regular"], `${M}.magic-jet`))).toBe("jet");
    expect(moduleAttackOf(spell(["area"], `${M}.magic-rain`))).toBe("rain");
    expect(moduleAttackOf(spell(["area"], `${M}.magic-jet`))).toBeNull();
    expect(moduleAttackOf(spell(["information"], `${M}.magic-jet`))).toBeNull();
    expect(moduleAttackOf(spell(["regular"], "other-module.jet"))).toBeNull();
    expect(moduleAttackOf(null)).toBeNull();
  });
});

describe("a running spell", () => {
  it("is still going until it runs out, or for good when it has no end", () => {
    expect(stillRunning({ expiresAt: 100 }, 99)).toBe(true);
    expect(stillRunning({ expiresAt: 100 }, 100)).toBe(false);
    expect(stillRunning({ expiresAt: null }, 1e9)).toBe(true);
    expect(stillRunning(null, 0)).toBe(false);
  });
});
