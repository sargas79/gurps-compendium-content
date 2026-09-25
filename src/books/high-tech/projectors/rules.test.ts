import { describe, expect, it } from "vitest";

import { blindnessFrom, eyeProtection, visionResistBonus } from "../../../shared/dazzle/rules.js";
import {
  HT_DAZZLE,
  burnDice,
  burnSeconds,
  eyeBeamOf,
  flameDr,
  flameMalfunction,
  paintBlinds,
  sprayAgent,
  sprayEffectSeconds,
  squirtLoad,
  squirtPenalty,
  sweepWidth,
  sweptDamage,
  tankStruck,
  unthickenedRange,
  waterOnly,
} from "./rules.js";

describe("flamethrowers (High-Tech pp. 178-179)", () => {
  it("burns for 2d x 5 seconds, 1d x 5 past 1/2D, divided by a sweep's width", () => {
    expect(burnDice(false)).toBe(2);
    expect(burnDice(true)).toBe(1);
    expect(burnSeconds([3, 4])).toBe(35);
    expect(burnSeconds([3, 4], 3)).toBe(11);
    expect(burnSeconds([2], 2)).toBe(5);
  });

  it("counts unsealed DR at a fifth, sealed DR in full", () => {
    expect(flameDr(12, false)).toBe(2);
    expect(flameDr(4, false)).toBe(0);
    expect(flameDr(12, true)).toBe(12);
  });

  it("divides a sweep's damage by its width, one to three yards", () => {
    expect(sweepWidth(0)).toBe(1);
    expect(sweepWidth(5)).toBe(3);
    expect(sweptDamage(11, 3)).toBe(3);
    expect(sweptDamage(11, 1)).toBe(11);
  });

  it("halves a TL7+ flamethrower's Range on unthickened fuel", () => {
    expect(unthickenedRange(25, 7)).toBe(12);
    expect(unthickenedRange(75, 7)).toBe(37);
    expect(unthickenedRange(15, 6)).toBe(15);
  });

  it("reads its own Malfunction Table", () => {
    expect(flameMalfunction(3)).toBe("noIgnition");
    expect(flameMalfunction(5)).toBe("noIgnition");
    expect(flameMalfunction(6)).toBe("noFuel");
    expect(flameMalfunction(17)).toBe("noFuel");
    expect(flameMalfunction(18)).toBe("explosion");
  });

  it("blows the tank up on a 1 once damage gets through", () => {
    expect(tankStruck(1)).toBe("explodes");
    expect(tankStruck(2)).toBe("disabled");
  });
});

describe("spray guns (High-Tech p. 180)", () => {
  it("lasts minutes equal to the margin for tear gas, until washed off for pepper spray", () => {
    expect(sprayAgent("Pepper Spray")).toBe("pepper");
    expect(sprayAgent("Tear Gas Spray")).toBe("tearGas");
    expect(sprayEffectSeconds("tearGas", 3)).toBe(180);
    expect(sprayEffectSeconds("tearGas", 0)).toBe(60);
    expect(sprayEffectSeconds("pepper", 3)).toBeNull();
  });

  it("reads a failure's margin by its size, signed or not (#539)", () => {
    expect(sprayEffectSeconds("tearGas", -1)).toBe(60);
    expect(sprayEffectSeconds("tearGas", -3)).toBe(180);
    expect(sprayEffectSeconds("tearGas", -12)).toBe(720);
    expect(sprayEffectSeconds("pepper", -3)).toBeNull();
  });
});

describe("laser dazzlers (High-Tech p. 181), through the shared engine", () => {
  it("knows the book's two lasers", () => {
    expect(eyeBeamOf("NORINCO QXJ04")).toBe("dazzle");
    expect(eyeBeamOf("NORINCO ZM87")).toBe("blinding");
    expect(eyeBeamOf("Laser Rifle")).toBeNull();
  });

  it("gives +5 for Protected Vision and +1 a level of Nictitating Membrane", () => {
    expect(eyeProtection({ protectedVision: true, nictitatingMembrane: 4 })).toBe(9);
    expect(eyeProtection({ protectedVision: false, nictitatingMembrane: 0 })).toBe(0);
    expect(visionResistBonus(["Protected Vision", "Nictitating Membrane 3"])).toBe(8);
  });

  it("dazzles for minutes equal to the margin; blinds by crippling, for good at 10+", () => {
    expect(blindnessFrom(HT_DAZZLE, "dazzle", 4)).toEqual({ kind: "dazzled", minutes: 4 });
    expect(blindnessFrom(HT_DAZZLE, "blinding", 3)).toEqual({ kind: "blinded", permanent: false });
    expect(blindnessFrom(HT_DAZZLE, "blinding", 10)).toEqual({ kind: "blinded", permanent: true });
    // A book whose blinding beam blinds for good does so whatever the margin.
    expect(blindnessFrom({ book: "any", blinding: "permanent" }, "blinding", 1)).toEqual({ kind: "blinded", permanent: true });
    // One whose crippling names no failure for good never makes it permanent (Ultra-Tech p. 113, #539).
    expect(blindnessFrom({ book: "any", blinding: "crippling" }, "blinding", -15)).toEqual({ kind: "blinded", permanent: false });
  });

  it("reads a failure's margin by its size, signed or not (#535)", () => {
    expect(blindnessFrom(HT_DAZZLE, "dazzle", -1)).toEqual({ kind: "dazzled", minutes: 1 });
    expect(blindnessFrom(HT_DAZZLE, "dazzle", -5)).toEqual({ kind: "dazzled", minutes: 5 });
    expect(blindnessFrom(HT_DAZZLE, "dazzle", -12)).toEqual({ kind: "dazzled", minutes: 12 });
    expect(blindnessFrom(HT_DAZZLE, "blinding", -9)).toEqual({ kind: "blinded", permanent: false });
    expect(blindnessFrom(HT_DAZZLE, "blinding", -10)).toEqual({ kind: "blinded", permanent: true });
    // A margin already made positive reads the same.
    expect(blindnessFrom(HT_DAZZLE, "dazzle", 5)).toEqual(blindnessFrom(HT_DAZZLE, "dazzle", -5));
  });
});

describe("the squirt carbine's loads (High-Tech p. 180)", () => {
  it("halves water's flinch to -1, holy or not, and leaves the rest at -2", () => {
    expect(squirtPenalty("water", -2)).toBe(-1);
    expect(squirtPenalty("holyWater", -2)).toBe(-1);
    expect(squirtPenalty("water", 0)).toBe(0);
    expect(squirtPenalty("paint", -2)).toBe(-2);
    expect(waterOnly("alcohol")).toBe(false);
  });

  it("reads an unknown load as water", () => {
    expect(squirtLoad("garlic")).toBe("garlic");
    expect(squirtLoad("acid")).toBe("water");
  });

  it("blinds goggles or a visor with paint on a hit that wasn't stopped", () => {
    expect(paintBlinds("paint", { hit: true, defended: false }, true)).toBe(true);
    expect(paintBlinds("paint", { hit: true, defended: true }, true)).toBe(false);
    expect(paintBlinds("paint", { hit: true, defended: false }, false)).toBe(false);
    expect(paintBlinds("water", { hit: true, defended: false }, true)).toBe(false);
  });
});
