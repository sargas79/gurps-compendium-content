/**
 * GURPS High-Tech: the book's rules, registered with the GWorld system
 * through its add-on API. Its group's switches all start off, as every book's
 * do.
 *
 * About a fifth of the book's rules are Ultra-Tech's at lower TLs, and some
 * are Martial Arts'. Those live once, as shared engines under `src/shared/`,
 * and this book registers its own table for each and its own switch, so a GM
 * can use High-Tech without either of the other books. So far this registers
 * the equipment options, combination gadgets, gear for other sizes, the
 * Legality Class of antiques, the black market, Equipment Bond and intrinsic
 * bonuses, and TL penalties as unfamiliarity (pp. 7-11), computers,
 * software, manuals and libraries (pp. 17-22), a gun's quality, its care, clearing a stoppage by Immediate Action,
 * drawing guns, holsters and Who Draws First? with guns, how fast a gun
 * fires: triggers, fire selectors and bursts, fast-firing, fanning and
 * thumbing, and the shooting options and gun techniques: the two-handed
 * stance, Precision Aiming, the Ranged Rapid Strike, Close-Quarters Battle,
 * Targeted Attacks with guns, Instant Arsenal Disarm, Mounted Shooting, the
 * expanded Gunslinger and Zen Marksmanship, the special shooting situations (underwater, into water,
 * steeply into the air, in space), sustained fire, the aftermath of a
 * firefight, reloading, careful loading and black-powder fouling, and the
 * weapon families: air guns and ranged stunners, unsafe revolvers and pistol
 * whipping, mechanical machine guns, and backblast, indirect fire with
 * forward observers, and firearm accessories: magazines, sights,
 * suppressors (and cinematic silencers), stocks, bipods and shooting sticks,
 * and ammunition: calibres priced from the Ammunition Tables, the ammunition
 * upgrades, cartridge conversions, handloading and misloading, the
 * projectiles: projectile options, exotic bullets, multiple-projectile loads
 * and projectile upgrades, the explosive and cargo rounds, power:
 * batteries, generators and fuel, the optional wounding rules, and the
 * general equipment: tool kits, forced-entry tools, chainsaws and nail
 * guns, and household hazards, the communications and sensors: radios,
 * telegraphy, active sensors, optics, night vision and thermographs,
 * hydrophones and sound detectors, the expedition gear: lights,
 * navigation instruments and maps, load-bearing gear and packs, and climbing
 * gear, the survival and camping gear, life
 * jackets, swim fins and dye markers, parachutes and Death from Above, and
 * snacks and sports drinks, camouflage patterns, ghillie suits, nets and
 * scent masking, encryption and code-breaking, forgery, disguise,
 * smuggling and mule pills, and the liquid projectors and laser
 * dazzlers: flamethrowers, spray guns and aerosols, and lasers aimed at
 * the eyes, and the explosives and incendiaries: an explosion's side
 * effects, demolition charges, unstable and home-made explosives, thermite
 * and napalm, and the grenades, land mines, rifle grenades, bombs and
 * nuclear weapons, and clothing against the weather, frostbite and
 * climate-controlled clothing, and the melee and muscle-powered weapons:
 * bayonets and rifle butts, sheaths, blade composition, electric stun
 * weapons and high-tech bows, and the breathing gear and environment
 * suits: masks, diving rigs, air tanks and rebreathers, and the suits that
 * seal their wearers, and the locks, safes, traps and barriers, and
 * emergency medicine and medical facilities: defibrillators, CPR, first aid
 * kits, IVs, imaging, surgical kits, anaesthesia and antiseptic, and
 * armour: partial coverage, concealing it and its materials (pp. 7-11,
 * 13-16, 17-77, 79-93, 109, 127-141, 143, 147-205, 210-215, 219-225,
 * 249-252).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initDrawing, readyDrawing } from "./drawing/index.js";
import { ammunitionGunFields, ammunitionHearing, firesMinieBalls, firesPaperCartridges, initAmmunition, projectileUnderwaterFactor, readyAmmunition } from "./ammunition/index.js";
import { accessoryGunFields, initAccessories, readyAccessories } from "./accessories/index.js";
import { readyAftermath } from "./aftermath/index.js";
import { readyBlackMarket } from "./black-market/index.js";
import { initHighTechEquipment, readyHighTechEquipment } from "./equipment/index.js";
import { readyEnvironments } from "./environments/index.js";
import { readyIndirectFire } from "./indirect-fire/index.js";
import { initFirearms, readyFirearms } from "./firearms/index.js";
import { initHighTechPower, readyHighTechPower } from "./power/index.js";
import { initInformation, readyInformation } from "./information/index.js";
import { rateOfFireFields, readyRateOfFire } from "./rate-of-fire/index.js";
import { gunslingerDefault, inPistoleroStance, readyShooting } from "./shooting/index.js";
import { registerHighTechRecordData } from "./records.js";
import { readyReloading, reloadingFields } from "./reloading/index.js";
import { readySustainedFire, sustainedFireFields } from "./sustained-fire/index.js";
import { initTools, readyTools } from "./tools/index.js";
import { readyWeaponFamilies, weaponFamilyFields } from "./weapon-families/index.js";
import { readyWounding } from "./wounding/index.js";
import { projectorFields, readyProjectors } from "./projectors/index.js";
import { readyExplosives } from "./explosives/index.js";
import { initHighTechSensors, readyHighTechSensors } from "./sensors/index.js";
import { initSurvival, readySurvival } from "./survival/index.js";
import { initHighTechMelee, meleeGunFields, readyHighTechMelee } from "./melee/index.js";
import { initClothing, readyClothing } from "./clothing/index.js";
import { ordnanceExtras, readyOrdnance } from "./ordnance/index.js";
import { initExpedition, readyExpedition } from "./expedition/index.js";
import { initHighTechCamouflage, readyHighTechCamouflage } from "./camouflage/index.js";
import { readyBreathing } from "./breathing/index.js";
import { initHighTechSecurity, readyHighTechSecurity } from "./security/index.js";
import { initMedicine, readyMedicine } from "./medicine/index.js";
import { readyHighTechCodes } from "./codes/index.js";
import { initHighTechArmor, readyHighTechArmor } from "./armor/index.js";

const SLUG = "high-tech";
const REFERENCE = "High-Tech";

/**
 * Switch keys are one namespace across this module's books, so where High-Tech
 * prints a rule Ultra-Tech has a switch for, it takes its own key. These are
 * those keys (the first three registered by #357, the rest reserved for the
 * rule issues that register them), beside the Ultra-Tech key each would have
 * clashed with.
 */
export const RESERVED_KEYS = Object.freeze({
  /** Gadget options and statistics (Ultra-Tech: gadgetOptions). */
  equipmentOptions: "gadgetOptions",
  /** Gear adjusted for the carrier's Size Modifier (Ultra-Tech: adjustingForSm). */
  gearForSm: "adjustingForSm",
  /** Obsolete gear's Legality Class (Ultra-Tech: legalityAndAntiques). */
  antiqueLegality: "legalityAndAntiques",
  /** Computers (Ultra-Tech: computers). */
  computerSystems: "computers",
  /** Restraints (Ultra-Tech: restraints). */
  restraintDevices: "restraints",
});

/** The book's switches. */
const RULES = [
  // The equipment age: options, combinations, sizes, legality, the black market, bonuses, TL.
  { key: "equipmentOptions", pages: "pp. 9-11", implemented: true },
  { key: "combinationGadgets", pages: "p. 10", implemented: true },
  { key: "gearForSm", pages: "p. 10", implemented: true },
  { key: "antiqueLegality", pages: "p. 8", implemented: true },
  { key: "blackMarket", pages: "pp. 7-10", implemented: true },
  { key: "equipmentBonuses", pages: "pp. 7, 11", implemented: true },
  { key: "tlFamiliarity", pages: "p. 11", implemented: true },
  { key: "firearmQuality", pages: "p. 79", implemented: true },
  { key: "gunCare", pages: "pp. 80-81, 129", implemented: true },
  { key: "immediateAction", pages: "pp. 81, 249-251", implemented: true },
  { key: "gunDrawing", pages: "pp. 81-82, 153-154, 249", implemented: true },
  { key: "gunfightStandoff", pages: "p. 82", implemented: true },
  { key: "triggerMechanisms", pages: "p. 82", implemented: true },
  { key: "burstFire", pages: "pp. 82-83", implemented: true },
  { key: "fastFiring", pages: "pp. 84, 251-252", implemented: true },
  { key: "fanningAndThumbing", pages: "pp. 83-84, 251-252", implemented: true },
  { key: "pistolero", pages: "p. 84", implemented: true },
  { key: "precisionAiming", pages: "pp. 84, 250-251", implemented: true },
  { key: "rangedRapidStrike", pages: "pp. 85, 252", implemented: true },
  { key: "gunTechniques", pages: "pp. 250-252", implemented: true },
  { key: "shootingEnvironments", pages: "pp. 85, 92, 117", implemented: true },
  { key: "sustainedFire", pages: "pp. 85-86, 129-137", implemented: true },
  { key: "firefightAftermath", pages: "p. 87", implemented: true },
  { key: "firearmLoading", pages: "pp. 86-88, 251", implemented: true },
  { key: "carefulLoading", pages: "p. 86", implemented: true },
  { key: "blackPowderFouling", pages: "p. 86", implemented: true },
  { key: "airGunsAndStunners", pages: "pp. 88-90", implemented: true },
  { key: "revolverHandling", pages: "pp. 90, 93, 159", implemented: true },
  { key: "mechanicalMachineGuns", pages: "p. 127", implemented: true },
  { key: "backblast", pages: "pp. 141, 147-153", implemented: true },
  { key: "indirectFire", pages: "pp. 139-141", implemented: true },
  { key: "gunMagazines", pages: "p. 155", implemented: true },
  { key: "gunSights", pages: "pp. 155-157", implemented: true },
  { key: "suppressors", pages: "pp. 158-159", implemented: true },
  { key: "stocksAndMounts", pages: "p. 160", implemented: true },
  { key: "ammunitionUpgrades", pages: "pp. 161-165, 175-177", implemented: true },
  { key: "handloading", pages: "p. 174", implemented: true },
  { key: "misloading", pages: "p. 178", implemented: true },
  { key: "projectileOptions", pages: "pp. 86, 109, 166-169", implemented: true },
  { key: "exoticBullets", pages: "p. 168", implemented: true },
  { key: "multipleProjectileLoads", pages: "pp. 172-174", implemented: true },
  { key: "projectileUpgrades", pages: "pp. 174-175", implemented: true },
  { key: "explosiveProjectiles", pages: "pp. 169-170, 175", implemented: true },
  { key: "cargoProjectiles", pages: "pp. 143, 171-172", implemented: true },
  { key: "batteries", pages: "pp. 10, 13-16", implemented: true },
  // The optional wounding rules.
  { key: "vitalsOnTorsoHits", pages: "p. 162", implemented: true },
  { key: "realisticLimbWounds", pages: "p. 162", implemented: true },
  { key: "vitalBleeding", pages: "p. 162", implemented: true },
  { key: "woundFrightChecks", pages: "p. 162", implemented: true },
  { key: "booksAndLibraries", pages: "pp. 17-18", implemented: true },
  { key: "computerSystems", pages: "pp. 19-22", implemented: true },
  // General equipment: tool kits, forced entry, chainsaws and nail guns, household hazards.
  { key: "toolKits", pages: "pp. 24, 29, 50", implemented: true },
  { key: "forcedEntryTools", pages: "pp. 25-30", implemented: true },
  { key: "chainsaws", pages: "pp. 27-28", implemented: true },
  { key: "householdHazards", pages: "pp. 31-33", implemented: true },
  // Liquid projectors and laser dazzlers.
  { key: "flamethrowers", pages: "pp. 178-179", implemented: true },
  { key: "sprayGuns", pages: "p. 180", implemented: true },
  { key: "laserDazzlers", pages: "p. 181", implemented: true },
  // Explosives and incendiaries.
  { key: "explosionSideEffects", pages: "pp. 181-182", implemented: true },
  { key: "demolitionCharges", pages: "pp. 182-183", implemented: true },
  { key: "unstableExplosives", pages: "pp. 184-187", implemented: true },
  { key: "incendiaryAgents", pages: "p. 188", implemented: true },
  // Communications and sensors.
  { key: "radios", pages: "pp. 36-40", implemented: true },
  { key: "activeSensors", pages: "pp. 45-47", implemented: true },
  { key: "visualSensors", pages: "pp. 47-48", implemented: true },
  { key: "passiveSensors", pages: "pp. 48-50", implemented: true },
  // Survival, maritime and parachuting gear, and snacks.
  { key: "survivalGear", pages: "pp. 56-59", implemented: true },
  { key: "maritimeGear", pages: "pp. 59-60", implemented: true },
  { key: "parachuting", pages: "p. 61", implemented: true },
  { key: "rations", pages: "p. 35", implemented: true },
  // Grenades, mines, rifle grenades, bombs and nuclear weapons.
  { key: "grenadeHandling", pages: "pp. 190-193", implemented: true },
  { key: "landMines", pages: "pp. 189-190", implemented: true },
  { key: "rifleGrenades", pages: "pp. 193-194", implemented: true },
  { key: "nuclearEffects", pages: "pp. 195-196", implemented: true },
  // Expedition gear: lights, navigation, load-bearing gear, climbing.
  { key: "lightSources", pages: "pp. 51-52", implemented: true },
  { key: "navigationGear", pages: "pp. 52-53", implemented: true },
  { key: "loadBearingEquipment", pages: "pp. 53-55", implemented: true },
  { key: "climbingGear", pages: "pp. 55-56", implemented: true },
  // Clothing against the weather, frostbite (the GM's option) and climate-controlled clothing.
  { key: "clothingAndWeather", pages: "pp. 63-65", implemented: true },
  { key: "frostbite", pages: "p. 63", implemented: true },
  { key: "climateControl", pages: "p. 74", implemented: true },
  // Melee and muscle-powered weapons.
  { key: "bayonets", pages: "pp. 196-199", implemented: true },
  { key: "sheaths", pages: "p. 198", implemented: true },
  { key: "bladeComposition", pages: "pp. 196-198, 201", implemented: true },
  { key: "stunWeapons", pages: "p. 199", implemented: true },
  { key: "highTechBows", pages: "p. 201", implemented: true },
  // Camouflage and scent masking.
  { key: "camouflageGear", pages: "pp. 76-77", implemented: true },
  // Breathing gear and environment suits.
  { key: "breathingGear", pages: "pp. 72-74, 76", implemented: true },
  { key: "environmentSuits", pages: "pp. 74-76", implemented: true },
  // Covert ops and security: locks, safes, traps and barriers.
  { key: "locksAndSafes", pages: "pp. 202-205, 213", implemented: true },
  { key: "trapsAndBarriers", pages: "pp. 203-205", implemented: true },
  // Emergency medicine and medical facilities.
  { key: "emergencyMedicine", pages: "pp. 219-221", implemented: true },
  { key: "medicalFacilities", pages: "pp. 222-225", implemented: true },
  // Encryption and code-breaking; forgery, disguise, smuggling and mule pills.
  { key: "encryption", pages: "pp. 210-211", implemented: true },
  { key: "disguiseAndSmuggling", pages: "pp. 213-215", implemented: true },
  // Armour: partial coverage and the direction a piece protects from, concealing it, and its materials.
  { key: "partialCoverage", pages: "pp. 66-69, 75", implemented: true },
  { key: "concealedArmor", pages: "pp. 64, 66", implemented: true },
  { key: "armorMaterials", pages: "pp. 65, 67", implemented: true },
  // Cinematic: the optional additions to Gunslinger, and silencers that nearly silence.
  { key: "gunslingerExpanded", pages: "p. 249", implemented: true },
  { key: "cinematicSilencers", pages: "p. 159", implemented: true },
  // Cinematic: Zen Archery for guns.
  { key: "zenMarksmanship", pages: "p. 250", implemented: true },
] as const;

/** A switch's full key, as the system stores it. */
export const ruleKey = (key: (typeof RULES)[number]["key"]) => `${MODULE_ID}.${key}`;

function registerRules(registry: RuleRegistry, group: string): void {
  for (const rule of RULES) {
    registry.registerRule({
      module: MODULE_ID,
      group,
      key: rule.key,
      // Localization keys: the Rules page localizes them, and this runs before
      // the translations are loaded.
      name: `GCC.HT.Rules.${rule.key}.Name`,
      hint: `GCC.HT.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

/**
 * Each rule issue adds its switches to RULES and registers its tables with
 * the shared engines in `init`: the battery table, so the captured gear keeps
 * its batteries whatever the switch (#348), and the record fields the
 * explosives carry (#349).
 */
function init(): void {
  initHighTechPower();
  initHighTechEquipment({ options: ruleKey("equipmentOptions"), sm: ruleKey("gearForSm"), legality: ruleKey("antiqueLegality") });
  initInformation(ruleKey("computerSystems"));
  registerHighTechRecordData();
  initFirearms((f) => ({ ...rateOfFireFields(f), ...sustainedFireFields(f), ...reloadingFields(f), ...weaponFamilyFields(f), ...accessoryGunFields(f), ...ammunitionGunFields(f), ...projectorFields(f), ...meleeGunFields(f) }));
  initAmmunition();
  initAccessories();
  initDrawing([ruleKey("gunDrawing"), ruleKey("gunfightStandoff")]);
  initTools();
  initHighTechSensors({ radios: ruleKey("radios"), activeSensors: ruleKey("activeSensors"), visualSensors: ruleKey("visualSensors"), passiveSensors: ruleKey("passiveSensors") });
  initSurvival();
  initExpedition();
  initClothing(ruleKey("climateControl"));
  initHighTechMelee();
  initHighTechCamouflage(ruleKey("camouflageGear"));
  initHighTechSecurity();
  initMedicine();
  initHighTechArmor();
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyHighTechEquipment(api, { combination: rule("combinationGadgets"), bonuses: rule("equipmentBonuses"), familiarity: rule("tlFamiliarity") });
  readyBlackMarket(api, rule("blackMarket"));
  readyFirearms(api, { quality: rule("firearmQuality"), care: rule("gunCare"), immediateAction: rule("immediateAction"), sustainedFire: rule("sustainedFire") });
  readyDrawing(api, { drawing: rule("gunDrawing"), standoff: rule("gunfightStandoff") });
  const accessories = { magazines: rule("gunMagazines"), sights: rule("gunSights"), suppressors: rule("suppressors"), cinematic: rule("cinematicSilencers"), stocks: rule("stocksAndMounts") };
  const ammunition = {
    upgrades: rule("ammunitionUpgrades"), handloading: rule("handloading"), misloading: rule("misloading"),
    projectiles: rule("projectileOptions"), exotic: rule("exoticBullets"), multiple: rule("multipleProjectileLoads"), projectileUpgrades: rule("projectileUpgrades"),
    explosive: rule("explosiveProjectiles"), cargo: rule("cargoProjectiles"),
  };
  // The loads first: what the gun fires is its own row before the setting (underwater, sights, bursts) changes it.
  readyAmmunition(api, ammunition);
  const shooting = { pistolero: rule("pistolero"), precisionAiming: rule("precisionAiming"), rangedRapidStrike: rule("rangedRapidStrike"), gunTechniques: rule("gunTechniques"), gunslinger: rule("gunslingerExpanded"), zenMarksmanship: rule("zenMarksmanship") };
  readyRateOfFire(api, { triggers: rule("triggerMechanisms"), bursts: rule("burstFire"), fastFiring: rule("fastFiring"), fanning: rule("fanningAndThumbing") }, {
    noFanning: (item) => (shooting.pistolero() && inPistoleroStance(api, item) ? game.i18n.localize("GCC.HT.Shooting.StanceNoFanning") : null),
    techniqueDefault: (actor, technique, penalty) => gunslingerDefault(shooting, actor, technique, penalty),
  });
  // Before the shooting options, whose Pistolero stance starts from the Bulk the accessories leave.
  readyAccessories(api, accessories, { hearing: (item) => ammunitionHearing(item, ammunition) });
  readyShooting(api, shooting, accessories);
  readyEnvironments(api, rule("shootingEnvironments"), { underwaterFactor: (item, modeIndex) => projectileUnderwaterFactor(item, modeIndex, ammunition) });
  readySustainedFire(api, { sustained: rule("sustainedFire") }, rule("gunCare"));
  readyAftermath(api, rule("firefightAftermath"));
  readyReloading(api, {
    loading: rule("firearmLoading"), careful: rule("carefulLoading"), fouling: rule("blackPowderFouling"),
    paperCartridges: (item, modeIndex) => firesPaperCartridges(item, modeIndex, ammunition),
    minieBalls: (item, modeIndex) => firesMinieBalls(item, modeIndex, ammunition),
  });
  readyWeaponFamilies(api, { airGuns: rule("airGunsAndStunners"), revolvers: rule("revolverHandling"), mechanical: rule("mechanicalMachineGuns"), backblast: rule("backblast") });
  readyIndirectFire(api, rule("indirectFire"));
  readyHighTechPower(api, rule("batteries"));
  readyWounding(api, { vitals: rule("vitalsOnTorsoHits"), limbs: rule("realisticLimbWounds"), bleeding: rule("vitalBleeding"), fright: rule("woundFrightChecks") });
  readyInformation(api, { computers: rule("computerSystems"), books: rule("booksAndLibraries") });
  readyTools(api, { kits: rule("toolKits"), forcedEntry: rule("forcedEntryTools"), chainsaws: rule("chainsaws"), hazards: rule("householdHazards") });
  readyProjectors(api, { flamethrowers: rule("flamethrowers"), sprayGuns: rule("sprayGuns"), laserDazzlers: rule("laserDazzlers") });
  const ordnance = { grenades: rule("grenadeHandling"), mines: rule("landMines"), rifleGrenades: rule("rifleGrenades"), nuclear: rule("nuclearEffects") };
  readyExplosives(api, { sideEffects: rule("explosionSideEffects"), demolition: rule("demolitionCharges"), unstable: rule("unstableExplosives"), incendiaries: rule("incendiaryAgents") }, ordnanceExtras(ordnance));
  readyOrdnance(api, ordnance);
  readyHighTechSensors(api, { radios: rule("radios"), active: rule("activeSensors"), visual: rule("visualSensors"), passive: rule("passiveSensors") });
  readySurvival(api, { survival: rule("survivalGear"), maritime: rule("maritimeGear"), parachuting: rule("parachuting"), rations: rule("rations") });
  readyExpedition(api, { lights: rule("lightSources"), navigation: rule("navigationGear"), loadBearing: rule("loadBearingEquipment"), climbing: rule("climbingGear") });
  readyClothing(api, { clothing: rule("clothingAndWeather"), frostbite: rule("frostbite"), climate: rule("climateControl") });
  // After the reloading rules, whose reload time a fixed bayonet lengthens.
  readyHighTechMelee(api, { bayonets: rule("bayonets"), sheaths: rule("sheaths"), blades: rule("bladeComposition"), stun: rule("stunWeapons"), bows: rule("highTechBows") });
  readyHighTechCamouflage(api);
  readyBreathing(api, { breathing: rule("breathingGear"), suits: rule("environmentSuits") });
  readyHighTechSecurity(api, { locks: rule("locksAndSafes"), traps: rule("trapsAndBarriers") });
  readyMedicine(api, { emergency: rule("emergencyMedicine"), facilities: rule("medicalFacilities") });
  readyHighTechCodes(api, { encryption: rule("encryption"), disguise: rule("disguiseAndSmuggling") });
  readyHighTechArmor(api, { partial: rule("partialCoverage"), conceal: rule("concealedArmor"), materials: rule("armorMaterials") });
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS High-Tech",
  registerRules,
  init,
  ready,
};
