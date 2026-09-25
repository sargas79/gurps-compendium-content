import { describe, expect, it } from "vitest";

import { POISON_EXAMPLES } from "../../../../system/src/rules/poison.js";
import { airburstBonus, airbursts, bulletPoisons, expands, longBurst, mayFailToExpand, selfDestructRange, unexpanded } from "./rounds.js";

const gun = (cls: string, tl = 7): any => ({ calibre: { class: cls }, tl });
const fired = (patch: Record<string, unknown>): any => ({ projectile: "", material: "", projectileUpgrades: [], shotMm: 0, shotCount: 0, poisonCost: 0, ...patch });

describe("hollow-points failing to expand (p. 167)", () => {
  it("is a handgun's hollow-point or poison bullet's", () => {
    expect(mayFailToExpand(fired({ projectile: "hollowPoint" }), gun("handgun"))).toBe(true);
    expect(mayFailToExpand(fired({ projectile: "poison" }), gun("handgun"))).toBe(true);
    expect(mayFailToExpand(fired({ projectile: "hollowPoint" }), gun("rifle"))).toBe(false);
    expect(mayFailToExpand(fired({ projectile: "ap" }), gun("handgun"))).toBe(false);
  });

  it("expands on 1d <= TL-3", () => {
    expect(expands(7, 4)).toBe(true);
    expect(expands(7, 5)).toBe(false);
    expect(expands(5, 3)).toBe(false);
  });

  it("hits as the solid bullet when it doesn't: its own type, the (0.5) gone", () => {
    expect(unexpanded({ type: "pi+", armorDivisor: 0.5 }, "pi")).toEqual({ type: "pi", armorDivisor: 1 });
    expect(unexpanded({ type: "pi++", armorDivisor: 0.5 }, "pi++")).toEqual({ type: "pi++", armorDivisor: 1 });
    expect(unexpanded({ type: "pi", armorDivisor: 0.5 }, "")).toEqual({ type: "pi-", armorDivisor: 1 });
  });
});

describe("the other projectiles and upgrades (pp. 167, 174-175)", () => {
  it("offers a poison bullet the Basic Set's blood, contact and follow-up poisons", () => {
    const names = bulletPoisons(POISON_EXAMPLES);
    expect(names).toContain("Cyanide");
    expect(names).toContain("Cobra Venom");
    expect(names).not.toContain("Arsenic");
    expect(names).not.toContain("Tear Gas");
  });

  it("gives an airburst +4, a TL5-6 time fuse +3, or +1 at a flier", () => {
    expect(airburstBonus(7, false)).toBe(4);
    expect(airburstBonus(8, true)).toBe(4);
    expect(airburstBonus(6, false)).toBe(3);
    expect(airburstBonus(5, true)).toBe(1);
    expect(airbursts(fired({ projectileUpgrades: ["airburst"] }))).toBe(true);
    expect(airbursts(fired({ projectile: "shrapnel" }))).toBe(true);
    expect(airbursts(fired({ projectile: "he" }))).toBe(false);
  });

  it("destroys a self-destructing round at 1/2D, or at Max where there is none", () => {
    expect(selfDestructRange(300, 3000)).toBe(300);
    expect(selfDestructRange(0, 440)).toBe(440);
  });

  it("counts a burst of the full RoF, and suppression, as long", () => {
    expect(longBurst({ kind: "rapidFire", fired: 10 }, 10)).toBe(true);
    expect(longBurst({ kind: "rapidFire", fired: 4 }, 10)).toBe(false);
    expect(longBurst({ kind: "suppression", fired: 5 }, 10)).toBe(true);
    expect(longBurst({ kind: "single", fired: 1 }, 1)).toBe(false);
  });
});
