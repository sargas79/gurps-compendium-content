import { describe, expect, it } from "vitest";

import { slamDamage } from "../../../../system/src/rules/attack-options.js";
import { longCrouchPosture, longDamagePenalty, moveAndAttackRefusals, slamMayUseFullMove, slamThrust, strikingPart } from "./rules.js";

/** All-Out Attack (Long), slams and Move and Attack (GURPS Martial Arts pp. 97-98, 107). */
describe("All-Out Attack (Long)", () => {
  it("costs a swing -2 damage, or -1 per die, and leaves a thrust alone", () => {
    expect(longDamagePenalty("sw", 1)).toBe(-2);
    expect(longDamagePenalty("sw", 3)).toBe(-3);
    expect(longDamagePenalty("thr", 3)).toBe(0);
  });

  it("ends in a crouch on a DX roll, kneeling on a failure, down on a critical failure", () => {
    expect(longCrouchPosture({ success: true, criticalFailure: false })).toBe("crouching");
    expect(longCrouchPosture({ success: false, criticalFailure: false })).toBe("kneeling");
    expect(longCrouchPosture({ success: false, criticalFailure: true })).toBe("lying");
  });
});

describe("slams as All-Out Attacks", () => {
  it("take full Move with Determined, Feint or Strong, but not Long or Double", () => {
    expect(["determined", "feint", "strong"].every(slamMayUseFullMove)).toBe(true);
    expect(slamMayUseFullMove("double")).toBe(false);
    expect(slamMayUseFullMove("gurps-compendium-content.ma-long")).toBe(false);
  });
});

describe("Move and Attack", () => {
  it("reads what struck: a weapon, a shield, a hand, or a kick or bite", () => {
    expect(strikingPart({ type: "equipment" }, "Spear")).toBe("weapon");
    expect(strikingPart({ type: "shield" }, "Shield Bash")).toBe("shield");
    expect(strikingPart(null, "Punch")).toBe("hand");
    expect(strikingPart(null, "Kick")).toBe("other");
    expect(strikingPart(null, "Bite")).toBe("other");
  });

  it("takes the dodge after a kick and the block after a shield bash", () => {
    expect(moveAndAttackRefusals("other")).toEqual({ dodge: true, block: false });
    expect(moveAndAttackRefusals("shield")).toEqual({ dodge: false, block: true });
    expect(moveAndAttackRefusals("hand")).toEqual({ dodge: false, block: false });
  });

  it("lets a centaur's spear thrust use slam damage: ST 18, HP 18, Move 12, thr+3 is 2d+3", () => {
    // Thrust at ST 18 is 1d+2, so the spear does 1d+5.
    expect(slamThrust({ thrust: { dice: 1, adds: 5 }, slam: slamDamage(18, 12), weaponModifier: 3 })).toEqual({ dice: 2, adds: 3 });
    // A slow one does better with the spear.
    expect(slamThrust({ thrust: { dice: 1, adds: 5 }, slam: slamDamage(18, 3), weaponModifier: 3 })).toBeNull();
  });
});
