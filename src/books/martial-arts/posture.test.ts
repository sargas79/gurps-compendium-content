import { describe, expect, it } from "vitest";

import { attackKind, dropCost, postureEffect, postureOfDrop, tablePosture } from "./posture.js";

const hit = (effect: { hit: Array<{ value: number }> }) => effect.hit.reduce((s, l) => s + l.value, 0);

/** Postures, hit locations and techniques (GURPS Martial Arts pp. 98-99). */
describe("the posture tables", () => {
  it("adds -1 to hit and -1 to kick for a sitting fighter kicking a standing foe's face, for -11 in all", () => {
    const effect = postureEffect({ attacker: "sitting", target: "standing", kind: attackKind("Kick", null), location: "face" });
    expect(effect.refusal).toBeNull();
    // -2 sitting, -2 kick and -5 face are the system's; the table adds -1 and -1.
    expect(-2 - 2 - 5 + hit(effect)).toBe(-11);
    expect(effect.damage).toBe(-1);
  });

  it("rules out a kneeling fighter's kick, and costs a standing man's punch at a lying foe -2", () => {
    expect(postureEffect({ attacker: "kneeling", target: "standing", kind: "kick", location: "torso" }).refusal).toBe("prohibited");
    expect(hit(postureEffect({ attacker: "standing", target: "prone", kind: attackKind("Punch", null), location: "torso" }))).toBe(-2);
  });

  it("keeps a prone fighter's punch below a standing foe's groin, and lets a face-up fighter kick at +2 for -1 damage", () => {
    expect(postureEffect({ attacker: "prone", target: "standing", kind: "punch", location: "torso" }).refusal).toBe("outOfReach");
    expect(postureEffect({ attacker: "prone", target: "standing", kind: "punch", location: "groin" }).refusal).toBeNull();
    const kick = postureEffect({ attacker: "faceUp", target: "standing", kind: "kick", location: "leg" });
    expect(hit(kick)).toBe(4);
    expect(kick.damage).toBe(-1);
  });

  it("reads the system's lying posture as face-up or prone, and a weapon's reach", () => {
    expect(tablePosture("lying", true)).toBe("faceUp");
    expect(tablePosture("lying", false)).toBe("prone");
    expect(tablePosture("crouching", false)).toBe("standing");
    expect(attackKind("Swing", { reach: "C" })).toBe("closeWeapon");
    expect(attackKind("Swing", { reach: "1" })).toBe("reachWeapon");
    expect(attackKind("Jump Kick", null)).toBe("aerialKick");
  });
});

describe("dropping as part of an attack", () => {
  it("takes an Attack's whole step to dive prone, but only a point at the end of an All-Out Attack", () => {
    expect(dropCost("standing", "prone", "attack")).toBe("all");
    expect(dropCost("standing", "prone", "allOutAttack")).toBe("point");
    expect(dropCost("standing", "faceUp", "allOutAttack")).toBe("all");
    expect(dropCost("standing", "faceUp", "moveAndAttack")).toBe("point");
    expect(dropCost("kneeling", "prone", "moveAndAttack")).toBe("all");
    expect(dropCost("crawling", "prone", "attack")).toBeNull();
  });

  it("puts a dive prone and a fall face-up in the system's lying posture", () => {
    expect(postureOfDrop("prone")).toEqual({ posture: "lying", faceUp: false });
    expect(postureOfDrop("faceUp")).toEqual({ posture: "lying", faceUp: true });
    expect(postureOfDrop("kneeling")).toEqual({ posture: "kneeling", faceUp: false });
  });
});
