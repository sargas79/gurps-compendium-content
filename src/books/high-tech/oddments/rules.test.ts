import { describe, expect, it } from "vitest";

import {
  armouryLevel,
  blanketOf,
  breakInPain,
  breakInRoll,
  coverMeets,
  eyeglassesOnHeadHit,
  footwearStealth,
  gearGrant,
  homemadeArmor,
  isVoiceSkill,
  knockdownBonus,
  shieldedRads,
  smothered,
  stealthOf,
} from "./rules.js";

describe("footwear (High-Tech pp. 68-69)", () => {
  it("gives Stealth its modifier", () => {
    expect(footwearStealth("Moccasins")).toBe(1);
    expect(footwearStealth("Sneakers")).toBe(1);
    expect(footwearStealth("Shoes, Climbing")).toBe(1);
    expect(footwearStealth("Boots, Arctic (TL7)")).toBe(-1);
    expect(footwearStealth("Boots, Blast")).toBe(-1);
    expect(footwearStealth("Boots, Firefighter")).toBe(-1);
    expect(footwearStealth("Boots")).toBe(0);
    expect(footwearStealth("Cleats")).toBe(0);
  });

  it("takes the worst pair worn", () => {
    expect(stealthOf([{ name: "Moccasins" }, { name: "Boots, Blast" }])).toEqual({ name: "Boots, Blast", value: -1 });
    expect(stealthOf([{ name: "Boots" }])).toBeNull();
  });

  it("breaks footwear in with the best of HT, Hiking and HT-based Soldier", () => {
    expect(breakInRoll({ ht: 11, iq: 10, hiking: null, soldier: null })).toEqual({ skill: "HT", level: 11 });
    expect(breakInRoll({ ht: 11, iq: 10, hiking: 13, soldier: null })).toEqual({ skill: "Hiking", level: 13 });
    // Soldier-14 on IQ 10 is HT-based 15 for HT 11.
    expect(breakInRoll({ ht: 11, iq: 10, hiking: 13, soldier: 14 })).toEqual({ skill: "Soldier", level: 15 });
  });

  it("leaves moderate pain on a failure, terrible on a critical one", () => {
    expect(breakInPain({ success: true })).toBeNull();
    expect(breakInPain({ success: false })).toBe("moderatePain");
    expect(breakInPain({ success: false, criticalFailure: true })).toBe("terriblePain");
  });
});

describe("gloves, ear and eye protection (High-Tech pp. 69-71)", () => {
  it("knows what each piece grants", () => {
    expect(gearGrant("Hockey Glove", 7)).toEqual({ hamFisted: 1 });
    expect(gearGrant("Earplugs", 7)).toEqual({ protectedHearing: true, hardOfHearing: true });
    expect(gearGrant("Electronic Earmuffs", 8)).toEqual({ protectedHearing: true });
    expect(gearGrant("Dive Mask", 6)).toEqual({ nictitatingMembrane: 1 });
    expect(gearGrant("Anti-Laser Goggles", 8)).toEqual({ nictitatingMembrane: 4, protectedVision: true });
    expect(gearGrant("Tactical Goggles", 8)).toEqual({ nictitatingMembrane: 5 });
    expect(gearGrant("Ballistic Sunglasses", 8)).toEqual({ protectedVision: true });
    expect(gearGrant("Frisk Gloves", 8)).toBeNull();
  });

  it("gives Protected Vision only to tinted sunglasses, from TL6", () => {
    expect(gearGrant("Sunglasses (TL5)", 5)?.protectedVision).toBe(false);
    expect(gearGrant("Sunglasses (TL6)", 6)?.protectedVision).toBe(true);
  });
});

describe("the cup and the mouthguard (High-Tech p. 71)", () => {
  it("helps the knockdown roll for the location it guards", () => {
    expect(knockdownBonus("Cup", "groin")).toBe(2);
    expect(knockdownBonus("Cup", "face")).toBe(0);
    expect(knockdownBonus("Mouthguard", "face")).toBe(1);
    expect(knockdownBonus("Mouthguard", "skull")).toBe(0);
  });

  it("hampers the skills Disturbing Voice does", () => {
    expect(isVoiceSkill("Fast-Talk")).toBe(true);
    expect(isVoiceSkill("Singing")).toBe(true);
    expect(isVoiceSkill("Performance (Acting)")).toBe(true);
    expect(isVoiceSkill("Stealth")).toBe(false);
  });
});

describe("eyeglasses (High-Tech p. 225)", () => {
  it("break on a 1 and come off on 2-3", () => {
    expect(eyeglassesOnHeadHit(1)).toBe("broken");
    expect(eyeglassesOnHeadHit(2)).toBe("knockedOff");
    expect(eyeglassesOnHeadHit(3)).toBe("knockedOff");
    expect(eyeglassesOnHeadHit(4)).toBeNull();
    expect(eyeglassesOnHeadHit(6)).toBeNull();
  });
});

describe("homemade armour (High-Tech p. 71)", () => {
  it("takes Armoury (Body Armor) at +5 or +3, from IQ-5 at default", () => {
    expect(homemadeArmor("Homemade Armor, Paper and Tape")).toEqual({ bonus: 5, minutes: 30, soaks: true });
    expect(homemadeArmor("Homemade Armor, Plastic Bucket")).toEqual({ bonus: 3, minutes: 180, soaks: false });
    expect(homemadeArmor("Boots")).toBeNull();
    // Paper at default is an IQ roll.
    expect(armouryLevel(null, 12) + 5).toBe(12);
    expect(armouryLevel(14, 12)).toBe(14);
  });
});

describe("portable cover (High-Tech p. 72)", () => {
  it("knows the blankets", () => {
    expect(blanketOf("Explosives Blanket")).toEqual({ dr: 25, protectionFactor: 1 });
    expect(blanketOf("Radiation Blanket")).toEqual({ dr: 25, protectionFactor: 3 });
    expect(blanketOf("Blanket")).toBeNull();
  });

  it("takes the DR off the whole roll, laying a multiplier out as dice", () => {
    expect(smothered({ dice: 6, adds: 0 }, 25)).toEqual({ dice: { dice: 6, adds: 0 }, less: -25 });
    expect(smothered({ dice: 6, adds: 0, multiplier: 2 }, 25)).toEqual({ dice: { dice: 12, adds: 0 }, less: -25 });
    expect(smothered({ dice: 3, adds: 1, multiplier: 3 }, 25)).toEqual({ dice: { dice: 9, adds: 3 }, less: -25 });
  });

  it("divides a dose by the radiation blanket's PF", () => {
    expect(shieldedRads(300, 3)).toBe(100);
    expect(shieldedRads(300, 1)).toBe(300);
  });
});

describe("gear's own states (High-Tech pp. 70-72)", () => {
  it("tints plain goggles, and leaves spent electronic ear protection as the plain kind", () => {
    expect(gearGrant("Goggles", 6, { tinted: true })).toMatchObject({ nictitatingMembrane: 1, protectedVision: true });
    expect(gearGrant("Tactical Goggles", 8, { tinted: true })?.protectedVision).toBeUndefined();
    expect(gearGrant("Electronic Earplugs", 8, { unpowered: true })).toEqual({ protectedHearing: true, hardOfHearing: true });
    expect(gearGrant("Electronic Earplugs", 8)).toEqual({ protectedHearing: true });
    expect(gearGrant("Earmuffs", 6, { unpowered: true })).toEqual({ protectedHearing: true, hardOfHearing: true });
  });

  it("puts a blanket held up as cover between its people and a blow from the front", () => {
    expect([null, "front", "side", "back"].map((arc) => coverMeets(arc))).toEqual([true, true, false, false]);
  });
});