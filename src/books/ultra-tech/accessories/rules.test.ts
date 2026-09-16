import { describe, expect, it } from "vitest";

import {
  accessControlCost,
  activeSensorTargeting,
  armourySkillFor,
  articulatedFits,
  articulatedMinSt,
  circumventSelfDestruct,
  graviticCompensator,
  harnessPrice,
  hasSmartgunElectronics,
  hudLinkBonus,
  iffRange,
  minStPenaltyAfter,
  powerHolsterBonus,
  scopeAfterAiming,
  scopeBonus,
  scopeMagnification,
  scopeVision,
  sniperMirrorRange,
  tacNetBonus,
  targetTracking,
  targetingProgramBonus,
} from "./rules.js";

describe("targeting scopes (Ultra-Tech p. 149)", () => {
  it("gives the CTS +2 to +4 and the ETS one more", () => {
    expect(scopeBonus("cts", 9)).toBe(2);
    expect(scopeBonus("cts", 10)).toBe(2);
    expect(scopeBonus("cts", 11)).toBe(3);
    expect(scopeBonus("cts", 12)).toBe(4);
    expect(scopeBonus("ets", 9)).toBe(3);
    expect(scopeBonus("ets", 12)).toBe(5);
  });

  it("magnifies and sees by TL", () => {
    expect(scopeMagnification("cts", 10)).toBe(4);
    expect(scopeMagnification("cts", 12)).toBe(16);
    expect(scopeMagnification("ets", 11)).toBe(16);
    expect(scopeMagnification("ets", 12)).toBe(32);
    expect(scopeVision("cts", 9)).toBe("infravision");
    expect(scopeVision("cts", 10)).toBe("hyperspectral");
    expect(scopeVision("ets", 9)).toBe("hyperspectral");
  });

  it("is worth a point a second aimed, up to its bonus", () => {
    expect(scopeAfterAiming(5, 2)).toBe(2);
    expect(scopeAfterAiming(3, 4)).toBe(3);
    expect(scopeAfterAiming(3, 0)).toBe(0);
  });
});

describe("HUD links and smartgun electronics (Ultra-Tech p. 149)", () => {
  it("gives +1 within 300 yards, not beside a scope", () => {
    expect(hudLinkBonus(250, 0)).toBe(1);
    expect(hudLinkBonus(301, 0)).toBe(0);
    expect(hudLinkBonus(null, 0)).toBe(1);
    expect(hudLinkBonus(100, 2)).toBe(0);
  });

  it("comes with every TL9+ firearm", () => {
    expect(hasSmartgunElectronics(9, true)).toBe(true);
    expect(hasSmartgunElectronics(8, true)).toBe(false);
    expect(hasSmartgunElectronics(11, false)).toBe(false);
  });
});

describe("tactical programs (Ultra-Tech pp. 149-150)", () => {
  it("gives targeting +1 or +2 and TacNet +1 or +2", () => {
    expect(targetingProgramBonus(3)).toBe(1);
    expect(targetingProgramBonus(4)).toBe(2);
    expect(targetingProgramBonus(2)).toBe(0);
    expect(tacNetBonus(5)).toBe(1);
    expect(tacNetBonus(6)).toBe(2);
    expect(tacNetBonus(4)).toBe(0);
  });

  it("tracks more targets at a Complexity and a doubling a tenfold step", () => {
    expect(targetTracking(10)).toEqual({ complexity: 2, costMultiplier: 5 });
    expect(targetTracking(100)).toEqual({ complexity: 3, costMultiplier: 10 });
    expect(targetTracking(101)).toEqual({ complexity: 4, costMultiplier: 20 });
    expect(targetTracking(1000)).toEqual({ complexity: 4, costMultiplier: 20 });
  });

  it("replaces every bonus with the weapon's Acc when slaved to a locked sensor", () => {
    expect(activeSensorTargeting(6)).toBe(6);
  });
});

describe("harnesses, grips and mounts (Ultra-Tech pp. 150-152)", () => {
  it("prices a harness by the loaded weight", () => {
    expect(harnessPrice("gyrostabilized", 10)).toEqual({ cost: 3000, weight: 10, lc: 4 });
    expect(harnessPrice("articulated", 20)).toEqual({ cost: 1000, weight: 10, lc: 4 });
    expect(harnessPrice("servomount", 7)).toEqual({ cost: 12000, weight: 21, lc: 3 });
  });

  it("works an articulated harness as a bipod for heavy weapons", () => {
    expect(articulatedMinSt(15)).toBe(10);
    expect(articulatedMinSt(13)).toBe(9);
    expect(articulatedMinSt(null)).toBe(null);
    expect(articulatedFits(-5)).toBe(true);
    expect(articulatedFits(-3)).toBe(false);
  });

  it("prices a gravitic compensator per 10 pounds or fraction", () => {
    expect(graviticCompensator(7)).toEqual({ cost: 100, weight: 1, cells: 1 });
    expect(graviticCompensator(21)).toEqual({ cost: 300, weight: 3, cells: 3 });
  });

  it("only eases a row's ST penalty", () => {
    expect(minStPenaltyAfter(10, 12, -3)).toBe(-2);
    expect(minStPenaltyAfter(10, 9, -1)).toBe(0);
    expect(minStPenaltyAfter(10, 14, 0)).toBe(0);
  });
});

describe("access control and other accessories (Ultra-Tech pp. 150-151)", () => {
  it("charges for the grip or ring the smartgun didn't include", () => {
    expect(accessControlCost("grip", true)).toBe(0);
    expect(accessControlCost("both", true)).toBe(100);
    expect(accessControlCost("both", false)).toBe(200);
    expect(accessControlCost("", false)).toBe(0);
  });

  it("works out a try at the self-destruct", () => {
    expect(circumventSelfDestruct(true, false)).toBe("disabled");
    expect(circumventSelfDestruct(false, false)).toBe("countdown");
    expect(circumventSelfDestruct(false, true)).toBe("explodes");
  });

  it("gives the IFF range, the holster's bonus and the mirror's range", () => {
    expect(iffRange(9)).toBe(500);
    expect(iffRange(11)).toBe(2000);
    expect(powerHolsterBonus(9)).toBe(4);
    expect(powerHolsterBonus(10)).toBe(5);
    expect(sniperMirrorRange(40, 60)).toBe(100);
  });

  it("repairs a heavy weapon with Armoury (Heavy Weapons)", () => {
    expect(armourySkillFor("Gunner (Beams)")).toBe("Armoury (Heavy Weapons)");
    expect(armourySkillFor("Beam Weapons (Pistol)")).toBe("Armoury (Small Arms)");
  });
});
