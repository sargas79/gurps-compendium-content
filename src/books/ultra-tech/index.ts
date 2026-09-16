/**
 * GURPS Ultra-Tech: the book's rules, registered with the GWorld system
 * through its add-on API. Its group's switches all start off, as every book's
 * do. So far this registers the gadget options a piece of gear is built with
 * and the statistics the book assumes for it (pp. 15, 17), gear adjusted for
 * the size of whoever carries it (p. 16), and the Legality Class an obsolete
 * gadget may be carried under, with the price below which a gadget is too
 * simple to maintain (p. 14), and the power cells gear runs on (pp. 18-20, 133).
 */

import type { BookRules } from "../../shared/book.js";
import { MODULE_ID, type GWorldApi, type RuleRegistry } from "../../shared/module.js";
import { initAccessories, readyAccessories } from "./accessories/index.js";
import { initAgents, readyAgents } from "./agents/index.js";
import { initArmor, readyArmor } from "./armor/index.js";
import { initPoweredSuits, readyPoweredSuits } from "./armor/powered.js";
import { initForceFields, readyForceFields } from "./force/index.js";
import { beamIgnoresEnvironment, initBeamOptions, readyBeamOptions } from "./beams/beam-options.js";
import { readyBeams } from "./beams/index.js";
import { initWarheads, readyWarheads } from "./warheads/index.js";
import { initLaserOptions, readyLaserOptions } from "./beams/laser-options.js";
import { initNeuralSonic, readyNeuralSonic } from "./beams/neural-sonic.js";
import { initComputers, readyComputers } from "./computers/index.js";
import { initFabrication, readyFabrication } from "./fabrication/index.js";
import { initGuns, readyGuns } from "./guns/index.js";
import { initGadgets, readyGadgets } from "./gadgets/index.js";
import { readyInterfaces } from "./interfaces/index.js";
import { initMedical, readyMedical } from "./medical/index.js";
import { initMelee, readyMelee } from "./melee/index.js";
import { initPower, readyPower } from "./power/index.js";
import { registerRecordData } from "./records.js";
import { readyRobots } from "./robots/index.js";
import { readySecurity } from "./security/index.js";
import { initSensors, readySensors } from "./sensors/index.js";
import { initStealth, readyStealth } from "./stealth/index.js";
import { initSwarms, readySwarms } from "./swarms/index.js";
import { initTransport, readyTransport } from "./transport/index.js";
import { readyUploading } from "./uploading/index.js";

const SLUG = "ultra-tech";
const REFERENCE = "Ultra-Tech";

/** The book's switches. */
const RULES = [
  { key: "gadgetOptions", pages: "pp. 15, 17", implemented: true },
  { key: "adjustingForSm", pages: "p. 16", implemented: true },
  { key: "legalityAndAntiques", pages: "p. 14", implemented: true },
  { key: "powerCells", pages: "pp. 18-20, 133", implemented: true },
  { key: "computers", pages: "pp. 21-25, 46-47", implemented: true },
  { key: "swarmbots", pages: "pp. 35-37, 92, 164, 169", implemented: true },
  { key: "robots", pages: "pp. 26-35", implemented: true },
  { key: "cinematicRobots", pages: "p. 34", implemented: true },
  { key: "stealthSystems", pages: "pp. 95-100", implemented: true },
  { key: "securitySystems", pages: "pp. 101-106", implemented: true },
  { key: "restraints", pages: "pp. 107-108", implemented: true },
  { key: "interrogation", pages: "pp. 106-110", implemented: true },
  { key: "uploading", pages: "pp. 219-221", implemented: true },
  { key: "communicators", pages: "pp. 42-46", implemented: true },
  { key: "sensors", pages: "pp. 60-67", implemented: true },
  { key: "neuralInterfaces", pages: "pp. 24, 47-59", implemented: true },
  { key: "fabrication", pages: "pp. 76-93", implemented: true },
  { key: "gravityControl", pages: "pp. 78-79, 84", implemented: true },
  { key: "psiAmplifiers", pages: "p. 94", implemented: true },
  { key: "vehicleSystems", pages: "pp. 222-232", implemented: true },
  { key: "matterTransmission", pages: "pp. 104, 233-235", implemented: true },
  { key: "beamWeapons", pages: "pp. 113-132", implemented: true },
  { key: "laserOptions", pages: "pp. 113-118", implemented: true },
  { key: "neuralAndSonic", pages: "pp. 120-126, 132", implemented: true },
  { key: "beamOptions", pages: "pp. 132-133", implemented: true },
  { key: "hotshots", pages: "p. 133", implemented: true },
  { key: "firearmAccessories", pages: "pp. 149-152", implemented: true },
  { key: "warheads", pages: "pp. 152-159", implemented: true },
  { key: "bladeTech", pages: "pp. 162-164", implemented: true },
  { key: "energyMelee", pages: "pp. 164-166", implemented: true },
  { key: "forceSwords", pages: "pp. 164, 166", implemented: true },
  { key: "threatProtection", pages: "pp. 171, 176-181, 188", implemented: true },
  { key: "laserResistantArmor", pages: "pp. 173-174", implemented: true },
  { key: "tailoredArmor", pages: "pp. 174-175", implemented: true },
  { key: "armorSystems", pages: "pp. 170-171, 187-190", implemented: true },
  { key: "poweredSuits", pages: "pp. 75, 181-186", implemented: true },
  { key: "forceScreens", pages: "pp. 190-192", implemented: true },
  { key: "forceShields", pages: "pp. 192-193", implemented: true },
  { key: "stasisAndTime", pages: "pp. 193-195", implemented: true },
  { key: "biochemicalAgents", pages: "pp. 159-161", implemented: true },
  { key: "nanoweapons", pages: "pp. 161-162", implemented: true },
  { key: "propellantSettings", pages: "pp. 135-141", implemented: true },
  { key: "gyrocsAndLaunchers", pages: "pp. 134, 144-147", implemented: true },
  { key: "homingProjectiles", pages: "p. 146", implemented: true },
  { key: "medicalGear", pages: "pp. 196-201", implemented: true },
  { key: "ultraTechDrugs", pages: "pp. 204-206", implemented: true },
  { key: "regeneration", pages: "pp. 200-202", implemented: true },
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
      name: `GCC.UT.Rules.${rule.key}.Name`,
      hint: `GCC.UT.Rules.${rule.key}.Hint`,
      reference: `${REFERENCE} ${rule.pages}`,
      default: false,
      implemented: rule.implemented,
    });
  }
}

function init(): void {
  initGadgets();
  initPower();
  initLaserOptions();
  initNeuralSonic();
  initBeamOptions();
  initWarheads();
  initComputers();
  initSwarms();
  initStealth();
  initSensors();
  initFabrication();
  initTransport();
  initAccessories();
  initMelee();
  initArmor();
  initPoweredSuits();
  initForceFields();
  initAgents();
  initGuns();
  initMedical();
  registerRecordData();
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyGadgets(api, { options: rule("gadgetOptions"), sm: rule("adjustingForSm"), legality: rule("legalityAndAntiques") });
  readyPower(api, rule("powerCells"));
  // Gravitic focus lengthens a beam before the air or water limits it, so the options go first.
  readyBeamOptions(api, { options: rule("beamOptions"), hotshots: rule("hotshots") });
  readyBeams(api, rule("beamWeapons"), beamIgnoresEnvironment(rule("beamOptions")));
  readyWarheads(api, rule("warheads"));
  // After the warheads, so a loaded warhead's damage is what ETC multiplies.
  readyGuns(api, { propellant: rule("propellantSettings"), launchers: rule("gyrocsAndLaunchers"), homing: rule("homingProjectiles") });
  readyLaserOptions(api, rule("laserOptions"));
  readyNeuralSonic(api, rule("neuralAndSonic"));
  readyComputers(api, rule("computers"));
  readySwarms(api, rule("swarmbots"));
  readyRobots(api, { robots: rule("robots"), cinematic: rule("cinematicRobots") });
  readyStealth(api, rule("stealthSystems"), () => rule("stealthSystems")() || rule("securitySystems")());
  readySecurity(api, { security: rule("securitySystems"), restraints: rule("restraints"), interrogation: rule("interrogation") });
  readyUploading(api, rule("uploading"));
  // After the computers (a program's table price) and before the sensors (a lock replaced by active-sensor targeting).
  readyAccessories(api, rule("firearmAccessories"));
  readyMelee(api, { blades: rule("bladeTech"), energy: rule("energyMelee"), force: rule("forceSwords") });
  readyArmor(api, { threat: rule("threatProtection"), laser: rule("laserResistantArmor"), tailored: rule("tailoredArmor"), systems: rule("armorSystems") });
  readyPoweredSuits(api, rule("poweredSuits"));
  readyForceFields(api, { screens: rule("forceScreens"), shields: rule("forceShields"), stasis: rule("stasisAndTime") });
  readyAgents(api, { biochemical: rule("biochemicalAgents"), nano: rule("nanoweapons") });
  readyMedical(api, { gear: rule("medicalGear"), drugs: rule("ultraTechDrugs"), regeneration: rule("regeneration") });
  readySensors(api, { communicators: rule("communicators"), sensors: rule("sensors") });
  readyInterfaces(api, rule("neuralInterfaces"));
  readyFabrication(api, { fabrication: rule("fabrication"), gravity: rule("gravityControl"), psi: rule("psiAmplifiers") });
  readyTransport(api, { vehicles: rule("vehicleSystems"), matterTransmission: rule("matterTransmission") });
}

export const book: BookRules = {
  slug: SLUG,
  label: "GURPS Ultra-Tech",
  registerRules,
  init,
  ready,
};
