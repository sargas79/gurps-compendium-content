import { describe, expect, it, vi } from "vitest";

import { BOOKS } from "./books/index.js";
import { RESERVED_KEYS } from "./books/high-tech/index.js";
import { readyBooks, registerBookRules, type BookRules } from "./shared/book.js";
import { MODULE_ID } from "./shared/module.js";

// The rules engine may be used in tests, straight from the pinned system's
// source, so a book's rule can be checked against the Basic Set's without
// Foundry. Only tests may: the module's own code reaches the system through
// game.gworld.api alone, and the build fails on anything else.
import { parseDiceAdds } from "../system/src/rules/dice.js";

function registry() {
  return {
    registerRuleGroup: vi.fn((g: { module: string; id: string }) => `${g.module}.${g.id}`),
    registerRule: vi.fn(() => "x"),
  };
}

describe("the books' rule groups", () => {
  it("registers one group per book, named for the book, under this module", () => {
    const r = registry();
    registerBookRules(BOOKS, r as never);
    expect(r.registerRuleGroup.mock.calls.map((c) => c[0])).toEqual([
      { module: MODULE_ID, id: "monster-hunters-1", label: "GURPS Monster Hunters 1" },
      { module: MODULE_ID, id: "magic", label: "GURPS Magic" },
      { module: MODULE_ID, id: "martial-arts", label: "GURPS Martial Arts" },
      { module: MODULE_ID, id: "ultra-tech", label: "GURPS Ultra-Tech" },
      { module: MODULE_ID, id: "high-tech", label: "GURPS High-Tech" },
    ]);
    // Monster Hunters 1's switches, all in its own group and off by default.
    const keys = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "monster-hunters-1");
    expect(keys.map((rule: any) => rule.key)).toEqual(["talentsSkipWildcards", "holyAttacks", "ritualPathMagic", "monsterHuntersGear", "bonusPointSpending"]);
    expect(keys.every((rule: any) => rule.default === false && rule.module === MODULE_ID)).toBe(true);
    // GURPS Magic's switches, likewise.
    const magic = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "magic");
    expect(magic.map((rule: any) => [rule.key, rule.default, rule.reference])).toEqual([["powerstones", false, "GURPS Magic pp. 20, 69-70"], ["spellAttacks", false, "GURPS Magic pp. 73-76, 187-198"]]);
    const martialArts = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "martial-arts");
    expect(martialArts.map((rule: any) => [rule.key, rule.default, rule.reference])).toEqual([["committedDefensiveAttack", false, "Martial Arts pp. 99-100"], ["allOutAttackOptions", false, "Martial Arts pp. 97-98"], ["moveAndAttack", false, "Martial Arts p. 107"], ["acrobatics", false, "Martial Arts pp. 98, 105-107"], ["postures", false, "Martial Arts pp. 98-99"], ["feints", false, "Martial Arts pp. 49, 100-101"], ["readying", false, "Martial Arts pp. 101-104"], ["meleeOptions", false, "Martial Arts pp. 109-113"], ["styles", false, "Martial Arts pp. 49, 141-148"], ["training", false, "Martial Arts pp. 147, 232-233"], ["weaponBuilding", false, "Martial Arts pp. 214, 216-218, 221"], ["finerHitLocations", false, "Martial Arts p. 137"], ["multipleAttacks", false, "Martial Arts pp. 126-128"], ["cinematicRapidStrike", false, "Martial Arts p. 127"], ["defenseOptions", false, "Martial Arts pp. 121-125"], ["limitedDefenses", false, "Martial Arts pp. 122-123"], ["targetedAttacks", false, "Martial Arts pp. 64, 68, 80"], ["extraEffort", false, "Martial Arts p. 131"], ["rangedOptions", false, "Martial Arts pp. 97, 119-121"], ["cinematicRangedOptions", false, "Martial Arts p. 120"], ["unfamiliarWeapons", false, "Martial Arts p. 212"], ["unorthodoxWeapons", false, "Martial Arts pp. 220, 224"], ["shovesAndShields", false, "Martial Arts pp. 112-113"], ["untrainedFighters", false, "Martial Arts p. 113"], ["harshRealism", false, "Martial Arts p. 124"], ["grapplingOptions", false, "Martial Arts pp. 114, 116-119, 121-122"], ["longWeaponsInClose", false, "Martial Arts p. 117"], ["grabAndSmash", false, "Martial Arts pp. 118-119"], ["bodiesInClose", false, "Martial Arts pp. 114-117"], ["partialInjuries", false, "Martial Arts p. 136"], ["extremeDismemberment", false, "Martial Arts p. 136"], ["severeBleeding", false, "Martial Arts p. 138"], ["lastingInjuries", false, "Martial Arts pp. 138-139"], ["whoDrawsFirst", false, "Martial Arts p. 103"], ["chargingFoes", false, "Martial Arts p. 106"], ["stopHits", false, "Martial Arts p. 108"], ["cascadingWaits", false, "Martial Arts p. 108"], ["matterOfInches", false, "Martial Arts p. 110"], ["chambara", false, "Martial Arts pp. 128-130"], ["contestOfWills", false, "Martial Arts p. 130"], ["concentration", false, "Martial Arts p. 130"], ["fear", false, "Martial Arts p. 130"], ["fakingIt", false, "Martial Arts p. 130"], ["unarmedEtiquette", false, "Martial Arts p. 132"], ["shakingItOff", false, "Martial Arts p. 132"], ["shoutItOut", false, "Martial Arts p. 132"], ["proxyFighting", false, "Martial Arts pp. 132-133"], ["bulletTime", false, "Martial Arts p. 133"], ["tournaments", false, "Martial Arts pp. 134-135"]]);
    // GURPS High-Tech's switches, likewise.
    const highTech = r.registerRule.mock.calls.map((c: any[]) => c[0]).filter((rule: any) => rule.group === "high-tech");
    expect(highTech.map((rule: any) => [rule.key, rule.default, rule.reference])).toEqual([["equipmentOptions", false, "High-Tech pp. 9-11"], ["combinationGadgets", false, "High-Tech p. 10"], ["gearForSm", false, "High-Tech p. 10"], ["antiqueLegality", false, "High-Tech p. 8"], ["blackMarket", false, "High-Tech pp. 7-10"], ["equipmentBonuses", false, "High-Tech pp. 7, 11"], ["tlFamiliarity", false, "High-Tech p. 11"], ["firearmQuality", false, "High-Tech p. 79"], ["gunCare", false, "High-Tech pp. 80-81, 129"], ["immediateAction", false, "High-Tech pp. 81, 249-251"], ["gunDrawing", false, "High-Tech pp. 81-82, 153-154, 249"], ["gunfightStandoff", false, "High-Tech p. 82"], ["triggerMechanisms", false, "High-Tech p. 82"], ["burstFire", false, "High-Tech pp. 82-83"], ["fastFiring", false, "High-Tech pp. 84, 251-252"], ["fanningAndThumbing", false, "High-Tech pp. 83-84, 251-252"], ["pistolero", false, "High-Tech p. 84"], ["precisionAiming", false, "High-Tech pp. 84, 250-251"], ["rangedRapidStrike", false, "High-Tech pp. 85, 252"], ["gunTechniques", false, "High-Tech pp. 250-252"], ["shootingEnvironments", false, "High-Tech pp. 85, 92, 117"], ["sustainedFire", false, "High-Tech pp. 85-86, 129-137"], ["firefightAftermath", false, "High-Tech p. 87"], ["firearmLoading", false, "High-Tech pp. 86-88, 251"], ["carefulLoading", false, "High-Tech p. 86"], ["blackPowderFouling", false, "High-Tech p. 86"], ["airGunsAndStunners", false, "High-Tech pp. 88-90"], ["revolverHandling", false, "High-Tech pp. 90, 93, 159"], ["mechanicalMachineGuns", false, "High-Tech p. 127"], ["backblast", false, "High-Tech pp. 141, 147-153"], ["indirectFire", false, "High-Tech pp. 139-141"], ["gunMagazines", false, "High-Tech p. 155"], ["gunSights", false, "High-Tech pp. 155-157"], ["suppressors", false, "High-Tech pp. 158-159"], ["stocksAndMounts", false, "High-Tech p. 160"], ["ammunitionUpgrades", false, "High-Tech pp. 161-165, 175-177"], ["handloading", false, "High-Tech p. 174"], ["misloading", false, "High-Tech p. 178"], ["projectileOptions", false, "High-Tech pp. 86, 109, 166-169"], ["exoticBullets", false, "High-Tech p. 168"], ["multipleProjectileLoads", false, "High-Tech pp. 172-174"], ["projectileUpgrades", false, "High-Tech pp. 174-175"], ["explosiveProjectiles", false, "High-Tech pp. 169-170, 175"], ["cargoProjectiles", false, "High-Tech pp. 143, 171-172"], ["batteries", false, "High-Tech pp. 10, 13-16"], ["vitalsOnTorsoHits", false, "High-Tech p. 162"], ["realisticLimbWounds", false, "High-Tech p. 162"], ["vitalBleeding", false, "High-Tech p. 162"], ["woundFrightChecks", false, "High-Tech p. 162"], ["booksAndLibraries", false, "High-Tech pp. 17-18"], ["computerSystems", false, "High-Tech pp. 19-22"], ["computerEras", false, "High-Tech: Electricity and Electronics pp. 36-37"], ["computerInterfaces", false, "High-Tech: Electricity and Electronics pp. 39-41"], ["programmingLanguages", false, "High-Tech: Electricity and Electronics p. 38"], ["toolKits", false, "High-Tech pp. 24, 29, 50"], ["forcedEntryTools", false, "High-Tech pp. 25-30"], ["chainsaws", false, "High-Tech pp. 27-28"], ["householdHazards", false, "High-Tech pp. 31-33"], ["flamethrowers", false, "High-Tech pp. 178-179"], ["sprayGuns", false, "High-Tech p. 180"], ["laserDazzlers", false, "High-Tech p. 181"], ["explosionSideEffects", false, "High-Tech pp. 181-182"], ["demolitionCharges", false, "High-Tech pp. 182-183"], ["unstableExplosives", false, "High-Tech pp. 184-187"], ["incendiaryAgents", false, "High-Tech p. 188"], ["radios", false, "High-Tech pp. 36-40; High-Tech: Electricity and Electronics p. 28"], ["activeSensors", false, "High-Tech pp. 45-47"], ["visualSensors", false, "High-Tech pp. 47-48"], ["passiveSensors", false, "High-Tech pp. 48-50"], ["rangefindingEmissions", false, "High-Tech: Electricity and Electronics p. 35"], ["radioTuning", false, "High-Tech: Electricity and Electronics pp. 27, 29-30"], ["radioAntennas", false, "High-Tech: Electricity and Electronics p. 28"], ["shortwaveSkip", false, "High-Tech: Electricity and Electronics p. 30"], ["survivalGear", false, "High-Tech pp. 56-59"], ["maritimeGear", false, "High-Tech pp. 59-60"], ["parachuting", false, "High-Tech p. 61"], ["rations", false, "High-Tech p. 35"], ["grenadeHandling", false, "High-Tech pp. 190-193"], ["landMines", false, "High-Tech pp. 189-190"], ["rifleGrenades", false, "High-Tech pp. 193-194"], ["nuclearEffects", false, "High-Tech pp. 195-196"], ["lightSources", false, "High-Tech pp. 51-52"], ["navigationGear", false, "High-Tech pp. 52-53"], ["loadBearingEquipment", false, "High-Tech pp. 53-55"], ["climbingGear", false, "High-Tech pp. 55-56"], ["clothingAndWeather", false, "High-Tech pp. 63-65"], ["frostbite", false, "High-Tech p. 63"], ["climateControl", false, "High-Tech p. 74"], ["bayonets", false, "High-Tech pp. 196-199"], ["sheaths", false, "High-Tech p. 198"], ["bladeComposition", false, "High-Tech pp. 196-198, 201"], ["stunWeapons", false, "High-Tech p. 199"], ["highTechBows", false, "High-Tech p. 201"], ["camouflageGear", false, "High-Tech pp. 76-77"], ["breathingGear", false, "High-Tech pp. 72-74, 76"], ["environmentSuits", false, "High-Tech pp. 74-76"], ["locksAndSafes", false, "High-Tech pp. 202-205, 213"], ["trapsAndBarriers", false, "High-Tech pp. 203-205"], ["emergencyMedicine", false, "High-Tech pp. 219-221"], ["medicalFacilities", false, "High-Tech pp. 222-225"], ["encryption", false, "High-Tech pp. 210-211"], ["disguiseAndSmuggling", false, "High-Tech pp. 213-215"], ["personalConveyances", false, "High-Tech pp. 226, 230-231"], ["partialCoverage", false, "High-Tech pp. 66-69, 75"], ["concealedArmor", false, "High-Tech pp. 64, 66"], ["armorMaterials", false, "High-Tech pp. 65, 67"], ["securityScreening", false, "High-Tech pp. 205-207, 217"], ["surveillanceGear", false, "High-Tech pp. 208-212"], ["jamming", false, "High-Tech pp. 212-213; High-Tech: Electricity and Electronics p. 50"], ["jammerKinds", false, "High-Tech: Electricity and Electronics pp. 49-50"], ["radarJamming", false, "High-Tech: Electricity and Electronics pp. 49-50"], ["covertListening", false, "High-Tech: Electricity and Electronics pp. 44-45"], ["protectiveOddments", false, "High-Tech pp. 68-71, 225"], ["portableCover", false, "High-Tech p. 72"], ["lieDetection", false, "High-Tech pp. 215-216"], ["restraintDevices", false, "High-Tech p. 217"], ["prosthetics", false, "High-Tech pp. 225-226"], ["hygieneAndDrugs", false, "High-Tech pp. 221, 226-227"], ["highTechPoisons", false, "High-Tech p. 227"], ["vehicleComponents", false, "High-Tech pp. 228-229"], ["vehicleProtection", false, "High-Tech pp. 229, 234-235"], ["crewConditions", false, "High-Tech pp. 234-235"], ["gunslingerExpanded", false, "High-Tech p. 249"], ["cinematicSilencers", false, "High-Tech p. 159"], ["zenMarksmanship", false, "High-Tech p. 250"], ["cuttingEdgeGear", false, "High-Tech: Electricity and Electronics p. 8"], ["breakableComponents", false, "High-Tech: Electricity and Electronics pp. 8-9"], ["kitBuilding", false, "High-Tech: Electricity and Electronics p. 15"]]);
  });

  it("gives no two books' switches the same key, High-Tech's reserved ones included", () => {
    const r = registry();
    registerBookRules(BOOKS, r as never);
    const rules = r.registerRule.mock.calls.map((c: any[]) => c[0] as { group: string; key: string });
    const keys = rules.map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
    // High-Tech's switches take their own keys where Ultra-Tech's would clash (#343).
    const others = rules.filter((rule) => rule.group !== "high-tech").map((rule) => rule.key);
    for (const [own, clashing] of Object.entries(RESERVED_KEYS)) {
      expect(others).not.toContain(own);
      expect(others).toContain(clashing);
    }
  });

  it("lets a book register its switches in its own group, and keeps going past one that fails", () => {
    const r = registry();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: BookRules = { slug: "a", label: "A", registerRules: () => { throw new Error("boom"); } };
    const working: BookRules = { slug: "b", label: "B", registerRules: (reg, group) => { reg.registerRule({ module: MODULE_ID, group, key: "k", name: "K", reference: "", default: false }); } };
    registerBookRules([failing, working], r as never);
    expect(r.registerRule).toHaveBeenCalledWith(expect.objectContaining({ group: "b", key: "k", default: false }));
  });

  it("skips a book's switches when its group was refused", () => {
    const r = registry();
    r.registerRuleGroup.mockReturnValueOnce(null as never);
    const book: BookRules = { slug: "a", label: "A", registerRules: vi.fn() };
    registerBookRules([book], r as never);
    expect(book.registerRules).not.toHaveBeenCalled();
  });

  it("hands each book the API once the world is ready", () => {
    const ready = vi.fn();
    const api = { version: "1.6.0" };
    readyBooks([{ slug: "a", label: "A", ready }], api as never);
    expect(ready).toHaveBeenCalledWith(api);
  });
});

describe("the system's rules engine, in tests", () => {
  it("can be imported from the pinned system", () => {
    expect(parseDiceAdds("2d+1")).toEqual({ dice: 2, adds: 1 });
  });
});
