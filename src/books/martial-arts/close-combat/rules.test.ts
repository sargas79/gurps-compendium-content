import { describe, expect, it } from "vitest";

import {
  allOutGrappling,
  closeCombatPenalty,
  followsGrapple,
  grappledDefense,
  haftOnly,
  oneHandedStrangle,
  shiftGripBonus,
  sitOnHimModifiers,
  sprawlResult,
  throwLocation,
  victimOpening,
} from "./rules.js";

/** Close combat (GURPS Martial Arts pp. 114, 116-119, 121-122). */
describe("grappling after All-Out and Committed Attacks", () => {
  it("loses a takedown or pin outright after an All-Out Attack, and rolls at -2 after a Committed Attack", () => {
    expect(followsGrapple("takedown")).toBe(true);
    expect(followsGrapple("choke")).toBe(false);
    expect(victimOpening("allOut")).toEqual({ loses: true, modifier: 0 });
    expect(victimOpening("committed")).toEqual({ loses: false, modifier: -2 });
  });

  it("gives Determined +4 to a DX-based roll and Strong +2 to a ST-based one", () => {
    expect([allOutGrappling("determined", false), allOutGrappling("determined", true), allOutGrappling("strong", true)]).toEqual([4, 0, 2]);
  });
});

describe("one hand, grips and throws", () => {
  it("strangles one-handed at half ST: a ST 12 grappler rolls against 6", () => {
    expect(oneHandedStrangle(12)).toBe(6);
    expect(oneHandedStrangle(13)).toBe(6);
  });

  it("gives +3 to the fighter with more free hands, and sizes a sit-on", () => {
    expect(shiftGripBonus(1, 2)).toEqual({ grappler: 0, victim: 3 });
    expect(shiftGripBonus(2, 1)).toEqual({ grappler: 3, victim: 0 });
    expect(sitOnHimModifiers(1, 0)).toEqual({ grappler: 3, victim: 0 });
    expect(sitOnHimModifiers(0, 0, 4)).toEqual({ grappler: 0, victim: 4 });
  });

  it("throws from an arm, hand, neck or leg lock, and sprawls", () => {
    expect([throwLocation("arm"), throwLocation("torso")]).toEqual(["arm", null]);
    expect(sprawlResult("tie")).toEqual({ sprawlerFalls: true, takerFalls: true, grappleLost: true });
    expect(sprawlResult("first")).toEqual({ sprawlerFalls: true, takerFalls: false, grappleLost: false });
  });
});

describe("defense while grappling, and long weapons", () => {
  it("costs a grappled fighter -2 to Block and Parry and -1 to Dodge", () => {
    expect([grappledDefense("parry"), grappledDefense("block"), grappledDefense("dodge")]).toEqual([-2, -2, -1]);
  });

  it("puts a spear (reach 1, 2*) at -8 to attack and -4 to parry, and spares a weapon with C", () => {
    expect(closeCombatPenalty("1,2*")).toEqual({ skill: -8, parry: -4, swing: -2 });
    expect(closeCombatPenalty("C,1")).toEqual({ skill: 0, parry: 0, swing: 0 });
    expect(haftOnly("Polearm", "2,3*")).toBe(true);
    expect(haftOnly("Broadsword", "1")).toBe(false);
  });
});

describe("more actions after a grapple (pp. 116-119)", () => {
  it("squeezes only a torso held in two limbs, by somebody bigger", async () => {
    const { bearHugRefusal } = await import("./rules.js");
    const base = { hitLocation: "torso", hands: 2, limbs: "arms" as const, smGrappler: 1, smVictim: 0, fatigueOnly: false, victimWeight: 150, basicLift: 20 };
    expect(bearHugRefusal(base)).toBeNull();
    expect(bearHugRefusal({ ...base, hitLocation: "neck" })).toBe("torso");
    expect(bearHugRefusal({ ...base, hands: 1 })).toBe("hands");
    expect(bearHugRefusal({ ...base, hands: 1, limbs: "legs" })).toBeNull();
    expect(bearHugRefusal({ ...base, smGrappler: 0 })).toBe("size");
    expect(bearHugRefusal({ ...base, smGrappler: 0, fatigueOnly: true, victimWeight: 80, basicLift: 20 })).toBeNull();
    expect(bearHugRefusal({ ...base, smGrappler: 0, fatigueOnly: true, victimWeight: 81, basicLift: 20 })).toBe("size");
  });

  it("gives the bear hug its lines", async () => {
    const { bearHugModifiers } = await import("./rules.js");
    expect(bearHugModifiers({ constriction: false, limbs: "legs" })).toEqual([{ key: "noConstriction", value: -5 }, { key: "legs", value: 2 }]);
    expect(bearHugModifiers({ constriction: true, limbs: "arms" })).toEqual([]);
  });

  it("costs a one-handed lock its hand or the crook of an arm", async () => {
    const { oneHandedPenalty } = await import("./rules.js");
    expect([oneHandedPenalty("hand"), oneHandedPenalty("crook"), oneHandedPenalty("")]).toEqual([-2, -4, 0]);
  });

  it("needs an attacking maneuver, and allows two only on All-Out Attack (Double)", async () => {
    const { grappleActionAllowed, grappleActionsAllowed } = await import("./rules.js");
    expect(grappleActionAllowed("attack", false)).toBe(true);
    expect(grappleActionAllowed("allOutAttack", false)).toBe(true);
    expect(grappleActionAllowed("attack", true)).toBe(true);
    expect(grappleActionAllowed("move", false)).toBe(false);
    expect(grappleActionsAllowed("allOutAttack", "double")).toBe(2);
    expect(grappleActionsAllowed("allOutAttack", "strong")).toBe(1);
    expect(grappleActionsAllowed("attack", "double")).toBe(1);
  });

  it("holds a long weapon to its haft until a Ready chokes it up, and again after", async () => {
    const { haftRefused } = await import("./rules.js");
    expect(haftRefused({ inClose: true, chokedUp: false })).toBe(true);
    expect(haftRefused({ inClose: true, chokedUp: true })).toBe(false);
    expect(haftRefused({ inClose: false, chokedUp: true })).toBe(true);
    expect(haftRefused({ inClose: false, chokedUp: false })).toBe(false);
  });
});
