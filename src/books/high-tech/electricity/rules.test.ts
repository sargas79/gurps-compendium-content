import { describe, expect, it } from "vitest";

import { lethalShockModifier, parseDiceAdds } from "../../../../system/src/rules/index.js";
import {
  INJURY_STEP,
  acExtraModifier,
  inducedPenalty,
  largeBoltMultiplier,
  lightningRodDamage,
  nonlethalCanStopHeart,
  shieldDr,
  shockGear,
  sparkTarget,
  stopsHeart,
  voltageDamage,
  weakShock,
  weakShockBonus,
  workShocks,
} from "./rules.js";

describe("the HT roll's step for each current (HT:EE p. 9)", () => {
  it("DC is the Basic Set's -1 per 2 points", () => {
    expect(lethalShockModifier(5, INJURY_STEP.dc)).toBe(-2);
  });

  it("AC is -5 per 2 points, in whole steps as DC's are", () => {
    const ac = (injury: number) => lethalShockModifier(injury, INJURY_STEP.ac) + acExtraModifier(injury);
    expect(ac(1)).toBe(0);
    expect(ac(2)).toBe(-5);
    expect(ac(3)).toBe(-5);
    expect(ac(4)).toBe(-10);
    expect(ac(5)).toBe(-10);
    for (let injury = 0; injury <= 200; injury += 1) expect(ac(injury)).toBe(-(Math.floor(injury / 2) * 5) || 0);
  });

  it("radio-frequency current's effect is disregarded: no penalty and no heart stoppage; lightning -1 per 5", () => {
    expect(lethalShockModifier(12, INJURY_STEP.rf)).toBe(0);
    expect(stopsHeart("rf")).toBe(false);
    expect(stopsHeart("ac")).toBe(true);
    expect(lethalShockModifier(12, INJURY_STEP.lightning)).toBe(-2);
  });
});

describe("the voltage table (HT:EE pp. 18-19)", () => {
  it("reads the rows", () => {
    expect(voltageDamage(12)).toBeNull();
    expect(voltageDamage(45)).toBe("1");
    expect(voltageDamage(67)).toBe("1");
    expect(voltageDamage(120)).toBe("1d-3");
    expect(voltageDamage(230)).toBe("1d+1");
    expect(voltageDamage(480)).toBe("3d");
    expect(voltageDamage(1000)).toBe("5d");
    expect(voltageDamage(1500)).toBe("6d");
  });

  it("adds 6d per tenfold rise, giving the book's own figures", () => {
    expect(voltageDamage(1800)).toBe("6d×2"); // the electric chair
    expect(voltageDamage(15_000)).toBe("6d×2"); // local distribution
    expect(voltageDamage(10_000)).toBe("6d×2");
    expect(voltageDamage(110_000)).toBe("6d×3");
    expect(voltageDamage(150_000)).toBe("6d×3");
    expect(voltageDamage(220_000)).toBe("6d×4");
    expect(voltageDamage(765_000)).toBe("6d×4");
    expect(parseDiceAdds(voltageDamage(765_000)!)).toEqual({ dice: 6, adds: 0, multiplier: 4 });
  });
});

describe("weak shocks, sparks and the heart (HT:EE p. 9)", () => {
  it("counts the table's rows under 1d as weak", () => {
    expect(weakShock(parseDiceAdds("1"))).toBe(true);
    expect(weakShock(parseDiceAdds("1d-3"))).toBe(true);
    expect(weakShock(parseDiceAdds("1d+1"))).toBe(false);
    expect(weakShock(parseDiceAdds("3d"))).toBe(false);
    expect(weakShock(parseDiceAdds("6d×2"))).toBe(false);
    expect(weakShock(null)).toBe(false);
  });

  it("turns a roll under 0 into a bonus", () => {
    expect(weakShockBonus(-2)).toBe(2);
    expect(weakShockBonus(0)).toBe(0);
    expect(weakShockBonus(3)).toBe(0);
  });

  it("rolls a spark against 12 less the modifier", () => {
    expect(sparkTarget(5)).toBe(7);
    expect(sparkTarget(-4)).toBe(16);
  });

  it("lets a nonlethal shock at -5 or worse stop the heart", () => {
    expect(nonlethalCanStopHeart(-5)).toBe(true);
    expect(nonlethalCanStopHeart(-8)).toBe(true);
    expect(nonlethalCanStopHeart(-4)).toBe(false);
  });

  it("multiplies a large bolt by 1d-2, at least 1", () => {
    expect(largeBoltMultiplier(-1)).toBe(1);
    expect(largeBoltMultiplier(0)).toBe(1);
    expect(largeBoltMultiplier(4)).toBe(4);
  });
});

describe("protection (HT:EE pp. 14-15, 25)", () => {
  it("knows the gear by the catalogue's names", () => {
    expect(shockGear("Electrical Gloves")).toEqual({ kind: "gloves", dr: 25 });
    expect(shockGear("Electrical Gloves (Standard)")).toEqual({ kind: "gloves", dr: 25 });
    expect(shockGear("Electrical Gloves (High-End)")).toEqual({ kind: "gloves", dr: 75 });
    expect(shockGear("Faraday Suit")).toEqual({ kind: "faraday" });
    expect(shockGear("Lineman's Pliers")).toEqual({ kind: "handTool" });
    expect(shockGear("Wire Cutters")).toEqual({ kind: "handTool" });
    expect(shockGear("Screwdrivers")).toEqual({ kind: "handTool" });
    expect(shockGear("Hot Stick (Wood)")).toEqual({ kind: "hotStick", volts: 220_000 });
    expect(shockGear("Hot Stick")).toEqual({ kind: "hotStick", volts: 750_000 });
    expect(shockGear("Hot Stick (Fiberglass)")).toEqual({ kind: "hotStick", volts: 750_000 });
    expect(shockGear("Soldering Iron (TL6)")).toBeNull();
    expect(shockGear("Fuse")).toBeNull();
  });

  const none = { gloves: 0, faraday: false, handTool: false, taped: false };

  it("adds each layer's DR against a lethal shock", () => {
    expect(shieldDr(none, { kind: "lethal" })).toBeNull();
    expect(shieldDr({ ...none, gloves: 25 }, { kind: "lethal" })).toBe(25);
    expect(shieldDr({ ...none, gloves: 75, handTool: true, taped: true }, { kind: "lethal", volts: 480 })).toBe(103);
    expect(shieldDr({ ...none, faraday: true }, { kind: "lethal" })).toBe(20);
  });

  it("insulates a tool's handle only to 1,000 volts", () => {
    expect(shieldDr({ ...none, handTool: true }, { kind: "lethal", volts: 1000 })).toBe(18);
    expect(shieldDr({ ...none, handTool: true }, { kind: "lethal", volts: 1500 })).toBeNull();
  });

  it("gives only the Faraday suit against lightning, and nothing against a nonlethal shock", () => {
    expect(shieldDr({ gloves: 25, faraday: true, handTool: true, taped: true }, { kind: "lethal", lightning: true })).toBe(20);
    expect(shieldDr({ gloves: 25, faraday: true, handTool: true, taped: true }, { kind: "nonlethal" })).toBeNull();
  });

  it("grounds a bolt on 14 or 16, or leaves the structure half", () => {
    expect(lightningRodDamage(21, 14, "tl5")).toBe(0);
    expect(lightningRodDamage(21, 15, "tl5")).toBe(10);
    expect(lightningRodDamage(21, 16, "inductive")).toBe(0);
    expect(lightningRodDamage(21, 17, "inductive")).toBe(10);
  });
});

describe("power work (HT:EE pp. 19, 25)", () => {
  it("shocks on a failure by 5 or a critical failure", () => {
    expect(workShocks({ success: true })).toBe(false);
    expect(workShocks({ success: false, margin: -4 })).toBe(false);
    expect(workShocks({ success: false, margin: -5 })).toBe(true);
    expect(workShocks({ success: false, criticalFailure: true, margin: -1 })).toBe(true);
  });

  it("turns a critical failure into an ordinary one on a guarded circuit", () => {
    expect(workShocks({ success: false, criticalFailure: true, margin: -1 }, true)).toBe(false);
    expect(workShocks({ success: false, criticalFailure: true, margin: -6 }, true)).toBe(true);
  });

  it("makes an induced current's margin of failure a penalty", () => {
    expect(inducedPenalty({ success: true, margin: 3 })).toBe(0);
    expect(inducedPenalty({ success: false, margin: -3 })).toBe(-3);
    expect(inducedPenalty({ success: false, margin: 4 })).toBe(-4);
  });
});
