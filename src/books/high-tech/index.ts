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
 * software, manuals and libraries (pp. 17-22), with the Electricity and
 * Electronics supplement's computer eras, interfaces and programming
 * languages (HT:EE pp. 36-41), its electric light, light levels and
 * glare (HT:EE pp. 9, 20-22), and its electrical hazards, shock protection
 * and power lines (HT:EE pp. 9, 14-15, 18-19, 25), and its laboratory
 * instruments: detecting and measuring electricity, each instrument's own
 * modifiers, and devices combined from separate parts (HT:EE pp. 9-13), a gun's quality, its care, clearing a stoppage by Immediate Action,
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
 * telegraphy, radio reception, antennas, shortwave and how a radio is built
 * (from the supplement Electricity and Electronics), active sensors, optics, night vision and thermographs,
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
 * armour: partial coverage, concealing it and its materials, security
 * screening, surveillance gear and jamming (with the Electricity and
 * Electronics supplement's bugs, taps and countersurveillance, HT:EE
 * pp. 44-45, its electric fences, locks, screening and alarms, HT:EE
 * pp. 42-44, and its electronic battlefield's sensors and reconnaissance
 * drones, HT:EE pp. 45-46), and the protective oddments and
 * portable cover: footwear, gloves, ear and eye protection, cups and
 * mouthguards, eyeglasses, homemade armour and blankets over bombs, and
 * lie detection and restraints: polygraphs and voice stress analysers on
 * Interrogation, cuffs, leg irons and straitjackets, and prosthetics and
 * elective surgery, the personal conveyances: bicycles, skateboards,
 * surfboards and wheelchairs, the hygiene supplies, drugs and poisons, and
 * vehicle components, protection and crew: gun ports, searchlights,
 * turrets, linked weapons, extinguishers, run-flat tyres, airbags, spaced
 * and laminated armour, riveted armour's spall, and riding in a tank
 * (pp. 7-11, 13-16, 17-77, 79-93, 109, 127-141, 143, 147-217, 219-231,
 * 234-235, 249-252), and the Electricity and Electronics device
 * conventions: cutting-edge prices and prototypes, breakable parts and a
 * device's HP, HT and DR, and building from kits (HT:EE pp. 8-9, 15),
 * and its audio gear: sound quality and the weakest link, microphones,
 * headphones and earbuds, amplifiers' Hearing ranges and the hearing aid
 * (HT:EE pp. 30-32), and its appliances, power tools and electromedicine:
 * heaters, fans and kitchen gear, shredders and vacuums, electromagnets,
 * remote control and the emergency stop, power tools' work, diathermy, the
 * heating pad, electroconvulsive therapy and the laser scalpel (HT:EE pp.
 * 13-14, 20-25), with its revision of the defibrillator's revival (HT:EE
 * p. 14), and its power: battery chemistries, capacitors, supercapacitors,
 * flywheels and generators, and the grades of external power (HT:EE pp. 9,
 * 16-18).
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
import { readyComputing } from "./computing/index.js";
import { readyElectricity } from "./electricity/index.js";
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
import { initSurveillance, readySurveillance } from "./surveillance/index.js";
import { readyCovertListening } from "./covert-listening/index.js";
import { initElectricSecurity, readyElectricSecurity } from "./electric-security/index.js";
import { initBattlefield, readyBattlefield } from "./battlefield/index.js";
import { readyOddments } from "./oddments/index.js";
import { initEnforcement, readyEnforcement } from "./enforcement/index.js";
import { readyProsthetics } from "./prosthetics/index.js";
import { initConveyances, readyConveyances } from "./conveyances/index.js";
import { initDrugs, readyDrugs } from "./drugs/index.js";
import { initVehicles, readyVehicles } from "./vehicles/index.js";
import { readyInstruments } from "./instruments/index.js";
import { initDevices, readyDevices } from "./devices/index.js";
import { readyLighting } from "./lighting/index.js";
import { readyAudio } from "./audio/index.js";
import { applianceClimateGear, readyAppliances } from "./appliances/index.js";
import { readyElectromedicine } from "./electromedicine/index.js";

const SLUG = "high-tech";
const REFERENCE = "High-Tech";
/** The supplement added to the book (E1 in #471), whose switches cite its own pages. */
const EE_REFERENCE = "High-Tech: Electricity and Electronics";

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
  // Electricity and Electronics: battery chemistry, energy storage and the grades of external power.
  { key: "batteryChemistry", pages: "pp. 16-18", reference: EE_REFERENCE, implemented: true },
  { key: "energyStorage", pages: "pp. 17-18", reference: EE_REFERENCE, implemented: true },
  { key: "externalPower", pages: "p. 9", reference: EE_REFERENCE, implemented: true },
  // The optional wounding rules.
  { key: "vitalsOnTorsoHits", pages: "p. 162", implemented: true },
  { key: "realisticLimbWounds", pages: "p. 162", implemented: true },
  { key: "vitalBleeding", pages: "p. 162", implemented: true },
  { key: "woundFrightChecks", pages: "p. 162", implemented: true },
  { key: "booksAndLibraries", pages: "pp. 17-18", implemented: true },
  { key: "computerSystems", pages: "pp. 19-22", implemented: true },
  // Electricity and Electronics: computer eras, interfaces and programming.
  { key: "computerEras", pages: "pp. 36-37", reference: EE_REFERENCE, implemented: true },
  { key: "computerInterfaces", pages: "pp. 39-41", reference: EE_REFERENCE, implemented: true },
  { key: "programmingLanguages", pages: "p. 38", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: electrical hazards, shock protection and power lines.
  { key: "electricalHazards", pages: "p. 9", reference: EE_REFERENCE, implemented: true },
  { key: "shockProtection", pages: "pp. 9, 14-15, 19, 25", reference: EE_REFERENCE, implemented: true },
  { key: "powerLines", pages: "pp. 18-19", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: laboratory instruments, detecting and measuring, and combined devices.
  { key: "electricalMeasurement", pages: "pp. 10, 12", reference: EE_REFERENCE, implemented: true },
  { key: "labInstruments", pages: "pp. 10-13", reference: EE_REFERENCE, implemented: true },
  { key: "combinedDevices", pages: "pp. 9, 12", reference: EE_REFERENCE, implemented: true },
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
  // Two different radios by the supplement Electricity and Electronics' rule (decision E3 in #471).
  { key: "radios", pages: "p. 28", reference: `${REFERENCE} pp. 36-40; ${EE_REFERENCE}`, implemented: true },
  { key: "activeSensors", pages: "pp. 45-47", implemented: true },
  { key: "visualSensors", pages: "pp. 47-48", implemented: true },
  { key: "passiveSensors", pages: "pp. 48-50", implemented: true },
  // The Electricity and Electronics supplement's refinements to active rangefinding.
  { key: "rangefindingEmissions", pages: "p. 35", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: radio reception, antennas and shortwave.
  { key: "radioTuning", pages: "pp. 27, 29-30", reference: EE_REFERENCE, implemented: true },
  { key: "radioAntennas", pages: "p. 28", reference: EE_REFERENCE, implemented: true },
  { key: "shortwaveSkip", pages: "p. 30", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: spark-gap, receiver, audio and video options on radios, and the trench radio.
  { key: "radioDesign", pages: "pp. 28-30, 32, 34", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: electric light, light levels and glare.
  { key: "illumination", pages: "pp. 20-22", reference: EE_REFERENCE, implemented: true },
  { key: "lightDazzle", pages: "pp. 9, 20-21", reference: EE_REFERENCE, implemented: true },
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
  // Emergency medicine and medical facilities; the defibrillator's revival as the supplement revises it (E3 in #471).
  { key: "emergencyMedicine", pages: "p. 14", reference: `${REFERENCE} pp. 219-221; ${EE_REFERENCE}`, implemented: true },
  { key: "medicalFacilities", pages: "pp. 222-225", implemented: true },
  // Encryption and code-breaking; forgery, disguise, smuggling and mule pills.
  { key: "encryption", pages: "pp. 210-211", implemented: true },
  { key: "disguiseAndSmuggling", pages: "pp. 213-215", implemented: true },
  // Personal conveyances: bicycles, skateboards, surfboards and wheelchairs.
  { key: "personalConveyances", pages: "pp. 226, 230-231", implemented: true },
  // Armour: partial coverage and the direction a piece protects from, concealing it, and its materials.
  { key: "partialCoverage", pages: "pp. 66-69, 75", implemented: true },
  { key: "concealedArmor", pages: "pp. 64, 66", implemented: true },
  { key: "armorMaterials", pages: "pp. 65, 67", implemented: true },
  // Security screening, surveillance and jamming.
  { key: "securityScreening", pages: "pp. 205-207, 217", implemented: true },
  { key: "surveillanceGear", pages: "pp. 208-212", implemented: true },
  // The cell-phone jammer as the supplement revises it (E3 in #471).
  { key: "jamming", pages: "p. 50", reference: `${REFERENCE} pp. 212-213; ${EE_REFERENCE}`, implemented: true },
  // Electricity and Electronics: broad-spectrum and selective jammers, radar jammers and spoofers.
  { key: "jammerKinds", pages: "pp. 49-50", reference: EE_REFERENCE, implemented: true },
  { key: "radarJamming", pages: "pp. 49-50", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: bugs, taps and countersurveillance.
  { key: "covertListening", pages: "pp. 44-45", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: electric fences, locks, screening and alarms.
  { key: "stunLethalFences", pages: "pp. 9, 42, 44", reference: EE_REFERENCE, implemented: true },
  { key: "electricLocks", pages: "pp. 14, 42", reference: EE_REFERENCE, implemented: true },
  { key: "alarmSystems", pages: "pp. 43-44", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: the electronic battlefield's sensors, and reconnaissance drones.
  { key: "battlefieldSensors", pages: "p. 45", reference: EE_REFERENCE, implemented: true },
  { key: "reconDrones", pages: "p. 46", reference: EE_REFERENCE, implemented: true },
  // Protective oddments and portable cover.
  { key: "protectiveOddments", pages: "pp. 68-71, 225", implemented: true },
  { key: "portableCover", pages: "p. 72", implemented: true },
  // Lie detection and restraints.
  { key: "lieDetection", pages: "pp. 215-216", implemented: true },
  { key: "restraintDevices", pages: "p. 217", implemented: true },
  // Medical: prosthetics as Mitigators, and elective surgery.
  { key: "prosthetics", pages: "pp. 225-226", implemented: true },
  // Hygiene, drugs and poisons.
  { key: "hygieneAndDrugs", pages: "pp. 221, 226-227", implemented: true },
  { key: "highTechPoisons", pages: "p. 227", implemented: true },
  // Vehicle components, protection and crew.
  { key: "vehicleComponents", pages: "pp. 228-229", implemented: true },
  { key: "vehicleProtection", pages: "pp. 229, 234-235", implemented: true },
  { key: "crewConditions", pages: "pp. 234-235", implemented: true },
  // Cinematic: the optional additions to Gunslinger, and silencers that nearly silence.
  { key: "gunslingerExpanded", pages: "p. 249", implemented: true },
  { key: "cinematicSilencers", pages: "p. 159", implemented: true },
  // Cinematic: Zen Archery for guns.
  { key: "zenMarksmanship", pages: "p. 250", implemented: true },
  // Electricity and Electronics: the device conventions.
  { key: "cuttingEdgeGear", pages: "p. 8", reference: EE_REFERENCE, implemented: true },
  { key: "breakableComponents", pages: "pp. 8-9", reference: EE_REFERENCE, implemented: true },
  { key: "kitBuilding", pages: "p. 15", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: audio gear.
  { key: "audioFidelity", pages: "pp. 30-31", reference: EE_REFERENCE, implemented: true },
  { key: "soundAmplification", pages: "p. 32", reference: EE_REFERENCE, implemented: true },
  // Electricity and Electronics: appliances, power tools and electromedicine.
  { key: "electricAppliances", pages: "pp. 21-25", reference: EE_REFERENCE, implemented: true },
  { key: "powerTools", pages: "pp. 14, 21, 24", reference: EE_REFERENCE, implemented: true },
  { key: "electromedicine", pages: "pp. 13-14, 21", reference: EE_REFERENCE, implemented: true },
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
      reference: `${"reference" in rule ? rule.reference : REFERENCE} ${rule.pages}`,
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
  initInformation(ruleKey("computerSystems"), ruleKey("computerEras"));
  registerHighTechRecordData();
  initFirearms((f) => ({ ...rateOfFireFields(f), ...sustainedFireFields(f), ...reloadingFields(f), ...weaponFamilyFields(f), ...accessoryGunFields(f), ...ammunitionGunFields(f), ...projectorFields(f), ...meleeGunFields(f) }));
  initAmmunition();
  initAccessories();
  initDrawing([ruleKey("gunDrawing"), ruleKey("gunfightStandoff")]);
  initTools();
  initHighTechSensors({
    radios: ruleKey("radios"), activeSensors: ruleKey("activeSensors"), visualSensors: ruleKey("visualSensors"), passiveSensors: ruleKey("passiveSensors"),
    rangefindingEmissions: ruleKey("rangefindingEmissions"), radioTuning: ruleKey("radioTuning"), radioAntennas: ruleKey("radioAntennas"), shortwaveSkip: ruleKey("shortwaveSkip"),
    radioDesign: ruleKey("radioDesign"),
  });
  initSurvival();
  initExpedition();
  // With the supplement's heaters and fans, under its appliances switch.
  initClothing(ruleKey("climateControl"), applianceClimateGear(ruleKey("electricAppliances")));
  initHighTechMelee();
  initHighTechCamouflage(ruleKey("camouflageGear"));
  initHighTechSecurity();
  initElectricSecurity();
  initMedicine();
  initHighTechArmor();
  initSurveillance({ jamming: ruleKey("jamming"), jammerKinds: ruleKey("jammerKinds"), radarJamming: ruleKey("radarJamming") });
  initEnforcement({ lieDetection: ruleKey("lieDetection"), restraints: ruleKey("restraintDevices") });
  initConveyances();
  initDrugs();
  initVehicles(ruleKey("vehicleProtection"));
  initDevices();
  initBattlefield();
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  // First: a device's default object figures, which the book's own gear (locks, guns) then overrides.
  readyDevices(api, { cuttingEdge: rule("cuttingEdgeGear"), breakable: rule("breakableComponents"), kits: rule("kitBuilding"), combined: rule("combinedDevices") });
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
  readyHighTechPower(api, { batteries: rule("batteries"), chemistry: rule("batteryChemistry"), storage: rule("energyStorage"), external: rule("externalPower") });
  readyWounding(api, { vitals: rule("vitalsOnTorsoHits"), limbs: rule("realisticLimbWounds"), bleeding: rule("vitalBleeding"), fright: rule("woundFrightChecks") });
  readyInformation(api, { computers: rule("computerSystems"), books: rule("booksAndLibraries") });
  // After High-Tech's computers, whose unfamiliar computer type a high-level language lifts.
  readyComputing(api, { eras: rule("computerEras"), interfaces: rule("computerInterfaces"), languages: rule("programmingLanguages") });
  readyElectricity(api, { hazards: rule("electricalHazards"), protection: rule("shockProtection"), powerLines: rule("powerLines"), glare: rule("lightDazzle") });
  readyTools(api, { kits: rule("toolKits"), forcedEntry: rule("forcedEntryTools"), chainsaws: rule("chainsaws"), hazards: rule("householdHazards") });
  readyProjectors(api, { flamethrowers: rule("flamethrowers"), sprayGuns: rule("sprayGuns"), laserDazzlers: rule("laserDazzlers") });
  const ordnance = { grenades: rule("grenadeHandling"), mines: rule("landMines"), rifleGrenades: rule("rifleGrenades"), nuclear: rule("nuclearEffects") };
  readyExplosives(api, { sideEffects: rule("explosionSideEffects"), demolition: rule("demolitionCharges"), unstable: rule("unstableExplosives"), incendiaries: rule("incendiaryAgents") }, ordnanceExtras(ordnance));
  readyOrdnance(api, ordnance);
  readyHighTechSensors(api, { radios: rule("radios"), active: rule("activeSensors"), visual: rule("visualSensors"), passive: rule("passiveSensors"), tuning: rule("radioTuning"), design: rule("radioDesign") });
  readySurvival(api, { survival: rule("survivalGear"), maritime: rule("maritimeGear"), parachuting: rule("parachuting"), rations: rule("rations") });
  readyExpedition(api, { lights: rule("lightSources"), navigation: rule("navigationGear"), loadBearing: rule("loadBearingEquipment"), climbing: rule("climbingGear") });
  readyLighting(api, { illumination: rule("illumination"), dazzle: rule("lightDazzle") });
  readyClothing(api, { clothing: rule("clothingAndWeather"), frostbite: rule("frostbite"), climate: rule("climateControl") });
  // After the reloading rules, whose reload time a fixed bayonet lengthens.
  readyHighTechMelee(api, { bayonets: rule("bayonets"), sheaths: rule("sheaths"), blades: rule("bladeComposition"), stun: rule("stunWeapons"), bows: rule("highTechBows") });
  readyHighTechCamouflage(api);
  readyBreathing(api, { breathing: rule("breathingGear"), suits: rule("environmentSuits") });
  const electric = { fences: rule("stunLethalFences"), electricLocks: rule("electricLocks"), alarms: rule("alarmSystems") };
  readyHighTechSecurity(api, { locks: rule("locksAndSafes"), traps: rule("trapsAndBarriers"), ...electric });
  readyMedicine(api, { emergency: rule("emergencyMedicine"), facilities: rule("medicalFacilities") });
  readyHighTechCodes(api, { encryption: rule("encryption"), disguise: rule("disguiseAndSmuggling") });
  readyHighTechArmor(api, { partial: rule("partialCoverage"), conceal: rule("concealedArmor"), materials: rule("armorMaterials") });
  readySurveillance(api, { screening: rule("securityScreening"), surveillance: rule("surveillanceGear"), jamming: rule("jamming"), jammerKinds: rule("jammerKinds"), radarJamming: rule("radarJamming"), covert: rule("covertListening") });
  readyCovertListening(api, rule("covertListening"));
  readyElectricSecurity(api, electric);
  // After the devices' object figures, which military gear's HT and DR override.
  readyBattlefield(api, { sensors: rule("battlefieldSensors"), drones: rule("reconDrones") });
  readyOddments(api, { oddments: rule("protectiveOddments"), cover: rule("portableCover") });
  readyEnforcement(api);
  readyProsthetics(api, rule("prosthetics"));
  // After the prosthetics, whose hearing aid it takes the same way, and after the devices' object figures, which a carbon microphone's HT overrides.
  readyAudio(api, { fidelity: rule("audioFidelity"), amplification: rule("soundAmplification") });
  readyAppliances(api, { appliances: rule("electricAppliances"), powerTools: rule("powerTools") });
  readyElectromedicine(api, rule("electromedicine"));
  readyConveyances(api, rule("personalConveyances"));
  readyDrugs(api, { hygiene: rule("hygieneAndDrugs"), poisons: rule("highTechPoisons") });
  readyVehicles(api, { components: rule("vehicleComponents"), protection: rule("vehicleProtection"), crew: rule("crewConditions") });
  readyInstruments(api, { measurement: rule("electricalMeasurement"), instruments: rule("labInstruments"), combined: rule("combinedDevices") });
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS High-Tech",
  registerRules,
  init,
  ready,
};
