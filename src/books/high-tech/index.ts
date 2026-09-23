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
 * bonuses, and TL penalties as unfamiliarity (pp. 7-11), a gun's quality, its care, clearing a stoppage by Immediate Action,
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
 * upgrades, cartridge conversions, handloading and misloading, and the
 * projectiles: projectile options, exotic bullets, multiple-projectile loads
 * and projectile upgrades (pp. 7-11, 79-93, 109, 127-141, 147-178, 249-252).
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
import { initHighTechPower } from "./power/index.js";
import { rateOfFireFields, readyRateOfFire } from "./rate-of-fire/index.js";
import { gunslingerDefault, inPistoleroStance, readyShooting } from "./shooting/index.js";
import { registerHighTechRecordData } from "./records.js";
import { readyReloading, reloadingFields } from "./reloading/index.js";
import { readySustainedFire, sustainedFireFields } from "./sustained-fire/index.js";
import { readyWeaponFamilies, weaponFamilyFields } from "./weapon-families/index.js";

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
 * the shared engines in `init`. The battery table is registered already,
 * with its switch left for #358, so the captured gear keeps its batteries
 * (#348), and so are the record fields the explosives carry (#349).
 */
function init(): void {
  initHighTechPower();
  initHighTechEquipment({ options: ruleKey("equipmentOptions"), sm: ruleKey("gearForSm"), legality: ruleKey("antiqueLegality") });
  registerHighTechRecordData();
  initFirearms((f) => ({ ...rateOfFireFields(f), ...sustainedFireFields(f), ...reloadingFields(f), ...weaponFamilyFields(f), ...accessoryGunFields(f), ...ammunitionGunFields(f) }));
  initAmmunition();
  initAccessories();
  initDrawing([ruleKey("gunDrawing"), ruleKey("gunfightStandoff")]);
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
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS High-Tech",
  registerRules,
  init,
  ready,
};
