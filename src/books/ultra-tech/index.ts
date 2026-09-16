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
import { readyBeams } from "./beams/index.js";
import { initLaserOptions, readyLaserOptions } from "./beams/laser-options.js";
import { initComputers, readyComputers } from "./computers/index.js";
import { initFabrication, readyFabrication } from "./fabrication/index.js";
import { initGadgets, readyGadgets } from "./gadgets/index.js";
import { readyInterfaces } from "./interfaces/index.js";
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
  initComputers();
  initSwarms();
  initStealth();
  initSensors();
  initFabrication();
  initTransport();
  registerRecordData();
}

function ready(api: GWorldApi): void {
  const rule = (key: (typeof RULES)[number]["key"]) => () => api.registry.isRuleOn(ruleKey(key));
  readyGadgets(api, { options: rule("gadgetOptions"), sm: rule("adjustingForSm"), legality: rule("legalityAndAntiques") });
  readyPower(api, rule("powerCells"));
  readyBeams(api, rule("beamWeapons"));
  readyLaserOptions(api, rule("laserOptions"));
  readyComputers(api, rule("computers"));
  readySwarms(api, rule("swarmbots"));
  readyRobots(api, { robots: rule("robots"), cinematic: rule("cinematicRobots") });
  readyStealth(api, rule("stealthSystems"), () => rule("stealthSystems")() || rule("securitySystems")());
  readySecurity(api, { security: rule("securitySystems"), restraints: rule("restraints"), interrogation: rule("interrogation") });
  readyUploading(api, rule("uploading"));
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
