/**
 * GURPS High-Tech: the book's rules, registered with the GWorld system
 * through its add-on API. Its group's switches all start off, as every book's
 * do.
 *
 * About a fifth of the book's rules are Ultra-Tech's at lower TLs, and some
 * are Martial Arts'. Those live once, as shared engines under `src/shared/`,
 * and this book registers its own table for each and its own switch, so a GM
 * can use High-Tech without either of the other books. So far this registers
 * a gun's quality, its care, clearing a stoppage by Immediate Action,
 * drawing guns, holsters and Who Draws First? with guns, how fast a gun
 * fires: triggers, fire selectors and bursts, fast-firing, fanning and
 * thumbing, and the shooting options and gun techniques: the two-handed
 * stance, Precision Aiming, the Ranged Rapid Strike, Close-Quarters Battle,
 * Targeted Attacks with guns, Instant Arsenal Disarm and the expanded
 * Gunslinger, the special shooting situations (underwater, into water,
 * steeply into the air, in space), sustained fire, the aftermath of a
 * firefight, reloading, careful loading and black-powder fouling, and the
 * weapon families: air guns and ranged stunners, unsafe revolvers and pistol
 * whipping, mechanical machine guns, and backblast (pp. 79-93, 127-137,
 * 147-154, 159, 249-252).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initDrawing, readyDrawing } from "./drawing/index.js";
import { readyAftermath } from "./aftermath/index.js";
import { readyEnvironments } from "./environments/index.js";
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
 * reserved for the rule issues that register them, beside the Ultra-Tech key
 * each would have clashed with.
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
  // Cinematic: the optional additions to Gunslinger.
  { key: "gunslingerExpanded", pages: "p. 249", implemented: true },
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
  registerHighTechRecordData();
  initFirearms((f) => ({ ...rateOfFireFields(f), ...sustainedFireFields(f), ...reloadingFields(f), ...weaponFamilyFields(f) }));
  initDrawing([ruleKey("gunDrawing"), ruleKey("gunfightStandoff")]);
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyFirearms(api, { quality: rule("firearmQuality"), care: rule("gunCare"), immediateAction: rule("immediateAction"), sustainedFire: rule("sustainedFire") });
  readyDrawing(api, { drawing: rule("gunDrawing"), standoff: rule("gunfightStandoff") });
  const shooting = { pistolero: rule("pistolero"), precisionAiming: rule("precisionAiming"), rangedRapidStrike: rule("rangedRapidStrike"), gunTechniques: rule("gunTechniques"), gunslinger: rule("gunslingerExpanded") };
  readyRateOfFire(api, { triggers: rule("triggerMechanisms"), bursts: rule("burstFire"), fastFiring: rule("fastFiring"), fanning: rule("fanningAndThumbing") }, {
    noFanning: (item) => (shooting.pistolero() && inPistoleroStance(api, item) ? game.i18n.localize("GCC.HT.Shooting.StanceNoFanning") : null),
    techniqueDefault: (actor, technique, penalty) => gunslingerDefault(shooting, actor, technique, penalty),
  });
  readyShooting(api, shooting);
  readyEnvironments(api, rule("shootingEnvironments"));
  readySustainedFire(api, { sustained: rule("sustainedFire") }, rule("gunCare"));
  readyAftermath(api, rule("firefightAftermath"));
  readyReloading(api, { loading: rule("firearmLoading"), careful: rule("carefulLoading"), fouling: rule("blackPowderFouling") });
  readyWeaponFamilies(api, { airGuns: rule("airGunsAndStunners"), revolvers: rule("revolverHandling"), mechanical: rule("mechanicalMachineGuns"), backblast: rule("backblast") });
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS High-Tech",
  registerRules,
  init,
  ready,
};
