import { afterEach, describe, expect, it } from "vitest";

import { setRuleReader } from "../../../shared/book-tables.js";
import { MODULE_ID } from "../../../shared/module.js";
import { CARRY_TABLES, carryModifierOf, situationModifiers, specialtyOf } from "../../../shared/readying/index.js";
import { AGAINST_READY, drawCase, drawWinner } from "../../../shared/standoff/rules.js";
import { CARRIES as MA_CARRIES, carryModifier as maCarryModifier } from "../../martial-arts/readying/rules.js";
import {
  GUN_CARRIES,
  NO_DRAWS,
  drawReadies,
  drawRefusal,
  gunCarryModifier,
  gunDrawModifiers,
  gunReadyModifiers,
  gunSpecialty,
  holsterFits,
  holsterKindOf,
  holsterModifier,
  isLanyard,
  quickSheatheSpecialties,
  readiesAfterFastDraw,
} from "./rules.js";

const sum = (lines: Array<{ value: number }>) => lines.reduce((s, l) => s + l.value, 0);
const standing = { posture: "standing", grappled: false, upsideDown: false, moving: false } as const;

/** Drawing guns (High-Tech pp. 81-82, 153-154, 249). */
describe("Fast-Draw with guns", () => {
  it("reads a gun's specialty from its weapon skill", () => {
    expect(gunSpecialty("Guns (Pistol)")).toBe("pistol");
    expect(gunSpecialty("Guns (Rifle)")).toBe("longarm");
    expect(specialtyOf("Fast-Draw (Long Arm)")).toBe("longarm");
  });

  it("draws one gun per hand each turn, the off hand at -4, and nothing more after a failure", () => {
    expect(drawRefusal(NO_DRAWS, "master")).toBeNull();
    expect(drawRefusal({ master: 1, off: 0, failed: false }, "off")).toBeNull();
    expect(drawRefusal({ master: 1, off: 0, failed: false }, "master")).toBe("handUsed");
    expect(drawRefusal({ master: 1, off: 0, failed: true }, "off")).toBe("failed");
    expect(sum(situationModifiers({ ...standing, hand: "off", carry: "hip" }))).toBe(-4);
  });

  it("gives the places' modifiers for pistols and long arms", () => {
    expect(gunCarryModifier("pistol", "belt")).toBe(0);
    expect(gunCarryModifier("pistol", "hip")).toBe(0);
    expect(gunCarryModifier("pistol", "smallOfBack")).toBe(-1);
    expect(gunCarryModifier("pistol", "shoulderHolster")).toBe(-1);
    expect(gunCarryModifier("pistol", "ankle")).toBe(-2);
    expect(gunCarryModifier("pistol", "boot")).toBe(-2);
    expect(gunCarryModifier("pistol", "concealed")).toBe(-3);
    expect(gunCarryModifier("longarm", "patrolSling")).toBe(0);
    expect(gunCarryModifier("longarm", "shoulder")).toBe(-2);
    expect(gunCarryModifier("longarm", "backSling")).toBe(-4);
    expect(gunCarryModifier("longarm", "hip")).toBeNull();
    expect(gunCarryModifier("knife", "hip")).toBeNull();
  });

  it("lets a crouching gunman reach an ankle holster or boot at +0 in all", () => {
    const crouching = { ...standing, posture: "crouching", hand: "master" as const };
    expect(sum(situationModifiers({ ...crouching, carry: "ankle" })) + gunCarryModifier("pistol", "ankle", { posture: "crouching" })!).toBe(0);
    expect(sum(situationModifiers({ ...crouching, carry: "boot" })) + gunCarryModifier("pistol", "boot", { posture: "kneeling" })!).toBe(0);
    expect(gunCarryModifier("pistol", "ankle", { posture: "standing" })).toBe(-2);
    // Anywhere else the posture's -2 stays.
    expect(sum(situationModifiers({ ...crouching, carry: "hip" }))).toBe(-2);
  });
});

describe("holsters and slings", () => {
  it("knows the records by name", () => {
    expect(holsterKindOf("Belt Holster")).toBe("belt");
    expect(holsterKindOf("Shoulder Holster")).toBe("shoulder");
    expect(holsterKindOf("Fast-Draw Rig")).toBe("fastDrawRig");
    expect(holsterKindOf("Patrol Sling")).toBe("patrolSling");
    expect(holsterKindOf("Colt Peacemaker")).toBeNull();
    expect(isLanyard("Lanyard")).toBe(true);
  });

  it("gives each its Fast-Draw modifier, a military holster's going with its flap tucked away", () => {
    expect(holsterModifier("military")).toBe(-2);
    expect(holsterModifier("military", { flapTucked: true })).toBe(0);
    expect(holsterModifier("undercover")).toBe(-1);
    expect(holsterModifier("fastDrawRig")).toBe(2);
    expect(holsterModifier("patrolSling")).toBe(1);
    // A shoulder holster's -1 is its place's, not taken twice.
    expect(holsterModifier("shoulder")).toBe(0);
    expect(holsterModifier(null)).toBe(0);
  });

  it("takes a Ready for a pistol, two to unsling a long arm and three from the back, one less on a Fast-Draw", () => {
    expect(drawReadies("pistol", "hip", "belt")).toBe(1);
    expect(readiesAfterFastDraw(drawReadies("pistol", "hip", "belt"))).toBe(0);
    expect(drawReadies("longarm", "shoulder", "rifleSling")).toBe(2);
    expect(drawReadies("longarm", "backSling", "rifleSling")).toBe(3);
    expect(readiesAfterFastDraw(3)).toBe(2);
    expect(drawReadies("longarm", null, "patrolSling")).toBe(1);
    expect(readiesAfterFastDraw(drawReadies("longarm", null, "patrolSling"))).toBe(0);
  });

  it("fits only a small gun in a sleeve holster", () => {
    expect(holsterFits("sleeve", -1)).toBe(true);
    expect(holsterFits("sleeve", -2)).toBe(false);
    expect(holsterFits("belt", -3)).toBe(true);
  });

  it("reads Quick-Sheathe's specialty", () => {
    expect(quickSheatheSpecialties(["Quick-Sheathe (Pistol)", "Combat Reflexes", "Quick-Sheathe (Long Arm)"])).toEqual(["pistol", "longarm"]);
  });
});

describe("Who draws first with guns", () => {
  it("gives +4 for a hand on the gun and -1 for the worse Bulk", () => {
    expect(gunDrawModifiers({ handOnWeapon: true, bulk: -2 }, { handOnWeapon: false, bulk: -1 })).toEqual([{ key: "handOnWeapon", value: 4 }, { key: "bulk", value: -1 }]);
    expect(gunDrawModifiers({ handOnWeapon: false, bulk: -1 }, { handOnWeapon: false, bulk: -1 })).toEqual([]);
    expect(gunReadyModifiers(true)).toEqual([{ key: "combatReflexes", value: 1 }]);
  });

  it("settles the standoff's cases as the shared engine does", () => {
    expect(drawCase({ ready: true, fastDraw: null }, { ready: false, fastDraw: 14 }).kind).toBe("readyVsFastDraw");
    expect(AGAINST_READY).toBe(-10);
    expect(drawWinner("readyVsFastDraw", "tie", true)).toBe("first");
    expect(drawWinner("contest", "tie", true)).toBe("simultaneous");
  });
});

/**
 * Decision D1 (#335): High-Tech's gun places need only High-Tech's switch,
 * and Martial Arts' blade places only Martial Arts'.
 */
describe("the shared carry table with one book's switch on (D1)", () => {
  const key = (k: string) => `${MODULE_ID}.${k}`;
  const register = () => {
    CARRY_TABLES.register({ book: "martial-arts", rules: [key("readying")], carries: MA_CARRIES, figures: maCarryModifier, i18n: "GCC.MA.Readying" });
    CARRY_TABLES.register({ book: "high-tech", rules: [key("gunDrawing"), key("gunfightStandoff")], carries: GUN_CARRIES, figures: gunCarryModifier, i18n: "GCC.HT.Drawing" });
  };
  afterEach(() => {
    CARRY_TABLES.clear();
    setRuleReader(() => false);
  });

  it("reads a pistol's shoulder holster with only High-Tech on, and no knife's place", () => {
    register();
    const on = new Set([key("gunfightStandoff")]);
    setRuleReader((k) => on.has(k));
    expect(carryModifierOf("pistol", "shoulderHolster")).toBe(-1);
    expect(carryModifierOf("knife", "teeth")).toBeNull();
  });

  it("reads Martial Arts' places with only its switch on, and none for a gun", () => {
    register();
    setRuleReader((k) => k === key("readying"));
    expect(carryModifierOf("knife", "teeth")).toBe(-5);
    expect(carryModifierOf("sword", "sameHip", { reversedGrip: true })).toBe(0);
    expect(carryModifierOf("pistol", "shoulderHolster")).toBeNull();
  });

  it("works with High-Tech's table alone, as a build without Martial Arts registers it", () => {
    CARRY_TABLES.register({ book: "high-tech", rules: [key("gunDrawing")], carries: GUN_CARRIES, figures: gunCarryModifier, i18n: "GCC.HT.Drawing" });
    setRuleReader((k) => k === key("gunDrawing"));
    expect(carryModifierOf("longarm", "backSling")).toBe(-4);
  });
});
